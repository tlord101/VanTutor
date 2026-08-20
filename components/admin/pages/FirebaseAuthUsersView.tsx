import React, { useState, useEffect } from 'react';
import { functions } from '../../../firebase';
import { httpsCallable } from 'firebase/functions';
import { useToast } from '../../../hooks/useToast';

interface FirebaseAuthUsersViewProps {
    adminPin: string;
}

interface AuthUser {
    uid: string;
    email: string;
    displayName: string;
    creationTime: string;
    lastSignInTime: string;
    photoURL: string;
}

export const FirebaseAuthUsersView: React.FC<FirebaseAuthUsersViewProps> = ({ adminPin }) => {
    const [users, setUsers] = useState<AuthUser[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [pageToken, setPageToken] = useState<string | undefined>(undefined);
    const [pageTokens, setPageTokens] = useState<string[]>([]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const { addToast } = useToast();

    const fetchUsers = async (token?: string) => {
        setIsLoading(true);
        try {
            const listAuthUsers = httpsCallable<{ adminPin: string; pageToken?: string }, { users: AuthUser[]; pageToken?: string }>(functions, 'listAuthUsers');
            const result = await listAuthUsers({ adminPin, pageToken: token });
            setUsers(result.data.users);
            setPageToken(result.data.pageToken);
            setSelectedUserIds(new Set());
        } catch (error: any) {
            console.error("Error fetching auth users:", error);
            addToast(error.message || "Failed to load authenticated users", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleNextPage = () => {
        if (!pageToken) return;
        const newTokens = [...pageTokens];
        if (currentPageIndex === newTokens.length) {
            newTokens.push(pageToken);
            setPageTokens(newTokens);
        }
        setCurrentPageIndex(prev => prev + 1);
        fetchUsers(pageToken);
    };

    const handlePrevPage = () => {
        if (currentPageIndex === 0) return;
        const newIndex = currentPageIndex - 1;
        setCurrentPageIndex(newIndex);
        const tokenToUse = newIndex === 0 ? undefined : pageTokens[newIndex - 1];
        fetchUsers(tokenToUse);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedUserIds(new Set(users.map(u => u.uid)));
        } else {
            setSelectedUserIds(new Set());
        }
    };

    const handleSelectUser = (uid: string) => {
        const newSelected = new Set(selectedUserIds);
        if (newSelected.has(uid)) {
            newSelected.delete(uid);
        } else {
            newSelected.add(uid);
        }
        setSelectedUserIds(newSelected);
    };

    const handleDeleteSelected = async () => {
        if (selectedUserIds.size === 0) return;
        
        if (!window.confirm(`Are you sure you want to completely DELETE ${selectedUserIds.size} users? This will remove them from Firebase Authentication and erase all their database data permanently.`)) {
            return;
        }

        setIsDeleting(true);
        const deleteAuthUser = httpsCallable<{ adminPin: string; uid: string }, { success: boolean }>(functions, 'deleteAuthUser');
        
        let successCount = 0;
        let failCount = 0;

        for (const uid of Array.from(selectedUserIds)) {
            try {
                await deleteAuthUser({ adminPin, uid });
                successCount++;
            } catch (err: any) {
                console.error(`Failed to delete user ${uid}:`, err);
                failCount++;
            }
        }

        setIsDeleting(false);
        
        if (successCount > 0) {
            addToast(`Successfully deleted ${successCount} user(s).`, "success");
        }
        if (failCount > 0) {
            addToast(`Failed to delete ${failCount} user(s). Check console.`, "error");
        }

        const tokenToUse = currentPageIndex === 0 ? undefined : pageTokens[currentPageIndex - 1];
        fetchUsers(tokenToUse);
    };

    const handleDeleteSingle = async (user: AuthUser) => {
        if (!window.confirm(`Are you sure you want to completely DELETE ${user.email || user.displayName || user.uid}? This will remove them from Firebase Authentication and erase all their database data permanently.`)) {
            return;
        }

        setIsDeleting(true);
        const deleteAuthUser = httpsCallable<{ adminPin: string; uid: string }, { success: boolean }>(functions, 'deleteAuthUser');
        
        try {
            await deleteAuthUser({ adminPin, uid: user.uid });
            addToast(`Successfully deleted ${user.email || user.displayName}.`, "success");
            
            const tokenToUse = currentPageIndex === 0 ? undefined : pageTokens[currentPageIndex - 1];
            fetchUsers(tokenToUse);
        } catch (err: any) {
            console.error(`Failed to delete user ${user.uid}:`, err);
            addToast(err.message || "Failed to delete user.", "error");
        } finally {
            setIsDeleting(false);
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="space-y-6 text-slate-900 dark:text-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-wider flex items-center gap-3">
                        <i className="bi bi-shield-lock-fill text-amber-500"></i>
                        <span>FIREBASE AUTH USERS</span>
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        View and manage all authenticated users directly from Firebase. Deletions are permanent.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {selectedUserIds.size > 0 && (
                        <button
                            onClick={handleDeleteSelected}
                            disabled={isDeleting}
                            className="flex items-center gap-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 px-4 py-2 rounded-xl transition-colors border border-rose-500/30 disabled:opacity-50 font-bold text-sm cursor-pointer"
                        >
                            <i className="bi bi-trash"></i>
                            <span>Delete Selected ({selectedUserIds.size})</span>
                        </button>
                    )}
                    <button
                        onClick={() => {
                            const tokenToUse = currentPageIndex === 0 ? undefined : pageTokens[currentPageIndex - 1];
                            fetchUsers(tokenToUse);
                        }}
                        disabled={isLoading || isDeleting}
                        className="flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-amber-500 px-4 py-2 rounded-xl transition-colors border border-slate-200 dark:border-slate-700 disabled:opacity-50 text-sm font-bold shadow-sm cursor-pointer"
                    >
                        <i className={`bi bi-arrow-repeat ${isLoading ? 'animate-spin' : ''}`}></i>
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                <th className="p-4 w-12">
                                    <input
                                        type="checkbox"
                                        checked={users.length > 0 && selectedUserIds.size === users.length}
                                        onChange={handleSelectAll}
                                        className="rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                                    />
                                </th>
                                <th className="p-4">User</th>
                                <th className="p-4">UID</th>
                                <th className="p-4">Created</th>
                                <th className="p-4">Last Sign In</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {users.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">
                                        No users found on this page.
                                    </td>
                                </tr>
                            )}
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center">
                                        <div className="flex items-center justify-center space-x-2">
                                            <i className="bi bi-arrow-repeat text-amber-500 animate-spin text-lg"></i>
                                            <span className="text-slate-500 dark:text-slate-400 font-bold">Loading users...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <tr 
                                        key={user.uid} 
                                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${selectedUserIds.has(user.uid) ? 'bg-amber-500/10' : ''}`}
                                    >
                                        <td className="p-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedUserIds.has(user.uid)}
                                                onChange={() => handleSelectUser(user.uid)}
                                                className="rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                {user.photoURL ? (
                                                    <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                                                        <span className="text-xs text-slate-500 font-bold">
                                                            {user.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}
                                                        </span>
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="text-sm font-bold text-slate-900 dark:text-white">{user.displayName || 'No Name'}</div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400">{user.email || 'No Email'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
                                            {user.uid}
                                        </td>
                                        <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            {formatDate(user.creationTime)}
                                        </td>
                                        <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            {formatDate(user.lastSignInTime)}
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => handleDeleteSingle(user)}
                                                disabled={isDeleting}
                                                className="text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 p-2 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                                                title="Delete User"
                                            >
                                                <i className="bi bi-trash text-base"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                        Page {currentPageIndex + 1}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrevPage}
                            disabled={currentPageIndex === 0 || isLoading || isDeleting}
                            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors text-xs font-bold cursor-pointer"
                        >
                            Previous
                        </button>
                        <button
                            onClick={handleNextPage}
                            disabled={!pageToken || isLoading || isDeleting}
                            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors text-xs font-bold cursor-pointer"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
