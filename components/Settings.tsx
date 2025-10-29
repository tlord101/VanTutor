import React, { useState, useEffect } from 'react';
import type { UserProfile } from '../types';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '../hooks/useToast';

declare var __app_id: string;

interface SettingsProps {
  user: User | null;
  userProfile: UserProfile;
  onLogout: () => void;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
}

export const Settings: React.FC<SettingsProps> = ({ user, userProfile, onLogout, onProfileUpdate }) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(userProfile.displayName);
  const [isSaving, setIsSaving] = useState(false);
  const [courseName, setCourseName] = useState<string>('');
  const [isCourseLoading, setIsCourseLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    const fetchCourseName = async () => {
      if (!userProfile.courseId) {
        setCourseName('Not Set');
        setIsCourseLoading(false);
        return;
      }
      setIsCourseLoading(true);
      try {
        const courseDocRef = doc(db, `artifacts/${__app_id}/public/data/courses`, userProfile.courseId);
        const courseSnap = await getDoc(courseDocRef);
        if (courseSnap.exists()) {
          setCourseName(courseSnap.data().courseName || userProfile.courseId.replace(/_/g, ' '));
        } else {
          setCourseName(userProfile.courseId.replace(/_/g, ' '));
        }
      } catch (error) {
        console.error("Failed to fetch course name:", error);
        setCourseName(userProfile.courseId.replace(/_/g, ' '));
      } finally {
        setIsCourseLoading(false);
      }
    };

    fetchCourseName();
  }, [userProfile.courseId]);

  const handleSaveName = async () => {
    if (newDisplayName.trim() === '' || newDisplayName.trim() === userProfile.displayName) {
      setIsEditingName(false);
      setNewDisplayName(userProfile.displayName);
      return;
    }
    setIsSaving(true);
    const result = await onProfileUpdate({ displayName: newDisplayName.trim() });
    if (result.success) {
      setIsEditingName(false);
      addToast('Display name updated successfully!', 'success');
    } else {
      addToast(result.error || "Failed to save new display name.", 'error');
    }
    setIsSaving(false);
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setNewDisplayName(userProfile.displayName);
  }

  return (
    <div className="flex-1 flex flex-col h-full w-full">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Display Name</span>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="bg-gray-50 border border-gray-300 rounded-md py-1 px-2 text-gray-900 font-medium focus:ring-1 focus:ring-lime-500 focus:outline-none"
                    disabled={isSaving}
                  />
                  <button onClick={handleSaveName} disabled={isSaving || newDisplayName.trim() === ''} className="text-sm font-semibold text-lime-600 hover:text-lime-500 disabled:opacity-50">
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={handleCancelEdit} disabled={isSaving} className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <span className="text-gray-800 font-medium">{userProfile.displayName}</span>
                  <button onClick={() => setIsEditingName(true)} className="text-sm text-lime-600 hover:underline">
                    Edit
                  </button>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center border-t border-gray-200 pt-4">
              <span className="text-gray-600">Email</span>
              <span className="text-gray-800 font-medium">{user?.email}</span>
            </div>
             <div className="flex justify-between items-center border-t border-gray-200 pt-4">
              <span className="text-gray-600">Current Course</span>
              <span className="text-gray-800 font-medium">{isCourseLoading ? 'Loading...' : courseName}</span>
            </div>
             <div className="flex justify-between items-center border-t border-gray-200 pt-4">
              <span className="text-gray-600">Level</span>
              <span className="text-gray-800 font-medium">{userProfile.level}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Account Actions</h3>
           <div>
             <button
                onClick={onLogout}
                className="w-full text-left p-3 rounded-lg text-red-600 hover:bg-red-100 transition-colors duration-200"
              >
                Logout
              </button>
           </div>
        </div>

      </div>
    </div>
  );
};