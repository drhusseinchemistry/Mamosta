import React, { useState, useEffect } from 'react';
import { Icons } from './Icon';
import { improveTextWithAI, generateQuestionsFromFile, checkServerConfig } from '../services/geminiService';

interface TextFormatterProps {
  canvas: any;
  activeObject: any;
  onModified: () => void;
  onClose?: () => void;
}

// Global variable to keep copied style accessible across pages/renders
let copiedTextStyle: Record<string, any> | null = null;

const FONTS_LIST = [
  { name: 'Noto Sans Arabic', label: 'کوردى' },
  { name: 'Inter', label: 'Inter' },
  { name: 'JetBrains Mono', label: 'Mono' },
  { name: 'Tahoma', label: 'Tahoma' },
  { name: 'Times New Roman', label: 'Times' }
];

const PRESET_COLORS = [
  '#000000', '#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'
];

export const TextFormatter: React.FC<TextFormatterProps> = ({ canvas, activeObject, onModified, onClose }) => {
  // Identify object types
  const isText = activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text' || activeObject.type === 'textbox');
  const isPathOrLine = activeObject && (activeObject.type === 'path' || activeObject.type === 'line' || activeObject.type === 'polyline' || activeObject.type === 'rect' || activeObject.type === 'circle' || activeObject.type === 'ellipse');
  const isGroup = activeObject && (activeObject.type === 'group' || activeObject.type === 'activeSelection');

  // Sync state with Fabric Object properties
  const [fontFamily, setFontFamily] = useState('Noto Sans Arabic');
  const [fontSize, setFontSize] = useState(24);
  const [colorValue, setColorValue] = useState('#000000');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isLinethrough, setIsLinethrough] = useState(false);
  const [textAlign, setTextAlign] = useState('right');
  const [textDirection, setTextDirection] = useState<'ltr' | 'rtl'>('rtl');
  const [charSpacing, setCharSpacing] = useState(0);
  const [lineHeight, setLineHeight] = useState(1.16);
  const [opacity, setOpacity] = useState(1);
  const [hasShadow, setHasShadow] = useState(false);
  const [hasNeon, setHasNeon] = useState(false);
  const [hasOutline, setHasOutline] = useState(false);

  // Shape and Border Style States
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [cornerRadius, setCornerRadius] = useState(0);
  const [strokeStyle, setStrokeStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [fillColor, setFillColor] = useState('transparent');

  // AI Assistant States
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const handleGroupDirection = (dir: 'rtl' | 'ltr') => {
    if (!activeObject) return;
    const items = activeObject.getObjects ? activeObject.getObjects() : [activeObject];
    items.forEach((item: any) => {
      if (item.type === 'i-text' || item.type === 'text' || item.type === 'textbox') {
        item.set({
          textAlign: dir === 'rtl' ? 'right' : 'left',
          fontFamily: dir === 'rtl' ? 'Noto Sans Arabic' : 'Inter'
        });
        if (typeof item.initDimensions === 'function') {
          item.initDimensions();
        }
        item.dirty = true;
      } else if (item.getObjects) {
        // Recursive for nested groups
        const subItems = item.getObjects();
        subItems.forEach((sub: any) => {
          if (sub.type === 'i-text' || sub.type === 'text' || sub.type === 'textbox') {
            sub.set({
              textAlign: dir === 'rtl' ? 'right' : 'left',
              fontFamily: dir === 'rtl' ? 'Noto Sans Arabic' : 'Inter'
            });
            if (typeof sub.initDimensions === 'function') {
              sub.initDimensions();
            }
            sub.dirty = true;
          }
        });
      }
    });
    if (activeObject.type === 'group') {
      activeObject.dirty = true;
    }
    canvas.renderAll();
    onModified();
  };

  const handleMirrorGroupHorizontal = () => {
    if (!activeObject) return;
    const items = activeObject.getObjects ? activeObject.getObjects() : [activeObject];
    if (items.length <= 1) return;

    // Calculate bounding box of items inside the group
    const lefts = items.map((item: any) => item.left || 0);
    const minLeft = Math.min(...lefts);
    const maxLeft = Math.max(...lefts);
    const sumLeft = minLeft + maxLeft;

    items.forEach((item: any) => {
      // Reverse horizontal position
      const currentLeftVal = item.left || 0;
      item.set('left', sumLeft - currentLeftVal);
      
      // Mirror arrows
      if (item.type === 'group' || item.type === 'activeSelection') {
        // can recurse or do sub-item mirror if needed, but reversing is generally enough
      } else if (item.angle !== undefined) {
        if (item.angle === 90) item.set('angle', 270);
        else if (item.angle === 270) item.set('angle', 90);
      }
    });

    if (activeObject.type === 'group') {
      activeObject.dirty = true;
    }
    canvas.renderAll();
    onModified();
  };

  const handleAIImprove = async () => {
    if (!activeObject || !isText) return;
    
    const apiKey = localStorage.getItem('gemini_api_key') || '';
    const hasServerKey = await checkServerConfig();
    if (!apiKey && !hasServerKey) {
      setAiError('تکایە سەرەتا کلیلێ API دابنێ ل ڕێکخستنان (Settings)');
      return;
    }

    setAiLoading(true);
    setAiError('');

    try {
      const currentText = activeObject.text || '';
      const result = await improveTextWithAI(apiKey, currentText, aiPrompt);
      if (result) {
        activeObject.set('text', result);
        canvas.renderAll();
        onModified();
      } else {
        setAiError('چو نڤیسین نەهاتنە وەرگرتن');
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || 'هەڵەیەک ڕوویدا لە کاتی پەیوەندیکردن ب لایەنێ AI');
    } finally {
      setAiLoading(false);
    }
  };

  const [uploadedFile, setUploadedFile] = useState<{ name: string; data: string; mimeType: string } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiError('');
    const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedFile({
        name: file.name,
        data: reader.result as string,
        mimeType: mimeType
      });
      // Reset input element
      e.target.value = '';
    };
    reader.onerror = () => {
      setAiError('کێشەیەک لە خوێندنەوەی فایلەکە ڕوویدا');
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateQuestions = async () => {
    if (!activeObject || !uploadedFile) return;

    const apiKey = localStorage.getItem('gemini_api_key') || '';
    const hasServerKey = await checkServerConfig();
    if (!apiKey && !hasServerKey) {
      setAiError('تکایە سەرەتا کلیلێ API دابنێ ل ڕێکخستنان (Settings)');
      return;
    }

    setFileLoading(true);
    setAiError('');

    try {
      const questions = await generateQuestionsFromFile(apiKey, uploadedFile.data, uploadedFile.mimeType, aiPrompt);
      if (questions) {
        activeObject.set('text', questions);
        canvas.renderAll();
        onModified();
        // Clear uploaded file after successful generation
        setUploadedFile(null);
      } else {
        setAiError('چو پرسیار نەهاتنە دەرهێنان یان دروستکردن');
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || 'هەڵەیەک ڕوویدا لە کاتی پەیوەندیکردن ب لایەنێ AI');
    } finally {
      setFileLoading(false);
    }
  };

  // Sync state whenever activeObject changes or gets modified
  useEffect(() => {
    if (!activeObject) return;

    const syncProperties = () => {
      if (isText) {
        setFontFamily(activeObject.fontFamily || 'Noto Sans Arabic');
        setFontSize(Math.round(activeObject.fontSize || 24));
        setColorValue(activeObject.fill || '#000000');
        setIsBold(activeObject.fontWeight === 'bold');
        setIsItalic(activeObject.fontStyle === 'italic');
        setIsUnderline(!!activeObject.underline);
        setIsLinethrough(!!activeObject.linethrough);
        setTextAlign(activeObject.textAlign || 'right');
        setTextDirection(activeObject.direction || 'rtl');
        setCharSpacing(activeObject.charSpacing || 0);
        setLineHeight(activeObject.lineHeight || 1.16);
        
        const shadowObj = activeObject.shadow;
        const shadowStr = shadowObj ? (typeof shadowObj === 'string' ? shadowObj : JSON.stringify(shadowObj)) : '';
        const isNeon = !!shadowObj && (
          shadowStr.includes('0px 0px') || 
          (typeof shadowObj === 'object' && (shadowObj as any).blur > 0 && (shadowObj as any).offsetX === 0 && (shadowObj as any).offsetY === 0)
        );
        setHasShadow(!!shadowObj && !isNeon);
        setHasNeon(isNeon);
        setHasOutline(!!activeObject.strokeWidth && activeObject.strokeWidth > 0);
      } else {
        // For drawing paths, lines, shapes, use stroke color as main color
        setColorValue(activeObject.stroke || activeObject.fill || '#000000');
      }

      // Sync shape and border properties
      setStrokeWidth(activeObject.strokeWidth || 2);
      if (activeObject.type === 'rect') {
        setCornerRadius(activeObject.rx || 0);
      }
      
      const dashArray = activeObject.strokeDashArray;
      if (!dashArray || dashArray.length === 0) {
        setStrokeStyle('solid');
      } else if (dashArray[0] > 5) {
        setStrokeStyle('dashed');
      } else {
        setStrokeStyle('dotted');
      }
      
      setFillColor(activeObject.fill || 'transparent');
      setOpacity(activeObject.opacity !== undefined ? activeObject.opacity : 1);
    };

    syncProperties();

    const onSelected = () => syncProperties();
    activeObject.on('selected', onSelected);
    activeObject.on('modified', onSelected);

    return () => {
      activeObject.off('selected', onSelected);
      activeObject.off('modified', onSelected);
    };
  }, [activeObject, isText]);

  const updateProperty = (key: string, value: any) => {
    if (!activeObject) return;
    activeObject.set(key, value);
    canvas.renderAll();
    onModified();
  };

  const handleCornerRadiusChange = (radius: number) => {
    setCornerRadius(radius);
    if (activeObject && activeObject.type === 'rect') {
      activeObject.set({ rx: radius, ry: radius });
      canvas.renderAll();
      onModified();
    }
  };

  const handleStrokeWidthChange = (width: number) => {
    setStrokeWidth(width);
    if (activeObject) {
      activeObject.set({ strokeWidth: width });
      canvas.renderAll();
      onModified();
    }
  };

  const handleStrokeDashChange = (style: 'solid' | 'dashed' | 'dotted') => {
    setStrokeStyle(style);
    if (activeObject) {
      let dashArray: number[] | null = null;
      if (style === 'dashed') {
        dashArray = [12, 6];
      } else if (style === 'dotted') {
        dashArray = [3, 4];
      }
      activeObject.set({ strokeDashArray: dashArray });
      canvas.renderAll();
      onModified();
    }
  };

  const handleFillColorChange = (color: string) => {
    setFillColor(color);
    if (activeObject) {
      activeObject.set({ fill: color });
      canvas.renderAll();
      onModified();
    }
  };

  const handleFontChange = (fontName: string) => {
    setFontFamily(fontName);
    updateProperty('fontFamily', fontName);
  };

  const handleFontSizeChange = (size: number) => {
    const validSize = Math.max(8, Math.min(300, size));
    setFontSize(validSize);
    updateProperty('fontSize', validSize);
  };

  const handleColorChange = (color: string) => {
    setColorValue(color);
    if (!activeObject) return;
    if (isText) {
      activeObject.set('fill', color);
    } else {
      activeObject.set('stroke', color);
      // If it's a shape with a filled color, color it too
      if (activeObject.fill && activeObject.fill !== 'transparent' && activeObject.fill !== '') {
        activeObject.set('fill', color);
      }
    }
    canvas.renderAll();
    onModified();
  };

  const toggleBold = () => {
    const nextBold = !isBold;
    setIsBold(nextBold);
    updateProperty('fontWeight', nextBold ? 'bold' : 'normal');
  };

  const toggleItalic = () => {
    const nextItalic = !isItalic;
    setIsItalic(nextItalic);
    updateProperty('fontStyle', nextItalic ? 'italic' : 'normal');
  };

  const toggleUnderline = () => {
    const nextUnderline = !isUnderline;
    setIsUnderline(nextUnderline);
    updateProperty('underline', nextUnderline);
  };

  const toggleStrikethrough = () => {
    const nextLinethrough = !isLinethrough;
    setIsLinethrough(nextLinethrough);
    updateProperty('linethrough', nextLinethrough);
  };

  const handleAlignChange = (align: string) => {
    setTextAlign(align);
    updateProperty('textAlign', align);
  };

  const handleDirectionChange = (direction: 'ltr' | 'rtl') => {
    setTextDirection(direction);
    if (activeObject) {
      activeObject.set({
        textAlign: direction === 'rtl' ? 'right' : 'left',
        fontFamily: direction === 'rtl' ? 'Noto Sans Arabic' : 'Inter'
      });
      if (typeof activeObject.initDimensions === 'function') {
        activeObject.initDimensions();
      }
      activeObject.dirty = true;
      canvas.renderAll();
      onModified();
    }
  };

  const toggleCase = () => {
    if (!activeObject || !activeObject.text) return;
    const currentText = activeObject.text;
    let nextText = currentText;
    if (currentText === currentText.toUpperCase()) {
      nextText = currentText.toLowerCase();
    } else {
      nextText = currentText.toUpperCase();
    }
    activeObject.set('text', nextText);
    canvas.renderAll();
    onModified();
  };

  const handleCharSpacingChange = (val: number) => {
    setCharSpacing(val);
    updateProperty('charSpacing', val);
  };

  const handleLineHeightChange = (val: number) => {
    setLineHeight(val);
    updateProperty('lineHeight', val);
  };

  const handleOpacityChange = (val: number) => {
    setOpacity(val);
    updateProperty('opacity', val);
  };

  // Center & Layers arrangement for ALL objects
  const handlePosition = (action: 'front' | 'back' | 'centerH' | 'centerV' | 'top' | 'bottom') => {
    if (!activeObject) return;
    if (action === 'front') {
      canvas.bringToFront(activeObject);
    } else if (action === 'back') {
      canvas.sendToBack(activeObject);
    } else if (action === 'centerH') {
      canvas.centerObjectH(activeObject);
    } else if (action === 'centerV') {
      canvas.centerObjectV(activeObject);
    } else if (action === 'top') {
      activeObject.set('top', 15);
    } else if (action === 'bottom') {
      const objHeight = activeObject.getBoundingRect().height;
      const canvasHeight = canvas.getHeight();
      activeObject.set('top', Math.max(15, canvasHeight - objHeight - 15));
    }
    canvas.renderAll();
    onModified();
  };

  const toggleBulletList = () => {
    if (!activeObject || !activeObject.text) return;
    const bulletChar = localStorage.getItem('app_list_marker') || '•';
    const lines = activeObject.text.split('\n');
    // Match any of our bullet types: •, ●, ■, ★, ✔, -
    const hasBullets = lines.every((line: string) => {
      const trimmed = line.trim();
      return /^\s*[•●■★✔\-]\s*/.test(trimmed);
    });
    const newLines = lines.map((line: string) => {
      const trimmed = line.trim();
      if (hasBullets) {
        // Strip out existing bullet types
        return line.replace(/^\s*[•●■★✔\-]\s*/, '');
      } else {
        if (trimmed.startsWith(bulletChar)) return line;
        return `${bulletChar} ${line}`;
      }
    });
    activeObject.set('text', newLines.join('\n'));
    canvas.renderAll();
    onModified();
  };

  const toggleNumberedList = () => {
    if (!activeObject || !activeObject.text) return;
    const lines = activeObject.text.split('\n');
    const hasNumbers = lines.every((line: string) => /^\s*\d+\.\s*/.test(line));
    const newLines = lines.map((line: string, index: number) => {
      if (hasNumbers) {
        return line.replace(/^\s*\d+\.\s*/, '');
      } else {
        if (/^\s*\d+\.\s*/.test(line)) return line;
        return `${index + 1}. ${line}`;
      }
    });
    activeObject.set('text', newLines.join('\n'));
    canvas.renderAll();
    onModified();
  };

  const toggleShadow = () => {
    if (!activeObject) return;
    const nextShadow = !hasShadow;
    setHasShadow(nextShadow);
    if (nextShadow) {
      setHasNeon(false);
      activeObject.set('shadow', 'rgba(0, 0, 0, 0.5) 4px 4px 6px');
    } else {
      activeObject.set('shadow', null);
    }
    canvas.renderAll();
    onModified();
  };

  const toggleNeon = () => {
    if (!activeObject) return;
    const nextNeon = !hasNeon;
    setHasNeon(nextNeon);
    if (nextNeon) {
      setHasShadow(false);
      const glowColor = colorValue || '#8b5cf6';
      // High-quality Neon glow using active color
      activeObject.set('shadow', `${glowColor} 0px 0px 15px`);
    } else {
      activeObject.set('shadow', null);
    }
    canvas.renderAll();
    onModified();
  };

  const toggleOutline = () => {
    if (!activeObject) return;
    const nextOutline = !hasOutline;
    setHasOutline(nextOutline);
    if (nextOutline) {
      activeObject.set({
        stroke: colorValue === '#ffffff' ? '#000000' : '#ffffff',
        strokeWidth: 1.5
      });
    } else {
      activeObject.set({
        stroke: null,
        strokeWidth: 0
      });
    }
    canvas.renderAll();
    onModified();
  };

  const handleAnimate = (type: 'bounce' | 'rotate' | 'pulse' | 'fade' = 'pulse') => {
    if (!activeObject) return;
    const originalTop = activeObject.top || 0;
    const originalAngle = activeObject.angle || 0;
    const originalScaleX = activeObject.scaleX || 1;
    const originalScaleY = activeObject.scaleY || 1;
    const originalOpacity = activeObject.opacity !== undefined ? activeObject.opacity : 1;

    if (type === 'bounce') {
      activeObject.animate('top', originalTop - 25, {
        duration: 250,
        onChange: canvas.renderAll.bind(canvas),
        onComplete: () => {
          activeObject.animate('top', originalTop, {
            duration: 350,
            onChange: canvas.renderAll.bind(canvas),
            onComplete: () => {
              activeObject.animate('top', originalTop - 8, {
                duration: 120,
                onChange: canvas.renderAll.bind(canvas),
                onComplete: () => {
                  activeObject.animate('top', originalTop, {
                    duration: 180,
                    onChange: canvas.renderAll.bind(canvas)
                  });
                }
              });
            }
          });
        }
      });
    } else if (type === 'rotate') {
      activeObject.animate('angle', originalAngle + 360, {
        duration: 750,
        onChange: canvas.renderAll.bind(canvas),
        onComplete: () => {
          activeObject.set('angle', originalAngle);
          canvas.renderAll();
        }
      });
    } else if (type === 'pulse') {
      activeObject.animate({
        scaleX: originalScaleX * 1.25,
        scaleY: originalScaleY * 1.25
      }, {
        duration: 200,
        onChange: canvas.renderAll.bind(canvas),
        onComplete: () => {
          activeObject.animate({
            scaleX: originalScaleX,
            scaleY: originalScaleY
          }, {
            duration: 200,
            onChange: canvas.renderAll.bind(canvas)
          });
        }
      });
    } else if (type === 'fade') {
      activeObject.animate('opacity', 0.2, {
        duration: 350,
        onChange: canvas.renderAll.bind(canvas),
        onComplete: () => {
          activeObject.animate('opacity', originalOpacity, {
            duration: 350,
            onChange: canvas.renderAll.bind(canvas)
          });
        }
      });
    }
  };

  const handleCopyStyle = () => {
    if (!activeObject) return;
    copiedTextStyle = {
      fontFamily: activeObject.fontFamily,
      fontSize: activeObject.fontSize,
      fill: activeObject.fill,
      fontWeight: activeObject.fontWeight,
      fontStyle: activeObject.fontStyle,
      underline: activeObject.underline,
      linethrough: activeObject.linethrough,
      charSpacing: activeObject.charSpacing,
      lineHeight: activeObject.lineHeight,
      opacity: activeObject.opacity,
      stroke: activeObject.stroke,
      strokeWidth: activeObject.strokeWidth
    };
  };

  const handlePasteStyle = () => {
    if (!activeObject || !copiedTextStyle) return;
    activeObject.set(copiedTextStyle);
    canvas.renderAll();
    onModified();
  };

  const handleDuplicate = () => {
    if (!activeObject) return;
    activeObject.clone((cloned: any) => {
      cloned.set({
        left: (activeObject.left || 0) + 20,
        top: (activeObject.top || 0) + 20,
        selectable: true
      });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
      onModified();
    });
  };

  const handleDelete = () => {
    if (!activeObject) return;
    canvas.remove(activeObject);
    canvas.discardActiveObject();
    canvas.renderAll();
    onModified();
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white font-sans text-right select-none w-full border-b md:border-b-0 border-zinc-800/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      
      {/* Header - Super Compact & Premium */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-900/90 border-b border-zinc-800/80 backdrop-blur-sm shrink-0">
        {onClose && (
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all duration-200 active:scale-90"
            title="داخستن (Close)"
          >
            <Icons.X size={11} />
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <Icons.Sliders size={11} className="text-indigo-400 animate-pulse" />
          <span className="font-black text-[10px] text-zinc-200 tracking-wider uppercase">
            {isText ? 'ڕێکخستنا دەقی' : isGroup ? 'ڕێکخستنا گروپی' : 'تایبەتمەندی'}
          </span>
        </div>
      </div>

      {/* Main List - Compact and thin, scrollable vertical space */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin scrollbar-thumb-zinc-850 hover:scrollbar-thumb-zinc-800 max-h-[85vh] text-[11px] pb-6">
        
        {/* TEXT SPECIFIC CONTROLS */}
        {isText && (
          <>
            {/* AI Smart Formatting Section */}
            <div className="space-y-2 border-b border-zinc-900 pb-3 bg-indigo-950/20 p-2 rounded-xl border border-indigo-500/10">
              <span className="text-[9px] text-indigo-400 font-black uppercase tracking-wider block text-right flex items-center justify-end gap-1">
                <span>رێکخستن ب ژیریێ دەستکرد (AI Assistant)</span>
                <Icons.Sparkles size={10} className="text-indigo-400 animate-pulse" />
              </span>
              
              <div className="space-y-1.5">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="داخازیەکێ ل ڤێرێ بنووسە (بۆ نموونە: ب شێوازێ A,B,C,D ڕێکبێخە)... یان خالی بهێلە بۆ باشکردنا ئۆتۆماتیک"
                  className="w-full h-14 bg-zinc-900/90 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-indigo-500 rounded-lg p-2 text-[10px] font-semibold focus:outline-none cursor-text text-white text-right placeholder-zinc-500 resize-none transition-all"
                  dir="rtl"
                />
                
                {/* Upload PDF/Image to Generate/Extract Questions using AI */}
                <div className="flex gap-1.5 items-center">
                  {/* Action/Generate Questions Button */}
                  <button
                    onClick={handleGenerateQuestions}
                    disabled={fileLoading || !uploadedFile}
                    className={`flex-1 h-8 flex items-center justify-center gap-1 rounded-lg text-[10px] font-black transition-all duration-150 active:scale-95 ${
                      fileLoading || !uploadedFile
                        ? 'bg-emerald-950/30 text-emerald-600/50 cursor-not-allowed border border-emerald-900/10'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/10'
                    }`}
                    title="دەرهێنانا پرسیاران بکاربینە"
                  >
                    {fileLoading ? (
                      <>
                        <Icons.Loader className="animate-spin text-white" size={12} />
                        <span>خەریکە...</span>
                      </>
                    ) : (
                      <>
                        <Icons.Sparkles size={11} className="text-emerald-200 animate-pulse" />
                        <span>چێکرنا پرسیاران</span>
                      </>
                    )}
                  </button>

                  {/* File Selector Label */}
                  <label className={`
                    h-8 px-2 flex items-center justify-center gap-1.5 rounded-lg text-[10px] font-black transition-all duration-150 cursor-pointer active:scale-95 border text-right max-w-[120px] overflow-hidden
                    ${uploadedFile
                      ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                      : 'bg-zinc-900 hover:bg-zinc-850 text-zinc-400 border-zinc-800 hover:border-zinc-700'}
                  `}>
                    <Icons.Upload size={11} className={uploadedFile ? "text-emerald-400 animate-bounce" : "text-zinc-500"} />
                    <span className="truncate">
                      {uploadedFile ? uploadedFile.name : "ئەپلود (PDF / وێنە)"}
                    </span>
                    <input 
                      type="file" 
                      accept=".pdf,image/*" 
                      className="hidden" 
                      disabled={fileLoading || aiLoading}
                      onChange={handleFileSelect}
                    />
                  </label>

                  {/* Clear Selected File Button */}
                  {uploadedFile && (
                    <button
                      onClick={() => setUploadedFile(null)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-red-400 transition-colors shrink-0"
                      title="پاککرنەوە"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  onClick={handleAIImprove}
                  disabled={aiLoading || fileLoading}
                  className={`w-full h-8 flex items-center justify-center gap-1.5 rounded-lg text-[10px] font-black transition-all duration-150 active:scale-95 ${
                    aiLoading
                      ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/10'
                  }`}
                >
                  {aiLoading ? (
                    <>
                      <Icons.Loader className="animate-spin text-white" size={12} />
                      <span>خەریکە ڕێکدەخرێت...</span>
                    </>
                  ) : (
                    <>
                      <Icons.Sparkles size={11} className="text-indigo-200 animate-pulse" />
                      <span>باشکرن و جوانکرنا دەقی ب AI</span>
                    </>
                  )}
                </button>

                {aiError && (
                  <div className="text-[9px] text-red-400 font-bold text-right leading-relaxed bg-red-950/20 p-1.5 rounded border border-red-900/30">
                    ⚠️ {aiError}
                  </div>
                )}
              </div>
            </div>

            {/* 1 & 2: Font Family and Size */}
            <div className="space-y-2 border-b border-zinc-900 pb-3">
              <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
                خەت و قەبارە (Font)
              </span>
              <div className="flex items-center gap-1.5">
                {/* Font Dropdown */}
                <select
                  value={fontFamily}
                  onChange={(e) => handleFontChange(e.target.value)}
                  className="flex-1 min-w-0 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 rounded-lg px-2.5 py-1.5 text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer text-white text-right transition-all duration-150"
                >
                  {FONTS_LIST.map(font => (
                    <option key={font.name} value={font.name} className="bg-zinc-950 text-white text-xs">{font.label}</option>
                  ))}
                </select>
                
                {/* Font Size Incrementor */}
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 shrink-0 transition-colors hover:border-zinc-700">
                  <button 
                    onClick={() => handleFontSizeChange(fontSize - 1)}
                    className="w-5 h-5 flex items-center justify-center hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white font-extrabold text-[11px] transition-all duration-150 active:scale-90"
                    title="بچیککرن"
                  >
                    -
                  </button>
                  <span className="px-1 text-[10px] font-extrabold w-6 text-center text-zinc-200 font-mono">{fontSize}</span>
                  <button 
                    onClick={() => handleFontSizeChange(fontSize + 1)}
                    className="w-5 h-5 flex items-center justify-center hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white font-extrabold text-[11px] transition-all duration-150 active:scale-90"
                    title="مەزنکرن"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* 4, 5, 6, 7 & 8: Formatting buttons: B, I, U, S, Aa */}
            <div className="space-y-2 border-b border-zinc-900 pb-3">
              <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
                شێوازێ دەقی (Formatting)
              </span>
              <div className="flex items-center gap-1 justify-between">
                <button 
                  onClick={toggleBold} 
                  className={`flex-1 h-7 flex items-center justify-center rounded-lg transition-all duration-150 border ${isBold ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-500/20' : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-white'}`}
                  title="تۆخ (Bold)"
                >
                  <Icons.Bold size={11} className={isBold ? 'scale-110' : ''} />
                </button>
                <button 
                  onClick={toggleItalic} 
                  className={`flex-1 h-7 flex items-center justify-center rounded-lg transition-all duration-150 border ${isItalic ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-500/20' : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-white'}`}
                  title="لار (Italic)"
                >
                  <Icons.Italic size={11} className={isItalic ? 'scale-110' : ''} />
                </button>
                <button 
                  onClick={toggleUnderline} 
                  className={`flex-1 h-7 flex items-center justify-center rounded-lg transition-all duration-150 border ${isUnderline ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-500/20' : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-white'}`}
                  title="ژێر هێڵ (Underline)"
                >
                  <Icons.Underline size={11} className={isUnderline ? 'scale-110' : ''} />
                </button>
                <button 
                  onClick={toggleStrikethrough} 
                  className={`flex-1 h-7 flex items-center justify-center rounded-lg transition-all duration-150 border ${isLinethrough ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-500/20' : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-white'}`}
                  title="سەر هێڵ (Strikethrough)"
                >
                  <Icons.Strikethrough size={11} className={isLinethrough ? 'scale-110' : ''} />
                </button>
                <button 
                  onClick={toggleCase}
                  className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-750 text-[9px] text-zinc-300 font-extrabold rounded-lg transition-all active:scale-95 duration-150"
                  title="گۆڕینی پیتەکان (Case aa/AA)"
                >
                  Aa
                </button>
              </div>
            </div>

            {/* 10: List (Bullets or Numbers) */}
            <div className="space-y-2 border-b border-zinc-900 pb-3">
              <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
                لیستە (Lists)
              </span>
              <div className="flex items-center gap-1.5 justify-between">
                <button 
                  onClick={toggleBulletList} 
                  className="flex-1 h-7 flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-850 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all duration-150 gap-1.5 active:scale-[0.98]"
                  title="لیستا خالان (Bullets)"
                >
                  <Icons.List size={11} className="text-blue-400" />
                  <span className="text-[9px] font-bold">خال</span>
                </button>
                <button 
                  onClick={toggleNumberedList} 
                  className="flex-1 h-7 flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-850 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all duration-150 gap-1.5 active:scale-[0.98]"
                  title="لیستا ژمارەیی (Numbers)"
                >
                  <Icons.ListOrdered size={11} className="text-purple-400" />
                  <span className="text-[9px] font-bold">ژمارە</span>
                </button>
              </div>
            </div>

            {/* 9: Alignment */}
            <div className="space-y-2 border-b border-zinc-900 pb-3">
              <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
                ڕێکخستنا جهی (Alignment)
              </span>
              <div className="flex items-center justify-between bg-zinc-900 rounded-lg border border-zinc-800 p-0.5 transition-all">
                <button 
                  onClick={() => handleAlignChange('left')} 
                  className={`py-1 rounded-md transition-all duration-150 flex-1 flex justify-center ${textAlign === 'left' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                  title="چەپ (Align Left)"
                >
                  <Icons.AlignLeft size={11} />
                </button>
                <button 
                  onClick={() => handleAlignChange('center')} 
                  className={`py-1 rounded-md transition-all duration-150 flex-1 flex justify-center ${textAlign === 'center' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                  title="ناوەڕاست (Align Center)"
                >
                  <Icons.AlignCenter size={11} />
                </button>
                <button 
                  onClick={() => handleAlignChange('right')} 
                  className={`py-1 rounded-md transition-all duration-150 flex-1 flex justify-center ${textAlign === 'right' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                  title="ڕاست (Align Right)"
                >
                  <Icons.AlignRight size={11} />
                </button>
              </div>
            </div>

            {/* Text Direction: LTR / RTL */}
            <div className="space-y-2 border-b border-zinc-900 pb-3">
              <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
                ئاراستەیا دەقی (Direction)
              </span>
              <div className="flex items-center justify-between bg-zinc-900 rounded-lg border border-zinc-800 p-0.5 transition-all">
                <button 
                  onClick={() => handleDirectionChange('ltr')} 
                  className={`py-1 rounded-md transition-all duration-150 flex-1 flex items-center justify-center gap-1.5 text-[10px] font-extrabold ${textDirection === 'ltr' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                  title="چەپ بۆ ڕاست (LTR)"
                >
                  <span className="font-mono text-[9px] tracking-tight">LTR ➔</span>
                </button>
                <button 
                  onClick={() => handleDirectionChange('rtl')} 
                  className={`py-1 rounded-md transition-all duration-150 flex-1 flex items-center justify-center gap-1.5 text-[10px] font-extrabold ${textDirection === 'rtl' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                  title="ڕاست بۆ چەپ (RTL)"
                >
                  <span className="font-mono text-[9px] tracking-tight">← RTL</span>
                </button>
              </div>
            </div>

            {/* 11: Spacing */}
            <div className="space-y-2.5 border-b border-zinc-900 pb-3 text-[10px]">
              <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
                دووری و لێکنێزیککرن (Spacing)
              </span>
              <div className="space-y-1.5 bg-zinc-900/30 p-2 rounded-lg border border-zinc-900/50">
                <div className="flex items-center justify-between text-[9px] text-zinc-400 font-medium">
                  <span className="font-mono text-[9px] text-indigo-400">{charSpacing}</span>
                  <span>نێوان پیتان</span>
                </div>
                <input 
                  type="range"
                  min="-10"
                  max="100"
                  value={charSpacing}
                  onChange={(e) => handleCharSpacingChange(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1 bg-zinc-800 rounded-lg cursor-pointer transition-all"
                />
              </div>

              <div className="space-y-1.5 bg-zinc-900/30 p-2 rounded-lg border border-zinc-900/50">
                <div className="flex items-center justify-between text-[9px] text-zinc-400 font-medium">
                  <span className="font-mono text-[9px] text-indigo-400">{lineHeight.toFixed(2)}</span>
                  <span>دووریا دێران</span>
                </div>
                <input 
                  type="range"
                  min="0.6"
                  max="2.5"
                  step="0.05"
                  value={lineHeight}
                  onChange={(e) => handleLineHeightChange(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1 bg-zinc-800 rounded-lg cursor-pointer transition-all"
                />
              </div>
            </div>

            {/* 12: Effects (Shadow, Neon Glow, Outline) */}
            <div className="space-y-2 border-b border-zinc-900 pb-3">
              <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
                کاریگەریێن خەتی (Effects)
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button 
                  onClick={toggleShadow} 
                  className={`h-7.5 flex flex-col items-center justify-center rounded-lg border text-[9px] font-extrabold transition-all duration-150 ${hasShadow ? 'bg-amber-600/20 border-amber-500 text-amber-300 shadow-sm shadow-amber-500/10' : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
                  title="سێبەرا دەقی (Shadow)"
                >
                  <Icons.Sun size={11} className={hasShadow ? 'animate-spin-slow text-amber-300' : 'text-zinc-400'} />
                  <span className="mt-0.5">سێبەر</span>
                </button>
                
                <button 
                  onClick={toggleNeon} 
                  className={`h-7.5 flex flex-col items-center justify-center rounded-lg border text-[9px] font-extrabold transition-all duration-150 ${hasNeon ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/10' : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
                  title="بریسکی نیۆن (Neon Glow)"
                >
                  <Icons.Zap size={11} className={hasNeon ? 'text-indigo-300 scale-110 animate-pulse' : 'text-zinc-400'} />
                  <span className="mt-0.5">نیۆن</span>
                </button>

                <button 
                  onClick={toggleOutline} 
                  className={`h-7.5 flex flex-col items-center justify-center rounded-lg border text-[9px] font-extrabold transition-all duration-150 ${hasOutline ? 'bg-purple-600/20 border-purple-500 text-purple-300 shadow-sm shadow-purple-500/10' : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
                  title="رەنگێ دەورۆبەر (Outline)"
                >
                  <Icons.Sparkles size={11} className={hasOutline ? 'text-purple-300' : 'text-zinc-400'} />
                  <span className="mt-0.5">دەورۆبەر</span>
                </button>
              </div>
            </div>

            {/* 13: Animate (Bounce, Rotate, Pulse, Fade) */}
            <div className="space-y-2 border-b border-zinc-900 pb-3">
              <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
                تاقیکرنا جوولان (Test Animations)
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button 
                  onClick={() => handleAnimate('bounce')} 
                  className="h-7.5 flex items-center justify-center gap-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-200 font-extrabold rounded-lg text-[10px] transition-all duration-150 active:scale-95"
                  title="جوولا بەرزبوونەوە (Bounce)"
                >
                  <Icons.Play size={9} className="text-emerald-400 rotate-90" />
                  <span>لێکدان (Bounce)</span>
                </button>

                <button 
                  onClick={() => handleAnimate('rotate')} 
                  className="h-7.5 flex items-center justify-center gap-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-200 font-extrabold rounded-lg text-[10px] transition-all duration-150 active:scale-95"
                  title="جوولا خولانەوە (Rotate)"
                >
                  <Icons.Play size={9} className="text-blue-400 animate-spin" />
                  <span>خولانەوە (Rotate)</span>
                </button>

                <button 
                  onClick={() => handleAnimate('pulse')} 
                  className="h-7.5 flex items-center justify-center gap-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-200 font-extrabold rounded-lg text-[10px] transition-all duration-150 active:scale-95"
                  title="جوولا لێدان (Pulse)"
                >
                  <Icons.Play size={9} className="text-rose-400 scale-110 animate-ping animate-duration-1000" />
                  <span>لێدان (Pulse)</span>
                </button>

                <button 
                  onClick={() => handleAnimate('fade')} 
                  className="h-7.5 flex items-center justify-center gap-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-200 font-extrabold rounded-lg text-[10px] transition-all duration-150 active:scale-95"
                  title="جوولا کالبوونەوە (Fade)"
                >
                  <Icons.Play size={9} className="text-amber-400 opacity-60" />
                  <span>کالبوونەوە (Fade)</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* GROUP SPECIFIC CONTROLS */}
        {isGroup && (
          <div className="space-y-3 border-b border-zinc-900 pb-3 bg-indigo-950/10 p-2.5 rounded-xl border border-indigo-500/10">
            <span className="text-[9px] text-indigo-400 font-black uppercase tracking-wider block text-right flex items-center justify-end gap-1">
              <span>ڕێکخستنا ئاراستەیا گروپی (Group Direction)</span>
              <Icons.Sparkles size={10} className="text-indigo-400 animate-pulse" />
            </span>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleGroupDirection('rtl')}
                className="h-8 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-indigo-500/50 text-white font-extrabold rounded-lg text-[10px] transition-all duration-150 active:scale-95 shadow-sm"
                title="گۆڕینی هەموو دەقەکانی ناو گروپ بۆ RTL"
              >
                <span className="font-mono text-[9px]">← RTL</span>
              </button>
              
              <button
                onClick={() => handleGroupDirection('ltr')}
                className="h-8 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-indigo-500/50 text-white font-extrabold rounded-lg text-[10px] transition-all duration-150 active:scale-95 shadow-sm"
                title="گۆڕینی هەموو دەقەکانی ناو گروپ بۆ LTR"
              >
                <span className="font-mono text-[9px]">LTR ➔</span>
              </button>
            </div>

            <button
              onClick={handleMirrorGroupHorizontal}
              className="w-full h-8 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-lg text-[10px] transition-all duration-150 active:scale-95 shadow-md shadow-indigo-500/10"
              title="ئاوێتەکردنی شوێنی ئاسۆیی توخمەکان لەناو گروپەکەدا"
            >
              <Icons.MoveHorizontal size={11} className="text-indigo-200" />
              <span>ئاوێتەکرنا جهێن ئاسۆیی (Mirror Layout)</span>
            </button>
          </div>
        )}

        {/* 3: COLOR ACCENTS (For both Text and Path/Lines) */}
        {(isText || isPathOrLine) && (
          <div className="space-y-2 border-b border-zinc-900 pb-3">
            <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
              ڕەنگ و دیزاین (Colors)
            </span>
            <div className="flex flex-wrap gap-1.5 bg-zinc-900/40 border border-zinc-900/60 rounded-lg p-1.5 justify-center">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => handleColorChange(c)}
                  className={`w-4 h-4 rounded-full border border-white/10 transition-all duration-150 relative ${colorValue === c ? 'scale-110 ring-2 ring-indigo-500 ring-offset-2 ring-offset-zinc-950 border-white' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <div className="relative w-4 h-4 rounded-full border border-zinc-800 overflow-hidden flex items-center justify-center bg-zinc-900 hover:scale-110 hover:border-zinc-700 transition-all">
                <Icons.Palette size={9} className="text-zinc-400 pointer-events-none absolute" />
                <input
                  type="color"
                  value={colorValue}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="w-6 h-6 opacity-0 cursor-pointer absolute"
                  title="ڕەنگەکێ تر (Custom Color)"
                />
              </div>
            </div>
          </div>
        )}

        {/* SHAPE & BORDER STYLE CONTROLS */}
        {isPathOrLine && (
          <div className="space-y-3 border-b border-zinc-900 pb-3 bg-zinc-900/10 p-2.5 rounded-xl border border-zinc-850">
            <span className="text-[9px] text-indigo-400 font-black uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5 flex items-center justify-end gap-1">
              <span>شێوازێ چوارچوڤە و شێوەی (Shape Style)</span>
            </span>

            {/* Stroke Width Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[8.5px] text-zinc-400 font-bold">
                <span className="font-mono text-indigo-300">{strokeWidth}px</span>
                <span>ستووراهیا چوارچوڤەی (Stroke Weight)</span>
              </div>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={strokeWidth}
                onChange={(e) => handleStrokeWidthChange(Number(e.target.value))}
                className="w-full accent-indigo-500 h-1 bg-zinc-800 rounded-lg cursor-pointer transition-all"
              />
            </div>

            {/* Corner Radius (Only for Rectangles) */}
            {activeObject.type === 'rect' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[8.5px] text-zinc-400 font-bold">
                  <span className="font-mono text-indigo-300">{cornerRadius}px</span>
                  <span>گۆشەیێن بازنەیی (Corner Rounding)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={cornerRadius}
                  onChange={(e) => handleCornerRadiusChange(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1 bg-zinc-800 rounded-lg cursor-pointer transition-all"
                />
              </div>
            )}

            {/* Border Dash Styles */}
            <div className="space-y-1.5">
              <span className="text-[8.5px] text-zinc-400 font-bold block text-right">شێوازێ هێڵێ (Line Style)</span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={() => handleStrokeDashChange('solid')}
                  className={`h-7 rounded text-[8px] font-bold border transition-all ${strokeStyle === 'solid' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'}`}
                >
                  سادە (Solid)
                </button>
                <button
                  onClick={() => handleStrokeDashChange('dashed')}
                  className={`h-7 rounded text-[8px] font-bold border transition-all ${strokeStyle === 'dashed' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'}`}
                >
                  قەتیعە (Dashed)
                </button>
                <button
                  onClick={() => handleStrokeDashChange('dotted')}
                  className={`h-7 rounded text-[8px] font-bold border transition-all ${strokeStyle === 'dotted' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'}`}
                >
                  خال (Dotted)
                </button>
              </div>
            </div>

            {/* Fill Color selection */}
            <div className="space-y-1.5">
              <span className="text-[8.5px] text-zinc-400 font-bold block text-right">رەنگێ ناڤبەرێ (Fill Color)</span>
              <div className="flex flex-wrap gap-1 bg-zinc-900/40 border border-zinc-900/60 rounded-lg p-1 justify-center">
                <button
                  onClick={() => handleFillColorChange('transparent')}
                  className={`px-1.5 h-4.5 rounded text-[7.5px] font-black border transition-all ${fillColor === 'transparent' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}
                  title="بێ ڕەنگ (Transparent)"
                >
                  بێ ڕەنگ
                </button>
                {PRESET_COLORS.map(c => (
                  <button
                    key={'fill-' + c}
                    onClick={() => handleFillColorChange(c)}
                    className={`w-3.5 h-3.5 rounded-full border border-white/10 transition-all duration-150 relative ${fillColor === c ? 'scale-110 ring-1 ring-indigo-500 ring-offset-1 ring-offset-zinc-950 border-white' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 15: Transparency (OPACITY SLIDER for All objects) */}
        <div className="space-y-2 border-b border-zinc-900 pb-3 text-[10px]">
          <div className="flex items-center justify-between text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider border-r-2 border-indigo-500 pr-1.5">
            <span className="font-mono text-indigo-400">{Math.round(opacity * 100)}%</span>
            <span>شەفافیەت (Transparency)</span>
          </div>
          <div className="bg-zinc-900/30 p-2 rounded-lg border border-zinc-900/50 mt-1.5">
            <input 
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => handleOpacityChange(Number(e.target.value))}
              className="w-full accent-indigo-500 h-1 bg-zinc-800 rounded-lg cursor-pointer transition-all"
            />
          </div>
        </div>

        {/* 14: POSITION & LAYERING (All objects!) */}
        <div className="space-y-2 border-b border-zinc-900 pb-3">
          <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
            ڕێکخستنا لایەر و جەهـ (Position)
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <button 
              onClick={() => handlePosition('front')} 
              className="h-7.5 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-750 rounded-lg border border-zinc-800 text-blue-400 hover:text-blue-300 font-bold transition-all active:scale-95 duration-150"
              title="بینە پێشێ (Bring to Front)"
            >
              <Icons.ArrowUp size={11} />
            </button>
            <button 
              onClick={() => handlePosition('back')} 
              className="h-7.5 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-750 rounded-lg border border-zinc-800 text-purple-400 hover:text-purple-300 font-bold transition-all active:scale-95 duration-150"
              title="بنێرە پاشێ (Send to Back)"
            >
              <Icons.ArrowDown size={11} />
            </button>
            <button 
              onClick={() => handlePosition('top')} 
              className="h-7.5 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-750 rounded-lg border border-zinc-800 text-amber-400 hover:text-amber-300 font-bold transition-all active:scale-95 duration-150"
              title="برن بۆ سەرێ (Align Top)"
            >
              <Icons.ArrowUpToLine size={11} />
            </button>
            <button 
              onClick={() => handlePosition('bottom')} 
              className="h-7.5 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-750 rounded-lg border border-zinc-800 text-amber-400 hover:text-amber-300 font-bold transition-all active:scale-95 duration-150"
              title="برن بۆ بنێ (Align Bottom)"
            >
              <Icons.ArrowDownToLine size={11} />
            </button>
            <button 
              onClick={() => handlePosition('centerH')} 
              className="h-7.5 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-750 rounded-lg border border-zinc-800 text-zinc-300 hover:text-zinc-100 font-bold transition-all active:scale-95 duration-150"
              title="ناوەڕاستا ئاسۆیی (Center Horizontally)"
            >
              <Icons.MoveHorizontal size={11} />
            </button>
            <button 
              onClick={() => handlePosition('centerV')} 
              className="h-7.5 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-750 rounded-lg border border-zinc-800 text-zinc-300 hover:text-zinc-100 font-bold transition-all active:scale-95 duration-150"
              title="ناوەڕاستا ستوونی (Center Vertically)"
            >
              <Icons.MoveVertical size={11} />
            </button>
          </div>
        </div>

        {/* 16, 17 & 18: Copy Style, Duplicate, and Delete (Actions) */}
        <div className="space-y-2 pt-1">
          <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider block text-right border-r-2 border-indigo-500 pr-1.5">
            کردارێن بوکسێ (Actions)
          </span>
          <div className="flex flex-col gap-1.5 mt-1.5">
            {isText && (
              <div className="flex items-center justify-between gap-1.5">
                <button 
                  onClick={handleCopyStyle}
                  className="flex-1 h-7.5 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-750 text-blue-400 hover:text-blue-300 rounded-lg border border-zinc-800 font-bold transition-all gap-1.5 text-[10px] active:scale-95 duration-150"
                  title="کۆپی ستایل (Copy Style)"
                >
                  <Icons.Copy size={11} />
                  <span>کۆپی ستایل</span>
                </button>
                <button 
                  onClick={handlePasteStyle}
                  disabled={!copiedTextStyle}
                  className={`flex-1 h-7.5 flex items-center justify-center rounded-lg border font-bold transition-all gap-1.5 text-[10px] duration-150 ${
                    copiedTextStyle 
                      ? 'bg-zinc-900 border-zinc-800 text-emerald-400 hover:bg-zinc-850 hover:text-emerald-300 hover:border-zinc-750 cursor-pointer active:scale-95' 
                      : 'bg-zinc-900/30 border-zinc-900/20 text-zinc-600 cursor-not-allowed'
                  }`}
                  title="لێدانا ستایلی (Paste Style)"
                >
                  <Icons.ClipboardPaste size={11} />
                  <span>لێدان</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-1.5">
              <button 
                onClick={handleDuplicate}
                className="flex-1 h-7.5 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-750 text-indigo-400 hover:text-indigo-300 border border-zinc-800 rounded-lg font-bold transition-all gap-1.5 text-[10px] active:scale-95 duration-150"
                title="دووبارەکرن (Duplicate)"
              >
                <Icons.Files size={11} />
                <span>کۆپی بوکسێ</span>
              </button>
              <button 
                onClick={handleDelete}
                className="flex-1 h-7.5 flex items-center justify-center bg-red-950/25 hover:bg-red-900/35 text-red-400 hover:text-red-300 border border-red-900/20 rounded-lg font-bold transition-all gap-1.5 text-[10px] active:scale-95 duration-150"
                title="ژێبرن (Delete)"
              >
                <Icons.Trash size={11} />
                <span>ژێبرن</span>
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
