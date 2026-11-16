'use client';

import { LAB_MANUAL_EXPERIMENTS, ManualExperimentCatalogItem, ManualTextRun } from './labManualCatalog';
import {
  calculateCircuit,
  calculateOptics,
  calculateRelativity,
  CircuitSettings,
  OpticsSettings,
  RelativitySettings,
  Room3Progress,
  Room3StationId,
  StationProgress as Room3StationProgress,
  isStationFinished as isRoom3StationFinished,
  stationScore as room3StationScore,
} from './room3Model';
import {
  LabProgress as Room2Progress,
  StationId as Room2StationId,
  isStationFinished as isRoom2StationFinished,
  stationScore as room2StationScore,
} from './labModel';

export type ReportScope = 'all' | 'room3';

export type ReportMetadata = {
  studentName: string;
  studentId: string;
  section: string;
  instructorName: string;
  groupNumber: string;
  datePerformed: string;
  dateSubmitted: string;
  scope: ReportScope;
  includeAnswerKey: boolean;
};

export type RoomSourceStatus = 'live' | 'partial' | 'pending';

export type HydratedExperimentReport = {
  catalog: ManualExperimentCatalogItem;
  status: RoomSourceStatus;
  trialsLogged: number;
  trialsExpected: number;
  scoreText: string;
  // Ordered sequential replacements for '______' blank spans inside catalog.table1Caption
  table1CaptionBlanks: string[];
  table1Rows: string[][];
  table2Rows: string[][];
  // True only for cells filled from live telemetry (otherwise original template runs stay untouched)
  table1LiveMask: boolean[][];
  table2LiveMask: boolean[][];
  observationText: string;
  conclusionText: string;
  recommendationText: string;
  errorFactors: string[];
  hasCustomStudentNotes: boolean;
  completedDate?: string;
};

export type RoomCompletionSummary = {
  room1Completed: number;
  room1Total: number;
  room2Completed: number;
  room2Total: number;
  room3Completed: number;
  room3Total: number;
};

export type MasterReportState = {
  experiments: HydratedExperimentReport[];
  roomSummary: RoomCompletionSummary;
};

export type ReportOverrides = {
  table1Cells: Record<string, string>; // key: `${expNum}_${rowIdx}_${colIdx}`
  table2Cells: Record<string, string>; // key: `${expNum}_${rowIdx}_${colIdx}`
  observations: Record<number, string>;
  conclusions: Record<number, string>;
  recommendations: Record<number, string>;
  perExperimentDates: Record<number, string>;
};

export function createEmptyReportOverrides(): ReportOverrides {
  return {
    table1Cells: {},
    table2Cells: {},
    observations: {},
    conclusions: {},
    recommendations: {},
    perExperimentDates: {},
  };
}

export function runsToPlainText(runs: ManualTextRun[]): string {
  return runs.map((r) => r.t).join('');
}

/**
 * Replaces blank placeholder runs ("______" or "_____________") sequentially inside ManualTextRun[]
 * while preserving every subscript, superscript, and bold run untouched.
 */
export function fillBlankRuns(runs: ManualTextRun[], values: string[]): ManualTextRun[] {
  if (!values.length) return runs;
  let vi = 0;
  return runs.map((r) => {
    if (!/_{3,}/.test(r.t) || vi >= values.length) return r;
    const nextText = r.t.replace(/_{3,}/g, () => {
      const replacement = values[vi];
      vi += 1;
      return replacement !== undefined && replacement !== '' ? replacement : '______';
    });
    return { ...r, t: nextText };
  });
}

const signedFmt = (val: unknown, digits = 1): string => {
  const n = Number(val);
  if (!Number.isFinite(n)) return '';
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;
};

const IN_TO_CM = 2.54;
const FT3_TO_LITERS = 28.3168466;
const FT2_TO_CM2 = 929.0304;
const FT_TO_M = 0.3048;
const PSI_TO_PA = 6894.757;

type Room1Trial = {
  n?: number;
  p?: Record<string, unknown>;
  m?: Record<string, unknown>;
  t?: Record<string, unknown>;
};

type Room1StationSaved = {
  status?: string;
  scores?: Record<string, number>;
  recordedTrials?: Room1Trial[];
  analysisObs?: string;
  completedAt?: string | null;
};

type Room1Saved = {
  completedModules?: string[];
  stations?: Record<string, Room1StationSaved>;
};

function readRoom1Storage(): Room1Saved | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('physicsLabProgression');
    return raw ? (JSON.parse(raw) as Room1Saved) : null;
  } catch {
    return null;
  }
}

function readRoom2Storage(): Room2Progress | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('waveElectroVirtualLabProgressV1');
    return raw ? (JSON.parse(raw) as Room2Progress) : null;
  } catch {
    return null;
  }
}

function templateRowsToStringGrid(templateRows: ManualTextRun[][][]): string[][] {
  return templateRows.map((row) => row.map((cell) => runsToPlainText(cell).trim()));
}

function emptyMaskFor(rows: string[][]): boolean[][] {
  return rows.map((row) => row.map(() => false));
}

function setLiveCell(
  rows: string[][],
  mask: boolean[][],
  rowIdx: number,
  colIdx: number,
  val: string
) {
  if (!rows[rowIdx] || colIdx >= rows[rowIdx].length) return;
  rows[rowIdx][colIdx] = val;
  mask[rowIdx][colIdx] = true;
}

function hydrateRoom1Experiment(
  catalog: ManualExperimentCatalogItem,
  room1: Room1Saved | null
): HydratedExperimentReport {
  const st = room1?.stations?.[catalog.stationId];
  const trials = Array.isArray(st?.recordedTrials) ? st.recordedTrials : [];
  const t1Rows = templateRowsToStringGrid(catalog.table1TemplateRows);
  const t2Rows = templateRowsToStringGrid(catalog.table2TemplateRows);
  const t1Mask = emptyMaskFor(t1Rows);
  const t2Mask = emptyMaskFor(t2Rows);
  const trialsExpected = 3;
  const completedFlag =
    st?.status === 'COMPLETED' || Boolean(room1?.completedModules?.includes(catalog.stationId));
  const totalPts = st?.scores
    ? Object.values(st.scores).reduce((acc, v) => acc + (Number(v) || 0), 0)
    : 0;

  let status: RoomSourceStatus = 'pending';
  if (completedFlag || trials.length >= trialsExpected) status = 'live';
  else if (trials.length > 0 || totalPts > 0) status = 'partial';

  let table1CaptionBlanks: string[] = [];

  if (catalog.number === 1 && trials.length > 0) {
    const firstP = trials[0]?.p ?? {};
    const d1Cm = Number(firstP.d1 ?? 4.5) * IN_TO_CM;
    const qLs = Number(firstP.q ?? 0.18) * FT3_TO_LITERS;
    table1CaptionBlanks = [d1Cm.toFixed(2), qLs.toFixed(2)];

    trials.slice(0, 3).forEach((tr, idx) => {
      const d2Cm = Number(tr.p?.d2 ?? 0) * IN_TO_CM;
      const a1Cm2 = Number(tr.t?.A1 ?? 0) * FT2_TO_CM2;
      const a2Cm2 = Number(tr.t?.A2 ?? 0) * FT2_TO_CM2;
      const v1Ms = Number(tr.t?.v1 ?? 0) * FT_TO_M;
      const v2Ms = Number(tr.t?.v2 ?? 0) * FT_TO_M;
      const dpExpPa = Number(tr.m?.dp ?? 0) * PSI_TO_PA;
      const dpTheoPa = Number(tr.t?.dp ?? 0) * PSI_TO_PA;
      const pctErr = dpTheoPa > 0 ? (Math.abs(dpExpPa - dpTheoPa) / dpTheoPa) * 100 : 0;

      setLiveCell(t1Rows, t1Mask, idx, 1, `${d2Cm.toFixed(2)} cm`);
      setLiveCell(t1Rows, t1Mask, idx, 2, `${a1Cm2.toFixed(2)}`);
      setLiveCell(t1Rows, t1Mask, idx, 3, `${a2Cm2.toFixed(2)}`);
      setLiveCell(t1Rows, t1Mask, idx, 4, `${v1Ms.toFixed(3)}`);

      setLiveCell(t2Rows, t2Mask, idx, 0, `Trial ${idx + 1} (${d2Cm.toFixed(2)} cm)`);
      setLiveCell(t2Rows, t2Mask, idx, 1, `${v2Ms.toFixed(3)}`);
      setLiveCell(t2Rows, t2Mask, idx, 2, `${dpExpPa.toFixed(1)}`);
      setLiveCell(t2Rows, t2Mask, idx, 3, `${dpTheoPa.toFixed(1)}`);
      setLiveCell(t2Rows, t2Mask, idx, 4, `${pctErr.toFixed(2)}%`);
    });
  } else if (catalog.number === 2 && trials.length > 0) {
    const mCu = Number(trials[0]?.p?.m_c ?? 180);
    table1CaptionBlanks = [mCu.toFixed(1)];

    trials.slice(0, 3).forEach((tr, idx) => {
      const mW = Number(tr.p?.m_w ?? 180);
      const mIce = Number(tr.p?.m_ice ?? 70);
      const tInit = Number(tr.p?.t_w ?? 45);
      const tFinal = Number(tr.m?.Tf ?? tr.t?.Tf ?? 0);
      const qWarm = Number(tr.t?.Qwarm ?? 0);
      const sensibleIceHeat = mIce * 1.0 * Math.max(0, tFinal);
      const lfExp = Number(tr.m?.Lf ?? tr.t?.Lf ?? 79.5);
      const pctErr = (Math.abs(lfExp - 79.5) / 79.5) * 100;

      setLiveCell(t1Rows, t1Mask, idx, 1, `${mW.toFixed(1)} g`);
      setLiveCell(t1Rows, t1Mask, idx, 2, `${mIce.toFixed(1)} g`);
      setLiveCell(t1Rows, t1Mask, idx, 3, `${tInit.toFixed(1)}`);
      setLiveCell(t1Rows, t1Mask, idx, 4, `${tFinal.toFixed(2)}`);

      setLiveCell(t2Rows, t2Mask, idx, 0, `Trial ${idx + 1} (${mIce.toFixed(0)} g)`);
      setLiveCell(t2Rows, t2Mask, idx, 1, `${qWarm.toFixed(1)}`);
      setLiveCell(t2Rows, t2Mask, idx, 2, `${sensibleIceHeat.toFixed(1)}`);
      setLiveCell(t2Rows, t2Mask, idx, 3, `${lfExp.toFixed(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 4, `${pctErr.toFixed(2)}%`);
    });
  } else if (catalog.number === 3 && trials.length > 0) {
    const d0Mm = Number(trials[0]?.p?.d0 ?? 50);
    table1CaptionBlanks = [d0Mm.toFixed(3)];

    const alphas: number[] = [];
    const errs: number[] = [];
    trials.slice(0, 3).forEach((tr, idx) => {
      const dt = Number(tr.p?.dt ?? tr.m?.dt ?? 50);
      const tf = 20.0 + dt;
      const df = Number(tr.m?.df ?? tr.t?.df ?? d0Mm);
      const deltaD = Number(tr.m?.deltaD ?? tr.t?.deltaD ?? df - d0Mm);
      const ratioMilli = (deltaD / Math.max(0.001, d0Mm)) * 1e3;
      const alphaMicro = Number(tr.m?.alpha ?? tr.t?.alpha ?? 23e-6) * 1e6;
      const pctErr = (Math.abs(alphaMicro - 23.0) / 23.0) * 100;
      alphas.push(alphaMicro);
      errs.push(pctErr);

      setLiveCell(t1Rows, t1Mask, idx, 1, `${dt.toFixed(1)} °C`);
      setLiveCell(t1Rows, t1Mask, idx, 2, `${tf.toFixed(1)} °C`);
      setLiveCell(t1Rows, t1Mask, idx, 3, `${df.toFixed(4)}`);
      setLiveCell(t1Rows, t1Mask, idx, 4, `${deltaD.toFixed(4)}`);

      setLiveCell(t2Rows, t2Mask, idx, 1, `${ratioMilli.toFixed(3)}`);
      setLiveCell(t2Rows, t2Mask, idx, 2, `${alphaMicro.toFixed(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 4, `${pctErr.toFixed(2)}%`);
    });
    if (alphas.length > 0 && t2Rows[3]) {
      const meanA = alphas.reduce((a, b) => a + b, 0) / alphas.length;
      const meanE = errs.reduce((a, b) => a + b, 0) / errs.length;
      setLiveCell(t2Rows, t2Mask, 3, 2, `${meanA.toFixed(2)}`);
      setLiveCell(t2Rows, t2Mask, 3, 4, `${meanE.toFixed(2)}%`);
    }
  } else if (catalog.number === 4 && trials.length > 0) {
    trials.slice(0, 3).forEach((tr, idx) => {
      const modeRaw = String(tr.p?.hx_mode ?? tr.m?.mode ?? 'counter').toLowerCase();
      const modeLabel = modeRaw.includes('parallel') ? 'Parallel Flow' : 'Counter Flow';
      const mh = Number(tr.p?.mh ?? 0.04);
      const mc = Number(tr.p?.mc ?? 0.05);
      const thIn = Number(tr.m?.th1 ?? tr.t?.th1 ?? 65);
      const thOut = Number(tr.m?.th2 ?? tr.t?.th2 ?? 43);
      const tcIn = Number(tr.m?.tc1 ?? tr.t?.tc1 ?? 18);
      const tcOut = Number(tr.m?.tc2 ?? tr.t?.tc2 ?? 35);
      const dt1 = Number(tr.m?.dt1 ?? tr.t?.dt1 ?? 0);
      const dt2 = Number(tr.m?.dt2 ?? tr.t?.dt2 ?? 0);
      const lmtd = Number(tr.m?.lmtd ?? tr.t?.lmtd ?? 0);
      const qh = Number(tr.m?.qh ?? tr.t?.qh ?? 0);

      setLiveCell(t1Rows, t1Mask, idx, 0, `Trial ${idx + 1}: ${modeLabel}`);
      setLiveCell(t1Rows, t1Mask, idx, 1, `${mh.toFixed(3)} / ${mc.toFixed(3)}`);
      setLiveCell(t1Rows, t1Mask, idx, 2, `${thIn.toFixed(1)} °C`);
      setLiveCell(t1Rows, t1Mask, idx, 3, `${thOut.toFixed(1)}`);
      setLiveCell(t1Rows, t1Mask, idx, 4, `${tcIn.toFixed(1)} °C / ${tcOut.toFixed(1)} °C`);

      setLiveCell(t2Rows, t2Mask, idx, 0, `Trial ${idx + 1}: ${modeLabel}`);
      setLiveCell(t2Rows, t2Mask, idx, 1, `${dt1.toFixed(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 2, `${dt2.toFixed(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 3, `${lmtd.toFixed(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 4, `${qh.toFixed(1)}`);
    });
  }

  const customObs = (st?.analysisObs || '').trim();
  const completedIso = typeof st?.completedAt === 'string' && st.completedAt.length >= 10
    ? st.completedAt.slice(0, 10)
    : undefined;

  return {
    catalog,
    status,
    trialsLogged: trials.length,
    trialsExpected,
    scoreText: totalPts > 0 || completedFlag ? `${totalPts} / 100 pts` : 'Not attempted',
    table1CaptionBlanks,
    table1Rows: t1Rows,
    table2Rows: t2Rows,
    table1LiveMask: t1Mask,
    table2LiveMask: t2Mask,
    observationText: customObs || runsToPlainText(catalog.defaultObservation),
    conclusionText: runsToPlainText(catalog.defaultConclusion),
    recommendationText: runsToPlainText(catalog.defaultRecommendation),
    errorFactors: [],
    hasCustomStudentNotes: customObs.length > 0,
    completedDate: completedIso,
  };
}

function hydrateRoom2Experiment(
  catalog: ManualExperimentCatalogItem,
  room2: Room2Progress | null
): HydratedExperimentReport {
  const stationKey = catalog.stationId as Room2StationId;
  const st = room2?.[stationKey];
  const trials = Array.isArray(st?.trials) ? st.trials : [];
  const t1Rows = templateRowsToStringGrid(catalog.table1TemplateRows);
  const t2Rows = templateRowsToStringGrid(catalog.table2TemplateRows);
  const t1Mask = emptyMaskFor(t1Rows);
  const t2Mask = emptyMaskFor(t2Rows);
  const trialsExpected = 5;

  const isDone = st ? isRoom2StationFinished(st) : false;
  const stepDoneCount = st?.completed?.filter(Boolean).length ?? 0;

  let status: RoomSourceStatus = 'pending';
  if (isDone || trials.length >= trialsExpected) status = 'live';
  else if (trials.length > 0 || stepDoneCount > 0) status = 'partial';

  if (catalog.number === 5 && trials.length > 0) {
    trials.slice(0, 5).forEach((tr, idx) => {
      const T = Number(tr.tension ?? 36);
      const mu = Number(tr.density ?? 0.04);
      const f = Number(tr.f ?? 2);
      const lam = Number(tr.wavelength ?? 15);
      const vTheo = Number(tr.theoretical ?? Math.sqrt(T / Math.max(1e-6, mu)));
      const vExp = Number(tr.speed ?? f * lam);
      const omega = 2 * Math.PI * f;
      const k = lam > 0 ? (2 * Math.PI) / lam : 0;

      setLiveCell(t1Rows, t1Mask, idx, 1, `${T.toFixed(1)} N`);
      setLiveCell(t1Rows, t1Mask, idx, 2, `${mu.toFixed(3)} kg/m`);
      setLiveCell(t1Rows, t1Mask, idx, 3, `${f.toFixed(2)} Hz`);
      setLiveCell(t1Rows, t1Mask, idx, 4, `${lam.toFixed(3)}`);

      setLiveCell(t2Rows, t2Mask, idx, 1, `${vTheo.toFixed(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 2, `${vExp.toFixed(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 3, `${omega.toFixed(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 4, `${k.toFixed(3)}`);
    });
  } else if (catalog.number === 6 && trials.length > 0) {
    trials.slice(0, 5).forEach((tr, idx) => {
      const tube = String(tr.tube ?? 'closed').toLowerCase() === 'open' ? 'Open' : 'Closed';
      const tempC = Number(tr.temperature ?? 20);
      const L = Number(tr.length ?? 0.78);
      const f = Number(tr.f ?? 110);
      const vExp = Number(tr.speed ?? 332 + 0.6 * tempC);
      const vTheo = Number(tr.theoretical ?? 332 + 0.6 * tempC);
      const lam = Number(tr.wavelength ?? vExp / Math.max(1, f));
      const f1 = tube === 'Closed' ? vTheo / (4 * Math.max(0.01, L)) : vTheo / (2 * Math.max(0.01, L));
      const d = Number(tr.distance ?? 1.5);
      const intensity = Number(tr.intensity ?? 0.01 / (4 * Math.PI * d * d));
      const decibels = Number(tr.decibels ?? 10 * Math.log10(Math.max(1e-12, intensity) / 1e-12));

      setLiveCell(t1Rows, t1Mask, idx, 0, `Trial ${idx + 1} (${tube})`);
      setLiveCell(t1Rows, t1Mask, idx, 1, `${tempC.toFixed(1)} °C`);
      setLiveCell(t1Rows, t1Mask, idx, 2, `${L.toFixed(2)} m`);
      setLiveCell(t1Rows, t1Mask, idx, 3, `${f.toFixed(1)} Hz`);
      setLiveCell(t1Rows, t1Mask, idx, 4, `${vExp.toFixed(2)}`);

      setLiveCell(t2Rows, t2Mask, idx, 1, `${lam.toFixed(3)}`);
      setLiveCell(t2Rows, t2Mask, idx, 2, `${f1.toFixed(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 3, `${d.toFixed(2)} m`);
      setLiveCell(t2Rows, t2Mask, idx, 4, `${intensity.toExponential(2)} / ${decibels.toFixed(2)} dB`);
    });
  } else if (catalog.number === 7 && trials.length > 0) {
    trials.slice(0, 5).forEach((tr, idx) => {
      const q1 = Number(tr.q1 ?? 4);
      const q2 = Number(tr.q2 ?? -6);
      const r = Number(tr.separation ?? 0.6);
      const rel = String(tr.relationship ?? (q1 * q2 < 0 ? 'Attractive' : 'Repulsive'));
      const force = Number(tr.force ?? 0);
      const field = Number(tr.field ?? 0);
      const potential = Number(tr.potential ?? 0);
      const energy = Number(tr.energy ?? 0);

      setLiveCell(t1Rows, t1Mask, idx, 1, `${signedFmt(q1, 1)} μC`);
      setLiveCell(t1Rows, t1Mask, idx, 2, `${signedFmt(q2, 1)} μC`);
      setLiveCell(t1Rows, t1Mask, idx, 3, `${r.toFixed(2)} m`);
      setLiveCell(t1Rows, t1Mask, idx, 4, rel);

      setLiveCell(t2Rows, t2Mask, idx, 1, `${force.toFixed(4)}`);
      setLiveCell(t2Rows, t2Mask, idx, 2, `${field.toExponential(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 3, `${potential.toExponential(2)}`);
      setLiveCell(t2Rows, t2Mask, idx, 4, `${energy.toFixed(3)}`);
    });
  }

  const obs = (st?.analysis || '').trim();
  const conc = (st?.conclusion || '').trim();
  const rec = (st?.recommendations || '').trim();

  return {
    catalog,
    status,
    trialsLogged: trials.length,
    trialsExpected,
    scoreText: stepDoneCount > 0 && st ? `${room2StationScore(st)} / 100 pts` : 'Not attempted',
    table1CaptionBlanks: [],
    table1Rows: t1Rows,
    table2Rows: t2Rows,
    table1LiveMask: t1Mask,
    table2LiveMask: t2Mask,
    observationText: obs || runsToPlainText(catalog.defaultObservation),
    conclusionText: conc || runsToPlainText(catalog.defaultConclusion),
    recommendationText: rec || runsToPlainText(catalog.defaultRecommendation),
    errorFactors: Array.isArray(st?.errors) ? st.errors : [],
    hasCustomStudentNotes: Boolean(obs || conc || rec),
  };
}

function hydrateRoom3Experiment(
  catalog: ManualExperimentCatalogItem,
  room3: Room3Progress,
  liveCircuits: CircuitSettings,
  liveOptics: OpticsSettings,
  liveRelativity: RelativitySettings
): HydratedExperimentReport {
  const stationKey = catalog.stationId as Room3StationId;
  const st: Room3StationProgress = room3[stationKey];
  const trials = Array.isArray(st.trials) ? st.trials : [];
  const t1Rows = templateRowsToStringGrid(catalog.table1TemplateRows);
  const t2Rows = templateRowsToStringGrid(catalog.table2TemplateRows);
  const t1Mask = emptyMaskFor(t1Rows);
  const t2Mask = emptyMaskFor(t2Rows);
  const trialsExpected = 5;

  const isDone = isRoom3StationFinished(st);
  const completedSteps = st.completed.filter(Boolean).length;
  let status: RoomSourceStatus = 'pending';
  if (isDone || trials.length >= trialsExpected) status = 'live';
  else if (trials.length > 0 || completedSteps > 0) status = 'partial';

  let table1CaptionBlanks: string[] = [];

  if (catalog.number === 8) {
    const r1 = liveCircuits.r1 || 100;
    const r2 = liveCircuits.r2 || 220;
    const r3 = liveCircuits.r3 || 330;
    const topo = String(trials[0]?.topology ?? liveCircuits.topology ?? 'series');
    const topoRes = calculateCircuit({
      ...liveCircuits,
      topology: topo as CircuitSettings['topology'],
      mode: 'dc',
    });

    if (trials.length > 0 || status !== 'pending') {
      table1CaptionBlanks = [topo.toUpperCase(), topoRes.req.toFixed(2)];
    }

    if (trials.length > 0) {
      const rValues: number[] = [];
      trials.slice(0, 5).forEach((tr, idx) => {
        const vs = Number(tr.measuredV ?? tr.vs ?? (idx + 1) * 2);
        const iMa = Number(tr.measuredI_mA ?? 0);
        const rExp = Number(tr.resistance ?? (iMa > 0 ? (vs * 1000) / iMa : 0));
        const power = Number(tr.powerW ?? (vs * iMa) / 1000);
        if (rExp > 0) rValues.push(rExp);

        setLiveCell(t1Rows, t1Mask, idx, 1, `${vs.toFixed(2)} V`);
        setLiveCell(t1Rows, t1Mask, idx, 2, `${iMa.toFixed(2)}`);
        setLiveCell(t1Rows, t1Mask, idx, 3, `${rExp.toFixed(2)}`);
        setLiveCell(t1Rows, t1Mask, idx, 4, `${power.toFixed(4)}`);
      });
      if (rValues.length > 0) {
        const meanR = rValues.reduce((a, b) => a + b, 0) / rValues.length;
        setLiveCell(t1Rows, t1Mask, 5, 3, `${meanR.toFixed(2)} Ω`);
      }
    }

    // Table 2: Rows 0..3 keep original subscript labels & values unless resistors changed from defaults (100/220/330);
    // Row 4 (AC RLC f = 60 Hz) populates live from circuit engine once started
    if (r1 !== 100 || r2 !== 220 || r3 !== 330) {
      (['single', 'series', 'parallel', 'combo'] as CircuitSettings['topology'][]).forEach(
        (tp, idx) => {
          const dcRes = calculateCircuit({ ...liveCircuits, mode: 'dc', topology: tp, r1, r2, r3 });
          setLiveCell(t2Rows, t2Mask, idx, 1, `${dcRes.req.toFixed(2)} Ω`);
          setLiveCell(t2Rows, t2Mask, idx, 3, `${dcRes.req.toFixed(2)} Ω`);
        }
      );
    }
    if (status !== 'pending') {
      const acRes = calculateCircuit({ ...liveCircuits, mode: 'ac', freq: 60, r1, r2, r3 });
      setLiveCell(t2Rows, t2Mask, 4, 1, `${acRes.req.toFixed(2)} Ω`);
      setLiveCell(
        t2Rows,
        t2Mask,
        4,
        2,
        `${acRes.netReactance >= 0 ? '+' : '−'}${Math.abs(acRes.netReactance).toFixed(2)} Ω`
      );
      setLiveCell(t2Rows, t2Mask, 4, 3, `${acRes.impedance.toFixed(2)} Ω`);
      setLiveCell(
        t2Rows,
        t2Mask,
        4,
        4,
        `${acRes.phaseAngleDeg >= 0 ? '+' : '−'}${Math.abs(acRes.phaseAngleDeg).toFixed(2)}° / ${acRes.powerFactor.toFixed(3)}`
      );
    }
  } else if (catalog.number === 9) {
    if (trials.length > 0) {
      const fVals: number[] = [];
      trials.slice(0, 5).forEach((tr, idx) => {
        const u = Number(tr.u ?? tr.paramA ?? 30);
        const v = Number(tr.v ?? tr.measured ?? 60);
        const fExp = Number(tr.f_exp ?? (u * v) / Math.max(0.1, u + v));
        const mag = u > 0 ? -v / u : 0;
        fVals.push(fExp);

        setLiveCell(t1Rows, t1Mask, idx, 1, `${u.toFixed(1)} cm`);
        setLiveCell(t1Rows, t1Mask, idx, 2, `${v.toFixed(2)}`);
        setLiveCell(t1Rows, t1Mask, idx, 3, `${fExp.toFixed(2)}`);
        setLiveCell(t1Rows, t1Mask, idx, 4, `${mag.toFixed(2)}×`);
      });
      if (fVals.length > 0) {
        const fMean = fVals.reduce((a, b) => a + b, 0) / fVals.length;
        const pctErr = (Math.abs(fMean - 20.0) / 20.0) * 100;
        setLiveCell(t1Rows, t1Mask, 5, 3, `f_mean = ${fMean.toFixed(2)} cm`);
        setLiveCell(t1Rows, t1Mask, 5, 4, `% Error = ${pctErr.toFixed(2)}%`);
      }
    }

    if (status !== 'pending') {
      const snell = calculateOptics({ ...liveOptics, n1: 1.0, n2: 1.52, theta1: 30, wavelength: 532 });
      const crit = calculateOptics({ ...liveOptics, n1: 1.52, n2: 1.0, theta1: 30, wavelength: 532 });
      const slitDeltaY = ((532e-9 * 1.5) / 0.25e-3) * 1000;
      const theta2Meas = snell.theta2Deg ?? 19.2;
      const critMeas = crit.criticalAngleDeg ?? 41.14;

      // Keep cols 0, 1, 3 (Sub-Mode, Input Parameters with subscripts, Theoretical Value) untouched
      setLiveCell(t2Rows, t2Mask, 0, 2, `θ₂ = ${theta2Meas.toFixed(2)}°`);
      setLiveCell(t2Rows, t2Mask, 0, 4, `${((Math.abs(theta2Meas - 19.2) / 19.2) * 100).toFixed(2)}%`);

      setLiveCell(t2Rows, t2Mask, 1, 2, `θ_c = ${critMeas.toFixed(2)}°`);
      setLiveCell(t2Rows, t2Mask, 1, 4, `${((Math.abs(critMeas - 41.14) / 41.14) * 100).toFixed(2)}%`);

      setLiveCell(t2Rows, t2Mask, 2, 2, `Δy = ${slitDeltaY.toFixed(2)} mm`);
      setLiveCell(t2Rows, t2Mask, 2, 4, `${((Math.abs(slitDeltaY - 3.192) / 3.192) * 100).toFixed(2)}%`);
    }
  } else if (catalog.number === 10 && trials.length > 0) {
    const E0 = 0.511;
    trials.slice(0, 5).forEach((tr, idx) => {
      const beta = Number(tr.beta ?? [0.1, 0.3, 0.5, 0.7, 0.9][idx] ?? 0.5);
      const rel = calculateRelativity({ ...liveRelativity, beta, properTime: 6.671, properLength: 10.0 });
      const gamma = Number(tr.gamma ?? rel.gamma);
      const dt = Number(tr.dilatedTime ?? rel.dilatedTime);
      const length = Number(tr.contractedLength ?? rel.contractedLength);

      setLiveCell(t1Rows, t1Mask, idx, 1, `${beta.toFixed(2)}`);
      setLiveCell(t1Rows, t1Mask, idx, 2, `${gamma.toFixed(4)}`);
      setLiveCell(t1Rows, t1Mask, idx, 3, `${dt.toFixed(3)}`);
      setLiveCell(t1Rows, t1Mask, idx, 4, `${length.toFixed(3)}`);

      const eTot = gamma * E0;
      const kRel = (gamma - 1) * E0;
      const kClass = 0.5 * beta * beta * E0;
      setLiveCell(t2Rows, t2Mask, idx, 1, `${gamma.toFixed(4)}`);
      setLiveCell(t2Rows, t2Mask, idx, 2, `${eTot.toFixed(4)}`);
      setLiveCell(t2Rows, t2Mask, idx, 3, `${kRel.toFixed(4)}`);
      setLiveCell(t2Rows, t2Mask, idx, 4, `${kClass.toFixed(4)}`);
    });
  }

  const obs = (st.observations || st.analysis || '').trim();
  const cerParts = [
    st.claim?.trim() ? `Claim: ${st.claim.trim()}` : '',
    st.evidence?.trim() ? `Evidence: ${st.evidence.trim()}` : '',
    st.reasoning?.trim() ? `Reasoning: ${st.reasoning.trim()}` : '',
  ].filter(Boolean);
  const conc = cerParts.length > 0 ? cerParts.join(' ') : (st.conclusion || '').trim();
  const rec = (st.recommendations || '').trim();

  return {
    catalog,
    status,
    trialsLogged: trials.length,
    trialsExpected,
    scoreText: `${room3StationScore(st)} / 100 pts`,
    table1CaptionBlanks,
    table1Rows: t1Rows,
    table2Rows: t2Rows,
    table1LiveMask: t1Mask,
    table2LiveMask: t2Mask,
    observationText: obs || runsToPlainText(catalog.defaultObservation),
    conclusionText: conc || runsToPlainText(catalog.defaultConclusion),
    recommendationText: rec || runsToPlainText(catalog.defaultRecommendation),
    errorFactors: Array.isArray(st.errors) ? st.errors : [],
    hasCustomStudentNotes: Boolean(obs || conc || rec),
  };
}

export function hydrateMasterReportFromStorage(
  room3: Room3Progress,
  liveCircuits: CircuitSettings,
  liveOptics: OpticsSettings,
  liveRelativity: RelativitySettings
): MasterReportState {
  const room1 = readRoom1Storage();
  const room2 = readRoom2Storage();

  const experiments = LAB_MANUAL_EXPERIMENTS.map((catalog) => {
    if (catalog.room === 1) return hydrateRoom1Experiment(catalog, room1);
    if (catalog.room === 2) return hydrateRoom2Experiment(catalog, room2);
    return hydrateRoom3Experiment(catalog, room3, liveCircuits, liveOptics, liveRelativity);
  });

  const isDone = (exp: HydratedExperimentReport) => exp.status === 'live';

  return {
    experiments,
    roomSummary: {
      room1Completed: experiments.filter((e) => e.catalog.room === 1 && isDone(e)).length,
      room1Total: 4,
      room2Completed: experiments.filter((e) => e.catalog.room === 2 && isDone(e)).length,
      room2Total: 3,
      room3Completed: experiments.filter((e) => e.catalog.room === 3 && isDone(e)).length,
      room3Total: 3,
    },
  };
}

export function isCellModifiedOrLive(
  liveMask: boolean[][],
  overrides: Record<string, string>,
  expNumber: number,
  rowIdx: number,
  colIdx: number
): boolean {
  const key = `${expNumber}_${rowIdx}_${colIdx}`;
  return Object.prototype.hasOwnProperty.call(overrides, key) || Boolean(liveMask[rowIdx]?.[colIdx]);
}

export function getResolvedCellValue(
  baseRows: string[][],
  overrides: Record<string, string>,
  expNumber: number,
  rowIdx: number,
  colIdx: number
): string {
  const key = `${expNumber}_${rowIdx}_${colIdx}`;
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return overrides[key];
  }
  return baseRows[rowIdx]?.[colIdx] ?? '';
}

export function getResolvedDatePerformed(
  exp: HydratedExperimentReport,
  metadata: ReportMetadata,
  overrides: ReportOverrides
): string {
  if (Object.prototype.hasOwnProperty.call(overrides.perExperimentDates, exp.catalog.number)) {
    return overrides.perExperimentDates[exp.catalog.number];
  }
  return exp.completedDate || metadata.datePerformed;
}
