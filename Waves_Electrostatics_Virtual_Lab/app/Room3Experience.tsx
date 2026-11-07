'use client';

import {
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
import {
  createRoom3Scene,
  type EquipmentInteraction,
  type Room3SceneApi,
} from './room3Scene';
import { createLaboratoryPdf } from './pdfReport';
import { type CharacterType } from './characterController';

const STORAGE_KEY = 'physics_lab_room_3_progress';

const INSPECTION_TARGETS: Record<Room3StationId, string[]> = {
  circuits: ['circuits-power-switch', 'circuits-voltage-knob', 'circuits-oscilloscope', 'circuits-topology-selector'],
  optics: ['optics-laser', 'optics-angle-dial', 'optics-screen'],
  relativity: ['relativity-velocity-dial', 'relativity-light-clock', 'relativity-contracting-rod'],
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
  const [stationId, setStationId] = useState<Room3StationId>('circuits');
  const [circuits, setCircuits] = useState<CircuitSettings>(INITIAL_CIRCUITS);
  const [optics, setOptics] = useState<OpticsSettings>(INITIAL_OPTICS);
  const [relativity, setRelativity] = useState<RelativitySettings>(INITIAL_RELATIVITY);

  // App & 3D HUD States
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneError, setSceneError] = useState(false);
  const [interaction, setInteraction] = useState<EquipmentInteraction | null>(null);
  const [isThirdPerson, setIsThirdPerson] = useState(true);
  const [activeCharacter, setActiveCharacter] = useState<CharacterType>('female');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [progress, setProgress] = useState<Room3Progress>(createDefaultRoom3Progress);
  const [hydrated, setHydrated] = useState(false);

  // Notebook Modal States
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [notebookStep, setNotebookStep] = useState(0);
  const [predictionSelection, setPredictionSelection] = useState<number | null>(null);
  const [predictionStatus, setPredictionStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [predictionFeedback, setPredictionFeedback] = useState('');
  const [calculationFeedback, setCalculationFeedback] = useState('');
  const [calculationStatus, setCalculationStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [studentName, setStudentName] = useState('Student Physicist');
  const [studentId, setStudentId] = useState('PHY-300-2026');
  const [studentSection, setStudentSection] = useState('Physics Core III');
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const [mobilePanel, setMobilePanel] = useState<'none' | 'objective' | 'controls'>('none');
  const [runSettling, setRunSettling] = useState(false);

  // Station Definitions & Telemetry Derived States
  const station = ROOM3_STATIONS[stationId];
  const stationProgress = progress[stationId];
  const circuitResult = useMemo(() => calculateCircuit(circuits), [circuits]);
  const opticsResult = useMemo(() => calculateOptics(optics), [optics]);
  const relativityResult = useMemo(() => calculateRelativity(relativity), [relativity]);

  // Scoring
  const currentScore = stationScore(stationProgress);
  const totalScore = (Object.keys(progress) as Room3StationId[]).reduce(
    (total, id) => total + stationScore(progress[id]),
    0
  );

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
      gain.gain.setValueAtTime(vol, ctx.currentTime);
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

  // 1. Lazy Placard Asset Preloading: Load Station 1 immediately, prefetch Stations 2 & 3 dynamically
  useEffect(() => {
    const prefetchTimer = window.setTimeout(() => {
      ['/assets/placards/placard_optics.png', '/assets/placards/placard_relativity.png'].forEach((src) => {
        const img = new Image();
        img.src = src;
      });
    }, 800);
    return () => clearTimeout(prefetchTimer);
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
    try {
      const api = createRoom3Scene(sceneContainer.current, {
        onEquipmentInteract: (id) => equipmentActionRef.current(id),
        onInteractionChange: (inter) => setInteraction(inter),
        onFootstep: () => playTone(80, 'sine', 0.05, 0.1),
      });
      sceneApi.current = api;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSceneReady(true);
      setSceneError(false);
    } catch (err) {
      console.error('Room 03 WebGL Scene Error:', err);
      setSceneError(true);
      setSceneReady(false);
    }

    return () => {
      sceneApi.current?.dispose();
      sceneApi.current = null;
      if (audioContext.current && audioContext.current.state !== 'closed') {
        void audioContext.current.close();
      }
      audioContext.current = null;
    };
  }, []);

  // Propagate physical changes to 3D scene
  useEffect(() => { sceneApi.current?.setStation(stationId); }, [stationId]);
  useEffect(() => { sceneApi.current?.setCircuits(circuits); }, [circuits]);
  useEffect(() => { sceneApi.current?.setOptics(optics); }, [optics]);
  useEffect(() => { sceneApi.current?.setRelativity(relativity); }, [relativity]);

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
    }
  };

  useEffect(() => {
    equipmentActionRef.current = handleEquipmentAction;
  });

  // Keyboard navigation for stations (Keys 1-3)
  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) return;
      if (e.key === '1') {
        setStationId('circuits');
        playTone(392, 'sine', 0.1, 0.15);
      } else if (e.key === '2') {
        setStationId('optics');
        playTone(440, 'sine', 0.1, 0.15);
      } else if (e.key === '3') {
        setStationId('relativity');
        playTone(523.25, 'sine', 0.1, 0.15);
      } else if (e.key.toLowerCase() === 'e' && interaction) {
        handleEquipmentAction(interaction.id);
      }
    };
    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction]);

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

  // Trial Logging Helper
  const recordCurrentTrial = () => {
    if (stationProgress.trials.length >= TOTAL_TRIALS) return;
    playTone(600, 'square', 0.1, 0.2);

    let newTrial: TrialRecord;
    const trialNum = stationProgress.trials.length + 1;

    if (stationId === 'circuits') {
      newTrial = {
        trial: trialNum,
        mode: circuits.mode.toUpperCase(),
        topology: circuits.topology,
        vs: circuits.vs,
        freq: circuits.mode === 'ac' ? circuits.freq : 0,
        impedance: circuitResult.impedance,
        current: circuitResult.current,
        powerFactor: circuitResult.powerFactor,
        realPower: circuitResult.realPower,
      };
    } else if (stationId === 'optics') {
      let paramA = circuits.vs;
      let measured = 0;
      let theoretical = 0;
      let classification = '';

      if (optics.subMode === 'refraction') {
        paramA = optics.theta1;
        theoretical = opticsResult.theta2Deg ?? 0;
        measured = theoretical * (1 + (Math.sin(trialNum * 1.5) * 0.015)); // +/- 1.5% measurement noise
        classification = opticsResult.isTIR ? 'TIR' : 'Refracted';
      } else if (optics.subMode === 'imaging') {
        paramA = optics.objectDistance;
        theoretical = opticsResult.imageDistanceCm ?? 0;
        measured = theoretical * (1 + (Math.sin(trialNum * 1.5) * 0.015));
        classification = `${opticsResult.imageType} · ${opticsResult.imageOrientation}`;
      } else {
        paramA = optics.slitSeparation;
        theoretical = opticsResult.fringeSpacingMm;
        measured = theoretical * (1 + (Math.sin(trialNum * 1.5) * 0.015));
        classification = `λ=${optics.wavelength}nm`;
      }

      const percentError = Math.abs((measured - theoretical) / Math.max(0.01, theoretical)) * 100;

      newTrial = {
        trial: trialNum,
        subMode: optics.subMode,
        wavelength: optics.wavelength,
        paramA,
        paramB: optics.subMode === 'refraction' ? optics.n2 : optics.focalLength,
        theoretical,
        measured,
        percentError,
        classification,
      };
    } else {
      newTrial = {
        trial: trialNum,
        beta: relativity.beta,
        speed: relativityResult.speedMps,
        gamma: relativityResult.gamma,
        dilatedTime: relativityResult.dilatedTime,
        contractedLength: relativityResult.contractedLength,
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

  // Prediction verification (Step 1)
  const verifyPrediction = (choice: number) => {
    setPredictionSelection(choice);
    const isCorrect = choice === station.prediction.answer;
    if (isCorrect) {
      setPredictionStatus('correct');
      setPredictionFeedback(`Correct! ${station.prediction.explanation}`);
      completeStep(1);
    } else {
      setPredictionStatus('incorrect');
      setPredictionFeedback('Not quite. Review the physical principles and try selecting the accurate relationship.');
      playTone(180, 'sawtooth', 0.2, 0.2);
    }
  };

  // Step 5 Calculations verification
  const verifyCalculations = () => {
    const trials = stationProgress.trials;
    if (!trials.length) {
      setCalculationFeedback('Please log trials in Step 5 before verifying theoretical calculations.');
      setCalculationStatus('incorrect');
      return;
    }

    let allPass = true;
    trials.forEach((t, i) => {
      const userVal = parseFloat(stationProgress.calculations[i]);
      let expected = 0;
      if (stationId === 'circuits') {
        expected = Number(t.impedance);
      } else if (stationId === 'optics') {
        expected = Number(t.theoretical);
      } else {
        expected = Number(t.gamma);
      }

      if (isNaN(userVal) || Math.abs((userVal - expected) / expected) > 0.03) {
        allPass = false;
      }
    });

    if (allPass) {
      setCalculationStatus('correct');
      setCalculationFeedback('Verification Passed! All values match theoretical laws within ±2% tolerance.');
      completeStep(5);
    } else {
      setCalculationStatus('incorrect');
      setCalculationFeedback('One or more calculations deviate by more than 2% from theoretical prediction. Review your formulas and recalculate.');
      playTone(200, 'sawtooth', 0.2, 0.2);
    }
  };

  // Auto-fill calculations assistant
  const autoFillCalculations = () => {
    const newCalcs = stationProgress.trials.map((t) => {
      if (stationId === 'circuits') return Number(t.impedance).toFixed(2);
      if (stationId === 'optics') return Number(t.theoretical).toFixed(2);
      return Number(t.gamma).toFixed(3);
    });
    while (newCalcs.length < TOTAL_TRIALS) newCalcs.push('');

    setProgress((prev) => ({
      ...prev,
      [stationId]: {
        ...prev[stationId],
        calculations: newCalcs,
      },
    }));
    playTone(440, 'sine', 0.1, 0.15);
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
    <div className="lab-shell" data-station={stationId}>
      {/* 1. Header Topbar */}
      <header className="topbar">
        <div className="topbar-left">
          <Link href="/" className="exit-button" aria-label="Return to corridor">
            <span aria-hidden="true">🚪</span> Hallway
          </Link>
          <div className="breadcrumbs">
            <span className="course-code">PHYSICS 300</span>
            <span className="crumb-divider">/</span>
            <span className="room-crumb">Room 03 · Electricity, Optics & Relativity</span>
          </div>
        </div>

        <nav className="station-nav" aria-label="Room 3 Workstations">
          {(['circuits', 'optics', 'relativity'] as Room3StationId[]).map((id, index) => {
            const st = ROOM3_STATIONS[id];
            const isFinished = isStationFinished(progress[id]);
            const isActive = stationId === id;
            return (
              <button
                key={id}
                type="button"
                className={`station-chip ${isActive ? 'active' : ''} ${isFinished ? 'completed' : ''}`}
                onClick={() => {
                  setStationId(id);
                  playTone(400 + index * 50, 'sine', 0.08, 0.2);
                }}
              >
                <span className="station-chip-num">{st.number}</span>
                <span className="station-chip-name">{st.shortName}</span>
                <span className="station-chip-score">{stationScore(progress[id])} pts</span>
                {isFinished && <span className="completed-check">✓</span>}
              </button>
            );
          })}
        </nav>

        <div className="topbar-right">
          <div className="total-score-pill">
            <span className="score-label">Score</span>
            <span className="score-value">{totalScore} / 300 pts</span>
          </div>

          <button
            type="button"
            className="hud-icon-btn"
            title="Toggle 1st / 3rd Person View (Key V)"
            onClick={() => {
              const res = sceneApi.current?.toggleView();
              if (res !== undefined) setIsThirdPerson(res);
            }}
          >
            {isThirdPerson ? '🎥 3rd' : '👁️ 1st'}
          </button>

          <button
            type="button"
            className="hud-icon-btn"
            title="Switch Avatar (Carla / Eric)"
            onClick={() => {
              const char = sceneApi.current?.switchCharacter();
              if (char) setActiveCharacter(char);
            }}
          >
            👤 {activeCharacter === 'female' ? 'Carla' : 'Eric'}
          </button>

          <button
            type="button"
            className="hud-icon-btn"
            title="Toggle Sound"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              soundEnabledRef.current = next;
            }}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
        </div>
      </header>

      {/* 2. Main 3D Canvas Area */}
      <main className="lab-stage" aria-label="3D Laboratory Canvas">
        <div ref={sceneContainer} className="scene-container" />

        {/* Loading overlay if WebGL hydrating */}
        {!sceneReady && !sceneError && (
          <div className="scene-loading-overlay">
            <div className="spinner" />
            <p>Initializing Room 03 Laboratory Physics Engine...</p>
          </div>
        )}

        {/* 3. Left Objective Panel */}
        <section className={`objective-panel ${mobilePanel === 'objective' ? 'mobile-visible' : ''}`}>
          <div className="panel-header">
            <span className="station-badge" style={{ backgroundColor: `${station.accent}25`, borderColor: station.accent, color: station.accent }}>
              STATION {station.number}
            </span>
            <h2 className="station-title">{station.title}</h2>
            <p className="station-subtitle">{station.subtitle}</p>
          </div>

          <div className="placard-preview-card">
            {/* Lazy Image with immediate Station 1 and dynamic prefetch for 2 & 3 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={station.placardSrc}
              alt={station.placardAlt}
              className="placard-img"
              loading={stationId === 'circuits' ? 'eager' : 'lazy'}
            />
            <div className="placard-caption">{station.placardAlt}</div>
          </div>

          <div className="objective-text-box">
            <b>Learning Outcome:</b>
            <p>{station.objective}</p>
          </div>

          <div className="step-timeline-bar">
            <div className="timeline-header">
              <span>GUIDED NOTEBOOK</span>
              <b>STEP {stationProgress.currentStep + 1} / 8: {STEP_NAMES[stationProgress.currentStep]}</b>
            </div>
            <div className="timeline-dots">
              {STEP_NAMES.map((name, i) => (
                <div
                  key={name}
                  className={`timeline-dot ${stationProgress.completed[i] ? 'done' : stationProgress.currentStep === i ? 'current' : ''}`}
                  title={`${i + 1}. ${name} (${STEP_POINTS[i]} pts)`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className="action-btn primary w-full"
            onClick={() => {
              setNotebookStep(stationProgress.currentStep);
              setNotebookOpen(true);
            }}
          >
            📖 Open 8-Step Notebook ({currentScore}/100 pts)
          </button>
        </section>

        {/* 4. Right Aside: Live Controls & Explicit Derived Telemetry */}
        <aside className={`control-panel ${mobilePanel === 'controls' ? 'mobile-visible' : ''}`}>
          <div className="panel-header">
            <span className="panel-tag">LIVE CONTROLS & TELEMETRY</span>
            <h3 className="panel-title">{station.shortName} Live Bench</h3>
          </div>

          {/* STATION 01: CIRCUITS CONTROLS */}
          {stationId === 'circuits' && (
            <>
              <div className="control-section-group">
                <span className="section-label">⚙️ MANIPULATED INPUTS</span>

                <div className="control-row">
                  <span><b>Regime Mode</b></span>
                  <div className="button-toggle-group">
                    <button
                      type="button"
                      className={`toggle-opt ${circuits.mode === 'dc' ? 'active' : ''}`}
                      onClick={() => setCircuits((c) => ({ ...c, mode: 'dc' }))}
                    >
                      DC Steady-State
                    </button>
                    <button
                      type="button"
                      className={`toggle-opt ${circuits.mode === 'ac' ? 'active' : ''}`}
                      onClick={() => setCircuits((c) => ({ ...c, mode: 'ac' }))}
                    >
                      AC Sinusoidal (RLC)
                    </button>
                  </div>
                </div>

                <div className="control-row">
                  <span><b>Circuit Topology</b></span>
                  <div className="button-toggle-group">
                    {(['series', 'parallel', 'combo'] as const).map((top) => (
                      <button
                        key={top}
                        type="button"
                        className={`toggle-opt ${circuits.topology === top ? 'active' : ''}`}
                        onClick={() => setCircuits((c) => ({ ...c, topology: top }))}
                      >
                        {top.charAt(0).toUpperCase() + top.slice(1)}
                      </button>
                    ))}
                  </div>
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
              </div>

              <div className="control-section-group telemetry">
                <span className="section-label">📊 DERIVED TELEMETRY READOUTS</span>
                <div className="formula-badge">
                  <code>{circuits.mode === 'ac' ? 'V = I · Z  |  Z = √(Req² + (XL − XC)²)' : 'V = I · Req  (Ohm\'s Law)'}</code>
                </div>

                <div className="metrics-grid">
                  <Metric label="Equivalent Req" value={`${circuitResult.req.toFixed(1)} Ω`} />
                  <Metric label="Total Impedance Z" value={`${circuitResult.impedance.toFixed(1)} Ω`} />
                  {circuits.mode === 'ac' && (
                    <>
                      <Metric label="Inductive XL" value={`${circuitResult.xl.toFixed(1)} Ω`} />
                      <Metric label="Capacitive XC" value={`${circuitResult.xc.toFixed(1)} Ω`} />
                    </>
                  )}
                  <Metric label="Total Current I" value={`${circuitResult.current.toFixed(3)} A`} />
                  <Metric label="Branch Current I1" value={`${circuitResult.i1.toFixed(3)} A`} />
                  <Metric label="Branch Current I2" value={`${circuitResult.i2.toFixed(3)} A`} />
                  <Metric label="Branch Current I3" value={`${circuitResult.i3.toFixed(3)} A`} />
                  <Metric label="Voltage Drop V1" value={`${circuitResult.v1.toFixed(1)} V`} />
                  <Metric label="Voltage Drop V2" value={`${circuitResult.v2.toFixed(1)} V`} />
                  <Metric label="Voltage Drop V3" value={`${circuitResult.v3.toFixed(1)} V`} />
                  {circuits.mode === 'ac' && (
                    <>
                      <Metric label="Phase Angle φ" value={`${circuitResult.phaseAngleDeg.toFixed(1)}°`} />
                      <Metric label="Power Factor cos φ" value={`${circuitResult.powerFactor.toFixed(3)}`} />
                      <Metric label="Real Power P" value={`${circuitResult.realPower.toFixed(2)} W`} />
                      <Metric label="Reactive Power Q" value={`${circuitResult.reactivePower.toFixed(2)} VAR`} />
                      <Metric label="Resonant Freq f₀" value={`${circuitResult.resonantFreq.toFixed(1)} Hz`} />
                    </>
                  )}
                  {circuits.mode === 'dc' && (
                    <Metric label="DC Power P" value={`${circuitResult.realPower.toFixed(2)} W`} />
                  )}
                </div>
              </div>
            </>
          )}

          {/* STATION 02: OPTICS CONTROLS */}
          {stationId === 'optics' && (
            <>
              <div className="control-section-group">
                <span className="section-label">⚙️ MANIPULATED INPUTS</span>

                <div className="control-row">
                  <span><b>Bench Sub-Mode</b></span>
                  <div className="button-toggle-group">
                    {(['refraction', 'imaging', 'diffraction'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`toggle-opt ${optics.subMode === m ? 'active' : ''}`}
                        onClick={() => setOptics((o) => ({ ...o, subMode: m }))}
                      >
                        {m === 'refraction' ? 'Refraction & TIR' : m === 'imaging' ? 'Lenses/Mirrors' : 'Diffraction'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="control-row">
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
                </div>

                {optics.subMode === 'refraction' && (
                  <>
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
              </div>

              <div className="control-section-group telemetry">
                <span className="section-label">📊 DERIVED TELEMETRY READOUTS</span>
                <div className="formula-badge">
                  <code>
                    {optics.subMode === 'refraction'
                      ? 'n1 · sin θ1 = n2 · sin θ2  (Snell\'s Law)'
                      : optics.subMode === 'imaging'
                      ? '1/f = 1/do + 1/di  |  M = −di/do'
                      : 'Δy = (λ · L) / d  |  w0 = (2 · λ · L) / a'}
                  </code>
                </div>

                <div className="metrics-grid">
                  {optics.subMode === 'refraction' && (
                    <>
                      <Metric
                        label="Refracted Angle θ2"
                        value={opticsResult.isTIR ? 'TIR (No ray)' : `${opticsResult.theta2Deg?.toFixed(1)}°`}
                      />
                      <Metric
                        label="Critical Angle θc"
                        value={opticsResult.criticalAngleDeg ? `${opticsResult.criticalAngleDeg.toFixed(1)}°` : 'N/A (n1 ≤ n2)'}
                      />
                      <Metric label="Reflected Angle" value={`${opticsResult.reflectAngleDeg.toFixed(1)}°`} />
                      <Metric
                        label="Optical Boundary"
                        value={opticsResult.isTIR ? '⚡ TOTAL INTERNAL REFLECTION' : 'Transmission & Refraction'}
                      />
                    </>
                  )}

                  {optics.subMode === 'imaging' && (
                    <>
                      <Metric
                        label="Image Distance di"
                        value={opticsResult.imageDistanceCm ? `${opticsResult.imageDistanceCm.toFixed(1)} cm` : 'Infinity'}
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
                </div>
              </div>
            </>
          )}

          {/* STATION 03: SPECIAL RELATIVITY CONTROLS */}
          {stationId === 'relativity' && (
            <>
              <div className="control-section-group">
                <span className="section-label">⚙️ MANIPULATED INPUTS</span>

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
                  label="Proper Time Interval Δt₀"
                  value={relativity.properTime}
                  unit="s"
                  min={1.0}
                  max={100.0}
                  step={0.5}
                  onChange={(v) => setRelativity((r) => ({ ...r, properTime: v }))}
                  digits={1}
                />

                <RangeControl
                  label="Proper Length L₀"
                  value={relativity.properLength}
                  unit="m"
                  min={1.0}
                  max={100.0}
                  step={1.0}
                  onChange={(v) => setRelativity((r) => ({ ...r, properLength: v }))}
                  digits={1}
                />

                <div className="control-row">
                  <span><b>Rest Mass Preset</b></span>
                  <div className="button-toggle-group">
                    {(['electron', 'proton', 'muon', 'probe'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`toggle-opt ${relativity.massPreset === m ? 'active' : ''}`}
                        onClick={() =>
                          setRelativity((r) => ({
                            ...r,
                            massPreset: m,
                            restMass: MASS_PRESETS[m].massKg,
                          }))
                        }
                      >
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="control-section-group telemetry">
                <span className="section-label">📊 DERIVED TELEMETRY READOUTS</span>
                <div className="formula-badge">
                  <code>γ = 1 / √(1 − v²/c²)  |  Δt = γ · Δt₀  |  L = L₀ / γ  |  E = γ m₀ c²</code>
                </div>

                <div className="metrics-grid">
                  <Metric label="Lorentz Factor γ" value={relativityResult.gamma.toFixed(3)} />
                  <Metric label="Velocity v" value={`${(relativityResult.speedMps / 1e6).toFixed(2)} × 10⁶ m/s`} />
                  <Metric label="Dilated Time Δt" value={`${relativityResult.dilatedTime.toFixed(2)} s`} />
                  <Metric label="Proper Time Δt₀" value={`${relativity.properTime.toFixed(1)} s`} />
                  <Metric label="Contracted Length L" value={`${relativityResult.contractedLength.toFixed(2)} m`} />
                  <Metric label="Length Contraction" value={`−${relativityResult.lengthContractionPercent.toFixed(1)}%`} />
                  <Metric label="Rest Energy E₀" value={`${formatValue(relativityResult.restEnergyMeV)} MeV`} />
                  <Metric label="Total Energy E" value={`${formatValue(relativityResult.totalEnergyMeV)} MeV`} />
                  <Metric label="Relativistic KE (K)" value={`${formatValue(relativityResult.kineticEnergyMeV)} MeV`} />
                  <Metric label="Total Energy (J)" value={`${formatValue(relativityResult.totalEnergyJ)} J`} />
                  <Metric label="Relativistic Momentum" value={`${formatValue(relativityResult.momentumMeV_c)} MeV/c`} />
                </div>
              </div>
            </>
          )}

          {/* Quick Record Trial Button */}
          <div className="control-footer-actions">
            <button
              type="button"
              className="action-btn secondary w-full"
              disabled={stationProgress.trials.length >= TOTAL_TRIALS}
              onClick={recordCurrentTrial}
            >
              📝 Record Current State (Trial {stationProgress.trials.length + 1} / 5)
            </button>
          </div>
        </aside>

        {/* 5. Bottom Proximity Status Dock */}
        <footer className="status-dock" aria-live="polite">
          <div className="status-left">
            {interaction ? (
              <div className="interaction-prompt">
                <span className="key-badge">E</span>
                <span className="interaction-text">
                  <b>{interaction.action}:</b> {interaction.name} ({interaction.readout})
                </span>
              </div>
            ) : (
              <div className="idle-prompt">
                <span>Walk with [W, A, S, D] · Teleport stations with [Keys 1–3] · Press [E] near apparatus to interact</span>
              </div>
            )}
          </div>

          <div className="status-right">
            <button
              type="button"
              className="quick-notebook-btn"
              onClick={() => {
                setNotebookStep(stationProgress.currentStep);
                setNotebookOpen(true);
              }}
            >
              📖 Notebook (Step {stationProgress.currentStep + 1}/8)
            </button>
          </div>
        </footer>

        {/* Mobile View Toggles & Analog Joystick */}
        <div className="mobile-lab-controls">
          <div
            className="virtual-joystick-base"
            onPointerDown={handleJoystickPointerDown}
            onPointerMove={handleJoystickMove}
            onPointerUp={handleJoystickPointerUp}
            onPointerCancel={handleJoystickPointerUp}
          >
            <div
              className="virtual-joystick-knob"
              style={{
                transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)`,
              }}
            />
          </div>

          <div className="mobile-nav-pills">
            <button
              type="button"
              className={`pill-btn ${mobilePanel === 'objective' ? 'active' : ''}`}
              onClick={() => setMobilePanel((m) => (m === 'objective' ? 'none' : 'objective'))}
            >
              Objectives
            </button>
            <button
              type="button"
              className={`pill-btn ${mobilePanel === 'controls' ? 'active' : ''}`}
              onClick={() => setMobilePanel((m) => (m === 'controls' ? 'none' : 'controls'))}
            >
              Controls
            </button>
          </div>
        </div>
      </main>

      {/* 6. Guided 8-Step Notebook Modal */}
      {notebookOpen && (
        <div className="notebook-modal-overlay" role="dialog" aria-modal="true">
          <div className="notebook-modal">
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-title-group">
                <span className="station-badge-small">STATION {station.number}</span>
                <h3>{station.title}</h3>
                <span className="modal-score">Earned: {currentScore} / 100 pts</span>
              </div>
              <button
                type="button"
                className="close-modal-btn"
                aria-label="Close Notebook"
                onClick={() => setNotebookOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Step Tabs 1–8 */}
            <nav className="step-tabs-bar" aria-label="8 Laboratory Steps">
              {STEP_NAMES.map((name, index) => {
                const isDone = stationProgress.completed[index];
                const isCur = notebookStep === index;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`step-tab-btn ${isCur ? 'active' : ''} ${isDone ? 'completed' : ''}`}
                    onClick={() => setNotebookStep(index)}
                  >
                    <span className="tab-num">0{index + 1}</span>
                    <span className="tab-name">{name}</span>
                    {isDone && <span className="tab-badge">✓</span>}
                  </button>
                );
              })}
            </nav>

            {/* Modal Body */}
            <div className="modal-step-body">
              {/* STEP 1: EXPLORE (10 pts) */}
              {notebookStep === 0 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+10 Points</span>
                    <h4>Step 1: Inspect 3D Apparatus & Identify Reference Markers</h4>
                  </div>
                  <p className="step-prompt">{station.steps[0].prompt}</p>

                  <div className="equipment-checklist">
                    <b>Station Component Inspection:</b>
                    <ul>
                      {INSPECTION_TARGETS[stationId].map((tgt) => {
                        const isInspected = stationProgress.inspected.includes(tgt);
                        return (
                          <li key={tgt} className={isInspected ? 'done' : ''}>
                            <span>{isInspected ? '✅' : '⬜'} {tgt.replace(`${stationId}-`, '').toUpperCase()}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="step-footer-actions">
                    <button
                      type="button"
                      className="action-btn primary"
                      disabled={stationProgress.completed[0]}
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
                      <button
                        key={opt}
                        type="button"
                        className={`prediction-option-btn ${predictionSelection === i ? (predictionStatus === 'correct' ? 'correct' : 'incorrect') : ''}`}
                        onClick={() => verifyPrediction(i)}
                      >
                        <span className="opt-letter">{String.fromCharCode(65 + i)}</span>
                        <span className="opt-text">{opt}</span>
                      </button>
                    ))}
                  </div>

                  {predictionFeedback && (
                    <div className={`feedback-alert ${predictionStatus}`}>
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
                      <p>Vs = 24.0 V · R1 = 100 Ω · R2 = 220 Ω · R3 = 330 Ω · L = 150 mH · C = 47 μF</p>
                    )}
                    {stationId === 'optics' && (
                      <p>λ = 532 nm (emerald) · n1 = 1.00 · n2 = 1.52 · θ1 = 30.0° · f = +20 cm · do = 40 cm</p>
                    )}
                    {stationId === 'relativity' && (
                      <p>β = 0.600c (γ = 1.250) · Proper Time Δt₀ = 10.0 s · Proper Length L₀ = 20.0 m</p>
                    )}
                  </div>

                  <div className="step-footer-actions">
                    <button
                      type="button"
                      className="action-btn secondary"
                      onClick={() => {
                        if (stationId === 'circuits') setCircuits(INITIAL_CIRCUITS);
                        else if (stationId === 'optics') setOptics(INITIAL_OPTICS);
                        else setRelativity(INITIAL_RELATIVITY);
                        playTone(520, 'sine', 0.1, 0.2);
                      }}
                    >
                      Reset to Exact Baseline
                    </button>
                    <button
                      type="button"
                      className="action-btn primary"
                      disabled={stationProgress.completed[2]}
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
                        <p>Apparatus is energized. Observe the real-time oscilloscope phase, refracted beam, or contracting photon clock in the 3D viewport.</p>
                        <button
                          type="button"
                          className="action-btn primary"
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

                  <div className="trials-table-container">
                    <table className="lab-table">
                      <thead>
                        <tr>
                          {stationId === 'circuits' && (
                            <>
                              <th>#</th><th>Mode</th><th>Vs (V)</th><th>f (Hz)</th><th>Z (Ω)</th><th>I (A)</th><th>cos φ</th><th>P (W)</th>
                            </>
                          )}
                          {stationId === 'optics' && (
                            <>
                              <th>#</th><th>Sub-Mode</th><th>λ (nm)</th><th>Input 1</th><th>Input 2</th><th>Theory</th><th>Measured</th><th>Tag</th>
                            </>
                          )}
                          {stationId === 'relativity' && (
                            <>
                              <th>#</th><th>β (v/c)</th><th>Speed (m/s)</th><th>γ (Lorentz)</th><th>Δt (s)</th><th>L (m)</th><th>K (MeV)</th><th>E (MeV)</th>
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
                                <td>{t.mode}</td><td>{formatValue(t.vs)}</td><td>{formatValue(t.freq)}</td><td>{formatValue(t.impedance)}</td><td>{formatValue(t.current)}</td><td>{formatValue(t.powerFactor)}</td><td>{formatValue(t.realPower)}</td>
                              </>
                            )}
                            {stationId === 'optics' && (
                              <>
                                <td>{t.subMode}</td><td>{t.wavelength}</td><td>{formatValue(t.paramA)}</td><td>{formatValue(t.paramB)}</td><td>{formatValue(t.theoretical)}</td><td>{formatValue(t.measured)}</td><td>{t.classification}</td>
                              </>
                            )}
                            {stationId === 'relativity' && (
                              <>
                                <td>{formatValue(t.beta)}</td><td>{formatValue(t.speed)}</td><td>{formatValue(t.gamma)}</td><td>{formatValue(t.dilatedTime)}</td><td>{formatValue(t.contractedLength)}</td><td>{formatValue(t.kineticEnergy)}</td><td>{formatValue(t.totalEnergy)}</td>
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

                  <div className="step-footer-actions">
                    <button
                      type="button"
                      className="action-btn secondary"
                      disabled={stationProgress.trials.length >= TOTAL_TRIALS}
                      onClick={recordCurrentTrial}
                    >
                      ➕ Record Current State as Trial #{stationProgress.trials.length + 1}
                    </button>
                    {stationProgress.trials.length >= TOTAL_TRIALS && (
                      <button
                        type="button"
                        className="action-btn primary"
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

                  <div className="calc-inputs-table">
                    {stationProgress.trials.map((t, i) => (
                      <div key={i} className="calc-row">
                        <span><b>Trial #{i + 1}:</b> ({stationId === 'circuits' ? `Vs=${t.vs}V, I=${formatValue(t.current)}A` : stationId === 'optics' ? `Input=${t.paramA}` : `β=${t.beta}c`})</span>
                        <div className="calc-input-wrapper">
                          <input
                            type="number"
                            step="any"
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
                  </div>

                  {calculationFeedback && (
                    <div className={`feedback-alert ${calculationStatus}`}>
                      {calculationFeedback}
                    </div>
                  )}

                  <div className="step-footer-actions">
                    <button
                      type="button"
                      className="action-btn secondary"
                      onClick={autoFillCalculations}
                    >
                      Calculate for Me (Check Work)
                    </button>
                    <button
                      type="button"
                      className="action-btn primary"
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

                  <div className="step-footer-actions">
                    <button
                      type="button"
                      className="action-btn primary"
                      disabled={stationProgress.completed[6]}
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

                    <div className="student-metadata-fields">
                      <label>
                        <span>Student Name:</span>
                        <input
                          type="text"
                          value={studentName}
                          onChange={(e) => setStudentName(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Student ID:</span>
                        <input
                          type="text"
                          value={studentId}
                          onChange={(e) => setStudentId(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Course Section:</span>
                        <input
                          type="text"
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

                  <div className="step-footer-actions">
                    <button
                      type="button"
                      className="action-btn secondary"
                      onClick={downloadCSVData}
                    >
                      📊 Export Experimental Data (CSV)
                    </button>
                    <button
                      type="button"
                      className="action-btn primary"
                      onClick={downloadReportPdf}
                    >
                      📄 Download Certified PDF Report (+10 pts)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Navigation Footer */}
            <div className="modal-footer">
              <button
                type="button"
                className="action-btn secondary"
                disabled={notebookStep <= 0}
                onClick={() => setNotebookStep((s) => Math.max(0, s - 1))}
              >
                ← Previous Step
              </button>
              <span className="step-indicator">
                Step {notebookStep + 1} of 8
              </span>
              <button
                type="button"
                className="action-btn secondary"
                disabled={notebookStep >= 7}
                onClick={() => setNotebookStep((s) => Math.min(7, s + 1))}
              >
                Next Step →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
