'use client';

import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  INITIAL_ELECTRO,
  INITIAL_SOUND,
  INITIAL_WAVE,
  STATIONS,
  STEP_NAMES,
  STEP_POINTS,
  TOTAL_TRIALS,
  calculateElectro,
  calculateSound,
  calculateWave,
  createDefaultProgress,
  isStationFinished,
  stationScore,
  STATION_GUIDE_QUESTIONS,
  getSeededParameters,
  calculateTrialStats,
  generateTrialsCSV,
  type ElectroSettings,
  type LabProgress,
  type SoundSettings,
  type StationId,
  type TrialRecord,
  type WaveSettings,
} from './labModel';
import { LabGraph, computeRegressionData } from './LabGraph';
import { createLabScene, type EquipmentInteraction, type LabSceneApi } from './labScene';
import { createLaboratoryPdf } from './pdfReport';
import { type CharacterType } from './characterController';

const STORAGE_KEY = 'waveElectroVirtualLabProgressV1';

const INSPECTION_TARGET: Record<StationId, string> = {
  wave: 'wave-string',
  sound: 'sound-fork',
  electro: 'electro-q1',
};

const INSPECTION_ACTIONS: Record<StationId, string[]> = {
  wave: ['wave-driver', 'wave-string', 'wave-tension', 'wave-slider'],
  sound: ['sound-fork', 'sound-tube', 'sound-microphone', 'sound-mallet'],
  electro: ['electro-q1', 'electro-q2', 'electro-rail', 'electro-probe'],
};

const RUN_TARGET: Record<StationId, string> = {
  wave: 'wave-power-switch',
  sound: 'sound-mallet',
  electro: 'electro-power-switch',
};

const REQUIRED_SETUP_ACTIONS: Record<StationId, string[]> = {
  wave: ['wave-freq-knob', 'wave-tension', 'wave-slider'],
  sound: ['sound-microphone', 'sound-tube-cap', 'sound-fork-dial'],
  electro: ['electro-q1', 'electro-leadscrew', 'electro-voltage-dial'],
};

const VARIATION_TARGET: Record<StationId, string> = {
  wave: 'wave-tension',
  sound: 'sound-temp-dial',
  electro: 'electro-voltage-dial',
};

const GUIDANCE_LABELS: Record<string, string> = {
  'wave-string': 'vibrating string', 'wave-placard': 'wave placard', 'wave-tension': 'calibrated mass hanger', 'wave-frequency': 'fixed support pulley', 'wave-driver': 'oscillator driver', 'wave-freq-knob': 'frequency dial', 'wave-power-switch': 'generator power switch', 'wave-slider': 'optical wavelength cursor', 'wave-clipboard': 'wave data clipboard',
  'sound-fork': 'tuning fork', 'sound-fork-dial': 'tuning fork collar dial', 'sound-mallet': 'rubber striker mallet', 'sound-placard': 'sound placard', 'sound-tube': 'resonance tube', 'sound-tube-cap': 'tube boundary end-cap', 'sound-temp-dial': 'thermostat dial', 'sound-microphone': 'measurement microphone', 'sound-clipboard': 'sound data clipboard',
  'electro-q1': 'electrode sphere q₁', 'electro-placard': 'electrostatics placard', 'electro-q2': 'electrode sphere q₂', 'electro-rail': 'linear separation track', 'electro-leadscrew': 'micrometer leadscrew dial', 'electro-voltage-dial': 'charge potentiometer', 'electro-power-switch': 'master HV power switch', 'electro-probe': 'electric field mill sensor', 'electro-clipboard': 'electrostatics data clipboard',
};

const STATION_ASSETS: Record<StationId, { src: string; alt: string }> = {
  wave: {
    src: '/assets/placards/placard_transverse_waves.png',
    alt: 'Vibrating-string apparatus showing a transverse wave, amplitude, and wavelength',
  },
  sound: {
    src: '/assets/placards/placard_sound_waves.png',
    alt: 'Tuning fork and resonance tube showing sound compressions and rarefactions',
  },
  electro: {
    src: '/assets/placards/placard_electrostatics.png',
    alt: 'Two charged spheres with electric-field lines and a midpoint probe',
  },
};

const TRIAL_COLUMNS: Record<StationId, Array<{ key: string; label: string }>> = {
  wave: [
    { key: 'trial', label: '#' }, { key: 'f', label: 'f (Hz)' }, { key: 'tension', label: 'T (N)' },
    { key: 'density', label: 'μ (kg/m)' }, { key: 'theoretical', label: 'v theory' }, { key: 'speed', label: 'v measured' },
    { key: 'percentError', label: '% error' }, { key: 'wavelength', label: 'λ (m)' },
  ],
  sound: [
    { key: 'trial', label: '#' }, { key: 'tube', label: 'Tube' }, { key: 'f', label: 'f (Hz)' },
    { key: 'temperature', label: 't (°C)' }, { key: 'length', label: 'L (m)' }, { key: 'theoretical', label: 'v theory' }, { key: 'speed', label: 'v measured' },
    { key: 'percentError', label: '% error' },
    { key: 'wavelength', label: 'λ (m)' }, { key: 'harmonic', label: 'n' }, { key: 'resonance', label: 'fᵣ (Hz)' }, { key: 'detuning', label: 'Δf' }, { key: 'intensity', label: 'I (W/m²)' }, { key: 'decibels', label: 'dB' },
  ],
  electro: [
    { key: 'trial', label: '#' }, { key: 'q1', label: 'q₁ (μC)' }, { key: 'q2', label: 'q₂ (μC)' },
    { key: 'separation', label: 'r (m)' }, { key: 'theoretical', label: 'F theory' }, { key: 'force', label: 'F measured' }, { key: 'percentError', label: '% error' }, { key: 'relationship', label: 'Direction' },
    { key: 'field', label: 'Eₘᵢd (N/C)' }, { key: 'potential', label: 'Vₘᵢd (V)' }, { key: 'energy', label: 'U (J)' },
  ],
};

function measurementPercent(stationId: StationId, trial: number) {
  const amplitude = stationId === 'wave' ? 0.85 : stationId === 'sound' ? 1.05 : 1.3;
  return Math.sin(trial * 2.17 + (stationId === 'wave' ? 0.4 : stationId === 'sound' ? 1.2 : 2.1)) * amplitude;
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
      <span><b>{label}</b><output>{value.toFixed(digits)} {unit}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function formatTrialValue(value: number | string) {
  if (typeof value === 'string') return value;
  if (Number.isInteger(value) && Math.abs(value) < 10000) return String(value);
  if (Math.abs(value) >= 10000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) return value.toExponential(2);
  return value.toFixed(2);
}

function safeProgress(input: unknown): LabProgress {
  const fallback = createDefaultProgress();
  if (!input || typeof input !== 'object') return fallback;
  const candidate = input as Partial<LabProgress>;
  (Object.keys(fallback) as StationId[]).forEach((id) => {
    const saved = candidate[id];
    if (!saved) return;
    fallback[id] = {
      currentStep: Math.max(0, Math.min(7, Number(saved.currentStep) || 0)),
      completed: Array.from({ length: 8 }, (_, index) => Boolean(saved.completed?.[index])),
      skipped: Array.from({ length: 8 }, (_, index) => Boolean(saved.skipped?.[index])),
      trials: Array.isArray(saved.trials) ? saved.trials.slice(0, TOTAL_TRIALS) : [],
      inspected: Array.isArray(saved.inspected) ? saved.inspected.filter((entry): entry is string => typeof entry === 'string') : [],
      setupActions: Array.isArray(saved.setupActions) ? saved.setupActions.filter((entry): entry is string => typeof entry === 'string') : [],
      calculations: Array.from({ length: TOTAL_TRIALS }, (_, index) => typeof saved.calculations?.[index] === 'string' ? saved.calculations[index] : ''),
      analysis: typeof saved.analysis === 'string' ? saved.analysis : '',
      conclusion: typeof saved.conclusion === 'string' ? saved.conclusion : '',
      recommendations: typeof saved.recommendations === 'string' ? saved.recommendations : '',
      errors: Array.isArray(saved.errors) ? saved.errors.filter((entry): entry is string => typeof entry === 'string') : [],
      guideAnswers: Array.isArray(saved.guideAnswers) ? saved.guideAnswers.slice(0, 3).map((v) => Number(v)) : [-1, -1, -1],
    };
  });
  return fallback;
}

export default function LabExperience() {
  const sceneContainer = useRef<HTMLDivElement>(null);
  const sceneApi = useRef<LabSceneApi | null>(null);
  const equipmentActionRef = useRef<(id: string) => void>(() => undefined);
  const audioContext = useRef<AudioContext | null>(null);
  const runTimer = useRef<number | null>(null);
  const soundEnabledRef = useRef(true);
  const soundVolumeRef = useRef(0.7);
  const joystickPointerId = useRef<number | null>(null);
  const [stationId, setStationId] = useState<StationId>('wave');
  const [wave, setWave] = useState<WaveSettings>(INITIAL_WAVE);
  const [sound, setSound] = useState<SoundSettings>(INITIAL_SOUND);
  const [electro, setElectro] = useState<ElectroSettings>(INITIAL_ELECTRO);
  const [paused, setPaused] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneError, setSceneError] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [assetProgress, setAssetProgress] = useState({ loaded: 0, total: 1 });
  const [interaction, setInteraction] = useState<EquipmentInteraction | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [isThirdPerson, setIsThirdPerson] = useState(true);
  const [activeCharacter, setActiveCharacter] = useState<CharacterType>('female');
  const [equipmentMessage, setEquipmentMessage] = useState('');
  const [trialReady, setTrialReady] = useState<Record<StationId, boolean>>({ wave: false, sound: false, electro: false });
  const [runSettling, setRunSettling] = useState<Record<StationId, boolean>>({ wave: false, sound: false, electro: false });
  const [progress, setProgress] = useState<LabProgress>(createDefaultProgress);
  const [hydrated, setHydrated] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [notebookStep, setNotebookStep] = useState(0);
  const [predictionSelection, setPredictionSelection] = useState<number | null>(null);
  const [predictionStatus, setPredictionStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [predictionFeedback, setPredictionFeedback] = useState('');
  const [calculationStatus, setCalculationStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [calculationFeedback, setCalculationFeedback] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [analysisFeedback, setAnalysisFeedback] = useState('');
  const [studentName, setStudentName] = useState('Student');
  const [studentId, setStudentId] = useState('PHY-2026-001');
  const [studentSection, setStudentSection] = useState('Section A');
  const [step4View, setStep4View] = useState<'table' | 'graph'>('table');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.7);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });

  const station = STATIONS[stationId];
  const stationProgress = progress[stationId];
  const waveResult = useMemo(() => calculateWave(wave), [wave]);
  const soundResult = useMemo(() => calculateSound(sound), [sound]);
  const electroResult = useMemo(() => calculateElectro(electro), [electro]);
  const score = stationScore(stationProgress);
  const totalScore = (Object.keys(progress) as StationId[]).reduce((total, id) => total + stationScore(progress[id]), 0);
  const completedStations = (Object.keys(progress) as StationId[]).filter((id) => isStationFinished(progress[id])).length;
  const [devMode, setDevMode] = useState(false);
  const isStationUnlocked = (id: StationId) => devMode || id === 'wave' || (id === 'sound' && isStationFinished(progress.wave)) || (id === 'electro' && isStationFinished(progress.sound));

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('dev') === '1' || params.get('debug') === '1') {
        setDevMode(true);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // Hydration restores the learner's local, device-specific notebook.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setProgress(safeProgress(JSON.parse(saved)));
    } catch (error) {
      console.warn('Could not restore lab progress', error);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (error) {
      console.warn('Could not save lab progress', error);
    }
  }, [hydrated, progress]);

  useEffect(() => {
    if (!sceneContainer.current) return;
    try {
      sceneApi.current = createLabScene(sceneContainer.current, {
        wave: INITIAL_WAVE,
        sound: INITIAL_SOUND,
        electro: INITIAL_ELECTRO,
      }, {
        onAssetProgress: (loaded, total) => setAssetProgress({ loaded, total: Math.max(1, total) }),
        onAssetsReady: () => setAssetsReady(true),
        onInteractionChange: setInteraction,
        onEquipmentInteract: (id) => equipmentActionRef.current(id),
        onFootstep: () => playFootstep(),
        onPointerLockChange: setPointerLocked,
      });
      // WebGL initialization is an external resource boundary; publish its
      // readiness after the renderer has been created.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSceneReady(true);
      setSceneError(false);
    } catch (error) {
      console.error(error);
      setSceneError(true);
      setSceneReady(false);
    }
    return () => {
      if (runTimer.current) window.clearTimeout(runTimer.current);
      sceneApi.current?.dispose();
      sceneApi.current = null;
      if (audioContext.current && audioContext.current.state !== 'closed') void audioContext.current.close();
      audioContext.current = null;
    };
  // The scene callback is intentionally mounted once; it owns the WebGL
  // resource lifecycle and calls the stable audio helper through its closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { sceneApi.current?.setStation(stationId); }, [stationId]);
  useEffect(() => { sceneApi.current?.setWave(wave); }, [wave]);
  useEffect(() => { sceneApi.current?.setSound(sound); }, [sound]);
  useEffect(() => { sceneApi.current?.setElectro(electro); }, [electro]);
  useEffect(() => { sceneApi.current?.setPaused(paused); }, [paused]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { soundVolumeRef.current = soundVolume; }, [soundVolume]);
  useEffect(() => {
    if (!notebookOpen) return;
    joystickPointerId.current = null;
    sceneApi.current?.setMoveVector(0, 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJoystickKnob({ x: 0, y: 0 });
  }, [notebookOpen]);
  useEffect(() => {
    const unlockAudio = () => { ensureAudioContext(); };
    ['pointerdown', 'keydown', 'click', 'touchstart'].forEach((eventName) => window.addEventListener(eventName, unlockAudio, { passive: true }));
    return () => ['pointerdown', 'keydown', 'click', 'touchstart'].forEach((eventName) => window.removeEventListener(eventName, unlockAudio));
  }, []);

  useEffect(() => {
    if (!equipmentMessage) return;
    const duration = equipmentMessage.startsWith('Student Lab Assistant:') ? 6500 : 2800;
    const timeout = window.setTimeout(() => setEquipmentMessage(''), duration);
    return () => window.clearTimeout(timeout);
  }, [equipmentMessage]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (element && typeof element.matches === 'function' && element.matches('input, textarea, select, button')) return;
      if (event.key === '1') selectStation('wave');
      if (event.key === '2') selectStation('sound');
      if (event.key === '3') selectStation('electro');
      if (event.key.toLowerCase() === 'v') {
        const is3rd = sceneApi.current?.toggleView();
        if (typeof is3rd === 'boolean') setIsThirdPerson(is3rd);
      }
      if (event.key.toLowerCase() === 'c') {
        const next = sceneApi.current?.switchCharacter();
        if (next) {
          setActiveCharacter(next);
          const name = next === 'female' ? 'Female (Carla)' : 'Male (Eric)';
          setEquipmentMessage(`Character: ${name} (Press C to switch)`);
          try {
            window.localStorage.setItem('physics_lab_character_preference', next);
          } catch {}
        }
      }
      if (event.key.toLowerCase() === 'n') openNotebook();
      if (event.code === 'Tab') { event.preventDefault(); openNotebook(); }
      if (event.key === 'Escape') setNotebookOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const selectStation = (id: StationId) => {
    if (!isStationUnlocked(id)) {
      const prerequisite = id === 'sound' ? 'Transverse Waves' : 'Sound Waves';
      setEquipmentMessage(`Station locked. Complete and certify ${prerequisite} first.`);
      return false;
    }
    setStationId(id);
    if (runTimer.current) window.clearTimeout(runTimer.current);
    setNotebookOpen(false);
    setPredictionSelection(null);
    setPredictionStatus('idle');
    setPredictionFeedback('');
    setCalculationStatus('idle');
    setCalculationFeedback('');
    setAnalysisStatus('idle');
    setAnalysisFeedback('');
    setPaused(true);
    setTrialReady((current) => ({ ...current, [id]: false }));
    setRunSettling((current) => ({ ...current, [id]: false }));
    sceneApi.current?.setMoveVector(0, 0);
    setJoystickKnob({ x: 0, y: 0 });
    return true;
  };

  const moveJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const maxRadius = Math.min(bounds.width, bounds.height) * 0.32;
    const rawX = event.clientX - (bounds.left + bounds.width / 2);
    const rawY = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maxRadius ? maxRadius / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    const normalizedX = Math.abs(x / maxRadius) < 0.12 ? 0 : x / maxRadius;
    const normalizedForward = Math.abs(y / maxRadius) < 0.12 ? 0 : -y / maxRadius;
    setJoystickKnob({ x, y });
    sceneApi.current?.setMoveVector(normalizedX, normalizedForward);
  };

  const startJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    joystickPointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveJoystick(event);
  };

  const releaseJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== event.pointerId) return;
    joystickPointerId.current = null;
    sceneApi.current?.setMoveVector(0, 0);
    setJoystickKnob({ x: 0, y: 0 });
  };

  const openNotebook = (step = stationProgress.currentStep) => {
    if (document.pointerLockElement) document.exitPointerLock();
    setNotebookStep(step);
    setNotebookOpen(true);
  };

  const returnToApparatus = (message: string) => {
    setNotebookOpen(false);
    setEquipmentMessage(message);
    sceneApi.current?.requestPointerLock();
  };

  const completeStep = (step: number) => {
    setProgress((current) => {
      const active = current[stationId];
      const completed = [...active.completed];
      const skipped = [...(active.skipped || Array(8).fill(false))];
      completed[step] = true;
      skipped[step] = false;
      const currentStep = step === active.currentStep ? Math.min(7, step + 1) : active.currentStep;
      return { ...current, [stationId]: { ...active, completed, skipped, currentStep } };
    });
    playMilestone();
    if (step < 7) setNotebookStep(step + 1);
  };

  const skipStep = (step: number, nextStep?: number) => {
    setProgress((current) => {
      const active = current[stationId];
      const completed = [...active.completed];
      const skipped = [...(active.skipped || Array(8).fill(false))];
      if (!completed[step]) {
        skipped[step] = true;
      }
      const currentStep = nextStep !== undefined ? Math.min(7, nextStep) : (step === active.currentStep ? Math.min(7, step + 1) : active.currentStep);
      return { ...current, [stationId]: { ...active, completed, skipped, currentStep } };
    });
    const target = nextStep !== undefined ? Math.min(7, nextStep) : Math.min(7, step + 1);
    setNotebookStep(target);
    setEquipmentMessage(`⏭️ Step ${step + 1} skipped (0 pts). Proceeding to Step ${target + 1}.`);
  };

  const fillReferenceFallbackTrials = () => {
    setProgress((current) => {
      const active = current[stationId];
      if (active.trials.length >= TOTAL_TRIALS) return current;
      let sampleTrials: TrialRecord[] = [];
      if (stationId === 'wave') {
        sampleTrials = [
          { trial: 1, f: 2.0, amplitude: 0.32, tension: 36, density: 0.04, theoretical: 30.0, speed: 30.2, percentError: 0.67, wavelength: 15.1, period: 0.5 },
          { trial: 2, f: 2.0, amplitude: 0.32, tension: 48, density: 0.04, theoretical: 34.64, speed: 34.9, percentError: 0.75, wavelength: 17.45, period: 0.5 },
          { trial: 3, f: 2.5, amplitude: 0.32, tension: 48, density: 0.04, theoretical: 34.64, speed: 34.5, percentError: 0.40, wavelength: 13.8, period: 0.4 },
          { trial: 4, f: 2.5, amplitude: 0.32, tension: 60, density: 0.04, theoretical: 38.73, speed: 38.9, percentError: 0.44, wavelength: 15.56, period: 0.4 },
          { trial: 5, f: 3.0, amplitude: 0.32, tension: 72, density: 0.04, theoretical: 42.43, speed: 42.1, percentError: 0.78, wavelength: 14.03, period: 0.333 },
        ];
      } else if (stationId === 'sound') {
        sampleTrials = [
          { trial: 1, tube: 'closed', f: 110, temperature: 20, length: 0.78, distance: 1.5, sourcePower: 0.01, theoretical: 344.0, speed: 345.5, percentError: 0.44, wavelength: 3.14, harmonic: 1, resonance: 110.26, detuning: 0.26, intensity: 3.54e-4, decibels: 85.5 },
          { trial: 2, tube: 'closed', f: 110, temperature: 25, length: 0.78, distance: 1.5, sourcePower: 0.01, theoretical: 347.0, speed: 348.2, percentError: 0.35, wavelength: 3.17, harmonic: 1, resonance: 111.22, detuning: 1.22, intensity: 3.54e-4, decibels: 85.5 },
          { trial: 3, tube: 'open', f: 220, temperature: 20, length: 0.78, distance: 1.5, sourcePower: 0.01, theoretical: 344.0, speed: 343.1, percentError: 0.26, wavelength: 1.56, harmonic: 1, resonance: 220.51, detuning: 0.51, intensity: 3.54e-4, decibels: 85.5 },
          { trial: 4, tube: 'open', f: 220, temperature: 30, length: 0.78, distance: 1.5, sourcePower: 0.01, theoretical: 350.0, speed: 351.4, percentError: 0.40, wavelength: 1.60, harmonic: 1, resonance: 224.36, detuning: 4.36, intensity: 3.54e-4, decibels: 85.5 },
          { trial: 5, tube: 'closed', f: 110, temperature: 30, length: 0.78, distance: 2.0, sourcePower: 0.01, theoretical: 350.0, speed: 348.9, percentError: 0.31, wavelength: 3.17, harmonic: 1, resonance: 112.18, detuning: 2.18, intensity: 1.99e-4, decibels: 83.0 },
        ];
      } else {
        sampleTrials = [
          { trial: 1, q1: 4, q2: -6, separation: 0.6, theoretical: 0.60, force: 0.60, percentError: 0.0, relationship: 'Attraction', field: 9.99e5, potential: -5.99e4, energy: -3.60e-1 },
          { trial: 2, q1: 6, q2: -6, separation: 0.6, theoretical: 0.90, force: 0.89, percentError: 1.11, relationship: 'Attraction', field: 1.20e6, potential: 0.0, energy: -5.39e-1 },
          { trial: 3, q1: 6, q2: -6, separation: 0.9, theoretical: 0.40, force: 0.40, percentError: 0.0, relationship: 'Attraction', field: 5.33e5, potential: 0.0, energy: -3.60e-1 },
          { trial: 4, q1: 8, q2: -6, separation: 0.9, theoretical: 0.53, force: 0.53, percentError: 0.0, relationship: 'Attraction', field: 6.22e5, potential: 4.44e4, energy: -4.79e-1 },
          { trial: 5, q1: 8, q2: -6, separation: 1.2, theoretical: 0.30, force: 0.30, percentError: 0.0, relationship: 'Attraction', field: 3.50e5, potential: 3.33e4, energy: -3.60e-1 },
        ];
      }
      return { ...current, [stationId]: { ...active, trials: sampleTrials } };
    });
  };

  const retryStep1 = () => {
    setPredictionSelection(null);
    setPredictionStatus('idle');
    setPredictionFeedback('');
  };

  const retryStep5 = () => {
    setCalculationStatus('idle');
    setCalculationFeedback('');
  };

  const retryStep6 = () => {
    setAnalysisStatus('idle');
    setAnalysisFeedback('');
  };

  const retryStep = (step: number) => {
    setProgress((current) => {
      const active = current[stationId];
      const skipped = [...(active.skipped || Array(8).fill(false))];
      skipped[step] = false;
      return { ...current, [stationId]: { ...active, skipped } };
    });
    if (step === 1) retryStep1();
    if (step === 5) retryStep5();
    if (step === 6) retryStep6();
    setNotebookStep(step);
  };

  const skipAllRemainingStepsAndSubmit = () => {
    fillReferenceFallbackTrials();
    setProgress((current) => {
      const active = current[stationId];
      const completed = [...active.completed];
      const skipped = [...(active.skipped || Array(8).fill(false))];
      for (let i = 0; i < 7; i += 1) {
        if (!completed[i] && !skipped[i]) {
          skipped[i] = true;
        }
      }
      return { ...current, [stationId]: { ...active, completed, skipped, currentStep: 7 } };
    });
    setNotebookStep(7);
    setEquipmentMessage('Remaining steps skipped (0 pts). You may now certify and download the report.');
  };

  const applySetup = () => {
    if (stationId === 'wave') setWave({ ...INITIAL_WAVE });
    if (stationId === 'sound') setSound({ ...INITIAL_SOUND });
    if (stationId === 'electro') setElectro({ ...INITIAL_ELECTRO });
    setProgress((current) => ({ ...current, [stationId]: { ...current[stationId], setupActions: [] } }));
    setPaused(true);
    setTrialReady((current) => ({ ...current, [stationId]: false }));
    returnToApparatus('Baseline values loaded. Follow the pulsing marker and operate each required control on the apparatus.');
  };

  const applySeededSetup = () => {
    const seeded = getSeededParameters(studentId, stationId);
    if (stationId === 'wave') {
      const s = seeded as { density: number; tension: number };
      setWave((current) => ({ ...current, density: s.density, tension: s.tension }));
    } else if (stationId === 'sound') {
      const s = seeded as { temperature: number; length: number };
      setSound((current) => ({ ...current, temperature: s.temperature, length: s.length }));
    } else {
      const s = seeded as { q1: number; q2: number; separation: number };
      setElectro((current) => ({ ...current, q1: s.q1, q2: s.q2, separation: s.separation }));
    }
    setProgress((current) => ({ ...current, [stationId]: { ...current[stationId], setupActions: [] } }));
    setPaused(true);
    setTrialReady((current) => ({ ...current, [stationId]: false }));
    returnToApparatus(`Calibrated unique parameters for Student ID ${studentId}. Complete physical setup on the apparatus.`);
  };

  function ensureAudioContext() {
    if (typeof window === 'undefined') return;
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = audioContext.current ?? new AudioContextConstructor();
    audioContext.current = context;
    if (context.state === 'suspended') void context.resume();
    return context;
  }

  function playOscillator(frequency: number, duration: number, level: number, type: OscillatorType = 'sine', endFrequency?: number) {
    if (!soundEnabledRef.current) return;
    const context = ensureAudioContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.min(3000, Math.max(35, frequency)), context.currentTime);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, endFrequency), context.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * soundVolumeRef.current), context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  }

  function playTone() {
    playOscillator(sound.frequency, 0.9, 0.11);
  }

  function playEquipmentClick() {
    playOscillator(2400, 0.075, 0.045, 'sine', 1750);
  }

  function playRunSound(id: StationId) {
    if (id === 'wave') {
      playOscillator(60, 0.8, 0.045, 'sine');
      playOscillator(120, 0.8, 0.025, 'triangle');
    } else if (id === 'sound') playTone();
    else {
      playOscillator(1150, 0.12, 0.05, 'sine');
      window.setTimeout(() => playOscillator(1480, 0.14, 0.045, 'sine'), 115);
    }
  }

  function playMilestone() {
    playOscillator(740, 0.12, 0.035, 'sine');
    window.setTimeout(() => playOscillator(980, 0.18, 0.04, 'sine'), 110);
  }

  function playFootstep() {
    if (!soundEnabledRef.current) return;
    const context = ensureAudioContext();
    if (!context) return;
    const duration = 0.09;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    gain.gain.value = 0.085 * soundVolumeRef.current;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
  }

  const runExperiment = () => {
    returnToApparatus(`Operate the highlighted ${GUIDANCE_LABELS[RUN_TARGET[stationId]]} to run the experiment and earn Run credit.`);
  };

  const startStationRun = () => {
    if (runSettling[stationId]) return;
    setPaused(false);
    setTrialReady((current) => ({ ...current, [stationId]: false }));
    setRunSettling((current) => ({ ...current, [stationId]: true }));
    playRunSound(stationId);
    setEquipmentMessage('Experiment running — allow the instrument reading to stabilize.');
    if (runTimer.current) window.clearTimeout(runTimer.current);
    const runStation = stationId;
    const shouldCompleteRun = stationProgress.currentStep === 3;
    runTimer.current = window.setTimeout(() => {
      setRunSettling((current) => ({ ...current, [runStation]: false }));
      setTrialReady((current) => ({ ...current, [runStation]: true }));
      if (shouldCompleteRun) completeStep(3);
      setEquipmentMessage('Stable reading acquired. Follow the marker to the data clipboard.');
    }, 700);
  };

  const invalidateStationRun = () => {
    if (stationProgress.currentStep < 4) return;
    setPaused(true);
    setTrialReady((current) => ({ ...current, [stationId]: false }));
  };

  const changeWave = (update: (current: WaveSettings) => WaveSettings) => {
    setWave(update);
    invalidateStationRun();
    playEquipmentClick();
  };

  const changeSound = (update: (current: SoundSettings) => SoundSettings) => {
    setSound(update);
    invalidateStationRun();
    playEquipmentClick();
  };

  const changeElectro = (update: (current: ElectroSettings) => ElectroSettings) => {
    setElectro(update);
    invalidateStationRun();
    playEquipmentClick();
  };

  const currentTrial = (): TrialRecord => {
    const trial = stationProgress.trials.length + 1;
    const signedError = measurementPercent(stationId, trial);
    if (stationId === 'wave') {
      const measuredSpeed = waveResult.speed * (1 + signedError / 100);
      return {
        trial, f: wave.frequency, amplitude: wave.amplitude, tension: wave.tension, density: wave.density,
        theoretical: waveResult.speed, speed: measuredSpeed, percentError: Math.abs(signedError), wavelength: measuredSpeed / wave.frequency, period: waveResult.period,
      };
    }
    if (stationId === 'sound') {
      const measuredSpeed = soundResult.speed * (1 + signedError / 100);
      return {
        trial, tube: sound.tubeType, f: sound.frequency, temperature: sound.temperature, length: sound.length,
        distance: sound.distance, sourcePower: soundResult.sourcePower, theoretical: soundResult.speed, speed: measuredSpeed, percentError: Math.abs(signedError), wavelength: measuredSpeed / sound.frequency,
        harmonic: soundResult.harmonic, resonance: soundResult.resonanceFrequency, detuning: soundResult.detuning, intensity: soundResult.intensity, decibels: soundResult.decibels,
      };
    }
    const measuredForce = electroResult.force * (1 + signedError / 100);
    return {
      trial, q1: electro.q1, q2: electro.q2, separation: electro.separation, theoretical: electroResult.force, force: measuredForce, percentError: Math.abs(signedError),
      relationship: electroResult.relationship, field: electroResult.fieldMidpoint,
      potential: electroResult.potentialMidpoint, energy: electroResult.potentialEnergy,
    };
  };

  const trialHasChanged = () => {
    return !stationProgress.trials.some((trial) => {
      if (stationId === 'wave') return trial.f === wave.frequency && trial.tension === wave.tension && trial.density === wave.density && trial.amplitude === wave.amplitude;
      if (stationId === 'sound') return trial.tube === sound.tubeType && trial.f === sound.frequency && trial.temperature === sound.temperature && trial.length === sound.length && trial.distance === sound.distance;
      return trial.q1 === electro.q1 && trial.q2 === electro.q2 && trial.separation === electro.separation;
    });
  };

  const requiredSetup = REQUIRED_SETUP_ACTIONS[stationId];
  const missingSetupAction = requiredSetup.find((id) => !stationProgress.setupActions.includes(id));
  const missingInspectionAction = INSPECTION_ACTIONS[stationId].find((id) => !stationProgress.inspected.includes(id));
  const setupIsComplete = stationProgress.completed[2] || !missingSetupAction;

  const waveVariationTarget = stationProgress.trials.length % 2 === 1 ? 'wave-tension' : 'wave-freq-knob';
  const soundVariationTarget = stationProgress.trials.length % 2 === 1 ? 'sound-temp-dial' : 'sound-tube-cap';
  const electroVariationTarget = stationProgress.trials.length % 2 === 1 ? 'electro-voltage-dial' : 'electro-leadscrew';
  const guidanceTarget = stationProgress.currentStep === 0
    ? missingInspectionAction ?? INSPECTION_TARGET[stationId]
    : stationProgress.currentStep === 1
      ? `${stationId}-placard`
      : stationProgress.currentStep === 2
        ? missingSetupAction ?? RUN_TARGET[stationId]
        : stationProgress.currentStep === 3
          ? RUN_TARGET[stationId]
          : stationProgress.currentStep === 4
            ? (!trialHasChanged()
                ? (stationId === 'wave' ? waveVariationTarget : stationId === 'sound' ? soundVariationTarget : electroVariationTarget)
                : trialReady[stationId]
                  ? `${stationId}-clipboard`
                  : (stationId === 'wave' ? 'wave-slider' : stationId === 'sound' ? (stationProgress.trials.length % 2 === 0 ? 'sound-mallet' : 'sound-microphone') : 'electro-probe'))
            : null;

  useEffect(() => {
    sceneApi.current?.setGuidance(guidanceTarget);
  }, [guidanceTarget, sceneReady]);

  const recordTrial = () => {
    if (!trialReady[stationId] || runSettling[stationId]) return false;
    if (!trialHasChanged()) return false;
    setProgress((current) => {
      const active = current[stationId];
      if (active.trials.length >= TOTAL_TRIALS) return current;
      const trials = [...active.trials, currentTrial()];
      const completed = [...active.completed];
      let currentStep = active.currentStep;
      if (trials.length === TOTAL_TRIALS) {
        completed[4] = true;
        if (active.currentStep === 4) currentStep = 5;
      }
      return { ...current, [stationId]: { ...active, trials, completed, currentStep } };
    });
    setTrialReady((current) => ({ ...current, [stationId]: false }));
    setPaused(true);
    if (stationProgress.trials.length === TOTAL_TRIALS - 1) setNotebookStep(5);
    return true;
  };

  const submitPrediction = () => {
    if (predictionSelection === null) return;
    if (predictionSelection === station.prediction.answer) {
      setPredictionStatus('correct');
      setPredictionFeedback(`✅ Correct — ${station.prediction.explanation}`);
      completeStep(1);
    } else {
      setPredictionStatus('incorrect');
      setPredictionFeedback('❌ Incorrect. Review the governing physics principles and reconsider.');
    }
  };

  const calculationUnit = stationId === 'electro' ? 'N' : 'm/s';
  const updateCalculation = (index: number, value: string) => {
    setProgress((current) => {
      const calculations = [...current[stationId].calculations];
      calculations[index] = value;
      return { ...current, [stationId]: { ...current[stationId], calculations } };
    });
  };
  const submitCalculation = () => {
    if (stationProgress.trials.length < TOTAL_TRIALS) return;
    const checks = stationProgress.trials.map((trial, index) => {
      const expected = Number(trial.theoretical ?? (stationId === 'electro' ? trial.force : trial.speed));
      const answer = Number(stationProgress.calculations[index]);
      const relativeError = expected === 0 ? Math.abs(answer) : Math.abs(answer - expected) / Math.abs(expected);
      return Number.isFinite(answer) && relativeError <= 0.02;
    });
    if (checks.every(Boolean)) {
      setCalculationStatus('correct');
      setCalculationFeedback(`✅ Correct! All ${TOTAL_TRIALS} multi-trial calculation values verified within ±2% (+20 pts).`);
      completeStep(5);
    } else {
      const failed = checks.map((correct, index) => correct ? null : index + 1).filter(Boolean).join(', ');
      setCalculationStatus('incorrect');
      setCalculationFeedback(`❌ Incorrect: Calculation check failed on Trial ${failed}. Verify formulas, constants, and unit conversions.`);
    }
  };

  const updateAnalysis = (analysis: string) => {
    setProgress((current) => ({ ...current, [stationId]: { ...current[stationId], analysis } }));
  };

  const updateConclusion = (conclusion: string) => {
    setProgress((current) => ({ ...current, [stationId]: { ...current[stationId], conclusion } }));
  };

  const updateRecommendations = (recommendations: string) => {
    setProgress((current) => ({ ...current, [stationId]: { ...current[stationId], recommendations } }));
  };

  const toggleError = (error: string) => {
    setProgress((current) => {
      const active = current[stationId];
      const errors = active.errors.includes(error) ? active.errors.filter((entry) => entry !== error) : [...active.errors, error];
      return { ...current, [stationId]: { ...active, errors } };
    });
  };

  const insertObservationTemplate = () => {
    let tpl = '';
    if (stationId === 'wave') {
      tpl = 'Across Trials 1 to 5, increasing string tension from 36 N to 72 N increased wave speed from 30.0 m/s to 42.4 m/s, while changing frequency from 2.0 Hz to 3.0 Hz reduced wavelength from 15.0 m to 14.0 m.';
    } else if (stationId === 'sound') {
      tpl = 'Across Trials 1 to 5, raising air temperature from 20 °C to 30 °C increased sound speed from 344.0 m/s to 350.0 m/s. Open tubes supported integer harmonics while closed tubes supported odd harmonics.';
    } else {
      tpl = 'Across Trials 1 to 5, increasing charge magnitude from 4 μC to 8 μC doubled the Coulomb force, while increasing separation from 0.60 m to 1.20 m reduced force by a factor of 4.';
    }
    updateAnalysis(tpl);
    setAnalysisStatus('idle');
    setAnalysisFeedback('');
  };

  const insertConclusionTemplate = () => {
    let tpl = '';
    if (stationId === 'wave') {
      tpl = 'The experimental data confirms that transverse wave speed on a stretched string is directly proportional to the square root of tension (v = √(T/μ)) and independent of driving frequency.';
    } else if (stationId === 'sound') {
      tpl = 'The measurements verify that acoustic speed in air is governed by thermodynamic temperature according to v ≈ 332 + 0.6t, while tube boundary conditions dictate discrete resonant frequencies.';
    } else {
      tpl = 'The data rigorously confirms Coulomb’s Inverse-Square Law (F = k|q₁q₂|/r²): electrostatic force varies in direct proportion to charge product and decreases with the inverse square of separation.';
    }
    updateConclusion(tpl);
    setAnalysisStatus('idle');
    setAnalysisFeedback('');
  };

  const insertRecommendationTemplate = () => {
    let tpl = '';
    if (stationId === 'wave') {
      tpl = 'To reduce experimental error, recommend using an optical stroboscopic tachometer to accurately pinpoint standing nodes and a digital load cell to eliminate pulley axle friction.';
    } else if (stationId === 'sound') {
      tpl = 'To improve precision, recommend applying open-end correction factors (ΔL ≈ 0.6r), using a sound-level calibrator, and performing measurements in an anechoic chamber.';
    } else {
      tpl = 'To minimize electrostatic uncertainties, recommend maintaining laboratory relative humidity below 30% to prevent charge leakage and shielding the rail from ambient conductive surfaces.';
    }
    updateRecommendations(tpl);
    setAnalysisStatus('idle');
    setAnalysisFeedback('');
  };

  const analysisMentionsTrial = /trial|t[1-5]/i.test(stationProgress.analysis);
  const analysisMentionsVariable = stationId === 'wave'
    ? /tension|frequency|density|speed|wavelength/i.test(stationProgress.analysis)
    : stationId === 'sound'
      ? /temperature|tube|distance|resonance|sound|speed|harmonic/i.test(stationProgress.analysis)
      : /charge|separation|force|field|potential|distance/i.test(stationProgress.analysis);
  const observationHasEvidence = stationProgress.analysis.trim().length >= 45 && analysisMentionsTrial;
  const conclusionHasEvidence = (stationProgress.conclusion || '').trim().length >= 35;
  const recommendationsHaveEvidence = (stationProgress.recommendations || '').trim().length >= 35;
  const analysisHasEvidence = observationHasEvidence && conclusionHasEvidence && recommendationsHaveEvidence;

  const submitAnalysis = () => {
    const guideQuestions = STATION_GUIDE_QUESTIONS[stationId];
    const allGuideAnswered = (stationProgress.guideAnswers ?? []).length === 3 &&
      (stationProgress.guideAnswers ?? []).every((ans) => ans !== -1);
    const allGuideCorrect = allGuideAnswered &&
      guideQuestions.every((q, idx) => (stationProgress.guideAnswers?.[idx] ?? -1) === q.correctIndex);

    if (!analysisHasEvidence || stationProgress.errors.length === 0) {
      setAnalysisStatus('incorrect');
      setAnalysisFeedback('❌ Incomplete: Please complete Observation, Conclusion, and Recommendations sections, and select at least one uncertainty source.');
      return;
    }
    if (!allGuideCorrect) {
      setAnalysisStatus('incorrect');
      setAnalysisFeedback('❌ Review Guide Questions: Please answer all 3 conceptual guide questions correctly before submitting.');
      return;
    }
    setAnalysisStatus('correct');
    setAnalysisFeedback('✅ Correct! Scientific observation, conclusion, recommendations, uncertainties, and conceptual guide questions verified (+10 pts).');
    completeStep(6);
  };

  const buildReport = () => {
    const active = progress[stationId];
    const averageError = active.trials.length
      ? active.trials.reduce((sum, trial) => sum + Number(trial.percentError ?? 0), 0) / active.trials.length
      : 0;
    const reg = computeRegressionData(stationId, active.trials);
    const guideQuestions = STATION_GUIDE_QUESTIONS[stationId];

    const lines = [
      '=== PHYSICS UNIVERSITY VIRTUAL LABORATORY ===',
      'CERTIFIED EXPERIMENTAL RECORD',
      `Student: ${studentName}`,
      `Student ID: ${studentId}`,
      `Section: ${studentSection}`,
      `Generated: ${new Date().toLocaleString()}`,
      `Station: ${station.title}`,
      `Score: ${stationScore(active)} / 100`,
      '',
      '=== OBJECTIVE ===', station.objective,
      '',
      `=== FIVE-TRIAL DATA RECORD (${active.trials.length} / 5) ===`,
      ...(active.trials.length ? active.trials.map((trial, index) => `Trial ${index + 1}: ${Object.entries(trial).map(([key, value]) => `${key}=${formatTrialValue(value)}`).join(' | ')}`) : ['Measurement Step: SKIPPED (0 pts) — No recorded trials.']),
      '',
      `Mean instrument error: ${averageError.toFixed(2)}%`,
      `Submitted calculations: ${active.calculations.map((value, index) => `T${index + 1}=${value || '—'}`).join(' · ')}`,
      '',
      '=== LEAST-SQUARES REGRESSION ANALYSIS ===',
      reg ? `Fit equation: y = ${reg.slope >= 0 ? '' : '-'}${Math.abs(reg.slope).toFixed(3)}x ${reg.intercept >= 0 ? '+' : '-'} ${Math.abs(reg.intercept).toFixed(3)}` : 'Insufficient trials for regression.',
      reg ? `Coefficient of determination (R^2): ${reg.rSquared.toFixed(4)}` : 'R^2: N/A',
      reg ? `Physical interpretation: ${reg.physicalInterpretation}` : '',
      '',
      '=== CONCEPTUAL GUIDE QUESTIONS (FORMATIVE ASSESSMENT) ===',
      ...guideQuestions.map((q, idx) => {
        const userAns = active.guideAnswers?.[idx] ?? -1;
        const isCorrect = userAns === q.correctIndex;
        return `Q${idx + 1}: [${isCorrect ? 'PASS' : 'INCOMPLETE'}] ${q.question.slice(0, 70)}...`;
      }),
      '',
      '=== 1. SCIENTIFIC OBSERVATIONS & TRENDS ===',
      active.analysis || (active.skipped?.[6] ? 'Observations: SKIPPED (0 pts)' : 'No observation entered.'),
      '',
      '=== 2. SCIENTIFIC CONCLUSION ===',
      active.conclusion || (active.skipped?.[6] ? 'Conclusion: SKIPPED (0 pts)' : 'No conclusion entered.'),
      '',
      '=== 3. PRACTICAL RECOMMENDATIONS & IMPROVEMENTS ===',
      active.recommendations || (active.skipped?.[6] ? 'Recommendations: SKIPPED (0 pts)' : 'No recommendations entered.'),
      '',
      '=== 4. IDENTIFIED SOURCES OF UNCERTAINTY ===',
      ...(active.errors.length ? active.errors.map((entry) => `- ${entry}`) : ['- None selected']),
      '',
      '=== INSTRUCTOR RUBRIC ===',
      ...STEP_NAMES.map((name, index) => `${index + 1}. ${name}: ${active.completed[index] ? 'COMPLETE' : (active.skipped?.[index] ? 'SKIPPED' : 'INCOMPLETE')} (${active.completed[index] ? STEP_POINTS[index] : 0} / ${STEP_POINTS[index]} pts)`),
      '',
      `Source material: ${station.sourceLesson} (user-supplied reference deck).`,
      'Certified locally by the Physics University Virtual Laboratory.',
    ];
    return lines.join('\r\n');
  };

  const downloadCSV = () => {
    const csv = generateTrialsCSV(stationId, stationProgress.trials, studentName, studentId);
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${stationId}-trials-data-${studentId || 'student'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadReport = () => {
    const steps0To6Resolved = Array.from({ length: 7 }, (_, i) => stationProgress.completed[i] || stationProgress.skipped?.[i]).every(Boolean);
    if (!studentName.trim() || !studentSection.trim() || !steps0To6Resolved) return;
    completeStep(7);
    const blob = createLaboratoryPdf(buildReport().split('\r\n'));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${stationId}-physics-university-certificate.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetProgress = () => {
    if (!window.confirm('Reset all three stations, trials, analysis, and scores?')) return;
    if (runTimer.current) window.clearTimeout(runTimer.current);
    setProgress(createDefaultProgress());
    setTrialReady({ wave: false, sound: false, electro: false });
    setRunSettling({ wave: false, sound: false, electro: false });
    setPaused(true);
    setNotebookStep(0);
    setPredictionSelection(null);
    setPredictionFeedback('');
    setCalculationFeedback('');
  };

  const handleEquipmentInteraction = (id: string) => {
    if (id === 'campus-door') {
      sceneApi.current?.openDoor(() => window.location.assign('/'));
      setEquipmentMessage('Door opening — returning to the university hallway.');
      return;
    }
    const targetStation: StationId = id.startsWith('sound-') ? 'sound' : id.startsWith('electro-') ? 'electro' : 'wave';
    if (targetStation !== stationId) {
      if (!selectStation(targetStation)) return;
    }
    const currentProg = progress[targetStation];

    if (id.endsWith('-placard')) {
      openNotebook(currentProg.currentStep === 1 ? 1 : 0);
      setEquipmentMessage(`${STATIONS[targetStation].shortName} theory reference opened at the correct notebook step.`);
      return;
    }

    if (currentProg.currentStep === 0 && INSPECTION_ACTIONS[targetStation].includes(id)) {
      const inspected = Array.from(new Set([...currentProg.inspected, id]));
      const complete = INSPECTION_ACTIONS[targetStation].every((entry) => inspected.includes(entry));
      setProgress((current) => ({ ...current, [targetStation]: { ...current[targetStation], inspected } }));
      playEquipmentClick();
      if (complete) completeStep(0);
      setEquipmentMessage(complete
        ? 'All apparatus components inspected. Explore complete — use the placard to make your prediction.'
        : `${inspected.length}/${INSPECTION_ACTIONS[targetStation].length} apparatus components inspected. Follow the marker to the next component.`);
      return;
    }

    const setupControl = REQUIRED_SETUP_ACTIONS[targetStation].includes(id);
    if (setupControl && currentProg.currentStep < 2) {
      setEquipmentMessage('Complete Explore and Predict first. Setup controls unlock in sequence after the prediction.');
      return;
    }

    const markSetupAction = () => {
      if (currentProg.currentStep !== 2) return '';
      const next = Array.from(new Set([...currentProg.setupActions, id]));
      setProgress((current) => ({ ...current, [targetStation]: { ...current[targetStation], setupActions: next } }));
      const required = REQUIRED_SETUP_ACTIONS[targetStation];
      const complete = required.every((entry) => next.includes(entry));
      if (complete) completeStep(2);
      playEquipmentClick();
      return complete
        ? 'Baseline configuration verified. Follow the marker to run the apparatus.'
        : `${next.length}/${required.length} physical setup actions complete. Follow the marker to the next control.`;
    };

    if (id.endsWith('-clipboard')) {
      if (currentProg.currentStep < 4) {
        setEquipmentMessage('The data clipboard is ready after Explore, Predict, Setup, and Run are complete.');
        return;
      }
      if (currentProg.trials.length >= TOTAL_TRIALS) {
        setEquipmentMessage(`All ${TOTAL_TRIALS} experimental trials are already recorded.`);
        return;
      }
      if (!trialReady[targetStation] || runSettling[targetStation]) {
        setEquipmentMessage(runSettling[targetStation] ? 'Wait for the instrument reading to stabilize.' : `Run the highlighted ${GUIDANCE_LABELS[RUN_TARGET[targetStation]]} before recording this condition.`);
        return;
      }
      if (!recordTrial()) {
        setEquipmentMessage(`This condition duplicates an earlier trial. Change the highlighted ${GUIDANCE_LABELS[VARIATION_TARGET[targetStation]]}, then run again.`);
        return;
      }
      setEquipmentMessage(`Trial ${currentProg.trials.length + 1} of ${TOTAL_TRIALS} recorded from live instruments. ${currentProg.trials.length < TOTAL_TRIALS - 1 ? 'Change a highlighted control before the next trial.' : 'All five trials complete — proceed to Calculate.'}`);
      return;
    }

    switch (id) {
      case 'wave-string':
        setEquipmentMessage(`Taut string inspected: linear density μ = ${wave.density.toFixed(3)} kg/m, wave speed v = ${waveResult.speed.toFixed(1)} m/s, wavelength λ = ${waveResult.wavelength.toFixed(2)} m.`);
        break;
      case 'wave-driver':
        setEquipmentMessage(`Electromechanical driver inspected: variable oscillator shaft coupled to string blade at x = -1.67 m.`);
        break;
      case 'wave-freq-knob': {
        const freqSteps = [2.0, 2.5, 3.0, 3.5, 2.0];
        const next = stationProgress.currentStep === 2
          ? INITIAL_WAVE.frequency
          : stationProgress.currentStep === 4
            ? (stationProgress.trials.length % 2 === 1 ? 2.5 : 3.0)
            : freqSteps[(freqSteps.indexOf(wave.frequency) + 1) % freqSteps.length] || 2.5;
        setWave((current) => ({ ...current, frequency: next }));
        invalidateStationRun();
        const progressMessage = markSetupAction();
        setEquipmentMessage(`Knurled frequency dial rotated. Driver frequency set to ${next.toFixed(1)} Hz. ${progressMessage}`);
        break;
      }
      case 'wave-power-switch':
        if (stationProgress.currentStep < 3 || !setupIsComplete) {
          setEquipmentMessage(`The generator switch is locked until baseline setup is verified. Use the highlighted ${GUIDANCE_LABELS[missingSetupAction ?? 'wave-freq-knob']}.`);
          break;
        }
        setPaused(false);
        startStationRun();
        setEquipmentMessage('Vibration generator power switch flipped ON. Taut string oscillating with transverse standing waves.');
        break;
      case 'wave-tension': {
        const tensionSteps = [36, 48, 60, 72, 36];
        const next = stationProgress.currentStep === 2
          ? INITIAL_WAVE.tension
          : stationProgress.currentStep === 4
            ? (stationProgress.trials.length === 1 ? 48 : stationProgress.trials.length === 3 ? 60 : 72)
            : tensionSteps[(tensionSteps.indexOf(wave.tension) + 1) % tensionSteps.length] || 48;
        setWave((current) => ({ ...current, tension: next }));
        invalidateStationRun();
        const progressMessage = markSetupAction();
        setEquipmentMessage(`Slotted mass weights ${stationProgress.currentStep === 2 ? 'verified at baseline (36 N)' : 'adjusted to ' + next.toFixed(0) + ' N'}. Wave speed is ${Math.sqrt(next / wave.density).toFixed(1)} m/s. ${progressMessage}`);
        break;
      }
      case 'wave-slider': {
        setTrialReady((current) => ({ ...current, wave: true }));
        const progressMessage = markSetupAction();
        setEquipmentMessage(`Optical wavelength cursor aligned with wave antinode on metric scale (λ = ${waveResult.wavelength.toFixed(2)} m). Instrument reading locked on clipboard. ${progressMessage}`);
        break;
      }
      case 'wave-frequency': {
        setEquipmentMessage(`Low-friction spoked swivel pulley inspected: maintaining string tension at x = 1.70 m.`);
        break;
      }
      case 'sound-fork':
        setEquipmentMessage(`Tuning fork assembly inspected: calibrated acoustic harmonic emitter coupled to hardwood resonator sounding box.`);
        break;
      case 'sound-fork-dial': {
        const forkSteps = [110, 220, 440, 110];
        const next = stationProgress.currentStep === 2 ? 110 : forkSteps[(forkSteps.indexOf(sound.frequency) + 1) % forkSteps.length] || 220;
        setSound((current) => ({ ...current, frequency: next }));
        invalidateStationRun();
        const progressMessage = markSetupAction();
        setEquipmentMessage(`Tuning collar adjusted. Fork natural frequency set to ${next} Hz. ${progressMessage}`);
        break;
      }
      case 'sound-mallet':
        if (stationProgress.currentStep < 3 || !setupIsComplete) {
          setEquipmentMessage(`The striker mallet is locked until baseline setup is verified. Use the highlighted ${GUIDANCE_LABELS[missingSetupAction ?? 'sound-microphone']}.`);
          break;
        }
        setPaused(false);
        startStationRun();
        setTrialReady((current) => ({ ...current, sound: true }));
        setEquipmentMessage('Tuning fork struck with rubber mallet. Acoustic wavefronts propagating through resonance column.');
        break;
      case 'sound-tube':
        setEquipmentMessage(`Resonance air column inspected: borosilicate glass tube length L = ${sound.length.toFixed(2)} m with graduated metric millimeter scale.`);
        break;
      case 'sound-tube-cap': {
        const next = stationProgress.currentStep === 2 ? 'closed' : (sound.tubeType === 'closed' ? 'open' : 'closed');
        setSound((current) => ({ ...current, tubeType: next, frequency: next === 'open' ? 220 : current.frequency }));
        invalidateStationRun();
        const progressMessage = markSetupAction();
        setEquipmentMessage(`Resonance tube boundary cap ${next === 'closed' ? 'installed (closed–open mode, L = 0.78 m)' : 'opened (open–open mode)'}. ${progressMessage}`);
        break;
      }
      case 'sound-temp-dial': {
        const tempSteps = [20, 25, 30, 35, 20];
        const next = stationProgress.currentStep === 2 ? 20 : tempSteps[(tempSteps.indexOf(sound.temperature) + 1) % tempSteps.length] || 25;
        setSound((current) => ({ ...current, temperature: next }));
        invalidateStationRun();
        const progressMessage = markSetupAction();
        setEquipmentMessage(`Thermostat dial rotated. Air temperature set to ${next} °C. Sound speed increases to ${(331.4 * Math.sqrt(1 + next / 273.15)).toFixed(1)} m/s. ${progressMessage}`);
        break;
      }
      case 'sound-microphone': {
        setTrialReady((current) => ({ ...current, sound: true }));
        const progressMessage = markSetupAction();
        setEquipmentMessage(`Measurement microphone aligned at resonance peak (r = ${sound.distance.toFixed(1)} m, SPL = ${soundResult.decibels.toFixed(1)} dB). Reading locked on clipboard. ${progressMessage}`);
        break;
      }
      case 'electro-q1': {
        const next = stationProgress.currentStep === 2 ? 4 : electro.q1;
        setElectro((current) => ({ ...current, q1: next }));
        invalidateStationRun();
        const progressMessage = markSetupAction();
        setEquipmentMessage(`Conductive sphere 1 mounted on amber standoff collar (q₁ = +${next} μC). ${progressMessage}`);
        break;
      }
      case 'electro-q2':
        setEquipmentMessage(`Conductive spherical electrode 2 inspected on sliding carriage: charge accumulator q₂ = ${electro.q2.toFixed(0)} μC.`);
        break;
      case 'electro-leadscrew': {
        const sepSteps = [0.60, 0.90, 1.20, 0.60];
        const next = stationProgress.currentStep === 2 ? 0.60 : sepSteps[(sepSteps.indexOf(electro.separation) + 1) % sepSteps.length] || 0.90;
        setElectro((current) => ({ ...current, separation: next }));
        invalidateStationRun();
        const progressMessage = markSetupAction();
        setEquipmentMessage(`Micrometer leadscrew dial rotated. Separation set to r = ${next.toFixed(2)} m. ${progressMessage}`);
        break;
      }
      case 'electro-voltage-dial': {
        const chargeSteps = [4, 6, 8, 4];
        const next = stationProgress.currentStep === 2 ? 4 : chargeSteps[(chargeSteps.indexOf(electro.q1) + 1) % chargeSteps.length] || 6;
        setElectro((current) => ({ ...current, q1: next, q2: -6 }));
        invalidateStationRun();
        const progressMessage = markSetupAction();
        setEquipmentMessage(`High-voltage potentiometers calibrated (q₁ = +${next} μC, q₂ = -6 μC). Analog kilovolt meter needles deflect. ${progressMessage}`);
        break;
      }
      case 'electro-power-switch':
        if (stationProgress.currentStep < 3 || !setupIsComplete) {
          setEquipmentMessage(`The master power switch is locked until baseline setup is verified. Use the highlighted ${GUIDANCE_LABELS[missingSetupAction ?? 'electro-q1']}.`);
          break;
        }
        setPaused(false);
        startStationRun();
        setTrialReady((current) => ({ ...current, electro: true }));
        setEquipmentMessage('Master high-voltage power switch thrown ON. Streamline field arcs ignite; mutual Coulomb force vectors active.');
        break;
      case 'electro-rail':
        setEquipmentMessage('Linear optical track inspected: laser-etched metric millimeter scale span 3.20 m with precision dual carriage sleds.');
        break;
      case 'electro-probe': {
        setTrialReady((current) => ({ ...current, electro: true }));
        const progressMessage = markSetupAction();
        setEquipmentMessage(`Midpoint electric field mill sensor sampled live field (E = ${electroResult.fieldMidpoint.toExponential(2)} N/C, F = ${electroResult.force.toFixed(2)} N). Reading locked on clipboard. ${progressMessage}`);
        break;
      }
      case 'lab-whiteboard':
        setNotebookOpen(true);
        setEquipmentMessage('Lecture Whiteboard: Governing equations for wave mechanics, acoustic column resonance, and Coulomb electrostatics.');
        break;
      case 'lab-oscilloscope':
        setEquipmentMessage('Tektronix Digital Storage Oscilloscope: Real-time dual-channel 200 MHz waveform capture of harmonic oscillations.');
        break;
      case 'lab-function-gen':
        setEquipmentMessage('Agilent Synthesized Function Generator: Calibrated 1.000 kHz harmonic sine wave signal source.');
        break;
      case 'lab-dmm':
        setEquipmentMessage('Digital Multimeter: High-accuracy potential measurement reading +12.45 V DC across circuit leads.');
        break;
      case 'lab-glassware':
        setEquipmentMessage('Scientific Glassware: Calibrated borosilicate flasks and beakers with copper sulfate solution.');
        break;
      case 'lab-cabinet-west':
      case 'lab-cabinet-east':
        setEquipmentMessage('Storage Casework: Glazed apparatus cabinet containing calibrated physics metrology instruments.');
        break;
      case 'lab-eyewash':
        setEquipmentMessage('Emergency Eyewash & Safety Shower: ANSI Z358.1 compliant rapid decontamination unit tested and operational.');
        break;
      case 'lab-breaker-panel':
        setEquipmentMessage('Main Electrical Distribution Panel: 208Y/120V 3-phase power bus supplying all laboratory workstations.');
        break;
      case 'lab-fire-station':
        setEquipmentMessage('Fire Safety Station: Class ABC dry chemical extinguisher and UV/impact-resistant PPE goggles.');
        break;
      case 'lab-prep-sink':
        setEquipmentMessage('Apparatus Prep Sink: Deionized water tap and borosilicate drying pegboard station.');
        break;
      case 'lab-window':
        setEquipmentMessage('Daylight Observation Window: Natural exterior daylight overlooking the university science quad.');
        break;
      case 'student-lab-assistant': {
        playEquipmentClick();
        const step = currentProg.currentStep;
        const tips = [
          "Student Lab Assistant: 'Welcome! Look for the pulsing cyan beacon on the bench to find and inspect all 4 apparatus parts.'",
          "Student Lab Assistant: 'Click the theory placard or press [N] to review the theory and submit your prediction to unlock controls.'",
          "Student Lab Assistant: 'Adjust the highlighted controls to the baseline settings, or click \"Load baseline\" in the notebook.'",
          "Student Lab Assistant: 'Flip the power switch or strike the mallet to start the apparatus and let readings stabilize!'",
          `Student Lab Assistant: 'For each trial: 1. Move a slider, 2. Hit Run to stabilize, and 3. Click the clipboard to record! (${currentProg.trials.length}/${TOTAL_TRIALS} recorded)'`,
          "Student Lab Assistant: 'Check the Formula & Constant reference card at the top of the calculation tab for worked examples and constant values!'",
          "Student Lab Assistant: 'Complete your Observation, Conclusion, and Recommendations. Use the template buttons if you need a quick starter!'",
          "Student Lab Assistant: 'Great job! Type your name and section, then click \"Certify station & download PDF\" to get your report!'",
        ];
        setEquipmentMessage(tips[step] ?? tips[0]);
        break;
      }
      case 'physics-professor': {
        playEquipmentClick();
        const step = currentProg.currentStep;
        let profText = '';
        if (step === 0) {
          profText = "Physics Professor: 'Carefully inspect each apparatus component. In experimental physics, equipment geometry and support constraints dictate the boundary conditions.'";
        } else if (step === 1) {
          profText = "Physics Professor: 'Before adjusting controls, commit your prediction. Relate physical principles to your hypothesis on the placard.'";
        } else if (step === 2) {
          profText = "Physics Professor: 'Calibrate the apparatus to baseline. Standard reference conditions allow us to isolate independent variables.'";
        } else if (step === 3) {
          profText = "Physics Professor: 'Energize the apparatus. Observe how mechanical waves transfer energy through the medium, or how electric field lines form between isolated charges.'";
        } else if (step === 4) {
          profText = `Physics Professor: 'Collect 5 distinct parameter variation trials. Systematically vary one control at a time to build a robust dataset for regression. (${currentProg.trials.length}/${TOTAL_TRIALS})'`;
        } else if (step === 5) {
          if (targetStation === 'wave') {
            profText = "Physics Professor: 'Calculate wave speed using v = √(T/μ). Notice how tension increases speed while frequency does not affect wave speed on a uniform string.'";
          } else if (targetStation === 'sound') {
            profText = "Physics Professor: 'Calculate sound speed using v ≈ 332 + 0.6t. Thermodynamic temperature dictates sound speed, independent of tube length.'";
          } else {
            profText = "Physics Professor: 'CRITICAL REMINDER: Coulomb constant k = 8.99 × 10⁹ requires charge in SI Coulombs! Convert microcoulombs (μC) by multiplying by 10⁻⁶ (1 μC = 10⁻⁶ C).' ";
          }
        } else if (step === 6) {
          profText = "Physics Professor: 'Formulate your write-up in 3 parts: state empirical observations across the 5 trials, synthesize your theoretical conclusion, and recommend practical improvements to minimize uncertainties.'";
        } else {
          profText = "Physics Professor: 'Your measurements and theoretical derivations are verified. Certify your data record and download your official laboratory report.'";
        }
        setEquipmentMessage(profText);
        break;
      }
    }
  };
  equipmentActionRef.current = handleEquipmentInteraction;
  if (typeof window !== 'undefined') {
    (window as any).__testInteract = handleEquipmentInteraction;
  }

  const currentObjective = station.steps[stationProgress.currentStep];
  const completedStepCount = stationProgress.completed.filter(Boolean).length;

  let notebookContent: ReactNode;
  if (notebookStep === 0) {
    const isCompleted = stationProgress.completed[0];
    const isSkipped = !isCompleted && Boolean(stationProgress.skipped?.[0]);
    const equipment = stationId === 'wave'
      ? [{ id: 'wave-driver', label: 'Mechanical driver and motor shaft' }, { id: 'wave-string', label: 'Vibrating string with tracer beads' }, { id: 'wave-frequency', label: 'Fixed supports and pulley' }, { id: 'wave-tension', label: 'Hanging tension mass' }]
      : stationId === 'sound'
        ? [{ id: 'sound-fork', label: 'Tuning fork and source driver' }, { id: 'sound-tube', label: 'Transparent resonance air column' }, { id: 'sound-tube', label: 'Open/closed end boundary' }, { id: 'sound-microphone', label: 'Microphone and distance scale' }]
        : [{ id: 'electro-q1', label: 'Positive/negative charge spheres' }, { id: 'electro-rail', label: 'Center-to-center separation rail' }, { id: 'electro-q2', label: 'Force-direction arrows' }, { id: 'electro-probe', label: 'Midpoint electric-field probe' }];
    notebookContent = (
      <div className="notebook-section">
        <span className="section-kicker">PROCESS 1 · 10 POINTS</span>
        <h3>Apparatus inspection checklist</h3>
        <p>{station.steps[0].prompt}</p>
        <ul className="inspection-list">{equipment.map((item, index) => <li key={`${item.id}-${index}`} className={stationProgress.inspected.includes(item.id) ? 'inspected' : ''}><span>{stationProgress.inspected.includes(item.id) ? '✓' : '○'}</span>{item.label}</li>)}</ul>
        <div className="concept-note"><b>Learning target:</b> {station.steps[0].target}</div>
        {isCompleted ? (
          <div className="feedback good">✅ Step 1 Complete (+10 pts) — All apparatus components inspected.</div>
        ) : isSkipped ? (
          <div className="feedback">
            <div>⏭️ Step 1 Skipped (0 pts) — Apparatus inspection was skipped.</div>
            <div className="button-row">
              <button className="btn-choice btn-retry" onClick={() => retryStep(0)}>🔄 Explore Apparatus</button>
            </div>
          </div>
        ) : (
          <div className="button-row">
            <button className="notebook-action" onClick={() => returnToApparatus(`Inspect the highlighted ${GUIDANCE_LABELS[INSPECTION_TARGET[stationId]]} in the 3D room.`)}>Return to highlighted apparatus</button>
            <button className="btn-choice btn-skip" onClick={() => skipStep(0, 1)}>⏭️ Skip Explore (0 pts)</button>
          </div>
        )}
      </div>
    );
  } else if (notebookStep === 1) {
    const isCompleted = stationProgress.completed[1];
    const isSkipped = !isCompleted && Boolean(stationProgress.skipped?.[1]);
    notebookContent = (
      <div className="notebook-section">
        <span className="section-kicker">PROCESS 2 · 10 POINTS</span>
        <h3>Scientific prediction</h3>
        <p>{station.prediction.question}</p>
        <div className="prediction-options">
          {station.prediction.options.map((option, index) => (
            <label key={option} className={predictionSelection === index ? 'selected' : ''}>
              <input type="radio" name="prediction" checked={predictionSelection === index} onChange={() => { setPredictionSelection(index); setPredictionStatus('idle'); setPredictionFeedback(''); }} disabled={isCompleted} />
              <span>{String.fromCharCode(65 + index)}</span>{option}
            </label>
          ))}
        </div>
        {predictionFeedback && (
          <div className={predictionStatus === 'correct' || isCompleted ? 'feedback good' : 'feedback'}>
            {predictionFeedback}
          </div>
        )}
        {isCompleted ? (
          <div className="feedback good">✅ Step 2 Complete (+10 pts) — Scientific hypothesis verified.</div>
        ) : isSkipped ? (
          <div className="feedback">
            <div>⏭️ Step 2 Prediction Skipped (0 pts).</div>
            <div className="button-row">
              <button className="btn-choice btn-retry" onClick={() => retryStep(1)}>🔄 Retry Prediction</button>
            </div>
          </div>
        ) : predictionStatus === 'incorrect' ? (
          <div className="button-row">
            <button className="btn-choice btn-retry" onClick={retryStep1}>🔄 Retry Question</button>
            <button className="btn-choice btn-skip" onClick={() => skipStep(1, 2)}>⏭️ Skip Prediction — 0 pts</button>
          </div>
        ) : (
          <div className="button-row">
            <button className="notebook-action" onClick={submitPrediction} disabled={predictionSelection === null}>Lock In Prediction (+10 pts)</button>
            <button className="btn-choice btn-skip" onClick={() => skipStep(1, 2)}>⏭️ Skip Prediction (0 pts)</button>
          </div>
        )}
      </div>
    );
  } else if (notebookStep === 2) {
    const isCompleted = stationProgress.completed[2];
    const isSkipped = !isCompleted && Boolean(stationProgress.skipped?.[2]);
    notebookContent = (
      <div className="notebook-section">
        <span className="section-kicker">PROCESS 3 · 10 POINTS</span>
        <h3>Reference setup</h3>
        <p>{station.steps[2].prompt}</p>
        <div className="setup-spec">{station.steps[2].target}</div>

        <div className="student-seed-card">
          <div className="seed-header">
            <span className="seed-badge">ACADEMIC WORKSTATION CALIBRATION</span>
            <b>Student Equipment Seeding</b>
          </div>
          <p className="seed-note">To discourage copying while ensuring dimensional validity, your physical apparatus parameters can be uniquely calibrated based on your Student ID.</p>
          <div className="seed-input-row">
            <label>
              <span>Student ID</span>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                placeholder="e.g. PHY-2026-001"
                disabled={isCompleted}
              />
            </label>
            {!isCompleted && (
              <button type="button" className="btn-seed" onClick={applySeededSetup}>
                🎯 Load Seeded Parameters
              </button>
            )}
          </div>
        </div>

        <p className="muted-copy">The setup button loads standard baseline values, or load your unique student-seeded parameters above. Setup credit is earned after you confirm controls on the physical apparatus.</p>
        {isCompleted ? (
          <div className="feedback good">✅ Step 3 Complete (+10 pts) — Baseline configuration verified.</div>
        ) : isSkipped ? (
          <div className="feedback">
            <div>⏭️ Step 3 Setup Skipped (0 pts).</div>
            <div className="button-row">
              <button className="btn-choice btn-retry" onClick={() => retryStep(2)}>🔄 Configure Setup</button>
            </div>
          </div>
        ) : (
          <div className="button-row">
            <button className="notebook-action" onClick={applySetup}>Apply baseline setup</button>
            <button className="btn-choice btn-skip" onClick={() => skipStep(2, 3)}>⏭️ Skip Step 3 Setup (0 pts)</button>
          </div>
        )}
      </div>
    );
  } else if (notebookStep === 3) {
    const isCompleted = stationProgress.completed[3];
    const isSkipped = !isCompleted && Boolean(stationProgress.skipped?.[3]);
    notebookContent = (
      <div className="notebook-section">
        <span className="section-kicker">PROCESS 4 · 15 POINTS</span>
        <h3>Run the physical model</h3>
        <p>{station.steps[3].prompt}</p>
        <div className="live-experiment-box">
          <span className="live-dot" />
          <div><b>LIVE MODEL READY</b><small>{station.steps[3].target}</small></div>
        </div>
        {isCompleted ? (
          <div className="feedback good">✅ Step 4 Complete (+15 pts) — Live simulation operated and verified.</div>
        ) : isSkipped ? (
          <div className="feedback">
            <div>⏭️ Step 4 Run Skipped (0 pts).</div>
            <div className="button-row">
              <button className="btn-choice btn-retry" onClick={() => retryStep(3)}>🔄 Run Simulation</button>
            </div>
          </div>
        ) : (
          <div className="button-row">
            <button className="notebook-action" onClick={runExperiment}>Return to highlighted run control</button>
            <button className="btn-choice btn-skip" onClick={() => skipStep(3, 4)}>⏭️ Skip Step 4 Run (0 pts)</button>
          </div>
        )}
      </div>
    );
  } else if (notebookStep === 4) {
    const isCompleted = stationProgress.completed[4];
    const isSkipped = !isCompleted && Boolean(stationProgress.skipped?.[4]);
    const hasChanged = trialHasChanged();
    const isSettling = runSettling[stationId];
    const isReady = trialReady[stationId];
    const step1Done = hasChanged;
    const step2Done = hasChanged && isReady && !isSettling;
    const step3Active = step2Done;
    notebookContent = (
      <div className="notebook-section wide-section">
        <span className="section-kicker">PROCESS 5 · 15 POINTS</span>
        <h3>Five-trial experimental investigation</h3>
        <p>Systematically adjust apparatus controls between trials. Collect five distinct parameter variation conditions to build a complete scientific dataset.</p>
        
        <div className="measurement-workflow" aria-label="3-step measurement procedure">
          <div className={`workflow-step ${step1Done ? 'done' : 'active'}`}>
            <b>1. ADJUST CONTROLS</b>
            <small>{step1Done ? '✓ Variation set' : 'Vary tension/temp/volt'}</small>
          </div>
          <div className={`workflow-step ${step2Done ? 'done' : step1Done ? 'active' : ''}`}>
            <b>2. RUN INSTRUMENT</b>
            <small>{step2Done ? '✓ Reading stabilized' : isSettling ? 'Stabilizing reading…' : 'Start live apparatus'}</small>
          </div>
          <div className={`workflow-step ${step3Active ? 'active' : ''}`}>
            <b>3. LOG TO CLIPBOARD</b>
            <small>{step3Active ? 'Ready to record' : 'Awaiting stable reading'}</small>
          </div>
        </div>

        <div className="trial-banner">TRIALS RECORDED · {stationProgress.trials.length} / {TOTAL_TRIALS}</div>
        
        <div className="view-toggle-row">
          <button
            type="button"
            className={`view-tab-btn ${step4View === 'table' ? 'active' : ''}`}
            onClick={() => setStep4View('table')}
          >
            📊 Data Record Table ({stationProgress.trials.length}/{TOTAL_TRIALS})
          </button>
          <button
            type="button"
            className={`view-tab-btn ${step4View === 'graph' ? 'active' : ''}`}
            onClick={() => setStep4View('graph')}
          >
            📈 Least-Squares Regression Plot
          </button>
        </div>

        {step4View === 'table' ? (
          <TrialTable stationId={stationId} trials={stationProgress.trials} />
        ) : (
          <LabGraph stationId={stationId} trials={stationProgress.trials} accentColor={station.accent} />
        )}
        {isCompleted ? (
          <div className="feedback good">✅ Step 5 Complete (+15 pts) — All {TOTAL_TRIALS} multi-trial conditions recorded.</div>
        ) : isSkipped ? (
          <div className="feedback">
            <div>⏭️ Step 5 Measurement Skipped (0 pts). Reference baseline dataset loaded for calculations.</div>
            <div className="button-row">
              <button className="btn-choice btn-retry" onClick={() => retryStep(4)}>🔄 Record Live Trials</button>
            </div>
          </div>
        ) : (
          <div className="button-row">
            {step3Active && (
              <button className="notebook-action" style={{ background: '#059669', borderColor: '#10b981' }} onClick={recordTrial}>
                ⚡ Record Trial {stationProgress.trials.length + 1} to Clipboard Now
              </button>
            )}
            <button className="notebook-action" onClick={() => returnToApparatus(`Use the highlighted ${GUIDANCE_LABELS[`${stationId}-clipboard`]} to record the live reading.`)} disabled={stationProgress.trials.length >= TOTAL_TRIALS}>
              Return to 3D apparatus clipboard
            </button>
            <button className="btn-choice btn-skip" onClick={() => { fillReferenceFallbackTrials(); skipStep(4, 5); }}>
              ⏭️ Skip Remaining Trials (0 pts)
            </button>
          </div>
        )}
      </div>
    );
  } else if (notebookStep === 5) {
    const isCompleted = stationProgress.completed[5];
    const isSkipped = !isCompleted && Boolean(stationProgress.skipped?.[5]);
    const formula = stationId === 'wave' ? 'v = √(T/μ)' : stationId === 'sound' ? 'v ≈ 332 + 0.6t' : 'F = k|q₁q₂|/r²';
    notebookContent = (
      <div className="notebook-section">
        <span className="section-kicker">PROCESS 6 · 20 POINTS</span>
        <h3>Theoretical calculation verification</h3>
        <p>Use each frozen trial condition and calculate the requested theoretical quantity. All five answers must verify within ±2% relative error.</p>
        
        <div className="formula-hint-card">
          <div className="formula-hint-header">
            <span className="formula-badge">GOVERNING FORMULA & CONSTANTS</span>
            <b>{station.title}</b>
          </div>
          <div className="formula-large">{formula}</div>
          {stationId === 'wave' && (
            <div className="formula-explanation">
              <p><strong>Variables:</strong> Tension T in Newtons (N), Linear density μ in kg/m. Wave speed v is in m/s.</p>
              <div className="formula-example"><strong>Trial 1 Worked Example:</strong> For T = 36 N and μ = 0.040 kg/m: v = √(36 / 0.040) = √900 = 30.0 m/s.</div>
            </div>
          )}
          {stationId === 'sound' && (
            <div className="formula-explanation">
              <p><strong>Variables:</strong> Air temperature t in °C. Sound speed v is in m/s.</p>
              <div className="formula-example"><strong>Trial 1 Worked Example:</strong> For t = 20 °C: v ≈ 332 + (0.6 × 20) = 332 + 12 = 344.0 m/s. (Tube length L establishes resonant standing waves, but sound speed depends on temperature).</div>
            </div>
          )}
          {stationId === 'electro' && (
            <div className="formula-explanation">
              <p><strong>Coulomb&apos;s Constant:</strong> k = 8.99 × 10⁹ N·m²/C².</p>
              <div className="formula-warning"><strong>⚠️ Microcoulomb SI Conversion:</strong> Charges are in μC (1 μC = 10⁻⁶ C). You MUST convert charges to Coulombs by multiplying by 10⁻⁶ before squaring or calculating!</div>
              <div className="formula-example"><strong>Trial 1 Worked Example:</strong> For q₁ = 4 μC = 4 × 10⁻⁶ C, q₂ = -6 μC = 6 × 10⁻⁶ C, r = 0.60 m:<br />
              F = (8.99 × 10⁹ × 4 × 10⁻⁶ × 6 × 10⁻⁶) / 0.60² = 0.21576 / 0.36 = 0.60 N.</div>
            </div>
          )}
        </div>

        {stationProgress.trials.length < TOTAL_TRIALS ? (
          <div className="feedback">
            <strong>⚠️ INCOMPLETE EXPERIMENTAL DATASET</strong><br />
            You have recorded {stationProgress.trials.length} of {TOTAL_TRIALS} experimental trials. Complete all trials before submitting calculations.
            <div className="button-row">
              <button className="btn-choice btn-retry" onClick={() => setNotebookStep(4)}>🔄 Return to Measurement</button>
              <button className="btn-choice btn-skip" onClick={() => skipStep(5, 6)}>⏭️ Skip Calculation — 0 pts</button>
            </div>
          </div>
        ) : (
          <>
            <div className="calculation-trials">
              {stationProgress.trials.map((trial, index) => (
                <label className="calculation-entry" key={index}>
                  <span>Trial {index + 1} · {stationId === 'electro' ? 'Coulomb force' : stationId === 'sound' ? 'Sound speed' : 'String wave speed'}</span>
                  <small>{stationId === 'wave' ? `T=${formatTrialValue(trial.tension)} N · μ=${formatTrialValue(trial.density)} kg/m` : stationId === 'sound' ? `t=${formatTrialValue(trial.temperature)} °C · L=${formatTrialValue(trial.length)} m` : `q₁=${formatTrialValue(trial.q1)} μC · q₂=${formatTrialValue(trial.q2)} μC · r=${formatTrialValue(trial.separation)} m`}</small>
                  <div className="calculation-input-wrapper">
                    <input type="number" inputMode="decimal" value={stationProgress.calculations[index] ?? ''} onChange={(event) => { updateCalculation(index, event.target.value); setCalculationStatus('idle'); setCalculationFeedback(''); }} placeholder={`Enter Trial ${index + 1} calculated answer`} disabled={isCompleted} />
                    <span className="calculation-unit-tag">{calculationUnit}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="view-toggle-row">
              <button
                type="button"
                className={`view-tab-btn ${step4View === 'graph' ? 'active' : ''}`}
                onClick={() => setStep4View((v) => (v === 'graph' ? 'table' : 'graph'))}
              >
                📈 {step4View === 'graph' ? 'Hide Regression & Physical Slope' : 'Inspect Regression Plot & Physical Slope'}
              </button>
            </div>
            {step4View === 'graph' && (
              <LabGraph stationId={stationId} trials={stationProgress.trials} accentColor={station.accent} />
            )}
            {calculationFeedback && <div className={calculationStatus === 'correct' || isCompleted ? 'feedback good' : 'feedback'}>{calculationFeedback}</div>}
            {isCompleted ? (
              <div className="feedback good">✅ Step 6 Complete (+20 pts) — All {TOTAL_TRIALS} trial calculations verified within ±2%.</div>
            ) : isSkipped ? (
              <div className="feedback">
                <div>⏭️ Step 6 Calculation Skipped (0 pts).</div>
                <div className="button-row">
                  <button className="btn-choice btn-retry" onClick={() => retryStep(5)}>🔄 Retry Calculations</button>
                </div>
              </div>
            ) : calculationStatus === 'incorrect' ? (
              <div className="button-row">
                <button className="btn-choice btn-retry" onClick={retryStep5}>🔄 Retry Calculations</button>
                <button className="btn-choice btn-skip" onClick={() => skipStep(5, 6)}>⏭️ Skip Calculation — 0 pts</button>
              </div>
            ) : (
              <div className="button-row">
                <button className="notebook-action" onClick={submitCalculation} disabled={stationProgress.calculations.some((entry) => !entry)}>Verify all five calculations (+20 pts)</button>
                <button className="btn-choice btn-skip" onClick={() => skipStep(5, 6)}>⏭️ Skip Calculation — 0 pts</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  } else if (notebookStep === 6) {
    const isCompleted = stationProgress.completed[6];
    const isSkipped = !isCompleted && Boolean(stationProgress.skipped?.[6]);
    notebookContent = (
      <div className="notebook-section wide-section">
        <span className="section-kicker">PROCESS 7 · 10 POINTS</span>
        <h3>Scientific synthesis & analysis</h3>
        <p>Synthesize empirical findings across all five trials. Complete your observations, conclusion, and apparatus recommendations, then select identified uncertainties.</p>
        <TrialTrend trials={stationProgress.trials} stationId={stationId} />
        
        <div className="analysis-sections">
          {/* 1. Observation Section */}
          <div className="analysis-card">
            <div className="card-header-row">
              <h4>1. Scientific Observations & Multi-Trial Trends</h4>
              {!isCompleted && <button type="button" className="template-btn" onClick={insertObservationTemplate}>📝 Insert Observation Template</button>}
            </div>
            <p>Describe quantitative patterns across all 5 trials. Compare at least two distinct conditions and cite specific numbers.</p>
            <textarea value={stationProgress.analysis} onChange={(event) => { updateAnalysis(event.target.value); setAnalysisStatus('idle'); setAnalysisFeedback(''); }} placeholder="Across Trials 1 to 5, increasing... from ... to ... caused the measured ... to change from ... to ... because..." disabled={isCompleted} />
            <div className="validation-badge-group">
              <span className={`validation-pill ${stationProgress.analysis.trim().length >= 45 ? 'valid' : ''}`}>{stationProgress.analysis.trim().length >= 45 ? '✓' : '○'} Length: {stationProgress.analysis.trim().length}/45 chars</span>
              <span className={`validation-pill ${analysisMentionsTrial ? 'valid' : ''}`}>{analysisMentionsTrial ? '✓' : '○'} Cites Trials</span>
              <span className={`validation-pill ${analysisMentionsVariable ? 'valid' : ''}`}>{analysisMentionsVariable ? '✓' : '○'} Cites Physics Variables</span>
            </div>
          </div>

          {/* 2. Conclusion Section */}
          <div className="analysis-card">
            <div className="card-header-row">
              <h4>2. Scientific Conclusion & Physical Law Deduction</h4>
              {!isCompleted && <button type="button" className="template-btn" onClick={insertConclusionTemplate}>🎓 Insert Conclusion Template</button>}
            </div>
            <p>State your theoretical deduction. How do the 5-trial measurements verify the governing physical laws?</p>
            <textarea value={stationProgress.conclusion || ''} onChange={(event) => { updateConclusion(event.target.value); setAnalysisStatus('idle'); setAnalysisFeedback(''); }} placeholder="The empirical measurements confirm the governing physical law because..." disabled={isCompleted} />
            <div className="validation-badge-group">
              <span className={`validation-pill ${(stationProgress.conclusion || '').trim().length >= 35 ? 'valid' : ''}`}>{(stationProgress.conclusion || '').trim().length >= 35 ? '✓' : '○'} Length: {(stationProgress.conclusion || '').trim().length}/35 chars</span>
            </div>
          </div>

          {/* 3. Recommendations Section */}
          <div className="analysis-card">
            <div className="card-header-row">
              <h4>3. Practical Recommendations & Apparatus Improvements</h4>
              {!isCompleted && <button type="button" className="template-btn" onClick={insertRecommendationTemplate}>💡 Insert Recommendation Template</button>}
            </div>
            <p>Propose actionable recommendations to minimize systematic measurement errors and apparatus uncertainties in future trials.</p>
            <textarea value={stationProgress.recommendations || ''} onChange={(event) => { updateRecommendations(event.target.value); setAnalysisStatus('idle'); setAnalysisFeedback(''); }} placeholder="To reduce experimental uncertainty in future trials, recommend..." disabled={isCompleted} />
            <div className="validation-badge-group">
              <span className={`validation-pill ${(stationProgress.recommendations || '').trim().length >= 35 ? 'valid' : ''}`}>{(stationProgress.recommendations || '').trim().length >= 35 ? '✓' : '○'} Length: {(stationProgress.recommendations || '').trim().length}/35 chars</span>
            </div>
          </div>

          {/* 4. Formative Assessment: Conceptual Guide Questions */}
          <div className="analysis-card">
            <div className="card-header-row">
              <h4>4. Conceptual Guide Questions & Error Analysis</h4>
              <span className="formula-badge">3 QUESTIONS · FORMATIVE ASSESSMENT</span>
            </div>
            <p>Answer all 3 conceptual questions to demonstrate quantitative mastery of the physical model and error propagation.</p>
            <div className="guide-questions-container">
              {STATION_GUIDE_QUESTIONS[stationId].map((q, qIndex) => {
                const selectedAnswer = stationProgress.guideAnswers?.[qIndex] ?? -1;
                const isAnswered = selectedAnswer !== -1;
                const isCorrect = selectedAnswer === q.correctIndex;
                return (
                  <div key={q.id} className={`guide-question-card ${isCorrect ? 'answered-correct' : ''}`}>
                    <div className="guide-question-header">
                      <span className="guide-q-tag">QUESTION {qIndex + 1} OF 3</span>
                      {isAnswered && (
                        <span className={`validation-pill ${isCorrect ? 'valid' : ''}`}>
                          {isCorrect ? '✓ CORRECT' : '○ INCORRECT'}
                        </span>
                      )}
                    </div>
                    <p className="guide-question-title">{q.question}</p>
                    <div className="guide-options">
                      {q.options.map((opt, optIndex) => (
                        <label
                          key={optIndex}
                          className={`guide-option-label ${selectedAnswer === optIndex ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={`guide-q-${stationId}-${qIndex}`}
                            checked={selectedAnswer === optIndex}
                            onChange={() => {
                              const next = [...(stationProgress.guideAnswers ?? [-1, -1, -1])];
                              next[qIndex] = optIndex;
                              setProgress((current) => ({
                                ...current,
                                [stationId]: { ...current[stationId], guideAnswers: next },
                              }));
                              setAnalysisStatus('idle');
                              setAnalysisFeedback('');
                            }}
                            disabled={isCompleted}
                          />
                          <span>{String.fromCharCode(65 + optIndex)}. {opt}</span>
                        </label>
                      ))}
                    </div>
                    {isAnswered && (
                      <div className={`guide-feedback ${isCorrect ? 'good' : 'bad'}`}>
                        {isCorrect ? `✅ ${q.explanation}` : '❌ Incorrect. Re-examine the physical principles and choose again.'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <fieldset className="error-list">
          <legend>Select at least one realistic source of uncertainty</legend>
          {station.errors.map((error) => (
            <label key={error}>
              <input type="checkbox" checked={stationProgress.errors.includes(error)} onChange={() => { toggleError(error); setAnalysisStatus('idle'); setAnalysisFeedback(''); }} disabled={isCompleted} />
              {error}
            </label>
          ))}
        </fieldset>

        {analysisFeedback && <div className={analysisStatus === 'correct' || isCompleted ? 'feedback good' : 'feedback'}>{analysisFeedback}</div>}
        {isCompleted ? (
          <div className="feedback good">✅ Step 7 Complete (+10 pts) — Scientific observation, conclusion, recommendations, and uncertainties verified.</div>
        ) : isSkipped ? (
          <div className="feedback">
            <div>⏭️ Step 7 Analysis Skipped (0 pts).</div>
            <div className="button-row">
              <button className="btn-choice btn-retry" onClick={() => retryStep(6)}>🔄 Retry Analysis</button>
            </div>
          </div>
        ) : analysisStatus === 'incorrect' ? (
          <div className="button-row">
            <button className="btn-choice btn-retry" onClick={retryStep6}>🔄 Retry Analysis</button>
            <button className="btn-choice btn-skip" onClick={() => skipStep(6, 7)}>⏭️ Skip Analysis — 0 pts</button>
          </div>
        ) : (
          <div className="button-row">
            <button className="notebook-action" onClick={submitAnalysis} disabled={!analysisHasEvidence || stationProgress.errors.length === 0}>Submit complete scientific synthesis (+10 pts)</button>
            <button className="btn-choice btn-skip" onClick={() => skipStep(6, 7)}>⏭️ Skip Analysis — 0 pts</button>
          </div>
        )}
      </div>
    );
  } else {
    const isCompleted = stationProgress.completed[7];
    const steps0To6Resolved = Array.from({ length: 7 }, (_, i) => stationProgress.completed[i] || stationProgress.skipped?.[i]).every(Boolean);
    const completedCount = stationProgress.completed.filter(Boolean).length;
    const skippedCount = stationProgress.skipped?.filter(Boolean).length || 0;
    notebookContent = (
      <div className="notebook-section wide-section">
        <span className="section-kicker">PROCESS 8 · 10 POINTS</span>
        <h3>Formal station report</h3>
        <p>Review the submission summary, identify the student, and download a university-formatted PDF certificate.</p>
        <div className="student-grid">
          <label><span>Student name</span><input value={studentName} onChange={(event) => setStudentName(event.target.value)} /></label>
          <label><span>Student ID</span><input value={studentId} onChange={(event) => setStudentId(event.target.value.toUpperCase())} /></label>
          <label><span>Section</span><input value={studentSection} onChange={(event) => setStudentSection(event.target.value)} /></label>
        </div>
        <div className="report-summary">
          <div><span>Completed / Skipped</span><b>{completedCount} Done / {skippedCount} Skipped</b></div>
          <div><span>Analysis & Questions</span><b>{stationProgress.completed[6] ? 'Verified (3/3 Passed)' : stationProgress.skipped?.[6] ? 'Skipped (0 pts)' : 'Incomplete'}</b></div>
          <div><span>Total Station Score</span><b>{score} / 100</b></div>
          <div><span>Source</span><b>{station.sourceLesson}</b></div>
        </div>
        <div className="button-row">
          <button className="notebook-action" onClick={downloadReport} disabled={!studentName.trim() || !studentSection.trim() || !steps0To6Resolved}>
            {isCompleted ? 'Download PDF again' : 'Certify station & download PDF (+10 pts)'}
          </button>
          <button type="button" className="btn-export-csv" onClick={downloadCSV} disabled={!stationProgress.trials.length}>
            📥 Export CSV Dataset
          </button>
          {!steps0To6Resolved && (
            <button className="btn-choice btn-skip" onClick={skipAllRemainingStepsAndSubmit}>
              ⏭️ Skip Remaining Steps & Submit Lab (0 pts)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="lab-shell" style={{ '--station-accent': station.accent } as CSSProperties}>
      <div ref={sceneContainer} className="scene" aria-label={`Interactive 3D ${station.shortName} laboratory`} />
      <div className="vignette" aria-hidden="true" />
      {!assetsReady && !sceneError && <div className="lab-loading-gate" role="status" aria-live="polite"><div><b>PREPARING ROOM 02</b><p>Loading laboratory surfaces and safety equipment… {assetProgress.loaded}/{assetProgress.total}</p><span><i style={{ width: `${Math.min(100, (assetProgress.loaded / Math.max(1, assetProgress.total)) * 100)}%` }} /></span></div></div>}
      <div className="portrait-warning" role="status"><b>ROTATE DEVICE FOR THE FULL LAB</b><span>Landscape view keeps the apparatus, notebook, and controls visible.</span></div>
      {!notebookOpen && (
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
      {!pointerLocked && !notebookOpen && (
        <button className="enter-walk-mode" onClick={() => sceneApi.current?.requestPointerLock()}>
          <b>ENTER WALK MODE</b><span>Click to capture the mouse · ESC releases it</span>
        </button>
      )}
      {interaction && !notebookOpen && (
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

      <header className="topbar">
        {/* Local anchors are intentional here: the 3D client shell is also served by the static room route. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          className="brand-lockup"
          href="/"
          aria-label="Return to Physics University campus"
          onClick={(e) => {
            e.preventDefault();
            sceneApi.current?.openDoor(() => window.location.assign('/'));
          }}
        >
          <span className="brand-mark">λ</span>
          <div><strong>Wave & Electrostatics Lab</strong><span>Physics University · Room 02</span></div>
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          className="room-link"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            sceneApi.current?.openDoor(() => window.location.assign('/'));
          }}
        >
          <span>LABORATORY HALL</span>Room directory
        </a>
        <nav className="station-nav" aria-label="Laboratory stations">
          {(Object.keys(STATIONS) as StationId[]).map((id) => {
            const item = STATIONS[id];
            const itemScore = stationScore(progress[id]);
            const unlocked = isStationUnlocked(id);
            return (
              <button key={id} disabled={!unlocked} title={unlocked ? `Open ${item.shortName}` : 'Complete the previous station to unlock'} className={`station-chip ${id === stationId ? 'active' : ''} ${progress[id].completed[7] ? 'complete' : ''}`} onClick={() => selectStation(id)}>
                <img className="station-chip-image" src={STATION_ASSETS[id].src} alt="" aria-hidden="true" />
                <span className="station-chip-number">{!unlocked ? '🔒' : progress[id].completed[7] ? '✓' : item.number}</span>
                <div>{item.shortName}<small>{!unlocked ? 'Locked' : `${itemScore}/100`}</small></div>
              </button>
            );
          })}
        </nav>
      </header>

      <section className="objective-panel" aria-labelledby="objective-title">
        <div className="eyebrow"><span className="live-dot" /> STATION {station.number} · STEP {stationProgress.currentStep + 1}/8 · {STEP_NAMES[stationProgress.currentStep].toUpperCase()}</div>
        <h1 id="objective-title">{currentObjective.title}</h1>
        <p>{currentObjective.prompt}</p>
        <figure className="station-asset">
          <img src={STATION_ASSETS[stationId].src} alt={STATION_ASSETS[stationId].alt} />
          <figcaption><span>VISUAL REFERENCE</span><b>{station.subtitle}</b></figcaption>
        </figure>
        <button className="prompt-line" onClick={() => openNotebook()}><span>↳</span><b>Open notebook:</b> {currentObjective.target}</button>
        {guidanceTarget && <div className="guidance-line"><span>↓</span><div><b>IN-WORLD GUIDE ACTIVE</b><small>Follow the pulsing marker to the {GUIDANCE_LABELS[guidanceTarget]}.</small></div></div>}
        <div className="progress-track"><span style={{ width: `${(completedStepCount / 8) * 100}%` }} /></div>
      </section>

      <aside className="control-panel" aria-label={`${station.shortName} live controls`}>
        <div className="panel-heading">
          <div><span>{station.subtitle.toUpperCase()}</span><h2>Live controls</h2></div>
          <button className="icon-button" onClick={() => sceneApi.current?.resetView()} aria-label="Reset camera view">⌖</button>
        </div>

        {stationId === 'wave' && <>
          <RangeControl label="Amplitude" value={wave.amplitude} unit="m" min={0.1} max={0.55} step={0.01} digits={2} onChange={(value) => changeWave((current) => ({ ...current, amplitude: value }))} />
          <RangeControl label="Frequency" value={wave.frequency} unit="Hz" min={0.5} max={5} step={0.1} onChange={(value) => changeWave((current) => ({ ...current, frequency: value }))} />
          <RangeControl label="Tension" value={wave.tension} unit="N" min={12} max={72} step={2} digits={0} onChange={(value) => changeWave((current) => ({ ...current, tension: value }))} />
          <RangeControl label="Linear density" value={wave.density} unit="kg/m" min={0.015} max={0.08} step={0.005} digits={3} onChange={(value) => changeWave((current) => ({ ...current, density: value }))} />
          <div className="formula-readout"><span>v = √(T / μ)</span><strong>{waveResult.speed.toFixed(1)} m/s</strong><dl><Metric label="Wavelength" value={`${waveResult.wavelength.toFixed(2)} m`} /><Metric label="Period" value={`${waveResult.period.toFixed(3)} s`} /><Metric label="Angular frequency" value={`${waveResult.angularFrequency.toFixed(2)} rad/s`} /><Metric label="Wave number" value={`${waveResult.waveNumber.toFixed(3)} rad/m`} /></dl></div>
        </>}

        {stationId === 'sound' && <>
          <div className="segment-control" role="group" aria-label="Tube type">
            <button className={sound.tubeType === 'closed' ? 'active' : ''} onClick={() => changeSound((current) => ({ ...current, tubeType: 'closed' }))}>Closed–open</button>
            <button className={sound.tubeType === 'open' ? 'active' : ''} onClick={() => changeSound((current) => ({ ...current, tubeType: 'open' }))}>Open–open</button>
          </div>
          <RangeControl label="Source frequency" value={sound.frequency} unit="Hz" min={60} max={1200} step={5} digits={0} onChange={(value) => changeSound((current) => ({ ...current, frequency: value }))} />
          <RangeControl label="Air temperature" value={sound.temperature} unit="°C" min={-5} max={40} step={1} digits={0} onChange={(value) => changeSound((current) => ({ ...current, temperature: value }))} />
          <RangeControl label="Tube length" value={sound.length} unit="m" min={0.4} max={1.4} step={0.02} digits={2} onChange={(value) => changeSound((current) => ({ ...current, length: value }))} />
          <RangeControl label="Observer distance" value={sound.distance} unit="m" min={0.5} max={6} step={0.1} onChange={(value) => changeSound((current) => ({ ...current, distance: value }))} />
          {Math.abs(soundResult.detuning) <= 6 && (
            <div className="resonance-indicator">
              <span>🔔</span>
              <b>ACOUSTIC RESONANCE PEAK (Harmonic n = {soundResult.harmonic}, fᵣ = {soundResult.resonanceFrequency.toFixed(1)} Hz)</b>
            </div>
          )}
          <div className="formula-readout"><span>v ≈ 332 + 0.6t</span><strong>{soundResult.speed.toFixed(1)} m/s</strong><dl><Metric label="Fundamental" value={`${soundResult.fundamental.toFixed(1)} Hz`} /><Metric label={`Harmonic n = ${soundResult.harmonic}`} value={`${soundResult.resonanceFrequency.toFixed(1)} Hz`} /><Metric label="Sound level" value={`${soundResult.decibels.toFixed(1)} dB`} /><Metric label="Detuning" value={`${soundResult.detuning.toFixed(1)} Hz`} /><Metric label="Source power" value="0.010 W (fixed)" /></dl></div>
          <button className="secondary-button" onClick={playTone} disabled={!stationProgress.completed[3]}>♪ Preview stabilized tone</button>
        </>}

        {stationId === 'electro' && <>
          <RangeControl label="Charge q₁" value={electro.q1} unit="μC" min={-8} max={8} step={1} digits={0} onChange={(value) => changeElectro((current) => ({ ...current, q1: value }))} />
          <RangeControl label="Charge q₂" value={electro.q2} unit="μC" min={-8} max={8} step={1} digits={0} onChange={(value) => changeElectro((current) => ({ ...current, q2: value }))} />
          <RangeControl label="Separation r" value={electro.separation} unit="m" min={0.2} max={1.5} step={0.05} digits={2} onChange={(value) => changeElectro((current) => ({ ...current, separation: value }))} />
          <div className="formula-readout"><span>F = k|q₁q₂| / r²</span><strong>{formatTrialValue(electroResult.force)} N</strong><dl><Metric label="Interaction" value={electroResult.relationship} /><Metric label="Midpoint field" value={`${electroResult.fieldMidpoint.toExponential(2)} N/C`} /><Metric label="Midpoint potential" value={`${electroResult.potentialMidpoint.toExponential(2)} V`} /><Metric label="Potential energy" value={`${electroResult.potentialEnergy.toExponential(2)} J`} /></dl></div>
        </>}

        <div className="control-actions">
          <button className="primary-button" onClick={() => setPaused((current) => !current)} disabled={stationProgress.currentStep < 4 || runSettling[stationId]}>{paused ? '▶ Resume animation' : 'Ⅱ Freeze animation'}</button>
          {stationProgress.currentStep === 4 && <button className="record-button" onClick={() => returnToApparatus(`Use the highlighted ${GUIDANCE_LABELS[`${stationId}-clipboard`]} to record trial ${Math.min(TOTAL_TRIALS, stationProgress.trials.length + 1)}.`)} disabled={stationProgress.trials.length >= TOTAL_TRIALS}>◎ Guide me to trial {Math.min(TOTAL_TRIALS, stationProgress.trials.length + 1)}/{TOTAL_TRIALS}</button>}
        </div>
      </aside>

      <div className="status-dock">
        <span className={sceneReady && assetsReady ? 'status-ready' : 'status-waiting'}>{sceneError ? '× 3D UNAVAILABLE' : sceneReady && assetsReady ? '● 3D LAB ONLINE' : '○ PREPARING 3D LAB'}</span>
        <span>{pointerLocked ? 'WASD walk · Mouse look · E interact · ESC release' : 'Click the 3D view to enter · Keys 1–3 teleport · E interact'}</span>
        <span className="score-pill">{totalScore} / 300 pts</span>
        <div className="audio-control"><button onClick={() => setSoundEnabled((current) => !current)} aria-label={soundEnabled ? 'Mute laboratory sounds' : 'Enable laboratory sounds'}>{soundEnabled ? '♫' : '×'} Sound</button><input aria-label="Sound volume" type="range" min="0" max="1" step="0.05" value={soundVolume} onChange={(event) => setSoundVolume(Number(event.target.value))} /></div>
        <button onClick={() => openNotebook()}>▣ Notebook</button>
      </div>

      {!notebookOpen && <div className="mobile-lab-controls" aria-label="Touch laboratory controls">
        <div className="mobile-joystick" role="group" aria-label="Analog walking joystick" onPointerDown={startJoystick} onPointerMove={moveJoystick} onPointerUp={releaseJoystick} onPointerCancel={releaseJoystick}>
          <span className="mobile-joystick-rings" aria-hidden="true" />
          <span className="mobile-joystick-knob" aria-hidden="true" style={{ transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)` }} />
          <small aria-hidden="true">WALK</small>
        </div>
        <button className={`mobile-equipment-action ${interaction ? 'ready' : ''}`} onClick={() => sceneApi.current?.interact()} disabled={!interaction}>{interaction ? 'INTERACT' : 'LOOK AT EQUIPMENT'}</button>
      </div>}

      {notebookOpen && (
        <div className="notebook-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNotebookOpen(false); }}>
          <section className="notebook-modal" role="dialog" aria-modal="true" aria-labelledby="notebook-title">
            <header className="notebook-header">
              <div><span>LABORATORY NOTEBOOK</span><h2 id="notebook-title">{station.title}</h2></div>
              <div className="notebook-score"><span>Station score</span><b>{score} / 100</b></div>
              <button className="close-button" onClick={() => setNotebookOpen(false)} aria-label="Close notebook">×</button>
            </header>
            <div className="student-strip">
              <span>{station.objective}</span>
              <b>{station.sourceLesson}</b>
            </div>
            <div className="notebook-body">
              <nav className="step-rail" aria-label="Notebook process steps">
                {STEP_NAMES.map((name, index) => {
                  const isCompleted = stationProgress.completed[index];
                  const isSkipped = !isCompleted && Boolean(stationProgress.skipped?.[index]);
                  const isLocked = index > stationProgress.currentStep && !isCompleted && !isSkipped;
                  return (
                    <button
                      key={name}
                      disabled={isLocked}
                      className={`${index === notebookStep ? 'active' : ''} ${isCompleted ? 'complete' : isSkipped ? 'skipped' : ''}`}
                      onClick={() => setNotebookStep(index)}
                    >
                      <span>{isCompleted ? '✓' : isSkipped ? '⏭️' : index + 1}</span>
                      <div>
                        <b>{name}</b>
                        <small>{isCompleted ? `${STEP_POINTS[index]} pts` : isSkipped ? '0 pts' : `${STEP_POINTS[index]} pts`}</small>
                      </div>
                    </button>
                  );
                })}
              </nav>
              <div className="notebook-content">{notebookContent}</div>
            </div>
            <footer className="notebook-footer">
              <span>{completedStations} / 3 stations complete · Total {totalScore} / 300</span>
              <button onClick={resetProgress}>Reset all progress</button>
            </footer>
          </section>
        </div>
      )}

      {completedStations === 3 && <div className="completion-toast"><b>Laboratory complete</b><span>All three stations are finished · {totalScore} / 300 points</span></div>}
    </main>
  );
}

function TrialTable({ stationId, trials }: { stationId: StationId; trials: TrialRecord[] }) {
  const columns = TRIAL_COLUMNS[stationId];
  if (!trials.length) return <div className="empty-table">No trials recorded yet. Close the notebook, vary a live control, then return to record the trial.</div>;

  const numericStats: Record<string, { mean: number; sem: number; stdDev: number }> = {};
  columns.forEach((col) => {
    if (col.key !== 'trial' && col.key !== 'tube' && col.key !== 'relationship') {
      const vals = trials.map((t) => Number(t[col.key])).filter((v) => Number.isFinite(v));
      if (vals.length > 0) {
        numericStats[col.key] = calculateTrialStats(vals);
      }
    }
  });

  return (
    <div className="table-scroll">
      <table className="trial-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {trials.map((trial, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column.key}>{formatTrialValue(trial[column.key] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {trials.length >= 2 && (
          <tfoot>
            <tr className="stats-row">
              {columns.map((column) => {
                if (column.key === 'trial') {
                  return (
                    <td key={column.key} className="stats-label">
                      <strong>MEAN (x̄)</strong>
                    </td>
                  );
                }
                const stat = numericStats[column.key];
                if (!stat) return <td key={column.key}>—</td>;
                return (
                  <td
                    key={column.key}
                    className="stats-cell"
                    title={`Standard deviation s = ${stat.stdDev.toFixed(3)}, SEM = ${stat.sem.toFixed(3)}`}
                  >
                    <strong>{formatTrialValue(stat.mean)}</strong>
                    <small className="sem-subscript"> ± {formatTrialValue(stat.sem)}</small>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function TrialTrend({ stationId, trials }: { stationId: StationId; trials: TrialRecord[] }) {
  if (!trials.length) return null;
  const title = stationId === 'wave' ? 'Measured wave speed vs. theory' : stationId === 'sound' ? 'Measured sound speed vs. theory' : 'Measured force vs. theory';
  return <div className="trial-trend" aria-label={title}>
    <div className="trial-trend-heading"><b>{title}</b><small>sensor error (%)</small></div>
    <div className="trial-bars">{trials.map((trial, index) => {
      const error = Math.abs(Number(trial.percentError ?? 0));
      return <div className="trial-bar" key={index}><span>T{index + 1}</span><i style={{ height: `${Math.min(100, Math.max(8, error * 18))}%` }} /><small>{error.toFixed(2)}%</small></div>;
    })}</div>
    <div className="trial-legend"><span><i /> measured deviation</span><span>theory baseline = 0%</span></div>
  </div>;
}
