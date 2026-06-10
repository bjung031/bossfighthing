const TILE_SIZE = 32;

const PLAYER_SPEED_PX  = 192;   // 2D pixels/s
const PLAYER_SPEED_3D  = 6.0;   // 3D tiles/s
const BULLET_SPEED_T   = 13.125; // tiles/s  (420px/s ÷ 32)
const BULLET_LIFE_S    = 1.5;   // seconds
const SHOOT_COOLDOWN_S = 0.20;
const GRAVITY          = 28.0;  // tiles/s²
const JUMP_VEL         = 10.5;  // tiles/s  (peaks ≈ 2 tiles, clears 0.6 pedestal)
const ANIM_PERIOD      = 0.13;  // seconds per anim step
const PLAYER_HW        = 0.28;  // half-width in tile units (0.28 avoids pedestal-edge clipping)
const MAX_PITCH        = 1.48;  // ≈ 85° pitch clamp
const SWING_DUR        = 0.35;  // seconds for one sword swing
const INVINC_S         = 0.6;   // invincibility frames after taking damage

class Player {
  constructor(spawnX, spawnY) {
    this.x  = spawnX * TILE_SIZE + TILE_SIZE / 2;
    this.y  = spawnY * TILE_SIZE + TILE_SIZE / 2;
    this.x3 = spawnX + 0.5;
    this.z3 = spawnY + 0.5;
    this.y3 = 0;
    this.vy3 = 0;
    this.onGround = true;

    this.yaw   = 0; // radians; 0 = north (-Z)
    this.pitch = 0; // radians; + = look up, - = look down

    this.hp    = 5;
    this.maxHp = 5;
    this.coins = 0;
    this.invincTimer = 0;

    this.equipped = { weapon: null, helmet: null, armor: null, emblem: null };
    this.backpack  = new Array(8).fill(null);

    this.facing    = 'down';
    this.isMoving  = false;
    this.animTimer = 0;
    this.animFrame = 0;

    // Tile-space bullets: { tx, ty, y3, vx, vz, vy3, life, friendly }
    this.bullets       = [];
    this.shootCooldown = 0;

    this.swingTimer    = 0;
    this.swingCooldown = 0;
    this.webSlowTimer  = 0;
  }

  initFromCharacter(charObj, gearIds) {
    const charDef = CHARACTERS.find(c => c.id === (charObj && charObj.id)) || CHARACTERS[0];
    this.maxHp = charDef.baseHp || 5;
    this.hp    = this.maxHp;
    if (gearIds) {
      for (const type of ['weapon', 'helmet', 'armor', 'emblem']) {
        const id = gearIds[type];
        if (!id) continue;
        const item = (GEAR_DATA[type] || []).find(g => g.id === id);
        if (item) this.equipped[type] = item;
      }
    }
  }

  getWeaponRange() {
    const w = this.equipped.weapon;
    return (w && w.range) ? w.range : 4;
  }

  getEvasion() {
    let total = 0;
    for (const item of Object.values(this.equipped)) {
      if (item && item.stats && item.stats.evasion) total += item.stats.evasion;
    }
    return total * 0.05;
  }

  addToBackpack(item) {
    for (let i = 0; i < this.backpack.length; i++) {
      if (!this.backpack[i]) { this.backpack[i] = item; return i; }
    }
    return -1;
  }

  useSlot(n) {
    const item = this.backpack[n];
    if (!item || item.type !== 'consumable') return false;
    if (item.effect && item.effect.heal) {
      if (this.hp >= this.maxHp) return false;
      this.hp = Math.min(this.maxHp, this.hp + item.effect.heal);
    }
    this.backpack[n] = null;
    return true;
  }

  usePotion() {
    for (let i = 0; i < this.backpack.length; i++) {
      const item = this.backpack[i];
      if (item && item.type === 'consumable' && item.effect && item.effect.heal) {
        return this.useSlot(i);
      }
    }
    return false;
  }

  update(keys, map, mode, dt, speedMult = 1.0) {
    if (mode === '2d') this._update2D(keys, map, dt, speedMult);
    else               this._update3D(keys, map, dt, speedMult);

    // Tile-space bullet movement
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.tx   += b.vx  * dt;
      b.ty   += b.vz  * dt;
      b.y3   += b.vy3 * dt;
      b.life -= dt;
      const hitWall    = !map.isWalkable(Math.floor(b.tx), Math.floor(b.ty));
      const outOfBound = b.y3 < -1 || b.y3 > 10;
      if (b.life <= 0 || hitWall || outOfBound) {
        this.bullets.splice(i, 1);
      }
    }

    if (this.shootCooldown > 0) this.shootCooldown  -= dt;
    if (this.swingTimer    > 0) this.swingTimer       = Math.max(0, this.swingTimer    - dt);
    if (this.swingCooldown > 0) this.swingCooldown    = Math.max(0, this.swingCooldown - dt);
    if (this.invincTimer   > 0) this.invincTimer      = Math.max(0, this.invincTimer   - dt);

    if (this.isMoving) {
      this.animTimer += dt;
      if (this.animTimer >= ANIM_PERIOD) { this.animTimer -= ANIM_PERIOD; this.animFrame ^= 1; }
    }
  }

  // ── 2D top-down ─────────────────────────────────────────────
  _update2D(keys, map, dt, speedMult) {
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup'])    dy = -1;
    if (keys['s'] || keys['arrowdown'])  dy =  1;
    if (keys['a'] || keys['arrowleft'])  dx = -1;
    if (keys['d'] || keys['arrowright']) dx =  1;

    this.isMoving = dx !== 0 || dy !== 0;
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
    if (dx !== 0) this.facing = dx > 0 ? 'right' : 'left';
    else if (dy !== 0) this.facing = dy > 0 ? 'down' : 'up';

    this._move2D(dx * PLAYER_SPEED_PX * dt * speedMult, dy * PLAYER_SPEED_PX * dt * speedMult, map);

    // Vertical physics — shared with 3D so position is preserved on transition
    if ((keys[' '] || keys['space']) && this.onGround) {
      this.vy3 = JUMP_VEL;
      this.onGround = false;
    }
    this.vy3 -= GRAVITY * dt;
    this.y3  += this.vy3 * dt;

    // Determine effective ground height under player footprint (mirrors 3D corner check)
    let groundY2D = 0;
    const hw2D = TILE_SIZE * 0.35;
    [[-hw2D, -hw2D], [hw2D, -hw2D], [-hw2D, hw2D], [hw2D, hw2D]].forEach(([ox, oy]) => {
      if (map.tileAt(Math.floor((this.x + ox) / TILE_SIZE),
                     Math.floor((this.y + oy) / TILE_SIZE)) === T.PEDESTAL) {
        groundY2D = PEDESTAL_HEIGHT;
      }
    });
    if (this.y3 <= groundY2D) { this.y3 = groundY2D; this.vy3 = 0; this.onGround = true; }
    else if (groundY2D === 0 && this.y3 > 0) { this.onGround = false; }

    this.x3 = this.x / TILE_SIZE;
    this.z3 = this.y / TILE_SIZE;
  }

  _move2D(dx, dy, map) {
    const hw  = TILE_SIZE * 0.35;
    const h3  = this.y3;

    // Pedestals passable only when airborne above pedestal height (jump over / land on top)
    const ok = (px, py) => {
      const tx   = Math.floor(px / TILE_SIZE);
      const ty   = Math.floor(py / TILE_SIZE);
      const tile = map.tileAt(tx, ty);
      if (tile === T.WALL || tile === T.EMPTY) return false;
      if (tile === T.PEDESTAL) return h3 >= PEDESTAL_HEIGHT;
      return true;
    };

    const nx = this.x + dx;
    if (ok(nx - hw, this.y - hw) && ok(nx + hw, this.y - hw) &&
        ok(nx - hw, this.y + hw) && ok(nx + hw, this.y + hw)) {
      this.x = nx;
    }
    const ny = this.y + dy;
    if (ok(this.x - hw, ny - hw) && ok(this.x + hw, ny - hw) &&
        ok(this.x - hw, ny + hw) && ok(this.x + hw, ny + hw)) {
      this.y = ny;
    }
  }

  // ── 3D first-person ─────────────────────────────────────────
  _update3D(keys, map, dt, speedMult) {
    const hmX =  Math.sin(this.yaw);
    const hmZ = -Math.cos(this.yaw);
    const rtX =  Math.cos(this.yaw);
    const rtZ =  Math.sin(this.yaw);

    let mx = 0, mz = 0;
    if (keys['w'] || keys['arrowup'])    { mx += hmX; mz += hmZ; }
    if (keys['s'] || keys['arrowdown'])  { mx -= hmX; mz -= hmZ; }
    if (keys['a'] || keys['arrowleft'])  { mx -= rtX; mz -= rtZ; }
    if (keys['d'] || keys['arrowright']) { mx += rtX; mz += rtZ; }

    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0) { mx /= len; mz /= len; }
    this.isMoving = len > 0;

    const step = PLAYER_SPEED_3D * dt * speedMult;

    const nx3 = this.x3 + mx * step;
    if (map.isWalkable3D(Math.floor(nx3 - PLAYER_HW), Math.floor(this.z3 - PLAYER_HW), this.y3) &&
        map.isWalkable3D(Math.floor(nx3 + PLAYER_HW), Math.floor(this.z3 - PLAYER_HW), this.y3) &&
        map.isWalkable3D(Math.floor(nx3 - PLAYER_HW), Math.floor(this.z3 + PLAYER_HW), this.y3) &&
        map.isWalkable3D(Math.floor(nx3 + PLAYER_HW), Math.floor(this.z3 + PLAYER_HW), this.y3)) {
      this.x3 = nx3;
    }
    const nz3 = this.z3 + mz * step;
    if (map.isWalkable3D(Math.floor(this.x3 - PLAYER_HW), Math.floor(nz3 - PLAYER_HW), this.y3) &&
        map.isWalkable3D(Math.floor(this.x3 + PLAYER_HW), Math.floor(nz3 - PLAYER_HW), this.y3) &&
        map.isWalkable3D(Math.floor(this.x3 - PLAYER_HW), Math.floor(nz3 + PLAYER_HW), this.y3) &&
        map.isWalkable3D(Math.floor(this.x3 + PLAYER_HW), Math.floor(nz3 + PLAYER_HW), this.y3)) {
      this.z3 = nz3;
    }

    if ((keys[' '] || keys['space']) && this.onGround) {
      this.vy3 = JUMP_VEL;
      this.onGround = false;
    }
    this.vy3 -= GRAVITY * dt;
    this.y3  += this.vy3 * dt;

    // Use the MAX ground height across all AABB corners so the player
    // stays elevated until fully clear of the pedestal edge (avoids stuck bug).
    let groundY = 0;
    [[-PLAYER_HW, -PLAYER_HW], [PLAYER_HW, -PLAYER_HW],
     [-PLAYER_HW,  PLAYER_HW], [PLAYER_HW,  PLAYER_HW]].forEach(([ox, oz]) => {
      if (map.tileAt(Math.floor(this.x3 + ox), Math.floor(this.z3 + oz)) === T.PEDESTAL)
        groundY = PEDESTAL_HEIGHT;
    });
    if (this.y3 <= groundY) {
      this.y3 = groundY; this.vy3 = 0; this.onGround = true;
    } else {
      this.onGround = false;
    }

    this.x = this.x3 * TILE_SIZE;
    this.y = this.z3 * TILE_SIZE;
  }

  // ── Actions ──────────────────────────────────────────────────
  swing() {
    if (this.swingCooldown > 0) return;
    this.swingTimer    = SWING_DUR;
    this.swingCooldown = 0.60;
  }

  // Shoot toward a 2D world-pixel target (also used in 3D for continuous fire)
  shoot(targetWorldPixelX, targetWorldPixelY) {
    if (this.shootCooldown > 0) return;
    const targetTX = targetWorldPixelX / TILE_SIZE;
    const targetTZ = targetWorldPixelY / TILE_SIZE;
    const angle = Math.atan2(targetTZ - this.z3, targetTX - this.x3);
    this.bullets.push({
      tx: this.x3, ty: this.z3, y3: this.y3 + 0.5,
      vx: Math.cos(angle) * BULLET_SPEED_T,
      vz: Math.sin(angle) * BULLET_SPEED_T,
      vy3: 0,
      life: this.getWeaponRange() / BULLET_SPEED_T, friendly: true,
    });
    this.shootCooldown = SHOOT_COOLDOWN_S;
  }

  // Shoot in the direction the player is looking (3D mode)
  shootDirection(yaw, pitch) {
    if (this.shootCooldown > 0) return;
    this.bullets.push({
      tx: this.x3, ty: this.z3, y3: this.y3 + 0.5,
      vx:  Math.sin(yaw) * Math.cos(pitch) * BULLET_SPEED_T,
      vz: -Math.cos(yaw) * Math.cos(pitch) * BULLET_SPEED_T,
      vy3: Math.sin(pitch) * BULLET_SPEED_T,
      life: this.getWeaponRange() / BULLET_SPEED_T, friendly: true,
    });
    this.shootCooldown = SHOOT_COOLDOWN_S;
    this.swing();
  }

  takeDamage(amount) {
    if (this.invincTimer > 0) return;
    if (Math.random() < this.getEvasion()) return;
    this.hp = Math.max(0, this.hp - amount);
    this.invincTimer = INVINC_S;
  }
}
