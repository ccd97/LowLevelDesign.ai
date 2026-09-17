import { contextBridge, ipcRenderer } from 'electron';
import type { SettingsData, SessionData, SessionSummary, ProjectFile } from './storage';
import type { RunOptions, RunResult } from './runner';
import type {
  IntellisenseHoverQuery,
  IntellisenseHoverResult,
  IntellisenseCompletionQuery,
  IntellisenseCompletionResult,
  IntellisenseSignatureHelpQuery,
  IntellisenseSignatureHelpResult,
} from './intellisenseService';

let initialSettings: SettingsData | null = null;
try {
  initialSettings = ipcRenderer.sendSync('storage:get-settings-sync');
} catch (e) {
  console.error('Failed to get initial settings synchronously in preload:', e);
}

const initialTheme = initialSettings?.theme || 'dark';
const applyInitialTheme = () => {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(initialTheme);
  }
};
applyInitialTheme();
if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyInitialTheme, { once: true });
}

export interface ElectronAPI {
  // NOTE: must stay in sync with src/types/electron.ts (all members required).
  initialSettings?: SettingsData;
  getSettings: () => Promise<SettingsData>;
  saveSettings: (settings: SettingsData) => Promise<boolean>;
  getSessionsList: () => Promise<SessionSummary[]>;
  getSession: (id: string) => Promise<SessionData | null>;
  saveSession: (session: SessionData) => Promise<boolean>;
  deleteSession: (id: string) => Promise<boolean>;
  runCode: (options: RunOptions) => Promise<RunResult>;
  onLogOutput: (callback: (data: { chunk: string; stream: 'stdout' | 'stderr' }) => void) => () => void;
  // Terminal & Workspace APIs
  syncWorkspaceFiles: (sessionId: string, files: ProjectFile[]) => Promise<string>;
  readWorkspaceFiles: (sessionId: string) => Promise<ProjectFile[]>;
  getTerminalCwd: (sessionId: string) => Promise<{ cwd: string; relCwd: string }>;
  executeTerminalCommand: (sessionId: string, command: string) => Promise<boolean>;
  sendTerminalInput: (sessionId: string, input: string) => Promise<boolean>;
  killTerminalProcess: (sessionId: string) => Promise<boolean>;
  resetTerminal: (sessionId: string) => Promise<{ cwd: string; relCwd: string }>;
  onTerminalOutput: (callback: (data: { sessionId: string; chunk: string; stream: 'stdout' | 'stderr' }) => void) => () => void;
  onTerminalExit: (callback: (data: { sessionId: string; exitCode: number; cwd: string; relCwd: string }) => void) => () => void;
  // STL IntelliSense APIs
  getIntellisenseHover: (query: IntellisenseHoverQuery) => Promise<IntellisenseHoverResult | null>;
  getIntellisenseCompletions: (query: IntellisenseCompletionQuery) => Promise<IntellisenseCompletionResult>;
  getIntellisenseSignatureHelp: (query: IntellisenseSignatureHelpQuery) => Promise<IntellisenseSignatureHelpResult | null>;
  getExternalLibraries: () => Promise<Array<{ id: string; language: string; kind: string; name: string; version: string; description: string; defaultEnabled: boolean }>>;
  ensureExternalLibraries: (args: { language?: 'java' | 'python'; sessionLibraries?: Record<string, boolean>; explicitIds?: string[]; force?: boolean }) => Promise<{ enabled: string[]; classpathEntries: string[]; runtimeCp: string; results?: Array<{ id: string; ok: boolean; message?: string; version?: string }> }>;
  getInstalledLibraries: () => Promise<Record<string, string>>;
  sendFeedback: (payload: Record<string, any>) => Promise<{ success: boolean; message: string }>;
}

const api: ElectronAPI = {
  initialSettings: initialSettings ?? undefined,
  getSettings: () => ipcRenderer.invoke('storage:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('storage:save-settings', settings),
  getSessionsList: () => ipcRenderer.invoke('storage:get-sessions-list'),
  getSession: (id) => ipcRenderer.invoke('storage:get-session', id),
  saveSession: (session) => ipcRenderer.invoke('storage:save-session', session),
  deleteSession: (id) => ipcRenderer.invoke('storage:delete-session', id),
  runCode: (options) => ipcRenderer.invoke('runner:execute', options),
  onLogOutput: (callback) => {
    const listener = (_event: any, data: { chunk: string; stream: 'stdout' | 'stderr' }) => {
      callback(data);
    };
    ipcRenderer.on('runner:log-output', listener);
    return () => {
      ipcRenderer.removeListener('runner:log-output', listener);
    };
  },
  syncWorkspaceFiles: (sessionId, files) => ipcRenderer.invoke('terminal:sync-files', sessionId, files),
  readWorkspaceFiles: (sessionId) => ipcRenderer.invoke('terminal:read-files', sessionId),
  getTerminalCwd: (sessionId) => ipcRenderer.invoke('terminal:get-cwd', sessionId),
  executeTerminalCommand: (sessionId, command) => ipcRenderer.invoke('terminal:execute', sessionId, command),
  sendTerminalInput: (sessionId, input) => ipcRenderer.invoke('terminal:input', sessionId, input),
  killTerminalProcess: (sessionId) => ipcRenderer.invoke('terminal:kill', sessionId),
  resetTerminal: (sessionId) => ipcRenderer.invoke('terminal:reset', sessionId),
  onTerminalOutput: (callback) => {
    const listener = (_event: any, data: { sessionId: string; chunk: string; stream: 'stdout' | 'stderr' }) => {
      callback(data);
    };
    ipcRenderer.on('terminal:output', listener);
    return () => {
      ipcRenderer.removeListener('terminal:output', listener);
    };
  },
  onTerminalExit: (callback) => {
    const listener = (_event: any, data: { sessionId: string; exitCode: number; cwd: string; relCwd: string }) => {
      callback(data);
    };
    ipcRenderer.on('terminal:exit', listener);
    return () => {
      ipcRenderer.removeListener('terminal:exit', listener);
    };
  },
  getIntellisenseHover: (query) => ipcRenderer.invoke('intellisense:hover', query),
  getIntellisenseCompletions: (query) => ipcRenderer.invoke('intellisense:completions', query),
  getIntellisenseSignatureHelp: (query) => ipcRenderer.invoke('intellisense:signature-help', query),
  getExternalLibraries: () => ipcRenderer.invoke('libs:list'),
  ensureExternalLibraries: (args) => ipcRenderer.invoke('libs:ensure', args),
  getInstalledLibraries: () => ipcRenderer.invoke('libs:installed'),
  sendFeedback: (payload) => ipcRenderer.invoke('feedback:send', payload),
};

contextBridge.exposeInMainWorld('electronAPI', api);
