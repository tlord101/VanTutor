import React from 'react';
import type { NavItem, UserProfile } from '../types';
import { navigationItems, adminNavigationItems } from '../constants';
import { Avatar } from './Avatar';
import { VerificationBadge } from './VerificationBadge';

interface SidebarProps {
  activeItem: string;
  onItemClick: (id: string) => void;
  userProfile: UserProfile | null;
  onLogout: () => void;
  isMobileSidebarOpen: boolean;
  onCloseMobileSidebar: () => void;
  items?: NavItem[];
  secondaryItems?: NavItem[];
  unreadCount?: number;
  unreadMessagesCount?: number;
}

const NavButton: React.FC<{
  item: NavItem;
  isActive: boolean;
  isExpanded: boolean;
  isModal?: boolean;
  onClick: () => void;
  unreadMessagesCount?: number;
}> = ({ item, isActive, isExpanded, isModal, onClick, unreadMessagesCount = 0 }) => {
  if (isModal) {
    return (
      <li className="relative">
        <button
          onClick={onClick}
          data-tour-id={`sidebar-${item.id}`}
          className={`w-full flex flex-col items-center justify-center p-3 rounded-2xl gap-2 text-center h-full transition-colors ${
            isActive
              ? 'bg-neutral-100 text-black font-semibold'
              : 'bg-white text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <span className={`flex-shrink-0 ${isActive ? 'text-black' : 'text-neutral-800'}`}>{item.icon}</span>
          <span className="font-medium text-xs leading-tight">{item.label}</span>
          {item.id === 'messenger' && unreadMessagesCount > 0 && (
            <span className="absolute top-2 right-2 flex h-2.5 w-2.5 rounded-full bg-black ring-2 ring-white" />
          )}
        </button>
      </li>
    );
  }

  return (
    <li className="relative">
      <button
        onClick={onClick}
        data-tour-id={`sidebar-${item.id}`}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
          isExpanded ? 'justify-start' : 'justify-center'
        } ${
          isActive
            ? 'bg-neutral-100 text-black font-semibold'
            : 'text-neutral-700 hover:bg-neutral-50 hover:text-black'
        }`}
      >
        <span className={`flex-shrink-0 ${isActive ? 'text-black' : 'text-neutral-800'}`}>{item.icon}</span>
        <span
          className={`font-medium overflow-hidden transition-opacity flex-1 text-sm ${
            isExpanded ? 'opacity-100 whitespace-nowrap' : 'opacity-0 whitespace-nowrap'
          }`}
        >
          {item.label}
        </span>
        {isExpanded && item.id === 'messenger' && unreadMessagesCount > 0 && (
          <span className="bg-black text-white text-[9px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
            {unreadMessagesCount}
          </span>
        )}
        {!isExpanded && item.id === 'messenger' && unreadMessagesCount > 0 && (
          <span className="absolute top-2 right-2 flex h-2 w-2 rounded-full bg-black ring-2 ring-white" />
        )}
      </button>
    </li>
  );
};

const SidebarContent: React.FC<{
  isExpanded: boolean;
  isModal?: boolean;
  activeItem: string;
  onItemClick: (id: string) => void;
  userProfile: UserProfile | null;
  items?: NavItem[];
  unreadCount?: number;
  unreadMessagesCount?: number;
}> = ({
  isExpanded,
  isModal,
  activeItem,
  onItemClick,
  userProfile,
  items = navigationItems,
  unreadCount = 0,
  unreadMessagesCount = 0,
}) => (
  <div className="h-full p-4 flex flex-col bg-white">
    <div className={`flex items-center flex-shrink-0 px-2 pt-2 ${isModal ? 'mb-6 justify-center' : 'mb-8'}`}>
      {isExpanded ? (
        <img src="/logo_full_black.png" alt="AVELUT Logo" className={`object-contain ${isModal ? 'h-8' : 'h-9'}`} />
      ) : (
        <img src="/logo_icon_black_glyph.png" alt="AVELUT Logo" className="w-9 h-9 object-contain" />
      )}
    </div>

    <nav className="flex-grow overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {!isModal && (
        <p
          className={`text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-3 ${
            isExpanded ? 'pl-3 opacity-100' : 'opacity-0'
          }`}
        >
          Menu
        </p>
      )}
      <ul className={isModal ? 'grid grid-cols-3 gap-2' : 'space-y-0.5'}>
        {items.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            isExpanded={isExpanded}
            isModal={isModal}
            onClick={() => onItemClick(item.id)}
            unreadMessagesCount={unreadMessagesCount}
          />
        ))}
      </ul>
    </nav>

    {/* Profile → opens Settings hub */}
    <div className="flex-shrink-0 mt-4">
      <button
        type="button"
        onClick={() => onItemClick('settings')}
        data-tour-id="sidebar-profile-settings"
        className={`w-full flex items-center gap-3 p-3 rounded-2xl border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors text-left relative ${
          activeItem === 'settings' || activeItem === 'billing' || activeItem === 'user_profile'
            ? 'ring-1 ring-neutral-300 bg-neutral-50'
            : ''
        }`}
      >
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 flex h-2.5 w-2.5 rounded-full bg-black ring-2 ring-white" />
        )}
        <Avatar
          display_name={userProfile?.display_name || null}
          photo_url={userProfile?.photo_url}
          className="w-10 h-10 flex-shrink-0"
        />
        <div className={`min-w-0 flex-1 ${isExpanded ? 'opacity-100' : 'opacity-0 overflow-hidden'}`}>
          <p className="font-semibold text-black text-sm flex items-center gap-1.5 truncate">
            <span className="truncate">{userProfile?.display_name || 'Profile'}</span>
            <VerificationBadge status={userProfile?.subscription_status} />
          </p>
          <p className="text-[11px] text-neutral-500 font-medium">Settings & billing</p>
        </div>
      </button>
    </div>
  </div>
);

export const Sidebar: React.FC<SidebarProps> = ({
  activeItem,
  onItemClick,
  userProfile,
  onLogout,
  isMobileSidebarOpen,
  onCloseMobileSidebar,
  items,
  secondaryItems,
  unreadCount = 0,
  unreadMessagesCount = 0,
}) => {
  const handleMobileItemClick = (id: string) => {
    onItemClick(id);
    onCloseMobileSidebar();
  };

  const baseItems = items || navigationItems;
  const navItems =
    userProfile?.is_admin && !items
      ? [...baseItems, ...adminNavigationItems]
      : baseItems;

  return (
    <>
      <div
        className={`fixed inset-0 z-[125] flex items-center justify-center p-4 transition-all duration-300 md:hidden ${
          isMobileSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCloseMobileSidebar} aria-hidden="true" />
        <aside
          className={`relative w-full max-w-sm max-h-[85vh] bg-white border border-neutral-200 shadow-2xl rounded-3xl overflow-hidden transform transition-all duration-300 ${
            isMobileSidebarOpen ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'
          }`}
        >
          <SidebarContent
            isExpanded={true}
            isModal={true}
            activeItem={activeItem}
            onItemClick={handleMobileItemClick}
            userProfile={userProfile}
            items={navItems}
            unreadCount={unreadCount}
            unreadMessagesCount={unreadMessagesCount}
          />
        </aside>
      </div>

      <aside className="hidden md:block flex-shrink-0 bg-white border-r border-neutral-200 w-64 h-full">
        <SidebarContent
          isExpanded={true}
          activeItem={activeItem}
          onItemClick={onItemClick}
          userProfile={userProfile}
          items={navItems}
          unreadCount={unreadCount}
          unreadMessagesCount={unreadMessagesCount}
        />
      </aside>
    </>
  );
};
