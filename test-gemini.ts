import { GoogleGenAI } from "@google/genai";

async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: {
      parts: [
        { text: 'What is 1+1? Return only the number.' }
      ]
    }
  });
  console.log(JSON.stringify(response.candidates[0].content.parts, null, 2));
}

test().catch(console.error);
