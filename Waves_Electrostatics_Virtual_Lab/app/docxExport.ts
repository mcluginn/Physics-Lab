'use client';

import {
  getResolvedCellValue,
  getResolvedDatePerformed,
  isCellModifiedOrLive,
  MasterReportState,
  ReportMetadata,
  ReportOverrides,
} from './labManualReport';
import {
  buildLiveExperimentComputations,
  EXPERIMENT_LATEX_EXERCISE_ANSWERS,
  EXPERIMENT_LATEX_FORMULAS,
  EXPERIMENT_LATEX_GUIDE_ANSWERS,
} from './latexManualMath';
import {
  appendLatexRichRunsToParagraph,
  createOmmlMathElement,
  createWordTextRun,
} from './ommlConverter';
import { replaceZipEntryBytes } from './zipPatch';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

let cachedTemplateXml: string | null = null;

function nodePlainText(node: Element): string {
  const ts = node.getElementsByTagNameNS(W_NS, 't');
  let out = '';
  for (let i = 0; i < ts.length; i++) {
    out += ts[i].textContent ?? '';
  }
  return out.trim();
}

function cloneOrCreateRPr(doc: Document, pEl: Element, forceNonBold = false): Element {
  const existingRun = pEl.getElementsByTagNameNS(W_NS, 'r')[0];
  const existingRPr = existingRun?.getElementsByTagNameNS(W_NS, 'rPr')[0];
  let rPr: Element;
  if (existingRPr) {
    rPr = existingRPr.cloneNode(true) as Element;
  } else {
    rPr = doc.createElementNS(W_NS, 'w:rPr');
    const fonts = doc.createElementNS(W_NS, 'w:rFonts');
    fonts.setAttributeNS(W_NS, 'w:ascii', 'Arial');
    fonts.setAttributeNS(W_NS, 'w:hAnsi', 'Arial');
    const sz = doc.createElementNS(W_NS, 'w:sz');
    sz.setAttributeNS(W_NS, 'w:val', '18');
    rPr.appendChild(fonts);
    rPr.appendChild(sz);
  }
  if (forceNonBold) {
    Array.from(rPr.getElementsByTagNameNS(W_NS, 'b')).forEach((b) => rPr.removeChild(b));
    const bEl = doc.createElementNS(W_NS, 'w:b');
    bEl.setAttributeNS(W_NS, 'w:val', '0');
    rPr.appendChild(bEl);
  }
  return rPr;
}

function replaceParagraphText(doc: Document, pEl: Element, text: string, forceNonBold = false) {
  const pPr = Array.from(pEl.childNodes).find(
    (n) => n.nodeType === 1 && (n as Element).localName === 'pPr'
  ) as Element | undefined;
  const rPr = cloneOrCreateRPr(doc, pEl, forceNonBold);

  while (pEl.firstChild) {
    pEl.removeChild(pEl.firstChild);
  }
  if (pPr) pEl.appendChild(pPr);

  const run = doc.createElementNS(W_NS, 'w:r');
  run.appendChild(rPr);
  const tEl = doc.createElementNS(W_NS, 'w:t');
  tEl.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  tEl.textContent = text;
  run.appendChild(tEl);
  pEl.appendChild(run);
}

/**
 * Replaces blank placeholder underscores ("______") sequentially across <w:t> nodes in pEl
 * while preserving every existing subscript, superscript, and bold formatting run untouched.
 */
function fillDocxParagraphBlanks(pEl: Element, values: string[]) {
  if (!values.length) return;
  let vi = 0;
  const tNodes = Array.from(pEl.getElementsByTagNameNS(W_NS, 't'));
  for (const tEl of tNodes) {
    if (vi >= values.length) break;
    const raw = tEl.textContent ?? '';
    if (!/_{3,}/.test(raw)) continue;
    tEl.textContent = raw.replace(/_{3,}/g, () => {
      const replacement = values[vi];
      vi += 1;
      return replacement !== undefined && replacement !== '' ? replacement : '______';
    });
  }
}

function appendLabelValueCell(doc: Document, tcEl: Element, valueText: string) {
  const pEl = tcEl.getElementsByTagNameNS(W_NS, 'p')[0];
  if (!pEl) return;
  const trimmed = valueText.trim();
  if (!trimmed) return;

  const rPr = doc.createElementNS(W_NS, 'w:rPr');
  const fonts = doc.createElementNS(W_NS, 'w:rFonts');
  fonts.setAttributeNS(W_NS, 'w:ascii', 'Arial');
  fonts.setAttributeNS(W_NS, 'w:hAnsi', 'Arial');
  const bOff = doc.createElementNS(W_NS, 'w:b');
  bOff.setAttributeNS(W_NS, 'w:val', '0');
  const sz = doc.createElementNS(W_NS, 'w:sz');
  sz.setAttributeNS(W_NS, 'w:val', '20');
  rPr.appendChild(fonts);
  rPr.appendChild(bOff);
  rPr.appendChild(sz);

  const run = doc.createElementNS(W_NS, 'w:r');
  run.appendChild(rPr);
  const tEl = doc.createElementNS(W_NS, 'w:t');
  tEl.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  tEl.textContent = ` ${trimmed}`;
  run.appendChild(tEl);
  pEl.appendChild(run);
}

function setCellText(doc: Document, tcEl: Element, text: string) {
  const paragraphs = Array.from(tcEl.childNodes).filter(
    (n) => n.nodeType === 1 && (n as Element).localName === 'p'
  ) as Element[];
  if (paragraphs.length === 0) return;

  for (let i = 1; i < paragraphs.length; i++) {
    tcEl.removeChild(paragraphs[i]);
  }
  replaceParagraphText(doc, paragraphs[0], text);
}

function directChildrenOfType(parent: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1 && (child as Element).localName === localName) {
      out.push(child as Element);
    }
  }
  return out;
}

export function patchDocumentXml(
  xmlText: string,
  report: MasterReportState,
  metadata: ReportMetadata,
  overrides: ReportOverrides
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  if (!body) throw new Error('Invalid WordprocessingML template: missing w:body');

  const bodyChildren = Array.from(body.childNodes).filter((n) => n.nodeType === 1) as Element[];

  const expBoundaries: Array<{ expNum: number; startIdx: number }> = [];
  bodyChildren.forEach((el, idx) => {
    if (el.localName === 'p') {
      const m = nodePlainText(el).match(/^EXPERIMENT\s+(\d+)$/);
      if (m) expBoundaries.push({ expNum: Number(m[1]), startIdx: idx });
    }
  });

  const nodesToRemove: Element[] = [];

  expBoundaries.forEach((bound, bi) => {
    const endIdx = bi + 1 < expBoundaries.length ? expBoundaries[bi + 1].startIdx : bodyChildren.length;
    const expReport = report.experiments.find((e) => e.catalog.number === bound.expNum);
    if (!expReport) return;

    if (metadata.scope === 'room3' && bound.expNum < 8) {
      for (let k = bound.startIdx; k < endIdx; k++) {
        nodesToRemove.push(bodyChildren[k]);
      }
      return;
    }

    // If Room 3 Only starts at Experiment 8, strip leading page break so Exp 8 starts on Page 1
    if (metadata.scope === 'room3' && bound.expNum === 8) {
      const expHeading = bodyChildren[bound.startIdx];
      Array.from(expHeading.getElementsByTagNameNS(W_NS, 'br')).forEach((br) => {
        if (br.getAttributeNS(W_NS, 'type') === 'page' || br.getAttribute('w:type') === 'page') {
          br.parentNode?.removeChild(br);
        }
      });
      Array.from(expHeading.getElementsByTagNameNS(W_NS, 'pageBreakBefore')).forEach((pb) => {
        pb.parentNode?.removeChild(pb);
      });
    }

    let tblOrdinal = 0;
    let section: 'NONE' | 'GUIDE' | 'EXERCISES' | 'OBSERVATION' | 'CONCLUSION' | 'RECOMMENDATION' = 'NONE';
    let guideParaCount = 0;
    let exerciseAnswerIdx = 0;
    let lastParagraph: Element | null = null;
    const pendingComputationsAfterTbl5: Array<{
      anchor: Element;
      lines: ReturnType<typeof buildLiveExperimentComputations>;
    }> = [];

    for (let k = bound.startIdx; k < endIdx; k++) {
      const node = bodyChildren[k];
      if (node.localName === 'tbl') {
        tblOrdinal++;
        const rows = directChildrenOfType(node, 'tr');

        if (tblOrdinal === 2) {
          // Formula & Worked Example box -> native Word OMML equations (<m:oMath>)
          const formulaLines = EXPERIMENT_LATEX_FORMULAS[bound.expNum];
          const tcEl = rows[0] ? directChildrenOfType(rows[0], 'tc')[0] : undefined;
          if (formulaLines && tcEl) {
            const existingPs = directChildrenOfType(tcEl, 'p');
            const templatePPr = existingPs[0]
              ? Array.from(existingPs[0].childNodes).find(
                  (n) => n.nodeType === 1 && (n as Element).localName === 'pPr'
                )
              : undefined;
            existingPs.forEach((p) => tcEl.removeChild(p));

            formulaLines.forEach((item) => {
              const labelP = doc.createElementNS(W_NS, 'w:p');
              if (templatePPr) labelP.appendChild(templatePPr.cloneNode(true));
              labelP.appendChild(
                createWordTextRun(doc, item.label, { bold: true, fontSizeHalfPts: '19' })
              );
              tcEl.appendChild(labelP);

              item.steps.forEach((stepLatex) => {
                const stepP = doc.createElementNS(W_NS, 'w:p');
                if (templatePPr) {
                  const pPrClone = templatePPr.cloneNode(true) as Element;
                  const ind = doc.createElementNS(W_NS, 'w:ind');
                  ind.setAttributeNS(W_NS, 'w:left', '240');
                  pPrClone.appendChild(ind);
                  stepP.appendChild(pPrClone);
                }
                stepP.appendChild(createOmmlMathElement(doc, stepLatex, '19'));
                tcEl.appendChild(stepP);
              });
            });
          }
        } else if (tblOrdinal === 3) {
          const r0 = rows[0] ? directChildrenOfType(rows[0], 'tc') : [];
          const r1 = rows[1] ? directChildrenOfType(rows[1], 'tc') : [];
          const r2 = rows[2] ? directChildrenOfType(rows[2], 'tc') : [];
          const resolvedDatePerformed = getResolvedDatePerformed(expReport, metadata, overrides);

          if (r0[1] && metadata.instructorName.trim()) {
            appendLabelValueCell(doc, r0[1], metadata.instructorName);
          }
          if (r1[0] && resolvedDatePerformed.trim()) {
            appendLabelValueCell(doc, r1[0], resolvedDatePerformed);
          }
          if (r1[1] && metadata.studentName.trim()) {
            const studentFull = metadata.studentId.trim()
              ? `${metadata.studentName.trim()} (${metadata.studentId.trim()})`
              : metadata.studentName.trim();
            appendLabelValueCell(doc, r1[1], studentFull);
          }
          if (r2[0] && metadata.dateSubmitted.trim()) {
            appendLabelValueCell(doc, r2[0], metadata.dateSubmitted);
          }
          if (r2[1] && (metadata.groupNumber.trim() || metadata.section.trim())) {
            appendLabelValueCell(doc, r2[1], metadata.groupNumber.trim() || metadata.section.trim());
          }
        } else if (tblOrdinal === 4) {
          if (
            expReport.table1CaptionBlanks.length > 0 &&
            lastParagraph &&
            nodePlainText(lastParagraph).startsWith('Table 1.')
          ) {
            fillDocxParagraphBlanks(lastParagraph, expReport.table1CaptionBlanks);
          }
          for (let ri = 1; ri < rows.length; ri++) {
            const cells = directChildrenOfType(rows[ri], 'tc');
            for (let ci = 0; ci < cells.length; ci++) {
              // Preserve untouched original template XML (subscripts/superscripts/alignment)
              if (
                isCellModifiedOrLive(
                  expReport.table1LiveMask,
                  overrides.table1Cells,
                  bound.expNum,
                  ri - 1,
                  ci
                )
              ) {
                const val = getResolvedCellValue(
                  expReport.table1Rows,
                  overrides.table1Cells,
                  bound.expNum,
                  ri - 1,
                  ci
                );
                setCellText(doc, cells[ci], val);
              }
            }
          }
        } else if (tblOrdinal === 5) {
          for (let ri = 1; ri < rows.length; ri++) {
            const cells = directChildrenOfType(rows[ri], 'tc');
            for (let ci = 0; ci < cells.length; ci++) {
              if (
                isCellModifiedOrLive(
                  expReport.table2LiveMask,
                  overrides.table2Cells,
                  bound.expNum,
                  ri - 1,
                  ci
                )
              ) {
                const val = getResolvedCellValue(
                  expReport.table2Rows,
                  overrides.table2Cells,
                  bound.expNum,
                  ri - 1,
                  ci
                );
                setCellText(doc, cells[ci], val);
              }
            }
          }
          if (metadata.includeAnswerKey) {
            const compLines = buildLiveExperimentComputations(expReport, overrides);
            if (compLines.length > 0) {
              pendingComputationsAfterTbl5.push({ anchor: node, lines: compLines });
            }
          }
        }
      } else if (node.localName === 'p') {
        lastParagraph = node;
        const pt = nodePlainText(node);
        if (!pt) continue;

        if (pt === 'Guide Questions:') {
          section = 'GUIDE';
          guideParaCount = 0;
          continue;
        }
        if (pt === 'Exercises:') {
          section = 'EXERCISES';
          exerciseAnswerIdx = 0;
          continue;
        }
        if (pt === 'Observation:') {
          section = 'OBSERVATION';
          continue;
        }
        if (pt === 'Conclusion:') {
          section = 'CONCLUSION';
          continue;
        }
        if (pt === 'Recommendation:') {
          section = 'RECOMMENDATION';
          continue;
        }

        const blankLine =
          '_______________________________________________________________________________________';

        if (section === 'GUIDE') {
          guideParaCount++;
          if (guideParaCount % 2 === 0) {
            const qIdx = Math.floor(guideParaCount / 2) - 1;
            if (!metadata.includeAnswerKey) {
              replaceParagraphText(doc, node, blankLine, true);
            } else {
              const richAns = EXPERIMENT_LATEX_GUIDE_ANSWERS[bound.expNum]?.[qIdx];
              if (richAns) {
                const pPr = Array.from(node.childNodes).find(
                  (n) => n.nodeType === 1 && (n as Element).localName === 'pPr'
                );
                while (node.firstChild) node.removeChild(node.firstChild);
                if (pPr) node.appendChild(pPr);
                appendLatexRichRunsToParagraph(doc, node, richAns, {
                  italicText: true,
                  fontSizeHalfPts: '20',
                });
              }
            }
          }
        } else if (section === 'EXERCISES') {
          if (pt.startsWith('Answer:')) {
            if (!metadata.includeAnswerKey) {
              replaceParagraphText(doc, node, `Answer: ${blankLine}`, true);
            } else {
              const richEx = EXPERIMENT_LATEX_EXERCISE_ANSWERS[bound.expNum]?.[exerciseAnswerIdx];
              if (richEx) {
                const pPr = Array.from(node.childNodes).find(
                  (n) => n.nodeType === 1 && (n as Element).localName === 'pPr'
                );
                while (node.firstChild) node.removeChild(node.firstChild);
                if (pPr) node.appendChild(pPr);
                appendLatexRichRunsToParagraph(doc, node, richEx, {
                  italicText: true,
                  fontSizeHalfPts: '20',
                });
              }
            }
            exerciseAnswerIdx++;
          }
        } else if (section === 'OBSERVATION') {
          if (!metadata.includeAnswerKey) {
            replaceParagraphText(doc, node, blankLine, true);
          } else {
            const customObs = overrides.observations[bound.expNum];
            if (customObs !== undefined) {
              replaceParagraphText(doc, node, customObs, true);
            } else if (expReport.hasCustomStudentNotes) {
              replaceParagraphText(doc, node, expReport.observationText, true);
            }
          }
          section = 'NONE';
        } else if (section === 'CONCLUSION') {
          if (!metadata.includeAnswerKey) {
            replaceParagraphText(doc, node, blankLine, true);
          } else {
            const customConc = overrides.conclusions[bound.expNum];
            if (customConc !== undefined) {
              replaceParagraphText(doc, node, customConc, true);
            } else if (expReport.hasCustomStudentNotes) {
              replaceParagraphText(doc, node, expReport.conclusionText, true);
            }
          }
          section = 'NONE';
        } else if (section === 'RECOMMENDATION') {
          if (!metadata.includeAnswerKey) {
            replaceParagraphText(doc, node, blankLine, true);
          } else {
            const customRec = overrides.recommendations[bound.expNum];
            if (customRec !== undefined) {
              replaceParagraphText(doc, node, customRec, true);
            } else if (expReport.hasCustomStudentNotes) {
              replaceParagraphText(doc, node, expReport.recommendationText, true);
            }
          }
          section = 'NONE';
        }
      }
    }

    // Insert Sample Computations (native Word OMML equations) cleanly after Table 2
    pendingComputationsAfterTbl5.forEach(({ anchor, lines }) => {
      const parent = anchor.parentNode;
      if (!parent) return;
      const insertRef = anchor.nextSibling;

      const makeCompP = (leftIndent: string, spacingAfter: string) => {
        const p = doc.createElementNS(W_NS, 'w:p');
        const pPr = doc.createElementNS(W_NS, 'w:pPr');
        const sp = doc.createElementNS(W_NS, 'w:spacing');
        sp.setAttributeNS(W_NS, 'w:before', '40');
        sp.setAttributeNS(W_NS, 'w:after', spacingAfter);
        const ind = doc.createElementNS(W_NS, 'w:ind');
        ind.setAttributeNS(W_NS, 'w:left', leftIndent);
        pPr.appendChild(sp);
        pPr.appendChild(ind);
        p.appendChild(pPr);
        return p;
      };

      const headingP = makeCompP('144', '40');
      headingP.appendChild(
        createWordTextRun(doc, 'Sample Computations:', { bold: true, fontSizeHalfPts: '20' })
      );
      parent.insertBefore(headingP, insertRef);

      lines.forEach((line) => {
        const labelP = makeCompP('300', '20');
        labelP.appendChild(
          createWordTextRun(doc, line.label, { bold: true, fontSizeHalfPts: '19' })
        );
        parent.insertBefore(labelP, insertRef);

        line.steps.forEach((stepLatex) => {
          const stepP = makeCompP('540', '40');
          stepP.appendChild(createOmmlMathElement(doc, stepLatex, '19'));
          parent.insertBefore(stepP, insertRef);
        });
      });
    });
  });

  nodesToRemove.forEach((n) => body.removeChild(n));

  let serialized = new XMLSerializer().serializeToString(doc);
  if (!serialized.startsWith('<?xml')) {
    serialized = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${serialized}`;
  }
  return serialized;
}

export async function preloadDocxTemplateXml(): Promise<string> {
  if (cachedTemplateXml) return cachedTemplateXml;
  const xmlRes = await fetch('/assets/report/document_template.xml');
  if (!xmlRes.ok) {
    throw new Error(`Could not load document_template.xml (${xmlRes.status})`);
  }
  cachedTemplateXml = await xmlRes.text();
  return cachedTemplateXml;
}

export function prepareCustomLabManualXmlSync(
  report: MasterReportState,
  metadata: ReportMetadata,
  overrides: ReportOverrides
): { xml: string; filename: string } | null {
  if (!cachedTemplateXml) return null;
  const xml = patchDocumentXml(cachedTemplateXml, report, metadata, overrides);
  return { xml, filename: buildDocxFileName(metadata) };
}

export async function prepareCustomLabManualXml(
  report: MasterReportState,
  metadata: ReportMetadata,
  overrides: ReportOverrides
): Promise<{ xml: string; filename: string }> {
  const tpl = await preloadDocxTemplateXml();
  const xml = patchDocumentXml(tpl, report, metadata, overrides);
  return { xml, filename: buildDocxFileName(metadata) };
}

export async function generateCustomLabManualDocx(
  report: MasterReportState,
  metadata: ReportMetadata,
  overrides: ReportOverrides
): Promise<Blob> {
  const [docxRes, prepared] = await Promise.all([
    fetch('/assets/report/physics_lab_manual_template.docx'),
    prepareCustomLabManualXml(report, metadata, overrides),
  ]);

  if (!docxRes.ok) {
    throw new Error('Could not load physics_lab_manual_template.docx from /assets/report/');
  }

  const docxBuffer = await docxRes.arrayBuffer();
  const patchedXmlBytes = new TextEncoder().encode(prepared.xml);
  const finalZipBytes = replaceZipEntryBytes(
    new Uint8Array(docxBuffer),
    'word/document.xml',
    patchedXmlBytes
  );

  const cleanBuffer = new ArrayBuffer(finalZipBytes.byteLength);
  new Uint8Array(cleanBuffer).set(finalZipBytes);

  return new Blob([cleanBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function buildDocxFileName(metadata: ReportMetadata): string {
  const cleanStudent = (metadata.studentName || 'Student')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const scopeTag = metadata.scope === 'room3' ? 'Room3_Exp8-10' : 'Full_Manual_Exp1-10';
  return `UPHSD_Physics_Lab_Report_${scopeTag}_${cleanStudent || 'Student'}.docx`;
}
