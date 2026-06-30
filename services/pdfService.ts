// Mocking the imports as we assume they are loaded via CDN or available in environment
// In a real project: import * as pdfjsLib from 'pdfjs-dist';

export const initializePDFJS = () => {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  } else {
    console.error("PDF.js library is not loaded on window.");
  }
};

export const renderPDFPageToDataURL = async (pdfDoc: any, pageNumber: number, scale = 1.0): Promise<{ dataUrl: string, viewport: any }> => {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  if (!context) throw new Error("Canvas context not available");

  await page.render({ canvasContext: context, viewport }).promise;
  return {
    dataUrl: canvas.toDataURL('image/png'),
    viewport
  };
};

export const loadPDFDocument = async (file: File) => {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js library is not loaded. Please ensure script tags are present in index.html");
  }
  const arrayBuffer = await file.arrayBuffer();
  // @ts-ignore
  const loadingTask = window.pdfjsLib.getDocument(arrayBuffer);
  return loadingTask.promise;
};