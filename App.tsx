import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import PageEditor from './components/PageEditor';
import { EditorState, PageData, ToolType } from './types';
import { initializePDFJS, loadPDFDocument, renderPDFPageToDataURL } from './services/pdfService';
import { transcribeAudio, performOCR } from './services/geminiService';
import { Icons } from './components/Icon';

// Declare jsPDF on window
declare global {
  interface Window {
    jspdf: any;
  }
}

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

  // AI & Settings State
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiModal, setShowApiModal] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Store fabric canvas instances
  const canvasesRef = useRef<{[key: number]: any}>({});
  const pdfDocRef = useRef<any>(null);

  // Initialize external libraries
  useEffect(() => {
    const loadLibs = async () => {
       initializePDFJS();
    };
    loadLibs();
    
    // Load API Key from local storage
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  // --- API Key Management ---
  const saveApiKey = () => {
    const cleanKey = apiKey.trim();
    localStorage.setItem('gemini_api_key', cleanKey);
    setApiKey(cleanKey);
    setShowApiModal(false);
  };

  // --- Audio Recording (STT) ---
  const handleToggleRecording = async () => {
    if (!apiKey) {
      alert("تکایە سەرەتا API Key زیاد بکە لە ڕێکخستنەکان");
      setShowApiModal(true);
      return;
    }

    if (isRecording) {
      // Stop Recording
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start Recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
           // Create Blob
           const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
           // Stop tracks
           stream.getTracks().forEach(track => track.stop());

           // Process with AI
           setEditorState(prev => ({...prev, isProcessing: true, statusMessage: '...گۆڕینی دەنگ بۆ نووسین'}));
           try {
             const text = await transcribeAudio(apiKey, audioBlob);
             if (text) {
               addTextToCanvas(text);
             }
           } catch (error: any) {
             alert("کێشەیەک ڕوویدا:\n" + error.message);
           } finally {
             setEditorState(prev => ({...prev, isProcessing: false, statusMessage: null}));
           }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("ناتوانین دەستکاری مایک بکەین. تکایە ڕێگە بدە بە بەکارهێنانی مایک.");
      }
    }
  };

  // --- OCR Logic ---
  const handleRunOCR = async () => {
    if (!apiKey) {
      alert("تکایە سەرەتا API Key زیاد بکە لە ڕێکخستنەکان");
      setShowApiModal(true);
      return;
    }

    const activeCanvas = canvasesRef.current[activePage];
    if (!activeCanvas) return;

    setEditorState(prev => ({...prev, isProcessing: true, statusMessage: '...OCR پشکنینی وێنە'}));

    try {
      // Get image data from current canvas view (ignoring current selection to get full context or bg)
      // Usually better to just send the background image or the whole rendered canvas
      const dataUrl = activeCanvas.toDataURL({ format: 'jpeg', quality: 0.8 });
      
      const text = await performOCR(apiKey, dataUrl);
      if (text) {
        // Option 1: Add to canvas
        addTextToCanvas(text);
      } else {
        alert("هیچ نووسینێک نەدۆزرایەوە");
      }
    } catch (error: any) {
      alert("OCR Failed:\n" + error.message);
    } finally {
      setEditorState(prev => ({...prev, isProcessing: false, statusMessage: null}));
    }
  };

  // Helper to add text to canvas
  const addTextToCanvas = (text: string) => {
    const activeCanvas = canvasesRef.current[activePage];
    if (activeCanvas && window.fabric) {
      const iText = new window.fabric.IText(text, {
        left: 50,
        top: 50,
        fontSize: 20,
        fill: editorState.strokeColor,
        fontFamily: 'Noto Sans Arabic',
        direction: 'rtl',
        textAlign: 'right',
        width: 300
      });
      activeCanvas.add(iText);
      activeCanvas.setActiveObject(iText);
      activeCanvas.renderAll();
      setEditorState(prev => ({...prev, activeTool: 'select'})); // Switch to select to edit text
    }
  };


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
    if (tool === 'eraser') {
        const activeCanvas = canvasesRef.current[activePage];
        if (activeCanvas) {
            const activeObj = activeCanvas.getActiveObject();
            if (activeObj) {
                activeCanvas.remove(activeObj);
                activeCanvas.renderAll();
            }
        }
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

  const handleExport = async () => {
      if (!window.jspdf) {
          alert("JSPDF library not loaded");
          return;
      }

      setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...PDF تێتە دروستکرن' }));

      try {
          const { jsPDF } = window.jspdf;
          const firstPage = pages[0];
          const orientation = firstPage && firstPage.viewport.width > firstPage.viewport.height ? 'l' : 'p';
          
          const doc = new jsPDF({
              orientation: orientation,
              unit: 'px',
              format: [firstPage.viewport.width, firstPage.viewport.height]
          });

          for (let i = 0; i < pages.length; i++) {
              const page = pages[i];
              const canvas = canvasesRef.current[page.pageNumber];
              
              if (!canvas) continue;

              canvas.discardActiveObject();
              canvas.renderAll();

              const dataURL = canvas.toDataURL({
                  format: 'jpeg',
                  quality: 0.8,
                  multiplier: 1 
              });

              if (i > 0) {
                  doc.addPage([page.viewport.width, page.viewport.height]);
              }
              
              doc.addImage(dataURL, 'JPEG', 0, 0, page.viewport.width, page.viewport.height);
          }

          doc.save("edited-document.pdf");

      } catch (e) {
          console.error(e);
          alert("Error exporting PDF");
      } finally {
          setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
      }
  };

  const handleAddPage = () => {
    const width = 595;
    const height = 842;

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
    
    setTimeout(() => {
        scrollToPage(newPageNumber);
    }, 100);
  };

  const handleDeletePage = (pageNumber: number) => {
      if(!confirm(`دڵنیای لە سڕینەوەی لاپەڕەی ${pageNumber}?`)) return;
      
      const newPages = pages.filter(p => p.pageNumber !== pageNumber);
      const reordered = newPages.map((p, idx) => ({...p, pageNumber: idx + 1}));
      
      setPages(reordered);
      delete canvasesRef.current[pageNumber];
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-900">
      {/* Loading Overlay */}
      {editorState.isProcessing && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-xl">{editorState.statusMessage}</p>
        </div>
      )}

      {/* API Key Modal */}
      {showApiModal && (
        <div className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center p-4">
          <div className="bg-surface border border-gray-700 p-6 rounded-xl w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Icons.Settings className="text-primary" />
              ڕێکخستنی AI (Gemini)
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              تکایە API Key تایبەت بە خۆت دابنێ بۆ بەکارهێنانی تایبەتمەندی دەنگ و OCR.
              دەتوانیت لە <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400 underline">Google AI Studio</a> وەربگریت.
            </p>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste Gemini API Key here..."
              className="w-full bg-darker border border-gray-600 rounded-lg p-3 text-white focus:border-primary outline-none mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowApiModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">داخستن</button>
              <button onClick={saveApiKey} className="px-6 py-2 bg-primary hover:bg-blue-600 text-white rounded-lg font-bold">
                پاشەکەوتکردن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toolbar */}
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
        canUndo={false} 
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
        onOpenSettings={() => setShowApiModal(true)}
        onToggleRecording={handleToggleRecording}
        onRunOCR={handleRunOCR}
        isRecording={isRecording}
      />

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row pt-24 md:pt-0">
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
        <div className="flex-1 overflow-y-auto bg-neutral-900 p-4 md:p-8 flex flex-col items-center pb-32 md:pb-8">
            {pages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 mt-10 md:mt-0">
                    <div className="bg-surface p-8 rounded-2xl border border-gray-700 text-center shadow-2xl max-w-md mx-4">
                        <p className="text-2xl mb-4 font-bold text-gray-200">بەخێربێی بۆ دەستکاریکەری PDF</p>
                        <p className="mb-6 text-gray-400">تکایە فایلەکا PDF باربکە بۆ دەستپێکرن یان لاپەرەکێ سپی زێدەکەن</p>
                         <div className="flex flex-col sm:flex-row gap-4 justify-center">
                             <label className="px-6 py-3 bg-primary hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors inline-block font-bold shadow-lg shadow-blue-500/30">
                                 بارکرنا PDF
                                 <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                             </label>
                             <button 
                                onClick={handleAddPage}
                                className="px-6 py-3 bg-surface hover:bg-gray-600 border border-gray-500 text-white rounded-lg transition-colors font-bold"
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
                        onModified={() => {}}
                    />
                ))
            )}
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="bg-black/90 border-t border-gray-800 p-1 px-4 text-xs text-gray-600 flex justify-between z-40 relative">
         <span>Kurdish PDF Editor v2.2 (AI Powered)</span>
         <span>{pages.length} Pages</span>
      </div>
    </div>
  );
};

export default App;