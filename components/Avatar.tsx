
import React from 'react';

// A simple hash function to get a consistent color from a string (e.g., user ID or name)
const generateColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = `hsl(${hash % 360}, 70%, 80%)`;
  const textColor = `hsl(${hash % 360}, 70%, 25%)`;
  return { backgroundColor: color, textColor: textColor };
};

interface AvatarProps {
  display_name: string | null;
  photo_url?: string | null;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ display_name, photo_url, className = 'w-8 h-8' }) => {
  if (photo_url) {
    return (
      <img
        src={photo_url}
        alt={display_name || 'Profile'}
        className={`rounded-full object-cover flex-shrink-0 bg-gray-200 ${className}`}
        onError={(e) => (e.currentTarget.style.display = 'none')} // Hide if image fails to load
      />
    );
  }

  const name = display_name || '?';
  const initial = name.charAt(0).toUpperCase();
  const { backgroundColor, textColor } = generateColor(name);

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold flex-shrink-0 ${className}`}
      style={{ backgroundColor, color: textColor }}
    >
      {initial}
    </div>
  );
};
