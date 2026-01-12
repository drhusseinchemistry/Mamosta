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
  onSaveProject: () => void;
  onAddPage: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const ToolButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  title: string;
}> = ({ active, onClick, icon: Icon, label, title }) => (
  <button
    onClick={onClick}
    title={title}
    className={`
      flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 min-w-[2.5rem]
      ${active 
        ? 'bg-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.6)] border-primary scale-110' 
        : 'text-gray-300 hover:bg-white/10 hover:text-white border border-transparent'}
    `}
  >
    <Icon size={18} />
    {/* Labels hidden on mobile, visible on lg screens if needed, but keeping it minimal */}
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
  onSaveProject,
  onAddPage,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}) => {
  return (
    <div className="fixed top-4 left-0 right-0 mx-auto w-max max-w-[95vw] z-50 animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="bg-black/70 backdrop-blur-md border border-white/10 shadow-2xl rounded-2xl flex flex-col items-center gap-1 p-2">
        
        {/* Top Row: File Operations & Undo/Redo */}
        <div className="flex items-center gap-2 w-full justify-between px-2 pb-1 border-b border-white/10">
          <div className="flex items-center gap-2">
            <label className="p-1.5 bg-blue-600/90 hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors" title="ڤەکرنا PDF">
              <Icons.Upload size={16} />
              <input type="file" accept=".pdf" className="hidden" onChange={onUpload} />
            </label>

            <button onClick={onExport} className="p-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-lg transition-colors" title="هناردەکرن">
              <Icons.Download size={16} />
            </button>
            
            <button onClick={onAddPage} className="p-1.5 bg-gray-700/80 hover:bg-gray-600 text-white rounded-lg transition-colors" title="لاپەرێ سپی">
              <Icons.Plus size={16} />
            </button>
          </div>

          <div className="flex items-center gap-1 border-l border-white/10 pl-2">
            <button onClick={onUndo} disabled={!canUndo} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30">
              <Icons.Undo size={16} />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30">
              <Icons.Redo size={16} />
            </button>
          </div>
        </div>

        {/* Bottom Row: Drawing Tools */}
        <div className="flex flex-wrap items-center justify-center gap-1 pt-1">
           <ToolButton active={editorState.activeTool === 'select'} onClick={() => onToolChange('select')} icon={Icons.Select} label="دیارکرن" title="دیارکرن" />
           <ToolButton active={editorState.activeTool === 'pen'} onClick={() => onToolChange('pen')} icon={Icons.Pen} label="قەلەم" title="قەلەم" />
           <ToolButton active={editorState.activeTool === 'highlighter'} onClick={() => onToolChange('highlighter')} icon={Icons.Highlighter} label="هایلایت" title="هایلایت" />
           <ToolButton active={editorState.activeTool === 'text'} onClick={() => onToolChange('text')} icon={Icons.Text} label="نڤیسین" title="نڤیسین" />
           
           <label className={`
             flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 min-w-[2.5rem]
             text-gray-300 hover:bg-white/10 hover:text-white cursor-pointer
           `} title="وێنە">
             <Icons.Image size={18} />
             <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
           </label>

           <div className="w-px h-6 bg-white/10 mx-1"></div>

           <ToolButton active={editorState.activeTool === 'line'} onClick={() => onToolChange('line')} icon={Icons.Line} label="هێل" title="هێل" />
           <ToolButton active={editorState.activeTool === 'rect'} onClick={() => onToolChange('rect')} icon={Icons.Rect} label="چوارگۆشە" title="چوارگۆشە" />
           <ToolButton active={editorState.activeTool === 'circle'} onClick={() => onToolChange('circle')} icon={Icons.Circle} label="بازنە" title="بازنە" />

           <div className="w-px h-6 bg-white/10 mx-1"></div>

           {/* Color & Size Compact */}
           <div className="flex items-center gap-2 px-1">
             <input 
                type="color" 
                value={editorState.strokeColor}
                onChange={(e) => onColorChange(e.target.value)}
                className="w-6 h-6 rounded-full overflow-hidden cursor-pointer border-2 border-white/20 p-0"
              />
              <div className="flex flex-col w-16">
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