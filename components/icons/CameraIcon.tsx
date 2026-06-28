import React from 'react';

export const CameraIcon: React.FC<{ active?: boolean; className?: string }> = ({ active, className = 'w-6 h-6' }) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth={2.2} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 1} />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
};