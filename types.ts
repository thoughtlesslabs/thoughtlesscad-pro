export type ToolType = 'select' | 'pan' | 'line' | 'rectangle' | 'circle' | 'polygon' | 'sphere' | 'light';

export type ViewType = 'top' | 'front' | 'right';

export interface Point {
  x: number;
  y: number;
}

export interface Layer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

export type EntityType = 'line' | 'rectangle' | 'circle' | 'polygon' | 'sphere' | 'light';

export interface BaseEntity {
  id: string;
  name?: string; // User-defined name for the object
  type: EntityType;
  layerId: string;
  selected: boolean;
  isBase?: boolean; // For boolean operations (Green highlight)
  extrusionDepth: number;
  elevation: number; // Z-axis height
  // Material Props
  color?: string; // Override layer color
  roughness: number; // 0 to 1
  metalness: number; // 0 to 1
  texture?: string; // Texture ID or URL
  operation: 'solid' | 'cut'; // Boolean ops
}

export interface LineEntity extends BaseEntity {
  type: 'line';
  start: Point;
  end: Point;
}

export interface RectEntity extends BaseEntity {
  type: 'rectangle';
  start: Point; // Top-left
  width: number;
  height: number;
}

export interface CircleEntity extends BaseEntity {
  type: 'circle';
  center: Point;
  radius: number;
}

export interface SphereEntity extends BaseEntity {
  type: 'sphere';
  center: Point;
  radius: number;
}

export interface PolygonEntity extends BaseEntity {
  type: 'polygon';
  points: Point[];
  holes?: Point[][]; // Array of paths that define holes
}

export interface LightEntity extends BaseEntity {
    type: 'light';
    position: Point; // X, Y (Z comes from elevation)
    target: Point; // Where the light points to
    intensity: number;
    distance: number;
    coneAngle?: number;
}

export type Entity = LineEntity | RectEntity | CircleEntity | PolygonEntity | SphereEntity | LightEntity;

export interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface ProjectData {
  id: string;
  name: string;
  entities: Entity[];
  layers: Layer[];
  lastModified: number;
}

export interface User {
  id: string;
  username: string;
  token: string;
}