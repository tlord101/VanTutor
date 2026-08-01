import { GoogleGenAI } from "@google/genai";

async function main() {
    const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });
    try {
        const response = await ai.models.embedContent({
            model: 'text-embedding-004',
            contents: 'Hello world',
        });
        console.log("SUCCESS");
    } catch (e: any) {
        console.error("ERROR:", e);
    }
}
main();
