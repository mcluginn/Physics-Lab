export type StationId = 'wave' | 'sound' | 'electro';

export type WaveSettings = {
  amplitude: number;
  frequency: number;
  tension: number;
  density: number;
};

export type SoundSettings = {
  frequency: number;
  temperature: number;
  length: number;
  distance: number;
  tubeType: 'open' | 'closed';
};

export type ElectroSettings = {
  q1: number;
  q2: number;
  separation: number;
};

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
  analysis: string; // Scientific Observation & Empirical Trends
  conclusion: string; // Scientific Conclusion & Physical Law Deduction
  recommendations: string; // Practical Recommendations & Apparatus Improvements
  errors: string[];
  guideAnswers?: number[];
};

export type LabProgress = Record<StationId, StationProgress>;

export type StationDefinition = {
  id: StationId;
  number: string;
  shortName: string;
  title: string;
  subtitle: string;
  accent: string;
  objective: string;
  sourceLesson: string;
  steps: Array<{ title: string; prompt: string; target: string }>;
  prediction: {
    question: string;
    options: string[];
    answer: number;
    explanation: string;
  };
  errors: string[];
};

export const STEP_NAMES = ['Explore', 'Predict', 'Set up', 'Run', 'Measure', 'Calculate', 'Analyze', 'Report'];
export const STEP_POINTS = [10, 10, 10, 15, 15, 20, 10, 10];

export const INITIAL_WAVE: WaveSettings = {
  amplitude: 0.32,
  frequency: 2,
  tension: 36,
  density: 0.04,
};

export const INITIAL_SOUND: SoundSettings = {
  frequency: 110,
  temperature: 20,
  length: 0.78,
  distance: 1.5,
  tubeType: 'closed',
};

export const INITIAL_ELECTRO: ElectroSettings = {
  q1: 4,
  q2: -6,
  separation: 0.6,
};

export const STATIONS: Record<StationId, StationDefinition> = {
  wave: {
    id: 'wave',
    number: '01',
    shortName: 'Transverse wave',
    title: 'Transverse Waves — Vibrating String',
    subtitle: 'Amplitude · frequency · tension · harmonics',
    accent: '#22d3ee',
    objective: 'Measure how tension and linear density determine wave speed, wavelength, and standing-wave behavior on a string.',
    sourceLesson: 'Lesson 5 — Transverse Waves',
    steps: [
      { title: 'Inspect the vibrating-string apparatus', prompt: 'Observe the oscillator, string, supports, pulley, and hanging mass.', target: 'The string particles move perpendicular to the wave direction.' },
      { title: 'Predict how the string will respond', prompt: 'Choose the relationship among tension, speed, and wavelength.', target: 'Use the supplied wave-speed model before changing a control.' },
      { title: 'Set the baseline string', prompt: 'Load the reference tension, density, amplitude, and driving frequency.', target: 'T = 36 N, μ = 0.040 kg/m, A = 0.32 m, f = 2.0 Hz.' },
      { title: 'Run the oscillator', prompt: 'Start the driver and watch each bead move transversely.', target: 'A traveling disturbance transfers energy while the string remains in place.' },
      { title: 'Record five string trials', prompt: 'Vary frequency, tension, or density, then log the computed measurements.', target: 'Collect five trials so the trend can be compared.' },
      { title: 'Verify all wave-speed calculations', prompt: 'Use v = √(T/μ), λ = v/f, and Tperiod = 1/f for each frozen trial.', target: 'Verify all five trial values to within 2%.' },
      { title: 'Formulate scientific findings', prompt: 'Provide empirical observations, scientific conclusion, and apparatus recommendations alongside uncertainty sources.', target: 'Complete observations, conclusion, and recommendations.' },
      { title: 'Submit the wave report', prompt: 'Review the data table, analysis, and score, then download the report.', target: 'The report preserves your five trials, conclusions, and recommendations.' },
    ],
    prediction: {
      question: 'At fixed driving frequency, what happens when string tension increases?',
      options: ['Wave speed and wavelength both increase.', 'Wave speed decreases while wavelength stays fixed.', 'Only amplitude increases; speed is unchanged.'],
      answer: 0,
      explanation: 'Because v = √(T/μ), greater tension increases speed. With f fixed, λ = v/f also increases.',
    },
    errors: ['Uncertainty in the hanging mass or tension', 'Non-uniform string linear density', 'Imperfectly fixed end supports', 'Difficulty locating a node or crest'],
  },
  sound: {
    id: 'sound',
    number: '02',
    shortName: 'Sound waves',
    title: 'Sound Waves — Resonance Air Column',
    subtitle: 'Compression · intensity · resonance · harmonics',
    accent: '#a78bfa',
    objective: 'Investigate sound speed, intensity level, and resonance in open and closed air columns.',
    sourceLesson: 'Lesson 6 — Sound Waves',
    steps: [
      { title: 'Inspect the acoustic bench', prompt: 'Find the tuning fork, speaker, resonance tube, microphone, and distance scale.', target: 'Sound is a longitudinal disturbance made of compressions and rarefactions.' },
      { title: 'Predict the resonance pattern', prompt: 'Compare the harmonics supported by open and closed tubes.', target: 'Relate nodes and antinodes to the boundary at each end.' },
      { title: 'Configure the air column', prompt: 'Set a closed tube at the reference length and room temperature.', target: 'L = 0.78 m, air temperature = 20 °C, source near the fundamental.' },
      { title: 'Drive the sound source', prompt: 'Play the tone and observe the animated pressure pattern.', target: 'Resonance grows when the source approaches a natural frequency.' },
      { title: 'Record five acoustic trials', prompt: 'Vary tube type, length, temperature, frequency, or distance.', target: 'Log speed, wavelength, resonance, intensity, and decibel level across five trials.' },
      { title: 'Verify all sound-speed calculations', prompt: 'Use v ≈ 332 + 0.6t for each frozen air-temperature trial.', target: 'Verify all five trial values to within 2%.' },
      { title: 'Formulate acoustic findings', prompt: 'Provide observations on resonance, deduction of sound speed, and recommendations to reduce acoustic errors.', target: 'Complete observations, conclusion, and recommendations.' },
      { title: 'Submit the sound report', prompt: 'Review the acoustic measurements and download the report.', target: 'The report includes tube conditions, sound level, and resonance results.' },
    ],
    prediction: {
      question: 'Which harmonic pattern is correct for ideal air columns?',
      options: ['Open tubes support integer harmonics; closed tubes support odd harmonics.', 'Both tube types support only even harmonics.', 'Closed tubes support every integer harmonic; open tubes support only odd harmonics.'],
      answer: 0,
      explanation: 'An open-open tube has antinodes at both ends. A closed-open tube has a node at the closed end and supports odd harmonics.',
    },
    errors: ['End correction at the tube opening', 'Room-temperature fluctuation', 'Background noise at the microphone', 'Uncertainty locating maximum resonance'],
  },
  electro: {
    id: 'electro',
    number: '03',
    shortName: 'Electrostatics',
    title: 'Electrostatics — Coulomb Force & Field',
    subtitle: 'Charge · inverse square · field · potential',
    accent: '#fb923c',
    objective: 'Measure Coulomb force while mapping electric-field direction, field strength, potential, and potential energy.',
    sourceLesson: 'Lesson 7 — Electrostatics',
    steps: [
      { title: 'Inspect the charge-field apparatus', prompt: 'Identify the two isolated charges, separation rail, force sensor, and field probe.', target: 'Like charges repel; unlike charges attract.' },
      { title: 'Predict the inverse-square change', prompt: 'Choose how force changes when separation is doubled.', target: 'Use the distance term in Coulomb’s law.' },
      { title: 'Set the reference charges', prompt: 'Apply the baseline charges and separation.', target: 'q₁ = +4 μC, q₂ = −6 μC, r = 0.60 m.' },
      { title: 'Energize the field mapper', prompt: 'Run the visualization and inspect the force direction and field lines.', target: 'Field points away from positive charge and toward negative charge.' },
      { title: 'Record five charge trials', prompt: 'Vary either charge or separation and log the result.', target: 'Collect force, midpoint field, potential, and potential energy across five trials.' },
      { title: 'Verify all Coulomb-force calculations', prompt: 'Use F = k|q₁q₂|/r² with charge in coulombs for each frozen trial.', target: 'Verify all five trial values to within 2%.' },
      { title: 'Formulate electrostatic findings', prompt: 'State observations, Coulomb law conclusion, and recommendations to minimize charge leakage and field distortions.', target: 'Complete observations, conclusion, and recommendations.' },
      { title: 'Submit the electrostatics report', prompt: 'Review the charge trials and download the report.', target: 'The report includes force direction, field, potential, and energy.' },
    ],
    prediction: {
      question: 'If both charges stay fixed and their separation doubles, what happens to force magnitude?',
      options: ['It becomes one quarter as large.', 'It becomes one half as large.', 'It doubles because the field covers more space.'],
      answer: 0,
      explanation: 'Coulomb force varies as 1/r², so doubling r divides the force by 2² = 4.',
    },
    errors: ['Charge leakage through humid air', 'Uncertainty in center-to-center separation', 'Nearby conductors distorting the field', 'Force-sensor zero drift'],
  },
};

export function createDefaultProgress(): LabProgress {
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
  return { wave: station(), sound: station(), electro: station() };
}

export function isStationFinished(progress: StationProgress) {
  if (!progress) return false;
  return Boolean(progress.completed?.[7]) || progress.completed.every((comp, index) => comp || Boolean(progress.skipped?.[index]));
}

export function stationScore(progress: StationProgress) {
  return progress.completed.reduce((total, complete, index) => total + (complete ? STEP_POINTS[index] : 0), 0);
}

export function calculateWave(settings: WaveSettings) {
  const speed = Math.sqrt(settings.tension / settings.density);
  const wavelength = speed / settings.frequency;
  return {
    speed,
    wavelength,
    period: 1 / settings.frequency,
    angularFrequency: 2 * Math.PI * settings.frequency,
    waveNumber: (2 * Math.PI) / wavelength,
  };
}

export function calculateSound(settings: SoundSettings) {
  const sourcePower = 0.01;
  const speed = 332 + 0.6 * settings.temperature;
  const wavelength = speed / settings.frequency;
  const fundamental = settings.tubeType === 'open' ? speed / (2 * settings.length) : speed / (4 * settings.length);
  const ratio = settings.frequency / fundamental;
  const harmonic = settings.tubeType === 'open'
    ? Math.max(1, Math.round(ratio))
    : Math.max(1, 2 * Math.round((ratio - 1) / 2) + 1);
  const resonanceFrequency = harmonic * fundamental;
  const intensity = sourcePower / (4 * Math.PI * settings.distance * settings.distance);
  const decibels = 10 * Math.log10(intensity / 1e-12);
  return { speed, wavelength, fundamental, harmonic, resonanceFrequency, detuning: Math.abs(settings.frequency - resonanceFrequency), intensity, decibels, sourcePower };
}

export function calculateElectro(settings: ElectroSettings) {
  const k = 8.99e9;
  const q1 = settings.q1 * 1e-6;
  const q2 = settings.q2 * 1e-6;
  const distanceToMidpoint = settings.separation / 2;
  const forceSigned = (k * q1 * q2) / (settings.separation * settings.separation);
  const fieldMidpoint = (k * (q1 - q2)) / (distanceToMidpoint * distanceToMidpoint);
  const potentialMidpoint = (k * (q1 + q2)) / distanceToMidpoint;
  const potentialEnergy = (k * q1 * q2) / settings.separation;
  return {
    force: Math.abs(forceSigned),
    relationship: forceSigned < 0 ? 'Attraction' : forceSigned > 0 ? 'Repulsion' : 'No force',
    fieldMidpoint,
    potentialMidpoint,
    potentialEnergy,
  };
}

export type GuideQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export const STATION_GUIDE_QUESTIONS: Record<StationId, GuideQuestion[]> = {
  wave: [
    {
      id: 'w-q1',
      question: 'If the string tension T is quadrupled (multiplied by 4) while linear density μ is unchanged, how does wave speed change?',
      options: [
        'Wave speed doubles (2×) because v = √(T/μ)',
        'Wave speed quadruples (4×) in direct proportion to tension',
        'Wave speed is halved (0.5×)',
        'Wave speed remains unchanged; only amplitude increases',
      ],
      correctIndex: 0,
      explanation: 'Because v = √(T/μ), multiplying tension by 4 yields √(4) = 2 times the original speed.',
    },
    {
      id: 'w-q2',
      question: 'Why does changing the oscillator driving frequency f NOT alter the wave speed v on the string?',
      options: [
        'Wave speed is determined strictly by medium properties (tension T and density μ), so wavelength adjusts as λ = v/f',
        'Frequency only affects sound waves, not transverse waves',
        'Wave speed increases linearly with frequency',
        'The oscillator absorbs excess kinetic energy',
      ],
      correctIndex: 0,
      explanation: 'Wave speed is an intrinsic medium property (v = √(T/μ)). When frequency f is varied, the wavelength λ proportionally contracts or expands according to λ = v/f.',
    },
    {
      id: 'w-q3',
      question: 'In the linear regression of v² versus T, what physical property does the reciprocal of the slope (1/slope) represent?',
      options: [
        'String linear mass density μ (kg/m)',
        'Oscillator driving frequency f (Hz)',
        'Gravitational acceleration g (m/s²)',
        'Total mass of the string M (kg)',
      ],
      correctIndex: 0,
      explanation: 'From v² = (1/μ)·T, a plot of v² (y-axis) vs T (x-axis) has slope m = 1/μ. Thus μ_exp = 1/m.',
    },
  ],
  sound: [
    {
      id: 's-q1',
      question: 'How does an increase in ambient air temperature t affect the speed of sound and resonance frequencies in an air tube?',
      options: [
        'Sound speed increases (v ≈ 331.3 + 0.606t), causing resonant frequencies to shift upward',
        'Sound speed decreases because warm air is less dense',
        'Sound speed remains constant, but wavelength doubles',
        'Resonance ceases to occur at elevated temperatures',
      ],
      correctIndex: 0,
      explanation: 'Thermodynamic sound speed in air increases with temperature (v ∝ √T_K). Since f_r = n·v/(4L), higher speed shifts resonance peaks to higher frequencies.',
    },
    {
      id: 's-q2',
      question: 'Why does a closed-open resonance tube support only odd harmonic modes (n = 1, 3, 5...)?',
      options: [
        'The closed end forces a displacement node while the open end forces an antinode, requiring L = (2n-1)λ/4',
        'Even harmonics are absorbed by the glass tube walls',
        'Air molecules cannot oscillate in even numbered intervals',
        'Closed tubes actually support all integer harmonics',
      ],
      correctIndex: 0,
      explanation: 'Boundary conditions dictate a displacement node at the rigid closed boundary and an antinode at the open boundary, supporting only quarter-wavelength odd multiples: L = (2n-1)λ/4.',
    },
    {
      id: 's-q3',
      question: 'What is the physical cause of the acoustic end-correction factor (ΔL ≈ 0.61·r) at the tube opening?',
      options: [
        'Acoustic pressure antinodes extend slightly beyond the physical rim before fully expanding into 3D free space',
        'Viscous friction along the inner tube wall slows the air column',
        'Sound waves reflect backwards before reaching the opening',
        'Thermal conduction through the lip of the tube',
      ],
      correctIndex: 0,
      explanation: 'Air just outside the open tube mouth moves together with the oscillating air inside, shifting the effective acoustic boundary outward by approximately 0.61 times the tube radius.',
    },
  ],
  electro: [
    {
      id: 'e-q1',
      question: 'If the center-to-center separation distance r between two point charges is tripled (3×), what is the resulting Coulomb force?',
      options: [
        'Force decreases to 1/9 of its initial value (inverse-square law)',
        'Force decreases to 1/3 of its initial value',
        'Force increases by a factor of 9',
        'Force becomes zero beyond 1 meter',
      ],
      correctIndex: 0,
      explanation: 'Coulomb’s law states F ∝ 1/r². Tripling r divides the force by 3² = 9 (F_new = F_initial / 9).',
    },
    {
      id: 'e-q2',
      question: 'At the exact midpoint between two equal and opposite charges (+q and -q), what is the net electric field vector?',
      options: [
        'Non-zero and directed toward the negative charge -q (both field contributions point in the same direction)',
        'Zero, because equal magnitude charges always cancel at the center',
        'Directed perpendicular to the separation axis',
        'Infinite due to electrostatic singularity',
      ],
      correctIndex: 0,
      explanation: 'The electric field from +q points away from +q (toward -q). The field from -q points toward -q. Thus both field vectors point toward -q and add constructively: E_net = 2·k·q/(r/2)².',
    },
    {
      id: 'e-q3',
      question: 'What is the primary physical cause of charge leakage and experimental error in electrostatic bench measurements?',
      options: [
        'Ambient humidity forming microscopic conductive water films on insulating stands and air ionization',
        'Gravitational pull on free electrons',
        'Thermal radiation from lab fluorescent lighting',
        'Magnetic induction from the Earth’s geomagnetic field',
      ],
      correctIndex: 0,
      explanation: 'Water vapor in humid air condenses on insulating surfaces and adsorbs ions, providing high-resistance conduction pathways that dissipate electrostatic charge over time.',
    },
  ],
};

export function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getSeededParameters(studentId: string, stationId: StationId) {
  const seed = hashString((studentId || 'STUDENT').trim().toUpperCase());
  const rng = (offset: number) => {
    const val = Math.sin(seed + offset) * 10000;
    return val - Math.floor(val);
  };
  if (stationId === 'wave') {
    const density = Number((0.035 + rng(1) * 0.010).toFixed(4));
    const tension = Math.round(32 + rng(2) * 8);
    return { density, tension };
  }
  if (stationId === 'sound') {
    const temperature = Math.round(18 + rng(3) * 8);
    const length = Number((0.74 + rng(4) * 0.08).toFixed(2));
    return { temperature, length };
  }
  const q1 = Math.round(3 + rng(5) * 3);
  const q2 = -Math.round(5 + rng(6) * 3);
  const separation = Number((0.55 + rng(7) * 0.10).toFixed(2));
  return { q1, q2, separation };
}

export function calculateTrialStats(values: number[]) {
  if (!values || values.length === 0) return { mean: 0, stdDev: 0, sem: 0, min: 0, max: 0 };
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = n > 1 ? values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const sem = stdDev / Math.sqrt(n);
  return {
    mean,
    stdDev,
    sem,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function generateTrialsCSV(stationId: StationId, trials: TrialRecord[], studentName: string, studentId: string): string {
  if (!trials || !trials.length) return '';
  const headers = Object.keys(trials[0]);
  const lines = [
    `# Physics University Virtual Laboratory - Station ${stationId.toUpperCase()} Experimental Dataset`,
    `# Student: ${studentName || 'Student'} | Student ID: ${studentId || 'N/A'} | Generated: ${new Date().toISOString()}`,
    headers.join(','),
    ...trials.map((t) => headers.map((h) => JSON.stringify(t[h] ?? '')).join(',')),
  ];
  return lines.join('\r\n');
}

