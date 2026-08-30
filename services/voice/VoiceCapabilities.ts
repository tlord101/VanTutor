/**
 * VoiceCapabilities.ts — On-device hardware and WebGPU capability detection for KittenTTS
 */

export interface HardwareVoiceCapabilities {
    hasWebGPU: boolean;
    hasWasmSimd: boolean;
    hasAudioContext: boolean;
    recommendedModel: 'mini' | 'micro';
    estimatedMemoryMB: number;
    platform: 'mobile' | 'desktop' | 'tablet';
}

/**
 * Probes WebGPU adapter, WASM SIMD, and device memory to determine if KittenTTS Mini (80MB)
 * can run reliably, or if KittenTTS Micro (25MB) should be selected.
 */
export async function detectVoiceCapabilities(): Promise<HardwareVoiceCapabilities> {
    let hasWebGPU = false;
    let hasAudioContext = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);

    // 1. Detect WebGPU with active adapter verification
    if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
        try {
            const adapter = await (navigator as any).gpu.requestAdapter();
            if (adapter) {
                hasWebGPU = true;
            }
        } catch (err) {
            console.warn('[VoiceCapabilities] WebGPU adapter check failed:', err);
            hasWebGPU = false;
        }
    }

    // 2. Detect WASM SIMD support
    let hasWasmSimd = false;
    try {
        hasWasmSimd = WebAssembly.validate(
            new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11])
        );
    } catch {
        hasWasmSimd = false;
    }

    // 3. Platform & Memory Estimation
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
    const isTablet = /iPad|Tablet/i.test(userAgent) || (isMobile && typeof window !== 'undefined' && window.innerWidth >= 768);
    const platform = isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop');

    const deviceMemory = (typeof navigator !== 'undefined' && 'deviceMemory' in navigator)
        ? ((navigator as any).deviceMemory * 1024)
        : (isMobile ? 2048 : 4096);

    // Mini 0.8 is prioritized whenever WebGPU or high-spec WASM is available.
    // Falls back to Micro on constrained mobile devices.
    const canRunMini = hasWebGPU || (!isMobile && hasWasmSimd) || (deviceMemory >= 3000);
    const recommendedModel: 'mini' | 'micro' = canRunMini ? 'mini' : 'micro';

    return {
        hasWebGPU,
        hasWasmSimd,
        hasAudioContext,
        recommendedModel,
        estimatedMemoryMB: deviceMemory,
        platform,
    };
}
