import React, { useEffect, useRef, useState } from 'react';
import { EditorState, ToolType } from '../types';
import { Icons } from './Icon';
import { TextFormatter } from './TextFormatter';
import { createMathSymbolGroup } from '../utils/mathSymbols';
import { createGraphFabricGroup, GraphData, parseEquation } from '../utils/graphDrawer';

interface CharStyle {
  fill?: string;
  fontWeight?: string;
  fontStyle?: string;
  underline?: boolean;
  [key: string]: any;
}

interface FabricStyles {
  [lineIndex: number]: {
    [charIndex: number]: CharStyle;
  };
}

const parseHtmlStyles = (input: string): { plainText: string; styles: FabricStyles } => {
  let preprocessed = input || "";
  // Preprocess Markdown bold/italic to HTML tags so the rest of the parsing works seamlessly
  preprocessed = preprocessed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  preprocessed = preprocessed.replace(/__(.*?)__/g, '<b>$1</b>');
  preprocessed = preprocessed.replace(/\*(.*?)\*/g, '<i>$1</i>');
  preprocessed = preprocessed.replace(/_(.*?)_/g, '<i>$1</i>');

  let plainText = "";
  const styles: FabricStyles = {};
  
  let currentLine = 0;
  let currentChar = 0;
  
  const stateStack: CharStyle[] = [];
  
  const tagRegex = /(?:<span[^>]*style=["'][^"']*color:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)[^"']*["'][^>]*>|<font[^>]*color=["']([^"']+)["'][^>]*>|\[color=([^\]]+)\]|<\/span>|<\/font>|\[\/color\]|<b>|\[b\]|<\/b>|\[\/b\]|<i>|\[i\]|<\/i>|\[\/i\]|<u>|\[u\]|<\/u>|\[\/u\]|<[^>]+>|\[[^\]]+\])/gi;
  
  let lastIdx = 0;
  let match;
  
  while ((match = tagRegex.exec(preprocessed)) !== null) {
    const matchIdx = match.index;
    const matchStr = match[0];
    
    const prevText = preprocessed.substring(lastIdx, matchIdx);
    for (let i = 0; i < prevText.length; i++) {
      const char = prevText[i];
      plainText += char;
      
      if (char === '\n') {
        currentLine++;
        currentChar = 0;
      } else {
        const mergedStyle: CharStyle = {};
        stateStack.forEach(s => {
          Object.assign(mergedStyle, s);
        });
        
        if (Object.keys(mergedStyle).length > 0) {
          if (!styles[currentLine]) {
            styles[currentLine] = {};
          }
          styles[currentLine][currentChar] = mergedStyle;
        }
        currentChar++;
      }
    }
    
    const lowerMatch = matchStr.toLowerCase();
    
    if (match[1]) {
      stateStack.push({ fill: match[1] });
    } else if (match[2]) {
      stateStack.push({ fill: match[2] });
    } else if (match[3]) {
      stateStack.push({ fill: match[3] });
    } else if (lowerMatch === '<b>' || lowerMatch === '[b]') {
      stateStack.push({ fontWeight: 'bold' });
    } else if (lowerMatch === '<i>' || lowerMatch === '[i]') {
      stateStack.push({ fontStyle: 'italic' });
    } else if (lowerMatch === '<u>' || lowerMatch === '[u]') {
      stateStack.push({ underline: true });
    } else if (
      lowerMatch === '</span>' || 
      lowerMatch === '</font>' || 
      lowerMatch === '[/color]' ||
      lowerMatch === '</b>' || 
      lowerMatch === '[/b]' || 
      lowerMatch === '</i>' || 
      lowerMatch === '[/i]' || 
      lowerMatch === '</u>' || 
      lowerMatch === '[/u]'
    ) {
      let targetProp: keyof CharStyle | null = null;
      if (lowerMatch === '</span>' || lowerMatch === '</font>' || lowerMatch === '[/color]') {
        targetProp = 'fill';
      } else if (lowerMatch === '</b>' || lowerMatch === '[/b]') {
        targetProp = 'fontWeight';
      } else if (lowerMatch === '</i>' || lowerMatch === '[/i]') {
        targetProp = 'fontStyle';
      } else if (lowerMatch === '</u>' || lowerMatch === '[/u]') {
        targetProp = 'underline';
      }
      
      if (targetProp) {
        for (let i = stateStack.length - 1; i >= 0; i--) {
          if (stateStack[i][targetProp] !== undefined) {
            stateStack.splice(i, 1);
            break;
          }
        }
      }
    }
    
    lastIdx = tagRegex.lastIndex;
  }
  
  const remainingText = preprocessed.substring(lastIdx);
  for (let i = 0; i < remainingText.length; i++) {
    const char = remainingText[i];
    plainText += char;
    
    if (char === '\n') {
      currentLine++;
      currentChar = 0;
    } else {
      const mergedStyle: CharStyle = {};
      stateStack.forEach(s => {
        Object.assign(mergedStyle, s);
      });
      
      if (Object.keys(mergedStyle).length > 0) {
        if (!styles[currentLine]) {
          styles[currentLine] = {};
        }
        styles[currentLine][currentChar] = mergedStyle;
      }
      currentChar++;
    }
  }
  
  return { plainText, styles };
};

const getHtmlFromFabric = (textObj: any): string => {
  if (!textObj) return '';
  const text = textObj.text || '';
  const styles = textObj.styles || {};
  
  const lines = text.split('\n');
  let htmlResult = '';
  
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx];
    const lineStyles = styles[lineIdx] || {};
    
    let lineHtml = '';
    let currentStyleStr = '';
    let currentChunk = '';
    
    const getStyleKey = (charIdx: number) => {
      const s = lineStyles[charIdx] || {};
      const fill = s.fill || textObj.fill || '';
      const isBold = s.fontWeight === 'bold' || textObj.fontWeight === 'bold';
      const isItalic = s.fontStyle === 'italic' || textObj.fontStyle === 'italic';
      const isUnderline = !!s.underline || !!textObj.underline;
      return JSON.stringify({ fill, isBold, isItalic, isUnderline });
    };
    
    for (let charIdx = 0; charIdx < lineText.length; charIdx++) {
      const char = lineText[charIdx];
      const styleKey = getStyleKey(charIdx);
      
      if (charIdx === 0) {
        currentStyleStr = styleKey;
        currentChunk = char;
      } else if (styleKey === currentStyleStr) {
        currentChunk += char;
      } else {
        lineHtml += wrapChunkWithStyle(currentChunk, JSON.parse(currentStyleStr), textObj);
        currentStyleStr = styleKey;
        currentChunk = char;
      }
    }
    
    if (currentChunk) {
      lineHtml += wrapChunkWithStyle(currentChunk, JSON.parse(currentStyleStr), textObj);
    }
    
    htmlResult += (lineIdx > 0 ? '\n' : '') + lineHtml;
  }
  
  return htmlResult;
};

const wrapChunkWithStyle = (chunk: string, style: any, textObj: any) => {
  let result = chunk;
  
  const defaultFill = textObj.fill || '#1f2937';
  const isDefaultFill = !style.fill || style.fill.toLowerCase() === defaultFill.toLowerCase();
  
  if (style.fill && !isDefaultFill) {
    result = `<span style="color:${style.fill}">${result}</span>`;
  }
  
  if (style.isUnderline) {
    result = `<u>${result}</u>`;
  }
  
  if (style.isItalic) {
    result = `<i>${result}</i>`;
  }
  
  if (style.isBold) {
    result = `<b>${result}</b>`;
  }
  
  return result;
};

const convertLatexToFabricElements = (
  rawText: string,
  startLeft: number,
  startTop: number,
  textColor: string,
  canvas: any,
  onModified?: () => void
) => {
  if (!canvas || typeof window === 'undefined' || !window.fabric) return;
  const fabric = window.fabric;

  const toSuperscript = (str: string): string => {
    const map: Record<string, string> = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ'
    };
    return str.split('').map(c => map[c] || c).join('');
  };

  const toSubscript = (str: string): string => {
    const map: Record<string, string> = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'n': 'ₙ', 'x': 'ₓ', 'y': 'ᵧ', 'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ'
    };
    return str.split('').map(c => map[c] || c).join('');
  };

  const isRtlText = (text: string): boolean => {
    const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return rtlRegex.test(text);
  };

  const parseLineToParts = (lineText: string): any[] => {
    const parts: any[] = [];
    let remaining = lineText.trim();
    
    // Normalize enclosing $$ or $
    remaining = remaining.replace(/^\$\$\s*/, '').replace(/\s*\$\$/, '');
    remaining = remaining.replace(/^\$\s*/, '').replace(/\s*\$/, '');
    
    while (remaining.length > 0) {
      // 1. Check for fraction: \frac{A}{B}
      const fracMatch = remaining.match(/^\\frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/);
      if (fracMatch) {
        parts.push({
          type: 'fraction',
          numerator: fracMatch[1],
          denominator: fracMatch[2]
        });
        remaining = remaining.substring(fracMatch[0].length).trim();
        continue;
      }
      
      // 2. Check for summation: \sum_{bottom}^{top}
      const sumMatch1 = remaining.match(/^\\sum\_\{((?:[^{}]|\{[^{}]*\})*)\}\^\{((?:[^{}]|\{[^{}]*\})*)\}/);
      if (sumMatch1) {
        parts.push({
          type: 'sigma_sum',
          bottomText: sumMatch1[1],
          topText: sumMatch1[2]
        });
        remaining = remaining.substring(sumMatch1[0].length).trim();
        continue;
      }
      const sumMatch2 = remaining.match(/^\\sum\^\{((?:[^{}]|\{[^{}]*\})*)\}\_\{((?:[^{}]|\{[^{}]*\})*)\}/);
      if (sumMatch2) {
        parts.push({
          type: 'sigma_sum',
          bottomText: sumMatch2[2],
          topText: sumMatch2[1]
        });
        remaining = remaining.substring(sumMatch2[0].length).trim();
        continue;
      }
      if (remaining.startsWith('\\sum')) {
        parts.push({
          type: 'sigma_sum',
          bottomText: 'i=1',
          topText: 'n'
        });
        remaining = remaining.substring(4).trim();
        continue;
      }

      // 3. Check for limits: \lim_{bottom}
      const limMatch = remaining.match(/^\\lim\_\{((?:[^{}]|\{[^{}]*\})*)\}/);
      if (limMatch) {
        parts.push({
          type: 'limit',
          bottomText: limMatch[1],
          topText: ' '
        });
        remaining = remaining.substring(limMatch[0].length).trim();
        continue;
      }
      if (remaining.startsWith('\\lim')) {
        parts.push({
          type: 'limit',
          bottomText: 'x→∞',
          topText: ' '
        });
        remaining = remaining.substring(4).trim();
        continue;
      }

      // 4. Check for integral: \int_{bottom}^{top}
      const intMatch1 = remaining.match(/^\\int\_\{((?:[^{}]|\{[^{}]*\})*)\}\^\{((?:[^{}]|\{[^{}]*\})*)\}/);
      if (intMatch1) {
        parts.push({
          type: 'definite_integral',
          bottomText: intMatch1[1],
          topText: intMatch1[2]
        });
        remaining = remaining.substring(intMatch1[0].length).trim();
        continue;
      }
      const intMatch2 = remaining.match(/^\\int\^\{((?:[^{}]|\{[^{}]*\})*)\}\_\{((?:[^{}]|\{[^{}]*\})*)\}/);
      if (intMatch2) {
        parts.push({
          type: 'definite_integral',
          bottomText: intMatch2[2],
          topText: intMatch2[1]
        });
        remaining = remaining.substring(intMatch2[0].length).trim();
        continue;
      }
      if (remaining.startsWith('\\int')) {
        parts.push({
          type: 'definite_integral',
          bottomText: 'a',
          topText: 'b'
        });
        remaining = remaining.substring(4).trim();
        continue;
      }

      // 5. Read text until next control block
      const nextControlIdx = remaining.search(/\\frac|\\sum|\\lim|\\int/);
      let textChunk = '';
      if (nextControlIdx === -1) {
        textChunk = remaining;
        remaining = '';
      } else {
        textChunk = remaining.substring(0, nextControlIdx);
        remaining = remaining.substring(nextControlIdx);
      }
      
      if (textChunk) {
        textChunk = textChunk.replace(/\\textbf\{([^}]+)\}/g, '<b>$1</b>');
        textChunk = textChunk.replace(/\\textit\{([^}]+)\}/g, '<i>$1</i>');
        textChunk = textChunk.replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>');
        
        textChunk = textChunk.replace(/\\sqrt\{([^}]+)\}/g, '√$1');
        textChunk = textChunk.replace(/\\sqrt\s*([a-zA-Z0-9]+)/g, '√$1');
        textChunk = textChunk.replace(/\\times/g, '×');
        textChunk = textChunk.replace(/\\div/g, '÷');
        textChunk = textChunk.replace(/\\pm/g, '±');
        textChunk = textChunk.replace(/\\mp/g, '∓');
        textChunk = textChunk.replace(/\\ge(q)?/g, '≥');
        textChunk = textChunk.replace(/\\le(q)?/g, '≤');
        textChunk = textChunk.replace(/\\ne(q)?/g, '≠');
        textChunk = textChunk.replace(/\\approx/g, '≈');
        textChunk = textChunk.replace(/\\infty/g, '∞');
        textChunk = textChunk.replace(/\\theta/g, 'θ');
        textChunk = textChunk.replace(/\\pi/g, 'π');
        textChunk = textChunk.replace(/\\alpha/g, 'α');
        textChunk = textChunk.replace(/\\beta/g, 'β');
        textChunk = textChunk.replace(/\\gamma/g, 'γ');
        textChunk = textChunk.replace(/\\lambda/g, 'λ');
        textChunk = textChunk.replace(/\\rho/g, 'ρ');
        textChunk = textChunk.replace(/\\mu/g, 'μ');
        textChunk = textChunk.replace(/\\delta/g, 'δ');
        textChunk = textChunk.replace(/\\Delta/g, 'Δ');
        textChunk = textChunk.replace(/\\sigma/g, 'σ');
        textChunk = textChunk.replace(/\\Sigma/g, 'Σ');
        textChunk = textChunk.replace(/\\omega/g, 'ω');
        textChunk = textChunk.replace(/\\Omega/g, 'Ω');
        textChunk = textChunk.replace(/\\phi/g, 'φ');
        textChunk = textChunk.replace(/\\degree/g, '°');
        textChunk = textChunk.replace(/\\rightarrow|\\to/g, '→');
        textChunk = textChunk.replace(/\\leftarrow/g, '←');
        textChunk = textChunk.replace(/\\leftrightarrow/g, '↔');
        textChunk = textChunk.replace(/\\left\||\\right\|/g, '|');
        textChunk = textChunk.replace(/\\left\s*([\[\(\{\|\\])/g, '$1');
        textChunk = textChunk.replace(/\\right\s*([\]\)\}\|\\])/g, '$1');
        textChunk = textChunk.replace(/\\quad/g, '    ');
        textChunk = textChunk.replace(/\\qquad/g, '        ');

        textChunk = textChunk.replace(/\^\{([^}]+)\}/g, (m, p) => toSuperscript(p));
        textChunk = textChunk.replace(/\^([0-9xy\+\-n])/g, (m, p) => toSuperscript(p));

        textChunk = textChunk.replace(/\_\{([^}]+)\}/g, (m, p) => toSubscript(p));
        textChunk = textChunk.replace(/\_([0-9\+\-nxy])/g, (m, p) => toSubscript(p));

        textChunk = textChunk.replace(/\$\$/g, '').replace(/\$/g, '');

        parts.push({
          type: 'text',
          text: textChunk
        });
      }
    }
    return parts;
  };

  const lines = rawText.split('\n');
  let currentTop = startTop;

  lines.forEach((lineText) => {
    if (!lineText.trim()) {
      currentTop += 40;
      return;
    }

    const parts = parseLineToParts(lineText);
    if (parts.length === 0) return;

    const lineIsRtl = parts.some((p) => p.type === 'text' && isRtlText(p.text));

    // Calculate dimensions of each part for layout
    const partWidths = parts.map((p) => {
      const fSize = 20; // Default rendering size
      if (p.type === 'text') {
        return (p.text.length * fSize * 0.55) + 12;
      } else if (p.type === 'fraction') {
        const maxLen = Math.max((p.numerator || '').length, (p.denominator || '').length);
        return (maxLen * 12) + 24;
      } else {
        return 50; // Math symbol default width
      }
    });

    const totalWidth = partWidths.reduce((sum, w) => sum + w, 0);
    let currentLeft = lineIsRtl ? startLeft + (totalWidth / 2) : startLeft - (totalWidth / 2);

    parts.forEach((p, idx) => {
      const pWidth = partWidths[idx];
      const leftPos = lineIsRtl ? currentLeft - pWidth : currentLeft;

      if (p.type === 'text') {
        const { plainText, styles: parsedStyles } = parseHtmlStyles(p.text);
        const textObj = new fabric.Textbox(plainText, {
          left: leftPos,
          top: currentTop,
          width: pWidth + 50, // Give some extra padding for wrap prevention
          fontSize: 20,
          fill: textColor,
          fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
          selectable: true,
          originX: 'left',
          originY: 'center',
          textAlign: lineIsRtl ? 'right' : 'left',
          splitByGrapheme: true,
          styles: parsedStyles
        });
        textObj.rawHtmlText = p.text;
        canvas.add(textObj);
      } else {
        const mathGroup = createMathSymbolGroup(
          p.type,
          leftPos + (pWidth / 2),
          currentTop,
          textColor,
          {
            numerator: p.numerator,
            denominator: p.denominator,
            topText: p.topText,
            bottomText: p.bottomText
          }
        );
        if (mathGroup) {
          mathGroup.set({
            originX: 'center',
            originY: 'center',
            left: leftPos + (pWidth / 2),
            top: currentTop
          });
          canvas.add(mathGroup);
        }
      }

      currentLeft = lineIsRtl ? currentLeft - pWidth : currentLeft + pWidth;
    });

    const hasFraction = parts.some((p) => p.type === 'fraction');
    currentTop += hasFraction ? 65 : 45;
  });

  if (onModified) onModified();
};

export const createTableGroup = (
  rows: number,
  cols: number,
  cellGap: number,
  cellWidth: number,
  cellHeight: number,
  cellTexts: string[],
  left: number,
  top: number,
  strokeColor: string,
  strokeWidth: number,
  mergedRanges: Array<{ r1: number; c1: number; r2: number; c2: number }> = [],
  tableFillColor: string = 'rgba(255, 255, 255, 0.9)',
  tableTextColor: string = '#1f2937',
  hideHeaderBorders: boolean = false,
  hideMiddleBorders: boolean = false,
  hideFooterBorders: boolean = false,
  transparentHeaderBg: boolean = false,
  transparentMiddleBg: boolean = false,
  transparentFooterBg: boolean = false
) => {
  if (!window.fabric) return null;
  
  const objects: any[] = [];
  
  // Helper to find if cell is in a merged range
  const getMergeInfo = (r: number, c: number) => {
    for (const range of mergedRanges) {
      if (r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2) {
        return {
          isMerged: true,
          isPrimary: r === range.r1 && c === range.c1,
          range
        };
      }
    }
    return { isMerged: false, isPrimary: false, range: null };
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { isMerged, isPrimary, range } = getMergeInfo(r, c);
      
      // If it's part of a merge but not the primary, skip rendering
      if (isMerged && !isPrimary) continue;
      
      let width = cellWidth;
      let height = cellHeight;
      
      if (isMerged && range) {
        const colSpan = range.c2 - range.c1 + 1;
        const rowSpan = range.r2 - range.r1 + 1;
        width = colSpan * cellWidth + (colSpan - 1) * cellGap;
        height = rowSpan * cellHeight + (rowSpan - 1) * cellGap;
      }
      
      const cellLeft = c * (cellWidth + cellGap);
      const cellTop = r * (cellHeight + cellGap);
      
      // Determine Fill Color
      let fill = tableFillColor;
      if (r === 0 && transparentHeaderBg) {
        fill = 'transparent';
      } else if (r === rows - 1 && rows > 1 && transparentFooterBg) {
        fill = 'transparent';
      } else if (r > 0 && r < rows - 1 && transparentMiddleBg) {
        fill = 'transparent';
      }
      
      // Determine Stroke Settings
      let stroke = strokeColor || '#3b82f6';
      let sWidth = strokeWidth || 2;
      
      if (r === 0 && hideHeaderBorders) {
        stroke = 'transparent';
        sWidth = 0;
      } else if (r === rows - 1 && rows > 1 && hideFooterBorders) {
        stroke = 'transparent';
        sWidth = 0;
      } else if (r > 0 && r < rows - 1 && hideMiddleBorders) {
        stroke = 'transparent';
        sWidth = 0;
      }
      
      const cellRect = new window.fabric.Rect({
        left: cellLeft,
        top: cellTop,
        width: width,
        height: height,
        fill: fill,
        stroke: stroke,
        strokeWidth: sWidth,
        rx: 4,
        ry: 4,
        selectable: false
      });
      objects.push(cellRect);
      
      const textIndex = r * cols + c;
      const textContent = cellTexts[textIndex] || '';
      
      const cellText = new window.fabric.Text(textContent, {
        left: cellLeft + width / 2,
        top: cellTop + height / 2,
        originX: 'center',
        originY: 'center',
        fill: tableTextColor || '#1f2937',
        fontSize: Math.min(14, height - 6),
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        textAlign: 'center',
        selectable: false
      });
      objects.push(cellText);
    }
  }
  
  const tableGroup = new window.fabric.Group(objects, {
    left: left,
    top: top,
    selectable: true,
    hasControls: true,
    isTable: true,
    rowsCount: rows,
    colsCount: cols,
    cellGap: cellGap,
    cellWidth: cellWidth,
    cellHeight: cellHeight,
    cellTexts: cellTexts,
    strokeColor: strokeColor,
    strokeWidth: strokeWidth,
    
    // Custom saved props
    mergedRanges: mergedRanges,
    tableFillColor: tableFillColor,
    tableTextColor: tableTextColor,
    hideHeaderBorders: hideHeaderBorders,
    hideMiddleBorders: hideMiddleBorders,
    hideFooterBorders: hideFooterBorders,
    transparentHeaderBg: transparentHeaderBg,
    transparentMiddleBg: transparentMiddleBg,
    transparentFooterBg: transparentFooterBg
  });
  
  return tableGroup;
};

interface PageEditorProps {
  pageNumber: number;
  bgImage: string;
  viewport: any;
  editorState: EditorState;
  isActive: boolean;
  onCanvasReady: (pageNumber: number, canvas: any) => void;
  onModified: () => void;
  isRecording?: boolean;
  onToggleRecording?: () => void;
  apiKey?: string;
  onOpenSettings?: () => void;
  onTextSelection?: (canvas: any, object: any) => void;
  onOpenFormatter?: () => void;
  showFormatterSidebar?: boolean;
}

const PageEditor: React.FC<PageEditorProps> = ({ 
  pageNumber, 
  bgImage, 
  viewport, 
  editorState, 
  isActive, 
  onCanvasReady,
  onModified,
  isRecording = false,
  onToggleRecording,
  apiKey = '',
  onOpenSettings,
  onTextSelection,
  onOpenFormatter,
  showFormatterSidebar = false
}) => {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef<boolean>(false);
  const [activeTextObject, setActiveTextObject] = useState<any>(null);
  const [isEditingMode, setIsEditingMode] = useState<boolean>(false);
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const [mergeStartRow, setMergeStartRow] = useState<number>(0);
  const [mergeStartCol, setMergeStartCol] = useState<number>(0);
  const [mergeEndRow, setMergeEndRow] = useState<number>(0);
  const [mergeEndCol, setMergeEndCol] = useState<number>(0);

  const [isCodeEditorOpen, setIsCodeEditorOpen] = useState<boolean>(false);
  const [codeEditorText, setCodeEditorText] = useState<string>('');
  const [editingObject, setEditingObject] = useState<any>(null);

  // Touch Selection Handles States and Refs
  const [handleCoords, setHandleCoords] = useState<{
    start: { x: number; y: number; bottomY: number; lineHeight: number } | null;
    end: { x: number; y: number; bottomY: number; lineHeight: number } | null;
  }>({ start: null, end: null });

  const dragTypeRef = useRef<'start' | 'end' | null>(null);

  // States for Fraction Customization Panel
  const [fractionNumText, setFractionNumText] = useState('a');
  const [fractionDenText, setFractionDenText] = useState('b');
  const [fractionNumColor, setFractionNumColor] = useState('#1f2937');
  const [fractionDenColor, setFractionDenColor] = useState('#1f2937');
  const [fractionLineColor, setFractionLineColor] = useState('#1f2937');
  const [fractionLineThickness, setFractionLineThickness] = useState(2);
  const [fractionLineWidthPadding, setFractionLineWidthPadding] = useState(12);
  const [fractionFontSize, setFractionFontSize] = useState(20);

  // States for general math symbols (Sigma, Product, Definite Integral, Limit)
  const [mathMainText, setMathMainText] = useState('∑');
  const [mathTopText, setMathTopText] = useState('n');
  const [mathBottomText, setMathBottomText] = useState('i=1');
  const [mathMainColor, setMathMainColor] = useState('#1f2937');
  const [mathTopColor, setMathTopColor] = useState('#1f2937');
  const [mathBottomColor, setMathBottomColor] = useState('#1f2937');
  const [mathFontSize, setMathFontSize] = useState(36);
  const [mathTopFontSize, setMathTopFontSize] = useState(12);
  const [mathBottomFontSize, setMathBottomFontSize] = useState(12);

  // States for Mathematical Graphs Customization Panel
  const [graphQuestionText, setGraphQuestionText] = useState('نەخشەیێ بیرکاری (Math Graph)');
  const [graphXMin, setGraphXMin] = useState(-6);
  const [graphXMax, setGraphXMax] = useState(6);
  const [graphYMin, setGraphYMin] = useState(-6);
  const [graphYMax, setGraphYMax] = useState(6);
  const [graphXStep, setGraphXStep] = useState(1);
  const [graphYStep, setGraphYStep] = useState(1);
  const [graphType, setGraphType] = useState<'linear' | 'quadratic' | 'points'>('linear');
  const [graphLinearM, setGraphLinearM] = useState(1);
  const [graphLinearC, setGraphLinearC] = useState(0);
  const [graphQuadA, setGraphQuadA] = useState(0.5);
  const [graphQuadB, setGraphQuadB] = useState(0);
  const [graphQuadC, setGraphQuadC] = useState(-2);
  const [graphPointsText, setGraphPointsText] = useState('-3,-2; -1,2; 2,1; 4,5');
  const [graphLineColor, setGraphLineColor] = useState('#06b6d4');
  const [graphBgColor, setGraphBgColor] = useState('#0f172a');
  const [graphShowGrid, setGraphShowGrid] = useState(true);
  const [graphFreeFormEq, setGraphFreeFormEq] = useState('y = x');
  const [graphLineThickness, setGraphLineThickness] = useState(3);
  const [graphLineStyle, setGraphLineStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [graphEquations, setGraphEquations] = useState<any[]>([]);

  const handleScrollActiveObjectToTop = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (!activeObj) return;

    setTimeout(() => {
      try {
        const canvasEl = canvasElRef.current;
        if (canvasEl) {
          const canvasRect = canvasEl.getBoundingClientRect();
          const scrollContainer = canvasEl.closest('.overflow-auto, .overflow-y-auto') || document.querySelector('.main-content-scroll-container');
          
          if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const containerScrollTop = scrollContainer.scrollTop;
            
            // Fabric's getBoundingRect returns coords relative to canvas top-left in CSS pixels
            const objRect = activeObj.getBoundingRect(true, true);
            const objViewportTop = canvasRect.top + objRect.top;
            const objRelativeToContainerViewport = objViewportTop - containerRect.top;
            
            const targetScrollTop = containerScrollTop + objRelativeToContainerViewport - 50;
            
            scrollContainer.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          } else {
            // Fallback scroll ONLY if no scrollable container is found
            const objRect = activeObj.getBoundingRect(true, true);
            const boxAbsoluteTop = window.scrollY + canvasRect.top + objRect.top;
            const targetY = boxAbsoluteTop - 50;
            
            window.scrollTo({
              top: Math.max(0, targetY),
              behavior: 'smooth'
            });
          }
        }
      } catch (err) {
        console.error("Scrolling active object failed:", err);
      }
    }, 150);
  };

  // Sync Fraction and Math Symbol States on activeTextObject change
  useEffect(() => {
    if (!activeTextObject) return;

    if (activeTextObject.isFractionGroup) {
      const items = activeTextObject.getObjects();
      const numText = items.find((item: any) => item.fractionRole === 'numerator') || items[0];
      const denText = items.find((item: any) => item.fractionRole === 'denominator') || items[1];
      const line = items.find((item: any) => item.fractionRole === 'line') || items[2];

      if (numText) {
        setFractionNumText(numText.text || '');
        setFractionNumColor(numText.fill || '#1f2937');
        setFractionFontSize(numText.fontSize || 20);
      }
      if (denText) {
        setFractionDenText(denText.text || '');
        setFractionDenColor(denText.fill || '#1f2937');
      }
      if (line) {
        setFractionLineColor(line.stroke || '#1f2937');
        setFractionLineThickness(line.strokeWidth || 2);
        const textWidth = Math.max(numText?.width || 0, denText?.width || 0);
        const lineLength = Math.abs(line.x2 - line.x1);
        setFractionLineWidthPadding(Math.max(0, lineLength - textWidth));
      }
    } else if (activeTextObject.isMathSymbolGroup) {
      const items = activeTextObject.getObjects();
      const main = items.find((item: any) => item.mathRole === 'main') || items[0];
      const top = items.find((item: any) => item.mathRole === 'top');
      const bottom = items.find((item: any) => item.mathRole === 'bottom');

      if (main) {
        setMathMainText(main.text || '');
        setMathMainColor(main.fill || '#1f2937');
        setMathFontSize(main.fontSize || 36);
      }
      if (top) {
        setMathTopText(top.text || '');
        setMathTopColor(top.fill || '#1f2937');
        setMathTopFontSize(top.fontSize || 12);
      } else {
        setMathTopText('');
      }
      if (bottom) {
        setMathBottomText(bottom.text || '');
        setMathBottomColor(bottom.fill || '#1f2937');
        setMathBottomFontSize(bottom.fontSize || 12);
      } else {
        setMathBottomText('');
      }
    } else if (activeTextObject.isGraphGroup) {
      const g = activeTextObject.graphData;
      if (g) {
        setGraphQuestionText(g.questionText || '');
        setGraphXMin(g.xMin !== undefined ? g.xMin : -6);
        setGraphXMax(g.xMax !== undefined ? g.xMax : 6);
        setGraphYMin(g.yMin !== undefined ? g.yMin : -6);
        setGraphYMax(g.yMax !== undefined ? g.yMax : 6);
        setGraphXStep(g.xStep !== undefined ? g.xStep : 1);
        setGraphYStep(g.yStep !== undefined ? g.yStep : 1);
        setGraphType(g.graphType || 'linear');
        setGraphLinearM(g.linearEq?.m !== undefined ? g.linearEq.m : 1);
        setGraphLinearC(g.linearEq?.c !== undefined ? g.linearEq.c : 0);
        setGraphQuadA(g.quadEq?.a !== undefined ? g.quadEq.a : 0.5);
        setGraphQuadB(g.quadEq?.b !== undefined ? g.quadEq.b : 0);
        setGraphQuadC(g.quadEq?.c !== undefined ? g.quadEq.c : -2);
        setGraphLineColor(g.lineColor || '#06b6d4');
        setGraphBgColor(g.bgColor || '#0f172a');
        setGraphShowGrid(g.showGrid !== undefined ? g.showGrid : true);
        setGraphLineThickness(g.lineThickness !== undefined ? g.lineThickness : 3);
        setGraphLineStyle(g.lineStyle || 'solid');
        
        const initialEqs = g.equations && g.equations.length > 0 
          ? g.equations 
          : [
              {
                id: 'eq-1',
                freeFormEq: g.freeFormEq || (g.graphType === 'linear' ? 'y = 1x' : 'y = 0.5x² - 2'),
                type: g.graphType === 'points' ? 'linear' : g.graphType,
                linearEq: g.linearEq || { m: 1, c: 0 },
                quadEq: g.quadEq || { a: 0.5, b: 0, c: -2 },
                lineColor: g.lineColor || '#06b6d4',
                lineThickness: g.lineThickness !== undefined ? g.lineThickness : 3,
                lineStyle: g.lineStyle || 'solid'
              }
            ];
        setGraphEquations(initialEqs);
        
        const ptsStr = (g.points || []).map((p: any) => `${p.x},${p.y}`).join('; ');
        setGraphPointsText(ptsStr);

        const freeFormString = g.freeFormEq || (g.graphType === 'linear' 
          ? `y = ${g.linearEq?.m !== undefined ? g.linearEq.m : 1}x ${g.linearEq?.c !== undefined && g.linearEq.c >= 0 ? `+ ${g.linearEq.c}` : `- ${Math.abs(g.linearEq?.c || 0)}`}`
          : `y = ${g.quadEq?.a !== undefined ? g.quadEq.a : 0.5}x² ${g.quadEq?.b !== undefined && g.quadEq.b >= 0 ? `+ ${g.quadEq.b}x` : `- ${Math.abs(g.quadEq?.b || 0)}x`} ${g.quadEq?.c !== undefined && g.quadEq.c >= 0 ? `+ ${g.quadEq.c}` : `- ${Math.abs(g.quadEq?.c || 0)}`}`);
        setGraphFreeFormEq(freeFormString);
      }
    }
  }, [activeTextObject]);

  // Fraction live update helper
  const handleUpdateFractionItem = (updates: {
    numText?: string;
    denText?: string;
    numColor?: string;
    denColor?: string;
    lineColor?: string;
    thickness?: number;
    padding?: number;
    fontSize?: number;
  }) => {
    if (!fabricCanvasRef.current || !activeTextObject || !activeTextObject.isFractionGroup) return;
    
    isUpdatingRef.current = true;
    try {
      const canvas = fabricCanvasRef.current;
      const group = activeTextObject;
      const items = group.getObjects();
      const originalNum = items.find((item: any) => item.fractionRole === 'numerator') || items[0];
      const originalDen = items.find((item: any) => item.fractionRole === 'denominator') || items[1];
      const originalLine = items.find((item: any) => item.fractionRole === 'line') || items[2];
      
      if (!originalNum || !originalDen || !originalLine) return;

      const numTextValue = updates.numText !== undefined ? updates.numText : originalNum.text || '';
      const denTextValue = updates.denText !== undefined ? updates.denText : originalDen.text || '';
      
      const numColorValue = updates.numColor !== undefined ? updates.numColor : originalNum.fill || '#1f2937';
      const denColorValue = updates.denColor !== undefined ? updates.denColor : originalDen.fill || '#1f2937';
      const lineColorValue = updates.lineColor !== undefined ? updates.lineColor : originalLine.stroke || '#1f2937';
      
      const thicknessValue = updates.thickness !== undefined ? updates.thickness : originalLine.strokeWidth || 2;
      const fSize = updates.fontSize !== undefined ? updates.fontSize : originalNum.fontSize || 20;
      const padValue = updates.padding !== undefined ? updates.padding : fractionLineWidthPadding;

      if (updates.numText !== undefined) setFractionNumText(updates.numText);
      if (updates.denText !== undefined) setFractionDenText(updates.denText);
      if (updates.numColor !== undefined) setFractionNumColor(updates.numColor);
      if (updates.denColor !== undefined) setFractionDenColor(updates.denColor);
      if (updates.lineColor !== undefined) setFractionLineColor(updates.lineColor);
      if (updates.thickness !== undefined) setFractionLineThickness(updates.thickness);
      if (updates.padding !== undefined) setFractionLineWidthPadding(updates.padding);
      if (updates.fontSize !== undefined) setFractionFontSize(updates.fontSize);

      const left = group.left;
      const topPos = group.top;
      const angle = group.angle;
      const scaleX = group.scaleX;
      const scaleY = group.scaleY;
      const fractionId = group.fractionId || ('fraction_' + Date.now());

      // Recreate ITexts temporarily to measure exact width
      const numTextObj = new window.fabric.IText(numTextValue, {
        fontSize: fSize,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
      });
      const denTextObj = new window.fabric.IText(denTextValue, {
        fontSize: fSize,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
      });

      const maxTextWidth = Math.max(numTextObj.width || 40, denTextObj.width || 40);
      const lineLength = maxTextWidth + padValue;

      const newNum = new window.fabric.IText(numTextValue, {
        fontSize: fSize,
        fill: numColorValue,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        textAlign: 'center',
        originX: 'center',
        originY: 'bottom',
        left: 0,
        top: -6,
        hasControls: false,
        lockRotation: true,
        fractionRole: 'numerator',
      });

      const newDen = new window.fabric.IText(denTextValue, {
        fontSize: fSize,
        fill: denColorValue,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        textAlign: 'center',
        originX: 'center',
        originY: 'top',
        left: 0,
        top: 6,
        hasControls: false,
        lockRotation: true,
        fractionRole: 'denominator',
      });

      const newLine = new window.fabric.Line([-lineLength / 2, 0, lineLength / 2, 0], {
        stroke: lineColorValue,
        strokeWidth: thicknessValue,
        originX: 'center',
        originY: 'center',
        left: 0,
        top: 0,
        fractionRole: 'line',
      });

      const newGroup = new window.fabric.Group([newNum, newDen, newLine], {
        left: left,
        top: topPos,
        angle: angle,
        scaleX: scaleX,
        scaleY: scaleY,
        selectable: true,
        isFractionGroup: true,
        fractionId: fractionId,
        fractionColor: lineColorValue,
      });

      canvas.remove(group);
      canvas.add(newGroup);
      canvas.setActiveObject(newGroup);
      canvas.renderAll();
      
      setActiveTextObject(newGroup);
      onModified();
    } finally {
      isUpdatingRef.current = false;
    }
  };

  // General Math Symbol live update helper
  const handleUpdateMathItem = (updates: {
    mainText?: string;
    topText?: string;
    bottomText?: string;
    mainColor?: string;
    topColor?: string;
    bottomColor?: string;
    fontSize?: number;
    topFontSize?: number;
    bottomFontSize?: number;
  }) => {
    if (!fabricCanvasRef.current || !activeTextObject || !activeTextObject.isMathSymbolGroup) return;
    
    isUpdatingRef.current = true;
    try {
      const canvas = fabricCanvasRef.current;
      const group = activeTextObject;
      const items = group.getObjects();
      const originalMain = items.find((item: any) => item.mathRole === 'main') || items[0];
      const originalTop = items.find((item: any) => item.mathRole === 'top');
      const originalBottom = items.find((item: any) => item.mathRole === 'bottom');

      if (!originalMain) return;

      const mainTextVal = updates.mainText !== undefined ? updates.mainText : originalMain.text || '';
      const topTextVal = updates.topText !== undefined ? updates.topText : (originalTop ? originalTop.text || '' : '');
      const bottomTextVal = updates.bottomText !== undefined ? updates.bottomText : (originalBottom ? originalBottom.text || '' : '');

      const mainColorVal = updates.mainColor !== undefined ? updates.mainColor : originalMain.fill || '#1f2937';
      const topColorVal = updates.topColor !== undefined ? updates.topColor : (originalTop ? originalTop.fill || '#1f2937' : '#1f2937');
      const bottomColorVal = updates.bottomColor !== undefined ? updates.bottomColor : (originalBottom ? originalBottom.fill || '#1f2937' : '#1f2937');

      const fSize = updates.fontSize !== undefined ? updates.fontSize : originalMain.fontSize || 36;
      const tSize = updates.topFontSize !== undefined ? updates.topFontSize : (originalTop ? originalTop.fontSize || 12 : 12);
      const bSize = updates.bottomFontSize !== undefined ? updates.bottomFontSize : (originalBottom ? originalBottom.fontSize || 12 : 12);

      if (updates.mainText !== undefined) setMathMainText(updates.mainText);
      if (updates.topText !== undefined) setMathTopText(updates.topText);
      if (updates.bottomText !== undefined) setMathBottomText(updates.bottomText);
      if (updates.mainColor !== undefined) setMathMainColor(updates.mainColor);
      if (updates.topColor !== undefined) setMathTopColor(updates.topColor);
      if (updates.bottomColor !== undefined) setMathBottomColor(updates.bottomColor);
      if (updates.fontSize !== undefined) setMathFontSize(updates.fontSize);
      if (updates.topFontSize !== undefined) setMathTopFontSize(updates.topFontSize);
      if (updates.bottomFontSize !== undefined) setMathBottomFontSize(updates.bottomFontSize);

      const left = group.left;
      const topPos = group.top;
      const angle = group.angle;
      const scaleX = group.scaleX;
      const scaleY = group.scaleY;
      const mathId = group.mathId || ('math_' + Date.now());
      const mathSymbolType = group.mathSymbolType || 'sigma_sum';

      const newMain = new window.fabric.Text(mainTextVal, {
        fontSize: fSize,
        fill: mainColorVal,
        fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
        originX: 'center',
        originY: 'center',
        left: 0,
        top: 0,
        mathRole: 'main'
      });

      const newObjects: any[] = [newMain];

      if (originalTop || updates.topText !== undefined) {
        const topOffset = mathSymbolType === 'definite_integral' ? -14 : -20;
        const topOriginX = mathSymbolType === 'definite_integral' ? 'left' : 'center';
        const topLeft = mathSymbolType === 'definite_integral' ? 8 : 0;
        
        const newTop = new window.fabric.Text(topTextVal, {
          fontSize: tSize,
          fill: topColorVal,
          fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
          originX: topOriginX,
          originY: 'bottom',
          left: topLeft,
          top: topOffset,
          mathRole: 'top'
        });
        newObjects.push(newTop);
      }

      if (originalBottom || updates.bottomText !== undefined) {
        const bottomOffset = mathSymbolType === 'definite_integral' ? 14 : (mathSymbolType === 'limit' ? 2 : 20);
        const bottomOriginX = mathSymbolType === 'definite_integral' ? 'left' : 'center';
        const bottomLeft = mathSymbolType === 'definite_integral' ? 4 : 0;

        const newBottom = new window.fabric.Text(bottomTextVal, {
          fontSize: bSize,
          fill: bottomColorVal,
          fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
          originX: bottomOriginX,
          originY: 'top',
          left: bottomLeft,
          top: bottomOffset,
          mathRole: 'bottom'
        });
        newObjects.push(newBottom);
      }

      const newGroup = new window.fabric.Group(newObjects, {
        left: left,
        top: topPos,
        angle: angle,
        scaleX: scaleX,
        scaleY: scaleY,
        selectable: true,
        isMathSymbolGroup: true,
        mathSymbolType: mathSymbolType,
        mathId: mathId
      });

      canvas.remove(group);
      canvas.add(newGroup);
      canvas.setActiveObject(newGroup);
      canvas.renderAll();

      setActiveTextObject(newGroup);
      onModified();
    } finally {
      isUpdatingRef.current = false;
    }
  };

  // Mathematical Graph live update helper
  const handleUpdateGraphItem = (updates: Partial<GraphData>) => {
    if (!fabricCanvasRef.current || !activeTextObject || !activeTextObject.isGraphGroup) return;

    isUpdatingRef.current = true;
    try {
      const canvas = fabricCanvasRef.current;
      const group = activeTextObject;
      const currentData = group.graphData;
      const mergedData = { ...currentData, ...updates };

      if (updates.questionText !== undefined) setGraphQuestionText(updates.questionText);
      if (updates.xMin !== undefined) setGraphXMin(updates.xMin);
      if (updates.xMax !== undefined) setGraphXMax(updates.xMax);
      if (updates.yMin !== undefined) setGraphYMin(updates.yMin);
      if (updates.yMax !== undefined) setGraphYMax(updates.yMax);
      if (updates.xStep !== undefined) setGraphXStep(updates.xStep);
      if (updates.yStep !== undefined) setGraphYStep(updates.yStep);
      if (updates.graphType !== undefined) setGraphType(updates.graphType);
      if (updates.linearEq !== undefined) {
        if (updates.linearEq.m !== undefined) setGraphLinearM(updates.linearEq.m);
        if (updates.linearEq.c !== undefined) setGraphLinearC(updates.linearEq.c);
      }
      if (updates.quadEq !== undefined) {
        if (updates.quadEq.a !== undefined) setGraphQuadA(updates.quadEq.a);
        if (updates.quadEq.b !== undefined) setGraphQuadB(updates.quadEq.b);
        if (updates.quadEq.c !== undefined) setGraphQuadC(updates.quadEq.c);
      }
      if (updates.points !== undefined) {
        const ptsStr = updates.points.map((p: any) => `${p.x},${p.y}`).join('; ');
        setGraphPointsText(ptsStr);
      }
      if (updates.lineColor !== undefined) setGraphLineColor(updates.lineColor);
      if (updates.bgColor !== undefined) setGraphBgColor(updates.bgColor);
      if (updates.showGrid !== undefined) setGraphShowGrid(updates.showGrid);
      if (updates.freeFormEq !== undefined) setGraphFreeFormEq(updates.freeFormEq);
      if (updates.lineThickness !== undefined) setGraphLineThickness(updates.lineThickness);
      if (updates.lineStyle !== undefined) setGraphLineStyle(updates.lineStyle);
      if (updates.equations !== undefined) setGraphEquations(updates.equations);

      const left = group.left;
      const topPos = group.top;
      const angle = group.angle;
      const scaleX = group.scaleX;
      const scaleY = group.scaleY;

      const newGroup = createGraphFabricGroup(left, topPos, mergedData);
      if (newGroup) {
        newGroup.set({
          angle: angle,
          scaleX: scaleX,
          scaleY: scaleY
        });

        canvas.remove(group);
        canvas.add(newGroup);
        canvas.setActiveObject(newGroup);
        canvas.renderAll();

        setActiveTextObject(newGroup);
        onModified();
      }
    } finally {
      isUpdatingRef.current = false;
    }
  };

  const getActiveEquations = (): any[] => {
    if (graphEquations && graphEquations.length > 0) {
      return graphEquations;
    }
    return [
      {
        id: 'eq-1',
        freeFormEq: graphFreeFormEq || 'y = 1x',
        type: graphType === 'points' ? 'linear' : graphType,
        linearEq: { m: graphLinearM, c: graphLinearC },
        quadEq: { a: graphQuadA, b: graphQuadB, c: graphQuadC },
        lineColor: graphLineColor,
        lineThickness: graphLineThickness,
        lineStyle: graphLineStyle
      }
    ];
  };

  const handleAddEquation = () => {
    const activeEqs = getActiveEquations();
    const colors = ['#06b6d4', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
    const nextColor = colors[activeEqs.length % colors.length];
    const newEq = {
      id: `eq-${Date.now()}`,
      freeFormEq: 'y = 2x',
      type: 'linear' as const,
      linearEq: { m: 2, c: 0 },
      quadEq: { a: 0.5, b: 0, c: -2 },
      lineColor: nextColor,
      lineThickness: 3,
      lineStyle: 'solid' as const
    };
    const updated = [...activeEqs, newEq];
    handleUpdateGraphItem({ equations: updated });
  };

  const handleRemoveEquation = (id: string) => {
    const activeEqs = getActiveEquations();
    if (activeEqs.length <= 1) return;
    const updated = activeEqs.filter(e => e.id !== id);
    handleUpdateGraphItem({ equations: updated });
  };

  const handleUpdateEquation = (id: string, fields: Partial<any>) => {
    const activeEqs = getActiveEquations();
    const updated = activeEqs.map(e => {
      if (e.id === id) {
        const merged = { ...e, ...fields };
        if (fields.freeFormEq !== undefined) {
          const parsed = parseEquation(fields.freeFormEq);
          if (parsed.type === 'linear' && parsed.linearEq) {
            merged.type = 'linear';
            merged.linearEq = parsed.linearEq;
          } else if (parsed.type === 'quadratic' && parsed.quadEq) {
            merged.type = 'quadratic';
            merged.quadEq = parsed.quadEq;
          }
        }
        return merged;
      }
      return e;
    });
    handleUpdateGraphItem({ equations: updated });
  };

  useEffect(() => {
    if (!activeTextObject || !fabricCanvasRef.current) {
      setFloatingPos(null);
      return;
    }
    const updatePosition = () => {
      const activeObj = fabricCanvasRef.current?.getActiveObject();
      if (activeObj) {
        try {
          const rect = activeObj.getBoundingRect();
          setFloatingPos({
            x: rect.left + rect.width / 2,
            y: rect.top - 40
          });
        } catch (e) {
          console.error("Error updating floating position:", e);
        }
      } else {
        setFloatingPos(null);
      }
    };

    updatePosition();

    const canvas = fabricCanvasRef.current;
    if (canvas) {
      canvas.on('object:moving', updatePosition);
      canvas.on('object:scaling', updatePosition);
      canvas.on('object:rotating', updatePosition);
      canvas.on('selection:updated', updatePosition);
      canvas.on('selection:created', updatePosition);
    }
    return () => {
      if (canvas) {
        canvas.off('object:moving', updatePosition);
        canvas.off('object:scaling', updatePosition);
        canvas.off('object:rotating', updatePosition);
        canvas.off('selection:updated', updatePosition);
        canvas.off('selection:created', updatePosition);
      }
    };
  }, [activeTextObject]);

  const handleDeleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (activeObj) {
      if (activeObj.type === 'activeSelection') {
        activeObj.forEachObject((obj: any) => {
          canvas.remove(obj);
        });
        canvas.discardActiveObject();
      } else {
        canvas.remove(activeObj);
        canvas.discardActiveObject();
      }
      canvas.renderAll();
      onModified();
    }
  };

  const handleGroupSelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (activeObj && activeObj.type === 'activeSelection') {
      try {
        const group = activeObj.toGroup();
        canvas.setActiveObject(group);
        canvas.renderAll();
        onModified();
        setActiveTextObject(group);
      } catch (err) {
        console.error("Error grouping objects:", err);
      }
    }
  };

  const handleUngroupSelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (activeObj && activeObj.type === 'group') {
      try {
        const activeSel = activeObj.toActiveSelection();
        canvas.setActiveObject(activeSel);
        canvas.renderAll();
        onModified();
        setActiveTextObject(activeSel);
      } catch (err) {
        console.error("Error ungrouping objects:", err);
      }
    }
  };

  const handleGroupDirectionToolbar = (dir: 'rtl' | 'ltr') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (!activeObj) return;

    // Get all items in the selection/group
    const items = activeObj.getObjects ? activeObj.getObjects() : [activeObj];
    
    // 1. Mirror horizontal position of items inside the group if there are multiple items
    if (items.length > 1) {
      items.forEach((item: any) => {
        if (item.left !== undefined) {
          item.set('left', -item.left);
        }
        
        // 2. Mirror arrow orientations and shapes
        if (item.angle !== undefined) {
          const newAngle = (180 - item.angle + 360) % 360;
          item.set('angle', newAngle);
        }
      });
    }

    // 3. For any text item, change its text alignment, direction, and fontFamily
    const applyDirectionToText = (obj: any) => {
      if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
        obj.set({
          direction: dir,
          textAlign: dir === 'rtl' ? 'right' : 'left',
          fontFamily: dir === 'rtl' ? 'Noto Sans Arabic, Inter, sans-serif' : 'Inter, sans-serif'
        });
        if (obj.isEditing) {
          obj.exitEditing();
          obj.enterEditing();
        }
        if (typeof obj.initDimensions === 'function') {
          obj.initDimensions();
        }
        obj.dirty = true;
      } else if (obj.getObjects) {
        obj.getObjects().forEach((sub: any) => applyDirectionToText(sub));
      }
    };

    items.forEach((item: any) => {
      applyDirectionToText(item);
    });

    if (activeObj.type === 'group') {
      activeObj.dirty = true;
    }
    canvas.renderAll();
    onModified();
  };

  const handleEditFractionGroup = (targetGroup?: any) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const target = targetGroup || canvas.getActiveObject();
    if (target && target.type === 'group' && target.isFractionGroup) {
      const items = target.getObjects();
      const numText = items.find((item: any) => item.fractionRole === 'numerator') || items[0];
      const denText = items.find((item: any) => item.fractionRole === 'denominator') || items[1];
      const line = items.find((item: any) => item.fractionRole === 'line') || items[2];

      if (numText && denText && line) {
        const groupLeft = target.left || 0;
        const groupTop = target.top || 0;
        const groupScaleX = target.scaleX || 1;
        const groupScaleY = target.scaleY || 1;
        const textColor = target.fractionColor || numText.fill || '#1f2937';
        const fractionId = target.fractionId;

        canvas.remove(target);

        const numAbsLeft = groupLeft + (numText.left * groupScaleX);
        const numAbsTop = groupTop + (numText.top * groupScaleY);

        const denAbsLeft = groupLeft + (denText.left * groupScaleX);
        const denAbsTop = groupTop + (denText.top * groupScaleY);

        const lineAbsLeft = groupLeft + (line.left * groupScaleX);
        const lineAbsTop = groupTop + (line.top * groupScaleY);

        const editableNum = new window.fabric.IText(numText.text || '', {
          left: numAbsLeft,
          top: numAbsTop,
          fontSize: (numText.fontSize || 20) * groupScaleY,
          fill: textColor,
          fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
          textAlign: 'center',
          originX: 'center',
          originY: 'bottom',
          hasControls: false,
          lockRotation: true,
          fractionId: fractionId,
          fractionRole: 'numerator',
        });

        const editableDen = new window.fabric.IText(denText.text || '', {
          left: denAbsLeft,
          top: denAbsTop,
          fontSize: (denText.fontSize || 20) * groupScaleY,
          fill: textColor,
          fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
          textAlign: 'center',
          originX: 'center',
          originY: 'top',
          hasControls: false,
          lockRotation: true,
          fractionId: fractionId,
          fractionRole: 'denominator',
        });

        const editableLine = new window.fabric.Line([
          line.x1 * groupScaleX,
          line.y1 * groupScaleY,
          line.x2 * groupScaleX,
          line.y2 * groupScaleY
        ], {
          left: lineAbsLeft,
          top: lineAbsTop,
          stroke: textColor,
          strokeWidth: (line.strokeWidth || 2) * Math.max(groupScaleX, groupScaleY),
          originX: 'center',
          originY: 'center',
          fractionId: fractionId,
          fractionRole: 'line',
          selectable: false,
        });

        canvas.add(editableNum);
        canvas.add(editableDen);
        canvas.add(editableLine);

        canvas.setActiveObject(editableNum);
        editableNum.enterEditing();

        canvas.renderAll();
        onModified();
      }
    }
  };

  const handleCopySelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (activeObj) {
      activeObj.clone((clonedObj: any) => {
        canvas.discardActiveObject();
        clonedObj.set({
          left: clonedObj.left + 15,
          top: clonedObj.top + 15,
          evented: true,
        });
        if (clonedObj.type === 'activeSelection') {
          clonedObj.canvas = canvas;
          clonedObj.forEachObject((obj: any) => {
            canvas.add(obj);
          });
          clonedObj.setCoords();
        } else {
          canvas.add(clonedObj);
        }
        canvas.setActiveObject(clonedObj);
        canvas.renderAll();
        onModified();
      });
    }
  };

  const recreateTable = (
    rows: number,
    cols: number,
    gap: number,
    width: number,
    height: number,
    texts: string[],
    mergedRanges?: any[],
    fillColor?: string,
    textColor?: string,
    hideHeaderBorders?: boolean,
    hideMiddleBorders?: boolean,
    hideFooterBorders?: boolean,
    transparentHeaderBg?: boolean,
    transparentMiddleBg?: boolean,
    transparentFooterBg?: boolean
  ) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeTextObject) return;
    
    isUpdatingRef.current = true;
    try {
      const left = activeTextObject.left;
      const top = activeTextObject.top;
      const angle = activeTextObject.angle;
      const scaleX = activeTextObject.scaleX;
      const scaleY = activeTextObject.scaleY;
      const strokeColor = activeTextObject.strokeColor || editorState.strokeColor;
      const strokeWidth = activeTextObject.strokeWidth || editorState.strokeWidth;
      
      // Resolve parameters falling back to activeTextObject values
      const mRanges = mergedRanges !== undefined ? mergedRanges : (activeTextObject.mergedRanges || []);
      const fColor = fillColor !== undefined ? fillColor : (activeTextObject.tableFillColor || 'rgba(255, 255, 255, 0.9)');
      const tColor = textColor !== undefined ? textColor : (activeTextObject.tableTextColor || '#1f2937');
      
      const hHB = hideHeaderBorders !== undefined ? hideHeaderBorders : (activeTextObject.hideHeaderBorders || false);
      const hMB = hideMiddleBorders !== undefined ? hideMiddleBorders : (activeTextObject.hideMiddleBorders || false);
      const hFB = hideFooterBorders !== undefined ? hideFooterBorders : (activeTextObject.hideFooterBorders || false);
      
      const tHB = transparentHeaderBg !== undefined ? transparentHeaderBg : (activeTextObject.transparentHeaderBg || false);
      const tMB = transparentMiddleBg !== undefined ? transparentMiddleBg : (activeTextObject.transparentMiddleBg || false);
      const tFB = transparentFooterBg !== undefined ? transparentFooterBg : (activeTextObject.transparentFooterBg || false);

      const newTable = createTableGroup(
        rows, cols, gap, width, height, texts, left, top, strokeColor, strokeWidth,
        mRanges, fColor, tColor, hHB, hMB, hFB, tHB, tMB, tFB
      );
      if (newTable) {
        newTable.set({
          left: left,
          top: top,
          angle: angle,
          scaleX: scaleX,
          scaleY: scaleY
        });
        canvas.remove(activeTextObject);
        canvas.add(newTable);
        canvas.setActiveObject(newTable);
        canvas.renderAll();
        setActiveTextObject(newTable);
        onModified();
      }
    } finally {
      isUpdatingRef.current = false;
    }
  };

  const handleUpdateRows = (diff: number) => {
    if (!activeTextObject) return;
    const currentRows = activeTextObject.rowsCount || 1;
    const newRows = Math.max(1, currentRows + diff);
    if (newRows === currentRows) return;
    
    const currentCols = activeTextObject.colsCount || 1;
    let newTexts = [...(activeTextObject.cellTexts || [])];
    
    if (diff > 0) {
      newTexts = [...newTexts, ...Array(currentCols * diff).fill('')];
    } else {
      newTexts = newTexts.slice(0, newRows * currentCols);
    }

    // Filter merged ranges that are no longer valid due to row reduction
    const filteredRanges = (activeTextObject.mergedRanges || []).filter((range: any) => {
      return range.r2 < newRows;
    });
    
    recreateTable(newRows, currentCols, activeTextObject.cellGap ?? 4, activeTextObject.cellWidth ?? 110, activeTextObject.cellHeight ?? 40, newTexts, filteredRanges);
  };

  const handleUpdateCols = (diff: number) => {
    if (!activeTextObject) return;
    const currentRows = activeTextObject.rowsCount || 1;
    const currentCols = activeTextObject.colsCount || 1;
    const newCols = Math.max(1, currentCols + diff);
    if (newCols === currentCols) return;
    
    const newTexts: string[] = [];
    for (let r = 0; r < currentRows; r++) {
      for (let c = 0; c < newCols; c++) {
        if (c < currentCols) {
          newTexts.push(activeTextObject.cellTexts[r * currentCols + c] || '');
        } else {
          newTexts.push('');
        }
      }
    }

    // Filter merged ranges that are no longer valid due to column reduction
    const filteredRanges = (activeTextObject.mergedRanges || []).filter((range: any) => {
      return range.c2 < newCols;
    });
    
    recreateTable(currentRows, newCols, activeTextObject.cellGap ?? 4, activeTextObject.cellWidth ?? 110, activeTextObject.cellHeight ?? 40, newTexts, filteredRanges);
  };

  const handleUpdateGap = (newGap: number) => {
    if (!activeTextObject) return;
    recreateTable(activeTextObject.rowsCount, activeTextObject.colsCount, newGap, activeTextObject.cellWidth, activeTextObject.cellHeight, activeTextObject.cellTexts);
  };

  const handleUpdateCellWidth = (newWidth: number) => {
    if (!activeTextObject) return;
    recreateTable(activeTextObject.rowsCount, activeTextObject.colsCount, activeTextObject.cellGap, newWidth, activeTextObject.cellHeight, activeTextObject.cellTexts);
  };

  const handleUpdateCellHeight = (newHeight: number) => {
    if (!activeTextObject) return;
    recreateTable(activeTextObject.rowsCount, activeTextObject.colsCount, activeTextObject.cellGap, activeTextObject.cellWidth, newHeight, activeTextObject.cellTexts);
  };

  const handleUpdateCellText = (index: number, val: string) => {
    if (!activeTextObject) return;
    const newTexts = [...(activeTextObject.cellTexts || [])];
    newTexts[index] = val;
    recreateTable(activeTextObject.rowsCount, activeTextObject.colsCount, activeTextObject.cellGap, activeTextObject.cellWidth, activeTextObject.cellHeight, newTexts);
  };

  const handleMergeCells = () => {
    if (!activeTextObject) return;
    const r1 = Math.min(mergeStartRow, mergeEndRow);
    const r2 = Math.max(mergeStartRow, mergeEndRow);
    const c1 = Math.min(mergeStartCol, mergeEndCol);
    const c2 = Math.max(mergeStartCol, mergeEndCol);
    
    const newRange = { r1, c1, r2, c2 };
    const oldRanges = activeTextObject.mergedRanges || [];
    
    const isOverlapping = (rangeA: any, rangeB: any) => {
      return !(
        rangeA.r2 < rangeB.r1 ||
        rangeA.r1 > rangeB.r2 ||
        rangeA.c2 < rangeB.c1 ||
        rangeA.c1 > rangeB.c2
      );
    };
    
    const filteredRanges = oldRanges.filter((r: any) => !isOverlapping(r, newRange));
    filteredRanges.push(newRange);
    
    recreateTable(
      activeTextObject.rowsCount,
      activeTextObject.colsCount,
      activeTextObject.cellGap,
      activeTextObject.cellWidth,
      activeTextObject.cellHeight,
      activeTextObject.cellTexts,
      filteredRanges
    );
  };

  const handleUnmergeRange = (idx: number) => {
    if (!activeTextObject) return;
    const oldRanges = [...(activeTextObject.mergedRanges || [])];
    oldRanges.splice(idx, 1);
    
    recreateTable(
      activeTextObject.rowsCount,
      activeTextObject.colsCount,
      activeTextObject.cellGap,
      activeTextObject.cellWidth,
      activeTextObject.cellHeight,
      activeTextObject.cellTexts,
      oldRanges
    );
  };

  const handleUpdateFillColor = (color: string) => {
    if (!activeTextObject) return;
    recreateTable(
      activeTextObject.rowsCount,
      activeTextObject.colsCount,
      activeTextObject.cellGap,
      activeTextObject.cellWidth,
      activeTextObject.cellHeight,
      activeTextObject.cellTexts,
      activeTextObject.mergedRanges,
      color
    );
  };

  const handleUpdateTextColor = (color: string) => {
    if (!activeTextObject) return;
    recreateTable(
      activeTextObject.rowsCount,
      activeTextObject.colsCount,
      activeTextObject.cellGap,
      activeTextObject.cellWidth,
      activeTextObject.cellHeight,
      activeTextObject.cellTexts,
      activeTextObject.mergedRanges,
      undefined,
      color
    );
  };

  const handleUpdateToggleProp = (propName: string, value: boolean) => {
    if (!activeTextObject) return;
    recreateTable(
      activeTextObject.rowsCount,
      activeTextObject.colsCount,
      activeTextObject.cellGap,
      activeTextObject.cellWidth,
      activeTextObject.cellHeight,
      activeTextObject.cellTexts,
      activeTextObject.mergedRanges,
      undefined,
      undefined,
      propName === 'hideHeaderBorders' ? value : undefined,
      propName === 'hideMiddleBorders' ? value : undefined,
      propName === 'hideFooterBorders' ? value : undefined,
      propName === 'transparentHeaderBg' ? value : undefined,
      propName === 'transparentMiddleBg' ? value : undefined,
      propName === 'transparentFooterBg' ? value : undefined
    );
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (!activeObj) return;

    if (e.cancelable) {
      e.preventDefault();
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const initialLeft = activeObj.left || 0;
    const initialTop = activeObj.top || 0;

    const onDragMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const dx = currentX - clientX;
      const dy = currentY - clientY;

      activeObj.set({
        left: initialLeft + dx,
        top: initialTop + dy
      });
      activeObj.setCoords();
      canvas.renderAll();

      try {
        const rect = activeObj.getBoundingRect();
        setFloatingPos({
          x: rect.left + rect.width / 2,
          y: rect.top - 45
        });
      } catch (err) {
        console.error(err);
      }
    };

    const onDragEnd = () => {
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchmove', onDragMove);
      window.removeEventListener('touchend', onDragEnd);
      onModified();
    };

    window.addEventListener('mousemove', onDragMove, { passive: false });
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);
  };

  const onTextSelectionRef = useRef(onTextSelection);
  useEffect(() => {
    onTextSelectionRef.current = onTextSelection;
  }, [onTextSelection]);

  const editorStateRef = useRef(editorState);
  useEffect(() => {
    editorStateRef.current = editorState;
  }, [editorState]);

  // Clean up selection when page becomes inactive
  useEffect(() => {
    if (!isActive && fabricCanvasRef.current) {
      try {
        fabricCanvasRef.current.discardActiveObject();
        fabricCanvasRef.current.renderAll();
      } catch (e) {
        console.error(e);
      }
      setActiveTextObject(null);
      onTextSelectionRef.current?.(fabricCanvasRef.current, null);
    }
  }, [isActive]);

  // Handle zoom changes dynamically
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !viewport) return;

    const newWidth = viewport.width * zoomFactor;
    const newHeight = viewport.height * zoomFactor;

    canvas.setDimensions({
      width: newWidth,
      height: newHeight
    });
    canvas.setZoom(zoomFactor);
    canvas.renderAll();
  }, [zoomFactor, viewport]);

  // Initialize Fabric Canvas
  useEffect(() => {
    if (!canvasElRef.current || !window.fabric || fabricCanvasRef.current) return;

    const canvas = new window.fabric.Canvas(canvasElRef.current, {
      width: viewport.width,
      height: viewport.height,
      selection: false, // Default to drawing mode usually
    });

    // Set background image
    window.fabric.Image.fromURL(bgImage, (img: any) => {
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
        scaleX: canvas.width! / img.width!,
        scaleY: canvas.height! / img.height!
      });
    });

    fabricCanvasRef.current = canvas;
    onCanvasReady(pageNumber, canvas);

    // Event listeners for history and keyboard pop-up prevention on click
    canvas.on('object:added', (opt: any) => {
      const obj = opt.target;
      if (obj) {
        if (obj.type === 'i-text' || obj.type === 'textbox') {
          obj.editable = false;
        }
        if (obj.type === 'textbox') {
          obj.setControlsVisibility({
            mt: false,
            mb: false
          });
        }
        if (['rect', 'circle', 'ellipse', 'triangle', 'polygon', 'polyline', 'line', 'path'].includes(obj.type)) {
          obj.set({ strokeUniform: true });
        }
        if (obj.type === 'group') {
          const isGraph = obj.isGraphGroup === true;
          obj.getObjects().forEach((child: any) => {
            if (child.type === 'i-text' || child.type === 'textbox') {
              child.editable = false;
            }
            if (child.type === 'textbox') {
              child.setControlsVisibility({
                mt: false,
                mb: false
              });
            }
            if (['rect', 'circle', 'ellipse', 'triangle', 'polygon', 'polyline', 'line', 'path'].includes(child.type)) {
              child.set({ strokeUniform: !isGraph });
            }
          });
        }
      }
      onModified();
    });

    const adjustTextboxScaling = (obj: any) => {
      if (!obj || obj.type !== 'textbox') return;
      const scaleX = obj.scaleX || 1;
      const scaleY = obj.scaleY || 1;
      if (scaleX !== 1 || scaleY !== 1) {
        const newWidth = Math.max(obj.width * scaleX, 10);
        // Check if it's scaled proportionally (corners) or non-proportionally (sides)
        const isCorner = Math.abs(scaleX - scaleY) < 0.05;
        if (isCorner) {
          const newFontSize = Math.max(Math.round((obj.fontSize || 20) * scaleY), 4);
          obj.set({
            width: newWidth,
            fontSize: newFontSize,
            scaleX: 1,
            scaleY: 1
          });
        } else {
          obj.set({
            width: newWidth,
            scaleX: 1,
            scaleY: 1
          });
        }
        if (typeof obj.initDimensions === 'function') {
          obj.initDimensions();
        }
        obj.dirty = true;
      }
    };

    const handleObjectModified = (opt: any) => {
      const obj = opt.target;
      if (obj && obj.type === 'textbox') {
        adjustTextboxScaling(obj);
        canvas.renderAll();
      }
      onModified();
    };

    const handleObjectScaling = (opt: any) => {
      const obj = opt.target;
      if (obj && obj.type === 'textbox') {
        adjustTextboxScaling(obj);
        canvas.renderAll();
      }
    };

    canvas.on('object:modified', handleObjectModified);
    canvas.on('object:scaling', handleObjectScaling);
    canvas.on('object:removed', onModified);
    canvas.on('path:created', onModified);

    // Handle double click on any object to enter editing mode immediately, or on background to zoom
    canvas.on('mouse:dblclick', (opt: any) => {
      const target = opt.target;
      if (!target) {
        // Double clicked empty space/background! Toggle zoom!
        setZoomFactor(prev => {
          const isZoomedIn = prev > 1.1;
          const nextZoom = isZoomedIn ? 1.0 : 1.8;
          
          if (!isZoomedIn) {
            // Smoothly center the scrollable container on the double-clicked coordinate
            const canvasEl = canvasElRef.current;
            if (canvasEl) {
              const scrollContainer = canvasEl.closest('.overflow-auto, .overflow-y-auto') || document.querySelector('.main-content-scroll-container');
              if (scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const clickX = opt.pointer?.x || 0;
                const clickY = opt.pointer?.y || 0;

                setTimeout(() => {
                  const targetXInZoomedCanvas = clickX * 1.8;
                  const targetYInZoomedCanvas = clickY * 1.8;
                  
                  const targetScrollLeft = targetXInZoomedCanvas - (containerRect.width / 2);
                  const targetScrollTop = targetYInZoomedCanvas - (containerRect.height / 2);

                  scrollContainer.scrollTo({
                    left: Math.max(0, targetScrollLeft),
                    top: Math.max(0, targetScrollTop),
                    behavior: 'smooth'
                  });
                }, 100);
              }
            }
          }
          return nextZoom;
        });
        return;
      }

      if (target.type === 'group' && target.isFractionGroup) {
        setIsEditingMode(true);
        canvas.setActiveObject(target);
        canvas.renderAll();
        setTimeout(() => {
          const numInput = document.getElementById('fraction-numerator-input');
          if (numInput) {
            (numInput as HTMLInputElement).focus();
            (numInput as HTMLInputElement).select();
          }
        }, 120);
      } else if (target.type === 'group' && target.isMathSymbolGroup) {
        setIsEditingMode(true);
        canvas.setActiveObject(target);
        canvas.renderAll();
        setTimeout(() => {
          const mathInput = document.getElementById('math-main-input');
          if (mathInput) {
            (mathInput as HTMLInputElement).focus();
            (mathInput as HTMLInputElement).select();
          }
        }, 120);
      } else if (target.type === 'group') {
        // Normal group: ungroup and start direct text editing on the clicked element
        const pointer = canvas.getPointer(opt.e);
        const items = target.getObjects();
        
        let closestText: any = null;
        let minDistance = Infinity;

        items.forEach((item: any) => {
          if (item.type === 'i-text' || item.type === 'textbox') {
            const groupLeft = target.left || 0;
            const groupTop = target.top || 0;
            const groupScaleX = target.scaleX || 1;
            const groupScaleY = target.scaleY || 1;
            const itemAbsLeft = groupLeft + (item.left * groupScaleX);
            const itemAbsTop = groupTop + (item.top * groupScaleY);
            
            const dx = pointer.x - itemAbsLeft;
            const dy = pointer.y - itemAbsTop;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < minDistance) {
              minDistance = dist;
              closestText = item;
            }
          }
        });

        if (closestText) {
          setIsEditingMode(true);
          const groupLeft = target.left || 0;
          const groupTop = target.top || 0;
          const groupScaleX = target.scaleX || 1;
          const groupScaleY = target.scaleY || 1;

          canvas.remove(target);

          const addedItems: any[] = [];
          let targetEditableItem: any = null;

          items.forEach((item: any) => {
            const absLeft = groupLeft + (item.left * groupScaleX);
            const absTop = groupTop + (item.top * groupScaleY);

            if (item.type === 'i-text' || item.type === 'textbox') {
              const newItem = new window.fabric.Textbox(item.text || '', {
                left: absLeft,
                top: absTop,
                width: (item.width || 250) * groupScaleX,
                fontSize: (item.fontSize || 20) * groupScaleY,
                fill: item.fill || '#1f2937',
                fontFamily: item.fontFamily || 'Noto Sans Arabic, Inter, sans-serif',
                fontWeight: item.fontWeight,
                fontStyle: item.fontStyle,
                underline: item.underline,
                originX: item.originX || 'left',
                originY: item.originY || 'top',
                hasControls: true,
                editable: false,
                splitByGrapheme: true,
                minWidth: 10
              });
              newItem.rawHtmlText = item.rawHtmlText || item.text;
              canvas.add(newItem);
              addedItems.push(newItem);
              if (item === closestText) {
                targetEditableItem = newItem;
              }
            } else {
              item.clone((cloned: any) => {
                cloned.set({
                  left: absLeft,
                  top: absTop,
                  scaleX: (cloned.scaleX || 1) * groupScaleX,
                  scaleY: (cloned.scaleY || 1) * groupScaleY,
                  selectable: true,
                });
                canvas.add(cloned);
                addedItems.push(cloned);
              });
            }
          });

          setTimeout(() => {
            if (targetEditableItem) {
              canvas.setActiveObject(targetEditableItem);
              targetEditableItem.editable = true;
              targetEditableItem.enterEditing();
              targetEditableItem.selectAll();
              canvas.renderAll();
            }
          }, 100);
        }
      } else if (target.type === 'i-text' || target.type === 'textbox') {
        setIsEditingMode(true);
        target.editable = true;
        target.enterEditing();
        target.selectAll?.();
        canvas.renderAll();
      }
    });

    // Handle fraction line dynamic stretching as text is typed
    canvas.on('text:changed', (opt: any) => {
      const activeObj = opt.target;

      // Inline HTML/BBCode tag parsing and stripping on-the-fly during editing
      if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text') && !activeObj.isEditingCode) {
        const text = activeObj.text || '';
        if (/<span|<font|\[color|<b>|\[b\]|<i>|\[i\]|<u>|\[u\]|<\/span>|<\/font>|\[\/color\]|<\/b>|\[\/b\]|<\/i>|\[\/i\]|<\/u>|\[\/u\]/gi.test(text)) {
          const { plainText, styles: parsedStyles } = parseHtmlStyles(text);
          const cursorStart = activeObj.selectionStart;
          const cursorEnd = activeObj.selectionEnd;

          activeObj.set({
            text: plainText,
            styles: parsedStyles
          });

          const newLen = plainText.length;
          activeObj.set({
            selectionStart: Math.min(cursorStart, newLen),
            selectionEnd: Math.min(cursorEnd, newLen)
          });

          canvas.renderAll();
        }
      }

      if (activeObj && activeObj.fractionId) {
        const fractionId = activeObj.fractionId;
        const allObjects = canvas.getObjects();

        const numText = allObjects.find((o: any) => o.fractionId === fractionId && o.fractionRole === 'numerator');
        const denText = allObjects.find((o: any) => o.fractionId === fractionId && o.fractionRole === 'denominator');
        const line = allObjects.find((o: any) => o.fractionId === fractionId && o.fractionRole === 'line');

        if (numText && denText && line) {
          const textWidth = Math.max(numText.width || 0, denText.width || 0);
          const newLineLength = textWidth + 12;

          line.set({
            x1: -newLineLength / 2,
            x2: newLineLength / 2,
          });

          const centerX = line.left;
          numText.set({ left: centerX });
          denText.set({ left: centerX });

          numText.setCoords();
          denText.setCoords();
          line.setCoords();
          canvas.renderAll();
        }
      }
    });

    // Track active object selections or editing
    const updateTextState = () => {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        setActiveTextObject(activeObj);
        onTextSelectionRef.current?.(canvas, activeObj);
      } else {
        setActiveTextObject(null);
        onTextSelectionRef.current?.(canvas, null);
      }
    };

    const handleSelectionCreatedOrUpdated = (opt: any) => {
      if (isUpdatingRef.current) {
        updateTextState();
        return;
      }
      if (opt && opt.e) {
        // This selection was made via mouse/touch click! Set editing mode to false.
        setIsEditingMode(false);
      }
      updateTextState();
    };

    canvas.on('selection:created', handleSelectionCreatedOrUpdated);
    canvas.on('selection:updated', handleSelectionCreatedOrUpdated);
    canvas.on('selection:cleared', () => {
      if (isUpdatingRef.current) return;
      setActiveTextObject(null);
      onTextSelectionRef.current?.(canvas, null);
      setIsEditingMode(false);
    });
    canvas.on('text:editing:exited', () => {
      if (isUpdatingRef.current) return;
      setIsEditingMode(false);
      canvas.selection = editorStateRef.current.activeTool === 'select';
    });
    canvas.on('text:editing:entered', () => {
      canvas.selection = false;
      const activeObj = canvas.getActiveObject();
      if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text' || activeObj.type === 'textbox')) {
        setActiveTextObject(activeObj);
        onTextSelectionRef.current?.(canvas, activeObj);

        // Bring the page and box together higher above the keyboard so the user can see what they are typing
        setTimeout(() => {
          try {
            const canvasEl = canvasElRef.current;
            if (canvasEl) {
              const canvasRect = canvasEl.getBoundingClientRect();
              const scrollContainer = canvasEl.closest('.overflow-auto, .overflow-y-auto') || document.querySelector('.main-content-scroll-container');
              
              if (scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const containerScrollTop = scrollContainer.scrollTop;
                
                // Fabric's getBoundingRect returns coords relative to canvas top-left in CSS pixels
                const objRect = activeObj.getBoundingRect(true, true);
                const objViewportTop = canvasRect.top + objRect.top;
                const objRelativeToContainerViewport = objViewportTop - containerRect.top;
                
                const targetScrollTop = containerScrollTop + objRelativeToContainerViewport - 50;
                
                scrollContainer.scrollTo({
                  top: Math.max(0, targetScrollTop),
                  behavior: 'smooth'
                });
              } else {
                // Fallback scroll ONLY if no scrollable container is found
                const objRect = activeObj.getBoundingRect(true, true);
                const boxAbsoluteTop = window.scrollY + canvasRect.top + objRect.top;
                const targetY = boxAbsoluteTop - 50;
                
                window.scrollTo({
                  top: Math.max(0, targetY),
                  behavior: 'smooth'
                });
              }
            }
          } catch (err) {
            console.error("Scroll on text:editing:entered failed:", err);
          }
        }, 150);
      }
    });
    canvas.on('text:editing:exited', (opt: any) => {
      canvas.selection = editorStateRef.current.activeTool === 'select';
      const activeObj = opt.target;
      if (activeObj) {
        activeObj.editable = false;
        if (activeObj.isEditingCode) {
          const raw = activeObj.text || '';
          activeObj.rawHtmlText = raw;
          const { plainText, styles: parsedStyles } = parseHtmlStyles(raw);
          activeObj.set({
            text: plainText,
            styles: parsedStyles
          });
          activeObj.isEditingCode = false;
          canvas.renderAll();
        } else {
          // If edited normally, synchronize rawHtmlText with plain text as fallback
          activeObj.rawHtmlText = activeObj.text || '';
        }
      }
      if (activeObj && activeObj.fractionId) {
        const fractionId = activeObj.fractionId;
        setTimeout(() => {
          const allObjects = canvas.getObjects();
          const numText = allObjects.find((o: any) => o.fractionId === fractionId && o.fractionRole === 'numerator');
          const denText = allObjects.find((o: any) => o.fractionId === fractionId && o.fractionRole === 'denominator');
          const line = allObjects.find((o: any) => o.fractionId === fractionId && o.fractionRole === 'line');

          if (numText && denText && line) {
            const textWidth = Math.max(numText.width || 0, denText.width || 0);
            const newLineLength = textWidth + 12;

            line.set({
              x1: -newLineLength / 2,
              x2: newLineLength / 2,
            });

            const avgLeft = line.left;
            const numBottom = numText.top;
            const numTop = numText.top - (numText.height || 20);
            const denTop = denText.top;
            const denBottom = denText.top + (denText.height || 20);
            const centerY = (numTop + denBottom) / 2;

            const textColor = numText.fill || '#1f2937';

            const relativeNum = new window.fabric.IText(numText.text || '', {
              fontSize: numText.fontSize,
              fill: textColor,
              fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
              textAlign: 'center',
              originX: 'center',
              originY: 'bottom',
              left: 0,
              top: numBottom - centerY,
              hasControls: false,
              lockRotation: true,
              fractionRole: 'numerator',
            });

            const relativeDen = new window.fabric.IText(denText.text || '', {
              fontSize: denText.fontSize,
              fill: textColor,
              fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
              textAlign: 'center',
              originX: 'center',
              originY: 'top',
              left: 0,
              top: denTop - centerY,
              hasControls: false,
              lockRotation: true,
              fractionRole: 'denominator',
            });

            const relativeLine = new window.fabric.Line([
              -newLineLength / 2, 0, newLineLength / 2, 0
            ], {
              stroke: textColor,
              strokeWidth: line.strokeWidth,
              originX: 'center',
              originY: 'center',
              left: 0,
              top: 0,
              fractionRole: 'line',
            });

            const group = new window.fabric.Group([relativeNum, relativeDen, relativeLine], {
              left: avgLeft,
              top: centerY,
              selectable: true,
              isFractionGroup: true,
              fractionId: fractionId,
              fractionColor: textColor,
            });

            canvas.remove(numText);
            canvas.remove(denText);
            canvas.remove(line);

            canvas.add(group);
            canvas.setActiveObject(group);
            canvas.renderAll();
            onModified();
          }
        }, 50);
      }
      setTimeout(updateTextState, 150);
    });

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgImage, viewport]);

  // Update Tool Settings and Interactions
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const { activeTool, strokeColor, strokeWidth } = editorState;

    // Reset event listeners to prevent duplication
    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');
    
    // Mode Configuration
    canvas.isDrawingMode = activeTool === 'pen' || activeTool === 'highlighter';
    canvas.selection = activeTool === 'select' && !isEditingMode;
    
    // Discard selection and update selectability of objects
    if (activeTool === 'hand') {
      canvas.discardActiveObject();
      canvas.renderAll();
    }

    canvas.forEachObject((obj: any) => {
      obj.selectable = activeTool === 'select';
      obj.hoverCursor = activeTool === 'select' ? 'move' : (activeTool === 'hand' ? 'grab' : 'default');
    });
    
    // Cursor
    if (activeTool === 'select') canvas.defaultCursor = 'default';
    else if (activeTool === 'text') canvas.defaultCursor = 'text';
    else if (activeTool === 'hand') canvas.defaultCursor = 'grab';
    else canvas.defaultCursor = 'crosshair';

    // Brush Settings for Pen/Highlighter
    if (canvas.isDrawingMode) {
      const brush = new window.fabric.PencilBrush(canvas);
      brush.color = strokeColor;
      brush.width = strokeWidth;
      
      if (activeTool === 'highlighter') {
        brush.color = strokeColor + '80'; // Add transparency
        brush.width = strokeWidth * 3;
      }
      canvas.freeDrawingBrush = brush;
    }

    // --- Shape Drawing Logic ---
    let isDrawingShape = false;
    let shapeStart = { x: 0, y: 0 };
    let activeShape: any = null;

    const onMouseDown = (opt: any) => {
        const pointer = canvas.getPointer(opt.e);
        const target = opt.target;

        // Text Tool Logic
        if (activeTool === 'text') {
            if (!target) {
                const text = new window.fabric.Textbox('بنڤیسە', {
                    left: pointer.x,
                    top: pointer.y,
                    width: 250,
                    fill: strokeColor,
                    fontSize: 14,
                    fontFamily: 'Noto Sans Arabic',
                    textAlign: 'right',
                    splitByGrapheme: true,
                    minWidth: 10
                });
                text.rawHtmlText = 'بنڤیسە';
                canvas.add(text);
                canvas.setActiveObject(text);
                text.enterEditing();
                onModified();
            }
            return;
        }

        // Shape Tools Logic
        if (['rect', 'circle', 'line'].includes(activeTool)) {
            // Avoid drawing if clicking on an existing object while in select mode (though we are in shape mode)
            // But usually, in shape mode, we want to draw new shapes.
            
            isDrawingShape = true;
            shapeStart = { x: pointer.x, y: pointer.y };

            if (activeTool === 'rect') {
                activeShape = new window.fabric.Rect({
                    left: shapeStart.x, top: shapeStart.y,
                    width: 0, height: 0,
                    fill: 'transparent',
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                    strokeUniform: true,
                    selectable: false
                });
            } else if (activeTool === 'circle') {
                activeShape = new window.fabric.Ellipse({
                    left: shapeStart.x, top: shapeStart.y,
                    rx: 0, ry: 0,
                    fill: 'transparent',
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                    strokeUniform: true,
                    selectable: false
                });
            } else if (activeTool === 'line') {
                activeShape = new window.fabric.Line([shapeStart.x, shapeStart.y, shapeStart.x, shapeStart.y], {
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                    strokeUniform: true,
                    selectable: false
                });
            }

            if (activeShape) {
                canvas.add(activeShape);
            }
        }
    };

    const onMouseMove = (opt: any) => {
        if (!isDrawingShape || !activeShape) return;
        const pointer = canvas.getPointer(opt.e);

        if (activeTool === 'rect') {
            const w = Math.abs(pointer.x - shapeStart.x);
            const h = Math.abs(pointer.y - shapeStart.y);
            activeShape.set({
                width: w,
                height: h,
                left: Math.min(pointer.x, shapeStart.x),
                top: Math.min(pointer.y, shapeStart.y)
            });
        } else if (activeTool === 'circle') {
            const rx = Math.abs(pointer.x - shapeStart.x) / 2;
            const ry = Math.abs(pointer.y - shapeStart.y) / 2;
            activeShape.set({
                rx: rx, 
                ry: ry,
                left: Math.min(pointer.x, shapeStart.x),
                top: Math.min(pointer.y, shapeStart.y)
            });
        } else if (activeTool === 'line') {
            activeShape.set({ x2: pointer.x, y2: pointer.y });
        }
        
        canvas.renderAll();
    };

    const onMouseUp = () => {
        if (isDrawingShape && activeShape) {
            activeShape.setCoords();
            activeShape.set('selectable', true); // Allow selection after drawing
            onModified();
        }
        isDrawingShape = false;
        activeShape = null;
    };

    // Attach Listeners
    canvas.on('mouse:down', onMouseDown);
    canvas.on('mouse:move', onMouseMove);
    canvas.on('mouse:up', onMouseUp);

    return () => {
        canvas.off('mouse:down', onMouseDown);
        canvas.off('mouse:move', onMouseMove);
        canvas.off('mouse:up', onMouseUp);
    };

  }, [editorState, pageNumber, isEditingMode]);

  const getSelectionCoords = (index: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeTextObject) return null;
    try {
      const textLen = activeTextObject.text ? activeTextObject.text.length : 0;
      const safeIndex = Math.max(0, Math.min(index, textLen));
      
      const coords = activeTextObject._getCursorCoords(safeIndex);
      if (!coords) return null;

      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const x = coords.left * vpt[0] + vpt[4];
      const y = coords.top * vpt[3] + vpt[5];

      const lineH = activeTextObject.cursorHeight || (activeTextObject.fontSize * (activeTextObject.lineHeight || 1.15));
      const scaledLineH = lineH * activeTextObject.scaleY * vpt[3];

      return {
        x,
        y,
        bottomY: y + scaledLineH,
        lineHeight: scaledLineH
      };
    } catch (err) {
      console.error("Error calculating selection coords:", err);
      return null;
    }
  };

  const handleTextSelectionDragStart = (e: React.MouseEvent | React.TouchEvent, type: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    dragTypeRef.current = type;

    const onDragMove = (moveEvent: MouseEvent | TouchEvent) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas || !activeTextObject || !dragTypeRef.current) return;

      const upperCanvas = canvas.upperCanvasEl;
      if (!upperCanvas) return;

      const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const clientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const fakeEvent = {
        clientX,
        clientY,
        type: 'mousemove',
        target: upperCanvas,
        preventDefault: () => {},
        stopPropagation: () => {},
      };

      if (typeof activeTextObject.getSelectionStartFromPointer === 'function') {
        const index = activeTextObject.getSelectionStartFromPointer(fakeEvent);
        if (typeof index === 'number' && index >= 0) {
          const type = dragTypeRef.current;
          let newStart = activeTextObject.selectionStart;
          let newEnd = activeTextObject.selectionEnd;

          if (type === 'start') {
            newStart = Math.min(index, activeTextObject.selectionEnd);
          } else {
            newEnd = Math.max(index, activeTextObject.selectionStart);
          }

          activeTextObject.set({
            selectionStart: newStart,
            selectionEnd: newEnd
          });
          activeTextObject.fire('selection:changed');
          canvas.renderAll();
        }
      }
    };

    const onDragEnd = () => {
      dragTypeRef.current = null;
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchmove', onDragMove);
      window.removeEventListener('touchend', onDragEnd);
    };

    window.addEventListener('mousemove', onDragMove, { passive: false });
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);
  };

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeTextObject || !isEditingMode || !activeTextObject.isEditing) {
      setHandleCoords({ start: null, end: null });
      return;
    }

    const updateHandles = () => {
      const start = getSelectionCoords(activeTextObject.selectionStart);
      const end = getSelectionCoords(activeTextObject.selectionEnd);
      setHandleCoords({ start, end });
    };

    updateHandles();

    activeTextObject.on('selection:changed', updateHandles);
    activeTextObject.on('changed', updateHandles);
    canvas.on('text:changed', updateHandles);
    canvas.on('mouse:move', updateHandles);
    canvas.on('after:render', updateHandles);

    return () => {
      activeTextObject.off('selection:changed', updateHandles);
      activeTextObject.off('changed', updateHandles);
      canvas.off('text:changed', updateHandles);
      canvas.off('mouse:move', updateHandles);
      canvas.off('after:render', updateHandles);
    };
  }, [activeTextObject, isEditingMode, zoomFactor]);

  const touchStartIndexRef = useRef<number>(-1);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const upperCanvas = canvas.upperCanvasEl;
    if (!upperCanvas) return;

    if (!isEditingMode || !activeTextObject || !activeTextObject.isEditing) {
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        // Prevent default to stop scrolling/zooming and dragging the textbox
        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches[0];
        const fakeEvent = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          type: 'mousedown',
          target: upperCanvas,
          preventDefault: () => {},
          stopPropagation: () => {},
          touches: e.touches,
          targetTouches: e.targetTouches,
          changedTouches: e.changedTouches
        };

        if (typeof activeTextObject.getSelectionStartFromPointer === 'function') {
          const index = activeTextObject.getSelectionStartFromPointer(fakeEvent);
          if (typeof index === 'number' && index >= 0) {
            touchStartIndexRef.current = index;
            activeTextObject.set({
              selectionStart: index,
              selectionEnd: index
            });
            activeTextObject.fire('selection:changed');
            canvas.renderAll();
          }
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0 && touchStartIndexRef.current !== -1) {
        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches[0];
        const fakeEvent = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          type: 'mousemove',
          target: upperCanvas,
          preventDefault: () => {},
          stopPropagation: () => {},
          touches: e.touches,
          targetTouches: e.targetTouches,
          changedTouches: e.changedTouches
        };

        if (typeof activeTextObject.getSelectionStartFromPointer === 'function') {
          const index = activeTextObject.getSelectionStartFromPointer(fakeEvent);
          if (typeof index === 'number' && index >= 0) {
            const start = touchStartIndexRef.current;
            activeTextObject.set({
              selectionStart: Math.min(start, index),
              selectionEnd: Math.max(start, index)
            });
            activeTextObject.fire('selection:changed');
            canvas.renderAll();
          }
        }
      }
    };

    const handleTouchEnd = () => {
      touchStartIndexRef.current = -1;
    };

    upperCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    upperCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    upperCanvas.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      upperCanvas.removeEventListener('touchstart', handleTouchStart);
      upperCanvas.removeEventListener('touchmove', handleTouchMove);
      upperCanvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isEditingMode, activeTextObject, pageNumber]);

  const showVoiceButton = isActive && (!!activeTextObject || editorState.activeTool === 'text');

  return (
    <div 
      ref={containerRef}
      id={`page-${pageNumber}`}
      className={`relative my-4 shadow-2xl transition-all duration-300 ${isActive ? 'ring-4 ring-primary' : 'ring-0'}`}
      style={{ width: (viewport?.width || 0) * zoomFactor, height: (viewport?.height || 0) * zoomFactor }}
      onDoubleClick={(e) => {
        // Don't trigger if we are inside input panels, inputs, buttons, etc.
        if (e.target instanceof HTMLElement && (
          e.target.tagName === 'INPUT' || 
          e.target.tagName === 'BUTTON' || 
          e.target.closest('button') || 
          e.target.closest('.z-50')
        )) {
          return;
        }
        
        const canvas = fabricCanvasRef.current;
        if (canvas) {
          // If double clicked on an active or hovered object on the canvas, do not zoom!
          // We check if a target exists under the pointer.
          const target = canvas.findTarget(e.nativeEvent);
          if (target) {
            // Let the fabric double click handler (which edits) take over.
            return;
          }
        }

        // No object clicked! Zoom empty canvas/page!
        setZoomFactor(prev => {
          const isZoomedIn = prev > 1.1;
          const nextZoom = isZoomedIn ? 1.0 : 1.8;
          
          if (!isZoomedIn) {
            // Centering on double click position
            const scrollContainer = containerRef.current?.closest('.overflow-auto, .overflow-y-auto') || document.querySelector('.main-content-scroll-container');
            if (scrollContainer) {
              const containerRect = scrollContainer.getBoundingClientRect();
              const rect = containerRef.current?.getBoundingClientRect();
              if (rect) {
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                
                setTimeout(() => {
                  const targetXInZoomedCanvas = (clickX / prev) * 1.8;
                  const targetYInZoomedCanvas = (clickY / prev) * 1.8;
                  
                  const targetScrollLeft = targetXInZoomedCanvas - (containerRect.width / 2);
                  const targetScrollTop = targetYInZoomedCanvas - (containerRect.height / 2);

                  scrollContainer.scrollTo({
                    left: Math.max(0, targetScrollLeft),
                    top: Math.max(0, targetScrollTop),
                    behavior: 'smooth'
                  });
                }, 100);
              }
            }
          }
          return nextZoom;
        });
      }}
    >
      <canvas ref={canvasElRef} />
      
      {/* Visual Text Selection Handles for Mobile & Tablet Devices */}
      {isActive && isEditingMode && activeTextObject && activeTextObject.isEditing && handleCoords.start && (
        <div 
          className="absolute z-50 cursor-pointer flex items-center justify-center select-none"
          style={{
            left: `${handleCoords.start.x - 22}px`,
            top: `${handleCoords.start.bottomY}px`,
            width: '44px',
            height: '44px',
            touchAction: 'none'
          }}
          onTouchStart={(e) => handleTextSelectionDragStart(e, 'start')}
          onMouseDown={(e) => handleTextSelectionDragStart(e, 'start')}
        >
          <div className="w-4 h-4 bg-blue-500 rounded-full rounded-tr-none -rotate-45 shadow-lg shadow-blue-500/40 border border-white/20"></div>
        </div>
      )}

      {isActive && isEditingMode && activeTextObject && activeTextObject.isEditing && handleCoords.end && (
        <div 
          className="absolute z-50 cursor-pointer flex items-center justify-center select-none"
          style={{
            left: `${handleCoords.end.x - 22}px`,
            top: `${handleCoords.end.bottomY}px`,
            width: '44px',
            height: '44px',
            touchAction: 'none'
          }}
          onTouchStart={(e) => handleTextSelectionDragStart(e, 'end')}
          onMouseDown={(e) => handleTextSelectionDragStart(e, 'end')}
        >
          <div className="w-4 h-4 bg-blue-500 rounded-full rounded-tr-none -rotate-45 shadow-lg shadow-blue-500/40 border border-white/20"></div>
        </div>
      )}
      
      {/* Floating Action Button above Selected Object */}
      {isActive && floatingPos && (
        <div 
          className="absolute z-40 -translate-x-1/2 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150 origin-center"
          style={{ 
            left: `${floatingPos.x}px`, 
            top: `${floatingPos.y}px`,
            transform: `translate(-50%, ${zoomFactor > 1.1 ? '-15%' : '0px'}) scale(${zoomFactor > 1.1 ? 0.72 : 1})`,
          }}
        >
          {/* Drag to Move Handle */}
          <button
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-blue-800 bg-blue-950/95 text-blue-200 hover:bg-blue-800 hover:text-white shadow-lg text-[10px] font-black cursor-move transition-all duration-150 active:scale-95 whitespace-nowrap touch-none"
            title="بکێشە بۆ گواستنەوە (Drag to Move)"
          >
            <span className="text-blue-400 font-extrabold text-xs">＋</span>
            <span>ڤەگوهاستن</span>
          </button>

          {/* Delete Button */}
          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-red-800 bg-red-950/95 text-red-200 hover:bg-red-900 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
            title="ژێبرن / مسح (Delete)"
          >
            <Icons.Trash size={12} className="text-red-400" />
            <span>مسح</span>
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopySelected}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-teal-800 bg-teal-950/95 text-teal-200 hover:bg-teal-800 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
            title="کۆپیکردن (Copy/Duplicate)"
          >
            <Icons.Copy size={11} className="text-teal-400" />
            <span>کۆپی</span>
          </button>

          {/* Group Button (Only shown when multiple items are selected / activeSelection) */}
          {activeTextObject && activeTextObject.type === 'activeSelection' && (
            <button
              onClick={handleGroupSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo-800 bg-indigo-950/95 text-indigo-200 hover:bg-indigo-800 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
              title="کۆمکرن / گروپ (Group)"
            >
              <Icons.Group size={12} className="text-indigo-400 animate-pulse" />
              <span>گروپ</span>
            </button>
          )}

          {/* Ungroup Button (Only shown when a group is selected) */}
          {activeTextObject && activeTextObject.type === 'group' && (
            <button
              onClick={handleUngroupSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-800 bg-amber-950/95 text-amber-200 hover:bg-amber-850 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
              title="لێکجوداکرن / ئەن گروپ (Ungroup)"
            >
              <Icons.Ungroup size={12} className="text-amber-400" />
              <span>ئەن گروپ</span>
            </button>
          )}

          {/* RTL Button (Only shown when a group or selection is active) */}
          {activeTextObject && (
            <button
              onClick={() => handleGroupDirectionToolbar('rtl')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-800 bg-purple-950/95 text-purple-200 hover:bg-purple-800 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
              title="ڕاست بۆ چەپ و ئاوێتەکردنی شوێنەکان (RTL & Mirror Layout)"
            >
              <Icons.ArrowLeftToLine size={12} className="text-purple-400" />
              <span>RTL</span>
            </button>
          )}

          {/* LTR Button (Only shown when a group or selection is active) */}
          {activeTextObject && (
            <button
              onClick={() => handleGroupDirectionToolbar('ltr')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-pink-800 bg-pink-950/95 text-pink-200 hover:bg-pink-800 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
              title="چەپ بۆ ڕاست و ئاوێتەکردنی شوێنەکان (LTR & Mirror Layout)"
            >
              <Icons.ArrowRightToLine size={12} className="text-pink-400" />
              <span>LTR</span>
            </button>
          )}

          {/* Direct Edit / Keyboard Button */}
          {activeTextObject && (activeTextObject.type === 'i-text' || activeTextObject.type === 'text' || activeTextObject.type === 'textbox' || activeTextObject.isType?.('i-text') || activeTextObject.isType?.('text') || activeTextObject.isType?.('textbox')) && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (activeTextObject && typeof activeTextObject.enterEditing === 'function') {
                    activeTextObject.editable = true;
                    activeTextObject.enterEditing();
                    activeTextObject.selectAll?.();
                    if (fabricCanvasRef.current) fabricCanvasRef.current.renderAll();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-800 bg-emerald-950/95 text-emerald-200 hover:bg-emerald-800 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
                title="تەعدیلکرنا دەقی (Edit Text)"
              >
                <Icons.Edit size={12} className="text-emerald-400 animate-pulse" />
                <span>دەستکاری (Edit)</span>
              </button>

              <button
                onClick={() => {
                  if (activeTextObject) {
                    const raw = getHtmlFromFabric(activeTextObject) || activeTextObject.rawHtmlText || activeTextObject.text || '';
                    setCodeEditorText(raw);
                    setEditingObject(activeTextObject);
                    setIsCodeEditorOpen(true);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-teal-800 bg-teal-950/95 text-teal-200 hover:bg-teal-800 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
                title="دەستکاری کرنا کۆدی (Edit Code)"
              >
                <Icons.Code size={12} className="text-teal-400 animate-pulse" />
                <span>دەستکاری کودا</span>
              </button>
            </div>
          )}

          {/* Edit Fraction Button */}
          {activeTextObject && activeTextObject.type === 'group' && activeTextObject.isFractionGroup && (
            <button
              onClick={() => {
                setIsEditingMode(true);
                setTimeout(() => {
                  const numInput = document.getElementById('fraction-numerator-input');
                  if (numInput) {
                    numInput.focus();
                    (numInput as HTMLInputElement).select();
                  }
                }, 120);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-800 bg-emerald-950/95 text-emerald-200 hover:bg-emerald-800 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
              title="تەعدیلکرنا کەرتی (Edit Fraction)"
            >
              <Icons.Edit size={12} className="text-emerald-400 animate-pulse" />
              <span>دەستکاری کەرتی (Edit Fraction)</span>
            </button>
          )}

          {/* Edit Math Symbol Button */}
          {activeTextObject && activeTextObject.type === 'group' && activeTextObject.isMathSymbolGroup && (
            <button
              onClick={() => {
                setIsEditingMode(true);
                setTimeout(() => {
                  const mathInput = document.getElementById('math-main-input');
                  if (mathInput) {
                    mathInput.focus();
                    (mathInput as HTMLInputElement).select();
                  }
                }, 120);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-800 bg-emerald-950/95 text-emerald-200 hover:bg-emerald-800 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
              title="تەعدیلکرنا هێمایێ (Edit Math Symbol)"
            >
              <Icons.Edit size={12} className="text-emerald-400 animate-pulse" />
              <span>دەستکاری کرنا هێمایێ (Edit Math Symbol)</span>
            </button>
          )}

          {/* Edit Table Button */}
          {activeTextObject && activeTextObject.isTable === true && (
            <button
              onClick={() => {
                setIsEditingMode(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-800 bg-emerald-950/95 text-emerald-200 hover:bg-emerald-800 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
              title="تەعدیلکرنا خشتەیی (Edit Table)"
            >
              <Icons.Edit size={12} className="text-emerald-400 animate-pulse" />
              <span>دەستکاری خشتەیی (Edit Table)</span>
            </button>
          )}

          {/* Edit Graph Button */}
          {activeTextObject && activeTextObject.isGraphGroup === true && (
            <button
              onClick={() => {
                setIsEditingMode(true);
                setTimeout(() => {
                  const qInput = document.getElementById('graph-question-input');
                  if (qInput) {
                    qInput.focus();
                    (qInput as HTMLInputElement).select();
                  }
                }, 120);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-violet-800 bg-violet-950/95 text-violet-200 hover:bg-violet-800 hover:text-white shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap"
              title="تەعدیلکرنا هێلکاریێ (Edit Graph)"
            >
              <Icons.Edit size={12} className="text-violet-400 animate-pulse" />
              <span>دەستکاری هێڵکاریێ (Edit Graph)</span>
            </button>
          )}

          {/* Edit / Format Button for Shapes, Lines, Paths, Groups (opens sidebar formatter) */}
          {activeTextObject && !(activeTextObject.type === 'i-text' || activeTextObject.type === 'text' || activeTextObject.type === 'textbox' || activeTextObject.isFractionGroup || activeTextObject.isMathSymbolGroup || activeTextObject.isTable || activeTextObject.isGraphGroup) && (
            <button
              onClick={() => {
                if (onOpenFormatter) onOpenFormatter();
              }}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap
                ${showFormatterSidebar 
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20' 
                  : 'border-emerald-800 bg-emerald-950/95 text-emerald-200 hover:bg-emerald-800 hover:text-white'}
              `}
              title="دەستکاری و ڕێکخستنا شێوەی (Edit & Format Shape)"
            >
              <Icons.Edit size={12} className="text-emerald-400 animate-pulse" />
              <span>دەستکاری (Format)</span>
            </button>
          )}

          {/* Text Formatting Button (Only shown for text objects) */}
          {activeTextObject && (activeTextObject.type === 'i-text' || activeTextObject.type === 'text' || activeTextObject.type === 'textbox') && (
            <button
              onClick={() => {
                if (onOpenFormatter) onOpenFormatter();
              }}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-lg text-[10px] font-black transition-all duration-150 active:scale-95 whitespace-nowrap
                ${showFormatterSidebar 
                  ? 'bg-primary text-white border-primary shadow-primary/20' 
                  : 'bg-zinc-950/95 text-white border-zinc-700 hover:bg-zinc-900 hover:border-zinc-500'}
              `}
              title="ڕێکخستنێن دەقی (Text Formatting)"
            >
              <Icons.Sliders size={12} className={showFormatterSidebar ? "animate-pulse text-white" : "text-blue-400"} />
              <span>رێکخستنا دەقی</span>
            </button>
          )}
        </div>
      )}
      
      {/* Floating Speaker/Headphone Voice Typing Button */}
      {showVoiceButton && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 animate-bounce">
          <button
            onClick={() => {
              if (!apiKey) {
                alert("تکایە سەرەتا API Key زیاد بکە لە ڕێکخستنەکان");
                if (onOpenSettings) onOpenSettings();
                return;
              }
              if (onToggleRecording) onToggleRecording();
            }}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-full border shadow-xl text-xs font-bold transition-all duration-300 whitespace-nowrap
              ${isRecording 
                ? 'bg-red-600 text-white border-red-500 animate-pulse' 
                : 'bg-zinc-950/95 text-white border-zinc-700 hover:bg-zinc-800 hover:border-zinc-500'}
            `}
            title="ب دەنگی بنڤیسە (Speak to Type in Kurdish)"
          >
            <div className="flex items-center justify-center p-1 bg-primary/20 text-primary rounded-full">
              <Icons.Volume size={14} className={isRecording ? "text-white animate-ping" : "text-blue-400"} />
            </div>
            <span>
              {isRecording ? 'تۆمارکرن... ئاخفتنێ بکە' : 'ب دەنگ بنڤیسە (سەماعە)'}
            </span>
          </button>
        </div>
      )}
      
      {/* Table Editor Panel */}
      {isActive && activeTextObject && isEditingMode && activeTextObject.isTable === true && (
        <div 
          className="absolute top-4 right-4 z-50 bg-slate-900/95 backdrop-blur-md border border-white/15 rounded-2xl p-4 shadow-2xl text-white w-80 animate-in fade-in slide-in-from-right-4 duration-300 max-h-[85%] overflow-y-auto flex flex-col gap-4 text-right"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b border-white/10 pb-2">
            <button 
              onClick={() => {
                if (fabricCanvasRef.current) {
                  fabricCanvasRef.current.discardActiveObject();
                  fabricCanvasRef.current.renderAll();
                }
                setActiveTextObject(null);
              }}
              className="text-gray-400 hover:text-white hover:bg-white/10 p-1 rounded-full transition-all"
            >
              <Icons.X size={16} />
            </button>
            <div className="flex items-center gap-2 font-black text-sm text-blue-400">
              <Icons.TableIcon size={16} />
              <span>ڕێکخستنێن خشتەی (Table)</span>
            </div>
          </div>

          {/* Row & Column Controllers */}
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-1 text-right">
              <span className="text-[11px] text-gray-400 font-bold">ڕێزەکان (Rows)</span>
              <div className="flex items-center gap-2 bg-white/5 rounded-lg border border-white/10 p-1">
                <button 
                  onClick={() => handleUpdateRows(-1)} 
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-md font-black text-lg text-gray-300 transition-colors"
                >
                  -
                </button>
                <span className="flex-1 text-center font-bold text-sm text-white">{activeTextObject.rowsCount || 3}</span>
                <button 
                  onClick={() => handleUpdateRows(1)} 
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-md font-black text-lg text-gray-300 transition-colors"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1 text-right">
              <span className="text-[11px] text-gray-400 font-bold">خانەکان/ستوون (Cols)</span>
              <div className="flex items-center gap-2 bg-white/5 rounded-lg border border-white/10 p-1">
                <button 
                  onClick={() => handleUpdateCols(-1)} 
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-md font-black text-lg text-gray-300 transition-colors"
                >
                  -
                </button>
                <span className="flex-1 text-center font-bold text-sm text-white">{activeTextObject.colsCount || 3}</span>
                <button 
                  onClick={() => handleUpdateCols(1)} 
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-md font-black text-lg text-gray-300 transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Merge & Unmerge Cells Tool */}
          <div className="flex flex-col gap-2 text-right border-t border-white/10 pt-3">
            <span className="text-[11px] text-blue-400 font-extrabold flex items-center gap-1">
              <span>🔗</span>
              <span>تێکەڵکردن و جوداکرنا خانەیان (Merge / Unmerge)</span>
            </span>
            
            <div className="bg-white/5 rounded-xl border border-white/10 p-2.5 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2 text-right">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">خانەیا یەکەم (دەستپێک)</span>
                  <div className="flex gap-1">
                    <select 
                      value={Math.min(mergeStartRow, (activeTextObject.rowsCount || 1) - 1)}
                      onChange={(e) => setMergeStartRow(Number(e.target.value))}
                      className="bg-black/60 border border-white/10 rounded p-1 text-[11px] text-white flex-1 focus:outline-none"
                    >
                      {Array.from({ length: activeTextObject.rowsCount || 1 }).map((_, r) => (
                        <option key={r} value={r}>ڕێزا {r + 1}</option>
                      ))}
                    </select>
                    <select 
                      value={Math.min(mergeStartCol, (activeTextObject.colsCount || 1) - 1)}
                      onChange={(e) => setMergeStartCol(Number(e.target.value))}
                      className="bg-black/60 border border-white/10 rounded p-1 text-[11px] text-white flex-1 focus:outline-none"
                    >
                      {Array.from({ length: activeTextObject.colsCount || 1 }).map((_, c) => (
                        <option key={c} value={c}>ستوونا {c + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">خانەیا دووەم (کۆتایی)</span>
                  <div className="flex gap-1">
                    <select 
                      value={Math.min(mergeEndRow, (activeTextObject.rowsCount || 1) - 1)}
                      onChange={(e) => setMergeEndRow(Number(e.target.value))}
                      className="bg-black/60 border border-white/10 rounded p-1 text-[11px] text-white flex-1 focus:outline-none"
                    >
                      {Array.from({ length: activeTextObject.rowsCount || 1 }).map((_, r) => (
                        <option key={r} value={r}>ڕێزا {r + 1}</option>
                      ))}
                    </select>
                    <select 
                      value={Math.min(mergeEndCol, (activeTextObject.colsCount || 1) - 1)}
                      onChange={(e) => setMergeEndCol(Number(e.target.value))}
                      className="bg-black/60 border border-white/10 rounded p-1 text-[11px] text-white flex-1 focus:outline-none"
                    >
                      {Array.from({ length: activeTextObject.colsCount || 1 }).map((_, c) => (
                        <option key={c} value={c}>ستوونا {c + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                onClick={handleMergeCells}
                className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors shadow-md active:scale-[0.98]"
              >
                تێکەڵکرنا خانەیا (Merge Cells)
              </button>
            </div>

            {/* List of Merged Ranges */}
            {activeTextObject.mergedRanges && activeTextObject.mergedRanges.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-[10px] text-gray-400 font-bold">خانەیێن تێکەڵکری (Merged Ranges):</span>
                <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto bg-black/30 p-1.5 rounded-lg border border-white/5">
                  {activeTextObject.mergedRanges.map((range: any, idx: number) => (
                    <div 
                      key={idx}
                      className="flex items-center gap-1.5 bg-blue-950/80 border border-blue-800/60 rounded px-2 py-0.5 text-[10px]"
                    >
                      <button 
                        onClick={() => handleUnmergeRange(idx)}
                        className="text-red-400 hover:text-red-200 transition-colors font-black text-xs"
                        title="جوداکرنەوە / Unmerge"
                      >
                        ✕
                      </button>
                      <span className="text-blue-200 font-mono">
                        [{range.r1 + 1},{range.c1 + 1}] ➔ [{range.r2 + 1},{range.c2 + 1}]
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Color Settings Section */}
          <div className="flex flex-col gap-2 text-right border-t border-white/10 pt-3">
            <span className="text-[11px] text-emerald-400 font-extrabold flex items-center gap-1">
              <span>🎨</span>
              <span>ڕێکخستنێن ڕەنگی (Color Table)</span>
            </span>

            <div className="bg-white/5 rounded-xl border border-white/10 p-2.5 flex flex-col gap-3">
              {/* Fill Color picker */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-300">ڕەنگێ پشتخانێ (Cell Fill)</span>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => handleUpdateFillColor('transparent')}
                    className="w-5 h-5 rounded-full border border-white/20 bg-slate-800 hover:scale-110 transition-transform relative overflow-hidden"
                    title="Transparent"
                  >
                    <div className="absolute inset-0 border-t-2 border-red-500 rotate-45 transform origin-center"></div>
                  </button>
                  {['rgba(255, 255, 255, 0.95)', '#eff6ff', '#f0fdf4', '#fef2f2'].map((c) => (
                    <button 
                      key={c}
                      onClick={() => handleUpdateFillColor(c)}
                      className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input 
                    type="color"
                    value={activeTextObject.tableFillColor && activeTextObject.tableFillColor.startsWith('#') ? activeTextObject.tableFillColor : '#ffffff'}
                    onChange={(e) => handleUpdateFillColor(e.target.value)}
                    className="w-5 h-5 rounded-full cursor-pointer bg-transparent border-0 focus:outline-none"
                    style={{ padding: 0 }}
                  />
                </div>
              </div>

              {/* Text Color picker */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-300">ڕەنگێ نڤیسینێ (Text Color)</span>
                <div className="flex items-center gap-1.5">
                  {['#1f2937', '#2563eb', '#16a34a', '#dc2626'].map((c) => (
                    <button 
                      key={c}
                      onClick={() => handleUpdateTextColor(c)}
                      className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input 
                    type="color"
                    value={activeTextObject.tableTextColor || '#1f2937'}
                    onChange={(e) => handleUpdateTextColor(e.target.value)}
                    className="w-5 h-5 rounded-full cursor-pointer bg-transparent border-0 focus:outline-none"
                    style={{ padding: 0 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section Transparency / Visibility */}
          <div className="flex flex-col gap-2 text-right border-t border-white/10 pt-3">
            <span className="text-[11px] text-amber-400 font-extrabold flex items-center gap-1">
              <span>👁️</span>
              <span>شەفافکرنا بەشێن جودا (Section Transparency)</span>
            </span>

            <div className="bg-white/5 rounded-xl border border-white/10 p-2.5 flex flex-col gap-3 text-right">
              {/* Header section options */}
              <div className="flex flex-col gap-1.5 border-b border-white/5 pb-2">
                <span className="text-[10px] text-amber-200 font-black">سەرێ خشتەی (سەری / Header)</span>
                <div className="flex justify-between items-center text-[10px] text-gray-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={activeTextObject.transparentHeaderBg || false}
                      onChange={(e) => handleUpdateToggleProp('transparentHeaderBg', e.target.checked)}
                      className="rounded bg-black border-white/10 accent-blue-500"
                    />
                    <span>شەفافکرنا پشتخانێ</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={activeTextObject.hideHeaderBorders || false}
                      onChange={(e) => handleUpdateToggleProp('hideHeaderBorders', e.target.checked)}
                      className="rounded bg-black border-white/10 accent-blue-500"
                    />
                    <span>شاردنەوا هێڵان</span>
                  </label>
                </div>
              </div>

              {/* Middle rows section options */}
              <div className="flex flex-col gap-1.5 border-b border-white/5 pb-2">
                <span className="text-[10px] text-amber-200 font-black">ناڤەڕاستا خشتەی (نیڤەکا / Middle)</span>
                <div className="flex justify-between items-center text-[10px] text-gray-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={activeTextObject.transparentMiddleBg || false}
                      onChange={(e) => handleUpdateToggleProp('transparentMiddleBg', e.target.checked)}
                      className="rounded bg-black border-white/10 accent-blue-500"
                    />
                    <span>شەفافکرنا پشتخانێ</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={activeTextObject.hideMiddleBorders || false}
                      onChange={(e) => handleUpdateToggleProp('hideMiddleBorders', e.target.checked)}
                      className="rounded bg-black border-white/10 accent-blue-500"
                    />
                    <span>شاردنەوا هێڵان</span>
                  </label>
                </div>
              </div>

              {/* Footer row section options */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-amber-200 font-black">بنێ خشتەی (بنی / Footer)</span>
                <div className="flex justify-between items-center text-[10px] text-gray-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={activeTextObject.transparentFooterBg || false}
                      onChange={(e) => handleUpdateToggleProp('transparentFooterBg', e.target.checked)}
                      className="rounded bg-black border-white/10 accent-blue-500"
                    />
                    <span>شەفافکرنا پشتخانێ</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={activeTextObject.hideFooterBorders || false}
                      onChange={(e) => handleUpdateToggleProp('hideFooterBorders', e.target.checked)}
                      className="rounded bg-black border-white/10 accent-blue-500"
                    />
                    <span>شاردنەوا هێڵان</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Cell Spacing */}
          <div className="flex flex-col gap-1 text-right border-t border-white/10 pt-3">
            <div className="flex justify-between text-[11px] text-gray-400 font-bold">
              <span>ناوبەینی خانەکان (Spacing)</span>
              <span className="text-blue-400">{activeTextObject.cellGap ?? 4}px</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="25" 
              value={activeTextObject.cellGap ?? 4}
              onChange={(e) => handleUpdateGap(Number(e.target.value))}
              className="h-1 bg-white/10 rounded-lg cursor-pointer accent-primary w-full"
            />
          </div>

          {/* Cell Width & Height */}
          <div className="flex flex-col gap-3 text-right">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-gray-400 font-bold">
                <span>پانی خانە (Cell Width)</span>
                <span className="text-blue-400">{activeTextObject.cellWidth ?? 110}px</span>
              </div>
              <input 
                type="range" 
                min="50" 
                max="200" 
                value={activeTextObject.cellWidth ?? 110}
                onChange={(e) => handleUpdateCellWidth(Number(e.target.value))}
                className="h-1 bg-white/10 rounded-lg cursor-pointer accent-primary w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-gray-400 font-bold">
                <span>بەرزی خانە (Cell Height)</span>
                <span className="text-blue-400">{activeTextObject.cellHeight ?? 40}px</span>
              </div>
              <input 
                type="range" 
                min="20" 
                max="100" 
                value={activeTextObject.cellHeight ?? 40}
                onChange={(e) => handleUpdateCellHeight(Number(e.target.value))}
                className="h-1 bg-white/10 rounded-lg cursor-pointer accent-primary w-full"
              />
            </div>
          </div>

          {/* Textbox fields grid */}
          <div className="flex flex-col gap-2 text-right border-t border-white/10 pt-3">
            <span className="text-[11px] text-gray-400 font-bold">نڤیسینا دناڤ خانەیان دا (Type inside cells)</span>
            <div 
              className="grid gap-1.5 p-2 bg-white/5 rounded-xl border border-white/10 max-h-[180px] overflow-y-auto"
              style={{ 
                gridTemplateColumns: `repeat(${activeTextObject.colsCount || 3}, minmax(0, 1fr))`,
                direction: 'ltr'
              }}
            >
              {Array.from({ length: activeTextObject.rowsCount || 3 }).map((_, r) => (
                Array.from({ length: activeTextObject.colsCount || 3 }).map((_, c) => {
                  const idx = r * (activeTextObject.colsCount || 3) + c;
                  return (
                    <input
                      key={`${r}-${c}`}
                      type="text"
                      dir="auto"
                      value={(activeTextObject.cellTexts && activeTextObject.cellTexts[idx]) || ''}
                      onChange={(e) => handleUpdateCellText(idx, e.target.value)}
                      placeholder={`[${r+1},${c+1}]`}
                      className="bg-black/40 border border-white/10 hover:border-white/20 focus:border-blue-500 focus:outline-none text-white text-[11px] p-1.5 rounded font-medium text-center w-full transition-colors"
                    />
                  );
                })
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Fraction Editor Panel */}
      {isActive && activeTextObject && isEditingMode && activeTextObject.isFractionGroup === true && (
        <div 
          className="absolute top-4 right-4 z-50 bg-slate-900/95 backdrop-blur-md border border-white/15 rounded-2xl p-4 shadow-2xl text-white w-80 animate-in fade-in slide-in-from-right-4 duration-300 max-h-[85%] overflow-y-auto flex flex-col gap-4 text-right"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b border-white/10 pb-2">
            <button 
              onClick={() => {
                if (fabricCanvasRef.current) {
                  fabricCanvasRef.current.discardActiveObject();
                  fabricCanvasRef.current.renderAll();
                }
                setActiveTextObject(null);
              }}
              className="text-gray-400 hover:text-white hover:bg-white/10 p-1 rounded-full transition-all"
            >
              <Icons.X size={16} />
            </button>
            <div className="flex items-center gap-2 font-black text-sm text-blue-400">
              <span className="text-lg">½</span>
              <span>ڕێکخستنێن کەرتی (Fraction)</span>
            </div>
          </div>

          {/* Texts Section */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 text-right">
              <span className="text-[11px] text-gray-400 font-bold">سەرێ کەرتی (Numerator)</span>
              <input 
                id="fraction-numerator-input"
                type="text"
                dir="auto"
                value={fractionNumText}
                onFocus={handleScrollActiveObjectToTop}
                onChange={(e) => handleUpdateFractionItem({ numText: e.target.value })}
                placeholder="a"
                className="bg-black/40 border border-white/10 hover:border-white/20 focus:border-blue-500 focus:outline-none text-white text-xs p-2 rounded-lg font-medium text-center w-full transition-colors"
              />
            </div>
            
            <div className="flex flex-col gap-1 text-right">
              <span className="text-[11px] text-gray-400 font-bold">بنێ کەرتی (Denominator)</span>
              <input 
                id="fraction-denominator-input"
                type="text"
                dir="auto"
                value={fractionDenText}
                onFocus={handleScrollActiveObjectToTop}
                onChange={(e) => handleUpdateFractionItem({ denText: e.target.value })}
                placeholder="b"
                className="bg-black/40 border border-white/10 hover:border-white/20 focus:border-blue-500 focus:outline-none text-white text-xs p-2 rounded-lg font-medium text-center w-full transition-colors"
              />
            </div>
          </div>

          {/* Color Settings Section */}
          <div className="flex flex-col gap-2 text-right border-t border-white/10 pt-3">
            <span className="text-[11px] text-emerald-400 font-extrabold flex items-center gap-1">
              <span>🎨</span>
              <span>ڕێکخستنێن ڕەنگی (Colors)</span>
            </span>

            <div className="bg-white/5 rounded-xl border border-white/10 p-2.5 flex flex-col gap-3">
              {/* Numerator Color picker */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-300">ڕەنگێ سەرێ کەرتی</span>
                <div className="flex items-center gap-1.5">
                  {['#1f2937', '#2563eb', '#16a34a', '#dc2626', '#d97706'].map((c) => (
                    <button 
                      key={c}
                      onClick={() => handleUpdateFractionItem({ numColor: c })}
                      className="w-4 h-4 rounded-full border border-white/20 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input 
                    type="color"
                    value={fractionNumColor}
                    onChange={(e) => handleUpdateFractionItem({ numColor: e.target.value })}
                    className="w-4 h-4 rounded-full cursor-pointer bg-transparent border-0 focus:outline-none"
                    style={{ padding: 0 }}
                  />
                </div>
              </div>

              {/* Denominator Color picker */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-300">ڕەنگێ بنێ کەرتی</span>
                <div className="flex items-center gap-1.5">
                  {['#1f2937', '#2563eb', '#16a34a', '#dc2626', '#d97706'].map((c) => (
                    <button 
                      key={c}
                      onClick={() => handleUpdateFractionItem({ denColor: c })}
                      className="w-4 h-4 rounded-full border border-white/20 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input 
                    type="color"
                    value={fractionDenColor}
                    onChange={(e) => handleUpdateFractionItem({ denColor: e.target.value })}
                    className="w-4 h-4 rounded-full cursor-pointer bg-transparent border-0 focus:outline-none"
                    style={{ padding: 0 }}
                  />
                </div>
              </div>

              {/* Line Color picker */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-300">ڕەنگێ خەتا نیڤەکێ</span>
                <div className="flex items-center gap-1.5">
                  {['#1f2937', '#2563eb', '#16a34a', '#dc2626', '#d97706'].map((c) => (
                    <button 
                      key={c}
                      onClick={() => handleUpdateFractionItem({ lineColor: c })}
                      className="w-4 h-4 rounded-full border border-white/20 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input 
                    type="color"
                    value={fractionLineColor}
                    onChange={(e) => handleUpdateFractionItem({ lineColor: e.target.value })}
                    className="w-4 h-4 rounded-full cursor-pointer bg-transparent border-0 focus:outline-none"
                    style={{ padding: 0 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Line Length & Thickness sliders */}
          <div className="flex flex-col gap-3 text-right border-t border-white/10 pt-3">
            <span className="text-[11px] text-amber-400 font-extrabold flex items-center gap-1">
              <span>📏</span>
              <span>ڕێکخستنا خەتێ و دەقی (Dimensions)</span>
            </span>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                <span>درێژیا خەتا نیڤەکێ (Line Padding)</span>
                <span className="text-blue-400">+{fractionLineWidthPadding}px</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="50" 
                value={fractionLineWidthPadding}
                onChange={(e) => handleUpdateFractionItem({ padding: Number(e.target.value) })}
                className="h-1 bg-white/10 rounded-lg cursor-pointer accent-primary w-full"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                <span>ستووریا خەتێ (Line Thickness)</span>
                <span className="text-blue-400">{fractionLineThickness}px</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={fractionLineThickness}
                onChange={(e) => handleUpdateFractionItem({ thickness: Number(e.target.value) })}
                className="h-1 bg-white/10 rounded-lg cursor-pointer accent-primary w-full"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                <span>قەبارێ دەقی (Font Size)</span>
                <span className="text-blue-400">{fractionFontSize}px</span>
              </div>
              <input 
                type="range" 
                min="12" 
                max="60" 
                value={fractionFontSize}
                onChange={(e) => handleUpdateFractionItem({ fontSize: Number(e.target.value) })}
                className="h-1 bg-white/10 rounded-lg cursor-pointer accent-primary w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Math Symbol Editor Panel */}
      {isActive && activeTextObject && isEditingMode && activeTextObject.isMathSymbolGroup === true && (
        <div 
          className="absolute top-4 right-4 z-50 bg-slate-900/95 backdrop-blur-md border border-white/15 rounded-2xl p-4 shadow-2xl text-white w-80 animate-in fade-in slide-in-from-right-4 duration-300 max-h-[85%] overflow-y-auto flex flex-col gap-4 text-right"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b border-white/10 pb-2">
            <button 
              onClick={() => {
                if (fabricCanvasRef.current) {
                  fabricCanvasRef.current.discardActiveObject();
                  fabricCanvasRef.current.renderAll();
                }
                setActiveTextObject(null);
              }}
              className="text-gray-400 hover:text-white hover:bg-white/10 p-1 rounded-full transition-all"
            >
              <Icons.X size={16} />
            </button>
            <div className="flex items-center gap-2 font-black text-sm text-purple-400">
              <span className="text-lg">∑</span>
              <span>ڕێکخستنێن هێمایێن بیرکاری (Math Symbol)</span>
            </div>
          </div>

          {/* Texts Section */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 text-right">
              <span className="text-[11px] text-gray-400 font-bold">هێما (Main Symbol)</span>
              <input 
                id="math-main-input"
                type="text"
                value={mathMainText}
                onFocus={handleScrollActiveObjectToTop}
                onChange={(e) => handleUpdateMathItem({ mainText: e.target.value })}
                className="bg-black/40 border border-white/10 hover:border-white/20 focus:border-blue-500 focus:outline-none text-white text-xs p-2 rounded-lg font-medium text-center w-full transition-colors"
              />
            </div>

            {mathTopText !== undefined && mathTopText !== '' && (
              <div className="flex flex-col gap-1 text-right">
                <span className="text-[11px] text-gray-400 font-bold">سەری / سنورێ سەرێ (Top Limit)</span>
                <input 
                  id="math-top-input"
                  type="text"
                  dir="auto"
                  value={mathTopText}
                  onFocus={handleScrollActiveObjectToTop}
                  onChange={(e) => handleUpdateMathItem({ topText: e.target.value })}
                  className="bg-black/40 border border-white/10 hover:border-white/20 focus:border-blue-500 focus:outline-none text-white text-xs p-2 rounded-lg font-medium text-center w-full transition-colors"
                />
              </div>
            )}
            
            {mathBottomText !== undefined && mathBottomText !== '' && (
              <div className="flex flex-col gap-1 text-right">
                <span className="text-[11px] text-gray-400 font-bold">بنی / سنورێ بنێ (Bottom Limit)</span>
                <input 
                  id="math-bottom-input"
                  type="text"
                  dir="auto"
                  value={mathBottomText}
                  onFocus={handleScrollActiveObjectToTop}
                  onChange={(e) => handleUpdateMathItem({ bottomText: e.target.value })}
                  className="bg-black/40 border border-white/10 hover:border-white/20 focus:border-blue-500 focus:outline-none text-white text-xs p-2 rounded-lg font-medium text-center w-full transition-colors"
                />
              </div>
            )}
          </div>

          {/* Colors section */}
          <div className="flex flex-col gap-2 text-right border-t border-white/10 pt-3">
            <span className="text-[11px] text-emerald-400 font-extrabold flex items-center gap-1">
              <span>🎨</span>
              <span>ڕێکخستنێن ڕەنگی (Colors)</span>
            </span>

            <div className="bg-white/5 rounded-xl border border-white/10 p-2.5 flex flex-col gap-3">
              {/* Main Symbol Color picker */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-300">ڕەنگێ هێمایێ سەرەکی</span>
                <div className="flex items-center gap-1.5">
                  {['#1f2937', '#2563eb', '#16a34a', '#dc2626', '#d97706'].map((c) => (
                    <button 
                      key={c}
                      onClick={() => handleUpdateMathItem({ mainColor: c })}
                      className="w-4 h-4 rounded-full border border-white/20 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input 
                    type="color"
                    value={mathMainColor}
                    onChange={(e) => handleUpdateMathItem({ mainColor: e.target.value })}
                    className="w-4 h-4 rounded-full cursor-pointer bg-transparent border-0 focus:outline-none"
                    style={{ padding: 0 }}
                  />
                </div>
              </div>

              {/* Top Limit Color picker */}
              {mathTopText !== undefined && mathTopText !== '' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-300">ڕەنگێ نڤیسینا سەری</span>
                  <div className="flex items-center gap-1.5">
                    {['#1f2937', '#2563eb', '#16a34a', '#dc2626', '#d97706'].map((c) => (
                      <button 
                        key={c}
                        onClick={() => handleUpdateMathItem({ topColor: c })}
                        className="w-4 h-4 rounded-full border border-white/20 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input 
                      type="color"
                      value={mathTopColor}
                      onChange={(e) => handleUpdateMathItem({ topColor: e.target.value })}
                      className="w-4 h-4 rounded-full cursor-pointer bg-transparent border-0 focus:outline-none"
                      style={{ padding: 0 }}
                    />
                  </div>
                </div>
              )}

              {/* Bottom Limit Color picker */}
              {mathBottomText !== undefined && mathBottomText !== '' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-300">ڕەنگێ نڤیسینا بنی</span>
                  <div className="flex items-center gap-1.5">
                    {['#1f2937', '#2563eb', '#16a34a', '#dc2626', '#d97706'].map((c) => (
                      <button 
                        key={c}
                        onClick={() => handleUpdateMathItem({ bottomColor: c })}
                        className="w-4 h-4 rounded-full border border-white/20 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input 
                      type="color"
                      value={mathBottomColor}
                      onChange={(e) => handleUpdateMathItem({ bottomColor: e.target.value })}
                      className="w-4 h-4 rounded-full cursor-pointer bg-transparent border-0 focus:outline-none"
                      style={{ padding: 0 }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sizes */}
          <div className="flex flex-col gap-3 text-right border-t border-white/10 pt-3">
            <span className="text-[11px] text-purple-400 font-extrabold flex items-center gap-1">
              <span>📏</span>
              <span>ڕێکخستنا قەبارەی (Sizes)</span>
            </span>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                <span>قەبارێ هێمایێ (Main Size)</span>
                <span className="text-blue-400">{mathFontSize}px</span>
              </div>
              <input 
                type="range" 
                min="20" 
                max="80" 
                value={mathFontSize}
                onChange={(e) => handleUpdateMathItem({ fontSize: Number(e.target.value) })}
                className="h-1 bg-white/10 rounded-lg cursor-pointer accent-primary w-full"
              />
            </div>

            {mathTopText !== undefined && mathTopText !== '' && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                  <span>قەبارێ نڤیسینا سەری (Top Size)</span>
                  <span className="text-blue-400">{mathTopFontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="8" 
                  max="30" 
                  value={mathTopFontSize}
                  onChange={(e) => handleUpdateMathItem({ topFontSize: Number(e.target.value) })}
                  className="h-1 bg-white/10 rounded-lg cursor-pointer accent-primary w-full"
                />
              </div>
            )}

            {mathBottomText !== undefined && mathBottomText !== '' && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                  <span>قەبارێ نڤیسینا بنی (Bottom Size)</span>
                  <span className="text-blue-400">{mathBottomFontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="8" 
                  max="30" 
                  value={mathBottomFontSize}
                  onChange={(e) => handleUpdateMathItem({ bottomFontSize: Number(e.target.value) })}
                  className="h-1 bg-white/10 rounded-lg cursor-pointer accent-primary w-full"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mathematical Graph Editor Panel */}
      {isActive && activeTextObject && isEditingMode && activeTextObject.isGraphGroup === true && (
        <div 
          className="absolute top-4 right-4 z-50 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm text-slate-800 w-80 animate-in fade-in slide-in-from-right-4 duration-300 max-h-[85%] overflow-y-auto flex flex-col gap-4 text-right"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b border-slate-100 pb-2 flex-row-reverse">
            <button 
              onClick={() => {
                if (fabricCanvasRef.current) {
                  fabricCanvasRef.current.discardActiveObject();
                  fabricCanvasRef.current.renderAll();
                }
                setActiveTextObject(null);
                setIsEditingMode(false);
              }}
              className="text-slate-400 hover:text-slate-800 hover:bg-slate-50 p-1.5 rounded-full transition-all"
            >
              <Icons.X size={16} />
            </button>
            <div className="flex items-center gap-2 font-black text-sm text-violet-600">
              <Icons.LineChart size={18} className="text-violet-600" />
              <span>ڕێکخستنێن هێڵکاریێ (Math Graph)</span>
            </div>
          </div>

          {/* Question Text */}
          <div className="flex flex-col gap-1 text-right">
            <span className="text-[11px] text-slate-400 font-bold">دەقێ پرسیارێ (Question Text)</span>
            <input 
              id="graph-question-input"
              type="text"
              value={graphQuestionText}
              onFocus={handleScrollActiveObjectToTop}
              onChange={(e) => handleUpdateGraphItem({ questionText: e.target.value })}
              className="bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-violet-500 focus:outline-none text-slate-800 text-xs p-2 rounded-lg font-medium text-right w-full transition-colors"
              placeholder="پرسیارێ ل ئێرە بنڤیسە..."
            />
          </div>

          {/* Graph Type Selection */}
          <div className="flex flex-col gap-1.5 text-right border-t border-slate-100 pt-2">
            <span className="text-[11px] text-slate-400 font-bold">جۆرێ هێڵکاریێ (Graph Type)</span>
            <div className="grid grid-cols-3 gap-1">
              {[
                { type: 'linear', label: 'هێڵی (Linear)', icon: 'y=mx+c' },
                { type: 'quadratic', label: 'کەوانەیی (Quadratic)', icon: 'y=ax²+c' },
                { type: 'points', label: 'خاڵان (Points)', icon: '• • •' }
              ].map((g) => (
                <button
                  key={g.type}
                  onClick={() => handleUpdateGraphItem({ graphType: g.type as any })}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition-all flex flex-col items-center justify-center gap-0.5
                    ${graphType === g.type 
                      ? 'bg-violet-600 border-violet-600 text-white shadow-none' 
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800'}`}
                >
                  <span className="opacity-80 font-mono text-[9px]">{g.icon}</span>
                  <span>{g.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Equation Controls */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-2.5 flex flex-col gap-3">
            <span className="text-[10px] text-violet-600 font-black flex items-center gap-1">
              <span>⚡</span>
              <span>دەستکاریکردنا هاوکێشەیێ (Equation)</span>
            </span>

            {graphType !== 'points' && (
              <div className="flex flex-col gap-3">
                {/* Equation List */}
                <div className="flex flex-col gap-2.5">
                  {getActiveEquations().map((eq, index) => {
                    const isLinear = eq.type === 'linear';
                    const activeEqs = getActiveEquations();
                    return (
                      <div 
                        key={eq.id} 
                        className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2.5 text-right relative shadow-sm"
                      >
                        {/* Equation Row Header */}
                        <div className="flex items-center justify-between flex-row-reverse border-b border-slate-100 pb-1.5">
                          <span className="text-[10px] text-slate-500 font-bold">
                            هاوکێشە {index + 1} ({isLinear ? 'هێڵی - Linear' : 'کەوانەیی - Quad'})
                          </span>
                          
                          {activeEqs.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveEquation(eq.id)}
                              className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-all"
                              title="Delete Equation"
                            >
                              <Icons.Trash size={12} />
                            </button>
                          )}
                        </div>

                        {/* Input for this specific equation */}
                        <div className="flex flex-col gap-1 text-right">
                          <span className="text-[9px] text-slate-400 font-bold">هاوکێشە (e.g. y = -x + 3)</span>
                          <input 
                            type="text"
                            value={eq.freeFormEq}
                            onChange={(e) => handleUpdateEquation(eq.id, { freeFormEq: e.target.value })}
                            className="bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-violet-500 focus:outline-none text-slate-800 text-xs p-1.5 rounded-lg font-mono text-center w-full transition-colors"
                            placeholder="y = x"
                          />
                        </div>

                        {/* Equation Coefficient Info (Readonly preview for clarity) */}
                        <div className="text-[9px] text-slate-500 font-mono text-center bg-slate-50/50 py-1 rounded border border-slate-100/50">
                          {isLinear ? (
                            <span>y = {eq.linearEq?.m ?? 1}x {((eq.linearEq?.c ?? 0) >= 0) ? `+ ${eq.linearEq?.c ?? 0}` : `- ${Math.abs(eq.linearEq?.c ?? 0)}`}</span>
                          ) : (
                            <span>y = {eq.quadEq?.a ?? 0.5}x² {((eq.quadEq?.b ?? 0) >= 0) ? `+ ${eq.quadEq?.b ?? 0}x` : `- ${Math.abs(eq.quadEq?.b ?? 0)}x`} {((eq.quadEq?.c ?? -2) >= 0) ? `+ ${eq.quadEq?.c ?? -2}` : `- ${Math.abs(eq.quadEq?.c ?? -2)}`}</span>
                          )}
                        </div>

                        {/* Independent Style Controls */}
                        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-right">
                          {/* Line Style (Solid or Dashed) */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] text-slate-400 font-bold">شێوازێ هێڵێ</span>
                            <div className="grid grid-cols-2 gap-0.5 bg-slate-100 p-0.5 rounded-md">
                              {[
                                { value: 'solid', label: 'Solid', spec: '━' },
                                { value: 'dashed', label: 'Dashed', spec: '╌' }
                              ].map((style) => (
                                <button
                                  key={style.value}
                                  type="button"
                                  onClick={() => handleUpdateEquation(eq.id, { lineStyle: style.value })}
                                  className={`py-0.5 rounded text-[8px] font-bold transition-all flex flex-col items-center justify-center
                                    ${eq.lineStyle === style.value 
                                      ? 'bg-white text-violet-600 shadow-sm' 
                                      : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                  <span>{style.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Line Thickness Slider */}
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-[8px] text-slate-500">
                              <span className="font-mono bg-slate-100 px-1 rounded font-bold">{eq.lineThickness || 3}px</span>
                              <span>ستووراتی</span>
                            </div>
                            <input 
                              type="range"
                              min="1"
                              max="10"
                              step="0.5"
                              value={eq.lineThickness || 3}
                              onChange={(e) => handleUpdateEquation(eq.id, { lineThickness: Number(e.target.value) })}
                              className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-violet-600 focus:outline-none mt-1"
                            />
                          </div>
                        </div>

                        {/* Independent Color Picker */}
                        <div className="flex items-center justify-between gap-1 flex-row-reverse border-t border-slate-100 pt-2 mt-1">
                          <span className="text-[9px] text-slate-400 font-bold">ڕەنگێ هاوکێشەیێ</span>
                          <div className="flex items-center gap-1">
                            {['#06b6d4', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'].map((c) => (
                              <button 
                                key={c}
                                type="button"
                                onClick={() => handleUpdateEquation(eq.id, { lineColor: c })}
                                className={`w-3.5 h-3.5 rounded-full border hover:scale-110 transition-all ${eq.lineColor === c ? 'border-slate-800 scale-105' : 'border-slate-200'}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                            <input 
                              type="color"
                              value={eq.lineColor || '#06b6d4'}
                              onChange={(e) => handleUpdateEquation(eq.id, { lineColor: e.target.value })}
                              className="w-3.5 h-3.5 rounded-full cursor-pointer bg-transparent border-0 focus:outline-none p-0"
                            />
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>

                {/* Add Equation Button */}
                <button
                  type="button"
                  onClick={handleAddEquation}
                  className="w-full py-2 border-2 border-dashed border-violet-200 hover:border-violet-400 hover:bg-violet-50 text-violet-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <Icons.Plus size={12} />
                  <span>زێدەکرنا هاوکێشەیێ (+ Add Equation)</span>
                </button>
              </div>
            )}

            {graphType === 'points' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-slate-400">خاڵێن کۆردینات (جوداکردن ب ";" - x,y):</span>
                <textarea 
                  value={graphPointsText}
                  onChange={(e) => {
                    const text = e.target.value;
                    setGraphPointsText(text);
                    const parsed = text.split(';')
                      .map(p => {
                        const parts = p.split(',');
                        if (parts.length === 2) {
                          const xVal = Number(parts[0].trim());
                          const yVal = Number(parts[1].trim());
                          if (!isNaN(xVal) && !isNaN(yVal)) {
                            return { x: xVal, y: yVal };
                          }
                        }
                        return null;
                      })
                      .filter((p): p is { x: number; y: number } => p !== null);
                    
                    handleUpdateGraphItem({ points: parsed });
                  }}
                  className="bg-white border border-slate-200 rounded p-1.5 text-center text-xs text-slate-800 h-16 focus:outline-none focus:border-violet-500 font-mono"
                  placeholder="-3,-2; -1,2; 2,1; 4,5"
                />
              </div>
            )}
          </div>

          {/* Grid, Steps, Limits Controls */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-2.5 flex flex-col gap-2.5">
            <span className="text-[10px] text-violet-600 font-black flex items-center gap-1">
              <span>📏</span>
              <span>تەوەرە و تۆڕ (Axes & Grid)</span>
            </span>

            {/* Grid Visibility and Custom Range */}
            <div className="flex items-center justify-between text-[10px] text-slate-600 pb-1.5 border-b border-slate-200/50">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={graphShowGrid}
                  onChange={(e) => handleUpdateGraphItem({ showGrid: e.target.checked })}
                  className="rounded bg-white border-slate-300 accent-violet-600"
                />
                <span>شیشەکردنا تۆڕێ (Show Grid)</span>
              </label>
            </div>

            {/* Custom Limits */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400">مەودای تەوەری X (X Max/Min)</span>
                <div className="flex gap-1">
                  <input 
                    type="number"
                    value={graphXMin}
                    onChange={(e) => handleUpdateGraphItem({ xMin: Number(e.target.value) || -6 })}
                    className="bg-white border border-slate-200 rounded p-0.5 text-center text-[10px] text-slate-800 w-1/2 font-mono focus:outline-none focus:border-violet-500"
                    title="X Min"
                  />
                  <input 
                    type="number"
                    value={graphXMax}
                    onChange={(e) => handleUpdateGraphItem({ xMax: Number(e.target.value) || 6 })}
                    className="bg-white border border-slate-200 rounded p-0.5 text-center text-[10px] text-slate-800 w-1/2 font-mono focus:outline-none focus:border-violet-500"
                    title="X Max"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400">مەودای تەوەری Y (Y Max/Min)</span>
                <div className="flex gap-1">
                  <input 
                    type="number"
                    value={graphYMin}
                    onChange={(e) => handleUpdateGraphItem({ yMin: Number(e.target.value) || -6 })}
                    className="bg-white border border-slate-200 rounded p-0.5 text-center text-[10px] text-slate-800 w-1/2 font-mono focus:outline-none focus:border-violet-500"
                    title="Y Min"
                  />
                  <input 
                    type="number"
                    value={graphYMax}
                    onChange={(e) => handleUpdateGraphItem({ yMax: Number(e.target.value) || 6 })}
                    className="bg-white border border-slate-200 rounded p-0.5 text-center text-[10px] text-slate-800 w-1/2 font-mono focus:outline-none focus:border-violet-500"
                    title="Y Max"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400">هەنگاوێ X (X Step)</span>
                <input 
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={graphXStep}
                  onChange={(e) => handleUpdateGraphItem({ xStep: Number(e.target.value) || 1 })}
                  className="bg-white border border-slate-200 rounded p-0.5 text-center text-[10px] text-slate-800 font-mono focus:outline-none focus:border-violet-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400">هەنگاوێ Y (Y Step)</span>
                <input 
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={graphYStep}
                  onChange={(e) => handleUpdateGraphItem({ yStep: Number(e.target.value) || 1 })}
                  className="bg-white border border-slate-200 rounded p-0.5 text-center text-[10px] text-slate-800 font-mono focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          </div>

          {/* Color Customizers */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-2.5 flex flex-col gap-2 pt-2 text-right">
            <span className="text-[10px] text-violet-600 font-black flex items-center gap-1">
              <span>🎨</span>
              <span>ڕەنگ و پاشبنەما (Aesthetics)</span>
            </span>

            {/* Line Color picker */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/50 pb-1.5 flex-row-reverse">
              <span className="text-[10px] text-slate-600">ڕەنگێ هێڵێ (Line Color)</span>
              <div className="flex items-center gap-1">
                {['#06b6d4', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'].map((c) => (
                  <button 
                    key={c}
                    onClick={() => handleUpdateGraphItem({ lineColor: c })}
                    className={`w-3.5 h-3.5 rounded-full border hover:scale-110 transition-all ${graphLineColor === c ? 'border-slate-800' : 'border-slate-200'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input 
                  type="color"
                  value={graphLineColor}
                  onChange={(e) => handleUpdateGraphItem({ lineColor: e.target.value })}
                  className="w-3.5 h-3.5 rounded-full cursor-pointer bg-transparent border-0 focus:outline-none p-0"
                />
              </div>
            </div>

            {/* Background Color picker */}
            <div className="flex items-center justify-between gap-2 flex-row-reverse">
              <span className="text-[10px] text-slate-600 font-bold">پاشبنەما (Bg Color)</span>
              <div className="flex items-center gap-1">
                {[
                  { value: '#0f172a', label: 'تۆخ' },
                  { value: '#ffffff', label: 'سپی' },
                  { value: 'transparent', label: 'بێ ڕەنگ' }
                ].map((bg) => (
                  <button 
                    key={bg.value}
                    onClick={() => {
                      const isDark = bg.value === '#0f172a';
                      const textC = isDark ? '#f8fafc' : '#334155';
                      const axisC = isDark ? '#475569' : '#cbd5e1';
                      const gridC = isDark ? '#1e293b' : '#f1f5f9';
                      handleUpdateGraphItem({ 
                        bgColor: bg.value,
                        textColor: textC,
                        axisColor: axisC,
                        gridColor: gridC
                      });
                    }}
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded border transition-all
                      ${graphBgColor === bg.value 
                        ? 'bg-violet-600 border-violet-600 text-white' 
                        : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Advanced Line Customization Controls */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-2.5 flex flex-col gap-3 text-right">
            <span className="text-[10px] text-violet-600 font-black flex items-center gap-1">
              <span>✏️</span>
              <span>شێوازێ هێڵێ (Line Style)</span>
            </span>

            {/* Thickness Control */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px] text-slate-600">
                <span className="font-mono bg-slate-200/50 px-1.5 py-0.5 rounded text-[9px] font-bold">
                  {graphLineThickness}px
                </span>
                <span>ستووراتییا هێڵێ (Line Thickness)</span>
              </div>
              <input 
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={graphLineThickness}
                onChange={(e) => handleUpdateGraphItem({ lineThickness: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600 focus:outline-none"
              />
            </div>

            {/* Line Type Selector */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-slate-400 font-bold font-sans">جۆرێ هێڵێ (Line Style)</span>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { value: 'solid', label: 'پڕ (Solid)', spec: '━' },
                  { value: 'dashed', label: 'شەقشەقی', spec: '╌' },
                  { value: 'dotted', label: 'خاڵخاڵی', spec: '• •' }
                ].map((s) => (
                  <button 
                    key={s.value}
                    type="button"
                    onClick={() => handleUpdateGraphItem({ lineStyle: s.value as any })}
                    className={`py-1 rounded-md text-[10px] font-bold border transition-all flex flex-col items-center justify-center gap-0.5
                      ${graphLineStyle === s.value 
                        ? 'bg-violet-600 border-violet-600 text-white' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800'}`}
                  >
                    <span className="font-mono text-[9px] opacity-85 leading-none">{s.spec}</span>
                    <span className="text-[9px]">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page Number Indicator */}
      <div className="absolute -left-10 top-0 text-gray-400 font-bold text-lg hidden xl:block">
        {pageNumber}
      </div>

      {/* Code Editor Modal (Overlay/Dialog) */}
      {isCodeEditorOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-zinc-950/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div 
            className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl text-white w-full max-w-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200 text-right"
            dir="rtl"
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b border-white/10 pb-3 flex-row-reverse">
              <button 
                onClick={() => setIsCodeEditorOpen(false)}
                className="text-gray-400 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-all"
              >
                <Icons.X size={18} />
              </button>
              <div className="flex items-center gap-2 font-black text-base text-teal-400">
                <Icons.Code size={20} className="animate-pulse text-teal-400" />
                <span>دەستکاری کرنا کۆدی (Edit Text Code)</span>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-gray-400 font-bold leading-relaxed">
              ل ڤێرە دشێی دەستکاری د کۆد و شێوازێ نڤیسینێ دا بکەی. دشێی کۆدێن ڕەنگان <code className="text-teal-300 font-mono">{"<span style=\"color:#ڕەنگ\">"}</code> یان کۆدێن ئەستوورکرنێ <code className="text-teal-300 font-mono">{"<b>"}</code> بەکاربینی.
            </p>

            {/* Textarea */}
            <textarea
              value={codeEditorText}
              onChange={(e) => setCodeEditorText(e.target.value)}
              className="w-full h-64 bg-zinc-950 border border-white/10 rounded-xl p-4 font-mono text-xs text-gray-200 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 resize-none leading-relaxed text-left"
              style={{ direction: 'ltr' }}
              placeholder="کۆدی نڤیسینێ ل ڤێرە بنڤیسە..."
            />

            {/* Actions */}
            <div className="flex gap-3 justify-end mt-2 flex-wrap">
              <button
                onClick={() => {
                  if (editingObject && fabricCanvasRef.current) {
                    const canvas = fabricCanvasRef.current;
                    const left = editingObject.left || 150;
                    const top = editingObject.top || 150;
                    const color = editingObject.fill || '#1f2937';
                    
                    // Convert LaTeX to rich components
                    convertLatexToFabricElements(codeEditorText, left, top, color, canvas, onModified);
                    
                    // Remove the old raw text object
                    canvas.remove(editingObject);
                    canvas.renderAll();
                    setIsCodeEditorOpen(false);
                  }
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-95 text-white font-black text-xs transition-all shadow-lg cursor-pointer"
                title="کۆدێن بیرکاری و کەرتا وەربگێڕە بۆ سەر لاپەڕێ (Convert Math & Fractions)"
              >
                <Icons.Calculator size={16} />
                <span>چارەسەرکرنا بیرکاریێ (Render LaTeX)</span>
              </button>

              <button
                onClick={() => {
                  if (editingObject) {
                    const parsed = parseHtmlStyles(codeEditorText);
                    editingObject.set({
                      text: parsed.plainText,
                      styles: parsed.styles
                    });
                    editingObject.rawHtmlText = codeEditorText;
                    if (fabricCanvasRef.current) {
                      fabricCanvasRef.current.renderAll();
                    }
                    if (onModified) onModified();
                  }
                  setIsCodeEditorOpen(false);
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:scale-95 text-white font-black text-xs transition-all shadow-lg cursor-pointer"
              >
                <Icons.Check size={16} />
                <span>پەسەندکرن (Apply Standard)</span>
              </button>
              
              <button
                onClick={() => setIsCodeEditorOpen(false)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-gray-300 hover:text-white font-black text-xs transition-all border border-white/5 cursor-pointer"
              >
                <span>پاشگەزبوون (Cancel)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PageEditor;