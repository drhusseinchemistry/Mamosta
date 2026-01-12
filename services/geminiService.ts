import { GoogleGenAI } from "@google/genai";

// Switched to gemini-1.5-pro as requested for better performance (closest to "3pro/4pro" capabilities currently available)
const MODEL_NAME = "gemini-1.5-pro"; 

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;
  try {
    const ai = new GoogleGenAI({ apiKey });
    // Try to connect with a simple prompt
    await ai.models.generateContent({
      model: MODEL_NAME,
      contents: "Test",
    });
    return true;
  } catch (e) {
    console.error("API Validation Failed", e);
    // If Pro fails, try Flash as fallback to see if key is valid but model restricted
    try {
        const ai = new GoogleGenAI({ apiKey });
        await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: "Test",
        });
        // If this works, the key is valid but Pro is restricted. We return true but warn in logs.
        console.warn("Pro model failed, but Flash worked. Key is valid.");
        return true;
    } catch(e2) {
        return false;
    }
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
      throw new Error(`مۆدێلی ${MODEL_NAME} نەدۆزرایەوە. دڵنیابە لەوەی API Keyـەکەت ڕاستە.`);
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