import React, { useState, useEffect } from 'react';
import { db } from '../../../../firebase';
import { ref as dbRef, get, update } from 'firebase/database';
import { useToast } from '../../../../hooks/useToast';
import { InlineEditableText } from '../../primitives/InlineEditableText';
import { ConfirmDeleteModal } from '../../primitives/ConfirmDeleteModal';
import { SlideOverDrawer } from '../../primitives/SlideOverDrawer';
import { BreadcrumbNavigation } from '../../primitives/BreadcrumbNavigation';
import { Building2, GraduationCap, BookOpen, Plus, Trash2, LayoutGrid, List, ArrowRight, Layers, FileText, Archive } from 'lucide-react';
import type { Course } from '../../../../types';

const LEVELS = ['100lvl', '200lvl', '300lvl', '400lvl', '500lvl'];

interface Level3CourseCatalogProps {
    schoolId: string;
    deptId: string;
    schoolsData: Record<string, any>;
    allDepartments: any[];
    onNavigate: (path: string) => void;
    refreshData: () => Promise<void>;
}

export const Level3CourseCatalog: React.FC<Level3CourseCatalogProps> = ({
    schoolId,
    deptId,
    schoolsData,
    allDepartments,
    onNavigate,
    refreshData,
}) => {
    const { addToast } = useToast();
    const school = schoolsData[schoolId] || { name: schoolId };
    const department = allDepartments.find((d) => d.id === deptId) || { department_name: deptId };
    const collegeId = department.collegeId;
    const college = collegeId ? school.colleges?.[collegeId] || { name: collegeId } : null;

    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [courses, setCourses] = useState<Course[]>([]);
    const [isLoadingCourses, setIsLoadingCourses] = useState(true);

    // Slide-over Add Course state
    const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
    const [newCourseCode, setNewCourseCode] = useState('');
    const [newCourseTitle, setNewCourseTitle] = useState('');
    const [newCreditUnits, setNewCreditUnits] = useState('3');
    const [newLevel, setNewLevel] = useState('100lvl');
    const [newSemester, setNewSemester] = useState<'first' | 'second'>('first');
    const [isCreating, setIsCreating] = useState(false);

    // Delete Course Modal state
    const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Batch Selection state
    const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());

    const toggleCourseSelection = (courseId: string) => {
        setSelectedCourseIds((prev) => {
            const next = new Set(prev);
            if (next.has(courseId)) next.delete(courseId);
            else next.add(courseId);
            return next;
        });
    };

    const toggleSelectAllCourses = () => {
        if (selectedCourseIds.size === courses.length && courses.length > 0) {
            setSelectedCourseIds(new Set());
        } else {
            setSelectedCourseIds(new Set(courses.map((c) => c.course_id)));
        }
    };

    const handleBatchDeleteCourses = async () => {
        if (selectedCourseIds.size === 0) return;
        if (!window.confirm(`Are you sure you want to permanently delete ${selectedCourseIds.size} selected course(s)?`)) return;

        setIsDeleting(true);
        try {
            const updatedCourses = courses.filter((c) => !selectedCourseIds.has(c.course_id));
            await update(dbRef(db, `departments_data/${deptId}`), {
                course_list: updatedCourses,
            });

            setCourses(updatedCourses);
            addToast(`Successfully deleted ${selectedCourseIds.size} course(s).`, 'success');
            setSelectedCourseIds(new Set());
            await refreshData();
        } catch (error: any) {
            console.error('Error batch deleting courses:', error);
            addToast('Failed to delete selected courses: ' + error.message, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const loadDepartmentCourses = async () => {
        setIsLoadingCourses(true);
        try {
            const snap = await get(dbRef(db, `departments_data/${deptId}`));
            if (snap.exists()) {
                const data = snap.val();
                const rawList = data?.course_list;
                let list: Course[] = [];
                if (Array.isArray(rawList)) {
                    list = rawList;
                } else if (rawList && typeof rawList === 'object') {
                    list = Object.values(rawList);
                }
                setCourses(list.filter(Boolean));
            } else {
                setCourses([]);
            }
        } catch (error) {
            console.error('Error fetching department courses:', error);
            addToast('Failed to load course roster.', 'error');
        } finally {
            setIsLoadingCourses(false);
        }
    };

    useEffect(() => {
        void loadDepartmentCourses();
    }, [deptId]);

    const handleCreateCourse = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = newCourseCode.trim().toUpperCase();
        const title = newCourseTitle.trim();
        if (!title) {
            addToast('Course title is required.', 'error');
            return;
        }

        const courseId = (code || title).toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
        const newCourse: Course = {
            course_id: courseId,
            course_code: code || undefined,
            course_name: title,
            course_unit: Number(newCreditUnits) || 3,
            level: newLevel,
            semester: newSemester,
            course_status: 'ACTIVE',
            topics: [],
            textbook_urls: [],
        };

        setIsCreating(true);
        try {
            const updatedCourses = [...courses.filter((c) => c.course_id !== courseId), newCourse];
            await update(dbRef(db, `departments_data/${deptId}`), {
                course_list: updatedCourses,
            });

            addToast(`Course "${code || title}" added successfully!`, 'success');
            setNewCourseCode('');
            setNewCourseTitle('');
            setNewCreditUnits('3');
            setIsAddDrawerOpen(false);
            setCourses(updatedCourses);
            await refreshData();
        } catch (error: any) {
            console.error('Error creating course:', error);
            addToast(error?.message || 'Failed to add course.', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleToggleCourseStatus = async (course: Course) => {
        const nextStatus = course.course_status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
        try {
            const updatedCourses = courses.map((c) =>
                c.course_id === course.course_id ? { ...c, course_status: nextStatus } : c
            );
            await update(dbRef(db, `departments_data/${deptId}`), {
                course_list: updatedCourses,
            });
            setCourses(updatedCourses);
            addToast(`Course status updated to ${nextStatus}`, 'success');
        } catch (error: any) {
            addToast('Failed to update status: ' + error.message, 'error');
        }
    };

    const handleRenameCourse = async (course: Course, newTitle: string) => {
        try {
            const updatedCourses = courses.map((c) =>
                c.course_id === course.course_id ? { ...c, course_name: newTitle } : c
            );
            await update(dbRef(db, `departments_data/${deptId}`), {
                course_list: updatedCourses,
            });
            setCourses(updatedCourses);
            addToast('Course title updated!', 'success');
        } catch (error: any) {
            addToast('Failed to update course title: ' + error.message, 'error');
            throw error;
        }
    };

    const handleExecuteDeleteCourse = async () => {
        if (!deleteTarget) return;

        setIsDeleting(true);
        try {
            const updatedCourses = courses.filter((c) => c.course_id !== deleteTarget.course_id);
            await update(dbRef(db, `departments_data/${deptId}`), {
                course_list: updatedCourses,
            });

            setCourses(updatedCourses);
            addToast(`Course "${deleteTarget.course_name}" deleted.`, 'success');
            setDeleteTarget(null);
            await refreshData();
        } catch (error: any) {
            console.error('Error deleting course:', error);
            addToast('Failed to delete course: ' + error.message, 'error');
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

    const currentDeptPath = collegeId
        ? `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(collegeId)}/${encodeURIComponent(deptId)}`
        : `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(deptId)}`;

    breadcrumbItems.push({
        label: department.department_name || deptId,
        path: currentDeptPath,
        icon: <BookOpen className="w-3.5 h-3.5 text-amber-500" />,
    });

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Breadcrumb Navigation */}
            <BreadcrumbNavigation items={breadcrumbItems} onNavigate={onNavigate} />

            {/* Header & Actions Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-black text-amber-500 uppercase tracking-widest">
                        <BookOpen className="w-4 h-4" />
                        <span>Level 3 Course Catalog</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                        {department.department_name || deptId}
                    </h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        {courses.length} course{courses.length !== 1 ? 's' : ''} in roster. Click any course to enter Level 4 Course Studio.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {selectedCourseIds.size > 0 && (
                        <button
                            type="button"
                            onClick={handleBatchDeleteCourses}
                            disabled={isDeleting}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-xs hover:bg-rose-100 transition-colors border border-rose-500/30 cursor-pointer disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete Selected ({selectedCourseIds.size})</span>
                        </button>
                    )}

                    {/* View Switcher */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-xl transition-all ${
                                viewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-black' : 'text-slate-400 hover:text-slate-600'
                            }`}
                            title="Grid View"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-xl transition-all ${
                                viewMode === 'list' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-black' : 'text-slate-400 hover:text-slate-600'
                            }`}
                            title="List View"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsAddDrawerOpen(true)}
                        className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Add Course</span>
                    </button>
                </div>
            </div>

            {/* Course Grid or List */}
            {isLoadingCourses ? (
                <div className="py-16 text-center text-sm font-bold text-slate-400">Loading course roster...</div>
            ) : courses.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-4">
                    <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-700" />
                    <div className="space-y-1 max-w-sm">
                        <h3 className="font-black text-lg text-slate-900 dark:text-white">No Courses Added</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Add courses to start populating syllabus topics, textbooks, and past questions.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsAddDrawerOpen(true)}
                        className="px-6 py-3 rounded-2xl bg-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-md"
                    >
                        Add First Course
                    </button>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {courses.map((course) => {
                        const topicCount = course.topics?.length || 0;
                        const materialCount = course.textbook_urls?.length || (course.textbook_url ? 1 : 0);
                        const isArchived = course.course_status === 'ARCHIVED';
                        const studioPath = collegeId
                            ? `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(collegeId)}/${encodeURIComponent(deptId)}/${encodeURIComponent(course.course_id)}`
                            : `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(deptId)}/${encodeURIComponent(course.course_id)}`;

                        return (
                            <div
                                key={course.course_id}
                                onClick={() => onNavigate(studioPath)}
                                className={`group relative bg-white dark:bg-slate-900 rounded-3xl p-6 border transition-all duration-200 hover:-translate-y-1 hover:shadow-xl cursor-pointer flex flex-col justify-between gap-6 ${
                                    isArchived ? 'opacity-60 border-slate-200 dark:border-slate-800' : 'border-slate-200 dark:border-slate-800 hover:border-amber-500/50'
                                }`}
                            >
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedCourseIds.has(course.course_id)}
                                                onChange={() => toggleCourseSelection(course.course_id)}
                                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer mr-1"
                                            />
                                            {course.course_code && (
                                                <span className="px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 font-black text-xs tracking-wider">
                                                    {course.course_code}
                                                </span>
                                            )}
                                            {course.course_unit && (
                                                <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-[10px] uppercase">
                                                    {course.course_unit} Units
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => handleToggleCourseStatus(course)}
                                                className={`p-2 rounded-xl transition-colors ${
                                                    isArchived ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                }`}
                                                title={isArchived ? 'Unarchive Course' : 'Archive Course'}
                                            >
                                                <Archive className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleteTarget(course)}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                                                title="Delete Course"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                                        <InlineEditableText
                                            value={course.course_name}
                                            onSave={(newName) => handleRenameCourse(course, newName)}
                                            className="text-base font-black text-slate-900 dark:text-white"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                                            {course.level || '100lvl'}
                                        </span>
                                        <span>•</span>
                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                                            {course.semester ? `${course.semester} sem` : '1st sem'}
                                        </span>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                                        <span className="flex items-center gap-1">
                                            <Layers className="w-3.5 h-3.5 text-amber-500" />
                                            {topicCount} Topics
                                        </span>
                                        <span>•</span>
                                        <span className="flex items-center gap-1">
                                            <FileText className="w-3.5 h-3.5 text-sky-500" />
                                            {materialCount} Files
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
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    <th className="py-4 px-4 w-10">
                                        <input
                                            type="checkbox"
                                            checked={courses.length > 0 && selectedCourseIds.size === courses.length}
                                            onChange={toggleSelectAllCourses}
                                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                                        />
                                    </th>
                                    <th className="py-4 px-6">Course Code</th>
                                    <th className="py-4 px-6">Title</th>
                                    <th className="py-4 px-6">Units</th>
                                    <th className="py-4 px-6">Level / Semester</th>
                                    <th className="py-4 px-6 text-center">Topics</th>
                                    <th className="py-4 px-6 text-center">Materials</th>
                                    <th className="py-4 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                                {courses.map((course) => {
                                    const topicCount = course.topics?.length || 0;
                                    const materialCount = course.textbook_urls?.length || (course.textbook_url ? 1 : 0);
                                    const studioPath = collegeId
                                        ? `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(collegeId)}/${encodeURIComponent(deptId)}/${encodeURIComponent(course.course_id)}`
                                        : `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(deptId)}/${encodeURIComponent(course.course_id)}`;

                                    return (
                                        <tr
                                            key={course.course_id}
                                            onClick={() => onNavigate(studioPath)}
                                            className="group hover:bg-amber-500/5 transition-colors cursor-pointer"
                                        >
                                            <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedCourseIds.has(course.course_id)}
                                                    onChange={() => toggleCourseSelection(course.course_id)}
                                                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                                                />
                                            </td>
                                            <td className="py-4 px-6 font-mono font-black text-amber-600 dark:text-amber-400">
                                                {course.course_code || 'N/A'}
                                            </td>
                                            <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <InlineEditableText
                                                        value={course.course_name}
                                                        onSave={(newName) => handleRenameCourse(course, newName)}
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-4 px-6 font-bold text-xs text-slate-500">
                                                {course.course_unit || 3} Units
                                            </td>
                                            <td className="py-4 px-6 font-semibold text-xs text-slate-500">
                                                {course.level || '100lvl'} ({course.semester || 'first'})
                                            </td>
                                            <td className="py-4 px-6 text-center font-bold text-xs text-amber-600">
                                                {topicCount}
                                            </td>
                                            <td className="py-4 px-6 text-center font-bold text-xs text-sky-600">
                                                {materialCount}
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteTarget(course)}
                                                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onNavigate(studioPath)}
                                                        className="p-2 text-slate-400 group-hover:text-amber-500 group-hover:translate-x-1 transition-all"
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

            {/* Slide-over Add Course Drawer */}
            <SlideOverDrawer
                isOpen={isAddDrawerOpen}
                onClose={() => setIsAddDrawerOpen(false)}
                title="Add New Course"
                description={`Register a new course under ${department.department_name || deptId}.`}
            >
                <form onSubmit={handleCreateCourse} className="space-y-6">
                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Course Code *
                        </label>
                        <input
                            type="text"
                            required
                            value={newCourseCode}
                            onChange={(e) => setNewCourseCode(e.target.value)}
                            placeholder="e.g. GET 208"
                            className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all uppercase"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Course Title *
                        </label>
                        <input
                            type="text"
                            required
                            value={newCourseTitle}
                            onChange={(e) => setNewCourseTitle(e.target.value)}
                            placeholder="e.g. Fundamentals of Engineering Thermodynamics"
                            className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                Credit Units
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={12}
                                value={newCreditUnits}
                                onChange={(e) => setNewCreditUnits(e.target.value)}
                                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                Level
                            </label>
                            <select
                                value={newLevel}
                                onChange={(e) => setNewLevel(e.target.value)}
                                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                            >
                                {LEVELS.map((lvl) => (
                                    <option key={lvl} value={lvl}>
                                        {lvl}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Semester
                        </label>
                        <select
                            value={newSemester}
                            onChange={(e) => setNewSemester(e.target.value as any)}
                            className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all"
                        >
                            <option value="first">First Semester</option>
                            <option value="second">Second Semester</option>
                        </select>
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setIsAddDrawerOpen(false)}
                            className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isCreating || !newCourseTitle.trim()}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 disabled:opacity-40"
                        >
                            {isCreating ? 'Saving...' : 'Save Course'}
                        </button>
                    </div>
                </form>
            </SlideOverDrawer>

            {/* Confirm Delete Course Modal */}
            {deleteTarget && (
                <ConfirmDeleteModal
                    isOpen={Boolean(deleteTarget)}
                    title={`Delete "${deleteTarget.course_name}"?`}
                    description="This will remove the course from this department's roster along with all attached syllabus topics and material references."
                    itemName={deleteTarget.course_name}
                    warningDetails={[
                        `Course Code: ${deleteTarget.course_code || 'N/A'}`,
                        `All syllabus topics and study material associations`,
                    ]}
                    isDeleting={isDeleting}
                    onConfirm={handleExecuteDeleteCourse}
                    onClose={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
};
