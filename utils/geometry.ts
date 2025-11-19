
import { Point, ViewState, Entity, ViewType, PolygonEntity, LightEntity } from '../types';
import { GRID_SIZE } from '../constants';
import { logger } from './debug';

const EPSILON = 0.0001;

// --- Basic Point Ops ---

export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const arePointsEqual = (p1: Point, p2: Point, tolerance: number = EPSILON): boolean => {
    return distance(p1, p2) < tolerance;
};

// Map screen coordinates to specific 2D plane based on view type
export const screenToWorld = (x: number, y: number, view: ViewState, viewType: ViewType = 'top'): Point => {
  const rawX = (x - view.offsetX) / view.scale;
  const rawY = (y - view.offsetY) / view.scale;
  return { x: rawX, y: rawY };
};

export const worldToScreen = (x: number, y: number, view: ViewState): Point => {
  return {
    x: x * view.scale + view.offsetX,
    y: y * view.scale + view.offsetY,
  };
};

// Transforms a 3D entity into the 2D coordinate system of the requested view
export const mapEntityToView = (entity: Entity, viewType: ViewType): Entity | null => {
  const elevation = entity.elevation || 0;
  const depth = entity.type === 'sphere' ? (entity.radius * 2) : (entity.extrusionDepth || 0);

  if (viewType === 'top') return entity;

  const yTop = - (elevation + depth);
  const yBottom = - elevation;
  const heightInView = depth;

  if (viewType === 'front') {
    // Front View: X axis vs Z axis (Height)
    let xStart = 0;
    let width = 0;

    if (entity.type === 'line') {
       // Map line to a rectangle representing its bounds in X
       xStart = Math.min(entity.start.x, entity.end.x);
       width = Math.abs(entity.end.x - entity.start.x);
       // If width is 0 (perpendicular), make it selectable
       if (width < 1) { xStart -= 2; width = 4; }
    } else if (entity.type === 'rectangle') {
       xStart = entity.start.x;
       width = entity.width;
    } else if (entity.type === 'circle' || entity.type === 'sphere') {
       xStart = entity.center.x - entity.radius;
       width = entity.radius * 2;
    } else if (entity.type === 'polygon') {
        const xs = entity.points.map(p => p.x);
        xStart = Math.min(...xs);
        width = Math.max(...xs) - xStart;
    } else if (entity.type === 'light') {
         const l = entity;
         const mapped = { 
             ...entity, 
             position: { x: l.position.x, y: -l.elevation },
             target: l.target ? { x: l.target.x, y: 0 } : undefined 
         } as any;
         return mapped;
    }

    return {
        ...entity,
        type: 'rectangle',
        start: { x: xStart, y: yTop },
        width: width,
        height: heightInView
    } as any;
  }

  if (viewType === 'right') {
    // Right View: Y axis (Depth) vs Z axis (Height)
    let yStart2D = 0; 
    let width = 0;

    if (entity.type === 'line') {
        // Map line to rectangle representing bounds in Y
        yStart2D = Math.min(entity.start.y, entity.end.y);
        width = Math.abs(entity.end.y - entity.start.y);
        if (width < 1) { yStart2D -= 2; width = 4; }
    } else if (entity.type === 'rectangle') {
       yStart2D = entity.start.y;
       width = entity.height; 
    } else if (entity.type === 'circle' || entity.type === 'sphere') {
       yStart2D = entity.center.y - entity.radius;
       width = entity.radius * 2;
    } else if (entity.type === 'polygon') {
        const ys = entity.points.map(p => p.y);
        yStart2D = Math.min(...ys);
        width = Math.max(...ys) - yStart2D;
    } else if (entity.type === 'light') {
         const l = entity;
         const mapped = { 
             ...entity, 
             position: { x: l.position.y, y: -l.elevation },
             target: l.target ? { x: l.target.y, y: 0 } : undefined 
         } as any;
         return mapped;
    }

    return {
        ...entity,
        type: 'rectangle',
        start: { x: yStart2D, y: yTop },
        width: width,
        height: heightInView
    } as any;
  }

  return entity;
};

export const getDelta3D = (dx: number, dy: number, viewType: ViewType) => {
    if (viewType === 'top') return { x: dx, y: dy, z: 0 };
    if (viewType === 'front') return { x: dx, y: 0, z: -dy }; 
    if (viewType === 'right') return { x: 0, y: dx, z: -dy };
    return { x: 0, y: 0, z: 0 };
}

export const snapToGrid = (val: number): number => {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
};

export const snapPoint = (p: Point, snapEnabled: boolean = true): Point => {
  if (!snapEnabled) return p;
  return {
    x: snapToGrid(p.x),
    y: snapToGrid(p.y),
  };
};

export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

export const getRectPoints = (p1: Point, p2: Point) => {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const width = Math.abs(p2.x - p1.x);
  const height = Math.abs(p2.y - p1.y);
  return { x, y, width, height };
};

export interface Handle {
  id: string;
  x: number;
  y: number;
  cursor: string;
  type: 'start' | 'end' | 'center' | 'radius' | 'tl' | 'tr' | 'bl' | 'br' | 'poly-point' | 'light' | 'target';
  index?: number;
}

export const getEntityHandles = (entity: Entity): Handle[] => {
  if (entity.type === 'line') {
    return [
      { id: 'start', x: entity.start.x, y: entity.start.y, cursor: 'move', type: 'start' },
      { id: 'end', x: entity.end.x, y: entity.end.y, cursor: 'move', type: 'end' },
    ];
  } else if (entity.type === 'circle' || entity.type === 'sphere') {
    return [
      { id: 'center', x: entity.center.x, y: entity.center.y, cursor: 'move', type: 'center' },
      { id: 'radius', x: entity.center.x + entity.radius, y: entity.center.y, cursor: 'ew-resize', type: 'radius' },
    ];
  } else if (entity.type === 'rectangle') {
    const { x, y } = entity.start;
    const w = entity.width;
    const h = entity.height;
    return [
      { id: 'tl', x: x, y: y, cursor: 'nwse-resize', type: 'tl' },
      { id: 'tr', x: x + w, y: y, cursor: 'nesw-resize', type: 'tr' },
      { id: 'bl', x: x, y: y + h, cursor: 'nesw-resize', type: 'bl' },
      { id: 'br', x: x + w, y: y + h, cursor: 'nwse-resize', type: 'br' },
    ];
  } else if (entity.type === 'polygon') {
      return entity.points.map((p, i) => ({
          id: `p-${i}`,
          x: p.x,
          y: p.y,
          cursor: 'move',
          type: 'poly-point',
          index: i
      }));
  } else if (entity.type === 'light') {
      const handles: Handle[] = [
        { id: 'light', x: entity.position.x, y: entity.position.y, cursor: 'move', type: 'light' }
      ];
      if (entity.target) {
          handles.push({ id: 'target', x: entity.target.x, y: entity.target.y, cursor: 'crosshair', type: 'target' });
      }
      return handles;
  }
  return [];
};

export const isPointInEntity = (p: Point, entity: Entity, tolerance: number = 5): boolean => {
    if (entity.type === 'line') {
        const l2 = Math.pow(distance(entity.start, entity.end), 2);
        if (l2 === 0) return distance(p, entity.start) < tolerance;
        let t = ((p.x - entity.start.x) * (entity.end.x - entity.start.x) + (p.y - entity.start.y) * (entity.end.y - entity.start.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const proj = {
            x: entity.start.x + t * (entity.end.x - entity.start.x),
            y: entity.start.y + t * (entity.end.y - entity.start.y)
        };
        return distance(p, proj) < tolerance;
    } else if (entity.type === 'circle' || entity.type === 'sphere') {
        const d = distance(p, entity.center);
        return Math.abs(d - entity.radius) < tolerance || d < entity.radius; 
    } else if (entity.type === 'rectangle') {
        return (
            p.x >= entity.start.x && p.x <= entity.start.x + entity.width &&
            p.y >= entity.start.y && p.y <= entity.start.y + entity.height
        );
    } else if (entity.type === 'light') {
        const effTolerance = Math.max(tolerance * 2, 15); 
        if (distance(p, entity.position) < effTolerance) return true;
        if (entity.target && distance(p, entity.target) < effTolerance) return true;
        return false;
    } else if (entity.type === 'polygon') {
        let inside = false;
        for (let i = 0, j = entity.points.length - 1; i < entity.points.length; j = i++) {
            const xi = entity.points[i].x, yi = entity.points[i].y;
            const xj = entity.points[j].x, yj = entity.points[j].y;
            const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        if(inside) return true;

        for (let i = 0; i < entity.points.length; i++) {
             const p1 = entity.points[i];
             const p2 = entity.points[(i + 1) % entity.points.length];
             const l2 = Math.pow(distance(p1, p2), 2);
             if (l2 === 0) continue;
             let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2;
             t = Math.max(0, Math.min(1, t));
             const proj = {
                 x: p1.x + t * (p2.x - p1.x),
                 y: p1.y + t * (p2.y - p1.y)
             };
             if(distance(p, proj) < tolerance) return true;
         }
         return false;
    }
    return false;
}

export const getBounds = (entity: Entity) => {
    if (entity.type === 'rectangle') {
        return { x1: entity.start.x, y1: entity.start.y, x2: entity.start.x + entity.width, y2: entity.start.y + entity.height };
    } else if (entity.type === 'circle' || entity.type === 'sphere') {
        return { x1: entity.center.x - entity.radius, y1: entity.center.y - entity.radius, x2: entity.center.x + entity.radius, y2: entity.center.y + entity.radius };
    } else if (entity.type === 'line') {
        return { x1: Math.min(entity.start.x, entity.end.x), y1: Math.min(entity.start.y, entity.end.y), x2: Math.max(entity.start.x, entity.end.x), y2: Math.max(entity.start.y, entity.end.y) };
    } else if (entity.type === 'polygon') {
        const xs = entity.points.map(p => p.x);
        const ys = entity.points.map(p => p.y);
        return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
    } else if (entity.type === 'light') {
        return { x1: entity.position.x - 10, y1: entity.position.y - 10, x2: entity.position.x + 10, y2: entity.position.y + 10 };
    }
    return { x1: 0, y1: 0, x2: 0, y2: 0 };
}

export const doRectsIntersect = (r1: {x1: number, y1: number, x2: number, y2: number}, r2: {x1: number, y1: number, x2: number, y2: number}) => {
    return !(r2.x1 > r1.x2 || r2.x2 < r1.x1 || r2.y1 > r1.y2 || r2.y2 < r1.y1);
}

export const distanceToSegment = (p: Point, v: Point, w: Point) => {
  const l2 = distance(v, w) ** 2;
  if (l2 === 0) return distance(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

// --- Robust Boolean Logic: Segment Stitching ---

export const convertToPoints = (ent: Entity): Point[] => {
    if (ent.type === 'polygon') return ent.points;
    if (ent.type === 'rectangle') {
        return [
            { x: ent.start.x, y: ent.start.y },
            { x: ent.start.x + ent.width, y: ent.start.y },
            { x: ent.start.x + ent.width, y: ent.start.y + ent.height },
            { x: ent.start.x, y: ent.start.y + ent.height },
        ];
    }
    if (ent.type === 'circle' || ent.type === 'sphere') {
        const pts = [];
        const segs = 64; 
        for(let i=0; i<segs; i++) {
             const theta = (i / segs) * Math.PI * 2;
             pts.push({
                 x: ent.center.x + Math.cos(theta) * ent.radius,
                 y: ent.center.y + Math.sin(theta) * ent.radius
             });
        }
        return pts;
    }
    if (ent.type === 'line') {
         const dx = ent.end.x - ent.start.x;
         const dy = ent.end.y - ent.start.y;
         const len = Math.sqrt(dx*dx + dy*dy);
         if (len === 0) return [];
         
         // Expand line into a "Wall" or "Cut". 
         // Thickness must be enough to be seen as a polygon by intersection logic
         const halfThickness = 2.0; 
         const nx = -dy / len * halfThickness;
         const ny = dx / len * halfThickness;
         
         return [
             { x: ent.start.x + nx, y: ent.start.y + ny },
             { x: ent.end.x + nx, y: ent.end.y + ny },
             { x: ent.end.x - nx, y: ent.end.y - ny },
             { x: ent.start.x - nx, y: ent.start.y - ny }
         ];
    }
    return [];
}

const getIntersection = (p1: Point, p2: Point, p3: Point, p4: Point): Point | null => {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(denom) < 1e-9) return null; 
    
    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;
    
    if (ua > EPSILON && ua < 1 - EPSILON && ub > EPSILON && ub < 1 - EPSILON) {
        return {
            x: p1.x + ua * (p2.x - p1.x),
            y: p1.y + ua * (p2.y - p1.y)
        };
    }
    return null;
}

const isPointInPoly = (p: Point, poly: Point[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

const getSignedArea = (points: Point[]): number => {
    let area = 0;
    for(let i=0; i<points.length; i++) {
        const j = (i+1) % points.length;
        area += (points[j].x - points[i].x) * (points[j].y + points[i].y);
    }
    return area / 2.0;
}

const injectIntersections = (subject: Point[], clip: Point[]): Point[] => {
    const newSubject: Point[] = [];
    
    for (let i=0; i<subject.length; i++) {
        const s1 = subject[i];
        const s2 = subject[(i+1)%subject.length];
        newSubject.push(s1);
        
        const intersections: { t: number, p: Point }[] = [];
        
        for (let j=0; j<clip.length; j++) {
            const c1 = clip[j];
            const c2 = clip[(j+1)%clip.length];
            const int = getIntersection(s1, s2, c1, c2);
            if (int) {
                intersections.push({ t: distance(s1, int), p: int });
            }
        }
        
        intersections.sort((a, b) => a.t - b.t);
        intersections.forEach(int => {
            if (!arePointsEqual(int.p, s1) && !arePointsEqual(int.p, s2)) {
                newSubject.push(int.p);
            }
        });
    }
    return newSubject;
}

export const cleanPolygon = (points: Point[]): Point[] => {
    if (points.length < 3) return points;
    const cleaned = points.filter((p, i) => {
        const prev = points[(i - 1 + points.length) % points.length];
        return !arePointsEqual(p, prev, 0.01);
    });
    if (cleaned.length < 3) return cleaned;
    if (arePointsEqual(cleaned[0], cleaned[cleaned.length-1], 0.01)) cleaned.pop();
    return cleaned;
}

interface Segment { p1: Point; p2: Point; }

const stitchSegments = (segments: Segment[]): Point[][] => {
    if (segments.length === 0) return [];

    const polygons: Point[][] = [];
    let watchdog = 0;

    while (segments.length > 0 && watchdog < 5000) {
        const orderedPoints: Point[] = [];
        let currentSeg = segments[0];
        segments.splice(0, 1);
        orderedPoints.push(currentSeg.p1);
        
        let loopWatchdog = 0;
        let loopClosed = false;

        while(loopWatchdog < 2000) {
            const tail = currentSeg.p2;
            let nextIdx = -1;
            let minD = 9999;
            
            for(let i=0; i<segments.length; i++) {
                const d = distance(tail, segments[i].p1);
                if (d < minD) {
                    minD = d;
                    nextIdx = i;
                }
            }

            if (nextIdx !== -1 && minD < 5.0) {
                orderedPoints.push(currentSeg.p2);
                currentSeg = segments[nextIdx];
                segments.splice(nextIdx, 1);
                
                // Check if closed
                if (distance(currentSeg.p2, orderedPoints[0]) < 5.0) {
                     orderedPoints.push(currentSeg.p2);
                     loopClosed = true;
                     break;
                }
            } else {
                // Check if we connect back to start with current segment
                if (distance(currentSeg.p2, orderedPoints[0]) < 5.0) {
                    orderedPoints.push(currentSeg.p2);
                    loopClosed = true;
                }
                break;
            }
            loopWatchdog++;
        }
        
        if (loopClosed && orderedPoints.length > 2) {
            polygons.push(cleanPolygon(orderedPoints));
        }
        watchdog++;
    }
    
    return polygons;
}

// SHARED LOGIC
const prepareBooleanOperands = (s: Entity, c: Entity) => {
    let sPoly = cleanPolygon(convertToPoints(s));
    let cPoly = cleanPolygon(convertToPoints(c));
    
    if (getSignedArea(sPoly) < 0) sPoly.reverse();
    if (getSignedArea(cPoly) < 0) cPoly.reverse();
    
    return { sPoly, cPoly };
}

export const booleanSubtract = (subject: Entity, clip: Entity): { polys: Point[][], holes: Point[][] } => {
    try {
        logger.log('BOOLEAN', `Subtracting ${clip.type} from ${subject.type}`);
        const { sPoly, cPoly } = prepareBooleanOperands(subject, clip);
        if (sPoly.length < 3 || cPoly.length < 3) return { polys: [sPoly], holes: [] };

        // Check bounds optimization
        const sB = getBounds(subject);
        const cB = getBounds(clip);
        if (!doRectsIntersect(sB, cB)) return { polys: [sPoly], holes: [] };

        let clipInside = true;
        for(const p of cPoly) { if (!isPointInPoly(p, sPoly)) { clipInside = false; break; } }
        if (clipInside) {
            const existingHoles = (subject as PolygonEntity).holes || [];
            return { polys: [sPoly], holes: [...existingHoles, cPoly] };
        }
        
        let subjectInside = true;
        for(const p of sPoly) { if (!isPointInPoly(p, cPoly)) { subjectInside = false; break; } }
        if (subjectInside) return { polys: [], holes: [] };

        const sWithInts = cleanPolygon(injectIntersections(sPoly, cPoly));
        const cWithInts = cleanPolygon(injectIntersections(cPoly, sPoly));
        
        const resultSegments: Segment[] = [];

        // Subject segments NOT in Clip
        for(let i=0; i<sWithInts.length; i++) {
            const p1 = sWithInts[i];
            const p2 = sWithInts[(i+1)%sWithInts.length];
            const mid = { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2 };
            if (!isPointInPoly(mid, cPoly)) resultSegments.push({ p1, p2 });
        }

        // Clip segments INSIDE Subject (Reversed)
        for(let i=0; i<cWithInts.length; i++) {
            const p1 = cWithInts[i];
            const p2 = cWithInts[(i+1)%cWithInts.length];
            const mid = { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2 };
            if (isPointInPoly(mid, sPoly)) resultSegments.push({ p1: p2, p2: p1 });
        }

        // Stitching can return multiple islands (polygons)
        const finalPolys = stitchSegments(resultSegments);
        logger.log('BOOLEAN', `Result Islands: ${finalPolys.length}`);
        return { polys: finalPolys, holes: (subject as PolygonEntity).holes || [] };

    } catch (e: any) {
        logger.error('BOOLEAN', 'Subtract Failed', e);
        return { polys: [convertToPoints(subject)], holes: [] };
    }
}

export const booleanUnion = (entities: Entity[]): { points: Point[], holes: Point[][] } => {
    if (entities.length < 2) return { points: [], holes: [] };
    
    try {
        logger.log('BOOLEAN', 'Starting Union...');
        let currentPoly = cleanPolygon(convertToPoints(entities[0]));
        let currentHoles = (entities[0] as PolygonEntity).holes || [];

        for(let k=1; k<entities.length; k++) {
            const nextPoly = cleanPolygon(convertToPoints(entities[k]));
            if(nextPoly.length < 3) continue;
            
            if(getSignedArea(currentPoly) < 0) currentPoly.reverse();
            const nextPolyCW = getSignedArea(nextPoly) < 0 ? [...nextPoly].reverse() : nextPoly;

            const sWithInts = cleanPolygon(injectIntersections(currentPoly, nextPolyCW));
            const cWithInts = cleanPolygon(injectIntersections(nextPolyCW, currentPoly));
            
            const resultSegments: Segment[] = [];
            
            for(let i=0; i<sWithInts.length; i++) {
                const p1 = sWithInts[i];
                const p2 = sWithInts[(i+1)%sWithInts.length];
                const mid = { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2 };
                if (!isPointInPoly(mid, nextPolyCW)) resultSegments.push({ p1, p2 });
            }

            for(let i=0; i<cWithInts.length; i++) {
                const p1 = cWithInts[i];
                const p2 = cWithInts[(i+1)%cWithInts.length];
                const mid = { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2 };
                if (!isPointInPoly(mid, currentPoly)) resultSegments.push({ p1, p2 });
            }
            
            if (resultSegments.length === 0) {
                let aInB = true;
                for(const p of currentPoly) { if(!isPointInPoly(p, nextPolyCW)) { aInB = false; break; } }
                if (aInB) {
                    currentPoly = nextPolyCW;
                    currentHoles = (entities[k] as PolygonEntity).holes || []; 
                } 
            } else {
                const stitched = stitchSegments(resultSegments);
                if (stitched.length > 0) currentPoly = stitched[0]; 
            }
        }
        
        return { points: currentPoly, holes: currentHoles };

    } catch(e: any) {
        logger.error('BOOLEAN', 'Union Failed', e);
        return { points: convertToPoints(entities[0]), holes: [] };
    }
}
