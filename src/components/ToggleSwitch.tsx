import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange?: () => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  ariaLabel?: string;
  activeColor?: string;
  inactiveColor?: string;
  trackOnly?: boolean;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  size = 'sm',
  disabled,
  ariaLabel,
  activeColor = 'bg-blue-600',
  inactiveColor = 'bg-slate-300 dark:bg-zinc-700',
  trackOnly = false,
}) => {
  if (trackOnly) {
    return (
      <div
        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-150 ${
          checked ? activeColor : inactiveColor
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-150 mt-0.5 ${
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </div>
    );
  }

  if (size === 'md') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={onChange}
        disabled={disabled}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? activeColor : inactiveColor
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors duration-150 focus:outline-none disabled:cursor-wait ${
        checked ? activeColor : inactiveColor
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-150 mt-0.5 ${
          checked ? 'translate-x-3.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
};
