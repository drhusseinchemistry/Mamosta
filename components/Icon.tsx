import React from 'react';
import { 
  MousePointer2, 
  Pen, 
  Highlighter, 
  Minus, 
  Square, 
  Circle, 
  Type, 
  Eraser, 
  Upload, 
  Download, 
  Save, 
  Plus, 
  Trash2,
  Undo2,
  Redo2,
  Image as ImageIcon,
  FileText,
  Mic,
  Settings,
  ScanText
} from 'lucide-react';

export const Icons = {
  Select: MousePointer2,
  Pen: Pen,
  Highlighter: Highlighter,
  Line: Minus,
  Rect: Square,
  Circle: Circle,
  Text: Type,
  Eraser: Eraser,
  Upload: Upload,
  Download: Download,
  Save: Save,
  Plus: Plus,
  Trash: Trash2,
  Undo: Undo2,
  Redo: Redo2,
  Image: ImageIcon,
  File: FileText,
  Mic: Mic,
  Settings: Settings,
  ScanText: ScanText
};

export type IconName = keyof typeof Icons;