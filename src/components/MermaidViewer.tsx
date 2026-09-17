import React, { useEffect, useRef, useState, useId } from 'react';
import mermaid from 'mermaid';
import { Code, Eye, AlertCircle } from 'lucide-react';
import { stripCodeFences } from '../utils/json';
import { CopyButton } from './CopyButton';

interface MermaidViewerProps {
  chart: string;
  className?: string;
}

let currentMermaidTheme: 'dark' | 'light' | null = null;

function initializeMermaidForTheme(isDark: boolean) {
  const desired = isDark ? 'dark' : 'light';
  if (currentMermaidTheme === desired) return;

  const vars = isDark
    ? {
        darkMode: true,
        background: '#18181b',
        primaryColor: '#3b82f6',
        primaryTextColor: '#f4f4f5',
        primaryBorderColor: '#60a5fa',
        lineColor: '#94a3b8',
        secondaryColor: '#8b5cf6',
        tertiaryColor: '#1e293b',
        edgeLabelBackground: '#1e1e24',
        nodeBorder: '#3f3f46',
        clusterBkg: '#141416',
        clusterBorder: '#27272a',
        titleColor: '#f4f4f5',
      }
    : {
        darkMode: false,
        background: '#ffffff',
        primaryColor: '#3b82f6',
        primaryTextColor: '#0f172a',
        primaryBorderColor: '#2563eb',
        lineColor: '#64748b',
        secondaryColor: '#8b5cf6',
        tertiaryColor: '#f1f5f9',
        edgeLabelBackground: '#f8fafc',
        nodeBorder: '#b8c5d6',
        clusterBkg: '#f8fafc',
        clusterBorder: '#d8dfe9',
        titleColor: '#0f172a',
      };

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'loose',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    themeVariables: vars,
  });
  currentMermaidTheme = desired;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ chart, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const uniqueId = useId().replace(/:/g, '_');

  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const cleanChart = React.useMemo(() => {
    let text = stripCodeFences(chart, ['mermaid']).trim();
    if (!text) return '';
    text = text.replace(/\binterface\s+([A-Za-z0-9_]+)\s*\{/g, 'class $1 {\n        <<interface>>');
    text = text.replace(/\benum\s+([A-Za-z0-9_]+)\s*\{/g, 'class $1 {\n        <<enumeration>>');
    return text;
  }, [chart]);

  useEffect(() => {
    let isMounted = true;
    initializeMermaidForTheme(isDark);

    const renderChart = async () => {
      if (!cleanChart) {
        setSvgContent('');
        setError(null);
        return;
      }

      try {
        const renderId = `mermaid_${uniqueId}_${Date.now()}`;
        const { svg } = await mermaid.render(renderId, cleanChart);
        if (isMounted) {
          setSvgContent(svg);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Mermaid rendering error:', err);
          setError(err?.message || 'Failed to render diagram');
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [cleanChart, uniqueId, isDark]);

  if (!cleanChart) return null;

  return (
    <div className={`rounded-xl border border-slate-300 dark:border-zinc-800 bg-slate-50 dark:bg-[#141416] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-[#18181b] border-b border-slate-300 dark:border-zinc-800 text-[11px] text-slate-600 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            Architecture Diagram
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors text-[10px]"
            title={showRaw ? 'Show rendered diagram' : 'View diagram source code'}
          >
            {showRaw ? (
              <>
                <Eye className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                <span>Render</span>
              </>
            ) : (
              <>
                <Code className="w-3 h-3 text-slate-500 dark:text-zinc-400" />
                <span>Source</span>
              </>
            )}
          </button>

          <CopyButton
            text={cleanChart}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors text-[10px]"
            title="Copy diagram source"
          />
        </div>
      </div>

      <div className="p-4 flex items-center justify-center overflow-x-auto min-h-[140px] bg-white dark:bg-[#121214]">
        {showRaw ? (
          <pre className="w-full font-mono text-[11px] text-slate-800 dark:text-zinc-300 bg-slate-50 dark:bg-[#18181b] p-3 rounded-lg border border-slate-300 dark:border-zinc-800 overflow-x-auto">
            <code>{cleanChart}</code>
          </pre>
        ) : error ? (
          <div className="w-full space-y-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs p-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Diagram preview unavailable. Displaying diagram blueprint:</span>
            </div>
            <pre className="w-full font-mono text-[11px] text-slate-800 dark:text-zinc-300 bg-slate-50 dark:bg-[#18181b] p-3 rounded-lg border border-slate-300 dark:border-zinc-800 overflow-x-auto">
              <code>{cleanChart}</code>
            </pre>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>
    </div>
  );
};
