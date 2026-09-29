'use client';

import { useMemo, useState } from 'react';
import type { StationId, TrialRecord } from './labModel';

export type GraphPoint = {
  trial: number;
  x: number;
  y: number;
  xLabel: string;
  yLabel: string;
  raw: TrialRecord;
};

export type RegressionResult = {
  slope: number;
  intercept: number;
  rSquared: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  physicalInterpretation: string;
  points: GraphPoint[];
};

export function computeRegressionData(stationId: StationId, trials: TrialRecord[]): RegressionResult | null {
  if (!trials || trials.length < 2) return null;

  const points: GraphPoint[] = [];

  trials.forEach((trial, index) => {
    const trialNum = Number(trial.trial ?? index + 1);
    if (stationId === 'wave') {
      // Station 1: Tension T (N) vs v^2 (m/s)^2
      // v^2 = (1/mu) * T -> slope is 1/mu
      const tension = Number(trial.tension ?? 36);
      const speed = Number(trial.speed ?? trial.theoretical ?? 30);
      const vSquared = speed * speed;
      points.push({
        trial: trialNum,
        x: tension,
        y: vSquared,
        xLabel: `${tension.toFixed(1)} N`,
        yLabel: `${vSquared.toFixed(1)} (m/s)²`,
        raw: trial,
      });
    } else if (stationId === 'sound') {
      // Station 2: Temperature t (°C) vs Speed v (m/s)
      // v = 331.3 + 0.606 * t
      const temp = Number(trial.temperature ?? 20);
      const speed = Number(trial.speed ?? trial.theoretical ?? 343);
      points.push({
        trial: trialNum,
        x: temp,
        y: speed,
        xLabel: `${temp.toFixed(1)} °C`,
        yLabel: `${speed.toFixed(1)} m/s`,
        raw: trial,
      });
    } else {
      // Station 3: 1/r^2 (m^-2) vs Force Fe (N)
      // F = (k * |q1 * q2|) * (1/r^2) -> slope = k * |q1 * q2|
      const r = Number(trial.separation ?? 0.6);
      const force = Number(trial.force ?? trial.theoretical ?? 0.6);
      const invRSquared = 1 / (r * r);
      points.push({
        trial: trialNum,
        x: invRSquared,
        y: force,
        xLabel: `${invRSquared.toFixed(2)} m⁻²`,
        yLabel: `${force.toFixed(3)} N`,
        raw: trial,
      });
    }
  });

  const n = points.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  points.forEach((p) => {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
    sumY2 += p.y * p.y;
  });

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Compute R^2
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  points.forEach((p) => {
    const yPred = slope * p.x + intercept;
    ssTot += Math.pow(p.y - meanY, 2);
    ssRes += Math.pow(p.y - yPred, 2);
  });
  const rSquared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;

  const xVals = points.map((p) => p.x);
  const yVals = points.map((p) => p.y);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);

  let physicalInterpretation = '';
  if (stationId === 'wave') {
    const expMu = slope > 0 ? 1 / slope : 0;
    physicalInterpretation = `Slope m = ${slope.toFixed(2)} (m/s)²/N ⇒ Experimental linear density μ_exp = 1/m = ${expMu.toFixed(4)} kg/m`;
  } else if (stationId === 'sound') {
    physicalInterpretation = `Slope m = ${slope.toFixed(3)} (m/s)/°C (theory: 0.606 m/s·°C) · Intercept v₀ = ${intercept.toFixed(1)} m/s (theory: 331.3 m/s)`;
  } else {
    // k * |q1 * q2|
    const q1 = Number(points[0].raw.q1 ?? 4) * 1e-6;
    const q2 = Math.abs(Number(points[0].raw.q2 ?? -6)) * 1e-6;
    const qProduct = q1 * q2;
    const expK = qProduct > 0 ? slope / qProduct : 0;
    physicalInterpretation = `Slope m = ${slope.toFixed(4)} N·m² ⇒ Experimental Coulomb constant k_exp = slope/(|q₁q₂|) = ${expK.toExponential(3)} N·m²/C²`;
  }

  return {
    slope,
    intercept,
    rSquared,
    xMin,
    xMax,
    yMin,
    yMax,
    physicalInterpretation,
    points,
  };
}

export function LabGraph({
  stationId,
  trials,
  accentColor = '#22d3ee',
}: {
  stationId: StationId;
  trials: TrialRecord[];
  accentColor?: string;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<GraphPoint | null>(null);

  const regression = useMemo(() => computeRegressionData(stationId, trials), [stationId, trials]);

  if (!regression || regression.points.length < 2) {
    return (
      <div className="lab-graph-empty">
        <span className="graph-empty-icon">📈</span>
        <b>INSUFFICIENT TRIAL DATA FOR REGRESSION</b>
        <p>Record at least 2 distinct experimental trials to generate the least-squares regression plot and determine physical constants.</p>
      </div>
    );
  }

  const { points, slope, intercept, rSquared, xMin, xMax, yMin, yMax, physicalInterpretation } = regression;

  // SVG dimensions
  const svgWidth = 560;
  const svgHeight = 310;
  const pad = { top: 25, right: 30, bottom: 45, left: 65 };
  const plotWidth = svgWidth - pad.left - pad.right;
  const plotHeight = svgHeight - pad.top - pad.bottom;

  // Add margin to domain
  const xSpan = Math.max(1e-4, xMax - xMin);
  const ySpan = Math.max(1e-4, yMax - yMin);
  const domainXMin = Math.max(0, xMin - xSpan * 0.15);
  const domainXMax = xMax + xSpan * 0.15;
  const domainYMin = Math.max(0, yMin - ySpan * 0.15);
  const domainYMax = yMax + ySpan * 0.15;

  const scaleX = (val: number) => pad.left + ((val - domainXMin) / (domainXMax - domainXMin)) * plotWidth;
  const scaleY = (val: number) => pad.top + plotHeight - ((val - domainYMin) / (domainYMax - domainYMin)) * plotHeight;

  // Regression line endpoints
  const lineX1 = domainXMin;
  const lineY1 = slope * lineX1 + intercept;
  const lineX2 = domainXMax;
  const lineY2 = slope * lineX2 + intercept;

  const ptLineX1 = scaleX(lineX1);
  const ptLineY1 = scaleY(lineY1);
  const ptLineX2 = scaleX(lineX2);
  const ptLineY2 = scaleY(lineY2);

  // Axis labels
  const axisTitles = {
    wave: { x: 'String Tension T (N)', y: 'Wave Speed Squared v² (m²/s²)', title: 'v² vs. Tension (Slope = 1/μ)' },
    sound: { x: 'Air Temperature t (°C)', y: 'Sound Speed v (m/s)', title: 'Sound Speed vs. Temperature' },
    electro: { x: 'Inverse-Square Separation 1/r² (m⁻²)', y: 'Coulomb Force Fₑ (N)', title: 'Coulomb Force vs. 1/r² (Slope = k|q₁q₂|)' },
  }[stationId];

  // Generate 4-5 ticks per axis
  const xTicks = [domainXMin, domainXMin + (domainXMax - domainXMin) * 0.33, domainXMin + (domainXMax - domainXMin) * 0.66, domainXMax];
  const yTicks = [domainYMin, domainYMin + (domainYMax - domainYMin) * 0.33, domainYMin + (domainYMax - domainYMin) * 0.66, domainYMax];

  return (
    <div className="lab-graph-card">
      <div className="lab-graph-header">
        <div className="graph-title-group">
          <span className="graph-badge">ACADEMIC REGRESSION ENGINE</span>
          <h4 className="graph-title">{axisTitles.title}</h4>
        </div>
        <div className="graph-metrics">
          <span className="metric-pill">
            <b>R² = {rSquared.toFixed(4)}</b>
          </span>
          <span className="metric-pill accent">
            <b>y = {slope >= 0 ? '' : '-'}{Math.abs(slope) >= 1000 ? slope.toExponential(2) : slope.toFixed(2)}x {intercept >= 0 ? '+' : '-'} {Math.abs(intercept) >= 1000 ? Math.abs(intercept).toExponential(2) : Math.abs(intercept).toFixed(2)}</b>
          </span>
        </div>
      </div>

      <div className="svg-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="regression-svg"
          role="img"
          aria-label={`Scatter plot and best fit regression line for ${axisTitles.title}`}
        >
          {/* Subtle Gridlines */}
          <g className="gridlines" stroke="rgba(255,255,255,0.08)" strokeDasharray="3,3">
            {xTicks.map((tick, i) => (
              <line key={`x-grid-${i}`} x1={scaleX(tick)} y1={pad.top} x2={scaleX(tick)} y2={pad.top + plotHeight} />
            ))}
            {yTicks.map((tick, i) => (
              <line key={`y-grid-${i}`} x1={pad.left} y1={scaleY(tick)} x2={pad.left + plotWidth} y2={scaleY(tick)} />
            ))}
          </g>

          {/* Plot Axes */}
          <g className="axes" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5">
            <line x1={pad.left} y1={pad.top + plotHeight} x2={pad.left + plotWidth} y2={pad.top + plotHeight} />
            <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotHeight} />
          </g>

          {/* Axis Ticks and Numeric Labels */}
          <g className="tick-labels" fill="rgba(255,255,255,0.6)" fontSize="10" fontFamily="monospace">
            {xTicks.map((tick, i) => (
              <text key={`xt-${i}`} x={scaleX(tick)} y={pad.top + plotHeight + 16} textAnchor="middle">
                {tick >= 1000 ? tick.toExponential(1) : tick.toFixed(1)}
              </text>
            ))}
            {yTicks.map((tick, i) => (
              <text key={`yt-${i}`} x={pad.left - 8} y={scaleY(tick) + 3} textAnchor="end">
                {tick >= 1000 ? tick.toExponential(1) : tick.toFixed(1)}
              </text>
            ))}
          </g>

          {/* Axis Titles */}
          <text
            x={pad.left + plotWidth / 2}
            y={svgHeight - 8}
            textAnchor="middle"
            fill="rgba(255,255,255,0.85)"
            fontSize="11"
            fontWeight="bold"
          >
            {axisTitles.x}
          </text>
          <text
            transform={`rotate(-90) translate(-${pad.top + plotHeight / 2}, 18)`}
            textAnchor="middle"
            fill="rgba(255,255,255,0.85)"
            fontSize="11"
            fontWeight="bold"
          >
            {axisTitles.y}
          </text>

          {/* Best-Fit Linear Regression Line */}
          <line
            x1={ptLineX1}
            y1={ptLineY1}
            x2={ptLineX2}
            y2={ptLineY2}
            stroke={accentColor}
            strokeWidth="2.5"
            strokeDasharray="none"
            opacity="0.85"
          />

          {/* Data Points */}
          {points.map((p) => {
            const cx = scaleX(p.x);
            const cy = scaleY(p.y);
            const isHovered = hoveredPoint?.trial === p.trial;
            return (
              <g
                key={`pt-${p.trial}`}
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Glow ring on hover */}
                {isHovered && (
                  <circle cx={cx} cy={cy} r="10" fill={accentColor} opacity="0.3" />
                )}
                {/* Outer ring */}
                <circle cx={cx} cy={cy} r="5.5" fill="#0f172a" stroke={accentColor} strokeWidth="2" />
                {/* Inner dot */}
                <circle cx={cx} cy={cy} r="2.5" fill="#ffffff" />
                {/* Data point trial tag */}
                <text
                  x={cx + 7}
                  y={cy - 6}
                  fill="rgba(255,255,255,0.7)"
                  fontSize="9"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                >
                  T{p.trial}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredPoint && (
          <div className="graph-tooltip">
            <strong>Trial {hoveredPoint.trial}</strong>
            <div>X: {hoveredPoint.xLabel}</div>
            <div>Y: {hoveredPoint.yLabel}</div>
            <div className="residual">
              Fit: {(slope * hoveredPoint.x + intercept).toFixed(2)} (Δ = {(hoveredPoint.y - (slope * hoveredPoint.x + intercept)).toFixed(2)})
            </div>
          </div>
        )}
      </div>

      <div className="physical-deduction-footer">
        <span className="deduction-icon">🔬</span>
        <div className="deduction-body">
          <b>Physical Law Deduction:</b>
          <p>{physicalInterpretation}</p>
        </div>
      </div>
    </div>
  );
}
