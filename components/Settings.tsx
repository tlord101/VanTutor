import React, { useState, useEffect, useRef } from 'react';
import type { UserProfile } from '../types';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import { supabase } from '../supabase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '../hooks/useToast';
import { Avatar } from './Avatar';
import { ConfirmationModal } from './ConfirmationModal';

declare var __app_id: string;

interface SettingsProps {
  user: User | null;
  userProfile: UserProfile;
  onLogout: () => void;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  onDeleteAccount: () => Promise<{ success: boolean; error?: string }>;
}

const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    disabled={disabled}
    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-lime-500 disabled:opacity-50 disabled:cursor-not-allowed ${
      checked ? 'bg-lime-600' : 'bg-gray-200'
    }`}
  >
    <span
      className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

export const Settings: React.FC<SettingsProps> = ({ user, userProfile, onLogout, onProfileUpdate, onDeleteAccount }) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(userProfile.displayName);
  const [isSaving, setIsSaving] = useState(false);
  const [courseName, setCourseName] = useState<string>('');
  const [isCourseLoading, setIsCourseLoading] = useState(true);
  const [levels, setLevels] = useState<string[]>([]);
  const [isLevelsLoading, setIsLevelsLoading] = useState(true);
  const [isNotificationSwitchOn, setIsNotificationSwitchOn] = useState(userProfile.notificationsEnabled);
  const [isNotificationSaving, setIsNotificationSaving] = useState(false);
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setIsNotificationSwitchOn(userProfile.notificationsEnabled);
  }, [userProfile.notificationsEnabled]);

  useEffect(() => {
    const fetchCourseData = async () => {
      if (!userProfile.courseId) {
        setCourseName('Not Set');
        setIsCourseLoading(false);
        setIsLevelsLoading(false);
        return;
      }
      setIsCourseLoading(true);
      setIsLevelsLoading(true);
      try {
        const courseDocRef = doc(db, 'artifacts', __app_id, 'public', 'data', 'courses', userProfile.courseId);
        const courseSnap = await getDoc(courseDocRef);
        if (courseSnap.exists()) {
          const data = courseSnap.data();
          setCourseName(data.courseName || userProfile.courseId.replace(/_/g, ' '));
          setLevels(data.levels || []);
        } else {
          setCourseName(userProfile.courseId.replace(/_/g, ' '));
          setLevels([]);
        }
      } catch (error) {
        console.error("Failed to fetch course data:", error);
        setCourseName(userProfile.courseId.replace(/_/g, ' '));
        setLevels([]);
        addToast("Could not load course details.", "error");
      } finally {
        setIsCourseLoading(false);
        setIsLevelsLoading(false);
      }
    };

    fetchCourseData();
  }, [userProfile.courseId, addToast]);
  
  const handleNotificationToggle = async (enabled: boolean) => {
    setIsNotificationSaving(true);
    const browserPermission = 'Notification' in window ? Notification.permission : 'denied';

    if (enabled) {
        // Toggling ON
        if (browserPermission === 'denied') {
            addToast("Notifications are blocked. Please enable them in browser settings.", 'error');
            setIsNotificationSaving(false);
            return;
        }

        let permission: NotificationPermission = browserPermission;
        if (browserPermission === 'default') {
            try {
                permission = await Notification.requestPermission();
            } catch (error) {
                console.error("Error requesting notification permission:", error);
                addToast("Could not request notification permission.", "error");
                setIsNotificationSaving(false);
                return;
            }
        }

        if (permission === 'granted') {
            try {
                await onProfileUpdate({ notificationsEnabled: true });
                setIsNotificationSwitchOn(true);
                addToast('Push notifications enabled!', 'success');
                
                const registration = await navigator.serviceWorker.ready;
                registration.showNotification('VANTUTOR', {
                    body: 'You will now receive important updates.',
                    icon: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20viewBox%3D%220%200%2052%2042%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M4.33331%2017.5L26%204.375L47.6666%2017.5L26%2030.625L4.33331%2017.5Z%22%20stroke%3D%22%2523A3E635%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M41.5%2021V29.75C41.5%2030.825%2040.85%2032.55%2039.4166%2033.25L27.75%2039.375C26.6666%2039.9%2025.3333%2039.9%2024.25%2039.375L12.5833%2033.25C11.15%2032.55%2010.5%2030.825%2010.5%2029.75V21%22%20stroke%3D%22%2523A3E635%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M47.6667%2017.5V26.25%22%20stroke%3D%22%2523A3E635%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E',
                    badge: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20viewBox%3D%220%200%2052%2042%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M4.33331%2017.5L26%204.375L47.6666%2017.5L26%2030.625L4.33331%2017.5Z%22%20fill%3D%22%2523FFFFFF%22%2F%3E%3C%2Fsvg%3E'
                });
            } catch (err) {
                addToast('Failed to save notification preference.', 'error');
            }
        } else {
             addToast(permission === 'denied' ? 'Notifications have been blocked.' : 'Notifications were not enabled.', 'info');
        }
    } else {
        // Toggling OFF
        try {
            await onProfileUpdate({ notificationsEnabled: false });
            setIsNotificationSwitchOn(false);
            addToast('Push notifications disabled from VANTUTOR.', 'info');
        } catch (err) {
             addToast('Failed to save notification preference.', 'error');
        }
    }
    setIsNotificationSaving(false);
  };


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
  };

  const handleLevelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLevel = e.target.value;
    setIsSaving(true);
    const result = await onProfileUpdate({ level: newLevel });
    if (result.success) {
      addToast('Level updated successfully!', 'success');
    } else {
      addToast(result.error || "Failed to save new level.", 'error');
      // Revert select to original value on failure
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
            const { error: uploadError } = await supabase.storage
                .from('profile-pictures')
                .upload(user.uid, file, { upsert: true });

            if (uploadError) throw uploadError;
            
            const { data } = supabase.storage
                .from('profile-pictures')
                .getPublicUrl(user.uid);
            
            // Add a timestamp to bust cache for updated images
            const downloadURL = `${data.publicUrl}?t=${new Date().getTime()}`;

            const result = await onProfileUpdate({ photoURL: downloadURL });
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
        if (!user || !userProfile.photoURL) return;
        setIsSaving(true);
        try {
            const { error } = await supabase.storage.from('profile-pictures').remove([user.uid]);
            if (error) throw error;
            
            const result = await onProfileUpdate({ photoURL: "" });
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

    const confirmDeletion = async () => {
      setIsDeleting(true);
      const result = await onDeleteAccount();
      if (!result.success) {
          addToast(result.error || 'Failed to delete account.', 'error');
          setIsDeleting(false);
          setIsDeleteModalOpen(false);
      }
      // On success, the App component will handle the user state change and redirect.
    };

  const browserPermission = 'Notification' in window ? Notification.permission : 'denied';

  return (
    <div className="p-4 sm:p-6 space-y-8">
      
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
             {isLevelsLoading ? (
                <span className="text-gray-500 text-sm">Loading levels...</span>
            ) : (
                <select
                    value={userProfile.level}
                    onChange={handleLevelChange}
                    disabled={isSaving || levels.length === 0}
                    className="bg-gray-50 border border-gray-300 rounded-md py-1 px-2 text-gray-900 font-medium focus:ring-1 focus:ring-lime-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Change difficulty level"
                >
                    {levels.length > 0 ? (
                      levels.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))
                    ) : (
                      <option value={userProfile.level} disabled>{userProfile.level}</option>
                    )}
                </select>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Picture</h3>
        <div className="flex items-center gap-4">
            <Avatar displayName={userProfile.displayName} photoURL={userProfile.photoURL} className="w-16 h-16" />
            <div className="flex flex-col gap-2">
                <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleImageUpload} />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                    {isSaving ? 'Uploading...' : 'Upload Picture'}
                </button>
                {userProfile.photoURL && (
                    <button
                        onClick={handleRemovePhoto}
                        disabled={isSaving}
                        className="text-sm text-red-600 hover:underline disabled:opacity-50"
                    >
                        Remove
                    </button>
                )}
            </div>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Notifications</h3>
        <div className="flex justify-between items-center">
            <div>
                <span className="text-gray-600">Enable Push Notifications</span>
                 <p className="text-xs text-gray-500 mt-1">
                    Get reminders and progress updates.
                </p>
            </div>
            <Switch 
                checked={isNotificationSwitchOn} 
                onChange={handleNotificationToggle}
                disabled={isNotificationSaving}
            />
        </div>
        {browserPermission === 'denied' && (
            <p className="text-xs text-yellow-700 mt-3 p-2 bg-yellow-50 rounded-md border border-yellow-200">
                Notifications are blocked by your browser. You'll need to go into your browser's site settings for VANTUTOR to re-enable them.
            </p>
        )}
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Account Actions</h3>
         <div className="divide-y divide-gray-200">
           <button
              onClick={onLogout}
              className="w-full text-left p-3 text-gray-700 font-medium hover:bg-gray-100 transition-colors duration-200"
            >
              Logout
            </button>
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="w-full text-left p-3 text-red-600 font-medium hover:bg-red-50 transition-colors duration-200"
            >
              Delete Account
            </button>
         </div>
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Delete Account"
        message="Are you sure? This will permanently delete your account and all associated data, including your progress, chat history, and exam results. This action cannot be undone."
        onConfirm={confirmDeletion}
        onCancel={() => setIsDeleteModalOpen(false)}
        confirmText="Yes, delete my account"
        isConfirming={isDeleting}
      />
    </div>
  );
};