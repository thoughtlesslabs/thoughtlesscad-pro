
import React, { useState, useRef, useEffect } from 'react';

interface DraggablePanelProps {
  title: string;
  initialPos: { x: number; y: number };
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

const DraggablePanel: React.FC<DraggablePanelProps> = ({ title, initialPos, children, className, onClose }) => {
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const [minimized, setMinimized] = useState(false);
  
  // Delta Drag Refs
  const startMouse = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    
    e.preventDefault();
    
    if (panelRef.current) {
        startMouse.current = { x: e.clientX, y: e.clientY };
        startPos.current = { x: panelRef.current.offsetLeft, y: panelRef.current.offsetTop };
        setIsDragging(true);
    }
  };

  const toggleMinimize = () => {
      setMinimized(!minimized);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && panelRef.current) {
        // Delta Math: NewPos = StartPos + (CurrentMouse - StartMouse)
        const dx = e.clientX - startMouse.current.x;
        const dy = e.clientY - startMouse.current.y;

        let newX = startPos.current.x + dx;
        let newY = startPos.current.y + dy;
        
        // Constraints
        const offsetParent = panelRef.current.offsetParent as HTMLElement;
        if (offsetParent) {
            const maxX = offsetParent.clientWidth - 50;
            const maxY = offsetParent.clientHeight - 30;
            
            // Keep at least a bit of the header on screen
            newX = Math.max(-panelRef.current.offsetWidth + 50, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));
        }

        // Direct DOM update for 60fps
        panelRef.current.style.left = `${newX}px`;
        panelRef.current.style.top = `${newY}px`;
      }
    };

    const handleMouseUp = () => {
        if (isDragging) {
            setIsDragging(false);
            if (panelRef.current) {
                setPos({ 
                    x: panelRef.current.offsetLeft, 
                    y: panelRef.current.offsetTop 
                });
            }
        }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Sync style with state when not dragging
  useEffect(() => {
      if (!isDragging && panelRef.current) {
          panelRef.current.style.left = `${pos.x}px`;
          panelRef.current.style.top = `${pos.y}px`;
      }
  }, [pos, isDragging]);

  return (
    <div 
      ref={panelRef}
      className={`absolute flex flex-col shadow-2xl border border-slate-600 rounded-lg bg-slate-800 z-40 overflow-visible ${className} ${minimized ? '!w-48 !h-auto' : ''}`}
      style={{ left: pos.x, top: pos.y }}
    >
      <div 
        className="h-8 bg-slate-700 cursor-move flex items-center justify-between px-3 border-b border-slate-600 select-none hover:bg-slate-600 transition-colors rounded-t-lg shrink-0"
        onMouseDown={handleMouseDown}
        onDoubleClick={toggleMinimize}
        title="Double-click to minimize/expand"
      >
        <div className="flex items-center gap-2 overflow-hidden">
            <i className={`fas ${minimized ? 'fa-chevron-right' : 'fa-grip-vertical'} text-slate-400 text-xs w-3 text-center`}></i>
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wide truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
             <button onClick={toggleMinimize} className="text-slate-400 hover:text-white focus:outline-none p-1">
                 <i className={`fas ${minimized ? 'fa-window-maximize' : 'fa-window-minimize'} text-[10px]`}></i>
             </button>
            {onClose && (
                <button onClick={onClose} className="text-slate-400 hover:text-white focus:outline-none ml-1 p-1">
                    <i className="fas fa-times"></i>
                </button>
            )}
        </div>
      </div>
      
      <div className={`bg-slate-800 rounded-b-lg ${minimized ? 'hidden' : 'block'}`}>
        {children}
      </div>
    </div>
  );
};

export default DraggablePanel;
