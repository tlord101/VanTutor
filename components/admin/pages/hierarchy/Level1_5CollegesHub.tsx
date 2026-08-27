import React, { useState } from 'react';
import { db } from '../../../../firebase';
import { ref as dbRef, update, set, get } from 'firebase/database';
import { useToast } from '../../../../hooks/useToast';
import { InlineEditableText } from '../../primitives/InlineEditableText';
import { ConfirmDeleteModal } from '../../primitives/ConfirmDeleteModal';
import { BreadcrumbNavigation } from '../../primitives/BreadcrumbNavigation';
import { Building2, Plus, Trash2, ArrowRight, Layers, GraduationCap, X, Loader2, BookOpen } from 'lucide-react';

interface Level1_5CollegesHubProps {
    schoolId: string;
    schoolsData: Record<string, any>;
    allDepartments: any[];
    onNavigate: (path: string) => void;
    refreshData: () => Promise<void>;
}

export const Level1_5CollegesHub: React.FC<Level1_5CollegesHubProps> = ({
    schoolId,
    schoolsData,
    allDepartments,
    onNavigate,
    refreshData,
}) => {
    const { addToast } = useToast();
    const school = schoolsData[schoolId] || { name: schoolId, colleges: {} };
    const collegesObj = school.colleges || {};
    const collegeKeys = Object.keys(collegesObj);

    // Add College Modal state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newCollegeName, setNewCollegeName] = useState('');
    const [newCollegeCode, setNewCollegeCode] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Delete College Modal state
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleCreateCollege = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = newCollegeName.trim();
        if (!trimmedName) {
            addToast('College name is required.', 'error');
            return;
        }

        const collegeId = trimmedName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
        if (collegesObj[collegeId]) {
            addToast('A college with this name already exists in this school.', 'error');
            return;
        }

        setIsCreating(true);
        try {
            await set(dbRef(db, `schools_data/${schoolId}/colleges/${collegeId}`), {
                name: trimmedName,
                code: newCollegeCode.trim().toUpperCase() || trimmedName.slice(0, 4).toUpperCase(),
                created_at: Date.now(),
            });

            addToast(`College "${trimmedName}" added successfully!`, 'success');
            setNewCollegeName('');
            setNewCollegeCode('');
            setIsAddModalOpen(false);
            await refreshData();
        } catch (error: any) {
            console.error('Error creating college:', error);
            addToast(error?.message || 'Failed to create college.', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleRenameCollege = async (collegeId: string, newName: string) => {
        try {
            await update(dbRef(db, `schools_data/${schoolId}/colleges/${collegeId}`), {
                name: newName,
            });
            addToast('College renamed successfully!', 'success');
            await refreshData();
        } catch (error: any) {
            addToast('Failed to rename college: ' + error.message, 'error');
            throw error;
        }
    };

    const handleExecuteDeleteCollege = async () => {
        if (!deleteTarget) return;

        setIsDeleting(true);
        try {
            const collegeId = deleteTarget.id;
            const updates: Record<string, any> = {};

            // 1. Delete college node
            updates[`schools_data/${schoolId}/colleges/${collegeId}`] = null;

            // 2. Clean up departments and orphaned courses
            const collegeDepts = allDepartments.filter(
                (d) => d.schoolId === schoolId && d.collegeId === collegeId
            );
            const deletedDeptIds = new Set(collegeDepts.map((d) => d.id));

            for (const dept of collegeDepts) {
                const deptSnap = await get(dbRef(db, `departments_data/${dept.id}`));
                if (deptSnap.exists()) {
                    const data = deptSnap.val();
                    const rawList = data?.course_list;
                    let coursesList: any[] = Array.isArray(rawList) ? rawList : Object.values(rawList || {});

                    for (const c of coursesList) {
                        if (!c.course_id) continue;
                        const courseId = c.course_id;

                        const globalSnap = await get(dbRef(db, `global_courses/${courseId}`));
                        let linkedDepts: string[] = [];
                        if (globalSnap.exists() && Array.isArray(globalSnap.val()?.linked_departments)) {
                            linkedDepts = globalSnap.val().linked_departments;
                        } else if (c.linked_departments && Array.isArray(c.linked_departments)) {
                            linkedDepts = c.linked_departments;
                        } else {
                            linkedDepts = [dept.id];
                        }

                        const remaining = linkedDepts.filter((id: string) => !deletedDeptIds.has(id));

                        if (remaining.length === 0) {
                            updates[`global_courses/${courseId}`] = null;
                        } else {
                            updates[`global_courses/${courseId}/linked_departments`] = remaining;
                        }
                    }
                }

                updates[`departments_data/${dept.id}`] = null;
                updates[`past_questions/${dept.id}`] = null;
                updates[`textbook_contexts/${dept.id}`] = null;
            }

            await update(dbRef(db), updates);

            addToast(`College "${deleteTarget.name}" and all associated departments deleted.`, 'success');
            setDeleteTarget(null);
            await refreshData();
        } catch (error: any) {
            console.error('Error deleting college:', error);
            addToast('Failed to delete college: ' + error.message, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Breadcrumb Navigation */}
            <BreadcrumbNavigation
                items={[
                    {
                        label: school.name || schoolId,
                        path: `/admin/schools/${encodeURIComponent(schoolId)}`,
                        icon: <Building2 className="w-3.5 h-3.5 text-amber-500" />,
                    },
                ]}
                onNavigate={onNavigate}
            />

            {/* Header / Actions Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-black text-amber-500 uppercase tracking-widest">
                        <GraduationCap className="w-4 h-4" />
                        <span>Colleges & Faculties</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                        {school.name || schoolId}
                    </h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        {collegeKeys.length} College{collegeKeys.length !== 1 ? 's' : ''} in this school. Click any college card to view its departments.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 active:scale-95 shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add College</span>
                </button>
            </div>

            {/* Colleges Grid */}
            {collegeKeys.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-4">
                    <GraduationCap className="w-12 h-12 text-slate-300 dark:text-slate-700" />
                    <div className="space-y-1 max-w-sm">
                        <h3 className="font-black text-lg text-slate-900 dark:text-white">No Colleges Found</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Add colleges under {school.name || schoolId} to organize academic departments.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsAddModalOpen(true)}
                        className="px-6 py-3 rounded-2xl bg-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-md"
                    >
                        Add First College
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {collegeKeys.map((cId) => {
                        const college = collegesObj[cId] || {};
                        const deptCount = allDepartments.filter(
                            (d) => d.schoolId === schoolId && d.collegeId === cId
                        ).length;

                        return (
                            <div
                                key={cId}
                                onClick={() =>
                                    onNavigate(
                                        `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(cId)}`
                                    )
                                }
                                className="group relative bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-amber-500/50 cursor-pointer flex flex-col justify-between gap-6"
                            >
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-500 border border-amber-200/50 dark:border-amber-800/40 flex items-center justify-center font-black shrink-0">
                                            <GraduationCap className="w-6 h-6" />
                                        </div>

                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            {college.code && (
                                                <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-[10px] uppercase tracking-wider">
                                                    {college.code}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setDeleteTarget({ id: cId, name: college.name || cId })}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                                                title="Delete College"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                                        <InlineEditableText
                                            value={college.name || cId}
                                            onSave={(newName) => handleRenameCollege(cId, newName)}
                                            className="text-lg font-black text-slate-900 dark:text-white"
                                            inputClassName="text-lg"
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                        <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                                        <span>
                                            {deptCount} Department{deptCount !== 1 ? 's' : ''}
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

            {/* Add College Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">Add New College</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Create a college unit under {school.name || schoolId}.
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

                        <form onSubmit={handleCreateCollege} className="space-y-4">
                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    College Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newCollegeName}
                                    onChange={(e) => setNewCollegeName(e.target.value)}
                                    placeholder="e.g. College of Computing"
                                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    Short Code
                                </label>
                                <input
                                    type="text"
                                    value={newCollegeCode}
                                    onChange={(e) => setNewCollegeCode(e.target.value)}
                                    placeholder="e.g. COC"
                                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all uppercase"
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
                                    disabled={isCreating || !newCollegeName.trim()}
                                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 disabled:opacity-40"
                                >
                                    {isCreating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Creating...</span>
                                        </>
                                    ) : (
                                        <span>Create College</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete College Modal */}
            {deleteTarget && (
                <ConfirmDeleteModal
                    isOpen={Boolean(deleteTarget)}
                    title={`Delete "${deleteTarget.name}"?`}
                    description="This will permanently delete this college along with all departments, courses, and syllabus materials inside it."
                    itemName={deleteTarget.name}
                    warningDetails={[
                        `Departments inside ${deleteTarget.name}`,
                        `All course rosters and syllabi associated with these departments`,
                    ]}
                    isDeleting={isDeleting}
                    onConfirm={handleExecuteDeleteCollege}
                    onClose={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
};
