import React, { useState } from 'react';
import { BookOpen, Folder, Trash2, Plus, Sparkles, Database } from 'lucide-react';
import type { Course, Topic } from '../../../types';
import { useToast } from '../../../hooks/useToast';

interface CourseCatalogViewProps {
    courseAdminView: any;
    handleCourseTabNavigate: (path: string) => void;
    globalSearchQuery: string;
    setGlobalSearchQuery: (val: string) => void;
    allDepartments: any[];
    LEVELS: string[];
    filteredGlobalCourses: any[];
    buildCourseManagerPath: (deptId?: string, level?: string, courseId?: string) => string;
    managerSelectionDepartmentId: string;
    setManagerSelectionDepartmentId: (val: string) => void;
    managerSelectionLevel: string;
    setManagerSelectionLevel: (val: string) => void;
    buildCourseAddPath: (deptId?: string, level?: string) => string;
    handleMergeDuplicateCoursesAcrossDepartments: () => void;
    courseImportTargetMode: 'selected' | 'all';
    setCourseImportTargetMode: (val: 'selected' | 'all') => void;
    courseImportLevelOverride: string;
    setCourseImportLevelOverride: (val: string) => void;
    courseImportDepartmentIds: string[];
    toggleCourseImportDepartment: (id: string) => void;
    courseImportSessionOverride: string;
    setCourseImportSessionOverride: (val: string) => void;
    setCourseRegistrationFiles: (files: File[]) => void;
    handleGoogleDrivePick: (callback: (files: File[]) => void) => void;
    handleCourseRegistrationImport: () => void;
    isCourseImportDisabled: boolean;
    isCourseImporting: boolean;
    courseImportProgress: string;
    managerCoursesForLevel: Course[];
    getCourseRouteKey: (course: Partial<Course>) => string;
    normalizeTextbookUrls: (course: Partial<Course>) => string[];
    handleDeleteCourseFromDepartment: (course: Course, deleteAll?: boolean) => void;
    handleBatchDeleteCourses: (courses: Course[], deleteAll?: boolean) => void;
    selectedManagerDepartment: any;
    selectedManagerCourse: Course | undefined;
    setCourseDetailFiles: (files: File[]) => void;
    courseDetailFiles: File[];
    autoSyncToOfferingDepartments: boolean;
    setAutoSyncToOfferingDepartments: (val: boolean) => void;
    isUploading: boolean;
    extractionProgress: string;
    handleTextbookUpload: (courseId: string, files: File[]) => void;
}

export const CourseCatalogView: React.FC<CourseCatalogViewProps> = ({
    courseAdminView, handleCourseTabNavigate, globalSearchQuery, setGlobalSearchQuery,
    allDepartments, LEVELS, filteredGlobalCourses, buildCourseManagerPath,
    managerSelectionDepartmentId, setManagerSelectionDepartmentId,
    managerSelectionLevel, setManagerSelectionLevel, buildCourseAddPath,
    handleMergeDuplicateCoursesAcrossDepartments, courseImportTargetMode,
    setCourseImportTargetMode, courseImportLevelOverride, setCourseImportLevelOverride,
    courseImportDepartmentIds, toggleCourseImportDepartment, courseImportSessionOverride,
    setCourseImportSessionOverride, setCourseRegistrationFiles, handleGoogleDrivePick,
    handleCourseRegistrationImport, isCourseImportDisabled, isCourseImporting,
    courseImportProgress, managerCoursesForLevel, getCourseRouteKey,
    normalizeTextbookUrls, handleDeleteCourseFromDepartment, handleBatchDeleteCourses, selectedManagerDepartment,
    selectedManagerCourse, setCourseDetailFiles, courseDetailFiles,
    autoSyncToOfferingDepartments, setAutoSyncToOfferingDepartments,
    isUploading, extractionProgress, handleTextbookUpload
}) => {
    const { addToast } = useToast();
    const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());

    const isGlobalSearch = globalSearchQuery.length > 0;

    return (
        <div className="space-y-6">
            {/* Navigation Header */}
            <div className="flex gap-4 border-b border-slate-200">
                <button 
                    onClick={() => handleCourseTabNavigate('/admin/courses/all')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${courseAdminView.mode === 'global' ? 'border-indigo-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Database className="w-4 h-4" />
                    Global Search
                </button>
                <button 
                    onClick={() => handleCourseTabNavigate('/admin/courses/manager')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${courseAdminView.mode !== 'global' && courseAdminView.mode !== 'add' ? 'border-indigo-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Folder className="w-4 h-4" />
                    Department Manager
                </button>
                <button 
                    onClick={() => handleCourseTabNavigate(buildCourseAddPath(managerSelectionDepartmentId || undefined, managerSelectionLevel || undefined))}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${courseAdminView.mode === 'add' ? 'border-indigo-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Plus className="w-4 h-4" />
                    Add Courses
                </button>
            </div>

            {/* Global Search Mode */}
            {courseAdminView.mode === 'global' && (
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h3 className="font-black text-xl text-slate-900 mb-1">Global Course Directory</h3>
                            <p className="text-sm text-slate-500">Search all courses across all departments globally.</p>
                        </div>
                        <input 
                            type="text" 
                            placeholder="Search courses..." 
                            value={globalSearchQuery} 
                            onChange={e => setGlobalSearchQuery(e.target.value)}
                            className="p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 transition min-w-[250px]"
                        />
                    </div>
                    
                    {/* Global Search Results List */}
                    {isGlobalSearch && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-bold text-slate-500">
                                    Found {filteredGlobalCourses.length} courses across all departments
                                </p>
                                {selectedCourses.size > 0 && (
                                    <button
                                        onClick={() => {
                                            const coursesToDelete = filteredGlobalCourses.filter(c => selectedCourses.has(c.course.course_id || c.course.course_name || ''));
                                            handleBatchDeleteCourses(coursesToDelete.map(c => c.course), true);
                                            setSelectedCourses(new Set());
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 font-bold text-xs rounded-xl hover:bg-red-100 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Global Batch Delete ({selectedCourses.size})
                                    </button>
                                )}
                            </div>
                            {filteredGlobalCourses.map(({ course, deptId, deptName, level }) => {
                                const courseRouteIdentifier = getCourseRouteKey(course);
                                const courseKey = course.course_id || course.course_name || '';
                                return (
                                    <div
                                        key={`${deptId}-${level}-${courseRouteIdentifier}`}
                                        onClick={() => handleCourseTabNavigate(buildCourseManagerPath(deptId, level, courseRouteIdentifier))}
                                        className="group flex items-center justify-between gap-4 p-5 rounded-3xl border border-slate-200 bg-white hover:border-indigo-200 transition cursor-pointer shadow-sm relative"
                                    >
                                        <div 
                                            className="absolute left-4 top-1/2 -translate-y-1/2 cursor-pointer z-10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedCourses(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(courseKey)) next.delete(courseKey);
                                                    else next.add(courseKey);
                                                    return next;
                                                });
                                            }}
                                        >
                                            <input 
                                                type="checkbox" 
                                                checked={selectedCourses.has(courseKey)}
                                                readOnly
                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0 pl-6">
                                            <div className="font-bold text-slate-900">{course.course_name}</div>
                                            <div className="text-xs text-slate-500">{deptName} • {level}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Manager Root */}
            {courseAdminView.mode === 'manager-root' && (
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-8 max-w-3xl mx-auto text-center space-y-6">
                    <Folder className="w-16 h-16 text-indigo-200 mx-auto" />
                    <div>
                        <h3 className="font-black text-2xl text-slate-900 mb-2">Department Manager</h3>
                        <p className="text-slate-500">Select a department and level to manage its courses.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                        <select
                            value={managerSelectionDepartmentId}
                            onChange={e => setManagerSelectionDepartmentId(e.target.value)}
                            className="p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition"
                        >
                            <option value="">Select Department</option>
                            {allDepartments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                            ))}
                        </select>
                        <select
                            value={managerSelectionLevel}
                            onChange={e => setManagerSelectionLevel(e.target.value)}
                            className="p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition"
                        >
                            <option value="">Select Level</option>
                            {LEVELS.map(level => (
                                <option key={level} value={level}>{level}</option>
                            ))}
                        </select>
                    </div>
                    <div className="pt-4 flex flex-col gap-3">
                        <button
                            disabled={!managerSelectionDepartmentId || !managerSelectionLevel}
                            onClick={() => handleCourseTabNavigate(buildCourseManagerPath(managerSelectionDepartmentId, managerSelectionLevel))}
                            className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition shadow-lg disabled:opacity-50 bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20"
                        >
                            View Courses
                        </button>
                        <button
                            onClick={handleMergeDuplicateCoursesAcrossDepartments}
                            className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition shadow-sm bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                            Run Global Deduplication
                        </button>
                    </div>
                </div>
            )}

            {/* Add Courses Mode */}
            {courseAdminView.mode === 'add' && (
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8 space-y-8 max-w-4xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-black text-xl text-slate-900 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-indigo-500" /> AI Course Extraction
                            </h3>
                            <p className="text-sm text-slate-500 mt-1">Upload university course forms to auto-generate catalogs.</p>
                        </div>
                    </div>
                    
                    <div className="p-6 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-indigo-400">Target Assignment</label>
                                <select
                                    value={courseImportTargetMode}
                                    onChange={e => setCourseImportTargetMode(e.target.value as 'selected' | 'all')}
                                    className="w-full p-4 border border-indigo-200 rounded-2xl bg-white outline-none focus:ring-4 focus:ring-indigo-100 transition"
                                >
                                    <option value="selected">Selected Department(s)</option>
                                    <option value="all">All Departments</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-indigo-400">Override Level (Optional)</label>
                                <select
                                    value={courseImportLevelOverride}
                                    onChange={e => setCourseImportLevelOverride(e.target.value)}
                                    className="w-full p-4 border border-indigo-200 rounded-2xl bg-white outline-none focus:ring-4 focus:ring-indigo-100 transition"
                                >
                                    <option value="">Auto-detect from PDF</option>
                                    {LEVELS.map(level => (
                                        <option key={level} value={level}>{level}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {courseImportTargetMode === 'selected' && (
                            <div className="space-y-3">
                                <label className="text-xs font-black uppercase tracking-widest text-indigo-400">Select Departments</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {allDepartments.map((dept) => (
                                        <label key={dept.id} className="flex items-center gap-3 p-3 border border-indigo-100 rounded-xl bg-white cursor-pointer hover:bg-indigo-50 transition shadow-sm">
                                            <input
                                                type="checkbox"
                                                checked={courseImportDepartmentIds.includes(dept.id)}
                                                onChange={() => toggleCourseImportDepartment(dept.id)}
                                                className="w-5 h-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm font-bold text-slate-700 truncate">{dept.department_name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-indigo-400">Upload PDF Forms</label>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="file" multiple accept="application/pdf"
                                    onChange={e => setCourseRegistrationFiles(e.target.files ? Array.from(e.target.files) : [])}
                                    className="flex-1 text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-xs file:font-black file:uppercase file:tracking-widest file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 cursor-pointer"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleGoogleDrivePick(setCourseRegistrationFiles)}
                                    className="px-6 py-3 rounded-xl bg-white text-blue-600 text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition border border-blue-200 flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="" className="w-4 h-4" /> Drive
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            onClick={handleCourseRegistrationImport}
                            disabled={isCourseImportDisabled}
                            className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition disabled:opacity-50 shadow-xl shadow-indigo-600/20"
                        >
                            {isCourseImporting ? 'Processing AI Extraction...' : 'Extract & Register Courses'}
                        </button>
                        {isCourseImporting && <p className="text-sm font-bold text-indigo-600 mt-4 text-center animate-pulse">{courseImportProgress}</p>}
                    </div>
                </div>
            )}

            {/* Manager List Mode */}
            {courseAdminView.mode === 'manager-list' && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-4 gap-4">
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                                {selectedManagerDepartment?.department_name || courseAdminView.departmentId}
                            </p>
                            <h3 className="text-3xl font-black text-slate-900 mt-1">{courseAdminView.level} Courses</h3>
                        </div>
                        {selectedCourses.size > 0 && (
                            <button
                                onClick={() => {
                                    const coursesToDelete = managerCoursesForLevel.filter(c => selectedCourses.has(c.course_id || c.course_name || ''));
                                    handleBatchDeleteCourses(coursesToDelete, false);
                                    setSelectedCourses(new Set());
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 font-bold text-sm rounded-xl hover:bg-red-100 transition-colors shrink-0"
                            >
                                <Trash2 className="w-4 h-4" />
                                Batch Delete ({selectedCourses.size})
                            </button>
                        )}
                    </div>
                    
                    <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6">
                        {managerCoursesForLevel.length ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {managerCoursesForLevel.map((course) => {
                                    const courseRouteIdentifier = getCourseRouteKey(course);
                                    const courseKey = course.course_id || course.course_name || '';
                                    return (
                                        <div
                                            key={courseRouteIdentifier}
                                            onClick={() => handleCourseTabNavigate(buildCourseManagerPath(courseAdminView.departmentId, courseAdminView.level, courseRouteIdentifier))}
                                            className="group flex items-center justify-between gap-4 p-5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 transition cursor-pointer shadow-sm relative"
                                        >
                                            <div 
                                                className="absolute left-4 top-1/2 -translate-y-1/2 cursor-pointer z-10"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedCourses(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(courseKey)) next.delete(courseKey);
                                                        else next.add(courseKey);
                                                        return next;
                                                    });
                                                }}
                                            >
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedCourses.has(courseKey)}
                                                    readOnly
                                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0 pl-6">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-bold text-slate-900 truncate group-hover:text-indigo-700">{course.course_name}</h4>
                                                    {normalizeTextbookUrls(course).length > 0 && (
                                                        <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
                                                    )}
                                                </div>
                                                <p className="text-xs font-semibold text-slate-500">{course.course_code || course.course_id}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${course.semester === 'first' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                    {course.semester === 'first' ? '1st Sem' : '2nd Sem'}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteCourseFromDepartment(course); }}
                                                    className="p-2 rounded-lg text-slate-400 hover:bg-red-100 hover:text-red-600 transition opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-16 text-center">
                                <Folder className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="font-bold text-slate-700">No courses mapped</h3>
                                <p className="text-sm text-slate-500 mt-1">Add courses to this level to see them here.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Manager Detail Mode */}
            {courseAdminView.mode === 'manager-detail' && selectedManagerCourse && (
                <div className="space-y-6 max-w-4xl">
                    <button
                        onClick={() => handleCourseTabNavigate(buildCourseManagerPath(courseAdminView.departmentId, courseAdminView.level))}
                        className="text-xs uppercase tracking-widest font-black text-slate-400 hover:text-indigo-600 transition"
                    >
                        ← Back to Level
                    </button>
                    
                    <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8 space-y-8">
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-indigo-500 mb-1">
                                    {selectedManagerDepartment?.department_name} • {courseAdminView.level}
                                </p>
                                <h2 className="text-3xl font-black text-slate-900 leading-tight">{selectedManagerCourse.course_name}</h2>
                                <p className="font-semibold text-slate-500 mt-1">{selectedManagerCourse.course_code || selectedManagerCourse.course_id}</p>
                            </div>
                            <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase border ${selectedManagerCourse.semester === 'first' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {selectedManagerCourse.semester === 'first' ? '1st Sem' : '2nd Sem'}
                            </span>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-black text-lg text-slate-800 flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-indigo-500" /> Textbook Materials
                            </h4>
                            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <input
                                        type="file" multiple accept="application/pdf"
                                        onChange={e => setCourseDetailFiles(e.target.files ? Array.from(e.target.files) : [])}
                                        className="flex-1 text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-xs file:font-black file:uppercase file:tracking-widest file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 cursor-pointer"
                                    />
                                </div>
                                <label className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={autoSyncToOfferingDepartments}
                                        onChange={e => setAutoSyncToOfferingDepartments(e.target.checked)}
                                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-bold text-slate-700">Auto-sync materials to all departments offering this course</span>
                                </label>
                                <button
                                    disabled={!courseDetailFiles.length || isUploading}
                                    onClick={() => handleTextbookUpload(selectedManagerCourse.course_id || selectedManagerCourse.course_name, courseDetailFiles)}
                                    className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition disabled:opacity-50 shadow-md"
                                >
                                    {isUploading ? 'Uploading...' : 'Upload Materials'}
                                </button>
                                {isUploading && <p className="text-sm font-bold text-indigo-600 text-center animate-pulse">{extractionProgress}</p>}
                            </div>

                            {normalizeTextbookUrls(selectedManagerCourse).length > 0 && (
                                <div className="space-y-3 pt-4">
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Available Materials</p>
                                    <div className="space-y-2">
                                        {normalizeTextbookUrls(selectedManagerCourse).map((url) => (
                                            <a key={url} href={url} target="_blank" rel="noreferrer" className="block p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition truncate">
                                                {url}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-8 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => handleDeleteCourseFromDepartment(selectedManagerCourse, true)}
                                className="px-6 py-3 rounded-xl bg-red-50 text-red-600 font-black uppercase tracking-widest text-xs hover:bg-red-100 transition flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" /> Global Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
