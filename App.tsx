
import React, { useState, useReducer, useEffect, useCallback, useRef } from 'react';
import Canvas2D from './components/Canvas2D';
import Viewport3D, { Viewport3DHandle } from './components/Viewport3D';
import Toolbar from './components/Toolbar';
import PropertiesPanel from './components/PropertiesPanel';
import DraggablePanel from './components/DraggablePanel';
import { backend } from './services/mockBackend';
import { Entity, Layer, ToolType, ViewState, PolygonEntity, ViewType, ProjectData } from './types';
import { DEFAULT_LAYERS } from './constants';
import { booleanSubtract, booleanUnion, generateId, convertToPoints } from './utils/geometry';
import { logger } from './utils/debug';

// --- Reducer for Undo/Redo ---
type HistoryState = {
  past: Entity[][];
  present: Entity[];
  future: Entity[][];
};

type Action = 
  | { type: 'PUSH_STATE'; payload: Entity[] }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'LOAD'; payload: Entity[] };

const historyReducer = (state: HistoryState, action: Action): HistoryState => {
  switch (action.type) {
    case 'PUSH_STATE':
      if (JSON.stringify(state.present) === JSON.stringify(action.payload)) return state;
      return {
        past: [...state.past, state.present],
        present: action.payload,
        future: [],
      };
    case 'UNDO':
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, state.past.length - 1);
      return {
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
      };
    case 'REDO':
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      };
    case 'LOAD':
      return {
        past: [],
        present: action.payload,
        future: [],
      };
    default:
      return state;
  }
};

const Logo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-500 drop-shadow-lg">
    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 12V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 12L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 17L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

interface NewProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string) => void;
    hasUnsavedChanges: boolean;
}

const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose, onConfirm, hasUnsavedChanges }) => {
    const [name, setName] = useState('New Project');
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-96 p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <i className="fas fa-file-medical text-blue-400"></i> Create New Project
                </h2>
                
                {hasUnsavedChanges && (
                    <div className="bg-red-900/30 border border-red-500/30 text-red-200 text-xs p-3 rounded mb-4 flex gap-2 items-start">
                        <i className="fas fa-exclamation-triangle mt-0.5"></i>
                        <span>Warning: Creating a new project will discard all current unsaved changes in your workspace.</span>
                    </div>
                )}

                <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Project Name</label>
                    <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 outline-none"
                        autoFocus
                    />
                </div>

                <div className="flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => onConfirm(name)}
                        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-lg transition-colors"
                    >
                        Create Project
                    </button>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  // App State
  const [activeTool, setActiveTool] = useState<ToolType>('line');
  // Individual View States - Start centered
  const [viewTop, setViewTop] = useState<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [viewFront, setViewFront] = useState<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [viewRight, setViewRight] = useState<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });

  const [activeSingleView, setActiveSingleView] = useState<ViewType>('top');

  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState<string>(DEFAULT_LAYERS[0].id);
  
  // Scene Settings
  const [ambientIntensity, setAmbientIntensity] = useState(0.8);
  const [showGrid, setShowGrid] = useState(true);
  
  // Project Management
  const [projectKey, setProjectKey] = useState(0); // Used to force re-mount of Canvas on new project
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  // History Manager
  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: [],
    future: [],
  });

  const entities = history.present;

  // UI State
  const [viewMode, setViewMode] = useState<'quad' | 'single'>('quad');
  const [isSaving, setIsSaving] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState('Untitled Project');

  const viewportRef = useRef<Viewport3DHandle>(null);

  // --- Actions ---

  const handleAddEntity = (entity: Entity) => {
    const deselectedEntities = entities.map(e => ({ ...e, selected: false, isBase: false }));
    dispatch({ type: 'PUSH_STATE', payload: [...deselectedEntities, { ...entity, selected: true }] });
  };

  const handleUpdateEntities = (updatedEntities: Entity[]) => {
    if (updatedEntities.length === 0) return;
    const updateMap = new Map(updatedEntities.map(e => [e.id, e]));
    const newEntities = entities.map(e => updateMap.has(e.id) ? updateMap.get(e.id)! : e);
    dispatch({ type: 'PUSH_STATE', payload: newEntities });
  };

  const handleSelectionChange = (ids: string[]) => {
    const newEntities = entities.map(e => ({
      ...e,
      selected: ids.includes(e.id)
    }));
    dispatch({ type: 'PUSH_STATE', payload: newEntities });
  };

  const handleDeleteSelected = () => {
    const newEntities = entities.filter(e => !e.selected);
    dispatch({ type: 'PUSH_STATE', payload: newEntities });
  };
  
  const handleDeleteLayer = (layerId: string) => {
      if (layers.length <= 1) {
          alert("Cannot delete the last remaining layer.");
          return;
      }
      if (layerId === activeLayerId) {
          alert("Cannot delete the active layer. Please switch to another layer first.");
          return;
      }

      const entityCount = entities.filter(e => e.layerId === layerId).length;
      if (entityCount > 0) {
          // Standard window confirm is safe in click handlers
          if (!window.confirm(`This layer contains ${entityCount} objects. Deleting it will remove them permanently. Are you sure?`)) {
              return;
          }
      }

      // Remove entities
      const newEntities = entities.filter(e => e.layerId !== layerId);
      if (newEntities.length !== entities.length) {
          dispatch({ type: 'PUSH_STATE', payload: newEntities });
      }

      // Remove layer
      setLayers(layers.filter(l => l.id !== layerId));
      logger.log('LAYER', `Deleted layer ${layerId}`);
  };

  const performBooleanSubtract = (keepPrimary: boolean) => {
      const selected = entities.filter(e => e.selected && !['light'].includes(e.type));
      if(selected.length < 2) return;

      const bases = selected.filter(e => e.isBase);
      const cutters = selected.filter(e => !e.isBase);

      if (bases.length === 0) {
          alert("Please select at least one shape as Base (Click on it again to turn Green)");
          return;
      }

      const resultPolys: Entity[] = [];

      // For each base, subtract ALL cutters
      bases.forEach(base => {
          // Convert base to polygon points explicitly first
          let shapes: { points: any[], holes: any[] }[] = [{
              points: convertToPoints(base),
              holes: (base as any).holes || []
          }];

          cutters.forEach(cutter => {
              const nextShapes: { points: any[], holes: any[] }[] = [];
              
              shapes.forEach(shape => {
                   // Temporary entity to pass to booleanSubtract
                   const tempBase: any = { ...base, type: 'polygon', points: shape.points, holes: shape.holes };
                   const res = booleanSubtract(tempBase, cutter);
                   
                   if (res.polys.length > 0) {
                       res.polys.forEach(p => {
                           nextShapes.push({ points: p, holes: res.holes });
                       });
                   }
              });
              shapes = nextShapes;
          });
          
          // Create entities for all resulting fragments
          shapes.forEach(shape => {
              const newPoly: PolygonEntity = {
                ...base,
                id: generateId(),
                type: 'polygon',
                points: shape.points,
                holes: shape.holes,
                selected: true,
                isBase: false,
                extrusionDepth: base.type === 'sphere' ? (base as any).radius * 2 : base.extrusionDepth
            } as any;
            resultPolys.push(newPoly);
          });
      });

      const idsToRemove = selected.map(e => e.id);
      const remaining = entities.filter(e => !idsToRemove.includes(e.id));
      dispatch({ type: 'PUSH_STATE', payload: [...remaining, ...resultPolys] });
      logger.log('APP', `Boolean Subtract Complete. Generated ${resultPolys.length} fragments.`);
  };

  const performBooleanUnion = () => {
      const selected = entities.filter(e => e.selected && !['light'].includes(e.type));
      if(selected.length < 2) return;
      
      const result = booleanUnion(selected);
      const primary = selected[selected.length - 1];
      
      const newPoly: PolygonEntity = {
          ...primary,
          id: generateId(),
          type: 'polygon',
          points: result.points,
          holes: result.holes,
          selected: true,
          isBase: false
      } as any;
      
      const idsToRemove = selected.map(e => e.id);
      const remaining = entities.filter(e => !idsToRemove.includes(e.id));
      dispatch({ type: 'PUSH_STATE', payload: [...remaining, newPoly] });
  }

  const handleSaveFile = () => {
    logger.log('FILE', 'Saving Project...');
    setIsSaving(true);
    try {
        const projectData: ProjectData = {
            id: 'project-1',
            name: currentProjectName,
            entities: entities,
            layers: layers,
            lastModified: Date.now()
        };
        const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentProjectName.replace(/\s+/g, '_')}.cad.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        logger.log('FILE', 'Project Saved');
    } catch(e: any) {
        console.error("Save failed", e);
        logger.error('FILE', 'Save Failed', e.message);
        alert("Could not save project file.");
    }
    setIsSaving(false);
  };
  
  const handleLoadFile = (file: File) => {
      logger.log('FILE', 'Loading Project...', file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const content = e.target?.result as string;
              const data = JSON.parse(content) as ProjectData;
              if (data.entities && Array.isArray(data.entities)) {
                  dispatch({ type: 'LOAD', payload: data.entities });
                  if (data.layers) setLayers(data.layers);
                  if (data.name) setCurrentProjectName(data.name);
                  setProjectKey(prev => prev + 1); // Force canvas reset
                  logger.log('FILE', 'Project Loaded');
              } else {
                  alert("Invalid project file format.");
              }
          } catch (err) {
              console.error(err);
              alert("Failed to parse project file.");
          }
      };
      reader.readAsText(file);
  };

  const confirmNewProject = (name: string) => {
      setCurrentProjectName(name);
      dispatch({ type: 'LOAD', payload: [] });
      setLayers(DEFAULT_LAYERS);
      setActiveLayerId(DEFAULT_LAYERS[0].id);
      setActiveTool('select');
      setProjectKey(prev => prev + 1);
      setShowNewProjectModal(false);
      logger.log('FILE', 'New Project Created', name);
  };

  const handleNewProject = () => {
      logger.log('FILE', 'New Project Requested (Opening Modal)');
      setShowNewProjectModal(true);
  };

  const handleLoad = useCallback(async () => {
    const projects = await backend.getProjects();
    if(projects.length > 0) {
        const p = projects[0];
        dispatch({ type: 'LOAD', payload: p.entities });
        if(p.layers.length > 0) setLayers(p.layers);
        setCurrentProjectName(p.name);
    }
  }, []);

  useEffect(() => {
    handleLoad();
  }, [handleLoad]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if (e.key === 'Escape') {
        setActiveTool('select');
        handleSelectionChange([]);
        setShowNewProjectModal(false);
      } else if (e.key.toLowerCase() === 'l') setActiveTool('line');
      else if (e.key.toLowerCase() === 'r') setActiveTool('rectangle');
      else if (e.key.toLowerCase() === 'c') setActiveTool('circle');
      else if (e.key.toLowerCase() === 'p') setActiveTool('polygon');
      else if (e.key.toLowerCase() === 'v') setActiveTool('select');
      else if (e.key.toLowerCase() === 'h') setActiveTool('pan');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [entities]);

  const selectedEntities = entities.filter(e => e.selected);

  const renderCanvas = (type: ViewType, viewState: ViewState, setViewState: any) => (
      <div className="w-full h-full border border-slate-700 relative flex flex-col">
         <div className="absolute top-2 left-2 text-[10px] text-slate-400 pointer-events-none select-none bg-slate-900/80 px-2 py-1 rounded z-10 uppercase font-bold border border-slate-700">
            {type} View | {viewState.scale.toFixed(2)}x
         </div>
         <div className="flex-1 relative">
            {/* Key prop forces full re-mount on project reset */}
            <Canvas2D 
                key={`canvas-${projectKey}-${type}`}
                entities={entities}
                activeTool={activeTool}
                view={viewState}
                setView={setViewState}
                onEntityAdd={handleAddEntity}
                onEntitiesUpdate={handleUpdateEntities}
                onSelectionChange={handleSelectionChange}
                activeLayerId={activeLayerId}
                layers={layers}
                viewType={type}
            />
         </div>
      </div>
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      {/* Top Bar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-6 justify-between shrink-0 z-30 shadow-xl relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:20px_20px] opacity-20 pointer-events-none"></div>
        
        <div className="flex items-center gap-4 z-10">
          <Logo />
          <div>
             <h1 className="font-bold text-slate-100 text-lg tracking-tight leading-none">
                ThoughtlessCAD <span className="text-blue-500">Pro</span>
             </h1>
             <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Professional Modeling Suite</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4 z-10">
            <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button 
                onClick={() => setViewMode('single')}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded transition-all ${viewMode === 'single' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            >Single</button>
            <button 
                onClick={() => setViewMode('quad')}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded transition-all ${viewMode === 'quad' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            >Quad</button>
            </div>
            <div className="h-6 w-px bg-slate-700"></div>
            <input 
                type="text" 
                value={currentProjectName} 
                onChange={(e) => setCurrentProjectName(e.target.value)}
                className="bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 text-xs text-slate-400 font-mono outline-none w-40 text-center transition-colors"
            />
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 relative flex overflow-hidden">
        
        <Toolbar 
            activeTool={activeTool} 
            setTool={setActiveTool} 
            undo={() => dispatch({ type: 'UNDO' })}
            redo={() => dispatch({ type: 'REDO' })}
            save={handleSaveFile}
            onNewProject={handleNewProject}
            onLoadFile={handleLoadFile}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            isSaving={isSaving}
            entities={entities}
            onExportImage={() => viewportRef.current?.triggerScreenshot()}
        />

        <PropertiesPanel 
            layers={layers}
            activeLayerId={activeLayerId}
            setActiveLayer={setActiveLayerId}
            toggleLayerVisibility={(id) => setLayers(layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l))}
            addLayer={() => setLayers([...layers, { id: `layer-${Date.now()}`, name: 'New Layer', color: '#'+Math.floor(Math.random()*16777215).toString(16), visible: true, locked: false }])}
            deleteLayer={handleDeleteLayer}
            selectedEntities={selectedEntities}
            deleteSelected={handleDeleteSelected}
            onUpdateEntities={handleUpdateEntities}
            addEntity={handleAddEntity}
            performBooleanSubtract={performBooleanSubtract}
            performBooleanUnion={performBooleanUnion}
        />

        <DraggablePanel title="Scene Settings" initialPos={{ x: window.innerWidth - 260, y: window.innerHeight - 220 }} className="w-60">
             <div className="p-4 space-y-5">
                 <div>
                    <div className="flex justify-between text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">
                        <span>Ambient Intensity</span>
                        <span className="text-white">{ambientIntensity.toFixed(1)}</span>
                    </div>
                    <input type="range" min="0" max="3" step="0.1" className="w-full accent-blue-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        value={ambientIntensity} onChange={(e) => setAmbientIntensity(parseFloat(e.target.value))} />
                 </div>
                 
                 <div className="flex items-center justify-between">
                     <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Show Grid</span>
                     <button onClick={() => setShowGrid(!showGrid)} className={`w-10 h-5 rounded-full relative transition-all ${showGrid ? 'bg-blue-600' : 'bg-slate-700 border border-slate-600'}`}>
                         <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${showGrid ? 'translate-x-5' : 'translate-x-0'}`}></div>
                     </button>
                 </div>
             </div>
        </DraggablePanel>

        {/* Viewport Container */}
        <div className="flex-1 bg-black relative flex">
            {viewMode === 'single' ? (
                <div className="w-full h-full flex flex-row">
                    {/* Left Side: 2D View with Tabs */}
                    <div className="w-1/2 h-full border-r border-slate-800 flex flex-col bg-slate-900">
                        {/* Tab Bar */}
                        <div className="flex border-b border-slate-800 bg-slate-900">
                             {['top', 'front', 'right'].map((t) => (
                                 <button 
                                    key={t} 
                                    onClick={() => setActiveSingleView(t as ViewType)}
                                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeSingleView === t ? 'border-blue-500 text-blue-400 bg-slate-800/50' : 'border-transparent text-slate-600 hover:text-slate-300 hover:bg-slate-800'}`}
                                 >
                                     {t}
                                 </button>
                             ))}
                        </div>
                        <div className="flex-1 relative">
                            {activeSingleView === 'top' && renderCanvas('top', viewTop, setViewTop)}
                            {activeSingleView === 'front' && renderCanvas('front', viewFront, setViewFront)}
                            {activeSingleView === 'right' && renderCanvas('right', viewRight, setViewRight)}
                        </div>
                    </div>
                    
                    {/* Right Side: 3D View */}
                    <div className="w-1/2 h-full relative">
                         <Viewport3D ref={viewportRef} entities={entities} layers={layers} ambientIntensity={ambientIntensity} showGrid={showGrid} />
                    </div>
                </div>
            ) : (
                <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px bg-slate-800">
                    <div className="relative bg-slate-900">
                        {renderCanvas('top', viewTop, setViewTop)}
                    </div>
                    <div className="relative bg-slate-900">
                         <Viewport3D ref={viewportRef} entities={entities} layers={layers} ambientIntensity={ambientIntensity} showGrid={showGrid} />
                    </div>
                    <div className="relative bg-slate-900">
                         {renderCanvas('front', viewFront, setViewFront)}
                    </div>
                    <div className="relative bg-slate-900">
                         {renderCanvas('right', viewRight, setViewRight)}
                    </div>
                </div>
            )}
        </div>

        {/* MODAL */}
        <NewProjectModal 
            isOpen={showNewProjectModal} 
            onClose={() => setShowNewProjectModal(false)} 
            onConfirm={confirmNewProject}
            hasUnsavedChanges={entities.length > 0}
        />

      </div>
    </div>
  );
};

export default App;
