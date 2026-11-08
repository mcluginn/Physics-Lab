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
  private jumperSprite: THREE.Sprite | null = null;
  private boardBaseMesh: THREE.Mesh | null = null;

  // Terminal Positions (World/Local coordinates)
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
    // Board is centered at benchX - 0.05, y = 0.952, z = 0.12
    this.terminalPositions = {
      SRC_POS: new THREE.Vector3(benchX - 0.31, 0.97, 0.02),
      SRC_NEG: new THREE.Vector3(benchX - 0.31, 0.97, 0.22),
      SERIES_JACK_A: new THREE.Vector3(benchX - 0.15, 0.97, 0.22),
      SERIES_JACK_B: new THREE.Vector3(benchX - 0.03, 0.97, 0.22),
      R1_A: new THREE.Vector3(benchX - 0.20, 0.97, 0.06),
      R1_B: new THREE.Vector3(benchX - 0.08, 0.97, 0.06),
      R2_A: new THREE.Vector3(benchX - 0.06, 0.97, 0.06),
      R2_B: new THREE.Vector3(benchX + 0.06, 0.97, 0.06),
      R3_A: new THREE.Vector3(benchX + 0.08, 0.97, 0.06),
      R3_B: new THREE.Vector3(benchX + 0.20, 0.97, 0.06),
      IND_A: new THREE.Vector3(benchX - 0.16, 0.97, -0.02),
      IND_B: new THREE.Vector3(benchX - 0.06, 0.97, -0.02),
      CAP_A: new THREE.Vector3(benchX + 0.06, 0.97, -0.02),
      CAP_B: new THREE.Vector3(benchX + 0.16, 0.97, -0.02),
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
    this.blackProbeGroup = new THREE.Group();

    this.buildCircuitTrainerBoard();
    this.buildMultimeterBody();
    this.buildTerminalSockets();
    this.buildProbes();
    this.buildPsuFeedWires();
    this.updateDisplay();
  }

  // -------------------------------------------------------------
  // TEXT BADGE SPRITE GENERATOR
  // -------------------------------------------------------------
  private createBadgeSprite(title: string, sub?: string, accentColor = '#38bdf8'): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;

    // Rounded card background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    const r = 16;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(6, 6, 308, 68, r) : ctx.rect(6, 6, 308, 68);
    ctx.fill();

    // Accent left bar
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(6, 6, 12, 68, [r, 0, 0, r]) : ctx.rect(6, 6, 12, 68);
    ctx.fill();

    // Border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Title text
    ctx.font = 'bold 26px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, 32, sub ? 14 : 26);

    // Subtext if present
    if (sub) {
      ctx.font = 'bold 18px "JetBrains Mono", monospace';
      ctx.fillStyle = accentColor;
      ctx.fillText(sub, 32, 46);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.17, 0.042, 1);
    return sprite;
  }

  // -------------------------------------------------------------
  // BUILD AUTHENTIC UNIVERSITY CIRCUIT TRAINER BOARD
  // -------------------------------------------------------------
  private buildCircuitTrainerBoard() {
    const boardGroup = new THREE.Group();
    boardGroup.name = 'Circuit_Trainer_Board';
    boardGroup.position.set(this.benchX - 0.05, 0.94 + 0.012, 0.12);

    // 1. Heavy phenolic base plate
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.25,
    });
    this.boardBaseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.024, 0.38), baseMat);
    this.boardBaseMesh.castShadow = true;
    this.boardBaseMesh.receiveShadow = true;
    boardGroup.add(this.boardBaseMesh);

    // 2. Silkscreen Top Face Canvas Texture
    const silkCanvas = document.createElement('canvas');
    silkCanvas.width = 1024;
    silkCanvas.height = 512;
    const sCtx = silkCanvas.getContext('2d')!;

    // Matte dark composite surface
    sCtx.fillStyle = '#0f172a';
    sCtx.fillRect(0, 0, 1024, 512);

    // Border grid
    sCtx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    sCtx.lineWidth = 4;
    sCtx.strokeRect(16, 16, 992, 480);

    // University Header
    sCtx.fillStyle = '#94a3b8';
    sCtx.font = 'bold 22px monospace';
    sCtx.fillText('UNIVERSITY PHYSICS LABORATORY · DC CIRCUIT TRAINER MOD-3', 36, 48);

    // Copper Circuit Traces (Cyan lines)
    sCtx.strokeStyle = '#38bdf8';
    sCtx.lineWidth = 6;
    sCtx.lineCap = 'round';
    sCtx.lineJoin = 'round';

    // Trace: +24V to Series Jumper A
    sCtx.beginPath();
    sCtx.moveTo(80, 150);
    sCtx.lineTo(260, 150);
    sCtx.lineTo(260, 360);
    sCtx.stroke();

    // Trace: Series Jumper B to R1 Node A
    sCtx.beginPath();
    sCtx.moveTo(420, 360);
    sCtx.lineTo(420, 240);
    sCtx.lineTo(240, 240);
    sCtx.stroke();

    // Trace: R1 to R2 to R3 to GND
    sCtx.beginPath();
    sCtx.moveTo(380, 240);
    sCtx.lineTo(440, 240); // R1 -> R2
    sCtx.stroke();

    sCtx.beginPath();
    sCtx.moveTo(580, 240);
    sCtx.lineTo(640, 240); // R2 -> R3
    sCtx.stroke();

    sCtx.beginPath();
    sCtx.moveTo(780, 240);
    sCtx.lineTo(880, 240);
    sCtx.lineTo(880, 420);
    sCtx.lineTo(80, 420); // R3 -> GND
    sCtx.stroke();

    // Silkscreen Component Labels
    sCtx.font = 'bold 20px monospace';
    sCtx.fillStyle = '#f8fafc';
    sCtx.fillText('+24V DC IN', 50, 120);
    sCtx.fillText('0V GND', 50, 455);
    sCtx.fillText('SERIES CURRENT BREAK', 260, 400);

    sCtx.fillStyle = '#38bdf8';
    sCtx.fillText('NODE A', 220, 205);
    sCtx.fillText('NODE B', 390, 205);
    sCtx.fillText('NODE C', 590, 205);
    sCtx.fillText('NODE D (GND)', 750, 205);

    const silkTexture = new THREE.CanvasTexture(silkCanvas);
    silkTexture.colorSpace = THREE.SRGBColorSpace;
    const topPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.65, 0.37),
      new THREE.MeshStandardMaterial({ map: silkTexture, roughness: 0.4 })
    );
    topPlate.rotation.x = -Math.PI / 2;
    topPlate.position.y = 0.0125;
    boardGroup.add(topPlate);

    // 3. Build Realistic 3D Axial Resistors with EIA 4-Band Color Codes
    // R1: 100 Ohms (Brown, Black, Brown, Gold)
    const r1Mesh = this.buildAxialResistor(
      'R1: 100 Ω',
      100,
      [1, 0, 1, 0], // Brown, Black, Brown, Gold
      new THREE.Vector3(-0.09, 0.026, -0.06)
    );
    boardGroup.add(r1Mesh);

    // R2: 220 Ohms (Red, Red, Brown, Gold)
    const r2Mesh = this.buildAxialResistor(
      'R2: 220 Ω',
      220,
      [2, 2, 1, 0], // Red, Red, Brown, Gold
      new THREE.Vector3(0.05, 0.026, -0.06)
    );
    boardGroup.add(r2Mesh);

    // R3: 330 Ohms (Orange, Orange, Brown, Gold)
    const r3Mesh = this.buildAxialResistor(
      'R3: 330 Ω',
      330,
      [3, 3, 1, 0], // Orange, Orange, Brown, Gold
      new THREE.Vector3(0.19, 0.026, -0.06)
    );
    boardGroup.add(r3Mesh);

    // 4. Build Series Jumper Plug
    this.buildSeriesJumper(boardGroup);

    this.root.add(boardGroup);
  }

  // -------------------------------------------------------------
  // BUILD REALISTIC AXIAL RESISTOR WITH ACCURATE COLOR RINGS
  // -------------------------------------------------------------
  private buildAxialResistor(
    label: string,
    ohms: number,
    bands: [number, number, number, number],
    localPos: THREE.Vector3
  ): THREE.Group {
    const resGroup = new THREE.Group();
    resGroup.position.copy(localPos);

    // Ceramic body (tan/beige)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xdeb887,
      roughness: 0.45,
      metalness: 0.05,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.055, 20), bodyMat);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    resGroup.add(body);

    // Tapered end-caps
    const capMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.45 });
    const cap1 = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 16), capMat);
    cap1.position.x = -0.0275;
    resGroup.add(cap1);

    const cap2 = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 16), capMat);
    cap2.position.x = 0.0275;
    resGroup.add(cap2);

    // Color bands
    const bandPositions = [-0.018, -0.007, 0.005, 0.018];
    bands.forEach((digit, idx) => {
      const color = idx === 3 ? 0xeab308 : EIA_COLORS[digit] || 0x18181b; // Gold for band 4
      const bMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: idx === 3 ? 0.8 : 0.1,
      });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.004, 20), bMat);
      band.rotation.z = Math.PI / 2;
      band.position.x = bandPositions[idx];
      resGroup.add(band);
    });

    // Axial lead wires (silver nickel)
    const leadMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 });
    const leadLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.035, 12), leadMat);
    leadLeft.rotation.z = Math.PI / 2;
    leadLeft.position.x = -0.045;
    resGroup.add(leadLeft);

    const leadRight = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.035, 12), leadMat);
    leadRight.rotation.z = Math.PI / 2;
    leadRight.position.x = 0.045;
    resGroup.add(leadRight);

    // Floating 3D Badge Sprite directly above resistor
    const badge = this.createBadgeSprite(label, `${ohms} Ω ±5%`, '#38bdf8');
    badge.position.set(0, 0.058, 0);
    resGroup.add(badge);

    return resGroup;
  }

  // -------------------------------------------------------------
  // BUILD SERIES CURRENT JUMPER WITH FLOATING BADGE
  // -------------------------------------------------------------
  private buildSeriesJumper(boardGroup: THREE.Group) {
    this.seriesJumperMesh = new THREE.Group();
    this.seriesJumperMesh.name = 'Series_Loop_Jumper_Assembly';
    this.seriesJumperMesh.position.set(-0.09, 0.026, 0.10);

    // Green insulated jumper handle
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.35,
      metalness: 0.1,
    });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.018), handleMat);
    handle.castShadow = true;
    this.seriesJumperMesh.add(handle);

    // Gold banana pins plunging into board
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.15 });
    const pin1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.02, 12), pinMat);
    pin1.position.set(-0.05, -0.014, 0);
    this.seriesJumperMesh.add(pin1);

    const pin2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.02, 12), pinMat);
    pin2.position.set(0.05, -0.014, 0);
    this.seriesJumperMesh.add(pin2);

    // Raycast Click Hitbox
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    hitbox.name = 'Hitbox_Series_Jumper';
    hitbox.userData.isInteractable = true;
    hitbox.userData.action = 'toggle_jumper';
    hitbox.userData.hoverTooltip = 'Series Loop Jumper · Click to Open/Close Circuit';
    this.seriesJumperMesh.add(hitbox);
    this.interactableMeshes.push(hitbox);

    // Floating Badge Sprite
    this.jumperSprite = this.createBadgeSprite('SERIES JUMPER', 'STATE: CLOSED (LOOP OK)', '#10b981');
    this.jumperSprite.position.set(0, 0.035, 0);
    this.seriesJumperMesh.add(this.jumperSprite);

    boardGroup.add(this.seriesJumperMesh);
  }

  // -------------------------------------------------------------
  // BUILD 3D FLUKE 87V MULTIMETER HARDWARE
  // -------------------------------------------------------------
  private buildMultimeterBody() {
    const meterGroup = new THREE.Group();
    meterGroup.name = 'DMM_Body_Group';
    // Positioned right beside circuit board, angled towards student
    meterGroup.position.set(this.benchX + 0.38, 0.98, 0.14);
    meterGroup.rotation.y = -Math.PI / 6; // 30 deg inward toward user

    // Yellow shock-absorbing rubber holster
    const holsterMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.42,
      metalness: 0.08,
    });
    const holster = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.44), holsterMat);
    holster.castShadow = true;
    meterGroup.add(holster);

    // Matte dark graphite inner case
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.65,
      metalness: 0.25,
    });
    const innerCase = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.085, 0.42), caseMat);
    innerCase.position.y = 0.005;
    meterGroup.add(innerCase);

    // LCD Screen Panel
    const lcdScreenMat = new THREE.MeshBasicMaterial({ map: this.lcdTexture });
    const lcdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.10), lcdScreenMat);
    lcdScreen.rotation.x = -Math.PI / 2;
    lcdScreen.position.set(0, 0.052, -0.11);
    meterGroup.add(lcdScreen);

    // Rotary Dial
    const dialMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
      metalness: 0.75,
    });
    this.rotaryDialMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 24), dialMat);
    this.rotaryDialMesh.name = 'DMM_Rotary_Dial';
    this.rotaryDialMesh.position.set(0, 0.055, 0.03);
    this.rotaryDialMesh.userData.isInteractable = true;
    this.rotaryDialMesh.userData.action = 'cycle_mode';
    this.rotaryDialMesh.userData.hoverTooltip = 'Rotary Function Dial · Click to change measurement mode';

    // Dial indicator notch
    const notchMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.026, 0.03), notchMat);
    notch.position.set(0, 0.005, -0.025);
    this.rotaryDialMesh.add(notch);
    meterGroup.add(this.rotaryDialMesh);
    this.interactableMeshes.push(this.rotaryDialMesh);

    // 4mm Input Jacks
    const jackSilverMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
    const jackRedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.4, roughness: 0.3 });
    const jackBlackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.4, roughness: 0.3 });

    // COM Jack (Black)
    const comJack = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.016, 16), jackBlackMat);
    comJack.position.set(0.02, 0.052, 0.145);
    meterGroup.add(comJack);

    // V·Ω Jack (Red)
    this.redLeadJackMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.016, 16), jackRedMat);
    this.redLeadJackMesh.name = 'DMM_Jack_V_OHM';
    this.redLeadJackMesh.position.set(0.065, 0.052, 0.145);
    this.redLeadJackMesh.userData.isInteractable = true;
    this.redLeadJackMesh.userData.action = 'toggle_red_jack';
    this.redLeadJackMesh.userData.hoverTooltip = 'V·Ω Jack (Red Lead) · Click to switch between Voltage and Current jacks';
    meterGroup.add(this.redLeadJackMesh);
    this.interactableMeshes.push(this.redLeadJackMesh);

    // mA / 10A Jack (Red)
    this.maJackMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.016, 16), jackRedMat);
    this.maJackMesh.name = 'DMM_Jack_mA';
    this.maJackMesh.position.set(-0.065, 0.052, 0.145);
    this.maJackMesh.userData.isInteractable = true;
    this.maJackMesh.userData.action = 'toggle_red_jack';
    this.maJackMesh.userData.hoverTooltip = 'mA/10A Jack · Required for Current measurement in series';
    meterGroup.add(this.maJackMesh);
    this.interactableMeshes.push(this.maJackMesh);

    // Floating Badge above DMM
    const meterBadge = this.createBadgeSprite('FLUKE 87V DMM', 'TRUE-RMS MULTIMETER', '#f59e0b');
    meterBadge.position.set(0, 0.18, 0);
    meterGroup.add(meterBadge);

    this.root.add(meterGroup);
  }

  // -------------------------------------------------------------
  // BUILD TERMINAL SOCKETS ON BREADBOARD
  // -------------------------------------------------------------
  private buildTerminalSockets() {
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.18 });
    const redCollarMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    const blackCollarMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3 });
    const cyanCollarMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });

    const terminalTooltips: Record<TerminalId, string> = {
      SRC_POS: 'Power Supply Positive Terminal (+24V DC)',
      SRC_NEG: 'Power Supply Ground Return (0V GND)',
      SERIES_JACK_A: 'Series Jumper Socket A (Insert Ammeter Here)',
      SERIES_JACK_B: 'Series Jumper Socket B (Return Path to R1)',
      R1_A: 'Resistor R1 Node A (Input side of 100 Ω resistor)',
      R1_B: 'Resistor R1 Node B (Output side of 100 Ω resistor)',
      R2_A: 'Resistor R2 Node A (Input side of 220 Ω resistor)',
      R2_B: 'Resistor R2 Node B (Output side of 220 Ω resistor)',
      R3_A: 'Resistor R3 Node A (Input side of 330 Ω resistor)',
      R3_B: 'Resistor R3 Node B (GND return side of 330 Ω resistor)',
      IND_A: 'Inductor Terminal A (150 mH)',
      IND_B: 'Inductor Terminal B (150 mH)',
      CAP_A: 'Capacitor Terminal A (47 μF)',
      CAP_B: 'Capacitor Terminal B (47 μF)',
    };

    Object.entries(this.terminalPositions).forEach(([tId, pos]) => {
      const socketGroup = new THREE.Group();
      socketGroup.position.copy(pos);

      // Collar
      const isRed = tId.includes('POS') || tId === 'R1_A' || tId === 'R2_A' || tId === 'R3_A';
      const isBlack = tId.includes('NEG') || tId === 'R3_B';
      const collarMat = tId.includes('SRC_POS')
        ? redCollarMat
        : tId.includes('SRC_NEG')
        ? blackCollarMat
        : isRed
        ? cyanCollarMat
        : isBlack
        ? blackCollarMat
        : goldMat;

      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 16), collarMat);
      socketGroup.add(collar);

      // Inner banana hole
      const innerHole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.014, 16),
        new THREE.MeshBasicMaterial({ color: 0x050811 })
      );
      innerHole.position.y = 0.002;
      socketGroup.add(innerHole);

      // Clickable Hitbox Mesh for Raycasting
      const hitbox = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, 0.04, 12),
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
  // BUILD 3D PROBES & CABLES
  // -------------------------------------------------------------
  private buildProbes() {
    // Red Probe
    const redHandleMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.15 });
    const tipSteelMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.95, roughness: 0.1 });

    const redHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.11, 16), redHandleMat);
    redHandle.rotation.x = Math.PI / 2;
    this.redProbeGroup.add(redHandle);

    const redTip = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.035, 12), tipSteelMat);
    redTip.rotation.x = Math.PI / 2;
    redTip.position.z = 0.07;
    this.redProbeGroup.add(redTip);

    // Hitbox for Red Probe
    const redHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.16),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    redHitbox.name = 'Probe_Red';
    redHitbox.userData.isProbe = true;
    redHitbox.userData.probeColor = 'red';
    redHitbox.userData.hoverTooltip = 'Red Test Probe (+) · Click terminal to connect';
    this.redProbeGroup.add(redHitbox);
    this.interactableMeshes.push(redHitbox);

    // Initial resting position on table beside meter
    this.redProbeGroup.position.set(this.benchX + 0.36, 0.96, 0.30);
    this.redProbeGroup.rotation.y = -Math.PI / 6;
    this.root.add(this.redProbeGroup);

    // Black Probe
    const blackHandleMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.35, metalness: 0.15 });
    const blackHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.11, 16), blackHandleMat);
    blackHandle.rotation.x = Math.PI / 2;
    this.blackProbeGroup.add(blackHandle);

    const blackTip = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.035, 12), tipSteelMat);
    blackTip.rotation.x = Math.PI / 2;
    blackTip.position.z = 0.07;
    this.blackProbeGroup.add(blackTip);

    // Hitbox for Black Probe
    const blackHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.16),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
    );
    blackHitbox.name = 'Probe_Black';
    blackHitbox.userData.isProbe = true;
    blackHitbox.userData.probeColor = 'black';
    blackHitbox.userData.hoverTooltip = 'Black Test Probe (COM) · Click terminal to connect';
    this.blackProbeGroup.add(blackHitbox);
    this.interactableMeshes.push(blackHitbox);

    // Initial resting position on table beside meter
    this.blackProbeGroup.position.set(this.benchX + 0.46, 0.96, 0.30);
    this.blackProbeGroup.rotation.y = -Math.PI / 6;
    this.root.add(this.blackProbeGroup);

    this.updateCables();
  }

  // -------------------------------------------------------------
  // BUILD POWER FEED HOOKUP WIRES FROM DC PSU TO TRAINER BOARD
  // -------------------------------------------------------------
  private buildPsuFeedWires() {
    const psuPos = new THREE.Vector3(this.benchX - 0.52, 1.02, 0.04);
    const posPos = this.terminalPositions.SRC_POS;
    const negPos = this.terminalPositions.SRC_NEG;

    // Red Wire (+24V)
    const redPsuCurve = new THREE.CatmullRomCurve3([
      psuPos.clone().add(new THREE.Vector3(0.12, -0.04, 0.08)),
      new THREE.Vector3(this.benchX - 0.42, 0.96, 0.03),
      posPos.clone().add(new THREE.Vector3(0, 0.015, 0)),
    ]);
    const redPsuGeo = new THREE.TubeGeometry(redPsuCurve, 20, 0.004, 8, false);
    this.psuRedWire = new THREE.Mesh(redPsuGeo, new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }));
    this.root.add(this.psuRedWire);

    // Black Wire (GND)
    const blackPsuCurve = new THREE.CatmullRomCurve3([
      psuPos.clone().add(new THREE.Vector3(0.06, -0.04, 0.08)),
      new THREE.Vector3(this.benchX - 0.42, 0.96, 0.14),
      negPos.clone().add(new THREE.Vector3(0, 0.015, 0)),
    ]);
    const blackPsuGeo = new THREE.TubeGeometry(blackPsuCurve, 20, 0.004, 8, false);
    this.psuBlackWire = new THREE.Mesh(blackPsuGeo, new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4 }));
    this.root.add(this.psuBlackWire);
  }

  // -------------------------------------------------------------
  // UPDATE FLEXIBLE 3D LEAD CABLES
  // -------------------------------------------------------------
  public updateCables() {
    if (this.redCableMesh) this.root.remove(this.redCableMesh);
    if (this.blackCableMesh) this.root.remove(this.blackCableMesh);

    // DMM Jack positions in world space (Meter at benchX + 0.44, 0.98, 0.14)
    const meterOrigin = new THREE.Vector3(this.benchX + 0.44, 0.98, 0.14);
    const dmmJackRedPos = meterOrigin.clone().add(
      this.dmmState.redJack === 'v_ohm'
        ? new THREE.Vector3(0.05, 0.06, 0.12)
        : new THREE.Vector3(-0.06, 0.06, 0.12)
    );
    const dmmJackBlackPos = meterOrigin.clone().add(new THREE.Vector3(0.01, 0.06, 0.12));

    // Red Cable Curve
    const redProbeTail = this.redProbeGroup.position.clone().add(new THREE.Vector3(0, 0.02, -0.05));
    const redMid = dmmJackRedPos.clone().lerp(redProbeTail, 0.5);
    redMid.y = 0.95; // Catenary sag onto workbench

    const redCurve = new THREE.CatmullRomCurve3([dmmJackRedPos, redMid, redProbeTail]);
    const redGeo = new THREE.TubeGeometry(redCurve, 24, 0.0035, 8, false);
    this.redCableMesh = new THREE.Mesh(
      redGeo,
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 })
    );
    this.root.add(this.redCableMesh);

    // Black Cable Curve
    const blackProbeTail = this.blackProbeGroup.position.clone().add(new THREE.Vector3(0, 0.02, -0.05));
    const blackMid = dmmJackBlackPos.clone().lerp(blackProbeTail, 0.5);
    blackMid.y = 0.95; // Catenary sag onto workbench

    const blackCurve = new THREE.CatmullRomCurve3([dmmJackBlackPos, blackMid, blackProbeTail]);
    const blackGeo = new THREE.TubeGeometry(blackCurve, 24, 0.0035, 8, false);
    this.blackCableMesh = new THREE.Mesh(
      blackGeo,
      new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4 })
    );
    this.root.add(this.blackCableMesh);
  }

  // -------------------------------------------------------------
  // UPDATE MULTIMETER LCD CANVAS TEXTURE
  // -------------------------------------------------------------
  public updateDisplay(): MultimeterReading {
    let reading = readMultimeter(this.circuitState, this.dmmState);
    if (reading.tripFuse && !this.dmmState.fuseBlown) {
      this.dmmState.fuseBlown = true;
      this.callbacks.playTone?.(140, 'sawtooth', 0.4, 0.3);
      // Re-read with blown fuse state
      reading = readMultimeter(this.circuitState, this.dmmState);
    }

    this.lcdCtx.fillStyle = '#0f172a';
    this.lcdCtx.fillRect(0, 0, 512, 256);

    // Top Header: Multimeter Brand & Measurement Mode
    this.lcdCtx.fillStyle = '#94a3b8';
    this.lcdCtx.font = 'bold 24px monospace';
    this.lcdCtx.fillText('FLUKE 87V TRUE RMS', 24, 40);

    const modeLabels: Record<MultimeterMode, string> = {
      v_dc: 'DC VOLTAGE',
      v_ac: 'AC VOLTAGE (RMS)',
      a_dc: 'DC CURRENT',
      a_ac: 'AC CURRENT (RMS)',
      ohm: 'RESISTANCE (Ω)',
      cont: 'CONTINUITY BEEP',
    };
    this.lcdCtx.fillStyle = '#38bdf8';
    this.lcdCtx.fillText(modeLabels[this.dmmState.mode], 24, 75);

    // Main 7-Segment Readout
    this.lcdCtx.font = 'bold 72px monospace';
    this.lcdCtx.fillStyle = this.dmmState.fuseBlown || reading.displayString === 'LEAd'
      ? '#ef4444'
      : reading.isValidMeasurement
      ? '#38bdf8'
      : reading.isContinuityBeep
      ? '#10b981'
      : '#f59e0b';
    this.lcdCtx.fillText(reading.displayString, 24, 160);

    // Status annunciator badges
    this.lcdCtx.font = 'bold 22px monospace';
    this.lcdCtx.fillStyle = '#64748b';
    this.lcdCtx.fillText(`JACK: ${this.dmmState.redJack.toUpperCase()} · AUTO-RANGE`, 24, 215);

    if (reading.isContinuityBeep) {
      this.lcdCtx.fillStyle = '#10b981';
      this.lcdCtx.fillText('🔊 CONTINUITY DETECTED (< 30 Ω)', 24, 242);
      if (!this.continuityBeepPlaying) {
        this.callbacks.playTone?.(880, 'sine', 0.25, 0.15);
        this.continuityBeepPlaying = true;
      }
    } else {
      this.continuityBeepPlaying = false;
    }

    if (reading.warning) {
      this.lcdCtx.fillStyle = '#ef4444';
      this.lcdCtx.fillText(`! ${reading.warning.slice(0, 38)}...`, 24, 242);
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
        // Snap 3D probe to terminal
        const p = this.terminalPositions[terminal];
        this.redProbeGroup.position.set(p.x, p.y + 0.04, p.z);
        this.redProbeGroup.rotation.x = -Math.PI / 4;
        this.redProbeGroup.rotation.y = 0;
      } else {
        // Return to bench resting position
        this.redProbeGroup.position.set(this.benchX + 0.36, 0.96, 0.30);
        this.redProbeGroup.rotation.y = -Math.PI / 6;
      }
    } else {
      this.dmmState.blackProbeTerminal = terminal;
      if (terminal && this.terminalPositions[terminal]) {
        const p = this.terminalPositions[terminal];
        this.blackProbeGroup.position.set(p.x, p.y + 0.04, p.z);
        this.blackProbeGroup.rotation.x = -Math.PI / 4;
        this.blackProbeGroup.rotation.y = 0;
      } else {
        this.blackProbeGroup.position.set(this.benchX + 0.46, 0.96, 0.30);
        this.blackProbeGroup.rotation.y = -Math.PI / 6;
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
    if (this.seriesJumperMesh) {
      this.seriesJumperMesh.visible = this.circuitState.seriesJumperConnected;
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
