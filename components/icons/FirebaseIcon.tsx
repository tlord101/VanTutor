import React from 'react';

export const FirebaseIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className={className}>
        <path fill="#FFCA28" d="M3.23 13.97l7.99-11.52.79.54-7.99 11.52-.79-.54z" />
        <path fill="#FFA000" d="M11.22 2.45L3.23 13.97l.79.54L12.55.83l-1.33 1.62z" />
        <path fill="#F57C00" d="M12.55.83L2.44 14.51l1.58.28L15 0 .83l-.87 2.02z" />
        <path fill="#FFC928" d="M12.55.83L.87 2.02 2.44 14.51l1.58.28L15 0l-2.45.83z" opacity=".6" />
        <path fill="#039BE5" d="M11.96 11.92l.79.54-2.81 3.54-1.33-1.62.79-.54 2.56-1.92z" />
    </svg>
);
