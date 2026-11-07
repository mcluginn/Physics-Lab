import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './pngEncoder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/assets/placards');

// Bitmap font renderer for clean technical text
// Standard 5x7 bitmap font expanded for headings & formulas
const FONT_5X7 = {
  ' ': [0,0,0,0,0],
  '!': [0,0,0x5F,0,0],
  '"': [0,0x07,0,0x07,0],
  '#': [0x14,0x7F,0x14,0x7F,0x14],
  '$': [0x24,0x2A,0x7F,0x2A,0x12],
  '%': [0x23,0x13,0x08,0x64,0x62],
  '&': [0x36,0x49,0x55,0x22,0x50],
  "'": [0,0x05,0x03,0,0],
  '(': [0,0x1C,0x22,0x41,0],
  ')': [0,0x41,0x22,0x1C,0],
  '*': [0x14,0x08,0x3E,0x08,0x14],
  '+': [0x08,0x08,0x3E,0x08,0x08],
  ',': [0,0x50,0x30,0,0],
  '-': [0x08,0x08,0x08,0x08,0x08],
  '.': [0,0x60,0x60,0,0],
  '/': [0x20,0x10,0x08,0x04,0x02],
  '0': [0x3E,0x51,0x49,0x45,0x3E],
  '1': [0x00,0x42,0x7F,0x40,0x00],
  '2': [0x42,0x61,0x51,0x49,0x46],
  '3': [0x21,0x41,0x45,0x4B,0x31],
  '4': [0x18,0x14,0x12,0x7F,0x10],
  '5': [0x27,0x45,0x45,0x45,0x39],
  '6': [0x3C,0x4A,0x49,0x49,0x30],
  '7': [0x01,0x71,0x09,0x05,0x03],
  '8': [0x36,0x49,0x49,0x49,0x36],
  '9': [0x06,0x49,0x49,0x29,0x1E],
  ':': [0,0x36,0x36,0,0],
  ';': [0,0x56,0x36,0,0],
  '<': [0x08,0x14,0x22,0x41,0],
  '=': [0x14,0x14,0x14,0x14,0x14],
  '>': [0,0x41,0x22,0x14,0x08],
  '?': [0x02,0x01,0x51,0x09,0x06],
  '@': [0x32,0x49,0x79,0x41,0x3E],
  'A': [0x7E,0x11,0x11,0x11,0x7E],
  'B': [0x7F,0x49,0x49,0x49,0x36],
  'C': [0x3E,0x41,0x41,0x41,0x22],
  'D': [0x7F,0x41,0x41,0x22,0x1C],
  'E': [0x7F,0x49,0x49,0x49,0x41],
  'F': [0x7F,0x09,0x09,0x09,0x01],
  'G': [0x3E,0x41,0x49,0x49,0x7A],
  'H': [0x7F,0x08,0x08,0x08,0x7F],
  'I': [0x00,0x41,0x7F,0x41,0x00],
  'J': [0x20,0x40,0x41,0x3F,0x01],
  'K': [0x7F,0x08,0x14,0x22,0x41],
  'L': [0x7F,0x40,0x40,0x40,0x40],
  'M': [0x7F,0x02,0x0C,0x02,0x7F],
  'N': [0x7F,0x04,0x08,0x10,0x7F],
  'O': [0x3E,0x41,0x41,0x41,0x3E],
  'P': [0x7F,0x09,0x09,0x09,0x06],
  'Q': [0x3E,0x41,0x51,0x21,0x5E],
  'R': [0x7F,0x09,0x19,0x29,0x46],
  'S': [0x46,0x49,0x49,0x49,0x31],
  'T': [0x01,0x01,0x7F,0x01,0x01],
  'U': [0x3F,0x40,0x40,0x40,0x3F],
  'V': [0x1F,0x20,0x40,0x20,0x1F],
  'W': [0x7F,0x20,0x18,0x20,0x7F],
  'X': [0x63,0x14,0x08,0x14,0x63],
  'Y': [0x07,0x08,0x70,0x08,0x07],
  'Z': [0x61,0x51,0x49,0x45,0x43],
  '[': [0,0x7F,0x41,0x41,0],
  '\\': [0x02,0x04,0x08,0x10,0x20],
  ']': [0,0x41,0x41,0x7F,0],
  '^': [0x04,0x02,0x01,0x02,0x04],
  '_': [0x40,0x40,0x40,0x40,0x40],
  '`': [0,0x01,0x02,0x04,0],
  'a': [0x20,0x54,0x54,0x54,0x78],
  'b': [0x7F,0x48,0x44,0x44,0x38],
  'c': [0x38,0x44,0x44,0x44,0x20],
  'd': [0x38,0x44,0x44,0x48,0x7F],
  'e': [0x38,0x54,0x54,0x54,0x18],
  'f': [0x08,0x7E,0x09,0x01,0x02],
  'g': [0x0C,0x52,0x52,0x52,0x3E],
  'h': [0x7F,0x08,0x04,0x04,0x78],
  'i': [0,0x44,0x7D,0x40,0],
  'j': [0x20,0x40,0x44,0x3D,0],
  'k': [0x7F,0x10,0x28,0x44,0],
  'l': [0,0x41,0x7F,0x40,0],
  'm': [0x7C,0x04,0x18,0x04,0x78],
  'n': [0x7C,0x08,0x04,0x04,0x78],
  'o': [0x38,0x44,0x44,0x44,0x38],
  'p': [0x7C,0x14,0x14,0x14,0x08],
  'q': [0x08,0x14,0x14,0x18,0x7C],
  'r': [0x7C,0x08,0x04,0x04,0x08],
  's': [0x48,0x54,0x54,0x54,0x20],
  't': [0x04,0x3F,0x44,0x40,0x20],
  'u': [0x3C,0x40,0x40,0x20,0x7C],
  'v': [0x1C,0x20,0x40,0x20,0x1C],
  'w': [0x3C,0x40,0x30,0x40,0x3C],
  'x': [0x44,0x28,0x10,0x28,0x44],
  'y': [0x0C,0x50,0x50,0x50,0x3C],
  'z': [0x44,0x64,0x54,0x4C,0x44],
  '|': [0,0,0x7F,0,0],
  '~': [0x08,0x04,0x08,0x10,0x08],
  '·': [0,0x18,0x18,0,0],
  'λ': [0x40,0x20,0x1F,0x24,0x42],
  'θ': [0x3E,0x49,0x49,0x49,0x3E],
  'π': [0x7E,0x02,0x7E,0x02,0x02],
  'γ': [0x06,0x09,0x70,0x09,0x06],
  'Ω': [0x42,0x61,0x51,0x49,0x46],
  '√': [0x10,0x20,0x7F,0x01,0x01],
  'Δ': [0x70,0x2C,0x13,0x2C,0x70],
  '±': [0x08,0x3E,0x08,0x14,0x14],
};

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
  }

  setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    if (a === 255) {
      this.data[idx] = r;
      this.data[idx + 1] = g;
      this.data[idx + 2] = b;
      this.data[idx + 3] = 255;
    } else {
      const alpha = a / 255;
      const inv = 1 - alpha;
      this.data[idx] = Math.round(r * alpha + this.data[idx] * inv);
      this.data[idx + 1] = Math.round(g * alpha + this.data[idx + 1] * inv);
      this.data[idx + 2] = Math.round(b * alpha + this.data[idx + 2] * inv);
      this.data[idx + 3] = 255;
    }
  }

  fillRect(x, y, w, h, r, g, b, a = 255) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.setPixel(px, py, r, g, b, a);
      }
    }
  }

  drawGradientV(x, y, w, h, cTop, cBot) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      const t = (py - y) / Math.max(1, h);
      const r = Math.round(cTop[0] * (1 - t) + cBot[0] * t);
      const g = Math.round(cTop[1] * (1 - t) + cBot[1] * t);
      const b = Math.round(cTop[2] * (1 - t) + cBot[2] * t);
      for (let px = x0; px < x1; px++) {
        this.setPixel(px, py, r, g, b);
      }
    }
  }

  strokeRect(x, y, w, h, lw, r, g, b, a = 255) {
    this.fillRect(x, y, w, lw, r, g, b, a);
    this.fillRect(x, y + h - lw, w, lw, r, g, b, a);
    this.fillRect(x, y, lw, h, r, g, b, a);
    this.fillRect(x + w - lw, y, lw, h, r, g, b, a);
  }

  drawLine(x0, y0, x1, y1, lw, r, g, b, a = 255) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    const rad = Math.floor(lw / 2);
    while (true) {
      this.fillRect(cx - rad, cy - rad, lw, lw, r, g, b, a);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }

  drawText(text, x, y, scale = 2, r = 255, g = 255, b = 255) {
    let curX = x;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const cols = FONT_5X7[char] || FONT_5X7['?'] || [0x7F, 0x7F, 0x7F, 0x7F, 0x7F];
      for (let col = 0; col < 5; col++) {
        const bits = cols[col];
        for (let row = 0; row < 7; row++) {
          if ((bits >> row) & 1) {
            this.fillRect(curX + col * scale, y + row * scale, scale, scale, r, g, b);
          }
        }
      }
      curX += 6 * scale;
    }
  }

  toBuffer() {
    return encodePng(this.width, this.height, this.data);
  }
}

// -------------------------------------------------------------
// 1. PLACARD: ELECTRICITY (DC & AC CIRCUITS)
// -------------------------------------------------------------
function makeElectricityPlacard() {
  const W = 1200, H = 800;
  const cv = new Canvas(W, H);

  // Background
  cv.drawGradientV(0, 0, W, H, [10, 20, 36], [4, 8, 16]);

  // Border & Gold Filigree
  cv.strokeRect(16, 16, W - 32, H - 32, 4, 56, 189, 248);
  cv.strokeRect(26, 26, W - 52, H - 52, 1, 30, 58, 95);

  // Header Bar
  cv.fillRect(26, 26, W - 52, 100, 15, 28, 48);
  cv.drawText('PHYSICS UNIVERSITY - ROOM 03 - APPARATUS 01', 50, 42, 2, 56, 189, 248);
  cv.drawText('DC & AC ELECTRICAL CIRCUITS LAB', 50, 68, 4, 255, 255, 255);
  cv.drawText('Voltage - Current - Resistance - RLC Impedance - Power', 50, 102, 2, 148, 163, 184);

  // Left Section: DC Circuit & Ohm / Kirchhoff
  cv.fillRect(40, 150, 545, 290, 14, 25, 42);
  cv.strokeRect(40, 150, 545, 290, 2, 56, 189, 248, 140);
  cv.drawText('DC STEADY-STATE: OHM & KIRCHHOFF LAWS', 60, 168, 2, 56, 189, 248);

  // Schematic DC loop
  cv.strokeRect(55, 210, 175, 140, 3, 226, 232, 240);
  // Source battery
  cv.fillRect(51, 260, 12, 40, 14, 25, 42);
  cv.drawLine(45, 270, 69, 270, 4, 56, 189, 248);
  cv.drawLine(51, 285, 63, 285, 3, 56, 189, 248);
  cv.drawText('Vs = 12V', 58, 300, 2, 56, 189, 248);
  // Resistors
  cv.fillRect(115, 206, 50, 10, 245, 158, 11);
  cv.drawText('R1', 130, 190, 2, 245, 158, 11);
  cv.fillRect(225, 255, 10, 50, 245, 158, 11);
  cv.drawText('R2', 200, 270, 2, 245, 158, 11);
  cv.fillRect(115, 346, 50, 10, 245, 158, 11);
  cv.drawText('R3', 130, 362, 2, 245, 158, 11);

  // Formulas box
  cv.drawText('Ohm:      V = I * Req', 248, 220, 2, 255, 255, 255);
  cv.drawText('Series:   Req = R1 + R2 + R3', 248, 250, 2, 148, 163, 184);
  cv.drawText('Parallel: 1/Req = 1/R1 + 1/R2', 248, 280, 2, 148, 163, 184);
  cv.drawText('KVL:      sum(V_loop) = 0', 248, 310, 2, 56, 189, 248);
  cv.drawText('KCL:      sum(I_in) = sum(I_out)', 248, 340, 2, 56, 189, 248);
  cv.drawText('Power:    P = V * I = I^2 * Req', 248, 370, 2, 245, 158, 11);

  // Right Section: AC RLC Circuits & Impedance
  cv.fillRect(630, 150, 530, 290, 14, 25, 42);
  cv.strokeRect(630, 150, 530, 290, 2, 56, 189, 248, 140);
  cv.drawText('AC SINUSOIDAL: RLC PHASORS & IMPEDANCE', 650, 168, 2, 56, 189, 248);

  // AC sine curve
  for (let px = 660; px <= 840; px++) {
    const angle = ((px - 660) / 180) * Math.PI * 4;
    const py = 280 - Math.sin(angle) * 45;
    cv.fillRect(px, py, 2, 3, 56, 189, 248);
    // current lagging
    const pyI = 280 - Math.sin(angle - 0.9) * 35;
    cv.fillRect(px, pyI, 2, 2, 245, 158, 11);
  }
  cv.drawText('V(t)', 848, 245, 2, 56, 189, 248);
  cv.drawText('I(t)', 848, 275, 2, 245, 158, 11);

  // AC formulas
  cv.drawText('Impedance:  Z = sqrt(R^2 + (XL - XC)^2)', 650, 340, 2, 255, 255, 255);
  cv.drawText('Inductive:  XL = 2*pi*f*L', 650, 370, 2, 148, 163, 184);
  cv.drawText('Capacitive: XC = 1 / (2*pi*f*C)', 650, 400, 2, 148, 163, 184);

  // Bottom Section: Phase, Power Factor, and Instruments
  cv.fillRect(40, 460, 1120, 290, 14, 25, 42);
  cv.strokeRect(40, 460, 1120, 290, 2, 56, 189, 248, 140);
  cv.drawText('INSTRUMENTATION & POWER DYNAMICS', 60, 480, 2, 56, 189, 248);

  // Phasor Diagram on left
  cv.strokeRect(70, 520, 200, 200, 1, 30, 58, 95);
  cv.drawLine(70, 620, 270, 620, 1, 71, 85, 105);
  cv.drawLine(170, 520, 170, 720, 1, 71, 85, 105);
  // Phasor vectors
  cv.drawLine(170, 620, 240, 620, 3, 56, 189, 248); // R
  cv.drawLine(240, 620, 240, 550, 3, 245, 158, 11); // XL - XC
  cv.drawLine(170, 620, 240, 550, 4, 255, 255, 255); // Z
  cv.drawText('R (In-Phase)', 200, 630, 1, 56, 189, 248);
  cv.drawText('XL-XC', 246, 580, 1, 245, 158, 11);
  cv.drawText('Z', 195, 570, 2, 255, 255, 255);

  cv.drawText('PHASOR ANGLE & POWER FACTOR:', 300, 520, 2, 255, 255, 255);
  cv.drawText('phi = arctan((XL - XC) / R)', 300, 550, 3, 56, 189, 248);
  cv.drawText('Power Factor = cos(phi) = R / Z', 300, 585, 2, 245, 158, 11);
  cv.drawText('Real Power:      P = V_rms * I_rms * cos(phi)  (Watts, W)', 300, 615, 2, 226, 232, 240);
  cv.drawText('Reactive Power:  Q = V_rms * I_rms * sin(phi)  (VAR)', 300, 645, 2, 148, 163, 184);
  cv.drawText('Apparent Power:  S = V_rms * I_rms             (Volt-Amps, VA)', 300, 675, 2, 148, 163, 184);
  cv.drawText('Resonance:       f0 = 1 / (2*pi*sqrt(L*C))', 300, 710, 2, 52, 211, 153);

  return cv.toBuffer();
}

// -------------------------------------------------------------
// 2. PLACARD: OPTICS (GEOMETRIC & PHYSICAL OPTICS)
// -------------------------------------------------------------
function makeOpticsPlacard() {
  const W = 1200, H = 800;
  const cv = new Canvas(W, H);

  // Background
  cv.drawGradientV(0, 0, W, H, [8, 28, 22], [3, 12, 9]);

  // Border & Emerald Filigree
  cv.strokeRect(16, 16, W - 32, H - 32, 4, 16, 185, 129);
  cv.strokeRect(26, 26, W - 52, H - 52, 1, 20, 83, 45);

  // Header Bar
  cv.fillRect(26, 26, W - 52, 100, 10, 38, 26);
  cv.drawText('PHYSICS UNIVERSITY - ROOM 03 - APPARATUS 02', 50, 42, 2, 52, 211, 153);
  cv.drawText('GEOMETRIC & PHYSICAL OPTICS BENCH', 50, 68, 4, 255, 255, 255);
  cv.drawText('Snell Refraction - Lenses & Mirrors - Wave Diffraction - Interference', 50, 102, 2, 167, 243, 208);

  // Left Section: Snell's Law & Total Internal Reflection
  cv.fillRect(40, 150, 360, 290, 8, 32, 22);
  cv.strokeRect(40, 150, 360, 290, 2, 16, 185, 129, 140);
  cv.drawText('REFRACTION & TIR', 60, 168, 2, 52, 211, 153);

  // Interface
  cv.fillRect(60, 280, 320, 120, 6, 78, 59, 100);
  cv.drawLine(60, 280, 380, 280, 2, 110, 231, 183);
  cv.drawLine(220, 200, 220, 360, 1, 100, 116, 139); // normal
  // incident & refracted rays
  cv.drawLine(140, 220, 220, 280, 3, 239, 68, 68); // incident
  cv.drawLine(220, 280, 270, 350, 3, 52, 211, 153); // refracted
  cv.drawLine(220, 280, 300, 220, 2, 239, 68, 68, 120); // reflected

  cv.drawText('Snell: n1 sin(th1) = n2 sin(th2)', 60, 380, 2, 255, 255, 255);
  cv.drawText('TIR:   theta_c = arcsin(n2/n1)', 60, 405, 2, 251, 191, 36);

  // Middle Section: Thin Lenses & Spherical Mirrors
  cv.fillRect(420, 150, 360, 290, 8, 32, 22);
  cv.strokeRect(420, 150, 360, 290, 2, 16, 185, 129, 140);
  cv.drawText('THIN LENSES & MIRRORS', 440, 168, 2, 52, 211, 153);

  // Principal axis
  cv.drawLine(440, 280, 760, 280, 1, 100, 116, 139);
  // Lens
  cv.drawLine(600, 210, 600, 350, 3, 167, 243, 208);
  // Object & Image
  cv.drawLine(480, 280, 480, 230, 3, 251, 191, 36); // Object
  cv.drawLine(680, 280, 680, 320, 3, 52, 211, 153); // Inverted real image

  cv.drawText('1/f = 1/do + 1/di', 440, 360, 2, 255, 255, 255);
  cv.drawText('M = - di / do = hi / ho', 440, 385, 2, 167, 243, 208);
  cv.drawText('f > 0: Converging | f < 0: Diverging', 440, 410, 1, 148, 163, 184);

  // Right Section: Wave Diffraction & Interference
  cv.fillRect(800, 150, 360, 290, 8, 32, 22);
  cv.strokeRect(800, 150, 360, 290, 2, 16, 185, 129, 140);
  cv.drawText('DIFFRACTION & INTERFERENCE', 820, 168, 2, 52, 211, 153);

  // Fringes pattern
  for (let fx = 830; fx <= 1130; fx += 1) {
    const dist = Math.abs(fx - 980);
    const sinc = dist === 0 ? 1 : Math.sin(dist * 0.08) / (dist * 0.08);
    const cos2 = Math.cos(dist * 0.16) ** 2;
    const intensity = Math.min(1, Math.max(0, sinc * sinc * cos2));
    const hBar = Math.round(intensity * 70);
    cv.fillRect(fx, 280 - hBar, 1, hBar * 2, 52, 211, 153, Math.round(intensity * 255));
  }

  cv.drawText('Fringes:  dy = lambda*L / d', 820, 360, 2, 255, 255, 255);
  cv.drawText('Minima:   a*sin(th) = m*lam', 820, 385, 2, 167, 243, 208);
  cv.drawText('Central:  w = 2*lambda*L / a', 820, 410, 2, 251, 191, 36);

  // Bottom Summary Panel
  cv.fillRect(40, 460, 1120, 290, 8, 32, 22);
  cv.strokeRect(40, 460, 1120, 290, 2, 16, 185, 129, 140);
  cv.drawText('ANALYTICAL CLASSIFICATION & QUANTITATIVE RULES', 60, 480, 2, 52, 211, 153);

  cv.drawText('1. SNELL LAW: Light bends toward normal entering denser medium (n2 > n1).', 60, 520, 2, 255, 255, 255);
  cv.drawText('   Critical angle exists ONLY when light travels from higher to lower index (n1 > n2).', 60, 545, 2, 167, 243, 208);

  cv.drawText('2. THIN LENS CONVENTIONS: Real images form on opposite side of lens (di > 0).', 60, 580, 2, 255, 255, 255);
  cv.drawText('   Magnification M < 0 indicates an inverted image; |M| > 1 indicates enlargement.', 60, 605, 2, 167, 243, 208);

  cv.drawText('3. INTERFERENCE & DIFFRACTION: Shorter wavelengths (violet 400nm) produce tighter fringes.', 60, 640, 2, 255, 255, 255);
  cv.drawText('   Longer wavelengths disperse wider. Narrower slits broaden the diffraction envelope.', 60, 665, 2, 167, 243, 208);
  cv.drawText('   Wavelength Color Mapping: 400nm (Violet) -> 532nm (Emerald Green) -> 650nm (Ruby Red)', 60, 700, 2, 251, 191, 36);

  return cv.toBuffer();
}

// -------------------------------------------------------------
// 3. PLACARD: SPECIAL RELATIVITY (LORENTZ & MASS-ENERGY)
// -------------------------------------------------------------
function makeRelativityPlacard() {
  const W = 1200, H = 800;
  const cv = new Canvas(W, H);

  // Background
  cv.drawGradientV(0, 0, W, H, [22, 10, 36], [8, 3, 16]);

  // Border & Violet/Purple Filigree
  cv.strokeRect(16, 16, W - 32, H - 32, 4, 168, 85, 247);
  cv.strokeRect(26, 26, W - 52, H - 52, 1, 88, 28, 135);

  // Header Bar
  cv.fillRect(26, 26, W - 52, 100, 35, 15, 58);
  cv.drawText('PHYSICS UNIVERSITY - ROOM 03 - APPARATUS 03', 50, 42, 2, 192, 132, 252);
  cv.drawText('SPECIAL RELATIVITY & MASS-ENERGY CHAMBER', 50, 68, 4, 255, 255, 255);
  cv.drawText('Lorentz Factor - Time Dilation - Length Contraction - E = gamma*m0*c^2', 50, 102, 2, 216, 180, 254);

  // Left Section: Lorentz Factor gamma(v)
  cv.fillRect(40, 150, 360, 290, 25, 12, 42);
  cv.strokeRect(40, 150, 360, 290, 2, 168, 85, 247, 140);
  cv.drawText('LORENTZ FACTOR gamma(beta)', 60, 168, 2, 192, 132, 252);

  // Plot gamma vs beta
  cv.strokeRect(60, 210, 300, 150, 1, 75, 25, 110);
  cv.drawLine(60, 360, 360, 360, 2, 100, 116, 139); // x axis (beta)
  cv.drawLine(60, 210, 60, 360, 2, 100, 116, 139); // y axis (gamma)

  for (let bx = 0; bx <= 280; bx++) {
    const beta = bx / 290;
    const gamma = 1 / Math.sqrt(Math.max(0.001, 1 - beta * beta));
    const py = Math.max(215, Math.round(360 - (gamma - 1) * 35));
    cv.fillRect(60 + bx, py, 2, 2, 192, 132, 252);
  }

  cv.drawText('gamma = 1 / sqrt(1 - beta^2)', 60, 380, 2, 255, 255, 255);
  cv.drawText('v = 0.60c -> gamma = 1.250', 60, 405, 2, 216, 180, 254);
  cv.drawText('v = 0.866c -> gamma = 2.000', 60, 425, 2, 251, 191, 36);

  // Middle Section: Time Dilation & Photon Light Clock
  cv.fillRect(420, 150, 360, 290, 25, 12, 42);
  cv.strokeRect(420, 150, 360, 290, 2, 168, 85, 247, 140);
  cv.drawText('TIME DILATION: PHOTON CLOCK', 440, 168, 2, 192, 132, 252);

  // Light clock diagrams: Rest vs Moving
  // Rest
  cv.fillRect(460, 220, 40, 6, 226, 232, 240); // top mirror
  cv.fillRect(460, 320, 40, 6, 226, 232, 240); // bot mirror
  cv.drawLine(480, 226, 480, 320, 2, 251, 191, 36);
  cv.drawText('Frame S0', 450, 335, 1, 148, 163, 184);

  // Moving
  cv.fillRect(560, 220, 40, 6, 226, 232, 240);
  cv.fillRect(660, 320, 40, 6, 226, 232, 240);
  cv.drawLine(580, 226, 680, 320, 3, 192, 132, 252); // diagonal hypotenuse
  cv.drawText('Frame S (Moving)', 580, 335, 1, 148, 163, 184);

  cv.drawText('Delta t = gamma * Delta t0', 440, 370, 2, 255, 255, 255);
  cv.drawText('Moving clocks run slower by factor gamma.', 440, 405, 1, 216, 180, 254);

  // Right Section: Length Contraction
  cv.fillRect(800, 150, 360, 290, 25, 12, 42);
  cv.strokeRect(800, 150, 360, 290, 2, 168, 85, 247, 140);
  cv.drawText('LORENTZ LENGTH CONTRACTION', 820, 168, 2, 192, 132, 252);

  // Meter rod at rest (L0)
  cv.fillRect(840, 230, 280, 24, 56, 189, 248);
  cv.drawText('Proper Length L0 (at rest)', 840, 260, 2, 56, 189, 248);

  // Meter rod moving at 0.866c (L = L0 / 2)
  cv.fillRect(840, 290, 140, 24, 192, 132, 252);
  cv.drawText('Contracted L = L0 / gamma', 840, 320, 2, 192, 132, 252);

  cv.drawText('L = L0 * sqrt(1 - beta^2)', 820, 370, 2, 255, 255, 255);
  cv.drawText('Contraction occurs ONLY along axis of motion.', 820, 405, 1, 216, 180, 254);

  // Bottom Section: Mass-Energy Equivalence E = mc^2
  cv.fillRect(40, 460, 1120, 290, 25, 12, 42);
  cv.strokeRect(40, 460, 1120, 290, 2, 168, 85, 247, 140);
  cv.drawText('EINSTEIN MASS-ENERGY EQUIVALENCE & RELATIVISTIC DYNAMICS', 60, 480, 2, 192, 132, 252);

  cv.drawText('E_total = gamma * m0 * c^2 = E0 + K', 60, 520, 3, 255, 255, 255);
  cv.drawText('Rest Energy:          E0 = m0 * c^2', 60, 560, 2, 216, 180, 254);
  cv.drawText('Relativistic Kinetic: K = (gamma - 1) * m0 * c^2', 60, 590, 2, 251, 191, 36);
  cv.drawText('Relativistic Momentum:p = gamma * m0 * v', 60, 620, 2, 192, 132, 252);
  cv.drawText('Energy-Momentum:      E^2 = (p*c)^2 + (m0*c^2)^2', 60, 650, 2, 52, 211, 153);
  cv.drawText('Universal Constant:   c = 299,792,458 m/s | 1 eV = 1.602 x 10^-19 J', 60, 690, 2, 226, 232, 240);
  cv.drawText('Muon Experiment:      tau0 = 2.20 us. At 0.995c (gamma = 10), tau = 22 us reaching ground!', 60, 720, 2, 192, 132, 252);

  return cv.toBuffer();
}

// Generate all 3 placards
fs.mkdirSync(outDir, { recursive: true });

console.log('Generating placard_electricity.png...');
fs.writeFileSync(path.join(outDir, 'placard_electricity.png'), makeElectricityPlacard());

console.log('Generating placard_optics.png...');
fs.writeFileSync(path.join(outDir, 'placard_optics.png'), makeOpticsPlacard());

console.log('Generating placard_relativity.png...');
fs.writeFileSync(path.join(outDir, 'placard_relativity.png'), makeRelativityPlacard());

console.log('All 3 Room 03 placards generated successfully!');
