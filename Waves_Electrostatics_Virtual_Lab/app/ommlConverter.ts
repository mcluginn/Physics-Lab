'use client';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const SYMBOL_MAP: Record<string, string> = {
  pi: 'π',
  rho: 'ρ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  Delta: 'Δ',
  delta: 'δ',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  omega: 'ω',
  Omega: 'Ω',
  Sigma: 'Σ',
  sum: '∑',
  tau: 'τ',
  phi: 'φ',
  epsilon: 'ε',
  varepsilon: 'ε',
  infty: '∞',
  times: '×',
  cdot: '·',
  approx: '≈',
  neq: '≠',
  le: '≤',
  ge: '≥',
  pm: '±',
  implies: ' ⇒ ',
  to: ' → ',
  rightarrow: ' → ',
  parallel: '∥',
  circ: '°',
  degree: '°',
  quad: '   ',
  qquad: '     ',
  ',': ' ',
  ';': ' ',
  ' ': ' ',
  '%': '%',
  '&': '&',
};

const FUNCTION_NAMES = new Set(['sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'ln', 'log', 'min', 'max']);

type OmmlOptions = {
  italicText?: boolean;
  fontSizeHalfPts?: string; // e.g. "20" for 10pt
};

class LatexParser {
  private pos = 0;
  constructor(
    private readonly src: string,
    private readonly doc: Document,
    private readonly fontSizeHalfPts: string
  ) {}

  private peek(): string {
    return this.src[this.pos] ?? '';
  }

  private skipWs() {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) {
      this.pos++;
    }
  }

  private readBracedGroup(): string {
    this.skipWs();
    if (this.peek() !== '{') {
      return this.readSingleToken();
    }
    this.pos++; // skip '{'
    let depth = 1;
    const start = this.pos;
    while (this.pos < this.src.length && depth > 0) {
      const ch = this.src[this.pos];
      if (ch === '\\' && this.pos + 1 < this.src.length) {
        this.pos += 2;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      this.pos++;
    }
    return this.src.slice(start, depth === 0 ? this.pos - 1 : this.pos);
  }

  private readSingleToken(): string {
    this.skipWs();
    if (this.pos >= this.src.length) return '';
    if (this.src[this.pos] === '\\') {
      this.pos++;
      if (this.pos >= this.src.length) return '';
      if (!/[a-zA-Z]/.test(this.src[this.pos])) {
        return '\\' + this.src[this.pos++];
      }
      const start = this.pos;
      while (this.pos < this.src.length && /[a-zA-Z]/.test(this.src[this.pos])) {
        this.pos++;
      }
      return '\\' + this.src.slice(start, this.pos);
    }
    return this.src[this.pos++];
  }

  private makeMathRun(text: string, plainStyle = false): Element {
    const r = this.doc.createElementNS(M_NS, 'm:r');
    if (plainStyle) {
      const mrPr = this.doc.createElementNS(M_NS, 'm:rPr');
      const sty = this.doc.createElementNS(M_NS, 'm:sty');
      sty.setAttributeNS(M_NS, 'm:val', 'p');
      mrPr.appendChild(sty);
      r.appendChild(mrPr);
    }
    const wrPr = this.doc.createElementNS(W_NS, 'w:rPr');
    const fonts = this.doc.createElementNS(W_NS, 'w:rFonts');
    fonts.setAttributeNS(W_NS, 'w:ascii', 'Cambria Math');
    fonts.setAttributeNS(W_NS, 'w:hAnsi', 'Cambria Math');
    const sz = this.doc.createElementNS(W_NS, 'w:sz');
    sz.setAttributeNS(W_NS, 'w:val', this.fontSizeHalfPts);
    wrPr.appendChild(fonts);
    wrPr.appendChild(sz);
    r.appendChild(wrPr);

    const t = this.doc.createElementNS(M_NS, 'm:t');
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    t.textContent = text;
    r.appendChild(t);
    return r;
  }

  private parseSubExpr(subLatex: string): Element {
    const e = this.doc.createElementNS(M_NS, 'm:e');
    const subParser = new LatexParser(subLatex, this.doc, this.fontSizeHalfPts);
    subParser.parseSequence().forEach((n) => e.appendChild(n));
    return e;
  }

  private wrapContainer(tagName: string, nodes: Element[]): Element {
    const el = this.doc.createElementNS(M_NS, tagName);
    nodes.forEach((n) => el.appendChild(n));
    return el;
  }

  private parseAtom(): Element | null {
    this.skipWs();
    if (this.pos >= this.src.length) return null;
    const ch = this.peek();

    if (ch === '{') {
      const inner = this.readBracedGroup();
      const subParser = new LatexParser(inner, this.doc, this.fontSizeHalfPts);
      const children = subParser.parseSequence();
      if (children.length === 1) return children[0];
      return this.wrapContainer('m:e', children);
    }

    if (ch === '\\') {
      const cmdTok = this.readSingleToken();
      const cmd = cmdTok.slice(1);

      if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
        const num = this.readBracedGroup();
        const den = this.readBracedGroup();
        const f = this.doc.createElementNS(M_NS, 'm:f');
        const numEl = this.doc.createElementNS(M_NS, 'm:num');
        new LatexParser(num, this.doc, this.fontSizeHalfPts)
          .parseSequence()
          .forEach((n) => numEl.appendChild(n));
        const denEl = this.doc.createElementNS(M_NS, 'm:den');
        new LatexParser(den, this.doc, this.fontSizeHalfPts)
          .parseSequence()
          .forEach((n) => denEl.appendChild(n));
        f.appendChild(numEl);
        f.appendChild(denEl);
        return f;
      }

      if (cmd === 'sqrt') {
        const rad = this.readBracedGroup();
        const r = this.doc.createElementNS(M_NS, 'm:rad');
        const pr = this.doc.createElementNS(M_NS, 'm:radPr');
        const degHide = this.doc.createElementNS(M_NS, 'm:degHide');
        degHide.setAttributeNS(M_NS, 'm:val', '1');
        pr.appendChild(degHide);
        const deg = this.doc.createElementNS(M_NS, 'm:deg');
        const e = this.parseSubExpr(rad);
        r.appendChild(pr);
        r.appendChild(deg);
        r.appendChild(e);
        return r;
      }

      if (cmd === 'left') {
        this.skipWs();
        const openChar = this.src[this.pos] === '\\' ? this.readSingleToken().slice(1) : this.src[this.pos++] || '(';
        const innerStart = this.pos;
        let leftDepth = 1;
        let closeChar = ')';
        while (this.pos < this.src.length && leftDepth > 0) {
          if (this.src.startsWith('\\left', this.pos)) {
            leftDepth++;
            this.pos += 5;
            continue;
          }
          if (this.src.startsWith('\\right', this.pos)) {
            leftDepth--;
            if (leftDepth === 0) {
              const innerEnd = this.pos;
              this.pos += 6;
              this.skipWs();
              closeChar = this.src[this.pos] === '\\' ? this.readSingleToken().slice(1) : this.src[this.pos++] || ')';
              const innerText = this.src.slice(innerStart, innerEnd);
              const d = this.doc.createElementNS(M_NS, 'm:d');
              const dPr = this.doc.createElementNS(M_NS, 'm:dPr');
              const beg = this.doc.createElementNS(M_NS, 'm:begChr');
              beg.setAttributeNS(M_NS, 'm:val', openChar === '.' ? '' : openChar);
              const end = this.doc.createElementNS(M_NS, 'm:endChr');
              end.setAttributeNS(M_NS, 'm:val', closeChar === '.' ? '' : closeChar);
              dPr.appendChild(beg);
              dPr.appendChild(end);
              d.appendChild(dPr);
              d.appendChild(this.parseSubExpr(innerText));
              return d;
            }
          }
          this.pos++;
        }
        return this.makeMathRun(openChar);
      }

      if (cmd === 'text' || cmd === 'mathrm' || cmd === 'textbf') {
        const inner = this.readBracedGroup();
        return this.makeMathRun(inner, true);
      }

      if (cmd === 'dot') {
        const inner = this.readBracedGroup();
        return this.makeMathRun(`${inner}\u0307`, false);
      }

      if (cmd === 'bar') {
        const inner = this.readBracedGroup();
        return this.makeMathRun(`${inner}\u0304`, false);
      }

      if (cmd === '!') {
        return null;
      }

      if (FUNCTION_NAMES.has(cmd)) {
        return this.makeMathRun(cmd, true);
      }

      if (Object.prototype.hasOwnProperty.call(SYMBOL_MAP, cmd)) {
        return this.makeMathRun(SYMBOL_MAP[cmd], false);
      }

      return this.makeMathRun(cmd, true);
    }

    // Read contiguous plain digits/operators/letters without '_' or '^' or '{' or '}' or '\'
    if (/[0-9]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.src.length && /[0-9.]/.test(this.src[this.pos])) {
        this.pos++;
      }
      return this.makeMathRun(this.src.slice(start, this.pos), true);
    }

    this.pos++;
    if (ch === '-') return this.makeMathRun('−', true);
    if (/[+\-=*/(),[\]|<>%:]/.test(ch)) return this.makeMathRun(ch, true);
    return this.makeMathRun(ch, false);
  }

  parseSequence(stopAt?: RegExp): Element[] {
    const out: Element[] = [];
    while (this.pos < this.src.length) {
      if (stopAt && stopAt.test(this.src.slice(this.pos))) break;
      const beforeWs = this.pos;
      this.skipWs();
      if (this.pos >= this.src.length) break;
      if (beforeWs !== this.pos && out.length > 0 && this.src[this.pos - 1] === ' ') {
        // preserve thin visual separation where appropriate around = or operators naturally
      }

      const atom = this.parseAtom();
      if (!atom) continue;

      let subText: string | null = null;
      let supText: string | null = null;

      for (let pass = 0; pass < 2; pass++) {
        this.skipWs();
        if (this.peek() === '_' && subText === null) {
          this.pos++;
          subText = this.readBracedGroup();
        } else if (this.peek() === '^' && supText === null) {
          this.pos++;
          supText = this.readBracedGroup();
        }
      }

      const baseEl = atom.localName === 'm:e' ? atom : this.wrapContainer('m:e', [atom]);

      if (subText !== null && supText !== null) {
        const sSubSup = this.doc.createElementNS(M_NS, 'm:sSubSup');
        sSubSup.appendChild(baseEl);
        const subEl = this.doc.createElementNS(M_NS, 'm:sub');
        new LatexParser(subText, this.doc, this.fontSizeHalfPts)
          .parseSequence()
          .forEach((n) => subEl.appendChild(n));
        const supEl = this.doc.createElementNS(M_NS, 'm:sup');
        new LatexParser(supText, this.doc, this.fontSizeHalfPts)
          .parseSequence()
          .forEach((n) => supEl.appendChild(n));
        sSubSup.appendChild(subEl);
        sSubSup.appendChild(supEl);
        out.push(sSubSup);
      } else if (subText !== null) {
        const sSub = this.doc.createElementNS(M_NS, 'm:sSub');
        sSub.appendChild(baseEl);
        const subEl = this.doc.createElementNS(M_NS, 'm:sub');
        new LatexParser(subText, this.doc, this.fontSizeHalfPts)
          .parseSequence()
          .forEach((n) => subEl.appendChild(n));
        sSub.appendChild(subEl);
        out.push(sSub);
      } else if (supText !== null) {
        const sSup = this.doc.createElementNS(M_NS, 'm:sSup');
        sSup.appendChild(baseEl);
        const supEl = this.doc.createElementNS(M_NS, 'm:sup');
        new LatexParser(supText, this.doc, this.fontSizeHalfPts)
          .parseSequence()
          .forEach((n) => supEl.appendChild(n));
        sSup.appendChild(supEl);
        out.push(sSup);
      } else if (atom.localName === 'm:e') {
        Array.from(atom.childNodes).forEach((c) => out.push(c as Element));
      } else {
        out.push(atom);
      }
    }
    return out;
  }
}

export function createOmmlMathElement(
  doc: Document,
  latex: string,
  fontSizeHalfPts = '20'
): Element {
  const oMath = doc.createElementNS(M_NS, 'm:oMath');
  const parser = new LatexParser(latex, doc, fontSizeHalfPts);
  const nodes = parser.parseSequence();
  nodes.forEach((n) => oMath.appendChild(n));
  return oMath;
}

export function createWordTextRun(
  doc: Document,
  text: string,
  options?: { bold?: boolean; italic?: boolean; fontSizeHalfPts?: string }
): Element {
  const r = doc.createElementNS(W_NS, 'w:r');
  const rPr = doc.createElementNS(W_NS, 'w:rPr');
  const fonts = doc.createElementNS(W_NS, 'w:rFonts');
  fonts.setAttributeNS(W_NS, 'w:ascii', 'Arial');
  fonts.setAttributeNS(W_NS, 'w:hAnsi', 'Arial');
  rPr.appendChild(fonts);

  if (options?.bold) {
    rPr.appendChild(doc.createElementNS(W_NS, 'w:b'));
  } else {
    const b = doc.createElementNS(W_NS, 'w:b');
    b.setAttributeNS(W_NS, 'w:val', '0');
    rPr.appendChild(b);
  }

  if (options?.italic) {
    rPr.appendChild(doc.createElementNS(W_NS, 'w:i'));
  } else {
    const i = doc.createElementNS(W_NS, 'w:i');
    i.setAttributeNS(W_NS, 'w:val', '0');
    rPr.appendChild(i);
  }

  const sz = doc.createElementNS(W_NS, 'w:sz');
  sz.setAttributeNS(W_NS, 'w:val', options?.fontSizeHalfPts ?? '20');
  rPr.appendChild(sz);

  r.appendChild(rPr);

  const t = doc.createElementNS(W_NS, 'w:t');
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  return r;
}

/**
 * Appends prose containing $...$ inline LaTeX to a WordprocessingML <w:p> using native <m:oMath>.
 */
export function appendLatexRichRunsToParagraph(
  doc: Document,
  pEl: Element,
  richText: string,
  options?: OmmlOptions
) {
  const fontSize = options?.fontSizeHalfPts ?? '20';
  const parts = richText.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
  for (const part of parts) {
    if (!part) continue;
    if ((part.startsWith('$$') && part.endsWith('$$')) || (part.startsWith('$') && part.endsWith('$'))) {
      const inner = part.startsWith('$$') ? part.slice(2, -2) : part.slice(1, -1);
      pEl.appendChild(createOmmlMathElement(doc, inner, fontSize));
    } else {
      pEl.appendChild(
        createWordTextRun(doc, part, {
          bold: false,
          italic: options?.italicText ?? false,
          fontSizeHalfPts: fontSize,
        })
      );
    }
  }
}
