import type { Vec3 } from './labSceneConfig';

export type TextureMapSet = Partial<Record<'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap', string>>;
export type MaterialOverride = {
  color?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transmission?: number;
  opacity?: number;
  transparent?: boolean;
  textures?: TextureMapSet;
};

export type EquipmentRegistryEntry = {
  id: string;
  label: string;
  /** Set a local /assets/... GLB or GLTF path when a custom model is ready. */
  model: string | null;
  scale: Vec3;
  rotation: Vec3;
  offset: Vec3;
  pivot: Vec3;
  anchors: Record<string, Vec3>;
  collision: { center: Vec3; size: Vec3 };
  interactionPoints: Record<string, string>;
  animationHooks: string[];
  materialOverrides?: Record<string, MaterialOverride>;
};

/** Replaceable Room 02 equipment definitions. Procedural builders remain the
 * deterministic fallback until a local GLB/GLTF is supplied for an entry. */
export const EQUIPMENT_REGISTRY = {
  waveApparatus: {
    id: 'wave-apparatus',
    label: 'Transverse-wave apparatus',
    model: null,
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    pivot: [0, 0, 0],
    anchors: {
      tableMount: [0, 0, 0],
      stringStart: [-1.67, 1.49, 0],
      stringEnd: [1.7, 1.49, 0],
      pulleyAxis: [1.7, 1.49, 0],
      massAttachment: [1.7, 0.99, 0],
      powerConnection: [-1.98, 1.49, 0],
    },
    collision: { center: [0, 0.28, 0], size: [4.15, 1.65, 0.7] },
    interactionPoints: { driver: 'powerConnection', string: 'stringStart', tension: 'massAttachment', frequency: 'pulleyAxis' },
    animationHooks: ['driverRotation', 'stringWave', 'pulleyRotation'],
    materialOverrides: {
      default: { metalness: 0.58, roughness: 0.32 },
      rubber: { metalness: 0.05, roughness: 0.78 },
    },
  },
  soundApparatus: {
    id: 'sound-apparatus',
    label: 'Sound resonance apparatus',
    model: null,
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    pivot: [0, 0, 0],
    anchors: {
      tableMount: [0, 0, 0],
      sourceMount: [-1.25, 0.12, 0],
      tubeBase: [0.45, 0.12, 0],
      microphoneMount: [1.55, 1.2, 0.2],
    },
    collision: { center: [0, 1.15, 0], size: [3.2, 2.8, 0.85] },
    interactionPoints: { source: 'sourceMount', tube: 'tubeBase', microphone: 'microphoneMount' },
    animationHooks: ['airColumnOscillation', 'resonanceRings'],
    materialOverrides: {
      default: { metalness: 0.42, roughness: 0.28 },
      glass: { transmission: 0.55, roughness: 0.12, transparent: true, opacity: 0.32 },
    },
  },
  electrostaticsBench: {
    id: 'electrostatics-bench',
    label: 'Coulomb force and field bench',
    model: null,
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    pivot: [0, 0, 0],
    anchors: {
      tableMount: [0, 0, 0],
      chargeOne: [-1.1, 0.48, 0],
      chargeTwo: [1.1, 0.48, 0],
      sensorMount: [0, 0.48, 0],
      separationRail: [0, -0.25, 0],
    },
    collision: { center: [0, 0.5, 0], size: [3.8, 1.6, 0.85] },
    interactionPoints: { chargeOne: 'chargeOne', chargeTwo: 'chargeTwo', probe: 'sensorMount', rail: 'separationRail' },
    animationHooks: ['fieldVectors', 'forceArrows'],
    materialOverrides: {
      default: { metalness: 0.62, roughness: 0.3 },
      insulator: { metalness: 0.08, roughness: 0.62 },
    },
  },
} satisfies Record<string, EquipmentRegistryEntry>;

export type EquipmentAssetId = keyof typeof EQUIPMENT_REGISTRY;
