import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import type { UserProfile, Course, Topic } from '../types';

export interface UserSubscriptionInfo {
  plan_type: 'free' | 'weekly' | 'monthly' | 'semester';
  status: 'active' | 'expired' | 'cancelled';
  daily_topic_allowance: number;
  topics_used_today: number;
  unlocked_topics_pack: number;
  last_reset_date: string;
  expires_at?: string | null;
}

class SupabaseDataService {
  private static instance: SupabaseDataService;

  private constructor() {}

  public static getInstance(): SupabaseDataService {
    if (!SupabaseDataService.instance) {
      SupabaseDataService.instance = new SupabaseDataService();
    }
    return SupabaseDataService.instance;
  }

  // ── Profile Operations ─────────────────────────────────────────────────────

  public async fetchUserProfile(userId: string): Promise<UserProfile | null> {
    if (!isSupabaseConfigured || !userId) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return {
        uid: data.id,
        display_name: data.full_name || data.username || 'User',
        photo_url: data.avatar_url || '',
        email: data.email || '',
        school_id: data.school_id,
        department_id: data.department_id,
        level: data.level,
        xp: data.xp || 0,
        current_streak: data.streak || 0,
        last_activity_date: Date.now(),
        notifications_enabled: true,
        ai_credits_balance: data.ai_credits ?? 50,
        is_admin: data.is_admin || false,
        subscription_status: data.is_paid_subscriber ? 'semester' : (data.subscription_status || 'free'),
      };
    } catch (err) {
      console.warn('[SupabaseDataService] Exception fetching profile:', err);
      return null;
    }
  }

  public async upsertUserProfile(profile: Partial<UserProfile> & { uid: string }): Promise<void> {
    if (!isSupabaseConfigured || !profile.uid) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: profile.uid,
          full_name: profile.display_name,
          avatar_url: profile.photo_url,
          email: profile.email,
          school_id: profile.school_id,
          department_id: profile.department_id,
          level: profile.level,
          xp: profile.xp,
          streak: profile.current_streak,
          ai_credits: profile.ai_credits_balance,
          is_admin: profile.is_admin,
          is_paid_subscriber: profile.subscription_status && profile.subscription_status !== 'none' && profile.subscription_status !== 'free',
          updated_at: new Date().toISOString(),
        });
      if (error) {
        console.error('[SupabaseDataService] Error saving profile:', error);
      }
    } catch (err) {
      console.error('[SupabaseDataService] Exception saving profile:', err);
    }
  }

  // ── Academic Hierarchy (Schools, Colleges, Departments) ───────────────────

  public async fetchSchools(): Promise<Array<{ id: string; name: string; short_name?: string }>> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('id, name, short_name')
        .order('name', { ascending: true });
      if (error) {
        console.warn('[SupabaseDataService] Error fetching schools:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('[SupabaseDataService] Exception fetching schools:', err);
      return [];
    }
  }

  public async fetchColleges(schoolId?: string): Promise<Array<{ id: string; name: string; school_id?: string }>> {
    if (!isSupabaseConfigured) return [];
    try {
      let query = supabase.from('colleges').select('id, name, school_id').order('name', { ascending: true });
      if (schoolId) query = query.eq('school_id', schoolId);
      const { data, error } = await query;
      if (error) {
        console.warn('[SupabaseDataService] Error fetching colleges:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('[SupabaseDataService] Exception fetching colleges:', err);
      return [];
    }
  }

  public async fetchDepartments(schoolId?: string, collegeId?: string): Promise<Array<{ id: string; name: string; college_id?: string; school_id?: string }>> {
    if (!isSupabaseConfigured) return [];
    try {
      let query = supabase.from('departments').select('id, name, college_id, school_id').order('name', { ascending: true });
      if (schoolId) query = query.eq('school_id', schoolId);
      if (collegeId) query = query.eq('college_id', collegeId);
      const { data, error } = await query;
      if (error) {
        console.warn('[SupabaseDataService] Error fetching departments:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('[SupabaseDataService] Exception fetching departments:', err);
      return [];
    }
  }

  public async upsertSchool(school: { id: string; name: string; short_name?: string }): Promise<void> {
    if (!isSupabaseConfigured || !school.id) return;
    try {
      await supabase.from('schools').upsert(school);
    } catch (err) {
      console.error('[SupabaseDataService] Error upserting school:', err);
    }
  }

  public async upsertCollege(college: { id: string; name: string; school_id: string }): Promise<void> {
    if (!isSupabaseConfigured || !college.id) return;
    try {
      await supabase.from('colleges').upsert(college);
    } catch (err) {
      console.error('[SupabaseDataService] Error upserting college:', err);
    }
  }

  public async upsertDepartment(department: { id: string; name: string; school_id?: string; college_id?: string }): Promise<void> {
    if (!isSupabaseConfigured || !department.id) return;
    try {
      await supabase.from('departments').upsert(department);
    } catch (err) {
      console.error('[SupabaseDataService] Error upserting department:', err);
    }
  }

  // ── Academic Courses & Topics ──────────────────────────────────────────────

  public async fetchCourses(departmentId?: string, level?: string): Promise<Course[]> {
    if (!isSupabaseConfigured) return [];
    try {
      let query = supabase.from('courses').select('*, topics(*)');
      if (departmentId) query = query.eq('department_id', departmentId);
      if (level) query = query.eq('level', level);

      const { data, error } = await query;
      if (error) {
        console.warn('[SupabaseDataService] Error fetching courses:', error);
        return [];
      }
      return (data || []).map((c: any) => ({
        course_id: c.id,
        course_name: c.title || c.code,
        course_code: c.code,
        level: c.level || '100lvl',
        semester: c.semester === 2 ? 'second' : 'first',
        topics: ((c.topics || []) as any[]).map(t => ({
          topic_id: t.id,
          topic_name: t.topic_name,
          topic_context: t.overview_json?.overview || '',
        })),
      })) as Course[];
    } catch (err) {
      console.warn('[SupabaseDataService] Exception fetching courses:', err);
      return [];
    }
  }

  // ── User Learning Progress ─────────────────────────────────────────────────

  public async saveTopicProgress(
    userId: string,
    courseId: string,
    topicId: string,
    completedBoards: number,
    isMastered: boolean = false,
    score: number = 0
  ): Promise<void> {
    if (!isSupabaseConfigured || !userId || !topicId) return;
    try {
      const { error } = await supabase
        .from('user_progress')
        .upsert({
          user_id: userId,
          course_id: courseId,
          topic_id: topicId,
          completed_boards: completedBoards,
          is_mastered: isMastered,
          score: score,
          last_studied_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,topic_id',
        });

      if (error) {
        console.warn('[SupabaseDataService] Error saving progress:', error);
      }
    } catch (err) {
      console.warn('[SupabaseDataService] Exception saving progress:', err);
    }
  }

  public async fetchUserProgress(userId: string): Promise<any[]> {
    if (!isSupabaseConfigured || !userId) return [];
    try {
      const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.warn('[SupabaseDataService] Error fetching user progress:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('[SupabaseDataService] Exception fetching user progress:', err);
      return [];
    }
  }

  // ── Subscription & Daily Topic Allowance ───────────────────────────────────

  public async fetchSubscription(userId: string): Promise<UserSubscriptionInfo> {
    const today = new Date().toISOString().split('T')[0];
    const defaultSub: UserSubscriptionInfo = {
      plan_type: 'free',
      status: 'active',
      daily_topic_allowance: 1,
      topics_used_today: 0,
      unlocked_topics_pack: 0,
      last_reset_date: today,
    };

    if (!isSupabaseConfigured || !userId) return defaultSub;

    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) return defaultSub;

      // Check if daily allowance needs resetting
      if (data.last_reset_date !== today) {
        await supabase
          .from('subscriptions')
          .update({
            topics_used_today: 0,
            last_reset_date: today,
          })
          .eq('user_id', userId);
        return {
          ...data,
          topics_used_today: 0,
          last_reset_date: today,
        };
      }

      return data as UserSubscriptionInfo;
    } catch (err) {
      console.warn('[SupabaseDataService] Error fetching subscription:', err);
      return defaultSub;
    }
  }

  public async consumeDailyVoiceTopic(userId: string): Promise<{ success: boolean; remainingToday: number; extraPacks: number }> {
    const sub = await this.fetchSubscription(userId);
    const today = new Date().toISOString().split('T')[0];

    if (sub.topics_used_today < sub.daily_topic_allowance) {
      // Consume from daily allowance
      const newUsed = sub.topics_used_today + 1;
      await supabase
        .from('subscriptions')
        .update({
          topics_used_today: newUsed,
          last_reset_date: today,
        })
        .eq('user_id', userId);

      return {
        success: true,
        remainingToday: Math.max(0, sub.daily_topic_allowance - newUsed),
        extraPacks: sub.unlocked_topics_pack,
      };
    } else if (sub.unlocked_topics_pack > 0) {
      // Consume from extra unlocked topics pack
      const newPack = sub.unlocked_topics_pack - 1;
      await supabase
        .from('subscriptions')
        .update({
          unlocked_topics_pack: newPack,
        })
        .eq('user_id', userId);

      return {
        success: true,
        remainingToday: 0,
        extraPacks: newPack,
      };
    }

    return {
      success: false,
      remainingToday: 0,
      extraPacks: 0,
    };
  }

  // ── Storage: Avatar Uploads ────────────────────────────────────────────────

  public async uploadAvatar(userId: string, file: Blob | File): Promise<string | null> {
    if (!isSupabaseConfigured || !userId) return null;
    try {
      const ext = file.type.split('/')[1] || 'jpg';
      const filePath = `${userId}/avatar_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('profile_avatars')
        .upload(filePath, file, {
          upsert: true,
        });

      if (uploadError) {
        console.error('[SupabaseDataService] Avatar upload error:', uploadError);
        return null;
      }

      const { data } = supabase.storage
        .from('profile_avatars')
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;
      await this.upsertUserProfile({ uid: userId, photo_url: publicUrl });
      return publicUrl;
    } catch (err) {
      console.error('[SupabaseDataService] Exception uploading avatar:', err);
      return null;
    }
  }
}

export const supabaseDataService = SupabaseDataService.getInstance();
export default supabaseDataService;
