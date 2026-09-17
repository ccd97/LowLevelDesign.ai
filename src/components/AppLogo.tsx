import React from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  size = 28,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="18 16 92 92"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id="appLogoTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>

        <linearGradient id="appLogoMid" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>

        <linearGradient id="appLogoBot" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>

        <filter id="appLogoGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <g filter="url(#appLogoGlow)">
        <path
          d="M64 24 L96 42 L64 60 L32 42 Z"
          fill="url(#appLogoTop)"
          fillOpacity="0.25"
          stroke="url(#appLogoTop)"
          strokeWidth="2.75"
          strokeLinejoin="round"
        />

        <path
          d="M64 45 L96 63 L64 81 L32 63 Z"
          fill="url(#appLogoMid)"
          fillOpacity="0.2"
          stroke="url(#appLogoMid)"
          strokeWidth="2.75"
          strokeLinejoin="round"
        />

        <path
          d="M64 66 L96 84 L64 102 L32 84 Z"
          fill="url(#appLogoBot)"
          fillOpacity="0.25"
          stroke="url(#appLogoBot)"
          strokeWidth="2.75"
          strokeLinejoin="round"
        />

        <path
          d="M46 50 L46 70 L55 75"
          stroke="#38bdf8"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <circle cx="46" cy="50" r="3" fill="#38bdf8" />
        <circle cx="55" cy="75" r="2.5" fill="#818cf8" />

        <line
          x1="64"
          y1="42"
          x2="64"
          y2="84"
          stroke="#38bdf8"
          strokeWidth="2"
          strokeDasharray="2 3"
          opacity="0.8"
          strokeLinecap="round"
        />
        <circle cx="64" cy="42" r="3.25" fill="#38bdf8" />
        <circle cx="64" cy="63" r="2.75" fill="#60a5fa" />
        <circle cx="64" cy="84" r="3.25" fill="#c084fc" />

        <path
          d="M82 52 L82 72 L73 77"
          stroke="#c084fc"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <circle cx="82" cy="52" r="3" fill="#38bdf8" />
        <circle cx="73" cy="77" r="2.5" fill="#c084fc" />
      </g>
    </svg>
  );
};
