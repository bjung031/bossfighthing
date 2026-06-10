const T = {
  EMPTY:    0,
  FLOOR:    1,
  WALL:     2,
  DOOR:     3,
  PEDESTAL: 4,
  COIN:     5,
  SIGN:     6,
  WEB:      7,
};

const PEDESTAL_HEIGHT = 0.6; // world units

class GameMap {
  constructor(def) {
    this.tiles    = def.tiles;
    this.objects  = def.objects  || [];
    this.triggers = def.triggers || [];
    this.spawnX   = def.spawnX;
    this.spawnY   = def.spawnY;
    this.height   = def.tiles.length;
    this.width    = def.tiles[0].length;
    this.collectedCoins = new Set();
    this.openedDoors    = new Set();
  }

  tileAt(tx, ty) {
    if (ty < 0 || ty >= this.height || tx < 0 || tx >= this.width) return T.WALL;
    return this.tiles[ty][tx];
  }

  // Used only for bullet collision (bullets don't jump, treat pedestal as solid)
  isWalkable(tx, ty) {
    const t = this.tileAt(tx, ty);
    return t === T.FLOOR || t === T.DOOR || t === T.SIGN || t === T.WEB;
  }

  // 2D top-down: pedestals are solid obstacles (height-aware check done in Player._move2D)
  isWalkable2D(tx, ty) {
    const t = this.tileAt(tx, ty);
    return t === T.FLOOR || t === T.DOOR || t === T.SIGN || t === T.WEB;
  }

  // 3D: pedestal is only passable if the player is above its surface
  isWalkable3D(tx, ty, playerY) {
    const t = this.tileAt(tx, ty);
    if (t === T.WALL || t === T.EMPTY) return false;
    if (t === T.PEDESTAL) return playerY >= PEDESTAL_HEIGHT - 0.05;
    return true;
  }

  getSignAt(tx, ty) {
    return this.triggers.find(tr => tr.tx === tx && tr.ty === ty && tr.type === 'sign');
  }

  getCoinAt(tx, ty) {
    const key = tx + ',' + ty;
    if (this.collectedCoins.has(key)) return null;
    return this.objects.find(o => o.type === 'coin' && o.tx === tx && o.ty === ty);
  }

  collectCoin(tx, ty) {
    this.collectedCoins.add(tx + ',' + ty);
  }
}
