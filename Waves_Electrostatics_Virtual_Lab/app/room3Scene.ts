import * as THREE from 'three';
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
};

export const ROOM3_EQUIPMENT_DESCRIPTIONS: Record<string, string> = {
  'circuits-power-switch': 'Heavy-duty illuminated rocker switch that energizes the DC power supply and AC function generator.',
  'circuits-mode-toggle': 'Switches the circuit excitation regime between DC Steady-State and AC Sinusoidal (RLC).',
  'circuits-voltage-knob': 'Precision ten-turn potentiometer dial adjusting source voltage Vs from 1.0 V to 240.0 V.',
  'circuits-freq-knob': 'AC frequency synthesizer dial tuning driving frequency f from 10 Hz to 1000 Hz.',
  'circuits-topology-selector': 'Electronic patchboard selector switching between Series, Parallel, and Series-Parallel combinations.',
  'circuits-oscilloscope': 'Tektronix Dual-Channel Digital Storage Oscilloscope rendering live real-time V(t) and I(t) waveforms and phase angle.',
  'circuits-multimeter': 'Fluke High-Accuracy Digital Multimeter measuring loop voltages, branch currents, and circuit continuity.',
  'circuits-clipboard': 'Official laboratory documentation clipboard for DC & AC circuit experiments. Press [E] to log trial data.',
  'circuits-placard': 'Architectural wall placard illustrating Ohm\'s Law, Kirchhoff\'s Laws, AC phasor diagrams, and impedance equations.',

  'optics-laser': 'Tunable continuous-wave diode laser emitter (λ = 400–700 nm) mounted on a precision optical carriage.',
  'optics-submode-toggle': 'Rotary mode switch selecting Refraction & TIR, Lenses & Mirrors, or Double-Slit Diffraction.',
  'optics-angle-dial': '360° vernier goniometer dial regulating incident beam angle θ₁ from 0.0° to 89.0° against the dielectric prism.',
  'optics-lens-carrier': 'Low-friction optical rail sled holding converging/diverging lenses with variable focal length f and object distance do.',
  'optics-slit-carrier': 'Precision optical aperture mount holding single and double slits with adjustable separation d and width a.',
  'optics-screen': 'Movable diffuse projection screen displaying live diffraction fringes and interference intensity profiles.',
  'optics-clipboard': 'Official laboratory documentation clipboard for optical experiments. Press [E] to log trial data.',
  'optics-placard': 'Architectural wall placard illustrating Snell\'s Law, thin-lens ray diagrams, and Young\'s double-slit formulas.',

  'relativity-velocity-dial': 'Ultra-relativistic velocity ratio dial regulating frame speed β = v/c from 0.000c to 0.999c.',
  'relativity-light-clock': 'Geometric photon light-clock illustrating the diagonal photon path proving time dilation Δt = γ Δt₀.',
  'relativity-contracting-rod': 'Calibrated 3D meter-rod that visibly contracts by factor 1/γ strictly along the axis of motion.',
  'relativity-calorimeter': 'Cryogenic mass-energy calorimeter measuring rest energy E₀ and relativistic kinetic energy K.',
  'relativity-accelerator': 'Relativistic linear beam pipe demonstrating particle momentum p = γ m₀ v and Cherenkov emission.',
  'relativity-clipboard': 'Official laboratory documentation clipboard for special relativity experiments. Press [E] to log trial data.',
  'relativity-placard': 'Architectural wall placard illustrating Einstein\'s postulates, Lorentz factor γ, and E = γ m₀ c².',

  'campus-door': 'Solid mahogany double doors leading back to the University Science Hallway. Walk through or press [E] to return.',
};

const STATION_POSITIONS: Record<Room3StationId, { x: number; y: number; z: number }> = {
  circuits: { x: -4.5, y: 0, z: -1.5 },
  optics: { x: 0.0, y: 0, z: -1.5 },
  relativity: { x: 4.5, y: 0, z: -1.5 },
};

const STATION_ACCENT_HEX: Record<Room3StationId, number> = {
  circuits: 0x38bdf8,
  optics: 0x10b981,
  relativity: 0xa855f7,
};

export function createRoom3Scene(
  container: HTMLDivElement,
  callbacks: Room3SceneCallbacks = {}
): Room3SceneApi {
  // 1. Scene, Camera, Renderer Setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f1d);
  scene.fog = new THREE.FogExp2(0x0a0f1d, 0.025);

  const camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 1.65, 4.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  // Character Controller
  const character = new CharacterController({
    scene,
    floorY: 0,
    initialPosition: new THREE.Vector3(0, 0, 3.8),
    initialYaw: Math.PI,
    defaultCharacter: 'female',
    allowThirdPerson: true,
    defaultThirdPerson: true,
  });

  // Current simulation states
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
    massPreset: 'probe',
    restMass: 1.00,
  };

  let activeStation: Room3StationId = 'circuits';
  let activeGuidanceId: string | null = null;
  let isPaused = false;

  // Collision boxes for room boundaries and lab benches
  const collisionBoxes: THREE.Box3[] = [];
  const addCollisionBox = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) => {
    collisionBoxes.push(new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ)));
  };

  // Outer Room bounds (16m wide, 14m deep)
  addCollisionBox(-8.2, 0, -7.5, -7.8, 4, 7.5); // West wall
  addCollisionBox(7.8, 0, -7.5, 8.2, 4, 7.5);   // East wall
  addCollisionBox(-8, 0, -7.2, 8, 4, -6.8);     // North wall
  addCollisionBox(-8, 0, 6.8, 8, 4, 7.2);       // South wall

  // Station Benches collisions
  addCollisionBox(-6.0, 0, -2.6, -3.0, 1.2, -0.4); // Station 1 bench
  addCollisionBox(-1.6, 0, -2.8, 1.6, 1.2, -0.2);  // Station 2 optical track
  addCollisionBox(3.0, 0, -2.6, 6.0, 1.2, -0.4);  // Station 3 relativity chamber

  // -------------------------------------------------------------
  // 2. Lighting & Environmental Casework
  // -------------------------------------------------------------
  const hemiLight = new THREE.HemisphereLight(0xbddcff, 0x111827, 1.2);
  scene.add(hemiLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 1.8);
  mainLight.position.set(3, 8, 5);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.bias = -0.0005;
  scene.add(mainLight);

  // Ceiling Light Troffers
  [-4, 0, 4].forEach((x) => {
    [-3, 2].forEach((z) => {
      const troffer = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.08, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 })
      );
      troffer.position.set(x, 4.15, z);
      scene.add(troffer);

      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.02, 0.65),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd6e8ff, emissiveIntensity: 1.5 })
      );
      panel.position.set(x, 4.1, z);
      scene.add(panel);

      const light = new THREE.PointLight(0xe2f0ff, 1.6, 8, 1.8);
      light.position.set(x, 3.8, z);
      scene.add(light);
    });
  });

  // -------------------------------------------------------------
  // 3. Room Architecture (Floors, Walls, Ceiling)
  // -------------------------------------------------------------
  // Floor: Epoxy Terrazzo with subtle grid
  const floorGeo = new THREE.PlaneGeometry(16, 14);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x131a2c,
    roughness: 0.25,
    metalness: 0.15,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Station demarcation rings on floor
  const createStationRing = (x: number, z: number, color: number) => {
    const ringGeo = new THREE.RingGeometry(1.4, 1.48, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.015, z);
    scene.add(ring);
    return ring;
  };

  createStationRing(-4.5, -1.5, 0x38bdf8);
  createStationRing(0.0, -1.5, 0x10b981);
  createStationRing(4.5, -1.5, 0xa855f7);

  // Ceiling
  const ceilGeo = new THREE.PlaneGeometry(16, 14);
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0c1322, roughness: 0.9 });
  const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4.2;
  scene.add(ceiling);

  // Walls: Navy Acoustic Panels
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0e172a, roughness: 0.85 });
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(16, 4.2, 0.2), wallMat);
  northWall.position.set(0, 2.1, -7.0);
  scene.add(northWall);

  const southWall = new THREE.Mesh(new THREE.BoxGeometry(16, 4.2, 0.2), wallMat);
  southWall.position.set(0, 2.1, 7.0);
  scene.add(southWall);

  const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.2, 14), wallMat);
  westWall.position.set(-8.0, 2.1, 0);
  scene.add(westWall);

  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.2, 14), wallMat);
  eastWall.position.set(8.0, 2.1, 0);
  scene.add(eastWall);

  // Baseboards and crown trims
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.4 });
  const baseNorth = new THREE.Mesh(new THREE.BoxGeometry(16, 0.16, 0.25), trimMat);
  baseNorth.position.set(0, 0.08, -6.9);
  scene.add(baseNorth);

  // -------------------------------------------------------------
  // 4. Double Mahogany Entrance Door (South Wall)
  // -------------------------------------------------------------
  const doorGroup = new THREE.Group();
  doorGroup.position.set(0, 0, 6.9);

  // Frame
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.7, 0.25), trimMat);
  doorFrame.position.set(0, 1.35, 0);
  doorGroup.add(doorFrame);

  // Mahogany Left and Right Leaves
  const doorLeafMat = new THREE.MeshStandardMaterial({ color: 0x3d170a, roughness: 0.45, metalness: 0.1 });
  const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.5, 0.08), doorLeafMat);
  leftDoor.position.set(-0.6, 1.25, 0);
  doorGroup.add(leftDoor);

  const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.5, 0.08), doorLeafMat);
  rightDoor.position.set(0.6, 1.25, 0);
  doorGroup.add(rightDoor);

  // Polished Brass Door Handles
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.9, roughness: 0.2 });
  const handleL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 16), brassMat);
  handleL.position.set(-0.15, 1.2, -0.06);
  doorGroup.add(handleL);

  const handleR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 16), brassMat);
  handleR.position.set(0.15, 1.2, -0.06);
  doorGroup.add(handleR);

  // Overhead Exit Sign
  const exitSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.25, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 1.2 })
  );
  exitSign.position.set(0, 2.85, -0.05);
  doorGroup.add(exitSign);

  scene.add(doorGroup);

  // -------------------------------------------------------------
  // 5. Interactive Equipment & Raycast Registry
  // -------------------------------------------------------------
  const interactableObjects: THREE.Object3D[] = [];
  const objectToInteractionMap = new Map<THREE.Object3D, EquipmentInteraction>();

  const registerInteractable = (
    obj: THREE.Object3D,
    interaction: EquipmentInteraction
  ) => {
    obj.userData.interactionId = interaction.id;
    interactableObjects.push(obj);
    objectToInteractionMap.set(obj, interaction);
  };

  // Register Campus Door
  const doorTrigger = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  doorTrigger.position.set(0, 1.3, 6.7);
  scene.add(doorTrigger);
  registerInteractable(doorTrigger, {
    id: 'campus-door',
    stationId: 'hallway',
    category: 'Exit',
    name: 'Corridor Double Doors',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['campus-door'],
    action: 'Return to Main Science Hallway',
    readout: 'Main Science Hallway · Room 03 Exit',
  });

  // Helper for creating heavy scientific benches
  const createBench = (x: number, z: number, width: number, depth: number) => {
    const benchGroup = new THREE.Group();
    benchGroup.position.set(x, 0, z);

    // Benchtop
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.08, depth),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.5 })
    );
    top.position.y = 0.94;
    top.castShadow = true;
    top.receiveShadow = true;
    benchGroup.add(top);

    // Frame & Legs (Industrial Steel)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.3 });
    const legGeo = new THREE.BoxGeometry(0.08, 0.9, 0.08);
    const halfW = width / 2 - 0.1;
    const halfD = depth / 2 - 0.1;
    [[-halfW, -halfD], [-halfW, halfD], [halfW, -halfD], [halfW, halfD]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.45, lz);
      leg.castShadow = true;
      benchGroup.add(leg);
    });

    // Lower storage shelf
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, 0.04, depth - 0.2), legMat);
    shelf.position.y = 0.2;
    benchGroup.add(shelf);

    scene.add(benchGroup);
    return benchGroup;
  };

  // Helper to load high-res Placard Mesh on Wall
  const textureLoader = new THREE.TextureLoader();
  const createPlacard = (
    stationId: Room3StationId,
    x: number,
    src: string,
    interactionId: string,
    title: string
  ) => {
    const placardGroup = new THREE.Group();
    placardGroup.position.set(x, 2.45, -6.88);

    // Dark Wood Frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.35, 1.45, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x241108, roughness: 0.5, metalness: 0.15 })
    );
    placardGroup.add(frame);

    // Brass Inset Trim
    const brassTrim = new THREE.Mesh(
      new THREE.BoxGeometry(2.26, 1.36, 0.07),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.8 })
    );
    placardGroup.add(brassTrim);

    // Placard Texture Canvas/Image
    const tex = textureLoader.load(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    const canvasMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.3),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 })
    );
    canvasMesh.position.z = 0.04;
    placardGroup.add(canvasMesh);

    // Brass Picture Lamp on top
    const lampArm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), brassMat);
    lampArm.position.set(0, 0.82, 0.15);
    placardGroup.add(lampArm);

    const lampShade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.12), brassMat);
    lampShade.position.set(0, 0.82, 0.3);
    placardGroup.add(lampShade);

    const spot = new THREE.SpotLight(0xfff5e6, 2.5, 4.0, Math.PI / 4, 0.4);
    spot.position.set(x, 3.25, -6.5);
    spot.target.position.set(x, 2.45, -6.88);
    scene.add(spot);
    scene.add(spot.target);

    scene.add(placardGroup);

    registerInteractable(canvasMesh, {
      id: interactionId,
      stationId,
      category: 'Reference Placard',
      name: title,
      description: ROOM3_EQUIPMENT_DESCRIPTIONS[interactionId],
      action: 'Open Interactive Notebook',
      readout: `${title} · Wall Reference Board`,
    });

    return placardGroup;
  };

  createPlacard('circuits', -4.5, '/assets/placards/placard_electricity.png', 'circuits-placard', 'DC & AC Circuits Theory Board');
  createPlacard('optics', 0.0, '/assets/placards/placard_optics.png', 'optics-placard', 'Optics & Wave Theory Board');
  createPlacard('relativity', 4.5, '/assets/placards/placard_relativity.png', 'relativity-placard', 'Special Relativity Theory Board');

  // Clipboard on each station bench
  const createClipboard = (stationId: Room3StationId, x: number, z: number, id: string, name: string) => {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.02, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 })
    );
    board.position.set(x, 0.99, z);

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
      category: 'Documentation',
      name,
      description: ROOM3_EQUIPMENT_DESCRIPTIONS[id],
      action: 'Open 8-Step Notebook',
      readout: `${name} · Ready for Trial Data Entry`,
    });
  };

  createClipboard('circuits', -3.7, -1.8, 'circuits-clipboard', 'Circuit Trials Clipboard');
  createClipboard('optics', 0.9, -1.8, 'optics-clipboard', 'Optics Trials Clipboard');
  createClipboard('relativity', 5.3, -1.8, 'relativity-clipboard', 'Relativity Trials Clipboard');

  // -------------------------------------------------------------
  // 6. Station 01 3D Apparatus: DC & AC Electrical Circuits Bench
  // -------------------------------------------------------------
  createBench(-4.5, -1.5, 2.6, 1.4);

  // Power Supply Unit
  const psuGroup = new THREE.Group();
  psuGroup.position.set(-5.3, 0.98, -1.7);
  const psuHousing = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.35, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 })
  );
  psuGroup.add(psuHousing);

  // Digital LED Display Canvas Texture
  const psuCanvas = document.createElement('canvas');
  psuCanvas.width = 512;
  psuCanvas.height = 256;
  const psuCtx = psuCanvas.getContext('2d')!;
  const psuTexture = new THREE.CanvasTexture(psuCanvas);
  const psuDisplay = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.18),
    new THREE.MeshBasicMaterial({ map: psuTexture })
  );
  psuDisplay.position.set(0, 0.05, 0.205);
  psuGroup.add(psuDisplay);

  const updatePsuTexture = (vs: number, freq: number, isAc: boolean) => {
    psuCtx.fillStyle = '#050811';
    psuCtx.fillRect(0, 0, 512, 256);
    psuCtx.font = 'bold 36px monospace';
    psuCtx.fillStyle = '#38bdf8';
    psuCtx.fillText(isAc ? 'AC FUNCTION GEN' : 'DC POWER SUPPLY', 20, 48);

    psuCtx.font = 'bold 64px monospace';
    psuCtx.fillStyle = '#ef4444';
    psuCtx.fillText(`${vs.toFixed(1)} V`, 20, 130);

    psuCtx.fillStyle = isAc ? '#10b981' : '#64748b';
    psuCtx.fillText(isAc ? `${freq.toFixed(0)} Hz` : '0 Hz (DC)', 20, 210);
    psuTexture.needsUpdate = true;
  };
  updatePsuTexture(currentCircuits.vs, currentCircuits.freq, currentCircuits.mode === 'ac');

  // Power Toggle Switch
  const powerSwitchMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0284c7, emissiveIntensity: 0.8 })
  );
  powerSwitchMesh.position.set(0.18, -0.08, 0.21);
  psuGroup.add(powerSwitchMesh);

  // Voltage Knob
  const voltKnob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 })
  );
  voltKnob.rotation.x = Math.PI / 2;
  voltKnob.position.set(-0.15, -0.08, 0.21);
  psuGroup.add(voltKnob);

  scene.add(psuGroup);

  registerInteractable(powerSwitchMesh, {
    id: 'circuits-power-switch',
    stationId: 'circuits',
    category: 'Controls',
    name: 'Power Supply Switch',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-power-switch'],
    action: 'Toggle Circuit Power',
    readout: `State: Energized · Vs = ${currentCircuits.vs.toFixed(1)} V`,
  });

  registerInteractable(voltKnob, {
    id: 'circuits-voltage-knob',
    stationId: 'circuits',
    category: 'Controls',
    name: 'Voltage Regulator Potentiometer',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-voltage-knob'],
    action: 'Adjust Source Voltage',
    readout: `Vs = ${currentCircuits.vs.toFixed(1)} V`,
  });

  // Oscilloscope Unit
  const oscGroup = new THREE.Group();
  oscGroup.position.set(-4.5, 0.98, -1.85);
  const oscHousing = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.45, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 })
  );
  oscGroup.add(oscHousing);

  const oscCanvas = document.createElement('canvas');
  oscCanvas.width = 512;
  oscCanvas.height = 384;
  const oscCtx = oscCanvas.getContext('2d')!;
  const oscTexture = new THREE.CanvasTexture(oscCanvas);
  const oscScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 0.34),
    new THREE.MeshBasicMaterial({ map: oscTexture })
  );
  oscScreen.position.set(-0.06, 0.02, 0.23);
  oscGroup.add(oscScreen);

  let oscPhase = 0;
  const updateOscilloscope = (delta: number) => {
    oscPhase += delta * (currentCircuits.mode === 'ac' ? (currentCircuits.freq / 10) : 0);
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

    // Channel 1: Voltage V(t) in Yellow
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

    // Channel 2: Current I(t) in Cyan (with phase shift)
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
    oscCtx.fillText(`CH1: ${currentCircuits.vs.toFixed(1)} V`, 20, 32);
    oscCtx.fillStyle = '#38bdf8';
    oscCtx.fillText(`CH2: ${circResult.current.toFixed(3)} A`, 20, 60);
    oscCtx.fillStyle = '#10b981';
    oscCtx.fillText(`Δφ = ${circResult.phaseAngleDeg.toFixed(1)}°`, 20, 360);
    oscCtx.fillText(`cos φ = ${circResult.powerFactor.toFixed(3)}`, 280, 360);

    oscTexture.needsUpdate = true;
  };
  updateOscilloscope(0);

  scene.add(oscGroup);

  registerInteractable(oscHousing, {
    id: 'circuits-oscilloscope',
    stationId: 'circuits',
    category: 'Instrumentation',
    name: 'Dual-Channel Digital Storage Oscilloscope',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-oscilloscope'],
    action: 'Observe Waveform Phase Shift',
    readout: `V(t) vs I(t) · Phase Shift φ = ${calculateCircuit(currentCircuits).phaseAngleDeg.toFixed(1)}°`,
  });

  // Breadboard with RLC network
  const breadboardGroup = new THREE.Group();
  breadboardGroup.position.set(-4.5, 0.99, -1.35);

  const breadboardPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.04, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7 })
  );
  breadboardGroup.add(breadboardPlate);

  // 3D Resistors R1, R2, R3
  const create3DResistor = (x: number, z: number, label: string) => {
    const resGroup = new THREE.Group();
    resGroup.name = label;
    resGroup.position.set(x, 0.03, z);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.12, 16),
      new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.5 })
    );
    body.rotation.z = Math.PI / 2;
    resGroup.add(body);

    // Color bands
    const bandMat = new THREE.MeshBasicMaterial({ color: 0xb45309 });
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.015, 16), bandMat);
    b1.rotation.z = Math.PI / 2;
    b1.position.x = -0.03;
    resGroup.add(b1);

    breadboardGroup.add(resGroup);
    return resGroup;
  };

  create3DResistor(-0.25, 0, 'R1');
  create3DResistor(0, 0, 'R2');
  create3DResistor(0.25, 0, 'R3');

  // Inductor Coil (Helical cylinder representation)
  const inductor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.14, 16),
    new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.85, roughness: 0.25 })
  );
  inductor.rotation.x = Math.PI / 2;
  inductor.position.set(-0.25, 0.04, -0.12);
  breadboardGroup.add(inductor);

  // Capacitor (Electrolytic Canister)
  const capacitor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: 0x0369a1, metalness: 0.5, roughness: 0.3 })
  );
  capacitor.position.set(0.25, 0.06, -0.12);
  breadboardGroup.add(capacitor);

  scene.add(breadboardGroup);

  registerInteractable(breadboardPlate, {
    id: 'circuits-topology-selector',
    stationId: 'circuits',
    category: 'Topology',
    name: 'Configurable RLC Breadboard Matrix',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['circuits-topology-selector'],
    action: 'Change Circuit Topology',
    readout: `Topology: ${currentCircuits.topology.toUpperCase()} · Req = ${calculateCircuit(currentCircuits).req.toFixed(1)} Ω`,
  });

  // -------------------------------------------------------------
  // 7. Station 02 3D Apparatus: Geometric & Physical Optics Bench
  // -------------------------------------------------------------
  createBench(0.0, -1.5, 2.8, 1.4);

  // 2.2m Anodized Optical Rail
  const railGroup = new THREE.Group();
  railGroup.position.set(0, 0.98, -1.5);

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.06, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.25 })
  );
  railGroup.add(rail);

  // Laser Diode Emitter (Left end of rail)
  const laserHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.22, 24),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 })
  );
  laserHousing.rotation.z = Math.PI / 2;
  laserHousing.position.set(-1.0, 0.12, 0);
  railGroup.add(laserHousing);

  // Dynamic Laser Beam Line Strip
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

  // Semicircular Prism / Lens carrier (Center of rail)
  const opticalElementGroup = new THREE.Group();
  opticalElementGroup.position.set(0, 0.12, 0);

  // Glass Semicylinder for Refraction & TIR
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

  // Biconvex Lens (for Imaging mode)
  const lensMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 32, 16),
    prismGlassMat
  );
  lensMesh.scale.set(0.2, 1, 1);
  lensMesh.visible = false;
  opticalElementGroup.add(lensMesh);

  // Double Slit Aperture Plate (for Diffraction mode)
  const slitPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.22, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 })
  );
  slitPlate.visible = false;
  opticalElementGroup.add(slitPlate);

  railGroup.add(opticalElementGroup);

  // Observation Screen with Dynamic Interference Fringes
  const screenGroup = new THREE.Group();
  screenGroup.position.set(1.0, 0.2, 0);

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
      // Interference & Diffraction Intensity Profile
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
      // Spot where refracted beam hits
      screenCtx.fillStyle = laserHex;
      screenCtx.beginPath();
      const spotY = 256 + (optResult.isTIR ? 0 : Math.sin((optResult.theta2Deg ?? 0) * Math.PI / 180) * 140);
      screenCtx.arc(256, spotY, 24, 0, Math.PI * 2);
      screenCtx.fill();
    } else {
      // Imaging: Arrow representing image
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
    category: 'Source',
    name: 'Monochromatic Tunable Laser Source',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-laser'],
    action: 'Adjust Wavelength / Toggle Laser',
    readout: `λ = ${currentOptics.wavelength} nm · Beam Color: ${wavelengthToRGB(currentOptics.wavelength)}`,
  });

  registerInteractable(prismMesh, {
    id: 'optics-angle-dial',
    stationId: 'optics',
    category: 'Goniometer',
    name: 'Precision Snell\'s Law Prism Tank',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-angle-dial'],
    action: 'Rotate Incident Angle θ₁',
    readout: `θ₁ = ${currentOptics.theta1.toFixed(1)}° · n₁ = ${currentOptics.n1.toFixed(2)} · n₂ = ${currentOptics.n2.toFixed(2)}`,
  });

  registerInteractable(screenSurface, {
    id: 'optics-screen',
    stationId: 'optics',
    category: 'Detector',
    name: 'Interference Fringe Observation Screen',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['optics-screen'],
    action: 'Inspect Fringe Profile',
    readout: `Screen Distance L = ${currentOptics.screenDistance.toFixed(2)} m · Fringe Δy = ${calculateOptics(currentOptics).fringeSpacingMm.toFixed(2)} mm`,
  });

  // -------------------------------------------------------------
  // 8. Station 03 3D Apparatus: Relativistic Observation Chamber
  // -------------------------------------------------------------
  createBench(4.5, -1.5, 2.6, 1.4);

  const relativityGroup = new THREE.Group();
  relativityGroup.position.set(4.5, 0.98, -1.5);

  // Linear Maglev Track for Relativistic Sled
  const track = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.05, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 })
  );
  relativityGroup.add(track);

  // Moving Frame S' Relativistic Carrier / Sled
  const sledGroup = new THREE.Group();
  sledGroup.position.set(0, 0.12, 0);

  const sledBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.12, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.7, roughness: 0.3 })
  );
  sledGroup.add(sledBody);

  // Contracting 3D Meter-Rod (Positioned along X-axis of motion)
  const contractingRodGeo = new THREE.BoxGeometry(0.7, 0.04, 0.04);
  const contractingRodMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.25 });
  const contractingRod = new THREE.Mesh(contractingRodGeo, contractingRodMat);
  contractingRod.position.set(0, 0.12, 0.12);
  sledGroup.add(contractingRod);

  // Photon Light-Clock on Sled (Two mirror plates + bouncing photon pulse)
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.98, roughness: 0.05 });
  const mirrorTop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.15), mirrorMat);
  mirrorTop.position.set(0, 0.35, -0.05);
  sledGroup.add(mirrorTop);

  const mirrorBottom = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.15), mirrorMat);
  mirrorBottom.position.set(0, 0.05, -0.05);
  sledGroup.add(mirrorBottom);

  // Bouncing Photon Pulse Sphere
  const photonPulse = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  );
  photonPulse.position.set(0, 0.2, -0.05);
  sledGroup.add(photonPulse);

  relativityGroup.add(sledGroup);

  // Stationary Frame S Lab Atomic Clock
  const clockCanvas = document.createElement('canvas');
  clockCanvas.width = 512;
  clockCanvas.height = 256;
  const clockCtx = clockCanvas.getContext('2d')!;
  const clockTexture = new THREE.CanvasTexture(clockCanvas);

  const atomicClock = new THREE.Mesh(
    new THREE.PlaneGeometry(0.45, 0.22),
    new THREE.MeshBasicMaterial({ map: clockTexture })
  );
  atomicClock.position.set(-0.6, 0.25, -0.4);
  relativityGroup.add(atomicClock);

  let photonY = 0.05;
  let photonDirection = 1;
  let labTime = 0;

  const updateRelativityApparatus = (delta: number) => {
    const relResult = calculateRelativity(currentRelativity);

    // Physically scale the meter-rod mesh along the motion X-axis by 1 / gamma
    const contractionFactor = 1 / relResult.gamma;
    contractingRod.scale.x = Math.max(0.05, contractionFactor);

    // Animate the photon bouncing between mirrors
    const bounceSpeed = 1.2 * (1 / relResult.gamma); // Appears slower in moving frame
    photonY += photonDirection * bounceSpeed * delta;
    if (photonY > 0.33) {
      photonY = 0.33;
      photonDirection = -1;
    } else if (photonY < 0.07) {
      photonY = 0.07;
      photonDirection = 1;
    }
    photonPulse.position.y = photonY;

    // Update Digital Atomic Clocks display
    labTime += delta;
    clockCtx.fillStyle = '#0f172a';
    clockCtx.fillRect(0, 0, 512, 256);

    clockCtx.font = 'bold 28px monospace';
    clockCtx.fillStyle = '#a855f7';
    clockCtx.fillText(`FRAME S (LAB)`, 20, 40);
    clockCtx.fillStyle = '#ffffff';
    clockCtx.fillText(`t_lab: ${labTime.toFixed(1)} s`, 20, 80);

    clockCtx.fillStyle = '#38bdf8';
    clockCtx.fillText(`FRAME S' (SPACECRAFT)`, 20, 140);
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
    category: 'Kinematics',
    name: 'Contracting Meter-Rod Interferometer',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-contracting-rod'],
    action: 'Observe Length Contraction',
    readout: `Proper Length L₀ = ${currentRelativity.properLength.toFixed(1)} m · Contracted L = ${calculateRelativity(currentRelativity).contractedLength.toFixed(2)} m`,
  });

  registerInteractable(sledBody, {
    id: 'relativity-velocity-dial',
    stationId: 'relativity',
    category: 'Kinematics',
    name: 'Relativistic Velocity Control',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-velocity-dial'],
    action: 'Tune Frame Velocity β = v/c',
    readout: `β = ${currentRelativity.beta.toFixed(3)}c · Lorentz Factor γ = ${calculateRelativity(currentRelativity).gamma.toFixed(3)}`,
  });

  registerInteractable(atomicClock, {
    id: 'relativity-light-clock',
    stationId: 'relativity',
    category: 'Chronometry',
    name: 'Synchronized Atomic Light-Clock',
    description: ROOM3_EQUIPMENT_DESCRIPTIONS['relativity-light-clock'],
    action: 'Observe Time Dilation',
    readout: `Dilated Time Δt = ${calculateRelativity(currentRelativity).dilatedTime.toFixed(2)} s (vs proper Δt₀ = ${currentRelativity.properTime.toFixed(1)} s)`,
  });

  // -------------------------------------------------------------
  // 9. Pulsing In-World 3D Guidance Marker & Navigation System
  // -------------------------------------------------------------
  const guidanceMarker = new THREE.Group();
  guidanceMarker.name = 'GuidanceMarker';
  guidanceMarker.renderOrder = 9999;

  const guidanceMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });
  const guidanceRingMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
    wireframe: true,
    depthTest: false,
  });
  const guidanceBeamMaterial = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });

  // 1. Tapered Downward Pointer Arrow
  const guidanceArrow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 20), guidanceMaterial);
  guidanceArrow.rotation.z = Math.PI; // Cone pointing down
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

  const guidancePosition = new THREE.Vector3();

  const getGuidanceTargetPosition = (id: string, out: THREE.Vector3): boolean => {
    switch (id) {
      // --- Station 01: Circuits ---
      case 'circuits-placard':
        out.set(-4.5, 2.70, -6.85);
        return true;
      case 'circuits-power-switch':
        out.set(-5.46, 1.35, -1.49);
        return true;
      case 'circuits-voltage-knob':
        out.set(-5.14, 1.35, -1.49);
        return true;
      case 'circuits-oscilloscope':
        out.set(-4.55, 1.55, -1.75);
        return true;
      case 'circuits-topology-selector':
        out.set(-4.45, 1.35, -1.25);
        return true;
      case 'circuits-clipboard':
        out.set(-3.70, 1.35, -1.80);
        return true;

      // --- Station 02: Optics ---
      case 'optics-placard':
        out.set(0.0, 2.70, -6.85);
        return true;
      case 'optics-laser':
        out.set(-0.75, 1.45, -1.50);
        return true;
      case 'optics-angle-dial':
        out.set(0.0, 1.45, -1.50);
        return true;
      case 'optics-screen':
        out.set(0.75, 1.45, -1.50);
        return true;
      case 'optics-clipboard':
        out.set(0.90, 1.35, -1.80);
        return true;

      // --- Station 03: Special Relativity ---
      case 'relativity-placard':
        out.set(4.5, 2.70, -6.85);
        return true;
      case 'relativity-velocity-dial':
        out.set(4.50, 1.45, -1.40);
        return true;
      case 'relativity-contracting-rod':
        out.set(4.50, 1.55, -1.40);
        return true;
      case 'relativity-light-clock':
        out.set(5.20, 1.55, -1.50);
        return true;
      case 'relativity-clipboard':
        out.set(5.30, 1.35, -1.80);
        return true;

      // --- Laboratory Exit Doors ---
      case 'campus-door':
        out.set(0.0, 2.20, 6.20);
        return true;

      default: {
        if (id.startsWith('circuits-')) {
          out.set(-4.5, 1.40, -1.50);
          return true;
        }
        if (id.startsWith('optics-')) {
          out.set(0.0, 1.40, -1.50);
          return true;
        }
        if (id.startsWith('relativity-')) {
          out.set(4.5, 1.40, -1.50);
          return true;
        }
        return false;
      }
    }
  };

  const updateGuidanceMarker = (elapsedTime: number) => {
    if (activeGuidanceId && guidanceMarker.visible) {
      if (getGuidanceTargetPosition(activeGuidanceId, guidancePosition)) {
        const bobbing = Math.sin(elapsedTime * 3.5) * 0.035;
        guidanceMarker.position.set(guidancePosition.x, guidancePosition.y + bobbing, guidancePosition.z);
        const pulse = 0.85 + Math.sin(elapsedTime * 4.5) * 0.15;
        guidanceRing.scale.setScalar(pulse);
        guidanceInnerRing.scale.setScalar(1.4 - pulse * 0.4);
        guidanceMarker.rotation.y = elapsedTime * 0.75;
      }
    }
  };

  // -------------------------------------------------------------
  // 10. Proximity & Raycast Interaction Handling
  // -------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);
  let currentHoveredInteraction: EquipmentInteraction | null = null;

  const checkInteractions = () => {
    raycaster.setFromCamera(screenCenter, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    let foundInteraction: EquipmentInteraction | null = null;
    if (intersects.length > 0 && intersects[0].distance < 3.8) {
      let currentObj: THREE.Object3D | null = intersects[0].object;
      while (currentObj && !foundInteraction) {
        if (objectToInteractionMap.has(currentObj)) {
          foundInteraction = objectToInteractionMap.get(currentObj)!;
        }
        currentObj = currentObj.parent;
      }
    }

    if (foundInteraction !== currentHoveredInteraction) {
      currentHoveredInteraction = foundInteraction;
      callbacks.onInteractionChange?.(currentHoveredInteraction);
    }
  };

  // -------------------------------------------------------------
  // 11. Keyboard, Mouse, and Animation Loop
  // -------------------------------------------------------------
  // Character position, orientation & movement
  const playerPosition = new THREE.Vector3(0, 0, 3.8);
  let yaw = Math.PI;
  let pitch = 0;
  const direction = new THREE.Vector3();
  const moveVector = new THREE.Vector2(0, 0);
  const moveKeys = { forward: false, backward: false, left: false, right: false };

  const checkCollision = (x: number, z: number) => {
    if (x < -7.2 || x > 7.2 || z < -6.0 || z > 6.2) return true;
    if (x > -6.1 && x < -2.9 && z > -2.5 && z < -0.5) return true;
    if (x > -1.6 && x < 1.6 && z > -2.5 && z < -0.5) return true;
    if (x > 2.9 && x < 6.1 && z > -2.5 && z < -0.5) return true;
    return false;
  };

  // Pointer drag for camera look
  let isPointerDown = false;
  let prevMouseX = 0;
  let prevMouseY = 0;
  const onPointerDown = (e: PointerEvent) => {
    if (e.target !== renderer.domElement) return;
    isPointerDown = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (document.pointerLockElement === container || document.pointerLockElement === renderer.domElement) {
      yaw -= e.movementX * 0.0024;
      pitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, pitch - e.movementY * 0.0024));
    } else if (isPointerDown) {
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      yaw -= dx * 0.0035;
      pitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, pitch - dy * 0.0035));
    }
  };
  const onPointerUp = () => {
    isPointerDown = false;
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (['w', 'arrowup'].includes(key)) { moveKeys.forward = true; }
    else if (['s', 'arrowdown'].includes(key)) { moveKeys.backward = true; }
    else if (['a', 'arrowleft'].includes(key)) { moveKeys.left = true; }
    else if (['d', 'arrowright'].includes(key)) { moveKeys.right = true; }
    else if (key === 'e') {
      if (currentHoveredInteraction) {
        callbacks.onEquipmentInteract?.(currentHoveredInteraction.id);
      }
    } else if (key === 'v') {
      character.toggleView();
    } else if (key === '1') {
      // Teleport to Station 1
      playerPosition.set(-4.5, 0, 0.4);
      yaw = Math.PI;
      pitch = 0;
    } else if (key === '2') {
      // Teleport to Station 2
      playerPosition.set(0.0, 0, 0.4);
      yaw = Math.PI;
      pitch = 0;
    } else if (key === '3') {
      // Teleport to Station 3
      playerPosition.set(4.5, 0, 0.4);
      yaw = Math.PI;
      pitch = 0;
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (['w', 'arrowup'].includes(key)) { moveKeys.forward = false; }
    else if (['s', 'arrowdown'].includes(key)) { moveKeys.backward = false; }
    else if (['a', 'arrowleft'].includes(key)) { moveKeys.left = false; }
    else if (['d', 'arrowright'].includes(key)) { moveKeys.right = false; }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Resize handler
  const onResize = () => {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  // Render loop
  const clock = new THREE.Clock();
  let animationFrameId: number;

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);
    const delta = Math.min(0.1, clock.getDelta());
    const elapsedTime = clock.getElapsedTime();

    if (!isPaused) {
      // Update player movement vector
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      direction.set(0, 0, 0);
      if (moveKeys.forward) direction.add(forward);
      if (moveKeys.backward) direction.sub(forward);
      if (moveKeys.right) direction.add(right);
      if (moveKeys.left) direction.sub(right);
      direction.addScaledVector(right, moveVector.x);
      direction.addScaledVector(forward, moveVector.y);

      if (direction.lengthSq() > 0) {
        const movementStrength = Math.min(1, direction.length());
        direction.normalize().multiplyScalar(3.2 * delta * movementStrength);
        const candX = playerPosition.x + direction.x;
        if (!checkCollision(candX, playerPosition.z)) playerPosition.x = candX;
        const candZ = playerPosition.z + direction.z;
        if (!checkCollision(playerPosition.x, candZ)) playerPosition.z = candZ;
      }

      character.update(delta, playerPosition, direction, yaw, pitch, camera, false);
      updateOscilloscope(delta);
      updateRelativityApparatus(delta);
      updateGuidanceMarker(elapsedTime);
      checkInteractions();
    }

    renderer.render(scene, camera);
  };
  animate();

  callbacks.onAssetsReady?.();

  // -------------------------------------------------------------
  // 12. Return Scene API
  // -------------------------------------------------------------
  return {
    dispose: () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      character.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    },
    interact: () => {
      if (currentHoveredInteraction) {
        callbacks.onEquipmentInteract?.(currentHoveredInteraction.id);
      }
    },
    openDoor: (onOpened) => {
      // Smooth animation opening mahogany doors
      let t = 0;
      const doorOpenInterval = setInterval(() => {
        t += 0.05;
        leftDoor.rotation.y = -t * (Math.PI / 2.2);
        rightDoor.rotation.y = t * (Math.PI / 2.2);
        if (t >= 1) {
          clearInterval(doorOpenInterval);
          onOpened?.();
        }
      }, 16);
    },
    requestPointerLock: () => {
      container.requestPointerLock?.();
    },
    resetView: () => {
      playerPosition.set(0, 0, 3.8);
      yaw = Math.PI;
      pitch = 0;
    },
    toggleView: () => {
      return character.toggleView();
    },
    switchCharacter: () => {
      return character.switchCharacter();
    },
    setCharacter: (type: CharacterType) => {
      character.setCharacter(type);
    },
    getCharacter: () => {
      return character.activeCharacter;
    },
    setMove: (direction, active) => {
      moveKeys[direction] = active;
    },
    setMoveVector: (right, forward) => {
      moveVector.set(right, forward);
    },
    setCircuits: (settings: CircuitSettings) => {
      currentCircuits = { ...settings };
      updatePsuTexture(currentCircuits.vs, currentCircuits.freq, currentCircuits.mode === 'ac');
    },
    setOptics: (settings: OpticsSettings) => {
      currentOptics = { ...settings };
      beamMat.color.set(wavelengthToRGB(currentOptics.wavelength));
      prismMesh.visible = currentOptics.subMode === 'refraction';
      lensMesh.visible = currentOptics.subMode === 'imaging';
      slitPlate.visible = currentOptics.subMode === 'diffraction';
      updateScreenTexture();
    },
    setRelativity: (settings: RelativitySettings) => {
      currentRelativity = { ...settings };
    },
    setStation: (station: Room3StationId) => {
      activeStation = station;
      const targetPos = STATION_POSITIONS[station];
      playerPosition.set(targetPos.x, 0, 0.4);
      yaw = Math.PI;
      pitch = 0;
    },
    setGuidance: (interactionId: string | null) => {
      activeGuidanceId = interactionId;
      guidanceMarker.visible = Boolean(activeGuidanceId);
      if (activeGuidanceId) {
        let stId: Room3StationId = activeStation;
        if (activeGuidanceId.startsWith('circuits-')) stId = 'circuits';
        else if (activeGuidanceId.startsWith('optics-')) stId = 'optics';
        else if (activeGuidanceId.startsWith('relativity-')) stId = 'relativity';
        const color = STATION_ACCENT_HEX[stId] ?? 0x38bdf8;
        guidanceMaterial.color.setHex(color);
        guidanceRingMaterial.color.setHex(color);
        guidanceBeamMaterial.color.setHex(color);
      }
    },
    setPaused: (paused: boolean) => {
      isPaused = paused;
    },
  };
}
