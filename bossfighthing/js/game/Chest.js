class Chest {
  constructor(tx, ty, tier, loot) {
    this.tx   = tx + 0.5;
    this.ty   = ty + 0.5;
    this.tier = tier;  // 'bronze' | 'silver' | 'golden'
    this.loot = loot;  // array of item objects (nulled when taken)
    this.open = false;

    this.mesh      = null;
    this.lidGroup  = null;
    this.itemMeshes = [];
  }

  buildMesh(scene) {
    const tierColor = { bronze: 0xa0622a, silver: 0x9999aa, golden: 0xd4a800 };
    const color = tierColor[this.tier] || 0xa0622a;
    const bodyMat = new THREE.MeshLambertMaterial({ color, emissive: 0x080402 });
    const bandMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const lockMat = new THREE.MeshLambertMaterial({ color: 0xddaa22, emissive: 0x221100 });

    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.38, 0.5), bodyMat);
    body.position.set(0, 0.19, 0);
    group.add(body);

    // Metal band around middle
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.048, 0.52), bandMat);
    band.position.set(0, 0.28, 0);
    group.add(band);

    // Lock on front
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.04), lockMat);
    lock.position.set(0, 0.3, -0.26);
    group.add(lock);

    // Lid with pivot at back-top edge of body
    const lidGroup = new THREE.Group();
    lidGroup.position.set(0, 0.38, 0.25);
    group.add(lidGroup);
    this.lidGroup = lidGroup;

    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), bodyMat);
    lid.position.set(0, 0.11, -0.25); // offset from pivot so it opens correctly
    lidGroup.add(lid);

    const lidBand = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.048, 0.52), bandMat);
    lidBand.position.set(0, 0.0, -0.25);
    lidGroup.add(lidBand);

    group.position.set(this.tx, 0.06, this.ty);
    scene.add(group);
    this.mesh = group;
  }

  openChest(scene) {
    if (this.open) return;
    this.open = true;

    // Swing lid open
    if (this.lidGroup) {
      this.lidGroup.rotation.x = -Math.PI * 0.82;
    }

    // Rarity → emissive color for item spheres
    const emissives = { Common: 0x222222, Uncommon: 0x003300, Rare: 0x000033, Legendary: 0x332200 };
    const colors    = { Common: 0xaaaaaa, Uncommon: 0x44cc44, Rare: 0x4488ff, Legendary: 0xffaa00 };

    this.loot.forEach((item, i) => {
      if (!item) return;
      const col = colors[item.rarity]    || 0xaaaaaa;
      const emi = emissives[item.rarity] || 0x111111;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 8, 6),
        new THREE.MeshLambertMaterial({ color: col, emissive: emi })
      );
      const angle = (i / this.loot.length) * Math.PI * 2;
      mesh.position.set(
        this.tx + Math.cos(angle) * 0.42,
        0.9,
        this.ty + Math.sin(angle) * 0.42
      );
      mesh.userData.chestLootIndex = i;
      scene.add(mesh);
      this.itemMeshes[i] = mesh;
    });
  }

  takeLoot(index, scene) {
    if (!this.open || index < 0 || index >= this.loot.length) return null;
    const item = this.loot[index];
    if (!item) return null;
    this.loot[index] = null;
    if (this.itemMeshes[index]) {
      scene.remove(this.itemMeshes[index]);
      this.itemMeshes[index] = null;
    }
    return item;
  }

  removeMesh(scene) {
    if (this.mesh) scene.remove(this.mesh);
    this.itemMeshes.forEach(m => { if (m) scene.remove(m); });
    this.mesh = null;
    this.itemMeshes = [];
  }

  update(t) {
    if (!this.open) return;
    this.itemMeshes.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.position.y = 0.9 + Math.sin(t * 2.2 + i * 1.4) * 0.07;
      mesh.rotation.y = t * 1.1 + i * 0.7;
    });
  }

  distanceTo(px, pz) {
    const dx = px - this.tx;
    const dz = pz - this.ty;
    return Math.sqrt(dx * dx + dz * dz);
  }
}
