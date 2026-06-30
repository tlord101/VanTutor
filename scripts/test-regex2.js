const rawText = "![Captured Image](https://firebasestorage.googleapis.com/v0/b/test/o/chat_files%2F123_camera_image(1).jpg?alt=media&token=abc)\n\nCaption";
const match = rawText.match(/!\[.*?\]\((.*?)\)/);
console.log("Matched URL:", match[1]);
