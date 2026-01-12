import { GoogleGenAI } from "@google/genai";

// We use gemini-1.5-flash because it is currently the most stable model for public API keys.
// gemini-2.0-flash often returns "Not Found" or requires special access.
const MODEL_NAME = "gemini-1.5-flash"; 

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;
  try {
    const ai = new GoogleGenAI({ apiKey });
    // Use a simple string prompt for validation to reduce complexity
    await ai.models.generateContent({
      model: MODEL_NAME,
      contents: "Test connection",
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
      throw new Error(`مۆدێلی ${MODEL_NAME} نەدۆزرایەوە (پێویستە API Key چالاک بێت).`);
    } else if (msg.includes("fetch") || msg.includes("network")) {
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