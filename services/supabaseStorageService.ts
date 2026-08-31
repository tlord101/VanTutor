/**
 * supabaseStorageService.ts — Centralized Supabase Storage Service
 *
 * Replaces Firebase Cloud Storage for:
 * - Profile Avatars (bucket: 'profile_avatars')
 * - Course Materials & Textbooks (bucket: 'materials')
 * - Visual Solver Solution Shares & Images (bucket: 'solution_shares')
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export interface UploadResult {
  url: string | null;
  path: string | null;
  error?: string | null;
}

class SupabaseStorageService {
  /**
   * Upload Profile Avatar
   */
  public async uploadAvatar(userId: string, file: Blob | File): Promise<UploadResult> {
    if (!isSupabaseConfigured || !userId) {
      return { url: null, path: null, error: 'Supabase or User not initialized' };
    }

    try {
      const ext = (file as File).name?.split('.').pop() || 'jpg';
      const filePath = `${userId}/avatar_${Date.now()}.${ext}`;

      const { data, error } = await supabase.storage
        .from('profile_avatars')
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type || 'image/jpeg',
        });

      if (error) {
        return { url: null, path: null, error: error.message };
      }

      const { data: publicUrlData } = supabase.storage
        .from('profile_avatars')
        .getPublicUrl(data.path);

      return {
        url: publicUrlData.publicUrl,
        path: data.path,
        error: null,
      };
    } catch (err: any) {
      return { url: null, path: null, error: err.message || 'Avatar upload failed' };
    }
  }

  /**
   * Upload Course Material / Textbook PDF
   */
  public async uploadMaterial(
    userId: string,
    file: File | Blob,
    filename: string,
    onProgress?: (progress: number) => void
  ): Promise<UploadResult> {
    if (!isSupabaseConfigured) {
      return { url: null, path: null, error: 'Supabase is not configured' };
    }

    try {
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${userId || 'shared'}/${Date.now()}_${sanitizedFilename}`;

      const { data, error } = await supabase.storage
        .from('materials')
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type || 'application/pdf',
        });

      if (error) {
        return { url: null, path: null, error: error.message };
      }

      const { data: publicUrlData } = supabase.storage
        .from('materials')
        .getPublicUrl(data.path);

      onProgress?.(100);

      return {
        url: publicUrlData.publicUrl,
        path: data.path,
        error: null,
      };
    } catch (err: any) {
      return { url: null, path: null, error: err.message || 'Material upload failed' };
    }
  }

  /**
   * Upload Visual Solver Scan Image
   */
  public async uploadVisualScan(userId: string, imageBlob: Blob): Promise<UploadResult> {
    if (!isSupabaseConfigured) {
      return { url: null, path: null, error: 'Supabase is not configured' };
    }

    try {
      const filePath = `${userId || 'guest'}/scan_${Date.now()}.jpg`;

      const { data, error } = await supabase.storage
        .from('solution_shares')
        .upload(filePath, imageBlob, {
          upsert: true,
          contentType: 'image/jpeg',
        });

      if (error) {
        return { url: null, path: null, error: error.message };
      }

      const { data: publicUrlData } = supabase.storage
        .from('solution_shares')
        .getPublicUrl(data.path);

      return {
        url: publicUrlData.publicUrl,
        path: data.path,
        error: null,
      };
    } catch (err: any) {
      return { url: null, path: null, error: err.message || 'Scan upload failed' };
    }
  }

  /**
   * Delete Object from Bucket
   */
  public async deleteFile(bucket: string, path: string): Promise<boolean> {
    if (!isSupabaseConfigured || !path) return false;
    try {
      const { error } = await supabase.storage.from(bucket).remove([path]);
      return !error;
    } catch {
      return false;
    }
  }
}

export const supabaseStorageService = new SupabaseStorageService();
export default supabaseStorageService;
