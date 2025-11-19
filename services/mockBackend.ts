import { ProjectData, User, Entity, Layer } from '../types';
import { DEFAULT_LAYERS, MOCK_USER } from '../constants';

// Simulating a backend delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class MockBackend {
  private projects: ProjectData[] = [];

  constructor() {
    // Initialize with a demo project if empty
    const stored = localStorage.getItem('webcad_projects');
    if (stored) {
      this.projects = JSON.parse(stored);
    } else {
      this.projects = [{
        id: 'demo-project',
        name: 'Demo Project',
        entities: [],
        layers: DEFAULT_LAYERS,
        lastModified: Date.now(),
      }];
    }
  }

  private saveToDisk() {
    localStorage.setItem('webcad_projects', JSON.stringify(this.projects));
  }

  async login(username: string, password: string): Promise<User> {
    await delay(500);
    return MOCK_USER;
  }

  async getProjects(): Promise<ProjectData[]> {
    await delay(300);
    return this.projects;
  }

  async getProject(id: string): Promise<ProjectData | null> {
    await delay(200);
    return this.projects.find((p) => p.id === id) || null;
  }

  async saveProject(id: string, entities: Entity[], layers: Layer[]): Promise<boolean> {
    await delay(400);
    const idx = this.projects.findIndex((p) => p.id === id);
    if (idx >= 0) {
      this.projects[idx] = {
        ...this.projects[idx],
        entities,
        layers,
        lastModified: Date.now(),
      };
      this.saveToDisk();
      return true;
    }
    return false;
  }

  async createProject(name: string): Promise<ProjectData> {
    await delay(300);
    const newProject: ProjectData = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      entities: [],
      layers: DEFAULT_LAYERS,
      lastModified: Date.now(),
    };
    this.projects.push(newProject);
    this.saveToDisk();
    return newProject;
  }
}

export const backend = new MockBackend();