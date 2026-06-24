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
  const [bio, setBio] = useState(userProfile.bio || '');
  const [contactDetails, setContactDetails] = useState(userProfile.contact_details || '');
  const [privacySettings, setPrivacySettings] = useState(userProfile.privacy_settings || {
    public_contact: true,
    public_school: true,
    public_department: true,
    public_level: true
  });
  const [isSaving, setIsSaving] = useState(false);

  const [departmentName, setDepartmentName] = useState<string>('');
  const [isDepartmentLoading, setIsDepartmentLoading] = useState(true);
  const [levels, setLevels] = useState<string[]>([]);
  const [isLevelsLoading, setIsLevelsLoading] = useState(true);

  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
        addToast("File is too large. Please select an image under 5MB.", "error");
        return;
    }

    setIsSaving(true);
    try {
        const path = type === 'avatar' ? `profile-pictures/${user.uid}` : `cover-photos/${user.uid}`;
        const ref = storageRef(storage, path);
        const uploadResult = await uploadBytes(ref, file);
        const downloadURL = await getDownloadURL(uploadResult.ref);
        const cacheBustURL = `${downloadURL}&t=${new Date().getTime()}`;
        
        const updateData = type === 'avatar' ? { photo_url: cacheBustURL } : { cover_photo: cacheBustURL };
        const result = await onProfileUpdate(updateData);
        
        if (result.success) {
            addToast(`${type === 'avatar' ? 'Profile' : 'Cover'} picture updated!`, "success");
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error(`Failed to upload ${type}:`, error);
        addToast(`Could not update ${type} picture.`, "error");
    } finally {
        setIsSaving(false);
        event.target.value = '';
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FA] pb-24 lg:pb-8 animate-fade-in">
        {/* Cover Photo */}
        <div className="relative w-full h-48 sm:h-64 bg-gradient-to-r from-[#009EE2]/20 to-[#0070B8]/20 shrink-0">
            {userProfile.cover_photo && (
                <img src={userProfile.cover_photo} alt="Cover" className="w-full h-full object-cover" />
            )}
            
            <input type="file" ref={coverInputRef} hidden accept="image/*" onChange={(e) => handleImageUpload(e, 'cover')} />
            <button
                onClick={() => coverInputRef.current?.click()}
                disabled={isSaving}
                className="absolute bottom-4 right-4 z-20 bg-white/80 backdrop-blur-sm text-[#212529] px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-white transition flex items-center gap-2 border border-[#E9ECEF]"
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
                    <div className="rounded-full p-1 bg-[#F8F9FA] shadow-xl">
                        <Avatar className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-white" photo_url={userProfile.photo_url} display_name={userProfile.display_name || 'User'} />
                    </div>
                    
                    <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => handleImageUpload(e, 'avatar')} />
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
                                className="w-full sm:w-64 bg-white border border-[#E9ECEF] rounded-xl py-2 px-4 text-[#212529] font-bold focus:ring-2 focus:ring-[#009EE2] focus:outline-none shadow-sm"
                                disabled={isSaving}
                            />
                            <div className="flex gap-2">
                                <button onClick={handleSaveName} disabled={isSaving || newDisplayName.trim() === ''} className="px-5 py-2 bg-[#009EE2] text-white rounded-xl text-sm font-bold shadow-sm hover:bg-[#0070B8] transition disabled:opacity-50">
                                    Save
                                </button>
                                <button onClick={handleCancelEdit} disabled={isSaving} className="px-5 py-2 bg-white border border-[#E9ECEF] text-[#6C757D] rounded-xl text-sm font-bold hover:bg-neutral-50 transition disabled:opacity-50">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <h1 className="text-2xl sm:text-3xl font-black text-[#212529] tracking-tight flex items-center gap-2">
                                {userProfile.display_name}
                                <VerificationBadge status={userProfile.subscription_status} />
                            </h1>
                            <button onClick={() => setIsEditingName(true)} className="px-4 py-1.5 bg-white border border-[#E9ECEF] text-[#6C757D] rounded-xl text-xs font-bold shadow-sm hover:bg-neutral-50 transition">
                                Edit Name
                            </button>
                        </div>
                    )}
                    <p className="text-sm font-bold text-[#6C757D] mt-2">{user?.email}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Bio & Contact */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-[#E9ECEF] shadow-sm">
                        <h3 className="text-sm font-black uppercase tracking-widest text-[#ADB5BD] mb-4">About Me</h3>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell others about yourself, your interests, or study habits..."
                            className="w-full bg-[#F8F9FA] border border-[#E9ECEF] rounded-2xl p-4 text-sm font-medium text-[#495057] focus:outline-none focus:ring-2 focus:ring-[#009EE2]/30 min-h-[120px] resize-none"
                            disabled={isSaving}
                        />

                        <h3 className="text-sm font-black uppercase tracking-widest text-[#ADB5BD] mt-6 mb-4">Contact Information</h3>
                        <textarea
                            value={contactDetails}
                            onChange={(e) => setContactDetails(e.target.value)}
                            placeholder="Add links to your social media or ways to contact you..."
                            className="w-full bg-[#F8F9FA] border border-[#E9ECEF] rounded-2xl p-4 text-sm font-medium text-[#495057] focus:outline-none focus:ring-2 focus:ring-[#009EE2]/30 min-h-[100px] resize-none"
                            disabled={isSaving}
                        />

                        <div className="mt-4 flex justify-end">
                            <button onClick={handleSaveBioAndContact} disabled={isSaving} className="px-6 py-2.5 bg-[#212529] text-white rounded-xl text-sm font-black shadow-lg hover:bg-black transition disabled:opacity-50">
                                Save Profile Info
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-[#E9ECEF] shadow-sm">
                        <h3 className="text-sm font-black uppercase tracking-widest text-[#ADB5BD] mb-4">Academic Details</h3>
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#F8F9FA] rounded-2xl border border-[#E9ECEF]">
                                <div>
                                    <p className="text-[10px] font-bold text-[#ADB5BD] uppercase">Department</p>
                                    <p className="text-[#212529] font-bold text-sm mt-0.5">{isDepartmentLoading ? 'Loading...' : departmentName}</p>
                                </div>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#F8F9FA] rounded-2xl border border-[#E9ECEF] gap-3">
                                <div>
                                    <p className="text-[10px] font-bold text-[#ADB5BD] uppercase">Level</p>
                                </div>
                                {isLevelsLoading ? (
                                    <span className="text-[#6C757D] text-sm font-semibold">Loading...</span>
                                ) : (
                                    <select
                                        value={userProfile.level || ''}
                                        onChange={handleLevelChange}
                                        disabled={isSaving || levels.length === 0}
                                        className="bg-white border border-[#E9ECEF] rounded-xl py-2 px-4 text-[#212529] font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#009EE2] shadow-sm cursor-pointer"
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
                    <div className="bg-white p-6 rounded-3xl border border-[#E9ECEF] shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-[#212529]">Privacy Settings</h3>
                                <p className="text-[10px] font-bold text-[#ADB5BD] uppercase tracking-wider">Control your visibility</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between py-3 border-b border-[#E9ECEF] last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-[#212529]">Contact Details</p>
                                    <p className="text-xs text-[#6C757D] font-medium">Show contact to public</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_contact')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${privacySettings.public_contact ? 'bg-[#009EE2]' : 'bg-neutral-200'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${privacySettings.public_contact ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-[#E9ECEF] last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-[#212529]">School Info</p>
                                    <p className="text-xs text-[#6C757D] font-medium">Show school to public</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_school')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${privacySettings.public_school ? 'bg-[#009EE2]' : 'bg-neutral-200'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${privacySettings.public_school ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-[#E9ECEF] last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-[#212529]">Department</p>
                                    <p className="text-xs text-[#6C757D] font-medium">Show department</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_department')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${privacySettings.public_department ? 'bg-[#009EE2]' : 'bg-neutral-200'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${privacySettings.public_department ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-[#E9ECEF] last:border-0">
                                <div>
                                    <p className="text-sm font-bold text-[#212529]">Level</p>
                                    <p className="text-xs text-[#6C757D] font-medium">Show level to public</p>
                                </div>
                                <button
                                    onClick={() => handleTogglePrivacy('public_level')}
                                    disabled={isSaving}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${privacySettings.public_level ? 'bg-[#009EE2]' : 'bg-neutral-200'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${privacySettings.public_level ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};
