export interface SchoolHierarchyRoute {
    level: 1 | 1.5 | 2 | 3 | 4;
    schoolId?: string;
    collegeId?: string;
    deptId?: string;
    courseId?: string;
}

export const parseSchoolHierarchyRoute = (pathname: string): SchoolHierarchyRoute => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments[0] !== 'admin' || (segments[1] !== 'schools' && segments[1] !== 'departments')) {
        return { level: 1 };
    }

    const schoolId = segments[2] ? decodeURIComponent(segments[2]) : undefined;
    const secondParam = segments[3] ? decodeURIComponent(segments[3]) : undefined;
    const thirdParam = segments[4] ? decodeURIComponent(segments[4]) : undefined;
    const fourthParam = segments[5] ? decodeURIComponent(segments[5]) : undefined;

    if (!schoolId) {
        return { level: 1 };
    }

    if (!secondParam) {
        return { level: 1.5, schoolId };
    }

    // Determine if secondParam is a collegeId or a deptId
    // If fourthParam exists, it's /admin/schools/[schoolId]/[collegeId]/[deptId]/[courseId] -> Level 4
    if (fourthParam) {
        return {
            level: 4,
            schoolId,
            collegeId: secondParam,
            deptId: thirdParam,
            courseId: fourthParam,
        };
    }

    // If thirdParam exists, it's /admin/schools/[schoolId]/[collegeId]/[deptId] -> Level 3
    if (thirdParam) {
        return {
            level: 3,
            schoolId,
            collegeId: secondParam,
            deptId: thirdParam,
        };
    }

    // If only secondParam exists:
    // It's /admin/schools/[schoolId]/[collegeId] -> Level 2 (Departments in College)
    return {
        level: 2,
        schoolId,
        collegeId: secondParam,
    };
};

export const buildSchoolHierarchyPath = (
    schoolId?: string,
    collegeId?: string,
    deptId?: string,
    courseId?: string
): string => {
    if (!schoolId) return '/admin/schools';
    const encSchool = encodeURIComponent(schoolId);
    if (!collegeId) return `/admin/schools/${encSchool}`;
    const encCollege = encodeURIComponent(collegeId);
    if (!deptId) return `/admin/schools/${encSchool}/${encCollege}`;
    const encDept = encodeURIComponent(deptId);
    if (!courseId) return `/admin/schools/${encSchool}/${encCollege}/${encDept}`;
    const encCourse = encodeURIComponent(courseId);
    return `/admin/schools/${encSchool}/${encCollege}/${encDept}/${encCourse}`;
};
