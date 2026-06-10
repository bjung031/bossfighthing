// ── Screen helpers ───────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
}

// ── App state ────────────────────────────────────────────
let selectedCharacterData = null;
let selectedDungeon       = null;
let activeGame            = null;

// ── Screen instances ─────────────────────────────────────
const mainMenu = new MainMenu(() => {
  charSelect.show();
});

const charSelect = new CharacterSelect(
  () => mainMenu.show(),
  (charData) => {
    selectedCharacterData = charData;
    dungeonSelect.show();
  }
);

const dungeonSelect = new DungeonSelect(
  () => charSelect.show(),
  (dungeon) => {
    selectedDungeon = dungeon;
    diffSelect.show(dungeon);
  }
);

const diffSelect = new DifficultySelect(
  () => dungeonSelect.show(),
  (dungeon, difficulty) => {
    startGame(dungeon.id, difficulty.stars);
  }
);

function startGame(dungeonId, difficultyStars) {
  if (activeGame) { activeGame.stop(); activeGame = null; }

  showScreen('game');

  activeGame = new Game();
  activeGame.load(dungeonId, difficultyStars, selectedCharacterData);
  activeGame.start();
}

// ── Boot ──────────────────────────────────────────────────
mainMenu.show();
