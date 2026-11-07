'use client';

export type Room3StationId = 'circuits' | 'optics' | 'relativity';

// -------------------------------------------------------------
// 1. Station Settings Types
// -------------------------------------------------------------
export type CircuitSettings = {
  mode: 'dc' | 'ac';
  topology: 'series' | 'parallel' | 'combo';
  vs: number; // Volts (1.0 - 240.0 V)
  freq: number; // Hz (10 - 1000 Hz, active in AC)
  r1: number; // Ohms (1.0 - 1000.0)
  r2: number; // Ohms (1.0 - 1000.0)
  r3: number; // Ohms (1.0 - 1000.0)
  inductance: number; // mH (1.0 - 500.0 mH)
  capacitance: number; // uF (1.0 - 500.0 uF)
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
};

export type RelativitySettings = {
  beta: number; // v/c (0.000 to 0.999)
  properTime: number; // s (1.00 to 100.0 s)
  properLength: number; // m (1.00 to 100.0 m)
  massPreset: 'electron' | 'proton' | 'muon' | 'probe';
  restMass: number; // kg
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
  probe: { name: 'Macroscopic 1.00 kg Probe', massKg: 1.00, restEnergyMeV: (1.00 * C_LIGHT * C_LIGHT) / MEV_TO_JOULE },
};

export const INITIAL_CIRCUITS: CircuitSettings = {
  mode: 'dc',
  topology: 'series',
  vs: 24.0,
  freq: 60.0,
  r1: 100.0,
  r2: 220.0,
  r3: 330.0,
  inductance: 150.0, // 150 mH
  capacitance: 47.0, // 47 uF
};

export const INITIAL_OPTICS: OpticsSettings = {
  subMode: 'refraction',
  wavelength: 532, // 532 nm Emerald Green
  n1: 1.00, // Air
  n2: 1.52, // Crown Glass
  theta1: 30.0, // 30 degrees
  focalLength: 20.0, // +20 cm Converging Lens
  objectDistance: 40.0, // 40 cm
  slitWidth: 0.08, // 0.08 mm
  slitSeparation: 0.25, // 0.25 mm
  screenDistance: 2.00, // 2.00 m
};

export const INITIAL_RELATIVITY: RelativitySettings = {
  beta: 0.600, // 0.60c (gamma = 1.25)
  properTime: 10.0, // 10.0 s
  properLength: 20.0, // 20.0 m
  massPreset: 'probe',
  restMass: 1.00,
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

  if (topology === 'series') {
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
  const current = vs / Math.max(0.01, impedance);

  // Branch Voltages & Currents
  if (topology === 'series') {
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

  const theta1Rad = (theta1 * Math.PI) / 180;
  const reflectAngleDeg = theta1;

  // 1. Refraction & TIR
  let criticalAngleDeg: number | null = null;
  let isTIR = false;
  let theta2Deg: number | null = null;
  let theta2Rad: number | null = null;

  if (n1 > n2) {
    const sinCrit = n2 / n1;
    criticalAngleDeg = Math.asin(sinCrit) * (180 / Math.PI);
    if (theta1 > criticalAngleDeg) {
      isTIR = true;
    }
  }

  if (!isTIR) {
    const sinTheta2 = (n1 / n2) * Math.sin(theta1Rad);
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
  if (Math.abs(denom) < 0.01) {
    imageType = 'At Infinity';
    imageOrientation = 'None';
    imageScale = 'Infinite';
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
  dilatedTime: number; // s
  timeDilationRatio: number;
  contractedLength: number; // m
  lengthContractionPercent: number; // %
  speedMps: number; // m/s
  restEnergyJ: number; // J
  restEnergyMeV: number; // MeV
  totalEnergyJ: number; // J
  totalEnergyMeV: number; // MeV
  kineticEnergyJ: number; // J
  kineticEnergyMeV: number; // MeV
  momentumKgm_s: number; // kg m/s
  momentumMeV_c: number; // MeV/c
};

export function calculateRelativity(settings: RelativitySettings): RelativityResult {
  const { beta, properTime, properLength, massPreset } = settings;
  const safeBeta = Math.min(0.9995, Math.max(0, beta));
  const betaSq = safeBeta * safeBeta;
  const gamma = 1 / Math.sqrt(Math.max(1e-6, 1 - betaSq));

  const speedMps = safeBeta * C_LIGHT;
  const dilatedTime = gamma * properTime;
  const contractedLength = properLength / gamma;
  const lengthContractionPercent = (1 - 1 / gamma) * 100;

  const presetInfo = MASS_PRESETS[massPreset] || MASS_PRESETS.probe;
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
    timeDilationRatio: gamma,
    contractedLength,
    lengthContractionPercent,
    speedMps,
    restEnergyJ,
    restEnergyMeV,
    totalEnergyJ,
    totalEnergyMeV,
    kineticEnergyJ,
    kineticEnergyMeV,
    momentumKgm_s,
    momentumMeV_c,
  };
}

// -------------------------------------------------------------
// 4. Lab Progress, Trials & Scoring Definitions
// -------------------------------------------------------------
export type TrialRecord = Record<string, number | string>;

export const TOTAL_TRIALS = 5;

export type StationProgress = {
  currentStep: number;
  completed: boolean[];
  skipped: boolean[];
  trials: TrialRecord[];
  inspected: string[];
  setupActions: string[];
  calculations: string[];
  analysis: string;
  conclusion: string;
  recommendations: string;
  errors: string[];
  guideAnswers?: number[];
};

export type Room3Progress = Record<Room3StationId, StationProgress>;

export const STEP_NAMES = ['Explore', 'Predict', 'Set up', 'Run', 'Measure', 'Calculate', 'Analyze', 'Report'];
export const STEP_POINTS = [10, 10, 10, 15, 15, 20, 10, 10]; // Sum = 100 pts per station

export function createDefaultRoom3Progress(): Room3Progress {
  const station = (): StationProgress => ({
    currentStep: 0,
    completed: Array(8).fill(false),
    skipped: Array(8).fill(false),
    trials: [],
    inspected: [],
    setupActions: [],
    calculations: ['', '', '', '', ''],
    analysis: '',
    conclusion: '',
    recommendations: '',
    errors: [],
    guideAnswers: [-1, -1, -1],
  });
  return { circuits: station(), optics: station(), relativity: station() };
}

export function isStationFinished(progress: StationProgress) {
  if (!progress) return false;
  return Boolean(progress.completed?.[7]) || progress.completed.every((comp, index) => comp || Boolean(progress.skipped?.[index]));
}

export function stationScore(progress: StationProgress) {
  return progress.completed.reduce((total, complete, index) => total + (complete ? STEP_POINTS[index] : 0), 0);
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
    title: 'DC & AC Electrical Circuits — Voltage, Current & Impedance',
    subtitle: 'Voltage · Current · Resistance · AC/DC Power',
    accent: '#38bdf8',
    objective: 'Analyze direct current (DC) and alternating current (AC) electrical circuits to determine voltage, current, resistance, and power using fundamental laws of electricity.',
    sourceLesson: 'Lesson 8 — DC & AC Electrical Systems',
    placardSrc: '/assets/placards/apparatus_electricity.png',
    placardAlt: 'Cinematic laboratory test bench for DC and AC electrical circuits with oscilloscope and power supply',
    steps: [
      { title: 'Inspect the electronic test bench', prompt: 'Locate the DC power supply, AC function generator, resistor network board, digital multimeter, and oscilloscope.', target: 'Identify instruments for measuring voltage in parallel and current in series.' },
      { title: 'Predict AC series RLC resonance', prompt: 'Select the condition that yields minimum impedance and unity power factor.', target: 'Apply phasor impedance relationships to predict resonance behavior.' },
      { title: 'Calibrate circuit baseline parameters', prompt: 'Initialize reference values: Vs = 24.0 V, R1 = 100 Ω, R2 = 220 Ω, R3 = 330 Ω, L = 150 mH, C = 47 μF.', target: 'Verify instrument zero offsets and power supply output baseline.' },
      { title: 'Energize circuit and observe waveforms', prompt: 'Toggle power switch, switch between DC and AC modes, and observe oscilloscope phase shift between V(t) and I(t).', target: 'Observe how inductance creates current lag and capacitance creates current lead.' },
      { title: 'Record five multi-condition trials', prompt: 'Vary source voltage, topology, or driving frequency to log five complete experimental datasets.', target: 'Capture total current, branch currents, equivalent impedance, and real power.' },
      { title: 'Verify theoretical circuit calculations', prompt: 'Calculate theoretical impedance Z = √(Req² + (XL - XC)²) and current I = V/Z for all five recorded trials.', target: 'Ensure all five trial calculations agree with theory within ±2% relative error.' },
      { title: 'Synthesize electrical & power findings', prompt: 'Formulate observations on Ohm\'s law, Kirchhoff rules, reactive power dynamics, and identify experimental errors.', target: 'Provide thorough empirical analysis, scientific conclusions, and apparatus improvements.' },
      { title: 'Submit certified electrical report', prompt: 'Review multi-trial data table, power factor metrics, and export certified PDF and CSV lab reports.', target: 'Complete certification and earn final station score.' },
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
    title: 'Geometric & Physical Optics — Refraction, Lenses & Diffraction',
    subtitle: 'Reflection · Refraction · Lenses & Mirrors · Diffraction',
    accent: '#10b981',
    objective: 'Apply the principles of geometric and physical optics to analyze light behavior involving reflection, refraction, lenses, mirrors, and diffraction patterns.',
    sourceLesson: 'Lesson 9 — Geometric & Physical Optics',
    placardSrc: '/assets/placards/apparatus_optics.png',
    placardAlt: 'Cinematic precision optical bench with diode laser, refraction prism, lenses, and interference fringes',
    steps: [
      { title: 'Inspect the optical rail & components', prompt: 'Examine the 2-meter optical track, tunable laser source, semicircular prism tank, lens mounts, slit apertures, and observation screen.', target: 'Familiarize yourself with optical rail alignment and vernier cursors.' },
      { title: 'Predict Total Internal Reflection (TIR)', prompt: 'Determine the condition required for 100% optical reflection at a dielectric boundary.', target: 'Relate Snell\'s law indices n1 and n2 to the critical angle θc.' },
      { title: 'Calibrate laser and optical zero axis', prompt: 'Set baseline: λ = 532 nm (emerald), n1 = 1.00 (air), n2 = 1.52 (crown glass), θ1 = 30.0°, f = +20 cm, do = 40 cm.', target: 'Align the central optical axis and verify zero angular deflection.' },
      { title: 'Project light beam & switch sub-modes', prompt: 'Switch between Refraction & TIR, Lenses & Mirrors, and Double-Slit Diffraction to observe live rays and interference patterns.', target: 'Observe wave bending, focal convergence, and sinusoidal intensity fringes.' },
      { title: 'Record five multi-optical trials', prompt: 'Vary incident angle θ1, object distance do, or slit separation d to log five distinct optical conditions.', target: 'Capture refracted angles, image positions/magnifications, or fringe spacings.' },
      { title: 'Verify optical law calculations', prompt: 'Calculate theoretical refracted angles θ2 = arcsin(n1/n2 sin θ1), image distances di = (1/f - 1/do)⁻¹, or fringe spacing Δy = λL/d.', target: 'Verify all five trial values within ±2% tolerance.' },
      { title: 'Synthesize optical & wave findings', prompt: 'Document Snell\'s law validation, thin-lens image classifications (real/virtual, upright/inverted), diffraction spread, and apparatus tolerances.', target: 'Formulate observations, physical conclusions, and practical lab recommendations.' },
      { title: 'Submit certified optics report', prompt: 'Review experimental data, ray diagrams, and interference profile, then download certified PDF and CSV reports.', target: 'Finalize station certification and unlock full optics score.' },
    ],
    prediction: {
      question: 'When light travels from an optically denser medium to a less dense medium (n₁ > n₂) at an incident angle exceeding the critical angle (θ₁ > θ_c), what optical phenomenon occurs?',
      options: [
        'Total Internal Reflection (TIR), where 100% of the light reflects back into medium 1 with zero refraction.',
        'Complete absorption of the light wave within the boundary interface.',
        'The refracted beam travels along the normal at exactly 0°.',
      ],
      answer: 0,
      explanation: 'When n₁ > n₂ and θ₁ > θ_c = arcsin(n₂/n₁), Snell\'s law predicts sin(θ₂) > 1, which has no real solution. Consequently, no light penetrates medium 2 and total internal reflection occurs, perfectly conserving optical energy.',
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
    title: 'Special Relativity — Lorentz Transformation & Mass-Energy',
    subtitle: 'Time Dilation · Length Contraction · Mass-Energy Equivalence',
    accent: '#a855f7',
    objective: 'Apply the postulates of special relativity to calculate relativistic effects, including time dilation, length contraction, and mass-energy equivalence.',
    sourceLesson: 'Lesson 10 — Special Theory of Relativity',
    placardSrc: '/assets/placards/apparatus_relativity.png',
    placardAlt: 'Cinematic relativistic photon light-clock apparatus and linear accelerator beam pipe',
    steps: [
      { title: 'Inspect the dual-frame observation deck', prompt: 'Compare Stationary Frame S (lab clock, calorimeter) with Moving Frame S\' (relativistic spacecraft, photon light clock, contracting meter rod).', target: 'Observe how inertial reference frames compare according to Einstein\'s postulates.' },
      { title: 'Predict relativistic clock rates', prompt: 'Choose how moving clock ticks compare to stationary laboratory clocks as velocity approaches c.', target: 'Apply the invariance of the speed of light to the geometric photon clock.' },
      { title: 'Calibrate relativistic baseline state', prompt: 'Initialize baseline: β = 0.600c (where γ = 1.250), proper time Δt₀ = 10.0 s, proper length L₀ = 20.0 m, rest mass m₀ = 1.00 kg.', target: 'Verify resting time synchronization and proper length calibration.' },
      { title: 'Accelerate frame and trigger photon clock', prompt: 'Increase velocity ratio β toward 0.999c, watching the animated photon bounce along its hypotenuse path and the meter rod contract.', target: 'Visually witness physical length contraction strictly along the axis of motion.' },
      { title: 'Record five relativistic trials', prompt: 'Vary velocity ratio β (e.g. 0.00c, 0.60c, 0.80c, 0.866c, 0.99c) or particle rest masses to record five complete datasets.', target: 'Record Lorentz factor γ, dilated time Δt, contracted length L, and relativistic kinetic energy K.' },
      { title: 'Verify theoretical Lorentz calculations', prompt: 'Calculate Lorentz factor γ = 1/√(1 - β²), dilated time Δt = γ Δt₀, and total relativistic energy E = γ m₀ c² for all five trials.', target: 'Verify calculations within ±2% relative tolerance.' },
      { title: 'Synthesize relativistic findings & muon test', prompt: 'Analyze how high-velocity cosmic-ray muons reach sea level (lifetime dilation), discuss mass-energy equivalence, and document cosmic implications.', target: 'Complete observations, theoretical deduction, and experimental notes.' },
      { title: 'Submit certified relativity report', prompt: 'Review Lorentz transformation data, energy-momentum metrics, and download certified laboratory PDF and CSV files.', target: 'Certify all 3 stations and celebrate 300/300 points mastery.' },
    ],
    prediction: {
      question: 'As a spacecraft approaches relativistic speeds near the speed of light (v -> c), what occurs to elapsed time inside the ship as measured by a stationary Earth observer?',
      options: [
        'Time dilates (expands); clocks on the moving spacecraft appear to tick much slower according to Δt = γ Δt₀.',
        'Time contracts; clocks on the moving spacecraft appear to tick faster than Earth clocks.',
        'Time stays strictly identical because light speed varies with source velocity.',
      ],
      answer: 0,
      explanation: 'Because the speed of light c is invariant in all inertial reference frames, the diagonal path of light in a moving photon clock requires more time in the stationary frame: Δt = γ Δt₀, where γ = 1/√(1 - v²/c²) ≥ 1.',
    },
    errors: [
      'Non-inertial acceleration phases required to attain relativistic velocity',
      'Gravitational time dilation gradient (General Relativistic correction)',
      'Signal propagation latency when synchronizing remote atomic clocks',
      'Quantum uncertainty in simultaneous position-momentum measurements',
      'Cosmic microwave background drag on ultra-relativistic particles (GZK limit)',
    ],
  },
};

// -------------------------------------------------------------
// 6. Trial Columns for Table View
// -------------------------------------------------------------
export const TRIAL_COLUMNS: Record<Room3StationId, Array<{ key: string; label: string }>> = {
  circuits: [
    { key: 'trial', label: '#' },
    { key: 'mode', label: 'Mode' },
    { key: 'topology', label: 'Topology' },
    { key: 'vs', label: 'Vs (V)' },
    { key: 'freq', label: 'f (Hz)' },
    { key: 'impedance', label: 'Z (Ω)' },
    { key: 'current', label: 'I (A)' },
    { key: 'powerFactor', label: 'cos φ' },
    { key: 'realPower', label: 'P (W)' },
  ],
  optics: [
    { key: 'trial', label: '#' },
    { key: 'subMode', label: 'Sub-Mode' },
    { key: 'wavelength', label: 'λ (nm)' },
    { key: 'paramA', label: 'Input 1' },
    { key: 'paramB', label: 'Input 2' },
    { key: 'theoretical', label: 'Theory' },
    { key: 'measured', label: 'Measured' },
    { key: 'percentError', label: '% error' },
    { key: 'classification', label: 'Result Tag' },
  ],
  relativity: [
    { key: 'trial', label: '#' },
    { key: 'beta', label: 'β (v/c)' },
    { key: 'speed', label: 'Speed (m/s)' },
    { key: 'gamma', label: 'γ (Lorentz)' },
    { key: 'dilatedTime', label: 'Δt (s)' },
    { key: 'contractedLength', label: 'L (m)' },
    { key: 'kineticEnergy', label: 'K (MeV)' },
    { key: 'totalEnergy', label: 'E_total (MeV)' },
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
        'Z = 141.4 Ω and φ = +45.0° (inductive, current lags voltage)',
        'Z = 100.0 Ω and φ = 0.0° (purely resistive resonance)',
        'Z = 500.0 Ω and φ = -45.0° (capacitive, current leads voltage)',
        'Z = 200.0 Ω and φ = +90.0° (purely inductive)',
      ],
      correctIndex: 0,
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
        'It maximizes the proportion of real power delivered while minimizing reactive current losses in transmission lines.',
        'It eliminates the need for alternating current by converting AC directly to DC.',
        'It reduces the operating frequency from 60 Hz to 0 Hz.',
        'It prevents circuit breakers from ever tripping under short-circuit faults.',
      ],
      correctIndex: 0,
      explanation: 'Real power P = Vrms * Irms * cos φ performs useful work. If cos φ is low, much higher Irms must flow to deliver the same real power, causing large resistive I²R transmission heating losses in conductors and transformers.',
    },
  ],
  optics: [
    {
      id: 'o-q1',
      question: 'A beam of emerald laser light (λ = 532 nm) in air (n₁ = 1.00) strikes crown glass (n₂ = 1.52) at an angle of incidence θ₁ = 45.0°. What is the angle of refraction θ₂?',
      options: [
        'θ₂ = 27.7° (bends toward the normal)',
        'θ₂ = 45.0° (passes straight through with no deflection)',
        'θ₂ = 68.3° (bends away from the normal)',
        'Total internal reflection occurs with no refracted beam',
      ],
      correctIndex: 0,
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
        'The fringe spacing doubles (2×) according to Δy = λL / d',
        'The fringe spacing is halved (0.5×)',
        'The fringes disappear into a uniform blur',
        'Only the central fringe changes; others stay at fixed positions',
      ],
      correctIndex: 0,
      explanation: 'Fringe spacing Δy = (λ L) / d is inversely proportional to slit separation d. Halving d in the denominator doubles the angular separation of interference maxima, spreading the interference pattern twice as wide.',
    },
  ],
  relativity: [
    {
      id: 'r-q1',
      question: 'If a relativistic spaceship travels at speed v = 0.80c relative to Earth, what are the Lorentz factor γ and the length L of a meter rod (L₀ = 1.00 m) oriented along the flight path?',
      options: [
        'γ = 1.667 and L = 0.60 m (contracted by 40%)',
        'γ = 1.250 and L = 0.80 m (contracted by 20%)',
        'γ = 2.000 and L = 0.50 m (contracted by 50%)',
        'γ = 1.000 and L = 1.00 m (no contraction)',
      ],
      correctIndex: 0,
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
        'E = γ m₀ c² = m₀ c² + K, where kinetic energy is K = (γ - 1) m₀ c²',
        'E = 1/2 m₀ v² regardless of speed',
        'E = m₀ c² and kinetic energy is purely imaginary',
        'K = γ m₀ v and rest energy is zero',
      ],
      correctIndex: 0,
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
