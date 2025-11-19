
import React from 'react';
import { Layer, Entity, PolygonEntity, LightEntity } from '../types';
import { TEXTURES } from '../constants';
import DraggablePanel from './DraggablePanel';
import { logger } from '../utils/debug';

interface PropertiesPanelProps {
  layers: Layer[];
  activeLayerId: string;
  setActiveLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  addLayer: () => void;
  deleteLayer: (id: string) => void;
  selectedEntities: Entity[];
  deleteSelected: () => void;
  onUpdateEntities: (entities: Entity[]) => void;
  addEntity: (e: Entity) => void;
  performBooleanSubtract: (keepPrimary: boolean) => void;
  performBooleanUnion: () => void;
  mobile?: boolean;
  mobileMode?: 'layers' | 'properties';
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  layers,
  activeLayerId,
  setActiveLayer,
  toggleLayerVisibility,
  addLayer,
  deleteLayer,
  selectedEntities,
  deleteSelected,
  onUpdateEntities,
  addEntity,
  performBooleanSubtract,
  performBooleanUnion,
  mobile,
  mobileMode = 'properties'
}) => {
  
  const handleValueChange = (key: string, val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (typeof val === 'string' && isNaN(num) && key !== 'color' && key !== 'operation' && key !== 'texture' && key !== 'name') return;
    
    const updates: Entity[] = [];
    selectedEntities.forEach(e => {
        let updated: any = { ...e, [key]: (key === 'color' || key === 'operation' || key === 'texture' || key === 'name') ? val : num };
        
        if (e.type === 'circle' || e.type === 'sphere') {
             if (key === 'radius') updated.radius = num;
             if (key === 'x') updated.center = { ...updated.center, x: num };
             if (key === 'y') updated.center = { ...updated.center, y: num };
        } else if (e.type === 'rectangle') {
             if (key === 'width' || key === 'height') updated[key] = num;
             if (key === 'x') updated.start = { ...updated.start, x: num };
             if (key === 'y') updated.start = { ...updated.start, y: num };
        } else if (e.type === 'line') {
             if (key === 'x') {
                 const dx = num - e.start.x;
                 updated.start = { ...e.start, x: num };
                 updated.end = { ...e.end, x: e.end.x + dx };
             }
             if (key === 'y') {
                 const dy = num - e.start.y;
                 updated.start = { ...e.start, y: num };
                 updated.end = { ...e.end, y: e.end.y + dy };
             }
        } else if (e.type === 'light') {
             if (key === 'x') {
                const dx = num - e.position.x;
                updated.position = { ...updated.position, x: num };
                updated.target = { ...updated.target, x: updated.target.x + dx };
             }
             if (key === 'y') {
                 const dy = num - e.position.y;
                 updated.position = { ...updated.position, y: num };
                 updated.target = { ...updated.target, y: updated.target.y + dy };
             }
             if (key === 'intensity') updated.intensity = num;
             if (key === 'distance') updated.distance = num;
        }
        
        updates.push(updated as Entity);
    });
    
    if (updates.length > 0) onUpdateEntities(updates);
  };

  const convertToPolygon = () => {
      if (selectedEntities.length !== 1) return;
      const ent = selectedEntities[0];
      let points: {x: number, y: number}[] = [];
      
      logger.log('PROPS', `Converting ${ent.type} to Polygon`);

      if (ent.type === 'rectangle') {
          points = [
              { x: ent.start.x, y: ent.start.y },
              { x: ent.start.x + ent.width, y: ent.start.y },
              { x: ent.start.x + ent.width, y: ent.start.y + ent.height },
              { x: ent.start.x, y: ent.start.y + ent.height },
          ];
      } else if (ent.type === 'circle') {
          const segments = 128; 
          for(let i=0; i<segments; i++) {
              const theta = (i / segments) * Math.PI * 2;
              points.push({
                  x: ent.center.x + Math.cos(theta) * ent.radius,
                  y: ent.center.y + Math.sin(theta) * ent.radius
              });
          }
      } else {
          return;
      }

      const poly: PolygonEntity = {
          ...ent,
          type: 'polygon',
          points: points
      } as any;
      
      deleteSelected();
      addEntity(poly);
  };

  const primaryEntity = selectedEntities.length > 0 ? selectedEntities[selectedEntities.length - 1] : null;
  const getPrimaryPos = (e: Entity) => {
      if (e.type === 'rectangle' || e.type === 'line') return e.start;
      if (e.type === 'circle' || e.type === 'sphere') return e.center;
      if (e.type === 'polygon') return e.points[0];
      if (e.type === 'light') return e.position;
      return { x: 0, y: 0 };
  }
  const primaryPos = primaryEntity ? getPrimaryPos(primaryEntity) : { x: 0, y: 0 };
  
  const baseCount = selectedEntities.filter(e => e.isBase).length;

  const LayerContent = (
      <div className={`overflow-y-auto p-3 space-y-2 ${mobile ? 'bg-slate-900 pointer-events-auto relative z-50' : 'border-b border-slate-700 max-h-[160px]'}`}>
        {layers.map((layer) => (
          <div
            key={layer.id}
            className={`flex items-center p-2 rounded cursor-pointer text-sm relative z-10 pointer-events-auto ${
              activeLayerId === layer.id ? 'bg-blue-900/50 border border-blue-500/50' : 'hover:bg-slate-700'
            }`}
            onClick={() => setActiveLayer(layer.id)}
            style={{ touchAction: 'manipulation' }}
          >
            <button
              className={`mr-3 w-4 pointer-events-auto relative z-20 ${layer.visible ? 'text-slate-300' : 'text-slate-600'}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleLayerVisibility(layer.id);
              }}
              style={{ touchAction: 'manipulation' }}
            >
              <i className={`fas ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}`}></i>
            </button>
            
            <div className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: layer.color }}></div>
            <span className="flex-1 truncate text-slate-200">{layer.name}</span>
            
            {activeLayerId === layer.id ? (
                 <i className="fas fa-check text-blue-400 text-xs ml-2"></i>
            ) : (
                 <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} className="ml-2 text-slate-600 hover:text-red-400 transition-colors px-1 pointer-events-auto relative z-20" style={{ touchAction: 'manipulation' }}>
                     <i className="fas fa-trash-alt text-xs"></i>
                 </button>
            )}
          </div>
        ))}
        <button
          onClick={addLayer}
          className="w-full mt-2 py-1.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm transition-colors pointer-events-auto relative z-20"
          style={{ touchAction: 'manipulation' }}
        >
          <i className="fas fa-plus mr-2"></i> Add Layer
        </button>
      </div>
  );

  const PropertiesContent = (
      <div className={`p-4 overflow-y-auto ${mobile ? 'bg-slate-900 pointer-events-auto relative z-50' : ''}`}>
         {selectedEntities.length === 0 ? (
           <div className="text-slate-500 text-sm italic text-center py-8">No objects selected</div>
         ) : (
           <div className="space-y-4 relative z-10">
             <div className="text-sm text-slate-300 flex justify-between items-center border-b border-slate-700 pb-2">
                <span className="font-semibold text-white">{selectedEntities.length} Selected</span>
                {primaryEntity && <span className="text-slate-400 bg-slate-900 px-2 py-0.5 rounded text-xs uppercase">{primaryEntity.type}</span>}
             </div>

             {/* Object Naming */}
             {primaryEntity && (
                 <div>
                    <label className="text-xs font-medium text-slate-400 block mb-1">Name</label>
                    <input type="text" 
                        className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full focus:border-blue-500 outline-none pointer-events-auto relative z-20"
                        value={primaryEntity.name || ''} 
                        placeholder={primaryEntity.type}
                        onChange={(e) => handleValueChange('name', e.target.value)}
                        style={{ touchAction: 'manipulation' }}
                    />
                 </div>
             )}

             {/* Boolean Buttons */}
             {selectedEntities.length >= 2 && (
                 <div className="flex flex-col gap-2 p-2 bg-slate-800 rounded border border-slate-600">
                     <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase">Modeling</span>
                        {baseCount > 0 ? 
                            <span className="text-[10px] text-green-400 font-bold">Base Defined ({baseCount})</span> : 
                            <span className="text-[10px] text-red-400">Click to Set Base</span>
                        }
                     </div>
                     
                     <button onClick={() => performBooleanSubtract(true)} disabled={baseCount === 0} className={`w-full py-2 px-3 rounded text-xs flex items-center justify-between shadow group pointer-events-auto relative z-20 ${baseCount > 0 ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`} style={{ touchAction: 'manipulation' }}>
                         <div className="flex flex-col items-start">
                            <span className="font-bold">Subtract Selection</span>
                            <span className="text-[9px] opacity-70">Others cut from Base</span>
                         </div>
                         <i className="fas fa-moon"></i>
                     </button>
                     
                     <button onClick={performBooleanUnion} className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-2 px-3 rounded text-xs flex items-center justify-between shadow pointer-events-auto relative z-20" style={{ touchAction: 'manipulation' }}>
                         <span className="font-bold">Merge / Union</span>
                         <i className="fas fa-object-group"></i>
                     </button>
                 </div>
             )}
             
             {/* Coords */}
             <div className="grid grid-cols-2 gap-3">
                <div className="col-span-1">
                    <label className="text-xs font-medium text-slate-400 block mb-1">X Pos</label>
                    <input type="number" className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full focus:border-blue-500 outline-none pointer-events-auto relative z-20"
                        value={Math.round(primaryPos.x * 100) / 100} onChange={(e) => handleValueChange('x', e.target.value)} style={{ touchAction: 'manipulation' }} />
                </div>
                <div className="col-span-1">
                    <label className="text-xs font-medium text-slate-400 block mb-1">Y Pos</label>
                    <input type="number" className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full focus:border-blue-500 outline-none pointer-events-auto relative z-20"
                        value={Math.round(primaryPos.y * 100) / 100} onChange={(e) => handleValueChange('y', e.target.value)} style={{ touchAction: 'manipulation' }} />
                </div>
             </div>

             {/* Light Properties */}
             {primaryEntity?.type === 'light' && (
                 <div className="space-y-3 border-t border-slate-700 pt-3">
                     <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Light Properties</label>
                     <div>
                        <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Intensity</span><span>{primaryEntity.intensity}</span></div>
                        <input type="range" min="0.1" max="5" step="0.1" className="w-full accent-yellow-400 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer pointer-events-auto relative z-20"
                            value={primaryEntity.intensity} onChange={(e) => handleValueChange('intensity', e.target.value)} style={{ touchAction: 'manipulation' }} />
                     </div>
                     <div>
                        <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Range</span><span>{primaryEntity.distance}</span></div>
                        <input type="range" min="10" max="500" step="10" className="w-full accent-yellow-400 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer pointer-events-auto relative z-20"
                            value={primaryEntity.distance} onChange={(e) => handleValueChange('distance', e.target.value)} style={{ touchAction: 'manipulation' }} />
                     </div>
                     <div>
                        <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Elevation (Z)</span><span>{primaryEntity.elevation || 0}</span></div>
                        <input type="number" className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full pointer-events-auto relative z-20"
                            value={primaryEntity.elevation || 0} onChange={(e) => handleValueChange('elevation', e.target.value)} style={{ touchAction: 'manipulation' }} />
                     </div>
                      <div className="flex items-center gap-3 pt-1">
                        <input type="color" className="h-6 w-10 bg-transparent border-0 p-0 cursor-pointer rounded overflow-hidden pointer-events-auto relative z-20" 
                            value={primaryEntity.color || '#ffffff'} 
                            onChange={(e) => handleValueChange('color', e.target.value)}
                            style={{ touchAction: 'manipulation' }}
                        />
                        <span className="text-sm text-slate-300">Light Color</span>
                     </div>
                 </div>
             )}

             {/* 3D Geometry */}
             {primaryEntity?.type !== 'light' && primaryEntity && (
                 <>
                     <div className="grid grid-cols-2 gap-3 bg-slate-800 p-3 rounded border border-slate-700">
                        <label className="text-xs font-bold text-slate-300 col-span-2 uppercase tracking-wide">3D Properties</label>
                        
                        <div className="col-span-1">
                            <label className="text-xs font-medium text-slate-500 block mb-1">{primaryEntity.type === 'sphere' ? 'Radius' : 'Extrude'}</label>
                            <input type="number" className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full focus:border-blue-500 outline-none pointer-events-auto relative z-20"
                                value={primaryEntity.type === 'sphere' ? (primaryEntity as any).radius : (primaryEntity.extrusionDepth || 0)} 
                                onChange={(e) => handleValueChange(primaryEntity.type === 'sphere' ? 'radius' : 'extrusionDepth', e.target.value)} style={{ touchAction: 'manipulation' }} />
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs font-medium text-slate-500 block mb-1">Elevation (Z)</label>
                            <input type="number" className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full focus:border-blue-500 outline-none pointer-events-auto relative z-20"
                                value={primaryEntity.elevation || 0} onChange={(e) => handleValueChange('elevation', e.target.value)} style={{ touchAction: 'manipulation' }} />
                        </div>
                     </div>
                     
                     <div className="space-y-3 border-t border-slate-700 pt-3">
                         <div className="flex items-center gap-3">
                            <input type="color" className="h-6 w-10 bg-transparent border-0 p-0 cursor-pointer rounded overflow-hidden pointer-events-auto relative z-20" 
                                value={primaryEntity.color || '#ffffff'} 
                                onChange={(e) => handleValueChange('color', e.target.value)}
                                style={{ touchAction: 'manipulation' }}
                            />
                            <span className="text-sm text-slate-300">Base Color</span>
                         </div>
                         
                         {/* Texture */}
                         <div>
                             <label className="text-xs font-medium text-slate-400 block mb-1">Texture</label>
                             <select 
                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full focus:border-blue-500 outline-none pointer-events-auto relative z-20"
                                value={primaryEntity.texture || 'none'}
                                onChange={(e) => handleValueChange('texture', e.target.value)}
                                style={{ touchAction: 'manipulation' }}
                             >
                                 {TEXTURES.map(t => (
                                     <option key={t.id} value={t.id}>{t.label}</option>
                                 ))}
                             </select>
                         </div>

                         <div>
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>Roughness</span>
                                <span>{primaryEntity.roughness}</span>
                            </div>
                            <input type="range" min="0" max="1" step="0.1" className="w-full accent-blue-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer pointer-events-auto relative z-20"
                                value={primaryEntity.roughness || 0.5} onChange={(e) => handleValueChange('roughness', e.target.value)} style={{ touchAction: 'manipulation' }} />
                         </div>
                         
                         <div>
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>Metalness</span>
                                <span>{primaryEntity.metalness}</span>
                            </div>
                            <input type="range" min="0" max="1" step="0.1" className="w-full accent-blue-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer pointer-events-auto relative z-20"
                                value={primaryEntity.metalness || 0.1} onChange={(e) => handleValueChange('metalness', e.target.value)} style={{ touchAction: 'manipulation' }} />
                         </div>
                     </div>
                </>
             )}

             {/* Specific Properties */}
             {selectedEntities.length === 1 && primaryEntity && primaryEntity.type !== 'light' && primaryEntity.type !== 'sphere' && (
                 <div className="border-t border-slate-700 pt-3 mt-2 space-y-2">
                    {primaryEntity.type === 'rectangle' && (
                        <div className="grid grid-cols-2 gap-3">
                            <input type="number" placeholder="W" className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full pointer-events-auto relative z-20"
                                value={(primaryEntity as any).width} onChange={(e) => handleValueChange('width', e.target.value)} style={{ touchAction: 'manipulation' }} />
                            <input type="number" placeholder="H" className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full pointer-events-auto relative z-20"
                                value={(primaryEntity as any).height} onChange={(e) => handleValueChange('height', e.target.value)} style={{ touchAction: 'manipulation' }} />
                        </div>
                    )}
                    {primaryEntity.type === 'circle' && (
                         <div className="grid grid-cols-2 gap-3">
                             <label className="text-xs text-slate-400 flex items-center">Radius</label>
                             <input type="number" className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full pointer-events-auto relative z-20"
                                value={(primaryEntity as any).radius} onChange={(e) => handleValueChange('radius', e.target.value)} style={{ touchAction: 'manipulation' }} />
                        </div>
                    )}
                    <button onClick={convertToPolygon} className="w-full text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded pointer-events-auto relative z-20" style={{ touchAction: 'manipulation' }}>
                        Convert to Polygon
                    </button>
                 </div>
             )}

             <button
               onClick={deleteSelected}
               className="w-full mt-6 py-2 px-3 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 pointer-events-auto relative z-20"
               style={{ touchAction: 'manipulation' }}
             >
               <i className="fas fa-trash-alt"></i> Delete Selected
             </button>
           </div>
         )}
      </div>
  );

  if (mobile) {
      return (
          <div className="flex flex-col h-full w-full pointer-events-auto">
             {/* Mobile Tab Switcher for Layers vs Properties */}
             <div className="h-full overflow-auto">
                 {mobileMode === 'layers' ? LayerContent : PropertiesContent} 
             </div>
          </div>
      )
  }

  return (
    <DraggablePanel title="Properties" initialPos={{ x: window.innerWidth - 300, y: 64 }} className="w-72 max-h-[calc(100vh-6rem)]">
      <div className="p-3 bg-slate-900/50 border-b border-slate-700">
        <h2 className="font-bold text-sm text-slate-400 uppercase"><i className="fas fa-layer-group mr-2"></i> Layers</h2>
      </div>
      
      {LayerContent}
      {PropertiesContent}
    </DraggablePanel>
  );
};

export default PropertiesPanel;
