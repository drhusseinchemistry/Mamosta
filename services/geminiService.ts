import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = "gemini-2.0-flash-exp"; 

export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing");

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Convert Blob to Base64
    const base64Audio = await blobToBase64(audioBlob);
    const cleanBase64 = base64Audio.split(',')[1]; // Remove "data:audio/webm;base64," prefix

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
    let msg = error.message || "Unknown error";
    if (msg.includes("403") || msg.includes("API key")) {
      throw new Error("API Key هەڵەیە. تکایە دڵنیابەرەوە لە ڕێکخستنەکان.");
    } else if (msg.includes("not found")) {
      throw new Error(`مۆدێلی ${MODEL_NAME} نەدۆزرایەوە. تکایە دڵنیابە API Key ەکەت دەسەڵاتی هەیە.`);
    }
    throw new Error(msg);
  }
};

export const performOCR = async (apiKey: string, imageDataUrl: string): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const cleanBase64 = imageDataUrl.split(',')[1];

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
    let msg = error.message || "Unknown error";
    if (msg.includes("403") || msg.includes("API key")) {
      throw new Error("API Key هەڵەیە. تکایە دڵنیابەرەوە لە ڕێکخستنەکان.");
    } else if (msg.includes("not found")) {
      throw new Error(`مۆدێلی ${MODEL_NAME} نەدۆزرایەوە. تکایە دڵنیابە API Key ەکەت دەسەڵاتی هەیە.`);
    }
    throw new Error(msg);
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