import React from 'react';
import { ToolType, EditorState } from '../types';
import { Icons } from './Icon';

interface ToolbarProps {
  editorState: EditorState;
  onToolChange: (tool: ToolType) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onExportFullQuality: () => void;
  onSaveProject: () => void;
  onAddPage: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // AI Props
  onOpenSettings: () => void;
  onToggleRecording: () => void;
  onRunOCR: () => void;
  isRecording: boolean;
  voiceLanguage: string;
  onVoiceLanguageChange: (lang: string) => void;
  iconSize?: number;
  onAddElement: (type: string) => void;
  onAddMathSymbol: (type: string) => void;
  onAIParseMath?: (file: File, instruction: string) => Promise<void>;
}

const ToolButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  title: string;
  className?: string;
  iconSize?: number;
}> = ({ active, onClick, icon: Icon, label, title, className = "", iconSize = 18 }) => (
  <button
    onClick={onClick}
    title={title}
    className={`
      flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 min-w-[2.5rem]
      ${active 
        ? 'bg-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.6)] border-primary scale-110' 
        : 'text-gray-300 hover:bg-white/10 hover:text-white border border-transparent'}
      ${className}
    `}
  >
    <Icon size={iconSize} />
    {/* Labels hidden on mobile, visible on lg screens if needed */}
    <span className="hidden lg:block text-[9px] mt-0.5 font-medium opacity-80">{label}</span>
  </button>
);

const Toolbar: React.FC<ToolbarProps> = ({
  editorState,
  onToolChange,
  onColorChange,
  onWidthChange,
  onUpload,
  onImageUpload,
  onExport,
  onExportFullQuality,
  onSaveProject,
  onAddPage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenSettings,
  onToggleRecording,
  onRunOCR,
  isRecording,
  voiceLanguage,
  onVoiceLanguageChange,
  iconSize = 18,
  onAddElement,
  onAddMathSymbol,
  onAIParseMath
}) => {
  const [showElementsDropdown, setShowElementsDropdown] = React.useState(false);
  const [showMathDropdown, setShowMathDropdown] = React.useState(false);
  const [showAsilaDropdown, setShowAsilaDropdown] = React.useState(false);
  const [aiFile, setAiFile] = React.useState<File | null>(null);
  const [asilaFile, setAsilaFile] = React.useState<File | null>(null);
  const [aiInstruction, setAiInstruction] = React.useState('ڤێ پرسیارا بیرکاری یا د ڤی وێنەی دا ب دروستی بنڤیسەڤە');
  const [asilaInstruction, setAsilaInstruction] = React.useState('ڤێ پرسیارێ ب دروستی بنڤیسەڤە و بۆکس بکە');
  const [isAiProcessing, setIsAiProcessing] = React.useState(false);
  const [isAsilaProcessing, setIsAsilaProcessing] = React.useState(false);

  const handleAiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAiFile(file);
    }
  };

  const handleAsilaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAsilaFile(file);
    }
  };

  const handleRunAiMath = async () => {
    if (!aiFile || !onAIParseMath) return;
    setIsAiProcessing(true);
    try {
      await onAIParseMath(aiFile, aiInstruction);
      setAiFile(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiProcessing(false);
      setShowMathDropdown(false);
    }
  };

  const handleRunAsila = async () => {
    if (!asilaFile || !onAIParseMath) return;
    setIsAsilaProcessing(true);
    try {
      await onAIParseMath(asilaFile, asilaInstruction);
      setAsilaFile(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAsilaProcessing(false);
      setShowAsilaDropdown(false);
    }
  };

  const auxSize = Math.max(12, iconSize - 2);
  const smallAuxSize = Math.max(10, iconSize - 4);

  return (
    <div className="fixed top-4 left-0 right-0 mx-auto w-max max-w-[95vw] z-50 animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="bg-black/70 backdrop-blur-md border border-white/10 shadow-2xl rounded-2xl flex flex-col items-center gap-1 p-2">
        
        {/* Top Row: File Operations, AI Settings & Undo/Redo */}
        <div className="flex items-center gap-2 w-full justify-between px-2 pb-1 border-b border-white/10">
          <div className="flex items-center gap-2">
            <label className="p-1.5 bg-blue-600/90 hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors" title="ڤەکرنا PDF یان پڕۆژەی (.kpdf)">
              <Icons.Upload size={auxSize} />
              <input type="file" accept=".pdf,.json,.kpdf" className="hidden" onChange={onUpload} />
            </label>

            <button onClick={onExport} className="p-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-lg transition-colors" title="هناردەکرن (کوالێتیا ئاسایی)">
              <Icons.Download size={auxSize} />
            </button>

            <button 
              onClick={onExportFullQuality} 
              className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.3)]" 
              title="پاشەکەوتکردن بە کوالێتیی فوول (Save Full Quality PDF)"
            >
              <Icons.Sparkles size={auxSize} className="text-emerald-200" />
              <span className="text-[10px] font-extrabold text-emerald-100">FULL HQ</span>
            </button>

            <button 
              onClick={onSaveProject} 
              className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-1 shadow-[0_0_10px_rgba(79,70,229,0.3)]" 
              title="خەزنکرنا پڕۆژەی ڤێکتۆر (Save Editable .kpdf Project)"
            >
              <Icons.Save size={auxSize} className="text-indigo-200" />
              <span className="text-[10px] font-extrabold text-indigo-100">خەزنکرنا پڕۆژەی (.kpdf)</span>
            </button>
            
            <button onClick={onAddPage} className="p-1.5 bg-gray-700/80 hover:bg-gray-600 text-white rounded-lg transition-colors" title="لاپەرێ سپی">
              <Icons.Plus size={auxSize} />
            </button>

            {/* API Settings Icon */}
            <button 
              onClick={onOpenSettings} 
              className="p-1.5 bg-purple-700/80 hover:bg-purple-600 text-white rounded-lg transition-colors ml-1" 
              title="ڕێکخستنی کەیفی و گشتی"
            >
              <Icons.Settings size={auxSize} />
            </button>
          </div>

          <div className="flex items-center gap-1 border-l border-white/10 pl-2">
            <button onClick={onUndo} disabled={!canUndo} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30">
              <Icons.Undo size={auxSize} />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30">
              <Icons.Redo size={auxSize} />
            </button>
          </div>
        </div>

        {/* Bottom Row: Drawing Tools & AI Features */}
        <div className="flex flex-wrap items-center justify-center gap-1 pt-1">
           <ToolButton active={editorState.activeTool === 'select'} onClick={() => onToolChange('select')} icon={Icons.Select} label="دیارکرن" title="دیارکرن" iconSize={iconSize} />
           <ToolButton active={editorState.activeTool === 'pen'} onClick={() => onToolChange('pen')} icon={Icons.Pen} label="قەلەم" title="قەلەم" iconSize={iconSize} />
           <ToolButton active={editorState.activeTool === 'highlighter'} onClick={() => onToolChange('highlighter')} icon={Icons.Highlighter} label="هایلایت" title="هایلایت" iconSize={iconSize} />
           <ToolButton active={editorState.activeTool === 'text'} onClick={() => onToolChange('text')} icon={Icons.Text} label="نڤیسین" title="نڤیسین" iconSize={iconSize} />
           
           {/* Voice Input */}
           <div className="flex items-center gap-0.5 bg-white/5 rounded-lg border border-white/10 p-0.5">
             <ToolButton 
               active={isRecording} 
               onClick={onToggleRecording} 
               icon={Icons.Mic} 
               label={isRecording ? "تۆمارکرن..." : "دەنگ"} 
               title="گۆڕینی دەنگ بۆ نووسین"
               iconSize={iconSize}
               className={`!border-none !bg-transparent ${isRecording ? "animate-pulse !text-red-500" : ""}`}
             />
             <div className="w-[1px] h-6 bg-white/10"></div>
             {/* Beautiful Select Dropdown with Globe/Languages icon */}
             <div className="flex items-center gap-1 px-1.5" title="زمانێ دەنگی (Voice Language)">
               <Icons.Languages size={smallAuxSize} className="text-blue-400" />
               <select
                 value={voiceLanguage}
                 onChange={(e) => onVoiceLanguageChange(e.target.value)}
                 className="bg-transparent border-none text-white text-[11px] font-bold focus:outline-none cursor-pointer pl-0.5 outline-none"
               >
                 <option value="ku_badini" className="bg-zinc-950 text-white text-[11px]">کوردی بادینی (عەرەبی)</option>
                 <option value="ku_sorani" className="bg-zinc-950 text-white text-[11px]">کوردی سۆرانی</option>
                 <option value="ar" className="bg-zinc-950 text-white text-[11px]">العربية</option>
                 <option value="en" className="bg-zinc-950 text-white text-[11px]">English</option>
               </select>
             </div>
           </div>

           {/* OCR */}
           <ToolButton active={false} onClick={onRunOCR} icon={Icons.ScanText} label="OCR" title="دەرهێنانی نووسین (OCR)" iconSize={iconSize} />

           <label className={`
             flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 min-w-[2.5rem]
             text-gray-300 hover:bg-white/10 hover:text-white cursor-pointer
           `} title="وێنە">
             <Icons.Image size={iconSize} />
             <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
           </label>

           <div className="w-px h-6 bg-white/10 mx-1"></div>

           {/* Elements Dropdown Trigger */}
           <div className="relative">
             <button
               onClick={() => { setShowElementsDropdown(prev => !prev); setShowMathDropdown(false); }}
               title="زیادکردنی کەرەستەکان (Elements)"
               className={`
                 flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 min-w-[3rem]
                 ${showElementsDropdown 
                   ? 'bg-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.6)] border-primary scale-105' 
                   : 'text-gray-300 hover:bg-white/10 hover:text-white border border-transparent'}
               `}
             >
               <Icons.Shapes size={iconSize} className="text-blue-400 animate-pulse" />
               <span className="text-[9px] mt-0.5 font-bold uppercase tracking-wider text-blue-200">elements</span>
             </button>

             {showElementsDropdown && (
               <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-slate-900/95 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl p-2 w-48 flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200 text-right" dir="rtl">
                 <div className="text-[10px] text-gray-400 font-extrabold uppercase px-2 py-1 border-b border-white/10 text-center">
                   کەرەستەکان / elements
                 </div>
                 
                 {/* Table */}
                 <button
                   onClick={() => {
                     onAddElement('table');
                     setShowElementsDropdown(false);
                   }}
                   className="flex items-center justify-between w-full p-2 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                 >
                   <Icons.TableIcon size={14} className="text-blue-400" />
                   <span>خشتە (Table)</span>
                 </button>

                 {/* Square */}
                 <button
                   onClick={() => {
                     onAddElement('square');
                     setShowElementsDropdown(false);
                   }}
                   className="flex items-center justify-between w-full p-2 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                 >
                   <Icons.Rect size={14} className="text-indigo-400" />
                   <span>چوارگۆشە (Square)</span>
                 </button>

                 {/* Circle */}
                 <button
                   onClick={() => {
                     onAddElement('circle');
                     setShowElementsDropdown(false);
                   }}
                   className="flex items-center justify-between w-full p-2 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                 >
                   <Icons.Circle size={14} className="text-emerald-400" />
                   <span>بازنە (Circle)</span>
                 </button>

                 {/* Rectangle */}
                 <button
                   onClick={() => {
                     onAddElement('rectangle');
                     setShowElementsDropdown(false);
                   }}
                   className="flex items-center justify-between w-full p-2 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                 >
                   <div className="w-4 h-2.5 border border-purple-400 rounded-sm"></div>
                   <span>لاکێشە (Rectangle)</span>
                 </button>

                 {/* Rhombus */}
                 <button
                   onClick={() => {
                     onAddElement('rhombus');
                     setShowElementsDropdown(false);
                   }}
                   className="flex items-center justify-between w-full p-2 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                 >
                   <Icons.Diamond size={14} className="text-amber-400" />
                   <span>مەعین (Rhombus)</span>
                 </button>

                 {/* Arrow */}
                 <button
                   onClick={() => {
                     onAddElement('arrow');
                     setShowElementsDropdown(false);
                   }}
                   className="flex items-center justify-between w-full p-2 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                 >
                   <Icons.ArrowRight size={14} className="text-red-400" />
                   <span>تیر (Arrow)</span>
                 </button>

                 {/* Line */}
                 <button
                   onClick={() => {
                     onAddElement('line');
                     setShowElementsDropdown(false);
                   }}
                   className="flex items-center justify-between w-full p-2 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                 >
                   <Icons.Line size={14} className="text-pink-400" />
                   <span>هێڵ (Line)</span>
                 </button>
               </div>
             )}
           </div>
           
           <div className="w-px h-6 bg-white/10 mx-1"></div>

           {/* Mathematics Dropdown Trigger */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowMathDropdown(prev => !prev);
                  setShowAsilaDropdown(false);
                  setShowElementsDropdown(false);
                }}
                title="هێمایێن بیرکاری (Mathematics)"
                className={`
                  flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 min-w-[3rem]
                  ${showMathDropdown 
                    ? 'bg-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.6)] border-primary scale-105' 
                    : 'text-gray-300 hover:bg-white/10 hover:text-white border border-transparent'}
                `}
              >
                <Icons.Calculator size={iconSize} className="text-emerald-400 animate-pulse" />
                <span className="text-[9px] mt-0.5 font-bold uppercase tracking-wider text-emerald-200">mathematics</span>
              </button>

              {showMathDropdown && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-slate-950/95 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl p-3 w-72 flex flex-col gap-2.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200 text-right overflow-y-auto max-h-[420px]" dir="rtl">
                  <div className="text-[11px] text-gray-400 font-extrabold uppercase px-2 py-1 border-b border-white/10 text-center">
                    هێمایێن بیرکاری / mathematics
                  </div>

                  {/* AI Math Assistant Segment */}
                  <div className="flex flex-col gap-2 p-2 bg-white/5 rounded-lg border border-white/10 text-right" dir="rtl">
                    <div className="flex items-center justify-between gap-1 text-emerald-400 font-extrabold text-[11px] border-b border-white/10 pb-1.5">
                      <Icons.Sparkles size={12} className="text-emerald-400 animate-pulse animate-duration-1000" />
                      <span>هاریکارێ بیرکاری یێ ژیر (AI Assistant)</span>
                    </div>
                    
                    {/* File Selection */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-300 font-bold">وێنە یان PDF باربکە:</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="file"
                          id="math-ai-file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={handleAiFileChange}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('math-ai-file')?.click()}
                          className="flex items-center justify-center gap-1 flex-1 py-1 px-2 rounded bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/25 text-emerald-300 text-[11px] transition-all font-bold"
                        >
                          <Icons.Upload size={12} />
                          <span className="truncate max-w-[120px]">{aiFile ? aiFile.name : 'هەلبژارتنا فایلی'}</span>
                        </button>
                        {aiFile && (
                          <button
                            type="button"
                            onClick={() => setAiFile(null)}
                            className="p-1 rounded hover:bg-white/10 text-red-400 transition-colors"
                            title="لادان"
                          >
                            <Icons.X size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Instruction Box */}
                    <div className="flex flex-col gap-1 mt-1">
                      <label className="text-[10px] text-gray-300 font-bold">داخوازیا تە:</label>
                      <textarea
                        value={aiInstruction}
                        onChange={(e) => setAiInstruction(e.target.value)}
                        placeholder="داخوازیا خۆ ل ئێرە بنڤیسە... بۆ نموونە: ڤێ پرسیارا بیرکاری یا تێدا بومن بنڤیسەڤە"
                        className="w-full text-[11px] bg-slate-900 border border-white/10 rounded p-1.5 text-gray-200 resize-none h-14 focus:outline-none focus:border-emerald-500 text-right"
                      />
                    </div>

                    {/* Run Button */}
                    <button
                      type="button"
                      disabled={!aiFile || isAiProcessing}
                      onClick={handleRunAiMath}
                      className={`
                        flex items-center justify-center gap-1.5 w-full py-1.5 px-3 mt-1 rounded text-xs font-bold transition-all
                        ${(!aiFile || isAiProcessing) 
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                          : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.3)] hover:scale-[1.02]'}
                      `}
                    >
                      <Icons.Play size={12} />
                      <span>{isAiProcessing ? 'دهێتە جێبەجێکرن...' : 'جێبەجێکرن'}</span>
                    </button>
                  </div>
                  
                  <div className="h-px bg-white/10 my-1"></div>

                  {/* کەرت و ڕێژە (Fractions & Ratios) */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-emerald-400 font-extrabold border-b border-white/5 pb-0.5">کەرت و ڕێژە (Fractions & Ratios)</span>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => {
                          onAddMathSymbol('fraction');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-emerald-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">a / b</span>
                        <span>کەرت (Fraction)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('percentage');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-emerald-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">%</span>
                        <span>ڕێژەیا سەدێ (Percentage)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('ratio');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-emerald-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">a : b</span>
                        <span>ڕێژە (Ratio)</span>
                      </button>
                    </div>
                  </div>

                  {/* یاسا و گۆڕاوێن جەبری (Algebraic Formulas & Variables) */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-amber-400 font-extrabold border-b border-white/5 pb-0.5">یاسا و گۆڕاوێن جەبری (Algebraic Formulas)</span>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => {
                          onAddMathSymbol('function');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-amber-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">f(x)</span>
                        <span>نەخشەیێ x (Function)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('absolute');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-amber-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">|x|</span>
                        <span>بهایێ بێ مەرج (Absolute)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('sigma_sum');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-amber-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">∑</span>
                        <span>کۆمکرنا گشتی (Sigma Sum)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('product');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-amber-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">∏</span>
                        <span>جارتێدانا زنجیرەیی (Product Pi)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('log');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-amber-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">log(x)</span>
                        <span>لۆگاریتم (Logarithm)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('ln');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-amber-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">ln(x)</span>
                        <span>لۆگاریتما سروشتی (Natural)</span>
                      </button>
                    </div>
                  </div>

                  {/* کالکۆلس و گۆهرین (Calculus & Analysis) */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-blue-400 font-extrabold border-b border-white/5 pb-0.5">کالکۆلس و گۆهرین (Calculus & Analysis)</span>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => {
                          onAddMathSymbol('derivative');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-blue-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">dy/dx</span>
                        <span>داتاشراو (Derivative)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('integral');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-blue-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">∫</span>
                        <span>تەواوکاری (Integral)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('definite_integral');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-blue-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">∫_a^b</span>
                        <span>تەواوکاریا دیاریکری (Definite)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('limit');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-blue-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">lim x→a</span>
                        <span>غایە (Limit)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('delta_x');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-blue-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">Δx</span>
                        <span>گۆهرینا بچووک (Delta x)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('partial_deriv');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-blue-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">∂</span>
                        <span>داتاشراوا پشکۆیی (Partial)</span>
                      </button>
                    </div>
                  </div>

                  {/* هێمایێن زانستی و فیزیا/کیمیا (Scientific & Constant Symbols) */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-pink-400 font-extrabold border-b border-white/5 pb-0.5">هێمایێن زانستی و فیزیا/کیمیا</span>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => {
                          onAddMathSymbol('micro');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-pink-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">μ</span>
                        <span>مایکرۆ (Micro / Mu)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('rho');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-pink-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">ρ</span>
                        <span>رۆ / چڕی (Rho / Density)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('lambda');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-pink-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">λ</span>
                        <span>درێژاهیا پێلێ (Wavelength)</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('alpha_beta_gamma');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-pink-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">α, β, γ</span>
                        <span>ئالفا، بێتا، گاما</span>
                      </button>
                      <button
                        onClick={() => {
                          onAddMathSymbol('yields');
                          setShowMathDropdown(false);
                        }}
                        className="flex items-center justify-between w-full p-1.5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-200 transition-colors"
                      >
                        <span className="font-mono text-pink-300 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">➔</span>
                        <span>بەرهەم دهێت (Yields)</span>
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </div>

             {/* Asila Dropdown Trigger */}
             <div className="relative">
               <button
                 onClick={() => {
                   setShowAsilaDropdown(prev => !prev);
                   setShowMathDropdown(false);
                   setShowElementsDropdown(false);
                 }}
                 title="پرسیار و تاقیکردنەوە (Asila)"
                 className={`
                   flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 min-w-[3rem]
                   ${showAsilaDropdown 
                     ? 'bg-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.6)] border-primary scale-105' 
                     : 'text-gray-300 hover:bg-white/10 hover:text-white border border-transparent'}
                 `}
               >
                 <Icons.File size={iconSize} className="text-sky-400 animate-pulse" />
                 <span className="text-[9px] mt-0.5 font-bold uppercase tracking-wider text-sky-200">asila</span>
               </button>

               {showAsilaDropdown && (
                 <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-slate-950/95 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl p-3 w-72 flex flex-col gap-2.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200 text-right overflow-y-auto max-h-[420px]" dir="rtl">
                   <div className="text-[11px] text-gray-400 font-extrabold uppercase px-2 py-1 border-b border-white/10 text-center">
                     ئامادەکردنی پرسیار / asila
                   </div>

                   {/* AI Questions Assistant Segment */}
                   <div className="flex flex-col gap-2 p-2 bg-white/5 rounded-lg border border-white/10 text-right" dir="rtl">
                     <div className="flex items-center justify-between gap-1 text-sky-400 font-extrabold text-[11px] border-b border-white/10 pb-1.5">
                       <Icons.Sparkles size={12} className="text-sky-400 animate-pulse animate-duration-1000" />
                       <span>سازکردنی پرسیاران (AI Questions)</span>
                     </div>
                     
                     {/* File Selection */}
                     <div className="flex flex-col gap-1">
                       <label className="text-[10px] text-gray-300 font-bold">وێنە یان PDF باربکە:</label>
                       <div className="flex items-center gap-1.5">
                         <input
                           type="file"
                           id="asila-ai-file"
                           accept="image/*,application/pdf"
                           className="hidden"
                           onChange={handleAsilaFileChange}
                         />
                         <button
                           type="button"
                           onClick={() => document.getElementById('asila-ai-file')?.click()}
                           className="flex items-center justify-center gap-1 flex-1 py-1 px-2 rounded bg-sky-950/40 hover:bg-sky-900/50 border border-sky-500/25 text-sky-300 text-[11px] transition-all font-bold"
                         >
                           <Icons.Upload size={12} />
                           <span className="truncate max-w-[120px]">{asilaFile ? asilaFile.name : 'هەلبژارتنا فایلی'}</span>
                         </button>
                         {asilaFile && (
                           <button
                             type="button"
                             onClick={() => setAsilaFile(null)}
                             className="p-1 rounded hover:bg-white/10 text-red-400 transition-colors"
                             title="لادان"
                           >
                             <Icons.X size={12} />
                           </button>
                         )}
                       </div>
                     </div>

                     {/* Instruction Box */}
                     <div className="flex flex-col gap-1 mt-1">
                       <label className="text-[10px] text-gray-300 font-bold">داخوازیا تە (داخازیێ کو بنڤیسیت):</label>
                       <textarea
                         value={asilaInstruction}
                         onChange={(e) => setAsilaInstruction(e.target.value)}
                         placeholder="داخوازیا خۆ ل ئێرە بنڤیسە... بۆ نموونە: ڤان پرسیارێن تاقیکردنەوەیێ ب دروستی بنڤیسەڤە"
                         className="w-full text-[11px] bg-slate-900 border border-white/10 rounded p-1.5 text-gray-200 resize-none h-14 focus:outline-none focus:border-sky-500 text-right"
                       />
                     </div>

                     {/* Run Button */}
                     <button
                       type="button"
                       disabled={!asilaFile || isAsilaProcessing}
                       onClick={handleRunAsila}
                       className={`
                         flex items-center justify-center gap-1.5 w-full py-1.5 px-3 mt-1 rounded text-xs font-bold transition-all
                         ${(!asilaFile || isAsilaProcessing) 
                           ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                           : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-[0_0_10px_rgba(56,189,248,0.3)] hover:scale-[1.02]'}
                       `}
                     >
                       <Icons.Play size={12} />
                       <span>{isAsilaProcessing ? 'دهێتە جێبەجێکرن...' : 'جێبەجێکرن (چێکرن)'}</span>
                     </button>
                   </div>
                 </div>
               )}
             </div>

            <div className="w-px h-6 bg-white/10 mx-1"></div>

            {/* Color & Size Compact */}
           <div className="flex items-center gap-2 px-1">
             <input 
                type="color" 
                value={editorState.strokeColor}
                onChange={(e) => onColorChange(e.target.value)}
                className="w-6 h-6 rounded-full overflow-hidden cursor-pointer border-2 border-white/20 p-0"
              />
              <div className="flex flex-col w-12">
                 <input 
                  type="range" 
                  min="1" 
                  max="30" 
                  value={editorState.strokeWidth}
                  onChange={(e) => onWidthChange(Number(e.target.value))}
                  className="h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;