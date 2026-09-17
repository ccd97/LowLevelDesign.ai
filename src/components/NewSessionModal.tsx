import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, AlertCircle, HelpCircle, Code2, Check, RefreshCw, ArrowLeft, Cpu } from 'lucide-react';
import { ProblemMode, Language, TimeBudget, TIME_BUDGETS, SessionData, FileItem } from '../types/session';
import { openRouterService } from '../services/openrouter';
import { Settings } from '../types/settings';
import { getGenericStarterFiles, getBlankStarterFiles } from '../services/templates';
import { addAiGeneratedNotice } from '../utils/problemText';
import { ToggleSwitch } from './ToggleSwitch';
import { AlertBanner } from './AlertBanner';
import { ModalShell } from './ModalShell';

interface NewSessionModalProps {
  isOpen: boolean;
  settings: Settings;
  onClose: () => void;
  onCreateSession: (session: SessionData) => void;
  onOpenSettings: () => void;
}

interface GeneratedPreview {
  title: string;
  problemStatement: string;
  files: FileItem[];
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({
  isOpen,
  settings,
  onClose,
  onCreateSession,
  onOpenSettings,
}) => {
  const [mode, setMode] = useState<ProblemMode>('ambiguous');
  const [language, setLanguage] = useState<Language>('python');
  const [timeBudget, setTimeBudget] = useState<TimeBudget>(60);
  const [requireConcurrency, setRequireConcurrency] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  const abortInFlight = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  // External close must also abort; seq invalidates the late response.
  useEffect(() => {
    if (!isOpen) {
      seqRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  if (!isOpen) return null;

  const handleClose = () => {
    seqRef.current += 1;
    abortInFlight();
    setIsGenerating(false);
    setPreview(null);
    setErrorMessage(null);
    onClose();
  };

  const handleGenerate = async () => {
    if (!settings.openRouterApiKey) {
      setErrorMessage('OpenRouter API key is required. Please configure it in Settings.');
      return;
    }

    abortInFlight();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    setIsGenerating(true);
    setErrorMessage(null);

    const activePrompt = prompt.trim();

    try {
      const generated = await openRouterService.generateProblem({
        mode,
        timeBudget,
        topic: activePrompt,
        language,
        customPrompt: activePrompt,
        requireConcurrency,
        apiKey: settings.openRouterApiKey,
        model: settings.openRouterModel,
        signal: controller.signal,
      });

      if (seqRef.current !== seq) return;
      // Store for preview — session is only created on confirm.
      setPreview({
        title: generated.title,
        problemStatement: generated.problemStatement,
        files: generated.files || [],
      });
    } catch (err: any) {
      if (seqRef.current !== seq) return;
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      setErrorMessage(err.message || 'Failed to generate problem via LLM');
    } finally {
      if (seqRef.current === seq) {
        abortRef.current = null;
        setIsGenerating(false);
      }
    }
  };

  const handleBackToConfig = () => {
    seqRef.current += 1;
    abortInFlight();
    setIsGenerating(false);
    setPreview(null);
    setErrorMessage(null);
  };

  const handleConfirm = () => {
    if (!preview || isGenerating) return;

    const baseFiles = mode === 'ambiguous'
      ? getBlankStarterFiles(language)
      : (preview.files && preview.files.length > 0 ? preview.files : getGenericStarterFiles(language, preview.title));

    // Safety net: tag every generated file (helper is idempotent).
    const files = mode === 'ambiguous'
      ? baseFiles
      : baseFiles.map((f) => f.isDirectory
          ? f
          : { ...f, content: addAiGeneratedNotice(f.content ?? '', language) });

    const newSession: SessionData = {
      id: 'session_' + Date.now(),
      title: preview.title,
      language,
      problemMode: mode,
      timeBudget,
      requireConcurrency,
      problemStatement: preview.problemStatement,
      files,
      activeFilePath: files[0]?.path,
      clarificationMessages: [],
      timeSpentSeconds: 0,
      isTimerRunning: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onCreateSession(newSession);
    setPreview(null);
    setErrorMessage(null);
    onClose();
  };

  const isPreviewStep = preview !== null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <span className="font-bold text-sm text-slate-900 dark:text-white">
          {isPreviewStep ? 'Preview Question' : 'New Project'}
        </span>
      }
      icon={<Code2 className="w-4 h-4 text-blue-500 dark:text-blue-400" />}
      maxWidth="max-w-xl"
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/75 backdrop-blur-sm p-4 select-none duration-150"
      cardClassName="bg-white dark:bg-[#1e1e24] border border-slate-300 dark:border-[#3f3f46] rounded-xl shadow-2xl w-full overflow-hidden flex flex-col"
      headerClassName="flex items-center justify-between px-5 py-4 border-b border-slate-300 dark:border-[#33333d] bg-slate-50 dark:bg-[#18181b]"
      footer={
        !isPreviewStep ? (
          <div className="px-5 py-4 border-t border-slate-300 dark:border-[#33333d] bg-slate-50 dark:bg-[#18181b] flex items-center justify-end gap-2.5">
            <button
              onClick={handleClose}
              className="px-3.5 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !settings.openRouterApiKey}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 shadow-sm"
            >
              {isGenerating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Preview</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 border-t border-slate-300 dark:border-[#33333d] bg-slate-50 dark:bg-[#18181b] flex items-center justify-between gap-2.5">
            <button
              onClick={handleBackToConfig}
              className="px-3.5 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !settings.openRouterApiKey}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-800 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:active:bg-zinc-800 dark:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 shadow-sm"
              >
                {isGenerating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-600/30 dark:border-white/30 border-t-slate-800 dark:border-t-white rounded-full animate-spin" />
                    <span>Regenerating...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Re-generate</span>
                  </>
                )}
              </button>

              <button
                onClick={handleConfirm}
                disabled={isGenerating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 shadow-sm"
              >
                <span>Start Project</span>
              </button>
            </div>
          </div>
        )
      }
    >
        <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
          {!isPreviewStep ? (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-400 block">
                  Problem Type
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('ambiguous')}
                    className={`p-3.5 rounded-xl border-2 transition-all text-left ${
                      mode === 'ambiguous'
                        ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                        : 'border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4" />
                        Ambiguous
                      </span>
                      {mode === 'ambiguous' && (
                        <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center text-black">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
                      Ambiguous problem statement given. Clarify scope via chat, then code.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('detailed')}
                    className={`p-3.5 rounded-xl border-2 transition-all text-left ${
                      mode === 'detailed'
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                        : 'border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <Code2 className="w-4 h-4" />
                        Exact Specification
                      </span>
                      {mode === 'detailed' && (
                        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
                      Exact problem statement with methods to implement. Boiler plate code will be provided.
                    </p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Target Language</label>
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-zinc-900/90 p-1 rounded-lg border border-slate-300 dark:border-zinc-700">
                    {(['python', 'java'] as Language[]).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguage(lang)}
                        className={`py-1.5 px-2 rounded-md text-xs font-semibold capitalize transition-all ${
                          language === lang
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {lang === 'python' ? 'Python 3' : 'Java'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Time to Solve (Complexity)</label>
                  <div className="grid grid-cols-4 gap-1 bg-slate-100 dark:bg-zinc-900/90 p-1 rounded-lg border border-slate-300 dark:border-zinc-700">
                    {(TIME_BUDGETS as TimeBudget[]).map((budget) => (
                      <button
                        key={budget}
                        type="button"
                        onClick={() => setTimeBudget(budget)}
                        className={`py-1.5 px-1 rounded-md text-xs font-semibold transition-all ${
                          timeBudget === budget
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {budget}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={requireConcurrency}
                onClick={() => setRequireConcurrency((prev) => !prev)}
                className="w-full flex items-center justify-between bg-slate-50 dark:bg-zinc-900/90 border border-slate-300 hover:border-slate-400 dark:border-zinc-700 dark:hover:border-zinc-600 rounded-lg px-3 py-2 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2 select-none">
                  <Cpu className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400 group-hover:text-slate-700 dark:group-hover:text-zinc-300 transition-colors" />
                  <span className="text-xs text-slate-700 dark:text-zinc-300 group-hover:text-slate-900 dark:group-hover:text-zinc-100 transition-colors font-medium">
                    Require thread-safe implementation
                  </span>
                </div>

                <ToggleSwitch
                  size="sm"
                  checked={requireConcurrency}
                  trackOnly
                  activeColor="bg-blue-600"
                />
              </button>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Topic or Domain</label>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500">Optional</span>
                </div>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Leave blank for an AI-generated scenario, or enter a custom domain..."
                  className="w-full bg-slate-50 dark:bg-zinc-900/90 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${mode === 'ambiguous' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'}`}>
                    {mode === 'ambiguous' ? 'Ambiguous' : 'Exact Specification'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 dark:bg-zinc-700/60 text-slate-700 dark:text-zinc-300">
                    {language === 'python' ? 'Python 3' : 'Java'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 dark:bg-zinc-700/60 text-slate-700 dark:text-zinc-300">
                    {timeBudget} min
                  </span>
                  {requireConcurrency && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-300 flex items-center gap-1">
                      <Cpu className="w-3 h-3" />
                      Thread-safe
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{preview.title}</h3>

                <div className="bg-slate-50 dark:bg-zinc-900/90 border border-slate-300 dark:border-zinc-700 rounded-lg p-3 text-xs text-slate-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {preview.problemStatement}
                </div>

                {mode === 'detailed' && (
                  <p className="text-[11px] text-slate-500 dark:text-zinc-500">
                    {preview.files.length > 0
                      ? `Includes ${preview.files.length} starter file${preview.files.length > 1 ? 's' : ''}: ${preview.files.map((f) => f.path).join(', ')}`
                      : 'No starter files returned — generic templates will be used.'}
                  </p>
                )}
              </div>
            </>
          )}

          {!settings.openRouterApiKey && (
            <AlertBanner variant="amber" className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                <span>OpenRouter API Key required to generate problems.</span>
              </div>
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-amber-600 dark:text-amber-300 hover:underline font-semibold"
              >
                Configure
              </button>
            </AlertBanner>
          )}

          {errorMessage && (
            <AlertBanner variant="rose">
              {errorMessage}
            </AlertBanner>
          )}
        </div>
    </ModalShell>
  );
};
