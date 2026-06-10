// ══════════════════════════════════════════════════════════════════════════════
// TileRenderer2D — SIMPLIFIED 2D BOSS RENDERING (drop-in replacement methods)
// ══════════════════════════════════════════════════════════════════════════════
// Replace the existing `_drawBoss2D` and `_drawTurret2D` methods inside the
// TileRenderer2D class in js/game/TileRenderer2D.js with the two methods below.
//
// Design intent: 2D mode is the tactical/readable view. Flat shapes, no shadow
// blur, no aura gradients — just clean silhouettes plus the information that
// matters for play: danger telegraphs, venom pools, beam lines, HP, shield, and
// phase color. The spectacle lives in 3D; the 2D view is a clear minimap-like
// readout of the same fight.
// ══════════════════════════════════════════════════════════════════════════════

  _drawBoss2D(ctx, boss, offX, offY, TS) {
    const cx = boss.x3 * TS + offX;
    const cy = boss.z3 * TS + offY;
    const r  = TS * 0.5;
    const t  = performance.now() / 1000;
    const phase = boss.phase || 1;
    const phaseColor = ['', '#7b4fff', '#cc44ff', '#ff7722', '#ff2233'][phase] || '#7b4fff';

    ctx.save();

    // ── Ground telegraphs (danger markers) — flat outline + sweeping fill ──
    if (boss.telegraphs) {
      boss.telegraphs.forEach(tg => {
        const tx = tg.x * TS + offX, ty = tg.z * TS + offY;
        const rad = tg.radius * TS;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#ff4433';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#ff4433';
        ctx.beginPath();
        ctx.arc(tx, ty, rad * tg.progress, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // ── Venom pools — flat green discs ──
    if (boss.venomPools) {
      boss.venomPools.forEach(p => {
        ctx.globalAlpha = 0.25 * Math.min(1, p.life / 1.0);
        ctx.fillStyle = '#55cc33';
        ctx.beginPath();
        ctx.arc(p.x * TS + offX, p.z * TS + offY, p.radius * TS, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // ── Web rays — single thin lines; dashed while charging (harmless) ──
    if (boss.webRays && boss.webRays.length > 0) {
      ctx.lineWidth = 2;
      boss.webRays.forEach(ray => {
        if (ray.life <= 0) return;
        const ox = ray.ox * TS + offX;
        const oz = ray.oz * TS + offY;
        const ex = ox + Math.cos(ray.angle) * ray.len * TS;
        const ez = oz + Math.sin(ray.angle) * ray.len * TS;
        ctx.globalAlpha = ray.charging ? 0.35 : Math.min(1, ray.life / ray.maxLife) * 0.8;
        ctx.strokeStyle = ray.charging ? '#ccaaff' : '#9944ee';
        ctx.setLineDash(ray.charging ? [4, 4] : []);
        ctx.beginPath();
        ctx.moveTo(ox, oz);
        ctx.lineTo(ex, ez);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    ctx.globalAlpha = 1;

    // ── Body: simple two-circle spider silhouette + 4 leg strokes per side ──
    const legWiggle = Math.sin(t * 6) * 0.06;
    ctx.strokeStyle = '#3a1f50';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = -0.65 + i * 0.43;
      [1, -1].forEach(side => {
        const ang = side > 0 ? a : Math.PI - a;
        const wig = (i % 2 === 0 ? 1 : -1) * legWiggle;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang + wig) * r * 1.5,
                   cy + Math.sin(ang + wig) * r * 1.5);
        ctx.stroke();
      });
    }

    // Abdomen + head
    ctx.fillStyle = '#241038';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.22, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.34, r * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Phase ring around the body — the only "flair", and it's informational
    ctx.strokeStyle = phaseColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Eyes (white during the vulnerable crit window)
    ctx.fillStyle = boss.vulnTimer > 0 ? '#ffffff' : '#ff3322';
    [[-0.13, -0.42], [0.13, -0.42]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.arc(cx + ex * r, cy + ey * r, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
    });

    // Shield: plain blue circle
    if (boss.isShielded) {
      ctx.strokeStyle = '#4499ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // HP bar
    const bw = TS * 1.6, bh = 4;
    const hpFrac = Math.max(0, boss.hp / boss.maxHp);
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(cx - bw / 2 - 1, cy - r * 1.7 - 1, bw + 2, bh + 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = phaseColor;
    ctx.fillRect(cx - bw / 2, cy - r * 1.7, bw * hpFrac, bh);

    ctx.restore();
  }

  _drawTurret2D(ctx, t, offX, offY, TS, player) {
    if (t.dead) return;
    const cx = t.tx * TS + offX;
    const cy = t.ty * TS + offY;
    const r  = TS * 0.26;

    ctx.save();

    // Simple egg oval, brighter as it nears firing
    const charge = 1 - Math.min(1, t.fireTimer / 1.2);
    ctx.fillStyle = charge > 0.05 ? '#aa7744' : '#8a6a3e';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.8, r * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye dot
    ctx.fillStyle = charge > 0.5 ? '#ff5533' : '#cc3322';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Elevation hint: ground turrets get a base tick, hanging ones a top tick
    ctx.strokeStyle = '#665544';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (t.y3 > 1.5) { ctx.moveTo(cx, cy - r * 1.1); ctx.lineTo(cx, cy - r * 1.7); }
    else            { ctx.moveTo(cx, cy + r * 1.1); ctx.lineTo(cx, cy + r * 1.5); }
    ctx.stroke();

    // HP bar (only when damaged)
    if (t.hp < t.maxHp) {
      const bw = TS * 0.8, bh = 3;
      ctx.fillStyle = '#000000';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(cx - bw / 2 - 1, cy - r * 2.0 - 1, bw + 2, bh + 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#dd8833';
      ctx.fillRect(cx - bw / 2, cy - r * 2.0, bw * (t.hp / t.maxHp), bh);
    }

    ctx.restore();
  }
