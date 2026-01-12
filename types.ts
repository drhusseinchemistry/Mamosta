export type ToolType = 'select' | 'pen' | 'highlighter' | 'line' | 'rect' | 'circle' | 'text' | 'eraser';

export interface EditorState {
  activeTool: ToolType;
  strokeColor: string;
  strokeWidth: number;
  scale: number;
  isProcessing: boolean;
  statusMessage: string | null;
}

export interface PageData {
  pageNumber: number;
  viewport: any; // PDFJS Viewport
  image: string; // Base64 rendered image of the PDF page
}

// Global window extension for libraries
declare global {
  interface Window {
    pdfjsLib: any;
    fabric: any;
    jspdf: any;
  }
}