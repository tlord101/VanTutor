import React, { useState } from 'react';
import { BookOpen, Folder, Trash2, Plus, Sparkles, Database } from 'lucide-react';
import type { Course, Topic } from '../../../types';
import { useToast } from '../../../hooks/useToast';

interface CourseCatalogViewProps {
    courseAdminView: any;
    handleCourseTabNavigate: (path: string) => void;
    globalSearchQuery: string;
    setGlobalSearchQuery: (val: string) => void;
    courseCatalog: any[];
    allDepartments: any[];
    LEVELS: string[];
    filteredGlobalCourses: any[];
    buildCourseManagerPath: (deptId?: string, level?: string, courseId?: string) => string;
    buildCourseGlobalPath: (level?: string, courseId?: string) => string;
    globalLevelCourses: any[];
    selectedGlobalCourseEntry: any;

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
    handleCourseCSVImport?: (parsedCourses: Course[]) => Promise<void>;
    isCourseImportDisabled: boolean;
    isCourseImporting: boolean;
    courseImportProgress: string;
    managerCoursesForLevel: Course[];
    getCourseRouteKey: (course: Partial<Course>) => string;
    normalizeTextbookUrls: (course: Partial<Course>) => string[];
    handleDeleteCourseFromDepartment: (course: Course, deleteAll?: boolean) => void;
    handleBatchDeleteCourses: (courses: Course[], deleteAll?: boolean) => void;
    handleDeleteCourseTopics: (course: Course, topicIds: string[]) => void;
    handleRemoveDuplicateTopicsForCourse: (course: Course) => void;
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
    courseCatalog, allDepartments, LEVELS, filteredGlobalCourses, buildCourseManagerPath, buildCourseGlobalPath,
    globalLevelCourses, selectedGlobalCourseEntry,
    managerSelectionDepartmentId, setManagerSelectionDepartmentId,
    managerSelectionLevel, setManagerSelectionLevel, buildCourseAddPath,
    handleMergeDuplicateCoursesAcrossDepartments, courseImportTargetMode,
    setCourseImportTargetMode, courseImportLevelOverride, setCourseImportLevelOverride,
    courseImportDepartmentIds, toggleCourseImportDepartment, courseImportSessionOverride,
    setCourseImportSessionOverride, setCourseRegistrationFiles, handleGoogleDrivePick,
    handleCourseRegistrationImport, handleCourseCSVImport, isCourseImportDisabled, isCourseImporting,
    courseImportProgress, managerCoursesForLevel, getCourseRouteKey,
    normalizeTextbookUrls, handleDeleteCourseFromDepartment, handleBatchDeleteCourses, handleDeleteCourseTopics, handleRemoveDuplicateTopicsForCourse, selectedManagerDepartment,
    selectedManagerCourse, setCourseDetailFiles, courseDetailFiles,
    autoSyncToOfferingDepartments, setAutoSyncToOfferingDepartments,
    isUploading, extractionProgress, handleTextbookUpload
}) => {
    const { addToast } = useToast();
    const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
    
    // Filters
    const [selectedFilterSchoolId, setSelectedFilterSchoolId] = useState<string>('');
    const [selectedFilterCollegeId, setSelectedFilterCollegeId] = useState<string>('');
    const [selectedGlobalSchoolId, setSelectedGlobalSchoolId] = useState<string>('');
    const [selectedGlobalLevel, setSelectedGlobalLevel] = useState<string>('');
    const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);

    // Derived unique lists for filters
    const uniqueSchools = Array.from(new Set(allDepartments.map(d => d.schoolId))).map(sId => {
        const d = allDepartments.find(dept => dept.schoolId === sId);
        return { id: sId, name: d?.schoolName || sId };
    });

    const uniqueColleges = Array.from(new Set(
        allDepartments
            .filter(d => !selectedFilterSchoolId || d.schoolId === selectedFilterSchoolId)
            .map(d => d.collegeId)
    )).map(cId => {
        const d = allDepartments.find(dept => dept.collegeId === cId);
        return { id: cId, name: d?.collegeName || cId };
    });

    const filteredDepartments = allDepartments.filter(dept => {
        if (selectedFilterSchoolId && dept.schoolId !== selectedFilterSchoolId) return false;
        if (selectedFilterCollegeId && dept.collegeId !== selectedFilterCollegeId) return false;
        return true;
    });

    const uniqueGlobalSchools = Array.from(new Set(allDepartments.map(d => d.schoolId))).map(sId => {
        const d = allDepartments.find(dept => dept.schoolId === sId);
        return { id: sId, name: d?.schoolName || sId };
    });

    const uniqueGlobalLevels = Array.from(new Set(courseCatalog.map(entry => entry.course?.level).filter(Boolean))).sort();

    // CSV Parse State
    const [csvFile, setCsvFile] = useState<File | null>(null);

    const parseAndImportCSV = async () => {
        if (!csvFile || !handleCourseCSVImport) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) return;
            try {
                const lines = text.split('\n');
                const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
                
                const codeIdx = headers.indexOf('course_code');
                const titleIdx = headers.indexOf('course_name') > -1 ? headers.indexOf('course_name') : headers.indexOf('title');
                const unitIdx = headers.indexOf('course_unit') > -1 ? headers.indexOf('course_unit') : headers.indexOf('unit');
                const statusIdx = headers.indexOf('course_status') > -1 ? headers.indexOf('course_status') : headers.indexOf('status');
                const semIdx = headers.indexOf('semester');
                const levelIdx = headers.indexOf('level');

                if (codeIdx === -1 || titleIdx === -1) {
                    addToast("CSV must contain 'course_code' and 'course_name' columns.", "error");
                    return;
                }

                const courses: Course[] = [];
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    // Simple CSV row parser to handle quoted strings
                    const cols: string[] = [];
                    let inQuotes = false;
                    let curCol = '';
                    for (let j = 0; j < line.length; j++) {
                        const char = line[j];
                        if (char === '"') inQuotes = !inQuotes;
                        else if (char === ',' && !inQuotes) {
                            cols.push(curCol);
                            curCol = '';
                        } else curCol += char;
                    }
                    cols.push(curCol);

                    const code = cols[codeIdx]?.replace(/^"|"$/g, '').trim();
                    const name = cols[titleIdx]?.replace(/^"|"$/g, '').trim();
                    
                    if (!code || !name) continue;

                    courses.push({
                        course_id: code.toLowerCase().replace(/\s+/g, '_'),
                        course_code: code,
                        course_name: name,
                        course_unit: unitIdx > -1 && cols[unitIdx] ? parseInt(cols[unitIdx].replace(/^"|"$/g, '').trim(), 10) : undefined,
                        course_status: statusIdx > -1 && cols[statusIdx] ? cols[statusIdx].replace(/^"|"$/g, '').trim() : undefined,
                        semester: semIdx > -1 && cols[semIdx] && cols[semIdx].toLowerCase().includes('second') ? 'second' : 'first',
                        level: levelIdx > -1 && cols[levelIdx] ? cols[levelIdx].replace(/^"|"$/g, '').trim() : undefined,
                    } as Course);
                }

                if (courses.length === 0) {
                    addToast("No valid courses found in CSV.", "error");
                    return;
                }

                await handleCourseCSVImport(courses);
                setCsvFile(null); // Clear after successful import
            } catch (err: any) {
                addToast("Error parsing CSV: " + err.message, "error");
            }
        };
        reader.readAsText(csvFile);
    };

    // Pagination for Global Search
    const [globalCurrentPage, setGlobalCurrentPage] = useState(1);
    const globalCoursesPerPage = 20;

    React.useEffect(() => {
        setGlobalCurrentPage(1);
    }, [globalSearchQuery]);

    React.useEffect(() => {
        setGlobalCurrentPage(1);
    }, [selectedGlobalSchoolId, selectedGlobalLevel]);

    React.useEffect(() => {
        setSelectedTopicIds([]);
    }, [selectedGlobalCourseEntry?.course?.course_id, selectedGlobalCourseEntry?.course?.course_name, selectedGlobalCourseEntry?.course?.topics?.length]);

    const globalDirectoryCourses = React.useMemo(() => {
        const query = globalSearchQuery.trim().toLowerCase();
        return (courseCatalog.length ? courseCatalog : filteredGlobalCourses).filter(({ course, departmentIds }) => {
            if (selectedGlobalLevel && course.level !== selectedGlobalLevel) return false;

            if (selectedGlobalSchoolId) {
                const belongsToSchool = departmentIds.some((departmentId: string) => {
                    const dept = allDepartments.find(d => d.id === departmentId);
                    return dept?.schoolId === selectedGlobalSchoolId;
                });
                if (!belongsToSchool) return false;
            }

            if (!query) return true;

            const departmentNames = departmentIds
                .map((id: string) => allDepartments.find((dept) => dept.id === id)?.department_name || id)
                .join(' ');

            return [
                course.course_name,
                course.course_code,
                course.course_id,
                course.level,
                course.semester,
                departmentNames,
            ].some((value) => (value || '').toString().toLowerCase().includes(query));
        });
    }, [allDepartments, courseCatalog, filteredGlobalCourses, globalSearchQuery, selectedGlobalLevel, selectedGlobalSchoolId]);

    const globalTotalPages = Math.ceil(globalDirectoryCourses.length / globalCoursesPerPage);
    const globalStartIndex = (globalCurrentPage - 1) * globalCoursesPerPage;
    const paginatedGlobalCourses = globalDirectoryCourses.slice(globalStartIndex, globalStartIndex + globalCoursesPerPage);

    const selectedGlobalTopics: Topic[] = Array.isArray(selectedGlobalCourseEntry?.course?.topics)
        ? selectedGlobalCourseEntry.course.topics
        : [];

    const toggleGlobalTopicSelection = (topicId: string) => {
        setSelectedTopicIds(prev => (
            prev.includes(topicId)
                ? prev.filter(id => id !== topicId)
                : [...prev, topicId]
        ));
    };

    const toggleSelectAllTopics = () => {
        if (!selectedGlobalTopics.length) return;
        if (selectedTopicIds.length === selectedGlobalTopics.length) {
            setSelectedTopicIds([]);
            return;
        }
        setSelectedTopicIds(selectedGlobalTopics.map(topic => topic.topic_id));
    };

    return (
        <div className="space-y-6">
            {/* Navigation Header */}
            <div className="flex gap-4 border-b border-slate-200">
                <button 
                    onClick={() => handleCourseTabNavigate('/admin/courses/global')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${courseAdminView.mode.startsWith('global') ? 'border-indigo-500  dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Database className="w-4 h-4" />
                    Global Search
                </button>
                <button 
                    onClick={() => handleCourseTabNavigate('/admin/courses/manager')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${courseAdminView.mode.startsWith('manager') ? 'border-indigo-500  dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Folder className="w-4 h-4" />
                    Department Manager
                </button>
                <button 
                    onClick={() => handleCourseTabNavigate(buildCourseAddPath(managerSelectionDepartmentId || undefined, managerSelectionLevel || undefined))}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${courseAdminView.mode === 'add' ? 'border-indigo-500  dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Plus className="w-4 h-4" />
                    Add Courses
                </button>
            </div>

            {/* Global Search Root Mode */}
            {courseAdminView.mode === 'global' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h3 className="font-black text-xl dark:text-white mb-1">Global Course Directory</h3>
                                <p className="text-sm text-slate-500">Filter by school, level, and search text, then open any course to manage its topics.</p>
                            </div>
                            <div className="grid w-full gap-3 sm:max-w-3xl sm:grid-cols-3">
                                <select
                                    value={selectedGlobalSchoolId}
                                    onChange={e => setSelectedGlobalSchoolId(e.target.value)}
                                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 transition"
                                >
                                    <option value="">All Schools</option>
                                    {uniqueGlobalSchools.map(school => (
                                        <option key={school.id} value={school.id}>{school.name}</option>
                                    ))}
                                </select>
                                <select
                                    value={selectedGlobalLevel}
                                    onChange={e => setSelectedGlobalLevel(e.target.value)}
                                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 transition"
                                >
                                    <option value="">All Levels</option>
                                    {uniqueGlobalLevels.map(level => (
                                        <option key={level} value={level}>{level}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    placeholder="Search courses..."
                                    value={globalSearchQuery}
                                    onChange={e => setGlobalSearchQuery(e.target.value)}
                                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-4 focus:ring-indigo-100 transition"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-bold text-slate-500">
                                Found {globalDirectoryCourses.length} course{globalDirectoryCourses.length === 1 ? '' : 's'} matching the current filters.
                            </p>
                            {selectedCourses.size > 0 && (
                                <button
                                    onClick={() => {
                                        const coursesToDelete = globalDirectoryCourses.filter(c => selectedCourses.has(c.course.course_id || c.course.course_name || ''));
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

                        {paginatedGlobalCourses.length ? (
                            <div className="space-y-4">
                                {paginatedGlobalCourses.map(({ course, departmentIds }) => {
                                    const courseRouteIdentifier = getCourseRouteKey(course);
                                    const courseKey = course.course_id || course.course_name || '';
                                    return (
                                        <div
                                            key={courseRouteIdentifier}
                                            onClick={() => handleCourseTabNavigate(buildCourseGlobalPath(selectedGlobalLevel || course.level, courseRouteIdentifier))}
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
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-bold dark:text-white truncate group-hover:text-indigo-700">{course.course_name}</h4>
                                                    {normalizeTextbookUrls(course).length > 0 && (
                                                        <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
                                                    )}
                                                </div>
                                                <p className="text-xs font-semibold text-slate-500">{course.course_code || course.course_id}</p>
                                                <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-black">
                                                    Offered in {departmentIds.length} department{departmentIds.length === 1 ? '' : 's'}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${course.semester === 'first' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                    {course.semester === 'first' ? '1st Sem' : '2nd Sem'}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleCourseTabNavigate(buildCourseGlobalPath(selectedGlobalLevel || course.level, courseRouteIdentifier)); }}
                                                    className="p-2 rounded-lg text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 transition opacity-0 group-hover:opacity-100"
                                                    title="Open course"
                                                >
                                                    <Database className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {globalTotalPages > 1 && (
                                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                                        <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                                            Showing {globalStartIndex + 1} to {Math.min(globalStartIndex + globalCoursesPerPage, globalDirectoryCourses.length)} of {globalDirectoryCourses.length}
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setGlobalCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={globalCurrentPage === 1}
                                                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition"
                                            >
                                                Previous
                                            </button>
                                            <span className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg">
                                                Page {globalCurrentPage} of {globalTotalPages}
                                            </span>
                                            <button
                                                onClick={() => setGlobalCurrentPage(p => Math.min(globalTotalPages, p + 1))}
                                                disabled={globalCurrentPage === globalTotalPages}
                                                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-16 text-center">
                                <Database className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="font-bold text-slate-700">No courses found</h3>
                                <p className="text-sm text-slate-500 mt-1">Try a different school, level, or search term.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Global List Mode */}
            {courseAdminView.mode === 'global-list' && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-4 gap-4">
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                                Global Aggregation
                            </p>
                            <h3 className="text-3xl font-black  dark:text-white mt-1">{courseAdminView.level} Courses</h3>
                        </div>
                        {selectedCourses.size > 0 && (
                            <button
                                onClick={() => {
                                    const coursesToDelete = globalLevelCourses.filter(c => selectedCourses.has(c.course.course_id || c.course.course_name || ''));
                                    handleBatchDeleteCourses(coursesToDelete.map(c => c.course), true);
                                    setSelectedCourses(new Set());
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 font-bold text-sm rounded-xl hover:bg-red-100 transition-colors shrink-0"
                            >
                                <Trash2 className="w-4 h-4" />
                                Global Batch Delete ({selectedCourses.size})
                            </button>
                        )}
                    </div>
                    
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                        {globalLevelCourses.length ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {globalLevelCourses.map(({ course, departmentIds, key }) => {
                                    const courseRouteIdentifier = getCourseRouteKey(course);
                                    const courseKey = course.course_id || course.course_name || '';
                                    return (
                                        <div
                                            key={key}
                                            onClick={() => handleCourseTabNavigate(buildCourseGlobalPath(courseAdminView.level, courseRouteIdentifier))}
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
                                                    <h4 className="font-bold  dark:text-white truncate group-hover:text-indigo-700">{course.course_name}</h4>
                                                    {normalizeTextbookUrls(course).length > 0 && (
                                                        <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
                                                    )}
                                                </div>
                                                <p className="text-xs font-semibold text-slate-500">{course.course_code || course.course_id}</p>
                                                <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-black">
                                                    Offered in {departmentIds.length} department(s)
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${course.semester === 'first' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                    {course.semester === 'first' ? '1st Sem' : '2nd Sem'}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteCourseFromDepartment(course, true); }}
                                                    className="p-2 rounded-lg text-slate-400 hover:bg-red-100 hover:text-red-600 transition opacity-0 group-hover:opacity-100"
                                                    title="Global Delete"
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
                                <Database className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="font-bold text-slate-700">No courses globally</h3>
                                <p className="text-sm text-slate-500 mt-1">There are no courses mapped to this level.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Global Detail Mode */}
            {courseAdminView.mode === 'global-detail' && selectedGlobalCourseEntry && (
                <div className="space-y-6 max-w-4xl">
                    <button
                        onClick={() => handleCourseTabNavigate(buildCourseGlobalPath(courseAdminView.level))}
                        className="text-xs uppercase tracking-widest font-black text-slate-400 hover:text-indigo-600 transition"
                    >
                        ← Back to Global Level
                    </button>
                    
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8">
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-indigo-500 mb-1">
                                    Global Context • {courseAdminView.level}
                                </p>
                                <h2 className="text-3xl font-black  dark:text-white leading-tight">{selectedGlobalCourseEntry.course.course_name}</h2>
                                <p className="font-semibold text-slate-500 mt-1">{selectedGlobalCourseEntry.course.course_code || selectedGlobalCourseEntry.course.course_id}</p>
                                <p className="text-xs text-slate-400 mt-2">Shared across {selectedGlobalCourseEntry.departmentIds.length} department(s)</p>
                            </div>
                            <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase border ${selectedGlobalCourseEntry.course.semester === 'first' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {selectedGlobalCourseEntry.course.semester === 'first' ? '1st Sem' : '2nd Sem'}
                            </span>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-black text-lg  dark:text-white flex items-center gap-2">
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
                                    <span className="text-sm font-bold text-slate-700">Auto-sync materials to all {selectedGlobalCourseEntry.departmentIds.length} departments offering this course</span>
                                </label>
                                <button
                                    disabled={!courseDetailFiles.length || isUploading}
                                    onClick={() => handleTextbookUpload(selectedGlobalCourseEntry.course.course_id || selectedGlobalCourseEntry.course.course_name, courseDetailFiles)}
                                    className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition disabled:opacity-50 shadow-md"
                                >
                                    {isUploading ? 'Uploading...' : 'Upload Materials Globally'}
                                </button>
                                {isUploading && <p className="text-sm font-bold text-indigo-600 text-center animate-pulse">{extractionProgress}</p>}
                            </div>

                            {normalizeTextbookUrls(selectedGlobalCourseEntry.course).length > 0 && (
                                <div className="space-y-3 pt-4">
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Available Materials</p>
                                    <div className="space-y-2">
                                        {normalizeTextbookUrls(selectedGlobalCourseEntry.course).map((url) => (
                                            <a key={url} href={url} target="_blank" rel="noreferrer" className="block p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition truncate">
                                                {url}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <h4 className="font-black text-lg dark:text-white flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-indigo-500" /> Topics
                                </h4>
                                {selectedGlobalTopics.length > 0 && (
                                    <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                        <input
                                            type="checkbox"
                                            checked={selectedTopicIds.length > 0 && selectedTopicIds.length === selectedGlobalTopics.length}
                                            onChange={toggleSelectAllTopics}
                                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        Select all
                                    </label>
                                )}
                            </div>

                            {selectedGlobalTopics.length > 0 ? (
                                <div className="space-y-3">
                                    {selectedGlobalTopics.map((topic) => {
                                        const isSelected = selectedTopicIds.includes(topic.topic_id);
                                        return (
                                            <label
                                                key={topic.topic_id}
                                                className={`flex items-start gap-3 p-4 rounded-2xl border transition cursor-pointer ${isSelected ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200 hover:border-indigo-200'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleGlobalTopicSelection(topic.topic_id)}
                                                    className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <p className="font-bold text-slate-800 truncate">{topic.topic_name}</p>
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{topic.topic_id}</span>
                                                    </div>
                                                    {(topic.topic_context || topic.start_point || topic.end_point) && (
                                                        <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                                                            {topic.topic_context || [topic.start_point, topic.end_point].filter(Boolean).join(' - ')}
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}

                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                            {selectedTopicIds.length} topic{selectedTopicIds.length === 1 ? '' : 's'} selected
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => handleRemoveDuplicateTopicsForCourse(selectedGlobalCourseEntry.course)}
                                                className="px-4 py-3 rounded-xl bg-amber-50 text-amber-700 font-black uppercase tracking-widest text-xs hover:bg-amber-100 transition flex items-center gap-2"
                                            >
                                                <Sparkles className="w-4 h-4" /> Remove Duplicate Topics
                                            </button>
                                            <button
                                                disabled={!selectedTopicIds.length}
                                                onClick={() => handleDeleteCourseTopics(selectedGlobalCourseEntry.course, selectedTopicIds)}
                                                className="px-5 py-3 rounded-xl bg-red-50 text-red-600 font-black uppercase tracking-widest text-xs hover:bg-red-100 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Trash2 className="w-4 h-4" /> Delete Selected Topics
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 text-sm text-slate-500">
                                    No topics are attached to this course yet.
                                </div>
                            )}
                        </div>

                        <div className="pt-8 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => handleDeleteCourseFromDepartment(selectedGlobalCourseEntry.course, true)}
                                className="px-6 py-3 rounded-xl bg-red-50 text-red-600 font-black uppercase tracking-widest text-xs hover:bg-red-100 transition flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" /> Global Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manager Root */}
            {courseAdminView.mode === 'manager-root' && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 max-w-3xl mx-auto text-center space-y-6">
                    <Folder className="w-16 h-16 text-indigo-200 mx-auto" />
                    <div>
                        <h3 className="font-black text-2xl  dark:text-white mb-2">Department Manager</h3>
                        <p className="text-slate-500">Select a department and level to manage its courses.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                        <select
                            value={selectedFilterSchoolId}
                            onChange={e => {
                                setSelectedFilterSchoolId(e.target.value);
                                setSelectedFilterCollegeId('');
                                setManagerSelectionDepartmentId('');
                            }}
                            className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition"
                        >
                            <option value="">All Schools</option>
                            {uniqueSchools.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <select
                            value={selectedFilterCollegeId}
                            onChange={e => {
                                setSelectedFilterCollegeId(e.target.value);
                                setManagerSelectionDepartmentId('');
                            }}
                            className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition"
                            disabled={!selectedFilterSchoolId && uniqueColleges.length > 50}
                        >
                            <option value="">All Colleges</option>
                            {uniqueColleges.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                        <select
                            value={managerSelectionDepartmentId}
                            onChange={e => setManagerSelectionDepartmentId(e.target.value)}
                            className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition"
                        >
                            <option value="">Select Department ({filteredDepartments.length})</option>
                            {filteredDepartments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                            ))}
                        </select>
                        <select
                            value={managerSelectionLevel}
                            onChange={e => setManagerSelectionLevel(e.target.value)}
                            className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition"
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
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8 max-w-4xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-black text-xl  dark:text-white flex items-center gap-2">
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
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-indigo-100/50 p-4 rounded-xl border border-indigo-100">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black uppercase tracking-widest text-indigo-500">Filter by School</label>
                                        <select
                                            value={selectedFilterSchoolId}
                                            onChange={e => {
                                                setSelectedFilterSchoolId(e.target.value);
                                                setSelectedFilterCollegeId('');
                                            }}
                                            className="w-full p-3 border border-indigo-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-300 text-sm"
                                        >
                                            <option value="">All Schools</option>
                                            {uniqueSchools.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black uppercase tracking-widest text-indigo-500">Filter by College</label>
                                        <select
                                            value={selectedFilterCollegeId}
                                            onChange={e => setSelectedFilterCollegeId(e.target.value)}
                                            className="w-full p-3 border border-indigo-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-300 text-sm"
                                            disabled={!selectedFilterSchoolId && uniqueColleges.length > 50}
                                        >
                                            <option value="">All Colleges</option>
                                            {uniqueColleges.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <label className="text-xs font-black uppercase tracking-widest text-indigo-400">Select Departments ({filteredDepartments.length})</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                                    {filteredDepartments.map((dept) => (
                                        <label key={dept.id} className="flex items-center gap-3 p-3 border border-indigo-100 rounded-xl bg-white cursor-pointer hover:bg-indigo-50 transition shadow-sm">
                                            <input
                                                type="checkbox"
                                                checked={courseImportDepartmentIds.includes(dept.id)}
                                                onChange={() => toggleCourseImportDepartment(dept.id)}
                                                className="w-5 h-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm font-bold text-slate-700 truncate" title={dept.department_name}>{dept.department_name}</span>
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

                    <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <button
                                onClick={handleCourseRegistrationImport}
                                disabled={isCourseImportDisabled}
                                className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition disabled:opacity-50 shadow-xl shadow-indigo-600/20"
                            >
                                {isCourseImporting ? 'Processing AI...' : 'Extract from PDFs'}
                            </button>
                            <p className="text-[10px] text-slate-400 text-center uppercase font-bold tracking-widest">Powered by Gemini AI</p>
                        </div>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <input
                                    type="file" accept=".csv"
                                    onChange={e => setCsvFile(e.target.files ? e.target.files[0] : null)}
                                    className="flex-1 text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-xs file:font-black file:uppercase file:tracking-widest file:bg-emerald-100 file:text-emerald-700 hover:file:bg-emerald-200 cursor-pointer border border-emerald-100 rounded-2xl p-0.5"
                                />
                                <button
                                    onClick={parseAndImportCSV}
                                    disabled={!csvFile || isCourseImportDisabled}
                                    className="px-6 py-3 rounded-2xl bg-emerald-600 text-white font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition disabled:opacity-50 shadow-xl shadow-emerald-600/20 whitespace-nowrap"
                                >
                                    Import CSV
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-400 text-center font-bold tracking-widest">
                                Required Columns: course_code, course_name
                            </p>
                        </div>
                    </div>
                    {isCourseImporting && <p className="text-sm font-bold text-indigo-600 mt-4 text-center animate-pulse">{courseImportProgress}</p>}
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
                            <h3 className="text-3xl font-black  dark:text-white mt-1">{courseAdminView.level} Courses</h3>
                        </div>
                        {managerCoursesForLevel.length > 0 && (
                            <button
                                onClick={() => {
                                    const headers = ["course_code", "course_name", "course_unit", "course_status", "semester", "level"];
                                    const rows = managerCoursesForLevel.map(c => {
                                        const code = c.course_code || "";
                                        const name = `"${(c.course_name || "").replace(/"/g, '""')}"`;
                                        const unit = c.course_unit || "";
                                        const status = c.course_status || "";
                                        const semester = c.semester || "";
                                        const level = c.level || courseAdminView.level || "";
                                        return [code, name, unit, status, semester, level].join(",");
                                    });
                                    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.join("\n");
                                    const encodedUri = encodeURI(csvContent);
                                    const link = document.createElement("a");
                                    link.setAttribute("href", encodedUri);
                                    link.setAttribute("download", `${selectedManagerDepartment?.department_name || 'department'}_${courseAdminView.level}_courses.csv`);
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 font-bold text-sm rounded-xl hover:bg-green-100 transition-colors shrink-0"
                            >
                                <Database className="w-4 h-4" />
                                Export CSV
                            </button>
                        )}
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
                    
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
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
                                                    <h4 className="font-bold  dark:text-white truncate group-hover:text-indigo-700">{course.course_name}</h4>
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
                    
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8">
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-indigo-500 mb-1">
                                    {selectedManagerDepartment?.department_name} • {courseAdminView.level}
                                </p>
                                <h2 className="text-3xl font-black  dark:text-white leading-tight">{selectedManagerCourse.course_name}</h2>
                                <p className="font-semibold text-slate-500 mt-1">{selectedManagerCourse.course_code || selectedManagerCourse.course_id}</p>
                            </div>
                            <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase border ${selectedManagerCourse.semester === 'first' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {selectedManagerCourse.semester === 'first' ? '1st Sem' : '2nd Sem'}
                            </span>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-black text-lg  dark:text-white flex items-center gap-2">
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

                        <div className="pt-8 border-t border-slate-100 flex flex-wrap justify-end gap-3">
                            <button
                                onClick={() => handleRemoveDuplicateTopicsForCourse(selectedManagerCourse)}
                                className="px-6 py-3 rounded-xl bg-amber-50 text-amber-700 font-black uppercase tracking-widest text-xs hover:bg-amber-100 transition flex items-center gap-2"
                            >
                                <Sparkles className="w-4 h-4" /> Remove Duplicate Topics
                            </button>
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
