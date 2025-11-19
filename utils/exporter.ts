
import { Entity, PolygonEntity, SphereEntity } from '../types';
import { logger } from './debug';
import * as THREE from 'three';

// Helper to generate Three.js geometry from our Entity definitions
const generateEntityGeometry = (entity: Entity): THREE.BufferGeometry | null => {
    if (entity.type === 'light' || !entity.layerId) return null;

    const elevation = entity.elevation || 0;
    let geometry: THREE.BufferGeometry | null = null;

    if (entity.type === 'sphere') {
            const sph = entity as SphereEntity;
            // Sphere in Viewport is positioned at (x, elev+r, y).
            geometry = new THREE.SphereGeometry(sph.radius, 32, 32);
            geometry.translate(sph.center.x, elevation + sph.radius, sph.center.y);
    } else {
            // Extrusion shapes
            let shape: THREE.Shape | null = null;

            if (entity.type === 'rectangle') {
            const r = entity as any;
            shape = new THREE.Shape();
            // Shape defined in XY plane.
            shape.moveTo(r.start.x, -r.start.y);
            shape.lineTo(r.start.x + r.width, -r.start.y);
            shape.lineTo(r.start.x + r.width, -(r.start.y + r.height));
            shape.lineTo(r.start.x, -(r.start.y + r.height));
            shape.lineTo(r.start.x, -r.start.y);
            } else if (entity.type === 'circle') {
            const c = entity as any;
            shape = new THREE.Shape();
            shape.absarc(c.center.x, -c.center.y, c.radius, 0, Math.PI * 2, false);
            } else if (entity.type === 'polygon') {
            const p = entity as PolygonEntity;
            if (p.points.length > 2) {
                shape = new THREE.Shape();
                shape.moveTo(p.points[0].x, -p.points[0].y);
                for(let i=1; i<p.points.length; i++) shape.lineTo(p.points[i].x, -p.points[i].y);
                shape.closePath();
                
                if (p.holes) {
                    p.holes.forEach(h => {
                        if (h.length > 2) {
                            const hp = new THREE.Path();
                            hp.moveTo(h[0].x, -h[0].y);
                            for(let i=1; i<h.length; i++) hp.lineTo(h[i].x, -h[i].y);
                            hp.closePath();
                            shape!.holes.push(hp);
                        }
                    });
                }
            }
            } else if (entity.type === 'line') {
                const l = entity as any;
                if ((l.extrusionDepth || 0) > 0) {
                const dx = l.end.x - l.start.x;
                const dy = l.end.y - l.start.y;
                const len = Math.sqrt(dx*dx + dy*dy);
                const angle = Math.atan2(dy, dx);
                geometry = new THREE.BoxGeometry(len, l.extrusionDepth, 1);
                const midX = (l.start.x + l.end.x) / 2;
                const midY = (l.start.y + l.end.y) / 2;
                
                // Rotate around Y to match orientation on floor
                geometry.rotateY(-angle);
                geometry.translate(midX, elevation + l.extrusionDepth/2, midY);
                }
            }

            if (shape) {
                const depth = Math.max(0.1, entity.extrusionDepth || 0);
                geometry = new THREE.ExtrudeGeometry(shape, { 
                    depth: depth, 
                    bevelEnabled: false,
                    curveSegments: 24 
                });
                // Align 2D extrusion (Z) with 3D world (Y-up, mapped)
                geometry.rotateX(-Math.PI / 2);
                geometry.translate(0, elevation, 0); 
            }
    }
    return geometry;
};

const downloadBlob = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const exportToObj = (entities: Entity[], onlySelected: boolean = false, filename: string = 'ThoughtlessCAD-Model.obj') => {
    logger.log('EXPORT', `Starting OBJ Export. Count: ${entities.length}, SelectedOnly: ${onlySelected}`);
    
    const targetEntities = onlySelected ? entities.filter(e => e.selected) : entities;
    
    if (targetEntities.length === 0) {
        alert("Export Failed: No entities selected.");
        return;
    }

    let output = "# ThoughtlessCAD Pro Export (Three.js Engine)\n";
    output += `o Mesh_Export\n`;
    let vertexOffset = 1;

    try {
        targetEntities.forEach((entity) => {
            const geometry = generateEntityGeometry(entity);
            if (!geometry) return;

            // Extract data from buffer geometry
            const posAttr = geometry.attributes.position;
            const indexAttr = geometry.index;

            // Write Vertices
            for (let i = 0; i < posAttr.count; i++) {
                const x = posAttr.getX(i);
                const y = posAttr.getY(i);
                const z = posAttr.getZ(i);
                output += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`;
            }

            // Write Faces
            if (indexAttr) {
                for (let i = 0; i < indexAttr.count; i += 3) {
                    const a = indexAttr.getX(i) + vertexOffset;
                    const b = indexAttr.getX(i + 1) + vertexOffset;
                    const c = indexAttr.getX(i + 2) + vertexOffset;
                    output += `f ${a} ${b} ${c}\n`;
                }
            } else {
                // Non-indexed
                for (let i = 0; i < posAttr.count; i += 3) {
                    const a = i + vertexOffset;
                    const b = i + 1 + vertexOffset;
                    const c = i + 2 + vertexOffset;
                    output += `f ${a} ${b} ${c}\n`;
                }
            }

            vertexOffset += posAttr.count;
        });

        downloadBlob(output, filename);
        logger.log('EXPORT', 'OBJ Export Success');
        alert("Export Successful!");

    } catch (err: any) {
        logger.error('EXPORT', 'Failed', err);
        alert("Export failed. See logs.");
    }
};

export const exportToStl = (entities: Entity[], onlySelected: boolean = false, filename: string = 'ThoughtlessCAD-Model.stl') => {
    logger.log('EXPORT', `Starting STL Export. Count: ${entities.length}, SelectedOnly: ${onlySelected}`);
    
    const targetEntities = onlySelected ? entities.filter(e => e.selected) : entities;
    
    if (targetEntities.length === 0) {
        alert("Export Failed: No entities selected.");
        return;
    }

    let output = "solid exported\n";

    try {
        targetEntities.forEach(entity => {
            const geometry = generateEntityGeometry(entity);
            if (!geometry) return;

            const pos = geometry.attributes.position;
            const index = geometry.index;

            const writeFacet = (aIdx: number, bIdx: number, cIdx: number) => {
                const vA = new THREE.Vector3(pos.getX(aIdx), pos.getY(aIdx), pos.getZ(aIdx));
                const vB = new THREE.Vector3(pos.getX(bIdx), pos.getY(bIdx), pos.getZ(bIdx));
                const vC = new THREE.Vector3(pos.getX(cIdx), pos.getY(cIdx), pos.getZ(cIdx));

                // Compute normal
                const cb = new THREE.Vector3().subVectors(vC, vB);
                const ab = new THREE.Vector3().subVectors(vA, vB);
                cb.cross(ab).normalize();
                const normal = cb; // Face normal

                output += `facet normal ${normal.x.toExponential(6)} ${normal.y.toExponential(6)} ${normal.z.toExponential(6)}\n`;
                output += `  outer loop\n`;
                output += `    vertex ${vA.x.toExponential(6)} ${vA.y.toExponential(6)} ${vA.z.toExponential(6)}\n`;
                output += `    vertex ${vB.x.toExponential(6)} ${vB.y.toExponential(6)} ${vB.z.toExponential(6)}\n`;
                output += `    vertex ${vC.x.toExponential(6)} ${vC.y.toExponential(6)} ${vC.z.toExponential(6)}\n`;
                output += `  endloop\n`;
                output += `endfacet\n`;
            };

            if (index) {
                for (let i = 0; i < index.count; i += 3) {
                    writeFacet(index.getX(i), index.getX(i+1), index.getX(i+2));
                }
            } else {
                for (let i = 0; i < pos.count; i += 3) {
                    writeFacet(i, i+1, i+2);
                }
            }
        });

        output += "endsolid exported\n";

        downloadBlob(output, filename);
        logger.log('EXPORT', 'STL Export Success');
        alert("Export Successful!");

    } catch (err: any) {
        logger.error('EXPORT', 'STL Failed', err);
        alert("Export failed. See logs.");
    }
};

export const runSelfTest = () => {
    logger.log('TEST', 'Running Self Diagnostic...');
    try {
        const dummy = [{
            id: 'test', type: 'rectangle', 
            start: {x:0,y:0}, width: 10, height: 10, 
            selected: true, layerId: '1', extrusionDepth: 10, elevation: 0, roughness:0, metalness: 0, operation: 'solid'
        }];
        // Dry run export
        generateEntityGeometry(dummy[0] as Entity);
        logger.log('TEST', 'Self Diagnostic Passed.');
        return true;
    } catch(e: any) {
        logger.error('TEST', 'Self Diagnostic FAILED', e.message);
        alert("Self Test Failed. See Log.");
        return false;
    }
}
