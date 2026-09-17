import React from 'react';
import { 
  X, 
  ClipboardCheck, 
  AlertCircle,
  Puzzle,
  Layers,
  Cpu,
  FlaskConical,
  Code2,
  CheckCircle2,
  Sparkles,
  Lightbulb,
  Compass,
  GitBranch,
  Boxes,
  Loader2
} from 'lucide-react';
import { EvaluationReport, ImprovementItem, StrengthItem } from '../types/evaluation';
import { Language } from '../types/session';
import { MarkdownViewer } from './MarkdownViewer';
import { MermaidViewer } from './MermaidViewer';
import { CodeHighlighter } from './CodeHighlighter';
import { AlertBanner } from './AlertBanner';
import { ModalShell } from './ModalShell';

interface EvaluationModalProps {
  isOpen: boolean;
  report: EvaluationReport | null;
  onClose: () => void;
  onReevaluate: () => void;
  isEvaluating: boolean;
  status?: string;
  language?: Language;
}

export const EvaluationModal: React.FC<EvaluationModalProps> = ({
  isOpen,
  report,
  onClose,
  onReevaluate,
  isEvaluating,
  status,
  language,
}) => {
  if (!isOpen) return null;

  // If evaluating, show simple waiting display
  if (isEvaluating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/75 backdrop-blur-sm p-4 select-none duration-150">
        <div className="bg-white dark:bg-[#18181b] border border-slate-300 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center relative flex flex-col items-center">
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3 mt-1">
            <Loader2 className="w-6 h-6 text-blue-500 dark:text-blue-400 animate-spin" />
          </div>

          <h3 className="font-semibold text-slate-900 dark:text-white text-base mb-1">Evaluating Solution</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400">{status || 'Reviewing your code and architecture...'}</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  // Map report criteria (with legacy fallbacks) to display rows.
  const criteriaData = report.criteria;
  const criteriaList = [
    {
      key: 'problemAnalysis',
      label: 'Problem Analysis & Scoping',
      icon: Compass,
      data: criteriaData.problemAnalysis ?? criteriaData.classModeling,
      color: 'text-cyan-600 dark:text-cyan-400',
      barColor: 'bg-cyan-500',
    },
    {
      key: 'classDesign',
      label: 'Class Design & Interaction Modeling',
      icon: Puzzle,
      data: criteriaData.classDesign ?? criteriaData.designPatterns,
      color: 'text-purple-600 dark:text-purple-400',
      barColor: 'bg-purple-500',
    },
    {
      key: 'codeQuality',
      label: 'Code Quality & SOLID Principles',
      icon: Code2,
      data: criteriaData.codeQuality ?? criteriaData.solidAndCleanCode,
      color: 'text-blue-600 dark:text-blue-400',
      barColor: 'bg-blue-500',
    },
    {
      key: 'extensibility',
      label: 'Extensibility & Maintainability',
      icon: GitBranch,
      data: criteriaData.extensibility ?? criteriaData.designPatterns,
      color: 'text-emerald-600 dark:text-emerald-400',
      barColor: 'bg-emerald-500',
    },
    {
      key: 'concurrencyAndEdgeCases',
      label: 'Concurrency & Edge Cases',
      icon: Cpu,
      data: criteriaData.concurrencyAndEdgeCases,
      color: 'text-amber-600 dark:text-amber-400',
      barColor: 'bg-amber-500',
    },
    {
      key: 'testingAndCorrectness',
      label: 'Testing & Verification',
      icon: FlaskConical,
      data: criteriaData.testingAndCorrectness,
      color: 'text-sky-600 dark:text-sky-400',
      barColor: 'bg-sky-500',
    },
  ].filter((item) => item.data !== undefined);

  const isLowScore = report.overallScore <= 25;

  const normalizedStrengths: StrengthItem[] = (report.strengths || []).map((s, idx) => {
    if (typeof s === 'string') {
      return {
        area: `Architectural Strength #${idx + 1}`,
        description: s,
      };
    }
    return s;
  });

  const improvements: ImprovementItem[] = report.improvements || [];

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        <h2 className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
          LLD Bar Raiser Assessment
        </h2>
      }
      subtitle={
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Evaluated against Problem Analysis, Class Design, Code Quality, Extensibility, and Testing
        </p>
      }
      icon={
        <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 flex items-center justify-center shadow-inner">
          <ClipboardCheck className="w-5 h-5" />
        </div>
      }
      maxWidth="max-w-4xl"
      maxHeight="max-h-[92vh]"
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/85 backdrop-blur-md p-4 select-none duration-150"
      cardClassName="bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#3f3f46] rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col"
      headerClassName="flex items-center justify-between px-6 py-4 border-b border-slate-300 dark:border-[#2d2d35] bg-slate-50 dark:bg-[#141416]"
      footer={
        <div className="px-6 py-4 border-t border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#141416] flex items-center justify-between">
          <div className="text-[11px] text-slate-500 dark:text-zinc-500 font-mono">
            Evaluated at: {new Date(report.evaluatedAt).toLocaleTimeString()}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onReevaluate}
              disabled={isEvaluating}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:active:bg-zinc-900 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
            >
              Re-run Evaluation
            </button>

            <button
              onClick={onClose}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
            >
              Close Scorecard
            </button>
          </div>
        </div>
      }
    >
        <div className="p-6 space-y-6 overflow-y-auto flex-1 select-text text-xs">
          {isLowScore && (
            <AlertBanner variant="amber" className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-700 dark:text-amber-300 block mb-1">Incomplete Implementation</span>
                The submitted codebase contains only initial skeletons or placeholder logic. In real interviews, domain models and core operations must be coded before scoring high on class design.
              </div>
            </AlertBanner>
          )}

          <div className="flex items-center justify-between bg-slate-50 dark:bg-[#141417] px-6 py-4 rounded-xl border border-slate-300 dark:border-zinc-800/80 shadow-sm">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-0.5">
                Evaluation Score
              </span>
              <span className="text-sm text-slate-600 dark:text-zinc-300">
                Overall performance across Low-Level Design rubrics
              </span>
            </div>

            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-4xl font-black bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 dark:from-amber-400 dark:via-yellow-300 dark:to-amber-200 bg-clip-text text-transparent">
                {report.overallScore}
              </span>
              <span className="text-sm font-medium text-slate-400 dark:text-zinc-500">/100</span>
            </div>
          </div>

          {report.summary && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                Architectural Assessment
              </span>
              <div className="bg-slate-50 dark:bg-[#141416] p-4 rounded-xl border border-slate-300 dark:border-zinc-800/80 text-slate-800 dark:text-zinc-200 leading-relaxed">
                <MarkdownViewer content={report.summary} />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-purple-500 dark:text-purple-400" />
              Evaluation Dimensions
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {criteriaList.map((item) => {
                const score = item.data?.score ?? 0;
                const pct = Math.round((score / 20) * 100);
                const Icon = item.icon;

                return (
                  <div
                    key={item.key}
                    className="bg-slate-50 dark:bg-[#141417] p-4 rounded-xl border border-slate-300 dark:border-zinc-800/80 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${item.color}`} />
                        <span className="font-semibold text-slate-800 dark:text-zinc-100 text-sm">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${item.barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="font-mono text-sm text-slate-800 dark:text-zinc-200 w-9 text-right font-bold">
                          {score}/20
                        </span>
                      </div>
                    </div>

                    {item.data?.feedback && (
                      <p className="text-sm text-slate-600 dark:text-zinc-300 leading-relaxed border-t border-slate-300 dark:border-zinc-800/60 pt-2.5">
                        {item.data.feedback}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {normalizedStrengths.length > 0 && (
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                Key Strengths ({normalizedStrengths.length})
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {normalizedStrengths.map((str, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                        ✓
                      </div>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                        {str.area}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-zinc-300 leading-relaxed text-sm pl-7">
                      {str.description}
                    </p>
                    {str.codeSnippet && (
                      <div className="pl-7 pt-1">
                        <CodeHighlighter code={str.codeSnippet} language={language} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {improvements.length > 0 && (
            <div className="space-y-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                Recommended Improvements ({improvements.length})
              </span>

              <div className="space-y-4">
                {improvements.map((imp, idx) => {
                  const hasSnippet = Boolean(imp.codeSnippet && imp.codeSnippet.trim().length > 0);
                  const hasDiagram = Boolean(imp.diagram && imp.diagram.trim().length > 0);

                  return (
                    <div
                      key={idx}
                      className="rounded-2xl bg-slate-50 dark:bg-[#141417] border border-slate-300 dark:border-zinc-800 overflow-hidden shadow-sm space-y-3 p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 dark:border-zinc-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold font-mono">
                            {idx + 1}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-sm tracking-tight">
                              {imp.area}
                            </h3>
                          </div>
                        </div>

                        {imp.category && (
                          <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider bg-slate-200 text-slate-700 border border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                            {imp.category}
                          </span>
                        )}
                      </div>

                      <div className="text-slate-800 dark:text-zinc-200 text-sm leading-relaxed space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block">
                          Diagnosis & Solution
                        </span>
                        <p className="text-slate-600 dark:text-zinc-300">
                          {imp.suggestion}
                        </p>
                      </div>

                      {imp.whyItMatters && (
                        <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-2.5 text-sm">
                          <Lightbulb className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-amber-700 dark:text-amber-300 block text-xs mb-0.5">
                              Why Interviewers Look For This
                            </span>
                            <span className="text-slate-600 dark:text-zinc-300 text-xs leading-relaxed">
                              {imp.whyItMatters}
                            </span>
                          </div>
                        </div>
                      )}

                      {hasDiagram && (
                        <div className="pt-1">
                          <MermaidViewer chart={imp.diagram!} />
                        </div>
                      )}

                      {hasSnippet && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                            <Code2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                            Refactored Implementation
                          </span>
                          <CodeHighlighter code={imp.codeSnippet!} language={language} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
    </ModalShell>
  );
};
