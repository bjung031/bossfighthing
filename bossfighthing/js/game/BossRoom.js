// ── Utility ──────────────────────────────────────────────────────────────────
function _ptSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

const ENEMY_BULLET_SPEED  = 4.5;
const TURRET_FIRE_INTERVAL = 7.0;
const BOSS_CEIL_Y = 3.5;

// ── Turret ────────────────────────────────────────────────────────────────────
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
  }

  update(dt, playerX3, playerZ3, bullets) {
    if (this.mesh) this.mesh.visible = !this.dead;
    if (this.dead) return;
    if (this.invincTimer > 0) this.invincTimer -= dt;
    if (this.mesh) {
      this.mesh.rotation.y = Math.atan2(playerX3 - this.tx, playerZ3 - this.ty);
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
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }
}

// ── SpiderBoss ────────────────────────────────────────────────────────────────
class SpiderBoss {
  constructor(tx, ty) {
    this.x3  = tx + 0.5;
    this.z3  = ty + 0.5;
    this.y3  = 0;
    this.targetY3 = 0;

    this.hp    = 300; this.maxHp = 300;
    this.dead  = false;
    this.invincTimer = 0;

    // Smooth facing
    this.yaw       = 0;
    this.targetYaw = 0;

    // Ceiling crawl
    this.onCeiling = false;

    // Web rays: { ox, oz, angle, len, life, maxLife }
    this.webRays = [];

    // Egg shield
    this.isShielded   = false;
    this.shieldTurret = null;

    // Attack state machine
    this.attackMode  = 'patrol';
    this.attackTimer = 5.0;
    this.fireTimer   = 1.8;
    this.subTimer    = 0;
    this.subCount    = 0;

    this.waypoints = [
      { x: 6,  z: 6  },
      { x: 17, z: 6  },
      { x: 17, z: 11 },
      { x: 6,  z: 11 },
    ];
    this.waypointIdx = 0;

    this.mesh        = null;
    this._shieldMesh = null;
  }

  get phase() {
    const r = this.hp / this.maxHp;
    return r > 0.75 ? 1 : r > 0.50 ? 2 : r > 0.25 ? 3 : 4;
  }

  get speed() { return [0, 1.8, 2.4, 3.2, 4.2][this.phase]; }

  _pickNextAttack() {
    const p = this.phase;
    const pool = ['patrol', 'patrol', 'spread_burst', 'web_rays'];
    if (p >= 2) { pool.push('rapid_fire'); pool.push('spread_burst'); }
    if (p >= 3) { pool.push('ceiling_crawl'); pool.push('web_rays'); }
    if (p >= 4) { pool.push('egg_shield'); }

    let pick, tries = 0;
    do {
      pick = pool[Math.floor(Math.random() * pool.length)];
    } while (pick === this.attackMode && pool.length > 1 && ++tries < 8);
    return pick;
  }

  _attackDuration(mode) {
    if (mode === 'web_rays') return 15.0;
    const p = this.phase;
    const scale = Math.max(0.65, 1.0 - (p - 1) * 0.1);
    return ({ patrol: 4.5, spread_burst: 3.5, rapid_fire: 3.0, ceiling_crawl: 8.0, egg_shield: 9999 }[mode] || 4.0) * scale;
  }

  update(dt, px, pz, bullets, bossRoom) {
    if (this.mesh) this.mesh.visible = !this.dead;
    if (this.dead) return;
    if (this.invincTimer > 0) this.invincTimer -= dt;

    // Decay web rays
    this.webRays.forEach(r => { r.life -= dt; });
    this.webRays = this.webRays.filter(r => r.life > 0);

    // Ceiling Y lerp
    this.y3 += (this.targetY3 - this.y3) * Math.min(1, dt * 2.5);
    if (this.mesh) this.mesh.position.y = this.y3;

    // Smooth yaw rotation
    let yd = ((this.targetYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.yaw += yd * Math.min(1, dt * 5.5);
    if (this.mesh) this.mesh.rotation.y = this.yaw;

    if (this._shieldMesh) this._shieldMesh.visible = this.isShielded;

    // Shield turret died → unshield
    if (this.isShielded && this.shieldTurret && this.shieldTurret.dead) {
      this.isShielded = false;
      this.shieldTurret = null;
    }

    // Force mode switch when shield ends
    if (this.attackMode === 'egg_shield' && !this.isShielded) {
      this.attackTimer = 0;
    }

    // Advance attack mode
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.attackMode  = this._pickNextAttack();
      this.attackTimer = this._attackDuration(this.attackMode);
      this.subTimer = 0;
      this.subCount = 0;

      if (this.attackMode === 'ceiling_crawl') {
        this.targetY3  = BOSS_CEIL_Y;
        this.onCeiling = true;
      } else if (this.onCeiling) {
        this.targetY3  = 0;
        this.onCeiling = false;
      }

      const baseFire = { patrol: 1.8, rapid_fire: 0.35, ceiling_crawl: 1.2 };
      this.fireTimer = (baseFire[this.attackMode] || 999) * Math.max(0.5, 1 - (this.phase - 1) * 0.15);
    }

    switch (this.attackMode) {
      case 'patrol':        this._doPatrol(dt, px, pz, bullets);       break;
      case 'spread_burst':  this._doSpreadBurst(dt, px, pz, bullets);  break;
      case 'web_rays':      this._doWebRays(dt, px, pz);               break;
      case 'rapid_fire':    this._doRapidFire(dt, px, pz, bullets);    break;
      case 'ceiling_crawl': this._doCeilingCrawl(dt, px, pz, bullets); break;
      case 'egg_shield':    this._doEggShield(dt, bossRoom);           break;
    }
  }

  _stepWaypoint(dt, faceMovement) {
    const wp   = this.waypoints[this.waypointIdx];
    const dx   = wp.x - this.x3;
    const dz   = wp.z - this.z3;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) {
      this.waypointIdx = (this.waypointIdx + 1) % this.waypoints.length;
    } else {
      if (faceMovement) this.targetYaw = Math.atan2(dx, dz);
      const spd = this.speed * dt;
      this.x3 += (dx / dist) * spd;
      this.z3 += (dz / dist) * spd;
    }
    if (this.mesh) this.mesh.position.set(this.x3, this.y3, this.z3);
  }

  _shootAt(px, pz, bullets, speedMult = 1.0, vy3 = 0, yOff = 0.3) {
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
      const interval = Math.max(0.55, 1.8 - (this.phase - 1) * 0.35);
      this.fireTimer = interval;
      // Occasionally fire a burst of 3
      if (Math.random() < 0.3) {
        for (let i = 0; i < 3; i++) setTimeout(() => this._shootAt(px, pz, bullets), i * 120);
      } else {
        this._shootAt(px, pz, bullets);
      }
    }
  }

  _doSpreadBurst(dt, px, pz, bullets) {
    this.targetYaw = Math.atan2(px - this.x3, pz - this.z3);
    this.subTimer -= dt;
    if (this.subTimer <= 0 && this.subCount < 4) {
      this.subTimer = 0.65;
      this.subCount++;
      const n = 8 + (this.phase - 1) * 2;
      const baseAngle = this.subCount * (Math.PI / 8); // slight rotation per wave
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 + baseAngle;
        bullets.push({
          tx: this.x3, ty: this.z3, y3: this.y3 + 0.3,
          vx: Math.cos(angle) * ENEMY_BULLET_SPEED * 1.2,
          vz: Math.sin(angle) * ENEMY_BULLET_SPEED * 1.2,
          vy3: 0, life: 4.5, friendly: false,
        });
      }
    }
    if (this.mesh) this.mesh.position.set(this.x3, this.y3, this.z3);
  }

  _doWebRays(dt, px, pz) {
    if (this.subCount === 0) {
      this.subCount = 1;
      const n = 8 + this.phase * 2;
      const rot = (performance.now() / 1000) * 0.4;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 + rot;
        this.webRays.push({
          ox: this.x3, oz: this.z3,
          angle, len: 7 + this.phase,
          life: 10.0, maxLife: 10.0,
        });
      }
    }
    this._stepWaypoint(dt, false);
  }

  _doRapidFire(dt, px, pz, bullets) {
    this._stepWaypoint(dt, false);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = Math.max(0.22, 0.38 - (this.phase - 2) * 0.06);
      const dx = px - this.x3, dz = pz - this.z3;
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        this.targetYaw = Math.atan2(dx, dz);
        // 3 bullets in tight spread
        for (let s = -1; s <= 1; s++) {
          const angle = Math.atan2(dx, dz) + s * 0.15;
          bullets.push({
            tx: this.x3, ty: this.z3, y3: this.y3 + 0.3,
            vx: Math.sin(angle) * ENEMY_BULLET_SPEED * 1.3,
            vz: Math.cos(angle) * ENEMY_BULLET_SPEED * 1.3,
            vy3: 0, life: 5.5, friendly: false,
          });
        }
      }
    }
  }

  _doCeilingCrawl(dt, px, pz, bullets) {
    this.targetYaw = Math.atan2(px - this.x3, pz - this.z3);
    this._stepWaypoint(dt, false);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      const interval = Math.max(0.45, 1.2 - (this.phase - 3) * 0.25);
      this.fireTimer = interval;
      // Drop shots: mostly downward, slight horizontal aim
      const dx = px - this.x3, dz = pz - this.z3;
      const dist = Math.hypot(dx, dz);
      const spd = ENEMY_BULLET_SPEED * 0.9;
      if (dist > 0) {
        bullets.push({
          tx: this.x3, ty: this.z3, y3: this.y3,
          vx: (dx / dist) * spd * 0.3,
          vz: (dz / dist) * spd * 0.3,
          vy3: -spd * 0.95,
          life: 5.0, friendly: false,
        });
      }
    }
  }

  _doEggShield(dt, bossRoom) {
    if (!this.isShielded && !this.shieldTurret) {
      const angle  = Math.random() * Math.PI * 2;
      const spawnX = Math.round(this.x3 + Math.cos(angle) * 3.5) - 1;
      const spawnY = Math.round(this.z3 + Math.sin(angle) * 3.5) - 1;
      const t = bossRoom ? bossRoom._spawnShieldTurret(spawnX, spawnY) : null;
      if (t) {
        this.shieldTurret = t;
        this.isShielded   = true;
      } else {
        this.attackTimer = 0; // abort: can't spawn
      }
    }
    if (this.mesh) this.mesh.position.set(this.x3, this.y3, this.z3);
  }

  takeDamage(amt) {
    if (this.invincTimer > 0 || this.dead || this.isShielded) return;
    this.hp -= amt;
    this.invincTimer = 0.1;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }
}

// ── BossRoom ──────────────────────────────────────────────────────────────────
class BossRoom {
  constructor() {
    this.turrets = [];
    this.boss    = null;
    this.bullets = [];
    this.active  = false;
    this._scene  = null;
    this._turretMats = null;
  }

  init(scene, modelConfig = {}) {
    this._scene = scene;
    this.turrets = [
      new Turret(6,  3, 3.0),
      new Turret(20, 13, 3.0),
    ];
    this.boss = new SpiderBoss(11, 7);
    this._buildMeshes(scene, modelConfig);
    this.active = true;
  }

  _spawnShieldTurret(tx, ty) {
    const t = new Turret(tx, ty, 0.5);
    t.hp = 40; t.maxHp = 40;
    if (this._turretMats && this._scene) {
      this._buildSingleTurretMesh(t, this._scene, this._turretMats);
    }
    this.turrets.push(t);
    return t;
  }

  _buildSingleTurretMesh(t, scene, mats) {
    const { turretMat, strandMat, eyeMatT } = mats;
    const group = new THREE.Group();

    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.30, 8, 6), turretMat);
    egg.scale.set(1, 1.45, 1);
    group.add(egg);

    const strandGeo = new THREE.CylinderGeometry(0.015, 0.006, 0.55, 4);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const s = new THREE.Mesh(strandGeo, strandMat);
      s.position.set(Math.cos(a) * 0.22, -0.22, Math.sin(a) * 0.22);
      s.rotation.z = Math.cos(a) * 0.48;
      s.rotation.x = Math.sin(a) * 0.48;
      group.add(s);
    }

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), eyeMatT);
    eye.position.set(0, 0.12, -0.26);
    group.add(eye);

    group.position.set(t.tx, t.y3, t.ty);
    scene.add(group);
    t.mesh = group;
  }

  _buildMeshes(scene, cfg = {}) {
    const turretMat = new THREE.MeshLambertMaterial({ color: cfg.turretBodyColor   || 0x886644, emissive: 0x1a0800 });
    const strandMat = new THREE.MeshLambertMaterial({ color: cfg.turretStrandColor || 0x665544 });
    const eyeMatT   = new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xaa1100 });
    this._turretMats = { turretMat, strandMat, eyeMatT };

    this.turrets.forEach(t => this._buildSingleTurretMesh(t, scene, this._turretMats));

    // ── Boss mesh ──────────────────────────────────────────────────────────────
    const bossBodyColor = cfg.bossBodyColor || 0x1a0a2a;
    const bossLegColor  = cfg.bossLegColor  || 0x2a1440;
    const bossScale     = cfg.bossScale     || 1.0;

    const bossGroup = new THREE.Group();
    const bodyMat   = new THREE.MeshLambertMaterial({ color: bossBodyColor, emissive: 0x050008 });
    const eyeMat    = new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0x880000 });
    const legMat    = new THREE.MeshLambertMaterial({ color: bossLegColor });

    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 7), bodyMat);
    abdomen.scale.set(1.0, 0.72, 1.15);
    abdomen.position.set(0, 0.28, 0.20);
    bossGroup.add(abdomen);

    const cephalo = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), bodyMat);
    cephalo.position.set(0, 0.26, -0.22);
    bossGroup.add(cephalo);

    const eyeGeo = new THREE.SphereGeometry(0.044, 5, 4);
    [[-0.10, 0.37, -0.38], [0.10, 0.37, -0.38],
     [-0.06, 0.32, -0.44], [0.06, 0.32, -0.44]].forEach(([x, y, z]) => {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(x, y, z);
      bossGroup.add(e);
    });

    const upVec = new THREE.Vector3(0, 1, 0);
    const hipY = 0.26, tipY = 0.01;
    [
      [-0.26, -0.20, -0.82, -0.56], [-0.26, -0.06, -0.90, -0.14],
      [-0.26,  0.08, -0.90,  0.22], [-0.26,  0.20, -0.76,  0.54],
      [ 0.26, -0.20,  0.82, -0.56], [ 0.26, -0.06,  0.90, -0.14],
      [ 0.26,  0.08,  0.90,  0.22], [ 0.26,  0.20,  0.76,  0.54],
    ].forEach(([hx, hz, tx2, tz]) => {
      const dx = tx2 - hx, dy = tipY - hipY, dz = tz - hz;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const legM = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.01, len, 4), legMat);
      legM.position.set((hx + tx2) * 0.5, (hipY + tipY) * 0.5, (hz + tz) * 0.5);
      legM.quaternion.setFromUnitVectors(upVec, new THREE.Vector3(dx, dy, dz).normalize());
      bossGroup.add(legM);
    });

    // Shield sphere
    const shieldMat  = new THREE.MeshLambertMaterial({ color: 0x4455ff, emissive: 0x001144, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
    const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.88, 12, 8), shieldMat);
    shieldMesh.visible = false;
    bossGroup.add(shieldMesh);
    this.boss._shieldMesh = shieldMesh;

    bossGroup.scale.setScalar(bossScale);
    bossGroup.position.set(this.boss.x3, 0, this.boss.z3);
    scene.add(bossGroup);
    this.boss.mesh = bossGroup;
  }

  update(dt, player, map, mode) {
    if (!this.active) return;

    this.turrets.forEach(t => t.update(dt, player.x3, player.z3, this.bullets));
    if (this.boss) this.boss.update(dt, player.x3, player.z3, this.bullets, this);

    // Web ray slow
    if (this.boss && !this.boss.dead) {
      for (const r of this.boss.webRays) {
        const ex = r.ox + Math.cos(r.angle) * r.len;
        const ez = r.oz + Math.sin(r.angle) * r.len;
        if (_ptSegDist(player.x3, player.z3, r.ox, r.oz, ex, ez) < 0.45) {
          player.webSlowTimer = 0.5;
          break;
        }
      }
    }

    // Move & collide enemy bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.tx   += b.vx  * dt;
      b.ty   += b.vz  * dt;
      b.y3   += b.vy3 * dt;
      b.life -= dt;
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

    // Boss: height check always (ceiling forces 3D aim)
    if (this.boss && !this.boss.dead) {
      for (let i = playerBullets.length - 1; i >= 0; i--) {
        const b  = playerBullets[i];
        const dx = b.tx - this.boss.x3, dz = b.ty - this.boss.z3;
        const dy = b.y3 - (this.boss.y3 + 0.3);
        const maxDy = this.boss.onCeiling ? 1.8 : 1.2;
        if (dx * dx + dz * dz < 0.65 && Math.abs(dy) < maxDy) {
          this.boss.takeDamage(10);
          playerBullets.splice(i, 1);
        }
      }
    }
  }

  isDefeated() {
    return this.boss && this.boss.dead && this.turrets.every(t => t.dead);
  }
}
