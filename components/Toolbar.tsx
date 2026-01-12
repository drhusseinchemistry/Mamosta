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
      flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 min-w-[3rem]
      ${active 
        ? 'bg-primary text-white shadow-[0_0_10px_rgba(13,110,253,0.5)] border-primary' 
        : 'bg-surface text-gray-300 hover:bg-gray-600 border border-gray-600'}
    `}
  >
    <Icon size={20} />
    {/* Hidden on very small screens, shown on md+ */}
    <span className="hidden md:block text-[10px] mt-1 font-medium">{label}</span>
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
    <div className="flex flex-col w-full bg-darker border-b border-gray-700 shadow-md z-50">
      {/* File Operations Row */}
      <div className="flex items-center gap-2 p-2 px-4 border-b border-gray-700 overflow-x-auto no-scrollbar">
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded cursor-pointer transition-colors whitespace-nowrap">
          <Icons.Upload size={18} />
          <span className="font-bold">ڤەکرنا PDF</span>
          <input type="file" accept=".pdf" className="hidden" onChange={onUpload} />
        </label>

        <button onClick={onSaveProject} className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded transition-colors whitespace-nowrap">
          <Icons.Save size={18} />
          <span className="font-bold">پاشەکەوتکرن</span>
        </button>

        <button onClick={onExport} className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded transition-colors whitespace-nowrap">
          <Icons.Download size={18} />
          <span className="font-bold">هناردەکرن</span>
        </button>

        <div className="h-6 w-px bg-gray-600 mx-2"></div>

        <button onClick={onUndo} disabled={!canUndo} className="p-2 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
          <Icons.Undo size={20} />
        </button>
        <button onClick={onRedo} disabled={!canRedo} className="p-2 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
          <Icons.Redo size={20} />
        </button>
      </div>

      {/* Tools Row */}
      <div className="flex flex-wrap items-center gap-2 p-2 px-4">
        
        <div className="flex gap-1 mr-4">
           <ToolButton 
            active={editorState.activeTool === 'select'} 
            onClick={() => onToolChange('select')} 
            icon={Icons.Select} 
            label="دیارکرن"
            title="دیارکرن و جوڵاندن"
          />
           <ToolButton 
            active={editorState.activeTool === 'pen'} 
            onClick={() => onToolChange('pen')} 
            icon={Icons.Pen} 
            label="قەلەم"
            title="نڤیسینا ئازاد"
          />
           <ToolButton 
            active={editorState.activeTool === 'highlighter'} 
            onClick={() => onToolChange('highlighter')} 
            icon={Icons.Highlighter} 
            label="هایلایت"
            title="هایلایتکرنا نڤیسینێ"
          />
           <ToolButton 
            active={editorState.activeTool === 'text'} 
            onClick={() => onToolChange('text')} 
            icon={Icons.Text} 
            label="نڤیسین"
            title="نڤیسین"
          />
           <label className={`
             flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 min-w-[3rem]
             bg-surface text-gray-300 hover:bg-gray-600 border border-gray-600 cursor-pointer
           `} title="وێنە">
             <Icons.Image size={20} />
             <span className="hidden md:block text-[10px] mt-1 font-medium">وێنە</span>
             <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
           </label>
        </div>

        <div className="h-8 w-px bg-gray-600 mx-1"></div>

        <div className="flex gap-1">
          <ToolButton 
            active={editorState.activeTool === 'line'} 
            onClick={() => onToolChange('line')} 
            icon={Icons.Line} 
            label="هێل"
            title="هێلا ڕاست"
          />
          <ToolButton 
            active={editorState.activeTool === 'rect'} 
            onClick={() => onToolChange('rect')} 
            icon={Icons.Rect} 
            label="چوارگۆشە"
            title="چوارگۆشە"
          />
          <ToolButton 
            active={editorState.activeTool === 'circle'} 
            onClick={() => onToolChange('circle')} 
            icon={Icons.Circle} 
            label="بازنە"
            title="بازنە"
          />
        </div>

        <div className="h-8 w-px bg-gray-600 mx-1"></div>

        <div className="flex items-center gap-4 bg-surface p-2 rounded-lg border border-gray-600 ml-auto md:ml-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">ڕەنگ:</span>
            <input 
              type="color" 
              value={editorState.strokeColor}
              onChange={(e) => onColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">ستووری:</span>
            <input 
              type="range" 
              min="1" 
              max="50" 
              value={editorState.strokeWidth}
              onChange={(e) => onWidthChange(Number(e.target.value))}
              className="w-24 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs w-6 text-center">{editorState.strokeWidth}</span>
          </div>
        </div>

         <div className="flex-grow"></div>
         
         <button 
           onClick={onAddPage}
           className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-gray-600 border border-gray-500 rounded text-sm transition-colors"
         >
           <Icons.Plus size={16} />
           <span>لاپەرێ سپی</span>
         </button>

      </div>
    </div>
  );
};

export default Toolbar;