import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { UserProfile, PrivateChat, PrivateMessage } from '../types';
import { db, storage } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, setDoc, addDoc, serverTimestamp, updateDoc, writeBatch, limit, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useToast } from '../hooks/useToast';
import { SendIcon } from './icons/SendIcon';
import { PaperclipIcon } from './icons/PaperclipIcon';
import { XIcon } from './icons/XIcon';
import ReactMarkdown from 'react-markdown';

const formatLastSeen = (timestamp: number): string => {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);

    if (seconds < 60) return `now`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
};

const UserStatusIndicator: React.FC<{ isOnline?: boolean; lastSeen?: number }> = ({ isOnline, lastSeen }) => {
    if (isOnline) {
        return <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>;
    }
    return <div className="w-3 h-3 bg-gray-400 rounded-full border-2 border-white"></div>;
};

// --- Sub-component: PrivateChatView ---
interface PrivateChatViewProps {
  chatId: string;
  currentUser: UserProfile;
  otherUser: { uid: string, displayName: string, isOnline?: boolean, lastSeen?: number };
  onBack: () => void;
}

const PrivateChatView: React.FC<PrivateChatViewProps> = ({ chatId, currentUser, otherUser, onBack }) => {
    const [messages, setMessages] = useState<PrivateMessage[]>([]);
    const [input, setInput] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { addToast } = useToast();

    useEffect(() => {
        const messagesRef = collection(db, 'privateChats', chatId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedMessages: PrivateMessage[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                fetchedMessages.push({ id: doc.id, ...data, timestamp: data.timestamp?.toMillis() || Date.now() } as PrivateMessage);
            });
            setMessages(fetchedMessages);
        });
        return unsubscribe;
    }, [chatId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isSending]);

    // Mark messages as read when chat is opened
    useEffect(() => {
        const markAsRead = async () => {
            const chatRef = doc(db, 'privateChats', chatId);
            const chatSnap = await getDoc(chatRef);
            if (chatSnap.exists()) {
                const chatData = chatSnap.data() as PrivateChat;
                if (chatData.lastMessage && !chatData.lastMessage.readBy.includes(currentUser.uid)) {
                    const newReadBy = [...chatData.lastMessage.readBy, currentUser.uid];
                    await updateDoc(chatRef, { 'lastMessage.readBy': newReadBy });
                }
            }
        };
        markAsRead();
    }, [chatId, currentUser.uid, messages]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        } else if (file) {
            addToast('Only image files are allowed.', 'error');
        }
    };

    const handleSend = async () => {
        if ((!input.trim() && !imageFile) || isSending) return;
        setIsSending(true);

        const tempInput = input;
        const tempImageFile = imageFile;
        setInput('');
        setImageFile(null);
        setImagePreview(null);

        try {
            let imageUrl: string | undefined = undefined;
            if (tempImageFile) {
                const storageRef = ref(storage, `private-chats/${chatId}/${Date.now()}-${tempImageFile.name}`);
                const snapshot = await uploadBytes(storageRef, tempImageFile);
                imageUrl = await getDownloadURL(snapshot.ref);
            }

            const batch = writeBatch(db);
            const messagesRef = collection(db, 'privateChats', chatId, 'messages');
            const newMessageRef = doc(messagesRef);

            const messageData = {
                senderId: currentUser.uid,
                text: tempInput,
                timestamp: serverTimestamp(),
                ...(imageUrl && { imageUrl }),
            };
            batch.set(newMessageRef, messageData);

            const chatRef = doc(db, 'privateChats', chatId);
            const lastMessageData = {
                text: tempInput || 'Image',
                timestamp: Date.now(),
                senderId: currentUser.uid,
                readBy: [currentUser.uid],
            };
            batch.update(chatRef, { lastMessage: lastMessageData });

            await batch.commit();

        } catch (error) {
            console.error("Error sending message:", error);
            addToast('Failed to send message.', 'error');
            setInput(tempInput); // Restore input on failure
        } finally {
            setIsSending(false);
        }
    };
    
    return (
        <div className="h-full flex flex-col bg-white">
            <header className="flex-shrink-0 flex items-center gap-3 p-3 border-b border-gray-200">
                <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-900 rounded-full">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                 <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-400 to-gray-600 flex items-center justify-center text-white font-bold text-lg">{otherUser.displayName.charAt(0).toUpperCase()}</div>
                    <div className="absolute -bottom-1 -right-1">
                        <UserStatusIndicator isOnline={otherUser.isOnline} />
                    </div>
                 </div>
                <div>
                    <h3 className="font-bold text-gray-800 leading-tight">{otherUser.displayName}</h3>
                    <p className="text-xs text-gray-500 leading-tight">{otherUser.isOnline ? 'Online' : (otherUser.lastSeen ? `Active ${formatLastSeen(otherUser.lastSeen)}` : 'Offline')}</p>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-24 md:pb-4">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex gap-3 items-end ${msg.senderId === currentUser.uid ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] p-3 rounded-2xl ${msg.senderId === currentUser.uid ? 'bg-lime-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                            {msg.imageUrl && <img src={msg.imageUrl} alt="Sent attachment" className="rounded-lg mb-2 max-h-64" />}
                            {msg.text && <p className="text-sm whitespace-pre-wrap"><ReactMarkdown>{msg.text}</ReactMarkdown></p>}
                        </div>
                    </div>
                ))}
                 {isSending && <div className="flex justify-end"><div className="p-3 rounded-2xl bg-lime-300"><div className="flex items-center space-x-2"><div className="w-2 h-2 bg-white rounded-full animate-pulse [animation-delay:-0.3s]"></div><div className="w-2 h-2 bg-white rounded-full animate-pulse [animation-delay:-0.15s]"></div><div className="w-2 h-2 bg-white rounded-full animate-pulse"></div></div></div></div>}
                <div ref={messagesEndRef} />
            </div>
            <footer className="md:relative fixed bottom-16 w-full md:w-auto left-0 right-0 p-3 border-t border-gray-200 bg-white/95 backdrop-blur-sm md:backdrop-blur-none md:bg-white">
                 <div className="w-full max-w-md mx-auto">
                    {imagePreview && <div className="relative w-20 h-20 mb-2 p-1 border rounded"><img src={imagePreview} className="w-full h-full object-cover rounded"/><button onClick={() => {setImageFile(null); setImagePreview(null);}} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center font-bold">&times;</button></div>}
                    <div className="relative flex items-center">
                        <label className="p-2 cursor-pointer text-gray-500 hover:text-gray-900"><PaperclipIcon className="w-5 h-5" /><input type="file" className="hidden" onChange={handleFileChange} accept="image/*"/></label>
                        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {if (e.key === 'Enter') handleSend()}} placeholder="Type a message..." className="w-full bg-gray-100 border-transparent rounded-full py-2 px-4 focus:ring-lime-500 focus:border-lime-500" />
                        <button onClick={handleSend} disabled={isSending || (!input.trim() && !imageFile)} className="ml-2 bg-lime-600 rounded-full p-2 text-white hover:bg-lime-700 transition-colors disabled:opacity-50"><SendIcon className="w-5 h-5" /></button>
                    </div>
                </div>
            </footer>
        </div>
    );
};


// --- Main Component: Messenger ---
interface MessengerProps {
  userProfile: UserProfile;
}

export const Messenger: React.FC<MessengerProps> = ({ userProfile }) => {
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [selectedChat, setSelectedChat] = useState<{ chatId: string, otherUser: { uid: string, displayName: string, isOnline?: boolean, lastSeen?: number } } | null>(null);

    const [tab, setTab] = useState<'chats' | 'discover'>('chats');
    const [chats, setChats] = useState<PrivateChat[]>([]);
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const { addToast } = useToast();
    
    // Listen to all users for presence and discovery
    useEffect(() => {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy('displayName'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const usersList = snapshot.docs
                .map(doc => doc.data() as UserProfile)
                .filter(u => u.uid !== userProfile.uid);
            setAllUsers(usersList);
            setIsDataLoading(false);
        });
        return unsubscribe;
    }, [userProfile.uid]);

    // Listen to user's private chats
    useEffect(() => {
        const chatsRef = collection(db, 'privateChats');
        const q = query(chatsRef, where('members', 'array-contains', userProfile.uid), orderBy('lastMessage.timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedChats: PrivateChat[] = [];
            snapshot.forEach(doc => fetchedChats.push({ id: doc.id, ...doc.data() } as PrivateChat));
            setChats(fetchedChats);
            setIsDataLoading(false);
        }, () => setIsDataLoading(false));
        return unsubscribe;
    }, [userProfile.uid]);

    
    const handleStartChat = async (otherUser: UserProfile) => {
        const members = [userProfile.uid, otherUser.uid].sort();
        const chatId = members.join('_');
        const chatRef = doc(db, 'privateChats', chatId);

        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
            await setDoc(chatRef, {
                members,
                memberInfo: {
                    [userProfile.uid]: { displayName: userProfile.displayName },
                    [otherUser.uid]: { displayName: otherUser.displayName },
                },
                createdAt: Date.now()
            });
        }
        setSelectedChat({ chatId, otherUser });
        setView('chat');
    };
    
    const handleSelectChat = (chat: PrivateChat) => {
        const otherUserId = chat.members.find(id => id !== userProfile.uid)!;
        const otherUserInfo = allUsers.find(u => u.uid === otherUserId);
        
        setSelectedChat({ 
            chatId: chat.id, 
            otherUser: { 
                uid: otherUserId, 
                displayName: chat.memberInfo[otherUserId]?.displayName || 'User',
                isOnline: otherUserInfo?.isOnline,
                lastSeen: otherUserInfo?.lastSeen
            } 
        });
        setView('chat');
    };

    const filteredUsers = allUsers.filter(user => 
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const renderListView = () => (
        <div className="h-full flex flex-col bg-white">
            <div className="flex-shrink-0 p-4 border-b border-gray-200">
                <div className="bg-gray-100 p-1 rounded-full flex">
                    <button onClick={() => setTab('chats')} className={`flex-1 p-2 rounded-md font-semibold text-sm transition-colors ${tab === 'chats' ? 'bg-lime-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>Chats</button>
                    <button onClick={() => setTab('discover')} className={`flex-1 p-2 rounded-md font-semibold text-sm transition-colors ${tab === 'discover' ? 'bg-lime-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>Discover</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                {tab === 'chats' && (
                    isDataLoading ? <div className="p-4 text-center text-gray-500">Loading chats...</div> :
                    chats.length === 0 ? <div className="p-4 text-center text-gray-500">No chats yet. Find users in the Discover tab.</div> :
                    <ul className="divide-y divide-gray-200">{chats.map(chat => {
                        const otherUserId = chat.members.find(id => id !== userProfile.uid)!;
                        const otherUserInfo = allUsers.find(u => u.uid === otherUserId);
                        const isUnread = chat.lastMessage && !chat.lastMessage.readBy?.includes(userProfile.uid);
                        return <li key={chat.id} onClick={() => handleSelectChat(chat)} className="p-4 hover:bg-gray-50 cursor-pointer flex items-center gap-4">
                            <div className="relative flex-shrink-0">
                                <div className={`w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold text-xl ${isUnread ? 'ring-2 ring-lime-500 ring-offset-2' : ''}`}>{chat.memberInfo[otherUserId]?.displayName.charAt(0)}</div>
                                <div className="absolute -bottom-1 -right-1">
                                    <UserStatusIndicator isOnline={otherUserInfo?.isOnline} />
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <div className="flex justify-between items-center">
                                    <p className={`font-semibold truncate ${isUnread ? 'text-gray-900' : 'text-gray-700'}`}>{chat.memberInfo[otherUserId]?.displayName}</p>
                                    <p className="text-xs text-gray-400">{chat.lastMessage ? formatLastSeen(chat.lastMessage.timestamp) : ''}</p>
                                </div>
                                <p className={`text-sm truncate ${isUnread ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>{chat.lastMessage?.text || '...'}</p>
                            </div>
                        </li>
                    })}</ul>
                )}
                {tab === 'discover' && (
                    <div className="p-4">
                        <div className="relative mb-4">
                            <input 
                                type="text" 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                placeholder="Filter users..." 
                                className="w-full bg-gray-100 border border-gray-300 rounded-full py-2.5 pl-10 pr-4 text-gray-900 focus:ring-2 focus:ring-lime-500 focus:outline-none transition-colors"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </span>
                        </div>
                        {isDataLoading ? <div className="p-4 text-center text-gray-500">Loading users...</div> :
                         filteredUsers.map(user => 
                            <div key={user.uid} onClick={() => handleStartChat(user)} className="p-3 hover:bg-gray-50 cursor-pointer flex items-center gap-4 rounded-lg">
                                <div className="relative flex-shrink-0">
                                    <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold text-xl">{user.displayName.charAt(0)}</div>
                                    <div className="absolute -bottom-1 -right-1">
                                       <UserStatusIndicator isOnline={user.isOnline} />
                                    </div>
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-700">{user.displayName}</p>
                                    <p className="text-xs text-gray-500">{user.isOnline ? 'Online' : (user.lastSeen ? `Active ${formatLastSeen(user.lastSeen)}` : 'Offline')}</p>
                                </div>
                           </div>
                         )}
                    </div>
                )}
            </div>
        </div>
    );
    
    return (
        <div className="flex-1 flex flex-col w-full h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
            {view === 'list' && renderListView()}
            {view === 'chat' && selectedChat && <PrivateChatView chatId={selectedChat.chatId} currentUser={userProfile} otherUser={selectedChat.otherUser} onBack={() => setView('list')} />}
        </div>
    );
};