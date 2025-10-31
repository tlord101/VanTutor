import React from 'react';

export const MessengerIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className={className}>
        {/* Speech bubble ellipse */}
        <ellipse cx="256" cy="256" rx="200" ry="160" fill="#34C759"/>
        
        {/* Tail of speech bubble */}
        <path d="M140 380 Q115 430 80 480 Q130 420 170 390 Z" fill="#34C759"/>
        
        {/* Three dots */}
        <circle cx="190" cy="256" r="28" fill="#FFFFFF"/>
        <circle cx="256" cy="256" r="28" fill="#FFFFFF"/>
        <circle cx="322" cy="256" r="28" fill="#FFFFFF"/>
    </svg>
);