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
  onProbePlaced?: (probe: 'red' | 'black', terminal: TerminalId | null) => void;
  onActiveProbeChange?: (probe: 'red' | 'black') => void;
  onModeChange?: (mode: MultimeterMode) => void;
  onJackChange?: (jack: MultimeterJack) => void;
  onJumperChange?: (closed: boolean) => void;
  onFuseTripped?: () => void;
  playTone?: (freq: number, type: OscillatorType, duration: number, vol: number) => void;
  onHoverTooltip?: (tooltip: string | null) => void;
};

const BENCH_MAT_TOP_Y = 0.9324;
const TABLE_CABLE_Y = BENCH_MAT_TOP_Y + 0.0045;
const PROBE_PARK_Y = BENCH_MAT_TOP_Y + 0.0115;
const PROBE_LIFT_Y = PROBE_PARK_Y + 0.016;

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
  public activeProbe: 'red' | 'black' = 'red';
  public interactableMeshes: THREE.Object3D[] = [];

  private lcdCanvas: HTMLCanvasElement;
  private lcdCtx: CanvasRenderingContext2D;
  private lcdTexture: THREE.CanvasTexture;
  private breadboardTexture: THREE.CanvasTexture | null = null;
  public rotaryDialMesh: THREE.Mesh | null = null;
  public comJackMesh: THREE.Mesh | null = null;
  public redLeadJackMesh: THREE.Mesh | null = null;
  public maJackMesh: THREE.Mesh | null = null;

  // Probes & Cables
  public redProbeGroup: THREE.Group;
  public blackProbeGroup: THREE.Group;
  private redCableMesh: THREE.Mesh | null = null;
  private blackCableMesh: THREE.Mesh | null = null;
  private psuWiresGroup: THREE.Group | null = null;
  private bncCablesGroup: THREE.Group | null = null;

  // Circuit Hardware Meshes
  public seriesJumperMesh: THREE.Group | null = null;
  public terminalHitboxes: Partial<Record<TerminalId, THREE.Mesh>> = {};
  private seriesJumperPlugMesh: THREE.Mesh | null = null;
  private dynamicTopologyGroup: THREE.Group | null = null;
  private lastTopologyVisualKey = '';
  public boardBaseMesh: THREE.Mesh | null = null;
  public boardGroup: THREE.Group | null = null;
  public meterGroup: THREE.Group | null = null;
  public resistorGroups: Record<'R1' | 'R2' | 'R3', THREE.Group> | null = null;

  // Exact world-space anchors synced to Room 3 benchtop GLB jacks/posts
  private instrumentAnchors: {
    psuRedPost: THREE.Vector3;
    psuBlackPost: THREE.Vector3;
    psuRotY: number;
    oscCh1Bnc: THREE.Vector3;
    oscCh2Bnc: THREE.Vector3;
    fgenMainBnc: THREE.Vector3;
    fgenRotY: number;
  };

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
      mode: 'cont',
      redJack: 'v_ohm',
      redProbeTerminal: null,
      blackProbeTerminal: null,
      fuseBlown: false,
    };

    this.circuitState = {
      mode: 'dc',
      topology: 'series',
      powerOn: false,
      sourceVoltage: 0.0,
      frequency: 60.0,
      waveType: 'sine',
      r1: 100.0,
      r2: 220.0,
      r3: 330.0,
      inductanceMh: 150.0,
      capacitanceUf: 47.0,
      seriesJumperConnected: true,
    };

    // Terminal World Positions on Workbench (grounded cleanly onto ESD mat y = 0.9324m)
    // Solderless Breadboard rests on 6mm rubber feet (-0.015m) -> center y = 0.9474m
    // Board dimensions: Width = 0.52m, Depth = 0.20m
    const bbX = benchX - 0.06;
    const bbY = BENCH_MAT_TOP_Y + 0.015 + 0.0118; // Breadboard top plate surface y = 0.9592m
    const bbZ = 0.10;

    // Default analytical world positions of GLB binding posts & BNC jacks (updated on GLB load via setInstrumentAnchors)
    this.instrumentAnchors = {
      psuRedPost: new THREE.Vector3(benchX - 0.7246, BENCH_MAT_TOP_Y + 0.039, -0.2713),
      psuBlackPost: new THREE.Vector3(benchX - 0.6728, BENCH_MAT_TOP_Y + 0.039, -0.2755),
      psuRotY: 0.08,
      oscCh1Bnc: new THREE.Vector3(benchX - 0.05 + 0.069, BENCH_MAT_TOP_Y + 0.029, -0.52 + 0.173),
      oscCh2Bnc: new THREE.Vector3(benchX - 0.05 + 0.115, BENCH_MAT_TOP_Y + 0.029, -0.52 + 0.173),
      fgenMainBnc: new THREE.Vector3(benchX + 0.65 + 0.0509, BENCH_MAT_TOP_Y + 0.0325, -0.48 + 0.1786),
      fgenRotY: -0.08,
    };

    // Exact geometric alignment with 3D breadboard columns and component leads:
    // Col 10: x = -0.1476m, Col 14: x = -0.1188m, Col 28: x = -0.0180m, Col 38: x = +0.0540m, Col 48: x = +0.1260m
    // Top Red Rail: z = -0.0771m, Top Blue Rail: z = -0.0638m
    // Row B: z = -0.0356m, Row C: z = -0.0273m, Row D: z = -0.0189m
    this.terminalPositions = {
      SRC_POS: new THREE.Vector3(bbX - 0.1476, bbY, bbZ - 0.0771), // Top Red Rail at Col 10 (+24V DC input)
      SRC_NEG: new THREE.Vector3(bbX + 0.1260, bbY, bbZ - 0.0638), // Top Blue Rail at Col 48 (0V GND return)
      SERIES_JACK_A: new THREE.Vector3(bbX - 0.1476, bbY, bbZ - 0.0439), // Col 10 Row A (Upstream +24V ammeter jack)
      SERIES_JACK_B: new THREE.Vector3(bbX - 0.1188, bbY, bbZ - 0.0439), // Col 14 Row A (Downstream ammeter jack to R1)
      R1_A: new THREE.Vector3(bbX - 0.1188, bbY, bbZ - 0.0273), // Col 14 Row C (+24V input side of 100 Ω resistor)
      R1_B: new THREE.Vector3(bbX - 0.0180, bbY, bbZ - 0.0273), // Col 28 Row C (+20.31V output of 100 Ω resistor)
      R2_A: new THREE.Vector3(bbX - 0.0180, bbY, bbZ - 0.0189), // Col 28 Row D (+20.31V input side of 220 Ω resistor)
      R2_B: new THREE.Vector3(bbX + 0.0540, bbY, bbZ - 0.0189), // Col 38 Row D (+12.18V output of 220 Ω resistor)
      R3_A: new THREE.Vector3(bbX + 0.0540, bbY, bbZ - 0.0273), // Col 38 Row C (+12.18V input side of 330 Ω resistor)
      R3_B: new THREE.Vector3(bbX + 0.1260, bbY, bbZ - 0.0273), // Col 48 Row C (0V GND return side of 330 Ω resistor)
      IND_A: new THREE.Vector3(bbX - 0.1188, bbY, bbZ + 0.0273), // Row H auxiliary
      IND_B: new THREE.Vector3(bbX - 0.0180, bbY, bbZ + 0.0273),
      CAP_A: new THREE.Vector3(bbX + 0.0540, bbY, bbZ + 0.0273),
      CAP_B: new THREE.Vector3(bbX + 0.1260, bbY, bbZ + 0.0273),
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
    this.buildInstrumentBncCables();
    this.updateDisplay();
  }

  // -------------------------------------------------------------
  // BUILD AUTHENTIC SOLDERLESS BREADBOARD (830 TIE POINTS REPLICA)
  // Clean, high-precision electronic trainer based on MB-102 standard
  // -------------------------------------------------------------
  private buildSolderlessBreadboard() {
    const boardGroup = new THREE.Group();
    boardGroup.name = 'Solderless_Breadboard_Unit';
    this.boardGroup = boardGroup;
    // Ground rubber feet (-0.015m) flush onto ESD mat (y = 0.9324m)
    boardGroup.position.set(this.benchX - 0.06, BENCH_MAT_TOP_Y + 0.015, 0.10);

    // 1. High-Grade Injection Molded White ABS Housing with Chamfered Edges
    const absMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.50,
      metalness: 0.02,
    });
    this.boardBaseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.022, 0.20), absMat);
    this.boardBaseMesh.castShadow = true;
    this.boardBaseMesh.receiveShadow = true;
    boardGroup.add(this.boardBaseMesh);

    // Rubber mounting pads on bottom
    const footMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.9 });
    const footPositions = [
      [-0.24, -0.012, -0.08],
      [0.24, -0.012, -0.08],
      [-0.24, -0.012, 0.08],
      [0.24, -0.012, 0.08],
    ];
    footPositions.forEach(([fx, fy, fz]) => {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.006, 16), footMat);
      foot.position.set(fx, fy, fz);
      boardGroup.add(foot);
    });

    // Interlocking tabs on left and right sides (classic breadboard dovetail tabs)
    [-0.04, 0.04].forEach((tz) => {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.020), absMat);
      tab.position.set(0.264, 0, tz);
      boardGroup.add(tab);
    });

    // 2. High-Resolution Photorealistic Solderless Breadboard Silk Texture (2048 x 1024)
    const bCanvas = document.createElement('canvas');
    bCanvas.width = 2048;
    bCanvas.height = 1024;
    const ctx = bCanvas.getContext('2d')!;

    // Clean matte eggshell / laboratory plastic face
    ctx.fillStyle = '#f1f3f5';
    ctx.fillRect(0, 0, 2048, 1024);

    // Subtle edge bevel border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 16, 2016, 992);

    // Helpers for drawing contact tie points
    const drawTiePoint = (cx: number, cy: number) => {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(cx - 7, cy - 7, 14, 14, 2.5);
      ctx.fill();

      // Subtle nickel leaf spring contact highlight
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(cx - 2.5, cy - 5, 5, 10);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cx - 1, cy - 4, 2, 8);
    };

    const startX = 178;
    const colStep = (1870 - 178) / 59; // 28.678 px per column

    // A. Top Power Distribution Bus (Red + and Blue - rails)
    // Red rail line
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(startX, 82);
    ctx.lineTo(startX + 59 * colStep, 82);
    ctx.stroke();

    // Red + markers
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#dc2626';
    for (let i = 0; i < 60; i += 5) {
      ctx.fillText('+', startX + i * colStep - 7, 74);
    }

    // Top Red Rail Holes
    for (let i = 0; i < 60; i++) {
      drawTiePoint(startX + i * colStep, 110);
    }

    // Blue rail line
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(startX, 152);
    ctx.lineTo(startX + 59 * colStep, 152);
    ctx.stroke();

    // Blue - markers
    ctx.fillStyle = '#2563eb';
    for (let i = 0; i < 60; i += 5) {
      ctx.fillText('-', startX + i * colStep - 6, 144);
    }

    // Top Blue Rail Holes
    for (let i = 0; i < 60; i++) {
      drawTiePoint(startX + i * colStep, 180);
    }

    // B. Upper Terminal Strip (Rows A, B, C, D, E)
    // Column numbering above row A
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#334155';
    for (let col = 1; col <= 60; col++) {
      if (col === 1 || col % 5 === 0) {
        const xPos = startX + (col - 1) * colStep;
        ctx.fillText(col.toString(), xPos - (col >= 10 ? 12 : 6), 236);
      }
    }

    // Row letters on margins
    const rowLettersUpper = ['A', 'B', 'C', 'D', 'E'];
    const rowYUpper = [280, 324, 368, 412, 456];
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#475569';
    rowLettersUpper.forEach((letter, idx) => {
      ctx.fillText(letter, 90, rowYUpper[idx] + 7);
      ctx.fillText(letter, 1950, rowYUpper[idx] + 7);
    });

    // Draw 60 columns x 5 rows in Upper Strip
    for (let col = 0; col < 60; col++) {
      const cx = startX + col * colStep;
      for (let r = 0; r < 5; r++) {
        drawTiePoint(cx, rowYUpper[r]);
      }
    }

    // C. Center IC Notch Trough / Divider
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(startX - 20, 488, 59 * colStep + 40, 48);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX - 20, 488, 59 * colStep + 40, 48);

    // D. Lower Terminal Strip (Rows F, G, H, I, J)
    const rowLettersLower = ['F', 'G', 'H', 'I', 'J'];
    const rowYLower = [568, 612, 656, 700, 744];
    rowLettersLower.forEach((letter, idx) => {
      ctx.fillText(letter, 90, rowYLower[idx] + 7);
      ctx.fillText(letter, 1950, rowYLower[idx] + 7);
    });

    for (let col = 0; col < 60; col++) {
      const cx = startX + col * colStep;
      for (let r = 0; r < 5; r++) {
        drawTiePoint(cx, rowYLower[r]);
      }
    }

    // Column numbering below row J
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#334155';
    for (let col = 1; col <= 60; col++) {
      if (col === 1 || col % 5 === 0) {
        const xPos = startX + (col - 1) * colStep;
        ctx.fillText(col.toString(), xPos - (col >= 10 ? 12 : 6), 794);
      }
    }

    // E. Bottom Power Distribution Bus
    // Blue rail line
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(startX, 845);
    ctx.lineTo(startX + 59 * colStep, 845);
    ctx.stroke();

    ctx.fillStyle = '#2563eb';
    for (let i = 0; i < 60; i += 5) {
      ctx.fillText('-', startX + i * colStep - 6, 837);
    }

    for (let i = 0; i < 60; i++) {
      drawTiePoint(startX + i * colStep, 875);
    }

    // Red rail line
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(startX, 918);
    ctx.lineTo(startX + 59 * colStep, 918);
    ctx.stroke();

    ctx.fillStyle = '#dc2626';
    for (let i = 0; i < 60; i += 5) {
      ctx.fillText('+', startX + i * colStep - 7, 910);
    }

    for (let i = 0; i < 60; i++) {
      drawTiePoint(startX + i * colStep, 948);
    }

    // F. Educational Experiment Component Silk Markings (Precise & Elegant)
    // Series Jumper Break (Cols 10 to 14 in Rows A-B)
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(startX + 9 * colStep - 8, 298, 4 * colStep + 16, 52);
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#059669';
    ctx.fillText('SERIES BREAK', startX + 9 * colStep - 6, 290);

    // Resistor 1: Cols 14 to 28
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX + 13 * colStep - 6, 346, 14 * colStep + 12, 130);
    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('R1: 100 Ω (BRN-BLK-BRN)', startX + 13 * colStep + 6, 498);

    // Resistor 2: Cols 28 to 38
    ctx.strokeStyle = '#2563eb';
    ctx.strokeRect(startX + 27 * colStep - 6, 346, 10 * colStep + 12, 130);
    ctx.fillText('R2: 220 Ω (RED-RED-BRN)', startX + 27 * colStep + 6, 498);

    // Resistor 3: Cols 38 to 48
    ctx.strokeStyle = '#2563eb';
    ctx.strokeRect(startX + 37 * colStep - 6, 346, 10 * colStep + 12, 130);
    ctx.fillText('R3: 330 Ω (ORG-ORG-BRN)', startX + 37 * colStep + 6, 498);

    // Auxiliary AC RLC Strip (Row H: Cols 14–28 L1, Cols 38–48 C1)
    ctx.strokeStyle = '#0d9488';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX + 13 * colStep - 6, 610, 14 * colStep + 12, 96);
    ctx.fillStyle = '#0f766e';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('L1: 150 mH (FERRITE TOROID)', startX + 13 * colStep + 4, 730);

    ctx.strokeStyle = '#0284c7';
    ctx.strokeRect(startX + 37 * colStep - 6, 610, 10 * colStep + 12, 96);
    ctx.fillStyle = '#0369a1';
    ctx.fillText('C1: 47 μF (ELECTROLYTIC)', startX + 37 * colStep + 4, 730);

    // Power Inputs Legend
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('+24V DC / AC EXCITATION', startX, 48);
    ctx.fillStyle = '#2563eb';
    ctx.fillText('0V COMMON GROUND (RETURN)', startX + 34 * colStep, 48);

    const bTexture = new THREE.CanvasTexture(bCanvas);
    bTexture.colorSpace = THREE.SRGBColorSpace;
    bTexture.anisotropy = 8;
    bTexture.generateMipmaps = true;
    bTexture.minFilter = THREE.LinearMipmapLinearFilter;
    bTexture.magFilter = THREE.LinearFilter;
    this.breadboardTexture = bTexture;

    const topPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.514, 0.194),
      new THREE.MeshStandardMaterial({
        map: bTexture,
        roughness: 0.60,
        metalness: 0.02,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    topPlate.rotation.x = -Math.PI / 2;
    topPlate.position.y = 0.0118; // Cleanly elevated, zero z-fighting
    boardGroup.add(topPlate);

    // 3. Build Realistic 3D Axial Resistors with EIA Color Bands
    // Physical coordinates aligned with breadboard columns:
    // R1: Column 14 (x = -0.1188) to Column 28 (x = -0.0180), Row C (z = -0.0273)
    const r1Mesh = this.buildAxialResistor(
      100,
      [1, 0, 1, 0], // Brown-Black-Brown-Gold
      new THREE.Vector3(-0.0684, 0.020, -0.0273),
      new THREE.Vector3(-0.1188, 0.0118, -0.0273),
      new THREE.Vector3(-0.0180, 0.0118, -0.0273),
      'R1_A',
      'R1_B',
      'BRN-BLK-BRN-GLD (100 Ω ±5%)'
    );
    boardGroup.add(r1Mesh);

    // R2: Column 28 (x = -0.0180) to Column 38 (x = +0.0540), Row D (z = -0.0189)
    // Internally connected to R1 via Column 28 spring clip
    const r2Mesh = this.buildAxialResistor(
      220,
      [2, 2, 1, 0], // Red-Red-Brown-Gold
      new THREE.Vector3(0.0180, 0.020, -0.0189),
      new THREE.Vector3(-0.0180, 0.0118, -0.0189),
      new THREE.Vector3(0.0540, 0.0118, -0.0189),
      'R2_A',
      'R2_B',
      'RED-RED-BRN-GLD (220 Ω ±5%)'
    );
    boardGroup.add(r2Mesh);

    // R3: Column 38 (x = +0.0540) to Column 48 (x = +0.1260), Row C (z = -0.0273)
    // Internally connected to R2 via Column 38 spring clip
    const r3Mesh = this.buildAxialResistor(
      330,
      [3, 3, 1, 0], // Orange-Orange-Brown-Gold
      new THREE.Vector3(0.0900, 0.020, -0.0273),
      new THREE.Vector3(0.0540, 0.0118, -0.0273),
      new THREE.Vector3(0.1260, 0.0118, -0.0273),
      'R3_A',
      'R3_B',
      'ORG-ORG-BRN-GLD (330 Ω ±5%)'
    );
    boardGroup.add(r3Mesh);
    this.resistorGroups = { R1: r1Mesh, R2: r2Mesh, R3: r3Mesh };

    // 4. Build Auxiliary AC RLC Components (Toroidal Ferrite Inductor L1 & Electrolytic Capacitor C1)
    boardGroup.add(this.buildInductorComponent(new THREE.Vector3(-0.0684, 0.024, 0.0273), -0.1188, -0.0180));
    boardGroup.add(this.buildCapacitorComponent(new THREE.Vector3(0.0900, 0.024, 0.0273), 0.0540, 0.1260));

    // 5. Build Realistic 3D Breadboard Jumper Wires (Solid-Core 22 AWG Arched Wires)
    this.buildBreadboardJumpers(boardGroup);

    // 6. Dynamic Topology Bridges (visually reflect Series / Parallel / Combo / AC RLC)
    this.dynamicTopologyGroup = new THREE.Group();
    this.dynamicTopologyGroup.name = 'Breadboard_Topology_Bridges';
    boardGroup.add(this.dynamicTopologyGroup);
    this.rebuildTopologyJumpers();

    // 7. Build Series Loop Jumper Plug (Cleanly positioned at Cols 10-14, zero R1 clipping)
    this.buildSeriesJumper(boardGroup);

    this.root.add(boardGroup);
  }

  // -------------------------------------------------------------
  // BUILD REALISTIC AXIAL RESISTOR WITH EIA COLOR BANDS & 90° BENT LEADS
  // -------------------------------------------------------------
  private buildAxialResistor(
    ohms: number,
    bands: [number, number, number, number],
    bodyPos: THREE.Vector3,
    leadLeftTarget: THREE.Vector3,
    leadRightTarget: THREE.Vector3,
    leftTerminalId: TerminalId,
    rightTerminalId: TerminalId,
    bandLabel: string
  ): THREE.Group {
    const resGroup = new THREE.Group();

    // Ceramic tan body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xd2b48c,
      roughness: 0.45,
      metalness: 0.04,
    });
    const bodyLength = 0.036;
    const bodyRadius = 0.0062;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyLength, 20), bodyMat);
    body.rotation.z = Math.PI / 2;
    body.position.copy(bodyPos);
    body.castShadow = true;
    body.userData.isTerminal = true;
    body.userData.terminalId = leftTerminalId;
    body.userData.hoverTooltip = `Resistor ${ohms} Ω [${bandLabel}] · Click leads to place active probe (${leftTerminalId} / ${rightTerminalId})`;
    resGroup.userData.bodyMesh = body;
    resGroup.add(body);
    this.interactableMeshes.push(body);

    // Subtle additive thermal glow halo around energized / overloaded resistors
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const thermalHaloMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(bodyRadius * 1.45, bodyRadius * 1.45, bodyLength * 1.12, 20),
      haloMat
    );
    thermalHaloMesh.rotation.z = Math.PI / 2;
    thermalHaloMesh.position.copy(bodyPos);
    thermalHaloMesh.visible = false;
    thermalHaloMesh.raycast = () => {};
    resGroup.userData.thermalHaloMesh = thermalHaloMesh;
    resGroup.add(thermalHaloMesh);

    // Rounded bulbous end caps
    const capMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.45 });
    const cap1 = new THREE.Mesh(new THREE.SphereGeometry(bodyRadius, 16, 16), capMat);
    cap1.position.set(bodyPos.x - bodyLength / 2, bodyPos.y, bodyPos.z);
    cap1.userData.isTerminal = true;
    cap1.userData.terminalId = leftTerminalId;
    cap1.userData.hoverTooltip = `${leftTerminalId} (${ohms} Ω Left Lead) · Click to place active probe`;
    resGroup.add(cap1);
    this.interactableMeshes.push(cap1);

    const cap2 = new THREE.Mesh(new THREE.SphereGeometry(bodyRadius, 16, 16), capMat);
    cap2.position.set(bodyPos.x + bodyLength / 2, bodyPos.y, bodyPos.z);
    cap2.userData.isTerminal = true;
    cap2.userData.terminalId = rightTerminalId;
    cap2.userData.hoverTooltip = `${rightTerminalId} (${ohms} Ω Right Lead) · Click to place active probe`;
    resGroup.add(cap2);
    this.interactableMeshes.push(cap2);

    // EIA Color Bands
    const bandPositions = [-0.011, -0.004, 0.003, 0.011];
    bands.forEach((digit, idx) => {
      const color = idx === 3 ? 0xeab308 : EIA_COLORS[digit] || 0x18181b;
      const bMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: idx === 3 ? 0.85 : 0.1,
      });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius + 0.0003, bodyRadius + 0.0003, 0.003, 20), bMat);
      band.rotation.z = Math.PI / 2;
      band.position.set(bodyPos.x + bandPositions[idx], bodyPos.y, bodyPos.z);
      resGroup.add(band);
    });

    // Axial lead wires: straight out of endcaps, then bent downward 90 degrees cleanly into breadboard holes
    const leadMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 });
    const leftCapX = bodyPos.x - bodyLength / 2;
    const leadCurveLeft = new THREE.CatmullRomCurve3([
      new THREE.Vector3(leftCapX, bodyPos.y, bodyPos.z),
      new THREE.Vector3(leadLeftTarget.x + 0.003, bodyPos.y, leadLeftTarget.z),
      new THREE.Vector3(leadLeftTarget.x, leadLeftTarget.y, leadLeftTarget.z),
    ]);
    const leadMeshLeft = new THREE.Mesh(new THREE.TubeGeometry(leadCurveLeft, 14, 0.0013, 8, false), leadMat);
    leadMeshLeft.userData.isTerminal = true;
    leadMeshLeft.userData.terminalId = leftTerminalId;
    leadMeshLeft.userData.hoverTooltip = `${leftTerminalId} (${ohms} Ω Left Terminal) · Click to place active probe`;
    resGroup.add(leadMeshLeft);
    this.interactableMeshes.push(leadMeshLeft);

    const rightCapX = bodyPos.x + bodyLength / 2;
    const leadCurveRight = new THREE.CatmullRomCurve3([
      new THREE.Vector3(rightCapX, bodyPos.y, bodyPos.z),
      new THREE.Vector3(leadRightTarget.x - 0.003, bodyPos.y, leadRightTarget.z),
      new THREE.Vector3(leadRightTarget.x, leadRightTarget.y, leadRightTarget.z),
    ]);
    const leadMeshRight = new THREE.Mesh(new THREE.TubeGeometry(leadCurveRight, 14, 0.0013, 8, false), leadMat);
    leadMeshRight.userData.isTerminal = true;
    leadMeshRight.userData.terminalId = rightTerminalId;
    leadMeshRight.userData.hoverTooltip = `${rightTerminalId} (${ohms} Ω Right Terminal) · Click to place active probe`;
    resGroup.add(leadMeshRight);
    this.interactableMeshes.push(leadMeshRight);

    return resGroup;
  }

  // -------------------------------------------------------------
  // BUILD TOROIDAL FERRITE INDUCTOR (L1) & ELECTROLYTIC CAPACITOR (C1)
  // Mounted along auxiliary Row H (Cols 14-28 & 38-48) for AC RLC studies
  // -------------------------------------------------------------
  private buildInductorComponent(centerPos: THREE.Vector3, leftColX: number, rightColX: number): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Breadboard_Inductor_L1';

    const toroidMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.25 });
    const core = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0045, 14, 28), toroidMat);
    core.position.copy(centerPos);
    core.rotation.x = Math.PI / 6;
    core.castShadow = true;
    group.add(core);

    // Enamel copper windings radially around the ferrite core
    const copperMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.22, metalness: 0.9 });
    for (let i = 0; i < 16; i++) {
      const theta = (i / 16) * Math.PI * 2;
      const wind = new THREE.Mesh(new THREE.TorusGeometry(0.0052, 0.0011, 8, 14), copperMat);
      wind.position.set(
        centerPos.x + Math.cos(theta) * 0.0115,
        centerPos.y + Math.sin(theta) * 0.0115 * Math.sin(Math.PI / 6),
        centerPos.z + Math.sin(theta) * 0.0115 * Math.cos(Math.PI / 6)
      );
      wind.rotation.y = -theta;
      group.add(wind);
    }

    const addLead = (startX: number, colX: number) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, centerPos.y - 0.003, centerPos.z),
        new THREE.Vector3(colX, centerPos.y - 0.004, centerPos.z),
        new THREE.Vector3(colX, 0.0118, centerPos.z),
      ]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0012, 8, false), copperMat));
    };
    addLead(centerPos.x - 0.013, leftColX);
    addLead(centerPos.x + 0.013, rightColX);
    return group;
  }

  private buildCapacitorComponent(centerPos: THREE.Vector3, leftColX: number, rightColX: number): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Breadboard_Capacitor_C1';

    // Electrolytic cylindrical sleeve (deep navy blue) mounted axially/tilted above Row H
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3, metalness: 0.25 });
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.026, 20), sleeveMat);
    can.rotation.z = Math.PI / 2;
    can.position.copy(centerPos);
    can.castShadow = true;
    group.add(can);

    // Polarity negative stripe band along sleeve
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0092, 0.0092, 0.024, 16, 1, false, -0.35, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 })
    );
    stripe.rotation.z = Math.PI / 2;
    stripe.position.copy(centerPos);
    group.add(stripe);

    // Brushed aluminum safety-vent top cap
    const aluMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.2, metalness: 0.92 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.002, 20), aluMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(centerPos.x + 0.0135, centerPos.y, centerPos.z);
    group.add(cap);

    const leadMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.15, metalness: 0.95 });
    const addLead = (startX: number, colX: number) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, centerPos.y - 0.002, centerPos.z),
        new THREE.Vector3(colX, centerPos.y - 0.003, centerPos.z),
        new THREE.Vector3(colX, 0.0118, centerPos.z),
      ]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0012, 8, false), leadMat));
    };
    addLead(centerPos.x - 0.013, leftColX);
    addLead(centerPos.x + 0.013, rightColX);
    return group;
  }

  private disposeGroupContents(group: THREE.Group | null) {
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material?.dispose();
        }
      });
    }
  }

  private addArchJumper(parent: THREE.Group, p1: THREE.Vector3, p2: THREE.Vector3, color: number, archHeight = 0.008) {
    const mid = p1.clone().lerp(p2, 0.5);
    mid.y += archHeight;
    const curve = new THREE.CatmullRomCurve3([p1, mid, p2]);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 16, 0.0017, 8, false),
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 })
    );
    mesh.castShadow = true;
    parent.add(mesh);
  }

  /** Visually rewires breadboard jumper staples whenever topology (single/series/parallel/combo) or mode changes. */
  public rebuildTopologyJumpers() {
    if (!this.dynamicTopologyGroup) return;
    const visualKey = `${this.circuitState.topology}:${this.circuitState.mode}`;
    if (visualKey === this.lastTopologyVisualKey) return;
    this.lastTopologyVisualKey = visualKey;
    this.disposeGroupContents(this.dynamicTopologyGroup);

    const g = this.dynamicTopologyGroup;
    const y = 0.0118;
    const { topology, mode } = this.circuitState;

    if (topology === 'parallel') {
      // Feed + rail to R1_A (Col 14), R2_A (Col 28), R3_A (Col 38) + Blue GND returns from Col 28/38
      this.addArchJumper(g, new THREE.Vector3(-0.0180, y, -0.0771), new THREE.Vector3(-0.0180, y, -0.0189), 0xef4444, 0.009);
      this.addArchJumper(g, new THREE.Vector3(0.0540, y, -0.0771), new THREE.Vector3(0.0540, y, -0.0273), 0xef4444, 0.010);
      this.addArchJumper(g, new THREE.Vector3(-0.0180, y, -0.0439), new THREE.Vector3(-0.0180, y, -0.0638), 0x3b82f6, 0.007);
      this.addArchJumper(g, new THREE.Vector3(0.0540, y, -0.0439), new THREE.Vector3(0.0540, y, -0.0638), 0x3b82f6, 0.008);
    } else if (topology === 'combo') {
      // R1 feeds parallel R2 || R3 node; shared return bus to Col 48
      this.addArchJumper(g, new THREE.Vector3(-0.0180, y, -0.0439), new THREE.Vector3(0.0540, y, -0.0439), 0xf59e0b, 0.009);
      this.addArchJumper(g, new THREE.Vector3(0.0540, y, -0.0189), new THREE.Vector3(0.1260, y, -0.0189), 0x3b82f6, 0.009);
    } else if (topology === 'single') {
      // Green bypass jumper from Col 14 directly to Col 38 (isolating R3 only)
      this.addArchJumper(g, new THREE.Vector3(-0.1188, y, -0.0356), new THREE.Vector3(0.0540, y, -0.0356), 0x10b981, 0.012);
    } else {
      // Series node-tie staples between R1/R2 (Col 28) and R2/R3 (Col 38)
      this.addArchJumper(g, new THREE.Vector3(-0.0180, y, -0.0273), new THREE.Vector3(-0.0180, y, -0.0189), 0xeab308, 0.004);
      this.addArchJumper(g, new THREE.Vector3(0.0540, y, -0.0189), new THREE.Vector3(0.0540, y, -0.0273), 0xeab308, 0.004);
    }

    if (mode === 'ac') {
      // Tie L1 & C1 auxiliary AC RLC strip across lower bus when AC sinusoidal sweep is active
      this.addArchJumper(g, new THREE.Vector3(-0.1188, y, -0.0189), new THREE.Vector3(-0.1188, y, 0.0273), 0x0d9488, 0.011);
      this.addArchJumper(g, new THREE.Vector3(-0.0180, y, 0.0273), new THREE.Vector3(0.0540, y, 0.0273), 0x0d9488, 0.008);
      this.addArchJumper(g, new THREE.Vector3(0.1260, y, 0.0273), new THREE.Vector3(0.1260, y, -0.0189), 0x0284c7, 0.011);
    }
  }

  // -------------------------------------------------------------
  // BUILD 3D SOLID-CORE BREADBOARD JUMPER WIRES
  // Insulated 22 AWG solid-core wire connecting power rails
  // -------------------------------------------------------------
  private buildBreadboardJumpers(boardGroup: THREE.Group) {
    // 1. Red Jumper Wire (+24V power rail to Ammeter Break Socket A at Col 10)
    this.addArchJumper(
      boardGroup,
      new THREE.Vector3(-0.1476, 0.0118, -0.0771),
      new THREE.Vector3(-0.1476, 0.0118, -0.0439),
      0xdc2626,
      0.008
    );

    // 2. Black Jumper Wire (R3 Ground Return at Col 48 back to Top Blue Ground Rail)
    this.addArchJumper(
      boardGroup,
      new THREE.Vector3(0.1260, 0.0118, -0.0439),
      new THREE.Vector3(0.1260, 0.0118, -0.0638),
      0x18181b,
      0.008
    );
  }

  // -------------------------------------------------------------
  // BUILD SERIES CURRENT JUMPER PLUG
  // Authentic solid-core arched U-jumper bridging Ammeter Sockets at Cols 10 & 14 Row A
  // -------------------------------------------------------------
  private buildSeriesJumper(boardGroup: THREE.Group) {
    this.seriesJumperMesh = new THREE.Group();
    this.seriesJumperMesh.name = 'Series_Loop_Jumper_Assembly';
    this.seriesJumperMesh.position.set(-0.1332, 0.016, -0.0439);

    // Realistic solid-core arched U-jumper wire (with sleek central grab-tab) bridging Cols 10 & 14
    const jumperCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.0144, 0, 0),
      new THREE.Vector3(-0.0144, 0.007, 0),
      new THREE.Vector3(0, 0.011, 0),
      new THREE.Vector3(0.0144, 0.007, 0),
      new THREE.Vector3(0.0144, 0, 0),
    ]);
    const wireMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Distinctive blue lab jumper wire
      roughness: 0.35,
      metalness: 0.1,
    });
    this.seriesJumperPlugMesh = new THREE.Mesh(new THREE.TubeGeometry(jumperCurve, 16, 0.0020, 8, false), wireMat);
    this.seriesJumperPlugMesh.castShadow = true;
    this.seriesJumperMesh.add(this.seriesJumperPlugMesh);

    // Molded pull-tab at top center of jumper for realistic handling
    const tabMat = new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.4 });
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.004), tabMat);
    tab.position.set(0, 0.010, 0);
    this.seriesJumperMesh.add(tab);

    // Gold banana pins plunging into board sockets (Cols 10 and 14)
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.15 });
    const pin1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.012, 12), pinMat);
    pin1.position.set(-0.0144, -0.005, 0);
    this.seriesJumperMesh.add(pin1);

    const pin2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.012, 12), pinMat);
    pin2.position.set(0.0144, -0.005, 0);
    this.seriesJumperMesh.add(pin2);

    // Raycast Click Hitbox
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.035, 0.030),
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
    this.meterGroup = meterGroup;
    // Tilted 11.5 deg (+0.20 rad X) in local YXZ frame so both front rubber corners sit level at BENCH_MAT_TOP_Y
    meterGroup.position.set(this.benchX + 0.30, BENCH_MAT_TOP_Y + 0.0508, 0.10);
    meterGroup.rotation.order = 'YXZ';
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

    // Rear kick-stand prop: hinged inside rear housing, bottom edge aligned to -0.0508m (ESD mat)
    const standMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.008, 0.09), standMat);
    stand.position.set(0, -0.0444, -0.032);
    stand.rotation.x = -0.42;
    stand.castShadow = true;
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
    if (this.dmmState.mode === 'cont') {
      this.rotaryDialMesh.rotation.y = (5 * Math.PI) / 4;
    }
    meterGroup.add(this.rotaryDialMesh);
    this.interactableMeshes.push(this.rotaryDialMesh);

    // 4mm Input Jacks
    const jackRedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.4, roughness: 0.3 });
    const jackBlackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.4, roughness: 0.3 });

    // COM Jack (Black)
    this.comJackMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 16), jackBlackMat);
    this.comJackMesh.name = 'DMM_Jack_COM';
    this.comJackMesh.position.set(0.010, 0.032, 0.088);
    this.comJackMesh.userData.isInteractable = true;
    this.comJackMesh.userData.action = 'toggle_red_jack';
    this.comJackMesh.userData.hoverTooltip = 'COM (-) Ground Reference Jack · Black test lead return';
    meterGroup.add(this.comJackMesh);
    this.interactableMeshes.push(this.comJackMesh);

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

    // Front-panel silkscreen markings (rotary dial positions & jack labels)
    if (typeof document !== 'undefined') {
      const silkCanvas = document.createElement('canvas');
      silkCanvas.width = 512;
      silkCanvas.height = 640;
      const sctx = silkCanvas.getContext('2d');
      if (sctx) {
        sctx.clearRect(0, 0, 512, 640);

        // Dial arc guide ring centered at actual rotaryDialMesh Z (0.024 -> py = 267)
        const dialCx = 256;
        const dialCy = 267;
        sctx.strokeStyle = 'rgba(244, 211, 94, 0.55)';
        sctx.lineWidth = 3;
        sctx.beginPath();
        sctx.arc(dialCx, dialCy, 114, -Math.PI * 0.98, Math.PI * 0.65);
        sctx.stroke();

        // Rotary dial position labels aligned exactly to setMode() CCW angles from -Z (top)
        const dialMarks: { label: string; angleDeg: number; color: string }[] = [
          { label: 'V⎓', angleDeg: -90, color: '#fde68a' },
          { label: 'V~', angleDeg: -135, color: '#fde68a' },
          { label: 'A⎓', angleDeg: 180, color: '#7dd3fc' },
          { label: 'A~', angleDeg: 135, color: '#7dd3fc' },
          { label: 'Ω', angleDeg: 90, color: '#6ee7b7' },
          { label: 'CONT', angleDeg: 45, color: '#34d399' },
        ];
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        dialMarks.forEach(({ label, angleDeg, color }) => {
          const rad = (angleDeg * Math.PI) / 180;
          const tickInner = 110;
          const tickOuter = 124;
          sctx.strokeStyle = color;
          sctx.lineWidth = 3.5;
          sctx.beginPath();
          sctx.moveTo(dialCx + Math.cos(rad) * tickInner, dialCy + Math.sin(rad) * tickInner);
          sctx.lineTo(dialCx + Math.cos(rad) * tickOuter, dialCy + Math.sin(rad) * tickOuter);
          sctx.stroke();

          const lx = dialCx + Math.cos(rad) * 164;
          const ly = dialCy + Math.sin(rad) * 124;
          sctx.fillStyle = 'rgba(22, 10, 14, 0.90)';
          sctx.fillRect(lx - 32, ly - 15, 64, 30);
          sctx.strokeStyle = 'rgba(244, 211, 94, 0.50)';
          sctx.lineWidth = 1.5;
          sctx.strokeRect(lx - 32, ly - 15, 64, 30);
          sctx.fillStyle = color;
          sctx.font = 'bold 21px system-ui, sans-serif';
          sctx.fillText(label, lx, ly + 1);
        });

        // Input jack silkscreen plates aligned to exact X positions: mA(-0.038)->85, COM(0.010)->301, V·Ω(0.038)->427
        const jackMarks: { x: number; title: string; sub: string; bg: string; fg: string }[] = [
          { x: 85, title: 'mA/10A', sub: 'CURRENT (+)', bg: 'rgba(127, 29, 29, 0.92)', fg: '#fecaca' },
          { x: 301, title: 'COM (-)', sub: 'GROUND REF', bg: 'rgba(24, 24, 27, 0.94)', fg: '#e5e7eb' },
          { x: 427, title: 'V·Ω (+)', sub: 'VOLT / OHM', bg: 'rgba(127, 29, 29, 0.92)', fg: '#fde68a' },
        ];
        jackMarks.forEach(({ x, title, sub, bg, fg }) => {
          sctx.fillStyle = bg;
          sctx.fillRect(x - 54, 446, 108, 46);
          sctx.strokeStyle = fg;
          sctx.lineWidth = 2;
          sctx.strokeRect(x - 54, 446, 108, 46);
          sctx.fillStyle = fg;
          sctx.font = 'bold 20px system-ui, sans-serif';
          sctx.fillText(title, x, 462);
          sctx.font = '600 12px system-ui, sans-serif';
          sctx.fillText(sub, x, 480);
        });

        // Safety rating footer beneath the jacks
        sctx.fillStyle = 'rgba(253, 230, 138, 0.78)';
        sctx.font = 'bold 14px system-ui, sans-serif';
        sctx.fillText('CAT III 600V · MAX 10A FUSED', 256, 616);

        const silkTex = new THREE.CanvasTexture(silkCanvas);
        silkTex.colorSpace = THREE.SRGBColorSpace;
        silkTex.anisotropy = 4;
        const silkMat = new THREE.MeshBasicMaterial({
          map: silkTex,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        });
        const silkPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.114, 0.145), silkMat);
        silkPlane.name = 'DMM_FrontPanel_Silkscreen';
        silkPlane.position.set(0, 0.0305, 0.036);
        silkPlane.rotation.x = -Math.PI / 2;
        meterGroup.add(silkPlane);
      }
    }

    this.root.add(meterGroup);
  }

  // -------------------------------------------------------------
  // BUILD TERMINAL SOCKETS ON BREADBOARD (SUBTLE FLUSH CONTACTS)
  // -------------------------------------------------------------
  private buildTerminalSockets() {
    const contactMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.25 });

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

    // Only render active circuit terminals for the DC Series Breadboard
    const activeTerminals: TerminalId[] = [
      'SRC_POS',
      'SRC_NEG',
      'SERIES_JACK_A',
      'SERIES_JACK_B',
      'R1_A',
      'R1_B',
      'R2_A',
      'R2_B',
      'R3_A',
      'R3_B',
    ];

    activeTerminals.forEach((tId) => {
      const pos = this.terminalPositions[tId];
      if (!pos) return;

      const socketGroup = new THREE.Group();
      socketGroup.position.copy(pos);

      // Subtle flush nickel contact ring inside hole (zero giant washers!)
      const contactRing = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.0008, 12), contactMat);
      contactRing.position.y = 0.0004;
      socketGroup.add(contactRing);

      // Inner banana/pin contact hole
      const innerHole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0013, 0.0013, 0.002, 10),
        new THREE.MeshBasicMaterial({ color: 0x0f172a })
      );
      innerHole.position.y = 0.001;
      socketGroup.add(innerHole);

      // Clickable Hitbox Mesh for Raycasting (tight radius prevents cross-column overlap)
      const hitbox = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.025, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
      );
      hitbox.name = `Terminal_${tId}`;
      hitbox.userData.isTerminal = true;
      hitbox.userData.terminalId = tId;
      hitbox.userData.hoverTooltip = terminalTooltips[tId] || `Terminal ${tId} · Click to attach probe`;
      socketGroup.add(hitbox);
      this.interactableMeshes.push(hitbox);
      this.terminalHitboxes[tId] = hitbox;

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
      hitbox.userData.isInteractable = true;
      hitbox.userData.action = 'select_probe';
      hitbox.userData.isProbe = true;
      hitbox.userData.probeColor = color === 0xef4444 ? 'red' : 'black';
      hitbox.userData.hoverTooltip = color === 0xef4444
        ? 'Red Test Probe (+) · Click to pick up Red Lead, then click any circuit terminal'
        : 'Black Test Probe (COM) · Click to pick up Black Lead, then click any circuit terminal';
      group.add(hitbox);
      this.interactableMeshes.push(hitbox);

      return group;
    };

    // Red Probe
    const redMesh = createProbeMesh(0xef4444, 'Probe_Red');
    this.redProbeGroup.add(redMesh);
    // Resting position in staging area to the right of the breadboard (flush on ESD mat)
    this.redProbeGroup.position.set(this.benchX + 0.20, PROBE_PARK_Y, 0.20);
    this.redProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6); // Flat on benchtop
    this.root.add(this.redProbeGroup);

    // Black Probe
    const blackMesh = createProbeMesh(0x18181b, 'Probe_Black');
    this.blackProbeGroup.add(blackMesh);
    this.blackProbeGroup.position.set(this.benchX + 0.26, PROBE_PARK_Y, 0.20);
    this.blackProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6);
    this.root.add(this.blackProbeGroup);

    this.updateCables();
  }

  /** Sync cable origins to exact loaded GLB binding post / BNC jack world positions. */
  public setInstrumentAnchors(anchors: Partial<typeof this.instrumentAnchors>) {
    if (anchors.psuRedPost) this.instrumentAnchors.psuRedPost.copy(anchors.psuRedPost);
    if (anchors.psuBlackPost) this.instrumentAnchors.psuBlackPost.copy(anchors.psuBlackPost);
    if (anchors.psuRotY !== undefined) this.instrumentAnchors.psuRotY = anchors.psuRotY;
    if (anchors.oscCh1Bnc) this.instrumentAnchors.oscCh1Bnc.copy(anchors.oscCh1Bnc);
    if (anchors.oscCh2Bnc) this.instrumentAnchors.oscCh2Bnc.copy(anchors.oscCh2Bnc);
    if (anchors.fgenMainBnc) this.instrumentAnchors.fgenMainBnc.copy(anchors.fgenMainBnc);
    if (anchors.fgenRotY !== undefined) this.instrumentAnchors.fgenRotY = anchors.fgenRotY;
    this.buildPsuFeedWires();
    this.buildInstrumentBncCables();
  }

  // -------------------------------------------------------------
  // BUILD POWER FEED HOOKUP WIRES FROM DC PSU TO BREADBOARD
  // Aligned precisely with dc_power_supply.glb binding posts
  // -------------------------------------------------------------
  private buildPsuFeedWires() {
    if (!this.psuWiresGroup) {
      this.psuWiresGroup = new THREE.Group();
      this.psuWiresGroup.name = 'PSU_Hookup_Wires';
      this.root.add(this.psuWiresGroup);
    } else {
      this.disposeGroupContents(this.psuWiresGroup);
    }

    const { psuRedPost, psuBlackPost, psuRotY } = this.instrumentAnchors;
    const posPos = this.terminalPositions.SRC_POS;
    const negPos = this.terminalPositions.SRC_NEG;
    const fwdDir = new THREE.Vector3(Math.sin(psuRotY), 0, Math.cos(psuRotY));

    const addBananaPlug = (postPos: THREE.Vector3, wireColor: number, wayPts: THREE.Vector3[]) => {
      const bootMat = new THREE.MeshStandardMaterial({ color: wireColor, roughness: 0.35, metalness: 0.15 });
      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.036, 16), bootMat);
      boot.rotation.order = 'YXZ';
      boot.rotation.y = psuRotY;
      boot.rotation.x = Math.PI / 2 - 0.12;
      boot.position.copy(postPos).addScaledVector(fwdDir, 0.017);
      this.psuWiresGroup!.add(boot);

      const exitPos = postPos.clone().addScaledVector(fwdDir, 0.034).add(new THREE.Vector3(0, -0.004, 0));
      const curve = new THREE.CatmullRomCurve3([exitPos, ...wayPts], false, 'centripetal');
      const wireMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 26, 0.0035, 8, false),
        new THREE.MeshStandardMaterial({ color: wireColor, roughness: 0.4 })
      );
      wireMesh.castShadow = true;
      this.psuWiresGroup!.add(wireMesh);
    };

    addBananaPlug(psuRedPost, 0xdc2626, [
      new THREE.Vector3(psuRedPost.x + 0.015, TABLE_CABLE_Y + 0.016, psuRedPost.z + 0.065),
      new THREE.Vector3(this.benchX - 0.68, TABLE_CABLE_Y, -0.15),
      new THREE.Vector3(this.benchX - 0.45, TABLE_CABLE_Y, -0.09),
      new THREE.Vector3(posPos.x - 0.035, TABLE_CABLE_Y + 0.008, posPos.z - 0.015),
      posPos.clone(),
    ]);

    addBananaPlug(psuBlackPost, 0x18181b, [
      new THREE.Vector3(psuBlackPost.x + 0.02, TABLE_CABLE_Y + 0.016, psuBlackPost.z + 0.065),
      new THREE.Vector3(this.benchX - 0.58, TABLE_CABLE_Y, -0.14),
      new THREE.Vector3(this.benchX - 0.22, TABLE_CABLE_Y, -0.095),
      new THREE.Vector3(negPos.x - 0.035, TABLE_CABLE_Y + 0.008, negPos.z - 0.015),
      negPos.clone(),
    ]);
  }

  private addCoaxialCable(
    parent: THREE.Group,
    bncOrigin: THREE.Vector3,
    bncYaw: number,
    ringColor: number,
    wayPoints: THREE.Vector3[],
    clipTarget: THREE.Vector3
  ) {
    const fwd = new THREE.Vector3(Math.sin(bncYaw), 0, Math.cos(bncYaw));
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.2 });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.028, 16), metalMat);
    collar.rotation.order = 'YXZ';
    collar.rotation.y = bncYaw;
    collar.rotation.x = Math.PI / 2;
    collar.position.copy(bncOrigin).addScaledVector(fwd, 0.014);
    parent.add(collar);

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.012, 14),
      new THREE.MeshStandardMaterial({ color: ringColor, roughness: 0.35 })
    );
    band.rotation.order = 'YXZ';
    band.rotation.y = bncYaw;
    band.rotation.x = Math.PI / 2;
    band.position.copy(bncOrigin).addScaledVector(fwd, 0.031);
    parent.add(band);

    const cableStart = bncOrigin.clone().addScaledVector(fwd, 0.038);
    const clipApproach = clipTarget.clone().add(new THREE.Vector3(0, 0.024, -0.014));
    const curve = new THREE.CatmullRomCurve3([cableStart, ...wayPoints, clipApproach, clipTarget.clone()], false, 'centripetal');
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 32, 0.0038, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.48, metalness: 0.08 })
    );
    cable.castShadow = true;
    parent.add(cable);

    // Micro-grabber / alligator test clip seated onto breadboard edge
    const clip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0032, 0.0022, 0.018, 10),
      new THREE.MeshStandardMaterial({ color: ringColor, roughness: 0.35 })
    );
    clip.position.copy(clipTarget).add(new THREE.Vector3(0, 0.009, 0));
    parent.add(clip);
  }

  /** Build RG-58 coaxial leads from Oscilloscope CH1/CH2 and Function Gen BNC jacks to the breadboard. */
  private buildInstrumentBncCables() {
    if (!this.bncCablesGroup) {
      this.bncCablesGroup = new THREE.Group();
      this.bncCablesGroup.name = 'Osc_FGen_Coaxial_Cables';
      this.root.add(this.bncCablesGroup);
    } else {
      this.disposeGroupContents(this.bncCablesGroup);
    }

    const { oscCh1Bnc, oscCh2Bnc, fgenMainBnc, fgenRotY } = this.instrumentAnchors;
    const g = this.bncCablesGroup;
    const ch1Clip = this.terminalPositions.R1_A.clone().add(new THREE.Vector3(-0.006, 0, -0.008));
    const ch2Clip = this.terminalPositions.R3_B.clone().add(new THREE.Vector3(0.006, 0, -0.008));
    const fgenClip = this.terminalPositions.SRC_NEG.clone().add(new THREE.Vector3(0.045, 0, -0.013));

    this.addCoaxialCable(
      g,
      oscCh1Bnc,
      0,
      0xeab308,
      [
        new THREE.Vector3(oscCh1Bnc.x, TABLE_CABLE_Y + 0.012, oscCh1Bnc.z + 0.07),
        new THREE.Vector3(this.benchX - 0.16, TABLE_CABLE_Y, -0.14),
        new THREE.Vector3(ch1Clip.x - 0.04, TABLE_CABLE_Y, -0.02),
      ],
      ch1Clip
    );

    this.addCoaxialCable(
      g,
      oscCh2Bnc,
      0,
      0x06b6d4,
      [
        new THREE.Vector3(oscCh2Bnc.x, TABLE_CABLE_Y + 0.012, oscCh2Bnc.z + 0.08),
        new THREE.Vector3(this.benchX + 0.08, TABLE_CABLE_Y, -0.13),
        new THREE.Vector3(ch2Clip.x + 0.02, TABLE_CABLE_Y, -0.02),
      ],
      ch2Clip
    );

    this.addCoaxialCable(
      g,
      fgenMainBnc,
      fgenRotY,
      0x8b5cf6,
      [
        new THREE.Vector3(fgenMainBnc.x - 0.03, TABLE_CABLE_Y + 0.012, fgenMainBnc.z + 0.08),
        new THREE.Vector3(this.benchX + 0.42, TABLE_CABLE_Y, -0.14),
        new THREE.Vector3(fgenClip.x + 0.04, TABLE_CABLE_Y, -0.04),
      ],
      fgenClip
    );
  }

  // -------------------------------------------------------------
  // UPDATE FLEXIBLE 3D LEAD CABLES (PHYSICALLY GROUNDED DRAPING)
  // Eliminates all airborne loops, instrument clipping, and visual clutter
  // -------------------------------------------------------------
  public updateCables() {
    if (this.redCableMesh) {
      this.root.remove(this.redCableMesh);
      this.redCableMesh.geometry?.dispose();
      (this.redCableMesh.material as THREE.Material)?.dispose();
    }
    if (this.blackCableMesh) {
      this.root.remove(this.blackCableMesh);
      this.blackCableMesh.geometry?.dispose();
      (this.blackCableMesh.material as THREE.Material)?.dispose();
    }

    // Ensure matrices are up to date
    this.root.updateMatrixWorld(true);

    const dmmJackRedPos = new THREE.Vector3();
    const dmmJackBlackPos = new THREE.Vector3();
    const activeRedJack = this.dmmState.redJack === 'v_ohm' ? this.redLeadJackMesh : this.maJackMesh;
    if (activeRedJack) {
      activeRedJack.getWorldPosition(dmmJackRedPos);
    } else {
      dmmJackRedPos.set(this.benchX + 0.38 + 0.035, BENCH_MAT_TOP_Y + 0.03, 0.20);
    }
    if (this.comJackMesh) {
      this.comJackMesh.getWorldPosition(dmmJackBlackPos);
    } else {
      dmmJackBlackPos.set(this.benchX + 0.38 + 0.010, BENCH_MAT_TOP_Y + 0.03, 0.20);
    }

    const redBootPos = new THREE.Vector3();
    const blackBootPos = new THREE.Vector3();
    this.redProbeGroup.getWorldPosition(redBootPos);
    this.blackProbeGroup.getWorldPosition(blackBootPos);
    redBootPos.add(new THREE.Vector3(0, 0.12, 0));
    blackBootPos.add(new THREE.Vector3(0, 0.12, 0));

    const tableY = TABLE_CABLE_Y;

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

    // Dynamic Physical Resistor Thermal State & Hover Telemetry
    const solution = solveCircuit(this.circuitState, this.dmmState);
    if (this.resistorGroups && solution.resistors) {
      (['R1', 'R2', 'R3'] as const).forEach((key) => {
        const group = this.resistorGroups?.[key];
        const resTel = solution.resistors[key];
        if (group && resTel) {
          const bodyMesh = group.userData.bodyMesh as THREE.Mesh | undefined;
          const haloMesh = group.userData.thermalHaloMesh as THREE.Mesh | undefined;
          const isHot = resTel.powerW > 0.005;
          const emissiveColor = resTel.isOverloaded
            ? 0xef4444
            : resTel.powerW > 0.5
            ? 0xea580c
            : 0xf59e0b;
          if (bodyMesh && bodyMesh.material instanceof THREE.MeshStandardMaterial) {
            if (isHot) {
              bodyMesh.material.emissive.setHex(emissiveColor);
              bodyMesh.material.emissiveIntensity = Math.min(1.35, 0.22 + (resTel.powerPercent / 100) * 0.95);
            } else {
              bodyMesh.material.emissive.setHex(0x000000);
              bodyMesh.material.emissiveIntensity = 0;
            }
          }
          if (haloMesh && haloMesh.material instanceof THREE.MeshBasicMaterial) {
            if (isHot) {
              haloMesh.visible = true;
              haloMesh.material.color.setHex(emissiveColor);
              haloMesh.material.opacity = Math.min(0.45, 0.1 + (resTel.powerPercent / 100) * 0.35);
            } else {
              haloMesh.visible = false;
              haloMesh.material.opacity = 0;
            }
          }
          const tooltip = `Resistor ${resTel.id} (${resTel.nominalResistance.toFixed(0)} Ω ±5% · 1 W rated) · Thermal Dissipation: ${resTel.powerPercent.toFixed(1)}%${resTel.isOverloaded ? ' [⚠️ OVERLOAD]' : ''} · Probe ${resTel.id}_A and ${resTel.id}_B to measure voltage drop`;
          if (bodyMesh) {
            bodyMesh.userData.hoverTooltip = tooltip;
          }
        }
      });
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
  public setActiveProbe(probe: 'red' | 'black') {
    this.activeProbe = probe;
    // Slightly elevate whichever probe is selected when parked on the bench so student sees which hand holds it
    if (!this.dmmState.redProbeTerminal) {
      this.redProbeGroup.position.set(this.benchX + 0.20, probe === 'red' ? PROBE_LIFT_Y : PROBE_PARK_Y, 0.20);
    }
    if (!this.dmmState.blackProbeTerminal) {
      this.blackProbeGroup.position.set(this.benchX + 0.26, probe === 'black' ? PROBE_LIFT_Y : PROBE_PARK_Y, 0.20);
    }
    this.callbacks.onActiveProbeChange?.(probe);
  }

  public setProbeTerminal(probe: 'red' | 'black', terminal: TerminalId | null) {
    if (probe === 'red') {
      this.dmmState.redProbeTerminal = terminal;
      if (terminal && this.terminalPositions[terminal]) {
        // Snap probe needle tip directly into breadboard hole
        const p = this.terminalPositions[terminal];
        this.redProbeGroup.position.set(p.x, p.y, p.z);
        // Subtle 4-deg forward tilt towards student, zero backwards lean into instruments
        this.redProbeGroup.rotation.set(-0.06, 0, -0.04);
      } else {
        // Return to resting position on benchtop
        this.redProbeGroup.position.set(this.benchX + 0.20, this.activeProbe === 'red' ? PROBE_LIFT_Y : PROBE_PARK_Y, 0.20);
        this.redProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6);
      }
    } else {
      this.dmmState.blackProbeTerminal = terminal;
      if (terminal && this.terminalPositions[terminal]) {
        const p = this.terminalPositions[terminal];
        this.blackProbeGroup.position.set(p.x, p.y, p.z);
        this.blackProbeGroup.rotation.set(-0.06, 0, 0.04);
      } else {
        this.blackProbeGroup.position.set(this.benchX + 0.26, this.activeProbe === 'black' ? PROBE_LIFT_Y : PROBE_PARK_Y, 0.20);
        this.blackProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6);
      }
    }

    this.updateCables();
    this.updateDisplay();
    this.callbacks.onProbePlaced?.(probe, terminal);
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
    this.callbacks.onModeChange?.(this.dmmState.mode);
  }

  public setRedJack(jack: 'v_ohm' | 'ma_10a') {
    this.dmmState.redJack = jack;
    this.updateCables();
    this.updateDisplay();
    this.callbacks.onJackChange?.(this.dmmState.redJack);
  }

  public toggleSeriesJumper() {
    this.circuitState.seriesJumperConnected = !this.circuitState.seriesJumperConnected;
    if (this.seriesJumperMesh) {
      if (this.circuitState.seriesJumperConnected) {
        this.seriesJumperMesh.position.set(-0.1332, 0.016, -0.0439);
        this.seriesJumperMesh.rotation.set(0, 0, 0);
      } else {
        // When disconnected / opened: lifted 22mm above board and tilted back 25 degrees
        this.seriesJumperMesh.position.set(-0.1332, 0.038, -0.052);
        this.seriesJumperMesh.rotation.set(-0.45, 0, 0);
      }
    }
    this.updateDisplay();
    this.callbacks.onJumperChange?.(this.circuitState.seriesJumperConnected);
  }

  public resetFuse() {
    this.dmmState.fuseBlown = false;
    this.updateDisplay();
  }

  public updateCircuitParameters(params: Partial<CircuitState>) {
    Object.assign(this.circuitState, params);
    this.rebuildTopologyJumpers();
    this.updateDisplay();
  }

  public dispose() {
    this.lcdTexture?.dispose();
    this.breadboardTexture?.dispose();
    this.disposeGroupContents(this.psuWiresGroup);
    this.disposeGroupContents(this.bncCablesGroup);
    this.disposeGroupContents(this.dynamicTopologyGroup);
    if (this.redCableMesh) {
      this.redCableMesh.geometry?.dispose();
      (this.redCableMesh.material as THREE.Material)?.dispose();
    }
    if (this.blackCableMesh) {
      this.blackCableMesh.geometry?.dispose();
      (this.blackCableMesh.material as THREE.Material)?.dispose();
    }
  }
}
