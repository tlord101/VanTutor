/**
 * TTSQueue.ts — High-performance concurrent sentence TTS queue & audio coordinator
 *
 * Receives complete sentences, coordinates asynchronous speech synthesis in parallel
 * with active playback (so upcoming sentences are pre-generated while the current sentence is playing),
 * and handles seamless transitions, pause, resume, and cancellation.
 */

export interface QueueItem {
    id: string;
    text: string;
    audioBlobUrl?: string;
    audioElement?: HTMLAudioElement;
    isSynthesizing: boolean;
    isSynthesized: boolean;
    isPlayed: boolean;
    error?: string;
}

export type SynthesisFn = (text: string) => Promise<string | null>;

export class TTSQueue {
    private queue: QueueItem[] = [];
    private currentIndex = 0;
    private isPlaying = false;
    private isPaused = false;
    private currentAudio: HTMLAudioElement | null = null;
    private synthesisFn: SynthesisFn;
    private onPlayStart?: (item: QueueItem) => void;
    private onPlayEnd?: () => void;
    private onError?: (err: any) => void;

    constructor(synthesisFn: SynthesisFn) {
        this.synthesisFn = synthesisFn;
    }

    public setCallbacks(callbacks: {
        onPlayStart?: (item: QueueItem) => void;
        onPlayEnd?: () => void;
        onError?: (err: any) => void;
    }) {
        this.onPlayStart = callbacks.onPlayStart;
        this.onPlayEnd = callbacks.onPlayEnd;
        this.onError = callbacks.onError;
    }

    /**
     * Enqueues a new sentence for synthesis and playback.
     */
    public enqueue(text: string): void {
        const cleaned = text.trim();
        if (!cleaned) return;

        const item: QueueItem = {
            id: `tts_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            text: cleaned,
            isSynthesizing: false,
            isSynthesized: false,
            isPlayed: false,
        };

        this.queue.push(item);

        // Immediately trigger background synthesis
        this.synthesizeUpcoming();

        // If not playing, begin playback loop
        if (!this.isPlaying && !this.isPaused) {
            this.playNext();
        }
    }

    /**
     * Pre-generates the next 2 upcoming sentences in parallel.
     */
    private async synthesizeUpcoming(): Promise<void> {
        const toSynthesize = this.queue.slice(this.currentIndex, this.currentIndex + 3);

        for (const item of toSynthesize) {
            if (!item.isSynthesized && !item.isSynthesizing) {
                item.isSynthesizing = true;
                this.synthesisFn(item.text)
                    .then(url => {
                        item.isSynthesizing = false;
                        if (url) {
                            item.audioBlobUrl = url;
                            item.isSynthesized = true;
                            // If this was the current waiting item, trigger play
                            if (this.queue[this.currentIndex]?.id === item.id && !this.isPlaying && !this.isPaused) {
                                this.playCurrent();
                            }
                        } else {
                            item.isSynthesized = false;
                        }
                    })
                    .catch(err => {
                        item.isSynthesizing = false;
                        item.error = err?.message;
                    });
            }
        }
    }

    /**
     * Plays the current item at `currentIndex`.
     */
    private async playCurrent(): Promise<void> {
        if (this.currentIndex >= this.queue.length) {
            this.isPlaying = false;
            if (this.onPlayEnd) this.onPlayEnd();
            return;
        }

        const item = this.queue[this.currentIndex];
        if (!item) return;

        if (!item.isSynthesized || !item.audioBlobUrl) {
            // Still generating, wait briefly
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        if (this.onPlayStart) this.onPlayStart(item);

        try {
            const audio = new Audio(item.audioBlobUrl);
            item.audioElement = audio;
            this.currentAudio = audio;

            audio.onended = () => {
                item.isPlayed = true;
                // Revoke old blob URL to prevent memory leaks
                if (item.audioBlobUrl) {
                    try { URL.revokeObjectURL(item.audioBlobUrl); } catch {}
                }
                this.currentIndex++;
                this.synthesizeUpcoming();
                this.playNext();
            };

            audio.onerror = (e) => {
                console.warn('[TTSQueue] Audio playback error:', e);
                item.isPlayed = true;
                this.currentIndex++;
                this.synthesizeUpcoming();
                this.playNext();
            };

            await audio.play();
        } catch (err) {
            console.warn('[TTSQueue] Audio play failed:', err);
            this.currentIndex++;
            this.playNext();
        }
    }

    private playNext(): void {
        if (this.currentIndex < this.queue.length) {
            const nextItem = this.queue[this.currentIndex];
            if (nextItem.isSynthesized && nextItem.audioBlobUrl) {
                this.playCurrent();
            } else {
                this.synthesizeUpcoming();
            }
        } else {
            this.isPlaying = false;
            if (this.onPlayEnd) this.onPlayEnd();
        }
    }

    public pause(): void {
        this.isPaused = true;
        if (this.currentAudio && !this.currentAudio.paused) {
            this.currentAudio.pause();
        }
    }

    public resume(): void {
        this.isPaused = false;
        if (this.currentAudio && this.currentAudio.paused) {
            this.currentAudio.play().catch(() => {});
        } else if (!this.isPlaying) {
            this.playNext();
        }
    }

    public stop(): void {
        this.isPlaying = false;
        this.isPaused = false;
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        // Clean up all pending Blob URLs
        this.queue.forEach(item => {
            if (item.audioBlobUrl) {
                try { URL.revokeObjectURL(item.audioBlobUrl); } catch {}
            }
        });

        this.queue = [];
        this.currentIndex = 0;
    }

    public isBusy(): boolean {
        return this.isPlaying || this.queue.some(q => !q.isPlayed);
    }
}
