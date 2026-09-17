import React from 'react';
import { 
  Award, 
  Settings as SettingsIcon, 
  Pause, 
  RotateCcw, 
  Clock, 
  Play,
  Sun,
  Moon
} from 'lucide-react';
import { SessionData } from '../types/session';
import { AppLogo } from './AppLogo';
import { formatTime } from '../utils/format';

interface HeaderProps {
  currentSession: SessionData | null;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onBackToProjects: () => void;
  onOpenSettings: () => void;
  onEvaluate: () => void;
  onOpenEvaluation?: () => void;
  isEvaluating: boolean;
  onToggleTimer: () => void;
  onResetTimer: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentSession,
  theme = 'dark',
  onToggleTheme,
  onBackToProjects,
  onOpenSettings,
  onEvaluate,
  onOpenEvaluation,
  isEvaluating,
  onToggleTimer,
  onResetTimer,
}) => {
  return (
    <header className="h-14 bg-white dark:bg-[#121215] border-b border-slate-200/80 dark:border-white/[0.06] flex items-center justify-between px-4 select-none shrink-0 z-10 transition-colors">
      {/* Left: Brand & Active Problem Navigation */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onBackToProjects}
          title="Return to Projects Landing Page"
          className="flex items-center gap-2.5 font-bold text-base tracking-wide text-slate-900 dark:text-white hover:opacity-90 transition-opacity cursor-pointer"
        >
          <AppLogo size={28} />
          <span className="font-title font-bold text-[17px] tracking-tight text-slate-900 dark:text-zinc-100 select-none">
            LLD Practice
          </span>
        </button>

        <div className="h-5 w-[1px] bg-slate-200/80 dark:bg-white/10 mx-1" />

        {currentSession && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100 truncate max-w-[300px]">
              {currentSession.title}
            </span>
          </div>
        )}
      </div>

      {/* Middle: Timer */}
      {currentSession && (
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#1c1c20] border border-slate-200/80 dark:border-white/10 px-3 py-1 rounded-md shadow-sm">
          <Clock className={`w-3.5 h-3.5 ${currentSession.isTimerRunning ? 'text-blue-500 dark:text-blue-400 animate-pulse' : 'text-slate-400 dark:text-zinc-400'}`} />
          <span className="font-mono text-xs font-semibold text-slate-800 dark:text-zinc-100 tracking-wider">
            {formatTime(currentSession.timeSpentSeconds)}
          </span>
          <div className="flex items-center gap-1 border-l border-slate-200/80 dark:border-white/10 pl-2 ml-1">
            <button
              onClick={onToggleTimer}
              title={currentSession.isTimerRunning ? 'Pause Timer' : 'Start Timer'}
              className="p-1 hover:bg-slate-200/60 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white rounded transition-colors"
            >
              {currentSession.isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
            </button>
            <button
              onClick={onResetTimer}
              title="Reset Timer"
              className="p-1 hover:bg-slate-200/60 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white rounded transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {isEvaluating ? (
          <button
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/15 dark:bg-blue-600/20 border border-blue-500/30 dark:border-blue-500/40 text-blue-600 dark:text-blue-300 rounded-md text-xs font-medium opacity-80"
          >
            <Award className="w-3.5 h-3.5 animate-bounce" />
            <span>Evaluating...</span>
          </button>
        ) : currentSession?.evaluationReport ? (
          <button
            onClick={onOpenEvaluation}
            title="View evaluation scorecard (Re-evaluation available inside)"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 border border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-md text-xs font-semibold transition-colors shadow-sm"
          >
            <Award className="w-3.5 h-3.5" />
            <span>Score: {currentSession.evaluationReport.overallScore}/100</span>
          </button>
        ) : (
          <button
            onClick={onEvaluate}
            disabled={!currentSession}
            title="Evaluate design and code quality"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 dark:bg-blue-600/20 dark:hover:bg-blue-600/30 border border-blue-500/30 dark:border-blue-500/40 text-blue-600 dark:text-blue-300 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Award className="w-3.5 h-3.5" />
            <span>Judge LLD</span>
          </button>
        )}

        <div className="h-5 w-[1px] bg-slate-300 dark:bg-[#3f3f46] mx-1" />

        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 text-indigo-600" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400" />
            )}
          </button>
        )}

        <button
          onClick={onOpenSettings}
          title="Settings (API Key & Model)"
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded-md transition-colors"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
