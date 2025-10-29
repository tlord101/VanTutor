import { useRef, useCallback } from 'react';
import { RateLimiter } from '../utils/rateLimiter';

const planConfigs = {
  free: { maxRequests: 5, intervalMs: 30000, delay: 5000 },
  starter: { maxRequests: 20, intervalMs: 30000, delay: 1500 },
  smart: { maxRequests: 1000, intervalMs: 30000, delay: 0 },
};

export const useApiLimiter = () => {
  // Always use the 'smart' plan config for a free app.
  const config = planConfigs.smart;
  const rateLimiter = useRef<RateLimiter>(new RateLimiter(config.maxRequests, config.intervalMs));
  
  const attemptApiCall = useCallback((apiCallFn: () => Promise<void>)=> {
    return new Promise<{ success: boolean; message: string }>((resolve) => {
        const check = rateLimiter.current.check();
        if (!check.allowed) {
            resolve({ success: false, message: check.message });
            return;
        }

        const artificialDelay = config.delay;
        
        setTimeout(() => {
            apiCallFn().then(() => {
                rateLimiter.current.record();
                resolve({ success: true, message: '' });
            }).catch((e) => {
                // Don't record a failed request
                console.error("API call failed:", e);
                resolve({ success: false, message: 'An unexpected error occurred.' });
            });
        }, artificialDelay);
    });
  }, []);

  return { attemptApiCall };
};