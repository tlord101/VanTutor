import React, { useRef, useEffect } from 'react';
import { Search, RefreshCw, Settings, Menu, Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from './ThemeProvider';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onToggleMobileMenu: () => void;
  onLogout: () => void;
  isSyncing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onRefresh,
  onOpenSettings,
  onToggleMobileMenu,
  onLogout,
  isSyncing = false
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme } = useTheme();

  // Keyboard shortcut: '/' to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="h-16 border-b border-gray-200 dark:border-darkBorder bg-white dark:bg-darkSurface px-4 flex items-center justify-between gap-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="p-2 text-gray-600 dark:text-darkTextSecondary hover:bg-gray-100 dark:hover:bg-darkBorder rounded-lg md:hidden"
          title="Open Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 max-w-2xl relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search emails... (Press '/' to focus)"
          className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-darkBg border border-transparent focus:border-blue-500 rounded-xl text-sm text-gray-900 dark:text-darkTextPrimary placeholder-gray-400 focus:outline-none transition-all"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          disabled={isSyncing}
          className="p-2 text-gray-600 dark:text-darkTextSecondary hover:bg-gray-100 dark:hover:bg-darkBorder rounded-lg transition-colors disabled:opacity-50"
          title="Refresh / Sync Emails"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-500' : ''}`} />
        </button>

        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 text-gray-600 dark:text-darkTextSecondary hover:bg-gray-100 dark:hover:bg-darkBorder rounded-lg transition-colors"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          onClick={onOpenSettings}
          className="p-2 text-gray-600 dark:text-darkTextSecondary hover:bg-gray-100 dark:hover:bg-darkBorder rounded-lg transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-gray-200 dark:bg-darkBorder mx-1" />

        <button
          onClick={onLogout}
          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
