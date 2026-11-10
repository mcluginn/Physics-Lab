'use client';

export type Room3StationId = 'circuits' | 'optics' | 'relativity';

// -------------------------------------------------------------
// 1. Station Settings Types
// -------------------------------------------------------------
export type CircuitSettings = {
  mode: 'dc' | 'ac';
  topology: 'single' | 'series' | 'parallel' | 'combo';
  vs: number; // Volts (1.0 - 240.0 V)
  freq: number; // Hz (10 - 1000 Hz, active in AC)
  r1: number; // Ohms (1.0 - 1000.0)
  r2: number; // Ohms (1.0 - 1000.0)
  r3: number; // Ohms (1.0 - 1000.0)
  inductance: number; // mH (1.0 - 500.0 mH)
  capacitance: number; // uF (1.0 - 500.0 uF)
  powerOn?: boolean;
};

export type OpticsSettings = {
  subMode: 'refraction' | 'imaging' | 'diffraction';
  wavelength: number; // nm (400 - 700 nm)
  n1: number; // Refractive index medium 1 (1.00 - 2.42)
  n2: number; // Refractive index medium 2 (1.00 - 2.42)
  theta1: number; // Incident angle in degrees (0.0 - 89.0 deg)
  focalLength: number; // cm (-50.0 to +50.0 cm)
  objectDistance: number; // cm (5.0 to 200.0 cm)
  slitWidth: number; // mm (0.01 to 0.50 mm)
  slitSeparation: number; // mm (0.05 to 2.00 mm)
  screenDistance: number; // m (0.50 to 5.00 m)
  powerOn?: boolean;
};

export type RelativitySettings = {
  beta: number; // v/c (0.000 to 0.999)
  properTime: number; // ns (6.671 ns for mirror separation D = 1.00 m)
  properLength: number; // m (10.00 m rest rod)
  massPreset: 'electron' | 'proton' | 'muon' | 'alpha';
  restMass: number; // kg
  powerOn?: boolean;
  referenceFrame: 'lab' | 'rest'; // Frame S (Lab Observer) vs Frame S' (Rest Frame)
  activeDemo: 'clock' | 'rod' | 'both';
  simPlaying: boolean;
  simSpeed: number; // 0.25x, 0.5x, 1x, 2x
  showPhotonPath: boolean;
  showSimultaneityGates: boolean;
};

// -------------------------------------------------------------
// 2. Constants & Presets
// -------------------------------------------------------------
export const C_LIGHT = 299792458; // m/s
export const EV_TO_JOULE = 1.602176634e-19;
export const MEV_TO_JOULE = 1.602176634e-13;

export const MASS_PRESETS: Record<RelativitySettings['massPreset'], { name: string; massKg: number; restEnergyMeV: number }> = {
  electron: { name: 'Electron (e⁻)', massKg: 9.1093837e-31, restEnergyMeV: 0.5109989 },
  proton: { name: 'Proton (p⁺)', massKg: 1.6726219e-27, restEnergyMeV: 938.272 },
  muon: { name: 'Muon (μ⁻)', massKg: 1.8835316e-28, restEnergyMeV: 105.658 },
  alpha: { name: 'Alpha Particle (⁴He²⁺)', massKg: 6.644657e-27, restEnergyMeV: 3727.379 },
};

export const INITIAL_CIRCUITS: CircuitSettings = {
  mode: 'dc',
  topology: 'series',
  vs: 24.0,
  freq: 120.0, // 120 Hz: off-resonance (f0 ≈ 60 Hz) so XL and XC are unmasked
  r1: 100.0,
  r2: 220.0,
  r3: 330.0,
  inductance: 150.0, // 150 mH
  capacitance: 47.0, // 47 uF
  powerOn: true,
};

export const INITIAL_OPTICS: OpticsSettings = {
  subMode: 'refraction',
  wavelength: 532, // 532 nm Emerald Green
  n1: 1.00, // Air
  n2: 1.52, // Crown Glass baseline
  theta1: 30.0, // 30 degrees
  focalLength: 20.0, // +20 cm Converging Lens
  objectDistance: 40.0, // 40 cm
  slitWidth: 0.08, // 0.08 mm
  slitSeparation: 0.25, // 0.25 mm
  screenDistance: 2.00, // 2.00 m
  powerOn: true,
};

export const INITIAL_RELATIVITY: RelativitySettings = {
  beta: 0.100, // 0.10c
  properTime: 6.671, // ns (Δτ = 2D/c for D = 1.00 m)
  properLength: 10.00, // m (L0 = 10.00 m)
  massPreset: 'alpha',
  restMass: 6.644657e-27,
  powerOn: true,
  referenceFrame: 'lab',
  activeDemo: 'both',
  simPlaying: true,
  simSpeed: 1.0,
  showPhotonPath: true,
  showSimultaneityGates: true,
};

// -------------------------------------------------------------
// 3. Telemetry Calculation Functions
// -------------------------------------------------------------
export type CircuitResult = {
  req: number; // Ohms
  xl: number; // Ohms
  xc: number; // Ohms
  netReactance: number; // Ohms
  impedance: number; // Ohms
  current: number; // Amperes (total)
  i1: number; // A
  i2: number; // A
  i3: number; // A
  v1: number; // V
  v2: number; // V
  v3: number; // V
  phaseAngleRad: number;
  phaseAngleDeg: number;
  powerFactor: number;
  realPower: number; // Watts
  reactivePower: number; // VAR
  apparentPower: number; // VA
  resonantFreq: number; // Hz
};

export function calculateCircuit(settings: CircuitSettings): CircuitResult {
  const { mode, topology, vs, freq, r1, r2, r3, inductance, capacitance } = settings;
  const isAc = mode === 'ac';

  // DC Equivalent Resistance
  let req = 0;
  let i1 = 0, i2 = 0, i3 = 0;
  let v1 = 0, v2 = 0, v3 = 0;

  if (topology === 'single') {
    req = r3;
  } else if (topology === 'series') {
    req = r1 + r2 + r3;
  } else if (topology === 'parallel') {
    req = 1 / ((1 / Math.max(0.1, r1)) + (1 / Math.max(0.1, r2)) + (1 / Math.max(0.1, r3)));
  } else {
    // Combo: R1 + (R2 || R3)
    const r23 = (r2 * r3) / Math.max(0.1, r2 + r3);
    req = r1 + r23;
  }

  // AC Reactances
  const L = inductance * 1e-3; // H
  const C = capacitance * 1e-6; // F
  const xl = isAc ? 2 * Math.PI * freq * L : 0;
  const xc = isAc ? 1 / (2 * Math.PI * freq * Math.max(1e-9, C)) : 0;
  const netReactance = xl - xc;

  // Impedance
  const impedance = isAc ? Math.sqrt(req * req + netReactance * netReactance) : req;
  const effectiveVs = settings.powerOn === false ? 0 : vs;
  const current = effectiveVs / Math.max(0.01, impedance);

  // Branch Voltages & Currents
  if (topology === 'single') {
    v3 = effectiveVs;
    i3 = effectiveVs / Math.max(0.1, r3);
    v1 = 0; i1 = 0;
    v2 = 0; i2 = 0;
  } else if (topology === 'series') {
    i1 = current;
    i2 = current;
    i3 = current;
    v1 = current * r1;
    v2 = current * r2;
    v3 = current * r3;
  } else if (topology === 'parallel') {
    v1 = vs;
    v2 = vs;
    v3 = vs;
    i1 = vs / Math.max(0.1, r1);
    i2 = vs / Math.max(0.1, r2);
    i3 = vs / Math.max(0.1, r3);
  } else {
    // Combo
    v1 = current * r1;
    const v23 = vs - v1;
    v2 = v23;
    v3 = v23;
    i1 = current;
    i2 = v23 / Math.max(0.1, r2);
    i3 = v23 / Math.max(0.1, r3);
  }

  // Phase & Power
  const phaseAngleRad = isAc ? Math.atan2(netReactance, req) : 0;
  const phaseAngleDeg = (phaseAngleRad * 180) / Math.PI;
  const powerFactor = Math.cos(phaseAngleRad);
  const apparentPower = vs * current;
  const realPower = isAc ? apparentPower * powerFactor : vs * current;
  const reactivePower = isAc ? apparentPower * Math.sin(phaseAngleRad) : 0;

  const resonantFreq = 1 / (2 * Math.PI * Math.sqrt(Math.max(1e-12, L * C)));

  return {
    req,
    xl,
    xc,
    netReactance,
    impedance,
    current,
    i1,
    i2,
    i3,
    v1,
    v2,
    v3,
    phaseAngleRad,
    phaseAngleDeg,
    powerFactor,
    realPower,
    reactivePower,
    apparentPower,
    resonantFreq,
  };
}

export type OpticsResult = {
  laserHex: string;
  effectiveN2: number;
  theta1Rad: number;
  theta1Deg: number;
  criticalAngleDeg: number | null;
  isTIR: boolean;
  theta2Deg: number | null;
  theta2Rad: number | null;
  reflectAngleDeg: number;
  imageDistanceCm: number | null;
  magnification: number | null;
  imageType: 'Real' | 'Virtual' | 'At Infinity';
  imageOrientation: 'Inverted' | 'Upright' | 'None';
  imageScale: 'Magnified' | 'Diminished' | 'Same size' | 'Infinite';
  fringeSpacingMm: number;
  firstMaxPosMm: number;
  centralMaxMm: number;
  thetaDiffractionDeg: number;
};

// Convert wavelength (400-700 nm) to RGB hex
export function wavelengthToRGB(wl: number): string {
  let r = 0, g = 0, b = 0;
  if (wl >= 380 && wl < 440) {
    r = -(wl - 440) / (440 - 380);
    g = 0.0;
    b = 1.0;
  } else if (wl >= 440 && wl < 490) {
    r = 0.0;
    g = (wl - 440) / (490 - 440);
    b = 1.0;
  } else if (wl >= 490 && wl < 510) {
    r = 0.0;
    g = 1.0;
    b = -(wl - 510) / (510 - 490);
  } else if (wl >= 510 && wl < 580) {
    r = (wl - 510) / (580 - 510);
    g = 1.0;
    b = 0.0;
  } else if (wl >= 580 && wl < 645) {
    r = 1.0;
    g = -(wl - 645) / (645 - 580);
    b = 0.0;
  } else if (wl >= 645 && wl <= 780) {
    r = 1.0;
    g = 0.0;
    b = 0.0;
  }
  let factor = 1.0;
  if (wl >= 380 && wl < 420) factor = 0.3 + 0.7 * (wl - 380) / (420 - 380);
  else if (wl >= 700 && wl <= 780) factor = 0.3 + 0.7 * (780 - wl) / (780 - 700);

  const ir = Math.round(255 * Math.pow(r * factor, 0.8));
  const ig = Math.round(255 * Math.pow(g * factor, 0.8));
  const ib = Math.round(255 * Math.pow(b * factor, 0.8));
  return `#${((1 << 24) + (ir << 16) + (ig << 8) + ib).toString(16).slice(1)}`;
}

export function calculateOptics(settings: OpticsSettings): OpticsResult {
  const { wavelength, n1, n2, theta1, focalLength, objectDistance, slitWidth, slitSeparation, screenDistance } = settings;
  const laserHex = wavelengthToRGB(wavelength);

  // Cauchy Chromatic Dispersion: n₂(λ) = n_base + B * (1/λ² - 1/532²) with B = 4500 nm²
  const B_CAUCHY = 4500; // nm^2
  const invLambdaSq = 1 / (wavelength * wavelength);
  const invRefSq = 1 / (532 * 532);
  const effectiveN2 = Number((n2 + B_CAUCHY * (invLambdaSq - invRefSq)).toFixed(4));

  const theta1Rad = (theta1 * Math.PI) / 180;
  const reflectAngleDeg = theta1;

  // 1. Refraction & TIR using effectiveN2
  let criticalAngleDeg: number | null = null;
  let isTIR = false;
  let theta2Deg: number | null = null;
  let theta2Rad: number | null = null;

  if (n1 > effectiveN2) {
    const sinCrit = effectiveN2 / n1;
    criticalAngleDeg = Math.asin(sinCrit) * (180 / Math.PI);
    if (theta1 > criticalAngleDeg) {
      isTIR = true;
    }
  }

  if (!isTIR) {
    const sinTheta2 = (n1 / effectiveN2) * Math.sin(theta1Rad);
    if (sinTheta2 <= 1.0 && sinTheta2 >= -1.0) {
      theta2Rad = Math.asin(sinTheta2);
      theta2Deg = theta2Rad * (180 / Math.PI);
    } else {
      isTIR = true;
    }
  }

  // 2. Imaging (Thin Lens & Mirrors)
  let imageDistanceCm: number | null = null;
  let magnification: number | null = null;
  let imageType: 'Real' | 'Virtual' | 'At Infinity' = 'Real';
  let imageOrientation: 'Inverted' | 'Upright' | 'None' = 'Inverted';
  let imageScale: 'Magnified' | 'Diminished' | 'Same size' | 'Infinite' = 'Same size';

  const denom = objectDistance - focalLength;
  if (Math.abs(denom) < 0.1) {
    // Exact focal point placement: do = f -> di = ∞
    imageType = 'At Infinity';
    imageOrientation = 'None';
    imageScale = 'Infinite';
    imageDistanceCm = null;
    magnification = null;
  } else {
    imageDistanceCm = (focalLength * objectDistance) / denom;
    magnification = -imageDistanceCm / objectDistance;
    imageType = imageDistanceCm > 0 ? 'Real' : 'Virtual';
    imageOrientation = magnification > 0 ? 'Upright' : 'Inverted';
    const absM = Math.abs(magnification);
    imageScale = absM > 1.05 ? 'Magnified' : absM < 0.95 ? 'Diminished' : 'Same size';
  }

  // 3. Diffraction & Interference
  const lambdaM = wavelength * 1e-9; // m
  const dM = Math.max(1e-6, slitSeparation * 1e-3); // m
  const aM = Math.max(1e-6, slitWidth * 1e-3); // m
  const LM = Math.max(0.1, screenDistance); // m

  const fringeSpacingMm = ((lambdaM * LM) / dM) * 1000;
  const firstMaxPosMm = fringeSpacingMm;
  const centralMaxMm = ((2 * lambdaM * LM) / aM) * 1000;
  const sinDiff = Math.min(1.0, lambdaM / aM);
  const thetaDiffractionDeg = Math.asin(sinDiff) * (180 / Math.PI);

  return {
    laserHex,
    effectiveN2,
    theta1Rad,
    theta1Deg: theta1,
    criticalAngleDeg,
    isTIR,
    theta2Deg,
    theta2Rad,
    reflectAngleDeg,
    imageDistanceCm,
    magnification,
    imageType,
    imageOrientation,
    imageScale,
    fringeSpacingMm,
    firstMaxPosMm,
    centralMaxMm,
    thetaDiffractionDeg,
  };
}

export type RelativityResult = {
  beta: number;
  gamma: number;
  dilatedTime: number; // ns
  properTime: number; // ns
  timeDilationRatio: number;
  contractedLength: number; // m
  properLength: number; // m
  lengthContractionPercent: number; // %
  photonPathLabM: number; // m (2L in lab frame)
  photonPathRestM: number; // m (2D = 2.00 m in rest frame)
  speedMps: number; // m/s
  restEnergyJ: number; // J
  restEnergyMeV: number; // MeV
  totalEnergyJ: number; // J
  totalEnergyMeV: number; // MeV
  kineticEnergyJ: number; // J
  kineticEnergyMeV: number; // MeV
  momentumKgm_s: number; // kg m/s
  momentumMeV_c: number; // MeV/c
  referenceFrame: 'lab' | 'rest';
  isSimulated: boolean;
};

export function calculateRelativity(settings: RelativitySettings): RelativityResult {
  const { beta, properTime, properLength, massPreset, referenceFrame = 'lab' } = settings;
  const safeBeta = Math.min(0.9995, Math.max(0, beta));
  const betaSq = safeBeta * safeBeta;
  const gamma = 1 / Math.sqrt(Math.max(1e-6, 1 - betaSq));

  const speedMps = safeBeta * C_LIGHT;
  // D = 1.00 m mirror separation in photon clock
  const tau0 = properTime > 0 ? properTime : 6.671;
  const dilatedTime = gamma * tau0;

  // L0 = 10.00 m proper length
  const l0 = properLength > 0 ? properLength : 10.00;
  const contractedLength = l0 / gamma;
  const lengthContractionPercent = (1 - 1 / gamma) * 100;

  const photonPathRestM = 2.00; // 2 * D = 2 * 1.00 m
  const photonPathLabM = 2.00 * gamma; // c * Δt = 2D * γ

  const presetInfo = MASS_PRESETS[massPreset] || MASS_PRESETS.alpha;
  const m0 = presetInfo.massKg;

  const restEnergyJ = m0 * C_LIGHT * C_LIGHT;
  const restEnergyMeV = restEnergyJ / MEV_TO_JOULE;

  const totalEnergyJ = gamma * restEnergyJ;
  const totalEnergyMeV = gamma * restEnergyMeV;

  const kineticEnergyJ = (gamma - 1) * restEnergyJ;
  const kineticEnergyMeV = (gamma - 1) * restEnergyMeV;

  const momentumKgm_s = gamma * m0 * speedMps;
  const momentumMeV_c = (momentumKgm_s * C_LIGHT) / MEV_TO_JOULE;

  return {
    beta: safeBeta,
    gamma,
    dilatedTime,
    properTime: tau0,
    timeDilationRatio: gamma,
    contractedLength,
    properLength: l0,
    lengthContractionPercent,
    photonPathLabM,
    photonPathRestM,
    speedMps,
    restEnergyJ,
    restEnergyMeV,
    totalEnergyJ,
    totalEnergyMeV,
    kineticEnergyJ,
    kineticEnergyMeV,
    momentumKgm_s,
    momentumMeV_c,
    referenceFrame,
    isSimulated: true,
  };
}

// -------------------------------------------------------------
// 4. Lab Progress, Trials & Scoring Definitions
// -------------------------------------------------------------
export type TrialRecord = Record<string, number | string | boolean>;

export const TOTAL_TRIALS = 5;
export const TOTAL_STEPS = 9;

export type StationProgress = {
  currentStep: number;
  completed: boolean[];
  skipped: boolean[];
  trials: TrialRecord[];
  inspected: string[];
  setupActions: string[];
  calculations: string[];
  calculationStatus?: 'unattempted' | 'submitted' | 'validated';
  calculationFeedback?: string;
  observations: string;
  scientificInterpretation: string;
  claim: string;
  evidence: string;
  reasoning: string;
  analysis: string;
  conclusion: string;
  recommendations: string;
  errors: string[];
  guideAnswers?: number[];
  predictionAnswer?: number | null;
  assistedSteps?: number[];
  hintLevel?: number;
};

export type Room3Progress = Record<Room3StationId, StationProgress>;

export const STEP_NAMES = [
  'Equipment',
  'Assembly',
  'Power Config',
  'Instrument Prep',
  'Initial Investigation',
  'Measurement Safety',
  'Data Collection',
  'Computation',
  'Observations & Conclusion',
];

// 100 Points Distribution per Station:
// Steps 1-6 (Prep & Verification): 3+3+3+3+4+4 = 20 pts
// Step 7 (Five Valid 3D Trials): 25 pts (5 pts/trial)
// Step 8 (Student Calculations): 25 pts
// Step 9 (Observations & CER Conclusion): 30 pts (10 pts obs + 20 pts CER)
// Total per station = 100 pts · 3 stations = 300 pts room total
export const STEP_POINTS = [3, 3, 3, 3, 4, 4, 25, 25, 30];

export function createDefaultRoom3Progress(): Room3Progress {
  const station = (): StationProgress => ({
    currentStep: 0,
    completed: Array(TOTAL_STEPS).fill(false),
    skipped: Array(TOTAL_STEPS).fill(false),
    trials: [],
    inspected: [],
    setupActions: [],
    calculations: ['', '', '', '', ''],
    calculationStatus: 'unattempted',
    calculationFeedback: '',
    observations: '',
    scientificInterpretation: '',
    claim: '',
    evidence: '',
    reasoning: '',
    analysis: '',
    conclusion: '',
    recommendations: '',
    errors: [],
    guideAnswers: [-1, -1, -1],
    predictionAnswer: null,
    assistedSteps: [],
    hintLevel: 0,
  });
  return { circuits: station(), optics: station(), relativity: station() };
}

export function isStationFinished(progress: StationProgress) {
  if (!progress) return false;
  return Boolean(progress.completed?.[8]) || progress.completed.every((comp, index) => comp || Boolean(progress.skipped?.[index]));
}

export function stationScore(progress: StationProgress) {
  return progress.completed.reduce((total, complete, index) => total + (complete ? (STEP_POINTS[index] ?? 0) : 0), 0);
}

// -------------------------------------------------------------
// 5. Station Definitions (Headings, Objectives, Predictions)
// -------------------------------------------------------------
export type StationDefinition = {
  id: Room3StationId;
  number: string;
  shortName: string;
  title: string;
  subtitle: string;
  accent: string;
  objective: string;
  sourceLesson: string;
  placardSrc: string;
  placardAlt: string;
  steps: Array<{ title: string; prompt: string; target: string }>;
  prediction: {
    question: string;
    options: string[];
    answer: number;
    explanation: string;
  };
  errors: string[];
};

export const ROOM3_STATIONS: Record<Room3StationId, StationDefinition> = {
  circuits: {
    id: 'circuits',
    number: '01',
    shortName: 'DC & AC Circuits',
    title: 'DC & AC Electrical Circuits — Verification of Ohm\'s Law',
    subtitle: 'Voltage · Current · Resistance · Digital Multimeter Operation',
    accent: '#d4af37',
    objective: 'Investigate direct current circuits to verify Ohm\'s Law (V = I·R) and electrical power (P = V·I) across multiple operating voltages using a digital multimeter in parallel and series configurations.',
    sourceLesson: 'Lesson 8 — DC & AC Electrical Systems',
    placardSrc: '/assets/placards/apparatus_electricity.png',
    placardAlt: 'Cinematic laboratory test bench for DC and AC electrical circuits with oscilloscope and power supply',
    steps: [
      { title: 'Equipment Identification & Workbench Setup', prompt: 'Identify the DC power supply, AC function generator, Fluke 87V digital multimeter, Tektronix oscilloscope, and breadboard terminal matrix. Enter Workbench Close-Up mode [E].', target: 'Locate instruments and enter instrument close-up mode.' },
      { title: 'Circuit Assembly & Continuity Inspection', prompt: 'Verify the resistor network (R1 = 100 Ω, R2 = 220 Ω, R3 = 330 Ω) and ensure the series loop jumper is closed to provide a continuous conductive path.', target: 'Verify closed loop continuity before applying power.' },
      { title: 'Power Supply Setup & Energization', prompt: 'Configure the DC power supply to nominal voltage and energize the circuit. Observe the illuminated power indicator and oscilloscope standby display.', target: 'Apply potential across the network and verify steady-state power.' },
      { title: 'Multimeter Instrument Preparation', prompt: 'Configure the Fluke 87V digital multimeter: turn rotary selector dial to DC Voltage (V⎓) and verify test leads are connected to COM (ground) and V·Ω (high impedance) sockets.', target: 'Prepare digital multimeter for high-impedance voltage sensing.' },
      { title: 'Voltage Measurement Procedure (Parallel)', prompt: 'Practice non-intrusive potential difference measurement by placing test probes in parallel across the power supply rails and across resistor components.', target: 'Observe parallel potential difference measurement without breaking the circuit.' },
      { title: 'Current Measurement Procedure (Series)', prompt: 'De-energize the supply, open the series break (remove jumper), move red lead to mA jack, switch dial to A⎓, connect in series across break terminals, and re-energize to measure loop current.', target: 'Execute proper series ammeter insertion with burden shunt protection.' },
      { title: 'Five-Trial Experimental Data Collection', prompt: 'Conduct five experimental measurement trials across assigned operating voltages (2 V, 4 V, 6 V, 8 V, 10 V) using the nominal 330 Ω resistor. For each trial, measure resistor voltage and loop current.', target: 'Record five distinct voltage-current trials into the experimental dataset.' },
      { title: 'Student-Performed Data Computation', prompt: 'Compute experimental resistance (Ri = Vi / Ii), power (Pi = Vi · Ii), average resistance Rmean, sample standard deviation across operating points, percentage error vs. nominal 330 Ω, and perform linear regression analysis (V vs. I, slope = 330 Ω).', target: 'Complete scientific calculations, regression analysis, and certify lab notebook.' },
      { title: 'Observations, Scientific Interpretation & Conclusion', prompt: 'Formulate evidence-based observations from your 5-trial dataset, connect results to Ohm\'s and Kirchhoff\'s laws, and write a complete Claim–Evidence–Reasoning scientific conclusion.', target: 'Complete observations and submit Claim–Evidence–Reasoning conclusion.' },
    ],
    prediction: {
      question: 'In an AC series RLC circuit, what condition achieves resonance where total impedance Z is minimized?',
      options: [
        'Inductive reactance equals capacitive reactance (XL = XC), leaving Z = Req and power factor = 1.0.',
        'Inductance and capacitance both drop to zero, eliminating all circuit current.',
        'Driving frequency is halved so resistance dominates and phase angle becomes 90°.',
      ],
      answer: 0,
      explanation: 'At resonant frequency f₀ = 1/(2π√(LC)), inductive reactance XL = 2πfL cancels capacitive reactance XC = 1/(2πfC), leaving the net reactance at zero. Impedance collapses to pure resistance Z = Req, maximizing current with in-phase voltage (power factor cos φ = 1.0).',
    },
    errors: [
      'Internal resistance of the power supply and connecting leads',
      'Tolerance variations in commercial resistors (±5% nominal band)',
      'Parasitic resistance within the copper inductor winding',
      'Burden voltage and insertion impedance of the digital ammeter in series',
      'Dielectric leakage and thermal drift in the electrolytic capacitor',
    ],
  },
  optics: {
    id: 'optics',
    number: '02',
    shortName: 'Optics Bench',
    title: 'Geometric & Physical Optics — Thin Lens Equation Verification',
    subtitle: 'Reflection · Refraction · Thin Lens Imaging · Diffraction',
    accent: '#eab308',
    objective: 'Apply the Thin Lens Equation (1/f = 1/u + 1/v) to measure object and image distances, calculate experimental focal length, and analyze real inverted image formation.',
    sourceLesson: 'Lesson 9 — Geometric & Physical Optics',
    placardSrc: '/assets/placards/apparatus_optics.png',
    placardAlt: 'Cinematic precision optical bench with diode laser, refraction prism, lenses, and interference fringes',
    steps: [
      { title: 'Inspect the optical rail & components', prompt: 'Examine the 2-meter optical track, tunable laser source, semicircular prism tank, lens mounts, slit apertures, and observation screen.', target: 'Familiarize yourself with optical rail alignment and vernier cursors.' },
      { title: 'Optical Rail Alignment & Baseline Calibration', prompt: 'Verify paraxial alignment along the central optical axis to prevent spherical aberration and alignment parallax.', target: 'Align central rail axis and calibrate vernier cursor.' },
      { title: 'Laser Source Setup & Energization', prompt: 'Turn ON the tunable laser source at emerald calibration wavelength λ = 532 nm.', target: 'Energize monochromatic laser beam.' },
      { title: 'Lens Preparation & Thin Lens Alignment', prompt: 'Mount the converging lens with nominal focal length f = +20.0 cm on the central rail carrier.', target: 'Prepare thin lens optical configuration.' },
      { title: 'Real Image Formation Procedure', prompt: 'Position object lamp in front of lens and observe inverted real image formation on opposite side according to Gaussian optics (1/f = 1/u + 1/v).', target: 'Observe real inverted image projection.' },
      { title: 'Screen Focusing & Sharpness Adjustment Procedure', prompt: 'Slide observation screen along the rail until sharp focus is achieved. Confirm image sharpness indicator is at 100%.', target: 'Verify image sharpness focusing criteria.' },
      { title: 'Five-Trial Experimental Data Collection', prompt: 'Record five experimental trials at assigned object distances u = [30, 35, 40, 50, 60] cm. For each condition, adjust screen for sharp focus and record image distance v.', target: 'Log five sharp-focus thin lens trials.' },
      { title: 'Student-Performed Data Computation', prompt: 'Calculate experimental focal length (fi = uv/(u+v)), mean focal length fmean, standard deviation, percentage error vs. nominal 20.0 cm, and plot 1/v vs. 1/u regression.', target: 'Complete focal length calculations, regression fit, and certify optics report.' },
      { title: 'Observations, Scientific Interpretation & Conclusion', prompt: 'Record optical observations of image distance, inversion, and focal behavior, interpret findings via Gaussian thin lens theory, and formulate a Claim–Evidence–Reasoning scientific conclusion.', target: 'Complete observations and submit Claim–Evidence–Reasoning conclusion.' },
    ],
    prediction: {
      question: 'When light travels from an optically denser medium to a less dense medium (n₁ > n₂) at an incident angle exceeding the critical angle (θ₁ > θ_c), what optical phenomenon occurs?',
      options: [
        'The refracted beam travels along the normal at exactly 0° with zero deflection.',
        'Total Internal Reflection (TIR), where 100% of incident light reflects internally because sin θ₂ > 1 has no real solution in Snell\'s Law.',
        'Complete absorption of the light wave within the boundary interface.',
        'Frequency doubling where light re-radiates at half its incident wavelength.',
      ],
      answer: 1,
      explanation: 'According to Snell\'s Law (n₁ sin θ₁ = n₂ sin θ₂), when light propagates from a denser medium into a less dense medium (n₁ > n₂) and incident angle θ₁ exceeds the critical angle θ_c = arcsin(n₂/n₁), the required value for sin θ₂ exceeds 1.0. Because sin θ₂ > 1 has no real solution, refraction cannot occur and 100% of incident light undergoes Total Internal Reflection (TIR), perfectly conserving optical energy.',
    },
    errors: [
      'Diffraction spreading and finite beam divergence of the laser diode',
      'Spherical aberration in non-paraxial ray paths through the lens margins',
      'Index of refraction dispersion (wavelength dependence of n)',
      'Backlash and vernier parallax error when positioning the observation screen',
      'Ambient laboratory background light reducing interference fringe contrast',
    ],
  },
  relativity: {
    id: 'relativity',
    number: '03',
    shortName: 'Special Relativity',
    title: 'Special Relativity — Computational Simulation Investigation',
    subtitle: 'Time Dilation · Length Contraction · Lorentz Invariance',
    accent: '#c5a052',
    objective: 'Investigate the consequences of Einstein\'s postulates through computational simulations of a two-mirror photon clock and moving rod, demonstrating time dilation, length contraction, and mass-energy across multiple velocities.',
    sourceLesson: 'Lesson 10 — Special Theory of Relativity',
    placardSrc: '/assets/placards/apparatus_relativity.png',
    placardAlt: 'Cinematic relativistic photon light-clock apparatus and linear accelerator beam pipe',
    steps: [
      { title: 'Identify Relativistic Equipment & Reference Frames', prompt: 'Inspect the two-mirror photon clock, moving reference-frame display, velocity regulator dial, and moving-rod interferometer.', target: 'Identify the apparatus components and establish Frame S (Lab) vs. Frame S\' (Moving Rest Frame).' },
      { title: 'Observe the Rest Frame (Photon Clock Baseline)', prompt: 'Inspect the stationary photon clock. Observe the vertical round-trip path between mirrors (D = 1.00 m) and verify proper time Δτ = 2D/c ≈ 6.671 ns.', target: 'Verify proper time baseline in the clock\'s rest frame.' },
      { title: 'Introduce Relative Motion (Moving Sled)', prompt: 'Accelerate the sled to relativistic velocity. Observe the distinction between the moving clock\'s rest frame S\' and the stationary laboratory observer frame S.', target: 'Understand relative motion across inertial frames.' },
      { title: 'Investigate Photon Motion & Light Path Geometry', prompt: 'Switch between Frame S (Lab) and Frame S\' (Rest). Observe the diagonal zigzag photon path in the lab frame vs. vertical bounce in rest frame, while c remains invariant.', target: 'Analyze light trajectory invariance and diagonal path extension.' },
      { title: 'Investigate Relativistic Time Dilation', prompt: 'Observe how the extended diagonal path in the laboratory frame causes the moving clock\'s tick interval to dilate: Δt = γ Δτ.', target: 'Validate time dilation Δt = γ Δτ.' },
      { title: 'Investigate Length Contraction & Simultaneity', prompt: 'Activate the moving-rod demonstration (L₀ = 10.00 m). Observe contracted length L = L₀/γ measured by simultaneous endpoint detection in the laboratory frame.', target: 'Understand longitudinal length contraction and frame simultaneity.' },
      { title: 'Five-Condition Simulation Data Collection', prompt: 'Run five simulation conditions across assigned relative velocities β = [0.10, 0.30, 0.50, 0.70, 0.90]c. Record Lorentz factor γ, dilated time Δt, and contracted length L.', target: 'Record five simulation conditions into dataset.' },
      { title: 'Student-Performed Relativistic Computation', prompt: 'Compute theoretical Lorentz factors, time dilation, length contraction, verify zero numerical residual, and analyze the 3 relativistic graphs.', target: 'Complete relativistic computations, graphs, and certified report.' },
      { title: 'Observations, Scientific Interpretation & Conclusion', prompt: 'Document relativistic observations of time dilation, length contraction, and invariant light speed c, interpret spacetime structure, and formulate a Claim–Evidence–Reasoning scientific conclusion.', target: 'Complete observations and submit Claim–Evidence–Reasoning conclusion.' },
    ],
    prediction: {
      question: 'As an inertial frame moves at relativistic velocity v relative to an observer, how does the elapsed time interval Δt measured by the stationary observer compare to the proper time interval Δt₀ measured in the moving frame?',
      options: [
        'Time contracts; clocks in the moving frame appear to tick faster according to Δt = Δt₀ / γ.',
        'Time remains invariant because light speed adjusts to match source frame velocity.',
        'Time dilates (expands); clocks moving at velocity v tick slower by the Lorentz factor γ = (1 - v²/c²)⁻¹/², yielding dilated time interval Δt = γ Δt₀.',
        'Time reverses direction whenever velocity exceeds 0.50c.',
      ],
      answer: 2,
      explanation: 'Under the Lorentz transformation, because the speed of light c is an invariant constant in all inertial reference frames, an observer at rest observes light traveling along a longer diagonal path inside a moving clock. Consequently, the moving clock ticks slower by the Lorentz factor γ = (1 - v²/c²)⁻¹/², producing relativistic time dilation: Δt = γ Δt₀.',
    },
    errors: [
      'Numerical truncation and floating-point roundoff in transcendental Lorentz factor computation',
      'Phase quantization in discrete photon-path rendering across finite simulation timesteps',
      'Relativistic aberration in wide-angle optical projections',
      'Finite signal transmission latency in remote detector synchronization',
      'Approximation limits in non-continuous frame interpolation',
    ],
  },
};

// -------------------------------------------------------------
// 6. Trial Columns for Table View
// -------------------------------------------------------------
export const TRIAL_COLUMNS: Record<Room3StationId, Array<{ key: string; label: string }>> = {
  circuits: [
    { key: 'trial', label: '#' },
    { key: 'vs', label: 'Vs (V)' },
    { key: 'measuredV', label: 'Measured V (V)' },
    { key: 'measuredI_mA', label: 'Current (mA)' },
    { key: 'measuredI_A', label: 'Current (A)' },
    { key: 'resistance', label: 'R_exp (Ω)' },
    { key: 'expectedR', label: 'R_theor (Ω)' },
    { key: 'percentError', label: '% Error' },
  ],
  optics: [
    { key: 'trial', label: '#' },
    { key: 'u', label: 'Object u (cm)' },
    { key: 'v', label: 'Image v (cm)' },
    { key: 'invU', label: '1/u (cm⁻¹)' },
    { key: 'invV', label: '1/v (cm⁻¹)' },
    { key: 'f_exp', label: 'f_exp (cm)' },
    { key: 'f_nom', label: 'f_nom (cm)' },
    { key: 'percentError', label: '% Error' },
  ],
  relativity: [
    { key: 'trial', label: 'Run' },
    { key: 'beta', label: 'β (v/c)' },
    { key: 'speed', label: 'Velocity (m/s)' },
    { key: 'gamma', label: 'Lorentz Factor γ' },
    { key: 'properTime', label: 'Proper Time Δτ (ns)' },
    { key: 'dilatedTime', label: 'Dilated Time Δt (ns)' },
    { key: 'properLength', label: 'Proper Length L₀ (m)' },
    { key: 'contractedLength', label: 'Contracted Length L (m)' },
  ],
};

export type AssignedTrialCondition = {
  trialIndex: number;
  label: string;
  targetParam: string;
  targetValue: number;
  unit: string;
  expectedSecondary: number;
  secondaryUnit: string;
  instruction: string;
};

export const ROOM3_ASSIGNED_TRIALS: Record<Room3StationId, AssignedTrialCondition[]> = {
  circuits: [
    { trialIndex: 0, label: 'Trial 1', targetParam: 'Vs', targetValue: 2.0, unit: 'V', expectedSecondary: 6.06, secondaryUnit: 'mA', instruction: 'Set DC Power Supply to 2.0 V. Measure potential difference across nominal 330 Ω resistor and insert ammeter in series to measure loop current (expected: 6.06 mA, 0.0121 W).' },
    { trialIndex: 1, label: 'Trial 2', targetParam: 'Vs', targetValue: 4.0, unit: 'V', expectedSecondary: 12.12, secondaryUnit: 'mA', instruction: 'Set DC Power Supply to 4.0 V. Measure potential difference across nominal 330 Ω resistor and insert ammeter in series to measure loop current (expected: 12.12 mA, 0.0485 W).' },
    { trialIndex: 2, label: 'Trial 3', targetParam: 'Vs', targetValue: 6.0, unit: 'V', expectedSecondary: 18.18, secondaryUnit: 'mA', instruction: 'Set DC Power Supply to 6.0 V. Measure potential difference across nominal 330 Ω resistor and insert ammeter in series to measure loop current (expected: 18.18 mA, 0.1091 W).' },
    { trialIndex: 3, label: 'Trial 4', targetParam: 'Vs', targetValue: 8.0, unit: 'V', expectedSecondary: 24.24, secondaryUnit: 'mA', instruction: 'Set DC Power Supply to 8.0 V. Measure potential difference across nominal 330 Ω resistor and insert ammeter in series to measure loop current (expected: 24.24 mA, 0.1939 W).' },
    { trialIndex: 4, label: 'Trial 5', targetParam: 'Vs', targetValue: 10.0, unit: 'V', expectedSecondary: 30.30, secondaryUnit: 'mA', instruction: 'Set DC Power Supply to 10.0 V. Measure potential difference across nominal 330 Ω resistor and insert ammeter in series to measure loop current (expected: 30.30 mA, 0.3030 W).' },
  ],
  optics: [
    { trialIndex: 0, label: 'Trial 1', targetParam: 'u', targetValue: 30.0, unit: 'cm', expectedSecondary: 60.00, secondaryUnit: 'cm', instruction: 'Position object lamp at u = 30.0 cm. Slide observation screen until image achieves sharp focus (v ≈ 60.0 cm).' },
    { trialIndex: 1, label: 'Trial 2', targetParam: 'u', targetValue: 35.0, unit: 'cm', expectedSecondary: 46.67, secondaryUnit: 'cm', instruction: 'Position object lamp at u = 35.0 cm. Slide observation screen until image achieves sharp focus (v ≈ 46.7 cm).' },
    { trialIndex: 2, label: 'Trial 3', targetParam: 'u', targetValue: 40.0, unit: 'cm', expectedSecondary: 40.00, secondaryUnit: 'cm', instruction: 'Position object lamp at u = 40.0 cm (2f). Slide observation screen until image achieves sharp focus (v = 40.0 cm, M = -1.0×).' },
    { trialIndex: 3, label: 'Trial 4', targetParam: 'u', targetValue: 50.0, unit: 'cm', expectedSecondary: 33.33, secondaryUnit: 'cm', instruction: 'Position object lamp at u = 50.0 cm. Slide observation screen until image achieves sharp focus (v ≈ 33.3 cm).' },
    { trialIndex: 4, label: 'Trial 5', targetParam: 'u', targetValue: 60.0, unit: 'cm', expectedSecondary: 30.00, secondaryUnit: 'cm', instruction: 'Position object lamp at u = 60.0 cm (3f). Slide observation screen until image achieves sharp focus (v = 30.0 cm).' },
  ],
  relativity: [
    { trialIndex: 0, label: 'Run 1', targetParam: 'β', targetValue: 0.10, unit: 'c', expectedSecondary: 1.0050, secondaryUnit: 'γ', instruction: 'Set relative velocity to β = 0.10c. Measure simulated dilated time (Δt = 6.705 ns) and contracted length (L = 9.950 m).' },
    { trialIndex: 1, label: 'Run 2', targetParam: 'β', targetValue: 0.30, unit: 'c', expectedSecondary: 1.0483, secondaryUnit: 'γ', instruction: 'Set relative velocity to β = 0.30c. Measure simulated dilated time (Δt = 6.993 ns) and contracted length (L = 9.539 m).' },
    { trialIndex: 2, label: 'Run 3', targetParam: 'β', targetValue: 0.50, unit: 'c', expectedSecondary: 1.1547, secondaryUnit: 'γ', instruction: 'Set relative velocity to β = 0.50c. Measure simulated dilated time (Δt = 7.703 ns) and contracted length (L = 8.660 m).' },
    { trialIndex: 3, label: 'Run 4', targetParam: 'β', targetValue: 0.70, unit: 'c', expectedSecondary: 1.4003, secondaryUnit: 'γ', instruction: 'Set relative velocity to β = 0.70c. Measure simulated dilated time (Δt = 9.342 ns) and contracted length (L = 7.141 m).' },
    { trialIndex: 4, label: 'Run 5', targetParam: 'β', targetValue: 0.90, unit: 'c', expectedSecondary: 2.2942, secondaryUnit: 'γ', instruction: 'Set relative velocity to β = 0.90c. Measure simulated dilated time (Δt = 15.305 ns) and contracted length (L = 4.359 m).' },
  ],
};

// -------------------------------------------------------------
// 7. Interactive Guided Questions (Step 7 Checkpoints)
// -------------------------------------------------------------
export type GuideQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export const ROOM3_GUIDE_QUESTIONS: Record<Room3StationId, GuideQuestion[]> = {
  circuits: [
    {
      id: 'c-q1',
      question: 'In an AC series RLC circuit with R = 100 Ω, XL = 250 Ω, and XC = 150 Ω driven by Vs = 141.4 V (rms), what is the total circuit impedance Z and phase angle φ?',
      options: [
        'Z = 100.0 Ω and φ = 0.0° (purely resistive resonance)',
        'Z = 141.4 Ω and φ = +45.0° (inductive, current lags voltage)',
        'Z = 500.0 Ω and φ = -45.0° (capacitive, current leads voltage)',
        'Z = 200.0 Ω and φ = +90.0° (purely inductive)',
      ],
      correctIndex: 1,
      explanation: 'Net reactance X = XL - XC = 250 - 150 = 100 Ω. Impedance Z = √(R² + X²) = √(100² + 100²) = √20000 ≈ 141.4 Ω. The phase angle is φ = arctan(100/100) = +45.0°. Because XL > XC, the circuit is inductive and current lags voltage.',
    },
    {
      id: 'c-q2',
      question: 'How does Kirchhoff\'s Current Law (KCL) apply to a parallel circuit junction?',
      options: [
        'The algebraic sum of currents entering any node equals the sum of currents leaving (Σ I = 0), conserving electric charge.',
        'The current is identical through every branch regardless of individual branch resistances.',
        'Current drops to zero at parallel junctions because resistance increases.',
        'Total current is divided evenly among branches even when resistances are unequal.',
      ],
      correctIndex: 0,
      explanation: 'Kirchhoff\'s Current Law is a fundamental expression of charge conservation: electric charge cannot accumulate indefinitely at a junction node, so total incoming current must identically equal total outgoing current.',
    },
    {
      id: 'c-q3',
      question: 'Why is a high power factor (cos φ close to 1.0) desirable in electrical power distribution systems?',
      options: [
        'It eliminates the need for alternating current by converting AC directly to DC.',
        'It reduces the operating frequency from 60 Hz to 0 Hz.',
        'It maximizes the proportion of real power delivered while minimizing reactive current losses in transmission lines.',
        'It prevents circuit breakers from ever tripping under short-circuit faults.',
      ],
      correctIndex: 2,
      explanation: 'Real power P = Vrms * Irms * cos φ performs useful work. If cos φ is low, much higher Irms must flow to deliver the same real power, causing large resistive I²R transmission heating losses in conductors and transformers.',
    },
  ],
  optics: [
    {
      id: 'o-q1',
      question: 'A beam of emerald laser light (λ = 532 nm) in air (n₁ = 1.00) strikes crown glass (n₂ = 1.52) at an angle of incidence θ₁ = 45.0°. What is the angle of refraction θ₂?',
      options: [
        'θ₂ = 45.0° (passes straight through with no deflection)',
        'θ₂ = 68.3° (bends away from the normal)',
        'θ₂ = 27.7° (bends toward the normal)',
        'Total internal reflection occurs with no refracted beam',
      ],
      correctIndex: 2,
      explanation: 'By Snell\'s law: sin θ₂ = (n₁ / n₂) * sin θ₁ = (1.00 / 1.52) * sin(45.0°) = 0.6579 * 0.7071 = 0.4652. Thus θ₂ = arcsin(0.4652) = 27.72°. Entering a denser medium slows the wave and bends the ray toward the normal.',
    },
    {
      id: 'o-q2',
      question: 'An object is placed do = 30.0 cm in front of a thin converging lens with focal length f = +20.0 cm. What are the image distance di and lateral magnification M?',
      options: [
        'di = +60.0 cm (Real image) and M = -2.00 (Inverted, magnified 2×)',
        'di = -60.0 cm (Virtual image) and M = +2.00 (Upright, magnified 2×)',
        'di = +12.0 cm (Real image) and M = -0.40 (Inverted, diminished)',
        'di = -12.0 cm (Virtual image) and M = +1.00 (Same size)',
      ],
      correctIndex: 0,
      explanation: 'Using 1/di = 1/f - 1/do = 1/20 - 1/30 = (3 - 2)/60 = 1/60 cm⁻¹. Therefore di = +60.0 cm. Because di > 0, the image is Real and forms on the opposite side. Magnification M = -di / do = -60.0 / 30.0 = -2.00 (inverted, enlarged 2×).',
    },
    {
      id: 'o-q3',
      question: 'In Young\'s double-slit experiment, what happens to the spatial fringe spacing Δy if the slit separation d is halved (d\' = d/2)?',
      options: [
        'The fringe spacing is halved (0.5×)',
        'The fringe spacing doubles (2×) according to Δy = λL / d',
        'The fringes disappear into a uniform blur',
        'Only the central fringe changes; others stay at fixed positions',
      ],
      correctIndex: 1,
      explanation: 'Fringe spacing Δy = (λ L) / d is inversely proportional to slit separation d. Halving d in the denominator doubles the angular separation of interference maxima, spreading the interference pattern twice as wide.',
    },
  ],
  relativity: [
    {
      id: 'r-q1',
      question: 'If a relativistic spaceship travels at speed v = 0.80c relative to Earth, what are the Lorentz factor γ and the length L of a meter rod (L₀ = 1.00 m) oriented along the flight path?',
      options: [
        'γ = 1.250 and L = 0.80 m (contracted by 20%)',
        'γ = 1.667 and L = 0.60 m (contracted by 40%)',
        'γ = 2.000 and L = 0.50 m (contracted by 50%)',
        'γ = 1.000 and L = 1.00 m (no contraction)',
      ],
      correctIndex: 1,
      explanation: 'Lorentz factor γ = 1 / √(1 - 0.80²) = 1 / √(1 - 0.64) = 1 / √0.36 = 1 / 0.60 ≈ 1.667. Length contraction along the motion axis is L = L₀ / γ = 1.00 m * 0.60 = 0.60 m (contracted to 60% of rest length).',
    },
    {
      id: 'r-q2',
      question: 'Atmospheric muons produced by cosmic rays have a rest lifetime τ₀ = 2.20 μs. Traveling at v = 0.995c (where γ ≈ 10.0), how does special relativity explain why many reach Earth\'s surface before decaying?',
      options: [
        'In the Earth frame, muon time dilates to τ = γ τ₀ ≈ 22.0 μs, allowing them to travel ~6.6 km before decay.',
        'Muons travel faster than light in the upper atmosphere.',
        'Cosmic ray collisions accelerate muons backward in time.',
        'Muon mass drops to zero at high speeds so they do not decay.',
      ],
      correctIndex: 0,
      explanation: 'Classical mechanics predicts muons could only travel ~660 m before decaying (c * 2.2 μs). Because of relativistic time dilation, Earth observers measure the muon clock dilated by γ ≈ 10 to ~22 μs, allowing them to travel ~6.6 km and easily reach sea-level detectors.',
    },
    {
      id: 'r-q3',
      question: 'What is the relationship between rest mass m₀, relativistic kinetic energy K, and total relativistic energy E?',
      options: [
        'E = 1/2 m₀ v² regardless of speed',
        'E = m₀ c² and kinetic energy is purely imaginary',
        'K = γ m₀ v and rest energy is zero',
        'E = γ m₀ c² = m₀ c² + K, where kinetic energy is K = (γ - 1) m₀ c²',
      ],
      correctIndex: 3,
      explanation: 'Total relativistic energy is E = γ m₀ c². When the object is at rest (γ = 1), its rest energy is E₀ = m₀ c². The difference between total energy and rest energy is the relativistic kinetic energy: K = E - E₀ = (γ - 1) m₀ c².',
    },
  ],
};

// Statistical utilities
export function calculateTrialStats(values: number[]) {
  if (!values.length) return { mean: 0, stdDev: 0, sem: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (values.length === 1) return { mean, stdDev: 0, sem: 0 };
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
  const stdDev = Math.sqrt(variance);
  const sem = stdDev / Math.sqrt(values.length);
  return { mean, stdDev, sem };
}

export function computeCircuitOhmMetrics(trials: TrialRecord[]) {
  const valid = (trials || []).filter((t) => {
    const iA = Number(t.measuredI_A ?? (typeof t.measuredI_mA !== 'undefined' ? Number(t.measuredI_mA) / 1000 : null) ?? t.current ?? 0);
    return iA > 0;
  });
  if (valid.length === 0) {
    return {
      resistances: [],
      mean: null as number | null,
      stdDev: null as number | null,
      sem: null as number | null,
      theoreticalReq: 330.0,
      percentError: null as number | null,
      hasData: false,
    };
  }
  const resistances = valid.map((t) => {
    if (typeof t.resistance === 'number' && Number(t.resistance) > 10.0) return Number(t.resistance);
    const v = Number(t.measuredV ?? t.vs ?? 0);
    const iA = Number(t.measuredI_A ?? (typeof t.measuredI_mA !== 'undefined' ? Number(t.measuredI_mA) / 1000 : null) ?? t.current ?? 0.001);
    return iA > 0 ? (v * 1000) / (iA * 1000) : 330.0;
  });
  const stats = calculateTrialStats(resistances);
  const theoreticalReq = 330.0;
  const percentError = stats.mean > 0 ? Math.abs((stats.mean - theoreticalReq) / theoreticalReq) * 100 : 0;
  return {
    resistances,
    mean: stats.mean,
    stdDev: stats.stdDev,
    sem: stats.sem,
    theoreticalReq,
    percentError,
    hasData: true,
  };
}

export function computeOpticsLensMetrics(trials: TrialRecord[]) {
  const valid = (trials || []).filter((t) => Number(t.u ?? t.paramA ?? 0) > 0 && Number(t.v ?? t.measured ?? 0) > 0);
  if (valid.length === 0) {
    return {
      focalLengths: [],
      mean: null as number | null,
      stdDev: null as number | null,
      sem: null as number | null,
      nominalF: 20.0,
      percentError: null as number | null,
      hasData: false,
    };
  }
  const focalLengths = valid.map((t) => {
    if (typeof t.f_exp === 'number' && Number(t.f_exp) > 5.0) return Number(t.f_exp);
    const u = Number(t.u ?? t.paramA ?? 40);
    const v = Number(t.v ?? t.measured ?? 40);
    return (u * v) / (u + v);
  });
  const stats = calculateTrialStats(focalLengths);
  const nominalF = 20.0;
  const percentError = stats.mean > 0 ? Math.abs((stats.mean - nominalF) / nominalF) * 100 : 0;
  return {
    focalLengths,
    mean: stats.mean,
    stdDev: stats.stdDev,
    sem: stats.sem,
    nominalF,
    percentError,
    hasData: true,
  };
}

export function computeRelativityMetrics(trials: TrialRecord[]) {
  const valid = (trials || []).filter((t) => typeof t.beta !== 'undefined');
  if (valid.length === 0) {
    return {
      gammas: [],
      mean: null as number | null,
      stdDev: null as number | null,
      sem: null as number | null,
      hasData: false,
    };
  }
  const gammas = valid.map((t) => {
    if (typeof t.measuredGamma === 'number' && Number(t.measuredGamma) >= 1.0) return Number(t.measuredGamma);
    if (typeof t.gamma === 'number' && Number(t.gamma) >= 1.0) return Number(t.gamma);
    const b = Number(t.beta ?? 0);
    return 1 / Math.sqrt(Math.max(1e-6, 1 - b * b));
  });
  const stats = calculateTrialStats(gammas);
  return {
    gammas,
    mean: stats.mean,
    stdDev: stats.stdDev,
    sem: stats.sem,
    hasData: true,
  };
}

export function generateRoom3CSV(stationId: Room3StationId, trials: TrialRecord[]): string {
  if (!trials.length) return '';
  const columns = TRIAL_COLUMNS[stationId];
  const header = columns.map((col) => `"${col.label}"`).join(',');
  const rows = trials.map((trial) => {
    return columns.map((col) => {
      const val = trial[col.key];
      return typeof val === 'number' ? val.toFixed(3) : `"${val ?? ''}"`;
    }).join(',');
  });
  return [header, ...rows].join('\n');
}
