import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { spawn } from 'child_process';
import { getAppDataDir } from './pathResolver';
import type { SettingsData } from './storage';

export type ExternalLibraryLanguage = 'java' | 'python';
export type ExternalLibraryKind = 'java-jar' | 'python-pip';

export interface ExternalLibraryDef {
  id: string;
  language: ExternalLibraryLanguage;
  kind: ExternalLibraryKind;
  name: string;
  description: string;
  defaultEnabled: boolean;
  groupId?: string;
  artifactId?: string;
  pipPackage?: string;
  pipImportName?: string;
  homepage?: string;
}

export const EXTERNAL_LIBRARIES: ExternalLibraryDef[] = [
  {
    id: 'lombok',
    language: 'java',
    kind: 'java-jar',
    name: 'Lombok',
    description: 'Boilerplate reduction via annotations (@Data, @Builder, @Value, @Slf4j, etc.).',
    defaultEnabled: false,
    groupId: 'org.projectlombok',
    artifactId: 'lombok',
    homepage: 'https://projectlombok.org',
  },
  {
    id: 'gson',
    language: 'java',
    kind: 'java-jar',
    name: 'Gson',
    description: 'Google JSON serialization library.',
    defaultEnabled: false,
    groupId: 'com.google.code.gson',
    artifactId: 'gson',
    homepage: 'https://github.com/google/gson',
  },
  {
    id: 'pandas',
    language: 'python',
    kind: 'python-pip',
    name: 'pandas',
    description: 'Data analysis / DataFrame library for Python.',
    defaultEnabled: false,
    pipPackage: 'pandas',
    pipImportName: 'pandas',
    homepage: 'https://pandas.pydata.org',
  },
  {
    id: 'requests',
    language: 'python',
    kind: 'python-pip',
    name: 'requests',
    description: 'Simple HTTP client library for Python.',
    defaultEnabled: false,
    pipPackage: 'requests',
    pipImportName: 'requests',
    homepage: 'https://requests.readthedocs.io',
  },
];

export function getLibraryDef(id: string): ExternalLibraryDef | undefined {
  return EXTERNAL_LIBRARIES.find((l) => l.id === id);
}

export function getLibsDir(): string {
  const p = path.join(getAppDataDir(), 'libs');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function manifestPath(): string {
  return path.join(getLibsDir(), 'manifest.json');
}

export function readManifest(): Record<string, { version: string }> {
  try {
    if (fs.existsSync(manifestPath())) {
      return JSON.parse(fs.readFileSync(manifestPath(), 'utf-8'));
    }
  } catch {}
  return {};
}

function writeManifestEntry(id: string, version: string): void {
  try {
    const m = readManifest();
    m[id] = { version };
    fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2), 'utf-8');
  } catch {}
}

export function getInstalledJavaVersions(): Record<string, string> {
  const m = readManifest();
  const out: Record<string, string> = {};
  for (const lib of EXTERNAL_LIBRARIES) {
    if (lib.kind !== 'java-jar') continue;
    if (m[lib.id]?.version && fs.existsSync(getJavaJarPath(lib))) {
      out[lib.id] = m[lib.id].version;
    }
  }
  return out;
}

export function getJavaJarPath(lib: ExternalLibraryDef): string {
  return path.join(getLibsDir(), `${lib.id}.jar`);
}

export function getJavaSourcesJarPath(lib: ExternalLibraryDef): string {
  return path.join(getLibsDir(), `${lib.id}-sources.jar`);
}

export function mavenJarUrl(groupId: string, artifactId: string, version: string): string {
  const groupPath = groupId.replace(/\./g, '/');
  return `https://repo1.maven.org/maven2/${groupPath}/${artifactId}/${version}/${artifactId}-${version}.jar`;
}

export function mavenSourcesJarUrl(groupId: string, artifactId: string, version: string): string {
  const groupPath = groupId.replace(/\./g, '/');
  return `https://repo1.maven.org/maven2/${groupPath}/${artifactId}/${version}/${artifactId}-${version}-sources.jar`;
}

function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const doGet = (target: string, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects fetching ' + url));
      const client = target.startsWith('https') ? https : http;
      const req = client.get(target, { headers: { 'User-Agent': 'lld-practice-harness' } }, (res) => {
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const next = new URL(res.headers.location, target).toString();
          res.resume();
          doGet(next, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Request failed (${res.statusCode}) for ${target}`));
          return;
        }
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('Request timed out: ' + target));
      });
    };
    doGet(url);
  });
}

export async function fetchLatestMavenVersion(groupId: string, artifactId: string): Promise<string> {
  const groupPath = groupId.replace(/\./g, '/');
  const xml = await fetchText(`https://repo1.maven.org/maven2/${groupPath}/${artifactId}/maven-metadata.xml`);
  const release = xml.match(/<release>\s*([^<\s]+)\s*<\/release>/);
  if (release) return release[1];
  const latest = xml.match(/<latest>\s*([^<\s]+)\s*<\/latest>/);
  if (latest) return latest[1];
  const versions = [...xml.matchAll(/<version>\s*([^<\s]+)\s*<\/version>/g)].map((m) => m[1]);
  if (versions.length > 0) return versions[versions.length - 1];
  throw new Error(`No versions found for ${groupId}:${artifactId}`);
}

export type LibraryToggleMap = Record<string, boolean>;

export function isLibraryEnabled(
  id: string,
  settings?: Pick<SettingsData, 'externalLibraries'> | null,
  sessionOverride?: LibraryToggleMap | null
): boolean {
  if (sessionOverride && id in sessionOverride) return Boolean(sessionOverride[id]);
  const fromSettings = settings?.externalLibraries;
  if (fromSettings && id in fromSettings) return Boolean(fromSettings[id]);
  return getLibraryDef(id)?.defaultEnabled ?? false;
}

export function resolveEnabledLibraries(opts: {
  language?: ExternalLibraryLanguage;
  settings?: Pick<SettingsData, 'externalLibraries'> | null;
  sessionLibraries?: LibraryToggleMap | null;
  explicitIds?: string[] | null;
}): ExternalLibraryDef[] {
  if (opts.explicitIds) {
    const set = new Set(opts.explicitIds);
    return EXTERNAL_LIBRARIES.filter((l) => set.has(l.id) && (!opts.language || l.language === opts.language));
  }
  return EXTERNAL_LIBRARIES.filter(
    (l) => (!opts.language || l.language === opts.language) && isLibraryEnabled(l.id, opts.settings, opts.sessionLibraries)
  );
}

export function getPythonImportName(lib: ExternalLibraryDef): string {
  return (lib.pipImportName || lib.pipPackage || lib.id).trim();
}

export function getPythonPipPackage(lib: ExternalLibraryDef): string {
  return (lib.pipPackage || lib.id).trim();
}

export function getBlockedPythonImports(enabledIds?: string[] | null): string[] {
  const enabled = new Set((enabledIds || []).map((s) => s.toLowerCase()));
  return EXTERNAL_LIBRARIES.filter(
    (l) => l.kind === 'python-pip' && !enabled.has(l.id.toLowerCase())
  ).map((l) => getPythonImportName(l).toLowerCase());
}

export const BLOCKED_PYTHON_IMPORTS_ENV = 'LLD_BLOCKED_IMPORTS';

// sitecustomize entry: blocks disabled-lib imports. Must never raise here.
const PYTHON_IMPORT_GUARD_SOURCE = `import os as _os
import sys as _sys

def _lld_install_blocker():
    raw = _os.environ.get("${BLOCKED_PYTHON_IMPORTS_ENV}", "")
    blocked = set(p.strip().lower() for p in raw.split(",") if p.strip())
    if not blocked:
        return
    from importlib.abc import MetaPathFinder as _MetaPathFinder

    class _LldBlocker(_MetaPathFinder):
        def find_spec(self, name, path=None, target=None):
            root = (name or "").split(".")[0].lower()
            if root in blocked:
                raise ImportError(
                    root + " is disabled (Settings > External Libraries). "
                    "Enable it to use this package."
                )
            return None

    _sys.meta_path.insert(0, _LldBlocker())

try:
    _lld_install_blocker()
except Exception:
    pass
`;

export function ensurePythonImportGuardDir(): string {
  const dir = path.join(getAppDataDir(), 'python-guard');
  const file = path.join(dir, 'sitecustomize.py');
  let current = '';
  try {
    current = fs.readFileSync(file, 'utf-8');
  } catch {}
  if (current !== PYTHON_IMPORT_GUARD_SOURCE) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, PYTHON_IMPORT_GUARD_SOURCE, 'utf-8');
  }
  return dir;
}

export function pythonGuardEnv(basePythonPath: string, blockedImports: string[]): Record<string, string> {
  const dir = ensurePythonImportGuardDir();
  const base = (basePythonPath || '').trim();
  return {
    PYTHONPATH: base ? `${dir}${path.delimiter}${base}` : dir,
    [BLOCKED_PYTHON_IMPORTS_ENV]: blockedImports.join(','),
  };
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doGet = (target: string, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects downloading ' + url));
      const client = target.startsWith('https') ? https : http;
      const req = client.get(target, { headers: { 'User-Agent': 'lld-practice-harness' } }, (res) => {
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const next = new URL(res.headers.location, target).toString();
          res.resume();
          doGet(next, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Download failed (${res.statusCode}) for ${target}`));
          return;
        }
        const tmp = dest + '.part';
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            try {
              fs.renameSync(tmp, dest);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });
        out.on('error', (e) => {
          try { fs.unlinkSync(tmp); } catch {}
          reject(e);
        });
      });
      req.on('error', reject);
      req.setTimeout(60000, () => {
        req.destroy(new Error('Download timed out: ' + target));
      });
    };
    doGet(url);
  });
}

export async function ensureJavaLibraries(
  libs: ExternalLibraryDef[],
  onOutputChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void,
  force = false
): Promise<{ classpathEntries: string[]; warnings: string[] }> {
  const jars = libs.filter((l) => l.kind === 'java-jar');
  if (jars.length === 0) return { classpathEntries: [], warnings: [] };
  getLibsDir();
  const manifest = readManifest();
  const entries: string[] = [];
  const warnings: string[] = [];
  for (const lib of jars) {
    if (!lib.groupId || !lib.artifactId) {
      warnings.push(`${lib.name}: no Maven coordinates configured.`);
      continue;
    }
    const dest = getJavaJarPath(lib);
    const sourcesDest = getJavaSourcesJarPath(lib);
    const installedVersion = manifest[lib.id]?.version;
    const cached = fs.existsSync(dest) && !!installedVersion;
    if (cached && !force) {
      entries.push(dest);
      if (!fs.existsSync(sourcesDest) && installedVersion) {
        try {
          await downloadFile(mavenSourcesJarUrl(lib.groupId, lib.artifactId, installedVersion), sourcesDest);
        } catch {}
      }
      continue;
    }
    let targetVersion = installedVersion;
    try {
      targetVersion = await fetchLatestMavenVersion(lib.groupId, lib.artifactId);
    } catch (e: any) {
      if (cached) {
        entries.push(dest);
        continue;
      }
      warnings.push(`${lib.name}: could not resolve latest version (${e.message}). Check network connection.`);
      onOutputChunk?.(`Warning: could not resolve ${lib.name} version: ${e.message}\n`, 'stderr');
      continue;
    }
    if (cached && targetVersion === installedVersion) {
      entries.push(dest);
      if (!fs.existsSync(sourcesDest) && targetVersion) {
        try {
          await downloadFile(mavenSourcesJarUrl(lib.groupId, lib.artifactId, targetVersion), sourcesDest);
        } catch {}
      }
      continue;
    }
    try {
      onOutputChunk?.(`Downloading ${lib.name} ${targetVersion}...\n`, 'stdout');
      await downloadFile(mavenJarUrl(lib.groupId, lib.artifactId, targetVersion!), dest);
      try {
        await downloadFile(mavenSourcesJarUrl(lib.groupId, lib.artifactId, targetVersion!), sourcesDest);
      } catch {}
      writeManifestEntry(lib.id, targetVersion!);
      onOutputChunk?.(`${lib.name} ${targetVersion} ready.\n`, 'stdout');
      entries.push(dest);
    } catch (e: any) {
      warnings.push(`${lib.name}: download failed (${e.message}). Check network connection.`);
      onOutputChunk?.(`Warning: could not fetch ${lib.name}: ${e.message}\n`, 'stderr');
      if (fs.existsSync(dest)) entries.push(dest);
    }
  }
  return { classpathEntries: entries, warnings };
}

export function buildJavaClasspath(
  classesDirName: string,
  jarPaths: string[],
  platform: NodeJS.Platform = process.platform
): string {
  const sep = platform === 'win32' ? ';' : ':';
  return [classesDirName, ...jarPaths].join(sep);
}

export function getPipPackageVersion(pyBin: string, pkg: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  return new Promise((resolve) => {
    let stdout = '';
    try {
      const proc = spawn(pyBin, ['-m', 'pip', 'show', pkg], { env });
      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        resolve(undefined);
      }, 30000);
      proc.stdout?.on('data', (d) => { stdout += d.toString(); });
      proc.on('error', () => { clearTimeout(timer); resolve(undefined); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return resolve(undefined);
        const m = stdout.match(/^Version:\s*(.+)$/m);
        resolve(m ? m[1].trim() : undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

export interface EnsurePythonLibrariesOptions {
  pyBin: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  force?: boolean;
  onOutputChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}

export interface PythonLibraryResult {
  id: string;
  ok: boolean;
  message?: string;
  version?: string;
}

export async function ensurePythonLibraries(
  libs: ExternalLibraryDef[],
  options: EnsurePythonLibrariesOptions
): Promise<PythonLibraryResult[]> {
  const pyLibs = libs.filter((l) => l.kind === 'python-pip');
  if (pyLibs.length === 0) return [];

  const run = (args: string[], timeoutMs: number) =>
    new Promise<{ code: number; out: string; err: string }>((resolve) => {
      let out = '';
      let err = '';
      let settled = false;
      const done = (code: number) => {
        if (!settled) {
          settled = true;
          resolve({ code, out, err });
        }
      };
      try {
        const proc = spawn(options.pyBin, args, {
          env: options.env,
          cwd: options.cwd,
        });
        const timer = setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch {}
          err += '\nTimed out.';
          done(1);
        }, timeoutMs);
        proc.stdout?.on('data', (d) => {
          const str = d.toString();
          out += str;
          options.onOutputChunk?.(str, 'stdout');
        });
        proc.stderr?.on('data', (d) => {
          const str = d.toString();
          err += str;
          options.onOutputChunk?.(str, 'stderr');
        });
        proc.on('error', (e) => {
          clearTimeout(timer);
          err += e.message;
          done(1);
        });
        proc.on('close', (code) => {
          clearTimeout(timer);
          done(code === null ? 1 : code);
        });
      } catch (e: any) {
        err += e.message || String(e);
        done(1);
      }
    });

  const pipMissing = async () => {
    const v = await run(['-m', 'pip', '--version'], 30000);
    return v.code !== 0 && /No module named pip/i.test(`${v.out}\n${v.err}`);
  };

  if (await pipMissing()) {
    options.onOutputChunk?.('pip not found for this Python, bootstrapping with ensurepip...\n', 'stdout');
    await run(['-m', 'ensurepip', '--upgrade'], 120000);
  }

  const results: PythonLibraryResult[] = [];
  const env = options.env || process.env;

  for (const lib of pyLibs) {
    const importName = getPythonImportName(lib);
    const pkg = getPythonPipPackage(lib);
    const check = options.force === true
      ? { code: 1, out: '', err: '' }
      : await run(['-c', `import ${importName}`], 30000);

    if (check.code === 0) {
      const version = await getPipPackageVersion(options.pyBin, pkg, env);
      results.push({ id: lib.id, ok: true, version });
      continue;
    }

    options.onOutputChunk?.(`Installing Python package ${pkg} for ${lib.name}...\n`, 'stdout');
    const mkArgs = (extra: string[]) => ['-m', 'pip', 'install', ...extra, pkg];
    let inst = await run(mkArgs(options.force === true ? ['--upgrade'] : []), 600000);
    if (inst.code !== 0 && /externally-managed-environment/i.test(`${inst.out}\n${inst.err}`)) {
      options.onOutputChunk?.(`Retrying with --break-system-packages for ${lib.name}...\n`, 'stdout');
      inst = await run(
        mkArgs(options.force === true ? ['--upgrade', '--break-system-packages'] : ['--break-system-packages']),
        600000
      );
    }

    const tail = (inst.err || inst.out).trim().split('\n').slice(-4).join('\n').slice(0, 500);
    const noPip = /No module named pip/i.test(`${inst.out}\n${inst.err}`);
    if (inst.code !== 0) {
      if (noPip) {
        options.onOutputChunk?.(
          'Warning: this Python has no pip and bootstrapping failed. Run `python3 -m ensurepip --upgrade` or `sudo apt install python3-pip`, or point Settings → Python Path at a venv Python.\n',
          'stderr'
        );
      } else {
        options.onOutputChunk?.(
          `Warning: pip install failed for ${lib.name}: ${tail}\n`,
          'stderr'
        );
      }
    }

    const version = inst.code === 0 ? await getPipPackageVersion(options.pyBin, pkg, env) : undefined;
    results.push({
      id: lib.id,
      ok: inst.code === 0,
      message: inst.code === 0
        ? undefined
        : noPip
          ? 'This Python has no pip and bootstrapping failed. Run `python3 -m ensurepip --upgrade` or `sudo apt install python3-pip`, or point Settings → Python Path at a venv Python.'
          : `pip install failed: ${tail}`,
      version,
    });
  }

  return results;
}
