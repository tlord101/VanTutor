import fs from 'fs';

const filePath = 'C:/Users/Hp/Downloads/tlord-1ab38-default-rtdb-export.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

for (const [key, c] of Object.entries(data.global_courses || {})) {
  console.log(`Course: ${key} -> code: ${c.course_code}, title: ${c.course_name}, keys: ${Object.keys(c)}`);
  if (c.topics) {
    console.log(`   Topics (${c.topics.length}):`, c.topics);
  }
}
