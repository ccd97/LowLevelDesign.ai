import React, { useState, useEffect } from 'react';
import { 
  FolderPlus, 
  Search, 
  Trash2, 
  Settings as SettingsIcon,
  X,
  Sun,
  Moon,
  MessageSquare
} from 'lucide-react';
import { SessionSummary } from '../types/session';
import { AppLogo } from './AppLogo';
import { formatDuration } from '../utils/format';

interface LandingPageProps {
  sessionsList: SessionSummary[];
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onSelectSession: (id: string) => void;
  onCreateNewProject: () => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
  onOpenFeedback?: () => void;
  onClose?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  sessionsList,
  theme = 'dark',
  onToggleTheme,
  onSelectSession,
  onCreateNewProject,
  onDeleteSession,
  onOpenSettings,
  onOpenFeedback,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Close start box on Escape key if closing is possible
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filteredSessions = sessionsList.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 dark:bg-[#141416] text-slate-800 dark:text-zinc-200 select-none overflow-hidden transition-colors">
      <header className="h-12 border-b border-slate-300 dark:border-[#2d2d35] bg-white dark:bg-[#18181b] px-5 flex items-center justify-between shrink-0 transition-colors">
        <div className="flex items-center gap-2.5">
          <AppLogo size={26} />
          <span className="font-title font-bold text-[15px] tracking-tight text-slate-900 dark:text-zinc-100">
            LLD Practice
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded transition-colors"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-indigo-600" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
            </button>
          )}
          {onOpenFeedback && (
            <button
              onClick={onOpenFeedback}
              title="Send Feedback"
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onOpenSettings}
            title="Settings"
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Close (resume last project) [Esc]"
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="relative w-full max-w-3xl md:h-[390px] grid grid-cols-1 md:grid-cols-5 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#2d2d35] rounded-xl shadow-xl overflow-hidden transition-colors">
          {onClose && (
            <button
              onClick={onClose}
              title="Close (resume last project) [Esc]"
              className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded-md transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="md:col-span-2 p-6 border-b md:border-b-0 md:border-r border-slate-300 dark:border-[#2d2d35] flex flex-col justify-between h-full bg-slate-50 dark:bg-[#1b1b1f] transition-colors">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                  Start
                </span>
              </div>

              <div className="space-y-2">
                <button
                  onClick={onCreateNewProject}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors text-left"
                >
                  <FolderPlus className="w-4 h-4 shrink-0" />
                  <span>New Project</span>
                </button>

                <button
                  onClick={onOpenSettings}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 bg-white hover:bg-slate-100 active:bg-slate-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white text-xs font-medium rounded-lg border border-slate-300 dark:border-zinc-700/60 transition-colors text-left shadow-sm"
                >
                  <SettingsIcon className="w-4 h-4 text-slate-400 dark:text-zinc-400 shrink-0" />
                  <span>Settings</span>
                </button>

                {onOpenFeedback && (
                  <button
                    onClick={onOpenFeedback}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 bg-white hover:bg-slate-100 active:bg-slate-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white text-xs font-medium rounded-lg border border-slate-300 dark:border-zinc-700/60 transition-colors text-left shadow-sm"
                  >
                    <MessageSquare className="w-4 h-4 text-slate-400 dark:text-zinc-400 shrink-0" />
                    <span>Send Feedback</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="md:col-span-3 p-6 flex flex-col justify-between h-full bg-white dark:bg-[#18181b] transition-colors">
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3 pr-8">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Recent
                </span>
              </div>

              {sessionsList.length > 0 && (
                <div className="relative mb-3 shrink-0">
                  <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter recent projects..."
                    className="w-full bg-slate-50 dark:bg-[#141416] border border-slate-300 dark:border-[#2d2d35] rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0">
                {filteredSessions.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 dark:text-zinc-500 py-6">
                    {sessionsList.length === 0 ? 'No recent projects' : 'No matching projects'}
                  </div>
                ) : (
                  filteredSessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => onSelectSession(session.id)}
                      className="group px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800/70 cursor-pointer transition-colors flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <div className="text-xs font-medium text-slate-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-white truncate">
                          {session.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-500 flex items-center gap-1.5 mt-0.5 font-mono">
                          <span className="capitalize">{session.language}</span>
                          <span>•</span>
                          <span>{formatDuration(session.timeSpentSeconds)}</span>
                          {session.overallScore !== undefined && (
                            <>
                              <span>•</span>
                              <span className="text-slate-600 dark:text-zinc-400">
                                {session.overallScore}/100
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete project "${session.title}"?`)) {
                            onDeleteSession(session.id);
                          }
                        }}
                        title="Delete"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 rounded transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-zinc-800/80 flex items-center justify-between text-[11px] h-7">
              <span className="font-mono text-slate-400 dark:text-zinc-500">v1.2.0</span>
            </div>
          </div>

        </div>
      </main>

      <footer className="h-8 border-t border-slate-300 dark:border-[#23232b] bg-slate-50 dark:bg-[#121214] px-5 flex items-center justify-between text-xs text-slate-500 dark:text-zinc-500 select-none shrink-0 transition-colors">
        <span className="text-[11px] text-slate-400 dark:text-zinc-600 font-mono">LLD Practice</span>
        {onOpenFeedback && (
          <button
            onClick={onOpenFeedback}
            className="text-[11px] text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <MessageSquare className="w-3 h-3" />
            <span>Feedback</span>
          </button>
        )}
      </footer>
    </div>
  );
};

export default LandingPage;
