import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  MessageSquare,
  Send,
  Bot,
  Lightbulb,
  PanelLeftClose,
  ChevronDown,
  ChevronUp,
  Cpu
} from 'lucide-react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { SessionData } from '../types/session';
import { MarkdownViewer } from './MarkdownViewer';
import { stripLeadingTitle } from '../utils/problemText';
import { AlertBanner } from './AlertBanner';

interface ProblemPanelProps {
  session: SessionData | null;
  onSendClarification: (question: string) => Promise<void>;
  isClarifying: boolean;
  onToggleHide?: () => void;
}

export const ProblemPanel: React.FC<ProblemPanelProps> = ({
  session,
  onSendClarification,
  isClarifying,
  onToggleHide,
}) => {
  const [isClarifyExpanded, setIsClarifyExpanded] = useState<boolean>(true);
  const [inputQuestion, setInputQuestion] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const clarifyPanelRef = usePanelRef();

  const handleToggleClarify = () => {
    const next = !isClarifyExpanded;
    setIsClarifyExpanded(next);
    if (next) {
      clarifyPanelRef.current?.expand();
    } else {
      clarifyPanelRef.current?.collapse();
    }
  };

  const handleClarifyResize = () => {
    const collapsed = clarifyPanelRef.current?.isCollapsed();
    if (collapsed === undefined) return;
    // Keep the chevron/content in sync when the user drag-collapses/expands.
    setIsClarifyExpanded((prev) => {
      if (collapsed && prev) return false;
      if (!collapsed && !prev) return true;
      return prev;
    });
  };

  useEffect(() => {
    if (isClarifyExpanded && session?.clarificationMessages.length) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session?.clarificationMessages, isClarifyExpanded]);

  const handleSend = async () => {
    if (!inputQuestion.trim() || isClarifying) return;
    const q = inputQuestion.trim();
    setInputQuestion('');
    await onSendClarification(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#fbfcfd] dark:bg-[#161619] border-r border-slate-200/80 dark:border-white/[0.06] overflow-hidden select-none transition-colors">
      <div className="h-9 flex items-center justify-between border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-100/60 dark:bg-[#131316] px-3 shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-zinc-200">
          <FileText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          <span>Problem</span>
        </div>
        {onToggleHide && (
          <button
            onClick={onToggleHide}
            title="Hide Problem panel"
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800/60 rounded transition-colors"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <Group orientation="vertical" className="flex-1 min-h-0">
        <Panel id="problem-statement" defaultSize="65%" minSize={80}>
          <div className="h-full overflow-y-auto p-4 space-y-4 select-text">
            {session ? (
              <>
                <div className="border-b border-slate-200/80 dark:border-white/[0.06] pb-2.5">
                  <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight leading-snug">
                    {session.title}
                  </h1>
                  {session.requireConcurrency && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 flex items-center gap-1.5">
                        <Cpu className="w-3 h-3" />
                        Thread-safe required
                      </span>
                    </div>
                  )}
                </div>
                {session.problemMode === 'ambiguous' && (
                  <AlertBanner variant="amber" className="flex gap-2 items-start">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed">
                      <strong className="text-amber-700 dark:text-amber-300 mr-1">Open-Ended:</strong>
                      Use the <span className="font-semibold text-amber-700 dark:text-amber-200">Clarify</span> section below to confirm requirements, assumptions, or edge cases before coding.
                    </div>
                  </AlertBanner>
                )}
                <MarkdownViewer content={stripLeadingTitle(session.problemStatement, session.title)} />
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 dark:text-zinc-500 italic">
                No active problem
              </div>
            )}
          </div>
        </Panel>

        {session && (
          <>
            <Separator className="h-1.5 cursor-row-resize bg-transparent hover:bg-blue-500/20 flex items-center justify-center">
              <div className="w-14 h-1 rounded-full bg-slate-300/80 dark:bg-zinc-600/40" />
            </Separator>
            <Panel
              id="clarify"
              defaultSize="35%"
              minSize={80}
              collapsible
              collapsedSize={33}
              panelRef={clarifyPanelRef}
              onResize={handleClarifyResize}
            >
              <div className="h-full border-t border-slate-200/80 dark:border-white/[0.06] bg-slate-100/50 dark:bg-[#131316] flex flex-col overflow-hidden">
                <div
                  onClick={handleToggleClarify}
                  className="h-8 px-3 flex items-center justify-between cursor-pointer hover:bg-slate-200/50 dark:hover:bg-white/[0.03] transition-colors select-none shrink-0"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                    <span>Clarify</span>
                    {session.clarificationMessages.length > 0 && (
                      <span className="px-1.5 py-0.2 bg-blue-500/15 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[10px] rounded-full font-mono font-semibold">
                        {session.clarificationMessages.length}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-white p-0.5"
                    title={isClarifyExpanded ? "Collapse Clarify" : "Expand Clarify"}
                  >
                    {isClarifyExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {isClarifyExpanded && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-white dark:bg-[#111114] select-text text-xs border-t border-slate-200/80 dark:border-white/[0.06]">
                      {session.clarificationMessages.length === 0 ? (
                        <div className="text-slate-400 dark:text-zinc-500 text-[11px] text-center py-6 italic">
                          Ask the interviewer questions about requirements, scope, or edge cases.
                        </div>
                      ) : (
                        session.clarificationMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            {msg.role !== 'user' && (
                              <div className="w-5 h-5 rounded-full bg-blue-500/15 dark:bg-blue-600/20 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                                <Bot className="w-3 h-3" />
                              </div>
                            )}
                            <div
                              className={`max-w-[85%] rounded px-2.5 py-1.5 text-xs leading-relaxed ${
                                msg.role === 'user'
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'bg-slate-50 dark:bg-[#1a1a1f] text-slate-800 dark:text-zinc-200 border border-slate-200/80 dark:border-white/[0.06]'
                              }`}
                            >
                              <div className="whitespace-pre-wrap">{msg.content}</div>
                            </div>
                          </div>
                        ))
                      )}
                      {isClarifying && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 italic">
                          <div className="w-5 h-5 rounded-full bg-blue-500/15 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 flex items-center justify-center animate-pulse">
                            <Bot className="w-3 h-3" />
                          </div>
                          <span>Interviewer is replying...</span>
                        </div>
                      )}
                      <div ref={chatBottomRef} />
                    </div>
                    <div className="p-2 border-t border-slate-200/80 dark:border-white/[0.06] bg-slate-50 dark:bg-[#131316] flex items-center gap-1.5 shrink-0">
                      <input
                        type="text"
                        value={inputQuestion}
                        onChange={(e) => setInputQuestion(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a clarifying question..."
                        disabled={isClarifying}
                        className="flex-1 bg-white dark:bg-[#18181d] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-zinc-200 rounded px-2.5 py-1.5 outline-none focus:border-blue-500 disabled:opacity-50 placeholder-slate-400 dark:placeholder-zinc-500"
                      />
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={!inputQuestion.trim() || isClarifying}
                        className="p-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors shadow-sm"
                        title="Send question"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
};

export default ProblemPanel;
