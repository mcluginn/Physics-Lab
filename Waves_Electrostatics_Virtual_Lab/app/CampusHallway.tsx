'use client';

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { useEffect, useRef, useState } from 'react';
import { CharacterController, type CharacterType } from './characterController';

type DoorId = 'room-1' | 'room-2' | 'room-3' | 'uphsd-astro';
type DoorInfo = {
  id: DoorId;
  number: string;
  title: string;
  subtitle: string;
  href?: string;
  color: number;
  position: { x: number; y: number; z: number; rotationY: number };
};

const DOORS: DoorInfo[] = [
  {
    id: 'room-1',
    number: '01',
    title: 'Thermal & Fluid Sciences',
    subtitle: '4 experiments · Active',
    href: '/room-1/index.html',
    color: 0x22d3ee,
    position: { x: -4.4, y: 0, z: -11.85, rotationY: 0 },
  },
  {
    id: 'room-2',
    number: '02',
    title: 'Waves, Sound & Fields',
    subtitle: '3 experiments · Active',
    href: '/room-2',
    color: 0xfbbf24,
    position: { x: 0, y: 0, z: -11.85, rotationY: 0 },
  },
  {
    id: 'room-3',
    number: '03',
    title: 'Future Laboratory',
    subtitle: 'Reserved for next course',
    color: 0xa78bfa,
    position: { x: 4.4, y: 0, z: -11.85, rotationY: 0 },
  },
  {
    id: 'uphsd-astro',
    number: '04',
    title: 'Astronomical Society',
    subtitle: 'Explore Beyond the Classroom · Active',
    href: '/room-4',
    color: 0x818cf8,
    position: { x: 6.84, y: 0, z: -0.5, rotationY: -Math.PI / 2 },
  },
];

type HallControls = {
  interact: () => void;
  lock: () => void;
  setMove: (direction: 'forward' | 'backward' | 'left' | 'right', active: boolean) => void;
  toggleView?: () => boolean;
  switchCharacter?: () => CharacterType;
  setCharacter?: (type: CharacterType) => void;
  openDoor?: (door: DoorInfo) => void;
};

export default function CampusHallway() {
  const sceneContainer = useRef<HTMLDivElement>(null);
  const controls = useRef<HallControls | null>(null);
  const [target, setTarget] = useState<DoorInfo | null>(null);
  const [locked, setLocked] = useState(false);
  const [isThirdPerson, setIsThirdPerson] = useState(true);
  const [activeCharacter, setActiveCharacter] = useState<CharacterType>('female');
  const [message, setMessage] = useState('Walk toward a door and press E to enter · V view · C character.');

  useEffect(() => {
    const container = sceneContainer.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a14);
    scene.fog = new THREE.Fog(0x050a14, 14, 34);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 70);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const textureLoader = new THREE.TextureLoader();
    const floorTexture = textureLoader.load('/assets/textures/lab_floor_tiles.jpg');
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(4, 9);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x16253a, roughness: 0.82, metalness: 0.08 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x334b63, roughness: 0.3, metalness: 0.72 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 28), new THREE.MeshStandardMaterial({ map: floorTexture, color: 0x8395a8, roughness: 0.7, metalness: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor Expansion Joint Lines
    [-4.5, 0, 4.5].forEach((x) => {
      const jointX = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 28), trimMaterial);
      jointX.rotation.x = -Math.PI / 2;
      jointX.position.set(x, 0.002, -2);
      scene.add(jointX);
    });

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(14, 28), new THREE.MeshStandardMaterial({ color: 0x08111f, roughness: 0.92 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 4.2, -2);
    scene.add(ceiling);

    // Suspended Ceiling Grid T-Bars
    for (let gx = -6; gx <= 6; gx += 2) {
      const tBarX = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 28), trimMaterial);
      tBarX.position.set(gx, 4.18, -2);
      scene.add(tBarX);
    }
    for (let gz = -14; gz <= 10; gz += 2) {
      const tBarZ = new THREE.Mesh(new THREE.BoxGeometry(14, 0.04, 0.04), trimMaterial);
      tBarZ.position.set(0, 4.18, gz);
      scene.add(tBarZ);
    }

    // Left Corridor Wall (Continuous, 4.2m height)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.2, 28), wallMaterial);
    leftWall.position.set(-7, 2.1, -2);
    scene.add(leftWall);
    const leftBaseboard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 28), trimMaterial);
    leftBaseboard.position.set(-7, 0.08, -2);
    scene.add(leftBaseboard);
    const leftConduit = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0x243b55, metalness: 0.8, roughness: 0.3 }));
    leftConduit.position.set(-7, 1.0, -2);
    scene.add(leftConduit);

    // Right Corridor Wall with architectural doorway for UPHSD - Astronomical Society at Z = -0.5
    // Door opening: width 2.8m (Z from -1.9 to +0.9), height 3.38m
    // 1. North section: Z = -16 to -1.9 (length 14.1m, center Z = -8.95)
    const rightWallNorth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.2, 14.1), wallMaterial);
    rightWallNorth.position.set(7, 2.1, -8.95);
    scene.add(rightWallNorth);
    const rightBaseboardNorth = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 14.1), trimMaterial);
    rightBaseboardNorth.position.set(7, 0.08, -8.95);
    scene.add(rightBaseboardNorth);
    const rightConduitNorth = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 14.1), new THREE.MeshStandardMaterial({ color: 0x243b55, metalness: 0.8, roughness: 0.3 }));
    rightConduitNorth.position.set(7, 1.0, -8.95);
    scene.add(rightConduitNorth);

    // 2. South section: Z = +0.9 to +12 (length 11.1m, center Z = +6.45)
    const rightWallSouth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.2, 11.1), wallMaterial);
    rightWallSouth.position.set(7, 2.1, 6.45);
    scene.add(rightWallSouth);
    const rightBaseboardSouth = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 11.1), trimMaterial);
    rightBaseboardSouth.position.set(7, 0.08, 6.45);
    scene.add(rightBaseboardSouth);
    const rightConduitSouth = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 11.1), new THREE.MeshStandardMaterial({ color: 0x243b55, metalness: 0.8, roughness: 0.3 }));
    rightConduitSouth.position.set(7, 1.0, 6.45);
    scene.add(rightConduitSouth);

    // 3. Header wall lintel above right door (Y = 3.38 to 4.20, height 0.82m, length 2.8m, center Z = -0.5)
    const rightWallHeader = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.82, 2.8), wallMaterial);
    rightWallHeader.position.set(7, 3.38 + 0.41, -0.5);
    scene.add(rightWallHeader);

    // 4. Exterior architectural alcove surround / shadowbox for Astronomical Society
    const rightAlcoveBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 3.5, 3.2),
      new THREE.MeshStandardMaterial({ color: 0x050a14, roughness: 0.95 })
    );
    rightAlcoveBox.position.set(7.8, 1.75, -0.5);
    scene.add(rightAlcoveBox);

    // North End Wall with architecturally precise doorway openings for Room 01, Room 02, and Room 03
    // Opening width per door: 2.54m, Opening height: 3.38m
    const wallZ = -12;
    const wallThick = 0.34;
    const doorOpeningH = 3.38;

    // 1. Header wall lintel spanning above all three doors (Y = 3.38m to 4.20m)
    const headerHeight = 4.2 - doorOpeningH;
    const endWallHeader = new THREE.Mesh(new THREE.BoxGeometry(14, headerHeight, wallThick), wallMaterial);
    endWallHeader.position.set(0, doorOpeningH + headerHeight / 2, wallZ);
    scene.add(endWallHeader);

    // 2. Pier and side wall segments between/around the three doorways
    const wallSections = [
      { x: -6.335, width: 1.33 }, // Far left wall
      { x: -2.20, width: 1.86 },  // Pier between Door 1 (x=-4.4) and Door 2 (x=0)
      { x: 2.20, width: 1.86 },   // Pier between Door 2 (x=0) and Door 3 (x=4.4)
      { x: 6.335, width: 1.33 },  // Far right wall
    ];

    wallSections.forEach(({ x, width }) => {
      const section = new THREE.Mesh(new THREE.BoxGeometry(width, doorOpeningH, wallThick), wallMaterial);
      section.position.set(x, doorOpeningH / 2, wallZ);
      scene.add(section);

      const sectionBaseboard = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, 0.38), trimMaterial);
      sectionBaseboard.position.set(x, 0.08, wallZ);
      scene.add(sectionBaseboard);
    });

    const entranceWall = new THREE.Mesh(new THREE.BoxGeometry(14, 4.2, 0.34), wallMaterial);
    entranceWall.position.set(0, 2.1, 12);
    scene.add(entranceWall);

    // Wall Utility & Safety Panels on side walls
    [-4, 2, 8].forEach((z) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.35 }));
      panel.position.set(-6.8, 1.8, z);
      scene.add(panel);
    });

    scene.add(new THREE.HemisphereLight(0xb8dcff, 0x101827, 1.65));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
    keyLight.position.set(4, 7, 7);
    keyLight.castShadow = true;
    scene.add(keyLight);
    [-8, -2, 4, 10].forEach((z, index) => {
      const fixtureHousing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 }));
      fixtureHousing.position.set(0, 4.14, z);
      scene.add(fixtureHousing);

      const fixtureMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: index % 2 ? 0x92ddff : 0xffe0a3, emissiveIntensity: 1.25 });
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 0.55), fixtureMaterial);
      fixture.position.set(0, 4.08, z);
      scene.add(fixture);
      const light = new THREE.PointLight(index % 2 ? 0x8adfff : 0xffd28a, 5.0, 9, 2);
      light.position.set(0, 3.8, z);
      scene.add(light);
    });

    const doorObjects: THREE.Object3D[] = [];
    const doorInfoByObject = new Map<THREE.Object3D, DoorInfo>();
    interface DoorGlowItem {
      material: THREE.MeshStandardMaterial;
      doorId: DoorId;
      baseIntensity: number;
    }
    const doorGlows: DoorGlowItem[] = [];

    // High-resolution textures for the 3D Entrance Door Asset
    const fbxLoader = new FBXLoader();
    const mahoganyTex = textureLoader.load('/assets/door/maps/Entrance_Door_the mahogany.jpg');
    mahoganyTex.colorSpace = THREE.SRGBColorSpace;
    mahoganyTex.wrapS = THREE.RepeatWrapping;
    mahoganyTex.wrapT = THREE.RepeatWrapping;

    const lightBrassTex = textureLoader.load('/assets/door/maps/Entrance_Door_light brass.jpg');
    lightBrassTex.colorSpace = THREE.SRGBColorSpace;

    const darkBrassTex = textureLoader.load('/assets/door/maps/Entrance_Door_dark brass.jpg');
    darkBrassTex.colorSpace = THREE.SRGBColorSpace;

    const mahoganyMat = new THREE.MeshStandardMaterial({
      map: mahoganyTex,
      color: 0x823b1c,
      roughness: 0.38,
      metalness: 0.06,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      map: lightBrassTex,
      color: 0xf5d372,
      roughness: 0.28,
      metalness: 0.88,
    });

    const darkBrassMat = new THREE.MeshStandardMaterial({
      map: darkBrassTex,
      color: 0xb58b44,
      roughness: 0.45,
      metalness: 0.82,
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.24,
      metalness: 0.92,
    });

    const applyDoorMaterials = (model: THREE.Object3D) => {
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          const remap = (mat: THREE.Material): THREE.Material => {
            const name = (mat.name || '').toLowerCase();
            if (name.includes('brass') || name.includes('gold')) {
              return name.includes('antique') || name.includes('dark') ? darkBrassMat : brassMat;
            }
            if (name.includes('steel') || name.includes('metal') || name.includes('960')) {
              return steelMat;
            }
            return mahoganyMat;
          };

          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(remap);
          } else if (mesh.material) {
            mesh.material = remap(mesh.material);
          }
        }
      });
    };

    const createEngravedWoodSignTexture = (door: DoorInfo): THREE.CanvasTexture => {
      const canvas = document.createElement('canvas');
      canvas.width = 2048;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return new THREE.CanvasTexture(canvas);

      // 1. Base Mahogany Wood Gradient (Rich, dark, deep tones matching double doors)
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
      // Natural wood pores
      for (let i = 0; i < 400; i++) {
        const rx = ((i * 137) % 2000) + 24;
        const ry = ((i * 73) % 490) + 11;
        const rlen = 6 + ((i * 31) % 18);
        ctx.fillStyle = 'rgba(15, 4, 1, 0.25)';
        ctx.fillRect(rx, ry, rlen, 1.2);
      }
      ctx.restore();

      // 3. Beveled Carved Molding Frame (Outer debossed groove + aged brass beading)
      ctx.save();
      // Outer carved shadow line
      ctx.strokeStyle = 'rgba(10, 3, 1, 0.95)';
      ctx.lineWidth = 6;
      ctx.strokeRect(26, 22, 1996, 468);

      // Lower bevel highlight lip
      ctx.strokeStyle = 'rgba(130, 55, 24, 0.65)';
      ctx.lineWidth = 3;
      ctx.strokeRect(28, 24, 1992, 466);

      // Inlaid aged brass beading border
      const brassBorderGrad = ctx.createLinearGradient(0, 36, 0, 476);
      brassBorderGrad.addColorStop(0.0, '#e8ca7e');
      brassBorderGrad.addColorStop(0.5, '#c59a42');
      brassBorderGrad.addColorStop(1.0, '#75521a');
      ctx.strokeStyle = brassBorderGrad;
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 36, 1968, 440);

      // Classical Brass Corner Accents / Rosettes
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
      // 4-pass carved depth: lower-lip highlight, deep inner shadow, wall shade, gold-leaf core
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

        // Pass 1: Chiseled bottom-edge lip highlight (light catching the bottom bevel)
        ctx.fillStyle = isPrimaryGold ? 'rgba(255, 230, 160, 0.55)' : 'rgba(135, 62, 28, 0.48)';
        ctx.fillText(text, x, y + depth * 0.7);

        // Pass 2: Deep engraved top-edge cast shadow (shadow inside the carved trough)
        ctx.fillStyle = 'rgba(7, 2, 1, 0.98)';
        ctx.fillText(text, x, y - depth);
        ctx.fillText(text, x - 1, y - depth * 0.75);

        // Pass 3: Intermediate groove wall tone
        ctx.fillStyle = 'rgba(18, 5, 2, 0.85)';
        ctx.fillText(text, x, y - depth * 0.4);

        // Pass 4: Inlay core (burnished gold leaf or warm aged brass)
        if (isPrimaryGold) {
          const goldGrad = ctx.createLinearGradient(0, y - fontSize * 0.5, 0, y + fontSize * 0.5);
          goldGrad.addColorStop(0.0, '#fae8a8'); // light gold top facet
          goldGrad.addColorStop(0.35, '#d6ad44'); // warm rich gold
          goldGrad.addColorStop(0.70, '#b8860b'); // burnished deep gold
          goldGrad.addColorStop(1.0, '#855c0c'); // bottom shadow facet
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

      // Line 1: University & Department Header
      const headerText = door.id === 'uphsd-astro'
        ? 'UNIVERSITY OF PERPETUAL HELP SYSTEM DALTA'
        : 'DEPARTMENT OF PHYSICS   ·   EXPERIMENTAL SCIENCES';
      drawCarvedText(
        headerText,
        1024,
        105,
        '700 28px Georgia, "Times New Roman", serif',
        28,
        false
      );

      // Line 2: Room Number & Laboratory / Society Name (Gilded intaglio)
      const roomTitle = door.id === 'uphsd-astro'
        ? 'ROOM 04   ·   UPHSD ASTRONOMICAL SOCIETY'
        : `ROOM ${door.number}   ·   ${door.title.toUpperCase()}`;
      drawCarvedText(
        roomTitle,
        1024,
        250,
        door.id === 'uphsd-astro' ? '800 48px Georgia, "Times New Roman", serif' : '800 58px Georgia, "Times New Roman", serif',
        door.id === 'uphsd-astro' ? 48 : 58,
        true
      );

      // Line 3: Laboratory / Society Status
      const statusText = door.id === 'uphsd-astro'
        ? '✦   STUDENT DISCOVERY ROOM & OBSERVATORY   ·   PRESS [E] TO ENTER   ✦'
        : door.href
        ? '✦   ACTIVE RESEARCH LABORATORY   ·   PRESS [E] TO ENTER   ✦'
        : '✧   RESERVED FOR UPCOMING SEMESTER COURSES   ✧';
      drawCarvedText(
        statusText,
        1024,
        395,
        '700 30px Georgia, "Times New Roman", serif',
        30,
        false
      );

      // Golden Celestial Stars on the plaque for UPHSD Astronomical Society
      if (door.id === 'uphsd-astro') {
        const drawCelestialStar = (cx: number, cy: number, r: number) => {
          ctx.save();
          ctx.fillStyle = '#fce7a1';
          ctx.shadowColor = '#d6ad44';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            const radius = i % 2 === 0 ? r : r * 0.42;
            const px = cx + Math.cos(angle) * radius;
            const py = cy + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        };
        drawCelestialStar(220, 250, 26);
        drawCelestialStar(1828, 250, 26);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    interface DoorAnimState {
      door: DoorInfo;
      leftLeaf: THREE.Mesh | null;
      rightLeaf: THREE.Mesh | null;
      terminalLED: THREE.Mesh | null;
      transomSignMat: THREE.MeshStandardMaterial | null;
      currentAngle: number;
      targetAngle: number;
      isOpen: boolean;
      isOpening: boolean;
      onOpenedCallback: (() => void) | null;
    }
    const doorAnimStates = new Map<DoorId, DoorAnimState>();

    const doorGroups: THREE.Group[] = [];

    DOORS.forEach((door) => {
      const group = new THREE.Group();
      group.name = `DoorGroup_${door.id}`;
      group.position.set(door.position.x, door.position.y, door.position.z);
      group.rotation.y = door.position.rotationY;
      doorGroups.push(group);
      scene.add(group);

      // Deep pitch-black doorway interior cavity / void behind the door
      const blackPortal = new THREE.Mesh(
        new THREE.BoxGeometry(2.54, 3.38, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
      );
      blackPortal.position.set(0, 1.69, -0.60);
      group.add(blackPortal);

      // Starry observatory void for UPHSD Astronomical Society
      if (door.id === 'uphsd-astro') {
        const starCount = 120;
        const starGeo = new THREE.BufferGeometry();
        const starPositions = new Float32Array(starCount * 3);
        const starColors = new Float32Array(starCount * 3);
        const palette = [
          new THREE.Color(0xa78bfa), // celestial purple
          new THREE.Color(0x38bdf8), // starlight cyan
          new THREE.Color(0xfef08a), // warm gold
          new THREE.Color(0xffffff), // pure white
        ];
        for (let i = 0; i < starCount; i++) {
          starPositions[i * 3 + 0] = (Math.random() - 0.5) * 2.2;
          starPositions[i * 3 + 1] = Math.random() * 3.0 + 0.2;
          starPositions[i * 3 + 2] = -0.15 - Math.random() * 0.9;
          const col = palette[Math.floor(Math.random() * palette.length)];
          starColors[i * 3 + 0] = col.r;
          starColors[i * 3 + 1] = col.g;
          starColors[i * 3 + 2] = col.b;
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
        const starMat = new THREE.PointsMaterial({
          size: 0.035,
          vertexColors: true,
          transparent: true,
          opacity: 0.95,
        });
        const stars = new THREE.Points(starGeo, starMat);
        group.add(stars);
      }

      // Black doorway threshold floor extension into the dark room void
      const blackFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(2.54, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })
      );
      blackFloor.rotation.x = -Math.PI / 2;
      blackFloor.position.set(0, 0.001, -0.60);
      group.add(blackFloor);

      // Pitch-black doorway backdrop plane right behind the door leaves
      const blackBackdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(2.54, 3.38),
        new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })
      );
      blackBackdrop.position.set(0, 1.69, -0.01);
      group.add(blackBackdrop);

      // Architectural Polished Brass Threshold Plate
      const threshold = new THREE.Mesh(
        new THREE.BoxGeometry(2.92, 0.016, 0.28),
        brassMat
      );
      threshold.position.set(0, 0.008, 0.18);
      group.add(threshold);

      // Subtle Floor Inlaid Brass Beading Line
      const brassInlay = new THREE.Mesh(
        new THREE.PlaneGeometry(2.86, 0.035),
        darkBrassMat
      );
      brassInlay.rotation.x = -Math.PI / 2;
      brassInlay.position.set(0, 0.003, 0.36);
      group.add(brassInlay);

      // Overhead Engraved Mahogany Laboratory Transom Sign
      const signTexture = createEngravedWoodSignTexture(door);
      const signMat = new THREE.MeshStandardMaterial({
        map: signTexture,
        roughness: 0.38,
        metalness: 0.06,
        emissive: door.id === 'uphsd-astro' ? 0x24143a : 0x221204,
        emissiveIntensity: 0.0,
      });
      doorGlows.push({ material: signMat, doorId: door.id, baseIntensity: 0.0 });

      // 1. Engraved Wood Plaque Center Board
      const signBoard = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.72, 0.06), signMat);
      signBoard.position.set(0, 3.75, 0.12);
      group.add(signBoard);

      // 2. Surrounding Solid Mahogany Molding Frame
      const signOuterFrame = new THREE.Mesh(
        new THREE.BoxGeometry(2.96, 0.84, 0.10),
        mahoganyMat
      );
      signOuterFrame.position.set(0, 3.75, 0.08);
      group.add(signOuterFrame);

      // 3. Inset Antique Brass Molding Trim
      const signInnerTrim = new THREE.Mesh(
        new THREE.BoxGeometry(2.88, 0.76, 0.08),
        darkBrassMat
      );
      signInnerTrim.position.set(0, 3.75, 0.09);
      group.add(signInnerTrim);

      // 4. Classical Crown Molding Cornice Header
      const cornice = new THREE.Mesh(
        new THREE.BoxGeometry(3.04, 0.10, 0.18),
        mahoganyMat
      );
      cornice.position.set(0, 4.21, 0.12);
      group.add(cornice);

      const corniceBrassRail = new THREE.Mesh(
        new THREE.BoxGeometry(3.00, 0.025, 0.19),
        brassMat
      );
      corniceBrassRail.position.set(0, 4.16, 0.13);
      group.add(corniceBrassRail);

      // 5. Overhead Gallery Picture Lamp / Transom Luminaire
      const luminaireGroup = new THREE.Group();
      luminaireGroup.position.set(0, 4.25, 0.18);

      const lampHood = new THREE.Mesh(
        new THREE.BoxGeometry(1.60, 0.045, 0.08),
        brassMat
      );
      lampHood.position.set(0, 0, 0.14);
      luminaireGroup.add(lampHood);

      [-0.45, 0.45].forEach((armX) => {
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.010, 0.010, 0.18),
          brassMat
        );
        arm.rotation.x = Math.PI / 4;
        arm.position.set(armX, 0, 0.07);
        luminaireGroup.add(arm);
      });
      group.add(luminaireGroup);

      // Warm directional transom spotlight illuminating the engraved wood sign
      const transomSpot = new THREE.SpotLight(0xfff1d6, 2.4, 5.0, Math.PI / 3, 0.4, 1.6);
      transomSpot.position.set(0, 4.25, 0.35);
      transomSpot.target = signBoard;
      group.add(transomSpot);

      // Wall Keypad / Digital Access Terminal at right jamb
      const terminalGroup = new THREE.Group();
      terminalGroup.position.set(1.65, 1.55, 0.06);
      const terminalBack = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.44, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 })
      );
      terminalGroup.add(terminalBack);
      const ledColor = door.id === 'uphsd-astro' ? 0xa855f7 : door.href ? 0x10b981 : 0xf59e0b;
      const terminalLED = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 12, 12),
        new THREE.MeshBasicMaterial({ color: ledColor })
      );
      terminalLED.position.set(0, 0.14, 0.03);
      terminalGroup.add(terminalLED);
      group.add(terminalGroup);

      // Register door animation tracking state
      doorAnimStates.set(door.id, {
        door,
        leftLeaf: null,
        rightLeaf: null,
        terminalLED,
        transomSignMat: signMat,
        currentAngle: 0,
        targetAngle: 0,
        isOpen: false,
        isOpening: false,
        onOpenedCallback: null,
      });

      // Door Sconce Spotlight
      const sconceColor = door.id === 'uphsd-astro' ? 0xddd6fe : door.href ? 0xfff4e0 : 0xe2e8f0;
      const sconceLight = new THREE.SpotLight(sconceColor, 4.2, 6, Math.PI / 4, 0.4, 1.5);
      sconceLight.position.set(0, 4.1, 0.70);
      sconceLight.target = threshold;
      group.add(sconceLight);

      // Register interactive hit targets
      doorObjects.push(signBoard, threshold);
      doorInfoByObject.set(signBoard, door);
      doorInfoByObject.set(threshold, door);
    });

    // Load the 3D double door FBX asset and attach to each doorway
    fbxLoader.load(
      '/assets/door/export/Entrance_Door__vray.fbx',
      (doorFbx) => {
        applyDoorMaterials(doorFbx);
        doorFbx.scale.setScalar(0.016);

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

        DOORS.forEach((door, index) => {
          const doorClone = doorFbx.clone(true);
          doorClone.name = `Entrance_Door_${door.id}`;
          doorClone.position.set(0, 0, 0);

          const leftLeaf = doorClone.getObjectByName('Entrance_Door_002') as THREE.Mesh | null;
          const rightLeaf = doorClone.getObjectByName('Entrance_Door_003') as THREE.Mesh | null;

          const anim = doorAnimStates.get(door.id);
          if (anim) {
            anim.leftLeaf = leftLeaf;
            anim.rightLeaf = rightLeaf;
          }

          doorClone.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              doorObjects.push(child);
              doorInfoByObject.set(child, door);
            }
          });

          doorGroups[index].add(doorClone);
        });
      },
      undefined,
      (err) => console.error('Error loading entrance door FBX asset:', err)
    );

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

    const openDoorAnimation = (door: DoorInfo, onOpened?: () => void) => {
      const anim = doorAnimStates.get(door.id);
      if (!anim) {
        onOpened?.();
        return;
      }
      anim.isOpening = true;
      anim.isOpen = true;
      anim.targetAngle = Math.PI / 2 * 0.88; // 79 degrees open
      anim.onOpenedCallback = onOpened ?? null;
      if (anim.terminalLED) {
        (anim.terminalLED.material as THREE.MeshBasicMaterial).color.setHex(0x10b981);
      }
      playDoorSound(true);
    };

    const closeDoorAnimation = (door: DoorInfo) => {
      const anim = doorAnimStates.get(door.id);
      if (!anim) return;
      anim.isOpening = false;
      anim.isOpen = false;
      anim.targetAngle = 0;
      anim.onOpenedCallback = null;
      if (anim.terminalLED) {
        (anim.terminalLED.material as THREE.MeshBasicMaterial).color.setHex(door.href ? 0x10b981 : 0xf59e0b);
      }
      playDoorSound(false);
    };

    const player = new THREE.Vector3(0, 1.70, 8.8);
    let yaw = 0;
    let pitch = -0.04;
    const movement = { forward: false, backward: false, left: false, right: false, shift: false };
    let currentDoor: DoorInfo | null = null;
    let currentDoorId = '';
    let lastTime = performance.now();
    const raycaster = new THREE.Raycaster();

    const character = new CharacterController({
      scene,
      floorY: 0,
      initialPosition: player,
      initialYaw: yaw,
      defaultCharacter: 'female',
      allowThirdPerson: true,
      defaultThirdPerson: true,
      onCharacterChanged: (type) => setActiveCharacter(type),
    });
    setActiveCharacter(character.activeCharacter);

    const updateCamera = () => {
      character.updateCamera(camera, player, yaw, pitch);
    };
    updateCamera();

    const enterDoor = (doorToEnter?: DoorInfo) => {
      const targetDoor = doorToEnter || currentDoor;
      if (!targetDoor) return;

      const anim = doorAnimStates.get(targetDoor.id);
      if (anim && anim.isOpening) return; // already in motion

      if (targetDoor.href) {
        setMessage(`Opening Room ${targetDoor.number}... Welcome to ${targetDoor.title}.`);
        openDoorAnimation(targetDoor, () => {
          window.location.assign(targetDoor.href!);
        });
      } else {
        // Reserved room or UPHSD Astronomical Society coming soon
        if (anim && !anim.isOpen) {
          if (targetDoor.id === 'uphsd-astro') {
            setMessage('🔭 UPHSD - Astronomical Society: Observatory & Space Science Society room is coming soon!');
          } else {
            setMessage(`Room ${targetDoor.number} opened. Notice: Reserved for upcoming semester courses.`);
          }
          openDoorAnimation(targetDoor, () => {
            setTimeout(() => {
              closeDoorAnimation(targetDoor);
              setMessage('Walk toward a door and press E to enter · V view · C character.');
            }, 3200);
          });
        } else if (anim && anim.isOpen) {
          closeDoorAnimation(targetDoor);
          setMessage(`${targetDoor.title} door closed.`);
        }
      }
    };
    const requestWalkMode = () => {
      const lockRequest = renderer.domElement.requestPointerLock();
      // Chromium returns a rejected promise when pointer lock is unavailable
      // (for example in an embedded preview). Keep the hallway playable with
      // the directory/mobile controls instead of surfacing an unhandled error.
      if (lockRequest && typeof (lockRequest as Promise<void>).catch === 'function') {
        void (lockRequest as Promise<void>).catch(() => {
          setMessage('Walk mode is unavailable here. Use the room directory or touch controls to continue.');
          setLocked(false);
        });
      }
    };
    const updateTarget = () => {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hit = raycaster.intersectObjects(doorObjects, false).find((entry) => entry.distance < 6.5);
      const next = hit ? doorInfoByObject.get(hit.object) ?? null : null;
      if ((next?.id ?? '') !== currentDoorId) {
        currentDoor = next;
        currentDoorId = next?.id ?? '';
        setTarget(next);
      }
    };
    const updateMovement = (time: number) => {
      const delta = Math.min((time - lastTime) / 1000, 0.08);
      lastTime = time;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const direction = new THREE.Vector3();
      if (movement.forward) direction.add(forward);
      if (movement.backward) direction.sub(forward);
      if (movement.left) direction.sub(right);
      if (movement.right) direction.add(right);
      if (direction.lengthSq() > 0) {
        // Calibrated walking pace in third-person:
        // Normal walk: 1.25 m/s (natural indoor university hallway pace, grounded zero-skate kinematics)
        // Sprint (holding Shift): 2.85 m/s (athletic jog down corridor)
        const walkSpeed = movement.shift ? 2.85 : 1.25;
        direction.normalize().multiplyScalar(delta * walkSpeed);
        player.x = THREE.MathUtils.clamp(player.x + direction.x, -6.1, 6.1);
        player.z = THREE.MathUtils.clamp(player.z + direction.z, -10.25, 10.5);
      }
      character.update(delta, player, direction, yaw, pitch, camera, movement.shift);
    };

    const resize = () => {
      const width = Math.max(1, container.clientWidth); const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(doorObjects, false).find((e) => e.distance < 16.0);
      if (hit) {
        const clickedDoor = doorInfoByObject.get(hit.object);
        if (clickedDoor) {
          enterDoor(clickedDoor);
          return;
        }
      }
      if (document.pointerLockElement !== renderer.domElement) requestWalkMode(); else enterDoor();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= event.movementX * 0.0022;
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -1.2, 1.2);
      updateCamera();
    };
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (!isLocked) movement.forward = movement.backward = movement.left = movement.right = movement.shift = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyW' || event.code === 'ArrowUp') movement.forward = true;
      if (event.code === 'KeyS' || event.code === 'ArrowDown') movement.backward = true;
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') movement.left = true;
      if (event.code === 'KeyD' || event.code === 'ArrowRight') movement.right = true;
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') movement.shift = true;
      if (event.code === 'KeyE') { event.preventDefault(); enterDoor(); }
      if (event.code === 'KeyV') {
        const is3rd = character.toggleView();
        setIsThirdPerson(is3rd);
        setMessage(is3rd ? 'Switched to Third-Person View (Press V to toggle).' : 'Switched to First-Person View (Press V to toggle).');
      }
      if (event.code === 'KeyC') {
        const next = character.switchCharacter();
        setActiveCharacter(next);
        setMessage(next === 'female' ? 'Switched character to Female (Carla). Press C to switch.' : 'Switched character to Male (Eric). Press C to switch.');
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyW' || event.code === 'ArrowUp') movement.forward = false;
      if (event.code === 'KeyS' || event.code === 'ArrowDown') movement.backward = false;
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') movement.left = false;
      if (event.code === 'KeyD' || event.code === 'ArrowRight') movement.right = false;
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') movement.shift = false;
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let frame = 0;
    let prevAnimTime = performance.now();
    const clock = new THREE.Clock();
    const animate = (time = performance.now()) => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min((time - prevAnimTime) / 1000, 0.1);
      prevAnimTime = time;

      // Animate double door leaves opening/closing smoothly
      doorAnimStates.forEach((anim) => {
        if (Math.abs(anim.currentAngle - anim.targetAngle) > 0.0005) {
          anim.currentAngle = THREE.MathUtils.lerp(anim.currentAngle, anim.targetAngle, delta * 4.5);
          if (anim.leftLeaf) anim.leftLeaf.rotation.z = -anim.currentAngle;
          if (anim.rightLeaf) anim.rightLeaf.rotation.z = anim.currentAngle;
          if (anim.transomSignMat) {
            anim.transomSignMat.emissiveIntensity = THREE.MathUtils.lerp(
              anim.transomSignMat.emissiveIntensity,
              anim.targetAngle > 0.1 ? 0.08 : 0.0,
              delta * 4.0
            );
          }
          if (Math.abs(anim.currentAngle - anim.targetAngle) < 0.02 && anim.targetAngle > 0.1 && anim.onOpenedCallback) {
            const cb = anim.onOpenedCallback;
            anim.onOpenedCallback = null;
            cb();
          }
        }
      });

      updateMovement(time); updateTarget();
      const elapsed = clock.getElapsedTime();
      doorGlows.forEach(({ material, doorId, baseIntensity }, index) => {
        const isTarget = currentDoorId === doorId;
        // Warm subtle wood luster when player focuses on the door (zero neon glow)
        material.emissiveIntensity = baseIntensity + (isTarget ? 0.08 : 0.0) + Math.sin(elapsed * 1.5 + index) * 0.01;
      });
      renderer.render(scene, camera);
    };
    animate();

    controls.current = {
      interact: enterDoor,
      openDoor: (door: DoorInfo) => enterDoor(door),
      lock: requestWalkMode,
      setMove: (direction, active) => { movement[direction] = active; },
      toggleView: () => {
        const is3rd = character.toggleView();
        setIsThirdPerson(is3rd);
        return is3rd;
      },
      switchCharacter: () => {
        const next = character.switchCharacter();
        setActiveCharacter(next);
        setMessage(next === 'female' ? 'Active character: Female (Carla). Press C to switch.' : 'Active character: Male (Eric). Press C to switch.');
        return next;
      },
      setCharacter: (type: CharacterType) => {
        character.setCharacter(type);
        setActiveCharacter(type);
        setMessage(type === 'female' ? 'Active character: Female (Carla). Press C to switch.' : 'Active character: Male (Eric). Press C to switch.');
      },
    };
    return () => {
      cancelAnimationFrame(frame); resizeObserver.disconnect();
      character.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => { material.map?.dispose(); material.dispose(); }); } });
      floorTexture.dispose(); renderer.dispose(); container.replaceChildren(); controls.current = null;
    };
  }, []);

  const goTo = (door: DoorInfo) => {
    if (controls.current?.openDoor) {
      controls.current.openDoor(door);
    } else if (door.href) {
      window.location.assign(door.href);
    } else if (door.id === 'uphsd-astro') {
      setMessage('🔭 UPHSD - Astronomical Society: Observatory & Space Science Lab is currently under construction. Coming soon!');
    } else {
      setMessage('Room 03 is reserved for the next group of experiments.');
    }
  };

  return (
    <main className="hallway-shell">
      <div ref={sceneContainer} className="hallway-scene" aria-label="Walkable Physics University laboratory hallway" />
      <div className="hallway-vignette" aria-hidden="true" />
      <div className={`hallway-reticle ${target ? 'active' : ''}`} aria-hidden="true">+</div>
      <header className="hallway-header">
        <div className="campus-brand">
          <span>λ</span>
          <div>
            <b>Physics University</b>
            <small>Experimental Sciences Building · Laboratory Hall</small>
          </div>
        </div>
        <div className="character-header-pillbox" style={{ pointerEvents: 'auto' }}>
          <span className="character-header-title">CHOOSE CHARACTER:</span>
          <button
            type="button"
            className={`character-pill-btn ${activeCharacter === 'female' ? 'selected' : ''}`}
            onClick={() => controls.current?.setCharacter?.('female')}
          >
            👩 Female (Carla)
          </button>
          <button
            type="button"
            className={`character-pill-btn ${activeCharacter === 'male' ? 'selected' : ''}`}
            onClick={() => controls.current?.setCharacter?.('male')}
          >
            👨 Male (Eric)
          </button>
        </div>
        <div className="hallway-status"><i />2 ACTIVE LABS · UPHSD ASTRONOMICAL SOCIETY (COMING SOON)</div>
      </header>
      <section className="hallway-welcome"><span>VIRTUAL CAMPUS · LEVEL 02</span><h1>Laboratory hallway</h1><p>{target ? `Room ${target.number}: ${target.title}` : message}</p></section>
      {!locked && (
        <button className="hallway-enter" onClick={() => controls.current?.lock()}>
          <b>ENTER WALK MODE</b>
          <span>Click to explore hallway · WASD walk · Mouse look</span>
        </button>
      )}

      {/* Persistent Character Gender Selector Dock */}
      <div className="hallway-character-dock">
        <div className="dock-gender-section">
          <span className="dock-title">GENDER:</span>
          <div className="dock-btn-group">
            <button
              type="button"
              className={`dock-character-btn ${activeCharacter === 'female' ? 'active' : ''}`}
              onClick={() => controls.current?.setCharacter?.('female')}
            >
              <span className="dock-avatar">👩</span>
              <span className="dock-label"><b>Female</b><small>Carla (3D Rigged)</small></span>
              {activeCharacter === 'female' && <span className="dock-badge">ACTIVE</span>}
            </button>
            <button
              type="button"
              className={`dock-character-btn ${activeCharacter === 'male' ? 'active' : ''}`}
              onClick={() => controls.current?.setCharacter?.('male')}
            >
              <span className="dock-avatar">👨</span>
              <span className="dock-label"><b>Male</b><small>Eric (3D Rigged)</small></span>
              {activeCharacter === 'male' && <span className="dock-badge">ACTIVE</span>}
            </button>
          </div>
        </div>
        <div className="dock-divider" />
        <button
          type="button"
          className="dock-view-btn"
          onClick={() => controls.current?.toggleView?.()}
          title="Toggle camera view between 3rd person and 1st person (Key V)"
        >
          <span>📷</span>
          <b>{isThirdPerson ? '3rd Person' : '1st Person'}</b>
          <small>Key V</small>
        </button>
      </div>
      {target && <div className={`hallway-door-prompt ${target.href ? '' : 'reserved'}`}><span>ROOM {target.number}</span><b>{target.title}</b><small>{target.subtitle}</small><button onClick={() => goTo(target)}>{target.href ? 'ENTER ROOM' : 'COMING SOON'}</button></div>}
      <nav className="hallway-directory" aria-label="Laboratory room directory">{DOORS.map((door) => <button key={door.id} className={target?.id === door.id ? 'active' : ''} onClick={() => goTo(door)}><span>{door.number}</span><div><b>{door.title}</b><small>{door.subtitle}</small></div></button>)}</nav>
      <div className="hallway-mobile-controls"><div><button onPointerDown={() => controls.current?.setMove('forward', true)} onPointerUp={() => controls.current?.setMove('forward', false)}>▲</button><button onPointerDown={() => controls.current?.setMove('left', true)} onPointerUp={() => controls.current?.setMove('left', false)}>◀</button><button onPointerDown={() => controls.current?.setMove('backward', true)} onPointerUp={() => controls.current?.setMove('backward', false)}>▼</button><button onPointerDown={() => controls.current?.setMove('right', true)} onPointerUp={() => controls.current?.setMove('right', false)}>▶</button></div><button onClick={() => controls.current?.interact()} disabled={!target}>ENTER</button></div>
    </main>
  );
}
