'use client';

import React, { useEffect, useState } from 'react';
import { KatexMath, LatexRichText } from './KatexMath';
import { ManualTextRun } from './labManualCatalog';
import {
  fillBlankRuns,
  getResolvedCellValue,
  getResolvedDatePerformed,
  HydratedExperimentReport,
  isCellModifiedOrLive,
  MasterReportState,
  ReportMetadata,
  ReportOverrides,
  runsToPlainText,
} from './labManualReport';
import {
  buildLiveExperimentComputations,
  EXPERIMENT_LATEX_EXERCISE_ANSWERS,
  EXPERIMENT_LATEX_FORMULAS,
  EXPERIMENT_LATEX_GUIDE_ANSWERS,
  formatProseWithLatex,
} from './latexManualMath';
import {
  buildDocxFileName,
  generateCustomLabManualDocx,
  preloadDocxTemplateXml,
  prepareCustomLabManualXmlSync,
} from './docxExport';

export type Room3MasterReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  reportState: MasterReportState;
  metadata: ReportMetadata;
  onChangeMetadata: (next: ReportMetadata) => void;
  overrides: ReportOverrides;
  onChangeOverrides: (next: ReportOverrides) => void;
  onRefreshFromStorage: () => void;
  isDoorExitPrompt?: boolean;
  onProceedExitDoor?: () => void;
  playTone?: (freq: number, type: OscillatorType, dur: number, gain: number) => void;
};

function ManualRichText({ runs }: { runs: ManualTextRun[] }) {
  return (
    <>
      {runs.map((run, idx) => {
        let content: React.ReactNode = run.t;
        if (run.sup) content = <sup>{content}</sup>;
        else if (run.sub) content = <sub>{content}</sub>;
        if (run.b) content = <strong>{content}</strong>;
        if (run.i) content = <em>{content}</em>;
        return <React.Fragment key={idx}>{content}</React.Fragment>;
      })}
    </>
  );
}

function BlankWriteLines({ count = 2, prefix }: { count?: number; prefix?: string }) {
  return (
    <div className="manual-blank-lines" aria-label="Student answer writing lines">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="manual-blank-line">
          {i === 0 && prefix ? <span className="manual-blank-prefix">{prefix}</span> : null}
          <span className="manual-blank-rule" />
        </div>
      ))}
    </div>
  );
}

type ExperimentBlockProps = {
  exp: HydratedExperimentReport;
  metadata: ReportMetadata;
  overrides: ReportOverrides;
  editMode: boolean;
  isFirstInPrint: boolean;
  onUpdateCell: (tableNum: 1 | 2, rowIdx: number, colIdx: number, value: string) => void;
  onUpdateTextSection: (field: 'observations' | 'conclusions' | 'recommendations', value: string) => void;
  onUpdateDatePerformed: (value: string | null) => void;
};

function ExperimentSection({
  exp,
  metadata,
  overrides,
  editMode,
  isFirstInPrint,
  onUpdateCell,
  onUpdateTextSection,
  onUpdateDatePerformed,
}: ExperimentBlockProps) {
  const { catalog } = exp;
  const studentDisplay = metadata.studentName.trim()
    ? metadata.studentId.trim()
      ? `${metadata.studentName.trim()} (${metadata.studentId.trim()})`
      : metadata.studentName.trim()
    : '';
  const groupDisplay = metadata.groupNumber.trim() || metadata.section.trim();

  const resolvedDatePerformed = getResolvedDatePerformed(exp, metadata, overrides);
  const hasCustomExpDate = Object.prototype.hasOwnProperty.call(
    overrides.perExperimentDates,
    catalog.number
  );

  const obsVal = overrides.observations[catalog.number] ?? exp.observationText;
  const concVal = overrides.conclusions[catalog.number] ?? exp.conclusionText;
  const recVal = overrides.recommendations[catalog.number] ?? exp.recommendationText;

  const caption1Runs = fillBlankRuns(catalog.table1Caption, exp.table1CaptionBlanks);
  const latexFormulas = EXPERIMENT_LATEX_FORMULAS[catalog.number] ?? [];
  const liveComputations = buildLiveExperimentComputations(exp, overrides);

  return (
    <article
      id={`manual-exp-${catalog.number}`}
      className={`manual-experiment-block ${isFirstInPrint ? 'is-first-exp' : ''}`}
    >
      {/* Part A: Laboratory Manual Background, Figures & Procedure */}
      <div className="manual-paper-sheet">
        <div className="manual-banner-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/report/uphsd_header.png"
            alt="University of Perpetual Help System DALTA Physics Header"
            className="manual-header-banner"
          />
        </div>

        <h2 className="manual-exp-number">EXPERIMENT {catalog.number}</h2>
        <h3 className="manual-exp-title">{catalog.title}</h3>

        <section className="manual-subsection">
          <h4>Objectives</h4>
          <div className="manual-list-block">
            {catalog.objectives.map((runs, i) => (
              <p key={i} className="manual-numbered-line">
                <LatexRichText text={formatProseWithLatex(runsToPlainText(runs))} />
              </p>
            ))}
          </div>
        </section>

        <section className="manual-subsection">
          <h4>Apparatus and Materials</h4>
          <table className="manual-apparatus-table">
            <tbody>
              {catalog.apparatusRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="manual-subsection">
          <h4>Introduction</h4>
          {catalog.introParagraphs.map((runs, i) => (
            <p key={i} className="manual-body-p">
              <LatexRichText text={formatProseWithLatex(runsToPlainText(runs))} />
            </p>
          ))}
          {catalog.introFigure && (
            <figure className="manual-figure-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={catalog.introFigure}
                alt={`Experiment ${catalog.number} Setup Diagram`}
                className="manual-figure-img"
              />
            </figure>
          )}
          <div className="manual-formula-box">
            {latexFormulas.length > 0
              ? latexFormulas.map((item, i) => (
                  <div key={i} className="manual-formula-block">
                    <div className="manual-formula-label">
                      <strong>{item.label}</strong>
                    </div>
                    <div className="manual-formula-steps">
                      {item.steps.map((stepLatex, si) => (
                        <div key={si} className="manual-formula-step">
                          <KatexMath math={stepLatex} className="manual-katex-formula" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              : catalog.formulaParagraphs.map((runs, i) => (
                  <p key={i} className="manual-formula-line">
                    <ManualRichText runs={runs} />
                  </p>
                ))}
          </div>
        </section>

        <section className="manual-subsection">
          <h4>Procedure</h4>
          <div className="manual-list-block">
            {catalog.procedure.map((runs, i) => (
              <p key={i} className="manual-numbered-line">
                <LatexRichText text={formatProseWithLatex(runsToPlainText(runs))} />
              </p>
            ))}
          </div>
        </section>

        <footer className="manual-page-footer">
          <span>UPHSD – Physics Laboratory Manual</span>
        </footer>
      </div>

      {/* Part B: Official Data Sheet, Tables, Live Computations, Guide Questions, Exercises & Evaluation */}
      <div className="manual-paper-sheet manual-datasheet-sheet">
        <div className="manual-banner-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/report/uphsd_header.png"
            alt="University of Perpetual Help System DALTA Header"
            className="manual-header-banner"
          />
        </div>

        <div className="manual-datasheet-title-block">
          <div className="manual-datasheet-h1">DATA SHEET</div>
          <div className="manual-datasheet-h2">EXPERIMENT NUMBER {catalog.number}</div>
        </div>

        <table className="manual-meta-table">
          <tbody>
            <tr>
              <td>
                <strong>Title:</strong> {catalog.dataSheetTitle}
              </td>
              <td>
                <strong>Name of Instructor:</strong> {metadata.instructorName.trim()}
              </td>
            </tr>
            <tr>
              <td>
                <div className="manual-date-cell-wrap">
                  <strong>Date Performed:</strong>{' '}
                  <input
                    type="date"
                    className="manual-inline-date-input master-report-no-print"
                    aria-label={`Date Performed for Experiment ${catalog.number}`}
                    value={resolvedDatePerformed}
                    onChange={(e) => onUpdateDatePerformed(e.target.value)}
                  />
                  {hasCustomExpDate && (
                    <button
                      type="button"
                      className="manual-date-reset-btn master-report-no-print"
                      title="Use global Date Performed"
                      onClick={() => onUpdateDatePerformed(null)}
                    >
                      ↺
                    </button>
                  )}
                  <span className="manual-inline-date-print">{resolvedDatePerformed}</span>
                </div>
              </td>
              <td>
                <strong>Name of the Student:</strong> {studentDisplay}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Date Submitted:</strong> {metadata.dateSubmitted.trim()}
              </td>
              <td>
                <strong>Group Number:</strong> {groupDisplay}
              </td>
            </tr>
          </tbody>
        </table>

        <section className="manual-subsection manual-data-section">
          <h4>Data</h4>

          <p className="manual-table-caption">
            <ManualRichText runs={caption1Runs} />
          </p>
          <div className="manual-table-scroll">
            <table className="manual-data-table">
              <thead>
                <tr>
                  {catalog.table1Headers.map((hdrRuns, ci) => (
                    <th key={ci}>
                      <ManualRichText runs={hdrRuns} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exp.table1Rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((_, ci) => {
                      const val = getResolvedCellValue(
                        exp.table1Rows,
                        overrides.table1Cells,
                        catalog.number,
                        ri,
                        ci
                      );
                      const isModified = isCellModifiedOrLive(
                        exp.table1LiveMask,
                        overrides.table1Cells,
                        catalog.number,
                        ri,
                        ci
                      );
                      const templateRuns = catalog.table1TemplateRows[ri]?.[ci];
                      return (
                        <td key={ci}>
                          {editMode ? (
                            <input
                              type="text"
                              className="manual-cell-input"
                              aria-label={`Exp ${catalog.number} Table 1 Row ${ri + 1} Col ${ci + 1}`}
                              value={val}
                              onChange={(e) => onUpdateCell(1, ri, ci, e.target.value)}
                            />
                          ) : !isModified && templateRuns ? (
                            templateRuns.length > 0 ? (
                              <ManualRichText runs={templateRuns} />
                            ) : (
                              '\u00A0'
                            )
                          ) : (
                            val || '\u00A0'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="manual-table-caption" style={{ marginTop: '10px' }}>
            <ManualRichText runs={catalog.table2Caption} />
          </p>
          <div className="manual-table-scroll">
            <table className="manual-data-table">
              <thead>
                <tr>
                  {catalog.table2Headers.map((hdrRuns, ci) => (
                    <th key={ci}>
                      <ManualRichText runs={hdrRuns} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exp.table2Rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((_, ci) => {
                      const val = getResolvedCellValue(
                        exp.table2Rows,
                        overrides.table2Cells,
                        catalog.number,
                        ri,
                        ci
                      );
                      const isModified = isCellModifiedOrLive(
                        exp.table2LiveMask,
                        overrides.table2Cells,
                        catalog.number,
                        ri,
                        ci
                      );
                      const templateRuns = catalog.table2TemplateRows[ri]?.[ci];
                      return (
                        <td key={ci}>
                          {editMode ? (
                            <input
                              type="text"
                              className="manual-cell-input"
                              aria-label={`Exp ${catalog.number} Table 2 Row ${ri + 1} Col ${ci + 1}`}
                              value={val}
                              onChange={(e) => onUpdateCell(2, ri, ci, e.target.value)}
                            />
                          ) : !isModified && templateRuns ? (
                            templateRuns.length > 0 ? (
                              <ManualRichText runs={templateRuns} />
                            ) : (
                              '\u00A0'
                            )
                          ) : (
                            val || '\u00A0'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {liveComputations.length > 0 && (
            <div className="manual-live-computations">
              <p className="manual-table-caption" style={{ marginTop: '10px' }}>
                Sample Computations:
              </p>
              {metadata.includeAnswerKey ? (
                <div className="manual-computation-list">
                  {liveComputations.map((line, li) => (
                    <div key={li} className="manual-computation-group">
                      <div className="manual-computation-title">
                        <strong>{line.label}</strong>
                      </div>
                      <div className="manual-computation-steps">
                        {line.steps.map((stepLatex, si) => (
                          <div key={si} className="manual-computation-row">
                            <KatexMath math={stepLatex} className="manual-katex-comp" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <BlankWriteLines count={3} />
              )}
            </div>
          )}
        </section>

        <section className="manual-subsection manual-qa-section">
          <h4>Guide Questions:</h4>
          {catalog.guideQuestions.map((gq, qi) => {
            const latexAns = EXPERIMENT_LATEX_GUIDE_ANSWERS[catalog.number]?.[qi];
            return (
              <div key={qi} className="manual-qa-item">
                <p className="manual-qa-question">
                  <LatexRichText text={formatProseWithLatex(runsToPlainText(gq.question))} />
                </p>
                {metadata.includeAnswerKey ? (
                  <p className="manual-qa-answer">
                    {latexAns ? (
                      <LatexRichText text={latexAns} />
                    ) : (
                      <ManualRichText runs={gq.answer} />
                    )}
                  </p>
                ) : (
                  <BlankWriteLines count={2} />
                )}
              </div>
            );
          })}
        </section>

        <section className="manual-subsection manual-qa-section">
          <h4>Exercises:</h4>
          {catalog.exercisesFigure && (
            <figure className="manual-figure-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={catalog.exercisesFigure}
                alt={`Experiment ${catalog.number} Exercise Figure`}
                className="manual-figure-img"
              />
            </figure>
          )}
          {catalog.exercises.map((ex, xi) => {
            const latexExAns = EXPERIMENT_LATEX_EXERCISE_ANSWERS[catalog.number]?.[xi];
            return (
              <div key={xi} className="manual-qa-item">
                <p className="manual-qa-question">
                  <LatexRichText text={formatProseWithLatex(runsToPlainText(ex.question))} />
                </p>
                {metadata.includeAnswerKey ? (
                  <p className="manual-qa-answer">
                    {latexExAns ? (
                      <LatexRichText text={latexExAns} />
                    ) : (
                      <ManualRichText runs={ex.answer} />
                    )}
                  </p>
                ) : (
                  <BlankWriteLines count={2} prefix="Answer:" />
                )}
              </div>
            );
          })}
        </section>

        <section className="manual-subsection manual-eval-section">
          <h4>Observation:</h4>
          {!metadata.includeAnswerKey ? (
            <BlankWriteLines count={2} />
          ) : editMode ? (
            <textarea
              className="manual-text-edit"
              rows={3}
              value={obsVal}
              onChange={(e) => onUpdateTextSection('observations', e.target.value)}
            />
          ) : (
            <p className="manual-eval-p">
              <LatexRichText text={formatProseWithLatex(obsVal)} />
            </p>
          )}
        </section>

        <section className="manual-subsection manual-eval-section">
          <h4>Conclusion:</h4>
          {!metadata.includeAnswerKey ? (
            <BlankWriteLines count={2} />
          ) : editMode ? (
            <textarea
              className="manual-text-edit"
              rows={3}
              value={concVal}
              onChange={(e) => onUpdateTextSection('conclusions', e.target.value)}
            />
          ) : (
            <p className="manual-eval-p">
              <LatexRichText text={formatProseWithLatex(concVal)} />
            </p>
          )}
        </section>

        <section className="manual-subsection manual-eval-section">
          <h4>Recommendation:</h4>
          {!metadata.includeAnswerKey ? (
            <BlankWriteLines count={2} />
          ) : editMode ? (
            <textarea
              className="manual-text-edit"
              rows={2}
              value={recVal}
              onChange={(e) => onUpdateTextSection('recommendations', e.target.value)}
            />
          ) : (
            <p className="manual-eval-p">
              <LatexRichText text={formatProseWithLatex(recVal)} />
            </p>
          )}
        </section>

        <footer className="manual-page-footer">
          <span>UPHSD – Physics Laboratory Manual</span>
        </footer>
      </div>
    </article>
  );
}

function submitServerDocxForm(filename: string, xml: string) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/export-docx';
  form.enctype = 'multipart/form-data';
  form.style.display = 'none';

  const nameInput = document.createElement('input');
  nameInput.type = 'hidden';
  nameInput.name = 'filename';
  nameInput.value = filename;

  const xmlInput = document.createElement('input');
  xmlInput.type = 'hidden';
  xmlInput.name = 'xml';
  xmlInput.value = xml;

  form.appendChild(nameInput);
  form.appendChild(xmlInput);
  document.body.appendChild(form);
  form.submit();
  setTimeout(() => {
    form.remove();
  }, 1500);
}

export default function Room3MasterReportModal({
  isOpen,
  onClose,
  reportState,
  metadata,
  onChangeMetadata,
  overrides,
  onChangeOverrides,
  onRefreshFromStorage,
  isDoorExitPrompt = false,
  onProceedExitDoor,
  playTone,
}: Room3MasterReportModalProps) {
  const [editMode, setEditMode] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportingDocx, setExportingDocx] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 760 : true
  );

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('master-report-open');
    preloadDocxTemplateXml().catch((err) => {
      console.warn('Preloading document_template.xml failed:', err);
    });
    return () => {
      document.body.classList.remove('master-report-open');
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const visibleExperiments =
    metadata.scope === 'room3'
      ? reportState.experiments.filter((e) => e.catalog.room === 3)
      : reportState.experiments;

  const { roomSummary } = reportState;

  const handlePrintPdf = () => {
    playTone?.(620, 'sine', 0.08, 0.15);
    setEditMode(false);
    setExportStatus('Opening Print / Save as PDF dialog...');
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 80);
    });
  };

  const handleDownloadDocx = async () => {
    if (exportingDocx) return;
    playTone?.(560, 'triangle', 0.08, 0.16);
    setExportingDocx(true);
    setExportStatus('Preparing customized .docx laboratory manual with Word Equations...');
    try {
      const syncPrepared = prepareCustomLabManualXmlSync(reportState, metadata, overrides);
      if (syncPrepared) {
        submitServerDocxForm(syncPrepared.filename, syncPrepared.xml);
        playTone?.(780, 'sine', 0.12, 0.18);
        setExportStatus(`✅ Downloading ${syncPrepared.filename}`);
        return;
      }

      const blob = await generateCustomLabManualDocx(reportState, metadata, overrides);
      const fname = buildDocxFileName(metadata);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fname;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      playTone?.(780, 'sine', 0.12, 0.18);
      setExportStatus(`✅ Downloaded ${fname}`);
    } catch (err) {
      setExportStatus(
        `⚠️ .docx export failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      playTone?.(220, 'sawtooth', 0.15, 0.2);
    } finally {
      setExportingDocx(false);
    }
  };

  const updateMetaField = <K extends keyof ReportMetadata>(field: K, value: ReportMetadata[K]) => {
    onChangeMetadata({ ...metadata, [field]: value });
  };

  const handleCellUpdate =
    (expNum: number) => (tableNum: 1 | 2, rowIdx: number, colIdx: number, value: string) => {
      const cellKey = `${expNum}_${rowIdx}_${colIdx}`;
      if (tableNum === 1) {
        onChangeOverrides({
          ...overrides,
          table1Cells: { ...overrides.table1Cells, [cellKey]: value },
        });
      } else {
        onChangeOverrides({
          ...overrides,
          table2Cells: { ...overrides.table2Cells, [cellKey]: value },
        });
      }
    };

  const handleTextUpdate =
    (expNum: number) =>
    (field: 'observations' | 'conclusions' | 'recommendations', value: string) => {
      onChangeOverrides({
        ...overrides,
        [field]: { ...overrides[field], [expNum]: value },
      });
    };

  const handleDatePerformedUpdate = (expNum: number) => (value: string | null) => {
    const nextDates = { ...overrides.perExperimentDates };
    if (value === null) {
      delete nextDates[expNum];
    } else {
      nextDates[expNum] = value;
    }
    onChangeOverrides({ ...overrides, perExperimentDates: nextDates });
  };

  return (
    <div
      className="master-report-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Automated Laboratory Manual Report Generator"
    >
      <section className="master-report-modal">
        {/* Top Toolbar (hidden during Print/PDF) */}
        <header className="master-report-toolbar">
          <div className="master-report-toolbar-top">
            <div className="master-report-title-group">
              <span className="master-report-kicker">
                UPHSD VIRTUAL PHYSICS LAB · AUTOMATED REPORT GENERATOR
              </span>
              <h2>
                {roomSummary.room3Completed === roomSummary.room3Total
                  ? '🏆 Room 03 Complete — Automated Laboratory Report Ready'
                  : '📄 Automated Laboratory Manual & Data Sheet'}
              </h2>
            </div>
            <div className="master-report-toolbar-actions">
              <label className="master-toolbar-date-pill" title="Global Date Performed">
                <span>📅 Date:</span>
                <input
                  type="date"
                  aria-label="Global Date Performed"
                  value={metadata.datePerformed}
                  onChange={(e) => updateMetaField('datePerformed', e.target.value)}
                />
              </label>
              <button
                type="button"
                className="master-btn master-btn-pdf"
                onClick={handlePrintPdf}
              >
                🖨️ Print / Save as PDF
              </button>
              <button
                type="button"
                className="master-btn master-btn-docx"
                disabled={exportingDocx}
                onClick={handleDownloadDocx}
              >
                {exportingDocx ? '⏳ Generating .docx...' : '📝 Download .docx Word'}
              </button>
              <button
                type="button"
                className="master-btn master-btn-subtle"
                aria-expanded={controlsExpanded}
                onClick={() => setControlsExpanded((v) => !v)}
              >
                {controlsExpanded ? '▲ Hide Options' : '⚙️ Info & Options'}
              </button>
              {isDoorExitPrompt && onProceedExitDoor && (
                <button
                  type="button"
                  className="master-btn master-btn-exit"
                  onClick={() => {
                    playTone?.(440, 'triangle', 0.08, 0.18);
                    onProceedExitDoor();
                  }}
                >
                  🚪 Walk Out to Campus Hallway
                </button>
              )}
              <button
                type="button"
                className="master-btn master-btn-close"
                onClick={onClose}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {isDoorExitPrompt && (
            <div className="master-door-notice">
              <span>
                🚪 You approached the <strong>Room 03 Exit Doors</strong>. Export your populated
                University Lab Manual (.pdf or .docx) before leaving, or click{' '}
                <strong>Walk Out to Campus Hallway</strong> anytime.
              </span>
            </div>
          )}

          {controlsExpanded && (
            <div className="master-report-controls-row">
              <div className="master-room-chips">
                <span className={`room-chip ${roomSummary.room1Completed === 4 ? 'done' : ''}`}>
                  Room 1 (Exp 1–4): {roomSummary.room1Completed}/{roomSummary.room1Total}
                </span>
                <span className={`room-chip ${roomSummary.room2Completed === 3 ? 'done' : ''}`}>
                  Room 2 (Exp 5–7): {roomSummary.room2Completed}/{roomSummary.room2Total}
                </span>
                <span className={`room-chip ${roomSummary.room3Completed === 3 ? 'done' : ''}`}>
                  Room 3 (Exp 8–10): {roomSummary.room3Completed}/{roomSummary.room3Total}
                </span>
                <button
                  type="button"
                  className="master-btn master-btn-subtle"
                  onClick={() => {
                    onRefreshFromStorage();
                    setExportStatus('↻ Refreshed saved trial data from Rooms 1, 2 & 3.');
                  }}
                >
                  ↻ Sync Rooms 1–3
                </button>
              </div>

              <div className="master-export-actions">
                <div className="master-scope-toggle" role="group" aria-label="Report Experiment Scope">
                  <button
                    type="button"
                    className={metadata.scope === 'all' ? 'active' : ''}
                    onClick={() => updateMetaField('scope', 'all')}
                  >
                    All 10 Exp (Rooms 1–3)
                  </button>
                  <button
                    type="button"
                    className={metadata.scope === 'room3' ? 'active' : ''}
                    onClick={() => updateMetaField('scope', 'room3')}
                  >
                    Room 3 Only (Exp 8–10)
                  </button>
                </div>

                <label className="master-toggle-check">
                  <input
                    type="checkbox"
                    checked={metadata.includeAnswerKey}
                    onChange={(e) => updateMetaField('includeAnswerKey', e.target.checked)}
                  />
                  <span>Include Answer Keys &amp; Completed Paragraphs</span>
                </label>

                <button
                  type="button"
                  className={`master-btn ${editMode ? 'master-btn-active-edit' : 'master-btn-subtle'}`}
                  onClick={() => setEditMode((v) => !v)}
                >
                  {editMode ? '✓ Done Editing Cells' : '✏️ Edit Data Cells'}
                </button>
              </div>
            </div>
          )}

          {exportStatus && <div className="master-status-banner">{exportStatus}</div>}
        </header>

        {/* Data Sheet Metadata Form */}
        {controlsExpanded && (
          <div className="master-report-metadata-panel">
            <label>
              <span>Name of Student</span>
              <input
                type="text"
                value={metadata.studentName}
                onChange={(e) => updateMetaField('studentName', e.target.value)}
                placeholder="Juan Dela Cruz"
              />
            </label>
            <label>
              <span>Student ID</span>
              <input
                type="text"
                value={metadata.studentId}
                onChange={(e) => updateMetaField('studentId', e.target.value)}
                placeholder="PHY-200-2026"
              />
            </label>
            <label>
              <span>Group Number / Section</span>
              <input
                type="text"
                value={metadata.groupNumber}
                onChange={(e) => updateMetaField('groupNumber', e.target.value)}
                placeholder="Group 1 · PHY-200"
              />
            </label>
            <label>
              <span>Name of Instructor</span>
              <input
                type="text"
                value={metadata.instructorName}
                onChange={(e) => updateMetaField('instructorName', e.target.value)}
                placeholder="Prof. Physics Instructor"
              />
            </label>
            <label>
              <span>Global Date Performed</span>
              <input
                type="date"
                value={metadata.datePerformed}
                onChange={(e) => updateMetaField('datePerformed', e.target.value)}
              />
            </label>
            <label>
              <span>Date Submitted</span>
              <input
                type="date"
                value={metadata.dateSubmitted}
                onChange={(e) => updateMetaField('dateSubmitted', e.target.value)}
              />
            </label>
          </div>
        )}

        {/* Quick Experiment Jump Navigation */}
        <nav className="master-report-exp-jumpbar" aria-label="Jump to Experiment">
          {visibleExperiments.map((e) => (
            <a
              key={e.catalog.number}
              href={`#manual-exp-${e.catalog.number}`}
              className={`jump-pill status-${e.status}`}
            >
              Exp {e.catalog.number}
            </a>
          ))}
        </nav>

        {/* Scrollable Printable Report Pages */}
        <div className="master-report-scroll">
          <div className="master-report-document">
            {visibleExperiments.map((exp, idx) => (
              <ExperimentSection
                key={exp.catalog.number}
                exp={exp}
                metadata={metadata}
                overrides={overrides}
                editMode={editMode}
                isFirstInPrint={idx === 0}
                onUpdateCell={handleCellUpdate(exp.catalog.number)}
                onUpdateTextSection={handleTextUpdate(exp.catalog.number)}
                onUpdateDatePerformed={handleDatePerformedUpdate(exp.catalog.number)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
