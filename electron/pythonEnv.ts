import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getAppDataDir } from './pathResolver';

export function getVenvDir(): string {
  return path.join(getAppDataDir(), 'python-env');
}

export function getVenvPython(venvDir: string = getVenvDir()): string {
  return process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
}

export function venvExists(venvDir: string = getVenvDir()): boolean {
  try {
    return fs.existsSync(getVenvPython(venvDir));
  } catch {
    return false;
  }
}

export function resolveVenvOrBase(basePython: string): string {
  return venvExists() ? getVenvPython() : basePython;
}

function runCmd(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
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
      const proc = spawn(cmd, args);
      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        err += '\nTimed out.';
        done(1);
      }, timeoutMs);
      proc.stdout?.on('data', (d) => { out += d.toString(); });
      proc.stderr?.on('data', (d) => { err += d.toString(); });
      proc.on('error', (e) => { clearTimeout(timer); err += e.message; done(1); });
      proc.on('close', (code) => { clearTimeout(timer); done(code === null ? 1 : code); });
    } catch (e: any) {
      err += e.message || String(e);
      done(1);
    }
  });
}

export async function ensureVenv(
  basePython: string,
  onOutputChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void
): Promise<string | null> {
  const dir = getVenvDir();
  if (venvExists(dir)) return getVenvPython(dir);
  onOutputChunk?.('Creating isolated Python environment (one-time setup)...\n', 'stdout');
  await runCmd(basePython, ['-m', 'venv', dir], 300000);
  if (!venvExists(dir)) {
    onOutputChunk?.(
      'Warning: could not create an isolated Python environment (is python3-venv installed?). Falling back to system Python.\n',
      'stderr'
    );
    return null;
  }
  const venvPy = getVenvPython(dir);
  await runCmd(venvPy, ['-m', 'pip', 'install', '--upgrade', 'pip'], 300000);
  return venvPy;
}
