// @ts-check
import * as THREE from 'three';
import {
  type CircuitState,
  type MultimeterState,
  type MultimeterMode,
  type MultimeterJack,
  type MultimeterReading,
  type TerminalId,
  readMultimeter,
  solveCircuit,
} from './circuitSolver';

export type Multimeter3DCallbacks = {
  onReadingChange?: (reading: MultimeterReading) => void;
  onProbePlaced?: (probe: 'red' | 'black', terminal: TerminalId) => void;
  onFuseTripped?: () => void;
  playTone?: (freq: number, type: OscillatorType, duration: number, vol: number) => void;
  onHoverTooltip?: (tooltip: string | null) => void;
};

// EIA Color Code Map
const EIA_COLORS: Record<number, number> = {
  0: 0x18181b, // Black
  1: 0x78350f, // Brown
  2: 0xdc2626, // Red
  3: 0xea580c, // Orange
  4: 0xeab308, // Yellow
  5: 0x16a34a, // Green
  6: 0x2563eb, // Blue
  7: 0x7c3aed, // Violet
  8: 0x4b5563, // Gray
  9: 0xf8fafc, // White
};

export class Multimeter3D {
  public root: THREE.Group;
  public dmmState: MultimeterState;
  public circuitState: CircuitState;
  public interactableMeshes: THREE.Object3D[] = [];

  private lcdCanvas: HTMLCanvasElement;
  private lcdCtx: CanvasRenderingContext2D;
  private lcdTexture: THREE.CanvasTexture;
  private rotaryDialMesh: THREE.Mesh | null = null;
  private comJackMesh: THREE.Mesh | null = null;
  private redLeadJackMesh: THREE.Mesh | null = null;
  private maJackMesh: THREE.Mesh | null = null;

  // Probes & Cables
  private redProbeGroup: THREE.Group;
  private blackProbeGroup: THREE.Group;
  private redCableMesh: THREE.Mesh | null = null;
  private blackCableMesh: THREE.Mesh | null = null;
  private psuRedWire: THREE.Mesh | null = null;
  private psuBlackWire: THREE.Mesh | null = null;

  // Circuit Hardware Meshes
  private seriesJumperMesh: THREE.Group | null = null;
  private seriesJumperPlugMesh: THREE.Mesh | null = null;
  public boardBaseMesh: THREE.Mesh | null = null;

  // Terminal Positions (World coordinates on workbench)
  public terminalPositions: Record<TerminalId, THREE.Vector3>;
  private callbacks: Multimeter3DCallbacks;
  private continuityBeepPlaying = false;
  private benchX: number;

  constructor(benchX: number, callbacks: Multimeter3DCallbacks = {}) {
    this.benchX = benchX;
    this.callbacks = callbacks;
    this.root = new THREE.Group();
    this.root.name = 'Circuit_Trainer_And_Multimeter_System';

    this.dmmState = {
      mode: 'v_dc',
      redJack: 'v_ohm',
      redProbeTerminal: null,
      blackProbeTerminal: null,
      fuseBlown: false,
    };

    this.circuitState = {
      mode: 'dc',
      topology: 'series',
      powerOn: true,
      sourceVoltage: 24.0,
      frequency: 60.0,
      waveType: 'sine',
      r1: 100.0,
      r2: 220.0,
      r3: 330.0,
      inductanceMh: 150.0,
      capacitanceUf: 47.0,
      seriesJumperConnected: true,
    };

    // Terminal World Positions on Workbench (y = 0.94m benchtop)
    // Solderless Breadboard is centered at (benchX - 0.08, y = 0.94 + 0.011, z = 0.10)
    // Board dimensions: Width = 0.54m, Depth = 0.22m
    this.terminalPositions = {
      SRC_POS: new THREE.Vector3(benchX - 0.31, 0.965, 0.03),
      SRC_NEG: new THREE.Vector3(benchX - 0.31, 0.965, 0.17),
      SERIES_JACK_A: new THREE.Vector3(benchX - 0.22, 0.965, 0.08),
      SERIES_JACK_B: new THREE.Vector3(benchX - 0.16, 0.965, 0.08),
      R1_A: new THREE.Vector3(benchX - 0.14, 0.965, 0.08),
      R1_B: new THREE.Vector3(benchX - 0.04, 0.965, 0.08),
      R2_A: new THREE.Vector3(benchX - 0.02, 0.965, 0.08),
      R2_B: new THREE.Vector3(benchX + 0.08, 0.965, 0.08),
      R3_A: new THREE.Vector3(benchX + 0.10, 0.965, 0.08),
      R3_B: new THREE.Vector3(benchX + 0.20, 0.965, 0.08),
      IND_A: new THREE.Vector3(benchX - 0.18, 0.965, 0.03),
      IND_B: new THREE.Vector3(benchX - 0.08, 0.965, 0.03),
      CAP_A: new THREE.Vector3(benchX + 0.04, 0.965, 0.03),
      CAP_B: new THREE.Vector3(benchX + 0.14, 0.965, 0.03),
    };

    // LCD Texture Canvas
    this.lcdCanvas = document.createElement('canvas');
    this.lcdCanvas.width = 512;
    this.lcdCanvas.height = 256;
    this.lcdCtx = this.lcdCanvas.getContext('2d')!;
    this.lcdTexture = new THREE.CanvasTexture(this.lcdCanvas);
    this.lcdTexture.colorSpace = THREE.SRGBColorSpace;

    // Create 3D Groups
    this.redProbeGroup = new THREE.Group();
    this.redProbeGroup.name = 'Probe_Red_Assembly';
    this.blackProbeGroup = new THREE.Group();
    this.blackProbeGroup.name = 'Probe_Black_Assembly';

    this.buildSolderlessBreadboard();
    this.buildMultimeterBody();
    this.buildTerminalSockets();
    this.buildProbes();
    this.buildPsuFeedWires();
    this.updateDisplay();
  }

  // -------------------------------------------------------------
  // BUILD AUTHENTIC SOLDERLESS BREADBOARD (830 TIE POINTS REPLICA)
  // Based on the clean, realistic concept of DCACLab & Breadboard 3D
  // -------------------------------------------------------------
  private buildSolderlessBreadboard() {
    const boardGroup = new THREE.Group();
    boardGroup.name = 'Solderless_Breadboard_Unit';
    boardGroup.position.set(this.benchX - 0.08, 0.94 + 0.011, 0.10);

    // 1. High-Grade Injection Molded White ABS Housing with Chamfered Edges
    const absMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.38,
      metalness: 0.03,
    });
    this.boardBaseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.022, 0.22), absMat);
    this.boardBaseMesh.castShadow = true;
    this.boardBaseMesh.receiveShadow = true;
    boardGroup.add(this.boardBaseMesh);

    // Rubber mounting pads on bottom
    const footMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.9 });
    const footPositions = [
      [-0.25, -0.012, -0.09],
      [0.25, -0.012, -0.09],
      [-0.25, -0.012, 0.09],
      [0.25, -0.012, 0.09],
    ];
    footPositions.forEach(([fx, fy, fz]) => {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16), footMat);
      foot.position.set(fx, fy, fz);
      boardGroup.add(foot);
    });

    // Interlocking tabs on left and right sides (classic breadboard dovetail tabs)
    const tabMat = absMat;
    [-0.05, 0.05].forEach((tz) => {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.022), tabMat);
      tab.position.set(0.274, 0, tz);
      boardGroup.add(tab);
    });

    // 2. High-Resolution Photorealistic Solderless Breadboard Silk Texture (2048 x 1024)
    const bCanvas = document.createElement('canvas');
    bCanvas.width = 2048;
    bCanvas.height = 1024;
    const ctx = bCanvas.getContext('2d')!;

    // Clean white / eggshell plastic face
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 2048, 1024);

    // Subtle edge bevel border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 16, 2016, 992);

    // Helpers for drawing contact tie points
    const drawTiePoint = (cx: number, cy: number) => {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(cx - 7, cy - 7, 14, 14, 3);
      ctx.fill();

      // Subtle nickel leaf spring contact highlight
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cx - 2, cy - 5, 4, 10);
    };

    const startX = 140;
    const colStep = (2048 - 280) / 60; // ~29.4px per column

    // A. Top Power Distribution Bus (Red + and Blue - rails)
    // Red rail line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(startX, 80);
    ctx.lineTo(startX + 59 * colStep, 80);
    ctx.stroke();

    // Red + markers
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#ef4444';
    for (let i = 0; i < 60; i += 6) {
      ctx.fillText('+', startX + i * colStep - 6, 70);
    }

    // Top Red Rail Holes
    for (let i = 0; i < 60; i++) {
      drawTiePoint(startX + i * colStep, 108);
    }

    // Blue rail line
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(startX, 155);
    ctx.lineTo(startX + 59 * colStep, 155);
    ctx.stroke();

    // Blue - markers
    ctx.fillStyle = '#2563eb';
    for (let i = 0; i < 60; i += 6) {
      ctx.fillText('-', startX + i * colStep - 6, 148);
    }

    // Top Blue Rail Holes
    for (let i = 0; i < 60; i++) {
      drawTiePoint(startX + i * colStep, 185);
    }

    // B. Upper Terminal Strip (Rows A, B, C, D, E)
    // Column numbering above row A
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#475569';
    for (let col = 1; col <= 60; col++) {
      if (col === 1 || col % 5 === 0) {
        const xPos = startX + (col - 1) * colStep;
        ctx.fillText(col.toString(), xPos - (col >= 10 ? 12 : 6), 238);
      }
    }

    // Row letters on margins
    const rowLettersUpper = ['A', 'B', 'C', 'D', 'E'];
    const rowYUpper = [280, 324, 368, 412, 456];
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#64748b';
    rowLettersUpper.forEach((letter, idx) => {
      ctx.fillText(letter, 85, rowYUpper[idx] + 7);
      ctx.fillText(letter, 1945, rowYUpper[idx] + 7);
    });

    // Draw 60 columns x 5 rows in Upper Strip
    for (let col = 0; col < 60; col++) {
      const cx = startX + col * colStep;
      for (let r = 0; r < 5; r++) {
        drawTiePoint(cx, rowYUpper[r]);
      }
    }

    // C. Center IC Notch Trough / Divider
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(startX - 20, 492, 59 * colStep + 40, 38);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX - 20, 492, 59 * colStep + 40, 38);

    // D. Lower Terminal Strip (Rows F, G, H, I, J)
    const rowLettersLower = ['F', 'G', 'H', 'I', 'J'];
    const rowYLower = [568, 612, 656, 700, 744];
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#64748b';
    rowLettersLower.forEach((letter, idx) => {
      ctx.fillText(letter, 85, rowYLower[idx] + 7);
      ctx.fillText(letter, 1945, rowYLower[idx] + 7);
    });

    for (let col = 0; col < 60; col++) {
      const cx = startX + col * colStep;
      for (let r = 0; r < 5; r++) {
        drawTiePoint(cx, rowYLower[r]);
      }
    }

    // Column numbering below row J
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#475569';
    for (let col = 1; col <= 60; col++) {
      if (col === 1 || col % 5 === 0) {
        const xPos = startX + (col - 1) * colStep;
        ctx.fillText(col.toString(), xPos - (col >= 10 ? 12 : 6), 785);
      }
    }

    // E. Bottom Power Distribution Bus
    // Blue rail line
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(startX, 835);
    ctx.lineTo(startX + 59 * colStep, 835);
    ctx.stroke();

    ctx.fillStyle = '#2563eb';
    for (let i = 0; i < 60; i += 6) {
      ctx.fillText('-', startX + i * colStep - 6, 828);
    }

    for (let i = 0; i < 60; i++) {
      drawTiePoint(startX + i * colStep, 865);
    }

    // Red rail line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(startX, 915);
    ctx.lineTo(startX + 59 * colStep, 915);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    for (let i = 0; i < 60; i += 6) {
      ctx.fillText('+', startX + i * colStep - 6, 908);
    }

    for (let i = 0; i < 60; i++) {
      drawTiePoint(startX + i * colStep, 945);
    }

    // F. Educational Experiment Component Overlays (Clean & Crisp, not overwhelming)
    // Series Jumper Break (Cols 8-14)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(startX + 7 * colStep - 10, 680, 7 * colStep + 20, 80);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#059669';
    ctx.fillText('SERIES BREAK (AMMETER)', startX + 7 * colStep, 665);

    // Resistor 1: Cols 16 to 26
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3;
    ctx.strokeRect(startX + 15 * colStep - 8, 350, 11 * colStep + 16, 75);
    ctx.fillStyle = '#0284c7';
    ctx.fillText('R1: 100 Ω (BRN-BLK-BRN)', startX + 15 * colStep, 340);

    // Resistor 2: Cols 28 to 38
    ctx.strokeStyle = '#0284c7';
    ctx.strokeRect(startX + 27 * colStep - 8, 350, 11 * colStep + 16, 75);
    ctx.fillText('R2: 220 Ω (RED-RED-BRN)', startX + 27 * colStep, 340);

    // Resistor 3: Cols 40 to 50
    ctx.strokeStyle = '#0284c7';
    ctx.strokeRect(startX + 39 * colStep - 8, 350, 11 * colStep + 16, 75);
    ctx.fillText('R3: 330 Ω (ORG-ORG-BRN)', startX + 39 * colStep, 340);

    // Power Inputs Legend
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('+24V DC POWER INPUT', startX, 45);
    ctx.fillStyle = '#2563eb';
    ctx.fillText('0V COMMON GROUND (RETURN)', startX, 990);

    const bTexture = new THREE.CanvasTexture(bCanvas);
    bTexture.colorSpace = THREE.SRGBColorSpace;
    const topPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.536, 0.216),
      new THREE.MeshStandardMaterial({ map: bTexture, roughness: 0.35, metalness: 0.05 })
    );
    topPlate.rotation.x = -Math.PI / 2;
    topPlate.position.y = 0.0112;
    boardGroup.add(topPlate);

    // 3. Build Realistic 3D Axial Resistors with EIA Color Bands
    // Board local coords:
    // R1: x = -0.09, z = -0.02
    // R2: x = 0.03, z = -0.02
    // R3: x = 0.15, z = -0.02
    const r1Mesh = this.buildAxialResistor(100, [1, 0, 1, 0], new THREE.Vector3(-0.09, 0.022, -0.02));
    boardGroup.add(r1Mesh);

    const r2Mesh = this.buildAxialResistor(220, [2, 2, 1, 0], new THREE.Vector3(0.03, 0.022, -0.02));
    boardGroup.add(r2Mesh);

    const r3Mesh = this.buildAxialResistor(330, [3, 3, 1, 0], new THREE.Vector3(0.15, 0.022, -0.02));
    boardGroup.add(r3Mesh);

    // 4. Build Realistic 3D Breadboard Jumper Wires (Solid-Core 22 AWG Arched Wires)
    // Connecting power rails and component rows just like in Philippe Fauteux's Breadboard 3D
    this.buildBreadboardJumpers(boardGroup);

    // 5. Build Series Loop Jumper Plug
    this.buildSeriesJumper(boardGroup);

    this.root.add(boardGroup);
  }

  // -------------------------------------------------------------
  // BUILD REALISTIC AXIAL RESISTOR WITH EIA COLOR BANDS
  // -------------------------------------------------------------
  private buildAxialResistor(
    ohms: number,
    bands: [number, number, number, number],
    localPos: THREE.Vector3
  ): THREE.Group {
    const resGroup = new THREE.Group();
    resGroup.position.copy(localPos);

    // Ceramic tan body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xdeb887,
      roughness: 0.45,
      metalness: 0.05,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.046, 20), bodyMat);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    resGroup.add(body);

    // Rounded bulbous end caps
    const capMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.45 });
    const cap1 = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 16), capMat);
    cap1.position.x = -0.023;
    resGroup.add(cap1);

    const cap2 = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 16), capMat);
    cap2.position.x = 0.023;
    resGroup.add(cap2);

    // EIA Color Bands
    const bandPositions = [-0.015, -0.005, 0.005, 0.015];
    bands.forEach((digit, idx) => {
      const color = idx === 3 ? 0xeab308 : EIA_COLORS[digit] || 0x18181b;
      const bMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: idx === 3 ? 0.85 : 0.1,
      });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0094, 0.0094, 0.0035, 20), bMat);
      band.rotation.z = Math.PI / 2;
      band.position.x = bandPositions[idx];
      resGroup.add(band);
    });

    // Axial lead wires bent downward 90 degrees into breadboard tie points
    const leadMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 });
    const leadCurveLeft = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.023, 0, 0),
      new THREE.Vector3(-0.045, 0, 0),
      new THREE.Vector3(-0.050, -0.012, 0),
    ]);
    const leadMeshLeft = new THREE.Mesh(new THREE.TubeGeometry(leadCurveLeft, 12, 0.0016, 8, false), leadMat);
    resGroup.add(leadMeshLeft);

    const leadCurveRight = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.023, 0, 0),
      new THREE.Vector3(0.045, 0, 0),
      new THREE.Vector3(0.050, -0.012, 0),
    ]);
    const leadMeshRight = new THREE.Mesh(new THREE.TubeGeometry(leadCurveRight, 12, 0.0016, 8, false), leadMat);
    resGroup.add(leadMeshRight);

    return resGroup;
  }

  // -------------------------------------------------------------
  // BUILD 3D SOLID-CORE BREADBOARD JUMPER WIRES
  // Colorful insulated hookup jumpers bridging breadboard holes
  // -------------------------------------------------------------
  private buildBreadboardJumpers(boardGroup: THREE.Group) {
    const createJumper = (p1: THREE.Vector3, p2: THREE.Vector3, color: number) => {
      const mid = p1.clone().lerp(p2, 0.5);
      mid.y += 0.010; // 10mm arch above breadboard surface
      const curve = new THREE.CatmullRomCurve3([p1, mid, p2]);
      const geo = new THREE.TubeGeometry(curve, 16, 0.0022, 8, false);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      boardGroup.add(mesh);
    };

    // 1. Red Jumper Wire (+24V power rail to Ammeter Break Socket A)
    createJumper(
      new THREE.Vector3(-0.23, 0.011, -0.07),
      new THREE.Vector3(-0.14, 0.011, -0.02),
      0xef4444
    );

    // 2. Yellow Jumper Wire (Ammeter Break Socket B to R1 Input Node A)
    createJumper(
      new THREE.Vector3(-0.08, 0.011, -0.02),
      new THREE.Vector3(-0.06, 0.011, -0.02),
      0xeab308
    );

    // 3. Blue Jumper Wire (R1 Node B to R2 Node A)
    createJumper(
      new THREE.Vector3(-0.04, 0.011, -0.02),
      new THREE.Vector3(0.00, 0.011, -0.02),
      0x2563eb
    );

    // 4. Yellow Jumper Wire (R2 Node B to R3 Node A)
    createJumper(
      new THREE.Vector3(0.08, 0.011, -0.02),
      new THREE.Vector3(0.12, 0.011, -0.02),
      0xeab308
    );

    // 5. Black Jumper Wire (R3 Node B back to Blue Ground Rail)
    createJumper(
      new THREE.Vector3(0.20, 0.011, -0.02),
      new THREE.Vector3(0.20, 0.011, 0.07),
      0x18181b
    );
  }

  // -------------------------------------------------------------
  // BUILD SERIES CURRENT JUMPER PLUG
  // Molded emerald green U-link bridging Ammeter Sockets A & B
  // -------------------------------------------------------------
  private buildSeriesJumper(boardGroup: THREE.Group) {
    this.seriesJumperMesh = new THREE.Group();
    this.seriesJumperMesh.name = 'Series_Loop_Jumper_Assembly';
    this.seriesJumperMesh.position.set(-0.11, 0.022, -0.02);

    // Emerald green molded jumper bar
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.35,
      metalness: 0.1,
    });
    this.seriesJumperPlugMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.014), handleMat);
    this.seriesJumperPlugMesh.castShadow = true;
    this.seriesJumperMesh.add(this.seriesJumperPlugMesh);

    // Gold banana pins plunging into board sockets
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.15 });
    const pin1 = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.016, 12), pinMat);
    pin1.position.set(-0.025, -0.010, 0);
    this.seriesJumperMesh.add(pin1);

    const pin2 = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.016, 12), pinMat);
    pin2.position.set(0.025, -0.010, 0);
    this.seriesJumperMesh.add(pin2);

    // Raycast Click Hitbox
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.04, 0.04),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitbox.name = 'Hitbox_Series_Jumper';
    hitbox.userData.isInteractable = true;
    hitbox.userData.action = 'toggle_jumper';
    hitbox.userData.hoverTooltip = 'Series Loop Jumper · Click to Open Circuit (Insert Ammeter) or Close Loop';
    this.seriesJumperMesh.add(hitbox);
    this.interactableMeshes.push(hitbox);

    boardGroup.add(this.seriesJumperMesh);
  }

  // -------------------------------------------------------------
  // BUILD 3D FLUKE 87V MULTIMETER HARDWARE
  // Realistically proportioned, ergonomic industrial digital multimeter
  // -------------------------------------------------------------
  private buildMultimeterBody() {
    const meterGroup = new THREE.Group();
    meterGroup.name = 'DMM_Body_Group';
    // Sits neatly beside the breadboard on the right: (benchX + 0.30, 0.94 + 0.012, 0.10)
    meterGroup.position.set(this.benchX + 0.30, 0.94 + 0.012, 0.10);
    meterGroup.rotation.y = -Math.PI / 10; // 18 deg inward towards student
    meterGroup.rotation.x = 0.20; // 11.5 deg ergonomic tilt up

    // Yellow rubber shock holster (realistic 24cm L x 13cm W x 5.5cm H)
    const holsterMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.45,
      metalness: 0.08,
    });
    const holster = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.055, 0.24), holsterMat);
    holster.castShadow = true;
    meterGroup.add(holster);

    // Dark graphite inner housing
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.65,
      metalness: 0.25,
    });
    const innerCase = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.052, 0.23), caseMat);
    innerCase.position.y = 0.003;
    meterGroup.add(innerCase);

    // Rear kick-stand prop
    const standMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.008, 0.12), standMat);
    stand.position.set(0, -0.030, -0.05);
    stand.rotation.x = 0.52;
    meterGroup.add(stand);

    // LCD Screen Glass Bezel
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.004, 0.075), bezelMat);
    bezel.position.set(0, 0.030, -0.065);
    meterGroup.add(bezel);

    // LCD Screen Panel
    const lcdScreenMat = new THREE.MeshBasicMaterial({ map: this.lcdTexture });
    const lcdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.098, 0.068), lcdScreenMat);
    lcdScreen.rotation.x = -Math.PI / 2;
    lcdScreen.position.set(0, 0.032, -0.065);
    meterGroup.add(lcdScreen);

    // Push Buttons below screen
    const btnMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
    [-0.032, -0.011, 0.011, 0.032].forEach((bx) => {
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.006, 0.009), btnMat);
      btn.position.set(bx, 0.031, -0.020);
      meterGroup.add(btn);
    });

    // Rotary Dial with Knurled Grip
    const dialMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.75,
    });
    this.rotaryDialMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.016, 24), dialMat);
    this.rotaryDialMesh.name = 'DMM_Rotary_Dial';
    this.rotaryDialMesh.position.set(0, 0.034, 0.024);
    this.rotaryDialMesh.userData.isInteractable = true;
    this.rotaryDialMesh.userData.action = 'cycle_mode';
    this.rotaryDialMesh.userData.hoverTooltip = 'Rotary Function Dial · Click to change measurement mode (DC V, AC V, DC A, Resistance, Continuity)';

    // Dial indicator pointer
    const notchMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.018, 0.020), notchMat);
    notch.position.set(0, 0.003, -0.016);
    this.rotaryDialMesh.add(notch);
    meterGroup.add(this.rotaryDialMesh);
    this.interactableMeshes.push(this.rotaryDialMesh);

    // 4mm Input Jacks
    const jackRedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.4, roughness: 0.3 });
    const jackBlackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.4, roughness: 0.3 });

    // COM Jack (Black)
    this.comJackMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 16), jackBlackMat);
    this.comJackMesh.position.set(0.010, 0.032, 0.088);
    meterGroup.add(this.comJackMesh);

    // V·Ω Jack (Red)
    this.redLeadJackMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 16), jackRedMat);
    this.redLeadJackMesh.name = 'DMM_Jack_V_OHM';
    this.redLeadJackMesh.position.set(0.038, 0.032, 0.088);
    this.redLeadJackMesh.userData.isInteractable = true;
    this.redLeadJackMesh.userData.action = 'toggle_red_jack';
    this.redLeadJackMesh.userData.hoverTooltip = 'V·Ω Jack (Red Lead) · Active for Voltage and Resistance measurements';
    meterGroup.add(this.redLeadJackMesh);
    this.interactableMeshes.push(this.redLeadJackMesh);

    // mA / 10A Jack (Red)
    this.maJackMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 16), jackRedMat);
    this.maJackMesh.name = 'DMM_Jack_mA';
    this.maJackMesh.position.set(-0.038, 0.032, 0.088);
    this.maJackMesh.userData.isInteractable = true;
    this.maJackMesh.userData.action = 'toggle_red_jack';
    this.maJackMesh.userData.hoverTooltip = 'mA/10A Jack · Required for Current measurement in series';
    meterGroup.add(this.maJackMesh);
    this.interactableMeshes.push(this.maJackMesh);

    this.root.add(meterGroup);
  }

  // -------------------------------------------------------------
  // BUILD TERMINAL SOCKETS ON BREADBOARD
  // -------------------------------------------------------------
  private buildTerminalSockets() {
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.18 });

    const terminalTooltips: Record<TerminalId, string> = {
      SRC_POS: 'Power Supply Positive Terminal (+24V DC)',
      SRC_NEG: 'Power Supply Ground Return (0V GND)',
      SERIES_JACK_A: 'Series Jumper Socket A (Insert Ammeter Red Lead Here)',
      SERIES_JACK_B: 'Series Jumper Socket B (Insert Ammeter Black Lead Here)',
      R1_A: 'Resistor R1 Node A (+ side of 100 Ω resistor)',
      R1_B: 'Resistor R1 Node B (Output of 100 Ω resistor)',
      R2_A: 'Resistor R2 Node A (Input to 220 Ω resistor)',
      R2_B: 'Resistor R2 Node B (Output of 220 Ω resistor)',
      R3_A: 'Resistor R3 Node A (Input to 330 Ω resistor)',
      R3_B: 'Resistor R3 Node B (GND return side of 330 Ω resistor)',
      IND_A: 'Inductor Terminal A (150 mH)',
      IND_B: 'Inductor Terminal B (150 mH)',
      CAP_A: 'Capacitor Terminal A (47 μF)',
      CAP_B: 'Capacitor Terminal B (47 μF)',
    };

    Object.entries(this.terminalPositions).forEach(([tId, pos]) => {
      const socketGroup = new THREE.Group();
      socketGroup.position.copy(pos);

      // Subtle metallic eyelet contact
      const eyelet = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.003, 16), goldMat);
      eyelet.position.y = 0.001;
      socketGroup.add(eyelet);

      // Inner banana contact hole
      const innerHole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0028, 0.0028, 0.005, 12),
        new THREE.MeshBasicMaterial({ color: 0x050811 })
      );
      innerHole.position.y = 0.002;
      socketGroup.add(innerHole);

      // Clickable Hitbox Mesh for Raycasting
      const hitbox = new THREE.Mesh(
        new THREE.CylinderGeometry(0.020, 0.020, 0.035, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
      );
      hitbox.name = `Terminal_${tId}`;
      hitbox.userData.isTerminal = true;
      hitbox.userData.terminalId = tId as TerminalId;
      hitbox.userData.hoverTooltip = terminalTooltips[tId as TerminalId] || `Terminal ${tId} · Click to attach probe`;
      socketGroup.add(hitbox);
      this.interactableMeshes.push(hitbox);

      this.root.add(socketGroup);
    });
  }

  // -------------------------------------------------------------
  // BUILD 3D TEST PROBES (FLUKE TL75 REPLICA)
  // -------------------------------------------------------------
  private buildProbes() {
    const tipSteelMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.95, roughness: 0.1 });

    const createProbeMesh = (color: 0xef4444 | 0x18181b, name: string) => {
      const group = new THREE.Group();
      group.name = name;

      const handleMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 });

      // Needle Tip (points down along -Y, origin at needle point)
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0006, 0.024, 12), tipSteelMat);
      tip.position.y = 0.012;
      group.add(tip);

      // Tapered nose cone
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0020, 0.016, 16), handleMat);
      cone.position.y = 0.032;
      group.add(cone);

      // Ribbed body
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.075, 16), handleMat);
      body.position.y = 0.078;
      group.add(body);

      // Raised circular finger safety barrier
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 16), handleMat);
      guard.position.y = 0.044;
      group.add(guard);

      // Rubber strain-relief cable boot at top
      const bootMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, 0.020, 12), bootMat);
      boot.position.y = 0.125;
      group.add(boot);

      // Hitbox for clicking the probe
      const hitbox = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.15, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
      );
      hitbox.position.y = 0.07;
      hitbox.name = name + '_Hitbox';
      hitbox.userData.isProbe = true;
      hitbox.userData.probeColor = color === 0xef4444 ? 'red' : 'black';
      hitbox.userData.hoverTooltip = color === 0xef4444
        ? 'Red Test Probe (+) · Click terminal to attach'
        : 'Black Test Probe (COM) · Click terminal to attach';
      group.add(hitbox);
      this.interactableMeshes.push(hitbox);

      return group;
    };

    // Red Probe
    const redMesh = createProbeMesh(0xef4444, 'Probe_Red');
    this.redProbeGroup.add(redMesh);
    // Resting position in staging area to the right of the breadboard
    this.redProbeGroup.position.set(this.benchX + 0.20, 0.946, 0.20);
    this.redProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6); // Flat on benchtop
    this.root.add(this.redProbeGroup);

    // Black Probe
    const blackMesh = createProbeMesh(0x18181b, 'Probe_Black');
    this.blackProbeGroup.add(blackMesh);
    this.blackProbeGroup.position.set(this.benchX + 0.26, 0.946, 0.20);
    this.blackProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6);
    this.root.add(this.blackProbeGroup);

    this.updateCables();
  }

  // -------------------------------------------------------------
  // BUILD POWER FEED HOOKUP WIRES FROM DC PSU TO BREADBOARD
  // Cleanly routed on the benchtop, zero clipping through instruments
  // -------------------------------------------------------------
  private buildPsuFeedWires() {
    // Exact PSU binding posts at rear-left (benchX - 0.65, 0.94, -0.48)
    // Exact PSU binding posts at rear-left (benchX - 0.65, 0.94, -0.48, rotY = 0.08)
    // Red Post: local (-0.11, 0.04, 0.175) -> world (benchX - 0.745, 0.98, -0.297)
    // Black Post: local (-0.04, 0.04, 0.175) -> world (benchX - 0.675, 0.98, -0.302)
    const psuRedPostPos = new THREE.Vector3(this.benchX - 0.745, 0.98, -0.297);
    const psuBlackPostPos = new THREE.Vector3(this.benchX - 0.675, 0.98, -0.302);
    const posPos = this.terminalPositions.SRC_POS;
    const negPos = this.terminalPositions.SRC_NEG;
    const tableY = 0.945;

    // 4mm Banana Plug Terminal Boots at the PSU Binding Posts
    const bananaPlugMatRed = new THREE.MeshStandardMaterial({ color: 0xd92d20, roughness: 0.35, metalness: 0.15 });
    const bananaPlugMatBlack = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.35, metalness: 0.15 });

    const redPlugBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.038, 16), bananaPlugMatRed);
    redPlugBoot.rotation.x = Math.PI / 2 - 0.15;
    redPlugBoot.position.copy(psuRedPostPos).add(new THREE.Vector3(0, 0, 0.018));
    this.root.add(redPlugBoot);

    const blackPlugBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.038, 16), bananaPlugMatBlack);
    blackPlugBoot.rotation.x = Math.PI / 2 - 0.15;
    blackPlugBoot.position.copy(psuBlackPostPos).add(new THREE.Vector3(0, 0, 0.018));
    this.root.add(blackPlugBoot);

    // Heavy Red Wire (+24V): Drops from PSU binding post to benchtop, curves along left side of breadboard to SRC_POS
    const redCurve = new THREE.CatmullRomCurve3([
      psuRedPostPos.clone().add(new THREE.Vector3(0, 0, 0.035)),
      new THREE.Vector3(this.benchX - 0.745, 0.96, -0.23),
      new THREE.Vector3(this.benchX - 0.70, tableY, -0.15),
      new THREE.Vector3(this.benchX - 0.50, tableY, -0.04),
      new THREE.Vector3(this.benchX - 0.38, tableY, 0.01),
      posPos.clone().add(new THREE.Vector3(0, 0.012, 0)),
    ], false, 'centripetal');
    const redGeo = new THREE.TubeGeometry(redCurve, 24, 0.0045, 8, false);
    this.psuRedWire = new THREE.Mesh(redGeo, new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }));
    this.psuRedWire.castShadow = true;
    this.root.add(this.psuRedWire);

    // Heavy Black Wire (0V GND): Drops from PSU binding post to benchtop, curves along left side of breadboard to SRC_NEG
    const blackCurve = new THREE.CatmullRomCurve3([
      psuBlackPostPos.clone().add(new THREE.Vector3(0, 0, 0.035)),
      new THREE.Vector3(this.benchX - 0.675, 0.96, -0.23),
      new THREE.Vector3(this.benchX - 0.65, tableY, -0.12),
      new THREE.Vector3(this.benchX - 0.46, tableY, 0.06),
      new THREE.Vector3(this.benchX - 0.38, tableY, 0.14),
      negPos.clone().add(new THREE.Vector3(0, 0.012, 0)),
    ], false, 'centripetal');
    const blackGeo = new THREE.TubeGeometry(blackCurve, 24, 0.0045, 8, false);
    this.psuBlackWire = new THREE.Mesh(blackGeo, new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4 }));
    this.psuBlackWire.castShadow = true;
    this.root.add(this.psuBlackWire);
  }

  // -------------------------------------------------------------
  // UPDATE FLEXIBLE 3D LEAD CABLES (PHYSICALLY GROUNDED DRAPING)
  // Eliminates all airborne loops, instrument clipping, and visual clutter
  // -------------------------------------------------------------
  public updateCables() {
    if (this.redCableMesh) this.root.remove(this.redCableMesh);
    if (this.blackCableMesh) this.root.remove(this.blackCableMesh);

    // Ensure matrices are up to date
    this.root.updateMatrixWorld(true);

    const dmmJackRedPos = new THREE.Vector3();
    const dmmJackBlackPos = new THREE.Vector3();
    const activeRedJack = this.dmmState.redJack === 'v_ohm' ? this.redLeadJackMesh : this.maJackMesh;
    if (activeRedJack) {
      activeRedJack.getWorldPosition(dmmJackRedPos);
    } else {
      dmmJackRedPos.set(this.benchX + 0.38 + 0.035, 0.965, 0.20);
    }
    if (this.comJackMesh) {
      this.comJackMesh.getWorldPosition(dmmJackBlackPos);
    } else {
      dmmJackBlackPos.set(this.benchX + 0.38 + 0.010, 0.965, 0.20);
    }

    const redBootPos = new THREE.Vector3();
    const blackBootPos = new THREE.Vector3();
    this.redProbeGroup.getWorldPosition(redBootPos);
    this.blackProbeGroup.getWorldPosition(blackBootPos);
    redBootPos.add(new THREE.Vector3(0, 0.12, 0));
    blackBootPos.add(new THREE.Vector3(0, 0.12, 0));

    const tableY = 0.945;

    // --- Red Cable Curve (Physically draped along benchtop) ---
    const redPts: THREE.Vector3[] = [];
    redPts.push(dmmJackRedPos.clone());
    // Point 1: 3cm directly forward-down out of jack
    redPts.push(dmmJackRedPos.clone().add(new THREE.Vector3(0, -0.015, 0.04)));
    // Point 2: Drapes to table surface
    redPts.push(new THREE.Vector3(dmmJackRedPos.x - 0.03, tableY, dmmJackRedPos.z + 0.07));

    if (this.dmmState.redProbeTerminal) {
      const termPos = this.terminalPositions[this.dmmState.redProbeTerminal];
      // Point 3: Sweeps along benchtop in front of the board
      const frontZ = Math.max(dmmJackRedPos.z + 0.06, termPos.z + 0.12);
      redPts.push(new THREE.Vector3((dmmJackRedPos.x + termPos.x) * 0.5, tableY, frontZ));
      // Point 4: Approaching probe base on table
      redPts.push(new THREE.Vector3(termPos.x + 0.02, tableY, termPos.z + 0.06));
      // Point 5: Rising smoothly towards probe boot
      redPts.push(new THREE.Vector3(termPos.x + 0.01, (tableY + redBootPos.y) * 0.5, termPos.z + 0.02));
      // Point 6: Enters probe boot
      redPts.push(redBootPos.clone());
    } else {
      // Parked probe
      redPts.push(new THREE.Vector3(this.benchX + 0.30, tableY, 0.24));
      redPts.push(new THREE.Vector3(this.benchX + 0.26, tableY, 0.22));
      redPts.push(redBootPos.clone());
    }

    const redCurve = new THREE.CatmullRomCurve3(redPts, false, 'centripetal');
    const redGeo = new THREE.TubeGeometry(redCurve, 28, 0.0042, 8, false);
    this.redCableMesh = new THREE.Mesh(
      redGeo,
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.1 })
    );
    this.redCableMesh.castShadow = true;
    this.root.add(this.redCableMesh);

    // --- Black Cable Curve (Physically draped along benchtop) ---
    const blackPts: THREE.Vector3[] = [];
    blackPts.push(dmmJackBlackPos.clone());
    blackPts.push(dmmJackBlackPos.clone().add(new THREE.Vector3(0, -0.015, 0.04)));
    blackPts.push(new THREE.Vector3(dmmJackBlackPos.x - 0.02, tableY, dmmJackBlackPos.z + 0.09));

    if (this.dmmState.blackProbeTerminal) {
      const termPos = this.terminalPositions[this.dmmState.blackProbeTerminal];
      const frontZ = Math.max(dmmJackBlackPos.z + 0.08, termPos.z + 0.14);
      blackPts.push(new THREE.Vector3((dmmJackBlackPos.x + termPos.x) * 0.5, tableY, frontZ));
      blackPts.push(new THREE.Vector3(termPos.x - 0.02, tableY, termPos.z + 0.06));
      blackPts.push(new THREE.Vector3(termPos.x - 0.01, (tableY + blackBootPos.y) * 0.5, termPos.z + 0.02));
      blackPts.push(blackBootPos.clone());
    } else {
      blackPts.push(new THREE.Vector3(this.benchX + 0.35, tableY, 0.26));
      blackPts.push(new THREE.Vector3(this.benchX + 0.33, tableY, 0.22));
      blackPts.push(blackBootPos.clone());
    }

    const blackCurve = new THREE.CatmullRomCurve3(blackPts, false, 'centripetal');
    const blackGeo = new THREE.TubeGeometry(blackCurve, 28, 0.0042, 8, false);
    this.blackCableMesh = new THREE.Mesh(
      blackGeo,
      new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.35, metalness: 0.1 })
    );
    this.blackCableMesh.castShadow = true;
    this.root.add(this.blackCableMesh);
  }

  // -------------------------------------------------------------
  // UPDATE MULTIMETER LCD CANVAS TEXTURE (FLUKE 87V REPLICA)
  // -------------------------------------------------------------
  public updateDisplay(): MultimeterReading {
    let reading = readMultimeter(this.circuitState, this.dmmState);
    if (reading.tripFuse && !this.dmmState.fuseBlown) {
      this.dmmState.fuseBlown = true;
      this.callbacks.playTone?.(140, 'sawtooth', 0.4, 0.3);
      reading = readMultimeter(this.circuitState, this.dmmState);
    }

    // LCD Background
    this.lcdCtx.fillStyle = '#101c2e';
    this.lcdCtx.fillRect(0, 0, 512, 256);

    // Top Header: Multimeter Brand & Mode
    this.lcdCtx.fillStyle = '#94a3b8';
    this.lcdCtx.font = 'bold 22px monospace';
    this.lcdCtx.fillText('FLUKE 87V TRUE RMS', 24, 38);

    const modeLabels: Record<MultimeterMode, string> = {
      v_dc: 'DC VOLTAGE',
      v_ac: 'AC VOLTAGE (RMS)',
      a_dc: 'DC CURRENT',
      a_ac: 'AC CURRENT (RMS)',
      ohm: 'RESISTANCE (Ω)',
      cont: 'CONTINUITY BEEP',
    };
    this.lcdCtx.fillStyle = '#38bdf8';
    this.lcdCtx.fillText(modeLabels[this.dmmState.mode], 24, 72);

    // Main 7-Segment Readout
    this.lcdCtx.font = 'bold 76px monospace';
    this.lcdCtx.fillStyle = this.dmmState.fuseBlown || reading.displayString === 'LEAd'
      ? '#ef4444'
      : reading.isValidMeasurement
      ? '#38bdf8'
      : reading.isContinuityBeep
      ? '#10b981'
      : '#f59e0b';
    this.lcdCtx.fillText(reading.displayString, 24, 158);

    // Status Annunciator Bar
    this.lcdCtx.font = 'bold 20px monospace';
    this.lcdCtx.fillStyle = '#64748b';
    this.lcdCtx.fillText(`JACK: ${this.dmmState.redJack.toUpperCase()} · AUTO-RANGE · 6000 COUNT`, 24, 205);

    // Analog Bargraph along bottom
    const barWidth = 464;
    const barX = 24;
    const barY = 222;
    this.lcdCtx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    this.lcdCtx.lineWidth = 2;
    this.lcdCtx.strokeRect(barX, barY, barWidth, 12);

    let fillPct = 0;
    if (reading.isValidMeasurement && reading.value !== null) {
      if (this.dmmState.mode.includes('v')) fillPct = Math.min(1, Math.max(0, reading.value / 24.0));
      else if (this.dmmState.mode.includes('a')) fillPct = Math.min(1, Math.max(0, reading.value / 0.1));
      else if (this.dmmState.mode === 'ohm') fillPct = Math.min(1, Math.max(0, reading.value / 650.0));
    }
    this.lcdCtx.fillStyle = '#38bdf8';
    this.lcdCtx.fillRect(barX + 2, barY + 2, (barWidth - 4) * fillPct, 8);

    if (reading.isContinuityBeep) {
      if (!this.continuityBeepPlaying) {
        this.callbacks.playTone?.(880, 'sine', 0.25, 0.15);
        this.continuityBeepPlaying = true;
      }
    } else {
      this.continuityBeepPlaying = false;
    }

    this.lcdTexture.needsUpdate = true;
    this.callbacks.onReadingChange?.(reading);
    return reading;
  }

  // -------------------------------------------------------------
  // USER ACTIONS & INTERACTION LOGIC
  // -------------------------------------------------------------
  public setProbeTerminal(probe: 'red' | 'black', terminal: TerminalId | null) {
    if (probe === 'red') {
      this.dmmState.redProbeTerminal = terminal;
      if (terminal && this.terminalPositions[terminal]) {
        // Snap probe needle tip directly into breadboard hole
        const p = this.terminalPositions[terminal];
        this.redProbeGroup.position.set(p.x, p.y + 0.012, p.z);
        // Subtle 4-deg forward tilt towards student, zero backwards lean into instruments
        this.redProbeGroup.rotation.set(-0.06, 0, -0.04);
      } else {
        // Return to resting position on benchtop
        this.redProbeGroup.position.set(this.benchX + 0.20, 0.946, 0.20);
        this.redProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6);
      }
    } else {
      this.dmmState.blackProbeTerminal = terminal;
      if (terminal && this.terminalPositions[terminal]) {
        const p = this.terminalPositions[terminal];
        this.blackProbeGroup.position.set(p.x, p.y + 0.012, p.z);
        this.blackProbeGroup.rotation.set(-0.06, 0, 0.04);
      } else {
        this.blackProbeGroup.position.set(this.benchX + 0.26, 0.946, 0.20);
        this.blackProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6);
      }
    }

    this.updateCables();
    this.updateDisplay();
    if (terminal) this.callbacks.onProbePlaced?.(probe, terminal);
  }

  public cycleMode() {
    const modes: MultimeterMode[] = ['v_dc', 'v_ac', 'a_dc', 'a_ac', 'ohm', 'cont'];
    const nextIdx = (modes.indexOf(this.dmmState.mode) + 1) % modes.length;
    this.setMode(modes[nextIdx]);
  }

  public setMode(mode: MultimeterMode) {
    this.dmmState.mode = mode;
    const angles: Record<MultimeterMode, number> = {
      v_dc: 0,
      v_ac: Math.PI / 4,
      a_dc: Math.PI / 2,
      a_ac: (3 * Math.PI) / 4,
      ohm: Math.PI,
      cont: (5 * Math.PI) / 4,
    };
    if (this.rotaryDialMesh) {
      this.rotaryDialMesh.rotation.y = angles[mode];
    }
    this.updateDisplay();
  }

  public setRedJack(jack: 'v_ohm' | 'ma_10a') {
    this.dmmState.redJack = jack;
    this.updateCables();
    this.updateDisplay();
  }

  public toggleSeriesJumper() {
    this.circuitState.seriesJumperConnected = !this.circuitState.seriesJumperConnected;
    if (this.seriesJumperPlugMesh) {
      // When opened, the jumper lifts up and shifts to parked state beside socket
      if (this.circuitState.seriesJumperConnected) {
        this.seriesJumperPlugMesh.position.set(0, 0, 0);
      } else {
        this.seriesJumperPlugMesh.position.set(0, 0.025, 0.025);
      }
    }
    this.updateDisplay();
  }

  public resetFuse() {
    this.dmmState.fuseBlown = false;
    this.updateDisplay();
  }

  public updateCircuitParameters(params: Partial<CircuitState>) {
    Object.assign(this.circuitState, params);
    this.updateDisplay();
  }
}
