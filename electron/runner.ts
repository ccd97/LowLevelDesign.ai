import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { ProjectFile, storage } from './storage';
import { resolvePythonBinary, resolveJavaBinaries, getAugmentedEnv } from './pathResolver';
import { resolveEnabledLibraries, ensureJavaLibraries, ensurePythonLibraries, buildJavaClasspath, getBlockedPythonImports, pythonGuardEnv } from './externalLibraries';
import { ensureVenv } from './pythonEnv';

export interface RunOptions {
  sessionId: string;
  language: 'python' | 'java';
  files: ProjectFile[];
  entryPoint?: string;
  runType: 'run' | 'test';
  enabledLibraries?: string[];
  sessionLibraries?: Record<string, boolean>;
}

export interface RunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  status: 'passed' | 'failed' | 'error' | 'timeout';
}

export class CodeRunner {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(os.tmpdir(), 'lld_runs');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public async execute(
    options: RunOptions,
    onOutputChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void
  ): Promise<RunResult> {
    const sessionDir = path.join(this.baseDir, options.sessionId || 'default');
    
    // Clean & recreate directory
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    fs.mkdirSync(sessionDir, { recursive: true });

    // Write all project files
    for (const f of options.files) {
      if (f.isDirectory) {
        fs.mkdirSync(path.join(sessionDir, f.path), { recursive: true });
        continue;
      }
      const fullPath = path.join(sessionDir, f.path);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, f.content || '', 'utf-8');
    }

    const startTime = Date.now();

    if (options.language === 'python') {
      return this.runPython(sessionDir, options, onOutputChunk, startTime);
    } else {
      return this.runJava(sessionDir, options, onOutputChunk, startTime);
    }
  }

  private ensurePythonPackages(dir: string): void {
    // Ensure every directory on the import path is a package for absolute imports.
    const visit = (current: string) => {
      let entries: import('fs').Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch { return; }
      let hasPy = false;
      for (const e of entries) {
        if (e.isDirectory()) {
          if (e.name === '__pycache__' || e.name.startsWith('.')) continue;
          visit(path.join(current, e.name));
        } else if (e.name.endsWith('.py')) {
          hasPy = true;
        }
      }
      if (hasPy) {
        const init = path.join(current, '__init__.py');
        if (!fs.existsSync(init)) {
          try { fs.writeFileSync(init, '', 'utf-8'); } catch { /* ignore */ }
        }
      }
    };
    visit(dir);
  }

  private async runPython(
    dir: string,
    options: RunOptions,
    onOutputChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void,
    startTime: number = Date.now()
  ): Promise<RunResult> {
    this.ensurePythonPackages(dir);

    let targetFile = options.entryPoint;

    if (options.runType === 'test') {
      // Look for test file
      const testFiles = options.files
        .filter(f => !f.isDirectory && f.path.endsWith('.py') && (f.path.toLowerCase().includes('test') || f.path.startsWith('tests/')))
        .map(f => f.path);

      if (testFiles.length > 0) {
        targetFile = testFiles[0];
      }
    }

    if (!targetFile) {
      // Find default main or first python file
      const pyFiles = options.files.filter(f => !f.isDirectory && f.path.endsWith('.py'));
      const mainFile = pyFiles.find(f => f.path.toLowerCase().includes('main') || f.path.toLowerCase().includes('solution'));
      targetFile = mainFile ? mainFile.path : (pyFiles[0] ? pyFiles[0].path : 'solution.py');
    }

    const isTestMode = options.runType === 'test' && options.files.some(f => !f.isDirectory && f.path.endsWith('.py') && f.path.toLowerCase().includes('test'));
    const settings = storage.getSettings();
    const basePy = resolvePythonBinary(settings.pythonPath);
    let cmd = basePy;

    if ((settings.pythonPath || '').trim() === '') {
      const venvPy = await ensureVenv(basePy, onOutputChunk);
      if (venvPy) cmd = venvPy;
    }

    const enabledPyLibs = resolveEnabledLibraries({
      language: 'python',
      settings,
      sessionLibraries: options.sessionLibraries,
      explicitIds: options.enabledLibraries,
    }).filter((l) => l.kind === 'python-pip');
    if (enabledPyLibs.length > 0) {
      const env = getAugmentedEnv(settings, { ...process.env });
      await ensurePythonLibraries(enabledPyLibs, {
        pyBin: cmd,
        cwd: dir,
        env,
        onOutputChunk,
      });
    }

    // Installed-but-disabled libs must still fail on import (cf. Java classpath).
    const env = {
      ...pythonGuardEnv(dir, getBlockedPythonImports(enabledPyLibs.map((l) => l.id))),
      PYTHONUNBUFFERED: '1',
    };

    if (isTestMode && (!targetFile || targetFile.toLowerCase().includes('test'))) {
      // '-t .' sets the top-level directory so "from models.foo import X"
      // resolves when tests live in subdirectories.
      const result = await this.spawnProcess(cmd, ['-m', 'unittest', 'discover', '-s', '.', '-t', '.', '-p', '*test*.py', '-v'], dir, onOutputChunk, startTime, env);
      const combined = `${result.stdout}\n${result.stderr}`;
      const ranZero = /Ran 0 tests?/i.test(combined);
      const noUnittestCases = /no tests (were )?ran|no tests discovered|ImportError|ModuleNotFoundError/i.test(combined) && result.exitCode !== 0;
      // Fallback: if discover reports 0 tests, run the target file directly.
      if ((ranZero || noUnittestCases) && targetFile && fs.existsSync(path.join(dir, targetFile))) {
        onOutputChunk?.(`\nNote: unittest discover found no TestCase tests; running ${targetFile} directly...\n`, 'stdout');
        return this.spawnProcess(cmd, [targetFile], dir, onOutputChunk, startTime, env);
      }
      return result;
    }

    return this.spawnProcess(cmd, [targetFile], dir, onOutputChunk, startTime, env);
  }

  private async runJava(
    dir: string,
    options: RunOptions,
    onOutputChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void,
    startTime: number = Date.now()
  ): Promise<RunResult> {
    const classesDir = path.join(dir, 'classes');
    fs.mkdirSync(classesDir, { recursive: true });

    // Collect all .java files
    const javaFiles: string[] = [];
    const collectJavaFiles = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const res = path.resolve(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'classes') {
            collectJavaFiles(res);
          }
        } else if (entry.name.endsWith('.java')) {
          javaFiles.push(res);
        }
      }
    };
    collectJavaFiles(dir);

    if (javaFiles.length === 0) {
      return {
        success: false,
        stdout: '',
        stderr: 'No .java files found in workspace.',
        exitCode: 1,
        executionTimeMs: 0,
        status: 'error',
      };
    }

    // Strip package src declaration if present so compilation and runtime class names agree.
    for (const abs of javaFiles) {
      try {
        const content = fs.readFileSync(abs, 'utf-8');
        if (/^\s*package\s+src\s*;/mi.test(content)) {
          const fixed = content.replace(/^\s*package\s+src\s*;\s*/mi, '');
          fs.writeFileSync(abs, fixed, 'utf-8');
          onOutputChunk?.(`Note: removed bogus "package src;" from ${path.relative(dir, abs)}.\n`, 'stdout');
        }
      } catch { /* ignore */ }
    }

    // 1. Compile all Java files
    const settings = storage.getSettings();
    const javaBins = resolveJavaBinaries(settings.javaPath);
    const javaEnvOverrides: Record<string, string> = javaBins.javaHome ? { JAVA_HOME: javaBins.javaHome } : {};

    const enabledJavaLibs = resolveEnabledLibraries({
      language: 'java',
      settings,
      sessionLibraries: options.sessionLibraries,
      explicitIds: options.enabledLibraries,
    });
    const { classpathEntries: javaLibJars } = await ensureJavaLibraries(enabledJavaLibs, onOutputChunk);
    if (javaLibJars.length > 0) {
      onOutputChunk?.(`External libraries: ${enabledJavaLibs.map((l) => l.name).join(', ')}\n`, 'stdout');
    }

    onOutputChunk?.('Compiling Java sources...\n', 'stdout');
    const compileArgs =
      javaLibJars.length > 0
        ? ['-encoding', 'UTF-8', '-cp', javaLibJars.join(path.delimiter), '-processorpath', javaLibJars.join(path.delimiter), '-d', 'classes', ...javaFiles]
        : ['-encoding', 'UTF-8', '-d', 'classes', ...javaFiles];
    const compileResult = await this.spawnProcess(
      javaBins.javac,
      compileArgs,
      dir,
      onOutputChunk,
      startTime,
      javaEnvOverrides
    );

    if (!compileResult.success || compileResult.exitCode !== 0) {
      const rawErr = compileResult.stderr || compileResult.stdout;
      const hint = /package org\.(junit|testng|mockito)/i.test(rawErr)
        ? '\nHint: test file uses JUnit/TestNG/Mockito, which is not supported. Re-generate tests (framework-free asserts only).'
        : '';
      return {
        ...compileResult,
        status: 'error',
        stderr: `Compilation Error:\n${rawErr}${hint}`,
      };
    }

    // 2. Identify the class to execute (*Test.java or Test*.java, case-insensitive).
    const isTestFilePath = (p: string) => /test.*\.java$/i.test(p) || /.*test\.java$/i.test(p);
    const runtimeCp = buildJavaClasspath('classes', javaLibJars);

    const hasForbiddenFrameworkImport = (content: string): string | null => {
      if (/import\s+org\.junit/i.test(content)) return 'org.junit (JUnit)';
      if (/import\s+org\.testng/i.test(content)) return 'org.testng (TestNG)';
      if (/import\s+org\.mockito/i.test(content)) return 'org.mockito (Mockito)';
      return null;
    };

    // Test mode: run ALL classes in files ending with Test
    if (options.runType === 'test') {
      const testFiles = options.files.filter(
        (f) => !f.isDirectory && f.path.endsWith('.java') && isTestFilePath(f.path)
      );
      if (testFiles.length === 0) {
        return {
          success: false,
          stdout: '',
          stderr: 'No *Test.java files found in workspace.',
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          status: 'error',
        };
      }

      for (const tf of testFiles) {
        const bad = hasForbiddenFrameworkImport(tf.content || '');
        if (bad) {
          return {
            success: false,
            stdout: '',
            stderr: `Unsupported test import: ${tf.path} imports ${bad}, which is not on the classpath. Re-generate tests (framework-free asserts only, no JUnit/TestNG/Mockito).`,
            exitCode: 1,
            executionTimeMs: Date.now() - startTime,
            status: 'error',
          };
        }
      }

      let stdout = '';
      let stderr = '';
      let allPassed = true;
      let exitCode = 0;
      for (const testFile of testFiles) {
        const testClassName = this.extractClassNameFromFile(path.join(dir, testFile.path));
        const fallbacks = [...new Set([testClassName, path.basename(testFile.path, '.java')])];
        onOutputChunk?.(`Running ${testClassName}...\n`, 'stdout');
        // Enable assertions (-ea) so assert statement tests work natively
        let res: RunResult | null = null;
        for (const candidate of fallbacks) {
          res = await this.spawnProcess(
            javaBins.java,
            ['-ea', '-cp', runtimeCp, candidate],
            dir,
            onOutputChunk,
            startTime,
            javaEnvOverrides
          );
          // Retry with the bare class name when the package-qualified name
          // does not resolve (e.g. stale "package src;" vs default package).
          const notFound = /Could not find or load main class|ClassNotFoundException/i.test(`${res.stdout}\n${res.stderr}`);
          if (!notFound || candidate === fallbacks[fallbacks.length - 1]) break;
          onOutputChunk?.(`Class "${candidate}" not found, retrying as "${fallbacks[fallbacks.length - 1]}"...\n`, 'stdout');
        }
        stdout += res!.stdout;
        stderr += res!.stderr;
        if (!res!.success) {
          allPassed = false;
          exitCode = res!.exitCode;
        }
      }
      return {
        success: allPassed,
        stdout,
        stderr,
        exitCode,
        executionTimeMs: Date.now() - startTime,
        status: allPassed ? 'passed' : 'failed',
      };
    }

    // Run mode: irrespective of active file. Only non-test files are
    // considered. If none declares a main, error out instead of falling
    // back to a Test file, entryPoint, or "Main".
    let mainClassName = '';
    const projectJavaFiles = options.files.filter((f) => !f.isDirectory && f.path.endsWith('.java'));
    const hasMain = (content: string) => /public\s+static\s+void\s+main\s*\(/.test(content || '');
    const runnableFiles = projectJavaFiles.filter((f) => !isTestFilePath(f.path));
    for (const f of runnableFiles) {
      if (hasMain(f.content || '')) {
        mainClassName = this.extractClassNameFromFile(path.join(dir, f.path));
        break;
      }
    }

    if (!mainClassName) {
      return {
        success: false,
        stdout: '',
        stderr: 'No main method found in non-test files.',
        exitCode: 1,
        executionTimeMs: Date.now() - startTime,
        status: 'error',
      };
    }

    onOutputChunk?.(`Running ${mainClassName}...\n`, 'stdout');

    // Enable assertions (-ea) so assert statement tests work natively
    return this.spawnProcess(
      javaBins.java,
      ['-ea', '-cp', runtimeCp, mainClassName],
      dir,
      onOutputChunk,
      startTime,
      javaEnvOverrides
    );
  }

  private extractClassNameFromFile(filePath: string): string {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Check for package statement
        const packageMatch = content.match(/package\s+([a-zA-Z0-9_.]+);/);
        const packagePrefix = packageMatch ? `${packageMatch[1]}.` : '';

        // Check for public class name
        const classMatch = content.match(/public\s+(?:class|enum|interface)\s+([a-zA-Z0-9_]+)/);
        if (classMatch) {
          return `${packagePrefix}${classMatch[1]}`;
        }
      }
    } catch (e) {
      // fallback
    }
    const base = path.basename(filePath, '.java');
    return base;
  }

  private spawnProcess(
    cmd: string,
    args: string[],
    cwd: string,
    onOutputChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void,
    startTime: number = Date.now(),
    envOverrides: Record<string, string> = {},
    timeoutMs: number = 15000
  ): Promise<RunResult> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let isTimeout = false;

      const settings = storage.getSettings();
      const env = getAugmentedEnv(settings, { ...process.env, ...envOverrides });

      const proc = spawn(cmd, args, {
        cwd,
        env,
      });

      const timeoutId = setTimeout(() => {
        isTimeout = true;
        proc.kill('SIGKILL');
      }, timeoutMs);

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        onOutputChunk?.(text, 'stdout');
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        onOutputChunk?.(text, 'stderr');
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        const errMsg = `Execution failed: ${err.message}\n`;
        stderr += errMsg;
        onOutputChunk?.(errMsg, 'stderr');
        resolve({
          success: false,
          stdout,
          stderr,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          status: 'error',
        });
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        const execTime = Date.now() - startTime;
        const exitCode = code === null ? 1 : code;

        let status: 'passed' | 'failed' | 'error' | 'timeout' = 'passed';
        if (isTimeout) {
          status = 'timeout';
          stderr += `\nProcess killed: execution timed out (exceeded ${Math.round(timeoutMs / 1000)} seconds limit).\n`;
        } else if (exitCode !== 0) {
          status = 'failed';
        }

        resolve({
          success: exitCode === 0 && !isTimeout,
          stdout,
          stderr,
          exitCode,
          executionTimeMs: execTime,
          status,
        });
      });
    });
  }
}

export const codeRunner = new CodeRunner();
