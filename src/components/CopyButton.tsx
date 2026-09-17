import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import copy from 'clipboard-copy';

interface CopyButtonProps {
  text: string;
  className?: string;
  title?: string;
  timeoutMs?: number;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  className = 'flex items-center gap-1 hover:text-slate-900 dark:hover:text-white px-2 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 transition-colors text-[10px]',
  title,
  timeoutMs = 1500,
}) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handleCopy = () => {
    copy(text).catch(() => {});
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), timeoutMs);
  };

  return (
    <button type="button" onClick={handleCopy} className={className} title={title}>
      {copied ? (
        <>
          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3 text-slate-500 dark:text-zinc-400" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
};
