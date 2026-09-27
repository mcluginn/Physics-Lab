import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  calculateElectro,
  calculateSound,
  type ElectroSettings,
  type SoundSettings,
  type StationId,
  type WaveSettings,
} from './labModel';
import { addAnchorMarkers, createReplaceableEquipment } from './equipmentAssets';
import { EQUIPMENT_REGISTRY } from './equipmentRegistry';
import { ROOM2_COLLISION, ROOM2_CONFIG } from './labSceneConfig';

export type LabSceneApi = {
  dispose: () => void;
  interact: () => void;
  openDoor: (onOpened?: () => void) => void;
  requestPointerLock: () => void;
  resetView: () => void;
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

type EquipmentDefinition = Omit<EquipmentInteraction, 'readout'> & {
  readout: string | (() => string);
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
  const top = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.table.width, ROOM2_CONFIG.table.thickness, ROOM2_CONFIG.table.depth), material(0xffffff, { map: surfaceTexture, roughness: 0.52, metalness: 0.18 }));
  top.position.y = ROOM2_CONFIG.table.topHeight;
  top.receiveShadow = true;
  group.add(top);

  const legOffsetX = ROOM2_CONFIG.table.width / 2 - 0.45;
  const legOffsetZ = ROOM2_CONFIG.table.depth / 2 - 0.35;
  [-legOffsetX, legOffsetX].forEach((legX) => {
    [-legOffsetZ, legOffsetZ].forEach((legZ) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, ROOM2_CONFIG.table.legHeight, 0.16), material(0x111827, { metalness: 0.78 }));
      leg.position.set(legX, ROOM2_CONFIG.table.legHeight / 2, legZ);
      group.add(leg);
    });
  });

  const lampMaterial = material(color, { emissive: color, emissiveIntensity: 2.3 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 18), lampMaterial);
  lamp.position.set(-1.85, 1.45, 0.95);
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
  scene.background = new THREE.Color(0x050812);
  scene.fog = new THREE.Fog(0x050812, 11, 34);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 70);
  let activeStation: StationId = 'wave';
  const eyeHeight = 1.72;
  const playerPosition = new THREE.Vector3(STATION_X.wave, eyeHeight, 5.1);
  let yaw = 0;
  let pitch = -0.08;
  const movement = { forward: false, backward: false, left: false, right: false };
  const analogMovement = new THREE.Vector2();
  const debugEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
  let doorOpen = false;
  let doorTargetRotation = 0;
  let doorOpenedCallback: (() => void) | null = null;
  const updateCamera = () => {
    camera.position.copy(playerPosition);
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
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
      interactables.push(object);
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
      loadedTexture.image = canvas;
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
  const doorCanvas = document.createElement('canvas');
  doorCanvas.width = 768;
  doorCanvas.height = 420;
  const doorContext = doorCanvas.getContext('2d');
  if (doorContext) {
    const gradient = doorContext.createLinearGradient(0, 0, 768, 420);
    gradient.addColorStop(0, '#071426');
    gradient.addColorStop(1, '#12324a');
    doorContext.fillStyle = gradient;
    doorContext.fillRect(0, 0, 768, 420);
    doorContext.strokeStyle = '#5ee7f4';
    doorContext.lineWidth = 10;
    doorContext.strokeRect(24, 24, 720, 372);
    doorContext.fillStyle = '#8ef2fc';
    doorContext.font = '700 42px Arial';
    doorContext.textAlign = 'center';
    doorContext.fillText('PHYSICS UNIVERSITY', 384, 105);
    doorContext.fillStyle = '#ffffff';
    doorContext.font = '800 72px Arial';
    doorContext.fillText('HALLWAY', 384, 218);
    doorContext.fillStyle = '#b7c9da';
    doorContext.font = '600 29px Arial';
    doorContext.fillText('ROOM DIRECTORY · 01 · 02 · 03', 384, 296);
    doorContext.fillStyle = '#fbbf24';
    doorContext.font = '700 24px Arial';
    doorContext.fillText('E  ·  EXIT ROOM 02', 384, 356);
  }
  const doorSignTexture = new THREE.CanvasTexture(doorCanvas);
  doorSignTexture.colorSpace = THREE.SRGBColorSpace;

  scene.add(new THREE.HemisphereLight(0x9dd8ff, 0x121827, 1.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.05);
  keyLight.position.set(5, 10, 8);
  keyLight.castShadow = true;
  scene.add(keyLight);
  const stationLight = new THREE.PointLight(STATION_COLOR.wave, 22, 14, 2);
  stationLight.position.set(STATION_X.wave, 4.4, 2);
  scene.add(stationLight);

  const guidanceMaterial = new THREE.MeshStandardMaterial({ color: STATION_COLOR.wave, emissive: STATION_COLOR.wave, emissiveIntensity: 2.4, roughness: 0.25, metalness: 0.12 });
  const guidanceRingMaterial = new THREE.MeshBasicMaterial({ color: STATION_COLOR.wave, transparent: true, opacity: 0.62 });
  const guidanceMarker = new THREE.Group();
  const guidanceArrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.48, 24), guidanceMaterial);
  guidanceArrow.rotation.z = Math.PI;
  const guidanceRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 12, 42), guidanceRingMaterial);
  guidanceRing.rotation.x = Math.PI / 2;
  guidanceRing.position.y = -0.34;
  guidanceMarker.add(guidanceArrow, guidanceRing);
  guidanceMarker.visible = false;
  scene.add(guidanceMarker);
  let guidanceTarget: THREE.Object3D | null = null;
  const guidancePosition = new THREE.Vector3();

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM2_CONFIG.room.width, ROOM2_CONFIG.room.depth), material(0x607188, { map: floorTexture, roughness: 0.88, metalness: 0.08 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(ROOM2_CONFIG.room.width, ROOM2_CONFIG.room.width, 0x1b506a, 0x183044);
  grid.position.y = 0.006;
  scene.add(grid);

  const wallMaterial = material(0x0a1220, { roughness: 0.84, metalness: 0.05 });
  const addWallSegment = (width: number, height: number, x: number, y: number, z: number) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, ROOM2_CONFIG.room.wallThickness), wallMaterial);
    wall.position.set(x, y, z);
    scene.add(wall);
    return wall;
  };
  const roomHalfWidth = ROOM2_CONFIG.room.width / 2;
  const doorLeft = ROOM2_CONFIG.door.x - ROOM2_CONFIG.door.width / 2;
  const doorRight = ROOM2_CONFIG.door.x + ROOM2_CONFIG.door.width / 2;
  addWallSegment(doorLeft + roomHalfWidth, ROOM2_CONFIG.room.height, (doorLeft - roomHalfWidth) / 2, ROOM2_CONFIG.room.height / 2, ROOM2_CONFIG.room.backZ);
  addWallSegment(roomHalfWidth - doorRight, ROOM2_CONFIG.room.height, (doorRight + roomHalfWidth) / 2, ROOM2_CONFIG.room.height / 2, ROOM2_CONFIG.room.backZ);
  const doorHeaderHeight = ROOM2_CONFIG.room.height - ROOM2_CONFIG.door.height;
  addWallSegment(ROOM2_CONFIG.door.width, doorHeaderHeight, ROOM2_CONFIG.door.x, ROOM2_CONFIG.door.height + doorHeaderHeight / 2, ROOM2_CONFIG.room.backZ);
  for (let x = -9; x <= 9; x += 3) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.025, ROOM2_CONFIG.room.height - 0.2, 0.03), material(0x183047, { metalness: 0.7 }));
    rail.position.set(x, (ROOM2_CONFIG.room.height - 0.2) / 2, ROOM2_CONFIG.room.backZ + 0.08);
    scene.add(rail);
  }

  const sideWallMaterial = material(0x101d2c, { roughness: 0.86, metalness: 0.04 });
  [-ROOM2_CONFIG.room.sideX, ROOM2_CONFIG.room.sideX].forEach((x) => {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.wallThickness, ROOM2_CONFIG.room.height, ROOM2_CONFIG.room.depth), sideWallMaterial);
    sideWall.position.set(x, ROOM2_CONFIG.room.height / 2, 0);
    scene.add(sideWall);
  });
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.room.width, 0.16, ROOM2_CONFIG.room.depth), material(0x08111f, { roughness: 0.92 }));
  ceiling.position.y = ROOM2_CONFIG.room.height;
  scene.add(ceiling);

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 1024;
  skyCanvas.height = 360;
  const skyContext = skyCanvas.getContext('2d');
  if (skyContext) {
    const skyGradient = skyContext.createLinearGradient(0, 0, 0, 360);
    skyGradient.addColorStop(0, '#9bd8ff');
    skyGradient.addColorStop(0.58, '#e5f4ff');
    skyGradient.addColorStop(0.59, '#7897a4');
    skyGradient.addColorStop(1, '#263d4d');
    skyContext.fillStyle = skyGradient;
    skyContext.fillRect(0, 0, 1024, 360);
    skyContext.fillStyle = 'rgba(255,255,255,.62)';
    for (let index = 0; index < 7; index += 1) skyContext.fillRect(70 + index * 145, 95 + (index % 2) * 22, 95, 9);
    skyContext.fillStyle = '#324f5e';
    for (let index = 0; index < 18; index += 1) skyContext.fillRect(index * 62, 235 - (index % 4) * 14, 45, 125);
  }
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  [-8.5, -4.6, -0.7, 3.2].forEach((x) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.45, 1.75, 0.16), material(0x52677b, { metalness: 0.72, roughness: 0.25 }));
    frame.position.set(x, 5.05, ROOM2_CONFIG.room.backZ + 0.14);
    scene.add(frame);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.22, 1.58), new THREE.MeshPhysicalMaterial({ map: skyTexture, color: 0xffffff, emissive: 0x8ac8ea, emissiveIntensity: 0.22, roughness: 0.08, metalness: 0.02, transparent: true, opacity: 0.94 }));
    pane.position.set(x, 5.05, ROOM2_CONFIG.room.backZ + 0.25);
    scene.add(pane);
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.58, 0.06), material(0x60758a, { metalness: 0.7 }));
    mullion.position.set(x, 5.05, ROOM2_CONFIG.room.backZ + 0.32);
    scene.add(mullion);
  });

  const addWallAsset = (texture: THREE.Texture, x: number, y: number, z: number, rotationY: number, width: number, height: number) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, height + 0.16, 0.12), material(0x33475a, { metalness: 0.68, roughness: 0.3 }));
    frame.position.set(x, y, z);
    frame.rotation.y = rotationY;
    scene.add(frame);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material(0xffffff, { map: texture, metalness: 0.02, roughness: 0.48 }));
    panel.position.set(x + Math.sin(rotationY) * 0.08, y, z + Math.cos(rotationY) * 0.08);
    panel.rotation.y = rotationY;
    scene.add(panel);
  };
  addWallAsset(environmentTextures[0], -10.88, 3.65, -3.8, Math.PI / 2, 2.2, 1.42);
  addWallAsset(environmentTextures[1], -10.88, 2.0, 0.25, Math.PI / 2, 1.65, 1.65);
  addWallAsset(environmentTextures[2], -10.88, 2.0, 3.45, Math.PI / 2, 1.65, 1.65);
  addWallAsset(environmentTextures[3], 10.88, 2.2, 1.7, -Math.PI / 2, 1.55, 1.75);
  addWallAsset(environmentTextures[4], 10.88, 2.4, 4.75, -Math.PI / 2, 2.4, 1.7);

  const daylight = new THREE.DirectionalLight(0xccecff, 1.2);
  daylight.position.set(-4, 8.5, -6.8);
  scene.add(daylight);
  [-4.6, 0, 4.6].forEach((x, index) => {
    const fixtureMaterial = material(0xf8fdff, { emissive: index === 1 ? 0x9de7ff : 0xffdf9d, emissiveIntensity: 1.1 });
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.42), fixtureMaterial);
    fixture.position.set(x, ROOM2_CONFIG.room.height - 0.1, -0.6);
    scene.add(fixture);
    const fixtureLight = new THREE.PointLight(index === 1 ? 0x8adfff : 0xffd28a, 3.2, 8, 2);
    fixtureLight.position.set(x, ROOM2_CONFIG.room.height - 0.35, -0.6);
    scene.add(fixtureLight);
  });

  (Object.keys(STATION_X) as StationId[]).forEach((id) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.58, 1.58, 0.12), material(0x334155, { metalness: 0.78, roughness: 0.24 }));
    frame.position.set(STATION_X[id], 3.65, -7.38);
    scene.add(frame);
    const placard = new THREE.Mesh(new THREE.PlaneGeometry(2.42, 1.42), material(0xffffff, { map: placardTextures[id], roughness: 0.38, metalness: 0.04 }));
    placard.position.set(STATION_X[id], 3.65, -7.3);
    scene.add(placard);
    registerInteraction(placard, {
      id: `${id}-placard`, stationId: id, category: 'THEORY & PLACARD', name: `${id === 'wave' ? 'Transverse Waves' : id === 'sound' ? 'Sound Resonance' : 'Electrostatics'} Visual Reference`,
      action: 'Open the station notebook and inspect the theory', readout: 'Lesson reference · apparatus overview · governing relationship',
    });
  });

  const doorFrameMaterial = material(0x1e3347, { metalness: 0.72, roughness: 0.3 });
  const doorFrame = new THREE.Group();
  doorFrame.name = 'Room02DoorFrame';
  doorFrame.position.set(ROOM2_CONFIG.door.x, ROOM2_CONFIG.door.y, ROOM2_CONFIG.room.backZ - 0.02);
  const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, ROOM2_CONFIG.door.height + 0.18, 0.3), doorFrameMaterial);
  leftJamb.position.x = -ROOM2_CONFIG.door.width / 2;
  const rightJamb = leftJamb.clone();
  rightJamb.position.x = ROOM2_CONFIG.door.width / 2;
  const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.door.width + 0.32, 0.18, 0.3), doorFrameMaterial);
  doorHeader.position.y = ROOM2_CONFIG.door.height / 2;
  doorFrame.add(leftJamb, rightJamb, doorHeader);
  scene.add(doorFrame);

  const doorPivot = new THREE.Group();
  doorPivot.name = 'Room02DoorPivot_HingeLeft';
  doorPivot.position.set(ROOM2_CONFIG.door.x - ROOM2_CONFIG.door.width / 2, ROOM2_CONFIG.room.floorY + 0.05, ROOM2_CONFIG.door.z);
  const roomDoor = new THREE.Mesh(new THREE.BoxGeometry(ROOM2_CONFIG.door.width, ROOM2_CONFIG.door.height, ROOM2_CONFIG.door.thickness), material(0xffffff, { color: 0x102337, roughness: 0.5, metalness: 0.08 }));
  roomDoor.name = 'Room02DoorLeaf';
  roomDoor.position.set(ROOM2_CONFIG.door.width / 2, ROOM2_CONFIG.door.height / 2, 0);
  const doorPanel = new THREE.Mesh(new THREE.PlaneGeometry(ROOM2_CONFIG.door.width - 0.14, ROOM2_CONFIG.door.height - 0.16), material(0xffffff, { map: doorSignTexture, roughness: 0.5, metalness: 0.08 }));
  doorPanel.name = 'Room02DoorSign';
  doorPanel.position.set(ROOM2_CONFIG.door.width / 2, ROOM2_CONFIG.door.height / 2, ROOM2_CONFIG.door.thickness / 2 + 0.006);
  const doorHandle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 18), material(0xfbbf24, { metalness: 0.86, roughness: 0.18 }));
  doorHandle.position.set(ROOM2_CONFIG.door.width - 0.28, ROOM2_CONFIG.door.height * 0.45, ROOM2_CONFIG.door.thickness / 2 + 0.1);
  doorPivot.add(roomDoor, doorPanel, doorHandle);
  scene.add(doorPivot);
  registerInteraction([doorPanel, doorHandle], {
    id: 'campus-door', stationId: 'wave', category: 'UNIVERSITY CORRIDOR', name: 'Door to the Laboratory Hallway',
    action: 'Exit Room 02 and return to the room directory', readout: 'Physics University hallway · Rooms 01, 02, and 03',
  });

  const soundBench = addBench(scene, STATION_X.sound, STATION_COLOR.sound, benchTexture);
  const waveBench = addBench(scene, STATION_X.wave, STATION_COLOR.wave, benchTexture);
  const electroBench = addBench(scene, STATION_X.electro, STATION_COLOR.electro, benchTexture);
  const stationLamps: Record<StationId, THREE.MeshStandardMaterial> = {
    wave: waveBench.lampMaterial,
    sound: soundBench.lampMaterial,
    electro: electroBench.lampMaterial,
  };

  // Station 01: transverse wave string. The fallback is built on a single
  // table-mounted assembly root so a future local GLB can replace it without
  // changing interaction or experiment code.
  const waveFallback = new THREE.Group();
  const waveAsset = createReplaceableEquipment(EQUIPMENT_REGISTRY.waveApparatus, loadingManager, () => waveFallback);
  const waveGroup = waveFallback;
  waveGroup.name = 'WaveApparatus_ProceduralFallback';
  waveGroup.position.y = ROOM2_CONFIG.table.topHeight;
  waveBench.group.add(waveAsset.root);
  addAnchorMarkers(waveGroup, EQUIPMENT_REGISTRY.waveApparatus, scene, debugEnabled);
  const waveBase = new THREE.Mesh(new RoundedBoxGeometry(4.05, 0.12, 0.82, 2, 0.045), material(0x26384d, { metalness: 0.68, roughness: 0.3 }));
  waveBase.position.y = 0.07;
  waveGroup.add(waveBase);
  [-1.7, 1.7].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.45, 18), material(0xb7c5d8, { metalness: 0.84, roughness: 0.23 }));
    post.position.set(x, 0.82, 0);
    post.castShadow = true;
    waveGroup.add(post);
    const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 18), material(0x18c6ed, { emissive: 0x063b4d, emissiveIntensity: 0.8 }));
    clamp.rotation.z = Math.PI / 2;
    clamp.position.set(x, 1.49, 0);
    waveGroup.add(clamp);
    const clampScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 12), material(0xdbeafe, { metalness: 0.9, roughness: 0.2 }));
    clampScrew.rotation.x = Math.PI / 2;
    clampScrew.position.set(x, 1.49, 0.13);
    waveGroup.add(clampScrew);
  });
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.58, 26), material(0x172235, { metalness: 0.72 }));
  motor.rotation.z = Math.PI / 2;
  motor.position.set(-1.98, 1.49, 0);
  waveGroup.add(motor);
  const motorShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 16), material(0xd0d7e2, { metalness: 0.92 }));
  motorShaft.rotation.z = Math.PI / 2;
  motorShaft.position.set(-1.67, 1.49, 0);
  waveGroup.add(motorShaft);
  const pulleyBracket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.22), material(0x52677b, { metalness: 0.8, roughness: 0.25 }));
  pulleyBracket.position.set(1.7, 1.18, 0);
  waveGroup.add(pulleyBracket);
  const pulleyAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 18), material(0xd0d7e2, { metalness: 0.92, roughness: 0.18 }));
  pulleyAxle.rotation.x = Math.PI / 2;
  pulleyAxle.position.set(1.7, 1.49, 0);
  waveGroup.add(pulleyAxle);
  const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.07, 16, 30), material(0xa9b8ca, { metalness: 0.9, roughness: 0.18 }));
  pulley.position.set(1.7, 1.49, 0);
  waveGroup.add(pulley);
  const pulleyHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.46, 20), material(0x7c8da0, { metalness: 0.9, roughness: 0.18 }));
  pulleyHub.rotation.x = Math.PI / 2;
  pulleyHub.position.set(1.7, 1.49, 0);
  waveGroup.add(pulleyHub);
  const wavePoints = Array.from({ length: 121 }, (_, index) => new THREE.Vector3(WAVE_STRING_START + (index / 120) * WAVE_STRING_SPAN, WAVE_STRING_Y, 0));
  const waveGeometry = new THREE.BufferGeometry().setFromPoints(wavePoints);
  const waveLine = new THREE.Line(waveGeometry, new THREE.LineBasicMaterial({ color: 0x67e8f9 }));
  waveGroup.add(waveLine);
  const waveBeads = Array.from({ length: 19 }, (_, index) => {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 14), material(0xfef3c7, { emissive: 0x7c5b16, emissiveIntensity: 0.6 }));
    bead.position.set(WAVE_STRING_START + (index / 18) * WAVE_STRING_SPAN, WAVE_STRING_Y, 0);
    waveGroup.add(bead);
    return bead;
  });
  const hangingMass = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.5, 0.38, 2, 0.045), material(0xf59e0b, { metalness: 0.58, roughness: 0.28 }));
  hangingMass.position.set(1.7, 0.71, 0);
  waveGroup.add(hangingMass);
  const massHook = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 10, 20), material(0xd0d7e2, { metalness: 0.9, roughness: 0.18 }));
  massHook.rotation.x = Math.PI / 2;
  massHook.position.set(1.7, 0.99, 0);
  waveGroup.add(massHook);
  const hangingCord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(WAVE_STRING_END, WAVE_STRING_Y, 0), new THREE.Vector3(WAVE_STRING_END, 1.0, 0)]), new THREE.LineBasicMaterial({ color: 0xe2e8f0 }));
  waveGroup.add(hangingCord);
  registerInteraction([motor, motorShaft], {
    id: 'wave-driver', stationId: 'wave', category: 'WAVE SOURCE', name: 'Mechanical String Driver',
    action: 'Start or stop the mechanical driver', readout: () => `Driver frequency: ${wave.frequency.toFixed(1)} Hz · ${paused ? 'Stopped' : 'Running'}`,
  });
  registerInteraction([waveLine, ...waveBeads], {
    id: 'wave-string', stationId: 'wave', category: 'TRANSMISSION MEDIUM', name: 'Taut String with Tracer Beads',
    action: 'Inspect the transverse disturbance', readout: () => `Amplitude ${wave.amplitude.toFixed(2)} m · Tension ${wave.tension.toFixed(0)} N`,
  });
  registerInteraction(hangingMass, {
    id: 'wave-tension', stationId: 'wave', category: 'BOUNDARY CONTROL', name: 'Hanging Tension Mass',
    action: 'Change the string tension', readout: () => `Tension: ${wave.tension.toFixed(0)} N`,
  });
  registerInteraction(pulley, {
    id: 'wave-frequency', stationId: 'wave', category: 'DRIVER CONTROL', name: 'Frequency Adjustment Pulley',
    action: 'Increase the driving frequency', readout: () => `Frequency: ${wave.frequency.toFixed(1)} Hz`,
  });

  // Station 02: sound source and resonance tube.
  const soundFallback = new THREE.Group();
  const soundAsset = createReplaceableEquipment(EQUIPMENT_REGISTRY.soundApparatus, loadingManager, () => soundFallback);
  const soundGroup = soundFallback;
  soundGroup.name = 'SoundApparatus_ProceduralFallback';
  soundGroup.position.y = ROOM2_CONFIG.table.topHeight;
  soundBench.group.add(soundAsset.root);
  soundGroup.userData.equipmentRegistryEntry = EQUIPMENT_REGISTRY.soundApparatus;
  addAnchorMarkers(soundGroup, EQUIPMENT_REGISTRY.soundApparatus, scene, debugEnabled);
  const tubeShell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 2.45, 36, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.25, transmission: 0.45, roughness: 0.12, metalness: 0.05, side: THREE.DoubleSide }),
  );
  tubeShell.position.set(0.45, 1.38, 0);
  soundGroup.add(tubeShell);
  const tubeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 0.18, 32), material(0x1f2937, { metalness: 0.76 }));
  tubeBase.position.set(0.45, 0.12, 0);
  soundGroup.add(tubeBase);
  const closedCap = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.08, 32), material(0x6d28d9, { emissive: 0x32156f, emissiveIntensity: 1.1 }));
  closedCap.position.set(0.45, 0.2, 0);
  soundGroup.add(closedCap);
  const soundPoints = Array.from({ length: 100 }, (_, index) => new THREE.Vector3(0.45, 0.24 + (index / 99) * 2.35, 0));
  const soundGeometry = new THREE.BufferGeometry().setFromPoints(soundPoints);
  const soundLine = new THREE.Line(soundGeometry, new THREE.LineBasicMaterial({ color: 0xd8b4fe }));
  soundGroup.add(soundLine);
  const airParticles = Array.from({ length: 54 }, (_, index) => {
    const angle = (index % 6) * (Math.PI * 2 / 6);
    const y = 0.28 + (Math.floor(index / 6) / 8) * 2.24;
    const particle = new THREE.Mesh(new THREE.SphereGeometry(0.026, 9, 9), material(0xe9d5ff, { emissive: 0x6d28d9, emissiveIntensity: 0.8 }));
    particle.position.set(0.45 + 0.19 * Math.cos(angle), y, 0.19 * Math.sin(angle));
    particle.userData.baseY = y;
    particle.userData.normalizedY = Math.floor(index / 6) / 8;
    particle.userData.phase = Math.floor(index / 6) * 0.08;
    soundGroup.add(particle);
    return particle;
  });
  const forkBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.16, 24), material(0x334155, { metalness: 0.8 }));
  forkBase.position.set(-1.25, 0.12, 0);
  soundGroup.add(forkBase);
  const forkStem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.82, 16), material(0xcbd5e1, { metalness: 0.92, roughness: 0.16 }));
  forkStem.position.set(-1.25, 0.6, 0);
  soundGroup.add(forkStem);
  const forkTines: THREE.Object3D[] = [];
  [-0.16, 0.16].forEach((x) => {
    const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 16), material(0xcbd5e1, { metalness: 0.92, roughness: 0.16 }));
    tine.position.set(-1.25 + x, 1.36, 0);
    soundGroup.add(tine);
    forkTines.push(tine);
  });
  const microphone = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.36, 8, 18), material(0x111827, { metalness: 0.68 }));
  microphone.rotation.z = Math.PI / 2;
  microphone.position.set(1.55, 1.2, 0.2);
  soundGroup.add(microphone);
  const soundRings = Array.from({ length: 4 }, (_, index) => {
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 8, 42), ringMaterial);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(-0.88 + index * 0.31, 1.36, 0);
    soundGroup.add(ring);
    return ring;
  });
  registerInteraction([forkBase, forkStem, ...forkTines], {
    id: 'sound-fork', stationId: 'sound', category: 'ACOUSTIC SOURCE', name: 'Laboratory Tuning Fork',
    action: 'Strike the tuning fork and play the tone', readout: () => `Source frequency: ${sound.frequency.toFixed(0)} Hz`,
  });
  registerInteraction([tubeShell, closedCap, soundLine], {
    id: 'sound-tube', stationId: 'sound', category: 'RESONANCE CHAMBER', name: 'Adjustable Air-Column Tube',
    action: 'Change the tube boundary condition', readout: () => `${sound.tubeType === 'closed' ? 'Closed–open' : 'Open–open'} tube · Length ${sound.length.toFixed(2)} m`,
  });
  registerInteraction(microphone, {
    id: 'sound-microphone', stationId: 'sound', category: 'ACOUSTIC SENSOR', name: 'Measurement Microphone',
    action: 'Move the microphone farther from the source', readout: () => `Observer distance: ${sound.distance.toFixed(1)} m`,
  });

  // Station 03: two-charge force and field mapper.
  const electroFallback = new THREE.Group();
  const electroAsset = createReplaceableEquipment(EQUIPMENT_REGISTRY.electrostaticsBench, loadingManager, () => electroFallback);
  const electroGroup = electroFallback;
  electroGroup.name = 'ElectrostaticsBench_ProceduralFallback';
  electroGroup.position.y = ROOM2_CONFIG.table.topHeight;
  electroBench.group.add(electroAsset.root);
  electroGroup.userData.equipmentRegistryEntry = EQUIPMENT_REGISTRY.electrostaticsBench;
  addAnchorMarkers(electroGroup, EQUIPMENT_REGISTRY.electrostaticsBench, scene, debugEnabled);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.09, 0.35), material(0x39485f, { metalness: 0.82, roughness: 0.24 }));
  rail.position.y = 0.16;
  electroGroup.add(rail);
  const chargeMaterials = [
    material(0xfb623c, { emissive: 0x9a3412, emissiveIntensity: 1.8, metalness: 0.12 }),
    material(0x3b82f6, { emissive: 0x1d4ed8, emissiveIntensity: 1.8, metalness: 0.12 }),
  ];
  const charges = [-1, 1].map((side, index) => {
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.65, 16), material(0x9aa9ba, { metalness: 0.88 }));
    holder.position.set(side * 1.1, 0.43, 0);
    electroGroup.add(holder);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.34, 30, 24), chargeMaterials[index]);
    sphere.position.set(side * 1.1, ELECTRO_SURFACE_Y, 0);
    sphere.castShadow = true;
    electroGroup.add(sphere);
    return { holder, sphere };
  });
  const fieldProbe = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 12, 32), material(0xf8fafc, { emissive: 0xf59e0b, emissiveIntensity: 1 }));
  fieldProbe.rotation.x = Math.PI / 2;
  fieldProbe.position.set(0, ELECTRO_SURFACE_Y, 0);
  electroGroup.add(fieldProbe);
  const forceArrows = [
    new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1.1, ELECTRO_SURFACE_Y + 0.46, 0), 0.72, 0xfbbf24, 0.18, 0.11),
    new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1.1, ELECTRO_SURFACE_Y + 0.46, 0), 0.72, 0xfbbf24, 0.18, 0.11),
  ];
  forceArrows.forEach((arrow) => electroGroup.add(arrow));
  const fieldArrows: Array<{ arrow: THREE.ArrowHelper; chargeIndex: number; angle: number }> = [];
  [0, 1].forEach((chargeIndex) => {
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0), new THREE.Vector3(), 0.48, chargeIndex === 0 ? 0xfb923c : 0x60a5fa, 0.1, 0.07);
      electroGroup.add(arrow);
      fieldArrows.push({ arrow, chargeIndex, angle });
    }
  });
  const electroBeamMaterial = new THREE.LineBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.7 });
  const electroBeamGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, ELECTRO_SURFACE_Y, 0), new THREE.Vector3(1, ELECTRO_SURFACE_Y, 0)]);
  const electroBeam = new THREE.Line(electroBeamGeometry, electroBeamMaterial);
  electroGroup.add(electroBeam);

  registerInteraction([charges[0].sphere, charges[0].holder], {
    id: 'electro-q1', stationId: 'electro', category: 'CHARGE SOURCE', name: 'Adjustable Charge q₁',
    action: 'Change the first charge', readout: () => `q₁ = ${electro.q1.toFixed(0)} μC`,
  });
  registerInteraction([charges[1].sphere, charges[1].holder], {
    id: 'electro-q2', stationId: 'electro', category: 'CHARGE SOURCE', name: 'Adjustable Charge q₂',
    action: 'Change the second charge', readout: () => `q₂ = ${electro.q2.toFixed(0)} μC`,
  });
  registerInteraction(rail, {
    id: 'electro-rail', stationId: 'electro', category: 'POSITION CONTROL', name: 'Precision Separation Rail',
    action: 'Increase the charge separation', readout: () => `Separation r = ${electro.separation.toFixed(2)} m`,
  });
  registerInteraction(fieldProbe, {
    id: 'electro-probe', stationId: 'electro', category: 'FIELD SENSOR', name: 'Midpoint Electric-Field Probe',
    action: 'Inspect the live field measurement', readout: () => `Midpoint field: ${calculateElectro(electro).fieldMidpoint.toExponential(2)} N/C`,
  });

  let wave = { ...initial.wave };
  let sound = { ...initial.sound };
  let electro = { ...initial.electro };
  let paused = false;
  let frameId = 0;
  const clock = new THREE.Clock();

  const addClipboard = (bench: THREE.Group, stationId: StationId, id: string, label: string, color: number) => {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.045, 0.7), material(0x6b3f1f, { roughness: 0.7, metalness: 0.05 }));
    board.position.set(1.42, 1.36, 0.66);
    board.rotation.y = -0.18;
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.6), material(0xf4f1e8, { roughness: 0.92, metalness: 0 }));
    paper.position.y = 0.03;
    board.add(paper);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.08), material(color, { metalness: 0.75, roughness: 0.22 }));
    clip.position.set(0, 0.055, -0.27);
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

  const updateElectroVisuals = () => {
    const result = calculateElectro(electro);
    const scaledHalf = THREE.MathUtils.mapLinear(electro.separation, 0.2, 1.5, 0.55, 1.55);
    charges[0].holder.position.x = -scaledHalf;
    charges[0].sphere.position.x = -scaledHalf;
    charges[1].holder.position.x = scaledHalf;
    charges[1].sphere.position.x = scaledHalf;
    const values = [electro.q1, electro.q2];
    chargeMaterials.forEach((chargeMaterial, index) => {
      const value = values[index];
      const color = value > 0 ? 0xfb623c : value < 0 ? 0x3b82f6 : 0x94a3b8;
      const emissive = value > 0 ? 0x9a3412 : value < 0 ? 0x1d4ed8 : 0x334155;
      chargeMaterial.color.setHex(color);
      chargeMaterial.emissive.setHex(emissive);
      charges[index].sphere.scale.setScalar(0.8 + Math.min(0.4, Math.abs(value) / 20));
    });
    const forceLength = 0.42 + Math.min(1.05, Math.sqrt(Math.max(result.force, 0)) * 0.24);
    const attraction = result.relationship === 'Attraction';
    const directionOne = new THREE.Vector3(attraction ? 1 : -1, 0, 0);
    const directionTwo = new THREE.Vector3(attraction ? -1 : 1, 0, 0);
    forceArrows[0].position.set(-scaledHalf, ELECTRO_SURFACE_Y + 0.46, 0);
    forceArrows[0].setDirection(directionOne);
    forceArrows[0].setLength(forceLength, 0.18, 0.11);
    forceArrows[1].position.set(scaledHalf, ELECTRO_SURFACE_Y + 0.46, 0);
    forceArrows[1].setDirection(directionTwo);
    forceArrows[1].setLength(forceLength, 0.18, 0.11);
    forceArrows.forEach((arrow) => { arrow.visible = result.force > 1e-10; });
    fieldArrows.forEach(({ arrow, chargeIndex, angle }) => {
      const centerX = chargeIndex === 0 ? -scaledHalf : scaledHalf;
      const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      const origin = new THREE.Vector3(centerX + radial.x * 0.55, ELECTRO_SURFACE_Y + radial.y * 0.55, 0);
      arrow.position.copy(origin);
      const netField = new THREE.Vector3();
      [-1, 1].forEach((side, index) => {
        const chargePosition = new THREE.Vector3(side * scaledHalf, ELECTRO_SURFACE_Y, 0);
        const displacement = origin.clone().sub(chargePosition);
        const distanceCubed = Math.max(0.12, displacement.lengthSq()) * Math.max(0.12, displacement.length());
        netField.add(displacement.multiplyScalar(8.99e9 * values[index] * 1e-6 / distanceCubed));
      });
      const magnitude = netField.length();
      arrow.visible = magnitude > 1e-5 && Math.abs(values[chargeIndex]) > 0;
      if (arrow.visible) {
        arrow.setDirection(netField.normalize());
        arrow.setLength(0.28 + Math.min(0.34, Math.log10(1 + magnitude) * 0.035), 0.1, 0.07);
      }
      arrow.setColor(new THREE.Color(netField.x >= 0 ? 0xfb923c : 0x60a5fa));
    });
    const beamPositions = electroBeamGeometry.attributes.position as THREE.BufferAttribute;
    beamPositions.setXYZ(0, -scaledHalf, ELECTRO_SURFACE_Y, 0);
    beamPositions.setXYZ(1, scaledHalf, ELECTRO_SURFACE_Y, 0);
    beamPositions.needsUpdate = true;
    electroBeam.visible = result.relationship === 'Attraction';
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
    hingeMarker.position.copy(doorPivot.position);
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
    if (nextId === currentInteractionId && next?.readout === currentInteraction?.readout) return;
    currentInteraction = next;
    currentInteractionId = nextId;
    callbacks.onInteractionChange?.(next);
  };

  const updateInteractionTarget = () => {
    raycaster.setFromCamera(centerScreen, camera);
    const hits = raycaster.intersectObjects(interactables, false);
    const hit = hits.find((entry) => entry.distance <= 6.2 && entry.object.userData.equipmentInteraction);
    if (!hit) {
      setCurrentInteraction(null);
      return;
    }
    const definition = hit.object.userData.equipmentInteraction as EquipmentDefinition;
    setCurrentInteraction({
      id: definition.id,
      stationId: definition.stationId,
      category: definition.category,
      name: definition.name,
      action: definition.action,
      readout: typeof definition.readout === 'function' ? definition.readout() : definition.readout,
    });
  };

  const interact = () => {
    if (!currentInteraction) return;
    callbacks.onEquipmentInteract?.(currentInteraction.id);
  };

  const interactAtScreenPoint = (clientX: number, clientY: number) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(interactables, false).find((entry) => entry.distance <= 6.2 && entry.object.userData.equipmentInteraction);
    if (!hit) return false;
    const definition = hit.object.userData.equipmentInteraction as EquipmentDefinition;
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
    if (direction.lengthSq() === 0) return;
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
    updateCamera();
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
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const animate = (time = performance.now()) => {
    frameId = requestAnimationFrame(animate);
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
    if (!paused) {
      motor.rotation.x = elapsed * wave.frequency * 1.4;
      pulley.rotation.z = elapsed * wave.frequency * 1.4;
    }

    doorPivot.rotation.y = THREE.MathUtils.lerp(doorPivot.rotation.y, doorTargetRotation, 0.12);
    if (Math.abs(doorPivot.rotation.y - doorTargetRotation) < 0.01 && doorOpenedCallback) {
      const callback = doorOpenedCallback;
      doorOpenedCallback = null;
      callback();
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
    closedCap.visible = sound.tubeType === 'closed';
    tubeShell.scale.y = columnScale;
    tubeShell.position.y = 0.2 + 1.225 * columnScale;

    electroBeamMaterial.opacity = paused ? 0.15 : 0.42 + Math.sin(elapsed * 8) * 0.25;
    fieldProbe.rotation.z = elapsed * 0.45;
    stationLamps[activeStation].emissiveIntensity = 2.4 + Math.sin(elapsed * 2.5) * 0.5;
    if (guidanceTarget) {
      guidanceTarget.getWorldPosition(guidancePosition);
      guidanceMarker.position.set(guidancePosition.x, guidancePosition.y + 1.05 + Math.sin(elapsed * 3.2) * 0.1, guidancePosition.z);
      guidanceRing.scale.setScalar(0.9 + Math.sin(elapsed * 4.2) * 0.12);
      guidanceMarker.rotation.y = elapsed * 0.5;
    }
    renderer.render(scene, camera);
  };
  animate();

  const setStation = (station: StationId) => {
    activeStation = station;
    playerPosition.set(STATION_X[station], eyeHeight, 4.55);
    yaw = 0;
    pitch = -0.08;
    stationLight.color.setHex(STATION_COLOR[station]);
    stationLight.position.x = STATION_X[station];
    (Object.keys(stationLamps) as StationId[]).forEach((id) => {
      stationLamps[id].emissiveIntensity = id === station ? 2.6 : 0.55;
    });
    updateCamera();
  };
  setStation('wave');

  return {
    dispose: () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
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
      doorSignTexture.dispose();
      renderer.dispose();
      container.replaceChildren();
    },
    interact,
    openDoor: (onOpened) => {
      doorOpen = true;
      doorTargetRotation = -Math.PI / 2;
      doorOpenedCallback = onOpened ?? null;
    },
    requestPointerLock: () => {
      const lockRequest = renderer.domElement.requestPointerLock();
      if (lockRequest && typeof (lockRequest as Promise<void>).catch === 'function') void (lockRequest as Promise<void>).catch(() => callbacks.onPointerLockChange?.(false));
    },
    resetView: () => setStation(activeStation),
    setMove: (direction, active) => { movement[direction] = active; },
    setMoveVector: (right, forward) => { analogMovement.set(THREE.MathUtils.clamp(right, -1, 1), THREE.MathUtils.clamp(forward, -1, 1)); },
    setElectro: (value) => { electro = { ...value }; updateElectroVisuals(); },
    setGuidance: (interactionId) => {
      guidanceTarget = interactionId ? guidanceTargets.get(interactionId) ?? null : null;
      guidanceMarker.visible = Boolean(guidanceTarget);
      const definition = guidanceTarget?.userData.equipmentInteraction as EquipmentDefinition | undefined;
      const color = definition ? STATION_COLOR[definition.stationId] : STATION_COLOR[activeStation];
      guidanceMaterial.color.setHex(color);
      guidanceMaterial.emissive.setHex(color);
      guidanceRingMaterial.color.setHex(color);
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
