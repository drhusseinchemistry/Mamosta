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
  iconSize = 18
}) => {
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

           <ToolButton active={editorState.activeTool === 'line'} onClick={() => onToolChange('line')} icon={Icons.Line} label="هێل" title="هێل" iconSize={iconSize} />
           <ToolButton active={editorState.activeTool === 'rect'} onClick={() => onToolChange('rect')} icon={Icons.Rect} label="چوارگۆشە" title="چوارگۆشە" iconSize={iconSize} />
           
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