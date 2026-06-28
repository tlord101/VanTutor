
import React from 'react';

export const StudyGuideIcon: React.FC<{ active?: boolean; className?: string }> = ({ active, className = 'w-6 h-6' }) => {
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
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 1} />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 1} />
    </svg>
  );
};
