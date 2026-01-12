import { GoogleGenAI } from "@google/genai";

// Using standard 2.0 flash model which is currently very stable and fast
const MODEL_NAME = "gemini-2.0-flash"; 

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;
  try {
    const ai = new GoogleGenAI({ apiKey });
    // Try a very simple generation to test the key
    await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts: [{ text: "Hi" }] }
    });
    return true;
  } catch (e) {
    console.error("API Validation Failed", e);
    return false;
  }
};

export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<string> => {
  if (!apiKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Convert Blob to Base64
    const base64Audio = await blobToBase64(audioBlob);
    const cleanBase64 = base64Audio.split(',')[1]; 

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { 
            text: "Transcribe this audio exactly as spoken. Use standard script. Supported languages: Kurdish (Bahdini & Sorani), Arabic, English. Return ONLY the text." 
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
    handleError(error);
    return "";
  }
};

export const performOCR = async (apiKey: string, imageDataUrl: string): Promise<string> => {
  if (!apiKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const cleanBase64 = imageDataUrl.split(',')[1];

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { 
            text: "Extract all text from this image perfectly. \n\nIMPORTANT LANGUAGES:\n1. Kurdish (Bahdini dialect using Arabic script)\n2. Kurdish (Sorani dialect)\n3. Arabic\n4. English\n\nPreserve the layout and line breaks. Do not translate. Return ONLY the extracted text." 
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
    handleError(error);
    return "";
  }
};

const handleError = (error: any) => {
    console.error("AI Error details:", error);
    let msg = error.message || "Unknown error";
    
    if (msg.includes("403") || msg.includes("API key")) {
      throw new Error("کۆدی API Key هەڵەیە یان ماوەی بەسەرچووە.");
    } else if (msg.includes("not found")) {
      throw new Error(`مۆدێلی ${MODEL_NAME} نەدۆزرایەوە.`);
    } else if (msg.includes("fetch")) {
      throw new Error("کێشەی ئینتەرنێت هەیە.");
    }
    
    throw new Error("کێشەیەک ڕوویدا: " + msg);
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};