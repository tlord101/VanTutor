import React, { useState } from 'react';
import { db } from '../../../../firebase';
import { ref as dbRef, update, set, get } from 'firebase/database';
import { useToast } from '../../../../hooks/useToast';
import { InlineEditableText } from '../../primitives/InlineEditableText';
import { ConfirmDeleteModal } from '../../primitives/ConfirmDeleteModal';
import { BreadcrumbNavigation } from '../../primitives/BreadcrumbNavigation';
import { Building2, Plus, Trash2, ArrowRight, Layers, GraduationCap, X, Loader2, Database, GitMerge } from 'lucide-react';

interface Level1SchoolsHubProps {
    schoolsData: Record<string, any>;
    allDepartments: any[];
    onNavigate: (path: string) => void;
    refreshData: () => Promise<void>;
}

export const Level1SchoolsHub: React.FC<Level1SchoolsHubProps> = ({
    schoolsData,
    allDepartments,
    onNavigate,
    refreshData,
}) => {
    const { addToast } = useToast();

    // Add School Modal state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newSchoolName, setNewSchoolName] = useState('');
    const [newSchoolCode, setNewSchoolCode] = useState('');
    const [newSchoolDesc, setNewSchoolCodeDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Delete School Modal state
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const schoolKeys = Object.keys(schoolsData || {});

    const handleCreateSchool = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = newSchoolName.trim();
        if (!trimmedName) {
            addToast('School name is required.', 'error');
            return;
        }

        const schoolId = trimmedName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
        if (schoolsData[schoolId]) {
            addToast('A school with this name already exists.', 'error');
            return;
        }

        setIsCreating(true);
        try {
            await set(dbRef(db, `schools_data/${schoolId}`), {
                name: trimmedName,
                code: newSchoolCode.trim().toUpperCase() || trimmedName.slice(0, 4).toUpperCase(),
                description: newSchoolDesc.trim(),
                created_at: Date.now(),
            });

            addToast(`School "${trimmedName}" created successfully!`, 'success');
            setNewSchoolName('');
            setNewSchoolCode('');
            setNewSchoolCodeDesc('');
            setIsAddModalOpen(false);
            await refreshData();
        } catch (error: any) {
            console.error('Error creating school:', error);
            addToast(error?.message || 'Failed to create school.', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleRenameSchool = async (schoolId: string, newName: string) => {
        try {
            await update(dbRef(db, `schools_data/${schoolId}`), { name: newName });
            addToast('School renamed successfully!', 'success');
            await refreshData();
        } catch (error: any) {
            addToast('Failed to rename school: ' + error.message, 'error');
            throw error;
        }
    };

    const handleExecuteDeleteSchool = async () => {
        if (!deleteTarget) return;

        setIsDeleting(true);
        try {
            const schoolId = deleteTarget.id;
            const updates: Record<string, any> = {};

            // 1. Delete school node
            updates[`schools_data/${schoolId}`] = null;

            // 2. Delete all nested departments under this school from departments_data and associated nodes
            const schoolDepts = allDepartments.filter((d) => d.schoolId === schoolId);
            schoolDepts.forEach((dept) => {
                updates[`departments_data/${dept.id}`] = null;
                updates[`past_questions/${dept.id}`] = null;
                updates[`textbook_contexts/${dept.id}`] = null;
            });

            await update(dbRef(db), updates);

            addToast(`School "${deleteTarget.name}" and all associated child entities deleted.`, 'success');
            setDeleteTarget(null);
            await refreshData();
        } catch (error: any) {
            console.error('Error deleting school:', error);
            addToast('Failed to delete school: ' + error.message, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top Breadcrumb */}
            <BreadcrumbNavigation items={[]} onNavigate={onNavigate} />

            {/* Header / Actions Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-black text-amber-500 uppercase tracking-widest">
                        <Building2 className="w-4 h-4" />
                        <span>Level 1 Hub</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                        Schools & Colleges Grid
                    </h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Manage top-level faculties and schools across your institution.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 active:scale-95 shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add School / College</span>
                </button>
            </div>

            {/* School Cards Grid */}
            {schoolKeys.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-4">
                    <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center">
                        <GraduationCap className="w-8 h-8" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                        <h3 className="font-black text-lg text-slate-900 dark:text-white">No Schools Created Yet</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Start building your institutional hierarchy by adding your first school or faculty.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsAddModalOpen(true)}
                        className="px-6 py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs uppercase tracking-wider transition shadow-md"
                    >
                        Create School
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {schoolKeys.map((sId) => {
                        const school = schoolsData[sId];
                        const collegesObj = school?.colleges || {};
                        const collegeCount = Object.keys(collegesObj).length;
                        const deptCount = allDepartments.filter((d) => d.schoolId === sId).length;

                        return (
                            <div
                                key={sId}
                                onClick={() => onNavigate(`/admin/schools/${encodeURIComponent(sId)}`)}
                                className="group relative bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-amber-500/50 cursor-pointer flex flex-col justify-between gap-6"
                            >
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-500 border border-amber-200/50 dark:border-amber-800/40 flex items-center justify-center font-black shrink-0">
                                            <Building2 className="w-6 h-6" />
                                        </div>

                                        <div className="flex items-center gap-1">
                                            {school.code && (
                                                <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-[10px] uppercase tracking-wider">
                                                    {school.code}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteTarget({ id: sId, name: school.name || sId });
                                                }}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                                                title="Delete School"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                                        <InlineEditableText
                                            value={school.name || sId}
                                            onSave={(newName) => handleRenameSchool(sId, newName)}
                                            className="text-lg font-black text-slate-900 dark:text-white"
                                            inputClassName="text-lg"
                                        />
                                        {school.description && (
                                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                                {school.description}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                                        <span className="flex items-center gap-1.5">
                                            <Layers className="w-3.5 h-3.5 text-amber-500" />
                                            {collegeCount} College{collegeCount !== 1 ? 's' : ''}
                                        </span>
                                        <span>•</span>
                                        <span>
                                            {deptCount} Dept{deptCount !== 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-amber-500 group-hover:text-slate-950 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all">
                                        <ArrowRight className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add School Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">Add New School</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Create a top-level faculty or college unit.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateSchool} className="space-y-4">
                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    School / College Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newSchoolName}
                                    onChange={(e) => setNewSchoolName(e.target.value)}
                                    placeholder="e.g. School of Science & Engineering"
                                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    Short Code
                                </label>
                                <input
                                    type="text"
                                    value={newSchoolCode}
                                    onChange={(e) => setNewSchoolCode(e.target.value)}
                                    placeholder="e.g. COET"
                                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all uppercase"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    Description
                                </label>
                                <textarea
                                    rows={3}
                                    value={newSchoolDesc}
                                    onChange={(e) => setNewSchoolCodeDesc(e.target.value)}
                                    placeholder="Brief description of departments and scope..."
                                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all custom-scrollbar"
                                />
                            </div>

                            <div className="flex items-center gap-3 pt-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isCreating || !newSchoolName.trim()}
                                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 disabled:opacity-40"
                                >
                                    {isCreating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Creating...</span>
                                        </>
                                    ) : (
                                        <span>Create School</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete School Modal */}
            {deleteTarget && (
                <ConfirmDeleteModal
                    isOpen={Boolean(deleteTarget)}
                    title={`Delete "${deleteTarget.name}"?`}
                    description="This action is destructive and cannot be undone. All nested colleges, departments, courses, topics, and materials will be permanently removed."
                    itemName={deleteTarget.name}
                    warningDetails={[
                        `Colleges inside ${deleteTarget.name}`,
                        `All departments mapped under ${deleteTarget.name}`,
                        `All course rosters, syllabi, past questions, and textbook storage files`,
                    ]}
                    isDeleting={isDeleting}
                    onConfirm={handleExecuteDeleteSchool}
                    onClose={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
};
