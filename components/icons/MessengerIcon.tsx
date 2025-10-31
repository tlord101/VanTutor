import React from 'react';

export const MessengerIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24">
        {/* Green outline of the speech bubble */}
        <path 
            d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" 
            stroke="#65a30d" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
        />
        {/* Bigger green lightning bolt in the middle */}
        <path 
            d="M16 5 L 9 14 H 13 L 8 21 L 17 12 H 13 L 16 5 Z" 
            fill="#65a30d" 
        />
    </svg>
);