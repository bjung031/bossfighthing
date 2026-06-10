# Fighthing — Project Notes for Claude

## Critical Rule: Always Update the Level Editor

Whenever a new tile type, entity type, or game object is added to the game, it **must** also be added to the level editor (`js/editor/Editor.js`) with:

1. An entry in `TOOL_SECTIONS` under the appropriate section (Tiles / Entities / Tools)
2. A color swatch for the palette button
3. 2D canvas rendering in `_draw2D()` (via `TILE_COLORS` map or a custom draw block)
4. 3D scene rendering in `_rebuildScene()` (appropriate Three.js geometry and material)
5. Export support in `_toJSON()` and `_copyCode()`
6. Import support in `_loadJSON()`

## Architecture Overview

### Game files (in `js/game/`)
- `Map.js` — tile constants (`T`), `PEDESTAL_HEIGHT`, `GameMap` class with walkability methods
- `Player.js` — player state, tile-space bullet system, `shoot()` / `shootDirection()` / `takeDamage()`
- `TileRenderer2D.js` — top-down canvas renderer; `render(map, player, camX, camY, entities)`
- `Renderer3D.js` — Three.js first-person renderer; `update(player, map, entities)`; bullet sphere pool
- `BossRoom.js` — `Turret`, `SpiderBoss`, `BossRoom` classes; injects Three.js meshes into renderer scene
- `Tutorial.js` — `buildTutorialMap()` function, H=90, boss room at top (y=1–16), WEB tiles
- `Game.js` — main game loop; `transAlpha` lerp for 2D/3D blend; boss room integration

### Bullet system
All bullets (player and enemy) are tile-space objects:
```
{ tx, ty, y3, vx, vz, vy3, life, friendly }
```
Rendered in both 2D (as circles at `tx*TILE_SIZE+offX`) and 3D (as sphere pool meshes at `(tx, y3, ty)`).

### Mode transition
- `transAlpha` lerps at 3.5/s between 0 (2D) and 1 (3D)
- On 2D→3D: player yaw is derived from mouse cursor direction
- On 3D→2D: player facing direction is derived from yaw

### Tile types (T object in Map.js)
| Value | Name     | Notes                              |
|-------|----------|------------------------------------|
| 0     | EMPTY    | Out-of-bounds (blocked)            |
| 1     | FLOOR    | Normal walkable floor              |
| 2     | WALL     | Solid — blocked always             |
| 3     | DOOR     | Walkable floor variant             |
| 4     | PEDESTAL | Solid in 2D; jumpable in 3D        |
| 5     | COIN     | Not a tile (object layer)          |
| 6     | SIGN     | Walkable; triggers tooltip         |
| 7     | WEB      | Walkable; slows player 0.5×        |

### Editor (`js/editor/Editor.js`)
- `TOOL_SECTIONS` — sections: Tiles, Entities, Tools
- Entities stored in `this.entities = {}` map keyed `"tx,ty"` → `{ type, y3 }`
- Entities exported in JSON (version 2 format) and JS code output
