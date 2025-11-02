import React, { useState, useEffect } from 'react';
import { HomeIcon } from './icons/HomeIcon';
import { CameraIcon } from './icons/CameraIcon';
import { StudyGuideIcon } from './icons/StudyGuideIcon';
import { ChatIcon } from './icons/ChatIcon';
import { MessengerIcon } from './icons/MessengerIcon';

interface BottomNavBarProps {
  activeItem: string;
  onItemClick: (id: string) => void;
  isVisible: boolean;
}

const navItems = [
  { id: 'study_guide', icon: <StudyGuideIcon />, label: 'Guide' },
  { id: 'chat', icon: <ChatIcon />, label: 'Chat' },
  { id: 'dashboard', icon: <HomeIcon />, label: 'Home' },
  { id: 'visual_solver', icon: <CameraIcon />, label: 'Solver' },
  { id: 'messenger', icon: <MessengerIcon className="w-7 h-7" />, label: 'Connect' },
];

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeItem, onItemClick, isVisible }) => {
  const [activeIndex, setActiveIndex] = useState(2); // Default to 'Home'

  useEffect(() => {
    const currentIndex = navItems.findIndex(item => item.id === activeItem);
    setActiveIndex(currentIndex); // Will be -1 if the activeItem is not in our nav array
  }, [activeItem]);

  if (!isVisible) {
      return null;
  }

  // Position classes for 5 items. The center of each item is at 10%, 30%, 50%, 70%, 90%.
  // The bubble is 3.5rem wide, so we offset by half of that (1.75rem).
  const positionClasses = [
    'left-[calc(10%-1.75rem)]',
    'left-[calc(30%-1.75rem)]',
    'left-[calc(50%-1.75rem)]',
    'left-[calc(70%-1.75rem)]',
    'left-[calc(90%-1.75rem)]',
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 flex justify-center z-30 md:hidden animate-fade-in-up bottom-nav">
      <div className="relative w-full max-w-md h-16 bg-white/80 backdrop-blur-xl rounded-full shadow-2xl border border-white/30">
        
        {/* The moving bubble that provides the "cutout" effect */}
        {activeIndex !== -1 && (
            <div 
              className={`absolute -top-3 w-14 h-14 bg-gray-100 rounded-full transition-all duration-500 ease-[cubic-bezier(0.68,-0.55,0.27,1.55)] ${positionClasses[activeIndex]}`}
            />
        )}

        {/* The active icon that moves with the bubble */}
        {activeIndex !== -1 && (
            <div
              className={`absolute -top-3 w-14 h-14 rounded-full bg-gradient-to-tr from-lime-500 to-teal-500 flex items-center justify-center text-white shadow-lg transition-all duration-500 ease-[cubic-bezier(0.68,-0.55,0.27,1.55)] ${positionClasses[activeIndex]}`}
            >
              {React.cloneElement(navItems[activeIndex].icon, { className: 'w-8 h-8' })}
            </div>
        )}
        
        {/* The static, clickable placeholders */}
        <div className="flex items-center h-full">
          {navItems.map((item, index) => (
            <button
              key={item.id}
              onClick={() => onItemClick(item.id)}
              data-tour-id={`bottomnav-${item.id}`}
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