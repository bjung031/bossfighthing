class Game {
  constructor() {
    this.canvas2d    = document.getElementById('canvas-2d');
    this.container3d = document.getElementById('canvas-3d-container');
    this.hudViewInd  = document.getElementById('hud-view-indicator');
    this.heartsEl    = document.getElementById('hud-hearts');
    this.coinCount   = document.getElementById('hud-coin-count');
    this.tooltip     = document.getElementById('tooltip-box');
    this.gameScreen  = document.getElementById('screen-game');
    this.invPanel    = document.getElementById('hud-inv-panel');
    this.invEquipped = document.getElementById('hud-equipped-slots');
    this.invBackpack = document.getElementById('hud-backpack-slots');
    this.lootWrap    = document.getElementById('hud-loot-wrap');
    this.lootList    = document.getElementById('hud-loot-slots');
    this.itemTip     = document.getElementById('item-stat-tooltip');

    this.renderer2d = new TileRenderer2D(this.canvas2d);
    this.renderer3d = new Renderer3D(this.container3d);

    this.map      = null;
    this.player   = null;
    this.bossRoom = null;
    this.chest       = null;
    this.droppedBags = [];
    this._hadNearbyBags = false;

    this.mode          = '2d';
    this.transAlpha    = 0;
    this.running       = false;
    this.raf           = null;
    this.lastTime      = 0;
    this.pointerLocked = false;

    this.keys      = {};
    this.mouseX    = 0;
    this.mouseY    = 0;
    this.mouseDown = false;
    this.lastSignKey      = null;
    this._bossRoomEntered = false;
    this._bossDefeated    = false;
    this._chestPromptShown = false;
    this._lastHp    = -1;
    this._lastMaxHp = -1;

    this._boundKeyDown    = this._onKeyDown.bind(this);
    this._boundKeyUp      = this._onKeyUp.bind(this);
    this._boundMouseMove  = this._onMouseMove.bind(this);
    this._boundMouseDown  = this._onMouseDown.bind(this);
    this._boundMouseUp    = this._onMouseUp.bind(this);
    this._boundResize     = this._onResize.bind(this);
    this._boundLockChange = this._onPointerLockChange.bind(this);
  }

  load(dungeonId, _diff, characterData) {
    this.character = characterData;
    this.map    = buildTutorialMap();
    this.player = new Player(this.map.spawnX, this.map.spawnY);
    const char = characterData.character ?? characterData;
    const gear = characterData.gear ?? char?.startingGear;
    this.player.initFromCharacter(char, gear);
    this._onResize();
    this.renderer3d.init();
    this.renderer3d.buildFromMap(this.map);
    this.bossRoom = new BossRoom();
    this.bossRoom.init(this.renderer3d.scene);
    this._rebuildInventoryUI();
    this._rebuildHeartsHUD();
    return this;
  }

  start() {
    this.running  = true;
    this.lastTime = performance.now();
    this.canvas2d.style.opacity    = '1';
    this.container3d.style.opacity = '0';
    this.container3d.style.pointerEvents = 'none';
    if (this.invPanel) this.invPanel.style.display = 'block';
    this._addListeners();
    this._loop();
    this._showTooltip('Welcome to Fighthing! WASD: move · Click: shoot · SHIFT: 3D · E: interact · F: potion · 1-8: use slot', 6000);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this._removeListeners();
    if (this.pointerLocked) document.exitPointerLock();
    this.renderer3d.dispose();
  }

  // ── Loop ─────────────────────────────────────────────────────
  _loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt  = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this._update(dt);
    this._render();
  }

  _update(dt) {
    const ptx = Math.floor(this.player.x3);
    const ptz = Math.floor(this.player.z3);
    let speedMult = (this.map.tileAt(ptx, ptz) === T.WEB) ? 0.5 : 1.0;
    if (this.player.webSlowTimer > 0) {
      speedMult = Math.min(speedMult, 0.3);
      this.player.webSlowTimer = Math.max(0, this.player.webSlowTimer - dt);
    }

    this.player.update(this.keys, this.map, this.mode, dt, speedMult);

    // Seamless transition lerp
    const target = this.mode === '3d' ? 1 : 0;
    const diff   = target - this.transAlpha;
    const step   = 3.5 * dt;
    this.transAlpha = Math.abs(diff) <= step ? target : this.transAlpha + Math.sign(diff) * step;
    this.container3d.style.pointerEvents = this.mode === '3d' ? 'auto' : 'none';

    // Shooting
    if (this.mouseDown) {
      if (this.mode === '2d') {
        const W = this.canvas2d.width, H = this.canvas2d.height;
        this.player.shoot(
          this.mouseX - W / 2 + this.player.x,
          this.mouseY - H / 2 + this.player.y
        );
      } else if (this.mode === '3d' && this.pointerLocked) {
        this.player.shootDirection(this.player.yaw, this.player.pitch);
      }
    }

    // Boss room
    if (this.bossRoom) {
      this.bossRoom.update(dt, this.player, this.map, this.mode);
      this.bossRoom.checkPlayerBullets(this.player.bullets, this.mode);

      const inBossRoom = this.player.x3 > 2 && this.player.x3 < 23 &&
                         this.player.z3 > 1 && this.player.z3 < 16;
      if (inBossRoom && !this._bossRoomEntered) {
        this._bossRoomEntered = true;
        this._showTooltip(
          'BOSS ROOM! Egg turrets hang 3 tiles up — use 3D (SHIFT) to hit them!\nThe web slows you down.',
          7000
        );
      }

      if (!this._bossDefeated && this.bossRoom.isDefeated()) {
        this._bossDefeated = true;
        const bx = Math.floor(this.bossRoom.boss.x3);
        const by = Math.floor(this.bossRoom.boss.z3);
        const loot = [
          getItemById('health_potion'),
          getItemById('health_potion'),
          GEAR_DATA.weapon.find(g => g.id === 'iron_sword'),
          GEAR_DATA.helmet.find(g => g.id === 'iron_helmet'),
          GEAR_DATA.armor.find(g => g.id === 'iron_chest'),
        ].filter(Boolean);
        this.chest = new Chest(bx, by, 'bronze', loot);
        this.chest.buildMesh(this.renderer3d.scene);
        this._chestPromptShown = false;
        this._showTooltip('The spider has been slain! A chest has appeared! Press E to open it.', 8000);
      }
    }

    // Chest proximity prompt
    if (this.chest && !this.chest.open) {
      const dist = this.chest.distanceTo(this.player.x3, this.player.z3);
      if (dist < 2.0 && !this._chestPromptShown) {
        this._chestPromptShown = true;
        this._showTooltip('Press E to open the chest!', 4000);
      } else if (dist >= 2.0) {
        this._chestPromptShown = false;
      }
    }

    // Coin collection
    const coin = this.map.getCoinAt(ptx, ptz);
    if (coin) {
      const onPedestal = !!coin.pedestal;
      if (!onPedestal || this.player.y3 >= PEDESTAL_HEIGHT - 0.1) {
        this.map.collectCoin(ptx, ptz);
        this.player.coins++;
        this.coinCount.textContent = this.player.coins;
        this._showTooltip('Coin collected! +1', 1500);
      }
    }

    // Signs
    const sign    = this.map.getSignAt(ptx, ptz);
    const signKey = sign ? ptx + ',' + ptz : null;
    if (signKey !== this.lastSignKey) {
      this.lastSignKey = signKey;
      if (sign) this._showTooltip(sign.text, 5000);
    }

    // Bag proximity loot table refresh
    if (this.mode === '2d' && this.droppedBags.length > 0) {
      const hasNearby = this.droppedBags.some(bag =>
        Math.hypot(this.player.x3 - (bag.tx + 0.5), this.player.z3 - (bag.ty + 0.5)) < 2.5
      );
      if (hasNearby !== this._hadNearbyBags) {
        this._hadNearbyBags = hasNearby;
        this._rebuildLootTable();
      }
    }

    // Hearts
    this._rebuildHeartsHUD();
  }

  _render() {
    const a = this.transAlpha;
    const entities = this.bossRoom ? {
      boss:        this.bossRoom.boss,
      turrets:     this.bossRoom.turrets,
      bullets:     this.bossRoom.bullets,
      chest:       this.chest,
      droppedBags: this.droppedBags,
    } : { chest: this.chest, droppedBags: this.droppedBags };

    if (a < 1) {
      this.renderer2d.render(this.map, this.player, this.player.x, this.player.y, entities);
      this.canvas2d.style.opacity = (1 - a).toFixed(3);
    } else {
      this.canvas2d.style.opacity = '0';
    }
    if (a > 0) {
      this.renderer3d.update(this.player, this.map, entities);
      this.container3d.style.opacity = a.toFixed(3);
    } else {
      this.container3d.style.opacity = '0';
    }
  }

  // ── Dimension shift ───────────────────────────────────────────
  _shiftDimension() {
    if (this.mode === '2d') {
      const W = this.canvas2d.width, H = this.canvas2d.height;
      const dx = (this.mouseX - W / 2) / TILE_SIZE;
      const dz = (this.mouseY - H / 2) / TILE_SIZE;
      if (Math.abs(dx) + Math.abs(dz) > 0.1) {
        this.player.yaw = Math.atan2(dx, -dz);
      }
      this.player.pitch = 0;

      this.mode = '3d';
      const p = this.gameScreen.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
      this.hudViewInd.textContent = '3D';
      this.hudViewInd.classList.add('mode-3d');
      if (this.invPanel) this.invPanel.style.display = 'none';
      this._showTooltip('3D — WASD: move · SPACE: jump · Mouse: look · E: open/take · SHIFT: return', 4500);
    } else {
      const yaw = ((this.player.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if      (yaw < Math.PI / 4 || yaw >= 7 * Math.PI / 4) this.player.facing = 'up';
      else if (yaw < 3 * Math.PI / 4)                         this.player.facing = 'right';
      else if (yaw < 5 * Math.PI / 4)                         this.player.facing = 'down';
      else                                                     this.player.facing = 'left';

      this.mode = '2d';
      document.exitPointerLock();
      this.hudViewInd.textContent = '2D';
      this.hudViewInd.classList.remove('mode-3d');
      if (this.invPanel) this.invPanel.style.display = 'block';
      this._rebuildLootTable();
      this._showTooltip('Back to 2D view.', 2000);
    }
  }

  // ── Interaction ────────────────────────────────────────────────
  _handleInteract() {
    // Unopened chest nearby — open it
    if (this.chest && !this.chest.open) {
      const dist = this.chest.distanceTo(this.player.x3, this.player.z3);
      if (dist < 2.0) {
        this.chest.openChest(this.renderer3d.scene);
        this._rebuildLootTable();
        this._showTooltip(
          this.mode === '3d'
            ? 'Chest opened! Look at items and press E to take them.'
            : 'Chest opened! Click or drag items in the loot list.',
          4000
        );
      } else {
        this._showTooltip('Get closer to open the chest.', 2000);
      }
      return;
    }

    if (this.mode === '3d') {
      // Try chest item first
      if (this.chest && this.chest.open) {
        const item = this._raycastChestItem();
        if (item) {
          const slot = this.player.addToBackpack(item);
          if (slot >= 0) {
            this._unlockItem(item);
            this._rebuildInventoryUI();
            this._rebuildLootTable();
            this._showTooltip('Picked up: ' + item.name, 1500);
          } else {
            this._showTooltip('Backpack full!', 2000);
          }
          return;
        }
      }
      // Try bag
      this._interactBag3D();
    }
  }

  _interactBag3D() {
    if (!this.renderer3d._ready || !this.droppedBags.length) return;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.renderer3d.camera);
    const bagMeshes = this.droppedBags.map(b => b.mesh).filter(Boolean);
    if (!bagMeshes.length) return;
    const hits = raycaster.intersectObjects(bagMeshes);
    if (!hits.length) return;
    const mesh = hits[0].object;
    const bagIdx = this.droppedBags.findIndex(b => b.mesh === mesh);
    if (bagIdx < 0) return;
    const bag = this.droppedBags[bagIdx];
    const taken = [];
    for (let i = 0; i < bag.items.length; i++) {
      const it = bag.items[i];
      if (!it) continue;
      const slot = this.player.addToBackpack(it);
      if (slot >= 0) {
        bag.items[i] = null;
        this._unlockItem(it);
        taken.push(it.name);
      } else {
        this._showTooltip('Backpack full!', 2000);
        break;
      }
    }
    if (taken.length > 0) {
      if (!bag.items.some(Boolean)) {
        if (bag.mesh) this.renderer3d.scene.remove(bag.mesh);
        this.droppedBags.splice(bagIdx, 1);
      }
      this._rebuildInventoryUI();
      this._rebuildLootTable();
      this._showTooltip(
        taken.length === 1 ? 'Picked up: ' + taken[0] : 'Picked up ' + taken.length + ' items!',
        1500
      );
    }
  }

  _raycastChestItem() {
    if (!this.chest || !this.chest.open || !this.renderer3d._ready) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.renderer3d.camera);
    const targets = this.chest.itemMeshes.filter(Boolean);
    if (!targets.length) return null;
    const hits = raycaster.intersectObjects(targets);
    if (!hits.length) return null;
    const idx = hits[0].object.userData.chestLootIndex;
    return this.chest.takeLoot(idx, this.renderer3d.scene);
  }

  // ── Hearts HUD ────────────────────────────────────────────────
  _rebuildHeartsHUD() {
    if (!this.heartsEl) return;
    if (this._lastHp === this.player.hp && this._lastMaxHp === this.player.maxHp) return;
    this._lastHp    = this.player.hp;
    this._lastMaxHp = this.player.maxHp;
    let html = '';
    for (let i = 0; i < this.player.maxHp; i++) {
      html += i < this.player.hp
        ? '<span class="hud-heart full">&#x2665;</span>'
        : '<span class="hud-heart empty">&#x2665;</span>';
    }
    this.heartsEl.innerHTML = html;
  }

  // ── Inventory UI ──────────────────────────────────────────────
  _rebuildInventoryUI() {
    this._rebuildEquippedSlots();
    this._rebuildBackpackSlots();
  }

  _rebuildEquippedSlots() {
    if (!this.invEquipped) return;
    this.invEquipped.innerHTML = '';
    const placeholders = { weapon: '⚔', helmet: '⛑', armor: '🛡', emblem: '✦' };
    for (const type of ['weapon', 'helmet', 'armor', 'emblem']) {
      const item = this.player.equipped[type];
      const slot = document.createElement('div');
      slot.className = 'inv-slot' + (item ? ' occupied' : '');
      slot.title = item ? `${item.name} (${item.rarity})` : type;
      if (item) {
        slot.textContent = item.icon;
      } else {
        const ph = document.createElement('span');
        ph.className = 'inv-slot-placeholder';
        ph.textContent = placeholders[type];
        slot.appendChild(ph);
      }
      slot.addEventListener('mousedown', e => e.stopPropagation());
      if (item) {
        slot.addEventListener('mouseenter', e => this._showItemTooltip(item, e.clientX, e.clientY));
        slot.addEventListener('mousemove',  e => this._positionItemTooltip(e.clientX, e.clientY));
        slot.addEventListener('mouseleave', () => this._hideItemTooltip());
      }
      this.invEquipped.appendChild(slot);
    }
  }

  _rebuildBackpackSlots() {
    if (!this.invBackpack) return;
    this.invBackpack.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const item = this.player.backpack[i];
      const slot = document.createElement('div');
      slot.className = 'inv-slot' + (item ? ' occupied' : '');
      slot.dataset.backpackSlot = i;
      if (item) slot.textContent = item.icon;

      const num = document.createElement('span');
      num.className = 'inv-slot-num';
      num.textContent = i + 1;
      slot.appendChild(num);

      slot.addEventListener('mousedown', e => e.stopPropagation());

      if (item) {
        slot.addEventListener('mouseenter', e => this._showItemTooltip(item, e.clientX, e.clientY));
        slot.addEventListener('mousemove',  e => this._positionItemTooltip(e.clientX, e.clientY));
        slot.addEventListener('mouseleave', () => this._hideItemTooltip());
      }

      slot.addEventListener('click', e => {
        e.stopPropagation();
        if (!item) return;
        if (item.type === 'consumable') {
          if (this.player.useSlot(i)) {
            this._rebuildHeartsHUD();
            this._rebuildBackpackSlots();
            this._showTooltip('Used: ' + item.name, 1500);
          }
        } else if (['weapon', 'helmet', 'armor', 'emblem'].includes(item.type)) {
          this._equipFromBackpack(i, item);
        }
      });

      slot.addEventListener('dblclick', e => {
        e.stopPropagation();
        if (!item) return;
        if (item.type === 'consumable') {
          if (this.player.useSlot(i)) {
            this._rebuildHeartsHUD();
            this._rebuildBackpackSlots();
            this._showTooltip('Used: ' + item.name, 1500);
          }
        }
      });

      slot.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        if (item) this._dropItemFromBackpack(i);
      });

      if (item) {
        slot.draggable = true;
        slot.addEventListener('dragstart', e => {
          e.dataTransfer.setData('lootSource', JSON.stringify({ sourceType: 'backpack', slot: i }));
          e.dataTransfer.effectAllowed = 'move';
        });
      }

      slot.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('drag-over');
        let src;
        try { src = JSON.parse(e.dataTransfer.getData('lootSource')); } catch (_) { return; }
        if (!src) return;

        if (src.sourceType === 'backpack') {
          if (src.slot === i) return;
          const tmp = this.player.backpack[i];
          this.player.backpack[i]       = this.player.backpack[src.slot];
          this.player.backpack[src.slot] = tmp;
          this._rebuildInventoryUI();
          return;
        }

        if (item) { this._showTooltip('Slot occupied!', 1500); return; }

        if (src.sourceType === 'chest') {
          const lootItem = this.chest && this.chest.loot[src.index];
          if (!lootItem) return;
          this.player.backpack[i] = lootItem;
          this._clearLootItem(src);
          this._unlockItem(lootItem);
          this._rebuildInventoryUI();
          this._rebuildLootTable();
          this._showTooltip('Picked up: ' + lootItem.name, 1500);
        } else if (src.sourceType === 'bag') {
          const bag = this.droppedBags[src.bagIndex];
          const lootItem = bag && bag.items[src.index];
          if (!lootItem) return;
          this.player.backpack[i] = lootItem;
          this._clearLootItem(src);
          this._unlockItem(lootItem);
          this._rebuildInventoryUI();
          this._rebuildLootTable();
          this._showTooltip('Picked up: ' + lootItem.name, 1500);
        }
      });

      this.invBackpack.appendChild(slot);
    }
  }

  _rebuildLootTable() {
    if (!this.lootWrap || !this.lootList) return;
    if (this.mode !== '2d') {
      this.lootWrap.style.display = 'none';
      return;
    }

    const chestItems = (this.chest && this.chest.open)
      ? this.chest.loot.map((it, i) => it ? { item: it, src: { sourceType: 'chest', index: i } } : null).filter(Boolean)
      : [];

    const bagItems = [];
    this.droppedBags.forEach((bag, bi) => {
      const dist = Math.hypot(this.player.x3 - (bag.tx + 0.5), this.player.z3 - (bag.ty + 0.5));
      if (dist < 2.5) {
        bag.items.forEach((it, ii) => {
          if (it) bagItems.push({ item: it, src: { sourceType: 'bag', bagIndex: bi, index: ii } });
        });
      }
    });

    const allItems = [...chestItems, ...bagItems];

    if (!allItems.length) {
      this.lootWrap.style.display = 'none';
      return;
    }

    this.lootWrap.style.display = 'block';
    this.lootList.innerHTML = '';

    allItems.forEach(({ item, src }) => {
      const row = document.createElement('div');
      row.className = 'loot-item-row';
      row.draggable = true;
      row.innerHTML =
        `<span class="loot-item-icon">${item.icon}</span>` +
        `<span class="loot-item-name">${item.name}</span>` +
        `<span class="loot-item-rarity">${item.rarity}</span>`;
      row.title = item.description || item.name;

      row.addEventListener('dragstart', e => {
        e.dataTransfer.setData('lootSource', JSON.stringify(src));
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('mousedown', e => e.stopPropagation());
      row.addEventListener('click', e => {
        e.stopPropagation();
        const slot = this.player.addToBackpack(item);
        if (slot >= 0) {
          this._clearLootItem(src);
          this._unlockItem(item);
          this._rebuildInventoryUI();
          this._rebuildLootTable();
          this._showTooltip('Picked up: ' + item.name, 1500);
        } else {
          this._showTooltip('Backpack full!', 2000);
        }
      });
      this.lootList.appendChild(row);
    });
  }

  _clearLootItem(src) {
    if (src.sourceType === 'chest' && this.chest) {
      this.chest.loot[src.index] = null;
      if (this.chest.itemMeshes && this.chest.itemMeshes[src.index]) {
        this.renderer3d.scene.remove(this.chest.itemMeshes[src.index]);
        this.chest.itemMeshes[src.index] = null;
      }
    } else if (src.sourceType === 'bag') {
      const bag = this.droppedBags[src.bagIndex];
      if (bag) {
        bag.items[src.index] = null;
        if (!bag.items.some(Boolean)) {
          if (bag.mesh) this.renderer3d.scene.remove(bag.mesh);
          this.droppedBags.splice(src.bagIndex, 1);
        }
      }
    }
  }

  _showItemTooltip(item, x, y) {
    if (!this.itemTip || !item) return;
    let html = `<div class="tip-name">${item.name}</div>`;
    html += `<div class="tip-rarity ${item.rarity}">${item.rarity}</div>`;
    if (item.description) html += `<div class="tip-desc">${item.description}</div>`;
    if (item.stats) {
      const statNames = { damage: 'Damage', evasion: 'Evasion', magic: 'Magic', hp: 'HP' };
      for (const [k, v] of Object.entries(item.stats)) {
        const label = statNames[k] || k;
        const display = k === 'evasion' ? `+${v * 5}%` : `+${v}`;
        html += `<div class="tip-stat-row"><span class="tip-stat-name">${label}</span><span>${display}</span></div>`;
      }
    }
    if (item.range != null) {
      html += `<div class="tip-stat-row"><span class="tip-stat-name">Range</span><span>${item.range} tiles</span></div>`;
    }
    if (item.effect && item.effect.heal) {
      html += `<div class="tip-stat-row"><span class="tip-stat-name">Heals</span><span>+${item.effect.heal} HP</span></div>`;
    }
    this.itemTip.innerHTML = html;
    this._positionItemTooltip(x, y);
    this.itemTip.classList.add('visible');
  }

  _positionItemTooltip(x, y) {
    if (!this.itemTip) return;
    const tw = this.itemTip.offsetWidth  || 160;
    const th = this.itemTip.offsetHeight || 80;
    let lx = x + 14, ly = y + 14;
    if (lx + tw > window.innerWidth  - 8) lx = x - tw - 6;
    if (ly + th > window.innerHeight - 8) ly = y - th - 6;
    this.itemTip.style.left = lx + 'px';
    this.itemTip.style.top  = ly + 'px';
  }

  _hideItemTooltip() {
    if (this.itemTip) this.itemTip.classList.remove('visible');
  }

  _equipFromBackpack(slotIdx, item) {
    const slotType = item.type;
    if (!['weapon', 'helmet', 'armor', 'emblem'].includes(slotType)) return;
    const prev = this.player.equipped[slotType];
    this.player.equipped[slotType] = item;
    this.player.backpack[slotIdx] = prev;
    this._rebuildInventoryUI();
    this._showTooltip('Equipped ' + item.name, 1500);
  }

  _dropItemFromBackpack(slotIdx) {
    const item = this.player.backpack[slotIdx];
    if (!item) return;
    this.player.backpack[slotIdx] = null;
    const tx = Math.floor(this.player.x3);
    const ty = Math.floor(this.player.z3);
    this._addDroppedBag(tx, ty, item);
    this._rebuildInventoryUI();
    this._rebuildLootTable();
    this._showTooltip('Dropped: ' + item.name, 1500);
  }

  _addDroppedBag(tx, ty, item) {
    const bag = { tx, ty, items: [item], mesh: null };
    if (this.renderer3d._ready) {
      const geo  = new THREE.SphereGeometry(0.15, 6, 6);
      const mat  = new THREE.MeshLambertMaterial({ color: 0x8b6914, emissive: 0x1a0800 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(tx + 0.5, 0.2, ty + 0.5);
      this.renderer3d.scene.add(mesh);
      bag.mesh = mesh;
    }
    this.droppedBags.push(bag);
  }

  _unlockItem(item) {
    if (!item || !item.id) return;
    const key      = 'fighthing_unlocked';
    const unlocked = JSON.parse(localStorage.getItem(key) || '[]');
    if (!unlocked.includes(item.id)) {
      unlocked.push(item.id);
      localStorage.setItem(key, JSON.stringify(unlocked));
    }
  }

  // ── Tooltip ───────────────────────────────────────────────────
  _showTooltip(text, duration) {
    this.tooltip.innerHTML = text.replace(/\n/g, '<br>');
    this.tooltip.classList.add('visible');
    clearTimeout(this._tooltipTimeout);
    this._tooltipTimeout = setTimeout(() => this.tooltip.classList.remove('visible'), duration);
  }

  // ── Input ─────────────────────────────────────────────────────
  _onKeyDown(e) {
    const key = e.key.toLowerCase();
    this.keys[key] = true;

    if (key === 'shift') { e.preventDefault(); this._shiftDimension(); return; }
    if (key === ' ')     { e.preventDefault(); return; }

    if (key === 'e') {
      e.preventDefault();
      this._handleInteract();
      return;
    }

    if (key === 'f' && this.mode === '2d') {
      e.preventDefault();
      if (this.player.usePotion()) {
        this._rebuildHeartsHUD();
        this._rebuildBackpackSlots();
        this._showTooltip('Used Health Potion! +1 HP', 1500);
      } else {
        this._showTooltip('No potions available.', 1500);
      }
      return;
    }

    // Number keys 1-8 to use slot
    const slotNum = parseInt(e.key);
    if (slotNum >= 1 && slotNum <= 8) {
      e.preventDefault();
      const i = slotNum - 1;
      const item = this.player.backpack[i];
      if (item && this.player.useSlot(i)) {
        this._rebuildHeartsHUD();
        this._rebuildBackpackSlots();
        this._showTooltip(`Used ${item.name}`, 1500);
      }
    }
  }

  _onKeyUp(e) { delete this.keys[e.key.toLowerCase()]; }

  _onMouseMove(e) {
    if (this.mode === '3d' && this.pointerLocked) {
      this.player.yaw   += e.movementX * 0.002;
      this.player.pitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH,
        this.player.pitch - e.movementY * 0.002));
    } else {
      const rect = this.canvas2d.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    }
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    // Don't shoot if clicking on the inventory panel
    if (this.invPanel && this.invPanel.contains(e.target)) return;
    this.mouseDown = true;
    if (this.mode === '3d' && !this.pointerLocked) {
      const p = this.gameScreen.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
  }

  _onMouseUp(e) { if (e.button === 0) this.mouseDown = false; }

  _onPointerLockChange() {
    this.pointerLocked = document.pointerLockElement === this.gameScreen;
    if (!this.pointerLocked && this.mode === '3d')
      this._showTooltip('Mouse released — click to re-capture', 4000);
  }

  _onResize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.renderer2d.resize(W, H);
    this.renderer3d.resize(W, H);
  }

  _addListeners() {
    window.addEventListener('keydown',    this._boundKeyDown);
    window.addEventListener('keyup',      this._boundKeyUp);
    window.addEventListener('mousemove',  this._boundMouseMove);
    window.addEventListener('mousedown',  this._boundMouseDown);
    window.addEventListener('mouseup',    this._boundMouseUp);
    window.addEventListener('resize',     this._boundResize);
    window.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', this._boundLockChange);
    this.canvas2d.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    this.canvas2d.addEventListener('drop', e => {
      e.preventDefault();
      let src;
      try { src = JSON.parse(e.dataTransfer.getData('lootSource')); } catch (_) { return; }
      if (!src || src.sourceType !== 'backpack') return;
      this._dropItemFromBackpack(src.slot);
    });
  }

  _removeListeners() {
    window.removeEventListener('keydown',    this._boundKeyDown);
    window.removeEventListener('keyup',      this._boundKeyUp);
    window.removeEventListener('mousemove',  this._boundMouseMove);
    window.removeEventListener('mousedown',  this._boundMouseDown);
    window.removeEventListener('mouseup',    this._boundMouseUp);
    window.removeEventListener('resize',     this._boundResize);
    document.removeEventListener('pointerlockchange', this._boundLockChange);
  }
}
