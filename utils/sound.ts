export const playBubbleSound = () => {
    try {
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = 'sine';
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        const now = ctx.currentTime;
        // Bubble pop sound profile
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.5, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.start(now);
        osc.stop(now + 0.1);
    } catch (e) {
        console.error("Audio generation failed", e);
    }
};

export const playReceiveSound = () => {
    try {
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        
        const playTone = (freq: number, startTime: number, duration: number) => {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            osc.type = 'sine';
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            osc.frequency.setValueAtTime(freq, startTime);
            
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            
            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        const now = ctx.currentTime;
        // Two quick ascending notes for receive
        playTone(400, now, 0.15);
        playTone(600, now + 0.1, 0.2);

    } catch (e) {
        console.error("Audio generation failed", e);
    }
};
