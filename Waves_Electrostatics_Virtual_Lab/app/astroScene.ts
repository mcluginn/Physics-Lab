'use client';

import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
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
  scene.fog = new THREE.Fog(0x050b18, 35, 110);

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

  // --- Observatory North Window Framing ---
  // Note: Glass pane mesh is intentionally omitted to give 100% optical clarity into deep space
  // so the shining Moon and sparkling stars are completely unobstructed, while the mahogany
  // casing and brass mullions provide the architectural window framing.

  // Window mullions (vertical and horizontal brass frames)
  for (let mx = -4; mx <= 4; mx += 2) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.8, 0.12), brassTrimMaterial);
    mullion.position.set(mx, 2.2, -9.94);
    scene.add(mullion);
  }
  const horizMullion = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.12), brassTrimMaterial);
  horizMullion.position.set(0, 2.2, -9.94);
  scene.add(horizMullion);

  // --- 3D Moon using Assets from public/assets/moon ---
  const textureLoader = new THREE.TextureLoader();
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
  moonGroup.position.set(3.8, 6.4, -26.0);
  moonGroup.rotation.y = -Math.PI / 3;
  scene.add(moonGroup);

  // High-resolution sphere mapped with 2K NASA diffuse and bump maps
  let moonMesh: THREE.Object3D = new THREE.Mesh(
    new THREE.SphereGeometry(1.95, 64, 64),
    moonMaterial
  );
  moonGroup.add(moonMesh);

  // Load Moon 3D OBJ model from public/assets/moon
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
      // The Blender model vertices have radius ~1.74m; scale to match ~1.95m
      obj.scale.set(1.12, 1.12, 1.12);
      moonGroup.remove(moonMesh);
      moonMesh = obj;
      moonGroup.add(obj);
    },
    undefined,
    (err) => {
      console.warn('Moon OBJ loaded with fallback sphere:', err);
    }
  );

  // Soft atmospheric lunar halo behind the moon
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
  moonCorona.position.set(3.8, 6.4, -26.1);
  moonCorona.scale.set(8.5, 8.5, 1.0);
  scene.add(moonCorona);

  // Dedicated Moonlight Point Light bathing the window opening
  const moonPointLight = new THREE.PointLight(0xdbeafe, 3.2, 45, 1.1);
  moonPointLight.position.set(3.8, 6.4, -24.0);
  scene.add(moonPointLight);

  // --- Deep 3D Celestial Starfield & Shining Stars System ---
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

  const starCount = 1200;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);

  const starPalette = [
    new THREE.Color(0xffffff), // pure diamond white
    new THREE.Color(0xa5f3fc), // O/B cyan blue
    new THREE.Color(0x93c5fd), // Sirius electric sapphire
    new THREE.Color(0x38bdf8), // radiant sky cyan
    new THREE.Color(0xfef08a), // G-type yellow (Sun)
    new THREE.Color(0xfba571), // K/M orange-red (Betelgeuse)
    new THREE.Color(0xe9d5ff), // violet starlight
  ];

  for (let i = 0; i < starCount; i++) {
    // Spread widely behind the north window and overhead sky
    starPos[i * 3 + 0] = (Math.random() - 0.5) * 52;
    starPos[i * 3 + 1] = Math.random() * 26 - 1;
    starPos[i * 3 + 2] = -13 - Math.random() * 35;

    const col = starPalette[Math.floor(Math.random() * starPalette.length)];
    starColors[i * 3 + 0] = col.r;
    starColors[i * 3 + 1] = col.g;
    starColors[i * 3 + 2] = col.b;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

  const starMaterial = new THREE.PointsMaterial({
    size: 0.75,
    map: createStarGlowTexture(),
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
    // Core radial glow
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.18, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(0.5, 'rgba(186, 230, 253, 0.45)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    // Horizontal diffraction spike
    const hGrad = ctx.createLinearGradient(0, 64, 128, 64);
    hGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    hGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
    hGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 62, 128, 4);

    // Vertical diffraction spike
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
    { name: 'Sirius', x: -2.8, y: 5.6, z: -23, color: 0x93c5fd, scale: 2.2, speed: 3.2, phase: 0.1 },
    { name: 'Betelgeuse', x: 6.2, y: 7.2, z: -25, color: 0xfba571, scale: 2.5, speed: 2.4, phase: 1.2 },
    { name: 'Rigel', x: -5.4, y: 3.6, z: -21, color: 0x67e8f9, scale: 2.0, speed: 3.7, phase: 2.4 },
    { name: 'Polaris', x: 0.3, y: 8.4, z: -27, color: 0xffffff, scale: 2.1, speed: 2.1, phase: 3.5 },
    { name: 'Vega', x: -7.5, y: 6.8, z: -26, color: 0xa5f3fc, scale: 2.3, speed: 3.0, phase: 4.8 },
    { name: 'Aldebaran', x: 4.4, y: 3.8, z: -22, color: 0xfde047, scale: 1.9, speed: 2.8, phase: 5.3 },
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

    // Planet sphere elevated cleanly above the table surface
    const planetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.size, 20, 20),
      new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.5, metalness: 0.1 })
    );
    planetMesh.castShadow = true;
    const initialAngle = (idx * Math.PI) / 3.2;
    const planetElevation = 1.10;
    planetMesh.position.set(Math.cos(initialAngle) * p.dist, planetElevation, Math.sin(initialAngle) * p.dist);

    // Polished brass support stem mounting the planet to the tabletop orbit ring (y=0.88 to 1.10)
    const stemHeight = planetElevation - 0.88;
    const planetStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, stemHeight, 8),
      brassTrimMaterial
    );
    planetStem.position.y = -stemHeight / 2;
    planetStem.castShadow = true;
    planetMesh.add(planetStem);

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
  // STATION 6: ASTRONOMY RESEARCH WORKSTATION ("2 PC" DESK) (Area F)
  // ==============================================================
  const researchDeskGroup = new THREE.Group();
  researchDeskGroup.position.set(6.5, 0, -1.5);
  researchDeskGroup.rotation.y = -Math.PI / 2;
  scene.add(researchDeskGroup);

  // High-grade mahogany research desk with beveled edge and brass perimeter trim
  const resTable = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.82, 0.95), mahoganyDeskMaterial);
  resTable.position.set(0, 0.41, 0);
  resTable.castShadow = true;
  resTable.receiveShadow = true;
  researchDeskGroup.add(resTable);

  const resTableTrim = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.03, 0.97), brassTrimMaterial);
  resTableTrim.position.set(0, 0.81, 0);
  researchDeskGroup.add(resTableTrim);

  // Monitor Display Screen Textures
  const createSpectrumScreenTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, 512, 320);

    // Top menu bar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 32);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('UPHSD ASTRO-LAB // STELLAR SPECTROSCOPY & TRANSIT PHOTOMETRY', 14, 21);

    // Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 30; x < 490; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 45); ctx.lineTo(x, 195); ctx.stroke();
    }
    for (let y = 45; y < 195; y += 30) {
      ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(490, y); ctx.stroke();
    }

    // Rainbow emission spectrum
    const specGrad = ctx.createLinearGradient(40, 0, 480, 0);
    specGrad.addColorStop(0.0, '#3b82f6');
    specGrad.addColorStop(0.25, '#06b6d4');
    specGrad.addColorStop(0.5, '#10b981');
    specGrad.addColorStop(0.75, '#f59e0b');
    specGrad.addColorStop(1.0, '#ef4444');
    ctx.fillStyle = specGrad;
    ctx.fillRect(40, 50, 440, 20);

    // Dark absorption lines
    [75, 110, 160, 210, 290, 340, 410, 445].forEach((lx) => {
      ctx.fillStyle = '#0a0f1d';
      ctx.fillRect(lx, 50, 3, 20);
    });

    // Exoplanet transit curve
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(40, 130);
    ctx.lineTo(190, 130);
    ctx.bezierCurveTo(220, 130, 230, 175, 260, 175);
    ctx.bezierCurveTo(290, 175, 300, 130, 330, 130);
    ctx.lineTo(480, 130);
    ctx.stroke();

    // Data panel
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, 205, 492, 105);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText('TARGET: HD 209458 b (Osiris) | FLUX DIP: -1.46% | PERIOD: 3.5247 d', 20, 230);
    ctx.fillText('RA: 22h 03m 10.8s | DEC: +18° 53′ 04″ | SNR: 48.2 | APERTURE: 0.35m', 20, 252);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('STATUS: CONTINUOUS PHOTOMETRIC LOGGING [STABLE]', 20, 276);

    return new THREE.CanvasTexture(canvas);
  };

  const createSkySurveyScreenTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, 512, 320);

    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, 0, 512, 32);
    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('UPHSD DEEP-SKY SKY SURVEY // FITS CALIBRATION & ASTROMETRY', 14, 21);

    ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
    ctx.lineWidth = 1;
    for (let x = 40; x < 480; x += 45) {
      ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 230); ctx.stroke();
    }
    for (let y = 40; y < 230; y += 45) {
      ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(480, y); ctx.stroke();
    }

    for (let s = 0; s < 120; s++) {
      const sx = 40 + Math.random() * 440;
      const sy = 40 + Math.random() * 190;
      const sr = Math.random() * 2 + 0.5;
      ctx.fillStyle = Math.random() > 0.3 ? '#e0f2fe' : '#fef08a';
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    const galGrad = ctx.createRadialGradient(260, 135, 4, 260, 135, 75);
    galGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    galGrad.addColorStop(0.25, 'rgba(224, 231, 255, 0.65)');
    galGrad.addColorStop(0.65, 'rgba(129, 140, 248, 0.28)');
    galGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = galGrad;
    ctx.beginPath();
    ctx.ellipse(260, 135, 75, 42, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(260, 135, 18, 0, Math.PI * 2);
    ctx.moveTo(260, 105); ctx.lineTo(260, 165);
    ctx.moveTo(230, 135); ctx.lineTo(290, 135);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, 245, 492, 65);
    ctx.fillStyle = '#a78bfa';
    ctx.font = '11px monospace';
    ctx.fillText('TARGET: M31 / ANDROMEDA CORE | FILTER: H-ALPHA 656.3nm', 20, 268);
    ctx.fillText('SOLVER: WCS ASTROMETRY.NET | RESIDUAL: 0.18" RMS | EXPOSURE: 300s', 20, 290);

    return new THREE.CanvasTexture(canvas);
  };

  const pcScreenTextures = [createSpectrumScreenTexture(), createSkySurveyScreenTexture()];
  const monitorBezelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.8 });
  const keyboardMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.4 });
  const mousepadMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.9 });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.85 });

  // Build the 2 Complete PC Workstations
  [-0.52, 0.52].forEach((mx, pci) => {
    // Ergonomic monitor stand
    const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.015, 0.18), monitorBezelMat);
    standBase.position.set(mx, 0.828, -0.22);
    standBase.castShadow = true;
    researchDeskGroup.add(standBase);

    const standNeck = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.035), monitorBezelMat);
    standNeck.position.set(mx, 0.95, -0.24);
    standNeck.castShadow = true;
    researchDeskGroup.add(standNeck);

    // Slim monitor bezel housing
    const monHousing = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.40, 0.025), monitorBezelMat);
    monHousing.position.set(mx, 1.10, -0.21);
    monHousing.castShadow = true;
    researchDeskGroup.add(monHousing);

    // High-resolution active screen display
    const monScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.60, 0.36),
      new THREE.MeshBasicMaterial({ map: pcScreenTextures[pci] })
    );
    monScreen.position.set(mx, 1.10, -0.196);
    researchDeskGroup.add(monScreen);

    // Desk Mat / Mousepad
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.004, 0.30), mousepadMat);
    pad.position.set(mx, 0.825, 0.14);
    researchDeskGroup.add(pad);

    // Mechanical Keyboard
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.016, 0.14), keyboardMat);
    kb.position.set(mx - 0.08, 0.832, 0.14);
    kb.castShadow = true;
    researchDeskGroup.add(kb);

    // Optical Mouse
    const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.024, 0.10), keyboardMat);
    mouse.position.set(mx + 0.20, 0.835, 0.14);
    mouse.castShadow = true;
    researchDeskGroup.add(mouse);

    // PC Workstation Mid-Tower (sitting under desk)
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.44, 0.44), towerMat);
    tower.position.set(mx, 0.22, -0.12);
    tower.castShadow = true;
    researchDeskGroup.add(tower);

    // Front intake light
    const towerLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.18, 0.005),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.5 })
    );
    towerLight.position.set(mx, 0.26, 0.102);
    researchDeskGroup.add(towerLight);

    // Office lab task stool/chair
    const chairGroup = new THREE.Group();
    chairGroup.position.set(mx, 0, 0.65);
    chairGroup.rotation.y = Math.PI;
    researchDeskGroup.add(chairGroup);

    const chairSeat = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.06, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
    );
    chairSeat.position.y = 0.50;
    chairSeat.castShadow = true;
    chairGroup.add(chairSeat);

    const chairBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.40, 0.36, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 })
    );
    chairBack.position.set(0, 0.72, -0.19);
    chairBack.castShadow = true;
    chairGroup.add(chairBack);

    const chairPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.45, 12),
      brassTrimMaterial
    );
    chairPost.position.y = 0.25;
    chairGroup.add(chairPost);

    const chairBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.28, 0.05, 12),
      monitorBezelMat
    );
    chairBase.position.y = 0.025;
    chairGroup.add(chairBase);
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
  // STATION 10: SOCIETY ORIENTATION KIOSK (Area J)
  // (Student girl model removed on Room 4 only)
  // ==============================================================
  const kioskGroup = new THREE.Group();
  kioskGroup.position.set(5.2, 0, 4.0);
  kioskGroup.rotation.y = -Math.PI / 1.5;
  scene.add(kioskGroup);

  const kioskBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.9, 16), mahoganyDeskMaterial);
  kioskBase.position.y = 0.45;
  kioskBase.castShadow = true;
  kioskBase.receiveShadow = true;
  kioskGroup.add(kioskBase);

  const kioskPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 12), brassTrimMaterial);
  kioskPillar.position.y = 1.0;
  kioskGroup.add(kioskPillar);

  const kioskTop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.46), mahoganyDeskMaterial);
  kioskTop.position.set(0, 1.15, 0);
  kioskTop.rotation.x = -Math.PI / 6;
  kioskTop.castShadow = true;
  kioskGroup.add(kioskTop);

  const kioskScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.02, 0.38),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.35,
      roughness: 0.2,
    })
  );
  kioskScreen.position.set(0, 1.17, 0);
  kioskScreen.rotation.x = -Math.PI / 6;
  kioskGroup.add(kioskScreen);

  registerTarget(kioskTop, {
    id: 'astro-guide',
    activityId: 'guide',
    category: 'ORIENTATION DIRECTORY',
    name: 'Society Orientation Kiosk',
    action: 'VIEW ORIENTATION GUIDE',
    description: 'Welcome to the Astronomical Society Room! Interactive directory and orientation guide for all Room 04 stations.',
  });

  // ==============================================================
  // STATION 11: CLASSICAL CELESTIAL ARMILLARY SPHERE (Area K)
  // ==============================================================
  const armillaryGroup = new THREE.Group();
  armillaryGroup.position.set(4.2, 0, -6.8);
  scene.add(armillaryGroup);

  // Classical fluted mahogany & brass pedestal
  const pedestalBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.48, 0.14, 24),
    mahoganyDeskMaterial
  );
  pedestalBase.position.y = 0.07;
  pedestalBase.castShadow = true;
  armillaryGroup.add(pedestalBase);

  const pedestalColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.28, 0.82, 24),
    mahoganyDeskMaterial
  );
  pedestalColumn.position.y = 0.55;
  pedestalColumn.castShadow = true;
  armillaryGroup.add(pedestalColumn);

  // Brass capital & base collars
  [-0.38, 0.38].forEach((cy) => {
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.29, 0.29, 0.04, 24),
      brassTrimMaterial
    );
    collar.position.y = 0.55 + cy;
    armillaryGroup.add(collar);
  });

  const pedestalCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.42, 0.08, 24),
    mahoganyDeskMaterial
  );
  pedestalCap.position.y = 0.96;
  pedestalCap.castShadow = true;
  pedestalCap.receiveShadow = true;
  armillaryGroup.add(pedestalCap);

  const pedestalBrassRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.015, 12, 36),
    brassTrimMaterial
  );
  pedestalBrassRim.position.y = 0.96;
  pedestalBrassRim.rotation.x = Math.PI / 2;
  armillaryGroup.add(pedestalBrassRim);

  // Brass identification placard
  const armillaryPlacard = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.08, 0.02),
    brassTrimMaterial
  );
  armillaryPlacard.position.set(0, 0.65, 0.26);
  armillaryGroup.add(armillaryPlacard);

  // Brass armillary sphere model (displayed immediately while OBJ loads)
  const armillaryModelGroup = new THREE.Group();
  armillaryModelGroup.position.set(0, 1.48, 0);
  armillaryGroup.add(armillaryModelGroup);

  const antiqueBrassMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.26,
    metalness: 0.92,
  });

  // Base stand & meridian support
  const standBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.06, 24), antiqueBrassMaterial);
  standBase.position.y = -0.48;
  armillaryModelGroup.add(standBase);

  const standPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 16), antiqueBrassMaterial);
  standPillar.position.y = -0.27;
  armillaryModelGroup.add(standPillar);

  // Meridian outer ring (vertical)
  const meridianRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 16, 48), antiqueBrassMaterial);
  armillaryModelGroup.add(meridianRing);

  // Horizon ring (horizontal)
  const horizonRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.022, 16, 48), antiqueBrassMaterial);
  horizonRing.rotation.x = Math.PI / 2;
  armillaryModelGroup.add(horizonRing);

  // Rotating inner celestial sphere
  const innerCelestialGroup = new THREE.Group();
  innerCelestialGroup.rotation.z = (23.5 * Math.PI) / 180; // Earth axial obliquity 23.5°
  armillaryModelGroup.add(innerCelestialGroup);

  // Equator ring
  const equatorRing = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.014, 16, 48), antiqueBrassMaterial);
  equatorRing.rotation.x = Math.PI / 2;
  innerCelestialGroup.add(equatorRing);

  // Ecliptic zodiac band (tilted relative to equator)
  const eclipticRing = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 48, 1, true), antiqueBrassMaterial);
  eclipticRing.rotation.x = (23.5 * Math.PI) / 180;
  innerCelestialGroup.add(eclipticRing);

  // Solstitial and Equinoctial colures
  const colure1 = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.012, 16, 48), antiqueBrassMaterial);
  innerCelestialGroup.add(colure1);

  const colure2 = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.012, 16, 48), antiqueBrassMaterial);
  colure2.rotation.y = Math.PI / 2;
  innerCelestialGroup.add(colure2);

  // Polar axis pin
  const polarAxis = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.92, 12), brassTrimMaterial);
  innerCelestialGroup.add(polarAxis);

  // Central Terrella (miniature Earth globe at center)
  const centralEarth = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.4, metalness: 0.6 })
  );
  innerCelestialGroup.add(centralEarth);

  // Load the authentic Armillary.obj from assets/armillary
  const armillaryObjLoader = new OBJLoader();
  armillaryObjLoader.load(
    '/assets/armillary/Armillary.obj',
    (loadedObj) => {
      while (armillaryModelGroup.children.length > 0) {
        armillaryModelGroup.remove(armillaryModelGroup.children[0]);
      }
      loadedObj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.geometry.center();
          m.material = antiqueBrassMaterial;
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      loadedObj.scale.set(0.00115, 0.00115, 0.00115);
      loadedObj.position.set(0, 0, 0);
      armillaryModelGroup.add(loadedObj);
    },
    undefined,
    (err) => {
      console.warn('Armillary OBJ load note:', err);
    }
  );

  // Spotlight highlighting the Armillary Sphere
  const armillarySpot = new THREE.SpotLight(0xfff1d0, 3.6, 9.0, Math.PI / 4, 0.4, 1.2);
  armillarySpot.position.set(4.2, 4.2, -6.8);
  armillarySpot.target.position.set(4.2, 1.2, -6.8);
  scene.add(armillarySpot);
  scene.add(armillarySpot.target);

  registerTarget(pedestalCap, {
    id: 'astro-armillary',
    activityId: 'virtual_observatory',
    category: 'HISTORICAL INSTRUMENT',
    name: 'Renaissance Armillary Sphere',
    action: 'INSPECT CELESTIAL SPHERE',
    description: 'A classical mechanical model of the celestial sphere. Rings depict the celestial equator, ecliptic plane, tropics, and meridian rings used by ancient and Renaissance astronomers.',
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

    // Rotate 3D Moon gently
    moonGroup.rotation.y += 0.0003;

    // Rotate Armillary Sphere celestial rings gently
    if (typeof armillaryModelGroup !== 'undefined' && armillaryModelGroup) {
      armillaryModelGroup.rotation.y += 0.0012;
    }

    // Animate twinkling landmark stars
    landmarkStars.forEach((star) => {
      const twinkle = 1 + Math.sin(now * 0.001 * star.twinkleSpeed + star.phase) * 0.28;
      star.sprite.scale.set(star.baseScale * twinkle, star.baseScale * twinkle, 1);
    });

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

      // Multi-table collision detection covering all stations in Room 04:
      // Center table, 2 PC research workstation, astrophotography desk,
      // survey desk, orientation kiosk, telescope tripod, and armillary pedestal.
      const checkObstacleCollision = (x: number, z: number): boolean => {
        // 1. Center Solar System table (radius 2.36 + player buffer)
        if (Math.hypot(x - 0, z - (-1.5)) < 2.72) return true;

        // 2. Research Workstation ("2 PC" desk on East wall, center ~ (6.5, -1.5), width 2.3 x depth 0.95)
        if (x >= 5.50 && x <= 7.50 && z >= -2.95 && z <= -0.05) return true;

        // 3. Astrophotography Desk (West wall, center ~ (-6.5, -1.5), width 2.2 x depth 0.9)
        if (x >= -7.50 && x <= -5.50 && z >= -2.95 && z <= -0.05) return true;

        // 4. Membership & Interest Survey table (South-East, center ~ (3.5, 4.2), width 1.8 x depth 0.8)
        if (x >= 2.20 && x <= 4.80 && z >= 3.40 && z <= 5.00) return true;

        // 5. Society Orientation Kiosk (East entrance, center ~ (5.2, 4.0))
        if (x >= 4.20 && x <= 6.20 && z >= 3.00 && z <= 5.00) return true;

        // 6. Observation Telescope tripod (North-West, center ~ (-4.5, -6.5))
        if (Math.hypot(x - (-4.5), z - (-6.5)) < 1.10) return true;

        // 7. Classical Armillary Sphere pedestal (North-East, center ~ (4.2, -6.8))
        if (Math.hypot(x - 4.2, z - (-6.8)) < 1.05) return true;

        return false;
      };

      // Room boundary clamping (-8.3 < X < 8.3, -9.2 < Z < 5.2)
      const nextX = Math.max(-8.3, Math.min(8.3, playerPosition.x + deltaX));
      const nextZ = Math.max(-9.2, Math.min(5.2, playerPosition.z + deltaZ));

      // Attempt full movement or smooth sliding along unobstructed axis
      if (!checkObstacleCollision(nextX, nextZ)) {
        playerPosition.x = nextX;
        playerPosition.z = nextZ;
      } else {
        // Slide along X if X is unobstructed
        if (!checkObstacleCollision(nextX, playerPosition.z)) {
          playerPosition.x = nextX;
        }
        // Slide along Z if Z is unobstructed
        if (!checkObstacleCollision(playerPosition.x, nextZ)) {
          playerPosition.z = nextZ;
        }
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
