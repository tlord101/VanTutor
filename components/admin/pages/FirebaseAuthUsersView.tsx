import React, { useState, useEffect } from 'react';
import { functions } from '../../../firebase';
import { httpsCallable } from 'firebase/functions';
import { Trash2, RefreshCw, AlertCircle, Search, Trash } from 'lucide-react';
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

        // Refresh current page
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
            
            // Refresh current page
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
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-wider flex items-center gap-3">
                        <AlertCircle className="w-6 h-6 text-lime-500" />
                        FIREBASE AUTH USERS
                    </h2>
                    <p className="text-gray-400 mt-1">
                        View and manage all authenticated users directly from Firebase. Deletions are permanent.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {selectedUserIds.size > 0 && (
                        <button
                            onClick={handleDeleteSelected}
                            disabled={isDeleting}
                            className="flex items-center gap-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 px-4 py-2 rounded-lg transition-colors border border-red-500/30 disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete Selected ({selectedUserIds.size})
                        </button>
                    )}
                    <button
                        onClick={() => {
                            const tokenToUse = currentPageIndex === 0 ? undefined : pageTokens[currentPageIndex - 1];
                            fetchUsers(tokenToUse);
                        }}
                        disabled={isLoading || isDeleting}
                        className="flex items-center gap-2 bg-gray-800 text-gray-300 hover:text-white px-4 py-2 rounded-lg transition-colors border border-gray-700 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-900/50 border-b border-gray-700">
                                <th className="p-4 w-12">
                                    <input
                                        type="checkbox"
                                        checked={users.length > 0 && selectedUserIds.size === users.length}
                                        onChange={handleSelectAll}
                                        className="rounded border-gray-600 text-lime-500 focus:ring-lime-500 bg-gray-700"
                                    />
                                </th>
                                <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                                <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">UID</th>
                                <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Created</th>
                                <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Last Sign In</th>
                                <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {users.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-400">
                                        No users found on this page.
                                    </td>
                                </tr>
                            )}
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center">
                                        <div className="flex items-center justify-center space-x-2">
                                            <RefreshCw className="w-5 h-5 text-lime-500 animate-spin" />
                                            <span className="text-gray-400">Loading users...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <tr 
                                        key={user.uid} 
                                        className={`hover:bg-gray-750 transition-colors ${selectedUserIds.has(user.uid) ? 'bg-lime-900/10' : ''}`}
                                    >
                                        <td className="p-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedUserIds.has(user.uid)}
                                                onChange={() => handleSelectUser(user.uid)}
                                                className="rounded border-gray-600 text-lime-500 focus:ring-lime-500 bg-gray-700"
                                            />
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                {user.photoURL ? (
                                                    <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-gray-600" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center border border-gray-600">
                                                        <span className="text-xs text-gray-400 font-bold">
                                                            {user.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}
                                                        </span>
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="text-sm font-medium text-white">{user.displayName || 'No Name'}</div>
                                                    <div className="text-xs text-gray-400">{user.email || 'No Email'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm text-gray-400 font-mono">
                                            {user.uid}
                                        </td>
                                        <td className="p-4 text-sm text-gray-300">
                                            {formatDate(user.creationTime)}
                                        </td>
                                        <td className="p-4 text-sm text-gray-300">
                                            {formatDate(user.lastSignInTime)}
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => handleDeleteSingle(user)}
                                                disabled={isDeleting}
                                                className="text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                                                title="Delete User"
                                            >
                                                <Trash className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-gray-700 bg-gray-800 flex items-center justify-between">
                    <div className="text-sm text-gray-400">
                        Page {currentPageIndex + 1}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrevPage}
                            disabled={currentPageIndex === 0 || isLoading || isDeleting}
                            className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 transition-colors text-sm"
                        >
                            Previous
                        </button>
                        <button
                            onClick={handleNextPage}
                            disabled={!pageToken || isLoading || isDeleting}
                            className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 transition-colors text-sm"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
