import React, { useState, useEffect, useRef } from 'react';
import type { UserProfile } from '../types';
import { auth, storage, db, functions, type FirebaseUser } from '../firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { ref as dbRef, get, query, orderByChild, equalTo, update } from 'firebase/database';
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
    <div className="h-full overflow-y-auto bg-[#F8F9FA] dark:bg-black pb-24 lg:pb-8 animate-fade-in">
        {/* Cover Photo */}
        <div className="relative w-full h-48 sm:h-64 bg-gradient-to-r from-[#009EE2]/20 to-[#0070B8]/20 shrink-0">
            {userProfile.cover_photo && (
                <img src={userProfile.cover_photo} alt="Cover" className="w-full h-full object-cover" />
            )}
            
            <input type="file" ref={coverInputRef} hidden accept="image/*" onChange={(e) => handleImageUpload(e, 'cover')} />
            
            {uploadProgress.type === 'cover' && (
                <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center backdrop-blur-sm transition-all duration-300">
                    <div className="w-64 bg-white dark:bg-black/20 p-4 rounded-2xl backdrop-blur-md shadow-xl border border-white/30 flex flex-col items-center gap-3 transform scale-100">
                        <div className="w-12 h-12 rounded-full bg-[#009EE2]/20 flex items-center justify-center mb-1">
                            <svg className="w-6 h-6 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                        </div>
                        <div className="w-full bg-black/30 rounded-full h-2.5 overflow-hidden ring-1 ring-black/10">
                            <div className="bg-gradient-to-r from-[#009EE2] to-[#0070B8] h-2.5 rounded-full transition-all duration-300 ease-out relative" style={{ width: `${Math.max(5, uploadProgress.progress)}%` }}>
                                <div className="absolute inset-0 bg-white dark:bg-black/20 w-full animate-pulse"></div>
                            </div>
                        </div>
                        <p className="text-white text-xs font-black tracking-widest uppercase mt-1">Uploading... {Math.max(5, Math.round(uploadProgress.progress))}%</p>
                    </div>
                </div>
            )}

            <button
                onClick={() => coverInputRef.current?.click()}
                disabled={isSaving}
                className="absolute bottom-4 right-4 z-20 bg-white dark:bg-black/80 backdrop-blur-sm text-[#212529] dark:text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-white dark:bg-black transition flex items-center gap-2 border border-[#E9ECEF] dark:border-transparent"
            >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                {userProfile.cover_photo ? 'Edit Cover' : 'Add Cover'}
            </button>
        </div>

        {/* Profile Info Area */}
        <div className="relative px-4 sm:px-8 max-w-5xl mx-auto w-full -mt-16 sm:-mt-20 z-10">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 mb-8">
                {/* Avatar */}
                <div className="relative group">
                    <div className="rounded-full p-1 bg-[#F8F9FA] dark:bg-black shadow-xl">
                        <Avatar className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-white" photo_url={userProfile.photo_url} display_name={userProfile.display_name || 'User'} />
                    </div>
                    
                    <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => handleImageUpload(e, 'avatar')} />

                    {uploadProgress.type === 'avatar' && (
                        <div className="absolute inset-0 z-20 bg-black/50 rounded-full flex items-center justify-center flex-col gap-1 backdrop-blur-sm border-4 border-white/20 overflow-hidden group-hover:opacity-100">
                            <div className="relative w-16 h-16 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                    <circle className="text-white/20 stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent"></circle>
                                    <circle className="text-[#009EE2] dark:text-[#F8F9FA] progress-ring__circle stroke-current transition-all duration-300 ease-out" strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * uploadProgress.progress) / 100}></circle>
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
                        className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 bg-[#009EE2] text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:bg-[#0070B8] transition border-2 border-white opacity-90 group-hover:opacity-100"
                    >
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
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
                                className="w-full sm:w-64 bg-white dark:bg-black border border-[#E9ECEF] dark:border-transparent rounded-xl py-2 px-4 text-[#212529] dark:text-white font-bold focus:ring-2 focus:ring-[#009EE2] focus:outline-none shadow-sm"
                                disabled={isSaving}
                            />
                            <div className="flex gap-2">
                                <button onClick={handleSaveName} disabled={isSaving || newDisplayName.trim() === ''} className="px-5 py-2 bg-[#009EE2] text-white rounded-xl text-sm font-bold shadow-sm hover:bg-[#0070B8] transition disabled:opacity-50">
                                    Save
                                </button>
                                <button onClick={handleCancelEdit} disabled={isSaving} className="px-5 py-2 bg-white dark:bg-black border border-[#E9ECEF] dark:border-transparent text-[#6C757D] dark:text-gray-400 rounded-xl text-sm font-bold hover:bg-neutral-50 transition disabled:opacity-50">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <h1 className="text-2xl sm:text-3xl font-black text-[#212529] dark:text-white tracking-tight flex items-center gap-2">
                                {userProfile.display_name}
                                <VerificationBadge status={userProfile.subscription_status} />
                            </h1>
                            <button onClick={() => setIsEditingName(true)} className="px-4 py-1.5 bg-white dark:bg-black border border-[#E9ECEF] dark:border-transparent text-[#6C757D] dark:text-gray-400 rounded-xl text-xs font-bold shadow-sm hover:bg-neutral-50 transition">
                                Edit Name
                            </button>
                        </div>
                    )}
                    <p className="text-sm font-bold text-[#6C757D] dark:text-gray-400 mt-2">{user?.email}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Bio & Contact */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-black p-6 rounded-3xl border border-[#E9ECEF] dark:border-transparent shadow-sm">
                        <h3 className="text-sm font-black uppercase tracking-widest text-[#ADB5BD] mb-4">About Me</h3>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell others about yourself, your interests, or study habits..."
                            className="w-full bg-[#F8F9FA] dark:bg-black border border-[#E9ECEF] dark:border-transparent rounded-2xl p-4 text-sm font-medium text-[#495057] focus:outline-none focus:ring-2 focus:ring-[#009EE2]/30 min-h-[120px] resize-none"
                            disabled={isSaving}
                        />

                        <h3 className="text-sm font-black uppercase tracking-widest text-[#ADB5BD] mt-6 mb-4">Contact Information</h3>
                        <textarea
                            value={contactDetails}
                            onChange={(e) => setContactDetails(e.target.value)}
                            placeholder="Add links to your social media or ways to contact you..."
                            className="w-full bg-[#F8F9FA] dark:bg-black border border-[#E9ECEF] dark:border-transparent rounded-2xl p-4 text-sm font-medium text-[#495057] focus:outline-none focus:ring-2 focus:ring-[#009EE2]/30 min-h-[100px] resize-none"
                            disabled={isSaving}
                        />

                        <div className="mt-4 flex justify-end">
                            <button onClick={handleSaveBioAndContact} disabled={isSaving} className="px-6 py-2.5 bg-[#212529] text-white rounded-xl text-sm font-black shadow-lg hover:bg-black transition disabled:opacity-50">
                                Save Profile Info
                            </button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-black p-6 rounded-3xl border border-[#E9ECEF] dark:border-transparent shadow-sm">
                        <h3 className="text-sm font-black uppercase tracking-widest text-[#ADB5BD] mb-4">Academic Details</h3>
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#F8F9FA] dark:bg-black rounded-2xl border border-[#E9ECEF] dark:border-transparent">
                                <div>
                                    <p className="text-[10px] font-bold text-[#ADB5BD] uppercase">Department</p>
                                    <p className="text-[#212529] dark:text-white font-bold text-sm mt-0.5">{isDepartmentLoading ? 'Loading...' : departmentName}</p>
                                </div>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#F8F9FA] dark:bg-black rounded-2xl border border-[#E9ECEF] dark:border-transparent gap-3">
                                <div>
                                    <p className="text-[10px] font-bold text-[#ADB5BD] uppercase">Level</p>
                                </div>
                                {isLevelsLoading ? (
                                    <span className="text-[#6C757D] dark:text-gray-400 text-sm font-semibold">Loading...</span>
                                ) : (
                                    <select
                                        value={userProfile.level || ''}
                                        onChange={handleLevelChange}
                                        disabled={isSaving || levels.length === 0}
                                        className="bg-white dark:bg-black border border-[#E9ECEF] dark:border-transparent rounded-xl py-2 px-4 text-[#212529] dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#009EE2] shadow-sm cursor-pointer"
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
                    </div>
                </div>

                {/* Right Column: Privacy Settings */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-black p-6 rounded-3xl border border-[#E9ECEF] dark:border-transparent shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-[#212529] dark:text-white">Privacy Settings</h3>
                                <p className="text-[10px] font-bold text-[#ADB5BD] uppercase tracking-wider">Control your visibility</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between py-3 border-b border-[#E9ECEF] dark:border-transparent last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-[#212529] dark:text-white">Contact Details</p>
                                    <p className="text-xs text-[#6C757D] dark:text-gray-400 font-medium">Show contact to public</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_contact')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${privacySettings.public_contact ? 'bg-[#009EE2]' : 'bg-neutral-200'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white dark:bg-black w-4 h-4 rounded-full transition-transform ${privacySettings.public_contact ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-[#E9ECEF] dark:border-transparent last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-[#212529] dark:text-white">School Info</p>
                                    <p className="text-xs text-[#6C757D] dark:text-gray-400 font-medium">Show school to public</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_school')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${privacySettings.public_school ? 'bg-[#009EE2]' : 'bg-neutral-200'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white dark:bg-black w-4 h-4 rounded-full transition-transform ${privacySettings.public_school ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-[#E9ECEF] dark:border-transparent last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-[#212529] dark:text-white">Department</p>
                                    <p className="text-xs text-[#6C757D] dark:text-gray-400 font-medium">Show department</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_department')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${privacySettings.public_department ? 'bg-[#009EE2]' : 'bg-neutral-200'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white dark:bg-black w-4 h-4 rounded-full transition-transform ${privacySettings.public_department ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-[#E9ECEF] dark:border-transparent last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-[#212529] dark:text-white">Level</p>
                                    <p className="text-xs text-[#6C757D] dark:text-gray-400 font-medium">Show level to public</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_level')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${privacySettings.public_level ? 'bg-[#009EE2]' : 'bg-neutral-200'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white dark:bg-black w-4 h-4 rounded-full transition-transform ${privacySettings.public_level ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-black p-6 rounded-3xl border border-[#E9ECEF] dark:border-transparent shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20v-6M6 20V10M18 20V4" /></svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-[#212529] dark:text-white">Referrals & Rewards</h3>
                                <p className="text-[10px] font-bold text-[#ADB5BD] uppercase tracking-wider">Earn 500 AI credits</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-slate-50 dark:bg-[#111] p-4 rounded-2xl border border-slate-100 dark:border-transparent text-center">
                                <p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Your Referral Code</p>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-widest">{userProfile.referral_code || '---'}</span>
                                    {userProfile.referral_code && (
                                        <button onClick={() => {
                                            navigator.clipboard.writeText(userProfile.referral_code!);
                                            addToast('Referral code copied!', 'success');
                                        }} className="p-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-2 font-medium">Friends referred: {userProfile.referrals_count || 0}</p>
                            </div>

                            {!userProfile.referred_by && (
                                <div className="pt-4 border-t border-[#E9ECEF] dark:border-white/10">
                                    <p className="text-xs font-bold text-slate-700 dark:text-white mb-2">Were you referred by a friend?</p>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={referralCodeInput}
                                            onChange={(e) => setReferralCodeInput(e.target.value)}
                                            placeholder="Enter their code"
                                            className="flex-1 bg-[#F8F9FA] dark:bg-[#111] border border-[#E9ECEF] dark:border-transparent rounded-xl px-4 text-sm font-bold text-[#212529] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#009EE2]/30 uppercase"
                                        />
                                        <button
                                            onClick={handleSubmitReferral}
                                            disabled={isSubmittingReferral || !referralCodeInput.trim()}
                                            className="px-4 py-2 bg-[#009EE2] text-white rounded-xl text-sm font-black shadow-md hover:bg-blue-600 transition disabled:opacity-50 whitespace-nowrap"
                                        >
                                            {isSubmittingReferral ? '...' : 'Claim'}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {userProfile.referred_by && (
                                <div className="pt-4 border-t border-[#E9ECEF] dark:border-white/10 text-center">
                                    <p className="text-xs font-bold text-green-600">You've claimed a referral reward!</p>
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
