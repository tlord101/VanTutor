import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
import { ref as dbRef, onValue, set, push, update, increment, get } from 'firebase/database';
import { UserProfile } from '../types';
import { Avatar } from './Avatar';
import { useToast } from '../hooks/useToast';
import { writeCachedJson, readCachedJson } from '../utils/cache';

interface StudyPartnersProps {
    userProfile: UserProfile;
    onNavigate: (route: string) => void;
}

export const StudyPartners: React.FC<StudyPartnersProps> = ({ userProfile, onNavigate }) => {
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState<'find' | 'requests'>('find');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [allUsers, setAllUsers] = useState<UserProfile[]>(() => 
        readCachedJson<UserProfile[]>(`messenger_users_v2`, [])
    );
    const [studyPartners, setStudyPartners] = useState<Record<string, boolean>>(() => 
        readCachedJson<Record<string, boolean>>(`messenger_${userProfile.uid}_study_partners`, {})
    );
    const [partnerRequests, setPartnerRequests] = useState<Record<string, any>>(() => 
        readCachedJson<Record<string, any>>(`messenger_${userProfile.uid}_partner_requests`, {})
    );
    const [missingProfiles, setMissingProfiles] = useState<Record<string, UserProfile>>({});

    // Fetch users (same as Messenger logic)
    useEffect(() => {
        if (!auth.currentUser) return;
        const usersRef = dbRef(db, 'users');
        const unsubUsers = onValue(usersRef, (snapshot) => {
            if (snapshot.exists()) {
                const usersData = snapshot.val();
                const usersList = Object.keys(usersData).map(uid => ({
                    uid,
                    ...usersData[uid]
                })) as UserProfile[];
                setAllUsers(usersList);
                writeCachedJson(`messenger_users_v2`, usersList);
            }
        });

        const partnersRef = dbRef(db, `study_partners/${auth.currentUser.uid}`);
        const unsubPartners = onValue(partnersRef, (snapshot) => {
            const data = snapshot.exists() ? snapshot.val() : {};
            setStudyPartners(data);
            writeCachedJson(`messenger_${userProfile.uid}_study_partners`, data);
        });

        const requestsRef = dbRef(db, `partner_requests/${auth.currentUser.uid}`);
        const unsubRequests = onValue(requestsRef, (snapshot) => {
            const data = snapshot.exists() ? snapshot.val() : {};
            setPartnerRequests(data);
            writeCachedJson(`messenger_${userProfile.uid}_partner_requests`, data);
        });

        return () => {
            unsubUsers();
            unsubPartners();
            unsubRequests();
        };
    }, [userProfile.uid]);

    useEffect(() => {
        const fetchMissingProfiles = async () => {
            const missingIds = new Set<string>();
            Object.values(partnerRequests).forEach((req: any) => {
                if (req.senderId && !allUsers.find(u => u.uid === req.senderId) && !missingProfiles[req.senderId]) missingIds.add(req.senderId);
                if (req.receiverId && !allUsers.find(u => u.uid === req.receiverId) && !missingProfiles[req.receiverId]) missingIds.add(req.receiverId);
            });

            if (missingIds.size > 0) {
                const newMissingProfiles = { ...missingProfiles };
                for (const uid of missingIds) {
                    try {
                        const snapshot = await get(dbRef(db, `users/${uid}`));
                        if (snapshot.exists()) {
                            newMissingProfiles[uid] = { uid, ...snapshot.val() };
                        }
                    } catch (e) {
                        console.error("Failed to fetch missing profile", e);
                    }
                }
                setMissingProfiles(newMissingProfiles);
            }
        };

        if (Object.keys(partnerRequests).length > 0) {
            fetchMissingProfiles();
        }
    }, [partnerRequests, allUsers]);

    const sendPartnerRequest = async (targetUser: UserProfile) => {
        if (!auth.currentUser || !userProfile) return;
        try {
            const myRequestRef = dbRef(db, `partner_requests/${auth.currentUser.uid}/${targetUser.uid}`);
            const theirRequestRef = dbRef(db, `partner_requests/${targetUser.uid}/${auth.currentUser.uid}`);

            const now = Date.now();
            await set(myRequestRef, {
                status: 'sent',
                senderName: userProfile.display_name || 'User',
                senderId: auth.currentUser.uid,
                receiverId: targetUser.uid,
                timestamp: now
            });
            await set(theirRequestRef, {
                status: 'received',
                senderName: userProfile.display_name || 'User',
                senderId: auth.currentUser.uid,
                receiverId: targetUser.uid,
                timestamp: now
            });

            const notifRef = push(dbRef(db, `notifications/${targetUser.uid}`));
            await set(notifRef, {
                id: notifRef.key,
                title: 'New Study Partner Request',
                message: `${userProfile.display_name || 'A user'} sent you a study partner request!`,
                type: 'study_partner_request',
                is_read: false,
                timestamp: now,
                action_buttons: [
                    { label: 'View Request', action: 'navigate', route: 'study_partners' }
                ]
            });
            addToast(`Study partner request sent to ${targetUser.display_name}!`, 'success');
        } catch (err: any) {
            console.error('Failed to send partner request:', err);
            addToast('Failed to send request: ' + err.message, 'error');
        }
    };

    const acceptPartnerRequest = async (targetUser: UserProfile) => {
        if (!auth.currentUser) return;
        try {
            const myPartnerRef = dbRef(db, `study_partners/${auth.currentUser.uid}/${targetUser.uid}`);
            const theirPartnerRef = dbRef(db, `study_partners/${targetUser.uid}/${auth.currentUser.uid}`);
            await set(myPartnerRef, true);
            await set(theirPartnerRef, true);

            const myRequestRef = dbRef(db, `partner_requests/${auth.currentUser.uid}/${targetUser.uid}`);
            const theirRequestRef = dbRef(db, `partner_requests/${targetUser.uid}/${auth.currentUser.uid}`);
            await set(myRequestRef, null);
            await set(theirRequestRef, null);

            addToast(`You are now connected with ${targetUser.display_name}!`, 'success');
        } catch (err: any) {
            console.error('Failed to accept request:', err);
            addToast('Error accepting request.', 'error');
        }
    };

    const declinePartnerRequest = async (targetUid: string) => {
         if (!auth.currentUser) return;
        try {
            const myRequestRef = dbRef(db, `partner_requests/${auth.currentUser.uid}/${targetUid}`);
            const theirRequestRef = dbRef(db, `partner_requests/${targetUid}/${auth.currentUser.uid}`);
            await set(myRequestRef, null);
            await set(theirRequestRef, null);
            addToast('Request declined.', 'info');
        } catch (err: any) {
            console.error('Failed to decline request:', err);
            addToast('Error declining request.', 'error');
        }
    }

    const filteredUsers = useMemo(() => {
        let users = allUsers.filter(u => u.uid !== auth.currentUser?.uid);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            users = users.filter(u => (u.display_name || '').toLowerCase().includes(q) || (u.department_id || '').toLowerCase().includes(q));
        }
        return users;
    }, [allUsers, searchQuery]);

    const sentRequests = Object.values(partnerRequests).filter((req: any) => req.status === 'sent');
    const receivedRequests = Object.values(partnerRequests).filter((req: any) => req.status === 'received');

    return (
        <div className="flex flex-col h-full w-full bg-[#F8F9FA] dark:bg-black animate-fade-in">
            {/* Header */}
            <div className="flex items-center px-4 py-4 bg-white dark:bg-black border-b border-[#E9ECEF] dark:border-white/10 shrink-0 sticky top-0 z-10">
                <button
                    onClick={() => window.dispatchEvent(new Event('app-go-back'))}
                    className="mr-3 w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-100 text-[#6C757D] dark:text-gray-400 transition"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-black text-[#212529] dark:text-white">Study Partners</h1>
                    <p className="text-xs font-semibold text-[#6C757D] dark:text-gray-400">Build your academic network</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#E9ECEF] dark:border-white/10 bg-white dark:bg-black px-4 py-3 shrink-0 gap-3">
                <button
                    onClick={() => setActiveTab('find')}
                    className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition ${activeTab === 'find' ? 'bg-[#009EE2] text-white shadow-md shadow-[#009EE2]/20' : 'text-[#6C757D] dark:text-gray-400 hover:text-[#212529] dark:hover:text-white bg-neutral-50 dark:bg-black hover:bg-neutral-100 dark:hover:bg-neutral-900 dark:border dark:border-white/10'}`}
                >
                    Find Partners
                </button>
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition flex items-center gap-2 ${activeTab === 'requests' ? 'bg-[#009EE2] text-white shadow-md shadow-[#009EE2]/20' : 'text-[#6C757D] dark:text-gray-400 hover:text-[#212529] dark:hover:text-white bg-neutral-50 dark:bg-black hover:bg-neutral-100 dark:hover:bg-neutral-900 dark:border dark:border-white/10'}`}
                >
                    Requests
                    {(receivedRequests.length > 0 || sentRequests.length > 0) && (
                        <span className={`rounded-full text-[10px] font-black h-5 px-1.5 flex items-center justify-center ${activeTab === 'requests' ? 'bg-white dark:bg-black text-[#009EE2] dark:text-[#F8F9FA]' : 'bg-red-500 text-white'}`}>
                            {receivedRequests.length + sentRequests.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                {activeTab === 'find' ? (
                    <>
                        <div className="relative max-w-2xl mx-auto">
                            <input
                                type="text"
                                placeholder="Search by name or department..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-white dark:bg-black text-sm font-semibold text-[#212529] dark:text-white px-5 py-4 rounded-2xl border border-[#E9ECEF] dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#009EE2]/30 focus:border-[#009EE2] transition shadow-sm placeholder:text-[#ADB5BD]"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#ADB5BD]">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </div>
                        </div>

                        <div className="max-w-2xl mx-auto space-y-3">
                            {filteredUsers.map(u => {
                                const isPartner = studyPartners[u.uid] === true;
                                const req = partnerRequests[u.uid];
                                return (
                                    <div key={u.uid} className="flex items-center gap-4 p-4 bg-white dark:bg-black border border-[#E9ECEF] dark:border-white/10 rounded-2xl shadow-sm hover:shadow-md transition cursor-pointer" onClick={() => onNavigate(`public_profile_${u.uid}`)}>
                                        <Avatar className="w-12 h-12 rounded-full shrink-0 object-cover border border-[#E9ECEF] dark:border-white/10" photo_url={u.photo_url} display_name={u.display_name || 'User'} />
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-bold text-base text-[#212529] dark:text-white truncate">{u.display_name}</h4>
                                            {u.department_id && <p className="text-xs text-[#6C757D] dark:text-gray-400 font-medium truncate mt-0.5">{u.department_id.replace(/_/g, ' ')}</p>}
                                        </div>
                                        <div className="shrink-0" onClick={e => e.stopPropagation()}>
                                            {isPartner ? (
                                                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl">✓ Connected</span>
                                            ) : req?.status === 'sent' ? (
                                                <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-4 py-2 rounded-xl">Pending</span>
                                            ) : (
                                                <button onClick={() => sendPartnerRequest(u)} className="text-xs font-black uppercase tracking-wider text-white bg-[#009EE2] hover:bg-[#0070B8] px-4 py-2 rounded-xl transition shadow-sm">Connect</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredUsers.length === 0 && (
                                <div className="text-center py-10">
                                    <p className="text-[#6C757D] dark:text-gray-400 font-medium text-sm">No users found.</p>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="max-w-2xl mx-auto space-y-8">
                        {receivedRequests.length > 0 && (
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-wider text-[#6C757D] dark:text-gray-400 mb-4 pl-1">Received Requests ({receivedRequests.length})</h3>
                                <div className="space-y-3">
                                    {receivedRequests.map((req: any) => {
                                        const sender = allUsers.find(u => u.uid === req.senderId) || missingProfiles[req.senderId];
                                        return (
                                            <div key={req.senderId} className="flex items-center gap-4 p-4 bg-white dark:bg-black border border-[#E9ECEF] dark:border-white/10 rounded-2xl shadow-sm cursor-pointer" onClick={() => onNavigate(`public_profile_${req.senderId}`)}>
                                                <Avatar className="w-12 h-12 rounded-full shrink-0 object-cover border border-[#E9ECEF] dark:border-white/10" photo_url={sender?.photo_url} display_name={req.senderName || sender?.display_name || 'User'} />
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="font-bold text-base text-[#212529] dark:text-white truncate">{req.senderName || sender?.display_name || 'User'}</h4>
                                                    <p className="text-xs text-[#6C757D] dark:text-gray-400 font-medium truncate mt-0.5">Wants to connect with you</p>
                                                </div>
                                                <div className="shrink-0 flex gap-2" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => declinePartnerRequest(req.senderId)} className="text-xs font-bold text-[#6C757D] dark:text-gray-400 bg-neutral-100 hover:bg-neutral-200 px-4 py-2 rounded-xl transition">Decline</button>
                                                    <button onClick={() => sender && acceptPartnerRequest(sender)} className="text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl shadow-sm transition">Accept</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {sentRequests.length > 0 && (
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-wider text-[#6C757D] dark:text-gray-400 mb-4 pl-1">Sent Requests ({sentRequests.length})</h3>
                                <div className="space-y-3">
                                    {sentRequests.map((req: any) => {
                                        const receiver = allUsers.find(u => u.uid === req.receiverId) || missingProfiles[req.receiverId];
                                        return (
                                            <div key={req.receiverId} className="flex items-center gap-4 p-4 bg-white dark:bg-black border border-[#E9ECEF] dark:border-white/10 rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => onNavigate(`public_profile_${req.receiverId}`)}>
                                                <Avatar className="w-10 h-10 rounded-full shrink-0 object-cover border border-[#E9ECEF] dark:border-white/10" photo_url={receiver?.photo_url} display_name={receiver?.display_name || 'User'} />
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="font-bold text-sm text-[#212529] dark:text-white truncate">{receiver?.display_name || 'Unknown'}</h4>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                    <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-xl hidden sm:inline-block">Pending</span>
                                                    <button onClick={() => declinePartnerRequest(req.receiverId)} className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl transition border border-red-100">Cancel</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {receivedRequests.length === 0 && sentRequests.length === 0 && (
                            <div className="text-center py-10 bg-white dark:bg-black border border-[#E9ECEF] dark:border-white/10 rounded-3xl">
                                <p className="text-[#6C757D] dark:text-gray-400 font-medium text-sm">No pending requests.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
