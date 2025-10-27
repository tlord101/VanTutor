import type React from 'react';

export type UserPlan = 'free' | 'starter' | 'smart';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  courseId: string;
  level: string;
  totalXP: number;
  totalTestXP: number;
  plan: UserPlan;
  currentStreak: number;
  lastActivityDate: number; // Store as timestamp
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: number; // Use number for Firestore compatibility
  image?: string; // Optional image data URL for visual context
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