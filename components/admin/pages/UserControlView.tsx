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
    currentUserProfile?: UserProfile;
    allDepartments?: any[];
}

export const UserControlView: React.FC<UserControlViewProps> = ({ allUsersList, refreshUsers, isUsersLoading, currentUserProfile, allDepartments = [] }) => {
    const { addToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'premium' | 'suspended'>('all');
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

    // Edit State
    const [editXp, setEditXp] = useState<number>(0);
    const [editSub, setEditSub] = useState<string>('free');
    const [editRole, setEditRole] = useState<'superadmin' | 'deptadmin' | 'user'>('user');
    const [editAdminDepts, setEditAdminDepts] = useState<string[]>([]);
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
        setEditRole(user.role || (user.is_admin ? 'superadmin' : 'user'));
        setEditAdminDepts(user.admin_department_ids || []);
        setEditStatus(user.status || 'active');
    };

    const handleSaveEdit = async () => {
        if (!editingUserId) return;
        try {
            await update(dbRef(db, `users/${editingUserId}`), {
                xp: Number(editXp),
                subscription_status: editSub,
                role: editRole,
                is_admin: editRole === 'superadmin', // Keep legacy flag synced
                admin_department_ids: editRole === 'deptadmin' ? editAdminDepts : null,
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

    // Pagination Logic
    const [currentPage, setCurrentPage] = useState(1);
    const usersPerPage = 20;

    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter]);

    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const startIndex = (currentPage - 1) * usersPerPage;
    const paginatedUsers = filteredUsers.slice(startIndex, startIndex + usersPerPage);

    return (
        <div className="space-y-6">
            {/* Header & Controls */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-black text-xl text-slate-900 leading-tight">User Control</h3>
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{allUsersList.length} Total Registered</p>
                            <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                {allUsersList.filter(u => u.is_online || (u.last_seen && Date.now() - u.last_seen < 5 * 60 * 1000)).length} Active Now
                            </span>
                        </div>
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
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all"
                        />
                    </div>
                    <select 
                        value={statusFilter}
                        onChange={(e: any) => setStatusFilter(e.target.value)}
                        className="py-2.5 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all cursor-pointer"
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
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
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
                                <th className="px-6 py-4">Metrics</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                                        <p className="text-slate-500 font-bold">No users found matching your criteria.</p>
                                    </td>
                                </tr>
                            ) : (
                                paginatedUsers.map(user => (
                                    <tr key={user.uid} className="hover:bg-slate-50 transition-colors group">
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
                                                    className="w-10 h-10 rounded-full border border-slate-200 object-cover"
                                                />
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                                                        {user.display_name || 'Anonymous User'}
                                                        {(user.role === 'superadmin' || user.is_admin) && <span title="Super Admin"><Shield className="w-3.5 h-3.5 text-indigo-500" /></span>}
                                                        {user.role === 'deptadmin' && <span title="Department Admin"><Shield className="w-3.5 h-3.5 text-blue-400" /></span>}
                                                    </p>
                                                    <p className="text-xs font-semibold text-slate-500">{user.email || 'No email provided'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {editingUserId === user.uid ? (
                                                <select 
                                                    value={editSub} 
                                                    onChange={e => setEditSub(e.target.value)}
                                                    className="p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
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
                                                    'bg-slate-100 text-slate-600 border-slate-200'
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
                                                    className="w-24 p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                                                />
                                            ) : (
                                                <span className="text-sm font-bold text-slate-700">{user.xp || 0} XP</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 text-[10px] uppercase font-bold tracking-wider">
                                                <span className="text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-max">Tokens: {(user.total_tokens_used || 0).toLocaleString()}</span>
                                                <span className="text-slate-500 bg-slate-50 border border-slate-100 px-2 py-1 rounded w-max">Time: {Math.floor((user.time_spent_in_app || 0) / 60)} min</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {editingUserId === user.uid ? (
                                                <div className="flex flex-col gap-2">
                                                    <select 
                                                        value={editStatus} 
                                                        onChange={e => setEditStatus(e.target.value)}
                                                        className="p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                                                    >
                                                        <option value="active">Active</option>
                                                        <option value="suspended">Suspended</option>
                                                    </select>
                                                    {(currentUserProfile?.role === 'superadmin' || currentUserProfile?.is_admin) && (
                                                        <div className="flex flex-col gap-2 mt-2 border-t border-slate-100 pt-2">
                                                            <select 
                                                                value={editRole} 
                                                                onChange={e => setEditRole(e.target.value as any)}
                                                                className="p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                                                            >
                                                                <option value="user">User</option>
                                                                <option value="deptadmin">Department Admin</option>
                                                                <option value="superadmin">Super Admin</option>
                                                            </select>
                                                            {editRole === 'deptadmin' && (
                                                                <div className="flex flex-col gap-1">
                                                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Manageable Departments</label>
                                                                    <select
                                                                        multiple
                                                                        value={editAdminDepts}
                                                                        onChange={e => {
                                                                            const options = Array.from(e.target.selectedOptions, option => option.value);
                                                                            setEditAdminDepts(options);
                                                                        }}
                                                                        className="p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 h-24"
                                                                    >
                                                                        {allDepartments?.map(dept => (
                                                                            <option key={dept.id} value={dept.id}>{dept.departmentName || dept.name || dept.id}</option>
                                                                        ))}
                                                                    </select>
                                                                    <p className="text-[10px] text-slate-400">Hold Ctrl/Cmd to select multiple</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${
                                                    user.status === 'suspended' ? 'bg-red-50 text-red-700 border border-red-200' :
                                                    user.status === 'deleted' ? 'bg-slate-100 text-slate-500 border border-slate-200' :
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
                {totalPages > 1 && (
                    <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                            Showing {startIndex + 1} to {Math.min(startIndex + usersPerPage, filteredUsers.length)} of {filteredUsers.length}
                        </span>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition"
                            >
                                Previous
                            </button>
                            <span className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
