const tests = [
  "![Captured Image](https://firebasestorage.googleapis.com/v0/b/test/o/chat_files%2F123_camera_image(1).jpg?alt=media&token=abc)\n\nCaption (test)",
  "![Captured Image](blob:http://localhost:5173/5abf0a7b-a32b-4e0d-8df4-b3c6f83b6c5a)",
  "![Captured Image](https://example.com/image.jpg)"
];

for (const rawText of tests) {
  // We want to extract the full URL, even if it has '('.
  // Since it's in the format ![alt](url), and url has no spaces.
  // We can match ![alt]( followed by non-space characters, ending with )
  // Wait, if url has no spaces, and the next char after url is ), we can extract the url.
  
  // Let's try matching everything inside the first ![...] ( ... ) block where the inside doesn't contain spaces.
  // Actually, wait. The markdown syntax ![alt](url) means the URL is exactly between ( and ).
  // If the url contains ), it breaks standard markdown parsers too!
  
  // Let's just find the first URL in the string (starting with http or blob).
  let url = "";
  const urlRegex = /(https?:\/\/[^\s]+|blob:[^\s]+)/;
  const match = rawText.match(urlRegex);
  if (match) {
    url = match[1];
    // If the url ends with ')', and we know it's from ![alt](url), the last ')' is the markdown syntax!
    // But what if the URL ITSELF ends with ')'? Firebase URLs end with a token (alphanumeric). They don't end with ')'.
    if (url.endsWith(')')) {
      url = url.slice(0, -1);
    }
  }
  
  console.log("Raw:", rawText.split('\n')[0]);
  console.log("Extracted URL:", url);
  console.log("---");
}
