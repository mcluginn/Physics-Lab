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
    // Board is centered at benchX - 0.12, y = 0.952, z = 0.12
    this.terminalPositions = {
      SRC_POS: new THREE.Vector3(benchX - 0.34, 0.97, 0.04),
      SRC_NEG: new THREE.Vector3(benchX - 0.34, 0.97, 0.20),
      SERIES_JACK_A: new THREE.Vector3(benchX - 0.20, 0.97, 0.20),
      SERIES_JACK_B: new THREE.Vector3(benchX - 0.08, 0.97, 0.20),
      R1_A: new THREE.Vector3(benchX - 0.24, 0.97, 0.06),
      R1_B: new THREE.Vector3(benchX - 0.12, 0.97, 0.06),
      R2_A: new THREE.Vector3(benchX - 0.12, 0.97, 0.06),
      R2_B: new THREE.Vector3(benchX + 0.00, 0.97, 0.06),
      R3_A: new THREE.Vector3(benchX + 0.00, 0.97, 0.06),
      R3_B: new THREE.Vector3(benchX + 0.12, 0.97, 0.06),
      IND_A: new THREE.Vector3(benchX - 0.20, 0.97, -0.02),
      IND_B: new THREE.Vector3(benchX - 0.10, 0.97, -0.02),
      CAP_A: new THREE.Vector3(benchX + 0.02, 0.97, -0.02),
      CAP_B: new THREE.Vector3(benchX + 0.12, 0.97, -0.02),
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

    this.buildCircuitTrainerBoard();
    this.buildMultimeterBody();
    this.buildTerminalSockets();
    this.buildProbes();
    this.buildPsuFeedWires();
    this.updateDisplay();
  }

  // -------------------------------------------------------------
  // BUILD AUTHENTIC UNIVERSITY CIRCUIT TRAINER BOARD
  // -------------------------------------------------------------
  private buildCircuitTrainerBoard() {
    const boardGroup = new THREE.Group();
    boardGroup.name = 'Circuit_Trainer_Board';
    boardGroup.position.set(this.benchX - 0.12, 0.94 + 0.012, 0.12);

    // 1. Phenolic Base Plate with chamfered edges
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.2,
    });
    this.boardBaseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.024, 0.32), baseMat);
    this.boardBaseMesh.castShadow = true;
    this.boardBaseMesh.receiveShadow = true;
    boardGroup.add(this.boardBaseMesh);

    // Rubber mounting feet
    const footMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.9 });
    const footPositions = [
      [-0.25, -0.014, -0.14],
      [0.25, -0.014, -0.14],
      [-0.25, -0.014, 0.14],
      [0.25, -0.014, 0.14],
    ];
    footPositions.forEach(([fx, fy, fz]) => {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 16), footMat);
      foot.position.set(fx, fy, fz);
      boardGroup.add(foot);
    });

    // 2. High-Resolution Silkscreen Printed Surface
    const silkCanvas = document.createElement('canvas');
    silkCanvas.width = 1024;
    silkCanvas.height = 512;
    const sCtx = silkCanvas.getContext('2d')!;

    // Dark matte solder-mask green/slate
    sCtx.fillStyle = '#0a192f';
    sCtx.fillRect(0, 0, 1024, 512);

    // Subtle PCB grid pattern
    sCtx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    sCtx.lineWidth = 1;
    for (let x = 0; x <= 1024; x += 32) {
      sCtx.beginPath();
      sCtx.moveTo(x, 0);
      sCtx.lineTo(x, 512);
      sCtx.stroke();
    }
    for (let y = 0; y <= 512; y += 32) {
      sCtx.beginPath();
      sCtx.moveTo(0, y);
      sCtx.lineTo(1024, y);
      sCtx.stroke();
    }

    // Outer border
    sCtx.strokeStyle = '#38bdf8';
    sCtx.lineWidth = 4;
    sCtx.strokeRect(12, 12, 1000, 488);

    // Board Header
    sCtx.fillStyle = '#f8fafc';
    sCtx.font = 'bold 22px monospace';
    sCtx.fillText('UNIVERSITY PHYSICS LABORATORY · DC OHM\'S LAW & SERIES CIRCUIT TRAINER', 36, 44);

    sCtx.font = 'bold 16px monospace';
    sCtx.fillStyle = '#94a3b8';
    sCtx.fillText('MODULE: MOD-01 · 24V DC ISOLATED BENCH REGIME', 36, 70);

    // Copper / Gold Circuit Tracks
    sCtx.strokeStyle = '#f59e0b';
    sCtx.lineWidth = 8;
    sCtx.lineCap = 'round';
    sCtx.lineJoin = 'round';

    // Track 1: +24V IN to Series Jumper Jack A
    sCtx.beginPath();
    sCtx.moveTo(75, 140);
    sCtx.lineTo(240, 140);
    sCtx.lineTo(240, 380);
    sCtx.stroke();

    // Track 2: Series Jumper Jack B to R1 Node A
    sCtx.beginPath();
    sCtx.moveTo(480, 380);
    sCtx.lineTo(480, 240);
    sCtx.lineTo(180, 240);
    sCtx.stroke();

    // Track 3: R1 (180..380) to R2 (420..620) to R3 (660..860)
    sCtx.beginPath();
    sCtx.moveTo(380, 240);
    sCtx.lineTo(420, 240); // R1 -> R2
    sCtx.moveTo(620, 240);
    sCtx.lineTo(660, 240); // R2 -> R3
    sCtx.stroke();

    // Track 4: R3 Node D back to 0V GND
    sCtx.beginPath();
    sCtx.moveTo(860, 240);
    sCtx.lineTo(920, 240);
    sCtx.lineTo(920, 420);
    sCtx.lineTo(75, 420);
    sCtx.stroke();

    // Silkscreen Component Outlines & Solder Pads
    sCtx.strokeStyle = '#ffffff';
    sCtx.lineWidth = 2;

    // Resistor 1 Footprint
    sCtx.strokeRect(220, 210, 120, 60);
    sCtx.fillStyle = '#38bdf8';
    sCtx.font = 'bold 20px monospace';
    sCtx.fillText('R1: 100 Ω', 230, 195);
    sCtx.font = 'bold 14px monospace';
    sCtx.fillStyle = '#94a3b8';
    sCtx.fillText('BRN-BLK-BRN-GLD', 222, 295);

    // Resistor 2 Footprint
    sCtx.strokeRect(460, 210, 120, 60);
    sCtx.fillStyle = '#38bdf8';
    sCtx.font = 'bold 20px monospace';
    sCtx.fillText('R2: 220 Ω', 470, 195);
    sCtx.font = 'bold 14px monospace';
    sCtx.fillStyle = '#94a3b8';
    sCtx.fillText('RED-RED-BRN-GLD', 462, 295);

    // Resistor 3 Footprint
    sCtx.strokeRect(700, 210, 120, 60);
    sCtx.fillStyle = '#38bdf8';
    sCtx.font = 'bold 20px monospace';
    sCtx.fillText('R3: 330 Ω', 710, 195);
    sCtx.font = 'bold 14px monospace';
    sCtx.fillStyle = '#94a3b8';
    sCtx.fillText('ORG-ORG-BRN-GLD', 702, 295);

    // Node Callouts
    sCtx.font = 'bold 18px monospace';
    sCtx.fillStyle = '#38bdf8';
    sCtx.fillText('NODE A (+)', 130, 225);
    sCtx.fillText('NODE B', 370, 225);
    sCtx.fillText('NODE C', 610, 225);
    sCtx.fillText('NODE D (GND)', 820, 225);

    // Power & Jumper Legends
    sCtx.fillStyle = '#ef4444';
    sCtx.fillText('+24V DC IN', 35, 115);
    sCtx.fillStyle = '#10b981';
    sCtx.fillText('0V RETURN (GND)', 35, 455);

    sCtx.fillStyle = '#10b981';
    sCtx.font = 'bold 18px monospace';
    sCtx.fillText('SERIES CURRENT AMMETER BREAK (JUMPER)', 250, 425);
    sCtx.font = '14px monospace';
    sCtx.fillStyle = '#94a3b8';
    sCtx.fillText('← Close with jumper for voltage test / Remove to insert ammeter in series →', 230, 448);

    const silkTexture = new THREE.CanvasTexture(silkCanvas);
    silkTexture.colorSpace = THREE.SRGBColorSpace;
    const topPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.53, 0.31),
      new THREE.MeshStandardMaterial({ map: silkTexture, roughness: 0.35, metalness: 0.1 })
    );
    topPlate.rotation.x = -Math.PI / 2;
    topPlate.position.y = 0.0125;
    boardGroup.add(topPlate);

    // 3. Build Realistic Axial Resistors (Placed neatly on footprints)
    // Board local coords:
    // R1: x = -0.06, z = -0.06
    // R2: x = +0.06, z = -0.06
    // R3: x = +0.18, z = -0.06
    const r1Mesh = this.buildAxialResistor(100, [1, 0, 1, 0], new THREE.Vector3(-0.06, 0.024, -0.06));
    boardGroup.add(r1Mesh);

    const r2Mesh = this.buildAxialResistor(220, [2, 2, 1, 0], new THREE.Vector3(0.06, 0.024, -0.06));
    boardGroup.add(r2Mesh);

    const r3Mesh = this.buildAxialResistor(330, [3, 3, 1, 0], new THREE.Vector3(0.18, 0.024, -0.06));
    boardGroup.add(r3Mesh);

    // 4. Build Series Jumper
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
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.052, 20), bodyMat);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    resGroup.add(body);

    // Rounded bulbous end caps
    const capMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.45 });
    const cap1 = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 16), capMat);
    cap1.position.x = -0.026;
    resGroup.add(cap1);

    const cap2 = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 16), capMat);
    cap2.position.x = 0.026;
    resGroup.add(cap2);

    // EIA Color Bands
    const bandPositions = [-0.017, -0.006, 0.005, 0.017];
    bands.forEach((digit, idx) => {
      const color = idx === 3 ? 0xeab308 : EIA_COLORS[digit] || 0x18181b;
      const bMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: idx === 3 ? 0.85 : 0.1,
      });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.004, 20), bMat);
      band.rotation.z = Math.PI / 2;
      band.position.x = bandPositions[idx];
      resGroup.add(band);
    });

    // Axial lead wires connecting into solder pads
    const leadMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 });
    const leadLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.028, 12), leadMat);
    leadLeft.rotation.z = Math.PI / 2;
    leadLeft.position.x = -0.040;
    resGroup.add(leadLeft);

    const leadRight = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.028, 12), leadMat);
    leadRight.rotation.z = Math.PI / 2;
    leadRight.position.x = 0.040;
    resGroup.add(leadRight);

    // Downward pin bends into board
    const pinLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.018, 12), leadMat);
    pinLeft.position.set(-0.052, -0.009, 0);
    resGroup.add(pinLeft);

    const pinRight = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.018, 12), leadMat);
    pinRight.position.set(0.052, -0.009, 0);
    resGroup.add(pinRight);

    return resGroup;
  }

  // -------------------------------------------------------------
  // BUILD SERIES CURRENT JUMPER PLUG
  // -------------------------------------------------------------
  private buildSeriesJumper(boardGroup: THREE.Group) {
    this.seriesJumperMesh = new THREE.Group();
    this.seriesJumperMesh.name = 'Series_Loop_Jumper_Assembly';
    this.seriesJumperMesh.position.set(-0.02, 0.026, 0.08);

    // Emerald green molded jumper bar
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.35,
      metalness: 0.1,
    });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.018), handleMat);
    handle.castShadow = true;
    this.seriesJumperMesh.add(handle);

    // Gold banana pins plunging into board sockets
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

    boardGroup.add(this.seriesJumperMesh);
  }

  // -------------------------------------------------------------
  // BUILD 3D FLUKE 87V MULTIMETER HARDWARE
  // -------------------------------------------------------------
  private buildMultimeterBody() {
    const meterGroup = new THREE.Group();
    meterGroup.name = 'DMM_Body_Group';
    // Positioned cleanly to the right of the board with 18cm gap to avoid any clipping
    meterGroup.position.set(this.benchX + 0.44, 0.965, 0.14);
    meterGroup.rotation.y = -Math.PI / 8; // 22.5 deg inward towards student
    meterGroup.rotation.x = 0.22; // Ergonomic 12.5 deg tilt up

    // Yellow rubber shock holster
    const holsterMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.45,
      metalness: 0.08,
    });
    const holster = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.075, 0.38), holsterMat);
    holster.castShadow = true;
    meterGroup.add(holster);

    // Dark graphite inner housing
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.65,
      metalness: 0.25,
    });
    const innerCase = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.072, 0.365), caseMat);
    innerCase.position.y = 0.004;
    meterGroup.add(innerCase);

    // Rear kick-stand prop
    const standMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.18), standMat);
    stand.position.set(0, -0.045, -0.08);
    stand.rotation.x = 0.55;
    meterGroup.add(stand);

    // LCD Screen Glass Bezel
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.005, 0.105), bezelMat);
    bezel.position.set(0, 0.042, -0.10);
    meterGroup.add(bezel);

    // LCD Screen Panel
    const lcdScreenMat = new THREE.MeshBasicMaterial({ map: this.lcdTexture });
    const lcdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), lcdScreenMat);
    lcdScreen.rotation.x = -Math.PI / 2;
    lcdScreen.position.set(0, 0.045, -0.10);
    meterGroup.add(lcdScreen);

    // 4 Yellow Soft-Touch Push Buttons below screen
    const btnMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
    const btnLabels = [-0.045, -0.015, 0.015, 0.045];
    btnLabels.forEach((bx) => {
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.008, 0.012), btnMat);
      btn.position.set(bx, 0.043, -0.035);
      meterGroup.add(btn);
    });

    // Rotary Dial with Knurled Grip
    const dialMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.75,
    });
    this.rotaryDialMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.022, 24), dialMat);
    this.rotaryDialMesh.name = 'DMM_Rotary_Dial';
    this.rotaryDialMesh.position.set(0, 0.048, 0.035);
    this.rotaryDialMesh.userData.isInteractable = true;
    this.rotaryDialMesh.userData.action = 'cycle_mode';
    this.rotaryDialMesh.userData.hoverTooltip = 'Rotary Function Dial · Click to change measurement mode';

    // Dial indicator pointer
    const notchMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.028), notchMat);
    notch.position.set(0, 0.004, -0.022);
    this.rotaryDialMesh.add(notch);
    meterGroup.add(this.rotaryDialMesh);
    this.interactableMeshes.push(this.rotaryDialMesh);

    // 4mm Input Jacks
    const jackRedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.4, roughness: 0.3 });
    const jackBlackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.4, roughness: 0.3 });

    // COM Jack (Black)
    this.comJackMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 16), jackBlackMat);
    this.comJackMesh.position.set(0.015, 0.045, 0.135);
    meterGroup.add(this.comJackMesh);

    // V·Ω Jack (Red)
    this.redLeadJackMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 16), jackRedMat);
    this.redLeadJackMesh.name = 'DMM_Jack_V_OHM';
    this.redLeadJackMesh.position.set(0.055, 0.045, 0.135);
    this.redLeadJackMesh.userData.isInteractable = true;
    this.redLeadJackMesh.userData.action = 'toggle_red_jack';
    this.redLeadJackMesh.userData.hoverTooltip = 'V·Ω Jack (Red Lead) · Click to switch between Voltage and Current jacks';
    meterGroup.add(this.redLeadJackMesh);
    this.interactableMeshes.push(this.redLeadJackMesh);

    // mA / 10A Jack (Red)
    this.maJackMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 16), jackRedMat);
    this.maJackMesh.name = 'DMM_Jack_mA';
    this.maJackMesh.position.set(-0.055, 0.045, 0.135);
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
    const redCollarMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    const blackCollarMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3 });
    const cyanCollarMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });
    const greenCollarMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 });

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
      const isRed = tId.includes('POS') || tId === 'R1_A';
      const isBlack = tId.includes('NEG') || tId === 'R3_B';
      const isGreen = tId.includes('SERIES_JACK');
      const collarMat = isGreen
        ? greenCollarMat
        : isRed
        ? redCollarMat
        : isBlack
        ? blackCollarMat
        : cyanCollarMat;

      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 16), collarMat);
      socketGroup.add(collar);

      // Inner banana hole
      const innerHole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.014, 16),
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
  // BUILD 3D TEST PROBES (FLUKE TL75 ERGONOMIC TEST LEADS)
  // -------------------------------------------------------------
  private buildProbes() {
    const tipSteelMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.95, roughness: 0.1 });

    // Helper to construct a single Fluke TL75 probe
    const createProbeMesh = (color: 0xef4444 | 0x18181b, name: string) => {
      const group = new THREE.Group();
      group.name = name;

      const handleMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 });

      // Needle Tip (points down along -Y)
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0008, 0.032, 12), tipSteelMat);
      tip.position.y = 0.016;
      group.add(tip);

      // Tapered nose cone
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0025, 0.02, 16), handleMat);
      cone.position.y = 0.042;
      group.add(cone);

      // Ergonomic ribbed body
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.09, 16), handleMat);
      body.position.y = 0.095;
      group.add(body);

      // Raised circular finger safety barrier
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 16), handleMat);
      guard.position.y = 0.055;
      group.add(guard);

      // Rubber strain-relief cable boot at top
      const bootMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.024, 12), bootMat);
      boot.position.y = 0.152;
      group.add(boot);

      // Hitbox for clicking the probe
      const hitbox = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.18, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
      );
      hitbox.position.y = 0.09;
      hitbox.name = name + '_Hitbox';
      hitbox.userData.isProbe = true;
      hitbox.userData.probeColor = color === 0xef4444 ? 'red' : 'black';
      hitbox.userData.hoverTooltip = color === 0xef4444 ? 'Red Test Probe (+) · Click terminal to connect' : 'Black Test Probe (COM) · Click terminal to connect';
      group.add(hitbox);
      this.interactableMeshes.push(hitbox);

      return group;
    };

    // Red Probe
    const redMesh = createProbeMesh(0xef4444, 'Probe_Red');
    this.redProbeGroup.add(redMesh);
    // Resting position neatly in the staging area between board and multimeter
    this.redProbeGroup.position.set(this.benchX + 0.26, 0.948, 0.28);
    this.redProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6); // Flat on table
    this.root.add(this.redProbeGroup);

    // Black Probe
    const blackMesh = createProbeMesh(0x18181b, 'Probe_Black');
    this.blackProbeGroup.add(blackMesh);
    // Resting position neatly in the staging area between board and multimeter
    this.blackProbeGroup.position.set(this.benchX + 0.33, 0.948, 0.28);
    this.blackProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6); // Flat on table
    this.root.add(this.blackProbeGroup);

    this.updateCables();
  }

  // -------------------------------------------------------------
  // BUILD POWER FEED HOOKUP WIRES FROM DC PSU TO TRAINER BOARD
  // -------------------------------------------------------------
  private buildPsuFeedWires() {
    // PSU binding posts at rear-left (x = benchX - 0.65, z = -0.32, front face z ~ -0.11)
    const psuRedPostPos = new THREE.Vector3(this.benchX - 0.745, 0.98, -0.11);
    const psuBlackPostPos = new THREE.Vector3(this.benchX - 0.691, 0.98, -0.11);
    const posPos = this.terminalPositions.SRC_POS;
    const negPos = this.terminalPositions.SRC_NEG;

    // Heavy Red Wire (+24V): Drops from PSU binding post to bench, curves smoothly, plugs into board SRC_POS
    const redCurve = new THREE.CatmullRomCurve3([
      psuRedPostPos,
      new THREE.Vector3(this.benchX - 0.745, 0.97, -0.06),
      new THREE.Vector3(this.benchX - 0.62, 0.946, -0.03),
      new THREE.Vector3(this.benchX - 0.48, 0.946, 0.00),
      new THREE.Vector3(this.benchX - 0.38, 0.955, 0.03),
      posPos.clone().add(new THREE.Vector3(0, 0.015, 0)),
    ]);
    const redGeo = new THREE.TubeGeometry(redCurve, 24, 0.005, 8, false);
    this.psuRedWire = new THREE.Mesh(redGeo, new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }));
    this.root.add(this.psuRedWire);

    // Heavy Black Wire (0V GND): Drops from PSU binding post to bench, curves smoothly, plugs into board SRC_NEG
    const blackCurve = new THREE.CatmullRomCurve3([
      psuBlackPostPos,
      new THREE.Vector3(this.benchX - 0.691, 0.97, -0.06),
      new THREE.Vector3(this.benchX - 0.58, 0.946, 0.04),
      new THREE.Vector3(this.benchX - 0.46, 0.946, 0.12),
      new THREE.Vector3(this.benchX - 0.38, 0.955, 0.18),
      negPos.clone().add(new THREE.Vector3(0, 0.015, 0)),
    ]);
    const blackGeo = new THREE.TubeGeometry(blackCurve, 24, 0.005, 8, false);
    this.psuBlackWire = new THREE.Mesh(blackGeo, new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4 }));
    this.root.add(this.psuBlackWire);
  }

  // -------------------------------------------------------------
  // UPDATE FLEXIBLE 3D LEAD CABLES (HEAVY SILICONE TEST LEADS)
  // -------------------------------------------------------------
  public updateCables() {
    if (this.redCableMesh) this.root.remove(this.redCableMesh);
    if (this.blackCableMesh) this.root.remove(this.blackCableMesh);

    // Exact Jack World Positions using getWorldPosition
    const dmmJackRedPos = new THREE.Vector3();
    const dmmJackBlackPos = new THREE.Vector3();
    const activeRedJack = this.dmmState.redJack === 'v_ohm' ? this.redLeadJackMesh : this.maJackMesh;
    if (activeRedJack) {
      activeRedJack.getWorldPosition(dmmJackRedPos);
      dmmJackRedPos.y += 0.008;
    } else {
      dmmJackRedPos.set(this.benchX + 0.44 + 0.045, 0.965 + 0.06, 0.14 + 0.12);
    }
    if (this.comJackMesh) {
      this.comJackMesh.getWorldPosition(dmmJackBlackPos);
      dmmJackBlackPos.y += 0.008;
    } else {
      dmmJackBlackPos.set(this.benchX + 0.44 + 0.015, 0.965 + 0.06, 0.14 + 0.12);
    }

    // Probe Rear Boot Positions
    const redBootPos = this.redProbeGroup.localToWorld(new THREE.Vector3(0, 0.16, 0));
    const blackBootPos = this.blackProbeGroup.localToWorld(new THREE.Vector3(0, 0.16, 0));

    // --- Red Cable Curve (Smooth 5-point spline) ---
    const redJackArch = dmmJackRedPos.clone().add(new THREE.Vector3(0, 0.05, 0.06));
    const redMid = dmmJackRedPos.clone().lerp(redBootPos, 0.5);
    redMid.y = this.dmmState.redProbeTerminal ? 1.04 : 0.952; // Arcs in air if probing, rests on bench if stowed
    const redProbeArch = redBootPos.clone().add(new THREE.Vector3(0, this.dmmState.redProbeTerminal ? 0.08 : 0.03, 0));

    const redCurve = new THREE.CatmullRomCurve3([
      dmmJackRedPos,
      redJackArch,
      redMid,
      redProbeArch,
      redBootPos,
    ]);
    const redGeo = new THREE.TubeGeometry(redCurve, 32, 0.0055, 10, false);
    this.redCableMesh = new THREE.Mesh(
      redGeo,
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.1 })
    );
    this.root.add(this.redCableMesh);

    // --- Black Cable Curve (Smooth 5-point spline) ---
    const blackJackArch = dmmJackBlackPos.clone().add(new THREE.Vector3(0, 0.05, 0.06));
    const blackMid = dmmJackBlackPos.clone().lerp(blackBootPos, 0.5);
    blackMid.y = this.dmmState.blackProbeTerminal ? 1.04 : 0.952;
    const blackProbeArch = blackBootPos.clone().add(new THREE.Vector3(0, this.dmmState.blackProbeTerminal ? 0.08 : 0.03, 0));

    const blackCurve = new THREE.CatmullRomCurve3([
      dmmJackBlackPos,
      blackJackArch,
      blackMid,
      blackProbeArch,
      blackBootPos,
    ]);
    const blackGeo = new THREE.TubeGeometry(blackCurve, 32, 0.0055, 10, false);
    this.blackCableMesh = new THREE.Mesh(
      blackGeo,
      new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.35, metalness: 0.1 })
    );
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

    // LCD Liquid Crystal Gray/Black Background
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

    // Calculate percentage fill for analog bargraph
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
        // Snap probe needle tip directly into banana socket
        const p = this.terminalPositions[terminal];
        this.redProbeGroup.position.set(p.x, p.y + 0.015, p.z);
        this.redProbeGroup.rotation.set(0.25, 0, -0.15); // Authentic 15-deg backward lean
      } else {
        // Return to resting position on table
        this.redProbeGroup.position.set(this.benchX + 0.26, 0.948, 0.28);
        this.redProbeGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 6);
      }
    } else {
      this.dmmState.blackProbeTerminal = terminal;
      if (terminal && this.terminalPositions[terminal]) {
        const p = this.terminalPositions[terminal];
        this.blackProbeGroup.position.set(p.x, p.y + 0.015, p.z);
        this.blackProbeGroup.rotation.set(0.25, 0, 0.15);
      } else {
        this.blackProbeGroup.position.set(this.benchX + 0.33, 0.948, 0.28);
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
