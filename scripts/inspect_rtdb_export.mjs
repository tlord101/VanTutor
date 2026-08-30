import fs from 'fs';

const filePath = 'C:/Users/Hp/Downloads/tlord-1ab38-default-rtdb-export.json';

try {
  const stats = fs.statSync(filePath);
  console.log('File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);

  console.log('Top-level keys in export:');
  for (const key of Object.keys(data)) {
    const item = data[key];
    const count = (item && typeof item === 'object') ? Object.keys(item).length : typeof item;
    console.log(` - ${key}: ${count} entries`);
  }

  // Print sample structures
  if (data.users) {
    const sampleUid = Object.keys(data.users)[0];
    console.log('\nSample user:', JSON.stringify(data.users[sampleUid], null, 2).slice(0, 400));
  }

  if (data.courses_data) {
    console.log('\nSample courses_data keys:', Object.keys(data.courses_data).slice(0, 5));
    const firstKey = Object.keys(data.courses_data)[0];
    console.log('Sample course entry:', JSON.stringify(data.courses_data[firstKey], null, 2).slice(0, 400));
  }
} catch (err) {
  console.error('Error inspecting export file:', err);
}
