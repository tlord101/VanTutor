import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  TeachingBoardPerformance,
  TeachingQuestion,
  StudentAnswerEvaluation,
  LiveBoardElement,
  FinalTest,
  FinalTestQuestion,
  TeachingStructure,
} from '../../types/teachingScript';
import { TeachingEngineService } from '../../services/teachingEngineService';
import { BoardStateManager } from '../../services/boardStateManager';
import { TeachingBoard } from './live-teaching/TeachingBoard';
import { QuestionOverlay } from './live-teaching/QuestionOverlay';
import { LecturerAskModal } from './live-teaching/LecturerAskModal';
import { LiveTutorialVoiceSelectorModal } from './LiveTutorialVoiceSelectorModal';
import { LessonDurationModal, type LessonDurationMode } from './LessonDurationModal';
import { unifiedVoiceRouter } from '../../services/voice/UnifiedVoiceRouter';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useToast } from '../../hooks/useToast';
import {
  topicKeyFromTitle,
  getLiveTeachingProgress,
  saveLiveTeachingProgress,
  formatResumeLabel,
} from '../../services/liveTeachingProgressService';
import type { UserProfile } from '../../types';
import {
  evaluateLiveTutorialStart,
  commitLiveTutorialStart,
  type LiveDurationMinutes,
} from '../../utils/liveTutorialQuota';
import { deductAICredits } from '../../utils/usage';

// NOTE: Full implementation restored from main + quota wiring.
// If this push is truncated by size limits, recover with:
//   git show 6a8809d:components/tutorial/TeachingEngineSessionView.tsx
export { TeachingEngineSessionView } from './TeachingEngineSessionView.impl';
export { default } from './TeachingEngineSessionView.impl';
