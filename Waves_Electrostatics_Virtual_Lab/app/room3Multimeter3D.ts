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

  // Probes & Cables
  private redProbeGroup: THREE.Group;
  private blackProbeGroup: THREE.Group;
  private redCableMesh: THREE.Mesh | null = null;
  private blackCableMesh: THREE.Mesh | null = null;
  private seriesJumperMesh: THREE.Mesh | null = null;

  // Terminal Positions (World/Local coordinates)
  public terminalPositions: Record<TerminalId, THREE.Vector3>;
  private callbacks: Multimeter3DCallbacks;
  private activeProbe: 'red' | 'black' | null = null;
  private continuityBeepPlaying = false;
  private benchX: number;

  constructor(benchX: number, callbacks: Multimeter3DCallbacks = {}) {
    this.benchX = benchX;
    this.callbacks = callbacks;
    this.root = new THREE.Group();
    this.root.name = 'Multimeter_And_Probes_System';

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
    this.terminalPositions = {
      SRC_POS: new THREE.Vector3(benchX - 0.70, 0.98, -0.15),
      SRC_NEG: new THREE.Vector3(benchX - 0.62, 0.98, -0.15),
      SERIES_JACK_A: new THREE.Vector3(benchX - 0.35, 0.97, 0.05),
      SERIES_JACK_B: new THREE.Vector3(benchX - 0.22, 0.97, 0.05),
      R1_A: new THREE.Vector3(benchX - 0.15, 0.97, 0.15),
      R1_B: new THREE.Vector3(benchX - 0.02, 0.97, 0.15),
      R2_A: new THREE.Vector3(benchX + 0.05, 0.97, 0.15),
      R2_B: new THREE.Vector3(benchX + 0.18, 0.97, 0.15),
      R3_A: new THREE.Vector3(benchX + 0.25, 0.97, 0.15),
      R3_B: new THREE.Vector3(benchX + 0.38, 0.97, 0.15),
      IND_A: new THREE.Vector3(benchX - 0.25, 0.97, -0.12),
      IND_B: new THREE.Vector3(benchX - 0.12, 0.97, -0.12),
      CAP_A: new THREE.Vector3(benchX + 0.15, 0.97, -0.12),
      CAP_B: new THREE.Vector3(benchX + 0.28, 0.97, -0.12),
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

    this.buildMultimeterBody();
    this.buildTerminalSockets();
    this.buildProbes();
    this.buildSeriesJumper();
    this.updateDisplay();
  }

  // -------------------------------------------------------------
  // BUILD 3D MULTIMETER HARDWARE
  // -------------------------------------------------------------
  private buildMultimeterBody() {
    const meterGroup = new THREE.Group();
    meterGroup.name = 'DMM_Body_Group';
    // Position on right side of workbench, tilted toward student
    meterGroup.position.set(this.benchX + 1.15, 0.98, 0.12);
    meterGroup.rotation.y = -Math.PI / 5;
    meterGroup.rotation.x = 0.18; // 10 degree ergonomic tilt

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
    meterGroup.add(this.redLeadJackMesh);
    this.interactableMeshes.push(this.redLeadJackMesh);

    // mA / 10A Jack (Red)
    const maJack = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.016, 16), jackRedMat);
    maJack.name = 'DMM_Jack_mA';
    maJack.position.set(-0.065, 0.052, 0.145);
    maJack.userData.isInteractable = true;
    maJack.userData.action = 'toggle_red_jack';
    meterGroup.add(maJack);
    this.interactableMeshes.push(maJack);

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

    Object.entries(this.terminalPositions).forEach(([tId, pos]) => {
      const socketGroup = new THREE.Group();
      socketGroup.position.copy(pos);

      // Collar
      const isRed = tId.includes('POS') || tId.includes('A') || tId.includes('SRC_POS');
      const collarMat = tId.includes('SRC_POS')
        ? redCollarMat
        : tId.includes('SRC_NEG')
        ? blackCollarMat
        : isRed
        ? cyanCollarMat
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
    this.redProbeGroup.add(redHitbox);
    this.interactableMeshes.push(redHitbox);

    // Initial resting position on table
    this.redProbeGroup.position.set(this.benchX + 0.92, 0.96, 0.32);
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
    this.blackProbeGroup.add(blackHitbox);
    this.interactableMeshes.push(blackHitbox);

    // Initial resting position on table
    this.blackProbeGroup.position.set(this.benchX + 1.02, 0.96, 0.32);
    this.blackProbeGroup.rotation.y = -Math.PI / 6;
    this.root.add(this.blackProbeGroup);

    this.updateCables();
  }

  // -------------------------------------------------------------
  // BUILD SERIES JUMPER WIRE
  // -------------------------------------------------------------
  private buildSeriesJumper() {
    this.seriesJumperMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.13, 10),
      new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35 })
    );
    this.seriesJumperMesh.rotation.z = Math.PI / 2;
    this.seriesJumperMesh.position.set(this.benchX - 0.285, 0.985, 0.05);
    this.seriesJumperMesh.name = 'Series_Loop_Jumper';
    this.seriesJumperMesh.userData.isInteractable = true;
    this.seriesJumperMesh.userData.action = 'toggle_jumper';
    this.root.add(this.seriesJumperMesh);
    this.interactableMeshes.push(this.seriesJumperMesh);
  }

  // -------------------------------------------------------------
  // UPDATE FLEXIBLE 3D LEAD CABLES
  // -------------------------------------------------------------
  public updateCables() {
    if (this.redCableMesh) this.root.remove(this.redCableMesh);
    if (this.blackCableMesh) this.root.remove(this.blackCableMesh);

    // DMM Jack positions in world space
    const dmmJackRedPos = new THREE.Vector3(
      this.benchX + 1.15 + (this.dmmState.redJack === 'v_ohm' ? 0.06 : -0.06),
      1.02,
      0.18
    );
    const dmmJackBlackPos = new THREE.Vector3(this.benchX + 1.15 + 0.02, 1.02, 0.18);

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
    const reading = readMultimeter(this.circuitState, this.dmmState);

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
    this.lcdCtx.fillStyle = reading.isValidMeasurement ? '#38bdf8' : reading.isContinuityBeep ? '#10b981' : '#f59e0b';
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
        this.redProbeGroup.position.set(this.benchX + 0.92, 0.96, 0.32);
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
        this.blackProbeGroup.position.set(this.benchX + 1.02, 0.96, 0.32);
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
