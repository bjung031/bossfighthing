// ──────────────────────────────────────────────────────────────────────────────
// Fighthing Level Editor
// ──────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Whenever new tile types or entity types are added to the game,
// they MUST be added here with proper section placement and 2D/3D rendering.
// ──────────────────────────────────────────────────────────────────────────────

const TOOL_SECTIONS = [
  {
    name: 'Tiles',
    tools: [
      { id: 'floor',    label: 'Floor',    color: '#2d2440', tile: T.FLOOR    },
      { id: 'wall',     label: 'Wall',     color: '#14101e', tile: T.WALL     },
      { id: 'door',     label: 'Door',     color: '#3d3460', tile: T.DOOR     },
      { id: 'pedestal', label: 'Pedestal', color: '#5a4a80', tile: T.PEDESTAL },
      { id: 'sign',     label: 'Sign',     color: '#3d5028', tile: T.SIGN     },
      { id: 'web',      label: 'Web',      color: '#1a1030', tile: T.WEB      },
    ],
  },
  {
    name: 'Entities',
    tools: [
      { id: 'coin',   label: 'Coin',    color: '#ffcc3c', tile: null },
      { id: 'spawn',  label: 'Spawn',   color: '#44bb44', tile: null },
      { id: 'turret', label: 'Turret',  color: '#883322', tile: null },
      { id: 'boss',   label: 'Boss',    color: '#6622aa', tile: null },
    ],
  },
  {
    name: 'Tools',
    tools: [
      { id: 'select', label: 'Select', color: '#334466', tile: null },
      { id: 'erase',  label: 'Erase',  color: '#44181e', tile: null },
    ],
  },
];

// Flat list for look-up by id
const TOOL_DEFS = TOOL_SECTIONS.flatMap(s => s.tools);

const ZOOM_STEPS = [6, 8, 10, 12, 14, 16, 20, 24, 32];

// ── Main editor class ─────────────────────────────────────────────────────────
class LevelEditor {
  constructor() {
    this.W = 26;
    this.H = 90;
    this.tiles   = [];
    this.coins   = {};  // "tx,ty" → { pedestal:bool }
    this.signs   = {};  // "tx,ty" → { text:string }
    this.entities= {};  // "tx,ty" → { type:'turret'|'boss', y3:number }
    this.spawnX  = 12;
    this.spawnY  = 83;

    this.tool       = 'floor';
    this.view       = '2d';
    this.zoomIdx    = 3;
    this.panX       = 0;
    this.panY       = 0;
    this.isPainting = false;
    this.isErasing  = false;
    this.hoverTx    = -1;
    this.hoverTy    = -1;
    this.pendingSign    = null;
    this.selectedObjKey = null;
    this.hierCollapsed  = false;
    this._clipboard     = null;

    this.fly = { x: 13, y: 2.5, z: 50, yaw: 0, pitch: -0.15, locked: false, keys: {} };
    this.flyLastTime = 0;
    this.flyRaf      = null;

    this.threeScene    = null;
    this.threeCamera   = null;
    this.threeRenderer = null;
    this.threeDirty    = true;

    this.canvas2d   = null;
    this.ctx2d      = null;
    this.canvas3dEl = null;
    this.statusEl   = null;
    this.zoomLabel  = null;
    this.signTextEl = null;
    this.propSection= null;
    this.entitySection = null;
    this.entityY3El = null;
    this.hierListEl   = null;
    this.inspSection  = null;
    this.inspTitleEl  = null;
    this.inspY3RowEl  = null;
    this.inspY3El     = null;
    this.inspColorEl  = null;
    this.inspAccentEl = null;
    this.inspScaleEl  = null;

    this._initTiles();
  }

  _initTiles() {
    this.tiles = Array.from({ length: this.H }, () => new Array(this.W).fill(T.WALL));
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  init() {
    this._buildUI();
    this._init2D();
    this._init3D();
    this._addListeners();
    this._rebuildHierarchy();
    this._renderLoop2D();
  }

  // ── UI construction ────────────────────────────────────────────────────────
  _buildUI() {
    const palette = document.getElementById('ed-palette');

    TOOL_SECTIONS.forEach(section => {
      // Section header
      const hdr = document.createElement('div');
      hdr.style.cssText = 'grid-column:1/-1; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:#554488; margin-top:6px; margin-bottom:2px; padding-left:2px;';
      hdr.textContent = section.name;
      palette.appendChild(hdr);

      // Tool buttons
      section.tools.forEach(def => {
        const btn = document.createElement('div');
        btn.className = 'ed-tool-btn' + (def.id === this.tool ? ' active' : '');
        btn.dataset.tool = def.id;
        const sw = document.createElement('div');
        sw.className = 'ed-tool-swatch';
        sw.style.background = def.color;
        btn.appendChild(sw);
        btn.appendChild(document.createTextNode(def.label));
        btn.addEventListener('click', () => this._selectTool(def.id));
        palette.appendChild(btn);
      });
    });

    this.signTextEl     = document.getElementById('ed-sign-text');
    this.propSection    = document.getElementById('ed-props-section');
    this.entitySection  = document.getElementById('ed-entity-section');
    this.entityY3El     = document.getElementById('ed-entity-y3');
    this.entityColorEl  = document.getElementById('ed-entity-color');
    this.entityAccentEl = document.getElementById('ed-entity-accent');
    this.entityScaleEl  = document.getElementById('ed-entity-scale');
    this.statusEl     = document.getElementById('ed-status');
    this.zoomLabel    = document.getElementById('ed-zoom-label');

    this.hierListEl   = document.getElementById('ed-hierarchy-list');
    this.inspSection  = document.getElementById('ed-inspector-section');
    this.inspTitleEl  = document.getElementById('ed-insp-title');
    this.inspY3RowEl  = document.getElementById('ed-insp-y3-row');
    this.inspY3El     = document.getElementById('ed-insp-y3');
    this.inspColorEl  = document.getElementById('ed-insp-color');
    this.inspAccentEl = document.getElementById('ed-insp-accent');
    this.inspScaleEl  = document.getElementById('ed-insp-scale');

    document.getElementById('ed-hier-collapse').addEventListener('click', () => {
      this.hierCollapsed = !this.hierCollapsed;
      document.getElementById('ed-hier-collapse').classList.toggle('collapsed', this.hierCollapsed);
      this.hierListEl.style.display = this.hierCollapsed ? 'none' : 'flex';
    });
    document.getElementById('ed-insp-apply' ).addEventListener('click', () => this._inspApply());
    document.getElementById('ed-insp-delete').addEventListener('click', () => this._inspDelete());

    document.getElementById('ed-view-toggle-btn').addEventListener('click', () => this._setView('2d'));
    document.getElementById('ed-view-toggle-3d' ).addEventListener('click', () => this._setView('3d'));

    document.getElementById('ed-zoom-in' ).addEventListener('click', () => this._zoom(1));
    document.getElementById('ed-zoom-out').addEventListener('click', () => this._zoom(-1));

    document.getElementById('ed-sign-save-btn').addEventListener('click', () => this._applySignText());
    document.getElementById('ed-resize-btn'   ).addEventListener('click', () => this._resizeMap());
    document.getElementById('ed-set-spawn-btn').addEventListener('click', () => this._setSpawn());
    document.getElementById('ed-save-btn'     ).addEventListener('click', () => this._saveJSON());
    document.getElementById('ed-load-btn'     ).addEventListener('click', () => document.getElementById('ed-file-input').click());
    document.getElementById('ed-file-input'   ).addEventListener('change', e => this._loadJSON(e));
    document.getElementById('ed-copy-btn'     ).addEventListener('click', () => this._copyCode());
    document.getElementById('ed-load-tut-btn' ).addEventListener('click', () => this._loadTutorial());
    document.getElementById('ed-new-btn'      ).addEventListener('click', () => this._newMap());

    this._updateZoomLabel();
  }

  _selectTool(id) {
    this.tool = id;
    document.querySelectorAll('.ed-tool-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tool === id));
    this.propSection.style.display  = (id === 'sign')   ? 'block' : 'none';
    this.entitySection.style.display= (id === 'turret' || id === 'boss') ? 'block' : 'none';
  }

  _setView(v) {
    this.view = v;
    const canvas2d   = document.getElementById('ed-canvas-2d');
    const canvas3dEl = document.getElementById('ed-canvas-3d');
    const hint       = document.getElementById('ed-3d-hint');
    document.querySelectorAll('.ed-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.view === v));
    if (v === '2d') {
      canvas2d.style.display   = 'block';
      canvas3dEl.style.display = 'none';
      hint.style.display       = 'none';
      if (this.fly.locked) document.exitPointerLock();
    } else {
      canvas2d.style.display   = 'none';
      canvas3dEl.style.display = 'block';
      hint.style.display       = 'block';
      this.threeDirty = true;
      this._rebuildScene();
      this._start3DLoop();
    }
  }

  _zoom(dir) {
    this.zoomIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, this.zoomIdx + dir));
    this._updateZoomLabel();
  }

  _updateZoomLabel() {
    this.zoomLabel.textContent = ZOOM_STEPS[this.zoomIdx] + ' px/tile';
  }

  // ── 2D Canvas ──────────────────────────────────────────────────────────────
  _init2D() {
    this.canvas2d = document.getElementById('ed-canvas-2d');
    this.ctx2d    = this.canvas2d.getContext('2d');
    this._resize2D();

    this.canvas2d.addEventListener('mousedown', e => this._c2dMouseDown(e));
    this.canvas2d.addEventListener('mousemove', e => this._c2dMouseMove(e));
    this.canvas2d.addEventListener('mouseup',   e => this._c2dMouseUp(e));
    this.canvas2d.addEventListener('mouseleave',() => { this.hoverTx = -1; this.hoverTy = -1; });
    this.canvas2d.addEventListener('wheel',     e => { e.preventDefault(); this._zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    this.canvas2d.addEventListener('contextmenu', e => e.preventDefault());
  }

  _resize2D() {
    const wrap  = document.getElementById('ed-canvas-wrap');
    const tbar  = document.getElementById('ed-toolbar');
    this.canvas2d.width  = wrap.clientWidth;
    this.canvas2d.height = wrap.clientHeight - tbar.clientHeight;
  }

  _renderLoop2D() {
    requestAnimationFrame(() => this._renderLoop2D());
    if (this.view === '2d') this._draw2D();
  }

  _draw2D() {
    const ctx  = this.ctx2d;
    const W    = this.canvas2d.width;
    const H    = this.canvas2d.height;
    const ts   = ZOOM_STEPS[this.zoomIdx];

    ctx.fillStyle = '#08060e';
    ctx.fillRect(0, 0, W, H);

    const TILE_COLORS = {
      [T.WALL]:     '#14101e',
      [T.FLOOR]:    '#2d2440',
      [T.DOOR]:     '#3d3460',
      [T.PEDESTAL]: '#5a4a80',
      [T.SIGN]:     '#3d5028',
      [T.WEB]:      '#1a1030',
    };

    const startTX = Math.floor(-this.panX / ts) - 1;
    const endTX   = Math.ceil((-this.panX + W) / ts) + 1;
    const startTY = Math.floor(-this.panY / ts) - 1;
    const endTY   = Math.ceil((-this.panY + H) / ts) + 1;

    for (let ty = Math.max(0, startTY); ty <= Math.min(this.H - 1, endTY); ty++) {
      for (let tx = Math.max(0, startTX); tx <= Math.min(this.W - 1, endTX); tx++) {
        const tile = this.tiles[ty][tx];
        const sx   = Math.floor(tx * ts + this.panX);
        const sy   = Math.floor(ty * ts + this.panY);

        ctx.fillStyle = TILE_COLORS[tile] || '#14101e';
        ctx.fillRect(sx, sy, ts, ts);

        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);

        if (tile === T.SIGN && ts >= 10) {
          ctx.fillStyle = '#8bc34a';
          ctx.font = `bold ${Math.min(ts - 2, 14)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', sx + ts / 2, sy + ts / 2);
        }

        if (tile === T.PEDESTAL && ts >= 8) {
          ctx.fillStyle = 'rgba(200,170,255,0.18)';
          ctx.fillRect(sx + 2, sy + 2, ts - 4, ts - 4);
        }

        // Web pattern
        if (tile === T.WEB && ts >= 8) {
          const cx2 = sx + ts / 2, cy2 = sy + ts / 2;
          ctx.save();
          ctx.strokeStyle = 'rgba(180,170,220,0.3)';
          ctx.lineWidth = 0.5;
          for (let d = 0; d < 4; d++) {
            const a = (d / 4) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(cx2 + Math.cos(a) * ts * 0.5, cy2 + Math.sin(a) * ts * 0.5);
            ctx.lineTo(cx2 - Math.cos(a) * ts * 0.5, cy2 - Math.sin(a) * ts * 0.5);
            ctx.stroke();
          }
          for (let r = ts * 0.13; r < ts * 0.52; r += ts * 0.17) {
            ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    // Coins
    Object.entries(this.coins).forEach(([key]) => {
      const [tx, ty] = key.split(',').map(Number);
      const sx = Math.floor(tx * ts + this.panX) + ts / 2;
      const sy = Math.floor(ty * ts + this.panY) + ts / 2;
      ctx.save();
      ctx.fillStyle = '#ffcc3c';
      ctx.shadowColor = '#ffcc3c';
      ctx.shadowBlur = ts > 10 ? 5 : 2;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2, ts * 0.22), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Entities (turret / boss)
    Object.entries(this.entities).forEach(([key, ent]) => {
      const [tx, ty] = key.split(',').map(Number);
      const cx2 = Math.floor(tx * ts + this.panX) + ts / 2;
      const cy2 = Math.floor(ty * ts + this.panY) + ts / 2;
      const r   = Math.max(4, ts * 0.3);
      ctx.save();
      if (ent.type === 'turret') {
        ctx.fillStyle   = '#883322';
        ctx.strokeStyle = '#cc6644';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, r * 0.7, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffcc88';
        ctx.font = `bold ${Math.max(7, Math.floor(ts * 0.3))}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('T↑' + ent.y3, cx2, cy2);
      } else {
        ctx.fillStyle   = '#6622aa';
        ctx.strokeStyle = '#aa66ee';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ddc0ff';
        ctx.font = `bold ${Math.max(8, Math.floor(ts * 0.35))}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('B', cx2, cy2);
      }
      ctx.restore();
    });

    // Selected object highlight (dashed white border)
    if (this.selectedObjKey) {
      let selTx, selTy;
      if (this.selectedObjKey === 'spawn') {
        selTx = this.spawnX; selTy = this.spawnY;
      } else if (this.selectedObjKey.startsWith('coin:') || this.selectedObjKey.startsWith('sign:')) {
        const coords = this.selectedObjKey.split(':')[1];
        [selTx, selTy] = coords.split(',').map(Number);
      } else {
        [selTx, selTy] = this.selectedObjKey.split(',').map(Number);
      }
      const hx = Math.floor(selTx * ts + this.panX);
      const hy = Math.floor(selTy * ts + this.panY);
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(hx + 1, hy + 1, ts - 2, ts - 2);
      ctx.restore();
    }

    // Spawn marker
    const spx = Math.floor(this.spawnX * ts + this.panX) + ts / 2;
    const spy = Math.floor(this.spawnY * ts + this.panY) + ts / 2;
    ctx.save();
    ctx.fillStyle = '#44bb44';
    ctx.shadowColor = '#44ff44';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(spx, spy, Math.max(3, ts * 0.28), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Hover highlight
    if (this.hoverTx >= 0 && this.hoverTy >= 0) {
      const hx = Math.floor(this.hoverTx * ts + this.panX);
      const hy = Math.floor(this.hoverTy * ts + this.panY);
      ctx.strokeStyle = '#7b4fff';
      ctx.lineWidth   = 2;
      ctx.strokeRect(hx + 1, hy + 1, ts - 2, ts - 2);
    }

    ctx.strokeStyle = '#7b4fff';
    ctx.lineWidth   = 1;
    ctx.strokeRect(this.panX, this.panY, this.W * ts, this.H * ts);
  }

  _c2dMouseDown(e) {
    const [tx, ty] = this._screenToTile(e.offsetX, e.offsetY);
    if (e.button === 1) { this._startPan(e); return; }
    if (e.button === 2) { this.isErasing = true; this._applyTool(tx, ty, true); return; }
    this.isPainting = true;
    this._applyTool(tx, ty, false);
  }

  _c2dMouseMove(e) {
    const [tx, ty] = this._screenToTile(e.offsetX, e.offsetY);
    if (this._panActive) { this._doPan(e); }
    else if (this.isPainting) { this._applyTool(tx, ty, false); }
    else if (this.isErasing)  { this._applyTool(tx, ty, true);  }
    this.hoverTx = tx;
    this.hoverTy = ty;
    if (tx >= 0 && tx < this.W && ty >= 0 && ty < this.H) {
      const ent = this.entities[tx + ',' + ty];
      const entStr = ent ? ` [${ent.type} y3=${ent.y3}]` : '';
      this.statusEl.textContent = `(${tx}, ${ty}) = ${this._tileName(this.tiles[ty][tx])}${entStr}`;
    } else {
      this.statusEl.textContent = '';
    }
  }

  _c2dMouseUp(e) {
    this.isPainting = false;
    this.isErasing  = false;
    this._panActive = false;
    if (this.threeDirty) this._rebuildScene();
  }

  _screenToTile(sx, sy) {
    const ts = ZOOM_STEPS[this.zoomIdx];
    return [Math.floor((sx - this.panX) / ts), Math.floor((sy - this.panY) / ts)];
  }

  _startPan(e) { this._panActive = true; this._panLastX = e.clientX; this._panLastY = e.clientY; }
  _doPan(e) {
    if (!this._panActive) return;
    this.panX += e.clientX - this._panLastX;
    this.panY += e.clientY - this._panLastY;
    this._panLastX = e.clientX;
    this._panLastY = e.clientY;
  }

  _applyTool(tx, ty, erase) {
    if (tx < 0 || tx >= this.W || ty < 0 || ty >= this.H) return;
    const key = tx + ',' + ty;

    // Select tool never modifies tiles — left-click selects, right-click deselects
    if (this.tool === 'select') {
      if (erase) {
        this.selectedObjKey = null;
        if (this.inspSection) this.inspSection.style.display = 'none';
        this._rebuildHierarchy();
      } else {
        const spawnKey = this.spawnX + ',' + this.spawnY;
        if (this.entities[key]) {
          this._selectObject(key);
        } else if (this.coins[key]) {
          this._selectObject('coin:' + key);
        } else if (this.signs[key]) {
          this._selectObject('sign:' + key);
        } else if (key === spawnKey) {
          this._selectObject('spawn');
        } else {
          this.selectedObjKey = null;
          if (this.inspSection) this.inspSection.style.display = 'none';
          this._rebuildHierarchy();
        }
      }
      return;
    }

    if (erase || this.tool === 'erase') {
      this.tiles[ty][tx] = T.WALL;
      if (this.selectedObjKey === 'coin:' + key) { this.selectedObjKey = null; if (this.inspSection) this.inspSection.style.display = 'none'; }
      if (this.selectedObjKey === 'sign:' + key) { this.selectedObjKey = null; if (this.inspSection) this.inspSection.style.display = 'none'; this.propSection.style.display = 'none'; }
      delete this.coins[key];
      delete this.signs[key];
      if (this.entities[key]) {
        delete this.entities[key];
        if (this.selectedObjKey === key) {
          this.selectedObjKey = null;
          if (this.inspSection) this.inspSection.style.display = 'none';
        }
      }
      this.threeDirty = true;
      this._rebuildHierarchy();
      return;
    }

    const def = TOOL_DEFS.find(d => d.id === this.tool);
    if (!def) return;

    if (this.tool === 'coin') {
      const isPed = this.tiles[ty][tx] === T.PEDESTAL;
      this.coins[key] = { pedestal: isPed };
      this._rebuildHierarchy();
      return;
    }

    if (this.tool === 'spawn') {
      this.spawnX = tx; this.spawnY = ty;
      this._rebuildHierarchy();
      return;
    }

    if (this.tool === 'turret' || this.tool === 'boss') {
      // Load existing entity config into inputs if present
      const existing = this.entities[key];
      if (existing && existing.type === this.tool) {
        if (this.entityY3El     && existing.y3         != null) this.entityY3El.value     = existing.y3;
        if (this.entityColorEl  && existing.bodyColor)          this.entityColorEl.value  = existing.bodyColor;
        if (this.entityAccentEl && existing.accentColor)        this.entityAccentEl.value  = existing.accentColor;
        if (this.entityScaleEl  && existing.scale      != null) this.entityScaleEl.value  = existing.scale;
      }
      const y3         = parseFloat(this.entityY3El     ? this.entityY3El.value     : 3.0) || 0;
      const bodyColor  = this.entityColorEl  ? this.entityColorEl.value  : (this.tool === 'boss' ? '#1a0a2a' : '#886644');
      const accentColor= this.entityAccentEl ? this.entityAccentEl.value : '#2a1440';
      const scale      = parseFloat(this.entityScaleEl ? this.entityScaleEl.value : 1.0) || 1.0;
      this.entities[key] = { type: this.tool, y3: this.tool === 'boss' ? 0 : y3, bodyColor, accentColor, scale };
      this.threeDirty = true;
      this._rebuildHierarchy();
      return;
    }

    if (def.tile !== null) {
      this.tiles[ty][tx] = def.tile;
      if (def.tile !== T.SIGN) delete this.signs[key];
      else if (!this.signs[key]) this.signs[key] = { text: '' };
      this.threeDirty = true;
    }

    if (this.tool === 'sign') {
      this.pendingSign = key;
      this.signTextEl.value = (this.signs[key] || {}).text || '';
      this.propSection.style.display = 'block';
    }
    this._rebuildHierarchy();
  }

  _applySignText() {
    if (!this.pendingSign) return;
    this.signs[this.pendingSign] = { text: this.signTextEl.value };
  }

  _tileName(t) {
    return ['EMPTY','FLOOR','WALL','DOOR','PEDESTAL','COIN','SIGN','WEB'][t] || '?';
  }

  // ── Map operations ────────────────────────────────────────────────────────
  _resizeMap() {
    const nw = Math.max(4, parseInt(document.getElementById('ed-map-w').value) || this.W);
    const nh = Math.max(4, parseInt(document.getElementById('ed-map-h').value) || this.H);
    const newTiles = Array.from({ length: nh }, (_, ty) =>
      Array.from({ length: nw }, (_, tx) =>
        ty < this.H && tx < this.W ? this.tiles[ty][tx] : T.WALL));
    this.tiles = newTiles;
    this.W = nw; this.H = nh;
    this.threeDirty = true;
  }

  _setSpawn() {
    this.spawnX = parseInt(document.getElementById('ed-spawn-x').value) || 0;
    this.spawnY = parseInt(document.getElementById('ed-spawn-y').value) || 0;
  }

  _newMap() {
    if (!confirm('Clear the map and start fresh?')) return;
    this.W = 26; this.H = 90;
    this.coins = {}; this.signs = {}; this.entities = {};
    this.spawnX = 12; this.spawnY = 83;
    this.selectedObjKey = null;
    if (this.inspSection) this.inspSection.style.display = 'none';
    document.getElementById('ed-map-w').value = this.W;
    document.getElementById('ed-map-h').value = this.H;
    this._initTiles();
    this.threeDirty = true;
    this._rebuildHierarchy();
  }

  // ── Load tutorial map ─────────────────────────────────────────────────────
  _loadTutorial() {
    const m = buildTutorialMap();
    this.W = m.width; this.H = m.height;
    this.tiles  = m.tiles.map(row => [...row]);
    this.spawnX = m.spawnX; this.spawnY = m.spawnY;
    this.coins  = {}; this.signs = {}; this.entities = {};
    m.objects.forEach(o => {
      if (o.type === 'coin') this.coins[o.tx + ',' + o.ty] = { pedestal: !!o.pedestal };
    });
    m.triggers.forEach(tr => {
      if (tr.type === 'sign') this.signs[tr.tx + ',' + tr.ty] = { text: tr.text };
    });
    // Populate default turret and boss positions from BossRoom layout
    this.entities['6,3']  = { type: 'turret', y3: 3.0 };
    this.entities['20,13']= { type: 'turret', y3: 3.0 };
    this.entities['11,7'] = { type: 'boss',   y3: 0   };
    document.getElementById('ed-map-w').value = this.W;
    document.getElementById('ed-map-h').value = this.H;
    document.getElementById('ed-spawn-x').value = this.spawnX;
    document.getElementById('ed-spawn-y').value = this.spawnY;
    this.selectedObjKey = null;
    if (this.inspSection) this.inspSection.style.display = 'none';
    this.threeDirty = true;
    this._rebuildHierarchy();
  }

  // ── Save / Load JSON ──────────────────────────────────────────────────────
  _toJSON() {
    return JSON.stringify({
      version: 2, width: this.W, height: this.H,
      spawnX: this.spawnX, spawnY: this.spawnY,
      tiles: this.tiles,
      coins: Object.entries(this.coins).map(([k, v]) => {
        const [tx, ty] = k.split(',').map(Number);
        return { tx, ty, pedestal: v.pedestal };
      }),
      signs: Object.entries(this.signs).map(([k, v]) => {
        const [tx, ty] = k.split(',').map(Number);
        return { tx, ty, text: v.text };
      }),
      entities: Object.entries(this.entities).map(([k, v]) => {
        const [tx, ty] = k.split(',').map(Number);
        return { tx, ty, type: v.type, y3: v.y3, bodyColor: v.bodyColor, accentColor: v.accentColor, scale: v.scale };
      }),
    }, null, 2);
  }

  _saveJSON() {
    const blob = new Blob([this._toJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'level.json';
    a.click();
  }

  _loadJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!d.tiles) throw new Error('Invalid format');
        this.W = d.width; this.H = d.height;
        this.spawnX = d.spawnX || 0; this.spawnY = d.spawnY || 0;
        this.tiles  = d.tiles;
        this.coins  = {};
        this.signs  = {};
        this.entities = {};
        (d.coins    || []).forEach(c => { this.coins[c.tx + ',' + c.ty]    = { pedestal: !!c.pedestal }; });
        (d.signs    || []).forEach(s => { this.signs[s.tx + ',' + s.ty]    = { text: s.text };           });
        (d.entities || []).forEach(en => {
          this.entities[en.tx + ',' + en.ty] = { type: en.type, y3: en.y3, bodyColor: en.bodyColor, accentColor: en.accentColor, scale: en.scale };
        });
        document.getElementById('ed-map-w'  ).value = this.W;
        document.getElementById('ed-map-h'  ).value = this.H;
        document.getElementById('ed-spawn-x').value = this.spawnX;
        document.getElementById('ed-spawn-y').value = this.spawnY;
        this.selectedObjKey = null;
        if (this.inspSection) this.inspSection.style.display = 'none';
        this.threeDirty = true;
        this._rebuildHierarchy();
      } catch(err) { alert('Failed to load: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Copy as JS code ───────────────────────────────────────────────────────
  _copyCode() {
    const rows = this.tiles.map(r => '    [' + r.join(',') + ']').join(',\n');
    const coinLines = Object.entries(this.coins).map(([k, v]) => {
      const [tx, ty] = k.split(',').map(Number);
      return `    { type: 'coin', tx: ${tx}, ty: ${ty}, pedestal: ${v.pedestal} }`;
    }).join(',\n');
    const signLines = Object.entries(this.signs).map(([k, v]) => {
      const [tx, ty] = k.split(',').map(Number);
      const safe = v.text.replace(/'/g, "\\'").replace(/\n/g, '\\n');
      return `    { tx: ${tx}, ty: ${ty}, type: 'sign', text: '${safe}' }`;
    }).join(',\n');
    const entityLines = Object.entries(this.entities).map(([k, v]) => {
      const [tx, ty] = k.split(',').map(Number);
      return `    // ${v.type} at (${tx},${ty}) y3=${v.y3}`;
    }).join('\n');

    const code =
`function buildLevel() {
  const W = ${this.W}, H = ${this.H};
  const tiles = [
${rows}
  ];
  const objects = [
${coinLines || '    // no coins'}
  ];
  const triggers = [
${signLines || '    // no signs'}
  ];
  // Entities (construct BossRoom separately with these positions):
${entityLines || '  // no entities'}
  return new GameMap({ tiles, objects, triggers, spawnX: ${this.spawnX}, spawnY: ${this.spawnY} });
}`;

    navigator.clipboard.writeText(code).then(
      ()  => alert('Code copied to clipboard!'),
      err => { const ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); alert('Code copied!'); }
    );
  }

  // ── 3D fly preview ────────────────────────────────────────────────────────
  _init3D() {
    this.canvas3dEl = document.getElementById('ed-canvas-3d');
    const W = this.canvas3dEl.clientWidth  || 800;
    const H = this.canvas3dEl.clientHeight || 600;

    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(0x08060e);
    this.threeScene.fog = new THREE.Fog(0x08060e, 20, 50);

    this.threeCamera = new THREE.PerspectiveCamera(75, W / H, 0.05, 200);
    this.threeCamera.position.set(this.fly.x, this.fly.y, this.fly.z);

    this.threeRenderer = new THREE.WebGLRenderer({ antialias: true });
    this.threeRenderer.setSize(W, H);
    this.threeRenderer.shadowMap.enabled = true;
    this.canvas3dEl.appendChild(this.threeRenderer.domElement);

    this.threeScene.add(new THREE.AmbientLight(0x334466, 1.4));
    const dir = new THREE.DirectionalLight(0x8899cc, 0.9);
    dir.position.set(5, 10, 8); dir.castShadow = true;
    this.threeScene.add(dir);
    const fill = new THREE.DirectionalLight(0x332244, 0.3);
    fill.position.set(-3, 2, -4);
    this.threeScene.add(fill);

    this.flyLight = new THREE.PointLight(0x7b4fff, 2, 12);
    this.threeScene.add(this.flyLight);

    // Raycaster for 3D tile targeting
    this._raycaster   = new THREE.Raycaster();
    this._lastHit     = null;
    this._lastHitCoords = null;
    this._3dInvOpen   = false;

    // Highlight wireframe box for hovered tile
    this._hlMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 2.25, 1.02),
      new THREE.MeshBasicMaterial({ color: 0x7b4fff, wireframe: true, transparent: true, opacity: 0.75 })
    );
    this._hlMesh.visible = false;
    this.threeScene.add(this._hlMesh);

    // Left click: capture pointer OR place selected tile (consistent with 2D)
    this.canvas3dEl.addEventListener('click', () => {
      if (!this.fly.locked && this.view === '3d') {
        const p = this.canvas3dEl.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } else if (this.fly.locked) {
        this._3dRightClick(); // place / select
      }
    });

    // Right click: erase tile (consistent with 2D right-click = erase)
    this.canvas3dEl.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (this.fly.locked) this._3dLeftClick(); // erase
    });

    document.addEventListener('pointerlockchange', () => {
      this.fly.locked = document.pointerLockElement === this.canvas3dEl;
      const crosshair = document.getElementById('ed-crosshair');
      if (crosshair) crosshair.style.display = this.fly.locked ? 'block' : 'none';
      if (!this.fly.locked && this._hlMesh) this._hlMesh.visible = false;
    });
    window.addEventListener('mousemove', e => {
      if (this.fly.locked) {
        this.fly.yaw   += e.movementX * 0.002;
        this.fly.pitch  = Math.max(-1.48, Math.min(1.48, this.fly.pitch - e.movementY * 0.002));
      }
    });
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === 'f' && this.view === '3d') {
        e.preventDefault();
        this._toggle3DInventory();
        return;
      }
      if (k === 'escape' && this._3dInvOpen) {
        this._close3DInventory();
        return;
      }
      // 3D copy/paste (only when pointer is locked)
      if (this.view === '3d' && this.fly.locked) {
        if (k === 'c') {
          e.preventDefault();
          if (this._lastHitCoords) {
            const ent = this.entities[this._lastHitCoords.tx + ',' + this._lastHitCoords.ty];
            if (ent) { this._clipboard = { ...ent }; this.statusEl.textContent = 'Copied: ' + ent.type; }
          }
          return;
        }
        if (k === 'v') {
          e.preventDefault();
          if (this._clipboard && this._lastHitCoords) {
            const { tx, ty } = this._lastHitCoords;
            this.entities[tx + ',' + ty] = { ...this._clipboard };
            this._rebuildScene();
            this._rebuildHierarchy();
            this.statusEl.textContent = 'Pasted: ' + this._clipboard.type;
          }
          return;
        }
      }
      this.fly.keys[k] = true;
    });
    window.addEventListener('keyup',   e => { delete this.fly.keys[e.key.toLowerCase()]; });

    // Inventory tab + item clicks (delegated, stop propagation so canvas never sees these clicks)
    document.getElementById('ed-3d-inv').addEventListener('click', e => {
      e.stopPropagation();
      const tab = e.target.closest('.ed-3d-inv-tab');
      if (tab) { this._build3DInventory(tab.dataset.tab); return; }
      const item = e.target.closest('.ed-inv-item');
      if (item && item.dataset.tool) { this._selectTool(item.dataset.tool); this._close3DInventory(); return; }
      if (e.target.id === 'ed-3d-inv-close' || e.target === document.getElementById('ed-3d-inv')) {
        this._close3DInventory();
      }
    });
  }

  _rebuildScene() {
    if (!this.threeScene) return;
    this.threeScene.children
      .filter(o => o._editorTile)
      .forEach(o => this.threeScene.remove(o));

    const mats = {
      floor:    new THREE.MeshLambertMaterial({ color: 0x2a2240 }),
      web:      new THREE.MeshLambertMaterial({ color: 0x18102c }),
      wall:     new THREE.MeshLambertMaterial({ color: 0x14101e }),
      wallCap:  new THREE.MeshLambertMaterial({ color: 0x1e1830 }),
      door:     new THREE.MeshLambertMaterial({ color: 0x3d3460 }),
      pedestal: new THREE.MeshLambertMaterial({ color: 0x5a4a80, emissive: 0x0a0816 }),
      sign:     new THREE.MeshLambertMaterial({ color: 0x3d5028 }),
      coin:     new THREE.MeshLambertMaterial({ color: 0xffcc3c, emissive: 0x664400 }),
      turret:   new THREE.MeshLambertMaterial({ color: 0x886644, emissive: 0x1a0800 }),
      boss:     new THREE.MeshLambertMaterial({ color: 0x1a0a2a, emissive: 0x050008 }),
    };

    const geo = {
      floor:    new THREE.BoxGeometry(1, 0.12, 1),
      wall:     new THREE.BoxGeometry(1, 2.2,  1),
      wallCap:  new THREE.BoxGeometry(1, 0.08, 1),
      pedestal: new THREE.BoxGeometry(0.82, PEDESTAL_HEIGHT, 0.82),
      sign:     new THREE.BoxGeometry(0.65, 0.9, 0.08),
      coin:     new THREE.SphereGeometry(0.13, 8, 8),
      turret:   new THREE.SphereGeometry(0.35, 8, 6),
      boss:     new THREE.SphereGeometry(0.5,  8, 6),
    };

    const addMesh = (mesh, tx, ty) => {
      mesh._editorTile = true;
      if (tx != null) mesh.userData.tileCoords = { tx, ty };
      this.threeScene.add(mesh);
    };

    for (let ty = 0; ty < this.H; ty++) {
      for (let tx = 0; tx < this.W; tx++) {
        const tile = this.tiles[ty][tx];
        const cx = tx + 0.5, cz = ty + 0.5;

        if (tile === T.FLOOR || tile === T.DOOR) {
          const m = new THREE.Mesh(geo.floor, tile === T.DOOR ? mats.door : mats.floor);
          m.position.set(cx, 0.06, cz); m.receiveShadow = true; addMesh(m, tx, ty);
        } else if (tile === T.WEB) {
          const m = new THREE.Mesh(geo.floor, mats.web);
          m.position.set(cx, 0.06, cz); m.receiveShadow = true; addMesh(m, tx, ty);
        } else if (tile === T.WALL) {
          const m = new THREE.Mesh(geo.wall, mats.wall);
          m.position.set(cx, 1.1, cz); m.castShadow = true; addMesh(m, tx, ty);
          const cap = new THREE.Mesh(geo.wallCap, mats.wallCap);
          cap.position.set(cx, 2.24, cz); addMesh(cap, tx, ty);
        } else if (tile === T.PEDESTAL) {
          const fl = new THREE.Mesh(geo.floor, mats.floor);
          fl.position.set(cx, 0.06, cz); addMesh(fl, tx, ty);
          const p  = new THREE.Mesh(geo.pedestal, mats.pedestal);
          p.position.set(cx, PEDESTAL_HEIGHT / 2, cz); addMesh(p, tx, ty);
        } else if (tile === T.SIGN) {
          const fl = new THREE.Mesh(geo.floor, mats.floor);
          fl.position.set(cx, 0.06, cz); addMesh(fl, tx, ty);
          const s  = new THREE.Mesh(geo.sign, mats.sign);
          s.position.set(cx, 0.57, cz - 0.08); addMesh(s, tx, ty);
        }
      }
    }

    // Coins
    Object.entries(this.coins).forEach(([key]) => {
      const [tx, ty] = key.split(',').map(Number);
      const isPed = this.tiles[ty][tx] === T.PEDESTAL;
      const m = new THREE.Mesh(geo.coin, mats.coin);
      m.position.set(tx + 0.5, isPed ? PEDESTAL_HEIGHT + 0.22 : 0.22, ty + 0.5);
      m._editorTile = true;
      m.userData.tileCoords = { tx, ty };
      this.threeScene.add(m);
    });

    // Entities (use per-entity colors/scale from model config)
    Object.entries(this.entities).forEach(([key, ent]) => {
      const [tx, ty] = key.split(',').map(Number);
      const cx = tx + 0.5, cz = ty + 0.5;
      const bodyHex   = parseInt((ent.bodyColor   || '#886644').replace('#', ''), 16);
      const accentHex = parseInt((ent.accentColor || '#2a1440').replace('#', ''), 16);
      const scl       = ent.scale || 1.0;

      if (ent.type === 'turret') {
        const mat = new THREE.MeshLambertMaterial({ color: bodyHex, emissive: 0x1a0800 });
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.30, 8, 6), mat);
        m.scale.set(scl, scl * 1.45, scl);
        m.position.set(cx, ent.y3, cz);
        m._editorTile = true; this.threeScene.add(m);
        // Vertical indicator line
        const lineGeo = new THREE.CylinderGeometry(0.02, 0.02, ent.y3, 4);
        const line = new THREE.Mesh(lineGeo, new THREE.MeshLambertMaterial({ color: accentHex }));
        line.position.set(cx, ent.y3 / 2, cz);
        line._editorTile = true; this.threeScene.add(line);
      } else {
        // Boss preview: simplified spider body
        const bossGroup = new THREE.Group();
        const bMat = new THREE.MeshLambertMaterial({ color: bodyHex, emissive: 0x050008 });
        const lMat = new THREE.MeshLambertMaterial({ color: accentHex });
        const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), bMat);
        abdomen.scale.set(1.0, 0.72, 1.15);
        abdomen.position.set(0, 0.28, 0.20);
        bossGroup.add(abdomen);
        const cephalo = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), bMat);
        cephalo.position.set(0, 0.26, -0.22);
        bossGroup.add(cephalo);
        // 4 simplified legs (left side only, mirrored)
        const upVec = new THREE.Vector3(0, 1, 0);
        [[-0.26, -0.14, -0.82, -0.52], [-0.26, 0.14, -0.82, 0.50],
         [ 0.26, -0.14,  0.82, -0.52], [ 0.26, 0.14,  0.82, 0.50]].forEach(([hx, hz, tx2, tz2]) => {
          const dx = tx2 - hx, dy = 0.01 - 0.26, dz = tz2 - hz;
          const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
          const legM = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.01, len, 4), lMat);
          legM.position.set((hx + tx2) * 0.5, 0.135, (hz + tz2) * 0.5);
          legM.quaternion.setFromUnitVectors(upVec, new THREE.Vector3(dx, dy, dz).normalize());
          bossGroup.add(legM);
        });
        bossGroup.scale.setScalar(scl);
        bossGroup.position.set(cx, 0, cz);
        bossGroup._editorTile = true; this.threeScene.add(bossGroup);
      }
    });

    // Spawn marker
    const spawnGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
    const spawnMat = new THREE.MeshLambertMaterial({ color: 0x44bb44, emissive: 0x003300 });
    const spawnM   = new THREE.Mesh(spawnGeo, spawnMat);
    spawnM.position.set(this.spawnX + 0.5, 0.5, this.spawnY + 0.5);
    spawnM._editorTile = true; this.threeScene.add(spawnM);

    this.threeDirty = false;
  }

  _start3DLoop() {
    if (this.flyRaf) return;
    this.flyLastTime = performance.now();
    const loop = () => {
      if (this.view !== '3d') { this.flyRaf = null; return; }
      this.flyRaf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt  = Math.min((now - this.flyLastTime) / 1000, 0.05);
      this.flyLastTime = now;
      this._updateFly(dt);
      this._render3D();
    };
    this.flyRaf = requestAnimationFrame(loop);
  }

  _updateFly(dt) {
    const f   = this.fly;
    const spd = 8;
    const fwX = Math.sin(f.yaw) * Math.cos(f.pitch);
    const fwY = Math.sin(f.pitch);
    const fwZ = -Math.cos(f.yaw) * Math.cos(f.pitch);
    const rtX = Math.cos(f.yaw);
    const rtZ = Math.sin(f.yaw);

    let dx = 0, dy = 0, dz = 0;
    if (f.keys['w'] || f.keys['arrowup'])    { dx += fwX; dy += fwY; dz += fwZ; }
    if (f.keys['s'] || f.keys['arrowdown'])  { dx -= fwX; dy -= fwY; dz -= fwZ; }
    if (f.keys['a'] || f.keys['arrowleft'])  { dx -= rtX; dz -= rtZ; }
    if (f.keys['d'] || f.keys['arrowright']) { dx += rtX; dz += rtZ; }
    if (f.keys['e'] || f.keys['pageup'])     dy += 1;
    if (f.keys['q'] || f.keys['pagedown'])   dy -= 1;

    f.x += dx * spd * dt;
    f.y += dy * spd * dt;
    f.z += dz * spd * dt;
  }

  _render3D() {
    if (!this.threeRenderer) return;
    const f   = this.fly;
    const cam = this.threeCamera;
    cam.position.set(f.x, f.y, f.z);
    cam.lookAt(
      f.x + Math.sin(f.yaw) * Math.cos(f.pitch) * 10,
      f.y + Math.sin(f.pitch) * 10,
      f.z - Math.cos(f.yaw) * Math.cos(f.pitch) * 10
    );
    this.flyLight.position.set(f.x, f.y, f.z);

    // Spin coins
    const t = performance.now() / 1000;
    this.threeScene.children
      .filter(o => o.geometry && o.geometry.type === 'SphereGeometry' && o._editorTile)
      .forEach(o => { o.rotation.y = t * 2.5; });

    // Raycast from camera center to highlight hovered tile
    if (this.fly.locked && this._raycaster) {
      cam.updateMatrixWorld();
      this._raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
      const targets = this.threeScene.children.filter(o => o._editorTile && o.userData && o.userData.tileCoords);
      const hits    = this._raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hit    = hits[0];
        const coords = hit.object.userData.tileCoords;
        this._lastHit       = hit;
        this._lastHitCoords = coords;
        this._hlMesh.position.set(coords.tx + 0.5, 1.125, coords.ty + 0.5);
        this._hlMesh.visible = true;
      } else {
        this._lastHit       = null;
        this._lastHitCoords = null;
        this._hlMesh.visible = false;
      }
    }

    const wrap = document.getElementById('ed-canvas-wrap');
    const tbar = document.getElementById('ed-toolbar');
    const newW = wrap.clientWidth;
    const newH = wrap.clientHeight - tbar.clientHeight;
    if (this.threeRenderer.domElement.width !== newW || this.threeRenderer.domElement.height !== newH) {
      this.threeRenderer.setSize(newW, newH);
      cam.aspect = newW / newH;
      cam.updateProjectionMatrix();
    }

    this.threeRenderer.render(this.threeScene, cam);
  }

  // ── 3D tile editing ───────────────────────────────────────────────────────
  _3dLeftClick() {
    // This is now bound to RIGHT-CLICK (erase). Select tool ignores erase.
    if (this.tool === 'select') return;
    if (!this._lastHitCoords) return;
    const { tx, ty } = this._lastHitCoords;
    if (tx < 0 || tx >= this.W || ty < 0 || ty >= this.H) return;
    const key = tx + ',' + ty;

    this.tiles[ty][tx] = T.WALL;
    if (this.selectedObjKey === 'coin:' + key) { this.selectedObjKey = null; if (this.inspSection) this.inspSection.style.display = 'none'; }
    if (this.selectedObjKey === 'sign:' + key) { this.selectedObjKey = null; if (this.inspSection) this.inspSection.style.display = 'none'; this.propSection.style.display = 'none'; }
    delete this.coins[key];
    delete this.signs[key];
    if (this.entities[key]) {
      delete this.entities[key];
      if (this.selectedObjKey === key) {
        this.selectedObjKey = null;
        if (this.inspSection) this.inspSection.style.display = 'none';
      }
    }
    this._rebuildScene();
    this._rebuildHierarchy();
  }

  _3dRightClick() {
    // This is now bound to LEFT-CLICK (place/select).
    // Select tool: left-click selects the object at crosshair
    if (this.tool === 'select') {
      if (this._lastHitCoords) {
        const { tx, ty } = this._lastHitCoords;
        const key = tx + ',' + ty;
        const spawnKey = this.spawnX + ',' + this.spawnY;
        if (this.entities[key]) { this._selectObject(key); }
        else if (this.coins[key]) { this._selectObject('coin:' + key); }
        else if (this.signs[key]) { this._selectObject('sign:' + key); }
        else if (key === spawnKey) { this._selectObject('spawn'); }
        else { this.selectedObjKey = null; if (this.inspSection) this.inspSection.style.display = 'none'; this._rebuildHierarchy(); }
      }
      return;
    }

    if (!this._lastHitCoords) return;
    const { tx, ty } = this._lastHitCoords;
    if (tx < 0 || tx >= this.W || ty < 0 || ty >= this.H) return;
    const key = tx + ',' + ty;
    const def = TOOL_DEFS.find(d => d.id === this.tool);
    if (!def) return;

    if (this.tool === 'erase') {
      this.tiles[ty][tx] = T.WALL;
      delete this.coins[key]; delete this.signs[key]; delete this.entities[key];
    } else if (this.tool === 'coin') {
      this.coins[key] = { pedestal: this.tiles[ty][tx] === T.PEDESTAL };
    } else if (this.tool === 'spawn') {
      this.spawnX = tx; this.spawnY = ty;
    } else if (this.tool === 'turret' || this.tool === 'boss') {
      const y3 = parseFloat(this.entityY3El ? this.entityY3El.value : 3.0) || 0;
      const bodyColor   = this.entityColorEl  ? this.entityColorEl.value  : '#886644';
      const accentColor = this.entityAccentEl ? this.entityAccentEl.value : '#2a1440';
      const scale       = parseFloat(this.entityScaleEl ? this.entityScaleEl.value : 1.0) || 1.0;
      this.entities[key] = { type: this.tool, y3: this.tool === 'boss' ? 0 : y3, bodyColor, accentColor, scale };
    } else if (def.tile !== null) {
      this.tiles[ty][tx] = def.tile;
      if (def.tile !== T.SIGN) delete this.signs[key];
      else if (!this.signs[key]) this.signs[key] = { text: '' };
    }
    this._rebuildScene();
    this._rebuildHierarchy();
  }

  // ── 3D Inventory ──────────────────────────────────────────────────────────
  _toggle3DInventory() {
    if (this._3dInvOpen) this._close3DInventory();
    else                  this._open3DInventory();
  }

  _open3DInventory() {
    if (this.fly.locked) document.exitPointerLock();
    const activeTab = document.querySelector('.ed-3d-inv-tab.active');
    this._build3DInventory(activeTab ? activeTab.dataset.tab : 'Tiles');
    document.getElementById('ed-3d-inv').style.display = 'flex';
    this._3dInvOpen = true;
  }

  _close3DInventory() {
    document.getElementById('ed-3d-inv').style.display = 'none';
    this._3dInvOpen = false;
    // Re-acquire pointer lock so the user lands back in fly mode
    if (this.view === '3d' && this.canvas3dEl) {
      const p = this.canvas3dEl.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
  }

  _build3DInventory(tabName) {
    // Update tab active state
    document.querySelectorAll('.ed-3d-inv-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tabName));

    const grid = document.getElementById('ed-3d-inv-grid');
    grid.innerHTML = '';

    const section = TOOL_SECTIONS.find(s => s.name === tabName);
    if (!section) return;

    section.tools.forEach(def => {
      const item = document.createElement('div');
      item.className = 'ed-inv-item' + (def.id === this.tool ? ' active' : '');
      item.dataset.tool = def.id;

      const swatch = document.createElement('div');
      swatch.className = 'ed-inv-swatch';
      swatch.style.background = def.color;
      item.appendChild(swatch);

      const label = document.createElement('div');
      label.className = 'ed-inv-label';
      label.textContent = def.label;
      item.appendChild(label);

      grid.appendChild(item);
    });
  }

  // ── Object Hierarchy ─────────────────────────────────────────────────────
  _rebuildHierarchy() {
    if (!this.hierListEl) return;
    this.hierListEl.innerHTML = '';

    const makeItem = (key, label, dotColor, coordsStr) => {
      const item = document.createElement('div');
      item.className = 'ed-hier-item' + (key === this.selectedObjKey ? ' selected' : '');
      item.dataset.objKey = key;
      item.addEventListener('click', () => this._selectObject(key));

      const dot = document.createElement('div');
      dot.className = 'ed-hier-dot';
      dot.style.background = dotColor;
      item.appendChild(dot);

      const lbl = document.createElement('span');
      lbl.textContent = label;
      item.appendChild(lbl);

      const coords = document.createElement('span');
      coords.className = 'ed-hier-coords';
      coords.textContent = coordsStr;
      item.appendChild(coords);

      return item;
    };

    // Spawn point
    this.hierListEl.appendChild(makeItem('spawn', 'Spawn', '#44bb44', `${this.spawnX},${this.spawnY}`));

    // Entities
    const entityEntries = Object.entries(this.entities);
    if (entityEntries.length > 0) {
      const grp = document.createElement('div');
      grp.className = 'ed-hier-group-label';
      grp.textContent = 'Entities';
      this.hierListEl.appendChild(grp);
      entityEntries.forEach(([key, ent]) => {
        const [tx, ty] = key.split(',').map(Number);
        const dot = ent.bodyColor || (ent.type === 'boss' ? '#6622aa' : '#883322');
        this.hierListEl.appendChild(makeItem(key, ent.type === 'boss' ? 'Boss' : 'Turret', dot, `${tx},${ty}`));
      });
    }

    // Coins
    const coinEntries = Object.entries(this.coins);
    if (coinEntries.length > 0) {
      const grp = document.createElement('div');
      grp.className = 'ed-hier-group-label';
      grp.textContent = 'Coins';
      this.hierListEl.appendChild(grp);
      coinEntries.forEach(([key]) => {
        const [tx, ty] = key.split(',').map(Number);
        this.hierListEl.appendChild(makeItem('coin:' + key, 'Coin', '#ffcc3c', `${tx},${ty}`));
      });
    }

    // Signs
    const signEntries = Object.entries(this.signs);
    if (signEntries.length > 0) {
      const grp = document.createElement('div');
      grp.className = 'ed-hier-group-label';
      grp.textContent = 'Signs';
      this.hierListEl.appendChild(grp);
      signEntries.forEach(([key, sign]) => {
        const [tx, ty] = key.split(',').map(Number);
        const preview = (sign.text || '').slice(0, 10) || '(empty)';
        this.hierListEl.appendChild(makeItem('sign:' + key, preview, '#8bc34a', `${tx},${ty}`));
      });
    }
  }

  _selectObject(key) {
    this.selectedObjKey = key;
    this._rebuildHierarchy();
    if (!this.inspSection) return;

    const panTo = (tx, ty) => {
      if (this.view === '2d') {
        const ts   = ZOOM_STEPS[this.zoomIdx];
        const wrap = document.getElementById('ed-canvas-wrap');
        this.panX  = wrap.clientWidth  / 2 - (tx + 0.5) * ts;
        this.panY  = (wrap.clientHeight - 38) / 2 - (ty + 0.5) * ts;
      }
    };

    if (key === 'spawn') {
      this.inspSection.style.display = 'none';
      panTo(this.spawnX, this.spawnY);
      return;
    }

    if (key.startsWith('coin:')) {
      const coordKey = key.slice(5);
      const [tx, ty] = coordKey.split(',').map(Number);
      this.inspSection.style.display = 'none';
      panTo(tx, ty);
      return;
    }

    if (key.startsWith('sign:')) {
      const coordKey = key.slice(5);
      const [tx, ty] = coordKey.split(',').map(Number);
      this.inspSection.style.display = 'none';
      // Open the sign text editor on the left sidebar
      this.pendingSign = coordKey;
      this.signTextEl.value = (this.signs[coordKey] || {}).text || '';
      this.propSection.style.display = 'block';
      panTo(tx, ty);
      return;
    }

    const ent = this.entities[key];
    if (!ent) { this.inspSection.style.display = 'none'; return; }
    const [tx, ty] = key.split(',').map(Number);

    this.inspTitleEl.textContent        = ent.type === 'boss' ? 'Boss' : 'Turret';
    this.inspY3RowEl.style.display      = ent.type === 'boss' ? 'none' : '';
    this.inspY3El.value                 = ent.y3    != null ? ent.y3    : 3.0;
    this.inspColorEl.value              = ent.bodyColor   || (ent.type === 'boss' ? '#1a0a2a' : '#886644');
    this.inspAccentEl.value             = ent.accentColor || '#2a1440';
    this.inspScaleEl.value              = ent.scale != null ? ent.scale : 1.0;
    this.inspSection.style.display      = 'block';
    panTo(tx, ty);
  }

  _inspApply() {
    if (!this.selectedObjKey || this.selectedObjKey === 'spawn') return;
    const ent = this.entities[this.selectedObjKey];
    if (!ent) return;
    ent.y3          = parseFloat(this.inspY3El.value)    || 0;
    ent.bodyColor   = this.inspColorEl.value;
    ent.accentColor = this.inspAccentEl.value;
    ent.scale       = parseFloat(this.inspScaleEl.value) || 1.0;
    this.threeDirty = true;
    this._rebuildScene();
    this._rebuildHierarchy();
  }

  _inspDelete() {
    if (!this.selectedObjKey || this.selectedObjKey === 'spawn') return;
    if (this.selectedObjKey.startsWith('coin:') || this.selectedObjKey.startsWith('sign:')) return;
    delete this.entities[this.selectedObjKey];
    this.selectedObjKey = null;
    this.inspSection.style.display = 'none';
    this.threeDirty = true;
    this._rebuildScene();
    this._rebuildHierarchy();
  }

  // ── Global listeners ──────────────────────────────────────────────────────
  _addListeners() {
    window.addEventListener('resize', () => this._resize2D());
    this.canvas2d.addEventListener('mousedown', e => { if (e.button === 1) { e.preventDefault(); this._startPan(e); } });
    window.addEventListener('mousemove', e => { if (this._panActive) this._doPan(e); });
    window.addEventListener('mouseup',   () => { this._panActive = false; });
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const editor = new LevelEditor();
  editor.init();
});
