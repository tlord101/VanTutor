import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import type { UserProfile } from '../types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidUuid = (id: string | null | undefined): boolean => {
  return typeof id === 'string' && UUID_REGEX.test(id);
};

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
  const lastActive = userProfile.last_activity_date ? new Date(userProfile.last_activity_date).toISOString().split('T')[0] : '';
  return userProfile.last_streak_date === getTodayDateString() || lastActive === getTodayDateString();
};

/**
 * Checks whether the user's streak is "active" (last award was today).
 */
export const isStreakActiveToday = (userProfile: UserProfile): boolean => {
  const lastActive = userProfile.last_activity_date ? new Date(userProfile.last_activity_date).toISOString().split('T')[0] : '';
  return userProfile.last_streak_date === getTodayDateString() || lastActive === getTodayDateString();
};

/**
 * Awards one streak day to the user in Supabase.
 * Returns true if the streak was incremented, false if it was already done today.
 */
export const awardDailyStreak = async (uid: string): Promise<boolean> => {
  if (!uid || !isSupabaseConfigured) return false;
  const today = getTodayDateString();

  // Ensure we have a valid Supabase UUID (fall back to active session user id if needed)
  let targetUid = uid;
  if (!isValidUuid(targetUid)) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id && isValidUuid(authData.user.id)) {
        targetUid = authData.user.id;
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }

  try {
    // 1. Direct Supabase profile update (safe & direct)
    const { data: profile, error: selectErr } = await supabase
      .from('profiles')
      .select('streak, last_active_date')
      .eq('id', targetUid)
      .maybeSingle();

    if (selectErr || !profile) {
      return false;
    }

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
      .eq('id', targetUid);

    return true;
  } catch (err) {
    console.warn('[Streaks] Streak update note:', err);
    return false;
  }
};
