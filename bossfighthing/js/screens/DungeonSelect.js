class DungeonSelect {
  constructor(onBack, onSelect) {
    this.onBack = onBack;
    this.onSelect = onSelect;
    this.el = document.getElementById('screen-dungeon-select');
  }

  show() {
    this._render();
    showScreen('dungeon-select');
  }

  _render() {
    this.el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen-wrap';

    const back = document.createElement('button');
    back.className = 'btn btn-secondary back-btn';
    back.textContent = '← Back';
    back.addEventListener('click', () => this.onBack());
    wrap.appendChild(back);

    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = 'Select Dungeon';
    wrap.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'screen-sub';
    sub.textContent = 'Choose your battlefield';
    wrap.appendChild(sub);

    const grid = document.createElement('div');
    grid.className = 'dungeon-grid';

    DUNGEONS.forEach(dungeon => {
      const card = document.createElement('div');
      card.className = 'dungeon-card' + (dungeon.unlocked ? '' : ' locked');

      const icon = document.createElement('div');
      icon.className = 'dungeon-icon';
      icon.textContent = dungeon.icon;

      const name = document.createElement('div');
      name.className = 'dungeon-name';
      name.textContent = dungeon.name;

      const desc = document.createElement('div');
      desc.className = 'dungeon-desc';
      desc.textContent = dungeon.description;

      const rec = document.createElement('div');
      rec.className = 'dungeon-rec';
      rec.textContent = dungeon.recommended;

      card.appendChild(icon);
      card.appendChild(name);
      card.appendChild(desc);
      card.appendChild(rec);

      if (dungeon.unlocked) {
        card.addEventListener('click', () => this.onSelect(dungeon));
      }

      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    this.el.appendChild(wrap);
  }
}
