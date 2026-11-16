import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import {
  buildRoom3ArchitectureDecor,
  createBenchBankerLamp,
  createWallPlasterTexture,
  isCollidingWithDecor,
} from './room3ArchitectureDecor';
import {
  type CircuitSettings,
  type OpticsSettings,
  type RelativitySettings,
  type Room3StationId,
  type OscilloscopeSettings,
  type OscilloscopeChannelSource,
  INITIAL_CIRCUITS,
  INITIAL_OPTICS,
  INITIAL_RELATIVITY,
  INITIAL_OSCILLOSCOPE,
  CH1_VOLTS_DIV_OPTIONS,
  CH2_VOLTS_DIV_OPTIONS,
  TIME_DIV_OPTIONS,
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
  detectGpuRenderer,
  getEffectivePixelRatio,
  isMobileTouchDevice,
  loadGraphicsSettings,
} from './graphicsSettings';

export type Room3CloseupFocus =
  | 'station'
  | 'board'
  | 'multimeter'
  | 'psu'
  | 'oscilloscope'
  | 'laser'
  | 'lens'
  | 'screen'
  | 'clock'
  | 'rod'
  | 'console';

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
  setOscilloscope?: (settings: OscilloscopeSettings) => void;
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
  setActiveProbe?: (probe: 'red' | 'black') => void;
  getActiveProbe?: () => 'red' | 'black';
  flipProbePolarity: () => void;
  toggleSeriesJumper: () => void;
  resetDmmFuse: () => void;
  getDmmReading: () => MultimeterReading;
  setCloseupFocus?: (focus: Room3CloseupFocus) => void;
  zoomCloseup?: (deltaFactor: number) => number;
  resetCloseupCamera?: () => void;
  getCloseupZoom?: () => number;
  stepEquipment?: (interactionId: string, dir: 1 | -1) => boolean;
  setLabelsVisible?: (visible: boolean) => void;
  getLabelsVisible?: () => boolean;
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
  onCircuitsChange?: (patch: Partial<CircuitSettings>) => void;
  onOscilloscopeChange?: (patch: Partial<OscilloscopeSettings>) => void;
  onOpticsChange?: (patch: Partial<OpticsSettings>) => void;
  onRelativityChange?: (patch: Partial<RelativitySettings>) => void;
  onFootstep?: () => void;
  onInteractionChange?: (interaction: EquipmentInteraction | null) => void;
  onPointerLockChange?: (locked: boolean) => void;
  onCameraModeChange?: (mode: 'walk' | 'closeup') => void;
  onCloseupZoomChange?: (zoomFactor: number) => void;
  onDmmReadingChange?: (reading: MultimeterReading) => void;
  onDmmModeChange?: (mode: MultimeterMode) => void;
  onDmmJackChange?: (jack: MultimeterJack) => void;
  onJumperChange?: (closed: boolean) => void;
  onProbePlaced?: (probe: 'red' | 'black', terminal: TerminalId | null) => void;
  onActiveProbeChange?: (probe: 'red' | 'black') => void;
  onCloseupHover?: (text: string | null, interactionId?: string | null) => void;
  onStationProximityChange?: (station: Room3StationId | null) => void;
  onPerfStatsChange?: (fps: number, frameTimeMs: number) => void;
  onGuidanceIndicator?: (info: { screenX: number; screenY: number; isBehind: boolean; angleDeg: number; distanceM: number } | null) => void;
  onCharacterChange?: (character: CharacterType) => void;
  onContextLost?: () => void;
};

export const ROOM3_EQUIPMENT_DESCRIPTIONS: Record<string, string> = {
  // Station 01: Circuits
  'circuits-power-switch': 'Heavy-duty illuminated rocker switch that energizes the DC power supply and AC function generator.',
  'circuits-mode-toggle': 'Switches the circuit excitation regime between DC Steady-State and AC Sinusoidal (RLC).',
  'circuits-voltage-knob': 'Precision ten-turn potentiometer dial adjusting source voltage Vs from 1.0 V to 30.0 V.',
  'circuits-freq-knob': 'AC frequency synthesizer dial tuning driving frequency f from 10 Hz to 1000 Hz.',
  'circuits-topology-selector': 'Electronic patchboard selector switching between Series, Parallel, and Series-Parallel combinations.',
  'circuits-oscilloscope': 'Tektronix Dual-Channel Digital Storage Oscilloscope rendering live real-time V(t) and I(t) waveforms and phase angle.',
  'circuits-osc-time-knob': 'Horizontal sweep timebase dial adjusting display time per division (0.5 ms to 20 ms/div).',
  'circuits-osc-ch1-knob': 'Vertical sensitivity dial for Channel 1 adjusting volts per division (1.0 V to 20 V/div).',
  'circuits-osc-ch2-knob': 'Vertical sensitivity dial for Channel 2 adjusting scale per division (5.0 mA to 100 mA/div).',
  'circuits-osc-trigger-knob': 'Trigger run/stop push-knob freezing or acquiring live real-time circuit waveforms.',
  'circuits-osc-ch1-input': 'BNC coaxial input terminal for Channel 1. Click to cycle test node (Vs, R1, R2, R3).',
  'circuits-osc-ch2-input': 'BNC coaxial input terminal for Channel 2. Click to cycle test node (Current, R1, R2, R3).',
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
  'physics-whiteboard': 'Master Physics 2 lecture whiteboard detailing DC/AC circuit derivations, Snell\'s law & diffraction, and Lorentz spacetime equations.',
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
  let isDisposed = false;
  // 1. Scene, Camera, Renderer Setup
  const scene = new THREE.Scene();
  // Deep Celestial Cosmos Atmosphere matching Room 04
  scene.background = new THREE.Color(0x040814);
  scene.fog = new THREE.Fog(0x040814, 48, 280);

  const camera = new THREE.PerspectiveCamera(54, 1, 0.05, 360);
  let activeStation: Room3StationId = 'circuits';
  const eyeHeight = 1.70;
  // Student initially stands in front of the workbench medallion, facing north toward the workbenches
  const playerPosition = new THREE.Vector3(0, eyeHeight, 2.85);
  let yaw = 0;
  let pitch = -0.06;
  const movement = { forward: false, backward: false, left: false, right: false };
  const turning = { left: false, right: false };
  const analogMovement = new THREE.Vector2();

  let isPaused = false;
  let cameraMode: 'walk' | 'closeup' = 'walk';
  let doorOpen = false;
  let doorAnimAngle = 0;
  let doorTargetAngle = 0;
  let isDoorOpening = false;
  let doorOpenedCallback: (() => void) | null = null;
  let leftExitLeaf: THREE.Object3D | null = null;
  let rightExitLeaf: THREE.Object3D | null = null;
  let doorUsesFbxAxis = true;

  // Character Controller - Default Third-Person Character Camera for Immersive Exploration (matching Room 04)
  let applyInfiniteTsukuyomiState: ((active: boolean) => void) | null = null;
  const character = new CharacterController({
    scene,
    floorY: ROOM2_CONFIG.room.floorY,
    initialPosition: playerPosition,
    initialYaw: yaw,
    defaultCharacter: 'female',
    allowThirdPerson: true,
    defaultThirdPerson: true,
    onCharacterChanged: (type) => {
      applyInfiniteTsukuyomiState?.(type === 'madara');
      callbacks.onCharacterChange?.(type);
    },
  });

  // Walk-mode 3rd-person distance (~2.30m default over-the-shoulder view; scroll-wheel adjusts 1.60m - 4.95m)
  let walkExtraPullback = 0.15;
  const walkPullbackVec = new THREE.Vector3();
  const applyWalkCameraPullback = () => {
    if (!character.isThirdPerson || cameraMode === 'closeup') return;
    const cosPitch = Math.cos(pitch);
    walkPullbackVec.set(
      -Math.sin(yaw) * cosPitch,
      Math.sin(pitch),
      -Math.cos(yaw) * cosPitch
    );
    camera.position.addScaledVector(walkPullbackVec, -walkExtraPullback);
    camera.position.y += 0.08 + Math.min(0.26, walkExtraPullback * 0.09);
    const halfRoomW = ROOM2_CONFIG.room.width / 2 - 0.35;
    const roomFrontZ = -ROOM2_CONFIG.room.backZ - 0.35;
    const roomBackZ = ROOM2_CONFIG.room.backZ + 0.35;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -halfRoomW, halfRoomW);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, roomBackZ, roomFrontZ);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.45, ROOM2_CONFIG.room.height + 1.8);
  };

  const updateCamera = () => {
    character.updateCamera(camera, playerPosition, yaw, pitch);
    applyWalkCameraPullback();
  };
  updateCamera();

  const sconceLights: THREE.PointLight[] = [];
  const downlights: THREE.PointLight[] = [];
  const mobileTouch = isMobileTouchDevice();
  let currentGraphicsSettings: GraphicsSettings = loadGraphicsSettings();

  const renderer = new THREE.WebGLRenderer({
    antialias: !mobileTouch || (currentGraphicsSettings.antialiasing && (window.devicePixelRatio || 1) < 2),
    powerPreference: 'high-performance',
  });
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.setPixelRatio(getEffectivePixelRatio(currentGraphicsSettings.resolutionScale));
  renderer.shadowMap.enabled = currentGraphicsSettings.shadows !== 'off';
  renderer.shadowMap.type = currentGraphicsSettings.shadows === 'low' || mobileTouch
    ? THREE.BasicShadowMap
    : THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.background = '#040814';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  // Subtle PMREM studio reflection environment so antique brass trims, optical rails & metal bezels gleam
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envRoom = new RoomEnvironment();
  const roomEnvRT = pmremGenerator.fromScene(envRoom, 0.04);
  scene.environment = roomEnvRT.texture;
  scene.environmentIntensity = 0.22;
  envRoom.dispose();
  pmremGenerator.dispose();

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (!isDisposed) callbacks.onContextLost?.();
  };
  const handleContextRestored = () => {
    if (!isDisposed) renderer.render(scene, camera);
  };
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

  const applyGraphicsSettings = (newSettings: GraphicsSettings) => {
    currentGraphicsSettings = { ...newSettings };

    // 1. Resolution / Pixel Ratio
    const pixelRatio = getEffectivePixelRatio(currentGraphicsSettings.resolutionScale);
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
        renderer.shadowMap.type = THREE.PCFShadowMap;
        keyLight.shadow.mapSize.set(2048, 2048);
      }
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.04;
      keyLight.shadow.map?.dispose();
      keyLight.shadow.map = null;
    }

    // 3. Lighting Quality (essential 6-zone overhead fill & bench task lights stay active on all presets)
    sconceLights.forEach((light) => {
      light.visible = currentGraphicsSettings.lightingQuality !== 'simple';
      light.intensity = currentGraphicsSettings.lightingQuality === 'medium' ? 0.42 : 0.58;
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
  let currentCircuits: CircuitSettings = { ...INITIAL_CIRCUITS };

  let currentOptics: OpticsSettings = { ...INITIAL_OPTICS };

  let currentRelativity: RelativitySettings = { ...INITIAL_RELATIVITY };

  // -------------------------------------------------------------
  // 2. Texture & Asset Loading
  // -------------------------------------------------------------
  const loadingManager = new THREE.LoadingManager();
  loadingManager.onProgress = (_url, loaded, total) => {
    if (!isDisposed) callbacks.onAssetProgress?.(loaded, total);
  };
  loadingManager.onLoad = () => {
    if (!isDisposed) callbacks.onAssetsReady?.();
  };

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

  const doorSteelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.24,
    metalness: 0.92,
  });

  const applyEntranceDoorMaterials = (model: THREE.Object3D) => {
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const remap = (mat: THREE.Material): THREE.Material => {
          const name = (mat.name || '').toLowerCase();
          if (name.includes('brass') || name.includes('gold')) {
            return name.includes('antique') || name.includes('dark') ? doorDarkBrassMat : doorBrassMat;
          }
          if (name.includes('steel') || name.includes('metal') || name.includes('960')) {
            return doorSteelMat;
          }
          return doorMahoganyMat;
        };

        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(remap);
        } else if (mesh.material) {
          mesh.material = remap(mesh.material);
        }
      }
    });
  };

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

  // Mathematical Typesetter & Handwritten Marker Engine for Room 03 Boards
  type MathNode =
    | { kind: 'text'; text: string; italic?: boolean; bold?: boolean }
    | { kind: 'sub'; base: MathNode[]; sub: MathNode[] }
    | { kind: 'sup'; base: MathNode[]; sup: MathNode[] }
    | { kind: 'frac'; num: MathNode[]; den: MathNode[] }
    | { kind: 'sqrt'; inner: MathNode[] };

  const mt = (text: string, italic = false, bold = false): MathNode => ({
    kind: 'text',
    text,
    italic,
    bold,
  });
  const msub = (base: string | MathNode[], sub: string | MathNode[], baseItalic = true): MathNode => ({
    kind: 'sub',
    base: typeof base === 'string' ? [mt(base, baseItalic)] : base,
    sub: typeof sub === 'string' ? [mt(sub, false)] : sub,
  });
  const msup = (base: string | MathNode[], sup: string | MathNode[], baseItalic = true): MathNode => ({
    kind: 'sup',
    base: typeof base === 'string' ? [mt(base, baseItalic)] : base,
    sup: typeof sup === 'string' ? [mt(sup, false)] : sup,
  });
  const mfrac = (num: MathNode[], den: MathNode[]): MathNode => ({ kind: 'frac', num, den });
  const msqrt = (inner: MathNode[]): MathNode => ({ kind: 'sqrt', inner });

  interface MathMetrics {
    width: number;
    ascent: number;
    descent: number;
  }

  const measureMath = (
    ctx: CanvasRenderingContext2D,
    nodes: MathNode[],
    fontSize: number,
    fontFamily: string
  ): MathMetrics => {
    let width = 0;
    let ascent = fontSize * 0.72;
    let descent = fontSize * 0.22;

    nodes.forEach((node) => {
      if (node.kind === 'text') {
        ctx.font = `${node.italic ? 'italic ' : ''}${node.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
        width += ctx.measureText(node.text).width;
      } else if (node.kind === 'sub') {
        const baseM = measureMath(ctx, node.base, fontSize, fontFamily);
        const subM = measureMath(ctx, node.sub, Math.round(fontSize * 0.65), fontFamily);
        width += baseM.width + subM.width + 1;
        ascent = Math.max(ascent, baseM.ascent);
        descent = Math.max(descent, baseM.descent, subM.descent + fontSize * 0.24);
      } else if (node.kind === 'sup') {
        const baseM = measureMath(ctx, node.base, fontSize, fontFamily);
        const supM = measureMath(ctx, node.sup, Math.round(fontSize * 0.65), fontFamily);
        width += baseM.width + supM.width + 1;
        ascent = Math.max(ascent, baseM.ascent, supM.ascent + fontSize * 0.34);
        descent = Math.max(descent, baseM.descent);
      } else if (node.kind === 'frac') {
        const fSize = Math.round(fontSize * 0.78);
        const numM = measureMath(ctx, node.num, fSize, fontFamily);
        const denM = measureMath(ctx, node.den, fSize, fontFamily);
        const barW = Math.max(numM.width, denM.width) + 12;
        const axisY = fontSize * 0.28;
        width += barW + 4;
        ascent = Math.max(ascent, axisY + 5 + numM.ascent + numM.descent);
        descent = Math.max(descent, 6 + denM.ascent + denM.descent - axisY);
      } else if (node.kind === 'sqrt') {
        const innerM = measureMath(ctx, node.inner, fontSize, fontFamily);
        const hookW = Math.max(12, fontSize * 0.44);
        width += hookW + innerM.width + 10;
        ascent = Math.max(ascent, innerM.ascent + 8);
        descent = Math.max(descent, innerM.descent);
      }
    });

    return { width, ascent, descent };
  };

  const drawMathNodes = (
    ctx: CanvasRenderingContext2D,
    nodes: MathNode[],
    x: number,
    y: number,
    fontSize: number,
    color: string,
    fontFamily: string,
    lineWidth = 2.2
  ): number => {
    let cursorX = x;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    nodes.forEach((node) => {
      if (node.kind === 'text') {
        ctx.font = `${node.italic ? 'italic ' : ''}${node.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
        ctx.fillStyle = color;
        ctx.fillText(node.text, cursorX, y);
        cursorX += ctx.measureText(node.text).width;
      } else if (node.kind === 'sub') {
        cursorX = drawMathNodes(ctx, node.base, cursorX, y, fontSize, color, fontFamily, lineWidth);
        const subSize = Math.round(fontSize * 0.65);
        cursorX = drawMathNodes(ctx, node.sub, cursorX, y + fontSize * 0.24, subSize, color, fontFamily, lineWidth * 0.8);
        cursorX += 1;
      } else if (node.kind === 'sup') {
        cursorX = drawMathNodes(ctx, node.base, cursorX, y, fontSize, color, fontFamily, lineWidth);
        const supSize = Math.round(fontSize * 0.65);
        cursorX = drawMathNodes(ctx, node.sup, cursorX, y - fontSize * 0.34, supSize, color, fontFamily, lineWidth * 0.8);
        cursorX += 1;
      } else if (node.kind === 'frac') {
        const fSize = Math.round(fontSize * 0.78);
        const numM = measureMath(ctx, node.num, fSize, fontFamily);
        const denM = measureMath(ctx, node.den, fSize, fontFamily);
        const barW = Math.max(numM.width, denM.width) + 12;
        const barY = y - fontSize * 0.28;
        const numBaseline = barY - 5 - numM.descent;
        const denBaseline = barY + 6 + denM.ascent;

        drawMathNodes(ctx, node.num, cursorX + 2 + (barW - numM.width) / 2, numBaseline, fSize, color, fontFamily, lineWidth * 0.85);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.8, lineWidth);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cursorX + 2, barY);
        ctx.quadraticCurveTo(cursorX + 2 + barW * 0.5, barY - 0.8, cursorX + 2 + barW, barY + 0.4);
        ctx.stroke();
        ctx.restore();
        drawMathNodes(ctx, node.den, cursorX + 2 + (barW - denM.width) / 2, denBaseline, fSize, color, fontFamily, lineWidth * 0.85);
        cursorX += barW + 4;
      } else if (node.kind === 'sqrt') {
        const innerM = measureMath(ctx, node.inner, fontSize, fontFamily);
        const hookW = Math.max(12, fontSize * 0.44);
        const topBarY = y - innerM.ascent - 4;
        const botY = y + innerM.descent * 0.65;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.8, lineWidth);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cursorX + 1, y - innerM.ascent * 0.34);
        ctx.lineTo(cursorX + hookW * 0.45, botY);
        ctx.lineTo(cursorX + hookW, topBarY);
        ctx.lineTo(cursorX + hookW + innerM.width + 8, topBarY + 0.5);
        ctx.stroke();
        ctx.restore();
        drawMathNodes(ctx, node.inner, cursorX + hookW + 3, y, fontSize, color, fontFamily, lineWidth);
        cursorX += hookW + innerM.width + 10;
      }
    });

    return cursorX;
  };

  // Authentic Handwritten Physics III Whiteboard Texture (Dry-Erase Marker Style + Real Stacked Equations)
  const createRoom3WhiteboardTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    const HAND_FONT = '"Segoe Print", "Segoe Script", "Bradley Hand", "Comic Sans MS", cursive';
    const MATH_FONT = '"Segoe Print", "Segoe Script", Georgia, serif';

    // Warm porcelain dry-erase surface with faint erased smudges
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1024);
    bgGrad.addColorStop(0, '#fcfcf8');
    bgGrad.addColorStop(0.55, '#f6f7f2');
    bgGrad.addColorStop(1, '#eef0ea');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 2048, 1024);

    // Subtle horizontal wiped dry-erase smudge trails
    ctx.fillStyle = 'rgba(71, 85, 105, 0.025)';
    for (let i = 0; i < 42; i++) {
      ctx.beginPath();
      ctx.ellipse(
        100 + (i * 173) % 1840,
        90 + (i * 89) % 860,
        65 + (i % 4) * 24,
        10 + (i % 3) * 4,
        -0.06,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Freehand Marker Stroke Helpers
    const drawHandLine = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string,
      lw = 2.6,
      bow = 1.8,
      dashed = false
    ) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (dashed) ctx.setLineDash([10, 8]);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.max(1, Math.hypot(dx, dy));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx - (dy / len) * bow, my + (dx / len) * bow, x2, y2);
      ctx.stroke();
      ctx.restore();
    };

    const drawHandArrow = (x1: number, y1: number, x2: number, y2: number, color: string, lw = 3.2, bow = 1.5) => {
      drawHandLine(x1, y1, x2, y2, color, lw, bow);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 14;
      drawHandLine(x2, y2, x2 - headLen * Math.cos(angle - 0.42), y2 - headLen * Math.sin(angle - 0.42), color, lw, 0.5);
      drawHandLine(x2, y2, x2 - headLen * Math.cos(angle + 0.46), y2 - headLen * Math.sin(angle + 0.46), color, lw, -0.5);
    };

    const drawHandLoop = (x: number, y: number, w: number, h: number, color: string, lw = 2.4) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 12, y);
      ctx.quadraticCurveTo(x + w * 0.5, y - 4, x + w - 10, y + 2);
      ctx.quadraticCurveTo(x + w + 5, y + h * 0.5, x + w - 8, y + h);
      ctx.quadraticCurveTo(x + w * 0.5, y + h + 4, x + 10, y + h - 2);
      ctx.quadraticCurveTo(x - 5, y + h * 0.5, x + 14, y + 3);
      ctx.stroke();
      ctx.restore();
    };

    // Handwritten Lecture Board Header
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold 34px ${HAND_FONT}`;
    ctx.fillText('Experimental Physics 2: Electricity, Optics & Special Relativity', 52, 62);
    ctx.fillStyle = '#475569';
    ctx.font = `19px ${HAND_FONT}`;
    ctx.fillText('Lab 03 — Governing Equations, Sketches & Derivations', 54, 98);
    drawHandLine(52, 114, 1990, 117, '#334155', 2.4, 2.5);
    drawHandLine(54, 120, 620, 119, '#1d4ed8', 1.8, -1.5);

    // Handwritten margin reminder top-right
    ctx.save();
    ctx.translate(1690, 56);
    ctx.rotate(-0.035);
    ctx.fillStyle = '#dc2626';
    ctx.font = `bold 18px ${HAND_FONT}`;
    ctx.fillText('* Verify units & sign rules!', 0, 0);
    ctx.restore();

    // Hand-drawn vertical column separators
    drawHandLine(688, 134, 686, 950, '#94a3b8', 2.2, 2.5, true);
    drawHandLine(1348, 134, 1351, 950, '#94a3b8', 2.2, -2.5, true);

    // =============================================================
    // COLUMN 1: DC & AC ELECTRICAL CIRCUITS (Blue Ink + Red Accents)
    // =============================================================
    ctx.fillStyle = '#1d4ed8';
    ctx.font = `bold 25px ${HAND_FONT}`;
    ctx.fillText('1. DC & AC Electrical Circuits', 52, 162);
    drawHandLine(52, 170, 445, 172, '#1d4ed8', 2.2, 1.5);

    ctx.fillStyle = '#1e293b';
    ctx.font = `18px ${HAND_FONT}`;
    ctx.fillText("Ohm's Law & Kirchhoff's Rules:", 52, 204);

    // I = Vs / Req  &  Sum I_in = Sum I_out
    drawMathNodes(
      ctx,
      [
        mt('I = ', true),
        mfrac([msub('V', 's')], [msub('R', 'eq')]),
        mt('        Σ '),
        msub('I', 'in'),
        mt(' = Σ '),
        msub('I', 'out'),
      ],
      68,
      258,
      25,
      '#1e40af',
      MATH_FONT
    );
    drawHandLoop(56, 215, 195, 70, 'rgba(220, 38, 38, 0.55)', 2.0);

    // Series, Parallel & Power
    drawMathNodes(
      ctx,
      [mt('Series:  ', false), msub('R', 'eq'), mt(' = '), msub('R', '1'), mt(' + '), msub('R', '2'), mt(' + '), msub('R', '3')],
      64,
      316,
      19,
      '#334155',
      MATH_FONT
    );
    drawMathNodes(
      ctx,
      [
        mt('Parallel:  ', false),
        mfrac([mt('1')], [msub('R', 'eq')]),
        mt(' = '),
        mfrac([mt('1')], [msub('R', '1')]),
        mt(' + '),
        mfrac([mt('1')], [msub('R', '2')]),
        mt(' + '),
        mfrac([mt('1')], [msub('R', '3')]),
      ],
      64,
      374,
      19,
      '#334155',
      MATH_FONT
    );
    drawMathNodes(
      ctx,
      [mt('Power:  ', false), mt('P = ', true), msup('I', '2'), mt('·'), msub('R', 'eq'), mt(' = '), msub('V', 's'), mt('·I   [W]', true)],
      64,
      432,
      19,
      '#334155',
      MATH_FONT
    );

    // AC RLC Impedance
    ctx.fillStyle = '#1e293b';
    ctx.font = `18px ${HAND_FONT}`;
    ctx.fillText('AC Sinusoidal RLC Phasor Impedance:', 52, 478);

    drawMathNodes(
      ctx,
      [
        mt('Z = ', true),
        msqrt([msup([msub('R', 'eq')], '2'), mt(' + ('), msub('X', 'L'), mt(' − '), msub('X', 'C'), mt(')'), msup('', '2')]),
      ],
      64,
      534,
      21,
      '#1d4ed8',
      MATH_FONT
    );
    drawMathNodes(
      ctx,
      [mt('tan φ = '), mfrac([msub('X', 'L'), mt(' − '), msub('X', 'C')], [msub('R', 'eq')])],
      405,
      534,
      20,
      '#1d4ed8',
      MATH_FONT
    );

    drawMathNodes(
      ctx,
      [
        msub('X', 'L'),
        mt(' = 2πfL     '),
        msub('X', 'C'),
        mt(' = '),
        mfrac([mt('1')], [mt('2πfC')]),
      ],
      64,
      596,
      19,
      '#334155',
      MATH_FONT
    );

    drawMathNodes(
      ctx,
      [
        msub('f', '0'),
        mt(' = '),
        mfrac([mt('1')], [mt('2π'), msqrt([mt('LC', true)])]),
        mt('    (φ = 0°,  cos φ = 1)'),
      ],
      64,
      658,
      19,
      '#334155',
      MATH_FONT
    );

    // Hand-sketched RLC Phasor Diagram directly on the board
    drawHandLine(95, 865, 420, 865, '#1d4ed8', 3.4, 1.5); // horizontal axis guide
    drawHandArrow(95, 865, 385, 865, '#1d4ed8', 3.6, 1.2); // VR
    drawHandArrow(385, 865, 385, 735, '#047857', 3.4, -1.2); // VL - VC
    drawHandArrow(95, 865, 385, 735, '#dc2626', 3.6, -2.0); // Vs resultant
    // Right angle corner square
    drawHandLine(368, 865, 368, 848, '#475569', 2.0, 0);
    drawHandLine(368, 848, 385, 848, '#475569', 2.0, 0);
    // Phase arc phi
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(95, 865, 58, -0.42, 0);
    ctx.stroke();
    ctx.fillStyle = '#dc2626';
    ctx.font = `italic bold 19px ${MATH_FONT}`;
    ctx.fillText('φ', 160, 855);

    drawMathNodes(ctx, [msub('V', 'R'), mt('  (in phase w/ I)')], 165, 898, 17, '#1e40af', HAND_FONT);
    drawMathNodes(ctx, [msub('V', 'L'), mt(' − '), msub('V', 'C')], 402, 804, 18, '#047857', HAND_FONT);
    drawMathNodes(ctx, [msub('V', 's'), mt('  (Total Phasor)')], 162, 775, 18, '#b91c1c', HAND_FONT);

    ctx.fillStyle = '#475569';
    ctx.font = `italic 15px ${HAND_FONT}`;
    ctx.fillText('note: check phase on scope!', 410, 916);

    // =============================================================
    // COLUMN 2: GEOMETRIC & PHYSICAL OPTICS (Emerald Ink)
    // =============================================================
    ctx.fillStyle = '#047857';
    ctx.font = `bold 25px ${HAND_FONT}`;
    ctx.fillText('2. Geometric & Physical Optics', 712, 162);
    drawHandLine(712, 170, 1140, 172, '#047857', 2.2, -1.5);

    ctx.fillStyle = '#1e293b';
    ctx.font = `18px ${HAND_FONT}`;
    ctx.fillText("Snell's Law & Total Internal Reflection:", 712, 204);

    drawMathNodes(
      ctx,
      [msub('n', '1'), mt(' · sin '), msub('θ', '1'), mt('  =  '), msub('n', '2'), mt(' · sin '), msub('θ', '2')],
      732,
      254,
      25,
      '#065f46',
      MATH_FONT
    );
    drawHandLoop(718, 220, 355, 54, 'rgba(4, 120, 87, 0.45)', 2.0);

    drawMathNodes(
      ctx,
      [
        mt('Critical Angle:  sin '),
        msub('θ', 'c'),
        mt(' = '),
        mfrac([msub('n', '2')], [msub('n', '1')]),
        mt('    ('),
        msub('n', '1'),
        mt(' > '),
        msub('n', '2'),
        mt(')'),
      ],
      726,
      316,
      19,
      '#334155',
      MATH_FONT
    );
    drawMathNodes(
      ctx,
      [mt('Total Internal Reflection occurs when  '), msub('θ', '1'), mt(' > '), msub('θ', 'c')],
      726,
      372,
      18,
      '#b45309',
      HAND_FONT
    );

    ctx.fillStyle = '#1e293b';
    ctx.font = `18px ${HAND_FONT}`;
    ctx.fillText("Thin Lens Formula & Young's Double Slit:", 712, 424);

    drawMathNodes(
      ctx,
      [
        mfrac([mt('1')], [mt('f', true)]),
        mt(' = '),
        mfrac([mt('1')], [msub('d', 'o')]),
        mt(' + '),
        mfrac([mt('1')], [msub('d', 'i')]),
        mt('        M = −', true),
        mfrac([msub('d', 'i')], [msub('d', 'o')]),
      ],
      732,
      488,
      21,
      '#047857',
      MATH_FONT
    );

    drawMathNodes(
      ctx,
      [mt('Δy = '), mfrac([mt('λ · L')], [mt('d', true)]), mt('      (fringe spacing)')],
      732,
      556,
      21,
      '#047857',
      MATH_FONT
    );

    // Hand-sketched Semicircular Prism Ray Trace Sketch directly on board
    const pCx = 1020;
    const pCy = 775;
    const pR = 110;
    ctx.save();
    ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.arc(pCx, pCy, pR, -Math.PI / 2, Math.PI / 2, true);
    ctx.lineTo(pCx, pCy - pR);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Dashed surface normal horizontal line
    drawHandLine(820, pCy, 1245, pCy, '#64748b', 2.0, 0, true);
    // Incident & Refracted rays
    drawHandArrow(815, pCy - 102, pCx, pCy, '#dc2626', 3.4, -1.5);
    drawHandArrow(pCx, pCy, 1230, pCy + 64, '#059669', 3.4, 1.5);
    // Reflected faint TIR ray
    drawHandLine(pCx, pCy, 855, pCy + 82, 'rgba(220, 38, 38, 0.45)', 2.0, 1.0, true);

    drawMathNodes(ctx, [mt('Incident '), msub('θ', '1')], 802, pCy - 58, 17, '#dc2626', HAND_FONT);
    drawMathNodes(ctx, [mt('Refracted '), msub('θ', '2')], 1108, pCy + 88, 17, '#047857', HAND_FONT);
    ctx.fillStyle = '#0284c7';
    ctx.font = `italic 15px ${HAND_FONT}`;
    ctx.fillText('glass (n₂)', pCx - 96, pCy + 76);

    // =============================================================
    // COLUMN 3: SPECIAL THEORY OF RELATIVITY (Violet Ink)
    // =============================================================
    ctx.fillStyle = '#6d28d9';
    ctx.font = `bold 25px ${HAND_FONT}`;
    ctx.fillText('3. Special Theory of Relativity', 1372, 162);
    drawHandLine(1372, 170, 1810, 172, '#6d28d9', 2.2, 1.5);

    ctx.fillStyle = '#1e293b';
    ctx.font = `18px ${HAND_FONT}`;
    ctx.fillText("Einstein's Postulates & Lorentz Factor:", 1372, 204);

    drawMathNodes(
      ctx,
      [
        mt('γ = '),
        mfrac([mt('1')], [msqrt([mt('1 − '), msup('β', '2')])]),
        mt('        β = '),
        mfrac([mt('v', true)], [mt('c', true)]),
      ],
      1392,
      266,
      23,
      '#6d28d9',
      MATH_FONT
    );
    drawHandLoop(1378, 224, 240, 74, 'rgba(220, 38, 38, 0.5)', 2.0);

    drawMathNodes(
      ctx,
      [mt('Time Dilation:  Δt = γ · '), msub('Δt', '0')],
      1386,
      332,
      19,
      '#334155',
      MATH_FONT
    );
    drawMathNodes(
      ctx,
      [mt('Length Contraction:  L = '), mfrac([msub('L', '0')], [mt('γ')]), mt('   (motion axis)')],
      1386,
      392,
      19,
      '#334155',
      MATH_FONT
    );
    drawMathNodes(
      ctx,
      [mt('Momentum:  p = γ · '), msub('m', '0'), mt(' · v')],
      1386,
      448,
      19,
      '#334155',
      MATH_FONT
    );

    ctx.fillStyle = '#1e293b';
    ctx.font = `18px ${HAND_FONT}`;
    ctx.fillText('Mass–Energy Equivalence:', 1372, 494);

    drawMathNodes(
      ctx,
      [mt('E = γ · '), msub('m', '0'), mt(' · '), msup('c', '2'), mt(' = '), msub('E', '0'), mt(' + K')],
      1392,
      540,
      23,
      '#7c3aed',
      MATH_FONT
    );
    drawHandLine(1390, 550, 1745, 551, '#7c3aed', 2.0, -1.0);

    drawMathNodes(
      ctx,
      [
        msub('E', '0'),
        mt(' = '),
        msub('m', '0'),
        msup('c', '2'),
        mt('        K = (γ − 1)'),
        msub('m', '0'),
        msup('c', '2'),
      ],
      1392,
      592,
      19,
      '#334155',
      MATH_FONT
    );

    // Hand-sketched Rest Frame S' vs Lab Frame S Light Clock Diagram
    // Rest clock mirrors (left)
    drawHandLine(1425, 675, 1545, 675, '#475569', 4.0, 0.5);
    drawHandLine(1425, 835, 1545, 835, '#475569', 4.0, -0.5);
    drawHandArrow(1485, 835, 1485, 682, '#d97706', 3.4, 1.0);
    drawMathNodes(
      ctx,
      [mt("Rest Frame S':  "), msub('Δt', '0'), mt(' = '), mfrac([mt('2d')], [mt('c')])],
      1392,
      892,
      17,
      '#b45309',
      HAND_FONT
    );

    // Moving clock zigzag photon path (right)
    drawHandLine(1690, 675, 1810, 675, '#475569', 4.0, 0.5);
    drawHandLine(1820, 835, 1940, 835, '#475569', 4.0, -0.5);
    drawHandArrow(1660, 835, 1750, 680, '#7c3aed', 3.4, -1.2);
    drawHandArrow(1750, 680, 1878, 830, '#7c3aed', 3.4, 1.2);
    drawHandArrow(1830, 675, 1925, 675, '#0284c7', 2.6, 0.6);
    ctx.fillStyle = '#0284c7';
    ctx.font = `italic bold 17px ${MATH_FONT}`;
    ctx.fillText('v', 1934, 681);

    drawMathNodes(
      ctx,
      [mt('Lab Frame S:  Δt = γ·'), msub('Δt', '0')],
      1662,
      892,
      17,
      '#6d28d9',
      HAND_FONT
    );

    // Handwritten bottom safety note
    ctx.fillStyle = '#dc2626';
    ctx.font = `italic bold 17px ${HAND_FONT}`;
    ctx.fillText('* Keep laser safety interlocks ON during beam runs. Switch HV power OFF before rewiring!', 56, 992);

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
    const POSTER_MATH = 'Georgia, "Times New Roman", serif';

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
    ctx.fillRect(32, 110, 336, 174);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(32, 110, 336, 174);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Segoe UI", sans-serif';
    ctx.fillText('Series-Parallel RLC Relations', 50, 140);
    drawMathNodes(
      ctx,
      [mt('Z = ', true), msqrt([msup([msub('R', 'eq')], '2'), mt(' + ('), msub('X', 'L'), mt(' − '), msub('X', 'C'), mt(')'), msup('', '2')])],
      50,
      184,
      19,
      '#38bdf8',
      POSTER_MATH
    );
    drawMathNodes(
      ctx,
      [mt('Resonance: '), msub('X', 'L'), mt(' = '), msub('X', 'C'), mt('   ('), msub('Z', 'min'), mt(' = '), msub('R', 'eq'), mt(')')],
      50,
      226,
      14,
      '#cbd5e1',
      POSTER_MATH
    );
    drawMathNodes(
      ctx,
      [mt('Power Factor:  cos φ = '), mfrac([msub('R', 'eq')], [mt('Z', true)])],
      50,
      260,
      14,
      '#cbd5e1',
      POSTER_MATH
    );

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(400, 110, 336, 174);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(400, 110, 336, 174);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Segoe UI", sans-serif';
    ctx.fillText('Quality Factor & Bandwidth', 418, 140);
    drawMathNodes(
      ctx,
      [mt('Q = ', true), mfrac([mt('1')], [mt('R', true)]), msqrt([mfrac([mt('L', true)], [mt('C', true)])]), mt('    BW = '), mfrac([msub('f', '0')], [mt('Q', true)])],
      418,
      188,
      18,
      '#10b981',
      POSTER_MATH
    );
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('Higher Q yields sharp resonance peak', 418, 232);
    ctx.fillText('Selectivity criterion in RF filters', 418, 258);

    ctx.fillStyle = '#090d16';
    ctx.fillRect(32, 304, 704, 176);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(32, 304, 704, 176);

    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let px = 40; px <= 730; px += 2) {
      const y = 392 - Math.sin((px - 40) * 0.035) * 55;
      if (px === 40) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let px = 40; px <= 730; px += 2) {
      const y = 392 - Math.sin((px - 40) * 0.035 - 0.75) * 45;
      if (px === 40) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillText('Voltage V(t)', 55, 334);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('Current I(t) [Lagging inductive phase]', 180, 334);

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
    const POSTER_MATH = 'Georgia, "Times New Roman", serif';

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
    ctx.fillRect(32, 110, 336, 174);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(32, 110, 336, 174);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Segoe UI", sans-serif';
    ctx.fillText('Invariant Spacetime Interval', 50, 140);
    drawMathNodes(
      ctx,
      [msup('Δs', '2'), mt(' = '), msup('c', '2'), msup('Δt', '2'), mt(' − '), msup('Δx', '2')],
      50,
      186,
      21,
      '#c084fc',
      POSTER_MATH
    );
    drawMathNodes(ctx, [msup('Δs', '2'), mt(' > 0: Timelike (Causally linked)')], 50, 226, 14, '#cbd5e1', POSTER_MATH);
    drawMathNodes(ctx, [msup('Δs', '2'), mt(' = 0: Lightlike (Photon worldline)')], 50, 254, 14, '#cbd5e1', POSTER_MATH);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(400, 110, 336, 174);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(400, 110, 336, 174);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Segoe UI", sans-serif';
    ctx.fillText('Relativistic Longitudinal Doppler', 418, 140);
    drawMathNodes(
      ctx,
      [msub('f', 'obs'), mt(' = '), msub('f', 's'), mt(' '), msqrt([mfrac([mt('1 − β')], [mt('1 + β')])])],
      418,
      192,
      19,
      '#10b981',
      POSTER_MATH
    );
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('Receding source: Redshift (z > 0)', 418, 232);
    ctx.fillText('Approaching source: Blueshift (z < 0)', 418, 258);

    ctx.fillStyle = '#090d16';
    ctx.fillRect(32, 304, 704, 176);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(32, 304, 704, 176);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(384, 314);
    ctx.lineTo(384, 470);
    ctx.moveTo(150, 392);
    ctx.lineTo(618, 392);
    ctx.stroke();

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(304, 470);
    ctx.lineTo(464, 314);
    ctx.moveTo(304, 314);
    ctx.lineTo(464, 470);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.fillText('Light Cone (v = c)', 475, 334);
    ctx.fillStyle = '#a855f7';
    ctx.fillText('ct (Time Axis)', 392, 329);
    ctx.fillText('x (Spatial Axis)', 625, 397);

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
  // 4. Lighting & Architectural Illumination (Physically Balanced Evening Observatory)
  // -------------------------------------------------------------
  // Subtle night-dome sky vs dark wood floor bounce so natural shadows define depth
  const hemiLight = new THREE.HemisphereLight(0x9fc2eb, 0x1a1114, 0.58);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.05);
  keyLight.position.set(5, 10, 7);
  keyLight.castShadow = currentGraphicsSettings.shadows !== 'off';
  const initShadowSize = currentGraphicsSettings.shadows === 'low' ? 512 : currentGraphicsSettings.shadows === 'medium' ? 1024 : 2048;
  keyLight.shadow.mapSize.width = initShadowSize;
  keyLight.shadow.mapSize.height = initShadowSize;
  keyLight.shadow.camera.left = -15;
  keyLight.shadow.camera.right = 15;
  keyLight.shadow.camera.top = 15;
  keyLight.shadow.camera.bottom = -15;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 40;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.04;
  scene.add(keyLight);

  const stationLight = new THREE.PointLight(STATION_COLOR.circuits, 7.5, 11, 2.0);
  stationLight.position.set(STATION_X.circuits, 4.3, 1.8);
  scene.add(stationLight);

  // 6-Zone Overhead Ambient Pools (physically attenuated warm fill preserving real contrast)
  [
    [-6.0, -4.5], [0.0, -4.5], [6.0, -4.5],
    [-6.0, 2.5], [0.0, 2.5], [6.0, 2.5],
  ].forEach(([lx, lz]) => {
    const studioFillLight = new THREE.PointLight(0xffe9d2, 1.15, 10, 2.0);
    studioFillLight.position.set(lx, ROOM2_CONFIG.room.height - 0.25, lz);
    scene.add(studioFillLight);
  });

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

  const guidanceArrow = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 24), guidanceMaterial);
  guidanceArrow.rotation.z = Math.PI; // Cone tip points straight down toward target
  guidanceArrow.position.y = 0.14; // Tip sits at local y = 0.02 right above surface ring
  guidanceArrow.renderOrder = 9999;

  const guidanceShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 16), guidanceMaterial);
  guidanceShaft.position.y = 0.34;
  guidanceShaft.renderOrder = 9999;

  const guidanceRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 14, 40), guidanceRingMaterial);
  guidanceRing.rotation.x = Math.PI / 2;
  guidanceRing.position.y = 0.004;
  guidanceRing.renderOrder = 9999;

  const guidanceInnerRing = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 14, 32), guidanceRingMaterial);
  guidanceInnerRing.rotation.x = Math.PI / 2;
  guidanceInnerRing.position.y = 0.004;
  guidanceInnerRing.renderOrder = 9999;

  const guidanceLineGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.02, 0),
    new THREE.Vector3(0, 0, 0),
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
  const wallPlasterTexture = createWallPlasterTexture();
  const wallMaroonMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, // Tinted through woven plaster texture
    map: wallPlasterTexture,
    roughness: 0.78,
    metalness: 0.06,
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
    wall.receiveShadow = true;
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
  southWall.receiveShadow = true;
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

  // Soft nocturnal moonlight streaming in through the observatory windows
  const celestialMoonlight = new THREE.DirectionalLight(0xbcd8ff, 0.55);
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
    baseWall.receiveShadow = true;
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
    headerWall.receiveShadow = true;
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
      pier.receiveShadow = true;
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

  const starCount = 4500;
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

  // Moon target direction in deep space at (16.0, 84.0, -28.0) (~90m away) -> tight disc exclusion cone
  const moonDir = new THREE.Vector3(16.0, 84.0, -28.0).normalize();

  for (let i = 0; i < starCount; i++) {
    // Distribute 65% of stars across the overhead zenith dome strictly behind the Moon (r = 140..210m),
    // and 35% near the horizon vistas visible through the wall windows
    const theta = Math.random() * Math.PI * 2;
    const isOverhead = i < starCount * 0.65;
    const elevation = isOverhead
      ? Math.PI * 0.14 + Math.pow(Math.random(), 0.72) * (Math.PI * 0.355)
      : Math.random() * (Math.PI * 0.22) + 0.02;
    const r = 140 + Math.random() * 70;

    let sx = r * Math.cos(elevation) * Math.cos(theta);
    let sy = Math.max(2.5, r * Math.sin(elevation));
    let sz = r * Math.cos(elevation) * Math.sin(theta);

    // Tight exclusion cone right behind the overhead Supermoon disc & inner corona
    const dist = Math.sqrt(sx * sx + sy * sy + sz * sz);
    const dotMoon = (sx * moonDir.x + sy * moonDir.y + sz * moonDir.z) / dist;
    if (dotMoon > 0.962) {
      sx = -sx;
      sz = -sz;
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
    size: 1.15,
    map: starGlowTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    fog: false,
  });
  const starPoints = new THREE.Points(starGeo, starMaterial);
  scene.add(starPoints);

  // Soft Milky Way & Nebula Glow Band arcing in deep space behind the Moon (r = 145..175m)
  const nebulaCanvas = document.createElement('canvas');
  nebulaCanvas.width = 256;
  nebulaCanvas.height = 256;
  const nebCtx = nebulaCanvas.getContext('2d');
  if (nebCtx) {
    const grad = nebCtx.createRadialGradient(128, 128, 4, 128, 128, 126);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.72)');
    grad.addColorStop(0.32, 'rgba(186, 230, 253, 0.34)');
    grad.addColorStop(0.65, 'rgba(129, 140, 248, 0.11)');
    grad.addColorStop(1.0, 'rgba(15, 23, 42, 0.0)');
    nebCtx.fillStyle = grad;
    nebCtx.fillRect(0, 0, 256, 256);
  }
  const nebulaTex = new THREE.CanvasTexture(nebulaCanvas);

  const nebulaClouds: Array<{ x: number; y: number; z: number; sx: number; sy: number; color: number; opacity: number }> = [
    { x: -72.0, y: 122.0, z: 32.0, sx: 130, sy: 74, color: 0x38bdf8, opacity: 0.22 },
    { x: -40.0, y: 136.0, z: 12.0, sx: 125, sy: 82, color: 0x818cf8, opacity: 0.20 },
    { x: -10.0, y: 145.0, z: 22.0, sx: 135, sy: 78, color: 0xa78bfa, opacity: 0.19 },
    { x: 30.0, y: 140.0, z: 42.0, sx: 125, sy: 75, color: 0x60a5fa, opacity: 0.21 },
    { x: -52.0, y: 128.0, z: -36.0, sx: 115, sy: 70, color: 0x0ea5e9, opacity: 0.18 },
    { x: 60.0, y: 126.0, z: 18.0, sx: 118, sy: 70, color: 0xc084fc, opacity: 0.17 },
  ];
  nebulaClouds.forEach((c) => {
    const nebMat = new THREE.SpriteMaterial({
      map: nebulaTex,
      color: c.color,
      transparent: true,
      opacity: c.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const nebSprite = new THREE.Sprite(nebMat);
    nebSprite.position.set(c.x, c.y, c.z);
    nebSprite.scale.set(c.sx, c.sy, 1);
    scene.add(nebSprite);
  });

  // --- Landmark Twinkling Stars with Crisp Pinpoint 4-Point Diffraction Spikes ---
  const createDiffractionSpikeTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.07, 'rgba(255, 255, 255, 0.88)');
    grad.addColorStop(0.19, 'rgba(186, 230, 253, 0.22)');
    grad.addColorStop(0.45, 'rgba(56, 189, 248, 0.04)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const hGrad = ctx.createLinearGradient(6, 64, 122, 64);
    hGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    hGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.92)');
    hGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(6, 63, 116, 2);

    const vGrad = ctx.createLinearGradient(64, 6, 64, 122);
    vGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    vGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.92)');
    vGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(63, 6, 2, 116);

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
    // Outside West Windows & North Clerestory (Crisp distant optical beacons)
    { name: 'Betelgeuse', x: -125.0, y: 20.0, z: 20.0, color: 0xfba571, scale: 3.4, speed: 2.4, phase: 1.2 },
    { name: 'Aldebaran', x: -115.0, y: 15.5, z: 31.0, color: 0xfde047, scale: 3.0, speed: 2.8, phase: 5.3 },
    { name: 'Capella', x: -130.0, y: 28.5, z: -26.0, color: 0xfef08a, scale: 3.0, speed: 2.2, phase: 2.7 },
    { name: 'Procyon', x: -120.0, y: 18.0, z: 23.0, color: 0xa5f3fc, scale: 3.0, speed: 3.0, phase: 4.1 },
    { name: 'Sirius', x: -120.0, y: 17.5, z: -11.0, color: 0x93c5fd, scale: 3.8, speed: 3.2, phase: 0.1 },
    { name: 'Rigel', x: -125.0, y: 20.5, z: -2.5, color: 0x67e8f9, scale: 3.4, speed: 3.7, phase: 2.4 },
    { name: 'Vega', x: -130.0, y: 25.0, z: 0.0, color: 0xa5f3fc, scale: 3.5, speed: 3.0, phase: 4.8 },
    { name: 'Arcturus', x: -115.0, y: 16.2, z: 12.5, color: 0xfb923c, scale: 3.1, speed: 2.6, phase: 1.8 },
    { name: 'Spica', x: -135.0, y: 28.5, z: -7.0, color: 0x93c5fd, scale: 3.0, speed: 3.3, phase: 3.1 },
    { name: 'Altair', x: -120.0, y: 19.0, z: 6.2, color: 0xffffff, scale: 3.1, speed: 2.9, phase: 0.8 },
    // North Clerestory Vista
    { name: 'Polaris', x: 0.0, y: 38.0, z: -132.0, color: 0xffffff, scale: 3.8, speed: 2.1, phase: 3.5 },
    // 12 Overhead Zenith Optical Pinpoint Stars behind the Moon in deep space (r = 128..150m)
    { name: 'Deneb', x: -46.0, y: 132.0, z: -20.0, color: 0xffffff, scale: 3.6, speed: 2.6, phase: 0.5 },
    { name: 'Denebola', x: 52.0, y: 128.0, z: 18.0, color: 0xa5f3fc, scale: 3.0, speed: 3.1, phase: 2.1 },
    { name: 'Alnilam', x: -24.0, y: 142.0, z: 10.0, color: 0x93c5fd, scale: 3.2, speed: 3.4, phase: 1.4 },
    { name: 'Mintaka', x: -15.0, y: 144.0, z: 18.0, color: 0x67e8f9, scale: 3.0, speed: 2.9, phase: 3.9 },
    { name: 'Alnitak', x: -34.0, y: 140.0, z: 2.0, color: 0xa5f3fc, scale: 3.0, speed: 3.2, phase: 5.1 },
    { name: 'Castor', x: -12.0, y: 136.0, z: -46.0, color: 0xfef08a, scale: 2.9, speed: 2.5, phase: 4.4 },
    { name: 'Pollux', x: 4.0, y: 134.0, z: -56.0, color: 0xfba571, scale: 3.1, speed: 2.3, phase: 1.9 },
    { name: 'Bellatrix', x: -62.0, y: 122.0, z: 26.0, color: 0x93c5fd, scale: 3.1, speed: 3.5, phase: 2.8 },
    { name: 'Regulus', x: 44.0, y: 136.0, z: 6.0, color: 0xe0f2fe, scale: 3.3, speed: 2.7, phase: 0.9 },
    { name: 'Antares', x: -28.0, y: 126.0, z: 48.0, color: 0xfb923c, scale: 3.4, speed: 2.4, phase: 3.3 },
    { name: 'Alphecca', x: 10.0, y: 145.0, z: 30.0, color: 0xe9d5ff, scale: 2.9, speed: 3.0, phase: 5.8 },
    { name: 'Fomalhaut', x: 64.0, y: 122.0, z: 42.0, color: 0xffffff, scale: 3.3, speed: 2.8, phase: 1.6 },
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
  moonGroup.position.set(16.0, 84.0, -28.0);
  moonGroup.rotation.set(0.18, -Math.PI / 4, 0.08);
  scene.add(moonGroup);

  let moonMesh: THREE.Object3D = new THREE.Mesh(
    new THREE.SphereGeometry(20.5, 64, 64),
    moonMaterial
  );
  moonMesh.renderOrder = 0;
  moonGroup.add(moonMesh);

  const objLoader = new OBJLoader();
  objLoader.load(
    '/assets/moon/moon.obj',
    (obj) => {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.material = moonMaterial;
          m.renderOrder = 0;
          m.castShadow = false;
          m.receiveShadow = false;
        }
      });
      obj.scale.set(11.8, 11.8, 11.8);
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

  // Infinite Tsukuyomi (Rinne Sharingan Moon) spherical-projection texture & oriented 3D lunar sphere
  const createInfiniteTsukuyomiTexture = () => {
    const W = 1024;
    const H = 512;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    const data = img.data;

    const ringRadii = [0.34, 0.59, 0.84];
    const ringHalfW = 0.015;
    const pupilRadius = 0.132;
    const headRadius = 0.056;
    const tailLen = 0.42;

    // Deterministic lunar craters across front hemisphere for realistic surface relief under crimson glaze
    const craters = [
      { x: -0.35, y: 0.22, r: 0.18, d: 0.18 },
      { x: 0.28, y: -0.26, r: 0.22, d: 0.16 },
      { x: -0.18, y: -0.45, r: 0.15, d: 0.15 },
      { x: 0.42, y: 0.18, r: 0.14, d: 0.14 },
      { x: -0.52, y: -0.12, r: 0.20, d: 0.16 },
      { x: 0.10, y: 0.48, r: 0.16, d: 0.13 },
      { x: -0.08, y: -0.15, r: 0.10, d: 0.10 },
      { x: 0.22, y: 0.32, r: 0.09, d: 0.10 },
      { x: -0.28, y: 0.04, r: 0.08, d: 0.09 },
      { x: 0.50, y: -0.35, r: 0.19, d: 0.15 },
      { x: -0.42, y: 0.44, r: 0.17, d: 0.14 },
      { x: 0.02, y: -0.58, r: 0.21, d: 0.15 },
    ];

    const ringTargets: Array<{ r: number; ang: number; dir: number }> = [];
    ringRadii.forEach((rr, idx) => {
      const offset = idx * (Math.PI / 3);
      for (let t = 0; t < 3; t++) {
        ringTargets.push({ r: rr, ang: offset + t * ((Math.PI * 2) / 3), dir: 1 });
      }
    });

    const smoothstep = (e0: number, e1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };

    for (let py = 0; py < H; py++) {
      const theta = ((py + 0.5) / H) * Math.PI;
      const sinT = Math.sin(theta);
      const ny = Math.cos(theta);
      for (let px = 0; px < W; px++) {
        const idx4 = (py * W + px) * 4;
        const phi = ((px + 0.5) / W) * Math.PI * 2;
        const nx = -Math.cos(phi) * sinT;
        const nz = Math.sin(phi) * sinT;

        if (nx <= -0.08) {
          data[idx4] = 48;
          data[idx4 + 1] = 6;
          data[idx4 + 2] = 12;
          data[idx4 + 3] = 0;
          continue;
        }

        const ang = Math.acos(Math.max(-1, Math.min(1, nx)));
        const rNorm = ang / (Math.PI * 0.44);
        const rx = -nz;
        const ry = ny;
        const az = Math.atan2(ry, rx);

        // Multi-scale lunar maria & crater relief mapped cleanly onto sphere coordinates
        const tx = Math.sin(ang) * Math.cos(az);
        const ty = Math.sin(ang) * Math.sin(az);
        const maria =
          0.86 +
          0.14 * Math.sin(tx * 5.2 + ty * 3.1) * Math.cos(ty * 4.7 - tx * 2.3) +
          0.07 * Math.sin(tx * 13.0 - ty * 11.0);

        let craterMod = 1.0;
        for (let c = 0; c < craters.length; c++) {
          const cr = craters[c];
          const dx = tx - cr.x;
          const dy = ty - cr.y;
          const dist = Math.hypot(dx, dy);
          if (dist < cr.r) {
            const q = dist / cr.r;
            // Bright raised rim near q=0.88, darker floor interior
            craterMod -= cr.d * (1 - q * q) * 0.85;
            if (q > 0.72) craterMod += cr.d * 0.45 * Math.sin(((q - 0.72) / 0.28) * Math.PI);
          }
        }

        // Vivid scarlet center fading to deeper crimson near lunar limb
        const limbShade = Math.max(0.45, Math.pow(Math.max(0.05, nx), 0.35));
        const radialGlow = 1.08 - 0.28 * Math.min(1, rNorm);
        let rCol = 238 * radialGlow * limbShade * maria * craterMod;
        let gCol = 24 * radialGlow * limbShade * maria * craterMod;
        let bCol = 36 * radialGlow * limbShade * maria * craterMod;

        // Compute Rinne Sharingan black ink mask (pupil, 3 rings, 9 curved tomoe)
        let ink = 1.0 - smoothstep(pupilRadius - 0.008, pupilRadius + 0.008, rNorm);

        for (let ri = 0; ri < ringRadii.length; ri++) {
          const dr = Math.abs(rNorm - ringRadii[ri]);
          const ringInk = 1.0 - smoothstep(ringHalfW - 0.006, ringHalfW + 0.006, dr);
          ink = Math.max(ink, ringInk);
        }

        if (rNorm > 0.20 && rNorm < 0.98) {
          for (let ti = 0; ti < ringTargets.length; ti++) {
            const tm = ringTargets[ti];
            const hx = tm.r * Math.cos(tm.ang);
            const hy = tm.r * Math.sin(tm.ang);
            const pxAng = rNorm * Math.cos(az);
            const pyAng = rNorm * Math.sin(az);
            const dHead = Math.hypot(pxAng - hx, pyAng - hy);
            ink = Math.max(ink, 1.0 - smoothstep(headRadius - 0.007, headRadius + 0.007, dHead));

            // Curved comma tail trailing along the concentric circle
            let dt = tm.ang - az;
            while (dt < -Math.PI) dt += Math.PI * 2;
            while (dt > Math.PI) dt -= Math.PI * 2;
            if (dt > 0 && dt < tailLen) {
              const p = dt / tailLen;
              const rCurve = tm.r + 0.022 * Math.sin(p * Math.PI * 0.72);
              const halfThick = headRadius * Math.pow(1 - p, 1.45);
              const dTail = Math.abs(rNorm - rCurve);
              ink = Math.max(ink, 1.0 - smoothstep(halfThick - 0.006, halfThick + 0.006, dTail));
            }
          }
        }

        const clampedInk = Math.min(1, ink);
        const inkKeep = 1.0 - clampedInk * 0.94;
        // Translucent crimson spell-glaze lets the underlying NASA crater texture shine through,
        // while keeping the Rinne Sharingan pupil, rings, and tomoe crisp.
        const baseRedAlpha = 0.28 + 0.14 * Math.pow(Math.max(0, nx), 0.5);
        const combinedAlpha = Math.min(0.88, baseRedAlpha + clampedInk * (0.86 - baseRedAlpha));
        data[idx4] = Math.max(8, Math.min(255, Math.round(rCol * inkKeep)));
        data[idx4 + 1] = Math.max(4, Math.min(255, Math.round(gCol * inkKeep)));
        data[idx4 + 2] = Math.max(8, Math.min(255, Math.round(bCol * inkKeep)));
        data[idx4 + 3] = Math.round(combinedAlpha * 255);
      }
    }

    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };

  const tsukuyomiTex = createInfiniteTsukuyomiTexture();
  const tsukuyomiMaterial = new THREE.MeshStandardMaterial({
    map: tsukuyomiTex,
    bumpMap: moonBumpMap,
    bumpScale: 0.06,
    roughness: 0.82,
    metalness: 0.05,
    emissive: new THREE.Color(0xff1e2d),
    emissiveMap: tsukuyomiTex,
    emissiveIntensity: 0.42,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  // Oriented directly at the observatory interior so the Rinne Sharingan iris stares straight down cleanly
  const tsukuyomiMoonGroup = new THREE.Group();
  tsukuyomiMoonGroup.position.copy(moonGroup.position);
  tsukuyomiMoonGroup.lookAt(0, 1.7, 0);
  tsukuyomiMoonGroup.visible = false;
  scene.add(tsukuyomiMoonGroup);

  const tsukuyomiSpinGroup = new THREE.Group();
  tsukuyomiMoonGroup.add(tsukuyomiSpinGroup);

  const tsukuyomiSphere = new THREE.Mesh(
    new THREE.SphereGeometry(20.85, 64, 64),
    tsukuyomiMaterial
  );
  // Rotate sphere +X center (u=0.5, v=0.5) onto lookAt +Z axis
  tsukuyomiSphere.rotation.y = -Math.PI / 2;
  tsukuyomiSphere.renderOrder = 1;
  tsukuyomiSpinGroup.add(tsukuyomiSphere);

  const createTsukuyomiCoronaTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 64, 72, 0.58)');
    grad.addColorStop(0.35, 'rgba(220, 38, 38, 0.30)');
    grad.addColorStop(0.70, 'rgba(153, 27, 27, 0.10)');
    grad.addColorStop(1, 'rgba(127, 29, 29, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  };

  const normalMoonCoronaTex = createMoonCoronaTexture();
  const tsukuyomiCoronaTex = createTsukuyomiCoronaTexture();

  const moonCoronaMat = new THREE.SpriteMaterial({
    map: normalMoonCoronaTex,
    color: 0xffffff,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const moonCorona = new THREE.Sprite(moonCoronaMat);
  moonCorona.position.set(16.4, 85.0, -28.6);
  moonCorona.scale.set(88.0, 88.0, 1.0);
  scene.add(moonCorona);

  // Dedicated Moonlight streaming down through the glass dome into the lab
  const moonPointLight = new THREE.PointLight(0xbcd8ff, 1.15, 48, 1.4);
  moonPointLight.position.set(5.0, 12.0, -4.5);
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

  // 4. Curved 3D Paraboloid Conservatory Dome Ceiling (y(x,z) rising +2.6m from 4.2m walls to 6.8m apex)
  const ceilingGroup = new THREE.Group();
  scene.add(ceilingGroup);

  const domeBaseH = ROOM2_CONFIG.room.height; // 4.2m wall cornice elevation
  const domePeakRise = 2.6; // +2.6m medium-high atrium -> 6.8m apex at (0, 0)
  const domeHalfX = roomHalfWidth; // 10.8m
  const domeHalfZ = ROOM2_CONFIG.room.depth / 2; // 7.4m

  const paraboloidY = (px: number, pz: number) => {
    const ux = Math.min(1, Math.abs(px) / domeHalfX);
    const uz = Math.min(1, Math.abs(pz) / domeHalfZ);
    return domeBaseH + domePeakRise * (1 - ux * ux) * (1 - uz * uz);
  };

  const paraboloidNormal = (px: number, pz: number) => {
    const ux = Math.max(-1, Math.min(1, px / domeHalfX));
    const uz = Math.max(-1, Math.min(1, pz / domeHalfZ));
    const dydx = -2 * domePeakRise * (px / (domeHalfX * domeHalfX)) * (1 - uz * uz);
    const dydz = -2 * domePeakRise * (1 - ux * ux) * (pz / (domeHalfZ * domeHalfZ));
    return new THREE.Vector3(-dydx, 1, -dydz).normalize();
  };

  // Continuous curved 3D paraboloid glass dome skin (36 x 28 smooth quads, depthWrite: false)
  const glassSegX = 36;
  const glassSegZ = 28;
  const glassVerts: number[] = [];
  const glassIndices: number[] = [];
  const spanX = domeHalfX - 0.16;
  const spanZ = domeHalfZ - 0.16;
  for (let iz = 0; iz <= glassSegZ; iz++) {
    const tz = -spanZ + (2 * spanZ * iz) / glassSegZ;
    for (let ix = 0; ix <= glassSegX; ix++) {
      const tx = -spanX + (2 * spanX * ix) / glassSegX;
      glassVerts.push(tx, paraboloidY(tx, tz) + 0.015, tz);
    }
  }
  for (let iz = 0; iz < glassSegZ; iz++) {
    for (let ix = 0; ix < glassSegX; ix++) {
      const row0 = iz * (glassSegX + 1) + ix;
      const row1 = (iz + 1) * (glassSegX + 1) + ix;
      glassIndices.push(row0, row1, row0 + 1);
      glassIndices.push(row0 + 1, row1, row1 + 1);
    }
  }
  const paraboloidGlassGeo = new THREE.BufferGeometry();
  paraboloidGlassGeo.setAttribute('position', new THREE.Float32BufferAttribute(glassVerts, 3));
  paraboloidGlassGeo.setIndex(glassIndices);
  paraboloidGlassGeo.computeVertexNormals();

  const skylightGlassMat = new THREE.MeshStandardMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.055,
    roughness: 0.07,
    metalness: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const skylightGlass = new THREE.Mesh(paraboloidGlassGeo, skylightGlassMat);
  skylightGlass.renderOrder = 2;
  ceilingGroup.add(skylightGlass);

  // Toggle Infinite Tsukuyomi lunar state & atmospheric moonlight when Madara Uchiha is active
  applyInfiniteTsukuyomiState = (active: boolean) => {
    moonGroup.visible = true;
    tsukuyomiMoonGroup.visible = active;
    if (active) {
      moonMaterial.emissive.setHex(0xffc2c7);
      moonMaterial.emissiveIntensity = 0.56;
      moonCoronaMat.map = tsukuyomiCoronaTex;
      moonCoronaMat.needsUpdate = true;
      moonCorona.scale.set(98.0, 98.0, 1.0);
      celestialMoonlight.color.setHex(0xff4d5a);
      celestialMoonlight.intensity = 0.85;
      moonPointLight.color.setHex(0xf87171);
      moonPointLight.intensity = 1.45;
      skylightGlassMat.color.setHex(0xfecaca);
      skylightGlassMat.opacity = 0.075;
    } else {
      moonMaterial.emissive.setHex(0xf1f5f9);
      moonMaterial.emissiveIntensity = 0.45;
      moonCoronaMat.map = normalMoonCoronaTex;
      moonCoronaMat.needsUpdate = true;
      moonCorona.scale.set(88.0, 88.0, 1.0);
      celestialMoonlight.color.setHex(0xbcd8ff);
      celestialMoonlight.intensity = 0.55;
      moonPointLight.color.setHex(0xdbeafe);
      moonPointLight.intensity = 1.15;
      skylightGlassMat.color.setHex(0xdbeafe);
      skylightGlassMat.opacity = 0.055;
    }
  };
  applyInfiniteTsukuyomiState(character.activeCharacter === 'madara');

  // Perimeter mahogany skylight cornice & antique brass trim ring sealing seamlessly along all 4 walls
  const corniceDepth = 0.42;
  const corniceConfigs: Array<{ w: number; d: number; x: number; z: number }> = [
    { w: ROOM2_CONFIG.room.width, d: corniceDepth, x: 0, z: ROOM2_CONFIG.room.backZ + corniceDepth / 2 },
    { w: ROOM2_CONFIG.room.width, d: corniceDepth, x: 0, z: frontZ - corniceDepth / 2 },
    { w: corniceDepth, d: domeHalfZ * 2 - corniceDepth * 2, x: -domeHalfX + corniceDepth / 2, z: 0 },
    { w: corniceDepth, d: domeHalfZ * 2 - corniceDepth * 2, x: domeHalfX - corniceDepth / 2, z: 0 },
  ];
  corniceConfigs.forEach((c) => {
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(c.w, 0.28, c.d),
      mahoganyDeskMaterial
    );
    cornice.position.set(c.x, domeBaseH - 0.14, c.z);
    ceilingGroup.add(cornice);

    const corniceTrim = new THREE.Mesh(
      new THREE.BoxGeometry(c.w + 0.04, 0.04, c.d + 0.04),
      brassTrimMaterial
    );
    corniceTrim.position.set(c.x, domeBaseH - 0.28, c.z);
    ceilingGroup.add(corniceTrim);
  });

  // Seamless continuous rectangular-section curved rib builder along paraboloid paths
  const createParabolicRibMesh = (
    curvePoints: THREE.Vector3[],
    width: number,
    height: number,
    normalOffset: number,
    mat: THREE.Material
  ) => {
    const verts: number[] = [];
    const idx: number[] = [];
    const nPts = curvePoints.length;
    const hw = width / 2;
    const hh = height / 2;

    for (let i = 0; i < nPts; i++) {
      const p = curvePoints[i];
      const pPrev = curvePoints[Math.max(0, i - 1)];
      const pNext = curvePoints[Math.min(nPts - 1, i + 1)];
      const tangent = new THREE.Vector3().subVectors(pNext, pPrev).normalize();
      const surfUp = paraboloidNormal(p.x, p.z);
      const side = new THREE.Vector3().crossVectors(tangent, surfUp).normalize();
      const norm = new THREE.Vector3().crossVectors(side, tangent).normalize();
      const center = p.clone().addScaledVector(norm, normalOffset);

      const corners = [
        center.clone().addScaledVector(side, -hw).addScaledVector(norm, -hh), // BL
        center.clone().addScaledVector(side, hw).addScaledVector(norm, -hh),  // BR
        center.clone().addScaledVector(side, hw).addScaledVector(norm, hh),   // TR
        center.clone().addScaledVector(side, -hw).addScaledVector(norm, hh),  // TL
      ];
      corners.forEach((c) => verts.push(c.x, c.y, c.z));

      if (i < nPts - 1) {
        const a = i * 4;
        const b = (i + 1) * 4;
        for (let k = 0; k < 4; k++) {
          const kn = (k + 1) % 4;
          idx.push(a + k, b + k, a + kn);
          idx.push(a + kn, b + k, b + kn);
        }
      }
    }
    // End caps
    idx.push(0, 1, 2, 0, 2, 3);
    const e = (nPts - 1) * 4;
    idx.push(e, e + 2, e + 1, e, e + 3, e + 2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  };

  const sampleParabolicRibZ = (rx: number, segs = 28) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const rz = -domeHalfZ + (2 * domeHalfZ * i) / segs;
      pts.push(new THREE.Vector3(rx, paraboloidY(rx, rz), rz));
    }
    return pts;
  };

  const sampleParabolicRibX = (rz: number, segs = 36) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const rx = -domeHalfX + (2 * domeHalfX * i) / segs;
      pts.push(new THREE.Vector3(rx, paraboloidY(rx, rz), rz));
    }
    return pts;
  };

  // Primary Curved Mahogany Parabolic Arch Ribs + Non-Intersecting Brass Soffit Strips
  [-7.2, -3.6, 0.0, 3.6, 7.2].forEach((bx) => {
    const pts = sampleParabolicRibZ(bx);
    ceilingGroup.add(createParabolicRibMesh(pts, 0.22, 0.19, -0.105, mahoganyDeskMaterial));
    ceilingGroup.add(createParabolicRibMesh(pts, 0.26, 0.032, -0.210, brassTrimMaterial));
  });

  [-4.9, -2.45, 0.0, 2.45, 4.9].forEach((bz) => {
    const pts = sampleParabolicRibX(bz);
    ceilingGroup.add(createParabolicRibMesh(pts, 0.22, 0.19, -0.112, mahoganyDeskMaterial));
    ceilingGroup.add(createParabolicRibMesh(pts, 0.26, 0.032, -0.222, brassTrimMaterial));
  });

  // Slender Intermediate Curved Antique Brass Glazing Mullions (strictly layered below glass)
  [-9.0, -5.4, -1.8, 1.8, 5.4, 9.0].forEach((gx) => {
    const pts = sampleParabolicRibZ(gx);
    ceilingGroup.add(createParabolicRibMesh(pts, 0.040, 0.036, -0.018, brassTrimMaterial));
  });
  [-6.15, -3.68, -1.22, 1.22, 3.68, 6.15].forEach((gz) => {
    const pts = sampleParabolicRibX(gz);
    ceilingGroup.add(createParabolicRibMesh(pts, 0.040, 0.036, -0.024, brassTrimMaterial));
  });

  // Compact Brass Perimeter Cornice Spot Sconces (leaves the entire curved skylight view unobstructed)
  const perimeterSpotConfigs: Array<{ x: number; z: number; aimX: number; aimZ: number }> = [
    { x: -7.2, z: ROOM2_CONFIG.room.backZ + 0.36, aimX: -6.0, aimZ: -1.5 },
    { x: 0.0, z: ROOM2_CONFIG.room.backZ + 0.36, aimX: 0.0, aimZ: -1.5 },
    { x: 7.2, z: ROOM2_CONFIG.room.backZ + 0.36, aimX: 6.0, aimZ: -1.5 },
    { x: -7.2, z: frontZ - 0.36, aimX: -6.0, aimZ: 1.5 },
    { x: 0.0, z: frontZ - 0.36, aimX: 0.0, aimZ: 1.5 },
    { x: 7.2, z: frontZ - 0.36, aimX: 6.0, aimZ: 1.5 },
    { x: -domeHalfX + 0.36, z: -2.25, aimX: -4.5, aimZ: -1.2 },
    { x: -domeHalfX + 0.36, z: 2.25, aimX: -4.5, aimZ: 1.2 },
    { x: domeHalfX - 0.36, z: -2.25, aimX: 4.5, aimZ: -1.2 },
    { x: domeHalfX - 0.36, z: 2.25, aimX: 4.5, aimZ: 1.2 },
  ];

  const corniceBulbMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xffedd5,
    emissiveIntensity: 1.45,
    roughness: 0.25,
  });

  perimeterSpotConfigs.forEach((cfg) => {
    const sconceSpot = new THREE.Group();
    sconceSpot.position.set(cfg.x, domeBaseH - 0.26, cfg.z);
    sconceSpot.lookAt(cfg.aimX, 1.2, cfg.aimZ);

    const basePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.065, 0.03, 16),
      brassTrimMaterial
    );
    basePlate.rotation.x = Math.PI / 2;
    sconceSpot.add(basePlate);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.052, 0.13, 16),
      brassTrimMaterial
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.06;
    sconceSpot.add(barrel);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 0.015, 16),
      corniceBulbMat
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.125;
    sconceSpot.add(lens);

    ceilingGroup.add(sconceSpot);

    const perimeterLight = new THREE.PointLight(0xffdfba, 0.65, 9.5, 2.0);
    const inDir = new THREE.Vector3(cfg.aimX - cfg.x, -1.6, cfg.aimZ - cfg.z).normalize();
    perimeterLight.position.set(cfg.x, domeBaseH - 0.32, cfg.z).addScaledVector(inDir, 0.45);
    scene.add(perimeterLight);
    downlights.push(perimeterLight);
  });

  // -------------------------------------------------------------
  // 7. Interactive Equipment & Raycast Registry
  // -------------------------------------------------------------
  const interactableObjects: THREE.Object3D[] = [];
  const objectToInteractionMap = new Map<THREE.Object3D, EquipmentInteraction>();
  const interactionToObjectMap = new Map<string, THREE.Object3D>();

  const isObjectVisibleInChain = (obj: THREE.Object3D | null): boolean => {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (!cur.visible) return false;
      cur = cur.parent;
    }
    return true;
  };

  const guardInteractableRaycast = (mesh: THREE.Object3D) => {
    if (mesh.userData.__visibilityRayGuard) return;
    mesh.userData.__visibilityRayGuard = true;
    const origRaycast = mesh.raycast.bind(mesh);
    mesh.raycast = (rc: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      if (!isObjectVisibleInChain(mesh)) return;
      origRaycast(rc, intersects);
    };
  };

  const registerInteractable = (
    objects: THREE.Object3D | THREE.Object3D[],
    interaction: EquipmentInteraction
  ) => {
    const targets = Array.isArray(objects) ? objects : [objects];
    targets.forEach((obj) => {
      obj.userData.interactionId = interaction.id;
      obj.userData.equipmentInteraction = interaction;
      interactionToObjectMap.set(interaction.id, obj);
      if (!interactableObjects.includes(obj)) interactableObjects.push(obj);
      objectToInteractionMap.set(obj, interaction);
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
        guardInteractableRaycast(obj);
      }
      obj.traverse((child) => {
        // Preserve static hidden meshes (e.g., masked GLB sub-carriers) out of raycast list
        if (child !== obj && !isObjectVisibleInChain(child)) return;
        child.userData.interactionId = interaction.id;
        child.userData.equipmentInteraction = interaction;
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
          guardInteractableRaycast(child);
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
    name: 'Physics 2 Master Lecture Whiteboard',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['physics-whiteboard'],
    action: 'Study Governing Equations & Derivations',
    readout: 'Physics 2 Theory: RLC Phasors · Snell\'s Law & Diffraction · Lorentz Spacetime',
  });

  // -------------------------------------------------------------
  // 9. North Wall 3D Mahogany Double Exit Doors & Transom Sign
  // -------------------------------------------------------------
  const doorWidth = ROOM2_CONFIG.door.width;
  const doorHeight = ROOM2_CONFIG.door.height;

  const doorGroup = new THREE.Group();
  doorGroup.name = 'Room03DoorGroup';
  doorGroup.position.set(ROOM2_CONFIG.door.x, 0, ROOM2_CONFIG.door.z);
  scene.add(doorGroup);

  // Pitch-black doorway interior cavity / corridor void behind the exit door
  const blackExitPortal = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth, doorHeight, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
  );
  blackExitPortal.position.set(0, doorHeight / 2, -0.60);
  doorGroup.add(blackExitPortal);

  // Black doorway threshold floor extension into the dark corridor void
  const blackExitFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(doorWidth, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })
  );
  blackExitFloor.rotation.x = -Math.PI / 2;
  blackExitFloor.position.set(0, 0.001, -0.60);
  doorGroup.add(blackExitFloor);

  // Pitch-black backdrop right behind the closed door leaves
  const blackExitBackdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(doorWidth, doorHeight),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })
  );
  blackExitBackdrop.position.set(0, doorHeight / 2, -0.02);
  doorGroup.add(blackExitBackdrop);

  // Polished Brass Threshold Plate & Floor Inlay (proud of room-side wall face z = -7.24)
  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(2.92, 0.016, 0.28),
    doorBrassMat
  );
  threshold.position.set(0, 0.008, 0.20);
  doorGroup.add(threshold);

  const brassInlay = new THREE.Mesh(
    new THREE.PlaneGeometry(2.86, 0.035),
    doorDarkBrassMat
  );
  brassInlay.rotation.x = -Math.PI / 2;
  brassInlay.position.set(0, 0.003, 0.38);
  doorGroup.add(brassInlay);

  // Overhead Engraved Mahogany Laboratory Transom Sign
  const signMat = new THREE.MeshStandardMaterial({
    map: doorSignTexture,
    roughness: 0.38,
    metalness: 0.06,
    emissive: 0x221204,
    emissiveIntensity: 0.02,
  });

  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.46, 0.06), signMat);
  signBoard.position.set(0, 3.64, 0.21);
  doorGroup.add(signBoard);

  const signOuterFrame = new THREE.Mesh(
    new THREE.BoxGeometry(2.04, 0.52, 0.10),
    doorMahoganyMat
  );
  signOuterFrame.position.set(0, 3.64, 0.17);
  doorGroup.add(signOuterFrame);

  const signInnerTrim = new THREE.Mesh(
    new THREE.BoxGeometry(1.98, 0.49, 0.08),
    doorDarkBrassMat
  );
  signInnerTrim.position.set(0, 3.64, 0.18);
  doorGroup.add(signInnerTrim);

  const luminaireGroup = new THREE.Group();
  luminaireGroup.position.set(0, 3.90, 0.22);
  const lampHood = new THREE.Mesh(
    new THREE.BoxGeometry(1.40, 0.04, 0.08),
    doorBrassMat
  );
  lampHood.position.set(0, -0.02, 0.14);
  luminaireGroup.add(lampHood);
  [-0.42, 0.42].forEach((armX) => {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.010, 0.010, 0.18),
      doorBrassMat
    );
    arm.rotation.x = Math.PI / 4;
    arm.position.set(armX, 0, 0.07);
    luminaireGroup.add(arm);
  });
  doorGroup.add(luminaireGroup);

  const transomSpot = new THREE.SpotLight(0xfff5e4, 1.6, 5.5, Math.PI / 3, 0.4, 1.8);
  transomSpot.position.set(ROOM2_CONFIG.door.x, 3.88, ROOM2_CONFIG.door.z + 0.52);
  transomSpot.target = signBoard;
  scene.add(transomSpot);

  // Digital Access Terminal at right jamb (proud of wall face)
  const terminalGroup = new THREE.Group();
  terminalGroup.position.set(1.65, 1.55, 0.18);
  const terminalBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.44, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 })
  );
  terminalGroup.add(terminalBack);
  const terminalLED = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x10b981 })
  );
  terminalLED.position.set(0, 0.14, 0.03);
  terminalGroup.add(terminalLED);
  doorGroup.add(terminalGroup);

  const sconceLight = new THREE.SpotLight(0xfff8eb, 2.4, 6.5, Math.PI / 4, 0.4, 1.7);
  sconceLight.position.set(ROOM2_CONFIG.door.x, 4.1, ROOM2_CONFIG.door.z + 0.72);
  sconceLight.target = doorGroup;
  scene.add(sconceLight);

  const doorInteractMeta = {
    id: 'campus-door',
    stationId: 'hallway' as const,
    category: 'CAMPUS DIRECTORY',
    name: 'Corridor Double Mahogany Exit Doors',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['campus-door'],
    action: 'Return to Main Laboratory Hallway',
    readout: 'Main Science Hallway · Room 03 Exit Doorway',
  };

  const interactiveDoorTargets: THREE.Object3D[] = [signBoard, threshold, terminalGroup];
  registerInteractable(interactiveDoorTargets, doorInteractMeta);

  // Load 3D double mahogany FBX entrance door matching Room 02 & Campus Hallway
  const doorFbxLoader = new FBXLoader(loadingManager);
  doorFbxLoader.setResourcePath('/assets/door/maps/');
  doorFbxLoader.load(
    '/assets/door/export/Entrance_Door__vray.fbx',
    (doorFbx) => {
      if (isDisposed) return;
      applyEntranceDoorMaterials(doorFbx);
      doorFbx.scale.setScalar(0.016);
      doorFbx.position.set(0, 0, 0);

      // Re-pivot door leaves onto their outer jamb hinges
      const leftHingeX = -79.18;
      const rightHingeX = 79.19;
      const hingeY = -4.5;

      const leftTemplate = doorFbx.getObjectByName('Entrance_Door_002') as THREE.Mesh | null;
      const rightTemplate = doorFbx.getObjectByName('Entrance_Door_003') as THREE.Mesh | null;

      if (leftTemplate && rightTemplate) {
        leftTemplate.geometry.translate(-leftHingeX, -hingeY, 0);
        leftTemplate.position.set(leftHingeX, hingeY, 0);

        rightTemplate.geometry.translate(-rightHingeX, -hingeY, 0);
        rightTemplate.position.set(rightHingeX, hingeY, 0);
      }

      leftExitLeaf = leftTemplate;
      rightExitLeaf = rightTemplate;
      doorUsesFbxAxis = true;
      doorGroup.add(doorFbx);

      const fbxMeshes: THREE.Object3D[] = [];
      doorFbx.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          fbxMeshes.push(child);
        }
      });
      if (fbxMeshes.length > 0) {
        registerInteractable(fbxMeshes, doorInteractMeta);
      }
    },
    undefined,
    (err) => {
      console.error('Error loading Room 3 entrance door FBX asset:', err);
      // Hollow perimeter frame + properly outer-hinged procedural fallback leaves
      const jambLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorHeight, 0.28), doorDarkBrassMat);
      jambLeft.position.set(-doorWidth / 2 - 0.06, doorHeight / 2, 0.08);
      const jambRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorHeight, 0.28), doorDarkBrassMat);
      jambRight.position.set(doorWidth / 2 + 0.06, doorHeight / 2, 0.08);
      const jambTop = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.24, 0.12, 0.28), doorDarkBrassMat);
      jambTop.position.set(0, doorHeight + 0.06, 0.08);
      doorGroup.add(jambLeft, jambRight, jambTop);

      const leafWidth = doorWidth / 2 - 0.03;
      const leftHinge = new THREE.Group();
      leftHinge.position.set(-doorWidth / 2, 0, 0.08);
      const leftLeafMesh = new THREE.Mesh(new THREE.BoxGeometry(leafWidth, doorHeight, 0.09), doorMahoganyMat);
      leftLeafMesh.position.set(leafWidth / 2, doorHeight / 2, 0);
      leftLeafMesh.castShadow = true;
      leftHinge.add(leftLeafMesh);

      const rightHinge = new THREE.Group();
      rightHinge.position.set(doorWidth / 2, 0, 0.08);
      const rightLeafMesh = new THREE.Mesh(new THREE.BoxGeometry(leafWidth, doorHeight, 0.09), doorMahoganyMat);
      rightLeafMesh.position.set(-leafWidth / 2, doorHeight / 2, 0);
      rightLeafMesh.castShadow = true;
      rightHinge.add(rightLeafMesh);

      doorGroup.add(leftHinge, rightHinge);
      leftExitLeaf = leftHinge;
      rightExitLeaf = rightHinge;
      doorUsesFbxAxis = false;
      registerInteractable([leftLeafMesh, rightLeafMesh], doorInteractMeta);
    }
  );

  // -------------------------------------------------------------
  // 10. Heavy Scientific Workbenches (addBench matching Room 02)
  // -------------------------------------------------------------
  const esdMatTextures: THREE.CanvasTexture[] = [];

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

    // 1b. Procedural Slate-Navy ESD Anti-Static Bench Mat with Station Accent Border & Brass Bezel
    const topSurfaceY = ROOM2_CONFIG.table.topHeight + ROOM2_CONFIG.table.thickness / 2;
    const matW = ROOM2_CONFIG.table.width - 0.16;
    const matD = ROOM2_CONFIG.table.depth - 0.18;
    const accentHex = `#${color.toString(16).padStart(6, '0')}`;

    const esdCanvas = document.createElement('canvas');
    esdCanvas.width = 1024;
    esdCanvas.height = 512;
    const esdCtx = esdCanvas.getContext('2d');
    if (esdCtx) {
      esdCtx.fillStyle = '#0f172a';
      esdCtx.fillRect(0, 0, 1024, 512);

      // Fine slate-navy ESD grid
      esdCtx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      esdCtx.lineWidth = 1;
      for (let gx = 32; gx < 1024; gx += 32) {
        esdCtx.beginPath();
        esdCtx.moveTo(gx, 16);
        esdCtx.lineTo(gx, 496);
        esdCtx.stroke();
      }
      for (let gy = 32; gy < 512; gy += 32) {
        esdCtx.beginPath();
        esdCtx.moveTo(16, gy);
        esdCtx.lineTo(1008, gy);
        esdCtx.stroke();
      }

      // Station accent perimeter rule
      esdCtx.strokeStyle = accentHex;
      esdCtx.globalAlpha = 0.52;
      esdCtx.lineWidth = 3;
      esdCtx.strokeRect(14, 14, 996, 484);
      esdCtx.globalAlpha = 0.18;
      esdCtx.lineWidth = 1.5;
      esdCtx.strokeRect(24, 24, 976, 464);
      esdCtx.globalAlpha = 1.0;

      // Subtle corner ESD grounding micro-stencil
      esdCtx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      esdCtx.font = 'bold 12px monospace';
      esdCtx.fillText('ESD DISSIPATIVE SURFACE · 10^6 - 10^9 OHM · GROUNDED', 36, 478);
    }
    const esdMatTex = new THREE.CanvasTexture(esdCanvas);
    esdMatTex.anisotropy = 4;
    esdMatTextures.push(esdMatTex);

    const esdMatMesh = new THREE.Mesh(
      new THREE.BoxGeometry(matW, 0.0024, matD),
      new THREE.MeshStandardMaterial({
        map: esdMatTex,
        roughness: 0.78,
        metalness: 0.08,
      })
    );
    esdMatMesh.position.y = topSurfaceY + 0.0012;
    esdMatMesh.receiveShadow = true;
    group.add(esdMatMesh);

    // Slim antique brass bezel strips framing the ESD mat
    const bezelH = 0.0045;
    const bezelT = 0.012;
    const bezelConfigs: Array<{ w: number; d: number; px: number; pz: number }> = [
      { w: matW + bezelT * 2, d: bezelT, px: 0, pz: -matD / 2 - bezelT / 2 },
      { w: matW + bezelT * 2, d: bezelT, px: 0, pz: matD / 2 + bezelT / 2 },
      { w: bezelT, d: matD, px: -matW / 2 - bezelT / 2, pz: 0 },
      { w: bezelT, d: matD, px: matW / 2 + bezelT / 2, pz: 0 },
    ];
    bezelConfigs.forEach((b) => {
      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, bezelH, b.d),
        brassTrimMaterial
      );
      bezel.position.set(b.px, topSurfaceY + bezelH / 2, b.pz);
      group.add(bezel);
    });

    // Brass grounding snap studs at ESD mat corners
    const studGeo = new THREE.CylinderGeometry(0.012, 0.014, 0.006, 16);
    [
      [-matW / 2 + 0.045, -matD / 2 + 0.045],
      [matW / 2 - 0.045, -matD / 2 + 0.045],
      [-matW / 2 + 0.045, matD / 2 - 0.045],
      [matW / 2 - 0.045, matD / 2 - 0.045],
    ].forEach(([sx, sz]) => {
      const stud = new THREE.Mesh(studGeo, brassTrimMaterial);
      stud.position.set(sx, topSurfaceY + 0.004, sz);
      group.add(stud);
    });

    // Warm task lighting over benchtop apparatus for instrument & label legibility against rich room ambiance
    const benchTaskLight = new THREE.PointLight(0xfff2de, 1.65, 4.4, 1.8);
    benchTaskLight.position.set(0, ROOM2_CONFIG.table.topHeight + 1.45, 0.12);
    group.add(benchTaskLight);

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

    // 7. Articulated Brass & Tinted-Glass Bench Banker's Task Lamp
    const bankerLamp = createBenchBankerLamp(color, brassTrimMaterial);
    bankerLamp.group.position.set(-1.50, ROOM2_CONFIG.table.topHeight + ROOM2_CONFIG.table.thickness / 2, 0.72);
    group.add(bankerLamp.group);

    scene.add(group);
    return { group, lampMaterial: bankerLamp.bulbMaterial };
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

    const spot = new THREE.SpotLight(0xfff5e6, 1.65, 4.0, Math.PI / 4, 0.45, 1.6);
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

  // Exterior Conservatory Balcony Terrace, Recessed Cream Wall Bays & Perimeter Lab Casework
  const decorResult = buildRoom3ArchitectureDecor(
    scene,
    {
      roomWidth: ROOM2_CONFIG.room.width,
      roomDepth: ROOM2_CONFIG.room.depth,
      roomHeight: ROOM2_CONFIG.room.height,
      backZ: ROOM2_CONFIG.room.backZ,
      sideX: ROOM2_CONFIG.room.sideX,
      doorX: ROOM2_CONFIG.door.x,
      doorWidth: ROOM2_CONFIG.door.width,
      stationsX: STATION_X,
      benchDepth: ROOM2_CONFIG.table.depth,
    },
    {
      wallMaroon: wallMaroonMaterial,
      creamPanel: creamPanelMaterial,
      mahogany: mahoganyDeskMaterial,
      walnut: walnutMaterial,
      brass: brassTrimMaterial,
    },
    ROOM3_EQUIPMENT_DESCRIPTIONS,
    registerInteractable
  );

  const BENCH_MAT_TOP_Y = 0.9324;

  // Clipboard Documentation Registry
  const createClipboard = (stationId: Room3StationId, x: number, z: number, id: string, name: string) => {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.02, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 })
    );
    board.position.set(x, BENCH_MAT_TOP_Y + 0.01, z);

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

  const toStandardMaterial = (mat: THREE.Material): THREE.Material => {
    const phys = mat as THREE.MeshPhysicalMaterial;
    const isPhysicalOrTransmissive =
      phys.isMeshPhysicalMaterial || (typeof phys.transmission === 'number' && phys.transmission > 0);
    if (!isPhysicalOrTransmissive) return mat;

    const isGlass = typeof phys.transmission === 'number' && phys.transmission > 0;
    const replacement = new THREE.MeshStandardMaterial({
      name: phys.name,
      color: phys.color.clone(),
      map: phys.map,
      normalMap: phys.normalMap,
      roughnessMap: phys.roughnessMap,
      metalnessMap: phys.metalnessMap,
      aoMap: phys.aoMap,
      emissive: phys.emissive.clone(),
      emissiveMap: phys.emissiveMap,
      emissiveIntensity: phys.emissiveIntensity,
      roughness: isGlass ? Math.min(0.12, phys.roughness ?? 0.08) : phys.roughness,
      metalness: isGlass ? 0.08 : phys.metalness,
      transparent: isGlass ? true : phys.transparent,
      opacity: isGlass ? Math.min(0.45, Math.max(0.24, phys.opacity || 0.36)) : phys.opacity,
      depthWrite: isGlass ? false : phys.depthWrite,
      side: phys.side,
      alphaTest: phys.alphaTest,
      vertexColors: phys.vertexColors,
    });
    phys.dispose();
    return replacement;
  };

  const sanitizeGltfMaterials = (root: THREE.Object3D) => {
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(toStandardMaterial);
        } else if (mesh.material) {
          mesh.material = toStandardMaterial(mesh.material);
        }
      }
    });
  };

  const loadSanitizedGlb = (url: string, onReady: (model: THREE.Group) => void, label: string) => {
    gltfLoader.load(
      url,
      (gltf) => {
        if (isDisposed) return;
        sanitizeGltfMaterials(gltf.scene);
        onReady(gltf.scene);
      },
      undefined,
      (err) => {
        if (!isDisposed) console.warn(`${label} GLB load note:`, err);
      }
    );
  };

  // -------------------------------------------------------------
  // 12. Station 01 3D Apparatus: Circuits Bench (x = -6.0m)
  // -------------------------------------------------------------
  const circuitsBenchX = STATION_X.circuits;

  const pendingInstrumentAnchors: Partial<Parameters<Multimeter3D['setInstrumentAnchors']>[0]> = {};
  let multimeter3dRef: Multimeter3D | null = null;
  const syncStation1Anchors = (patch: Partial<Parameters<Multimeter3D['setInstrumentAnchors']>[0]>) => {
    Object.assign(pendingInstrumentAnchors, patch);
    multimeter3dRef?.setInstrumentAnchors(patch);
  };

  // Attach crisp tactile pointer bar onto a front-facing GLB rotary knob (+Z axis)
  const attachKnobTickPointer = (knobObj: THREE.Object3D, radius: number, zFront: number, color = 0x38bdf8) => {
    if (knobObj.getObjectByName('Knob_Tick_Pointer')) return;
    const pointer = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.0024, radius * 0.16), radius * 0.68, 0.0022),
      new THREE.MeshBasicMaterial({ color })
    );
    pointer.name = 'Knob_Tick_Pointer';
    pointer.position.set(0, radius * 0.36, zFront + 0.0008);
    knobObj.add(pointer);
  };

  // 1. DC Power Supply / AC Function Generator Unit (Positioned on the rear-left instrument row)
  const psuGroup = new THREE.Group();
  psuGroup.position.set(circuitsBenchX - 0.65, BENCH_MAT_TOP_Y, -0.48);
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

  const psuSwitchAnchor = new THREE.Object3D();
  psuSwitchAnchor.name = 'PSU_Power_Switch_Anchor';
  // Positioned flush on upper-right bezel corner of dc_power_supply.glb (away from left binding posts)
  psuSwitchAnchor.position.set(0.145, 0.145, 0.198);
  psuGroup.add(psuSwitchAnchor);

  const psuLedBezel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009, 0.010, 0.005, 16),
    brassTrimMaterial
  );
  psuLedBezel.rotation.x = Math.PI / 2;
  psuLedBezel.position.set(0, 0, 0);
  psuSwitchAnchor.add(psuLedBezel);

  const psuLedMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.1,
  });
  const psuStatusLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.0065, 16, 16),
    psuLedMat
  );
  psuStatusLed.position.set(0, 0, 0.003);
  psuSwitchAnchor.add(psuStatusLed);

  let psuVoltKnobMesh: THREE.Object3D | null = voltKnob;
  let psuSwitchMesh: THREE.Object3D | null = psuSwitchAnchor;

  const updatePsuKnobRotation = (vs: number) => {
    if (!psuVoltKnobMesh) return;
    const clampedVs = Math.max(0, Math.min(30, vs));
    // map 0V - 30V clockwise from -135 deg to +135 deg on +Z face
    const angle = -Math.PI * 0.75 + (clampedVs / 30) * Math.PI * 1.5;
    if (psuVoltKnobMesh === voltKnob) {
      voltKnob.rotation.y = angle;
    } else {
      psuVoltKnobMesh.rotation.z = -angle;
    }
  };

  const updatePsuTexture = (vs: number, freq: number, isAc: boolean, powerOn = currentCircuits.powerOn !== false) => {
    const ledHex = powerOn ? 0x10b981 : 0xf59e0b;
    psuLedMat.color.setHex(ledHex);
    psuLedMat.emissive.setHex(ledHex);
    psuLedMat.emissiveIntensity = powerOn ? 2.4 : 1.0;

    psuCtx.fillStyle = '#050811';
    psuCtx.fillRect(0, 0, 512, 256);

    // Instrument Frame Header
    psuCtx.font = 'bold 22px monospace';
    psuCtx.fillStyle = '#38bdf8';
    psuCtx.fillText(isAc ? 'AGILENT 33220A AC/DC SOURCE' : 'KEYSIGHT E3631A DC POWER SUPPLY', 20, 36);

    psuCtx.font = 'bold 16px monospace';
    psuCtx.fillStyle = powerOn ? '#10b981' : '#f59e0b';
    psuCtx.fillText(
      powerOn
        ? (isAc ? '● CH1: SINE WAVE · 50Ω LOAD' : '● CH1: CV (CONSTANT VOLTAGE) · OUTPUT ACTIVE')
        : '○ OUTPUT STANDBY · POWER SWITCH OFF',
      20,
      66
    );

    // Large High-Contrast Digital Readout
    psuCtx.font = 'bold 64px monospace';
    psuCtx.fillStyle = powerOn ? '#10b981' : '#475569';
    psuCtx.fillText(powerOn ? `${vs.toFixed(2)} V` : '0.00 V', 20, 146);

    // Secondary Telemetry Row
    psuCtx.font = 'bold 26px monospace';
    psuCtx.fillStyle = powerOn ? '#38bdf8' : '#334155';
    const circI = powerOn ? calculateCircuit(currentCircuits).current : 0;
    psuCtx.fillText(
      powerOn
        ? (isAc ? `FREQ: ${freq.toFixed(1)} Hz` : `I_OUT: ${(circI * 1000).toFixed(1)} mA`)
        : 'I_OUT: 0.0 mA (OFF)',
      20,
      200
    );

    psuCtx.font = 'bold 17px monospace';
    psuCtx.fillStyle = '#64748b';
    psuCtx.fillText(isAc ? 'OFFSET: 0.00 V · 50Ω' : 'CC LIMIT: 3.000 A · TRIP: 3.20 A', 20, 236);

    psuTexture.needsUpdate = true;
  };

  // Load High-Fidelity DC Power Supply GLB Model (replaces procedural housing, display & knobs)
  loadSanitizedGlb('/assets/room-3/electrical/dc_power_supply.glb', (model) => {
    model.name = 'DC_PSU_GLB';
    model.scale.setScalar(1.30);
    model.position.set(0, 0, 0);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        if (child.name === 'DC_PSU_Digital_Display') {
          (child as THREE.Mesh).material = new THREE.MeshBasicMaterial({ map: psuTexture });
          registerInteractable(child, {
            id: 'circuits-power-switch',
            stationId: 'circuits',
            category: 'POWER & EXCITATION',
            name: 'DC Regulated Power Supply',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-power-switch'],
            action: 'Toggle Main Power Switch',
            readout: `Output: ${currentCircuits.vs.toFixed(1)} V · Power: ${currentCircuits.powerOn !== false ? 'ON' : 'OFF'}`,
          });
        } else if (child.name === 'Knob_Voltage_Adjust') {
          psuVoltKnobMesh = child;
          attachKnobTickPointer(child, 0.014, 0.008, 0x38bdf8);
          child.userData.hoverTooltip = `Voltage Regulator Knob: ${currentCircuits.vs.toFixed(1)} V (Click to step / Scroll to tune)`;
          registerInteractable(child, {
            id: 'circuits-voltage-knob',
            stationId: 'circuits',
            category: 'POTENTIOMETER',
            name: 'DC Power Supply Voltage Knob',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-voltage-knob'],
            action: 'Turn Voltage Knob (Step / Scroll)',
            readout: `Vs = ${currentCircuits.vs.toFixed(1)} V`,
          });
        } else if (child.name === 'Knob_Current_Limit') {
          attachKnobTickPointer(child, 0.014, 0.008, 0xf59e0b);
          child.rotation.z = -Math.PI * 0.35;
          registerInteractable(child, {
            id: 'circuits-power-switch',
            stationId: 'circuits',
            category: 'POWER & EXCITATION',
            name: 'DC Regulated Power Supply',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-power-switch'],
            action: 'Toggle Main Power Switch',
            readout: `Output: ${currentCircuits.vs.toFixed(1)} V · Power: ${currentCircuits.powerOn !== false ? 'ON' : 'OFF'}`,
          });
        } else {
          registerInteractable(child, {
            id: 'circuits-power-switch',
            stationId: 'circuits',
            category: 'POWER & EXCITATION',
            name: 'DC Regulated Power Supply',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-power-switch'],
            action: 'Toggle Main Power Switch',
            readout: `Output: ${currentCircuits.vs.toFixed(1)} V · Power: ${currentCircuits.powerOn !== false ? 'ON' : 'OFF'}`,
          });
        }
      }
    });
    // Hide all procedural fallback meshes (including binding posts) to prevent double-rendering
    psuHousing.visible = false;
    psuDisplay.visible = false;
    powerSwitchMesh.visible = false;
    voltKnob.visible = false;
    redPostMesh.visible = false;
    blackPostMesh.visible = false;
    gndPostMesh.visible = false;
    psuGroup.add(model);
    psuGroup.updateMatrixWorld(true);
    const glbRedPost = model.getObjectByName('Post_Positive_Red');
    const glbBlackPost = model.getObjectByName('Post_Negative_Black');
    if (glbRedPost && glbBlackPost) {
      const redPos = new THREE.Vector3();
      const blackPos = new THREE.Vector3();
      glbRedPost.getWorldPosition(redPos);
      glbBlackPost.getWorldPosition(blackPos);
      syncStation1Anchors({ psuRedPost: redPos, psuBlackPost: blackPos, psuRotY: psuGroup.rotation.y });
    }
    psuSwitchMesh = psuSwitchAnchor;
    interactionToObjectMap.set('circuits-power-switch', psuSwitchAnchor);
    updatePsuKnobRotation(currentCircuits.vs);
  }, 'DC PSU');

  updatePsuTexture(currentCircuits.vs, currentCircuits.freq, currentCircuits.mode === 'ac', currentCircuits.powerOn !== false);

  scene.add(psuGroup);

  registerInteractable(powerSwitchMesh, {
    id: 'circuits-power-switch',
    stationId: 'circuits',
    category: 'BENCH POWER',
    name: 'Master Power Supply Switch',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-power-switch'],
    action: 'Toggle Circuit Power',
    readout: `State: ${currentCircuits.powerOn !== false ? 'Energized' : 'Standby (OFF)'} · Vs = ${currentCircuits.vs.toFixed(1)} V`,
  });
  interactionToObjectMap.set('circuits-power-switch', psuSwitchAnchor);

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
  let currentOscilloscope: OscilloscopeSettings = { ...INITIAL_OSCILLOSCOPE };
  let oscTimeKnobMesh: THREE.Object3D | null = null;
  let oscCh1KnobMesh: THREE.Object3D | null = null;
  let oscCh2KnobMesh: THREE.Object3D | null = null;
  let oscTriggerKnobMesh: THREE.Object3D | null = null;
  let oscCh1InputMesh: THREE.Object3D | null = null;
  let oscCh2InputMesh: THREE.Object3D | null = null;

  const oscGroup = new THREE.Group();
  oscGroup.position.set(circuitsBenchX - 0.05, BENCH_MAT_TOP_Y, -0.52);

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

  const updateOscKnobRotations = () => {
    if (oscTimeKnobMesh) {
      const idx = TIME_DIV_OPTIONS.indexOf(currentOscilloscope.timePerDivMs);
      const angle = -Math.PI * 0.75 + (Math.max(0, idx) / (TIME_DIV_OPTIONS.length - 1)) * Math.PI * 1.5;
      oscTimeKnobMesh.rotation.z = -angle;
    }
    if (oscCh1KnobMesh) {
      const idx = CH1_VOLTS_DIV_OPTIONS.indexOf(currentOscilloscope.ch1VoltsPerDiv);
      const angle = -Math.PI * 0.75 + (Math.max(0, idx) / (CH1_VOLTS_DIV_OPTIONS.length - 1)) * Math.PI * 1.5;
      oscCh1KnobMesh.rotation.z = -angle;
    }
    if (oscCh2KnobMesh) {
      const idx = CH2_VOLTS_DIV_OPTIONS.indexOf(currentOscilloscope.ch2VoltsPerDiv);
      const angle = -Math.PI * 0.75 + (Math.max(0, idx) / (CH2_VOLTS_DIV_OPTIONS.length - 1)) * Math.PI * 1.5;
      oscCh2KnobMesh.rotation.z = -angle;
    }
    if (oscTriggerKnobMesh) {
      oscTriggerKnobMesh.rotation.z = currentOscilloscope.runState === 'run' ? 0 : -Math.PI * 0.5;
    }
  };

  let oscPhase = 0;
  const updateOscilloscope = (delta: number) => {
    if (!currentOscilloscope.powerOn) {
      oscCtx.fillStyle = '#040711';
      oscCtx.fillRect(0, 0, 512, 384);
      oscCtx.font = 'bold 20px monospace';
      oscCtx.fillStyle = '#1e293b';
      oscCtx.textAlign = 'center';
      oscCtx.fillText('TEKTRONIX TDS 2024B', 256, 170);
      oscCtx.font = '14px monospace';
      oscCtx.fillStyle = '#334155';
      oscCtx.fillText('[ POWER OFF · CLICK TO TURN ON ]', 256, 210);
      oscCtx.textAlign = 'left';
      oscTexture.needsUpdate = true;
      return;
    }

    if (currentOscilloscope.runState === 'run') {
      const sweepRate = currentCircuits.mode === 'ac' ? currentCircuits.freq * 0.05 : 20.0;
      oscPhase += delta * sweepRate;
    }

    const circResult = calculateCircuit(currentCircuits);
    const isCircuitPowered = currentCircuits.powerOn !== false;
    const isLoopClosed = multimeter3d.circuitState.seriesJumperConnected || (multimeter3d.dmmState.redProbeTerminal === 'SERIES_JACK_A' && multimeter3d.dmmState.blackProbeTerminal === 'SERIES_JACK_B') || (multimeter3d.dmmState.redProbeTerminal === 'SERIES_JACK_B' && multimeter3d.dmmState.blackProbeTerminal === 'SERIES_JACK_A');

    // Deep CRT screen background
    oscCtx.fillStyle = '#020617';
    oscCtx.fillRect(0, 0, 512, 384);

    // 8x10 Graticule Grid
    oscCtx.strokeStyle = 'rgba(16, 185, 129, 0.16)';
    oscCtx.lineWidth = 1;
    for (let x = 0; x <= 512; x += 51.2) {
      oscCtx.beginPath();
      oscCtx.moveTo(x, 24);
      oscCtx.lineTo(x, 350);
      oscCtx.stroke();
    }
    for (let y = 24; y <= 350; y += 40.75) {
      oscCtx.beginPath();
      oscCtx.moveTo(0, y);
      oscCtx.lineTo(512, y);
      oscCtx.stroke();
    }

    // Center Crosshairs with tick subdivisions
    oscCtx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
    oscCtx.lineWidth = 1.2;
    // Horizontal center axis
    oscCtx.beginPath();
    oscCtx.moveTo(0, 187);
    oscCtx.lineTo(512, 187);
    oscCtx.stroke();
    // Vertical center axis
    oscCtx.beginPath();
    oscCtx.moveTo(256, 24);
    oscCtx.lineTo(256, 350);
    oscCtx.stroke();

    // Tick marks on center axes
    oscCtx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    for (let x = 0; x <= 512; x += 10.24) {
      oscCtx.beginPath();
      oscCtx.moveTo(x, 184);
      oscCtx.lineTo(x, 190);
      oscCtx.stroke();
    }
    for (let y = 24; y <= 350; y += 8.15) {
      oscCtx.beginPath();
      oscCtx.moveTo(253, y);
      oscCtx.lineTo(259, y);
      oscCtx.stroke();
    }

    // Determine signal values
    let ch1Peak = 0;
    if (isCircuitPowered) {
      if (currentOscilloscope.ch1Source === 'vs') ch1Peak = currentCircuits.vs;
      else if (currentOscilloscope.ch1Source === 'r1') ch1Peak = circResult.v1;
      else if (currentOscilloscope.ch1Source === 'r2') ch1Peak = circResult.v2;
      else if (currentOscilloscope.ch1Source === 'r3') ch1Peak = circResult.v3;
    }

    let ch2Signal = 0;
    if (isCircuitPowered && isLoopClosed) {
      if (currentOscilloscope.ch2Source === 'current') ch2Signal = circResult.current * 1000; // in mA
      else if (currentOscilloscope.ch2Source === 'r1') ch2Signal = circResult.v1;
      else if (currentOscilloscope.ch2Source === 'r2') ch2Signal = circResult.v2;
      else if (currentOscilloscope.ch2Source === 'r3') ch2Signal = circResult.v3;
    }

    const isAc = currentCircuits.mode === 'ac';
    const totalTimeSpanMs = currentOscilloscope.timePerDivMs * 10;
    const freq = isAc ? currentCircuits.freq : 60;
    const cyclesInWindow = (totalTimeSpanMs / 1000) * freq;
    const phaseRad = circResult.phaseAngleRad;

    // Channel 1: Yellow Trace (#facc15)
    if (currentOscilloscope.ch1Enabled) {
      const vPerDiv = currentOscilloscope.ch1VoltsPerDiv;
      const pxPerVolt = 40.75 / vPerDiv;
      oscCtx.strokeStyle = '#facc15';
      oscCtx.lineWidth = 2.5;
      oscCtx.shadowColor = '#facc15';
      oscCtx.shadowBlur = 4;
      oscCtx.beginPath();

      for (let px = 0; px < 512; px++) {
        const tFrac = px / 512;
        let vInst = 0;
        if (currentOscilloscope.coupling === 'gnd') {
          vInst = 0;
        } else if (isAc) {
          const theta = tFrac * Math.PI * 2 * cyclesInWindow + oscPhase;
          vInst = ch1Peak * Math.sin(theta);
        } else {
          // DC with fine ripple
          const ripple = 0.04 * Math.sin(tFrac * Math.PI * 16 + oscPhase);
          vInst = currentOscilloscope.coupling === 'ac' ? ripple : ch1Peak + ripple;
        }
        const py = Math.max(26, Math.min(348, 187 - vInst * pxPerVolt));
        if (px === 0) oscCtx.moveTo(px, py);
        else oscCtx.lineTo(px, py);
      }
      oscCtx.stroke();
      oscCtx.shadowBlur = 0;

      // CH1 Ground Reference Marker
      oscCtx.fillStyle = '#facc15';
      oscCtx.font = 'bold 11px sans-serif';
      oscCtx.fillText('1▶', 2, 191);
    }

    // Channel 2: Cyan Trace (#38bdf8)
    if (currentOscilloscope.ch2Enabled) {
      const scalePerDiv = currentOscilloscope.ch2VoltsPerDiv;
      const pxPerUnit = 40.75 / scalePerDiv;
      oscCtx.strokeStyle = '#38bdf8';
      oscCtx.lineWidth = 2.2;
      oscCtx.shadowColor = '#38bdf8';
      oscCtx.shadowBlur = 4;
      oscCtx.beginPath();

      for (let px = 0; px < 512; px++) {
        const tFrac = px / 512;
        let sigInst = 0;
        if (currentOscilloscope.coupling === 'gnd') {
          sigInst = 0;
        } else if (isAc) {
          const theta = tFrac * Math.PI * 2 * cyclesInWindow + oscPhase - phaseRad;
          sigInst = ch2Signal * Math.sin(theta);
        } else {
          const ripple = (ch2Signal > 0 ? 0.05 * ch2Signal : 0.01) * Math.sin(tFrac * Math.PI * 16 + oscPhase);
          sigInst = currentOscilloscope.coupling === 'ac' ? ripple : ch2Signal + ripple;
        }
        const py = Math.max(26, Math.min(348, 187 - sigInst * pxPerUnit));
        if (px === 0) oscCtx.moveTo(px, py);
        else oscCtx.lineTo(px, py);
      }
      oscCtx.stroke();
      oscCtx.shadowBlur = 0;

      // CH2 Ground Reference Marker
      oscCtx.fillStyle = '#38bdf8';
      oscCtx.font = 'bold 11px sans-serif';
      oscCtx.fillText('2▶', 2, 191);
    }

    // Top Header Bar
    oscCtx.fillStyle = '#0f172a';
    oscCtx.fillRect(0, 0, 512, 24);
    oscCtx.font = 'bold 12px monospace';
    oscCtx.fillStyle = '#f8fafc';
    oscCtx.fillText('TEKTRONIX TDS 2024B', 10, 16);

    const isRunning = currentOscilloscope.runState === 'run';
    oscCtx.fillStyle = isRunning ? '#10b981' : '#ef4444';
    oscCtx.fillText(isRunning ? '[ TRIG\'D ]' : '[ STOP ]', 180, 16);

    oscCtx.fillStyle = '#94a3b8';
    oscCtx.fillText(`CH1: ${currentOscilloscope.ch1Source.toUpperCase()} · CH2: ${currentOscilloscope.ch2Source.toUpperCase()}`, 270, 16);
    oscCtx.fillText(`M: ${currentOscilloscope.timePerDivMs}ms`, 440, 16);

    // Bottom Telemetry Bar
    oscCtx.fillStyle = '#0f172a';
    oscCtx.fillRect(0, 352, 512, 32);
    oscCtx.font = 'bold 12px monospace';
    oscCtx.fillStyle = '#facc15';
    oscCtx.fillText(`CH1 ${currentOscilloscope.ch1VoltsPerDiv}V~`, 10, 372);
    oscCtx.fillStyle = '#38bdf8';
    oscCtx.fillText(`CH2 ${currentOscilloscope.ch2VoltsPerDiv}${currentOscilloscope.ch2Source === 'current' ? 'mA' : 'V'}~`, 110, 372);

    oscCtx.fillStyle = '#34d399';
    const vRms = isAc ? ch1Peak / Math.SQRT2 : ch1Peak;
    const vPpk = isAc ? ch1Peak * 2 : (currentOscilloscope.coupling === 'ac' ? 0.08 : ch1Peak);
    oscCtx.fillText(`Vrms:${vRms.toFixed(1)}V`, 220, 372);
    oscCtx.fillText(`Vpp:${vPpk.toFixed(1)}V`, 320, 372);

    oscCtx.fillStyle = '#fef08a';
    oscCtx.fillText(isAc ? `f:${currentCircuits.freq.toFixed(0)}Hz` : 'DC Mode', 420, 372);

    oscTexture.needsUpdate = true;
  };

  // Load High-Fidelity Tektronix Oscilloscope GLB Model (properly scaled to bench instrument proportions)
  loadSanitizedGlb('/assets/room-3/electrical/oscilloscope.glb', (model) => {
    model.name = 'Oscilloscope_GLB';
    model.scale.setScalar(1.15);
    model.position.set(0, 0, 0);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        if (child.name === 'Oscilloscope_Screen_Display') {
          (child as THREE.Mesh).material = new THREE.MeshBasicMaterial({ map: oscTexture });
        } else if (child.name === 'Knob_TimeDiv') {
          oscTimeKnobMesh = child;
          attachKnobTickPointer(child, 0.016, 0.009, 0xeab308);
          child.userData.hoverTooltip = `Oscilloscope Timebase: ${currentOscilloscope.timePerDivMs} ms/div (Click to step / Scroll)`;
          registerInteractable(child, {
            id: 'circuits-osc-time-knob',
            stationId: 'circuits',
            category: 'OSCILLOSCOPE',
            name: 'Timebase Horizontal SEC/DIV Knob',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-osc-time-knob'],
            action: 'Step Timebase (ms/div)',
            readout: `${currentOscilloscope.timePerDivMs} ms/div`,
          });
        } else if (child.name === 'Knob_VoltsDiv_Ch1') {
          oscCh1KnobMesh = child;
          attachKnobTickPointer(child, 0.016, 0.009, 0xfacc15);
          child.userData.hoverTooltip = `CH1 Scale: ${currentOscilloscope.ch1VoltsPerDiv} V/div (Click to step / Scroll)`;
          registerInteractable(child, {
            id: 'circuits-osc-ch1-knob',
            stationId: 'circuits',
            category: 'OSCILLOSCOPE',
            name: 'Channel 1 VOLTS/DIV Knob',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-osc-ch1-knob'],
            action: 'Step CH1 Volts/div',
            readout: `${currentOscilloscope.ch1VoltsPerDiv} V/div`,
          });
        } else if (child.name === 'Knob_VoltsDiv_Ch2') {
          oscCh2KnobMesh = child;
          attachKnobTickPointer(child, 0.016, 0.009, 0x38bdf8);
          child.userData.hoverTooltip = `CH2 Scale: ${currentOscilloscope.ch2VoltsPerDiv} mA/div (Click to step / Scroll)`;
          registerInteractable(child, {
            id: 'circuits-osc-ch2-knob',
            stationId: 'circuits',
            category: 'OSCILLOSCOPE',
            name: 'Channel 2 Scale Knob',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-osc-ch2-knob'],
            action: 'Step CH2 Scale',
            readout: `${currentOscilloscope.ch2VoltsPerDiv} mA/div`,
          });
        } else if (child.name === 'Knob_Trigger') {
          oscTriggerKnobMesh = child;
          attachKnobTickPointer(child, 0.016, 0.009, 0x34d399);
          child.userData.hoverTooltip = `Trigger / Run-Stop: ${currentOscilloscope.runState.toUpperCase()}`;
          registerInteractable(child, {
            id: 'circuits-osc-trigger-knob',
            stationId: 'circuits',
            category: 'OSCILLOSCOPE',
            name: 'Run / Stop Trigger Toggle',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-osc-trigger-knob'],
            action: 'Toggle Run / Stop',
            readout: `State: ${currentOscilloscope.runState.toUpperCase()}`,
          });
        } else if (child.name === 'BNC_Input_CH1') {
          oscCh1InputMesh = child;
          child.userData.hoverTooltip = `CH1 Input: Connected to ${currentOscilloscope.ch1Source.toUpperCase()}`;
          registerInteractable(child, {
            id: 'circuits-osc-ch1-input',
            stationId: 'circuits',
            category: 'OSCILLOSCOPE',
            name: 'BNC Input Jack CH1 (Voltage)',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-osc-ch1-input'],
            action: 'Cycle Probe Node (Vs -> R1 -> R2 -> R3)',
            readout: `Probe on: ${currentOscilloscope.ch1Source.toUpperCase()}`,
          });
        } else if (child.name === 'BNC_Input_CH2') {
          oscCh2InputMesh = child;
          child.userData.hoverTooltip = `CH2 Input: Connected to ${currentOscilloscope.ch2Source.toUpperCase()}`;
          registerInteractable(child, {
            id: 'circuits-osc-ch2-input',
            stationId: 'circuits',
            category: 'OSCILLOSCOPE',
            name: 'BNC Input Jack CH2 (Current/Node)',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-osc-ch2-input'],
            action: 'Cycle Probe Node (Current -> R1 -> R2 -> R3)',
            readout: `Probe on: ${currentOscilloscope.ch2Source.toUpperCase()}`,
          });
        } else if (child.name === 'Tektronix_Oscilloscope') {
          registerInteractable(child, {
            id: 'circuits-oscilloscope',
            stationId: 'circuits',
            category: 'INSTRUMENTATION',
            name: 'Tektronix Dual-Channel Digital Storage Oscilloscope',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-oscilloscope'],
            action: 'Focus & Inspect Oscilloscope Display',
            readout: `CH1: ${currentOscilloscope.ch1VoltsPerDiv}V/div · M: ${currentOscilloscope.timePerDivMs}ms · Mode: ${currentCircuits.mode.toUpperCase()}`,
          });
        }
      }
    });
    // Hide procedural fallback housing and floating screen to prevent double-rendering
    oscHousing.visible = false;
    oscScreen.visible = false;
    oscGroup.add(model);
    oscGroup.updateMatrixWorld(true);
    if (oscCh1InputMesh && oscCh2InputMesh) {
      const ch1Pos = new THREE.Vector3();
      const ch2Pos = new THREE.Vector3();
      oscCh1InputMesh.getWorldPosition(ch1Pos);
      oscCh2InputMesh.getWorldPosition(ch2Pos);
      syncStation1Anchors({ oscCh1Bnc: ch1Pos, oscCh2Bnc: ch2Pos });
    }
    updateOscKnobRotations();
  }, 'Oscilloscope');

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
  fgenGroup.position.set(circuitsBenchX + 0.65, BENCH_MAT_TOP_Y, -0.48);
  fgenGroup.rotation.y = -0.08;

  const fgenCanvas = document.createElement('canvas');
  fgenCanvas.width = 512;
  fgenCanvas.height = 256;
  const fgenCtx = fgenCanvas.getContext('2d')!;
  const fgenTexture = new THREE.CanvasTexture(fgenCanvas);

  let fgenFreqDialMesh: THREE.Object3D | null = null;
  let fgenMainBncMesh: THREE.Object3D | null = null;
  const fgenWaveformBtnMeshes: THREE.Mesh[] = [];

  const updateFgenControlsVisual = () => {
    if (fgenFreqDialMesh) {
      const clampedF = THREE.MathUtils.clamp(currentCircuits.freq, 10, 1000);
      const angle = -Math.PI * 0.75 + ((clampedF - 10) / 990) * Math.PI * 1.5;
      fgenFreqDialMesh.rotation.z = -angle;
    }
    const activeBtnIdx = currentCircuits.mode === 'ac' ? 0 : 3; // Btn_0 = SINE AC, Btn_3 = DC LEVEL
    fgenWaveformBtnMeshes.forEach((btn, idx) => {
      const mat = btn.material as THREE.MeshStandardMaterial;
      if (mat && 'emissive' in mat) {
        const isActive = idx === activeBtnIdx && currentCircuits.powerOn !== false;
        mat.emissive.setHex(isActive ? (idx === 0 ? 0x38bdf8 : 0xf59e0b) : 0x000000);
        mat.emissiveIntensity = isActive ? 0.9 : 0;
      }
    });
  };

  const updateFgenDisplay = () => {
    fgenCtx.fillStyle = '#0a192f';
    fgenCtx.fillRect(0, 0, 512, 256);

    const isOn = currentCircuits.powerOn !== false;
    const isAc = currentCircuits.mode === 'ac';

    fgenCtx.font = 'bold 24px monospace';
    fgenCtx.fillStyle = '#38bdf8';
    fgenCtx.fillText('RIGOL DG1022 DDS ARB GENERATOR', 20, 38);

    fgenCtx.font = 'bold 16px monospace';
    fgenCtx.fillStyle = isOn ? '#10b981' : '#ef4444';
    fgenCtx.fillText(`CH1: 50Ω HIGH-Z · OUTPUT [${isOn ? 'ON' : 'OFF'}]`, 20, 68);

    fgenCtx.font = 'bold 54px monospace';
    fgenCtx.fillStyle = isOn ? '#eab308' : '#475569';
    fgenCtx.fillText(isAc ? `${currentCircuits.freq.toFixed(1)} Hz` : '0.0 Hz (DC)', 20, 140);

    fgenCtx.font = 'bold 24px monospace';
    fgenCtx.fillStyle = isAc ? '#38bdf8' : '#f59e0b';
    fgenCtx.fillText(`WAVE: ${isAc ? 'SINE ~ AC' : 'DC CONSTANT'}`, 20, 195);
    fgenCtx.font = 'bold 18px monospace';
    fgenCtx.fillStyle = '#94a3b8';
    fgenCtx.fillText(`AMPL: ${currentCircuits.vs.toFixed(1)} V · OFFSET: 0.00 V`, 20, 235);

    fgenTexture.needsUpdate = true;
    updateFgenControlsVisual();
  };
  updateFgenDisplay();

  loadSanitizedGlb('/assets/room-3/electrical/function_generator.glb', (model) => {
    model.name = 'FunctionGenerator_GLB';
    model.scale.setScalar(1.30);
    model.position.set(0, 0, 0);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.name === 'FunctionGen_LCD_Screen') {
          mesh.material = new THREE.MeshBasicMaterial({ map: fgenTexture });
          registerInteractable(mesh, {
            id: 'circuits-function-generator',
            stationId: 'circuits',
            category: 'EXCITATION SOURCE',
            name: 'Rigol DDS Arbitrary Function Generator',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-power-switch'],
            action: 'Toggle Main Power Output',
            readout: `Freq: ${currentCircuits.freq.toFixed(0)} Hz · Mode: ${currentCircuits.mode.toUpperCase()}`,
          });
        } else if (mesh.name === 'Dial_Frequency') {
          fgenFreqDialMesh = mesh;
          attachKnobTickPointer(mesh, 0.018, 0.0085, 0x38bdf8);
          mesh.userData.hoverTooltip = `FGen Frequency Dial: ${currentCircuits.freq.toFixed(0)} Hz · Click to step / Scroll ±10 Hz`;
          registerInteractable(mesh, {
            id: 'circuits-fgen-freq-knob',
            stationId: 'circuits',
            category: 'FREQUENCY SYNTHESIZER',
            name: 'Function Generator Frequency Dial',
            description: 'Tunes AC sinusoidal frequency (10 – 1000 Hz) driving capacitive & inductive reactances.',
            action: 'Click: Step Hz · Scroll: ±10 Hz',
            readout: `${currentCircuits.freq.toFixed(0)} Hz`,
          });
        } else if (mesh.name.startsWith('Btn_Waveform_')) {
          // Clone button material individually so emissive state highlights active button independently
          if (!Array.isArray(mesh.material)) {
            mesh.material = mesh.material.clone();
          }
          fgenWaveformBtnMeshes.push(mesh);
          mesh.userData.hoverTooltip = `Waveform Selector (${currentCircuits.mode.toUpperCase()}) · Click to switch AC Sine <-> DC Level`;
          registerInteractable(mesh, {
            id: 'circuits-fgen-mode-btn',
            stationId: 'circuits',
            category: 'WAVEFORM SELECT',
            name: 'Function Generator AC / DC Selector',
            description: 'Switches excitation source between DC steady bias and AC sinusoidal sweep.',
            action: 'Click: Toggle AC / DC Mode',
            readout: `Active: ${currentCircuits.mode === 'ac' ? 'AC Sine' : 'DC Level'}`,
          });
        } else if (mesh.name === 'BNC_Main_Output') {
          fgenMainBncMesh = mesh;
          mesh.userData.hoverTooltip = `CH1 Main BNC Output (50 Ω) · Routed to breadboard`;
          registerInteractable(mesh, {
            id: 'circuits-fgen-mode-btn',
            stationId: 'circuits',
            category: 'BNC OUTPUT',
            name: 'Function Generator Main BNC Output',
            description: '50-ohm coaxial excitation port feeding AC/DC test signals to the breadboard.',
            action: 'Click: Toggle AC / DC Output Mode',
            readout: `50Ω Port · ${currentCircuits.mode.toUpperCase()} (${currentCircuits.freq.toFixed(0)} Hz)`,
          });
        } else {
          registerInteractable(mesh, {
            id: 'circuits-function-generator',
            stationId: 'circuits',
            category: 'EXCITATION SOURCE',
            name: 'Rigol DDS Arbitrary Function Generator',
            description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-power-switch'],
            action: 'Toggle Main Power Output',
            readout: `Supply: ${currentCircuits.vs.toFixed(1)} V · Mode: ${currentCircuits.mode.toUpperCase()}`,
          });
        }
      }
    });
    fgenGroup.add(model);
    fgenGroup.updateMatrixWorld(true);
    if (fgenMainBncMesh) {
      const fgenBncPos = new THREE.Vector3();
      fgenMainBncMesh.getWorldPosition(fgenBncPos);
      syncStation1Anchors({ fgenMainBnc: fgenBncPos, fgenRotY: fgenGroup.rotation.y });
    }
    updateFgenControlsVisual();
  }, 'Function Gen');
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
    onActiveProbeChange: (probe) => {
      callbacks.onActiveProbeChange?.(probe);
    },
    onModeChange: (mode) => {
      callbacks.onDmmModeChange?.(mode);
    },
    onJackChange: (jack) => {
      callbacks.onDmmJackChange?.(jack);
    },
    onJumperChange: (closed) => {
      callbacks.onJumperChange?.(closed);
    },
    onFuseTripped: () => {
      playTone(220, 'sawtooth', 0.4, 0.25);
    },
    playTone: (freq, type, duration, vol) => {
      playTone(freq, type, duration, vol);
    },
  });
  scene.add(multimeter3d.root);
  multimeter3dRef = multimeter3d;
  multimeter3d.setInstrumentAnchors(pendingInstrumentAnchors);
  updateOscilloscope(0);

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
  // Extruded rail sits at Y ∈ [0.000, +0.054] and end feet extend to -0.012 at scale 1.2
  const OPTICS_RAIL_TOP_Y = 0.054;
  const OPTICS_BEAM_Y = 0.18;

  // Shared factory for sliding anodized optical rail carriages clamped cleanly at y = OPTICS_RAIL_TOP_Y
  const buildOpticsCarriage = (postHeight: number): THREE.Group => {
    const carriage = new THREE.Group();
    const saddleMat = material(0x1e293b, { metalness: 0.85, roughness: 0.28 });
    const postMat = material(0xcbd5e1, { metalness: 0.92, roughness: 0.18 });
    const thumbMat = material(0xd97706, { metalness: 0.85, roughness: 0.25 });

    // Clamping saddle straddling the dovetail rail top
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.022, 0.125), saddleMat);
    saddle.position.y = -postHeight;
    carriage.add(saddle);

    // Side locking flange + brass thumbscrew knob on front (+Z)
    const lockScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.018, 12), thumbMat);
    lockScrew.rotation.x = Math.PI / 2;
    lockScrew.position.set(0, -postHeight, 0.072);
    carriage.add(lockScrew);

    if (postHeight > 0.02) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.018, 16), saddleMat);
      collar.position.y = -postHeight + 0.018;
      carriage.add(collar);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, postHeight - 0.018, 16), postMat);
      post.position.y = -postHeight * 0.5 + 0.009;
      carriage.add(post);
    }
    return carriage;
  };

  const railGroup = new THREE.Group();
  railGroup.position.set(opticsBenchX, BENCH_MAT_TOP_Y + 0.012, 0);

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.054, 0.14),
    material(0x0f172a, { metalness: 0.9, roughness: 0.25 })
  );
  rail.position.y = 0.027;
  railGroup.add(rail);

  registerInteractable(rail, {
    id: 'optics-rail',
    stationId: 'optics',
    category: 'OPTICAL BENCH',
    name: 'Graduated Metric Optical Bench Rail',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-rail'] || 'Precision metric rail holding laser diode, goniometer prism mount, and micrometric diffraction screen.',
    action: 'Examine Optical Alignment',
    readout: 'Alignment: Paraxial collinear · Scale: 0 to 200 cm',
  });

  // Load High-Fidelity Optical Rail System GLB Model (hide frozen static Optical_Carrier_1..4 so carriages slide live)
  loadSanitizedGlb('/assets/room-3/optics/optical_rail_system.glb', (model) => {
    model.name = 'OpticalRail_GLB';
    model.scale.setScalar(1.2);
    model.position.set(0, 0, 0);
    model.traverse((obj) => {
      if (obj.name.startsWith('Optical_Carrier_')) {
        obj.visible = false;
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
  }, 'Optical Rail');

  // Laser Diode Emitter Assembly (Hidden cleanly during backlit Target Imaging Mode to avoid carriage overlap)
  const laserCarriageGroup = new THREE.Group();
  laserCarriageGroup.position.set(-1.0, OPTICS_BEAM_Y, 0);
  laserCarriageGroup.add(buildOpticsCarriage(OPTICS_BEAM_Y - OPTICS_RAIL_TOP_Y));

  const laserHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.22, 24),
    material(0x1e293b, { metalness: 0.8, roughness: 0.3 })
  );
  laserHousing.rotation.z = Math.PI / 2;
  laserCarriageGroup.add(laserHousing);

  // Invisible ergonomic collider covering the full laser diode cylinder, mount post, and rail saddle
  // Note: laserHousing has rotation.z = +PI/2, so local -X aligns with parent -Y (down toward the rail).
  const laserHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.175, 0.28, 0.135),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  laserHitbox.position.set(-0.042, 0, 0);
  laserHousing.add(laserHitbox);

  let laserGlbBeamOriginX = -0.868;
  // Load High-Fidelity Diode Laser Collimator GLB Model
  loadSanitizedGlb('/assets/room-3/optics/laser_source.glb', (model) => {
    model.name = 'LaserSource_GLB';
    model.scale.setScalar(1.3);
    model.position.set(0, 0, 0);
    (laserHousing.material as THREE.Material).transparent = true;
    (laserHousing.material as THREE.Material).opacity = 0;
    (laserHousing.material as THREE.Material).depthWrite = false;
    (laserHousing.material as THREE.Material).needsUpdate = true;
    laserHousing.visible = true;
    laserCarriageGroup.add(model);
    railGroup.updateMatrixWorld(true);
    const aperture = model.getObjectByName('Laser_Aperture_Emitter');
    if (aperture) {
      const worldTip = new THREE.Vector3();
      aperture.getWorldPosition(worldTip);
      railGroup.worldToLocal(worldTip);
      laserGlbBeamOriginX = worldTip.x + 0.004;
    }
    registerInteractable(model, {
      id: 'optics-laser',
      stationId: 'optics',
      category: 'COHERENT EMISSION',
      name: 'Tunable Coherent Diode Laser Collimator',
      description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-laser'],
      action: 'Cycle Emission Wavelength (Green 532nm / Red 650nm / Violet 405nm)',
      readout: `Laser Wavelength: ${currentOptics.wavelength} nm · Coherence: 150 m`,
    });
  }, 'Laser Source');
  railGroup.add(laserCarriageGroup);

  const beamMat = new THREE.MeshBasicMaterial({
    color: wavelengthToRGB(currentOptics.wavelength),
    transparent: true,
    opacity: 0.88,
  });

  const secondaryBeamMat = new THREE.MeshBasicMaterial({
    color: wavelengthToRGB(currentOptics.wavelength),
    transparent: true,
    opacity: 0.65,
  });

  const beamHaloMat = new THREE.MeshBasicMaterial({
    color: wavelengthToRGB(currentOptics.wavelength),
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const positionBeamBetween = (mesh: THREE.Mesh, p1: THREE.Vector3, p2: THREE.Vector3) => {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    if (len < 0.005) {
      mesh.visible = false;
      return;
    }
    mesh.position.copy(p1).addScaledVector(dir, 0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.visible = true;
  };

  const unitBeamGeo = new THREE.CylinderGeometry(0.005, 0.005, 1.0, 12);
  const marginalRayGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 1.0, 10);
  const unitHaloGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.0, 12);
  const marginalHaloGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 1.0, 10);

  const attachBeamHalo = (parent: THREE.Mesh, geo: THREE.CylinderGeometry) => {
    const halo = new THREE.Mesh(geo, beamHaloMat);
    halo.raycast = () => {};
    parent.add(halo);
    return halo;
  };

  const laserBeam = new THREE.Mesh(unitBeamGeo, beamMat);
  const refractedBeam = new THREE.Mesh(unitBeamGeo, beamMat);
  const reflectedBeam = new THREE.Mesh(marginalRayGeo, secondaryBeamMat);
  const upperMarginalRay = new THREE.Mesh(marginalRayGeo, secondaryBeamMat);
  const lowerMarginalRay = new THREE.Mesh(marginalRayGeo, secondaryBeamMat);
  attachBeamHalo(laserBeam, unitHaloGeo);
  attachBeamHalo(refractedBeam, unitHaloGeo);
  attachBeamHalo(reflectedBeam, marginalHaloGeo);
  attachBeamHalo(upperMarginalRay, marginalHaloGeo);
  attachBeamHalo(lowerMarginalRay, marginalHaloGeo);
  railGroup.add(laserBeam, refractedBeam, reflectedBeam, upperMarginalRay, lowerMarginalRay);

  // Illuminated Object Target Carriage (Visible in Thin-Lens Imaging Mode at x = -0.82m)
  const objectTargetGroup = new THREE.Group();
  objectTargetGroup.position.set(-0.82, OPTICS_BEAM_Y, 0);
  objectTargetGroup.add(buildOpticsCarriage(OPTICS_BEAM_Y - OPTICS_RAIL_TOP_Y));

  const targetPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.145, 0.145),
    material(0x0f172a, { metalness: 0.5, roughness: 0.55 })
  );

  // Crisp glowing upward Arrow-Stencil Reticle Texture (matches projected Thin-Lens arrow!)
  const reticleCanvas = document.createElement('canvas');
  reticleCanvas.width = 256;
  reticleCanvas.height = 256;
  const retCtx = reticleCanvas.getContext('2d')!;
  retCtx.fillStyle = '#090e1a';
  retCtx.fillRect(0, 0, 256, 256);
  retCtx.strokeStyle = '#64748b';
  retCtx.lineWidth = 4;
  retCtx.strokeRect(8, 8, 240, 240);
  retCtx.strokeStyle = '#fef08a';
  retCtx.fillStyle = '#fef08a';
  retCtx.lineWidth = 10;
  retCtx.beginPath();
  retCtx.moveTo(128, 200);
  retCtx.lineTo(128, 66);
  retCtx.stroke();
  retCtx.beginPath();
  retCtx.moveTo(128, 42);
  retCtx.lineTo(94, 86);
  retCtx.lineTo(162, 86);
  retCtx.closePath();
  retCtx.fill();
  retCtx.lineWidth = 4;
  retCtx.beginPath();
  retCtx.arc(128, 128, 52, 0, Math.PI * 2);
  retCtx.stroke();
  const targetReticleTex = new THREE.CanvasTexture(reticleCanvas);
  targetReticleTex.colorSpace = THREE.SRGBColorSpace;

  const targetArrowGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.115, 0.115),
    new THREE.MeshBasicMaterial({ map: targetReticleTex, side: THREE.DoubleSide })
  );
  targetArrowGlow.rotation.y = Math.PI / 2;
  targetArrowGlow.position.x = 0.009;
  objectTargetGroup.add(targetPlate, targetArrowGlow);
  railGroup.add(objectTargetGroup);

  // Optical Element Assembly (Sliding Carriage + Single Rotary Goniometer Prism OR Lathe Biconvex Lens OR Twin-Slit Aperture)
  const opticalElementGroup = new THREE.Group();
  opticalElementGroup.position.set(0, OPTICS_BEAM_Y, 0);
  opticalElementGroup.add(buildOpticsCarriage(OPTICS_BEAM_Y - OPTICS_RAIL_TOP_Y));

  const prismGlassMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    opacity: 0.42,
    transparent: true,
    roughness: 0.05,
    metalness: 0.15,
    depthWrite: false,
  });

  // LatheGeometry Biconvex Crown-Glass Lens mounted in Anodized Retaining Ring
  const biconvexGroup = new THREE.Group();
  const biconvexPts: THREE.Vector2[] = [];
  const lensR = 0.088;
  const lensHalfThick = 0.015;
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * lensR;
    const xOffset = lensHalfThick * (1 - (t / lensR) * (t / lensR));
    biconvexPts.push(new THREE.Vector2(t, xOffset));
  }
  for (let i = 16; i >= 0; i--) {
    const t = (i / 16) * lensR;
    const xOffset = -lensHalfThick * (1 - (t / lensR) * (t / lensR));
    biconvexPts.push(new THREE.Vector2(t, xOffset));
  }
  const lensMesh = new THREE.Mesh(new THREE.LatheGeometry(biconvexPts, 36), prismGlassMat);
  lensMesh.rotation.z = Math.PI / 2; // Optical axis along X

  const lensHolderRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.094, 0.011, 14, 36),
    material(0x1e293b, { metalness: 0.85, roughness: 0.28 })
  );
  lensHolderRing.rotation.y = Math.PI / 2;
  const lensCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.015, 0.04, 16),
    material(0x334155, { metalness: 0.85, roughness: 0.25 })
  );
  lensCollar.position.y = -0.105;
  biconvexGroup.add(lensMesh, lensHolderRing, lensCollar);
  biconvexGroup.visible = false;
  opticalElementGroup.add(biconvexGroup);

  // Precision Double-Slit Aperture Assembly (two physical vertical slits + glowing diffraction mouth)
  const slitPlate = new THREE.Group();
  const slitFrameMat = material(0x1e293b, { metalness: 0.85, roughness: 0.28 });
  const slitLeftSide = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.16, 0.068), slitFrameMat);
  slitLeftSide.position.z = -0.044;
  const slitCenterBridge = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.16, 0.008), slitFrameMat);
  const slitRightSide = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.16, 0.068), slitFrameMat);
  slitRightSide.position.z = 0.044;
  const slitTopBar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.025, 0.165), slitFrameMat);
  slitTopBar.position.y = 0.072;
  const slitBotBar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.025, 0.165), slitFrameMat);
  slitBotBar.position.y = -0.072;
  const slitGlowMat = new THREE.MeshBasicMaterial({ color: wavelengthToRGB(currentOptics.wavelength), transparent: true, opacity: 0.9 });
  const slitGlowA = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.004), slitGlowMat);
  slitGlowA.position.z = -0.0075;
  const slitGlowB = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.004), slitGlowMat);
  slitGlowB.position.z = 0.0075;
  slitPlate.add(slitLeftSide, slitCenterBridge, slitRightSide, slitTopBar, slitBotBar, slitGlowA, slitGlowB);
  slitPlate.visible = false;
  opticalElementGroup.add(slitPlate);

  // Load High-Fidelity Goniometer Prism Stage GLB Model (no procedural duplicate prism)
  let goniometerGlbModel: THREE.Object3D | null = null;
  let goniometerRotateGroup: THREE.Group | null = null;
  loadSanitizedGlb('/assets/room-3/optics/goniometer_prism.glb', (model) => {
    model.name = 'GoniometerPrism_GLB';
    model.scale.setScalar(1.25);
    // Prism raw y = +0.035 -> scaled +0.04375 -> place at -0.04375 so prism midplane centers at OPTICS_BEAM_Y
    model.position.set(0, -0.04375, 0);
    // Group dial + Semicircular_Crown_Glass_Prism together so they rotate smoothly on stationary base
    const rotarySubGroup = new THREE.Group();
    rotarySubGroup.name = 'Goniometer_Rotary_Stage';
    const prismNode = model.getObjectByName('Semicircular_Crown_Glass_Prism');
    const stageRoot = model.getObjectByName('Rotary_Goniometer_Prism_Stage') || model;
    if (prismNode && prismNode.parent) {
      const parent = prismNode.parent;
      const toRotate = parent.children.filter((c) => c === prismNode || c.position.y > 0.005);
      parent.add(rotarySubGroup);
      toRotate.forEach((c) => rotarySubGroup.add(c));
      goniometerRotateGroup = rotarySubGroup;
      rotarySubGroup.rotation.y = (currentOptics.theta1 * Math.PI) / 180;
    }
    model.visible = currentOptics.subMode === 'refraction';
    goniometerGlbModel = model;
    opticalElementGroup.add(model);
    registerInteractable(model, {
      id: 'optics-angle-dial',
      stationId: 'optics',
      category: 'GONIOMETER',
      name: "Precision Snell's Law Goniometer Stage",
      description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-angle-dial'],
      action: 'Click / Scroll to Rotate Incident Angle θ₁',
      readout: `θ₁ = ${currentOptics.theta1.toFixed(1)}° · n₁ = ${currentOptics.n1.toFixed(2)} · n₂ = ${currentOptics.n2.toFixed(2)}`,
    });
  }, 'Goniometer Prism');

  railGroup.add(opticalElementGroup);

  // Observation Screen with Sliding Carriage & Dynamic Interference / Focus Display
  const screenGroup = new THREE.Group();
  screenGroup.position.set(1.0, OPTICS_BEAM_Y, 0);
  screenGroup.add(buildOpticsCarriage(OPTICS_BEAM_Y - OPTICS_RAIL_TOP_Y));

  // Load High-Fidelity Micrometric Diffraction Screen GLB Model
  // Panel raw center y = +0.14 -> scaled 1.2 = +0.168 -> offset -0.168 aligns face center at OPTICS_BEAM_Y
  loadSanitizedGlb('/assets/room-3/optics/diffraction_screen.glb', (model) => {
    model.name = 'DiffractionScreen_GLB';
    model.scale.setScalar(1.2);
    model.position.set(0, -0.168, 0);
    model.rotation.y = -Math.PI / 2;
    screenGroup.add(model);
    registerInteractable(model, {
      id: 'optics-screen',
      stationId: 'optics',
      category: 'OPTICAL DETECTOR',
      name: 'Translating Ground-Glass & Vernier Screen',
      description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-screen'],
      action: 'Click / Scroll to Slide Observation Screen Carriage',
      readout: `Screen Distance v = ${(currentOptics.screenPositionCm ?? 45.0).toFixed(1)} cm`,
    });
  }, 'Diffraction Screen');

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512;
  screenCanvas.height = 512;
  const screenCtx = screenCanvas.getContext('2d')!;
  const screenTexture = new THREE.CanvasTexture(screenCanvas);

  const screenSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(0.39, 0.30),
    new THREE.MeshStandardMaterial({
      map: screenTexture,
      emissive: 0xffffff,
      emissiveMap: screenTexture,
      emissiveIntensity: 0.55,
      roughness: 0.6,
    })
  );
  screenSurface.rotation.y = -Math.PI / 2;
  // Offset cleanly in front of GLB front face (-0.006m) to prevent any Z-fighting
  screenSurface.position.set(-0.0085, 0, 0);
  screenGroup.add(screenSurface);

  const updateOpticsBenchGeometry = () => {
    const optResult = calculateOptics(currentOptics);
    const laserHex = wavelengthToRGB(currentOptics.wavelength);
    beamMat.color.set(laserHex);
    secondaryBeamMat.color.set(laserHex);
    beamHaloMat.color.set(laserHex);
    slitGlowMat.color.set(laserHex);
    const powerOn = currentOptics.powerOn !== false;

    const isImaging = currentOptics.subMode === 'imaging';
    laserCarriageGroup.visible = !isImaging;
    if (goniometerGlbModel) goniometerGlbModel.visible = currentOptics.subMode === 'refraction';
    biconvexGroup.visible = isImaging;
    objectTargetGroup.visible = isImaging;
    slitPlate.visible = currentOptics.subMode === 'diffraction';
    slitGlowMat.opacity = powerOn ? 0.92 : 0.08;
    (targetArrowGlow.material as THREE.MeshBasicMaterial).color.set(powerOn ? 0xffffff : 0x334155);

    const CM_TO_RAIL = 0.009;
    let elemX = 0.0;
    let scrX = 1.0;

    if (isImaging) {
      const uCm = THREE.MathUtils.clamp(currentOptics.objectDistance, 25, 80);
      const vCm = THREE.MathUtils.clamp(currentOptics.screenPositionCm ?? 45.0, 15, 120);
      elemX = -0.82 + uCm * CM_TO_RAIL;
      scrX = Math.min(1.10, elemX + vCm * CM_TO_RAIL);
    } else if (currentOptics.subMode === 'diffraction') {
      elemX = -0.45;
      scrX = Math.min(1.08, Math.max(0.20, elemX + currentOptics.screenDistance * 0.72));
    } else {
      elemX = 0.0;
      scrX = 1.0;
      if (goniometerRotateGroup) {
        goniometerRotateGroup.rotation.y = (currentOptics.theta1 * Math.PI) / 180;
      }
    }

    opticalElementGroup.position.set(elemX, OPTICS_BEAM_Y, 0);
    screenGroup.position.set(scrX, OPTICS_BEAM_Y, 0);

    if (!powerOn) {
      laserBeam.visible = false;
      refractedBeam.visible = false;
      reflectedBeam.visible = false;
      upperMarginalRay.visible = false;
      lowerMarginalRay.visible = false;
      return;
    }

    if (isImaging) {
      laserBeam.visible = false;
      refractedBeam.visible = false;
      reflectedBeam.visible = false;

      const objTop = new THREE.Vector3(-0.82, OPTICS_BEAM_Y + 0.045, 0);
      const objBot = new THREE.Vector3(-0.82, OPTICS_BEAM_Y - 0.045, 0);
      const lensTop = new THREE.Vector3(elemX, OPTICS_BEAM_Y + 0.065, 0);
      const lensBot = new THREE.Vector3(elemX, OPTICS_BEAM_Y - 0.065, 0);

      // Compute slope to theoretical focus (inverted image), evaluated at actual scrX
      const focusX = elemX + Math.min(1.4, (optResult.imageDistanceCm ?? 40) * CM_TO_RAIL);
      const mag = Math.min(2.5, Math.max(-2.5, optResult.magnification ?? -1.0));
      const focusY = OPTICS_BEAM_Y + 0.045 * mag; // inverted below axis if real (mag < 0)
      const dxFocus = Math.max(0.05, focusX - elemX);
      const dxScreen = Math.max(0.05, scrX - elemX);

      const upperEndY = OPTICS_BEAM_Y + 0.065 + ((focusY - (OPTICS_BEAM_Y + 0.065)) / dxFocus) * dxScreen;
      const lowerEndY = OPTICS_BEAM_Y - 0.065 + ((focusY - (OPTICS_BEAM_Y - 0.065)) / dxFocus) * dxScreen;

      positionBeamBetween(laserBeam, objTop, lensTop);
      positionBeamBetween(refractedBeam, objBot, lensBot);
      positionBeamBetween(upperMarginalRay, lensTop, new THREE.Vector3(scrX - 0.012, THREE.MathUtils.clamp(upperEndY, OPTICS_BEAM_Y - 0.13, OPTICS_BEAM_Y + 0.13), 0));
      positionBeamBetween(lowerMarginalRay, lensBot, new THREE.Vector3(scrX - 0.012, THREE.MathUtils.clamp(lowerEndY, OPTICS_BEAM_Y - 0.13, OPTICS_BEAM_Y + 0.13), 0));
    } else if (currentOptics.subMode === 'refraction') {
      upperMarginalRay.visible = false;
      lowerMarginalRay.visible = false;
      const startPt = new THREE.Vector3(laserGlbBeamOriginX, OPTICS_BEAM_Y, 0);
      const midPt = new THREE.Vector3(elemX, OPTICS_BEAM_Y, 0);
      positionBeamBetween(laserBeam, startPt, midPt);

      if (optResult.isTIR || optResult.theta2Deg === null) {
        refractedBeam.visible = false;
        const tirAng = ((90 - currentOptics.theta1) * Math.PI) / 180;
        const tirEnd = new THREE.Vector3(
          elemX - Math.cos(tirAng) * 0.42,
          OPTICS_BEAM_Y,
          Math.sin(tirAng) * 0.36
        );
        positionBeamBetween(reflectedBeam, midPt, tirEnd);
      } else {
        reflectedBeam.visible = false;
        const devZ = THREE.MathUtils.clamp(Math.sin((optResult.theta2Deg * Math.PI) / 180) * 0.16, -0.16, 0.16);
        const endPt = new THREE.Vector3(scrX - 0.012, OPTICS_BEAM_Y, devZ);
        positionBeamBetween(refractedBeam, midPt, endPt);
      }
    } else {
      // Diffraction: level coaxial beam from laser aperture to slit plate + 0th and ±1st order beams
      positionBeamBetween(laserBeam, new THREE.Vector3(laserGlbBeamOriginX, OPTICS_BEAM_Y, 0), new THREE.Vector3(elemX, OPTICS_BEAM_Y, 0));
      positionBeamBetween(refractedBeam, new THREE.Vector3(elemX, OPTICS_BEAM_Y, 0), new THREE.Vector3(scrX - 0.012, OPTICS_BEAM_Y, 0));
      const orderOffset = Math.min(0.13, (optResult.fringeSpacingMm / 100) * 0.45);
      positionBeamBetween(upperMarginalRay, new THREE.Vector3(elemX, OPTICS_BEAM_Y, 0), new THREE.Vector3(scrX - 0.012, OPTICS_BEAM_Y + orderOffset, 0));
      positionBeamBetween(lowerMarginalRay, new THREE.Vector3(elemX, OPTICS_BEAM_Y, 0), new THREE.Vector3(scrX - 0.012, OPTICS_BEAM_Y - orderOffset, 0));
      reflectedBeam.visible = false;
    }
  };

  const updateScreenTexture = () => {
    const optResult = calculateOptics(currentOptics);
    screenCtx.save();
    screenCtx.filter = 'none';
    screenCtx.globalAlpha = 1.0;
    screenCtx.fillStyle = '#090e1a';
    screenCtx.fillRect(0, 0, 512, 512);
    const laserHex = wavelengthToRGB(currentOptics.wavelength);
    const powerOn = currentOptics.powerOn !== false;

    if (!powerOn) {
      screenCtx.fillStyle = '#475569';
      screenCtx.font = 'bold 24px monospace';
      screenCtx.textAlign = 'center';
      screenCtx.fillText('SOURCE OFF — CLICK LASER', 256, 248);
      screenCtx.font = '16px monospace';
      screenCtx.fillText('Toggle Laser Power to Begin', 256, 282);
      screenCtx.restore();
      screenTexture.needsUpdate = true;
      return;
    }

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
      screenCtx.fillStyle = '#e2e8f0';
      screenCtx.font = 'bold 20px monospace';
      screenCtx.fillText(`INTERFERENCE PATTERN · L=${currentOptics.screenDistance.toFixed(2)}m`, 22, 34);
    } else if (currentOptics.subMode === 'refraction') {
      // Ground-glass reticle + refracted beam spot
      screenCtx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
      screenCtx.lineWidth = 1;
      for (let g = 64; g < 512; g += 64) {
        screenCtx.beginPath();
        screenCtx.moveTo(g, 0);
        screenCtx.lineTo(g, 512);
        screenCtx.moveTo(0, g);
        screenCtx.lineTo(512, g);
        screenCtx.stroke();
      }
      if (optResult.isTIR || optResult.theta2Deg === null) {
        screenCtx.fillStyle = '#ef4444';
        screenCtx.font = 'bold 28px monospace';
        screenCtx.textAlign = 'center';
        screenCtx.fillText('TOTAL INTERNAL REFLECTION', 256, 240);
        screenCtx.font = '18px monospace';
        screenCtx.fillText(`No Transmitted Beam Beyond θc`, 256, 276);
      } else {
        const devZ = THREE.MathUtils.clamp(Math.sin((optResult.theta2Deg * Math.PI) / 180) * 0.16, -0.16, 0.16);
        const spotX = 256 + (devZ / 0.195) * 256;
        const spotY = 256;
        const grad = screenCtx.createRadialGradient(spotX, spotY, 2, spotX, spotY, 36);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, laserHex);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        screenCtx.fillStyle = grad;
        screenCtx.beginPath();
        screenCtx.arc(spotX, spotY, 36, 0, Math.PI * 2);
        screenCtx.fill();
      }
    } else {
      // Thin-Lens Imaging Mode: Draw faint reticle + blur-filtered optical arrow
      screenCtx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      screenCtx.lineWidth = 1;
      screenCtx.beginPath();
      screenCtx.moveTo(256, 0);
      screenCtx.lineTo(256, 512);
      screenCtx.moveTo(0, 256);
      screenCtx.lineTo(512, 256);
      screenCtx.stroke();

      const blurPx = optResult.defocusBlurPx;
      const sharpness = optResult.focusSharpness;
      const vCm = optResult.screenPositionCm;
      const magScale = Math.min(2.2, Math.max(0.35, Math.abs(optResult.magnification ?? 1.0)));

      screenCtx.save();
      try {
        screenCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
      } catch {
        // Fallback if canvas filter unavailable
      }
      screenCtx.translate(256, 256);
      const isInverted = (optResult.magnification ?? -1) < 0;
      const arrowLen = 85 * magScale;
      const dir = isInverted ? 1 : -1; // canvas +y is downward -> inverted points down
      screenCtx.strokeStyle = sharpness > 85 ? '#fef08a' : laserHex;
      screenCtx.fillStyle = sharpness > 85 ? '#fef08a' : laserHex;
      screenCtx.lineWidth = Math.max(4, 12 - (100 - sharpness) * 0.05);
      screenCtx.globalAlpha = Math.max(0.28, sharpness / 100);

      // Vertical glowing target arrow on ground glass
      screenCtx.beginPath();
      screenCtx.moveTo(0, -arrowLen * 0.35 * dir);
      screenCtx.lineTo(0, arrowLen * 0.75 * dir);
      screenCtx.stroke();

      screenCtx.beginPath();
      screenCtx.moveTo(0, arrowLen * 0.85 * dir);
      screenCtx.lineTo(-18 * magScale, arrowLen * 0.55 * dir);
      screenCtx.lineTo(18 * magScale, arrowLen * 0.55 * dir);
      screenCtx.closePath();
      screenCtx.fill();

      // Crossbar target ring
      screenCtx.lineWidth = 3;
      screenCtx.beginPath();
      screenCtx.arc(0, arrowLen * 0.2 * dir, 22 * magScale, 0, Math.PI * 2);
      screenCtx.stroke();
      screenCtx.restore();

      // Unblurred bezel / vernier telemetry strip on top & bottom
      screenCtx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      screenCtx.fillRect(0, 0, 512, 62);
      screenCtx.fillRect(0, 444, 512, 68);
      screenCtx.fillStyle = sharpness >= 85 ? '#34d399' : '#f59e0b';
      screenCtx.font = 'bold 22px monospace';
      screenCtx.fillText(`SCREEN VERNIER v = ${vCm.toFixed(1)} cm`, 20, 38);
      screenCtx.fillText(`FOCUS SHARPNESS: ${sharpness.toFixed(0)}%`, 20, 486);
    }

    screenCtx.restore();
    screenTexture.needsUpdate = true;
  };
  updateOpticsBenchGeometry();
  updateScreenTexture();

  railGroup.add(screenGroup);
  scene.add(railGroup);

  registerInteractable(laserHousing, {
    id: 'optics-laser',
    stationId: 'optics',
    category: 'LASER SOURCE',
    name: 'Tunable Diode Laser Emitter',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-laser'],
    action: 'Click to Toggle Laser Power / Scroll for λ',
    readout: `λ = ${currentOptics.wavelength} nm · Power: ${currentOptics.powerOn === false ? 'OFF' : 'ON'}`,
  });

  registerInteractable(biconvexGroup, {
    id: 'optics-lens-carrier',
    stationId: 'optics',
    category: 'THIN CONVEX LENS',
    name: 'Converging Lens Carriage (f = 20 cm)',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-lens-carrier'],
    action: 'Click / Scroll to Slide Object Distance u',
    readout: `u = ${currentOptics.objectDistance.toFixed(1)} cm · f = 20.0 cm`,
  });

  registerInteractable(slitPlate, {
    id: 'optics-submode-toggle',
    stationId: 'optics',
    category: 'DIFFRACTION GRATING',
    name: 'Precision Double-Slit Plate',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-submode-toggle'],
    action: 'Inspect Double-Slit Interference Plate',
    readout: `Slit Separation d = ${currentOptics.slitSeparation.toFixed(2)} mm`,
  });

  registerInteractable(targetPlate, {
    id: 'optics-object-target',
    stationId: 'optics',
    category: 'ILLUMINATED OBJECT',
    name: 'Collimated Object Reticle Carriage',
    description: 'Zero-point illuminated optical target at the graduated rail origin for thin-lens focusing.',
    action: 'Inspect Illuminated Optical Target',
    readout: `Object Distance u = ${currentOptics.objectDistance.toFixed(1)} cm`,
  });

  registerInteractable(screenSurface, {
    id: 'optics-screen',
    stationId: 'optics',
    category: 'OPTICAL DETECTOR',
    name: 'Translating Ground-Glass & Vernier Screen',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-screen'],
    action: 'Click / Scroll to Slide Screen Position v for Sharp Focus',
    readout: `v = ${(currentOptics.screenPositionCm ?? 45.0).toFixed(1)} cm · Focus: ${calculateOptics(currentOptics).focusSharpness.toFixed(0)}%`,
  });

  // -------------------------------------------------------------
  // 14. Station 03 3D Apparatus: Relativity Chamber (x = +6.0m)
  // -------------------------------------------------------------
  const relativityBenchX = STATION_X.relativity;

  const relativityGroup = new THREE.Group();
  // Grounded flush onto ESD mat (maglev_beamline.glb min.y = 0.000, reference_frame_display.glb min.y = 0.000)
  relativityGroup.position.set(relativityBenchX, BENCH_MAT_TOP_Y, 0);

  // Linear Maglev Vacuum Track Fallback
  const track = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.08, 0.45),
    material(0x1e293b, { metalness: 0.9, roughness: 0.2 })
  );
  track.position.y = 0.04;
  relativityGroup.add(track);

  registerInteractable(track, {
    id: 'relativity-accelerator',
    stationId: 'relativity',
    category: 'ACCELERATOR BEAMLINE',
    name: 'Relativistic Synchrotron Maglev Beamline',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-accelerator'] || 'Relativistic linear beam pipe demonstrating particle momentum p = γ m₀ v and Cherenkov emission.',
    action: 'Examine Synchrotron Beamline',
    readout: `Beamline: Synchrotron Quadrupole · Active β: ${(currentRelativity.beta).toFixed(3)}c`,
  });

  // Load High-Fidelity Maglev Beamline GLB Model (hide colliding static sled & narrow torus rings)
  loadSanitizedGlb('/assets/room-3/relativity/maglev_beamline.glb', (model) => {
    model.name = 'MaglevBeamline_GLB';
    model.scale.setScalar(1.0);
    model.position.set(0, 0, 0);
    model.traverse((obj) => {
      if (obj.name === 'Relativistic_Carrier_Sled_S_Prime') {
        obj.visible = false;
      } else if ((obj as THREE.Mesh).isMesh && Math.abs(obj.position.y - 0.16) < 0.025) {
        // Hide the 5 static r=0.135m torus coils inside the GLB so wide U-arch quadrupole magnets provide clearance
        obj.visible = false;
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
  }, 'Maglev Beamline');

  // Open U-Arch Superconducting Quadrupole Coils (wide 0.43m lateral & 0.56m overhead clearance over moving clock)
  const relativityCoilMats: THREE.MeshStandardMaterial[] = [];
  const archCryoMat = material(0x1e293b, { metalness: 0.85, roughness: 0.28 });
  const buildMaglevUArch = (qx: number) => {
    const coilGroup = new THREE.Group();
    coilGroup.position.set(qx, 0, 0);

    // Track-side bronze superconducting cryostat arch spanning Z ∈ [-0.225, +0.225], Y up to 0.56m
    const archCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.05, -0.225),
      new THREE.Vector3(0, 0.34, -0.225),
      new THREE.Vector3(0, 0.52, -0.175),
      new THREE.Vector3(0, 0.565, 0),
      new THREE.Vector3(0, 0.52, 0.175),
      new THREE.Vector3(0, 0.34, 0.225),
      new THREE.Vector3(0, 0.05, 0.225),
    ]);
    const coilMat = material(0xb45309, {
      metalness: 0.85,
      roughness: 0.28,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
    });
    relativityCoilMats.push(coilMat);
    const coilMesh = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 32, 0.019, 12, false), coilMat);
    coilMesh.castShadow = true;
    coilGroup.add(coilMesh);

    // Side anchor foot flanges on track base
    [-0.225, 0.225].forEach((sz) => {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.055, 0.055), archCryoMat);
      foot.position.set(0, 0.065, sz);
      coilGroup.add(foot);
    });

    relativityGroup.add(coilGroup);
  };
  [-1.0, -0.5, 0, 0.5, 1.0].forEach(buildMaglevUArch);

  // Moving Carrier Sled (Frame S'): Hovers 1.5cm above blue guide rails (rails top y = 0.10m)
  const sledGroup = new THREE.Group();
  sledGroup.position.set(0, 0.115, 0);

  const sledBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.032, 0.24),
    material(0x1e3a8a, { metalness: 0.78, roughness: 0.26 })
  );
  sledGroup.add(sledBody);

  const sledTrim = new THREE.Mesh(
    new THREE.BoxGeometry(0.70, 0.016, 0.256),
    material(0x38bdf8, { metalness: 0.75, roughness: 0.22, emissive: 0x0284c7, emissiveIntensity: 0.35 })
  );
  sledGroup.add(sledTrim);

  // Superconducting maglev air-gap glow runners beneath sled (-Z and +Z aligned to rails z=±0.14? trimmed to ±0.095)
  [-0.095, 0.095].forEach((rz) => {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.60, 0.008, 0.025),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 })
    );
    pad.position.set(0, -0.016, rz);
    sledGroup.add(pad);
  });

  // Calibrated Gold Contracting Meter-Rod (Demo B: Lorentz Length Contraction along X-axis)
  const rodCanvas = document.createElement('canvas');
  rodCanvas.width = 512;
  rodCanvas.height = 64;
  const rodCtx = rodCanvas.getContext('2d')!;
  rodCtx.fillStyle = '#d97706';
  rodCtx.fillRect(0, 0, 512, 64);
  rodCtx.fillStyle = '#0f172a';
  for (let i = 0; i <= 20; i++) {
    const x = 16 + (i / 20) * 480;
    const h = i % 5 === 0 ? 34 : 18;
    rodCtx.fillRect(x - 1.5, 0, 3, h);
    if (i % 5 === 0) {
      rodCtx.font = 'bold 18px monospace';
      rodCtx.textAlign = 'center';
      rodCtx.fillText(`${i * 0.5}`, x, 54);
    }
  }
  const meterRodTex = new THREE.CanvasTexture(rodCanvas);
  meterRodTex.colorSpace = THREE.SRGBColorSpace;

  const contractingRodGeo = new THREE.BoxGeometry(0.62, 0.032, 0.032);
  const contractingRodMat = material(0xf59e0b, { metalness: 0.65, roughness: 0.25, map: meterRodTex });
  const contractingRod = new THREE.Mesh(contractingRodGeo, contractingRodMat);
  contractingRod.position.set(0, 0.056, 0.078);
  const rodEndCapMat = material(0xdc2626, { roughness: 0.3, metalness: 0.3 });
  [-0.312, 0.312].forEach((cx) => {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.042, 0.042), rodEndCapMat);
    cap.position.x = cx;
    contractingRod.add(cap);
  });
  sledGroup.add(contractingRod);

  // Photon Pulse + Corona (Bounced exclusively inside Photon_Clock_GLB mirror cavity — no duplicate plates)
  const photonPulse = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  );
  photonPulse.position.set(0, 0.20, -0.045);
  const photonCorona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: nebulaTex,
      color: 0xfef08a,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  photonCorona.scale.set(0.12, 0.12, 1);
  photonPulse.add(photonCorona);
  sledGroup.add(photonPulse);

  // Open U-Portal Optical Simultaneity Detector Arches (x = ±0.35m, full overhead clearance above photon_clock.glb)
  const gateMat = material(0x38bdf8, { metalness: 0.8, roughness: 0.2 });
  const buildSimultaneityArch = (gx: number) => {
    const g = new THREE.Group();
    g.position.set(gx, 0, 0);
    [-0.21, 0.21].forEach((gz) => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.48, 14), gateMat);
      pillar.position.set(0, 0.295, gz);
      g.add(pillar);
    });
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.020, 0.44), gateMat);
    crossbar.position.set(0, 0.535, 0);
    g.add(crossbar);
    const beamCurtain = new THREE.Mesh(
      new THREE.PlaneGeometry(0.004, 0.44),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    beamCurtain.rotation.y = Math.PI / 2;
    beamCurtain.position.set(0, 0.30, 0);
    beamCurtain.userData.isCurtain = true;
    g.add(beamCurtain);
    relativityGroup.add(g);
  };
  buildSimultaneityArch(-0.35);
  buildSimultaneityArch(0.35);

  // Dynamic 3D Photon Spacetime Path Tracer
  const maxPathPoints = 64;
  const pathPositions = new Float32Array(maxPathPoints * 3);
  const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute('position', new THREE.BufferAttribute(pathPositions, 3));
  const pathMaterial = new THREE.LineBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.85,
    linewidth: 2,
  });
  const photonPathLine = new THREE.Line(pathGeometry, pathMaterial);
  relativityGroup.add(photonPathLine);

  let pathIndex = 0;
  let pathCount = 0;
  let clockBounceMinY = 0.058;
  let clockBounceMaxY = 0.357;
  let photonClockGlbObj: THREE.Object3D | null = null;
  let telemetryConsoleGlbObj: THREE.Object3D | null = null;

  // Load High-Fidelity Photon Clock GLB Model (sole photon-clock cavity on sled)
  loadSanitizedGlb('/assets/room-3/relativity/photon_clock.glb', (model) => {
    model.name = 'PhotonClock_GLB';
    model.scale.setScalar(0.85);
    model.position.set(0, 0.025, -0.045);
    photonClockGlbObj = model;
    sledGroup.add(model);
    sledGroup.updateMatrixWorld(true);

    // Measure internal mirror plates dynamically so photon bounces accurately mirror-to-mirror
    const meshMirrors: THREE.Box3[] = [];
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const b = new THREE.Box3().setFromObject(obj);
        const h = b.max.y - b.min.y;
        const w = b.max.x - b.min.x;
        // Thin horizontal cylindrical mirrors inside cavity (h < 0.025m, w < 0.10m vs wide base)
        if (h < 0.025 && w < 0.10) {
          meshMirrors.push(b);
        }
      }
    });
    if (meshMirrors.length >= 2) {
      meshMirrors.sort((a, b) => a.min.y - b.min.y);
      const localBotTop = meshMirrors[0].max.y - sledGroup.getWorldPosition(new THREE.Vector3()).y;
      const localTopBot = meshMirrors[meshMirrors.length - 1].min.y - sledGroup.getWorldPosition(new THREE.Vector3()).y;
      if (localTopBot > localBotTop + 0.15) {
        clockBounceMinY = localBotTop + 0.017;
        clockBounceMaxY = localTopBot - 0.017;
      }
    }

    registerInteractable(model, {
      id: 'relativity-light-clock',
      stationId: 'relativity',
      category: 'RELATIVISTIC CLOCK',
      name: 'Relativistic Photon Light-Clock Chamber',
      description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-light-clock'],
      action: 'Click to Toggle Observer Frame S ↔ S\'',
      readout: `Frame: ${(currentRelativity.referenceFrame ?? 'lab') === 'lab' ? 'Lab S' : 'Moving S\''} · γ = ${calculateRelativity(currentRelativity).gamma.toFixed(4)}`,
    });
  }, 'Photon Clock');

  relativityGroup.add(sledGroup);

  // Dual High-Contrast Telemetry Displays mapped directly onto reference_frame_display.glb panels
  const clockLabCanvas = document.createElement('canvas');
  clockLabCanvas.width = 512;
  clockLabCanvas.height = 512;
  const clockLabCtx = clockLabCanvas.getContext('2d')!;
  const clockLabTexture = new THREE.CanvasTexture(clockLabCanvas);
  clockLabTexture.colorSpace = THREE.SRGBColorSpace;

  const clockRestCanvas = document.createElement('canvas');
  clockRestCanvas.width = 512;
  clockRestCanvas.height = 512;
  const clockRestCtx = clockRestCanvas.getContext('2d')!;
  const clockRestTexture = new THREE.CanvasTexture(clockRestCanvas);
  clockRestTexture.colorSpace = THREE.SRGBColorSpace;

  // Load High-Fidelity Reference Frame Telemetry Console GLB Model (grounded at y = 0.0 -> 0.9324m)
  loadSanitizedGlb('/assets/room-3/relativity/reference_frame_display.glb', (model) => {
    model.name = 'ReferenceFrameDisplay_GLB';
    model.scale.setScalar(1.15);
    model.position.set(-0.65, 0, -0.40);
    telemetryConsoleGlbObj = model;
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        if (obj.name === 'Display_Frame_S_Lab') {
          (obj as THREE.Mesh).material = new THREE.MeshBasicMaterial({ map: clockLabTexture });
        } else if (obj.name === 'Display_Frame_SPrime_Moving') {
          (obj as THREE.Mesh).material = new THREE.MeshBasicMaterial({ map: clockRestTexture });
        }
      }
    });
    relativityGroup.add(model);
    registerInteractable(model, {
      id: 'relativity-telemetry-console',
      stationId: 'relativity',
      category: 'TELEMETRY CONSOLE',
      name: 'Reference Frame Telemetry Console (S vs S\')',
      description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-light-clock'],
      action: 'Click to Switch Inertial Reference Frame',
      readout: `Active Frame: ${(currentRelativity.referenceFrame ?? 'lab') === 'lab' ? 'Lab Frame S' : 'Sled Frame S\''}`,
    });
  }, 'Ref Frame Display');

  let photonY = 0.08;
  let photonDirection = 1;
  let sledX = 0;
  let sledDirection = 1;
  let labTime = 0;
  let gateFlashTimer = 0;

  const updateRelativityApparatus = (delta: number) => {
    const relResult = calculateRelativity(currentRelativity);
    const isLabFrame = (currentRelativity.referenceFrame ?? 'lab') === 'lab';
    const simSpeed = currentRelativity.simSpeed ?? 1.0;
    const isPlaying = currentRelativity.simPlaying !== false;

    // 1. Horizontal Sled Translation along maglev track
    if (isLabFrame && isPlaying && currentRelativity.beta > 0) {
      sledX += sledDirection * (currentRelativity.beta * simSpeed * 0.75) * delta;
      if (sledX > 0.75) {
        sledX = 0.75;
        sledDirection = -1;
      } else if (sledX < -0.75) {
        sledX = -0.75;
        sledDirection = 1;
      }
    } else if (!isLabFrame) {
      // In co-moving Rest Frame S', clock is stationary at center of reference frame
      sledX = 0;
    }
    sledGroup.position.x = sledX;

    // 2. Demonstration B: Length Contraction strictly along motion axis
    if (isLabFrame) {
      contractingRod.scale.x = Math.max(0.05, 1 / relResult.gamma);
    } else {
      contractingRod.scale.x = 1.0; // Proper length L0 in rest frame
    }

    // 3. Demonstration A: Photon Bouncing strictly between GLB mirrors
    // In lab frame, tick interval is dilated by gamma (light follows longer diagonal hypotenuse)
    const bounceSpeed = isPlaying
      ? 1.2 * (1 / relResult.gamma) * simSpeed
      : 0;
    photonY += photonDirection * bounceSpeed * delta;
    if (photonY > clockBounceMaxY) {
      photonY = clockBounceMaxY;
      photonDirection = -1;
    } else if (photonY < clockBounceMinY) {
      photonY = clockBounceMinY;
      photonDirection = 1;
    }
    photonPulse.position.y = photonY;

    // 4. Trace Photon World Path in 3D (Zigzag in Lab Frame, Vertical in Rest Frame)
    if (currentRelativity.showPhotonPath !== false && isPlaying) {
      const worldPos = new THREE.Vector3();
      photonPulse.getWorldPosition(worldPos);
      relativityGroup.worldToLocal(worldPos);

      pathPositions[pathIndex * 3 + 0] = worldPos.x;
      pathPositions[pathIndex * 3 + 1] = worldPos.y;
      pathPositions[pathIndex * 3 + 2] = worldPos.z;

      pathIndex = (pathIndex + 1) % maxPathPoints;
      pathCount = Math.min(maxPathPoints, pathCount + 1);
      pathGeometry.setDrawRange(0, pathCount);
      pathGeometry.attributes.position.needsUpdate = true;
    } else if (!isPlaying) {
      pathCount = 0;
      pathGeometry.setDrawRange(0, 0);
    }

    // 5. Simultaneity Gates Endpoint Measurement Visualizer
    if (Math.abs(sledX) < 0.05 && currentRelativity.showSimultaneityGates !== false) {
      gateFlashTimer = 0.15;
    }
    if (gateFlashTimer > 0) {
      gateFlashTimer -= delta;
      gateMat.emissive.setHex(0x38bdf8);
    } else {
      gateMat.emissive.setHex(0x000000);
    }

    const coilIntensity = isPlaying ? 0.5 + currentRelativity.beta * 2.2 : 0.25;
    relativityCoilMats.forEach((cm) => {
      cm.emissiveIntensity = coilIntensity;
    });

    // 6. Dual-Screen Scientific Digital Telemetry Display (Left: Frame S | Right: Frame S')
    labTime += delta * simSpeed;
    const bounceFrac = (photonY - clockBounceMinY) / Math.max(0.01, clockBounceMaxY - clockBounceMinY);

    // Left Screen: Laboratory Observer Frame S
    clockLabCtx.fillStyle = '#070b14';
    clockLabCtx.fillRect(0, 0, 512, 512);
    clockLabCtx.fillStyle = isLabFrame ? 'rgba(56, 189, 248, 0.28)' : 'rgba(56, 189, 248, 0.10)';
    clockLabCtx.fillRect(0, 0, 512, 58);
    clockLabCtx.strokeStyle = isLabFrame ? '#38bdf8' : '#1e293b';
    clockLabCtx.lineWidth = isLabFrame ? 6 : 2;
    clockLabCtx.strokeRect(3, 3, 506, 506);

    clockLabCtx.font = 'bold 26px monospace';
    clockLabCtx.fillStyle = '#38bdf8';
    clockLabCtx.fillText('FRAME S · LAB OBSERVER', 20, 38);
    clockLabCtx.font = 'bold 30px monospace';
    clockLabCtx.fillStyle = '#fef08a';
    clockLabCtx.fillText(`β = ${relResult.beta.toFixed(3)}c`, 20, 108);
    clockLabCtx.fillText(`γ = ${relResult.gamma.toFixed(4)}`, 270, 108);
    clockLabCtx.font = '20px monospace';
    clockLabCtx.fillStyle = '#94a3b8';
    clockLabCtx.fillText(`v = ${(relResult.speedMps / 1e6).toFixed(2)} × 10⁶ m/s`, 20, 146);

    clockLabCtx.font = 'bold 24px monospace';
    clockLabCtx.fillStyle = '#38bdf8';
    clockLabCtx.fillText(`Dilated Δt = ${relResult.dilatedTime.toFixed(3)} ns`, 20, 200);
    clockLabCtx.font = '19px monospace';
    clockLabCtx.fillStyle = '#cbd5e1';
    clockLabCtx.fillText(`(+${((relResult.gamma - 1) * 100).toFixed(1)}% Time Dilation)`, 20, 232);

    clockLabCtx.font = 'bold 24px monospace';
    clockLabCtx.fillStyle = '#facc15';
    clockLabCtx.fillText(`Contracted L = ${relResult.contractedLength.toFixed(3)} m`, 20, 286);
    clockLabCtx.font = '19px monospace';
    clockLabCtx.fillStyle = '#f59e0b';
    clockLabCtx.fillText(`(-${relResult.lengthContractionPercent.toFixed(1)}% Lorentz Length)`, 20, 318);

    // Mini Lab Diagonal Photon Diagram
    clockLabCtx.strokeStyle = '#334155';
    clockLabCtx.lineWidth = 2;
    clockLabCtx.strokeRect(20, 348, 472, 128);
    clockLabCtx.strokeStyle = '#facc15';
    clockLabCtx.lineWidth = 4;
    clockLabCtx.beginPath();
    clockLabCtx.moveTo(60, 456);
    clockLabCtx.lineTo(256, 368);
    clockLabCtx.lineTo(452, 456);
    clockLabCtx.stroke();
    clockLabCtx.fillStyle = '#38bdf8';
    clockLabCtx.beginPath();
    clockLabCtx.arc(60 + bounceFrac * 392, 456 - Math.sin(bounceFrac * Math.PI) * 88, 9, 0, Math.PI * 2);
    clockLabCtx.fill();

    clockLabTexture.needsUpdate = true;

    // Right Screen: Co-Moving Proper Rest Frame S'
    clockRestCtx.fillStyle = '#070b14';
    clockRestCtx.fillRect(0, 0, 512, 512);
    clockRestCtx.fillStyle = !isLabFrame ? 'rgba(168, 85, 247, 0.28)' : 'rgba(168, 85, 247, 0.10)';
    clockRestCtx.fillRect(0, 0, 512, 58);
    clockRestCtx.strokeStyle = !isLabFrame ? '#c084fc' : '#1e293b';
    clockRestCtx.lineWidth = !isLabFrame ? 6 : 2;
    clockRestCtx.strokeRect(3, 3, 506, 506);

    clockRestCtx.font = 'bold 26px monospace';
    clockRestCtx.fillStyle = '#c084fc';
    clockRestCtx.fillText("FRAME S' · REST FRAME", 20, 38);
    clockRestCtx.font = 'bold 30px monospace';
    clockRestCtx.fillStyle = '#34d399';
    clockRestCtx.fillText(`Proper Δτ = 6.671 ns`, 20, 108);
    clockRestCtx.fillStyle = '#f59e0b';
    clockRestCtx.fillText(`Proper L₀ = 10.00 m`, 20, 152);
    clockRestCtx.font = '20px monospace';
    clockRestCtx.fillStyle = '#cbd5e1';
    clockRestCtx.fillText(`Momentum Ratio: γ·β = ${(relResult.gamma * relResult.beta).toFixed(3)}`, 20, 208);
    clockRestCtx.fillText(`Clock Speed: ${(100 / relResult.gamma).toFixed(1)}% of c`, 20, 244);
    clockRestCtx.fillStyle = '#94a3b8';
    clockRestCtx.fillText(`Active View: ${isLabFrame ? 'LAB S' : "REST S'"} (Click Toggle)`, 20, 290);

    // Mini Vertical Bounce Rest-Frame Diagram
    clockRestCtx.strokeStyle = '#334155';
    clockRestCtx.lineWidth = 2;
    clockRestCtx.strokeRect(20, 348, 472, 128);
    clockRestCtx.strokeStyle = '#e2e8f0';
    clockRestCtx.lineWidth = 5;
    clockRestCtx.beginPath();
    clockRestCtx.moveTo(190, 366);
    clockRestCtx.lineTo(322, 366);
    clockRestCtx.moveTo(190, 458);
    clockRestCtx.lineTo(322, 458);
    clockRestCtx.stroke();
    clockRestCtx.strokeStyle = '#c084fc';
    clockRestCtx.lineWidth = 3;
    clockRestCtx.beginPath();
    clockRestCtx.moveTo(256, 368);
    clockRestCtx.lineTo(256, 456);
    clockRestCtx.stroke();
    clockRestCtx.fillStyle = '#facc15';
    clockRestCtx.beginPath();
    clockRestCtx.arc(256, 456 - bounceFrac * 88, 9, 0, Math.PI * 2);
    clockRestCtx.fill();

    clockRestTexture.needsUpdate = true;
  };
  updateRelativityApparatus(0);

  scene.add(relativityGroup);

  registerInteractable(contractingRod, {
    id: 'relativity-contracting-rod',
    stationId: 'relativity',
    category: 'LORENTZ KINEMATICS',
    name: 'Contracting Meter-Rod Interferometer (Demo B)',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-contracting-rod'],
    action: 'Observe Length Contraction L = L₀/γ',
    readout: `Proper Length L₀ = 10.00 m · Contracted L = ${calculateRelativity(currentRelativity).contractedLength.toFixed(3)} m`,
  });

  registerInteractable(sledBody, {
    id: 'relativity-velocity-dial',
    stationId: 'relativity',
    category: 'RELATIVISTIC SPEED',
    name: 'Relativistic Velocity Regulator Sled',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-velocity-dial'],
    action: 'Tune Frame Velocity β = v/c',
    readout: `β = ${currentRelativity.beta.toFixed(3)}c · Lorentz Factor γ = ${calculateRelativity(currentRelativity).gamma.toFixed(4)}`,
  });

  registerInteractable(photonPulse, {
    id: 'relativity-light-clock',
    stationId: 'relativity',
    category: 'CHRONOMETRY',
    name: 'Two-Mirror Photon Clock (Demo A)',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-light-clock'],
    action: 'Observe Time Dilation Δt = γ·Δτ',
    readout: `Proper Δτ = 6.671 ns · Dilated Δt = ${calculateRelativity(currentRelativity).dilatedTime.toFixed(3)} ns (γ = ${calculateRelativity(currentRelativity).gamma.toFixed(4)})`,
  });

  // -------------------------------------------------------------
  // 15. Guidance Marker Positioning Targets
  // -------------------------------------------------------------
  const guidanceBoxHelper = new THREE.Box3();
  const guidanceMeshBoxHelper = new THREE.Box3();
  const guidanceCenterHelper = new THREE.Vector3();

  const setFromObjectTopCenter = (
    obj: THREE.Object3D | null | undefined,
    out: THREE.Vector3,
    extraY = 0.01
  ): boolean => {
    if (!obj) return false;
    obj.updateWorldMatrix(true, true);
    guidanceBoxHelper.makeEmpty();
    const visitVisible = (node: THREE.Object3D) => {
      if (!node.visible) return;
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const isHiddenProxy = mat && mat.transparent && mat.opacity === 0;
        if (!isHiddenProxy && mesh.geometry) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          if (mesh.geometry.boundingBox && !mesh.geometry.boundingBox.isEmpty()) {
            guidanceMeshBoxHelper.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
            guidanceBoxHelper.union(guidanceMeshBoxHelper);
          }
        }
      }
      for (let i = 0; i < node.children.length; i++) {
        visitVisible(node.children[i]);
      }
    };
    visitVisible(obj);
    if (!guidanceBoxHelper.isEmpty()) {
      guidanceBoxHelper.getCenter(guidanceCenterHelper);
      out.set(guidanceCenterHelper.x, guidanceBoxHelper.max.y + extraY, guidanceCenterHelper.z);
      return true;
    }
    obj.getWorldPosition(out);
    out.y += extraY;
    return true;
  };

  const getGuidanceTargetPosition = (id: string, out: THREE.Vector3): boolean => {
    if (id.startsWith('circuits-terminal-')) {
      const termId = id.replace('circuits-terminal-', '') as TerminalId;
      const hitbox = multimeter3d.terminalHitboxes[termId];
      if (hitbox && setFromObjectTopCenter(hitbox, out, 0.004)) {
        return true;
      }
      const termPos = multimeter3d.terminalPositions[termId];
      if (termPos) {
        multimeter3d.root.localToWorld(out.copy(termPos));
        out.y += 0.01;
        return true;
      }
    }

    switch (id) {
      // --- Station 01: Circuits ---
      case 'circuits-placard':
        out.set(STATION_X.circuits, 3.40, ROOM2_CONFIG.room.backZ + 0.25);
        return true;
      case 'circuits-power-switch':
        if (setFromObjectTopCenter(psuSwitchAnchor, out, 0.012)) {
          return true;
        }
        return setFromObjectTopCenter(interactionToObjectMap.get('circuits-power-switch'), out, 0.012)
          || Boolean(out.set(circuitsBenchX - 0.64, 1.00, -0.28));
      case 'circuits-voltage-knob':
        if (psuVoltKnobMesh && setFromObjectTopCenter(psuVoltKnobMesh, out, 0.008)) return true;
        return setFromObjectTopCenter(interactionToObjectMap.get('circuits-voltage-knob'), out, 0.008)
          || Boolean(out.set(circuitsBenchX - 0.62, 1.08, -0.36));
      case 'circuits-multimeter':
      case 'circuits-dmm-dial':
        if (multimeter3d.rotaryDialMesh && setFromObjectTopCenter(multimeter3d.rotaryDialMesh, out, 0.008)) return true;
        return setFromObjectTopCenter(interactionToObjectMap.get('circuits-multimeter'), out, 0.012);
      case 'circuits-dmm-jack-v':
        if (multimeter3d.redLeadJackMesh && setFromObjectTopCenter(multimeter3d.redLeadJackMesh, out, 0.008)) return true;
        return false;
      case 'circuits-dmm-jack-ma':
        if (multimeter3d.maJackMesh && setFromObjectTopCenter(multimeter3d.maJackMesh, out, 0.008)) return true;
        return false;
      case 'circuits-dmm-jack-com':
        if (multimeter3d.comJackMesh && setFromObjectTopCenter(multimeter3d.comJackMesh, out, 0.008)) return true;
        return false;
      case 'circuits-dmm-jack': {
        const jackObj = multimeter3d.dmmState.redJack === 'ma_10a'
          ? multimeter3d.redLeadJackMesh
          : multimeter3d.maJackMesh;
        if (jackObj && setFromObjectTopCenter(jackObj, out, 0.008)) return true;
        return setFromObjectTopCenter(multimeter3d.comJackMesh, out, 0.008);
      }
      case 'circuits-probe-red':
        return setFromObjectTopCenter(multimeter3d.redProbeGroup, out, 0.01);
      case 'circuits-probe-black':
        return setFromObjectTopCenter(multimeter3d.blackProbeGroup, out, 0.01);
      case 'circuits-oscilloscope':
        if (setFromObjectTopCenter(interactionToObjectMap.get('circuits-oscilloscope'), out, 0.015)) return true;
        out.set(circuitsBenchX - 0.05, 1.20, -0.52);
        return true;
      case 'circuits-osc-time-knob':
        return setFromObjectTopCenter(oscTimeKnobMesh || interactionToObjectMap.get('circuits-osc-time-knob'), out, 0.008);
      case 'circuits-osc-ch1-knob':
        return setFromObjectTopCenter(oscCh1KnobMesh || interactionToObjectMap.get('circuits-osc-ch1-knob'), out, 0.008);
      case 'circuits-osc-ch2-knob':
        return setFromObjectTopCenter(oscCh2KnobMesh || interactionToObjectMap.get('circuits-osc-ch2-knob'), out, 0.008);
      case 'circuits-osc-trigger-knob':
        return setFromObjectTopCenter(oscTriggerKnobMesh || interactionToObjectMap.get('circuits-osc-trigger-knob'), out, 0.008);
      case 'circuits-osc-ch1-input':
        return setFromObjectTopCenter(oscCh1InputMesh || interactionToObjectMap.get('circuits-osc-ch1-input'), out, 0.008);
      case 'circuits-osc-ch2-input':
        return setFromObjectTopCenter(oscCh2InputMesh || interactionToObjectMap.get('circuits-osc-ch2-input'), out, 0.008);
      case 'circuits-topology-selector':
        return setFromObjectTopCenter(
          multimeter3d.terminalHitboxes['R2_A'] || interactionToObjectMap.get('circuits-topology-selector'),
          out,
          0.012
        );
      case 'circuits-probe-r1':
        return setFromObjectTopCenter(multimeter3d.terminalHitboxes['R1_A'], out, 0.008);
      case 'circuits-probe-r2':
        return setFromObjectTopCenter(multimeter3d.terminalHitboxes['R2_A'], out, 0.008);
      case 'circuits-probe-r3':
        return setFromObjectTopCenter(multimeter3d.terminalHitboxes['R3_A'], out, 0.008);
      case 'circuits-series-jumper':
        if (multimeter3d.circuitState.seriesJumperConnected && multimeter3d.seriesJumperMesh?.visible) {
          if (setFromObjectTopCenter(multimeter3d.seriesJumperMesh, out, 0.008)) return true;
        }
        return setFromObjectTopCenter(multimeter3d.terminalHitboxes['SERIES_JACK_A'] || multimeter3d.seriesJumperMesh, out, 0.008);
      case 'circuits-clipboard':
        if (setFromObjectTopCenter(interactionToObjectMap.get('circuits-clipboard'), out, 0.015)) return true;
        out.set(circuitsBenchX + 1.1, 1.05, 0.35);
        return true;

      // --- Station 02: Optics ---
      case 'optics-placard':
        out.set(STATION_X.optics, 3.40, ROOM2_CONFIG.room.backZ + 0.25);
        return true;
      case 'optics-laser':
        if (setFromObjectTopCenter(interactionToObjectMap.get('optics-laser'), out, 0.015)) return true;
        out.set(opticsBenchX - 0.96, 1.16, 0.0);
        return true;
      case 'optics-angle-dial':
      case 'optics-submode-toggle':
      case 'optics-lens-carrier':
        return setFromObjectTopCenter(opticalElementGroup, out, 0.015);
      case 'optics-rail':
        if (currentOptics.subMode === 'imaging') {
          return setFromObjectTopCenter(objectTargetGroup, out, 0.015);
        }
        return setFromObjectTopCenter(rail, out, 0.02);
      case 'optics-object-target':
        return setFromObjectTopCenter(objectTargetGroup, out, 0.015);
      case 'optics-screen':
        return setFromObjectTopCenter(screenGroup, out, 0.015);
      case 'optics-clipboard':
        if (setFromObjectTopCenter(interactionToObjectMap.get('optics-clipboard'), out, 0.015)) return true;
        out.set(opticsBenchX + 1.1, 1.05, 0.35);
        return true;

      // --- Station 03: Special Relativity ---
      case 'relativity-placard':
        out.set(STATION_X.relativity, 3.40, ROOM2_CONFIG.room.backZ + 0.25);
        return true;
      case 'relativity-velocity-dial':
      case 'relativity-telemetry-console':
        if (telemetryConsoleGlbObj && setFromObjectTopCenter(telemetryConsoleGlbObj, out, 0.015)) return true;
        if (setFromObjectTopCenter(interactionToObjectMap.get('relativity-telemetry-console'), out, 0.015)) return true;
        out.set(relativityBenchX - 0.65, 1.24, -0.40);
        return true;
      case 'relativity-contracting-rod':
        if (setFromObjectTopCenter(interactionToObjectMap.get('relativity-contracting-rod'), out, 0.015)) return true;
        out.set(relativityBenchX, 1.14, 0.12);
        return true;
      case 'relativity-light-clock':
        if (photonClockGlbObj && setFromObjectTopCenter(photonClockGlbObj, out, 0.015)) return true;
        if (setFromObjectTopCenter(interactionToObjectMap.get('relativity-light-clock'), out, 0.015)) return true;
        out.set(relativityBenchX, 1.32, -0.045);
        return true;
      case 'relativity-accelerator':
        if (setFromObjectTopCenter(interactionToObjectMap.get('relativity-accelerator'), out, 0.015)) return true;
        out.set(relativityBenchX + 0.6, 1.15, 0.0);
        return true;
      case 'relativity-clipboard':
        if (setFromObjectTopCenter(interactionToObjectMap.get('relativity-clipboard'), out, 0.015)) return true;
        out.set(relativityBenchX + 1.1, 1.05, 0.35);
        return true;

      // --- Hallway Exit Doors ---
      case 'campus-door':
        out.set(ROOM2_CONFIG.door.x, 2.20, ROOM2_CONFIG.room.backZ + 0.35);
        return true;

      default: {
        const mappedObj = interactionToObjectMap.get(id);
        if (mappedObj && setFromObjectTopCenter(mappedObj, out, 0.012)) {
          return true;
        }
        if (id.startsWith('circuits-')) {
          out.set(circuitsBenchX, 1.05, 0.0);
          return true;
        }
        if (id.startsWith('optics-')) {
          out.set(opticsBenchX, 1.08, 0.0);
          return true;
        }
        if (id.startsWith('relativity-')) {
          out.set(relativityBenchX, 1.08, 0.0);
          return true;
        }
        return false;
      }
    }
  };

  // -------------------------------------------------------------
  // 16. Collision Detection & Walking Bounds
  // -------------------------------------------------------------
  const checkCollision = (x: number, z: number) => {
    // Room perimeter boundary (allow stepping into the doorway cavity once door is open)
    if (x < -ROOM2_CONFIG.room.sideX + 1.1 || x > ROOM2_CONFIG.room.sideX - 1.1) return true;
    const inOpenDoorway =
      doorOpen &&
      Math.abs(x - ROOM2_CONFIG.door.x) < ROOM2_CONFIG.door.width / 2 - 0.35 &&
      z > ROOM2_CONFIG.door.z - 0.25;
    if (!inOpenDoorway && (z < ROOM2_CONFIG.room.backZ + 1.2 || z > frontZ - 1.2)) return true;

    // Bench Collisions (Station Benches at z = 0m, 3.4m wide x 1.76m deep)
    const benchesX = [STATION_X.circuits, STATION_X.optics, STATION_X.relativity];
    for (const bx of benchesX) {
      if (Math.abs(x - bx) < 1.95 && Math.abs(z) < 1.05) return true;
    }

    // South Credenza & Counters Collision
    if (z > frontZ - 1.6 && Math.abs(x) < 8.0) return true;

    // Perimeter Wall Cabinets, Safety Stations, Planters, Lab Stools & Utility Carts
    if (isCollidingWithDecor(x, z, decorResult.colliders)) return true;

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
      pos: new THREE.Vector3(STATION_X.circuits - 0.02, 1.54, 1.16),
      lookAt: new THREE.Vector3(STATION_X.circuits - 0.02, 0.98, -0.06),
    },
    optics: {
      pos: new THREE.Vector3(STATION_X.optics, 1.66, 1.92),
      lookAt: new THREE.Vector3(STATION_X.optics, 1.04, 0.0),
    },
    relativity: {
      pos: new THREE.Vector3(STATION_X.relativity, 1.70, 1.78),
      lookAt: new THREE.Vector3(STATION_X.relativity, 1.08, 0.0),
    },
  };

  const CIRCUITS_CLOSEUP_SUBVIEWS: Record<string, { pos: THREE.Vector3; lookAt: THREE.Vector3 }> = {
    station: {
      pos: new THREE.Vector3(STATION_X.circuits - 0.02, 1.54, 1.16),
      lookAt: new THREE.Vector3(STATION_X.circuits - 0.02, 0.98, -0.06),
    },
    board: {
      pos: new THREE.Vector3(STATION_X.circuits - 0.06, 1.34, 0.62),
      lookAt: new THREE.Vector3(STATION_X.circuits - 0.06, 0.96, 0.08),
    },
    multimeter: {
      pos: new THREE.Vector3(STATION_X.circuits + 0.28, 1.30, 0.58),
      lookAt: new THREE.Vector3(STATION_X.circuits + 0.28, 0.96, 0.08),
    },
    psu: {
      pos: new THREE.Vector3(STATION_X.circuits - 0.62, 1.28, 0.18),
      lookAt: new THREE.Vector3(STATION_X.circuits - 0.65, 1.02, -0.42),
    },
    oscilloscope: {
      pos: new THREE.Vector3(STATION_X.circuits - 0.05, 1.28, 0.12),
      lookAt: new THREE.Vector3(STATION_X.circuits - 0.05, 1.05, -0.52),
    },
  };

  const getOpticsCloseupSubview = (focus: Room3CloseupFocus): { pos: THREE.Vector3; lookAt: THREE.Vector3 } => {
    const elemWorldX = STATION_X.optics + opticalElementGroup.position.x;
    const scrWorldX = STATION_X.optics + screenGroup.position.x;
    if (focus === 'laser') {
      return {
        pos: new THREE.Vector3(STATION_X.optics - 0.85, 1.36, 0.82),
        lookAt: new THREE.Vector3(STATION_X.optics - 0.96, 1.08, 0.0),
      };
    }
    if (focus === 'lens') {
      return {
        pos: new THREE.Vector3(elemWorldX, 1.36, 0.78),
        lookAt: new THREE.Vector3(elemWorldX, 1.08, 0.0),
      };
    }
    if (focus === 'screen') {
      return {
        pos: new THREE.Vector3(scrWorldX - 0.56, 1.32, 0.48),
        lookAt: new THREE.Vector3(scrWorldX, 1.14, 0.0),
      };
    }
    return CLOSEUP_TARGETS.optics;
  };

  const RELATIVITY_CLOSEUP_SUBVIEWS: Record<string, { pos: THREE.Vector3; lookAt: THREE.Vector3 }> = {
    station: CLOSEUP_TARGETS.relativity,
    clock: {
      pos: new THREE.Vector3(STATION_X.relativity, 1.42, 0.84),
      lookAt: new THREE.Vector3(STATION_X.relativity, 1.14, -0.02),
    },
    rod: {
      pos: new THREE.Vector3(STATION_X.relativity + 0.05, 1.38, 0.82),
      lookAt: new THREE.Vector3(STATION_X.relativity, 1.08, 0.10),
    },
    console: {
      pos: new THREE.Vector3(STATION_X.relativity - 0.6, 1.42, 0.48),
      lookAt: new THREE.Vector3(STATION_X.relativity - 0.6, 1.18, -0.35),
    },
  };

  let currentCloseupFocus: Room3CloseupFocus = 'station';
  let labelsVisible = true;
  const baseCloseupCamPos = new THREE.Vector3().copy(CLOSEUP_TARGETS.circuits.pos);
  const baseCloseupCamLookAt = new THREE.Vector3().copy(CLOSEUP_TARGETS.circuits.lookAt);
  let closeupZoomFactor = 1.0;
  const closeupPanOffset = new THREE.Vector3();
  const closeupDeltaHelper = new THREE.Vector3();

  // Keep desktop horizontal FOV fixed (54° vert @ >=1.05 aspect) while widening
  // vertical FOV smoothly on narrow portrait phones so benches are never cropped.
  const syncResponsiveCameraFov = () => {
    const aspect = camera.aspect || 1;
    const targetFov = aspect < 1.05
      ? THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(0.45 / Math.max(aspect, 0.42))), 54, 86)
      : 54;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = targetFov;
    }
  };

  const getPortraitCloseupDistanceFactor = () => {
    const aspect = camera.aspect || 1;
    if (aspect >= 0.85) return 1.0;
    const narrowScale = THREE.MathUtils.clamp((0.85 - aspect) / 0.42, 0, 1);
    const focusWeight = currentCloseupFocus === 'station' ? 1.0 : 0.42;
    return 1.0 + narrowScale * 0.78 * focusWeight;
  };

  const recomputeCloseupCameraTargets = () => {
    targetCloseupCamLookAt.copy(baseCloseupCamLookAt).add(closeupPanOffset);
    closeupDeltaHelper.copy(baseCloseupCamPos).sub(baseCloseupCamLookAt);
    targetCloseupCamPos
      .copy(targetCloseupCamLookAt)
      .addScaledVector(closeupDeltaHelper, closeupZoomFactor * getPortraitCloseupDistanceFactor());
  };

  const zoomCloseup = (deltaFactor: number): number => {
    closeupZoomFactor = THREE.MathUtils.clamp(
      Math.round((closeupZoomFactor + deltaFactor) * 100) / 100,
      0.45,
      2.20
    );
    recomputeCloseupCameraTargets();
    callbacks.onCloseupZoomChange?.(closeupZoomFactor);
    return closeupZoomFactor;
  };

  const resetCloseupCamera = () => {
    closeupZoomFactor = 1.0;
    closeupPanOffset.set(0, 0, 0);
    recomputeCloseupCameraTargets();
    callbacks.onCloseupZoomChange?.(1.0);
  };

  const setCloseupFocus = (focus: Room3CloseupFocus) => {
    if (cameraMode !== 'closeup') return;
    currentCloseupFocus = focus;
    let t: { pos: THREE.Vector3; lookAt: THREE.Vector3 };
    if (activeStation === 'optics') {
      t = getOpticsCloseupSubview(focus);
    } else if (activeStation === 'relativity') {
      t = RELATIVITY_CLOSEUP_SUBVIEWS[focus] || RELATIVITY_CLOSEUP_SUBVIEWS.station;
    } else {
      t = CIRCUITS_CLOSEUP_SUBVIEWS[focus] || CIRCUITS_CLOSEUP_SUBVIEWS.station;
    }
    baseCloseupCamPos.copy(t.pos);
    baseCloseupCamLookAt.copy(t.lookAt);
    syncResponsiveCameraFov();
    camera.updateProjectionMatrix();
    closeupZoomFactor = 1.0;
    closeupPanOffset.set(0, 0, 0);
    recomputeCloseupCameraTargets();
    callbacks.onCloseupZoomChange?.(1.0);
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
      currentCloseupFocus = 'station';
      stationLight.color.setHex(STATION_COLOR[activeStation]);
      stationLight.position.x = STATION_X[activeStation];

      syncResponsiveCameraFov();
      camera.updateProjectionMatrix();
      const t = CLOSEUP_TARGETS[targetStation] || CLOSEUP_TARGETS.circuits;
      baseCloseupCamPos.copy(t.pos);
      baseCloseupCamLookAt.copy(t.lookAt);
      closeupZoomFactor = 1.0;
      closeupPanOffset.set(0, 0, 0);
      recomputeCloseupCameraTargets();
      callbacks.onCloseupZoomChange?.(1.0);

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

      // Third-person camera follow target behind the avatar (aligned with wider pullback)
      const charTargetY = character.activeCharacter === 'female' ? 1.40 : 1.48;
      camStartPos.copy(camera.position);
      camStartLookAt.copy(currentCamLookAt);
      camTargetPos.set(playerPosition.x + 0.28, charTargetY + 0.44, playerPosition.z + 2.90);
      camTargetLookAt.set(playerPosition.x, playerPosition.y - 0.1, playerPosition.z - 1.5);

      cameraTransitionState = 'exiting';
      transitionProgress = 0;
      cameraMode = 'walk';
      callbacks.onCameraModeChange?.('walk');
    }
  };

  // Floating 3D Callout Badges (Shown in Close-Up Mode; toggled via UI button)
  const calloutGroup = new THREE.Group();
  calloutGroup.name = 'EquipmentCalloutBadges';
  calloutGroup.visible = false;
  scene.add(calloutGroup);

  const createCalloutSprite = (title: string, subtitle: string): THREE.Sprite => {
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 420, 112);

      // Pill body (dark Room 03 maroon + antique gold border)
      ctx.fillStyle = 'rgba(26, 9, 15, 0.90)';
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.92)';
      ctx.lineWidth = 3;
      const r = 14;
      const w = 408;
      const h = 88;
      const x = 6;
      const y = 6;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Downward pointer notch
      ctx.fillStyle = 'rgba(212, 175, 55, 0.92)';
      ctx.beginPath();
      ctx.moveTo(200, 94);
      ctx.lineTo(220, 94);
      ctx.lineTo(210, 110);
      ctx.closePath();
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 23px system-ui, sans-serif';
      ctx.fillText(title, 210, 34);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText(subtitle, 210, 68);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 950;
    calloutGroup.add(sprite);
    return sprite;
  };

  type CalloutSpec = {
    station: Room3StationId;
    focuses: Room3CloseupFocus[];
    instrumentGroup?: string;
    isOverview?: boolean;
    guidanceIds?: string[];
    sprite: THREE.Sprite;
    offset?: [number, number, number];
    getTarget: (out: THREE.Vector3) => boolean;
  };

  const CALLOUT_SPECS: CalloutSpec[] = [
    // Circuits Station — Full Overview Badges (1 per instrument)
    {
      station: 'circuits',
      focuses: ['station'],
      instrumentGroup: 'psu',
      isOverview: true,
      sprite: createCalloutSprite('DC POWER SUPPLY', 'Click: Power & Voltage (0–24V)'),
      offset: [0, 0.055, 0],
      getTarget: (out) => setFromObjectTopCenter(psuGroup, out, 0.02),
    },
    {
      station: 'circuits',
      focuses: ['station'],
      instrumentGroup: 'oscilloscope',
      isOverview: true,
      sprite: createCalloutSprite('OSCILLOSCOPE', 'Click: Inspect Waveforms'),
      offset: [0, 0.05, 0],
      getTarget: (out) => setFromObjectTopCenter(oscCh1InputMesh || interactionToObjectMap.get('circuits-oscilloscope'), out, 0.02),
    },
    {
      station: 'circuits',
      focuses: ['station'],
      instrumentGroup: 'fgen',
      isOverview: true,
      sprite: createCalloutSprite('FUNCTION GENERATOR', 'Click: AC/DC & Freq Dial'),
      offset: [0, 0.04, 0],
      getTarget: (out) => setFromObjectTopCenter(fgenGroup, out, 0.02),
    },
    {
      station: 'circuits',
      focuses: ['station'],
      instrumentGroup: 'board',
      isOverview: true,
      sprite: createCalloutSprite('RESISTOR BREADBOARD', 'Click Socket: Place Lead'),
      offset: [0, 0.045, 0],
      getTarget: (out) => setFromObjectTopCenter(multimeter3d.terminalHitboxes['R2_A'], out, 0.02),
    },
    {
      station: 'circuits',
      focuses: ['station'],
      instrumentGroup: 'multimeter',
      isOverview: true,
      sprite: createCalloutSprite('DIGITAL MULTIMETER', 'Click: Mode Dial & Jacks'),
      offset: [0, 0.045, 0.02],
      getTarget: (out) => setFromObjectTopCenter(multimeter3d.rotaryDialMesh, out, 0.015),
    },

    // Circuits Station — Sub-Control Badges (Sub-view or active guided target)
    {
      station: 'circuits',
      focuses: ['psu'],
      instrumentGroup: 'psu',
      guidanceIds: ['circuits-power-switch'],
      sprite: createCalloutSprite('PSU POWER SWITCH', 'Click: Toggle ON/OFF'),
      offset: [-0.035, 0.04, 0.01],
      getTarget: (out) => setFromObjectTopCenter(psuSwitchAnchor, out, 0.02),
    },
    {
      station: 'circuits',
      focuses: ['psu'],
      instrumentGroup: 'psu',
      guidanceIds: ['circuits-voltage-knob'],
      sprite: createCalloutSprite('VOLTAGE DIAL', 'Click/Scroll: Tune Vs (0–30V)'),
      offset: [0.045, 0.025, 0.02],
      getTarget: (out) => setFromObjectTopCenter(psuVoltKnobMesh || interactionToObjectMap.get('circuits-voltage-knob'), out, 0.02),
    },
    {
      station: 'circuits',
      focuses: ['multimeter'],
      instrumentGroup: 'multimeter',
      guidanceIds: ['circuits-dmm-dial'],
      sprite: createCalloutSprite('DMM MODE DIAL', 'Click: V⎓ · V~ · A · Ω · CONT'),
      offset: [-0.025, 0.035, 0.02],
      getTarget: (out) => setFromObjectTopCenter(multimeter3d.rotaryDialMesh, out, 0.015),
    },
    {
      station: 'circuits',
      focuses: ['multimeter'],
      instrumentGroup: 'multimeter',
      guidanceIds: ['circuits-dmm-jack', 'circuits-probe-red', 'circuits-probe-black'],
      sprite: createCalloutSprite('INPUT JACKS', 'mA (Series) | COM | V·Ω'),
      offset: [0.025, 0.005, 0.06],
      getTarget: (out) => setFromObjectTopCenter(multimeter3d.comJackMesh, out, 0.015),
    },
    {
      station: 'circuits',
      focuses: ['board'],
      instrumentGroup: 'board',
      guidanceIds: ['circuits-series-jumper'],
      sprite: createCalloutSprite('SERIES JUMPER', 'Click: Open for Ammeter'),
      offset: [-0.02, 0.03, -0.01],
      getTarget: (out) => setFromObjectTopCenter(
        (multimeter3d.seriesJumperMesh?.visible ? multimeter3d.seriesJumperMesh : multimeter3d.terminalHitboxes['SERIES_JACK_A']),
        out,
        0.018
      ),
    },
    {
      station: 'circuits',
      focuses: ['oscilloscope'],
      instrumentGroup: 'oscilloscope',
      guidanceIds: ['circuits-osc-time-knob'],
      sprite: createCalloutSprite('SEC/DIV TIMEBASE', 'Click/Scroll: Sweep ms/div'),
      offset: [0, 0.02, 0],
      getTarget: (out) => setFromObjectTopCenter(oscTimeKnobMesh, out, 0.015),
    },
    {
      station: 'circuits',
      focuses: ['oscilloscope'],
      instrumentGroup: 'oscilloscope',
      guidanceIds: ['circuits-osc-ch1-knob'],
      sprite: createCalloutSprite('CH1 VOLTS/DIV', 'Click/Scroll: CH1 V Scale'),
      offset: [0, 0.02, 0],
      getTarget: (out) => setFromObjectTopCenter(oscCh1KnobMesh, out, 0.015),
    },
    {
      station: 'circuits',
      focuses: ['oscilloscope'],
      instrumentGroup: 'oscilloscope',
      guidanceIds: ['circuits-osc-ch2-knob'],
      sprite: createCalloutSprite('CH2 SCALE/DIV', 'Click/Scroll: CH2 mA Scale'),
      offset: [0, 0.045, 0],
      getTarget: (out) => setFromObjectTopCenter(oscCh2KnobMesh, out, 0.015),
    },
    {
      station: 'circuits',
      focuses: ['oscilloscope'],
      instrumentGroup: 'oscilloscope',
      guidanceIds: ['circuits-osc-trigger-knob'],
      sprite: createCalloutSprite('TRIGGER RUN/STOP', 'Click: Freeze Waveform'),
      offset: [0, 0.015, 0],
      getTarget: (out) => setFromObjectTopCenter(oscTriggerKnobMesh, out, 0.015),
    },
    {
      station: 'circuits',
      focuses: ['oscilloscope'],
      instrumentGroup: 'oscilloscope',
      guidanceIds: ['circuits-osc-ch1-input', 'circuits-osc-ch2-input'],
      sprite: createCalloutSprite('BNC INPUT JACKS', 'Click: Switch CH1/CH2 Node'),
      offset: [0, 0.025, 0.02],
      getTarget: (out) => setFromObjectTopCenter(oscCh1InputMesh || interactionToObjectMap.get('circuits-oscilloscope'), out, 0.02),
    },

    // Optics Station
    {
      station: 'optics',
      focuses: ['station', 'laser'],
      instrumentGroup: 'laser',
      isOverview: true,
      sprite: createCalloutSprite('DIODE LASER', 'Click: Power · Scroll: λ (nm)'),
      offset: [0, 0.035, 0],
      getTarget: (out) => setFromObjectTopCenter(interactionToObjectMap.get('optics-laser'), out, 0.02),
    },
    {
      station: 'optics',
      focuses: ['station', 'lens'],
      instrumentGroup: 'lens',
      isOverview: true,
      sprite: createCalloutSprite('LENS / PRISM CARRIAGE', 'Click/Scroll: Slide or θ₁'),
      offset: [0.03, 0.045, 0],
      getTarget: (out) => setFromObjectTopCenter(opticalElementGroup, out, 0.02),
    },
    {
      station: 'optics',
      focuses: ['lens'],
      instrumentGroup: 'lens',
      guidanceIds: ['optics-object-target', 'optics-rail'],
      sprite: createCalloutSprite('OBJECT TARGET', 'Click/Scroll: Step Distance u'),
      offset: [-0.04, 0.035, 0],
      getTarget: (out) => setFromObjectTopCenter(objectTargetGroup, out, 0.02),
    },
    {
      station: 'optics',
      focuses: ['station', 'screen'],
      instrumentGroup: 'screen',
      isOverview: true,
      sprite: createCalloutSprite('OBSERVATION SCREEN', 'Click/Scroll: Focus Image v'),
      offset: [0, 0.04, 0],
      getTarget: (out) => setFromObjectTopCenter(screenGroup, out, 0.02),
    },

    // Relativity Station
    {
      station: 'relativity',
      focuses: ['station', 'clock'],
      instrumentGroup: 'clock',
      isOverview: true,
      sprite: createCalloutSprite('PHOTON CLOCK', 'Click: Toggle Frame S / S\''),
      offset: [0, 0.04, 0],
      getTarget: (out) => setFromObjectTopCenter(photonClockGlbObj || interactionToObjectMap.get('relativity-light-clock'), out, 0.02),
    },
    {
      station: 'relativity',
      focuses: ['station', 'rod'],
      instrumentGroup: 'rod',
      isOverview: true,
      sprite: createCalloutSprite('CONTRACTING ROD', 'L = L₀/γ · Click: Play/Pause'),
      offset: [0, 0.04, 0],
      getTarget: (out) => setFromObjectTopCenter(interactionToObjectMap.get('relativity-contracting-rod'), out, 0.02),
    },
    {
      station: 'relativity',
      focuses: ['console', 'clock'],
      instrumentGroup: 'console',
      guidanceIds: ['relativity-velocity-dial', 'relativity-telemetry-console'],
      sprite: createCalloutSprite('VELOCITY DIAL (β)', 'Click/Scroll: Tune β = v/c'),
      offset: [0, 0.035, 0],
      getTarget: (out) => setFromObjectTopCenter(telemetryConsoleGlbObj || interactionToObjectMap.get('relativity-telemetry-console'), out, 0.02),
    },
    {
      station: 'relativity',
      focuses: ['station', 'console'],
      instrumentGroup: 'console',
      isOverview: true,
      sprite: createCalloutSprite('SYNCHROTRON TRACK', 'Click: Play/Pause · Scroll: β'),
      offset: [0, 0.045, 0],
      getTarget: (out) => setFromObjectTopCenter(interactionToObjectMap.get('relativity-accelerator'), out, 0.02),
    },
  ];

  const calloutPosHelper = new THREE.Vector3();
  const activeGuidedSubGroups = new Set<string>();
  const updateCalloutBadges = () => {
    const show = cameraMode === 'closeup' && labelsVisible;
    calloutGroup.visible = show;
    if (!show) return;

    activeGuidedSubGroups.clear();
    if (activeGuidanceId && currentCloseupFocus === 'station') {
      for (const spec of CALLOUT_SPECS) {
        if (
          spec.station === activeStation &&
          spec.instrumentGroup &&
          spec.guidanceIds?.includes(activeGuidanceId)
        ) {
          activeGuidedSubGroups.add(spec.instrumentGroup);
        }
      }
    }

    for (const spec of CALLOUT_SPECS) {
      if (spec.station !== activeStation) {
        spec.sprite.visible = false;
        continue;
      }

      const inFocus = spec.focuses.includes(currentCloseupFocus);
      const isGuidedSubControl = Boolean(
        currentCloseupFocus === 'station' &&
          activeGuidanceId &&
          spec.guidanceIds?.includes(activeGuidanceId)
      );
      const suppressedByGuidedSub = Boolean(
        currentCloseupFocus === 'station' &&
          spec.isOverview &&
          spec.instrumentGroup &&
          activeGuidedSubGroups.has(spec.instrumentGroup)
      );

      const active = (inFocus || isGuidedSubControl) && !suppressedByGuidedSub;
      if (!active || !spec.getTarget(calloutPosHelper)) {
        spec.sprite.visible = false;
        continue;
      }
      spec.sprite.visible = true;
      if (spec.offset) {
        calloutPosHelper.x += spec.offset[0];
        calloutPosHelper.y += spec.offset[1];
        calloutPosHelper.z += spec.offset[2];
      }
      if (activeGuidanceId && guidanceMarker.visible && calloutPosHelper.distanceTo(guidancePosition) < 0.10) {
        calloutPosHelper.y += 0.075;
      }
      spec.sprite.position.copy(calloutPosHelper);
      const dist = camera.position.distanceTo(calloutPosHelper);
      const isCompactHeight = window.innerHeight <= 540;
      const badgeW = isCompactHeight
        ? THREE.MathUtils.clamp(dist * 0.105, 0.055, 0.145)
        : THREE.MathUtils.clamp(dist * 0.145, 0.075, 0.22);
      spec.sprite.scale.set(badgeW, badgeW * (112 / 420), 1);
    }
  };

  const mouseScreenPos = new THREE.Vector2();
  let mouseActive = false;

  const VOLT_CYCLE_STEPS = [2, 4, 6, 8, 10, 12, 16, 20, 24];

  const triggerEquipmentAction = (interactionId: string) => {
    callbacks.onEquipmentInteract?.(interactionId);

    if (interactionId === 'circuits-voltage-knob') {
      const curVs = currentCircuits.vs;
      let nextVs = 24;
      if (curVs >= 0.5) {
        const nextIdx = VOLT_CYCLE_STEPS.findIndex((v) => v > curVs + 0.1);
        nextVs = nextIdx !== -1 ? VOLT_CYCLE_STEPS[nextIdx] : VOLT_CYCLE_STEPS[0];
      }
      currentCircuits.vs = nextVs;
      updatePsuKnobRotation(nextVs);
      updatePsuTexture(nextVs, currentCircuits.freq, currentCircuits.mode === 'ac', currentCircuits.powerOn !== false);
      updateFgenDisplay();
      multimeter3d.updateCircuitParameters({ sourceVoltage: nextVs });
      callbacks.onCircuitsChange?.({ vs: nextVs });
      playTone(480 + (nextVs / 24) * 200, 'sine', 0.05, 0.15);
      return;
    }

    if (interactionId === 'circuits-power-switch' || interactionId === 'circuits-function-generator') {
      const nextPower = currentCircuits.powerOn === false ? true : false;
      currentCircuits.powerOn = nextPower;
      updatePsuTexture(currentCircuits.vs, currentCircuits.freq, currentCircuits.mode === 'ac', nextPower);
      updateFgenDisplay();
      multimeter3d.updateCircuitParameters({ powerOn: nextPower });
      callbacks.onCircuitsChange?.({ powerOn: nextPower });
      playTone(nextPower ? 880 : 330, 'square', 0.06, 0.2);
      if (cameraMode !== 'closeup') {
        setCameraMode('closeup', 'circuits');
      }
      return;
    }

    if (interactionId === 'circuits-fgen-freq-knob') {
      const FGEN_STEPS = [10, 60, 120, 250, 500, 1000];
      const nextIdx = FGEN_STEPS.findIndex((f) => f > currentCircuits.freq + 1);
      const nextFreq = nextIdx !== -1 ? FGEN_STEPS[nextIdx] : FGEN_STEPS[0];
      currentCircuits.freq = nextFreq;
      updateFgenDisplay();
      updatePsuTexture(currentCircuits.vs, nextFreq, currentCircuits.mode === 'ac', currentCircuits.powerOn !== false);
      multimeter3d.updateCircuitParameters({ frequency: nextFreq });
      callbacks.onCircuitsChange?.({ freq: nextFreq });
      playTone(400 + (nextFreq / 1000) * 320, 'sine', 0.04, 0.12);
      return;
    }

    if (interactionId === 'circuits-fgen-mode-btn') {
      const nextMode = currentCircuits.mode === 'ac' ? 'dc' : 'ac';
      currentCircuits.mode = nextMode;
      updateFgenDisplay();
      updatePsuTexture(currentCircuits.vs, currentCircuits.freq, nextMode === 'ac', currentCircuits.powerOn !== false);
      multimeter3d.updateCircuitParameters({ mode: nextMode });
      callbacks.onCircuitsChange?.({ mode: nextMode });
      playTone(nextMode === 'ac' ? 760 : 480, 'triangle', 0.05, 0.14);
      return;
    }

    if (interactionId === 'circuits-oscilloscope') {
      setCameraMode('closeup', 'circuits');
      setCloseupFocus('oscilloscope');
      return;
    }

    if (interactionId === 'circuits-osc-time-knob') {
      const curIdx = TIME_DIV_OPTIONS.indexOf(currentOscilloscope.timePerDivMs);
      const nextIdx = (curIdx + 1) % TIME_DIV_OPTIONS.length;
      const nextTime = TIME_DIV_OPTIONS[nextIdx];
      currentOscilloscope.timePerDivMs = nextTime;
      updateOscKnobRotations();
      callbacks.onOscilloscopeChange?.({ timePerDivMs: nextTime });
      playTone(520, 'triangle', 0.04, 0.12);
      return;
    }

    if (interactionId === 'circuits-osc-ch1-knob') {
      const curIdx = CH1_VOLTS_DIV_OPTIONS.indexOf(currentOscilloscope.ch1VoltsPerDiv);
      const nextIdx = (curIdx + 1) % CH1_VOLTS_DIV_OPTIONS.length;
      const nextVal = CH1_VOLTS_DIV_OPTIONS[nextIdx];
      currentOscilloscope.ch1VoltsPerDiv = nextVal;
      updateOscKnobRotations();
      callbacks.onOscilloscopeChange?.({ ch1VoltsPerDiv: nextVal });
      playTone(580, 'triangle', 0.04, 0.12);
      return;
    }

    if (interactionId === 'circuits-osc-ch2-knob') {
      const curIdx = CH2_VOLTS_DIV_OPTIONS.indexOf(currentOscilloscope.ch2VoltsPerDiv);
      const nextIdx = (curIdx + 1) % CH2_VOLTS_DIV_OPTIONS.length;
      const nextVal = CH2_VOLTS_DIV_OPTIONS[nextIdx];
      currentOscilloscope.ch2VoltsPerDiv = nextVal;
      updateOscKnobRotations();
      callbacks.onOscilloscopeChange?.({ ch2VoltsPerDiv: nextVal });
      playTone(640, 'triangle', 0.04, 0.12);
      return;
    }

    if (interactionId === 'circuits-osc-trigger-knob') {
      const nextRunState = currentOscilloscope.runState === 'run' ? 'stop' : 'run';
      currentOscilloscope.runState = nextRunState;
      updateOscKnobRotations();
      callbacks.onOscilloscopeChange?.({ runState: nextRunState });
      playTone(nextRunState === 'run' ? 700 : 440, 'square', 0.05, 0.15);
      return;
    }

    const CH1_SOURCES: OscilloscopeChannelSource[] = ['vs', 'r1', 'r2', 'r3'];
    if (interactionId === 'circuits-osc-ch1-input') {
      const curIdx = CH1_SOURCES.indexOf(currentOscilloscope.ch1Source);
      const nextIdx = (curIdx + 1) % CH1_SOURCES.length;
      const nextSource = CH1_SOURCES[nextIdx];
      currentOscilloscope.ch1Source = nextSource;
      callbacks.onOscilloscopeChange?.({ ch1Source: nextSource });
      playTone(660, 'sine', 0.05, 0.12);
      return;
    }

    const CH2_SOURCES: ('current' | 'r1' | 'r2' | 'r3')[] = ['current', 'r1', 'r2', 'r3'];
    if (interactionId === 'circuits-osc-ch2-input') {
      const curIdx = CH2_SOURCES.indexOf(currentOscilloscope.ch2Source);
      const nextIdx = (curIdx + 1) % CH2_SOURCES.length;
      const nextSource = CH2_SOURCES[nextIdx];
      currentOscilloscope.ch2Source = nextSource;
      callbacks.onOscilloscopeChange?.({ ch2Source: nextSource });
      playTone(720, 'sine', 0.05, 0.12);
      return;
    }

    if (cameraMode === 'closeup') {
      if (interactionId === 'optics-laser') {
        const nextPower = currentOptics.powerOn === false ? true : false;
        currentOptics.powerOn = nextPower;
        updateOpticsBenchGeometry();
        updateScreenTexture();
        callbacks.onOpticsChange?.({ powerOn: nextPower });
        playTone(nextPower ? 860 : 340, 'sine', 0.05, 0.14);
        return;
      }
      if (interactionId === 'optics-angle-dial' || interactionId === 'optics-lens-carrier') {
        if (currentOptics.subMode !== 'imaging') {
          currentOptics.subMode = 'imaging';
          currentOptics.focalLength = 20.0;
          updateOpticsBenchGeometry();
          updateScreenTexture();
          callbacks.onOpticsChange?.({ subMode: 'imaging', focalLength: 20.0 });
          playTone(620, 'triangle', 0.05, 0.12);
          return;
        }
        if (interactionId === 'optics-angle-dial') {
          const nextTheta = currentOptics.theta1 + 5 > 80 ? 0 : Math.round(currentOptics.theta1 + 5);
          currentOptics.theta1 = nextTheta;
          updateOpticsBenchGeometry();
          updateScreenTexture();
          callbacks.onOpticsChange?.({ theta1: nextTheta });
          playTone(540, 'triangle', 0.04, 0.1);
          return;
        }
      }
      if (
        interactionId === 'optics-lens-carrier' ||
        interactionId === 'optics-object-target' ||
        (interactionId === 'optics-rail' && currentOptics.subMode === 'imaging')
      ) {
        const nextU = currentOptics.objectDistance + 5 > 75 ? 25 : Math.round(currentOptics.objectDistance + 5);
        currentOptics.objectDistance = nextU;
        updateOpticsBenchGeometry();
        updateScreenTexture();
        callbacks.onOpticsChange?.({ objectDistance: nextU });
        playTone(620, 'sine', 0.04, 0.1);
        return;
      }
      if (interactionId === 'optics-rail') {
        playTone(540, 'sine', 0.04, 0.08);
        return;
      }
      if (interactionId === 'optics-screen') {
        const curV = currentOptics.screenPositionCm ?? 45.0;
        const nextV = curV + 2.5 > 100 ? 20 : Math.round((curV + 2.5) * 10) / 10;
        currentOptics.screenPositionCm = nextV;
        updateOpticsBenchGeometry();
        updateScreenTexture();
        callbacks.onOpticsChange?.({ screenPositionCm: nextV });
        playTone(720, 'sine', 0.04, 0.1);
        return;
      }
      if (interactionId === 'relativity-light-clock' || interactionId === 'relativity-telemetry-console') {
        const nextFrame = (currentRelativity.referenceFrame ?? 'lab') === 'lab' ? 'rest' : 'lab';
        currentRelativity.referenceFrame = nextFrame;
        callbacks.onRelativityChange?.({ referenceFrame: nextFrame });
        playTone(nextFrame === 'lab' ? 680 : 520, 'triangle', 0.05, 0.14);
        return;
      }
      if (interactionId === 'relativity-velocity-dial') {
        const nextBeta = currentRelativity.beta + 0.05 > 0.95 ? 0.05 : Math.round((currentRelativity.beta + 0.05) * 100) / 100;
        currentRelativity.beta = nextBeta;
        callbacks.onRelativityChange?.({ beta: nextBeta });
        playTone(500 + nextBeta * 360, 'sine', 0.04, 0.12);
        return;
      }
      if (interactionId === 'relativity-contracting-rod' || interactionId === 'relativity-accelerator') {
        const nextPlay = currentRelativity.simPlaying === false ? true : false;
        currentRelativity.simPlaying = nextPlay;
        callbacks.onRelativityChange?.({ simPlaying: nextPlay });
        playTone(nextPlay ? 780 : 400, 'square', 0.04, 0.1);
        return;
      }
    }

    if (['circuits-multimeter', 'circuits-topology-selector'].includes(interactionId)) {
      setCameraMode('closeup', 'circuits');
    } else if (['optics-laser', 'optics-angle-dial', 'optics-submode-toggle', 'optics-screen', 'optics-lens-carrier', 'optics-rail', 'optics-object-target'].includes(interactionId)) {
      setCameraMode('closeup', 'optics');
    } else if (['relativity-velocity-dial', 'relativity-contracting-rod', 'relativity-light-clock', 'relativity-telemetry-console', 'relativity-accelerator'].includes(interactionId)) {
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
        const maxDist = (inter.id.includes('placard') || inter.id.includes('honor-roll') || inter.id === 'physics-whiteboard' || inter.id === 'campus-door') ? 14.0 : 8.5;
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

  const getTapSampleOffsets = (isTouchTap: boolean): ReadonlyArray<readonly [number, number]> => {
    if (!isTouchTap) return [[0, 0]];
    const offsets: Array<readonly [number, number]> = [[0, 0]];
    for (const r of [12, 20]) {
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        offsets.push([Math.round(Math.cos(ang) * r), Math.round(Math.sin(ang) * r)]);
      }
    }
    return offsets;
  };

  const interactAtScreenPoint = (clientX: number, clientY: number, isTouchTap = false): boolean => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (const [ox, oy] of getTapSampleOffsets(isTouchTap)) {
      const pointer = new THREE.Vector2(
        ((clientX + ox - rect.left) / rect.width) * 2 - 1,
        -((clientY + oy - rect.top) / rect.height) * 2 + 1,
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
          const maxDist = (inter.id.includes('placard') || inter.id.includes('honor-roll') || inter.id === 'physics-whiteboard' || inter.id === 'campus-door') ? 14.0 : 8.5;
          if (hit.distance <= maxDist) {
            triggerEquipmentAction(inter.id);
            return true;
          }
        }
      }
    }
    return false;
  };

  const requestPointerLock = () => {
    if (cameraMode !== 'walk' || isMobileTouchDevice()) return;
    try {
      const lockReq = renderer.domElement.requestPointerLock?.();
      if (lockReq && typeof (lockReq as Promise<void>).catch === 'function') {
        void (lockReq as Promise<void>).catch(() => callbacks.onPointerLockChange?.(false));
      }
    } catch {
      // browser may refuse pointer lock before user gesture
    }
  };

  let isCloseupPanning = false;
  let closeupPanPointerId: number | null = null;
  let lookPointerId: number | null = null;
  const activeCanvasTouches = new Map<number, { x: number; y: number }>();
  let lastPinchDist: number | null = null;
  let isPinching = false;
  let lastTouchUpTime = 0;
  let closeupDragTravel = 0;
  let prevCloseupX = 0;
  let prevCloseupY = 0;
  const closeupPanRight = new THREE.Vector3();
  const closeupPanUp = new THREE.Vector3();

  const triggerCloseupAtClientPoint = (clientX: number, clientY: number, isTouchTap = false) => {
    if (!renderer.domElement) return;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    for (const [ox, oy] of getTapSampleOffsets(isTouchTap)) {
      const sx = clientX + ox;
      const sy = clientY + oy;
      const tapPointer = new THREE.Vector2(
        ((sx - rect.left) / rect.width) * 2 - 1,
        -((sy - rect.top) / rect.height) * 2 + 1
      );

      if (activeStation === 'circuits') {
        raycaster.setFromCamera(tapPointer, camera);
        const hits = raycaster.intersectObjects(multimeter3d.interactableMeshes, true);
        if (hits.length > 0) {
          callbacks.onCloseupHover?.(formatMultimeterMeshTooltip(hits[0].object));
        }
        if (handleCloseupProbePlacement(sx, sy)) {
          return;
        }
      }

      const inter = findInteractableHit(tapPointer);
      if (inter) {
        callbacks.onCloseupHover?.(getCloseupTooltip(inter));
        triggerEquipmentAction(inter.id);
        playTone(550, 'triangle', 0.06, 0.16);
        return;
      }
    }
    callbacks.onCloseupHover?.(null);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.target !== renderer.domElement) return;

    if (e.pointerType === 'touch') {
      activeCanvasTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeCanvasTouches.size >= 2) {
        const pts = Array.from(activeCanvasTouches.values());
        lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        isPinching = true;
        isCloseupPanning = false;
        closeupPanPointerId = null;
        closeupDragTravel = 999;
        isPointerDown = false;
        lookPointerId = null;
        dragTravel = 999;
        return;
      }
      if (cameraMode === 'closeup') {
        isPinching = false;
        lastPinchDist = null;
        isCloseupPanning = true;
        closeupPanPointerId = e.pointerId;
        closeupDragTravel = 0;
        prevCloseupX = e.clientX;
        prevCloseupY = e.clientY;
        try {
          renderer.domElement.setPointerCapture(e.pointerId);
        } catch {}
        return;
      }

      if (lookPointerId !== null && lookPointerId !== e.pointerId) return;
      isPinching = false;
      lastPinchDist = null;
      lookPointerId = e.pointerId;
      isPointerDown = true;
      dragTravel = 0;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {}
      return;
    }

    if (cameraMode === 'closeup') {
      isCloseupPanning = true;
      closeupPanPointerId = e.pointerId;
      closeupDragTravel = 0;
      prevCloseupX = e.clientX;
      prevCloseupY = e.clientY;
      return;
    }

    isPointerDown = true;
    lookPointerId = e.pointerId;
    dragTravel = 0;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;

    if (document.pointerLockElement !== renderer.domElement) {
      if (e.button === 0) {
        if (!interactAtScreenPoint(e.clientX, e.clientY) && !isMobileTouchDevice()) {
          requestPointerLock();
        }
      }
      return;
    }

    if (e.button === 0) {
      interact();
    }
  };

  const findInteractableHit = (pointer: THREE.Vector2): EquipmentInteraction | null => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactableObjects, true);
    for (const hit of hits) {
      if (!isObjectVisibleInChain(hit.object)) continue;
      let currentObj: THREE.Object3D | null = hit.object;
      let inter: EquipmentInteraction | undefined = undefined;
      while (currentObj && !inter) {
        inter = objectToInteractionMap.get(currentObj) || currentObj.userData.equipmentInteraction;
        currentObj = currentObj.parent;
      }
      if (inter) {
        if (cameraMode === 'closeup') {
          if (
            hit.distance > 3.5 ||
            inter.stationId !== activeStation ||
            inter.id.includes('placard') ||
            inter.id.includes('clipboard')
          ) {
            continue;
          }
        }
        return inter;
      }
    }
    return null;
  };

  const getCloseupTooltip = (inter: EquipmentInteraction): string => {
    const circ = calculateCircuit(currentCircuits);
    if (inter.id === 'circuits-power-switch' || inter.id === 'circuits-function-generator') {
      const pwr = currentCircuits.powerOn !== false;
      return `${inter.id === 'circuits-function-generator' ? 'Rigol Function Gen / Master Power' : 'PSU Main Power Switch'} | Energizes or isolates the circuit power rail safely before rewiring. | Output: ${pwr ? 'ON (ENERGIZED)' : 'OFF (ISOLATED)'} · ${currentCircuits.vs.toFixed(1)} V | Click: Toggle Power ON/OFF`;
    }
    if (inter.id === 'circuits-fgen-freq-knob') {
      return `Function Generator Frequency Dial | Sets AC excitation frequency (10–1000 Hz) driving capacitive Xc & inductive XL reactance. | Freq: ${currentCircuits.freq.toFixed(0)} Hz · Mode: ${currentCircuits.mode.toUpperCase()} | Click: Step Hz · Scroll: ±10 Hz`;
    }
    if (inter.id === 'circuits-fgen-mode-btn') {
      return `Function Generator AC / DC Selector | Toggles circuit excitation between DC constant bias and sinusoidal AC sweep. | Active Mode: ${currentCircuits.mode === 'ac' ? 'AC SINE ~' : 'DC CONSTANT'} | Click: Switch AC / DC`;
    }
    if (inter.id === 'circuits-voltage-knob') {
      return `PSU Voltage Regulator Knob | Sets regulated source EMF (Vs) driving current around the circuit. | Setting: ${currentCircuits.vs.toFixed(1)} V (I = ${(circ.current * 1000).toFixed(1)} mA) | Click: Step V · Scroll: ±0.5 V`;
    }
    if (inter.id === 'circuits-oscilloscope') {
      return `Tektronix Dual-Channel Oscilloscope | Plots live time-domain Voltage V(t) (CH1) and Current I(t) (CH2) waveforms. | CH1: ${currentOscilloscope.ch1Source.toUpperCase()} · CH2: ${currentOscilloscope.ch2Source.toUpperCase()} · ${currentOscilloscope.runState.toUpperCase()} | Click: Focus Controls`;
    }
    if (inter.id === 'circuits-osc-time-knob') {
      return `Oscilloscope Timebase (SEC/DIV) | Stretches or compresses horizontal time (ms per grid division) to inspect waveform cycles. | Scale: ${currentOscilloscope.timePerDivMs} ms/div | Click / Scroll: Step sweep speed`;
    }
    if (inter.id === 'circuits-osc-ch1-knob') {
      return `Oscilloscope CH1 Scale (VOLTS/DIV) | Scales vertical sensitivity (Volts per grid division) for the yellow CH1 voltage trace. | Scale: ${currentOscilloscope.ch1VoltsPerDiv} V/div | Click / Scroll: Adjust CH1 gain`;
    }
    if (inter.id === 'circuits-osc-ch2-knob') {
      return `Oscilloscope CH2 Scale (SCALE/DIV) | Scales vertical sensitivity (mA or V per grid division) for the cyan CH2 trace. | Scale: ${currentOscilloscope.ch2VoltsPerDiv} mA/div | Click / Scroll: Adjust CH2 gain`;
    }
    if (inter.id === 'circuits-osc-trigger-knob') {
      return `Oscilloscope Run / Stop Trigger | Freezes (STOP) or continuously acquires (RUN) the live scope trace on screen. | Trigger: ${currentOscilloscope.runState.toUpperCase()} | Click: Toggle RUN / STOP`;
    }
    if (inter.id === 'circuits-osc-ch1-input') {
      return `Oscilloscope BNC Input CH1 | Selects which circuit test node is routed to Channel 1 (Vs, R1, R2, or R3). | Connected: ${currentOscilloscope.ch1Source.toUpperCase()} | Click: Cycle CH1 node`;
    }
    if (inter.id === 'circuits-osc-ch2-input') {
      return `Oscilloscope BNC Input CH2 | Selects which signal is plotted on Channel 2 (Series Current I or R1–R3). | Connected: ${currentOscilloscope.ch2Source.toUpperCase()} | Click: Cycle CH2 node`;
    }
    if (inter.id === 'circuits-multimeter') {
      const r = multimeter3d.updateDisplay();
      return `Fluke Digital Multimeter | Measures DC/AC Voltage (parallel), Resistance (unpowered), or Current (series). | Reading: ${r.displayString} | Click controls on DMM face`;
    }
    if (inter.id === 'circuits-topology-selector') {
      return `Solderless Resistor Breadboard | Holds R1, R2, R3 and color-coded test sockets for placing Red (+) and Black (COM) probes. | Red: ${multimeter3d.dmmState.redProbeTerminal ?? 'Parked'} · Black: ${multimeter3d.dmmState.blackProbeTerminal ?? 'Parked'} | Left-Click Socket: Active Lead · Right-Click: Black`;
    }
    if (inter.id === 'optics-laser') {
      return `Tunable Diode Laser Emitter | Produces coherent monochromatic light (400–700 nm) aligned down the optical rail. | λ = ${currentOptics.wavelength} nm · Beam: ${currentOptics.powerOn === false ? 'OFF' : 'ON'} | Click: Toggle Power · Scroll: ±10 nm`;
    }
    if (inter.id === 'optics-angle-dial') {
      return `Prism & Goniometer Angle Dial | Adjusts incident ray angle θ₁ against the dielectric prism for Snell's Law & TIR. | θ₁ = ${currentOptics.theta1.toFixed(1)}° | Click / Scroll: Adjust θ₁`;
    }
    if (inter.id === 'optics-lens-carrier') {
      return `Thin-Lens Optical Carriage | Converging lens mount satisfying the Gaussian thin-lens equation 1/f = 1/u + 1/v. | Object u = ${currentOptics.objectDistance.toFixed(1)} cm · Mode: ${currentOptics.subMode.toUpperCase()} | Click / Scroll: Step u`;
    }
    if (inter.id === 'optics-screen') {
      const sharp = calculateOptics(currentOptics).focusSharpness.toFixed(0);
      return currentOptics.subMode === 'imaging'
        ? `Diffuse Observation Screen | Captures the projected real image; reaches 100% sharpness at Gaussian focus v. | v = ${(currentOptics.screenPositionCm ?? 45.0).toFixed(1)} cm · Sharpness: ${sharp}% | Click / Scroll: Slide Screen v`
        : `Diffraction Observation Screen | Projects interference fringes at adjustable distance L from the aperture slits. | L = ${currentOptics.screenDistance.toFixed(2)} m | Click / Scroll: Slide Screen L`;
    }
    if (inter.id === 'optics-object-target') {
      return `Illuminated Object Target & Bench | Sets the object distance u from the luminous target to the converging lens center. | Object u = ${currentOptics.objectDistance.toFixed(1)} cm | Click / Scroll: Step u`;
    }
    if (inter.id === 'optics-rail') {
      if (currentOptics.subMode === 'imaging') {
        return `Precision Optical Rail Bench | Dovetail bench calibrated for thin-lens object & image conjugate distances. | Object u = ${currentOptics.objectDistance.toFixed(1)} cm | Click / Scroll: Step u`;
      }
      return `Precision Optical Rail Bench | Rigid 2.4 m extruded dovetail track aligning all optical carriages on a common optic axis. | Sub-mode: ${currentOptics.subMode === 'refraction' ? 'Snell’s Law & TIR' : 'Double-Slit Diffraction'} | Click: Inspect Rail`;
    }
    if (inter.id === 'relativity-light-clock' || inter.id === 'relativity-telemetry-console') {
      const rel = calculateRelativity(currentRelativity);
      const frame = (currentRelativity.referenceFrame ?? 'lab') === 'lab' ? "Lab Frame S" : "Rest Frame S'";
      return `Photon Light-Clock Mirror Cavity | Compares vertical proper bounce (Frame S') vs longer diagonal light path (Lab Frame S). | ${frame} · Δt = ${rel.dilatedTime.toFixed(3)} ns (γ = ${rel.gamma.toFixed(3)}) | Click: Switch Reference Frame`;
    }
    if (inter.id === 'relativity-velocity-dial') {
      const rel = calculateRelativity(currentRelativity);
      return `Relativistic Velocity Dial (β = v/c) | Adjusts shuttle speed fraction β, changing Lorentz factor γ = 1/√(1−β²). | β = ${currentRelativity.beta.toFixed(2)}c · γ = ${rel.gamma.toFixed(3)} | Click / Scroll: Adjust β`;
    }
    if (inter.id === 'relativity-contracting-rod' || inter.id === 'relativity-accelerator') {
      const rel = calculateRelativity(currentRelativity);
      return `Synchrotron & Contracting Meter-Rod | Demonstrates Lorentz length contraction L = L₀/γ along the axis of motion. | L = ${rel.contractedLength.toFixed(2)} m · ${currentRelativity.simPlaying === false ? 'PAUSED' : 'RUNNING'} | Click: Play/Pause · Scroll: Adjust β`;
    }
    return `${inter.name} | ${inter.description || 'Laboratory apparatus control.'} | ${inter.readout || 'Ready'} | ${inter.action}`;
  };

  const formatMultimeterMeshTooltip = (hitObj: THREE.Object3D): string | null => {
    const action = hitObj.userData.action as string | undefined;
    const dmm = multimeter3d.dmmState;
    const reading = multimeter3d.updateDisplay();
    if (action === 'cycle_mode') {
      const modeNames: Record<MultimeterMode, string> = {
        v_dc: 'DC Voltage (V⎓)',
        v_ac: 'AC Voltage (V~)',
        a_dc: 'DC Current (mA/A⎓)',
        a_ac: 'AC Current (mA/A~)',
        ohm: 'Resistance (Ω)',
        cont: 'Continuity Buzzer (🔊)',
      };
      return `DMM Rotary Mode Selector | Selects measurement quantity & range: V⎓, V~, A⎓, A~, Ω, or Continuity. | Dial: ${modeNames[dmm.mode]} · ${reading.displayString} | Click: Rotate to next mode`;
    }
    if (action === 'toggle_red_jack') {
      if (hitObj.name === 'DMM_Jack_COM') {
        return `DMM Common Ground Jack (COM -) | Reference negative return terminal always paired with the Black (-) test lead. | Red Lead Socket: ${dmm.redJack === 'ma_10a' ? 'mA/10A' : 'V·Ω'} | Black lead permanently in COM`;
      }
      const isMaJack = hitObj.name === 'DMM_Jack_mA';
      return `${isMaJack ? 'DMM Current Input Jack (mA / 10A)' : 'DMM Voltage / Ohm Input Jack (V·Ω)'} | ${isMaJack ? 'Fused input used ONLY when inserting the meter in series for current (A).' : 'High-impedance input for parallel voltage (V) or unpowered resistance (Ω).'} | Red Lead In: ${dmm.redJack === 'ma_10a' ? 'mA/10A (Current)' : 'V·Ω (Voltage/Ohm)'} | Click: Swap red lead jack`;
    }
    if (action === 'toggle_jumper') {
      return `Series Ammeter Break Jumper | Connects PSU to R1 during voltage checks; remove it to force circuit current through the ammeter. | State: ${multimeter3d.circuitState.seriesJumperConnected ? 'CLOSED (Continuity Bridge In)' : 'OPEN (Series Ammeter Break)'} | Click: Insert / Remove jumper`;
    }
    if (action === 'select_probe') {
      const probe = (hitObj.userData.probe as 'red' | 'black') || 'red';
      const attached = probe === 'red' ? dmm.redProbeTerminal : dmm.blackProbeTerminal;
      return `${probe === 'red' ? 'Red (+) Positive Test Probe' : 'Black (COM −) Reference Probe'} | ${probe === 'red' ? 'Attaches to the higher-potential test socket on the breadboard.' : 'Attaches to ground/lower-potential reference socket.'} | Location: ${attached ?? 'Parked on Dock'} | Click: Select as Active Lead`;
    }
    if (hitObj.userData.terminalId) {
      const tId = hitObj.userData.terminalId as TerminalId;
      const rawTip = (hitObj.userData.hoverTooltip as string) || `Breadboard Socket ${tId}`;
      const [labelPart, detailPart] = rawTip.split('·').map((s) => s.trim());
      const occupiedBy =
        dmm.redProbeTerminal === tId && dmm.blackProbeTerminal === tId
          ? 'Red (+) & Black (−) Here'
          : dmm.redProbeTerminal === tId
            ? 'Red (+) Attached'
            : dmm.blackProbeTerminal === tId
              ? 'Black (COM) Attached'
              : 'Empty Socket';
      return `Socket: ${labelPart || tId} | ${detailPart || 'Electrical node terminal on the series resistor breadboard.'} | Status: ${occupiedBy} · Active Lead: ${multimeter3d.activeProbe === 'red' ? 'RED (+)' : 'BLACK (−)'} | Left-Click: Place Active · Right-Click: Black`;
    }
    return hitObj.userData.hoverTooltip || null;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (!activeCanvasTouches.has(e.pointerId) && e.pointerId !== lookPointerId && e.pointerId !== closeupPanPointerId) {
        return;
      }
      if (activeCanvasTouches.has(e.pointerId)) {
        activeCanvasTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (activeCanvasTouches.size >= 2) {
        const pts = Array.from(activeCanvasTouches.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastPinchDist !== null && dist > 1) {
          const deltaDist = dist - lastPinchDist;
          if (cameraMode === 'closeup') {
            zoomCloseup(-deltaDist * 0.0045);
            closeupDragTravel = 999;
          } else if (character.isThirdPerson) {
            walkExtraPullback = THREE.MathUtils.clamp(walkExtraPullback - deltaDist * 0.008, -0.55, 2.80);
            updateCamera();
            dragTravel = 999;
          }
        }
        lastPinchDist = dist;
        return;
      }
    }

    const rect = renderer.domElement.getBoundingClientRect();
    if (e.pointerType !== 'touch' && rect.width > 0 && rect.height > 0) {
      mouseScreenPos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseScreenPos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouseActive = true;
    }

    if (cameraMode === 'closeup') {
      if (isCloseupPanning && (closeupPanPointerId === null || e.pointerId === closeupPanPointerId)) {
        const dx = e.clientX - prevCloseupX;
        const dy = e.clientY - prevCloseupY;
        closeupDragTravel += Math.hypot(dx, dy);
        prevCloseupX = e.clientX;
        prevCloseupY = e.clientY;
        const panThreshold = e.pointerType === 'touch' ? 12 : 4;
        if (closeupDragTravel >= panThreshold) {
          camera.updateMatrixWorld();
          closeupPanRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
          closeupPanUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
          const panSpeed = 0.0014 * closeupZoomFactor * getPortraitCloseupDistanceFactor();
          closeupPanOffset.addScaledVector(closeupPanRight, -dx * panSpeed);
          closeupPanOffset.addScaledVector(closeupPanUp, dy * panSpeed);
          closeupPanOffset.x = THREE.MathUtils.clamp(closeupPanOffset.x, -0.85, 0.85);
          closeupPanOffset.y = THREE.MathUtils.clamp(closeupPanOffset.y, -0.35, 0.45);
          closeupPanOffset.z = THREE.MathUtils.clamp(closeupPanOffset.z, -0.85, 0.85);
          recomputeCloseupCameraTargets();
          renderer.domElement.style.cursor = 'grabbing';
          return;
        }
      }
      if (e.pointerType === 'touch') return;
      if (activeStation === 'circuits') {
        raycaster.setFromCamera(mouseScreenPos, camera);
        const hits = raycaster.intersectObjects(multimeter3d.interactableMeshes, true);
        if (hits.length > 0) {
          renderer.domElement.style.cursor = 'pointer';
          callbacks.onCloseupHover?.(formatMultimeterMeshTooltip(hits[0].object));
          return;
        }
      }
      const inter = findInteractableHit(mouseScreenPos);
      if (inter) {
        renderer.domElement.style.cursor = 'pointer';
        callbacks.onCloseupHover?.(getCloseupTooltip(inter));
      } else {
        renderer.domElement.style.cursor = 'default';
        callbacks.onCloseupHover?.(null);
      }
      return;
    }

    // When NOT in pointer lock, allow smooth dragging with either mouse or single touch
    if (
      document.pointerLockElement !== renderer.domElement &&
      isPointerDown &&
      (lookPointerId === null || e.pointerId === lookPointerId)
    ) {
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      dragTravel += Math.hypot(dx, dy);
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      const lookThreshold = e.pointerType === 'touch' ? 10 : 3;
      if (dragTravel >= lookThreshold) {
        const lookGain = e.pointerType === 'touch' ? 0.0042 : 0.0032;
        yaw -= dx * lookGain;
        pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch - dy * lookGain));
        updateCamera();
      }
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

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      const trackedCanvasTouch =
        activeCanvasTouches.has(e.pointerId) ||
        e.pointerId === lookPointerId ||
        e.pointerId === closeupPanPointerId;
      if (!trackedCanvasTouch) return;

      activeCanvasTouches.delete(e.pointerId);
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {}

      if (cameraMode === 'closeup') {
        if (activeCanvasTouches.size < 2) {
          lastPinchDist = null;
        }
        if (isPinching) {
          if (activeCanvasTouches.size === 0) {
            isPinching = false;
          }
          closeupPanPointerId = null;
          isCloseupPanning = false;
          return;
        }
        if (e.pointerId === closeupPanPointerId) {
          const wasTap = e.type === 'pointerup' && closeupDragTravel < (e.pointerType === 'touch' ? 24 : 18);
          closeupPanPointerId = null;
          isCloseupPanning = false;
          if (wasTap) {
            lastTouchUpTime = performance.now();
            triggerCloseupAtClientPoint(e.clientX, e.clientY, true);
          }
        }
        return;
      }

      if (isPinching) {
        if (activeCanvasTouches.size === 0) {
          isPinching = false;
        }
        lookPointerId = null;
        isPointerDown = false;
        return;
      }

      if (e.pointerId === lookPointerId) {
        const wasTap = e.type === 'pointerup' && dragTravel < (e.pointerType === 'touch' ? 24 : 18);
        lookPointerId = null;
        isPointerDown = false;
        if (cameraMode === 'walk' && wasTap) {
          lastTouchUpTime = performance.now();
          interactAtScreenPoint(e.clientX, e.clientY, true);
        }
      }
      return;
    }

    if (lookPointerId === null || e.pointerId === lookPointerId) {
      isPointerDown = false;
      lookPointerId = null;
    }
    if (closeupPanPointerId === null || e.pointerId === closeupPanPointerId) {
      isCloseupPanning = false;
      closeupPanPointerId = null;
    }
  };

  const onPointerLockChange = () => {
    const locked = document.pointerLockElement === renderer.domElement;
    callbacks.onPointerLockChange?.(locked);
    if (!locked) {
      movement.forward = movement.backward = movement.left = movement.right = false;
      mouseActive = false;
    }
  };

  const handleCloseupProbePlacement = (clientX: number, clientY: number, forcedProbe?: 'red' | 'black'): boolean => {
    if (cameraMode !== 'closeup' || activeStation !== 'circuits' || !renderer.domElement) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(multimeter3d.interactableMeshes, true);
    if (hits.length === 0) return false;

    const hitObj = hits[0].object;
    if (hitObj.userData.action === 'select_probe') {
      const picked = ((hitObj.userData.probeColor || hitObj.userData.probe) as 'red' | 'black') || 'red';
      multimeter3d.setActiveProbe(picked);
      callbacks.onEquipmentInteract?.('circuits-multimeter');
      playTone(picked === 'red' ? 760 : 540, 'sine', 0.05, 0.14);
      return true;
    }
    if (hitObj.userData.action === 'cycle_mode') {
      multimeter3d.cycleMode();
      callbacks.onEquipmentInteract?.('circuits-multimeter');
      playTone(800, 'square', 0.05, 0.12);
      return true;
    }
    if (hitObj.userData.action === 'toggle_red_jack') {
      const next = multimeter3d.dmmState.redJack === 'v_ohm' ? 'ma_10a' : 'v_ohm';
      multimeter3d.setRedJack(next);
      callbacks.onEquipmentInteract?.('circuits-multimeter');
      playTone(600, 'sine', 0.06, 0.12);
      return true;
    }
    if (hitObj.userData.action === 'toggle_jumper') {
      multimeter3d.toggleSeriesJumper();
      callbacks.onEquipmentInteract?.('circuits-topology-selector');
      playTone(550, 'triangle', 0.08, 0.15);
      return true;
    }
    if (hitObj.userData.terminalId) {
      const term = hitObj.userData.terminalId as TerminalId;
      const targetProbe: 'red' | 'black' = forcedProbe ?? multimeter3d.activeProbe;
      const existingOnTarget =
        targetProbe === 'red'
          ? multimeter3d.dmmState.redProbeTerminal
          : multimeter3d.dmmState.blackProbeTerminal;

      if (existingOnTarget === term) {
        multimeter3d.setProbeTerminal(targetProbe, null);
      } else {
        multimeter3d.setProbeTerminal(targetProbe, term);
        if (!forcedProbe) {
          multimeter3d.setActiveProbe(targetProbe === 'red' ? 'black' : 'red');
        }
      }
      callbacks.onEquipmentInteract?.('circuits-topology-selector');
      playTone(targetProbe === 'red' ? 740 : 620, 'sine', 0.05, 0.15);
      return true;
    }
    return false;
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (cameraMode === 'closeup' && activeStation === 'circuits') {
      if (closeupDragTravel >= 6) return;
      handleCloseupProbePlacement(e.clientX, e.clientY, 'black');
    }
  };

  const onCanvasClick = (e: MouseEvent) => {
    if (!container || !renderer.domElement) return;
    if (performance.now() - lastTouchUpTime < 450) return;

    if (cameraMode === 'closeup') {
      if (closeupDragTravel >= 6) return;
      if (activeStation === 'circuits' && handleCloseupProbePlacement(e.clientX, e.clientY)) {
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      const clickPointer = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const inter = findInteractableHit(clickPointer);
      if (inter) {
        triggerEquipmentAction(inter.id);
        playTone(550, 'triangle', 0.06, 0.16);
      }
    } else {
      if (dragTravel >= 8) return;
      if (document.pointerLockElement !== renderer.domElement) {
        if (!interactAtScreenPoint(e.clientX, e.clientY) && !isMobileTouchDevice()) {
          requestPointerLock();
        }
      }
    }
  };

  const stepEquipmentControl = (interactionId: string, dir: 1 | -1): boolean => {
    if (activeStation === 'circuits') {
      if (interactionId === 'circuits-voltage-knob') {
        const step = dir > 0 ? 0.5 : -0.5;
        const newVs = Math.max(0, Math.min(30, Math.round((currentCircuits.vs + step) * 10) / 10));
        if (newVs !== currentCircuits.vs) {
          currentCircuits.vs = newVs;
          updatePsuKnobRotation(newVs);
          updatePsuTexture(newVs, currentCircuits.freq, currentCircuits.mode === 'ac', currentCircuits.powerOn !== false);
          updateFgenDisplay();
          multimeter3d.updateCircuitParameters({ sourceVoltage: newVs });
          callbacks.onCircuitsChange?.({ vs: newVs });
          playTone(480 + (newVs / 30) * 240, 'sine', 0.03, 0.08);
        }
        return true;
      }

      if (interactionId === 'circuits-fgen-freq-knob') {
        const step = dir > 0 ? 10 : -10;
        const newFreq = Math.max(10, Math.min(1000, Math.round(currentCircuits.freq + step)));
        if (newFreq !== currentCircuits.freq) {
          currentCircuits.freq = newFreq;
          updateFgenDisplay();
          updatePsuTexture(currentCircuits.vs, newFreq, currentCircuits.mode === 'ac', currentCircuits.powerOn !== false);
          multimeter3d.updateCircuitParameters({ frequency: newFreq });
          callbacks.onCircuitsChange?.({ freq: newFreq });
          playTone(400 + (newFreq / 1000) * 320, 'sine', 0.03, 0.08);
        }
        return true;
      }

      if (interactionId === 'circuits-osc-time-knob') {
        const curIdx = TIME_DIV_OPTIONS.indexOf(currentOscilloscope.timePerDivMs);
        const nextIdx = dir > 0
          ? Math.min(TIME_DIV_OPTIONS.length - 1, curIdx + 1)
          : Math.max(0, curIdx - 1);
        const nextTime = TIME_DIV_OPTIONS[nextIdx];
        if (nextTime !== currentOscilloscope.timePerDivMs) {
          currentOscilloscope.timePerDivMs = nextTime;
          updateOscKnobRotations();
          callbacks.onOscilloscopeChange?.({ timePerDivMs: nextTime });
          playTone(520, 'triangle', 0.03, 0.08);
        }
        return true;
      }

      if (interactionId === 'circuits-osc-ch1-knob') {
        const curIdx = CH1_VOLTS_DIV_OPTIONS.indexOf(currentOscilloscope.ch1VoltsPerDiv);
        const nextIdx = dir > 0
          ? Math.min(CH1_VOLTS_DIV_OPTIONS.length - 1, curIdx + 1)
          : Math.max(0, curIdx - 1);
        const nextVal = CH1_VOLTS_DIV_OPTIONS[nextIdx];
        if (nextVal !== currentOscilloscope.ch1VoltsPerDiv) {
          currentOscilloscope.ch1VoltsPerDiv = nextVal;
          updateOscKnobRotations();
          callbacks.onOscilloscopeChange?.({ ch1VoltsPerDiv: nextVal });
          playTone(580, 'triangle', 0.03, 0.08);
        }
        return true;
      }

      if (interactionId === 'circuits-osc-ch2-knob') {
        const curIdx = CH2_VOLTS_DIV_OPTIONS.indexOf(currentOscilloscope.ch2VoltsPerDiv);
        const nextIdx = dir > 0
          ? Math.min(CH2_VOLTS_DIV_OPTIONS.length - 1, curIdx + 1)
          : Math.max(0, curIdx - 1);
        const nextVal = CH2_VOLTS_DIV_OPTIONS[nextIdx];
        if (nextVal !== currentOscilloscope.ch2VoltsPerDiv) {
          currentOscilloscope.ch2VoltsPerDiv = nextVal;
          updateOscKnobRotations();
          callbacks.onOscilloscopeChange?.({ ch2VoltsPerDiv: nextVal });
          playTone(640, 'triangle', 0.03, 0.08);
        }
        return true;
      }
    }

    if (activeStation === 'optics') {
      if (interactionId === 'optics-laser') {
        const nextWavelength = THREE.MathUtils.clamp(currentOptics.wavelength + dir * 10, 400, 700);
        if (nextWavelength !== currentOptics.wavelength) {
          currentOptics.wavelength = nextWavelength;
          updateOpticsBenchGeometry();
          updateScreenTexture();
          callbacks.onOpticsChange?.({ wavelength: nextWavelength });
          playTone(500 + (700 - nextWavelength), 'sine', 0.03, 0.08);
        }
        return true;
      }
      if (interactionId === 'optics-angle-dial') {
        const nextTheta = THREE.MathUtils.clamp(Math.round(currentOptics.theta1 + dir), 0, 80);
        if (nextTheta !== currentOptics.theta1) {
          currentOptics.theta1 = nextTheta;
          updateOpticsBenchGeometry();
          updateScreenTexture();
          callbacks.onOpticsChange?.({ theta1: nextTheta });
          playTone(540, 'triangle', 0.03, 0.08);
        }
        return true;
      }
      if (
        interactionId === 'optics-lens-carrier' ||
        interactionId === 'optics-object-target' ||
        (interactionId === 'optics-rail' && currentOptics.subMode === 'imaging')
      ) {
        const nextU = THREE.MathUtils.clamp(Math.round((currentOptics.objectDistance + dir) * 10) / 10, 25, 80);
        if (nextU !== currentOptics.objectDistance) {
          currentOptics.objectDistance = nextU;
          updateOpticsBenchGeometry();
          updateScreenTexture();
          callbacks.onOpticsChange?.({ objectDistance: nextU });
          playTone(600, 'sine', 0.03, 0.08);
        }
        return true;
      }
      if (interactionId === 'optics-screen') {
        if (currentOptics.subMode === 'imaging') {
          const curV = currentOptics.screenPositionCm ?? 45.0;
          const nextV = THREE.MathUtils.clamp(Math.round((curV + dir * 0.5) * 10) / 10, 15, 120);
          if (nextV !== curV) {
            currentOptics.screenPositionCm = nextV;
            updateOpticsBenchGeometry();
            updateScreenTexture();
            callbacks.onOpticsChange?.({ screenPositionCm: nextV });
            playTone(680, 'sine', 0.03, 0.08);
          }
          return true;
        }
        if (currentOptics.subMode === 'diffraction') {
          const nextL = THREE.MathUtils.clamp(Math.round((currentOptics.screenDistance + dir * 0.05) * 100) / 100, 0.5, 3.0);
          if (nextL !== currentOptics.screenDistance) {
            currentOptics.screenDistance = nextL;
            updateOpticsBenchGeometry();
            updateScreenTexture();
            callbacks.onOpticsChange?.({ screenDistance: nextL });
            playTone(680, 'sine', 0.03, 0.08);
          }
          return true;
        }
      }
    }

    if (activeStation === 'relativity' && interactionId.startsWith('relativity-')) {
      const nextBeta = THREE.MathUtils.clamp(Math.round((currentRelativity.beta + dir * 0.02) * 100) / 100, 0.05, 0.99);
      if (nextBeta !== currentRelativity.beta) {
        currentRelativity.beta = nextBeta;
        callbacks.onRelativityChange?.({ beta: nextBeta });
        playTone(460 + nextBeta * 400, 'sine', 0.03, 0.08);
      }
      return true;
    }

    return false;
  };

  const onCanvasWheel = (e: WheelEvent) => {
    if (!renderer.domElement) return;
    if (cameraMode === 'walk') {
      if (character.isThirdPerson) {
        e.preventDefault();
        walkExtraPullback = THREE.MathUtils.clamp(
          walkExtraPullback + (e.deltaY > 0 ? 0.25 : -0.25),
          -0.55,
          2.80
        );
        updateCamera();
      }
      return;
    }
    if (cameraMode !== 'closeup') return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const hoverPointer = new THREE.Vector2(mouseX, mouseY);
    const inter = findInteractableHit(hoverPointer);

    if (inter && stepEquipmentControl(inter.id, e.deltaY < 0 ? 1 : -1)) {
      e.preventDefault();
      callbacks.onCloseupHover?.(getCloseupTooltip(inter), inter.id);
      return;
    }

    // Default close-up mouse wheel: smooth camera zoom in/out when not over a tunable knob
    e.preventDefault();
    zoomCloseup(e.deltaY > 0 ? 0.12 : -0.12);
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('click', onCanvasClick);
  renderer.domElement.addEventListener('wheel', onCanvasWheel, { passive: false });
  renderer.domElement.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
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
    else if (key === '1') setStation('circuits');
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
        syncResponsiveCameraFov();
        camera.updateProjectionMatrix();
        if (cameraMode === 'closeup') {
          recomputeCloseupCameraTargets();
        }
        const pixelRatio = getEffectivePixelRatio(currentGraphicsSettings.resolutionScale);
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
    walkExtraPullback = 0.15;
    playerPosition.set(STATION_X[station], eyeHeight, 2.85);
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
    if (isDisposed) return;
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

    // Gentle Moon axial rotation & Infinite Tsukuyomi iris spin + twinkling landmark stars
    moonGroup.rotation.y += delta * 0.015;
    if (tsukuyomiMoonGroup.visible) {
      tsukuyomiSpinGroup.rotation.z += delta * 0.045;
      const crimsonPulse = 96.0 + Math.sin(now * 0.002) * 5.0;
      moonCorona.scale.set(crimsonPulse, crimsonPulse, 1.0);
    }
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
      doorAnimAngle = THREE.MathUtils.lerp(doorAnimAngle, doorTargetAngle, Math.min(1, delta * 3.5));
      if (doorUsesFbxAxis) {
        leftExitLeaf.rotation.z = -doorAnimAngle;
        rightExitLeaf.rotation.z = doorAnimAngle;
      } else {
        leftExitLeaf.rotation.y = doorAnimAngle;
        rightExitLeaf.rotation.y = -doorAnimAngle;
      }
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
        applyWalkCameraPullback();

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

      // Station beacon lamp pulsing
      stationLamps[activeStation].emissiveIntensity = 2.4 + Math.sin(elapsed * 2.5) * 0.5;

      // In-World Guidance Marker Animation & HUD Indicator Projection
      if (activeGuidanceId && guidanceMarker.visible) {
        if (getGuidanceTargetPosition(activeGuidanceId, guidancePosition)) {
          const isTinySocket =
            activeGuidanceId.startsWith('circuits-terminal-') ||
            activeGuidanceId.startsWith('circuits-dmm-jack') ||
            activeGuidanceId === 'circuits-series-jumper' ||
            activeGuidanceId.startsWith('circuits-probe-r');
          const isKnobControl =
            activeGuidanceId === 'circuits-voltage-knob' ||
            activeGuidanceId === 'circuits-power-switch' ||
            activeGuidanceId === 'circuits-dmm-dial' ||
            activeGuidanceId.startsWith('circuits-osc-');

          const targetMarkerScale =
            cameraMode === 'closeup'
              ? isTinySocket
                ? 0.16
                : isKnobControl
                  ? 0.22
                  : 0.30
              : 0.85;
          guidanceMarker.scale.setScalar(targetMarkerScale);

          const bobAmp = cameraMode === 'closeup' ? (isTinySocket ? 0.004 : 0.008) : 0.035;
          const bobbing = (0.5 + 0.5 * Math.sin(elapsed * 4.0)) * bobAmp;
          guidanceMarker.position.set(
            guidancePosition.x,
            guidancePosition.y + bobbing + (cameraMode === 'walk' ? 0.03 : 0),
            guidancePosition.z
          );
          const pulse = 0.85 + Math.sin(elapsed * 4.5) * 0.15;
          guidanceRing.scale.setScalar(pulse);
          guidanceInnerRing.scale.setScalar(1.4 - pulse * 0.4);
          guidanceMaterial.emissiveIntensity = 1.05 + Math.sin(elapsed * 5.0) * 0.35;
          guidanceMarker.rotation.y = elapsed * 0.75;

          // Project target position into screen space for real-time HUD directional compass
          const proj = guidancePosition.clone().project(camera);
          const isBehind = proj.z > 1.0;
          const dist = camera.position.distanceTo(guidancePosition);
          const angleDeg = (Math.atan2(proj.y, proj.x) * 180) / Math.PI;
          callbacks.onGuidanceIndicator?.({
            screenX: proj.x,
            screenY: proj.y,
            isBehind,
            angleDeg,
            distanceM: dist,
          });
        }
      } else {
        callbacks.onGuidanceIndicator?.(null);
      }

      updateCalloutBadges();

      checkInteractions();
    }

    if (!isDisposed && !renderer.getContext().isContextLost()) {
      renderer.render(scene, camera);
    }
  };
  animate();

  callbacks.onAssetsReady?.();

  // -------------------------------------------------------------
  // 21. Export Scene API
  // -------------------------------------------------------------
  return {
    dispose: () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      renderer.domElement.removeEventListener('wheel', onCanvasWheel);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
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
      doorSteelMat.dispose();
      circuitsPosterTex.dispose();
      relativityPosterTex.dispose();
      whiteboardTexture.dispose();
      doorSignTexture.dispose();
      starGeo.dispose();
      starMaterial.dispose();
      starGlowTex.dispose();
      nebulaTex.dispose();
      esdMatTextures.forEach((tex) => tex.dispose());
      psuTexture.dispose();
      oscTexture.dispose();
      fgenTexture.dispose();
      screenTexture.dispose();
      targetReticleTex.dispose();
      meterRodTex.dispose();
      clockLabTexture.dispose();
      clockRestTexture.dispose();
      multimeter3d.dispose();
      diffractionTex.dispose();
      moonMaterial.dispose();
      moonDiffuseMap.dispose();
      moonBumpMap.dispose();
      tsukuyomiMaterial.dispose();
      tsukuyomiTex.dispose();
      normalMoonCoronaTex.dispose();
      tsukuyomiCoronaTex.dispose();
      moonCoronaMat.dispose();
      wallPlasterTexture.dispose();
      roomEnvRT.dispose();
      decorResult.disposableTextures.forEach((tex) => tex.dispose());
      decorResult.disposableMaterials.forEach((mat) => mat.dispose());
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
      updatePsuKnobRotation(currentCircuits.vs);
      updatePsuTexture(currentCircuits.vs, currentCircuits.freq, currentCircuits.mode === 'ac', currentCircuits.powerOn !== false);
      updateFgenDisplay();
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
    setOscilloscope: (settings) => {
      currentOscilloscope = { ...settings };
      updateOscKnobRotations();
    },
    setOptics: (settings) => {
      currentOptics = { ...settings };
      updateOpticsBenchGeometry();
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
    setActiveProbe: (probe) => multimeter3d.setActiveProbe(probe),
    getActiveProbe: () => multimeter3d.activeProbe,
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
    zoomCloseup,
    resetCloseupCamera,
    getCloseupZoom: () => closeupZoomFactor,
    stepEquipment: (interactionId: string, dir: 1 | -1) => {
      const changed = stepEquipmentControl(interactionId, dir);
      if (changed) {
        const matchObj = interactableObjects.find((obj) => {
          let cur: THREE.Object3D | null = obj;
          while (cur) {
            const inter = objectToInteractionMap.get(cur) || cur.userData.equipmentInteraction;
            if (inter?.id === interactionId) return true;
            cur = cur.parent;
          }
          return false;
        });
        if (matchObj) {
          let cur: THREE.Object3D | null = matchObj;
          while (cur) {
            const inter = objectToInteractionMap.get(cur) || cur.userData.equipmentInteraction;
            if (inter) {
              callbacks.onCloseupHover?.(getCloseupTooltip(inter), inter.id);
              break;
            }
            cur = cur.parent;
          }
        }
      }
      return changed;
    },
    setLabelsVisible: (visible: boolean) => {
      labelsVisible = visible;
      updateCalloutBadges();
    },
    getLabelsVisible: () => labelsVisible,
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
