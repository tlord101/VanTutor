import React, { useState, useEffect } from 'react';
import { HomeIcon } from './icons/HomeIcon';
import { CameraIcon } from './icons/CameraIcon';
import { StudyGuideIcon } from './icons/StudyGuideIcon';

interface BottomNavBarProps {
  activeItem: string;
  onItemClick: (id: string) => void;
  isVisible: boolean;
}

const navItems = [
  { id: 'study_guide', icon: <StudyGuideIcon />, label: 'Guide' },
  { id: 'dashboard', icon: <HomeIcon />, label: 'Home' },
  { id: 'visual_solver', icon: <CameraIcon />, label: 'Solver' },
];

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeItem, onItemClick, isVisible }) => {
  const [activeIndex, setActiveIndex] = useState(1);

  useEffect(() => {
    const currentIndex = navItems.findIndex(item => item.id === activeItem);
    if (currentIndex !== -1) {
      setActiveIndex(currentIndex);
    }
  }, [activeItem]);

  if (!isVisible) {
      return null;
  }

  // These classes use calc() to position the center of the 3.5rem bubble at 1/6, 3/6 (1/2), and 5/6 of the container width.
  const positionClasses = [
    'left-[calc(16.666%-1.75rem)]', 
    'left-[calc(50%-1.75rem)]', 
    'left-[calc(83.333%-1.75rem)]'
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 p-4 flex justify-center z-30 md:hidden animate-fade-in-up">
      <div className="relative w-full max-w-xs h-16 bg-white/80 backdrop-blur-xl rounded-full shadow-2xl border border-white/30">
        
        {/* The moving bubble that provides the "cutout" effect */}
        <div 
          className={`absolute -top-3 w-14 h-14 bg-gray-100 rounded-full transition-all duration-500 ease-[cubic-bezier(0.68,-0.55,0.27,1.55)] ${positionClasses[activeIndex]}`}
        />

        {/* The active icon that moves with the bubble */}
        <div
          className={`absolute -top-3 w-14 h-14 rounded-full bg-gradient-to-tr from-lime-500 to-teal-500 flex items-center justify-center text-white shadow-lg transition-all duration-500 ease-[cubic-bezier(0.68,-0.55,0.27,1.55)] ${positionClasses[activeIndex]}`}
        >
          {React.cloneElement(navItems[activeIndex].icon, { className: 'w-8 h-8' })}
        </div>
        
        {/* The static, clickable placeholders */}
        <div className="flex justify-around items-center h-full">
          {navItems.map((item, index) => (
            <button
              key={item.id}
              onClick={() => onItemClick(item.id)}
              className="flex-1 flex flex-col items-center justify-center h-full text-gray-500 transition-colors"
              aria-label={item.label}
            >
              {/* This icon is hidden when its tab is active */}
              <div className={`transition-opacity duration-300 ${activeIndex === index ? 'opacity-0' : 'opacity-100'}`}>
                {React.cloneElement(item.icon, { className: 'w-7 h-7' })}
              </div>
              {/* This label is hidden when its tab is active */}
              <span className={`text-xs mt-1 transition-all duration-300 ${activeIndex === index ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};
