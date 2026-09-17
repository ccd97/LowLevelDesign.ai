import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import type { SettingsData } from './storage';

export function getAppDataDir(): string {
  try {
    if (app?.getPath) {
      return path.join(app.getPath('userData'), 'lld_harness_data');
    }
  } catch {}
  const electronFallback = path.join(os.homedir(), '.config', 'Electron', 'lld_harness_data');
  if (fs.existsSync(electronFallback)) return electronFallback;
  return path.join(os.homedir(), '.config', 'lld-practice-harness');
}

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export interface JavaBinaries {
  java: string;
  javac: string;
  javap: string;
  jimage?: string;
  binDir?: string;
  javaHome?: string;
}

export function resolvePythonBinary(configuredPath?: string): string {
  const trimmed = configuredPath?.trim();
  if (!trimmed) return 'python3';
  return expandHome(trimmed);
}

export function resolveJavaBinaries(configuredPath?: string): JavaBinaries {
  const trimmed = configuredPath?.trim();
  if (!trimmed) {
    return {
      java: 'java',
      javac: 'javac',
      javap: 'javap',
    };
  }

  const expanded = expandHome(trimmed);

  try {
    if (fs.existsSync(expanded)) {
      const stat = fs.statSync(expanded);
      if (stat.isDirectory()) {
        const binJava = path.join(expanded, 'bin', 'java');
        const rootJava = path.join(expanded, 'java');

        let binDir: string;
        let javaHome: string;

        if (fs.existsSync(binJava)) {
          binDir = path.join(expanded, 'bin');
          javaHome = expanded;
        } else if (fs.existsSync(rootJava)) {
          binDir = expanded;
          javaHome = path.dirname(expanded);
        } else {
          binDir = expanded;
          javaHome = expanded;
        }

        const java = fs.existsSync(path.join(binDir, 'java')) ? path.join(binDir, 'java') : 'java';
        const javac = fs.existsSync(path.join(binDir, 'javac')) ? path.join(binDir, 'javac') : 'javac';
        const javap = fs.existsSync(path.join(binDir, 'javap')) ? path.join(binDir, 'javap') : 'javap';
        const jimage = fs.existsSync(path.join(binDir, 'jimage')) ? path.join(binDir, 'jimage') : undefined;

        return { java, javac, javap, jimage, binDir, javaHome };
      } else {
        // It's a file pointing directly to a binary (e.g. /usr/lib/jvm/.../bin/java)
        const binDir = path.dirname(expanded);
        const java = expanded;
        const javac = fs.existsSync(path.join(binDir, 'javac')) ? path.join(binDir, 'javac') : 'javac';
        const javap = fs.existsSync(path.join(binDir, 'javap')) ? path.join(binDir, 'javap') : 'javap';
        const jimage = fs.existsSync(path.join(binDir, 'jimage')) ? path.join(binDir, 'jimage') : undefined;
        const javaHome = path.dirname(binDir);

        return { java, javac, javap, jimage, binDir, javaHome };
      }
    }
  } catch {
    // ignore filesystem errors
  }

  return {
    java: expanded,
    javac: 'javac',
    javap: 'javap',
  };
}

export function resolveShell(configuredPath?: string): string {
  const trimmed = configuredPath?.trim();
  if (!trimmed) {
    return process.env.SHELL || '/bin/bash';
  }
  return expandHome(trimmed);
}

export function getAugmentedEnv(settings?: SettingsData, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  if (!settings) return env;

  const pathEntries: string[] = [];

  if (settings.pythonPath?.trim()) {
    const py = expandHome(settings.pythonPath.trim());
    try {
      if (fs.existsSync(py)) {
        const stat = fs.statSync(py);
        const pyDir = stat.isDirectory() ? py : path.dirname(py);
        pathEntries.push(pyDir);
      }
    } catch {}
  }

  if (settings.javaPath?.trim()) {
    const javaBins = resolveJavaBinaries(settings.javaPath);
    if (javaBins.binDir) {
      pathEntries.push(javaBins.binDir);
    }
    if (javaBins.javaHome) {
      env.JAVA_HOME = javaBins.javaHome;
    }
  }

  if (pathEntries.length > 0) {
    const existingPath = env.PATH || '';
    env.PATH = `${pathEntries.join(path.delimiter)}${path.delimiter}${existingPath}`;
  }

  return env;
}
