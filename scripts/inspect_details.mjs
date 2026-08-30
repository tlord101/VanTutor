import fs from 'fs';

const filePath = 'C:/Users/Hp/Downloads/tlord-1ab38-default-rtdb-export.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log('--- SCHOOLS DATA ---');
console.log(JSON.stringify(data.schools_data, null, 2));

console.log('\n--- DEPARTMENTS DATA ---');
console.log(JSON.stringify(data.departments_data, null, 2));

console.log('\n--- GLOBAL COURSES SAMPLE ---');
const courseKeys = Object.keys(data.global_courses || {});
if (courseKeys.length > 0) {
  console.log(JSON.stringify(data.global_courses[courseKeys[0]], null, 2));
}

console.log('\n--- USER PROGRESS SAMPLE ---');
const progressKeys = Object.keys(data.user_progress || {});
if (progressKeys.length > 0) {
  console.log('Key:', progressKeys[0], JSON.stringify(data.user_progress[progressKeys[0]], null, 2));
}
