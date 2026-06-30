const rawText = "![Captured Image](https://firebasestorage.googleapis.com/v0/b/avelut-7e87c.appspot.com/o/chat_files%2Ftest.jpg?alt=media&token=123)\n\nCaption text here";
const imageUrlMatch = rawText.match(/!\[.*?\]\((.*?)\)/);
const imageUrl = imageUrlMatch ? imageUrlMatch[1] : rawText;
console.log("URL:", imageUrl);

const rawText2 = "![Captured Image](blob:http://localhost:5173/1234-5678)\n\nCaption";
const match2 = rawText2.match(/!\[.*?\]\((.*?)\)/);
console.log("URL2:", match2 ? match2[1] : rawText2);
