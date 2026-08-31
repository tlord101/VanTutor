/**
 * supabaseAuthService.ts — Centralized Supabase Authentication Service for Avelut
 *
 * Provides typed methods for user authentication, Google OAuth, session management,
 * and user profile synchronization with Supabase Auth & PostgreSQL.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import type { UserProfile } from '../types';

export interface AuthResponse {
  user: any | null;
  profile: UserProfile | null;
  error?: string | null;
}

class SupabaseAuthService {
  /**
   * Listen to auth state changes
   */
  public onAuthStateChanged(callback: (user: any | null, profile: UserProfile | null) => void) {
    if (!isSupabaseConfigured) {
      callback(null, null);
      return () => {};
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user || null;
      if (user) {
        const profile = await this.getUserProfile(user.id);
        callback(user, profile);
      } else {
        callback(null, null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }

  /**
   * Get current authenticated user
   */
  public async getCurrentUser(): Promise<any | null> {
    if (!isSupabaseConfigured) return null;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  }

  /**
   * Sign up with Email and Password
   */
  public async signUpWithEmail(
    email: string,
    pass: string,
    fullName: string,
    metadata: Partial<UserProfile> = {}
  ): Promise<AuthResponse> {
    if (!isSupabaseConfigured) {
      return { user: null, profile: null, error: 'Supabase is not configured' };
    }

    try {
      const username = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '') + '_' + Math.floor(1000 + Math.random() * 9000);
      
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: pass,
        options: {
          data: {
            full_name: fullName.trim(),
            name: fullName.trim(),
            username,
            ...metadata,
          },
        },
      });

      if (error) {
        return { user: null, profile: null, error: error.message };
      }

      const user = data.user;
      if (!user) {
        return { user: null, profile: null, error: 'Signup failed. Please try again.' };
      }

      // Upsert profile in Supabase
      const profile: UserProfile = {
        uid: user.id,
        email: user.email || email,
        displayName: fullName,
        username,
        school_id: metadata.school_id || '',
        school_name: metadata.school_name || '',
        department_id: metadata.department_id || '',
        department_name: metadata.department_name || '',
        level: metadata.level || '100',
        ai_credits: 50,
        xp: 0,
        streak: 1,
        is_admin: false,
        created_at: Date.now(),
        ...metadata,
      };

      await this.upsertProfile(user.id, profile);

      return { user, profile, error: null };
    } catch (err: any) {
      return { user: null, profile: null, error: err.message || 'Signup error' };
    }
  }

  /**
   * Sign in with Email and Password
   */
  public async signInWithEmail(email: string, pass: string): Promise<AuthResponse> {
    if (!isSupabaseConfigured) {
      return { user: null, profile: null, error: 'Supabase is not configured' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: pass,
      });

      if (error) {
        return { user: null, profile: null, error: error.message };
      }

      const user = data.user;
      if (!user) {
        return { user: null, profile: null, error: 'Login failed' };
      }

      const profile = await this.getUserProfile(user.id);
      return { user, profile, error: null };
    } catch (err: any) {
      return { user: null, profile: null, error: err.message || 'Login error' };
    }
  }

  /**
   * Sign in with Google OAuth
   */
  public async signInWithGoogle(): Promise<{ error?: string | null }> {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured' };
    }

    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/` : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) return { error: error.message };
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Google Sign-in failed' };
    }
  }

  /**
   * Send Password Reset Email
   */
  public async sendPasswordReset(email: string): Promise<{ success: boolean; error?: string | null }> {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Supabase is not configured' };
    }

    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/settings` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Password reset failed' };
    }
  }

  /**
   * Sign Out
   */
  public async signOut(): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[SupabaseAuth] Signout error:', err);
    }
  }

  /**
   * Retrieve User Profile from Supabase public.profiles
   */
  public async getUserProfile(userId: string): Promise<UserProfile | null> {
    if (!userId || !isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) return null;

      return {
        uid: data.id,
        email: data.email,
        displayName: data.full_name,
        username: data.username,
        photoURL: data.avatar_url,
        school_id: data.school_id,
        school_name: data.school_name,
        department_id: data.department_id,
        department_name: data.department_name,
        level: data.level,
        xp: data.xp || 0,
        streak: data.streak || 0,
        ai_credits: data.ai_credits ?? 50,
        is_admin: Boolean(data.is_admin),
        is_paid_subscriber: Boolean(data.is_paid_subscriber),
        created_at: new Date(data.created_at || Date.now()).getTime(),
      };
    } catch (err) {
      console.warn('[SupabaseAuth] Failed to load profile:', err);
      return null;
    }
  }

  /**
   * Upsert User Profile
   */
  public async upsertProfile(userId: string, profile: Partial<UserProfile>): Promise<void> {
    if (!userId || !isSupabaseConfigured) return;

    try {
      await supabase.from('profiles').upsert({
        id: userId,
        email: profile.email,
        full_name: profile.displayName,
        username: profile.username,
        avatar_url: profile.photoURL,
        school_id: profile.school_id,
        school_name: profile.school_name,
        department_id: profile.department_id,
        department_name: profile.department_name,
        level: profile.level,
        xp: profile.xp,
        streak: profile.streak,
        ai_credits: profile.ai_credits,
        is_admin: profile.is_admin,
        is_paid_subscriber: profile.is_paid_subscriber,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[SupabaseAuth] Profile upsert error:', err);
    }
  }
}

export const supabaseAuthService = new SupabaseAuthService();
export default supabaseAuthService;
