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
  ROOM3_GUIDE_QUESTIONS,
  ROOM3_STATIONS,
  STEP_NAMES,
  STEP_POINTS,
  TOTAL_TRIALS,
  calculateCircuit,
  calculateOptics,
  calculateRelativity,
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

const STORAGE_KEY = 'physics_lab_room_3_progress';

const INSPECTION_TARGETS: Record<Room3StationId, string[]> = {
  circuits: ['circuits-power-switch', 'circuits-voltage-knob', 'circuits-oscilloscope', 'circuits-topology-selector'],
  optics: ['optics-laser', 'optics-angle-dial', 'optics-screen'],
  relativity: ['relativity-velocity-dial', 'relativity-light-clock', 'relativity-contracting-rod'],
};

const GUIDANCE_LABELS: Record<string, string> = {
  'circuits-placard': 'circuits reference board',
  'circuits-power-switch': 'power supply switch',
  'circuits-voltage-knob': 'voltage regulator dial',
  'circuits-oscilloscope': 'oscilloscope display',
  'circuits-topology-selector': 'RLC breadboard matrix',
  'circuits-clipboard': 'circuit trials clipboard',
  'optics-placard': 'optics reference board',
  'optics-laser': 'tunable laser source',
  'optics-angle-dial': 'goniometer prism dial',
  'optics-screen': 'interference observation screen',
  'optics-clipboard': 'optics trials clipboard',
  'relativity-placard': 'relativity reference board',
  'relativity-velocity-dial': 'relativistic velocity dial',
  'relativity-contracting-rod': 'contracting meter-rod',
  'relativity-light-clock': 'atomic light-clock',
  'relativity-clipboard': 'relativity trials clipboard',
  'campus-door': 'corridor exit doors',
};

const INSPECTION_TARGET: Record<Room3StationId, string> = {
  circuits: 'circuits-oscilloscope',
  optics: 'optics-laser',
  relativity: 'relativity-light-clock',
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
  const [isThirdPerson, setIsThirdPerson] = useState(false);
  const [activeCharacter, setActiveCharacter] = useState<CharacterType>('female');
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

  const handleSetCloseupFocus = (focus: 'station' | 'board' | 'multimeter' | 'psu') => {
    setCloseupFocus(focus);
    sceneApi.current?.setCloseupFocus?.(focus);
  };

  // Student-Centered Experience Modes ('guided' | 'practice' | 'advanced')
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(() => {
    if (typeof window !== 'undefined') {
      const m = new URLSearchParams(window.location.search).get('mode') as ExperienceMode;
      if (m && ['guided', 'practice', 'advanced'].includes(m)) return m;
    }
    return 'guided';
  });
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [showGuidedHint, setShowGuidedHint] = useState(false);

  // Reset guided step on station change
  useEffect(() => {
    setGuidedStepIndex(0);
    setShowGuidedHint(false);
  }, [stationId]);

  // Station Definitions & Telemetry Derived States
  const station = ROOM3_STATIONS[stationId];
  const stationProgress = progress[stationId];
  const circuitResult = useMemo(() => calculateCircuit(circuits), [circuits]);
  const opticsResult = useMemo(() => calculateOptics(optics), [optics]);
  const relativityResult = useMemo(() => calculateRelativity(relativity), [relativity]);

  // Derived Curriculum & Guided Validation
  const currentCurriculum = STATION_CURRICULUM[stationId];
  const currentGuidedStep = currentCurriculum?.steps[guidedStepIndex] ?? currentCurriculum?.steps[0];

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
  const steps1to7Done = useMemo(() => {
    return stationProgress.completed.slice(0, 7).every(Boolean);
  }, [stationProgress.completed]);
  const reportReady = steps1to7Done && studentName.trim().length > 0 && studentId.trim().length > 0 && studentSection.trim().length > 0;

  // Scoring
  const currentScore = stationScore(stationProgress);
  const totalScore = (Object.keys(progress) as Room3StationId[]).reduce(
    (total, id) => total + stationScore(progress[id]),
    0
  );

  const missingInspection = INSPECTION_TARGETS[stationId]?.find((id) => !stationProgress.inspected.includes(id));
  const guidanceTarget = stationProgress.currentStep === 0
    ? (missingInspection ?? INSPECTION_TARGET[stationId])
    : stationProgress.currentStep === 1
      ? `${stationId}-placard`
      : stationProgress.currentStep === 2
        ? RUN_TARGET[stationId]
        : stationProgress.currentStep === 3
          ? RUN_TARGET[stationId]
          : stationProgress.currentStep === 4
            ? `${stationId}-clipboard`
            : `${stationId}-clipboard`;

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
        onCloseupHover: (text) => setCloseupHoverText(text),
      });
      sceneApi.current = api;
      if (typeof window !== 'undefined') {
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

  const applyPreset = (preset: 'source_v' | 'r1_v' | 'series_i' | 'r1_ohm' | 'continuity') => {
    if (preset === 'source_v') {
      handleSetDmmMode('v_dc');
      handleSetDmmJack('v_ohm');
      handleSetProbe('red', 'SRC_POS');
      handleSetProbe('black', 'SRC_NEG');
      setCircuits((c) => ({ ...c, powerOn: true, vs: 24.0 }));
    } else if (preset === 'r1_v') {
      handleSetDmmMode('v_dc');
      handleSetDmmJack('v_ohm');
      handleSetProbe('red', 'R1_A');
      handleSetProbe('black', 'R1_B');
      setCircuits((c) => ({ ...c, powerOn: true, vs: 24.0 }));
    } else if (preset === 'series_i') {
      if (jumperClosed) handleToggleJumper();
      handleSetDmmJack('ma_10a');
      handleSetDmmMode('a_dc');
      handleSetProbe('red', 'SERIES_JACK_A');
      handleSetProbe('black', 'SERIES_JACK_B');
      setCircuits((c) => ({ ...c, powerOn: true, vs: 24.0 }));
    } else if (preset === 'r1_ohm') {
      setCircuits((c) => ({ ...c, powerOn: false }));
      handleSetDmmMode('ohm');
      handleSetDmmJack('v_ohm');
      handleSetProbe('red', 'R1_A');
      handleSetProbe('black', 'R1_B');
    } else if (preset === 'continuity') {
      handleSetDmmMode('cont');
      handleSetDmmJack('v_ohm');
      handleSetProbe('red', 'R1_A');
      handleSetProbe('black', 'R1_A');
    }
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

  const handleEquipmentAction = (id: string) => {
    playTone(440, 'triangle', 0.08, 0.2);
    if (id === 'campus-door') {
      sceneApi.current?.openDoor(() => {
        window.location.href = '/';
      });
      return;
    }
    // Inspect tracking for Step 0
    setProgress((prev) => {
      const st = { ...prev[stationId] };
      if (!st.inspected.includes(id)) {
        const inspected = [...st.inspected, id];
        return {
          ...prev,
          [stationId]: { ...st, inspected },
        };
      }
      return prev;
    });

    if (id.includes('placard') || id.includes('clipboard')) {
      setNotebookOpen(true);
    } else if (['circuits-multimeter', 'circuits-power-switch', 'circuits-topology-selector', 'circuits-oscilloscope'].includes(id)) {
      handleSetCloseup('closeup');
    } else if (['optics-laser', 'optics-angle-dial', 'optics-submode-toggle', 'optics-screen'].includes(id)) {
      handleSetCloseup('closeup');
    } else if (['relativity-velocity-dial', 'relativity-contracting-rod', 'relativity-light-clock'].includes(id)) {
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
        }
      }
    };
    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction, cameraMode, activeWorkspaceView]);

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

  // Trial Logging Helper with Duplicate Rejection & Experimental Noise
  const recordCurrentTrial = () => {
    if (stationProgress.trials.length >= TOTAL_TRIALS) return;

    // Check duplicate against existing trials
    let isDuplicate = false;
    if (stationId === 'circuits') {
      isDuplicate = stationProgress.trials.some(
        (t) =>
          Math.abs(Number(t.vs) - circuits.vs) < 1.0 &&
          t.mode === circuits.mode.toUpperCase() &&
          t.topology === circuits.topology &&
          Math.abs(Number(t.freq) - (circuits.mode === 'ac' ? circuits.freq : 0)) < 1.0
      );
    } else if (stationId === 'optics') {
      isDuplicate = stationProgress.trials.some((t) => {
        if (t.subMode !== optics.subMode || t.wavelength !== optics.wavelength) return false;
        if (optics.subMode === 'refraction') {
          return Math.abs(Number(t.paramA) - optics.theta1) < 2.0 && Math.abs(Number(t.paramB) - opticsResult.effectiveN2) < 0.02;
        } else if (optics.subMode === 'imaging') {
          return Math.abs(Number(t.paramA) - optics.objectDistance) < 5.0 && Math.abs(Number(t.paramB) - optics.focalLength) < 1.0;
        } else {
          return Math.abs(Number(t.paramA) - optics.slitSeparation) < 0.05 && Math.abs(Number(t.paramB) - optics.screenDistance) < 0.1;
        }
      });
    } else {
      isDuplicate = stationProgress.trials.some(
        (t) => Math.abs(Number(t.beta) - relativity.beta) < 0.05 && t.preset === relativity.massPreset
      );
    }

    if (isDuplicate) {
      setMeasurementWarning('Duplicate Measurement Rejected: Vary your input parameter (ΔVs ≥ 1 V, Δθ₁ ≥ 2°, Δdo ≥ 5 cm, or Δβ ≥ 0.05c) to record a distinct experimental data point.');
      playTone(220, 'sawtooth', 0.2, 0.25);
      return;
    }

    setMeasurementWarning('');
    playTone(600, 'square', 0.1, 0.2);

    let newTrial: TrialRecord;
    const trialNum = stationProgress.trials.length + 1;

    if (stationId === 'circuits') {
      const adcNoise = 1 + (Math.sin(trialNum * 13.7) * 0.003); // ±0.3% ADC display fluctuation
      const measuredCurrent = circuitResult.current * (circuitResult.current > 0 ? adcNoise : 1);
      const measuredPower = circuitResult.realPower * (circuitResult.realPower > 0 ? adcNoise : 1);

      newTrial = {
        trial: trialNum,
        mode: circuits.mode.toUpperCase(),
        topology: circuits.topology,
        vs: circuits.vs,
        freq: circuits.mode === 'ac' ? circuits.freq : 0,
        impedance: circuitResult.impedance,
        current: measuredCurrent,
        powerFactor: circuitResult.powerFactor,
        realPower: measuredPower,
      };
    } else if (stationId === 'optics') {
      let paramA = 0;
      let paramB = 0;
      let theoretical = 0;
      let measured = 0;
      let classification = '';

      if (optics.subMode === 'refraction') {
        paramA = optics.theta1;
        paramB = opticsResult.effectiveN2;
        theoretical = opticsResult.theta2Deg ?? 0;
        measured = theoretical * (1 + (Math.sin(trialNum * 11.3) * 0.015)); // +/- 1.5% measurement noise
        classification = opticsResult.isTIR ? 'TIR' : 'Refracted';
      } else if (optics.subMode === 'imaging') {
        paramA = optics.objectDistance;
        paramB = optics.focalLength;
        theoretical = opticsResult.imageDistanceCm ?? 0;
        measured = theoretical !== 0 ? theoretical * (1 + (Math.sin(trialNum * 11.3) * 0.015)) : 0;
        classification = `${opticsResult.imageType} · ${opticsResult.imageOrientation}`;
      } else {
        paramA = optics.slitSeparation;
        paramB = optics.screenDistance;
        theoretical = opticsResult.fringeSpacingMm;
        measured = theoretical * (1 + (Math.sin(trialNum * 11.3) * 0.015));
        classification = `λ=${optics.wavelength}nm`;
      }

      const percentError = Math.abs((measured - theoretical) / Math.max(0.01, theoretical)) * 100;

      newTrial = {
        trial: trialNum,
        subMode: optics.subMode,
        wavelength: optics.wavelength,
        paramA,
        paramB,
        theoretical,
        measured,
        percentError,
        classification,
      };
    } else {
      const jitter = 1 + (Math.sin(trialNum * 7.9) * 0.004); // ±0.4% detector jitter
      newTrial = {
        trial: trialNum,
        preset: relativity.massPreset,
        beta: relativity.beta,
        speed: relativityResult.speedMps,
        gamma: relativityResult.gamma,
        measuredGamma: relativityResult.gamma * jitter,
        dilatedTime: relativityResult.dilatedTime * jitter,
        contractedLength: relativityResult.contractedLength * jitter,
        kineticEnergy: relativityResult.kineticEnergyMeV,
        totalEnergy: relativityResult.totalEnergyMeV,
      };
    }

    setProgress((prev) => {
      const st = { ...prev[stationId] };
      const updatedTrials = [...st.trials, newTrial];
      const isComplete = updatedTrials.length >= TOTAL_TRIALS;
      const completed = [...st.completed];
      if (isComplete && !completed[4]) {
        completed[4] = true;
        playSuccessChime();
      }
      return {
        ...prev,
        [stationId]: {
          ...st,
          trials: updatedTrials,
          completed,
          currentStep: isComplete ? Math.max(st.currentStep, 5) : st.currentStep,
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

    // Auto-complete corresponding notebook steps based on guided step
    setProgress((prev) => {
      const sp = { ...prev[stationId] };
      const completed = [...sp.completed];
      if (stationId === 'circuits') {
        if (guidedStepIndex === 0) {
          completed[0] = true;
          sp.inspected = Array.from(new Set([...sp.inspected, 'circuits-power-switch', 'circuits-multimeter', 'circuits-topology-selector']));
        } else if (guidedStepIndex === 1) {
          completed[1] = true;
          sp.predictionAnswer = station.prediction.answer;
        } else if (guidedStepIndex === 2 || guidedStepIndex === 3) {
          completed[2] = true;
          sp.setupActions = Array.from(new Set([...sp.setupActions, 'dmm-mode-set', 'leads-connected']));
        } else if (guidedStepIndex === 4 || guidedStepIndex === 5 || guidedStepIndex === 6) {
          completed[3] = true;
          completed[4] = true;
        } else if (guidedStepIndex === 7) {
          completed[5] = true;
          completed[6] = true;
        }
      } else if (stationId === 'optics') {
        if (guidedStepIndex === 0) {
          completed[0] = true;
          sp.inspected = Array.from(new Set([...sp.inspected, 'optics-laser', 'optics-angle-dial', 'optics-screen']));
        } else if (guidedStepIndex === 1) {
          completed[1] = true;
          sp.predictionAnswer = station.prediction.answer;
          completed[2] = true;
        } else if (guidedStepIndex === 2 || guidedStepIndex === 3) {
          completed[3] = true;
          completed[4] = true;
        } else if (guidedStepIndex === 4) {
          completed[5] = true;
          completed[6] = true;
        }
      } else {
        if (guidedStepIndex === 0) {
          completed[0] = true;
          sp.inspected = Array.from(new Set([...sp.inspected, 'relativity-velocity-dial', 'relativity-light-clock', 'relativity-contracting-rod']));
        } else if (guidedStepIndex === 1) {
          completed[1] = true;
          sp.predictionAnswer = station.prediction.answer;
        } else if (guidedStepIndex === 2 || guidedStepIndex === 3) {
          completed[2] = true;
          completed[3] = true;
          completed[4] = true;
        } else if (guidedStepIndex === 4) {
          completed[5] = true;
          completed[6] = true;
        }
      }
      return { ...prev, [stationId]: { ...sp, completed } };
    });

    // Auto-record trial measurements for empirical steps
    if (stationId === 'circuits' && (guidedStepIndex === 4 || guidedStepIndex === 5 || guidedStepIndex === 6)) {
      recordCurrentTrial();
    } else if (stationId === 'optics' && (guidedStepIndex === 2 || guidedStepIndex === 3 || guidedStepIndex === 4)) {
      recordCurrentTrial();
    } else if (stationId === 'relativity' && (guidedStepIndex === 1 || guidedStepIndex === 2 || guidedStepIndex === 3 || guidedStepIndex === 4)) {
      recordCurrentTrial();
    }

    const totalSteps = currentCurriculum?.steps.length ?? 1;
    if (guidedStepIndex < totalSteps - 1) {
      setGuidedStepIndex((prev) => prev + 1);
      setShowGuidedHint(false);
    } else {
      setNotebookOpen(true);
      setNotebookStep(6);
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

  // Step 6 Theoretical Calculations verification (Strict ±2% tolerance)
  const verifyCalculations = () => {
    const trials = stationProgress.trials;
    if (trials.length < TOTAL_TRIALS) {
      setCalculationFeedback('Please record all 5 trials in Step 5 before verifying theoretical calculations.');
      setCalculationStatus('incorrect');
      return;
    }

    const hasEmpty = stationProgress.calculations.some((c) => !c || c.trim() === '');
    if (hasEmpty) {
      setCalculationFeedback('Please enter calculated values for all 5 trials before submitting verification.');
      setCalculationStatus('incorrect');
      return;
    }

    for (let i = 0; i < trials.length; i++) {
      const t = trials[i];
      const userVal = parseFloat(stationProgress.calculations[i]);
      let expected = 0;
      if (stationId === 'circuits') {
        expected = Number(t.impedance);
      } else if (stationId === 'optics') {
        expected = Number(t.theoretical);
      } else {
        expected = Number(t.gamma);
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
    completeStep(5);
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
      'CERTIFIED ADVANCED LABORATORY EXPERIMENTAL RECORD',
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
      className="lab-shell"
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
            onSetExperienceMode={setExperienceMode}
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
                  style={{ background: 'rgba(2, 132, 199, 0.3)', border: '1px solid #0284c7', color: '#38bdf8' }}
                  onClick={() => setActiveWorkspaceView('circuit_workspace')}
                >
                  ⚡ Breadboard 3D (DCACLab)
                </button>
              </div>
            )}
            <button
              type="button"
              className="closeup-exit-button"
              onClick={() => handleSetCloseup('walk')}
            >
              ← Exit Close-Up [ESC / E]
            </button>
          </div>

          {stationId === 'circuits' && (
            <div className="closeup-circuits-quickbar">
              <div className="closeup-guidance-pill">
                <span className="step-tag">CURRENT TASK</span>
                <span className="step-text">
                  {currentGuidedStep ? currentGuidedStep.action : 'Measure voltage and current with multimeter'}
                </span>
                {currentGuidedStep?.expectedResult && (
                  <span className="expected-pill">🎯 Target: {currentGuidedStep.expectedResult}</span>
                )}
              </div>
              <div className="closeup-quick-buttons">
                <span className="quick-title">⚡ Quick Probes:</span>
                <button
                  type="button"
                  className={`quick-chip ${redTerminal === 'R1_A' && blackTerminal === 'R1_B' ? 'active' : ''}`}
                  onClick={() => handleQuickProbe('r1')}
                >
                  Across R1 (3.7V)
                </button>
                <button
                  type="button"
                  className={`quick-chip ${redTerminal === 'R2_A' && blackTerminal === 'R2_B' ? 'active' : ''}`}
                  onClick={() => handleQuickProbe('r2')}
                >
                  Across R2 (8.1V)
                </button>
                <button
                  type="button"
                  className={`quick-chip ${redTerminal === 'R3_A' && blackTerminal === 'R3_B' ? 'active' : ''}`}
                  onClick={() => handleQuickProbe('r3')}
                >
                  Across R3 (12.2V)
                </button>
                <button
                  type="button"
                  className={`quick-chip ${redTerminal === 'SRC_POS' && blackTerminal === 'SRC_NEG' ? 'active' : ''}`}
                  onClick={() => handleQuickProbe('psu')}
                >
                  Across PSU (24V)
                </button>
                <button
                  type="button"
                  className={`quick-chip ${redTerminal === 'SERIES_JACK_A' && blackTerminal === 'SERIES_JACK_B' ? 'active' : ''}`}
                  onClick={() => handleQuickProbe('series')}
                >
                  Series Ammeter (36.9 mA)
                </button>
                <button
                  type="button"
                  className="quick-chip outline"
                  onClick={() => handleQuickProbe('park')}
                >
                  Disconnect Probes
                </button>
              </div>
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
          <b>ENTER WALK MODE</b><span>Click to capture the mouse · ESC releases it</span>
        </button>
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

      {/* Left Objective Panel */}
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
          <div className="guidance-line">
            <span>↓</span>
            <div>
              <b>IN-WORLD GUIDE ACTIVE</b>
              <small>Follow the pulsing marker to the {GUIDANCE_LABELS[guidanceTarget] || 'apparatus'}.</small>
            </div>
          </div>
        )}
        <div className="progress-track"><span style={{ width: `${(stationProgress.completed.filter(Boolean).length / 8) * 100}%` }} /></div>
      </section>

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

        {/* Experience Mode Selector (Guided Experiment vs Practice vs Advanced Lab) */}
        <div className="experience-mode-selector" role="tablist" aria-label="Experiment Experience Mode">
          <button
            type="button"
            role="tab"
            aria-selected={experienceMode === 'guided'}
            className={`mode-tab-btn ${experienceMode === 'guided' ? 'active' : ''}`}
            onClick={() => setExperienceMode('guided')}
          >
            <span className="mode-tab-icon">🎓</span>
            <div className="mode-tab-text">
              <span className="mode-tab-label">Guided Experiment</span>
              <span className="mode-tab-badge">Recommended</span>
            </div>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={experienceMode === 'practice'}
            className={`mode-tab-btn ${experienceMode === 'practice' ? 'active' : ''}`}
            onClick={() => setExperienceMode('practice')}
          >
            <span className="mode-tab-icon">🛠️</span>
            <div className="mode-tab-text">
              <span className="mode-tab-label">Practice</span>
            </div>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={experienceMode === 'advanced'}
            className={`mode-tab-btn ${experienceMode === 'advanced' ? 'active' : ''}`}
            onClick={() => setExperienceMode('advanced')}
          >
            <span className="mode-tab-icon">🔬</span>
            <div className="mode-tab-text">
              <span className="mode-tab-label">Advanced Lab</span>
            </div>
          </button>
        </div>

        {/* MODE 1: GUIDED EXPERIMENT PANEL */}
        {experienceMode === 'guided' && currentCurriculum && (
          <div className="guided-curriculum-panel">
            <div className="guided-curriculum-header">
              <h3>{currentCurriculum.experimentTitle}</h3>
              <p>{currentCurriculum.learningGoal}</p>
            </div>

            {/* Stepper Progress Dots */}
            <div className="guided-stepper-row" role="tablist" aria-label="Experiment Steps">
              {currentCurriculum.steps.map((st, idx) => {
                const isCur = idx === guidedStepIndex;
                const isPassed = idx < guidedStepIndex;
                return (
                  <button
                    key={st.id}
                    type="button"
                    className={`guided-step-dot ${isCur ? 'active' : ''} ${isPassed ? 'completed' : ''}`}
                    onClick={() => {
                      setGuidedStepIndex(idx);
                      setShowGuidedHint(false);
                    }}
                    title={st.title}
                  >
                    {isPassed ? '✓' : idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Structured Step Instruction Card */}
            <div className="guided-instruction-card">
              <div className="guided-step-title-row">
                <h4>{currentGuidedStep.title}</h4>
                <span className="step-points-pill">Step {guidedStepIndex + 1}/{currentCurriculum.steps.length}</span>
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
                  disabled={guidedStepIndex === 0}
                  onClick={() => {
                    setGuidedStepIndex((prev) => Math.max(0, prev - 1));
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
                  {guidedStepIndex === currentCurriculum.steps.length - 1
                    ? 'Complete & Open Notebook →'
                    : `Continue Step ${guidedStepIndex + 2} →`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODE 2: PRACTICE SAFETY & DIAGNOSTICS BANNER */}
        {experienceMode === 'practice' && (
          <div className="practice-safety-banner">
            <h4>🛠️ Independent Practice Workbench</h4>
            <p>Freely manipulate instruments and test physical hypotheses. Active safety monitors will notify you of circuit errors or instrument damage.</p>
            {dmmReading.tripFuse ? (
              <div className="guided-validation-badge hazard">
                <span>⚠️ BLOWN FUSE: Current shunt was connected in parallel across the voltage source!</span>
                <button type="button" className="dmm-btn" style={{ background: '#b91c1c', color: '#fff', marginTop: '4px' }} onClick={handleResetFuse}>
                  ↺ Reset Blown Fuse
                </button>
              </div>
            ) : dmmJack === 'ma_10a' && (dmmMode === 'v_dc' || dmmMode === 'v_ac') ? (
              <div className="guided-validation-badge hazard">
                <span>⚠️ LEAD MISMATCH: Red lead in mA/10A current jack while dial is set to Voltage!</span>
              </div>
            ) : dmmMode === 'ohm' && circuits.powerOn && stationId === 'circuits' ? (
              <div className="guided-validation-badge hazard">
                <span>⚠️ LIVE CIRCUIT: Turn OFF power supply before measuring resistance.</span>
              </div>
            ) : (
              <div className="guided-validation-badge passed">
                <span>✓ Instrument Status Normal. Readout: {dmmReading.displayString} ({dmmReading.unit})</span>
              </div>
            )}
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

              {/* Quick Probe Placement Chips */}
              <div style={{ marginTop: '2px' }}>
                <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '3px', fontWeight: 700 }}>
                  ⚡ QUICK PROBE CONNECTION:
                </label>
                <div className="quick-probe-chips">
                  <button
                    type="button"
                    className={`probe-chip-btn ${redTerminal === 'SRC_POS' && blackTerminal === 'SRC_NEG' ? 'active' : ''}`}
                    onClick={() => handleQuickProbe('psu')}
                  >
                    Across PSU (24V)
                  </button>
                  <button
                    type="button"
                    className={`probe-chip-btn ${redTerminal === 'R1_A' && blackTerminal === 'R1_B' ? 'active' : ''}`}
                    onClick={() => handleQuickProbe('r1')}
                  >
                    Across R1 (3.7V)
                  </button>
                  <button
                    type="button"
                    className={`probe-chip-btn ${redTerminal === 'R2_A' && blackTerminal === 'R2_B' ? 'active' : ''}`}
                    onClick={() => handleQuickProbe('r2')}
                  >
                    Across R2 (8.1V)
                  </button>
                  <button
                    type="button"
                    className={`probe-chip-btn ${redTerminal === 'R3_A' && blackTerminal === 'R3_B' ? 'active' : ''}`}
                    onClick={() => handleQuickProbe('r3')}
                  >
                    Across R3 (12.2V)
                  </button>
                  <button
                    type="button"
                    className={`probe-chip-btn ${redTerminal === 'SERIES_JACK_A' && blackTerminal === 'SERIES_JACK_B' ? 'active' : ''}`}
                    onClick={() => handleQuickProbe('series')}
                  >
                    Series Break (Ammeter)
                  </button>
                  <button
                    type="button"
                    className={`probe-chip-btn ${redTerminal === null && blackTerminal === null ? 'active' : ''}`}
                    onClick={() => handleQuickProbe('park')}
                  >
                    Disconnect
                  </button>
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

              {/* Guided Procedure Presets (Available in Practice & Advanced Modes) */}
              {experienceMode !== 'guided' && (
                <div className="dmm-preset-row">
                  <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>
                    EXPERIMENTAL PROCEDURE PRESETS:
                  </label>
                  <button
                    type="button"
                    className="dmm-preset-btn"
                    onClick={() => applyPreset('source_v')}
                  >
                    ▶ 1. Measure Source Voltage (24.00 V in parallel)
                  </button>
                  <button
                    type="button"
                    className="dmm-preset-btn"
                    onClick={() => applyPreset('r1_v')}
                  >
                    ▶ 2. Measure R1 Voltage Drop (3.69 V across R1)
                  </button>
                  <button
                    type="button"
                    className="dmm-preset-btn"
                    onClick={() => applyPreset('series_i')}
                  >
                    ▶ 3. Insert Ammeter in Series (36.92 mA series loop)
                  </button>
                  <button
                    type="button"
                    className="dmm-preset-btn"
                    onClick={() => applyPreset('r1_ohm')}
                  >
                    ▶ 4. Measure R1 Resistance (100.0 Ω unpowered)
                  </button>
                  <button
                    type="button"
                    className="dmm-preset-btn"
                    onClick={() => applyPreset('continuity')}
                  >
                    ▶ 5. Verify Circuit Continuity (Audible tone)
                  </button>
                </div>
              )}
            </div>

            {/* Advanced Circuit Engineering Parameters (Only in Advanced Lab Mode) */}
            {experienceMode === 'advanced' && (
              <>
                <div style={{ margin: '12px 0 6px', fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.08em' }}>
                  ADVANCED CIRCUIT PARAMETERS:
                </div>
            <div className="segment-control" role="group" aria-label="Circuit Regime">
              <button
                type="button"
                className={circuits.mode === 'dc' ? 'active' : ''}
                onClick={() => setCircuits((c) => ({ ...c, mode: 'dc' }))}
              >
                DC Steady-State
              </button>
              <button
                type="button"
                className={circuits.mode === 'ac' ? 'active' : ''}
                onClick={() => setCircuits((c) => ({ ...c, mode: 'ac' }))}
              >
                AC Sinusoidal (RLC)
              </button>
            </div>

            <div className="segment-control" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }} role="group" aria-label="Circuit Topology">
              {(['series', 'parallel', 'combo'] as const).map((top) => (
                <button
                  key={top}
                  type="button"
                  className={circuits.topology === top ? 'active' : ''}
                  onClick={() => setCircuits((c) => ({ ...c, topology: top }))}
                >
                  {top.charAt(0).toUpperCase() + top.slice(1)}
                </button>
              ))}
            </div>

            <RangeControl
              label="Source Voltage Vs"
              value={circuits.vs}
              unit="V"
              min={1.0}
              max={240.0}
              step={1.0}
              onChange={(v) => setCircuits((c) => ({ ...c, vs: v }))}
              digits={1}
            />

            {circuits.mode === 'ac' && (
              <RangeControl
                label="Driving Frequency f"
                value={circuits.freq}
                unit="Hz"
                min={10}
                max={1000}
                step={5}
                onChange={(v) => setCircuits((c) => ({ ...c, freq: v }))}
                digits={0}
              />
            )}

            <RangeControl
              label="Resistance R1"
              value={circuits.r1}
              unit="Ω"
              min={1.0}
              max={1000.0}
              step={5.0}
              onChange={(v) => setCircuits((c) => ({ ...c, r1: v }))}
              digits={0}
            />

            <RangeControl
              label="Resistance R2"
              value={circuits.r2}
              unit="Ω"
              min={1.0}
              max={1000.0}
              step={5.0}
              onChange={(v) => setCircuits((c) => ({ ...c, r2: v }))}
              digits={0}
            />

            <RangeControl
              label="Resistance R3"
              value={circuits.r3}
              unit="Ω"
              min={1.0}
              max={1000.0}
              step={5.0}
              onChange={(v) => setCircuits((c) => ({ ...c, r3: v }))}
              digits={0}
            />

            {circuits.mode === 'ac' && (
              <>
                <RangeControl
                  label="Inductance L"
                  value={circuits.inductance}
                  unit="mH"
                  min={1.0}
                  max={500.0}
                  step={5.0}
                  onChange={(v) => setCircuits((c) => ({ ...c, inductance: v }))}
                  digits={1}
                />
                <RangeControl
                  label="Capacitance C"
                  value={circuits.capacitance}
                  unit="μF"
                  min={1.0}
                  max={500.0}
                  step={5.0}
                  onChange={(v) => setCircuits((c) => ({ ...c, capacitance: v }))}
                  digits={1}
                />
              </>
            )}

            <div className="formula-readout">
              <span>{circuits.mode === 'ac' ? 'I = Vs / Z | Z = √(Req² + (XL − XC)²)' : "I = Vs / Req (Ohm's Law)"}</span>
              <strong>{circuits.mode === 'ac' ? `${circuitResult.current.toFixed(3)} A (rms)` : `${circuitResult.current.toFixed(3)} A`}</strong>
              <dl>
                {circuits.mode === 'dc' ? (
                  <>
                    <Metric label="Equivalent Req" value={`${circuitResult.req.toFixed(1)} Ω`} />
                    <Metric label="Total Current I" value={`${circuitResult.current.toFixed(3)} A`} />
                    <Metric label="DC Real Power P" value={`${circuitResult.realPower.toFixed(2)} W`} />
                  </>
                ) : (
                  <>
                    <Metric label="Total Impedance Z" value={`${circuitResult.impedance.toFixed(1)} Ω`} />
                    <Metric label="Total Current Irms" value={`${circuitResult.current.toFixed(3)} A`} />
                    <Metric label="Power Factor cos φ" value={`${circuitResult.powerFactor.toFixed(3)}`} />
                    <Metric label="Real Power P" value={`${circuitResult.realPower.toFixed(2)} W`} />
                  </>
                )}
              </dl>
              <details className="telemetry-details">
                <summary>Branch Currents & Detailed Telemetry</summary>
                <dl>
                  <Metric label="Branch Current I1" value={`${circuitResult.i1.toFixed(3)} A`} />
                  <Metric label="Branch Current I2" value={`${circuitResult.i2.toFixed(3)} A`} />
                  <Metric label="Branch Current I3" value={`${circuitResult.i3.toFixed(3)} A`} />
                  <Metric label="Voltage Drop V1" value={`${circuitResult.v1.toFixed(1)} V`} />
                  <Metric label="Voltage Drop V2" value={`${circuitResult.v2.toFixed(1)} V`} />
                  <Metric label="Voltage Drop V3" value={`${circuitResult.v3.toFixed(1)} V`} />
                  {circuits.mode === 'ac' && (
                    <>
                      <Metric label="Inductive XL" value={`${circuitResult.xl.toFixed(1)} Ω`} />
                      <Metric label="Capacitive XC" value={`${circuitResult.xc.toFixed(1)} Ω`} />
                      <Metric label="Phase Angle φ" value={`${circuitResult.phaseAngleDeg.toFixed(1)}°`} />
                      <Metric label="Reactive Power Q" value={`${circuitResult.reactivePower.toFixed(2)} VAR`} />
                      <Metric label="Resonant Freq f₀" value={`${circuitResult.resonantFreq.toFixed(1)} Hz`} />
                    </>
                  )}
                </dl>
              </details>
            </div>
          </>
        )}
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
                <div style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'monospace', padding: '6px 10px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', margin: '4px 0 8px' }}>
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
          <button
            type="button"
            className="record-button"
            disabled={stationProgress.trials.length >= TOTAL_TRIALS}
            onClick={recordCurrentTrial}
          >
            📝 Record Current State (Trial {stationProgress.trials.length + 1} / 5)
          </button>
          {stationProgress.currentStep === 4 && (
            <button
              type="button"
              className="record-button"
              onClick={() => returnToApparatus(`Use the highlighted ${GUIDANCE_LABELS[`${stationId}-clipboard`]} to record trial ${Math.min(TOTAL_TRIALS, stationProgress.trials.length + 1)}.`)}
              disabled={stationProgress.trials.length >= TOTAL_TRIALS}
            >
              ◎ Guide me to trial {Math.min(TOTAL_TRIALS, stationProgress.trials.length + 1)}/{TOTAL_TRIALS}
            </button>
          )}
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
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`${isCur ? 'active' : ''} ${isDone ? 'complete' : ''} ${isSkipped ? 'skipped' : ''}`}
                      onClick={() => setNotebookStep(index)}
                    >
                      <span>{isDone ? '✓' : isSkipped ? '↷' : index + 1}</span>
                      <div>
                        <b>{name}</b>
                        <small>{STEP_POINTS[index]} pts</small>
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
                    <b>Station Component Inspection (Click item or inspect in 3D):</b>
                    <ul style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px', padding: 0 }}>
                      {INSPECTION_TARGETS[stationId].map((tgt) => {
                        const isInspected = stationProgress.inspected.includes(tgt);
                        return (
                          <li
                            key={tgt}
                            className={isInspected ? 'done' : ''}
                            style={{
                              cursor: isInspected ? 'default' : 'pointer',
                              padding: '8px 12px',
                              background: isInspected ? 'rgba(16, 185, 129, 0.12)' : '#0f172a',
                              border: isInspected ? '1px solid #10b981' : '1px solid #334155',
                              borderRadius: '6px',
                              listStyle: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                            onClick={() => !isInspected && markInspected(tgt)}
                          >
                            <span>{isInspected ? '✅' : '🔍'}</span>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{tgt.replace(`${stationId}-`, '').replace(/-/g, ' ').toUpperCase()}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {!allInspected && (
                    <div className="feedback-alert incorrect" style={{ marginTop: '14px' }}>
                      ⚠️ Inspection Incomplete: Walk up to and interact with all station instruments in 3D (or click any remaining uninspected item above) to unlock confirmation.
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="notebook-action"
                      onClick={() => returnToApparatus(`Inspect the highlighted ${GUIDANCE_LABELS[INSPECTION_TARGET[stationId]]} in the 3D room.`)}
                    >
                      Return to highlighted apparatus
                    </button>
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

              {/* STEP 2: PREDICT (10 pts) */}
              {notebookStep === 1 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 2: Formulate Theoretical Prediction</h4>
                  </div>
                  <p className="prediction-question">{station.prediction.question}</p>

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

                  {predictionFeedback && (
                    <div className={`feedback-alert ${predictionStatus}`} style={{ marginTop: '14px' }}>
                      {predictionFeedback}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: SET UP (10 pts) */}
              {notebookStep === 2 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 3: Calibrate Baseline Experimental State</h4>
                  </div>
                  <p className="step-prompt">{station.steps[2].prompt}</p>

                  <div className="calibration-box">
                    <b>Baseline Reference Parameters:</b>
                    {stationId === 'circuits' && (
                      <p>Vs = 24.0 V · R1 = 100 Ω · R2 = 220 Ω · R3 = 330 Ω · Mode = DC · Topology = Series</p>
                    )}
                    {stationId === 'optics' && (
                      <p>λ = 532 nm (emerald) · n1 = 1.00 · n2 = 1.52 · θ1 = 30.0° · f = +20 cm · do = 40 cm</p>
                    )}
                    {stationId === 'relativity' && (
                      <p>β = 0.600c (γ = 1.250) · Proper Time Δt₀ = 10.0 s · Proper Length L₀ = 20.0 m</p>
                    )}
                  </div>

                  {setupMismatches.length > 0 ? (
                    <div className="feedback-alert incorrect" style={{ marginTop: '14px' }}>
                      ⚠️ Calibration Warning ({setupMismatches.length} parameter{setupMismatches.length > 1 ? 's' : ''} out of spec):
                      <ul style={{ margin: '6px 0 0 16px' }}>
                        {setupMismatches.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                      Adjust live controls on the right or click &quot;Reset to Exact Baseline&quot; below.
                    </div>
                  ) : (
                    <div className="feedback-alert correct" style={{ marginTop: '14px' }}>
                      ✓ Calibration Verified: Live controls match all required physical baseline parameters!
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="notebook-action"
                      onClick={() => {
                        if (stationId === 'circuits') setCircuits(INITIAL_CIRCUITS);
                        else if (stationId === 'optics') setOptics(INITIAL_OPTICS);
                        else setRelativity(INITIAL_RELATIVITY);
                        playTone(520, 'sine', 0.1, 0.2);
                      }}
                    >
                      Reset Controls to Baseline Calibration
                    </button>
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[2] || setupMismatches.length > 0}
                      onClick={() => completeStep(2)}
                    >
                      {stationProgress.completed[2] ? '✓ Calibration Confirmed (10/10 pts)' : 'Confirm Calibration Baseline (+10 pts)'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: RUN (15 pts) */}
              {notebookStep === 3 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+15 Points</span>
                    <h4>Step 4: Energize Apparatus & Observe Dynamic Telemetry</h4>
                  </div>
                  <p className="step-prompt">{station.steps[3].prompt}</p>

                  <div className="run-settling-card">
                    {runSettling ? (
                      <div className="settling-state">
                        <div className="spinner" />
                        <p>Simulating physical excitation & logging stable instrument steady-state...</p>
                      </div>
                    ) : (
                      <div className="ready-state">
                        {!isStationEnergized ? (
                          <div className="feedback-alert incorrect" style={{ marginBottom: '14px' }}>
                            {stationId === 'circuits' && '⚠️ Power Supply is OFF or Series Jumper is OPEN! Turn ON power supply and close jumper in workbench controls to run.'}
                            {stationId === 'optics' && '⚠️ Laser Diode Source is powered OFF! Turn ON laser source in live controls to observe beam refraction.'}
                            {stationId === 'relativity' && '⚠️ Particle Beam Accelerator is in STANDBY! Set accelerator beam to ACTIVE to observe relativistic dilation.'}
                          </div>
                        ) : (
                          <div className="feedback-alert correct" style={{ marginBottom: '14px' }}>
                            ✓ Apparatus is fully energized and calibrated. Ready to lock in steady-state telemetry.
                          </div>
                        )}
                        <p>Apparatus is energized. Observe the real-time oscilloscope phase, refracted beam, or contracting photon clock in the 3D viewport.</p>
                        <div className="button-row" style={{ marginTop: '14px' }}>
                          <button
                            type="button"
                            className="notebook-action"
                            onClick={() => returnToApparatus(`Operate the highlighted ${GUIDANCE_LABELS[RUN_TARGET[stationId]]} to run the experiment and observe live readings.`)}
                          >
                            Return to highlighted run control
                          </button>
                          <button
                            type="button"
                            className="notebook-action"
                            disabled={stationProgress.completed[3] || !isStationEnergized || runSettling}
                            onClick={() => {
                              setRunSettling(true);
                              playTone(400, 'square', 0.1, 0.2);
                              setTimeout(() => {
                                setRunSettling(false);
                                completeStep(3);
                              }, 1200);
                            }}
                          >
                            {stationProgress.completed[3] ? '✓ Run Verified (+15 pts)' : 'Energize & Lock In Steady State (+15 pts)'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 5: MEASURE (15 pts) */}
              {notebookStep === 4 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+15 Points</span>
                    <h4>Step 5: Record Five Experimental Trials ({stationProgress.trials.length} / 5)</h4>
                  </div>
                  <p className="step-prompt">{station.steps[4].prompt}</p>

                  {measurementWarning && (
                    <div className="feedback-alert incorrect" style={{ marginBottom: '14px' }}>
                      {measurementWarning}
                    </div>
                  )}

                  <div className="table-scroll">
                    <table className="trial-table">
                      <thead>
                        <tr>
                          {stationId === 'circuits' && (
                            <>
                              <th>#</th><th>Mode</th><th>Topology</th><th>Vs (V)</th><th>f (Hz)</th><th>Z (Ω)</th><th>I (A)</th><th>P (W)</th>
                            </>
                          )}
                          {stationId === 'optics' && (
                            <>
                              {optics.subMode === 'refraction' && (
                                <>
                                  <th>#</th><th>Sub-Mode</th><th>λ (nm)</th><th>θ₁ (°)</th><th>Effective n₂</th><th>θ₂ Theory (°)</th><th>θ₂ Meas (°)</th><th>Status</th>
                                </>
                              )}
                              {optics.subMode === 'imaging' && (
                                <>
                                  <th>#</th><th>Sub-Mode</th><th>λ (nm)</th><th>do (cm)</th><th>f (cm)</th><th>di Theory (cm)</th><th>di Meas (cm)</th><th>Image Type</th>
                                </>
                              )}
                              {optics.subMode === 'diffraction' && (
                                <>
                                  <th>#</th><th>Sub-Mode</th><th>λ (nm)</th><th>d (mm)</th><th>L (m)</th><th>Δy Theory (mm)</th><th>Δy Meas (mm)</th><th>Tag</th>
                                </>
                              )}
                            </>
                          )}
                          {stationId === 'relativity' && (
                            <>
                              <th>#</th><th>Particle</th><th>β (v/c)</th><th>Speed (m/s)</th><th>γ (Theory)</th><th>γ (Detector)</th><th>Δt (s)</th><th>Contracted L (m)</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {stationProgress.trials.map((t) => (
                          <tr key={String(t.trial)}>
                            <td>{t.trial}</td>
                            {stationId === 'circuits' && (
                              <>
                                <td>{t.mode}</td><td>{String(t.topology).toUpperCase()}</td><td>{formatValue(t.vs)}</td><td>{formatValue(t.freq)}</td><td>{formatValue(t.impedance)}</td><td>{formatValue(t.current)}</td><td>{formatValue(t.realPower)}</td>
                              </>
                            )}
                            {stationId === 'optics' && (
                              <>
                                <td>{t.subMode}</td><td>{t.wavelength}</td><td>{formatValue(t.paramA)}</td><td>{formatValue(t.paramB)}</td><td>{formatValue(t.theoretical)}</td><td>{formatValue(t.measured)}</td><td>{t.classification}</td>
                              </>
                            )}
                            {stationId === 'relativity' && (
                              <>
                                <td>{String(t.preset ?? 'alpha').toUpperCase()}</td><td>{formatValue(t.beta)}</td><td>{formatValue(t.speed)}</td><td>{formatValue(t.gamma)}</td><td>{formatValue(t.measuredGamma ?? t.gamma)}</td><td>{formatValue(t.dilatedTime)}</td><td>{formatValue(t.contractedLength)}</td>
                              </>
                            )}
                          </tr>
                        ))}
                        {stationProgress.trials.length === 0 && (
                          <tr>
                            <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                              No trials recorded yet. Use the live sliders on the right and click &quot;Record Current State&quot;.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="notebook-action"
                      style={{ background: '#059669', borderColor: '#10b981' }}
                      disabled={stationProgress.trials.length >= TOTAL_TRIALS}
                      onClick={recordCurrentTrial}
                    >
                      ➕ Record Current State as Trial #{stationProgress.trials.length + 1}
                    </button>
                    <button
                      type="button"
                      className="notebook-action"
                      onClick={() => returnToApparatus(`Use the highlighted ${GUIDANCE_LABELS[`${stationId}-clipboard`]} to record trial ${Math.min(TOTAL_TRIALS, stationProgress.trials.length + 1)}.`)}
                      disabled={stationProgress.trials.length >= TOTAL_TRIALS}
                    >
                      Return to apparatus to record
                    </button>
                    {stationProgress.trials.length >= TOTAL_TRIALS && (
                      <button
                        type="button"
                        className="notebook-action"
                        disabled={stationProgress.completed[4]}
                        onClick={() => completeStep(4)}
                      >
                        {stationProgress.completed[4] ? '✓ 5 Trials Recorded (15/15 pts)' : 'Complete Step 5 (+15 pts)'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 6: CALCULATE (20 pts) */}
              {notebookStep === 5 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+20 Points</span>
                    <h4>Step 6: Verify Theoretical Calculations (±2% Tolerance)</h4>
                  </div>
                  <p className="step-prompt">{station.steps[5].prompt}</p>

                  {/* Formula and Worked Hint Toggle Box */}
                  <div style={{ marginBottom: '16px' }}>
                    <button
                      type="button"
                      className="notebook-action"
                      style={{ background: showCalcHint ? '#1e293b' : '#0f172a', borderColor: '#38bdf8', fontSize: '12px' }}
                      onClick={() => setShowCalcHint((v) => !v)}
                    >
                      {showCalcHint ? '▲ Hide Formula & Worked Hint' : '💡 Show Formula & Worked Hint (Trial #1 Guide)'}
                    </button>

                    {showCalcHint && (
                      <div className="calibration-box" style={{ marginTop: '10px', borderLeft: '4px solid #38bdf8' }}>
                        <b>Physics Theory & Worked Calculation:</b>
                        {stationId === 'circuits' && (
                          <div>
                            <p style={{ margin: '4px 0' }}><b>Formula:</b> DC: Z = Req = R1 + R2 + R3 (Series) | AC: Z = √(Req² + (XL − XC)²)</p>
                            {stationProgress.trials.length > 0 && (
                              <p style={{ margin: '4px 0', color: '#38bdf8' }}>
                                <b>Trial #1 Worked Hint:</b> For Vs = {stationProgress.trials[0].vs} V ({stationProgress.trials[0].mode}): Theoretical Impedance Z = {Number(stationProgress.trials[0].impedance).toFixed(2)} Ω. (Enter within ±2%).
                              </p>
                            )}
                          </div>
                        )}
                        {stationId === 'optics' && (
                          <div>
                            <p style={{ margin: '4px 0' }}><b>Formula:</b> Refraction: θ₂ = arcsin((n₁/n₂) · sin θ₁) | Imaging: 1/di = 1/f − 1/do | Diffraction: Δy = (λ·L)/d</p>
                            {stationProgress.trials.length > 0 && (
                              <p style={{ margin: '4px 0', color: '#38bdf8' }}>
                                <b>Trial #1 Worked Hint:</b> Theoretical Value = {Number(stationProgress.trials[0].theoretical).toFixed(2)}. (Enter within ±2%).
                              </p>
                            )}
                          </div>
                        )}
                        {stationId === 'relativity' && (
                          <div>
                            <p style={{ margin: '4px 0' }}><b>Formula:</b> Lorentz Factor γ = 1 / √(1 − β²)</p>
                            {stationProgress.trials.length > 0 && (
                              <p style={{ margin: '4px 0', color: '#38bdf8' }}>
                                <b>Trial #1 Worked Hint:</b> For β = {stationProgress.trials[0].beta}c: γ = 1 / √(1 − {Number(stationProgress.trials[0].beta).toFixed(3)}²) = {Number(stationProgress.trials[0].gamma).toFixed(3)}. (Enter within ±2%).
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="calc-inputs-table">
                    {stationProgress.trials.map((t, i) => (
                      <div key={i} className="calc-row calculation-entry" style={{ display: 'grid', gridTemplateColumns: '1fr 140px', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <span><b>Trial #{i + 1}:</b> ({stationId === 'circuits' ? `Vs=${t.vs}V, I=${formatValue(t.current)}A` : stationId === 'optics' ? `Input=${t.paramA}` : `β=${t.beta}c`})</span>
                        <div className="calc-input-wrapper">
                          <input
                            type="number"
                            step="any"
                            style={{ padding: '8px 12px' }}
                            placeholder={stationId === 'circuits' ? 'Calc Z (Ω)' : stationId === 'optics' ? 'Calc Theory' : 'Calc γ'}
                            value={stationProgress.calculations[i] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setProgress((prev) => {
                                const st = { ...prev[stationId] };
                                const calcs = [...st.calculations];
                                calcs[i] = val;
                                return { ...prev, [stationId]: { ...st, calculations: calcs } };
                              });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    {stationProgress.trials.length === 0 && (
                      <p style={{ color: '#94a3b8', fontStyle: 'italic', margin: '12px 0' }}>
                        Log 5 experimental trials in Step 5 before performing calculations.
                      </p>
                    )}
                  </div>

                  {calculationFeedback && (
                    <div className={`feedback-alert ${calculationStatus}`}>
                      {calculationFeedback}
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[5]}
                      onClick={verifyCalculations}
                    >
                      {stationProgress.completed[5] ? '✓ Calculations Verified (20/20 pts)' : 'Verify All Calculations (+20 pts)'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 7: ANALYZE (10 pts) */}
              {notebookStep === 6 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 7: Least-Squares Regression & Scientific Synthesis</h4>
                  </div>

                  {/* Academic Regression Engine SVG Plot */}
                  <Room3Graph stationId={stationId} trials={stationProgress.trials} accentColor={station.accent} />

                  {/* Guided Formative Assessment Questions */}
                  <div className="guided-questions-container">
                    <b>Formative Assessment Questions:</b>
                    {ROOM3_GUIDE_QUESTIONS[stationId].map((q, qIdx) => {
                      const userChoice = stationProgress.guideAnswers?.[qIdx] ?? -1;
                      return (
                        <div key={q.id} className="guide-question-block">
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

                  {/* Sources of Uncertainty */}
                  <div className="errors-checklist">
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

                  {/* Observations Text */}
                  <div className="text-area-group">
                    <label>
                      <b>Scientific Observations & Deductions:</b>
                      <textarea
                        rows={3}
                        value={stationProgress.analysis}
                        placeholder="Detail your empirical findings regarding governing laws, slopes, and phase/optical/Lorentz behavior..."
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

                  {!allGuideCorrect || !hasUncertainty ? (
                    <div className="feedback-alert incorrect" style={{ marginTop: '12px' }}>
                      {!allGuideCorrect
                        ? '⚠️ Formative Questions Incomplete: Answer all 3 questions correctly to unlock analysis synthesis.'
                        : '⚠️ Experimental Uncertainty: Select at least one identified source of error above.'}
                    </div>
                  ) : null}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[6] || !allGuideCorrect || !hasUncertainty}
                      onClick={() => completeStep(6)}
                    >
                      {stationProgress.completed[6] ? '✓ Analysis Complete (10/10 pts)' : 'Submit Analysis & Synthesize (+10 pts)'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 8: REPORT (10 pts) */}
              {notebookStep === 7 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 8: Certification & Final Report Submission</h4>
                  </div>

                  <div className="certification-card">
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

                  {!reportReady && (
                    <div className="feedback-alert incorrect" style={{ marginTop: '14px' }}>
                      {!steps1to7Done
                        ? '⚠️ Incomplete Station: Complete Steps 1 through 7 before certifying the final laboratory report.'
                        : '⚠️ Student Metadata Required: Enter Student Name, ID, and Section above to generate certified report.'}
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
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
                      disabled={stationProgress.completed[7] || !reportReady}
                      onClick={downloadReportPdf}
                    >
                      {stationProgress.completed[7] ? '✓ Final Report Certified (10/10 pts)' : '📄 Download Certified PDF Report (+10 pts)'}
                    </button>
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
                  disabled={notebookStep >= 7}
                  onClick={() => setNotebookStep((s) => Math.min(7, s + 1))}
                >
                  Next step →
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
