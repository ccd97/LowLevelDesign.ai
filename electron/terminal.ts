import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { ProjectFile, storage } from './storage';
import { getAppDataDir, resolveShell, getAugmentedEnv } from './pathResolver';
import { resolveEnabledLibraries, getBlockedPythonImports, pythonGuardEnv } from './externalLibraries';

interface TerminalState {
  workspaceDir: string;
  currentCwd: string;
  activeProcess: ChildProcess | null;
}

export class TerminalManager {
  private baseWorkspacesDir: string;
  private states: Map<string, TerminalState> = new Map();

  constructor() {
    this.baseWorkspacesDir = path.join(getAppDataDir(), 'workspaces');
    if (!fs.existsSync(this.baseWorkspacesDir)) {
      fs.mkdirSync(this.baseWorkspacesDir, { recursive: true });
    }
  }

  private getState(sessionId: string): TerminalState {
    let state = this.states.get(sessionId);
    if (!state) {
      const workspaceDir = path.join(this.baseWorkspacesDir, sessionId || 'default');
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }
      state = {
        workspaceDir,
        currentCwd: workspaceDir,
        activeProcess: null,
      };
      this.states.set(sessionId, state);
    }
    return state;
  }

  public getCwd(sessionId: string): string {
    return this.getState(sessionId).currentCwd;
  }

  public getRelCwd(sessionId: string): string {
    const state = this.getState(sessionId);
    const rel = path.relative(state.workspaceDir, state.currentCwd);
    return rel === '' ? '.' : rel;
  }

  /**
   * Syncs files from the application session into the physical workspace folder.
   */
  public syncFilesToDisk(sessionId: string, files: ProjectFile[]): string {
    const state = this.getState(sessionId);
    const workspaceDir = state.workspaceDir;

    // Keep track of valid paths in the session
    const validRelPaths = new Set<string>();
    for (const f of files) {
      validRelPaths.add(f.path);
      let p = path.dirname(f.path);
      while (p && p !== '.' && p !== '/') {
        validRelPaths.add(p);
        p = path.dirname(p);
      }
    }

    for (const file of files) {
      const fullPath = path.join(workspaceDir, file.path);
      if (file.isDirectory) {
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
        continue;
      }
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, file.content || '', 'utf-8');
    }

    // Clean up any files on disk that were renamed or deleted
    const ignoredNames = new Set([
      '.git',
      '__pycache__',
      '.pytest_cache',
      'classes',
      '.DS_Store',
      '.idea',
      '.vscode',
      'node_modules',
    ]);

    const cleanObsolete = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignoredNames.has(entry.name) || entry.name.endsWith('.class') || entry.name.endsWith('.pyc')) {
          continue;
        }
        const full = path.join(dir, entry.name);
        const rel = path.relative(workspaceDir, full);
        if (entry.isDirectory()) {
          cleanObsolete(full);
          if (!validRelPaths.has(rel)) {
            try {
              if (fs.readdirSync(full).length === 0) {
                fs.rmdirSync(full);
              }
            } catch {}
          }
        } else {
          if (!validRelPaths.has(rel)) {
            try {
              fs.unlinkSync(full);
            } catch {}
          }
        }
      }
    };
    cleanObsolete(workspaceDir);

    return workspaceDir;
  }

  /**
   * Reads files from the workspace directory back into ProjectFile[]
   * to reflect any additions/changes made via shell commands.
   */
  public readFilesFromDisk(sessionId: string): ProjectFile[] {
    const state = this.getState(sessionId);
    const workspaceDir = state.workspaceDir;
    if (!fs.existsSync(workspaceDir)) return [];

    const projectFiles: ProjectFile[] = [];
    const ignoredNames = new Set([
      '.git',
      '__pycache__',
      '.pytest_cache',
      'classes',
      '.DS_Store',
      '.idea',
      '.vscode',
      'node_modules',
    ]);

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignoredNames.has(entry.name) || entry.name.endsWith('.class') || entry.name.endsWith('.pyc')) {
          continue;
        }
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(workspaceDir, fullPath);

        if (entry.isDirectory()) {
          projectFiles.push({
            path: relPath,
            content: '',
            isDirectory: true,
          });
          walk(fullPath);
        } else {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            projectFiles.push({
              path: relPath,
              content,
              isDirectory: false,
            });
          } catch {
            // Skip binary or unreadable files
          }
        }
      }
    };

    walk(workspaceDir);
    return projectFiles;
  }

  /**
   * Executes a shell command in the session's current working directory.
   */
  public executeCommand(
    sessionId: string,
    command: string,
    onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void,
    onExit: (exitCode: number, cwd: string) => void
  ): boolean {
    const state = this.getState(sessionId);

    const trimmed = command.trim();
    if (!trimmed) {
      onExit(0, state.currentCwd);
      return true;
    }

    // If a process is already running, prevent spawning another one
    if (state.activeProcess) {
      onOutput('A process is currently running. Use Stop or Ctrl+C to terminate it first.\n', 'stderr');
      onExit(1, state.currentCwd);
      return false;
    }

    // Built-in cd implementation to track session working directory
    if (trimmed === 'cd' || trimmed === 'cd ~') {
      state.currentCwd = state.workspaceDir;
      onExit(0, state.currentCwd);
      return true;
    }

    if (trimmed.startsWith('cd ')) {
      const rawTarget = trimmed.substring(3).trim().replace(/^["']|["']$/g, '');
      let resolved: string;
      if (rawTarget.startsWith('~')) {
        resolved = path.join(state.workspaceDir, rawTarget.replace(/^~[/\\]?/, ''));
      } else {
        resolved = path.resolve(state.currentCwd, rawTarget);
      }

      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        state.currentCwd = resolved;
        onExit(0, state.currentCwd);
      } else {
        onOutput(`bash: cd: ${rawTarget}: No such file or directory\n`, 'stderr');
        onExit(1, state.currentCwd);
      }
      return true;
    }

    // Spawn shell process
    const settings = storage.getSettings();
    const shellPath = resolveShell(settings.terminalShellPath);
    // Same import guard as runner:execute.
    const blockedPythonImports = getBlockedPythonImports(
      resolveEnabledLibraries({ language: 'python', settings }).map((l) => l.id)
    );
    const env = getAugmentedEnv(settings, {
      ...process.env,
      ...pythonGuardEnv(`${state.currentCwd}${path.delimiter}${state.workspaceDir}`, blockedPythonImports),
      PYTHONUNBUFFERED: '1',
      TERM: 'xterm-256color',
    });
    const proc = spawn(shellPath, ['-c', command], {
      cwd: state.currentCwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    state.activeProcess = proc;

    proc.stdout?.on('data', (data) => {
      onOutput(data.toString(), 'stdout');
    });

    proc.stderr?.on('data', (data) => {
      onOutput(data.toString(), 'stderr');
    });

    proc.on('error', (err) => {
      state.activeProcess = null;
      onOutput(`Failed to launch process: ${err.message}\n`, 'stderr');
      onExit(1, state.currentCwd);
    });

    proc.on('close', (code) => {
      state.activeProcess = null;
      onExit(code === null ? 1 : code, state.currentCwd);
    });

    return true;
  }

  /**
   * Sends user input into the active process's stdin.
   */
  public sendInput(sessionId: string, input: string): boolean {
    const state = this.getState(sessionId);
    if (state.activeProcess && state.activeProcess.stdin && !state.activeProcess.stdin.destroyed) {
      state.activeProcess.stdin.write(input + '\n');
      return true;
    }
    return false;
  }

  /**
   * Resets the session terminal: kills any active process and
   * restores the working directory to the session workspace root.
   */
  public reset(sessionId: string): { cwd: string; relCwd: string } {
    const state = this.getState(sessionId);
    if (state.activeProcess) {
      try {
        state.activeProcess.kill('SIGKILL');
      } catch {
        // already closed
      }
      state.activeProcess = null;
    }
    state.currentCwd = state.workspaceDir;
    return { cwd: state.currentCwd, relCwd: this.getRelCwd(sessionId) };
  }

  /**
   * Interrupts/kills the active process.
   */
  public killProcess(sessionId: string): boolean {
    const state = this.getState(sessionId);
    if (!state.activeProcess) return false;

    const proc = state.activeProcess;
    proc.kill('SIGINT');

    // Force kill if it doesn't terminate within 400ms
    setTimeout(() => {
      if (state.activeProcess === proc) {
        try {
          proc.kill('SIGKILL');
        } catch {
          // already closed
        }
        state.activeProcess = null;
      }
    }, 400);

    return true;
  }
}

export const terminalManager = new TerminalManager();
