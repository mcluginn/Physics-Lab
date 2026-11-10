import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import {
  type CircuitSettings,
  type OpticsSettings,
  type RelativitySettings,
  type Room3StationId,
  calculateCircuit,
  calculateOptics,
  calculateRelativity,
  wavelengthToRGB,
} from './room3Model';
import { CharacterController, type CharacterType } from './characterController';
import { ROOM2_CONFIG } from './labSceneConfig';
import { Multimeter3D } from './room3Multimeter3D';
import {
  type MultimeterMode,
  type MultimeterJack,
  type TerminalId,
  type MultimeterReading,
} from './circuitSolver';
import {
  type GraphicsSettings,
  DEFAULT_GRAPHICS_SETTINGS,
  detectGpuRenderer,
} from './graphicsSettings';

export type Room3SceneApi = {
  dispose: () => void;
  interact: () => void;
  openDoor: (onOpened?: () => void) => void;
  requestPointerLock: () => void;
  resetView: () => void;
  toggleView: () => boolean;
  switchCharacter: () => CharacterType;
  setCharacter: (type: CharacterType) => void;
  getCharacter: () => CharacterType;
  setMove: (direction: 'forward' | 'backward' | 'left' | 'right', active: boolean) => void;
  setMoveVector: (right: number, forward: number) => void;
  setCircuits: (settings: CircuitSettings) => void;
  setOptics: (settings: OpticsSettings) => void;
  setRelativity: (settings: RelativitySettings) => void;
  setStation: (station: Room3StationId) => void;
  setGuidance: (interactionId: string | null) => void;
  setPaused: (paused: boolean) => void;
  setCameraMode: (mode: 'walk' | 'closeup', targetStation?: Room3StationId) => void;
  getCameraMode: () => 'walk' | 'closeup';
  setDmmMode: (mode: MultimeterMode) => void;
  setDmmJack: (jack: MultimeterJack) => void;
  setProbeTerminal: (probe: 'red' | 'black', terminal: TerminalId | null) => void;
  flipProbePolarity: () => void;
  toggleSeriesJumper: () => void;
  resetDmmFuse: () => void;
  getDmmReading: () => MultimeterReading;
  setCloseupFocus?: (focus: 'station' | 'board' | 'multimeter' | 'psu') => void;
  setCameraYawPitch?: (targetYaw: number, targetPitch?: number) => void;
  setGraphicsSettings: (settings: GraphicsSettings) => void;
  getGraphicsSettings: () => GraphicsSettings;
  getGpuInfo: () => string;
};

export type EquipmentInteraction = {
  id: string;
  stationId: Room3StationId | 'hallway';
  category: string;
  name: string;
  description: string;
  action: string;
  readout: string;
};

export type Room3SceneCallbacks = {
  onAssetProgress?: (loaded: number, total: number) => void;
  onAssetsReady?: () => void;
  onEquipmentInteract?: (id: string) => void;
  onFootstep?: () => void;
  onInteractionChange?: (interaction: EquipmentInteraction | null) => void;
  onPointerLockChange?: (locked: boolean) => void;
  onCameraModeChange?: (mode: 'walk' | 'closeup') => void;
  onDmmReadingChange?: (reading: MultimeterReading) => void;
  onProbePlaced?: (probe: 'red' | 'black', terminal: TerminalId) => void;
  onCloseupHover?: (text: string | null) => void;
  onStationProximityChange?: (station: Room3StationId | null) => void;
  onPerfStatsChange?: (fps: number, frameTimeMs: number) => void;
};

export const ROOM3_EQUIPMENT_DESCRIPTIONS: Record<string, string> = {
  // Station 01: Circuits
  'circuits-power-switch': 'Heavy-duty illuminated rocker switch that energizes the DC power supply and AC function generator.',
  'circuits-mode-toggle': 'Switches the circuit excitation regime between DC Steady-State and AC Sinusoidal (RLC).',
  'circuits-voltage-knob': 'Precision ten-turn potentiometer dial adjusting source voltage Vs from 1.0 V to 240.0 V.',
  'circuits-freq-knob': 'AC frequency synthesizer dial tuning driving frequency f from 10 Hz to 1000 Hz.',
  'circuits-topology-selector': 'Electronic patchboard selector switching between Series, Parallel, and Series-Parallel combinations.',
  'circuits-oscilloscope': 'Tektronix Dual-Channel Digital Storage Oscilloscope rendering live real-time V(t) and I(t) waveforms and phase angle.',
  'circuits-multimeter': 'Fluke High-Accuracy Digital Multimeter measuring loop voltages, branch currents, and circuit continuity.',
  'circuits-clipboard': 'Official laboratory documentation clipboard for DC & AC circuit experiments. Press [E] to log trial data.',
  'circuits-placard': 'Architectural wall placard illustrating Ohm\'s Law, Kirchhoff\'s Laws, AC phasor diagrams, and impedance equations.',

  // Station 02: Optics
  'optics-laser': 'Tunable continuous-wave diode laser emitter (λ = 400–700 nm) mounted on a precision optical carriage.',
  'optics-submode-toggle': 'Rotary mode switch selecting Refraction & TIR, Lenses & Mirrors, or Double-Slit Diffraction.',
  'optics-angle-dial': '360° vernier goniometer dial regulating incident beam angle θ₁ from 0.0° to 89.0° against the dielectric prism.',
  'optics-lens-carrier': 'Low-friction optical rail sled holding converging/diverging lenses with variable focal length f and object distance do.',
  'optics-slit-carrier': 'Precision optical aperture mount holding single and double slits with adjustable separation d and width a.',
  'optics-screen': 'Movable diffuse projection screen displaying live diffraction fringes and interference intensity profiles.',
  'optics-clipboard': 'Official laboratory documentation clipboard for optical experiments. Press [E] to log trial data.',
  'optics-placard': 'Architectural wall placard illustrating Snell\'s Law, thin-lens ray diagrams, and Young\'s double-slit formulas.',

  // Station 03: Special Relativity
  'relativity-velocity-dial': 'Ultra-relativistic velocity ratio dial regulating frame speed β = v/c from 0.000c to 0.999c.',
  'relativity-light-clock': 'Geometric photon light-clock illustrating the diagonal photon path proving time dilation Δt = γ Δt₀.',
  'relativity-contracting-rod': 'Calibrated 3D meter-rod that visibly contracts by factor 1/γ strictly along the axis of motion.',
  'relativity-calorimeter': 'Cryogenic mass-energy calorimeter measuring rest energy E₀ and relativistic kinetic energy K.',
  'relativity-accelerator': 'Relativistic linear beam pipe demonstrating particle momentum p = γ m₀ v and Cherenkov emission.',
  'relativity-clipboard': 'Official laboratory documentation clipboard for special relativity experiments. Press [E] to log trial data.',
  'relativity-placard': 'Architectural wall placard illustrating Einstein\'s postulates, Lorentz factor γ, and E = γ m₀ c².',

  // Environmental Casework & Hallway Exit
  'campus-door': 'Solid mahogany double doors leading back to the University Science Hallway. Walk through or press [E] to return.',
  'physics-whiteboard': 'Master Physics III lecture whiteboard detailing DC/AC circuit derivations, Snell\'s law & diffraction, and Lorentz spacetime equations.',
  'lab-cabinet': 'Reinforced laboratory display cabinet storing precision optical lenses, dielectric prisms, and high-voltage calibration tools.',
  'lab-eyewash': 'Emergency eye wash and safety drench station. ANSI Z358.1 compliant for chemical and laser safety.',
  'lab-fire-station': 'Emergency dry chemical Class ABC fire extinguisher and safety inspection tag.',
  'lab-electrical-panel': 'High-voltage laboratory isolation circuit breaker panel with lockout-tagout interlocks.',
  'lab-window': 'South clerestory daylight observation window offering natural campus quad daylight and spatial orientation.',
};

export const STATION_X: Record<Room3StationId, number> = {
  circuits: -6.0,
  optics: 0.0,
  relativity: 6.0,
};

export const STATION_COLOR: Record<Room3StationId, number> = {
  circuits: 0x38bdf8,
  optics: 0x10b981,
  relativity: 0xa855f7,
};

function material(color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, ...options });
}

export function createRoom3Scene(
  container: HTMLDivElement,
  callbacks: Room3SceneCallbacks = {}
): Room3SceneApi {
  // 1. Scene, Camera, Renderer Setup
  const scene = new THREE.Scene();
  // Deep Celestial Cosmos Atmosphere matching Room 04
  scene.background = new THREE.Color(0x040814);
  scene.fog = new THREE.Fog(0x040814, 32, 115);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 115);
  let activeStation: Room3StationId = 'circuits';
  const eyeHeight = 1.70;
  // Student initially stands on the central inlaid brass compass rose medallion, facing north toward the workbenches
  const playerPosition = new THREE.Vector3(0, eyeHeight, 3.8);
  let yaw = 0;
  let pitch = -0.06;
  const movement = { forward: false, backward: false, left: false, right: false };
  const turning = { left: false, right: false };
  const analogMovement = new THREE.Vector2();

  let isPaused = false;
  let doorOpen = false;
  let doorAnimAngle = 0;
  let doorTargetAngle = 0;
  let isDoorOpening = false;
  let doorOpenedCallback: (() => void) | null = null;
  let leftExitLeaf: THREE.Mesh | null = null;
  let rightExitLeaf: THREE.Mesh | null = null;

  // Character Controller - Default Third-Person Character Camera for Immersive Exploration (matching Room 04)
  const character = new CharacterController({
    scene,
    floorY: ROOM2_CONFIG.room.floorY,
    initialPosition: playerPosition,
    initialYaw: yaw,
    defaultCharacter: 'female',
    allowThirdPerson: true,
    defaultThirdPerson: true,
  });

  const updateCamera = () => {
    character.updateCamera(camera, playerPosition, yaw, pitch);
  };
  updateCamera();

  const sconceLights: THREE.PointLight[] = [];
  const downlights: THREE.PointLight[] = [];
  let currentGraphicsSettings: GraphicsSettings = { ...DEFAULT_GRAPHICS_SETTINGS };

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, currentGraphicsSettings.resolutionScale));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const applyGraphicsSettings = (newSettings: GraphicsSettings) => {
    currentGraphicsSettings = { ...newSettings };

    // 1. Resolution / Pixel Ratio
    const pixelRatio = Math.min(window.devicePixelRatio, currentGraphicsSettings.resolutionScale);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight, false);

    // 2. Shadows Quality
    if (currentGraphicsSettings.shadows === 'off') {
      renderer.shadowMap.enabled = false;
      keyLight.castShadow = false;
    } else {
      renderer.shadowMap.enabled = true;
      keyLight.castShadow = true;
      if (currentGraphicsSettings.shadows === 'low') {
        renderer.shadowMap.type = THREE.BasicShadowMap;
        keyLight.shadow.mapSize.set(512, 512);
      } else if (currentGraphicsSettings.shadows === 'medium') {
        renderer.shadowMap.type = THREE.PCFShadowMap;
        keyLight.shadow.mapSize.set(1024, 1024);
      } else {
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        keyLight.shadow.mapSize.set(2048, 2048);
      }
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.04;
      keyLight.shadow.map?.dispose();
      keyLight.shadow.map = null;
    }

    // 3. Lighting Quality
    sconceLights.forEach((light) => {
      light.visible = currentGraphicsSettings.lightingQuality !== 'simple';
      light.intensity = currentGraphicsSettings.lightingQuality === 'medium' ? 0.30 : 0.45;
    });
    downlights.forEach((light) => {
      light.visible = currentGraphicsSettings.lightingQuality === 'full';
    });

    // 4. Force shader recompilation on material properties change
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => (m.needsUpdate = true));
        } else {
          obj.material.needsUpdate = true;
        }
      }
    });
  };

  // Simulation parameters
  let currentCircuits: CircuitSettings = {
    mode: 'dc',
    topology: 'series',
    vs: 24.0,
    freq: 60.0,
    r1: 100.0,
    r2: 220.0,
    r3: 330.0,
    inductance: 150.0,
    capacitance: 47.0,
  };

  let currentOptics: OpticsSettings = {
    subMode: 'refraction',
    wavelength: 532,
    n1: 1.00,
    n2: 1.52,
    theta1: 30.0,
    focalLength: 20.0,
    objectDistance: 40.0,
    slitWidth: 0.08,
    slitSeparation: 0.25,
    screenDistance: 2.00,
  };

  let currentRelativity: RelativitySettings = {
    beta: 0.600,
    properTime: 10.0,
    properLength: 20.0,
    massPreset: 'alpha',
    restMass: 6.644657e-27,
  };

  // -------------------------------------------------------------
  // 2. Texture & Asset Loading
  // -------------------------------------------------------------
  const loadingManager = new THREE.LoadingManager();
  loadingManager.onProgress = (_url, loaded, total) => callbacks.onAssetProgress?.(loaded, total);
  loadingManager.onLoad = () => callbacks.onAssetsReady?.();

  const textureLoader = new THREE.TextureLoader(loadingManager);

  const loadTexture = (path: string, fallback = '#173047') => {
    const loadedTexture = textureLoader.load(path, undefined, undefined, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = fallback;
        context.fillRect(0, 0, 64, 64);
      }
      loadedTexture.image = canvas as unknown as HTMLImageElement;
      loadedTexture.needsUpdate = true;
    });
    return loadedTexture;
  };

  const floorTexture = loadTexture('/assets/textures/lab_floor_tiles.jpg', '#455a70');
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(12, 8);

  const benchTexture = loadTexture('/assets/textures/workbench_epoxy_top.jpg', '#1b2735');
  benchTexture.wrapS = benchTexture.wrapT = THREE.RepeatWrapping;
  benchTexture.repeat.set(2.4, 1.2);

  const placardTextures: Record<Room3StationId, THREE.Texture> = {
    circuits: loadTexture('/assets/placards/apparatus_electricity.png'),
    optics: loadTexture('/assets/placards/apparatus_optics.png'),
    relativity: loadTexture('/assets/placards/apparatus_relativity.png'),
  };
  (Object.keys(placardTextures) as Room3StationId[]).forEach((id) => {
    placardTextures[id].colorSpace = THREE.SRGBColorSpace;
  });

  const mahoganyDoorTex = loadTexture('/assets/door/maps/Entrance_Door_the mahogany.jpg', '#3b160b');
  mahoganyDoorTex.colorSpace = THREE.SRGBColorSpace;
  mahoganyDoorTex.wrapS = mahoganyDoorTex.wrapT = THREE.RepeatWrapping;
  mahoganyDoorTex.repeat.set(1.5, 1.5);

  const lightBrassTex = loadTexture('/assets/door/maps/Entrance_Door_light brass.jpg', '#d4af37');
  lightBrassTex.colorSpace = THREE.SRGBColorSpace;
  lightBrassTex.wrapS = lightBrassTex.wrapT = THREE.RepeatWrapping;

  const darkBrassTex = loadTexture('/assets/door/maps/Entrance_Door_dark brass.jpg', '#8a6523');
  darkBrassTex.colorSpace = THREE.SRGBColorSpace;
  darkBrassTex.wrapS = darkBrassTex.wrapT = THREE.RepeatWrapping;

  const doorMahoganyMat = new THREE.MeshStandardMaterial({
    map: mahoganyDoorTex,
    color: 0x5a2310,
    roughness: 0.38,
    metalness: 0.06,
  });

  const doorBrassMat = new THREE.MeshStandardMaterial({
    map: lightBrassTex,
    color: 0xf5d372,
    roughness: 0.28,
    metalness: 0.88,
  });

  const doorDarkBrassMat = new THREE.MeshStandardMaterial({
    map: darkBrassTex,
    color: 0xb58b44,
    roughness: 0.45,
    metalness: 0.82,
  });

  // Clean synthesized audio tone generator for multimeter beeps and mechanical clicks
  const playTone = (freq: number, type: OscillatorType = 'sine', duration = 0.1, vol = 0.15) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // Audio context might be restricted before user gesture
    }
  };

  // Sound synthesis for mechanical door click and heavy mahogany swing
  const playDoorSound = (isOpen: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Mechanical brass latch click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isOpen ? 640 : 420, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);

      // Deep resonance of heavy mahogany wood door swing
      const bufferSize = Math.floor(ctx.sampleRate * 0.35);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.12));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);
      filter.frequency.linearRampToValueAtTime(140, now + 0.35);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.14, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      noise.connect(filter).connect(noiseGain).connect(ctx.destination);
      noise.start(now);
    } catch {}
  };

  // -------------------------------------------------------------
  // 3. Procedural High-Resolution Canvases
  // -------------------------------------------------------------
  // Engraved Mahogany Entrance Plaque
  const createEngravedWoodSignTexture = (
    line1: string,
    line2: string,
    line3: string
  ): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    const woodGrad = ctx.createLinearGradient(0, 0, 0, 512);
    woodGrad.addColorStop(0.0, '#240d06');
    woodGrad.addColorStop(0.15, '#3b160b');
    woodGrad.addColorStop(0.5, '#4e1e0f');
    woodGrad.addColorStop(0.85, '#381409');
    woodGrad.addColorStop(1.0, '#1f0904');
    ctx.fillStyle = woodGrad;
    ctx.fillRect(0, 0, 2048, 512);

    // Wood Grain Striations
    ctx.save();
    for (let y = 0; y < 512; y += 2) {
      const grainWave = Math.sin(y * 0.16 + Math.cos(y * 0.03) * 2.8);
      const grainAlpha = 0.03 + 0.06 * Math.max(0, grainWave);
      ctx.strokeStyle = y % 4 === 0 ? `rgba(16, 5, 2, ${grainAlpha * 1.6})` : `rgba(115, 48, 22, ${grainAlpha * 0.9})`;
      ctx.lineWidth = 1 + (y % 3 === 0 ? 1 : 0);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 2048; x += 128) {
        ctx.lineTo(x, y + Math.sin(x * 0.003 + y * 0.01) * 3.0);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Carved Molding Frame & Gold Rosettes
    ctx.save();
    ctx.strokeStyle = 'rgba(10, 3, 1, 0.95)';
    ctx.lineWidth = 6;
    ctx.strokeRect(26, 22, 1996, 468);
    const brassBorderGrad = ctx.createLinearGradient(0, 36, 0, 476);
    brassBorderGrad.addColorStop(0.0, '#e8ca7e');
    brassBorderGrad.addColorStop(0.5, '#c59a42');
    brassBorderGrad.addColorStop(1.0, '#75521a');
    ctx.strokeStyle = brassBorderGrad;
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 36, 1968, 440);

    const drawCornerRosette = (cx: number, cy: number) => {
      ctx.save();
      ctx.fillStyle = '#b88934';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f3dd9e';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    };
    drawCornerRosette(40, 36);
    drawCornerRosette(2008, 36);
    drawCornerRosette(40, 476);
    drawCornerRosette(2008, 476);
    ctx.restore();

    // Carved Debossed Typography
    const drawCarvedText = (
      text: string,
      x: number,
      y: number,
      font: string,
      fontSize: number,
      isPrimaryGold: boolean
    ) => {
      ctx.save();
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const depth = isPrimaryGold ? 4.5 : 3.0;

      ctx.fillStyle = isPrimaryGold ? 'rgba(255, 230, 160, 0.55)' : 'rgba(135, 62, 28, 0.48)';
      ctx.fillText(text, x, y + depth * 0.7);

      ctx.fillStyle = 'rgba(7, 2, 1, 0.98)';
      ctx.fillText(text, x, y - depth);

      if (isPrimaryGold) {
        const goldGrad = ctx.createLinearGradient(0, y - fontSize * 0.5, 0, y + fontSize * 0.5);
        goldGrad.addColorStop(0.0, '#fae8a8');
        goldGrad.addColorStop(0.35, '#d6ad44');
        goldGrad.addColorStop(0.70, '#b8860b');
        goldGrad.addColorStop(1.0, '#855c0c');
        ctx.fillStyle = goldGrad;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
      } else {
        const brassGrad = ctx.createLinearGradient(0, y - fontSize * 0.5, 0, y + fontSize * 0.5);
        brassGrad.addColorStop(0.0, '#e0c07c');
        brassGrad.addColorStop(0.6, '#b58b42');
        brassGrad.addColorStop(1.0, '#75521b');
        ctx.fillStyle = brassGrad;
      }
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    drawCarvedText(line1, 1024, 105, '700 28px Georgia, serif', 28, false);
    drawCarvedText(line2, 1024, 250, '800 54px Georgia, serif', 54, true);
    drawCarvedText(line3, 1024, 395, '700 30px Georgia, serif', 30, false);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  // Master Physics III Whiteboard Texture
  const createRoom3WhiteboardTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Porcelain surface
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1024);
    bgGrad.addColorStop(0, '#fbfcfe');
    bgGrad.addColorStop(0.5, '#f4f6f9');
    bgGrad.addColorStop(1, '#edf1f5');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 2048, 1024);

    // Ghosted erased chalk lines for authentic realism
    ctx.fillStyle = 'rgba(100, 120, 140, 0.03)';
    for (let i = 0; i < 35; i++) {
      ctx.fillRect(40 + (i * 53) % 1900, 80 + (i * 29) % 850, 110, 16);
    }

    // Top Header Banner
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 36px "Segoe UI", -apple-system, sans-serif';
    ctx.fillText('EXPERIMENTAL PHYSICS III: ELECTRICITY, OPTICS & SPECIAL RELATIVITY', 55, 65);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 20px "Segoe UI", sans-serif';
    ctx.fillText('LABORATORY 03 · GOVERNING EQUATIONS & THEORETICAL DERIVATIONS', 55, 100);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(50, 120);
    ctx.lineTo(1998, 120);
    ctx.stroke();

    // Column Dividers
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(690, 135);
    ctx.lineTo(690, 960);
    ctx.moveTo(1350, 135);
    ctx.lineTo(1350, 960);
    ctx.stroke();

    // --- COLUMN 1: DC & AC ELECTRICAL CIRCUITS ---
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillText('1. DC & AC ELECTRICAL CIRCUITS', 55, 165);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText("Ohm's Law & Kirchhoff's Rules:", 55, 210);
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText('I = Vs / Req        Σ I_in = Σ I_out', 75, 250);

    ctx.fillStyle = '#475569';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('Series: Req = R1 + R2 + R3', 75, 285);
    ctx.fillText('Parallel: 1/Req = 1/R1 + 1/R2 + 1/R3', 75, 315);
    ctx.fillText('Real Power: P = I²·Req = Vs·I  [W]', 75, 345);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('AC Sinusoidal RLC Phasor Impedance:', 55, 395);
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText('Z = √(Req² + (XL - XC)²)      tan φ = (XL - XC) / Req', 75, 435);
    ctx.fillStyle = '#475569';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('XL = 2π f L   |   XC = 1 / (2π f C)', 75, 470);
    ctx.fillText('Resonance: f0 = 1 / (2π √(L C))   (φ = 0°, cos φ = 1.0)', 75, 500);

    // Phasor Diagram Graphic Box
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(55, 530, 600, 210);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(56, 531, 598, 208);

    // Phasor Vector Lines
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(120, 640);
    ctx.lineTo(360, 640); // VR (horizontal)
    ctx.stroke();
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.fillText('V_R (in phase with I)', 200, 665);

    ctx.strokeStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(360, 640);
    ctx.lineTo(360, 560); // VL - VC (vertical)
    ctx.stroke();
    ctx.fillStyle = '#10b981';
    ctx.fillText('V_L - V_C', 375, 600);

    ctx.strokeStyle = '#eab308';
    ctx.beginPath();
    ctx.moveTo(120, 640);
    ctx.lineTo(360, 560); // Vs total
    ctx.stroke();
    ctx.fillStyle = '#ca8a04';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText('V_s (Total Phasor)', 180, 580);

    // --- COLUMN 2: GEOMETRIC & PHYSICAL OPTICS ---
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillText('2. GEOMETRIC & PHYSICAL OPTICS', 715, 165);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText("Snell's Law of Refraction & TIR:", 715, 210);
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText('n1 · sin θ1 = n2 · sin θ2', 735, 250);

    ctx.fillStyle = '#475569';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('Critical Angle: sin θc = n2 / n1  (n1 > n2)', 735, 285);
    ctx.fillText('Total Internal Reflection occurs when θ1 > θc', 735, 315);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('Thin Lens Formula & Young\'s Double Slit:', 715, 365);
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText('1/f = 1/do + 1/di      M = -di / do', 735, 405);
    ctx.fillText('Δy = (λ · L) / d       (Fringe Spacing)', 735, 445);

    // Optics Ray Diagram Box
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(715, 475, 600, 265);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(716, 476, 598, 263);

    // Draw Semicircular prism and laser ray
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(1015, 610, 80, -Math.PI / 2, Math.PI / 2, true);
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Incident ray
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(850, 520);
    ctx.lineTo(1015, 610);
    ctx.lineTo(1180, 610); // Refracted ray
    ctx.stroke();
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.fillText('Incident θ1', 860, 560);
    ctx.fillText('Refracted θ2', 1100, 635);

    // --- COLUMN 3: SPECIAL THEORY OF RELATIVITY ---
    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillText('3. SPECIAL THEORY OF RELATIVITY', 1375, 165);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('Einstein\'s Postulates & Lorentz Factor:', 1375, 210);
    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText('γ = 1 / √(1 - β²)       β = v / c', 1395, 250);

    ctx.fillStyle = '#475569';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('Time Dilation: Δt = γ · Δt0', 1395, 285);
    ctx.fillText('Length Contraction: L = L0 / γ  (along axis of motion)', 1395, 315);
    ctx.fillText('Relativistic Momentum: p = γ · m0 · v', 1395, 345);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('Mass-Energy Equivalence:', 1375, 395);
    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 26px Georgia, serif';
    ctx.fillText('E = γ · m0 · c² = E0 + K', 1395, 435);
    ctx.fillStyle = '#475569';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('Rest Energy: E0 = m0 · c²', 1395, 470);
    ctx.fillText('Kinetic Energy: K = (γ - 1) · m0 · c²', 1395, 500);

    // Relativity Light Clock Graphic Box
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(1375, 530, 600, 210);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(1376, 531, 598, 208);

    // Frame S' vertical light clock vs Frame S diagonal light path
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(1420, 560, 100, 10); // Mirror 1
    ctx.strokeRect(1420, 680, 100, 10); // Mirror 2
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1470, 680);
    ctx.lineTo(1470, 570);
    ctx.stroke();
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillText("Proper Frame S': Δt0 = 2d / c", 1395, 715);

    ctx.strokeStyle = '#64748b';
    ctx.strokeRect(1650, 560, 100, 10);
    ctx.strokeRect(1780, 680, 100, 10);
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1650, 680);
    ctx.lineTo(1700, 570);
    ctx.lineTo(1830, 680);
    ctx.stroke();
    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillText("Lab Frame S: Diagonal Path Δt = γ·Δt0", 1630, 715);

    // Footer note
    ctx.fillStyle = '#1e293b';
    ctx.font = 'italic 16px Georgia, serif';
    ctx.fillText('★ Keep laser safety interlocks engaged during beam propagation. High-voltage power supplies isolated.', 55, 995);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };

  const doorSignTexture = createEngravedWoodSignTexture(
    'DEPARTMENT OF PHYSICS   ·   EXPERIMENTAL SCIENCES',
    'EXIT   ·   MAIN LABORATORY HALLWAY',
    '✦   ROOM 03 EXIT   ·   PRESS [E] OR CLICK TO RETURN TO HALLWAY   ✦'
  );
  const whiteboardTexture = createRoom3WhiteboardTexture();

  const createCircuitsPosterTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 768, 512);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, 0, 768, 8);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 24px "Segoe UI", sans-serif';
    ctx.fillText('ELECTROMAGNETIC RLC PHASOR IMPEDANCE', 32, 48);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.fillText('PHYSICS LABORATORY REFERENCE · CIRCUITS BENCH', 32, 75);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 92);
    ctx.lineTo(736, 92);
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(32, 110, 336, 170);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(32, 110, 336, 170);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.fillText('Series-Parallel RLC Relations', 52, 142);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('Z = √(Req² + (XL - XC)²)', 52, 182);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('Resonance: XL = XC  (Z_min = Req)', 52, 220);
    ctx.fillText('Power Factor: cos φ = Req / Z', 52, 245);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(400, 110, 336, 170);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(400, 110, 336, 170);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.fillText('Quality Factor & Bandwidth', 420, 142);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('Q = (1/R) · √(L/C)   BW = f0 / Q', 420, 182);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('Higher Q yields sharp resonance peak', 420, 220);
    ctx.fillText('Selectivity criterion in RF filters', 420, 245);

    ctx.fillStyle = '#090d16';
    ctx.fillRect(32, 300, 704, 180);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(32, 300, 704, 180);

    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let px = 40; px <= 730; px += 2) {
      const y = 390 - Math.sin((px - 40) * 0.035) * 55;
      if (px === 40) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let px = 40; px <= 730; px += 2) {
      const y = 390 - Math.sin((px - 40) * 0.035 - 0.75) * 45;
      if (px === 40) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillText('Voltage V(t)', 55, 330);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('Current I(t) [Lagging inductive phase]', 180, 330);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };

  const createRelativityPosterTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 768, 512);
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(0, 0, 768, 8);
    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 24px "Segoe UI", sans-serif';
    ctx.fillText('SPACETIME GEOMETRY & MINKOWSKI LIGHT-CONE', 32, 48);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.fillText('PHYSICS LABORATORY REFERENCE · RELATIVITY BENCH', 32, 75);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 92);
    ctx.lineTo(736, 92);
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(32, 110, 336, 170);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(32, 110, 336, 170);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.fillText('Invariant Spacetime Interval', 52, 142);
    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('Δs² = c²Δt² - Δx²', 52, 182);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('Δs² > 0: Timelike (Causally linked)', 52, 220);
    ctx.fillText('Δs² = 0: Lightlike (Photon worldline)', 52, 245);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(400, 110, 336, 170);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(400, 110, 336, 170);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.fillText('Relativistic Longitudinal Doppler', 420, 142);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('f_obs = f_s · √((1 - β) / (1 + β))', 420, 182);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('Receding source: Redshift (z > 0)', 420, 220);
    ctx.fillText('Approaching source: Blueshift (z < 0)', 420, 245);

    ctx.fillStyle = '#090d16';
    ctx.fillRect(32, 300, 704, 180);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(32, 300, 704, 180);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(384, 310);
    ctx.lineTo(384, 470);
    ctx.moveTo(150, 390);
    ctx.lineTo(618, 390);
    ctx.stroke();

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(304, 470);
    ctx.lineTo(464, 310);
    ctx.moveTo(304, 310);
    ctx.lineTo(464, 470);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.fillText('Light Cone (v = c)', 475, 330);
    ctx.fillStyle = '#a855f7';
    ctx.fillText('ct (Time Axis)', 392, 325);
    ctx.fillText('x (Spatial Axis)', 625, 395);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };

  const circuitsPosterTex = createCircuitsPosterTexture();
  const relativityPosterTex = createRelativityPosterTexture();

  // -------------------------------------------------------------
  // 4. Lighting & Architectural Illumination (Warm Maroon & Mahogany Atmosphere)
  // -------------------------------------------------------------
  // Balanced warm sky and rich wood floor bounce light (matching Room 04's warm palette)
  const hemiLight = new THREE.HemisphereLight(0xfff3e0, 0x482218, 2.2);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfffaed, 1.85);
  keyLight.position.set(5, 10, 7);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.left = -15;
  keyLight.shadow.camera.right = 15;
  keyLight.shadow.camera.top = 15;
  keyLight.shadow.camera.bottom = -15;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 40;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.04;
  scene.add(keyLight);

  const stationLight = new THREE.PointLight(STATION_COLOR.circuits, 16, 12, 1.8);
  stationLight.position.set(STATION_X.circuits, 4.2, 1.5);
  scene.add(stationLight);

  // -------------------------------------------------------------
  // 5. In-World Guidance Marker (Matching Room 02 Exact Composite)
  // -------------------------------------------------------------
  const guidanceMaterial = new THREE.MeshStandardMaterial({
    color: STATION_COLOR.circuits,
    emissive: STATION_COLOR.circuits,
    emissiveIntensity: 3.2,
    roughness: 0.18,
    metalness: 0.12,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const guidanceRingMaterial = new THREE.MeshBasicMaterial({
    color: STATION_COLOR.circuits,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
  });
  const guidanceBeamMaterial = new THREE.LineBasicMaterial({
    color: STATION_COLOR.circuits,
    transparent: true,
    opacity: 0.70,
    depthTest: false,
    depthWrite: false,
  });

  const guidanceMarker = new THREE.Group();
  guidanceMarker.name = 'GuidanceMarker';
  guidanceMarker.renderOrder = 9999;

  const guidanceArrow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 20), guidanceMaterial);
  guidanceArrow.rotation.z = Math.PI; // Cone pointing down
  guidanceArrow.position.y = 0.13;
  guidanceArrow.renderOrder = 9999;

  const guidanceShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.18, 16), guidanceMaterial);
  guidanceShaft.position.y = 0.35;
  guidanceShaft.renderOrder = 9999;

  const guidanceRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 12, 36), guidanceRingMaterial);
  guidanceRing.rotation.x = Math.PI / 2;
  guidanceRing.position.y = 0;
  guidanceRing.renderOrder = 9999;

  const guidanceInnerRing = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 12, 28), guidanceRingMaterial);
  guidanceInnerRing.rotation.x = Math.PI / 2;
  guidanceInnerRing.position.y = 0;
  guidanceInnerRing.renderOrder = 9999;

  const guidanceLineGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.32, 0),
  ]);
  const guidanceBeam = new THREE.Line(guidanceLineGeom, guidanceBeamMaterial);
  guidanceBeam.renderOrder = 9999;

  guidanceMarker.add(guidanceArrow, guidanceShaft, guidanceRing, guidanceInnerRing, guidanceBeam);
  guidanceMarker.visible = false;
  scene.add(guidanceMarker);

  let activeGuidanceId: string | null = null;
  const guidancePosition = new THREE.Vector3();

  // -------------------------------------------------------------
  // 6. Architectural Room Shell (21.6m x 14.8m x 4.2m)
  // Adopting Room 04's Materials, Colors & Atmosphere
  // -------------------------------------------------------------
  // Texture Helper: Procedural Dark Walnut Parquet Floor (matching Room 04)
  const createWoodTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Warm dark walnut & rich mahogany wood base
    ctx.fillStyle = '#422213';
    ctx.fillRect(0, 0, 512, 512);

    // Fine wood grain lines
    for (let i = 0; i < 600; i++) {
      const y = Math.random() * 512;
      const h = Math.random() * 2 + 0.5;
      ctx.fillStyle = Math.random() > 0.4 ? 'rgba(87, 59, 42, 0.45)' : 'rgba(35, 18, 12, 0.55)';
      ctx.fillRect(0, y, 512, h);
    }

    // Floor plank seams
    for (let p = 0; p <= 512; p += 64) {
      ctx.strokeStyle = 'rgba(15, 8, 4, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 512);
      ctx.stroke();

      // Subtle brass nailhead accents along planks
      ctx.fillStyle = 'rgba(212, 175, 55, 0.25)';
      for (let ny = 16; ny < 512; ny += 64) {
        ctx.fillRect(p - 2, ny, 2, 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 6);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const woodTexture = createWoodTexture();
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: woodTexture,
    roughness: 0.38,
    metalness: 0.12,
  });

  // Architectural Materials
  const wallMaroonMaterial = new THREE.MeshStandardMaterial({
    color: 0x581c2c, // Deep Maroon primary architectural color
    roughness: 0.74,
    metalness: 0.10,
  });
  const wallBurgundyMaterial = new THREE.MeshStandardMaterial({
    color: 0x35121d, // Dark Burgundy
    roughness: 0.78,
    metalness: 0.08,
  });
  const creamPanelMaterial = new THREE.MeshStandardMaterial({
    color: 0xe9dfc9, // Warm Cream secondary wall surface
    roughness: 0.68,
    metalness: 0.05,
  });
  const mahoganyDeskMaterial = new THREE.MeshStandardMaterial({
    color: 0x34190c, // Rich Mahogany
    roughness: 0.42,
    metalness: 0.14,
  });
  const walnutMaterial = new THREE.MeshStandardMaterial({
    color: 0x573b2a, // Natural Walnut
    roughness: 0.36,
    metalness: 0.10,
  });
  const brassTrimMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // Antique Gold / Warm Brass accent
    roughness: 0.22,
    metalness: 0.92,
  });

  // Floor: Dark Walnut Parquet
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM2_CONFIG.room.width, ROOM2_CONFIG.room.depth),
    floorMaterial
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Inlaid Brass Compass Rose Medallion (Center floor exploration feature matching Room 04)
  const medallionGroup = new THREE.Group();
  medallionGroup.position.set(0, 0.002, 1.0);

  const outerBrassRing = new THREE.Mesh(
    new THREE.RingGeometry(3.2, 3.28, 64),
    brassTrimMaterial
  );
  outerBrassRing.rotation.x = -Math.PI / 2;
  medallionGroup.add(outerBrassRing);

  const innerBrassRing = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.15, 64),
    brassTrimMaterial
  );
  innerBrassRing.rotation.x = -Math.PI / 2;
  medallionGroup.add(innerBrassRing);

  // 8-Pointed Celestial Compass Star Inlay
  for (let r = 0; r < 8; r++) {
    const angle = (r * Math.PI) / 4;
    const starRay = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 1.05), brassTrimMaterial);
    starRay.position.set(Math.cos(angle) * 2.65, 0, Math.sin(angle) * 2.65);
    starRay.rotation.x = -Math.PI / 2;
    starRay.rotation.z = -angle + Math.PI / 2;
    medallionGroup.add(starRay);
  }

  // Central Brass Medallion Boss
  const centerEmblem = new THREE.Mesh(new THREE.CircleGeometry(0.35, 32), brassTrimMaterial);
  centerEmblem.rotation.x = -Math.PI / 2;
  medallionGroup.add(centerEmblem);

  scene.add(medallionGroup);

  // In-World Station Interaction Floor Rings (Gentle antique gold floor cues)
  const stationFloorRings: Record<Room3StationId, THREE.Mesh> = {} as Record<Room3StationId, THREE.Mesh>;
  (Object.keys(STATION_X) as Room3StationId[]).forEach((sId) => {
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.42, 48),
      new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        emissive: 0xd4af37,
        emissiveIntensity: 0.65,
        roughness: 0.3,
        metalness: 0.8,
        transparent: true,
        opacity: 0.85,
      })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(STATION_X[sId], 0.004, 1.25);
    scene.add(ringMesh);
    stationFloorRings[sId] = ringMesh;
  });

  const addWallSegment = (width: number, height: number, x: number, y: number, z: number) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, ROOM2_CONFIG.room.wallThickness), wallMaroonMaterial);
    wall.position.set(x, y, z);
    wall.receiveShadow = false;
    scene.add(wall);
    return wall;
  };

  const roomHalfWidth = ROOM2_CONFIG.room.width / 2;
  const doorLeft = ROOM2_CONFIG.door.x - ROOM2_CONFIG.door.width / 2;
  const doorRight = ROOM2_CONFIG.door.x + ROOM2_CONFIG.door.width / 2;

  // 1. Back Wall (North Wall at backZ = -7.40m)
  addWallSegment(doorLeft + roomHalfWidth, ROOM2_CONFIG.room.height, (doorLeft - roomHalfWidth) / 2, ROOM2_CONFIG.room.height / 2, ROOM2_CONFIG.room.backZ);
  addWallSegment(roomHalfWidth - doorRight, ROOM2_CONFIG.room.height, (doorRight + roomHalfWidth) / 2, ROOM2_CONFIG.room.height / 2, ROOM2_CONFIG.room.backZ);
  const doorHeaderHeight = ROOM2_CONFIG.room.height - ROOM2_CONFIG.door.height;
  addWallSegment(ROOM2_CONFIG.door.width, doorHeaderHeight, ROOM2_CONFIG.door.x, ROOM2_CONFIG.door.height + doorHeaderHeight / 2, ROOM2_CONFIG.room.backZ);

  // Lower Mahogany Wainscoting & Brass Chair Rail on Back Wall
  const backLeftWidth = doorLeft + roomHalfWidth;
  const backLeftCenterX = (doorLeft - roomHalfWidth) / 2;
  const wainscotBackLeft = new THREE.Mesh(new THREE.BoxGeometry(backLeftWidth, 1.15, 0.04), mahoganyDeskMaterial);
  wainscotBackLeft.position.set(backLeftCenterX, 0.575, ROOM2_CONFIG.room.backZ + 0.18);
  scene.add(wainscotBackLeft);

  const chairRailBackLeft = new THREE.Mesh(new THREE.BoxGeometry(backLeftWidth, 0.06, 0.08), brassTrimMaterial);
  chairRailBackLeft.position.set(backLeftCenterX, 1.15, ROOM2_CONFIG.room.backZ + 0.19);
  scene.add(chairRailBackLeft);

  const baseboardBackLeft = new THREE.Mesh(new THREE.BoxGeometry(backLeftWidth, 0.16, 0.08), mahoganyDeskMaterial);
  baseboardBackLeft.position.set(backLeftCenterX, 0.08, ROOM2_CONFIG.room.backZ + 0.20);
  scene.add(baseboardBackLeft);

  // 2. Front Wall (South Wall at Z = +7.40m)
  const frontZ = -ROOM2_CONFIG.room.backZ;
  const southWall = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width, ROOM2_CONFIG.room.height, ROOM2_CONFIG.room.wallThickness), wallMaroonMaterial);
  southWall.position.set(0, ROOM2_CONFIG.room.height / 2, frontZ);
  southWall.receiveShadow = false;
  scene.add(southWall);

  const southWainscot = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 1.15, 0.04), mahoganyDeskMaterial);
  southWainscot.position.set(0, 0.575, frontZ - 0.18);
  scene.add(southWainscot);

  const southBaseboard = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 0.16, 0.08), mahoganyDeskMaterial);
  southBaseboard.position.set(0, 0.08, frontZ - 0.20);
  scene.add(southBaseboard);

  const southChairRail = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 0.06, 0.08), brassTrimMaterial);
  southChairRail.position.set(0, 1.15, frontZ - 0.19);
  scene.add(southChairRail);

  // Clerestory Observatory Window Ribbon overlooking the Cosmic Starfield
  const ribbonWidth = 15.6;
  const ribbonHeight = 0.62;
  const ribbonCenterY = 3.82;
  const ribbonZ = frontZ - 0.18;

  const ribbonFrame = new THREE.Mesh(new THREE.BoxGeometry(ribbonWidth + 0.16, ribbonHeight + 0.12, 0.06), mahoganyDeskMaterial);
  ribbonFrame.position.set(0, ribbonCenterY, ribbonZ);
  scene.add(ribbonFrame);

  const ribbonBrassTrim = new THREE.Mesh(new THREE.BoxGeometry(ribbonWidth + 0.20, 0.03, 0.08), brassTrimMaterial);
  ribbonBrassTrim.position.set(0, ribbonCenterY - ribbonHeight / 2 - 0.02, ribbonZ);
  scene.add(ribbonBrassTrim);

  // Vertical antique brass mullions across the clerestory ribbon
  for (let rx = -ribbonWidth / 2 + 2.6; rx < ribbonWidth / 2; rx += 2.6) {
    const rMullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, ribbonHeight, 0.08), brassTrimMaterial);
    rMullion.position.set(rx, ribbonCenterY, ribbonZ);
    scene.add(rMullion);
  }

  // Cool celestial starlight illumination streaming in through the observatory windows
  const celestialMoonlight = new THREE.DirectionalLight(0x7dd3fc, 1.85);
  celestialMoonlight.position.set(18, 14, -10);
  celestialMoonlight.target.position.set(0, 1.0, 0);
  scene.add(celestialMoonlight);
  scene.add(celestialMoonlight.target);

  // 3. Side Walls (East & West at +/- 10.8m) with Grand University Observatory Windows
  const windowZPositions = [-4.5, 0.0, 4.5];
  const sideWallXPositions = [-ROOM2_CONFIG.room.sideX, ROOM2_CONFIG.room.sideX];

  sideWallXPositions.forEach((x) => {
    const isEast = x > 0;
    const innerX = isEast ? x - 0.16 : x + 0.16;

    // A. Solid Wall Base (below Y = 1.15m, full length 14.8m)
    const baseWall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.15, ROOM2_CONFIG.room.depth), wallMaroonMaterial);
    baseWall.position.set(x, 0.575, 0);
    baseWall.receiveShadow = false;
    scene.add(baseWall);

    const sideWainscot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.15, ROOM2_CONFIG.room.depth), mahoganyDeskMaterial);
    sideWainscot.position.set(innerX, 0.575, 0);
    scene.add(sideWainscot);

    const sideBaseboard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, ROOM2_CONFIG.room.depth), mahoganyDeskMaterial);
    sideBaseboard.position.set(isEast ? x - 0.18 : x + 0.18, 0.08, 0);
    scene.add(sideBaseboard);

    const sideChairRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, ROOM2_CONFIG.room.depth), brassTrimMaterial);
    sideChairRail.position.set(isEast ? x - 0.18 : x + 0.18, 1.15, 0);
    scene.add(sideChairRail);

    // B. Solid Wall Header (above Y = 3.65m, full length 14.8m)
    const headerWall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, ROOM2_CONFIG.room.depth), wallMaroonMaterial);
    headerWall.position.set(x, 3.925, 0);
    headerWall.receiveShadow = false;
    scene.add(headerWall);

    const sideFrieze = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, ROOM2_CONFIG.room.depth), mahoganyDeskMaterial);
    sideFrieze.position.set(innerX, 3.76, 0);
    scene.add(sideFrieze);

    const sideCrownMolding = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, ROOM2_CONFIG.room.depth), brassTrimMaterial);
    sideCrownMolding.position.set(isEast ? x - 0.18 : x + 0.18, 4.17, 0);
    scene.add(sideCrownMolding);

    // C. 4 Solid Wall Piers between/around window openings (Y from 1.15 to 3.65m, height 2.50m)
    const pierDefs = [
      { centerZ: -6.55, length: 1.70 },
      { centerZ: -2.25, length: 2.10, hasPilaster: true },
      { centerZ: 2.25, length: 2.10, hasPilaster: true },
      { centerZ: 6.55, length: 1.70 },
    ];

    pierDefs.forEach((p) => {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.50, p.length), wallMaroonMaterial);
      pier.position.set(x, 2.40, p.centerZ);
      pier.receiveShadow = false;
      scene.add(pier);

      if (p.hasPilaster) {
        // Decorative Wall Sconces matching Room 04 (slender brass cylinder with warm glowing caps, zero wall blowout)
        const sconceGroup = new THREE.Group();
        sconceGroup.position.set(isEast ? x - 0.20 : x + 0.20, 2.40, p.centerZ);

        const sconceBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.42, 16),
          brassTrimMaterial
        );
        sconceGroup.add(sconceBody);

        [-0.24, 0.24].forEach((capsY) => {
          const lightCap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.030, 0.030, 0.08, 16),
            new THREE.MeshStandardMaterial({
              color: 0xffedd5,
              emissive: 0xffe4b5,
              emissiveIntensity: 1.4,
              roughness: 0.3,
            })
          );
          lightCap.position.y = capsY;
          sconceGroup.add(lightCap);
        });

        // Soft, balanced warm accent light with generous offset away from the wall to eliminate specular glare
        const sLight = new THREE.PointLight(0xffe6c8, 0.35, 4.2, 1.8);
        sLight.position.set(isEast ? -0.22 : 0.22, 0, 0);
        sconceGroup.add(sLight);
        sconceLights.push(sLight);

        scene.add(sconceGroup);
      }
    });

    // D. 3 Grand University Observatory Windows (Looking out into Deep Cosmic Space)
    windowZPositions.forEach((pz) => {
      // Mahogany Window Sill
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 2.60), mahoganyDeskMaterial);
      sill.position.set(isEast ? x - 0.06 : x + 0.06, 1.18, pz);
      scene.add(sill);

      // Antique Brass Sill Apron Trim
      const sillTrim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 2.62), brassTrimMaterial);
      sillTrim.position.set(isEast ? x - 0.20 : x + 0.20, 1.15, pz);
      scene.add(sillTrim);

      // Mahogany Side Jambs
      [-1.20, 1.20].forEach((jz) => {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 2.45, 0.06), mahoganyDeskMaterial);
        jamb.position.set(x, 2.425, pz + jz);
        scene.add(jamb);
      });

      // Mahogany Top Header Casing
      const topCasing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 2.40), mahoganyDeskMaterial);
      topCasing.position.set(x, 3.65, pz);
      scene.add(topCasing);

      // Architectural Brass Window Mullions (forming 6 conservatory window panes per opening)
      const vertMullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.45, 0.06), brassTrimMaterial);
      vertMullion.position.set(x, 2.425, pz);
      scene.add(vertMullion);

      const horizTransom1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 2.40), brassTrimMaterial);
      horizTransom1.position.set(x, 1.95, pz);
      scene.add(horizTransom1);

      const horizTransom2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 2.40), brassTrimMaterial);
      horizTransom2.position.set(x, 2.85, pz);
      scene.add(horizTransom2);
    });
  });

  // --- Deep 3D Celestial Starfield System (Matching Room 04) ---
  const createStarGlowTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.16, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(0.45, 'rgba(186, 230, 253, 0.55)');
    grad.addColorStop(0.75, 'rgba(56, 189, 248, 0.18)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  };

  const starCount = 2800;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);

  const starPalette = [
    new THREE.Color(0xffffff), // pure diamond white
    new THREE.Color(0xa5f3fc), // O/B cyan blue
    new THREE.Color(0x93c5fd), // Sirius electric sapphire
    new THREE.Color(0x38bdf8), // radiant sky cyan
    new THREE.Color(0xfef08a), // G-type yellow
    new THREE.Color(0xfba571), // K/M orange-red
    new THREE.Color(0xe9d5ff), // violet starlight
  ];

  for (let i = 0; i < starCount; i++) {
    let sx: number;
    let sy: number;
    let sz: number;

    // Allocate 60% of stars directly in the window sightlines (East & West)
    if (i < 1680) {
      const isEast = i % 2 === 0;
      sx = isEast ? (13.5 + Math.random() * 18) : (-13.5 - Math.random() * 18);
      sy = 1.1 + Math.random() * 3.8; // directly within window height range 1.18m - 3.65m
      sz = (Math.random() - 0.5) * 16;
    } else {
      sx = (Math.random() - 0.5) * 90;
      sy = Math.random() * 24 - 1;
      sz = (Math.random() - 0.5) * 90;
      if (Math.abs(sx) < 13 && Math.abs(sz) < 10 && sy < 6) {
        sx += (sx >= 0 ? 1 : -1) * (14 + Math.random() * 15);
      }
    }

    starPos[i * 3 + 0] = sx;
    starPos[i * 3 + 1] = sy;
    starPos[i * 3 + 2] = sz;

    const col = starPalette[Math.floor(Math.random() * starPalette.length)];
    starColors[i * 3 + 0] = col.r;
    starColors[i * 3 + 1] = col.g;
    starColors[i * 3 + 2] = col.b;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

  const starGlowTex = createStarGlowTexture();
  const starMaterial = new THREE.PointsMaterial({
    size: 0.85,
    map: starGlowTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const starPoints = new THREE.Points(starGeo, starMaterial);
  scene.add(starPoints);

  // --- Landmark Twinkling Stars with 4-Point Diffraction Spikes ---
  const createDiffractionSpikeTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.18, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(0.5, 'rgba(186, 230, 253, 0.45)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const hGrad = ctx.createLinearGradient(0, 64, 128, 64);
    hGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    hGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
    hGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 62, 128, 4);

    const vGrad = ctx.createLinearGradient(64, 0, 64, 128);
    vGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    vGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
    vGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(62, 0, 4, 128);

    return new THREE.CanvasTexture(canvas);
  };

  interface LandmarkStar {
    sprite: THREE.Sprite;
    baseScale: number;
    twinkleSpeed: number;
    phase: number;
  }
  const landmarkStars: LandmarkStar[] = [];
  const diffractionTex = createDiffractionSpikeTexture();

  const landmarkDefs = [
    // Outside East Windows (centered right in the window openings at Y = 2.2 - 3.4m)
    { name: 'Sirius', x: 21.0, y: 2.6, z: -4.5, color: 0x93c5fd, scale: 2.6, speed: 3.2, phase: 0.1 },
    { name: 'Betelgeuse', x: 22.0, y: 2.9, z: 0.0, color: 0xfba571, scale: 2.8, speed: 2.4, phase: 1.2 },
    { name: 'Aldebaran', x: 21.5, y: 2.4, z: 4.5, color: 0xfde047, scale: 2.4, speed: 2.8, phase: 5.3 },
    { name: 'Capella', x: 23.0, y: 3.4, z: -2.0, color: 0xfef08a, scale: 2.2, speed: 2.2, phase: 2.7 },
    { name: 'Procyon', x: 23.0, y: 3.2, z: 2.2, color: 0xa5f3fc, scale: 2.3, speed: 3.0, phase: 4.1 },
    // Outside West Windows (centered right in the window openings at Y = 2.2 - 3.4m)
    { name: 'Rigel', x: -21.0, y: 2.6, z: -4.5, color: 0x67e8f9, scale: 2.6, speed: 3.7, phase: 2.4 },
    { name: 'Vega', x: -22.0, y: 2.9, z: 0.0, color: 0xa5f3fc, scale: 2.8, speed: 3.0, phase: 4.8 },
    { name: 'Arcturus', x: -21.5, y: 2.4, z: 4.5, color: 0xfb923c, scale: 2.4, speed: 2.6, phase: 1.8 },
    { name: 'Spica', x: -23.0, y: 3.3, z: -2.0, color: 0x93c5fd, scale: 2.2, speed: 3.3, phase: 3.1 },
    { name: 'Altair', x: -23.0, y: 3.1, z: 2.0, color: 0xffffff, scale: 2.3, speed: 2.9, phase: 0.8 },
    // North Clerestory Vista
    { name: 'Polaris', x: 0.0, y: 5.5, z: -22.0, color: 0xffffff, scale: 2.6, speed: 2.1, phase: 3.5 },
  ];

  landmarkDefs.forEach((def) => {
    const mat = new THREE.SpriteMaterial({
      map: diffractionTex,
      color: def.color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(def.x, def.y, def.z);
    sprite.scale.set(def.scale, def.scale, 1);
    scene.add(sprite);
    landmarkStars.push({
      sprite,
      baseScale: def.scale,
      twinkleSpeed: def.speed,
      phase: def.phase,
    });
  });

  // --- 3D NASA Moon System (Visible outside East Observatory Windows) ---
  const moonDiffuseMap = textureLoader.load('/assets/moon/Textures/Diffuse_2K.png');
  moonDiffuseMap.colorSpace = THREE.SRGBColorSpace;
  const moonBumpMap = textureLoader.load('/assets/moon/Textures/Bump_2K.png');

  const moonMaterial = new THREE.MeshStandardMaterial({
    map: moonDiffuseMap,
    bumpMap: moonBumpMap,
    bumpScale: 0.08,
    roughness: 0.88,
    metalness: 0.05,
    emissive: new THREE.Color(0xf1f5f9),
    emissiveMap: moonDiffuseMap,
    emissiveIntensity: 0.45,
    fog: false,
  });

  const moonGroup = new THREE.Group();
  moonGroup.position.set(23.0, 3.0, -4.5);
  moonGroup.rotation.y = -Math.PI / 3;
  scene.add(moonGroup);

  let moonMesh: THREE.Object3D = new THREE.Mesh(
    new THREE.SphereGeometry(2.1, 64, 64),
    moonMaterial
  );
  moonGroup.add(moonMesh);

  const objLoader = new OBJLoader();
  objLoader.load(
    '/assets/moon/moon.obj',
    (obj) => {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.material = moonMaterial;
          m.castShadow = false;
          m.receiveShadow = false;
        }
      });
      obj.scale.set(1.20, 1.20, 1.20);
      moonGroup.remove(moonMesh);
      moonMesh = obj;
      moonGroup.add(obj);
    },
    undefined,
    (err) => {
      console.warn('Moon OBJ loaded with fallback sphere:', err);
    }
  );

  // Soft atmospheric lunar corona halo
  const createMoonCoronaTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, 'rgba(224, 242, 254, 0.45)');
    grad.addColorStop(0.35, 'rgba(186, 230, 253, 0.22)');
    grad.addColorStop(0.70, 'rgba(56, 189, 248, 0.06)');
    grad.addColorStop(1, 'rgba(14, 165, 233, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  };

  const moonCoronaMat = new THREE.SpriteMaterial({
    map: createMoonCoronaTexture(),
    color: 0xffffff,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const moonCorona = new THREE.Sprite(moonCoronaMat);
  moonCorona.position.set(23.0, 3.0, -4.6);
  moonCorona.scale.set(7.5, 7.5, 1.0);
  scene.add(moonCorona);

  // Dedicated Moonlight streaming through the windows into the lab
  const moonPointLight = new THREE.PointLight(0xdbeafe, 2.4, 35, 1.2);
  moonPointLight.position.set(22.0, 3.2, -4.0);
  scene.add(moonPointLight);

  // Structural Columns in Corners with Mahogany & Brass Moldings
  [
    [-roomHalfWidth + 0.45, ROOM2_CONFIG.room.backZ + 0.45],
    [roomHalfWidth - 0.45, ROOM2_CONFIG.room.backZ + 0.45],
    [-roomHalfWidth + 0.45, frontZ - 0.45],
    [roomHalfWidth - 0.45, frontZ - 0.45],
  ].forEach(([cx, cz]) => {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.65, ROOM2_CONFIG.room.height, 0.65), mahoganyDeskMaterial);
    col.position.set(cx, ROOM2_CONFIG.room.height / 2, cz);
    scene.add(col);

    const colBase = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.20, 0.72), brassTrimMaterial);
    colBase.position.set(cx, 0.10, cz);
    scene.add(colBase);

    const colCap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.20, 0.72), brassTrimMaterial);
    colCap.position.set(cx, ROOM2_CONFIG.room.height - 0.10, cz);
    scene.add(colCap);
  });

  // 4. Architectural Coffered Ceiling (Deep Burgundy Base + Mahogany Beams + Brass Trims)
  const ceilingGroup = new THREE.Group();
  scene.add(ceilingGroup);

  const ceilingBase = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 0.12, ROOM2_CONFIG.room.depth),
    new THREE.MeshStandardMaterial({
      color: 0x281018, // Deep burgundy coffer field
      roughness: 0.88,
      metalness: 0.06,
    })
  );
  ceilingBase.position.y = ROOM2_CONFIG.room.height;
  ceilingGroup.add(ceilingBase);

  // Longitudinal coffer beams (along Z)
  [-7.2, -3.6, 0, 3.6, 7.2].forEach((bx) => {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.28, ROOM2_CONFIG.room.depth),
      mahoganyDeskMaterial
    );
    beam.position.set(bx, ROOM2_CONFIG.room.height - 0.14, 0);
    ceilingGroup.add(beam);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.04, ROOM2_CONFIG.room.depth),
      brassTrimMaterial
    );
    trim.position.set(bx, ROOM2_CONFIG.room.height - 0.28, 0);
    ceilingGroup.add(trim);
  });

  // Cross coffer beams (along X)
  [-5.2, -2.0, 1.5, 5.0].forEach((bz) => {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 0.28, 0.26),
      mahoganyDeskMaterial
    );
    beam.position.set(0, ROOM2_CONFIG.room.height - 0.14, bz);
    ceilingGroup.add(beam);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 0.04, 0.30),
      brassTrimMaterial
    );
    trim.position.set(0, ROOM2_CONFIG.room.height - 0.28, bz);
    ceilingGroup.add(trim);
  });

  // Recessed warm architectural downlight bezels in coffer bays (matching Room 04)
  const ceilingLightPositions: [number, number, number][] = [
    [-5.4, ROOM2_CONFIG.room.height - 0.08, -3.6],
    [-5.4, ROOM2_CONFIG.room.height - 0.08, 0.0],
    [-5.4, ROOM2_CONFIG.room.height - 0.08, 3.2],
    [0.0, ROOM2_CONFIG.room.height - 0.08, -3.6],
    [0.0, ROOM2_CONFIG.room.height - 0.08, 0.0],
    [0.0, ROOM2_CONFIG.room.height - 0.08, 3.2],
    [5.4, ROOM2_CONFIG.room.height - 0.08, -3.6],
    [5.4, ROOM2_CONFIG.room.height - 0.08, 0.0],
    [5.4, ROOM2_CONFIG.room.height - 0.08, 3.2],
  ];

  ceilingLightPositions.forEach(([lx, ly, lz]) => {
    const fixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.06, 24),
      brassTrimMaterial
    );
    fixture.position.set(lx, ly, lz);
    ceilingGroup.add(fixture);

    const bulb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.02, 24),
      new THREE.MeshStandardMaterial({
        color: 0xfffbeb,
        emissive: 0xffe8ba,
        emissiveIntensity: 2.0,
      })
    );
    bulb.position.set(lx, ly - 0.035, lz);
    ceilingGroup.add(bulb);

    const downlight = new THREE.PointLight(0xffecd1, 1.45, 11, 1.8);
    downlight.position.set(lx, ly - 0.15, lz);
    scene.add(downlight);
    downlights.push(downlight);
  });

  // -------------------------------------------------------------
  // 7. Interactive Equipment & Raycast Registry
  // -------------------------------------------------------------
  const interactableObjects: THREE.Object3D[] = [];
  const objectToInteractionMap = new Map<THREE.Object3D, EquipmentInteraction>();

  const registerInteractable = (
    objects: THREE.Object3D | THREE.Object3D[],
    interaction: EquipmentInteraction
  ) => {
    const targets = Array.isArray(objects) ? objects : [objects];
    targets.forEach((obj) => {
      obj.userData.interactionId = interaction.id;
      obj.userData.equipmentInteraction = interaction;
      if (!interactableObjects.includes(obj)) interactableObjects.push(obj);
      objectToInteractionMap.set(obj, interaction);
      obj.traverse((child) => {
        child.userData.interactionId = interaction.id;
        child.userData.equipmentInteraction = interaction;
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
          if (!interactableObjects.includes(child)) interactableObjects.push(child);
          objectToInteractionMap.set(child, interaction);
        }
      });
    });
  };

  // -------------------------------------------------------------
  // 8. South Wall Master Whiteboard & Casework (Across Stations)
  // -------------------------------------------------------------
  const whiteboardGroup = new THREE.Group();
  whiteboardGroup.position.set(0, 2.40, frontZ - 0.22);

  // Solid rich mahogany backing board (elevated clearly above chair rail at Y = 1.15)
  const wbBacking = new THREE.Mesh(
    new THREE.BoxGeometry(6.60, 2.30, 0.04),
    mahoganyDeskMaterial
  );
  whiteboardGroup.add(wbBacking);

  // Outer antique brass surround bezel
  const wbBrassBezel = new THREE.Mesh(
    new THREE.BoxGeometry(6.68, 2.38, 0.05),
    brassTrimMaterial
  );
  wbBrassBezel.position.set(0, 0, -0.005);
  whiteboardGroup.add(wbBrassBezel);

  // 4 Antique brass corner rosettes
  [
    [-3.28, -1.12],
    [3.28, -1.12],
    [-3.28, 1.12],
    [3.28, 1.12],
  ].forEach(([rx, ry]) => {
    const rosette = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.07), brassTrimMaterial);
    rosette.position.set(rx, ry, -0.01);
    whiteboardGroup.add(rosette);
  });

  // Porcelain Whiteboard Surface (with solid spatial clearance & depthWrite: true to guarantee zero z-fighting)
  const whiteboardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6.40, 2.14),
    new THREE.MeshStandardMaterial({
      map: whiteboardTexture,
      roughness: 0.40,
      metalness: 0.01,
      depthTest: true,
      depthWrite: true,
    })
  );
  whiteboardMesh.position.set(0, 0, -0.038);
  whiteboardMesh.rotation.y = Math.PI;
  whiteboardMesh.castShadow = false;
  whiteboardMesh.receiveShadow = false;
  whiteboardGroup.add(whiteboardMesh);

  // Marker Tray at the bottom edge
  const markerTray = new THREE.Mesh(new THREE.BoxGeometry(6.40, 0.04, 0.12), mahoganyDeskMaterial);
  markerTray.position.set(0, -1.17, -0.06);
  whiteboardGroup.add(markerTray);

  const markerTrayLip = new THREE.Mesh(new THREE.BoxGeometry(6.42, 0.02, 0.02), brassTrimMaterial);
  markerTrayLip.position.set(0, -1.15, -0.11);
  whiteboardGroup.add(markerTrayLip);

  // Felt Eraser
  const eraserMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.85 });
  const eraser = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.08), eraserMat);
  eraser.position.set(0.35, -1.13, -0.06);
  whiteboardGroup.add(eraser);

  // Dry-Erase Markers (Black, Blue, Red)
  const markerColors = [0x0f172a, 0x2563eb, 0xdc2626];
  markerColors.forEach((mCol, idx) => {
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.14, 12),
      new THREE.MeshStandardMaterial({ color: mCol, roughness: 0.3 })
    );
    marker.rotation.z = Math.PI / 2;
    marker.position.set(-0.45 + idx * 0.18, -1.14, -0.06);
    whiteboardGroup.add(marker);
  });

  scene.add(whiteboardGroup);

  registerInteractable(whiteboardMesh, {
    id: 'physics-whiteboard',
    stationId: 'circuits',
    category: 'LECTURE DERIVATIONS',
    name: 'Physics III Master Lecture Whiteboard',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['physics-whiteboard'],
    action: 'Study Governing Equations & Derivations',
    readout: 'Physics III Theory: RLC Phasors · Snell\'s Law & Diffraction · Lorentz Spacetime',
  });

  // -------------------------------------------------------------
  // 9. North Wall Double Entrance Doors & Carved Wood Sign
  // -------------------------------------------------------------
  const doorWidth = ROOM2_CONFIG.door.width;
  const doorHeight = ROOM2_CONFIG.door.height;
  const leafWidth = doorWidth / 2 - 0.03;

  const doorGroup = new THREE.Group();
  doorGroup.position.set(ROOM2_CONFIG.door.x, 0, ROOM2_CONFIG.room.backZ + 0.16);

  const doorFrameMesh = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth + 0.24, doorHeight + 0.12, 0.28),
    doorDarkBrassMat
  );
  doorFrameMesh.position.set(0, doorHeight / 2, 0);
  doorGroup.add(doorFrameMesh);

  leftExitLeaf = new THREE.Mesh(new THREE.BoxGeometry(leafWidth, doorHeight, 0.09), doorMahoganyMat);
  leftExitLeaf.position.set(-leafWidth / 2, doorHeight / 2, 0);
  leftExitLeaf.castShadow = true;
  doorGroup.add(leftExitLeaf);

  rightExitLeaf = new THREE.Mesh(new THREE.BoxGeometry(leafWidth, doorHeight, 0.09), doorMahoganyMat);
  rightExitLeaf.position.set(leafWidth / 2, doorHeight / 2, 0);
  rightExitLeaf.castShadow = true;
  doorGroup.add(rightExitLeaf);

  const handleL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 16), doorBrassMat);
  handleL.position.set(-0.15, 1.2, 0.08);
  doorGroup.add(handleL);

  const handleR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 16), doorBrassMat);
  handleR.position.set(0.15, 1.2, 0.08);
  doorGroup.add(handleR);

  // Carved Mahogany Wood Door Sign (Above Doors)
  const woodSign = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.90, 0.08),
    new THREE.MeshStandardMaterial({ map: doorSignTexture, roughness: 0.38, metalness: 0.06 })
  );
  woodSign.position.set(0, doorHeight + 0.60, 0.06);
  doorGroup.add(woodSign);

  scene.add(doorGroup);

  registerInteractable([leftExitLeaf, rightExitLeaf, woodSign], {
    id: 'campus-door',
    stationId: 'hallway',
    category: 'CAMPUS DIRECTORY',
    name: 'Corridor Double Mahogany Exit Doors',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['campus-door'],
    action: 'Return to Main Laboratory Hallway',
    readout: 'Main Science Hallway · Room 03 Exit Doorway',
  });

  // -------------------------------------------------------------
  // 10. Heavy Scientific Workbenches (addBench matching Room 02)
  // -------------------------------------------------------------
  function addBench(x: number, color: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, 0);

    // 1. Polished Dark Walnut Benchtop Surface
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM2_CONFIG.table.width, ROOM2_CONFIG.table.thickness, ROOM2_CONFIG.table.depth),
      walnutMaterial
    );
    top.position.y = ROOM2_CONFIG.table.topHeight;
    top.receiveShadow = true;
    top.castShadow = true;
    group.add(top);

    // 2. Continuous Antique Brass Edge Trim Molding around Benchtop
    const brassEdge = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM2_CONFIG.table.width + 0.02, 0.028, ROOM2_CONFIG.table.depth + 0.02),
      brassTrimMaterial
    );
    brassEdge.position.y = ROOM2_CONFIG.table.topHeight - 0.012;
    group.add(brassEdge);

    // 3. Rich Mahogany Under-Frame Apron
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM2_CONFIG.table.width - 0.14, 0.10, ROOM2_CONFIG.table.depth - 0.14),
      mahoganyDeskMaterial
    );
    apron.position.y = ROOM2_CONFIG.table.topHeight - ROOM2_CONFIG.table.thickness / 2 - 0.05;
    group.add(apron);

    const legOffsetX = ROOM2_CONFIG.table.width / 2 - 0.45;
    const legOffsetZ = ROOM2_CONFIG.table.depth / 2 - 0.35;
    [-legOffsetX, legOffsetX].forEach((legX) => {
      [-legOffsetZ, legOffsetZ].forEach((legZ) => {
        // 4. Sturdy Rich Mahogany Legs
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, ROOM2_CONFIG.table.legHeight, 0.11),
          mahoganyDeskMaterial
        );
        leg.position.set(legX, ROOM2_CONFIG.table.legHeight / 2, legZ);
        leg.castShadow = true;
        group.add(leg);

        // Antique Brass Foot Ferrule
        const ferrule = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.08, 0.12),
          brassTrimMaterial
        );
        ferrule.position.set(legX, 0.04, legZ);
        group.add(ferrule);
      });
    });

    // 5. Lower Mahogany Stretchers
    const stretcher1 = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.table.width - 0.8, 0.06, 0.06), mahoganyDeskMaterial);
    stretcher1.position.set(0, 0.20, -legOffsetZ);
    group.add(stretcher1);

    const stretcher2 = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.table.width - 0.8, 0.06, 0.06), mahoganyDeskMaterial);
    stretcher2.position.set(0, 0.20, legOffsetZ);
    group.add(stretcher2);

    // 6. Under-Bench Storage Drawer Unit in Walnut with Brass Pulls
    const drawerUnit = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 1.5), walnutMaterial);
    drawerUnit.position.set(ROOM2_CONFIG.table.width / 2 - 0.9, 0.55, 0);
    group.add(drawerUnit);

    [-0.35, 0.0, 0.35].forEach((dz) => {
      const pull = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.14), brassTrimMaterial);
      pull.position.set(ROOM2_CONFIG.table.width / 2 - 0.42, 0.55, dz);
      group.add(pull);
    });

    // 7. Status Indicator Beacon Lamp mounted on Antique Brass Pedestal
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 20), brassTrimMaterial);
    lampBase.position.set(-1.50, ROOM2_CONFIG.table.topHeight + ROOM2_CONFIG.table.thickness / 2 + 0.015, 0.75);
    group.add(lampBase);

    const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.38, 16), brassTrimMaterial);
    lampPole.position.set(-1.50, ROOM2_CONFIG.table.topHeight + ROOM2_CONFIG.table.thickness / 2 + 0.20, 0.75);
    group.add(lampPole);

    const lampMaterial = material(color, { emissive: color, emissiveIntensity: 2.3 });
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 18), lampMaterial);
    lamp.rotation.x = Math.PI;
    lamp.position.set(-1.50, ROOM2_CONFIG.table.topHeight + ROOM2_CONFIG.table.thickness / 2 + 0.44, 0.75);
    group.add(lamp);

    scene.add(group);
    return { group, lampMaterial };
  }

  const circuitsBench = addBench(STATION_X.circuits, STATION_COLOR.circuits);
  const opticsBench = addBench(STATION_X.optics, STATION_COLOR.optics);
  const relativityBench = addBench(STATION_X.relativity, STATION_COLOR.relativity);

  const stationLamps: Record<Room3StationId, THREE.MeshStandardMaterial> = {
    circuits: circuitsBench.lampMaterial,
    optics: opticsBench.lampMaterial,
    relativity: relativityBench.lampMaterial,
  };

  // -------------------------------------------------------------
  // 11. North Wall Station Placards & Picture Lights (y = 3.15m)
  // -------------------------------------------------------------
  const brassLampMaterial = material(0xd97706, { roughness: 0.28, metalness: 0.88 });

  const createPlacard = (
    stationId: Room3StationId,
    x: number,
    texture: THREE.Texture,
    interactionId: string,
    title: string
  ) => {
    const placardGroup = new THREE.Group();
    placardGroup.position.set(x, 3.15, ROOM2_CONFIG.room.backZ + 0.19);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.35, 1.45, 0.06),
      material(0x182433, { roughness: 0.42, metalness: 0.2 })
    );
    placardGroup.add(frame);

    const brassTrim = new THREE.Mesh(
      new THREE.BoxGeometry(2.26, 1.36, 0.07),
      material(0xd97706, { roughness: 0.3, metalness: 0.8 })
    );
    placardGroup.add(brassTrim);

    const canvasMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.3),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.3 })
    );
    canvasMesh.position.z = 0.04;
    placardGroup.add(canvasMesh);

    // Brass Picture Lamp
    const lampArm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), brassLampMaterial);
    lampArm.position.set(0, 0.82, 0.15);
    placardGroup.add(lampArm);

    const lampShade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.12), brassLampMaterial);
    lampShade.position.set(0, 0.82, 0.3);
    placardGroup.add(lampShade);

    const spot = new THREE.SpotLight(0xfff5e6, 2.5, 4.0, Math.PI / 4, 0.4);
    spot.position.set(x, 3.95, ROOM2_CONFIG.room.backZ + 0.55);
    spot.target.position.set(x, 3.15, ROOM2_CONFIG.room.backZ + 0.19);
    scene.add(spot);
    scene.add(spot.target);

    scene.add(placardGroup);

    registerInteractable(canvasMesh, {
      id: interactionId,
      stationId,
      category: 'THEORY REFERENCE PLACARD',
      name: title,
      description: ROOM3_EQUIPMENT_DESCRIPTIONS[interactionId],
      action: 'Open Interactive Laboratory Notebook',
      readout: `${title} · Architectural Wall Theory Board`,
    });
  };

  createPlacard('circuits', STATION_X.circuits, placardTextures.circuits, 'circuits-placard', 'DC & AC Electrical Circuits Theory Board');
  createPlacard('optics', STATION_X.optics, placardTextures.optics, 'optics-placard', 'Geometric & Physical Optics Theory Board');
  createPlacard('relativity', STATION_X.relativity, placardTextures.relativity, 'relativity-placard', 'Special Theory of Relativity Theory Board');

  // --- NORTH WALL INFOGRAPHIC PANELS (Between Stations) ---
  // 1. Circuits RLC Phasor Reference Panel (x = -3.00m, between Circuits and Optics)
  const circuitsPosterGroup = new THREE.Group();
  circuitsPosterGroup.position.set(-3.00, 2.05, ROOM2_CONFIG.room.backZ + 0.18);
  const circuitsFrame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.26, 0.05), material(0x334155, { metalness: 0.8, roughness: 0.2 }));
  circuitsPosterGroup.add(circuitsFrame);
  const circuitsFace = new THREE.Mesh(new THREE.PlaneGeometry(1.80, 1.20), material(0xffffff, { map: circuitsPosterTex, roughness: 0.35 }));
  circuitsFace.position.set(0, 0, 0.03);
  circuitsPosterGroup.add(circuitsFace);
  scene.add(circuitsPosterGroup);

  // 2. Relativity Minkowski Spacetime Reference Panel (x = +3.00m, between Optics and Relativity)
  const relativityPosterGroup = new THREE.Group();
  relativityPosterGroup.position.set(3.00, 2.05, ROOM2_CONFIG.room.backZ + 0.18);
  const relativityFrame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.26, 0.05), material(0x334155, { metalness: 0.8, roughness: 0.2 }));
  relativityPosterGroup.add(relativityFrame);
  const relativityFace = new THREE.Mesh(new THREE.PlaneGeometry(1.80, 1.20), material(0xffffff, { map: relativityPosterTex, roughness: 0.35 }));
  relativityFace.position.set(0, 0, 0.03);
  relativityPosterGroup.add(relativityFace);
  scene.add(relativityPosterGroup);

  // Clipboard Documentation Registry
  const createClipboard = (stationId: Room3StationId, x: number, z: number, id: string, name: string) => {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.02, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 })
    );
    board.position.set(x, 0.94, z);

    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.005, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 })
    );
    paper.position.set(0, 0.012, 0);
    board.add(paper);

    const clip = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.02, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 })
    );
    clip.position.set(0, 0.02, -0.14);
    board.add(clip);

    scene.add(board);

    registerInteractable(board, {
      id,
      stationId,
      category: 'DOCUMENTATION',
      name,
      description: ROOM3_EQUIPMENT_DESCRIPTIONS[id],
      action: 'Open 8-Step Laboratory Notebook',
      readout: `${name} · Ready for Experimental Logging`,
    });
  };

  createClipboard('circuits', STATION_X.circuits + 1.1, 0.35, 'circuits-clipboard', 'Circuit Trials Clipboard');
  createClipboard('optics', STATION_X.optics + 1.1, 0.35, 'optics-clipboard', 'Optics Trials Clipboard');
  createClipboard('relativity', STATION_X.relativity + 1.1, 0.35, 'relativity-clipboard', 'Relativity Trials Clipboard');

  const gltfLoader = new GLTFLoader(loadingManager);

  // -------------------------------------------------------------
  // 12. Station 01 3D Apparatus: Circuits Bench (x = -6.0m)
  // -------------------------------------------------------------
  const circuitsBenchX = STATION_X.circuits;

  // 1. DC Power Supply / AC Function Generator Unit (Positioned on the rear-left instrument row)
  const psuGroup = new THREE.Group();
  psuGroup.position.set(circuitsBenchX - 0.65, 0.94, -0.48);
  psuGroup.rotation.y = 0.08;

  const psuHousing = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.24, 0.34),
    material(0x1e293b, { metalness: 0.8, roughness: 0.3 })
  );
  psuHousing.position.set(0, 0.12, 0);
  psuGroup.add(psuHousing);

  const psuCanvas = document.createElement('canvas');
  psuCanvas.width = 512;
  psuCanvas.height = 256;
  const psuCtx = psuCanvas.getContext('2d')!;
  const psuTexture = new THREE.CanvasTexture(psuCanvas);
  const psuDisplay = new THREE.Mesh(
    new THREE.PlaneGeometry(0.30, 0.14),
    new THREE.MeshBasicMaterial({ map: psuTexture })
  );
  psuDisplay.position.set(0, 0.14, 0.175);
  psuGroup.add(psuDisplay);

  const powerSwitchMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.07, 0.04),
    material(0x0284c7, { emissive: 0x0284c7, emissiveIntensity: 0.9 })
  );
  powerSwitchMesh.position.set(0.13, 0.05, 0.175);
  psuGroup.add(powerSwitchMesh);

  const voltKnob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.035, 24),
    material(0x94a3b8, { metalness: 0.9, roughness: 0.2 })
  );
  voltKnob.rotation.x = Math.PI / 2;
  voltKnob.position.set(-0.11, 0.05, 0.175);
  psuGroup.add(voltKnob);

  // Front Panel 4mm Banana Binding Posts (+Red, -Black, GND Green)
  const bindingPostMetal = material(0xd4af37, { metalness: 0.95, roughness: 0.15 });
  const redPostMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.015, 0.022, 16),
    material(0xd92d20, { roughness: 0.35, metalness: 0.1 })
  );
  redPostMesh.rotation.x = Math.PI / 2;
  redPostMesh.position.set(-0.11, 0.04, 0.175);
  psuGroup.add(redPostMesh);

  const blackPostMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.015, 0.022, 16),
    material(0x18181b, { roughness: 0.35, metalness: 0.1 })
  );
  blackPostMesh.rotation.x = Math.PI / 2;
  blackPostMesh.position.set(-0.04, 0.04, 0.175);
  psuGroup.add(blackPostMesh);

  const gndPostMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.015, 0.022, 16),
    material(0x16a34a, { roughness: 0.35, metalness: 0.1 })
  );
  gndPostMesh.rotation.x = Math.PI / 2;
  gndPostMesh.position.set(0.03, 0.04, 0.175);
  psuGroup.add(gndPostMesh);

  // Load High-Fidelity DC Power Supply GLB Model (replaces procedural housing, display & knobs)
  gltfLoader.load('/assets/room-3/electrical/dc_power_supply.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'DC_PSU_GLB';
    model.scale.setScalar(1.30);
    model.position.set(0, 0, 0);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.name === 'DC_PSU_Digital_Display') {
          (child as THREE.Mesh).material = new THREE.MeshBasicMaterial({ map: psuTexture });
        }
      }
    });
    // Hide procedural fallback meshes to prevent double-rendering / clipping
    psuHousing.visible = false;
    psuDisplay.visible = false;
    powerSwitchMesh.visible = false;
    voltKnob.visible = false;
    psuGroup.add(model);
    registerInteractable(model, {
      id: 'circuits-power-switch',
      stationId: 'circuits',
      category: 'POWER & EXCITATION',
      name: 'DC Regulated Power Supply',
      description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-power-switch'],
      action: 'Toggle Main Power Switch',
      readout: `Output: ${currentCircuits.vs.toFixed(1)} V · Current Limit: 3.00 A`,
    });
  }, undefined, (err) => console.warn('DC PSU GLB load note:', err));

  const updatePsuTexture = (vs: number, freq: number, isAc: boolean) => {
    psuCtx.fillStyle = '#050811';
    psuCtx.fillRect(0, 0, 512, 256);

    // Instrument Frame Header
    psuCtx.font = 'bold 24px monospace';
    psuCtx.fillStyle = '#38bdf8';
    psuCtx.fillText(isAc ? 'AGILENT 33220A AC/DC SOURCE' : 'KEYSIGHT E3631A DC POWER SUPPLY', 20, 38);

    psuCtx.font = 'bold 16px monospace';
    psuCtx.fillStyle = '#10b981';
    psuCtx.fillText(isAc ? 'CH1: SINE WAVE · 50Ω LOAD' : 'CH1: CV (CONSTANT VOLTAGE) · OUTPUT ON', 20, 68);

    // Large High-Contrast Digital Readout
    psuCtx.font = 'bold 64px monospace';
    psuCtx.fillStyle = '#ef4444';
    psuCtx.fillText(`${vs.toFixed(2)} V`, 20, 150);

    // Secondary Telemetry Row
    psuCtx.font = 'bold 26px monospace';
    psuCtx.fillStyle = '#38bdf8';
    const circI = calculateCircuit(currentCircuits).current;
    psuCtx.fillText(isAc ? `FREQ: ${freq.toFixed(1)} Hz` : `I_OUT: ${(circI * 1000).toFixed(1)} mA`, 20, 205);

    psuCtx.font = 'bold 18px monospace';
    psuCtx.fillStyle = '#94a3b8';
    psuCtx.fillText(isAc ? 'OFFSET: 0.00 V · 50Ω' : 'CC LIMIT: 3.000 A · TRIP: 3.20 A', 20, 238);

    psuTexture.needsUpdate = true;
  };
  updatePsuTexture(currentCircuits.vs, currentCircuits.freq, currentCircuits.mode === 'ac');

  scene.add(psuGroup);

  registerInteractable(powerSwitchMesh, {
    id: 'circuits-power-switch',
    stationId: 'circuits',
    category: 'BENCH POWER',
    name: 'Master Power Supply Switch',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-power-switch'],
    action: 'Toggle Circuit Power',
    readout: `State: Energized · Vs = ${currentCircuits.vs.toFixed(1)} V`,
  });

  registerInteractable(voltKnob, {
    id: 'circuits-voltage-knob',
    stationId: 'circuits',
    category: 'POTENTIOMETER',
    name: 'Voltage Regulator Potentiometer',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-voltage-knob'],
    action: 'Adjust Source Voltage Vs',
    readout: `Vs = ${currentCircuits.vs.toFixed(1)} V · Mode: ${currentCircuits.mode.toUpperCase()}`,
  });

  // 2. Tektronix Dual-Channel Digital Storage Oscilloscope (Pushed back to rear instrument bank)
  const oscGroup = new THREE.Group();
  oscGroup.position.set(circuitsBenchX - 0.05, 0.94, -0.52);

  const oscHousing = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.24, 0.30),
    material(0x334155, { metalness: 0.7, roughness: 0.35 })
  );
  oscHousing.position.set(0, 0.12, 0);
  oscGroup.add(oscHousing);

  const oscCanvas = document.createElement('canvas');
  oscCanvas.width = 512;
  oscCanvas.height = 384;
  const oscCtx = oscCanvas.getContext('2d')!;
  const oscTexture = new THREE.CanvasTexture(oscCanvas);
  const oscScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.18),
    new THREE.MeshBasicMaterial({ map: oscTexture })
  );
  oscScreen.position.set(-0.08, 0.12, 0.152);
  oscGroup.add(oscScreen);

  let oscPhase = 0;
  const updateOscilloscope = (delta: number) => {
    oscPhase += delta * (currentCircuits.mode === 'ac' ? currentCircuits.freq / 10 : 0);
    const circResult = calculateCircuit(currentCircuits);

    oscCtx.fillStyle = '#050b14';
    oscCtx.fillRect(0, 0, 512, 384);

    // Green CRT Graticule
    oscCtx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
    oscCtx.lineWidth = 1;
    for (let x = 0; x <= 512; x += 64) {
      oscCtx.beginPath();
      oscCtx.moveTo(x, 0);
      oscCtx.lineTo(x, 384);
      oscCtx.stroke();
    }
    for (let y = 0; y <= 384; y += 48) {
      oscCtx.beginPath();
      oscCtx.moveTo(0, y);
      oscCtx.lineTo(512, y);
      oscCtx.stroke();
    }

    // Channel 1: Voltage V(t) trace in Yellow
    oscCtx.strokeStyle = '#eab308';
    oscCtx.lineWidth = 3;
    oscCtx.beginPath();
    const vAmp = Math.min(150, (currentCircuits.vs / 240) * 140 + 20);
    for (let px = 0; px < 512; px++) {
      const t = (px / 512) * Math.PI * 4 + oscPhase;
      const py = currentCircuits.mode === 'ac' ? 192 - Math.sin(t) * vAmp : 192 - (currentCircuits.vs / 240) * 140;
      if (px === 0) oscCtx.moveTo(px, py);
      else oscCtx.lineTo(px, py);
    }
    oscCtx.stroke();

    // Channel 2: Current I(t) trace in Cyan with phase shift
    oscCtx.strokeStyle = '#38bdf8';
    oscCtx.lineWidth = 2.5;
    oscCtx.beginPath();
    const iAmp = Math.min(150, (circResult.current / 2.0) * 120 + 15);
    const phaseRad = circResult.phaseAngleRad;
    for (let px = 0; px < 512; px++) {
      const t = (px / 512) * Math.PI * 4 + oscPhase - phaseRad;
      const py = currentCircuits.mode === 'ac' ? 192 - Math.sin(t) * iAmp : 192 - (circResult.current / 2.0) * 100;
      if (px === 0) oscCtx.moveTo(px, py);
      else oscCtx.lineTo(px, py);
    }
    oscCtx.stroke();

    // Text Overlay
    oscCtx.font = 'bold 20px monospace';
    oscCtx.fillStyle = '#eab308';
    oscCtx.fillText(`CH1: ${currentCircuits.vs.toFixed(1)} V (10V/div)`, 20, 32);
    oscCtx.fillStyle = '#38bdf8';
    oscCtx.fillText(`CH2: ${(circResult.current * 1000).toFixed(1)} mA (20mA/div)`, 20, 60);
    oscCtx.fillStyle = '#10b981';
    oscCtx.fillText(`Δφ = ${circResult.phaseAngleDeg.toFixed(1)}°`, 20, 360);
    oscCtx.fillText(`cos φ = ${circResult.powerFactor.toFixed(3)} · M: 2.0ms`, 230, 360);

    oscTexture.needsUpdate = true;
  };
  updateOscilloscope(0);

  // Load High-Fidelity Tektronix Oscilloscope GLB Model (properly scaled to bench instrument proportions)
  gltfLoader.load('/assets/room-3/electrical/oscilloscope.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'Oscilloscope_GLB';
    model.scale.setScalar(1.15);
    model.position.set(0, 0, 0);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.name === 'Oscilloscope_Screen_Display') {
          (child as THREE.Mesh).material = new THREE.MeshBasicMaterial({ map: oscTexture });
        }
      }
    });
    // Hide procedural fallback housing and floating screen to prevent double-rendering
    oscHousing.visible = false;
    oscScreen.visible = false;
    oscGroup.add(model);
    registerInteractable(model, {
      id: 'circuits-oscilloscope',
      stationId: 'circuits',
      category: 'INSTRUMENTATION',
      name: 'Tektronix Dual-Channel Digital Storage Oscilloscope',
      description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-oscilloscope'],
      action: 'Observe Waveform Phase Shift',
      readout: `Waveform Trace: V(t) vs I(t) · Phase Shift φ = ${calculateCircuit(currentCircuits).phaseAngleDeg.toFixed(1)}°`,
    });
  }, undefined, (err) => console.warn('Oscilloscope GLB load note:', err));

  scene.add(oscGroup);

  registerInteractable(oscHousing, {
    id: 'circuits-oscilloscope',
    stationId: 'circuits',
    category: 'INSTRUMENTATION',
    name: 'Tektronix Dual-Channel Digital Storage Oscilloscope',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-oscilloscope'],
    action: 'Observe Waveform Phase Shift',
    readout: `Waveform Trace: V(t) vs I(t) · Phase Shift φ = ${calculateCircuit(currentCircuits).phaseAngleDeg.toFixed(1)}°`,
  });

  // 4. Rigol DDS Arbitrary Function Generator Unit (Positioned on the rear-right instrument row)
  const fgenGroup = new THREE.Group();
  fgenGroup.position.set(circuitsBenchX + 0.65, 0.94, -0.48);
  fgenGroup.rotation.y = -0.08;

  const fgenCanvas = document.createElement('canvas');
  fgenCanvas.width = 512;
  fgenCanvas.height = 256;
  const fgenCtx = fgenCanvas.getContext('2d')!;
  const fgenTexture = new THREE.CanvasTexture(fgenCanvas);

  const updateFgenDisplay = () => {
    fgenCtx.fillStyle = '#0a192f';
    fgenCtx.fillRect(0, 0, 512, 256);

    fgenCtx.font = 'bold 24px monospace';
    fgenCtx.fillStyle = '#38bdf8';
    fgenCtx.fillText('RIGOL DG1022 DDS ARB GENERATOR', 20, 38);

    fgenCtx.font = 'bold 16px monospace';
    fgenCtx.fillStyle = '#10b981';
    fgenCtx.fillText('CH1: 50Ω HIGH-Z · OUTPUT [ON]', 20, 68);

    fgenCtx.font = 'bold 54px monospace';
    fgenCtx.fillStyle = '#eab308';
    fgenCtx.fillText(`${currentCircuits.freq.toFixed(1)} Hz`, 20, 140);

    fgenCtx.font = 'bold 24px monospace';
    fgenCtx.fillStyle = '#38bdf8';
    fgenCtx.fillText(`WAVE: ${currentCircuits.mode === 'ac' ? 'SINE ~' : 'DC LEVEL'}`, 20, 195);
    fgenCtx.font = 'bold 18px monospace';
    fgenCtx.fillStyle = '#94a3b8';
    fgenCtx.fillText(`AMPL: ${currentCircuits.vs.toFixed(1)} Vpp · OFFSET: 0.00 V`, 20, 235);

    fgenTexture.needsUpdate = true;
  };
  updateFgenDisplay();

  gltfLoader.load('/assets/room-3/electrical/function_generator.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'FunctionGenerator_GLB';
    model.scale.setScalar(1.30);
    model.position.set(0, 0, 0);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.name === 'FunctionGen_LCD_Screen') {
          (child as THREE.Mesh).material = new THREE.MeshBasicMaterial({ map: fgenTexture });
        }
      }
    });
    fgenGroup.add(model);
    registerInteractable(model, {
      id: 'circuits-power-switch',
      stationId: 'circuits',
      category: 'EXCITATION SOURCE',
      name: 'Rigol DDS Arbitrary Function Generator & Power Supply',
      description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-power-switch'],
      action: 'Toggle Main Power Switch & Waveform',
      readout: `Supply: ${currentCircuits.vs.toFixed(1)} V · Mode: ${currentCircuits.mode.toUpperCase()}`,
    });
  }, undefined, (err) => console.warn('Function Gen GLB load note:', err));
  scene.add(fgenGroup);

  // 5. Functional Fluke True-RMS Digital Multimeter with Dynamic LCD & 3D Probes
  const multimeter3d = new Multimeter3D(circuitsBenchX, {
    onReadingChange: (reading) => {
      callbacks.onDmmReadingChange?.(reading);
    },
    onProbePlaced: (probe, term) => {
      callbacks.onProbePlaced?.(probe, term);
      playTone(520, 'sine', 0.08, 0.15);
    },
    onFuseTripped: () => {
      playTone(220, 'sawtooth', 0.4, 0.25);
    },
    playTone: (freq, type, duration, vol) => {
      playTone(freq, type, duration, vol);
    },
  });
  scene.add(multimeter3d.root);

  registerInteractable(multimeter3d.meterGroup || multimeter3d.root, {
    id: 'circuits-multimeter',
    stationId: 'circuits',
    category: 'METROLOGY',
    name: 'Fluke True-RMS Digital Multimeter',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-multimeter'],
    action: 'Operate Multimeter (Mode Dial, Jacks, Probes & Terminals)',
    readout: 'DMM: DC VOLTAGE · AUTO-RANGE',
  });

  registerInteractable(multimeter3d.boardGroup || multimeter3d.root, {
    id: 'circuits-topology-selector',
    stationId: 'circuits',
    category: 'CIRCUIT TRAINER',
    name: 'Solderless Breadboard Circuit Trainer',
    description: '830-tie-point solderless breadboard with precision axial resistors, jumper wires, and series ammeter break.',
    action: 'Inspect Breadboard & Probes',
    readout: `Active Circuit: ${currentCircuits.topology.toUpperCase()} · R_eq = ${calculateCircuit(currentCircuits).req.toFixed(1)} Ω`,
  });

  // -------------------------------------------------------------
  // 13. Station 02 3D Apparatus: Optics Bench (x = 0.0m)
  // -------------------------------------------------------------
  const opticsBenchX = STATION_X.optics;

  const railGroup = new THREE.Group();
  railGroup.position.set(opticsBenchX, 0.94 + 0.03, 0);

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.06, 0.16),
    material(0x0f172a, { metalness: 0.9, roughness: 0.25 })
  );
  railGroup.add(rail);

  // Load High-Fidelity Optical Rail System GLB Model
  gltfLoader.load('/assets/room-3/optics/optical_rail_system.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'OpticalRail_GLB';
    model.scale.setScalar(1.2);
    model.position.set(0, 0, 0);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    (rail.material as THREE.Material).transparent = true;
    (rail.material as THREE.Material).opacity = 0;
    (rail.material as THREE.Material).depthWrite = false;
    (rail.material as THREE.Material).needsUpdate = true;
    rail.visible = true;
    railGroup.add(model);
    registerInteractable(model, {
      id: 'optics-rail',
      stationId: 'optics',
      category: 'OPTICAL BENCH',
      name: 'Graduated Metric Optical Bench Rail',
      description: 'Precision metric rail holding laser diode, goniometer prism mount, and micrometric diffraction screen.',
      action: 'Examine Optical Alignment',
      readout: 'Alignment: Paraxial collinear · Scale: 0 to 200 cm',
    });
  }, undefined, (err) => console.warn('Optical Rail GLB load note:', err));

  // Laser Diode Emitter
  const laserHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.22, 24),
    material(0x1e293b, { metalness: 0.8, roughness: 0.3 })
  );
  laserHousing.rotation.z = Math.PI / 2;
  laserHousing.position.set(-1.0, 0.12, 0);
  railGroup.add(laserHousing);

  // Load High-Fidelity Diode Laser Collimator GLB Model
  gltfLoader.load('/assets/room-3/optics/laser_source.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'LaserSource_GLB';
    model.scale.setScalar(1.3);
    model.position.set(-1.0, 0.12, 0);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    (laserHousing.material as THREE.Material).transparent = true;
    (laserHousing.material as THREE.Material).opacity = 0;
    (laserHousing.material as THREE.Material).depthWrite = false;
    (laserHousing.material as THREE.Material).needsUpdate = true;
    laserHousing.visible = true;
    railGroup.add(model);
    registerInteractable(model, {
      id: 'optics-laser',
      stationId: 'optics',
      category: 'COHERENT EMISSION',
      name: 'Tunable Coherent Diode Laser Collimator',
      description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-laser'],
      action: 'Cycle Emission Wavelength (Green 532nm / Red 650nm / Violet 405nm)',
      readout: `Laser Wavelength: ${currentOptics.wavelength} nm · Coherence: 150 m`,
    });
  }, undefined, (err) => console.warn('Laser Source GLB load note:', err));

  const beamMat = new THREE.MeshBasicMaterial({
    color: wavelengthToRGB(currentOptics.wavelength),
    transparent: true,
    opacity: 0.85,
  });

  const beamGeo = new THREE.CylinderGeometry(0.006, 0.006, 1.8, 16);
  beamGeo.rotateZ(Math.PI / 2);
  const laserBeam = new THREE.Mesh(beamGeo, beamMat);
  laserBeam.position.set(0, 0.12, 0);
  railGroup.add(laserBeam);

  // Optical Element (Semicircular Prism, Lens, Double Slit)
  const opticalElementGroup = new THREE.Group();
  opticalElementGroup.position.set(0, 0.12, 0);

  const prismGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.92,
    opacity: 1,
    transparent: true,
    roughness: 0.05,
    ior: currentOptics.n2,
  });
  const prismMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.08, 32, 1, false, 0, Math.PI),
    prismGlassMat
  );
  prismMesh.rotation.x = Math.PI / 2;
  opticalElementGroup.add(prismMesh);

  const lensMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 16), prismGlassMat);
  lensMesh.scale.set(0.2, 1, 1);
  lensMesh.visible = false;
  opticalElementGroup.add(lensMesh);

  const slitPlate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.18), material(0x1e293b, { metalness: 0.8 }));
  slitPlate.visible = false;
  opticalElementGroup.add(slitPlate);

  // Load High-Fidelity Goniometer Prism Stage GLB Model
  gltfLoader.load('/assets/room-3/optics/goniometer_prism.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'GoniometerPrism_GLB';
    model.scale.setScalar(1.25);
    model.position.set(0, -0.06, 0);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    opticalElementGroup.add(model);
  }, undefined, (err) => console.warn('Goniometer Prism GLB load note:', err));

  railGroup.add(opticalElementGroup);

  // Observation Screen with Dynamic Interference Fringes
  const screenGroup = new THREE.Group();
  screenGroup.position.set(1.0, 0.2, 0);

  // Load High-Fidelity Micrometric Diffraction Screen GLB Model
  gltfLoader.load('/assets/room-3/optics/diffraction_screen.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'DiffractionScreen_GLB';
    model.scale.setScalar(1.2);
    model.position.set(0, -0.10, 0);
    model.rotation.y = -Math.PI / 2;
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    screenGroup.add(model);
  }, undefined, (err) => console.warn('Diffraction Screen GLB load note:', err));

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512;
  screenCanvas.height = 512;
  const screenCtx = screenCanvas.getContext('2d')!;
  const screenTexture = new THREE.CanvasTexture(screenCanvas);

  const screenSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.35),
    new THREE.MeshStandardMaterial({ map: screenTexture, roughness: 0.6 })
  );
  screenSurface.rotation.y = -Math.PI / 2;
  screenGroup.add(screenSurface);

  const updateScreenTexture = () => {
    const optResult = calculateOptics(currentOptics);
    screenCtx.fillStyle = '#0f172a';
    screenCtx.fillRect(0, 0, 512, 512);
    const laserHex = wavelengthToRGB(currentOptics.wavelength);

    if (currentOptics.subMode === 'diffraction') {
      const fringeSpacingPx = Math.max(8, (optResult.fringeSpacingMm / 10) * 120);
      for (let y = 0; y < 512; y++) {
        const dy = y - 256;
        const phase = (dy / fringeSpacingPx) * Math.PI;
        const cosTerm = Math.pow(Math.cos(phase), 2);
        const sincTerm = Math.pow(Math.sin(phase * 0.25 + 1e-6) / (phase * 0.25 + 1e-6), 2);
        const intensity = Math.min(1.0, cosTerm * sincTerm);
        screenCtx.fillStyle = laserHex;
        screenCtx.globalAlpha = intensity;
        screenCtx.fillRect(0, y, 512, 1);
      }
      screenCtx.globalAlpha = 1.0;
    } else if (currentOptics.subMode === 'refraction') {
      screenCtx.fillStyle = laserHex;
      screenCtx.beginPath();
      const spotY = 256 + (optResult.isTIR ? 0 : Math.sin(((optResult.theta2Deg ?? 0) * Math.PI) / 180) * 140);
      screenCtx.arc(256, spotY, 24, 0, Math.PI * 2);
      screenCtx.fill();
    } else {
      screenCtx.fillStyle = laserHex;
      screenCtx.font = 'bold 36px monospace';
      screenCtx.fillText(`${optResult.imageType} Image`, 40, 80);
      screenCtx.fillText(`M = ${optResult.magnification?.toFixed(2) ?? '∞'}`, 40, 130);
    }
    screenTexture.needsUpdate = true;
  };
  updateScreenTexture();

  railGroup.add(screenGroup);
  scene.add(railGroup);

  registerInteractable(laserHousing, {
    id: 'optics-laser',
    stationId: 'optics',
    category: 'LASER SOURCE',
    name: 'Tunable Diode Laser Emitter',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-laser'],
    action: 'Adjust Wavelength λ / Toggle Laser',
    readout: `λ = ${currentOptics.wavelength} nm · Beam Color: ${wavelengthToRGB(currentOptics.wavelength)}`,
  });

  registerInteractable(prismMesh, {
    id: 'optics-angle-dial',
    stationId: 'optics',
    category: 'GONIOMETER',
    name: 'Precision Snell\'s Law Goniometer Stage',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-angle-dial'],
    action: 'Rotate Incident Angle θ₁',
    readout: `θ₁ = ${currentOptics.theta1.toFixed(1)}° · n₁ = ${currentOptics.n1.toFixed(2)} · n₂ = ${currentOptics.n2.toFixed(2)}`,
  });

  registerInteractable(screenSurface, {
    id: 'optics-screen',
    stationId: 'optics',
    category: 'OPTICAL DETECTOR',
    name: 'Interference Fringe Observation Screen',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-screen'],
    action: 'Inspect Fringe Profile & Intensity',
    readout: `Screen Distance L = ${currentOptics.screenDistance.toFixed(2)} m · Fringe Δy = ${calculateOptics(currentOptics).fringeSpacingMm.toFixed(2)} mm`,
  });

  // -------------------------------------------------------------
  // 14. Station 03 3D Apparatus: Relativity Chamber (x = +6.0m)
  // -------------------------------------------------------------
  const relativityBenchX = STATION_X.relativity;

  const relativityGroup = new THREE.Group();
  relativityGroup.position.set(relativityBenchX, 0.94 + 0.03, 0);

  // Linear Maglev Vacuum Track
  const track = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.05, 0.22),
    material(0x1e293b, { metalness: 0.9, roughness: 0.2 })
  );
  relativityGroup.add(track);

  // Load High-Fidelity Maglev Beamline GLB Model
  gltfLoader.load('/assets/room-3/relativity/maglev_beamline.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'MaglevBeamline_GLB';
    model.scale.setScalar(1.0);
    model.position.set(0, 0, 0);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    (track.material as THREE.Material).transparent = true;
    (track.material as THREE.Material).opacity = 0;
    (track.material as THREE.Material).depthWrite = false;
    (track.material as THREE.Material).needsUpdate = true;
    track.visible = true;
    relativityGroup.add(model);
    registerInteractable(model, {
      id: 'relativity-accelerator',
      stationId: 'relativity',
      category: 'ACCELERATOR BEAMLINE',
      name: 'Relativistic Synchrotron Maglev Beamline',
      description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-accelerator'] || 'Relativistic linear beam pipe demonstrating particle momentum p = γ m₀ v and Cherenkov emission.',
      action: 'Examine Synchrotron Beamline',
      readout: `Beamline: Synchrotron Quadrupole · Active β: ${(currentRelativity.beta).toFixed(3)}c`,
    });
  }, undefined, (err) => console.warn('Maglev Beamline GLB load note:', err));

  // Quadrupole magnetic coils along track
  [-0.9, -0.45, 0, 0.45, 0.9].forEach((qx) => {
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.02, 16, 24),
      material(0xb45309, { metalness: 0.85, roughness: 0.3 })
    );
    coil.position.set(qx, 0.12, 0);
    relativityGroup.add(coil);
  });

  // Moving Carrier Sled (Frame S')
  const sledGroup = new THREE.Group();
  sledGroup.position.set(0, 0.12, 0);

  const sledBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.12, 0.3),
    material(0x3b82f6, { metalness: 0.7, roughness: 0.3 })
  );
  sledGroup.add(sledBody);

  // Contracting 3D Meter-Rod along X-axis of motion
  const contractingRodGeo = new THREE.BoxGeometry(0.7, 0.04, 0.04);
  const contractingRodMat = material(0xf59e0b, { metalness: 0.8, roughness: 0.25 });
  const contractingRod = new THREE.Mesh(contractingRodGeo, contractingRodMat);
  contractingRod.position.set(0, 0.12, 0.12);
  sledGroup.add(contractingRod);

  // Photon Light-Clock on Sled
  const mirrorMat = material(0xffffff, { metalness: 0.98, roughness: 0.05 });
  const mirrorTop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.15), mirrorMat);
  mirrorTop.position.set(0, 0.35, -0.05);
  sledGroup.add(mirrorTop);

  const mirrorBottom = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.15), mirrorMat);
  mirrorBottom.position.set(0, 0.05, -0.05);
  sledGroup.add(mirrorBottom);

  const photonPulse = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  );
  photonPulse.position.set(0, 0.2, -0.05);
  sledGroup.add(photonPulse);

  // Load High-Fidelity Photon Clock GLB Model
  gltfLoader.load('/assets/room-3/relativity/photon_clock.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'PhotonClock_GLB';
    model.scale.setScalar(1.0);
    model.position.set(0, 0.04, -0.05);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    sledGroup.add(model);
  }, undefined, (err) => console.warn('Photon Clock GLB load note:', err));

  relativityGroup.add(sledGroup);

  // Dual Synchronized Digital Atomic Clocks (Frame S vs Frame S')
  const clockCanvas = document.createElement('canvas');
  clockCanvas.width = 512;
  clockCanvas.height = 256;
  const clockCtx = clockCanvas.getContext('2d')!;
  const clockTexture = new THREE.CanvasTexture(clockCanvas);

  const atomicClock = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 0.24),
    new THREE.MeshBasicMaterial({ map: clockTexture })
  );
  atomicClock.position.set(-0.6, 0.25, -0.35);
  relativityGroup.add(atomicClock);

  // Load High-Fidelity Reference Frame Telemetry Console GLB Model
  gltfLoader.load('/assets/room-3/relativity/reference_frame_display.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'ReferenceFrameDisplay_GLB';
    model.scale.setScalar(1.15);
    model.position.set(-0.6, 0.12, -0.36);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    relativityGroup.add(model);
  }, undefined, (err) => console.warn('Ref Frame Display GLB load note:', err));

  let photonY = 0.05;
  let photonDirection = 1;
  let labTime = 0;

  const updateRelativityApparatus = (delta: number) => {
    const relResult = calculateRelativity(currentRelativity);
    const contractionFactor = 1 / relResult.gamma;
    contractingRod.scale.x = Math.max(0.05, contractionFactor);

    // Animate photon bouncing between mirrors at speed c
    const bounceSpeed = 1.2 * (1 / relResult.gamma);
    photonY += photonDirection * bounceSpeed * delta;
    if (photonY > 0.33) {
      photonY = 0.33;
      photonDirection = -1;
    } else if (photonY < 0.07) {
      photonY = 0.07;
      photonDirection = 1;
    }
    photonPulse.position.y = photonY;

    labTime += delta;
    clockCtx.fillStyle = '#0f172a';
    clockCtx.fillRect(0, 0, 512, 256);

    clockCtx.font = 'bold 28px monospace';
    clockCtx.fillStyle = '#a855f7';
    clockCtx.fillText('FRAME S (LAB)', 20, 40);
    clockCtx.fillStyle = '#ffffff';
    clockCtx.fillText(`t_lab: ${labTime.toFixed(1)} s`, 20, 80);

    clockCtx.fillStyle = '#38bdf8';
    clockCtx.fillText("FRAME S' (SPACECRAFT)", 20, 140);
    clockCtx.fillStyle = '#34d399';
    clockCtx.fillText(`γ = ${relResult.gamma.toFixed(3)}  β = ${relResult.beta.toFixed(3)}c`, 20, 180);
    clockCtx.fillText(`L = ${relResult.contractedLength.toFixed(1)} m (-${relResult.lengthContractionPercent.toFixed(1)}%)`, 20, 220);

    clockTexture.needsUpdate = true;
  };
  updateRelativityApparatus(0);

  scene.add(relativityGroup);

  registerInteractable(contractingRod, {
    id: 'relativity-contracting-rod',
    stationId: 'relativity',
    category: 'LORENTZ KINEMATICS',
    name: 'Contracting Meter-Rod Interferometer',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-contracting-rod'],
    action: 'Observe Length Contraction L = L₀/γ',
    readout: `Proper Length L₀ = ${currentRelativity.properLength.toFixed(1)} m · Contracted L = ${calculateRelativity(currentRelativity).contractedLength.toFixed(2)} m`,
  });

  registerInteractable(sledBody, {
    id: 'relativity-velocity-dial',
    stationId: 'relativity',
    category: 'RELATIVISTIC SPEED',
    name: 'Relativistic Velocity Regulator Sled',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-velocity-dial'],
    action: 'Tune Frame Velocity β = v/c',
    readout: `β = ${currentRelativity.beta.toFixed(3)}c · Lorentz Factor γ = ${calculateRelativity(currentRelativity).gamma.toFixed(3)}`,
  });

  registerInteractable(atomicClock, {
    id: 'relativity-light-clock',
    stationId: 'relativity',
    category: 'CHRONOMETRY',
    name: 'Synchronized Atomic Light-Clock',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-light-clock'],
    action: 'Observe Time Dilation Δt = γ·Δt₀',
    readout: `Dilated Time Δt = ${calculateRelativity(currentRelativity).dilatedTime.toFixed(2)} s (vs proper Δt₀ = ${currentRelativity.properTime.toFixed(1)} s)`,
  });

  // -------------------------------------------------------------
  // 15. Guidance Marker Positioning Targets
  // -------------------------------------------------------------
  const getGuidanceTargetPosition = (id: string, out: THREE.Vector3): boolean => {
    switch (id) {
      // --- Station 01: Circuits ---
      case 'circuits-placard':
        out.set(STATION_X.circuits, 3.40, ROOM2_CONFIG.room.backZ + 0.25);
        return true;
      case 'circuits-power-switch':
        out.set(circuitsBenchX - 0.58, 1.15, -0.38);
        return true;
      case 'circuits-voltage-knob':
        out.set(circuitsBenchX - 0.72, 1.15, -0.38);
        return true;
      case 'circuits-multimeter':
      case 'circuits-dmm-dial':
        out.set(circuitsBenchX + 0.30, 1.12, 0.10);
        return true;
      case 'circuits-dmm-jack':
        out.set(circuitsBenchX + 0.33, 1.05, 0.18);
        return true;
      case 'circuits-oscilloscope':
        out.set(circuitsBenchX - 0.05, 1.22, -0.48);
        return true;
      case 'circuits-topology-selector':
        out.set(circuitsBenchX - 0.06, 1.10, 0.10);
        return true;
      case 'circuits-probe-r1':
        out.set(circuitsBenchX - 0.06 - 0.0684, 1.08, 0.10 - 0.0273);
        return true;
      case 'circuits-probe-r2':
        out.set(circuitsBenchX - 0.06 + 0.0180, 1.08, 0.10 - 0.0189);
        return true;
      case 'circuits-probe-r3':
        out.set(circuitsBenchX - 0.06 + 0.0900, 1.08, 0.10 - 0.0273);
        return true;
      case 'circuits-series-jumper':
        out.set(circuitsBenchX - 0.06 - 0.1332, 1.08, 0.10 - 0.0439);
        return true;
      case 'circuits-clipboard':
        out.set(circuitsBenchX + 1.1, 1.15, 0.35);
        return true;

      // --- Station 02: Optics ---
      case 'optics-placard':
        out.set(STATION_X.optics, 3.40, ROOM2_CONFIG.room.backZ + 0.25);
        return true;
      case 'optics-laser':
        out.set(opticsBenchX - 1.0, 1.25, 0.0);
        return true;
      case 'optics-angle-dial':
      case 'optics-submode-toggle':
        out.set(opticsBenchX, 1.25, 0.0);
        return true;
      case 'optics-rail':
      case 'optics-lens-carrier':
        out.set(opticsBenchX + 0.35, 1.20, 0.0);
        return true;
      case 'optics-screen':
        out.set(opticsBenchX + 1.0, 1.25, 0.0);
        return true;
      case 'optics-clipboard':
        out.set(opticsBenchX + 1.1, 1.15, 0.35);
        return true;

      // --- Station 03: Special Relativity ---
      case 'relativity-placard':
        out.set(STATION_X.relativity, 3.40, ROOM2_CONFIG.room.backZ + 0.25);
        return true;
      case 'relativity-velocity-dial':
        out.set(relativityBenchX, 1.25, 0.0);
        return true;
      case 'relativity-contracting-rod':
        out.set(relativityBenchX, 1.25, 0.12);
        return true;
      case 'relativity-light-clock':
        out.set(relativityBenchX - 0.6, 1.35, -0.35);
        return true;
      case 'relativity-accelerator':
        out.set(relativityBenchX + 0.6, 1.25, 0.0);
        return true;
      case 'relativity-clipboard':
        out.set(relativityBenchX + 1.1, 1.15, 0.35);
        return true;

      // --- Hallway Exit Doors ---
      case 'campus-door':
        out.set(ROOM2_CONFIG.door.x, 2.20, ROOM2_CONFIG.room.backZ + 0.35);
        return true;

      default: {
        if (id.startsWith('circuits-')) {
          out.set(circuitsBenchX, 1.20, 0.0);
          return true;
        }
        if (id.startsWith('optics-')) {
          out.set(opticsBenchX, 1.20, 0.0);
          return true;
        }
        if (id.startsWith('relativity-')) {
          out.set(relativityBenchX, 1.20, 0.0);
          return true;
        }
        return false;
      }
    }
  };

  // -------------------------------------------------------------
  // 15B. In-World Characters: Lab Assistant Carla & Senior Professor
  // -------------------------------------------------------------
  const assistantGroup = new THREE.Group();
  assistantGroup.name = 'LabAssistant_Carla';
  assistantGroup.position.set(8.50, 0, -4.50);
  assistantGroup.rotation.y = -Math.PI / 4;
  scene.add(assistantGroup);

  const assistantSpot = new THREE.SpotLight(0xfff8ee, 3.8, 7.5, Math.PI / 4, 0.5, 1.2);
  assistantSpot.position.set(8.50, 4.1, -4.50);
  assistantSpot.target = assistantGroup;
  scene.add(assistantSpot);

  gltfLoader.load('/assets/character_student.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'Carla_Assistant_Model';
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.roughness = 0.65;
          mat.metalness = 0.05;
        }
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const rawHeight = Math.max(0.1, box.max.y - box.min.y);
    const scale = 1.76 / rawHeight;
    model.scale.setScalar(scale);
    const scaledBox = new THREE.Box3().setFromObject(model);
    model.position.set(0, -scaledBox.min.y, 0);
    assistantGroup.add(model);
  }, undefined, (err) => console.warn('Assistant model load note:', err));

  const professorGroup = new THREE.Group();
  professorGroup.name = 'Senior_Professor';
  professorGroup.position.set(-8.50, 0, -4.50);
  professorGroup.rotation.y = Math.PI / 4;
  scene.add(professorGroup);

  const professorSpot = new THREE.SpotLight(0xfff8ee, 3.8, 7.5, Math.PI / 4, 0.5, 1.2);
  professorSpot.position.set(-8.50, 4.1, -4.50);
  professorSpot.target = professorGroup;
  scene.add(professorSpot);

  gltfLoader.load('/assets/character_professor.glb', (gltf) => {
    const model = gltf.scene;
    model.name = 'Professor_Model';
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.roughness = 0.70;
          mat.metalness = 0.05;
        }
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const rawHeight = Math.max(0.1, box.max.y - box.min.y);
    const scale = 1.82 / rawHeight;
    model.scale.setScalar(scale);
    const scaledBox = new THREE.Box3().setFromObject(model);
    model.position.set(0, -scaledBox.min.y, 0);
    professorGroup.add(model);
  }, undefined, (err) => console.warn('Professor model load note:', err));

  // -------------------------------------------------------------
  // 16. Collision Detection & Walking Bounds
  // -------------------------------------------------------------
  const checkCollision = (x: number, z: number) => {
    // Room perimeter boundary
    if (x < -ROOM2_CONFIG.room.sideX + 1.1 || x > ROOM2_CONFIG.room.sideX - 1.1) return true;
    if (z < ROOM2_CONFIG.room.backZ + 1.2 || z > frontZ - 1.2) return true;

    // Bench Collisions (Station Benches at z = 0m, 3.4m wide x 1.76m deep)
    const benchesX = [STATION_X.circuits, STATION_X.optics, STATION_X.relativity];
    for (const bx of benchesX) {
      if (Math.abs(x - bx) < 1.95 && Math.abs(z) < 1.05) return true;
    }

    // South Credenza & Counters Collision
    if (z > frontZ - 1.6 && Math.abs(x) < 8.0) return true;

    return false;
  };

  // -------------------------------------------------------------
  // 17. Centralized Interaction Manager & Dual Mode System
  // Mode A: Exploration (First-Person Laboratory Walk)
  // Mode B: Instrument Close-up (Direct Hands-on Workbench Controls)
  // -------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);
  let currentHoveredInteraction: EquipmentInteraction | null = null;

  let cameraMode: 'walk' | 'closeup' = 'walk';
  const savedPlayerPos = new THREE.Vector3();
  let savedYaw = 0;
  let savedPitch = 0;
  const targetCloseupCamPos = new THREE.Vector3();
  const targetCloseupCamLookAt = new THREE.Vector3();
  const currentCamLookAt = new THREE.Vector3(0, 1.2, 0);

  // Smooth Third-Person <-> First-Person Camera Transition State
  let cameraTransitionState: 'none' | 'entering' | 'exiting' = 'none';
  let transitionProgress = 0;
  const transitionDuration = 0.70; // 700ms smooth cinematic swooping
  const camStartPos = new THREE.Vector3();
  const camStartLookAt = new THREE.Vector3();
  const camTargetPos = new THREE.Vector3();
  const camTargetLookAt = new THREE.Vector3();

  const CLOSEUP_TARGETS: Record<Room3StationId, { pos: THREE.Vector3; lookAt: THREE.Vector3 }> = {
    circuits: {
      pos: new THREE.Vector3(STATION_X.circuits + 0.04, 1.38, 0.78),
      lookAt: new THREE.Vector3(STATION_X.circuits + 0.04, 0.98, 0.04),
    },
    optics: {
      pos: new THREE.Vector3(STATION_X.optics, 1.34, 0.72),
      lookAt: new THREE.Vector3(STATION_X.optics, 0.98, 0.08),
    },
    relativity: {
      pos: new THREE.Vector3(STATION_X.relativity, 1.34, 0.72),
      lookAt: new THREE.Vector3(STATION_X.relativity, 0.98, 0.08),
    },
  };

  const CIRCUITS_CLOSEUP_SUBVIEWS = {
    station: {
      pos: new THREE.Vector3(STATION_X.circuits + 0.04, 1.38, 0.78),
      lookAt: new THREE.Vector3(STATION_X.circuits + 0.04, 0.98, 0.04),
    },
    board: {
      pos: new THREE.Vector3(STATION_X.circuits - 0.08, 1.22, 0.38),
      lookAt: new THREE.Vector3(STATION_X.circuits - 0.08, 0.96, 0.10),
    },
    multimeter: {
      pos: new THREE.Vector3(STATION_X.circuits + 0.30, 1.18, 0.36),
      lookAt: new THREE.Vector3(STATION_X.circuits + 0.30, 0.96, 0.10),
    },
    psu: {
      pos: new THREE.Vector3(STATION_X.circuits - 0.65, 1.18, -0.10),
      lookAt: new THREE.Vector3(STATION_X.circuits - 0.65, 1.02, -0.42),
    },
  };

  const setCloseupFocus = (focus: 'station' | 'board' | 'multimeter' | 'psu') => {
    if (cameraMode !== 'closeup') return;
    const t = CIRCUITS_CLOSEUP_SUBVIEWS[focus] || CIRCUITS_CLOSEUP_SUBVIEWS.station;
    targetCloseupCamPos.copy(t.pos);
    targetCloseupCamLookAt.copy(t.lookAt);
  };

  const setCameraMode = (mode: 'walk' | 'closeup', targetStation: Room3StationId = activeStation) => {
    if (mode === cameraMode && cameraTransitionState === 'none') return;

    if (mode === 'closeup') {
      // Transitioning: Third-Person Exploration -> First-Person Experiment Mode
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      currentHoveredInteraction = null;
      callbacks.onInteractionChange?.(null);
      savedPlayerPos.copy(playerPosition);
      savedYaw = yaw;
      savedPitch = pitch;

      activeStation = targetStation;
      stationLight.color.setHex(STATION_COLOR[activeStation]);
      stationLight.position.x = STATION_X[activeStation];

      const t = CLOSEUP_TARGETS[targetStation] || CLOSEUP_TARGETS.circuits;
      targetCloseupCamPos.copy(t.pos);
      targetCloseupCamLookAt.copy(t.lookAt);

      // Setup smooth cinematic camera swoop
      camStartPos.copy(camera.position);
      const camDir = camera.getWorldDirection(new THREE.Vector3());
      camStartLookAt.copy(camera.position).addScaledVector(camDir, 4.0);
      camTargetPos.copy(targetCloseupCamPos);
      camTargetLookAt.copy(targetCloseupCamLookAt);

      cameraTransitionState = 'entering';
      transitionProgress = 0;
      cameraMode = 'closeup';
      callbacks.onCameraModeChange?.('closeup');
    } else {
      // Transitioning: First-Person Experiment Mode -> Third-Person Exploration
      savedPlayerPos.set(STATION_X[activeStation], eyeHeight, 2.3);
      savedYaw = 0;
      savedPitch = -0.06;
      playerPosition.copy(savedPlayerPos);
      yaw = savedYaw;
      pitch = savedPitch;

      character.root.position.x = playerPosition.x;
      character.root.position.z = playerPosition.z;
      // Restore character model to visible
      character.isThirdPerson = true;
      character.syncVisibility();

      // Third-person camera follow target behind the avatar
      camStartPos.copy(camera.position);
      camStartLookAt.copy(currentCamLookAt);
      camTargetPos.set(playerPosition.x + 0.28, playerPosition.y + 0.32, playerPosition.z + 2.15);
      camTargetLookAt.set(playerPosition.x, playerPosition.y - 0.1, playerPosition.z - 1.5);

      cameraTransitionState = 'exiting';
      transitionProgress = 0;
      cameraMode = 'walk';
      callbacks.onCameraModeChange?.('walk');
    }
  };

  const mouseScreenPos = new THREE.Vector2();
  let mouseActive = false;

  const triggerEquipmentAction = (interactionId: string) => {
    callbacks.onEquipmentInteract?.(interactionId);
    if (['circuits-multimeter', 'circuits-power-switch', 'circuits-topology-selector', 'circuits-oscilloscope'].includes(interactionId)) {
      setCameraMode('closeup', 'circuits');
    } else if (['optics-laser', 'optics-angle-dial', 'optics-submode-toggle', 'optics-screen'].includes(interactionId)) {
      setCameraMode('closeup', 'optics');
    } else if (['relativity-velocity-dial', 'relativity-contracting-rod', 'relativity-light-clock'].includes(interactionId)) {
      setCameraMode('closeup', 'relativity');
    }
  };

  const checkInteractions = () => {
    if (cameraMode === 'closeup') return;
    const isLocked = document.pointerLockElement === renderer.domElement || document.pointerLockElement === container;
    const rayPointer = isLocked || !mouseActive ? screenCenter : mouseScreenPos;
    raycaster.setFromCamera(rayPointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    let foundInteraction: EquipmentInteraction | null = null;
    for (const hit of intersects) {
      let currentObj: THREE.Object3D | null = hit.object;
      let inter: EquipmentInteraction | undefined = undefined;
      while (currentObj && !inter) {
        inter = objectToInteractionMap.get(currentObj) || currentObj.userData.equipmentInteraction;
        currentObj = currentObj.parent;
      }
      if (inter) {
        const maxDist = (inter.id.includes('placard') || inter.id === 'physics-whiteboard' || inter.id === 'campus-door' || inter.id.includes('assistant') || inter.id.includes('professor')) ? 14.0 : 8.5;
        if (hit.distance <= maxDist) {
          foundInteraction = inter;
          break;
        }
      }
    }

    if (!isLocked) {
      renderer.domElement.style.cursor = foundInteraction ? 'pointer' : 'default';
    }

    if (foundInteraction !== currentHoveredInteraction) {
      currentHoveredInteraction = foundInteraction;
      callbacks.onInteractionChange?.(currentHoveredInteraction);
    }
  };

  const interact = () => {
    if (cameraMode === 'closeup') {
      setCameraMode('walk');
      return;
    }
    if (currentHoveredInteraction) {
      triggerEquipmentAction(currentHoveredInteraction.id);
    }
  };

  // -------------------------------------------------------------
  // 18. Pointer Controls, Free Mouse-Look & Keyboard Listeners
  // -------------------------------------------------------------
  let isPointerDown = false;
  let dragTravel = 0;
  let prevMouseX = 0;
  let prevMouseY = 0;

  const interactAtScreenPoint = (clientX: number, clientY: number): boolean => {
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);
    for (const hit of intersects) {
      let currentObj: THREE.Object3D | null = hit.object;
      let inter: EquipmentInteraction | undefined = undefined;
      while (currentObj && !inter) {
        inter = objectToInteractionMap.get(currentObj) || currentObj.userData.equipmentInteraction;
        currentObj = currentObj.parent;
      }
      if (inter) {
        const maxDist = (inter.id.includes('placard') || inter.id === 'physics-whiteboard' || inter.id === 'campus-door' || inter.id.includes('assistant') || inter.id.includes('professor')) ? 14.0 : 8.5;
        if (hit.distance <= maxDist) {
          triggerEquipmentAction(inter.id);
          return true;
        }
      }
    }
    return false;
  };

  const requestPointerLock = () => {
    if (cameraMode !== 'walk') return;
    try {
      const lockReq = renderer.domElement.requestPointerLock?.();
      if (lockReq && typeof (lockReq as Promise<void>).catch === 'function') {
        void (lockReq as Promise<void>).catch(() => callbacks.onPointerLockChange?.(false));
      }
    } catch {
      // browser may refuse pointer lock before user gesture
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.target !== renderer.domElement) return;

    if (cameraMode === 'closeup') {
      return;
    }

    isPointerDown = true;
    dragTravel = 0;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;

    if (document.pointerLockElement !== renderer.domElement) {
      if (e.button === 0) {
        if (!interactAtScreenPoint(e.clientX, e.clientY)) {
          requestPointerLock();
        }
      }
      return;
    }

    if (e.button === 0) {
      interact();
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouseScreenPos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseScreenPos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    mouseActive = true;

    if (cameraMode === 'closeup') {
      if (activeStation === 'circuits') {
        raycaster.setFromCamera(mouseScreenPos, camera);
        const hits = raycaster.intersectObjects(multimeter3d.interactableMeshes, true);
        if (hits.length > 0) {
          const hitObj = hits[0].object;
          const tooltip = hitObj.userData.hoverTooltip || (hitObj.userData.terminalId ? `Terminal ${hitObj.userData.terminalId}` : null);
          renderer.domElement.style.cursor = 'pointer';
          callbacks.onCloseupHover?.(tooltip);
        } else {
          renderer.domElement.style.cursor = 'default';
          callbacks.onCloseupHover?.(null);
        }
      }
      return;
    }

    // When NOT in pointer lock, allow smooth dragging with either mouse button
    if (document.pointerLockElement !== renderer.domElement && isPointerDown) {
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      dragTravel += Math.hypot(dx, dy);
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      yaw -= dx * 0.0032;
      pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch - dy * 0.0032));
      updateCamera();
    }
  };

  // Free first-person mouse look while pointer is locked (zero buttons held)
  const onMouseMove = (e: MouseEvent) => {
    if (cameraMode === 'closeup') return;
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * 0.0022;
    pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch - e.movementY * 0.0022));
    updateCamera();
  };

  const onPointerUp = () => {
    isPointerDown = false;
  };

  const onPointerLockChange = () => {
    const locked = document.pointerLockElement === renderer.domElement;
    callbacks.onPointerLockChange?.(locked);
    if (!locked) {
      movement.forward = movement.backward = movement.left = movement.right = false;
      mouseActive = false;
    }
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  let lastProbeMoved: 'red' | 'black' = 'black';

  const onCanvasClick = (e: MouseEvent) => {
    if (!container || !renderer.domElement) return;

    if (cameraMode === 'closeup') {
      if (activeStation === 'circuits') {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const clickPointer = new THREE.Vector2(mouseX, mouseY);
        raycaster.setFromCamera(clickPointer, camera);
        const hits = raycaster.intersectObjects(multimeter3d.interactableMeshes, true);
        if (hits.length > 0) {
          const hitObj = hits[0].object;
          if (hitObj.userData.action === 'cycle_mode') {
            multimeter3d.cycleMode();
            playTone(800, 'square', 0.05, 0.12);
            return;
          }
          if (hitObj.userData.action === 'toggle_red_jack') {
            const next = multimeter3d.dmmState.redJack === 'v_ohm' ? 'ma_10a' : 'v_ohm';
            multimeter3d.setRedJack(next);
            playTone(600, 'sine', 0.06, 0.12);
            return;
          }
          if (hitObj.userData.action === 'toggle_jumper') {
            multimeter3d.toggleSeriesJumper();
            playTone(550, 'triangle', 0.08, 0.15);
            return;
          }
          if (hitObj.userData.terminalId) {
            const term = hitObj.userData.terminalId as TerminalId;
            // Intuitive resistor & component lead probe snapping with positive polarity:
            if (term === 'R1_A' || term === 'R1_B') {
              multimeter3d.setProbeTerminal('red', 'R1_A');
              multimeter3d.setProbeTerminal('black', 'R1_B');
              lastProbeMoved = 'black';
            } else if (term === 'R2_A' || term === 'R2_B') {
              multimeter3d.setProbeTerminal('red', 'R2_A');
              multimeter3d.setProbeTerminal('black', 'R2_B');
              lastProbeMoved = 'black';
            } else if (term === 'R3_A' || term === 'R3_B') {
              multimeter3d.setProbeTerminal('red', 'R3_A');
              multimeter3d.setProbeTerminal('black', 'R3_B');
              lastProbeMoved = 'black';
            } else if (term === 'SERIES_JACK_A' || term === 'SERIES_JACK_B') {
              multimeter3d.setProbeTerminal('red', 'SERIES_JACK_A');
              multimeter3d.setProbeTerminal('black', 'SERIES_JACK_B');
              lastProbeMoved = 'black';
            } else if (term === 'SRC_POS' || term === 'SRC_NEG') {
              multimeter3d.setProbeTerminal('red', 'SRC_POS');
              multimeter3d.setProbeTerminal('black', 'SRC_NEG');
              lastProbeMoved = 'black';
            } else {
              // Clicked individual terminal socket: intelligent alternating placement
              if (multimeter3d.dmmState.redProbeTerminal === term) {
                multimeter3d.setProbeTerminal('red', null);
              } else if (multimeter3d.dmmState.blackProbeTerminal === term) {
                multimeter3d.setProbeTerminal('black', null);
              } else if (!multimeter3d.dmmState.redProbeTerminal) {
                multimeter3d.setProbeTerminal('red', term);
                lastProbeMoved = 'red';
              } else if (!multimeter3d.dmmState.blackProbeTerminal) {
                multimeter3d.setProbeTerminal('black', term);
                lastProbeMoved = 'black';
              } else {
                const targetProbe = lastProbeMoved === 'red' ? 'black' : 'red';
                multimeter3d.setProbeTerminal(targetProbe, term);
                lastProbeMoved = targetProbe;
              }
            }
            playTone(720, 'sine', 0.05, 0.15);
            return;
          }
        }
      }
    } else {
      if (dragTravel >= 8) return;
      if (document.pointerLockElement !== renderer.domElement) {
        if (!interactAtScreenPoint(e.clientX, e.clientY)) {
          requestPointerLock();
        }
      }
    }
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('click', onCanvasClick);
  renderer.domElement.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onPointerLockChange);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && cameraMode === 'closeup') {
      setCameraMode('walk');
      return;
    }
    const key = e.key.toLowerCase();
    if (['arrowleft', 'q'].includes(key)) turning.left = true;
    else if (['arrowright'].includes(key)) turning.right = true;
    if (['w', 'arrowup'].includes(key)) movement.forward = true;
    else if (['s', 'arrowdown'].includes(key)) movement.backward = true;
    else if (key === 'a') movement.left = true;
    else if (key === 'd') movement.right = true;
    else if (key === 'e') interact();
    else if (key === 'v') {
      character.toggleView();
      updateCamera();
    } else if (key === 'c') {
      character.switchCharacter();
      updateCamera();
    } else if (key === '1') setStation('circuits');
    else if (key === '2') setStation('optics');
    else if (key === '3') setStation('relativity');
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (['arrowleft', 'q'].includes(key)) turning.left = false;
    else if (['arrowright'].includes(key)) turning.right = false;
    if (['w', 'arrowup'].includes(key)) movement.forward = false;
    else if (['s', 'arrowdown'].includes(key)) movement.backward = false;
    else if (key === 'a') movement.left = false;
    else if (key === 'd') movement.right = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // ResizeObserver for zero-stretching across all device orientations & panel toggles
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width || container.clientWidth;
      const height = entry.contentRect.height || container.clientHeight;
      if (width > 0 && height > 0) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        const pixelRatio = Math.min(window.devicePixelRatio, currentGraphicsSettings.resolutionScale);
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      }
    }
  });
  resizeObserver.observe(container);

  // -------------------------------------------------------------
  // 19. Set Station Function (Framing Workbench Matching Room 02)
  // -------------------------------------------------------------
  const setStation = (station: Room3StationId) => {
    if (station === activeStation && cameraMode === 'closeup') return;
    const isStationChange = station !== activeStation;
    activeStation = station;
    if (cameraMode === 'closeup' && isStationChange) {
      setCameraMode('walk');
    }
    playerPosition.set(STATION_X[station], eyeHeight, 3.2);
    yaw = 0;
    pitch = -0.06;
    character.root.position.x = playerPosition.x;
    character.root.position.z = playerPosition.z;
    stationLight.color.setHex(STATION_COLOR[station]);
    stationLight.position.x = STATION_X[station];
    (Object.keys(stationLamps) as Room3StationId[]).forEach((id) => {
      stationLamps[id].emissiveIntensity = id === station ? 2.6 : 0.55;
    });
    updateCamera();
  };
  setStation('circuits');

  // -------------------------------------------------------------
  // 20. Render & Animation Loop
  // -------------------------------------------------------------
  const clock = new THREE.Clock();
  let animationFrameId: number;
  let lastProximateStation: Room3StationId | null = null;
  let frameCount = 0;
  let lastFpsUpdate = performance.now();
  let lastRenderTime = performance.now();

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);

    const now = performance.now();

    // Frame rate limiting / battery saver
    if (currentGraphicsSettings.frameRateLimit > 0) {
      const minInterval = 1000 / currentGraphicsSettings.frameRateLimit;
      if (now - lastRenderTime < minInterval - 1.5) {
        return;
      }
    }
    lastRenderTime = now;

    // Real-time FPS & frame-time measurement
    frameCount++;
    if (now - lastFpsUpdate >= 500) {
      const fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      const ms = parseFloat(((now - lastFpsUpdate) / frameCount).toFixed(1));
      frameCount = 0;
      lastFpsUpdate = now;
      callbacks.onPerfStatsChange?.(fps, ms);
    }

    const delta = Math.min(0.08, clock.getDelta());
    const elapsed = clock.getElapsedTime();

    // Twinkling landmark stars
    if (currentGraphicsSettings.bloomAndAtmosphere) {
      landmarkStars.forEach((star) => {
        const twinkle = 1 + Math.sin(now * 0.001 * star.twinkleSpeed + star.phase) * 0.32;
        star.sprite.scale.set(star.baseScale * twinkle, star.baseScale * twinkle, 1);
      });
    }

    // Smooth keyboard turning
    const turnSpeed = 2.4;
    if (turning.left) {
      yaw += turnSpeed * delta;
      updateCamera();
    }
    if (turning.right) {
      yaw -= turnSpeed * delta;
      updateCamera();
    }

    // Door opening animation
    if (isDoorOpening && leftExitLeaf && rightExitLeaf) {
      doorAnimAngle = THREE.MathUtils.lerp(doorAnimAngle, doorTargetAngle, delta * 3.5);
      leftExitLeaf.rotation.y = -doorAnimAngle;
      rightExitLeaf.rotation.y = doorAnimAngle;
      if (Math.abs(doorAnimAngle - doorTargetAngle) < 0.02) {
        isDoorOpening = false;
        doorOpenedCallback?.();
      }
    }

    if (!isPaused) {
      if (cameraTransitionState !== 'none') {
        transitionProgress += delta / transitionDuration;
        if (transitionProgress >= 1.0) {
          transitionProgress = 1.0;
          if (cameraTransitionState === 'entering') {
            cameraTransitionState = 'none';
            camera.position.copy(targetCloseupCamPos);
            currentCamLookAt.copy(targetCloseupCamLookAt);
            camera.lookAt(currentCamLookAt);
            // Hide player character model in first-person workbench experiment mode
            character.isThirdPerson = false;
            character.syncVisibility();
          } else {
            cameraTransitionState = 'none';
            character.isThirdPerson = true;
            character.syncVisibility();
            updateCamera();
          }
        } else {
          // Cubic smoothstep easing
          const t = transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
          camera.position.lerpVectors(camStartPos, camTargetPos, t);
          currentCamLookAt.lerpVectors(camStartLookAt, camTargetLookAt, t);
          camera.lookAt(currentCamLookAt);
        }
      } else if (cameraMode === 'closeup') {
        camera.position.lerp(targetCloseupCamPos, delta * 6.0);
        currentCamLookAt.lerp(targetCloseupCamLookAt, delta * 6.0);
        camera.lookAt(currentCamLookAt);
      } else {
        // Player Movement in walk mode (Third-Person exploration)
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const dir = new THREE.Vector3();
        if (movement.forward) dir.add(forward);
        if (movement.backward) dir.sub(forward);
        if (movement.right) dir.add(right);
        if (movement.left) dir.sub(right);
        dir.addScaledVector(right, analogMovement.x);
        dir.addScaledVector(forward, analogMovement.y);

        if (dir.lengthSq() > 0) {
          const moveDist = Math.min(1, dir.length());
          dir.normalize().multiplyScalar(3.2 * delta * moveDist);
          const candX = playerPosition.x + dir.x;
          if (!checkCollision(candX, playerPosition.z)) playerPosition.x = candX;
          const candZ = playerPosition.z + dir.z;
          if (!checkCollision(playerPosition.x, candZ)) playerPosition.z = candZ;
          character.root.position.x = playerPosition.x;
          character.root.position.z = playerPosition.z;
          updateCamera();
        }

        character.update(delta, playerPosition, dir, yaw, pitch, camera, false);

        // Station Proximity Detection (student walking near experiment benches)
        let currentProximate: Room3StationId | null = null;
        if (playerPosition.z < 3.4 && playerPosition.z > -0.8) {
          (Object.keys(STATION_X) as Room3StationId[]).forEach((sId) => {
            if (Math.abs(playerPosition.x - STATION_X[sId]) < 2.4) {
              currentProximate = sId;
            }
          });
        }

        // Pulse in-world antique gold floor rings
        (Object.keys(stationFloorRings) as Room3StationId[]).forEach((sId) => {
          const ring = stationFloorRings[sId];
          if (ring) {
            const isNear = currentProximate === sId;
            const targetScale = isNear ? 1.06 + Math.sin(elapsed * 4.5) * 0.04 : 1.0;
            ring.scale.setScalar(targetScale);
            (ring.material as THREE.MeshStandardMaterial).emissiveIntensity = isNear ? 1.8 + Math.sin(elapsed * 5.0) * 0.8 : 0.45;
            (ring.material as THREE.MeshStandardMaterial).opacity = isNear ? 1.0 : 0.65;
          }
        });

        if (currentProximate !== lastProximateStation) {
          lastProximateStation = currentProximate;
          callbacks.onStationProximityChange?.(currentProximate);
        }
      }

      updateOscilloscope(delta);
      updateRelativityApparatus(delta);

      assistantGroup.position.y = Math.sin(elapsed * 1.5) * 0.003;
      professorGroup.position.y = Math.sin(elapsed * 1.2) * 0.003;

      // Station beacon lamp pulsing
      stationLamps[activeStation].emissiveIntensity = 2.4 + Math.sin(elapsed * 2.5) * 0.5;

      // In-World Guidance Marker Animation
      if (activeGuidanceId && guidanceMarker.visible) {
        if (getGuidanceTargetPosition(activeGuidanceId, guidancePosition)) {
          const bobbing = Math.sin(elapsed * 3.5) * 0.035;
          guidanceMarker.position.set(guidancePosition.x, guidancePosition.y + bobbing, guidancePosition.z);
          const pulse = 0.85 + Math.sin(elapsed * 4.5) * 0.15;
          guidanceRing.scale.setScalar(pulse);
          guidanceInnerRing.scale.setScalar(1.4 - pulse * 0.4);
          guidanceMarker.rotation.y = elapsed * 0.75;
        }
      }

      checkInteractions();
    }

    renderer.render(scene, camera);
  };
  animate();

  callbacks.onAssetsReady?.();

  // -------------------------------------------------------------
  // 21. Export Scene API
  // -------------------------------------------------------------
  return {
    dispose: () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      character.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry?.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m?.dispose());
        }
      });
      floorTexture.dispose();
      benchTexture.dispose();
      (Object.keys(placardTextures) as Room3StationId[]).forEach((id) => placardTextures[id].dispose());
      mahoganyDoorTex.dispose();
      lightBrassTex.dispose();
      darkBrassTex.dispose();
      circuitsPosterTex.dispose();
      relativityPosterTex.dispose();
      whiteboardTexture.dispose();
      doorSignTexture.dispose();
      starGeo.dispose();
      starMaterial.dispose();
      starGlowTex.dispose();
      diffractionTex.dispose();
      moonMaterial.dispose();
      moonDiffuseMap.dispose();
      moonBumpMap.dispose();
      moonCoronaMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    },
    interact,
    openDoor: (onOpened) => {
      if (doorOpen || isDoorOpening) return;
      isDoorOpening = true;
      doorOpen = true;
      doorTargetAngle = (Math.PI / 2) * 0.88;
      doorOpenedCallback = onOpened ?? null;
      playDoorSound(true);
    },
    requestPointerLock,
    resetView: () => setStation(activeStation),
    toggleView: () => {
      const is3rd = character.toggleView();
      updateCamera();
      return is3rd;
    },
    switchCharacter: () => {
      const next = character.switchCharacter();
      updateCamera();
      return next;
    },
    setCharacter: (type) => {
      character.setCharacter(type);
      updateCamera();
    },
    getCharacter: () => character.activeCharacter,
    setMove: (direction, active) => {
      movement[direction] = active;
    },
    setMoveVector: (right, forward) => {
      analogMovement.set(THREE.MathUtils.clamp(right, -1, 1), THREE.MathUtils.clamp(forward, -1, 1));
    },
    setCircuits: (settings) => {
      currentCircuits = { ...settings };
      updatePsuTexture(currentCircuits.vs, currentCircuits.freq, currentCircuits.mode === 'ac');
      multimeter3d.updateCircuitParameters({
        mode: currentCircuits.mode,
        topology: currentCircuits.topology,
        powerOn: currentCircuits.powerOn ?? true,
        sourceVoltage: currentCircuits.vs,
        frequency: currentCircuits.freq,
        waveType: 'sine',
        r1: currentCircuits.r1,
        r2: currentCircuits.r2,
        r3: currentCircuits.r3,
        inductanceMh: currentCircuits.inductance,
        capacitanceUf: currentCircuits.capacitance,
      });
    },
    setOptics: (settings) => {
      currentOptics = { ...settings };
      beamMat.color.set(wavelengthToRGB(currentOptics.wavelength));
      prismMesh.visible = currentOptics.subMode === 'refraction';
      lensMesh.visible = currentOptics.subMode === 'imaging';
      slitPlate.visible = currentOptics.subMode === 'diffraction';
      updateScreenTexture();
    },
    setRelativity: (settings) => {
      currentRelativity = { ...settings };
    },
    setStation,
    setGuidance: (interactionId) => {
      activeGuidanceId = interactionId;
      guidanceMarker.visible = Boolean(activeGuidanceId);
      if (activeGuidanceId) {
        let stId: Room3StationId = activeStation;
        if (activeGuidanceId.startsWith('circuits-')) stId = 'circuits';
        else if (activeGuidanceId.startsWith('optics-')) stId = 'optics';
        else if (activeGuidanceId.startsWith('relativity-')) stId = 'relativity';
        const color = STATION_COLOR[stId] ?? 0x38bdf8;
        guidanceMaterial.color.setHex(color);
        guidanceMaterial.emissive.setHex(color);
        guidanceRingMaterial.color.setHex(color);
        guidanceBeamMaterial.color.setHex(color);
      }
    },
    setPaused: (paused) => {
      isPaused = paused;
    },
    setCameraMode,
    getCameraMode: () => cameraMode,
    setDmmMode: (mode) => multimeter3d.setMode(mode),
    setDmmJack: (jack) => multimeter3d.setRedJack(jack),
    setProbeTerminal: (probe, term) => multimeter3d.setProbeTerminal(probe, term),
    flipProbePolarity: () => {
      const curRed = multimeter3d.dmmState.redProbeTerminal;
      const curBlack = multimeter3d.dmmState.blackProbeTerminal;
      multimeter3d.setProbeTerminal('red', curBlack);
      multimeter3d.setProbeTerminal('black', curRed);
      playTone(660, 'sine', 0.08, 0.15);
    },
    toggleSeriesJumper: () => multimeter3d.toggleSeriesJumper(),
    resetDmmFuse: () => multimeter3d.resetFuse(),
    getDmmReading: () => multimeter3d.updateDisplay(),
    setCloseupFocus,
    setCameraYawPitch: (targetYaw: number, targetPitch = pitch) => {
      yaw = targetYaw;
      pitch = targetPitch;
      updateCamera();
    },
    setGraphicsSettings: applyGraphicsSettings,
    getGraphicsSettings: () => ({ ...currentGraphicsSettings }),
    getGpuInfo: () => detectGpuRenderer(renderer.getContext()),
  };
}
