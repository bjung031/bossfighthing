// 2D top-down tile renderer (Realm of the Mad God style)
class TileRenderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this._initPalette();
  }

  _initPalette() {
    this.palette = {
      [T.WALL]:     '#1a1428',
      [T.FLOOR]:    '#2d2440',
      [T.DOOR]:     '#3d3460',
      [T.PEDESTAL]: '#5a4a80',
      [T.COIN]:     '#ffcc3c',
      [T.SIGN]:     '#3d5028',
      [T.WEB]:      '#1a1030',
    };
    this.wallTop  = '#100c1c';
    this.wallEdge = '#0a0810';
  }

  resize(w, h) {
    this.canvas.width  = w;
    this.canvas.height = h;
  }

  // camX/camY: world-pixel position of screen center
  // entities: optional { boss, turrets, bullets } from BossRoom
  render(map, player, camX, camY, entities) {
    const ctx    = this.ctx;
    const W      = this.canvas.width;
    const H      = this.canvas.height;
    const TS     = TILE_SIZE;

    ctx.clearRect(0, 0, W, H);

    const offX = W / 2 - camX;
    const offY = H / 2 - camY;

    const startTX = Math.floor((camX - W / 2) / TS) - 1;
    const endTX   = Math.ceil ((camX + W / 2) / TS) + 1;
    const startTY = Math.floor((camY - H / 2) / TS) - 1;
    const endTY   = Math.ceil ((camY + H / 2) / TS) + 1;

    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        const tile = map.tileAt(tx, ty);
        const sx   = tx * TS + offX;
        const sy   = ty * TS + offY;

        if (tile === T.WALL) {
          ctx.fillStyle = this.palette[T.WALL];
          ctx.fillRect(sx, sy, TS, TS);
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fillRect(sx, sy, TS, 3);
          ctx.fillRect(sx, sy, 3, TS);
        } else if (tile === T.WEB) {
          ctx.fillStyle = this.palette[T.WEB];
          ctx.fillRect(sx, sy, TS, TS);
          this._drawWebPattern(ctx, sx, sy, TS);
        } else {
          ctx.fillStyle = this.palette[tile] || '#2d2440';
          ctx.fillRect(sx, sy, TS, TS);

          ctx.strokeStyle = 'rgba(255,255,255,0.04)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(sx, sy, TS, TS);
        }

        if (tile === T.SIGN) {
          ctx.fillStyle = '#8bc34a';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', sx + TS / 2, sy + TS / 2);
        }

        if (tile === T.PEDESTAL) {
          ctx.fillStyle = '#2e2448';
          ctx.fillRect(sx, sy, TS, TS);
          ctx.fillStyle = '#4a3870';
          ctx.fillRect(sx + 3, sy + 3, TS - 6, TS - 6);
          ctx.fillStyle = 'rgba(200,180,255,0.25)';
          ctx.fillRect(sx + 3, sy + 3, TS - 6, 3);
          ctx.fillRect(sx + 3, sy + 3, 3, TS - 6);
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(sx + 3, sy + TS - 6, TS - 6, 3);
          ctx.fillRect(sx + TS - 6, sy + 3, 3, TS - 6);
          ctx.fillStyle = 'rgba(160,100,255,0.35)';
          const cx = sx + TS / 2, cy = sy + TS / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Coins
    map.objects.forEach(obj => {
      if (obj.type !== 'coin') return;
      const key = obj.tx + ',' + obj.ty;
      if (map.collectedCoins.has(key)) return;
      const sx = obj.tx * TS + offX + TS / 2;
      const sy = obj.ty * TS + offY + TS / 2;
      ctx.save();
      ctx.fillStyle = '#ffcc3c';
      ctx.shadowColor = '#ffcc3c';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();
      if (obj.pedestal) {
        ctx.fillStyle = 'rgba(100,80,200,0.5)';
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // Enemy bullets
    if (entities && entities.bullets && entities.bullets.length > 0) {
      ctx.save();
      ctx.fillStyle = '#ff44aa';
      ctx.shadowColor = '#ff00aa';
      ctx.shadowBlur = 8;
      entities.bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.tx * TS + offX, b.ty * TS + offY, 5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    // Player bullets (tile-space)
    ctx.save();
    ctx.fillStyle = '#ff8844';
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 8;
    player.bullets.forEach(b => {
      ctx.beginPath();
      ctx.arc(b.tx * TS + offX, b.ty * TS + offY, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Turret indicators
    if (entities && entities.turrets) {
      entities.turrets.forEach(t => this._drawTurret2D(ctx, t, offX, offY, TS, player));
    }

    // Chest
    if (entities && entities.chest) {
      this._drawChest2D(ctx, entities.chest, offX, offY, TS);
    }

    // Dropped bags
    if (entities && entities.droppedBags) {
      entities.droppedBags.forEach(bag => this._drawDroppedBag(ctx, bag, offX, offY, TS));
    }

    // Spider boss
    if (entities && entities.boss && !entities.boss.dead) {
      this._drawBoss2D(ctx, entities.boss, offX, offY, TS);
    }

    // Player sprite
    this._drawPlayerSprite(ctx, player, W / 2, H / 2);
  }

  _drawChest2D(ctx, chest, offX, offY, TS) {
    const cx = chest.tx * TS + offX;
    const cy = chest.ty * TS + offY;
    const w  = TS * 0.72, h = TS * 0.58;
    const tierColor = { bronze: '#a0622a', silver: '#999aaa', golden: '#d4a800' };
    const col = tierColor[chest.tier] || '#a0622a';

    ctx.save();

    // Body
    ctx.fillStyle = col;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);

    // Metal band
    ctx.fillStyle = '#444';
    ctx.fillRect(cx - w / 2, cy - h * 0.08, w, h * 0.16);

    // Lid shading
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h * 0.35);

    // Shadow edge
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(cx - w / 2, cy + h * 0.28, w, h * 0.22);

    // Lock
    ctx.fillStyle = '#ddaa22';
    ctx.beginPath();
    ctx.arc(cx, cy, TS * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // Open indicator
    if (chest.open) {
      ctx.strokeStyle = '#7b4fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - w / 2 - 2, cy - h / 2 - 2, w + 4, h + 4);
      // Floating item dots
      const t = performance.now() / 1000;
      chest.loot.forEach((item, i) => {
        if (!item) return;
        const rarityCol = { Common: '#aaaaaa', Uncommon: '#44cc44', Rare: '#4488ff', Legendary: '#ffaa00' };
        const dotCol = rarityCol[item.rarity] || '#aaaaaa';
        const angle = (i / chest.loot.length) * Math.PI * 2 + t;
        const r = TS * 0.55;
        const dx = cx + Math.cos(angle) * r;
        const dy = cy + Math.sin(angle) * r - Math.sin(t * 2.2 + i * 1.4) * 4;
        ctx.fillStyle = dotCol;
        ctx.shadowColor = dotCol;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(dx, dy, TS * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Item icon text
        ctx.font = `${Math.floor(TS * 0.28)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.icon, dx, dy);
      });
    }

    ctx.restore();
  }

  _drawWebPattern(ctx, sx, sy, TS) {
    const cx = sx + TS / 2, cy = sy + TS / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(180,170,220,0.28)';
    ctx.lineWidth = 0.5;
    // Radial spokes
    for (let d = 0; d < 4; d++) {
      const angle = (d / 4) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * TS * 0.5, cy + Math.sin(angle) * TS * 0.5);
      ctx.lineTo(cx - Math.cos(angle) * TS * 0.5, cy - Math.sin(angle) * TS * 0.5);
      ctx.stroke();
    }
    // Concentric rings
    for (let r = TS * 0.13; r < TS * 0.52; r += TS * 0.17) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawTurret2D(ctx, turret, offX, offY, TS, player) {
    if (turret.dead) return;
    const cx = turret.tx * TS + offX;
    const cy = turret.ty * TS + offY;
    const r  = Math.max(5, TS * 0.28);

    // Facing angle toward player (or straight up if no player)
    const angle = player
      ? Math.atan2(player.z3 - turret.ty, player.x3 - turret.tx)
      : -Math.PI / 2;
    const eggCX = cx;
    const eggCY = cy - r * 0.35;

    // Shadow on floor
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#441a00';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.2, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Egg body — rotated so the eye side faces the player
    ctx.save();
    ctx.translate(eggCX, eggCY);
    ctx.rotate(angle + Math.PI / 2); // egg is drawn along Y axis, rotate to face player
    ctx.fillStyle = '#775533';
    ctx.strokeStyle = '#aa8855';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.65, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Glowing eye on the front face
    ctx.fillStyle = '#ff2200';
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur  = 6;
    ctx.beginPath();
    ctx.arc(0, -r * 0.5, Math.max(2, r * 0.22), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Elevation label below
    ctx.fillStyle = '#ffcc88';
    ctx.font = `bold ${Math.max(8, Math.floor(TS * 0.33))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↑' + turret.y3.toFixed(0), cx, cy + r * 0.8);

    // HP bar
    const bw = r * 2, bh = Math.max(3, TS * 0.1);
    const bx = cx - bw / 2, by = cy - r * 1.55 - bh - 2;
    ctx.fillStyle = '#220000';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#ff4400';
    ctx.fillRect(bx, by, bw * (turret.hp / turret.maxHp), bh);
  }

  _drawBoss2D(ctx, boss, offX, offY, TS) {
    const cx = boss.x3 * TS + offX;
    const cy = boss.z3 * TS + offY;
    const r  = TS * 0.52;
    const t  = performance.now() / 1000;
    const phase = boss.phase || 1;

    // Web rays
    if (boss.webRays && boss.webRays.length > 0) {
      boss.webRays.forEach(ray => {
        if (ray.life <= 0) return;
        const alpha = Math.min(1, ray.life / ray.maxLife);
        const ox = ray.ox * TS + offX;
        const oz = ray.oz * TS + offY;
        const ex = ox + Math.cos(ray.angle) * ray.len * TS;
        const ez = oz + Math.sin(ray.angle) * ray.len * TS;
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = '#aa55ff';
        ctx.shadowColor = '#6622ff';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ox, oz);
        ctx.lineTo(ex, ez);
        ctx.stroke();
        ctx.restore();
      });
    }

    // Phase aura — grows with phase
    if (phase >= 2) {
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.08 * Math.sin(t * 5);
      const auraColors = ['', '', '#ff6600', '#ff2200', '#ff0000'];
      ctx.fillStyle = auraColors[phase] || '#ff2200';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * (1.4 + phase * 0.28), r * (1.1 + phase * 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Shield ring
    if (boss.isShielded) {
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.25 * Math.sin(t * 7);
      ctx.strokeStyle = '#4499ff';
      ctx.shadowColor = '#2266ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 8 legs
    ctx.save();
    ctx.strokeStyle = '#3a1840';
    ctx.lineWidth = Math.max(1.5, TS * 0.08);
    if (boss.onCeiling) ctx.globalAlpha = 0.45;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.65, cy + Math.sin(a) * r * 0.65);
      ctx.lineTo(cx + Math.cos(a) * r * 1.65, cy + Math.sin(a) * r * 1.65);
      ctx.stroke();
    }
    ctx.restore();

    // Body
    ctx.save();
    if (boss.onCeiling) ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#1a0a2a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.88, r * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a2060';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#ff2200';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 6;
    const eyeR = Math.max(2, r * 0.12);
    [[-0.3, -0.28], [0.3, -0.28], [-0.12, -0.12], [0.12, -0.12]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.arc(cx + ex * r, cy + ey * r, eyeR, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
    ctx.restore();

    // Ceiling indicator label
    if (boss.onCeiling) {
      ctx.save();
      ctx.fillStyle = '#cc99ff';
      ctx.font = `bold ${Math.max(8, Math.floor(TS * 0.27))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = '#7722ff';
      ctx.shadowBlur = 8;
      ctx.fillText('▲ CEILING — USE 3D', cx, cy + r * 1.05);
      ctx.restore();
    }

    // HP bar
    const bw = r * 2.2, bh = Math.max(4, TS * 0.13);
    const bx = cx - bw / 2;
    const by = cy - r * 1.35 - bh - 3;
    ctx.fillStyle = '#1a0000';
    ctx.fillRect(bx, by, bw, bh);
    const hpColor = phase >= 4 ? '#ff0000' : phase >= 3 ? '#ff6600' : phase >= 2 ? '#ff9900' : '#cc2200';
    ctx.fillStyle = hpColor;
    ctx.fillRect(bx, by, bw * (boss.hp / boss.maxHp), bh);
    ctx.strokeStyle = '#880000';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);

    // Phase label
    if (phase >= 2) {
      ctx.fillStyle = '#ffaa44';
      ctx.font = `bold ${Math.max(7, Math.floor(TS * 0.22))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('PHASE ' + phase, cx, by - 2);
    }
  }

  _drawDroppedBag(ctx, bag, offX, offY, TS) {
    const cx = (bag.tx + 0.5) * TS + offX;
    const cy = (bag.ty + 0.5) * TS + offY;
    const r  = TS * 0.22;
    const t  = performance.now() / 1000;
    ctx.save();
    ctx.fillStyle = '#8b6914';
    ctx.shadowColor = '#aa8822';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Bag icon
    ctx.fillStyle = '#e0c860';
    ctx.font = `${Math.floor(TS * 0.32)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💰', cx, cy - Math.sin(t * 2.5) * 2);
    ctx.restore();
  }

  _drawPlayerSprite(ctx, player, sx, sy) {
    const f      = player.animFrame;
    const facing = player.facing;
    const h      = player.y3;
    const rise   = h * 28;

    // Damage flash
    const flashAlpha = player.invincTimer > 0
      ? 0.6 * Math.abs(Math.sin(player.invincTimer * 20))
      : 0;

    if (h > 0.02) {
      const s = Math.max(0.35, 1 - h * 0.55);
      ctx.save();
      ctx.globalAlpha = 0.45 * s;
      ctx.fillStyle   = '#000';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 5, 14 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy - rise);

    if (flashAlpha > 0) {
      ctx.globalAlpha = 1 - flashAlpha;
    }

    ctx.fillStyle = '#c8a86a';
    ctx.fillRect(-4, -6, 8, 6);
    ctx.fillStyle = '#4466bb';
    ctx.fillRect(-5, 0, 10, 8);
    ctx.fillStyle = '#3355aa';
    ctx.fillRect(-5, 8, 4, 6);
    ctx.fillRect(1,  8, 4, 6);

    if (facing === 'left' || facing === 'right') {
      ctx.fillStyle = '#4466bb';
      const armOffset = f === 0 ? 2 : -2;
      ctx.fillRect(-8, armOffset, 3, 6);
      ctx.fillRect(5, -armOffset, 3, 6);
    } else {
      ctx.fillStyle = '#4466bb';
      ctx.fillRect(-8, 0, 3, 6);
      ctx.fillRect(5,  0, 3, 6);
    }

    ctx.fillStyle = '#ffffff';
    const dotOff = { up: [0,-9], down: [0,3], left: [-6,-2], right: [6,-2] };
    const [dx, dy] = dotOff[facing] || [0, 0];
    ctx.beginPath();
    ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#888888';
    if (facing === 'right') ctx.fillRect(9, -2, 10, 2);
    else if (facing === 'left') ctx.fillRect(-19, -2, 10, 2);
    else if (facing === 'up') ctx.fillRect(-1, -16, 2, 10);
    else ctx.fillRect(-1, 6, 2, 10);

    ctx.restore();
  }
}
