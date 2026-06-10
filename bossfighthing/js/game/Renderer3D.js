class Renderer3D {
  constructor(container) {
    this.container   = container;
    this.scene       = null;
    this.camera      = null;
    this.weaponScene = null;
    this.weaponCamera= null;
    this.weaponGroup = null;
    this.renderer    = null;
    this.tileObjects = [];
    this.coinObjects = {};
    this.movingLight = null;
    this._ready      = false;
    this._bulletPool      = [];  // player bullet mesh pool
    this._bulletPoolEnemy = [];  // enemy bullet mesh pool
  }

  init() {
    const W = window.innerWidth;
    const H = window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080612);
    this.scene.fog = new THREE.Fog(0x080612, 14, 40);

    this.camera = new THREE.PerspectiveCamera(75, W / H, 0.05, 200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0x223355, 1.4));

    const dirLight = new THREE.DirectionalLight(0x8899cc, 0.8);
    dirLight.position.set(4, 8, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(dirLight);

    const fill = new THREE.DirectionalLight(0x332244, 0.4);
    fill.position.set(-3, 2, -4);
    this.scene.add(fill);

    const movingPt = new THREE.PointLight(0x7b4fff, 2.5, 12);
    movingPt.position.set(0, 2, 0);
    this.scene.add(movingPt);
    this.movingLight = movingPt;

    // Weapon overlay scene
    this.weaponScene  = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(60, W / H, 0.05, 5);
    this.weaponScene.add(new THREE.AmbientLight(0x556688, 1.8));
    const weaponPt = new THREE.PointLight(0xffffff, 1.2, 3);
    weaponPt.position.set(0.4, 0.8, 0.4);
    this.weaponScene.add(weaponPt);

    this._buildWeapon();

    // Pre-allocate bullet sphere pools
    const bulletGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const playerBulletMat = new THREE.MeshLambertMaterial({ color: 0xff8844, emissive: 0x441100 });
    const enemyBulletMat  = new THREE.MeshLambertMaterial({ color: 0xff44aa, emissive: 0x441133 });

    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(bulletGeo, playerBulletMat);
      m.visible = false;
      this.scene.add(m);
      this._bulletPool.push(m);

      const me = new THREE.Mesh(bulletGeo, enemyBulletMat);
      me.visible = false;
      this.scene.add(me);
      this._bulletPoolEnemy.push(me);
    }

    // Web ray lines (boss attack)
    const MAX_WEB_RAYS = 32;
    this._webRayPositions = new Float32Array(MAX_WEB_RAYS * 6);
    this._webRayGeo = new THREE.BufferGeometry();
    this._webRayGeo.setAttribute('position', new THREE.BufferAttribute(this._webRayPositions, 3));
    this._webRayGeo.setDrawRange(0, 0);
    const webRayMat = new THREE.LineBasicMaterial({ color: 0x9933ff, transparent: true, opacity: 0.8 });
    this._webRayLines = new THREE.LineSegments(this._webRayGeo, webRayMat);
    this.scene.add(this._webRayLines);

    this._ready = true;
  }

  _buildWeapon() {
    const g = this.weaponGroup = new THREE.Group();
    g.position.set(0.28, -0.36, -0.32);
    g.rotation.set(-0.28, 0.10, 0.08);

    const M = (color, emissive = 0x000000) =>
      new THREE.MeshLambertMaterial({ color, emissive });

    const armorBlue  = M(0x4466bb, 0x0a1230);
    const skinTone   = M(0xc8a86a, 0x1a0800);
    const bronzeMat  = M(0xb87333, 0x3a1800);
    const darkBronze = M(0x8b5e1a, 0x1a0800);
    const steelMat   = M(0x888888, 0x111111);

    const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    const forearm = new THREE.Mesh(bx(0.095, 0.095, 0.32), armorBlue);
    forearm.position.set(0, 0, 0.08);
    g.add(forearm);

    const ridge = new THREE.Mesh(bx(0.095, 0.022, 0.30), steelMat);
    ridge.position.set(0, 0.058, 0.08);
    g.add(ridge);

    const hand = new THREE.Mesh(bx(0.10, 0.095, 0.11), skinTone);
    hand.position.set(0, -0.002, -0.10);
    g.add(hand);

    const grip = new THREE.Mesh(bx(0.055, 0.055, 0.19), darkBronze);
    grip.position.set(0, 0, -0.26);
    g.add(grip);

    const guard = new THREE.Mesh(bx(0.26, 0.038, 0.038), steelMat);
    guard.position.set(0, 0, -0.37);
    g.add(guard);

    const shoulder = new THREE.Mesh(bx(0.052, 0.052, 0.08), bronzeMat);
    shoulder.position.set(0, 0, -0.43);
    g.add(shoulder);

    const blade = new THREE.Mesh(bx(0.042, 0.042, 0.52), bronzeMat);
    blade.position.set(0, 0, -0.71);
    g.add(blade);

    const fuller = new THREE.Mesh(bx(0.012, 0.044, 0.42), darkBronze);
    fuller.position.set(0, 0, -0.68);
    g.add(fuller);

    const tipGeo = new THREE.ConeGeometry(0.03, 0.10, 4);
    const tip = new THREE.Mesh(tipGeo, bronzeMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0, -0.99);
    g.add(tip);

    this.weaponScene.add(g);
  }

  buildFromMap(map) {
    if (!this._ready) return;

    this.tileObjects.forEach(o => this.scene.remove(o));
    this.tileObjects = [];
    Object.values(this.coinObjects).forEach(e => this.scene.remove(e.mesh));
    this.coinObjects = {};

    const floorMat = new THREE.MeshLambertMaterial({ color: 0x2a2240 });
    const webMat   = new THREE.MeshLambertMaterial({ color: 0x18102c });
    const wallMat  = new THREE.MeshLambertMaterial({ color: 0x14101e });
    const wallTopM = new THREE.MeshLambertMaterial({ color: 0x1e1830 });
    const pedMat   = new THREE.MeshLambertMaterial({ color: 0x5a4a80, emissive: 0x0a0816 });
    const signMat  = new THREE.MeshLambertMaterial({ color: 0x3d5028 });

    const floorGeo = new THREE.BoxGeometry(1, 0.12, 1);
    const wallGeo  = new THREE.BoxGeometry(1, 2.2, 1);
    const pedGeo   = new THREE.BoxGeometry(0.82, PEDESTAL_HEIGHT, 0.82);
    const signGeo  = new THREE.BoxGeometry(0.65, 0.9, 0.08);

    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const tile = map.tileAt(tx, ty);
        let mesh = null;

        if (tile === T.FLOOR || tile === T.DOOR) {
          mesh = new THREE.Mesh(floorGeo, floorMat);
          mesh.position.set(tx + 0.5, 0.06, ty + 0.5);
          mesh.receiveShadow = true;
        } else if (tile === T.WEB) {
          mesh = new THREE.Mesh(floorGeo, webMat);
          mesh.position.set(tx + 0.5, 0.06, ty + 0.5);
          mesh.receiveShadow = true;
        } else if (tile === T.WALL) {
          mesh = new THREE.Mesh(wallGeo, wallMat);
          mesh.position.set(tx + 0.5, 1.1, ty + 0.5);
          mesh.castShadow = true;
          const cap = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), wallTopM);
          cap.position.set(tx + 0.5, 2.24, ty + 0.5);
          this.scene.add(cap);
          this.tileObjects.push(cap);
        } else if (tile === T.PEDESTAL) {
          const floor = new THREE.Mesh(floorGeo, floorMat);
          floor.position.set(tx + 0.5, 0.06, ty + 0.5);
          floor.receiveShadow = true;
          this.scene.add(floor);
          this.tileObjects.push(floor);

          mesh = new THREE.Mesh(pedGeo, pedMat);
          mesh.position.set(tx + 0.5, PEDESTAL_HEIGHT / 2, ty + 0.5);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        } else if (tile === T.SIGN) {
          const floor = new THREE.Mesh(floorGeo, floorMat);
          floor.position.set(tx + 0.5, 0.06, ty + 0.5);
          this.scene.add(floor);
          this.tileObjects.push(floor);

          mesh = new THREE.Mesh(signGeo, signMat);
          mesh.position.set(tx + 0.5, 0.57, ty + 0.42);
          mesh.castShadow = true;
        }

        if (mesh) {
          this.scene.add(mesh);
          this.tileObjects.push(mesh);
        }
      }
    }

    // Coins
    const coinGeo = new THREE.SphereGeometry(0.13, 10, 10);
    const coinMat = new THREE.MeshLambertMaterial({ color: 0xffcc3c, emissive: 0x664400 });
    map.objects.forEach(obj => {
      if (obj.type !== 'coin') return;
      const key  = obj.tx + ',' + obj.ty;
      const mesh = new THREE.Mesh(coinGeo, coinMat);
      const yPos = obj.pedestal ? PEDESTAL_HEIGHT + 0.22 : 0.22;
      mesh.position.set(obj.tx + 0.5, yPos, obj.ty + 0.5);
      this.scene.add(mesh);
      this.coinObjects[key] = { mesh, obj };
    });
  }

  // entities: optional { boss, turrets, bullets } from BossRoom
  update(player, map, entities) {
    if (!this._ready) return;

    const px = player.x3;
    const py = player.y3;
    const pz = player.z3;
    const yaw   = player.yaw;
    const pitch = player.pitch || 0;

    // Remove collected coins
    Object.keys(this.coinObjects).forEach(key => {
      if (map.collectedCoins.has(key)) {
        this.scene.remove(this.coinObjects[key].mesh);
        delete this.coinObjects[key];
      }
    });

    // Spin remaining coins
    const t = performance.now() / 1000;
    Object.values(this.coinObjects).forEach(entry => {
      entry.mesh.rotation.y = t * 2.5;
    });

    // Update bullet pool — player bullets
    this._bulletPool.forEach(m => { m.visible = false; });
    player.bullets.forEach((b, i) => {
      if (i < this._bulletPool.length) {
        this._bulletPool[i].position.set(b.tx, b.y3, b.ty);
        this._bulletPool[i].visible = true;
      }
    });

    // Enemy bullets
    this._bulletPoolEnemy.forEach(m => { m.visible = false; });
    if (entities && entities.bullets) {
      entities.bullets.forEach((b, i) => {
        if (i < this._bulletPoolEnemy.length) {
          this._bulletPoolEnemy[i].position.set(b.tx, b.y3, b.ty);
          this._bulletPoolEnemy[i].visible = true;
        }
      });
    }

    // Animate chest item meshes
    if (entities && entities.chest) {
      entities.chest.update(t);
    }

    // Web rays
    this._updateWebRays(entities && entities.boss);

    // Player follow light
    this.movingLight.position.set(px, py + 1.8, pz);

    // First-person camera
    const eyeY = py + 0.65;
    this.camera.position.set(px, eyeY, pz);
    this.camera.lookAt(
      px + Math.sin(yaw) * Math.cos(pitch) * 10,
      eyeY + Math.sin(pitch) * 10,
      pz  - Math.cos(yaw) * Math.cos(pitch) * 10
    );

    // Weapon bob + pitch tilt + swing
    const bobT  = t * 7.5;
    const bobY  = player.isMoving ? Math.sin(bobT) * 0.018      : Math.sin(t * 1.4) * 0.005;
    const bobX  = player.isMoving ? Math.sin(bobT * 0.5) * 0.01 : 0;
    const pitchOffY = pitch * 0.06;

    this.weaponGroup.position.y += (-0.36 + bobY + pitchOffY - this.weaponGroup.position.y) * 0.18;
    this.weaponGroup.position.x += (0.28  + bobX             - this.weaponGroup.position.x) * 0.18;

    const swingProg = player.swingTimer > 0 ? (1 - player.swingTimer / SWING_DUR) : 0;
    const swingArc  = player.swingTimer > 0 ? Math.sin(swingProg * Math.PI) * 1.1  : 0;
    const swingFwd  = player.swingTimer > 0 ? Math.sin(swingProg * Math.PI) * 0.25 : 0;
    this.weaponGroup.rotation.x += (-0.28 + pitch * 0.05 - swingArc - this.weaponGroup.rotation.x) * 0.14;
    this.weaponGroup.position.z += (-0.32 - swingFwd - this.weaponGroup.position.z) * 0.14;

    // Render world then weapon overlay
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.weaponScene, this.weaponCamera);
  }

  _updateWebRays(boss) {
    if (!this._webRayGeo) return;
    const rays = (boss && boss.webRays) ? boss.webRays : [];
    const maxRays = Math.floor(this._webRayPositions.length / 6);
    let count = 0;
    const bossY = boss ? boss.y3 + 0.5 : 0;
    for (let i = 0; i < rays.length && count < maxRays; i++) {
      const r = rays[i];
      if (r.life <= 0) continue;
      const ex = r.ox + Math.cos(r.angle) * r.len;
      const ez = r.oz + Math.sin(r.angle) * r.len;
      this._webRayPositions[count * 6 + 0] = r.ox;
      this._webRayPositions[count * 6 + 1] = bossY;
      this._webRayPositions[count * 6 + 2] = r.oz;
      this._webRayPositions[count * 6 + 3] = ex;
      this._webRayPositions[count * 6 + 4] = bossY;
      this._webRayPositions[count * 6 + 5] = ez;
      count++;
    }
    this._webRayGeo.attributes.position.needsUpdate = true;
    this._webRayGeo.setDrawRange(0, count * 2);
  }

  resize(w, h) {
    if (!this._ready) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = w / h;
    this.weaponCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    if (!this._ready) return;
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode)
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    this._ready = false;
  }
}
