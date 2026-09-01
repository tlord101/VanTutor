/**
 * Teaching Engine Service — Live Lecturer Single-Board Teaching Runtime
 *
 * Orchestrates:
 * 1) Teaching Structure Generation (Request 1)
 * 2) Sequential Board Performance Generation (Request 2)
 * 3) Speech + Board Writing + SVG Illustration Synchronization
 * 4) Inter-board Board Clearing
 * 5) Final Mini Test Generation (Request 3)
 */

import {
  TeachingStructure,
  TeachingBoardPlan,
  TeachingBoardPerformance,
  BoardAction,
  SpeechBeat,
  StudentAnswerEvaluation,
  FinalTest,
  TeachingRuntimeState,
  TeachingSegment,
} from '../types/teachingScript';
import {
  TEACHING_DIRECTOR_SYSTEM_PROMPT,
  buildTeachingStructurePrompt,
  buildSingleBoardPrompt,
  buildFinalTestPrompt,
  buildStudentAnswerEvaluationPrompt,
} from './teachingEnginePrompt';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { unifiedVoiceRouter } from './voice/UnifiedVoiceRouter';
import { sanitizeSvg } from '../utils/svgSanitizer';
import { AppSettings, UserProfile } from '../types';

export interface TeachingEngineListener {
  onStructureLoaded?: (structure: TeachingStructure) => void;
  onBoardLoaded?: (performance: TeachingBoardPerformance) => void;
  onSegmentLoaded?: (segment: TeachingSegment) => void;
  onSpokenWord?: (word: string, phraseIndex: number) => void;
  onBoardActionTriggered?: (action: BoardAction) => void;
  onBeatTriggered?: (beat: SpeechBeat) => void;
  onQuestionAsked?: (question: NonNullable<TeachingBoardPerformance['question']>) => void;
  onAnswerEvaluated?: (evaluation: StudentAnswerEvaluation) => void;
  onAudioPlaybackStateChanged?: (isPlaying: boolean) => void;
  onStateChanged?: (state: TeachingRuntimeState) => void;
  onFinalTestGenerated?: (finalTest: FinalTest) => void;
  onError?: (error: Error) => void;
}

function wordsPerSecond(speed: number): number {
  return Math.max(2.2, 2.55 * speed);
}

function phraseWordOffset(speech: string, phrase: string | undefined): number {
  if (!phrase) return -1;
  const speechLower = speech.toLowerCase();
  const phraseLower = phrase.toLowerCase().trim();
  const charIdx = speechLower.indexOf(phraseLower);
  if (charIdx === -1) return -1;
  return speechLower.slice(0, charIdx).trim().split(/\s+/).filter(Boolean).length;
}

export class TeachingEngineService {
  private appSettings: AppSettings;
  private userProfile: UserProfile | null;
  private voice: string = 'Altair';
  private listeners: Set<TeachingEngineListener> = new Set();
  private isDestroyed = false;
  private activeAudioPlayer: any = null;
  private activeTimers: ReturnType<typeof setTimeout>[] = [];
  private isPaused = false;

  private currentStructure: TeachingStructure | null = null;
  private currentBoardPerformance: TeachingBoardPerformance | null = null;
  private currentBoardIndex: number = 0;
  private runtimeState: TeachingRuntimeState = 'IDLE';

  constructor(appSettings: AppSettings, userProfile: UserProfile | null = null, voice: string = 'Altair') {
    this.appSettings = appSettings;
    this.userProfile = userProfile;
    this.voice = voice || 'Altair';
  }

  public setVoice(voice: string) {
    this.voice = voice;
  }

  public getVoice(): string {
    return this.voice;
  }

  public updateSettings(newSettings: AppSettings, newProfile?: UserProfile | null) {
    this.appSettings = newSettings;
    if (newProfile !== undefined) this.userProfile = newProfile;
  }

  public subscribe(listener: TeachingEngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getRuntimeState(): TeachingRuntimeState {
    return this.runtimeState;
  }

  private setRuntimeState(newState: TeachingRuntimeState) {
    this.runtimeState = newState;
    this.listeners.forEach((l) => l.onStateChanged?.(newState));
  }

  public getCurrentStructure(): TeachingStructure | null {
    return this.currentStructure;
  }

  public getCurrentBoardPerformance(): TeachingBoardPerformance | null {
    return this.currentBoardPerformance;
  }

  public getCurrentBoardIndex(): number {
    return this.currentBoardIndex;
  }

  public getCurrentSegment(): TeachingSegment | null {
    if (!this.currentBoardPerformance) return null;
    return {
      lesson: {
        id: (this.currentStructure?.topic || 'topic').toLowerCase().replace(/[^a-z0-9]/g, '-'),
        topic: this.currentStructure?.topic || 'Topic',
        segmentId: this.currentBoardPerformance.board_id,
        title: this.currentBoardPerformance.title,
        segmentNumber: this.currentBoardPerformance.board_number,
        totalEstimatedSegments: this.currentStructure?.boards?.length || 5,
      },
      teaching: {
        objective: this.currentBoardPerformance.title,
        speech: this.currentBoardPerformance.speech,
        boardTransition: 'clear_board',
        actions: this.currentBoardPerformance.board_actions || [],
        svgContent: this.currentBoardPerformance.svg_illustration || undefined,
      },
      question: this.currentBoardPerformance.question || null,
      next: {
        type: this.currentBoardPerformance.question?.waitForAnswer ? 'wait_for_answer' : 'continue',
      },
    };
  }

  public pauseLesson() {
    this.isPaused = true;
    this.activeTimers.forEach((t) => clearTimeout(t));
    this.activeTimers = [];
    if (this.activeAudioPlayer) {
      try {
        if (typeof this.activeAudioPlayer.pause === 'function') this.activeAudioPlayer.pause();
        else if (typeof this.activeAudioPlayer.stop === 'function') this.activeAudioPlayer.stop();
      } catch (_) {}
    }
    unifiedVoiceRouter.stopAudio();
    this.listeners.forEach((l) => l.onAudioPlaybackStateChanged?.(false));
  }

  public resumeLesson() {
    this.isPaused = false;
    if (this.currentBoardPerformance) {
      this.playBoardSpeech(this.currentBoardPerformance);
    }
  }

  /**
   * REQUEST 1: Generate Teaching Structure for Topic
   */
  public async generateTeachingStructure(params: {
    topic: string;
    courseName?: string;
    syllabusContext?: string;
    studentName?: string;
  }): Promise<TeachingStructure | null> {
    this.setRuntimeState('PREPARING');
    try {
      const ai = createAvelutAI(this.appSettings, this.userProfile);
      if (!ai) throw new Error('AI client could not be initialized');

      const resolvedStudentName = params.studentName || this.userProfile?.display_name || 'Student';
      const prompt = buildTeachingStructurePrompt({
        ...params,
        studentName: resolvedStudentName,
      });

      const response = await ai.models.generateContent({
        model: this.appSettings.alibaba_model || 'qwen3.7-flash',
        contents: [{ role: 'user', parts: [{ text: `${TEACHING_DIRECTOR_SYSTEM_PROMPT}\n\n${prompt}` }] }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });

      const rawText = getResponseText(response);
      if (!rawText) throw new Error('Empty Teaching Structure generated by AI');

      const cleaned = rawText.replace(/```(?:json)?\s*/gi, '').replace(/\s*```$/gi, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      const jsonStr = firstBrace !== -1 && lastBrace !== -1 ? cleaned.substring(firstBrace, lastBrace + 1) : cleaned;

      const structure: TeachingStructure = JSON.parse(jsonStr);

      if (!structure.boards || !Array.isArray(structure.boards) || structure.boards.length === 0) {
        throw new Error('Invalid teaching structure: missing boards array');
      }

      this.currentStructure = structure;
      this.currentBoardIndex = 0;
      this.listeners.forEach((l) => l.onStructureLoaded?.(structure));
      return structure;
    } catch (err: any) {
      console.error('[TeachingEngine] Error generating structure:', err);
      this.setRuntimeState('ERROR');
      this.listeners.forEach((l) => l.onError?.(err instanceof Error ? err : new Error(String(err))));
      return null;
    }
  }

  /**
   * REQUEST 2: Generate Detailed Teaching Performance for ONE Board
   */
  public async loadBoardPerformance(params: {
    boardIndex: number;
    studentName?: string;
    completedBoardsSummary?: string[];
  }): Promise<TeachingBoardPerformance | null> {
    if (!this.currentStructure || !this.currentStructure.boards[params.boardIndex]) {
      console.error('[TeachingEngine] Invalid board index or structure missing');
      return null;
    }

    this.setRuntimeState('PREPARING');
    this.currentBoardIndex = params.boardIndex;
    const boardPlan: TeachingBoardPlan = this.currentStructure.boards[params.boardIndex];

    try {
      const ai = createAvelutAI(this.appSettings, this.userProfile);
      if (!ai) throw new Error('AI client could not be initialized');

      const resolvedStudentName = params.studentName || this.userProfile?.display_name || 'Student';
      const prompt = buildSingleBoardPrompt({
        topic: this.currentStructure.topic,
        fullStructure: this.currentStructure,
        currentBoardPlan: boardPlan,
        studentName: resolvedStudentName,
        completedBoardsSummary: params.completedBoardsSummary,
      });

      const response = await ai.models.generateContent({
        model: this.appSettings.alibaba_model || 'qwen3.7-flash',
        contents: [{ role: 'user', parts: [{ text: `${TEACHING_DIRECTOR_SYSTEM_PROMPT}\n\n${prompt}` }] }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.35,
        },
      });

      const rawText = getResponseText(response);
      if (!rawText) throw new Error('Empty board performance returned by AI');

      const cleaned = rawText.replace(/```(?:json)?\s*/gi, '').replace(/\s*```$/gi, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      const jsonStr = firstBrace !== -1 && lastBrace !== -1 ? cleaned.substring(firstBrace, lastBrace + 1) : cleaned;

      const performance: TeachingBoardPerformance = JSON.parse(jsonStr);

      // Sanitize custom SVG illustration if present
      if (performance.svg_illustration) {
        performance.svg_illustration = sanitizeSvg(performance.svg_illustration);
      }

      // Automatically construct board draw action for SVG if SVG exists and no explicit draw action was created
      if (performance.svg_illustration) {
        const hasSvgAction = (performance.board_actions || []).some(
          (a) => a.type === 'draw' && a.metadata?.svgContent
        );
        if (!hasSvgAction) {
          const svgAction: BoardAction = {
            id: `svg_ill_${performance.board_number}`,
            type: 'draw',
            position: { x: 50, y: 65 },
            metadata: {
              primitive: 'custom_svg',
              svgContent: performance.svg_illustration,
            },
          };
          performance.board_actions = [...(performance.board_actions || []), svgAction];
        }
      }

      this.currentBoardPerformance = performance;
      this.listeners.forEach((l) => l.onBoardLoaded?.(performance));

      // Emit legacy compatibility segment
      const legacySegment: TeachingSegment = {
        lesson: {
          id: this.currentStructure.topic.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          topic: this.currentStructure.topic,
          segmentId: performance.board_id,
          title: performance.title,
          segmentNumber: performance.board_number,
          totalEstimatedSegments: this.currentStructure.boards.length,
        },
        teaching: {
          objective: boardPlan.teaching_objective,
          speech: performance.speech,
          boardTransition: 'clear_board',
          actions: performance.board_actions || [],
          svgContent: performance.svg_illustration || undefined,
        },
        question: performance.question || null,
        next: {
          type: performance.question?.waitForAnswer ? 'wait_for_answer' : 'continue',
        },
      };
      this.listeners.forEach((l) => l.onSegmentLoaded?.(legacySegment));

      return performance;
    } catch (err: any) {
      console.error('[TeachingEngine] Error loading board performance:', err);
      this.setRuntimeState('ERROR');
      this.listeners.forEach((l) => l.onError?.(err instanceof Error ? err : new Error(String(err))));
      return null;
    }
  }

  /**
   * SPEECH + BOARD + SVG SYNCHRONIZATION PLAYBACK
   */
  public async playBoardSpeech(performance: TeachingBoardPerformance): Promise<void> {
    if (this.isDestroyed || !performance.speech) return;

    this.stopCurrentPlayback();
    this.isPaused = false;
    this.setRuntimeState('SPEAKING');

    try {
      const speechText = performance.speech.trim();
      const actions = performance.board_actions || [];
      const beats = performance.speech_beats || [];
      const triggeredActionIds = new Set<string>();
      let audioStarted = false;
      const speed = 1.1;
      const wps = wordsPerSecond(speed);

      const fireAction = (act: BoardAction) => {
        if (triggeredActionIds.has(act.id)) return;
        triggeredActionIds.add(act.id);
        this.listeners.forEach((l) => l.onBoardActionTriggered?.(act));
      };

      this.activeAudioPlayer = unifiedVoiceRouter.playSpeech(speechText, {
        appSettings: this.appSettings,
        voice: this.voice,
        speed,
        onStart: () => {
          if (this.isDestroyed || this.isPaused) return;
          audioStarted = true;
          this.setRuntimeState('SPEAKING');
          this.listeners.forEach((l) => l.onAudioPlaybackStateChanged?.(true));
          this.scheduleTimeline(speechText, actions, beats, triggeredActionIds, wps);
        },
        onEnd: () => {
          if (this.isPaused) return;
          actions.forEach((act) => fireAction(act));
          this.listeners.forEach((l) => l.onAudioPlaybackStateChanged?.(false));

          if (performance.question && performance.question.waitForAnswer) {
            this.setRuntimeState('WAITING_FOR_ANSWER');
            this.listeners.forEach((l) => l.onQuestionAsked?.(performance.question!));
          } else {
            this.setRuntimeState('COMPLETING');
          }
        },
        onError: (err) => {
          console.warn('[TeachingEngine] Audio player error:', err);
          this.listeners.forEach((l) => l.onAudioPlaybackStateChanged?.(true));
          this.scheduleTimeline(speechText, actions, beats, triggeredActionIds, wps);
          setTimeout(() => {
            this.listeners.forEach((l) => l.onAudioPlaybackStateChanged?.(false));
            if (performance.question && performance.question.waitForAnswer) {
              this.setRuntimeState('WAITING_FOR_ANSWER');
              this.listeners.forEach((l) => l.onQuestionAsked?.(performance.question!));
            } else {
              this.setRuntimeState('COMPLETING');
            }
          }, 3500);
        },
      });

      const safety = setTimeout(() => {
        if (!audioStarted && !this.isDestroyed && !this.isPaused) {
          audioStarted = true;
          this.listeners.forEach((l) => l.onAudioPlaybackStateChanged?.(true));
          this.scheduleTimeline(speechText, actions, beats, triggeredActionIds, wps);
        }
      }, 1800);
      this.activeTimers.push(safety);
    } catch (err: any) {
      console.warn('[TeachingEngine] Speech playback fallback:', err);
      this.listeners.forEach((l) => l.onAudioPlaybackStateChanged?.(true));
      performance.board_actions.forEach((act, idx) => {
        const timer = setTimeout(() => {
          this.listeners.forEach((l) => l.onBoardActionTriggered?.(act));
        }, 600 + idx * 3000);
        this.activeTimers.push(timer);
      });
      setTimeout(() => {
        this.listeners.forEach((l) => l.onAudioPlaybackStateChanged?.(false));
      }, 600 + performance.board_actions.length * 3000);
    }
  }

  // Alias for backward compatibility
  public async playSegmentSpeech(segment: TeachingSegment | TeachingBoardPerformance): Promise<void> {
    if ('speech_beats' in segment) {
      return this.playBoardSpeech(segment);
    }
    const perf: TeachingBoardPerformance = {
      board_id: segment.lesson.segmentId,
      board_number: segment.lesson.segmentNumber,
      title: segment.lesson.title,
      speech: segment.teaching.speech,
      speech_beats: [],
      board_actions: segment.teaching.actions,
      svg_illustration: segment.teaching.svgContent,
      question: segment.question,
    };
    return this.playBoardSpeech(perf);
  }

  private scheduleTimeline(
    speech: string,
    actions: BoardAction[],
    beats: SpeechBeat[],
    triggeredIds: Set<string>,
    wps: number
  ) {
    const words = speech.split(/\s+/).filter(Boolean);
    const totalWords = words.length || 1;
    const estTotalMs = Math.max(25000, (totalWords / wps) * 1000);

    // Schedule beats if available
    beats.forEach((beat, bIdx) => {
      const beatOffset = phraseWordOffset(speech, beat.text);
      const delayMs = beatOffset >= 0 ? Math.floor((beatOffset / wps) * 1000) : Math.floor((bIdx / beats.length) * estTotalMs);
      const timer = setTimeout(() => {
        if (this.isDestroyed || this.isPaused) return;
        this.listeners.forEach((l) => l.onBeatTriggered?.(beat));
      }, Math.max(200, delayMs));
      this.activeTimers.push(timer);
    });

    // Schedule actions by phrase offset
    actions.forEach((action, aIdx) => {
      let delayMs = 0;
      const offset = phraseWordOffset(speech, action.sync?.phrase);
      if (offset >= 0) {
        delayMs = Math.floor((offset / wps) * 1000);
      } else {
        delayMs = Math.floor(((aIdx + 1) / (actions.length + 1)) * estTotalMs * 0.85);
      }

      const timer = setTimeout(() => {
        if (this.isDestroyed || this.isPaused) return;
        if (triggeredIds.has(action.id)) return;
        triggeredIds.add(action.id);
        this.listeners.forEach((l) => l.onBoardActionTriggered?.(action));
      }, Math.max(300, delayMs));
      this.activeTimers.push(timer);
    });
  }

  /**
   * Evaluate student answer for mid-board question
   */
  public async evaluateStudentAnswer(params: {
    topic: string;
    studentAnswer: string;
  }): Promise<StudentAnswerEvaluation | null> {
    if (!this.currentBoardPerformance || !this.currentBoardPerformance.question) return null;

    try {
      const ai = createAvelutAI(this.appSettings, this.userProfile);
      if (!ai) throw new Error('AI client could not be initialized');

      const prompt = buildStudentAnswerEvaluationPrompt({
        topic: params.topic,
        boardTitle: this.currentBoardPerformance.title,
        question: this.currentBoardPerformance.question.question,
        expectedConcepts: this.currentBoardPerformance.question.expectedConcepts,
        studentAnswer: params.studentAnswer,
      });

      const response = await ai.models.generateContent({
        model: this.appSettings.alibaba_model || 'qwen3.7-flash',
        contents: [{ role: 'user', parts: [{ text: `${TEACHING_DIRECTOR_SYSTEM_PROMPT}\n\n${prompt}` }] }],
        config: { responseMimeType: 'application/json', temperature: 0.3 },
      });

      const rawText = getResponseText(response);
      const cleaned = (rawText || '').replace(/```(?:json)?\s*/gi, '').replace(/\s*```$/gi, '').trim();
      const evaluation: StudentAnswerEvaluation = JSON.parse(cleaned);

      this.setRuntimeState('FEEDBACK');
      this.listeners.forEach((l) => l.onAnswerEvaluated?.(evaluation));

      if (evaluation.spokenFeedback) {
        unifiedVoiceRouter.playSpeech(evaluation.spokenFeedback, {
          appSettings: this.appSettings,
          voice: this.voice,
          speed: 1.05,
        });
      }

      return evaluation;
    } catch (err: any) {
      console.error('[TeachingEngine] Answer evaluation error:', err);
      const fallback: StudentAnswerEvaluation = {
        isCorrect: true,
        score: 'correct',
        spokenFeedback: "Excellent thinking! Let's keep moving forward.",
      };
      this.setRuntimeState('FEEDBACK');
      this.listeners.forEach((l) => l.onAnswerEvaluated?.(fallback));
      return fallback;
    }
  }

  /**
   * REQUEST 3: Generate Final Mini Test after all boards complete
   */
  public async generateFinalTest(): Promise<FinalTest | null> {
    if (!this.currentStructure) return null;
    this.setRuntimeState('FINAL_TEST');

    try {
      const ai = createAvelutAI(this.appSettings, this.userProfile);
      if (!ai) throw new Error('AI client could not be initialized');

      const prompt = buildFinalTestPrompt({
        topic: this.currentStructure.topic,
        teachingStructure: this.currentStructure,
      });

      const response = await ai.models.generateContent({
        model: this.appSettings.alibaba_model || 'qwen3.7-flash',
        contents: [{ role: 'user', parts: [{ text: `${TEACHING_DIRECTOR_SYSTEM_PROMPT}\n\n${prompt}` }] }],
        config: { responseMimeType: 'application/json', temperature: 0.25 },
      });

      const rawText = getResponseText(response);
      const cleaned = (rawText || '').replace(/```(?:json)?\s*/gi, '').replace(/\s*```$/gi, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      const jsonStr = firstBrace !== -1 && lastBrace !== -1 ? cleaned.substring(firstBrace, lastBrace + 1) : cleaned;

      const finalTest: FinalTest = JSON.parse(jsonStr);
      this.listeners.forEach((l) => l.onFinalTestGenerated?.(finalTest));
      return finalTest;
    } catch (err) {
      console.error('[TeachingEngine] Error generating final test:', err);
      const fallback: FinalTest = {
        topic: this.currentStructure?.topic || 'Lesson Complete',
        questions: [
          {
            id: 'ft_fallback_1',
            type: 'understanding',
            question: `What is the primary core concept taught in ${this.currentStructure?.topic || 'this topic'}?`,
            options: ['Option A', 'Option B', 'Option C'],
            correctAnswer: 'Option A',
            explanation: 'This was highlighted throughout the lesson boards.',
          },
        ],
      };
      this.listeners.forEach((l) => l.onFinalTestGenerated?.(fallback));
      return fallback;
    }
  }

  public async askLecturerQuestion(params: {
    topic: string;
    studentQuestion: string;
  }): Promise<{ spokenAnswer: string; boardActions?: BoardAction[] }> {
    this.stopCurrentPlayback();

    try {
      const ai = createAvelutAI(this.appSettings, this.userProfile);
      if (!ai) throw new Error('AI client could not be initialized');

      const { buildStudentInterruptionPrompt } = await import('./teachingEnginePrompt');
      const prompt = buildStudentInterruptionPrompt({
        topic: params.topic,
        currentBoardTitle: this.currentBoardPerformance?.title || params.topic,
        studentQuestion: params.studentQuestion,
      });

      const response = await ai.models.generateContent({
        model: this.appSettings.alibaba_model || 'qwen3.7-flash',
        contents: [{ role: 'user', parts: [{ text: `${TEACHING_DIRECTOR_SYSTEM_PROMPT}\n\n${prompt}` }] }],
        config: { responseMimeType: 'application/json', temperature: 0.3 },
      });

      const rawText = getResponseText(response);
      const cleaned = (rawText || '').replace(/```(?:json)?\s*/gi, '').replace(/\s*```$/gi, '').trim();
      const result = JSON.parse(cleaned);

      if (result.spokenAnswer) {
        const actions: BoardAction[] = Array.isArray(result.boardActions) ? result.boardActions : [];
        const triggered = new Set<string>();

        this.activeAudioPlayer = unifiedVoiceRouter.playSpeech(result.spokenAnswer, {
          appSettings: this.appSettings,
          voice: this.voice,
          speed: 1.05,
          onStart: () => {
            this.listeners.forEach((l) => l.onAudioPlaybackStateChanged?.(true));
          },
          onEnd: () => {
            actions.forEach((a) => {
              if (!triggered.has(a.id)) {
                triggered.add(a.id);
                this.listeners.forEach((l) => l.onBoardActionTriggered?.(a));
              }
            });
            this.listeners.forEach((l) => l.onAudioPlaybackStateChanged?.(false));
          },
        });
      }

      return result;
    } catch (err) {
      console.warn('[TeachingEngine] Interruption question error:', err);
      const fallbackAnswer = `Great question about ${params.topic}. Let me write that clearly for you on the board.`;
      unifiedVoiceRouter.playSpeech(fallbackAnswer, {
        appSettings: this.appSettings,
        voice: this.voice,
      });
      return { spokenAnswer: fallbackAnswer };
    }
  }

  // Backward compatibility alias for loadSegment
  public async loadSegment(params: {
    topic: string;
    courseName?: string;
    syllabusContext?: string;
    segmentNumber: number;
    studentName?: string;
    previousSegmentsSummary?: string;
  }): Promise<TeachingSegment | null> {
    if (!this.currentStructure) {
      await this.generateTeachingStructure(params);
    }
    const idx = (params.segmentNumber || 1) - 1;
    const boardPerf = await this.loadBoardPerformance({
      boardIndex: idx,
      studentName: params.studentName,
    });
    if (!boardPerf || !this.currentStructure) return null;

    return {
      lesson: {
        id: this.currentStructure.topic.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        topic: this.currentStructure.topic,
        segmentId: boardPerf.board_id,
        title: boardPerf.title,
        segmentNumber: boardPerf.board_number,
        totalEstimatedSegments: this.currentStructure.boards.length,
      },
      teaching: {
        objective: boardPerf.title,
        speech: boardPerf.speech,
        boardTransition: 'clear_board',
        actions: boardPerf.board_actions || [],
        svgContent: boardPerf.svg_illustration || undefined,
      },
      question: boardPerf.question || null,
      next: {
        type: boardPerf.question?.waitForAnswer ? 'wait_for_answer' : 'continue',
      },
    };
  }

  public stopCurrentPlayback() {
    this.activeTimers.forEach((t) => clearTimeout(t));
    this.activeTimers = [];
    if (this.activeAudioPlayer) {
      try {
        if (typeof this.activeAudioPlayer.stop === 'function') this.activeAudioPlayer.stop();
        else if (typeof this.activeAudioPlayer.pause === 'function') this.activeAudioPlayer.pause();
      } catch (_) {}
    }
    unifiedVoiceRouter.stopAudio();
  }

  public destroy() {
    this.isDestroyed = true;
    this.stopCurrentPlayback();
    unifiedVoiceRouter.stopAll();
    this.listeners.clear();
  }
}
