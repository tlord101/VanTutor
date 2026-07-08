import React, { useEffect, useState } from 'react';
import { db } from '../../../firebase';
import { ref as dbRef, onValue, push, set, remove, update } from 'firebase/database';
import { Users, Plus, Edit2, Trash2, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { useToast } from '../../../hooks/useToast';

interface CoFounder {
    id: string;
    name: string;
    role: string;
    bio: string;
    longBio: string;
    imageUrl: string;
    linkedinUrl?: string;
    twitterUrl?: string;
}

export const CoFoundersView: React.FC = () => {
    const { addToast } = useToast();
    const [founders, setFounders] = useState<CoFounder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    
    const [formData, setFormData] = useState<Partial<CoFounder>>({
        name: '', role: '', bio: '', longBio: '', imageUrl: '', linkedinUrl: '', twitterUrl: ''
    });

    useEffect(() => {
        const foundersRef = dbRef(db, 'co_founders');
        const unsubscribe = onValue(foundersRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const parsed: CoFounder[] = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
                setFounders(parsed);
            } else {
                setFounders([]);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const resetForm = () => {
        setFormData({ name: '', role: '', bio: '', longBio: '', imageUrl: '', linkedinUrl: '', twitterUrl: '' });
        setIsEditing(null);
        setIsAdding(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isEditing) {
                await update(dbRef(db, `co_founders/${isEditing}`), formData);
                addToast('Co-founder updated successfully', 'success');
            } else {
                const newRef = push(dbRef(db, 'co_founders'));
                await set(newRef, formData);
                addToast('Co-founder added successfully', 'success');
            }
            resetForm();
        } catch (error: any) {
            addToast('Failed to save: ' + error.message, 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to remove this co-founder?')) return;
        try {
            await remove(dbRef(db, `co_founders/${id}`));
            addToast('Co-founder removed', 'success');
        } catch (error: any) {
            addToast('Failed to remove: ' + error.message, 'error');
        }
    };

    const startEdit = (founder: CoFounder) => {
        setFormData(founder);
        setIsEditing(founder.id);
        setIsAdding(true);
    };

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500 font-bold animate-pulse">Loading co-founders...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-6">
                <div>
                    <h2 className="text-2xl font-black  dark:text-white tracking-tight flex items-center gap-2">
                        <Users className="w-6 h-6 text-indigo-500" />
                        Co-Founders Management
                    </h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                        Manage the team members displayed on the About Us and Founder pages.
                    </p>
                </div>
                {!isAdding && (
                    <button 
                        onClick={() => setIsAdding(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition flex items-center gap-2 shadow-md shadow-indigo-200"
                    >
                        <Plus className="w-4 h-4" /> Add Founder
                    </button>
                )}
            </div>

            {isAdding ? (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 max-w-3xl">
                    <h3 className="text-xl font-bold  dark:text-white mb-6">{isEditing ? 'Edit' : 'Add'} Co-Founder</h3>
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Full Name</label>
                                <input type="text" required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Role / Title</label>
                                <input type="text" required value={formData.role || ''} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">Profile Image URL</label>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden">
                                    {formData.imageUrl ? <img src={formData.imageUrl} alt="preview" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-slate-400" />}
                                </div>
                                <input type="url" required value={formData.imageUrl || ''} onChange={e => setFormData({...formData, imageUrl: e.target.value})} className="flex-1 p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all" placeholder="https://..." />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">Short Bio (Card)</label>
                            <textarea required rows={2} value={formData.bio || ''} onChange={e => setFormData({...formData, bio: e.target.value})} className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all resize-none" placeholder="Brief 1-2 sentence intro..." />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">Long Bio (Dedicated Page)</label>
                            <textarea required rows={6} value={formData.longBio || ''} onChange={e => setFormData({...formData, longBio: e.target.value})} className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all resize-y" placeholder="Detailed background and vision..." />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><LinkIcon className="w-3 h-3" /> LinkedIn URL (Optional)</label>
                                <input type="url" value={formData.linkedinUrl || ''} onChange={e => setFormData({...formData, linkedinUrl: e.target.value})} className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><LinkIcon className="w-3 h-3" /> Twitter URL (Optional)</label>
                                <input type="url" value={formData.twitterUrl || ''} onChange={e => setFormData({...formData, twitterUrl: e.target.value})} className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all" />
                            </div>
                        </div>

                        <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                            <button type="submit" className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition">Save Founder</button>
                            <button type="button" onClick={resetForm} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition">Cancel</button>
                        </div>
                    </form>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {founders.length === 0 ? (
                        <div className="col-span-full p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 font-medium">
                            No co-founders added yet.
                        </div>
                    ) : (
                        founders.map(founder => (
                            <div key={founder.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group">
                                <div className="h-48 overflow-hidden relative">
                                    <img src={founder.imageUrl} alt={founder.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                                        <div className="text-white">
                                            <h3 className="font-bold text-lg leading-tight">{founder.name}</h3>
                                            <p className="text-sm text-white/80">{founder.role}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5 flex-1 flex flex-col">
                                    <p className="text-sm text-slate-600 line-clamp-3 mb-4 flex-1">
                                        {founder.bio}
                                    </p>
                                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                        <div className="flex items-center gap-2">
                                            {founder.linkedinUrl && <a href={founder.linkedinUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-indigo-600"><LinkIcon className="w-4 h-4" /></a>}
                                            {founder.twitterUrl && <a href={founder.twitterUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-sky-500"><LinkIcon className="w-4 h-4" /></a>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => startEdit(founder)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition tooltip-trigger" title="Edit">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(founder.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition tooltip-trigger" title="Delete">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
