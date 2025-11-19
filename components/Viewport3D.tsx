
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Entity, Layer, RectEntity, CircleEntity, LineEntity, PolygonEntity, LightEntity, SphereEntity } from '../types';
import { TEXTURES } from '../constants';
import { logger } from '../utils/debug';

interface Viewport3DProps {
  entities: Entity[];
  layers: Layer[];
  ambientIntensity: number;
  showGrid: boolean;
}

export interface Viewport3DHandle {
    triggerScreenshot: () => void;
}

const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(({ entities, layers, ambientIntensity, showGrid }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameIdRef = useRef<number>(0);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  const textureCache = useRef<Map<string, THREE.Texture>>(new Map());

  useImperativeHandle(ref, () => ({
      triggerScreenshot: () => {
          try {
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
                rendererRef.current.render(sceneRef.current, cameraRef.current);
                const dataURL = rendererRef.current.domElement.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `ThoughtlessCAD-Snapshot-${Date.now()}.png`;
                link.href = dataURL;
                link.click();
                logger.log('VIEWPORT', 'Screenshot captured successfully');
            }
          } catch(e: any) {
              logger.error('VIEWPORT', 'Screenshot failed', e.message);
              alert("Screenshot failed. Check console for details.");
          }
      }
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    sceneRef.current = scene;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    
    camera.position.set(200, 200, 200); 
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = false; // Shadows disabled per user request
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    // CRITICAL: Prevent default browser touch actions so OrbitControls works on mobile
    renderer.domElement.style.touchAction = 'none';
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting Setup
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.6); 
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 300, 150);
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const gridHelper = new THREE.GridHelper(2000, 200, 0x334155, 0x1e293b);
    scene.add(gridHelper);
    gridRef.current = gridHelper;
    
    const axesHelper = new THREE.AxesHelper(50);
    scene.add(axesHelper);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement) {
        renderer.domElement.remove();
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
      if(hemiLightRef.current) hemiLightRef.current.intensity = ambientIntensity * 0.6;
      if(gridRef.current) gridRef.current.visible = showGrid;
      if(rendererRef.current && sceneRef.current) {
         sceneRef.current.traverse((child) => {
             if(child instanceof THREE.Mesh && child.material) {
                 child.material.needsUpdate = true;
             }
         });
      }
  }, [ambientIntensity, showGrid]);

  // --- Procedural Texture Generator ---
  const getProceduralTexture = (type: string): THREE.Texture | null => {
      if(textureCache.current.has(type)) return textureCache.current.get(type)!;
      
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if(!ctx) return null;

      if(type === 'wood') {
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(0,0,512,512);
          ctx.strokeStyle = '#654321';
          for(let i=0; i<60; i++) {
               ctx.lineWidth = 1 + Math.random() * 4;
               ctx.beginPath();
               ctx.moveTo(0, Math.random() * 512);
               ctx.lineTo(512, Math.random() * 512);
               ctx.stroke();
          }
      } else if (type === 'brick') {
          ctx.fillStyle = '#9CA3AF'; // mortar
          ctx.fillRect(0,0,512,512);
          ctx.fillStyle = '#7f2e1d'; // brick
          const w = 100; const h = 50;
          for(let y=0; y<512; y+=60) {
              const offset = (y/60)%2 === 0 ? 0 : 50;
              for(let x=-50; x<512; x+=110) {
                  ctx.fillRect(x+offset, y, w, h);
                  // Add noise to brick
                  ctx.fillStyle = 'rgba(0,0,0,0.1)';
                  ctx.fillRect(x+offset + Math.random()*50, y+Math.random()*20, 10, 10);
                  ctx.fillStyle = '#7f2e1d';
              }
          }
      } else if (type === 'concrete') {
          ctx.fillStyle = '#909090';
          ctx.fillRect(0,0,512,512);
          for(let i=0; i<10000; i++) {
              ctx.fillStyle = Math.random() > 0.5 ? '#A0A0A0' : '#707070';
              ctx.fillRect(Math.random()*512, Math.random()*512, 2, 2);
          }
      } else if (type === 'metal') {
           const grad = ctx.createLinearGradient(0,0,512,512);
           grad.addColorStop(0, '#cfcfcf');
           grad.addColorStop(0.5, '#ffffff');
           grad.addColorStop(1, '#cfcfcf');
           ctx.fillStyle = grad;
           ctx.fillRect(0,0,512,512);
           ctx.strokeStyle = 'rgba(255,255,255,0.5)';
           for(let i=0; i<20; i++) {
               ctx.beginPath();
               ctx.moveTo(0, i*25);
               ctx.lineTo(512, i*25+50);
               ctx.stroke();
           }
      } else if (type === 'checkered') {
           ctx.fillStyle = '#ffffff';
           ctx.fillRect(0,0,512,512);
           ctx.fillStyle = '#202020';
           for(let y=0; y<512; y+=64) {
               for(let x=0; x<512; x+=64) {
                   if (((x/64) + (y/64)) % 2 === 0) ctx.fillRect(x,y,64,64);
               }
           }
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      textureCache.current.set(type, tex);
      return tex;
  };

  // --- Box UV Mapping Helper ---
  const applyBoxUV = (geometry: THREE.BufferGeometry, scale: number = 0.02) => {
      geometry.computeBoundingBox();
      const pos = geometry.attributes.position;
      if(!geometry.attributes.normal) geometry.computeVertexNormals();
      const norm = geometry.attributes.normal;
      
      const uvs = new Float32Array(pos.count * 2);
      
      for(let i=0; i<pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const z = pos.getZ(i);
          
          const nx = Math.abs(norm.getX(i));
          const ny = Math.abs(norm.getY(i));
          const nz = Math.abs(norm.getZ(i));
          
          if (nx > ny && nx > nz) {
              uvs[i*2] = z * scale;
              uvs[i*2+1] = y * scale;
          } else if (ny > nx && ny > nz) {
              uvs[i*2] = x * scale;
              uvs[i*2+1] = z * scale;
          } else {
              uvs[i*2] = x * scale;
              uvs[i*2+1] = y * scale;
          }
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.attributes.uv.needsUpdate = true;
  };

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Cleanup old
    const objectsToRemove: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (child.name === 'generated-entity') {
        objectsToRemove.push(child);
      }
    });
    objectsToRemove.forEach(obj => {
        if((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        if((obj as THREE.Mesh).material) {
            const mat = (obj as THREE.Mesh).material;
            if(Array.isArray(mat)) mat.forEach(m => m.dispose());
            else mat.dispose();
        }
        scene.remove(obj);
    });
    
    entities.forEach((entity, index) => {
      try {
          const layer = layers.find(l => l.id === entity.layerId);
          if (!layer || !layer.visible) return;

          const elevation = entity.elevation || 0;

          // --- Light Rendering ---
          if (entity.type === 'light') {
               const lightEnt = entity as LightEntity;
               const color = new THREE.Color(entity.color || '#ffffff');
               const intensity = lightEnt.intensity || 2;
               const distance = lightEnt.distance || 200;
 
               const spotLight = new THREE.SpotLight(color, intensity * 500, distance, Math.PI / 4, 0.3, 1.5);
               spotLight.position.set(lightEnt.position.x, elevation + 10, lightEnt.position.y);
               
               const targetObj = new THREE.Object3D();
               if (lightEnt.target) {
                  targetObj.position.set(lightEnt.target.x, 0, lightEnt.target.y);
               } else {
                  targetObj.position.set(lightEnt.position.x, 0, lightEnt.position.y);
               }
               
               scene.add(targetObj);
               spotLight.target = targetObj;
               
               spotLight.name = 'generated-entity';
               
               const bulb = new THREE.Mesh(
                   new THREE.SphereGeometry(1.5), 
                   new THREE.MeshBasicMaterial({ color: color })
               );
               bulb.position.copy(spotLight.position);
               bulb.name = 'generated-entity';
 
               if (entity.selected) {
                  const helper = new THREE.SpotLightHelper(spotLight, color);
                  helper.name = 'generated-entity';
                  scene.add(helper);
               }
 
               scene.add(bulb);
               scene.add(spotLight);
               targetObj.name = 'generated-entity';
               return;
          }

          const hasTex = entity.texture && entity.texture !== 'none';
          const tex = hasTex ? getProceduralTexture(entity.texture!) : null;
          const baseColor = hasTex ? 0xffffff : (entity.color || layer.color);
          const isCut = entity.operation === 'cut';

          const material = new THREE.MeshStandardMaterial({ 
              color: isCut ? 0xff0000 : new THREE.Color(baseColor), 
              map: tex,
              metalness: entity.metalness ?? 0.1, 
              roughness: entity.roughness ?? 0.5,
              side: THREE.DoubleSide,
              transparent: isCut,
              opacity: isCut ? 0.3 : 1.0,
              wireframe: isCut
          });

          let mesh: THREE.Mesh | THREE.Line | null = null;
          let shape: THREE.Shape | null = null;

          if (entity.type === 'sphere') {
              const sph = entity as SphereEntity;
              const geo = new THREE.SphereGeometry(sph.radius, 64, 64);
              if (tex) applyBoxUV(geo, 0.02);
              mesh = new THREE.Mesh(geo, material);
              mesh.position.set(sph.center.x, elevation + sph.radius, sph.center.y); 
          } else {
              // Extrusions
              if (entity.type === 'rectangle') {
                const rect = entity as RectEntity;
                shape = new THREE.Shape();
                shape.moveTo(rect.start.x, -rect.start.y);
                shape.lineTo(rect.start.x + rect.width, -rect.start.y);
                shape.lineTo(rect.start.x + rect.width, -(rect.start.y + rect.height));
                shape.lineTo(rect.start.x, -(rect.start.y + rect.height));
                shape.lineTo(rect.start.x, -rect.start.y);
              } else if (entity.type === 'circle') {
                const circle = entity as CircleEntity;
                shape = new THREE.Shape();
                shape.absarc(circle.center.x, -circle.center.y, circle.radius, 0, Math.PI * 2, false);
              } else if (entity.type === 'polygon') {
                  const poly = entity as PolygonEntity;
                  if(poly.points.length > 2) {
                    shape = new THREE.Shape();
                    shape.moveTo(poly.points[0].x, -poly.points[0].y);
                    for(let i=1; i<poly.points.length; i++) {
                        shape.lineTo(poly.points[i].x, -poly.points[i].y);
                    }
                    shape.closePath();

                    if (poly.holes && poly.holes.length > 0) {
                        poly.holes.forEach(holePath => {
                            if (holePath.length > 2) {
                                const holeShape = new THREE.Path();
                                holeShape.moveTo(holePath[0].x, -holePath[0].y);
                                for(let i=1; i<holePath.length; i++) {
                                    holeShape.lineTo(holePath[i].x, -holePath[i].y);
                                }
                                holeShape.closePath();
                                shape!.holes.push(holeShape);
                            }
                        });
                    }
                  }
              }

              if (shape) {
                  const finalDepth = Math.max(0.1, entity.extrusionDepth || 0);
                  const geometry = new THREE.ExtrudeGeometry(shape, { 
                      depth: finalDepth, 
                      bevelEnabled: false,
                      curveSegments: 24 // Smoother circles/cuts
                  });
                  
                  if (tex) applyBoxUV(geometry, 0.02);

                  mesh = new THREE.Mesh(geometry, material);
                  mesh.rotation.x = -Math.PI / 2;
                  mesh.position.y = elevation;
                  mesh.position.y += index * 0.005; // Z-fighting fix
              } else if (entity.type === 'line') {
                  const lineEnt = entity as LineEntity;
                  const depth = entity.extrusionDepth || 0;
                  if (depth > 0) {
                      const dx = lineEnt.end.x - lineEnt.start.x;
                      const dy = lineEnt.end.y - lineEnt.start.y;
                      const len = Math.sqrt(dx*dx + dy*dy);
                      const angle = Math.atan2(dy, dx);
                      const geometry = new THREE.BoxGeometry(len, depth, 1);
                      if (tex) applyBoxUV(geometry, 0.02);
                      mesh = new THREE.Mesh(geometry, material);
                      const midX = (lineEnt.start.x + lineEnt.end.x) / 2;
                      const midY = (lineEnt.start.y + lineEnt.end.y) / 2;
                      mesh.position.set(midX, elevation + depth/2, midY);
                      mesh.rotation.y = -angle; 
                  } else {
                      const points = [
                          new THREE.Vector3(lineEnt.start.x, elevation, lineEnt.start.y),
                          new THREE.Vector3(lineEnt.end.x, elevation, lineEnt.end.y)
                      ];
                      const geo = new THREE.BufferGeometry().setFromPoints(points);
                      const lineMat = new THREE.LineBasicMaterial({ color: baseColor, linewidth: 2 });
                      mesh = new THREE.Line(geo, lineMat);
                  }
              }
          }

          if (mesh) {
              mesh.name = 'generated-entity';
              // Shadows removed
              scene.add(mesh);
          }
      } catch (err: any) {
          logger.error('VIEWPORT', `Error generating entity ${entity.id}`, err.message);
      }
    });

  }, [entities, layers]);

  const resetCamera = () => {
      if (cameraRef.current && controlsRef.current) {
          cameraRef.current.position.set(200, 200, 200);
          cameraRef.current.lookAt(0,0,0);
          controlsRef.current.target.set(0,0,0);
          controlsRef.current.update();
      }
  }

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-900 relative overflow-hidden shadow-inner" style={{ touchAction: 'none' }}>
      <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none select-none z-10">
         <div className="bg-slate-900/80 text-white text-[10px] uppercase px-3 py-1.5 rounded backdrop-blur border border-slate-700 shadow-lg tracking-wide hidden md:block">
            <span className="text-blue-400 font-bold mr-1">LMB</span> Orbit
         </div>
         <div className="bg-slate-900/80 text-white text-[10px] uppercase px-3 py-1.5 rounded backdrop-blur border border-slate-700 shadow-lg tracking-wide hidden md:block">
            <span className="text-green-400 font-bold mr-1">RMB</span> Pan
         </div>
         <button 
            onClick={resetCamera}
            className="md:hidden bg-slate-800/90 text-white text-xs font-bold uppercase px-3 py-2 rounded border border-slate-600 shadow pointer-events-auto active:bg-blue-600"
         >
             <i className="fas fa-sync-alt mr-1"></i> Reset View
         </button>
      </div>
    </div>
  );
});

export default Viewport3D;
