import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import type { UserProfile } from '../types';

/**
 * Returns today's date as a 'YYYY-MM-DD' string in local time.
 */
export const getTodayDateString = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Returns true if the user has already earned a streak today.
 */
export const isStreakAlreadyAwardedToday = (userProfile: UserProfile): boolean => {
  return userProfile.last_streak_date === getTodayDateString() || userProfile.last_active_date === getTodayDateString();
};

/**
 * Checks whether the user's streak is "active" (last award was today).
 */
export const isStreakActiveToday = (userProfile: UserProfile): boolean => {
  return userProfile.last_streak_date === getTodayDateString() || userProfile.last_active_date === getTodayDateString();
};

/**
 * Awards one streak day to the user in Supabase.
 * Returns true if the streak was incremented, false if it was already done today.
 */
export const awardDailyStreak = async (uid: string): Promise<boolean> => {
  if (!uid || !isSupabaseConfigured) return false;
  const today = getTodayDateString();

  try {
    // 1. Try atomic RPC streak update first
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('update_daily_streak', {
      p_user_id: uid,
    });

    if (!rpcErr && rpcRes?.success) {
      return true;
    }

    // 2. Direct Supabase profile update fallback
    const { data: profile } = await supabase
      .from('profiles')
      .select('streak, last_active_date')
      .eq('id', uid)
      .maybeSingle();

    if (profile) {
      if (profile.last_active_date === today) {
        return false;
      }

      const currentStreak = profile.streak || 0;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      const newStreak = profile.last_active_date === yesterdayStr ? currentStreak + 1 : 1;

      await supabase
        .from('profiles')
        .update({
          streak: newStreak,
          last_active_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('id', uid);

      return true;
    }

    return false;
  } catch (err) {
    console.warn('[Streaks] Supabase streak update note:', err);
    return false;
  }
};
