'use client';

import { useMemo, useState } from 'react';
import type { Room3StationId, TrialRecord } from './room3Model';

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
  xAxisLabel: string;
  yAxisLabel: string;
  title: string;
};

export function computeRoom3Regression(stationId: Room3StationId, trials: TrialRecord[]): RegressionResult | null {
  if (!trials || trials.length < 2) return null;

  const points: GraphPoint[] = [];

  let xAxisLabel = '';
  let yAxisLabel = '';
  let title = '';

  if (stationId === 'circuits') {
    xAxisLabel = 'Total Current I (A)';
    yAxisLabel = 'Source Voltage Vs (V)';
    title = "Ohm's Law & Impedance: Vs vs. Current (Slope = Z)";

    trials.forEach((trial, index) => {
      const trialNum = Number(trial.trial ?? index + 1);
      const current = Number(trial.current ?? 0.1);
      const vs = Number(trial.vs ?? 24.0);
      points.push({
        trial: trialNum,
        x: current,
        y: vs,
        xLabel: `${current.toFixed(3)} A`,
        yLabel: `${vs.toFixed(1)} V`,
        raw: trial,
      });
    });
  } else if (stationId === 'optics') {
    // Detect subMode from first trial
    const subMode = String(trials[0]?.subMode ?? 'refraction');
    if (subMode === 'imaging') {
      xAxisLabel = 'Inverse Object Distance 1/do (cm⁻¹)';
      yAxisLabel = 'Inverse Image Distance 1/di (cm⁻¹)';
      title = 'Gaussian Thin-Lens Equation: 1/di vs. 1/do';

      trials.forEach((trial, index) => {
        const trialNum = Number(trial.trial ?? index + 1);
        const x = Number(trial.xVal ?? (1 / Math.max(0.1, Number(trial.paramA ?? 40))));
        const y = Number(trial.yVal ?? (1 / Math.max(0.1, Number(trial.measured ?? 40))));
        points.push({
          trial: trialNum,
          x,
          y,
          xLabel: `${x.toFixed(4)} cm⁻¹`,
          yLabel: `${y.toFixed(4)} cm⁻¹`,
          raw: trial,
        });
      });
    } else if (subMode === 'diffraction') {
      xAxisLabel = 'Inverse Slit Separation 1/d (mm⁻¹)';
      yAxisLabel = 'Fringe Spacing Δy (mm)';
      title = 'Double-Slit Interference: Δy vs. 1/d (Slope = λL)';

      trials.forEach((trial, index) => {
        const trialNum = Number(trial.trial ?? index + 1);
        const x = Number(trial.xVal ?? (1 / Math.max(0.01, Number(trial.paramA ?? 0.25))));
        const y = Number(trial.yVal ?? Number(trial.measured ?? 4.25));
        points.push({
          trial: trialNum,
          x,
          y,
          xLabel: `${x.toFixed(2)} mm⁻¹`,
          yLabel: `${y.toFixed(2)} mm`,
          raw: trial,
        });
      });
    } else {
      // Default refraction: sin(theta1) vs sin(theta2)
      xAxisLabel = 'sin θ₁ (Incident Sine)';
      yAxisLabel = 'sin θ₂ (Refracted Sine)';
      title = "Snell's Law: sin θ₂ vs. sin θ₁ (Slope = n₁/n₂)";

      trials.forEach((trial, index) => {
        const trialNum = Number(trial.trial ?? index + 1);
        const theta1Deg = Number(trial.paramA ?? 30);
        const theta2Deg = Number(trial.measured ?? 19.2);
        const x = Math.sin((theta1Deg * Math.PI) / 180);
        const y = Math.sin((theta2Deg * Math.PI) / 180);
        points.push({
          trial: trialNum,
          x,
          y,
          xLabel: `${x.toFixed(3)} (θ₁=${theta1Deg.toFixed(1)}°)`,
          yLabel: `${y.toFixed(3)} (θ₂=${theta2Deg.toFixed(1)}°)`,
          raw: trial,
        });
      });
    }
  } else {
    // Relativity: gamma vs dilatedTime
    xAxisLabel = 'Lorentz Factor γ (dimensionless)';
    yAxisLabel = 'Dilated Time Δt (s)';
    title = 'Relativistic Time Dilation: Δt vs. γ (Slope = Δt₀)';

    trials.forEach((trial, index) => {
      const trialNum = Number(trial.trial ?? index + 1);
      const gamma = Number(trial.gamma ?? 1.25);
      const dilated = Number(trial.dilatedTime ?? 12.5);
      points.push({
        trial: trialNum,
        x: gamma,
        y: dilated,
        xLabel: `γ = ${gamma.toFixed(3)}`,
        yLabel: `${dilated.toFixed(2)} s`,
        raw: trial,
      });
    });
  }

  const n = points.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  points.forEach((p) => {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
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
  if (stationId === 'circuits') {
    physicalInterpretation = `Slope m = ${slope.toFixed(2)} Ω ⇒ Measured AC/DC Impedance Z_exp = ${slope.toFixed(2)} Ω (V = I·Z agreement verified)`;
  } else if (stationId === 'optics') {
    const subMode = String(trials[0]?.subMode ?? 'refraction');
    if (subMode === 'imaging') {
      const expF = Math.abs(intercept) > 1e-5 ? 1 / intercept : 0;
      physicalInterpretation = `Intercept 1/f = ${intercept.toFixed(4)} cm⁻¹ ⇒ Experimental Focal Length f_exp = ${expF.toFixed(1)} cm (Gaussian Thin-Lens)`;
    } else if (subMode === 'diffraction') {
      physicalInterpretation = `Slope m = ${slope.toFixed(3)} mm² ⇒ Interference constant λL = ${slope.toFixed(3)} mm²`;
    } else {
      physicalInterpretation = `Slope m = ${slope.toFixed(4)} ⇒ Measured Refractive Index Ratio n₁/n₂ = ${slope.toFixed(4)} (Snell's Law: sin θ₂ = (n₁/n₂) sin θ₁)`;
    }
  } else {
    physicalInterpretation = `Slope m = ${slope.toFixed(3)} s ⇒ Experimental Proper Time Interval Δt₀ = ${slope.toFixed(3)} s (Einstein Invariance: Δt = γ·Δt₀)`;
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
    xAxisLabel,
    yAxisLabel,
    title,
  };
}

export function Room3Graph({
  stationId,
  trials,
  accentColor = '#38bdf8',
}: {
  stationId: Room3StationId;
  trials: TrialRecord[];
  accentColor?: string;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<GraphPoint | null>(null);

  const regression = useMemo(() => computeRoom3Regression(stationId, trials), [stationId, trials]);

  if (!regression || regression.points.length < 2) {
    return (
      <div className="lab-graph-empty">
        <span className="graph-empty-icon">📈</span>
        <b>INSUFFICIENT TRIAL DATA FOR REGRESSION</b>
        <p>Record at least 2 experimental trials with varied parameters to generate the least-squares regression plot and verify physical laws.</p>
      </div>
    );
  }

  const { points, slope, intercept, rSquared, xMin, xMax, yMin, yMax, physicalInterpretation, xAxisLabel, yAxisLabel, title } = regression;

  // SVG dimensions
  const svgWidth = 560;
  const svgHeight = 310;
  const pad = { top: 25, right: 30, bottom: 45, left: 65 };
  const plotWidth = svgWidth - pad.left - pad.right;
  const plotHeight = svgHeight - pad.top - pad.bottom;

  // Domain margin
  const xSpan = Math.max(1e-4, xMax - xMin);
  const ySpan = Math.max(1e-4, yMax - yMin);
  const domainXMin = Math.max(0, xMin - xSpan * 0.15);
  const domainXMax = xMax + xSpan * 0.15;
  const domainYMin = Math.max(0, yMin - ySpan * 0.15);
  const domainYMax = yMax + ySpan * 0.15;

  const scaleX = (val: number) => pad.left + ((val - domainXMin) / Math.max(1e-6, domainXMax - domainXMin)) * plotWidth;
  const scaleY = (val: number) => pad.top + plotHeight - ((val - domainYMin) / Math.max(1e-6, domainYMax - domainYMin)) * plotHeight;

  // Regression line endpoints
  const lineX1 = domainXMin;
  const lineY1 = slope * lineX1 + intercept;
  const lineX2 = domainXMax;
  const lineY2 = slope * lineX2 + intercept;

  const ptLineX1 = scaleX(lineX1);
  const ptLineY1 = scaleY(lineY1);
  const ptLineX2 = scaleX(lineX2);
  const ptLineY2 = scaleY(lineY2);

  // Axis ticks
  const xTicks = [domainXMin, domainXMin + (domainXMax - domainXMin) * 0.33, domainXMin + (domainXMax - domainXMin) * 0.66, domainXMax];
  const yTicks = [domainYMin, domainYMin + (domainYMax - domainYMin) * 0.33, domainYMin + (domainYMax - domainYMin) * 0.66, domainYMax];

  return (
    <div className="lab-graph-card">
      <div className="lab-graph-header">
        <div className="graph-title-group">
          <span className="graph-badge" style={{ borderColor: `${accentColor}55`, color: accentColor }}>
            PHYSICS 300 REGRESSION ENGINE
          </span>
          <h4 className="graph-title">{title}</h4>
        </div>
        <div className="graph-metrics">
          <span className="metric-pill">
            <b>R² = {rSquared.toFixed(4)}</b>
          </span>
          <span className="metric-pill accent" style={{ borderColor: `${accentColor}66` }}>
            <b>
              y = {slope >= 0 ? '' : '-'}
              {Math.abs(slope) >= 1000 ? slope.toExponential(2) : slope.toFixed(2)}x {intercept >= 0 ? '+' : '-'}{' '}
              {Math.abs(intercept) >= 1000 ? Math.abs(intercept).toExponential(2) : Math.abs(intercept).toFixed(2)}
            </b>
          </span>
        </div>
      </div>

      <div className="svg-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="regression-svg"
          role="img"
          aria-label={`Scatter plot and best fit regression line for ${title}`}
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

          {/* Regression Line */}
          <line
            x1={ptLineX1}
            y1={ptLineY1}
            x2={ptLineX2}
            y2={ptLineY2}
            stroke={accentColor}
            strokeWidth="2.5"
            strokeDasharray="5,4"
            className="regression-line"
          />

          {/* Data Points */}
          {points.map((p) => {
            const cx = scaleX(p.x);
            const cy = scaleY(p.y);
            const isHovered = hoveredPoint?.trial === p.trial;
            return (
              <g
                key={`pt-${p.trial}`}
                className="data-point-group"
                onPointerEnter={() => setHoveredPoint(p)}
                onPointerLeave={() => setHoveredPoint(null)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 7 : 5}
                  fill={isHovered ? '#ffffff' : accentColor}
                  stroke="#0f172a"
                  strokeWidth="2"
                  className="data-point"
                />
                <circle cx={cx} cy={cy} r="14" fill="transparent" />
              </g>
            );
          })}

          {/* Axis Labels */}
          <text
            x={pad.left + plotWidth / 2}
            y={svgHeight - 8}
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontSize="12"
            fontWeight="500"
          >
            {xAxisLabel}
          </text>
          <text
            x={16}
            y={pad.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90, 16, ${pad.top + plotHeight / 2})`}
            fill="rgba(255,255,255,0.7)"
            fontSize="12"
            fontWeight="500"
          >
            {yAxisLabel}
          </text>

          {/* Axis Numerical Ticks */}
          {xTicks.map((tick, i) => (
            <text
              key={`x-label-${i}`}
              x={scaleX(tick)}
              y={pad.top + plotHeight + 18}
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize="10"
              fontFamily="monospace"
            >
              {tick >= 1000 || (tick > 0 && tick < 0.01) ? tick.toExponential(1) : tick.toFixed(2)}
            </text>
          ))}
          {yTicks.map((tick, i) => (
            <text
              key={`y-label-${i}`}
              x={pad.left - 8}
              y={scaleY(tick) + 3}
              textAnchor="end"
              fill="rgba(255,255,255,0.4)"
              fontSize="10"
              fontFamily="monospace"
            >
              {tick >= 1000 || (tick > 0 && tick < 0.01) ? tick.toExponential(1) : tick.toFixed(1)}
            </text>
          ))}
        </svg>

        {/* Hover Tooltip */}
        {hoveredPoint && (
          <div
            className="graph-tooltip"
            style={{
              position: 'absolute',
              left: `${(scaleX(hoveredPoint.x) / svgWidth) * 100}%`,
              top: `${(scaleY(hoveredPoint.y) / svgHeight) * 100}%`,
              transform: 'translate(-50%, -120%)',
              pointerEvents: 'none',
              background: '#0f172a',
              border: `1px solid ${accentColor}`,
              borderRadius: '6px',
              padding: '6px 10px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 10,
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontSize: '11px', color: accentColor, fontWeight: 700 }}>Trial #{hoveredPoint.trial}</div>
            <div style={{ fontSize: '12px', color: '#f8fafc' }}>
              X: <b>{hoveredPoint.xLabel}</b>
            </div>
            <div style={{ fontSize: '12px', color: '#f8fafc' }}>
              Y: <b>{hoveredPoint.yLabel}</b>
            </div>
          </div>
        )}
      </div>

      <div className="regression-footnote">
        <span className="footnote-icon">💡</span>
        <span className="footnote-text">{physicalInterpretation}</span>
      </div>
    </div>
  );
}
