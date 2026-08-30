

import React from 'react';
import type { NavItem } from './types';
import { DashboardIcon } from './components/icons/DashboardIcon';
import { StudyGuideIcon } from './components/icons/StudyGuideIcon';
import { CameraIcon } from './components/icons/CameraIcon';
import { ChatIcon } from './components/icons/ChatIcon';
import { AIIcon } from './components/icons/AIIcon';
import { HelpIcon } from './components/icons/HelpIcon';
import { GraduationCapIcon } from './components/icons/GraduationCapIcon';
import { LeaderboardIcon } from './components/icons/LeaderboardIcon';
import { MessengerIcon } from './components/icons/MessengerIcon';

// Define SVG icons for secondary navigation
const SettingsIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  React.createElement('svg', {
    xmlns: "http://www.w3.org/2000/svg",
    className: className,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 2
  },
    React.createElement('path', {
      key: '1',
      strokeLinecap: "round",
      strokeLinejoin: "round",
      d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    }),
    React.createElement('path', {
      key: '2',
      strokeLinecap: "round",
      strokeLinejoin: "round",
      d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    })
  )
);

const HistoryIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  React.createElement('svg', {
    xmlns: "http://www.w3.org/2000/svg",
    className: className,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 2
  },
    React.createElement('path', {
      key: '1',
      strokeLinecap: "round",
      strokeLinejoin: "round",
      d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    })
  )
);

const FeedbackIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  React.createElement('svg', {
    xmlns: "http://www.w3.org/2000/svg",
    className: className,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 2
  },
    React.createElement('path', {
      key: '1',
      strokeLinecap: "round",
      strokeLinejoin: "round",
      d: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
    })
  )
);

export const navigationItems: NavItem[] = [
  { id: 'chat', label: 'Avelut AI', icon: React.createElement(AIIcon) },
  { id: 'study_guide', label: 'My Notebooks', icon: React.createElement(StudyGuideIcon) },
  { id: 'messenger', label: 'Messages', icon: React.createElement(MessengerIcon) },
  { id: 'visual_solver', label: 'Visual Solver', icon: React.createElement(CameraIcon) },
  { id: 'leaderboard', label: 'Leaderboard', icon: React.createElement(LeaderboardIcon) },
  { id: 'history', label: 'History', icon: React.createElement(HistoryIcon) },
  { id: 'feedback', label: 'Feedback', icon: React.createElement(FeedbackIcon) },
];

export const adminNavigationItems: NavItem[] = [
    { id: 'admin', label: 'Admin Panel', icon: React.createElement(GraduationCapIcon) },
];

export const secondaryNavigationItems: NavItem[] = [];
