'use client';

import {
  getResolvedCellValue,
  HydratedExperimentReport,
  ReportOverrides,
} from './labManualReport';

export type FormulaLineLatex = {
  label: string;
  steps: string[];
};

export type LiveComputationLine = {
  label: string;
  steps: string[];
};

export const EXPERIMENT_LATEX_FORMULAS: Record<number, FormulaLineLatex[]> = {
  1: [
    {
      label: '1. Cross-Sectional Area & Continuity:',
      steps: [
        String.raw`A_1 = \frac{\pi D_1^2}{4},\qquad A_2 = \frac{\pi D_2^2}{4}`,
        String.raw`Q = A_1 v_1 = A_2 v_2 \implies v_2 = v_1 \left(\frac{D_1}{D_2}\right)^2`,
      ],
    },
    {
      label: "2. Bernoulli's Equation (Horizontal Tube, z₁ = z₂):",
      steps: [
        String.raw`P_1 + \frac{1}{2}\rho v_1^2 = P_2 + \frac{1}{2}\rho v_2^2`,
        String.raw`\Delta P_{\text{theo}} = P_1 - P_2 = \frac{1}{2}\rho \left(v_2^2 - v_1^2\right)`,
      ],
    },
    {
      label: '3. Piezometric Head & Fluid Constants:',
      steps: [
        String.raw`\Delta h = \frac{\Delta P}{\rho g}`,
        String.raw`\rho_{\text{water}} = 1000\;\text{kg/m}^3,\qquad g = 9.81\;\text{m/s}^2`,
      ],
    },
    {
      label: '4. Worked Example (D₁ = 5.0 cm, D₂ = 2.2 cm, Q = 0.35 L/s):',
      steps: [
        String.raw`A_1 = 19.63\;\text{cm}^2,\qquad A_2 = 3.80\;\text{cm}^2`,
        String.raw`v_1 = 0.178\;\text{m/s},\qquad v_2 = 0.921\;\text{m/s}`,
        String.raw`\Delta P_{\text{theo}} = \frac{1}{2}(1000)\left(0.921^2 - 0.178^2\right) = 408.2\;\text{Pa}`,
      ],
    },
  ],
  2: [
    {
      label: '1. Adiabatic Calorimetric Energy Balance:',
      steps: [
        String.raw`Q_{\text{lost}}\;(\text{Warm Water + Copper Cup}) = Q_{\text{gained}}\;(\text{Melting Ice + Melted Water})`,
      ],
    },
    {
      label: '2. Heat Lost by Warm System:',
      steps: [
        String.raw`Q_{\text{warm}} = \left(m_w c_w + m_{\text{cu}} c_{\text{cu}}\right)(T_i - T_f)`,
      ],
    },
    {
      label: '3. Heat Gained by Ice & Experimental Lf:',
      steps: [
        String.raw`Q_{\text{warm}} = m_{\text{ice}} L_f + m_{\text{ice}} c_w (T_f - 0^\circ\text{C})`,
        String.raw`L_f = \frac{\left(m_w c_w + m_{\text{cu}} c_{\text{cu}}\right)(T_i - T_f) - m_{\text{ice}} c_w T_f}{m_{\text{ice}}}`,
      ],
    },
    {
      label: '4. Worked Example (m_cu = 100 g, m_w = 180 g, T_i = 45.0 °C, m_ice = 70 g, T_f = 12.1 °C):',
      steps: [
        String.raw`Q_{\text{warm}} = (180\times 1.00 + 100\times 0.093)(45.0 - 12.1) = 6228.0\;\text{cal}`,
        String.raw`L_f = \frac{6228.0 - 70(1.00)(12.1)}{70} = 76.9\;\text{cal/g}`,
      ],
    },
  ],
  3: [
    {
      label: '1. Linear & Circular Aperture Expansion:',
      steps: [
        String.raw`\Delta D = D_f - D_0 = \alpha D_0 \Delta T`,
        String.raw`D_f = D_0 \left(1 + \alpha (T_f - T_0)\right)`,
      ],
    },
    {
      label: '2. Experimental Coefficient of Linear Expansion:',
      steps: [
        String.raw`\alpha_{\text{exp}} = \frac{\Delta D}{D_0 \Delta T}`,
        String.raw`\alpha_{\text{std}}\;(\text{Aluminum}) = 23.0 \times 10^{-6}\;\text{/}^\circ\text{C}`,
      ],
    },
    {
      label: '3. Area (Superficial) Expansion of the Aperture:',
      steps: [
        String.raw`\Delta A = A_f - A_0 \approx 2\alpha A_0 \Delta T,\qquad A_0 = \frac{\pi D_0^2}{4}`,
      ],
    },
    {
      label: '4. Worked Example (D₀ = 50.000 mm at T₀ = 20.0 °C, ΔT = 100.0 °C):',
      steps: [
        String.raw`\Delta D = (23.0 \times 10^{-6}\;\text{/}^\circ\text{C})(50.000\;\text{mm})(100.0^\circ\text{C}) = 0.115\;\text{mm}`,
        String.raw`D_f = 50.000 + 0.115 = 50.115\;\text{mm}`,
      ],
    },
  ],
  4: [
    {
      label: '1. Stream Energy Balance (Steady Flow, c_p = 4,184 J/kg·°C):',
      steps: [
        String.raw`q_h = \dot{m}_h c_p \left(T_{h,\text{in}} - T_{h,\text{out}}\right)`,
        String.raw`q_c = \dot{m}_c c_p \left(T_{c,\text{out}} - T_{c,\text{in}}\right)`,
      ],
    },
    {
      label: '2. Terminal Temperature Differences (Parallel vs. Counter Flow):',
      steps: [
        String.raw`\text{Parallel Flow:}\quad \Delta T_1 = T_{h,\text{in}} - T_{c,\text{in}},\quad \Delta T_2 = T_{h,\text{out}} - T_{c,\text{out}}`,
        String.raw`\text{Counter Flow:}\quad \Delta T_1 = T_{h,\text{in}} - T_{c,\text{out}},\quad \Delta T_2 = T_{h,\text{out}} - T_{c,\text{in}}`,
      ],
    },
    {
      label: '3. Log Mean Temperature Difference (LMTD) & Overall UA:',
      steps: [
        String.raw`\Delta T_{\text{lm}} = \frac{\Delta T_1 - \Delta T_2}{\ln(\Delta T_1 / \Delta T_2)}`,
        String.raw`q = U A \Delta T_{\text{lm}} \implies UA = \frac{q}{\Delta T_{\text{lm}}}`,
      ],
    },
    {
      label: '4. Worked Example (Counter-Flow: T_h,in = 65.0 °C, T_h,out = 43.0 °C, T_c,in = 18.0 °C, T_c,out = 35.6 °C):',
      steps: [
        String.raw`\Delta T_1 = 65.0 - 35.6 = 29.4^\circ\text{C},\qquad \Delta T_2 = 43.0 - 18.0 = 25.0^\circ\text{C}`,
        String.raw`\Delta T_{\text{lm}} = \frac{29.4 - 25.0}{\ln(29.4 / 25.0)} = 27.14^\circ\text{C}`,
      ],
    },
  ],
  5: [
    {
      label: '1. Dynamic Wave Speed on a Stretched String:',
      steps: [
        String.raw`v = \sqrt{\frac{T}{\mu}}`,
        String.raw`T = \text{tension (N)},\qquad \mu = \text{linear mass density (kg/m)}`,
      ],
    },
    {
      label: '2. Kinematic Wave Parameters:',
      steps: [
        String.raw`\lambda = \frac{v}{f},\qquad T_{\text{period}} = \frac{1}{f}`,
        String.raw`\omega = 2\pi f\;\text{rad/s},\qquad k = \frac{2\pi}{\lambda}\;\text{rad/m}`,
      ],
    },
    {
      label: '3. Standing-Wave Harmonic Condition (Fixed Ends):',
      steps: [
        String.raw`L = n\left(\frac{\lambda_n}{2}\right) \implies \lambda_n = \frac{2L}{n}`,
        String.raw`f_n = \frac{n}{2L}\sqrt{\frac{T}{\mu}}\quad (n = 1, 2, 3, \dots)`,
      ],
    },
    {
      label: '4. Worked Example (Baseline: T = 36.0 N, μ = 0.040 kg/m, f = 2.00 Hz):',
      steps: [
        String.raw`v = \sqrt{\frac{36.0}{0.040}} = 30.00\;\text{m/s}`,
        String.raw`\lambda = \frac{30.00}{2.00} = 15.00\;\text{m}`,
        String.raw`\omega = 12.57\;\text{rad/s},\qquad k = 0.419\;\text{rad/m}`,
      ],
    },
  ],
  6: [
    {
      label: '1. Temperature Dependence of Sound Speed & Wavelength:',
      steps: [
        String.raw`v = 332 + 0.6 T\;\text{(m/s, }T\text{ in }^\circ\text{C)}`,
        String.raw`\lambda = \frac{v}{f}`,
      ],
    },
    {
      label: '2. Closed-End Air Column Harmonics (Odd Integers Only):',
      steps: [
        String.raw`f_1 = \frac{v}{4L},\qquad f_n = n f_1 = \frac{n v}{4L}\quad (n = 1, 3, 5, \dots)`,
      ],
    },
    {
      label: '3. Open-End Air Column Harmonics (All Integers):',
      steps: [
        String.raw`f_1 = \frac{v}{2L},\qquad f_n = n f_1 = \frac{n v}{2L}\quad (n = 1, 2, 3, \dots)`,
      ],
    },
    {
      label: '4. Acoustic Intensity & Decibel Level (Source Power P = 0.010 W):',
      steps: [
        String.raw`I = \frac{P}{4\pi d^2},\qquad \beta = 10\log_{10}\left(\frac{I}{10^{-12}}\right)\;\text{dB}`,
        String.raw`v = 344.0\;\text{m/s},\qquad f_{1,\text{closed}} = 110.26\;\text{Hz},\qquad \beta = 85.49\;\text{dB}`,
      ],
    },
  ],
  7: [
    {
      label: "1. Coulomb's Law (Electrostatic Force Magnitude):",
      steps: [
        String.raw`F = \frac{k|q_1 q_2|}{r^2}`,
        String.raw`k = 8.99 \times 10^9\;\text{N}\cdot\text{m}^2/\text{C}^2,\qquad 1\;\mu\text{C} = 10^{-6}\;\text{C}`,
      ],
    },
    {
      label: '2. Midpoint Electric Field (at distance r/2 from both charges):',
      steps: [
        String.raw`E_{\text{mid}} = \frac{k|q_1 - q_2|}{(r/2)^2} = \frac{4k|q_1 - q_2|}{r^2}\;\text{(N/C)}`,
      ],
    },
    {
      label: '3. Midpoint Electric Potential & System Potential Energy:',
      steps: [
        String.raw`V_{\text{mid}} = \frac{k(q_1 + q_2)}{r/2}\;\text{(V)}`,
        String.raw`U = \frac{k q_1 q_2}{r}\;\text{(J)}`,
      ],
    },
    {
      label: '4. Worked Example (q₁ = +4.0 μC, q₂ = −6.0 μC, r = 0.60 m):',
      steps: [
        String.raw`F = \frac{(8.99\times 10^9)(4\times 10^{-6})(6\times 10^{-6})}{0.60^2} = 0.599\;\text{N}`,
        String.raw`E_{\text{mid}} = 9.99\times 10^5\;\text{N/C},\qquad V_{\text{mid}} = -5.99\times 10^4\;\text{V},\qquad U = -0.360\;\text{J}`,
      ],
    },
  ],
  8: [
    {
      label: '1. DC Equivalent Resistance Topologies (R₁ = 100 Ω, R₂ = 220 Ω, R₃ = 330 Ω):',
      steps: [
        String.raw`R_{\text{single}} = R_3 = 330\;\Omega,\qquad R_{\text{series}} = R_1 + R_2 + R_3 = 650\;\Omega`,
        String.raw`\frac{1}{R_{\text{parallel}}} = \frac{1}{R_1} + \frac{1}{R_2} + \frac{1}{R_3} \implies R_{\text{parallel}} = 56.90\;\Omega`,
        String.raw`R_{\text{combo}} = R_1 + \frac{R_2 R_3}{R_2 + R_3} = 232.0\;\Omega`,
      ],
    },
    {
      label: "2. Ohm's Law & DC Power:",
      steps: [
        String.raw`I_i = \frac{V_i}{R_{\text{eq}}},\qquad R_{\text{exp},i} = \frac{V_i}{I_i}`,
        String.raw`P_i = V_i I_i = I_i^2 R_{\text{eq}} = \frac{V_i^2}{R_{\text{eq}}}`,
      ],
    },
    {
      label: '3. AC Series RLC Impedance, Phase & Power:',
      steps: [
        String.raw`X_L = 2\pi f L,\qquad X_C = \frac{1}{2\pi f C},\qquad Z = \sqrt{R_{\text{eq}}^2 + (X_L - X_C)^2}`,
        String.raw`\phi = \arctan\left(\frac{X_L - X_C}{R_{\text{eq}}}\right),\qquad \text{PF} = \cos\phi,\qquad f_{\text{res}} = \frac{1}{2\pi\sqrt{LC}}`,
      ],
    },
    {
      label: '4. Worked Example (Combo R_eq = 232.0 Ω at V_s = 12.0 V DC):',
      steps: [
        String.raw`R_{2\parallel 3} = \frac{220\times 330}{220 + 330} = 132.0\;\Omega`,
        String.raw`R_{\text{eq}} = 100 + 132.0 = 232.0\;\Omega`,
        String.raw`I = \frac{12.0}{232.0} = 51.72\;\text{mA},\qquad P = 0.621\;\text{W}`,
      ],
    },
  ],
  9: [
    {
      label: '1. Gaussian Thin Lens Equation & Lateral Magnification:',
      steps: [
        String.raw`\frac{1}{f} = \frac{1}{u} + \frac{1}{v} \implies v = \frac{u \cdot f}{u - f}`,
        String.raw`f_{\text{exp}} = \frac{u \cdot v}{u + v},\qquad M = \frac{h_i}{h_o} = -\frac{v}{u}`,
      ],
    },
    {
      label: "2. Snell's Law of Refraction & Critical Angle:",
      steps: [
        String.raw`n_1 \sin\theta_1 = n_2 \sin\theta_2`,
        String.raw`\theta_c = \arcsin\left(\frac{n_2}{n_1}\right)\quad (\text{for } n_1 > n_2)`,
      ],
    },
    {
      label: '3. Double-Slit Interference & Single-Slit Diffraction:',
      steps: [
        String.raw`\Delta y = \frac{\lambda L}{d},\qquad w_0 = \frac{2\lambda L}{a}`,
      ],
    },
    {
      label: '4. Worked Example (Converging Lens f = +20.0 cm at u = 30.0 cm):',
      steps: [
        String.raw`v = \frac{30.0 \times 20.0}{30.0 - 20.0} = 60.0\;\text{cm}`,
        String.raw`M = -\frac{60.0}{30.0} = -2.00\;(\text{Real, Inverted})`,
      ],
    },
  ],
  10: [
    {
      label: '1. Normalized Speed Ratio & Lorentz Factor (c = 2.9979 × 10⁸ m/s):',
      steps: [
        String.raw`\beta = \frac{v}{c},\qquad \gamma = \frac{1}{\sqrt{1 - \beta^2}} = \frac{1}{\sqrt{1 - v^2/c^2}}`,
      ],
    },
    {
      label: '2. Relativistic Time Dilation (Photon Clock D = 1.00 m):',
      steps: [
        String.raw`\tau_0 = \frac{2D}{c} = 6.671\;\text{ns}`,
        String.raw`\Delta t = \gamma \tau_0`,
      ],
    },
    {
      label: '3. Lorentz Length Contraction (Proper Rod L₀ = 10.00 m):',
      steps: [
        String.raw`L = \frac{L_0}{\gamma} = L_0 \sqrt{1 - \beta^2}`,
      ],
    },
    {
      label: '4. Relativistic Energy & Momentum:',
      steps: [
        String.raw`E_0 = m_0 c^2,\qquad E_{\text{tot}} = \gamma E_0`,
        String.raw`K = (\gamma - 1)E_0,\qquad p = \gamma m_0 v`,
      ],
    },
    {
      label: '5. Worked Example (β = 0.600 ⇒ v = 0.600c):',
      steps: [
        String.raw`\gamma = \frac{1}{\sqrt{1 - 0.600^2}} = 1.250`,
        String.raw`\Delta t = 1.250(6.671\;\text{ns}) = 8.339\;\text{ns}`,
        String.raw`L = \frac{10.00}{1.250} = 8.00\;\text{m}`,
      ],
    },
  ],
};

export const EXPERIMENT_LATEX_GUIDE_ANSWERS: Record<number, string[]> = {
  1: [
    String.raw`Decreasing the throat diameter $D_2$ reduces the cross-sectional area proportional to $D_2^2$ ($A_2 = \frac{\pi D_2^2}{4}$). By the continuity equation ($v_2 = \frac{Q}{A_2}$), throat velocity $v_2$ increases inversely with $D_2^2$ and dynamic pressure $\frac{1}{2}\rho v_2^2$ scales as $D_2^{-4}$, causing a sharp static pressure drop $\Delta P = P_1 - P_2$.`,
    String.raw`By Bernoulli's principle ($P_1 + \frac{1}{2}\rho v_1^2 = P_2 + \frac{1}{2}\rho v_2^2$), higher upstream pressure $P_1$ does work accelerating fluid into the constriction. Increasing kinetic energy density $\frac{1}{2}\rho v^2$ requires static pressure potential energy $P$ to decrease correspondingly.`,
    String.raw`Real fluids possess viscosity causing boundary-layer pipe friction and minor turbulence losses along the converging-diverging cones, slightly increasing $\Delta P_{\text{exp}}$ relative to ideal inviscid Bernoulli prediction $\Delta P_{\text{theo}}$.`,
  ],
  2: [
    String.raw`Liquid water clinging to wet ice adds to measured $m_{\text{ice}}$ without absorbing latent heat $L_f$, inflating the denominator in $L_f = \frac{Q_{\text{warm}} - m_{\text{ice}} c_w T_f}{m_{\text{ice}}}$ and underestimating $L_f$.`,
    String.raw`During fusion at $0^\circ\text{C}$, absorbed thermal energy breaks crystalline hydrogen bonds ($Q = m_{\text{ice}} L_f$) rather than raising molecular kinetic energy. Only after complete melting does temperature rise to $T_f$.`,
    String.raw`Starting above ambient temperature and finishing near or slightly below ambient cancels radiative/convective heat losses in the first half against heat gains in the second half.`,
  ],
  3: [
    String.raw`The circular hole expands outward at the exact same fractional rate as a solid plug: every bond around perimeter $\pi D_0$ lengthens by $(1 + \alpha\Delta T)$, increasing diameter by $\Delta D = \alpha D_0 \Delta T$.`,
    String.raw`Internal Vernier caliper jaws have outward-facing knife edges machined specifically for inside bore diameters, whereas an outside micrometer cannot span an internal hole.`,
    String.raw`Since $\Delta D = \alpha D_0 \Delta T$ is proportional to $\alpha$, structural steel ($\alpha = 12 \times 10^{-6}\;\text{/}^\circ\text{C}$) expands by $\frac{12}{23} \approx 52.2\%$ as much as aluminum ($\alpha = 23 \times 10^{-6}\;\text{/}^\circ\text{C}$).`,
  ],
  4: [
    String.raw`In parallel flow, $\Delta T_1$ is large at the inlet while $\Delta T_2$ decays rapidly at the outlet, lowering $\Delta T_{\text{lm}} = \frac{\Delta T_1 - \Delta T_2}{\ln(\Delta T_1/\Delta T_2)}$. Counter flow keeps $\Delta T(x)$ uniform along the pipe, maximizing $\Delta T_{\text{lm}}$ and heat duty $q = UA\Delta T_{\text{lm}}$.`,
    String.raw`In parallel flow, both streams exit at the same end so $T_{c,\text{out}} < T_{h,\text{out}}$ by the Second Law. In counter flow, cold water exits beside the hot inlet ($T_{h,\text{in}}$), so $T_{c,\text{out}}$ can exceed $T_{h,\text{out}}$ (temperature crossover).`,
    String.raw`Routing the hotter stream inside the copper tube surrounds it completely with the cooler annulus fluid, minimizing parasitic heat loss to surrounding laboratory air.`,
  ],
  5: [
    String.raw`From $v = \sqrt{\frac{T}{\mu}}$, quadrupling tension $T$ scales wave speed by $\sqrt{4} = 2$. At fixed frequency $f$, wavelength $\lambda = \frac{v}{f}$ also doubles.`,
    String.raw`Quadrupling linear density $\mu$ halves wave speed $v = \sqrt{\frac{T}{\mu}}$ and wavelength $\lambda = \frac{v}{f}$, halving the inter-nodal distance $\Delta x_{\text{node}} = \frac{\lambda}{2}$.`,
    String.raw`Phase speed $v = \sqrt{\frac{T}{\mu}}$ governs horizontal crest propagation along $x$, whereas transverse particle velocity $v_y = \frac{\partial y}{\partial t} = -\omega A \cos(kx - \omega t)$ oscillates perpendicular to $x$.`,
  ],
  6: [
    String.raw`An open tube supports displacement antinodes at both ends ($\lambda_1 = 2L \implies f_{1,\text{open}} = \frac{v}{2L}$), whereas a closed tube fits one quarter-wave ($\lambda_1 = 4L \implies f_{1,\text{closed}} = \frac{v}{4L} = \frac{1}{2}f_{1,\text{open}}$).`,
    String.raw`Enforcing a displacement node at the closed piston and antinode at the open mouth restricts resonant lengths to $L = (2k - 1)\frac{\lambda}{4}$, eliminating all even harmonics ($n = 2, 4, 6, \dots$).`,
    String.raw`By inverse-square decay $I = \frac{P}{4\pi d^2}$, doubling distance $d$ reduces intensity $I$ to $\frac{1}{4}$, producing $\Delta\beta = 10\log_{10}\left(\frac{1}{4}\right) = -6.02\;\text{dB}$.`,
  ],
  7: [
    String.raw`Coulomb force obeys $F = \frac{k|q_1 q_2|}{r^2}$: halving $r$ from $0.60\;\text{m}$ to $0.30\;\text{m}$ quadruples $F$ ($0.599\;\text{N} \to 2.397\;\text{N}$), while doubling $r$ quarters $F$ ($0.150\;\text{N}$). Potential energy $U = \frac{k q_1 q_2}{r}$ scales inversely with $r^1$.`,
    String.raw`Potential $V_{\text{mid}} = \frac{k(q_1 + q_2)}{r/2}$ is a scalar sum and cancels to $0\;\text{V}$ when $q_1 = -q_2$. Electric field $E$ is a vector pointing away from $+q_1$ and toward $-q_2$ in the same direction, so vectors add constructively ($E_{\text{mid}} \neq 0$).`,
    String.raw`Along any equipotential contour $\Delta V = 0$, work vanishes: $W = -q_0 \vec{E}\cdot\Delta\vec{s} = 0$, requiring electric field vector $\vec{E}$ to be strictly perpendicular ($90^\circ$) to equipotential lines.`,
  ],
  8: [
    String.raw`A voltmeter has very high internal resistance ($\ge 10\;\text{M}\Omega$) so parallel connection draws negligible current, whereas an ammeter has very low resistance ($< 1\;\Omega$) so series connection causes negligible voltage drop.`,
    String.raw`Parallel resistors add conductances ($G_{\text{eq}} = G_1 + G_2 + G_3 > G_1$), forcing equivalent resistance $R_{\text{eq}} = \frac{1}{G_{\text{eq}}}$ below the smallest branch resistance ($56.90\;\Omega < 100\;\Omega$).`,
    String.raw`At resonance $f = f_{\text{res}} = \frac{1}{2\pi\sqrt{LC}}$, $X_L = X_C \implies X = 0$, minimizing impedance to $Z = R_{\text{eq}}$, zeroing phase angle ($\phi = 0^\circ$), and setting unity power factor ($\text{PF} = \cos 0^\circ = 1.000$).`,
  ],
  9: [
    String.raw`As object distance increases ($u = 30.0\;\text{cm} \to 60.0\;\text{cm}$), the focused real image moves closer to $F'$ ($v = 60.0\;\text{cm} \to 30.0\;\text{cm}$) and lateral magnification $|M| = \frac{v}{u}$ shrinks from $2.00\times$ through $1.00\times$ (at $u = 2f = 40\;\text{cm}$) down to $0.50\times$.`,
    String.raw`Inside the focal length ($u < 20.0\;\text{cm}$), $v = \frac{uf}{u-f} < 0$ (e.g., $-30.0\;\text{cm}$ at $u = 12\;\text{cm}$), yielding an upright magnified virtual image from diverging rays that cannot project onto a screen.`,
    String.raw`Because fringe spacing obeys $\Delta y = \frac{\lambda L}{d}$, decreasing slit separation $d$ spreads interference maxima farther apart on the screen.`,
  ],
  10: [
    String.raw`At everyday speeds ($\beta \approx 10^{-5}$), $\beta^2 \approx 10^{-10}$, so $\gamma = \frac{1}{\sqrt{1 - \beta^2}} \approx 1$. Relativistic effects depart significantly from unity only above $\beta > 0.10$.`,
    String.raw`Lorentz length contraction ($L = \frac{L_0}{\gamma}$) acts exclusively parallel to velocity $\vec{v}$; transverse dimensions remain invariant ($H = H_0 = 1.00\;\text{m}$).`,
    String.raw`As $\beta \to 1$, $\gamma = \frac{1}{\sqrt{1 - \beta^2}} \to \infty$, driving kinetic energy $K = (\gamma - 1)m_0 c^2 \to \infty$; infinite work would be required to reach $v = c$.`,
  ],
};

export const EXPERIMENT_LATEX_EXERCISE_ANSWERS: Record<number, string[]> = {
  1: [
    String.raw`Answer: (a) $\Delta P = 2.7\;\text{kPa} = 2{,}700\;\text{Pa}$, $\Delta h = \frac{2700}{1000 \times 9.81} = 0.275\;\text{m}$; (b) $\Delta P = 5.8\;\text{kPa} = 5{,}800\;\text{Pa}$, $\Delta h = 0.591\;\text{m}$; (c) $\Delta P = 15.5\;\text{kPa} = 15{,}500\;\text{Pa}$, $\Delta h = 1.580\;\text{m}$`,
    String.raw`Answer: (a) $Q = A_1 v_1 = \frac{\pi(0.060)^2}{4}(0.50) = 1.414 \times 10^{-3}\;\text{m}^3/\text{s} = 1.414\;\text{L/s}$; (b) $v_2 = v_1\left(\frac{D_1}{D_2}\right)^2 = 0.50\left(\frac{6.0}{2.0}\right)^2 = 4.50\;\text{m/s}$; (c) $\Delta P = \frac{1}{2}(1000)(4.50^2 - 0.50^2) = 10{,}000\;\text{Pa} = 10.00\;\text{kPa}$`,
  ],
  2: [
    String.raw`Answer: (a) $T_i = 45.0^\circ\text{C},\; T_f = 16.5^\circ\text{C} \implies Q_{\text{warm}} = (200\times 1.00 + 120\times 0.093)(45.0 - 16.5) = 6{,}018.0\;\text{cal}$; (b) $L_f = \frac{6018.0 - 60(1.00)(16.5)}{60} = 83.8\;\text{cal/g}$`,
    String.raw`Answer: $Q_{\text{req}} = 100(0.50)(10) + 100(80.0) = 8{,}500\;\text{cal}$; $Q_{\text{avail}} = 300(1.00)(35.0) = 10{,}500\;\text{cal} \implies T_f = \frac{10500 - 8500}{300 + 100} = 5.0^\circ\text{C}$`,
  ],
  3: [
    String.raw`Answer: (a) $D_0 = 50.00\;\text{mm}$; (b) $D_f = 50 + 9(0.02) = 50.18\;\text{mm} \implies \Delta D = 0.18\;\text{mm},\; \alpha_{\text{exp}} = \frac{0.18}{50.00 \times 150.0} = 24.0 \times 10^{-6}\;\text{/}^\circ\text{C}$`,
    String.raw`Answer: (a) $T_f = 20.0 + \frac{40.000 - 39.920}{39.920 \times 23.0\times 10^{-6}} = 107.1^\circ\text{C}$; (b) $T_f = 20.0 + \frac{0.080}{39.920(23.0\times 10^{-6}) - 40.000(12.0\times 10^{-6})} = 202.6^\circ\text{C}$`,
  ],
  4: [
    String.raw`Answer: Parallel: $\Delta T_1 = 50.0^\circ\text{C},\; \Delta T_2 = 8.0^\circ\text{C} \implies \Delta T_{\text{lm}} = \frac{50 - 8}{\ln(50/8)} = 22.92^\circ\text{C}$; Counter: $\Delta T_1 = 29.0^\circ\text{C},\; \Delta T_2 = 22.0^\circ\text{C} \implies \Delta T_{\text{lm}} = \frac{29 - 22}{\ln(29/22)} = 25.34^\circ\text{C}$`,
    String.raw`Answer: (a) $q = (0.050)(4184)(70.0 - 42.0) = 5{,}857.6\;\text{W}$; (b) $U = \frac{q}{A \Delta T_{\text{lm}}} = \frac{5857.6}{0.120 \times 25.34} = 1{,}926.3\;\text{W/m}^2\cdot^\circ\text{C}$`,
  ],
  5: [
    String.raw`Answer: $v = \sqrt{\frac{54.0}{0.015}} = 60.0\;\text{m/s}$; (a) $\lambda_1 = 2.40\;\text{m},\; f_1 = 25.0\;\text{Hz}$; (b) $\lambda_2 = 1.20\;\text{m},\; f_2 = 50.0\;\text{Hz}$; (c) $\lambda_3 = 0.80\;\text{m},\; f_3 = 75.0\;\text{Hz}$; (d) $\lambda_4 = 0.60\;\text{m},\; f_4 = 100.0\;\text{Hz}$`,
    String.raw`Answer: $\mu = \frac{0.0040}{0.80} = 0.0050\;\text{kg/m}$; $v = 2 L f_1 = 2(0.80)(250) = 400\;\text{m/s} \implies T = \mu v^2 = (0.0050)(400)^2 = 800\;\text{N}$`,
  ],
  6: [
    String.raw`Answer: (a) $v = 332 + 0.6(35.0) = 353.0\;\text{m/s} \implies f_1 = \frac{353.0}{4(0.8825)} = 100.0\;\text{Hz},\; f_3 = 300.0\;\text{Hz},\; f_5 = 500.0\;\text{Hz}$; (b) At $1.50\;\text{m}$: $I = 3.54\times 10^{-4}\;\text{W/m}^2,\; \beta = 85.49\;\text{dB}$; At $3.00\;\text{m}$: $I = 8.84\times 10^{-5}\;\text{W/m}^2,\; \beta = 79.47\;\text{dB}$`,
    String.raw`Answer: $v = 347.0\;\text{m/s},\; \lambda = \frac{347.0}{512} = 0.6777\;\text{m} \implies L_1 = \frac{\lambda}{4} = 0.1694\;\text{m},\; L_2 = \frac{3\lambda}{4} = 0.5083\;\text{m},\; \Delta L = \frac{\lambda}{2} = 0.3389\;\text{m}$`,
  ],
  7: [
    String.raw`Answer: (a) $F_{BA} = \frac{k(6\times 10^{-6})(4\times 10^{-6})}{0.40^2} = 1.349\;\text{N}\;(-\hat{x}),\; F_{BC} = 1.151\;\text{N}\;(+\hat{x}) \implies F_{\text{net}} = 0.198\;\text{N}\;(-\hat{x})$; (b) $V = k\left(\frac{6\times 10^{-6}}{0.40} + \frac{8\times 10^{-6}}{0.50}\right) = +2.787 \times 10^5\;\text{V}$`,
    String.raw`Answer: (a) $F_i = \frac{k(12\times 10^{-6})(4\times 10^{-6})}{0.50^2} = 1.726\;\text{N}$ (Attractive); (b) $q'_1 = q'_2 = +4.0\;\mu\text{C} \implies F_f = \frac{k(4\times 10^{-6})^2}{0.50^2} = 0.575\;\text{N}$ (Repulsive)`,
  ],
  8: [
    String.raw`Answer: (a) $R_{\text{eq}} = 100 + \frac{220\times 330}{220 + 330} = 232.0\;\Omega$; (b) $I_{\text{tot}} = \frac{24.0}{232.0} = 103.45\;\text{mA}$; (c) $V_1 = 10.345\;\text{V},\; V_{23} = 13.655\;\text{V}$; (d) $I_2 = 62.07\;\text{mA},\; I_3 = 41.38\;\text{mA}$`,
    String.raw`Answer: (a) $X_L = 94.25\;\Omega,\; X_C = 66.31\;\Omega,\; Z = \sqrt{100^2 + 27.93^2} = 103.83\;\Omega$; (b) $I = \frac{120}{103.83} = 1.156\;\text{A},\; \phi = +15.61^\circ\;(\text{PF} = 0.963)$; (c) $f_{\text{res}} = \frac{1}{2\pi\sqrt{0.250 \times 40\times 10^{-6}}} = 50.33\;\text{Hz}$`,
  ],
  9: [
    String.raw`Answer: (a) $\theta_2 = \arcsin\left(\frac{\sin 45.0^\circ}{1.52}\right) = 27.72^\circ,\; \theta_c = \arcsin\left(\frac{1.00}{1.52}\right) = 41.14^\circ$; (b) $\Delta y = \frac{532\times 10^{-9}\times 2.00}{0.40\times 10^{-3}} = 2.66\;\text{mm},\; w_0 = \frac{2(532\times 10^{-9})(2.00)}{0.10\times 10^{-3}} = 21.28\;\text{mm}$`,
    String.raw`Answer: (a) $v = \frac{25.0\times 20.0}{25.0 - 20.0} = +100.0\;\text{cm}$; (b) $M = -\frac{100.0}{25.0} = -4.00$; (c) $h_i = M h_o = -16.0\;\text{cm}$ (Real, Inverted)`,
  ],
  10: [
    String.raw`Answer: (a) $\gamma = \frac{1}{\sqrt{1 - 0.990^2}} = 7.089$; (b) $\Delta t = \gamma\tau_0 = 7.089(2.20\;\mu\text{s}) = 15.60\;\mu\text{s}$; (c) $K = (7.089 - 1)(105.7\;\text{MeV}) = 643.6\;\text{MeV}$`,
    String.raw`Answer: (a) $\gamma = \frac{1}{\sqrt{1 - 0.800^2}} = 1.667 \implies L = \frac{120.0}{1.667} = 72.0\;\text{m}$; (b) $\Delta t_{\text{station}} = \frac{2.40\times 10^8}{0.800c} = 1.000\;\text{s},\; \Delta\tau_{\text{ship}} = \frac{1.000}{1.667} = 0.600\;\text{s}$`,
  ],
};

/**
 * Formats prose strings (Introduction, Procedure, Objectives, Questions) with inline $...$ LaTeX equations.
 */
export function formatProseWithLatex(raw: string): string {
  return raw
    .replace(/Q = A1v1 = A2v2/g, '$Q = A_1 v_1 = A_2 v_2$')
    .replace(/v2 = v1\(D1\/D2\)2/g, '$v_2 = v_1(D_1/D_2)^2$')
    .replace(/ΔPtheo = ½ρ\(v22 − v12\)/g, String.raw`$\Delta P_{\text{theo}} = \frac{1}{2}\rho(v_2^2 - v_1^2)$`)
    .replace(/% Error = \(\|ΔPexp − ΔPtheo\| \/ ΔPtheo\) × 100%/g, String.raw`$\%\;\text{Error} = \frac{|\Delta P_{\text{exp}} - \Delta P_{\text{theo}}|}{\Delta P_{\text{theo}}}\times 100\%$`)
    .replace(/% Error = \(\|Lf,exp − 79\.5\| \/ 79\.5\) × 100%/g, String.raw`$\%\;\text{Error} = \frac{|L_{f,\text{exp}} - 79.5|}{79.5}\times 100\%$`)
    .replace(/% Error = \(\|αexp − 23\.0 × 10-6\| \/ 23\.0 × 10-6\) × 100%/g, String.raw`$\%\;\text{Error} = \frac{|\alpha_{\text{exp}} - 23.0\times 10^{-6}|}{23.0\times 10^{-6}}\times 100\%$`)
    .replace(/ΔD = Df − D0 = α D0 ΔT/g, String.raw`$\Delta D = D_f - D_0 = \alpha D_0 \Delta T$`)
    .replace(/αexp = ΔD \/ \(D0 ΔT\)/g, String.raw`$\alpha_{\text{exp}} = \frac{\Delta D}{D_0 \Delta T}$`)
    .replace(/ΔTlm = \(ΔT1 − ΔT2\) \/ ln\(ΔT1 \/ ΔT2\)/g, String.raw`$\Delta T_{\text{lm}} = \frac{\Delta T_1 - \Delta T_2}{\ln(\Delta T_1 / \Delta T_2)}$`)
    .replace(/v = √\(T\/μ\)/g, String.raw`$v = \sqrt{\frac{T}{\mu}}$`)
    .replace(/v = √\(T \/ μ\)/g, String.raw`$v = \sqrt{\frac{T}{\mu}}$`)
    .replace(/v = fλ = √\(T\/μ\)/g, String.raw`$v = f\lambda = \sqrt{\frac{T}{\mu}}$`)
    .replace(/v = 332 \+ 0\.6 T/g, String.raw`$v = 332 + 0.6T$`)
    .replace(/I = P \/ \(4πd2\)/g, String.raw`$I = \frac{P}{4\pi d^2}$`)
    .replace(/β = 10 log10\(I \/ I0\)/g, String.raw`$\beta = 10\log_{10}\!\left(\frac{I}{I_0}\right)$`)
    .replace(/F = k\|q1q2\|\/r2/g, String.raw`$F = \frac{k|q_1 q_2|}{r^2}$`)
    .replace(/U = kq1q2 \/ r/g, String.raw`$U = \frac{k q_1 q_2}{r}$`)
    .replace(/U = kq1q2\/r/g, String.raw`$U = \frac{k q_1 q_2}{r}$`)
    .replace(/I = V \/ R/g, String.raw`$I = \frac{V}{R}$`)
    .replace(/fres = 1\/\(2π√\(LC\)\)/g, String.raw`$f_{\text{res}} = \frac{1}{2\pi\sqrt{LC}}$`)
    .replace(/Z = √\(Req2 \+ \(XL − XC\)2\)/g, String.raw`$Z = \sqrt{R_{\text{eq}}^2 + (X_L - X_C)^2}$`)
    .replace(/1\/f = 1\/u \+ 1\/v/g, String.raw`$\frac{1}{f} = \frac{1}{u} + \frac{1}{v}$`)
    .replace(/f = u·v \/ \(u \+ v\)/g, String.raw`$f = \frac{uv}{u+v}$`)
    .replace(/fi = ui vi \/ \(ui \+ vi\)/g, String.raw`$f_i = \frac{u_i v_i}{u_i + v_i}$`)
    .replace(/M = hi \/ ho = −v \/ u/g, String.raw`$M = \frac{h_i}{h_o} = -\frac{v}{u}$`)
    .replace(/M = −v\/u/g, String.raw`$M = -\frac{v}{u}$`)
    .replace(/θc = arcsin\(n2\/n1\)/g, String.raw`$\theta_c = \arcsin\!\left(\frac{n_2}{n_1}\right)$`)
    .replace(/n1 sin θ1 = n2 sin θ2/g, String.raw`$n_1\sin\theta_1 = n_2\sin\theta_2$`)
    .replace(/Δy = λL\/d/g, String.raw`$\Delta y = \frac{\lambda L}{d}$`)
    .replace(/γ = 1\/√\(1 − β2\)/g, String.raw`$\gamma = \frac{1}{\sqrt{1 - \beta^2}}$`)
    .replace(/Δt = γτ0/g, String.raw`$\Delta t = \gamma\tau_0$`)
    .replace(/L = L0\/γ/g, String.raw`$L = \frac{L_0}{\gamma}$`)
    .replace(/K = \(γ − 1\)m0c2/g, String.raw`$K = (\gamma - 1)m_0 c^2$`);
}

function parseFirstNum(s: string): number | null {
  const cleaned = s.replace(/,/g, '');
  const m = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Generates vertically stacked step-by-step LaTeX computations from logged trial data or edited cells.
 */
export function buildLiveExperimentComputations(
  exp: HydratedExperimentReport,
  overrides: ReportOverrides
): LiveComputationLine[] {
  const num = exp.catalog.number;
  const t1 = (r: number, c: number) => getResolvedCellValue(exp.table1Rows, overrides.table1Cells, num, r, c);
  const t2 = (r: number, c: number) => getResolvedCellValue(exp.table2Rows, overrides.table2Cells, num, r, c);

  const anyLive =
    exp.status !== 'pending' ||
    Object.keys(overrides.table1Cells).some((k) => k.startsWith(`${num}_`)) ||
    Object.keys(overrides.table2Cells).some((k) => k.startsWith(`${num}_`));
  if (!anyLive) return [];

  const lines: LiveComputationLine[] = [];

  if (num === 1) {
    exp.table1Rows.forEach((_, i) => {
      const a2 = parseFirstNum(t1(i, 3));
      const v2 = parseFirstNum(t2(i, 1));
      const dpExp = parseFirstNum(t2(i, 2));
      const dpTheo = parseFirstNum(t2(i, 3));
      const err = parseFirstNum(t2(i, 4));
      const v1 = parseFirstNum(t1(i, 4));
      if (v2 !== null && dpTheo !== null && dpExp !== null) {
        lines.push({
          label: `Trial ${i + 1}:`,
          steps: [
            String.raw`A_2 = ${(a2 ?? 0).toFixed(2)}\;\text{cm}^2,\quad v_2 = ${v2.toFixed(3)}\;\text{m/s}`,
            String.raw`\Delta P_{\text{theo}} = \frac{1}{2}(1000)\left(${v2.toFixed(3)}^2 - ${(v1 ?? 0).toFixed(3)}^2\right) = ${dpTheo.toFixed(1)}\;\text{Pa}`,
            String.raw`\%\;\text{Error} = \frac{|${dpExp.toFixed(1)} - ${dpTheo.toFixed(1)}|}{${dpTheo.toFixed(1)}}\times 100\% = ${(err ?? 0).toFixed(2)}\%`,
          ],
        });
      }
    });
  } else if (num === 2) {
    const lfs: number[] = [];
    exp.table1Rows.forEach((_, i) => {
      const mW = parseFirstNum(t1(i, 1));
      const mIce = parseFirstNum(t1(i, 2));
      const ti = parseFirstNum(t1(i, 3));
      const tf = parseFirstNum(t1(i, 4));
      const qw = parseFirstNum(t2(i, 1));
      const lf = parseFirstNum(t2(i, 3));
      if (mIce !== null && qw !== null && lf !== null && tf !== null) {
        lfs.push(lf);
        lines.push({
          label: `Trial ${i + 1}:`,
          steps: [
            String.raw`Q_{\text{warm}} = ${qw.toFixed(1)}\;\text{cal}\;\left(m_w=${(mW ?? 180).toFixed(0)}\;\text{g},\; T_i=${(ti ?? 45).toFixed(1)}^\circ\text{C} \to T_f=${tf.toFixed(2)}^\circ\text{C}\right)`,
            String.raw`L_f = \frac{${qw.toFixed(1)} - ${mIce.toFixed(0)}(1.00)(${tf.toFixed(2)})}{${mIce.toFixed(0)}} = ${lf.toFixed(2)}\;\text{cal/g}`,
          ],
        });
      }
    });
    if (lfs.length > 0) {
      const meanLf = lfs.reduce((a, b) => a + b, 0) / lfs.length;
      lines.push({
        label: 'Mean & % Error:',
        steps: [
          String.raw`\bar{L}_f = \frac{${lfs.map((v) => v.toFixed(2)).join(' + ')}}{${lfs.length}} = ${meanLf.toFixed(2)}\;\text{cal/g}`,
          String.raw`\%\;\text{Error} = \frac{|${meanLf.toFixed(2)} - 79.5|}{79.5}\times 100\% = ${((Math.abs(meanLf - 79.5) / 79.5) * 100).toFixed(2)}\%`,
        ],
      });
    }
  } else if (num === 3) {
    exp.table1Rows.forEach((_, i) => {
      const dt = parseFirstNum(t1(i, 1));
      const dD = parseFirstNum(t1(i, 4));
      const alpha = parseFirstNum(t2(i, 2));
      if (dt !== null && dD !== null && alpha !== null) {
        lines.push({
          label: `Trial ${i + 1}:`,
          steps: [
            String.raw`\Delta D = ${dD.toFixed(4)}\;\text{mm},\quad \Delta T = ${dt.toFixed(1)}^\circ\text{C}`,
            String.raw`\alpha_{\text{exp}} = \frac{${dD.toFixed(4)}}{D_0 \cdot ${dt.toFixed(1)}} = ${alpha.toFixed(2)}\times 10^{-6}\;\text{/}^\circ\text{C}`,
          ],
        });
      }
    });
  } else if (num === 4) {
    exp.table1Rows.forEach((_, i) => {
      const dt1 = parseFirstNum(t2(i, 1));
      const dt2 = parseFirstNum(t2(i, 2));
      const lmtd = parseFirstNum(t2(i, 3));
      const q = parseFirstNum(t2(i, 4));
      if (dt1 !== null && dt2 !== null && lmtd !== null && q !== null) {
        lines.push({
          label: `Trial ${i + 1}:`,
          steps: [
            String.raw`\Delta T_{\text{lm}} = \frac{${dt1.toFixed(2)} - ${dt2.toFixed(2)}}{\ln(${dt1.toFixed(2)}/${dt2.toFixed(2)})} = ${lmtd.toFixed(2)}^\circ\text{C}`,
            String.raw`q = ${q.toFixed(1)}\;\text{W}`,
          ],
        });
      }
    });
  } else if (num === 5) {
    exp.table1Rows.forEach((_, i) => {
      const T = parseFirstNum(t1(i, 1));
      const mu = parseFirstNum(t1(i, 2));
      const f = parseFirstNum(t1(i, 3));
      const lam = parseFirstNum(t1(i, 4));
      const vt = parseFirstNum(t2(i, 1));
      const ve = parseFirstNum(t2(i, 2));
      if (T !== null && mu !== null && f !== null && lam !== null && vt !== null && ve !== null) {
        lines.push({
          label: `Trial ${i + 1}:`,
          steps: [
            String.raw`v_{\text{theo}} = \sqrt{\frac{${T.toFixed(1)}}{${mu.toFixed(3)}}} = ${vt.toFixed(2)}\;\text{m/s}`,
            String.raw`v_{\text{exp}} = (${f.toFixed(2)})(${lam.toFixed(3)}) = ${ve.toFixed(2)}\;\text{m/s}`,
          ],
        });
      }
    });
  } else if (num === 6) {
    exp.table1Rows.forEach((_, i) => {
      const tempC = parseFirstNum(t1(i, 1));
      const v = parseFirstNum(t1(i, 4));
      const lam = parseFirstNum(t2(i, 1));
      const f1 = parseFirstNum(t2(i, 2));
      if (tempC !== null && v !== null && lam !== null && f1 !== null) {
        lines.push({
          label: `Trial ${i + 1}:`,
          steps: [
            String.raw`v = 332 + 0.6(${tempC.toFixed(1)}) \approx ${v.toFixed(1)}\;\text{m/s}`,
            String.raw`\lambda = ${lam.toFixed(3)}\;\text{m},\quad f_1 = ${f1.toFixed(2)}\;\text{Hz}`,
          ],
        });
      }
    });
  } else if (num === 7) {
    exp.table1Rows.forEach((_, i) => {
      const r = parseFirstNum(t1(i, 3));
      const F = parseFirstNum(t2(i, 1));
      const U = parseFirstNum(t2(i, 4));
      if (r !== null && F !== null && U !== null) {
        lines.push({
          label: `Trial ${i + 1}:`,
          steps: [
            String.raw`F = \frac{k|q_1 q_2|}{${r.toFixed(2)}^2} = ${F.toFixed(4)}\;\text{N}`,
            String.raw`U = ${U.toFixed(3)}\;\text{J}`,
          ],
        });
      }
    });
  } else if (num === 8) {
    const rList: number[] = [];
    for (let i = 0; i < 5; i++) {
      const V = parseFirstNum(t1(i, 1));
      const I = parseFirstNum(t1(i, 2));
      const R = parseFirstNum(t1(i, 3));
      const P = parseFirstNum(t1(i, 4));
      if (V !== null && I !== null && R !== null && P !== null) {
        rList.push(R);
        lines.push({
          label: `Trial ${i + 1}:`,
          steps: [
            String.raw`R_${i + 1} = \frac{V_${i + 1}}{I_${i + 1}} = \frac{${V.toFixed(2)}\;\text{V}}{${(I / 1000).toFixed(5)}\;\text{A}} = ${R.toFixed(2)}\;\Omega`,
            String.raw`P_${i + 1} = V_${i + 1} I_${i + 1} = (${V.toFixed(2)}\;\text{V})(${(I / 1000).toFixed(5)}\;\text{A}) = ${P.toFixed(4)}\;\text{W}`,
          ],
        });
      }
    }
    if (rList.length > 0) {
      const meanR = rList.reduce((a, b) => a + b, 0) / rList.length;
      lines.push({
        label: 'Mean Resistance:',
        steps: [
          String.raw`R_{\text{mean}} = \frac{${rList.map((r) => r.toFixed(1)).join(' + ')}}{${rList.length}} = ${meanR.toFixed(2)}\;\Omega`,
        ],
      });
    }
  } else if (num === 9) {
    const fList: number[] = [];
    for (let i = 0; i < 5; i++) {
      const u = parseFirstNum(t1(i, 1));
      const v = parseFirstNum(t1(i, 2));
      const fExp = parseFirstNum(t1(i, 3));
      const mag = parseFirstNum(t1(i, 4));
      if (u !== null && v !== null && fExp !== null && mag !== null) {
        fList.push(fExp);
        lines.push({
          label: `Trial ${i + 1}:`,
          steps: [
            String.raw`f_${i + 1} = \frac{u_${i + 1} v_${i + 1}}{u_${i + 1} + v_${i + 1}} = \frac{${u.toFixed(1)} \cdot ${v.toFixed(2)}}{${u.toFixed(1)} + ${v.toFixed(2)}} = ${fExp.toFixed(2)}\;\text{cm}`,
            String.raw`M_${i + 1} = -\frac{v_${i + 1}}{u_${i + 1}} = -\frac{${v.toFixed(2)}}{${u.toFixed(1)}} = ${mag.toFixed(2)}\times`,
          ],
        });
      }
    }
    if (fList.length > 0) {
      const fMean = fList.reduce((a, b) => a + b, 0) / fList.length;
      const err = (Math.abs(fMean - 20.0) / 20.0) * 100;
      lines.push({
        label: 'Mean & % Error:',
        steps: [
          String.raw`f_{\text{mean}} = \frac{\sum f_i}{${fList.length}} = ${fMean.toFixed(2)}\;\text{cm}`,
          String.raw`\%\;\text{Error} = \frac{|${fMean.toFixed(2)} - 20.0|}{20.0}\times 100\% = ${err.toFixed(2)}\%`,
        ],
      });
    }
  } else if (num === 10) {
    for (let i = 0; i < 5; i++) {
      const b = parseFirstNum(t1(i, 1));
      const g = parseFirstNum(t1(i, 2));
      const dt = parseFirstNum(t1(i, 3));
      const len = parseFirstNum(t1(i, 4));
      if (b !== null && g !== null && dt !== null && len !== null) {
        lines.push({
          label: `Condition ${i + 1}:`,
          steps: [
            String.raw`\gamma_${i + 1} = \frac{1}{\sqrt{1 - ${b.toFixed(2)}^2}} = ${g.toFixed(4)}`,
            String.raw`\Delta t = ${dt.toFixed(3)}\;\text{ns},\quad L = ${len.toFixed(3)}\;\text{m}`,
            String.raw`K = (\gamma_${i + 1} - 1)E_0 = ${((g - 1) * 0.511).toFixed(4)}\;\text{MeV}`,
          ],
        });
      }
    }
  }

  return lines;
}
