const rawText = '![Captured Image](https://firebasestorage.googleapis.com/v0/b/test/o/chat_files%2F123_camera_image(1).jpg?alt=media&token=abc)\n\nMy caption';
const urlMatch = rawText.match(/(https?:\/\/[^\s]+|blob:[^\s]+)/);
let imageUrl = urlMatch ? urlMatch[1] : '';
if (imageUrl.endsWith(')')) {
  imageUrl = imageUrl.slice(0, -1);
}
console.log('Image URL:', imageUrl);

const extractedCaption = rawText.replace(/!\[.*?\]\([^\s]+\)/, '').trim();
console.log('Extracted Caption:', extractedCaption);
