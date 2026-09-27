import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { EquipmentRegistryEntry, MaterialOverride, TextureMapSet } from './equipmentRegistry';

export type EquipmentAssetHandle = {
  root: THREE.Group;
  fallback: THREE.Object3D;
  usingCustomModel: boolean;
};

function applyMaterialOverrides(model: THREE.Object3D, entry: EquipmentRegistryEntry, manager: THREE.LoadingManager) {
  const overrides = entry.materialOverrides;
  if (!overrides) return;
  const textureLoader = new THREE.TextureLoader(manager);
  const loadTexture = (path: string, slot: keyof TextureMapSet, target: THREE.Material) => {
    textureLoader.load(path, (texture) => {
      texture.colorSpace = slot === 'map' || slot === 'emissiveMap' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      (target as unknown as Record<string, unknown>)[slot] = texture;
      target.needsUpdate = true;
    });
  };
  const apply = (target: THREE.Material) => {
    const named = overrides[target.name] ?? {};
    const defaults = overrides.default ?? {};
    const override: MaterialOverride = { ...defaults, ...named };
    const materialTarget = target as THREE.Material & Partial<THREE.MeshStandardMaterial>;
    if (override.color !== undefined && materialTarget.color) materialTarget.color.setHex(override.color);
    if (override.emissive !== undefined && materialTarget.emissive) materialTarget.emissive.setHex(override.emissive);
    if (override.roughness !== undefined && 'roughness' in materialTarget) materialTarget.roughness = override.roughness;
    if (override.metalness !== undefined && 'metalness' in materialTarget) materialTarget.metalness = override.metalness;
    if (override.emissiveIntensity !== undefined && 'emissiveIntensity' in materialTarget) materialTarget.emissiveIntensity = override.emissiveIntensity;
    if (override.transmission !== undefined && 'transmission' in materialTarget) materialTarget.transmission = override.transmission;
    if (override.opacity !== undefined) materialTarget.opacity = override.opacity;
    if (override.transparent !== undefined) materialTarget.transparent = override.transparent;
    Object.entries(override.textures ?? {}).forEach(([slot, path]) => loadTexture(path, slot as keyof TextureMapSet, target));
  };
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(apply);
  });
}

/**
 * Load a local GLB/GLTF when a registry entry provides one. The caller passes
 * a procedural builder, so a missing or invalid custom file never blocks the
 * lab and never falls back to an external URL.
 */
export function createReplaceableEquipment(
  entry: EquipmentRegistryEntry,
  manager: THREE.LoadingManager,
  buildFallback: () => THREE.Object3D,
  onCustomModel?: (model: THREE.Object3D) => void,
): EquipmentAssetHandle {
  const root = new THREE.Group();
  root.name = entry.id;
  root.position.set(...entry.offset);
  root.rotation.set(...entry.rotation);
  root.scale.set(...entry.scale);
  root.userData.equipmentRegistryEntry = entry;
  root.userData.assetPivot = entry.pivot;
  root.userData.interactionPoints = entry.interactionPoints;
  root.userData.animationHooks = entry.animationHooks;

  const fallback = buildFallback();
  fallback.name = `${entry.id}-procedural-fallback`;
  root.add(fallback);

  if (!entry.model) return { root, fallback, usingCustomModel: false };

  const loader = new GLTFLoader(manager);
  loader.load(entry.model, (gltf) => {
    fallback.visible = false;
    const model = gltf.scene;
    model.name = `${entry.id}-custom-model`;
    applyMaterialOverrides(model, entry, manager);
    root.add(model);
    onCustomModel?.(model);
  }, undefined, () => {
    // Keep the deterministic procedural fallback visible when an optional
    // custom asset is not present yet.
    fallback.visible = true;
  });
  return { root, fallback, usingCustomModel: true };
}

export function addAnchorMarkers(
  parent: THREE.Object3D,
  entry: EquipmentRegistryEntry,
  scene: THREE.Scene,
  enabled: boolean,
) {
  if (!enabled) return;
  const markerGroup = new THREE.Group();
  markerGroup.name = `${entry.id}-anchors-debug`;
  Object.entries(entry.anchors).forEach(([name, [x, y, z]]) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfde68a, wireframe: true }),
    );
    marker.position.set(x, y, z);
    marker.userData.anchorName = name;
    markerGroup.add(marker);
  });
  parent.add(markerGroup);
  scene.userData.debugAnchorGroups ??= [];
  (scene.userData.debugAnchorGroups as THREE.Group[]).push(markerGroup);
}
