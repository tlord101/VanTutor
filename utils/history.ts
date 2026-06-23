import { ref, push, get, set, serverTimestamp, query, orderByChild } from "firebase/database";
import { db } from "../firebase";

export type SavedItemType = 'flashcards' | 'exam' | 'past_questions';

export interface SavedItem {
  id?: string;
  type: SavedItemType;
  title: string;
  data: any;
  createdAt: number | object;
}

/**
 * Saves a generated material to the user's history
 */
export const saveToHistory = async (userId: string, item: Omit<SavedItem, 'createdAt' | 'id'>) => {
  if (!userId) return null;
  try {
    const historyRef = ref(db, `users/${userId}/history`);
    const newRef = push(historyRef);
    const dataToSave = {
      ...item,
      id: newRef.key,
      createdAt: serverTimestamp()
    };
    await set(newRef, dataToSave);
    return newRef.key;
  } catch (error) {
    console.error("Error saving to history:", error);
    return null;
  }
};

/**
 * Fetches user's history
 */
export const fetchHistory = async (userId: string): Promise<SavedItem[]> => {
  if (!userId) return [];
  try {
    const historyRef = ref(db, `users/${userId}/history`);
    const q = query(historyRef); // You can orderByChild('createdAt') if needed
    const snapshot = await get(q);
    if (snapshot.exists()) {
      const data = snapshot.val();
      const items: SavedItem[] = Object.keys(data).map(key => ({
        ...data[key],
        id: key
      }));
      // Sort descending by timestamp locally since serverTimestamp can be tricky
      return items.sort((a, b) => {
          const timeA = typeof a.createdAt === 'number' ? a.createdAt : 0;
          const timeB = typeof b.createdAt === 'number' ? b.createdAt : 0;
          return timeB - timeA;
      });
    }
    return [];
  } catch (error) {
    console.error("Error fetching history:", error);
    return [];
  }
};
