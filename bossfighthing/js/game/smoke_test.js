// Headless smoke test for BossRoom.js — stub THREE, simulate full fight
class Color { constructor() {} setHex() { return this; } }
class Vec3 {
  constructor(x=0,y=0,z=0){ this.x=x;this.y=y;this.z=z; }
  set(x,y,z){ this.x=x;this.y=y;this.z=z; return this; }
  setScalar(s){ this.x=this.y=this.z=s; return this; }
  normalize(){ return this; }
}
class Quat { setFromUnitVectors(){ return this; } }
class Obj3D {
  constructor(){ this.position=new Vec3(); this.rotation=new Vec3(); this.scale=new Vec3(1,1,1);
    this.quaternion=new Quat(); this.children=[]; this.visible=true; this.userData={};
    this.castShadow=false; this.receiveShadow=false; this.frustumCulled=true; }
  add(c){ this.children.push(c); return this; }
  remove(){ return this; }
}
class Mat { constructor(p={}){ Object.assign(this,p); this.color=new Color(); this.emissive=new Color();
  this.opacity=p.opacity??1; this.emissiveIntensity=1; }
  clone(){ return new Mat(); } }
class Geo { constructor(){ this.attributes={}; }
  setAttribute(n,a){ this.attributes[n]=a; return this; }
  setDrawRange(){ return this; } }
class BufAttr { constructor(arr,sz){ this.array=arr; this.itemSize=sz; this.needsUpdate=false; } }

global.THREE = {
  Group: Obj3D,
  Mesh: class extends Obj3D { constructor(g,m){ super(); this.geometry=g; this.material=m; } },
  Points: class extends Obj3D { constructor(g,m){ super(); this.geometry=g; this.material=m; } },
  LineSegments: class extends Obj3D { constructor(g,m){ super(); this.geometry=g; this.material=m; } },
  PointLight: class extends Obj3D { constructor(c,i,d){ super(); this.color=new Color(); this.intensity=i; this.distance=d; } },
  SphereGeometry: Geo, CylinderGeometry: Geo, ConeGeometry: Geo, BoxGeometry: Geo,
  RingGeometry: Geo, CircleGeometry: Geo, TorusGeometry: Geo, IcosahedronGeometry: Geo,
  PlaneGeometry: Geo, BufferGeometry: Geo, BufferAttribute: BufAttr,
  MeshLambertMaterial: Mat, MeshBasicMaterial: Mat, PointsMaterial: Mat, LineBasicMaterial: Mat,
  Vector3: Vec3, AdditiveBlending: 2, DoubleSide: 2,
};
global.performance = { now: () => simTime * 1000 };
let simTime = 0;

const fs = require('fs');
const src = fs.readFileSync('/home/claude/bossrework/BossRoom.js', 'utf8');
const { BossRoom } = eval(src + '\n;({ BossRoom, SpiderBoss, Turret });');

// Fake scene / map / player
const scene = new Obj3D();
const map = { isWalkable: (tx, ty) => tx >= 2 && tx <= 23 && ty >= 1 && ty <= 16 };
const player = {
  x3: 12, z3: 13, y3: 0, webSlowTimer: 0, hpHits: 0,
  takeDamage(n) { this.hpHits += n; },
  bullets: [],
};

const room = new BossRoom();
room.init(scene, {});
console.log('init OK — turrets:', room.turrets.length, 'boss hp:', room.boss.hp);

const seen = new Set();
const dt = 1 / 60;
let maxBullets = 0;
for (let frame = 0; frame < 60 * 600 && !room.isDefeated(); frame++) {
  simTime += dt;
  // Player strafes in a circle and shoots the boss / turrets / eggs
  player.x3 = 12.5 + Math.cos(simTime * 0.7) * 4;
  player.z3 = 8.5 + Math.sin(simTime * 0.7) * 4;

  room.update(dt, player, map, frame % 600 < 300 ? '3d' : '2d');

  // Simulate landing hits at a realistic cadence (~13 dps on boss)
  if (frame % 80 === 0) {
    room.turrets.forEach(t => t.takeDamage(25));
    player.bullets = [{ tx: room.boss.x3, ty: room.boss.z3, y3: room.boss.y3 + 0.3, vx:0, vz:0, vy3:0, life:1, friendly:true }];
    room.checkPlayerBullets(player.bullets, '3d');
  } else {
    player.bullets = [];
  }

  seen.add(room.boss.attackMode);
  maxBullets = Math.max(maxBullets, room.bullets.length);
}

console.log('attack modes seen:', [...seen].sort().join(', '));
console.log('max concurrent enemy bullets:', maxBullets);
console.log('player damage events:', player.hpHits);
console.log('boss dead:', room.boss.dead, '| defeated:', room.isDefeated());
console.log('telegraph snapshot shape:', JSON.stringify(room.boss.telegraphs[0] || null));
console.log('venom pool snapshot shape:', JSON.stringify(room.boss.venomPools[0] || null));
if (!room.isDefeated()) { console.error('FAIL: fight never completed'); process.exit(1); }
console.log('SMOKE TEST PASSED');
