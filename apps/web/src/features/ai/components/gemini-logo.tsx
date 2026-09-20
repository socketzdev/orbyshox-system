import React from 'react';

interface GeminiLogoProps {
  className?: string;
  size?: number;
}

export const GeminiLogo: React.FC<GeminiLogoProps> = ({
  className = 'w-4 h-4',
  size,
}) => {
  const style = size ? { width: `${size}px`, height: `${size}px` } : undefined;
  const id = React.useId();

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      style={style}
      aria-label="Google Gemini"
    >
      <defs>
        <linearGradient id={`gemini-grad-${id}`} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1B73E8" />
          <stop offset="30%" stopColor="#4285F4" />
          <stop offset="60%" stopColor="#A855F7" />
          <stop offset="85%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#EF4444" />
        </linearGradient>
      </defs>
      <path
        d="M12 0C12 6.62742 6.62742 12 0 12C6.62742 12 12 17.3726 12 24C12 17.3726 17.3726 12 24 12C17.3726 12 12 6.62742 12 0Z"
        fill={`url(#gemini-grad-${id})`}
      />
    </svg>
  );
};
