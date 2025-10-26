import React from 'react';

export const PremiumIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
    <svg xmlns="http://www.w.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 15L22 7l-10-5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 7l10 15L22 7" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20" />
    </svg>
);