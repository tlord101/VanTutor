import React, { createContext, useContext, useState, useEffect } from 'react';

import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref as dbRef, update, get } from 'firebase/database';

export type AppTheme = 'blue' | 'emerald' | 'violet' | 'rose' | 'amber';
export type MessengerTheme = 'default' | 'neon' | 'sunset' | 'forest' | 'midnight';
export type Mode = 'light' | 'dark';

interface ThemeContextType {
  mode: Mode;
  appTheme: AppTheme;
  messengerTheme: MessengerTheme;
  setMode: (mode: Mode) => void;
  setAppTheme: (theme: AppTheme) => void;
  setMessengerTheme: (theme: MessengerTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<Mode>('light');
  const [appTheme, setAppThemeState] = useState<AppTheme>('blue');
  const [messengerTheme, setMessengerThemeState] = useState<MessengerTheme>('default');
  const [userUid, setUserUid] = useState<string | null>(null);

  useEffect(() => {
    // Initial load from local storage as fallback/immediate
    const savedMode = localStorage.getItem('app_mode') as Mode;
    const savedAppTheme = localStorage.getItem('app_theme') as AppTheme;
    const savedMessengerTheme = localStorage.getItem('messenger_theme') as MessengerTheme;

    if (savedMode) setModeState(savedMode);
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setModeState('dark');

    if (savedAppTheme) setAppThemeState(savedAppTheme);
    if (savedMessengerTheme) setMessengerThemeState(savedMessengerTheme);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            setUserUid(user.uid);
            try {
                const prefsRef = dbRef(db, `users/${user.uid}/theme_preferences`);
                const snapshot = await get(prefsRef);
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    if (data.mode) {
                        setModeState(data.mode);
                        localStorage.setItem('app_mode', data.mode);
                    }
                    if (data.app_theme) {
                        setAppThemeState(data.app_theme);
                        localStorage.setItem('app_theme', data.app_theme);
                    }
                    if (data.messenger_theme) {
                        setMessengerThemeState(data.messenger_theme);
                        localStorage.setItem('messenger_theme', data.messenger_theme);
                    }
                }
            } catch (err) {
                console.error("Error loading theme prefs from Firebase:", err);
            }
        } else {
            setUserUid(null);
        }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    root.classList.remove('app-theme-blue', 'app-theme-emerald', 'app-theme-violet', 'app-theme-rose', 'app-theme-amber');
    root.classList.add(`app-theme-${appTheme}`);

    root.classList.remove('msg-theme-default', 'msg-theme-neon', 'msg-theme-sunset', 'msg-theme-forest', 'msg-theme-midnight');
    root.classList.add(`msg-theme-${messengerTheme}`);
  }, [mode, appTheme, messengerTheme]);

  const updateFirebasePref = (key: string, value: string) => {
      if (userUid) {
          try {
              update(dbRef(db, `users/${userUid}/theme_preferences`), { [key]: value });
          } catch (err) {
              console.error("Failed to update theme in Firebase", err);
          }
      }
  };

  const setMode = (newMode: Mode) => {
    setModeState(newMode);
    localStorage.setItem('app_mode', newMode);
    updateFirebasePref('mode', newMode);
  };

  const setAppTheme = (newTheme: AppTheme) => {
    setAppThemeState(newTheme);
    localStorage.setItem('app_theme', newTheme);
    updateFirebasePref('app_theme', newTheme);
  };

  const setMessengerTheme = (newTheme: MessengerTheme) => {
    setMessengerThemeState(newTheme);
    localStorage.setItem('messenger_theme', newTheme);
    updateFirebasePref('messenger_theme', newTheme);
  };

  return (
    <ThemeContext.Provider value={{ mode, appTheme, messengerTheme, setMode, setAppTheme, setMessengerTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
