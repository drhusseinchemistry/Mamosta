import React, { useEffect, useRef, useState } from 'react';
import { EditorState, ToolType } from '../types';
import { Icons } from './Icon';
import { TextFormatter } from './TextFormatter';

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
  const [activeTextObject, setActiveTextObject] = useState<any>(null);
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);

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

    // Event listeners for history
    canvas.on('object:added', onModified);
    canvas.on('object:modified', onModified);
    canvas.on('object:removed', onModified);
    canvas.on('path:created', onModified);

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

    canvas.on('selection:created', updateTextState);
    canvas.on('selection:updated', updateTextState);
    canvas.on('selection:cleared', () => {
      setActiveTextObject(null);
      onTextSelectionRef.current?.(canvas, null);
    });
    canvas.on('text:editing:entered', () => {
      const activeObj = canvas.getActiveObject();
      if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
        setActiveTextObject(activeObj);
        onTextSelectionRef.current?.(canvas, activeObj);
      }
    });
    canvas.on('text:editing:exited', () => {
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
    canvas.selection = activeTool === 'select';
    
    // Cursor
    if (activeTool === 'select') canvas.defaultCursor = 'default';
    else if (activeTool === 'text') canvas.defaultCursor = 'text';
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
                const text = new window.fabric.IText('بنڤیسە', {
                    left: pointer.x,
                    top: pointer.y,
                    fill: strokeColor,
                    fontSize: strokeWidth * 4,
                    fontFamily: 'Noto Sans Arabic'
                });
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
                    selectable: false
                });
            } else if (activeTool === 'circle') {
                activeShape = new window.fabric.Ellipse({
                    left: shapeStart.x, top: shapeStart.y,
                    rx: 0, ry: 0,
                    fill: 'transparent',
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                    selectable: false
                });
            } else if (activeTool === 'line') {
                activeShape = new window.fabric.Line([shapeStart.x, shapeStart.y, shapeStart.x, shapeStart.y], {
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
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

  }, [editorState, pageNumber]);

  const showVoiceButton = isActive && (!!activeTextObject || editorState.activeTool === 'text');

  return (
    <div 
      ref={containerRef}
      id={`page-${pageNumber}`}
      className={`relative my-4 shadow-2xl transition-all duration-300 ${isActive ? 'ring-4 ring-primary' : 'ring-0'}`}
      style={{ width: viewport?.width, height: viewport?.height }}
    >
      <canvas ref={canvasElRef} />
      
      {/* Floating Action Button above Selected Object */}
      {isActive && floatingPos && (
        <div 
          className="absolute z-40 -translate-x-1/2 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150"
          style={{ 
            left: `${floatingPos.x}px`, 
            top: `${floatingPos.y}px` 
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

          {/* Text Formatting Button (Only shown for text objects) */}
          {activeTextObject && (activeTextObject.type === 'i-text' || activeTextObject.type === 'text') && (
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
      
      {/* Page Number Indicator */}
      <div className="absolute -left-10 top-0 text-gray-400 font-bold text-lg hidden xl:block">
        {pageNumber}
      </div>
    </div>
  );
};

export default PageEditor;