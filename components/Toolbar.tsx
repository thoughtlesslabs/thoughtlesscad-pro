
import React, { useState, useRef, useEffect } from 'react';
import { ToolType } from '../types';
import { exportToObj, exportToStl } from '../utils/exporter';
import { Entity } from '../types';
import DraggablePanel from './DraggablePanel';
import { logger } from '../utils/debug';

interface ToolbarProps {
  activeTool: ToolType;
  setTool: (t: ToolType) => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  onNewProject: () => void;
  onLoadFile?: (file: File) => void;
  canUndo: boolean;
  canRedo: boolean;
  isSaving: boolean;
  entities: Entity[];
  onExportImage: () => void;
  mobile?: boolean;
}

const tools: { id: ToolType; icon: string; label: string; color: string }[] = [
    { id: 'select', icon: 'fa-mouse-pointer', label: 'Select', color: 'text-white' },
    { id: 'pan', icon: 'fa-hand', label: 'Pan', color: 'text-slate-200' },
    { id: 'line', icon: 'fa-pen', label: 'Line', color: 'text-cyan-400' },
    { id: 'rectangle', icon: 'fa-square', label: 'Rect', color: 'text-green-400' },
    { id: 'circle', icon: 'fa-circle', label: 'Circle', color: 'text-yellow-400' },
    { id: 'sphere', icon: 'fa-globe', label: 'Sphere', color: 'text-indigo-400' },
    { id: 'polygon', icon: 'fa-draw-polygon', label: 'Poly', color: 'text-purple-400' },
    { id: 'light', icon: 'fa-lightbulb', label: 'Light', color: 'text-amber-400' },
];

const Toolbar: React.FC<ToolbarProps> = ({ 
  activeTool, setTool, undo, redo, save, onNewProject, onLoadFile, canUndo, canRedo, isSaving, entities, onExportImage, mobile
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
              setShowExportMenu(false);
          }
      };
      if(showExportMenu) document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);

  const handleExportObj = (selectedOnly: boolean) => {
      exportToObj(entities, selectedOnly);
      setShowExportMenu(false);
  };

  const handleExportStl = (selectedOnly: boolean) => {
      exportToStl(entities, selectedOnly);
      setShowExportMenu(false);
  };

  const handleExportImage = () => {
      onExportImage();
      setShowExportMenu(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && onLoadFile) {
          onLoadFile(file);
      }
      if (e.target) e.target.value = '';
  };

  // Unified Button Component for consistent behavior on Mobile/Desktop
  const ActionButton = ({ onClick, icon, label, disabled = false, active = false, color = 'text-slate-300' }: any) => (
      <button
        type="button"
        onClick={(e) => {
            logger.log('UI', `Action Click: ${label}`);
            onClick(e);
        }}
        disabled={disabled}
        title={label}
        style={{ touchAction: 'manipulation' }}
        className={`w-full h-10 rounded flex flex-col items-center justify-center transition-all border border-transparent pointer-events-auto relative z-10
            ${active 
                ? 'bg-blue-600 text-white shadow-lg ring-1 ring-blue-400' 
                : disabled 
                    ? 'opacity-30 cursor-not-allowed' 
                    : 'hover:bg-slate-700 bg-slate-800 border-slate-700'}
        `}
      >
        <i className={`fas ${icon} text-sm mb-0.5 pointer-events-none ${active ? 'text-white' : disabled ? 'text-slate-500' : color}`}></i>
        <span className="text-[8px] uppercase font-bold text-slate-400 pointer-events-none">{label}</span>
      </button>
  );

  const ToolButton = ({ tool, isActive, onClick }: { tool: typeof tools[0], isActive: boolean, onClick: () => void }) => (
    <button
        type="button"
        onClick={(e) => {
            // e.stopPropagation(); // Removed as it might block some mobile touch layers
            logger.log('UI', `Tool Click: ${tool.id}`);
            onClick();
        }}
        title={tool.label}
        style={{ touchAction: 'manipulation' }}
        className={`w-full h-10 rounded flex flex-col items-center justify-center transition-all border pointer-events-auto relative z-10
            ${isActive 
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg ring-1 ring-blue-400' 
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}
        `}
    >
        <i className={`fas ${tool.icon} text-sm mb-0.5 pointer-events-none ${isActive ? 'text-white' : tool.color}`}></i>
        <span className={`text-[8px] uppercase font-bold pointer-events-none ${isActive ? 'text-white' : 'text-slate-400'}`}>
            {mobile ? tool.label : tool.id}
        </span>
    </button>
  );

  const handleToolClick = (toolId: ToolType) => {
      setTool(toolId);
  };

  const Content = (
      <div className={`flex flex-col gap-2 items-center ${mobile ? 'w-full p-0' : 'p-2'}`}>
        {/* DRAWING TOOLS */}
        <div className={`grid gap-2 w-full relative z-10 ${mobile ? 'grid-cols-4' : 'grid-cols-1'}`}>
            {tools.map((tool) => (
                <ToolButton 
                    key={tool.id}
                    tool={tool}
                    isActive={activeTool === tool.id}
                    onClick={() => handleToolClick(tool.id)}
                />
            ))}
        </div>
        
        <div className="h-px w-full bg-slate-700 my-1 relative z-10"></div>

        {/* EDIT ACTIONS */}
        <div className="grid grid-cols-2 gap-1 w-full relative z-10">
            <ActionButton onClick={undo} disabled={!canUndo} icon="fa-undo" label="Undo" />
            <ActionButton onClick={redo} disabled={!canRedo} icon="fa-redo" label="Redo" />
        </div>
        
        <div className="h-px w-full bg-slate-700 my-1 relative z-10"></div>

        {/* FILE ACTIONS */}
        <div className="grid grid-cols-2 gap-1 w-full relative z-10">
            <ActionButton onClick={onNewProject} icon="fa-file-medical" label="New" color="text-blue-400" />
            <ActionButton onClick={() => fileInputRef.current?.click()} icon="fa-folder-open" label="Open" color="text-yellow-400" />
            
            <ActionButton onClick={save} disabled={isSaving} icon={isSaving ? "fa-spinner fa-spin" : "fa-save"} label="Save" color="text-emerald-400" />
            
            <div className="relative w-full" ref={menuRef}>
                <ActionButton 
                    onClick={() => setShowExportMenu(prev => !prev)} 
                    active={showExportMenu}
                    icon="fa-file-export" 
                    label="Export" 
                    color="text-orange-400" 
                />
                {showExportMenu && (
                    <div className={`absolute ${mobile ? 'bottom-full right-0 mb-2' : 'left-full bottom-0 ml-2'} w-40 bg-slate-800 border border-slate-600 rounded shadow-2xl z-50 p-1`}>
                        <div className="text-[9px] font-bold text-slate-500 px-2 py-1 uppercase tracking-wider">OBJ Format</div>
                        <button onClick={() => handleExportObj(false)} className="block w-full text-left px-3 py-2 text-[10px] text-slate-200 hover:bg-blue-600 rounded transition-colors">
                            <i className="fas fa-cube mr-2 text-slate-400"></i> All Objects (.obj)
                        </button>
                        <button onClick={() => handleExportObj(true)} className="block w-full text-left px-3 py-2 text-[10px] text-slate-200 hover:bg-blue-600 rounded transition-colors">
                            <i className="fas fa-cubes mr-2 text-slate-400"></i> Selected (.obj)
                        </button>

                        <div className="h-px bg-slate-700 my-1"></div>
                        <div className="text-[9px] font-bold text-slate-500 px-2 py-1 uppercase tracking-wider">STL Format</div>
                        <button onClick={() => handleExportStl(false)} className="block w-full text-left px-3 py-2 text-[10px] text-slate-200 hover:bg-blue-600 rounded transition-colors">
                            <i className="fas fa-cube mr-2 text-slate-400"></i> All Objects (.stl)
                        </button>
                        <button onClick={() => handleExportStl(true)} className="block w-full text-left px-3 py-2 text-[10px] text-slate-200 hover:bg-blue-600 rounded transition-colors">
                            <i className="fas fa-cubes mr-2 text-slate-400"></i> Selected (.stl)
                        </button>
                        
                        <div className="h-px bg-slate-700 my-1"></div>
                        <div className="text-[9px] font-bold text-slate-500 px-2 py-1 uppercase tracking-wider">Image</div>
                        <button onClick={handleExportImage} className="block w-full text-left px-3 py-2 text-[10px] text-slate-200 hover:bg-blue-600 rounded transition-colors">
                            <i className="fas fa-camera mr-2 text-slate-400"></i> Screenshot (.png)
                        </button>
                    </div>
                )}
            </div>
        </div>

        <div className="h-px w-full bg-slate-700 my-1 relative z-10"></div>
        
        <a href="https://buy.stripe.com/28E3cwcQsbEK8ShfAtbsc03" target="_blank" rel="noopener noreferrer" className="w-full h-8 bg-pink-900/30 border border-pink-700/50 rounded flex flex-row items-center justify-center gap-2 transition-colors hover:bg-pink-900/50 hover:border-pink-600 relative z-10">
             <i className="fas fa-heart text-pink-500 text-xs"></i>
             <span className="text-[9px] font-bold uppercase text-pink-300">Donate</span>
        </a>

        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
      </div>
  );

  if (mobile) return Content;

  return (
    <DraggablePanel title="Tools" initialPos={{ x: 16, y: 64 }} className="w-[88px]">
      {Content}
    </DraggablePanel>
  );
};

export default Toolbar;
