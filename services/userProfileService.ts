import { db } from '../firebase';
import { ref as dbRef, get, onValue } from 'firebase/database';
import type { UserProfile } from '../types';
import { readCachedJson, writeCachedJson } from '../utils/cache';

// In-memory cache for ultra-fast zero-latency lookup
const profileMemoryCache = new Map<string, UserProfile>();

export const getCachedUserProfile = (uid: string): UserProfile | null => {
    return profileMemoryCache.get(uid) || null;
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
    if (!uid) return null;
    
    // Check memory cache first
    const mem = profileMemoryCache.get(uid);
    if (mem) return mem;

    // Check persistent cache
    try {
        const cached = await readCachedJson<UserProfile>(`user_profile_${uid}`);
        if (cached && (cached.display_name || cached.uid)) {
            profileMemoryCache.set(uid, cached);
            return cached;
        }
    } catch {
        // Continue to network fetch
    }

    try {
        const snap = await get(dbRef(db, `users/${uid}`));
        if (snap.exists()) {
            const data = snap.val();
            const profile: UserProfile = {
                uid,
                display_name: data.displayName || data.display_name || 'User',
                photo_url: data.photoURL || data.photo_url || '',
                ...data
            };
            profileMemoryCache.set(uid, profile);
            writeCachedJson(`user_profile_${uid}`, profile);
            return profile;
        }
    } catch (err) {
        console.warn(`Failed to fetch user profile for ${uid}:`, err);
    }
    return null;
};

export const getMultipleUserProfiles = async (uids: string[]): Promise<UserProfile[]> => {
    if (!uids || uids.length === 0) return [];
    const uniqueUids = Array.from(new Set(uids.filter(Boolean)));
    const profiles = await Promise.all(uniqueUids.map(uid => getUserProfile(uid)));
    return profiles.filter((p): p is UserProfile => p !== null);
};

export const subscribeUserProfile = (uid: string, callback: (profile: UserProfile | null) => void) => {
    if (!uid) return () => {};
    const userRef = dbRef(db, `users/${uid}`);
    return onValue(userRef, (snap) => {
        if (snap.exists()) {
            const data = snap.val();
            const profile: UserProfile = {
                uid,
                display_name: data.displayName || data.display_name || 'User',
                photo_url: data.photoURL || data.photo_url || '',
                ...data
            };
            profileMemoryCache.set(uid, profile);
            writeCachedJson(`user_profile_${uid}`, profile);
            callback(profile);
        } else {
            callback(null);
        }
    });
};
