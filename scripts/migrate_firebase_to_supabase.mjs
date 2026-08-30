import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://eywpksapztzbnthlgfhd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5d3Brc2FwenR6Ym50aGxnZmhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODAyNzkzNiwiZXhwIjoyMTAzNjAzOTM2fQ.nFcGWEvj9H0MTlksKR48ldaK3_q9yGsZkeo6WMsuZZ4';

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EXPORT_FILE_PATH = 'C:/Users/Hp/Downloads/tlord-1ab38-default-rtdb-export.json';

async function migrateData() {
  console.log('====================================================');
  console.log('STARTING FIREBASE RTDB -> SUPABASE DATA MIGRATION');
  console.log('====================================================');

  if (!fs.existsSync(EXPORT_FILE_PATH)) {
    console.error(`Export file not found at: ${EXPORT_FILE_PATH}`);
    return;
  }

  const raw = fs.readFileSync(EXPORT_FILE_PATH, 'utf8');
  const data = JSON.parse(raw);
  console.log('Firebase export loaded successfully.');

  // ── 1. Migrate Schools ───────────────────────────────────────────────────
  console.log('\n--- 1. Migrating Schools & Colleges ---');
  const schools = [];
  const colleges = [];

  const schoolsData = data.schools_data || {};
  for (const [schoolKey, schoolVal] of Object.entries(schoolsData)) {
    if (!schoolVal) continue;
    const schoolId = schoolKey.toLowerCase().trim();
    schools.push({
      id: schoolId,
      name: schoolVal.name || schoolVal.school_name || schoolKey.toUpperCase(),
      short_name: schoolVal.short_name || schoolKey.toUpperCase(),
      state: schoolVal.state || 'Delta',
      country: schoolVal.country || 'Nigeria',
    });

    if (schoolVal.colleges && typeof schoolVal.colleges === 'object') {
      for (const [collegeKey, collegeVal] of Object.entries(schoolVal.colleges)) {
        if (!collegeVal) continue;
        colleges.push({
          id: collegeKey.toLowerCase().trim(),
          school_id: schoolId,
          name: typeof collegeVal === 'string' ? collegeVal : (collegeVal.name || collegeKey),
          short_name: collegeKey.replace(/_/g, ' ').toUpperCase(),
        });
      }
    }
  }

  // Ensure default school exists
  if (schools.length === 0) {
    schools.push({
      id: 'fupre',
      name: 'Federal University of Petroleum Resources Effurun',
      short_name: 'FUPRE',
      state: 'Delta',
      country: 'Nigeria',
    });
  }

  for (const s of schools) {
    const { error } = await adminClient.from('schools').upsert(s);
    if (error) console.error(`Error migrating school ${s.id}:`, error.message);
  }
  console.log(`✓ Migrated ${schools.length} schools.`);

  for (const c of colleges) {
    const { error } = await adminClient.from('colleges').upsert(c);
    if (error) console.error(`Error migrating college ${c.id}:`, error.message);
  }
  console.log(`✓ Migrated ${colleges.length} colleges.`);

  // ── 2. Migrate Departments ───────────────────────────────────────────────
  console.log('\n--- 2. Migrating Departments ---');
  const departments = [];
  const departmentsData = data.departments_data || {};

  for (const [deptKey, deptVal] of Object.entries(departmentsData)) {
    if (!deptVal) continue;
    const deptId = deptKey.toLowerCase().trim();
    departments.push({
      id: deptId,
      school_id: deptVal.school_id || 'fupre',
      college_id: deptVal.college_id || null,
      name: deptVal.department_name || deptVal.name || deptKey.replace(/_/g, ' ').trim(),
      short_name: deptKey.replace(/_/g, '').toUpperCase(),
    });
  }

  for (const d of departments) {
    const { error } = await adminClient.from('departments').upsert(d);
    if (error) console.error(`Error migrating department ${d.id}:`, error.message);
  }
  console.log(`✓ Migrated ${departments.length} departments.`);

  // ── 3. Migrate Courses & Topics ──────────────────────────────────────────
  console.log('\n--- 3. Migrating Courses & Topics ---');
  const coursesMap = new Map();
  const topicsList = [];

  // A. From global_courses
  const globalCourses = data.global_courses || {};
  for (const [courseKey, cVal] of Object.entries(globalCourses)) {
    if (!cVal) continue;
    const courseId = (cVal.course_id || courseKey).toLowerCase().trim();
    const deptId = Array.isArray(cVal.linked_departments) && cVal.linked_departments.length > 0 
      ? cVal.linked_departments[0] 
      : (cVal.department_id || null);

    coursesMap.set(courseId, {
      id: courseId,
      department_id: deptId,
      school_id: 'fupre',
      code: cVal.course_code || courseKey.toUpperCase(),
      title: cVal.course_name || cVal.title || cVal.course_code || courseId,
      level: cVal.level || '100lvl',
      semester: cVal.semester === 'second' || cVal.semester === 2 ? 2 : 1,
      description: cVal.course_status || null,
    });

    if (Array.isArray(cVal.topics)) {
      cVal.topics.forEach((t, idx) => {
        if (!t) return;
        const topicId = (t.topic_id || `${courseId}_topic_${idx + 1}`).toLowerCase().trim();
        topicsList.push({
          id: topicId,
          course_id: courseId,
          topic_name: t.topic_name || `Topic ${idx + 1}`,
          topic_order: idx + 1,
          overview_json: {
            overview: t.topic_context || t.overview || '',
            start_point: t.start_point || null,
            end_point: t.end_point || null,
          }
        });
      });
    }
  }

  // B. From departments_data courses
  for (const [deptKey, deptVal] of Object.entries(departmentsData)) {
    if (deptVal && Array.isArray(deptVal.courses)) {
      for (const c of deptVal.courses) {
        if (!c) continue;
        const courseId = (c.course_id || c.course_code || '').toLowerCase().trim();
        if (!courseId) continue;

        if (!coursesMap.has(courseId)) {
          coursesMap.set(courseId, {
            id: courseId,
            department_id: deptKey.toLowerCase().trim(),
            school_id: 'fupre',
            code: c.course_code || courseId.toUpperCase(),
            title: c.course_name || c.course_code || courseId,
            level: c.level || '100lvl',
            semester: c.semester === 'second' || c.semester === 2 ? 2 : 1,
            description: c.course_status || null,
          });
        }
      }
    }
  }

  const coursesArray = Array.from(coursesMap.values());
  for (const c of coursesArray) {
    const { error } = await adminClient.from('courses').upsert(c);
    if (error) console.error(`Error migrating course ${c.id}:`, error.message);
  }
  console.log(`✓ Migrated ${coursesArray.length} courses.`);

  for (const t of topicsList) {
    const { error } = await adminClient.from('topics').upsert(t);
    if (error) console.error(`Error migrating topic ${t.id}:`, error.message);
  }
  console.log(`✓ Migrated ${topicsList.length} topics.`);

  // ── 4. Migrate Past Questions ────────────────────────────────────────────
  console.log('\n--- 4. Migrating Past Questions ---');
  const pastQuestions = data.past_questions || {};
  let pqCount = 0;
  for (const [pqKey, pqVal] of Object.entries(pastQuestions)) {
    if (!pqVal) continue;
    const { error } = await adminClient.from('past_questions').upsert({
      id: pqKey,
      department_id: pqVal.department_id || 'general',
      level: pqVal.level || '100lvl',
      course_id: pqVal.course_id || pqKey,
      year: String(pqVal.year || '2024'),
      questions_json: pqVal.questions || pqVal,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error(`Error migrating past question ${pqKey}:`, error.message);
    else pqCount++;
  }
  console.log(`✓ Migrated ${pqCount} past question sets.`);

  // ── 5. Migrate App Settings ──────────────────────────────────────────────
  console.log('\n--- 5. Migrating App Settings ---');
  const appSettings = data.app_settings || {};
  let settingsCount = 0;
  for (const [settingKey, settingVal] of Object.entries(appSettings)) {
    if (!settingVal) continue;
    const { error } = await adminClient.from('app_settings').upsert({
      key: settingKey,
      value_json: typeof settingVal === 'object' ? settingVal : { value: settingVal },
      updated_at: new Date().toISOString(),
    });
    if (error) console.error(`Error migrating setting ${settingKey}:`, error.message);
    else settingsCount++;
  }
  console.log(`✓ Migrated ${settingsCount} app settings.`);

  console.log('\n====================================================');
  console.log('MIGRATION FINISHED SUCCESSFULLY!');
  console.log('====================================================');
}

migrateData();
