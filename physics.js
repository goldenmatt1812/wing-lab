/**
 * PHYSICS ENGINE — Hanging Flapping Bird (Gravity-Driven 2-DOF Oscillator)
 *
 * Core equations:
 *   DOF 1 (wings):   I·θ̈ + c·θ̇ + k·θ = τ_g(φ) + τ_wing(θ)
 *   DOF 2 (weight):  m·s²·φ̈ = -m·g·s·sin(φ) + coupling(θ,φ)
 *
 * Where:
 *   θ   = wing flap angle (radians from neutral/horizontal)
 *   φ   = weight pendulum angle (radians from vertical)
 *   I   = rotational moment of inertia of wings about hinge (kg·m²)
 *   c   = damping coefficient (hinge friction + air drag) (N·m·s/rad)
 *   k   = torsional spring stiffness (N·m/rad) — from elastic, bent wire, etc.
 *   τ_g = gravitational torque from pull-weight (depends on weight position φ)
 *   s   = string length from body to pull-weight (m)
 *
 * The pull-weight hangs below on a string of length s. When displaced,
 * gravity creates a restoring torque through the linkage to the wings.
 * The weight acts as a pendulum with its own natural frequency √(g/s).
 * String length controls how well the weight tracks the wing motion:
 *   Short string → fast pendulum → strong coupling
 *   Long string  → slow pendulum → weaker coupling at high frequencies
 *
 * All SI internally. UI uses cm and grams for friendliness.
 */

const GRAVITY = 9.81; // m/s²
const AIR_DENSITY = 1.225; // kg/m³ at sea level

const Physics = {
  /**
   * Gather all slider values into a params object (SI units).
   */
  readParams() {
    const g = (id) => parseFloat(document.getElementById(id).value);

    const wingspanCm    = g('wingspan');
    const chordCm       = g('chord');
    const wingWeightG   = g('wingWeight');
    const taperPct      = g('taper');
    const bodyWeightG   = g('bodyWeight');
    const pullWeightG   = g('pullWeight');
    const tipWeightG    = g('tipWeight');
    const stringLenCm   = g('stringLength');
    const frictionPct   = g('friction');
    const springPct     = g('springK');
    const initialPullDeg = g('initialPull');
    const linkagePct    = g('linkagePoint');
    const pivotType     = document.getElementById('pivotType').value;
    const upperAttach   = document.getElementById('upperAttach').value;
    const elasticK      = parseFloat(document.getElementById('elasticK').value);

    // Convert to SI
    const wingspan   = wingspanCm / 100;       // m (total tip-to-tip)
    const halfSpan   = wingspan / 2;             // m (one wing length from pivot)
    const chord      = chordCm / 100;            // m
    const wingMass   = wingWeightG / 1000;       // kg (per wing)
    const bodyMass   = bodyWeightG / 1000;       // kg
    const pullMass   = pullWeightG / 1000;       // kg
    const tipMass    = tipWeightG / 1000;         // kg (per tip)
    const stringLen  = stringLenCm / 100;        // m
    const taper      = taperPct / 100;           // 0.2 to 1.0
    const linkageR   = (linkagePct / 100) * halfSpan; // m from pivot
    const initialPull = initialPullDeg * Math.PI / 180; // radians

    return {
      wingspan, halfSpan, chord, wingMass, bodyMass, pullMass, tipMass,
      stringLen, taper, linkageR, initialPull, pivotType, upperAttach, elasticK,
      frictionPct, springPct,
      // Keep originals for display
      wingspanCm, chordCm, wingWeightG, bodyWeightG, pullWeightG, tipWeightG,
      stringLenCm, taperPct, linkagePct, initialPullDeg
    };
  },

  /**
   * Calculate moment of inertia of one wing about the hinge.
   *
   * Wing = distributed mass (modeled as tapered rod/panel).
   * For a uniform rod pivoting at one end: I = (1/3)·m·L²
   * For a tapered wing (tip chord / root chord = t):
   *
   *   I_wing = m·L²·(1 + 3t) / (6·(1 + t))
   *
   * Derivation: integrate x²·dm over tapered panel where dm ∝ chord(x)·dx
   *   ∫₀ᴸ x²·[1+(t-1)x/L] dx = L³·(1+3t)/12
   *   Normalize by total mass m = ρ·c₀·L·(1+t)/2
   *   → I = m·L²·(1+3t) / (6·(1+t))
   *
   * Verification:
   *   t=1 (rectangle): (1+3)/(6·2) = 4/12 = 1/3 → I = mL²/3  ✓
   *   t=0 (triangle):  (1+0)/(6·1) = 1/6 → I = mL²/6          ✓
   *
   * Plus tip weights: I_tip = m_tip · L²  (point mass at tip)
   * Plus chord-wise inertia: I_chord = m · c_avg² / 12
   *
   * Total I for both wings combined (symmetric mode):
   *   I_total = 2 · (I_wing + I_tip + I_chord)
   */
  calcInertia(p) {
    const { halfSpan: L, wingMass: m, tipMass: mt, taper: t, chord: ch } = p;

    // Tapered panel moment of inertia about pivot end
    const taperFactor = (1 + 3 * t) / (6 * (1 + t));
    const I_oneWing = m * L * L * taperFactor;

    // Tip weight as point mass at distance L
    const I_oneTip = mt * L * L;

    // Chord-wise mass distribution adds small rotational inertia
    const avgChord = ch * (1 + t) / 2;
    const I_chord = m * avgChord * avgChord / 12;

    // Both wings (symmetric flapping = one degree of freedom)
    const I_total = 2 * (I_oneWing + I_oneTip + I_chord);

    return { I_total, I_oneWing, I_oneTip, I_chord, taperFactor };
  },

  /**
   * Calculate effective spring constant k (torsional stiffness, N·m/rad).
   */
  calcSpring(p) {
    const { pullMass, linkageR, springPct, wingMass, halfSpan, taper,
            pivotType, upperAttach, elasticK } = p;

    const k_gravity = pullMass * GRAVITY * linkageR;
    const wingCG = halfSpan * (1 + 2 * taper) / (3 * (1 + taper));
    const k_wingGravity = 2 * wingMass * GRAVITY * wingCG * 0.3;
    let k_spring = (springPct / 100) * 0.1;

    // Living hinge adds natural spring stiffness
    if (pivotType === 'living') k_spring += 0.04;

    // Elastic upper attachment adds restoring force
    let k_elastic = 0;
    if (upperAttach === 'elastic') k_elastic = (elasticK / 100) * 0.15 * linkageR;

    const k_total = k_gravity + k_wingGravity + k_spring + k_elastic;
    return { k_total, k_gravity, k_wingGravity, k_spring, k_elastic };
  },

  /**
   * Calculate damping coefficient c (N·m·s/rad).
   */
  calcDamping(p, I, k) {
    const { frictionPct, pivotType } = p;
    const c_crit = 2 * Math.sqrt(I * k);
    // Map friction slider to always-underdamped range
    // 0% → zeta 0.02 (bouncy), 100% → zeta 0.45 (gentle but still flaps)
    let zeta = 0.02 + (frictionPct / 100) * 0.43;

    if (pivotType === 'living') zeta *= 0.7;
    else if (pivotType === 'friction') zeta *= 1.4;
    // Hard cap: wings ALWAYS flap — never overdamped
    zeta = Math.min(zeta, 0.65);

    const c = zeta * c_crit;
    return { c, zeta, c_crit, pivotType };
  },

  /**
   * Compute all derived values for the dashboard.
   */
  computeAll(p) {
    const inertia = this.calcInertia(p);
    const I = inertia.I_total;
    const spring = this.calcSpring(p);
    const k = spring.k_total;
    const damping = this.calcDamping(p, I, k);
    const zeta = damping.zeta;

    const omega_n = Math.sqrt(k / I);
    const freq = omega_n / (2 * Math.PI);
    const period = freq > 0.001 ? 1 / freq : Infinity;

    let omega_d, freq_d, period_d;
    if (zeta < 1) {
      omega_d = omega_n * Math.sqrt(1 - zeta * zeta);
      freq_d = omega_d / (2 * Math.PI);
      period_d = freq_d > 0.001 ? 1 / freq_d : Infinity;
    } else {
      omega_d = 0; freq_d = 0; period_d = Infinity;
    }

    const decayRate = zeta * omega_n;
    const decayTime = decayRate > 0.001 ? 3.0 / decayRate : Infinity;
    const numFlaps = freq_d > 0 && decayTime < 1000 ? decayTime * freq_d : 0;
    const maxTorque = p.pullMass * GRAVITY * p.linkageR * Math.sin(p.initialPull);
    const sweepDeg = p.initialPullDeg;

    // Weight pendulum frequency
    const omega_p = Math.sqrt(GRAVITY / p.stringLen);
    const freq_p = omega_p / (2 * Math.PI);
    const period_p = freq_p > 0.001 ? 1 / freq_p : Infinity;
    const couplingRatio = omega_p > 0.001
      ? omega_p * omega_p / (omega_p * omega_p + omega_n * omega_n) : 0;

    // Static wing balance
    const _wcg = p.halfSpan * (1 + 2 * p.taper) / (3 * (1 + p.taper));
    const _grav = p.wingMass * GRAVITY * _wcg + p.tipMass * GRAVITY * p.halfSpan;
    const _tm = p.bodyMass + 2 * p.wingMass + 2 * p.tipMass + p.pullMass;
    const _sup = (_tm * GRAVITY / 2) * p.linkageR;
    const balanceRatio = _grav > 0.00001 ? _sup / _grav : 10;
    const staticImbalance = _sup - _grav;
    let restAngle = 0;
    if (balanceRatio < 1) restAngle = -(1 - balanceRatio) * (Math.PI / 2.5);

    // Air drag coefficient
    const wingArea = p.halfSpan * p.chord * (1 + p.taper) / 2;
    const Cd = 1.2;
    const rCop = p.halfSpan * (1 + 2 * p.taper) / (3 * (1 + p.taper));
    const airDragCoeff = AIR_DENSITY * Cd * wingArea * rCop;

    const totalMass = _tm;

    return {
      params: p, inertia, spring, damping, I, k,
      omega_n, freq, period, omega_d, freq_d, period_d, zeta,
      decayRate, decayTime, numFlaps, maxTorque, sweepDeg,
      totalMass, restAngle, balanceRatio, staticImbalance,
      wingArea, airDragCoeff, omega_p, freq_p, period_p, couplingRatio
    };
  },

  /**
   * 2-DOF Simulation: wing angle θ + weight pendulum angle φ
   *
   * Uses 4th-order Runge-Kutta integration with 4 state variables:
   *   [θ, θ̇, φ, φ̇]
   *
   * The weight pendulum (φ) is driven by the wing (θ) through the linkage.
   * The gravity torque on the wings depends on the weight's ACTUAL position.
   * String length (s) naturally controls the pendulum dynamics.
   */
  simulate(results, duration, dt) {
    const { params: p, I, damping, spring, staticImbalance: _si, airDragCoeff: adc } = results;
    const c = damping.c;
    // Only mechanical spring here — wing gravity is computed explicitly via sin(θ)
    const ks = spring.k_spring;
    const tSI = 2 * (_si || 0);
    const kEl = spring.k_elastic || 0;
    const isFrictionHinge = p.pivotType === 'friction';
    const coulombTorque = isFrictionHinge ? c * 0.05 : 0;
    const s = p.stringLen;
    const IpEff = p.pullMass * s * s + p.bodyMass * s * s * 0.1;
    // Light damping on weight pendulum (string/air friction)
    // zeta_pendulum = 0.05: a real string has very little damping
    const omega_pend = Math.sqrt(GRAVITY / s);
    const cp = 2 * 0.05 * omega_pend * IpEff;

    const steps = Math.ceil(duration / dt);
    const data = new Float64Array(steps);

    let theta = p.initialPull;
    let thetaDot = 0;
    let phi = p.initialPull * p.linkageR / s;
    let phiDot = 0;

    const aWing = (th, thd, ph) => {
      const tg = -p.pullMass * GRAVITY * p.linkageR * Math.sin(ph);
      const wcg = p.halfSpan * (1 + 2 * p.taper) / (3 * (1 + p.taper));
      const tw = -2 * p.wingMass * GRAVITY * wcg * 0.3 * Math.sin(th);
      const tEl = -kEl * th;
      const tCf = coulombTorque > 0 ? -coulombTorque * Math.sign(thd + 0.0001) : 0;
      const v = thd * p.halfSpan * 0.5;
      const tAir = -2 * (adc || 0) * v * Math.abs(v);
      return (tg + tw + tSI + tEl + tCf + tAir - ks * th - c * thd) / I;
    };

    const aWeight = (th, thd, ph, phd) => {
      const restore = -GRAVITY / s * Math.sin(ph);
      const drive = (p.linkageR / s) * GRAVITY * Math.sin(th - ph);
      const damp = -cp * phd / IpEff;
      return restore + drive + damp;
    };

    for (let i = 0; i < steps; i++) {
      data[i] = theta;

      const k1_thd = thetaDot, k1_tha = aWing(theta, thetaDot, phi);
      const k1_phd = phiDot, k1_pha = aWeight(theta, thetaDot, phi, phiDot);

      const th2 = theta + 0.5 * dt * k1_thd, thd2 = thetaDot + 0.5 * dt * k1_tha;
      const ph2 = phi + 0.5 * dt * k1_phd, phd2 = phiDot + 0.5 * dt * k1_pha;
      const k2_thd = thd2, k2_tha = aWing(th2, thd2, ph2);
      const k2_phd = phd2, k2_pha = aWeight(th2, thd2, ph2, phd2);

      const th3 = theta + 0.5 * dt * k2_thd, thd3 = thetaDot + 0.5 * dt * k2_tha;
      const ph3 = phi + 0.5 * dt * k2_phd, phd3 = phiDot + 0.5 * dt * k2_pha;
      const k3_thd = thd3, k3_tha = aWing(th3, thd3, ph3);
      const k3_phd = phd3, k3_pha = aWeight(th3, thd3, ph3, phd3);

      const th4 = theta + dt * k3_thd, thd4 = thetaDot + dt * k3_tha;
      const ph4 = phi + dt * k3_phd, phd4 = phiDot + dt * k3_pha;
      const k4_thd = thd4, k4_tha = aWing(th4, thd4, ph4);
      const k4_phd = phd4, k4_pha = aWeight(th4, thd4, ph4, phd4);

      theta    += (dt / 6) * (k1_thd + 2 * k2_thd + 2 * k3_thd + k4_thd);
      thetaDot += (dt / 6) * (k1_tha + 2 * k2_tha + 2 * k3_tha + k4_tha);
      phi      += (dt / 6) * (k1_phd + 2 * k2_phd + 2 * k3_phd + k4_phd);
      phiDot   += (dt / 6) * (k1_pha + 2 * k2_pha + 2 * k3_pha + k4_pha);
    }

    return data;
  }
};
