import React, { useState, useEffect, useRef } from 'react';
import type { UserProfile } from '../types';
import { auth, storage, db, functions, type FirebaseUser } from '../firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { ref as dbRef, get, query, orderByChild, equalTo, update } from 'firebase/database';
import { useToast } from '../hooks/useToast';
import { Avatar } from './Avatar';
import { VerificationBadge } from './VerificationBadge';
import { SchoolHierarchySelector } from './SchoolHierarchySelector';


interface UserProfileProps {
  user: FirebaseUser | null;
  userProfile: UserProfile;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
}

export const UserProfileScreen: React.FC<UserProfileProps> = ({ user, userProfile, onProfileUpdate }) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(userProfile.display_name);
  const [bio, setBio] = useState(userProfile.bio || '');
  const [contactDetails, setContactDetails] = useState(userProfile.contact_details || '');
  const [privacySettings, setPrivacySettings] = useState(userProfile.privacy_settings || {
    public_contact: true,
    public_school: true,
    public_department: true,
    public_level: true
  });
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{type: 'avatar' | 'cover' | null, progress: number}>({type: null, progress: 0});
  const [departmentName, setDepartmentName] = useState<string>('');
  const [isDepartmentLoading, setIsDepartmentLoading] = useState(true);
  const [levels, setLevels] = useState<string[]>([]);
  const [isLevelsLoading, setIsLevelsLoading] = useState(true);
  
  const [isEditingAcademics, setIsEditingAcademics] = useState(false);
  const [editSchoolId, setEditSchoolId] = useState(userProfile.school_id || '');
  const [editCollegeId, setEditCollegeId] = useState(userProfile.college_id || '');
  const [editDepartmentId, setEditDepartmentId] = useState(userProfile.department_id || '');

  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [isSubmittingReferral, setIsSubmittingReferral] = useState(false);

  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && !userProfile.referral_code) {
      const newCode = user.uid.substring(0, 8).toUpperCase();
      onProfileUpdate({ referral_code: newCode, referrals_count: 0 });
    }
  }, [user, userProfile.referral_code, onProfileUpdate]);

  useEffect(() => {
    const fetchDepartmentData = async () => {
      if (!userProfile.school_id || !userProfile.college_id || !userProfile.department_id) {
        setDepartmentName('Not Set');
        setIsDepartmentLoading(false);
        setIsLevelsLoading(false);
        return;
      }
      setIsDepartmentLoading(true);
      setIsLevelsLoading(true);
      try {
        const snapshot = await get(dbRef(db, `schools_data/${userProfile.school_id}/colleges/${userProfile.college_id}/departments/${userProfile.department_id}`));
        const departmentData = snapshot.val();

        if (departmentData) {
          setDepartmentName(departmentData.name || departmentData.department_name || userProfile.department_id.replace(/_/g, ' '));
          
          let fetchedLevels: string[] = [];
          if (Array.isArray(departmentData.levels)) {
              fetchedLevels = departmentData.levels;
          } else if (departmentData.levels && typeof departmentData.levels === 'object') {
              fetchedLevels = Object.keys(departmentData.levels);
          }
          setLevels(fetchedLevels);
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
  }, [userProfile.school_id, userProfile.college_id, userProfile.department_id, addToast]);

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

  const handleSaveBioAndContact = async () => {
    setIsSaving(true);
    const result = await onProfileUpdate({ bio, contact_details: contactDetails });
    if (result.success) {
      addToast('Profile info updated successfully!', 'success');
    } else {
      addToast(result.error || "Failed to update profile info.", 'error');
    }
    setIsSaving(false);
  };

  const handleTogglePrivacy = async (key: keyof typeof privacySettings) => {
    const newSettings = { ...privacySettings, [key]: !privacySettings[key] };
    setPrivacySettings(newSettings);
    setIsSaving(true);
    const result = await onProfileUpdate({ privacy_settings: newSettings });
    if (result.success) {
      addToast('Privacy settings updated.', 'success');
    } else {
      addToast('Failed to update privacy settings.', 'error');
      setPrivacySettings(privacySettings); // revert
    }
    setIsSaving(false);
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setNewDisplayName(userProfile.display_name);
  };

  const handleSubmitReferral = async () => {
    if (!referralCodeInput.trim()) return addToast('Please enter a referral code.', 'error');
    if (referralCodeInput.trim().toUpperCase() === userProfile.referral_code) return addToast('You cannot use your own referral code.', 'error');
    if (userProfile.referred_by) return addToast('You have already used a referral code.', 'error');

    setIsSubmittingReferral(true);
    try {
      const usersRef = dbRef(db, 'users');
      const q = query(usersRef, orderByChild('referral_code'), equalTo(referralCodeInput.trim().toUpperCase()));
      const snapshot = await get(q);

      if (snapshot.exists()) {
        const referrerData = snapshot.val();
        const referrerUid = Object.keys(referrerData)[0];
        const referrerProfile = referrerData[referrerUid];

        const updates: Record<string, any> = {};
        
        // Update current user
        updates[`users/${userProfile.uid}/referred_by`] = referrerUid;
        updates[`users/${userProfile.uid}/ai_credits_balance`] = (userProfile.ai_credits_balance || 0) + 500;
        
        // Update referrer
        updates[`users/${referrerUid}/referrals_count`] = (referrerProfile.referrals_count || 0) + 1;
        updates[`users/${referrerUid}/ai_credits_balance`] = (referrerProfile.ai_credits_balance || 0) + 500;

        await update(dbRef(db), updates);
        
        addToast('Referral successful! You both received 500 AI credits.', 'success');
        onProfileUpdate({ referred_by: referrerUid, ai_credits_balance: (userProfile.ai_credits_balance || 0) + 500 });
      } else {
        addToast('Invalid referral code.', 'error');
      }
    } catch (error) {
      console.error("Referral error", error);
      addToast('An error occurred. Please try again.', 'error');
    }
    setIsSubmittingReferral(false);
  };

  const handleLevelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLevel = e.target.value;
    setIsSaving(true);
    const result = await onProfileUpdate({ level: newLevel });
    if (result.success) {
      addToast('Level updated successfully!', 'success');
    } else {
      addToast(result.error || "Failed to save new level.", 'error');
      e.target.value = userProfile.level || '';
    }
    setIsSaving(false);
  };

  const handleSaveAcademics = async () => {
      setIsSaving(true);
      const result = await onProfileUpdate({
          school_id: editSchoolId,
          college_id: editCollegeId,
          department_id: editDepartmentId
      });
      if (result.success) {
          addToast('Academic details updated successfully!', 'success');
          setIsEditingAcademics(false);
      } else {
          addToast(result.error || "Failed to save academic details.", 'error');
      }
      setIsSaving(false);
  };

  const compressImage = (blob: Blob, maxWidth: number, maxHeight: number, quality: number = 0.8): Promise<Blob> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onload = event => {
              const img = new Image();
              img.src = event.target?.result as string;
              img.onload = () => {
                  const canvas = document.createElement('canvas');
                  let width = img.width;
                  let height = img.height;

                  if (width > height) {
                      if (width > maxWidth) {
                          height = Math.round((height *= maxWidth / width));
                          width = maxWidth;
                      }
                  } else {
                      if (height > maxHeight) {
                          width = Math.round((width *= maxHeight / height));
                          height = maxHeight;
                      }
                  }
                  
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  ctx?.drawImage(img, 0, 0, width, height);
                  
                  canvas.toBlob((blobResult) => {
                      if (!blobResult) {
                          reject(new Error("Canvas to Blob failed"));
                          return;
                      }
                      resolve(blobResult);
                  }, 'image/jpeg', quality);
              };
              img.onerror = (e) => reject(e);
          };
          reader.onerror = (e) => reject(e);
      });
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
        addToast("File is too large. Please select an image under 5MB.", "error");
        return;
    }

    if (event.target) event.target.value = '';

    setIsSaving(true);
    setUploadProgress({ type, progress: 0 });

    let simulatedProgress = 0;
    const progressInterval = setInterval(() => {
        simulatedProgress = Math.min(simulatedProgress + 8, 85);
        setUploadProgress(prev => prev.type === type ? { type, progress: simulatedProgress } : prev);
    }, 300);

    const path = type === 'avatar'
        ? `profile-pictures/${user.uid}/profile.jpg`
        : `cover-photos/${user.uid}/cover.jpg`;
    const sRef = storageRef(storage, path);
    
    try {
        const compressedFile = await compressImage(
            file, 
            type === 'avatar' ? 800 : 1600, 
            type === 'avatar' ? 800 : 1600, 
            0.8 
        );
        const uploadResult = await uploadBytes(sRef, compressedFile);
        clearInterval(progressInterval);
        setUploadProgress({ type, progress: 100 });
        
        const downloadURL = await getDownloadURL(uploadResult.ref);
        const cacheBustURL = `${downloadURL}?t=${new Date().getTime()}`;
        const updateData = type === 'avatar' ? { photo_url: cacheBustURL } : { cover_photo: cacheBustURL };
        const updateResult = await onProfileUpdate(updateData);
        
        if (updateResult.success) {
            addToast(`${type === 'avatar' ? 'Profile' : 'Cover'} picture updated!`, "success");
        } else {
            addToast(updateResult.error || `Could not update ${type} picture.`, "error");
        }
    } catch (error) {
        clearInterval(progressInterval);
        console.error(`Failed to upload ${type}:`, error);
        addToast(`Could not update ${type === 'avatar' ? 'profile' : 'cover'} picture. Check your connection.`, "error");
    }

    setIsSaving(false);
    setUploadProgress({ type: null, progress: 0 });
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 pb-24 lg:pb-8 animate-fade-in text-slate-900 dark:text-slate-100">
        {/* Cover Photo */}
        <div className="relative w-full h-48 sm:h-64 bg-slate-800 shrink-0">
            {userProfile.cover_photo && (
                <img src={userProfile.cover_photo} alt="Cover" className="w-full h-full object-cover" />
            )}
            
            <input type="file" ref={coverInputRef} hidden accept="image/*" onChange={(e) => handleImageUpload(e, 'cover')} />
            
            {uploadProgress.type === 'cover' && (
                <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center backdrop-blur-sm transition-all duration-300">
                    <div className="w-64 bg-white dark:bg-slate-900 p-4 rounded-2xl backdrop-blur-md shadow-xl border border-white/30 dark:border-slate-800 flex flex-col items-center gap-3 transform scale-100">
                        <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mb-1 text-amber-500">
                            <i className="bi bi-cloud-arrow-up-fill text-2xl animate-bounce"></i>
                        </div>
                        <div className="w-full bg-black/30 rounded-full h-2.5 overflow-hidden ring-1 ring-black/10">
                            <div className="bg-amber-500 h-2.5 rounded-full transition-all duration-300 ease-out relative" style={{ width: `${Math.max(5, uploadProgress.progress)}%` }}>
                                <div className="absolute inset-0 bg-white/20 w-full animate-pulse"></div>
                            </div>
                        </div>
                        <p className="text-slate-900 dark:text-white text-xs font-black tracking-widest uppercase mt-1">Uploading... {Math.max(5, Math.round(uploadProgress.progress))}%</p>
                    </div>
                </div>
            )}

            <button
                onClick={() => coverInputRef.current?.click()}
                disabled={isSaving}
                className="absolute bottom-4 right-4 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-900 dark:text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-white dark:hover:bg-slate-800 transition flex items-center gap-2 border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
                <i className="bi bi-camera-fill text-amber-500 text-sm"></i>
                <span>{userProfile.cover_photo ? 'Edit Cover' : 'Add Cover'}</span>
            </button>
        </div>

        {/* Profile Info Area */}
        <div className="relative px-4 sm:px-8 max-w-5xl mx-auto w-full -mt-16 sm:-mt-20 z-10">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 mb-8">
                {/* Avatar */}
                <div className="relative group">
                    <div className="rounded-full p-1 bg-white dark:bg-slate-900 shadow-xl">
                        <Avatar className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-white dark:border-slate-800" photo_url={userProfile.photo_url} display_name={userProfile.display_name || 'User'} />
                    </div>
                    
                    <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => handleImageUpload(e, 'avatar')} />

                    {uploadProgress.type === 'avatar' && (
                        <div className="absolute inset-0 z-20 bg-black/50 rounded-full flex items-center justify-center flex-col gap-1 backdrop-blur-sm border-4 border-white/20 overflow-hidden group-hover:opacity-100">
                            <div className="relative w-16 h-16 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                    <circle className="text-white/20 stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent"></circle>
                                    <circle className="text-amber-500 progress-ring__circle stroke-current transition-all duration-300 ease-out" strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * uploadProgress.progress) / 100}></circle>
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-white text-[10px] font-black">{Math.round(uploadProgress.progress)}%</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSaving}
                        className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 bg-amber-500 text-slate-950 w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:bg-amber-400 transition border-2 border-white dark:border-slate-800 opacity-90 group-hover:opacity-100 cursor-pointer font-bold"
                    >
                        <i className="bi bi-camera-fill text-base"></i>
                    </button>
                </div>

                {/* Name & Basic Info */}
                <div className="flex-1 text-center sm:text-left mb-2 sm:mb-6">
                    {isEditingName ? (
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <input
                                type="text"
                                value={newDisplayName}
                                onChange={(e) => setNewDisplayName(e.target.value)}
                                className="w-full sm:w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-4 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none shadow-sm"
                                disabled={isSaving}
                            />
                            <div className="flex gap-2">
                                <button onClick={handleSaveName} disabled={isSaving || newDisplayName.trim() === ''} className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl text-sm font-black shadow-sm hover:bg-amber-400 transition disabled:opacity-50 cursor-pointer">
                                    Save
                                </button>
                                <button onClick={handleCancelEdit} disabled={isSaving} className="px-5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50 cursor-pointer">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                                <span>{userProfile.display_name}</span>
                                <VerificationBadge status={userProfile.subscription_status} />
                            </h1>
                            <button onClick={() => setIsEditingName(true)} className="px-4 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer flex items-center gap-1.5">
                                <i className="bi bi-pencil text-xs"></i>
                                <span>Edit Name</span>
                            </button>
                        </div>
                    )}
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-2">{user?.email}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Bio & Contact */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">About Me</h3>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell others about yourself, your interests, or study habits..."
                            className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30 min-h-[120px] resize-none"
                            disabled={isSaving}
                        />

                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-6 mb-4">Contact Information</h3>
                        <textarea
                            value={contactDetails}
                            onChange={(e) => setContactDetails(e.target.value)}
                            placeholder="Add links to your social media or ways to contact you..."
                            className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30 min-h-[100px] resize-none"
                            disabled={isSaving}
                        />

                        <div className="mt-4 flex justify-end">
                            <button onClick={handleSaveBioAndContact} disabled={isSaving} className="px-6 py-2.5 bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 rounded-xl text-sm font-black shadow-sm transition disabled:opacity-50 cursor-pointer">
                                Save Profile Info
                            </button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Academic Details</h3>
                            {!isEditingAcademics ? (
                                <button onClick={() => setIsEditingAcademics(true)} className="text-xs font-bold text-amber-500 hover:text-amber-400 cursor-pointer">Edit</button>
                            ) : (
                                <button onClick={() => setIsEditingAcademics(false)} className="text-xs font-bold text-slate-400 hover:text-slate-300 cursor-pointer">Cancel</button>
                            )}
                        </div>
                        {isEditingAcademics ? (
                            <div className="space-y-4">
                                <SchoolHierarchySelector
                                    schoolId={editSchoolId}
                                    setSchoolId={setEditSchoolId}
                                    collegeId={editCollegeId}
                                    setCollegeId={setEditCollegeId}
                                    departmentId={editDepartmentId}
                                    setDepartmentId={setEditDepartmentId}
                                />
                                <button 
                                    onClick={handleSaveAcademics}
                                    disabled={isSaving || !editSchoolId || !editCollegeId || !editDepartmentId}
                                    className="w-full mt-4 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-sm font-black shadow-sm transition disabled:opacity-50 cursor-pointer"
                                >
                                    Save Academic Info
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Department</p>
                                        <p className="text-slate-900 dark:text-white font-bold text-sm mt-0.5">{isDepartmentLoading ? 'Loading...' : departmentName}</p>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 gap-3">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Level</p>
                                    </div>
                                    {isLevelsLoading ? (
                                        <span className="text-slate-500 dark:text-slate-400 text-sm font-semibold">Loading...</span>
                                    ) : (
                                        <select
                                            value={userProfile.level || ''}
                                            onChange={handleLevelChange}
                                            disabled={isSaving || levels.length === 0}
                                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-4 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm cursor-pointer"
                                        >
                                            {levels.length > 0 ? (
                                                levels.map((level) => (
                                                    <option key={level} value={level}>{level} Level</option>
                                                ))
                                            ) : (
                                                <option value={userProfile.level} disabled>{userProfile.level} Level</option>
                                            )}
                                        </select>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Privacy Settings */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                                <i className="bi bi-shield-lock text-lg"></i>
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white">Privacy Settings</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Control your visibility</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Contact Details</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Show contact to public</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_contact')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${privacySettings.public_contact ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white dark:bg-slate-900 w-4 h-4 rounded-full transition-transform ${privacySettings.public_contact ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">School Info</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Show school to public</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_school')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${privacySettings.public_school ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white dark:bg-slate-900 w-4 h-4 rounded-full transition-transform ${privacySettings.public_school ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Department</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Show department</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_department')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${privacySettings.public_department ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white dark:bg-slate-900 w-4 h-4 rounded-full transition-transform ${privacySettings.public_department ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Level</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Show level to public</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_level')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${privacySettings.public_level ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white dark:bg-slate-900 w-4 h-4 rounded-full transition-transform ${privacySettings.public_level ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                                <i className="bi bi-gift text-lg"></i>
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white">Referrals & Rewards</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Earn 500 AI credits</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 text-center">
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Your Referral Code</p>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="text-2xl font-black text-amber-500 tracking-widest">{userProfile.referral_code || '---'}</span>
                                    {userProfile.referral_code && (
                                        <button onClick={() => {
                                            navigator.clipboard.writeText(userProfile.referral_code!);
                                            addToast('Referral code copied!', 'success');
                                        }} className="p-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-500/30 transition cursor-pointer">
                                            <i className="bi bi-clipboard text-sm"></i>
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-2 font-medium">Friends referred: {userProfile.referrals_count || 0}</p>
                            </div>

                            {!userProfile.referred_by && (
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Were you referred by a friend?</p>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={referralCodeInput}
                                            onChange={(e) => setReferralCodeInput(e.target.value)}
                                            placeholder="Enter their code"
                                            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase"
                                        />
                                        <button
                                            onClick={handleSubmitReferral}
                                            disabled={isSubmittingReferral || !referralCodeInput.trim()}
                                            className="px-4 py-2 bg-amber-500 text-slate-950 rounded-xl text-sm font-black shadow-sm hover:bg-amber-400 transition disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                        >
                                            {isSubmittingReferral ? '...' : 'Claim'}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {userProfile.referred_by && (
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                                    <p className="text-xs font-bold text-emerald-500 flex items-center justify-center gap-1">
                                        <i className="bi bi-check-circle-fill"></i>
                                        <span>You've claimed a referral reward!</span>
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};
