import fs from 'fs';

const filePath = 'C:/Users/Hp/Downloads/tlord-1ab38-default-rtdb-export.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log('Keys in root:', Object.keys(data));

// Check if there are courses_data, study_guide_messages, etc.
if (data.courses_data) {
  console.log('courses_data keys:', Object.keys(data.courses_data));
  const first = Object.keys(data.courses_data)[0];
  console.log('courses_data sample:', JSON.stringify(data.courses_data[first], null, 2).slice(0, 500));
}

if (data.departments_data) {
  for (const deptKey of Object.keys(data.departments_data)) {
    const dept = data.departments_data[deptKey];
    if (dept.courses) {
      for (const c of dept.courses) {
        if (c.topics && c.topics.length > 0) {
          console.log(`Found topics in dept ${deptKey} course ${c.course_id}:`, c.topics.length);
        }
      }
    }
  }
}
