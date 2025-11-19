
export const GRID_SIZE = 10; // units
export const GRID_COLOR_MAJOR = '#334155';
export const GRID_COLOR_MINOR = '#1e293b';
export const BACKGROUND_COLOR = '#0f172a';
export const SELECTION_COLOR = '#3b82f6';
export const HIGHLIGHT_COLOR = '#60a5fa';

export const DEFAULT_LAYERS = [
  { id: 'layer-0', name: 'Default', color: '#ffffff', visible: true, locked: false },
  { id: 'layer-1', name: 'Construction', color: '#fbbf24', visible: true, locked: false },
];

export const MOCK_USER = {
  id: 'user-1',
  username: 'DemoUser',
  token: 'mock-jwt-token-123'
};

export const TEXTURES = [
    { id: 'none', label: 'None', url: '' },
    { id: 'checkered', label: 'Checkers (Procedural)', url: 'procedural' },
    { id: 'concrete', label: 'Concrete (Procedural)', url: 'procedural' },
    { id: 'wood', label: 'Wood (Procedural)', url: 'procedural' },
    { id: 'brick', label: 'Brick (Procedural)', url: 'procedural' },
    { id: 'metal', label: 'Metal (Procedural)', url: 'procedural' },
];
