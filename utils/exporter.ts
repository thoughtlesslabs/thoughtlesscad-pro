
import { Entity, PolygonEntity, SphereEntity } from '../types';
import { logger } from './debug';
import * as THREE from 'three';

export const exportToObj = (entities: Entity[], onlySelected: boolean = false, filename: string = 'ThoughtlessCAD-Model.obj') => {
    logger.log('EXPORT', `Starting Three.js Export. Count: ${entities.length}, SelectedOnly: ${onlySelected}`);
    
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
            if (entity.type === 'light' || !entity.layerId) return;

            const elevation = entity.elevation || 0;
            let geometry: THREE.BufferGeometry | null = null;

            // --- GEOMETRY GENERATION (MIRRORS VIEWPORT3D) ---
            if (entity.type === 'sphere') {
                 const sph = entity as SphereEntity;
                 // Sphere in Viewport is positioned at (x, elev+r, y). No rotation.
                 // OBJ Y is up. Three Y is up.
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
                        // Translate to position. Center of Box is 0,0,0.
                        // Move to midX, elev+depth/2, midY
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
                     // In Viewport3D: mesh.rotation.x = -Math.PI / 2;
                     // This rotates the XY shape to lie on the XZ plane (Floor).
                     // The Extrusion (Z axis of geometry) becomes World -Y? No.
                     // Let's step back. 
                     // ThreeJS Default: Y is Up.
                     // Shape: Drawn in XY.
                     // Extrusion: Extrudes in Z.
                     // Viewport: rotates mesh -90 X.
                     // Result: Shape XY -> XZ (Floor). Extrusion Z -> -Y (Down? or Up?)
                     // -90 deg X rotation: (x, y, z) -> (x, z, -y).
                     // So Extrusion Z becomes World -Y.
                     // If depth is positive, it extrudes DOWN?
                     // Viewport adds `position.y = elevation`.
                     // If Viewport looks correct, we simulate exactly that transform.
                     
                     geometry.rotateX(-Math.PI / 2);
                     geometry.translate(0, elevation, 0); 
                 }
            }

            if (geometry) {
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
                        // Flip face winding if needed, but standard is CCW
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
            }
        });

        const blob = new Blob([output], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        logger.log('EXPORT', 'Success');
        alert("Export Successful!");

    } catch (err: any) {
        logger.error('EXPORT', 'Failed', err);
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
        exportToObj(dummy as Entity[], true, 'test-dump.obj');
        logger.log('TEST', 'Self Diagnostic Passed.');
        return true;
    } catch(e: any) {
        logger.error('TEST', 'Self Diagnostic FAILED', e.message);
        alert("Self Test Failed. See Log.");
        return false;
    }
}
