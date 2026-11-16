import * as THREE from 'three';
import type { EquipmentInteraction } from './room3Scene';
import { buildRoom3HonorRollPlaques } from './room3HonorRollPlaques';

export interface BoxCollider2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Room3DecorMaterials {
  wallMaroon: THREE.MeshStandardMaterial;
  creamPanel: THREE.MeshStandardMaterial;
  mahogany: THREE.MeshStandardMaterial;
  walnut: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
}

export interface Room3DecorResult {
  disposableTextures: THREE.Texture[];
  disposableMaterials: THREE.Material[];
  colliders: BoxCollider2D[];
  terraceLanternMats: THREE.MeshStandardMaterial[];
}

export type InteractRegistrar = (
  target: THREE.Object3D | THREE.Object3D[],
  interaction: EquipmentInteraction
) => void;

/**
 * Generates a subtle woven burgundy-maroon architectural plaster texture
 * so interior conservatory walls show tonal grain and depth rather than flat plastic.
 */
export function createWallPlasterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#3c121e';
    ctx.fillRect(0, 0, 512, 512);

    // Very faint architectural damask weave
    for (let x = 0; x < 512; x += 32) {
      ctx.fillStyle = x % 64 === 0 ? 'rgba(255, 220, 228, 0.014)' : 'rgba(12, 3, 6, 0.035)';
      ctx.fillRect(x, 0, 16, 512);
    }

    // Fine mineral plaster speckle for authentic wall surface variation
    for (let i = 0; i < 3600; i++) {
      const px = ((i * 73) % 512);
      const py = ((i * 197 + Math.floor(i / 7) * 13) % 512);
      const light = i % 3 === 0;
      ctx.fillStyle = light ? 'rgba(255, 232, 238, 0.025)' : 'rgba(14, 3, 6, 0.045)';
      ctx.fillRect(px, py, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds an articulated brass & tinted-glass banker's/task lamp to replace primitive cones.
 */
export function createBenchBankerLamp(
  stationColor: number,
  brassMat: THREE.Material
): { group: THREE.Group; bulbMaterial: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();

  // Weighted stepped brass base
  const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.092, 0.024, 24), brassMat);
  baseDisc.position.y = 0.012;
  baseDisc.castShadow = true;
  group.add(baseDisc);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 0.026, 18), brassMat);
  collar.position.y = 0.034;
  group.add(collar);

  // Curved brass gooseneck column
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.28, 14), brassMat);
  stem.position.set(0, 0.175, -0.02);
  stem.rotation.x = -0.14;
  stem.castShadow = true;
  group.add(stem);

  const topArm = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.011, 0.12, 12), brassMat);
  topArm.position.set(0, 0.325, -0.008);
  topArm.rotation.x = Math.PI / 2 - 0.32;
  group.add(topArm);

  // Classic cylindrical half-shell banker shade tilted toward benchtop
  const shadeGroup = new THREE.Group();
  shadeGroup.position.set(0, 0.34, 0.045);
  shadeGroup.rotation.x = 0.22;

  const shadeShell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.072, 0.21, 20, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({
      color: stationColor,
      emissive: stationColor,
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.08,
      side: THREE.DoubleSide,
    })
  );
  shadeShell.rotation.z = Math.PI / 2;
  shadeShell.rotation.x = -Math.PI / 2;
  shadeGroup.add(shadeShell);

  // Brass end caps on banker shade
  [-0.106, 0.106].forEach((capX) => {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.070, 0.012, 16, 1, false, 0, Math.PI), brassMat);
    cap.rotation.z = Math.PI / 2;
    cap.rotation.x = -Math.PI / 2;
    cap.position.x = capX;
    shadeGroup.add(cap);
  });

  // Glowing interior filament bulb (pulsed dynamically for active station)
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: stationColor,
    emissiveIntensity: 2.2,
    roughness: 0.15,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), bulbMaterial);
  bulb.scale.set(1.5, 0.85, 0.85);
  bulb.position.y = -0.012;
  shadeGroup.add(bulb);

  group.add(shadeGroup);
  return { group, bulbMaterial };
}

/**
 * Adds exterior observatory deck, stone balustrade, terrace lanterns, distant campus domes,
 * recessed cream wall paneling, perimeter laboratory cabinetry, lab stools, rolling carts,
 * floor cable raceways, and lush observatory planters around Room 3.
 */
export function buildRoom3ArchitectureDecor(
  scene: THREE.Scene,
  config: {
    roomWidth: number;
    roomDepth: number;
    roomHeight: number;
    backZ: number;
    sideX: number;
    doorX: number;
    doorWidth: number;
    stationsX: { circuits: number; optics: number; relativity: number };
    benchDepth: number;
  },
  materials: Room3DecorMaterials,
  descriptions: Record<string, string>,
  registerInteractable: InteractRegistrar
): Room3DecorResult {
  const disposableTextures: THREE.Texture[] = [];
  const disposableMaterials: THREE.Material[] = [];
  const colliders: BoxCollider2D[] = [];
  const terraceLanternMats: THREE.MeshStandardMaterial[] = [];

  const frontZ = -config.backZ;
  const wallInnerBack = config.backZ + 0.16;
  const wallInnerFront = frontZ - 0.16;
  const wallInnerWest = -config.sideX + 0.16;
  const wallInnerEast = config.sideX - 0.16;

  // Shared materials created locally
  const slateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.48, metalness: 0.35 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdbe4ee, roughness: 0.2, metalness: 0.9 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.82, metalness: 0.08 });
  const terraceFloorMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.88, metalness: 0.05 });
  const redSafetyMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.28, metalness: 0.35 });
  const yellowSafetyMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.38, metalness: 0.15 });
  const planterPotMat = new THREE.MeshStandardMaterial({ color: 0x6b3a2e, roughness: 0.72, metalness: 0.06 });
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x261812, roughness: 0.95 });
  const leafDarkMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.62, side: THREE.DoubleSide });
  const leafBrightMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.55, side: THREE.DoubleSide });
  const glassShelfMat = new THREE.MeshStandardMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.26,
    roughness: 0.08,
    metalness: 0.15,
    depthWrite: false,
  });
  const leatherPadMat = new THREE.MeshStandardMaterial({ color: 0x291519, roughness: 0.52, metalness: 0.08 });

  disposableMaterials.push(
    slateMat,
    chromeMat,
    stoneMat,
    terraceFloorMat,
    redSafetyMat,
    yellowSafetyMat,
    planterPotMat,
    soilMat,
    leafDarkMat,
    leafBrightMat,
    glassShelfMat,
    leatherPadMat
  );

  // =========================================================================
  // 1. Exterior Observatory Terrace, Balustrade, Lanterns & Distant Skyline
  //    (Eliminates pitch-black void outside East & West conservatory windows)
  // =========================================================================
  const extGroup = new THREE.Group();
  const terraceDepth = 3.4;

  // West, East, South exterior balcony slabs just outside the 0.32m walls
  const addTerraceDeck = (w: number, d: number, x: number, z: number) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, d), terraceFloorMat);
    slab.position.set(x, -0.14, z);
    extGroup.add(slab);
  };
  addTerraceDeck(terraceDepth, config.roomDepth + terraceDepth * 2, -config.sideX - terraceDepth / 2, 0);
  addTerraceDeck(terraceDepth, config.roomDepth + terraceDepth * 2, config.sideX + terraceDepth / 2, 0);
  addTerraceDeck(config.roomWidth, terraceDepth, 0, frontZ + terraceDepth / 2);
  addTerraceDeck(config.roomWidth, terraceDepth, 0, config.backZ - terraceDepth / 2);

  // Outer perimeter stone balustrade rails along West & East edges (visible at eye level through windows)
  [-config.sideX - terraceDepth + 0.18, config.sideX + terraceDepth - 0.18].forEach((bx) => {
    const coping = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.10, config.roomDepth + terraceDepth * 2 - 0.2), stoneMat);
    coping.position.set(bx, 1.02, 0);
    extGroup.add(coping);

    const lowerPlinth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, config.roomDepth + terraceDepth * 2 - 0.2), stoneMat);
    lowerPlinth.position.set(bx, 0.10, 0);
    extGroup.add(lowerPlinth);

    for (let bz = -8.5; bz <= 8.5; bz += 1.06) {
      const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.78, 10), stoneMat);
      baluster.position.set(bx, 0.60, bz);
      extGroup.add(baluster);
    }

    // Warm observatory walkway lanterns on balustrade piers between windows
    [-6.8, -2.25, 2.25, 6.8].forEach((lz) => {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.18, 0.42), stoneMat);
      pier.position.set(bx, 0.58, lz);
      extGroup.add(pier);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 0.56, 10), materials.brass);
      post.position.set(bx, 1.45, lz);
      extGroup.add(post);

      const lanternMat = new THREE.MeshStandardMaterial({
        color: 0xffedd5,
        emissive: 0xfbbf24,
        emissiveIntensity: 1.85,
        roughness: 0.2,
      });
      terraceLanternMats.push(lanternMat);
      disposableMaterials.push(lanternMat);

      const glassCage = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 1), lanternMat);
      glassCage.position.set(bx, 1.78, lz);
      extGroup.add(glassCage);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.09, 6), materials.brass);
      cap.position.set(bx, 1.90, lz);
      extGroup.add(cap);
    });
  });

  // Soft distant observatory campus silhouettes & midnight indigo horizon glow outside side windows
  const horizonGlowMat = new THREE.MeshBasicMaterial({
    color: 0x132242,
    transparent: true,
    opacity: 0.45,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  disposableMaterials.push(horizonGlowMat);
  const horizonBand = new THREE.Mesh(new THREE.CylinderGeometry(72, 72, 22, 48, 1, true), horizonGlowMat);
  horizonBand.position.y = 8;
  extGroup.add(horizonBand);

  const silhouetteMat = new THREE.MeshStandardMaterial({ color: 0x0a1224, roughness: 0.9, metalness: 0.1 });
  disposableMaterials.push(silhouetteMat);
  [
    { x: -34, z: -12, rx: 4.5, ry: 5.5, hasDome: true },
    { x: -42, z: 8, rx: 7.0, ry: 4.0, hasDome: false },
    { x: -36, z: 18, rx: 5.0, ry: 6.5, hasDome: false },
    { x: 34, z: -8, rx: 4.8, ry: 5.8, hasDome: true },
    { x: 40, z: 10, rx: 6.8, ry: 4.4, hasDome: false },
    { x: 35, z: -22, rx: 5.6, ry: 6.0, hasDome: false },
  ].forEach((b) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.rx, b.ry, b.rx * 1.4), silhouetteMat);
    body.position.set(b.x, b.ry / 2 - 1.5, b.z);
    extGroup.add(body);
    if (b.hasDome) {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(b.rx * 0.48, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        silhouetteMat
      );
      dome.position.set(b.x, b.ry - 1.5, b.z);
      extGroup.add(dome);
    }
  });

  scene.add(extGroup);

  // =========================================================================
  // 2. Molded Walnut & Brass Architectural Wall Wainscot Panels + Glass Vitrine Helper
  // =========================================================================
  const addMoldedWallBay = (w: number, h: number, x: number, y: number, z: number, rotY = 0) => {
    const panelGroup = new THREE.Group();
    panelGroup.position.set(x, y, z);
    panelGroup.rotation.y = rotY;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.025), materials.mahogany);
    panelGroup.add(frame);

    const brassInset = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.032), materials.brass);
    panelGroup.add(brassInset);

    const walnutInset = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.038), materials.walnut);
    walnutInset.receiveShadow = true;
    panelGroup.add(walnutInset);

    const centerRosette = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 16), materials.brass);
    centerRosette.rotation.x = Math.PI / 2;
    centerRosette.position.z = 0.022;
    panelGroup.add(centerRosette);

    scene.add(panelGroup);
  };

  // Helper building a 3D recessed display vitrine cabinet with real interior shelves & specimen props
  const addGlassVitrineCabinet = (w: number, totalH: number, depth: number, x: number, z: number, rotY = 0) => {
    const vitrine = new THREE.Group();
    vitrine.position.set(x, 0, z);
    vitrine.rotation.y = rotY;

    const lowerH = Math.min(0.88, totalH * 0.44);
    const upperH = totalH - lowerH;

    // Lower solid cupboard plinth + brass door pulls
    const lowerBase = new THREE.Mesh(new THREE.BoxGeometry(w, lowerH, depth), materials.mahogany);
    lowerBase.position.set(0, lowerH / 2, 0);
    lowerBase.castShadow = true;
    lowerBase.receiveShadow = true;
    vitrine.add(lowerBase);

    const counterLedge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.05, depth + 0.04), materials.brass);
    counterLedge.position.set(0, lowerH + 0.025, 0);
    vitrine.add(counterLedge);

    // Upper recessed shadowbox interior (open front behind thin glass pane)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, upperH, 0.04), leatherPadMat);
    backWall.position.set(0, lowerH + upperH / 2, -depth / 2 + 0.02);
    vitrine.add(backWall);

    [-w / 2 + 0.04, w / 2 - 0.04].forEach((sx) => {
      const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.06, upperH, depth), materials.mahogany);
      sidePanel.position.set(sx, lowerH + upperH / 2, 0);
      vitrine.add(sidePanel);
    });

    const topCap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.08, depth + 0.06), materials.mahogany);
    topCap.position.set(0, totalH + 0.02, 0);
    vitrine.add(topCap);
    const topBrass = new THREE.Mesh(new THREE.BoxGeometry(w + 0.10, 0.03, depth + 0.08), materials.brass);
    topBrass.position.set(0, totalH + 0.065, 0);
    vitrine.add(topBrass);

    // Interior shelf + scientific specimen artifacts (brass weights, optical prism & copper coil)
    const shelfY = lowerH + upperH * 0.48;
    const midShelf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.14, 0.03, depth - 0.08), materials.walnut);
    midShelf.position.set(0, shelfY, -0.02);
    vitrine.add(midShelf);

    const coilProp = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.028, 12, 24),
      new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.85, roughness: 0.25 })
    );
    coilProp.position.set(-w * 0.24, shelfY + 0.15, -0.02);
    vitrine.add(coilProp);

    const prismProp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.22, 6), materials.brass);
    prismProp.position.set(w * 0.24, lowerH + 0.16, -0.02);
    vitrine.add(prismProp);

    const globeProp = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 16, 14),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65, roughness: 0.15 })
    );
    globeProp.position.set(w * 0.22, shelfY + 0.13, -0.02);
    vitrine.add(globeProp);

    // Thin transparent glass door + slender center brass mullion
    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.14, upperH - 0.08), glassShelfMat);
    frontGlass.position.set(0, lowerH + upperH / 2, depth / 2 - 0.01);
    vitrine.add(frontGlass);
    const centerMullion = new THREE.Mesh(new THREE.BoxGeometry(0.028, upperH - 0.06, 0.025), materials.brass);
    centerMullion.position.set(0, lowerH + upperH / 2, depth / 2);
    vitrine.add(centerMullion);

    scene.add(vitrine);
  };

  // North wall molded walnut & brass trim bays above panels + North-West glass physics vitrine
  addGlassVitrineCabinet(1.85, 2.55, 0.46, -8.85, wallInnerBack + 0.24, 0);
  colliders.push({ minX: -9.85, maxX: -7.85, minZ: wallInnerBack - 0.1, maxZ: wallInnerBack + 0.56 });
  addMoldedWallBay(1.85, 0.72, -3.00, 3.24, wallInnerBack + 0.015, 0);
  addMoldedWallBay(1.85, 0.72, 3.00, 3.24, wallInnerBack + 0.015, 0);

  // South wall engraved Room 4-style hardwood & 24K gold Class Roll of Honor plaques (flanking Whiteboard)
  buildRoom3HonorRollPlaques(
    scene,
    frontZ,
    materials.mahogany,
    materials.brass,
    registerInteractable,
    disposableTextures,
    disposableMaterials
  );

  // Lower Wainscot Molding Trim Frames on South Wall
  [-8.0, -5.0, -2.0, 2.0, 5.0, 8.0].forEach((wx) => {
    const molding = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.68, 0.03), materials.brass);
    molding.position.set(wx, 0.62, wallInnerFront - 0.04);
    scene.add(molding);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.59, 0.036), materials.mahogany);
    inner.position.set(wx, 0.62, wallInnerFront - 0.042);
    scene.add(inner);
  });

  // =========================================================================
  // 3. South Wall Furniture Casework: Center Credenza, Library Bookcase & Prep Counter
  //    (Fills South wall below clerestory windows — respects collision z > frontZ - 1.6)
  // =========================================================================
  // A. Center South Credenza under Master Whiteboard (x = 0, z = +6.92)
  const credenza = new THREE.Group();
  credenza.position.set(0, 0.45, frontZ - 0.48);
  credenza.rotation.y = Math.PI;

  const credBody = new THREE.Mesh(new THREE.BoxGeometry(4.20, 0.88, 0.58), materials.mahogany);
  credBody.castShadow = true;
  credBody.receiveShadow = true;
  credenza.add(credBody);

  const credTop = new THREE.Mesh(new THREE.BoxGeometry(4.28, 0.06, 0.64), materials.walnut);
  credTop.position.set(0, 0.46, 0);
  credTop.receiveShadow = true;
  credenza.add(credTop);

  // Brass cabinet handles across 4 bays
  [-1.55, -0.52, 0.52, 1.55].forEach((hx) => {
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.72, 0.02), materials.brass);
    bezel.position.set(hx, 0.02, 0.292);
    credenza.add(bezel);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.66, 0.026), materials.walnut);
    panel.position.set(hx, 0.02, 0.294);
    credenza.add(panel);
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.035), materials.brass);
    pull.position.set(hx, 0.14, 0.312);
    credenza.add(pull);
  });

  // Credenza desktop props: stacked leather physics treatises & brass demonstration gyroscope
  const bookColors = [0x7c2d12, 0x1e3a8a, 0x14532d];
  bookColors.forEach((bc, idx) => {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.30 - idx * 0.02, 0.042, 0.22 - idx * 0.01),
      new THREE.MeshStandardMaterial({ color: bc, roughness: 0.65 })
    );
    book.position.set(-1.35, 0.51 + idx * 0.043, 0.02);
    book.rotation.y = (idx - 1) * 0.12;
    credenza.add(book);
  });

  const gyroBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.03, 18), materials.brass);
  gyroBase.position.set(1.35, 0.505, 0.0);
  credenza.add(gyroBase);
  const gyroRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.011, 12, 28), materials.brass);
  gyroRing1.position.set(1.35, 0.64, 0.0);
  credenza.add(gyroRing1);
  const gyroRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.010, 12, 28), chromeMat);
  gyroRing2.position.set(1.35, 0.64, 0.0);
  gyroRing2.rotation.y = Math.PI / 3;
  gyroRing2.rotation.x = 0.35;
  credenza.add(gyroRing2);

  scene.add(credenza);

  // B. West-South Low Mahogany Physics Library & Optical Archive Credenza (x = -6.15, leaves upper plaque wall open)
  const libCab = new THREE.Group();
  libCab.position.set(-6.15, 0, frontZ - 0.50);
  libCab.rotation.y = Math.PI;

  const libLower = new THREE.Mesh(new THREE.BoxGeometry(3.20, 0.90, 0.62), materials.mahogany);
  libLower.position.set(0, 0.45, 0);
  libLower.castShadow = true;
  libLower.receiveShadow = true;
  libCab.add(libLower);

  const libShelfCounter = new THREE.Mesh(new THREE.BoxGeometry(3.28, 0.06, 0.68), materials.walnut);
  libShelfCounter.position.set(0, 0.93, 0);
  libShelfCounter.receiveShadow = true;
  libCab.add(libShelfCounter);

  // Two open front library bays inside credenza holding textbook volumes
  [-0.78, 0.78].forEach((bayX, shelfIdx) => {
    const recess = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.52, 0.04), leatherPadMat);
    recess.position.set(bayX, 0.46, 0.305);
    libCab.add(recess);
    const frameTrim = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.58, 0.025), materials.brass);
    frameTrim.position.set(bayX, 0.46, 0.295);
    libCab.add(frameTrim);

    for (let b = 0; b < 9; b++) {
      const hBook = 0.26 + ((b * 7 + shelfIdx * 3) % 5) * 0.025;
      const spineCol = [0x7f1d1d, 0x1e3a8a, 0x064e3b, 0x78350f, 0x312e81][(b + shelfIdx) % 5];
      const vol = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, hBook, 0.16),
        new THREE.MeshStandardMaterial({ color: spineCol, roughness: 0.65 })
      );
      vol.position.set(bayX - 0.50 + b * 0.12, 0.22 + hBook / 2, 0.30);
      libCab.add(vol);
    }
  });

  // Countertop archival prism & copper Helmholtz coil display (max y = 1.20m, well below 1.45m plaque!)
  const archPrism = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.24, 6), glassShelfMat);
  archPrism.position.set(-0.78, 1.08, 0.02);
  libCab.add(archPrism);
  const archCoil = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.024, 12, 24),
    new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.85, roughness: 0.25 })
  );
  archCoil.position.set(0.78, 1.09, 0.02);
  libCab.add(archCoil);

  scene.add(libCab);
  registerInteractable([libShelfCounter, archPrism, archCoil], {
    id: 'lab-cabinet',
    stationId: 'optics',
    category: 'LABORATORY ARCHIVE',
    name: 'Physics Archive Library & Optics Credenza',
    description: descriptions['lab-cabinet'],
    action: 'Inspect archival prisms & physics treatises',
    readout: 'Classical Optics & Electromagnetism volumes · spare glass prisms',
  });

  // C. East-South Calibration & Vacuum Prep Counter (x = +6.15, z = +6.90, clear below upper plaque)
  const eastCounter = new THREE.Group();
  eastCounter.position.set(6.15, 0, frontZ - 0.50);
  eastCounter.rotation.y = Math.PI;

  const ecBody = new THREE.Mesh(new THREE.BoxGeometry(3.20, 0.90, 0.68), materials.mahogany);
  ecBody.position.set(0, 0.45, 0);
  ecBody.castShadow = true;
  eastCounter.add(ecBody);

  const ecTop = new THREE.Mesh(new THREE.BoxGeometry(3.28, 0.06, 0.74), slateMat);
  ecTop.position.set(0, 0.93, 0);
  eastCounter.add(ecTop);

  [-0.95, 0, 0.95].forEach((px) => {
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.025, 0.03), materials.brass);
    pull.position.set(px, 0.68, 0.355);
    eastCounter.add(pull);
  });

  // Aluminum Metrology Flight Case & Precision Bins resting directly on the countertop (zero wall overlap)
  const flightCase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.20, 0.28), chromeMat);
  flightCase.position.set(0.02, 1.06, 0.02);
  eastCounter.add(flightCase);
  const compBin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), slateMat);
  compBin.position.set(1.22, 1.04, 0.02);
  eastCounter.add(compBin);

  // Vacuum Bell Jar & Copper Coil Apparatus on Countertop
  const bellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.04, 24), materials.brass);
  bellBase.position.set(-0.75, 0.98, 0.04);
  eastCounter.add(bellBase);
  const bellJar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.34, 24), glassShelfMat);
  bellJar.position.set(-0.75, 1.17, 0.04);
  eastCounter.add(bellJar);
  const coilCore = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.022, 12, 24),
    new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.85, roughness: 0.25 })
  );
  coilCore.position.set(-0.75, 1.13, 0.04);
  eastCounter.add(coilCore);

  // Reference Flask Rack with blue & amber dielectric standards
  const beakerBlue = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, transparent: true, opacity: 0.78, roughness: 0.12 })
  );
  beakerBlue.position.set(0.68, 1.04, 0.05);
  eastCounter.add(beakerBlue);
  const beakerAmber = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.14, 16),
    new THREE.MeshStandardMaterial({ color: 0xd97706, transparent: true, opacity: 0.78, roughness: 0.12 })
  );
  beakerAmber.position.set(0.88, 1.03, 0.05);
  eastCounter.add(beakerAmber);

  scene.add(eastCounter);
  registerInteractable([ecTop, bellJar, flightCase], {
    id: 'lab-cabinet',
    stationId: 'circuits',
    category: 'CALIBRATION BENCH',
    name: 'Calibration Prep Counter & Vacuum Jar',
    description: descriptions['lab-cabinet'],
    action: 'Inspect calibration standards & vacuum coil rig',
    readout: 'Calibration flight cases · Leyden dielectric vessels · vacuum jar',
  });

  // =========================================================================
  // 4. West & East Side Wall Stations (Matching conservatory wood & brass trim)
  // =========================================================================
  // West Wall Pier (z = -2.25): Mahogany & Glass Specimen Vitrine Case (keeps sconce at y=2.40 clear)
  addGlassVitrineCabinet(1.50, 1.72, 0.42, wallInnerWest + 0.22, -2.25, Math.PI / 2);
  colliders.push({ minX: wallInnerWest - 0.1, maxX: wallInnerWest + 0.48, minZ: -3.05, maxZ: -1.45 });

  // West Wall Pier (z = +2.25): ANSI Emergency Eyewash & Laser Goggles Safety Station
  const eyewashStation = new THREE.Group();
  eyewashStation.position.set(wallInnerWest + 0.16, 0, 2.25);
  eyewashStation.rotation.y = Math.PI / 2;

  const ewBackplate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.25, 0.03), materials.mahogany);
  ewBackplate.position.set(0, 1.22, -0.02);
  eyewashStation.add(ewBackplate);
  const ewSign = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.24, 0.04), yellowSafetyMat);
  ewSign.position.set(0, 1.66, -0.01);
  eyewashStation.add(ewSign);
  const ewPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.35, 12), materials.brass);
  ewPipe.position.set(0, 0.68, 0.08);
  eyewashStation.add(ewPipe);
  const ewBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.12, 16), chromeMat);
  ewBowl.position.set(0, 0.94, 0.22);
  eyewashStation.add(ewBowl);
  const ewHazMat = new THREE.Mesh(new THREE.PlaneGeometry(0.90, 0.56), yellowSafetyMat);
  ewHazMat.rotation.x = -Math.PI / 2;
  ewHazMat.position.set(0, 0.004, 0.30);
  eyewashStation.add(ewHazMat);

  scene.add(eyewashStation);
  registerInteractable([ewBowl, ewSign], {
    id: 'lab-eyewash',
    stationId: 'optics',
    category: 'SAFETY STATION',
    name: 'Emergency Eyewash & Laser Safety Station',
    description: descriptions['lab-eyewash'],
    action: 'Inspect emergency eyewash & OD6+ laser safety goggles',
    readout: 'ANSI Z358.1 Eye Wash · Class 3R/4 Laser Safety Eyewear Cabinet',
  });
  colliders.push({ minX: wallInnerWest - 0.1, maxX: wallInnerWest + 0.48, minZ: 1.75, maxZ: 2.75 });

  // East Wall Pier (z = -2.25): Coaxial Instrument Rack & Field Multimeter Storage
  const eastRack = new THREE.Group();
  eastRack.position.set(wallInnerEast - 0.22, 0, -2.25);
  eastRack.rotation.y = -Math.PI / 2;
  const erBody = new THREE.Mesh(new THREE.BoxGeometry(1.50, 1.72, 0.42), slateMat);
  erBody.position.set(0, 0.86, 0);
  eastRack.add(erBody);
  const erTrim = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.04, 0.44), materials.brass);
  erTrim.position.set(0, 1.74, 0);
  eastRack.add(erTrim);
  [0.52, 0.98, 1.38].forEach((ry) => {
    const face = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.22, 0.025), materials.walnut);
    face.position.set(0, ry, 0.215);
    eastRack.add(face);
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    led.position.set(0.56, ry, 0.232);
    eastRack.add(led);
  });
  scene.add(eastRack);
  colliders.push({ minX: wallInnerEast - 0.48, maxX: wallInnerEast + 0.1, minZ: -3.05, maxZ: -1.45 });

  // East Wall Pier (z = +2.25): High-Voltage Breaker Panel & Class ABC Fire Extinguisher
  const eastSafety = new THREE.Group();
  eastSafety.position.set(wallInnerEast - 0.16, 0, 2.25);
  eastSafety.rotation.y = -Math.PI / 2;

  const breakerBox = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.15, 0.12), slateMat);
  breakerBox.position.set(-0.34, 1.48, 0.02);
  eastSafety.add(breakerBox);
  const breakerTrim = new THREE.Mesh(new THREE.BoxGeometry(0.80, 1.19, 0.04), materials.brass);
  breakerTrim.position.set(-0.34, 1.48, 0.01);
  eastSafety.add(breakerTrim);

  [-0.46, -0.22].forEach((cx) => {
    const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.85, 10), chromeMat);
    conduit.position.set(cx, 2.95, 0.02);
    eastSafety.add(conduit);
  });

  // Mounted Class ABC Fire Extinguisher
  const extCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.48, 18), redSafetyMat);
  extCyl.position.set(0.42, 1.05, 0.12);
  eastSafety.add(extCyl);
  const extDome = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), redSafetyMat);
  extDome.position.set(0.42, 1.29, 0.12);
  eastSafety.add(extDome);
  const extNeck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.05), chromeMat);
  extNeck.position.set(0.42, 1.40, 0.12);
  eastSafety.add(extNeck);

  scene.add(eastSafety);
  registerInteractable([breakerBox, extCyl], {
    id: 'lab-electrical-panel',
    stationId: 'circuits',
    category: 'FACILITY SAFETY & POWER',
    name: '3-Phase Isolation Breaker & Fire Extinguisher',
    description: descriptions['lab-electrical-panel'],
    action: 'Inspect laboratory main breaker interlock & Class ABC extinguisher',
    readout: '240V/120V Main Lab Feed · GFCI Protected · Class ABC Extinguisher',
  });
  colliders.push({ minX: wallInnerEast - 0.42, maxX: wallInnerEast + 0.1, minZ: 1.75, maxZ: 2.75 });

  // =========================================================================
  // 5. Lush Conservatory Planters (Clear of North Exit Door at x = 8.65!)
  // =========================================================================
  const addPlanter = (px: number, pz: number) => {
    const planter = new THREE.Group();
    planter.position.set(px, 0, pz);

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.54, 18), planterPotMat);
    pot.position.y = 0.27;
    pot.castShadow = true;
    planter.add(pot);

    const brassBand = new THREE.Mesh(new THREE.CylinderGeometry(0.328, 0.322, 0.05, 18), materials.brass);
    brassBand.position.y = 0.49;
    planter.add(brassBand);

    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.04, 14), soilMat);
    soil.position.y = 0.51;
    planter.add(soil);

    for (let f = 0; f < 10; f++) {
      const ang = (f * Math.PI * 2) / 10;
      const tilt = 0.36 + (f % 3) * 0.16;
      const frondLen = 0.52 + (f % 2) * 0.16;
      const frond = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, frondLen, 5),
        f % 2 === 0 ? leafDarkMat : leafBrightMat
      );
      frond.scale.set(0.75, 1, 0.22);
      frond.position.set(Math.cos(ang) * 0.14, 0.68 + (f % 3) * 0.08, Math.sin(ang) * 0.14);
      frond.rotation.order = 'YXZ';
      frond.rotation.y = -ang + Math.PI / 2;
      frond.rotation.x = tilt;
      planter.add(frond);
    }

    scene.add(planter);
    colliders.push({ minX: px - 0.38, maxX: px + 0.38, minZ: pz - 0.38, maxZ: pz + 0.38 });
  };

  addPlanter(-9.55, -6.15);
  addPlanter(-9.55, 6.15);
  addPlanter(9.55, 6.15);
  addPlanter(6.45, -6.40); // safely left of North double door jamb (x=7.25)

  // =========================================================================
  // 6. Lab Stools (Rear Bench Knee-Wells), Rolling Carts & Floor Cable Raceways
  // =========================================================================
  const addLabStool = (sx: number, sz: number) => {
    const stool = new THREE.Group();
    stool.position.set(sx, 0, sz);

    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.055, 22), leatherPadMat);
    seat.position.y = 0.58;
    seat.castShadow = true;
    stool.add(seat);

    const seatRim = new THREE.Mesh(new THREE.CylinderGeometry(0.198, 0.198, 0.022, 22), materials.brass);
    seatRim.position.y = 0.555;
    stool.add(seatRim);

    const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.010, 8, 22), materials.brass);
    footRing.rotation.x = Math.PI / 2;
    footRing.position.y = 0.20;
    stool.add(footRing);

    for (let l = 0; l < 4; l++) {
      const ang = (l * Math.PI) / 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.56, 8), slateMat);
      leg.position.set(Math.cos(ang) * 0.14, 0.28, Math.sin(ang) * 0.14);
      leg.rotation.z = Math.cos(ang) * 0.10;
      leg.rotation.x = -Math.sin(ang) * 0.10;
      stool.add(leg);
    }

    scene.add(stool);
    colliders.push({ minX: sx - 0.25, maxX: sx + 0.25, minZ: sz - 0.25, maxZ: sz + 0.25 });
  };

  // Place 2 tucked lab stools on the North rear edge of each bench (leaves z > 0 closeup & approach 100% open)
  [config.stationsX.circuits, config.stationsX.optics, config.stationsX.relativity].forEach((bx) => {
    addLabStool(bx - 0.72, -1.04);
    addLabStool(bx + 0.72, -1.04);
  });

  // Two Rolling Walnut & Brass Apparatus Carts in the back aisle
  const addUtilityCart = (cx: number, cz: number) => {
    const cart = new THREE.Group();
    cart.position.set(cx, 0, cz);

    [0.14, 0.48, 0.80].forEach((ty) => {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.036, 0.50), materials.walnut);
      tray.position.y = ty;
      tray.castShadow = true;
      cart.add(tray);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.015, 0.52), materials.brass);
      rail.position.y = ty + 0.025;
      cart.add(rail);
    });

    [
      [-0.40, -0.22],
      [0.40, -0.22],
      [-0.40, 0.22],
      [0.40, 0.22],
    ].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.78, 10), materials.brass);
      post.position.set(px, 0.45, pz);
      cart.add(post);

      const caster = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.024, 12), slateMat);
      caster.rotation.z = Math.PI / 2;
      caster.position.set(px, 0.035, pz);
      cart.add(caster);
    });

    // Small field case & calibration logbook resting on top tray
    const cartCase = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.10, 0.24), slateMat);
    cartCase.position.set(-0.18, 0.87, 0);
    cart.add(cartCase);
    const binder = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.035, 0.30),
      new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.6 })
    );
    binder.position.set(0.20, 0.835, 0.02);
    binder.rotation.y = 0.22;
    cart.add(binder);

    scene.add(cart);
    colliders.push({ minX: cx - 0.52, maxX: cx + 0.52, minZ: cz - 0.34, maxZ: cz + 0.34 });
  };

  addUtilityCart(-3.0, -3.7);
  addUtilityCart(3.0, -3.7);

  // Brass & Slate Floor Conduit Raceway linking all three benches back to the East Breaker Panel
  const mainRacewayZ = -0.94;
  const racewaySpan = 16.5;
  const racewayCenterX = 2.25;
  const racewayBase = new THREE.Mesh(new THREE.BoxGeometry(racewaySpan, 0.012, 0.14), slateMat);
  racewayBase.position.set(racewayCenterX, 0.006, mainRacewayZ);
  scene.add(racewayBase);
  const racewayTrim = new THREE.Mesh(new THREE.BoxGeometry(racewaySpan, 0.015, 0.045), materials.brass);
  racewayTrim.position.set(racewayCenterX, 0.008, mainRacewayZ);
  scene.add(racewayTrim);

  // Branch feeder spur from raceway to East Breaker Station (z = -0.94 -> +2.25 along x = 10.25)
  const eastSpur = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 3.22), materials.brass);
  eastSpur.position.set(wallInnerEast - 0.36, 0.006, 0.65);
  scene.add(eastSpur);

  return {
    disposableTextures,
    disposableMaterials,
    colliders,
    terraceLanternMats,
  };
}

export function isCollidingWithDecor(x: number, z: number, colliders: BoxCollider2D[], pad = 0.26): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (x >= c.minX - pad && x <= c.maxX + pad && z >= c.minZ - pad && z <= c.maxZ + pad) {
      return true;
    }
  }
  return false;
}
