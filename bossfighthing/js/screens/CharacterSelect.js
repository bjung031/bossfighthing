class CharacterSelect {
  constructor(onBack, onConfirm) {
    this.onBack = onBack;
    this.onConfirm = onConfirm;
    this.el = document.getElementById('screen-char-select');
    this.selectedChar = CHARACTERS.find(c => c.id === 'warrior');
    this.equippedGear = { ...this.selectedChar.startingGear };
  }

  show() {
    this._render();
    showScreen('char-select');
  }

  _render() {
    this.el.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'screen-wrap';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary back-btn';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => this.onBack());
    wrap.appendChild(backBtn);

    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = 'Choose Your Fighter';
    wrap.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'screen-sub';
    sub.textContent = 'Select a class to begin your journey';
    wrap.appendChild(sub);

    // Character grid
    const grid = document.createElement('div');
    grid.className = 'char-grid';
    CHARACTERS.forEach(char => {
      const card = document.createElement('div');
      card.className = 'char-card' +
        (char.unlocked ? '' : ' locked') +
        (this.selectedChar.id === char.id ? ' selected' : '');

      const portrait = document.createElement('div');
      portrait.className = 'char-portrait';
      portrait.textContent = char.icon;

      const name = document.createElement('div');
      name.className = 'char-name';
      name.textContent = char.name;

      card.appendChild(portrait);
      card.appendChild(name);

      if (char.unlocked) {
        card.addEventListener('click', () => {
          this.selectedChar = char;
          this.equippedGear = { ...char.startingGear };
          this._render();
        });
      }
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    // Bottom panel: stats + gear
    const panel = document.createElement('div');
    panel.className = 'char-panel';

    panel.appendChild(this._buildStatsPanel());
    panel.appendChild(this._buildGearPanel());
    wrap.appendChild(panel);

    // Play button
    const playBtn = document.createElement('button');
    playBtn.className = 'btn';
    playBtn.textContent = 'Play as ' + this.selectedChar.name;
    playBtn.style.marginBottom = '40px';
    playBtn.addEventListener('click', () => {
      this.onConfirm({ character: this.selectedChar, gear: this.equippedGear });
    });
    wrap.appendChild(playBtn);

    this.el.appendChild(wrap);
  }

  _buildStatsPanel() {
    const div = document.createElement('div');
    div.className = 'char-stats';

    const h3 = document.createElement('h3');
    h3.textContent = 'Base Stats';
    div.appendChild(h3);

    const stats = this.selectedChar.stats;
    const rows = [
      { key: 'damage',  label: 'Attack',  cls: 'damage'  },
      { key: 'evasion', label: 'Evasion', cls: 'defense' },
      { key: 'magic',   label: 'Magic',   cls: 'magic'   },
    ];
    rows.forEach(({ key, label, cls }) => {
      const row = document.createElement('div');
      row.className = 'stat-row';

      const lbl = document.createElement('div');
      lbl.className = 'stat-label';
      lbl.textContent = label;

      const bar = document.createElement('div');
      bar.className = 'stat-bar';

      const fill = document.createElement('div');
      fill.className = 'stat-fill ' + cls;
      fill.style.width = ((stats[key] / 5) * 100) + '%';
      bar.appendChild(fill);

      const val = document.createElement('div');
      val.className = 'stat-val';
      val.textContent = key === 'evasion' ? (stats[key] * 5) + '%' : stats[key] + '/5';

      row.appendChild(lbl);
      row.appendChild(bar);
      row.appendChild(val);
      div.appendChild(row);
    });

    return div;
  }

  _buildGearPanel() {
    const div = document.createElement('div');
    div.className = 'char-gear';

    const h3 = document.createElement('h3');
    h3.textContent = 'Equipped Gear';
    div.appendChild(h3);

    const slots = document.createElement('div');
    slots.className = 'gear-slots';

    const slotDefs = [
      { key: 'weapon',  label: 'Weapon'   },
      { key: 'helmet',  label: 'Helmet'   },
      { key: 'armor',   label: 'Armor'    },
      { key: 'emblem',  label: 'Emblem'   },
    ];

    slotDefs.forEach(({ key, label }) => {
      const equippedId = this.equippedGear[key];
      const gearList = GEAR_DATA[key];
      const equippedItem = gearList.find(g => g.id === equippedId) || gearList[0];

      const slot = document.createElement('div');
      slot.className = 'gear-slot';

      const icon = document.createElement('div');
      icon.className = 'gear-slot-icon';
      icon.textContent = equippedItem ? equippedItem.icon : '❓';

      const info = document.createElement('div');
      info.className = 'gear-slot-info';

      const type = document.createElement('div');
      type.className = 'gear-slot-type';
      type.textContent = label;

      const name = document.createElement('div');
      name.className = 'gear-slot-name';
      name.textContent = equippedItem ? equippedItem.name : 'Empty';

      info.appendChild(type);
      info.appendChild(name);
      slot.appendChild(icon);
      slot.appendChild(info);

      if (this.selectedChar.unlocked) {
        slot.addEventListener('click', () => this._openGearPicker(key));
      }

      slots.appendChild(slot);
    });

    div.appendChild(slots);
    return div;
  }

  _openGearPicker(slotKey) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const title = document.createElement('h2');
    title.textContent = 'Choose ' + slotKey.charAt(0).toUpperCase() + slotKey.slice(1);
    modal.appendChild(title);

    const list = document.createElement('div');
    list.className = 'gear-list';

    const unlockedIds = JSON.parse(localStorage.getItem('fighthing_unlocked') || '[]');
    GEAR_DATA[slotKey].forEach(item => {
      const available = item.unlocked || unlockedIds.includes(item.id);
      const row = document.createElement('div');
      row.className = 'gear-item' +
        (this.equippedGear[slotKey] === item.id ? ' equipped' : '') +
        (!available ? ' locked' : '');

      const icon = document.createElement('div');
      icon.className = 'gear-item-icon';
      icon.textContent = item.icon;

      const info = document.createElement('div');
      const itemName = document.createElement('div');
      itemName.className = 'gear-item-name';
      itemName.textContent = item.name;

      const rarity = document.createElement('div');
      rarity.className = 'gear-item-rarity';
      rarity.textContent = available ? item.rarity : '🔒 Locked';
      info.appendChild(itemName);
      info.appendChild(rarity);

      row.appendChild(icon);
      row.appendChild(info);

      if (this.equippedGear[slotKey] === item.id) {
        const badge = document.createElement('div');
        badge.className = 'gear-equipped-badge';
        badge.textContent = 'Equipped';
        row.appendChild(badge);
      }

      if (available) {
        row.addEventListener('click', () => {
          this.equippedGear[slotKey] = item.id;
          document.body.removeChild(overlay);
          this._render();
        });
      }

      list.appendChild(row);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-secondary modal-close';
    closeBtn.textContent = 'Cancel';
    closeBtn.addEventListener('click', () => document.body.removeChild(overlay));

    modal.appendChild(list);
    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) document.body.removeChild(overlay); });
    document.body.appendChild(overlay);
  }
}
