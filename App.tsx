import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import PageEditor from './components/PageEditor';
import { EditorState, PageData, ToolType } from './types';
import { initializePDFJS, loadPDFDocument, renderPDFPageToDataURL } from './services/pdfService';

const App: React.FC = () => {
  const [pages, setPages] = useState<PageData[]>([]);
  const [activePage, setActivePage] = useState<number>(1);
  const [editorState, setEditorState] = useState<EditorState>({
    activeTool: 'pen',
    strokeColor: '#FFD700',
    strokeWidth: 4,
    scale: 1,
    isProcessing: false,
    statusMessage: null
  });

  // Store fabric canvas instances
  const canvasesRef = useRef<{[key: number]: any}>({});
  const pdfDocRef = useRef<any>(null);

  // Initialize external libraries
  useEffect(() => {
    const loadLibs = async () => {
       // In a real app with bundlers, these are imported. 
       // For this snippet, we assume they are loaded from CDN in index.html
       // But we need to ensure pdfjs worker is set
       initializePDFJS();
    };
    loadLibs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...PDF تێتە بارکرن' }));

    try {
      const pdfDoc = await loadPDFDocument(file);
      pdfDocRef.current = pdfDoc;
      
      const numPages = pdfDoc.numPages;
      const newPages: PageData[] = [];

      for (let i = 1; i <= numPages; i++) {
        const { dataUrl, viewport } = await renderPDFPageToDataURL(pdfDoc, i);
        newPages.push({
          pageNumber: i,
          viewport,
          image: dataUrl
        });
      }

      setPages(newPages);
      setActivePage(1);
    } catch (err) {
      console.error(err);
      alert('Failed to load PDF');
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (f) => {
      const data = f.target?.result;
      const activeCanvas = canvasesRef.current[activePage];
      if (activeCanvas && typeof data === 'string') {
        window.fabric.Image.fromURL(data, (img: any) => {
            // Scale image if it's too large relative to the canvas
            const maxDimension = 300;
            let scale = 1;
            if (img.width > maxDimension || img.height > maxDimension) {
                scale = Math.min(maxDimension / img.width, maxDimension / img.height);
            }
            
            img.set({
                left: activeCanvas.width / 2 - (img.width * scale) / 2,
                top: activeCanvas.height / 2 - (img.height * scale) / 2,
                scaleX: scale,
                scaleY: scale
            });

            activeCanvas.add(img);
            activeCanvas.setActiveObject(img);
            activeCanvas.renderAll();
            
            // Switch to select tool so user can move/resize the image immediately
            setEditorState(prev => ({ ...prev, activeTool: 'select' }));
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const handleToolChange = (tool: ToolType) => {
    setEditorState(prev => ({ ...prev, activeTool: tool }));
    // If tool is eraser, we might handle it globally or per canvas logic
    if (tool === 'eraser') {
        const activeCanvas = canvasesRef.current[activePage];
        if (activeCanvas) {
            const activeObj = activeCanvas.getActiveObject();
            if (activeObj) {
                activeCanvas.remove(activeObj);
                activeCanvas.renderAll();
            }
        }
        // Switch back to select after delete
        setEditorState(prev => ({ ...prev, activeTool: 'select' }));
    }
  };

  const scrollToPage = (pageNumber: number) => {
    setActivePage(pageNumber);
    const element = document.getElementById(`page-${pageNumber}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleCanvasReady = (pageNumber: number, canvas: any) => {
    canvasesRef.current[pageNumber] = canvas;
  };

  const handleExport = () => {
      // In a full implementation, this would use pdf-lib to create a new PDF,
      // embed the original pages, and then draw the fabric objects as SVG paths or images on top.
      alert('Export functionality requires integration with pdf-lib to merge Canvas+PDF. (Placeholder)');
  };

  const handleAddPage = () => {
    // Standard A4 size in pixels (72 DPI approx)
    const width = 595;
    const height = 842;

    // Create a white blank image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    const newPageNumber = pages.length + 1;
    const newPage: PageData = {
      pageNumber: newPageNumber,
      viewport: { width, height },
      image: canvas.toDataURL('image/jpeg')
    };

    setPages(prev => [...prev, newPage]);
    
    // Scroll to the new page after a brief delay to allow rendering
    setTimeout(() => {
        scrollToPage(newPageNumber);
    }, 100);
  };

  const handleDeletePage = (pageNumber: number) => {
      if(!confirm(`دڵنیای لە سڕینەوەی لاپەڕەی ${pageNumber}?`)) return;
      
      const newPages = pages.filter(p => p.pageNumber !== pageNumber);
      // Renumber pages to keep sequence
      const reordered = newPages.map((p, idx) => ({...p, pageNumber: idx + 1}));
      
      setPages(reordered);
      // Clean up canvas ref
      delete canvasesRef.current[pageNumber];
  };

  return (
    <div className="flex flex-col h-screen bg-dark">
      {/* Loading Overlay */}
      {editorState.isProcessing && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-xl">{editorState.statusMessage}</p>
        </div>
      )}

      <Toolbar 
        editorState={editorState}
        onToolChange={handleToolChange}
        onColorChange={(c) => setEditorState(prev => ({ ...prev, strokeColor: c }))}
        onWidthChange={(w) => setEditorState(prev => ({ ...prev, strokeWidth: w }))}
        onUpload={handleFileUpload}
        onImageUpload={handleImageUpload}
        onExport={handleExport}
        onSaveProject={() => alert('Project saved locally (Placeholder)')}
        onAddPage={handleAddPage}
        canUndo={false} // Todo: Implement Undo Stack
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
      />

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Sidebar for Thumbnails */}
        {pages.length > 0 && (
          <Sidebar 
            pages={pages} 
            activePage={activePage} 
            onPageSelect={scrollToPage}
            onDeletePage={handleDeletePage}
          />
        )}

        {/* Main Canvas Area */}
        <div className="flex-1 overflow-y-auto bg-black p-4 md:p-8 flex flex-col items-center">
            {pages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <div className="bg-surface p-8 rounded-2xl border border-gray-700 text-center shadow-2xl">
                        <p className="text-2xl mb-4 font-bold text-gray-200">بەخێربێی بۆ دەستکاریکەری PDF</p>
                        <p className="mb-6 text-gray-400">تکایە فایلەکا PDF باربکە بۆ دەستپێکرن یان لاپەرەکێ سپی زێدەکەن</p>
                         <div className="flex gap-4 justify-center">
                             <label className="px-6 py-3 bg-primary hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors inline-block font-bold">
                                 بارکرنا PDF
                                 <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                             </label>
                             <button 
                                onClick={handleAddPage}
                                className="px-6 py-3 bg-surface hover:bg-gray-700 border border-gray-600 text-white rounded-lg transition-colors font-bold"
                             >
                                لاپەرێ سپی
                             </button>
                         </div>
                    </div>
                </div>
            ) : (
                pages.map(page => (
                    <PageEditor
                        key={page.pageNumber}
                        pageNumber={page.pageNumber}
                        bgImage={page.image}
                        viewport={page.viewport}
                        editorState={editorState}
                        isActive={activePage === page.pageNumber}
                        onCanvasReady={handleCanvasReady}
                        onModified={() => { /* Handle undo stack push here */ }}
                    />
                ))
            )}
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="bg-darker border-t border-gray-800 p-1 px-4 text-xs text-gray-600 flex justify-between">
         <span>Kurdish PDF Editor v2.0</span>
         <span>{pages.length} Pages Loaded</span>
      </div>
    </div>
  );
};

export default App;