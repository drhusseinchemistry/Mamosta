import React from 'react';
import { PageData } from '../types';
import { Icons } from './Icon';

interface SidebarProps {
  pages: PageData[];
  activePage: number;
  onPageSelect: (pageNumber: number) => void;
  onDeletePage: (pageNumber: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ pages, activePage, onPageSelect, onDeletePage }) => {
  return (
    <div className="w-full md:w-52 bg-darker border-l border-gray-700 flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto h-32 md:h-full p-3 gap-3 shrink-0 shadow-xl z-40">
      {pages.map((page) => (
        <div 
          key={page.pageNumber}
          className={`
            relative group flex-shrink-0 w-32 md:w-full cursor-pointer transition-all duration-200
            ${activePage === page.pageNumber 
              ? 'ring-2 ring-primary bg-surface' 
              : 'hover:ring-2 hover:ring-gray-500 border border-gray-600'}
            rounded-md p-2 bg-dark
          `}
          onClick={() => onPageSelect(page.pageNumber)}
        >
          <div className="relative aspect-[1/1.414] bg-white rounded overflow-hidden">
             {/* Thumbnail Image */}
             {page.image ? (
               <img src={page.image} alt={`Page ${page.pageNumber}`} className="w-full h-full object-contain" />
             ) : (
               <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Loading...</div>
             )}
          </div>
          
          <div className="flex justify-between items-center mt-2 px-1">
             <span className="text-xs text-gray-400 font-bold">لاپەر {page.pageNumber}</span>
             <button 
               onClick={(e) => { e.stopPropagation(); onDeletePage(page.pageNumber); }}
               className="text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
               title="ژێبرن"
             >
               <Icons.Trash size={14} />
             </button>
          </div>
        </div>
      ))}
      
      {pages.length === 0 && (
        <div className="text-center text-gray-500 text-sm py-8 w-full">
          هیچ لاپەرەک نینە
        </div>
      )}
    </div>
  );
};

export default Sidebar;