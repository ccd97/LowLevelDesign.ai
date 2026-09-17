import React, { useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-json';
import { CopyButton } from './CopyButton';
import { detectSnippetLanguage } from '../utils/codeAnalysis';

interface CodeHighlighterProps {
  code: string;
  language?: string;
  className?: string;
}

export const CodeHighlighter: React.FC<CodeHighlighterProps> = ({
  code,
  language,
  className = '',
}) => {
  // Auto-detect language if not explicitly provided
  const detectedLang = useMemo(() => {
    if (language) {
      const lower = language.toLowerCase();
      if (lower.includes('py')) return 'python';
      if (lower.includes('java')) return 'java';
      if (lower.includes('json')) return 'json';
      if (lower === 'python' || lower === 'java') return lower;
    }
    const detected = detectSnippetLanguage(code);
    return detected === 'unknown' ? 'python' : detected;
  }, [code, language]);

  const highlightedHtml = useMemo(() => {
    const cleanCode = code.trim();
    try {
      const grammar = Prism.languages[detectedLang] || Prism.languages.javascript || Prism.languages.clike;
      if (grammar) {
        return Prism.highlight(cleanCode, grammar, detectedLang);
      }
    } catch (e) {
      console.warn('Prism highlighting error:', e);
    }
    return cleanCode
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }, [code, detectedLang]);

  return (
    <div className={`rounded-xl border border-slate-300 dark:border-zinc-800 bg-slate-50 dark:bg-[#121214] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-[#18181b] border-b border-slate-300 dark:border-zinc-800 text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
        <span className="text-emerald-600 dark:text-emerald-400 font-semibold uppercase text-[10px] tracking-wider">
          {detectedLang}
        </span>
        <CopyButton
          text={code}
          className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white px-2 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 transition-colors text-[10px]"
        />
      </div>

      <pre className="p-3.5 font-mono text-[11px] leading-relaxed overflow-x-auto text-slate-800 dark:text-zinc-200">
        <code
          className={`language-${detectedLang}`}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
};
