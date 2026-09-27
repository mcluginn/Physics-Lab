import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  calculateElectro,
  calculateSound,
  calculateWave,
  type ElectroSettings,
  type SoundSettings,
  type StationId,
  type WaveSettings,
} from './labModel';
import { addAnchorMarkers, createReplaceableEquipment } from './equipmentAssets';
import { EQUIPMENT_REGISTRY } from './equipmentRegistry';
import { ROOM2_COLLISION, ROOM2_CONFIG } from './labSceneConfig';
import { CharacterController, type CharacterType } from './characterController';

export type LabSceneApi = {
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
  setElectro: (settings: ElectroSettings) => void;
  setGuidance: (interactionId: string | null) => void;
  setPaused: (paused: boolean) => void;
  setSound: (settings: SoundSettings) => void;
  setStation: (station: StationId) => void;
  setWave: (settings: WaveSettings) => void;
};

export type EquipmentInteraction = {
  id: string;
  stationId: StationId;
  category: string;
  name: string;
  description: string;
  action: string;
  readout: string;
};

type LabSceneCallbacks = {
  onAssetProgress?: (loaded: number, total: number) => void;
  onAssetsReady?: () => void;
  onEquipmentInteract?: (id: string) => void;
  onFootstep?: () => void;
  onInteractionChange?: (interaction: EquipmentInteraction | null) => void;
  onPointerLockChange?: (locked: boolean) => void;
};

type EquipmentDefinition = Omit<EquipmentInteraction, 'readout' | 'action' | 'description'> & {
  description?: string | (() => string);
  action: string | (() => string);
  readout: string | (() => string);
};

export const EQUIPMENT_DESCRIPTIONS: Record<string, string> = {
  // --- Station 01: Transverse Wave on a Taut String ---
  'wave-driver': 'Electromagnetic vibration generator that converts sinusoidal AC signals into vertical harmonic oscillations, continuously driving transverse mechanical waves down the string.',
  'wave-freq-knob': 'Multi-turn frequency regulation dial (10–60 Hz). Rotating this changes the vibration rate, exciting higher harmonic modes (n = 1, 2, 3...) when matching resonant frequencies.',
  'wave-power-switch': 'Heavy-duty toggle switch that energizes or pauses the mechanical oscillator drive coils. Turn off to freeze the dynamic wave motion for precise nodal and antinodal measurements.',
  'wave-string': 'Specialized braided elastic cord with calibrated linear mass density (μ = 0.002 kg/m). Transverse waves propagate along the string, reflecting at boundaries to form standing waves.',
  'wave-tension': 'Slotted brass weights suspended over the low-friction pulley. Applying mass creates tensile force T = mg along the string, directly governing wave speed according to v = √(T/μ).',
  'wave-frequency': 'Machined low-friction ball-bearing pulley establishing the fixed boundary node at the far end of the optical bench, where traveling waves reflect with 180° phase inversion.',
  'wave-slider': 'Low-friction optical measurement sled with a magnifying vernier index and hairline cursor. Slide it along the metric track to measure the spatial wavelength (λ) between nodes and antinodes.',
  'wave-clipboard': 'Official laboratory documentation clipboard for transverse wave experiments. Click or press [E] to log frequency, tension, wavelength, and calculated wave speed.',
  'wave-placard': 'Architectural wall theory board detailing wave velocity v = fλ = √(T/μ), harmonic frequency equations, and boundary reflection principles. Click or press [E] to open the notebook.',

  // --- Station 02: Sound Resonance Tube ---
  'sound-fork': 'Precision-milled acoustic tuning fork and hardwood sounding resonator box. Emits pure sinusoidal sound waves at fundamental frequencies (256–1024 Hz) directed toward the tube opening.',
  'sound-fork-dial': 'Graduated tuning collar that adjusts the natural acoustic resonant frequency of the tuning fork assembly (256 Hz, 440 Hz, 512 Hz, etc.).',
  'sound-mallet': 'Balanced elastomer-headed strike mallet. Delivers a soft impulse strike to the tuning fork tines to excite sustained, pure harmonic acoustic vibrations without damaging the steel.',
  'sound-tube': 'Graduated borosilicate glass resonance column with adjustable water level. Standing longitudinal acoustic waves form inside the air column, creating pressure nodes and antinodes.',
  'sound-tube-cap': 'Acoustic boundary control valve that seals or vents the column base, switching between closed-open (odd harmonics: λ = 4L/n) and open-open (all harmonics: λ = 2L/n) acoustic conditions.',
  'sound-temp-dial': 'Environmental chamber thermostat dial (-10°C to 45°C). Regulates ambient air temperature, which directly shifts the speed of sound according to v ≈ 331.4 · √(1 + T/273.15) m/s.',
  'sound-microphone': 'High-sensitivity condenser microphone coupled to an acoustic decibel meter. Move it along the resonance axis to measure Sound Pressure Levels (SPL in dB) and pinpoint standing wave antinodes.',
  'sound-clipboard': 'Official laboratory documentation clipboard for acoustic resonance experiments. Click or press [E] to log tube length, frequency, air temperature, microphone position, and peak SPL.',
  'sound-placard': 'Architectural wall theory board illustrating longitudinal acoustic standing waves, temperature velocity dependence, and resonant air column equations. Click or press [E] to open the notebook.',

  // --- Station 03: Coulomb Electrostatics Bench ---
  'electro-q1': 'High-voltage conductive spherical electrode mounted on an amber dielectric standoff. Accumulates positive or negative charge q₁ (-8 to +8 μC) from the regulated DC power supply.',
  'electro-q2': 'Opposing high-voltage conductive spherical electrode on an insulating standoff. Interacts with electrode 1 through Coulomb electrostatic forces, producing mutual attraction or repulsion.',
  'electro-leadscrew': 'Precision micrometer leadscrew dial. Rotating this dial drives the threaded stainless-steel lead screw to smoothly vary the separation distance r (0.20 to 1.50 m) between the two charged spheres.',
  'electro-power-switch': 'Master high-voltage safety toggle switch. Energizes the DC voltage converter to charge the spherical electrodes, or safely cuts power for electrostatic neutralization and inspection.',
  'electro-voltage-dial': 'Dual high-voltage potentiometer charge dials. Rotate these knobs to adjust the magnitude and polarity of stored electrostatic charges q₁ and q₂.',
  'electro-rail': 'Extruded aluminum optical bench track with laser-etched millimeter graduations across a 3.20 m span. Guides the moving carriages and allows precise vernier separation readings.',
  'electro-probe': 'Midpoint electric field mill sensor and electrometer probe head. Samples net electrostatic vector field strength (E in N/C) and electrostatic potential (V in Volts) at the exact midpoint.',
  'electro-clipboard': 'Official laboratory documentation clipboard for Coulomb electrostatics trials. Click or press [E] to record charges q₁ and q₂, separation distance r, mutual force F, and midpoint electric field.',
  'electro-placard': 'Architectural wall theory board presenting Coulomb’s Law F = k|q₁q₂|/r², electric field superposition vectors, and dipole potential formulas. Click or press [E] to open the notebook.',

  // --- Corridor Exit Door ---
  'campus-door': 'Solid mahogany double doors connecting to the main university science corridor. Walk through or press [E] to open the doors and return to the laboratory hallway directory.',

  // --- Student Lab Assistant ---
  'student-lab-assistant': 'Student Laboratory Assistant · Stationed near the exit and electrostatics demonstration area, wearing protective laboratory safety goggles. She can guide you through transverse waves, acoustic resonance, and Coulomb charge experiments.',

  // --- Physics Professor ---
  'physics-professor': 'Senior Professor of Physics & Head Laboratory Instructor stationed by the master lecture whiteboard, wearing protective black-tinted safety eyewear. Advises on harmonic wave mechanics, resonance frequencies, and electrostatic field theory.',

  // --- Laboratory Casework & Environmental Infrastructure ---
  'lab-whiteboard': 'Central lecture whiteboard displaying governing physics equations, wave mechanics derivations, acoustic resonance models, and Coulomb electrostatic formulas.',
  'lab-oscilloscope': 'Tektronix Dual-Channel Digital Storage Oscilloscope (200 MHz). Real-time waveform display capturing harmonic AC oscillations and frequency modes.',
  'lab-function-gen': 'Agilent Precision Synthesized Function Generator. Generates calibrated harmonic sine, square, and triangle waveforms with adjustable frequency and amplitude.',
  'lab-dmm': 'High-accuracy digital metrology multimeter with banana probe leads for measuring potential differences and circuit continuity.',
  'lab-glassware': 'Borosilicate chemical and physics glassware assortment with volumetric flasks, graduated cylinders, and copper-sulfate reagent beakers.',
  'lab-cabinet-west': 'Heavy-duty steel laboratory storage cabinet with glazed display doors for calibrated physics instruments, optics, and apparatus components.',
  'lab-cabinet-east': 'Auxiliary laboratory storage cabinet housing spare precision components, cables, and calibration standards.',
  'lab-eyewash': 'ANSI Z358.1 compliant emergency decontamination station featuring an overhead deluge safety shower and dual aerated eye wash jets.',
  'lab-breaker-panel': 'Heavy-duty 208Y/120V 3-phase electrical distribution breaker panel supplying isolated and conditioned power to all test workstations.',
  'lab-fire-station': 'Emergency Class ABC dry chemical fire extinguisher cabinet, safety inspection tag, and UV-filtering protective laboratory safety goggles.',
  'lab-prep-sink': 'Laboratory wash basin and drying pegboard station for cleaning, calibrating, and staging experimental physical apparatus.',
  'lab-window': 'Daylight observation window offering natural campus quad daylight and spatial orientation within the physics research facility.',
  'lab-toolcase': 'Heavy-duty aluminum flight case with custom cut-foam insert for storing delicate optical sensors and high-voltage calibration probes.',
};

const STATION_X: Record<StationId, number> = {
  wave: ROOM2_CONFIG.stations.wave.x,
  sound: ROOM2_CONFIG.stations.sound.x,
  electro: ROOM2_CONFIG.stations.electro.x,
};
const STATION_COLOR: Record<StationId, number> = {
  wave: ROOM2_CONFIG.stations.wave.color,
  sound: ROOM2_CONFIG.stations.sound.color,
  electro: ROOM2_CONFIG.stations.electro.color,
};

const WAVE_STRING_START = -1.67;
const WAVE_STRING_END = 1.7;
const WAVE_STRING_Y = 1.49;
const WAVE_STRING_SPAN = WAVE_STRING_END - WAVE_STRING_START;
const ELECTRO_SURFACE_Y = 0.94;

function material(color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.35, ...options });
}

function addBench(scene: THREE.Scene, x: number, color: number, surfaceTexture: THREE.Texture) {
  const group = new THREE.Group();
  group.position.x = x;
  const top = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.table.width, ROOM2_CONFIG.table.thickness, ROOM2_CONFIG.table.depth), material(0xffffff, { map: surfaceTexture, roughness: 0.32, metalness: 0.12 }));
  top.position.y = ROOM2_CONFIG.table.topHeight;
  top.receiveShadow = true;
  group.add(top);

  // Welded Steel Subframe
  const subframe = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.table.width - 0.2, 0.08, ROOM2_CONFIG.table.depth - 0.2), material(0x1e293b, { metalness: 0.85, roughness: 0.2 }));
  subframe.position.y = ROOM2_CONFIG.table.topHeight - ROOM2_CONFIG.table.thickness / 2 - 0.04;
  group.add(subframe);

  const legOffsetX = ROOM2_CONFIG.table.width / 2 - 0.45;
  const legOffsetZ = ROOM2_CONFIG.table.depth / 2 - 0.35;
  [-legOffsetX, legOffsetX].forEach((legX) => {
    [-legOffsetZ, legOffsetZ].forEach((legZ) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, ROOM2_CONFIG.table.legHeight, 0.12), material(0x111827, { metalness: 0.85, roughness: 0.2 }));
      leg.position.set(legX, ROOM2_CONFIG.table.legHeight / 2, legZ);
      group.add(leg);

      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12), material(0x94a3b8, { metalness: 0.95, roughness: 0.1 }));
      foot.position.set(legX, 0.02, legZ);
      group.add(foot);
    });
  });

  // Lower Stretchers
  const stretcher1 = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.table.width - 0.8, 0.06, 0.06), material(0x111827, { metalness: 0.8 }));
  stretcher1.position.set(0, 0.20, -legOffsetZ);
  group.add(stretcher1);

  const stretcher2 = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.table.width - 0.8, 0.06, 0.06), material(0x111827, { metalness: 0.8 }));
  stretcher2.position.set(0, 0.20, legOffsetZ);
  group.add(stretcher2);

  // Under-bench drawer unit
  const drawerUnit = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 1.5), material(0x334155, { metalness: 0.75, roughness: 0.35 }));
  drawerUnit.position.set(ROOM2_CONFIG.table.width / 2 - 0.9, 0.55, 0);
  group.add(drawerUnit);

  // Status Indicator Beacon Lamp (mounted on benchtop flange)
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 16), material(0x1e293b, { metalness: 0.85 }));
  lampBase.position.set(-1.50, ROOM2_CONFIG.table.topHeight + ROOM2_CONFIG.table.thickness / 2 + 0.01, 0.75);
  group.add(lampBase);

  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.38, 12), material(0x64748b, { metalness: 0.9 }));
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

export function createLabScene(
  container: HTMLDivElement,
  initial: { wave: WaveSettings; sound: SoundSettings; electro: ElectroSettings },
  callbacks: LabSceneCallbacks = {},
): LabSceneApi {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1524);
  scene.fog = new THREE.Fog(0x0c1524, 25, 75);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 70);
  let activeStation: StationId = 'wave';
  const eyeHeight = 1.70;
  const playerPosition = new THREE.Vector3(STATION_X.wave, eyeHeight, 5.1);
  let yaw = 0;
  let pitch = -0.08;
  const movement = { forward: false, backward: false, left: false, right: false };
  const analogMovement = new THREE.Vector2();
  const debugEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
  let doorOpen = false;
  let doorAnimAngle = 0;
  let doorTargetAngle = 0;
  let isDoorOpening = false;
  let doorOpenedCallback: (() => void) | null = null;
  let leftExitLeaf: THREE.Mesh | null = null;
  let rightExitLeaf: THREE.Mesh | null = null;

  const character = new CharacterController({
    scene,
    floorY: ROOM2_CONFIG.room.floorY,
    initialPosition: playerPosition,
    initialYaw: yaw,
    defaultCharacter: 'female',
    allowThirdPerson: false,
    defaultThirdPerson: false,
  });

  const updateCamera = () => {
    character.updateCamera(camera, playerPosition, yaw, pitch);
  };
  updateCamera();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const interactables: THREE.Object3D[] = [];
  const guidanceTargets = new Map<string, THREE.Object3D>();
  const registerInteraction = (objects: THREE.Object3D | THREE.Object3D[], interaction: EquipmentDefinition) => {
    const targets = Array.isArray(objects) ? objects : [objects];
    if (targets[0] && !guidanceTargets.has(interaction.id)) guidanceTargets.set(interaction.id, targets[0]);
    targets.forEach((object) => {
      object.userData.equipmentInteraction = interaction;
      if (!interactables.includes(object)) interactables.push(object);
      object.traverse((child) => {
        child.userData.equipmentInteraction = interaction;
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
          if (!interactables.includes(child)) interactables.push(child);
        }
      });
    });
  };

  const loadingManager = new THREE.LoadingManager();
  loadingManager.onProgress = (_url, loaded, total) => callbacks.onAssetProgress?.(loaded, total);
  loadingManager.onLoad = () => callbacks.onAssetsReady?.();
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const loadTexture = (path: string, fallback = '#173047') => {
    const loadedTexture = textureLoader.load(path, undefined, undefined, () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = fallback;
        context.fillRect(0, 0, 16, 16);
        context.strokeStyle = '#6f8da6';
        context.lineWidth = 2;
        context.strokeRect(2, 2, 12, 12);
      }
      loadedTexture.image = canvas as unknown as HTMLImageElement;
      loadedTexture.needsUpdate = true;
    });
    loadedTexture.colorSpace = THREE.SRGBColorSpace;
    return loadedTexture;
  };
  const floorTexture = loadTexture('/assets/textures/lab_floor_tiles.jpg', '#455a70');
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(7, 5);
  const benchTexture = loadTexture('/assets/textures/workbench_epoxy_top.jpg', '#1b2735');
  benchTexture.colorSpace = THREE.SRGBColorSpace;
  benchTexture.wrapS = benchTexture.wrapT = THREE.RepeatWrapping;
  benchTexture.repeat.set(2.4, 1.2);
  const placardTextures: Record<StationId, THREE.Texture> = {
    wave: loadTexture('/assets/placards/placard_transverse_waves.png'),
    sound: loadTexture('/assets/placards/placard_sound_waves.png'),
    electro: loadTexture('/assets/placards/placard_electrostatics.png'),
  };
  (Object.keys(placardTextures) as StationId[]).forEach((id) => { placardTextures[id].colorSpace = THREE.SRGBColorSpace; });
  const environmentTextures = [
    loadTexture('/assets/environment/lab_safety_signs.png', '#263f35'),
    loadTexture('/assets/environment/lab_eyewash_safety_station.jpg', '#165c4c'),
    loadTexture('/assets/environment/lab_fire_safety_station.jpg', '#672b2b'),
    loadTexture('/assets/environment/lab_electrical_panel.jpg', '#3d4652'),
    loadTexture('/assets/furniture/lab_cabinet_glassware.jpg', '#233549'),
  ];
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
    } catch {
      // Silently continue if audio context is blocked
    }
  };

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

    // 1. Base Mahogany Wood Gradient
    const woodGrad = ctx.createLinearGradient(0, 0, 0, 512);
    woodGrad.addColorStop(0.0, '#240d06');
    woodGrad.addColorStop(0.15, '#3b160b');
    woodGrad.addColorStop(0.5, '#4e1e0f');
    woodGrad.addColorStop(0.85, '#381409');
    woodGrad.addColorStop(1.0, '#1f0904');
    ctx.fillStyle = woodGrad;
    ctx.fillRect(0, 0, 2048, 512);

    // 2. Procedural Mahogany Wood Grain Striations & Growth Rings
    ctx.save();
    for (let y = 0; y < 512; y += 2) {
      const grainWave = Math.sin(y * 0.16 + Math.cos(y * 0.03) * 2.8);
      const grainAlpha = 0.03 + 0.06 * Math.max(0, grainWave);
      ctx.strokeStyle = y % 4 === 0 ? `rgba(16, 5, 2, ${grainAlpha * 1.6})` : `rgba(115, 48, 22, ${grainAlpha * 0.9})`;
      ctx.lineWidth = 1 + (y % 3 === 0 ? 1 : 0);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 2048; x += 128) {
        const wave = Math.sin(x * 0.003 + y * 0.01) * 3.0;
        ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 400; i++) {
      const rx = ((i * 137) % 2000) + 24;
      const ry = ((i * 73) % 490) + 11;
      const rlen = 6 + ((i * 31) % 18);
      ctx.fillStyle = 'rgba(15, 4, 1, 0.25)';
      ctx.fillRect(rx, ry, rlen, 1.2);
    }
    ctx.restore();

    // 3. Beveled Carved Molding Frame
    ctx.save();
    ctx.strokeStyle = 'rgba(10, 3, 1, 0.95)';
    ctx.lineWidth = 6;
    ctx.strokeRect(26, 22, 1996, 468);

    ctx.strokeStyle = 'rgba(130, 55, 24, 0.65)';
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 24, 1992, 466);

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
      ctx.fillStyle = '#1a0802';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawCornerRosette(40, 36);
    drawCornerRosette(2008, 36);
    drawCornerRosette(40, 476);
    drawCornerRosette(2008, 476);
    ctx.restore();

    // 4. Photorealistic Carved / Engraved Debossed Typography
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

      // Pass 1: Chiseled bottom-edge lip highlight
      ctx.fillStyle = isPrimaryGold ? 'rgba(255, 230, 160, 0.55)' : 'rgba(135, 62, 28, 0.48)';
      ctx.fillText(text, x, y + depth * 0.7);

      // Pass 2: Deep engraved top-edge cast shadow
      ctx.fillStyle = 'rgba(7, 2, 1, 0.98)';
      ctx.fillText(text, x, y - depth);
      ctx.fillText(text, x - 1, y - depth * 0.75);

      // Pass 3: Intermediate groove wall tone
      ctx.fillStyle = 'rgba(18, 5, 2, 0.85)';
      ctx.fillText(text, x, y - depth * 0.4);

      // Pass 4: Inlay core (burnished gold leaf or warm aged brass)
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
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1;
      }
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    drawCarvedText(
      line1,
      1024,
      105,
      '700 28px Georgia, "Times New Roman", serif',
      28,
      false
    );

    drawCarvedText(
      line2,
      1024,
      250,
      '800 54px Georgia, "Times New Roman", serif',
      54,
      true
    );

    drawCarvedText(
      line3,
      1024,
      395,
      '700 30px Georgia, "Times New Roman", serif',
      30,
      false
    );

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  const createPhysicsWhiteboardTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Porcelain Whiteboard surface with subtle reflection gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1024);
    bgGrad.addColorStop(0, '#fbfcfe');
    bgGrad.addColorStop(0.5, '#f4f6f9');
    bgGrad.addColorStop(1, '#edf1f5');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 2048, 1024);

    // Subtle faint ghosting of erased calculations for authentic realism
    ctx.fillStyle = 'rgba(100, 120, 140, 0.03)';
    for (let i = 0; i < 35; i++) {
      ctx.fillRect(40 + (i * 53) % 1900, 80 + (i * 29) % 850, 110, 16);
    }

    // Top Header Banner
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 36px "Segoe UI", -apple-system, sans-serif';
    ctx.fillText('EXPERIMENTAL PHYSICS II: WAVE MECHANICS & ELECTROSTATICS', 55, 65);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 20px "Segoe UI", sans-serif';
    ctx.fillText('LABORATORY 02 · GOVERNING EQUATIONS & THEORETICAL DERIVATIONS', 55, 100);

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

    // --- COLUMN 1: TRANSVERSE WAVES ON A TAUT STRING ---
    ctx.fillStyle = '#0369a1';
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillText('1. TRANSVERSE WAVE ON TAUT STRING', 55, 165);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('Phase Velocity on String:', 55, 210);

    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText('v = √(T / μ) = f · λ', 75, 250);

    ctx.fillStyle = '#475569';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('T = tension force = m·g  [N]', 75, 285);
    ctx.fillText('μ = linear mass density = 0.0020 kg/m', 75, 315);
    ctx.fillText('f = oscillation frequency [Hz]', 75, 345);
    ctx.fillText('λ = spatial wavelength [m]', 75, 375);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('Standing Wave Harmonic Modes (Fixed Ends):', 55, 425);
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText('λₙ = 2L / n       fₙ = n · (v / 2L)', 75, 465);

    // Standing Wave Graphic Box
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(55, 500, 600, 180);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(56, 501, 598, 178);

    // Draw 3-loop standing wave
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= 560; x += 4) {
      const y = 590 + Math.sin((x / 560) * Math.PI * 3) * 55;
      if (x === 0) ctx.moveTo(75 + x, y);
      else ctx.lineTo(75 + x, y);
    }
    ctx.stroke();

    // Reflected envelope wave (dashed)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    for (let x = 0; x <= 560; x += 4) {
      const y = 590 - Math.sin((x / 560) * Math.PI * 3) * 55;
      if (x === 0) ctx.moveTo(75 + x, y);
      else ctx.lineTo(75 + x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Node and Antinode markers
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillText('Node', 65, 615);
    ctx.fillText('Node', 255, 615);
    ctx.fillText('Node', 440, 615);
    ctx.fillText('Node', 625, 615);

    ctx.fillStyle = '#10b981';
    ctx.fillText('Antinode', 140, 525);
    ctx.fillText('Antinode', 335, 525);
    ctx.fillText('Antinode', 520, 525);

    ctx.fillStyle = '#475569';
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillText('Mode n = 3 harmonic  |  L = 1.68 m  |  Boundary node at pulley', 65, 715);
    ctx.fillText('Phase inversion at fixed boundary: Δφ = π radians (180°)', 65, 745);

    // --- COLUMN 2: SOUND RESONANCE IN AIR COLUMNS ---
    ctx.fillStyle = '#6d28d9';
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillText('2. ACOUSTIC COLUMN RESONANCE', 720, 165);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('Acoustic Velocity in Air vs Temperature:', 720, 210);

    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 26px Georgia, serif';
    ctx.fillText('v(T) ≈ 331.4 · √(1 + T / 273.15)  m/s', 740, 250);

    ctx.fillStyle = '#475569';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('At 20 °C: v ≈ 343.4 m/s   |   At 25 °C: v ≈ 346.3 m/s', 740, 285);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('Boundary Conditions & Resonant Modes:', 720, 335);

    ctx.fillStyle = '#6d28d9';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('Closed-Open Tube:  λₙ = 4L / n   (n = 1, 3, 5...)', 740, 375);
    ctx.fillStyle = '#475569';
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillText('Displacement node at water surface; antinode at open mouth.', 740, 405);

    ctx.fillStyle = '#6d28d9';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('Open-Open Tube:    λₙ = 2L / n   (n = 1, 2, 3...)', 740, 445);
    ctx.fillStyle = '#475569';
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillText('Antinodes at both open tube ends; supports all integer harmonics.', 740, 475);

    // Sound Tube Graphic Box
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(720, 500, 600, 180);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(721, 501, 598, 178);

    // Glass tube outline
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.strokeRect(760, 545, 480, 75);
    // Water reservoir section at right
    ctx.fillStyle = '#bfdbfe';
    ctx.fillRect(1100, 547, 138, 71);
    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.fillText('Water Level', 1115, 588);

    // Standing acoustic pressure wave inside tube
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= 340; x += 4) {
      const y = 582 + Math.sin((x / 340) * Math.PI * 1.5) * 30;
      if (x === 0) ctx.moveTo(760 + x, y);
      else ctx.lineTo(760 + x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillText('Quarter-wavelength fundamental resonance: L = λ / 4', 740, 715);
    ctx.fillText('Acoustic end-correction: L_eff = L_tube + 0.61 · r_tube', 740, 745);

    // --- COLUMN 3: COULOMB FORCE & ELECTRIC FIELDS ---
    ctx.fillStyle = '#c2410c';
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillText('3. COULOMB FORCE & ELECTRIC FIELDS', 1380, 165);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText("Coulomb's Inverse-Square Law:", 1380, 210);

    ctx.fillStyle = '#ea580c';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText('F = k · |q₁ · q₂| / r²', 1400, 250);

    ctx.fillStyle = '#475569';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('k = 1 / (4πε₀) ≈ 8.98755 × 10⁹  N·m²/C²', 1400, 285);
    ctx.fillText('ε₀ = 8.854 × 10⁻¹² C²/(N·m²) (vacuum permittivity)', 1400, 315);
    ctx.fillText('r = center-to-center sphere separation [m]', 1400, 345);

    ctx.fillStyle = '#1e293b';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('Superposition of Electric Field Vector:', 1380, 395);
    ctx.fillStyle = '#ea580c';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText('E_total = Σ (k · qᵢ / rᵢ²) · r̂ᵢ', 1400, 435);
    ctx.fillStyle = '#475569';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('Midpoint Field (Opposite charges +q, -q):', 1400, 470);
    ctx.fillStyle = '#ea580c';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('E_mid = 4k · (|q₁| + |q₂|) / r²', 1420, 505);

    // Electrostatics Graphic Box
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(1380, 530, 600, 210);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(1381, 531, 598, 208);

    // Charge Sphere 1 (+, blue/cyan)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(1480, 635, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('+', 1472, 644);
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.fillText('q₁ (+4 μC)', 1445, 685);

    // Charge Sphere 2 (-, amber/orange)
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(1880, 635, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('-', 1874, 646);
    ctx.fillStyle = '#c2410c';
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.fillText('q₂ (-6 μC)', 1845, 685);

    // Field lines curving from + to -
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    [-45, -22, 0, 22, 45].forEach((offset) => {
      ctx.beginPath();
      ctx.moveTo(1508, 635 + offset * 0.4);
      ctx.quadraticCurveTo(1680, 635 + offset * 1.8, 1852, 635 + offset * 0.4);
      ctx.stroke();
    });

    // Midpoint sensor marker
    ctx.fillStyle = '#10b981';
    ctx.fillRect(1675, 615, 10, 40);
    ctx.fillStyle = '#065f46';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillText('Probe (r/2)', 1645, 675);

    // Footer note
    ctx.fillStyle = '#1e293b';
    ctx.font = 'italic 16px Georgia, serif';
    ctx.fillText('★ Verify sensor zero calibration before logging experimental trials. High-voltage isolation interlocks active.', 55, 995);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const createOscilloscopeScreenTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = '#07151f';
    ctx.fillRect(0, 0, 512, 384);

    // Reticle Grid
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.22)';
    ctx.lineWidth = 1;
    for (let x = 32; x < 512; x += 44.8) {
      ctx.beginPath();
      ctx.moveTo(x, 24);
      ctx.lineTo(x, 360);
      ctx.stroke();
    }
    for (let y = 24; y < 384; y += 42) {
      ctx.beginPath();
      ctx.moveTo(32, y);
      ctx.lineTo(480, y);
      ctx.stroke();
    }

    // Major Center Axes ticks
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
    ctx.beginPath();
    ctx.moveTo(256, 24);
    ctx.lineTo(256, 360);
    ctx.moveTo(32, 192);
    ctx.lineTo(480, 192);
    ctx.stroke();

    // Waveform 1: Sinusoidal cyan trace
    ctx.save();
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 32; x <= 480; x += 2) {
      const y = 192 + Math.sin((x - 32) * 0.042) * 95;
      if (x === 32) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Waveform 2: Fainter secondary harmonic trace
    ctx.save();
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 5;
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let x = 32; x <= 480; x += 2) {
      const y = 192 + Math.sin((x - 32) * 0.084 + 1.2) * 45;
      if (x === 32) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Status OSD Overlays
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.fillText('Tektronix TDS2024B · 200MHz', 36, 20);

    ctx.fillStyle = '#67e8f9';
    ctx.font = '13px "Courier New", monospace';
    ctx.fillText('CH1: 2.00V/div', 36, 376);
    ctx.fillStyle = '#c084fc';
    ctx.fillText('CH2: 1.00V/div', 170, 376);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('TB: 1.00ms/div', 310, 376);
    ctx.fillStyle = '#10b981';
    ctx.fillText('TRIG: AUTO', 400, 20);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const createFunctionGenTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, 256, 96);

    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.fillText('8888.88 kHz', 15, 55);

    ctx.save();
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.fillText('1.0000 kHz', 15, 55);
    ctx.restore();

    ctx.fillStyle = '#10b981';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillText('OUTPUT: ON  ·  SINE WAVE  ·  5.0 Vpp', 15, 82);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const createMultimeterTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = '#8ca68c';
    ctx.fillRect(0, 0, 192, 80);

    ctx.fillStyle = '#1b331b';
    ctx.font = 'bold 34px "Courier New", monospace';
    ctx.fillText('+12.45 V', 15, 52);

    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillText('DC VOLTS · AUTO · REL', 15, 72);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const createEyewashSignTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Green header bar
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, 0, 512, 110);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Arial Black", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EMERGENCY', 256, 75);

    // White body
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 110, 512, 274);

    // Green border around sign
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 376);

    ctx.fillStyle = '#15803d';
    ctx.font = 'bold 30px "Arial Black", "Segoe UI", sans-serif';
    ctx.fillText('EYE WASH & SHOWER', 256, 175);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.fillText('KEEP AREA CLEAR AT ALL TIMES', 256, 230);

    ctx.fillStyle = '#64748b';
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillText('ANSI Z358.1 COMPLIANT · 15 MIN FLUSH', 256, 280);
    ctx.fillText('PULL CHAIN FOR SHOWER · PUSH PADDLE FOR EYES', 256, 325);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const createAcousticPosterTexture = (): THREE.CanvasTexture => {
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
    ctx.textAlign = 'left';
    ctx.fillText('ACOUSTIC RESONANCE & SPEED OF SOUND IN GASES', 32, 48);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.fillText('PHYSICS LABORATORY REFERENCE · SECTION 02', 32, 75);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 92);
    ctx.lineTo(736, 92);
    ctx.stroke();

    // Box 1: Temperature Dependency
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(32, 110, 336, 170);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(32, 110, 336, 170);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.fillText('Temperature Dependency', 52, 142);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('v(T) = 331.3 · √(1 + T/273.15)', 52, 182);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('At T = 20°C: v ≈ 343.2 m/s', 52, 220);
    ctx.fillText('Medium: Standard dry atmospheric air', 52, 245);

    // Box 2: Closed Column Resonance
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(400, 110, 336, 170);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(400, 110, 336, 170);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.fillText('Closed-End Column Harmonics', 420, 142);

    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('f_n = n · v / (4L),  n = 1, 3, 5...', 420, 182);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('Quarter-wave antinode at open mouth', 420, 220);
    ctx.fillText('Displacement node at water barrier', 420, 245);

    // Diagram section at bottom
    ctx.fillStyle = '#090d16';
    ctx.fillRect(32, 300, 704, 180);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(32, 300, 704, 180);

    const waveY = [340, 390, 440];
    const waveLabels = ['Fundamental (n=1, L = λ/4)', '3rd Harmonic (n=3, L = 3λ/4)', '5th Harmonic (n=5, L = 5λ/4)'];
    const waveColors = ['#38bdf8', '#a78bfa', '#fb923c'];

    waveY.forEach((wy, idx) => {
      ctx.fillStyle = waveColors[idx];
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.fillText(waveLabels[idx], 50, wy + 5);

      ctx.strokeStyle = waveColors[idx];
      ctx.lineWidth = 2;
      ctx.beginPath();
      const nHarmonic = 1 + idx * 2;
      for (let px = 330; px <= 700; px += 2) {
        const theta = ((px - 330) / 370) * (nHarmonic * Math.PI / 2);
        const yOffset = Math.sin(theta) * 14;
        if (px === 330) ctx.moveTo(px, wy - yOffset);
        else ctx.lineTo(px, wy - yOffset);
      }
      ctx.stroke();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const createElectroPosterTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 768, 512);

    ctx.fillStyle = '#fb923c';
    ctx.fillRect(0, 0, 768, 8);

    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 24px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('COULOMB LAW & ELECTRIC DIPOLE FIELDS', 32, 48);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.fillText('PHYSICS LABORATORY REFERENCE · SECTION 03', 32, 75);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 92);
    ctx.lineTo(736, 92);
    ctx.stroke();

    // Box 1: Coulomb's Law
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(32, 110, 336, 170);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(32, 110, 336, 170);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.fillText("Coulomb's Law of Electrostatics", 52, 142);

    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('F_e = k_e · |q₁ · q₂| / r²', 52, 182);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('k_e = 1 / (4πε₀) = 8.98755 × 10⁹ N·m²/C²', 52, 220);
    ctx.fillText('Inverse-square distance falloff ∝ 1/r²', 52, 245);

    // Box 2: Electric Field Strength
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(400, 110, 336, 170);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(400, 110, 336, 170);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.fillText('Midpoint Field Intensity', 420, 142);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('E = k_e · |q| / (r/2)²', 420, 182);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('Opposite charges (+/-): Fields ADD at midpoint', 420, 220);
    ctx.fillText('Like charges (+/+): Fields CANCEL at midpoint', 420, 245);

    // Diagram section at bottom
    ctx.fillStyle = '#090d16';
    ctx.fillRect(32, 300, 704, 180);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(32, 300, 704, 180);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(200, 390, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('+q₁', 200, 398);

    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(568, 390, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText('-q₂', 568, 398);

    ctx.lineWidth = 2;
    [-40, -20, 0, 20, 40].forEach((offset) => {
      ctx.strokeStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(228, 390);
      ctx.bezierCurveTo(320, 390 + offset * 2.2, 448, 390 + offset * 2.2, 540, 390);
      ctx.stroke();
    });

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillText('Midpoint Field Probe Target', 384, 335);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const doorSignTexture = createEngravedWoodSignTexture(
    'DEPARTMENT OF PHYSICS   ·   EXPERIMENTAL SCIENCES',
    'EXIT   ·   MAIN LABORATORY HALLWAY',
    '✦   ROOM 02 EXIT   ·   PRESS [E] OR CLICK TO RETURN TO HALLWAY   ✦'
  );
  const whiteboardTexture = createPhysicsWhiteboardTexture();
  const oscilloscopeTexture = createOscilloscopeScreenTexture();
  const functionGenTexture = createFunctionGenTexture();
  const multimeterTexture = createMultimeterTexture();
  const eyewashSignTexture = createEyewashSignTexture();
  const acousticPosterTexture = createAcousticPosterTexture();
  const electroPosterTexture = createElectroPosterTexture();


  scene.add(new THREE.HemisphereLight(0x9dd8ff, 0x121827, 1.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.05);
  keyLight.position.set(5, 10, 8);
  keyLight.castShadow = true;
  scene.add(keyLight);
  const stationLight = new THREE.PointLight(STATION_COLOR.wave, 22, 14, 2);
  stationLight.position.set(STATION_X.wave, 4.4, 2);
  scene.add(stationLight);

  const guidanceMaterial = new THREE.MeshStandardMaterial({
    color: STATION_COLOR.wave,
    emissive: STATION_COLOR.wave,
    emissiveIntensity: 3.2,
    roughness: 0.18,
    metalness: 0.12,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const guidanceRingMaterial = new THREE.MeshBasicMaterial({
    color: STATION_COLOR.wave,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
  });
  const guidanceBeamMaterial = new THREE.LineBasicMaterial({
    color: STATION_COLOR.wave,
    transparent: true,
    opacity: 0.70,
    depthTest: false,
    depthWrite: false,
  });

  const guidanceMarker = new THREE.Group();
  guidanceMarker.name = 'GuidanceMarker';
  guidanceMarker.renderOrder = 9999;

  // 1. Tapered Downward Pointer Arrow
  const guidanceArrow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 20), guidanceMaterial);
  guidanceArrow.rotation.z = Math.PI; // Cone pointing down!
  guidanceArrow.position.y = 0.13;
  guidanceArrow.renderOrder = 9999;

  // 2. Upper Arrow Shaft
  const guidanceShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.18, 16), guidanceMaterial);
  guidanceShaft.position.y = 0.35;
  guidanceShaft.renderOrder = 9999;

  // 3. Concentric Pulsing Target Rings
  const guidanceRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 12, 36), guidanceRingMaterial);
  guidanceRing.rotation.x = Math.PI / 2;
  guidanceRing.position.y = 0;
  guidanceRing.renderOrder = 9999;

  const guidanceInnerRing = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 12, 28), guidanceRingMaterial);
  guidanceInnerRing.rotation.x = Math.PI / 2;
  guidanceInnerRing.position.y = 0;
  guidanceInnerRing.renderOrder = 9999;

  // 4. Vertical Guidance Laser Guide-Line pointing directly down to target
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

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM2_CONFIG.room.width, ROOM2_CONFIG.room.depth), material(0x607188, { map: floorTexture, roughness: 0.88, metalness: 0.08 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(ROOM2_CONFIG.room.width, ROOM2_CONFIG.room.width, 0x1b506a, 0x183044);
  grid.position.y = 0.006;
  scene.add(grid);

  // Safety Yellow Walkway Perimeter Lines
  const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
  const yellowLine = new THREE.Mesh(new THREE.PlaneGeometry(ROOM2_CONFIG.room.width - 2, 0.08), yellowLineMat);
  yellowLine.rotation.x = -Math.PI / 2;
  yellowLine.position.set(0, 0.008, 2.8);
  scene.add(yellowLine);

  const wallMaterial = material(0x22324a, { roughness: 0.78, metalness: 0.06 });
  const wainscotMaterial = material(0x152232, { roughness: 0.82, metalness: 0.10 });
  const trimMaterial = material(0x33445b, { roughness: 0.35, metalness: 0.75 });
  const columnMaterial = material(0x1b283b, { roughness: 0.72, metalness: 0.18 });
  const shelfSteelMat = material(0x475569, { roughness: 0.35, metalness: 0.85 });
  const cabinetBodyMat = material(0x1e2a3a, { roughness: 0.55, metalness: 0.35 });
  const cabinetTopMat = material(0x161e29, { map: benchTexture, roughness: 0.32, metalness: 0.15 });
  const chromeHandleMat = material(0xe2e8f0, { roughness: 0.15, metalness: 0.95 });
  const sinkMat = material(0xcfd8dc, { roughness: 0.22, metalness: 0.92 });
  const yellowSafetyMat = material(0xfacc15, { roughness: 0.35, metalness: 0.25 });

  const addWallSegment = (width: number, height: number, x: number, y: number, z: number) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, ROOM2_CONFIG.room.wallThickness), wallMaterial);
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

  // Two-tone Architectural Wainscoting & Baseboards on Back Wall
  const backLeftWidth = doorLeft + roomHalfWidth;
  const backLeftCenterX = (doorLeft - roomHalfWidth) / 2;
  const wainscotBackLeft = new THREE.Mesh(new THREE.BoxGeometry(backLeftWidth, 1.15, 0.04), wainscotMaterial);
  wainscotBackLeft.position.set(backLeftCenterX, 0.575, ROOM2_CONFIG.room.backZ + 0.18);
  scene.add(wainscotBackLeft);

  const chairRailBackLeft = new THREE.Mesh(new THREE.BoxGeometry(backLeftWidth, 0.05, 0.06), trimMaterial);
  chairRailBackLeft.position.set(backLeftCenterX, 1.15, ROOM2_CONFIG.room.backZ + 0.19);
  scene.add(chairRailBackLeft);

  const baseboardBackLeft = new THREE.Mesh(new THREE.BoxGeometry(backLeftWidth, 0.16, 0.08), trimMaterial);
  baseboardBackLeft.position.set(backLeftCenterX, 0.08, ROOM2_CONFIG.room.backZ + 0.20);
  scene.add(baseboardBackLeft);

  // Back Wall Right of Door Wainscoting
  const backRightWidth = roomHalfWidth - doorRight;
  const backRightCenterX = (doorRight + roomHalfWidth) / 2;
  const wainscotBackRight = new THREE.Mesh(new THREE.BoxGeometry(backRightWidth, 1.15, 0.04), wainscotMaterial);
  wainscotBackRight.position.set(backRightCenterX, 0.575, ROOM2_CONFIG.room.backZ + 0.18);
  scene.add(wainscotBackRight);

  const chairRailBackRight = new THREE.Mesh(new THREE.BoxGeometry(backRightWidth, 0.05, 0.06), trimMaterial);
  chairRailBackRight.position.set(backRightCenterX, 1.15, ROOM2_CONFIG.room.backZ + 0.19);
  scene.add(chairRailBackRight);

  const baseboardBackRight = new THREE.Mesh(new THREE.BoxGeometry(backRightWidth, 0.16, 0.08), trimMaterial);
  baseboardBackRight.position.set(backRightCenterX, 0.08, ROOM2_CONFIG.room.backZ + 0.20);
  scene.add(baseboardBackRight);

  // 2. Front Wall (South Wall at Z = +7.40m) & Daylight Clerestory Window Ribbon
  const frontZ = -ROOM2_CONFIG.room.backZ;
  const southWall = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width, ROOM2_CONFIG.room.height, ROOM2_CONFIG.room.wallThickness), wallMaterial);
  southWall.position.set(0, ROOM2_CONFIG.room.height / 2, frontZ);
  southWall.receiveShadow = true;
  scene.add(southWall);

  const southWainscot = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 1.15, 0.04), wainscotMaterial);
  southWainscot.position.set(0, 0.575, frontZ - 0.18);
  scene.add(southWainscot);

  const southBaseboard = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 0.16, 0.08), trimMaterial);
  southBaseboard.position.set(0, 0.08, frontZ - 0.20);
  scene.add(southBaseboard);

  const southChairRail = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 0.05, 0.06), trimMaterial);
  southChairRail.position.set(0, 1.15, frontZ - 0.19);
  scene.add(southChairRail);

  // Wall Utility Raceway at 0.95m
  const southRaceway = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width - 2, 0.08, 0.06), material(0x64748b, { metalness: 0.85, roughness: 0.2 }));
  southRaceway.position.set(0, 0.95, frontZ - 0.18);
  scene.add(southRaceway);

  // Clerestory Daylight Observation Window Ribbon on South Wall (y = 3.82m)
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 1024;
  skyCanvas.height = 256;
  const skyContext = skyCanvas.getContext('2d');
  if (skyContext) {
    const skyGradient = skyContext.createLinearGradient(0, 0, 0, 256);
    skyGradient.addColorStop(0, '#9bd8ff');
    skyGradient.addColorStop(0.55, '#e5f4ff');
    skyGradient.addColorStop(0.56, '#7897a4');
    skyGradient.addColorStop(1, '#263d4d');
    skyContext.fillStyle = skyGradient;
    skyContext.fillRect(0, 0, 1024, 256);
    skyContext.fillStyle = 'rgba(255,255,255,.62)';
    for (let index = 0; index < 7; index += 1) skyContext.fillRect(70 + index * 145, 60 + (index % 2) * 18, 95, 8);
    skyContext.fillStyle = '#324f5e';
    for (let index = 0; index < 18; index += 1) skyContext.fillRect(index * 62, 175 - (index % 4) * 12, 45, 85);
  }
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;

  const ribbonWidth = 15.6;
  const ribbonHeight = 0.62;
  const ribbonCenterY = 3.82;
  const ribbonZ = frontZ - 0.18;

  const ribbonFrame = new THREE.Mesh(new THREE.BoxGeometry(ribbonWidth + 0.16, ribbonHeight + 0.12, 0.06), trimMaterial);
  ribbonFrame.position.set(0, ribbonCenterY, ribbonZ);
  scene.add(ribbonFrame);

  const ribbonSky = new THREE.Mesh(
    new THREE.PlaneGeometry(ribbonWidth, ribbonHeight),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.DoubleSide })
  );
  ribbonSky.position.set(0, ribbonCenterY, ribbonZ - 0.01);
  ribbonSky.rotation.y = Math.PI;
  scene.add(ribbonSky);

  const ribbonGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(ribbonWidth, ribbonHeight),
    new THREE.MeshPhysicalMaterial({
      color: 0xf1f5f9,
      transparent: true,
      opacity: 0.18,
      roughness: 0.06,
      metalness: 0.25,
      side: THREE.DoubleSide,
    })
  );
  ribbonGlass.position.set(0, ribbonCenterY, ribbonZ - 0.03);
  ribbonGlass.rotation.y = Math.PI;
  scene.add(ribbonGlass);

  for (let mx = -7.0; mx <= 7.0; mx += 2.0) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, ribbonHeight, 0.06), trimMaterial);
    mullion.position.set(mx, ribbonCenterY, ribbonZ - 0.02);
    scene.add(mullion);
  }

  registerInteraction(ribbonGlass, {
    id: 'lab-window',
    stationId: 'wave',
    category: 'LABORATORY ENVIRONMENT',
    name: 'Daylight Observation Window',
    action: 'Inspect external campus courtyard',
    readout: 'Natural exterior daylight · university science quad orientation',
  });

  // Natural Daylight streaming from South clerestory window
  const daylight = new THREE.DirectionalLight(0xccecff, 1.35);
  daylight.position.set(0, 4.2, frontZ - 1.0);
  daylight.target.position.set(0, 1.0, 0);
  scene.add(daylight);
  scene.add(daylight.target);

  // 3. Side Walls (East at +10.8m, West at -10.8m)
  const sideWallMaterial = material(0x22324a, { roughness: 0.82, metalness: 0.06 });
  [-ROOM2_CONFIG.room.sideX, ROOM2_CONFIG.room.sideX].forEach((x) => {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.wallThickness, ROOM2_CONFIG.room.height, ROOM2_CONFIG.room.depth), sideWallMaterial);
    sideWall.position.set(x, ROOM2_CONFIG.room.height / 2, 0);
    sideWall.receiveShadow = true;
    scene.add(sideWall);

    const sideBaseboard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, ROOM2_CONFIG.room.depth), trimMaterial);
    sideBaseboard.position.set(x > 0 ? x - 0.20 : x + 0.20, 0.08, 0);
    scene.add(sideBaseboard);

    const sideChairRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, ROOM2_CONFIG.room.depth), trimMaterial);
    sideChairRail.position.set(x > 0 ? x - 0.19 : x + 0.19, 1.15, 0);
    scene.add(sideChairRail);

    // Wall Utility Raceway at 0.95m
    const raceway = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, ROOM2_CONFIG.room.depth - 2), material(0x64748b, { metalness: 0.85, roughness: 0.2 }));
    raceway.position.set(x > 0 ? x - 0.18 : x + 0.18, 0.95, 0);
    scene.add(raceway);
  });

  // Structural Columns in Corners
  [
    [-roomHalfWidth + 0.45, ROOM2_CONFIG.room.backZ + 0.45],
    [roomHalfWidth - 0.45, ROOM2_CONFIG.room.backZ + 0.45],
    [-roomHalfWidth + 0.45, frontZ - 0.45],
    [roomHalfWidth - 0.45, frontZ - 0.45],
  ].forEach(([cx, cz]) => {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.65, ROOM2_CONFIG.room.height, 0.65), columnMaterial);
    col.position.set(cx, ROOM2_CONFIG.room.height / 2, cz);
    col.receiveShadow = true;
    scene.add(col);

    const colBase = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.16, 0.75), trimMaterial);
    colBase.position.set(cx, 0.08, cz);
    scene.add(colBase);
  });

  // 4. Suspended Ceiling Grid, HVAC Spiral Duct & Cable Trays (y = 4.20m)
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 0.16, ROOM2_CONFIG.room.depth), material(0x0a1424, { roughness: 0.92 }));
  ceiling.position.y = ROOM2_CONFIG.room.height;
  scene.add(ceiling);

  // Ceiling Grid T-Bars
  for (let gx = -ROOM2_CONFIG.room.width / 2 + 2; gx <= ROOM2_CONFIG.room.width / 2 - 2; gx += 2.4) {
    const tBarX = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, ROOM2_CONFIG.room.depth - 0.2), trimMaterial);
    tBarX.position.set(gx, ROOM2_CONFIG.room.height - 0.08, 0);
    scene.add(tBarX);
  }
  for (let gz = -ROOM2_CONFIG.room.depth / 2 + 1.8; gz <= ROOM2_CONFIG.room.depth / 2 - 1.8; gz += 1.8) {
    const tBarZ = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width - 0.2, 0.035, 0.035), trimMaterial);
    tBarZ.position.set(0, ROOM2_CONFIG.room.height - 0.08, gz);
    scene.add(tBarZ);
  }

  // Overhead Galvanized Spiral HVAC Supply Duct (0.32m diameter)
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, ROOM2_CONFIG.room.depth - 2, 20), material(0x94a3b8, { metalness: 0.82, roughness: 0.25 }));
  duct.rotation.x = Math.PI / 2;
  duct.position.set(0, ROOM2_CONFIG.room.height - 0.45, 0);
  scene.add(duct);

  // HVAC Drop-Rod Hangers & Louvered Diffusers
  [-5.0, -1.8, 1.8, 5.0].forEach((dz) => {
    const dropRod = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.45, 8), trimMaterial);
    dropRod.position.set(0, ROOM2_CONFIG.room.height - 0.22, dz);
    scene.add(dropRod);

    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.55), material(0x94a3b8, { metalness: 0.75, roughness: 0.3 }));
    diffuser.position.set(0, ROOM2_CONFIG.room.height - 0.08, dz);
    scene.add(diffuser);
  });

  // Suspended Yellow Cable Trays
  [-4.8, 4.8].forEach((tx) => {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, ROOM2_CONFIG.room.depth - 2.4), material(0xd97706, { metalness: 0.65, roughness: 0.35 }));
    tray.position.set(tx, 3.88, 0);
    scene.add(tray);

    [-4.8, 0, 4.8].forEach((tz) => {
      const trayHanger = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 8), trimMaterial);
      trayHanger.position.set(tx, 4.04, tz);
      scene.add(trayHanger);
    });
  });

  // 5. Industrial Overhead Lighting Fixture Troffers (6 Units: 3 over Back Casework, 3 over Stations)
  const fixtureHousingMat = material(0x334155, { metalness: 0.85, roughness: 0.25 });
  const fixtureDiffuserMat = material(0xffffff, { emissive: 0xdbeafe, emissiveIntensity: 1.15 });

  [
    [-6.0, -4.5], [0.0, -4.5], [6.0, -4.5],
    [-6.0, 2.5], [0.0, 2.5], [6.0, 2.5],
  ].forEach(([lx, lz]) => {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.10, 0.50), fixtureHousingMat);
    housing.position.set(lx, ROOM2_CONFIG.room.height - 0.05, lz);
    scene.add(housing);

    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.03, 0.42), fixtureDiffuserMat);
    diffuser.position.set(lx, ROOM2_CONFIG.room.height - 0.09, lz);
    scene.add(diffuser);

    const trofferLight = new THREE.PointLight(0xf0f8ff, 3.6, 12, 1.8);
    trofferLight.position.set(lx, ROOM2_CONFIG.room.height - 0.25, lz);
    scene.add(trofferLight);
  });

  // Dedicated Whiteboard Directional Wash Spotlight (South Wall)
  const whiteboardWash = new THREE.SpotLight(0xfffaed, 2.8, 10, Math.PI / 3, 0.45, 1.5);
  whiteboardWash.position.set(0, 3.85, 4.40);
  whiteboardWash.target.position.set(0, 2.20, frontZ - 0.18);
  scene.add(whiteboardWash);
  scene.add(whiteboardWash.target);

  // Dedicated Metrology Bench Directional Wash Spotlight (South Wall)
  const metrologyWash = new THREE.SpotLight(0xf0f9ff, 2.8, 10, Math.PI / 3, 0.45, 1.5);
  metrologyWash.position.set(5.80, 3.85, 4.40);
  metrologyWash.target.position.set(5.80, 1.00, frontZ - 0.18);
  scene.add(metrologyWash);
  scene.add(metrologyWash.target);

  // ==============================================================
  // 6. SOUTH WALL CASEWORK, WHITEBOARD & METROLOGY ("THE OTHER SIDE")
  // ==============================================================

  // --- SECTION A: CENTER SOUTH LECTURE WHITEBOARD & CREDENZA (x = 0.0m) ---

  // A1. Master Lecture Whiteboard (x = 0.0m, y = 2.25m, facing North)
  const whiteboardGroup = new THREE.Group();
  whiteboardGroup.position.set(0, 2.25, frontZ - 0.18);
  whiteboardGroup.rotation.y = Math.PI;

  const wbFrame = new THREE.Mesh(new THREE.BoxGeometry(6.80, 2.20, 0.06), material(0x94a3b8, { metalness: 0.85, roughness: 0.20 }));
  wbFrame.position.set(0, 0, 0);
  whiteboardGroup.add(wbFrame);

  const wbFace = new THREE.Mesh(new THREE.PlaneGeometry(6.65, 2.05), material(0xffffff, { map: whiteboardTexture, roughness: 0.32, metalness: 0.04 }));
  wbFace.position.set(0, 0, 0.035);
  whiteboardGroup.add(wbFace);

  // Marker tray shelf
  const wbTray = new THREE.Mesh(new THREE.BoxGeometry(6.70, 0.04, 0.08), trimMaterial);
  wbTray.position.set(0, -1.12, 0.05);
  whiteboardGroup.add(wbTray);

  // Dry-erase markers and felt eraser on shelf
  const markerColors = [0x0f172a, 0x0284c7, 0xd97706, 0xdc2626];
  markerColors.forEach((color, idx) => {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 12), material(color));
    marker.rotation.z = Math.PI / 2;
    marker.position.set(-0.8 + idx * 0.18, -1.10, 0.05);
    whiteboardGroup.add(marker);
  });
  const eraser = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.06), material(0x475569));
  eraser.position.set(0.25, -1.10, 0.05);
  whiteboardGroup.add(eraser);

  scene.add(whiteboardGroup);
  registerInteraction(wbFace, {
    id: 'lab-whiteboard',
    stationId: 'wave',
    category: 'THEORY & EQUATIONS',
    name: 'Physics Laboratory Whiteboard',
    action: 'Open laboratory notebook to inspect theoretical derivations',
    readout: 'Wave velocity v = √(T/μ) · Acoustic harmonics · Coulomb Law F = k|q₁q₂|/r²',
  });

  // A2. Under-Whiteboard Low Credenza / Casework (x = 0.0m, y = 0.43m, facing North)
  const credenzaGroup = new THREE.Group();
  credenzaGroup.position.set(0, 0.43, frontZ - 0.32);
  credenzaGroup.rotation.y = Math.PI;

  const credenzaBody = new THREE.Mesh(new THREE.BoxGeometry(6.40, 0.86, 0.58), cabinetBodyMat);
  credenzaBody.receiveShadow = true;
  credenzaGroup.add(credenzaBody);

  const credenzaTop = new THREE.Mesh(new THREE.BoxGeometry(6.44, 0.06, 0.62), cabinetTopMat);
  credenzaTop.position.set(0, 0.44, 0);
  credenzaGroup.add(credenzaTop);

  // Drawer pull handles
  for (let dx = -2.4; dx <= 2.4; dx += 1.2) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.03), chromeHandleMat);
    handle.position.set(dx, 0.20, 0.30);
    credenzaGroup.add(handle);
  }

  // Props on credenza: Stack of physics lab manuals
  [-1.6, 1.8].forEach((bx) => {
    const bookStack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.34), material(0x1e3a8a, { roughness: 0.6 }));
    bookStack.position.set(bx, 0.51, 0);
    credenzaGroup.add(bookStack);
  });
  // Component organizer unit
  const organizer = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.22), material(0x334155, { roughness: 0.4 }));
  organizer.position.set(0.4, 0.63, 0);
  credenzaGroup.add(organizer);

  scene.add(credenzaGroup);

  // --- SECTION B: WEST SOUTH APPARATUS PREP COUNTER & SINK (x = -5.80m) ---
  const prepGroup = new THREE.Group();
  prepGroup.position.set(-5.80, 0.45, frontZ - 0.38);
  prepGroup.rotation.y = Math.PI;

  const prepCounter = new THREE.Mesh(new THREE.BoxGeometry(2.20, 0.90, 0.70), cabinetBodyMat);
  prepCounter.receiveShadow = true;
  prepGroup.add(prepCounter);

  const prepTop = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.06, 0.74), cabinetTopMat);
  prepTop.position.set(0, 0.46, 0);
  prepGroup.add(prepTop);

  // Inset stainless sink basin
  const prepSink = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.42), sinkMat);
  prepSink.position.set(-0.35, 0.42, 0);
  prepGroup.add(prepSink);

  // Tall gooseneck chrome faucet
  const faucetBase = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 12), chromeHandleMat);
  faucetBase.position.set(-0.35, 0.62, -0.16);
  prepGroup.add(faucetBase);

  const faucetCurve = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 8, 16, Math.PI), chromeHandleMat);
  faucetCurve.position.set(-0.35, 0.76, -0.10);
  prepGroup.add(faucetCurve);

  // Glassware drying pegboard on wall above sink
  const pegboard = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.85, 0.03), material(0x334155, { roughness: 0.6, metalness: 0.2 }));
  pegboard.position.set(0, 1.45, -0.32);
  prepGroup.add(pegboard);

  // Drying pegs with small inverted beakers
  for (let px = -0.7; px <= 0.7; px += 0.28) {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), material(0xca8a04, { roughness: 0.4 }));
    peg.rotation.x = Math.PI / 4;
    peg.position.set(px, 1.45, -0.26);
    prepGroup.add(peg);
  }

  // Cabinet drawer and door handles
  [-0.6, 0.6].forEach((hx) => {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.03), chromeHandleMat);
    handle.position.set(hx, 0.20, 0.36);
    prepGroup.add(handle);
  });

  scene.add(prepGroup);
  registerInteraction([prepTop, prepSink], {
    id: 'lab-prep-sink',
    stationId: 'sound',
    category: 'LABORATORY INFRASTRUCTURE',
    name: 'Apparatus Prep Sink & Drying Rack',
    action: 'Inspect staging and cleaning sink',
    readout: 'Deionized water tap · borosilicate drying pegs · chemical drain',
  });

  // --- SECTION C: EAST SOUTH METROLOGY & TESTING BENCH (x = +5.80m) ---
  const metroGroup = new THREE.Group();
  metroGroup.position.set(5.80, 0.45, frontZ - 0.38);
  metroGroup.rotation.y = Math.PI;

  const metroCounter = new THREE.Mesh(new THREE.BoxGeometry(3.00, 0.90, 0.72), cabinetBodyMat);
  metroCounter.receiveShadow = true;
  metroGroup.add(metroCounter);

  const metroTop = new THREE.Mesh(new THREE.BoxGeometry(3.04, 0.06, 0.76), cabinetTopMat);
  metroTop.position.set(0, 0.46, 0);
  metroGroup.add(metroTop);

  // Modular handles on bench
  [-0.9, 0.0, 0.9].forEach((hx) => {
    const handle1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.03), chromeHandleMat);
    handle1.position.set(hx, 0.22, 0.37);
    metroGroup.add(handle1);
    const handle2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.03), chromeHandleMat);
    handle2.position.set(hx, -0.15, 0.37);
    metroGroup.add(handle2);
  });

  // Elevated upper shelving unit
  const metroShelf = new THREE.Mesh(new THREE.BoxGeometry(2.90, 0.04, 0.36), material(0x1e293b, { roughness: 0.3, metalness: 0.2 }));
  metroShelf.position.set(0, 1.45, -0.16);
  metroGroup.add(metroShelf);

  [-1.1, 0, 1.1].forEach((sx) => {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.34), shelfSteelMat);
    bracket.position.set(sx, 1.26, -0.16);
    metroGroup.add(bracket);
  });

  // C1. Tektronix Digital Storage Oscilloscope (DSO)
  const oscGroup = new THREE.Group();
  oscGroup.position.set(-0.95, 0.65, 0.05);

  const oscChassis = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.22), material(0x1e293b, { roughness: 0.4, metalness: 0.3 }));
  oscGroup.add(oscChassis);

  const oscScreenBezel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.02), material(0x0f172a, { roughness: 0.2 }));
  oscScreenBezel.position.set(-0.04, 0.02, 0.11);
  oscGroup.add(oscScreenBezel);

  const oscScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.16),
    new THREE.MeshStandardMaterial({
      map: oscilloscopeTexture,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.05,
    })
  );
  oscScreen.position.set(-0.04, 0.02, 0.122);
  oscGroup.add(oscScreen);

  // Rotary knobs and BNC connectors
  [0.12, 0.12].forEach((kx, i) => {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), material(0x94a3b8, { metalness: 0.8 }));
    knob.rotation.x = Math.PI / 2;
    knob.position.set(kx, 0.06 - i * 0.06, 0.12);
    oscGroup.add(knob);
  });
  [-0.04, 0.04].forEach((bx) => {
    const bnc = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.025, 12), material(0xf1f5f9, { metalness: 0.95 }));
    bnc.rotation.x = Math.PI / 2;
    bnc.position.set(bx, -0.09, 0.12);
    oscGroup.add(bnc);
  });
  // Carry handle on top
  const oscHandle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.02), material(0x475569));
  oscHandle.position.set(0, 0.15, 0);
  oscGroup.add(oscHandle);

  metroGroup.add(oscGroup);
  registerInteraction([oscChassis, oscScreen], {
    id: 'lab-oscilloscope',
    stationId: 'electro',
    category: 'METROLOGY INSTRUMENT',
    name: 'Digital Storage Oscilloscope',
    action: 'Inspect captured waveform and harmonic channels',
    readout: 'Tektronix TDS2024B · 200 MHz · Dual-channel real-time waveform',
  });

  // C2. Agilent Precision Synthesized Function Generator
  const fgGroup = new THREE.Group();
  fgGroup.position.set(-0.30, 0.58, 0.05);

  const fgChassis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.24), material(0x334155, { roughness: 0.35, metalness: 0.4 }));
  fgGroup.add(fgChassis);

  const fgScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.08),
    new THREE.MeshStandardMaterial({
      map: functionGenTexture,
      emissive: 0xef4444,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    })
  );
  fgScreen.position.set(-0.06, 0.01, 0.122);
  fgGroup.add(fgScreen);

  const fgDial = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 16), material(0x0f172a));
  fgDial.rotation.x = Math.PI / 2;
  fgDial.position.set(0.10, 0.01, 0.12);
  fgGroup.add(fgDial);

  metroGroup.add(fgGroup);
  registerInteraction([fgChassis, fgScreen], {
    id: 'lab-function-gen',
    stationId: 'electro',
    category: 'METROLOGY INSTRUMENT',
    name: 'Synthesized Function Generator',
    action: 'Inspect frequency signal generator',
    readout: '1.000 kHz calibrated sine wave output · 5.0 Vpp · 50 Ω output impedance',
  });

  // C3. Benchtop Precision Digital Multimeter (DMM)
  const dmmGroup = new THREE.Group();
  dmmGroup.position.set(0.35, 0.56, 0.05);

  const dmmChassis = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.20), material(0xca8a04, { roughness: 0.4 }));
  dmmGroup.add(dmmChassis);

  const dmmScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.06),
    new THREE.MeshStandardMaterial({
      map: multimeterTexture,
      emissive: 0x8ca68c,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    })
  );
  dmmScreen.position.set(0, 0.01, 0.102);
  dmmGroup.add(dmmScreen);

  // Red and black banana test leads
  const redLead = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 8), material(0xef4444));
  redLead.rotation.x = Math.PI / 2;
  redLead.position.set(-0.04, -0.03, 0.11);
  dmmGroup.add(redLead);

  const blackLead = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 8), material(0x0f172a));
  blackLead.rotation.x = Math.PI / 2;
  blackLead.position.set(0.04, -0.03, 0.11);
  dmmGroup.add(blackLead);

  metroGroup.add(dmmGroup);
  registerInteraction([dmmChassis, dmmScreen], {
    id: 'lab-dmm',
    stationId: 'electro',
    category: 'METROLOGY INSTRUMENT',
    name: 'Precision Digital Multimeter',
    action: 'Inspect metrology multimeter readings',
    readout: 'Fluke 8846A · 6.5 digit precision · +12.45 V DC potential',
  });

  // C4. Scientific Glassware Collection (Flasks and Beakers)
  const glassGroup = new THREE.Group();
  glassGroup.position.set(0.95, 0.49, 0.05);

  const flaskMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.42,
    roughness: 0.05,
    metalness: 0.1,
    transmission: 0.85,
    ior: 1.5,
  });

  // 500mL Erlenmeyer flask
  const flaskBody = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 16), flaskMat);
  flaskBody.position.set(-0.15, 0.08, 0);
  glassGroup.add(flaskBody);

  const flaskNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.08, 12), flaskMat);
  flaskNeck.position.set(-0.15, 0.19, 0);
  glassGroup.add(flaskNeck);

  // Copper sulfate blue solution inside flask
  const flaskLiquid = new THREE.Mesh(
    new THREE.ConeGeometry(0.075, 0.09, 14),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, transparent: true, opacity: 0.82, roughness: 0.1 })
  );
  flaskLiquid.position.set(-0.15, 0.05, 0);
  glassGroup.add(flaskLiquid);

  // 250mL Beaker with amber potassium solution
  const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 16), flaskMat);
  beaker.position.set(0.12, 0.07, 0);
  glassGroup.add(beaker);

  const beakerLiquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.048, 0.08, 14),
    new THREE.MeshStandardMaterial({ color: 0xd97706, transparent: true, opacity: 0.82, roughness: 0.1 })
  );
  beakerLiquid.position.set(0.12, 0.04, 0);
  glassGroup.add(beakerLiquid);

  metroGroup.add(glassGroup);
  registerInteraction([flaskBody, beaker], {
    id: 'lab-glassware',
    stationId: 'electro',
    category: 'LABORATORY EQUIPMENT',
    name: 'Calibrated Glassware & Reagent Flasks',
    action: 'Inspect laboratory glassware',
    readout: 'Borosilicate glassware · volumetric standards · dielectric solutions',
  });

  // C5. Props on upper shelf: Heavy-duty Aluminum Tool Case & Parts Bins
  const flightCase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.30), material(0x94a3b8, { roughness: 0.25, metalness: 0.85 }));
  flightCase.position.set(-0.45, 1.58, -0.16);
  metroGroup.add(flightCase);

  const partsBin = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.26), material(0x0284c7, { roughness: 0.5, metalness: 0.2 }));
  partsBin.position.set(0.45, 1.59, -0.16);
  metroGroup.add(partsBin);

  registerInteraction(flightCase, {
    id: 'lab-toolcase',
    stationId: 'electro',
    category: 'LABORATORY EQUIPMENT',
    name: 'Metrology Probe Flight Case',
    action: 'Inspect precision probe storage',
    readout: 'Custom cut-foam insert · high-voltage probes · vernier micrometers',
  });

  scene.add(metroGroup);

  // ==============================================================
  // 7. SIDE WALL FIXTURES & NORTH WALL REFERENCE INFOGRAPHICS
  // ==============================================================

  // --- WEST WALL (x = -10.8m, rotY = Math.PI / 2) ---

  // West Wall Storage Casework Cabinet (z = -2.50m)
  const cabWestGroup = new THREE.Group();
  cabWestGroup.position.set(-ROOM2_CONFIG.room.sideX + 0.35, 1.40, -2.50);
  cabWestGroup.rotation.y = Math.PI / 2;
  const cabWestBody = new THREE.Mesh(new THREE.BoxGeometry(2.30, 2.70, 0.62), cabinetBodyMat);
  cabWestBody.receiveShadow = true;
  cabWestGroup.add(cabWestBody);

  const cabWestGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.18, 2.52), material(0xffffff, { map: environmentTextures[4], roughness: 0.25, metalness: 0.1 }));
  cabWestGlass.position.set(0, 0, 0.32);
  cabWestGroup.add(cabWestGlass);

  [-0.15, 0.15].forEach((hx) => {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.45, 0.04), chromeHandleMat);
    handle.position.set(hx, 0, 0.35);
    cabWestGroup.add(handle);
  });
  scene.add(cabWestGroup);
  registerInteraction(cabWestGlass, {
    id: 'lab-cabinet-west',
    stationId: 'sound',
    category: 'LABORATORY CASEWORK',
    name: 'Apparatus & Storage Cabinet',
    action: 'Inspect laboratory storage inventory',
    readout: 'Calibrated optical components, spare tuning forks, and dielectric rods',
  });

  // West Wall: Laboratory Safety Regulations Poster (z = 0.0m)
  const safetyPosterGroup = new THREE.Group();
  safetyPosterGroup.position.set(-ROOM2_CONFIG.room.sideX + 0.20, 2.20, 0.0);
  safetyPosterGroup.rotation.y = Math.PI / 2;
  const safetyFrame = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.95, 0.05), material(0x334155, { metalness: 0.8, roughness: 0.2 }));
  safetyPosterGroup.add(safetyFrame);
  const safetyFace = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.85), material(0xffffff, { map: environmentTextures[0], roughness: 0.4 }));
  safetyFace.position.set(0, 0, 0.03);
  safetyPosterGroup.add(safetyFace);
  scene.add(safetyPosterGroup);

  // West Wall: Emergency Eyewash & Safety Shower Station (z = +2.50m)
  const eyewashGroup = new THREE.Group();
  eyewashGroup.position.set(-ROOM2_CONFIG.room.sideX + 0.25, 0, 2.50);
  eyewashGroup.rotation.y = Math.PI / 2;

  // ANSI Eyewash Sign on wall
  const eyewashSign = new THREE.Mesh(new THREE.PlaneGeometry(1.10, 0.80), material(0xffffff, { map: eyewashSignTexture, roughness: 0.35 }));
  eyewashSign.position.set(0, 2.25, -0.05);
  eyewashGroup.add(eyewashSign);

  // 3D Yellow Safety Piping & Deluge Shower
  const eyewashPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.45, 12), yellowSafetyMat);
  eyewashPipe.position.set(0, 1.225, 0.12);
  eyewashGroup.add(eyewashPipe);

  const showerArm = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.55, 12), yellowSafetyMat);
  showerArm.rotation.x = Math.PI / 2;
  showerArm.position.set(0, 2.40, 0.38);
  eyewashGroup.add(showerArm);

  const showerHead = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.10, 16), yellowSafetyMat);
  showerHead.rotation.x = Math.PI;
  showerHead.position.set(0, 2.35, 0.62);
  eyewashGroup.add(showerHead);

  const pullChain = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.85, 8), chromeHandleMat);
  pullChain.position.set(0.12, 1.88, 0.58);
  eyewashGroup.add(pullChain);

  const eyewashBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.14, 0.14, 16), sinkMat);
  eyewashBowl.position.set(0, 0.95, 0.32);
  eyewashGroup.add(eyewashBowl);

  const pushPaddle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.02), yellowSafetyMat);
  pushPaddle.position.set(0.22, 1.02, 0.32);
  eyewashGroup.add(pushPaddle);

  // Yellow warning hazard floor marker
  const hazardFloor = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), yellowSafetyMat);
  hazardFloor.rotation.x = -Math.PI / 2;
  hazardFloor.position.set(0, 0.005, 0.60);
  eyewashGroup.add(hazardFloor);

  scene.add(eyewashGroup);
  registerInteraction([eyewashSign, eyewashBowl], {
    id: 'lab-eyewash',
    stationId: 'sound',
    category: 'SAFETY STATION',
    name: 'Emergency Eyewash & Safety Shower',
    action: 'Inspect safety emergency station',
    readout: 'ANSI Z358.1 compliant · 15-minute continuous decontamination flush',
  });

  // --- EAST WALL (x = +10.8m, rotY = -Math.PI / 2) ---

  // East Wall: Auxiliary Storage Cabinet (z = -2.50m)
  const eastCabGroup = new THREE.Group();
  eastCabGroup.position.set(ROOM2_CONFIG.room.sideX - 0.35, 1.40, -2.50);
  eastCabGroup.rotation.y = -Math.PI / 2;
  const eastCabBody = new THREE.Mesh(new THREE.BoxGeometry(2.30, 2.70, 0.62), cabinetBodyMat);
  eastCabGroup.add(eastCabBody);
  const eastCabGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.18, 2.52), material(0xffffff, { map: environmentTextures[4], roughness: 0.25, metalness: 0.1 }));
  eastCabGlass.position.set(0, 0, 0.32);
  eastCabGroup.add(eastCabGlass);
  scene.add(eastCabGroup);
  registerInteraction(eastCabGlass, {
    id: 'lab-cabinet-east',
    stationId: 'electro',
    category: 'LABORATORY CASEWORK',
    name: 'Auxiliary Storage Cabinet',
    action: 'Inspect spare precision components',
    readout: 'Calibrated leads, optical filters, and diagnostic probes',
  });

  // East Wall: Fire Safety Cabinet & PPE Station (z = 0.0m)
  const fireGroup = new THREE.Group();
  fireGroup.position.set(ROOM2_CONFIG.room.sideX - 0.20, 2.00, 0.0);
  fireGroup.rotation.y = -Math.PI / 2;

  const firePlaque = new THREE.Mesh(new THREE.PlaneGeometry(1.30, 1.80), material(0xffffff, { map: environmentTextures[2], roughness: 0.35 }));
  fireGroup.add(firePlaque);

  // 3D Fire Extinguisher
  const extBody = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.44, 16), material(0xdc2626, { roughness: 0.25, metalness: 0.5 }));
  extBody.position.set(0, -0.25, 0.12);
  fireGroup.add(extBody);

  const extTop = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), material(0xdc2626, { roughness: 0.25, metalness: 0.5 }));
  extTop.position.set(0, -0.03, 0.12);
  fireGroup.add(extTop);

  const extValve = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.04), chromeHandleMat);
  extValve.position.set(0, 0.08, 0.12);
  fireGroup.add(extValve);

  const extHose = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.38, 8), material(0x0f172a));
  extHose.position.set(0.09, -0.15, 0.14);
  fireGroup.add(extHose);

  scene.add(fireGroup);
  registerInteraction([firePlaque, extBody], {
    id: 'lab-fire-station',
    stationId: 'sound',
    category: 'SAFETY STATION',
    name: 'Fire Safety & PPE Protection Station',
    action: 'Inspect fire extinguisher and eye protection',
    readout: 'Class ABC dry chemical extinguisher · ANSI Z87.1 splash goggles',
  });

  // East Wall: Main 3-Phase Electrical Distribution Breaker Panel (z = +2.50m)
  const breakerGroup = new THREE.Group();
  breakerGroup.position.set(ROOM2_CONFIG.room.sideX - 0.20, 2.00, 2.50);
  breakerGroup.rotation.y = -Math.PI / 2;

  const breakerPlaque = new THREE.Mesh(new THREE.PlaneGeometry(1.20, 1.80), material(0xffffff, { map: environmentTextures[3], roughness: 0.35, metalness: 0.15 }));
  breakerGroup.add(breakerPlaque);

  // Top Feed Vertical Conduit Pipes running into ceiling
  [-0.25, 0.25].forEach((cx) => {
    const feedConduit = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 12), trimMaterial);
    feedConduit.position.set(cx, 1.15, 0.04);
    breakerGroup.add(feedConduit);
  });
  scene.add(breakerGroup);
  registerInteraction(breakerPlaque, {
    id: 'lab-breaker-panel',
    stationId: 'electro',
    category: 'INFRASTRUCTURE',
    name: 'Main Electrical Distribution Panel',
    action: 'Inspect 3-phase power distribution bus',
    readout: '208Y/120V 3-phase power bus · circuit branch breakers · LOTO protected',
  });

  // --- NORTH WALL INFOGRAPHIC PANELS (Between Stations) ---

  // 1. Acoustic Resonance Reference Panel (x = -3.00m, between Sound and Wave)
  const acousticPosterGroup = new THREE.Group();
  acousticPosterGroup.position.set(-3.00, 2.05, ROOM2_CONFIG.room.backZ + 0.18);
  const acousticFrame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.26, 0.05), material(0x334155, { metalness: 0.8, roughness: 0.2 }));
  acousticPosterGroup.add(acousticFrame);
  const acousticFace = new THREE.Mesh(new THREE.PlaneGeometry(1.80, 1.20), material(0xffffff, { map: acousticPosterTexture, roughness: 0.35 }));
  acousticFace.position.set(0, 0, 0.03);
  acousticPosterGroup.add(acousticFace);
  scene.add(acousticPosterGroup);

  // 2. Electrostatic Fields Reference Panel (x = +3.00m, between Wave and Electro)
  const electroPosterGroup = new THREE.Group();
  electroPosterGroup.position.set(3.00, 2.05, ROOM2_CONFIG.room.backZ + 0.18);
  const electroFrame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.26, 0.05), material(0x334155, { metalness: 0.8, roughness: 0.2 }));
  electroPosterGroup.add(electroFrame);
  const electroFace = new THREE.Mesh(new THREE.PlaneGeometry(1.80, 1.20), material(0xffffff, { map: electroPosterTexture, roughness: 0.35 }));
  electroFace.position.set(0, 0, 0.03);
  electroPosterGroup.add(electroFace);
  scene.add(electroPosterGroup);

  // --- 8. STATION OVERHEAD EDUCATIONAL PLACARDS (Mounted Cleanly on North Wall at y = 3.15m) ---
  (Object.keys(STATION_X) as StationId[]).forEach((id) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.58, 1.58, 0.10), material(0x334155, { metalness: 0.78, roughness: 0.24 }));
    frame.position.set(STATION_X[id], 3.15, ROOM2_CONFIG.room.backZ + 0.18);
    scene.add(frame);
    const placard = new THREE.Mesh(new THREE.PlaneGeometry(2.42, 1.42), material(0xffffff, { map: placardTextures[id], roughness: 0.38, metalness: 0.04 }));
    placard.position.set(STATION_X[id], 3.15, ROOM2_CONFIG.room.backZ + 0.24);
    scene.add(placard);
    registerInteraction(placard, {
      id: `${id}-placard`, stationId: id, category: 'THEORY & PLACARD', name: `${id === 'wave' ? 'Transverse Waves' : id === 'sound' ? 'Sound Resonance' : 'Electrostatics'} Visual Reference`,
      action: 'Open the station notebook and inspect the theory', readout: 'Lesson reference · apparatus overview · governing relationship',
    });
  });


  const doorGroup = new THREE.Group();
  doorGroup.name = 'Room02DoorGroup';
  doorGroup.position.set(ROOM2_CONFIG.door.x, 0, ROOM2_CONFIG.door.z);
  scene.add(doorGroup);

  // Deep pitch-black doorway interior cavity / void behind the exit door
  const blackExitPortal = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM2_CONFIG.door.width, ROOM2_CONFIG.door.height, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
  );
  blackExitPortal.position.set(0, ROOM2_CONFIG.door.height / 2, -0.60);
  doorGroup.add(blackExitPortal);

  // Black doorway threshold floor extension into the dark void
  const blackExitFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM2_CONFIG.door.width, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })
  );
  blackExitFloor.rotation.x = -Math.PI / 2;
  blackExitFloor.position.set(0, 0.001, -0.60);
  doorGroup.add(blackExitFloor);

  // Pitch-black doorway backdrop plane right behind the exit door leaves
  const blackExitBackdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM2_CONFIG.door.width, ROOM2_CONFIG.door.height),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })
  );
  blackExitBackdrop.position.set(0, ROOM2_CONFIG.door.height / 2, -0.01);
  doorGroup.add(blackExitBackdrop);

  // Architectural Polished Brass Threshold Plate
  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(2.92, 0.016, 0.28),
    doorBrassMat
  );
  threshold.position.set(0, 0.008, 0.18);
  doorGroup.add(threshold);

  // Floor Inlaid Brass Beading Line
  const brassInlay = new THREE.Mesh(
    new THREE.PlaneGeometry(2.86, 0.035),
    doorDarkBrassMat
  );
  brassInlay.rotation.x = -Math.PI / 2;
  brassInlay.position.set(0, 0.003, 0.36);
  doorGroup.add(brassInlay);

  // Overhead Engraved Mahogany Laboratory Transom Sign
  const signMat = new THREE.MeshStandardMaterial({
    map: doorSignTexture,
    roughness: 0.38,
    metalness: 0.06,
    emissive: 0x221204,
    emissiveIntensity: 0.02,
  });

  // 1. Engraved Wood Plaque Center Board
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.72, 0.06), signMat);
  signBoard.position.set(0, 3.75, 0.12);
  doorGroup.add(signBoard);

  // 2. Surrounding Solid Mahogany Molding Frame
  const signOuterFrame = new THREE.Mesh(
    new THREE.BoxGeometry(2.96, 0.84, 0.10),
    doorMahoganyMat
  );
  signOuterFrame.position.set(0, 3.75, 0.08);
  doorGroup.add(signOuterFrame);

  // 3. Inset Antique Brass Molding Trim
  const signInnerTrim = new THREE.Mesh(
    new THREE.BoxGeometry(2.88, 0.76, 0.08),
    doorDarkBrassMat
  );
  signInnerTrim.position.set(0, 3.75, 0.09);
  doorGroup.add(signInnerTrim);

  // 4. Classical Crown Molding Cornice Header
  const cornice = new THREE.Mesh(
    new THREE.BoxGeometry(3.04, 0.10, 0.18),
    doorMahoganyMat
  );
  cornice.position.set(0, 4.21, 0.12);
  doorGroup.add(cornice);

  const corniceBrassRail = new THREE.Mesh(
    new THREE.BoxGeometry(3.00, 0.025, 0.19),
    doorBrassMat
  );
  corniceBrassRail.position.set(0, 4.16, 0.13);
  doorGroup.add(corniceBrassRail);

  // 5. Overhead Gallery Picture Lamp / Transom Luminaire
  const luminaireGroup = new THREE.Group();
  luminaireGroup.position.set(0, 4.25, 0.18);
  const lampHood = new THREE.Mesh(
    new THREE.BoxGeometry(1.60, 0.045, 0.08),
    doorBrassMat
  );
  lampHood.position.set(0, 0, 0.14);
  luminaireGroup.add(lampHood);
  [-0.45, 0.45].forEach((armX) => {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.010, 0.010, 0.18),
      doorBrassMat
    );
    arm.rotation.x = Math.PI / 4;
    arm.position.set(armX, 0, 0.07);
    luminaireGroup.add(arm);
  });
  doorGroup.add(luminaireGroup);

  // Warm directional transom spotlight illuminating the engraved wood sign
  const transomSpot = new THREE.SpotLight(0xfff1d6, 2.4, 5.0, Math.PI / 3, 0.4, 1.6);
  transomSpot.position.set(ROOM2_CONFIG.door.x, 4.25, ROOM2_CONFIG.door.z + 0.35);
  transomSpot.target = signBoard;
  scene.add(transomSpot);

  // Wall Keypad / Digital Access Terminal at right jamb
  const terminalGroup = new THREE.Group();
  terminalGroup.position.set(1.65, 1.55, 0.06);
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

  // Door Sconce Spotlight
  const sconceLight = new THREE.SpotLight(0xfff4e0, 4.0, 6, Math.PI / 4, 0.4, 1.5);
  sconceLight.position.set(ROOM2_CONFIG.door.x, 4.1, ROOM2_CONFIG.door.z + 0.65);
  sconceLight.target = doorGroup;
  scene.add(sconceLight);

  // Register interactive hit targets for door exit
  const interactiveDoorTargets: THREE.Object3D[] = [signBoard, threshold];

  // Load the 3D double door FBX asset
  const fbxLoader = new FBXLoader(loadingManager);
  fbxLoader.load(
    '/assets/door/export/Entrance_Door__vray.fbx',
    (doorFbx) => {
      applyEntranceDoorMaterials(doorFbx);
      doorFbx.scale.setScalar(0.016);
      doorFbx.position.set(0, 0, 0);

      // Pre-configure mechanical hinges on the master template geometry
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
      doorGroup.add(doorFbx);

      doorFbx.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          interactiveDoorTargets.push(child);
        }
      });

      registerInteraction(interactiveDoorTargets, {
        id: 'campus-door',
        stationId: 'wave',
        category: 'UNIVERSITY CORRIDOR',
        name: 'Door to the Laboratory Hallway',
        action: 'Exit Room 02 and return to the room directory',
        readout: 'Physics University hallway · Rooms 01, 02, and 03',
      });
    },
    undefined,
    (err) => {
      console.error('Error loading room 2 entrance door FBX asset:', err);
      const fallbackDoor = new THREE.Mesh(
        new THREE.BoxGeometry(ROOM2_CONFIG.door.width, ROOM2_CONFIG.door.height, ROOM2_CONFIG.door.thickness),
        doorMahoganyMat
      );
      fallbackDoor.position.set(0, ROOM2_CONFIG.door.height / 2, 0);
      doorGroup.add(fallbackDoor);
      interactiveDoorTargets.push(fallbackDoor);
      registerInteraction(interactiveDoorTargets, {
        id: 'campus-door',
        stationId: 'wave',
        category: 'UNIVERSITY CORRIDOR',
        name: 'Door to the Laboratory Hallway',
        action: 'Exit Room 02 and return to the room directory',
        readout: 'Physics University hallway · Rooms 01, 02, and 03',
      });
    }
  );

  // ==============================================================
  // STUDENT LABORATORY ASSISTANT (Stationed near Exit Door & Station 03)
  // ==============================================================
  const assistantBaseX = 6.80;
  const assistantBaseZ = -6.65;
  const assistantBaseYaw = -0.35;
  let assistantCurrentYaw = assistantBaseYaw;
  let assistantNodTime = -999;

  const assistantGroup = new THREE.Group();
  assistantGroup.name = 'StudentLabAssistantGroup';
  assistantGroup.position.set(assistantBaseX, 0, assistantBaseZ);
  assistantGroup.rotation.y = assistantBaseYaw;
  scene.add(assistantGroup);

  // Clean hierarchical body anchor for organic NPC breathing and weight shift (ZERO mesh warping)
  const assistantBody = new THREE.Group();
  assistantBody.name = 'AssistantBodyHierarchy';
  assistantGroup.add(assistantBody);

  // Invisible raycasting hit proxy cylinder (24 triangles) for instant, lag-free raycasting
  const assistantProxy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 1.88, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  assistantProxy.position.y = 1.88 / 2;
  assistantGroup.add(assistantProxy);

  const assistantDefinition: EquipmentDefinition = {
    id: 'student-lab-assistant',
    stationId: 'electro',
    category: 'LABORATORY STAFF',
    name: 'Student Lab Assistant',
    description: EQUIPMENT_DESCRIPTIONS['student-lab-assistant'],
    action: 'Talk to lab assistant for physics experiment guidance',
    readout: 'Peer physics tutor · wearing protective lab safety goggles · advises on physics experiments',
  };
  registerInteraction(assistantProxy, assistantDefinition);

  // Warm overhead luminaire pin spotlight accentuating the assistant
  const assistantSpot = new THREE.SpotLight(0xfff8ee, 3.8, 7.5, Math.PI / 4, 0.5, 1.2);
  assistantSpot.position.set(6.80, 4.1, -5.7);
  assistantSpot.target = assistantGroup;
  scene.add(assistantSpot);

  // Load the student 3D GLB model
  const studentGltfLoader = new GLTFLoader();
  studentGltfLoader.load(
    '/assets/character_student.glb',
    (gltf) => {
      const studentModel = gltf.scene;
      studentModel.name = 'StudentModel';

      // Traverse meshes to configure realistic shadows and physics-lab lighting response
      studentModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.roughness = 0.65;
            mat.metalness = 0.05;
            mat.needsUpdate = true;
          }
        }
      });

      // Auto-scale to prominent, realistic 1.88m student assistant height
      const box = new THREE.Box3().setFromObject(studentModel);
      const rawHeight = Math.max(0.1, box.max.y - box.min.y);
      const targetHeight = 1.88;
      const scale = targetHeight / rawHeight;
      studentModel.scale.setScalar(scale);

      // Re-align so shoe soles rest precisely flat at floor level y = 0
      const scaledBox = new THREE.Box3().setFromObject(studentModel);
      studentModel.position.set(0, -scaledBox.min.y, 0);

      assistantBody.add(studentModel);

      // ==============================================================
      // LABORATORY SAFETY GOGGLES (ANSI Z87.1 Compliant Eyewear)
      // ==============================================================
      const gogglesGroup = new THREE.Group();
      gogglesGroup.name = 'LabSafetyGoggles';
      // Precisely centered over the eye line and nose bridge
      gogglesGroup.position.set(-0.015, 1.755, 0.140);
      // Gentle tilt matching facial angle
      gogglesGroup.rotation.set(0.04, 0.00, 0);

      // Crystal-clear high-impact polycarbonate lens material (depthWrite: false for pristine clarity)
      const goggleLensMat = new THREE.MeshPhysicalMaterial({
        color: 0xf8fafc, // crystal clear with subtle optical reflectance
        transmission: 0.96,
        opacity: 0.88,
        transparent: true,
        roughness: 0.03,
        metalness: 0.02,
        ior: 1.52,
        reflectivity: 0.75,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      // Sleek matte graphite / obsidian laboratory frame
      const goggleFrameMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.35,
        metalness: 0.50,
      });

      // Safety cyan browbar accent
      const goggleAccentMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.40,
        metalness: 0.20,
      });

      // Stainless steel hinge pins
      const goggleMetalMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.95,
        roughness: 0.15,
      });

      // 1. Dual Ergonomic Curved Lenses (Left and Right)
      [-0.030, 0.030].forEach((lx) => {
        const isLeft = lx < 0;
        const lensGroup = new THREE.Group();
        lensGroup.position.set(lx, 0, 0);
        lensGroup.rotation.y = isLeft ? 0.15 : -0.15;

        // Transparent polycarbonate safety lens
        const lens = new THREE.Mesh(new RoundedBoxGeometry(0.050, 0.035, 0.003, 4, 0.007), goggleLensMat);
        lensGroup.add(lens);

        // Thin aerodynamic protective frame rims
        const rimTop = new THREE.Mesh(new THREE.BoxGeometry(0.051, 0.0025, 0.008), goggleFrameMat);
        rimTop.position.set(0, 0.0175, 0.001);
        lensGroup.add(rimTop);

        const rimBottom = new THREE.Mesh(new THREE.BoxGeometry(0.051, 0.0025, 0.006), goggleFrameMat);
        rimBottom.position.set(0, -0.0175, 0.001);
        lensGroup.add(rimBottom);

        const outerBorder = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.036, 0.008), goggleFrameMat);
        outerBorder.position.set(isLeft ? -0.025 : 0.025, 0, 0.001);
        lensGroup.add(outerBorder);

        // Transparent side splash guard
        const sideShield = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.032, 0.024), goggleLensMat);
        sideShield.position.set(isLeft ? -0.026 : 0.026, 0, -0.011);
        sideShield.rotation.y = isLeft ? 0.12 : -0.12;
        lensGroup.add(sideShield);

        gogglesGroup.add(lensGroup);
      });

      // 2. Delicate Upper Nose Bridge Arch (Open lower contour - no bulky block)
      const noseArch = new THREE.Mesh(new RoundedBoxGeometry(0.014, 0.003, 0.006, 2, 0.001), goggleFrameMat);
      noseArch.position.set(0, 0.012, 0.002);
      gogglesGroup.add(noseArch);

      // 3. Top Splash Browguard Bar with Safety Cyan Stripe
      const browBar = new THREE.Mesh(new RoundedBoxGeometry(0.124, 0.004, 0.010, 3, 0.0015), goggleFrameMat);
      browBar.position.set(0, 0.019, 0.002);
      gogglesGroup.add(browBar);

      const browStripe = new THREE.Mesh(new THREE.BoxGeometry(0.100, 0.0015, 0.011), goggleAccentMat);
      browStripe.position.set(0, 0.021, 0.002);
      gogglesGroup.add(browStripe);

      // 4. Slender Temple Arms extending back along the head
      [-0.056, 0.056].forEach((tx) => {
        const isLeft = tx < 0;
        const stemGroup = new THREE.Group();
        stemGroup.position.set(tx, 0.002, -0.010);

        // Metallic hinge pin
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.006, 8), goggleMetalMat);
        hinge.rotation.z = Math.PI / 2;
        stemGroup.add(hinge);

        // Slender arm
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.005, 0.105), goggleFrameMat);
        arm.position.set(isLeft ? -0.003 : 0.003, 0, -0.052);
        arm.rotation.y = isLeft ? 0.09 : -0.09;
        stemGroup.add(arm);

        gogglesGroup.add(stemGroup);
      });

      assistantBody.add(gogglesGroup);
    },
    undefined,
    (err) => {
      console.error('Error loading character_student.glb:', err);
    }
  );

  // ==============================================================
  // PHYSICS PROFESSOR / INSTRUCTOR (Stationed near Lecture Whiteboard)
  // ==============================================================
  const professorBaseX = -2.70;
  const professorBaseZ = 6.35;
  const professorBaseYaw = Math.PI - 0.28; // ~2.86 rad, facing North into lab towards student workstations
  let professorCurrentYaw = professorBaseYaw;
  let professorNodTime = -999;

  const professorGroup = new THREE.Group();
  professorGroup.name = 'PhysicsProfessorGroup';
  professorGroup.position.set(professorBaseX, 0, professorBaseZ);
  professorGroup.rotation.y = professorBaseYaw;
  scene.add(professorGroup);

  // Clean hierarchical body anchor for organic NPC breathing and weight shift (ZERO mesh warping)
  const professorBody = new THREE.Group();
  professorBody.name = 'ProfessorBodyHierarchy';
  professorGroup.add(professorBody);

  // Lightweight raycasting hit proxy cylinder (24 triangles) for instant, lag-free raycasting
  const professorProxy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 1.86, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  professorProxy.position.y = 1.86 / 2;
  professorGroup.add(professorProxy);

  const professorDefinition: EquipmentDefinition = {
    id: 'physics-professor',
    stationId: 'wave',
    category: 'LABORATORY INSTRUCTOR',
    name: 'Physics Professor',
    description: EQUIPMENT_DESCRIPTIONS['physics-professor'],
    action: 'Consult Professor for lecture notes and theoretical physics guidance',
    readout: 'Head Laboratory Instructor · Wearing protective black-tinted safety eyewear · Standing at the whiteboard · Advises on wave mechanics and electrostatics',
  };
  registerInteraction(professorProxy, professorDefinition);

  // Warm luminaire pin spotlight illuminating the professor at the whiteboard
  const professorSpot = new THREE.SpotLight(0xfff6ea, 3.8, 8.0, Math.PI / 4, 0.45, 1.2);
  professorSpot.position.set(professorBaseX, 4.1, professorBaseZ - 1.3);
  professorSpot.target = professorGroup;
  scene.add(professorSpot);

  // Load the professor 3D GLB model
  const professorGltfLoader = new GLTFLoader();
  professorGltfLoader.load(
    '/assets/character_professor.glb',
    (gltf) => {
      const professorModel = gltf.scene;
      professorModel.name = 'ProfessorModel';

      // Traverse meshes to configure realistic shadows and physics-lab lighting response
      professorModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.roughness = 0.70;
            mat.metalness = 0.05;
            mat.needsUpdate = true;
          }
        }
      });

      // Auto-scale to prominent, realistic 1.85m professor height
      const box = new THREE.Box3().setFromObject(professorModel);
      const rawHeight = Math.max(0.1, box.max.y - box.min.y);
      const targetHeight = 1.85;
      const scale = targetHeight / rawHeight;
      professorModel.scale.setScalar(scale);

      // Re-align so shoe soles rest precisely flat on the floor at y = 0
      const scaledBox = new THREE.Box3().setFromObject(professorModel);
      professorModel.position.set(0, -scaledBox.min.y, 0);

      professorBody.add(professorModel);

      // ==============================================================
      // PROFESSOR BLACK-TINTED LABORATORY SAFETY GOGGLES
      // ==============================================================
      const profGogglesGroup = new THREE.Group();
      profGogglesGroup.name = 'ProfessorBlackTintedGoggles';
      // Precisely aligned to eye line (Y=1.718m), centered on nose bridge (X=0.060m, Z=0.068m)
      profGogglesGroup.position.set(0.060, 1.718, 0.068);
      // Pitch (-0.14 rad / -8 deg) parallels face slant, yaw (-0.015), roll (-0.048 rad / -2.8 deg) parallels head tilt
      profGogglesGroup.rotation.set(-0.14, -0.015, -0.048);

      // Black-tinted high-impact polycarbonate safety lens material
      const profGoggleLensMat = new THREE.MeshPhysicalMaterial({
        color: 0x090b10, // deep dark black tint
        transmission: 0.18, // black tinted dark sunglasses / laser safety lens
        opacity: 0.94,
        transparent: true,
        roughness: 0.03,
        metalness: 0.15,
        ior: 1.55,
        reflectivity: 0.90,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      // Sleek matte black obsidian frame material
      const profGoggleFrameMat = new THREE.MeshStandardMaterial({
        color: 0x08090d, // matte obsidian black
        roughness: 0.35,
        metalness: 0.50,
      });

      // Dark charcoal browbar stripe
      const profGoggleAccentMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.40,
        metalness: 0.30,
      });

      // Dark gunmetal titanium hinge pins
      const profGoggleMetalMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.90,
        roughness: 0.20,
      });

      // 1. Dual Ergonomic Curved Lenses (Right Eye at -0.033, Left Eye at +0.033)
      [-0.033, 0.033].forEach((lx) => {
        const isRight = lx < 0;
        const lensGroup = new THREE.Group();
        lensGroup.position.set(lx, 0, 0);
        // Ergonomically wrap backwards towards temples (-0.10 rad for right, +0.10 rad for left)
        lensGroup.rotation.y = isRight ? -0.10 : 0.10;

        // Black-tinted polycarbonate safety lens (width 46mm, height 35mm covers eye socket completely)
        const lens = new THREE.Mesh(new RoundedBoxGeometry(0.046, 0.035, 0.003, 4, 0.006), profGoggleLensMat);
        lensGroup.add(lens);

        // Thin aerodynamic protective frame rims
        const rimTop = new THREE.Mesh(new THREE.BoxGeometry(0.047, 0.0025, 0.006), profGoggleFrameMat);
        rimTop.position.set(0, 0.0175, 0.001);
        lensGroup.add(rimTop);

        const rimBottom = new THREE.Mesh(new THREE.BoxGeometry(0.047, 0.0025, 0.005), profGoggleFrameMat);
        rimBottom.position.set(0, -0.0175, 0.001);
        lensGroup.add(rimBottom);

        const outerBorder = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.036, 0.006), profGoggleFrameMat);
        outerBorder.position.set(isRight ? -0.023 : 0.023, 0, 0.001);
        lensGroup.add(outerBorder);

        // Black-tinted side splash guard wrapping back towards temples
        const sideShield = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.031, 0.022), profGoggleLensMat);
        sideShield.position.set(isRight ? -0.024 : 0.024, 0, -0.010);
        sideShield.rotation.y = isRight ? -0.10 : 0.10;
        lensGroup.add(sideShield);

        profGogglesGroup.add(lensGroup);
      });

      // 2. Continuous Upper Nose Bridge Arch
      const profNoseArch = new THREE.Mesh(new RoundedBoxGeometry(0.020, 0.004, 0.006, 2, 0.001), profGoggleFrameMat);
      profNoseArch.position.set(0, 0.011, 0.001);
      profGogglesGroup.add(profNoseArch);

      // 3. Top Splash Browguard Bar
      const profBrowBar = new THREE.Mesh(new RoundedBoxGeometry(0.122, 0.0035, 0.008, 3, 0.0015), profGoggleFrameMat);
      profBrowBar.position.set(0, 0.0185, 0.002);
      profGogglesGroup.add(profBrowBar);

      const profBrowStripe = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.0015, 0.009), profGoggleAccentMat);
      profBrowStripe.position.set(0, 0.0205, 0.002);
      profGogglesGroup.add(profBrowStripe);

      // 4. Slender Temple Arms extending back towards the ears
      [-0.055, 0.055].forEach((tx) => {
        const isRight = tx < 0;
        const stemGroup = new THREE.Group();
        stemGroup.position.set(tx, 0.002, -0.008);

        // Metallic hinge pin
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.006, 8), profGoggleMetalMat);
        hinge.rotation.z = Math.PI / 2;
        stemGroup.add(hinge);

        // Slender matte black arm gripping backwards along temple
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.005, 0.105), profGoggleFrameMat);
        arm.position.set(0, 0, -0.053);
        arm.rotation.y = isRight ? -0.05 : 0.05;
        stemGroup.add(arm);

        profGogglesGroup.add(stemGroup);
      });

      professorBody.add(profGogglesGroup);
    },
    undefined,
    (err) => {
      console.error('Error loading character_professor.glb:', err);
    }
  );

  const soundBench = addBench(scene, STATION_X.sound, STATION_COLOR.sound, benchTexture);
  const waveBench = addBench(scene, STATION_X.wave, STATION_COLOR.wave, benchTexture);
  const electroBench = addBench(scene, STATION_X.electro, STATION_COLOR.electro, benchTexture);
  const stationLamps: Record<StationId, THREE.MeshStandardMaterial> = {
    wave: waveBench.lampMaterial,
    sound: soundBench.lampMaterial,
    electro: electroBench.lampMaterial,
  };

  // ==============================================================
  // STATION 01: TRANSVERSE WAVE ON A TAUT STRING APPARATUS
  // ==============================================================
  const waveFallback = new THREE.Group();
  const waveAsset = createReplaceableEquipment(EQUIPMENT_REGISTRY.waveApparatus, loadingManager, () => waveFallback);
  const waveGroup = waveFallback;
  waveGroup.name = 'WaveApparatus_ProceduralFallback';
  waveGroup.position.y = ROOM2_CONFIG.table.topHeight;
  waveBench.group.add(waveAsset.root);
  addAnchorMarkers(waveGroup, EQUIPMENT_REGISTRY.waveApparatus, scene, debugEnabled);

  // 1. Heavy Extruded Aluminum Dual-Rail Optical Bench Bed (resting flush on bench at y=0.05)
  const railBedMat = material(0x1e293b, { metalness: 0.85, roughness: 0.25 });
  const chromeMat = material(0xf8fafc, { metalness: 0.95, roughness: 0.12 });
  const darkCastMat = material(0x0f172a, { metalness: 0.82, roughness: 0.35 });
  const brassMat = material(0xd97706, { metalness: 0.92, roughness: 0.2 });

  const waveBase = new THREE.Mesh(new THREE.BoxGeometry(3.60, 0.08, 0.32), railBedMat);
  waveBase.position.set(0, 0.09, 0);
  waveBase.castShadow = true;
  waveGroup.add(waveBase);

  // Precision dual guide-tracks on bed
  [-0.09, 0.09].forEach((rz) => {
    const guideRail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3.56, 16), chromeMat);
    guideRail.rotation.z = Math.PI / 2;
    guideRail.position.set(0, 0.135, rz);
    waveGroup.add(guideRail);
  });

  // Table Edge C-Clamps locking rail bed to bench
  [-1.60, 1.60].forEach((cx) => {
    const cClamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.38), darkCastMat);
    cClamp.position.set(cx, 0.05, 0);
    waveGroup.add(cClamp);

    const clampScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 12), chromeMat);
    clampScrew.position.set(cx, -0.04, 0.16);
    waveGroup.add(clampScrew);
  });

  // 2. Upright Stanchion Posts & Clamp Brackets
  [-1.67, 1.70].forEach((x) => {
    // Cast iron stanchion base foot
    const postBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.24), darkCastMat);
    postBase.position.set(x, 0.15, 0);
    waveGroup.add(postBase);

    // Sturdy vertical tubular stanchion
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.045, 1.34, 20), material(0x64748b, { metalness: 0.88, roughness: 0.2 }));
    post.position.set(x, 0.82, 0);
    post.castShadow = true;
    waveGroup.add(post);

    // Height-locking clamp collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.14, 18), darkCastMat);
    collar.position.set(x, 1.44, 0);
    waveGroup.add(collar);

    // Knurled locking thumbscrew
    const thumbScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 14), brassMat);
    thumbScrew.rotation.x = Math.PI / 2;
    thumbScrew.position.set(x, 1.44, 0.08);
    waveGroup.add(thumbScrew);
  });

  // 3. Precision Variable-Frequency Mechanical Vibration Generator / Oscillator
  const motorGroup = new THREE.Group();
  motorGroup.position.set(-1.67, 1.49, 0);

  const motorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.28), material(0x0f766e, { metalness: 0.75, roughness: 0.3 }));
  motorHousing.position.set(-0.25, 0, 0);
  motorGroup.add(motorHousing);

  // Digital LED Frequency Display on Driver Housing
  const freqDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.08), material(0x022c22, { emissive: 0x2dd4bf, emissiveIntensity: 1.2 }));
  freqDisplay.position.set(-0.25, 0.06, 0.142);
  motorGroup.add(freqDisplay);

  // Knurled Frequency Adjustment Dial on Motor Face
  const freqKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 20), brassMat);
  freqKnob.rotation.x = Math.PI / 2;
  freqKnob.position.set(-0.25, -0.06, 0.15);
  motorGroup.add(freqKnob);

  // Metal Power Toggle Switch with Throw Lever
  const powerSwitchGroup = new THREE.Group();
  powerSwitchGroup.position.set(-0.10, 0.06, 0.142);
  const powerSwitchBase = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.02), material(0x1e293b, { metalness: 0.9 }));
  powerSwitchGroup.add(powerSwitchBase);
  const powerSwitchLever = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.055, 12), chromeMat);
  powerSwitchLever.position.set(0, 0.02, 0.015);
  powerSwitchLever.rotation.x = 0.45; // OFF initial angle
  powerSwitchGroup.add(powerSwitchLever);
  motorGroup.add(powerSwitchGroup);

  // Motor drive cylinder and oscillating shaft
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 24), darkCastMat);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(-0.06, 0, 0);
  motorGroup.add(motor);

  const motorShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 16), chromeMat);
  motorShaft.rotation.z = Math.PI / 2;
  motorShaft.position.set(0.05, 0, 0);
  motorGroup.add(motorShaft);

  // Spring drive blade coupling
  const driveBlade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.04), brassMat);
  driveBlade.position.set(0.15, 0, 0);
  motorGroup.add(driveBlade);

  waveGroup.add(motorGroup);

  // 4. Low-Friction Precision Spoked Swivel Pulley & Mount
  const pulleyBracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.18), darkCastMat);
  pulleyBracket.position.set(1.70, 1.25, 0);
  waveGroup.add(pulleyBracket);

  const pulleyAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 18), chromeMat);
  pulleyAxle.rotation.x = Math.PI / 2;
  pulleyAxle.position.set(1.70, 1.49, 0);
  waveGroup.add(pulleyAxle);

  const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 16, 32), material(0x94a3b8, { metalness: 0.92, roughness: 0.15 }));
  pulley.position.set(1.70, 1.49, 0);
  waveGroup.add(pulley);

  // Pulley Spokes
  [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].forEach((rot) => {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.016, 0.016), chromeMat);
    spoke.rotation.z = rot;
    spoke.position.set(1.70, 1.49, 0);
    waveGroup.add(spoke);
  });

  const pulleyHub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 20), brassMat);
  pulleyHub.rotation.x = Math.PI / 2;
  pulleyHub.position.set(1.70, 1.49, 0);
  waveGroup.add(pulleyHub);

  // 5. Taut Harmonic String & Luminous Tracer Beads
  const wavePoints = Array.from({ length: 121 }, (_, index) => new THREE.Vector3(WAVE_STRING_START + (index / 120) * WAVE_STRING_SPAN, WAVE_STRING_Y, 0));
  const waveGeometry = new THREE.BufferGeometry().setFromPoints(wavePoints);
  const waveLine = new THREE.Line(waveGeometry, new THREE.LineBasicMaterial({ color: 0x22d3ee, linewidth: 2 }));
  waveGroup.add(waveLine);

  const waveBeads = Array.from({ length: 19 }, (_, index) => {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 14), material(0xfef08a, { emissive: 0xeab308, emissiveIntensity: 0.9 }));
    bead.position.set(WAVE_STRING_START + (index / 18) * WAVE_STRING_SPAN, WAVE_STRING_Y, 0);
    waveGroup.add(bead);
    return bead;
  });

  // 6. Calibrated Slotted Brass Weights & Mass Hanger
  const massGroup = new THREE.Group();
  massGroup.position.set(1.70, 0.72, 0);

  const massStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 12), brassMat);
  massStem.position.y = 0.16;
  massGroup.add(massStem);

  const massHook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 10, 20), brassMat);
  massHook.rotation.x = Math.PI / 2;
  massHook.position.y = 0.42;
  massGroup.add(massHook);

  const hangingMass = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 24), brassMat);
  hangingMass.position.y = 0.02;
  massGroup.add(hangingMass);

  // Slotted Disc Grooves
  [-0.07, 0.0, 0.07].forEach((dy) => {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.04), material(0x78350f, { roughness: 0.5 }));
    slot.position.set(0.04, dy, 0);
    massGroup.add(slot);
  });

  waveGroup.add(massGroup);

  const hangingCord = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(WAVE_STRING_END, WAVE_STRING_Y, 0), new THREE.Vector3(WAVE_STRING_END, 1.14, 0)]),
    new THREE.LineBasicMaterial({ color: 0xf8fafc, linewidth: 2 }),
  );
  waveGroup.add(hangingCord);

  // 7. Precision Optical Wavelength Measurement Sled & Vernier Cursor
  const opticalSliderGroup = new THREE.Group();
  opticalSliderGroup.position.set(-0.60, 0.14, 0);

  const opticalSliderSled = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.24), material(0x334155, { metalness: 0.85, roughness: 0.25 }));
  opticalSliderSled.position.y = 0.025;
  opticalSliderSled.castShadow = true;
  opticalSliderGroup.add(opticalSliderSled);

  // Magnifying vernier scale lens & reticle
  const opticalSliderLens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 20), material(0x38bdf8, { transparent: true, opacity: 0.7, roughness: 0.1 }));
  opticalSliderLens.position.set(0, 0.055, 0.08);
  opticalSliderGroup.add(opticalSliderLens);

  // Vertical vernier index needle pointing to string crest
  const opticalSliderCursor = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 10), brassMat);
  opticalSliderCursor.rotation.z = Math.PI;
  opticalSliderCursor.position.set(0, 0.10, 0);
  opticalSliderGroup.add(opticalSliderCursor);

  // Knurled brass locking thumb-screw
  const opticalSliderLock = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12), brassMat);
  opticalSliderLock.position.set(0, 0.06, -0.09);
  opticalSliderGroup.add(opticalSliderLock);

  waveGroup.add(opticalSliderGroup);

  registerInteraction([motor, motorShaft, motorHousing], {
    id: 'wave-driver', stationId: 'wave', category: 'WAVE SOURCE', name: 'Mechanical String Driver & Oscillator',
    action: 'Inspect the electromechanical driver oscillator', readout: () => `Driver frequency: ${wave.frequency.toFixed(1)} Hz · ${paused ? 'Stopped' : 'Oscillating'}`,
  });
  registerInteraction([freqKnob], {
    id: 'wave-freq-knob', stationId: 'wave', category: 'FREQUENCY REGULATOR', name: 'Precision Frequency Adjustment Dial',
    action: 'Rotate frequency dial to change oscillator rate', readout: () => `Driver frequency setting: ${wave.frequency.toFixed(1)} Hz`,
  });
  registerInteraction([powerSwitchGroup, powerSwitchLever, powerSwitchBase], {
    id: 'wave-power-switch', stationId: 'wave', category: 'POWER CONTROL', name: 'Vibration Generator Power Toggle Switch',
    action: () => (paused ? 'Flip generator power switch ON' : 'Flip generator power switch OFF'),
    readout: () => `Generator state: ${paused ? 'OFF (Standby)' : 'ON (Running)'}`,
  });
  registerInteraction([waveLine, ...waveBeads], {
    id: 'wave-string', stationId: 'wave', category: 'TRANSMISSION MEDIUM', name: 'Taut String with Harmonic Tracer Beads',
    action: 'Inspect transverse wave disturbance & antinodes', readout: () => `Wavelength λ = ${calculateWave(wave).wavelength.toFixed(2)} m · Speed v = ${calculateWave(wave).speed.toFixed(1)} m/s`,
  });
  registerInteraction([hangingMass, massHook, massStem], {
    id: 'wave-tension', stationId: 'wave', category: 'TENSION CONTROL', name: 'Calibrated Slotted Mass Hanger',
    action: 'Adjust slotted weight discs on mass hanger', readout: () => `String tension: T = ${wave.tension.toFixed(0)} N (μ = ${wave.density.toFixed(3)} kg/m)`,
  });
  registerInteraction([pulley, pulleyHub], {
    id: 'wave-frequency', stationId: 'wave', category: 'BOUNDARY SUPPORT', name: 'Precision Low-Friction Spoked Pulley',
    action: 'Inspect fixed nodal boundary pulley support', readout: () => `Low-friction pulley maintaining string tension at x = 1.70 m`,
  });
  registerInteraction([opticalSliderGroup, opticalSliderCursor, opticalSliderSled, opticalSliderLens], {
    id: 'wave-slider', stationId: 'wave', category: 'OPTICAL METROLOGY', name: 'Optical Wavelength Measurement Sled & Vernier Cursor',
    action: 'Align optical cursor with standing wave antinode', readout: () => `Vernier reading: λ = ${calculateWave(wave).wavelength.toFixed(2)} m (Crest alignment)`,
  });


  // ==============================================================
  // STATION 02: ACOUSTIC SOUND RESONANCE & AIR COLUMN APPARATUS
  // ==============================================================
  const soundFallback = new THREE.Group();
  const soundAsset = createReplaceableEquipment(EQUIPMENT_REGISTRY.soundApparatus, loadingManager, () => soundFallback);
  const soundGroup = soundFallback;
  soundGroup.name = 'SoundApparatus_ProceduralFallback';
  soundGroup.position.y = ROOM2_CONFIG.table.topHeight;
  soundBench.group.add(soundAsset.root);
  soundGroup.userData.equipmentRegistryEntry = EQUIPMENT_REGISTRY.soundApparatus;
  addAnchorMarkers(soundGroup, EQUIPMENT_REGISTRY.soundApparatus, scene, debugEnabled);

  // 1. Cast-Iron Laboratory Tripod Stand & Support Rod
  const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.48), darkCastMat);
  standBase.position.set(0.45, 0.09, 0);
  standBase.castShadow = true;
  soundGroup.add(standBase);

  const verticalRod = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.75, 20), chromeMat);
  verticalRod.position.set(0.72, 1.45, -0.15);
  soundGroup.add(verticalRod);

  // Dual Extension Boss-Head Clamps holding tube
  [0.65, 2.10].forEach((cy) => {
    const bosshead = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), darkCastMat);
    bosshead.position.set(0.72, cy, -0.15);
    soundGroup.add(bosshead);

    const clampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 12), chromeMat);
    clampArm.rotation.z = Math.PI / 2;
    clampArm.position.set(0.58, cy, -0.05);
    soundGroup.add(clampArm);

    const clampJaw = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 12, 24, Math.PI), material(0x0f172a, { roughness: 0.8 }));
    clampJaw.rotation.x = Math.PI / 2;
    clampJaw.position.set(0.45, cy, 0);
    soundGroup.add(clampJaw);
  });

  // 2. Precision Borosilicate Glass Acoustic Resonance Tube
  const tubeShell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 2.45, 36, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xe0e7ff, transparent: true, opacity: 0.32, transmission: 0.75, roughness: 0.08, metalness: 0.1, side: THREE.DoubleSide }),
  );
  tubeShell.position.set(0.45, 1.38, 0);
  soundGroup.add(tubeShell);

  // Graduated Centimeter Scale Strip along Glass Column
  const scaleStrip = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 2.35), material(0xffffff, { roughness: 0.4 }));
  scaleStrip.position.set(0.45, 1.38, 0.222);
  soundGroup.add(scaleStrip);

  const tubeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.16, 32), material(0x334155, { metalness: 0.82, roughness: 0.25 }));
  tubeBase.position.set(0.45, 0.16, 0);
  soundGroup.add(tubeBase);

  // Water drainage petcock valve on tube base
  const drainValve = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 12), brassMat);
  drainValve.rotation.x = Math.PI / 2;
  drainValve.position.set(0.45, 0.16, 0.36);
  soundGroup.add(drainValve);

  const closedCap = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.06, 32), material(0x4338ca, { emissive: 0x312e81, emissiveIntensity: 1.1 }));
  closedCap.position.set(0.45, 0.22, 0);
  soundGroup.add(closedCap);

  // Standing wave centerline and oscillating longitudinal air particles
  const soundPoints = Array.from({ length: 100 }, (_, index) => new THREE.Vector3(0.45, 0.24 + (index / 99) * 2.35, 0));
  const soundGeometry = new THREE.BufferGeometry().setFromPoints(soundPoints);
  const soundLine = new THREE.Line(soundGeometry, new THREE.LineBasicMaterial({ color: 0xa5b4fc, linewidth: 2 }));
  soundGroup.add(soundLine);

  const airParticles = Array.from({ length: 54 }, (_, index) => {
    const angle = (index % 6) * ((Math.PI * 2) / 6);
    const y = 0.28 + (Math.floor(index / 6) / 8) * 2.24;
    const particle = new THREE.Mesh(new THREE.SphereGeometry(0.022, 9, 9), material(0xc7d2fe, { emissive: 0x6366f1, emissiveIntensity: 0.9 }));
    particle.position.set(0.45 + 0.12 * Math.cos(angle), y, 0.12 * Math.sin(angle));
    particle.userData.baseY = y;
    particle.userData.normalizedY = Math.floor(index / 6) / 8;
    particle.userData.phase = Math.floor(index / 6) * 0.08;
    soundGroup.add(particle);
    return particle;
  });

  // 3. Precision Acoustic Tuning Fork & Hardwood Sounding Resonator Box
  const forkGroup = new THREE.Group();
  forkGroup.position.set(-1.25, 0.09, 0);

  const soundingBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.65), material(0x78350f, { roughness: 0.6, metalness: 0.05 }));
  soundingBox.position.y = 0.07;
  forkGroup.add(soundingBox);

  // Sounding Box Acoustic Aperture Port (facing resonance tube)
  const soundPort = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), material(0x1c1917, { roughness: 0.9 }));
  soundPort.rotation.y = Math.PI / 2;
  soundPort.position.set(0.191, 0.07, 0);
  forkGroup.add(soundPort);

  // Frequency Adjustment Tuning Collar on Sounding Box
  const forkDial = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 18), brassMat);
  forkDial.rotation.x = Math.PI / 2;
  forkDial.position.set(-0.10, 0.08, 0.33);
  forkGroup.add(forkDial);

  // Steel tuning fork mounting block
  const forkMount = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.12), chromeMat);
  forkMount.position.set(0, 0.16, 0);
  forkGroup.add(forkMount);

  const forkBase = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 16), chromeMat);
  forkBase.position.set(0, 0.26, 0);
  forkGroup.add(forkBase);

  const forkStem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.55, 16), chromeMat);
  forkStem.position.set(0, 0.58, 0);
  forkGroup.add(forkStem);

  const forkCrossbar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.032, 0.032), chromeMat);
  forkCrossbar.position.set(0, 0.86, 0);
  forkGroup.add(forkCrossbar);

  const forkTines: THREE.Object3D[] = [];
  [-0.12, 0.12].forEach((x) => {
    const tine = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.72, 0.032), chromeMat);
    tine.position.set(x, 1.24, 0);
    forkGroup.add(tine);
    forkTines.push(tine);
  });

  // Rubber Striker Mallet Assembly with dynamic swing pivot
  const malletGroup = new THREE.Group();
  malletGroup.position.set(0.24, 0.14, 0.22);
  const malletStick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 10), material(0xd97706, { roughness: 0.5 }));
  malletStick.position.set(0, 0.12, 0);
  malletGroup.add(malletStick);

  const malletHead = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 14), material(0x1e293b, { roughness: 0.9 }));
  malletHead.position.set(0, 0.28, 0);
  malletGroup.add(malletHead);
  malletGroup.rotation.z = Math.PI / 4;
  forkGroup.add(malletGroup);

  soundGroup.add(forkGroup);

  // Expanding acoustic wavefront rings from fork towards tube
  const soundRings = Array.from({ length: 4 }, (_, index) => {
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 36), ringMaterial);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(-0.88 + index * 0.31, 1.36, 0);
    soundGroup.add(ring);
    return ring;
  });

  // Temperature Adjustment Thermostat Dial on Tube Base
  const tempDialGroup = new THREE.Group();
  tempDialGroup.position.set(0.45, 0.16, -0.34);
  const tempDialBase = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.06), material(0x1e293b, { metalness: 0.8 }));
  tempDialGroup.add(tempDialBase);
  const tempDialKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 16), brassMat);
  tempDialKnob.rotation.x = Math.PI / 2;
  tempDialKnob.position.set(0, 0, -0.03);
  tempDialGroup.add(tempDialKnob);
  soundGroup.add(tempDialGroup);

  // 4. Precision Acoustic Measurement Microphone & Sound Level Analyzer Unit
  const micGroup = new THREE.Group();
  micGroup.position.set(1.55, 0.09, 0.2);

  // Cast round microphone table base
  const micBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.04, 24), darkCastMat);
  micBase.position.y = 0.02;
  micGroup.add(micBase);

  // Articulated gooseneck arm
  const gooseneck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.05, 14), material(0x334155, { metalness: 0.85 }));
  gooseneck.position.set(0, 0.54, 0);
  micGroup.add(gooseneck);

  // Studio condenser microphone capsule with foam pop filter
  const microphone = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 8, 18), material(0x0f172a, { roughness: 0.85 }));
  microphone.rotation.z = Math.PI / 2;
  microphone.position.set(-0.06, 1.08, 0);
  micGroup.add(microphone);

  // Digital Sound Level Meter / Acoustic Analyzer Console
  const meterConsole = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.26), material(0x1e293b, { metalness: 0.8, roughness: 0.3 }));
  meterConsole.position.set(0.32, 0.10, 0.10);
  micGroup.add(meterConsole);

  const meterScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.09), material(0x030712, { emissive: 0x38bdf8, emissiveIntensity: 1.1 }));
  meterScreen.rotation.x = -Math.PI / 6;
  meterScreen.position.set(0.32, 0.15, 0.22);
  micGroup.add(meterScreen);

  soundGroup.add(micGroup);

  registerInteraction([forkBase, forkStem, soundingBox, soundPort, ...forkTines], {
    id: 'sound-fork', stationId: 'sound', category: 'ACOUSTIC SOURCE', name: 'Acoustic Tuning Fork & Resonator Box',
    action: 'Inspect acoustic harmonic emitter & sounding box', readout: () => `Tuning fork fundamental: f = ${sound.frequency.toFixed(0)} Hz`,
  });
  registerInteraction([forkDial], {
    id: 'sound-fork-dial', stationId: 'sound', category: 'FREQUENCY SELECTOR', name: 'Tuning Fork Frequency Collar Dial',
    action: 'Calibrate tuning fork natural frequency', readout: () => `Source frequency setting: ${sound.frequency.toFixed(0)} Hz`,
  });
  registerInteraction([malletGroup, malletHead, malletStick], {
    id: 'sound-mallet', stationId: 'sound', category: 'ACOUSTIC TRIGGER', name: 'Rubber Striker Mallet',
    action: 'Strike the tuning fork to excite acoustic resonance', readout: () => `Impulse striker: ${paused ? 'Ready to strike' : 'Tuning fork ringing'}`,
  });
  registerInteraction([tubeShell, soundLine, tubeBase, scaleStrip], {
    id: 'sound-tube', stationId: 'sound', category: 'RESONANCE CHAMBER', name: 'Borosilicate Glass Acoustic Resonance Column',
    action: 'Inspect air column geometry and graduated metric scale', readout: () => `Resonance column: L = ${sound.length.toFixed(2)} m · ${sound.tubeType === 'closed' ? 'Closed–open' : 'Open–open'}`,
  });
  registerInteraction([closedCap, drainValve], {
    id: 'sound-tube-cap', stationId: 'sound', category: 'BOUNDARY CONTROL', name: 'Resonance Tube Boundary End-Cap Seal',
    action: 'Change boundary condition between closed-open and open-open', readout: () => `Boundary seal: ${sound.tubeType === 'closed' ? 'Closed node at base' : 'Open boundary at base'}`,
  });
  registerInteraction([tempDialGroup, tempDialKnob, tempDialBase], {
    id: 'sound-temp-dial', stationId: 'sound', category: 'ENVIRONMENT CONTROL', name: 'Resonance Chamber Thermostat Dial',
    action: 'Adjust chamber ambient air temperature', readout: () => `Air temperature: ${sound.temperature.toFixed(1)} °C (v ≈ ${(331.4 * Math.sqrt(1 + sound.temperature / 273.15)).toFixed(1)} m/s)`,
  });
  registerInteraction([microphone, gooseneck, micBase, meterConsole, meterScreen], {
    id: 'sound-microphone', stationId: 'sound', category: 'ACOUSTIC SENSOR', name: 'Condenser Microphone & Sound Level Meter',
    action: 'Position microphone along resonance axis to detect peak SPL', readout: () => `Microphone distance: r = ${sound.distance.toFixed(1)} m · SPL = ${calculateSound(sound).decibels.toFixed(1)} dB`,
  });


  // ==============================================================
  // STATION 03: COULOMB ELECTROSTATIC FORCE & ELECTRIC FIELD BENCH
  // ==============================================================
  const electroFallback = new THREE.Group();
  const electroAsset = createReplaceableEquipment(EQUIPMENT_REGISTRY.electrostaticsBench, loadingManager, () => electroFallback);
  const electroGroup = electroFallback;
  electroGroup.name = 'ElectrostaticsBench_ProceduralFallback';
  electroGroup.position.y = ROOM2_CONFIG.table.topHeight;
  electroBench.group.add(electroAsset.root);
  electroGroup.userData.equipmentRegistryEntry = EQUIPMENT_REGISTRY.electrostaticsBench;
  addAnchorMarkers(electroGroup, EQUIPMENT_REGISTRY.electrostaticsBench, scene, debugEnabled);

  // Specialized Laboratory Materials
  const amberInsulatorMat = material(0xd97706, { transparent: true, opacity: 0.88, roughness: 0.12, metalness: 0.08 });
  const ceramicCollarMat = material(0xf8fafc, { roughness: 0.22, metalness: 0.05 });
  const chassisNavyMat = material(0x1e293b, { metalness: 0.82, roughness: 0.25 });
  const meterDialMat = material(0xf8fafc, { roughness: 0.35, metalness: 0.02 });
  const hvRedWireMat = material(0xdc2626, { roughness: 0.5, metalness: 0.1 });
  const hvBlueWireMat = material(0x2563eb, { roughness: 0.5, metalness: 0.1 });

  // 1. Heavy Extruded Precision Linear Optical Separation Track
  const railBed = new THREE.Mesh(new THREE.BoxGeometry(3.50, 0.08, 0.34), railBedMat);
  railBed.position.set(0, 0.09, 0);
  railBed.castShadow = true;
  railBed.receiveShadow = true;
  electroGroup.add(railBed);

  // Dual Polished Stainless Steel Guide Rails
  [-0.06, 0.06].forEach((rz) => {
    const guideRail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 3.40, 16), chromeMat);
    guideRail.rotation.z = Math.PI / 2;
    guideRail.position.set(0, 0.145, rz);
    electroGroup.add(guideRail);
  });

  const rail = new THREE.Mesh(new THREE.BoxGeometry(3.40, 0.02, 0.14), chromeMat);
  rail.position.set(0, 0.135, 0);
  electroGroup.add(rail);

  // Metric Laser-Etched Measurement Scale on Track Bed
  const trackScale = new THREE.Mesh(new THREE.PlaneGeometry(3.20, 0.038), material(0xffffff, { roughness: 0.4 }));
  trackScale.rotation.x = -Math.PI / 2;
  trackScale.position.set(0, 0.146, 0.12);
  electroGroup.add(trackScale);

  // Dual Heavy Cast-Iron Bench G-Clamps with T-screws locking track to bench
  [-1.55, 1.55].forEach((cx) => {
    const gClamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.38), darkCastMat);
    gClamp.position.set(cx, 0.05, 0);
    electroGroup.add(gClamp);

    const tScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 10), brassMat);
    tScrew.position.set(cx, -0.02, 0.18);
    electroGroup.add(tScrew);
  });

  // Track End-Stops with Rubber Bumpers and Precision Micrometer Leadscrew Dial
  [-1.70, 1.70].forEach((ex) => {
    const endStop = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.28), material(0x0f172a, { roughness: 0.85 }));
    endStop.position.set(ex, 0.14, 0);
    electroGroup.add(endStop);
  });

  // Knurled Brass Leadscrew Dial on Track End
  const leadscrewKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 20), brassMat);
  leadscrewKnob.rotation.z = Math.PI / 2;
  leadscrewKnob.position.set(1.73, 0.14, 0);
  electroGroup.add(leadscrewKnob);

  // 2. High-Voltage Conducting Spherical Electrodes & Insulating Stanchion Sleds
  const chargeMaterials = [
    material(0xf97316, { emissive: 0xc2410c, emissiveIntensity: 1.6, metalness: 0.65, roughness: 0.22 }),
    material(0x3b82f6, { emissive: 0x1d4ed8, emissiveIntensity: 1.6, metalness: 0.65, roughness: 0.22 }),
  ];

  const charges = [-1, 1].map((side, index) => {
    const carriageGroup = new THREE.Group();
    carriageGroup.position.set(side * 1.1, 0, 0);

    // Sliding low-friction machined carriage sled
    const carrierSled = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.065, 0.28), darkCastMat);
    carrierSled.position.y = 0.165;
    carrierSled.castShadow = true;
    carriageGroup.add(carrierSled);

    // Precision vernier index pointer pointing at metric scale
    const vernierPointer = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 8), brassMat);
    vernierPointer.rotation.z = Math.PI / 2;
    vernierPointer.position.set(0, 0.19, 0.125);
    carriageGroup.add(vernierPointer);

    // Knurled brass locking thumb-screw
    const lockKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 14), brassMat);
    lockKnob.position.set(0, 0.22, 0.125);
    carriageGroup.add(lockKnob);

    // Glazed ceramic base collar
    const ceramicBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 20), ceramicCollarMat);
    ceramicBase.position.y = 0.215;
    carriageGroup.add(ceramicBase);

    // Polished Amber / PTFE dielectric insulating standoff pillar
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.54, 20), amberInsulatorMat);
    holder.position.y = 0.49;
    carriageGroup.add(holder);

    // Insulating corona disc sheds (prevents surface tracking)
    [0.36, 0.49, 0.62].forEach((sy) => {
      const shed = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.016, 18), amberInsulatorMat);
      shed.position.y = sy;
      carriageGroup.add(shed);
    });

    // Chrome terminal cup and corona guard collar
    const topTerminalCap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.035, 18), chromeMat);
    topTerminalCap.position.y = 0.77;
    carriageGroup.add(topTerminalCap);

    const coronaRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 10, 24), chromeMat);
    coronaRing.rotation.x = Math.PI / 2;
    coronaRing.position.y = 0.78;
    carriageGroup.add(coronaRing);

    // Conductive Spherical Electrode
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), chargeMaterials[index]);
    sphere.position.y = ELECTRO_SURFACE_Y;
    sphere.castShadow = true;
    carriageGroup.add(sphere);

    // High-voltage banana jack terminal on rear of carriage
    const hvTerminal = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.035, 12), index === 0 ? hvRedWireMat : hvBlueWireMat);
    hvTerminal.rotation.x = Math.PI / 2;
    hvTerminal.position.set(0, 0.20, -0.13);
    carriageGroup.add(hvTerminal);

    electroGroup.add(carriageGroup);
    return { holder, sphere, carriageGroup, hvTerminal };
  });

  // 3. Benchtop High-Voltage Dual-Polarity DC Electrometer & Power Generator
  const hvPowerSupply = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.28, 0.34), chassisNavyMat);
  hvPowerSupply.position.set(0, 0.18, -0.55);
  hvPowerSupply.castShadow = true;
  electroGroup.add(hvPowerSupply);

  // High-Voltage Analog Kilovolt Meters
  const meterNeedles: THREE.Mesh[] = [];
  [-0.20, 0.20].forEach((mx, mi) => {
    const meterBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 24), material(0x0f172a, { metalness: 0.8 }));
    meterBezel.rotation.x = Math.PI / 2;
    meterBezel.position.set(mx, 0.22, -0.378);
    electroGroup.add(meterBezel);

    const meterFace = new THREE.Mesh(new THREE.CircleGeometry(0.068, 24), meterDialMat);
    meterFace.position.set(mx, 0.22, -0.37);
    electroGroup.add(meterFace);

    const meterNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.05, 0.002), material(0xdc2626, { roughness: 0.3 }));
    meterNeedle.position.set(mx, 0.22, -0.368);
    meterNeedle.rotation.z = mx < 0 ? 0.35 : -0.35;
    electroGroup.add(meterNeedle);
    meterNeedles.push(meterNeedle);
  });

  // Master High-Voltage Power Toggle Switch on DC Supply Console
  const hvPowerSwitchGroup = new THREE.Group();
  hvPowerSwitchGroup.position.set(0, 0.11, -0.372);
  const hvSwitchBase = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), material(0x0f172a, { metalness: 0.9 }));
  hvPowerSwitchGroup.add(hvSwitchBase);
  const hvSwitchLever = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.06, 12), chromeMat);
  hvSwitchLever.position.set(0, 0.02, 0.015);
  hvSwitchLever.rotation.x = 0.45;
  hvPowerSwitchGroup.add(hvSwitchLever);
  electroGroup.add(hvPowerSwitchGroup);

  // Dual High-Voltage Potentiometer Charge Dials
  const voltageDials: THREE.Mesh[] = [];
  [-0.20, 0.20].forEach((vx) => {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.025, 18), brassMat);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(vx, 0.11, -0.372);
    electroGroup.add(dial);
    voltageDials.push(dial);
  });

  // Central Digital LED Potential / Field Display on Power Supply
  const powerDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.07), material(0x030712, { emissive: 0x38bdf8, emissiveIntensity: 1.2 }));
  powerDisplay.position.set(0, 0.22, -0.375);
  electroGroup.add(powerDisplay);

  // High-Voltage Output Terminals on Power Supply
  const hvOutput1 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 12), hvRedWireMat);
  hvOutput1.rotation.x = Math.PI / 2;
  hvOutput1.position.set(-0.20, 0.11, -0.37);
  electroGroup.add(hvOutput1);

  const hvOutput2 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 12), hvBlueWireMat);
  hvOutput2.rotation.x = Math.PI / 2;
  hvOutput2.position.set(0.20, 0.11, -0.37);
  electroGroup.add(hvOutput2);

  // Flexible Silicone High-Voltage Connecting Cables
  const hvCableGeom1 = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.20, 0.11, -0.37),
    new THREE.Vector3(-0.65, 0.06, -0.30),
    new THREE.Vector3(-1.10, 0.20, -0.13),
  ]);
  const hvCable1 = new THREE.Line(hvCableGeom1, new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 }));
  electroGroup.add(hvCable1);

  const hvCableGeom2 = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.20, 0.11, -0.37),
    new THREE.Vector3(0.65, 0.06, -0.30),
    new THREE.Vector3(1.10, 0.20, -0.13),
  ]);
  const hvCable2 = new THREE.Line(hvCableGeom2, new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 2 }));
  electroGroup.add(hvCable2);

  // 4. Midpoint Electric Field Mill & Electrometer Sensor Probe
  const probeGroup = new THREE.Group();
  probeGroup.position.set(0, 0, 0);

  const probeCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.055, 0.24), material(0x0f766e, { metalness: 0.78, roughness: 0.25 }));
  probeCarrier.position.y = 0.165;
  probeCarrier.castShadow = true;
  probeGroup.add(probeCarrier);

  const probeLockKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 12), brassMat);
  probeLockKnob.position.set(0, 0.205, 0.11);
  probeGroup.add(probeLockKnob);

  const probeStem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.68, 16), chromeMat);
  probeStem.position.y = 0.52;
  probeGroup.add(probeStem);

  // Shielded Field Mill Sensor Head
  const fieldProbe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.08, 20), material(0x0f172a, { metalness: 0.85, roughness: 0.2 }));
  fieldProbe.rotation.x = Math.PI / 2;
  fieldProbe.position.y = ELECTRO_SURFACE_Y;
  probeGroup.add(fieldProbe);

  // Rotating chopper aperture ring
  const probeAperture = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 10, 24), material(0xf8fafc, { emissive: 0xf59e0b, emissiveIntensity: 1.2 }));
  probeAperture.position.y = ELECTRO_SURFACE_Y;
  probeGroup.add(probeAperture);

  // Gold-plated sensing needle at probe focal point
  const probeNeedle = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 12), brassMat);
  probeNeedle.position.y = ELECTRO_SURFACE_Y;
  probeGroup.add(probeNeedle);

  electroGroup.add(probeGroup);

  // Benchtop Digital Electrometer Sensor Readout Console
  const electrometerConsole = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.24), chassisNavyMat);
  electrometerConsole.position.set(0.55, 0.10, -0.48);
  electroGroup.add(electrometerConsole);

  const electrometerScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.08), material(0x030712, { emissive: 0x10b981, emissiveIntensity: 1.1 }));
  electrometerScreen.rotation.x = -Math.PI / 6;
  electrometerScreen.position.set(0.55, 0.14, -0.37);
  electroGroup.add(electrometerScreen);

  // Coaxial Sensor Cable from Probe to Console
  const sensorCableGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.22, 0),
    new THREE.Vector3(0.28, 0.05, -0.25),
    new THREE.Vector3(0.55, 0.10, -0.48),
  ]);
  const sensorCable = new THREE.Line(sensorCableGeom, new THREE.LineBasicMaterial({ color: 0x475569, linewidth: 2 }));
  electroGroup.add(sensorCable);

  // 5. Coulomb Mutual Force Vectors (mounted cleanly above each sphere stanchion)
  const forceArrows = [
    new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1.1, ELECTRO_SURFACE_Y + 0.28, 0), 0.40, 0xfbbf24, 0.10, 0.06),
    new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1.1, ELECTRO_SURFACE_Y + 0.28, 0), 0.40, 0xfbbf24, 0.10, 0.06),
  ];
  forceArrows.forEach((arrow) => electroGroup.add(arrow));

  // 6. Midpoint Net Electric Field Vector Arrow (elevated above sensor mill)
  const midpointFieldArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, ELECTRO_SURFACE_Y + 0.28, 0),
    0.35,
    0xf97316,
    0.10,
    0.06,
  );
  electroGroup.add(midpointFieldArrow);

  // 7. Streamline Curved Electric Field Streamlines & Directional Chevrons
  const streamlineLines: THREE.Line[] = [];
  const streamlineChevrons: THREE.ArrowHelper[] = [];
  const STREAMLINE_OFFSETS = [-0.60, -0.30, 0.0, 0.30, 0.60];

  STREAMLINE_OFFSETS.forEach((zOffset, i) => {
    const pts = Array.from({ length: 32 }, () => new THREE.Vector3());
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: i === 2 ? 0xfde68a : 0x93c5fd, transparent: true, opacity: 0.65, linewidth: 2 });
    const line = new THREE.Line(geom, lineMat);
    electroGroup.add(line);
    streamlineLines.push(line);

    const elev = zOffset === 0 ? ELECTRO_SURFACE_Y + 0.18 : ELECTRO_SURFACE_Y + 0.04;
    const chev = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, elev, zOffset), 0.18, 0x60a5fa, 0.08, 0.05);
    electroGroup.add(chev);
    streamlineChevrons.push(chev);
  });

  // Laser Axial Interaction Beam along measurement axis
  const electroBeamMaterial = new THREE.LineBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.55, linewidth: 2 });
  const electroBeamGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, ELECTRO_SURFACE_Y + 0.28, 0), new THREE.Vector3(1, ELECTRO_SURFACE_Y + 0.28, 0)]);
  const electroBeam = new THREE.Line(electroBeamGeometry, electroBeamMaterial);
  electroGroup.add(electroBeam);

  registerInteraction([charges[0].sphere, charges[0].holder, charges[0].carriageGroup], {
    id: 'electro-q1', stationId: 'electro', category: 'ELECTRODE', name: 'Conductive Spherical Electrode 1 (q₁)',
    action: 'Mount and inspect positive charge sphere q₁', readout: () => `Charge q₁ = ${electro.q1.toFixed(0)} μC · High-voltage charge accumulator`,
  });
  registerInteraction([charges[1].sphere, charges[1].holder, charges[1].carriageGroup], {
    id: 'electro-q2', stationId: 'electro', category: 'ELECTRODE', name: 'Conductive Spherical Electrode 2 (q₂)',
    action: 'Mount and inspect negative charge sphere q₂', readout: () => `Charge q₂ = ${electro.q2.toFixed(0)} μC · Opposite-polarity charge receiver`,
  });
  registerInteraction([leadscrewKnob], {
    id: 'electro-leadscrew', stationId: 'electro', category: 'POSITION CONTROL', name: 'Micrometer Separation Leadscrew Dial',
    action: 'Rotate leadscrew to change carriage separation distance r', readout: () => `Carriage separation: r = ${electro.separation.toFixed(2)} m`,
  });
  registerInteraction([hvPowerSwitchGroup, hvSwitchLever, hvSwitchBase], {
    id: 'electro-power-switch', stationId: 'electro', category: 'POWER CONTROL', name: 'Master High-Voltage Power Switch',
    action: () => (paused ? 'Flip master HV power switch ON' : 'Flip master HV power switch OFF'),
    readout: () => `HV power: ${paused ? 'OFF (De-energized)' : 'ON (Electrodes Charged)'}`,
  });
  registerInteraction([...voltageDials, ...meterNeedles, hvPowerSupply], {
    id: 'electro-voltage-dial', stationId: 'electro', category: 'POTENTIOMETER', name: 'High-Voltage Charge Potentiometer Dials',
    action: 'Rotate potentiometer dials to regulate stored charge potentials', readout: () => `Charge potentials: q₁ = ${electro.q1.toFixed(0)} μC, q₂ = ${electro.q2.toFixed(0)} μC`,
  });
  registerInteraction([rail, railBed, trackScale], {
    id: 'electro-rail', stationId: 'electro', category: 'MEASUREMENT TRACK', name: 'Laser-Etched Linear Track & Vernier Scale',
    action: 'Inspect linear optical separation track and millimeter graduations', readout: () => `Linear optical separation track: scale span 3.20 m`,
  });
  registerInteraction([fieldProbe, probeStem, probeCarrier, electrometerConsole, electrometerScreen, probeAperture, probeNeedle], {
    id: 'electro-probe', stationId: 'electro', category: 'FIELD SENSOR', name: 'Midpoint Electric Field Mill & Electrometer Sensor',
    action: 'Sample electrostatic field strength at midpoint', readout: () => `Midpoint electric field: E = ${calculateElectro(electro).fieldMidpoint.toExponential(2)} N/C`,
  });

  let wave = { ...initial.wave };
  let sound = { ...initial.sound };
  let electro = { ...initial.electro };
  let paused = false;
  let frameId = 0;
  const clock = new THREE.Clock();

  const addClipboard = (bench: THREE.Group, stationId: StationId, id: string, label: string, color: number) => {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.62), material(0x6b3f1f, { roughness: 0.7, metalness: 0.05 }));
    board.position.set(1.30, ROOM2_CONFIG.table.topHeight + ROOM2_CONFIG.table.thickness / 2 + 0.02, 0.60);
    board.rotation.y = -0.18;
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.010, 0.52), material(0xf4f1e8, { roughness: 0.92, metalness: 0 }));
    paper.position.y = 0.022;
    board.add(paper);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.028, 0.07), material(color, { metalness: 0.75, roughness: 0.22 }));
    clip.position.set(0, 0.045, -0.23);
    board.add(clip);
    bench.add(board);
    registerInteraction([board, paper, clip], {
      id, stationId, category: 'LAB DOCUMENTATION', name: `${label} Data Clipboard`,
      action: 'Record the current experimental trial', readout: 'Ready to log the live instrument values',
    });
  };
  addClipboard(waveBench.group, 'wave', 'wave-clipboard', 'Transverse Wave', 0x22d3ee);
  addClipboard(soundBench.group, 'sound', 'sound-clipboard', 'Sound Resonance', 0xa78bfa);
  addClipboard(electroBench.group, 'electro', 'electro-clipboard', 'Electrostatics', 0xfb923c);

  const getGuidanceTargetPosition = (id: string, out: THREE.Vector3): boolean => {
    const scaledHalf = THREE.MathUtils.mapLinear(electro.separation, 0.2, 1.5, 0.55, 1.55);
    switch (id) {
      // --- Station 01: Transverse Wave ---
      case 'wave-placard':
        out.set(STATION_X.wave, 2.70, -7.05);
        return true;
      case 'wave-driver':
        out.set(-1.67, 2.75, 0.0);
        return true;
      case 'wave-freq-knob':
        out.set(-1.92, 2.60, 0.16);
        return true;
      case 'wave-power-switch':
        out.set(-1.77, 2.65, 0.16);
        return true;
      case 'wave-string':
        out.set(0.0, 2.68, 0.0);
        return true;
      case 'wave-tension':
        out.set(1.70, 1.95, 0.0);
        return true;
      case 'wave-frequency':
        out.set(1.70, 2.85, 0.0);
        return true;
      case 'wave-slider':
        out.set(opticalSliderGroup.position.x, 1.55, 0.0);
        return true;
      case 'wave-clipboard':
        out.set(1.30, 1.40, 0.60);
        return true;

      // --- Station 02: Sound Resonance ---
      case 'sound-placard':
        out.set(STATION_X.sound, 2.70, -7.05);
        return true;
      case 'sound-fork':
        out.set(-7.25, 2.75, 0.0);
        return true;
      case 'sound-fork-dial':
        out.set(-7.35, 1.45, 0.35);
        return true;
      case 'sound-mallet':
        out.set(-7.01, 1.80, 0.22);
        return true;
      case 'sound-tube':
        out.set(-5.55, 2.75, 0.0);
        return true;
      case 'sound-tube-cap':
        out.set(-5.55, 1.45, 0.15);
        return true;
      case 'sound-temp-dial':
        out.set(-5.55, 1.40, -0.34);
        return true;
      case 'sound-microphone':
        out.set(-6.0 + micGroup.position.x, 2.45, 0.20);
        return true;
      case 'sound-clipboard':
        out.set(-4.70, 1.40, 0.60);
        return true;

      // --- Station 03: Electrostatics ---
      case 'electro-placard':
        out.set(STATION_X.electro, 2.70, -7.05);
        return true;
      case 'electro-q1':
        out.set(6.0 - scaledHalf, 2.25, 0.0);
        return true;
      case 'electro-q2':
        out.set(6.0 + scaledHalf, 2.25, 0.0);
        return true;
      case 'electro-leadscrew':
        out.set(7.73, 1.45, 0.0);
        return true;
      case 'electro-power-switch':
        out.set(6.0, 1.45, -0.35);
        return true;
      case 'electro-voltage-dial':
        out.set(5.80, 1.45, -0.35);
        return true;
      case 'electro-rail':
        out.set(6.0, 1.45, 0.12);
        return true;
      case 'electro-probe':
        out.set(6.0, 2.30, 0.0);
        return true;
      case 'electro-clipboard':
        out.set(7.30, 1.40, 0.60);
        return true;

      // --- Hallway Exit Door ---
      case 'campus-door':
        out.set(8.65, 2.65, -7.03);
        return true;

      default: {
        const fallbackTarget = guidanceTargets.get(id);
        if (fallbackTarget) {
          fallbackTarget.getWorldPosition(out);
          out.y = Math.min(out.y + 0.40, 3.20);
          return true;
        }
        return false;
      }
    }
  };

  const updateElectroVisuals = () => {
    const result = calculateElectro(electro);
    const scaledHalf = THREE.MathUtils.mapLinear(electro.separation, 0.2, 1.5, 0.55, 1.55);

    // Mechanically translate entire carriage assemblies
    charges[0].carriageGroup.position.x = -scaledHalf;
    charges[1].carriageGroup.position.x = scaledHalf;

    // Update flexible high-voltage leads connecting to moving carriages
    const cable1Pos = hvCableGeom1.attributes.position as THREE.BufferAttribute;
    cable1Pos.setXYZ(0, -0.20, 0.11, -0.37);
    cable1Pos.setXYZ(1, (-0.20 - scaledHalf) * 0.5, 0.06, -0.28);
    cable1Pos.setXYZ(2, -scaledHalf, 0.20, -0.13);
    cable1Pos.needsUpdate = true;

    const cable2Pos = hvCableGeom2.attributes.position as THREE.BufferAttribute;
    cable2Pos.setXYZ(0, 0.20, 0.11, -0.37);
    cable2Pos.setXYZ(1, (0.20 + scaledHalf) * 0.5, 0.06, -0.28);
    cable2Pos.setXYZ(2, scaledHalf, 0.20, -0.13);
    cable2Pos.needsUpdate = true;

    const values = [electro.q1, electro.q2];
    chargeMaterials.forEach((chargeMaterial, index) => {
      const value = values[index];
      const color = value > 0 ? 0xfb623c : value < 0 ? 0x3b82f6 : 0x94a3b8;
      const emissive = value > 0 ? 0x9a3412 : value < 0 ? 0x1d4ed8 : 0x334155;
      chargeMaterial.color.setHex(color);
      chargeMaterial.emissive.setHex(emissive);
      charges[index].sphere.scale.setScalar(0.85 + Math.min(0.35, Math.abs(value) / 24));
    });

    // Coulomb Mutual Force Vectors (safely clamped so vectors never intersect or collide)
    const maxForceLen = Math.max(0.18, (scaledHalf - 0.14) * 0.85);
    const forceLength = Math.max(0.16, Math.min(maxForceLen, 0.20 + Math.sqrt(Math.max(result.force, 0)) * 0.10));
    const attraction = result.relationship === 'Attraction';
    const directionOne = new THREE.Vector3(attraction ? 1 : -1, 0, 0);
    const directionTwo = new THREE.Vector3(attraction ? -1 : 1, 0, 0);
    forceArrows[0].position.set(-scaledHalf, ELECTRO_SURFACE_Y + 0.28, 0);
    forceArrows[0].setDirection(directionOne);
    forceArrows[0].setLength(forceLength, 0.10, 0.06);
    forceArrows[1].position.set(scaledHalf, ELECTRO_SURFACE_Y + 0.28, 0);
    forceArrows[1].setDirection(directionTwo);
    forceArrows[1].setLength(forceLength, 0.10, 0.06);
    forceArrows.forEach((arrow) => { arrow.visible = result.force > 1e-10; });

    // Midpoint Electric Field Vector Arrow (elevated cleanly above sensor mill)
    const netMidpointField = new THREE.Vector3();
    [-1, 1].forEach((side, index) => {
      const chargePosition = new THREE.Vector3(side * scaledHalf, ELECTRO_SURFACE_Y, 0);
      const origin = new THREE.Vector3(0, ELECTRO_SURFACE_Y, 0);
      const displacement = origin.clone().sub(chargePosition);
      const distanceCubed = Math.max(0.12, displacement.lengthSq()) * Math.max(0.12, displacement.length());
      netMidpointField.add(displacement.multiplyScalar(8.99e9 * values[index] * 1e-6 / distanceCubed));
    });
    const fieldMag = netMidpointField.length();
    midpointFieldArrow.visible = fieldMag > 1e-4 && (Math.abs(electro.q1) > 0 || Math.abs(electro.q2) > 0);
    if (midpointFieldArrow.visible) {
      midpointFieldArrow.position.set(0, ELECTRO_SURFACE_Y + 0.28, 0);
      midpointFieldArrow.setDirection(netMidpointField.clone().normalize());
      midpointFieldArrow.setLength(0.22 + Math.min(0.42, Math.log10(1 + fieldMag) * 0.04), 0.10, 0.06);
      midpointFieldArrow.setColor(new THREE.Color(netMidpointField.x >= 0 ? 0xf97316 : 0x38bdf8));
    }

    // Dynamic Electric Field Streamlines & Elevated Chevrons
    STREAMLINE_OFFSETS.forEach((zOffset, lineIndex) => {
      const line = streamlineLines[lineIndex];
      const chev = streamlineChevrons[lineIndex];
      const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
      const count = posAttr.count;
      const elev = zOffset === 0 ? ELECTRO_SURFACE_Y + 0.18 : ELECTRO_SURFACE_Y + 0.04;
      for (let step = 0; step < count; step += 1) {
        const u = step / (count - 1);
        const x = -scaledHalf + u * (2 * scaledHalf);
        // Dipole parabolic curve bulge in z
        const bulge = Math.sin(u * Math.PI) * zOffset;
        posAttr.setXYZ(step, x, elev, bulge);
      }
      posAttr.needsUpdate = true;
      line.visible = Math.abs(electro.q1) > 0 || Math.abs(electro.q2) > 0;

      // Position direction chevron at midpoint of streamline (arches cleanly over sensor)
      const midPoint = new THREE.Vector3(0, elev, zOffset);
      const netFieldAtMid = new THREE.Vector3();
      [-1, 1].forEach((side, index) => {
        const chargePosition = new THREE.Vector3(side * scaledHalf, ELECTRO_SURFACE_Y, 0);
        const displacement = midPoint.clone().sub(chargePosition);
        const d3 = Math.max(0.12, displacement.lengthSq()) * Math.max(0.12, displacement.length());
        netFieldAtMid.add(displacement.multiplyScalar(8.99e9 * values[index] * 1e-6 / d3));
      });
      chev.position.copy(midPoint);
      chev.visible = line.visible && netFieldAtMid.length() > 1e-4;
      if (chev.visible) {
        chev.setDirection(netFieldAtMid.normalize());
        chev.setColor(new THREE.Color(netFieldAtMid.x >= 0 ? 0xf97316 : 0x60a5fa));
      }
    });

    const beamPositions = electroBeamGeometry.attributes.position as THREE.BufferAttribute;
    beamPositions.setXYZ(0, -scaledHalf, ELECTRO_SURFACE_Y + 0.28, 0);
    beamPositions.setXYZ(1, scaledHalf, ELECTRO_SURFACE_Y + 0.28, 0);
    beamPositions.needsUpdate = true;
    electroBeam.visible = Math.abs(electro.q1) > 0 || Math.abs(electro.q2) > 0;
  };
  updateElectroVisuals();

  if (debugEnabled) {
    const debugStations: Array<[StationId, THREE.Group, (typeof EQUIPMENT_REGISTRY)[keyof typeof EQUIPMENT_REGISTRY]]> = [
      ['wave', waveGroup, EQUIPMENT_REGISTRY.waveApparatus],
      ['sound', soundGroup, EQUIPMENT_REGISTRY.soundApparatus],
      ['electro', electroGroup, EQUIPMENT_REGISTRY.electrostaticsBench],
    ];
    debugStations.forEach(([stationId, group, entry]) => {
      const axes = new THREE.AxesHelper(0.62);
      axes.position.y = 0.02;
      group.add(axes);
      const bounds = new THREE.Box3().setFromObject(group);
      scene.add(new THREE.Box3Helper(bounds, STATION_COLOR[stationId]));
      group.updateMatrixWorld(true);
      const half = new THREE.Vector3(...entry.collision.size).multiplyScalar(0.5);
      const center = new THREE.Vector3(...entry.collision.center);
      const collisionBounds = new THREE.Box3(center.clone().sub(half), center.clone().add(half));
      collisionBounds.applyMatrix4(group.matrixWorld);
      scene.add(new THREE.Box3Helper(collisionBounds, 0xf97316));
    });
    const hingeMarker = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 14), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    hingeMarker.position.copy(doorGroup.position);
    scene.add(hingeMarker);
    scene.add(new THREE.CameraHelper(camera));
  }

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.12 };
  const centerScreen = new THREE.Vector2(0, 0);
  const mouseScreenPos = new THREE.Vector2(0, 0);
  let mouseActive = false;
  let currentInteraction: EquipmentInteraction | null = null;
  let currentInteractionId = '';
  let touchLooking = false;
  let touchPointerId = -1;
  let touchTravel = 0;
  let lastX = 0;
  let lastY = 0;
  let lastFrameTime = performance.now();
  let lastFootstepTime = 0;

  const setCurrentInteraction = (next: EquipmentInteraction | null) => {
    const nextId = next?.id ?? '';
    if (nextId === currentInteractionId && next?.readout === currentInteraction?.readout && next?.description === currentInteraction?.description) return;
    currentInteraction = next;
    currentInteractionId = nextId;
    callbacks.onInteractionChange?.(next);
  };

  const updateInteractionTarget = () => {
    const isLocked = document.pointerLockElement === renderer.domElement;
    const rayPointer = isLocked || !mouseActive ? centerScreen : mouseScreenPos;
    raycaster.setFromCamera(rayPointer, camera);
    const hits = raycaster.intersectObjects(interactables, false);
    const hit = hits.find((entry) => {
      const def = entry.object.userData.equipmentInteraction as EquipmentDefinition | undefined;
      if (!def) return false;
      const maxDist = def.id.includes('placard') || def.id === 'campus-door' || def.id.includes('assistant') || def.id.includes('professor') ? 14.0 : 8.5;
      return entry.distance <= maxDist;
    });
    if (!hit) {
      setCurrentInteraction(null);
      if (!isLocked) renderer.domElement.style.cursor = 'default';
      return;
    }
    if (!isLocked) renderer.domElement.style.cursor = 'pointer';
    const definition = hit.object.userData.equipmentInteraction as EquipmentDefinition;
    const resolvedDesc = typeof definition.description === 'function'
      ? definition.description()
      : (definition.description ?? EQUIPMENT_DESCRIPTIONS[definition.id] ?? 'Precision laboratory apparatus component for physical observation and measurement.');
    setCurrentInteraction({
      id: definition.id,
      stationId: definition.stationId,
      category: definition.category,
      name: definition.name,
      description: resolvedDesc,
      action: typeof definition.action === 'function' ? definition.action() : definition.action,
      readout: typeof definition.readout === 'function' ? definition.readout() : definition.readout,
    });
  };

  const interact = () => {
    if (!currentInteraction) return;
    if (currentInteraction.id === 'student-lab-assistant') {
      assistantNodTime = clock.getElapsedTime();
    } else if (currentInteraction.id === 'physics-professor') {
      professorNodTime = clock.getElapsedTime();
    }
    callbacks.onEquipmentInteract?.(currentInteraction.id);
  };

  const interactAtScreenPoint = (clientX: number, clientY: number) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(interactables, false).find((entry) => {
      const def = entry.object.userData.equipmentInteraction as EquipmentDefinition | undefined;
      if (!def) return false;
      const maxDist = def.id.includes('placard') || def.id === 'campus-door' || def.id.includes('assistant') || def.id.includes('professor') ? 14.0 : 8.5;
      return entry.distance <= maxDist;
    });
    if (!hit) return false;
    const definition = hit.object.userData.equipmentInteraction as EquipmentDefinition;
    if (definition.id === 'student-lab-assistant') {
      assistantNodTime = clock.getElapsedTime();
    } else if (definition.id === 'physics-professor') {
      professorNodTime = clock.getElapsedTime();
    }
    callbacks.onEquipmentInteract?.(definition.id);
    return true;
  };

  const checkCollision = (x: number, z: number) => {
    if (x < -ROOM2_COLLISION.walkableHalfWidth || x > ROOM2_COLLISION.walkableHalfWidth || z < ROOM2_COLLISION.walkableBackZ || z > ROOM2_COLLISION.walkableFrontZ) return true;
    if (!doorOpen && x > ROOM2_CONFIG.door.x - ROOM2_CONFIG.door.width / 2 - ROOM2_COLLISION.playerRadius && x < ROOM2_CONFIG.door.x + ROOM2_CONFIG.door.width / 2 + ROOM2_COLLISION.playerRadius && z < ROOM2_CONFIG.door.z + 0.55) return true;
    const tableHalfWidth = ROOM2_CONFIG.table.width / 2 + ROOM2_COLLISION.playerRadius;
    const tableHalfDepth = ROOM2_CONFIG.table.depth / 2 + ROOM2_COLLISION.playerRadius;
    return (Object.keys(STATION_X) as StationId[]).some((id) => {
      const stationX = STATION_X[id];
      return x > stationX - tableHalfWidth && x < stationX + tableHalfWidth && z > -tableHalfDepth && z < tableHalfDepth;
    });
  };

  const updateMovement = (time: number) => {
    const delta = Math.min((time - lastFrameTime) / 1000, 0.08);
    lastFrameTime = time;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const direction = new THREE.Vector3();
    if (movement.forward) direction.add(forward);
    if (movement.backward) direction.sub(forward);
    if (movement.right) direction.add(right);
    if (movement.left) direction.sub(right);
    direction.addScaledVector(right, analogMovement.x);
    direction.addScaledVector(forward, analogMovement.y);
    if (direction.lengthSq() > 0) {
      const movementStrength = Math.min(1, direction.length());
      direction.normalize().multiplyScalar(3.25 * delta * movementStrength);
      const previousX = playerPosition.x;
      const previousZ = playerPosition.z;
      const candidateX = playerPosition.x + direction.x;
      if (!checkCollision(candidateX, playerPosition.z)) playerPosition.x = candidateX;
      const candidateZ = playerPosition.z + direction.z;
      if (!checkCollision(playerPosition.x, candidateZ)) playerPosition.z = candidateZ;
      if ((Math.abs(playerPosition.x - previousX) > 0.001 || Math.abs(playerPosition.z - previousZ) > 0.001) && time - lastFootstepTime > 430) {
        lastFootstepTime = time;
        callbacks.onFootstep?.();
      }
    }
    character.update(delta, playerPosition, direction, yaw, pitch, camera);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touchLooking = true;
      touchPointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      touchTravel = 0;
      renderer.domElement.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    if (document.pointerLockElement !== renderer.domElement) {
      // A normal click should still operate an apparatus in embedded previews
      // where the browser refuses pointer lock. If the click missed, fall back
      // to requesting walk mode for mouse-look and keyboard movement.
      if (!interactAtScreenPoint(event.clientX, event.clientY)) {
        const lockRequest = renderer.domElement.requestPointerLock();
        if (lockRequest && typeof (lockRequest as Promise<void>).catch === 'function') void (lockRequest as Promise<void>).catch(() => callbacks.onPointerLockChange?.(false));
      }
      return;
    }
    interact();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' && document.pointerLockElement !== renderer.domElement) {
      const bounds = renderer.domElement.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        mouseScreenPos.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        mouseActive = true;
      }
    }
    if (!touchLooking || event.pointerId !== touchPointerId) return;
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    touchTravel += Math.hypot(deltaX, deltaY);
    yaw -= deltaX * 0.004;
    pitch = THREE.MathUtils.clamp(pitch - deltaY * 0.0035, -1.25, 1.25);
    lastX = event.clientX;
    lastY = event.clientY;
    updateCamera();
  };
  const onPointerLeave = () => {
    if (document.pointerLockElement !== renderer.domElement) {
      mouseActive = false;
      setCurrentInteraction(null);
      renderer.domElement.style.cursor = 'default';
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== touchPointerId) return;
    if (touchTravel < 10) interactAtScreenPoint(event.clientX, event.clientY);
    touchLooking = false;
    touchPointerId = -1;
  };
  const onMouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= event.movementX * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -1.25, 1.25);
    updateCamera();
  };
  const onPointerLockChange = () => {
    const locked = document.pointerLockElement === renderer.domElement;
    callbacks.onPointerLockChange?.(locked);
    if (!locked) {
      movement.forward = movement.backward = movement.left = movement.right = false;
      mouseActive = false;
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select, button')) return;
    if (event.code === 'KeyW' || event.code === 'ArrowUp') movement.forward = true;
    if (event.code === 'KeyS' || event.code === 'ArrowDown') movement.backward = true;
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') movement.left = true;
    if (event.code === 'KeyD' || event.code === 'ArrowRight') movement.right = true;
    if (event.code === 'KeyE') {
      event.preventDefault();
      interact();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'KeyW' || event.code === 'ArrowUp') movement.forward = false;
    if (event.code === 'KeyS' || event.code === 'ArrowDown') movement.backward = false;
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') movement.left = false;
    if (event.code === 'KeyD' || event.code === 'ArrowRight') movement.right = false;
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let lastAnimTime = performance.now();
  const animate = (time = performance.now()) => {
    frameId = requestAnimationFrame(animate);
    const animDelta = Math.min(0.06, Math.max(0.001, (time - lastAnimTime) * 0.001));
    lastAnimTime = time;
    updateMovement(time);
    updateInteractionTarget();
    const elapsed = clock.getElapsedTime();
    const wavePositions = waveGeometry.attributes.position as THREE.BufferAttribute;
    const waveSpeed = Math.sqrt(wave.tension / wave.density);
    const waveLength = waveSpeed / wave.frequency;
    const visualK = (2 * Math.PI) / Math.max(0.35, waveLength);
    for (let index = 0; index < wavePositions.count; index += 1) {
      const x = wavePositions.getX(index);
      const envelope = Math.sin(((x - WAVE_STRING_START) / WAVE_STRING_SPAN) * Math.PI);
      const y = paused ? WAVE_STRING_Y : WAVE_STRING_Y + wave.amplitude * envelope * Math.sin(visualK * x - 2 * Math.PI * wave.frequency * elapsed);
      wavePositions.setY(index, y);
    }
    wavePositions.needsUpdate = true;
    waveBeads.forEach((bead, index) => {
      const pointIndex = Math.round((index / (waveBeads.length - 1)) * (wavePositions.count - 1));
      bead.position.y = wavePositions.getY(pointIndex);
    });

    // Wave Physical Component Animations
    freqKnob.rotation.z = (wave.frequency - 0.5) * 2.1;
    powerSwitchLever.rotation.x = paused ? 0.45 : -0.45;
    hangingMass.scale.set(1 + (wave.tension - 36) * 0.008, Math.max(0.6, wave.tension / 36), 1 + (wave.tension - 36) * 0.008);

    // Optical Slider Vernier tracking to first wave crest antinode
    const targetSliderX = THREE.MathUtils.clamp(-1.30 + Math.min(2.4, (waveLength || 15) * 0.12), -1.25, 1.25);
    opticalSliderGroup.position.x = THREE.MathUtils.lerp(opticalSliderGroup.position.x, targetSliderX, 0.10);

    if (!paused) {
      motor.rotation.x = elapsed * wave.frequency * 1.4;
      pulley.rotation.z = elapsed * wave.frequency * 1.4;
    }

    if (Math.abs(doorAnimAngle - doorTargetAngle) > 0.0005) {
      doorAnimAngle = THREE.MathUtils.lerp(doorAnimAngle, doorTargetAngle, 0.10);
      if (leftExitLeaf) leftExitLeaf.rotation.z = -doorAnimAngle;
      if (rightExitLeaf) rightExitLeaf.rotation.z = doorAnimAngle;
      if (Math.abs(doorAnimAngle - doorTargetAngle) < 0.02 && doorTargetAngle > 0.1 && doorOpenedCallback) {
        const callback = doorOpenedCallback;
        doorOpenedCallback = null;
        callback();
      }
    }

    if (assistantGroup && assistantBody) {
      // 1. Dynamic NPC Awareness & Player Tracking
      // She smoothly turns to face you when you're nearby!
      const dx = playerPosition.x - assistantBaseX;
      const dz = playerPosition.z - assistantBaseZ;
      const distToPlayer = Math.hypot(dx, dz);

      let targetYaw = assistantBaseYaw;

      // When player is within 6.5 meters and in front of assistant (dz > -0.8)
      if (distToPlayer < 6.5 && dz > -0.8) {
        const angleToPlayer = Math.atan2(dx, dz);
        // Naturally clamp turn angle within +/- 65 degrees (+/- 1.13 rad)
        targetYaw = THREE.MathUtils.clamp(angleToPlayer, assistantBaseYaw - 1.13, assistantBaseYaw + 1.13);
      } else {
        // Natural ambient idle glance looking thoughtfully around the lab
        const ambientGlance = Math.sin(elapsed * 0.32) * 0.22 + Math.sin(elapsed * 0.18) * 0.10;
        targetYaw = assistantBaseYaw + ambientGlance;
      }

      // Smooth damped turn (feels natural, responsive, and alive)
      const turnSpeed = Math.min(1.0, animDelta * 3.5);
      assistantCurrentYaw = THREE.MathUtils.lerp(assistantCurrentYaw, targetYaw, turnSpeed);
      assistantGroup.rotation.y = assistantCurrentYaw;

      // 2. Visible Organic Pelvic Weight Shift & Stance Sway
      // Relaxed ~5.2-second weight shift between left and right foot
      const swayTime = elapsed * (Math.PI * 2 / 5.2);
      const hipShiftX = Math.sin(swayTime) * 0.026; // 2.6 cm lateral weight shift
      const hipShiftZ = Math.cos(swayTime * 2.0) * 0.010; // forward/back figure-eight arc
      const balanceRoll = -Math.sin(swayTime) * 0.024; // natural 1.4-degree posture roll

      // 3. Asymmetrical Human Respiratory Breathing Cycle
      const breathPeriod = 4.5;
      const breathPhase = (elapsed % breathPeriod) / breathPeriod;
      let breathFactor = 0;
      if (breathPhase < 0.40) {
        // Inhale: smooth expansion and lift
        const t = breathPhase / 0.40;
        breathFactor = 0.5 - 0.5 * Math.cos(t * Math.PI);
      } else if (breathPhase < 0.88) {
        // Exhale: relaxed settling
        const t = (breathPhase - 0.40) / 0.48;
        breathFactor = 0.5 + 0.5 * Math.cos(t * Math.PI);
      } else {
        // Brief resting pause
        breathFactor = 0;
      }
      const breathLiftY = breathFactor * 0.010; // 1 cm vertical chest rise
      const breathPitch = breathFactor * 0.016; // subtle posture straighten on inhale

      // 4. Interactive Conversational Greeting Nod (triggered on click or [E])
      let nodPitch = 0;
      let nodDropY = 0;
      const timeSinceInteract = elapsed - assistantNodTime;
      if (timeSinceInteract >= 0 && timeSinceInteract < 1.6) {
        const nodFreq = 7.5;
        const nodDecay = Math.exp(-timeSinceInteract * 2.2);
        nodPitch = Math.sin(timeSinceInteract * nodFreq) * nodDecay * 0.11; // ~6.5 deg warm double-nod
        nodDropY = Math.max(0, Math.sin(timeSinceInteract * nodFreq)) * nodDecay * 0.008;
      }

      // Apply fluid organic motion to assistantBody (ZERO MESH WARPING!)
      assistantBody.position.set(
        hipShiftX,
        breathLiftY - nodDropY,
        hipShiftZ
      );
      assistantBody.rotation.set(
        breathPitch + nodPitch,
        0,
        balanceRoll
      );
    }

    if (professorGroup && professorBody) {
      // 1. Dynamic NPC Awareness & Player Tracking
      // The professor turns to acknowledge the student/player when approaching the whiteboard
      const profDx = playerPosition.x - professorBaseX;
      const profDz = playerPosition.z - professorBaseZ;
      const distToProf = Math.hypot(profDx, profDz);

      let profTargetYaw = professorBaseYaw;

      // Player is in front of the whiteboard / professor (profDz < 0.8) and within 7.5 meters
      if (distToProf < 7.5 && profDz < 0.8) {
        const angleToPlayer = Math.atan2(profDx, profDz);
        const yawDiff = Math.atan2(Math.sin(angleToPlayer - professorBaseYaw), Math.cos(angleToPlayer - professorBaseYaw));
        const clampedDiff = THREE.MathUtils.clamp(yawDiff, -1.05, 1.05); // +/- 60 degree tracking arc
        profTargetYaw = professorBaseYaw + clampedDiff;
      } else {
        // Natural ambient idle glance surveying the student workstations
        const ambientGlance = Math.sin(elapsed * 0.24) * 0.18 + Math.cos(elapsed * 0.14) * 0.08;
        profTargetYaw = professorBaseYaw + ambientGlance;
      }

      // Smooth damped turn
      const turnSpeed = Math.min(1.0, animDelta * 3.2);
      professorCurrentYaw = THREE.MathUtils.lerp(professorCurrentYaw, profTargetYaw, turnSpeed);
      professorGroup.rotation.y = professorCurrentYaw;

      // 2. Dignified Postural Weight Shift & Stance Sway
      const profSwayTime = elapsed * (Math.PI * 2 / 6.2);
      const profShiftX = Math.sin(profSwayTime) * 0.018; // 1.8 cm subtle weight shift
      const profShiftZ = Math.cos(profSwayTime * 2.0) * 0.007;
      const profBalanceRoll = -Math.sin(profSwayTime) * 0.016;

      // 3. Steady Human Respiratory Breathing Cycle
      const profBreathPeriod = 5.0;
      const profBreathPhase = (elapsed % profBreathPeriod) / profBreathPeriod;
      let profBreathFactor = 0;
      if (profBreathPhase < 0.42) {
        const t = profBreathPhase / 0.42;
        profBreathFactor = 0.5 - 0.5 * Math.cos(t * Math.PI);
      } else if (profBreathPhase < 0.86) {
        const t = (profBreathPhase - 0.42) / 0.44;
        profBreathFactor = 0.5 + 0.5 * Math.cos(t * Math.PI);
      }
      const profBreathY = profBreathFactor * 0.009; // 0.9 cm vertical chest rise
      const profBreathPitch = profBreathFactor * 0.012; // calm posture straighten on inhale

      // 4. Interactive Lecturing Nod / Acknowledgment (triggered on click or [E])
      let profNodPitch = 0;
      let profNodDropY = 0;
      const timeSinceProfInteract = elapsed - professorNodTime;
      if (timeSinceProfInteract >= 0 && timeSinceProfInteract < 1.8) {
        const nodFreq = 6.2;
        const nodDecay = Math.exp(-timeSinceProfInteract * 1.8);
        profNodPitch = Math.sin(timeSinceProfInteract * nodFreq) * nodDecay * 0.09;
        profNodDropY = Math.max(0, Math.sin(timeSinceProfInteract * nodFreq)) * nodDecay * 0.006;
      }

      // Apply fluid organic motion to professorBody (ZERO MESH WARPING!)
      professorBody.position.set(
        profShiftX,
        profBreathY - profNodDropY,
        profShiftZ
      );
      professorBody.rotation.set(
        profBreathPitch + profNodPitch,
        0,
        profBalanceRoll
      );
    }

    const soundResult = calculateSound(sound);
    const soundPositions = soundGeometry.attributes.position as THREE.BufferAttribute;
    const columnScale = sound.length / 0.78;
    const resonanceStrength = Math.max(0.18, 1 - Math.min(1, soundResult.detuning / Math.max(15, soundResult.fundamental * 0.28)));
    for (let index = 0; index < soundPositions.count; index += 1) {
      const normalized = index / (soundPositions.count - 1);
      const baseY = 0.24 + normalized * 2.35 * columnScale;
      soundPositions.setY(index, baseY);
      const boundaryShape = sound.tubeType === 'open'
        ? Math.cos(soundResult.harmonic * Math.PI * normalized)
        : Math.sin((soundResult.harmonic * Math.PI * normalized) / 2);
      const displacement = paused ? 0 : 0.18 * resonanceStrength * boundaryShape * Math.sin(elapsed * sound.frequency * 0.035);
      soundPositions.setX(index, 0.45 + displacement);
    }
    soundPositions.needsUpdate = true;
    airParticles.forEach((particle) => {
      const normalizedY = Number(particle.userData.normalizedY);
      const baseY = 0.28 + normalizedY * 2.24 * columnScale;
      const phase = Number(particle.userData.phase);
      const normalized = (baseY - 0.28) / 2.24;
      const compression = paused ? 0 : 0.055 * resonanceStrength * Math.sin(elapsed * 4.5 - normalized * soundResult.harmonic * Math.PI + phase);
      particle.position.y = baseY + compression;
    });
    soundRings.forEach((ring, index) => {
      const phase = (elapsed * 1.15 + index * 0.26) % 1;
      ring.scale.setScalar(0.7 + phase * 1.7);
      (ring.material as THREE.MeshBasicMaterial).opacity = paused ? 0.1 : (1 - phase) * 0.46;
    });

    // Sound Physical Apparatus Animations
    closedCap.visible = sound.tubeType === 'closed';
    tubeShell.scale.y = columnScale;
    tubeShell.position.y = 0.2 + 1.225 * columnScale;
    forkDial.rotation.z = (sound.frequency - 100) * 0.02;
    tempDialKnob.rotation.z = (sound.temperature - 20) * 0.45;
    micGroup.position.x = THREE.MathUtils.lerp(micGroup.position.x, 0.45 + (sound.distance || 1.5) * 0.38, 0.10);

    // Mallet swing and fork tine high-frequency ringing
    if (!paused) {
      malletGroup.rotation.z = Math.PI / 4 + Math.sin(elapsed * 2.0) * 0.12;
      forkTines[0].position.x = -0.12 + Math.sin(elapsed * 80) * 0.003;
      forkTines[1].position.x = 0.12 - Math.sin(elapsed * 80) * 0.003;
    } else {
      malletGroup.rotation.z = Math.PI / 4;
      forkTines[0].position.x = -0.12;
      forkTines[1].position.x = 0.12;
    }

    // Electrostatics Physical Apparatus Animations
    leadscrewKnob.rotation.x = (electro.separation - 0.2) * 10;
    hvSwitchLever.rotation.x = paused ? 0.45 : -0.45;
    meterNeedles[0].rotation.z = (electro.q1 / 8) * 0.75;
    meterNeedles[1].rotation.z = (electro.q2 / 8) * 0.75;
    voltageDials[0].rotation.z = (electro.q1 / 8) * 2.0;
    voltageDials[1].rotation.z = (electro.q2 / 8) * 2.0;
    probeAperture.rotation.z = paused ? 0 : elapsed * 6.5;

    electroBeamMaterial.opacity = paused ? 0.15 : 0.42 + Math.sin(elapsed * 8) * 0.25;
    fieldProbe.rotation.z = elapsed * 0.45;
    stationLamps[activeStation].emissiveIntensity = 2.4 + Math.sin(elapsed * 2.5) * 0.5;
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
    renderer.render(scene, camera);
  };
  animate();

  const setStation = (station: StationId) => {
    activeStation = station;
    playerPosition.set(STATION_X[station], eyeHeight, 4.55);
    yaw = 0;
    pitch = -0.08;
    character.root.position.x = playerPosition.x;
    character.root.position.z = playerPosition.z;
    stationLight.color.setHex(STATION_COLOR[station]);
    stationLight.position.x = STATION_X[station];
    (Object.keys(stationLamps) as StationId[]).forEach((id) => {
      stationLamps[id].emissiveIntensity = id === station ? 2.6 : 0.55;
    });
    updateCamera();
  };
  setStation('wave');

  if (typeof window !== 'undefined') {
    (window as any).__room2Debug = {
      scene,
      camera,
      playerPosition,
      setYaw: (newYaw: number) => { yaw = newYaw; updateCamera(); },
      setPitch: (newPitch: number) => { pitch = newPitch; updateCamera(); },
      setPos: (x: number, y: number, z: number) => { playerPosition.set(x, y, z); updateCamera(); },
      interact,
    };
  }

  return {
    dispose: () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      character.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((entry) => entry.dispose());
        }
      });
      floorTexture.dispose();
      benchTexture.dispose();
      (Object.keys(placardTextures) as StationId[]).forEach((id) => placardTextures[id].dispose());
      environmentTextures.forEach((texture) => texture.dispose());
      skyTexture.dispose();
      whiteboardTexture.dispose();
      oscilloscopeTexture.dispose();
      functionGenTexture.dispose();
      multimeterTexture.dispose();
      eyewashSignTexture.dispose();
      acousticPosterTexture.dispose();
      electroPosterTexture.dispose();
      doorSignTexture.dispose();
      mahoganyDoorTex.dispose();
      lightBrassTex.dispose();
      darkBrassTex.dispose();
      renderer.dispose();
      container.replaceChildren();
    },
    interact,
    openDoor: (onOpened) => {
      if (isDoorOpening) return;
      isDoorOpening = true;
      doorOpen = true;
      doorTargetAngle = (Math.PI / 2) * 0.88;
      doorOpenedCallback = onOpened ?? null;
      if (terminalLED) {
        (terminalLED.material as THREE.MeshBasicMaterial).color.setHex(0x10b981);
      }
      if (signMat) {
        signMat.emissiveIntensity = 0.08;
      }
      playDoorSound(true);
    },
    requestPointerLock: () => {
      const lockRequest = renderer.domElement.requestPointerLock();
      if (lockRequest && typeof (lockRequest as Promise<void>).catch === 'function') void (lockRequest as Promise<void>).catch(() => callbacks.onPointerLockChange?.(false));
    },
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
    setCharacter: (type: CharacterType) => {
      character.setCharacter(type);
      updateCamera();
    },
    getCharacter: () => character.activeCharacter,
    setMove: (direction, active) => { movement[direction] = active; },
    setMoveVector: (right, forward) => { analogMovement.set(THREE.MathUtils.clamp(right, -1, 1), THREE.MathUtils.clamp(forward, -1, 1)); },
    setElectro: (value) => { electro = { ...value }; updateElectroVisuals(); },
    setGuidance: (interactionId) => {
      activeGuidanceId = interactionId;
      guidanceMarker.visible = Boolean(activeGuidanceId);
      if (activeGuidanceId) {
        let stationId: StationId = activeStation;
        if (activeGuidanceId.startsWith('wave-')) stationId = 'wave';
        else if (activeGuidanceId.startsWith('sound-')) stationId = 'sound';
        else if (activeGuidanceId.startsWith('electro-')) stationId = 'electro';
        const color = STATION_COLOR[stationId];
        guidanceMaterial.color.setHex(color);
        guidanceMaterial.emissive.setHex(color);
        guidanceRingMaterial.color.setHex(color);
        guidanceBeamMaterial.color.setHex(color);
      }
    },
    setPaused: (value) => { paused = value; },
    setSound: (value) => { sound = { ...value }; },
    setStation,
    setWave: (value) => {
      wave = { ...value };
      hangingMass.scale.setScalar(THREE.MathUtils.clamp(value.tension / 36, 0.72, 1.35));
    },
  };
}
