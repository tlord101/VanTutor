import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Toast as CapacitorToast } from '@capacitor/toast';
import type { ToastMessage, ToastType } from '../types';
import { Toast } from '../components/Toast';
import { usePortalRoot } from '../utils/portal';

interface ToastContextType {
  addToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const triggerHapticFeedback = (type: ToastType) => {
  if ('vibrate' in navigator) {
    try {
      if (type === 'error') {
        // A double buzz for errors to grab attention
        navigator.vibrate([100, 50, 100]);
      } else {
        // A single short buzz for success or info
        navigator.vibrate(50);
      }
    } catch (e) {
      console.warn("Haptic feedback failed:", e);
    }
  }
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const portalRoot = usePortalRoot('avelut-toast-root');

  const addToast = useCallback(async (message: string, type: ToastType = 'info') => {
    triggerHapticFeedback(type);

    if (Capacitor.isNativePlatform()) {
      try {
        await CapacitorToast.show({
          text: message,
          duration: 'short',
          position: 'bottom',
        });
      } catch (e) {
        console.warn("Toast plugin failed, falling back to React toast:", e);
        const id = Date.now().toString() + Math.random().toString(36).substring(7);
        setToasts(prev => [...prev, { id, message, type }]);
      }
    } else {
      const id = Date.now().toString() + Math.random().toString(36).substring(7);
      setToasts(prev => [...prev, { id, message, type }]);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  return React.createElement(ToastContext.Provider, { value: { addToast } },
    children,
    portalRoot
      ? createPortal(
          React.createElement('div', { className: "fixed top-4 left-4 right-4 md:left-auto md:right-4 z-50 space-y-3 max-w-sm pointer-events-none mx-auto md:mx-0" },
            toasts.map((toast) => React.createElement(Toast, {
              key: toast.id,
              message: toast.message,
              type: toast.type,
              onDismiss: () => removeToast(toast.id)
            }))
          ),
          portalRoot
        )
      : null
  );
};