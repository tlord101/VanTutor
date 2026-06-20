import React, { useState, useEffect, useRef } from 'react';
import type { UserProfile } from '../types';
import { auth, storage, db, type FirebaseUser } from '../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ref as dbRef, get } from 'firebase/database';
import { useToast } from '../hooks/useToast';
import { Avatar } from './Avatar';
import { VerificationBadge } from './VerificationBadge';

interface UserProfileProps {
  user: FirebaseUser | null;
  userProfile: UserProfile;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
}

export const UserProfileScreen: React.FC<UserProfileProps> = ({ user, userProfile, onProfileUpdate }) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(userProfile.display_name);
  const [isSaving, setIsSaving] = useState(false);

  const [departmentName, setDepartmentName] = useState<string>('');
  const [isDepartmentLoading, setIsDepartmentLoading] = useState(true);
  const [levels, setLevels] = useState<string[]>([]);
  const [isLevelsLoading, setIsLevelsLoading] = useState(true);

  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchDepartmentData = async () => {
      if (!userProfile.department_id) {
        setDepartmentName('Not Set');
        setIsDepartmentLoading(false);
        setIsLevelsLoading(false);
        return;
      }
      setIsDepartmentLoading(true);
      setIsLevelsLoading(true);
      try {
        const snapshot = await get(dbRef(db, `departments_data/${userProfile.department_id}`));
        const departmentData = snapshot.val();

        if (departmentData) {
          setDepartmentName(departmentData.department_name || userProfile.department_id.replace(/_/g, ' '));
          setLevels(departmentData.levels || []);
        } else {
          setDepartmentName(userProfile.department_id.replace(/_/g, ' '));
          setLevels([]);
        }
      } catch (error) {
        console.error("Failed to fetch department data:", error);
        setDepartmentName(userProfile.department_id.replace(/_/g, ' '));
        setLevels([]);
        addToast("Could not load department details.", "error");
      } finally {
        setIsDepartmentLoading(false);
        setIsLevelsLoading(false);
      }
    };

    fetchDepartmentData();
  }, [userProfile.department_id, addToast]);

  const handleSaveName = async () => {
    if (newDisplayName.trim() === '' || newDisplayName.trim() === userProfile.display_name) {
      setIsEditingName(false);
      setNewDisplayName(userProfile.display_name);
      return;
    }
    setIsSaving(true);
    const result = await onProfileUpdate({ display_name: newDisplayName.trim() });
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
    setNewDisplayName(userProfile.display_name);
  };

  const handleLevelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLevel = e.target.value;
    setIsSaving(true);
    const result = await onProfileUpdate({ level: newLevel });
    if (result.success) {
      addToast('Level updated successfully!', 'success');
    } else {
      addToast(result.error || "Failed to save new level.", 'error');
      e.target.value = userProfile.level;
    }
    setIsSaving(false);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        addToast("File is too large. Please select an image under 5MB.", "error");
        return;
    }

    setIsSaving(true);
    try {
        const avatarRef = storageRef(storage, `profile-pictures/${user.uid}`);
        const uploadResult = await uploadBytes(avatarRef, file);
        const downloadURL = await getDownloadURL(uploadResult.ref);
        const cacheBustURL = `${downloadURL}&t=${new Date().getTime()}`;
        const result = await onProfileUpdate({ photo_url: cacheBustURL });
        if (result.success) {
            addToast("Profile picture updated!", "success");
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error("Failed to upload profile picture:", error);
        addToast("Could not update profile picture.", "error");
    } finally {
        setIsSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!user || !userProfile.photo_url) return;
    setIsSaving(true);
    try {
        const result = await onProfileUpdate({ photo_url: "" });
          if (result.success) {
            addToast("Profile picture removed.", "success");
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error("Failed to remove profile picture:", error);
        addToast("Could not remove profile picture.", "error");
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-8 animate-in fade-in duration-300 max-w-4xl mx-auto">
      <div className="bg-white p-4 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Profile Picture</h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <Avatar display_name={userProfile.display_name} photo_url={userProfile.photo_url} className="w-24 h-24 shadow-md ring-4 ring-slate-50" />
            <div className="flex flex-col gap-3">
                <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleImageUpload} />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition-colors disabled:opacity-50 border border-blue-200/50"
                >
                    {isSaving ? 'Uploading...' : 'Upload New Picture'}
                </button>
                {userProfile.photo_url && (
                    <button
                        onClick={handleRemovePhoto}
                        disabled={isSaving}
                        className="text-sm font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 self-start"
                    >
                        Remove Picture
                    </button>
                )}
            </div>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Personal Information</h3>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <span className="text-slate-500 font-semibold text-sm">Display Name</span>
            {isEditingName ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full sm:w-64 bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  disabled={isSaving}
                />
                <button onClick={handleSaveName} disabled={isSaving || newDisplayName.trim() === ''} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50">
                  Save
                </button>
                <button onClick={handleCancelEdit} disabled={isSaving} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 disabled:opacity-50">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-slate-900 font-bold text-lg">{userProfile.display_name}</span>
                <VerificationBadge status={userProfile.subscription_status} />
                <button onClick={() => setIsEditingName(true)} className="ml-2 px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200">
                  Edit
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-t border-slate-100 pt-6">
            <span className="text-slate-500 font-semibold text-sm">Email Address</span>
            <span className="text-slate-900 font-bold">{user?.email}</span>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-t border-slate-100 pt-6">
            <span className="text-slate-500 font-semibold text-sm">Current Department</span>
            <span className="text-slate-900 font-bold bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{isDepartmentLoading ? 'Loading...' : departmentName}</span>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-t border-slate-100 pt-6">
            <span className="text-slate-500 font-semibold text-sm">Academic Level</span>
             {isLevelsLoading ? (
                <span className="text-slate-500 text-sm font-semibold">Loading levels...</span>
            ) : (
                <select
                    value={userProfile.level}
                    onChange={handleLevelChange}
                    disabled={isSaving || levels.length === 0}
                    className="w-full sm:w-auto bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm disabled:opacity-50 cursor-pointer"
                    aria-label="Change difficulty level"
                >
                    {levels.length > 0 ? (
                      levels.map((level) => (
                        <option key={level} value={level}>
                          {level} Level
                        </option>
                      ))
                    ) : (
                      <option value={userProfile.level} disabled>{userProfile.level} Level</option>
                    )}
                </select>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
