import React from 'react';
import type { NavItem } from '../types';
import { LogoIcon } from './icons/LogoIcon';
import { navigationItems, secondaryNavigationItems } from '../constants';


// SVG icons defined directly in the component to avoid creating new files
const LogoutIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

interface SidebarProps {
  activeItem: string;
  onItemClick: (id: string) => void;
  isExpanded: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  displayName: string | null;
  onLogout: () => void;
  isMobileSidebarOpen: boolean;
  onCloseMobileSidebar: () => void;
}

const NavButton: React.FC<{
    item: NavItem;
    isActive: boolean;
    isExpanded: boolean;
    onClick: () => void;
}> = ({ item, isActive, isExpanded, onClick }) => (
    <li className="relative">
        <button
            onClick={onClick}
            className={`w-full flex items-center p-3 rounded-lg text-left transition-colors duration-300 ease-in-out group
            ${isExpanded ? 'justify-start' : 'justify-center'}
            ${
                isActive
                ? 'bg-lime-100 text-lime-800 font-semibold'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
        >
            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-lime-500 rounded-r-full"></div>}
            <span className={`flex-shrink-0 transition-all duration-300 ease-in-out ${isExpanded ? 'mr-4' : 'mr-0'}`}>{item.icon}</span>
            <span className={`font-medium whitespace-nowrap overflow-hidden transition-opacity duration-300 ease-in-out ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                {item.label}
            </span>
        </button>
    </li>
);

export const Sidebar: React.FC<SidebarProps> = ({ activeItem, onItemClick, isExpanded, onMouseEnter, onMouseLeave, displayName, onLogout, isMobileSidebarOpen, onCloseMobileSidebar }) => {
  
  const handleMobileItemClick = (id: string) => {
    onItemClick(id);
    onCloseMobileSidebar();
  };

  const handleMobileLogout = () => {
    onLogout();
    onCloseMobileSidebar();
  }

  const sidebarContent = (
    <div className="h-full p-4 flex flex-col">
      {/* Top Section: Logo */}
      <div className="flex items-center mb-10 flex-shrink-0">
        <LogoIcon className="w-10 h-10 text-lime-500 flex-shrink-0" />
        <h1 className={`text-2xl font-bold bg-gradient-to-b from-lime-500 to-green-600 text-transparent bg-clip-text tracking-wider ml-3 whitespace-nowrap overflow-hidden transition-opacity duration-300 ease-in-out ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
          VANTUTOR
        </h1>
      </div>
      
      {/* Middle Section: Navigation */}
      <nav className="flex-grow overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <p className={`text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 transition-opacity duration-300 ease-in-out ${isExpanded ? 'pl-3 opacity-100' : 'opacity-0'}`}>Menu</p>
        <ul className="space-y-2">
          {navigationItems.map((item) => (
              <NavButton key={item.id} item={item} isActive={activeItem === item.id} isExpanded={isExpanded} onClick={() => onItemClick(item.id)} />
          ))}
        </ul>
      </nav>
      
      {/* Bottom Section: Profile & Logout */}
      <div className="flex-shrink-0">
         <ul className="space-y-2 pt-4 border-t border-gray-200">
              {secondaryNavigationItems.map((item) => (
                  <NavButton key={item.id} item={item} isActive={activeItem === item.id} isExpanded={isExpanded} onClick={() => onItemClick(item.id)} />
              ))}
               <li>
                  <button
                      onClick={onLogout}
                      className={`w-full flex items-center p-3 rounded-lg text-left transition-colors duration-300 ease-in-out text-gray-600 hover:bg-red-100 hover:text-red-600 group
                      ${isExpanded ? 'justify-start' : 'justify-center'}`}
                  >
                      <span className={`flex-shrink-0 transition-all duration-300 ease-in-out ${isExpanded ? 'mr-4' : 'mr-0'}`}><LogoutIcon /></span>
                      <span className={`font-medium whitespace-nowrap overflow-hidden transition-opacity duration-300 ease-in-out ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                          Logout
                      </span>
                  </button>
              </li>
         </ul>
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-24 mt-4 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="p-3 rounded-lg bg-gray-100">
                  <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0 items-center justify-center flex text-white font-bold">
                        {displayName ? displayName.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="ml-3 overflow-hidden">
                          <p className="text-sm font-semibold text-gray-800 truncate">{displayName}</p>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`hidden md:flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out z-20 ${
          isExpanded ? 'w-64' : 'w-20'
        }`}
      >
        <div className="h-full bg-white/80 backdrop-blur-xl border border-gray-200 rounded-2xl">
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <div
        className={`fixed inset-0 z-40 transform transition-transform duration-300 ease-in-out md:hidden ${
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-title"
      >
        {/* Overlay */}
        <div
            className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm"
            onClick={onCloseMobileSidebar}
            aria-hidden="true"
        ></div>

        {/* Sidebar Panel */}
        <div className="relative w-64 h-full bg-white/95 backdrop-blur-xl border-r border-gray-200 p-4 flex flex-col">
            <div className="flex items-center mb-10 flex-shrink-0">
                <LogoIcon className="w-10 h-10 text-lime-500 flex-shrink-0" />
                <h1 id="mobile-menu-title" className="text-2xl font-bold bg-gradient-to-b from-lime-500 to-green-600 text-transparent bg-clip-text tracking-wider ml-3">
                    VANTUTOR
                </h1>
            </div>

            <nav className="flex-grow overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 pl-3">Menu</p>
                <ul className="space-y-2">
                    {navigationItems.map((item) => (
                        <NavButton key={item.id} item={item} isActive={activeItem === item.id} isExpanded={true} onClick={() => handleMobileItemClick(item.id)} />
                    ))}
                </ul>
            </nav>

            <div className="flex-shrink-0">
                <ul className="space-y-2 pt-4 border-t border-gray-200">
                    {secondaryNavigationItems.map((item) => (
                        <NavButton key={item.id} item={item} isActive={activeItem === item.id} isExpanded={true} onClick={() => handleMobileItemClick(item.id)} />
                    ))}
                    <li>
                        <button
                            onClick={handleMobileLogout}
                            className="w-full flex items-center p-3 rounded-lg text-left transition-colors duration-300 ease-in-out text-gray-600 hover:bg-red-100 hover:text-red-600 group justify-start"
                        >
                            <span className="flex-shrink-0 mr-4"><LogoutIcon /></span>
                            <span className="font-medium">Logout</span>
                        </button>
                    </li>
                </ul>
                <div className="mt-4 p-3 rounded-lg bg-gray-100">
                    <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0 items-center justify-center flex text-white font-bold">
                            {displayName ? displayName.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div className="ml-3 overflow-hidden">
                            <p className="text-sm font-semibold text-gray-800 truncate">{displayName}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    </>
  );
};