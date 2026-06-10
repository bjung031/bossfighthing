class DifficultySelect {
  constructor(onBack, onConfirm) {
    this.onBack = onBack;
    this.onConfirm = onConfirm;
    this.el = document.getElementById('screen-difficulty-select');
    this.dungeon = null;
    this.selectedDiff = null;
  }

  show(dungeon) {
    this.dungeon = dungeon;
    this.selectedDiff = dungeon.difficulties.find(d => d.unlocked) || null;
    this._render();
    showScreen('difficulty-select');
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
    title.textContent = 'Select Difficulty';
    wrap.appendChild(title);

    const dunLabel = document.createElement('div');
    dunLabel.className = 'diff-dungeon-label';
    dunLabel.textContent = this.dungeon.icon + '  ' + this.dungeon.name;
    wrap.appendChild(dunLabel);

    const grid = document.createElement('div');
    grid.className = 'diff-grid';

    this.dungeon.difficulties.forEach(diff => {
      const card = document.createElement('div');
      card.className = 'diff-card' +
        (diff.unlocked ? '' : ' locked') +
        (this.selectedDiff && this.selectedDiff.stars === diff.stars ? ' selected' : '');

      const stars = document.createElement('div');
      stars.className = 'diff-stars';
      stars.textContent = '★'.repeat(diff.stars) + '☆'.repeat(5 - diff.stars);

      const label = document.createElement('div');
      label.className = 'diff-label';
      label.textContent = diff.label;

      card.appendChild(stars);
      card.appendChild(label);

      if (diff.unlocked) {
        card.addEventListener('click', () => {
          this.selectedDiff = diff;
          this._render();
        });
      }

      grid.appendChild(card);
    });

    wrap.appendChild(grid);

    const startBtn = document.createElement('button');
    startBtn.className = 'btn';
    startBtn.textContent = 'Enter Dungeon';
    startBtn.disabled = !this.selectedDiff;
    startBtn.addEventListener('click', () => {
      if (this.selectedDiff) this.onConfirm(this.dungeon, this.selectedDiff);
    });
    wrap.appendChild(startBtn);

    this.el.appendChild(wrap);
  }
}
