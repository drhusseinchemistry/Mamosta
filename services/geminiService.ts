
// Handle interaction with Google Gemini API via REST
// This avoids heavy Node.js client library dependencies in the browser

const MODEL_NAME = "gemini-1.5-flash"; // Fast and good for multimodel

export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<string> => {
  const base64Audio = await blobToBase64(audioBlob);
  const cleanBase64 = base64Audio.split(',')[1];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      parts: [
        {
          text: "Transcribe this audio exactly as spoken. It might be in Kurdish (Bahdini or Sorani dialects), Arabic, or English. If it is Kurdish, use standard Kurdish script. Do not translate, just transcribe. Return ONLY the text."
        },
        {
          inline_data: {
            mime_type: audioBlob.type || "audio/webm",
            data: cleanBase64
          }
        }
      ]
    }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error) {
    console.error("STT Error:", error);
    throw error;
  }
};

export const performOCR = async (apiKey: string, imageDataUrl: string): Promise<string> => {
  const cleanBase64 = imageDataUrl.split(',')[1];
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      parts: [
        {
          text: "Extract all text from this image. Preserve the structure as much as possible. If it is Kurdish, ensure correct script is used. Return ONLY the extracted text."
        },
        {
          inline_data: {
            mime_type: "image/jpeg",
            data: cleanBase64
          }
        }
      ]
    }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error) {
    console.error("OCR Error:", error);
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
