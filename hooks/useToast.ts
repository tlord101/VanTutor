
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ToastMessage, ToastType } from '../types';
import { Toast } from '../components/Toast';

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

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prevToasts) => [...prevToasts, { id, message, type }]);
    triggerHapticFeedback(type);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  // FIX: Rewrote JSX using React.createElement to be compatible with a .ts file extension.
  // The original JSX syntax was causing parsing errors because the file is not a .tsx file.
  return React.createElement(ToastContext.Provider, { value: { addToast } },
    children,
    createPortal(
      React.createElement('div', { className: "fixed top-4 right-4 z-50 space-y-3 w-full max-w-sm" },
        toasts.map((toast) => React.createElement(Toast, {
          key: toast.id,
          message: toast.message,
          type: toast.type,
          onDismiss: () => removeToast(toast.id)
        }))
      ),
      document.body
    )
  );
};
