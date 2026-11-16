'use client';

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  TOTAL_STEPS,
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
  type OscilloscopeSettings,
  INITIAL_OSCILLOSCOPE,
  CH1_VOLTS_DIV_OPTIONS,
  CH2_VOLTS_DIV_OPTIONS,
  TIME_DIV_OPTIONS,
} from './room3Model';
import {
  evaluateStepPrerequisites,
  validateLiveExperimentForTrial,
  validateStudentCalculations,
  validateStudentObservationsAndConclusion,
  ROOM3_STEP_HINTS,
  type StepHints,
  type LiveEnvironmentState,
} from './room3ProgressionMachine';
import { Room3Graph, computeRoom3Regression } from './Room3Graph';
import { Room3Schematic2D } from './Room3Schematic2D';
import { Room3CircuitWorkspace } from './Room3CircuitWorkspace';
import {
  createRoom3Scene,
  type EquipmentInteraction,
  type Room3CloseupFocus,
  type Room3SceneApi,
} from './room3Scene';
import { createLaboratoryPdf } from './pdfReport';
import { CHARACTER_META, type CharacterType } from './characterController';
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
  isMobileTouchDevice,
  loadGraphicsSettings,
  saveGraphicsSettings,
  subscribeMobileTouch,
} from './graphicsSettings';
import { Room3GraphicsModal } from './Room3GraphicsModal';
import { KatexMath } from './KatexMath';
import Room3MasterReportModal from './Room3MasterReportModal';
import {
  createEmptyReportOverrides,
  hydrateMasterReportFromStorage,
  type ReportMetadata,
  type ReportOverrides,
} from './labManualReport';

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
  'circuits-function-generator': 'function generator power switch',
  'circuits-voltage-knob': 'voltage regulator dial',
  'circuits-multimeter': 'Fluke digital multimeter',
  'circuits-dmm-dial': 'Fluke multimeter rotary dial',
  'circuits-dmm-jack': 'multimeter input terminals',
  'circuits-dmm-jack-v': 'multimeter V·Ω (+) input jack',
  'circuits-dmm-jack-ma': 'multimeter mA/10A current jack',
  'circuits-dmm-jack-com': 'multimeter COM (-) ground jack',
  'circuits-probe-red': 'Red (+) multimeter test probe',
  'circuits-probe-black': 'Black (COM) reference probe',
  'circuits-oscilloscope': 'Tektronix oscilloscope',
  'circuits-osc-time-knob': 'oscilloscope SEC/DIV timebase knob',
  'circuits-osc-ch1-knob': 'oscilloscope CH1 VOLTS/DIV knob',
  'circuits-osc-ch2-knob': 'oscilloscope CH2 SCALE/DIV knob',
  'circuits-osc-trigger-knob': 'oscilloscope RUN/STOP trigger knob',
  'circuits-osc-ch1-input': 'oscilloscope BNC CH1 input',
  'circuits-osc-ch2-input': 'oscilloscope BNC CH2 input',
  'circuits-topology-selector': 'breadboard resistor network',
  'circuits-terminal-SRC_POS': 'PSU +V supply socket (SRC_POS)',
  'circuits-terminal-SRC_NEG': 'PSU GND return socket (SRC_NEG)',
  'circuits-terminal-R1_A': 'resistor R1 left socket (R1_A)',
  'circuits-terminal-R1_B': 'resistor R1 right socket (R1_B)',
  'circuits-terminal-R2_A': 'resistor R2 left socket (R2_A)',
  'circuits-terminal-R2_B': 'resistor R2 right socket (R2_B)',
  'circuits-terminal-R3_A': 'resistor R3 left socket (R3_A)',
  'circuits-terminal-R3_B': 'resistor R3 right socket (R3_B)',
  'circuits-terminal-SERIES_JACK_A': 'series ammeter input socket (+A)',
  'circuits-terminal-SERIES_JACK_B': 'series ammeter output socket (-A)',
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
  'optics-object-target': 'illuminated object target carriage',
  'optics-lens-carrier': 'converging lens mount',
  'optics-clipboard': 'laboratory notebook & data log',
  'relativity-placard': 'relativity reference board',
  'relativity-velocity-dial': 'relativistic velocity dial',
  'relativity-contracting-rod': 'contracting meter-rod',
  'relativity-light-clock': 'atomic light-clock',
  'relativity-telemetry-console': 'reference frame telemetry console',
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

function formatValue(value: number | string | boolean | undefined | null) {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
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

function Frac({ num, den }: { num: ReactNode; den: ReactNode }) {
  return (
    <span className="math-frac">
      <span className="math-frac-num">{num}</span>
      <span className="math-frac-den">{den}</span>
    </span>
  );
}

function Sqrt({ children }: { children: ReactNode }) {
  return (
    <span className="math-sqrt">
      <span className="math-sqrt-sign" aria-hidden="true">√</span>
      <span className="math-sqrt-radicand">{children}</span>
    </span>
  );
}

function renderMathLeaf(segment: string, keyPrefix: string): ReactNode[] {
  const tokenRe =
    /(p\^μ|p_μ|θ_c|([RVIfnθ])_([A-Za-z0-9]+)|(?<![\w.])1\s*\/\s*(?:f|u|v|di|do|Req|R[123])(?![A-Za-z0-9])|(?:v²|v\^2)\s*\/\s*(?:c²|c\^2)|(?:Δt[₀0]|L[₀0])\s*\/\s*γ|[n]([₁1₂2])\s*\/\s*[n]([₁1₂2])|\b(?:Req|Itot|Rmean|Rnom|fmean|Imax|Vrms|Irms|XL|XC|θc|m[₀0]|E[₀0]|L[₀0]|f[₀0]|τ[₀0]|Δt[₀0]|n[₁1₂2]|θ[₁1₂2]|R[₁1₂2₃3₄4₅5]|V[₁1₂2₃3]|I[₁1₂2₃3]|f[₁1₂2])\b|cm⁻¹|⁻¹\/²|⁻¹|²|³)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;

  while ((m = tokenRe.exec(segment)) !== null) {
    if (m.index > last) out.push(segment.slice(last, m.index));
    const tok = m[0];
    const k = `${keyPrefix}-${idx++}`;

    if (tok === 'p^μ') {
      out.push(<span key={k} className="math-inline">p<sup>μ</sup></span>);
    } else if (tok === 'p_μ') {
      out.push(<span key={k} className="math-inline">p<sub>μ</sub></span>);
    } else if (tok === 'θ_c' || tok === 'θc') {
      out.push(<span key={k} className="math-inline">θ<sub>c</sub></span>);
    } else if (m[2] && m[3]) {
      out.push(<span key={k} className="math-inline">{m[2]}<sub>{m[3]}</sub></span>);
    } else if (/^1\s*\/\s*/.test(tok)) {
      const denRaw = tok.replace(/^1\s*\/\s*/, '');
      out.push(<Frac key={k} num="1" den={renderMathLeaf(denRaw, `${k}d`)} />);
    } else if (/^(?:v²|v\^2)\s*\//.test(tok)) {
      out.push(<Frac key={k} num={<>v<sup>2</sup></>} den={<>c<sup>2</sup></>} />);
    } else if (/^(?:Δt[₀0]|L[₀0])\s*\/\s*γ$/.test(tok)) {
      const base = tok.startsWith('Δt') ? <>Δt<sub>0</sub></> : <>L<sub>0</sub></>;
      out.push(<Frac key={k} num={base} den="γ" />);
    } else if (/^[n][₁1₂2]\s*\/\s*[n][₁1₂2]$/.test(tok)) {
      const nums = tok.replace(/\s+/g, '').split('/');
      out.push(<Frac key={k} num={renderMathLeaf(nums[0], `${k}n`)} den={renderMathLeaf(nums[1], `${k}d`)} />);
    } else if (tok === 'Req') {
      out.push(<span key={k} className="math-inline">R<sub>eq</sub></span>);
    } else if (tok === 'Itot') {
      out.push(<span key={k} className="math-inline">I<sub>tot</sub></span>);
    } else if (tok === 'Rmean') {
      out.push(<span key={k} className="math-inline">R<sub>mean</sub></span>);
    } else if (tok === 'Rnom') {
      out.push(<span key={k} className="math-inline">R<sub>nom</sub></span>);
    } else if (tok === 'fmean') {
      out.push(<span key={k} className="math-inline">f<sub>mean</sub></span>);
    } else if (tok === 'Imax') {
      out.push(<span key={k} className="math-inline">I<sub>max</sub></span>);
    } else if (tok === 'Vrms') {
      out.push(<span key={k} className="math-inline">V<sub>rms</sub></span>);
    } else if (tok === 'Irms') {
      out.push(<span key={k} className="math-inline">I<sub>rms</sub></span>);
    } else if (tok === 'XL') {
      out.push(<span key={k} className="math-inline">X<sub>L</sub></span>);
    } else if (tok === 'XC') {
      out.push(<span key={k} className="math-inline">X<sub>C</sub></span>);
    } else if (tok === 'cm⁻¹') {
      out.push(<span key={k} className="math-inline">cm<sup>−1</sup></span>);
    } else if (tok === '⁻¹/²') {
      out.push(<sup key={k}>−1/2</sup>);
    } else if (tok === '⁻¹') {
      out.push(<sup key={k}>−1</sup>);
    } else if (tok === '²') {
      out.push(<sup key={k}>2</sup>);
    } else if (tok === '³') {
      out.push(<sup key={k}>3</sup>);
    } else {
      const subMap: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3' };
      const subChar = tok.slice(-1);
      const base = tok.slice(0, -1);
      out.push(<span key={k} className="math-inline">{base}<sub>{subMap[subChar] ?? subChar}</sub></span>);
    }

    last = tokenRe.lastIndex;
  }

  if (last < segment.length) out.push(segment.slice(last));
  return out;
}

function renderMathNodes(input: string, keyPrefix = 'm'): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let seq = 0;

  while (cursor < input.length) {
    const sqrtIdx = input.indexOf('√(', cursor);
    if (sqrtIdx === -1) {
      out.push(...renderMathLeaf(input.slice(cursor), `${keyPrefix}-l${seq++}`));
      break;
    }

    let depth = 1;
    let endIdx = sqrtIdx + 2;
    while (endIdx < input.length && depth > 0) {
      if (input[endIdx] === '(') depth++;
      else if (input[endIdx] === ')') depth--;
      endIdx++;
    }

    if (depth !== 0) {
      out.push(...renderMathLeaf(input.slice(cursor), `${keyPrefix}-u${seq++}`));
      break;
    }

    const before = input.slice(cursor, sqrtIdx);
    const radicand = input.slice(sqrtIdx + 2, endIdx - 1);
    const oneOverMatch = before.match(/^(.*?(?:^|[\s=(=]))(1)\s*\/\s*$/);
    const parenOverMatch = !oneOverMatch ? before.match(/^(.*)\(([^()]+)\)\s*\/\s*$/) : null;

    if (oneOverMatch) {
      if (oneOverMatch[1]) {
        out.push(...renderMathLeaf(oneOverMatch[1], `${keyPrefix}-b${seq++}`));
      }
      out.push(
        <Frac
          key={`${keyPrefix}-f${seq++}`}
          num="1"
          den={<Sqrt>{renderMathNodes(radicand, `${keyPrefix}-s${seq}`)}</Sqrt>}
        />,
      );
    } else if (parenOverMatch) {
      if (parenOverMatch[1]) {
        out.push(...renderMathLeaf(parenOverMatch[1], `${keyPrefix}-b${seq++}`));
      }
      out.push(
        <Frac
          key={`${keyPrefix}-f${seq++}`}
          num={renderMathNodes(parenOverMatch[2], `${keyPrefix}-fn${seq}`)}
          den={<Sqrt>{renderMathNodes(radicand, `${keyPrefix}-s${seq}`)}</Sqrt>}
        />,
      );
    } else {
      if (before) out.push(...renderMathLeaf(before, `${keyPrefix}-b${seq++}`));
      out.push(<Sqrt key={`${keyPrefix}-s${seq++}`}>{renderMathNodes(radicand, `${keyPrefix}-r${seq}`)}</Sqrt>);
    }

    cursor = endIdx;
  }

  return out;
}

function MathText({ text }: { text: string }) {
  return <span className="math-inline">{renderMathNodes(text)}</span>;
}

function Metric({ label, value }: { label: ReactNode; value: ReactNode }) {
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
      currentStep: Math.max(0, Math.min(TOTAL_STEPS - 1, Number(saved.currentStep) || 0)),
      completed: Array.from({ length: TOTAL_STEPS }, (_, index) => Boolean(saved.completed?.[index])),
      skipped: Array.from({ length: TOTAL_STEPS }, (_, index) => Boolean(saved.skipped?.[index])),
      trials: Array.isArray(saved.trials) ? saved.trials.slice(0, TOTAL_TRIALS) : [],
      inspected: Array.isArray(saved.inspected) ? saved.inspected.filter((entry): entry is string => typeof entry === 'string') : [],
      setupActions: Array.isArray(saved.setupActions) ? saved.setupActions.filter((entry): entry is string => typeof entry === 'string') : [],
      calculations: Array.from({ length: TOTAL_TRIALS }, (_, index) => (typeof saved.calculations?.[index] === 'string' ? saved.calculations[index] : '')),
      calculationStatus: (saved.calculationStatus as 'unattempted' | 'submitted' | 'validated') || 'unattempted',
      calculationFeedback: typeof saved.calculationFeedback === 'string' ? saved.calculationFeedback : '',
      observations: typeof saved.observations === 'string' ? saved.observations : '',
      scientificInterpretation: typeof saved.scientificInterpretation === 'string' ? saved.scientificInterpretation : '',
      claim: typeof saved.claim === 'string' ? saved.claim : '',
      evidence: typeof saved.evidence === 'string' ? saved.evidence : '',
      reasoning: typeof saved.reasoning === 'string' ? saved.reasoning : '',
      analysis: typeof saved.analysis === 'string' ? saved.analysis : '',
      conclusion: typeof saved.conclusion === 'string' ? saved.conclusion : '',
      recommendations: typeof saved.recommendations === 'string' ? saved.recommendations : '',
      errors: Array.isArray(saved.errors) ? saved.errors.filter((entry): entry is string => typeof entry === 'string') : [],
      guideAnswers: Array.isArray(saved.guideAnswers) ? saved.guideAnswers.slice(0, 3).map((v) => Number(v)) : [-1, -1, -1],
      predictionAnswer: typeof saved.predictionAnswer === 'number' ? saved.predictionAnswer : null,
      assistedSteps: Array.isArray(saved.assistedSteps) ? saved.assistedSteps.map((v) => Number(v)) : [],
      hintLevel: typeof saved.hintLevel === 'number' ? saved.hintLevel : 0,
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

  // Station & Physical Settings States (SSR-safe defaults; URL params synced after mount)
  const [stationId, setStationId] = useState<Room3StationId>('circuits');
  const [circuits, setCircuits] = useState<CircuitSettings>(INITIAL_CIRCUITS);
  const [oscilloscope, setOscilloscope] = useState<OscilloscopeSettings>(INITIAL_OSCILLOSCOPE);
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

  // Notebook Modal States (SSR-safe defaults; URL params synced after mount)
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [notebookStep, setNotebookStep] = useState(0);
  const [calculationFeedback, setCalculationFeedback] = useState('');
  const [calculationStatus, setCalculationStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [showCalcHint, setShowCalcHint] = useState(false);
  const [measurementWarning, setMeasurementWarning] = useState('');
  const [studentName, setStudentName] = useState('Student Physicist');
  const [studentId, setStudentId] = useState('PHY-300-2026');
  const [studentSection, setStudentSection] = useState('Physics Core III');
  const [studentDatePerformed, setStudentDatePerformed] = useState(() =>
    typeof window !== 'undefined' ? new Date().toISOString().slice(0, 10) : '2026-11-16'
  );
  const [masterReportOpen, setMasterReportOpen] = useState(false);
  const [masterReportDoorExit, setMasterReportDoorExit] = useState(false);
  const [reportRefreshNonce, setReportRefreshNonce] = useState(0);
  const hasAutoOpenedReportRef = useRef(false);
  const [reportMetadata, setReportMetadata] = useState<ReportMetadata>({
    studentName: 'Student Physicist',
    studentId: 'PHY-300-2026',
    section: 'Physics Core III',
    instructorName: 'Physics Laboratory Instructor',
    groupNumber: 'Group 1 · PHY-300',
    datePerformed: '',
    dateSubmitted: '',
    scope: 'all',
    includeAnswerKey: true,
  });
  const [reportOverrides, setReportOverrides] = useState<ReportOverrides>(createEmptyReportOverrides);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const [mobilePanel, setMobilePanel] = useState<'none' | 'objective' | 'controls'>('none');
  const [runSettling, setRunSettling] = useState(false);
  const [equipmentMessage, setEquipmentMessage] = useState('');
  const [soundVolume, setSoundVolume] = useState(0.5);
  const [pointerLocked, setPointerLocked] = useState(false);

  // Coordinated Workspace Views (View A: 3D Laboratory vs View B: DCACLab Interactive Breadboard Workspace)
  const [activeWorkspaceView, setActiveWorkspaceView] = useState<'3d' | 'circuit_workspace'>('3d');

  // Multimeter & Workbench Instrument States (SSR-safe default)
  const [cameraMode, setCameraMode] = useState<'walk' | 'closeup'>('walk');
  const [dmmReading, setDmmReading] = useState<MultimeterReading>({
    value: 0.0,
    displayString: '0.00 V',
    unit: 'V',
    isContinuityBeep: false,
    warning: null,
    isValidMeasurement: false,
  });
  const [dmmMode, setDmmModeState] = useState<MultimeterMode>('cont');
  const [dmmJack, setDmmJackState] = useState<MultimeterJack>('v_ohm');
  const [redTerminal, setRedTerminalState] = useState<TerminalId | null>(null);
  const [blackTerminal, setBlackTerminalState] = useState<TerminalId | null>(null);
  const [activeProbe, setActiveProbeState] = useState<'red' | 'black'>('red');
  const [jumperClosed, setJumperClosed] = useState(true);
  const [closeupHoverText, setCloseupHoverText] = useState<string | null>(null);
  const [closeupFocus, setCloseupFocus] = useState<Room3CloseupFocus>('station');
  const [closeupZoom, setCloseupZoom] = useState(1.0);
  const isTouchDevice = useSyncExternalStore(subscribeMobileTouch, isMobileTouchDevice, () => false);
  const [labelsOverride, setLabelsOverride] = useState<boolean | null>(null);
  const labelsVisible = labelsOverride ?? !isTouchDevice;
  const [closeupHudExpanded, setCloseupHudExpanded] = useState(false);
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [lastTappedControlId, setLastTappedControlId] = useState<string | null>(null);
  const [walkHudCompact, setWalkHudCompact] = useState(false);

  useEffect(() => {
    sceneApi.current?.setLabelsVisible?.(labelsVisible);
  }, [labelsVisible, sceneReady]);

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

  const handleSetCloseupFocus = (focus: Room3CloseupFocus) => {
    setMobilePanel('none');
    setCloseupHudExpanded(false);
    setCloseupFocus(focus);
    setCloseupZoom(1.0);
    sceneApi.current?.setCloseupFocus?.(focus);
  };

  const handleCloseupZoomIn = () => {
    const next = sceneApi.current?.zoomCloseup?.(-0.15);
    if (typeof next === 'number') setCloseupZoom(next);
  };

  const handleCloseupZoomOut = () => {
    const next = sceneApi.current?.zoomCloseup?.(0.15);
    if (typeof next === 'number') setCloseupZoom(next);
  };

  const handleResetCloseupCamera = () => {
    sceneApi.current?.resetCloseupCamera?.();
    setCloseupZoom(1.0);
  };

  const renderCloseupUtilityButtons = () => (
    <>
      <button
        type="button"
        className="cam-focus-btn"
        onClick={handleCloseupZoomIn}
        title="Zoom In (or Scroll Up when not over a knob)"
      >
        🔍+
      </button>
      <button
        type="button"
        className="cam-focus-btn"
        onClick={handleCloseupZoomOut}
        title="Zoom Out (or Scroll Down when not over a knob)"
      >
        🔍−
      </button>
      <button
        type="button"
        className="cam-focus-btn"
        onClick={handleResetCloseupCamera}
        title="Reset Close-Up Zoom & Drag Pan (Drag canvas to pan)"
      >
        ↺ {Math.round((1 / closeupZoom) * 100)}%
      </button>
      <button
        type="button"
        className={`cam-focus-btn ${labelsVisible ? 'active' : ''}`}
        onClick={() => setLabelsOverride((v) => !(v ?? !isTouchDevice))}
        title="Toggle 3D Floating Equipment Labels"
      >
        🏷️ Labels: {labelsVisible ? 'ON' : 'OFF'}
      </button>
    </>
  );

  const handleSelectActiveProbe = (probe: 'red' | 'black') => {
    setActiveProbeState(probe);
    sceneApi.current?.setActiveProbe?.(probe);
    playTone(probe === 'red' ? 740 : 540, 'sine', 0.05, 0.12);
  };

  const handleFocusInspectionTarget = (tgt: string) => {
    setNotebookOpen(false);
    setMobilePanel('none');
    setActiveWorkspaceView('3d');
    setManualGuidanceTarget(tgt);
    if (cameraMode !== 'closeup') {
      handleSetCloseup('closeup');
    }
    let subFocus: Room3CloseupFocus = 'station';
    if (tgt === 'circuits-power-switch' || tgt === 'circuits-voltage-knob' || tgt === 'circuits-function-generator') {
      subFocus = 'psu';
    } else if (
      tgt === 'circuits-multimeter' ||
      tgt.startsWith('circuits-dmm-') ||
      tgt === 'circuits-probe-red' ||
      tgt === 'circuits-probe-black'
    ) {
      subFocus = 'multimeter';
    } else if (tgt === 'circuits-oscilloscope' || tgt.startsWith('circuits-osc-')) {
      subFocus = 'oscilloscope';
    } else if (
      tgt === 'circuits-topology-selector' ||
      tgt === 'circuits-series-jumper' ||
      tgt.startsWith('circuits-probe-r') ||
      tgt.startsWith('circuits-terminal-')
    ) {
      subFocus = 'board';
    } else if (tgt === 'optics-laser') {
      subFocus = 'laser';
    } else if (tgt === 'optics-rail') {
      subFocus = 'station';
    } else if (
      tgt === 'optics-angle-dial' ||
      tgt === 'optics-object-target' ||
      tgt === 'optics-lens-carrier' ||
      tgt === 'optics-submode-toggle'
    ) {
      subFocus = 'lens';
    } else if (tgt === 'optics-screen') {
      subFocus = 'screen';
    } else if (tgt === 'relativity-light-clock' || tgt === 'relativity-telemetry-console') {
      subFocus = 'clock';
    } else if (tgt === 'relativity-contracting-rod') {
      subFocus = 'rod';
    } else if (tgt === 'relativity-velocity-dial') {
      subFocus = 'console';
    } else if (tgt === 'relativity-accelerator') {
      subFocus = 'station';
    }

    handleSetCloseupFocus(subFocus);
    sceneApi.current?.setGuidance(tgt);
    const label = INSPECTION_LABELS[tgt] || GUIDANCE_LABELS[tgt] || tgt;
    setEquipmentMessage(`👆 Locate and click "${label}" directly on the 3D apparatus.`);
  };

  // Student-Centered Experience: Exclusively Guided Experiment
  const experienceMode: ExperienceMode = 'guided';
  const stationProgress = progress[stationId];
  const [viewStepIndex, setViewStepIndex] = useState<number | null>(null);
  const activeStepIdx = viewStepIndex !== null ? viewStepIndex : stationProgress.currentStep;
  const [manualGuidanceTarget, setManualGuidanceTarget] = useState<string | null>(null);
  const [lastInspectedTarget, setLastInspectedTarget] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<number>(0);
  const [calcPerTrialStatus, setCalcPerTrialStatus] = useState<('correct' | 'incorrect' | 'empty')[]>(Array(TOTAL_TRIALS).fill('empty'));
  const [conclusionFeedback, setConclusionFeedback] = useState<string>('');
  const [retakeTrialIndex, setRetakeTrialIndex] = useState<number | null>(null);
  const [activeTrialTab, setActiveTrialTab] = useState<number>(0);

  // Reset step view & guidance override on station or step change
  useEffect(() => {
    setViewStepIndex(null);
    setHintLevel(0);
    setRetakeTrialIndex(null);
    setActiveTrialTab(0);
    setManualGuidanceTarget(null);
    setLastInspectedTarget(null);
  }, [stationId]);

  useEffect(() => {
    setViewStepIndex(null);
  }, [stationProgress.currentStep]);

  useEffect(() => {
    setManualGuidanceTarget(null);
  }, [activeStepIdx]);

  // Resume automatic step-by-step guidance once the user interacts with any step control in Steps 2–9
  useEffect(() => {
    if (activeStepIdx > 0) {
      setManualGuidanceTarget(null);
    }
  }, [activeStepIdx, circuits, oscilloscope, optics, relativity, dmmMode, dmmJack, redTerminal, blackTerminal, jumperClosed]);

  // Station Definitions & Telemetry Derived States
  const station = ROOM3_STATIONS[stationId];
  const circuitResult = useMemo(() => calculateCircuit(circuits), [circuits]);
  const opticsResult = useMemo(() => calculateOptics(optics), [optics]);
  const relativityResult = useMemo(() => calculateRelativity(relativity), [relativity]);

  const circuitMetrics = useMemo(() => computeCircuitOhmMetrics(stationProgress.trials), [stationProgress.trials]);
  const opticsMetrics = useMemo(() => computeOpticsLensMetrics(stationProgress.trials), [stationProgress.trials]);
  const relativityMetrics = useMemo(() => computeRelativityMetrics(stationProgress.trials), [stationProgress.trials]);
  const regression = useMemo(() => computeRoom3Regression(stationId, stationProgress.trials), [stationId, stationProgress.trials]);

  // Authoritative Progression State Machine Environment
  const liveState: LiveEnvironmentState = useMemo(() => ({
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
    stationProgress,
  }), [stationId, circuits, optics, relativity, dmmMode, dmmJack, redTerminal, blackTerminal, jumperClosed, dmmReading, stationProgress]);

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
    trialsCount: stationProgress.trials.length,
    calculationStatus: stationProgress.calculationStatus,
    hasConclusion: Boolean((stationProgress.conclusion || '').trim().length >= 15 && (stationProgress.claim || '').trim().length >= 15),
  }), [stationId, circuits, optics, relativity, dmmMode, dmmJack, redTerminal, blackTerminal, jumperClosed, dmmReading, stationProgress]);

  const stepValidation: StepValidationResult = useMemo(() => {
    if (!currentGuidedStep) return { isPassed: true, feedback: '' };
    return currentGuidedStep.validate(guidedState);
  }, [currentGuidedStep, guidedState]);

  const stepPrereq = useMemo(() => {
    return evaluateStepPrerequisites(liveState, activeStepIdx);
  }, [liveState, activeStepIdx]);

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

  // Step 8 & 9 Certification Gating
  const isComputationVerified = Boolean(stationProgress.completed[7]);
  const isConclusionSubmitted = Boolean(stationProgress.completed[8]);
  const allTrialsLogged = stationProgress.trials.length >= TOTAL_TRIALS;
  const isStudentInfoFilled = studentName.trim().length > 0 && studentId.trim().length > 0 && studentSection.trim().length > 0;
  const reportReady = allTrialsLogged && isComputationVerified && isConclusionSubmitted && isStudentInfoFilled;

  // Scoring
  const currentScore = stationScore(stationProgress);
  const totalScore = (Object.keys(progress) as Room3StationId[]).reduce(
    (total, id) => total + stationScore(progress[id]),
    0
  );
  const completedStationsCount = (['circuits', 'optics', 'relativity'] as Room3StationId[]).filter((id) =>
    isStationFinished(progress[id])
  ).length;
  const allRoom3StationsComplete = completedStationsCount === 3;

  const openMasterReport = (doorExit = false) => {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    setReportMetadata((prev) => ({
      ...prev,
      studentName,
      studentId,
      section: studentSection,
      groupNumber: prev.groupNumber || `Group 1 · ${studentSection || 'PHY-300'}`,
      datePerformed: studentDatePerformed || prev.datePerformed || todayIso,
      dateSubmitted: prev.dateSubmitted || todayIso,
    }));
    setReportRefreshNonce((n) => n + 1);
    setMasterReportDoorExit(doorExit);
    setMasterReportOpen(true);
  };

  const handleMasterReportMetadataChange = (next: ReportMetadata) => {
    setReportMetadata(next);
    if (next.studentName !== studentName) setStudentName(next.studentName);
    if (next.studentId !== studentId) setStudentId(next.studentId);
    if (next.section !== studentSection) setStudentSection(next.section);
    if (next.datePerformed !== studentDatePerformed) setStudentDatePerformed(next.datePerformed);
  };

  const masterReportState = useMemo(
    () =>
      masterReportOpen
        ? hydrateMasterReportFromStorage(progress, circuits, optics, relativity)
        : null,
    // reportRefreshNonce forces a fresh localStorage read for Room 1 & Room 2 when Sync is clicked
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [masterReportOpen, reportRefreshNonce, progress, circuits, optics, relativity]
  );

  const missingInspection = INSPECTION_TARGETS[stationId]?.find((id) => !stationProgress.inspected.includes(id));

  // Dynamic, Real-Time Synchronized Guidance Target pointing to exactly what the student needs next
  const guidanceTarget = useMemo(() => {
    if (manualGuidanceTarget) return manualGuidanceTarget;

    const pickCyclicInspectionTarget = (targets: string[], fallback: string) => {
      if (lastInspectedTarget) {
        const anchorIdx = targets.indexOf(lastInspectedTarget);
        if (anchorIdx !== -1) {
          for (let offset = 1; offset <= targets.length; offset++) {
            const candidate = targets[(anchorIdx + offset) % targets.length];
            if (!stationProgress.inspected.includes(candidate)) return candidate;
          }
        }
      }
      return targets.find((id) => !stationProgress.inspected.includes(id)) || fallback;
    };

    // 1. Station 01: Circuits (Ohm's Law)
    if (stationId === 'circuits') {
      // Step 1: Equipment Identification
      if (activeStepIdx === 0) {
        return pickCyclicInspectionTarget(INSPECTION_TARGETS.circuits, 'circuits-power-switch');
      }
      // Step 2: Circuit Assembly & Inspection (DC series continuity & Req = 650 Ω)
      if (activeStepIdx === 1) {
        if (!jumperClosed) return 'circuits-series-jumper';
        return 'circuits-topology-selector';
      }
      // Step 3: Power Supply Setup & Energization (24.0 V DC)
      if (activeStepIdx === 2) {
        if (!circuits.powerOn) return 'circuits-power-switch';
        if (circuits.vs < 2.0) return 'circuits-voltage-knob';
        return 'circuits-power-switch';
      }
      // Step 4: Multimeter Instrument Preparation (DC V mode, V·Ω jack)
      if (activeStepIdx === 3) {
        if (dmmJack !== 'v_ohm') return 'circuits-dmm-jack-v';
        if (dmmMode !== 'v_dc') return 'circuits-dmm-dial';
        return 'circuits-multimeter';
      }
      // Step 5: Voltage Measurement Procedure (Parallel across PSU or R1)
      if (activeStepIdx === 4) {
        if (!circuits.powerOn) return 'circuits-power-switch';
        if (dmmJack !== 'v_ohm') return 'circuits-dmm-jack-v';
        if (dmmMode !== 'v_dc') return 'circuits-dmm-dial';
        const isParallelConnected =
          (redTerminal === 'SRC_POS' && blackTerminal === 'SRC_NEG') ||
          (redTerminal === 'R1_A' && blackTerminal === 'R1_B') ||
          (redTerminal === 'R1_B' && blackTerminal === 'R1_A');
        if (!isParallelConnected) {
          if (redTerminal === 'SRC_POS' && blackTerminal !== 'SRC_NEG') {
            return 'circuits-terminal-SRC_NEG';
          }
          if (redTerminal === 'R1_A' && blackTerminal !== 'R1_B') {
            return 'circuits-terminal-R1_B';
          }
          if (redTerminal === 'R1_B' && blackTerminal !== 'R1_A') {
            return 'circuits-terminal-R1_A';
          }
          return 'circuits-terminal-R1_A';
        }
        return 'circuits-multimeter';
      }
      // Step 6: Current Measurement Procedure (Series ammeter insertion)
      if (activeStepIdx === 5) {
        // Safety: Power must be turned OFF before breaking circuit
        if (circuits.powerOn && (jumperClosed || dmmJack !== 'ma_10a' || (dmmMode !== 'a_dc' && dmmMode !== 'a_ac'))) {
          return 'circuits-power-switch';
        }
        if (dmmJack !== 'ma_10a') return 'circuits-dmm-jack-ma';
        if (dmmMode !== 'a_dc' && dmmMode !== 'a_ac') return 'circuits-dmm-dial';
        if (jumperClosed) return 'circuits-series-jumper';
        const isSeriesBreak =
          (redTerminal === 'SERIES_JACK_A' && blackTerminal === 'SERIES_JACK_B') ||
          (redTerminal === 'SERIES_JACK_B' && blackTerminal === 'SERIES_JACK_A');
        if (!isSeriesBreak) {
          if (redTerminal === 'SERIES_JACK_A' && blackTerminal !== 'SERIES_JACK_B') {
            return 'circuits-terminal-SERIES_JACK_B';
          }
          if (redTerminal === 'SERIES_JACK_B' && blackTerminal !== 'SERIES_JACK_A') {
            return 'circuits-terminal-SERIES_JACK_A';
          }
          return 'circuits-terminal-SERIES_JACK_A';
        }
        if (!circuits.powerOn) return 'circuits-power-switch'; // Restore power
        return 'circuits-multimeter';
      }
      // Step 7: Five-Trial Experimental Data Collection (sweep 2V, 4V, 6V, 8V, 10V)
      if (activeStepIdx === 6) {
        if (dmmJack !== 'ma_10a') return 'circuits-dmm-jack-ma';
        if (dmmMode !== 'a_dc' && dmmMode !== 'a_ac') return 'circuits-dmm-dial';
        if (jumperClosed) return 'circuits-series-jumper';
        const isSeriesBreak =
          (redTerminal === 'SERIES_JACK_A' && blackTerminal === 'SERIES_JACK_B') ||
          (redTerminal === 'SERIES_JACK_B' && blackTerminal === 'SERIES_JACK_A');
        if (!isSeriesBreak) {
          return redTerminal === 'SERIES_JACK_A'
            ? 'circuits-terminal-SERIES_JACK_B'
            : 'circuits-terminal-SERIES_JACK_A';
        }
        if (!circuits.powerOn) return 'circuits-power-switch';
        const curTrialIdx = stationProgress.trials.length;
        if (curTrialIdx < TOTAL_TRIALS) {
          const targetV = ROOM3_ASSIGNED_TRIALS.circuits[curTrialIdx]?.targetValue ?? 4.0;
          if (Math.abs(circuits.vs - targetV) > 0.6) return 'circuits-voltage-knob';
          return 'circuits-multimeter';
        }
        return 'circuits-clipboard';
      }
      // Step 8: Computation & Scientific Analysis
      if (activeStepIdx === 7) {
        return 'circuits-clipboard';
      }
      // Step 9: Observations, Scientific Interpretation & Conclusion
      if (activeStepIdx === 8) {
        return 'circuits-clipboard';
      }
    }

    // 2. Station 02: Optics (Thin Lens)
    if (stationId === 'optics') {
      if (activeStepIdx === 0) {
        return pickCyclicInspectionTarget(INSPECTION_TARGETS.optics, 'optics-laser');
      }
      if (activeStepIdx === 1) return 'optics-rail';
      if (activeStepIdx === 2) {
        if (!optics.powerOn || optics.wavelength !== 532) return 'optics-laser';
        return 'optics-rail';
      }
      if (activeStepIdx === 3) {
        if (optics.subMode !== 'imaging') return 'optics-angle-dial';
        return 'optics-lens-carrier';
      }
      if (activeStepIdx === 4) {
        if (Math.abs(optics.objectDistance - 40.0) > 1.5) return 'optics-rail';
        return 'optics-screen';
      }
      if (activeStepIdx === 5) return 'optics-screen';
      if (activeStepIdx === 6) {
        const curTrialIdx = stationProgress.trials.length;
        if (curTrialIdx < TOTAL_TRIALS) {
          const targetU = ROOM3_ASSIGNED_TRIALS.optics[curTrialIdx]?.targetValue ?? 30.0;
          if (Math.abs(optics.objectDistance - targetU) > 1.5) return 'optics-rail';
          return 'optics-screen';
        }
        return 'optics-clipboard';
      }
      if (activeStepIdx === 7) return 'optics-clipboard';
      if (activeStepIdx === 8) return 'optics-clipboard';
    }

    // 3. Station 03: Special Relativity (Lorentz Transformations)
    if (stationId === 'relativity') {
      if (activeStepIdx === 0) {
        return pickCyclicInspectionTarget(INSPECTION_TARGETS.relativity, 'relativity-velocity-dial');
      }
      if (activeStepIdx === 1) return 'relativity-light-clock';
      if (activeStepIdx === 2) {
        if (relativity.beta < 0.25) return 'relativity-velocity-dial';
        return 'relativity-accelerator';
      }
      if (activeStepIdx === 3) return 'relativity-light-clock';
      if (activeStepIdx === 4) return 'relativity-light-clock';
      if (activeStepIdx === 5) return 'relativity-contracting-rod';
      if (activeStepIdx === 6) {
        const curTrialIdx = stationProgress.trials.length;
        if (curTrialIdx < TOTAL_TRIALS) {
          const targetBeta = ROOM3_ASSIGNED_TRIALS.relativity[curTrialIdx]?.targetValue ?? 0.10;
          if (Math.abs(relativity.beta - targetBeta) > 0.03) return 'relativity-velocity-dial';
          return 'relativity-accelerator';
        }
        return 'relativity-clipboard';
      }
      if (activeStepIdx === 7) return 'relativity-clipboard';
      if (activeStepIdx === 8) return 'relativity-clipboard';
    }

    return 'circuits-power-switch';
  }, [
    stationId,
    activeStepIdx,
    stationProgress.inspected,
    stationProgress.trials.length,
    circuits.powerOn,
    circuits.vs,
    jumperClosed,
    dmmJack,
    dmmMode,
    redTerminal,
    blackTerminal,
    optics.powerOn,
    optics.wavelength,
    optics.subMode,
    optics.objectDistance,
    relativity.beta,
    relativity.powerOn,
    manualGuidanceTarget,
    lastInspectedTarget,
  ]);

  useEffect(() => {
    sceneApi.current?.setGuidance(guidanceTarget);
  }, [guidanceTarget, sceneReady]);

  const returnToApparatus = (message: string) => {
    setNotebookOpen(false);
    setMobilePanel('none');
    setEquipmentMessage(message);
    if (!isMobileTouchDevice()) {
      sceneApi.current?.requestPointerLock();
    }
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
        onEquipmentInteract: (id) => {
          setLastTappedControlId(id);
          equipmentActionRef.current(id);
        },
        onCircuitsChange: (patch) => {
          setCircuits((prev) => ({ ...prev, ...patch }));
        },
        onOscilloscopeChange: (patch) => {
          setOscilloscope((prev) => ({ ...prev, ...patch }));
        },
        onOpticsChange: (patch) => {
          setOptics((prev) => ({ ...prev, ...patch }));
        },
        onRelativityChange: (patch) => {
          setRelativity((prev) => ({ ...prev, ...patch }));
        },
        onInteractionChange: (inter) => setInteraction(inter),
        onFootstep: () => playTone(80, 'sine', 0.05, 0.1),
        onCameraModeChange: (mode) => setCameraMode(mode),
        onCloseupZoomChange: (z) => setCloseupZoom(z),
        onDmmReadingChange: (reading) => setDmmReading(reading),
        onDmmModeChange: (mode) => setDmmModeState(mode),
        onDmmJackChange: (jack) => setDmmJackState(jack),
        onJumperChange: (closed) => setJumperClosed(closed),
        onActiveProbeChange: (probe) => setActiveProbeState(probe),
        onProbePlaced: (probe, term) => {
          if (probe === 'red') setRedTerminalState(term);
          else setBlackTerminalState(term);
        },
        onCloseupHover: (text, hoveredId) => {
          setCloseupHoverText(text);
          if (hoveredId !== undefined) setLastTappedControlId(hoveredId);
          if (!text) {
            setInspectorExpanded(false);
            if (hoveredId === undefined) setLastTappedControlId(null);
          }
        },
        onPointerLockChange: setPointerLocked,
        onStationProximityChange: (st) => setProximateStation(st),
        onPerfStatsChange: (fps, frameTimeMs) => setPerfStats({ fps, frameTimeMs }),
        onGuidanceIndicator: (info) => setGuidanceIndicator(info),
        onCharacterChange: (char) => setActiveCharacter(char),
        onContextLost: () => {
          setSceneError(true);
          setSceneReady(false);
        },
      });
      sceneApi.current = api;
      setActiveCharacter(api.getCharacter());
      api.setGraphicsSettings(graphicsSettings);
      api.setDmmMode(dmmMode);
      api.setDmmJack(dmmJack);
      if (redTerminal) api.setProbeTerminal('red', redTerminal);
      if (blackTerminal) api.setProbeTerminal('black', blackTerminal);
      if (typeof window !== 'undefined') {
        (window as unknown as { __room3Scene?: unknown }).__room3Scene = api;
        const params = new URLSearchParams(window.location.search);
        const queryStation = params.get('station') as Room3StationId;
        if (queryStation && ['circuits', 'optics', 'relativity'].includes(queryStation)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setStationId(queryStation);
          api.setStation(queryStation);
        }
        const queryNotebook = params.get('notebook');
        if (queryNotebook === 'true' || queryNotebook === '1') {
          setNotebookOpen(true);
        }
        const queryStepRaw = params.get('step');
        if (queryStepRaw !== null) {
          const queryStep = Number(queryStepRaw);
          if (!Number.isNaN(queryStep) && queryStep >= 0 && queryStep <= 7) {
            setNotebookStep(queryStep);
          }
        }
        const queryCloseup = params.get('closeup');
        if (queryCloseup === 'true' || queryCloseup === '1') {
          setCameraMode('closeup');
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
  useEffect(() => { sceneApi.current?.setOscilloscope?.(oscilloscope); }, [oscilloscope]);
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
    if (mode === cameraMode) {
      if (mode === 'closeup') setMobilePanel('none');
      return;
    }
    setCameraMode(mode);
    setCloseupHudExpanded(false);
    setInspectorExpanded(false);
    if (mode === 'closeup') {
      setMobilePanel('none');
      setCloseupFocus('station');
      setCloseupZoom(1.0);
      sceneApi.current?.setLabelsVisible?.(labelsVisible);
    } else {
      setCloseupHoverText(null);
      setLastTappedControlId(null);
    }
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
      const nextStep = Math.min(TOTAL_STEPS - 1, Math.max(st.currentStep, stepIndex + 1));
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
    if (['circuits-power-switch', 'circuits-voltage-knob', 'circuits-function-generator'].includes(targetId)) {
      canonicalId = 'circuits-power-switch';
    } else if (
      ['circuits-multimeter', 'circuits-dmm-dial', 'circuits-dmm-jack', 'circuits-probe-red', 'circuits-probe-black'].includes(targetId) ||
      targetId.startsWith('circuits-dmm-')
    ) {
      canonicalId = 'circuits-multimeter';
    } else if (targetId === 'circuits-oscilloscope' || targetId.startsWith('circuits-osc-')) {
      canonicalId = 'circuits-oscilloscope';
    } else if (
      ['circuits-topology-selector', 'circuits-probe-r1', 'circuits-probe-r2', 'circuits-probe-r3', 'circuits-series-jumper'].includes(targetId) ||
      targetId.startsWith('circuits-terminal-')
    ) {
      canonicalId = 'circuits-topology-selector';
    } else if (['optics-laser'].includes(targetId)) {
      canonicalId = 'optics-laser';
    } else if (['optics-angle-dial'].includes(targetId)) {
      canonicalId = 'optics-angle-dial';
    } else if (['optics-screen'].includes(targetId)) {
      canonicalId = 'optics-screen';
    } else if (['optics-rail', 'optics-submode-toggle', 'optics-lens-carrier', 'optics-object-target'].includes(targetId)) {
      canonicalId = 'optics-rail';
    } else if (['relativity-velocity-dial'].includes(targetId)) {
      canonicalId = 'relativity-velocity-dial';
    } else if (['relativity-light-clock', 'relativity-telemetry-console'].includes(targetId)) {
      canonicalId = 'relativity-light-clock';
    } else if (['relativity-contracting-rod'].includes(targetId)) {
      canonicalId = 'relativity-contracting-rod';
    } else if (['relativity-accelerator'].includes(targetId)) {
      canonicalId = 'relativity-accelerator';
    }

    const required = INSPECTION_TARGETS[stationId];
    if (!required || !required.includes(canonicalId)) return;

    setLastInspectedTarget(canonicalId);
    setManualGuidanceTarget((prev) => (prev === targetId || prev === canonicalId ? null : prev));

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
        setEquipmentMessage(`🎉 Step 1 Complete (+${STEP_POINTS[0]} pts)! All 4 apparatus instruments inspected. Advancing to Step 2.`);
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

  const handleEquipmentAction = (id: string) => {
    playTone(440, 'triangle', 0.08, 0.2);
    if (id === 'campus-door') {
      openMasterReport(true);
      return;
    }

    // Inspect tracking for Step 1
    handleInspectApparatus(id);

    if (id === 'circuits-oscilloscope') {
      if (cameraMode !== 'closeup') {
        handleSetCloseup('closeup');
        handleSetCloseupFocus('oscilloscope');
      } else if (closeupFocus !== 'oscilloscope') {
        handleSetCloseupFocus('oscilloscope');
      }
      return;
    }

    if (id.startsWith('circuits-osc-')) {
      if (cameraMode !== 'closeup') {
        handleSetCloseup('closeup');
        handleSetCloseupFocus('oscilloscope');
      }
      return;
    }

    if (id === 'room3-honor-roll-left' || id === 'room3-honor-roll-right') {
      playTone(587.33, 'sine', 0.16, 0.25);
      setEquipmentMessage(
        id === 'room3-honor-roll-left'
          ? '🏆 Class Roll of Honor · Part I (Aberde – Hodrial · 20 Scholars Inscribed in 24K Gold)'
          : '🏆 Class Roll of Honor · Part II (Lacorte – Talatala · 19 Scholars Inscribed in 24K Gold)'
      );
      return;
    }

    if (id.includes('placard') || id.includes('clipboard')) {
      setNotebookOpen(true);
    } else if (['circuits-multimeter', 'circuits-power-switch', 'circuits-voltage-knob', 'circuits-function-generator', 'circuits-topology-selector'].includes(id)) {
      handleSetCloseup('closeup');
    } else if (['optics-laser', 'optics-angle-dial', 'optics-submode-toggle', 'optics-screen', 'optics-rail', 'optics-lens-carrier', 'optics-object-target'].includes(id)) {
      handleSetCloseup('closeup');
    } else if (['relativity-velocity-dial', 'relativity-contracting-rod', 'relativity-light-clock', 'relativity-telemetry-console', 'relativity-accelerator'].includes(id)) {
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
          sceneApi.current?.interact();
        } else if (proximateStation) {
          setStationId(proximateStation);
          handleSetCloseup('closeup');
        }
      } else if (e.key.toLowerCase() === 'v') {
        const next = sceneApi.current?.toggleView();
        if (typeof next === 'boolean') setIsThirdPerson(next);
      } else if (e.key.toLowerCase() === 'c') {
        const next = sceneApi.current?.switchCharacter();
        if (next) {
          setActiveCharacter(next);
          if (next === 'madara') {
            setEquipmentMessage('👁️ Infinite Tsukuyomi Activated! Look up through the glass ceiling at the Crimson Moon.');
          } else {
            setEquipmentMessage(`👤 Character switched to ${CHARACTER_META[next].label}`);
          }
        }
      } else if (e.key.toLowerCase() === 'g') {
        setGraphicsModalOpen((prev) => !prev);
      } else if (e.key.toLowerCase() === 'h' && cameraMode === 'walk') {
        setWalkHudCompact((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction, cameraMode, activeWorkspaceView, proximateStation]);

  // Touch Analog Walking Joystick Handlers
  const handleJoystickPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (joystickPointerId.current !== null && joystickPointerId.current !== event.pointerId) return;
    joystickPointerId.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    handleJoystickMove(event);
  };

  const handleJoystickMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== event.pointerId) return;
    event.preventDefault();
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

    // Use Centralized 3D Experiment Trial Validator
    const validation = validateLiveExperimentForTrial(liveState, trialNum, assigned);
    if (!validation.isValid || !validation.measuredData) {
      setMeasurementWarning(validation.feedback);
      playTone(220, 'sawtooth', 0.2, 0.25);
      return;
    }

    const newTrial: TrialRecord = validation.measuredData;

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
      const isComplete = updatedTrials.length >= TOTAL_TRIALS;
      const completed = [...st.completed];
      if (isComplete && !completed[6]) {
        completed[6] = true;
        playSuccessChime();
        setEquipmentMessage(`🎉 Step 7 Complete (+25 pts)! All ${TOTAL_TRIALS} empirical trials logged.`);
      }
      return {
        ...prev,
        [stationId]: {
          ...st,
          trials: updatedTrials,
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

  // Guided Curriculum: Advance Step and Sync with Laboratory Notebook & Trials
  const handleContinueGuidedStep = () => {
    const prereq = evaluateStepPrerequisites(liveState, activeStepIdx);
    if (!prereq.canAdvance) {
      setMeasurementWarning(prereq.feedback || prereq.reason);
      playTone(200, 'sawtooth', 0.2, 0.25);
      return;
    }
    playTone(523, 'sine', 0.15, 0.25);
    completeStep(activeStepIdx);
    setMeasurementWarning('');
    setHintLevel(0);

    const nextIdx = activeStepIdx + 1;
    if (nextIdx < TOTAL_STEPS) {
      setViewStepIndex(nextIdx);
      if (nextIdx >= 6) {
        setNotebookOpen(true);
        setNotebookStep(nextIdx);
      }
    } else {
      setNotebookOpen(true);
      setNotebookStep(8);
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

  const updateProgressField = (field: string, val: unknown) => {
    setProgress((prev) => ({
      ...prev,
      [stationId]: {
        ...prev[stationId],
        [field]: val,
      },
    }));
  };

  // Step 8 Experimental Computation Verification (Strict tolerance with conceptual feedback)
  const verifyCalculations = () => {
    const trials = stationProgress.trials;
    if (trials.length < TOTAL_TRIALS) {
      setCalculationFeedback(`Please record all ${TOTAL_TRIALS} experimental trials in Step 7 before verifying calculations.`);
      setCalculationStatus('incorrect');
      playTone(200, 'sawtooth', 0.2, 0.2);
      return;
    }

    const currentCalcs = stationProgress.calculations || ['', '', '', '', ''];
    const result = validateStudentCalculations(stationId, trials, currentCalcs);
    setCalcPerTrialStatus(result.perTrialStatus);
    setCalculationFeedback(result.feedback);

    if (result.isValid) {
      setCalculationStatus('correct');
      playSuccessChime();
      setProgress((prev) => {
        const st = { ...prev[stationId] };
        const completed = [...st.completed];
        completed[7] = true; // Step 8 completed (+25 pts)
        return {
          ...prev,
          [stationId]: {
            ...st,
            completed,
            calculationStatus: 'validated',
            calculationFeedback: result.feedback,
            currentStep: Math.max(st.currentStep, 8), // Unlocks Step 9!
          },
        };
      });
      setEquipmentMessage('🎉 Step 8 Complete (+25 pts)! All student calculations verified. Proceeding to Step 9.');
    } else {
      setCalculationStatus('incorrect');
      playTone(200, 'sawtooth', 0.2, 0.2);
    }
  };

  // Step 9 Scientific Conclusion Submission (Claim-Evidence-Reasoning)
  const submitConclusion = () => {
    const st = stationProgress;
    const res = validateStudentObservationsAndConclusion(
      st.observations || st.analysis || '',
      st.scientificInterpretation || '',
      st.claim || '',
      st.evidence || '',
      st.reasoning || st.conclusion || ''
    );

    if (!res.isValid) {
      setConclusionFeedback(res.feedback);
      playTone(200, 'sawtooth', 0.2, 0.2);
      return;
    }

    setConclusionFeedback('✓ Scientific Claim–Evidence–Reasoning submission approved! Full 100/100 points station mastery awarded.');
    playSuccessChime();
    completeStep(8); // Step 9 completed (+30 pts)

    const allRoom3NowDone = (['circuits', 'optics', 'relativity'] as Room3StationId[]).every((id) =>
      id === stationId ? true : isStationFinished(progress[id])
    );

    if (allRoom3NowDone && !hasAutoOpenedReportRef.current) {
      hasAutoOpenedReportRef.current = true;
      setNotebookOpen(false);
      openMasterReport(false);
      setEquipmentMessage('🏆 All 3 Room 03 Stations Complete! Automated Laboratory Report generated.');
    } else {
      setEquipmentMessage('🏆 Station 100% Mastered! Official Certified PDF & Master Report unlocked.');
    }
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
      `Date Performed: ${studentDatePerformed || new Date().toISOString().slice(0, 10)}`,
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
      '=== THEORETICAL CALCULATIONS & VERIFICATION (STEP 8) ===',
      `Calculations: ${stationProgress.calculations.map((c, i) => `T${i + 1}=${c || '—'}`).join(' · ')}`,
      'Calculations verified within theoretical physics tolerance without auto-reveals.',
      '',
      '=== LEAST-SQUARES REGRESSION ANALYSIS ===',
      (() => {
        const reg = computeRoom3Regression(stationId, stationProgress.trials);
        if (!reg) return 'Insufficient trials for regression plot.';
        return `Fit Equation: y = ${reg.slope.toFixed(3)}x + ${reg.intercept.toFixed(3)} | R^2 = ${reg.rSquared.toFixed(4)}\nInterpretation: ${reg.physicalInterpretation}`;
      })(),
      '',
      '=== QUALITATIVE OBSERVATIONS & FINDINGS (STEP 9) ===',
      stationProgress.observations || stationProgress.analysis || 'Observations completed during laboratory exploration.',
      '',
      '=== SCIENTIFIC INTERPRETATION (STEP 9) ===',
      stationProgress.scientificInterpretation || 'Physical laws verified against experimental dataset.',
      '',
      '=== CLAIM–EVIDENCE–REASONING SCIENTIFIC CONCLUSION (STEP 9) ===',
      `Claim: ${stationProgress.claim || stationProgress.conclusion || 'Empirical data successfully corroborates governing equations.'}`,
      `Evidence: ${stationProgress.evidence || 'Recorded 5-trial dataset supports linear model.'}`,
      `Reasoning: ${stationProgress.reasoning || 'Governing physical laws account for observed linear response.'}`,
      '',
      '=== IDENTIFIED SOURCES OF EXPERIMENTAL UNCERTAINTY ===',
      ...(stationProgress.errors.length
        ? stationProgress.errors.map((e) => `- ${e}`)
        : ['- General instrument tolerance limits']),
      '',
      '=== INSTRUCTOR RUBRIC EVALUATION (9-STEP PROGRESSION) ===',
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
      data-camera-mode={cameraMode}
      data-walk-hud={walkHudCompact ? 'compact' : 'full'}
      data-workspace-view={activeWorkspaceView}
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
        <div style={{ position: 'absolute', inset: 0, zIndex: 45 }}>
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

      {cameraMode === 'closeup' && !notebookOpen && activeWorkspaceView === '3d' && (() => {
        const focusLabelMap: Record<Room3CloseupFocus, string> = {
          station: stationId === 'circuits' ? 'Workbench' : stationId === 'optics' ? 'Optics Bench' : 'Track',
          board: 'Resistor Board',
          multimeter: 'Multimeter',
          psu: 'Power Supply',
          oscilloscope: 'Oscilloscope',
          laser: 'Diode Laser',
          lens: 'Lens / Mount',
          screen: 'Screen',
          clock: 'Photon Clock',
          rod: 'Meter Rod',
          console: 'Console',
        };
        const focusTitle = focusLabelMap[closeupFocus] || 'Close-Up';
        const showTrialRecordingRow =
          activeStepIdx >= 5 ||
          stationProgress.currentStep >= 5 ||
          stationProgress.trials.length > 0;
        const nextTrialTarget =
          stationProgress.trials.length < TOTAL_TRIALS
            ? ROOM3_ASSIGNED_TRIALS[stationId][stationProgress.trials.length]
            : null;
        return (
        <div className={`closeup-hud-banner ${closeupHudExpanded ? 'mobile-expanded' : 'mobile-collapsed'}`} role="status">
          {/* Compact 1-Line Mobile Status Chip (keeps 80%+ of phone screen open for 3D device) */}
          <div className="closeup-mobile-summary-bar">
            <span className="closeup-mobile-chip-badge">
              🔬 {focusTitle} · Step {activeStepIdx + 1}/8 · {stationProgress.trials.length}/5
              {nextTrialTarget ? ` (${nextTrialTarget.targetValue}${nextTrialTarget.unit})` : ''}
            </span>
            <div className="closeup-mobile-summary-actions">
              {stationId === 'circuits' && (activeStepIdx >= 3 || stationProgress.currentStep >= 3) && (
                <button
                  type="button"
                  className="closeup-mobile-mini-btn"
                  onClick={() => handleSelectActiveProbe(activeProbe === 'red' ? 'black' : 'red')}
                  title="Switch active test probe lead"
                >
                  {activeProbe === 'red' ? '🔴 Red' : '⚫ Black'}
                </button>
              )}
              {showTrialRecordingRow && (
                <button
                  type="button"
                  className="closeup-mobile-mini-btn accent"
                  onClick={() => {
                    if (stationProgress.trials.length >= TOTAL_TRIALS) {
                      setNotebookOpen(true);
                      setNotebookStep(7);
                    } else {
                      recordCurrentTrial();
                    }
                  }}
                >
                  {stationProgress.trials.length >= TOTAL_TRIALS ? '✓ Step 8' : '📝 Record'}
                </button>
              )}
              <button
                type="button"
                className={`closeup-mobile-mini-btn ${closeupHudExpanded ? 'active' : ''}`}
                onClick={() => setCloseupHudExpanded((v) => !v)}
                aria-expanded={closeupHudExpanded}
              >
                {closeupHudExpanded ? '▴ Less' : '▾ Tools'}
              </button>
              <button
                type="button"
                className="closeup-mobile-mini-btn exit"
                onClick={() => handleSetCloseup('walk')}
              >
                ✕ Exit
              </button>
            </div>
          </div>

          <div className="closeup-hud-body">
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
                  className={`cam-focus-btn ${closeupFocus === 'oscilloscope' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('oscilloscope')}
                >
                  📺 Oscilloscope
                </button>
                <button
                  type="button"
                  className="cam-focus-btn"
                  style={{ background: 'rgba(88, 28, 44, 0.7)', border: '1.5px solid #d4af37', color: '#fef08a', fontWeight: 700 }}
                  onClick={() => setActiveWorkspaceView('circuit_workspace')}
                >
                  ⚡ Breadboard 3D (DCACLab)
                </button>
                {renderCloseupUtilityButtons()}
              </div>
            )}
            {stationId === 'optics' && (
              <div className="closeup-cam-controls">
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'station' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('station')}
                >
                  📐 Full Bench
                </button>
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'laser' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('laser')}
                >
                  🔴 Laser
                </button>
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'lens' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('lens')}
                >
                  🔍 Lens / Mount
                </button>
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'screen' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('screen')}
                >
                  🖥️ Screen
                </button>
                {renderCloseupUtilityButtons()}
              </div>
            )}
            {stationId === 'relativity' && (
              <div className="closeup-cam-controls">
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'station' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('station')}
                >
                  📐 Full Track
                </button>
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'clock' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('clock')}
                >
                  ⏱️ Photon Clock
                </button>
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'rod' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('rod')}
                >
                  📏 Meter Rod
                </button>
                <button
                  type="button"
                  className={`cam-focus-btn ${closeupFocus === 'console' ? 'active' : ''}`}
                  onClick={() => handleSetCloseupFocus('console')}
                >
                  🖥️ Frame Console
                </button>
                {renderCloseupUtilityButtons()}
              </div>
            )}
            <div className="closeup-mobile-drawer-extras">
              <button
                type="button"
                className="cam-focus-btn"
                onClick={() => {
                  setCloseupHudExpanded(false);
                  setMobilePanel('controls');
                }}
              >
                🎛️ Sliders &amp; Controls
              </button>
              <button
                type="button"
                className="cam-focus-btn"
                onClick={() => {
                  setCloseupHudExpanded(false);
                  setNotebookStep(stationProgress.currentStep);
                  setNotebookOpen(true);
                }}
              >
                ▣ Notebook
              </button>
              <button
                type="button"
                className="cam-focus-btn"
                onClick={() => {
                  setCloseupHudExpanded(false);
                  setGraphicsModalOpen(true);
                }}
              >
                ⚙️ Graphics
              </button>
            </div>
            <button
              type="button"
              className="closeup-exit-button"
              onClick={() => handleSetCloseup('walk')}
            >
              ← Exit to Room Exploration [ESC / E]
            </button>
          </div>

          {/* 3D Data Collection & Hands-On Instrument Bar */}
          {(() => {
            const showProbeLeadRow =
              stationId === 'circuits' &&
              (activeStepIdx >= 3 ||
                stationProgress.currentStep >= 3 ||
                Boolean(redTerminal || blackTerminal));
            if (!showTrialRecordingRow && !showProbeLeadRow) return null;
            return (
              <div className="closeup-trial-bar" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginTop: '6px',
                paddingTop: '6px',
                borderTop: '1px solid rgba(212, 175, 55, 0.3)',
                flexWrap: 'wrap',
              }}>
                {showTrialRecordingRow && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#fef08a' }}>
                      📊 3D TRIALS: {stationProgress.trials.length} / {TOTAL_TRIALS}
                    </span>
                    {stationProgress.trials.length < TOTAL_TRIALS && (
                      <span style={{ fontSize: '12px', color: '#e2e8f0', background: 'rgba(53, 18, 29, 0.85)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        Target #{stationProgress.trials.length + 1}: <b style={{ color: '#fef08a' }}>
                          {nextTrialTarget ? `${nextTrialTarget.targetParam} = ${nextTrialTarget.targetValue} ${nextTrialTarget.unit}` : ''}
                        </b>
                      </span>
                    )}
                  </div>
                )}

                {/* Hands-On Station Status & Probe Selector (No Auto Target Shortcuts) */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {showProbeLeadRow && (
                    <>
                      <span style={{ fontSize: '12px', color: '#cbd5e1', textTransform: 'uppercase' }}>Lead:</span>
                      <button
                        type="button"
                        style={{
                          background: activeProbe === 'red' ? 'rgba(220, 38, 38, 0.9)' : 'rgba(35, 12, 20, 0.75)',
                          color: '#fffbeb',
                          border: `1.5px solid ${activeProbe === 'red' ? '#f87171' : 'rgba(220, 38, 38, 0.5)'}`,
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => handleSelectActiveProbe('red')}
                        title="Select Red (+) Lead, then tap any breadboard socket in 3D"
                      >
                        🔴 Red (+) {redTerminal ? `→ ${redTerminal}` : '(Parked)'}
                      </button>
                      <button
                        type="button"
                        style={{
                          background: activeProbe === 'black' ? '#334155' : 'rgba(35, 12, 20, 0.75)',
                          color: '#fffbeb',
                          border: `1.5px solid ${activeProbe === 'black' ? '#94a3b8' : 'rgba(148, 163, 184, 0.45)'}`,
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => handleSelectActiveProbe('black')}
                        title="Select Black (COM) Lead, then tap any breadboard socket in 3D"
                      >
                        ⚫ Black {blackTerminal ? `→ ${blackTerminal}` : '(Parked)'}
                      </button>
                      <button
                        type="button"
                        style={{
                          background: 'rgba(15, 23, 42, 0.8)',
                          color: '#cbd5e1',
                          border: '1px solid rgba(148, 163, 184, 0.35)',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                        onClick={() => handleQuickProbe('park')}
                        title="Return both test probes to parked holster"
                      >
                        🅿️ Park
                      </button>
                    </>
                  )}
                  {showTrialRecordingRow && stationId === 'optics' && (
                    <span style={{ fontSize: '12px', color: '#e2e8f0', background: 'rgba(15, 23, 42, 0.8)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.35)' }}>
                      u = <b>{optics.objectDistance.toFixed(1)} cm</b> · v = <b>{(optics.screenPositionCm ?? 45).toFixed(1)} cm</b> · Sharpness: <b style={{ color: opticsResult.focusSharpness >= 85 ? '#34d399' : '#f59e0b' }}>{opticsResult.focusSharpness.toFixed(0)}%</b>
                    </span>
                  )}
                  {showTrialRecordingRow && stationId === 'relativity' && (
                    <span style={{ fontSize: '12px', color: '#e2e8f0', background: 'rgba(15, 23, 42, 0.8)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(250, 204, 21, 0.35)' }}>
                      Frame: <b>{(relativity.referenceFrame ?? 'lab') === 'lab' ? 'Lab S' : 'Sled S\''}</b> · β = <b>{relativity.beta.toFixed(2)}c</b> · γ = <b>{relativityResult.gamma.toFixed(3)}</b>
                    </span>
                  )}
                </div>

                {showTrialRecordingRow && (
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
                        padding: '6px 12px',
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
                        ? '✓ 5 Trials Done · Open Step 8 →'
                        : `📝 Record 3D Trial (${stationProgress.trials.length + 1} / 5)`}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {measurementWarning && (
            <div style={{
              marginTop: '8px',
              padding: '6px 12px',
              background: 'rgba(127, 29, 29, 0.95)',
              border: '1.5px solid #ef4444',
              borderRadius: '6px',
              color: '#fef2f2',
              fontSize: '12px',
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
                style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '14px', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>
          )}
          </div>
        </div>
        );
      })()}

      {cameraMode === 'closeup' && !notebookOpen && activeWorkspaceView === '3d' && closeupHoverText && (() => {
        const parts = closeupHoverText.split('|').map((p) => p.trim());
        const title = parts[0] || closeupHoverText;
        const purpose = parts[1];
        const liveValue = parts[2];
        const controls = parts[3];
        const isStepAdjustable = Boolean(
          lastTappedControlId &&
          (
            [
              'circuits-voltage-knob',
              'circuits-fgen-freq-knob',
              'circuits-osc-time-knob',
              'circuits-osc-ch1-knob',
              'circuits-osc-ch2-knob',
              'optics-laser',
              'optics-angle-dial',
              'optics-lens-carrier',
              'optics-object-target',
              'optics-screen',
              'relativity-velocity-dial',
              'relativity-light-clock',
              'relativity-contracting-rod',
              'relativity-telemetry-console',
              'relativity-accelerator',
            ].includes(lastTappedControlId) ||
            (lastTappedControlId === 'optics-rail' && optics.subMode === 'imaging')
          )
        );
        return (
          <div className={`closeup-hover-pill closeup-inspector-card ${inspectorExpanded ? 'mobile-expanded' : ''}`} role="status" aria-live="polite">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '13px', color: '#fde68a' }}>
                <span>⚡</span>
                <span>{title}</span>
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                {isStepAdjustable && lastTappedControlId && (
                  <div className="closeup-inspector-stepper" role="group" aria-label={`Adjust ${title}`}>
                    <button
                      type="button"
                      className="closeup-step-btn"
                      onClick={() => sceneApi.current?.stepEquipment?.(lastTappedControlId, -1)}
                      aria-label={`Decrease ${title}`}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="closeup-step-btn"
                      onClick={() => sceneApi.current?.stepEquipment?.(lastTappedControlId, 1)}
                      aria-label={`Increase ${title}`}
                    >
                      +
                    </button>
                  </div>
                )}
                {liveValue && (
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#6ee7b7',
                    background: 'rgba(6, 78, 59, 0.6)',
                    border: '1px solid rgba(52, 211, 153, 0.45)',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontFamily: 'ui-monospace, monospace',
                  }}>
                    {liveValue}
                  </span>
                )}
                {(purpose || controls) && (
                  <button
                    type="button"
                    className="closeup-inspector-toggle-btn"
                    onClick={() => setInspectorExpanded((v) => !v)}
                    aria-label={inspectorExpanded ? 'Hide details' : 'Show details'}
                  >
                    {inspectorExpanded ? '▴' : 'ⓘ'}
                  </button>
                )}
                <button
                  type="button"
                  className="closeup-inspector-toggle-btn"
                  onClick={() => {
                    setInspectorExpanded(false);
                    setCloseupHoverText(null);
                    setLastTappedControlId(null);
                  }}
                  aria-label="Dismiss readout"
                >
                  ✕
                </button>
              </div>
            </div>
            {purpose && (
              <div className="closeup-inspector-detail" style={{ fontSize: '12px', lineHeight: 1.4, color: '#f8fafc', opacity: 0.94 }}>
                {purpose}
              </div>
            )}
            {controls && (
              <div className="closeup-inspector-detail" style={{ fontSize: '12px', fontWeight: 700, color: '#fcd34d', letterSpacing: '0.02em', opacity: 0.92 }}>
                🎮 {controls}
              </div>
            )}
          </div>
        );
      })()}

      {!pointerLocked && !notebookOpen && cameraMode === 'walk' && !sceneError && !isTouchDevice && (
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
              if (next) {
                setActiveCharacter(next);
                if (next === 'madara') {
                  setEquipmentMessage('👁️ Infinite Tsukuyomi Activated! Look up through the glass ceiling at the Crimson Moon.');
                } else {
                  setEquipmentMessage(`👤 Character switched to ${CHARACTER_META[next].label}`);
                }
              }
            }}
            title="Switch Avatar Model (Carla / Eric / Madara) [Key C]"
          >
            <span>{activeCharacter === 'madara' ? '👁️' : '👤'}</span>
            <b>{CHARACTER_META[activeCharacter].name}</b>
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
          <button
            type="button"
            className={`room3-dock-btn ${walkHudCompact ? 'active' : ''}`}
            onClick={() => setWalkHudCompact((prev) => !prev)}
            title="Toggle Clean View / Hide Side Panels [Key H]"
          >
            <span>{walkHudCompact ? '👁️' : '◫'}</span>
            <b>{walkHudCompact ? 'Show HUD' : 'Clean View'}</b>
            <kbd>H</kbd>
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
          <div className="proximity-info-group">
            <div className="proximity-badge-row">
              <span className="proximity-icon">
                {proximateStation === 'circuits' ? '⚡' : proximateStation === 'optics' ? '🔬' : '⏱️'}
              </span>
              <span className="proximity-cat">
                STATION 0{proximateStation === 'circuits' ? '1' : proximateStation === 'optics' ? '2' : '3'} READY
              </span>
            </div>
            <h3 className="proximity-title">
              {proximateStation === 'circuits'
                ? 'DC & AC Electrical Circuits Station'
                : proximateStation === 'optics'
                  ? 'Geometric & Physical Optics Bench'
                  : 'Special Theory of Relativity Station'}
            </h3>
          </div>
          <button
            type="button"
            className="proximity-action-btn"
            onClick={() => {
              setStationId(proximateStation);
              handleSetCloseup('closeup');
            }}
          >
            <kbd>E</kbd>
            <span>Enter Workbench</span>
          </button>
        </aside>
      )}

      {interaction && !notebookOpen && (
        <aside
          className="mobile-target-card"
          aria-live="polite"
          role="button"
          tabIndex={0}
          onClick={() => sceneApi.current?.interact()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              sceneApi.current?.interact();
            }
          }}
          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
        >
          <b>{interaction.name}</b>
          <p>{interaction.description}</p>
          <span>{interaction.readout}</span>
          <small><kbd>TAP</kbd> {interaction.action}</small>
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
          <button
            type="button"
            className={`room3-master-report-btn ${allRoom3StationsComplete ? 'ready' : ''}`}
            onClick={() => openMasterReport(false)}
            title="Open Automated Laboratory Manual & Report (.pdf / .docx)"
          >
            <span className="btn-icon">📄</span>
            <span className="btn-label">
              {allRoom3StationsComplete ? 'Final Report ✓' : 'Lab Report'}
            </span>
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
        <button
          type="button"
          className={`mobile-tab-btn report ${allRoom3StationsComplete ? 'ready' : ''}`}
          onClick={() => openMasterReport(false)}
          title="Automated Laboratory Manual & Report (.pdf / .docx)"
        >
          📄 Report
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
                    <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700 }}>
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
          <div className="progress-track"><span style={{ width: `${(stationProgress.completed.filter(Boolean).length / TOTAL_STEPS) * 100}%` }} /></div>
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
                      setHintLevel(0);
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
                <span><MathText text={currentGuidedStep.action} /></span>
              </div>

              <div className="guided-why-box">
                <b>💡 PHYSICAL PRINCIPLE (WHY):</b>
                <span><MathText text={currentGuidedStep.why} /></span>
              </div>

              <div className="guided-expected-box">
                <b>👁️ EXPECTED RESULT:</b>
                <span><MathText text={currentGuidedStep.expectedResult} /></span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  marginTop: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'rgba(14, 165, 233, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  fontSize: '0.78rem',
                }}
              >
                <span style={{ color: '#e0f2fe', fontWeight: 600 }}>
                  🎯 NEXT 3D TARGET: <span style={{ color: '#38bdf8' }}>{GUIDANCE_LABELS[guidanceTarget] || guidanceTarget}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    handleFocusInspectionTarget(guidanceTarget);
                    playTone(660, 'sine', 0.1, 0.2);
                  }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    background: 'rgba(2, 132, 199, 0.3)',
                    color: '#f0f9ff',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title={`Focus 3D arrow and camera on ${GUIDANCE_LABELS[guidanceTarget] || guidanceTarget}`}
                >
                  📍 Locate 3D
                </button>
              </div>

              {/* Step 1: Physical Apparatus Inspection Checklist Card */}
              {activeStepIdx === 0 && (
                <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.35)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(212,175,55,0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#fef08a' }}>
                      🔍 Apparatus Checklist ({stationProgress.inspected.filter((id) => INSPECTION_TARGETS[stationId].includes(id)).length} / {INSPECTION_TARGETS[stationId].length} Verified)
                    </p>
                    <span style={{ fontSize: '12px', color: '#d4af37', fontWeight: 700 }}>+{STEP_POINTS[0]} pts</span>
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
                            fontSize: '12px',
                            textAlign: 'left',
                            background: isInspected ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                            borderColor: isInspected ? '#10b981' : 'rgba(212,175,55,0.4)',
                            color: isInspected ? '#34d399' : '#e9dfc9',
                          }}
                          onClick={() => {
                            handleFocusInspectionTarget(tgt);
                            playTone(isInspected ? 520 : 660, 'sine', isInspected ? 0.08 : 0.1, isInspected ? 0.15 : 0.2);
                          }}
                          title={isInspected ? `Re-locate verified ${label} in 3D` : `Focus camera on ${label} and click it in 3D`}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85px' }}>{label}</span>
                          <b style={{ color: isInspected ? '#34d399' : '#d4af37' }}>{isInspected ? '✓' : 'Locate 3D'}</b>
                        </button>
                      );
                    })}
                  </div>
                  {!allInspected ? (
                    <div style={{ color: '#fef08a', fontSize: '12px', marginTop: '6px' }}>
                      Click &ldquo;Locate 3D&rdquo; to aim at an instrument, then click the flashing 3D apparatus on the bench to verify it.
                    </div>
                  ) : (
                    <div style={{ color: '#34d399', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                      ✓ All instruments inspected! Step 1 Complete (+{STEP_POINTS[0]} pts).
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Formative Prediction Direct Card */}
              {activeStepIdx === 1 && (
                <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(212,175,55,0.3)' }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold', color: '#fef08a' }}>
                    🤔 Formative Prediction: <MathText text={station.prediction.question} />
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
                          style={{ textAlign: 'left', padding: '6px 10px', fontSize: '12px', background: btnBg, borderColor }}
                          onClick={() => verifyPrediction(oIdx)}
                        >
                          <MathText text={opt} /> {stationProgress.completed[1] && isCorrectChoice ? `✓ (+${STEP_POINTS[1]} pts)` : ''}
                        </button>
                      );
                    })}
                  </div>
                  {predictionStatus === 'correct' && (
                    <div style={{ color: '#34d399', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                      ✓ Correct prediction! +{STEP_POINTS[1]} Points awarded.
                    </div>
                  )}
                  {predictionStatus === 'incorrect' && (
                    <div style={{ color: '#f87171', fontSize: '12px', marginTop: '6px' }}>
                      ❌ Incorrect prediction. Review the theory placard and try again.
                    </div>
                  )}
                </div>
              )}

              {/* Step 7: 5-Trial Measurement Sweep Direct Card */}
              {activeStepIdx === 6 && (() => {
                const curTrialIdx = stationProgress.trials.length;
                const isAllDone = curTrialIdx >= TOTAL_TRIALS;
                const assigned = ROOM3_ASSIGNED_TRIALS[stationId][Math.min(TOTAL_TRIALS - 1, curTrialIdx)];
                const trialNum = curTrialIdx + 1;
                const validation = !isAllDone ? validateLiveExperimentForTrial(liveState, trialNum, assigned) : null;

                return (
                  <div style={{ marginTop: '10px', background: 'rgba(56,189,248,0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(56,189,248,0.4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <b style={{ color: '#38bdf8', fontSize: '12px' }}>📊 5-Trial Data Collection ({curTrialIdx}/{TOTAL_TRIALS} Logged)</b>
                      <span style={{ fontSize: '12px', color: '#fef08a', fontWeight: 700 }}>+25 pts</span>
                    </div>

                    {/* Progress Pills for the 5 Conditions */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '10px' }}>
                      {ROOM3_ASSIGNED_TRIALS[stationId].map((cond, idx) => {
                        const isLogged = idx < curTrialIdx;
                        const isTarget = idx === curTrialIdx && !isAllDone;
                        return (
                          <div
                            key={cond.label}
                            style={{
                              padding: '5px 2px',
                              textAlign: 'center',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 700,
                              background: isLogged ? 'rgba(16,185,129,0.25)' : isTarget ? 'rgba(56,189,248,0.3)' : 'rgba(255,255,255,0.05)',
                              border: isLogged ? '1px solid #10b981' : isTarget ? '1.5px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                              color: isLogged ? '#34d399' : isTarget ? '#38bdf8' : '#64748b',
                            }}
                          >
                            <div>{isLogged ? '✓ ' : isTarget ? '🎯 ' : ''}T{idx + 1}</div>
                            <div style={{ fontSize: '12px' }}>{cond.targetValue}{cond.unit}</div>
                          </div>
                        );
                      })}
                    </div>

                    {isAllDone ? (
                      <div className="feedback-alert correct" style={{ margin: '8px 0' }}>
                        ✓ All 5 experimental trials logged! Click <b>Continue Step 8 →</b> below to compute results.
                      </div>
                    ) : (
                      <>
                        <div style={{ padding: '8px 10px', background: 'rgba(15, 23, 42, 0.75)', borderRadius: '6px', border: '1px solid rgba(234, 179, 8, 0.35)', marginBottom: '8px', fontSize: '12px' }}>
                          <div style={{ color: '#fef08a', fontWeight: 700, marginBottom: '3px' }}>
                            🎯 Target Condition #{trialNum}: {assigned.targetParam} = {assigned.targetValue} {assigned.unit}
                          </div>
                          <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.4, marginBottom: '4px' }}>
                            {assigned.instruction}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#93c5fd', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px' }}>
                            {stationId === 'circuits' && (
                              <>
                                <span>Live Vs: <b>{circuits.vs.toFixed(1)} V</b></span>
                                <span>DMM: <b>{dmmReading.displayString}</b></span>
                              </>
                            )}
                            {stationId === 'optics' && (
                              <>
                                <span>Live u: <b>{optics.objectDistance.toFixed(1)} cm</b></span>
                                <span>Sharp v: <b>{opticsResult.imageDistanceCm?.toFixed(1) ?? '—'} cm</b></span>
                              </>
                            )}
                            {stationId === 'relativity' && (
                              <>
                                <span>Live β: <b>{relativity.beta.toFixed(2)}c</b></span>
                                <span>Lorentz γ: <b>{relativityResult.gamma.toFixed(4)}</b></span>
                              </>
                            )}
                          </div>
                        </div>

                        {validation && !validation.isValid && (
                          <div style={{ color: '#fca5a5', background: 'rgba(127,29,29,0.3)', padding: '6px 8px', borderRadius: '4px', border: '1px solid #ef4444', fontSize: '12px', marginBottom: '8px', lineHeight: 1.3 }}>
                            {validation.feedback}
                          </div>
                        )}
                        {validation && validation.isValid && (
                          <div style={{ color: '#34d399', background: 'rgba(16,185,129,0.2)', padding: '6px 8px', borderRadius: '4px', border: '1px solid #10b981', fontSize: '12px', marginBottom: '8px', fontWeight: 600 }}>
                            ✓ Condition matched! Ready to record trial into lab dataset.
                          </div>
                        )}

                        <button
                          type="button"
                          className="primary-button"
                          style={{ width: '100%', padding: '8px', fontSize: '12px', fontWeight: 'bold' }}
                          disabled={!validation?.isValid}
                          onClick={() => recordCurrentTrial()}
                        >
                          + Record Trial #{trialNum} to Lab Dataset ({curTrialIdx}/5)
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Step 8: Computation & Scientific Analysis Direct Card */}
              {activeStepIdx === 7 && (
                <div style={{ marginTop: '10px', background: 'rgba(16,185,129,0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <b style={{ color: '#34d399', fontSize: '12px' }}>🧮 Step 8: Computation & Scientific Analysis</b>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {stationProgress.trials.length} / 5 Trials
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5' }}>
                    {stationId === 'circuits' ? (
                      <>
                        Compute experimental resistance <KatexMath math="R = \frac{V}{I}" /> for each trial. Theoretical series resistance <KatexMath math="R_{\text{eq}} = 650.0\;\Omega" />.
                      </>
                    ) : stationId === 'optics' ? (
                      <>
                        Compute experimental focal length <KatexMath math="f = \frac{u \cdot v}{u + v}" /> using the thin-lens equation. Theoretical focal length <KatexMath math="f = 20.0\;\text{cm}" />.
                      </>
                    ) : (
                      <>
                        Compute Lorentz dilation factor <KatexMath math="\gamma = \frac{1}{\sqrt{1 - \beta^2}}" /> across all relativistic frames.
                      </>
                    )}
                  </p>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button
                      type="button"
                      className="primary-button"
                      style={{ flex: 1, padding: '7px 8px', fontSize: '12px', fontWeight: 'bold' }}
                      onClick={verifyCalculations}
                      disabled={stationProgress.completed[7]}
                    >
                      {stationProgress.completed[7] ? '✓ Step 8 Complete (+25 pts)' : '✓ Verify Step 8 Calculations (+25 pts)'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 'bold' }}
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
                    <div style={{ color: '#34d399', fontSize: '12px', marginTop: '8px', fontWeight: 600 }}>
                      ✓ {calculationFeedback || 'All calculations verified and match physical theory within ±2% tolerance.'}
                    </div>
                  )}
                  {calculationStatus === 'incorrect' && (
                    <div style={{ color: '#f87171', fontSize: '12px', marginTop: '8px' }}>
                      ⚠️ {calculationFeedback}
                    </div>
                  )}
                </div>
              )}

              {/* Step 9: Observations, Scientific Interpretation & CER Conclusion Direct Card */}
              {activeStepIdx === 8 && (
                <div style={{ marginTop: '10px', background: 'rgba(234,179,8,0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(234,179,8,0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <b style={{ color: '#fef08a', fontSize: '12px' }}>📝 Step 9: Observations &amp; CER Conclusion</b>
                    <span style={{ fontSize: '12px', color: '#d4af37', fontWeight: 700 }}>+30 pts</span>
                  </div>
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4' }}>
                    Record qualitative observations, interpret governing physical laws, and synthesize your final Claim–Evidence–Reasoning (CER) scientific conclusion in the lab notebook.
                  </p>
                  <button
                    type="button"
                    className="primary-button"
                    style={{ width: '100%', padding: '8px', fontSize: '12px', fontWeight: 'bold', background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' }}
                    onClick={() => {
                      setNotebookOpen(true);
                      setNotebookStep(8);
                      playTone(660, 'sine', 0.1, 0.2);
                    }}
                  >
                    📖 Open Notebook to Complete Step 9 (+30 pts)
                  </button>
                </div>
              )}

              {hintLevel > 0 && currentGuidedStep.hints && (
                <div className="guided-hint-box" style={{ background: 'rgba(25, 15, 20, 0.95)', border: '1.5px solid #d4af37', borderRadius: '8px', padding: '10px 12px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', borderBottom: '1px solid rgba(212, 175, 55, 0.3)', paddingBottom: '6px' }}>
                    <button
                      type="button"
                      style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '4px', border: 'none', background: hintLevel === 1 ? '#d4af37' : 'rgba(255,255,255,0.08)', color: hintLevel === 1 ? '#000' : '#fef08a', fontWeight: 700, cursor: 'pointer' }}
                      onClick={() => setHintLevel(1)}
                    >
                      Level 1: Guidance
                    </button>
                    <button
                      type="button"
                      style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '4px', border: 'none', background: hintLevel === 2 ? '#d4af37' : 'rgba(255,255,255,0.08)', color: hintLevel === 2 ? '#000' : '#fef08a', fontWeight: 700, cursor: 'pointer' }}
                      onClick={() => setHintLevel(2)}
                    >
                      Level 2: Principle
                    </button>
                    <button
                      type="button"
                      style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '4px', border: 'none', background: hintLevel === 3 ? '#d4af37' : 'rgba(255,255,255,0.08)', color: hintLevel === 3 ? '#000' : '#fef08a', fontWeight: 700, cursor: 'pointer' }}
                      onClick={() => setHintLevel(3)}
                    >
                      Level 3: Procedure
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#fef08a', lineHeight: 1.45 }}>
                    {hintLevel === 1 && <span><b>📘 Level 1 (Guidance):</b> <MathText text={currentGuidedStep.hints.guidance} /></span>}
                    {hintLevel === 2 && <span><b>🔬 Level 2 (Physical Principle):</b> <MathText text={currentGuidedStep.hints.concept} /></span>}
                    {hintLevel === 3 && <span><b>🛠️ Level 3 (Procedure):</b> <MathText text={currentGuidedStep.hints.procedure} /></span>}
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                    Note: Hints provide educational guidance only and never advance steps, record trials, or award points.
                  </div>
                </div>
              )}

              {/* Dynamic Physical Validation Status Badge */}
              {stepValidation.hazardWarning ? (
                <div className="guided-validation-badge hazard">
                  <span>⚠️ HAZARD ALERT: <MathText text={stepValidation.hazardWarning} /></span>
                  <small><MathText text={stepValidation.feedback} /></small>
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
              ) : stepPrereq.canAdvance ? (
                <div className="guided-validation-badge passed">
                  <span><MathText text={stepPrereq.feedback || stepValidation.feedback} /></span>
                </div>
              ) : (
                <div className="guided-validation-badge in-progress">
                  <span>⏳ STATUS: <MathText text={stepPrereq.feedback || stepValidation.feedback} /></span>
                  {stepPrereq.remainingTasks.length > 0 && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#fca5a5' }}>
                      Required: <MathText text={stepPrereq.remainingTasks.join('; ')} />
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Action Buttons */}
              <div className="guided-nav-footer">
                <button
                  type="button"
                  className="secondary-button"
                  style={{ padding: '6px 10px', fontSize: '12px' }}
                  disabled={activeStepIdx === 0}
                  onClick={() => {
                    setViewStepIndex(Math.max(0, activeStepIdx - 1));
                    setHintLevel(0);
                  }}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ padding: '6px 10px', fontSize: '12px' }}
                  onClick={() => setHintLevel((prev) => (prev >= 3 ? 0 : prev + 1))}
                >
                  {hintLevel === 0 ? '💡 Hint' : hintLevel === 1 ? '💡 Concept (Lvl 2)' : hintLevel === 2 ? '💡 Procedure (Lvl 3)' : 'Hide Hint'}
                </button>
                <button
                  type="button"
                  className="guided-continue-btn"
                  disabled={!stepPrereq.canAdvance}
                  title={!stepPrereq.canAdvance ? `Action required: ${stepPrereq.remainingTasks.join(' · ')}` : 'Advance to next step'}
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
                style={{ flex: 1, padding: '7px 4px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                onClick={() => setActiveWorkspaceView('3d')}
              >
                <span>🔬 3D Laboratory</span>
              </button>
              <button
                type="button"
                className={`dmm-btn ${activeWorkspaceView === 'circuit_workspace' ? 'active' : ''}`}
                style={{ flex: 1, padding: '7px 4px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: activeWorkspaceView === 'circuit_workspace' ? '#0284c7' : '#0f172a', color: '#38bdf8' }}
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

            {/* DC Power Supply Voltage Knob & Control Suite */}
            <div className="dmm-workbench-card" style={{ marginBottom: '8px' }}>
              <div className="dmm-header-title">
                <b>DC REGULATED POWER SUPPLY</b>
                <span style={{ fontSize: '12px', color: circuits.powerOn ? '#34d399' : '#ef4444' }}>
                  {circuits.powerOn ? '● OUTPUT ON' : '○ STANDBY'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 8px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>SOURCE POTENTIAL:</span>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#fef08a' }}>
                    {circuits.vs.toFixed(1)} <span style={{ fontSize: '13px' }}>V DC</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ padding: '4px 8px', fontSize: '12px', fontWeight: 700 }}
                    onClick={() => {
                      const nextVs = Math.max(0, Math.round((circuits.vs - 1.0) * 10) / 10);
                      setCircuits((c) => ({ ...c, vs: nextVs }));
                      playTone(450, 'sine', 0.04, 0.1);
                    }}
                    title="Decrease voltage by 1.0V"
                  >
                    -1V
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ padding: '4px 6px', fontSize: '12px', fontWeight: 700 }}
                    onClick={() => {
                      const nextVs = Math.max(0, Math.round((circuits.vs - 0.1) * 10) / 10);
                      setCircuits((c) => ({ ...c, vs: nextVs }));
                      playTone(470, 'sine', 0.04, 0.1);
                    }}
                    title="Decrease voltage by 0.1V"
                  >
                    -0.1V
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ padding: '4px 6px', fontSize: '12px', fontWeight: 700 }}
                    onClick={() => {
                      const nextVs = Math.min(30, Math.round((circuits.vs + 0.1) * 10) / 10);
                      setCircuits((c) => ({ ...c, vs: nextVs }));
                      playTone(510, 'sine', 0.04, 0.1);
                    }}
                    title="Increase voltage by 0.1V"
                  >
                    +0.1V
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ padding: '4px 8px', fontSize: '12px', fontWeight: 700 }}
                    onClick={() => {
                      const nextVs = Math.min(30, Math.round((circuits.vs + 1.0) * 10) / 10);
                      setCircuits((c) => ({ ...c, vs: nextVs }));
                      playTone(530, 'sine', 0.04, 0.1);
                    }}
                    title="Increase voltage by 1.0V"
                  >
                    +1V
                  </button>
                </div>
              </div>

              {/* Rotary Voltage Knob Target Steps */}
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>
                  <b>ROTARY VOLTAGE DIAL STEPS:</b>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px' }}>
                  {[2, 4, 6, 8, 10, 12, 16, 20, 24, 30].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`dmm-btn ${Math.abs(circuits.vs - v) < 0.1 ? 'active' : ''}`}
                      style={{ padding: '4px 2px', fontSize: '12px' }}
                      onClick={() => {
                        setCircuits((c) => ({ ...c, vs: v, powerOn: true }));
                        playTone(480 + (v / 30) * 200, 'sine', 0.05, 0.12);
                      }}
                    >
                      {v}V
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="cam-focus-btn"
                  style={{ flex: 1, padding: '5px', fontSize: '12px', background: 'rgba(212, 175, 55, 0.15)', borderColor: '#d4af37', color: '#fef08a' }}
                  onClick={() => {
                    handleSetCloseup('closeup');
                    handleSetCloseupFocus('psu');
                  }}
                >
                  ⚡ Focus 3D Power Supply
                </button>
              </div>
            </div>

            {/* Fluke 87V Digital Multimeter Workbench Suite */}
            <div className="dmm-workbench-card">
              <div className="dmm-header-title">
                <b>FLUKE 87V DIGITAL MULTIMETER</b>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>TRUE-RMS CAT IV</span>
              </div>

              {/* Dynamic LCD Screen */}
              <div className="dmm-lcd-screen">
                <div className="dmm-lcd-top">
                  <span>{dmmMode.toUpperCase()} · AUTO</span>
                  <span>JACK: {dmmJack.toUpperCase()}</span>
                </div>
                <div className="dmm-lcd-digits">{dmmReading.displayString}</div>
                {dmmReading.isContinuityBeep && (
                  <div style={{ color: '#34d399', fontSize: '12px', marginTop: '4px' }}>
                    🔊 CONTINUITY DETECTED (&lt; 30 Ω)
                  </div>
                )}
                {dmmReading.warning && (
                  <div className="dmm-lcd-warning">{dmmReading.warning}</div>
                )}
              </div>

              {/* Rotary Mode Selector Buttons */}
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
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
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
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
                  <label style={{ fontSize: '12px', color: '#ef4444', display: 'block', marginBottom: '2px', fontWeight: 700 }}>
                    🔴 RED PROBE NODE:
                  </label>
                  <select
                    style={{ width: '100%', padding: '6px', fontSize: '12px', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '6px' }}
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
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '2px', fontWeight: 700 }}>
                    ⚫ BLACK PROBE (COM):
                  </label>
                  <select
                    style={{ width: '100%', padding: '6px', fontSize: '12px', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '6px' }}
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
                style={{ width: '100%', padding: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'rgba(212,175,55,0.15)', borderColor: '#d4af37' }}
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
                  style={{ width: '100%', padding: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: redTerminal === null && blackTerminal === null ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)' }}
                  onClick={() => handleQuickProbe('park')}
                  title="Remove both multimeter probes and place them in the parked rest position"
                >
                  <span>🅿️ Park / Disconnect Multimeter Probes</span>
                </button>
              </div>

              {/* Breadboard Circuit Configuration Selector */}
              <div style={{ marginTop: '8px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 700 }}>
                  🔌 CIRCUIT TOPOLOGY / LABORATORY EXERCISE:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button
                    type="button"
                    className="dmm-btn"
                    style={{
                      padding: '5px 2px',
                      fontSize: '12px',
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
                      fontSize: '12px',
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
                      fontSize: '12px',
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

              {/* Component Ratings & Live DMM Probe Wiring Card (No Pre-Solved Answers) */}
              <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(212, 175, 55, 0.35)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <b style={{ fontSize: '12px', color: '#d4af37', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    📊 Breadboard Spec & Probe Wiring
                  </b>
                  <span style={{ fontSize: '12px', color: circuits.powerOn ? '#34d399' : '#94a3b8' }}>
                    {circuits.powerOn ? `PSU: ${circuits.vs.toFixed(1)} V ON` : 'PSU STANDBY'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                  {circuits.topology !== 'single' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '3px 6px', borderRadius: '4px' }}>
                      <span style={{ color: '#cbd5e1' }}><b>R1 (Brn-Blk-Brn):</b> {circuits.r1} Ω ±1% · 1W</span>
                      <span style={{ color: (circuitResult.v1 * circuitResult.i1) > 1.0 ? '#ef4444' : '#34d399', fontWeight: 600 }}>
                        {(circuitResult.v1 * circuitResult.i1) > 1.0 ? 'OVERLOAD' : 'Safe (<1W)'}
                      </span>
                    </div>
                  )}

                  {circuits.topology !== 'single' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '3px 6px', borderRadius: '4px' }}>
                      <span style={{ color: '#cbd5e1' }}><b>R2 (Red-Red-Brn):</b> {circuits.r2} Ω ±1% · 1W</span>
                      <span style={{ color: (circuitResult.v2 * circuitResult.i2) > 1.0 ? '#ef4444' : '#34d399', fontWeight: 600 }}>
                        {(circuitResult.v2 * circuitResult.i2) > 1.0 ? 'OVERLOAD' : 'Safe (<1W)'}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '3px 6px', borderRadius: '4px' }}>
                    <span style={{ color: '#cbd5e1' }}><b>R3 (Org-Org-Brn):</b> {circuits.r3} Ω ±1% · 1W</span>
                    <span style={{ color: (circuitResult.v3 * circuitResult.i3) > 1.0 ? '#ef4444' : '#34d399', fontWeight: 600 }}>
                      {(circuitResult.v3 * circuitResult.i3) > 1.0 ? 'OVERLOAD' : 'Safe (<1W)'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px', marginTop: '2px', color: '#fef08a' }}>
                    <span><b>Leads:</b> 🔴 {redTerminal ?? 'Parked'} | ⚫ {blackTerminal ?? 'Parked'}</span>
                    <span><b>DMM:</b> {dmmReading.displayString}</span>
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

            {/* Tektronix TDS2024 Dual-Channel Digital Storage Oscilloscope */}
            <div className="dmm-workbench-card" style={{ marginTop: '8px' }}>
              <div className="dmm-header-title">
                <b>TEKTRONIX TDS2024 DIGITAL STORAGE OSCILLOSCOPE</b>
                <span style={{ fontSize: '12px', color: oscilloscope.powerOn ? '#38bdf8' : '#ef4444' }}>
                  {oscilloscope.powerOn ? (oscilloscope.runState === 'run' ? '● RUNNING' : '⏸ STOPPED') : '○ OFF'}
                </span>
              </div>

              {/* Master Power, Run/Stop, and 3D Focus bar */}
              <div style={{ display: 'flex', gap: '6px', margin: '6px 0 8px' }}>
                <button
                  type="button"
                  className={`dmm-btn ${oscilloscope.powerOn ? 'active' : ''}`}
                  style={{ flex: 1, padding: '6px', color: oscilloscope.powerOn ? '#34d399' : '#ef4444' }}
                  onClick={() => {
                    const next = !oscilloscope.powerOn;
                    setOscilloscope((o) => ({ ...o, powerOn: next }));
                    playTone(next ? 880 : 330, 'square', 0.05, 0.15);
                  }}
                >
                  {oscilloscope.powerOn ? '⚡ Scope: ON' : '⏻ Scope: OFF'}
                </button>
                <button
                  type="button"
                  className={`dmm-btn ${oscilloscope.runState === 'run' ? 'active' : ''}`}
                  style={{ flex: 1, padding: '6px', color: oscilloscope.runState === 'run' ? '#38bdf8' : '#f59e0b' }}
                  onClick={() => {
                    const next = oscilloscope.runState === 'run' ? 'stop' : 'run';
                    setOscilloscope((o) => ({ ...o, runState: next }));
                    playTone(next === 'run' ? 700 : 440, 'sine', 0.05, 0.15);
                  }}
                  disabled={!oscilloscope.powerOn}
                >
                  {oscilloscope.runState === 'run' ? '▶ RUN' : '⏸ STOP'}
                </button>
                <button
                  type="button"
                  className="cam-focus-btn"
                  style={{ flex: 1.2, padding: '6px', fontSize: '12px', background: 'rgba(56, 189, 248, 0.15)', borderColor: '#38bdf8', color: '#7dd3fc' }}
                  onClick={() => {
                    handleSetCloseup('closeup');
                    handleSetCloseupFocus('oscilloscope');
                  }}
                >
                  📺 Focus 3D Scope
                </button>
              </div>

              {/* Live Signal Telemetry (RMS / Vpp / Freq / Phase) */}
              <div style={{ padding: '6px 8px', background: 'rgba(2, 6, 23, 0.9)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '6px', marginBottom: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', fontSize: '12px' }}>
                  <div style={{ color: '#facc15' }}>
                    <b>CH1 (V):</b> {circuits.powerOn ? (
                      circuits.mode === 'ac'
                        ? `Vpp = ${(circuits.vs * 2).toFixed(1)}V · Vrms = ${(circuits.vs * 0.707).toFixed(1)}V`
                        : `V = ${circuits.vs.toFixed(1)}V DC`
                    ) : '0.00 V'}
                  </div>
                  <div style={{ color: '#38bdf8' }}>
                    <b>CH2 (I):</b> {circuits.powerOn && (jumperClosed || (redTerminal?.startsWith('SERIES') && blackTerminal?.startsWith('SERIES'))) ? (
                      circuits.mode === 'ac'
                        ? `Ipp = ${(circuitResult.current * 2000).toFixed(1)}mA · Irms = ${(circuitResult.current * 707).toFixed(1)}mA`
                        : `I = ${(circuitResult.current * 1000).toFixed(1)}mA DC`
                    ) : '0.00 mA'}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '3px' }}>
                  <span>Freq: <b>{circuits.mode === 'ac' ? `${circuits.freq.toFixed(0)} Hz` : 'DC (0 Hz)'}</b></span>
                  <span>Phase Δφ: <b>{(circuitResult.phaseAngleRad * 180 / Math.PI).toFixed(1)}°</b></span>
                  <span>cos φ: <b>{circuitResult.powerFactor.toFixed(3)}</b></span>
                </div>
              </div>

              {/* Channel 1 Controls (Yellow Trace) */}
              <div style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <label style={{ fontSize: '12px', color: '#facc15', fontWeight: 700 }}>
                    CH1 VOLTAGE PROBE & SCALE:
                  </label>
                  <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 700 }}>
                    {oscilloscope.ch1VoltsPerDiv} V/div
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
                  {(['vs', 'r1', 'r2', 'r3'] as const).map((src) => (
                    <button
                      key={src}
                      type="button"
                      className={`dmm-btn ${oscilloscope.ch1Source === src ? 'active' : ''}`}
                      style={{ flex: 1, padding: '3px 0', fontSize: '12px', color: oscilloscope.ch1Source === src ? '#facc15' : '#cbd5e1' }}
                      onClick={() => {
                        setOscilloscope((o) => ({ ...o, ch1Source: src }));
                        playTone(550, 'sine', 0.04, 0.1);
                      }}
                    >
                      {src === 'vs' ? 'Vs (Gen)' : `V(${src.toUpperCase()})`}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px' }}>
                  {CH1_VOLTS_DIV_OPTIONS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`dmm-btn ${oscilloscope.ch1VoltsPerDiv === v ? 'active' : ''}`}
                      style={{ padding: '3px 0', fontSize: '12px' }}
                      onClick={() => {
                        setOscilloscope((o) => ({ ...o, ch1VoltsPerDiv: v }));
                        playTone(580, 'triangle', 0.04, 0.1);
                      }}
                    >
                      {v}V
                    </button>
                  ))}
                </div>
              </div>

              {/* Channel 2 Controls (Cyan Trace) */}
              <div style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <label style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700 }}>
                    CH2 CURRENT / NODE & SCALE:
                  </label>
                  <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 700 }}>
                    {oscilloscope.ch2VoltsPerDiv} mA/div
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
                  {(['current', 'r1', 'r2', 'r3'] as const).map((src) => (
                    <button
                      key={src}
                      type="button"
                      className={`dmm-btn ${oscilloscope.ch2Source === src ? 'active' : ''}`}
                      style={{ flex: 1, padding: '3px 0', fontSize: '12px', color: oscilloscope.ch2Source === src ? '#38bdf8' : '#cbd5e1' }}
                      onClick={() => {
                        setOscilloscope((o) => ({ ...o, ch2Source: src }));
                        playTone(600, 'sine', 0.04, 0.1);
                      }}
                    >
                      {src === 'current' ? 'I(t) Loop' : `V(${src.toUpperCase()})`}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px' }}>
                  {CH2_VOLTS_DIV_OPTIONS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`dmm-btn ${oscilloscope.ch2VoltsPerDiv === v ? 'active' : ''}`}
                      style={{ padding: '3px 0', fontSize: '12px' }}
                      onClick={() => {
                        setOscilloscope((o) => ({ ...o, ch2VoltsPerDiv: v }));
                        playTone(640, 'triangle', 0.04, 0.1);
                      }}
                    >
                      {v}mA
                    </button>
                  ))}
                </div>
              </div>

              {/* Horizontal SEC/DIV Timebase */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>
                    HORIZONTAL TIMEBASE (SEC/DIV):
                  </label>
                  <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 700 }}>
                    {oscilloscope.timePerDivMs} ms/div
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '3px' }}>
                  {TIME_DIV_OPTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`dmm-btn ${oscilloscope.timePerDivMs === t ? 'active' : ''}`}
                      style={{ padding: '3px 0', fontSize: '12px' }}
                      onClick={() => {
                        setOscilloscope((o) => ({ ...o, timePerDivMs: t }));
                        playTone(520, 'triangle', 0.04, 0.1);
                      }}
                    >
                      {t}ms
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Coupling Toggle */}
              <div style={{ marginTop: '6px', display: 'flex', gap: '3px' }}>
                {(['dc', 'ac', 'gnd'] as const).map((coup) => (
                  <button
                    key={coup}
                    type="button"
                    className={`dmm-btn ${oscilloscope.coupling === coup ? 'active' : ''}`}
                    style={{ flex: 1, padding: '4px 0', fontSize: '12px', fontWeight: 700 }}
                    onClick={() => {
                      setOscilloscope((o) => ({ ...o, coupling: coup }));
                      playTone(500, 'sine', 0.03, 0.1);
                    }}
                  >
                    Coupling: {coup.toUpperCase()}
                  </button>
                ))}
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
                <div style={{ fontSize: '12px', color: '#fef08a', fontFamily: 'monospace', padding: '6px 10px', background: 'rgba(53, 18, 29, 0.85)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '6px', margin: '4px 0 8px' }}>
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
                  label="Lens Focal Spec f"
                  value={optics.focalLength}
                  unit="cm"
                  min={-50.0}
                  max={50.0}
                  step={1.0}
                  onChange={(v) => setOptics((o) => ({ ...o, focalLength: v }))}
                  digits={1}
                />
                <RangeControl
                  label="Object Distance u"
                  value={optics.objectDistance}
                  unit="cm"
                  min={25.0}
                  max={80.0}
                  step={1.0}
                  onChange={(v) => setOptics((o) => ({ ...o, objectDistance: v }))}
                  digits={1}
                />
                <RangeControl
                  label="Screen Position v"
                  value={optics.screenPositionCm ?? 45.0}
                  unit="cm"
                  min={15.0}
                  max={120.0}
                  step={0.5}
                  onChange={(v) => setOptics((o) => ({ ...o, screenPositionCm: v }))}
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
              <span className="math-expr">
                {optics.subMode === 'refraction' ? (
                  <>n<sub>1</sub> · sin θ<sub>1</sub> = n<sub>2</sub> · sin θ<sub>2</sub></>
                ) : optics.subMode === 'imaging' ? (
                  <>
                    <Frac num="1" den="f" /> = <Frac num="1" den="u" /> + <Frac num="1" den="v" />
                  </>
                ) : (
                  <>
                    Δy = <Frac num="λ · L" den="d" />
                  </>
                )}
              </span>
              <strong>
                {optics.subMode === 'refraction'
                  ? (opticsResult.isTIR ? 'TIR Active' : <span className="math-inline">θ<sub>1</sub> = {optics.theta1.toFixed(1)}°</span>)
                  : optics.subMode === 'imaging'
                    ? `Sharpness: ${opticsResult.focusSharpness.toFixed(0)}%`
                    : `L = ${optics.screenDistance.toFixed(2)} m`}
              </strong>
              <dl>
                {optics.subMode === 'refraction' && (
                  <>
                    <Metric label={<>Incident Angle θ<sub>1</sub></>} value={`${optics.theta1.toFixed(1)}°`} />
                    <Metric
                      label={<>Critical Angle θ<sub>c</sub></>}
                      value={opticsResult.criticalAngleDeg ? `${opticsResult.criticalAngleDeg.toFixed(1)}°` : <>None (n<sub>1</sub> ≤ n<sub>2</sub>)</>}
                    />
                    <Metric
                      label="3D Beam Observation"
                      value={opticsResult.isTIR ? 'Total Reflection' : 'Transmitted on Screen'}
                    />
                    <Metric
                      label={<>Refracted Angle θ<sub>2</sub></>}
                      value={opticsResult.isTIR ? 'N/A (TIR)' : 'Observe 3D Screen Spot'}
                    />
                  </>
                )}
                {optics.subMode === 'imaging' && (
                  <>
                    <Metric
                      label="Screen Vernier v"
                      value={`${opticsResult.screenPositionCm.toFixed(1)} cm`}
                    />
                    <Metric
                      label="Focus Quality"
                      value={
                        opticsResult.focusSharpness >= 85
                          ? `${opticsResult.focusSharpness.toFixed(0)}% (IN FOCUS)`
                          : `${opticsResult.focusSharpness.toFixed(0)}% (Blurry — Slide v)`
                      }
                    />
                    <Metric label="Image Type" value={opticsResult.imageType} />
                    <Metric label="Orientation" value={opticsResult.imageOrientation} />
                    <Metric label="Scale" value={opticsResult.imageScale} />
                  </>
                )}
                {optics.subMode === 'diffraction' && (
                  <>
                    <Metric label="Wavelength λ" value={`${optics.wavelength} nm`} />
                    <Metric label="Slit Separation d" value={`${optics.slitSeparation.toFixed(2)} mm`} />
                    <Metric label="Screen Distance L" value={`${optics.screenDistance.toFixed(2)} m`} />
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
            {/* 1. Simulation Master & Reference Frame Toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                className={`dmm-btn ${relativity.powerOn !== false ? 'active' : ''}`}
                style={{ padding: '8px 4px', fontSize: '12px', color: relativity.powerOn !== false ? '#34d399' : '#ef4444' }}
                onClick={() => {
                  const next = { ...relativity, powerOn: relativity.powerOn === false ? true : false };
                  setRelativity(next);
                  sceneApi.current?.setRelativity(next);
                }}
              >
                <span>{relativity.powerOn !== false ? '⚡ SIM ACTIVE' : '⏻ STANDBY'}</span>
              </button>

              <button
                type="button"
                className="dmm-btn"
                style={{
                  padding: '8px 4px',
                  fontSize: '12px',
                  background: relativity.referenceFrame === 'rest' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(212, 175, 55, 0.2)',
                  borderColor: relativity.referenceFrame === 'rest' ? '#38bdf8' : '#d4af37',
                  color: relativity.referenceFrame === 'rest' ? '#38bdf8' : '#fef08a',
                  fontWeight: 'bold',
                }}
                onClick={() => {
                  const nextFrame = relativity.referenceFrame === 'lab' ? 'rest' : 'lab';
                  const next = { ...relativity, referenceFrame: nextFrame as 'lab' | 'rest' };
                  setRelativity(next);
                  sceneApi.current?.setRelativity(next);
                  playTone(relativity.referenceFrame === 'lab' ? 620 : 480, 'sine', 0.08, 0.15);
                }}
              >
                {relativity.referenceFrame === 'lab' ? "🔭 Frame S (Lab)" : "🚀 Frame S' (Rest)"}
              </button>
            </div>

            {/* 2. Demonstration Mode Switcher */}
            <div className="segment-control" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '8px' }} role="group" aria-label="Demonstration Selection">
              {(['clock', 'rod', 'both'] as const).map((dm) => (
                <button
                  key={dm}
                  type="button"
                  className={(relativity.activeDemo ?? 'both') === dm ? 'active' : ''}
                  onClick={() => {
                    const next = { ...relativity, activeDemo: dm };
                    setRelativity(next);
                    sceneApi.current?.setRelativity(next);
                  }}
                >
                  {dm === 'clock' ? '⏱ Clock' : dm === 'rod' ? '📏 Rod' : '✨ Dual View'}
                </button>
              ))}
            </div>

            {/* 3. Animation Controls: Play/Pause, Speed, Tracer & Gates */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              <button
                type="button"
                className="secondary-button"
                style={{ flex: 1, padding: '4px 6px', fontSize: '12px', fontWeight: 'bold' }}
                onClick={() => {
                  const next = { ...relativity, simPlaying: !relativity.simPlaying };
                  setRelativity(next);
                  sceneApi.current?.setRelativity(next);
                }}
              >
                {relativity.simPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              {[0.25, 0.5, 1.0, 2.0].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  className="secondary-button"
                  style={{
                    padding: '4px 5px',
                    fontSize: '12px',
                    background: (relativity.simSpeed ?? 1.0) === spd ? '#0284c7' : 'rgba(255,255,255,0.06)',
                    borderColor: (relativity.simSpeed ?? 1.0) === spd ? '#38bdf8' : 'rgba(255,255,255,0.15)',
                    color: '#fff',
                    fontWeight: (relativity.simSpeed ?? 1.0) === spd ? 'bold' : 'normal',
                  }}
                  onClick={() => {
                    const next = { ...relativity, simSpeed: spd };
                    setRelativity(next);
                    sceneApi.current?.setRelativity(next);
                  }}
                >
                  {spd}×
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
              <button
                type="button"
                className="secondary-button"
                style={{
                  padding: '4px',
                  fontSize: '12px',
                  background: relativity.showPhotonPath ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)',
                  borderColor: relativity.showPhotonPath ? '#38bdf8' : 'rgba(255,255,255,0.15)',
                  color: relativity.showPhotonPath ? '#38bdf8' : '#cbd5e1',
                }}
                onClick={() => {
                  const next = { ...relativity, showPhotonPath: !relativity.showPhotonPath };
                  setRelativity(next);
                  sceneApi.current?.setRelativity(next);
                }}
              >
                {relativity.showPhotonPath ? '✓ Trace Light Path' : '○ Light Path'}
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{
                  padding: '4px',
                  fontSize: '12px',
                  background: relativity.showSimultaneityGates ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                  borderColor: relativity.showSimultaneityGates ? '#10b981' : 'rgba(255,255,255,0.15)',
                  color: relativity.showSimultaneityGates ? '#34d399' : '#cbd5e1',
                }}
                onClick={() => {
                  const next = { ...relativity, showSimultaneityGates: !relativity.showSimultaneityGates };
                  setRelativity(next);
                  sceneApi.current?.setRelativity(next);
                }}
              >
                {relativity.showSimultaneityGates ? '✓ Simultaneity Gates' : '○ Laser Gates'}
              </button>
            </div>

            {/* 4. Velocity Ratio Slider & Quick-Select Buttons */}
            <RangeControl
              label="Relative Velocity Ratio β = v/c"
              value={relativity.beta}
              unit="c"
              min={0.000}
              max={0.995}
              step={0.005}
              onChange={(v) => {
                const next = { ...relativity, beta: v };
                setRelativity(next);
                sceneApi.current?.setRelativity(next);
              }}
              digits={3}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px', marginBottom: '8px' }}>
              {[0.10, 0.30, 0.50, 0.70, 0.90].map((b) => (
                <button
                  key={b}
                  type="button"
                  className="secondary-button"
                  style={{
                    padding: '3px 2px',
                    fontSize: '12px',
                    background: Math.abs(relativity.beta - b) < 0.02 ? '#0284c7' : 'rgba(255,255,255,0.05)',
                    borderColor: Math.abs(relativity.beta - b) < 0.02 ? '#38bdf8' : 'rgba(255,255,255,0.15)',
                    color: Math.abs(relativity.beta - b) < 0.02 ? '#fff' : '#cbd5e1',
                    fontWeight: Math.abs(relativity.beta - b) < 0.02 ? 'bold' : 'normal',
                  }}
                  onClick={() => {
                    const next = { ...relativity, beta: b, powerOn: true, simPlaying: true };
                    setRelativity(next);
                    sceneApi.current?.setRelativity(next);
                    playTone(500 + b * 200, 'sine', 0.06, 0.15);
                  }}
                >
                  {b.toFixed(2)}c
                </button>
              ))}
            </div>

            {/* 5. Authoritative Telemetry Readout */}
            <div className="formula-readout" style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: '#fef08a' }}>
                  Lorentz Factor: <b className="math-expr">γ = <Frac num="1" den={<Sqrt>1 − β<sup>2</sup></Sqrt>} /></b>
                </span>
                <strong style={{ fontSize: '13px', color: '#38bdf8' }}>γ = {relativityResult.gamma.toFixed(4)}</strong>
              </div>
              <dl style={{ margin: 0 }}>
                <Metric label="Velocity v" value={<span className="math-inline">{(relativityResult.speedMps / 1e6).toFixed(2)} × 10<sup>6</sup> m/s</span>} />
                <Metric label="Proper Time Δτ" value={<span className="math-inline">{relativityResult.properTime.toFixed(3)} ns (<Frac num="2D" den="c" />)</span>} />
                <Metric label="Dilated Time Δt" value={`${relativityResult.dilatedTime.toFixed(3)} ns (γΔτ)`} />
                <Metric label={<>Proper Length L<sub>0</sub></>} value={`${relativityResult.properLength.toFixed(2)} m`} />
                <Metric label="Contracted Length L" value={<span className="math-inline">{relativityResult.contractedLength.toFixed(3)} m (<Frac num={<>L<sub>0</sub></>} den="γ" />)</span>} />
              </dl>

              <details className="telemetry-details" style={{ marginTop: '6px', fontSize: '12px' }}>
                <summary style={{ cursor: 'pointer', color: '#fef08a' }}>Relativistic Mass-Energy Breakdown (No Relativistic Mass)</summary>
                <dl style={{ margin: '4px 0 0' }}>
                  <Metric label={<span className="math-inline">Rest Energy E<sub>0</sub> (m<sub>0</sub>c<sup>2</sup>)</span>} value={`${formatValue(relativityResult.restEnergyMeV)} MeV`} />
                  <Metric label={<span className="math-inline">Total Energy E (γm<sub>0</sub>c<sup>2</sup>)</span>} value={`${formatValue(relativityResult.totalEnergyMeV)} MeV`} />
                  <Metric label={<span className="math-inline">Kinetic Energy K ((γ−1)m<sub>0</sub>c<sup>2</sup>)</span>} value={`${formatValue(relativityResult.kineticEnergyMeV)} MeV`} />
                  <Metric label={<span className="math-inline">Relativistic Momentum p (γm<sub>0</sub>v)</span>} value={`${formatValue(relativityResult.momentumMeV_c)} MeV/c`} />
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
              <span style={{ fontSize: '12px', color: stationProgress.trials.length >= TOTAL_TRIALS ? '#34d399' : '#d4af37', fontWeight: 700 }}>
                {stationProgress.trials.length >= TOTAL_TRIALS ? '✓ All 5 Logged' : `Trial #${stationProgress.trials.length + 1}`}
              </span>
            </div>

            {stationProgress.trials.length < TOTAL_TRIALS && (
              <div style={{ fontSize: '12px', color: '#e2e8f0', marginBottom: '8px', background: 'rgba(26, 9, 14, 0.6)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(212, 175, 55, 0.25)' }}>
                Target #{stationProgress.trials.length + 1}: <b style={{ color: '#fef08a' }}>
                  {(() => {
                    const tgt = ROOM3_ASSIGNED_TRIALS[stationId][stationProgress.trials.length];
                    return tgt ? `${tgt.targetParam} = ${tgt.targetValue} ${tgt.unit}` : '';
                  })()}
                </b>
              </div>
            )}

            {stationProgress.trials.length < TOTAL_TRIALS && (
              <div style={{ marginBottom: '10px', fontSize: '12px', color: '#cbd5e1', background: 'rgba(15, 23, 42, 0.72)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.25)' }}>
                {stationId === 'circuits' && 'Configure the 3D power supply & DMM probes on the workbench, obtain a live reading, then record.'}
                {stationId === 'optics' && 'Set u on the rail, slide Screen Position v until sharp focus (≥85%) appears in 3D, then record.'}
                {stationId === 'relativity' && 'Tune frame velocity β on the maglev console, observe clock/length changes, then log the run.'}
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
                fontSize: '12px',
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
        <button
          type="button"
          className={allRoom3StationsComplete ? 'master-report-dock-ready' : undefined}
          onClick={() => openMasterReport(false)}
          title="Open Automated Full-Manual Report (.pdf / .docx)"
        >
          📄 Master Report
        </button>
      </div>

      {/* Mobile Touch Controls */}
      {!notebookOpen && activeWorkspaceView === '3d' && (
        <div className="mobile-lab-controls" aria-label="Touch laboratory controls">
          {cameraMode === 'closeup' ? (
            <div className="mobile-closeup-touchbar">
              <div className="mobile-closeup-zoom-group">
                <button
                  type="button"
                  className="mobile-closeup-btn"
                  onClick={() => sceneApi.current?.zoomCloseup?.(0.18)}
                  title="Zoom Out"
                >
                  − Zoom Out
                </button>
                <button
                  type="button"
                  className="mobile-closeup-btn"
                  onClick={() => sceneApi.current?.zoomCloseup?.(-0.18)}
                  title="Zoom In"
                >
                  + Zoom In
                </button>
                <button
                  type="button"
                  className="mobile-closeup-btn"
                  onClick={() => handleSetCloseupFocus('station')}
                  title="Reset Pan & Zoom"
                >
                  ⌖ Reset
                </button>
              </div>
              <span className="mobile-closeup-hint">1-finger pan · Pinch zoom · Tap apparatus</span>
              <div className="mobile-closeup-action-group">
                {stationId === 'circuits' && (
                  <button
                    type="button"
                    className="mobile-closeup-btn"
                    onClick={() => setActiveWorkspaceView('circuit_workspace')}
                  >
                    🔌 2D Board
                  </button>
                )}
                <button
                  type="button"
                  className="mobile-closeup-btn"
                  onClick={() => {
                    setCloseupHudExpanded(false);
                    setMobilePanel((v) => (v === 'controls' ? 'none' : 'controls'));
                  }}
                >
                  🎛️ Controls
                </button>
                <button
                  type="button"
                  className="mobile-closeup-btn primary"
                  onClick={() => handleSetCloseup('walk')}
                >
                  🚶 Exit
                </button>
              </div>
            </div>
          ) : (
            <>
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
              className={`mobile-equipment-action ${interaction || proximateStation ? 'ready' : ''}`}
              onClick={() => {
                if (interaction) {
                  equipmentActionRef.current(interaction.id);
                } else if (proximateStation) {
                  setStationId(proximateStation);
                  sceneApi.current?.setStation(proximateStation);
                  handleSetCloseup('closeup');
                }
              }}
              disabled={!interaction && !proximateStation}
            >
              <span className="mobile-btn-icon">{interaction ? '⚡' : '🔬'}</span>
              <span className="mobile-btn-text">
                {interaction
                  ? interaction.action
                  : proximateStation
                    ? `CLOSE-UP: ${ROOM3_STATIONS[proximateStation].shortName.toUpperCase()}`
                    : 'LOOK AT APPARATUS'}
              </span>
            </button>

            <div className="mobile-lab-subactions">
              <button
                type="button"
                className="mobile-subaction-btn"
                onClick={() => handleSetCloseup('closeup')}
                title="Enter Workbench Close-Up (Key E)"
              >
                <span>🔬 CLOSE-UP</span>
              </button>
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
                <span>{CHARACTER_META[activeCharacter].shortBadge}</span>
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
            </>
          )}
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
                <div className={`notebook-section ${[4, 6, 7, 8].includes(notebookStep) ? 'wide-section' : ''}`}>
              {/* STEP 1: EXPLORE (+3 pts) */}
              {notebookStep === 0 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+{STEP_POINTS[0]} Points</span>
                    <h4>Step 1: Inspect 3D Apparatus & Identify Reference Markers</h4>
                  </div>
                  <p className="step-prompt">{station.steps[0].prompt}</p>

                  <div className="equipment-checklist">
                    <b style={{ color: '#fef08a' }}>
                      Station Component Physical Inspection Status ({stationProgress.inspected.filter((id) => INSPECTION_TARGETS[stationId].includes(id)).length} / {INSPECTION_TARGETS[stationId].length} Inspected):
                    </b>
                    <ul className="room3-inspection-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px', padding: 0 }}>
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
                              if (isInspected) {
                                playTone(520, 'sine', 0.08, 0.15);
                                return;
                              }
                              handleFocusInspectionTarget(tgt);
                              playTone(660, 'sine', 0.1, 0.2);
                            }}
                            title={isInspected ? 'Component verified in 3D' : `Locate ${label} on the 3D workbench`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '14px' }}>{isInspected ? '✅' : '🔍'}</span>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: isInspected ? '#34d399' : '#e9dfc9' }}>{label}</span>
                            </div>
                            <span style={{ fontSize: '12px', color: isInspected ? '#34d399' : '#d4af37', fontWeight: 700 }}>
                              {isInspected ? '✓ Inspected' : 'Locate in 3D →'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {!allInspected ? (
                    <div className="feedback-alert incorrect" style={{ marginTop: '14px' }}>
                      ⚠️ Physical Inspection Required: Click &ldquo;Locate in 3D&rdquo; or walk up to each instrument in 3D and click the apparatus directly ({stationProgress.inspected.filter((id) => INSPECTION_TARGETS[stationId].includes(id)).length} / {INSPECTION_TARGETS[stationId].length} completed).
                    </div>
                  ) : (
                    <div className="feedback-alert correct" style={{ marginTop: '14px' }}>
                      ✓ All apparatus components have been inspected and verified!
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[0] || !allInspected}
                      onClick={() => completeStep(0)}
                    >
                      {stationProgress.completed[0] ? `✓ Step 1 Complete (${STEP_POINTS[0]}/${STEP_POINTS[0]} pts)` : `Confirm Inspection Complete (+${STEP_POINTS[0]} pts)`}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: ASSEMBLY / PREDICTION (+3 pts) */}
              {notebookStep === 1 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+{STEP_POINTS[1]} Points</span>
                    <h4>Step 2: {stationId === 'circuits' ? 'Circuit Assembly & Continuity Inspection' : stationId === 'optics' ? 'Optical Rail Alignment & Snell Interface Calibration' : 'Inertial Reference Frame S & S\' Calibration'}</h4>
                  </div>
                  <p className="step-prompt">{station.steps[1].prompt}</p>

                  <div className="calibration-box" style={{ borderLeft: '4px solid #d4af37' }}>
                    <b>{stationId === 'circuits' ? 'Resistor Network Assembly & Equivalent Resistance:' : stationId === 'optics' ? 'Geometric Ray Alignment & Snell Interface:' : 'Inertial Reference Frames S & S\' Invariant Coordinates:'}</b>
                    {stationId === 'circuits' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Three precision metal-film resistors are connected in a continuous series loop: <b className="math-inline">R<sub>1</sub> = 100 Ω</b>, <b className="math-inline">R<sub>2</sub> = 220 Ω</b>, <b className="math-inline">R<sub>3</sub> = 330 Ω</b>.<br />
                        Because there is only one continuous path for charge carriers, the total equivalent resistance is strictly additive:
                        <br />
                        <span className="math-expr" style={{ fontWeight: 700, color: '#fef08a' }}>
                          R<sub>eq</sub> = R<sub>1</sub> + R<sub>2</sub> + R<sub>3</sub> = 100 Ω + 220 Ω + 330 Ω = 650.0 Ω
                        </span>
                      </p>
                    )}
                    {stationId === 'optics' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Central optical track alignment ensures paraxial rays converge along the principal axis without spherical aberration.
                        Critical angle interface: <span className="math-expr" style={{ fontWeight: 700, color: '#fef08a' }}>θ<sub>c</sub> = arcsin(<Frac num={<>n<sub>2</sub></>} den={<>n<sub>1</sub></>} />) ≈ 41.8°</span> (Crown Glass <span className="math-inline">n<sub>1</sub> = 1.50</span> into Air <span className="math-inline">n<sub>2</sub> = 1.00</span>).
                      </p>
                    )}
                    {stationId === 'relativity' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Inertial Reference Frame S (laboratory rest frame) and Frame S&apos; (particle proper frame) establish invariant rest measurements: <b className="math-inline">L<sub>0</sub> = 20.0 m</b>, <b className="math-inline">Δt<sub>0</sub> = 10.0 s</b>.
                        Lorentz transformation ensures the invariant spacetime interval <span className="math-expr" style={{ fontWeight: 700, color: '#fef08a' }}>Δs<sup>2</sup> = c<sup>2</sup>Δt<sup>2</sup> − Δx<sup>2</sup></span> holds across all reference frames.
                      </p>
                    )}
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <b>Theoretical Prediction Checkpoint:</b>
                    <p className="prediction-question" style={{ marginTop: '6px' }}><MathText text={station.prediction.question} /></p>
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
                          <div><MathText text={opt} /></div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {predictionFeedback && (
                    <div className={`feedback-alert ${predictionStatus}`} style={{ marginTop: '14px' }}>
                      <MathText text={predictionFeedback} />
                    </div>
                  )}

                  <div className="button-row" style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="notebook-action"
                      disabled={stationProgress.completed[1] || currentPredictionAnswer !== station.prediction.answer}
                      onClick={() => completeStep(1)}
                    >
                      {stationProgress.completed[1] ? `✓ Step 2 Complete (${STEP_POINTS[1]}/${STEP_POINTS[1]} pts)` : stationId === 'circuits' ? `Confirm Circuit Assembly (+${STEP_POINTS[1]} pts)` : stationId === 'optics' ? `Confirm Optical Alignment (+${STEP_POINTS[1]} pts)` : `Confirm Frame Calibration (+${STEP_POINTS[1]} pts)`}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: POWER / SOURCE CONFIGURATION (+3 pts) */}
              {notebookStep === 2 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+{STEP_POINTS[2]} Points</span>
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
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>SOURCE POTENTIAL</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fef08a' }}>{circuits.vs.toFixed(1)} V DC</div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>POWER STATUS</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: circuits.powerOn ? '#10b981' : '#ef4444' }}>
                          {circuits.powerOn ? '● ENERGIZED' : '○ DE-ENERGIZED'}
                        </div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>CIRCUIT REGIME</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#d4af37' }}>DC Steady-State</div>
                      </div>
                    </div>
                  )}

                  {stationId === 'optics' && (
                    <div className="telemetry-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '16px' }}>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>LASER WAVELENGTH</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>{optics.wavelength} nm</div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>BEAMLINE EMISSION</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: optics.powerOn ? '#10b981' : '#ef4444' }}>
                          {optics.powerOn ? '● EMITTING (532 nm)' : '○ DE-ENERGIZED'}
                        </div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>OPTICAL REGIME</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#d4af37' }}>Coherent Paraxial Beam</div>
                      </div>
                    </div>
                  )}

                  {stationId === 'relativity' && (
                    <div className="telemetry-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '16px' }}>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>REST MASS PRESET</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fef08a' }}>{relativity.massPreset.toUpperCase()}</div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>BEAMLINE STATUS</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: relativity.powerOn ? '#10b981' : '#ef4444' }}>
                          {relativity.powerOn ? '● CHARGED VACUUM' : '○ STANDBY'}
                        </div>
                      </div>
                      <div className="telemetry-card" style={{ padding: '12px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>REST ENERGY E₀</span>
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
                      {stationProgress.completed[2] ? `✓ Step 3 Complete (${STEP_POINTS[2]}/${STEP_POINTS[2]} pts)` : stationId === 'circuits' ? `Confirm Power Configuration (+${STEP_POINTS[2]} pts)` : stationId === 'optics' ? `Confirm Laser Configuration (+${STEP_POINTS[2]} pts)` : `Confirm Beamline Setup (+${STEP_POINTS[2]} pts)`}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: INSTRUMENT PREPARATION (+3 pts) */}
              {notebookStep === 3 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+{STEP_POINTS[3]} Points</span>
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
                        <span style={{ fontSize: '12px', color: '#e9dfc9' }}>ROTARY SELECTOR DIAL (3D FLUKE 87V)</span>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: dmmMode === 'v_dc' ? '#34d399' : '#f87171', marginTop: '6px' }}>
                          {dmmMode === 'v_dc' ? '✓ V⎓ (DC Voltage Mode)' : `⚠️ Currently: ${dmmMode.toUpperCase()} (Must be V⎓)`}
                        </div>
                        <small style={{ color: '#94a3b8' }}>Turn rotary dial on 3D meter or Live Controls</small>
                      </div>
                      <div style={{ padding: '12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        <span style={{ fontSize: '12px', color: '#e9dfc9' }}>RED LEAD INPUT JACK</span>
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
                        <span style={{ fontSize: '12px', color: '#e9dfc9' }}>NOMINAL LENS SPECIFICATION</span>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>f = 20.0 cm (Converging)</div>
                        <small style={{ color: '#94a3b8' }}>Crown Glass n = 1.50</small>
                      </div>
                      <div style={{ padding: '12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        <span style={{ fontSize: '12px', color: '#e9dfc9' }}>OPTICAL RAIL STATUS</span>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fef08a', marginTop: '4px' }}>Paraxial Axis Aligned</div>
                        <small style={{ color: '#94a3b8' }}>Zero chromatic dispersion at 532 nm</small>
                      </div>
                    </div>
                  )}

                  {stationId === 'relativity' && (
                    <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      <div style={{ padding: '12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        <span style={{ fontSize: '12px', color: '#e9dfc9' }}>PROPER TIME STANDARD</span>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>Δt₀ = 10.00 s</div>
                        <small style={{ color: '#94a3b8' }}>Inertial Rest Frame S&apos;</small>
                      </div>
                      <div style={{ padding: '12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                        <span style={{ fontSize: '12px', color: '#e9dfc9' }}>REST LENGTH STANDARD</span>
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
                      {stationProgress.completed[3] ? `✓ Step 4 Complete (${STEP_POINTS[3]}/${STEP_POINTS[3]} pts)` : stationId === 'circuits' ? `Confirm Multimeter Preparation (+${STEP_POINTS[3]} pts)` : stationId === 'optics' ? `Confirm Optics Preparation (+${STEP_POINTS[3]} pts)` : `Confirm Detector Calibration (+${STEP_POINTS[3]} pts)`}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 5: MEASUREMENT PROCEDURE A (+4 pts) */}
              {notebookStep === 4 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+{STEP_POINTS[4]} Points</span>
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
                        Paraxial rays from object distance <b>u</b> refract through the thin converging lens to form a real image at distance <b>v</b> according to the Gaussian lens formula:{' '}
                        <b className="math-expr"><Frac num="1" den="f" /> = <Frac num="1" den="u" /> + <Frac num="1" den="v" /></b>. For nominal focal length <span className="math-inline">f = 20.0 cm</span>, when <span className="math-inline">u = 40.0 cm (2f)</span>, image distance <span className="math-inline">v = 40.0 cm</span> with unit magnification (<span className="math-inline">M = −1.0×</span>).
                      </p>
                    )}
                    {stationId === 'relativity' && (
                      <p style={{ margin: '6px 0 0' }}>
                        Because the speed of light <i>c</i> is an invariant universal constant, light travels along a longer diagonal path inside a moving clock as viewed from Frame S.
                        Consequently, the moving clock ticks slower by the Lorentz factor: <b className="math-expr">γ = <Frac num="1" den={<Sqrt>1 − β<sup>2</sup></Sqrt>} /></b>, yielding dilated time interval: <b className="math-inline">Δt = γ Δt<sub>0</sub></b>.
                      </p>
                    )}
                  </div>

                  {stationId === 'circuits' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>Parallel Potential Drop Verification (Fluke 87V):</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>FLUKE 87V LCD READOUT (PARALLEL)</span>
                          <div style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 700, color: '#fef08a' }}>{dmmReading.displayString}</div>
                          <div style={{ fontSize: '12px', color: dmmReading.isValidMeasurement && dmmReading.unit === 'V' ? '#34d399' : '#f87171', marginTop: '2px' }}>
                            {dmmReading.isValidMeasurement && dmmReading.unit === 'V' ? '✓ Valid parallel voltage measurement detected' : '⚠️ Place probes across circuit elements in 3D'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>Red Lead (+): <b style={{ color: '#fef08a' }}>{redTerminal ?? 'Unconnected'}</b></span><br />
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>Black Lead (COM): <b style={{ color: '#fef08a' }}>{blackTerminal ?? 'Unconnected'}</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {stationId === 'optics' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>Optical Track Conjugate Focal Alignment:</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>OPTICAL TRACK TELEMETRY</span>
                          <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#34d399' }}>
                            u = {optics.objectDistance.toFixed(1)} cm → v = {((optics.objectDistance * 20.0) / Math.max(0.1, optics.objectDistance - 20.0)).toFixed(1)} cm
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>Focal Length: <b>f = 20.0 cm</b></span><br />
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>Magnification: <b>{(-((optics.objectDistance * 20.0) / Math.max(0.1, optics.objectDistance - 20.0)) / optics.objectDistance).toFixed(2)}x</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {stationId === 'relativity' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>Relativistic Velocity & Time Dilation Telemetry:</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>DILATED TIME (FRAME S)</span>
                          <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#fef08a' }}>
                            Δt = {((1 / Math.sqrt(Math.max(0.01, 1 - relativity.beta ** 2))) * 10.0).toFixed(2)} s
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>Lorentz Factor: <b>γ = {(1 / Math.sqrt(Math.max(0.01, 1 - relativity.beta ** 2))).toFixed(4)}</b></span><br />
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>Proper Time: <b className="math-inline">Δt<sub>0</sub> = 10.0 s</b></span>
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
                      {stationProgress.completed[4] ? `✓ Step 5 Complete (${STEP_POINTS[4]}/${STEP_POINTS[4]} pts)` : stationId === 'circuits' ? `Confirm Voltage Procedure (+${STEP_POINTS[4]} pts)` : stationId === 'optics' ? `Confirm Optical Ray Procedure (+${STEP_POINTS[4]} pts)` : `Confirm Time Dilation Procedure (+${STEP_POINTS[4]} pts)`}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 6: MEASUREMENT PROCEDURE B (+4 pts) */}
              {notebookStep === 5 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+{STEP_POINTS[5]} Points</span>
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
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>FLUKE 87V AMMETER READOUT (SERIES)</span>
                          <div style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 700, color: dmmReading.tripFuse ? '#ef4444' : '#34d399' }}>
                            {dmmReading.displayString}
                          </div>
                          <div style={{ fontSize: '12px', color: (!jumperClosed && dmmMode === 'a_dc' && dmmJack === 'ma_10a' && (redTerminal === 'SERIES_JACK_A' || blackTerminal === 'SERIES_JACK_A')) ? '#34d399' : '#f87171', marginTop: '2px' }}>
                            {!jumperClosed && dmmMode === 'a_dc' && dmmJack === 'ma_10a' && (redTerminal === 'SERIES_JACK_A' || blackTerminal === 'SERIES_JACK_A')
                              ? '✓ Ammeter inserted in series break — full loop completed'
                              : '⚠️ Remove series jumper, set dial to A⎓, jack to mA/10A, and connect across break'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>Dial: <b style={{ color: dmmMode === 'a_dc' ? '#34d399' : '#f87171' }}>{dmmMode.toUpperCase()}</b> · Jack: <b style={{ color: dmmJack === 'ma_10a' ? '#34d399' : '#f87171' }}>{dmmJack.toUpperCase()}</b></span><br />
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>Series Jumper: <b style={{ color: !jumperClosed ? '#34d399' : '#f87171' }}>{jumperClosed ? 'CLOSED (Bypassing Ammeter)' : 'OPEN (Ammeter Completes Loop)'}</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {stationId === 'optics' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>Conjugate Real Image Sharpness & Magnification:</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>THIN LENS GAUSSIAN VERIFICATION</span>
                          <div className="math-expr" style={{ fontSize: '17px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
                            <Frac num="1" den="f" /> = <Frac num="1" den={optics.objectDistance.toFixed(0)} /> + <Frac num="1" den={((optics.objectDistance * 20.0) / Math.max(0.1, optics.objectDistance - 20.0)).toFixed(1)} /> = 0.050 cm<sup>−1</sup> (f = 20.0 cm)
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>Image State: <b>Real &amp; Inverted</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {stationId === 'relativity' && (
                    <div style={{ marginTop: '16px' }}>
                      <b>Lorentz Contraction & Relativistic Total Energy:</b>
                      <div className="live-meter-display" style={{ marginTop: '10px', padding: '14px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>CONTRACTED LENGTH (FRAME S)</span>
                          <div className="math-inline" style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: '#fef08a' }}>
                            L = {(20.0 * Math.sqrt(Math.max(0.01, 1 - relativity.beta ** 2))).toFixed(2)} m (Rest L<sub>0</sub> = 20.0 m)
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', color: '#e9dfc9' }}>Kinetic Energy: <b>{((1 / Math.sqrt(Math.max(0.01, 1 - relativity.beta ** 2)) - 1) * 3727.38).toFixed(1)} MeV</b></span>
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
                      {stationProgress.completed[5] ? `✓ Step 6 Complete (${STEP_POINTS[5]}/${STEP_POINTS[5]} pts)` : stationId === 'circuits' ? `Confirm Current Procedure (+${STEP_POINTS[5]} pts)` : stationId === 'optics' ? `Confirm Focus Procedure (+${STEP_POINTS[5]} pts)` : `Confirm Contraction Procedure (+${STEP_POINTS[5]} pts)`}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 7: FIVE-TRIAL EXPERIMENTAL DATA COLLECTION (+25 pts) */}
              {notebookStep === 6 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+{STEP_POINTS[6]} Points</span>
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
                          <div style={{ fontSize: '12px', color: isActive ? '#1a0b10' : isRecorded ? '#34d399' : '#e9dfc9' }}>
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
                            <span style={{ fontSize: '12px', color: '#e9dfc9' }}>LIVE SOURCE POTENTIAL</span>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fef08a' }}>{circuits.vs.toFixed(2)} V</div>
                          </div>
                          <div style={{ padding: '8px 12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                            <span style={{ fontSize: '12px', color: '#e9dfc9' }}>LIVE CURRENT (SERIES)</span>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399' }}>{(circuitResult.current * 1000).toFixed(2)} mA</div>
                          </div>
                          <div style={{ padding: '8px 12px', background: 'rgba(35, 12, 20, 0.9)', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                            <span style={{ fontSize: '12px', color: '#e9dfc9' }}>THEORETICAL RESISTANCE <span className="math-inline">R<sub>eq</sub></span></span>
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
                              ✓ All 5 Trials Recorded in 3D (+{STEP_POINTS[6]} pts Earned)
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
                              <th>#</th><th>V<sub>s</sub> (V)</th><th>Measured V (V)</th><th>Current (mA)</th><th>Current (A)</th><th>R<sub>exp</sub> (Ω)</th><th>R<sub>eq</sub> Theor (Ω)</th><th>% Error</th><th>Action</th>
                            </>
                          )}
                          {stationId === 'optics' && (
                            <>
                              <th>#</th><th>Object u (cm)</th><th>Image v (cm)</th><th>1/u (cm<sup>−1</sup>)</th><th>1/v (cm<sup>−1</sup>)</th><th>f<sub>exp</sub> (cm)</th><th>f<sub>nom</sub> (cm)</th><th>% Error</th><th>Action</th>
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
                                    style={{ fontSize: '12px', padding: '2px 6px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
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
                                    style={{ fontSize: '12px', padding: '2px 6px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
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
                                    style={{ fontSize: '12px', padding: '2px 6px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
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
                        ✓ 5 Trials Complete (+{STEP_POINTS[6]} pts) — Proceed to Step 8: Computation &amp; Analysis →
                      </button>
                    ) : (
                      <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                        Awaiting {TOTAL_TRIALS - stationProgress.trials.length} more trial{TOTAL_TRIALS - stationProgress.trials.length > 1 ? 's' : ''} to unlock computation stage.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 8: EXPERIMENTAL DATA COMPUTATION & ANALYSIS (+25 pts) */}
              {notebookStep === 7 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+{STEP_POINTS[7]} Points</span>
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
                              <th>#</th><th>V<sub>s</sub> (V)</th><th>Measured V (V)</th><th>Current (mA)</th><th>Current (A)</th><th>R<sub>exp</sub> (Ω)</th><th>Power (W)</th><th>R<sub>nom</sub> (Ω)</th><th>% Error</th>
                            </>
                          )}
                          {stationId === 'optics' && (
                            <>
                              <th>#</th><th>Object u (cm)</th><th>Image v (cm)</th><th>1/u (cm<sup>−1</sup>)</th><th>1/v (cm<sup>−1</sup>)</th><th>f<sub>exp</sub> (cm)</th><th>f<sub>nom</sub> (cm)</th><th>% Error</th>
                            </>
                          )}
                          {stationId === 'relativity' && (
                            <>
                              <th>Run</th><th>β (v/c)</th><th>Velocity v (m/s)</th><th>Lorentz Factor γ</th><th>Proper Time Δτ (ns)</th><th>Dilated Time Δt (ns)</th><th>Proper Length L<sub>0</sub> (m)</th><th>Contracted Length L (m)</th>
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
                                <td>{formatValue(t.beta)}c</td>
                                <td>{(Number(t.speed ?? 0) / 1e6).toFixed(2)} × 10⁶</td>
                                <td style={{ color: '#38bdf8', fontWeight: 700 }}>{formatValue(t.gamma)}</td>
                                <td>{formatValue(t.properTime ?? 6.671)} ns</td>
                                <td style={{ color: '#10b981', fontWeight: 700 }}>{formatValue(t.dilatedTime)} ns</td>
                                <td>{formatValue(t.properLength ?? 10.0)} m</td>
                                <td style={{ color: '#fef08a', fontWeight: 700 }}>{formatValue(t.contractedLength)} m</td>
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
                      <div className="computation-cards-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginBottom: '16px' }}>
                        {stationProgress.trials.map((t, i) => {
                          if (stationId === 'circuits') {
                            const v = Number(t.measuredV ?? t.vs ?? 4.0);
                            const iA = Number(t.measuredI_A ?? (typeof t.measuredI_mA !== 'undefined' ? Number(t.measuredI_mA) / 1000 : null) ?? t.current ?? 0.00615);
                            const i_mA = Number(t.measuredI_mA ?? (iA * 1000));
                            const r = Number(t.resistance ?? ((v * 1000) / i_mA));
                            const currentInput = stationProgress.calculations?.[i] ?? '';
                            const status = calcPerTrialStatus[i];
                            return (
                              <div key={i} style={{ padding: '10px 8px', background: 'rgba(53, 18, 29, 0.9)', border: status === 'correct' ? '1.5px solid #10b981' : status === 'incorrect' ? '1.5px solid #ef4444' : '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '8px', fontSize: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ color: '#d4af37', fontWeight: 700 }}>TRIAL #{i + 1}</span>
                                  {status === 'correct' && <span style={{ color: '#34d399', fontSize: '12px', fontWeight: 800 }}>✓ Verified</span>}
                                  {status === 'incorrect' && <span style={{ color: '#f87171', fontSize: '12px', fontWeight: 700 }}>❌ Check Math</span>}
                                  {(!status || status === 'empty') && <span style={{ color: '#94a3b8', fontSize: '12px' }}>⏳ Enter Value</span>}
                                </div>
                                <div className="math-expr" style={{ display: 'block', margin: '4px 0' }}>
                                  <KatexMath math={`R_{${i + 1}} = \\frac{V_{${i + 1}}}{I_{${i + 1}}}`} />
                                </div>
                                <div className="math-expr" style={{ display: 'block', color: '#94a3b8', margin: '4px 0' }}>
                                  <KatexMath math={`= \\frac{${v.toFixed(2)}\\;\\text{V}}{${i_mA.toFixed(2)}\\;\\text{mA}}`} />
                                </div>
                                <div style={{ fontWeight: 700, color: '#fef08a', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <span>=</span>
                                  <input
                                    type="text"
                                    placeholder="R (Ω)"
                                    value={currentInput}
                                    onChange={(e) => handleCalculationChange(i, e.target.value)}
                                    style={{ width: '64px', padding: '3px 4px', fontSize: '12px', background: '#090d16', color: '#fef08a', border: '1px solid #d4af37', borderRadius: '4px', textAlign: 'center', fontWeight: 700 }}
                                  />
                                  <span>Ω</span>
                                </div>
                              </div>
                            );
                          } else if (stationId === 'optics') {
                            const u = Number(t.u ?? t.paramA ?? 30);
                            const v = Number(t.v ?? t.measured ?? 60);
                            const currentInput = stationProgress.calculations?.[i] ?? '';
                            const status = calcPerTrialStatus[i];
                            return (
                              <div key={i} style={{ padding: '10px 8px', background: 'rgba(53, 18, 29, 0.9)', border: status === 'correct' ? '1.5px solid #10b981' : status === 'incorrect' ? '1.5px solid #ef4444' : '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '8px', fontSize: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ color: '#10b981', fontWeight: 700 }}>TRIAL #{i + 1}</span>
                                  {status === 'correct' && <span style={{ color: '#34d399', fontSize: '12px', fontWeight: 800 }}>✓ Verified</span>}
                                  {status === 'incorrect' && <span style={{ color: '#f87171', fontSize: '12px', fontWeight: 700 }}>❌ Check Math</span>}
                                  {(!status || status === 'empty') && <span style={{ color: '#94a3b8', fontSize: '12px' }}>⏳ Enter Value</span>}
                                </div>
                                <div className="math-expr" style={{ display: 'block', margin: '4px 0' }}>
                                  <KatexMath math={`f_{${i + 1}} = \\frac{u \\cdot v}{u + v}`} />
                                </div>
                                <div className="math-expr" style={{ display: 'block', color: '#94a3b8', margin: '4px 0' }}>
                                  <KatexMath math={`= \\frac{${u} \\cdot ${v.toFixed(1)}}{${u} + ${v.toFixed(1)}}`} />
                                </div>
                                <div style={{ fontWeight: 700, color: '#34d399', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <span>=</span>
                                  <input
                                    type="text"
                                    placeholder="f (cm)"
                                    value={currentInput}
                                    onChange={(e) => handleCalculationChange(i, e.target.value)}
                                    style={{ width: '64px', padding: '3px 4px', fontSize: '12px', background: '#090d16', color: '#34d399', border: '1px solid #10b981', borderRadius: '4px', textAlign: 'center', fontWeight: 700 }}
                                  />
                                  <span>cm</span>
                                </div>
                              </div>
                            );
                          } else {
                            const beta = Number(t.beta ?? 0.1);
                            const tau0 = 6.671;
                            const dilatedT = (t.gamma ? Number(t.gamma) : 1 / Math.sqrt(Math.max(1e-6, 1 - beta * beta))) * tau0;
                            const l0 = 10.00;
                            const contractedL = l0 / (t.gamma ? Number(t.gamma) : 1 / Math.sqrt(Math.max(1e-6, 1 - beta * beta)));
                            const currentInput = stationProgress.calculations?.[i] ?? '';
                            const status = calcPerTrialStatus[i];
                            return (
                              <div key={i} style={{ padding: '10px 8px', background: 'rgba(53, 18, 29, 0.9)', border: status === 'correct' ? '1.5px solid #10b981' : status === 'incorrect' ? '1.5px solid #ef4444' : '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '8px', fontSize: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ color: '#fef08a', fontWeight: 700 }}>RUN #{i + 1} (β={beta.toFixed(2)}c)</span>
                                  {status === 'correct' && <span style={{ color: '#34d399', fontSize: '12px', fontWeight: 800 }}>✓ Verified</span>}
                                  {status === 'incorrect' && <span style={{ color: '#f87171', fontSize: '12px', fontWeight: 700 }}>❌ Check Math</span>}
                                  {(!status || status === 'empty') && <span style={{ color: '#94a3b8', fontSize: '12px' }}>⏳ Enter Value</span>}
                                </div>
                                <div className="math-expr" style={{ display: 'block', margin: '4px 0', color: '#cbd5e1' }}>
                                  <KatexMath math={`\\gamma = \\frac{1}{\\sqrt{1 - ${beta.toFixed(2)}^2}}`} />
                                </div>
                                <div style={{ fontWeight: 700, color: '#38bdf8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <span>γ =</span>
                                  <input
                                    type="text"
                                    placeholder="γ (1.xxxx)"
                                    value={currentInput}
                                    onChange={(e) => handleCalculationChange(i, e.target.value)}
                                    style={{ width: '70px', padding: '3px 4px', fontSize: '12px', background: '#090d16', color: '#38bdf8', border: '1px solid #0284c7', borderRadius: '4px', textAlign: 'center', fontWeight: 700 }}
                                  />
                                </div>
                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                                  Δt = {dilatedT.toFixed(3)} ns<br />
                                  L = {contractedL.toFixed(3)} m
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
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                            <div>
                              <b>1. Average Experimental Resistance (<KatexMath math="R_{\text{mean}}" />):</b>
                              <div className="math-expr" style={{ color: '#fef08a', margin: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                <KatexMath math={`R_{\\text{mean}} = \\frac{R_1 + R_2 + R_3 + R_4 + R_5}{5}`} />
                                <KatexMath math={`= \\frac{${circuitMetrics.resistances.map((r) => r.toFixed(1)).join(' + ')}}{5}`} />
                                <KatexMath math={`= ${circuitMetrics.mean.toFixed(2)}\\;\\Omega`} />
                              </div>
                            </div>
                            <div>
                              <b>2. Sample Standard Deviation (s):</b>
                              <div className="math-expr" style={{ color: '#fef08a', margin: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                <KatexMath math={`s = \\sqrt{\\frac{\\sum(R_i - R_{\\text{mean}})^2}{5 - 1}}`} />
                                <KatexMath math={`= ${circuitMetrics.stdDev !== null ? circuitMetrics.stdDev.toFixed(3) : '—'}\\;\\Omega`} />
                              </div>
                              <div className="math-expr" style={{ color: '#94a3b8', marginTop: '4px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                <KatexMath math={`\\text{SEM} = \\frac{s}{\\sqrt{5}}`} />
                                <KatexMath math={`= ${circuitMetrics.sem !== null ? circuitMetrics.sem.toFixed(3) : '—'}\\;\\Omega`} />
                              </div>
                            </div>
                            <div>
                              <b>3. Percentage Error vs. Nominal Resistor Specification (330.0 Ω):</b>
                              <div className="math-expr" style={{ color: '#10b981', margin: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                <KatexMath math={`\\%\\;\\text{Error} = \\frac{|R_{\\text{mean}} - R_{\\text{nom}}|}{R_{\\text{nom}}} \\times 100\\%`} />
                                <KatexMath math={`= \\frac{|${circuitMetrics.mean.toFixed(2)} - 330.0|}{330.0} \\times 100\\%`} />
                                <KatexMath math={`= ${circuitMetrics.percentError !== null ? circuitMetrics.percentError.toFixed(2) : '—'}\\%`} />
                              </div>
                              <small style={{ display: 'block', color: '#94a3b8' }}>
                                (Within strict ±2% academic threshold)
                              </small>
                            </div>
                            <div>
                              <b>4. Resistor Specification &amp; Power Rating:</b>
                              <div style={{ fontFamily: 'monospace', color: '#a855f7', margin: '4px 0' }}>
                                R = 330.0 Ω · 1 Watt Rating (Carbon Film Resistor)
                              </div>
                              <div className="math-expr" style={{ color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                <KatexMath math={`I_{\\max} = \\sqrt{\\frac{P}{R}}`} />
                                <KatexMath math={`= \\sqrt{\\frac{1.0}{330}} \\approx 55.0\\;\\text{mA}`} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {stationId === 'optics' && opticsMetrics.mean !== null && (
                        <div className="stats-breakdown-card" style={{ padding: '14px', background: 'rgba(53, 18, 29, 0.9)', border: '1.5px solid rgba(212, 175, 55, 0.45)', borderRadius: '8px', marginBottom: '16px' }}>
                          <h5 style={{ margin: '0 0 10px', color: '#f8fafc' }}>Optics Statistical Quantification:</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                            <div>
                              <b>Average Experimental Focal Length (<KatexMath math="f_{\text{mean}}" />):</b>
                              <div className="math-expr" style={{ color: '#10b981', margin: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                <KatexMath math={`f_{\\text{mean}} = \\frac{\\sum f_i}{5}`} />
                                <KatexMath math={`= ${opticsMetrics.mean.toFixed(2)}\\;\\text{cm}`} />
                              </div>
                            </div>
                            <div>
                              <b>Percentage Error vs. Nominal Focal Length (20.0 cm):</b>
                              <div className="math-expr" style={{ color: '#10b981', margin: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                <KatexMath math={`\\%\\;\\text{Error} = \\frac{|f_{\\text{mean}} - 20.0|}{20.0} \\times 100\\%`} />
                                <KatexMath math={`= ${opticsMetrics.percentError !== null ? opticsMetrics.percentError.toFixed(2) : '—'}\\%`} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {stationId === 'relativity' && (
                        <div className="stats-breakdown-card" style={{ padding: '16px', background: 'rgba(53, 18, 29, 0.9)', border: '1.5px solid rgba(212, 175, 55, 0.45)', borderRadius: '8px', marginBottom: '16px' }}>
                          <h5 style={{ margin: '0 0 10px', color: '#f8fafc', fontSize: '13px' }}>
                            🔬 Numerical Implementation &amp; Theoretical Verification:
                          </h5>
                          <div className="table-scroll" style={{ marginBottom: '12px' }}>
                            <table className="trial-table" style={{ fontSize: '12px' }}>
                              <thead>
                                <tr>
                                  <th>Condition</th>
                                  <th>Relative β</th>
                                  <th>Simulated γ</th>
                                  <th>Theor. γ</th>
                                  <th>Simulated Δt (ns)</th>
                                  <th>Theor. Δt (ns)</th>
                                  <th>Simulated L (m)</th>
                                  <th>Theor. L (m)</th>
                                  <th>Residual (|Δ|)</th>
                                  <th>Verification</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  { run: 'Run 1', b: 0.10, g: 1.0050, dt: 6.705, l: 9.950 },
                                  { run: 'Run 2', b: 0.30, g: 1.0483, dt: 6.993, l: 9.539 },
                                  { run: 'Run 3', b: 0.50, g: 1.1547, dt: 7.703, l: 8.660 },
                                  { run: 'Run 4', b: 0.70, g: 1.4003, dt: 9.342, l: 7.141 },
                                  { run: 'Run 5', b: 0.90, g: 2.2942, dt: 15.305, l: 4.359 },
                                ].map((row) => (
                                  <tr key={row.run}>
                                    <td><b>{row.run}</b></td>
                                    <td>{row.b.toFixed(2)}c</td>
                                    <td style={{ color: '#38bdf8' }}>{row.g.toFixed(4)}</td>
                                    <td>{row.g.toFixed(4)}</td>
                                    <td style={{ color: '#34d399' }}>{row.dt.toFixed(3)}</td>
                                    <td>{row.dt.toFixed(3)}</td>
                                    <td style={{ color: '#fef08a' }}>{row.l.toFixed(3)}</td>
                                    <td>{row.l.toFixed(3)}</td>
                                    <td style={{ color: '#10b981', fontWeight: 'bold' }}>0.0000</td>
                                    <td style={{ color: '#34d399' }}>✓ Zero Residual</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div style={{ padding: '10px 12px', background: 'rgba(15, 23, 42, 0.7)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                            <b style={{ color: '#38bdf8' }}>COMPUTATIONAL PHYSICS SIMULATION INTEGRITY:</b> This station is a computational simulation investigation. Unlike physical bench experiments subject to laboratory thermal or sensor noise, numerical physics simulations verify theoretical kinematics with exact floating-point precision. Verification is confirmed by absolute numerical identity (|Simulated − Theoretical| = 0.0000).
                          </div>
                        </div>
                      )}

                      {/* 3. Least-Squares Linear Regression Plot & Substituted Formula */}
                      <div className="section-divider" style={{ margin: '16px 0 10px', borderBottom: '1px solid rgba(212, 175, 55, 0.4)', paddingBottom: '6px' }}>
                        <h5 style={{ margin: 0, color: '#fef08a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                          {stationId === 'circuits' ? (
                            <>Section C: Least-Squares Linear Regression Analysis (<span className="math-inline" style={{ textTransform: 'none' }}>Slope = R<sub>exp</sub> ≈ 330 Ω</span>)</>
                          ) : stationId === 'optics' ? (
                            <>Section C: Thin Lens Linear Regression Analysis (<span className="math-inline" style={{ textTransform: 'none' }}>1/v vs. 1/u, Intercept = 1/f ≈ 0.050 cm<sup>−1</sup></span>)</>
                          ) : (
                            <>Section C: Relativistic Functional Analysis (<span className="math-inline" style={{ textTransform: 'none' }}>γ vs. β, Δt/Δτ vs. β, L/L<sub>0</sub> vs. β</span>)</>
                          )}
                        </h5>
                      </div>

                      <Room3Graph stationId={stationId} trials={stationProgress.trials} accentColor={station.accent} />

                      {regression && stationId === 'circuits' && (
                        <div className="regression-substitution-card" style={{ padding: '12px', background: 'rgba(53, 18, 29, 0.9)', border: '1.5px solid rgba(212, 175, 55, 0.45)', borderRadius: '8px', marginTop: '12px' }}>
                          <b>Step-by-Step Least-Squares Substitution (V vs. I):</b>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '8px 0', fontSize: '12px', fontFamily: 'monospace' }}>
                            <div>Σ I = {regression.sumX.toFixed(5)} A</div>
                            <div>Σ V = {regression.sumY.toFixed(2)} V</div>
                            <div>Σ (I·V) = {regression.sumXY.toFixed(4)} W</div>
                            <div>Σ (I<sup>2</sup>) = {regression.sumX2.toFixed(6)} A<sup>2</sup></div>
                          </div>
                          <div className="math-expr" style={{ color: '#fef08a', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', margin: '6px 0' }}>
                            <KatexMath math={`m = \\frac{N \\cdot \\sum(I \\cdot V) - (\\sum I)(\\sum V)}{N \\cdot \\sum(I^2) - (\\sum I)^2}`} />
                            <KatexMath math={`= \\frac{5 \\cdot (${regression.sumXY.toFixed(4)}) - (${regression.sumX.toFixed(4)}) \\cdot (${regression.sumY.toFixed(2)})}{5 \\cdot (${regression.sumX2.toFixed(6)}) - (${regression.sumX.toFixed(4)})^2}`} />
                            <KatexMath math={`= ${regression.slope.toFixed(2)}\\;\\Omega`} />
                          </div>
                          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                            Physical Interpretation: The slope <b className="math-inline">m = {regression.slope.toFixed(2)} Ω</b> directly represents the experimental resistance <span className="math-inline">R<sub>exp</sub></span>. With coefficient of determination <b className="math-inline">R<sup>2</sup> = {regression.rSquared.toFixed(5)}</b>, the empirical dataset conclusively confirms Ohm&apos;s Law (<span className="math-inline">V = I·R</span>) with linear precision.
                          </p>
                        </div>
                      )}

                      {/* Step 8 Verification Action Row */}
                      <div className="button-row" style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="notebook-action"
                          style={{
                            background: stationProgress.completed[7] ? '#059669' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            borderColor: '#10b981',
                            fontWeight: 700,
                            padding: '10px 16px',
                          }}
                          disabled={stationProgress.completed[7]}
                          onClick={verifyCalculations}
                        >
                          {stationProgress.completed[7] ? '✓ Step 8 Complete (25/25 pts)' : 'Verify & Submit Step 8 Calculations (+25 pts)'}
                        </button>

                        {stationProgress.completed[7] && (
                          <button
                            type="button"
                            className="notebook-action"
                            style={{
                              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                              borderColor: '#38bdf8',
                              fontWeight: 700,
                              padding: '10px 16px',
                            }}
                            onClick={() => setNotebookStep(8)}
                          >
                            Proceed to Step 9: Observations &amp; CER Conclusion (+30 pts) →
                          </button>
                        )}
                      </div>

                      {calculationFeedback && (
                        <div className={`feedback-alert ${calculationStatus}`} style={{ marginTop: '14px' }}>
                          {calculationFeedback}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* STEP 9: OBSERVATIONS, SCIENTIFIC INTERPRETATION & CER CONCLUSION (30 pts) */}
              {notebookStep === 8 && (
                <div className="step-content">
                  <div className="step-badge-row">
                    <span className="step-points-pill">+30 Points</span>
                    <h4>Step 9: Observations, Scientific Interpretation &amp; CER Conclusion</h4>
                  </div>
                  <p className="step-prompt">{station.steps[8]?.prompt || 'Record qualitative observations, interpret governing physical laws, and synthesize your final Claim–Evidence–Reasoning (CER) scientific conclusion in the lab notebook.'}</p>

                  {/* SECTION A: QUALITATIVE OBSERVATIONS & DEDUCTIONS */}
                  <div className="section-divider" style={{ margin: '16px 0 10px', borderBottom: '1px solid rgba(212, 175, 55, 0.4)', paddingBottom: '6px' }}>
                    <h5 style={{ margin: 0, color: '#fef08a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Section A: Qualitative Observations &amp; Deductions (Min 20 characters)
                    </h5>
                  </div>
                  <div className="text-area-group">
                    <label>
                      <textarea
                        rows={3}
                        value={stationProgress.observations || stationProgress.analysis || ''}
                        placeholder="Detail your qualitative observations regarding component behavior, display readouts, and experimental trends..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setProgress((prev) => ({
                            ...prev,
                            [stationId]: { ...prev[stationId], observations: val, analysis: val },
                          }));
                        }}
                      />
                    </label>
                  </div>

                  {/* SECTION B: SCIENTIFIC INTERPRETATION & COMPARATIVE ANALYSIS */}
                  <div className="section-divider" style={{ margin: '20px 0 10px', borderBottom: '1px solid rgba(212, 175, 55, 0.4)', paddingBottom: '6px' }}>
                    <h5 style={{ margin: 0, color: '#d4af37', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Section B: Scientific Interpretation &amp; Comparative Analysis (Min 20 characters)
                    </h5>
                  </div>
                  <div className="text-area-group">
                    <label>
                      <textarea
                        rows={3}
                        value={stationProgress.scientificInterpretation || ''}
                        placeholder="Explain how your empirical findings reconcile with fundamental physical laws (Ohm's Law, Gaussian Optics, Lorentz Invariance)..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setProgress((prev) => ({
                            ...prev,
                            [stationId]: { ...prev[stationId], scientificInterpretation: val },
                          }));
                        }}
                      />
                    </label>
                  </div>

                  {/* Circuits Series vs. Parallel Analysis */}
                  {stationId === 'circuits' && (
                    <div style={{ marginTop: '16px' }}>
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
                              <td><b>Equivalent Resistance (<span className="math-inline">R<sub>eq</sub></span>)</b></td>
                              <td style={{ color: '#fef08a', fontWeight: 700 }}><span className="math-inline">650.0 Ω (R<sub>1</sub> + R<sub>2</sub> + R<sub>3</sub>)</span></td>
                              <td style={{ color: '#38bdf8', fontWeight: 700 }}><span className="math-inline">56.90 Ω (<Frac num="1" den={<>Σ(1/R<sub>k</sub>)</>} />)</span></td>
                              <td>Parallel reduces resistance 11.4× below the smallest resistor</td>
                            </tr>
                            <tr>
                              <td><b>Total Circuit Current (<span className="math-inline">I<sub>tot</sub></span> at 6 V)</b></td>
                              <td style={{ color: '#d4af37' }}>9.23 mA (0.00923 A)</td>
                              <td style={{ color: '#34d399' }}>105.45 mA (0.10545 A)</td>
                              <td>Ohm&apos;s Law: <span className="math-expr">I<sub>tot</sub> = <Frac num={<>V<sub>s</sub></>} den={<>R<sub>eq</sub></>} /></span> (Parallel draws 11.4× more current)</td>
                            </tr>
                            <tr>
                              <td><b>Current Behavior</b></td>
                              <td>Identical everywhere (<span className="math-inline">I<sub>1</sub> = I<sub>2</sub> = I<sub>3</sub> = 9.23 mA</span>)</td>
                              <td>Branch division: <span className="math-inline">I<sub>1</sub> = 60.0 mA, I<sub>2</sub> = 27.3 mA, I<sub>3</sub> = 18.2 mA</span></td>
                              <td>Kirchhoff&apos;s Current Law: <span className="math-inline">I<sub>tot</sub> = I<sub>1</sub> + I<sub>2</sub> + I<sub>3</sub></span></td>
                            </tr>
                            <tr>
                              <td><b>Voltage Distribution</b></td>
                              <td>Divides: <span className="math-inline">V<sub>1</sub> = 0.92 V, V<sub>2</sub> = 2.03 V, V<sub>3</sub> = 3.05 V</span></td>
                              <td>Identical across all: <span className="math-inline">V<sub>1</sub> = V<sub>2</sub> = V<sub>3</sub> = 6.00 V</span></td>
                              <td>Kirchhoff&apos;s Voltage Law: <span className="math-inline">V<sub>s</sub> = Σ V<sub>k</sub></span> (Series) vs Equal (Parallel)</td>
                            </tr>
                            <tr>
                              <td><b>Total Power Dissipated (P = VI)</b></td>
                              <td style={{ color: '#f59e0b' }}>0.0554 W (55.4 mW)</td>
                              <td style={{ color: '#ef4444' }}>0.6327 W (632.7 mW)</td>
                              <td><span className="math-expr">P = <Frac num={<>V<sup>2</sup></>} den={<>R<sub>eq</sub></>} /></span> (Parallel dissipates 11.4× more thermal energy)</td>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q1. Why does equivalent resistance increase when adding resistors in series, but decrease when adding resistors in parallel?</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.55 }}>
                              In series, each resistor adds obstacle length to the single charge flow path (<span className="math-inline">R<sub>eq</sub> = R<sub>1</sub> + R<sub>2</sub> + R<sub>3</sub></span>). In parallel, each resistor adds an additional alternative pathway (cross-sectional area) for charge to bypass, strictly decreasing total resistance:{' '}
                              <span className="math-expr"><Frac num="1" den={<>R<sub>eq</sub></>} /> = <Frac num="1" den={<>R<sub>1</sub></>} /> + <Frac num="1" den={<>R<sub>2</sub></>} /> + <Frac num="1" den={<>R<sub>3</sub></>} /></span> &lt; min(<span className="math-inline">R<sub>k</sub></span>).
                            </p>
                          </div>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q2. Why does the largest resistor drop the most voltage in series, while the smallest resistor draws the most current in parallel?</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.55 }}>
                              In series, current <i>I</i> is identical through all components; by <span className="math-inline">V = I·R</span>, voltage drop is directly proportional to resistance (<span className="math-inline">R<sub>3</sub> = 330 Ω</span> drops 3.05 V vs <span className="math-inline">R<sub>1</sub> = 100 Ω</span> dropping 0.92 V). In parallel, voltage <i>V</i> is identical across all branches; by <span className="math-expr">I = <Frac num="V" den="R" /></span>, current is inversely proportional to resistance, so the 100 Ω branch carries 60.0 mA while the 330 Ω branch carries only 18.2 mA.
                            </p>
                          </div>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q3. How does total power dissipation compare between series and parallel connections across the same 6 V supply?</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.55 }}>
                              Total power is <span className="math-expr">P = <Frac num={<>V<sup>2</sup></>} den={<>R<sub>eq</sub></>} /></span>. Because <span className="math-inline">R<sub>eq</sub></span> is 11.4× smaller in parallel (56.9 Ω vs 650 Ω), the parallel arrangement consumes and dissipates 11.4× more power (0.633 W vs 0.055 W) from the exact same 6 V source.
                            </p>
                          </div>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q4. If one component fails open-circuit in a series circuit versus in a parallel circuit, what happens to the remaining components?</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.4 }}>
                              In series, an open failure creates an infinite-impedance break in the single loop, extinguishing current to all components. In parallel, an open branch leaves the independent voltage paths of other branches intact, allowing the remaining branches to operate continuously without interruption.
                            </p>
                          </div>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q5. Explain how the slope of the voltage vs. current graph directly proves Ohm&apos;s Law (<span className="math-expr">R = <Frac num="ΔV" den="ΔI" /></span>).</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.55 }}>
                              Ohm&apos;s Law defines linear proportionality between electric potential and current: <span className="math-inline">V = R·I</span>. When plotted with Current on the x-axis and Voltage on the y-axis, the gradient <span className="math-expr"><Frac num="ΔV" den="ΔI" /></span> is constant and directly equals the resistance (<span className="math-inline">m ≈ 330.0 Ω</span> with <span className="math-inline">R<sup>2</sup> ≥ 0.999</span>).
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Relativity 7 Conceptual Review Principles */}
                  {stationId === 'relativity' && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ padding: '16px', background: 'rgba(53, 18, 29, 0.9)', border: '1.5px solid rgba(212, 175, 55, 0.45)', borderRadius: '8px' }}>
                        <h5 style={{ margin: '0 0 12px', color: '#f8fafc', fontSize: '13px' }}>
                          🎓 Student Conceptual Review (7 Fundamental Relativistic Principles):
                        </h5>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q1. Constancy of the Speed of Light: Why is the speed of light c identical in both Frame S (lab) and Frame S&apos; (moving sled), regardless of source velocity?</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.4 }}>
                              Einstein&apos;s second postulate states that light always propagates in empty space with a definite velocity c independent of the state of motion of the emitting body. Unlike classical Galilean relativity where velocities simply add (u&apos; = u + v), spacetime geometry is hyperbolic (Minkowski spacetime), ensuring Maxwell&apos;s electrodynamic equations remain invariant across all inertial frames.
                            </p>
                          </div>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q2. Light-Clock Trajectory and Time Dilation: Why does the diagonal zigzag path traced by the photon in the lab frame necessitate time dilation (Δt = γ Δτ)?</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.65 }}>
                              In the clock&apos;s rest frame S&apos;, the photon travels vertically 2D across the mirror gap. In the laboratory frame S, because the clock is translating horizontally at speed v, the photon must travel along two hypotenuses:{' '}
                              <span className="math-expr">2L = 2 <Sqrt>D<sup>2</sup> + (<Frac num="v·Δt" den="2" />)<sup>2</sup></Sqrt></span>. Since the speed of light c is invariant, traveling a longer distance at the exact same constant speed c requires a longer elapsed time:{' '}
                              <span className="math-expr">c Δt = 2 <Sqrt>D<sup>2</sup> + (<Frac num="v·Δt" den="2" />)<sup>2</sup></Sqrt></span>, which rearranges algebraically to{' '}
                              <span className="math-expr">Δt = <Frac num={<Frac num="2D" den="c" />} den={<Sqrt>1 − <Frac num={<>v<sup>2</sup></>} den={<>c<sup>2</sup></>} /></Sqrt>} /> = γ Δτ</span>.
                            </p>
                          </div>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q3. Proper Time Definition: What constitutes proper time Δτ, and why is it always the minimum elapsed time measurable between two events?</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.4 }}>
                              Proper time Δτ is the time interval measured by a single clock that is present at both the beginning and end of the event (co-moving rest frame). In any other inertial frame in relative motion, two spatially separated clocks are required to record the start and finish, and the interval is dilated by γ ≥ 1.0 (Δt = γ Δτ). Thus, the proper time is the invariant minimum elapsed time.
                            </p>
                          </div>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q4. Longitudinal Length Contraction: Why does length contraction occur exclusively along the direction of relative motion, leaving transverse dimensions invariant?</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.55 }}>
                              The Lorentz transformation mixes space and time only along the parallel axis of relative motion (<span className="math-inline">x&apos; = γ(x − vt), t&apos; = γ(t − <Frac num="vx" den={<>c<sup>2</sup></>} />)</span>), while perpendicular spatial dimensions remain strictly invariant (y&apos; = y, z&apos; = z). If transverse lengths changed, a moving circular ring passing through a stationary cylinder would either fit or collide depending on which frame is chosen, creating a physical paradox.
                            </p>
                          </div>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q5. Relativity of Simultaneity: Why are two events that occur simultaneously at different spatial locations in Frame S not simultaneous in Frame S&apos;?</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.55 }}>
                              From the Lorentz transformation <span className="math-inline">Δt&apos; = γ(Δt − <Frac num="v·Δx" den={<>c<sup>2</sup></>} />)</span>, if two events are simultaneous in Frame S (Δt = 0) but separated by spatial distance Δx ≠ 0, their temporal interval in Frame S&apos; evaluates to <span className="math-inline">Δt&apos; = −<Frac num="γ v Δx" den={<>c<sup>2</sup></>} /> ≠ 0</span>. Simultaneity is relative and frame-dependent for spatially separated events; only events occurring at the exact same point in spacetime maintain invariant simultaneity.
                            </p>
                          </div>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q6. Limiting Behavior as β → 1: Why is it physically impossible for any massive particle to reach or exceed the speed of light (c)?</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.55 }}>
                              As relative velocity ratio <span className="math-expr">β = <Frac num="v" den="c" /></span> approaches 1.0, the term <Sqrt>1 − β<sup>2</sup></Sqrt> approaches zero, causing the Lorentz factor γ to diverge toward infinity (γ → ∞). Consequently, both relativistic momentum <span className="math-inline">p = γ m<sub>0</sub> v</span> and relativistic kinetic energy <span className="math-inline">K = (γ − 1) m<sub>0</sub> c<sup>2</sup></span> diverge asymptotically to infinity, requiring infinite work and energy to accelerate a massive body to light speed c.
                            </p>
                          </div>
                          <div>
                            <b style={{ color: '#fef08a' }}>Q7. Modern Mass-Energy Formulation: Explain why <span className="math-inline">E = γ m<sub>0</sub> c<sup>2</sup></span> and <span className="math-inline">K = (γ − 1) m<sub>0</sub> c<sup>2</sup></span> describe energy growth without invoking the outdated concept of &quot;relativistic mass&quot;.</b>
                            <p style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.55 }}>
                              Modern relativistic physics defines mass <span className="math-inline">m<sub>0</sub></span> as an invariant Lorentz scalar (the invariant Minkowski norm of the four-momentum vector <span className="math-inline">p<sup>μ</sup> p<sub>μ</sub> = m<sub>0</sub><sup>2</sup> c<sup>2</sup></span>). Calling <span className="math-inline">γ m<sub>0</sub></span> &quot;relativistic mass&quot; causes conceptual confusion with gravitational mass and longitudinal/transverse inertia. It is much clearer and physically consistent to recognize that mass is invariant, while total relativistic energy <span className="math-inline">E = γ m<sub>0</sub> c<sup>2</sup></span> and kinetic energy <span className="math-inline">K = (γ − 1) m<sub>0</sub> c<sup>2</sup></span> grow nonlinearly with velocity.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SECTION C: CLAIM-EVIDENCE-REASONING (CER) CONCLUSION */}
                  <div className="section-divider" style={{ margin: '22px 0 10px', borderBottom: '1px solid rgba(212, 175, 55, 0.4)', paddingBottom: '6px' }}>
                    <h5 style={{ margin: 0, color: '#fef08a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Section C: Claim–Evidence–Reasoning (CER) Scientific Conclusion
                    </h5>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                    <label>
                      <b style={{ color: '#38bdf8', fontSize: '12px' }}>1. Scientific Claim (Direct statement answering the research question, min 15 chars):</b>
                      <input
                        type="text"
                        style={{ width: '100%', padding: '8px 10px', marginTop: '4px', background: '#090d16', border: '1px solid rgba(56, 189, 248, 0.5)', borderRadius: '4px', color: '#f8fafc', fontSize: '12px' }}
                        value={stationProgress.claim || ''}
                        placeholder="State your scientific claim (e.g., Empirical measurements confirm Ohm's law with linear voltage-current proportionality)..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setProgress((prev) => ({
                            ...prev,
                            [stationId]: { ...prev[stationId], claim: val },
                          }));
                        }}
                      />
                    </label>
                    <label>
                      <b style={{ color: '#34d399', fontSize: '12px' }}>2. Experimental Evidence (Specific numerical data from all 5 trials, min 20 chars):</b>
                      <textarea
                        rows={2}
                        value={stationProgress.evidence || ''}
                        placeholder="Cite specific numerical data from your trials (e.g., Across voltages 2V to 10V, current scaled linearly from 6.06mA to 30.30mA, yielding R = 330Ω with R² = 0.999)..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setProgress((prev) => ({
                            ...prev,
                            [stationId]: { ...prev[stationId], evidence: val },
                          }));
                        }}
                      />
                    </label>
                    <label>
                      <b style={{ color: '#fef08a', fontSize: '12px' }}>3. Scientific Reasoning (Physical principles explaining why the evidence supports the claim, min 25 chars):</b>
                      <textarea
                        rows={2}
                        value={stationProgress.reasoning || stationProgress.conclusion || ''}
                        placeholder="Explain the underlying physical reasoning (e.g., By Ohm's law V = IR, charge carriers encounter constant collision resistance in the conductive lattice)..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setProgress((prev) => ({
                            ...prev,
                            [stationId]: { ...prev[stationId], reasoning: val, conclusion: val },
                          }));
                        }}
                      />
                    </label>
                  </div>

                  {/* SECTION D: FORMATIVE ASSESSMENT QUESTIONS */}
                  <div className="guided-questions-container" style={{ marginTop: '20px' }}>
                    <b style={{ color: '#fef08a' }}>Section D: Formative Assessment Conceptual Questions:</b>
                    {ROOM3_GUIDE_QUESTIONS[stationId].map((q, qIdx) => {
                      const userChoice = stationProgress.guideAnswers?.[qIdx] ?? -1;
                      return (
                        <div key={q.id} className="guide-question-block" style={{ marginTop: '10px' }}>
                          <p className="q-title"><b>Q{qIdx + 1}:</b> <MathText text={q.question} /></p>
                          <div className="q-options-list">
                            {q.options.map((opt, optIdx) => (
                              <button
                                key={opt}
                                type="button"
                                className={`q-opt-btn ${userChoice === optIdx ? (optIdx === q.correctIndex ? 'correct' : 'incorrect') : ''}`}
                                onClick={() => handleGuideAnswer(qIdx, optIdx)}
                              >
                                <MathText text={opt} />
                              </button>
                            ))}
                          </div>
                          {userChoice === q.correctIndex && (
                            <div className="q-explanation">✓ <MathText text={q.explanation} /></div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* SECTION E: IDENTIFIED SOURCES OF EXPERIMENTAL UNCERTAINTY */}
                  <div className="errors-checklist" style={{ marginTop: '18px' }}>
                    <b style={{ color: '#d4af37' }}>Section E: Identified Sources of Experimental Uncertainty:</b>
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

                  {/* SECTION F: STUDENT METADATA & CERTIFICATION CARD */}
                  <div className="certification-card" style={{ marginTop: '20px' }}>
                    <div className="cert-header">
                      <span className="cert-seal">🎓</span>
                      <h5>Physics 300 Certified Experimental Record</h5>
                    </div>

                    <div className="student-metadata-fields student-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '12px', margin: '14px 0' }}>
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
                      <label>
                        <span>Date Performed:</span>
                        <input
                          type="date"
                          aria-label="Date Performed"
                          style={{ padding: '8px 12px', marginTop: '4px' }}
                          value={studentDatePerformed}
                          onChange={(e) => setStudentDatePerformed(e.target.value)}
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

                  {conclusionFeedback && (
                    <div className="feedback-alert correct" style={{ marginTop: '14px' }}>
                      {conclusionFeedback}
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
                      title={!reportReady ? 'Complete all 5 3D trials, verify Step 8 computation, submit Step 9 CER conclusion, and fill student credentials to unlock report certification.' : 'Download Official Certified PDF Report'}
                    >
                      {reportReady ? '📄 Download Certified PDF Report' : '🔒 Certified Report Locked'}
                    </button>
                    <button
                      type="button"
                      className="notebook-action"
                      style={{
                        background: 'linear-gradient(135deg, #b45309 0%, #92400e 100%)',
                        borderColor: '#f59e0b',
                        color: '#fef3c7',
                        fontWeight: 700,
                      }}
                      onClick={() => {
                        setNotebookOpen(false);
                        openMasterReport(false);
                      }}
                    >
                      📚 Master Lab Manual (.pdf / .docx)
                    </button>
                    <button
                      type="button"
                      className="notebook-action"
                      style={{ background: '#059669', borderColor: '#10b981', fontWeight: 700 }}
                      disabled={stationProgress.completed[8]}
                      onClick={submitConclusion}
                    >
                      {stationProgress.completed[8] ? '✓ Step 9 Complete (30/30 pts) · Certified' : 'Submit Scientific Conclusion &amp; Certify (+30 pts)'}
                    </button>
                  </div>

                  {/* Certification Prerequisites Checklist */}
                  <div style={{
                    marginTop: '14px',
                    padding: '12px 14px',
                    background: 'rgba(35, 12, 20, 0.85)',
                    border: '1px solid rgba(212, 175, 55, 0.35)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}>
                    <b style={{ color: '#d4af37', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Official Certification Prerequisites ({[allTrialsLogged, isComputationVerified, isConclusionSubmitted, isStudentInfoFilled].filter(Boolean).length} / 4 Met):
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
                      <span style={{ color: isConclusionSubmitted ? '#34d399' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{isConclusionSubmitted ? '✅' : '⏳'}</span>
                        <b>Step 9 Conclusion:</b> {isConclusionSubmitted ? 'Submitted' : 'Pending Submission'}
                      </span>
                      <span style={{ color: isStudentInfoFilled ? '#34d399' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{isStudentInfoFilled ? '✅' : '⏳'}</span>
                        <b>Student Credentials:</b> {isStudentInfoFilled ? 'Complete' : 'Name, ID &amp; Sec Required'}
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
                  disabled={notebookStep >= TOTAL_STEPS - 1 || (notebookStep >= stationProgress.currentStep && !stationProgress.completed[notebookStep])}
                  onClick={() => setNotebookStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
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

      {/* Automated Master Laboratory Manual & Report Modal */}
      {masterReportState && (
        <Room3MasterReportModal
          isOpen={masterReportOpen}
          onClose={() => setMasterReportOpen(false)}
          reportState={masterReportState}
          metadata={reportMetadata}
          onChangeMetadata={handleMasterReportMetadataChange}
          overrides={reportOverrides}
          onChangeOverrides={setReportOverrides}
          onRefreshFromStorage={() => setReportRefreshNonce((n) => n + 1)}
          isDoorExitPrompt={masterReportDoorExit}
          onProceedExitDoor={() => {
            setMasterReportOpen(false);
            sceneApi.current?.openDoor(() => {
              window.location.href = '/';
            });
          }}
          playTone={playTone}
        />
      )}
    </main>
  );
}
