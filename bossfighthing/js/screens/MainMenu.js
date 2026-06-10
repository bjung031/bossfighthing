class MainMenu {
  constructor(onPlay) {
    this.onPlay = onPlay;
    this.el = document.getElementById('screen-main-menu');
  }

  show() {
    this.el.innerHTML = '';
    this._buildParticles();
    this._buildContent();
    showScreen('main-menu');
  }

  _buildParticles() {
    const bg = document.createElement('div');
    bg.className = 'menu-bg-particles';
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (6 + Math.random() * 10) + 's';
      p.style.animationDelay = (Math.random() * 8) + 's';
      p.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
      p.style.width = p.style.height = (1 + Math.random() * 2) + 'px';
      p.style.opacity = (0.3 + Math.random() * 0.7).toString();
      bg.appendChild(p);
    }
    this.el.appendChild(bg);
  }

  _buildContent() {
    const title = document.createElement('div');
    title.className = 'menu-title';
    title.textContent = 'Fighthing';

    const sub = document.createElement('div');
    sub.className = 'menu-subtitle';
    sub.textContent = 'Boss Fight RPG';

    const playBtn = document.createElement('button');
    playBtn.className = 'btn';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => this.onPlay());

    this.el.appendChild(title);
    this.el.appendChild(sub);
    this.el.appendChild(playBtn);
  }
}
