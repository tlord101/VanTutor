import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { ref as dbRef, get, onValue, set, push } from 'firebase/database';
import { UserProfile } from '../types';
import { Avatar } from './Avatar';
import { useToast } from '../hooks/useToast';

interface PublicProfileProps {
    targetUid: string;
    onNavigate: (route: string) => void;
}

export const PublicProfile: React.FC<PublicProfileProps> = ({ targetUid, onNavigate }) => {
    const { addToast } = useToast();
    const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<'none' | 'connected' | 'sent' | 'received'>('none');
    const [partnerCount, setPartnerCount] = useState(0);

    const isSelf = auth.currentUser?.uid === targetUid;

    useEffect(() => {
        if (!targetUid) return;

        const fetchUser = async () => {
            try {
                const userSnapshot = await get(dbRef(db, `users/${targetUid}`));
                if (userSnapshot.exists()) {
                    setTargetUser({ uid: targetUid, ...userSnapshot.val() });
                }
            } catch (error) {
                console.error("Failed to fetch public profile", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUser();

        // Get their partner count
        const targetPartnersRef = dbRef(db, `study_partners/${targetUid}`);
        const unsubTargetPartners = onValue(targetPartnersRef, (snapshot) => {
            if (snapshot.exists()) {
                setPartnerCount(Object.keys(snapshot.val()).length);
            } else {
                setPartnerCount(0);
            }
        });

        if (auth.currentUser && !isSelf) {
            // Check connection status
            const myPartnersRef = dbRef(db, `study_partners/${auth.currentUser.uid}/${targetUid}`);
            const unsubMyPartners = onValue(myPartnersRef, (snapshot) => {
                if (snapshot.exists() && snapshot.val() === true) {
                    setConnectionStatus('connected');
                } else {
                    // If not connected, check requests
                    const myRequestRef = dbRef(db, `partner_requests/${auth.currentUser.uid}/${targetUid}`);
                    onValue(myRequestRef, (reqSnapshot) => {
                        if (reqSnapshot.exists()) {
                            setConnectionStatus(reqSnapshot.val().status); // 'sent' or 'received'
                        } else {
                            setConnectionStatus('none');
                        }
                    }, { onlyOnce: true }); // We just need it once per connection status change ideally, but keeping it simple
                }
            });

            return () => {
                unsubTargetPartners();
                unsubMyPartners();
            };
        }

        return () => {
            unsubTargetPartners();
        };
    }, [targetUid, isSelf]);

    const sendPartnerRequest = async () => {
        if (!auth.currentUser || !targetUser) return;
        try {
            // Get my own display name
            const myUserSnapshot = await get(dbRef(db, `users/${auth.currentUser.uid}`));
            const myName = myUserSnapshot.exists() ? myUserSnapshot.val().display_name : 'AVELITE';

            const myRequestRef = dbRef(db, `partner_requests/${auth.currentUser.uid}/${targetUid}`);
            const theirRequestRef = dbRef(db, `partner_requests/${targetUid}/${auth.currentUser.uid}`);

            const now = Date.now();
            await set(myRequestRef, {
                status: 'sent',
                senderName: myName,
                senderId: auth.currentUser.uid,
                receiverId: targetUid,
                timestamp: now
            });
            await set(theirRequestRef, {
                status: 'received',
                senderName: myName,
                senderId: auth.currentUser.uid,
                receiverId: targetUid,
                timestamp: now
            });

            const notifRef = push(dbRef(db, `notifications/${targetUid}`));
            await set(notifRef, {
                id: notifRef.key,
                title: 'New Study Partner Request',
                message: `${myName} sent you a study partner request!`,
                type: 'study_partner_request',
                is_read: false,
                timestamp: now
            });
            
            setConnectionStatus('sent');
            addToast(`Study partner request sent to ${targetUser.display_name}!`, 'success');
        } catch (err: any) {
            console.error('Failed to send partner request:', err);
            addToast('Failed to send request: ' + err.message, 'error');
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-[#F8F9FA]">
                <div className="w-8 h-8 border-4 border-[#009EE2] border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!targetUser) {
        return (
            <div className="flex flex-col h-full w-full items-center justify-center bg-[#F8F9FA] p-6">
                <p className="text-[#6C757D] font-bold text-lg mb-4">User not found.</p>
                <button onClick={() => window.history.back()} className="px-6 py-2 bg-white border border-[#E9ECEF] rounded-xl font-bold shadow-sm">Go Back</button>
            </div>
        );
    }

    const privacy = targetUser.privacy_settings || {
        public_contact: true,
        public_school: true,
        public_department: true,
        public_level: true
    };

    return (
        <div className="flex flex-col h-full w-full bg-[#F8F9FA] overflow-y-auto animate-fade-in">
            {/* Header / Nav */}
            <div className="absolute top-4 left-4 z-20">
                <button
                    onClick={() => window.history.back()}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60 transition"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
            </div>

            {/* Cover Photo Area */}
            <div className="relative w-full h-48 sm:h-64 bg-gradient-to-r from-blue-100 to-cyan-100 shrink-0">
                {targetUser.cover_photo ? (
                    <img src={targetUser.cover_photo} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-r from-[#009EE2]/20 to-[#0070B8]/20 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-12 h-12 text-white/40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    </div>
                )}
            </div>

            {/* Profile Info Area */}
            <div className="relative px-6 pb-8 max-w-3xl mx-auto w-full -mt-16 sm:-mt-20">
                <div className="flex flex-col items-center">
                    {/* Avatar */}
                    <div className="rounded-full p-1 bg-white shadow-xl relative z-10">
                        <Avatar className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-white" photo_url={targetUser.photo_url} display_name={targetUser.display_name || 'AVELITE'} />
                    </div>

                    {/* Name & Basic Info */}
                    <div className="text-center mt-4 mb-6">
                        <h1 className="text-2xl sm:text-3xl font-black text-[#212529] tracking-tight">{targetUser.display_name}</h1>
                        <p className="text-sm font-bold text-[#009EE2] mt-1">{partnerCount} Connection{partnerCount !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Action Button */}
                    {!isSelf && (
                        <div className="mb-8 w-full flex justify-center">
                            {connectionStatus === 'connected' ? (
                                <button 
                                    onClick={() => onNavigate(`messenger`)} // Ideally would open chat directly if we have chatId
                                    className="w-full sm:w-auto px-8 py-3 bg-[#212529] hover:bg-black text-white font-black rounded-2xl shadow-lg transition"
                                >
                                    Message
                                </button>
                            ) : connectionStatus === 'sent' ? (
                                <button disabled className="w-full sm:w-auto px-8 py-3 bg-neutral-200 text-neutral-500 font-black rounded-2xl cursor-not-allowed">
                                    Pending Request
                                </button>
                            ) : connectionStatus === 'received' ? (
                                <button onClick={() => onNavigate('study_partners')} className="w-full sm:w-auto px-8 py-3 bg-[#009EE2] hover:bg-[#0070B8] text-white font-black rounded-2xl shadow-lg transition">
                                    Review Request
                                </button>
                            ) : (
                                <button 
                                    onClick={sendPartnerRequest}
                                    className="w-full sm:w-auto px-8 py-3 bg-[#009EE2] hover:bg-[#0070B8] text-white font-black rounded-2xl shadow-lg transition flex items-center justify-center gap-2"
                                >
                                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
                                    Connect
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Bio */}
                    <div className="bg-white p-6 rounded-3xl border border-[#E9ECEF] shadow-sm md:col-span-2">
                        <h3 className="text-xs font-black uppercase tracking-widest text-[#ADB5BD] mb-3">About</h3>
                        <p className="text-[#495057] font-medium leading-relaxed whitespace-pre-wrap">
                            {targetUser.bio || "No bio provided."}
                        </p>
                    </div>

                    {/* Academic Info */}
                    <div className="bg-white p-6 rounded-3xl border border-[#E9ECEF] shadow-sm space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-[#ADB5BD] mb-3">Academic Details</h3>
                        
                        <div>
                            <p className="text-[10px] font-bold text-[#ADB5BD] uppercase">School</p>
                            <p className="text-[#212529] font-bold">{privacy.public_school ? (targetUser.school_id?.replace(/_/g, ' ') || 'Not set') : 'Private'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-[#ADB5BD] uppercase">Department</p>
                            <p className="text-[#212529] font-bold">{privacy.public_department ? (targetUser.department_id?.replace(/_/g, ' ') || 'Not set') : 'Private'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-[#ADB5BD] uppercase">Level</p>
                            <p className="text-[#212529] font-bold">{privacy.public_level ? (targetUser.level ? `${targetUser.level} Level` : 'Not set') : 'Private'}</p>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div className="bg-white p-6 rounded-3xl border border-[#E9ECEF] shadow-sm space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-[#ADB5BD] mb-3">Contact Information</h3>
                        <div>
                            <p className="text-[10px] font-bold text-[#ADB5BD] uppercase">Contact Details</p>
                            <p className="text-[#212529] font-medium whitespace-pre-wrap">
                                {privacy.public_contact ? (targetUser.contact_details || 'No contact details provided.') : 'Private'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
