import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sanitizeProblemStatement } from '../utils/problemText';
import { MermaidViewer } from './MermaidViewer';
import { CodeHighlighter } from './CodeHighlighter';

interface MarkdownViewerProps {
  content: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content }) => {
  const sanitized = sanitizeProblemStatement(content).statement;

  return (
    <div className="space-y-0.5 select-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-300 dark:border-[#33333d] pb-1.5 mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide mt-3.5 mb-1.5">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-slate-800 dark:text-zinc-100 mt-2.5 mb-1">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-medium text-slate-700 dark:text-zinc-300 mt-2 mb-1">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed my-1.5">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="space-y-1 my-2 pl-4 list-disc marker:text-slate-400 dark:marker:text-zinc-500 text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-1 my-2 pl-4 list-decimal marker:text-slate-400 dark:marker:text-zinc-500 text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <div className="p-3 my-2 rounded-lg bg-slate-100 dark:bg-[#18181b] border-l-2 border-blue-500 text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">{children}</div>
          ),
          pre: ({ children }) => <div className="my-2.5">{children}</div>,
          code: ({ className, children }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            if (match) {
              const lang = match[1].toLowerCase();
              const text = String(children ?? '').replace(/\n$/, '');
              if (lang === 'mermaid') return <MermaidViewer chart={text} />;
              return <CodeHighlighter code={text} language={lang} />;
            }
            return (
              <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 font-mono text-[11px] border border-slate-300 dark:border-zinc-700 mx-0.5">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-slate-300 dark:border-zinc-800">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1.5 bg-slate-100 dark:bg-zinc-800 text-left font-semibold text-slate-800 dark:text-zinc-100">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-2 py-1.5 border-t border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300">{children}</td>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">{children}</a>
          ),
          hr: () => <hr className="my-3 border-slate-300 dark:border-zinc-800" />,
        }}
      >
        {sanitized}
      </ReactMarkdown>
    </div>
  );
};
