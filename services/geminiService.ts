import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = "gemini-2.0-flash-exp"; // Powerful model for Multimodal (Audio/Images)

export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing");

  // Initialize the SDK
  const ai = new GoogleGenAI({ apiKey });
  
  // Convert Blob to Base64
  const base64Audio = await blobToBase64(audioBlob);
  const cleanBase64 = base64Audio.split(',')[1]; // Remove "data:audio/webm;base64," prefix

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { 
            text: "Transcribe this audio exactly as spoken. It might be in Kurdish (Bahdini or Sorani dialects), Arabic, or English. If it is Kurdish, use standard Kurdish script. Do not translate, just transcribe. Return ONLY the text." 
          },
          {
            inlineData: {
              mimeType: audioBlob.type || "audio/webm",
              data: cleanBase64
            }
          }
        ]
      }
    });

    return response.text || "";
  } catch (error: any) {
    console.error("STT Error:", error);
    if (error.message?.includes("403") || error.message?.includes("API key")) {
      throw new Error("API Key هەڵەیە یان کار ناکات. تکایە دڵنیابەرەوە.");
    }
    throw error;
  }
};

export const performOCR = async (apiKey: string, imageDataUrl: string): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey });
  const cleanBase64 = imageDataUrl.split(',')[1];

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { 
            text: "Extract all text from this image. Preserve the structure as much as possible. If it is Kurdish, ensure correct script is used. Return ONLY the extracted text." 
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64
            }
          }
        ]
      }
    });

    return response.text || "";
  } catch (error: any) {
    console.error("OCR Error:", error);
    if (error.message?.includes("403") || error.message?.includes("API key")) {
      throw new Error("API Key هەڵەیە یان کار ناکات.");
    }
    throw error;
  }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};