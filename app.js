/**
 * APP — Wires controls to physics engine and renderer.
 * Updates dashboard in real-time as sliders change.
 */

document.addEventListener('DOMContentLoaded', () => {
  Renderer.init();

  // ---- Wire up all sliders ----
  const sliders = [
    'wingspan', 'chord', 'wingWeight', 'taper',
    'bodyWeight', 'pullWeight', 'tipWeight',
    'stringLength', 'friction', 'springK', 'initialPull',
    'linkagePoint'
  ];

  const formatters = {
    wingspan:     (v) => `${parseFloat(v).toFixed(0)} cm`,
    chord:        (v) => `${parseFloat(v).toFixed(1)} cm`,
    wingWeight:   (v) => `${parseFloat(v).toFixed(0)} g`,
    taper:        (v) => `${parseFloat(v).toFixed(0)}%`,
    bodyWeight:   (v) => `${parseFloat(v).toFixed(0)} g`,
    pullWeight:   (v) => `${parseFloat(v).toFixed(0)} g`,
    tipWeight:    (v) => `${parseFloat(v).toFixed(1)} g`,
    stringLength: (v) => `${parseFloat(v).toFixed(0)} cm`,
    friction:     (v) => {
      const n = parseFloat(v);
      if (n < 20) return 'Very Low';
      if (n < 40) return 'Low';
      if (n < 60) return 'Medium';
      if (n < 80) return 'High';
      return 'Very High';
    },
    springK: (v) => {
      const n = parseFloat(v);
      if (n === 0) return 'None';
      if (n < 20) return 'Slight';
      if (n < 50) return 'Moderate';
      if (n < 80) return 'Strong';
      return 'Very Strong';
    },
    initialPull:  (v) => `${parseFloat(v).toFixed(0)}°`,
    linkagePoint: (v) => `${parseFloat(v).toFixed(0)}%`,
  };

  sliders.forEach(id => {
    const el = document.getElementById(id);
    const out = document.getElementById(`${id}-val`);
    const update = () => {
      if (out && formatters[id]) out.textContent = formatters[id](el.value);
      recalc();
    };
    el.addEventListener('input', update);
    update(); // initial
  });

  // Linkage type dropdown
  document.getElementById('linkageType').addEventListener('change', recalc);

  // ---- Flap button ----
  document.getElementById('flapBtn').addEventListener('click', () => {
    if (Renderer.animating) {
      Renderer.stopAnimation();
    } else {
      const params = Physics.readParams();
      const results = Physics.computeAll(params);
      Renderer.startAnimation(results);
    }
  });

  document.getElementById('resetViewBtn').addEventListener('click', () => {
    Renderer.stopAnimation();
    recalc();
  });

  // ---- Recalculate everything ----
  function recalc() {
    const params = Physics.readParams();
    const results = Physics.computeAll(params);

    // Draw static view (wings at initial pull angle, then neutral)
    Renderer.draw(0, params);

    // Simulate for the plot (even when not animating)
    const simDuration = Math.min(Math.max(results.decayTime * 1.5, 3), 30);
    const simDt = 1 / 120;
    const simData = Physics.simulate(results, simDuration, simDt);
    Renderer.simData = simData;
    Renderer.simDt = simDt;
    Renderer.drawPlot(simData, simDt, results);

    updateDashboard(results);
    updateVerdict(results);
  }

  // ---- DASHBOARD ----
  function updateDashboard(r) {
    // 1. FLAP SPEED
    {
      const el = document.getElementById('freq-val');
      const sub = document.getElementById('freq-sub');
      const bar = document.getElementById('freq-bar');
      const explain = document.getElementById('freq-explain');
      const math = document.getElementById('freq-math');
      const card = document.getElementById('card-freq');

      if (r.zeta >= 1) {
        el.textContent = 'No flap';
        sub.textContent = 'Too much friction — it just droops back';
        setBar(bar, 0, '--red');
        setStatus(card, 'bad');
        explain.textContent = 'The hinge is too sticky. The wings won\'t oscillate — they\'ll just slowly return to hanging straight down.';
      } else {
        const bpm = (r.freq_d * 60).toFixed(0);
        el.textContent = `${r.freq_d.toFixed(2)} Hz`;
        sub.textContent = `${bpm} flaps/min · ${r.period_d.toFixed(1)}s per flap`;

        // Sweet spot for butterflies: 0.3-1.5 Hz
        let pct, status;
        if (r.freq_d < 0.1) { pct = 10; status = 'bad'; }
        else if (r.freq_d < 0.3) { pct = 30; status = 'warn'; }
        else if (r.freq_d <= 1.5) { pct = 50 + (r.freq_d - 0.3) / 1.2 * 30; status = 'great'; }
        else if (r.freq_d <= 3) { pct = 70; status = 'ok'; }
        else { pct = 90; status = 'warn'; }

        setBar(bar, pct, `--${status === 'great' ? 'green' : status === 'ok' ? 'yellow' : status === 'warn' ? 'orange' : 'red'}`);
        setStatus(card, status);

        if (r.freq_d < 0.3) explain.textContent = 'Very slow — almost imperceptible movement. Might look like it\'s barely moving.';
        else if (r.freq_d <= 0.8) explain.textContent = 'Beautiful! Slow, graceful flapping — perfect for an elegant butterfly.';
        else if (r.freq_d <= 1.5) explain.textContent = 'Nice gentle flapping. Natural butterfly tempo.';
        else if (r.freq_d <= 3) explain.textContent = 'Fairly quick flapping. Lively but still looks good.';
        else explain.textContent = 'Fast flapping — might look frantic. Add tip weight or reduce spring to slow it down.';
      }

      math.textContent =
`Natural freq: ω_n = √(k/I) = √(${r.k.toFixed(6)} / ${r.I.toFixed(6)})
  = ${r.omega_n.toFixed(3)} rad/s
Damped freq: ω_d = ω_n·√(1-ζ²) = ${r.omega_n.toFixed(3)}·√(1-${r.zeta.toFixed(3)}²)
  = ${r.omega_d.toFixed(3)} rad/s
Frequency: f = ω_d/(2π) = ${r.freq_d.toFixed(3)} Hz
Period: T = 1/f = ${r.period_d.toFixed(2)} s`;
    }

    // 2. FLAP STYLE (Damping Ratio)
    {
      const el = document.getElementById('damping-val');
      const sub = document.getElementById('damping-sub');
      const bar = document.getElementById('damping-bar');
      const explain = document.getElementById('damping-explain');
      const math = document.getElementById('damping-math');
      const card = document.getElementById('card-damping');

      const z = r.zeta;
      let label, status;
      if (z < 0.1) { label = 'Bouncy'; status = 'warn'; }
      else if (z < 0.3) { label = 'Lively'; status = 'ok'; }
      else if (z < 0.7) { label = 'Graceful'; status = 'great'; }
      else if (z < 1.0) { label = 'Gentle'; status = 'ok'; }
      else if (z === 1.0) { label = 'Critical'; status = 'warn'; }
      else { label = 'Overdamped'; status = 'bad'; }

      el.textContent = label;
      sub.textContent = `ζ = ${z.toFixed(3)}`;

      setBar(bar, Math.min(z / 2, 1) * 100, `--${status === 'great' ? 'green' : status === 'ok' ? 'yellow' : status === 'warn' ? 'orange' : 'red'}`);
      setStatus(card, status);

      if (z < 0.1) explain.textContent = 'Almost no friction — it\'ll flap for a very long time but may look twitchy or uncontrolled.';
      else if (z < 0.3) explain.textContent = 'Low damping — wings will oscillate many times. Energetic and lively.';
      else if (z < 0.7) explain.textContent = 'Sweet spot! Wings flap several times then gracefully settle. Elegant and natural.';
      else if (z < 1.0) explain.textContent = 'Higher damping — wings flap just a few times before settling. Gentle and calm.';
      else explain.textContent = 'Too much friction. Wings won\'t flap — they\'ll just slowly droop back down. Loosen the hinge!';

      math.textContent =
`Damping ratio: ζ = c / (2·√(I·k))
  = c / (2·√(${r.I.toFixed(6)} × ${r.k.toFixed(6)}))
  = ${r.damping.c.toFixed(6)} / ${r.damping.c_crit.toFixed(6)}
  = ${z.toFixed(4)}

ζ < 1: oscillates (flaps!)
ζ = 1: returns fastest, no oscillation
ζ > 1: slow return, no flapping`;
    }

    // 3. WING HEAVINESS (Moment of Inertia)
    {
      const el = document.getElementById('inertia-val');
      const sub = document.getElementById('inertia-sub');
      const bar = document.getElementById('inertia-bar');
      const explain = document.getElementById('inertia-explain');
      const math = document.getElementById('inertia-math');
      const card = document.getElementById('card-inertia');

      const I = r.I;
      // Express in g·cm² for human-friendliness
      const I_gcm2 = I * 1e7; // kg·m² → g·cm²

      let label, status;
      if (I_gcm2 < 50) { label = 'Very Light'; status = 'warn'; }
      else if (I_gcm2 < 500) { label = 'Light'; status = 'ok'; }
      else if (I_gcm2 < 5000) { label = 'Medium'; status = 'great'; }
      else if (I_gcm2 < 20000) { label = 'Heavy'; status = 'ok'; }
      else { label = 'Very Heavy'; status = 'warn'; }

      el.textContent = label;
      sub.textContent = `${I_gcm2.toFixed(0)} g·cm²`;

      const pct = Math.min(Math.log10(Math.max(I_gcm2, 1)) / 5 * 100, 100);
      setBar(bar, pct, `--${status === 'great' ? 'green' : status === 'ok' ? 'yellow' : 'orange'}`);
      setStatus(card, status);

      explain.textContent = I_gcm2 < 50
        ? 'Wings are super light — they\'ll flap fast but may feel flimsy.'
        : I_gcm2 < 500
        ? 'Light wings — responsive flapping. Good for smaller butterflies.'
        : I_gcm2 < 5000
        ? 'Nice balance of weight. Wings will swing with satisfying momentum.'
        : 'Heavy wings — they\'ll swing slowly and dramatically. Needs more pull force.';

      const I_wing_gcm2 = r.inertia.I_oneWing * 1e7;
      const I_tip_gcm2 = r.inertia.I_oneTip * 1e7;
      math.textContent =
`Moment of inertia (resistance to rotation):

Wing (tapered panel): I = m·L²·(1+t+t²)/(3·(1+t))
  = ${(r.params.wingMass*1000).toFixed(1)}g × (${(r.params.halfSpan*100).toFixed(1)}cm)²
    × ${r.inertia.taperFactor.toFixed(4)}
  = ${I_wing_gcm2.toFixed(1)} g·cm² per wing

Tip weight: I = m·L² = ${(r.params.tipMass*1000).toFixed(1)}g × (${(r.params.halfSpan*100).toFixed(1)}cm)²
  = ${I_tip_gcm2.toFixed(1)} g·cm² per tip

Total (both wings): I = 2×(${I_wing_gcm2.toFixed(1)} + ${I_tip_gcm2.toFixed(1)})
  = ${I_gcm2.toFixed(1)} g·cm²

KEY: Moving weight farther out → I grows with r²!
  2× farther = 4× more inertia = much slower flap`;
    }

    // 4. HOW LONG IT FLAPS
    {
      const el = document.getElementById('duration-val');
      const sub = document.getElementById('duration-sub');
      const bar = document.getElementById('duration-bar');
      const explain = document.getElementById('duration-explain');
      const math = document.getElementById('duration-math');
      const card = document.getElementById('card-duration');

      if (r.zeta >= 1) {
        el.textContent = '0';
        sub.textContent = 'No oscillation — returns without flapping';
        setBar(bar, 0, '--red');
        setStatus(card, 'bad');
        explain.textContent = 'Too much friction to oscillate. It\'ll just slowly sink back down.';
      } else {
        const flaps = Math.round(r.numFlaps);
        const secs = r.decayTime;

        if (secs > 100) {
          el.textContent = `${flaps}+`;
          sub.textContent = `Flaps for ${secs.toFixed(0)}+ seconds`;
        } else {
          el.textContent = `~${flaps} flaps`;
          sub.textContent = `Dies out in ~${secs.toFixed(1)} seconds`;
        }

        let status;
        if (flaps < 3) { status = 'warn'; }
        else if (flaps <= 15) { status = 'great'; }
        else if (flaps <= 40) { status = 'ok'; }
        else { status = 'warn'; }

        setBar(bar, Math.min(flaps / 30 * 100, 100), `--${status === 'great' ? 'green' : status === 'ok' ? 'yellow' : 'orange'}`);
        setStatus(card, status);

        if (flaps < 3) explain.textContent = 'Very few flaps. Add less friction or more initial pull for a longer show.';
        else if (flaps <= 8) explain.textContent = 'A nice brief flourish — a few graceful flaps then stillness.';
        else if (flaps <= 15) explain.textContent = 'Great! A satisfying number of flaps. Catches the eye without going on forever.';
        else explain.textContent = 'Lots of flapping! If it feels like too much, add a tiny bit more friction.';
      }

      math.textContent =
`Decay envelope: A(t) = A₀ · e^(-ζ·ω_n·t)

Time to 5% amplitude:
  t = -ln(0.05) / (ζ·ω_n)
  = 3.0 / (${r.zeta.toFixed(3)} × ${r.omega_n.toFixed(3)})
  = ${r.decayTime.toFixed(2)} s

Number of flaps = decay_time × frequency
  = ${r.decayTime.toFixed(2)} × ${r.freq_d.toFixed(3)}
  = ${r.numFlaps.toFixed(1)} flaps`;
    }

    // 5. PULL FORCE (Torque)
    {
      const el = document.getElementById('torque-val');
      const sub = document.getElementById('torque-sub');
      const bar = document.getElementById('torque-bar');
      const explain = document.getElementById('torque-explain');
      const math = document.getElementById('torque-math');
      const card = document.getElementById('card-torque');

      const tau_mNm = r.maxTorque * 1000; // millinewton-meters
      const forceG = (r.maxTorque / r.params.linkageR) * 1000 / GRAVITY; // grams-force equivalent

      el.textContent = `${tau_mNm.toFixed(1)} mN·m`;
      sub.textContent = `~${forceG.toFixed(0)}g force at the linkage`;

      let status;
      if (tau_mNm < 0.5) { status = 'bad'; }
      else if (tau_mNm < 5) { status = 'ok'; }
      else if (tau_mNm < 50) { status = 'great'; }
      else { status = 'ok'; }

      setBar(bar, Math.min(Math.log10(Math.max(tau_mNm, 0.01) + 1) / 3 * 100, 100), `--${status === 'great' ? 'green' : status === 'ok' ? 'yellow' : 'red'}`);
      setStatus(card, status);

      explain.textContent = tau_mNm < 0.5
        ? 'Very little driving force. The pull-weight might not have enough oomph to get good flapping.'
        : tau_mNm < 5
        ? 'Light pull force — works for small, light butterflies.'
        : tau_mNm < 50
        ? 'Good driving force. Enough to get the wings moving convincingly.'
        : 'Strong pull force. Make sure the mechanism can handle it without binding.';

      math.textContent =
`Max torque at initial pull angle:
  τ = m_pull × g × r_linkage × sin(θ₀)
  = ${(r.params.pullMass*1000).toFixed(1)}g × 9.81 × ${(r.params.linkageR*100).toFixed(1)}cm × sin(${r.params.initialPullDeg}°)
  = ${tau_mNm.toFixed(3)} mN·m

Equivalent force at linkage point:
  F = τ / r = ${forceG.toFixed(1)} grams-force`;
    }

    // 6. WING SWEEP (Amplitude)
    {
      const el = document.getElementById('amplitude-val');
      const sub = document.getElementById('amplitude-sub');
      const bar = document.getElementById('amplitude-bar');
      const explain = document.getElementById('amplitude-explain');
      const math = document.getElementById('amplitude-math');
      const card = document.getElementById('card-amplitude');

      const sweep = r.sweepDeg;
      const tipTravel = 2 * r.params.halfSpan * Math.sin(r.params.initialPull) * 100; // cm

      el.textContent = `±${sweep}°`;
      sub.textContent = `Tips travel ${tipTravel.toFixed(1)} cm up and down`;

      let status;
      if (sweep < 10) { status = 'warn'; }
      else if (sweep <= 35) { status = 'great'; }
      else if (sweep <= 50) { status = 'ok'; }
      else { status = 'warn'; }

      setBar(bar, Math.min(sweep / 60 * 100, 100), `--${status === 'great' ? 'green' : status === 'ok' ? 'yellow' : 'orange'}`);
      setStatus(card, status);

      explain.textContent = sweep < 10
        ? 'Barely visible movement. Pull harder or use a bigger initial displacement.'
        : sweep <= 35
        ? 'Beautiful range of motion. Wings sweep noticeably without being extreme.'
        : sweep <= 50
        ? 'Big dramatic sweeps. Very visible from across a room.'
        : 'Huge sweep angle — make sure your linkage can handle this range without binding.';

      math.textContent =
`Initial pull angle: θ₀ = ${sweep}°
  = ${r.params.initialPull.toFixed(4)} radians

Wingtip travel (per side):
  d = L × sin(θ₀) = ${(r.params.halfSpan*100).toFixed(1)}cm × sin(${sweep}°)
  = ${(tipTravel/2).toFixed(1)} cm each way
  = ${tipTravel.toFixed(1)} cm total sweep

After ${r.numFlaps.toFixed(0)} flaps, amplitude decays to:
  A = ${sweep}° × e^(-${r.zeta.toFixed(3)} × ${r.omega_n.toFixed(2)} × ${r.decayTime.toFixed(1)})
  ≈ ${(sweep * 0.05).toFixed(1)}° (barely visible)`;
    }
  }

  // ---- VERDICT ----
  function updateVerdict(r) {
    const box = document.getElementById('verdict-box');
    const icon = document.getElementById('verdict-icon');
    const text = document.getElementById('verdict-text');
    const tips = document.getElementById('verdict-tips');

    box.className = '';

    const issues = [];
    const goods = [];

    if (r.zeta >= 1) {
      issues.push('Too much friction — wings won\'t flap at all. Loosen the hinge or use a smoother pivot.');
    }
    if (r.zeta >= 0.8 && r.zeta < 1) {
      issues.push('Very heavy damping — you\'ll only get 1-2 tiny flaps. Try reducing hinge friction.');
    }
    if (r.zeta < 0.05) {
      issues.push('Almost zero friction — the wings will keep bouncing for a very long time. Add a felt washer or tighten the pivot slightly.');
    }
    if (r.freq_d > 3 && r.zeta < 1) {
      issues.push('Flapping too fast — it\'ll look frantic. Add wingtip weights to slow it down (remember: weight far out = much slower flaps).');
    }
    if (r.freq_d < 0.2 && r.zeta < 1) {
      issues.push('Flapping extremely slowly — might look like it\'s barely moving. Increase the spring or reduce wing weight.');
    }
    if (r.maxTorque < 0.0005) {
      issues.push('Almost no driving force — the pull-weight is too light or linkage point too close to the pivot. Increase the pull-weight or move the linkage attachment farther out on the wing.');
    }
    if (r.sweepDeg < 10) {
      issues.push('Very small wing sweep — hard to see from a distance. Pull harder or increase the initial displacement.');
    }
    if (r.sweepDeg > 50) {
      issues.push('Very large sweep angle — make sure the mechanism doesn\'t bind at extremes. Maybe reduce initial pull a bit.');
    }

    if (r.zeta >= 0.3 && r.zeta <= 0.7 && r.zeta < 1) {
      goods.push('Graceful damping — wings will flap beautifully and settle naturally.');
    }
    if (r.freq_d >= 0.3 && r.freq_d <= 1.5 && r.zeta < 1) {
      goods.push('Perfect flap speed for an elegant butterfly.');
    }
    if (r.numFlaps >= 5 && r.numFlaps <= 15) {
      goods.push('Great number of flaps — catches the eye without going on too long.');
    }
    if (r.sweepDeg >= 15 && r.sweepDeg <= 40) {
      goods.push('Wing sweep is in the sweet spot — visible and graceful.');
    }

    if (issues.length === 0 && goods.length >= 2) {
      box.classList.add('verdict-great');
      icon.textContent = '🦋';
      text.textContent = 'Beautiful! This Butterfly Will Look Stunning';
      tips.innerHTML = goods.map(g => `<div>✓ ${g}</div>`).join('');
    } else if (issues.length === 0) {
      box.classList.add('verdict-good');
      icon.textContent = '🦋';
      text.textContent = 'Looking Good — Fine-Tune for Perfection';
      tips.innerHTML = goods.map(g => `<div>✓ ${g}</div>`).join('');
    } else if (issues.length <= 2 && goods.length > 0) {
      box.classList.add('verdict-meh');
      icon.textContent = '🔧';
      text.textContent = 'Almost There — A Few Tweaks Needed';
      tips.innerHTML = issues.map(i => `<div><strong>→</strong> ${i}</div>`).join('') +
        goods.map(g => `<div>✓ ${g}</div>`).join('');
    } else {
      box.classList.add('verdict-bad');
      icon.textContent = '⚠️';
      text.textContent = 'Needs Work — Check the Suggestions Below';
      tips.innerHTML = issues.map(i => `<div><strong>→</strong> ${i}</div>`).join('');
    }
  }

  // ---- Helpers ----
  function setBar(barEl, pct, colorVar) {
    barEl.style.width = `${Math.max(pct, 2)}%`;
    barEl.style.background = `var(${colorVar})`;
  }

  function setStatus(cardEl, status) {
    cardEl.className = 'metric-card';
    cardEl.classList.add(`status-${status}`);
  }

  // Initial calculation
  recalc();
});
