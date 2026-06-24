import { GoogleGenAI } from "@google/genai";

// We use gemini-3.5-flash as default, but we support fallback models for older/restricted API keys
export let activeModel = "gemini-3.5-flash";
export let lastValidationError = "";

// Initialize activeModel from localStorage if available
try {
  if (typeof window !== "undefined" && window.localStorage) {
    const savedModel = window.localStorage.getItem("gemini_active_model");
    if (savedModel) {
      activeModel = savedModel;
    }
  }
} catch (e) {
  console.error("Error reading gemini_active_model from localStorage:", e);
}

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  lastValidationError = "";
  if (!apiKey) {
    lastValidationError = "تکایە سەرەتا کلیل بنووسە.";
    return false;
  }

  // Clean the API Key of any whitespace, quotes, or line breaks copied by mistake
  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "");

  // Try validating using multiple models to ensure compatibility (gemini-3.5-flash, then gemini-2.5-flash as a fallback)
  const modelsToTry = ["gemini-3.5-flash", "gemini-2.5-flash"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const ai = new GoogleGenAI({ apiKey: cleanKey });
      await ai.models.generateContent({
        model: model,
        contents: "Test connection",
      });
      
      // Successfully connected with this model!
      activeModel = model;
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("gemini_active_model", model);
        }
      } catch (e) {
        console.error(e);
      }
      return true;
    } catch (e: any) {
      console.error(`Validation failed for model ${model}:`, e);
      lastError = e;
    }
  }

  // If all tried models failed, parse the last error to show a descriptive message to the user
  let errorMsg = "هەڵەیەک ڕوویدا لە کاتی پەیوەستبوون.";
  if (lastError) {
    const rawMsg = lastError.message || String(lastError);
    if (rawMsg.includes("403") || rawMsg.includes("API key") || rawMsg.includes("not valid") || rawMsg.includes("INVALID_ARGUMENT")) {
      errorMsg = "کۆدی API Key هەڵەیە یان کار ناکات. تکایە دڵنیابەوە لە کلیلەکەت.";
    } else if (rawMsg.includes("404") || rawMsg.includes("not found")) {
      errorMsg = "مۆدێلەکە نەدۆزرایەوە یان پشتگیری ناکرێت لەم ناوچەیە.";
    } else if (rawMsg.includes("fetch") || rawMsg.includes("network") || rawMsg.includes("Failed to fetch") || rawMsg.includes("cors") || rawMsg.includes("CORS")) {
      errorMsg = "کێشەی ئینتەرنێت یان ڕێگری لە پەیوەستبوون (CORS/Network error).";
    } else if (rawMsg.includes("quota") || rawMsg.includes("429")) {
      errorMsg = "ڕێژەی دیاریکراوی بەکارهێنان (Quota) تەواو بووە.";
    } else {
      errorMsg = `کێشەیەک ڕوویدا: ${rawMsg}`;
    }
  }

  lastValidationError = errorMsg;
  return false;
};

export const transcribeAudio = async (apiKey: string, audioBlob: Blob, language: string = 'ku_badini'): Promise<string> => {
  if (!apiKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Convert Blob to Base64
    const base64Audio = await blobToBase64(audioBlob);
    const cleanBase64 = base64Audio.split(',')[1]; 

    // Build specific prompt based on the chosen language
    let promptText = "Transcribe this audio exactly as spoken. Return ONLY the transcribed text.";
    if (language === 'ku_badini') {
      promptText = "Transcribe this audio exactly as spoken into Kurdish Badini (Kurmanji) dialect. " +
                   "CRITICAL INSTRUCTION: You MUST write using ONLY the Kurdish-Arabic (Sorani-Aramaic) script (ئەلفوبێی عەرەبی یان سۆرانی). " +
                   "DO NOT use Latin letters or Hawar script under any circumstances (no letters like ç, ş, ê, û, î, etc.). " +
                   "Write in pure Badini Kurdish using traditional letters like (پ، چ، ژ، ڤ، گ، ۆ، ێ، ڕ، ڵ). " +
                   "Return ONLY the plain text transcribed.";
    } else if (language === 'ku_sorani') {
      promptText = "Transcribe this audio exactly as spoken into Kurdish Sorani dialect using the standard Kurdish Arabic-based script. " +
                   "Return ONLY the plain text transcribed.";
    } else if (language === 'ar') {
      promptText = "Transcribe this audio exactly as spoken into modern standard or spoken Arabic. " +
                   "Return ONLY the plain Arabic text.";
    } else if (language === 'en') {
      promptText = "Transcribe this audio exactly as spoken into English. " +
                   "Return ONLY the plain English text.";
    }

    const response = await ai.models.generateContent({
      model: activeModel,
      contents: {
        parts: [
          { 
            text: promptText 
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
      model: activeModel,
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

export const improveTextWithAI = async (apiKey: string, currentText: string, instruction: string): Promise<string> => {
  if (!apiKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    let promptText = "";
    if (!instruction.trim()) {
      promptText = `You are an expert editor. Your task is to automatically format, beautify, and reorganize the following text to look extremely professional and clean. 
- If the text is a multiple-choice question (MCQ) or has choices/questions, make sure the choices are clearly structured, aligned, and lettered (e.g., A), B), C), D) or similar).
- Correct any obvious typos or messy lines.
- Preserve the original language perfectly (e.g., Bahdini Kurdish, Sorani Kurdish, Arabic, or English).
- Do not add conversational explanations or preambles. Return ONLY the final formatted/improved text.

Text to improve:
"""
${currentText}
"""`;
    } else {
      promptText = `You are an expert editor. Your task is to edit, format, or transform the following text according to the specific user instruction.
- User Instruction: "${instruction}"
- Preserve the original layout style unless requested otherwise.
- Keep the language same as the original or follow the translation if specified in the instruction.
- Return ONLY the final edited text. No explanations, no introductory words, no conversational fluff.

Original Text:
"""
${currentText}
"""`;
    }

    const response = await ai.models.generateContent({
      model: activeModel,
      contents: promptText,
    });

    return response.text || "";
  } catch (error: any) {
    handleError(error);
    return "";
  }
};

export const generateQuestionsFromFile = async (
  apiKey: string,
  fileBase64: string,
  mimeType: string,
  customInstruction: string
): Promise<string> => {
  if (!apiKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const cleanBase64 = fileBase64.includes(",") ? fileBase64.split(",")[1] : fileBase64;

    const userPrompt = customInstruction.trim() 
      ? `Generate/extract questions based on this file according to this instruction: "${customInstruction}". 
- Return ONLY the final generated questions formatted nicely. No greetings, no explanations.` 
      : `Analyze this uploaded document/image and generate or extract high-quality, professional questions based on its content.
- If they are Multiple Choice Questions (MCQs), format choices perfectly (A, B, C, D) and make them aligned.
- Preserve the language of the source text (Kurdish, Arabic, or English).
- Do not write any conversational preamble or markdown chat introduction. Return ONLY the final clean questions.`;

    const response = await ai.models.generateContent({
      model: activeModel,
      contents: [
        {
          text: userPrompt
        },
        {
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64
          }
        }
      ]
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
      throw new Error(`مۆدێلەکە (${activeModel}) نەدۆزرایەوە. تکایە دڵنیابە لە API Key.`);
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