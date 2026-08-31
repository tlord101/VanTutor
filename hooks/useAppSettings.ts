import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import type { AppSettings } from '../types';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from '../utils/appSettings';
import { readCachedJson, writeCachedJson } from '../utils/cache';

const CACHE_KEY = 'avelut_app_settings';

export const useAppSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    return readCachedJson<AppSettings>(CACHE_KEY, DEFAULT_APP_SETTINGS);
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      return !window.localStorage.getItem(CACHE_KEY);
    }
    return true;
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSettings(DEFAULT_APP_SETTINGS);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Initial fetch from Supabase
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value_json')
          .eq('key', 'global')
          .maybeSingle();

        if (isMounted) {
          if (!error && data?.value_json) {
            const normalized = normalizeAppSettings(data.value_json);
            setSettings(normalized);
            writeCachedJson(CACHE_KEY, normalized);
          } else {
            setSettings(DEFAULT_APP_SETTINGS);
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setSettings(DEFAULT_APP_SETTINGS);
          setIsLoading(false);
        }
      }
    };

    fetchSettings();

    // 2. Realtime subscription to app_settings changes
    const channel = supabase
      .channel('public:app_settings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
          filter: 'key=eq.global',
        },
        (payload: any) => {
          if (payload.new?.value_json) {
            const normalized = normalizeAppSettings(payload.new.value_json);
            setSettings(normalized);
            writeCachedJson(CACHE_KEY, normalized);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { settings, isLoading };
};
