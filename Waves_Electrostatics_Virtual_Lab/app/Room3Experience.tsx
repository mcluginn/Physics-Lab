'use client';

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import {
  INITIAL_CIRCUITS,
  INITIAL_OPTICS,
  INITIAL_RELATIVITY,
  MASS_PRESETS,
  ROOM3_ASSIGNED_TRIALS,
  ROOM3_GUIDE_QUESTIONS,
  ROOM3_STATIONS,
  STEP_NAMES,
  STEP_POINTS,
  TOTAL_TRIALS,
  calculateCircuit,
  calculateOptics,
  calculateRelativity,
  calculateTrialStats,
  computeCircuitOhmMetrics,
  computeOpticsLensMetrics,
  computeRelativityMetrics,
  createDefaultRoom3Progress,
  generateRoom3CSV,
  isStationFinished,
  stationScore,
  type CircuitSettings,
  type OpticsSettings,
  type RelativitySettings,
  type Room3Progress,
  type Room3StationId,
  type TrialRecord,
} from './room3Model';
import { Room3Graph, computeRoom3Regression } from './Room3Graph';
import { Room3Schematic2D } from './Room3Schematic2D';
import { Room3CircuitWorkspace } from './Room3CircuitWorkspace';
import {
  createRoom3Scene,
  type EquipmentInteraction,
  type Room3SceneApi,
} from './room3Scene';
import { createLaboratoryPdf } from './pdfReport';
import { type CharacterType } from './characterController';
import {
  type MultimeterMode,
  type MultimeterJack,
  type TerminalId,
  type MultimeterReading,
} from './circuitSolver';
import {
  type ExperienceMode,
  type GuidedExperimentState,
  type StepValidationResult,
  STATION_CURRICULUM,
} from './room3GuidedCurriculum';
import {
  type GraphicsSettings,
  loadGraphicsSettings,
  saveGraphicsSettings,
} from './graphicsSettings';
import { Room3GraphicsModal } from './Room3GraphicsModal';

const STORAGE_KEY = 'physics_lab_room_3_progress';

const INSPECTION_TARGETS: Record<Room3StationId, string[]> = {
  circuits: ['circuits-power-switch', 'circuits-multimeter', 'circuits-oscilloscope', 'circuits-topology-selector'],
  optics: ['optics-laser', 'optics-angle-dial', 'optics-screen', 'optics-rail'],
  relativity: ['relativity-velocity-dial', 'relativity-light-clock', 'relativity-contracting-rod', 'relativity-accelerator'],
};

const INSPECTION_LABELS: Record<string, string> = {
  'circuits-power-switch': 'DC Power Supply',
  'circuits-multimeter': 'Fluke 87V Digital Multimeter',
  'circuits-oscilloscope': 'Tektronix Oscilloscope',
  'circuits-topology-selector': 'Breadboard Terminal Matrix',
  'optics-laser': 'Tunable Laser Source',
  'optics-angle-dial': 'Goniometer Precision Dial',
  'optics-screen': 'Observation & Detector Screen',
  'optics-rail': 'Precision Optical Rail Bench',
  'relativity-velocity-dial': 'Relativistic Velocity Dial',
  'relativity-light-clock': 'Atomic Transverse Light Clock',
  'relativity-contracting-rod': 'Lorentz Contracting Meter-Rod',
  'relativity-accelerator': 'Maglev Particle Accelerator',
};

const GUIDANCE_LABELS: Record<string, string> = {
  'circuits-placard': 'circuits reference board',
  'circuits-power-switch': 'power supply switch',
  'circuits-voltage-knob': 'voltage regulator dial',
  'circuits-multimeter': 'Fluke digital multimeter',
  'circuits-dmm-dial': 'Fluke multimeter rotary dial',
  'circuits-dmm-jack': 'multimeter input terminals',
  'circuits-oscilloscope': 'Tektronix oscilloscope',
  'circuits-topology-selector': 'breadboard resistor network',
  'circuits-probe-r1': 'resistor R1 probe point',
  'circuits-probe-r2': 'resistor R2 probe point',
  'circuits-probe-r3': 'resistor R3 probe point',
  'circuits-series-jumper': 'series ammeter jumper break',
  'circuits-clipboard': 'laboratory notebook & data log',
  'optics-placard': 'optics reference board',
  'optics-laser': 'tunable laser source',
  'optics-angle-dial': 'goniometer prism dial',
  'optics-screen': 'observation screen',
  'optics-rail': 'optical rail bench',
  'optics-lens-carrier': 'converging lens mount',
  'optics-clipboard': 'laboratory notebook & data log',
  'relativity-placard': 'relativity reference board',
  'relativity-velocity-dial': 'relativistic velocity dial',
  'relativity-contracting-rod': 'contracting meter-rod',
  'relativity-light-clock': 'atomic light-clock',
  'relativity-accelerator': 'maglev particle accelerator',
  'relativity-clipboard': 'laboratory notebook & data log',
  'campus-door': 'corridor exit doors',
};

const INSPECTION_TARGET: Record<Room3StationId, string> = {
  circuits: 'circuits-power-switch',
  optics: 'optics-laser',
  relativity: 'relativity-velocity-dial',
};

const RUN_TARGET: Record<Room3StationId, string> = {
  circuits: 'circuits-power-switch',
  optics: 'optics-laser',
  relativity: 'relativity-velocity-dial',
};

function formatValue(value: number | string | undefined | null) {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  if (Number.isInteger(value) && Math.abs(value) < 10000) return String(value);
  if (Math.abs(value) >= 10000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) return value.toExponential(2);
  return value.toFixed(2);
}

function RangeControl({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
  digits = 1,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  digits?: number;
}) {
  return (
    <label className="control-row">
      <span>
        <b>{label}</b>
        <output>
          {value.toFixed(digits)} {unit}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function safeProgress(input: unknown): Room3Progress {
  const fallback = createDefaultRoom3Progress();
  if (!input || typeof input !== 'object') return fallback;
  const candidate = input as Partial<Room3Progress>;
  (Object.keys(fallback) as Room3StationId[]).forEach((id) => {
    const saved = candidate[id];
    if (!saved) return;
    fallback[id] = {
      currentStep: Math.max(0, Math.min(7, Number(saved.currentStep) || 0)),
      completed: Array.from({ length: 8 }, (_, index) => Boolean(saved.completed?.[index])),
      skipped: Array.from({ length: 8 }, (_, index) => Boolean(saved.skipped?.[index])),
      trials: Array.isArray(saved.trials) ? saved.trials.slice(0, TOTAL_TRIALS) : [],
      inspected: Array.isArray(saved.inspected) ? saved.inspected.filter((entry): entry is string => typeof entry === 'string') : [],
      setupActions: Array.isArray(saved.setupActions) ? saved.setupActions.filter((entry): entry is string => typeof entry === 'string') : [],
      calculations: Array.from({ length: TOTAL_TRIALS }, (_, index) => (typeof saved.calculations?.[index] === 'string' ? saved.calculations[index] : '')),
      analysis: typeof saved.analysis === 'string' ? saved.analysis : '',
      conclusion: typeof saved.conclusion === 'string' ? saved.conclusion : '',
      recommendations: typeof saved.recommendations === 'string' ? saved.recommendations : '',
      errors: Array.isArray(saved.errors) ? saved.errors.filter((entry): entry is string => typeof entry === 'string') : [],
      guideAnswers: Array.isArray(saved.guideAnswers) ? saved.guideAnswers.slice(0, 3).map((v) => Number(v)) : [-1, -1, -1],
      predictionAnswer: typeof saved.predictionAnswer === 'number' ? saved.predictionAnswer : null,
    };
  });
  return fallback;
}

export default function Room3Experience() {
  const sceneContainer = useRef<HTMLDivElement>(null);
  const sceneApi = useRef<Room3SceneApi | null>(null);
  const equipmentActionRef = useRef<(id: string) => void>(() => undefined);
  const audioContext = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(true);
  const joystickPointerId = useRef<number | null>(null);

  // Station & Physical Settings States
  const [stationId, setStationId] = useState<Room3StationId>(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('station') as Room3StationId;
      if (q && ['circuits', 'optics', 'relativity'].includes(q)) return q;
    }
    return 'circuits';
  });
  const [circuits, setCircuits] = useState<CircuitSettings>(INITIAL_CIRCUITS);
  const [optics, setOptics] = useState<OpticsSettings>(INITIAL_OPTICS);
  const [relativity, setRelativity] = useState<RelativitySettings>(INITIAL_RELATIVITY);

  // App & 3D HUD States
  const [sceneReady, setSceneReady] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [assetProgress, setAssetProgress] = useState({ loaded: 0, total: 1 });
  const [sceneError, setSceneError] = useState(false);
  const [interaction, setInteraction] = useState<EquipmentInteraction | null>(null);
  const [isThirdPerson, setIsThirdPerson] = useState(true);
  const [activeCharacter, setActiveCharacter] = useState<CharacterType>('female');
  const [proximateStation, setProximateStation] = useState<Room3StationId | null>(null);
  const [guidanceIndicator, setGuidanceIndicator] = useState<{
    screenX: number;
    screenY: number;
    isBehind: boolean;
    angleDeg: number;
    distanceM: number;
  } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState<Room3Progress>(createDefaultRoom3Progress);
  const [hydrated, setHydrated] = useState(false);

  // Notebook Modal States
  const [notebookOpen, setNotebookOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('notebook');
      if (q === 'true' || q === '1') return true;
    }
    return false;
  });
  const [notebookStep, setNotebookStep] = useState(() => {
    if (typeof window !== 'undefined') {
      const s = Number(new URLSearchParams(window.location.search).get('step'));
      if (!isNaN(s) && s >= 0 && s <= 7) return s;
    }
    return 0;
  });
  const [calculationFeedback, setCalculationFeedback] = useState('');
  const [calculationStatus, setCalculationStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [showCalcHint, setShowCalcHint] = useState(false);
  const [measurementWarning, setMeasurementWarning] = useState('');
  const [studentName, setStudentName] = useState('Student Physicist');
  const [studentId, setStudentId] = useState('PHY-300-2026');
  const [studentSection, setStudentSection] = useState('Physics Core III');
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const [mobilePanel, setMobilePanel] = useState<'none' | 'objective' | 'controls'>('none');
  const [runSettling, setRunSettling] = useState(false);
  const [equipmentMessage, setEquipmentMessage] = useState('');
  const [soundVolume, setSoundVolume] = useState(0.5);
  const [pointerLocked, setPointerLocked] = useState(false);

  // Coordinated Workspace Views (View A: 3D Laboratory vs View B: DCACLab Interactive Breadboard Workspace)
  const [activeWorkspaceView, setActiveWorkspaceView] = useState<'3d' | 'circuit_workspace'>('3d');

  // Multimeter & Workbench Instrument States
  const [cameraMode, setCameraMode] = useState<'walk' | 'closeup'>(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('closeup');
      if (q === 'true' || q === '1') return 'closeup';
    }
    return 'walk';
  });
  const [dmmReading, setDmmReading] = useState<MultimeterReading>({
    value: 24.0,
    displayString: '24.00 V',
    unit: 'V',
    isContinuityBeep: false,
    warning: null,
    isValidMeasurement: true,
  });
  const [dmmMode, setDmmModeState] = useState<MultimeterMode>('v_dc');
  const [dmmJack, setDmmJackState] = useState<MultimeterJack>('v_ohm');
  const [redTerminal, setRedTerminalState] = useState<TerminalId | null>('SRC_POS');
  const [blackTerminal, setBlackTerminalState] = useState<TerminalId | null>('SRC_NEG');
  const [jumperClosed, setJumperClosed] = useState(true);
  const [closeupHoverText, setCloseupHoverText] = useState<string | null>(null);
  const [closeupFocus, setCloseupFocus] = useState<'station' | 'board' | 'multimeter' | 'psu'>('station');

  // 3D Graphics & Visual Performance Settings
  const [graphicsSettings, setGraphicsSettingsState] = useState<GraphicsSettings>(() => {
    return loadGraphicsSettings();
  });
  const [graphicsModalOpen, setGraphicsModalOpen] = useState(false);
  const [perfStats, setPerfStats] = useState({ fps: 60, frameTimeMs: 16.6 });

  const handleApplyGraphicsSettings = (newSettings: GraphicsSettings) => {
    setGraphicsSettingsState(newSettings);
    saveGraphicsSettings(newSettings);
    sceneApi.current?.setGraphicsSettings(newSettings);
  };

  const handleSetCloseupFocus = (focus: 'station' | 'board' | 'multimeter' | 'psu') => {
    setCloseupFocus(focus);
    sceneApi.current?.setCloseupFocus?.(focus);
  };

  // Student-Centered Experience: Exclusively Guided Experiment
  const experienceMode: ExperienceMode = 'guided';
  const stationProgress = progress[stationId];
  const [viewStepIndex, setViewStepIndex] = useState<number | null>(null);
  const activeStepIdx = viewStepIndex !== null ? viewStepIndex : stationProgress.currentStep;
  const [showGuidedHint, setShowGuidedHint] = useState(false);
  const [retakeTrialIndex, setRetakeTrialIndex] = useState<number | null>(null);
  const [activeTrialTab, setActiveTrialTab] = useState<number>(0);

  // Reset step view on station or current step change
  useEffect(() => {
    setViewStepIndex(null);
    setShowGuidedHint(false);
    setRetakeTrialIndex(null);
    setActiveTrialTab(0);
  }, [stationId]);

  useEffect(() => {
    setViewStepIndex(null);
  }, [stationProgress.currentStep]);

  // Station Definitions & Telemetry Derived States
  const station = ROOM3_STATIONS[stationId];
  const circuitResult = useMemo(() => calculateCircuit(circuits), [circuits]);
  const opticsResult = useMemo(() => calculateOptics(optics), [optics]);
  const relativityResult = useMemo(() => calculateRelativity(relativity), [relativity]);

  const circuitMetrics = useMemo(() => computeCircuitOhmMetrics(stationProgress.trials), [stationProgress.trials]);
  const opticsMetrics = useMemo(() => computeOpticsLensMetrics(stationProgress.trials), [stationProgress.trials]);
  const relativityMetrics = useMemo(() => computeRelativityMetrics(stationProgress.trials), [stationProgress.trials]);
  const regression = useMemo(() => computeRoom3Regression(stationId, stationProgress.trials), [stationId, stationProgress.trials]);

  // Derived Curriculum & Guided Validation
  const currentCurriculum = STATION_CURRICULUM[stationId];
  const currentGuidedStep = currentCurriculum?.steps[activeStepIdx] ?? currentCurriculum?.steps[0];

  const guidedState: GuidedExperimentState = useMemo(() => ({
    stationId,
    circuits,
    optics,
    relativity,
    dmmMode,
    dmmJack,
    redTerminal,
    blackTerminal,
    jumperClosed,
    dmmReading,
    inspectedEquipment: stationProgress.inspected,
  }), [stationId, circuits, optics, relativity, dmmMode, dmmJack, redTerminal, blackTerminal, jumperClosed, dmmReading, stationProgress.inspected]);

  const stepValidation: StepValidationResult = useMemo(() => {
    if (!currentGuidedStep) return { isPassed: true, feedback: '' };
    return currentGuidedStep.validate(guidedState);
  }, [currentGuidedStep, guidedState]);

  // Derived Prediction State per Station (Eliminates Cross-Station State Leaks & Caps)
  const currentPredictionAnswer = stationProgress.predictionAnswer ?? null;
  const predictionStatus: 'idle' | 'correct' | 'incorrect' =
    currentPredictionAnswer === null
      ? 'idle'
      : currentPredictionAnswer === station.prediction.answer
      ? 'correct'
      : 'incorrect';
  const predictionFeedback =
    currentPredictionAnswer === null
      ? ''
      : currentPredictionAnswer === station.prediction.answer
      ? `Correct! ${station.prediction.explanation}`
      : 'Not quite. Review the physical principles and try selecting the accurate relationship.';

  // Step 1 Explore Gating
  const allInspected = useMemo(() => {
    const targets = INSPECTION_TARGETS[stationId] ?? [];
    return targets.every((tgt) => stationProgress.inspected.includes(tgt));
  }, [stationId, stationProgress.inspected]);

  // Step 3 Setup Baseline Mismatches Check
  const setupMismatches = useMemo(() => {
    const mismatches: string[] = [];
    if (stationId === 'circuits') {
      if (Math.abs(circuits.vs - 24.0) >= 0.5) mismatches.push(`Vs = ${circuits.vs.toFixed(1)} V (target: 24.0 V)`);
      if (circuits.r1 !== 100) mismatches.push(`R1 = ${circuits.r1} Ω (target: 100 Ω)`);
      if (circuits.r2 !== 220) mismatches.push(`R2 = ${circuits.r2} Ω (target: 220 Ω)`);
      if (circuits.r3 !== 330) mismatches.push(`R3 = ${circuits.r3} Ω (target: 330 Ω)`);
      if (circuits.mode !== 'dc') mismatches.push(`Regime = ${circuits.mode.toUpperCase()} (target: DC)`);
      if (circuits.topology !== 'series') mismatches.push(`Topology = ${circuits.topology} (target: Series)`);
    } else if (stationId === 'optics') {
      if (optics.wavelength !== 532) mismatches.push(`Laser λ = ${optics.wavelength} nm (target: 532 nm)`);
      if (optics.subMode === 'refraction') {
        if (Math.abs(optics.n1 - 1.00) > 0.01) mismatches.push(`n1 = ${optics.n1.toFixed(2)} (target: 1.00)`);
        if (Math.abs(optics.n2 - 1.52) > 0.01) mismatches.push(`n2 = ${optics.n2.toFixed(2)} (target: 1.52)`);
        if (Math.abs(optics.theta1 - 30.0) >= 0.5) mismatches.push(`θ1 = ${optics.theta1.toFixed(1)}° (target: 30.0°)`);
      } else if (optics.subMode === 'imaging') {
        if (Math.abs(optics.focalLength - 20.0) >= 0.5) mismatches.push(`f = ${optics.focalLength.toFixed(1)} cm (target: 20.0 cm)`);
        if (Math.abs(optics.objectDistance - 40.0) >= 0.5) mismatches.push(`do = ${optics.objectDistance.toFixed(1)} cm (target: 40.0 cm)`);
      } else {
        if (Math.abs(optics.slitSeparation - 0.25) > 0.01) mismatches.push(`d = ${optics.slitSeparation.toFixed(2)} mm (target: 0.25 mm)`);
        if (Math.abs(optics.screenDistance - 1.00) > 0.05) mismatches.push(`L = ${optics.screenDistance.toFixed(2)} m (target: 1.00 m)`);
      }
    } else {
      if (Math.abs(relativity.beta - 0.600) >= 0.005) mismatches.push(`β = ${relativity.beta.toFixed(3)}c (target: 0.600c)`);
      if (Math.abs(relativity.properTime - 10.0) >= 0.1) mismatches.push(`Proper Time Δt₀ = ${relativity.properTime.toFixed(1)} s (target: 10.0 s)`);
      if (Math.abs(relativity.properLength - 20.0) >= 0.1) mismatches.push(`Proper Length L₀ = ${relativity.properLength.toFixed(1)} m (target: 20.0 m)`);
    }
    return mismatches;
  }, [stationId, circuits, optics, relativity]);

  // Step 4 Run Power Gating
  const isStationEnergized = useMemo(() => {
    if (stationId === 'circuits') return circuits.powerOn && jumperClosed;
    if (stationId === 'optics') return optics.powerOn !== false;
    return relativity.powerOn !== false;
  }, [stationId, circuits.powerOn, jumperClosed, optics.powerOn, relativity.powerOn]);

  // Step 7 Analysis Gating
  const allGuideCorrect = useMemo(() => {
    return ROOM3_GUIDE_QUESTIONS[stationId]?.every((q, idx) => stationProgress.guideAnswers?.[idx] === q.correctIndex) ?? false;
  }, [stationId, stationProgress.guideAnswers]);
  const hasUncertainty = stationProgress.errors.length > 0;

  // Step 8 Certification Gating
  const isComputationVerified = Boolean(stationProgress.completed[7]);
  const allTrialsLogged = stationProgress.trials.length >= TOTAL_TRIALS;
  const isStudentInfoFilled = studentName.trim().length > 0 && studentId.trim().length > 0 && studentSection.trim().length > 0;
  const steps1to7Done = useMemo(() => {
    return stationProgress.completed.slice(0, 7).every(Boolean);
  }, [stationProgress.completed]);
  const reportReady = allTrialsLogged && isComputationVerified && allGuideCorrect && isStudentInfoFilled;

  // Scoring
  const currentScore = stationScore(stationProgress);
  const totalScore = (Object.keys(progress) as Room3StationId[]).reduce(
    (total, id) => total + stationScore(progress[id]),
    0
  );

  const missingInspection = INSPECTION_TARGETS[stationId]?.find((id) => !stationProgress.inspected.includes(id));

  // Dynamic, Real-Time Synchronized Guidance Target pointing to exactly what the student needs next
  const guidanceTarget = useMemo(() => {
    // 1. Station 01: Circuits (Ohm's Law)
    if (stationId === 'circuits') {
      // Step 1: Equipment Identification
      if (activeStepIdx === 0) {
        const missing = INSPECTION_TARGETS.circuits.find((id) => !stationProgress.inspected.includes(id));
        return missing || 'circuits-power-switch';
      }
      // Step 2: Circuit Assembly & Inspection (DC series continuity & Req = 650 Ω)
      if (activeStepIdx === 1) {
        if (!jumperClosed) return 'circuits-series-jumper';
        return 'circuits-topology-selector';
      }
      // Step 3: Power Supply Setup & Energization (24.0 V DC)
      if (activeStepIdx === 2) {
        if (!circuits.powerOn) return 'circuits-power-switch';
        if (Math.abs(circuits.vs - 24.0) > 1.0) return 'circuits-voltage-knob';
        return 'circuits-power-switch';
      }
      // Step 4: Multimeter Instrument Preparation (DC V mode, V·Ω jack)
      if (activeStepIdx === 3) {
        if (dmmJack !== 'v_ohm') return 'circuits-dmm-jack';
        if (dmmMode !== 'v_dc') return 'circuits-dmm-dial';
        return 'circuits-multimeter';
      }
      // Step 5: Voltage Measurement Procedure (Parallel across PSU or R1)
      if (activeStepIdx === 4) {
        if (!circuits.powerOn) return 'circuits-power-switch';
        if (dmmMode !== 'v_dc') return 'circuits-dmm-dial';
        const isParallelConnected =
          (redTerminal === 'SRC_POS' && blackTerminal === 'SRC_NEG') ||
          (redTerminal === 'R1_A' && blackTerminal === 'R1_B') ||
          (redTerminal === 'R1_B' && blackTerminal === 'R1_A');
        if (!isParallelConnected) return 'circuits-probe-r1';
        return 'circuits-multimeter';
      }
      // Step 6: Current Measurement Procedure (Series ammeter insertion)
      if (activeStepIdx === 5) {
        // Safety: Power must be turned OFF before breaking circuit
        if (circuits.powerOn && (jumperClosed || dmmJack !== 'ma_10a' || (dmmMode !== 'a_dc' && dmmMode !== 'a_ac'))) {
          return 'circuits-power-switch';
        }
        if (dmmJack !== 'ma_10a') return 'circuits-dmm-jack';
        if (dmmMode !== 'a_dc' && dmmMode !== 'a_ac') return 'circuits-dmm-dial';
        if (jumperClosed) return 'circuits-series-jumper';
        const isSeriesBreak =
          (redTerminal === 'SERIES_JACK_A' && blackTerminal === 'SERIES_JACK_B') ||
          (redTerminal === 'SERIES_JACK_B' && blackTerminal === 'SERIES_JACK_A');
        if (!isSeriesBreak) return 'circuits-series-jumper';
        if (!circuits.powerOn) return 'circuits-power-switch'; // Restore power
        return 'circuits-multimeter';
      }
      // Step 7: Five-Trial Experimental Data Collection (sweep 4V, 8V, 12V, 16V, 20V)
      if (activeStepIdx === 6) {
        if (!circuits.powerOn) return 'circuits-power-switch';
        return 'circuits-voltage-knob';
      }
      // Step 8: Computation & Scientific Analysis
      if (activeStepIdx === 7) {
        return 'circuits-clipboard';
      }
    }

    // 2. Station 02: Optics (Thin Lens)
    if (stationId === 'optics') {
      if (activeStepIdx === 0) {
        const missing = INSPECTION_TARGETS.optics.find((id) => !stationProgress.inspected.includes(id));
        return missing || 'optics-laser';
      }
      if (activeStepIdx === 1) return 'optics-rail';
      if (activeStepIdx === 2) {
        if (!optics.powerOn || optics.wavelength !== 532) return 'optics-laser';
        return 'optics-laser';
      }
      if (activeStepIdx === 3) return 'optics-lens-carrier';
      if (activeStepIdx === 4) return 'optics-screen';
      if (activeStepIdx === 5) return 'optics-screen';
      if (activeStepIdx === 6) return 'optics-rail';
      if (activeStepIdx === 7) return 'optics-clipboard';
    }

    // 3. Station 03: Special Relativity (Lorentz Transformations)
    if (stationId === 'relativity') {
      if (activeStepIdx === 0) {
        const missing = INSPECTION_TARGETS.relativity.find((id) => !stationProgress.inspected.includes(id));
        return missing || 'relativity-velocity-dial';
      }
      if (activeStepIdx === 1) return 'relativity-velocity-dial';
      if (activeStepIdx === 2) return 'relativity-velocity-dial';
      if (activeStepIdx === 3) return 'relativity-light-clock';
      if (activeStepIdx === 4) return 'relativity-velocity-dial';
      if (activeStepIdx === 5) return 'relativity-contracting-rod';
      if (activeStepIdx === 6) return 'relativity-velocity-dial';
      if (activeStepIdx === 7) return 'relativity-clipboard';
    }

    return 'circuits-power-switch';
  }, [
    stationId,
    activeStepIdx,
    stationProgress.inspected,
    circuits.powerOn,
    circuits.vs,
    jumperClosed,
    dmmJack,
    dmmMode,
    redTerminal,
    blackTerminal,
    optics.powerOn,
    optics.wavelength,
  ]);

  useEffect(() => {
    sceneApi.current?.setGuidance(guidanceTarget);
  }, [guidanceTarget, sceneReady]);

  const returnToApparatus = (message: string) => {
    setNotebookOpen(false);
    setMobilePanel('none');
    setEquipmentMessage(message);
    sceneApi.current?.requestPointerLock();
  };

  // Sound Synthesizer via Web Audio API
  const playTone = (freq: number, type: OscillatorType = 'sine', duration = 0.15, vol = 0.25) => {
    if (!soundEnabledRef.current || typeof window === 'undefined') return;
    try {
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      if (audioContext.current.state === 'suspended') {
        void audioContext.current.resume();
      }
      const ctx = audioContext.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol * soundVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio tone error', e);
    }
  };

  const playSuccessChime = () => {
    playTone(523.25, 'triangle', 0.1, 0.2); // C5
    setTimeout(() => playTone(659.25, 'triangle', 0.12, 0.2), 100); // E5
    setTimeout(() => playTone(783.99, 'triangle', 0.25, 0.25), 220); // G5
  };

  // Pointer lock listener
  useEffect(() => {
    const handlePointerLockChange = () => {
      setPointerLocked(document.pointerLockElement === sceneContainer.current?.querySelector('canvas'));
    };
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  // Equipment toast auto-dismiss
  useEffect(() => {
    if (!equipmentMessage) return;
    const t = window.setTimeout(() => setEquipmentMessage(''), 3200);
    return () => window.clearTimeout(t);
  }, [equipmentMessage]);

  // 1. Placard Asset Preloading: Preload only Station 1 on initial mount
  useEffect(() => {
    const img = new Image();
    img.src = '/assets/placards/placard_electricity.png';
  }, []);

  // 2. Local Storage Persistence
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProgress(safeProgress(JSON.parse(saved)));
      }
    } catch (err) {
      console.warn('Could not restore Room 03 progress', err);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (err) {
      console.warn('Could not save Room 03 progress', err);
    }
  }, [hydrated, progress]);

  // 3. Three.js Scene Hydration (Non-blocking background initialization)
  useEffect(() => {
    if (!sceneContainer.current) return;
    let fallbackTimer: NodeJS.Timeout | null = null;
    try {
      const api = createRoom3Scene(sceneContainer.current, {
        onAssetProgress: (loaded, total) => setAssetProgress({ loaded, total: Math.max(1, total) }),
        onAssetsReady: () => setAssetsReady(true),
        onEquipmentInteract: (id) => equipmentActionRef.current(id),
        onInteractionChange: (inter) => setInteraction(inter),
        onFootstep: () => playTone(80, 'sine', 0.05, 0.1),
        onCameraModeChange: (mode) => setCameraMode(mode),
        onDmmReadingChange: (reading) => setDmmReading(reading),
        onProbePlaced: (probe, term) => {
          if (probe === 'red') setRedTerminalState(term);
          else setBlackTerminalState(term);
        },
        onCloseupHover: (text) => setCloseupHoverText(text),
        onPointerLockChange: setPointerLocked,
        onStationProximityChange: (st) => setProximateStation(st),
        onPerfStatsChange: (fps, frameTimeMs) => setPerfStats({ fps, frameTimeMs }),
        onGuidanceIndicator: (info) => setGuidanceIndicator(info),
      });
      sceneApi.current = api;
      api.setGraphicsSettings(graphicsSettings);
      if (redTerminal) api.setProbeTerminal('red', redTerminal);
      if (blackTerminal) api.setProbeTerminal('black', blackTerminal);
      if (typeof window !== 'undefined') {
        (window as unknown as { __room3Scene?: unknown }).__room3Scene = api;
        const queryStation = new URLSearchParams(window.location.search).get('station') as Room3StationId;
        if (queryStation && ['circuits', 'optics', 'relativity'].includes(queryStation)) {
          api.setStation(queryStation);
        }
        const queryCloseup = new URLSearchParams(window.location.search).get('closeup');
        if (queryCloseup === 'true' || queryCloseup === '1') {
          api.setCameraMode('closeup', queryStation || 'circuits');
        }
      }
      // Guarantee assetsReady resolves after timeout in case of cached or slow network
      fallbackTimer = setTimeout(() => {
        setAssetsReady(true);
      }, 2200);

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSceneReady(true);
      setSceneError(false);
    } catch (err) {
      console.error('Room 03 WebGL Scene Error:', err);
      setSceneError(true);
      setSceneReady(false);
    }

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      sceneApi.current?.dispose();
      sceneApi.current = null;
      if (audioContext.current && audioContext.current.state !== 'closed') {
        void audioContext.current.close();
      }
      audioContext.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Propagate physical changes to 3D scene
  useEffect(() => { sceneApi.current?.setStation(stationId); }, [stationId]);
  useEffect(() => { sceneApi.current?.setCircuits(circuits); }, [circuits]);
  useEffect(() => { sceneApi.current?.setOptics(optics); }, [optics]);
  useEffect(() => { sceneApi.current?.setRelativity(relativity); }, [relativity]);

  // Multimeter & Workbench Operations Handlers
  const handleSetDmmMode = (mode: MultimeterMode) => {
    setDmmModeState(mode);
    sceneApi.current?.setDmmMode(mode);
    playTone(750, 'square', 0.05, 0.12);
  };

  const handleSetDmmJack = (jack: MultimeterJack) => {
    setDmmJackState(jack);
    sceneApi.current?.setDmmJack(jack);
    playTone(620, 'sine', 0.06, 0.12);
  };

  const handleSetProbe = (probe: 'red' | 'black', term: TerminalId | null) => {
    if (probe === 'red') setRedTerminalState(term);
    else setBlackTerminalState(term);
    sceneApi.current?.setProbeTerminal(probe, term);
    playTone(550, 'sine', 0.06, 0.12);
  };

  const handleToggleJumper = () => {
    setJumperClosed((prev) => !prev);
    sceneApi.current?.toggleSeriesJumper();
    playTone(480, 'triangle', 0.08, 0.15);
  };

  const handleResetFuse = () => {
    sceneApi.current?.resetDmmFuse();
    playTone(880, 'sine', 0.1, 0.2);
  };

  const handleSetCloseup = (mode: 'walk' | 'closeup') => {
    setCameraMode(mode);
    sceneApi.current?.setCameraMode(mode, stationId);
    playTone(mode === 'closeup' ? 660 : 440, 'triangle', 0.08, 0.15);
  };

  // Step Completion Helpers
  const completeStep = (stepIndex: number) => {
    setProgress((prev) => {
      const st = { ...prev[stationId] };
      const completed = [...st.completed];
      const skipped = [...st.skipped];
      if (!completed[stepIndex]) {
        completed[stepIndex] = true;
        skipped[stepIndex] = false;
        playSuccessChime();
      }
      const nextStep = Math.min(7, Math.max(st.currentStep, stepIndex + 1));
      return {
        ...prev,
        [stationId]: {
          ...st,
          completed,
          skipped,
          currentStep: nextStep,
        },
      };
    });
  };

  const handleInspectApparatus = (targetId: string) => {
    let canonicalId = targetId;
    if (['circuits-power-switch', 'circuits-voltage-knob'].includes(targetId)) {
      canonicalId = 'circuits-power-switch';
    } else if (['circuits-multimeter', 'circuits-dmm-dial', 'circuits-dmm-jack'].includes(targetId)) {
      canonicalId = 'circuits-multimeter';
    } else if (['circuits-oscilloscope'].includes(targetId)) {
      canonicalId = 'circuits-oscilloscope';
    } else if (['circuits-topology-selector', 'circuits-probe-r1', 'circuits-probe-r2', 'circuits-probe-r3', 'circuits-series-jumper'].includes(targetId)) {
      canonicalId = 'circuits-topology-selector';
    } else if (['optics-laser'].includes(targetId)) {
      canonicalId = 'optics-laser';
    } else if (['optics-angle-dial'].includes(targetId)) {
      canonicalId = 'optics-angle-dial';
    } else if (['optics-screen'].includes(targetId)) {
      canonicalId = 'optics-screen';
    } else if (['optics-rail', 'optics-submode-toggle'].includes(targetId)) {
      canonicalId = 'optics-rail';
    } else if (['relativity-velocity-dial'].includes(targetId)) {
      canonicalId = 'relativity-velocity-dial';
    } else if (['relativity-light-clock'].includes(targetId)) {
      canonicalId = 'relativity-light-clock';
    } else if (['relativity-contracting-rod'].includes(targetId)) {
      canonicalId = 'relativity-contracting-rod';
    } else if (['relativity-accelerator'].includes(targetId)) {
      canonicalId = 'relativity-accelerator';
    }

    const required = INSPECTION_TARGETS[stationId];
    if (!required || !required.includes(canonicalId)) return;

    setProgress((prev) => {
      const st = { ...prev[stationId] };
      const nextInspected = st.inspected.includes(canonicalId) ? st.inspected : [...st.inspected, canonicalId];
      const allDone = required.every((id) => nextInspected.includes(id));
      const updatedCompleted = [...st.completed];
      let newCurrentStep = st.currentStep;

      if (allDone && !st.completed[0]) {
        updatedCompleted[0] = true;
        newCurrentStep = Math.max(st.currentStep, 1);
        playTone(880, 'sine', 0.25, 0.4);
        setViewStepIndex(null);
        setEquipmentMessage(`🎉 Step 1 Complete (+10 pts)! All 4 apparatus instruments inspected. Advancing to Step 2.`);
      } else if (!st.inspected.includes(canonicalId)) {
        playTone(587.33, 'triangle', 0.12, 0.3);
        setEquipmentMessage(`✓ ${INSPECTION_LABELS[canonicalId] || canonicalId} inspected (${nextInspected.length}/${required.length}).`);
      }

      return {
        ...prev,
        [stationId]: {
          ...st,
          inspected: nextInspected,
          completed: updatedCompleted,
          currentStep: newCurrentStep,
        },
      };
    });
  };

  // Entering workbench closeup automatically verifies all instruments at this station
  useEffect(() => {
    if (cameraMode === 'closeup') {
      INSPECTION_TARGETS[stationId]?.forEach((tgt) => {
        handleInspectApparatus(tgt);
      });
    }
  }, [cameraMode, stationId]);

  // Reactive Telemetry Auto-Advancement (Steps 3 through 7)
  useEffect(() => {
    const curStep = stationProgress.currentStep;
    if (stationProgress.completed[curStep]) return;

    // Step 3 (index 2: Setup / Power Configuration)
    if (curStep === 2) {
      if (stationId === 'circuits' && circuits.powerOn && Math.abs(circuits.vs - 24.0) < 1.5 && jumperClosed) {
        completeStep(2);
      } else if (stationId === 'optics' && optics.powerOn && optics.wavelength === 532) {
        completeStep(2);
      } else if (stationId === 'relativity' && relativity.massPreset === 'alpha' && relativity.beta <= 0.01) {
        completeStep(2);
      }
    }
    // Step 4 (index 3: Instrument Preparation)
    else if (curStep === 3) {
      if (stationId === 'circuits' && dmmMode === 'v_dc' && dmmJack === 'v_ohm' && !dmmReading.tripFuse) {
        completeStep(3);
      } else if (stationId === 'optics' && optics.subMode === 'imaging' && Math.abs(optics.focalLength - 20.0) < 1.0) {
        completeStep(3);
      } else if (stationId === 'relativity') {
        completeStep(3);
      }
    }
    // Step 5 (index 4: Voltage Measurement / Ray Tracing / Proper Frame)
    else if (curStep === 4) {
      if (
        stationId === 'circuits' &&
        circuits.powerOn &&
        ((redTerminal === 'SRC_POS' && blackTerminal === 'SRC_NEG') ||
          (redTerminal === 'R1_A' && blackTerminal === 'R1_B') ||
          (redTerminal === 'R1_B' && blackTerminal === 'R1_A') ||
          (dmmReading.isValidMeasurement && dmmReading.unit === 'V' && Math.abs(dmmReading.value ?? 0) > 1.0))
      ) {
        completeStep(4);
      } else if (stationId === 'optics' && Math.abs(optics.objectDistance - 40.0) < 1.5) {
        completeStep(4);
      } else if (stationId === 'relativity' && Math.abs(relativity.beta - 0.60) < 0.03) {
        completeStep(4);
      }
    }
    // Step 6 (index 5: Current Measurement / Interference / Length Contraction)
    else if (curStep === 5) {
      if (
        stationId === 'circuits' &&
        (dmmMode === 'a_dc' || dmmMode === 'a_ac') &&
        dmmJack === 'ma_10a' &&
        !jumperClosed &&
        ((redTerminal === 'SERIES_JACK_A' && blackTerminal === 'SERIES_JACK_B') ||
          (redTerminal === 'SERIES_JACK_B' && blackTerminal === 'SERIES_JACK_A')) &&
        circuits.powerOn &&
        dmmReading.value !== null &&
        Math.abs(dmmReading.value) > 0.005
      ) {
        completeStep(5);
      } else if (stationId === 'optics') {
        completeStep(5);
      } else if (stationId === 'relativity' && Math.abs(relativity.beta - 0.60) < 0.03) {
        completeStep(5);
      }
    }
    // Step 7 (index 6: 5-Trial Loop)
    else if (curStep === 6 && stationProgress.trials.length >= 5) {
      completeStep(6);
    }
  }, [
    stationId,
    stationProgress.currentStep,
    stationProgress.completed,
    stationProgress.trials.length,
    circuits.powerOn,
    circuits.vs,
    jumperClosed,
    dmmMode,
    dmmJack,
    dmmReading.tripFuse,
    dmmReading.isValidMeasurement,
    dmmReading.unit,
    dmmReading.value,
    redTerminal,
    blackTerminal,
    optics.powerOn,
    optics.wavelength,
    optics.subMode,
    optics.focalLength,
    optics.objectDistance,
    relativity.massPreset,
    relativity.beta,
  ]);

  const handleEquipmentAction = (id: string) => {
    playTone(440, 'triangle', 0.08, 0.2);
    if (id === 'campus-door') {
      sceneApi.current?.openDoor(() => {
        window.location.href = '/';
      });
      return;
    }

    // Inspect tracking for Step 1
    handleInspectApparatus(id);

    if (id.includes('placard') || id.includes('clipboard')) {
      setNotebookOpen(true);
    } else if (['circuits-multimeter', 'circuits-power-switch', 'circuits-topology-selector', 'circuits-oscilloscope'].includes(id)) {
      handleSetCloseup('closeup');
    } else if (['optics-laser', 'optics-angle-dial', 'optics-submode-toggle', 'optics-screen', 'optics-rail'].includes(id)) {
      handleSetCloseup('closeup');
    } else if (['relativity-velocity-dial', 'relativity-contracting-rod', 'relativity-light-clock', 'relativity-accelerator'].includes(id)) {
      handleSetCloseup('closeup');
    }
  };

  useEffect(() => {
    equipmentActionRef.current = handleEquipmentAction;
  });

  // Keyboard navigation for stations (Keys 1-3) & Close-up toggle
  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) return;
      if (e.key === 'Escape') {
        if (activeWorkspaceView === 'circuit_workspace') {
          setActiveWorkspaceView('3d');
          return;
        }
        if (cameraMode === 'closeup') {
          handleSetCloseup('walk');
          return;
        }
      }
      if (e.key === '1') {
        setStationId('circuits');
        playTone(392, 'sine', 0.1, 0.15);
      } else if (e.key === '2') {
        setStationId('optics');
        playTone(440, 'sine', 0.1, 0.15);
      } else if (e.key === '3') {
        setStationId('relativity');
        playTone(523.25, 'sine', 0.1, 0.15);
      } else if (e.key.toLowerCase() === 'e') {
        if (activeWorkspaceView === 'circuit_workspace') {
          setActiveWorkspaceView('3d');
        } else if (cameraMode === 'closeup') {
          handleSetCloseup('walk');
        } else if (interaction) {
          handleEquipmentAction(interaction.id);
        } else if (proximateStation) {
          setStationId(proximateStation);
          handleSetCloseup('closeup');
        }
      } else if (e.key.toLowerCase() === 'v') {
        const next = sceneApi.current?.toggleView();
        if (typeof next === 'boolean') setIsThirdPerson(next);
      } else if (e.key.toLowerCase() === 'c') {
        const next = sceneApi.current?.switchCharacter();
        if (next) setActiveCharacter(next);
      } else if (e.key.toLowerCase() === 'g') {
        setGraphicsModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction, cameraMode, activeWorkspaceView, proximateStation]);

  // Touch Analog Walking Joystick Handlers
  const handleJoystickPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    joystickPointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    handleJoystickMove(event);
  };

  const handleJoystickMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.38;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const x = Math.cos(angle) * clampedDist;
    const y = Math.sin(angle) * clampedDist;

    setJoystickKnob({ x, y });
    const right = x / maxRadius;
    const forward = -y / maxRadius;
    sceneApi.current?.setMoveVector(right, forward);
  };

  const handleJoystickPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignored
    }
    joystickPointerId.current = null;
    setJoystickKnob({ x: 0, y: 0 });
    sceneApi.current?.setMoveVector(0, 0);
  };

  const markInspected = (targetId: string) => {
    setProgress((prev) => {
      const st = { ...prev[stationId] };
      if (!st.inspected.includes(targetId)) {
        playTone(520, 'sine', 0.08, 0.15);
        return {
          ...prev,
          [stationId]: { ...st, inspected: [...st.inspected, targetId] },
        };
      }
      return prev;
    });
  };

  // Helper to set assigned trial condition
  const handleSetAssignedCondition = (targetVal: number) => {
    playTone(520, 'sine', 0.08, 0.15);
    if (stationId === 'circuits') {
      setCircuits((prev) => ({ ...prev, vs: targetVal, powerOn: true, mode: 'dc', topology: 'series' }));
    } else if (stationId === 'optics') {
      setOptics((prev) => ({ ...prev, objectDistance: targetVal, subMode: 'imaging', focalLength: 20.0, powerOn: true }));
    } else {
      setRelativity((prev) => ({ ...prev, beta: targetVal, powerOn: true, massPreset: 'alpha' }));
    }
  };

  // Reset experiment trials
  const handleResetTrials = () => {
    setProgress((prev) => {
      const st = { ...prev[stationId] };
      const completed = [...st.completed];
      completed[6] = false;
      completed[7] = false;
      return {
        ...prev,
        [stationId]: {
          ...st,
          trials: [],
          completed,
          calculations: ['', '', '', '', ''],
        },
      };
    });
    setRetakeTrialIndex(null);
    setActiveTrialTab(0);
    setMeasurementWarning('');
    playTone(300, 'sawtooth', 0.1, 0.15);
  };

  // Trial Logging Helper with Assigned Operating Points, Duplicate Check & Explicit Replacement
  const recordCurrentTrial = (explicitIndex?: number) => {
    const isReplacing = typeof explicitIndex === 'number' || retakeTrialIndex !== null;
    const targetIndex = isReplacing
      ? (typeof explicitIndex === 'number' ? explicitIndex : (retakeTrialIndex ?? 0))
      : stationProgress.trials.length;

    if (targetIndex >= TOTAL_TRIALS) return;

    const assigned = ROOM3_ASSIGNED_TRIALS[stationId][targetIndex];
    const trialNum = targetIndex + 1;

    let newTrial: TrialRecord;

    if (stationId === 'circuits') {
      // Check operating voltage match (assigned trial: 2.0, 4.0, 6.0, 8.0, 10.0 V)
      if (Math.abs(circuits.vs - assigned.targetValue) > 1.2) {
        setMeasurementWarning(
          `Voltage Mismatch for Trial ${trialNum}: Assigned operating point is Vs = ${assigned.targetValue.toFixed(1)} V, but power supply is set to ${circuits.vs.toFixed(1)} V. Adjust voltage to ${assigned.targetValue.toFixed(1)} V or click "${assigned.targetValue}V".`
        );
        playTone(220, 'sawtooth', 0.2, 0.25);
        return;
      }

      if (!circuits.powerOn) {
        setMeasurementWarning('Circuit Unpowered: Turn the Power Supply ON to take live voltage and current readings.');
        playTone(220, 'sawtooth', 0.2, 0.25);
        return;
      }

      // Measured voltage: live DMM reading if in DC voltage mode across source/resistor, else circuits.vs with slight realistic ADC display variation (±0.15%)
      let measuredV = circuits.vs * (1 + (Math.sin(trialNum * 13.7) * 0.0015));
      if (dmmMode === 'v_dc' && dmmJack === 'v_ohm' && dmmReading.value !== null && Math.abs(dmmReading.value) > 0.5) {
        measuredV = Math.abs(dmmReading.value);
      }

      // Single-resistor R3 = 330.0 Ω (1W) Ohm's Law verification:
      // In single resistor test, Req = 330.0 Ω, I_true = (Vi / Req) * 1000 in mA with ±0.2% ADC jitter
      const reqTheor = 330.0;
      const iJitter = 1 + (Math.cos(trialNum * 11.3) * 0.0018);
      let measuredI_mA = ((measuredV / reqTheor) * 1000) * iJitter;
      // If student legitimately has DMM in series ammeter mode:
      if ((dmmMode === 'a_dc' || dmmMode === 'a_ac') && dmmJack === 'ma_10a' && dmmReading.value !== null && Math.abs(dmmReading.value) > 0.0001) {
        measuredI_mA = Math.abs(dmmReading.value) * 1000;
      }
      const measuredI_A = measuredI_mA / 1000;
      const powerW = measuredV * measuredI_A;

      // Experimental resistance: Ri = Vi / I_A = (Vi * 1000) / I_mA ≈ 330.0 Ω
      const resistance = measuredI_mA > 0 ? (measuredV * 1000) / measuredI_mA : reqTheor;
      const expectedR = reqTheor;
      const percentError = Math.abs((resistance - expectedR) / expectedR) * 100;

      newTrial = {
        trial: trialNum,
        vs: assigned.targetValue,
        measuredV: Number(measuredV.toFixed(2)),
        measuredI_mA: Number(measuredI_mA.toFixed(2)),
        measuredI_A: Number(measuredI_A.toFixed(5)),
        resistance: Number(resistance.toFixed(1)),
        expectedR,
        powerW: Number(powerW.toFixed(4)),
        percentError: Number(percentError.toFixed(2)),
        mode: circuits.mode.toUpperCase(),
        topology: circuits.topology,
        current: Number(measuredI_A.toFixed(5)),
        impedance: Number(resistance.toFixed(1)),
      };
    } else if (stationId === 'optics') {
      if (Math.abs(optics.objectDistance - assigned.targetValue) > 2.0) {
        setMeasurementWarning(
          `Object Distance Mismatch for Trial ${trialNum}: Assigned distance is u = ${assigned.targetValue.toFixed(1)} cm. Adjust object distance to ${assigned.targetValue.toFixed(1)} cm or click "Set ${assigned.targetValue} cm".`
        );
        playTone(220, 'sawtooth', 0.2, 0.25);
        return;
      }

      const u = assigned.targetValue;
      const theorV = (u * 20.0) / (u - 20.0);
      const measuredV = theorV * (1 + (Math.sin(trialNum * 7.9) * 0.003));
      const invU = 1 / u;
      const invV = 1 / measuredV;
      const f_exp = (u * measuredV) / (u + measuredV);
      const f_nom = 20.0;
      const percentError = Math.abs((f_exp - f_nom) / f_nom) * 100;

      newTrial = {
        trial: trialNum,
        u,
        v: Number(measuredV.toFixed(2)),
        invU: Number(invU.toFixed(4)),
        invV: Number(invV.toFixed(4)),
        f_exp: Number(f_exp.toFixed(2)),
        f_nom,
        percentError: Number(percentError.toFixed(2)),
        subMode: 'imaging',
        wavelength: optics.wavelength,
        paramA: u,
        paramB: 20.0,
        theoretical: Number(theorV.toFixed(2)),
        measured: Number(measuredV.toFixed(2)),
      };
    } else {
      if (Math.abs(relativity.beta - assigned.targetValue) > 0.03) {
        setMeasurementWarning(
          `Velocity Ratio Mismatch for Trial ${trialNum}: Assigned velocity ratio is β = ${assigned.targetValue.toFixed(2)}c. Adjust velocity slider to ${assigned.targetValue.toFixed(2)}c or click "Set ${assigned.targetValue}c".`
        );
        playTone(220, 'sawtooth', 0.2, 0.25);
        return;
      }

      const beta = assigned.targetValue;
      const theorGamma = 1 / Math.sqrt(1 - beta * beta);
      const measuredGamma = theorGamma * (1 + (Math.sin(trialNum * 5.3) * 0.002));
      const speed = beta * 299792458;
      const dilatedTime = measuredGamma * 10.0;
      const contractedLength = 20.0 / measuredGamma;
      const restEnergy = 3727.38;
      const kineticEnergy = (measuredGamma - 1) * restEnergy;
      const totalEnergy = measuredGamma * restEnergy;

      newTrial = {
        trial: trialNum,
        beta,
        speed: Number(speed.toFixed(0)),
        gamma: Number(theorGamma.toFixed(4)),
        measuredGamma: Number(measuredGamma.toFixed(4)),
        dilatedTime: Number(dilatedTime.toFixed(2)),
        contractedLength: Number(contractedLength.toFixed(2)),
        kineticEnergy: Number(kineticEnergy.toFixed(1)),
        totalEnergy: Number(totalEnergy.toFixed(1)),
        preset: relativity.massPreset,
      };
    }

    setMeasurementWarning('');
    setRetakeTrialIndex(null);
    playTone(600, 'square', 0.1, 0.2);

    setProgress((prev) => {
      const st = { ...prev[stationId] };
      const updatedTrials = [...st.trials];
      if (targetIndex < updatedTrials.length) {
        updatedTrials[targetIndex] = newTrial;
      } else {
        updatedTrials.push(newTrial);
      }
      const updatedCalcs = [...(st.calculations || ['', '', '', '', ''])];
      if (stationId === 'circuits') {
        updatedCalcs[targetIndex] = String(newTrial.resistance ?? '650.0');
      } else if (stationId === 'optics') {
        updatedCalcs[targetIndex] = String(newTrial.f_exp ?? '20.00');
      } else {
        updatedCalcs[targetIndex] = String(newTrial.gamma ?? newTrial.measuredGamma ?? '1.0000');
      }
      const isComplete = updatedTrials.length >= TOTAL_TRIALS;
      const completed = [...st.completed];
      if (isComplete && !completed[6]) {
        completed[6] = true;
        playSuccessChime();
      }
      return {
        ...prev,
        [stationId]: {
          ...st,
          trials: updatedTrials,
          calculations: updatedCalcs,
          completed,
          currentStep: isComplete ? Math.max(st.currentStep, 7) : st.currentStep,
        },
      };
    });
  };

  // Quick Probe Terminal Jumper Connection Helper
  const handleQuickProbe = (preset: 'psu' | 'r1' | 'r2' | 'r3' | 'series' | 'park') => {
    playTone(600, 'sine', 0.08, 0.15);
    if (preset === 'psu') {
      handleSetDmmMode('v_dc');
      handleSetDmmJack('v_ohm');
      if (!jumperClosed) handleToggleJumper();
      handleSetProbe('red', 'SRC_POS');
      handleSetProbe('black', 'SRC_NEG');
    } else if (preset === 'r1') {
      handleSetDmmMode('v_dc');
      handleSetDmmJack('v_ohm');
      if (!jumperClosed) handleToggleJumper();
      handleSetProbe('red', 'R1_A');
      handleSetProbe('black', 'R1_B');
    } else if (preset === 'r2') {
      handleSetDmmMode('v_dc');
      handleSetDmmJack('v_ohm');
      if (!jumperClosed) handleToggleJumper();
      handleSetProbe('red', 'R2_A');
      handleSetProbe('black', 'R2_B');
    } else if (preset === 'r3') {
      handleSetDmmMode('v_dc');
      handleSetDmmJack('v_ohm');
      if (!jumperClosed) handleToggleJumper();
      handleSetProbe('red', 'R3_A');
      handleSetProbe('black', 'R3_B');
    } else if (preset === 'series') {
      handleSetDmmMode('a_dc');
      handleSetDmmJack('ma_10a');
      if (jumperClosed) handleToggleJumper();
      handleSetProbe('red', 'SERIES_JACK_A');
      handleSetProbe('black', 'SERIES_JACK_B');
    } else if (preset === 'park') {
      handleSetProbe('red', null);
      handleSetProbe('black', null);
    }
  };

  // Guided Curriculum: Apply Target Demonstration Setting
  const handleApplyAutoAssist = () => {
    if (!currentGuidedStep?.autoAssist) return;
    playTone(440, 'sine', 0.1, 0.15);
    const patch = currentGuidedStep.autoAssist.apply();
    if ('dmmMode' in patch && patch.dmmMode) handleSetDmmMode(patch.dmmMode);
    if ('dmmJack' in patch && patch.dmmJack) handleSetDmmJack(patch.dmmJack);
    if ('redTerminal' in patch && patch.redTerminal !== undefined) handleSetProbe('red', patch.redTerminal);
    if ('blackTerminal' in patch && patch.blackTerminal !== undefined) handleSetProbe('black', patch.blackTerminal);
    if ('jumperClosed' in patch && patch.jumperClosed !== undefined) {
      if (jumperClosed !== patch.jumperClosed) {
        handleToggleJumper();
      }
    }
    if ('circuits' in patch && patch.circuits) {
      setCircuits((c) => ({ ...c, ...patch.circuits }));
    }
    if ('optics' in patch && patch.optics) {
      setOptics((o) => ({ ...o, ...patch.optics }));
    }
    if ('relativity' in patch && patch.relativity) {
      setRelativity((r) => ({ ...r, ...patch.relativity }));
    }
  };

  // Guided Curriculum: Advance Step and Sync with Laboratory Notebook & Trials
  const handleContinueGuidedStep = () => {
    if (!stepValidation.isPassed) return;
    playTone(523, 'sine', 0.15, 0.25);
    completeStep(activeStepIdx);
    setViewStepIndex(null);
    setShowGuidedHint(false);

    if (activeStepIdx >= 5) {
      setNotebookOpen(true);
      setNotebookStep(Math.min(7, activeStepIdx + 1));
    }
  };
  const verifyPrediction = (choice: number) => {
    const isCorrect = choice === station.prediction.answer;
    setProgress((prev) => {
      const st = { ...prev[stationId] };
      return {
        ...prev,
        [stationId]: {
          ...st,
          predictionAnswer: choice,
        },
      };
    });

    if (isCorrect) {
      completeStep(1);
    } else {
      playTone(180, 'sawtooth', 0.2, 0.2);
    }
  };

  const handleCalculationChange = (index: number, val: string) => {
    setProgress((prev) => {
      const st = { ...prev[stationId] };
      const calcs = [...(st.calculations || ['', '', '', '', ''])];
      calcs[index] = val;
      return {
        ...prev,
        [stationId]: { ...st, calculations: calcs },
      };
    });
  };

  // Step 8 Experimental Computation Verification (Strict ±2% tolerance)
  const verifyCalculations = () => {
    const trials = stationProgress.trials;
    if (trials.length < TOTAL_TRIALS) {
      setCalculationFeedback('Please record all 5 experimental trials in Step 7 before verifying calculations.');
      setCalculationStatus('incorrect');
      return;
    }

    // Auto-fill or ensure calculations exist for all 5 trials
    const currentCalcs = [...(stationProgress.calculations || ['', '', '', '', ''])];
    let needsUpdate = false;
    for (let i = 0; i < trials.length; i++) {
      const t = trials[i];
      let val = currentCalcs[i];
      if (!val || val.trim() === '' || isNaN(parseFloat(val))) {
        if (stationId === 'circuits') {
          val = Number(t.resistance ?? 330.0).toFixed(1);
        } else if (stationId === 'optics') {
          val = Number(t.f_exp ?? 20.0).toFixed(2);
        } else {
          val = Number(t.gamma ?? t.measuredGamma ?? 1.0).toFixed(4);
        }
        currentCalcs[i] = val;
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      setProgress((prev) => ({
        ...prev,
        [stationId]: {
          ...prev[stationId],
          calculations: currentCalcs,
        },
      }));
    }

    for (let i = 0; i < trials.length; i++) {
      const t = trials[i];
      const userVal = parseFloat(currentCalcs[i]);
      let expected = 330.0;
      if (stationId === 'circuits') {
        expected = Number(t.resistance ?? 330.0);
      } else if (stationId === 'optics') {
        expected = Number(t.f_exp ?? 20.0);
      } else {
        expected = Number(t.gamma ?? t.measuredGamma ?? 1.0);
      }

      if (isNaN(userVal)) {
        setCalculationStatus('incorrect');
        setCalculationFeedback(`Trial #${i + 1} contains an invalid numeric entry. Please enter a valid number.`);
        playTone(200, 'sawtooth', 0.2, 0.2);
        return;
      }

      const diff = Math.abs((userVal - expected) / Math.max(0.001, expected));
      if (diff > 0.02) {
        setCalculationStatus('incorrect');
        setCalculationFeedback(
          `Calculation Error in Trial #${i + 1}: entered ${userVal.toFixed(2)}, but expected ${expected.toFixed(2)} (deviation ${(diff * 100).toFixed(1)}% > 2% tolerance). Review physical formulas and recalculate.`
        );
        playTone(200, 'sawtooth', 0.2, 0.2);
        return;
      }
    }

    setCalculationStatus('correct');
    setCalculationFeedback('Verification Passed! All 5 calculations match physical theoretical laws within ±2% tolerance.');
    playSuccessChime();
    completeStep(7);
  };

  // Step 6 Guide Questions Handler
  const handleGuideAnswer = (qIndex: number, optIndex: number) => {
    setProgress((prev) => {
      const st = { ...prev[stationId] };
      const answers = [...(st.guideAnswers ?? [-1, -1, -1])];
      answers[qIndex] = optIndex;
      playTone(500, 'sine', 0.08, 0.15);
      return {
        ...prev,
        [stationId]: { ...st, guideAnswers: answers },
      };
    });
  };

  // Step 6 Error Source Toggle
  const toggleErrorSource = (err: string) => {
    setProgress((prev) => {
      const st = { ...prev[stationId] };
      const errors = st.errors.includes(err)
        ? st.errors.filter((e) => e !== err)
        : [...st.errors, err];
      return {
        ...prev,
        [stationId]: { ...st, errors },
      };
    });
  };

  // PDF Report Generation
  const downloadReportPdf = () => {
    const lines = [
      'UNIVERSITY OF PERPETUAL HELP SYSTEM DALTA',
      'DEPARTMENT OF PHYSICS & APPLIED PHYSICAL SCIENCES',
      '========================================================================',
      'CERTIFIED UNIVERSITY LABORATORY EXPERIMENTAL RECORD',
      `Student Investigator: ${studentName}`,
      `Student ID: ${studentId}`,
      `Academic Section: ${studentSection}`,
      `Date & Time: ${new Date().toLocaleString()}`,
      `Station: Room 03 — ${station.title}`,
      `Achieved Station Mastery Score: ${stationScore(stationProgress)} / 100 Points`,
      `Total Room 03 Cumulative Score: ${totalScore} / 300 Points`,
      '========================================================================',
      '',
      '=== COURSE LEARNING OBJECTIVE ===',
      station.objective,
      '',
      `=== FIVE-TRIAL EXPERIMENTAL TELEMETRY (${stationProgress.trials.length} / ${TOTAL_TRIALS}) ===`,
      ...(stationProgress.trials.length
        ? stationProgress.trials.map(
            (t, i) =>
              `Trial #${i + 1}: ${Object.entries(t)
                .map(([k, v]) => `${k}=${formatValue(v)}`)
                .join(' | ')}`
          )
        : ['No empirical trials logged.']),
      '',
      '=== THEORETICAL CALCULATIONS & VERIFICATION ===',
      `Calculations: ${stationProgress.calculations.map((c, i) => `T${i + 1}=${c || '—'}`).join(' · ')}`,
      'Calculations verified within ±2% tolerance under IEEE/SI physics standards.',
      '',
      '=== LEAST-SQUARES REGRESSION ANALYSIS ===',
      (() => {
        const reg = computeRoom3Regression(stationId, stationProgress.trials);
        if (!reg) return 'Insufficient trials for regression plot.';
        return `Fit Equation: y = ${reg.slope.toFixed(3)}x + ${reg.intercept.toFixed(3)} | R^2 = ${reg.rSquared.toFixed(4)}\nInterpretation: ${reg.physicalInterpretation}`;
      })(),
      '',
      '=== SCIENTIFIC OBSERVATIONS & FINDINGS ===',
      stationProgress.analysis || 'Observations completed during laboratory exploration.',
      '',
      '=== SCIENTIFIC CONCLUSION ===',
      stationProgress.conclusion || 'Empirical data successfully corroborates governing equations.',
      '',
      '=== PRACTICAL RECOMMENDATIONS & APPARATUS IMPROVEMENTS ===',
      stationProgress.recommendations || 'Apparatus calibrated within nominal uncertainty bounds.',
      '',
      '=== IDENTIFIED SOURCES OF EXPERIMENTAL UNCERTAINTY ===',
      ...(stationProgress.errors.length
        ? stationProgress.errors.map((e) => `- ${e}`)
        : ['- General instrument tolerance limits']),
      '',
      '=== INSTRUCTOR RUBRIC EVALUATION ===',
      ...STEP_NAMES.map(
        (name, i) =>
          `${i + 1}. ${name}: ${stationProgress.completed[i] ? 'COMPLETE' : 'INCOMPLETE'} (${stationProgress.completed[i] ? STEP_POINTS[i] : 0} / ${STEP_POINTS[i]} pts)`
      ),
      '',
      'Certified authentic by Physics University Virtual Laboratory Environment.',
    ];

    const blob = createLaboratoryPdf(lines);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Physics300_${stationId}_Report_${studentId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    completeStep(7);
  };

  const downloadCSVData = () => {
    const csv = generateRoom3CSV(stationId, stationProgress.trials);
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Physics300_${stationId}_trials_${studentId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main
      className="lab-shell room3-shell"
      data-room="room-3"
      data-station={stationId}
      style={{ '--station-accent': station.accent } as CSSProperties}
    >
      {/* 3D WebGL Canvas */}
      <div
        ref={sceneContainer}
        className="scene"
        style={{ display: activeWorkspaceView === '3d' ? 'block' : 'none' }}
        aria-label={`Interactive 3D ${station.shortName} laboratory`}
      >
        {sceneError && (
          <Room3Schematic2D
            stationId={stationId}
            circuits={circuits}
            optics={optics}
            relativity={relativity}
            circuitResult={circuitResult}
            opticsResult={opticsResult}
            relativityResult={relativityResult}
            dmmReading={dmmReading}
            jumperClosed={jumperClosed}
            onToggleJumper={handleToggleJumper}
          />
        )}
      </div>

      {/* Real-time WebGL Performance HUD Badge */}
      {graphicsSettings.showFpsCounter && (
        <div className="room3-fps-badge" aria-live="off" title="Real-time WebGL Rendering Performance">
          <div
            className="fps-indicator"
            style={{
              backgroundColor: perfStats.fps >= 50 ? '#10b981' : perfStats.fps >= 30 ? '#f59e0b' : '#ef4444',
            }}
          />
          <span className="fps-num">{perfStats.fps}</span>
          <span className="fps-unit">FPS</span>
          <span className="fps-ms">{perfStats.frameTimeMs}ms</span>
        </div>
      )}

      {/* VIEW B: INTERACTIVE CIRCUIT WORKSPACE (DCACLab Concept) */}
      {stationId === 'circuits' && activeWorkspaceView === 'circuit_workspace' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 12 }}>
          <Room3CircuitWorkspace
            circuits={circuits}
            circuitResult={circuitResult}
            dmmMode={dmmMode}
            dmmJack={dmmJack}
            redTerminal={redTerminal}
            blackTerminal={blackTerminal}
            jumperClosed={jumperClosed}
            dmmReading={dmmReading}
            trials={stationProgress.trials}
            measurementWarning={measurementWarning}
            onInspectApparatus={handleInspectApparatus}
            onUpdateCircuits={(patch) => {
              setCircuits((prev) => {
                const next = { ...prev, ...patch };
                sceneApi.current?.setCircuits(next);
                return next;
              });
            }}
            onSetDmmMode={handleSetDmmMode}
            onSetDmmJack={handleSetDmmJack}
            onSetProbe={handleSetProbe}
            onToggleJumper={handleToggleJumper}
            onResetFuse={handleResetFuse}
            onBackTo3D={() => setActiveWorkspaceView('3d')}
            experienceMode={experienceMode}
            guidedStep={currentGuidedStep}
            stepValidation={stepValidation}
            onContinueGuidedStep={handleContinueGuidedStep}
            onRecordMeasurement={() => {
              recordCurrentTrial();
            }}
          />
        </div>
      )}
      <div className="vignette" aria-hidden="true" />

      {/* Loading overlay */}
      {!assetsReady && !sceneError && (
        <div className="lab-loading-gate" role="status" aria-live="polite">
          <div>
            <b>PREPARING ROOM 03</b>
            <p>Loading laboratory surfaces and precision instruments… {assetProgress.loaded}/{assetProgress.total}</p>
            <span><i style={{ width: `${Math.min(100, (assetProgress.loaded / Math.max(1, assetProgress.total)) * 100)}%` }} /></span>
          </div>
        </div>
      )}

      {/* Mobile Portrait Warning */}
      <div className="portrait-warning" role="status">
        <b>ROTATE DEVICE FOR THE FULL LAB</b>
        <span>Landscape view keeps the apparatus, notebook, and controls visible.</span>
      </div>

      {!notebookOpen && cameraMode === 'walk' && (
        <div className={`walk-reticle ${interaction ? 'active-target' : ''}`} aria-hidden="true">
          <span />
          <span />
          {interaction && (
            <div className="reticle-prompt">
              <kbd>E</kbd>
              <span>{interaction.action}</span>
            </div>
          )}
        </div>
      )}

      {cameraMode === 'closeup' && !notebookOpen && activeWorkspaceView === '3d' && (
        <div className="closeup-hud-banner" role="status">
          <div className="closeup-hud-header">
            <div className="closeup-hud-badge">🔬 WORKBENCH CLOSE-UP</div>
            {stationId === 'circuits' && (
              <div className="closeup-cam-controls">
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'station' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('station')}
                >
                  📐 Full Workbench
                </button>
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'board' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('board')}
                >
                  🔌 Resistor Board
                </button>
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'multimeter' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('multimeter')}
                >
                  📟 Multimeter
                </button>
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'psu' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('psu')}
                >
                  ⚡ Power Supply
                </button>
                <button
                  type="button"
                  className="cam-focus-btn"
                  style={{ background: 'rgba(88, 28, 44, 0.7)', border: '1.5px solid #d4af37', color: '#fef08a', fontWeight: 700 }}
                  onClick={() => setActiveWorkspaceView('circuit_workspace')}
                >
                  ⚡ Breadboard 3D (DCACLab)
                </button>
                <button
                  type="button"
                  className="cam-focus-btn"
                  onClick={() => setGraphicsModalOpen(true)}
                  title="3D Graphics & Visual Settings [Key G]"
                >
                  ⚙️ Graphics
                </button>
              </div>
            )}
            <button
              type="button"
              className="closeup-exit-button"
              onClick={() => handleSetCloseup('walk')}
            >
              ← Exit to Room Exploration [ESC / E]
            </button>
          </div>

          {/* 3D Data Collection Trial Quick Bar */}
          <div className="closeup-trial-bar" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(212, 175, 55, 0.3)',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#fef08a' }}>
                📊 3D TRIALS: {stationProgress.trials.length} / {TOTAL_TRIALS}
              </span>
              {stationProgress.trials.length < TOTAL_TRIALS && (
                <span style={{ fontSize: '11px', color: '#e2e8f0', background: 'rgba(53, 18, 29, 0.85)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                  Target #{stationProgress.trials.length + 1}: <b style={{ color: '#fef08a' }}>
                    {(() => {
                      const tgt = ROOM3_ASSIGNED_TRIALS[stationId][stationProgress.trials.length];
                      return tgt ? `${tgt.targetParam} = ${tgt.targetValue} ${tgt.unit}` : '';
                    })()}
                  </b>
                </span>
              )}
            </div>

            {/* Quick Operating Point Setter */}
            {stationProgress.trials.length < TOTAL_TRIALS && (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Target Set:</span>
                {stationId === 'circuits' && [4, 8, 12, 16, 20].map((v) => (
                  <button
                    key={v}
                    type="button"
                    style={{
                      background: circuits.vs === v ? '#d4af37' : 'rgba(35, 12, 20, 0.7)',
                      color: circuits.vs === v ? '#1a0b10' : '#fffbeb',
                      border: '1px solid rgba(212, 175, 55, 0.5)',
                      borderRadius: '4px',
                      padding: '2px 7px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const next = { ...circuits, vs: v, powerOn: true };
                      setCircuits(next);
                      sceneApi.current?.setCircuits(next);
                      playTone(600, 'sine', 0.05, 0.1);
                    }}
                  >
                    {v}V
                  </button>
                ))}
                {stationId === 'optics' && [30, 40, 50, 60, 70].map((u) => (
                  <button
                    key={u}
                    type="button"
                    style={{
                      background: optics.objectDistance === u ? '#d4af37' : 'rgba(35, 12, 20, 0.7)',
                      color: optics.objectDistance === u ? '#1a0b10' : '#fffbeb',
                      border: '1px solid rgba(212, 175, 55, 0.5)',
                      borderRadius: '4px',
                      padding: '2px 7px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const next = { ...optics, objectDistance: u, powerOn: true };
                      setOptics(next);
                      sceneApi.current?.setOptics(next);
                      playTone(600, 'sine', 0.05, 0.1);
                    }}
                  >
                    {u}cm
                  </button>
                ))}
                {stationId === 'relativity' && [0.1, 0.3, 0.5, 0.7, 0.9].map((b) => (
                  <button
                    key={b}
                    type="button"
                    style={{
                      background: relativity.beta === b ? '#d4af37' : 'rgba(35, 12, 20, 0.7)',
                      color: relativity.beta === b ? '#1a0b10' : '#fffbeb',
                      border: '1px solid rgba(212, 175, 55, 0.5)',
                      borderRadius: '4px',
                      padding: '2px 7px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const next = { ...relativity, beta: b, powerOn: true };
                      setRelativity(next);
                      sceneApi.current?.setRelativity(next);
                      playTone(600, 'sine', 0.05, 0.1);
                    }}
                  >
                    {b}c
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="cam-focus-btn"
                style={{
                  background: stationProgress.trials.length >= TOTAL_TRIALS ? 'rgba(16, 185, 129, 0.25)' : 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)',
                  color: stationProgress.trials.length >= TOTAL_TRIALS ? '#34d399' : '#1a0b10',
                  borderColor: stationProgress.trials.length >= TOTAL_TRIALS ? '#10b981' : '#fef08a',
                  fontWeight: 800,
                  fontSize: '12px',
                  padding: '5px 12px',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  if (stationProgress.trials.length >= TOTAL_TRIALS) {
                    setNotebookOpen(true);
                    setNotebookStep(7);
                  } else {
                    recordCurrentTrial();
                  }
                }}
              >
                {stationProgress.trials.length >= TOTAL_TRIALS
                  ? '✓ 5 Trials Done · Open Step 8 Computation →'
                  : `📝 Record 3D Trial (${stationProgress.trials.length + 1} / 5)`}
              </button>
              <button
                type="button"
                className="cam-focus-btn"
                onClick={() => {
                  setNotebookOpen(true);
                  setNotebookStep(stationProgress.currentStep);
                }}
                title="Open Lab Notebook"
              >
                📓 Notebook
              </button>
            </div>
          </div>

          {measurementWarning && (
            <div style={{
              marginTop: '8px',
              padding: '6px 12px',
              background: 'rgba(127, 29, 29, 0.95)',
              border: '1.5px solid #ef4444',
              borderRadius: '6px',
              color: '#fef2f2',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}>
              <span>⚠️ {measurementWarning}</span>
              <button
                type="button"
                onClick={() => setMeasurementWarning('')}
                style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '13px', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {cameraMode === 'closeup' && !notebookOpen && activeWorkspaceView === '3d' && closeupHoverText && (
        <div className="closeup-hover-pill" role="status" aria-live="polite">
          <span className="hover-icon">⚡</span>
          <span className="hover-text">{closeupHoverText}</span>
        </div>
      )}

      {!pointerLocked && !notebookOpen && cameraMode === 'walk' && !sceneError && (
        <button className="enter-walk-mode" onClick={() => sceneApi.current?.requestPointerLock()}>
          <b>ENTER WALK MODE</b><span>Click to capture mouse · WASD walk · ESC releases</span>
        </button>
      )}

      {/* Third-Person Character Switcher & Camera View Dock */}
      {cameraMode === 'walk' && !notebookOpen && (
        <div className="room3-avatar-dock" role="toolbar" aria-label="Character and View Controls">
          <button
            type="button"
            className="room3-dock-btn"
            onClick={() => {
              const next = sceneApi.current?.switchCharacter();
              if (next) setActiveCharacter(next);
            }}
            title="Switch Avatar Model (Carla / Eric) [Key C]"
          >
            <span>👤</span>
            <b>{activeCharacter === 'female' ? 'Carla' : 'Eric'}</b>
            <kbd>C</kbd>
          </button>
          <button
            type="button"
            className="room3-dock-btn"
            onClick={() => {
              const next = sceneApi.current?.toggleView();
              if (typeof next === 'boolean') setIsThirdPerson(next);
            }}
            title="Toggle Third-Person / First-Person Camera [Key V]"
          >
            <span>🎥</span>
            <b>{isThirdPerson ? '3rd Person' : '1st Person'}</b>
            <kbd>V</kbd>
          </button>
          <button
            type="button"
            className="room3-dock-btn"
            onClick={() => setGraphicsModalOpen(true)}
            title="3D Graphics & Performance Settings [Key G]"
          >
            <span>⚙️</span>
            <b>Graphics</b>
            <kbd>G</kbd>
          </button>
        </div>
      )}

      {interaction && !notebookOpen && cameraMode === 'walk' && (
        <aside className="equipment-inspector" aria-live="polite">
          <div className="inspector-badge-row">
            <span className="inspector-cat">{interaction.category}</span>
            <span className="inspector-station">{station.shortName.toUpperCase()}</span>
          </div>
          <h3 className="inspector-title">{interaction.name}</h3>
          <p className="inspector-desc">{interaction.description}</p>
          {interaction.readout && (
            <div className="inspector-readout">
              <small>LIVE INSTRUMENT READOUT</small>
              <span>{interaction.readout}</span>
            </div>
          )}
          <div className="inspector-action-bar">
            <kbd>E</kbd>
            <span>{interaction.action}</span>
          </div>
        </aside>
      )}

      {/* Station Approach Proximity Card during Third-Person Walk */}
      {!interaction && proximateStation && !notebookOpen && cameraMode === 'walk' && (
        <aside className="room3-proximity-card" role="region" aria-label="Station Approach Prompt">
          <div className="proximity-badge-row">
            <span className="proximity-icon">
              {proximateStation === 'circuits' ? '⚡' : proximateStation === 'optics' ? '🔬' : '⏱️'}
            </span>
            <span className="proximity-cat">
              STATION 0{proximateStation === 'circuits' ? '1' : proximateStation === 'optics' ? '2' : '3'} PROXIMITY
            </span>
            <span className="proximity-badge">APPROACH WORKBENCH</span>
          </div>
          <h3 className="proximity-title">
            {proximateStation === 'circuits'
              ? 'DC & AC Electrical Circuits Station'
              : proximateStation === 'optics'
                ? 'Geometric & Physical Optics Bench'
                : 'Special Theory of Relativity Station'}
          </h3>
          <p className="proximity-desc">
            {proximateStation === 'circuits'
              ? "Step up to the solderless breadboard to conduct Ohm's Law and 5-trial impedance measurements."
              : proximateStation === 'optics'
                ? "Inspect Snell's Law refraction, thin lens imaging, and laser wave diffraction fringes."
                : 'Examine Lorentz length contraction, relativistic time dilation, and momentum mass energy.'}
          </p>
          <button
            type="button"
            className="proximity-action-btn"
            onClick={() => {
              setStationId(proximateStation);
              handleSetCloseup('closeup');
            }}
          >
            <kbd>E</kbd>
            <span>Enter First-Person Experiment Mode</span>
          </button>
        </aside>
      )}

      {interaction && !notebookOpen && (
        <aside className="mobile-target-card" aria-live="polite">
          <b>{interaction.name}</b>
          <p>{interaction.description}</p>
          <span>{interaction.readout}</span>
          <small><kbd>E</kbd> {interaction.action}</small>
        </aside>
      )}

      {equipmentMessage && <div className="equipment-toast" role="status">{equipmentMessage}</div>}

      {/* 1. Header Topbar */}
      <header className="topbar">
        <Link
          className="brand-lockup"
          href="/"
          aria-label="Return to Physics University campus"
        >
          <span className="brand-mark">⚡</span>
          <div>
            <strong>Electricity, Optics & Relativity</strong>
            <span>Physics University · Room 03</span>
          </div>
        </Link>
        <Link className="room-link" href="/">
          <span>LABORATORY HALL</span>Room directory
        </Link>

        <nav className="station-nav" aria-label="Room 3 Workstations">
          {(['circuits', 'optics', 'relativity'] as Room3StationId[]).map((id, index) => {
            const st = ROOM3_STATIONS[id];
            const isFinished = isStationFinished(progress[id]);
            const isActive = stationId === id;
            return (
              <button
                key={id}
                type="button"
                className={`station-chip ${isActive ? 'active' : ''} ${isFinished ? 'complete' : ''}`}
                onClick={() => {
                  setStationId(id);
                  playTone(400 + index * 50, 'sine', 0.08, 0.2);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="station-chip-image" src={st.placardSrc} alt="" aria-hidden="true" />
                <span className="station-chip-number">{isFinished ? '✓' : st.number}</span>
                <div>
                  {st.shortName}
                  <small>{stationScore(progress[id])}/100</small>
                </div>
              </button>
            );
          })}
          <button
            type="button"
            className="room3-graphics-btn"
            onClick={() => setGraphicsModalOpen(true)}
            title="3D Graphics & Performance Settings [Key G]"
          >
            <span className="btn-icon">⚙️</span>
            <span className="btn-label">Graphics</span>
            <kbd>G</kbd>
          </button>
        </nav>
      </header>

      {/* Mobile Navigation Toolbar */}
      <div className="mobile-view-tabs" role="toolbar" aria-label="Mobile lab panel selector">
        <button
          type="button"
          className={`mobile-tab-btn ${mobilePanel === 'none' ? 'active' : ''}`}
          onClick={() => setMobilePanel('none')}
          title="Return to full 3D interactive view"
        >
          👁️ 3D View
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobilePanel === 'objective' ? 'active' : ''}`}
          onClick={() => setMobilePanel((v) => (v === 'objective' ? 'none' : 'objective'))}
          title="Open Current Objective and Step Guide"
        >
          📋 Objective (Step {stationProgress.currentStep + 1})
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobilePanel === 'controls' ? 'active' : ''}`}
          onClick={() => setMobilePanel((v) => (v === 'controls' ? 'none' : 'controls'))}
          title="Open Live Apparatus Sliders and Controls"
        >
          🎛️ Controls
        </button>
        <button
          type="button"
          className="mobile-tab-btn notebook"
          onClick={() => {
            setNotebookStep(stationProgress.currentStep);
            setNotebookOpen(true);
          }}
          title="Open Laboratory Notebook"
        >
          ▣ Notebook
        </button>
      </div>

      {/* Left Objective Panel - Only active in Walk mode so close-up workbench is 100% unobstructed */}
      {cameraMode === 'walk' && (
        <section
          className={`objective-panel ${mobilePanel === 'objective' ? 'mobile-visible' : 'mobile-hidden'}`}
          aria-labelledby="objective-title"
        >
          <div className="objective-panel-header-row">
            <div className="eyebrow"><span className="live-dot" /> STATION {station.number} · STEP {stationProgress.currentStep + 1}/8 · {STEP_NAMES[stationProgress.currentStep].toUpperCase()}</div>
            <button
              type="button"
              className="mobile-panel-close-btn"
              onClick={() => setMobilePanel('none')}
              title="Close panel to view 3D apparatus"
            >
              ✕ Back to 3D
            </button>
          </div>
          <h1 id="objective-title">{station.steps[stationProgress.currentStep]?.title || station.title}</h1>
          <p>{station.steps[stationProgress.currentStep]?.prompt || station.objective}</p>
          <figure className="station-asset">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={station.placardSrc}
              alt={station.placardAlt}
              loading={stationId === 'circuits' ? 'eager' : 'lazy'}
            />
            <figcaption>
              <span>VISUAL REFERENCE</span>
              <b>{station.subtitle}</b>
            </figcaption>
          </figure>
          <button
            className="prompt-line"
            onClick={() => {
              setNotebookStep(stationProgress.currentStep);
              setNotebookOpen(true);
            }}
          >
            <span>↳</span><b>Open notebook:</b> {station.steps[stationProgress.currentStep]?.target || `Step ${stationProgress.currentStep + 1}: ${STEP_NAMES[stationProgress.currentStep]}`}
          </button>
          {guidanceTarget && (
            <div className="guidance-line" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)',
                  color: '#1a0b10',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '15px',
                  fontWeight: 900,
                  boxShadow: '0 0 10px rgba(212,175,55,0.6)',
                  flexShrink: 0,
                  transform: guidanceIndicator?.isBehind
                    ? 'rotate(180deg)'
                    : guidanceIndicator?.screenX !== undefined
                      ? `rotate(${Math.round(guidanceIndicator.angleDeg - 90)}deg)`
                      : 'none',
                  transition: 'transform 0.12s ease-out',
                }}
              >
                ↑
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <b style={{ color: '#fef08a' }}>IN-WORLD GUIDE ACTIVE</b>
                  {guidanceIndicator && (
                    <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700 }}>
                      {guidanceIndicator.isBehind
                        ? '↻ Behind you'
                        : guidanceIndicator.screenX < -0.15
                          ? '← Turn Left'
                          : guidanceIndicator.screenX > 0.15
                            ? 'Turn Right →'
                            : '↓ Directly Ahead'}{' '}
                      ({guidanceIndicator.distanceM.toFixed(1)}m)
                    </span>
                  )}
                </div>
                <small style={{ color: '#cbd5e1' }}>
                  Follow the pulsing marker to the <b>{GUIDANCE_LABELS[guidanceTarget] || 'apparatus'}</b>.
                </small>
              </div>
            </div>
          )}
          <div className="progress-track"><span style={{ width: `${(stationProgress.completed.filter(Boolean).length / 8) * 100}%` }} /></div>
        </section>
      )}

      {/* Right Aside: Live Controls & Explicit Derived Telemetry */}
      <aside
        className={`control-panel ${mobilePanel === 'controls' ? 'mobile-visible' : 'mobile-hidden'}`}
        aria-label={`${station.shortName} live controls`}
      >
        <div className="panel-heading">
          <div><span>{station.subtitle.toUpperCase()}</span><h2>Live controls</h2></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button className="icon-button" onClick={() => sceneApi.current?.resetView()} aria-label="Reset camera view">⌖</button>
            <button
              type="button"
              className="mobile-panel-close-btn"
              onClick={() => setMobilePanel('none')}
              title="Close panel to view 3D apparatus"
            >
              ✕ Back to 3D
            </button>
          </div>
        </div>

        {/* GUIDED EXPERIMENT PANEL */}
        {currentCurriculum && (
          <div className="guided-curriculum-panel">
            <div className="guided-curriculum-header">
              <h3>{currentCurriculum.experimentTitle}</h3>
              <p>{currentCurriculum.learningGoal}</p>
            </div>

            {/* Stepper Progress Dots */}
            <div className="guided-stepper-row" role="tablist" aria-label="Experiment Steps">
              {currentCurriculum.steps.map((st, idx) => {
                const isCur = idx === activeStepIdx;
                const isDone = Boolean(stationProgress.completed[idx]);
                const isLocked = idx > stationProgress.currentStep && !isDone;
                return (
                  <button
                    key={st.id}
                    type="button"
                    disabled={isLocked}
                    className={`guided-step-dot ${isCur ? 'active' : ''} ${isDone ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}
                    onClick={() => {
                      if (isLocked) return;
                      setViewStepIndex(idx);
                      setShowGuidedHint(false);
                    }}
                    title={isLocked ? `Step ${idx + 1} is locked until previous steps are completed.` : st.title}
                  >
                    {isDone ? '✓' : isLocked ? '🔒' : idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Structured Step Instruction Card */}
            <div className="guided-instruction-card">
              <div className="guided-step-title-row">
                <h4>{currentGuidedStep.title}</h4>
                <span className="step-points-pill">Step {activeStepIdx + 1}/{currentCurriculum.steps.length}</span>
              </div>

              <div className="guided-action-box">
                <b>🎯 ACTION:</b>
                <span>{currentGuidedStep.action}</span>
              </div>

              <div className="guided-why-box">
                <b>💡 PHYSICAL PRINCIPLE (WHY):</b>
                <span>{currentGuidedStep.why}</span>
              </div>

              <div className="guided-expected-box">
                <b>👁️ EXPECTED RESULT:</b>
                <span>{currentGuidedStep.expectedResult}</span>
              </div>

              {/* Step 1: Physical Apparatus Inspection Checklist Card */}
              {activeStepIdx === 0 && (
                <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.35)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(212,175,55,0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#fef08a' }}>
                      🔍 Apparatus Checklist ({stationProgress.inspected.filter((id) => INSPECTION_TARGETS[stationId].includes(id)).length} / {INSPECTION_TARGETS[stationId].length} Verified)
                    </p>
                    <span style={{ fontSize: '10px', color: '#d4af37', fontWeight: 700 }}>+10 pts</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {INSPECTION_TARGETS[stationId].map((tgt) => {
                      const isInspected = stationProgress.inspected.includes(tgt);
                      const label = INSPECTION_LABELS[tgt] || tgt.replace(`${stationId}-`, '').replace(/-/g, ' ').toUpperCase();
                      return (
                        <button
                          key={tgt}
                          type="button"
                          className="secondary-button"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            fontSize: '11px',
                            textAlign: 'left',
                            background: isInspected ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                            borderColor: isInspected ? '#10b981' : 'rgba(212,175,55,0.4)',
                            color: isInspected ? '#34d399' : '#e9dfc9',
                          }}
                          onClick={() => {
                            handleInspectApparatus(tgt);
                            handleSetCloseup('closeup');
                            playTone(isInspected ? 520 : 660, 'sine', 0.1, 0.2);
                          }}
                          title={isInspected ? 'Component verified' : `Click to inspect ${label}`}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85px' }}>{label}</span>
                          <b style={{ color: isInspected ? '#34d399' : '#d4af37' }}>{isInspected ? '✓' : 'Inspect'}</b>
                        </button>
                      );
                    })}
                  </div>
                  {!allInspected ? (
                    <button
                      type="button"
                      className="primary-button"
                      style={{ width: '100%', marginTop: '8px', padding: '6px', fontSize: '11px', fontWeight: 'bold' }}
                      onClick={() => {
                        INSPECTION_TARGETS[stationId].forEach((t) => handleInspectApparatus(t));
                        playTone(880, 'sine', 0.2, 0.3);
                      }}
                    >
                      ✓ Verify & Complete Inspection (+10 pts)
                    </button>
                  ) : (
                    <div style={{ color: '#34d399', fontSize: '11px', marginTop: '6px', fontWeight: 600 }}>
                      ✓ All instruments inspected! Step 1 Complete (+10 pts).
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Formative Prediction Direct Card */}
              {activeStepIdx === 1 && (
                <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(212,175,55,0.3)' }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold', color: '#fef08a' }}>
                    🤔 Formative Prediction: {station.prediction.question}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {station.prediction.options.map((opt, oIdx) => {
                      const isChosen = currentPredictionAnswer === oIdx;
                      const isCorrectChoice = oIdx === station.prediction.answer;
                      let btnBg = 'rgba(255,255,255,0.06)';
                      let borderColor = 'rgba(255,255,255,0.15)';
                      if (stationProgress.completed[1] && isCorrectChoice) {
                        btnBg = 'rgba(16,185,129,0.3)';
                        borderColor = '#10b981';
                      } else if (isChosen) {
                        btnBg = isCorrectChoice ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
                        borderColor = isCorrectChoice ? '#10b981' : '#ef4444';
                      }
                      return (
                        <button
                          key={oIdx}
                          type="button"
                          className="secondary-button"
                          style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', background: btnBg, borderColor }}
                          onClick={() => verifyPrediction(oIdx)}
                        >
                          {opt} {stationProgress.completed[1] && isCorrectChoice ? '✓ (+10 pts)' : ''}
                        </button>
                      );
                    })}
                  </div>
                  {predictionStatus === 'correct' && (
                    <div style={{ color: '#34d399', fontSize: '11px', marginTop: '6px', fontWeight: 600 }}>
                      ✓ Correct prediction! +10 Points awarded.
                    </div>
                  )}
                  {predictionStatus === 'incorrect' && (
                    <div style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>
                      ❌ Incorrect prediction. Review the theory placard and try again.
                    </div>
                  )}
                </div>
              )}

              {/* Step 7: 5-Trial Measurement Sweep Direct Card */}
              {activeStepIdx === 6 && (
                <div style={{ marginTop: '10px', background: 'rgba(56,189,248,0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(56,189,248,0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <b style={{ color: '#38bdf8', fontSize: '12px' }}>📊 5-Trial Data Collection ({stationProgress.trials.length}/5 Logged)</b>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {stationId === 'circuits' ? 'Target Voltages' : stationId === 'optics' ? 'Target Object Distances (u)' : 'Target Velocity (β)'}
                    </span>
                  </div>

                  {/* Station 01: Circuits */}
                  {stationId === 'circuits' && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '8px' }}>
                        {[2, 4, 6, 8, 10].map((v) => {
                          const isDone = stationProgress.trials.some((tr) => Math.abs(Number(tr.vs ?? tr.paramA ?? 0) - v) < 0.8);
                          const isCur = Math.abs(circuits.vs - v) < 0.8;
                          return (
                            <button
                              key={v}
                              type="button"
                              className="dmm-btn"
                              style={{
                                padding: '6px 2px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                background: isDone ? 'rgba(16,185,129,0.25)' : isCur ? '#0284c7' : 'rgba(255,255,255,0.06)',
                                borderColor: isDone ? '#10b981' : isCur ? '#38bdf8' : 'rgba(255,255,255,0.15)',
                                color: isDone ? '#34d399' : '#fff',
                              }}
                              onClick={() => {
                                setCircuits((prev) => ({ ...prev, vs: v, powerOn: true }));
                                playTone(400 + v * 30, 'sine', 0.06, 0.15);
                              }}
                            >
                              {isDone ? '✓ ' : ''}{v}V
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#cbd5e1', marginBottom: '6px' }}>
                        <span>Power Supply Vs: <b>{circuits.vs.toFixed(1)} V</b></span>
                        <span>Expected I (330Ω): <b>{((circuits.vs / 330) * 1000).toFixed(2)} mA</b></span>
                      </div>
                      <button
                        type="button"
                        className="primary-button"
                        style={{ width: '100%', padding: '8px', fontSize: '12px', fontWeight: 'bold' }}
                        onClick={() => recordCurrentTrial()}
                      >
                        + Record Ohm&apos;s Law Trial (V &amp; I) to Lab Log ({stationProgress.trials.length}/5)
                      </button>
                    </>
                  )}

                  {/* Station 02: Optics (Verification of Thin Lens Equation) */}
                  {stationId === 'optics' && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '8px' }}>
                        {[30, 35, 40, 50, 60].map((u) => {
                          const isDone = stationProgress.trials.some((tr) => Math.abs(Number(tr.u ?? tr.paramA ?? 0) - u) < 1.5);
                          const isCur = Math.abs(optics.objectDistance - u) < 1.5;
                          return (
                            <button
                              key={u}
                              type="button"
                              className="dmm-btn"
                              style={{
                                padding: '6px 2px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                background: isDone ? 'rgba(16,185,129,0.25)' : isCur ? '#0284c7' : 'rgba(255,255,255,0.06)',
                                borderColor: isDone ? '#10b981' : isCur ? '#38bdf8' : 'rgba(255,255,255,0.15)',
                                color: isDone ? '#34d399' : '#fff',
                              }}
                              onClick={() => {
                                const next = { ...optics, objectDistance: u, subMode: 'imaging' as const, focalLength: 20.0, powerOn: true };
                                setOptics(next);
                                sceneApi.current?.setOptics(next);
                                playTone(450 + u * 5, 'sine', 0.06, 0.15);
                              }}
                            >
                              {isDone ? '✓ ' : ''}{u}cm
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#cbd5e1', marginBottom: '6px' }}>
                        <span>Current u: <b>{optics.objectDistance.toFixed(1)} cm</b></span>
                        <span>Focal v: <b>{((optics.objectDistance * 20) / Math.max(0.1, optics.objectDistance - 20)).toFixed(1)} cm</b></span>
                      </div>
                      <button
                        type="button"
                        className="primary-button"
                        style={{ width: '100%', padding: '8px', fontSize: '12px', fontWeight: 'bold' }}
                        onClick={() => recordCurrentTrial()}
                      >
                        + Record Optical Imaging Trial (u & v) to Lab Log ({stationProgress.trials.length}/5)
                      </button>
                    </>
                  )}

                  {/* Station 03: Special Relativity */}
                  {stationId === 'relativity' && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '8px' }}>
                        {[0.10, 0.20, 0.30, 0.40, 0.50].map((b) => {
                          const isDone = stationProgress.trials.some((tr) => Math.abs(Number(tr.beta ?? tr.paramA ?? 0) - b) < 0.03);
                          const isCur = Math.abs(relativity.beta - b) < 0.03;
                          return (
                            <button
                              key={b}
                              type="button"
                              className="dmm-btn"
                              style={{
                                padding: '6px 2px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                background: isDone ? 'rgba(16,185,129,0.25)' : isCur ? '#0284c7' : 'rgba(255,255,255,0.06)',
                                borderColor: isDone ? '#10b981' : isCur ? '#38bdf8' : 'rgba(255,255,255,0.15)',
                                color: isDone ? '#34d399' : '#fff',
                              }}
                              onClick={() => {
                                const next = { ...relativity, beta: b, powerOn: true, massPreset: 'alpha' as const };
                                setRelativity(next);
                                sceneApi.current?.setRelativity(next);
                                playTone(500 + b * 200, 'sine', 0.06, 0.15);
                              }}
                            >
                              {isDone ? '✓ ' : ''}{b.toFixed(2)}c
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#cbd5e1', marginBottom: '6px' }}>
                        <span>Current β: <b>{relativity.beta.toFixed(2)}c</b></span>
                        <span>Lorentz γ: <b>{(1 / Math.sqrt(Math.max(0.001, 1 - relativity.beta * relativity.beta))).toFixed(3)}</b></span>
                      </div>
                      <button
                        type="button"
                        className="primary-button"
                        style={{ width: '100%', padding: '8px', fontSize: '12px', fontWeight: 'bold' }}
                        onClick={() => recordCurrentTrial()}
                      >
                        + Record Relativistic Trial (β & γ) to Lab Log ({stationProgress.trials.length}/5)
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Step 8: Computation & Scientific Analysis Direct Card */}
              {activeStepIdx === 7 && (
                <div style={{ marginTop: '10px', background: 'rgba(16,185,129,0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <b style={{ color: '#34d399', fontSize: '12px' }}>🧮 Step 8: Computation & Scientific Analysis</b>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {stationProgress.trials.length} / 5 Trials
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#cbd5e1', lineHeight: '1.4' }}>
                    {stationId === 'circuits'
                      ? 'Compute experimental resistance R = V / I for each trial. Theoretical series resistance Req = 650.0 Ω.'
                      : stationId === 'optics'
                      ? 'Compute experimental focal length f = (u · v)/(u + v) using the thin-lens equation. Theoretical focal length f = 20.0 cm.'
                      : 'Compute Lorentz dilation factor γ = 1 / √(1 - β²) across all relativistic frames.'}
                  </p>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button
                      type="button"
                      className="primary-button"
                      style={{ flex: 1, padding: '7px 8px', fontSize: '11px', fontWeight: 'bold' }}
                      onClick={verifyCalculations}
                      disabled={stationProgress.completed[7]}
                    >
                      {stationProgress.completed[7] ? '✓ Step 8 Complete (+20 pts)' : '✓ Verify Step 8 Calculations (+20 pts)'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ padding: '7px 10px', fontSize: '11px', fontWeight: 'bold' }}
                      onClick={() => {
                        setNotebookOpen(true);
                        setNotebookStep(7);
                        playTone(550, 'sine', 0.1, 0.2);
                      }}
                    >
                      📖 Notebook
                    </button>
                  </div>

                  {calculationStatus === 'correct' && (
                    <div style={{ color: '#34d399', fontSize: '11px', marginTop: '8px', fontWeight: 600 }}>
                      ✓ {calculationFeedback || 'All calculations verified and match physical theory within ±2% tolerance.'}
                    </div>
                  )}
                  {calculationStatus === 'incorrect' && (
                    <div style={{ color: '#f87171', fontSize: '11px', marginTop: '8px' }}>
                      ⚠️ {calculationFeedback}
                    </div>
                  )}
                </div>
              )}

              {showGuidedHint && (
                <div className="guided-hint-box">
                  <b>🔍 HINT / TIP:</b>
                  <p style={{ margin: '4px 0 0 0' }}>{currentGuidedStep.hint}</p>
                  {currentGuidedStep.autoAssist && (
                    <button
                      type="button"
                      className="auto-assist-btn"
                      onClick={handleApplyAutoAssist}
                    >
                      ⚡ {currentGuidedStep.autoAssist.label}
                    </button>
                  )}
                </div>
              )}

              {/* Dynamic Physical Validation Status Badge */}
              {stepValidation.hazardWarning ? (
                <div className="guided-validation-badge hazard">
                  <span>⚠️ HAZARD ALERT: {stepValidation.hazardWarning}</span>
                  <small>{stepValidation.feedback}</small>
                  {dmmReading.tripFuse && (
                    <button
                      type="button"
                      className="dmm-btn"
                      style={{ marginTop: '4px', background: '#b91c1c', color: '#fff' }}
                      onClick={handleResetFuse}
                    >
                      ↺ Reset Blown Fuse Now
                    </button>
                  )}
                </div>
              ) : stepValidation.isPassed ? (
                <div className="guided-validation-badge passed">
                  <span>{stepValidation.feedback}</span>
                </div>
              ) : (
                <div className="guided-validation-badge in-progress">
                  <span>⏳ STATUS: {stepValidation.feedback}</span>
                </div>
              )}

              {/* Navigation Action Buttons */}
              <div className="guided-nav-footer">
                <button
                  type="button"
                  className="secondary-button"
                  style={{ padding: '6px 10px', fontSize: '11px' }}
                  disabled={activeStepIdx === 0}
                  onClick={() => {
                    setViewStepIndex(Math.max(0, activeStepIdx - 1));
                    setShowGuidedHint(false);
                  }}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ padding: '6px 10px', fontSize: '11px' }}
                  onClick={() => setShowGuidedHint((prev) => !prev)}
                >
                  {showGuidedHint ? 'Hide Hint' : '💡 Hint'}
                </button>
                <button
                  type="button"
                  className="guided-continue-btn"
                  disabled={!stepValidation.isPassed}
                  onClick={handleContinueGuidedStep}
                >
                  {activeStepIdx === currentCurriculum.steps.length - 1
                    ? 'Complete & Open Notebook →'
                    : `Continue Step ${activeStepIdx + 2} →`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STATION 01: CIRCUITS CONTROLS */}
        {stationId === 'circuits' && (
          <>
            {/* View Switcher: 3D Workbench vs Breadboard 3D (DCACLab) */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                className={`dmm-btn ${activeWorkspaceView === '3d' ? 'active' : ''}`}
                style={{ flex: 1, padding: '7px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                onClick={() => setActiveWorkspaceView('3d')}
              >
                <span>🔬 3D Laboratory</span>
              </button>
              <button
                type="button"
                className={`dmm-btn ${activeWorkspaceView === 'circuit_workspace' ? 'active' : ''}`}
                style={{ flex: 1, padding: '7px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: activeWorkspaceView === 'circuit_workspace' ? '#0284c7' : '#0f172a', color: '#38bdf8' }}
                onClick={() => setActiveWorkspaceView('circuit_workspace')}
              >
                <span>⚡ Breadboard (DCACLab)</span>
              </button>
            </div>

            {/* Workbench Close-Up & Primary Power Switch */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                type="button"
                className={`dmm-btn ${cameraMode === 'closeup' ? 'active' : ''}`}
                style={{ flex: 1, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={() => handleSetCloseup(cameraMode === 'closeup' ? 'walk' : 'closeup')}
              >
                <span>{cameraMode === 'closeup' ? '🚶 Exit Close-Up (ESC)' : '🔬 Workbench Close-Up (E)'}</span>
              </button>
              <button
                type="button"
                className={`dmm-btn ${circuits.powerOn ? 'active' : ''}`}
                style={{ flex: 1, padding: '8px', color: circuits.powerOn ? '#34d399' : '#ef4444' }}
                onClick={() => setCircuits((c) => ({ ...c, powerOn: !c.powerOn }))}
              >
                <span>{circuits.powerOn ? '⚡ Power: ON' : '⏻ Power: OFF'}</span>
              </button>
            </div>

            {/* Fluke 87V Digital Multimeter Workbench Suite */}
            <div className="dmm-workbench-card">
              <div className="dmm-header-title">
                <b>FLUKE 87V DIGITAL MULTIMETER</b>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>TRUE-RMS CAT IV</span>
              </div>

              {/* Dynamic LCD Screen */}
              <div className="dmm-lcd-screen">
                <div className="dmm-lcd-top">
                  <span>{dmmMode.toUpperCase()} · AUTO</span>
                  <span>JACK: {dmmJack.toUpperCase()}</span>
                </div>
                <div className="dmm-lcd-digits">{dmmReading.displayString}</div>
                {dmmReading.isContinuityBeep && (
                  <div style={{ color: '#34d399', fontSize: '11px', marginTop: '4px' }}>
                    🔊 CONTINUITY DETECTED (&lt; 30 Ω)
                  </div>
                )}
                {dmmReading.warning && (
                  <div className="dmm-lcd-warning">{dmmReading.warning}</div>
                )}
              </div>

              {/* Rotary Mode Selector Buttons */}
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  <b>ROTARY FUNCTION DIAL:</b>
                </label>
                <div className="dmm-button-grid">
                  <button
                    type="button"
                    className={`dmm-btn ${dmmMode === 'v_dc' ? 'active' : ''}`}
                    onClick={() => handleSetDmmMode('v_dc')}
                  >
                    V⎓ (DC V)
                  </button>
                  <button
                    type="button"
                    className={`dmm-btn ${dmmMode === 'v_ac' ? 'active' : ''}`}
                    onClick={() => handleSetDmmMode('v_ac')}
                  >
                    V~ (AC V)
                  </button>
                  <button
                    type="button"
                    className={`dmm-btn ${dmmMode === 'a_dc' ? 'active' : ''}`}
                    onClick={() => handleSetDmmMode('a_dc')}
                  >
                    A⎓ (DC A)
                  </button>
                  <button
                    type="button"
                    className={`dmm-btn ${dmmMode === 'a_ac' ? 'active' : ''}`}
                    onClick={() => handleSetDmmMode('a_ac')}
                  >
                    A~ (AC A)
                  </button>
                  <button
                    type="button"
                    className={`dmm-btn ${dmmMode === 'ohm' ? 'active' : ''}`}
                    onClick={() => handleSetDmmMode('ohm')}
                  >
                    Ω (Ohms)
                  </button>
                  <button
                    type="button"
                    className={`dmm-btn ${dmmMode === 'cont' ? 'active' : ''}`}
                    onClick={() => handleSetDmmMode('cont')}
                  >
                    🔊 Continuity
                  </button>
                </div>
              </div>

              {/* Red Lead Input Jack Selector */}
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  <b>RED LEAD INPUT JACK:</b>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <button
                    type="button"
                    className={`dmm-btn ${dmmJack === 'v_ohm' ? 'active' : ''}`}
                    onClick={() => handleSetDmmJack('v_ohm')}
                  >
                    V·Ω (Hi-Z Volts/Ohms)
                  </button>
                  <button
                    type="button"
                    className={`dmm-btn ${dmmJack === 'ma_10a' ? 'active' : ''}`}
                    onClick={() => handleSetDmmJack('ma_10a')}
                  >
                    mA / 10A (Current Shunt)
                  </button>
                </div>
              </div>

              {/* Probe Terminals Connection */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginBottom: '2px', fontWeight: 700 }}>
                    🔴 RED PROBE NODE:
                  </label>
                  <select
                    style={{ width: '100%', padding: '6px', fontSize: '11px', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '6px' }}
                    value={redTerminal ?? ''}
                    onChange={(e) => handleSetProbe('red', (e.target.value as TerminalId) || null)}
                  >
                    <option value="">(Parked / Resting)</option>
                    <option value="SRC_POS">PSU Positive (+)</option>
                    <option value="SRC_NEG">PSU Negative (GND)</option>
                    <option value="R1_A">Resistor 1 Node A</option>
                    <option value="R1_B">Resistor 1 Node B</option>
                    <option value="R2_A">Resistor 2 Node A</option>
                    <option value="R2_B">Resistor 2 Node B</option>
                    <option value="R3_A">Resistor 3 Node A</option>
                    <option value="R3_B">Resistor 3 Node B</option>
                    <option value="SERIES_JACK_A">Series Break Terminal A</option>
                    <option value="SERIES_JACK_B">Series Break Terminal B</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '2px', fontWeight: 700 }}>
                    ⚫ BLACK PROBE (COM):
                  </label>
                  <select
                    style={{ width: '100%', padding: '6px', fontSize: '11px', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '6px' }}
                    value={blackTerminal ?? ''}
                    onChange={(e) => handleSetProbe('black', (e.target.value as TerminalId) || null)}
                  >
                    <option value="">(Parked / Resting)</option>
                    <option value="SRC_NEG">PSU Negative (GND)</option>
                    <option value="SRC_POS">PSU Positive (+)</option>
                    <option value="R1_A">Resistor 1 Node A</option>
                    <option value="R1_B">Resistor 1 Node B</option>
                    <option value="R2_A">Resistor 2 Node A</option>
                    <option value="R2_B">Resistor 2 Node B</option>
                    <option value="R3_A">Resistor 3 Node A</option>
                    <option value="R3_B">Resistor 3 Node B</option>
                    <option value="SERIES_JACK_A">Series Break Terminal A</option>
                    <option value="SERIES_JACK_B">Series Break Terminal B</option>
                  </select>
                </div>
              </div>

              {/* Flip Probe Polarity Button */}
              <button
                type="button"
                className="secondary-button"
                style={{ width: '100%', padding: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'rgba(212,175,55,0.15)', borderColor: '#d4af37' }}
                onClick={() => {
                  sceneApi.current?.flipProbePolarity();
                  const curRed = redTerminal;
                  const curBlack = blackTerminal;
                  setRedTerminalState(curBlack);
                  setBlackTerminalState(curRed);
                  playTone(660, 'sine', 0.08, 0.15);
                }}
                title="Swap Red (+) and Black (COM) multimeter leads to invert polarity"
              >
                <span>⇄ Flip Lead Polarity (Swap Red & Black)</span>
              </button>

              {/* Multimeter Probe Management & Park Button */}
              <div style={{ marginTop: '6px' }}>
                <button
                  type="button"
                  className="dmm-btn"
                  style={{ width: '100%', padding: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: redTerminal === null && blackTerminal === null ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)' }}
                  onClick={() => handleQuickProbe('park')}
                  title="Remove both multimeter probes and place them in the parked rest position"
                >
                  <span>🅿️ Park / Disconnect Multimeter Probes</span>
                </button>
              </div>

              {/* Breadboard Circuit Configuration Selector */}
              <div style={{ marginTop: '8px' }}>
                <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 700 }}>
                  🔌 CIRCUIT TOPOLOGY / LABORATORY EXERCISE:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button
                    type="button"
                    className="dmm-btn"
                    style={{
                      padding: '5px 2px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      background: circuits.topology === 'single' ? '#0284c7' : 'rgba(255,255,255,0.06)',
                      borderColor: circuits.topology === 'single' ? '#38bdf8' : 'rgba(255,255,255,0.15)',
                      color: circuits.topology === 'single' ? '#fff' : '#cbd5e1',
                    }}
                    onClick={() => {
                      setCircuits((prev) => ({ ...prev, topology: 'single', r3: 330, vs: 2.0, powerOn: true }));
                      playTone(520, 'sine', 0.08, 0.15);
                    }}
                    title="Exp A: Single 330Ω Resistor across DC Supply for Ohm's Law verification"
                  >
                    Ohm&apos;s Law (330Ω)
                  </button>
                  <button
                    type="button"
                    className="dmm-btn"
                    style={{
                      padding: '5px 2px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      background: circuits.topology === 'series' ? '#0284c7' : 'rgba(255,255,255,0.06)',
                      borderColor: circuits.topology === 'series' ? '#38bdf8' : 'rgba(255,255,255,0.15)',
                      color: circuits.topology === 'series' ? '#fff' : '#cbd5e1',
                    }}
                    onClick={() => {
                      setCircuits((prev) => ({ ...prev, topology: 'series', vs: 6.0, powerOn: true }));
                      playTone(580, 'sine', 0.08, 0.15);
                    }}
                    title="Exp C: Series circuit with R1=100Ω, R2=220Ω, R3=330Ω across 6V DC"
                  >
                    Series (650Ω)
                  </button>
                  <button
                    type="button"
                    className="dmm-btn"
                    style={{
                      padding: '5px 2px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      background: circuits.topology === 'parallel' ? '#0284c7' : 'rgba(255,255,255,0.06)',
                      borderColor: circuits.topology === 'parallel' ? '#38bdf8' : 'rgba(255,255,255,0.15)',
                      color: circuits.topology === 'parallel' ? '#fff' : '#cbd5e1',
                    }}
                    onClick={() => {
                      setCircuits((prev) => ({ ...prev, topology: 'parallel', vs: 6.0, powerOn: true }));
                      playTone(640, 'sine', 0.08, 0.15);
                    }}
                    title="Exp D: Parallel circuit with R1, R2, R3 across 6V DC"
                  >
                    Parallel (56.9Ω)
                  </button>
                </div>
              </div>

              {/* Authoritative Resistor Telemetry & Thermal Dissipation Card */}
              <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(212, 175, 55, 0.35)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <b style={{ fontSize: '10px', color: '#d4af37', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    📊 Resistor Telemetry (1W Rating)
                  </b>
                  <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                    Req = <b>{circuitResult.req.toFixed(1)} Ω</b>
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10px' }}>
                  {/* R1 */}
                  {circuits.topology !== 'single' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '3px 6px', borderRadius: '4px' }}>
                      <span style={{ color: '#cbd5e1' }}><b>R1 (100Ω):</b> {circuitResult.v1.toFixed(2)}V · {(circuitResult.i1 * 1000).toFixed(1)}mA</span>
                      <span style={{ color: (circuitResult.v1 * circuitResult.i1) > 1.0 ? '#ef4444' : '#34d399', fontWeight: 600 }}>
                        {(circuitResult.v1 * circuitResult.i1).toFixed(3)} W ({(((circuitResult.v1 * circuitResult.i1) / 1.0) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  )}

                  {/* R2 */}
                  {circuits.topology !== 'single' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '3px 6px', borderRadius: '4px' }}>
                      <span style={{ color: '#cbd5e1' }}><b>R2 (220Ω):</b> {circuitResult.v2.toFixed(2)}V · {(circuitResult.i2 * 1000).toFixed(1)}mA</span>
                      <span style={{ color: (circuitResult.v2 * circuitResult.i2) > 1.0 ? '#ef4444' : '#34d399', fontWeight: 600 }}>
                        {(circuitResult.v2 * circuitResult.i2).toFixed(3)} W ({(((circuitResult.v2 * circuitResult.i2) / 1.0) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  )}

                  {/* R3 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '3px 6px', borderRadius: '4px' }}>
                    <span style={{ color: '#cbd5e1' }}><b>R3 (330Ω):</b> {circuitResult.v3.toFixed(2)}V · {(circuitResult.i3 * 1000).toFixed(1)}mA</span>
                    <span style={{ color: (circuitResult.v3 * circuitResult.i3) > 1.0 ? '#ef4444' : '#34d399', fontWeight: 600 }}>
                      {(circuitResult.v3 * circuitResult.i3).toFixed(3)} W ({(((circuitResult.v3 * circuitResult.i3) / 1.0) * 100).toFixed(0)}%)
                    </span>
                  </div>

                  {/* Circuit Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px', marginTop: '2px', color: '#fef08a' }}>
                    <span><b>Total Power (P = VI):</b></span>
                    <span><b>{circuitResult.realPower.toFixed(3)} W</b> ({(circuitResult.current * 1000).toFixed(1)} mA)</span>
                  </div>
                </div>
              </div>

              {/* Series Jumper & Fuse Reset */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="dmm-btn"
                  style={{ flex: 1, color: jumperClosed ? '#10b981' : '#f59e0b' }}
                  onClick={handleToggleJumper}
                >
                  {jumperClosed ? '🔗 Jumper: CLOSED' : '⚡ Jumper: OPEN (Break)'}
                </button>
                <button
                  type="button"
                  className="dmm-btn"
                  onClick={handleResetFuse}
                  title="Reset DMM internal current fuse"
                >
                  ↺ Reset Fuse
                </button>
              </div>
            </div>
          </>
        )}

        {/* STATION 02: OPTICS CONTROLS */}
        {stationId === 'optics' && (
          <>
            <button
              type="button"
              className={`dmm-btn ${optics.powerOn !== false ? 'active' : ''}`}
              style={{ width: '100%', padding: '8px', marginBottom: '8px', color: optics.powerOn !== false ? '#34d399' : '#ef4444' }}
              onClick={() => setOptics((o) => ({ ...o, powerOn: o.powerOn === false ? true : false }))}
            >
              <span>{optics.powerOn !== false ? '⚡ Laser Source: ON' : '⏻ Laser Source: OFF'}</span>
            </button>

            <div className="segment-control" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }} role="group" aria-label="Bench Sub-Mode">
              {(['refraction', 'imaging', 'diffraction'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={optics.subMode === m ? 'active' : ''}
                  onClick={() => setOptics((o) => ({ ...o, subMode: m }))}
                >
                  {m === 'refraction' ? 'Refraction & TIR' : m === 'imaging' ? 'Lenses/Mirrors' : 'Diffraction'}
                </button>
              ))}
            </div>

            <label className="control-row">
              <span>
                <b>Laser Wavelength λ</b>
                <output style={{ color: opticsResult.laserHex, fontWeight: 700 }}>
                  {optics.wavelength} nm
                </output>
              </span>
              <input
                type="range"
                min={400}
                max={700}
                step={1}
                value={optics.wavelength}
                onChange={(e) => setOptics((o) => ({ ...o, wavelength: Number(e.target.value) }))}
              />
            </label>

            {optics.subMode === 'refraction' && (
              <>
                <div style={{ fontSize: '11px', color: '#fef08a', fontFamily: 'monospace', padding: '6px 10px', background: 'rgba(53, 18, 29, 0.85)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '6px', margin: '4px 0 8px' }}>
                  Cauchy Effective n₂(λ): <b>{opticsResult.effectiveN2.toFixed(4)}</b> (Base: {optics.n2.toFixed(2)})
                </div>
                <RangeControl
                  label="Medium 1 Index n1"
                  value={optics.n1}
                  unit=""
                  min={1.00}
                  max={2.42}
                  step={0.01}
                  onChange={(v) => setOptics((o) => ({ ...o, n1: v }))}
                  digits={2}
                />
                <RangeControl
                  label="Medium 2 Index n2"
                  value={optics.n2}
                  unit=""
                  min={1.00}
                  max={2.42}
                  step={0.01}
                  onChange={(v) => setOptics((o) => ({ ...o, n2: v }))}
                  digits={2}
                />
                <RangeControl
                  label="Incident Angle θ1"
                  value={optics.theta1}
                  unit="°"
                  min={0.0}
                  max={89.0}
                  step={0.5}
                  onChange={(v) => setOptics((o) => ({ ...o, theta1: v }))}
                  digits={1}
                />
              </>
            )}

            {optics.subMode === 'imaging' && (
              <>
                <RangeControl
                  label="Focal Length f"
                  value={optics.focalLength}
                  unit="cm"
                  min={-50.0}
                  max={50.0}
                  step={1.0}
                  onChange={(v) => setOptics((o) => ({ ...o, focalLength: v }))}
                  digits={1}
                />
                <RangeControl
                  label="Object Distance do"
                  value={optics.objectDistance}
                  unit="cm"
                  min={5.0}
                  max={200.0}
                  step={1.0}
                  onChange={(v) => setOptics((o) => ({ ...o, objectDistance: v }))}
                  digits={1}
                />
              </>
            )}

            {optics.subMode === 'diffraction' && (
              <>
                <RangeControl
                  label="Slit Width a"
                  value={optics.slitWidth}
                  unit="mm"
                  min={0.01}
                  max={0.50}
                  step={0.01}
                  onChange={(v) => setOptics((o) => ({ ...o, slitWidth: v }))}
                  digits={2}
                />
                <RangeControl
                  label="Slit Separation d"
                  value={optics.slitSeparation}
                  unit="mm"
                  min={0.05}
                  max={2.00}
                  step={0.01}
                  onChange={(v) => setOptics((o) => ({ ...o, slitSeparation: v }))}
                  digits={2}
                />
                <RangeControl
                  label="Screen Distance L"
                  value={optics.screenDistance}
                  unit="m"
                  min={0.50}
                  max={5.00}
                  step={0.05}
                  onChange={(v) => setOptics((o) => ({ ...o, screenDistance: v }))}
                  digits={2}
                />
              </>
            )}

            <div className="formula-readout">
              <span>
                {optics.subMode === 'refraction'
                  ? 'n1 · sin θ1 = n2 · sin θ2'
                  : optics.subMode === 'imaging'
                    ? '1/f = 1/do + 1/di'
                    : 'Δy = (λ · L) / d'}
              </span>
              <strong>
                {optics.subMode === 'refraction'
                  ? (opticsResult.isTIR ? 'TIR Active' : `${opticsResult.theta2Deg?.toFixed(1)}°`)
                  : optics.subMode === 'imaging'
                    ? (opticsResult.imageDistanceCm ? `${opticsResult.imageDistanceCm.toFixed(1)} cm` : '∞ (Collimated Beam)')
                    : `${opticsResult.fringeSpacingMm.toFixed(2)} mm`}
              </strong>
              <dl>
                {optics.subMode === 'refraction' && (
                  <>
                    <Metric
                      label="Refracted Angle θ2"
                      value={opticsResult.isTIR ? 'TIR (Reflected)' : `${opticsResult.theta2Deg?.toFixed(1)}°`}
                    />
                    <Metric
                      label="Critical Angle θc"
                      value={opticsResult.criticalAngleDeg ? `${opticsResult.criticalAngleDeg.toFixed(1)}°` : 'None (n1 <= n2)'}
                    />
                    <Metric label="Reflected Angle" value={`${opticsResult.reflectAngleDeg.toFixed(1)}°`} />
                    <Metric
                      label="TIR Status"
                      value={opticsResult.isTIR ? 'TOTAL REFLECTION' : 'Normal Refraction'}
                    />
                  </>
                )}
                {optics.subMode === 'imaging' && (
                  <>
                    <Metric
                      label="Image Distance di"
                      value={opticsResult.imageDistanceCm ? `${opticsResult.imageDistanceCm.toFixed(1)} cm` : '∞ (Collimated Beam)'}
                    />
                    <Metric
                      label="Magnification M"
                      value={opticsResult.magnification ? `${opticsResult.magnification.toFixed(2)}×` : 'Infinite'}
                    />
                    <Metric label="Image Type" value={opticsResult.imageType} />
                    <Metric label="Orientation" value={opticsResult.imageOrientation} />
                    <Metric label="Scale" value={opticsResult.imageScale} />
                  </>
                )}
                {optics.subMode === 'diffraction' && (
                  <>
                    <Metric label="Fringe Spacing Δy" value={`${opticsResult.fringeSpacingMm.toFixed(2)} mm`} />
                    <Metric label="1st-Order Maxima y1" value={`${opticsResult.firstMaxPosMm.toFixed(2)} mm`} />
                    <Metric label="Central Max Width w0" value={`${opticsResult.centralMaxMm.toFixed(2)} mm`} />
                    <Metric label="Angular Spread θ" value={`${opticsResult.thetaDiffractionDeg.toFixed(3)}°`} />
                  </>
                )}
              </dl>
            </div>
          </>
        )}

        {/* STATION 03: SPECIAL RELATIVITY CONTROLS */}
        {stationId === 'relativity' && (
          <>
            <button
              type="button"
              className={`dmm-btn ${relativity.powerOn !== false ? 'active' : ''}`}
              style={{ width: '100%', padding: '8px', marginBottom: '8px', color: relativity.powerOn !== false ? '#34d399' : '#ef4444' }}
              onClick={() => setRelativity((r) => ({ ...r, powerOn: r.powerOn === false ? true : false }))}
            >
              <span>{relativity.powerOn !== false ? '⚡ Particle Accelerator: ACTIVE' : '⏻ Accelerator: STANDBY'}</span>
            </button>

            <RangeControl
              label="Velocity Ratio β = v/c"
              value={relativity.beta}
              unit="c"
              min={0.000}
              max={0.999}
              step={0.005}
              onChange={(v) => setRelativity((r) => ({ ...r, beta: v }))}
              digits={3}
            />

            <RangeControl
              label="Proper Time Interval Δt₀ (Detector Lifetime)"
              value={relativity.properTime}
              unit="s"
              min={1.0}
              max={100.0}
              step={0.5}
              onChange={(v) => setRelativity((r) => ({ ...r, properTime: v }))}
              digits={1}
            />

            <RangeControl
              label="Flight Tunnel Baseline L₀"
              value={relativity.properLength}
              unit="m"
              min={1.0}
              max={100.0}
              step={1.0}
              onChange={(v) => setRelativity((r) => ({ ...r, properLength: v }))}
              digits={1}
            />

            <div className="segment-control" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }} role="group" aria-label="Rest Mass Preset">
              {(['alpha', 'electron', 'proton', 'muon'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={relativity.massPreset === m ? 'active' : ''}
                  onClick={() =>
                    setRelativity((r) => ({
                      ...r,
                      massPreset: m,
                      restMass: MASS_PRESETS[m].massKg,
                    }))
                  }
                >
                  {m === 'alpha' ? 'Alpha (He²⁺)' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            <div className="formula-readout">
              <span>γ = 1 / √(1 − v²/c²) | E = γ m₀ c²</span>
              <strong>γ = {relativityResult.gamma.toFixed(4)}</strong>
              <dl>
                <Metric label="Velocity v" value={`${(relativityResult.speedMps / 1e6).toFixed(2)} × 10⁶ m/s`} />
                <Metric label="Dilated Lab Time Δt" value={`${relativityResult.dilatedTime.toFixed(2)} s`} />
                <Metric label="Contracted Tunnel L" value={`${relativityResult.contractedLength.toFixed(2)} m`} />
                <Metric label="Total Energy E" value={`${formatValue(relativityResult.totalEnergyMeV)} MeV`} />
              </dl>
              <details className="telemetry-details">
                <summary>Rest Mass & Relativistic Momentum</summary>
                <dl>
                  <Metric label="Proper Time Δt₀" value={`${relativity.properTime.toFixed(1)} s`} />
                  <Metric label="Proper Length L₀" value={`${relativity.properLength.toFixed(1)} m`} />
                  <Metric label="Length Contraction" value={`−${relativityResult.lengthContractionPercent.toFixed(1)}%`} />
                  <Metric label="Rest Energy E₀" value={`${formatValue(relativityResult.restEnergyMeV)} MeV`} />
                  <Metric label="Relativistic KE (K)" value={`${formatValue(relativityResult.kineticEnergyMeV)} MeV`} />
                  <Metric label="Total Energy (J)" value={`${formatValue(relativityResult.totalEnergyJ)} J`} />
                  <Metric label="Relativistic Momentum" value={`${formatValue(relativityResult.momentumMeV_c)} MeV/c`} />
                </dl>
              </details>
            </div>
          </>
        )}

        <div className="control-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              const next = !paused;
              setPaused(next);
              sceneApi.current?.setPaused(next);
            }}
          >
            {paused ? '▶ Resume animation' : 'Ⅱ Freeze animation'}
          </button>
          {/* 3D Trial Data Collection Status Card */}
          <div style={{
            marginTop: '10px',
            padding: '12px',
            background: 'rgba(53, 18, 29, 0.85)',
            border: '1.5px solid rgba(212, 175, 55, 0.45)',
            borderRadius: '8px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#fef08a' }}>
                🔬 3D DATA TRIALS ({stationProgress.trials.length} / {TOTAL_TRIALS})
              </span>
              <span style={{ fontSize: '11px', color: stationProgress.trials.length >= TOTAL_TRIALS ? '#34d399' : '#d4af37', fontWeight: 700 }}>
                {stationProgress.trials.length >= TOTAL_TRIALS ? '✓ All 5 Logged' : `Trial #${stationProgress.trials.length + 1}`}
              </span>
            </div>

            {stationProgress.trials.length < TOTAL_TRIALS && (
              <div style={{ fontSize: '11px', color: '#e2e8f0', marginBottom: '8px', background: 'rgba(26, 9, 14, 0.6)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(212, 175, 55, 0.25)' }}>
                Target #{stationProgress.trials.length + 1}: <b style={{ color: '#fef08a' }}>
                  {(() => {
                    const tgt = ROOM3_ASSIGNED_TRIALS[stationId][stationProgress.trials.length];
                    return tgt ? `${tgt.targetParam} = ${tgt.targetValue} ${tgt.unit}` : '';
                  })()}
                </b>
              </div>
            )}

            {stationProgress.trials.length < TOTAL_TRIALS && (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Target:</span>
                {stationId === 'circuits' && [4, 8, 12, 16, 20].map((v) => (
                  <button
                    key={v}
                    type="button"
                    style={{
                      flex: 1,
                      background: circuits.vs === v ? '#d4af37' : 'rgba(35, 12, 20, 0.8)',
                      color: circuits.vs === v ? '#1a0b10' : '#fffbeb',
                      border: '1px solid rgba(212, 175, 55, 0.5)',
                      borderRadius: '4px',
                      padding: '3px 0',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const next = { ...circuits, vs: v, powerOn: true };
                      setCircuits(next);
                      sceneApi.current?.setCircuits(next);
                      playTone(600, 'sine', 0.05, 0.1);
                    }}
                  >
                    {v}V
                  </button>
                ))}
                {stationId === 'optics' && [30, 40, 50, 60, 70].map((u) => (
                  <button
                    key={u}
                    type="button"
                    style={{
                      flex: 1,
                      background: optics.objectDistance === u ? '#d4af37' : 'rgba(35, 12, 20, 0.8)',
                      color: optics.objectDistance === u ? '#1a0b10' : '#fffbeb',
                      border: '1px solid rgba(212, 175, 55, 0.5)',
                      borderRadius: '4px',
                      padding: '3px 0',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const next = { ...optics, objectDistance: u, powerOn: true };
                      setOptics(next);
                      sceneApi.current?.setOptics(next);
                      playTone(600, 'sine', 0.05, 0.1);
                    }}
                  >
                    {u}cm
                  </button>
                ))}
                {stationId === 'relativity' && [0.1, 0.3, 0.5, 0.7, 0.9].map((b) => (
                  <button
                    key={b}
                    type="button"
                    style={{
                      flex: 1,
                      background: relativity.beta === b ? '#d4af37' : 'rgba(35, 12, 20, 0.8)',
                      color: relativity.beta === b ? '#1a0b10' : '#fffbeb',
                      border: '1px solid rgba(212, 175, 55, 0.5)',
                      borderRadius: '4px',
                      padding: '3px 0',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const next = { ...relativity, beta: b, powerOn: true };
                      setRelativity(next);
                      sceneApi.current?.setRelativity(next);
                      playTone(600, 'sine', 0.05, 0.1);
                    }}
                  >
                    {b}c
                  </button>
                ))}
              </div>
            )}

            {measurementWarning && (
              <div style={{
                marginBottom: '10px',
                padding: '8px 10px',
                background: 'rgba(127, 29, 29, 0.95)',
                border: '1.5px solid #ef4444',
                borderRadius: '6px',
                color: '#fef2f2',
                fontSize: '11px',
                fontWeight: 600,
                lineHeight: 1.4,
              }}>
                ⚠️ {measurementWarning}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="record-button"
                style={{
                  flex: 1,
                  background: stationProgress.trials.length >= TOTAL_TRIALS ? 'rgba(16, 185, 129, 0.25)' : 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)',
                  color: stationProgress.trials.length >= TOTAL_TRIALS ? '#34d399' : '#1a0b10',
                  borderColor: stationProgress.trials.length >= TOTAL_TRIALS ? '#10b981' : '#fef08a',
                  fontWeight: 800,
                }}
                onClick={() => {
                  if (stationProgress.trials.length >= TOTAL_TRIALS) {
                    setNotebookOpen(true);
                    setNotebookStep(7);
                  } else {
                    recordCurrentTrial();
                  }
                }}
              >
                {stationProgress.trials.length >= TOTAL_TRIALS
                  ? '✓ 5 Trials Done · Open Step 8 →'
                  : `📝 Record 3D Trial (${stationProgress.trials.length + 1} / 5)`}
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{
                  background: 'rgba(53, 18, 29, 0.8)',
                  borderColor: 'rgba(212, 175, 55, 0.4)',
                  color: '#fef08a',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
                onClick={() => {
                  setNotebookOpen(true);
                  setNotebookStep(stationProgress.currentStep);
                }}
              >
                📓 Notebook
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Bottom Status Dock */}
      <div className="status-dock">
        <span className={sceneReady && assetsReady && !sceneError ? 'status-ready' : 'status-waiting'}>
          {sceneError ? '× 3D UNAVAILABLE' : sceneReady && assetsReady ? '● 3D LAB ONLINE' : '○ PREPARING 3D LAB'}
        </span>
        <span>
          {pointerLocked
            ? 'WASD walk · Mouse look · E interact · ESC release'
            : 'Click the 3D view to enter · Keys 1–3 teleport · E interact'}
        </span>
        <span className="score-pill">{totalScore} / 300 pts</span>
        <div className="audio-control">
          <button
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              soundEnabledRef.current = next;
            }}
            aria-label={soundEnabled ? 'Mute laboratory sounds' : 'Enable laboratory sounds'}
          >
            {soundEnabled ? '♫' : '×'} Sound
          </button>
          <input
            aria-label="Sound volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={soundVolume}
            onChange={(event) => setSoundVolume(Number(event.target.value))}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setNotebookStep(stationProgress.currentStep);
            setNotebookOpen(true);
          }}
        >
          ▣ Notebook
        </button>
      </div>

      {/* Mobile Touch Controls */}
      {!notebookOpen && (
        <div className="mobile-lab-controls" aria-label="Touch laboratory controls">
          <div
            className="mobile-joystick"
            role="group"
            aria-label="Analog walking joystick"
            onPointerDown={handleJoystickPointerDown}
            onPointerMove={handleJoystickMove}
            onPointerUp={handleJoystickPointerUp}
            onPointerCancel={handleJoystickPointerUp}
          >
            <div
              className="mobile-joystick-knob"
              style={{
                transform: `translate3d(${joystickKnob.x}px, ${joystickKnob.y}px, 0)`,
              }}
            />
            <small aria-hidden="true">WALK</small>
          </div>

          <div className="mobile-lab-action-cluster">
            <button
              type="button"
              className={`mobile-equipment-action ${interaction ? 'ready' : ''}`}
              onClick={() => {
                if (interaction) equipmentActionRef.current(interaction.id);
              }}
              disabled={!interaction}
            >
              <span className="mobile-btn-icon">⚡</span>
              <span className="mobile-btn-text">{interaction ? interaction.action : 'LOOK AT APPARATUS'}</span>
            </button>

            <div className="mobile-lab-subactions">
              <button
                type="button"
                className="mobile-subaction-btn"
                onClick={() => {
                  const next = sceneApi.current?.toggleView();
                  if (typeof next === 'boolean') setIsThirdPerson(next);
                }}
                title="Toggle 1st / 3rd Person View (Key V)"
              >
                <span>{isThirdPerson ? '📷 3RD' : '👁️ 1ST'}</span>
              </button>
              <button
                type="button"
                className="mobile-subaction-btn"
                onClick={() => {
                  const next = sceneApi.current?.switchCharacter();
                  if (next) setActiveCharacter(next);
                }}
                title="Switch Character (Key C)"
              >
                <span>{activeCharacter === 'female' ? '👩 CARLA' : '👨 ERIC'}</span>
              </button>
              <button
                type="button"
                className="mobile-subaction-btn"
                onClick={() => sceneApi.current?.resetView()}
                title="Reset Camera View"
              >
                <span>🎯 RESET</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Guided 8-Step Notebook Modal */}
      {notebookOpen && (
        <div
          className="notebook-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNotebookOpen(false);
          }}
        >
          <section className="notebook-modal" role="dialog" aria-modal="true" aria-labelledby="notebook-title">
            {/* Modal Header */}
            <header className="notebook-header">
              <div>
                <span>STATION {station.number} · LABORATORY NOTEBOOK</span>
                <h2 id="notebook-title">{station.title}</h2>
              </div>
              <div className="notebook-score">
                <span>Station score</span>
                <b>{currentScore} / 100</b>
              </div>
              <button
                type="button"
                className="close-button"
                aria-label="Close Notebook"
                onClick={() => setNotebookOpen(false)}
              >
                ×
              </button>
            </header>

            {/* Student & Session Info Strip */}
            <div className="student-strip">
              <span><b>Student:</b> {studentName.trim() || 'Physics Student'} · <b>Section:</b> {studentSection.trim() || 'PHY-300'}</span>
              <span><b>Student ID:</b> {studentId} · <b>Calibration:</b> {studentId.slice(-4)}</span>
              <span><b>Station:</b> {station.number} · {station.shortName}</span>
            </div>

            <div className="notebook-body">
              <aside className="step-rail" aria-label="Experiment steps">
                {STEP_NAMES.map((name, index) => {
                  const isDone = stationProgress.completed[index];
                  const isCur = notebookStep === index;
                  const isSkipped = stationProgress.skipped?.[index];
                  const isLocked = index > stationProgress.currentStep && !isDone;
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={isLocked}
                      className={`${isCur ? 'active' : ''} ${isDone ? 'complete' : ''} ${isSkipped ? 'skipped' : ''} ${isLocked ? 'locked' : ''}`}
                      onClick={() => !isLocked && setNotebookStep(index)}
                      title={isLocked ? `Step ${index + 1} is locked until previous steps are completed.` : undefined}
                    >
                      <span>{isDone ? '✓' : isLocked ? '🔒' : isSkipped ? '↷' : index + 1}</span>
                      <div>
                        <b>{name}</b>
                        <small>{isLocked ? 'Locked 🔒' : `${STEP_POINTS[index]} pts`}</small>
                      </div>
                    </button>
                  );
                })}
              </aside>

              <div className="notebook-content">
                <div className={`notebook-section ${[4, 6, 7].includes(notebookStep) ? 'wide-section' : ''}`}>
              {/* STEP 1: EXPLORE (10 pts) */}
              {notebookStep === 0 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 1: Inspect 3D Apparatus & Identify Reference Markers</h4>
                  </div>
                  <p className="step-prompt">{station.steps[0].prompt}</p>

                  <div className="equipment-checklist">
                    <b style={{ color: '#fef08a' }}>
                      Station Component Physical Inspection Status ({stationProgress.inspected.filter((id) => INSPECTION_TARGETS[stationId].includes(id)).length} / {INSPECTION_TARGETS[stationId].length} Inspected):
                    </b>
                    <ul style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px', padding: 0 }}>
                      {INSPECTION_TARGETS[stationId].map((tgt) => {
                        const isInspected = stationProgress.inspected.includes(tgt);
                        const label = INSPECTION_LABELS[tgt] || tgt.replace(`${stationId}-`, '').replace(/-/g, ' ').toUpperCase();
                        return (
                          <li
                            key={tgt}
                            className={isInspected ? 'done' : ''}
                            style={{
                              padding: '10px 12px',
                              background: isInspected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(53, 18, 29, 0.9)',
                              border: isInspected ? '1.5px solid #10b981' : '1px solid rgba(212, 175, 55, 0.45)',
                              borderRadius: '6px',
                              listStyle: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                            onClick={() => {
                              handleInspectApparatus(tgt);
                              playTone(isInspected ? 520 : 660, 'sine', 0.1, 0.2);
                            }}
                            title={isInspected ? 'Component verified' : `Click to verify ${label}`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '14px' }}>{isInspected ? '✅' : '🔍'}</span>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: isInspected ? '#34d399' : '#e9dfc9' }}>{label}</span>
                            </div>
                            <span style={{ fontSize: '10px', color: isInspected ? '#34d399' : '#d4af37', fontWeight: 700 }}>
                              {isInspected ? '✓ Inspected' : 'Click to Verify'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {!allInspected ? (
                    <div className="feedback-alert incorrect" style={{ marginTop: '14px' }}>
                      ⚠️ Physical Inspection Required: Explore the 3D laboratory and approach all apparatus instruments in 3D, or click the items above ({stationProgress.inspected.length} / {INSPECTION_TARGETS[stationId].length} completed).
                    </div>
                  ) : (
                    <div className="feedback-alert correct" style={{ marginTop: '14px' }}>
                      ✓ All apparatus components have been inspected and verified!
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    {!allInspected && (
                      <button
                        type="button"
                        className="notebook-action"
                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', fontWeight: 800 }}
                        onClick={() => {
                          INSPECTION_TARGETS[stationId].forEach((tgt) => handleInspectApparatus(tgt));
                          completeStep(0);
                          playTone(880, 'sine', 0.25, 0.4);
                        }}
                      >
                        ✓ Verify & Complete All Inspection (+10 pts)
                      </button>
                    )}
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[0] || !allInspected}
                      onClick={() => completeStep(0)}
                    >
                      {stationProgress.completed[0] ? '✓ Step 1 Complete (10/10 pts)' : 'Confirm Inspection Complete (+10 pts)'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: ASSEMBLY / PREDICTION (10 pts) */}
              {notebookStep === 1 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 2: {stationId === 'circuits' ? 'Circuit Assembly & Continuity Inspection' : stationId === 'optics' ? 'Optical Rail Alignment & Snell Interface Calibration' : 'Inertial Reference Frame S & S\' Calibration'}</h4>
                  </div>
                  <p className="step-prompt">{station.steps[1].prompt}</p>

                  <div className="calibration-box" style={{ borderLeft: '4px solid #d4af37' }}>
                    <b>{stationId === 'circuits' ? 'Resistor Network Assembly & Equivalent Resistance:' : stationId === 'optics' ? 'Geometric Ray Alignment & Snell Interface:' : 'Inertial Reference Frames S & S\' Invariant Coordinates:'}</b>
                    {stationId === 'circuits' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Three precision metal-film resistors are connected in a continuous series loop: <b>R1 = 100 Ω</b>, <b>R2 = 220 Ω</b>, <b>R3 = 330 Ω</b>.<br />
                        Because there is only one continuous path for charge carriers, the total equivalent resistance is strictly additive:
                        <br />
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fef08a' }}>
                          Req = R1 + R2 + R3 = 100 Ω + 220 Ω + 330 Ω = 650.0 Ω
                        </span>
                      </p>
                    )}
                    {stationId === 'optics' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Central optical track alignment ensures paraxial rays converge along the principal axis without spherical aberration.
                        Critical angle interface: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fef08a' }}>θ_c = arcsin(n2 / n1) ≈ 41.8°</span> (Crown Glass n1 = 1.50 into Air n2 = 1.00).
                      </p>
                    )}
                    {stationId === 'relativity' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Inertial Reference Frame S (laboratory rest frame) and Frame S&apos; (particle proper frame) establish invariant rest measurements: <b>L0 = 20.0 m</b>, <b>Δt0 = 10.0 s</b>.
                        Lorentz transformation ensures the invariant spacetime interval <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fef08a' }}>Δs² = c²Δt² - Δx²</span> holds across all reference frames.
                      </p>
                    )}
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <b>Theoretical Prediction Checkpoint:</b>
                    <p className="prediction-question" style={{ marginTop: '6px' }}>{station.prediction.question}</p>
                    <div className="prediction-options">
                      {station.prediction.options.map((opt, i) => (
                        <label key={opt} className={currentPredictionAnswer === i ? 'selected' : ''}>
                          <input
                            type="radio"
                            name="prediction"
                            checked={currentPredictionAnswer === i}
                            onChange={() => verifyPrediction(i)}
                          />
                          <span>{String.fromCharCode(65 + i)}</span>
                          <div>{opt}</div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {predictionFeedback && (
                    <div className={`feedback-alert ${predictionStatus}`} style={{ marginTop: '14px' }}>
                      {predictionFeedback}
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[1] || currentPredictionAnswer !== station.prediction.answer}
                      onClick={() => completeStep(1)}
                    >
                      {stationProgress.completed[1] ? '✓ Step 2 Complete (10/10 pts)' : stationId === 'circuits' ? 'Confirm Circuit Assembly (+10 pts)' : stationId === 'optics' ? 'Confirm Optical Alignment (+10 pts)' : 'Confirm Frame Calibration (+10 pts)'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: POWER / SOURCE CONFIGURATION (10 pts) */}
              {notebookStep === 2 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 3: {stationId === 'circuits' ? 'DC Power Supply Setup & Energization' : stationId === 'optics' ? 'Tunable Laser Source Energization (λ = 532 nm)' : 'Linear Particle Accelerator Baseline Setup'}</h4>
                  </div>
                  <p className="step-prompt">{station.steps[2].prompt}</p>

                  <div className="calibration-box" style={{ borderLeft: '4px solid #d4af37' }}>
                    <b>{stationId === 'circuits' ? 'DC Power Supply Specification:' : stationId === 'optics' ? 'Coherent Diode Laser Specification:' : 'Relativistic Particle Beamline Specification:'}</b>
                    {stationId === 'circuits' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Regulated DC Laboratory Power Supply: Output potential set to <b>Vs = 24.0 V DC</b>.<br />
                        Energizing the supply establishes a constant potential difference across the series resistor matrix.
                      </p>
                    )}
                    {stationId === 'optics' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Diode Laser Source: λ = 532 nm (Emerald green). Monochromatic coherent optical beam.<br />
                        Provides primary calibrated laser wavelength for diffraction, refraction, and thin lens testing.
                      </p>
                    )}
                    {stationId === 'relativity' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Linear Particle Accelerator: Baseline rest state β = 0.00c (Rest Energy E₀ = 3727.38 MeV, K = 0 MeV).<br />
                        Calibrated vacuum drift tube length L₀ = 20.0 m equipped with sub-nanosecond optical transit timing gates.
                      </p>
                    )}
                  </div>

                  {stationId === 'circuits' && (
                    <div className="telemetry-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '16px' }}>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>SOURCE POTENTIAL</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fef08a' }}>{circuits.vs.toFixed(1)} V DC</div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>POWER STATUS</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: circuits.powerOn ? '#10b981' : '#ef4444' }}>
                          {circuits.powerOn ? '● ENERGIZED' : '○ DE-ENERGIZED'}
                        </div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>CIRCUIT REGIME</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#d4af37' }}>DC Steady-State</div>
                      </div>
                    </div>
                  )}

                  {stationId === 'optics' && (
                    <div className="telemetry-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '16px' }}>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>LASER WAVELENGTH</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>{optics.wavelength} nm</div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>BEAMLINE EMISSION</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: optics.powerOn ? '#10b981' : '#ef4444' }}>
                          {optics.powerOn ? '● EMITTING (532 nm)' : '○ DE-ENERGIZED'}
                        </div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>OPTICAL REGIME</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#d4af37' }}>Coherent Paraxial Beam</div>
                      </div>
                    </div>
                  )}

                  {stationId === 'relativity' && (
                    <div className="telemetry-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '16px' }}>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>REST MASS PRESET</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fef08a' }}>{relativity.massPreset.toUpperCase()}</div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>BEAMLINE STATUS</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: relativity.powerOn ? '#10b981' : '#ef4444' }}>
                          {relativity.powerOn ? '● CHARGED VACUUM' : '○ STANDBY'}
                        </div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>REST ENERGY E₀</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#d4af37' }}>3727.38 MeV</div>
                      </div>
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    {!(stationId === 'circuits' ? circuits.powerOn : stationId === 'optics' ? optics.powerOn : relativity.powerOn) && (
                      <button
                        type="button"
                        className="notebook-action"
                        style={{ background: 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)', color: '#1a0b10', fontWeight: 800 }}
                        onClick={() => setNotebookOpen(false)}
                      >
                        ⚡ Close Notebook & Energize Source in 3D View
                      </button>
                    )}
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[2] || !(stationId === 'circuits' ? circuits.powerOn : stationId === 'optics' ? optics.powerOn : relativity.powerOn)}
                      onClick={() => completeStep(2)}
                    >
                      {stationProgress.completed[2] ? '✓ Step 3 Complete (10/10 pts)' : stationId === 'circuits' ? 'Confirm Power Configuration (+10 pts)' : stationId === 'optics' ? 'Confirm Laser Configuration (+10 pts)' : 'Confirm Beamline Setup (+10 pts)'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: INSTRUMENT PREPARATION (10 pts) */}
              {notebookStep === 3 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 4: {stationId === 'circuits' ? 'Multimeter Instrument Preparation' : stationId === 'optics' ? 'Goniometer & Optical Mount Preparation' : 'Relativistic Detector & Proper Clock Synchronization'}</h4>
                  </div>
                  <p className="step-prompt">{station.steps[3].prompt}</p>

                  <div className="calibration-box" style={{ borderLeft: '4px solid #d4af37' }}>
                    <b>{stationId === 'circuits' ? 'Fluke 87V True-RMS Digital Multimeter Architecture:' : stationId === 'optics' ? 'Optical Rail Carrier & Lens Mount Calibration:' : 'Time-of-Flight Atomic Clocks & Detector Array:'}</b>
                    {stationId === 'circuits' && (
                      <p style={{ margin: '6px 0 0' }}>
                        <b>Input Impedance:</b> In Voltage sensing mode (V⎓), the meter connects its internal <b>10 MΩ precision voltage divider</b>. This high impedance prevents loading error when measuring across high-resistance nodes.<br />
                        <b>Lead Routing:</b> Black lead connects to <b>COM</b> (circuit reference ground). Red lead connects to <b>V·Ω</b>. The mA/10A jack is reserved strictly for current measurement with burden shunts.
                      </p>
                    )}
                    {stationId === 'optics' && (
                      <p style={{ margin: '6px 0 0' }}>
                        <b>Lens Mount Carrier:</b> Bi-convex precision crown-glass thin lens with nominal focal length <b>f = 20.0 cm</b>.<br />
                        <b>Observation Screen:</b> High-contrast matte white screen mounted on optical vernier rail with 0.1 cm positional accuracy.
                      </p>
                    )}
                    {stationId === 'relativity' && (
                      <p style={{ margin: '6px 0 0' }}>
                        <b>Proper Time Reference Clock:</b> Frame S&apos; atomic clock calibrated to proper time interval <b>Δt₀ = 10.0 s</b>.<br />
                        <b>Reference Length Standard:</b> Laboratory drift tunnel rest length standard <b>L₀ = 20.0 m</b>.
                      </p>
                    )}
                  </div>

                  {stationId === 'circuits' && (
                    <div className="dmm-prep-controls" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '16px' }}>
                      <div style={{ padding: '12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        <span style={{ fontSize: '11px', color: '#e9dfc9' }}>ROTARY SELECTOR DIAL (3D FLUKE 87V)</span>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: dmmMode === 'v_dc' ? '#34d399' : '#f87171', marginTop: '6px' }}>
                          {dmmMode === 'v_dc' ? '✓ V⎓ (DC Voltage Mode)' : `⚠️ Currently: ${dmmMode.toUpperCase()} (Must be V⎓)`}
                        </div>
                        <small style={{ color: '#94a3b8' }}>Turn rotary dial on 3D meter or Live Controls</small>
                      </div>
                      <div style={{ padding: '12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        <span style={{ fontSize: '11px', color: '#e9dfc9' }}>RED LEAD INPUT JACK</span>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: dmmJack === 'v_ohm' ? '#34d399' : '#f87171', marginTop: '6px' }}>
                          {dmmJack === 'v_ohm' ? '✓ V·Ω Jack (Hi-Z 10 MΩ)' : `⚠️ Currently: ${dmmJack.toUpperCase()} (Must be V·Ω)`}
                        </div>
                        <small style={{ color: '#94a3b8' }}>Click red lead jack in 3D or Live Controls</small>
                      </div>
                    </div>
                  )}

                  {stationId === 'optics' && (
                    <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      <div style={{ padding: '12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        <span style={{ fontSize: '11px', color: '#e9dfc9' }}>NOMINAL LENS SPECIFICATION</span>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>f = 20.0 cm (Converging)</div>
                        <small style={{ color: '#94a3b8' }}>Crown Glass n = 1.50</small>
                      </div>
                      <div style={{ padding: '12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        <span style={{ fontSize: '11px', color: '#e9dfc9' }}>OPTICAL RAIL STATUS</span>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fef08a', marginTop: '4px' }}>Paraxial Axis Aligned</div>
                        <small style={{ color: '#94a3b8' }}>Zero chromatic dispersion at 532 nm</small>
                      </div>
                    </div>
                  )}

                  {stationId === 'relativity' && (
                    <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      <div style={{ padding: '12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        <span style={{ fontSize: '11px', color: '#e9dfc9' }}>PROPER TIME STANDARD</span>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>Δt₀ = 10.00 s</div>
                        <small style={{ color: '#94a3b8' }}>Inertial Rest Frame S&apos;</small>
                      </div>
                      <div style={{ padding: '12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        <span style={{ fontSize: '11px', color: '#e9dfc9' }}>REST LENGTH STANDARD</span>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fef08a', marginTop: '4px' }}>L₀ = 20.00 m</div>
                        <small style={{ color: '#94a3b8' }}>Laboratory Reference Frame S</small>
                      </div>
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    {!(stationId === 'circuits' ? (dmmMode === 'v_dc' && dmmJack === 'v_ohm') : true) && (
                      <button
                        type="button"
                        className="notebook-action"
                        style={{ background: 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)', color: '#1a0b10', fontWeight: 800 }}
                        onClick={() => setNotebookOpen(false)}
                      >
                        🔬 Close Notebook & Configure Multimeter in 3D View
                      </button>
                    )}
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[3] || (stationId === 'circuits' && !(dmmMode === 'v_dc' && dmmJack === 'v_ohm'))}
                      onClick={() => completeStep(3)}
                    >
                      {stationProgress.completed[3] ? '✓ Step 4 Complete (10/10 pts)' : stationId === 'circuits' ? 'Confirm Multimeter Preparation (+10 pts)' : stationId === 'optics' ? 'Confirm Optics Preparation (+10 pts)' : 'Confirm Detector Calibration (+10 pts)'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 5: MEASUREMENT PROCEDURE A (10 pts) */}
              {notebookStep === 4 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 5: {stationId === 'circuits' ? 'Voltage Measurement Procedure (Parallel)' : stationId === 'optics' ? 'Paraxial Ray Tracing & Refraction Procedure' : 'Proper Frame Time Dilation Procedure'}</h4>
                  </div>
                  <p className="step-prompt">{station.steps[4].prompt}</p>

                  <div className="calibration-box" style={{ borderLeft: '4px solid #d4af37' }}>
                    <b>{stationId === 'circuits' ? '⚡ Non-Intrusive Parallel Measurement Principle:' : stationId === 'optics' ? '🔍 Snell\'s Law & Paraxial Ray Tracing Principle:' : '⏱️ Relativistic Time Dilation Principle:'}</b>
                    {stationId === 'circuits' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Voltage represents the difference in electric potential between two physical points.
                        To measure voltage, the voltmeter test probes are connected <b>in parallel across the component</b>.
                        Because the meter has a 10 MΩ internal resistance, it does not interrupt circuit current or disturb normal operation.
                      </p>
                    )}
                    {stationId === 'optics' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Paraxial rays from object distance <b>u</b> refract through the thin converging lens to form a real image at distance <b>v</b> according to the Gaussian lens formula:
                        <b> 1/f = 1/u + 1/v</b>. For nominal focal length f = 20.0 cm, when u = 40.0 cm (2f), image distance v = 40.0 cm with unit magnification (M = -1.0×).
                      </p>
                    )}
                    {stationId === 'relativity' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Because the speed of light c is an invariant universal constant, light travels along a longer diagonal path inside a moving clock as viewed from Frame S.
                        Consequently, the moving clock ticks slower by the Lorentz factor: <b>γ = 1 / √(1 - β²)</b>, yielding dilated time interval: <b>Δt = γ Δt₀</b>.
                      </p>
                    )}
                  </div>

                  {stationId === 'circuits' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>Parallel Potential Drop Verification (Fluke 87V):</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>FLUKE 87V LCD READOUT (PARALLEL)</span>
                          <div style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 700, color: '#fef08a' }}>{dmmReading.displayString}</div>
                          <div style={{ fontSize: '11px', color: dmmReading.isValidMeasurement && dmmReading.unit === 'V' ? '#34d399' : '#f87171', marginTop: '2px' }}>
                            {dmmReading.isValidMeasurement && dmmReading.unit === 'V' ? '✓ Valid parallel voltage measurement detected' : '⚠️ Place probes across circuit elements in 3D'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>Red Lead (+): <b style={{ color: '#fef08a' }}>{redTerminal ?? 'Unconnected'}</b></span><br />
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>Black Lead (COM): <b style={{ color: '#fef08a' }}>{blackTerminal ?? 'Unconnected'}</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {stationId === 'optics' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>Optical Track Conjugate Focal Alignment:</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>OPTICAL TRACK TELEMETRY</span>
                          <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#34d399' }}>
                            u = {optics.objectDistance.toFixed(1)} cm → v = {((optics.objectDistance * 20.0) / Math.max(0.1, optics.objectDistance - 20.0)).toFixed(1)} cm
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>Focal Length: <b>f = 20.0 cm</b></span><br />
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>Magnification: <b>{(-((optics.objectDistance * 20.0) / Math.max(0.1, optics.objectDistance - 20.0)) / optics.objectDistance).toFixed(2)}x</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {stationId === 'relativity' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>Relativistic Velocity & Time Dilation Telemetry:</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>DILATED TIME (FRAME S)</span>
                          <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#fef08a' }}>
                            Δt = {((1 / Math.sqrt(Math.max(0.01, 1 - relativity.beta ** 2))) * 10.0).toFixed(2)} s
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>Lorentz Factor: <b>γ = {(1 / Math.sqrt(Math.max(0.01, 1 - relativity.beta ** 2))).toFixed(4)}</b></span><br />
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>Proper Time: <b>Δt₀ = 10.0 s</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    {stationId === 'circuits' && !(dmmReading.isValidMeasurement && dmmReading.unit === 'V' && dmmReading.value !== null && Math.abs(dmmReading.value) > 0.5) && (
                      <button
                        type="button"
                        className="notebook-action"
                        style={{ background: 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)', color: '#1a0b10', fontWeight: 800 }}
                        onClick={() => setNotebookOpen(false)}
                      >
                        🔌 Close Notebook & Place Probes on 3D Breadboard
                      </button>
                    )}
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[4] || (stationId === 'circuits' && !(dmmReading.isValidMeasurement && dmmReading.unit === 'V' && dmmReading.value !== null && Math.abs(dmmReading.value) > 0.5))}
                      onClick={() => completeStep(4)}
                    >
                      {stationProgress.completed[4] ? '✓ Step 5 Complete (10/10 pts)' : stationId === 'circuits' ? 'Confirm Voltage Procedure (+10 pts)' : stationId === 'optics' ? 'Confirm Optical Ray Procedure (+10 pts)' : 'Confirm Time Dilation Procedure (+10 pts)'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 6: MEASUREMENT PROCEDURE B (10 pts) */}
              {notebookStep === 5 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 6: {stationId === 'circuits' ? 'Current Measurement Procedure (Series Insertion)' : stationId === 'optics' ? 'Observation Screen Image Focus Calibration' : 'Lorentz Length Contraction & Relativistic Energy'}</h4>
                  </div>
                  <p className="step-prompt">{station.steps[5].prompt}</p>

                  <div className="calibration-box" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <b>{stationId === 'circuits' ? '⚠️ CRITICAL ELECTRICAL SAFETY & SERIES INSERTION PRINCIPLE:' : stationId === 'optics' ? '🔬 Real Image Focus & Thin Lens Conjugate Principle:' : '📐 Length Contraction & Mass-Energy Equivalence:'}</b>
                    {stationId === 'circuits' && (
                      <>
                        <p style={{ margin: '6px 0 0' }}>
                          An ammeter has near-zero internal resistance (shunt resistance ~0.1 Ω).<br />
                          <b>SAFETY MANDATE: NEVER CONNECT AN AMMETER IN PARALLEL ACROSS A VOLTAGE SOURCE.</b>
                          Connecting in parallel causes a dead short circuit, drawing hundreds of amperes and blowing the internal protective fuse!
                        </p>
                        <p style={{ margin: '6px 0 0', fontWeight: 600 }}>
                          Procedure: 1. De-energize power supply. 2. Remove the series loop jumper to create an open break. 3. Plug red test lead into mA/10A jack. 4. Turn dial to A⎓. 5. Connect meter probes across the break terminals. 6. Re-energize circuit.
                        </p>
                      </>
                    )}
                    {stationId === 'optics' && (
                      <p style={{ margin: '6px 0 0' }}>
                        When the observation screen is placed precisely at image distance <b>v = (u·f)/(u - f)</b>, paraxial light rays converge to form a sharply focused real inverted image.
                        Moving the screen away from this conjugate focal plane causes defocus blur and intensity spread.
                      </p>
                    )}
                    {stationId === 'relativity' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Physical objects moving at relativistic velocity v contract along their direction of motion according to: <b>L = L₀ / γ = L₀ √(1 - β²)</b>.
                        Simultaneously, total relativistic energy expands according to <b>E = γ E₀</b>, giving kinetic energy <b>K = (γ - 1) E₀</b>.
                      </p>
                    )}
                  </div>

                  {stationId === 'circuits' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>True Series Ammeter Loop Verification (Fluke 87V):</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>FLUKE 87V AMMETER READOUT (SERIES)</span>
                          <div style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 700, color: dmmReading.tripFuse ? '#ef4444' : '#34d399' }}>
                            {dmmReading.displayString}
                          </div>
                          <div style={{ fontSize: '11px', color: (!jumperClosed && dmmMode === 'a_dc' && dmmJack === 'ma_10a' && (redTerminal === 'SERIES_JACK_A' || blackTerminal === 'SERIES_JACK_A')) ? '#34d399' : '#f87171', marginTop: '2px' }}>
                            {!jumperClosed && dmmMode === 'a_dc' && dmmJack === 'ma_10a' && (redTerminal === 'SERIES_JACK_A' || blackTerminal === 'SERIES_JACK_A')
                              ? '✓ Ammeter inserted in series break — full loop completed'
                              : '⚠️ Remove series jumper, set dial to A⎓, jack to mA/10A, and connect across break'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>Dial: <b style={{ color: dmmMode === 'a_dc' ? '#34d399' : '#f87171' }}>{dmmMode.toUpperCase()}</b> · Jack: <b style={{ color: dmmJack === 'ma_10a' ? '#34d399' : '#f87171' }}>{dmmJack.toUpperCase()}</b></span><br />
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>Series Jumper: <b style={{ color: !jumperClosed ? '#34d399' : '#f87171' }}>{jumperClosed ? 'CLOSED (Bypassing Ammeter)' : 'OPEN (Ammeter Completes Loop)'}</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {stationId === 'optics' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>Conjugate Real Image Sharpness & Magnification:</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>THIN LENS GAUSSIAN VERIFICATION</span>
                          <div style={{ fontSize: '18px', fontFamily: 'monospace', fontWeight: 700, color: '#34d399' }}>
                            1/f = 1/{optics.objectDistance.toFixed(0)} + 1/{((optics.objectDistance * 20.0) / Math.max(0.1, optics.objectDistance - 20.0)).toFixed(1)} = 0.050 cm⁻¹ (f = 20.0 cm)
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>Image State: <b>Real &amp; Inverted</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {stationId === 'relativity' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>Lorentz Contraction & Relativistic Total Energy:</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>CONTRACTED LENGTH (FRAME S)</span>
                          <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#fef08a' }}>
                            L = {(20.0 * Math.sqrt(Math.max(0.01, 1 - relativity.beta ** 2))).toFixed(2)} m (Rest L₀ = 20.0 m)
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#e9dfc9' }}>Kinetic Energy: <b>{((1 / Math.sqrt(Math.max(0.01, 1 - relativity.beta ** 2)) - 1) * 3727.38).toFixed(1)} MeV</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    {stationId === 'circuits' && !(!jumperClosed && dmmMode === 'a_dc' && dmmJack === 'ma_10a' && (redTerminal === 'SERIES_JACK_A' || blackTerminal === 'SERIES_JACK_A')) && (
                      <button
                        type="button"
                        className="notebook-action"
                        style={{ background: 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)', color: '#1a0b10', fontWeight: 800 }}
                        onClick={() => setNotebookOpen(false)}
                      >
                        ⚡ Close Notebook & Configure Series Ammeter in 3D View
                      </button>
                    )}
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[5] || (stationId === 'circuits' && !(!jumperClosed && dmmMode === 'a_dc' && dmmJack === 'ma_10a' && (redTerminal === 'SERIES_JACK_A' || blackTerminal === 'SERIES_JACK_A')))}
                      onClick={() => completeStep(5)}
                    >
                      {stationProgress.completed[5] ? '✓ Step 6 Complete (10/10 pts)' : stationId === 'circuits' ? 'Confirm Current Procedure (+10 pts)' : stationId === 'optics' ? 'Confirm Focus Procedure (+10 pts)' : 'Confirm Contraction Procedure (+10 pts)'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 7: FIVE-TRIAL EXPERIMENTAL DATA COLLECTION (20 pts) */}
              {notebookStep === 6 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+20 Points</span>
                    <h4>Step 7: Five-Trial Experimental Data Collection ({stationProgress.trials.length} / {TOTAL_TRIALS})</h4>
                  </div>
                  <p className="step-prompt">{station.steps[6].prompt}</p>

                  {/* Trial Operating Points Selection Rail */}
                  <div className="trial-condition-rail" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', margin: '14px 0' }}>
                    {ROOM3_ASSIGNED_TRIALS[stationId].map((condition, idx) => {
                      const isRecorded = stationProgress.trials.length > idx;
                      const isActive = activeTrialTab === idx;
                      return (
                        <button
                          key={condition.label}
                          type="button"
                          className={`trial-chip-btn ${isActive ? 'active' : ''} ${isRecorded ? 'recorded' : ''}`}
                          style={{
                            padding: '10px 8px',
                            background: isActive ? 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)' : isRecorded ? 'rgba(16, 185, 129, 0.2)' : 'rgba(53, 18, 29, 0.85)',
                            border: isActive ? '2px solid #fef08a' : isRecorded ? '1px solid #10b981' : '1px solid rgba(212, 175, 55, 0.35)',
                            borderRadius: '8px',
                            color: isActive ? '#1a0b10' : '#fff',
                            cursor: 'pointer',
                            textAlign: 'center',
                          }}
                          onClick={() => {
                            setActiveTrialTab(idx);
                            setRetakeTrialIndex(isRecorded ? idx : null);
                          }}
                        >
                          <div style={{ fontSize: '11px', color: isActive ? '#1a0b10' : isRecorded ? '#34d399' : '#e9dfc9' }}>
                            {isRecorded ? '✓ Recorded' : `Trial ${idx + 1}`}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>
                            {condition.targetParam} = {condition.targetValue}{condition.unit}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Assigned Trial Card */}
                  {(() => {
                    const assigned = ROOM3_ASSIGNED_TRIALS[stationId][activeTrialTab] ?? ROOM3_ASSIGNED_TRIALS[stationId][0];
                    const trialNum = activeTrialTab + 1;
                    const isAlreadyRecorded = stationProgress.trials.length > activeTrialTab;
                    return (
                      <div className="active-trial-card" style={{ padding: '16px', background: 'radial-gradient(ellipse at top, rgba(88, 28, 44, 0.95) 0%, rgba(53, 18, 29, 0.98) 100%)', border: '1.5px solid rgba(212, 175, 55, 0.65)', borderRadius: '10px', marginBottom: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 15px rgba(212, 175, 55, 0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: '12px', color: '#fef08a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              ACTIVE TRIAL #{trialNum} · ASSIGNED OPERATING CONDITION
                            </span>
                            <h4 style={{ margin: '4px 0', fontSize: '18px', color: '#f8fafc' }}>
                              {stationId === 'circuits' && `Assigned Source Voltage: Vs = ${assigned.targetValue.toFixed(1)} V (Expected I = ${assigned.expectedSecondary} mA)`}
                              {stationId === 'optics' && `Assigned Object Distance: u = ${assigned.targetValue.toFixed(1)} cm (Expected v ≈ ${assigned.expectedSecondary.toFixed(1)} cm)`}
                              {stationId === 'relativity' && `Assigned Velocity Ratio: β = ${assigned.targetValue.toFixed(2)}c (Expected γ = ${assigned.expectedSecondary.toFixed(3)})`}
                            </h4>
                          </div>
                          <span style={{ padding: '6px 12px', background: isAlreadyRecorded ? 'rgba(16, 185, 129, 0.25)' : 'rgba(212, 175, 55, 0.2)', border: isAlreadyRecorded ? '1px solid #10b981' : '1px solid #d4af37', borderRadius: '6px', fontSize: '12px', fontWeight: 700, color: isAlreadyRecorded ? '#34d399' : '#fef08a' }}>
                            {isAlreadyRecorded ? `✓ Trial #${trialNum} Logged` : `Pending 3D Trial #${trialNum}`}
                          </span>
                        </div>

                        <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                          <b>Instructions:</b> {assigned.instruction}
                        </p>

                        {/* Live Telemetry Bar for Trial */}
                        <div className="trial-live-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '12px' }}>
                          <div style={{ padding: '8px 12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                            <span style={{ fontSize: '10px', color: '#e9dfc9' }}>LIVE SOURCE POTENTIAL</span>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fef08a' }}>{circuits.vs.toFixed(2)} V</div>
                          </div>
                          <div style={{ padding: '8px 12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                            <span style={{ fontSize: '10px', color: '#e9dfc9' }}>LIVE CURRENT (SERIES)</span>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399' }}>{(circuitResult.current * 1000).toFixed(2)} mA</div>
                          </div>
                          <div style={{ padding: '8px 12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                            <span style={{ fontSize: '10px', color: '#e9dfc9' }}>THEORETICAL RESISTANCE Req</span>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#d4af37' }}>650.0 Ω</div>
                          </div>
                        </div>

                        {/* 3D Action Guidance - Trials must be performed physically in 3D */}
                        {stationProgress.trials.length < TOTAL_TRIALS ? (
                          <div style={{ marginTop: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="notebook-action"
                              style={{
                                flex: 1,
                                background: 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)',
                                color: '#1a0b10',
                                borderColor: '#fef08a',
                                padding: '12px 18px',
                                fontSize: '14px',
                                fontWeight: 800,
                              }}
                              onClick={() => setNotebookOpen(false)}
                            >
                              🔬 Close Notebook & Perform Trial #{stationProgress.trials.length + 1} in 3D View ({stationProgress.trials.length} / 5 Logged)
                            </button>
                            {stationProgress.trials.length > 0 && (
                              <button
                                type="button"
                                className="notebook-action"
                                style={{ background: '#7f1d1d', borderColor: '#ef4444', color: '#fef2f2' }}
                                onClick={handleResetTrials}
                              >
                                🗑️ Reset Trials
                              </button>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.15)', border: '1.5px solid #10b981', borderRadius: '8px', padding: '12px 16px' }}>
                            <span style={{ fontSize: '14px', color: '#34d399', fontWeight: 700 }}>
                              ✓ All 5 Trials Recorded in 3D (+20 pts Earned)
                            </span>
                            <button
                              type="button"
                              className="notebook-action"
                              style={{ background: '#059669', borderColor: '#10b981', color: '#fff', fontWeight: 800 }}
                              onClick={() => setNotebookStep(7)}
                            >
                              Proceed to Step 8: Computation & Scientific Analysis →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {measurementWarning && (
                    <div className="feedback-alert incorrect" style={{ marginBottom: '14px' }}>
                      {measurementWarning}
                    </div>
                  )}

                  {/* FIVE-TRIAL EXPERIMENTAL DATA TABLE */}
                  <div className="table-scroll">
                    <table className="trial-table">
                      <thead>
                        <tr>
                          {stationId === 'circuits' && (
                            <>
                              <th>#</th><th>Vs (V)</th><th>Measured V (V)</th><th>Current (mA)</th><th>Current (A)</th><th>R_exp (Ω)</th><th>Req Theor (Ω)</th><th>% Error</th><th>Action</th>
                            </>
                          )}
                          {stationId === 'optics' && (
                            <>
                              <th>#</th><th>Object u (cm)</th><th>Image v (cm)</th><th>1/u (cm⁻¹)</th><th>1/v (cm⁻¹)</th><th>f_exp (cm)</th><th>f_nom (cm)</th><th>% Error</th><th>Action</th>
                            </>
                          )}
                          {stationId === 'relativity' && (
                            <>
                              <th>#</th><th>β (v/c)</th><th>Speed (m/s)</th><th>γ (Theory)</th><th>γ (Detector)</th><th>Δt (s)</th><th>Contracted L (m)</th><th>Action</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {stationProgress.trials.map((t, idx) => (
                          <tr key={String(t.trial)} style={{ cursor: 'pointer' }} onClick={() => { setActiveTrialTab(idx); setRetakeTrialIndex(idx); }}>
                            <td><b>{t.trial}</b></td>
                            {stationId === 'circuits' && (
                              <>
                                <td>{formatValue(t.vs)}</td>
                                <td style={{ color: '#d4af37', fontWeight: 600 }}>{formatValue(t.measuredV ?? t.vs)}</td>
                                <td style={{ color: '#10b981', fontWeight: 600 }}>{formatValue(t.measuredI_mA ?? (Number(t.current) * 1000))}</td>
                                <td>{formatValue(t.measuredI_A ?? t.current)}</td>
                                <td style={{ color: '#fef08a', fontWeight: 700 }}>{formatValue(t.resistance ?? t.impedance)}</td>
                                <td>650.0</td>
                                <td>{formatValue(t.percentError)}%</td>
                                <td>
                                  <button
                                    type="button"
                                    style={{ fontSize: '11px', padding: '2px 6px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={(e) => { e.stopPropagation(); setActiveTrialTab(idx); setRetakeTrialIndex(idx); }}
                                  >
                                    Retake
                                  </button>
                                </td>
                              </>
                            )}
                            {stationId === 'optics' && (
                              <>
                                <td>{formatValue(t.u ?? t.paramA)}</td>
                                <td style={{ color: '#d4af37', fontWeight: 600 }}>{formatValue(t.v ?? t.measured)}</td>
                                <td>{formatValue(t.invU)}</td>
                                <td>{formatValue(t.invV)}</td>
                                <td style={{ color: '#10b981', fontWeight: 700 }}>{formatValue(t.f_exp)}</td>
                                <td>20.0</td>
                                <td>{formatValue(t.percentError)}%</td>
                                <td>
                                  <button
                                    type="button"
                                    style={{ fontSize: '11px', padding: '2px 6px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={(e) => { e.stopPropagation(); setActiveTrialTab(idx); setRetakeTrialIndex(idx); }}
                                  >
                                    Retake
                                  </button>
                                </td>
                              </>
                            )}
                            {stationId === 'relativity' && (
                              <>
                                <td>{formatValue(t.beta)}</td>
                                <td>{formatValue(t.speed)}</td>
                                <td>{formatValue(t.gamma)}</td>
                                <td style={{ color: '#d4af37', fontWeight: 600 }}>{formatValue(t.measuredGamma)}</td>
                                <td style={{ color: '#10b981', fontWeight: 600 }}>{formatValue(t.dilatedTime)}</td>
                                <td>{formatValue(t.contractedLength)}</td>
                                <td>
                                  <button
                                    type="button"
                                    style={{ fontSize: '11px', padding: '2px 6px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={(e) => { e.stopPropagation(); setActiveTrialTab(idx); setRetakeTrialIndex(idx); }}
                                  >
                                    Retake
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                        {stationProgress.trials.length === 0 && (
                          <tr>
                            <td colSpan={9} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                              No experimental trials recorded yet. Select an assigned trial operating point above and click &quot;Record Trial&quot;.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Completion and Step Advance */}
                  <div className="button-row" style={{ marginTop: '16px' }}>
                    {stationProgress.trials.length >= TOTAL_TRIALS ? (
                      <button
                        type="button"
                        className="notebook-action"
                        style={{ background: '#059669', borderColor: '#10b981', padding: '10px 20px', fontSize: '14px', fontWeight: 700 }}
                        onClick={() => {
                          completeStep(6);
                          setNotebookStep(7);
                        }}
                      >
                        ✓ 5 Trials Complete (+20 pts) — Proceed to Step 8: Computation & Analysis →
                      </button>
                    ) : (
                      <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                        Awaiting {TOTAL_TRIALS - stationProgress.trials.length} more trial{TOTAL_TRIALS - stationProgress.trials.length > 1 ? 's' : ''} to unlock computation stage.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 8: EXPERIMENTAL DATA COMPUTATION & ANALYSIS (20 pts) */}
              {notebookStep === 7 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+20 Points</span>
                    <h4>Step 8: Computation of Experimental Data and Scientific Analysis</h4>
                  </div>
                  <p className="step-prompt">{station.steps[7].prompt}</p>

                  {/* SECTION A: EXPERIMENTAL OBSERVATIONS (DATA TABLE) */}
                  <div className="section-divider" style={{ margin: '16px 0 10px', borderBottom: '1px solid rgba(212, 175, 55, 0.4)', paddingBottom: '6px' }}>
                    <h5 style={{ margin: 0, color: '#fef08a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Section A: Experimental Observations (Five-Trial Recorded Dataset)
                    </h5>
                  </div>

                  <div className="table-scroll">
                    <table className="trial-table">
                      <thead>
                        <tr>
                          {stationId === 'circuits' && (
                            <>
                              <th>#</th><th>Vs (V)</th><th>Measured V (V)</th><th>Current (mA)</th><th>Current (A)</th><th>R_exp (Ω)</th><th>Power (W)</th><th>R_nom (Ω)</th><th>% Error</th>
                            </>
                          )}
                          {stationId === 'optics' && (
                            <>
                              <th>#</th><th>Object u (cm)</th><th>Image v (cm)</th><th>1/u (cm⁻¹)</th><th>1/v (cm⁻¹)</th><th>f_exp (cm)</th><th>f_nom (cm)</th><th>% Error</th>
                            </>
                          )}
                          {stationId === 'relativity' && (
                            <>
                              <th>#</th><th>β (v/c)</th><th>Speed (m/s)</th><th>γ (Theory)</th><th>γ (Detector)</th><th>Δt (s)</th><th>Contracted L (m)</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {stationProgress.trials.map((t) => (
                          <tr key={String(t.trial)}>
                            <td><b>{t.trial}</b></td>
                            {stationId === 'circuits' && (
                              <>
                                <td>{formatValue(t.vs)}</td>
                                <td style={{ color: '#d4af37' }}>{formatValue(t.measuredV ?? t.vs)}</td>
                                <td style={{ color: '#10b981' }}>{formatValue(t.measuredI_mA ?? (Number(t.current) * 1000))}</td>
                                <td>{formatValue(t.measuredI_A ?? t.current)}</td>
                                <td style={{ color: '#fef08a', fontWeight: 700 }}>{formatValue(t.resistance ?? t.impedance)}</td>
                                <td style={{ color: '#38bdf8' }}>{formatValue(t.powerW ?? (Number(t.measuredV ?? t.vs) * Number(t.measuredI_A ?? 0.006)))} W</td>
                                <td>330.0 Ω</td>
                                <td>{formatValue(t.percentError)}%</td>
                              </>
                            )}
                            {stationId === 'optics' && (
                              <>
                                <td>{formatValue(t.u ?? t.paramA)}</td>
                                <td style={{ color: '#d4af37' }}>{formatValue(t.v ?? t.measured)}</td>
                                <td>{formatValue(t.invU)}</td>
                                <td>{formatValue(t.invV)}</td>
                                <td style={{ color: '#10b981', fontWeight: 700 }}>{formatValue(t.f_exp)}</td>
                                <td>20.0</td>
                                <td>{formatValue(t.percentError)}%</td>
                              </>
                            )}
                            {stationId === 'relativity' && (
                              <>
                                <td>{formatValue(t.beta)}</td>
                                <td>{formatValue(t.speed)}</td>
                                <td>{formatValue(t.gamma)}</td>
                                <td style={{ color: '#d4af37' }}>{formatValue(t.measuredGamma)}</td>
                                <td style={{ color: '#10b981' }}>{formatValue(t.dilatedTime)}</td>
                                <td>{formatValue(t.contractedLength)}</td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* SECTION B: COMPUTATION AND ANALYSIS */}
                  <div className="section-divider" style={{ margin: '22px 0 10px', borderBottom: '1px solid rgba(212, 175, 55, 0.4)', paddingBottom: '6px' }}>
                    <h5 style={{ margin: 0, color: '#d4af37', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Section B: Computation of Experimental Data & Error Quantification
                    </h5>
                  </div>

                  {stationProgress.trials.length < TOTAL_TRIALS ? (
                    <div style={{
                      padding: '16px 20px',
                      background: 'rgba(127, 29, 29, 0.45)',
                      border: '1.5px solid #ef4444',
                      borderRadius: '8px',
                      color: '#fecaca',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                    }}>
                      <span style={{ fontSize: '28px' }}>⚠️</span>
                      <div>
                        <b style={{ color: '#f87171', fontSize: '14px' }}>
                          Incomplete Dataset: {stationProgress.trials.length} / 5 Trials Recorded
                        </b>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#fca5a5', lineHeight: 1.4 }}>
                          All 5 experimental measurement trials must be performed and recorded in Step 7 before mathematical computations, mean values, sample standard deviation, and percentage error quantification can be unlocked.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* 1. Per-Trial Formula Substitution Display */}
                      <div className="computation-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '16px' }}>
                        {stationProgress.trials.map((t, i) => {
                          if (stationId === 'circuits') {
                            const v = Number(t.measuredV ?? t.vs ?? 4.0);
                            const iA = Number(t.measuredI_A ?? (typeof t.measuredI_mA !== 'undefined' ? Number(t.measuredI_mA) / 1000 : null) ?? t.current ?? 0.00615);
                            const i_mA = Number(t.measuredI_mA ?? (iA * 1000));
                            const r = Number(t.resistance ?? ((v * 1000) / i_mA));
                            const currentInput = stationProgress.calculations?.[i] || r.toFixed(1);
                            return (
                              <div key={i} style={{ padding: '10px 8px', background: 'rgba(53, 18, 29, 0.9)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '8px', fontSize: '11px' }}>
                                <span style={{ color: '#d4af37', fontWeight: 700 }}>TRIAL #{i + 1}</span>
                                <div style={{ margin: '4px 0', fontFamily: 'monospace' }}>
                                  R_{i + 1} = V_{i + 1} / I_{i + 1}
                                </div>
                                <div style={{ color: '#94a3b8' }}>
                                  = {v.toFixed(2)}V / {i_mA.toFixed(2)}mA
                                </div>
                                <div style={{ fontWeight: 700, color: '#fef08a', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <span>=</span>
                                  <input
                                    type="text"
                                    value={currentInput}
                                    onChange={(e) => handleCalculationChange(i, e.target.value)}
                                    style={{ width: '56px', padding: '2px 4px', fontSize: '11px', background: '#090d16', color: '#fef08a', border: '1px solid #d4af37', borderRadius: '4px', textAlign: 'center', fontWeight: 700 }}
                                  />
                                  <span>Ω</span>
                                </div>
                              </div>
                            );
                          } else if (stationId === 'optics') {
                            const u = Number(t.u ?? t.paramA ?? 30);
                            const v = Number(t.v ?? t.measured ?? 60);
                            const f = Number(t.f_exp ?? ((u * v) / (u + v)));
                            const currentInput = stationProgress.calculations?.[i] || f.toFixed(2);
                            return (
                              <div key={i} style={{ padding: '10px 8px', background: 'rgba(53, 18, 29, 0.9)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '8px', fontSize: '11px' }}>
                                <span style={{ color: '#10b981', fontWeight: 700 }}>TRIAL #{i + 1}</span>
                                <div style={{ margin: '4px 0', fontFamily: 'monospace' }}>
                                  f_{i + 1} = (u·v)/(u+v)
                                </div>
                                <div style={{ color: '#94a3b8' }}>
                                  = ({u}·{v.toFixed(1)})/({u}+{v.toFixed(1)})
                                </div>
                                <div style={{ fontWeight: 700, color: '#34d399', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <span>=</span>
                                  <input
                                    type="text"
                                    value={currentInput}
                                    onChange={(e) => handleCalculationChange(i, e.target.value)}
                                    style={{ width: '56px', padding: '2px 4px', fontSize: '11px', background: '#090d16', color: '#34d399', border: '1px solid #10b981', borderRadius: '4px', textAlign: 'center', fontWeight: 700 }}
                                  />
                                  <span>cm</span>
                                </div>
                              </div>
                            );
                          } else {
                            const beta = Number(t.beta ?? 0.1);
                            const gamma = Number(t.measuredGamma ?? t.gamma ?? (1 / Math.sqrt(1 - beta * beta)));
                            const currentInput = stationProgress.calculations?.[i] || gamma.toFixed(4);
                            return (
                              <div key={i} style={{ padding: '10px 8px', background: 'rgba(53, 18, 29, 0.9)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '8px', fontSize: '11px' }}>
                                <span style={{ color: '#fef08a', fontWeight: 700 }}>TRIAL #{i + 1}</span>
                                <div style={{ margin: '4px 0', fontFamily: 'monospace' }}>
                                  γ_{i + 1} = 1/√(1-β²)
                                </div>
                                <div style={{ color: '#94a3b8' }}>
                                  = 1/√(1-{beta}²)
                                </div>
                                <div style={{ fontWeight: 700, color: '#fef08a', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <span>=</span>
                                  <input
                                    type="text"
                                    value={currentInput}
                                    onChange={(e) => handleCalculationChange(i, e.target.value)}
                                    style={{ width: '60px', padding: '2px 4px', fontSize: '11px', background: '#090d16', color: '#fef08a', border: '1px solid #d4af37', borderRadius: '4px', textAlign: 'center', fontWeight: 700 }}
                                  />
                                </div>
                              </div>
                            );
                          }
                        })}
                      </div>

                      {/* 2. Statistical Analysis & Error Quantification */}
                      {stationId === 'circuits' && circuitMetrics.mean !== null && (
                        <div className="stats-breakdown-card" style={{ padding: '14px', background: 'rgba(53, 18, 29, 0.9)', border: '1.5px solid rgba(212, 175, 55, 0.45)', borderRadius: '8px', marginBottom: '16px' }}>
                          <h5 style={{ margin: '0 0 10px', color: '#f8fafc' }}>Statistical Quantification & Error Metrics:</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            <div>
                              <b>1. Average Experimental Resistance (Rmean):</b>
                              <div style={{ fontFamily: 'monospace', color: '#fef08a', margin: '4px 0' }}>
                                Rmean = (R1 + R2 + R3 + R4 + R5) / 5 = {circuitMetrics.mean.toFixed(2)} Ω
                              </div>
                              <small style={{ color: '#94a3b8' }}>
                                Substituted: ({circuitMetrics.resistances.map((r) => r.toFixed(1)).join(' + ')}) / 5
                              </small>
                            </div>
                            <div>
                              <b>2. Sample Standard Deviation (s):</b>
                              <div style={{ fontFamily: 'monospace', color: '#fef08a', margin: '4px 0' }}>
                                s = √[ Σ(Ri - Rmean)² / (5 - 1) ] = {circuitMetrics.stdDev !== null ? circuitMetrics.stdDev.toFixed(3) : '—'} Ω
                              </div>
                              <small style={{ color: '#94a3b8' }}>
                                Standard Error of the Mean: SEM = s / √5 = {circuitMetrics.sem !== null ? circuitMetrics.sem.toFixed(3) : '—'} Ω
                              </small>
                            </div>
                            <div>
                              <b>3. Percentage Error vs. Nominal Resistor Specification (330.0 Ω):</b>
                              <div style={{ fontFamily: 'monospace', color: '#10b981', margin: '4px 0' }}>
                                Percentage Error = |Rmean - Rnom| / Rnom × 100% = {circuitMetrics.percentError !== null ? circuitMetrics.percentError.toFixed(2) : '—'}%
                              </div>
                              <small style={{ color: '#94a3b8' }}>
                                |{circuitMetrics.mean.toFixed(2)} - 330.0| / 330.0 × 100% (Within strict ±2% academic threshold)
                              </small>
                            </div>
                            <div>
                              <b>4. Resistor Specification & Power Rating:</b>
                              <div style={{ fontFamily: 'monospace', color: '#a855f7', margin: '4px 0' }}>
                                R = 330.0 Ω · 1 Watt Rating (Carbon Film Resistor)
                              </div>
                              <small style={{ color: '#94a3b8' }}>
                                Max permissible continuous current: Imax = √(P/R) = √(1.0/330) ≈ 55.0 mA
                              </small>
                            </div>
                          </div>
                        </div>
                      )}

                      {stationId === 'optics' && opticsMetrics.mean !== null && (
                        <div className="stats-breakdown-card" style={{ padding: '14px', background: 'rgba(53, 18, 29, 0.9)', border: '1.5px solid rgba(212, 175, 55, 0.45)', borderRadius: '8px', marginBottom: '16px' }}>
                          <h5 style={{ margin: '0 0 10px', color: '#f8fafc' }}>Optics Statistical Quantification:</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            <div>
                              <b>Average Experimental Focal Length (fmean):</b>
                              <div style={{ fontFamily: 'monospace', color: '#10b981', margin: '4px 0' }}>
                                fmean = Σ fi / 5 = {opticsMetrics.mean.toFixed(2)} cm
                              </div>
                            </div>
                            <div>
                              <b>Percentage Error vs. Nominal Focal Length (20.0 cm):</b>
                              <div style={{ fontFamily: 'monospace', color: '#10b981', margin: '4px 0' }}>
                                Percentage Error = |fmean - 20.0| / 20.0 × 100% = {opticsMetrics.percentError !== null ? opticsMetrics.percentError.toFixed(2) : '—'}%
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3. Least-Squares Linear Regression Plot & Substituted Formula */}
                      <div className="section-divider" style={{ margin: '16px 0 10px', borderBottom: '1px solid rgba(212, 175, 55, 0.4)', paddingBottom: '6px' }}>
                        <h5 style={{ margin: 0, color: '#fef08a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                          Section C: Least-Squares Linear Regression Analysis (Slope = R_exp ≈ 330 Ω)
                        </h5>
                      </div>

                      <Room3Graph stationId={stationId} trials={stationProgress.trials} accentColor={station.accent} />

                      {regression && stationId === 'circuits' && (
                        <div className="regression-substitution-card" style={{ padding: '12px', background: 'rgba(53, 18, 29, 0.9)', border: '1.5px solid rgba(212, 175, 55, 0.45)', borderRadius: '8px', marginTop: '12px' }}>
                          <b>Step-by-Step Least-Squares Substitution (V vs. I):</b>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', margin: '8px 0', fontSize: '11px', fontFamily: 'monospace' }}>
                            <div>Σ I = {regression.sumX.toFixed(5)} A</div>
                            <div>Σ V = {regression.sumY.toFixed(2)} V</div>
                            <div>Σ (I·V) = {regression.sumXY.toFixed(4)} W</div>
                            <div>Σ (I²) = {regression.sumX2.toFixed(6)} A²</div>
                          </div>
                          <div style={{ fontFamily: 'monospace', color: '#fef08a', fontSize: '13px' }}>
                            Slope m = [ N·Σ(I·V) - (ΣI)(ΣV) ] / [ N·Σ(I²) - (ΣI)² ]<br />
                            m = [ 5·({regression.sumXY.toFixed(4)}) - ({regression.sumX.toFixed(4)})·({regression.sumY.toFixed(2)}) ] / [ 5·({regression.sumX2.toFixed(6)}) - ({regression.sumX.toFixed(4)})² ] = <b>{regression.slope.toFixed(2)} Ω</b>
                          </div>
                          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                            Physical Interpretation: The slope <b>m = {regression.slope.toFixed(2)} Ω</b> directly represents the experimental resistance R_exp. With coefficient of determination <b>R² = {regression.rSquared.toFixed(5)}</b>, the empirical dataset conclusively confirms Ohm&apos;s Law (V = I·R) with linear precision.
                          </p>
                        </div>
                      )}

                      {/* SECTION D: SERIES VS. PARALLEL CIRCUIT COMPARATIVE ANALYSIS (STATION 01) */}
                      {stationId === 'circuits' && (
                        <div style={{ marginTop: '20px' }}>
                          <div className="section-divider" style={{ margin: '16px 0 10px', borderBottom: '1px solid rgba(212, 175, 55, 0.4)', paddingBottom: '6px' }}>
                            <h5 style={{ margin: 0, color: '#fef08a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              Section D: Series vs. Parallel Circuit Comparative Analysis (R1 = 100Ω, R2 = 220Ω, R3 = 330Ω at Vs = 6.0 V)
                            </h5>
                          </div>

                          <div className="table-scroll" style={{ marginBottom: '14px' }}>
                            <table className="trial-table">
                              <thead>
                                <tr>
                                  <th>Circuit Parameter</th>
                                  <th>Series Circuit (Exp C)</th>
                                  <th>Parallel Circuit (Exp D)</th>
                                  <th>Physical Principle / Scientific Law</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td><b>Equivalent Resistance (Req)</b></td>
                                  <td style={{ color: '#fef08a', fontWeight: 700 }}>650.0 Ω (R1 + R2 + R3)</td>
                                  <td style={{ color: '#38bdf8', fontWeight: 700 }}>56.90 Ω (1 / Σ(1/Rk))</td>
                                  <td>Parallel reduces resistance 11.4× below the smallest resistor</td>
                                </tr>
                                <tr>
                                  <td><b>Total Circuit Current (Itot at 6V)</b></td>
                                  <td style={{ color: '#d4af37' }}>9.23 mA (0.00923 A)</td>
                                  <td style={{ color: '#34d399' }}>105.45 mA (0.10545 A)</td>
                                  <td>Ohm&apos;s Law: Itot = Vs / Req (Parallel draws 11.4× more current)</td>
                                </tr>
                                <tr>
                                  <td><b>Current Behavior</b></td>
                                  <td>Identical everywhere (I1 = I2 = I3 = 9.23 mA)</td>
                                  <td>Branch division: I1 = 60.0 mA, I2 = 27.3 mA, I3 = 18.2 mA</td>
                                  <td>Kirchhoff&apos;s Current Law: Itot = I1 + I2 + I3</td>
                                </tr>
                                <tr>
                                  <td><b>Voltage Distribution</b></td>
                                  <td>Divides: V1 = 0.92V, V2 = 2.03V, V3 = 3.05V</td>
                                  <td>Identical across all: V1 = V2 = V3 = 6.00 V</td>
                                  <td>Kirchhoff&apos;s Voltage Law: Vs = Σ Vk (Series) vs Equal (Parallel)</td>
                                </tr>
                                <tr>
                                  <td><b>Total Power Dissipated (P = VI)</b></td>
                                  <td style={{ color: '#f59e0b' }}>0.0554 W (55.4 mW)</td>
                                  <td style={{ color: '#ef4444' }}>0.6327 W (632.7 mW)</td>
                                  <td>P = V² / Req (Parallel dissipates 11.4× more thermal energy)</td>
                                </tr>
                                <tr>
                                  <td><b>Impact of Open-Circuit Failure</b></td>
                                  <td>Entire circuit breaks; all current ceases (I = 0)</td>
                                  <td>Fault isolated; other parallel branches remain operational</td>
                                  <td>Universal engineering reason why building power distribution is parallel</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* 5 Student Conceptual Interpretation Questions */}
                          <div style={{ padding: '14px', background: 'rgba(53, 18, 29, 0.9)', border: '1.5px solid rgba(212, 175, 55, 0.45)', borderRadius: '8px' }}>
                            <h5 style={{ margin: '0 0 10px', color: '#f8fafc', fontSize: '13px' }}>
                              🎓 Student Conceptual Interpretation &amp; Laboratory Review:
                            </h5>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px' }}>
                              <div>
                                <b style={{ color: '#fef08a' }}>Q1. Why does equivalent resistance increase when adding resistors in series, but decrease when adding resistors in parallel?</b>
                                <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.4 }}>
                                  In series, each resistor adds obstacle length to the single charge flow path (Req = R1 + R2 + R3). In parallel, each resistor adds an additional alternative pathway (cross-sectional area) for charge to bypass, strictly decreasing total resistance: 1/Req = 1/R1 + 1/R2 + 1/R3 &lt; min(Rk).
                                </p>
                              </div>
                              <div>
                                <b style={{ color: '#fef08a' }}>Q2. Why does the largest resistor drop the most voltage in series, while the smallest resistor draws the most current in parallel?</b>
                                <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.4 }}>
                                  In series, current I is identical through all components; by V = I·R, voltage drop is directly proportional to resistance (R3 = 330Ω drops 3.05V vs R1 = 100Ω dropping 0.92V). In parallel, voltage V is identical across all branches; by I = V/R, current is inversely proportional to resistance, so the 100Ω branch carries 60.0 mA while the 330Ω branch carries only 18.2 mA.
                                </p>
                              </div>
                              <div>
                                <b style={{ color: '#fef08a' }}>Q3. How does total power dissipation compare between series and parallel connections across the same 6 V supply?</b>
                                <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.4 }}>
                                  Total power is P = V² / Req. Because Req is 11.4× smaller in parallel (56.9 Ω vs 650 Ω), the parallel arrangement consumes and dissipates 11.4× more power (0.633 W vs 0.055 W) from the exact same 6 V source.
                                </p>
                              </div>
                              <div>
                                <b style={{ color: '#fef08a' }}>Q4. If one component fails open-circuit in a series circuit versus in a parallel circuit, what happens to the remaining components?</b>
                                <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.4 }}>
                                  In series, an open failure creates an infinite-impedance break in the single loop, extinguishing current to all components. In parallel, an open branch leaves the independent voltage paths of other branches intact, allowing the remaining branches to operate continuously without interruption.
                                </p>
                              </div>
                              <div>
                                <b style={{ color: '#fef08a' }}>Q5. Explain how the slope of the voltage vs. current graph directly proves Ohm&apos;s Law (R = ΔV / ΔI).</b>
                                <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.4 }}>
                                  Ohm&apos;s Law defines linear proportionality between electric potential and current: V = R·I. When plotted with Current on the x-axis and Voltage on the y-axis, the gradient ΔV / ΔI is constant and directly equals the resistance (m ≈ 330.0 Ω with R² ≥ 0.999).
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* 4. Formative Assessment Questions */}
                  <div className="guided-questions-container" style={{ marginTop: '18px' }}>
                    <b>Formative Assessment Questions:</b>
                    {ROOM3_GUIDE_QUESTIONS[stationId].map((q, qIdx) => {
                      const userChoice = stationProgress.guideAnswers?.[qIdx] ?? -1;
                      return (
                        <div key={q.id} className="guide-question-block" style={{ marginTop: '10px' }}>
                          <p className="q-title"><b>Q{qIdx + 1}:</b> {q.question}</p>
                          <div className="q-options-list">
                            {q.options.map((opt, optIdx) => (
                              <button
                                key={opt}
                                type="button"
                                className={`q-opt-btn ${userChoice === optIdx ? (optIdx === q.correctIndex ? 'correct' : 'incorrect') : ''}`}
                                onClick={() => handleGuideAnswer(qIdx, optIdx)}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                          {userChoice === q.correctIndex && (
                            <div className="q-explanation">✓ {q.explanation}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 5. Identified Sources of Uncertainty */}
                  <div className="errors-checklist" style={{ marginTop: '16px' }}>
                    <b>Identified Sources of Experimental Uncertainty:</b>
                    {station.errors.map((err) => (
                      <label key={err} className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={stationProgress.errors.includes(err)}
                          onChange={() => toggleErrorSource(err)}
                        />
                        <span>{err}</span>
                      </label>
                    ))}
                  </div>

                  {/* 6. Scientific Observations & Deductions */}
                  <div className="text-area-group" style={{ marginTop: '16px' }}>
                    <label>
                      <b>Scientific Observations & Deductions:</b>
                      <textarea
                        rows={3}
                        value={stationProgress.analysis}
                        placeholder="Detail your empirical findings regarding governing laws, slopes, and linear circuit behavior..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setProgress((prev) => ({
                            ...prev,
                            [stationId]: { ...prev[stationId], analysis: val },
                          }));
                        }}
                      />
                    </label>
                  </div>

                  {/* 7. Student Metadata & Certification Card */}
                  <div className="certification-card" style={{ marginTop: '18px' }}>
                    <div className="cert-header">
                      <span className="cert-seal">🎓</span>
                      <h5>Physics 300 Certified Experimental Record</h5>
                    </div>

                    <div className="student-metadata-fields student-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', margin: '14px 0' }}>
                      <label>
                        <span>Student Name:</span>
                        <input
                          type="text"
                          style={{ padding: '8px 12px', marginTop: '4px' }}
                          value={studentName}
                          onChange={(e) => setStudentName(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Student ID:</span>
                        <input
                          type="text"
                          style={{ padding: '8px 12px', marginTop: '4px' }}
                          value={studentId}
                          onChange={(e) => setStudentId(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Course Section:</span>
                        <input
                          type="text"
                          style={{ padding: '8px 12px', marginTop: '4px' }}
                          value={studentSection}
                          onChange={(e) => setStudentSection(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="station-score-summary">
                      <div className="score-badge-circle">
                        <b>{currentScore}</b>
                        <span>/ 100 PTS</span>
                      </div>
                      <p>
                        Station Status:{' '}
                        <b>{currentScore >= 100 ? 'Mastery Certified (100%)' : `${currentScore}% Completed`}</b>
                      </p>
                    </div>
                  </div>

                  {calculationFeedback && (
                    <div className={`feedback-alert ${calculationStatus}`} style={{ marginTop: '14px' }}>
                      {calculationFeedback}
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="notebook-action"
                      onClick={downloadCSVData}
                    >
                      📊 Export Experimental Data (CSV)
                    </button>
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={!reportReady}
                      style={{
                        background: reportReady ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'rgba(51, 65, 85, 0.4)',
                        borderColor: reportReady ? '#38bdf8' : '#475569',
                        color: reportReady ? '#fff' : '#94a3b8',
                        cursor: reportReady ? 'pointer' : 'not-allowed',
                        opacity: reportReady ? 1 : 0.6,
                        fontWeight: 700,
                      }}
                      onClick={downloadReportPdf}
                      title={!reportReady ? 'Complete all 5 3D trials, verify Step 8 computation, answer analysis questions, and fill student credentials to unlock report certification.' : 'Download Official Certified PDF Report'}
                    >
                      {reportReady ? '📄 Download Certified PDF Report' : '🔒 Certified Report Locked'}
                    </button>
                    <button
                      type="button"
                      className="notebook-action"
                      style={{ background: '#059669', borderColor: '#10b981', fontWeight: 700 }}
                      disabled={stationProgress.completed[7]}
                      onClick={verifyCalculations}
                    >
                      {stationProgress.completed[7] ? '✓ Step 8 Complete (20/20 pts) · Certified' : 'Complete Step 8 & Certify Lab Notebook (+20 pts)'}
                    </button>
                  </div>

                  {/* Certification Prerequisites Checklist */}
                  <div style={{
                    marginTop: '14px',
                    padding: '12px 14px',
                    background: 'rgba(35, 12, 20, 0.85)',
                    border: '1px solid rgba(212, 175, 55, 0.35)',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}>
                    <b style={{ color: '#d4af37', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Official Certification Prerequisites ({[allTrialsLogged, isComputationVerified, allGuideCorrect, isStudentInfoFilled].filter(Boolean).length} / 4 Met):
                    </b>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '8px' }}>
                      <span style={{ color: allTrialsLogged ? '#34d399' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{allTrialsLogged ? '✅' : '⏳'}</span>
                        <b>5 3D Trials Logged:</b> {stationProgress.trials.length} / 5
                      </span>
                      <span style={{ color: isComputationVerified ? '#34d399' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{isComputationVerified ? '✅' : '⏳'}</span>
                        <b>Step 8 Computation:</b> {isComputationVerified ? 'Verified' : 'Pending Verification'}
                      </span>
                      <span style={{ color: allGuideCorrect ? '#34d399' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{allGuideCorrect ? '✅' : '⏳'}</span>
                        <b>Analysis Questions:</b> {allGuideCorrect ? 'All Correct' : 'Pending 100%'}
                      </span>
                      <span style={{ color: isStudentInfoFilled ? '#34d399' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{isStudentInfoFilled ? '✅' : '⏳'}</span>
                        <b>Student Credentials:</b> {isStudentInfoFilled ? 'Complete' : 'Name, ID & Sec Required'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
                </div>
              </div>
            </div>

            {/* Modal Navigation Footer */}
            <footer className="notebook-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setNotebookOpen(false)}
              >
                Close notebook
              </button>
              <div className="button-group">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={notebookStep <= 0}
                  onClick={() => setNotebookStep((s) => Math.max(0, s - 1))}
                >
                  ← Previous step
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={notebookStep >= 7 || (notebookStep >= stationProgress.currentStep && !stationProgress.completed[notebookStep])}
                  onClick={() => setNotebookStep((s) => Math.min(7, s + 1))}
                >
                  Next step →
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {/* 3D Graphics & Visual Settings Modal */}
      <Room3GraphicsModal
        isOpen={graphicsModalOpen}
        onClose={() => setGraphicsModalOpen(false)}
        settings={graphicsSettings}
        onApply={handleApplyGraphicsSettings}
        perfStats={perfStats}
        playTone={playTone}
      />
    </main>
  );
}
