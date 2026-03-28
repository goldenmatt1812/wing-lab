/**
 * RENDERER — Hanging Bird Visualization
 *
 * Draws a side-view of the bird hanging from the ceiling,
 * with wings that flap based on the current angle θ.
 * Also draws the time-domain plot of θ(t).
 */

const Renderer = {
  canvas: null,
  ctx: null,
  plotCanvas: null,
  plotCtx: null,
  dpr: 1,

  // Animation state
  simData: null,
  simIndex: 0,
  animating: false,
  animId: null,
  simDt: 1 / 120,
  currentAngle: 0,

  // Colors — elegant, gala-worthy
  colors: {
    ceiling: '#2a3450',
    string: '#5b6b8a',
    body: '#c9a96e',       // warm gold
    bodyDark: '#8b7340',
    wing: '#dcc895',       // light gold
    wingEdge: '#b89d5e',
    pivot: '#e8d5a3',
    weight: '#7a8caa',
    weightString: '#4a5a78',
    tipWeight: '#ff9f43',
    linkage: '#6b7fa0',
    ghost: 'rgba(220, 200, 149, 0.08)',
    gridLine: 'rgba(255,255,255,0.03)',
    text: '#8892a8',
    accent: '#38bdf8',
    plotLine: '#38bdf8',
    plotFill: 'rgba(56, 189, 248, 0.1)',
    plotGrid: 'rgba(255,255,255,0.06)',
    plotZero: 'rgba(255,255,255,0.15)',
    envelope: 'rgba(251, 191, 36, 0.4)',
  },

  init() {
    this.canvas = document.getElementById('wingCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.plotCanvas = document.getElementById('plotCanvas');
    this.plotCtx = this.plotCanvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    // Main canvas
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Plot canvas
    const prect = this.plotCanvas.getBoundingClientRect();
    this.plotCanvas.width = prect.width * this.dpr;
    this.plotCanvas.height = prect.height * this.dpr;
    this.plotCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.draw();
  },

  /**
   * Draw the hanging bird at a given wing angle (radians).
   */
  draw(angle, params) {
    angle = angle || this.currentAngle || 0;
    const ctx = this.ctx;
    const W = this.canvas.getBoundingClientRect().width;
    const H = this.canvas.getBoundingClientRect().height;
    const p = params || this._lastParams;
    if (!p) return;
    this._lastParams = p;

    ctx.clearRect(0, 0, W, H);

    // === Background grid ===
    ctx.strokeStyle = this.colors.gridLine;
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Scale: map real dimensions to pixels
    // We want the bird to fill ~60% of the canvas height
    const totalRealHeight = 0.15 + p.stringLen + 0.05; // ceiling string + body + pull string
    const scale = (H * 0.55) / Math.max(totalRealHeight, 0.1);
    const cx = W / 2;

    // Positions (pixels from top)
    const ceilingY = 30;
    const stringTopLen = 40; // fixed visual string from ceiling
    const bodyY = ceilingY + stringTopLen;
    const bodyH = Math.max(12, Math.min(25, p.bodyMass * 200));
    const bodyW = Math.max(10, Math.min(20, bodyH * 0.6));
    const pivotY = bodyY + bodyH * 0.3; // wing pivot slightly above center
    const pullStringPx = p.stringLen * scale;
    const weightY = bodyY + bodyH + pullStringPx;
    const weightR = Math.max(6, Math.min(18, Math.sqrt(p.pullMass * 1000) * 2));

    // Wing dimensions in pixels
    const wingLenPx = p.halfSpan * scale;
    const chordPx = p.chord * scale;
    const linkagePx = p.linkageR * scale;

    // === Ceiling mount ===
    ctx.fillStyle = this.colors.ceiling;
    ctx.fillRect(cx - 30, 0, 60, ceilingY);
    // Decorative hook
    ctx.beginPath();
    ctx.arc(cx, ceilingY, 4, 0, Math.PI, true);
    ctx.strokeStyle = this.colors.string;
    ctx.lineWidth = 2;
    ctx.stroke();

    // === Hanging string (ceiling to body) ===
    ctx.beginPath();
    ctx.moveTo(cx, ceilingY);
    ctx.lineTo(cx, bodyY);
    ctx.strokeStyle = this.colors.string;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // === Ghost wings (neutral position) ===
    this._drawWing(ctx, cx, pivotY, wingLenPx, chordPx, 0, p.taper, true);
    this._drawWing(ctx, cx, pivotY, wingLenPx, chordPx, 0, p.taper, true, true);

    // === Active wings (at current angle) ===
    this._drawWing(ctx, cx, pivotY, wingLenPx, chordPx, angle, p.taper, false);
    this._drawWing(ctx, cx, pivotY, wingLenPx, chordPx, angle, p.taper, false, true);

    // === Tip weights ===
    if (p.tipMass > 0.0005) {
      const tipR = Math.max(3, Math.min(10, Math.sqrt(p.tipMass * 1000) * 1.5));
      // Left tip
      const ltx = cx - wingLenPx * Math.cos(angle);
      const lty = pivotY + wingLenPx * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(ltx, lty, tipR, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.tipWeight;
      ctx.fill();
      ctx.strokeStyle = '#cc7a20';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Right tip
      const rtx = cx + wingLenPx * Math.cos(angle);
      ctx.beginPath();
      ctx.arc(rtx, lty, tipR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // === Linkage lines (wing to pull-weight) ===
    const llx = cx - linkagePx * Math.cos(angle);
    const lly = pivotY + linkagePx * Math.sin(angle);
    const rlx = cx + linkagePx * Math.cos(angle);
    ctx.beginPath();
    ctx.moveTo(llx, lly);
    ctx.lineTo(cx, weightY);
    ctx.moveTo(rlx, lly);
    ctx.lineTo(cx, weightY);
    ctx.strokeStyle = this.colors.linkage;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Linkage attachment dots
    ctx.fillStyle = this.colors.accent;
    ctx.beginPath(); ctx.arc(llx, lly, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rlx, lly, 3, 0, Math.PI * 2); ctx.fill();

    // === Body ===
    // Elegant oval body
    ctx.beginPath();
    ctx.ellipse(cx, bodyY + bodyH / 2, bodyW, bodyH / 2, 0, 0, Math.PI * 2);
    const bodyGrad = ctx.createRadialGradient(cx - 3, bodyY + bodyH * 0.3, 2, cx, bodyY + bodyH / 2, bodyH / 2);
    bodyGrad.addColorStop(0, this.colors.body);
    bodyGrad.addColorStop(1, this.colors.bodyDark);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = this.colors.wingEdge;
    ctx.lineWidth = 1;
    ctx.stroke();

    // === Pivot indicator ===
    ctx.beginPath();
    ctx.arc(cx, pivotY, 4, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.pivot;
    ctx.fill();
    ctx.strokeStyle = this.colors.wingEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // === Pull string ===
    ctx.beginPath();
    ctx.moveTo(cx, bodyY + bodyH);
    ctx.lineTo(cx, weightY);
    ctx.strokeStyle = this.colors.weightString;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // === Pull weight ===
    ctx.beginPath();
    ctx.arc(cx, weightY, weightR, 0, Math.PI * 2);
    const wGrad = ctx.createRadialGradient(cx - 2, weightY - 2, 1, cx, weightY, weightR);
    wGrad.addColorStop(0, '#9aabbf');
    wGrad.addColorStop(1, '#5a6a82');
    ctx.fillStyle = wGrad;
    ctx.fill();
    ctx.strokeStyle = '#4a5a72';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // === Labels ===
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = this.colors.text;
    ctx.textAlign = 'left';

    // Wing length label
    if (wingLenPx > 50) {
      const labelY = pivotY - 8;
      ctx.fillText(`${p.wingspanCm} cm span`, cx + wingLenPx * 0.3, labelY);
    }

    // Pull weight label
    ctx.textAlign = 'center';
    ctx.fillText(`${p.pullWeightG}g`, cx, weightY + weightR + 14);

    // Angle arc (when flapping)
    if (Math.abs(angle) > 0.02) {
      const arcR = Math.min(30, wingLenPx * 0.3);
      ctx.beginPath();
      if (angle > 0) {
        ctx.arc(cx, pivotY, arcR, -Math.PI / 2, -Math.PI / 2 + angle, false);
      } else {
        ctx.arc(cx, pivotY, arcR, -Math.PI / 2 + angle, -Math.PI / 2, false);
      }
      ctx.strokeStyle = this.colors.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const angleDeg = Math.abs(angle * 180 / Math.PI).toFixed(0);
      ctx.fillStyle = this.colors.accent;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText(`${angleDeg}°`, cx + arcR + 8, pivotY - 5);
    }
  },

  /**
   * Draw one wing (tapered shape).
   * mirror = true for right wing.
   */
  _drawWing(ctx, cx, pivotY, wingLen, chordPx, angle, taper, isGhost, mirror) {
    const dir = mirror ? 1 : -1;
    const tipChord = chordPx * taper;

    ctx.save();
    ctx.translate(cx, pivotY);

    // Wing direction: left wing goes left, angled down by θ
    // Rotate so the wing pivots
    const rotAngle = dir * (Math.PI) + (dir < 0 ? angle : -angle);

    // Calculate wing points in wing-local coordinates
    // Wing root at (0,0), tip at (wingLen, 0)
    // Root chord: -chordPx/3 to +2chordPx/3 (leading/trailing edge)
    // Tip chord: tapered

    const rootTop = -chordPx * 0.35;
    const rootBot = chordPx * 0.65;
    const tipTop = -tipChord * 0.35;
    const tipBot = tipChord * 0.65;

    // Transform wing points to canvas coordinates
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const transform = (wx, wy) => {
      // wx = distance along wing, wy = perpendicular (chord direction)
      return [
        cx + dir * (wx * cosA),
        pivotY + wx * sinA + wy
      ];
    };

    // Draw wing shape
    const p0 = transform(0, rootTop);
    const p1 = transform(wingLen, tipTop);
    const p2 = transform(wingLen, tipBot);
    const p3 = transform(0, rootBot);

    // Control points for slight curve
    const cp1 = transform(wingLen * 0.4, rootTop + (tipTop - rootTop) * 0.3 - 3);
    const cp2 = transform(wingLen * 0.7, tipTop + (rootTop - tipTop) * 0.1);
    const cp3 = transform(wingLen * 0.7, tipBot + (rootBot - tipBot) * 0.1);
    const cp4 = transform(wingLen * 0.4, rootBot + (tipBot - rootBot) * 0.3 + 3);

    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.quadraticCurveTo(cp1[0], cp1[1], p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.quadraticCurveTo(cp4[0], cp4[1], p3[0], p3[1]);
    ctx.closePath();

    if (isGhost) {
      ctx.fillStyle = this.colors.ghost;
      ctx.fill();
    } else {
      // Gradient fill
      const grad = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
      grad.addColorStop(0, this.colors.wing);
      grad.addColorStop(0.7, this.colors.wingEdge);
      grad.addColorStop(1, this.colors.bodyDark);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = this.colors.wingEdge;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Wing spar line
      const sparStart = transform(0, 0);
      const sparEnd = transform(wingLen * 0.95, 0);
      ctx.beginPath();
      ctx.moveTo(sparStart[0], sparStart[1]);
      ctx.lineTo(sparEnd[0], sparEnd[1]);
      ctx.strokeStyle = this.colors.bodyDark;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  },

  /**
   * Draw the time-domain plot of θ(t).
   */
  drawPlot(simData, dt, results) {
    const ctx = this.plotCtx;
    const W = this.plotCanvas.getBoundingClientRect().width;
    const H = this.plotCanvas.getBoundingClientRect().height;

    ctx.clearRect(0, 0, W, H);

    if (!simData || simData.length === 0) return;

    const padding = { top: 20, bottom: 25, left: 45, right: 20 };
    const plotW = W - padding.left - padding.right;
    const plotH = H - padding.top - padding.bottom;

    // Find max angle for scaling
    let maxAngle = 0;
    for (let i = 0; i < simData.length; i++) {
      maxAngle = Math.max(maxAngle, Math.abs(simData[i]));
    }
    maxAngle = Math.max(maxAngle, 0.05) * 1.15; // 15% headroom

    const duration = simData.length * dt;

    const toX = (t) => padding.left + (t / duration) * plotW;
    const toY = (a) => padding.top + plotH / 2 - (a / maxAngle) * (plotH / 2);

    // Grid lines
    ctx.strokeStyle = this.colors.plotGrid;
    ctx.lineWidth = 0.5;
    // Time axis ticks
    const timeStep = duration > 20 ? 5 : duration > 10 ? 2 : 1;
    for (let t = 0; t <= duration; t += timeStep) {
      const x = toX(t);
      ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, H - padding.bottom); ctx.stroke();
      ctx.fillStyle = this.colors.text;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${t}s`, x, H - 8);
    }

    // Zero line
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(0));
    ctx.lineTo(W - padding.right, toY(0));
    ctx.strokeStyle = this.colors.plotZero;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Angle labels
    ctx.fillStyle = this.colors.text;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    const maxDeg = (maxAngle * 180 / Math.PI).toFixed(0);
    ctx.fillText(`+${maxDeg}°`, padding.left - 5, padding.top + 8);
    ctx.fillText(`-${maxDeg}°`, padding.left - 5, H - padding.bottom - 2);
    ctx.fillText('0°', padding.left - 5, toY(0) + 4);

    // Envelope curves (decay envelope)
    if (results && results.zeta < 1 && results.zeta > 0) {
      ctx.beginPath();
      for (let i = 0; i < simData.length; i += 3) {
        const t = i * dt;
        const env = results.params.initialPull * Math.exp(-results.zeta * results.omega_n * t);
        const x = toX(t);
        if (i === 0) ctx.moveTo(x, toY(env));
        else ctx.lineTo(x, toY(env));
      }
      ctx.strokeStyle = this.colors.envelope;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Lower envelope
      ctx.beginPath();
      for (let i = 0; i < simData.length; i += 3) {
        const t = i * dt;
        const env = -results.params.initialPull * Math.exp(-results.zeta * results.omega_n * t);
        const x = toX(t);
        if (i === 0) ctx.moveTo(x, toY(env));
        else ctx.lineTo(x, toY(env));
      }
      ctx.stroke();
    }

    // Main signal — filled area
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    for (let i = 0; i < simData.length; i += 2) {
      ctx.lineTo(toX(i * dt), toY(simData[i]));
    }
    ctx.lineTo(toX((simData.length - 1) * dt), toY(0));
    ctx.closePath();
    ctx.fillStyle = this.colors.plotFill;
    ctx.fill();

    // Main signal — line
    ctx.beginPath();
    for (let i = 0; i < simData.length; i += 2) {
      const x = toX(i * dt);
      const y = toY(simData[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = this.colors.plotLine;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Playhead (if animating)
    if (this.animating && this.simIndex < simData.length) {
      const px = toX(this.simIndex * dt);
      ctx.beginPath();
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, H - padding.bottom);
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Dot on the signal
      ctx.beginPath();
      ctx.arc(px, toY(simData[this.simIndex]), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f472b6';
      ctx.fill();
    }

    // Y-axis label
    ctx.save();
    ctx.translate(12, padding.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = this.colors.text;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Wing Angle', 0, 0);
    ctx.restore();
  },

  /**
   * Start the flapping animation.
   */
  startAnimation(results) {
    this.stopAnimation();

    const duration = Math.min(results.decayTime * 1.5, 30); // cap at 30 seconds
    const simDuration = Math.max(duration, 3);
    this.simDt = 1 / 120;
    this.simData = Physics.simulate(results, simDuration, this.simDt);
    this.simIndex = 0;
    this.animating = true;
    this._results = results;

    const flapBtn = document.getElementById('flapBtn');
    flapBtn.textContent = '⏸ Pause';
    flapBtn.classList.add('active');

    const animate = () => {
      if (!this.animating) return;

      // Advance by ~2 sim steps per frame (at 60fps → real-time)
      this.simIndex += 2;
      if (this.simIndex >= this.simData.length) {
        this.stopAnimation();
        return;
      }

      const angle = this.simData[this.simIndex];
      this.currentAngle = angle;
      this.draw(angle);
      this.drawPlot(this.simData, this.simDt, this._results);

      this.animId = requestAnimationFrame(animate);
    };

    this.animId = requestAnimationFrame(animate);
  },

  stopAnimation() {
    this.animating = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.currentAngle = 0;

    const flapBtn = document.getElementById('flapBtn');
    flapBtn.textContent = '▶ Pull & Release';
    flapBtn.classList.remove('active');

    this.draw(0);
  }
};
