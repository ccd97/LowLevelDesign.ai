import React from 'react';

type AlertVariant = 'amber' | 'rose' | 'emerald';

interface AlertBannerProps {
  variant: AlertVariant;
  className?: string;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-200',
  rose: 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300',
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
};

export const AlertBanner: React.FC<AlertBannerProps> = ({ variant, className = '', children }) => {
  return (
    <div className={`p-3 rounded-lg border text-xs ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </div>
  );
};
