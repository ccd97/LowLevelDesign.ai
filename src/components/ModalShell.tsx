import React from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  maxWidth?: string;
  maxHeight?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  overlayClassName?: string;
  cardClassName?: string;
  headerClassName?: string;
  closeDisabled?: boolean;
}

const DEFAULT_OVERLAY =
  'fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4 select-none duration-150';
const DEFAULT_CARD_BASE =
  'bg-white dark:bg-[#18181b] border border-slate-300/80 dark:border-zinc-800 rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col';
const DEFAULT_HEADER =
  'flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800/80 bg-slate-50/80 dark:bg-[#141417]';

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  maxWidth = 'max-w-lg',
  maxHeight,
  footer,
  children,
  overlayClassName,
  cardClassName,
  headerClassName,
  closeDisabled = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className={overlayClassName ?? DEFAULT_OVERLAY}>
      <div className={`${cardClassName ?? DEFAULT_CARD_BASE} ${maxWidth ?? ''} ${maxHeight ?? ''}`}>
        <div className={headerClassName ?? DEFAULT_HEADER}>
          <div className="flex items-center gap-2.5">
            {icon}
            <div>
              {title}
              {subtitle}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={closeDisabled}
            title="Close"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children}

        {footer}
      </div>
    </div>
  );
};
