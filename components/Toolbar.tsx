
import React, { useState, useRef, useEffect } from 'react';
import { ToolType } from '../types';
import { exportToObj } from '../utils/exporter';
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
}

const Toolbar: React.FC<ToolbarProps> = ({ 
  activeTool, setTool, undo, redo, save, onNewProject, onLoadFile, canUndo, canRedo, isSaving, entities, onExportImage
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

  const handleExportImage = () => {
      onExportImage();
      setShowExportMenu(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && onLoadFile) {
          onLoadFile(file);
      }
      // Reset input
      if (e.target) e.target.value = '';
  };

  const tools: { id: ToolType; icon: string; label: string }[] = [
    { id: 'select', icon: 'fa-mouse-pointer', label: 'Select (V)' },
    { id: 'pan', icon: 'fa-hand', label: 'Pan (H)' },
    { id: 'line', icon: 'fa-pen', label: 'Line (L)' },
    { id: 'rectangle', icon: 'fa-square', label: 'Rect (R)' },
    { id: 'circle', icon: 'fa-circle', label: 'Circle (C)' },
    { id: 'sphere', icon: 'fa-globe', label: 'Sphere' },
    { id: 'polygon', icon: 'fa-draw-polygon', label: 'Poly (P)' },
    { id: 'light', icon: 'fa-lightbulb', label: 'Light' },
  ];

  const ActionButton = ({ onClick, icon, label, disabled = false, active = false, color = 'text-slate-300' }: any) => (
      <button
        onClick={onClick}
        disabled={disabled}
        title={label}
        className={`w-full h-10 rounded flex flex-col items-center justify-center transition-all border border-transparent
            ${active 
                ? 'bg-blue-600 text-white shadow-lg ring-1 ring-blue-400' 
                : disabled 
                    ? 'opacity-30 cursor-not-allowed' 
                    : 'hover:bg-slate-700 bg-slate-800 border-slate-700'}
        `}
      >
        <i className={`fas ${icon} text-sm mb-0.5 ${active ? 'text-white' : disabled ? 'text-slate-500' : color}`}></i>
        <span className="text-[8px] uppercase font-bold text-slate-400">{label}</span>
      </button>
  );

  return (
    <DraggablePanel title="Tools" initialPos={{ x: 16, y: 64 }} className="w-[88px]">
      <div className="flex flex-col gap-2 p-2 items-center">
        {/* DRAWING TOOLS */}
        <div className="grid grid-cols-1 gap-2 w-full">
            {tools.map((tool) => (
                <button
                key={tool.id}
                onClick={() => setTool(tool.id)}
                title={tool.label}
                className={`w-full h-10 rounded flex flex-col items-center justify-center transition-all ${
                    activeTool === tool.id
                    ? 'bg-blue-600 text-white shadow-lg ring-1 ring-blue-400'
                    : 'text-slate-400 hover:bg-slate-700 hover:text-white bg-slate-800/50'
                }`}
                >
                <i className={`fas ${tool.icon} text-sm mb-0.5`}></i>
                <span className="text-[8px] uppercase font-bold">{tool.id}</span>
                </button>
            ))}
        </div>
        
        <div className="h-px w-full bg-slate-700 my-1"></div>

        {/* EDIT ACTIONS */}
        <div className="grid grid-cols-2 gap-1 w-full">
            <ActionButton onClick={undo} disabled={!canUndo} icon="fa-undo" label="Undo" />
            <ActionButton onClick={redo} disabled={!canRedo} icon="fa-redo" label="Redo" />
        </div>
        
        <div className="h-px w-full bg-slate-700 my-1"></div>

        {/* FILE ACTIONS */}
        <div className="grid grid-cols-2 gap-1 w-full relative">
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
                    <div className="absolute left-full bottom-0 ml-2 w-40 bg-slate-800 border border-slate-600 rounded shadow-2xl z-50 p-1">
                        <div className="text-[9px] font-bold text-slate-500 px-2 py-1 uppercase tracking-wider">3D Model</div>
                        <button onClick={() => handleExportObj(false)} className="block w-full text-left px-3 py-2 text-[10px] text-slate-200 hover:bg-blue-600 rounded transition-colors">
                            <i className="fas fa-cube mr-2 text-slate-400"></i> All Objects (.obj)
                        </button>
                        <button onClick={() => handleExportObj(true)} className="block w-full text-left px-3 py-2 text-[10px] text-slate-200 hover:bg-blue-600 rounded transition-colors">
                            <i className="fas fa-cubes mr-2 text-slate-400"></i> Selected (.obj)
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

        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
      </div>
    </DraggablePanel>
  );
};

export default Toolbar;
    