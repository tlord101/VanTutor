import React, { useState } from 'react';
import { Users, Search, Edit3, Trash2, CheckCircle, Shield, AlertCircle, RefreshCw } from 'lucide-react';
import { db } from '../../../firebase';
import { ref as dbRef, update, remove } from 'firebase/database';
import { useToast } from '../../../hooks/useToast';
import type { UserProfile } from '../../../types';

interface UserControlViewProps {
    allUsersList: UserProfile[];
    refreshUsers: () => void;
    isUsersLoading?: boolean;
}

export const UserControlView: React.FC<UserControlViewProps> = ({ allUsersList, refreshUsers, isUsersLoading }) => {
    const { addToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'premium' | 'suspended'>('all');
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

    // Edit State
    const [editXp, setEditXp] = useState<number>(0);
    const [editSub, setEditSub] = useState<string>('free');
    const [editAdmin, setEditAdmin] = useState<boolean>(false);
    const [editStatus, setEditStatus] = useState<string>('active');

    const filteredUsers = allUsersList.filter(user => {
        const matchesSearch = (user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                               user.email?.toLowerCase().includes(searchQuery.toLowerCase()));
        
        if (statusFilter === 'premium') return matchesSearch && user.subscription_status === 'premium';
        if (statusFilter === 'suspended') return matchesSearch && user.status === 'suspended';
        return matchesSearch;
    });

    const handleEditStart = (user: UserProfile) => {
        setEditingUserId(user.uid);
        setEditXp(user.xp || 0);
        setEditSub(user.subscription_status || 'free');
        setEditAdmin(!!user.is_admin);
        setEditStatus(user.status || 'active');
    };

    const handleSaveEdit = async () => {
        if (!editingUserId) return;
        try {
            await update(dbRef(db, `users/${editingUserId}`), {
                xp: Number(editXp),
                subscription_status: editSub,
                is_admin: editAdmin,
                status: editStatus
            });
            addToast("User updated successfully!", "success");
            setEditingUserId(null);
            refreshUsers();
        } catch (error: any) {
            addToast("Failed to update user: " + error.message, "error");
        }
    };

    const handleDeleteUser = async (uid: string, name: string) => {
        if (!window.confirm(`Are you absolutely sure you want to completely delete ${name}? This action cannot be undone.`)) return;
        try {
            // Note: In Firebase Auth, a server function is needed to actually delete the auth account. 
            // We just mark as deleted or remove from Realtime DB.
            await remove(dbRef(db, `users/${uid}`));
            addToast("User completely deleted.", "success");
            setSelectedUsers(prev => {
                const next = new Set(prev);
                next.delete(uid);
                return next;
            });
            refreshUsers();
        } catch (error: any) {
            addToast("Failed to delete user: " + error.message, "error");
        }
    };

    const handleBatchDeleteUsers = async () => {
        if (selectedUsers.size === 0) return;
        if (!window.confirm(`Are you absolutely sure you want to completely delete ${selectedUsers.size} selected users? This action cannot be undone.`)) return;
        try {
            const updates: any = {};
            selectedUsers.forEach(uid => {
                updates[`users/${uid}`] = null;
            });
            await update(dbRef(db), updates);
            addToast(`${selectedUsers.size} users completely deleted.`, "success");
            setSelectedUsers(new Set());
            refreshUsers();
        } catch (error: any) {
            addToast("Failed to delete users: " + error.message, "error");
        }
    };

    const toggleUserSelection = (uid: string) => {
        setSelectedUsers(prev => {
            const next = new Set(prev);
            if (next.has(uid)) {
                next.delete(uid);
            } else {
                next.add(uid);
            }
            return next;
        });
    };

    const toggleAllUsersSelection = () => {
        if (selectedUsers.size === filteredUsers.length && filteredUsers.length > 0) {
            setSelectedUsers(new Set());
        } else {
            setSelectedUsers(new Set(filteredUsers.map(u => u.uid)));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Controls */}
            <div className="bg-white dark:bg-[#121A2F] rounded-3xl p-6 border border-slate-200 dark:border-white/10/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-black text-xl text-slate-900 dark:text-white leading-tight">User Control</h3>
                        <p className="text-xs font-bold text-slate-500 dark:text-[#A0ABC0] uppercase tracking-widest">{allUsersList.length} Total Registered</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Search name or email..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-[#0A101F] border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all"
                        />
                    </div>
                    <select 
                        value={statusFilter}
                        onChange={(e: any) => setStatusFilter(e.target.value)}
                        className="py-2.5 px-4 bg-slate-50 dark:bg-[#0A101F] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all cursor-pointer"
                    >
                        <option value="all">All Users</option>
                        <option value="premium">Premium</option>
                        <option value="suspended">Suspended</option>
                    </select>
                    {selectedUsers.size > 0 && (
                        <button
                            onClick={handleBatchDeleteUsers}
                            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 font-bold text-sm rounded-xl hover:bg-red-100 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete ({selectedUsers.size})
                        </button>
                    )}
                </div>
            </div>

            {/* User List */}
            <div className="bg-white dark:bg-[#121A2F] rounded-3xl border border-slate-200 dark:border-white/10/60 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-[#0A101F]/80 border-b border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-[#A0ABC0]">
                                <th className="px-6 py-4 w-12">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        checked={filteredUsers.length > 0 && selectedUsers.size === filteredUsers.length}
                                        onChange={toggleAllUsersSelection}
                                    />
                                </th>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Subscription</th>
                                <th className="px-6 py-4">XP Points</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                                        <p className="text-slate-500 dark:text-[#A0ABC0] font-bold">No users found matching your criteria.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(user => (
                                    <tr key={user.uid} className="hover:bg-slate-50 dark:bg-[#0A101F]/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <input 
                                                type="checkbox" 
                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                checked={selectedUsers.has(user.uid)}
                                                onChange={() => toggleUserSelection(user.uid)}
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img 
                                                    src={user.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || 'U')}&background=f1f5f9&color=64748b`} 
                                                    alt="" 
                                                    className="w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 object-cover"
                                                />
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                                        {user.display_name || 'Anonymous User'}
                                                        {user.is_admin && <span title="Admin"><Shield className="w-3.5 h-3.5 text-indigo-500" /></span>}
                                                    </p>
                                                    <p className="text-xs font-semibold text-slate-500 dark:text-[#A0ABC0]">{user.email || 'No email provided'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {editingUserId === user.uid ? (
                                                <select 
                                                    value={editSub} 
                                                    onChange={e => setEditSub(e.target.value)}
                                                    className="p-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm outline-none focus:border-indigo-500"
                                                >
                                                    <option value="free">Free</option>
                                                    <option value="basic">Basic</option>
                                                    <option value="premium">Premium</option>
                                                    <option value="personal_token">Personal Token</option>
                                                </select>
                                            ) : (
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${
                                                    user.subscription_status === 'premium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    user.subscription_status === 'basic' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    'bg-slate-100 text-slate-600 border-slate-200 dark:border-white/10'
                                                }`}>
                                                    {user.subscription_status || 'Free'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {editingUserId === user.uid ? (
                                                <input 
                                                    type="number" 
                                                    value={editXp} 
                                                    onChange={e => setEditXp(Number(e.target.value))}
                                                    className="w-24 p-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm outline-none focus:border-indigo-500"
                                                />
                                            ) : (
                                                <span className="text-sm font-bold text-slate-700">{user.xp || 0} XP</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {editingUserId === user.uid ? (
                                                <div className="flex flex-col gap-2">
                                                    <select 
                                                        value={editStatus} 
                                                        onChange={e => setEditStatus(e.target.value)}
                                                        className="p-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm outline-none focus:border-indigo-500"
                                                    >
                                                        <option value="active">Active</option>
                                                        <option value="suspended">Suspended</option>
                                                    </select>
                                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={editAdmin} 
                                                            onChange={e => setEditAdmin(e.target.checked)}
                                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        Is Admin?
                                                    </label>
                                                </div>
                                            ) : (
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${
                                                    user.status === 'suspended' ? 'bg-red-50 text-red-700 border border-red-200' :
                                                    user.status === 'deleted' ? 'bg-slate-100 text-slate-500 dark:text-[#A0ABC0] border border-slate-200 dark:border-white/10' :
                                                    'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                }`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'suspended' ? 'bg-red-500' : user.status === 'deleted' ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                                                    {user.status || 'Active'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {editingUserId === user.uid ? (
                                                    <>
                                                        <button 
                                                            onClick={handleSaveEdit}
                                                            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                                                            title="Save Changes"
                                                        >
                                                            <CheckCircle className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => setEditingUserId(null)}
                                                            className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition"
                                                            title="Cancel"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button 
                                                            onClick={() => handleEditStart(user)}
                                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                                                            title="Edit User"
                                                        >
                                                            <Edit3 className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteUser(user.uid, user.display_name)}
                                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                                                            title="Delete User"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
