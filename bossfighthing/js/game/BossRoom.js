// ══════════════════════════════════════════════════════════════════════════════
// BossRoom.js — VESPERA, THE BROODMOTHER
// ══════════════════════════════════════════════════════════════════════════════
// Full rework of the tutorial boss fight. Destiny-style encounter design:
//   • Every attack is telegraphed (windup animation + ground markers) before it hits
//   • 4 named phases with distinct mechanics, stagger transitions between them
//   • Phase 4 "Final Clutch": immunity-shield mechanic → break eggs → crit window
//   • Articulated, animated 3D boss (walking legs, mandibles, breathing, ceiling
//     flip, hit flashes, phase-reactive glow, death cinematic)
//   • Self-contained VFX (telegraph rings, particle bursts, volumetric web beams,
//     venom pools, arena set dressing) — all injected into the existing scene,
//     no Renderer3D changes required.
//
// PUBLIC INTERFACE IS UNCHANGED:
//   Turret(tx, ty, y3) / .update(dt, px, pz, bullets) / .takeDamage(amt)
//   SpiderBoss(tx, ty) / .update(dt, px, pz, bullets, bossRoom) / .takeDamage(amt)
//   BossRoom / .init(scene, modelConfig) / .update(dt, player, map, mode)
//            / .checkPlayerBullets(playerBullets, mode) / .isDefeated()
//   bullets: { tx, ty, y3, vx, vz, vy3, life, friendly }  (extra fields ignored
//   by renderers: grav, venom)
//   boss.webRays: { ox, oz, angle, len, life, maxLife } (+ charging flag)
//
// NEW DATA EXPOSED FOR THE (SIMPLIFIED) 2D RENDERER:
//   boss.telegraphs  → [{ x, z, radius, progress }]   ground danger markers
//   boss.venomPools  → [{ x, z, radius, life, maxLife }]
//   boss.stateLabel  → short string for optional HUD use
// ══════════════════════════════════════════════════════════════════════════════

// ── Utility ──────────────────────────────────────────────────────────────────
function _ptSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

const ENEMY_BULLET_SPEED   = 4.5;
const TURRET_FIRE_INTERVAL = 7.0;
const BOSS_CEIL_Y          = 3.5;

// Arena bounds (boss room is carved at x 2–23, z 1–16 in Tutorial.js)
const ARENA = { minX: 3.2, maxX: 22.8, minZ: 2.2, maxZ: 15.8, cx: 12.5, cz: 8.5 };

// Phase color language (used by glow light, markings, telegraphs)
const PHASE_COLORS = [0x000000, 0x7b4fff, 0xcc44ff, 0xff7722, 0xff2233];
const PHASE_NAMES  = ['', 'The Hunt', 'Web of the Deep', 'Ceiling Terror', 'The Final Clutch'];

// ══════════════════════════════════════════════════════════════════════════════
// VFX: pooled particle system (one THREE.Points object, zero per-frame allocs)
// ══════════════════════════════════════════════════════════════════════════════
class ParticleFX {
  constructor(scene, max = 240) {
    this.max = max;
    this.pos  = new Float32Array(max * 3);
    this.col  = new Float32Array(max * 3);
    this.vel  = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxL = new Float32Array(max);
    this.cursor = 0;

    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -100; // park offscreen

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color',    new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({
      size: 0.09, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(x, y, z, count, colorHex, speed = 2.2, up = 1.4) {
    const r = ((colorHex >> 16) & 255) / 255;
    const g = ((colorHex >> 8)  & 255) / 255;
    const b = ( colorHex        & 255) / 255;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.pos[i * 3]     = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3]     = Math.cos(a) * s;
      this.vel[i * 3 + 1] = Math.random() * up;
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.col[i * 3]     = r;
      this.col[i * 3 + 1] = g;
      this.col[i * 3 + 2] = b;
      this.life[i] = this.maxL[i] = 0.5 + Math.random() * 0.7;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.pos[i * 3]     += this.vel[i * 3]     * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 3.2 * dt;           // gravity
      if (this.pos[i * 3 + 1] < 0.02) {           // floor bounce-damp
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3 + 1] *= -0.3;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// VFX: pooled ground telegraph rings (Destiny-style danger markers)
// ══════════════════════════════════════════════════════════════════════════════
class TelegraphFX {
  constructor(scene, max = 12) {
    this.items = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1.0, 28);
    const discGeo = new THREE.CircleGeometry(0.82, 28);
    for (let i = 0; i < max; i++) {
      const mat  = new THREE.MeshBasicMaterial({
        color: 0xff3322, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xff3322, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      const fill = new THREE.Mesh(discGeo, fillMat);
      ring.rotation.x = fill.rotation.x = -Math.PI / 2;
      ring.position.y = 0.14; fill.position.y = 0.135;
      ring.visible = fill.visible = false;
      scene.add(ring); scene.add(fill);
      this.items.push({ ring, fill, active: false, t: 0, dur: 1, x: 0, z: 0, radius: 1, color: 0xff3322 });
    }
  }

  // Returns a handle; progress runs 0→1 over dur seconds, then auto-hides.
  spawn(x, z, radius, dur, color = 0xff3322) {
    const it = this.items.find(i => !i.active) || this.items[0];
    it.active = true; it.t = 0; it.dur = dur;
    it.x = x; it.z = z; it.radius = radius; it.color = color;
    it.ring.material.color.setHex(color);
    it.fill.material.color.setHex(color);
    it.ring.position.set(x, 0.14, z);
    it.fill.position.set(x, 0.135, z);
    it.ring.visible = it.fill.visible = true;
    return it;
  }

  cancel(it) { if (it) { it.active = false; it.ring.visible = it.fill.visible = false; } }

  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const p = Math.min(1, it.t / it.dur);
      const pulse = 0.65 + 0.35 * Math.sin(it.t * 14);
      it.ring.scale.setScalar(it.radius);
      it.ring.material.opacity = (0.55 + 0.3 * pulse) * (p < 1 ? 1 : 0);
      // Fill sweeps outward as the timer completes — readable "when it lands"
      it.fill.scale.setScalar(Math.max(0.001, it.radius * p));
      it.fill.material.opacity = 0.22 + 0.1 * pulse;
      if (it.t >= it.dur + 0.12) this.cancel(it);
    }
  }

  // Mirror data for the 2D renderer
  snapshot(out) {
    out.length = 0;
    for (const it of this.items) {
      if (!it.active) continue;
      out.push({ x: it.x, z: it.z, radius: it.radius, progress: Math.min(1, it.t / it.dur) });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// VFX: pooled volumetric web-ray beams (the thin Renderer3D lines become the
// bright core; these cylinders give the beams body, charge state, and pulse)
// ══════════════════════════════════════════════════════════════════════════════
class BeamFX {
  constructor(scene, max = 16) {
    this.items = [];
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9933ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.items.push(m);
    }
    this._up  = new THREE.Vector3(0, 1, 0);
    this._dir = new THREE.Vector3();
  }

  // Lay beams along boss.webRays each frame
  update(rays, originY, time) {
    let n = 0;
    for (const r of rays) {
      if (n >= this.items.length || r.life <= 0) continue;
      const m = this.items[n++];
      const ex = r.ox + Math.cos(r.angle) * r.len;
      const ez = r.oz + Math.sin(r.angle) * r.len;
      const mx = (r.ox + ex) / 2, mz = (r.oz + ez) / 2;
      m.position.set(mx, originY, mz);
      this._dir.set(Math.cos(r.angle), 0, Math.sin(r.angle));
      m.quaternion.setFromUnitVectors(this._up, this._dir);
      const fade = Math.min(1, r.life / r.maxLife);
      if (r.charging) {
        const radius = 0.025 + 0.02 * Math.sin(time * 22);
        m.scale.set(radius, r.len, radius);
        m.material.opacity = 0.3;
        m.material.color.setHex(0xddaaff);
      } else {
        const radius = 0.085 + 0.025 * Math.sin(time * 9 + r.angle * 3);
        m.scale.set(radius, r.len, radius);
        m.material.opacity = 0.55 * fade + 0.15;
        m.material.color.setHex(0x9933ff);
      }
      m.visible = true;
    }
    for (let i = n; i < this.items.length; i++) this.items[i].visible = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// VFX: pooled venom pools (Phase 2+ area denial)
// ══════════════════════════════════════════════════════════════════════════════
class VenomPoolFX {
  constructor(scene, max = 8) {
    this.items = [];
    const geo = new THREE.CircleGeometry(1, 22);
    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x66ff33, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.125;
      m.visible = false;
      scene.add(m);
      this.items.push({ mesh: m, active: false, x: 0, z: 0, radius: 1, life: 0, maxLife: 1, tick: 0 });
    }
  }

  spawn(x, z, radius, dur) {
    const it = this.items.find(i => !i.active) || this.items[0];
    it.active = true; it.x = x; it.z = z; it.radius = radius;
    it.life = it.maxLife = dur; it.tick = 0;
    it.mesh.position.set(x, 0.125, z);
    it.mesh.visible = true;
    return it;
  }

  update(dt, player, time) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.life -= dt;
      if (it.life <= 0) { it.active = false; it.mesh.visible = false; continue; }
      const grow = Math.min(1, (it.maxLife - it.life) / 0.3);
      it.mesh.scale.setScalar(it.radius * grow);
      it.mesh.material.opacity =
        (0.3 + 0.12 * Math.sin(time * 6 + it.x)) * Math.min(1, it.life / 1.0);
      // Damage + slow while standing in the pool
      const dx = player.x3 - it.x, dz = player.z3 - it.z;
      if (dx * dx + dz * dz < it.radius * it.radius && player.y3 < 0.4) {
        player.webSlowTimer = Math.max(player.webSlowTimer || 0, 0.3);
        it.tick -= dt;
        if (it.tick <= 0) { it.tick = 0.8; player.takeDamage(1); }
      } else {
        it.tick = 0;
      }
    }
  }

  snapshot(out) {
    out.length = 0;
    for (const it of this.items) {
      if (!it.active) continue;
      out.push({ x: it.x, z: it.z, radius: it.radius, life: it.life, maxLife: it.maxLife });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Turret — same combat behavior; upgraded mesh (pulsing core, sway) + death pop
// ══════════════════════════════════════════════════════════════════════════════
class Turret {
  constructor(tx, ty, y3Elevation) {
    this.tx = tx + 0.5;
    this.ty = ty + 0.5;
    this.y3 = y3Elevation;
    this.hp = 50; this.maxHp = 50;
    this.fireTimer   = TURRET_FIRE_INTERVAL * 0.5;
    this.dead        = false;
    this.invincTimer = 0;
    this.mesh        = null;
    this._coreMat    = null;   // pulsing inner glow
    this._swaySeed   = Math.random() * 10;
    this.justDied    = false;  // consumed by BossRoom for death FX
  }

  update(dt, playerX3, playerZ3, bullets) {
    if (this.mesh) this.mesh.visible = !this.dead;
    if (this.dead) return;
    if (this.invincTimer > 0) this.invincTimer -= dt;

    if (this.mesh) {
      const t = performance.now() / 1000;
      this.mesh.rotation.y = Math.atan2(playerX3 - this.tx, playerZ3 - this.ty);
      this.mesh.rotation.z = Math.sin(t * 1.1 + this._swaySeed) * 0.05; // gentle hang-sway
      this.mesh.position.y = this.y3 + Math.sin(t * 0.9 + this._swaySeed) * 0.04;
      if (this._coreMat) {
        // Glow ramps up as it approaches firing — readable danger cue
        const charge = 1 - Math.min(1, this.fireTimer / 1.2);
        this._coreMat.emissive.setHex(0xaa1100);
        this._coreMat.emissiveIntensity = 0.4 + charge * 1.6;
      }
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = TURRET_FIRE_INTERVAL;
      const dx = playerX3 - this.tx, dz = playerZ3 - this.ty;
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        bullets.push({
          tx: this.tx, ty: this.ty, y3: this.y3,
          vx: (dx / len) * ENEMY_BULLET_SPEED,
          vz: (dz / len) * ENEMY_BULLET_SPEED,
          vy3: 0, life: 9.0, friendly: false,
        });
      }
    }
  }

  takeDamage(amt) {
    if (this.invincTimer > 0 || this.dead) return;
    this.hp -= amt;
    this.invincTimer = 0.15;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.justDied = true; }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SpiderBoss — VESPERA, THE BROODMOTHER
// ══════════════════════════════════════════════════════════════════════════════
//
// Encounter script:
//   PHASE 1  (100–75%)  "The Hunt"        patrol fire · spread nova · pounce
//   PHASE 2  ( 75–50%)  "Web of the Deep" + rotating web sweep · venom artillery
//                                          · rapid fire
//   PHASE 3  ( 50–25%)  "Ceiling Terror"  + ceiling crawl with telegraphed
//                                          venom rain · faster pounces
//   PHASE 4  ( 25–0%)   "The Final Clutch" egg-shield immunity → destroy both
//                                          eggs → 6s VULNERABLE crit window (2×
//                                          damage) → enraged attacks
//   Each phase boundary triggers a STAGGER: Vespera collapses, shakes, then
//   detonates a telegraphed radial nova. Death plays a 2.4s cinematic (legs
//   curl, body rolls, eruption of particles) before the chest spawns.
//
class SpiderBoss {
  constructor(tx, ty) {
    this.x3 = tx + 0.5;
    this.z3 = ty + 0.5;
    this.y3 = 0;
    this.targetY3 = 0;

    this.hp = 300; this.maxHp = 300;
    this.dead  = false;       // true only after the death cinematic completes
    this.dying = false;
    this.invincTimer = 0;

    this.yaw = 0;
    this.targetYaw = 0;

    this.onCeiling = false;
    this._flipT    = 0;       // 0 = floor stance, 1 = upside-down ceiling stance

    // Web rays: { ox, oz, angle, len, life, maxLife, charging, spin }
    this.webRays = [];

    // Shield / vulnerability
    this.isShielded    = false;
    this.shieldTurret  = null;   // kept for compatibility (first egg)
    this.shieldTurrets = [];
    this.vulnTimer     = 0;      // > 0 → crit window, takes 2× damage

    // State machine
    this.attackMode    = 'patrol';
    this.pendingAttack = null;
    this.windupTimer   = 0;
    this.attackTimer   = 4.0;
    this.fireTimer     = 1.8;
    this.subTimer      = 0;
    this.subCount      = 0;
    this._lastPhase    = 1;
    this._shieldUsed   = false;
    this._rainTimer    = 0;

    // Pounce
    this._pounce = null;   // { sx, sz, txp, tzp, t, dur, marker }

    // Animation state
    this._animT      = 0;
    this._walkT      = 0;
    this._moveAmt    = 0;        // 0..1 smoothed "is moving"
    this._mandibleT  = 0;        // 0 closed → 1 open
    this._hitFlash   = 0;
    this._deathT     = 0;
    this._staggerT   = 0;

    this.waypoints = [
      { x: 6.5,  z: 5.5 }, { x: 18.5, z: 5.5 },
      { x: 18.5, z: 11.5 }, { x: 6.5, z: 11.5 },
    ];
    this.waypointIdx = 0;

    // Exposed for the 2D renderer
    this.telegraphs = [];
    this.venomPools = [];
    this.stateLabel = PHASE_NAMES[1];

    // Mesh handles (filled by BossRoom._buildMeshes)
    this.mesh        = null;
    this._shieldMesh = null;
    this._anim       = null;  // { flip, body, legs[], mandL, mandR, eyeMats, markMats, bodyMats, light, spinneret }
  }

  get phase() {
    const r = this.hp / this.maxHp;
    return r > 0.75 ? 1 : r > 0.50 ? 2 : r > 0.25 ? 3 : 4;
  }

  get speed() { return [0, 1.8, 2.4, 3.0, 3.8][this.phase]; }

  // ── Attack selection ────────────────────────────────────────────────────────
  _pickNextAttack() {
    const p = this.phase;
    const pool = ['patrol', 'spread_burst', 'pounce'];
    if (p >= 2) pool.push('web_sweep', 'venom_lob', 'rapid_fire');
    if (p >= 3) pool.push('ceiling_crawl', 'pounce', 'venom_lob');
    if (p >= 4 && !this._shieldUsed) return 'egg_shield';
    if (p >= 4) pool.push('rapid_fire', 'spread_burst');

    let pick, tries = 0;
    do {
      pick = pool[Math.floor(Math.random() * pool.length)];
    } while (pick === this.attackMode && pool.length > 1 && ++tries < 8);
    return pick;
  }

  _attackDuration(mode) {
    const p = this.phase;
    const scale = Math.max(0.7, 1.0 - (p - 1) * 0.08);
    return ({
      patrol: 4.0, spread_burst: 3.2, rapid_fire: 2.8, web_sweep: 7.0,
      venom_lob: 2.4, pounce: 2.0, ceiling_crawl: 7.5, egg_shield: 9999,
      stagger: 1.8, vulnerable: 6.0,
    }[mode] || 4.0) * (mode === 'web_sweep' || mode === 'stagger' || mode === 'vulnerable' ? 1 : scale);
  }

  _windupFor(mode) {
    return ({
      spread_burst: 0.8, rapid_fire: 0.5, web_sweep: 0.9,
      venom_lob: 0.7, pounce: 0.9, ceiling_crawl: 0.6,
    }[mode] || 0);
  }

  // ── Main update ─────────────────────────────────────────────────────────────
  update(dt, px, pz, bullets, bossRoom) {
    const fx = bossRoom ? bossRoom.fx : null;

    // Death cinematic
    if (this.dying && !this.dead) {
      this._updateDeath(dt, fx);
      return;
    }
    if (this.mesh) this.mesh.visible = !this.dead;
    if (this.dead) return;

    if (this.invincTimer > 0) this.invincTimer -= dt;
    if (this.vulnTimer   > 0) this.vulnTimer   -= dt;
    if (this._hitFlash   > 0) this._hitFlash   -= dt;

    this._animT += dt;

    // ── Phase transition → stagger nova ──────────────────────────────────────
    const p = this.phase;
    if (p > this._lastPhase && this.attackMode !== 'stagger') {
      this._lastPhase = p;
      this._enterStagger(bossRoom);
      if (fx) fx.particles.burst(this.x3, this.y3 + 0.5, this.z3, 40, PHASE_COLORS[p], 3.0);
      this.stateLabel = PHASE_NAMES[p];
    }

    // Web ray decay + rotation (web_sweep spins its rays)
    this.webRays.forEach(r => {
      r.life -= dt;
      if (r.charging && r.chargeT !== undefined) {
        r.chargeT -= dt;
        if (r.chargeT <= 0) r.charging = false;
      }
      if (r.spin) r.angle += r.spin * dt;
      r.ox = this.x3; r.oz = this.z3;   // beams track the boss
    });
    this.webRays = this.webRays.filter(r => r.life > 0);

    // Ceiling Y lerp + flip blend
    this.y3 += (this.targetY3 - this.y3) * Math.min(1, dt * 2.5);
    const flipTarget = this.onCeiling ? 1 : 0;
    this._flipT += (flipTarget - this._flipT) * Math.min(1, dt * 3.0);

    // Smooth yaw
    let yd = ((this.targetYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.yaw += yd * Math.min(1, dt * 5.5);

    if (this._shieldMesh) this._shieldMesh.visible = this.isShielded;

    // Shield resolves when ALL eggs die → crit window
    if (this.isShielded && this.shieldTurrets.length &&
        this.shieldTurrets.every(t => t.dead)) {
      this.isShielded   = false;
      this.shieldTurret = null;
      this.shieldTurrets = [];
      this._enterVulnerable(fx);
    }
    if (this.attackMode === 'egg_shield' && !this.isShielded) this.attackTimer = 0;

    // ── State machine ─────────────────────────────────────────────────────────
    if (this.windupTimer > 0) {
      // WINDUP: stand still, face the player, mandibles open, telegraph runs
      this.windupTimer -= dt;
      this.targetYaw = Math.atan2(px - this.x3, pz - this.z3);
      this._mandibleT = Math.min(1, this._mandibleT + dt * 5);
      if (this.windupTimer <= 0 && this.pendingAttack) {
        this.attackMode    = this.pendingAttack;
        this.pendingAttack = null;
        this.attackTimer   = this._attackDuration(this.attackMode);
        this.subTimer = 0; this.subCount = 0;
        if (this.attackMode === 'pounce') this._launchPounce(px, pz, bossRoom);
      }
    } else {
      this._mandibleT = Math.max(0, this._mandibleT - dt * 3);
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && this.attackMode !== 'egg_shield') {
        const next = this._pickNextAttack();
        const wind = this._windupFor(next);
        // Leaving the ceiling
        if (this.attackMode === 'ceiling_crawl' && next !== 'ceiling_crawl') {
          this.onCeiling = false; this.targetY3 = 0;
        }
        if (wind > 0) {
          this.pendingAttack = next;
          this.windupTimer   = wind;
          this._spawnWindupTelegraph(next, px, pz, bossRoom);
        } else {
          this.attackMode  = next;
          this.attackTimer = this._attackDuration(next);
          this.subTimer = 0; this.subCount = 0;
        }
      }

      switch (this.attackMode) {
        case 'patrol':        this._doPatrol(dt, px, pz, bullets); break;
        case 'spread_burst':  this._doSpreadBurst(dt, px, pz, bullets); break;
        case 'rapid_fire':    this._doRapidFire(dt, px, pz, bullets); break;
        case 'web_sweep':     this._doWebSweep(dt); break;
        case 'venom_lob':     this._doVenomLob(dt, px, pz, bullets, bossRoom); break;
        case 'pounce':        this._doPounce(dt, px, pz, bullets, bossRoom); break;
        case 'ceiling_crawl': this._doCeilingCrawl(dt, px, pz, bullets, bossRoom); break;
        case 'egg_shield':    this._doEggShield(dt, bossRoom); break;
        case 'stagger':       this._doStagger(dt, bullets, bossRoom); break;
        case 'vulnerable':    this._doVulnerable(dt, px, pz); break;
      }
    }

    this._clampToArena();
    if (this.mesh) this.mesh.position.set(this.x3, this.y3, this.z3);
    this._animate(dt);
  }

  _clampToArena() {
    this.x3 = Math.max(ARENA.minX, Math.min(ARENA.maxX, this.x3));
    this.z3 = Math.max(ARENA.minZ, Math.min(ARENA.maxZ, this.z3));
  }

  // ── Movement helper ─────────────────────────────────────────────────────────
  _stepWaypoint(dt, faceMovement) {
    const wp = this.waypoints[this.waypointIdx];
    const dx = wp.x - this.x3, dz = wp.z - this.z3;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) {
      this.waypointIdx = (this.waypointIdx + 1) % this.waypoints.length;
      return;
    }
    const spd = this.speed;
    this.x3 += (dx / dist) * spd * dt;
    this.z3 += (dz / dist) * spd * dt;
    this._moveAmt = Math.min(1, this._moveAmt + dt * 4);
    if (faceMovement) this.targetYaw = Math.atan2(dx, dz);
  }

  // ── Telegraphs for windups ──────────────────────────────────────────────────
  _spawnWindupTelegraph(mode, px, pz, bossRoom) {
    if (!bossRoom || !bossRoom.fx) return;
    const tg = bossRoom.fx.telegraphs;
    const wind = this._windupFor(mode);
    if (mode === 'spread_burst') {
      tg.spawn(this.x3, this.z3, 2.6, wind + 0.4, PHASE_COLORS[this.phase]);
    } else if (mode === 'pounce') {
      // Lock onto where the player IS — dodging during windup escapes it
      this._pounceTarget = { x: px, z: pz };
      this._pounceMarker = tg.spawn(px, pz, 1.5, wind + 0.6, 0xff3322);
    } else if (mode === 'web_sweep') {
      tg.spawn(this.x3, this.z3, 1.8, wind, 0xaa55ff);
    } else if (mode === 'venom_lob') {
      // Markers spawn per-lob in _doVenomLob (they track landing spots)
    }
  }

  // ── Attacks ─────────────────────────────────────────────────────────────────
  _shootAt(px, pz, bullets, speedMult = 1.0, yOff = 0.3, vy3 = 0) {
    const dx = px - this.x3, dz = pz - this.z3;
    const len = Math.hypot(dx, dz);
    if (len <= 0) return;
    this.targetYaw = Math.atan2(dx, dz);
    bullets.push({
      tx: this.x3, ty: this.z3, y3: this.y3 + yOff,
      vx: (dx / len) * ENEMY_BULLET_SPEED * speedMult,
      vz: (dz / len) * ENEMY_BULLET_SPEED * speedMult,
      vy3, life: 7.0, friendly: false,
    });
  }

  _doPatrol(dt, px, pz, bullets) {
    this._stepWaypoint(dt, true);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = Math.max(0.55, 1.8 - (this.phase - 1) * 0.35);
      if (Math.random() < 0.3) {
        for (let i = 0; i < 3; i++) setTimeout(() => this._shootAt(px, pz, bullets), i * 120);
      } else {
        this._shootAt(px, pz, bullets);
      }
    }
  }

  _doSpreadBurst(dt, px, pz, bullets) {
    this.targetYaw = Math.atan2(px - this.x3, pz - this.z3);
    this._moveAmt = Math.max(0, this._moveAmt - dt * 4);
    this.subTimer -= dt;
    if (this.subTimer <= 0 && this.subCount < 3) {
      this.subTimer = 0.7;
      this.subCount++;
      const n = Math.min(12, 8 + (this.phase - 1) * 2);
      const baseAngle = this.subCount * (Math.PI / 8);
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 + baseAngle;
        bullets.push({
          tx: this.x3, ty: this.z3, y3: this.y3 + 0.3,
          vx: Math.cos(angle) * ENEMY_BULLET_SPEED * 1.2,
          vz: Math.sin(angle) * ENEMY_BULLET_SPEED * 1.2,
          vy3: 0, life: 3.5, friendly: false,
        });
      }
    }
  }

  _doRapidFire(dt, px, pz, bullets) {
    this._stepWaypoint(dt, false);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = Math.max(0.24, 0.38 - Math.max(0, this.phase - 2) * 0.05);
      const dx = px - this.x3, dz = pz - this.z3;
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        this.targetYaw = Math.atan2(dx, dz);
        for (let s = -1; s <= 1; s++) {
          const angle = Math.atan2(dx, dz) + s * 0.15;
          bullets.push({
            tx: this.x3, ty: this.z3, y3: this.y3 + 0.3,
            vx: Math.sin(angle) * ENEMY_BULLET_SPEED * 1.3,
            vz: Math.cos(angle) * ENEMY_BULLET_SPEED * 1.3,
            vy3: 0, life: 4.0, friendly: false,
          });
        }
      }
    }
  }

  // Rotating beams: 1s harmless charge (thin), then they sweep the arena
  _doWebSweep(dt) {
    this._moveAmt = Math.max(0, this._moveAmt - dt * 4);
    if (this.subCount === 0) {
      this.subCount = 1;
      const n = this.phase >= 4 ? 4 : 3;
      const spin = (0.45 + this.phase * 0.06) * (Math.random() < 0.5 ? 1 : -1);
      for (let i = 0; i < n; i++) {
        this.webRays.push({
          ox: this.x3, oz: this.z3,
          angle: (i / n) * Math.PI * 2,
          len: 8.5,
          life: 7.0, maxLife: 7.0,
          charging: true, chargeT: 1.0,
          spin,
        });
      }
    }
  }

  // Lobbed venom: telegraphed landing zones become lingering damage pools
  _doVenomLob(dt, px, pz, bullets, bossRoom) {
    this.targetYaw = Math.atan2(px - this.x3, pz - this.z3);
    this._moveAmt = Math.max(0, this._moveAmt - dt * 4);
    this.subTimer -= dt;
    const lobMax = 2 + Math.min(2, this.phase - 1);
    if (this.subTimer <= 0 && this.subCount < lobMax) {
      this.subTimer = 0.55;
      this.subCount++;
      // Aim at player with scatter
      const sc = this.subCount === 1 ? 0 : 1.8;
      const lx = Math.max(ARENA.minX, Math.min(ARENA.maxX, px + (Math.random() - 0.5) * 2 * sc));
      const lz = Math.max(ARENA.minZ, Math.min(ARENA.maxZ, pz + (Math.random() - 0.5) * 2 * sc));
      const flight = 1.1;
      const grav = -8.0;
      const y0 = this.y3 + 0.5;
      // Solve vy so the lob lands (y=0.1) at t=flight
      const vy = (0.1 - y0 - 0.5 * grav * flight * flight) / flight;
      bullets.push({
        tx: this.x3, ty: this.z3, y3: y0,
        vx: (lx - this.x3) / flight,
        vz: (lz - this.z3) / flight,
        vy3: vy, grav, venom: true,
        life: flight + 0.4, friendly: false,
      });
      if (bossRoom && bossRoom.fx) {
        bossRoom.fx.telegraphs.spawn(lx, lz, 1.15, flight, 0x66ff33);
      }
    }
  }

  // Leap onto the locked target, land with a radial shockwave
  _launchPounce(px, pz, bossRoom) {
    const tgt = this._pounceTarget || { x: px, z: pz };
    this._pounce = {
      sx: this.x3, sz: this.z3,
      txp: Math.max(ARENA.minX, Math.min(ARENA.maxX, tgt.x)),
      tzp: Math.max(ARENA.minZ, Math.min(ARENA.maxZ, tgt.z)),
      t: 0, dur: 0.55,
    };
    this.attackTimer = this._pounce.dur + 0.7;  // hold a beat after landing
  }

  _doPounce(dt, px, pz, bullets, bossRoom) {
    const pn = this._pounce;
    if (!pn) return;   // landed — hold the pose until attackTimer expires
    if (pn.t < pn.dur) {
      pn.t += dt;
      const k = Math.min(1, pn.t / pn.dur);
      this.x3 = pn.sx + (pn.txp - pn.sx) * k;
      this.z3 = pn.sz + (pn.tzp - pn.sz) * k;
      this.y3 = Math.sin(k * Math.PI) * 1.7;       // leap arc
      this.targetYaw = Math.atan2(pn.txp - pn.sx, pn.tzp - pn.sz);
      this._moveAmt = 1;
      if (k >= 1) this._pounceLand(px, pz, bullets, bossRoom);
    }
  }

  _pounceLand(px, pz, bullets, bossRoom) {
    this.y3 = 0; this.targetY3 = 0;
    const n = 12 + this.phase * 2;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      bullets.push({
        tx: this.x3, ty: this.z3, y3: 0.3,
        vx: Math.cos(angle) * ENEMY_BULLET_SPEED * 1.05,
        vz: Math.sin(angle) * ENEMY_BULLET_SPEED * 1.05,
        vy3: 0, life: 2.2, friendly: false,
      });
    }
    if (bossRoom) {
      const player = bossRoom._playerRef;
      if (player) {
        const dx = player.x3 - this.x3, dz = player.z3 - this.z3;
        if (dx * dx + dz * dz < 1.45) player.takeDamage(2);   // direct slam hit
      }
      if (bossRoom.fx) {
        bossRoom.fx.particles.burst(this.x3, 0.3, this.z3, 30, PHASE_COLORS[this.phase], 3.4, 2.0);
        bossRoom.fx.telegraphs.spawn(this.x3, this.z3, 2.0, 0.35, 0xffffff);
      }
    }
    this._pounce = null;
  }

  // On the ceiling: drops fall with floor markers showing exactly where
  _doCeilingCrawl(dt, px, pz, bullets, bossRoom) {
    if (!this.onCeiling) { this.onCeiling = true; this.targetY3 = BOSS_CEIL_Y; }
    this.targetYaw = Math.atan2(px - this.x3, pz - this.z3);
    this._stepWaypoint(dt, false);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = Math.max(0.5, 1.1 - Math.max(0, this.phase - 3) * 0.2);
      const dx = px - this.x3, dz = pz - this.z3;
      const dist = Math.hypot(dx, dz);
      const spd = ENEMY_BULLET_SPEED * 0.9;
      if (dist > 0) {
        const vx = (dx / dist) * spd * 0.3;
        const vz = (dz / dist) * spd * 0.3;
        const vy = -spd * 0.95;
        bullets.push({
          tx: this.x3, ty: this.z3, y3: this.y3,
          vx, vz, vy3: vy, life: 5.0, friendly: false,
        });
        // Floor marker exactly where the drop lands, timed to the fall
        if (bossRoom && bossRoom.fx) {
          const tFall = this.y3 / -vy;
          bossRoom.fx.telegraphs.spawn(
            this.x3 + vx * tFall, this.z3 + vz * tFall, 0.55, tFall, 0xff7722);
        }
      }
    }
  }

  // PHASE 4 mechanic: immune behind a shield; two eggs anchor it
  _doEggShield(dt, bossRoom) {
    if (!this.isShielded && this.shieldTurrets.length === 0) {
      this._shieldUsed = true;
      const baseA = Math.random() * Math.PI * 2;
      const eggs = [];
      for (let i = 0; i < 2; i++) {
        const a = baseA + i * Math.PI;
        const ex = Math.round(this.x3 + Math.cos(a) * 3.5) - 1;
        const ez = Math.round(this.z3 + Math.sin(a) * 3.5) - 1;
        const t = bossRoom ? bossRoom._spawnShieldTurret(
          Math.max(4, Math.min(21, ex)), Math.max(3, Math.min(14, ez))) : null;
        if (t) eggs.push(t);
      }
      if (eggs.length) {
        this.shieldTurrets = eggs;
        this.shieldTurret  = eggs[0];
        this.isShielded    = true;
        this.stateLabel    = 'SHIELDED — destroy the eggs!';
      } else {
        this.attackTimer = 0;
      }
    }
    // Slow drift toward arena center while shielded
    const dx = ARENA.cx - this.x3, dz = ARENA.cz - this.z3;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) { this.x3 += (dx / d) * 0.8 * dt; this.z3 += (dz / d) * 0.8 * dt; }
  }

  _enterStagger(bossRoom) {
    this.attackMode  = 'stagger';
    this.pendingAttack = null;
    this.windupTimer = 0;
    this.attackTimer = this._attackDuration('stagger');
    this._staggerT   = 0;
    this.subCount    = 0;
    this.onCeiling   = false; this.targetY3 = 0;
    this.webRays.length = 0;
    this._pounce = null;
    if (bossRoom && bossRoom.fx) {
      bossRoom.fx.telegraphs.spawn(this.x3, this.z3, 3.2, 1.3, PHASE_COLORS[this.phase]);
    }
  }

  _doStagger(dt, bullets, bossRoom) {
    this._staggerT += dt;
    this._moveAmt = 0;
    // Detonation at 1.3s: dense radial nova
    if (this._staggerT >= 1.3 && this.subCount === 0) {
      this.subCount = 1;
      const n = 18;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 + 0.15;
        bullets.push({
          tx: this.x3, ty: this.z3, y3: 0.3,
          vx: Math.cos(angle) * ENEMY_BULLET_SPEED * 0.9,
          vz: Math.sin(angle) * ENEMY_BULLET_SPEED * 0.9,
          vy3: 0, life: 3.0, friendly: false,
        });
      }
      if (bossRoom && bossRoom.fx) {
        bossRoom.fx.particles.burst(this.x3, 0.5, this.z3, 50, PHASE_COLORS[this.phase], 4.0, 2.2);
      }
    }
  }

  _enterVulnerable(fx) {
    this.attackMode  = 'vulnerable';
    this.pendingAttack = null;
    this.windupTimer = 0;
    this.attackTimer = this._attackDuration('vulnerable');
    this.vulnTimer   = this._attackDuration('vulnerable');
    this.stateLabel  = 'VULNERABLE — 2× damage!';
    if (fx) fx.particles.burst(this.x3, this.y3 + 0.5, this.z3, 36, 0xffffff, 2.6);
  }

  _doVulnerable(dt, px, pz) {
    // Dazed slow crawl away from the player — free damage window
    const dx = this.x3 - px, dz = this.z3 - pz;
    const d = Math.hypot(dx, dz);
    if (d > 0.01 && d < 6) {
      this.x3 += (dx / d) * 0.9 * dt;
      this.z3 += (dz / d) * 0.9 * dt;
      this._moveAmt = Math.min(1, this._moveAmt + dt * 2);
    } else {
      this._moveAmt = Math.max(0, this._moveAmt - dt * 3);
    }
    if (this.attackTimer <= dt) this.stateLabel = PHASE_NAMES[this.phase];
  }

  // ── Damage ──────────────────────────────────────────────────────────────────
  takeDamage(amt) {
    if (this.invincTimer > 0 || this.dead || this.dying || this.isShielded) return;
    const mult = this.vulnTimer > 0 ? 2 : 1;
    this.hp -= amt * mult;
    this.invincTimer = 0.1;
    this._hitFlash = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = true;
      this._deathT = 0;
      this.webRays.length = 0;
      this.stateLabel = '';
    }
  }

  // ── Death cinematic ────────────────────────────────────────────────────────
  _updateDeath(dt, fx) {
    this._deathT += dt;
    const T = this._deathT;
    const a = this._anim;
    if (a) {
      // Legs spasm, then curl inward; body rolls and sinks
      const curl = Math.min(1, T / 1.4);
      const spasm = Math.max(0, 1 - T / 0.8) * Math.sin(T * 30) * 0.25;
      a.legs.forEach((leg, i) => {
        leg.root.rotation.z = curl * (0.9 + (i % 3) * 0.15) + spasm;
        leg.knee.rotation.z = -curl * 1.4;
      });
      a.flip.rotation.z = Math.min(Math.PI * 0.9, T * 1.6);
      a.flip.position.y = -Math.min(0.18, T * 0.12);
      a.eyeMats.forEach(m => { m.emissiveIntensity = Math.max(0, 1 - T); });
      if (a.light) a.light.intensity = Math.max(0, 2.2 - T * 1.5);
      if (fx && T < 1.6 && Math.random() < 0.4) {
        fx.particles.burst(
          this.x3 + (Math.random() - 0.5), 0.4 + Math.random() * 0.5,
          this.z3 + (Math.random() - 0.5), 6, 0x9933ff, 1.8);
      }
    }
    if (T >= 2.4) {
      if (fx) fx.particles.burst(this.x3, 0.5, this.z3, 70, 0xbb77ff, 4.5, 2.6);
      this.dead = true;
      if (this.mesh) this.mesh.visible = false;
    }
  }

  // ── Per-frame mesh animation ───────────────────────────────────────────────
  _animate(dt) {
    const a = this._anim;
    if (!a) return;
    const t = this._animT;
    const p = this.phase;

    this.mesh.rotation.y = this.yaw;

    // Movement decay when no _stepWaypoint ran this frame
    this._moveAmt = Math.max(0, this._moveAmt - dt * 1.5);
    this._walkT += dt * (3.5 + this.speed * 2.2) * (0.25 + this._moveAmt * 0.75);

    // Ceiling flip (roll upside down) — blended
    a.flip.rotation.z = this._flipT * Math.PI;
    a.flip.position.y = 0;

    // Breathing: abdomen pulse, faster + deeper per phase
    const breath = Math.sin(t * (1.6 + p * 0.5)) * (0.03 + p * 0.012);
    a.body.scale.set(1 + breath, 1 - breath * 0.6, 1 + breath);
    a.body.position.y = Math.sin(t * 2.1) * 0.02 + this._moveAmt * Math.abs(Math.sin(this._walkT * 2)) * 0.03;

    // Walking legs: alternating tripod-ish gait
    a.legs.forEach((leg, i) => {
      const ph = (i % 2) * Math.PI + i * 0.4;
      const swing = Math.sin(this._walkT + ph);
      const lift  = Math.max(0, Math.sin(this._walkT + ph + Math.PI / 2));
      leg.root.rotation.y = leg.baseYaw + swing * 0.22 * this._moveAmt;
      leg.root.rotation.z = lift * 0.28 * this._moveAmt
                          + Math.sin(t * 1.3 + i) * 0.03;          // idle ripple
      leg.knee.rotation.z = -lift * 0.35 * this._moveAmt;
    });

    // Mandibles: open during windups / while shielded
    const mOpen = Math.max(this._mandibleT, this.isShielded ? 0.6 : 0);
    a.mandL.rotation.y =  0.15 + mOpen * 0.7;
    a.mandR.rotation.y = -0.15 - mOpen * 0.7;

    // Phase-reactive glow: markings, eyes, attached light
    const col = PHASE_COLORS[p];
    a.markMats.forEach(m => {
      m.emissive.setHex(col);
      m.emissiveIntensity = 0.7 + 0.4 * Math.sin(t * (2 + p)) + (this.vulnTimer > 0 ? 1.2 : 0);
    });
    a.eyeMats.forEach(m => {
      m.emissiveIntensity = 1.0 + (p - 1) * 0.4 + 0.3 * Math.sin(t * 6);
      if (this.vulnTimer > 0) m.emissive.setHex(0xffffff);
      else m.emissive.setHex(0xaa1100);
    });
    if (a.light) {
      a.light.color.setHex(this.vulnTimer > 0 ? 0xffffff : col);
      a.light.intensity = 1.4 + p * 0.4
        + (this._hitFlash > 0 ? 3.0 : 0)
        + (this.attackMode === 'stagger' ? Math.sin(t * 20) * 1.0 : 0);
    }

    // Hit flash: body emissive pops white
    const flash = this._hitFlash > 0 ? 1 : 0;
    a.bodyMats.forEach(m => {
      m.emissive.setHex(flash ? 0x884466 : 0x050008);
    });

    // Spinneret glow during web attacks
    if (a.spinneret) {
      const webbing = (this.attackMode === 'web_sweep' || this.attackMode === 'venom_lob') ? 1 : 0;
      a.spinneret.material.emissiveIntensity = 0.2 + webbing * (1.2 + Math.sin(t * 12) * 0.5);
    }

    // Stagger shake
    if (this.attackMode === 'stagger') {
      this.mesh.position.x = this.x3 + Math.sin(t * 37) * 0.05;
      this.mesh.position.z = this.z3 + Math.cos(t * 31) * 0.05;
      a.flip.rotation.x = Math.sin(t * 23) * 0.07;
    } else {
      a.flip.rotation.x = 0;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BossRoom — orchestration, mesh construction, arena set dressing, VFX
// ══════════════════════════════════════════════════════════════════════════════
class BossRoom {
  constructor() {
    this.turrets = [];
    this.boss    = null;
    this.bullets = [];
    this.active  = false;
    this._scene  = null;
    this._turretMats = null;
    this._playerRef  = null;
    this.fx = null;   // { particles, telegraphs, beams, venomPools }
    this._time = 0;
  }

  init(scene, modelConfig = {}) {
    this._scene = scene;
    this.turrets = [
      new Turret(6,  3, 3.0),
      new Turret(20, 13, 3.0),
    ];
    this.boss = new SpiderBoss(11, 7);

    this.fx = {
      particles:  new ParticleFX(scene, 240),
      telegraphs: new TelegraphFX(scene, 12),
      beams:      new BeamFX(scene, 16),
      venomPools: new VenomPoolFX(scene, 8),
    };

    this._buildMeshes(scene, modelConfig);
    this._buildArenaDressing(scene);
    this.active = true;
  }

  _spawnShieldTurret(tx, ty) {
    const t = new Turret(tx, ty, 0.5);
    t.hp = 35; t.maxHp = 35;
    if (this._turretMats && this._scene) {
      this._buildSingleTurretMesh(t, this._scene, this._turretMats);
    }
    this.turrets.push(t);
    return t;
  }

  // ── Turret mesh: egg sac + strands + pulsing core ──────────────────────────
  _buildSingleTurretMesh(t, scene, mats) {
    const { turretMat, strandMat, eyeMatT } = mats;
    const group = new THREE.Group();

    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.30, 10, 8), turretMat);
    egg.scale.set(1, 1.45, 1);
    group.add(egg);

    // Inner pulsing core (visible through translucent ribs)
    const coreMat = new THREE.MeshLambertMaterial({
      color: 0xff5533, emissive: 0xaa1100, emissiveIntensity: 0.6 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), coreMat);
    core.scale.set(1, 1.3, 1);
    group.add(core);
    t._coreMat = coreMat;

    // Web ribs wrapping the egg
    const ribMat = new THREE.MeshLambertMaterial({ color: 0xddccbb, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.012, 4, 14), ribMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = -0.16 + i * 0.16;
      rib.scale.setScalar(1 - Math.abs(i - 1) * 0.18);
      group.add(rib);
    }

    const strandGeo = new THREE.CylinderGeometry(0.015, 0.006, 0.55, 4);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const s = new THREE.Mesh(strandGeo, strandMat);
      s.position.set(Math.cos(a) * 0.22, -0.22, Math.sin(a) * 0.22);
      s.rotation.z = Math.cos(a) * 0.48;
      s.rotation.x = Math.sin(a) * 0.48;
      group.add(s);
    }

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), eyeMatT);
    eye.position.set(0, 0.12, -0.26);
    group.add(eye);

    group.position.set(t.tx, t.y3, t.ty);
    scene.add(group);
    t.mesh = group;
  }

  // ── Boss mesh: fully articulated Vespera ────────────────────────────────────
  _buildMeshes(scene, cfg = {}) {
    const turretMat = new THREE.MeshLambertMaterial({ color: cfg.turretBodyColor   || 0x886644, emissive: 0x1a0800 });
    const strandMat = new THREE.MeshLambertMaterial({ color: cfg.turretStrandColor || 0x665544 });
    const eyeMatT   = new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xaa1100 });
    this._turretMats = { turretMat, strandMat, eyeMatT };
    this.turrets.forEach(t => this._buildSingleTurretMesh(t, scene, this._turretMats));

    const bossBodyColor = cfg.bossBodyColor || 0x1a0a2a;
    const bossLegColor  = cfg.bossLegColor  || 0x2a1440;
    const bossScale     = cfg.bossScale     || 1.0;

    const bossGroup = new THREE.Group();       // world position + yaw
    const flipGroup = new THREE.Group();       // ceiling flip / stagger tilt / death roll
    bossGroup.add(flipGroup);

    const bodyGroup = new THREE.Group();       // breathing pulse
    flipGroup.add(bodyGroup);

    const bodyMat  = new THREE.MeshLambertMaterial({ color: bossBodyColor, emissive: 0x050008 });
    const bodyMat2 = new THREE.MeshLambertMaterial({ color: bossBodyColor, emissive: 0x050008 });
    const eyeMat   = new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0x880000, emissiveIntensity: 1.0 });
    const legMat   = new THREE.MeshLambertMaterial({ color: bossLegColor });
    const jointMat = new THREE.MeshLambertMaterial({ color: bossLegColor, emissive: 0x0a0414 });
    const markMat  = new THREE.MeshLambertMaterial({ color: 0x331155, emissive: 0x7b4fff, emissiveIntensity: 0.7 });

    // Abdomen — big, segmented look via stacked spheres
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.40, 14, 11), bodyMat);
    abdomen.scale.set(1.0, 0.74, 1.2);
    abdomen.position.set(0, 0.30, 0.24);
    abdomen.castShadow = true;
    bodyGroup.add(abdomen);

    const abdomen2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bodyMat2);
    abdomen2.scale.set(1.0, 0.8, 1.0);
    abdomen2.position.set(0, 0.27, 0.62);
    bodyGroup.add(abdomen2);

    // Cephalothorax + plated brow
    const cephalo = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 9), bodyMat);
    cephalo.position.set(0, 0.27, -0.22);
    cephalo.castShadow = true;
    bodyGroup.add(cephalo);

    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 7), bodyMat2);
    brow.scale.set(1.15, 0.5, 0.9);
    brow.position.set(0, 0.40, -0.24);
    bodyGroup.add(brow);

    // Glowing dorsal markings (phase-reactive) — hourglass cluster on abdomen
    const markMats = [];
    [[0, 0.56, 0.18, 0.085], [0, 0.55, 0.34, 0.06], [-0.1, 0.52, 0.26, 0.05],
     [0.1, 0.52, 0.26, 0.05], [0, 0.50, 0.50, 0.045]].forEach(([x, y, z, r]) => {
      const m = markMat.clone();
      markMats.push(m);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), m);
      dot.position.set(x, y, z);
      bodyGroup.add(dot);
    });

    // 8 eyes, two arcs
    const eyeMats = [];
    const eyeGeo = new THREE.SphereGeometry(0.046, 6, 5);
    const eyeGeoSm = new THREE.SphereGeometry(0.028, 6, 5);
    [[-0.10, 0.37, -0.40], [0.10, 0.37, -0.40],
     [-0.06, 0.32, -0.45], [0.06, 0.32, -0.45]].forEach(([x, y, z], i) => {
      const m = eyeMat.clone();
      eyeMats.push(m);
      const e = new THREE.Mesh(i < 2 ? eyeGeo : eyeGeoSm, m);
      e.position.set(x, y, z);
      bodyGroup.add(e);
    });
    [[-0.16, 0.40, -0.34], [0.16, 0.40, -0.34],
     [-0.20, 0.34, -0.28], [0.20, 0.34, -0.28]].forEach(([x, y, z]) => {
      const m = eyeMat.clone();
      eyeMats.push(m);
      const e = new THREE.Mesh(eyeGeoSm, m);
      e.position.set(x, y, z);
      bodyGroup.add(e);
    });

    // Mandibles — pivot groups so they can open during windups
    const mandGeo = new THREE.ConeGeometry(0.05, 0.22, 6);
    const mandL = new THREE.Group(); mandL.position.set(-0.08, 0.16, -0.38);
    const mandR = new THREE.Group(); mandR.position.set( 0.08, 0.16, -0.38);
    const fangL = new THREE.Mesh(mandGeo, jointMat);
    const fangR = new THREE.Mesh(mandGeo, jointMat);
    fangL.rotation.x = fangR.rotation.x = Math.PI * 0.62;
    fangL.position.z = fangR.position.z = -0.09;
    fangL.position.y = fangR.position.y = -0.05;
    mandL.add(fangL); mandR.add(fangR);
    bodyGroup.add(mandL); bodyGroup.add(mandR);

    // Spinneret (glows during web attacks)
    const spinneretMat = new THREE.MeshLambertMaterial({
      color: 0x553388, emissive: 0x9933ff, emissiveIntensity: 0.2 });
    const spinneret = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 7), spinneretMat);
    spinneret.rotation.x = -Math.PI / 2;
    spinneret.position.set(0, 0.26, 0.74);
    bodyGroup.add(spinneret);

    // ── Articulated legs: hip root → femur → knee → tibia ─────────────────────
    const legs = [];
    const femLen = 0.50, tibLen = 0.56;
    const femGeo = new THREE.CylinderGeometry(0.034, 0.026, femLen, 5);
    const tibGeo = new THREE.CylinderGeometry(0.024, 0.008, tibLen, 5);
    const kneeGeo = new THREE.SphereGeometry(0.045, 6, 5);
    const legYaws = [0.45, 0.95, 2.19, 2.69, -0.45, -0.95, -2.19, -2.69];

    legYaws.forEach(baseYaw => {
      const root = new THREE.Group();
      // Hip sits on the cephalothorax/abdomen seam, ringed around the body
      root.position.set(Math.cos(baseYaw) * 0.18, 0.27, -Math.sin(baseYaw) * 0.18);
      root.rotation.y = baseYaw;
      flipGroup.add(root);

      // Femur: rises outward+up at 0.35 rad along local +X
      const femur = new THREE.Mesh(femGeo, legMat);
      femur.rotation.z = -(Math.PI / 2 - 0.35);
      femur.position.set(femLen / 2 * Math.cos(0.35), femLen / 2 * Math.sin(0.35), 0);
      femur.castShadow = true;
      root.add(femur);

      // Knee pivot at femur end
      const knee = new THREE.Group();
      knee.position.set(femLen * Math.cos(0.35), femLen * Math.sin(0.35), 0);
      root.add(knee);

      const kneeBall = new THREE.Mesh(kneeGeo, jointMat);
      knee.add(kneeBall);

      // Tibia: descends at 0.82 rad to the ground
      const tibia = new THREE.Mesh(tibGeo, legMat);
      tibia.rotation.z = -(Math.PI / 2 + 0.82);
      tibia.position.set(tibLen / 2 * Math.cos(0.82), -tibLen / 2 * Math.sin(0.82), 0);
      knee.add(tibia);

      legs.push({ root, knee, baseYaw });
    });

    // Shield bubble — hex-ish faceted sphere with fresnel-y double layer
    const shieldMat = new THREE.MeshLambertMaterial({
      color: 0x4455ff, emissive: 0x2233aa, transparent: true, opacity: 0.26, side: THREE.DoubleSide });
    const shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), shieldMat);
    shieldMesh.visible = false;
    flipGroup.add(shieldMesh);
    const shieldWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.97, 1),
      new THREE.MeshBasicMaterial({ color: 0x88aaff, wireframe: true, transparent: true, opacity: 0.3 }));
    shieldMesh.add(shieldWire);
    this.boss._shieldMesh = shieldMesh;

    // Attached glow light — the boss's presence lights the arena
    const bossLight = new THREE.PointLight(0x7b4fff, 1.8, 9);
    bossLight.position.set(0, 0.8, 0);
    flipGroup.add(bossLight);

    bossGroup.scale.setScalar(bossScale * 1.25);   // she's bigger now
    bossGroup.position.set(this.boss.x3, 0, this.boss.z3);
    scene.add(bossGroup);
    this.boss.mesh  = bossGroup;
    this.boss._anim = {
      flip: flipGroup, body: bodyGroup, legs,
      mandL, mandR, eyeMats, markMats,
      bodyMats: [bodyMat, bodyMat2],
      light: bossLight, spinneret,
    };
  }

  // ── Arena set dressing (boss room only: x 2–24, z 1–17) ─────────────────────
  _buildArenaDressing(scene) {
    const dress = new THREE.Group();

    // Web ceiling lattice at BOSS_CEIL_Y — makes the ceiling-crawl phase legible
    const linePts = [];
    for (let x = 3; x <= 23; x += 2.5) linePts.push(x, BOSS_CEIL_Y, 1.5, x, BOSS_CEIL_Y, 16.5);
    for (let z = 2; z <= 16; z += 2.5) linePts.push(2.5, BOSS_CEIL_Y, z, 23.5, BOSS_CEIL_Y, z);
    // Radial corner webs
    const corners = [[3.5, 2.5], [22.5, 2.5], [3.5, 15.5], [22.5, 15.5]];
    corners.forEach(([cx, cz]) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        linePts.push(cx, BOSS_CEIL_Y, cz,
                     cx + Math.cos(a) * 2.2, BOSS_CEIL_Y - 0.4, cz + Math.sin(a) * 2.2);
      }
    });
    const webGeo = new THREE.BufferGeometry();
    webGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePts), 3));
    const webLines = new THREE.LineSegments(webGeo,
      new THREE.LineBasicMaterial({ color: 0xbbaadd, transparent: true, opacity: 0.22 }));
    dress.add(webLines);

    // Faint translucent ceiling sheet
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(21, 15),
      new THREE.MeshLambertMaterial({
        color: 0x221133, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    sheet.rotation.x = Math.PI / 2;
    sheet.position.set(13, BOSS_CEIL_Y + 0.05, 9);
    dress.add(sheet);

    // Hanging silk strands
    const strandMat = new THREE.MeshLambertMaterial({ color: 0xccbbdd, transparent: true, opacity: 0.4 });
    for (let i = 0; i < 14; i++) {
      const len = 0.4 + Math.random() * 1.3;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, len, 3), strandMat);
      s.position.set(3.5 + Math.random() * 19, BOSS_CEIL_Y - len / 2, 2 + Math.random() * 13.5);
      dress.add(s);
    }

    // Egg-sac clusters in the corners (ambient menace)
    const sacMat = new THREE.MeshLambertMaterial({ color: 0x99876a, emissive: 0x140a00 });
    corners.forEach(([cx, cz]) => {
      for (let i = 0; i < 3; i++) {
        const r = 0.14 + Math.random() * 0.14;
        const sac = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), sacMat);
        sac.scale.y = 1.35;
        sac.position.set(cx + (Math.random() - 0.5) * 0.9, r * 1.3,
                         cz + (Math.random() - 0.5) * 0.9);
        dress.add(sac);
      }
    });

    // Two cold violet accent lights deepen the lair mood
    const l1 = new THREE.PointLight(0x5522aa, 1.1, 11);
    l1.position.set(5, 2.6, 4);
    const l2 = new THREE.PointLight(0x5522aa, 1.1, 11);
    l2.position.set(20, 2.6, 13);
    dress.add(l1); dress.add(l2);

    scene.add(dress);
  }

  // ── Frame update ─────────────────────────────────────────────────────────────
  update(dt, player, map, mode) {
    if (!this.active) return;
    this._time += dt;
    this._playerRef = player;

    this.turrets.forEach(t => t.update(dt, player.x3, player.z3, this.bullets));
    if (this.boss) this.boss.update(dt, player.x3, player.z3, this.bullets, this);

    // Turret death FX
    this.turrets.forEach(t => {
      if (t.justDied) {
        t.justDied = false;
        if (this.fx) this.fx.particles.burst(t.tx, t.y3, t.ty, 24, 0xffaa44, 2.4);
      }
    });

    // Web ray slow + mirrored VFX (charging beams are harmless)
    if (this.boss && !this.boss.dead && !this.boss.dying) {
      for (const r of this.boss.webRays) {
        if (r.charging) continue;
        const ex = r.ox + Math.cos(r.angle) * r.len;
        const ez = r.oz + Math.sin(r.angle) * r.len;
        if (_ptSegDist(player.x3, player.z3, r.ox, r.oz, ex, ez) < 0.45) {
          player.webSlowTimer = 0.5;
          break;
        }
      }
    }

    // VFX updates
    if (this.fx) {
      this.fx.particles.update(dt);
      this.fx.telegraphs.update(dt);
      this.fx.venomPools.update(dt, player, this._time);
      const rays = (this.boss && !this.boss.dead) ? this.boss.webRays : [];
      this.fx.beams.update(rays, this.boss ? this.boss.y3 + 0.5 : 0.5, this._time);
      if (this.boss) {
        this.fx.telegraphs.snapshot(this.boss.telegraphs);
        this.fx.venomPools.snapshot(this.boss.venomPools);
      }
    }

    // Move & collide enemy bullets (now with optional gravity + venom impact)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.grav) b.vy3 += b.grav * dt;
      b.tx   += b.vx  * dt;
      b.ty   += b.vz  * dt;
      b.y3   += b.vy3 * dt;
      b.life -= dt;

      // Venom lob touches down → spawn a pool
      if (b.venom && b.y3 <= 0.12) {
        if (this.fx) {
          this.fx.venomPools.spawn(b.tx, b.ty, 1.15, 6.0);
          this.fx.particles.burst(b.tx, 0.2, b.ty, 14, 0x66ff33, 1.8);
        }
        this.bullets.splice(i, 1);
        continue;
      }

      if (b.life <= 0 || !map.isWalkable(Math.floor(b.tx), Math.floor(b.ty))) {
        this.bullets.splice(i, 1);
        continue;
      }
      const dx = b.tx - player.x3, dz = b.ty - player.z3;
      const dy = b.y3 - (player.y3 + 0.75);
      const heightOk = (mode === '2d') || (Math.abs(dy) < 0.85);
      if (dx * dx + dz * dz < 0.22 && heightOk) {
        player.takeDamage(1);
        this.bullets.splice(i, 1);
      }
    }
  }

  checkPlayerBullets(playerBullets, mode) {
    // Turrets: 3D only
    if (mode === '3d') {
      this.turrets.forEach(turret => {
        if (turret.dead) return;
        for (let i = playerBullets.length - 1; i >= 0; i--) {
          const b  = playerBullets[i];
          const dx = b.tx - turret.tx, dz = b.ty - turret.ty;
          const dy = b.y3 - turret.y3;
          if (dx * dx + dz * dz < 0.5 && Math.abs(dy) < 0.9) {
            turret.takeDamage(25);
            playerBullets.splice(i, 1);
          }
        }
      });
    }

    // Boss
    if (this.boss && !this.boss.dead && !this.boss.dying) {
      for (let i = playerBullets.length - 1; i >= 0; i--) {
        const b  = playerBullets[i];
        const dx = b.tx - this.boss.x3, dz = b.ty - this.boss.z3;
        const dy = b.y3 - (this.boss.y3 + 0.3);
        const maxDy = this.boss.onCeiling ? 1.8 : 1.2;
        if (dx * dx + dz * dz < 0.7 && Math.abs(dy) < maxDy) {
          const wasShielded = this.boss.isShielded;
          this.boss.takeDamage(10);
          if (this.fx) {
            this.fx.particles.burst(b.tx, b.y3, b.ty, wasShielded ? 6 : 10,
              wasShielded ? 0x4488ff : 0xbb55ff, 1.8);
          }
          playerBullets.splice(i, 1);
        }
      }
    }
  }

  isDefeated() {
    return this.boss && this.boss.dead && this.turrets.every(t => t.dead);
  }
}
