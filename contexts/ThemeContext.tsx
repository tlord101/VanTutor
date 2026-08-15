import React, { createContext, useContext, useState, useEffect } from 'react';
import { readCachedJson, writeCachedJson } from '../utils/cache';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref as dbRef, update, get } from 'firebase/database';

export type Mode = 'light' | 'dark';

interface ThemeContextType {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<Mode>(() => readCachedJson<Mode>('app_mode', 'light'));
  const [userUid, setUserUid] = useState<string | null>(null);

  useEffect(() => {
    // Initial load from cache
    const savedMode = readCachedJson<Mode>('app_mode', 'light');
    if (savedMode) setModeState(savedMode);

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
                        writeCachedJson('app_mode', data.mode, user.uid);
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

  }, [mode]);

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
    writeCachedJson('app_mode', newMode, userUid || 'global');
    updateFirebasePref('mode', newMode);
  };



  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
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
