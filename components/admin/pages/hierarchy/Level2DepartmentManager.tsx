import { db, get, ref as dbRef, set, update } from '@/lib/backend';
import React, { useState, useMemo } from 'react';
import { useToast } from '../../../../hooks/useToast';
import { InlineEditableText } from '../../primitives/InlineEditableText';
import { SmartDeleteModal } from '../../primitives/SmartDeleteModal';
import { SlideOverDrawer } from '../../primitives/SlideOverDrawer';
import { BreadcrumbNavigation } from '../../primitives/BreadcrumbNavigation';
import { Building2, GraduationCap, Plus, Trash2, ArrowRight, BookOpen, ArrowUpDown, Search, Loader2 } from 'lucide-react';

const LEVELS = ['100lvl', '200lvl', '300lvl', '400lvl', '500lvl'];

interface Level2DepartmentManagerProps {
    schoolId: string;
    collegeId?: string;
    schoolsData: Record<string, any>;
    allDepartments: any[];
    onNavigate: (path: string) => void;
    refreshData: () => Promise<void>;
}

export const Level2DepartmentManager: React.FC<Level2DepartmentManagerProps> = ({
    schoolId,
    collegeId,
    schoolsData,
    allDepartments,
    onNavigate,
    refreshData,
}) => {
    const { addToast } = useToast();
    const school = schoolsData[schoolId] || { name: schoolId, colleges: {} };
    const college = collegeId ? school.colleges?.[collegeId] || { name: collegeId } : null;

    // Slide-Over Drawer state
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [newDeptName, setNewDeptName] = useState('');
    const [newDeptCode, setNewDeptCode] = useState('');
    const [newContactPerson, setNewContactPerson] = useState('');
    const [selectedCollegeId, setSelectedCollegeId] = useState(collegeId || '');
    const [newCollegeName, setNewCollegeName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Delete Department Modal state
    const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Table search & sort state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortColumn, setSortColumn] = useState<'name' | 'code' | 'courses'>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // Filter departments for current school & college
    const schoolDepts = useMemo(() => {
        return allDepartments.filter((dept) => {
            if (dept.schoolId !== schoolId) return false;
            if (collegeId && dept.collegeId !== collegeId) return false;
            return true;
        });
    }, [allDepartments, schoolId, collegeId]);

    const collegesObj = school.colleges || {};
    const collegeKeys = Object.keys(collegesObj);

    const filteredAndSortedDepts = useMemo(() => {
        let result = schoolDepts.filter((dept) => {
            const query = searchQuery.trim().toLowerCase();
            if (!query) return true;
            return (
                dept.department_name?.toLowerCase().includes(query) ||
                dept.id?.toLowerCase().includes(query) ||
                dept.collegeName?.toLowerCase().includes(query)
            );
        });

        result.sort((a, b) => {
            let valA = '';
            let valB = '';

            if (sortColumn === 'name') {
                valA = a.department_name || '';
                valB = b.department_name || '';
            } else if (sortColumn === 'code') {
                valA = a.id || '';
                valB = b.id || '';
            } else if (sortColumn === 'courses') {
                const countA = Array.isArray(a.course_list) ? a.course_list.length : 0;
                const countB = Array.isArray(b.course_list) ? b.course_list.length : 0;
                return sortDirection === 'asc' ? countA - countB : countB - countA;
            }

            const cmp = valA.localeCompare(valB);
            return sortDirection === 'asc' ? cmp : -cmp;
        });

        return result;
    }, [schoolDepts, searchQuery, sortColumn, sortDirection]);

    const handleToggleSort = (column: 'name' | 'code' | 'courses') => {
        if (sortColumn === column) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const handleCreateDepartment = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = newDeptName.trim();
        if (!trimmedName) {
            addToast('Department name is required.', 'error');
            return;
        }

        let targetCollegeId = selectedCollegeId || collegeId;
        if (selectedCollegeId === 'new') {
            const trimmedCollege = newCollegeName.trim();
            if (!trimmedCollege) {
                addToast('New college name is required.', 'error');
                return;
            }
            targetCollegeId = trimmedCollege.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
            await set(dbRef(db, `schools_data/${schoolId}/colleges/${targetCollegeId}`), {
                name: trimmedCollege,
            });
        }

        if (!targetCollegeId) {
            const existingColleges = Object.keys(collegesObj);
            targetCollegeId = existingColleges.length > 0 ? existingColleges[0] : 'college_of_engineering';
        }

        const deptId = trimmedName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
        const deptCode = newDeptCode.trim().toUpperCase() || trimmedName.slice(0, 4).toUpperCase();

        setIsCreating(true);
        try {
            const updates: Record<string, any> = {};

            updates[`schools_data/${schoolId}/colleges/${targetCollegeId}/departments/${deptId}`] = {
                id: deptId,
                name: trimmedName,
                department_name: trimmedName,
                code: deptCode,
                short_name: deptCode,
                school_id: schoolId,
                college_id: targetCollegeId,
                contact_person: newContactPerson.trim(),
                levels: Object.fromEntries(LEVELS.map((lvl) => [lvl, { courses: {} }])),
            };

            updates[`departments_data/${deptId}`] = {
                id: deptId,
                name: trimmedName,
                department_name: trimmedName,
                code: deptCode,
                short_name: deptCode,
                school_id: schoolId,
                college_id: targetCollegeId,
                course_list: [],
            };

            await update(dbRef(db), updates);

            addToast(`Department "${trimmedName}" created successfully!`, 'success');
            setNewDeptName('');
            setNewDeptCode('');
            setNewContactPerson('');
            setIsDrawerOpen(false);
            await refreshData();
        } catch (error: any) {
            console.error('Error creating department:', error);
            addToast(error?.message || 'Failed to create department.', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleRenameDepartment = async (dept: any, newName: string) => {
        try {
            const updates: Record<string, any> = {};
            const targetColId = dept.collegeId || collegeId || Object.keys(collegesObj)[0] || 'college_of_engineering';
            updates[`schools_data/${schoolId}/colleges/${targetColId}/departments/${dept.id}/name`] = newName;
            updates[`departments_data/${dept.id}/department_name`] = newName;

            await update(dbRef(db), updates);
            addToast('Department renamed successfully!', 'success');
            await refreshData();
        } catch (error: any) {
            addToast('Failed to rename department: ' + error.message, 'error');
            throw error;
        }
    };

    const handleExecuteDeleteDepartment = async () => {
        if (!deleteTarget) return;

        setIsDeleting(true);
        try {
            const deptId = deleteTarget.id;
            const targetColId = deleteTarget.collegeId || collegeId || Object.keys(collegesObj)[0] || 'college_of_engineering';
            const updates: Record<string, any> = {};

            // 1. Fetch courses in this department to check orphaned status
            const deptSnap = await get(dbRef(db, `departments_data/${deptId}`));
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
                        linkedDepts = [deptId];
                    }

                    const remaining = linkedDepts.filter((id: string) => id !== deptId);

                    if (remaining.length === 0) {
                        // Orphaned course -> hard delete from global_courses
                        updates[`global_courses/${courseId}`] = null;
                    } else {
                        // Update remaining linked departments
                        updates[`global_courses/${courseId}/linked_departments`] = remaining;
                    }
                }
            }

            // 2. Unlink department data
            updates[`schools_data/${schoolId}/colleges/${targetColId}/departments/${deptId}`] = null;
            updates[`departments_data/${deptId}`] = null;
            updates[`past_questions/${deptId}`] = null;
            updates[`textbook_contexts/${deptId}`] = null;

            await update(dbRef(db), updates);

            addToast(`Department "${deleteTarget.department_name}" deleted & orphaned courses cleaned up.`, 'success');
            setDeleteTarget(null);
            await refreshData();
        } catch (error: any) {
            console.error('Error deleting department:', error);
            addToast('Failed to delete department: ' + error.message, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const breadcrumbItems = [
        {
            label: school.name || schoolId,
            path: `/admin/schools/${encodeURIComponent(schoolId)}`,
            icon: <Building2 className="w-3.5 h-3.5 text-amber-500" />,
        },
    ];

    if (collegeId) {
        breadcrumbItems.push({
            label: college?.name || collegeId,
            path: `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(collegeId)}`,
            icon: <GraduationCap className="w-3.5 h-3.5 text-amber-500" />,
        });
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Breadcrumb Navigation */}
            <BreadcrumbNavigation items={breadcrumbItems} onNavigate={onNavigate} />

            {/* Header & Slide-over Trigger */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-black text-amber-500 uppercase tracking-widest">
                        <Building2 className="w-4 h-4" />
                        <span>Level 2 Department Management</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                        {college ? `${college.name} (${school.name})` : school.name || schoolId}
                    </h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Manage academic departments, assign HOD contacts, and review active courses.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setIsDrawerOpen(true)}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 active:scale-95 shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Department</span>
                </button>
            </div>

            {/* Controls Bar: Search & Column Sort */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search departments..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 transition-all"
                    />
                </div>

                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 w-full sm:w-auto justify-end">
                    <span>Sort by:</span>
                    <button
                        type="button"
                        onClick={() => handleToggleSort('name')}
                        className={`px-3 py-1.5 rounded-lg border text-[11px] uppercase tracking-wider transition flex items-center gap-1 ${
                            sortColumn === 'name' ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 font-black' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                        Name
                        <ArrowUpDown className="w-3 h-3 ml-1" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleToggleSort('courses')}
                        className={`px-3 py-1.5 rounded-lg border text-[11px] uppercase tracking-wider transition flex items-center gap-1 ${
                            sortColumn === 'courses' ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 font-black' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                        Courses
                        <ArrowUpDown className="w-3 h-3 ml-1" />
                    </button>
                </div>
            </div>

            {/* Department Table */}
            {filteredAndSortedDepts.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-4">
                    <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-700" />
                    <div className="space-y-1 max-w-sm">
                        <h3 className="font-black text-lg text-slate-900 dark:text-white">No Departments Found</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {searchQuery ? 'No departments match your search filter.' : 'Add your first department under this college/school.'}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    <th className="py-4 px-6">Department Name</th>
                                    <th className="py-4 px-6">Code / ID</th>
                                    <th className="py-4 px-6">College</th>
                                    <th className="py-4 px-6 text-center">Active Courses</th>
                                    <th className="py-4 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                                {filteredAndSortedDepts.map((dept) => {
                                    const courseCount = Array.isArray(dept.course_list) ? dept.course_list.length : 0;
                                    const targetCollegeId = dept.collegeId || collegeId;
                                    const nextPath = targetCollegeId
                                        ? `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(targetCollegeId)}/${encodeURIComponent(dept.id)}`
                                        : `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(dept.id)}`;

                                    return (
                                        <tr
                                            key={dept.id}
                                            onClick={() => onNavigate(nextPath)}
                                            className="group hover:bg-amber-500/5 transition-colors cursor-pointer"
                                        >
                                            <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">
                                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <InlineEditableText
                                                        value={dept.department_name || dept.id}
                                                        onSave={(newName) => handleRenameDepartment(dept, newName)}
                                                    />
                                                </div>
                                            </td>

                                            <td className="py-4 px-6 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                                                <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                                                    {dept.id}
                                                </span>
                                            </td>

                                            <td className="py-4 px-6 font-semibold text-xs text-slate-500 dark:text-slate-400">
                                                {dept.collegeName || dept.collegeId || 'Main College'}
                                            </td>

                                            <td className="py-4 px-6 text-center">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-black">
                                                    <BookOpen className="w-3.5 h-3.5" />
                                                    {courseCount} Course{courseCount !== 1 ? 's' : ''}
                                                </span>
                                            </td>

                                            <td className="py-4 px-6 text-right">
                                                <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteTarget(dept)}
                                                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                                                        title="Delete Department"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onNavigate(nextPath)}
                                                        className="p-2 text-slate-400 group-hover:text-amber-500 group-hover:translate-x-1 transition-all"
                                                        title="Open Department Roster"
                                                    >
                                                        <ArrowRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Slide-Over Drawer: Add Department */}
            <SlideOverDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                title="Add Department"
                description={`Create an academic department under ${college?.name || school.name || schoolId}.`}
            >
                <form onSubmit={handleCreateDepartment} className="space-y-6">
                    {!collegeId && (
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                Parent College *
                            </label>
                            <select
                                value={selectedCollegeId}
                                onChange={(e) => setSelectedCollegeId(e.target.value)}
                                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                            >
                                <option value="">Select Existing College...</option>
                                {collegeKeys.map((cId) => (
                                    <option key={cId} value={cId}>
                                        {collegesObj[cId]?.name || cId}
                                    </option>
                                ))}
                                <option value="new">+ Create New College</option>
                            </select>
                        </div>
                    )}

                    {selectedCollegeId === 'new' && (
                        <div className="space-y-2 animate-in fade-in">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                New College Name *
                            </label>
                            <input
                                type="text"
                                value={newCollegeName}
                                onChange={(e) => setNewCollegeName(e.target.value)}
                                placeholder="e.g. College of Computing"
                                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Department Name *
                        </label>
                        <input
                            type="text"
                            required
                            value={newDeptName}
                            onChange={(e) => setNewDeptName(e.target.value)}
                            placeholder="e.g. Computer Science"
                            className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Department Code
                        </label>
                        <input
                            type="text"
                            value={newDeptCode}
                            onChange={(e) => setNewDeptCode(e.target.value)}
                            placeholder="e.g. CSC"
                            className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all uppercase"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Head of Department / Contact Person
                        </label>
                        <input
                            type="text"
                            value={newContactPerson}
                            onChange={(e) => setNewContactPerson(e.target.value)}
                            placeholder="e.g. Prof. Alan Turing (hod.csc@univ.edu)"
                            className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                        />
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setIsDrawerOpen(false)}
                            className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isCreating || !newDeptName.trim()}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 disabled:opacity-40"
                        >
                            {isCreating ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Creating...</span>
                                </>
                            ) : (
                                <span>Save Department</span>
                            )}
                        </button>
                    </div>
                </form>
            </SlideOverDrawer>

            {/* Smart Delete Department Modal */}
            {deleteTarget && (
                <SmartDeleteModal
                    isOpen={Boolean(deleteTarget)}
                    targetType="department"
                    targetItem={{
                        id: deleteTarget.id,
                        name: deleteTarget.department_name || deleteTarget.id,
                        code: deleteTarget.id,
                    }}
                    isDeleting={isDeleting}
                    onConfirmDelete={handleExecuteDeleteDepartment}
                    onClose={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
};
