import React, { useEffect, useRef, useState } from 'react';
import { EditorState, ToolType } from '../types';

interface PageEditorProps {
  pageNumber: number;
  bgImage: string;
  viewport: any;
  editorState: EditorState;
  isActive: boolean;
  onCanvasReady: (pageNumber: number, canvas: any) => void;
  onModified: () => void;
}

const PageEditor: React.FC<PageEditorProps> = ({ 
  pageNumber, 
  bgImage, 
  viewport, 
  editorState, 
  isActive, 
  onCanvasReady,
  onModified 
}) => {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div 
      ref={containerRef}
      id={`page-${pageNumber}`}
      className={`relative my-4 shadow-2xl transition-all duration-300 ${isActive ? 'ring-4 ring-primary' : 'ring-0'}`}
      style={{ width: viewport?.width, height: viewport?.height }}
    >
      <canvas ref={canvasElRef} />
      
      {/* Page Number Indicator */}
      <div className="absolute -left-10 top-0 text-gray-400 font-bold text-lg hidden xl:block">
        {pageNumber}
      </div>
    </div>
  );
};

export default PageEditor;