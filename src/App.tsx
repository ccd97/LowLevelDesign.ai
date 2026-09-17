import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ProblemPanel } from './components/ProblemPanel';
import { FileExplorer } from './components/FileExplorer';
import { CodeEditor } from './components/CodeEditor';
import { TerminalPanel } from './components/TerminalPanel';
import { LandingPage } from './components/LandingPage';
import { SettingsModal } from './components/SettingsModal';
import { NewSessionModal } from './components/NewSessionModal';
import { EvaluationModal } from './components/EvaluationModal';
import { FeedbackModal } from './components/FeedbackModal';
import { SessionData, SessionSummary, FileItem, ChatMessage } from './types/session';
import { Settings, DEFAULT_SETTINGS } from './types/settings';
import { openRouterService } from './services/openrouter';
import { sanitizeProblemStatement } from './utils/problemText';
import {
  isTestFilePath,
  renameFileInTree,
  renameTabsInTree,
  renameActivePath,
  deleteFromTree,
  deleteTabsFromTree,
  hasProjectFilesChanged,
} from './utils/fileTree';
import { applyThemeInstantly } from './utils/theme';
import { PanelLeftOpen } from 'lucide-react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { getEnabledLibraryIds } from './services/externalLibraries';

export const App: React.FC = () => {
  // Settings & Sessions (Electron-only: storage lives in the main process)
  const [settings, setSettings] = useState<Settings>(() => {
    return { ...DEFAULT_SETTINGS, ...window.electronAPI.initialSettings };
  });
  const [sessionsList, setSessionsList] = useState<SessionSummary[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionData | null>(null);
  const [openFilePaths, setOpenFilePaths] = useState<string[]>([]);
  const [isLandingOpen, setIsLandingOpen] = useState<boolean>(true);
  const [isProblemHidden, setIsProblemHidden] = useState<boolean>(false);
  const [lastSessionId, setLastSessionId] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('lld_last_session_id') : null;
  });
  
  // Execution state (TerminalPanel owns the visible terminal; this only guards concurrent runs)
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState<boolean>(false);
  const consolePanelRef = usePanelRef();

  const handleToggleConsole = () => {
    const next = !isConsoleCollapsed;
    setIsConsoleCollapsed(next);
    if (next) {
      consolePanelRef.current?.collapse();
    } else {
      consolePanelRef.current?.expand();
    }
  };

  const handleConsoleResize = () => {
    const collapsed = consolePanelRef.current?.isCollapsed();
    if (collapsed === undefined) return;
    // Keep header chevron/body in sync when the user drag-collapses/expands.
    setIsConsoleCollapsed((prev) => {
      if (collapsed && !prev) return true;
      if (!collapsed && prev) return false;
      return prev;
    });
  };

  // LLM States
  const [isClarifying, setIsClarifying] = useState<boolean>(false);
  const [isGeneratingTests, setIsGeneratingTests] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evaluationStatus, setEvaluationStatus] = useState<string>('');

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isNewSessionOpen, setIsNewSessionOpen] = useState<boolean>(false);
  const [isEvaluationOpen, setIsEvaluationOpen] = useState<boolean>(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<boolean>(false);

  useEffect(() => {
    async function init() {
      try {
        const loadedSettings = await window.electronAPI.getSettings();
        if (loadedSettings) setSettings(loadedSettings);

        const list = await window.electronAPI.getSessionsList();
        setSessionsList(list);
      } catch (err) {
        console.error('Init error:', err);
      }
    }
    init();
  }, []);

  useEffect(() => {
    let timerId: NodeJS.Timeout;
    if (currentSession?.isTimerRunning) {
      timerId = setInterval(() => {
        setCurrentSession((prev) => {
          if (!prev || !prev.isTimerRunning) return prev;
          return { ...prev, timeSpentSeconds: prev.timeSpentSeconds + 1 };
        });
      }, 1000);
    }
    return () => clearInterval(timerId);
  }, [currentSession?.isTimerRunning]);

  useEffect(() => {
    if (currentSession) {
      window.electronAPI.syncWorkspaceFiles(currentSession.id, currentSession.files).catch((err) => {
        console.error('Failed to sync files to workspace:', err);
      });
    }
  }, [currentSession?.id]);

  const sessionRef = useRef<SessionData | null>(null);
  useEffect(() => {
    sessionRef.current = currentSession;
  }, [currentSession]);

  // Auto-save session content and sync files to disk (debounced)
  const sessionContentKey = currentSession
    ? JSON.stringify({
        id: currentSession.id,
        title: currentSession.title,
        language: currentSession.language,
        problemMode: currentSession.problemMode,
        timeBudget: currentSession.timeBudget,
        requireConcurrency: currentSession.requireConcurrency,
        problemStatement: currentSession.problemStatement,
        clarificationMessages: currentSession.clarificationMessages,
        files: currentSession.files,
        activeFilePath: currentSession.activeFilePath,
        lastTestOutput: currentSession.lastTestOutput,
        lastTestStatus: currentSession.lastTestStatus,
        evaluationReport: currentSession.evaluationReport,
      })
    : null;
  useEffect(() => {
    if (!currentSession || !sessionContentKey) return;
    const saveTimer = setTimeout(async () => {
      await window.electronAPI.saveSession(sessionRef.current ?? currentSession);
      const list = await window.electronAPI.getSessionsList();
      setSessionsList(list);
      const s = sessionRef.current ?? currentSession;
      await window.electronAPI.syncWorkspaceFiles(s.id, s.files);
    }, 1000);
    return () => clearTimeout(saveTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionContentKey]);

  // Periodic save (every 15s) so timer progress itself is persisted even
  // when content is untouched.
  useEffect(() => {
    const intervalId = setInterval(() => {
      const s = sessionRef.current;
      if (s) {
        window.electronAPI.saveSession(s).catch((err) => {
          console.error('Periodic save failed:', err);
        });
      }
    }, 15000);
    return () => clearInterval(intervalId);
  }, []);

  // Best-effort flush on window close / reload.
  useEffect(() => {
    const handleBeforeUnload = () => {
      const s = sessionRef.current;
      if (s) {
        window.electronAPI.saveSession(s).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Refresh files from disk after terminal commands or manual refresh
  const handleSyncFilesFromDisk = async () => {
    if (!currentSession) return;
    try {
      const diskFiles = await window.electronAPI.readWorkspaceFiles(currentSession.id);
      if (diskFiles && diskFiles.length > 0) {
        const hasDiff = hasProjectFilesChanged(currentSession.files, diskFiles);
        if (hasDiff) {
          setCurrentSession((prev) => {
            if (!prev) return null;
            const byPath = new Map(diskFiles.map((f) => [f.path, f]));
            const active = prev.activeFilePath ? byPath.get(prev.activeFilePath) : undefined;
            const nextActive = active && !active.isDirectory
              ? prev.activeFilePath
              : diskFiles.find((f) => !f.isDirectory)?.path;
            return { ...prev, files: diskFiles, activeFilePath: nextActive };
          });
          // Drop tabs that were deleted or are directories (e.g. legacy
          // openFilePaths that included folders).
          setOpenFilePaths((prev) => {
            const validFiles = new Set(diskFiles.filter((f) => !f.isDirectory).map((f) => f.path));
            const pruned = prev.filter((p) => validFiles.has(p));
            // Ensure the active file stays open
            const active = currentSession.activeFilePath;
            if (active && validFiles.has(active) && !pruned.includes(active)) {
              pruned.push(active);
            }
            return pruned;
          });
        } else {
          // Even without content diff, prune any stale directory tabs.
          setOpenFilePaths((prev) => {
            const validFiles = new Set(diskFiles.filter((f) => !f.isDirectory).map((f) => f.path));
            return prev.filter((p) => validFiles.has(p));
          });
        }
      }
    } catch (err) {
      console.error('Error reading workspace files:', err);
    }
  };

  // Keyboard shortcut to toggle Problem panel (Ctrl+B / Cmd+B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsProblemHidden((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync theme with document root element instantly without animations
  useEffect(() => {
    applyThemeInstantly(settings.theme);
  }, [settings.theme]);

  // Save Settings (persisted in Electron storage)
  const handleSaveSettings = async (newSettings: Settings) => {
    setSettings(newSettings);
    await window.electronAPI.saveSettings(newSettings);
  };

  const handleToggleTheme = () => {
    const nextTheme = settings.theme === 'light' ? 'dark' : 'light';
    applyThemeInstantly(nextTheme);
    handleSaveSettings({
      ...settings,
      theme: nextTheme,
    });
  };

  // Select Session (Open Previous Project)
  const handleSelectSession = async (id: string) => {
    const session = await window.electronAPI.getSession(id);
    if (session) {
        const sanitized = sanitizeProblemStatement(session.problemStatement);
        session.problemStatement = sanitized.statement;
        if (sanitized.title && (!session.title || session.title.startsWith('{'))) {
          session.title = sanitized.title;
        }
        // Back-compat: pre-time-budget sessions stored `difficulty`
        if (!session.timeBudget) {
          const legacy = (session as any).difficulty;
          session.timeBudget = legacy === 'Easy' ? 45 : legacy === 'Hard' ? 120 : 60;
        }
        // Guard against stale activeFilePath pointing at a directory (or deleted file)
        const fileByPath = new Map(session.files.map((f) => [f.path, f]));
        const active = session.activeFilePath ? fileByPath.get(session.activeFilePath) : undefined;
        if (!active || active.isDirectory) {
          const firstFile = session.files.find((f) => !f.isDirectory);
          session.activeFilePath = firstFile?.path;
        }
        setCurrentSession(session);
        setLastSessionId(session.id);
        localStorage.setItem('lld_last_session_id', session.id);
        // Only restore the active file as an open tab — never auto-open all
        // files, and never open directories as tabs.
        setOpenFilePaths(session.activeFilePath ? [session.activeFilePath] : []);
        setIsLandingOpen(false);
    }
  };

  // Create New Session (Create New Project)
  const handleCreateSession = async (newSession: SessionData) => {
    setCurrentSession(newSession);
    setLastSessionId(newSession.id);
    localStorage.setItem('lld_last_session_id', newSession.id);
    const firstFile = newSession.files.find((f) => !f.isDirectory);
    const initialPath = newSession.activeFilePath && !newSession.files.find((f) => f.path === newSession.activeFilePath)?.isDirectory
      ? newSession.activeFilePath
      : firstFile?.path;
    setOpenFilePaths(initialPath ? [initialPath] : []);
    setIsLandingOpen(false);
    await window.electronAPI.saveSession(newSession);
    const list = await window.electronAPI.getSessionsList();
    setSessionsList(list);
  };

  // Delete Session
  const handleDeleteSession = async (id: string) => {
    await window.electronAPI.deleteSession(id);
    const list = await window.electronAPI.getSessionsList();
    setSessionsList(list);
    if (currentSession?.id === id) {
      setCurrentSession(null);
      setIsLandingOpen(true);
    }
    if (lastSessionId === id) {
      const nextId = list.find((s) => s.id !== id)?.id || null;
      setLastSessionId(nextId);
      if (nextId) localStorage.setItem('lld_last_session_id', nextId);
      else localStorage.removeItem('lld_last_session_id');
    }
  };

  // Close Start Box to open last session if possible
  const canCloseStartBox = Boolean(currentSession || (sessionsList.length > 0));

  const handleCloseStartBox = async () => {
    if (currentSession) {
      setIsLandingOpen(false);
      return;
    }
    const targetId = (lastSessionId && sessionsList.some((s) => s.id === lastSessionId))
      ? lastSessionId
      : sessionsList[0]?.id;
    if (targetId) {
      await handleSelectSession(targetId);
      setIsLandingOpen(false);
    }
  };

  // Timer Handlers
  const handleToggleTimer = () => {
    if (!currentSession) return;
    setCurrentSession((prev) => prev ? { ...prev, isTimerRunning: !prev.isTimerRunning } : null);
  };

  const handleResetTimer = () => {
    if (!currentSession) return;
    setCurrentSession((prev) => prev ? { ...prev, timeSpentSeconds: 0 } : null);
  };

  // File Operations
  const handleSelectFile = (path: string) => {
    const target = currentSession?.files.find((f) => f.path === path);
    // Never open directories as tabs — folder clicks only expand/collapse.
    if (!target || target.isDirectory) return;
    if (!openFilePaths.includes(path)) {
      setOpenFilePaths((prev) => [...prev, path]);
    }
    setCurrentSession((prev) => prev ? { ...prev, activeFilePath: path } : null);
  };

  const handleCloseTab = (path: string) => {
    const nextTabs = openFilePaths.filter((p) => p !== path);
    setOpenFilePaths(nextTabs);
    if (currentSession?.activeFilePath === path) {
      setCurrentSession((prev) =>
        prev ? { ...prev, activeFilePath: nextTabs[nextTabs.length - 1] || undefined } : null
      );
    }
  };

  const handleCodeChange = (path: string, newContent: string) => {
    if (!currentSession) return;
    const updatedFiles = currentSession.files.map((f) =>
      f.path === path ? { ...f, content: newContent } : f
    );
    setCurrentSession({ ...currentSession, files: updatedFiles });
  };

  const handleCreateFile = (filePath: string) => {
    if (!currentSession) return;
    const cleanPath = filePath.replace(/^\/+|\/+$/g, '');
    if (currentSession.files.some((f) => f.path === cleanPath)) return;

    const fileName = cleanPath.split('/').pop() || cleanPath;
    const className = fileName.replace(/\.[^/.]+$/, '');
    const newFile: FileItem = {
      path: cleanPath,
      content: cleanPath.endsWith('.py') ? '# New Python Module\n' : `public class ${className} {\n}\n`,
    };
    const files = [...currentSession.files, newFile];
    setCurrentSession({ ...currentSession, files, activeFilePath: cleanPath });
    setOpenFilePaths((prev) => [...prev, cleanPath]);
  };

  const handleCreateFolder = (folderPath: string) => {
    if (!currentSession) return;
    const cleanPath = folderPath.replace(/^\/+|\/+$/g, '');
    if (currentSession.files.some((f) => f.path === cleanPath)) return;
    const newFolder: FileItem = {
      path: cleanPath,
      content: '',
      isDirectory: true,
    };
    setCurrentSession({ ...currentSession, files: [...currentSession.files, newFolder] });
  };

  const handleRenameFile = (oldPath: string, newPath: string) => {
    if (!currentSession || oldPath === newPath) return;

    const files = renameFileInTree(currentSession.files, oldPath, newPath);
    const tabs = renameTabsInTree(openFilePaths, oldPath, newPath);
    const active = renameActivePath(currentSession.activeFilePath, oldPath, newPath);

    setCurrentSession({ ...currentSession, files, activeFilePath: active });
    setOpenFilePaths(tabs);

    window.electronAPI.syncWorkspaceFiles(currentSession.id, files).catch(console.error);
  };

  const handleDeleteFile = (path: string) => {
    if (!currentSession) return;
    const files = deleteFromTree(currentSession.files, path);
    const tabs = deleteTabsFromTree(openFilePaths, path);
    const active = currentSession.activeFilePath === path || currentSession.activeFilePath?.startsWith(`${path}/`)
      ? tabs[0]
      : currentSession.activeFilePath;
    setCurrentSession({ ...currentSession, files, activeFilePath: active });
    setOpenFilePaths(tabs);

    window.electronAPI.syncWorkspaceFiles(currentSession.id, files).catch(console.error);
  };

  // Interviewer Clarification Chat
  const handleSendClarification = async (question: string) => {
    if (!currentSession) return;
    if (!settings.openRouterApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: question,
      timestamp: Date.now(),
    };

    const updatedMessages = [...currentSession.clarificationMessages, userMsg];
    setCurrentSession({ ...currentSession, clarificationMessages: updatedMessages });
    setIsClarifying(true);

    try {
      const result = await openRouterService.clarifyQuestion({
        problemStatement: currentSession.problemStatement,
        problemMode: currentSession.problemMode,
        messages: updatedMessages,
        userQuestion: question,
        requireConcurrency: currentSession.requireConcurrency ?? false,
        apiKey: settings.openRouterApiKey,
        model: settings.openRouterModel,
      });

      const assistantMsg: ChatMessage = {
        id: 'msg_' + (Date.now() + 1),
        role: 'assistant',
        content: result.reply,
        timestamp: Date.now(),
      };

      setCurrentSession((prev) =>
        prev ? { ...prev, clarificationMessages: [...prev.clarificationMessages, assistantMsg] } : null
      );
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: 'msg_err_' + Date.now(),
        role: 'assistant',
        content: `Error communicating with interviewer: ${err.message}`,
        timestamp: Date.now(),
      };
      setCurrentSession((prev) =>
        prev ? { ...prev, clarificationMessages: [...prev.clarificationMessages, errorMsg] } : null
      );
    } finally {
      setIsClarifying(false);
    }
  };

  // Code & Test Execution
  const runCodeInternal = async (runType: 'run' | 'test') => {
    if (!currentSession || isRunning) return;
    setIsRunning(true);
    setIsConsoleCollapsed(false);

    try {
      const result = await window.electronAPI.runCode({
        sessionId: currentSession.id,
        language: currentSession.language,
        files: currentSession.files,
        entryPoint: currentSession.activeFilePath,
        runType,
        enabledLibraries: getEnabledLibraryIds(currentSession.language, settings.externalLibraries, undefined),
        sessionLibraries: undefined,
      });

      const updatedOutput = `${result.stdout}${result.stderr ? '\n' + result.stderr : ''}`;

      setCurrentSession((prev) =>
        prev
          ? {
              ...prev,
              lastTestOutput: updatedOutput,
              lastTestStatus: result.status,
            }
          : null
      );
    } catch (err: any) {
      console.error('Execution Error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  // AI Test Generation
  const handleGenerateTests = async () => {
    if (!currentSession || isGeneratingTests) return;
    if (!settings.openRouterApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    setIsGeneratingTests(true);
    setIsConsoleCollapsed(false);

    try {
      const res = await openRouterService.generateTests({
        problemTitle: currentSession.title,
        problemStatement: currentSession.problemStatement,
        language: currentSession.language,
        files: currentSession.files,
        requireConcurrency: currentSession.requireConcurrency ?? false,
        apiKey: settings.openRouterApiKey,
        model: settings.openRouterModel,
      });

      const testFile = res.testFile;
      // Replace stale generated tests: runners execute every *test* file, so an old
      // broken file would fail the whole run and pollute the LLM's context.
      const isTestFileForLang = (p: string): boolean => isTestFilePath(p, currentSession.language);
      const prunedFiles = currentSession.files.filter(
        (f) => f.isDirectory || (!isTestFileForLang(f.path) || f.path === testFile.path)
      );
      const existingIdx = prunedFiles.findIndex((f) => f.path === testFile.path);
      const updatedFiles =
        existingIdx >= 0
          ? prunedFiles.map((f, i) => (i === existingIdx ? testFile : f))
          : [...prunedFiles, testFile];

      setCurrentSession({
        ...currentSession,
        files: updatedFiles,
        activeFilePath: testFile.path,
      });

      setOpenFilePaths((prev) => [
        ...prev.filter((p) => !isTestFileForLang(p) || p === testFile.path),
        ...(prev.includes(testFile.path) || openFilePaths.includes(testFile.path) ? [] : [testFile.path]),
      ]);

      setTimeout(() => {
        runCodeInternal('test');
      }, 400);
    } catch (err: any) {
      console.error('Failed to generate tests:', err);
    } finally {
      setIsGeneratingTests(false);
    }
  };

  // AI Evaluation & Scoring
  const handleEvaluateProject = async () => {
    if (!currentSession || isEvaluating) return;
    if (!settings.openRouterApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    setIsEvaluating(true);
    setIsEvaluationOpen(true); // Open modal immediately so waiting display is visible
    setIsRunning(true);
    setEvaluationStatus('Step 1/3 — Running your code…');
    const snapshot = currentSession;
    const tail = (s: string, n = 3000): string => {
      if (!s) return s;
      return s.length > n ? `...[truncated ${s.length - n} chars]\n${s.slice(-n)}` : s;
    };
    let evalTestOutput: string | undefined = snapshot.lastTestOutput?.slice(-6000);
    let freshTestOutputFull: string | undefined;
    let freshTestStatus: SessionData['lastTestStatus'] = snapshot.lastTestStatus ?? null;
    try {
      setEvaluationStatus('Step 1/3 — Running your code…');
      const libs = getEnabledLibraryIds(snapshot.language, settings.externalLibraries, undefined);
      const runRes = await window.electronAPI.runCode({
          sessionId: snapshot.id,
          language: snapshot.language,
          files: snapshot.files,
          entryPoint: snapshot.activeFilePath,
          runType: 'run',
          enabledLibraries: libs,
          sessionLibraries: undefined,
        });
        setEvaluationStatus('Step 2/3 — Running tests…');
        const testRes = await window.electronAPI.runCode({
          sessionId: snapshot.id,
          language: snapshot.language,
          files: snapshot.files,
          entryPoint: snapshot.activeFilePath,
          runType: 'test',
          enabledLibraries: libs,
          sessionLibraries: undefined,
        });
        const runOut = `${runRes.stdout}${runRes.stderr ? `\n${runRes.stderr}` : ''}`;
        const testOut = `${testRes.stdout}${testRes.stderr ? `\n${testRes.stderr}` : ''}`;
        freshTestStatus = testRes.status;
        freshTestOutputFull = testOut.slice(-8000);
        setCurrentSession((prev) =>
          prev ? { ...prev, lastTestOutput: freshTestOutputFull, lastTestStatus: testRes.status } : prev
        );
        evalTestOutput = `[run] status=${runRes.status} time=${runRes.executionTimeMs}ms\n${tail(runOut)}\n\n[test] status=${testRes.status} time=${testRes.executionTimeMs}ms\n${tail(testOut)}`.slice(-6000);
      setEvaluationStatus('Step 3/3 — Reviewing your solution…');
      const report = await openRouterService.evaluateProject({
        problemTitle: snapshot.title,
        problemStatement: snapshot.problemStatement,
        language: snapshot.language,
        files: snapshot.files,
        testOutput: evalTestOutput,
        requireConcurrency: snapshot.requireConcurrency ?? false,
        problemMode: snapshot.problemMode,
        clarificationMessages: snapshot.clarificationMessages,
        apiKey: settings.openRouterApiKey,
        model: settings.openRouterModel,
      });

      const updatedSession: SessionData = {
        ...snapshot,
        lastTestOutput: freshTestOutputFull ?? snapshot.lastTestOutput,
        lastTestStatus: freshTestStatus ?? snapshot.lastTestStatus,
        evaluationReport: report,
      };

      setCurrentSession(updatedSession);
      sessionRef.current = updatedSession;

      // Stored immediately into permanent session storage
      await window.electronAPI.saveSession(updatedSession);
      const list = await window.electronAPI.getSessionsList();
      setSessionsList(list);
    } catch (err: any) {
      alert(`Evaluation failed: ${err.message}`);
      setIsEvaluationOpen(false);
    } finally {
      setIsRunning(false);
      setIsEvaluating(false);
      setEvaluationStatus('');
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-[#141416] overflow-hidden text-slate-900 dark:text-zinc-200 select-none">
      {!isLandingOpen && currentSession ? (
        <>
          <Header
            currentSession={currentSession}
            theme={settings.theme}
            onToggleTheme={handleToggleTheme}
            onBackToProjects={() => setIsLandingOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onEvaluate={handleEvaluateProject}
            onOpenEvaluation={() => setIsEvaluationOpen(true)}
            isEvaluating={isEvaluating}
            onToggleTimer={handleToggleTimer}
            onResetTimer={handleResetTimer}
          />

          <div className="flex-1 flex overflow-hidden">
            {isProblemHidden && (
              <button
                onClick={() => setIsProblemHidden(false)}
                title="Show Problem (Ctrl+B)"
                className="w-7 h-full bg-slate-100/80 dark:bg-[#151518] hover:bg-slate-200/80 dark:hover:bg-[#1c1c20] border-r border-slate-200/80 dark:border-white/[0.06] flex flex-col items-center py-3 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors select-none shrink-0"
              >
                <PanelLeftOpen className="w-3.5 h-3.5 mb-2 text-blue-500 dark:text-blue-400" />
                <span className="text-[10px] uppercase font-bold tracking-widest [writing-mode:vertical-lr] rotate-180">
                  Problem
                </span>
              </button>
            )}

            {!isProblemHidden && (
              <div className="w-[380px] lg:w-[420px] shrink-0 h-full flex flex-col">
                <ProblemPanel
                  session={currentSession}
                  onSendClarification={handleSendClarification}
                  isClarifying={isClarifying}
                  onToggleHide={() => setIsProblemHidden(true)}
                />
              </div>
            )}

            <div className="w-56 shrink-0 h-full">
              <FileExplorer
                files={currentSession.files}
                activeFilePath={currentSession.activeFilePath}
                onSelectFile={handleSelectFile}
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                onRenameFile={handleRenameFile}
                onDeleteFile={handleDeleteFile}
                onRefresh={handleSyncFilesFromDisk}
              />
            </div>

            <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
              <Group orientation="vertical" className="flex-1 min-h-0">
                <Panel id="editor" defaultSize="70%" minSize={120}>
                  <div className="h-full overflow-hidden">
                    <CodeEditor
                      files={currentSession.files}
                      openFilePaths={openFilePaths}
                      activeFilePath={currentSession.activeFilePath}
                      onSelectFile={handleSelectFile}
                      onCloseTab={handleCloseTab}
                      onCodeChange={handleCodeChange}
                      fontSize={settings.fontSize}
                      onGenerateTests={handleGenerateTests}
                      isGeneratingTests={isGeneratingTests}
                      theme={settings.theme}
                      enableStlIntellisense={settings.enableStlIntellisense ?? true}
                      enabledLibIds={
                        currentSession
                          ? getEnabledLibraryIds(
                              currentSession.language,
                              settings.externalLibraries,
                              currentSession.externalLibraries
                            )
                          : []
                      }
                    />
                  </div>
                </Panel>
                <Separator className="h-1.5 cursor-row-resize bg-transparent hover:bg-blue-500/20 flex items-center justify-center">
                  <div className="w-14 h-1 rounded-full bg-slate-300/80 dark:bg-zinc-600/40" />
                </Separator>
                <Panel
                  id="console"
                  defaultSize="30%"
                  minSize={80}
                  collapsible
                  collapsedSize={36}
                  panelRef={consolePanelRef}
                  onResize={handleConsoleResize}
                >
                  <TerminalPanel
                    sessionId={currentSession.id}
                    files={currentSession.files}
                    language={currentSession.language}
                    activeFilePath={currentSession.activeFilePath}
                    isCollapsed={isConsoleCollapsed}
                    onToggleCollapse={handleToggleConsole}
                    onFilesChanged={handleSyncFilesFromDisk}
                    settings={settings}
                  />
                </Panel>
              </Group>
            </div>
          </div>
        </>
      ) : (
        <LandingPage
          sessionsList={sessionsList}
          theme={settings.theme}
          onToggleTheme={handleToggleTheme}
          onSelectSession={handleSelectSession}
          onCreateNewProject={() => setIsNewSessionOpen(true)}
          onDeleteSession={handleDeleteSession}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenFeedback={() => setIsFeedbackOpen(true)}
          onClose={canCloseStartBox ? handleCloseStartBox : undefined}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setIsSettingsOpen(false)}
      />

      <NewSessionModal
        isOpen={isNewSessionOpen}
        settings={settings}
        onClose={() => setIsNewSessionOpen(false)}
        onCreateSession={handleCreateSession}
        onOpenSettings={() => {
          setIsNewSessionOpen(false);
          setIsSettingsOpen(true);
        }}
      />

      <EvaluationModal
        isOpen={isEvaluationOpen}
        report={currentSession?.evaluationReport || null}
        onClose={() => setIsEvaluationOpen(false)}
        onReevaluate={handleEvaluateProject}
        isEvaluating={isEvaluating}
        status={evaluationStatus}
        language={currentSession?.language}
      />

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </div>
  );
};

export default App;
