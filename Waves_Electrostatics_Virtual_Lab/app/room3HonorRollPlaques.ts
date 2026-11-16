import * as THREE from 'three';
import type { EquipmentInteraction } from './room3Scene';

export const ROOM3_HONOR_ROLL_PART_1: readonly string[] = [
  'ABERDE, NOMEL ACE C.',
  'AGUILA, KIM CYRUS C.',
  'ALCOZER, PAUL ADRIAN R.',
  'ALGIRE, JEROME DAVE D.',
  'ALMORO, AERON JAMES P.',
  'ASI, JOSH EROLD G.',
  'CANA, AARON JAY C.',
  'CAYAYAN, LANCE RUSSEL S.',
  'CONTRERAS, CHAUNCEY DRE M.',
  'DELA VIÑA, RHYME S.',
  'ELAURIA, JYMNASH CZAR E.',
  'ERJAS, CARL ANTHONY L.',
  'ESPINA, CARL DUSTIN I.',
  'FONTE, KIM JAN O.',
  'FRANCISCO, RIDJY V.',
  'GARCIA, JAMES ANDREW',
  'GAVINO, JHON RAVEN',
  'GLIPONEO, PRINCESS KYLE G.',
  'HERNANDEZ, NATHANIEL T.',
  'HODRIAL, ALLEN VINCE C.',
];

export const ROOM3_HONOR_ROLL_PART_2: readonly string[] = [
  'LACORTE, JOHN LAWRENCE D.',
  'LIMBO, MARK REGIE A.',
  'MANZANILLA, BRIXTER JOSEPH G.',
  'MATUNDAN, KHAEOUS AERAY C.',
  'MIRASOL, MARTIN NEIL L.',
  'NERO, GABBIELLE C.',
  'NUNO, RON EXEQUIEL',
  'OLINO, JOPETH O.',
  'OLIQUINO, CHRISTIAN A.',
  'ONTE, RAFAEL P.',
  'PAYO, DYLAN A.',
  'PEÑA, CARLOS MIGUEL A.',
  'PRADO, JOHN LENRICK T.',
  'QUILAO, LORD JOHN L.',
  'REAL, JILLIAN C.',
  'SALON, JAN MIKHAIL F.',
  'SANTOS, KARYLLE JOY S.',
  'TAGUIAM, JAE HARVEY B.',
  'TALATALA, REIN EISEN B.',
];

type PlaquePart = 'part1' | 'part2';

/**
 * Generates a Room 4-style burled mahogany canvas texture with chiseled 24K metallic gold
 * lettering for the Room 03 Class Roll of Honor.
 */
function createHonorRollTexture(part: PlaquePart): THREE.CanvasTexture {
  const W = 2048;
  const H = 1144;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 1. Lustrous deep mahogany / burled black walnut base
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#1c0a04');
  bgGrad.addColorStop(0.35, '#2b1208');
  bgGrad.addColorStop(0.7, '#200d05');
  bgGrad.addColorStop(1, '#160703');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Deterministic woodgrain fibers & warm golden medullary flecks
  ctx.save();
  for (let i = 0; i < 680; i++) {
    const y = (i * 1.68) % H;
    const wave = Math.sin(y * 0.015 + i * 0.13) * 16;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(46, 19, 8, 0.42)' : 'rgba(8, 3, 1, 0.52)';
    ctx.lineWidth = (i % 3) * 0.8 + 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(620, y + wave, 1420, y - wave, W, y + (i % 5) - 2);
    ctx.stroke();
  }
  for (let j = 0; j < 280; j++) {
    const fx = (j * 173) % (W - 60);
    const fy = (j * 97 + 31) % H;
    const flen = 22 + ((j * 19) % 52);
    ctx.strokeStyle = 'rgba(186, 114, 48, 0.11)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + flen, fy + ((j % 3) - 1) * 2);
    ctx.stroke();
  }
  const vignette = ctx.createRadialGradient(W / 2, H / 2, 360, W / 2, H / 2, 1120);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(5, 2, 1, 0.72)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const createGoldGrad = (y1: number, y2: number) => {
    const g = ctx.createLinearGradient(0, y1, 0, y2);
    g.addColorStop(0.0, '#fffbeb');
    g.addColorStop(0.2, '#fef08a');
    g.addColorStop(0.45, '#f59e0b');
    g.addColorStop(0.75, '#d97706');
    g.addColorStop(0.92, '#b45309');
    g.addColorStop(1.0, '#78350f');
    return g;
  };

  const drawChiseledText = (
    text: string,
    x: number,
    y: number,
    font: string,
    sizeApprox: number,
    maxWidth?: number
  ) => {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Carved shadow in wood
    ctx.fillStyle = 'rgba(5, 2, 1, 0.96)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2.5;
    ctx.shadowOffsetY = 3.5;
    ctx.fillText(text, x + 2, y + 2.5, maxWidth);

    // Top-left bevel highlight
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(255, 248, 220, 0.34)';
    ctx.fillText(text, x - 1, y - 1, maxWidth);

    // 24K Gold inlay fill + crisp highlight edge
    ctx.fillStyle = createGoldGrad(y - sizeApprox * 0.58, y + sizeApprox * 0.58);
    ctx.fillText(text, x, y, maxWidth);
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 0.8;
    ctx.strokeText(text, x, y, maxWidth);
    ctx.restore();
  };

  // 3. Double 24K Gold Inlay Filigree Borders & Corner Stars
  ctx.save();
  ctx.shadowColor = 'rgba(5, 2, 1, 0.9)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  ctx.strokeStyle = createGoldGrad(44, H - 44);
  ctx.lineWidth = 10;
  ctx.strokeRect(48, 44, W - 96, H - 88);
  ctx.lineWidth = 3;
  ctx.strokeRect(72, 68, W - 144, H - 136);
  ctx.restore();

  const drawCornerStar = (cx: number, cy: number) => {
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 11);
    ctx.lineTo(cx + 2.5, cy - 2.5);
    ctx.lineTo(cx + 11, cy);
    ctx.lineTo(cx + 2.5, cy + 2.5);
    ctx.lineTo(cx, cy + 11);
    ctx.lineTo(cx - 2.5, cy + 2.5);
    ctx.lineTo(cx - 11, cy);
    ctx.lineTo(cx - 2.5, cy - 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  drawCornerStar(72, 68);
  drawCornerStar(W - 72, 68);
  drawCornerStar(72, H - 68);
  drawCornerStar(W - 72, H - 68);

  // 4. Institutional Header, Physics Emblem & Titles
  drawChiseledText(
    'UNIVERSITY OF PERPETUAL HELP SYSTEM DALTA',
    W / 2,
    118,
    '600 28px "Cinzel", "Times New Roman", Georgia, serif',
    28
  );

  // Central Atomic-Orbit & Star Crest
  const crestY = 178;
  ctx.save();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.8;
  [-Math.PI / 6, Math.PI / 6].forEach((rot) => {
    ctx.beginPath();
    ctx.ellipse(W / 2, crestY, 76, 24, rot, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.fillStyle = createGoldGrad(crestY - 22, crestY + 22);
  ctx.beginPath();
  for (let s = 0; s < 16; s++) {
    const r = s % 2 === 0 ? 22 : 9;
    const a = (s * Math.PI) / 8 - Math.PI / 2;
    const px = W / 2 + Math.cos(a) * r;
    const py = crestY + Math.sin(a) * r;
    if (s === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawChiseledText(
    'PHYSICS III LABORATORY  ·  ROOM 03',
    W / 2,
    246,
    'bold 48px "Cinzel", "Times New Roman", Georgia, serif',
    48
  );

  drawChiseledText(
    'CLASS ROLL OF HONOR  ·  ELECTRICITY, OPTICS & RELATIVITY',
    W / 2,
    298,
    'italic 500 24px Georgia, serif',
    24
  );

  const drawDivider = (y: number, width: number) => {
    ctx.save();
    const divGrad = ctx.createLinearGradient(W / 2 - width / 2, y, W / 2 + width / 2, y);
    divGrad.addColorStop(0, 'rgba(245, 158, 11, 0)');
    divGrad.addColorStop(0.2, 'rgba(254, 240, 138, 0.85)');
    divGrad.addColorStop(0.5, '#ffffff');
    divGrad.addColorStop(0.8, 'rgba(254, 240, 138, 0.85)');
    divGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - width / 2, y);
    ctx.lineTo(W / 2 + width / 2, y);
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(W / 2, y - 5);
    ctx.lineTo(W / 2 + 7, y);
    ctx.lineTo(W / 2, y + 5);
    ctx.lineTo(W / 2 - 7, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  drawDivider(334, 1480);

  const isPart1 = part === 'part1';
  const roster = isPart1 ? ROOM3_HONOR_ROLL_PART_1 : ROOM3_HONOR_ROLL_PART_2;
  const subLabel = isPart1
    ? '✦   S E C T I O N   R O L L   I   ( A – H )   ·   20   S C H O L A R S   ✦'
    : '✦   S E C T I O N   R O L L   I I   ( L – T )   ·   19   S C H O L A R S   ✦';

  drawChiseledText(
    subLabel,
    W / 2,
    376,
    'bold 26px "Cinzel", "Times New Roman", Georgia, serif',
    26
  );

  // Subtle vertical filigree rule separating left and right columns
  ctx.save();
  const colGrad = ctx.createLinearGradient(0, 424, 0, 964);
  colGrad.addColorStop(0, 'rgba(245, 158, 11, 0)');
  colGrad.addColorStop(0.2, 'rgba(254, 240, 138, 0.55)');
  colGrad.addColorStop(0.8, 'rgba(254, 240, 138, 0.55)');
  colGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.strokeStyle = colGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2, 424);
  ctx.lineTo(W / 2, 964);
  ctx.stroke();
  ctx.restore();

  // 5. Two Balanced Columns of Engraved 24K Gold Student Names
  const leftNames = roster.slice(0, 10);
  const rightNames = roster.slice(10);
  const colLeftX = 542;
  const colRightX = 1506;
  const startY = 446;
  const rowStep = 51;
  const nameFont = 'bold 31px "Cinzel", "Times New Roman", Georgia, serif';

  leftNames.forEach((studentName, idx) => {
    drawChiseledText(studentName, colLeftX, startY + idx * rowStep, nameFont, 31, 820);
  });

  rightNames.forEach((studentName, idx) => {
    drawChiseledText(studentName, colRightX, startY + idx * rowStep, nameFont, 31, 820);
  });

  drawDivider(976, 1560);

  drawChiseledText(
    '«  PER ASPERA AD SCIENTIAM  »  ·  Commemorative Brass & Mahogany Student Roll',
    W / 2,
    1022,
    'italic 500 22px Georgia, serif',
    22
  );

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Mounts both engraved Room 4-style Class Honor Roll plaques on the South Wall flanking
 * the Master Whiteboard (Part I: A-H Left, Part II: L-T Right).
 */
export function buildRoom3HonorRollPlaques(
  scene: THREE.Scene,
  frontZ: number,
  mahoganyMat: THREE.Material,
  brassMat: THREE.Material,
  registerInteractable: (target: THREE.Object3D | THREE.Object3D[], interaction: EquipmentInteraction) => void,
  disposableTextures: THREE.Texture[],
  disposableMaterials: THREE.Material[]
): void {
  const buildSinglePlaque = (posX: number, part: PlaquePart) => {
    const plaqueGroup = new THREE.Group();
    const mountZ = frontZ - 0.19;
    plaqueGroup.position.set(posX, 2.40, mountZ);
    plaqueGroup.rotation.y = Math.PI;
    scene.add(plaqueGroup);

    const plaqueWidth = 3.40;
    const plaqueHeight = 1.90;
    const plaqueDepth = 0.05;

    // 1. Solid mahogany backboard
    const backboard = new THREE.Mesh(
      new THREE.BoxGeometry(plaqueWidth, plaqueHeight, plaqueDepth),
      mahoganyMat
    );
    backboard.castShadow = true;
    backboard.receiveShadow = true;
    plaqueGroup.add(backboard);

    // 2. Stepped mahogany mitered outer frame rails & stiles
    [-plaqueHeight / 2 + 0.032, plaqueHeight / 2 - 0.032].forEach((fy) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(plaqueWidth + 0.05, 0.065, plaqueDepth + 0.025),
        mahoganyMat
      );
      rail.position.set(0, fy, 0.012);
      plaqueGroup.add(rail);
    });
    [-plaqueWidth / 2 + 0.032, plaqueWidth / 2 - 0.032].forEach((fx) => {
      const stile = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, plaqueHeight, plaqueDepth + 0.025),
        mahoganyMat
      );
      stile.position.set(fx, 0, 0.012);
      plaqueGroup.add(stile);
    });

    // 3. Inner polished brass filigree beading
    const innerBrassW = plaqueWidth - 0.09;
    const innerBrassH = plaqueHeight - 0.09;
    [-innerBrassH / 2, innerBrassH / 2].forEach((by) => {
      const bead = new THREE.Mesh(
        new THREE.BoxGeometry(innerBrassW, 0.024, plaqueDepth + 0.032),
        brassMat
      );
      bead.position.set(0, by, 0.016);
      plaqueGroup.add(bead);
    });
    [-innerBrassW / 2, innerBrassW / 2].forEach((bx) => {
      const bead = new THREE.Mesh(
        new THREE.BoxGeometry(0.024, innerBrassH, plaqueDepth + 0.032),
        brassMat
      );
      bead.position.set(bx, 0, 0.016);
      plaqueGroup.add(bead);
    });

    // 4. Four solid brass corner rosette studs
    const cornerX = innerBrassW / 2 - 0.035;
    const cornerY = innerBrassH / 2 - 0.035;
    [
      [-cornerX, -cornerY],
      [cornerX, -cornerY],
      [-cornerX, cornerY],
      [cornerX, cornerY],
    ].forEach(([cx, cy]) => {
      const rosette = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.028, 16),
        brassMat
      );
      rosette.rotation.x = Math.PI / 2;
      rosette.position.set(cx, cy, plaqueDepth / 2 + 0.014);
      plaqueGroup.add(rosette);
    });

    // 5. Engraved mahogany & chiseled 24K gold nameplate face
    const tex = createHonorRollTexture(part);
    disposableTextures.push(tex);
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.34,
      metalness: 0.24,
    });
    disposableMaterials.push(faceMat);

    const faceMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(innerBrassW - 0.02, innerBrassH - 0.02),
      faceMat
    );
    faceMesh.position.set(0, 0, plaqueDepth / 2 + 0.006);
    faceMesh.receiveShadow = true;
    plaqueGroup.add(faceMesh);

    // 6. Dual-gooseneck overhead brass museum picture-light hood (tucked below 3.43m clerestory)
    const lightMountY = plaqueHeight / 2 + 0.06;
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 0.05), brassMat);
    bracket.position.set(0, lightMountY, 0.02);
    plaqueGroup.add(bracket);

    [-0.36, 0.36].forEach((ax) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 12), brassMat);
      arm.rotation.x = -Math.PI / 3.2;
      arm.position.set(ax, lightMountY - 0.04, 0.14);
      plaqueGroup.add(arm);
    });

    const lampHood = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 1.32, 20), brassMat);
    lampHood.rotation.z = Math.PI / 2;
    lampHood.position.set(0, lightMountY - 0.11, 0.27);
    plaqueGroup.add(lampHood);

    // Dedicated warm museum spotlight illuminating the engraved gold names
    const plaqueSpot = new THREE.SpotLight(0xfff3d6, 2.6, 5.5, Math.PI / 2.6, 0.5, 1.4);
    plaqueSpot.position.set(posX, 2.40 + lightMountY - 0.10, mountZ - 0.42);
    plaqueSpot.target.position.set(posX, 2.38, mountZ);
    scene.add(plaqueSpot);
    scene.add(plaqueSpot.target);

    // 7. Click & [E] inspection ray proxy
    const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    disposableMaterials.push(proxyMat);
    const rayProxy = new THREE.Mesh(new THREE.BoxGeometry(plaqueWidth + 0.1, plaqueHeight + 0.1, 0.5), proxyMat);
    rayProxy.position.set(0, 0, 0.12);
    plaqueGroup.add(rayProxy);

    const isPart1 = part === 'part1';
    registerInteractable(rayProxy, {
      id: isPart1 ? 'room3-honor-roll-left' : 'room3-honor-roll-right',
      stationId: isPart1 ? 'circuits' : 'relativity',
      category: 'CLASS ROLL OF HONOR',
      name: isPart1 ? 'Class Roll of Honor · Part I (Aberde – Hodrial)' : 'Class Roll of Honor · Part II (Lacorte – Talatala)',
      description: isPart1
        ? `Engraved 24K gold on burled mahogany listing 20 Physics III students: ${ROOM3_HONOR_ROLL_PART_1.join(' · ')}`
        : `Engraved 24K gold on burled mahogany listing 19 Physics III students: ${ROOM3_HONOR_ROLL_PART_2.join(' · ')}`,
      action: 'Inspect Commemorative Class Roll Plaque',
      readout: isPart1
        ? 'Students 01–20 · Aberde through Hodrial (UPHSD Room 03)'
        : 'Students 21–39 · Lacorte through Talatala (UPHSD Room 03)',
    });
  };

  buildSinglePlaque(-6.15, 'part1');
  buildSinglePlaque(6.15, 'part2');
}
