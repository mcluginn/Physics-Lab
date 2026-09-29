'use client';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CharacterController, type CharacterType } from './characterController';
import type { AstroActivityId } from './astroModel';

export type AstroInteraction = {
  id: string;
  activityId: AstroActivityId | 'door' | 'guide';
  category: string;
  name: string;
  action: string;
  description: string;
};

export type AstroSceneApi = {
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
  teleportTo: (activityId: AstroActivityId) => void;
};

export type AstroSceneCallbacks = {
  onInteractionChange?: (interaction: AstroInteraction | null) => void;
  onActivityInteract?: (activityId: AstroActivityId | 'door' | 'guide') => void;
  onFootstep?: () => void;
  onPointerLockChange?: (locked: boolean) => void;
};

export function createAstroScene(
  container: HTMLDivElement,
  callbacks: AstroSceneCallbacks = {}
): AstroSceneApi {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d1a);
  // Clear linear fog so room interior is bright and crisp, while distant space fades softly
  scene.fog = new THREE.Fog(0x0a1326, 25, 75);

  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // --- Lighting Architecture ---
  // Ambient illumination: lifted to soft architectural indigo
  const ambientLight = new THREE.AmbientLight(0x283b5e, 1.85);
  scene.add(ambientLight);

  // Balanced sky and floor bounce light (celestial blue overhead + rich warm wood floor reflection)
  const hemiLight = new THREE.HemisphereLight(0xc2dbff, 0x483222, 2.2);
  scene.add(hemiLight);

  // Cool celestial starlight illumination streaming in through northern observatory glass
  const celestialMoonlight = new THREE.DirectionalLight(0x7dd3fc, 2.6);
  celestialMoonlight.position.set(0, 10, -18);
  celestialMoonlight.castShadow = true;
  celestialMoonlight.shadow.mapSize.width = 2048;
  celestialMoonlight.shadow.mapSize.height = 2048;
  celestialMoonlight.shadow.camera.near = 0.5;
  celestialMoonlight.shadow.camera.far = 35;
  celestialMoonlight.shadow.camera.left = -12;
  celestialMoonlight.shadow.camera.right = 12;
  celestialMoonlight.shadow.camera.top = 12;
  celestialMoonlight.shadow.camera.bottom = -12;
  celestialMoonlight.shadow.bias = -0.0008;
  scene.add(celestialMoonlight);

  // Warm central exhibition chandelier/pinspot over the Solar System table
  const solarSpot = new THREE.SpotLight(0xfff5dd, 5.2, 16, Math.PI / 3.2, 0.4, 1.2);
  solarSpot.position.set(0, 4.6, -1.5);
  solarSpot.target.position.set(0, 0.9, -1.5);
  solarSpot.castShadow = true;
  scene.add(solarSpot);
  scene.add(solarSpot.target);

  // Warm amber spot over society info desk
  const infoSpot = new THREE.SpotLight(0xffeed6, 3.4, 9, Math.PI / 4, 0.5, 1.2);
  infoSpot.position.set(5.5, 4.4, 3.5);
  infoSpot.target.position.set(5.5, 0, 3.5);
  scene.add(infoSpot);
  scene.add(infoSpot.target);

  // Spot over telescope observing station
  const telescopeSpot = new THREE.SpotLight(0xa5f3fc, 3.8, 10, Math.PI / 4, 0.4, 1.3);
  telescopeSpot.position.set(-4.5, 4.4, -6.5);
  telescopeSpot.target.position.set(-4.5, 0.8, -8.2);
  scene.add(telescopeSpot);
  scene.add(telescopeSpot.target);

  // Architectural entrance spotlight directly highlighting the south double doors and exit archway
  const entranceSpot = new THREE.SpotLight(0xffedd5, 4.8, 12, Math.PI / 3.4, 0.35, 1.1);
  entranceSpot.position.set(0, 4.5, 3.8);
  entranceSpot.target.position.set(0, 1.6, 5.85);
  entranceSpot.castShadow = true;
  scene.add(entranceSpot);
  scene.add(entranceSpot.target);

  // Warm glowing hallway backlight behind the doors
  const corridorBacklight = new THREE.PointLight(0xffe6c8, 3.5, 7.5, 1.2);
  corridorBacklight.position.set(0, 1.8, 6.3);
  scene.add(corridorBacklight);

  // Recessed ceiling downlight grid fixtures (6 warm architectural downlights)
  const ceilingLightPositions: [number, number, number][] = [
    [-5.2, 4.65, 2.2],
    [5.2, 4.65, 2.2],
    [-5.2, 4.65, -2.8],
    [5.2, 4.65, -2.8],
    [-5.2, 4.65, -7.0],
    [5.2, 4.65, -7.0],
  ];

  ceilingLightPositions.forEach(([lx, ly, lz]) => {
    // Recessed ceiling bezel fixture
    const fixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.8 })
    );
    fixture.position.set(lx, ly, lz);
    scene.add(fixture);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.02, 24),
      new THREE.MeshStandardMaterial({ color: 0xfffbeb, emissive: 0xffecd1, emissiveIntensity: 1.4 })
    );
    lens.position.set(lx, ly - 0.03, lz);
    scene.add(lens);

    const downSpot = new THREE.SpotLight(0xffeed6, 2.4, 9.5, Math.PI / 3.6, 0.45, 1.3);
    downSpot.position.set(lx, ly - 0.05, lz);
    downSpot.target.position.set(lx, 0, lz);
    scene.add(downSpot);
    scene.add(downSpot.target);
  });

  // --- Texture & Material Helpers ---
  const createWoodTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1c0e08';
    ctx.fillRect(0, 0, 512, 512);

    // Fine wood grain lines
    for (let i = 0; i < 600; i++) {
      const y = Math.random() * 512;
      ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(45, 22, 12, 0.4)' : 'rgba(8, 4, 2, 0.5)';
      ctx.lineWidth = Math.random() * 2 + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y + (Math.random() - 0.5) * 8);
      ctx.stroke();
    }
    // Floor plank seams
    for (let p = 0; p <= 512; p += 64) {
      ctx.strokeStyle = 'rgba(5, 2, 1, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(512, p);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 7);
    return tex;
  };

  const woodTexture = createWoodTexture();
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: woodTexture,
    roughness: 0.38,
    metalness: 0.12,
  });

  const wallNavyMaterial = new THREE.MeshStandardMaterial({
    color: 0x142239,
    roughness: 0.72,
    metalness: 0.12,
  });

  const acousticSlatMaterial = new THREE.MeshStandardMaterial({
    color: 0x2e190e,
    roughness: 0.52,
    metalness: 0.18,
  });

  const brassTrimMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.22,
    metalness: 0.92,
  });

  const mahoganyDeskMaterial = new THREE.MeshStandardMaterial({
    color: 0x34190c,
    roughness: 0.32,
    metalness: 0.16,
  });

  // --- Room Geometry (18m wide x 16m deep x 4.8m high) ---
  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 16), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Inlaid Brass Compass Rose Medallion (Center floor under solar system)
  const medallionGroup = new THREE.Group();
  medallionGroup.position.set(0, 0.002, -1.5);
  medallionGroup.rotation.x = -Math.PI / 2;

  const outerBrassRing = new THREE.Mesh(
    new THREE.RingGeometry(3.2, 3.28, 48),
    brassTrimMaterial
  );
  medallionGroup.add(outerBrassRing);

  const innerBrassRing = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.15, 48),
    brassTrimMaterial
  );
  medallionGroup.add(innerBrassRing);

  // 8-Pointed Celestial Star Inlay
  for (let r = 0; r < 8; r++) {
    const angle = (r * Math.PI) / 4;
    const starRay = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 1.05), brassTrimMaterial);
    starRay.position.set(Math.cos(angle) * 2.65, Math.sin(angle) * 2.65, 0);
    starRay.rotation.z = angle + Math.PI / 2;
    medallionGroup.add(starRay);
  }
  scene.add(medallionGroup);

  // Architectural Coffered Ceiling
  const ceilingGroup = new THREE.Group();
  scene.add(ceilingGroup);

  const ceilingBase = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 16),
    new THREE.MeshStandardMaterial({ color: 0x131a2b, roughness: 0.82, metalness: 0.1 })
  );
  ceilingBase.rotation.x = Math.PI / 2;
  ceilingBase.position.set(0, 4.8, -2);
  ceilingGroup.add(ceilingBase);

  // Ceiling coffer longitudinal beams (along Z)
  [-6, -2, 2, 6].forEach((bx) => {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.26, 16),
      mahoganyDeskMaterial
    );
    beam.position.set(bx, 4.67, -2);
    ceilingGroup.add(beam);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.04, 16),
      brassTrimMaterial
    );
    trim.position.set(bx, 4.52, -2);
    ceilingGroup.add(trim);
  });

  // Ceiling coffer cross beams (along X)
  [-8, -4, 0, 4].forEach((bz) => {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.26, 0.24),
      mahoganyDeskMaterial
    );
    beam.position.set(0, 4.67, bz);
    ceilingGroup.add(beam);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.04, 0.28),
      brassTrimMaterial
    );
    trim.position.set(0, 4.52, bz);
    ceilingGroup.add(trim);
  });

  // South Wall with central doorway opening
  const southWallL = new THREE.Mesh(new THREE.BoxGeometry(7.6, 4.8, 0.3), wallNavyMaterial);
  southWallL.position.set(-5.2, 2.4, 6);
  scene.add(southWallL);

  const southWallR = new THREE.Mesh(new THREE.BoxGeometry(7.6, 4.8, 0.3), wallNavyMaterial);
  southWallR.position.set(5.2, 2.4, 6);
  scene.add(southWallR);

  const southWallTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.3, 0.3), wallNavyMaterial);
  southWallTop.position.set(0, 4.15, 6);
  scene.add(southWallTop);

  // Lower mahogany wainscoting paneling along south wall
  const southWainscotL = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.15, 0.34), mahoganyDeskMaterial);
  southWainscotL.position.set(-5.2, 0.575, 5.98);
  scene.add(southWainscotL);

  const southWainscotR = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.15, 0.34), mahoganyDeskMaterial);
  southWainscotR.position.set(5.2, 0.575, 5.98);
  scene.add(southWainscotR);

  // Brass chair rail molding along south wall
  const southChairRailL = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.06, 0.36), brassTrimMaterial);
  southChairRailL.position.set(-5.2, 1.15, 5.98);
  scene.add(southChairRailL);

  const southChairRailR = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.06, 0.36), brassTrimMaterial);
  southChairRailR.position.set(5.2, 1.15, 5.98);
  scene.add(southChairRailR);

  // East Wall & West Wall
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.8, 16), wallNavyMaterial);
  eastWall.position.set(9, 2.4, -2);
  scene.add(eastWall);

  const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.8, 16), wallNavyMaterial);
  westWall.position.set(-9, 2.4, -2);
  scene.add(westWall);

  // Mahogany wainscoting along East & West walls
  const eastWainscot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.15, 16), mahoganyDeskMaterial);
  eastWainscot.position.set(8.98, 0.575, -2);
  scene.add(eastWainscot);

  const westWainscot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.15, 16), mahoganyDeskMaterial);
  westWainscot.position.set(-8.98, 0.575, -2);
  scene.add(westWainscot);

  const eastChairRail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 16), brassTrimMaterial);
  eastChairRail.position.set(8.98, 1.15, -2);
  scene.add(eastChairRail);

  const westChairRail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 16), brassTrimMaterial);
  westChairRail.position.set(-8.98, 1.15, -2);
  scene.add(westChairRail);

  // Decorative Wall Sconces with warm illumination along side walls
  const sconceZPositions = [-6.2, -1.2, 3.6];
  [-8.82, 8.82].forEach((sx) => {
    sconceZPositions.forEach((sz) => {
      const sconceGroup = new THREE.Group();
      sconceGroup.position.set(sx, 2.4, sz);
      scene.add(sconceGroup);

      const sconceBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.42, 16),
        brassTrimMaterial
      );
      sconceGroup.add(sconceBody);

      [-0.24, 0.24].forEach((capsY) => {
        const lightCap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.08, 16),
          new THREE.MeshStandardMaterial({ color: 0xffedd5, emissive: 0xffe4b5, emissiveIntensity: 1.6 })
        );
        lightCap.position.y = capsY;
        sconceGroup.add(lightCap);
      });

      const sconcePoint = new THREE.PointLight(0xffe6c8, 1.2, 5.0, 1.3);
      sconcePoint.position.set(sx > 0 ? -0.15 : 0.15, 0, 0);
      sconceGroup.add(sconcePoint);
    });
  });

  // Decorative Wall Slats on East and West walls
  for (let z = -9; z <= 5; z += 1.2) {
    const slatW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.6, 0.4), acousticSlatMaterial);
    slatW.position.set(-8.85, 2.3, z);
    scene.add(slatW);

    const slatE = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.6, 0.4), acousticSlatMaterial);
    slatE.position.set(8.85, 2.3, z);
    scene.add(slatE);
  }

  // North Observatory Wall: Curved glass framing looking into celestial starfield
  const northWallFrameL = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.8, 0.3), wallNavyMaterial);
  northWallFrameL.position.set(-7.25, 2.4, -10);
  scene.add(northWallFrameL);

  const northWallFrameR = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.8, 0.3), wallNavyMaterial);
  northWallFrameR.position.set(7.25, 2.4, -10);
  scene.add(northWallFrameR);

  const northWallHeader = new THREE.Mesh(new THREE.BoxGeometry(11, 0.8, 0.3), wallNavyMaterial);
  northWallHeader.position.set(0, 4.4, -10);
  scene.add(northWallHeader);

  const northWallSill = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 0.6), mahoganyDeskMaterial);
  northWallSill.position.set(0, 0.3, -10);
  scene.add(northWallSill);

  // Observatory Window Glass (High transmission, faint celestial blue reflection)
  const windowGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 3.8),
    new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.85,
      ior: 1.52,
    })
  );
  windowGlass.position.set(0, 2.2, -9.95);
  scene.add(windowGlass);

  // Window mullions (vertical and horizontal frames)
  for (let mx = -4; mx <= 4; mx += 2) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.8, 0.12), brassTrimMaterial);
    mullion.position.set(mx, 2.2, -9.94);
    scene.add(mullion);
  }
  const horizMullion = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.12), brassTrimMaterial);
  horizMullion.position.set(0, 2.2, -9.94);
  scene.add(horizMullion);

  // --- Deep 3D Celestial Starfield & Nebula System Behind North Window ---
  const starCount = 650;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);

  const starPalette = [
    new THREE.Color(0xffffff), // pure white
    new THREE.Color(0xa5f3fc), // O/B blue
    new THREE.Color(0x38bdf8), // Sirius cyan
    new THREE.Color(0xfef08a), // G-type yellow (Sun)
    new THREE.Color(0xfba571), // K/M orange-red (Betelgeuse)
    new THREE.Color(0xc084fc), // violet starlight
  ];

  for (let i = 0; i < starCount; i++) {
    // Spread widely behind the north window
    starPos[i * 3 + 0] = (Math.random() - 0.5) * 44;
    starPos[i * 3 + 1] = Math.random() * 24 - 1;
    starPos[i * 3 + 2] = -12 - Math.random() * 32;

    const col = starPalette[Math.floor(Math.random() * starPalette.length)];
    starColors[i * 3 + 0] = col.r;
    starColors[i * 3 + 1] = col.g;
    starColors[i * 3 + 2] = col.b;
    starSizes[i] = Math.random() * 0.14 + 0.04;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

  const starMaterial = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
  });
  const starPoints = new THREE.Points(starGeo, starMaterial);
  scene.add(starPoints);

  // Distant glowing nebula cloud particle cluster
  const nebulaCount = 120;
  const nebulaGeo = new THREE.BufferGeometry();
  const nebulaPos = new Float32Array(nebulaCount * 3);
  const nebulaColors = new Float32Array(nebulaCount * 3);
  for (let i = 0; i < nebulaCount; i++) {
    nebulaPos[i * 3 + 0] = (Math.random() - 0.5) * 18 - 2;
    nebulaPos[i * 3 + 1] = Math.random() * 10 + 4;
    nebulaPos[i * 3 + 2] = -22 - Math.random() * 10;
    const isMagenta = Math.random() > 0.45;
    nebulaColors[i * 3 + 0] = isMagenta ? 0.75 : 0.2;
    nebulaColors[i * 3 + 1] = isMagenta ? 0.2 : 0.55;
    nebulaColors[i * 3 + 2] = 0.95;
  }
  nebulaGeo.setAttribute('position', new THREE.BufferAttribute(nebulaPos, 3));
  nebulaGeo.setAttribute('color', new THREE.BufferAttribute(nebulaColors, 3));
  const nebulaMat = new THREE.PointsMaterial({
    size: 1.8,
    vertexColors: true,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  const nebulaPoints = new THREE.Points(nebulaGeo, nebulaMat);
  scene.add(nebulaPoints);

  // --- Interactive Hit Targets & Registry ---
  const interactiveObjects: THREE.Object3D[] = [];
  const interactionByObject = new Map<THREE.Object3D, AstroInteraction>();

  const registerTarget = (obj: THREE.Object3D, info: AstroInteraction) => {
    interactiveObjects.push(obj);
    interactionByObject.set(obj, info);
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        interactiveObjects.push(child);
        interactionByObject.set(child, info);
      }
    });
  };

  // ==============================================================
  // STATION 2: CENTRAL SOLAR SYSTEM MODEL TABLE (Area B)
  // ==============================================================
  const solarGroup = new THREE.Group();
  solarGroup.position.set(0, 0, -1.5);
  scene.add(solarGroup);

  // Large round mahogany pedestal table
  const tableBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.65, 0.75, 24),
    mahoganyDeskMaterial
  );
  tableBase.position.y = 0.75 / 2;
  tableBase.castShadow = true;
  tableBase.receiveShadow = true;
  solarGroup.add(tableBase);

  const tableTop = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.35, 0.12, 48),
    mahoganyDeskMaterial
  );
  tableTop.position.y = 0.75 + 0.06;
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  solarGroup.add(tableTop);

  const tableBrassRim = new THREE.Mesh(
    new THREE.TorusGeometry(2.36, 0.02, 12, 48),
    brassTrimMaterial
  );
  tableBrassRim.position.y = 0.81;
  tableBrassRim.rotation.x = Math.PI / 2;
  solarGroup.add(tableBrassRim);

  // Sun (Center, illuminated sphere)
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 32, 32),
    new THREE.MeshStandardMaterial({
      color: 0xffe066,
      emissive: 0xffaa00,
      emissiveIntensity: 1.0,
      roughness: 0.18,
    })
  );
  sunMesh.position.y = 1.15;
  sunMesh.castShadow = false;
  solarGroup.add(sunMesh);

  // Active radiant sunlight illuminating the solar table exhibits and student character
  const sunLight = new THREE.PointLight(0xffdf78, 4.5, 9.5, 1.2);
  sunLight.position.set(0, 1.15, 0);
  sunLight.castShadow = true;
  sunLight.shadow.bias = -0.002;
  solarGroup.add(sunLight);

  // Concentric Planetary Orbit Rings & Spheres
  const planetsData = [
    { name: 'Mercury', dist: 0.48, size: 0.035, color: 0x9e9e9e },
    { name: 'Venus', dist: 0.72, size: 0.055, color: 0xe0c07c },
    { name: 'Earth', dist: 0.98, size: 0.060, color: 0x3b82f6, hasMoon: true },
    { name: 'Mars', dist: 1.25, size: 0.045, color: 0xef4444 },
    { name: 'Jupiter', dist: 1.58, size: 0.125, color: 0xd97706 },
    { name: 'Saturn', dist: 1.88, size: 0.095, color: 0xfde047, hasRings: true },
    { name: 'Uranus', dist: 2.12, size: 0.070, color: 0x67e8f9 },
    { name: 'Neptune', dist: 2.30, size: 0.068, color: 0x2563eb },
  ];

  const orbitingMeshes: Array<{ mesh: THREE.Mesh; angle: number; speed: number; dist: number }> = [];

  planetsData.forEach((p, idx) => {
    // Elliptical brass guide wire
    const orbitLine = new THREE.Mesh(
      new THREE.RingGeometry(p.dist - 0.005, p.dist + 0.005, 64),
      new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide })
    );
    orbitLine.rotation.x = -Math.PI / 2;
    orbitLine.position.y = 0.88;
    solarGroup.add(orbitLine);

    // Planet sphere
    const planetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.size, 20, 20),
      new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.5, metalness: 0.1 })
    );
    planetMesh.castShadow = true;
    const initialAngle = (idx * Math.PI) / 3.2;
    planetMesh.position.set(Math.cos(initialAngle) * p.dist, 0.92, Math.sin(initialAngle) * p.dist);
    solarGroup.add(planetMesh);

    if (p.hasRings) {
      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(p.size * 1.4, p.size * 2.3, 32),
        new THREE.MeshStandardMaterial({ color: 0xeab308, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      );
      ringMesh.rotation.x = -Math.PI / 2.8;
      planetMesh.add(ringMesh);
    }

    if (p.hasMoon) {
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xd1d5db })
      );
      moonMesh.position.set(0.12, 0.02, 0);
      planetMesh.add(moonMesh);
    }

    orbitingMeshes.push({
      mesh: planetMesh,
      angle: initialAngle,
      speed: 0.002 + 0.003 / (idx + 1),
      dist: p.dist,
    });
  });

  // Table Brass Placard
  const solarPlaque = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.02, 0.22),
    brassTrimMaterial
  );
  solarPlaque.position.set(0, 0.88, 2.15);
  solarGroup.add(solarPlaque);

  // Invisible proxy cylinder for smooth raycasting
  const solarHitProxy = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 1.8, 16),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  solarHitProxy.position.y = 0.9;
  solarGroup.add(solarHitProxy);

  registerTarget(solarHitProxy, {
    id: 'astro-solarsystem',
    activityId: 'solar_system',
    category: 'EDUCATIONAL MODEL',
    name: 'Interactive Solar System Model',
    action: 'EXPLORE SOLAR SYSTEM',
    description: 'Physical educational model showing the Sun and eight planets. Proximity unlocks the NASA Eyes interactive 3D simulation.',
  });

  // ==============================================================
  // STATION 3: VIRTUAL OBSERVATORY TELESCOPE (Area C)
  // ==============================================================
  const telescopeGroup = new THREE.Group();
  telescopeGroup.position.set(-4.5, 0, -8.2);
  scene.add(telescopeGroup);

  // Surveyor Tripod (3 Mahogany Legs with Brass Struts)
  const tripodLegMat = mahoganyDeskMaterial;
  for (let i = 0; i < 3; i++) {
    const legAngle = (i * Math.PI * 2) / 3;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 1.45, 12), tripodLegMat);
    leg.position.set(Math.cos(legAngle) * 0.38, 0.72, Math.sin(legAngle) * 0.38);
    leg.rotation.z = Math.cos(legAngle) * 0.28;
    leg.rotation.x = Math.sin(legAngle) * 0.28;
    telescopeGroup.add(leg);
  }

  // Tripod Head Mount (Equatorial Brass Mount)
  const mountHead = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 16), brassTrimMaterial);
  mountHead.position.y = 1.42;
  telescopeGroup.add(mountHead);

  // Optical Tube Assembly (Midnight Blue / Brass Accent Schmidt-Cassegrain)
  const tubeGroup = new THREE.Group();
  tubeGroup.position.set(0, 1.58, 0);
  tubeGroup.rotation.x = 0.38; // Angled upward toward northern stars
  telescopeGroup.add(tubeGroup);

  const mainTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 1.15, 24),
    new THREE.MeshStandardMaterial({ color: 0x0f1d38, roughness: 0.3, metalness: 0.6 })
  );
  mainTube.rotation.x = Math.PI / 2;
  tubeGroup.add(mainTube);

  const frontLensCell = new THREE.Mesh(
    new THREE.TorusGeometry(0.142, 0.022, 12, 24),
    brassTrimMaterial
  );
  frontLensCell.position.z = -0.58;
  tubeGroup.add(frontLensCell);

  const eyepieceFocuser = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.18, 16),
    brassTrimMaterial
  );
  eyepieceFocuser.position.set(0, 0.08, 0.62);
  eyepieceFocuser.rotation.x = 0.4;
  tubeGroup.add(eyepieceFocuser);

  // Finderscope on top
  const finderScope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.38, 12),
    brassTrimMaterial
  );
  finderScope.position.set(0.12, 0.15, 0);
  finderScope.rotation.x = Math.PI / 2;
  tubeGroup.add(finderScope);

  // Observing Stool beside telescope
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.65, 16), mahoganyDeskMaterial);
  stool.position.set(0.75, 0.32, 0.5);
  telescopeGroup.add(stool);

  // Hit proxy for telescope
  const telescopeHitProxy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 1.9, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  telescopeHitProxy.position.y = 1.0;
  telescopeGroup.add(telescopeHitProxy);

  registerTarget(telescopeHitProxy, {
    id: 'astro-telescope',
    activityId: 'virtual_observatory',
    category: 'VIRTUAL OBSERVATORY',
    name: 'Astronomical Observation Telescope',
    action: 'OBSERVE NIGHT SKY',
    description: 'Calibrated optical telescope pointing out the observatory star window. Launches Stellarium Web planetarium.',
  });

  // ==============================================================
  // STATION 1: SOCIETY INFORMATION DISPLAY (Area A)
  // ==============================================================
  const infoBoardGroup = new THREE.Group();
  infoBoardGroup.position.set(6.2, 0, 3.5);
  infoBoardGroup.rotation.y = -Math.PI / 2.2;
  scene.add(infoBoardGroup);

  const infoEasel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), mahoganyDeskMaterial);
  infoEasel.position.set(0, 1.1, 0);
  infoBoardGroup.add(infoEasel);

  const infoBoardMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.1, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x0e172a, roughness: 0.4 })
  );
  infoBoardMesh.position.set(0, 1.5, 0.04);
  infoBoardGroup.add(infoBoardMesh);

  const infoFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.66, 1.16, 0.03),
    brassTrimMaterial
  );
  infoFrame.position.set(0, 1.5, 0.02);
  infoBoardGroup.add(infoFrame);

  registerTarget(infoBoardMesh, {
    id: 'astro-info',
    activityId: 'society_information',
    category: 'SOCIETY INFORMATION',
    name: 'UPHSD Astronomical Society Board',
    action: 'READ SOCIETY INFORMATION',
    description: 'Overview of the proposed student organization in development: mission, vision, core values, and membership information.',
  });

  // ==============================================================
  // STATION 4: ASTRONOMY ACTIVITIES WALL (Area D)
  // ==============================================================
  const activitiesWallGroup = new THREE.Group();
  activitiesWallGroup.position.set(-8.8, 2.2, -1.5);
  activitiesWallGroup.rotation.y = Math.PI / 2;
  scene.add(activitiesWallGroup);

  // Large gallery backboard
  const activitiesBoard = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 2.2, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x091428, roughness: 0.5 })
  );
  activitiesWallGroup.add(activitiesBoard);

  const activitiesFrame = new THREE.Mesh(
    new THREE.BoxGeometry(4.28, 2.28, 0.04),
    brassTrimMaterial
  );
  activitiesWallGroup.add(activitiesFrame);

  // 10 mini cards on the wall
  for (let c = 0; c < 10; c++) {
    const row = Math.floor(c / 5);
    const col = c % 5;
    const cardMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.75, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.12,
        roughness: 0.4,
      })
    );
    cardMesh.position.set(-1.6 + col * 0.8, 0.45 - row * 0.88, 0.06);
    activitiesWallGroup.add(cardMesh);
  }

  registerTarget(activitiesBoard, {
    id: 'astro-activities',
    activityId: 'activities',
    category: 'EXHIBITION WALL',
    name: 'Astronomy Activities Board (10 Areas)',
    action: 'VIEW ASTRONOMY ACTIVITIES',
    description: 'Detailed showcase of 10 proposed club activities: stargazing, astrophotography, lectures, citizen science, and research.',
  });

  // ==============================================================
  // STATION 5: ASTROPHOTOGRAPHY STATION (Area E)
  // ==============================================================
  const photoDeskGroup = new THREE.Group();
  photoDeskGroup.position.set(-6.5, 0, 3.5);
  photoDeskGroup.rotation.y = Math.PI / 4;
  scene.add(photoDeskGroup);

  // Desk
  const photoTable = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.82, 0.9), mahoganyDeskMaterial);
  photoTable.position.set(0, 0.41, 0);
  photoTable.castShadow = true;
  photoTable.receiveShadow = true;
  photoDeskGroup.add(photoTable);

  // DSLR Camera with telephoto prime lens on mini tripod
  const cameraBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.12, 0.10),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 })
  );
  cameraBody.position.set(-0.45, 0.98, 0);
  photoDeskGroup.add(cameraBody);

  const cameraLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.065, 0.28, 16),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7, roughness: 0.3 })
  );
  cameraLens.rotation.x = Math.PI / 2;
  cameraLens.position.set(-0.45, 0.98, -0.18);
  photoDeskGroup.add(cameraLens);

  // Laptop showing raw stacking UI
  const laptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.015, 0.28), new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 }));
  laptopBase.position.set(0.35, 0.83, 0);
  photoDeskGroup.add(laptopBase);

  const laptopScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.26, 0.015),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 0.4 })
  );
  laptopScreen.position.set(0.35, 0.96, -0.14);
  laptopScreen.rotation.x = 0.2;
  photoDeskGroup.add(laptopScreen);

  // Framed Astrophotography Prints on wall behind
  const photoWallPrints = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.2, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x030712, roughness: 0.2 })
  );
  photoWallPrints.position.set(-8.85, 2.2, 3.5);
  photoWallPrints.rotation.y = Math.PI / 2;
  scene.add(photoWallPrints);

  registerTarget(photoTable, {
    id: 'astro-astrophoto',
    activityId: 'astrophotography',
    category: 'PRACTICAL STATION',
    name: 'Astrophotography & Image Stacking Desk',
    action: 'EXPLORE ASTROPHOTOGRAPHY',
    description: 'Camera gear, deep-sky stacking software showcase, and framed astrophotography gallery.',
  });

  // ==============================================================
  // STATION 6: ASTRONOMY RESEARCH DESK (Area F)
  // ==============================================================
  const researchDeskGroup = new THREE.Group();
  researchDeskGroup.position.set(6.5, 0, -1.5);
  researchDeskGroup.rotation.y = -Math.PI / 2;
  scene.add(researchDeskGroup);

  const resTable = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.82, 0.9), mahoganyDeskMaterial);
  resTable.position.set(0, 0.41, 0);
  resTable.castShadow = true;
  resTable.receiveShadow = true;
  researchDeskGroup.add(resTable);

  // Dual research monitors
  [-0.4, 0.4].forEach((mx) => {
    const mon = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.34, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x10b981, emissiveIntensity: 0.3 })
    );
    mon.position.set(mx, 1.12, -0.2);
    researchDeskGroup.add(mon);

    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 8), brassTrimMaterial);
    stand.position.set(mx, 0.94, -0.2);
    researchDeskGroup.add(stand);
  });

  registerTarget(resTable, {
    id: 'astro-research',
    activityId: 'research',
    category: 'RESEARCH STATION',
    name: 'Astronomy Research Desk',
    action: 'EXPLORE RESEARCH',
    description: 'Observe, Analyze, Document, Share: Light-pollution mapping, variable-star monitoring, and citizen science.',
  });

  // ==============================================================
  // STATION 7: CONSTELLATION WALL (Area G)
  // ==============================================================
  const constellationWallMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 2.4, 3.8),
    new THREE.MeshStandardMaterial({
      color: 0x0b1329,
      emissive: 0x1e1b4b,
      emissiveIntensity: 0.4,
      roughness: 0.5,
    })
  );
  constellationWallMesh.position.set(8.85, 2.4, -6.0);
  scene.add(constellationWallMesh);

  registerTarget(constellationWallMesh, {
    id: 'astro-constellations',
    activityId: 'constellations',
    category: 'CELESTIAL MAP',
    name: 'Constellation Explorer Wall',
    action: 'EXPLORE CONSTELLATIONS',
    description: 'Detailed star charts of Orion, Ursa Major, Cassiopeia, Scorpius, Cygnus, and Taurus with mythology and coordinates.',
  });

  // ==============================================================
  // STATION 8: SPACE MISSIONS GALLERY (Area H)
  // ==============================================================
  const missionsWallMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 2.4, 3.8),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.5,
    })
  );
  missionsWallMesh.position.set(-8.85, 2.4, -6.0);
  scene.add(missionsWallMesh);

  registerTarget(missionsWallMesh, {
    id: 'astro-missions',
    activityId: 'space_missions',
    category: 'EXHIBITION WALL',
    name: 'Space Missions & Exploration Gallery',
    action: 'EXPLORE SPACE MISSIONS',
    description: 'Interactive exhibition of humanity’s greatest robotic and human space exploration programs.',
  });

  // ==============================================================
  // STATION 9: MEMBERSHIP & INTEREST RECRUITMENT DESK (Area I)
  // ==============================================================
  const surveyDeskGroup = new THREE.Group();
  surveyDeskGroup.position.set(3.5, 0, 4.2);
  surveyDeskGroup.rotation.y = Math.PI;
  scene.add(surveyDeskGroup);

  const surveyTable = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.82, 0.8), mahoganyDeskMaterial);
  surveyTable.position.set(0, 0.41, 0);
  surveyTable.castShadow = true;
  surveyDeskGroup.add(surveyTable);

  const surveyClipboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.02, 0.38),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 })
  );
  surveyClipboard.position.set(-0.35, 0.83, 0);
  surveyDeskGroup.add(surveyClipboard);

  registerTarget(surveyTable, {
    id: 'astro-survey',
    activityId: 'membership_survey',
    category: 'MEMBERSHIP & SURVEY',
    name: 'Membership & Interest Desk',
    action: 'TAKE INTEREST SURVEY',
    description: 'Share your interest, event preferences, and ideas for the proposed UPHSD Astronomical Society.',
  });

  // ==============================================================
  // STATION 10: ASTRONOMY GUIDE NPC (Area J)
  // ==============================================================
  const npcGroup = new THREE.Group();
  npcGroup.position.set(5.2, 0, 4.0);
  npcGroup.rotation.y = -Math.PI / 1.5;
  scene.add(npcGroup);

  const npcProxy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 1.85, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  npcProxy.position.y = 0.92;
  npcGroup.add(npcProxy);

  // Load student character GLB
  const gltfLoader = new GLTFLoader();
  gltfLoader.load(
    '/assets/character_student.glb',
    (gltf) => {
      const model = gltf.scene;
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.scale.set(1.05, 1.05, 1.05);
      npcGroup.add(model);
    },
    undefined,
    () => {
      // Fallback stylized dummy if GLB load encounters any issue
      const fallbackTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.75, 12), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
      fallbackTorso.position.y = 1.0;
      npcGroup.add(fallbackTorso);
      const fallbackHead = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), new THREE.MeshStandardMaterial({ color: 0xfbbf24 }));
      fallbackHead.position.y = 1.55;
      npcGroup.add(fallbackHead);
    }
  );

  registerTarget(npcProxy, {
    id: 'astro-guide',
    activityId: 'guide',
    category: 'SOCIETY GUIDE',
    name: 'Astronomy Club Guide',
    action: 'TALK TO ASTRONOMY GUIDE',
    description: 'Welcome to the Astronomical Society Room! This space explores what an astronomy-focused student organization could offer.',
  });

  // ==============================================================
  // EXIT DOORWAY BACK TO CAMPUS HALLWAY
  // ==============================================================
  const doorGroup = new THREE.Group();
  doorGroup.position.set(0, 0, 5.85);
  scene.add(doorGroup);

  // Outer molded mahogany doorway casing & architrave
  const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.3, 0.34), mahoganyDeskMaterial);
  jambL.position.set(-1.26, 1.65, 0);
  doorGroup.add(jambL);

  const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.3, 0.34), mahoganyDeskMaterial);
  jambR.position.set(1.26, 1.65, 0);
  doorGroup.add(jambR);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.22, 0.36), mahoganyDeskMaterial);
  lintel.position.set(0, 3.36, 0);
  doorGroup.add(lintel);

  const doorThreshold = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.04, 0.38), brassTrimMaterial);
  doorThreshold.position.set(0, 0.02, 0);
  doorGroup.add(doorThreshold);

  // Architrave brass beading
  const beadL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.3, 0.36), brassTrimMaterial);
  beadL.position.set(-1.36, 1.65, 0);
  doorGroup.add(beadL);

  const beadR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.3, 0.36), brassTrimMaterial);
  beadR.position.set(1.36, 1.65, 0);
  doorGroup.add(beadR);

  const beadTop = new THREE.Mesh(new THREE.BoxGeometry(2.76, 0.04, 0.38), brassTrimMaterial);
  beadTop.position.set(0, 3.48, 0);
  doorGroup.add(beadTop);

  // --- Overhead Illuminated Exit Sign ---
  const createExitSignTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#041f17';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, 1000, 232);
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, 976, 208);
    ctx.fillStyle = '#6ee7b7';
    ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦ EXIT · CAMPUS CORRIDOR ✦', 512, 92);
    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('CONNECTING ROOMS 01 & 02', 512, 172);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  };

  const exitSignTex = createExitSignTexture();
  const exitSignBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.42, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 })
  );
  exitSignBox.position.set(0, 3.72, 0.04);
  doorGroup.add(exitSignBox);

  const exitSignFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.81, 0.38),
    new THREE.MeshStandardMaterial({
      map: exitSignTex,
      emissiveMap: exitSignTex,
      emissive: 0x10b981,
      emissiveIntensity: 0.95,
      roughness: 0.2,
    })
  );
  exitSignFace.position.set(0, 3.72, 0.105);
  doorGroup.add(exitSignFace);

  const exitSignHalo = new THREE.PointLight(0x10b981, 1.8, 4.5, 1.2);
  exitSignHalo.position.set(0, 3.7, 0.25);
  doorGroup.add(exitSignHalo);

  // --- Campus Corridor Hallway Alcove Beyond Doorway ---
  const corridorGroup = new THREE.Group();
  corridorGroup.position.set(0, 0, 1.2);
  doorGroup.add(corridorGroup);

  const corridorFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 2.4),
    new THREE.MeshStandardMaterial({ color: 0xededeb, roughness: 0.25 })
  );
  corridorFloor.rotation.x = -Math.PI / 2;
  corridorFloor.position.set(0, 0.01, 0);
  corridorGroup.add(corridorFloor);

  const corridorBackWall = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 4.8, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xedebe4, roughness: 0.6 })
  );
  corridorBackWall.position.set(0, 2.4, 1.2);
  corridorGroup.add(corridorBackWall);

  const corridorCeiling = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 2.4),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
  );
  corridorCeiling.rotation.x = Math.PI / 2;
  corridorCeiling.position.set(0, 4.8, 0);
  corridorGroup.add(corridorCeiling);

  // --- Double French Doors with True Hinge Pivot Groups ---
  const leftDoorHinge = new THREE.Group();
  leftDoorHinge.position.set(-1.16, 0, 0);
  doorGroup.add(leftDoorHinge);

  const rightDoorHinge = new THREE.Group();
  rightDoorHinge.position.set(1.16, 0, 0);
  doorGroup.add(rightDoorHinge);

  const frostedGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    transmission: 0.68,
    roughness: 0.18,
    metalness: 0.08,
    opacity: 0.65,
    transparent: true,
    ior: 1.5,
  });

  const createDoorLeaf = (isLeft: boolean) => {
    const leafGroup = new THREE.Group();
    const sign = isLeft ? 1 : -1;
    const leafWidth = 1.15;
    const leafHeight = 3.12;
    const leafThick = 0.08;

    // Main mahogany frame body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(leafWidth, leafHeight, leafThick),
      mahoganyDeskMaterial
    );
    body.position.set(sign * (leafWidth / 2), leafHeight / 2 + 0.04, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    leafGroup.add(body);

    // Brass kickplate at the bottom
    const kickplate = new THREE.Mesh(
      new THREE.BoxGeometry(leafWidth - 0.02, 0.34, leafThick + 0.01),
      brassTrimMaterial
    );
    kickplate.position.set(sign * (leafWidth / 2), 0.22, 0);
    leafGroup.add(kickplate);

    // Frosted glass viewing pane
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 1.45, 0.03),
      frostedGlassMat
    );
    glass.position.set(sign * (leafWidth / 2), 2.15, 0);
    leafGroup.add(glass);

    // Brass bezel frame around frosted glass
    const glassBezel = new THREE.Mesh(
      new THREE.BoxGeometry(0.40, 1.49, leafThick + 0.01),
      brassTrimMaterial
    );
    glassBezel.position.set(sign * (leafWidth / 2), 2.15, 0);
    leafGroup.add(glassBezel);

    // Vertical polished brass architectural pull handle
    const handleX = sign * (leafWidth - 0.14);
    const handleY = 1.42;

    const pullRodFront = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.68, 16),
      brassTrimMaterial
    );
    pullRodFront.position.set(handleX, handleY, 0.075);
    leafGroup.add(pullRodFront);

    const pullRodBack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.68, 16),
      brassTrimMaterial
    );
    pullRodBack.position.set(handleX, handleY, -0.075);
    leafGroup.add(pullRodBack);

    // Handle standoffs
    [-0.28, 0.28].forEach((offsetY) => {
      const standoffF = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.07, 12),
        brassTrimMaterial
      );
      standoffF.rotation.x = Math.PI / 2;
      standoffF.position.set(handleX, handleY + offsetY, 0.04);
      leafGroup.add(standoffF);

      const standoffB = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.07, 12),
        brassTrimMaterial
      );
      standoffB.rotation.x = Math.PI / 2;
      standoffB.position.set(handleX, handleY + offsetY, -0.04);
      leafGroup.add(standoffB);
    });

    // Brass push/escutcheon plate
    const escutcheon = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.22, leafThick + 0.015),
      brassTrimMaterial
    );
    escutcheon.position.set(handleX, 0.98, 0);
    leafGroup.add(escutcheon);

    return leafGroup;
  };

  leftDoorHinge.add(createDoorLeaf(true));
  rightDoorHinge.add(createDoorLeaf(false));

  // Invisible proxy box for responsive raycasting and click detection
  const doorRayProxy = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 3.4, 0.8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  doorRayProxy.position.set(0, 1.7, 0);
  doorGroup.add(doorRayProxy);

  registerTarget(doorRayProxy, {
    id: 'astro-door',
    activityId: 'door',
    category: 'CAMPUS HALLWAY',
    name: 'Exit to Laboratory Hallway',
    action: 'RETURN TO CAMPUS HALL',
    description: 'Return to the main campus corridor connecting Rooms 01, 02, and 04.',
  });

  // ==============================================================
  // PLAYER CHARACTER & CAMERA CONTROLLER
  // ==============================================================
  const playerPosition = new THREE.Vector3(0, 1.70, 3.8);
  let playerYaw = Math.PI; // Face north toward the Solar System table on entry
  let playerPitch = -0.04;
  const movement = { forward: false, backward: false, left: false, right: false, shift: false };
  let currentInteraction: AstroInteraction | null = null;
  const raycaster = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);

  const character = new CharacterController({
    scene,
    floorY: 0,
    initialPosition: playerPosition,
    initialYaw: playerYaw,
    defaultCharacter: 'female',
    allowThirdPerson: true,
    defaultThirdPerson: true,
  });

  const updateCamera = () => {
    character.updateCamera(camera, playerPosition, playerYaw, playerPitch);
  };
  updateCamera();

  // Resize handler
  const onResize = () => {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  // Pointer lock & look controls
  let pointerLocked = false;
  const onPointerLockChange = () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    callbacks.onPointerLockChange?.(pointerLocked);
    if (!pointerLocked) {
      renderer.domElement.style.cursor = 'grab';
    }
  };
  document.addEventListener('pointerlockchange', onPointerLockChange);

  // Mouse move in Pointer Lock mode (FPS)
  const onMouseMove = (event: MouseEvent) => {
    if (!pointerLocked) return;
    const sensitivity = 0.0024;
    playerYaw -= event.movementX * sensitivity;
    playerPitch = Math.max(-1.25, Math.min(1.20, playerPitch - event.movementY * sensitivity));
    updateCamera();
  };
  window.addEventListener('mousemove', onMouseMove);

  // --- Drag-to-Look Pointer Controls on Canvas (Desktop Drag & Touch) ---
  let isDragging = false;
  let dragPointerId: number | null = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDownTime = 0;
  const turning = { left: false, right: false };

  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'grab';

  const checkHoverCursor = (clientX: number, clientY: number) => {
    if (pointerLocked || isDragging) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveObjects, false);
    let isHovering = false;
    for (const hit of intersects) {
      if (hit.distance < 6.5 && interactionByObject.has(hit.object)) {
        isHovering = true;
        break;
      }
    }
    renderer.domElement.style.cursor = isHovering ? 'pointer' : 'grab';
  };

  const handleCanvasClick = (clientX: number, clientY: number) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveObjects, false);
    for (const hit of intersects) {
      if (hit.distance < 6.5) {
        const info = interactionByObject.get(hit.object);
        if (info) {
          if (info.activityId === 'door') {
            callbacks.onActivityInteract?.('door');
          } else {
            callbacks.onActivityInteract?.(info.activityId as AstroActivityId);
          }
          return;
        }
      }
    }
    // If not clicking an interactive object, clicking canvas requests pointer lock
    renderer.domElement.requestPointerLock?.();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isDragging = true;
    dragPointerId = e.pointerId;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    pointerDownTime = performance.now();
    try {
      renderer.domElement.setPointerCapture(e.pointerId);
    } catch {}
    renderer.domElement.style.cursor = 'grabbing';
  };

  const onPointerMove = (e: PointerEvent) => {
    if (pointerLocked) return;

    if (!isDragging || e.pointerId !== dragPointerId) {
      checkHoverCursor(e.clientX, e.clientY);
      return;
    }

    const deltaX = e.clientX - lastPointerX;
    const deltaY = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;

    const sensitivity = 0.0042;
    playerYaw -= deltaX * sensitivity;
    playerPitch = Math.max(-1.25, Math.min(1.20, playerPitch - deltaY * sensitivity));
    updateCamera();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== dragPointerId) return;
    isDragging = false;
    dragPointerId = null;
    try {
      renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {}
    renderer.domElement.style.cursor = 'grab';

    const travel = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
    const duration = performance.now() - pointerDownTime;
    if (travel < 8 && duration < 400) {
      handleCanvasClick(e.clientX, e.clientY);
    }
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId === dragPointerId) {
      isDragging = false;
      dragPointerId = null;
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {}
      renderer.domElement.style.cursor = 'grab';
    }
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerCancel);

  // Keyboard navigation & turning
  const onKeyDown = (event: KeyboardEvent) => {
    const el = event.target as HTMLElement | null;
    if (el && el.matches('input, textarea, select, button')) return;

    // Translation movement: WASD or ArrowUp/Down
    if (event.code === 'KeyW' || event.code === 'ArrowUp') movement.forward = true;
    if (event.code === 'KeyS' || event.code === 'ArrowDown') movement.backward = true;
    if (event.code === 'KeyA') movement.left = true;
    if (event.code === 'KeyD') movement.right = true;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') movement.shift = true;

    // Camera Yaw Rotation: ArrowLeft / ArrowRight or Q
    if (event.code === 'ArrowLeft' || event.code === 'KeyQ') turning.left = true;
    if (event.code === 'ArrowRight') turning.right = true;

    // Station Interaction
    if (event.code === 'KeyE') {
      if (currentInteraction) {
        if (currentInteraction.activityId === 'door') {
          callbacks.onActivityInteract?.('door');
        } else {
          callbacks.onActivityInteract?.(currentInteraction.activityId as AstroActivityId);
        }
      } else {
        turning.right = true;
      }
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'KeyW' || event.code === 'ArrowUp') movement.forward = false;
    if (event.code === 'KeyS' || event.code === 'ArrowDown') movement.backward = false;
    if (event.code === 'KeyA') movement.left = false;
    if (event.code === 'KeyD') movement.right = false;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') movement.shift = false;

    if (event.code === 'ArrowLeft' || event.code === 'KeyQ') turning.left = false;
    if (event.code === 'ArrowRight') turning.right = false;
    if (event.code === 'KeyE') turning.right = false;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Mobile vector movement
  let moveVectorX = 0;
  let moveVectorForward = 0;

  // Animation Loop
  let animationId = 0;
  let lastTime = performance.now();
  let footstepTimer = 0;

  const animate = () => {
    animationId = requestAnimationFrame(animate);
    const now = performance.now();
    const delta = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;

    // Orbit planetary spheres gently around the Sun
    orbitingMeshes.forEach((item) => {
      item.angle += item.speed;
      item.mesh.position.x = Math.cos(item.angle) * item.dist;
      item.mesh.position.z = Math.sin(item.angle) * item.dist;
      item.mesh.rotation.y += 0.02;
    });

    // Sun gentle breathing pulsation
    const sunPulse = 1 + Math.sin(now * 0.003) * 0.03;
    sunMesh.scale.set(sunPulse, sunPulse, sunPulse);

    // Guide NPC subtle breathing
    npcGroup.position.y = Math.sin(now * 0.002) * 0.008;

    // Smooth keyboard turning
    const turnSpeed = 2.1;
    if (turning.left) {
      playerYaw += turnSpeed * delta;
      updateCamera();
    }
    if (turning.right) {
      playerYaw -= turnSpeed * delta;
      updateCamera();
    }

    // Compute player movement vector
    let moveForward = 0;
    let moveRight = 0;

    if (movement.forward) moveForward += 1;
    if (movement.backward) moveForward -= 1;
    if (movement.right) moveRight += 1;
    if (movement.left) moveRight -= 1;

    // Add joystick vector if active
    if (Math.abs(moveVectorX) > 0.05 || Math.abs(moveVectorForward) > 0.05) {
      moveRight += moveVectorX;
      moveForward += moveVectorForward;
    }

    const moveDirection = new THREE.Vector3();
    const isMoving = Math.hypot(moveForward, moveRight) > 0.05;
    if (isMoving) {
      const walkSpeed = movement.shift ? 5.4 : 3.6;
      const angle = playerYaw;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);

      // Normalize movement direction
      const len = Math.hypot(moveForward, moveRight);
      const normF = moveForward / len;
      const normR = moveRight / len;

      const deltaX = (-sin * normF + cos * normR) * walkSpeed * delta;
      const deltaZ = (-cos * normF - sin * normR) * walkSpeed * delta;
      moveDirection.set(deltaX, 0, deltaZ);

      // Simple bounding box collision (-8.4 < X < 8.4, -9.2 < Z < 5.2)
      const nextX = Math.max(-8.4, Math.min(8.4, playerPosition.x + deltaX));
      const nextZ = Math.max(-9.2, Math.min(5.2, playerPosition.z + deltaZ));

      // Table obstruction avoidance (radius 2.6 around X=0, Z=-1.5)
      const distToTable = Math.hypot(nextX - 0, nextZ - (-1.5));
      if (distToTable > 2.6) {
        playerPosition.x = nextX;
        playerPosition.z = nextZ;
      }

      footstepTimer += delta;
      if (footstepTimer > (movement.shift ? 0.28 : 0.38)) {
        footstepTimer = 0;
        callbacks.onFootstep?.();
      }
    }

    // Update 3D rigged character controller
    character.update(
      delta,
      playerPosition,
      moveDirection,
      playerYaw,
      playerPitch,
      camera,
      movement.shift
    );

    // Raycast interaction detection from screen center
    raycaster.setFromCamera(screenCenter, camera);
    const intersects = raycaster.intersectObjects(interactiveObjects, false);

    let foundInteraction: AstroInteraction | null = null;
    for (const hit of intersects) {
      if (hit.distance < 4.8) {
        const info = interactionByObject.get(hit.object);
        if (info) {
          foundInteraction = info;
          break;
        }
      }
    }

    if (foundInteraction !== currentInteraction) {
      currentInteraction = foundInteraction;
      callbacks.onInteractionChange?.(currentInteraction);
    }

    renderer.render(scene, camera);
  };
  animate();

  let doorAnimating = false;

  return {
    dispose: () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      character.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    },
    interact: () => {
      if (currentInteraction) {
        if (currentInteraction.activityId === 'door') {
          callbacks.onActivityInteract?.('door');
        } else {
          callbacks.onActivityInteract?.(currentInteraction.activityId as AstroActivityId);
        }
      }
    },
    openDoor: (onOpened) => {
      if (doorAnimating) return;
      doorAnimating = true;
      const startTime = performance.now();
      const duration = 750; // ms
      const animateDoor = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Smooth cubic ease out
        const ease = 1 - Math.pow(1 - progress, 3);
        const targetAngle = Math.PI * 0.48; // ~86 degrees outward
        leftDoorHinge.rotation.y = -targetAngle * ease;
        rightDoorHinge.rotation.y = targetAngle * ease;

        if (progress < 1) {
          requestAnimationFrame(animateDoor);
        } else {
          doorAnimating = false;
          onOpened?.();
        }
      };
      requestAnimationFrame(animateDoor);
    },
    requestPointerLock: () => {
      renderer.domElement.requestPointerLock?.();
    },
    resetView: () => {
      playerPosition.set(0, 1.70, 3.8);
      playerYaw = Math.PI;
      playerPitch = -0.04;
      updateCamera();
    },
    toggleView: () => {
      return character.toggleView();
    },
    switchCharacter: () => {
      return character.switchCharacter();
    },
    setCharacter: (type) => {
      character.setCharacter(type);
    },
    getCharacter: () => {
      return character.activeCharacter;
    },
    setMove: (direction, active) => {
      if (direction === 'forward') movement.forward = active;
      if (direction === 'backward') movement.backward = active;
      if (direction === 'left') movement.left = active;
      if (direction === 'right') movement.right = active;
    },
    setMoveVector: (right, forward) => {
      moveVectorX = right;
      moveVectorForward = forward;
    },
    teleportTo: (activityId) => {
      const positions: Record<AstroActivityId, { x: number; z: number; yaw: number }> = {
        solar_system: { x: 0, z: 1.2, yaw: Math.PI },
        virtual_observatory: { x: -3.5, z: -6.5, yaw: Math.PI * 0.8 },
        activities: { x: -6.5, z: -1.5, yaw: Math.PI / 2 },
        astrophotography: { x: -4.8, z: 2.2, yaw: Math.PI * 0.25 },
        research: { x: 4.8, z: -1.5, yaw: -Math.PI / 2 },
        constellations: { x: 6.5, z: -5.5, yaw: -Math.PI / 2 },
        space_missions: { x: -6.5, z: -5.5, yaw: Math.PI / 2 },
        society_information: { x: 4.5, z: 2.5, yaw: -Math.PI * 0.3 },
        membership_survey: { x: 3.5, z: 2.2, yaw: 0 },
      };
      const pos = positions[activityId];
      if (pos) {
        playerPosition.set(pos.x, 1.70, pos.z);
        playerYaw = pos.yaw;
        playerPitch = -0.05;
        updateCamera();
      }
    },
  };
}
