
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Entity, Point, ViewState, ToolType, Layer, BaseEntity, EntityType, ViewType, PolygonEntity, LightEntity } from '../types';
import { screenToWorld, worldToScreen, snapPoint, distance, getRectPoints, generateId, getEntityHandles, isPointInEntity, Handle, mapEntityToView, getDelta3D, getBounds, doRectsIntersect, distanceToSegment } from '../utils/geometry';
import { GRID_SIZE, GRID_COLOR_MAJOR, GRID_COLOR_MINOR, BACKGROUND_COLOR, SELECTION_COLOR, HIGHLIGHT_COLOR } from '../constants';
import { logger } from '../utils/debug';

interface Canvas2DProps {
  entities: Entity[];
  activeTool: ToolType;
  view: ViewState;
  setView: (v: ViewState | ((prev: ViewState) => ViewState)) => void;
  onEntityAdd: (e: Entity) => void;
  onEntitiesUpdate: (e: Entity[]) => void;
  onSelectionChange: (ids: string[]) => void;
  activeLayerId: string;
  layers: Layer[];
  viewType: ViewType;
}

const Canvas2D: React.FC<Canvas2DProps> = ({
  entities,
  activeTool,
  view,
  setView,
  onEntityAdd,
  onEntitiesUpdate,
  onSelectionChange,
  activeLayerId,
  layers,
  viewType
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [activeHandle, setActiveHandle] = useState<{ entityId: string, handle: Handle } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{start: Point, end: Point} | null>(null);
  const [previewEntities, setPreviewEntities] = useState<Map<string, Entity>>(new Map());
  const [movingOrigins, setMovingOrigins] = useState<{ id: string, original: Entity }[] | null>(null);
  const [tempEntity, setTempEntity] = useState<Entity | null>(null);
  const [polyPoints, setPolyPoints] = useState<Point[]>([]);
  const [clickStartPos, setClickStartPos] = useState<Point | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<Point | null>(null);

  const getLayerColor = (layerId: string) => layers.find(l => l.id === layerId)?.color || '#fff';
  const isLayerVisible = (layerId: string) => layers.find(l => l.id === layerId)?.visible ?? true;

  // Cleanup stale state if entities list is reset
  useEffect(() => {
      if (entities.length === 0) {
          setPreviewEntities(new Map());
          setMovingOrigins(null);
          setActiveHandle(null);
          setCurrentAction(null);
          setTempEntity(null);
          setPolyPoints([]);
      }
  }, [entities.length]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if(e.code === 'Space' && !e.repeat) {
              if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
              e.preventDefault();
              setIsSpacePanning(true);
          }
          if (e.key === 'Enter' && activeTool === 'polygon' && polyPoints.length >= 3) {
             finishPolygon();
          }
      }
      const handleKeyUp = (e: KeyboardEvent) => {
          if(e.code === 'Space') {
              e.preventDefault();
              setIsSpacePanning(false);
          }
      }
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      }
  }, [polyPoints, activeTool]);

  useEffect(() => {
      if (canvasRef.current && view.offsetX === 0 && view.offsetY === 0) {
           const rect = canvasRef.current.getBoundingClientRect();
           setView(prev => ({
               ...prev,
               offsetX: rect.width / 2,
               offsetY: rect.height / 2
           }));
      }
  }, []);

  const finishPolygon = () => {
      if (polyPoints.length < 3) return;
      const baseEntity: PolygonEntity = {
        id: generateId(),
        layerId: activeLayerId,
        selected: true,
        type: 'polygon',
        extrusionDepth: 20,
        elevation: 0,
        roughness: 0.5,
        metalness: 0.1,
        operation: 'solid',
        points: [...polyPoints]
      };
      onEntityAdd(baseEntity);
      setPolyPoints([]);
      logger.log('CANVAS', 'Polygon finished');
  }

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const startWorld = screenToWorld(0, 0, view, viewType);
    const endWorld = screenToWorld(canvas.width, canvas.height, view, viewType);
    
    const left = Math.floor(startWorld.x / GRID_SIZE) * GRID_SIZE;
    const top = Math.floor(startWorld.y / GRID_SIZE) * GRID_SIZE;
    const right = Math.ceil(endWorld.x / GRID_SIZE) * GRID_SIZE;
    const bottom = Math.ceil(endWorld.y / GRID_SIZE) * GRID_SIZE;

    ctx.lineWidth = 1;
    for (let x = left; x <= right; x += GRID_SIZE) {
      const screenX = worldToScreen(x, 0, view).x;
      ctx.beginPath();
      ctx.strokeStyle = x === 0 ? '#ef4444' : (x % (GRID_SIZE * 5) === 0 ? GRID_COLOR_MAJOR : GRID_COLOR_MINOR);
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, canvas.height);
      ctx.stroke();
    }
    for (let y = top; y <= bottom; y += GRID_SIZE) {
      const screenY = worldToScreen(0, y, view).y;
      ctx.beginPath();
      ctx.strokeStyle = y === 0 ? '#22c55e' : (y % (GRID_SIZE * 5) === 0 ? GRID_COLOR_MAJOR : GRID_COLOR_MINOR);
      ctx.moveTo(0, screenY);
      ctx.lineTo(canvas.width, screenY);
      ctx.stroke();
    }

    const drawEntity = (entity: Entity, colorOverride?: string) => {
        // Safety check for missing layer (e.g. during new project reset)
        if (!entity || !entity.layerId) return;

        if (!isLayerVisible(entity.layerId) && !colorOverride && !entity.selected) return;
        
        const mapped = mapEntityToView(entity, viewType);
        if (!mapped) return;

        ctx.beginPath();
        
        let color = colorOverride;
        if (!color) {
            if (entity.isBase) color = '#10b981'; 
            else if (entity.selected) color = SELECTION_COLOR;
            else color = entity.color || getLayerColor(entity.layerId);
        }
        
        ctx.strokeStyle = color!;
        ctx.lineWidth = entity.selected || entity.isBase ? 2 : 1;
        
        if (entity.operation === 'cut') ctx.setLineDash([5, 5]); 
        else ctx.setLineDash([]);

        if (mapped.type === 'line') {
            const start = worldToScreen(mapped.start.x, mapped.start.y, view);
            const end = worldToScreen(mapped.end.x, mapped.end.y, view);
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        } else if (mapped.type === 'rectangle') {
            const start = worldToScreen(mapped.start.x, mapped.start.y, view);
            const w = mapped.width * view.scale;
            const h = mapped.height * view.scale;
            ctx.rect(start.x, start.y, w, h);
            ctx.stroke();
            if (viewType !== 'top' && entity.operation !== 'cut') {
                ctx.fillStyle = color + '33'; 
                ctx.fill();
            }
        } else if (mapped.type === 'circle' || mapped.type === 'sphere') {
            const center = worldToScreen(mapped.center.x, mapped.center.y, view);
            const r = mapped.radius * view.scale;
            ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
            ctx.stroke();
            if (mapped.type === 'sphere') {
                ctx.beginPath();
                ctx.moveTo(center.x - 4, center.y);
                ctx.lineTo(center.x + 4, center.y);
                ctx.moveTo(center.x, center.y - 4);
                ctx.lineTo(center.x, center.y + 4);
                ctx.stroke();
            }
        } else if (mapped.type === 'polygon') {
            if (mapped.points.length > 0) {
                const start = worldToScreen(mapped.points[0].x, mapped.points[0].y, view);
                ctx.moveTo(start.x, start.y);
                for(let i=1; i<mapped.points.length; i++) {
                    const p = worldToScreen(mapped.points[i].x, mapped.points[i].y, view);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.closePath();
                
                if (mapped.holes && mapped.holes.length > 0) {
                    mapped.holes.forEach(hole => {
                        if(hole.length > 0) {
                            const hStart = worldToScreen(hole[0].x, hole[0].y, view);
                            ctx.moveTo(hStart.x, hStart.y);
                            for(let i=1; i<hole.length; i++) {
                                const hp = worldToScreen(hole[i].x, hole[i].y, view);
                                ctx.lineTo(hp.x, hp.y);
                            }
                            ctx.closePath();
                        }
                    });
                }
                ctx.stroke();
                if (viewType === 'top') {
                    ctx.fillStyle = color + '22';
                    ctx.fill("evenodd");
                }
            }
        } else if (mapped.type === 'light') {
             const light = mapped as LightEntity;
             const pos = worldToScreen(light.position.x, light.position.y, view);
             ctx.fillStyle = '#fbbf24';
             ctx.beginPath();
             ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
             ctx.fill();
             ctx.strokeStyle = '#fff';
             ctx.stroke();

             if (light.target && (viewType === 'top')) {
                 const tPos = worldToScreen(light.target.x, light.target.y, view);
                 ctx.setLineDash([2, 2]);
                 ctx.strokeStyle = '#fbbf24';
                 ctx.beginPath();
                 ctx.moveTo(pos.x, pos.y);
                 ctx.lineTo(tPos.x, tPos.y);
                 ctx.stroke();
                 ctx.setLineDash([]);
                 ctx.fillStyle = '#f59e0b';
                 ctx.fillRect(tPos.x - 3, tPos.y - 3, 6, 6);
             }
        }
        ctx.setLineDash([]);

        if (entity.selected && !currentAction?.startsWith('drawing')) {
            const handles = getEntityHandles(mapped);
            ctx.strokeStyle = SELECTION_COLOR;
            handles.forEach(h => {
                const sPos = worldToScreen(h.x, h.y, view);
                const size = h.type === 'poly-point' ? 4 : 6;
                ctx.fillStyle = h.type === 'target' ? '#f59e0b' : '#fff';
                
                ctx.beginPath();
                ctx.fillRect(sPos.x - size/2, sPos.y - size/2, size, size);
                ctx.strokeRect(sPos.x - size/2, sPos.y - size/2, size, size);
            });
        }
    };

    entities.forEach(e => {
        const preview = previewEntities.get(e.id);
        drawEntity(preview || e);
    });

    if (tempEntity) drawEntity(tempEntity, HIGHLIGHT_COLOR);
    
    if (activeTool === 'polygon' && polyPoints.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = HIGHLIGHT_COLOR;
        const start = worldToScreen(polyPoints[0].x, polyPoints[0].y, view);
        ctx.moveTo(start.x, start.y);
        polyPoints.forEach(p => {
             const sp = worldToScreen(p.x, p.y, view);
             ctx.lineTo(sp.x, sp.y);
        });
        if (currentMousePos) {
             const end = worldToScreen(currentMousePos.x, currentMousePos.y, view);
             ctx.setLineDash([5, 5]);
             ctx.lineTo(end.x, end.y);
             ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.fillStyle = HIGHLIGHT_COLOR;
        ctx.fillRect(start.x-2, start.y-2, 4, 4);
    }

    if (currentAction === 'box-select' && selectionBox) {
        const s = worldToScreen(selectionBox.start.x, selectionBox.start.y, view);
        const e = worldToScreen(selectionBox.end.x, selectionBox.end.y, view);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.beginPath();
        ctx.rect(s.x, s.y, e.x - s.x, e.y - s.y);
        ctx.fill();
        ctx.stroke();
    }

  }, [view, entities, tempEntity, layers, currentAction, previewEntities, viewType, polyPoints, selectionBox, currentMousePos]);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      render();
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
    
    const handleResize = () => {
        if(canvasRef.current) {
            canvasRef.current.width = canvasRef.current.parentElement?.clientWidth || 800;
            canvasRef.current.height = canvasRef.current.parentElement?.clientHeight || 600;
            if (view.offsetX === 0 && view.offsetY === 0) {
                setView(v => ({ ...v, offsetX: canvasRef.current!.width / 2, offsetY: canvasRef.current!.height / 2 }));
            }
            render();
        }
    }
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', handleResize);
    };
  }, [render]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if(canvasRef.current) canvasRef.current.focus();
    
    const rect = canvasRef.current!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY, view, viewType);
    const snappedPos = snapPoint(worldPos);
    setIsDragging(true);
    setClickStartPos({ x: e.clientX, y: e.clientY });

    const effectiveTool = isSpacePanning ? 'pan' : activeTool;

    if (effectiveTool === 'pan' || e.button === 1) {
      setCurrentAction('panning');
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (effectiveTool === 'polygon') {
        if (e.button === 2) { 
            setPolyPoints([]); 
            logger.log('CANVAS', 'Polygon drawing cancelled');
            return;
        }
        if (polyPoints.length > 0) {
            const last = polyPoints[polyPoints.length - 1];
            if (distance(last, snappedPos) < 0.1) return;
        }
        setPolyPoints([...polyPoints, snappedPos]);
        logger.log('CANVAS', `Polygon point added: ${polyPoints.length + 1}`);
        return; 
    }
    
    if (effectiveTool === 'light') {
        const light: LightEntity = {
            id: generateId(),
            layerId: activeLayerId,
            selected: true,
            type: 'light',
            position: snappedPos,
            target: { x: snappedPos.x, y: snappedPos.y - 50 },
            extrusionDepth: 0,
            elevation: 100,
            roughness: 0, metalness: 0, operation: 'solid',
            intensity: 2,
            distance: 200
        };
        onEntityAdd(light);
        return;
    }

    if (effectiveTool === 'select') {
        const selected = entities.filter(e => e.selected && isLayerVisible(e.layerId));
        for (const ent of selected) {
            const mapped = mapEntityToView(ent, viewType);
            if(!mapped) continue;
            const handles = getEntityHandles(mapped);
            for (const h of handles) {
                    const hScreen = worldToScreen(h.x, h.y, view);
                    if (Math.abs(screenX - hScreen.x) < 8 && Math.abs(screenY - hScreen.y) < 8) {
                        setCurrentAction('resizing');
                        setActiveHandle({ entityId: ent.id, handle: h });
                        setDragStart(snappedPos);
                        const pMap = new Map();
                        pMap.set(ent.id, { ...ent });
                        setPreviewEntities(pMap);
                        return;
                    }
            }
        }

        let hitEntity = null;
        for (let i = entities.length - 1; i >= 0; i--) {
            const ent = entities[i];
            if (!isLayerVisible(ent.layerId)) continue;
            const mapped = mapEntityToView(ent, viewType);
            if (mapped && isPointInEntity(worldPos, mapped, 10 / view.scale)) {
                hitEntity = ent;
                break;
            }
        }

        if (hitEntity) {
            if (hitEntity.selected) {
                setCurrentAction('moving');
                setDragStart(snappedPos);
                const idsToMove = entities.filter(e => e.selected).map(e => e.id);
                const toMove = entities.filter(e => idsToMove.includes(e.id)).map(e => ({ id: e.id, original: { ...e } }));
                setMovingOrigins(toMove);
                const pMap = new Map();
                toMove.forEach(item => pMap.set(item.id, { ...item.original }));
                setPreviewEntities(pMap);
                return;
            } else {
                if (!e.shiftKey) {
                    onSelectionChange([hitEntity.id]);
                    const cleared = entities.filter(en => en.isBase).map(en => ({...en, isBase: false}));
                    if(cleared.length) onEntitiesUpdate(cleared);

                    setCurrentAction('moving');
                    setDragStart(snappedPos);
                    const toMove = [{ id: hitEntity.id, original: { ...hitEntity, selected: true } }];
                    setMovingOrigins(toMove);
                    const pMap = new Map();
                    pMap.set(hitEntity.id, { ...hitEntity, selected: true });
                    setPreviewEntities(pMap);
                    return;
                } else {
                    const currentIds = entities.filter(e => e.selected).map(e => e.id);
                    onSelectionChange([...currentIds, hitEntity.id]);
                    return;
                }
            }
        }

        if (!hitEntity) {
            if (!e.shiftKey) onSelectionChange([]);
            setCurrentAction('box-select');
            setSelectionBox({ start: worldPos, end: worldPos });
            return;
        }
    }

    setCurrentAction('drawing');
    setDragStart(snappedPos);

    const baseEntity: BaseEntity = {
        id: generateId(),
        layerId: activeLayerId,
        selected: true,
        type: activeTool as EntityType,
        extrusionDepth: 20,
        elevation: 0,
        roughness: 0.5,
        metalness: 0.1,
        operation: 'solid'
    };

    if (activeTool === 'line') {
        setTempEntity({ ...baseEntity, type: 'line', start: snappedPos, end: snappedPos, extrusionDepth: 0 });
    } else if (activeTool === 'rectangle') {
        setTempEntity({ ...baseEntity, type: 'rectangle', start: snappedPos, width: 0, height: 0 });
    } else if (activeTool === 'circle') {
        setTempEntity({ ...baseEntity, type: 'circle', center: snappedPos, radius: 0 });
    } else if (activeTool === 'sphere') {
        setTempEntity({ ...baseEntity, type: 'sphere', center: snappedPos, radius: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY, view, viewType);
    const snappedPos = snapPoint(worldPos);
    
    setCurrentMousePos(snappedPos);

    if (currentAction === 'panning' && dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setView(v => ({ ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (currentAction === 'box-select' && selectionBox) {
        setSelectionBox({ ...selectionBox, end: worldPos });
        return;
    }

    if (currentAction === 'moving' && dragStart && movingOrigins) {
        if (clickStartPos && Math.abs(e.clientX - clickStartPos.x) < 3 && Math.abs(e.clientY - clickStartPos.y) < 3) {
            return;
        }

        const dx = snappedPos.x - dragStart.x;
        const dy = snappedPos.y - dragStart.y;
        const delta3D = getDelta3D(dx, dy, viewType);

        const newMap = new Map(previewEntities);
        movingOrigins.forEach(item => {
            const orig = item.original;
            let newEnt: any = { ...orig };

            if (orig.type === 'line') {
                newEnt.start = { x: orig.start.x + delta3D.x, y: orig.start.y + delta3D.y };
                newEnt.end = { x: orig.end.x + delta3D.x, y: orig.end.y + delta3D.y };
            } else if (orig.type === 'circle' || orig.type === 'sphere') {
                newEnt.center = { x: orig.center.x + delta3D.x, y: orig.center.y + delta3D.y };
            } else if (orig.type === 'rectangle') {
                newEnt.start = { x: orig.start.x + delta3D.x, y: orig.start.y + delta3D.y };
            } else if (orig.type === 'polygon') {
                newEnt.points = (orig as PolygonEntity).points.map(p => ({ x: p.x + delta3D.x, y: p.y + delta3D.y }));
                if ((orig as PolygonEntity).holes) {
                    newEnt.holes = (orig as PolygonEntity).holes!.map(hole => hole.map(p => ({ x: p.x + delta3D.x, y: p.y + delta3D.y })));
                }
            } else if (orig.type === 'light') {
                const light = orig as LightEntity;
                if (viewType === 'top') {
                    newEnt.position = { x: light.position.x + delta3D.x, y: light.position.y + delta3D.y };
                    if (light.target) {
                        newEnt.target = { x: light.target.x + delta3D.x, y: light.target.y + delta3D.y };
                    }
                } else {
                    newEnt.elevation = (light.elevation || 0) + delta3D.z;
                    if (viewType === 'front') {
                         newEnt.position = { ...newEnt.position, x: light.position.x + delta3D.x };
                         if (light.target) newEnt.target = { ...light.target, x: light.target.x + delta3D.x };
                    } else if (viewType === 'right') {
                         newEnt.position = { ...newEnt.position, y: light.position.y + delta3D.y };
                         if (light.target) newEnt.target = { ...light.target, y: light.target.y + delta3D.y };
                    }
                }
            }
            
            if (orig.type !== 'light') {
                newEnt.elevation = (orig.elevation || 0) + delta3D.z;
            }
            
            newMap.set(item.id, newEnt);
        });
        setPreviewEntities(newMap);
        return;
    }

    if (currentAction === 'resizing' && dragStart && activeHandle) {
        const ent = entities.find(e => e.id === activeHandle.entityId);
        if (!ent) return;
        
        let newEnt: any = ent;
        
        if (ent.type === 'light') {
             const light = { ...ent } as any;
             
             if (activeHandle.handle.type === 'light') {
                 const dx = snappedPos.x - dragStart.x;
                 const dy = snappedPos.y - dragStart.y;
                 const delta3D = getDelta3D(dx, dy, viewType);

                 if (viewType === 'top') {
                     light.position = { x: ent.position.x + delta3D.x, y: ent.position.y + delta3D.y };
                     if (ent.target) {
                        light.target = { x: ent.target.x + delta3D.x, y: ent.target.y + delta3D.y };
                     }
                 } else {
                     light.elevation = (ent.elevation || 0) + delta3D.z;
                     if (viewType === 'front') {
                         light.position = { ...light.position, x: ent.position.x + delta3D.x };
                         if (ent.target) light.target = { ...light.target, x: ent.target.x + delta3D.x };
                     } else if (viewType === 'right') {
                         light.position = { ...light.position, y: ent.position.y + delta3D.y }; 
                         if (ent.target) light.target = { ...light.target, y: ent.target.y + delta3D.y };
                     }
                 }
             } 
             else if (activeHandle.handle.type === 'target') {
                 const dx = snappedPos.x - dragStart.x;
                 const dy = snappedPos.y - dragStart.y;
                 const delta3D = getDelta3D(dx, dy, viewType);
                 
                 if (ent.target) {
                    if (viewType === 'top') {
                        light.target = { x: ent.target.x + delta3D.x, y: ent.target.y + delta3D.y };
                    } else if (viewType === 'front') {
                        light.target = { ...light.target, x: ent.target.x + delta3D.x };
                    } else if (viewType === 'right') {
                        light.target = { ...light.target, y: ent.target.y + delta3D.y };
                    }
                 }
             }
             newEnt = light;
        } 
        else if (viewType === 'top') {
            if (ent.type === 'rectangle') {
                 const rect = { ...ent } as any;
                 if (activeHandle.handle.type === 'br') {
                    rect.width = Math.max(0, snappedPos.x - rect.start.x);
                    rect.height = Math.max(0, snappedPos.y - rect.start.y);
                } else if (activeHandle.handle.type === 'tl') {
                     const brX = rect.start.x + rect.width;
                     const brY = rect.start.y + rect.height;
                     rect.start = { x: Math.min(brX, snappedPos.x), y: Math.min(brY, snappedPos.y) };
                     rect.width = brX - rect.start.x;
                     rect.height = brY - rect.start.y;
                }
                newEnt = rect;
            } else if (ent.type === 'circle' || ent.type === 'sphere') {
                 const circle = { ...ent } as any;
                 if (activeHandle.handle.type === 'radius') {
                     circle.radius = Math.abs(snappedPos.x - circle.center.x);
                 } else if (activeHandle.handle.type === 'center') {
                     circle.center = snappedPos;
                 }
                 newEnt = circle;
            } else if (ent.type === 'polygon') {
                 const poly = { ...ent } as PolygonEntity;
                 if (activeHandle.handle.type === 'poly-point' && activeHandle.handle.index !== undefined) {
                     const newPoints = [...poly.points];
                     newPoints[activeHandle.handle.index] = snappedPos;
                     newEnt = { ...poly, points: newPoints };
                 }
            }
        }
        
        const newMap = new Map();
        newMap.set(ent.id, newEnt);
        setPreviewEntities(newMap);
        return;
    }

    if (currentAction === 'drawing' && tempEntity && dragStart) {
      if (tempEntity.type === 'line') {
        setTempEntity({ ...tempEntity, end: snappedPos });
      } else if (tempEntity.type === 'rectangle') {
        const { x, y, width, height } = getRectPoints(dragStart, snappedPos);
        setTempEntity({ ...tempEntity, start: { x, y }, width, height });
      } else if (tempEntity.type === 'circle' || tempEntity.type === 'sphere') {
        const radius = distance(dragStart, snappedPos);
        setTempEntity({ ...tempEntity, radius });
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (currentAction === 'moving' && clickStartPos) {
        const dist = Math.sqrt(Math.pow(e.clientX - clickStartPos.x, 2) + Math.pow(e.clientY - clickStartPos.y, 2));
        if (dist < 3) {
            const rect = canvasRef.current!.getBoundingClientRect();
            const worldPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, view, viewType);
            
            let clickedId = null;
            for (let i = entities.length - 1; i >= 0; i--) {
                const ent = entities[i];
                if (!isLayerVisible(ent.layerId)) continue;
                const mapped = mapEntityToView(ent, viewType);
                if (mapped && isPointInEntity(worldPos, mapped, 10 / view.scale)) {
                    clickedId = ent.id;
                    break;
                }
            }

            if (clickedId) {
                const target = entities.find(en => en.id === clickedId);
                if (target && target.selected) {
                    onEntitiesUpdate([{ ...target, isBase: !target.isBase } as Entity]);
                    setPreviewEntities(new Map());
                }
            }
        } else if (previewEntities.size > 0) {
            onEntitiesUpdate(Array.from(previewEntities.values()));
        }
    } else if (currentAction === 'resizing' && previewEntities.size > 0) {
        onEntitiesUpdate(Array.from(previewEntities.values()));
    }

    if (currentAction === 'box-select' && selectionBox) {
        const selRect = {
            x1: Math.min(selectionBox.start.x, selectionBox.end.x),
            y1: Math.min(selectionBox.start.y, selectionBox.end.y),
            x2: Math.max(selectionBox.start.x, selectionBox.end.x),
            y2: Math.max(selectionBox.start.y, selectionBox.end.y)
        };
        const selectedIds: string[] = [];
        entities.forEach(ent => {
            if(!isLayerVisible(ent.layerId)) return;
            const mapped = mapEntityToView(ent, viewType);
            if (!mapped) return;
            const b = getBounds(mapped);
            if (doRectsIntersect(selRect, b)) {
                selectedIds.push(ent.id);
            }
        });
        onSelectionChange(selectedIds);
        setSelectionBox(null);
    }

    if (currentAction === 'drawing' && tempEntity) {
        let isValid = false;
        if (tempEntity.type === 'line') {
             if(distance((tempEntity as any).start, (tempEntity as any).end) > 0) isValid = true;
        }
        if (tempEntity.type === 'rectangle') {
             if((tempEntity as any).width > 0) isValid = true;
        }
        if ((tempEntity.type === 'circle' || tempEntity.type === 'sphere')) {
             if((tempEntity as any).radius > 0) isValid = true;
        }

        if (isValid) {
            onEntityAdd(tempEntity);
            logger.log('CANVAS', `Entity added: ${tempEntity.type}`);
        }
    }
    
    setIsDragging(false);
    setCurrentAction(null);
    setTempEntity(null);
    setDragStart(null);
    setActiveHandle(null);
    setMovingOrigins(null);
    setPreviewEntities(new Map());
    setClickStartPos(null);
  };
  
  const handleDoubleClick = (e: React.MouseEvent) => {
      if (activeTool === 'polygon') {
          finishPolygon();
      } else if (activeTool === 'select') {
          const rect = canvasRef.current!.getBoundingClientRect();
          const worldPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, view, viewType);
          
          const selectedPolys = entities.filter(ent => ent.selected && ent.type === 'polygon' && isLayerVisible(ent.layerId));
          for(const poly of selectedPolys) {
              const points = (poly as PolygonEntity).points;
              for(let i=0; i<points.length; i++) {
                  const p1 = points[i];
                  const p2 = points[(i + 1) % points.length];
                  const d = distanceToSegment(worldPos, p1, p2);
                  if (d < 5 / view.scale) {
                      const newPoints = [...points];
                      newPoints.splice(i + 1, 0, snapPoint(worldPos));
                      onEntitiesUpdate([{...poly, points: newPoints} as PolygonEntity]);
                      logger.log('CANVAS', 'Added vertex to polygon');
                      return;
                  }
              }
          }
      }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scaleFactor = 1.1;
    const direction = e.deltaY > 0 ? 1 / scaleFactor : scaleFactor;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldBefore = screenToWorld(mouseX, mouseY, view, viewType);
    
    setView(v => {
        const newScale = v.scale * direction;
        if (newScale < 0.1 || newScale > 50) return v;
        return {
            scale: newScale,
            offsetX: mouseX - worldBefore.x * newScale,
            offsetY: mouseY - worldBefore.y * newScale,
        };
    });
  };

  const getCursor = () => {
      if (isSpacePanning || activeTool === 'pan' || currentAction === 'panning') return 'grabbing';
      if (activeTool === 'select') {
          return currentAction === 'moving' ? 'move' : currentAction === 'resizing' ? 'crosshair' : 'default';
      }
      return 'crosshair';
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      className="block w-full h-full touch-none outline-none bg-slate-900"
      style={{ cursor: getCursor() }}
    />
  );
};

export default Canvas2D;
