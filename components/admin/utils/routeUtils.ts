export interface SchoolHierarchyRoute {
    level: 1 | 2 | 3 | 4;
    schoolId?: string;
    deptId?: string;
    courseId?: string;
}

export const parseSchoolHierarchyRoute = (pathname: string): SchoolHierarchyRoute => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments[0] !== 'admin' || (segments[1] !== 'schools' && segments[1] !== 'departments')) {
        return { level: 1 };
    }

    const schoolId = segments[2] ? decodeURIComponent(segments[2]) : undefined;
    const deptId = segments[3] ? decodeURIComponent(segments[3]) : undefined;
    const courseId = segments[4] ? decodeURIComponent(segments[4]) : undefined;

    if (!schoolId) {
        return { level: 1 };
    }
    if (!deptId) {
        return { level: 2, schoolId };
    }
    if (!courseId) {
        return { level: 3, schoolId, deptId };
    }
    return { level: 4, schoolId, deptId, courseId };
};

export const buildSchoolHierarchyPath = (schoolId?: string, deptId?: string, courseId?: string): string => {
    if (!schoolId) return '/admin/schools';
    const encSchool = encodeURIComponent(schoolId);
    if (!deptId) return `/admin/schools/${encSchool}`;
    const encDept = encodeURIComponent(deptId);
    if (!courseId) return `/admin/schools/${encSchool}/${encDept}`;
    const encCourse = encodeURIComponent(courseId);
    return `/admin/schools/${encSchool}/${encDept}/${encCourse}`;
};
