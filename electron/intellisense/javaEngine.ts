import { execFile, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { storage } from '../storage';
import { resolveJavaBinaries, getAppDataDir } from '../pathResolver';
import { EXTERNAL_LIBRARIES, getJavaJarPath, type ExternalLibraryDef } from '../externalLibraries';
import type {
  IntellisenseCompletionItem,
  IntellisenseCompletionQuery,
  IntellisenseCompletionResult,
  IntellisenseHoverQuery,
  IntellisenseHoverResult,
  IntellisenseSignatureHelpQuery,
  IntellisenseSignatureHelpResult,
  ProjectFile,
} from './types';

interface UserMethod {
  name: string;
  signature: string;
  returnType: string;
  params: string[];
  doc: string;
}

interface UserField {
  name: string;
  type: string;
  doc: string;
}

interface UserClass {
  name: string;
  kind: 'class' | 'interface' | 'enum' | 'record';
  doc: string;
  methods: Map<string, UserMethod>;
  fields: Map<string, UserField>;
  startLine: number;
  endLine: number;
}

interface UserVariable {
  name: string;
  type: string;
  line: number;
}

interface ParsedJavaFile {
  classes: Map<string, UserClass>;
  imports: Map<string, string>; // simpleName -> FQCN
  inScopeVariables: (line: number) => UserVariable[];
  enclosingClass: (line: number) => UserClass | null;
}

class JavaEngine {
  private jdkClassesLoaded = false;
  private jdkClassMap = new Map<string, string>(); // simpleName -> FQCN (e.g. List -> java.util.List)
  private jdkTopLevelItems: IntellisenseCompletionItem[] = [];
  private jdkAnnotations: IntellisenseCompletionItem[] = [];

  private jarClassCache = new Map<string, { items: IntellisenseCompletionItem[]; map: Map<string, string>; annotations: IntellisenseCompletionItem[] }>();
  private javapCache = new Map<string, IntellisenseCompletionItem[]>();
  private javapRawCache = new Map<string, string>();
  private javaSourceCache = new Map<string, string | null>();
  private javadocCache = new Map<string, string | null>();

  private getJavaBinaries() {
    return resolveJavaBinaries(storage.getSettings().javaPath);
  }

  private jdkInitPromise: Promise<void> | null = null;

  // JDK Indexing via jimage
  public initJdkIndex(): Promise<void> {
    if (this.jdkClassesLoaded) return Promise.resolve();
    if (this.jdkInitPromise) return this.jdkInitPromise;

    this.jdkInitPromise = new Promise<void>((resolve) => {
      try {
        const bins = this.getJavaBinaries();
        const candidates: string[] = [];
        if (bins.jimage) candidates.push(bins.jimage);
        if (bins.binDir) candidates.push(path.join(bins.binDir, 'jimage'));
        candidates.push('/usr/lib/jvm/default/bin/jimage', '/usr/lib/jvm/java-26-openjdk/bin/jimage');
        try {
          const javaReal = fs.realpathSync('/usr/bin/java');
          candidates.push(path.join(path.dirname(javaReal), 'jimage'));
        } catch {}

        const jimagePath = candidates.find((p) => fs.existsSync(p));
        if (!jimagePath) {
          return resolve();
        }

        const modulesPath = path.resolve(path.dirname(jimagePath), '../lib/modules');
        if (!fs.existsSync(modulesPath)) {
          return resolve();
        }

        execFile(
          jimagePath,
          ['list', modulesPath],
          { maxBuffer: 60 * 1024 * 1024, timeout: 10000 },
          (_err, stdout) => {
            try {
              if (stdout) {
                this.parseJimageList(stdout.toString());
              }
            } catch (e) {
              console.warn('Java jimage class indexing failed:', e);
            } finally {
              this.jdkClassesLoaded = true;
              resolve();
            }
          }
        );
      } catch (e) {
        console.warn('Java jimage initialization failed:', e);
        resolve();
      }
    });

    return this.jdkInitPromise;
  }

  private parseJimageList(out: string): void {
    const lines = out.split('\n');
    const seen = new Set<string>();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.endsWith('.class') || line.includes('$')) continue;

      // Class path in jimage list: e.g. java/util/ArrayList.class
      const slash = line.lastIndexOf('/');
      if (slash === -1) continue;

      const pkgSlash = line.substring(0, slash);
      const pkg = pkgSlash.replace(/\//g, '.');

      // Include all standard java.* and javax.* packages
      if (!pkg.startsWith('java.') && !pkg.startsWith('javax.')) continue;

      const simpleName = line.substring(slash + 1).replace('.class', '');
      if (!/^[A-Z][a-zA-Z0-9_]*$/.test(simpleName)) continue;

      const fqcn = `${pkg}.${simpleName}`;

      // Distinguish annotations (like Override, Deprecated, FunctionalInterface, Serial)
      const isTopAnnotation = ['Override', 'Deprecated', 'SuppressWarnings', 'FunctionalInterface', 'SafeVarargs', 'Serial'].includes(simpleName);
      const isAnnotation = pkg.includes('.annotation') || isTopAnnotation;

      if (!seen.has(simpleName)) {
        seen.add(simpleName);
        this.jdkClassMap.set(simpleName, fqcn);

        const item: IntellisenseCompletionItem = {
          name: simpleName,
          kind: 'Class',
          detail: fqcn,
          doc: `Java Standard Library class in \`${pkg}\``,
          insertText: simpleName,
          sortText: isTopAnnotation ? `0_0_${simpleName}` : (isAnnotation ? `0_1_${simpleName}` : `4_${simpleName}`),
        };

        this.jdkTopLevelItems.push(item);
        if (isAnnotation) {
          this.jdkAnnotations.push(item);
        }
      }
    }
  }

  // External JAR Indexing
  private getJarIndex(jarPath: string): { items: IntellisenseCompletionItem[]; map: Map<string, string>; annotations: IntellisenseCompletionItem[] } {
    if (this.jarClassCache.has(jarPath)) {
      return this.jarClassCache.get(jarPath)!;
    }

    const items: IntellisenseCompletionItem[] = [];
    const map = new Map<string, string>();
    const annotations: IntellisenseCompletionItem[] = [];

    try {
      if (!fs.existsSync(jarPath)) {
        const res = { items, map, annotations };
        this.jarClassCache.set(jarPath, res);
        return res;
      }

      // Fast zip listing and ACC_ANNOTATION (0x2000) bytecode flag detection via Python
      let out = '';
      try {
        const pyScript = `import zipfile,sys
def is_ann(b):
  try:
    if b[:4]!=b"\\xca\\xfe\\xba\\xbe":return False
    c=int.from_bytes(b[8:10],"big")
    idx,i=10,1
    while i<c:
      t=b[idx];idx+=1
      if t in (7,8,16,19,20):idx+=2
      elif t in (9,10,11,3,4,12,17,18):idx+=4
      elif t in (5,6):idx+=8;i+=1
      elif t==1:idx+=2+int.from_bytes(b[idx:idx+2],"big")
      elif t==15:idx+=3
      else:return False
      i+=1
    return bool(int.from_bytes(b[idx:idx+2],"big")&0x2000)
  except:return False
with zipfile.ZipFile(sys.argv[1]) as z:
  for n in z.namelist():
    if n.endswith(".class") and "$" not in n:
      ann = "1" if is_ann(z.read(n)) else "0"
      print(f"{ann} {n}")`;
        out = execSync(`python3 -c '${pyScript}' "${jarPath}"`, {
          encoding: 'utf-8',
          timeout: 5000,
        });
      } catch {
        try {
          out = execSync(`unzip -l "${jarPath}"`, { encoding: 'utf-8', timeout: 4000 });
        } catch {}
      }

      const seen = new Set<string>();
      const jarBase = path.basename(jarPath);

      for (const rawLine of out.split('\n')) {
        const line = rawLine.trim();
        if (!line.endsWith('.class') || line.includes('$')) continue;

        let isAnnotation = false;
        let classFile = line;

        if (line.startsWith('1 ') || line.startsWith('0 ')) {
          isAnnotation = line.startsWith('1 ');
          classFile = line.substring(2).trim();
        } else {
          isAnnotation = classFile.includes('.annotation.');
        }

        const m = classFile.match(/([a-zA-Z0-9_\/]+)\.class$/);
        if (!m) continue;

        const entry = m[1];
        const slash = entry.lastIndexOf('/');
        const simpleName = slash === -1 ? entry : entry.substring(slash + 1);
        if (!/^[A-Z][a-zA-Z0-9_]*$/.test(simpleName) || seen.has(simpleName)) continue;

        seen.add(simpleName);
        const fqcn = entry.replace(/\//g, '.');
        map.set(simpleName, fqcn);

        const item: IntellisenseCompletionItem = {
          name: simpleName,
          kind: 'Class',
          detail: `${fqcn} (${jarBase})`,
          doc: `External library ${isAnnotation ? 'annotation' : 'class'} from \`${jarBase}\``,
          insertText: simpleName,
          sortText: isAnnotation ? `0_${simpleName}` : `3_${simpleName}`,
        };

        items.push(item);
        if (isAnnotation) {
          annotations.push(item);
        }
      }
    } catch (e) {
      console.warn(`Failed to index jar ${jarPath}:`, e);
    }

    const result = { items, map, annotations };
    this.jarClassCache.set(jarPath, result);
    return result;
  }

  private getEnabledJars(enabledLibIds: string[] = []): string[] {
    const enabled = new Set((enabledLibIds || []).map((s) => s.toLowerCase()));
    const jars: string[] = [];
    for (const lib of EXTERNAL_LIBRARIES) {
      if (lib.language !== 'java' || lib.kind !== 'java-jar') continue;
      if (!enabled.has(lib.id.toLowerCase())) continue;
      const full = getJavaJarPath(lib);
      if (fs.existsSync(full)) jars.push(full);
    }
    return jars;
  }

  // javap Member & Signature Extraction
  private getJavapRaw(className: string, jars: string[] = []): Promise<string | null> {
    const cpKey = jars.length > 0 ? `|cp:${jars.slice().sort().join(',')}` : '';
    const key = `${className}${cpKey}`;
    if (this.javapRawCache.has(key)) {
      return Promise.resolve(this.javapRawCache.get(key)!);
    }

    const javap = this.getJavaBinaries().javap;
    const args = jars.length > 0 ? ['-classpath', jars.join(path.delimiter), className] : [className];

    return new Promise((resolve) => {
      execFile(javap, args, { timeout: 2500 }, (error, stdout) => {
        if (error || !stdout) {
          this.javapRawCache.set(key, '');
          return resolve(null);
        }

        const out = stdout.toString();
        this.javapRawCache.set(key, out);
        resolve(out);
      });
    });
  }

  private async runJavap(className: string, jars: string[] = []): Promise<IntellisenseCompletionItem[]> {
    const cpKey = jars.length > 0 ? `|cp:${jars.slice().sort().join(',')}` : '';
    const key = `${className}${cpKey}`;
    if (this.javapCache.has(key)) {
      return this.javapCache.get(key)!;
    }

    const resolvedFqcn = this.jdkClassMap.get(className) || className;
    const [out, src] = await Promise.all([
      this.getJavapRaw(className, jars),
      this.getClassSource(resolvedFqcn, jars),
    ]);

    if (!out) {
      this.javapCache.set(key, []);
      return [];
    }

    const methodDocs = new Map<string, string>();
    const fieldDocs = new Map<string, string>();

    if (src) {
      // Fast extraction of all method Javadocs
      const methodDocRe = /\/\*\*([^*]*(?:\*(?!\/)[^*]*)*)\*\/\s*(?:@[A-Za-z0-9_.]+(?:\([^)]*\))?\s*)*(?:(?:public|protected|private|static|final|abstract|default|synchronized)\s+)*[\w<>,\s\[\]\?]+\s+([a-zA-Z0-9_]+)\s*\(/g;
      let mm: RegExpExecArray | null;
      while ((mm = methodDocRe.exec(src)) !== null) {
        const raw = mm[1];
        const mName = mm[2];
        if (!methodDocs.has(mName)) {
          const cleaned = this.cleanJavadocComment(raw);
          if (cleaned) {
            methodDocs.set(mName, cleaned);
            if (!this.javadocCache.has(`${resolvedFqcn}#${mName}`)) {
              this.javadocCache.set(`${resolvedFqcn}#${mName}`, cleaned);
            }
          }
        }
      }

      // Fast extraction of all field / constant Javadocs
      const fieldDocRe = /\/\*\*([^*]*(?:\*(?!\/)[^*]*)*)\*\/\s*(?:(?:public|protected|private|static|final)\s+)*[\w<>,\s\[\]\?]+\s+([A-Z0-9_]+)\s*[;=]/g;
      let fm: RegExpExecArray | null;
      while ((fm = fieldDocRe.exec(src)) !== null) {
        const raw = fm[1];
        const fName = fm[2];
        if (!fieldDocs.has(fName)) {
          const cleaned = this.cleanJavadocComment(raw);
          if (cleaned) {
            fieldDocs.set(fName, cleaned);
            if (!this.javadocCache.has(`${resolvedFqcn}#${fName}`)) {
              this.javadocCache.set(`${resolvedFqcn}#${fName}`, cleaned);
            }
          }
        }
      }
    }

    const items: IntellisenseCompletionItem[] = [];
    const seen = new Set<string>();

    for (const rawLine of out.split('\n')) {
      const line = rawLine.trim().replace(/;$/, '');
      if (!line || line.startsWith('Compiled from') || line.startsWith('}') || line.includes('class ') || line.includes('interface ')) {
        continue;
      }

      // Method signature: e.g. public static <T> void sort(java.util.List<T>)
      const methodMatch = line.match(/\s([a-zA-Z0-9_]+)\s*\((.*)\)/);
      if (methodMatch) {
        const methodName = methodMatch[1];
        if (!seen.has(methodName) && !methodName.startsWith('lambda$')) {
          seen.add(methodName);
          const doc = methodDocs.get(methodName) || `From \`${className}\``;
          items.push({
            name: methodName,
            kind: 'Method',
            detail: line,
            signature: line,
            doc,
            insertText: methodName,
            sortText: `0_${methodName}`,
          });
        }
        continue;
      }

      // Public static constant or field: e.g. public static final int MAX_VALUE
      if (line.includes('static final ') && !line.includes('(')) {
        const fieldMatch = line.match(/\s([A-Z0-9_]+)$/);
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          if (!seen.has(fieldName)) {
            seen.add(fieldName);
            const doc = fieldDocs.get(fieldName) || `Constant in \`${className}\``;
            items.push({
              name: fieldName,
              kind: 'Property',
              detail: line,
              signature: line,
              doc,
              insertText: fieldName,
              sortText: `1_${fieldName}`,
            });
          }
        }
      }
    }

    this.javapCache.set(key, items);
    return items;
  }

  private findSrcZip(): string | null {
    try {
      const candidates: string[] = [
        '/usr/lib/jvm/default/lib/src.zip',
        '/usr/lib/jvm/default-java/lib/src.zip',
      ];
      if (fs.existsSync('/usr/lib/jvm')) {
        try {
          for (const d of fs.readdirSync('/usr/lib/jvm')) {
            candidates.push(path.join('/usr/lib/jvm', d, 'lib', 'src.zip'));
            candidates.push(path.join('/usr/lib/jvm', d, 'src.zip'));
          }
        } catch {}
      }
      if (process.env.JAVA_HOME) {
        candidates.push(path.join(process.env.JAVA_HOME, 'lib', 'src.zip'));
        candidates.push(path.join(process.env.JAVA_HOME, 'src.zip'));
      }
      try {
        const javaReal = fs.realpathSync('/usr/bin/java');
        const homeDir = path.dirname(path.dirname(javaReal));
        candidates.push(path.join(homeDir, 'lib', 'src.zip'));
        candidates.push(path.join(homeDir, 'src.zip'));
      } catch {}
      const bins = this.getJavaBinaries();
      if (bins.javaHome) {
        candidates.push(path.join(bins.javaHome, 'lib', 'src.zip'));
        candidates.push(path.join(bins.javaHome, 'src.zip'));
      }
      if (bins.binDir) {
        candidates.push(path.resolve(bins.binDir, '../lib/src.zip'));
        candidates.push(path.resolve(bins.binDir, '../src.zip'));
      }
      candidates.push(path.join(getAppDataDir(), 'lib', 'src.zip'));
      for (const c of candidates) {
        if (c && fs.existsSync(c)) return c;
      }
    } catch {}
    return null;
  }

  private getCandidateSourceArchives(jars: string[] = []): string[] {
    const archives = new Set<string>();

    for (const j of jars) {
      if (!j) continue;
      const baseNoExt = j.replace(/\.jar$/i, '');
      const s1 = `${baseNoExt}-sources.jar`;
      const s2 = `${baseNoExt}-src.jar`;
      if (fs.existsSync(s1)) archives.add(s1);
      if (fs.existsSync(s2)) archives.add(s2);

      const dir = path.dirname(j);
      const name = path.basename(baseNoExt);
      const s3 = path.join(dir, `${name}-sources.jar`);
      if (fs.existsSync(s3)) archives.add(s3);
    }

    return Array.from(archives);
  }

  private async getClassSource(rawFqcn: string, jars: string[] = []): Promise<string | null> {
    const fqcn = this.jdkClassMap.get(rawFqcn) || rawFqcn;
    if (this.javaSourceCache.has(fqcn)) {
      return this.javaSourceCache.get(fqcn)!;
    }

    const outerFqcn = fqcn.split('$')[0];
    const relPath = `${outerFqcn.replace(/\./g, '/')}.java`;

    const isJdkClass = fqcn.startsWith('java.') || fqcn.startsWith('javax.') || fqcn.startsWith('sun.') || fqcn.startsWith('jdk.');
    const srcZip = this.findSrcZip();
    const candidateArchives = this.getCandidateSourceArchives(jars);

    const orderedArchives: string[] = [];
    if (isJdkClass) {
      if (srcZip) orderedArchives.push(srcZip);
      orderedArchives.push(...candidateArchives);
    } else {
      orderedArchives.push(...candidateArchives);
      if (srcZip) orderedArchives.push(srcZip);
    }

    for (const archive of orderedArchives) {
      try {
        const text = await new Promise<string | null>((resolve) => {
          execFile(
            'unzip',
            ['-p', archive, relPath, `*/${relPath}`],
            { maxBuffer: 10 * 1024 * 1024, timeout: 3000 },
            (_err, stdout) => {
              if (stdout && stdout.length > 0) {
                return resolve(stdout.toString());
              }
              resolve(null);
            }
          );
        });

        if (text) {
          if (this.javaSourceCache.size > 200) this.javaSourceCache.clear();
          this.javaSourceCache.set(fqcn, text);
          return text;
        }
      } catch {}
    }

    this.javaSourceCache.set(fqcn, null);
    return null;
  }

  private cleanJavadocComment(raw: string): string {
    const lines = raw.split('\n').map((l) => {
      const trimmed = l.trim();
      return trimmed.startsWith('*') ? trimmed.substring(1).trim() : trimmed;
    });
    let text = lines.join('\n').trim();
    text = text.replace(/\{@code\s+([^}]+)\}/g, '`$1`');
    text = text.replace(/\{@link(?:plain)?\s+([^}]+)\}/g, '`$1`');
    text = text.replace(/<\/?(?:p|ul|li|pre|code|b|i|em|strong|div|span|blockquote)>/gi, '');
    text = text.replace(/@param\s+(\w+)\s+/g, '\n- **@param** `$1`: ');
    text = text.replace(/@return\s+/g, '\n- **@return**: ');
    text = text.replace(/@throws\s+(\w+)\s+/g, '\n- **@throws** `$1`: ');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim().slice(0, 2000);
  }

  private async getMethodJavadoc(fqcn: string, method: string, jars: string[] = []): Promise<string | null> {
    const key = `${fqcn}#${method}`;
    if (this.javadocCache.has(key)) return this.javadocCache.get(key)!;

    const src = await this.getClassSource(fqcn, jars);
    if (!src) {
      this.javadocCache.set(key, null);
      return null;
    }

    const esc = method.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(?:(?:public|protected|private|static|final|abstract|default|synchronized)\\s+)*[a-zA-Z0-9_<>,[\\]\\s?]+\\s+${esc}\\s*\\(`,
      'g'
    );

    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(src)) !== null) {
      const start = match.index;
      let segment = src.substring(Math.max(0, start - 4000), start).trimEnd();
      segment = segment.replace(/(?:@[a-zA-Z0-9_.]+(?:\([^)]*\))?\s*)+$/, '').trimEnd();
      if (segment.endsWith('*/')) {
        const commentStart = segment.lastIndexOf('/**');
        if (commentStart !== -1) {
          const raw = segment.substring(commentStart + 3, segment.length - 2);
          const cleaned = this.cleanJavadocComment(raw);
          if (cleaned) {
            if (this.javadocCache.size > 500) this.javadocCache.clear();
            this.javadocCache.set(key, cleaned);
            return cleaned;
          }
        }
      }
      if (regex.lastIndex - match.index > 50000) break;
    }

    this.javadocCache.set(key, null);
    return null;
  }

  private async getClassJavadoc(fqcn: string, jars: string[] = []): Promise<string | null> {
    const key = `${fqcn}#class`;
    if (this.javadocCache.has(key)) return this.javadocCache.get(key)!;

    const src = await this.getClassSource(fqcn, jars);
    if (!src) {
      this.javadocCache.set(key, null);
      return null;
    }

    const simpleName = fqcn.split('.').pop()?.split('$').pop() ?? fqcn;
    const esc = simpleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(?:public\\s+)?(?:final\\s+|sealed\\s+|abstract\\s+)*(?:class|interface|enum|record|@interface)\\s+${esc}(?:<|\\s)`,
      'g'
    );

    const match = regex.exec(src);
    if (match) {
      let segment = src.substring(0, match.index).trimEnd();
      segment = segment.replace(/(?:@[a-zA-Z0-9_.]+(?:\([^)]*\))?\s*)+$/, '').trimEnd();
      if (segment.endsWith('*/')) {
        const commentStart = segment.lastIndexOf('/**');
        if (commentStart !== -1) {
          const raw = segment.substring(commentStart + 3, segment.length - 2);
          const cleaned = this.cleanJavadocComment(raw);
          if (cleaned) {
            if (this.javadocCache.size > 500) this.javadocCache.clear();
            this.javadocCache.set(key, cleaned);
            return cleaned;
          }
        }
      }
    }

    this.javadocCache.set(key, null);
    return null;
  }

  // User-Defined Java AST Analysis
  private parseUserJavaCode(code: string): ParsedJavaFile {
    const classes = new Map<string, UserClass>();
    const imports = new Map<string, string>();
    const lines = code.split('\n');

    // Parse imports
    for (const line of lines) {
      const impMatch = line.match(/^\s*import\s+(?:static\s+)?([a-zA-Z0-9_.]+)\.([a-zA-Z0-9_*]+)\s*;/);
      if (impMatch) {
        const fullPkg = impMatch[1];
        const member = impMatch[2];
        if (member !== '*') {
          imports.set(member, `${fullPkg}.${member}`);
        }
      }
    }

    // Extract classes, interfaces, enums, records
    const classDeclRe = /(?:public\s+|protected\s+|private\s+|abstract\s+|static\s+|final\s+)*(class|interface|enum|record)\s+([A-Za-z0-9_]+)/g;
    let match: RegExpExecArray | null;

    while ((match = classDeclRe.exec(code)) !== null) {
      const kind = match[1] as UserClass['kind'];
      const className = match[2];
      const startIdx = match.index;
      const lineNum = code.substring(0, startIdx).split('\n').length;

      // Extract Javadoc preceding the class
      let doc = '';
      const beforeClass = code.substring(0, startIdx).trim();
      const lastCommentEnd = beforeClass.lastIndexOf('*/');
      if (lastCommentEnd !== -1 && beforeClass.slice(lastCommentEnd + 2).trim() === '') {
        const commentStart = beforeClass.lastIndexOf('/**', lastCommentEnd);
        if (commentStart !== -1) {
          doc = beforeClass.slice(commentStart + 3, lastCommentEnd).split('\n').map((l) => l.trim().replace(/^\*\s?/, '')).join('\n').trim();
        }
      }

      // Simple brace matching to find class body
      const openBrace = code.indexOf('{', startIdx);
      let endLine = lineNum;
      let bodyText = '';
      if (openBrace !== -1) {
        let depth = 1;
        let pos = openBrace + 1;
        while (pos < code.length && depth > 0) {
          if (code[pos] === '{') depth++;
          else if (code[pos] === '}') depth--;
          pos++;
        }
        bodyText = code.substring(openBrace + 1, pos - 1);
        endLine = code.substring(0, pos).split('\n').length;
      }

      const methods = new Map<string, UserMethod>();
      const fields = new Map<string, UserField>();

      // Parse methods inside bodyText
      const methodRe = /(?:(?:public|protected|private|static|final|synchronized|abstract|default)\s+)*([\w<>,\s\[\]]+)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*[{;]/g;
      let mMatch: RegExpExecArray | null;
      while ((mMatch = methodRe.exec(bodyText)) !== null) {
        const returnType = mMatch[1].trim();
        const methodName = mMatch[2].trim();
        const rawParams = mMatch[3].trim();

        if (['if', 'for', 'while', 'switch', 'catch'].includes(methodName)) continue;

        // Extract Javadoc preceding the method
        let mDoc = '';
        const methodStartIdx = mMatch.index;
        const beforeMethod = bodyText.substring(0, methodStartIdx).trim();
        const lastCommentEnd = beforeMethod.lastIndexOf('*/');
        if (lastCommentEnd !== -1 && beforeMethod.slice(lastCommentEnd + 2).trim() === '') {
          const commentStart = beforeMethod.lastIndexOf('/**', lastCommentEnd);
          if (commentStart !== -1) {
            mDoc = beforeMethod.slice(commentStart + 3, lastCommentEnd).split('\n').map((l) => l.trim().replace(/^\*\s?/, '')).join('\n').trim();
          }
        }

        const params = rawParams ? rawParams.split(',').map((p) => p.trim()) : [];
        const sig = `${returnType} ${methodName}(${rawParams})`;

        methods.set(methodName, {
          name: methodName,
          signature: sig,
          returnType,
          params,
          doc: mDoc || `Method \`${sig}\` of class \`${className}\``,
        });
      }

      // Parse fields inside bodyText
      const fieldRe = /(?:(?:private|protected|public|static|final)\s+)+([\w<>,\s\[\]]+)\s+([a-zA-Z0-9_]+)\s*(?:=[^;]+)?;(?!\s*\()/g;
      let fMatch: RegExpExecArray | null;
      while ((fMatch = fieldRe.exec(bodyText)) !== null) {
        const type = fMatch[1].trim();
        const fieldName = fMatch[2].trim();
        fields.set(fieldName, {
          name: fieldName,
          type,
          doc: `Field \`${type} ${fieldName}\` of class \`${className}\``,
        });
      }

      classes.set(className, {
        name: className,
        kind,
        doc,
        methods,
        fields,
        startLine: lineNum,
        endLine,
      });
    }

    const inScopeVariables = (cursorLine: number): UserVariable[] => {
      const vars: UserVariable[] = [];
      const linesUpToCursor = lines.slice(0, cursorLine);

      const NON_TYPE_KEYWORDS = new Set(['return', 'throw', 'package', 'import', 'case', 'else', 'default', 'break', 'continue', 'public', 'private', 'protected', 'static', 'void', 'class', 'interface', 'new']);

      for (let i = 0; i < linesUpToCursor.length; i++) {
        const line = linesUpToCursor[i];

        const varDeclRe = /(?:(?:final)\s+)?([a-zA-Z0-9_]+)(?:<.*>)?(?:\[\])?\s+([a-zA-Z0-9_]+)\s*(?:=\s*([^;]+)|;)/g;
        let vMatch: RegExpExecArray | null;
        while ((vMatch = varDeclRe.exec(line)) !== null) {
          const typeName = vMatch[1];
          const varName = vMatch[2];
          const initExpr = vMatch[3] ? vMatch[3].trim() : '';

          if (NON_TYPE_KEYWORDS.has(typeName)) continue;

          let inferredType = typeName === 'var' ? 'Object' : typeName;
          if (typeName === 'var' && initExpr) {
            const newMatch = initExpr.match(/new\s+([A-Z][a-zA-Z0-9_]*)/);
            if (newMatch) {
              inferredType = newMatch[1];
            } else if (initExpr.startsWith('"')) {
              inferredType = 'String';
            }
          }

          vars.push({ name: varName, type: inferredType, line: i + 1 });
        }
      }

      for (const cls of classes.values()) {
        for (const m of cls.methods.values()) {
          for (const rawP of m.params) {
            const parts = rawP.trim().split(/\s+/);
            if (parts.length >= 2) {
              const pType = parts[parts.length - 2].replace(/<.*>/, '').replace(/\[\]/, '');
              const pName = parts[parts.length - 1];
              if (/^[a-zA-Z0-9_]+$/.test(pName) && !NON_TYPE_KEYWORDS.has(pType)) {
                vars.push({ name: pName, type: pType, line: 0 });
              }
            }
          }
        }
      }
      return vars;
    };

    const enclosingClass = (cursorLine: number): UserClass | null => {
      for (const cls of classes.values()) {
        if (cursorLine >= cls.startLine && cursorLine <= cls.endLine) {
          return cls;
        }
      }
      return null;
    };

    return { classes, imports, inScopeVariables, enclosingClass };
  }

  // Completions
  public async getCompletions(query: IntellisenseCompletionQuery): Promise<IntellisenseCompletionResult> {
    await this.initJdkIndex();

    const code = query.fileContent || '';
    const line = query.cursorLine || 1;
    const context = (query.context || '').trim();
    const isDot = Boolean(query.isDot);
    const isAnnotation = Boolean(query.isAnnotation);
    const projectFiles = query.projectFiles || [];
    const enabledJars = this.getEnabledJars(query.enabledLibIds);

    // Parse active file
    const parsed = this.parseUserJavaCode(code);

    // Parse all other project files
    const allUserClasses = new Map<string, UserClass>(parsed.classes);
    for (const pf of projectFiles) {
      if (pf.path !== query.filePath) {
        const pParsed = this.parseUserJavaCode(pf.content || '');
        for (const [k, v] of pParsed.classes) {
          if (!allUserClasses.has(k)) allUserClasses.set(k, v);
        }
      }
    }

    const items: IntellisenseCompletionItem[] = [];
    const seen = new Set<string>();

    const addItem = (item: IntellisenseCompletionItem) => {
      if (!item.name || seen.has(item.name)) return;
      seen.add(item.name);
      items.push(item);
    };

    // CASE 1: Member Access (obj.)
    if (isDot && context) {
      let targetClassName = context;

      // Handle "this."
      if (context === 'this') {
        const currentCls = parsed.enclosingClass(line);
        if (currentCls) {
          for (const m of currentCls.methods.values()) {
            addItem({
              name: m.name,
              kind: 'Method',
              detail: m.signature,
              signature: m.signature,
              doc: m.doc,
              insertText: m.name,
              sortText: `0_${m.name}`,
            });
          }
          for (const f of currentCls.fields.values()) {
            addItem({
              name: f.name,
              kind: 'Field',
              detail: `${f.type} ${f.name}`,
              doc: f.doc,
              insertText: f.name,
              sortText: `1_${f.name}`,
            });
          }
          return { items };
        }
      }

      const currentCls = parsed.enclosingClass(line);
      const cleanCtx = context.replace(/^this\./, '');
      if (currentCls && currentCls.fields.has(cleanCtx)) {
        targetClassName = currentCls.fields.get(cleanCtx)!.type;
      }

      // Check if context is a local variable in scope
      const inScopeVars = parsed.inScopeVariables(line);
      const matchedVar = inScopeVars.reverse().find((v) => v.name === cleanCtx);
      if (matchedVar) {
        targetClassName = matchedVar.type;
      }

      targetClassName = targetClassName.replace(/<.*>/, '').replace(/\[\]/, '').trim();

      // Case-insensitive class-name fallback
      if (!allUserClasses.has(targetClassName)) {
        for (const k of allUserClasses.keys()) {
          if (k.toLowerCase() === targetClassName.toLowerCase()) {
            targetClassName = k;
            break;
          }
        }
      }

      // Check if target is a user-defined class in the project
      if (allUserClasses.has(targetClassName)) {
        const cls = allUserClasses.get(targetClassName)!;
        for (const m of cls.methods.values()) {
          addItem({
            name: m.name,
            kind: 'Method',
            detail: m.signature,
            signature: m.signature,
            doc: m.doc,
            insertText: m.name,
            sortText: `0_${m.name}`,
          });
        }
        for (const f of cls.fields.values()) {
          addItem({
            name: f.name,
            kind: 'Field',
            detail: `${f.type} ${f.name}`,
            doc: f.doc,
            insertText: f.name,
            sortText: `1_${f.name}`,
          });
        }
        return { items };
      }

      // Resolve FQCN from imports, JDK class index, or external JARs
      let fqcn = parsed.imports.get(targetClassName) || this.jdkClassMap.get(targetClassName);
      if (!fqcn && enabledJars.length > 0) {
        for (const jar of enabledJars) {
          const jarIdx = this.getJarIndex(jar);
          if (jarIdx.map.has(targetClassName)) {
            fqcn = jarIdx.map.get(targetClassName);
            break;
          }
        }
      }

      const queryName = fqcn || targetClassName;
      const javapMembers = await this.runJavap(queryName, enabledJars);
      for (const m of javapMembers) {
        addItem(m);
      }

      return { items };
    }

    // CASE 2: Annotation completion (@)
    if (isAnnotation) {
      // JDK annotations
      for (const ann of this.jdkAnnotations) {
        addItem(ann);
      }
      // External JAR annotations (e.g. Lombok @Data, @Builder)
      for (const jar of enabledJars) {
        const jarIdx = this.getJarIndex(jar);
        for (const ann of jarIdx.annotations) {
          addItem(ann);
        }
      }
      return { items };
    }

    // CASE 3: Top-level completions
    // 1. In-scope local variables
    const inScope = parsed.inScopeVariables(line);
    for (const v of inScope) {
      addItem({
        name: v.name,
        kind: 'Variable',
        detail: `${v.type} ${v.name}`,
        doc: `Local variable \`${v.type} ${v.name}\``,
        insertText: v.name,
        sortText: `0_${v.name}`,
      });
    }

    // 2. Project classes
    for (const [cname, cls] of allUserClasses) {
      addItem({
        name: cname,
        kind: 'Class',
        detail: `${cls.kind} ${cname}`,
        doc: cls.doc || `User defined ${cls.kind} \`${cname}\``,
        insertText: cname,
        sortText: `1_${cname}`,
      });
    }

    // 3. Current class members (if inside a class)
    const currentCls = parsed.enclosingClass(line);
    if (currentCls) {
      for (const m of currentCls.methods.values()) {
        addItem({
          name: m.name,
          kind: 'Method',
          detail: m.signature,
          signature: m.signature,
          doc: m.doc,
          insertText: m.name,
          sortText: `2_${m.name}`,
        });
      }
      for (const f of currentCls.fields.values()) {
        addItem({
          name: f.name,
          kind: 'Field',
          detail: `${f.type} ${f.name}`,
          doc: f.doc,
          insertText: f.name,
          sortText: `2_${f.name}`,
        });
      }
    }

    // 4. External JAR classes
    for (const jar of enabledJars) {
      const jarIdx = this.getJarIndex(jar);
      for (const it of jarIdx.items) {
        addItem(it);
      }
    }

    // 5. JDK Top-level classes
    for (const it of this.jdkTopLevelItems) {
      addItem(it);
    }

    // 6. Java Keywords
    const javaKeywords = [
      'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class',
      'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally',
      'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long',
      'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'super',
      'switch', 'synchronized', 'this', 'throw', 'throws', 'try', 'void', 'volatile', 'while',
      'var', 'record', 'true', 'false', 'null'
    ];
    for (const kw of javaKeywords) {
      addItem({
        name: kw,
        kind: 'Keyword',
        detail: 'keyword',
        insertText: kw,
        sortText: `8_${kw}`,
      });
    }

    return { items };
  }

  // Hover
  public async getHover(query: IntellisenseHoverQuery): Promise<IntellisenseHoverResult | null> {
    const symbol = (query.symbol || '').replace(/^@/, '');
    const context = (query.context || '').trim();
    const code = query.fileContent || '';
    const line = query.cursorLine || 1;
    const projectFiles = query.projectFiles || [];
    const enabledJars = this.getEnabledJars(query.enabledLibIds);

    if (!symbol) return null;
    await this.initJdkIndex();

    // 1. Check user code
    const parsed = this.parseUserJavaCode(code);
    const allUserClasses = new Map<string, UserClass>(parsed.classes);
    for (const pf of projectFiles) {
      if (pf.path !== query.filePath) {
        const pParsed = this.parseUserJavaCode(pf.content || '');
        for (const [k, v] of pParsed.classes) {
          if (!allUserClasses.has(k)) allUserClasses.set(k, v);
        }
      }
    }

    // Check member hover: context.symbol
    if (context) {
      let targetClassName = context;
      if (context === 'this') {
        const currentCls = parsed.enclosingClass(line);
        if (currentCls) targetClassName = currentCls.name;
      } else {
        const inScopeVars = parsed.inScopeVariables(line);
        const matchedVar = inScopeVars.reverse().find((v) => v.name === context);
        if (matchedVar) targetClassName = matchedVar.type;
      }

      if (allUserClasses.has(targetClassName)) {
        const cls = allUserClasses.get(targetClassName)!;
        if (cls.methods.has(symbol)) {
          const m = cls.methods.get(symbol)!;
          return {
            signature: m.signature,
            doc: m.doc || `Method in \`${targetClassName}\``,
            detail: `${targetClassName}.${symbol}`,
            moduleOrClass: targetClassName,
          };
        }
        if (cls.fields.has(symbol)) {
          const f = cls.fields.get(symbol)!;
          return {
            signature: `${f.type} ${f.name}`,
            doc: f.doc || `Field in \`${targetClassName}\``,
            detail: `${targetClassName}.${symbol}`,
            moduleOrClass: targetClassName,
          };
        }
      }

      // Check JDK or External JAR for context.symbol
      let fqcn = parsed.imports.get(targetClassName) || this.jdkClassMap.get(targetClassName);
      if (!fqcn && enabledJars.length > 0) {
        for (const jar of enabledJars) {
          const jarIdx = this.getJarIndex(jar);
          if (jarIdx.map.has(targetClassName)) {
            fqcn = jarIdx.map.get(targetClassName);
            break;
          }
        }
      }

      const queryName = fqcn || targetClassName;
      const [raw, javadoc] = await Promise.all([
        this.getJavapRaw(queryName, enabledJars),
        this.getMethodJavadoc(queryName, symbol, enabledJars),
      ]);
      if (raw) {
        const lines = raw.split('\n').map((l) => l.trim().replace(/;$/, ''));
        const matchingMethods = lines.filter(
          (l) => (l.startsWith('public ') || l.startsWith('static ') || l.startsWith('protected ') || l.startsWith('default ') || l.startsWith('abstract ')) && l.includes(` ${symbol}(`)
        );
        if (matchingMethods.length > 0) {
          let docText = '';
          if (javadoc) {
            docText = javadoc;
            if (matchingMethods.length > 1) {
              docText += '\n\n**Overloads:**\n' + matchingMethods.map((m) => `- \`${m}\``).join('\n');
            }
          } else {
            docText = matchingMethods.length > 1
              ? `Overloads in \`${queryName}\`:\n\n` + matchingMethods.map((m) => `- \`${m}\``).join('\n')
              : `Method in \`${queryName}\``;
          }
          return {
            signature: matchingMethods[0],
            doc: docText,
            detail: `${queryName}.${symbol}`,
            moduleOrClass: queryName,
          };
        }

        const matchingField = lines.find(
          (l) => (l.includes('static final ') || l.startsWith('public ')) && l.endsWith(` ${symbol}`)
        );
        if (matchingField) {
          return {
            signature: matchingField,
            doc: javadoc || `Constant in \`${queryName}\``,
            detail: `${queryName}.${symbol}`,
            moduleOrClass: queryName,
          };
        }
      }
    }

    // Check if symbol is a user class
    if (allUserClasses.has(symbol)) {
      const cls = allUserClasses.get(symbol)!;
      return {
        signature: `${cls.kind} ${symbol}`,
        doc: cls.doc || `User defined ${cls.kind} \`${symbol}\``,
        detail: symbol,
        moduleOrClass: symbol,
      };
    }

    // Check if symbol is a method on any user class
    for (const [cname, cinfo] of allUserClasses) {
      if (cinfo.methods.has(symbol)) {
        const m = cinfo.methods.get(symbol)!;
        return {
          signature: m.signature,
          doc: m.doc || `Method in \`${cname}\``,
          detail: `${cname}.${symbol}`,
          moduleOrClass: cname,
        };
      }
    }

    // Check if symbol is a user variable
    const inScopeVars = parsed.inScopeVariables(line);
    const matchedVar = inScopeVars.reverse().find((v) => v.name === symbol);
    if (matchedVar) {
      return {
        signature: `${matchedVar.type} ${matchedVar.name}`,
        doc: `Local variable \`${matchedVar.name}\` of type \`${matchedVar.type}\``,
        detail: matchedVar.name,
      };
    }

    // Check if symbol is an explicitly imported class/interface/annotation
    if (parsed.imports.has(symbol)) {
      const impFqcn = parsed.imports.get(symbol)!;
      const [raw, javadoc] = await Promise.all([
        this.getJavapRaw(impFqcn, enabledJars),
        this.getClassJavadoc(impFqcn, enabledJars),
      ]);
      let classSig = `class ${symbol}`;
      if (raw) {
        const firstLine = raw.split('\n').find((l) => l.includes('class ') || l.includes('interface ') || l.includes('enum ') || l.includes('@interface '));
        if (firstLine) classSig = firstLine.trim().replace(/\s*\{\s*$/, '').replace(/;$/, '');
      }
      return {
        signature: classSig,
        doc: javadoc || `Class \`${impFqcn}\``,
        detail: impFqcn,
        moduleOrClass: impFqcn,
      };
    }

    const isAnnotationSymbol = (query.symbol || '').startsWith('@');

    // Check external JAR annotations (prioritize if query started with @, e.g. @Data from Lombok)
    if (isAnnotationSymbol) {
      for (const jar of enabledJars) {
        const jarIdx = this.getJarIndex(jar);
        if (jarIdx.map.has(symbol)) {
          const extFqcn = jarIdx.map.get(symbol)!;
          const [raw, javadoc] = await Promise.all([
            this.getJavapRaw(extFqcn, enabledJars),
            this.getClassJavadoc(extFqcn, enabledJars),
          ]);
          let classSig = `@interface ${symbol}`;
          if (raw) {
            const firstLine = raw.split('\n').find((l) => l.includes('class ') || l.includes('interface ') || l.includes('enum ') || l.includes('@interface '));
            if (firstLine) classSig = firstLine.trim().replace(/\s*\{\s*$/, '').replace(/;$/, '');
          }
          const doc = javadoc
            ? `${javadoc}\n\nExternal library from \`${path.basename(jar)}\``
            : `External library from \`${path.basename(jar)}\``;
          return {
            signature: classSig,
            doc,
            detail: extFqcn,
            moduleOrClass: extFqcn,
          };
        }
      }
    }

    // Check if symbol is a JDK class
    const fqcn = this.jdkClassMap.get(symbol);
    if (fqcn) {
      const [raw, javadoc] = await Promise.all([
        this.getJavapRaw(fqcn),
        this.getClassJavadoc(fqcn),
      ]);
      let classSig = `class ${symbol}`;
      if (raw) {
        const firstLine = raw.split('\n').find((l) => l.includes('class ') || l.includes('interface ') || l.includes('enum ') || l.includes('@interface '));
        if (firstLine) classSig = firstLine.trim().replace(/\s*\{\s*$/, '').replace(/;$/, '');
      }
      const desc = javadoc
        ? `${javadoc}\n\nJava Standard Library class in \`${fqcn.substring(0, fqcn.lastIndexOf('.'))}\``
        : `Java Standard Library class in \`${fqcn.substring(0, fqcn.lastIndexOf('.'))}\``;
      return {
        signature: classSig,
        doc: desc,
        detail: fqcn,
        moduleOrClass: fqcn,
      };
    }

    // Check if symbol is in external JARs (fallback for non-imported / non-@ symbols)
    for (const jar of enabledJars) {
      const jarIdx = this.getJarIndex(jar);
      if (jarIdx.map.has(symbol)) {
        const extFqcn = jarIdx.map.get(symbol)!;
        const [raw, javadoc] = await Promise.all([
          this.getJavapRaw(extFqcn, enabledJars),
          this.getClassJavadoc(extFqcn, enabledJars),
        ]);
        let classSig = `class ${symbol}`;
        if (raw) {
          const firstLine = raw.split('\n').find((l) => l.includes('class ') || l.includes('interface ') || l.includes('enum ') || l.includes('@interface '));
          if (firstLine) classSig = firstLine.trim().replace(/\s*\{\s*$/, '').replace(/;$/, '');
        }
        const doc = javadoc
          ? `${javadoc}\n\nExternal library from \`${path.basename(jar)}\``
          : `External library from \`${path.basename(jar)}\``;
        return {
          signature: classSig,
          doc,
          detail: extFqcn,
          moduleOrClass: extFqcn,
        };
      }
    }

    // Check imported classes or core JDK classes for bare method names
    const searchClasses = new Set<string>();
    for (const [, impFqcn] of parsed.imports) {
      searchClasses.add(impFqcn);
    }
    for (const core of ['java.lang.System', 'java.lang.Math', 'java.lang.String', 'java.util.Collections', 'java.util.Arrays']) {
      searchClasses.add(core);
    }

    for (const clsName of searchClasses) {
      const raw = await this.getJavapRaw(clsName, enabledJars);
      if (!raw) continue;
      const lines = raw.split('\n').map((l) => l.trim().replace(/;$/, ''));
      const matchingMethods = lines.filter(
        (l) => (l.startsWith('public ') || l.startsWith('static ') || l.startsWith('protected ') || l.startsWith('default ') || l.startsWith('abstract ')) && l.includes(` ${symbol}(`)
      );
      if (matchingMethods.length > 0) {
        const javadoc = await this.getMethodJavadoc(clsName, symbol, enabledJars);
        let docText = '';
        if (javadoc) {
          docText = javadoc;
          if (matchingMethods.length > 1) {
            docText += '\n\n**Overloads:**\n' + matchingMethods.map((m) => `- \`${m}\``).join('\n');
          }
        } else {
          docText = matchingMethods.length > 1
            ? `Overloads in \`${clsName}\`:\n\n` + matchingMethods.map((m) => `- \`${m}\``).join('\n')
            : `Method in \`${clsName}\``;
        }
        return {
          signature: matchingMethods[0],
          doc: docText,
          detail: `${clsName}.${symbol}`,
          moduleOrClass: clsName,
        };
      }
    }

    return null;
  }

  // Signature Help
  public async getSignatureHelp(query: IntellisenseSignatureHelpQuery): Promise<IntellisenseSignatureHelpResult | null> {
    const funcName = query.funcName;
    const context = (query.context || '').trim();
    const code = query.fileContent || '';
    const projectFiles = query.projectFiles || [];
    const enabledJars = this.getEnabledJars(query.enabledLibIds);

    if (!funcName) return null;
    await this.initJdkIndex();

    // Check user code
    const parsed = this.parseUserJavaCode(code);
    const allUserClasses = new Map<string, UserClass>(parsed.classes);
    for (const pf of projectFiles) {
      if (pf.path !== query.filePath) {
        const pParsed = this.parseUserJavaCode(pf.content || '');
        for (const [k, v] of pParsed.classes) {
          if (!allUserClasses.has(k)) allUserClasses.set(k, v);
        }
      }
    }

    let targetClassName = context;
    if (context) {
      const inScopeVars = parsed.inScopeVariables(999999);
      const matchedVar = inScopeVars.reverse().find((v) => v.name === context);
      if (matchedVar) targetClassName = matchedVar.type;
    }

    if (targetClassName && allUserClasses.has(targetClassName)) {
      const cls = allUserClasses.get(targetClassName)!;
      if (cls.methods.has(funcName)) {
        const m = cls.methods.get(funcName)!;
        return {
          signature: m.signature,
          doc: m.doc,
          parameters: m.params.map((p) => ({ label: p })),
        };
      }
    }

    // Check JDK or External JARs via javap
    if (targetClassName) {
      const fqcn = parsed.imports.get(targetClassName) || this.jdkClassMap.get(targetClassName) || targetClassName;
      const members = await this.runJavap(fqcn, enabledJars);
      const m = members.find((x) => x.name === funcName);
      if (m && m.signature) {
        const open = m.signature.indexOf('(');
        const close = m.signature.lastIndexOf(')');
        const rawParams = open !== -1 && close > open + 1 ? m.signature.substring(open + 1, close) : '';
        const params = rawParams ? rawParams.split(',').map((p) => ({ label: p.trim() })) : [];
        return {
          signature: m.signature,
          doc: m.doc,
          parameters: params,
        };
      }
    }

    return null;
  }

  public prewarm(): void {
    this.initJdkIndex();
  }

  public clearCache(): void {
    this.javapCache.clear();
    this.javapRawCache.clear();
    this.jarClassCache.clear();
    this.javaSourceCache.clear();
    this.javadocCache.clear();
  }
}

export const javaEngine = new JavaEngine();
