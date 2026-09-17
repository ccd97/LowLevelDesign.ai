import { Settings } from './settings';
import { SessionData, SessionSummary, FileItem, Language } from './session';

// Canonical renderer-side contract for window.electronAPI.
// NOTE: electron/preload.ts declares a matching ElectronAPI interface for the
// main process side. Keep the two in sync (all members required) — they are
// intentionally duplicated because neither tsconfig includes the other's dir.

export interface RunOptions {
  sessionId: string;
  language: Language;
  files: FileItem[];
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

export interface ElectronAPI {
  // Injected synchronously by preload (storage:get-settings-sync).
  initialSettings?: Settings;
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<boolean>;
  getSessionsList: () => Promise<SessionSummary[]>;
  getSession: (id: string) => Promise<SessionData | null>;
  saveSession: (session: SessionData) => Promise<boolean>;
  deleteSession: (id: string) => Promise<boolean>;
  runCode: (options: RunOptions) => Promise<RunResult>;
  onLogOutput: (callback: (data: { chunk: string; stream: 'stdout' | 'stderr' }) => void) => () => void;
  // Terminal & Workspace APIs
  syncWorkspaceFiles: (sessionId: string, files: FileItem[]) => Promise<string>;
  readWorkspaceFiles: (sessionId: string) => Promise<FileItem[]>;
  getTerminalCwd: (sessionId: string) => Promise<{ cwd: string; relCwd: string }>;
  executeTerminalCommand: (sessionId: string, command: string) => Promise<boolean>;
  sendTerminalInput: (sessionId: string, input: string) => Promise<boolean>;
  killTerminalProcess: (sessionId: string) => Promise<boolean>;
  resetTerminal: (sessionId: string) => Promise<{ cwd: string; relCwd: string }>;
  onTerminalOutput: (callback: (data: { sessionId: string; chunk: string; stream: 'stdout' | 'stderr' }) => void) => () => void;
  onTerminalExit: (callback: (data: { sessionId: string; exitCode: number; cwd: string; relCwd: string }) => void) => () => void;
  // STL IntelliSense APIs
  getIntellisenseHover: (query: {
    language: 'python' | 'java';
    symbol: string;
    context?: string;
    fileContent?: string;
    cursorLine?: number;
    projectFiles?: Array<{ path: string; content: string }>;
    enabledLibIds?: string[];
  }) => Promise<{
    signature: string;
    doc: string;
    detail?: string;
    moduleOrClass?: string;
  } | null>;
  getIntellisenseCompletions: (query: {
    language: 'python' | 'java';
    fileContent: string;
    filePath?: string;
    cursorLine: number;
    cursorColumn: number;
    prefix?: string;
    context?: string;
    isDot?: boolean;
    isAnnotation?: boolean;
    projectFiles?: Array<{ path: string; content: string }>;
    enabledLibIds?: string[];
  }) => Promise<{
    items: Array<{
      name: string;
      kind: 'Method' | 'Function' | 'Class' | 'Module' | 'Property' | 'Variable' | 'Field' | 'Keyword';
      signature?: string;
      detail?: string;
      doc?: string;
      insertText?: string;
      sortText?: string;
    }>;
  }>;
  getIntellisenseSignatureHelp: (query: {
    language: 'python' | 'java';
    funcName: string;
    context?: string;
    fileContent?: string;
    projectFiles?: Array<{ path: string; content: string }>;
    enabledLibIds?: string[];
  }) => Promise<{
    signature: string;
    doc?: string;
    parameters: Array<{ label: string; doc?: string }>;
  } | null>;
  getExternalLibraries: () => Promise<Array<{ id: string; language: string; kind: string; name: string; version: string; description: string; defaultEnabled: boolean }>>;
  ensureExternalLibraries: (args: { language?: 'java' | 'python'; sessionLibraries?: Record<string, boolean>; explicitIds?: string[]; force?: boolean }) => Promise<{ enabled: string[]; classpathEntries: string[]; runtimeCp: string; results?: Array<{ id: string; ok: boolean; message?: string; version?: string }> }>;
  getInstalledLibraries: () => Promise<Record<string, string>>;
  sendFeedback: (payload: Record<string, any>) => Promise<{ success: boolean; message: string }>;
}
