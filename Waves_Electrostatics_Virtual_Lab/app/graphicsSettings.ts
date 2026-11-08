// @ts-check

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

export type GraphicsSettings = {
  preset: GraphicsPreset;
  resolutionScale: number; // 0.75, 1.0, 1.25, 1.5, 2.0
  shadows: 'off' | 'low' | 'medium' | 'high';
  lightingQuality: 'simple' | 'medium' | 'full';
  antialiasing: boolean;
  frameRateLimit: number; // 30, 60, 0 (0 = uncapped)
  showFpsCounter: boolean;
  bloomAndAtmosphere: boolean;
};

export const GRAPHICS_PRESETS: Record<Exclude<GraphicsPreset, 'custom'>, GraphicsSettings> = {
  low: {
    preset: 'low',
    resolutionScale: 0.85,
    shadows: 'off',
    lightingQuality: 'simple',
    antialiasing: false,
    frameRateLimit: 30,
    showFpsCounter: false,
    bloomAndAtmosphere: false,
  },
  medium: {
    preset: 'medium',
    resolutionScale: 1.0,
    shadows: 'low',
    lightingQuality: 'medium',
    antialiasing: true,
    frameRateLimit: 60,
    showFpsCounter: false,
    bloomAndAtmosphere: true,
  },
  high: {
    preset: 'high',
    resolutionScale: 1.5,
    shadows: 'high',
    lightingQuality: 'full',
    antialiasing: true,
    frameRateLimit: 60,
    showFpsCounter: false,
    bloomAndAtmosphere: true,
  },
  ultra: {
    preset: 'ultra',
    resolutionScale: 2.0,
    shadows: 'high',
    lightingQuality: 'full',
    antialiasing: true,
    frameRateLimit: 0,
    showFpsCounter: true,
    bloomAndAtmosphere: true,
  },
};

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = { ...GRAPHICS_PRESETS.high };

const STORAGE_KEY = 'room3_graphics_settings';

export function loadGraphicsSettings(): GraphicsSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_GRAPHICS_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRAPHICS_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      preset: parsed.preset || 'high',
      resolutionScale: typeof parsed.resolutionScale === 'number' ? parsed.resolutionScale : 1.5,
      shadows: parsed.shadows || 'high',
      lightingQuality: parsed.lightingQuality || 'full',
      antialiasing: typeof parsed.antialiasing === 'boolean' ? parsed.antialiasing : true,
      frameRateLimit: typeof parsed.frameRateLimit === 'number' ? parsed.frameRateLimit : 60,
      showFpsCounter: Boolean(parsed.showFpsCounter),
      bloomAndAtmosphere: typeof parsed.bloomAndAtmosphere === 'boolean' ? parsed.bloomAndAtmosphere : true,
    };
  } catch (err) {
    console.warn('Failed to load graphics settings from localStorage:', err);
    return { ...DEFAULT_GRAPHICS_SETTINGS };
  }
}

export function saveGraphicsSettings(settings: GraphicsSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save graphics settings to localStorage:', err);
  }
}

export function detectGpuRenderer(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): string {
  if (typeof window === 'undefined') return 'WebGL 2.0 Hardware';
  try {
    let context = gl;
    if (!context) {
      const canvas = document.createElement('canvas');
      context = canvas.getContext('webgl2') || canvas.getContext('webgl') as WebGLRenderingContext | null;
    }
    if (!context) return 'Standard WebGL Accelerator';

    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      if (renderer) return String(renderer).replace(/Direct3D11 vs_5_0 ps_5_0/i, '').replace(/[()]/g, '').trim();
    }
    const vendor = context.getParameter(context.RENDERER);
    return vendor ? String(vendor) : 'WebGL Hardware Accelerated';
  } catch {
    return 'WebGL 2.0 Standard GPU';
  }
}
