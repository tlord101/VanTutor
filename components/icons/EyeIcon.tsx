import React from 'react';

export const EyeIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.036 12.322a1.012 1.012 0 0 1 0-.644C3.399 8.32 7.144 5 12 5c4.856 0 8.601 3.32 9.964 6.678.114.282.114.59 0 .872C20.601 15.68 16.856 19 12 19c-4.856 0-8.601-3.32-9.964-6.678Z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
    />
  </svg>
);
