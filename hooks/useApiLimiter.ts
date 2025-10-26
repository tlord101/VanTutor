import { useRef, useEffect, useCallback } from 'react';
import type { UserPlan } from '../types';
import { RateLimiter } from '../utils/rateLimiter';

const planConfigs = {
  free: { maxRequests: 5, intervalMs: 30000, delay: 5000 },
  starter: { maxRequests: 20, intervalMs: 30000, delay: 1500 },
  smart: { maxRequests: 1000, intervalMs: 30000, delay: 0 },
};

export const useApiLimiter = (plan: UserPlan) => {
  // Fallback to 'free' config if the plan is undefined during initial render, preventing a crash.
  const initialConfig = planConfigs[plan] || planConfigs.free;
  const rateLimiter = useRef<RateLimiter>(new RateLimiter(initialConfig.maxRequests, initialConfig.intervalMs));
  
  useEffect(() => {
    const config = planConfigs[plan] || planConfigs.free;
    rateLimiter.current.updateConfig(config.maxRequests, config.intervalMs);
  }, [plan]);
  
  const attemptApiCall = useCallback((apiCallFn: () => Promise<void>)=> {
    return new Promise<{ success: boolean; message: string }>((resolve) => {
        const check = rateLimiter.current.check();
        if (!check.allowed) {
            resolve({ success: false, message: check.message });
            return;
        }

        const artificialDelay = (planConfigs[plan] || planConfigs.free).delay;
        
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
  }, [plan]);

  return { attemptApiCall };
};