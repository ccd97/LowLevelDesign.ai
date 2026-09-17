import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Terminal as TerminalIcon,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Square,
  Play,
  FlaskConical,
  CornerDownLeft
} from 'lucide-react';
import { FileItem } from '../types/session';
import { Settings } from '../types/settings';
import Ansi from 'ansi-to-react';
import { getEnabledLibraryIds } from '../services/externalLibraries';
import { isJavaTestPath } from '../utils/fileTree';
import { extractJavaClassName } from '../utils/codeAnalysis';
import {
  buildPythonRunCommand,
  buildPythonTestCommand,
  buildJavaRunCommand,
  buildJavaTestCommand,
} from '../utils/shellCommands';

interface TerminalPanelProps {
  sessionId: string;
  files: FileItem[];
  language: 'python' | 'java';
  activeFilePath?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onFilesChanged?: () => void;
  settings?: Settings;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  sessionId,
  files,
  language,
  activeFilePath,
  isCollapsed,
  onToggleCollapse,
  onFilesChanged,
  settings,
}) => {
  const INITIAL_BANNER =
    'LLD Practice - Developer Terminal\n\n';

  // Terminal state
  const [output, setOutput] = useState<string>(INITIAL_BANNER);
  const [currentInput, setCurrentInput] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [tempDraft, setTempDraft] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [relCwd, setRelCwd] = useState<string>('.');

  // DOM Refs
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on output change
  useEffect(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [output, isRunning]);

  // Initial CWD lookup
  useEffect(() => {
    window.electronAPI.getTerminalCwd(sessionId).then((res) => {
      if (res && res.relCwd) setRelCwd(res.relCwd);
    });
  }, [sessionId]);

  // Listen to terminal output chunks & process exit from IPC
  useEffect(() => {
    const cleanupOutput = window.electronAPI.onTerminalOutput((data) => {
      if (data.sessionId === sessionId) {
        setOutput((prev) => prev + data.chunk);
      }
    });

    const cleanupExit = window.electronAPI.onTerminalExit((data) => {
      if (data.sessionId === sessionId) {
        setIsRunning(false);
        if (data.relCwd) setRelCwd(data.relCwd);
        onFilesChanged?.();
      }
    });

    return () => {
      cleanupOutput?.();
      cleanupExit?.();
    };
  }, [sessionId, onFilesChanged]);

  // Reset terminal: stop any running process, clear the buffer,
  // and restore the working directory to the session root.
  const handleResetTerminal = useCallback(async () => {
    if (isRunning) {
      window.electronAPI.killTerminalProcess(sessionId);
      setIsRunning(false);
    }
    try {
      const res = await window.electronAPI.resetTerminal(sessionId);
      if (res && res.relCwd) setRelCwd(res.relCwd);
    } catch {
      setRelCwd('.');
    }
    setOutput(INITIAL_BANNER);
    setCurrentInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, sessionId]);

  // Execute command handler
  const executeCommand = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;

      if (isCollapsed) {
        onToggleCollapse();
      }

      // Built-in clear command resets the terminal (buffer + path)
      if (trimmed === 'clear') {
        await handleResetTerminal();
        return;
      }

      setHistory((prev) => (prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed]));
      setHistoryIndex(-1);

      const promptHeader = `\x1b[36mlld-studio\x1b[0m:\x1b[32m~/${relCwd === '.' ? '' : relCwd}\x1b[0m$ ${trimmed}\n`;
      setOutput((prev) => prev + promptHeader);

      // First sync current editor files to disk so terminal sees latest code
      try {
        await window.electronAPI.syncWorkspaceFiles(sessionId, files);
      } catch (err: any) {
        setOutput((prev) => prev + `Workspace sync error: ${err.message}\n`);
      }

      setIsRunning(true);
      try {
        await window.electronAPI.executeTerminalCommand(sessionId, trimmed);
      } catch (err: any) {
        setIsRunning(false);
        setOutput((prev) => prev + `Execution error: ${err.message}\n`);
      }
    },
    [isCollapsed, onToggleCollapse, relCwd, sessionId, files, handleResetTerminal]
  );

  // Send input (either new command or stdin)
  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isRunning) {
      window.electronAPI.sendTerminalInput(sessionId, currentInput);
      setOutput((prev) => prev + currentInput + '\n');
      setCurrentInput('');
      return;
    }

    const cmd = currentInput;
    setCurrentInput('');
    executeCommand(cmd);
  };

  // Process interrupt (Ctrl+C or Stop button)
  const handleInterrupt = () => {
    if (isRunning) {
      window.electronAPI.killTerminalProcess(sessionId);
      setOutput((prev) => prev + '\n\x1b[33m^C [Interrupted by user]\x1b[0m\n');
    } else {
      setOutput((prev) => prev + `\x1b[36mlld-studio\x1b[0m:\x1b[32m~/${relCwd}\x1b[0m$ ${currentInput}^C\n`);
      setCurrentInput('');
      setHistoryIndex(-1);
    }
  };

  // Keyboard navigation: History (Up/Down), Tab-completion, Ctrl+C, Ctrl+L
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      handleInterrupt();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      handleResetTerminal();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      if (historyIndex === -1) {
        setTempDraft(currentInput);
        const nextIdx = history.length - 1;
        setHistoryIndex(nextIdx);
        setCurrentInput(history[nextIdx]);
      } else if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCurrentInput(history[nextIdx]);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      if (historyIndex < history.length - 1) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setCurrentInput(history[nextIdx]);
      } else {
        setHistoryIndex(-1);
        setCurrentInput(tempDraft);
      }
      return;
    }

    // Tab completion for files (cwd-aware, like a real shell)
    if (e.key === 'Tab') {
      e.preventDefault();
      const parts = currentInput.split(' ');
      const lastToken = parts[parts.length - 1];
      if (!lastToken || lastToken.startsWith('-')) return;

      const keepPrefix = lastToken.startsWith('./') ? './' : '';
      const stripped = lastToken.replace(/^\.\//, '');
      const slashIdx = stripped.lastIndexOf('/');
      const dirPart = slashIdx >= 0 ? stripped.slice(0, slashIdx + 1) : '';
      const partial = slashIdx >= 0 ? stripped.slice(slashIdx + 1) : stripped;

      // Resolve the directory being completed, workspace-relative
      const cwdSegs = relCwd === '.' ? [] : relCwd.split('/');
      const baseSegs = [...cwdSegs];
      for (const seg of dirPart.split('/').filter(Boolean)) {
        if (seg === '..') baseSegs.pop();
        else if (seg !== '.') baseSegs.push(seg);
      }
      const dirPrefix = baseSegs.length > 0 ? baseSegs.join('/') + '/' : '';

      // Index all known entries (files + explicit/implicit dirs)
      const entries: { path: string; isDir: boolean }[] = files.map((f) => ({
        path: f.path,
        isDir: !!f.isDirectory,
      }));
      for (const f of files) {
        let d = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
        while (d && !entries.some((en) => en.path === d)) {
          entries.push({ path: d, isDir: true });
          d = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '';
        }
      }

      // Direct children of the resolved dir matching the partial
      const children = new Map<string, boolean>();
      for (const en of entries) {
        if (!en.path.startsWith(dirPrefix)) continue;
        const rest = en.path.slice(dirPrefix.length);
        if (!rest || rest.includes('/')) continue;
        children.set(rest, en.isDir);
      }
      if (partial.startsWith('.')) {
        for (const dot of ['.', '..']) {
          if (dot.startsWith(partial)) children.set(dot, true);
        }
      }
      let names = [...children.keys()].filter((n) => n.startsWith(partial)).sort();

      const applyCompletion = (completed: string, isDir: boolean) => {
        parts[parts.length - 1] = `${keepPrefix}${dirPart}${completed}${isDir ? '/' : ''}`;
        setCurrentInput(parts.join(' '));
      };

      if (names.length === 1) {
        applyCompletion(names[0], children.get(names[0]) ?? false);
        return;
      }
      if (names.length > 1) {
        // Complete the common prefix, otherwise list candidates
        let common = names[0];
        for (const n of names) {
          let i = 0;
          while (i < common.length && common[i] === n[i]) i++;
          common = common.slice(0, i);
        }
        if (common.length > partial.length) {
          parts[parts.length - 1] = `${keepPrefix}${dirPart}${common}`;
          setCurrentInput(parts.join(' '));
        } else {
          setOutput((prev) => prev + `\n${names.join('  ')}\n`);
        }
        return;
      }

      // Fallback: match by file basename across the workspace
      // (so `Sol<Tab>` finds `src/Solution.java` from the root)
      if (!stripped.includes('/')) {
        const baseMatches = entries
          .filter(
            (en) =>
              !en.isDir && (en.path.split('/').pop() || '').startsWith(partial)
          )
          .map((en) => en.path)
          .sort();
        if (baseMatches.length === 1) {
          parts[parts.length - 1] = `${keepPrefix}${baseMatches[0]}`;
          setCurrentInput(parts.join(' '));
        } else if (baseMatches.length > 1) {
          setOutput((prev) => prev + `\n${baseMatches.join('  ')}\n`);
        }
      }
    }
  };

  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

  const findJavaMainClass = (): string | null => {
    const javaFiles = files.filter((f) => !f.isDirectory && f.path.endsWith('.java'));
    const runnable = javaFiles.filter((f) => !isJavaTestPath(f.path));
    const withMain = runnable.find((f) => /public\s+static\s+void\s+main\s*\(/.test(f.content || ''));
    if (withMain) return extractJavaClassName(withMain.path, withMain.content || '');
    return null;
  };

  const findJavaTestClasses = (): string[] =>
    files
      .filter((f) => !f.isDirectory && f.path.endsWith('.java') && isJavaTestPath(f.path))
      .map((f) => extractJavaClassName(f.path, f.content || ''));

  const handleRunActiveFile = async () => {
    let target = activeFilePath;
    if (!target) {
      const match = files.find(
        (f) => !f.isDirectory && (f.path.endsWith('.py') || f.path.endsWith('.java'))
      );
      target = match ? match.path : language === 'python' ? 'solution.py' : 'src/Solution.java';
    }

    if (language === 'python') {
      executeCommand(buildPythonRunCommand(target, settings?.pythonPath));
    } else {
      const mainClass = findJavaMainClass();
      if (!mainClass) {
        executeCommand('echo "No main method found in non-test files."');
        return;
      }
      const cp = await resolveJavaRuntimeCp();
      executeCommand(buildJavaRunCommand(mainClass, cp.runtimeCp, cp.libsPart));
    }
  };

  const handleRunAllTests = async () => {
    if (language === 'python') {
      executeCommand(buildPythonTestCommand(settings?.pythonPath));
    } else {
      const testClasses = findJavaTestClasses();
      if (testClasses.length === 0) {
        executeCommand('echo "No *Test.java files found in workspace."');
        return;
      }
      const cp = await resolveJavaRuntimeCp();
      executeCommand(buildJavaTestCommand(testClasses, cp.runtimeCp, cp.libsPart));
    }
  };

  const resolveJavaRuntimeCp = async (): Promise<{ runtimeCp: string; libsPart: string }> => {
    try {
      const res = await window.electronAPI.ensureExternalLibraries({
        language: 'java',
        explicitIds: getEnabledLibraryIds(language, settings?.externalLibraries, undefined),
      });
      const libsPart = (res.classpathEntries || []).join(':');
      return { runtimeCp: res.runtimeCp || 'classes', libsPart };
    } catch {}
    return { runtimeCp: 'classes', libsPart: '' };
  };

  return (
      <div
        className={`border-t border-slate-200/80 dark:border-white/[0.06] bg-[#f8fafc] dark:bg-[#101013] flex flex-col h-full relative select-none ${
          isCollapsed ? 'h-9' : ''
        }`}
      >

      {/* Terminal Header Bar */}
      <div className="h-9 px-3 flex items-center justify-between bg-slate-100/70 dark:bg-[#131316] border-b border-slate-200/80 dark:border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white"
          >
            <TerminalIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Terminal</span>
            {isCollapsed ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
            )}
          </button>

          {/* Current Working Directory Badge */}
          {!isCollapsed && (
            <span className="text-[11px] font-mono text-slate-600 dark:text-zinc-400 bg-slate-200/70 dark:bg-zinc-800/60 px-2 py-0.5 rounded border border-slate-200 dark:border-white/10">
              ~/{relCwd === '.' ? '' : relCwd}
            </span>
          )}

          {/* Status Badge */}
          {isRunning ? (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/40 animate-pulse font-medium">
                Running
              </span>
              <button
                onClick={handleInterrupt}
                title="Stop process (Ctrl+C)"
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-colors"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Idle</span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Quick Run Buttons */}
          {!isCollapsed && (
            <>
              <button
                onClick={handleRunActiveFile}
                disabled={isRunning}
                title="Run active file in terminal"
                className="flex items-center gap-1 px-2 py-1 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white rounded text-[11px] font-medium transition-colors disabled:opacity-40"
              >
                <Play className="w-3 h-3 text-emerald-600 dark:text-emerald-400 fill-emerald-500/20" />
                <span>Run</span>
              </button>

              <button
                onClick={handleRunAllTests}
                disabled={isRunning}
                title="Run test suite in terminal"
                className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 dark:bg-emerald-600/20 hover:bg-emerald-500/20 dark:hover:bg-emerald-600/30 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 dark:border-emerald-500/40 rounded text-[11px] font-medium transition-colors disabled:opacity-40"
              >
                <FlaskConical className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Run Tests</span>
              </button>

              <div className="h-3.5 w-[1px] bg-slate-300 dark:bg-zinc-700 mx-1" />
            </>
          )}

          {/* Reset Terminal */}
          <button
            onClick={handleResetTerminal}
            title="Reset Terminal (Ctrl+L)"
            className="p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 rounded transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Screen Body */}
      {!isCollapsed && (
        <div
          onClick={handleTerminalClick}
          className="flex-1 p-3 overflow-y-auto font-mono text-xs text-slate-800 dark:text-zinc-200 leading-relaxed cursor-text select-text bg-slate-50 dark:bg-[#0f0f12] flex flex-col justify-between"
          ref={terminalScrollRef}
        >
          <div className="whitespace-pre-wrap break-all select-text selection:bg-blue-500/30 dark:selection:bg-blue-600/40 selection:text-slate-900 dark:selection:text-white">
            <Ansi>{output}</Ansi>
          </div>

          {/* Interactive Prompt & Input Line */}
          <form onSubmit={handleInputSubmit} className="flex items-center gap-1.5 mt-2 shrink-0">
            {isRunning ? (
              <span className="text-amber-600 dark:text-amber-400 font-bold shrink-0">&gt;</span>
            ) : (
              <div className="flex items-center shrink-0">
                <span className="text-cyan-700 dark:text-cyan-400 font-semibold">lld-studio</span>
                <span className="text-slate-400 dark:text-zinc-500">:</span>
                <span className="text-emerald-600 dark:text-emerald-400">~/{relCwd === '.' ? '' : relCwd}</span>
                <span className="text-slate-400 dark:text-zinc-400 mr-1.5">$</span>
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isRunning
                  ? 'Send input to running process (stdin)...'
                  : 'Type a shell command (e.g. python3 solution.py, ls, pytest)...'
              }
              className="flex-1 bg-transparent text-slate-900 dark:text-zinc-100 outline-none text-xs font-mono placeholder:text-slate-400 dark:placeholder:text-zinc-600 placeholder:italic caret-blue-500 dark:caret-blue-400"
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />

            <button
              type="submit"
              className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 p-0.5"
              title="Submit command (Enter)"
            >
              <CornerDownLeft className="w-3 h-3" />
            </button>
          </form>
        </div>
      )}
    </div>
);
};
