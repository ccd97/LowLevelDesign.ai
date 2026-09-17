import React, { useState, useEffect, useRef } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Loader2,
  Sun,
  Moon,
  Settings as SettingsIcon,
  Palette,
  FolderCode,
  ChevronRight,
  ChevronDown,
  Check,
  Zap,
} from 'lucide-react';
import { Settings } from '../types/settings';
import { openRouterService } from '../services/openrouter';
import { applyThemeInstantly } from '../utils/theme';
import { ExternalLibrariesToggle } from './ExternalLibrariesToggle';
import { ToggleSwitch } from './ToggleSwitch';
import { AlertBanner } from './AlertBanner';
import { ModalShell } from './ModalShell';

interface SettingsModalProps {
  isOpen: boolean;
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onSave,
  onClose,
}) => {
  const [apiKey, setApiKey] = useState(settings.openRouterApiKey);
  const [model, setModel] = useState(settings.openRouterModel);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; contextLength?: number }>>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchFreeModels = async () => {
    setIsLoadingModels(true);
    try {
      const models = await openRouterService.getFreeModels();
      setAvailableModels(models);
    } catch (err) {
      console.warn('Failed to load free models from OpenRouter:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFreeModels();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [fontSize, setFontSize] = useState(settings.fontSize || 14);
  const [theme, setTheme] = useState<'dark' | 'light'>(settings.theme || 'dark');
  const [enableStlIntellisense, setEnableStlIntellisense] = useState(settings.enableStlIntellisense ?? true);
  const [pythonPath, setPythonPath] = useState(settings.pythonPath || '');
  const [javaPath, setJavaPath] = useState(settings.javaPath || '');
  const [terminalShellPath, setTerminalShellPath] = useState(settings.terminalShellPath || '');
  const [externalLibraries, setExternalLibraries] = useState<Record<string, boolean>>(settings.externalLibraries || {});
  const [isPathsExpanded, setIsPathsExpanded] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Please enter an OpenRouter API key.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await openRouterService.testConnection(apiKey.trim(), model.trim());
      setTestResult({ success: res.success, message: res.message });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Connection test failed.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCancel = () => {
    applyThemeInstantly(settings.theme);
    onClose();
  };

  const handleSave = () => {
    applyThemeInstantly(theme);
    onSave({
      ...settings,
      openRouterApiKey: apiKey.trim(),
      openRouterModel: model.trim() || 'nex-agi/nex-n2.5-mini:free',
      fontSize,
      theme,
      enableStlIntellisense,
      pythonPath: pythonPath.trim(),
      javaPath: javaPath.trim(),
      terminalShellPath: terminalShellPath.trim(),
      externalLibraries,
    });
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleCancel}
      title={<span className="text-slate-800 dark:text-zinc-100 font-bold text-sm">Settings</span>}
      icon={
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400">
          <SettingsIcon className="w-4 h-4" />
        </div>
      }
      maxWidth="max-w-lg"
      maxHeight="max-h-[85vh]"
      footer={
        <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/80 dark:bg-[#141417] flex items-center justify-end gap-2.5">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-zinc-800/60 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
          >
            Save Settings
          </button>
        </div>
      }
    >
        {/* Body */}
        <div className="p-6 space-y-4 text-xs overflow-y-auto">
          {/* Card 1: Appearance & Editor */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/40 p-4 space-y-3.5">
            <div className="flex items-center gap-2 text-slate-900 dark:text-zinc-200 font-semibold text-xs">
              <Palette className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span>Appearance & Editor</span>
            </div>

            {/* Theme selector */}
            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-zinc-400 text-[11px] font-medium block">
                Theme
              </label>
              <div className="grid grid-cols-2 gap-2 bg-slate-200/60 dark:bg-zinc-950 p-1 rounded-lg border border-slate-300/70 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setTheme('dark');
                    applyThemeInstantly('dark');
                  }}
                  className={`py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    theme === 'dark'
                      ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Dark Mode</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTheme('light');
                    applyThemeInstantly('light');
                  }}
                  className={`py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    theme === 'light'
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-300'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>Light Mode</span>
                </button>
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 text-[11px] font-medium">
                <span>Font Size</span>
                <span className="font-mono text-slate-900 dark:text-zinc-100 font-bold bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700">
                  {fontSize}px
                </span>
              </div>
              <input
                type="range"
                min={11}
                max={20}
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                <span>11px</span>
                <span>20px</span>
              </div>
            </div>

            {/* IntelliSense Toggle */}
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200/70 dark:border-zinc-800/70">
              <div className="space-y-0.5">
                <label
                  onClick={() => setEnableStlIntellisense(!enableStlIntellisense)}
                  className="text-slate-800 dark:text-zinc-200 font-medium cursor-pointer text-xs"
                >
                  Standard Library IntelliSense
                </label>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-normal">
                  Auto-complete, method signatures, and docs for built-in Python and Java standard libraries.
                </p>
              </div>
              <ToggleSwitch
                size="md"
                checked={enableStlIntellisense}
                onChange={() => setEnableStlIntellisense(!enableStlIntellisense)}
                activeColor="bg-blue-600"
              />
            </div>
          </div>

          {/* Card 2: AI & Models */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/40 p-4 space-y-3.5">
            <div className="flex items-center gap-2 text-slate-900 dark:text-zinc-200 font-semibold text-xs">
              <Key className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
              <span>AI Provider & Model</span>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 text-[11px] font-medium">
                <span>OpenRouter API Key</span>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline font-normal text-[11px]"
                >
                  openrouter.ai/keys
                </a>
              </div>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 rounded-lg px-3 py-2 pr-9 outline-none focus:border-blue-500 font-mono transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Model Selection (Single Unified Combobox Input) */}
            <div className="space-y-1.5" ref={dropdownRef}>
              <div className="flex items-center justify-between">
                <label className="text-slate-600 dark:text-zinc-400 text-[11px] font-medium">
                  Model
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    title="Test connection to selected model"
                    className="text-[11px] font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    {isTesting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    <span>{isTesting ? 'Testing...' : 'Test'}</span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="e.g. google/gemma-4-31b-it:free or anthropic/claude-3.5-sonnet"
                  className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 rounded-lg pl-3 pr-8 py-2 outline-none focus:border-blue-500 font-mono transition-colors"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setIsDropdownOpen((prev) => !prev)}
                  className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 p-0.5"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && availableModels.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 divide-y divide-slate-100 dark:divide-zinc-800">
                    {availableModels.map((m) => {
                      const isSelected = model === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setModel(m.id);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 hover:bg-purple-50/70 dark:hover:bg-purple-950/30 transition-colors flex items-center justify-between gap-2 group ${
                            isSelected ? 'bg-purple-50 dark:bg-purple-950/50' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-slate-800 dark:text-zinc-200 truncate flex items-center gap-1.5">
                              <span className="truncate">{m.name}</span>
                              {m.contextLength && (
                                <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 rounded-sm font-mono shrink-0">
                                  {Math.round(m.contextLength / 1000)}k ctx
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 truncate">
                              {m.id}
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {testResult && (
                <AlertBanner
                  variant={testResult.success ? 'emerald' : 'rose'}
                  className="mt-2 flex items-start gap-2"
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-snug">{testResult.message}</span>
                </AlertBanner>
              )}
            </div>
          </div>

          {/* Card: External Libraries */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-zinc-200 font-semibold text-xs">
              <Sliders className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              <span>External Libraries</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">Java</div>
                <ExternalLibrariesToggle language="java" values={externalLibraries} onChange={setExternalLibraries} downloadOnEnable />
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">Python</div>
                <ExternalLibrariesToggle language="python" values={externalLibraries} onChange={setExternalLibraries} downloadOnEnable />
              </div>
            </div>
          </div>

          {/* Card 3: Environment Paths (Collapsible, hidden by default) */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsPathsExpanded(!isPathsExpanded)}
              className="w-full flex items-center justify-between text-left p-4 text-slate-800 dark:text-zinc-200 font-semibold text-xs hover:bg-slate-100/60 dark:hover:bg-zinc-800/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FolderCode className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>Environment Paths</span>
              </div>
              <ChevronRight
                className={`w-4 h-4 text-slate-400 dark:text-zinc-400 transition-transform duration-200 ${
                  isPathsExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>

            {isPathsExpanded && (
              <div className="p-4 pt-1 space-y-3 border-t border-slate-200/70 dark:border-zinc-800/70">
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Optional. Leave blank to use system $PATH defaults.
                </p>

                {/* Python Path */}
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-zinc-400 text-[11px] font-medium block">
                    Python Path
                  </label>
                  <input
                    type="text"
                    value={pythonPath}
                    onChange={(e) => setPythonPath(e.target.value)}
                    placeholder="e.g. /usr/bin/python3, ~/.venv/bin/python"
                    className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 rounded-lg px-3 py-2 outline-none focus:border-blue-500 font-mono transition-colors"
                  />
                </div>

                {/* Java Path */}
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-zinc-400 text-[11px] font-medium block">
                    Java Path (JDK Home or Binary)
                  </label>
                  <input
                    type="text"
                    value={javaPath}
                    onChange={(e) => setJavaPath(e.target.value)}
                    placeholder="e.g. /usr/lib/jvm/default, /path/to/java"
                    className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 rounded-lg px-3 py-2 outline-none focus:border-blue-500 font-mono transition-colors"
                  />
                </div>

                {/* Terminal Shell Path */}
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-zinc-400 text-[11px] font-medium block">
                    Terminal Shell
                  </label>
                  <input
                    type="text"
                    value={terminalShellPath}
                    onChange={(e) => setTerminalShellPath(e.target.value)}
                    placeholder="e.g. /bin/zsh, /bin/bash"
                    className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 rounded-lg px-3 py-2 outline-none focus:border-blue-500 font-mono transition-colors"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
    </ModalShell>
  );
};
