// Tutorial map: 26 wide × 90 tall
// Player spawns at bottom; rooms connect upward; boss room at top.

function buildTutorialMap() {
  const W = 26, H = 90;
  const tiles = [];
  for (let y = 0; y < H; y++) {
    tiles.push(new Array(W).fill(T.WALL));
  }

  function carve(x1, y1, x2, y2, type = T.FLOOR) {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++)
        tiles[y][x] = type;
  }

  // ── Boss room ────────────────────────────────────────
  carve(2, 1, 23, 16);
  // Corridor down to room 4
  carve(11, 16, 14, 22);

  // ── Room 4: Dimension shift room ─────────────────────
  carve(3, 22, 22, 33);
  // Pedestals (only reachable in 3D)
  tiles[27][12] = T.PEDESTAL;
  tiles[27][13] = T.PEDESTAL;
  carve(11, 33, 14, 36);

  // ── Room 3: Wide room with obstacles ─────────────────
  carve(2, 36, 23, 47);
  tiles[40][6]  = T.WALL;
  tiles[40][7]  = T.WALL;
  tiles[40][19] = T.WALL;
  tiles[40][20] = T.WALL;
  tiles[38][6]  = T.WALL;
  tiles[38][7]  = T.WALL;
  tiles[38][19] = T.WALL;
  tiles[38][20] = T.WALL;
  carve(11, 47, 14, 50);

  // ── Room 2: Shooting tutorial ────────────────────────
  carve(3, 50, 22, 61);
  carve(11, 61, 14, 64);

  // ── Room 1: WASD tutorial ────────────────────────────
  carve(3, 64, 22, 75);
  carve(11, 75, 14, 78);

  // ── Room 0: Spawn room ───────────────────────────────
  carve(3, 78, 22, 88);

  // ── Signs ────────────────────────────────────────────
  const signCoords = [
    [12, 83], // Room 0
    [12, 69], // Room 1
    [12, 55], // Room 2
    [8,  52], // Room 2 tip
    [12, 42], // Room 3
    [12, 30], // Room 4
    [7,  28], // Room 4 3D hint
    [17, 28], // Room 4 pedestal hint
    [12, 20], // Boss approach warning (corridor)
    [12, 3],  // Boss room intro
  ];
  signCoords.forEach(([x, y]) => { tiles[y][x] = T.SIGN; });

  const triggers = [
    { tx: 12, ty: 83, type: 'sign', text: 'Welcome to Fighthing!\nUse WASD to move.' },
    { tx: 12, ty: 69, type: 'sign', text: 'Use WASD to move around.\nExplore this room.' },
    { tx: 12, ty: 55, type: 'sign', text: 'Aim with your mouse and\nleft-click to shoot!' },
    { tx: 8,  ty: 52, type: 'sign', text: 'Tip: Your projectile\nflies toward your cursor.' },
    { tx: 12, ty: 42, type: 'sign', text: 'Navigate around the pillars.\nStay mobile!' },
    { tx: 12, ty: 30, type: 'sign', text: 'Press SHIFT to switch\nyour dimensional view!' },
    { tx: 7,  ty: 28, type: 'sign', text: 'In 3D, jump with SPACE.\nClimb the pedestals!' },
    { tx: 17, ty: 28, type: 'sign', text: 'You can see coins atop\nthe pedestals from 2D...\nbut you need 3D to reach them!' },
    { tx: 12, ty: 20, type: 'sign', text: 'BOSS AHEAD: VESPERA,\nTHE BROODMOTHER.\nRed circles on the ground mean\nGET OUT — every attack is telegraphed.' },
    { tx: 12, ty: 3,  type: 'sign', text: 'Her egg turrets hang 3 tiles up —\nuse 3D (SHIFT) to destroy them.\nWhen she shields, break BOTH eggs:\nshe\'ll be VULNERABLE to 2x damage!' },
  ];

  const objects = [
    { type: 'coin', tx: 12, ty: 27, pedestal: true },
    { type: 'coin', tx: 13, ty: 27, pedestal: true },
  ];

  return new GameMap({
    tiles,
    objects,
    triggers,
    spawnX: 12,
    spawnY: 83,
    width:  W,
    height: H,
  });
}
