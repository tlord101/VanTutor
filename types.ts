import type React from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  courseId: string;
  level: string;
  totalXP: number;
  totalTestXP: number;
  currentStreak: number;
  lastActivityDate: number; // Store as timestamp
  notificationsEnabled: boolean;
  isOnline?: boolean;
  lastSeen?: number;
}

export interface Message {
  id: string;
  text?: string;
  sender: 'user' | 'bot';
  timestamp: number; // Use number for Firestore compatibility
  image?: string; // Optional image data URL for visual context
  audioUrl?: string; // For voice notes
  audioDuration?: number; // Duration in seconds
}

// Types for the new Exam System
export interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface ExamQuestionResult extends Question {
  userAnswer: string;
  isCorrect: boolean;
}

export interface ExamHistoryItem {
  id:string;
  courseId: string;
  score: number;
  totalQuestions: number;
  xpEarned: number;
  timestamp: number; // Using number for Firestore compatibility (e.g., Date.now())
  questions: ExamQuestionResult[];
}

// Types for the Leaderboard System
export interface LeaderboardEntry {
    uid: string;
    displayName: string;
    photoURL?: string;
    xp: number;
}

export interface WeeklyLeaderboardEntry extends LeaderboardEntry {
    weekId: string; // e.g., "2024-27"
}

// Types for the new Study Guide System
export interface Topic {
  topicId: string;
  topicName: string;
}

export interface Subject {
  subjectId: string;
  subjectName: string;
  topics: Topic[];
  level?: string; // The difficulty level this subject belongs to
}

export interface UserProgress {
  [topicId: string]: {
    isComplete: boolean;
    xpEarned: number;
  };
}

// Type for the Dashboard data
export interface DashboardData {
    totalTopics: number;
    examHistory: ExamHistoryItem[];
    xpHistory: { date: string, xp: number }[];
}

// Type for the new Notification System
export interface Notification {
  id: string;
  type: 'study_update' | 'exam_reminder' | 'leaderboard_change' | 'welcome';
  title: string;
  message: string;
  timestamp: number;
  isRead: boolean;
  link?: string;
}

// Type for the new Chat History System
export interface ChatConversation {
  id: string;
  title: string;
  createdAt: number; // Use number for Firestore compatibility
  lastUpdatedAt: number; // Use number for Firestore compatibility
}

// Types for new Private Messaging System
export interface PrivateMessage {
    id: string;
    senderId: string;
    text?: string;
    timestamp: number;
    imageUrl?: string;
    audioUrl?: string;
    audioDuration?: number;
    isEdited?: boolean;
}

export interface PrivateChat {
    id: string;
    members: string[]; // array of 2 user UIDs
    memberInfo: {
        [uid: string]: {
            displayName: string;
            photoURL?: string;
            isOnline?: boolean;
            lastSeen?: number;
        }
    };
    lastMessage?: {
        text: string;
        timestamp: number;
        senderId: string;
        readBy: string[]; // Array of UIDs that have read this message
    };
    createdAt: number;
    lastActivityTimestamp: number;
    typing?: string[]; // Array of UIDs of users currently typing
}


// Type for the new Toast Notification System
export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}