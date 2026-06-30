import { GoogleGenAI } from "@google/genai";

// We use gemini-3.5-flash as default, but we support fallback models for older/restricted API keys
export let activeModel = "gemini-3.5-flash";
export let lastValidationError = "";

export const resolveApiKey = (passedKey: string): string => {
  const key = passedKey || (typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_GEMINI_API_KEY : '') || '';
  return key.trim().replace(/^["']|["']$/g, "");
};

// State variables to track server key availability
let serverHasKey = false;
let checkedServer = false;

export const checkServerConfig = async (): Promise<boolean> => {
  if (checkedServer) return serverHasKey;
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      serverHasKey = !!data.hasKey;
    }
  } catch (e) {
    console.warn("Could not reach backend /api/config, falling back to client-only mode:", e);
    serverHasKey = false;
  }
  checkedServer = true;
  return serverHasKey;
};

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
  const cleanKey = resolveApiKey(apiKey);
  if (!cleanKey) {
    lastValidationError = "تکایە سەرەتا کلیل بنووسە.";
    return false;
  }

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
  // Check if server is configured with an API key first
  const hasServer = await checkServerConfig();
  if (hasServer) {
    try {
      const base64Audio = await blobToBase64(audioBlob);
      const cleanBase64 = base64Audio.split(',')[1];
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: cleanBase64,
          mimeType: audioBlob.type || "audio/webm",
          language
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || "";
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Server transcription error");
      }
    } catch (err) {
      console.warn("Server transcribe failed, falling back to client-side:", err);
    }
  }

  const cleanKey = resolveApiKey(apiKey);
  if (!cleanKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    
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
  const hasServer = await checkServerConfig();
  if (hasServer) {
    try {
      const cleanBase64 = imageDataUrl.includes(",") ? imageDataUrl.split(',')[1] : imageDataUrl;
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: cleanBase64 })
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || "";
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Server OCR error");
      }
    } catch (err) {
      console.warn("Server OCR failed, falling back to client-side:", err);
    }
  }

  const cleanKey = resolveApiKey(apiKey);
  if (!cleanKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
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
  const hasServer = await checkServerConfig();
  if (hasServer) {
    try {
      const res = await fetch("/api/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentText, instruction })
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || "";
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Server text improvement error");
      }
    } catch (err) {
      console.warn("Server text improvement failed, falling back to client-side:", err);
    }
  }

  const cleanKey = resolveApiKey(apiKey);
  if (!cleanKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    
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
  const hasServer = await checkServerConfig();
  if (hasServer) {
    try {
      const cleanBase64 = fileBase64.includes(",") ? fileBase64.split(",")[1] : fileBase64;
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: cleanBase64,
          mimeType,
          customInstruction
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || "";
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Server questions generation error");
      }
    } catch (err) {
      console.warn("Server questions generation failed, falling back to client-side:", err);
    }
  }

  const cleanKey = resolveApiKey(apiKey);
  if (!cleanKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
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

export const generateMathFromImage = async (
  apiKey: string,
  imageDataUrl: string,
  instruction: string
): Promise<string> => {
  const hasServer = await checkServerConfig();
  if (hasServer) {
    try {
      const cleanBase64 = imageDataUrl.includes(",") ? imageDataUrl.split(",")[1] : imageDataUrl;
      const res = await fetch("/api/generate-math", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: cleanBase64,
          instruction
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || "";
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Server math generation error");
      }
    } catch (err) {
      console.warn("Server math generation failed, falling back to client-side:", err);
    }
  }

  const cleanKey = resolveApiKey(apiKey);
  if (!cleanKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    const cleanBase64 = imageDataUrl.includes(",") ? imageDataUrl.split(",")[1] : imageDataUrl;

    const systemPrompt = `You are an expert mathematical and educational OCR and parser system.
Your job is to analyze the provided mathematical expression, question image, or test document, and extract/recreate all of its components (including text, fractions, summations, integrals, limits, lines, arrows, geometric shapes, and diagrams) into a clean, sequential structured JSON layout format.

The user's specific request is: "${instruction || 'Recreate this math equation or question'}"

CRITICAL RULES FOR KURDISH BAHDINI (کوردیا باهدینی):
1. You MUST translate or transcribe any Kurdish text into highly precise Badini Kurdish (کوردیا باهدینی) using Kurdish Arabic characters.
2. Absolutely NOT A SINGLE CHARACTER error is allowed. Double check spelling, character choices, and grammar.
3. Pay extra attention to Bahdini Kurdish letters such as: 'ڤ' (e.g. مرۆڤ, دەڤەر), 'چ' (e.g. چێکرن), 'پ' (e.g. پرسیار), 'گ' (e.g. گرنگ), 'ژ' (e.g. ژینگە), 'ێ' (e.g. چێکرن, ئێک), 'ۆ' (e.g. بۆکس), 'ڕ' (heavy r), 'ڵ' (heavy l).
4. Do not misspell or substitute these letters with Arabic or standard Sorani if the source is Bahdini.

JSON SCHEMA:
Return a JSON object with a single root array called "elements":
{
  "elements": [
    {
      "type": "text" | "fraction" | "sigma_sum" | "product" | "definite_integral" | "limit" | "newline" | "line" | "image_icon" | "arrow" | "square" | "rectangle",
      "text": "plain text string (used for normal text, variables, equal signs like '=', '+', or emoji icons)",
      "numerator": "string for fraction numerator",
      "denominator": "string for fraction denominator",
      "topText": "string for upper limit of sum/product/integral",
      "bottomText": "string for lower limit or sub-text of sum/product/integral/limit",
      "width": number, // optional, for lines, arrows, squares, rectangles
      "height": number, // optional, for rectangles
      "strokeWidth": number, // optional, for line/shape elements (default 2)
      "fontSize": number, // optional (defaults to 14)
      "color": string, // optional, specify CSS color or hex color if specified/colored (e.g., "#ef4444" for red, "#3b82f6" for blue, etc.)
      "x": number, // optional, X-offset relative to canvas center (ranges from -450 to 450)
      "y": number, // optional, Y-offset relative to canvas center (ranges from -300 to 300)
      "angle": number // optional, rotation angle in degrees (e.g. 0, 45, 90, 135, 180, 225, 270, 315)
    }
  ]
}

RECREATION & LAYOUT RULES:
1. Normal text paragraphs, sentences, or words must be typed as 'text' elements. Keep text split appropriately to maintain the visual structure.
2. If there are multiple lines of equations or questions, insert a {"type": "newline"} element to cleanly break the line.
3. Keep elements in the exact order they appear from left to right, line by line, honoring RTL layout flow.
4. Fractions: use type: "fraction", specify "numerator" and "denominator". E.g. x/y becomes {"type": "fraction", "numerator": "x", "denominator": "y"}.
5. Summation (Sigma): use type: "sigma_sum", and specify "topText" (e.g. "n" or "∞") and "bottomText" (e.g. "i=1").
6. Product (Pi): use type: "product", specify "topText" and "bottomText".
7. Integral: use type: "definite_integral", specify "topText" and "bottomText".
8. Limit: use type: "limit", specify "bottomText" (e.g. "x → a" or "n → ∞").
9. Lines/Separators: If there are horizontal lines, underlines, dividers, or horizontal rules, use {"type": "line", "width": 150, "strokeWidth": 2}.
10. Arrows: If there are flow arrows, arrows pointing between text, or arrows in diagrams, represent them using {"type": "arrow", "width": 80, "color": "#ef4444"}. Match the color of the arrow from the document if colored!
11. Squares / Rectangles: If there are visual boxes, cards, square outlines (چوارگوشە), or rectangle containers (لاکێشا) in the diagram or question, represent them using {"type": "square", "width": 50, "color": "#10b981"} or {"type": "rectangle", "width": 100, "height": 40, "color": "#ef4444"}.
12. Diagrams/Illustrations/Images: If there is an illustration, drawing, cell, heart, brain, beaker, or geometric diagram in the question, represent it elegantly using {"type": "image_icon", "text": "🫀", "fontSize": 42} (choose the most contextually relevant aesthetic emoji, e.g. 🫀 for biology heart, 🧠 for brain, 🧬 for genetics, 🧪/🔬 for science, 📐/📊 for math diagrams).
13. Plain symbols or constants (e.g., "+", "-", "=", "x", "y", "2") can be grouped into sequential 'text' elements.
14. FOR TREE STRUCTURES, FLOWCHARTS, BRANCHING DIAGRAMS, OR COMPLEX SCHEMAS (such as the hierarchical tree classification of Matter / ماددە):
    - You MUST specify "x", "y", and "angle" properties on EVERY element to lay them out in a beautiful branching tree or flowchart format.
    - Top Node: Place a "rectangle" at x: 0, y: -220, and a "text" element at x: 0, y: -220.
    - Arrow from Top Node: Place an "arrow" pointing straight down at x: 0, y: -160, with angle: 90.
    - Middle Node: Place a "rectangle" at x: 0, y: -100, and a "text" element at x: 0, y: -100.
    - Diverging Branches:
      - Left Branch Arrow (pointing diagonally down-left): Place an "arrow" at x: -140, y: -40, with angle: 145.
      - Left Branch Label (e.g., "بەلێ"): Place a "text" element at x: -150, y: -50.
      - Right Branch Arrow (pointing diagonally down-right): Place an "arrow" at x: 140, y: -40, with angle: 35.
      - Right Branch Label (e.g., "نەخێر"): Place a "text" element at x: 150, y: -50.
    - Level 3 left box/text node: Place a "rectangle" and "text" element at x: -250, y: 30.
    - Level 3 right box/text node: Place a "rectangle" and "text" element at x: 250, y: 30.
    - Use this beautiful hierarchical coordinate pattern for all child boxes, diagonal arrows, and labels so they form parallel branches mirroring the original diagram structure perfectly!

CRITICAL: Return ONLY valid, minified JSON matching the schema above. Do NOT wrap it in markdown codeblocks (no \`\`\`json ... \`\`\`), do NOT write any introductory or conversational text. Return only the JSON string starting with { and ending with }.`;

    const response = await ai.models.generateContent({
      model: activeModel,
      contents: [
        { text: systemPrompt },
        {
          inlineData: {
            mimeType: "image/jpeg",
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

export const troubleshootPage = async (
  apiKey: string,
  elements: any[],
  instruction: string,
  imageBase64?: string
): Promise<string> => {
  const hasServer = await checkServerConfig();
  if (hasServer) {
    try {
      const res = await fetch("/api/troubleshoot-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elements,
          instruction,
          imageBase64
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || "";
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Server troubleshooting error");
      }
    } catch (err) {
      console.warn("Server troubleshooting failed, falling back to client-side:", err);
    }
  }

  const cleanKey = resolveApiKey(apiKey);
  if (!cleanKey) throw new Error("تکایە سەرەتا API Key دابنێ");

  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    const systemPrompt = `You are an expert AI educational content designer, layout organizer, and troubleshooting engine.
You are given a JSON list of vector educational/canvas objects (textboxes, lines, shapes, math/chemistry structures) currently rendered on a workspace, and an optional visual snapshot of the page.
The user wants you to modify, correct, rearrange, and fix this page based on their instruction.

User Instruction: "${instruction || 'Fix and arrange the page elements'}"

CRITICAL GOALS & RULES:
1. Parse and understand the layout. Elements have:
   - x, y: coordinate offsets relative to canvas center (ranges from -450 to 450 for x, and -300 to 300 for y)
   - type: "text" | "fraction" | "sigma_sum" | "product" | "definite_integral" | "limit" | "newline" | "line" | "image_icon" | "arrow" | "square" | "rectangle"
   - text, numerator, denominator, topText, bottomText, color, fontSize, angle, width, height, etc.
2. Carefully troubleshoot and correct:
   - Spelling, vocabulary, and phrasing errors in Kurdish (Bahdini/Sorani Arabic script), Arabic, or English text. Double-check all Bahdini Kurdish letters ('ڤ', 'چ', 'پ', 'گ', 'ژ', 'ێ', 'ۆ', 'ڕ', 'ڵ'). For example, change any misspelled words to pure, standard Bahdini Kurdish.
   - Symmetrically align and position elements. If things are messy, overlap, or misaligned, adjust their x and y coordinates so they look like a premium, professional publication.
   - Arrange diagrams, geometric shapes, flowcharts, or branching structures cleanly with parallel coordinate alignments.
3. If elements are currently empty (or missing some parts visible on the image), read the text/math/shapes from the provided visual snapshot of the page and create them as high-quality vector elements in the correct coordinates!
4. Return the entire corrected layout in the exact same JSON schema.

JSON SCHEMA:
Return a JSON object with a single root array called "elements":
{
  "elements": [
    {
      "type": "text" | "fraction" | "sigma_sum" | "product" | "definite_integral" | "limit" | "newline" | "line" | "image_icon" | "arrow" | "square" | "rectangle",
      "text": "plain text string",
      "numerator": "fraction numerator",
      "denominator": "fraction denominator",
      "topText": "upper limit",
      "bottomText": "lower limit",
      "width": number,
      "height": number,
      "strokeWidth": number,
      "fontSize": number,
      "color": string,
      "x": number,
      "y": number,
      "angle": number
    }
  ]
}

CURRENT VECTOR ELEMENTS ON CANVAS:
${JSON.stringify(elements || [], null, 2)}

CRITICAL: Return ONLY valid, minified JSON matching the schema above. Do NOT wrap it in markdown codeblocks (no \`\`\`json ... \`\`\`), do NOT write any introductory or conversational text. Return only the JSON string starting with { and ending with }.`;

    const contents: any[] = [{ text: systemPrompt }];
    if (imageBase64) {
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64
        }
      });
    }

    const response = await ai.models.generateContent({
      model: activeModel,
      contents,
      config: {
        responseMimeType: "application/json"
      }
    });

    return response.text || "";
  } catch (error: any) {
    handleError(error);
    return "";
  }
};

export const troubleshootKpdfPage = async (
  apiKey: string,
  kpdf: any,
  instruction: string,
  imageBase64?: string
): Promise<string> => {
  const hasServer = await checkServerConfig();
  const cleanKey = resolveApiKey(apiKey);
  let serverError: Error | null = null;

  if (hasServer) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 seconds timeout

    try {
      const res = await fetch("/api/troubleshoot-kpdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpdf,
          instruction,
          imageBase64
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return data.text || "";
      } else {
        let errMsg = "Server troubleshooting error";
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch (_) {
          errMsg = `Server returned status ${res.status}`;
        }
        throw new Error(errMsg);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      const formattedError = isTimeout 
        ? new Error("پەیوەندی لەگەڵ سێرڤەر پچڕا بەهۆی درێژەکێشانی کات (Timeout). تکایە دووبارە تاقیبکەرەوە.")
        : err;
      
      console.warn("Server KPDF troubleshooting failed:", formattedError);
      serverError = formattedError;

      // If we don't have a local key to fall back to, throw the server error directly!
      if (!cleanKey) {
        throw formattedError;
      }
    }
  }

  if (!cleanKey) {
    if (serverError) {
      throw serverError;
    }
    throw new Error("تکایە سەرەتا API Key دابنێ لە ڕێکخستنەکاندا.");
  }

  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    const systemPrompt = `You are an expert AI educational content designer, layout organizer, and troubleshooting engine.
You are given a full .kpdf JSON project representation of the current page containing vector educational and canvas objects (textboxes, lines, shapes, math/chemistry structures) rendered in a workspace.
You are also given an optional visual snapshot of the page.
The user wants you to modify, correct, rearrange, and fix this page based on their instruction.

User Instruction: "${instruction || 'Fix and arrange the page elements, resolving any text wrapping and resizing issues.'}"

CRITICAL GOALS & RULES:
1. Parse and understand the .kpdf JSON. Focus on the objects in the canvas (located in the canvases dictionary).
2. Carefully troubleshoot and correct:
   - Spelling, vocabulary, and phrasing errors in Kurdish (Bahdini/Sorani Arabic script), Arabic, or English text inside textboxes. Double-check all Bahdini Kurdish letters ('ڤ', 'چ', 'پ', 'گ', 'ژ', 'ێ', 'ۆ', 'ڕ', 'ڵ'). Correct any misspelled words to pure, standard Bahdini Kurdish.
   - Text wrapping / resizing issues:
     - Check if any textbox has crowded text, overlaps, or is wrapping awkwardly.
     - You MUST adjust the 'width' attribute of textboxes directly so the text wraps beautifully, with spacious, clean padding.
     - Increase 'width' if lines are wrapping too much (e.g. single letters or short words wrapping to the next line).
     - Ensure 'splitByGrapheme' is set to true for Kurdish textboxes to wrap correctly in Kurdish Arabic script.
     - If textboxes were stretched/scaled (having scaleX !== 1 or scaleY !== 1), reset scaleX and scaleY to 1 and adjust 'width' and 'fontSize' proportionally instead to keep them clean.
   - Symmetrically align and position elements. If things are messy, overlap, or misaligned, adjust their 'left' and 'top' coordinates in the canvas objects array so they look like a premium, professional publication.
   - Arrange diagrams, geometric shapes, flowcharts, or branching structures cleanly with parallel coordinate alignments.
   - PAGE FORMATTING SPECIFIC RULES:
     * Spacing: Bring questions closer together vertically (reduce the gap / vertical distance between questions) by adjusting their 'top' coordinates.
     * Options Layout: Align multiple-choice options (e.g., A, B, C, D or ئێک، دوو، سێ...) horizontally (ئاسۆیی) in a single row or side-by-side, instead of stacking them vertically, by setting their 'top' values to be similar/equal and adjusting their 'left' values.
     * Correct Answer: Change the 'fill' (text color) of ONLY the correct answer textbox (or correct option) to RED (e.g., "#EF4444" or "red"), leaving all other options and elements unchanged.
3. You are fully empowered to:
   - Edit textbox contents ('text' field).
   - Adjust widths, heights, fonts, fontSizes, colors, scaleX, scaleY, left, top.
   - Add new elements (like textboxes, lines, rects, groups) to the canvas objects array.
   - Delete unnecessary elements from the canvas objects array.
4. Return the entire corrected .kpdf JSON structure in the exact same format (containing version, pages, and canvases fields).

CRITICAL: Return ONLY valid, minified JSON matching the original .kpdf JSON format. Do NOT wrap it in markdown codeblocks (no \`\`\`json ... \`\`\`), do NOT write any introductory or conversational text. Return only the JSON string starting with { and ending with }.`;

    const modelToUse = activeModel || "gemini-3.5-flash";
    const parts: any[] = [
      { text: systemPrompt }, 
      { text: `Original .kpdf Project JSON:\n${typeof kpdf === 'string' ? kpdf : JSON.stringify(kpdf)}` }
    ];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64
        }
      });
    }

    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: {
        parts: parts
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    return response.text || "";
  } catch (error: any) {
    handleError(error);
    throw error;
  }
};
