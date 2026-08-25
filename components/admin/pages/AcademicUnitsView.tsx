import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { ref as dbRef, get } from 'firebase/database';
import { useToast } from '../../../hooks/useToast';
import { parseSchoolHierarchyRoute } from '../utils/routeUtils';
import { Level1SchoolsHub } from './hierarchy/Level1SchoolsHub';
import { Level1_5CollegesHub } from './hierarchy/Level1_5CollegesHub';
import { Level2DepartmentManager } from './hierarchy/Level2DepartmentManager';
import { Level3CourseCatalog } from './hierarchy/Level3CourseCatalog';
import { Level4CourseStudio } from './hierarchy/Level4CourseStudio';

interface AcademicUnitsViewProps {
    pathname?: string;
    onNavigate?: (path: string) => void;
}

export const AcademicUnitsView: React.FC<AcademicUnitsViewProps> = ({
    pathname = '/admin/schools',
    onNavigate = () => {},
}) => {
    const { addToast } = useToast();

    // Data State
    const [schoolsData, setSchoolsData] = useState<Record<string, any>>({});
    const [allDepartments, setAllDepartments] = useState<any[]>([]);

    const route = parseSchoolHierarchyRoute(pathname);

    const fetchDepartments = async () => {
        try {
            const snap = await get(dbRef(db, 'schools_data'));
            if (snap.exists()) {
                const data = snap.val();
                setSchoolsData(data);
                const flatDepts: any[] = [];
                Object.keys(data).forEach((sId) => {
                    const school = data[sId];
                    if (school.colleges) {
                        Object.keys(school.colleges).forEach((cId) => {
                            const college = school.colleges[cId];
                            if (college.departments) {
                                Object.keys(college.departments).forEach((dId) => {
                                    const dept = college.departments[dId];
                                    flatDepts.push({
                                        id: dId,
                                        schoolId: sId,
                                        schoolName: school.name || sId,
                                        collegeId: cId,
                                        collegeName: college.name || cId,
                                        department_name: dept.name,
                                        levels: Array.isArray(dept.levels) ? dept.levels : Object.keys(dept.levels || {}),
                                    });
                                });
                            }
                        });
                    }
                });

                const oldSnap = await get(dbRef(db, 'departments_data'));
                if (oldSnap.exists()) {
                    const oldData = oldSnap.val();
                    flatDepts.forEach((dept) => {
                        if (oldData[dept.id] && oldData[dept.id].course_list) {
                            dept.course_list = oldData[dept.id].course_list;
                        }
                    });
                }

                setAllDepartments(flatDepts);
            } else {
                setSchoolsData({});
                setAllDepartments([]);
            }
        } catch (error) {
            console.error('Error fetching schools data:', error);
            addToast('Failed to load hierarchy data.', 'error');
        }
    };

    useEffect(() => {
        void fetchDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="space-y-8">
            {/* Level Specific Hierarchy Views */}
            {route.level === 1 && (
                <Level1SchoolsHub
                    schoolsData={schoolsData}
                    allDepartments={allDepartments}
                    onNavigate={onNavigate}
                    refreshData={fetchDepartments}
                />
            )}

            {route.level === 1.5 && route.schoolId && (
                <Level1_5CollegesHub
                    schoolId={route.schoolId}
                    schoolsData={schoolsData}
                    allDepartments={allDepartments}
                    onNavigate={onNavigate}
                    refreshData={fetchDepartments}
                />
            )}

            {route.level === 2 && route.schoolId && (
                <Level2DepartmentManager
                    schoolId={route.schoolId}
                    collegeId={route.collegeId}
                    schoolsData={schoolsData}
                    allDepartments={allDepartments}
                    onNavigate={onNavigate}
                    refreshData={fetchDepartments}
                />
            )}

            {route.level === 3 && route.schoolId && route.deptId && (
                <Level3CourseCatalog
                    schoolId={route.schoolId}
                    deptId={route.deptId}
                    schoolsData={schoolsData}
                    allDepartments={allDepartments}
                    onNavigate={onNavigate}
                    refreshData={fetchDepartments}
                />
            )}

            {route.level === 4 && route.schoolId && route.deptId && route.courseId && (
                <Level4CourseStudio
                    schoolId={route.schoolId}
                    deptId={route.deptId}
                    courseId={route.courseId}
                    schoolsData={schoolsData}
                    allDepartments={allDepartments}
                    onNavigate={onNavigate}
                    refreshData={fetchDepartments}
                />
            )}
        </div>
    );
};
