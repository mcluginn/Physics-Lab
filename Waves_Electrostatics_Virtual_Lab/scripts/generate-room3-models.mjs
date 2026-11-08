// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Polyfill FileReader for Three.js GLTFExporter in Node.js
// @ts-ignore
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      // @ts-ignore
      this.result = buf;
      // @ts-ignore
      if (this.onload) this.onload({ target: this });
      // @ts-ignore
      if (this.onloadend) this.onloadend({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      // @ts-ignore
      this.result = `data:application/octet-stream;base64,${Buffer.from(buf).toString('base64')}`;
      // @ts-ignore
      if (this.onload) this.onload({ target: this });
      // @ts-ignore
      if (this.onloadend) this.onloadend({ target: this });
    });
  }
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const assetsDir = path.resolve(projectRoot, 'public/assets/room-3');

const THREE = await import('../node_modules/three/build/three.module.js');
const { GLTFExporter } = await import('../node_modules/three/examples/jsm/exporters/GLTFExporter.js');

const exporter = new GLTFExporter();

/**
 * Helper to export a Three.js Object3D into a binary GLB file
 * @param {THREE.Object3D} object 
 * @param {string} relativeOutputPath 
 * @returns {Promise<number>}
 */
async function exportToGLB(object, relativeOutputPath) {
  const fullPath = path.resolve(assetsDir, relativeOutputPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  const glbBuffer = await new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (result) => resolve(result),
      (error) => reject(error),
      { binary: true }
    );
  });

  // @ts-ignore
  fs.writeFileSync(fullPath, Buffer.from(glbBuffer));
  // @ts-ignore
  const sizeKb = (glbBuffer.byteLength / 1024).toFixed(1);
  console.log(`[GLB Export] Saved ${relativeOutputPath} (${sizeKb} KB)`);
  // @ts-ignore
  return glbBuffer.byteLength;
}

// -------------------------------------------------------------
// PBR MATERIAL PALETTE
// -------------------------------------------------------------
const matChassisDark = new THREE.MeshStandardMaterial({
  name: 'InstrumentChassisDark',
  color: 0x1e293b,
  roughness: 0.38,
  metalness: 0.72,
});

const matChassisLight = new THREE.MeshStandardMaterial({
  name: 'InstrumentChassisLight',
  color: 0xdbeafe,
  roughness: 0.42,
  metalness: 0.25,
});

const matBezel = new THREE.MeshStandardMaterial({
  name: 'BezelMatteBlack',
  color: 0x0f172a,
  roughness: 0.75,
  metalness: 0.15,
});

const matKnob = new THREE.MeshStandardMaterial({
  name: 'KnobDarkGray',
  color: 0x334155,
  roughness: 0.35,
  metalness: 0.65,
});

const matKnobAccent = new THREE.MeshStandardMaterial({
  name: 'KnobCyanAccent',
  color: 0x0284c7,
  roughness: 0.30,
  metalness: 0.50,
});

const matBindingRed = new THREE.MeshStandardMaterial({
  name: 'BindingPostRed',
  color: 0xef4444,
  roughness: 0.25,
  metalness: 0.40,
});

const matBindingBlack = new THREE.MeshStandardMaterial({
  name: 'BindingPostBlack',
  color: 0x18181b,
  roughness: 0.35,
  metalness: 0.35,
});

const matBindingGreen = new THREE.MeshStandardMaterial({
  name: 'BindingPostGreen',
  color: 0x22c55e,
  roughness: 0.25,
  metalness: 0.40,
});

const matGoldBNC = new THREE.MeshStandardMaterial({
  name: 'ConnectorBNCGold',
  color: 0xf59e0b,
  roughness: 0.20,
  metalness: 0.95,
});

const matSilverBNC = new THREE.MeshStandardMaterial({
  name: 'ConnectorBNCSilver',
  color: 0x94a3b8,
  roughness: 0.18,
  metalness: 0.92,
});

const matCRTDisplay = new THREE.MeshStandardMaterial({
  name: 'OscilloscopeScreenPhosphor',
  color: 0x032115,
  emissive: 0x054f30,
  emissiveIntensity: 0.85,
  roughness: 0.15,
  metalness: 0.10,
});

const matLEDDisplay = new THREE.MeshStandardMaterial({
  name: 'LEDDisplayScreen',
  color: 0x090d16,
  emissive: 0x0284c7,
  emissiveIntensity: 0.45,
  roughness: 0.12,
  metalness: 0.08,
});

// -------------------------------------------------------------
// 1. TEKTRONIX-STYLE DUAL-CHANNEL OSCILLOSCOPE
// -------------------------------------------------------------
function buildOscilloscope() {
  const scope = new THREE.Group();
  scope.name = 'Tektronix_Oscilloscope';

  // Main chassis (w: 0.38m, h: 0.18m, d: 0.26m)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.26), matChassisLight);
  chassis.position.y = 0.09;
  scope.add(chassis);

  // Front bezel
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.17, 0.02), matBezel);
  bezel.position.set(0, 0.09, 0.135);
  scope.add(bezel);

  // Display screen (left side: w: 0.18m, h: 0.13m)
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.005), matCRTDisplay);
  screen.name = 'Oscilloscope_Screen_Display';
  screen.position.set(-0.08, 0.095, 0.146);
  scope.add(screen);

  // CRT Screen Bezel surround
  const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.008), matChassisDark);
  screenFrame.position.set(-0.08, 0.095, 0.142);
  scope.add(screenFrame);

  // Rotary knobs (Time/Div, Volt/Div Ch1, Volt/Div Ch2, Trigger)
  const knobGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.018, 16);
  knobGeo.rotateX(Math.PI / 2);

  const knobPositions = [
    { name: 'Knob_TimeDiv', x: 0.06, y: 0.125, mat: matKnobAccent },
    { name: 'Knob_VoltsDiv_Ch1', x: 0.06, y: 0.065, mat: matKnobAccent },
    { name: 'Knob_VoltsDiv_Ch2', x: 0.12, y: 0.065, mat: matKnob },
    { name: 'Knob_Trigger', x: 0.12, y: 0.125, mat: matKnob },
  ];

  knobPositions.forEach((kp) => {
    const k = new THREE.Mesh(knobGeo, kp.mat);
    k.name = kp.name;
    k.position.set(kp.x, kp.y, 0.15);
    scope.add(k);
  });

  // BNC Input Ports (CH1, CH2, Ext Trig)
  const bncGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.014, 12);
  bncGeo.rotateX(Math.PI / 2);

  const bncPorts = [
    { name: 'BNC_Input_CH1', x: 0.06, y: 0.025 },
    { name: 'BNC_Input_CH2', x: 0.10, y: 0.025 },
    { name: 'BNC_Input_Trig', x: 0.14, y: 0.025 },
  ];

  bncPorts.forEach((bp) => {
    const b = new THREE.Mesh(bncGeo, matSilverBNC);
    b.name = bp.name;
    b.position.set(bp.x, bp.y, 0.15);
    scope.add(b);

    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.016, 8), matGoldBNC);
    pin.rotateX(Math.PI / 2);
    pin.position.set(bp.x, bp.y, 0.152);
    scope.add(pin);
  });

  // Top carrying handle
  const handleGeo = new THREE.BoxGeometry(0.24, 0.015, 0.02);
  const handle = new THREE.Mesh(handleGeo, matChassisDark);
  handle.position.set(0, 0.19, 0);
  scope.add(handle);

  return scope;
}

// -------------------------------------------------------------
// 2. AGILENT-STYLE TRIPLE OUTPUT DC POWER SUPPLY
// -------------------------------------------------------------
function buildDCPowerSupply() {
  const psu = new THREE.Group();
  psu.name = 'Agilent_DC_Power_Supply';

  // Main chassis (w: 0.28m, h: 0.14m, d: 0.28m)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.28), matChassisLight);
  psu.position.y = 0.07;
  psu.add(chassis);

  // Front bezel
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.13, 0.018), matBezel);
  bezel.position.set(0, 0.0, 0.142);
  chassis.add(bezel);

  // Digital LED Display (w: 0.14m, h: 0.055m)
  const display = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.055, 0.006), matLEDDisplay);
  display.name = 'DC_PSU_Digital_Display';
  display.position.set(-0.05, 0.025, 0.152);
  chassis.add(display);

  // Voltage and Current Knobs
  const knobGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.016, 16);
  knobGeo.rotateX(Math.PI / 2);

  const vKnob = new THREE.Mesh(knobGeo, matKnobAccent);
  vKnob.name = 'Knob_Voltage_Adjust';
  vKnob.position.set(0.08, 0.035, 0.155);
  chassis.add(vKnob);

  const iKnob = new THREE.Mesh(knobGeo, matKnob);
  iKnob.name = 'Knob_Current_Limit';
  iKnob.position.set(0.08, -0.015, 0.155);
  chassis.add(iKnob);

  // 4mm Binding Posts: + (Red), - (Black), GND (Green)
  const postGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.016, 12);
  postGeo.rotateX(Math.PI / 2);

  const posts = [
    { name: 'Post_Positive_Red', x: -0.07, y: -0.04, mat: matBindingRed },
    { name: 'Post_Negative_Black', x: -0.03, y: -0.04, mat: matBindingBlack },
    { name: 'Post_Earth_Green', x: 0.01, y: -0.04, mat: matBindingGreen },
  ];

  posts.forEach((p) => {
    const postMesh = new THREE.Mesh(postGeo, p.mat);
    postMesh.name = p.name;
    postMesh.position.set(p.x, p.y, 0.155);
    chassis.add(postMesh);
  });

  return psu;
}

// -------------------------------------------------------------
// 3. RIGOL-STYLE DDS FUNCTION GENERATOR
// -------------------------------------------------------------
function buildFunctionGenerator() {
  const fgen = new THREE.Group();
  fgen.name = 'Rigol_Function_Generator';

  // Chassis (w: 0.32m, h: 0.12m, d: 0.24m)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.24), matChassisLight);
  fgen.position.y = 0.06;
  fgen.add(chassis);

  // Bezel
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.11, 0.016), matBezel);
  bezel.position.set(0, 0, 0.122);
  chassis.add(bezel);

  // LCD screen (w: 0.14m, h: 0.065m)
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.065, 0.006), matLEDDisplay);
  screen.name = 'FunctionGen_LCD_Screen';
  screen.position.set(-0.065, 0.01, 0.132);
  chassis.add(screen);

  // Waveform selector buttons (Sine, Square, Triangle, Ramp, Noise)
  const btnGeo = new THREE.BoxGeometry(0.015, 0.01, 0.008);
  const btnMats = [matKnobAccent, matKnob, matKnob, matKnob];
  [-0.10, -0.07, -0.04, -0.01].forEach((bx, idx) => {
    const btn = new THREE.Mesh(btnGeo, btnMats[idx]);
    btn.name = `Btn_Waveform_${idx}`;
    btn.position.set(bx, -0.035, 0.132);
    chassis.add(btn);
  });

  // Main Frequency rotary dial
  const dialGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.016, 20);
  dialGeo.rotateX(Math.PI / 2);
  const freqDial = new THREE.Mesh(dialGeo, matKnobAccent);
  freqDial.name = 'Dial_Frequency';
  freqDial.position.set(0.07, 0.015, 0.134);
  chassis.add(freqDial);

  // BNC Output Ports (50 Ohm Output, Sync Out)
  const bncGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.014, 12);
  bncGeo.rotateX(Math.PI / 2);

  const mainOut = new THREE.Mesh(bncGeo, matSilverBNC);
  mainOut.name = 'BNC_Main_Output';
  mainOut.position.set(0.05, -0.035, 0.134);
  chassis.add(mainOut);

  const syncOut = new THREE.Mesh(bncGeo, matSilverBNC);
  syncOut.name = 'BNC_Sync_Output';
  syncOut.position.set(0.10, -0.035, 0.134);
  chassis.add(syncOut);

  return fgen;
}

// -------------------------------------------------------------
// 4. FLUKE-STYLE BENCHTOP/HANDHELD DIGITAL MULTIMETER
// -------------------------------------------------------------
function buildDigitalMultimeter() {
  const dmm = new THREE.Group();
  dmm.name = 'Fluke_Digital_Multimeter';

  // Yellow impact holster
  const holsterMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.45,
    metalness: 0.10,
  });
  const holster = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.22), holsterMat);
  holster.position.y = 0.025;
  dmm.add(holster);

  // Dark body core
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.048, 0.208), matBezel);
  body.position.y = 0.027;
  dmm.add(body);

  // LCD screen
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.004, 0.045), matLEDDisplay);
  screen.name = 'DMM_LCD_Readout';
  screen.position.set(0, 0.052, -0.055);
  dmm.add(screen);

  // Rotary Selector Switch
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.014, 20), matKnob);
  dial.name = 'DMM_Rotary_Dial';
  dial.position.set(0, 0.055, 0.01);
  dmm.add(dial);

  // 4 Banana Input Jacks (V-Ohm, COM, mA, 10A)
  const jackGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.01, 12);
  const jacks = [
    { name: 'Jack_V_Ohm', x: 0.032, z: 0.07, mat: matBindingRed },
    { name: 'Jack_COM', x: 0.011, z: 0.07, mat: matBindingBlack },
    { name: 'Jack_mA', x: -0.011, z: 0.07, mat: matBindingRed },
    { name: 'Jack_10A', x: -0.032, z: 0.07, mat: matBindingRed },
  ];

  jacks.forEach((j) => {
    const jm = new THREE.Mesh(jackGeo, j.mat);
    jm.name = j.name;
    jm.position.set(j.x, 0.052, j.z);
    dmm.add(jm);
  });

  return dmm;
}

// -------------------------------------------------------------
// 5. BREADBOARD & PRECISION RLC COMPONENT BOARD
// -------------------------------------------------------------
function buildBreadboard() {
  const bbGroup = new THREE.Group();
  bbGroup.name = 'Solderless_Breadboard_RLC';

  // Baseplate
  const baseplate = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.012, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.6 })
  );
  baseplate.position.y = 0.006;
  bbGroup.add(baseplate);

  // White solderless breadboard core
  const bbCoreMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65, metalness: 0.05 });
  const bbCore = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.014, 0.16), bbCoreMat);
  bbCore.position.set(0, 0.016, 0);
  bbGroup.add(bbCore);

  // Central divider trench
  const trench = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.006, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 })
  );
  trench.position.set(0, 0.022, 0);
  bbGroup.add(trench);

  // Resistors with color bands (100 Ohm, 220 Ohm, 470 Ohm)
  const resMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 });
  const bandGold = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.2 });

  [-0.06, 0.0, 0.06].forEach((rx, idx) => {
    const resBody = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.024, 10), resMat);
    resBody.rotateZ(Math.PI / 2);
    resBody.position.set(rx, 0.03, -0.04);
    resBody.name = `Resistor_${idx + 1}`;
    bbGroup.add(resBody);

    const leadL = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.015, 6), matSilverBNC);
    leadL.position.set(rx - 0.018, 0.026, -0.04);
    bbGroup.add(leadL);

    const leadR = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.015, 6), matSilverBNC);
    leadR.position.set(rx + 0.018, 0.026, -0.04);
    bbGroup.add(leadR);
  });

  // Copper coil inductor
  const coilMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.85, roughness: 0.25 });
  const inductor = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 8, 24), coilMat);
  inductor.rotateX(Math.PI / 2);
  inductor.position.set(-0.04, 0.032, 0.04);
  inductor.name = 'Inductor_Coil';
  bbGroup.add(inductor);

  // Ceramic capacitor
  const capMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35, metalness: 0.1 });
  const capacitor = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.018, 14), capMat);
  capacitor.position.set(0.04, 0.034, 0.04);
  capacitor.name = 'Capacitor_Electrolytic';
  bbGroup.add(capacitor);

  return bbGroup;
}

// -------------------------------------------------------------
// 6. THORLABS-STYLE OPTICAL RAIL WITH CARRIERS
// -------------------------------------------------------------
function buildOpticalRailSystem() {
  const railGroup = new THREE.Group();
  railGroup.name = 'Thorlabs_Optical_Rail_System';

  // Heavy anodized extruded aluminum triangular rail (2.0m long)
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.32,
    metalness: 0.82,
  });

  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.045, 0.095), railMat);
  rail.position.y = 0.0225;
  railGroup.add(rail);

  // Millimeter scale strip along front face
  const scaleStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(1.96, 0.015),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 })
  );
  scaleStrip.position.set(0, 0.025, 0.048);
  railGroup.add(scaleStrip);

  // End mounting brackets
  [-0.98, 0.98].forEach((bx) => {
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.7 })
    );
    foot.position.set(bx, 0.02, 0);
    railGroup.add(foot);
  });

  // Sliding Dovetail Carriers with locking thumbscrews
  const carrierMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.75 });
  const carrierPositions = [-0.60, -0.15, 0.25, 0.75];

  carrierPositions.forEach((cx, idx) => {
    const carrier = new THREE.Group();
    carrier.name = `Optical_Carrier_${idx + 1}`;
    carrier.position.set(cx, 0.045, 0);

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.11), carrierMat);
    carrier.add(saddle);

    const thumbscrew = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.015, 12), matSilverBNC);
    thumbscrew.rotateZ(Math.PI / 2);
    thumbscrew.position.set(0, 0, 0.06);
    carrier.add(thumbscrew);

    const postHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 16), carrierMat);
    postHolder.position.set(0, 0.045, 0);
    carrier.add(postHolder);

    railGroup.add(carrier);
  });

  return railGroup;
}

// -------------------------------------------------------------
// 7. PRECISION DIODE LASER SOURCE (532nm GREEN)
// -------------------------------------------------------------
function buildLaserSource() {
  const laserGroup = new THREE.Group();
  laserGroup.name = 'Precision_Diode_Laser_532nm';

  // Cylindrical black anodized housing
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.8 });
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 24), housingMat);
  housing.rotateZ(Math.PI / 2);
  laserGroup.add(housing);

  // Front collimating aperture bezel
  const apertureBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.02, 20), matSilverBNC);
  apertureBezel.rotateZ(Math.PI / 2);
  apertureBezel.position.set(0.09, 0, 0);
  laserGroup.add(apertureBezel);

  // Laser emitter crystal
  const emitterMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x22c55e,
    emissiveIntensity: 2.5,
    roughness: 0.1,
  });
  const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 12), emitterMat);
  emitter.name = 'Laser_Aperture_Emitter';
  emitter.rotateZ(Math.PI / 2);
  emitter.position.set(0.10, 0, 0);
  laserGroup.add(emitter);

  // Warning label (Yellow laser radiation diamond)
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.035, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.6 })
  );
  label.position.set(0, 0.023, 0);
  label.rotateX(-Math.PI / 2);
  laserGroup.add(label);

  return laserGroup;
}

// -------------------------------------------------------------
// 8. 360-DEGREE ROTARY GONIOMETER & SEMICIRCULAR OPTICAL PRISM
// -------------------------------------------------------------
function buildGoniometerPrism() {
  const gonio = new THREE.Group();
  gonio.name = 'Rotary_Goniometer_Prism_Stage';

  // Base rotary stage with degree markings
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.75 });
  const stageBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 36), baseMat);
  gonio.add(stageBase);

  // Vernier rotary dial ring
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.3 });
  const vernierRing = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.005, 36), ringMat);
  vernierRing.position.y = 0.012;
  gonio.add(vernierRing);

  // Glass Semicircular Optical Prism
  const prismMat = new THREE.MeshPhysicalMaterial({
    color: 0xe0f2fe,
    roughness: 0.08,
    metalness: 0.05,
    transmission: 0.92,
    transparent: true,
    opacity: 0.65,
  });

  const prismGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.04, 32, 1, false, 0, Math.PI);
  const prism = new THREE.Mesh(prismGeo, prismMat);
  prism.name = 'Semicircular_Crown_Glass_Prism';
  prism.position.y = 0.035;
  gonio.add(prism);

  return gonio;
}

// -------------------------------------------------------------
// 8B. OPTICAL DIFFRACTION PROJECTION SCREEN
// -------------------------------------------------------------
function buildDiffractionScreen() {
  const screenGroup = new THREE.Group();
  screenGroup.name = 'Diffraction_Projection_Screen';

  // Screen panel (w: 0.36m, h: 0.28m, d: 0.01m)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.28, 0.01),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9, metalness: 0.02 })
  );
  panel.position.y = 0.14;
  screenGroup.add(panel);

  // Millimeter grid markings overlay
  const gridMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 });
  const centerLine = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.26, 0.012), gridMat);
  centerLine.position.y = 0.14;
  screenGroup.add(centerLine);

  // Heavy steel post & base
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 })
  );
  post.position.y = -0.05;
  screenGroup.add(post);

  return screenGroup;
}

// -------------------------------------------------------------
// 9. RELATIVISTIC MAGLEV VACUUM BEAMLINE & SLED
// -------------------------------------------------------------
function buildMaglevBeamline() {
  const beamline = new THREE.Group();
  beamline.name = 'Special_Relativity_Maglev_Beamline';

  // Heavy steel support rail base (w: 3.2m, h: 0.08m, d: 0.45m)
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.08, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.85 })
  );
  base.position.y = 0.04;
  beamline.add(base);

  // Dual maglev guide tracks
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, roughness: 0.2 });
  [-0.14, 0.14].forEach((tz) => {
    const track = new THREE.Mesh(new THREE.BoxGeometry(3.18, 0.02, 0.035), trackMat);
    track.position.set(0, 0.09, tz);
    beamline.add(track);
  });

  // Copper quadrupole focusing rings
  const quadMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.9, roughness: 0.25 });
  [-1.2, -0.6, 0.0, 0.6, 1.2].forEach((qx) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 12, 32), quadMat);
    ring.position.set(qx, 0.16, 0);
    ring.rotateY(Math.PI / 2);
    beamline.add(ring);
  });

  // Moving Carrier Sled (Frame S')
  const sled = new THREE.Group();
  sled.name = 'Relativistic_Carrier_Sled_S_Prime';
  sled.position.set(0, 0.12, 0);

  const sledBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.03, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.7 })
  );
  sled.add(sledBody);

  // Twin vertical optical mirror posts (Photon Clock)
  const mirrorMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    metalness: 0.98,
    roughness: 0.05,
  });

  const bottomMirror = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 20), mirrorMat);
  bottomMirror.name = 'Photon_Clock_Bottom_Mirror';
  bottomMirror.position.set(0, 0.025, 0);
  sled.add(bottomMirror);

  const topMirror = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 20), mirrorMat);
  topMirror.name = 'Photon_Clock_Top_Mirror';
  topMirror.position.set(0, 0.38, 0);
  sled.add(topMirror);

  // Support posts for top mirror
  const postGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.36, 10);
  [-0.035, 0.035].forEach((pz) => {
    const post = new THREE.Mesh(postGeo, matSilverBNC);
    post.position.set(0, 0.20, pz);
    sled.add(post);
  });

  beamline.add(sled);
  return beamline;
}

// -------------------------------------------------------------
// 9B. HIGH-PRECISION PHOTON LIGHT-CLOCK
// -------------------------------------------------------------
function buildPhotonClock() {
  const clock = new THREE.Group();
  clock.name = 'Precision_Photon_Light_Clock';

  // Base platform
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.09, 0.02, 24),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.85 })
  );
  clock.add(base);

  // Mirrored dielectric resonators (bottom and top, L = 0.40m separation)
  const mirrorMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    metalness: 0.98,
    roughness: 0.04,
  });

  const bMirror = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 24), mirrorMat);
  bMirror.position.y = 0.015;
  clock.add(bMirror);

  const tMirror = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 24), mirrorMat);
  tMirror.position.y = 0.415;
  clock.add(tMirror);

  // Quartz glass protective envelope
  const glassTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.40, 24, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: 0xbae6fd,
      roughness: 0.05,
      metalness: 0.05,
      transmission: 0.94,
      transparent: true,
      opacity: 0.35,
    })
  );
  glassTube.position.y = 0.215;
  clock.add(glassTube);

  return clock;
}

// -------------------------------------------------------------
// 9C. DUAL REFERENCE FRAME TIME-DILATION DISPLAY
// -------------------------------------------------------------
function buildReferenceFrameDisplay() {
  const displayGroup = new THREE.Group();
  displayGroup.name = 'Reference_Frame_Telemetry_Display';

  // Stand and frame
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.32, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.7 })
  );
  frame.position.y = 0.16;
  displayGroup.add(frame);

  // Dual LCD display panels (Frame S on left, Frame S' on right)
  const sPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.24, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x0c4a6e, emissive: 0x0284c7, emissiveIntensity: 0.5, roughness: 0.2 })
  );
  sPanel.name = 'Display_Frame_S_Lab';
  sPanel.position.set(-0.11, 0.16, 0.016);
  displayGroup.add(sPanel);

  const sPrimePanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.24, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x4c1d95, emissive: 0x8b5cf6, emissiveIntensity: 0.5, roughness: 0.2 })
  );
  sPrimePanel.name = 'Display_Frame_SPrime_Moving';
  sPrimePanel.position.set(0.11, 0.16, 0.016);
  displayGroup.add(sPrimePanel);

  return displayGroup;
}

// -------------------------------------------------------------
// 10. HEAVY UNIVERSITY WORKBENCH
// -------------------------------------------------------------
function buildWorkbench() {
  const bench = new THREE.Group();
  bench.name = 'Laboratory_Epoxy_Workbench';

  // Epoxy resin countertop (w: 3.40m, h: 0.08m, d: 1.76m)
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(3.40, 0.08, 1.76),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.28, metalness: 0.12 })
  );
  top.position.y = 0.88;
  bench.add(top);

  // Welded steel apron subframe
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(3.28, 0.10, 1.64),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, metalness: 0.85 })
  );
  apron.position.y = 0.79;
  bench.add(apron);

  // Heavy steel square legs with leveling feet
  const legGeo = new THREE.BoxGeometry(0.08, 0.84, 0.08);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 });

  const legPositions = [
    [-1.60, 0.42, -0.78],
    [1.60, 0.42, -0.78],
    [-1.60, 0.42, 0.78],
    [1.60, 0.42, 0.78],
  ];

  legPositions.forEach(([lx, ly, lz]) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, ly, lz);
    bench.add(leg);

    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.85 })
    );
    foot.position.set(lx, 0.01, lz);
    bench.add(foot);
  });

  return bench;
}

// -------------------------------------------------------------
// 11. LABORATORY GLASSWARE CABINET
// -------------------------------------------------------------
function buildGlasswareCabinet() {
  const cab = new THREE.Group();
  cab.name = 'Laboratory_Glassware_Storage_Cabinet';

  // Steel cabinet body (w: 1.20m, h: 2.10m, d: 0.52m)
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.20, 2.10, 0.52),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.6 })
  );
  body.position.y = 1.05;
  cab.add(body);

  // Glazed glass door panels
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    roughness: 0.1,
    metalness: 0.1,
    transmission: 0.85,
    transparent: true,
    opacity: 0.45,
  });

  [-0.28, 0.28].forEach((gx) => {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.50, 1.80, 0.02), glassMat);
    pane.position.set(gx, 1.10, 0.26);
    cab.add(pane);
  });

  return cab;
}

// -------------------------------------------------------------
// 12. GENERATE AND EXPORT ALL 3D MODELS
// -------------------------------------------------------------
async function run() {
  console.log('=== Generating High-Fidelity Room 03 GLB Apparatus Models ===');

  // Electrical Station Models
  await exportToGLB(buildOscilloscope(), 'electrical/oscilloscope.glb');
  await exportToGLB(buildDCPowerSupply(), 'electrical/dc_power_supply.glb');
  await exportToGLB(buildFunctionGenerator(), 'electrical/function_generator.glb');
  await exportToGLB(buildDigitalMultimeter(), 'electrical/digital_multimeter.glb');
  await exportToGLB(buildBreadboard(), 'electrical/breadboard_circuit.glb');

  // Optics Station Models
  await exportToGLB(buildOpticalRailSystem(), 'optics/optical_rail_system.glb');
  await exportToGLB(buildLaserSource(), 'optics/laser_source.glb');
  await exportToGLB(buildGoniometerPrism(), 'optics/goniometer_prism.glb');
  await exportToGLB(buildDiffractionScreen(), 'optics/diffraction_screen.glb');

  // Relativity Station Models
  await exportToGLB(buildMaglevBeamline(), 'relativity/maglev_beamline.glb');
  await exportToGLB(buildPhotonClock(), 'relativity/photon_clock.glb');
  await exportToGLB(buildReferenceFrameDisplay(), 'relativity/reference_frame_display.glb');

  // Environment & Furniture Models
  await exportToGLB(buildWorkbench(), 'environment/lab_workbench.glb');
  await exportToGLB(buildGlasswareCabinet(), 'environment/glassware_cabinet.glb');

  console.log('=== All Room 03 3D GLB Models Successfully Generated and Saved ===');
}

run().catch((err) => {
  console.error('Fatal generation error:', err);
  process.exit(1);
});
