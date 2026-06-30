const rawText = "![Captured Image](https://firebasestorage.googleapis.com/v0/b/test/o/chat_files%2F123_camera_image(1).jpg?alt=media&token=abc)\n\nCaption (test)";
console.log("Original:", rawText.split('\n')[0]);
const extractedCaption = rawText.replace(/!\[.*?\]\([^\s]+\)/, '').trim();
console.log("Caption:", extractedCaption);
