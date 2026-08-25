import React from 'react';
import { Mail, Star, Archive, Trash2, Plus, Settings } from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  currentFolder: string;
  onSelectFolder: (folder: string) => void;
  unreadCount?: number;
  onOpenSettings: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentFolder,
  onSelectFolder,
  unreadCount = 0,
  onOpenSettings,
  isMobileOpen,
  onCloseMobile
}) => {
  const items = [
    { id: 'inbox', label: 'Inbox', icon: Mail, count: unreadCount },
    { id: 'starred', label: 'Starred', icon: Star },
    { id: 'archive', label: 'Archive', icon: Archive },
    { id: 'trash', label: 'Trash', icon: Trash2 },
  ];

  const content = (
    <div className="w-64 h-full flex flex-col bg-white dark:bg-darkSurface border-r border-gray-200 dark:border-darkBorder p-4">
      <div className="flex items-center gap-2 px-2 py-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
          V
        </div>
        <span className="font-bold text-xl tracking-tight text-gray-900 dark:text-darkTextPrimary">
          VBox
        </span>
      </div>

      <button className="flex items-center justify-center gap-2 w-full py-2.5 px-4 mb-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-all active:scale-95">
        <Plus className="w-5 h-5" />
        <span>Compose</span>
      </button>

      <nav className="flex-1 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentFolder === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectFolder(item.id);
                if (onCloseMobile) onCloseMobile();
              }}
              className={cn(
                'flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-darkTextSecondary hover:bg-gray-100 dark:hover:bg-darkBorder/50 hover:text-gray-900 dark:hover:text-darkTextPrimary'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn('w-4 h-4', isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-darkTextSecondary')} />
                <span>{item.label}</span>
              </div>
              {item.count && item.count > 0 ? (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-gray-200 dark:border-darkBorder">
        <button
          onClick={() => {
            onOpenSettings();
            if (onCloseMobile) onCloseMobile();
          }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-darkTextSecondary hover:bg-gray-100 dark:hover:bg-darkBorder/50 hover:text-gray-900 dark:hover:text-darkTextPrimary transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:block h-full">{content}</div>
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onCloseMobile} />
          <div className="relative z-10 w-64 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
