// Heirloom Hollow: walk Hazel's farm on a phone, work the field, meet the
// townsfolk, sleep in the farmhouse, and walk east into Hollow Square.
import Phaser from 'phaser';
import { T, COLS, ROWS, layout, drawGround, drawHouse, drawTree, drawFence, drawSign, drawSoil, drawFertiliser, drawCrop, drawDeadPlant, drawShippingBox, Farm } from './world';
import { G, loadGame, startAutosave, tileAt, tileKey, markStep, guideActive } from './state';
import { initUI, refreshHud, openShip, showSummary, toast, anyPanelOpen } from './ui';
import { ENERGY_COSTS, CROPS, ITEMS, cropStage, isRipe, harvestTile } from '../shared/rules.js';
import { canCapacity, ENTRY_ROW } from '../shared/town.js';
import { House } from './house';

import { Walker, ALL_SHEETS, DIRS, type Dir } from './walker';
import { Town } from './town';

/** Loads every sprite sheet once and builds the shared animations, then
 *  starts whichever scene the farmer was last in. */
class Boot extends Phaser.Scene {
  constructor() { super('boot'); }
  preload() {
    const sheet = (k: string) => this.load.spritesheet(k, `assets/sprites/${k}_walk.png`, { frameWidth: 32, frameHeight: 48 });
    for (const k of new Set(['rosie', 'rowan', 'ivy', 'reed', 'pack', 'purse', ...ALL_SHEETS])) sheet(k);
    this.load.spritesheet('bramble', 'assets/sprites/bramble.png', { frameWidth: 32, frameHeight: 32 });
  }
  create() {
    for (const key of new Set(['rosie', 'rowan', 'ivy', 'reed', 'pack', 'purse', ...ALL_SHEETS]))
      DIRS.forEach((d, row) => this.anims.create({
        key: `${key}-${d}`, frameRate: 8, repeat: -1,
        frames: this.anims.generateFrameNumbers(key, { start: row * 4, end: row * 4 + 3 }),
      }));
    this.anims.create({ key: 'fox-sit', frameRate: 2, repeat: -1, frames: this.anims.generateFrameNumbers('bramble', { start: 8, end: 11 }) });
    this.anims.create({ key: 'fox-sleep', frameRate: 1.5, repeat: -1, frames: this.anims.generateFrameNumbers('bramble', { start: 12, end: 15 }) });
    const scene = G.save.player.scene;
    this.scene.start(scene === 'house' ? 'house' : scene === 'town' ? 'town' : 'farm');
  }
}

class Farmyard extends Walker {
  readonly where = 'farm' as const;
  farm!: Farm;
  bramble!: Phaser.GameObjects.Sprite;
  tileGroup!: Phaser.GameObjects.Group;
  pendingTile: { x: number; y: number } | null = null;
  interactTarget: 'sign' | 'ship' | null = null;

  constructor() { super('farm'); }

  create() {
    (window as unknown as { hh: Farmyard }).hh = this; // handy for testing in the browser
    (window as unknown as { hhG: typeof G }).hhG = G;
    this.beginVisit("Hazel's Farm");
    this.interactTarget = null;
    this.pendingTile = null;
    this.farm = layout();
    const f = this.farm;
    this.cols = COLS;
    this.rows = ROWS;
    this.blocked = f.blocked;
    this.canvasTex('ground', () => drawGround(f));
    this.canvasTex('house', () => drawHouse());
    this.canvasTex('fence', () => drawFence());
    this.canvasTex('sign', () => drawSign());
    this.canvasTex('shipbox', () => drawShippingBox());
    this.canvasTex('soil', () => drawSoil(false));
    this.canvasTex('soilWet', () => drawSoil(true));
    this.canvasTex('fert', () => drawFertiliser());
    this.canvasTex('deadPlant', () => drawDeadPlant());
    for (const crop of Object.keys(CROPS))
      for (let stage = 0; stage <= 4; stage++) this.canvasTex(`crop_${crop}_${stage}`, () => drawCrop(crop, stage));
    for (let i = 0; i < 3; i++) this.canvasTex(`tree${i}`, () => drawTree(11 + i * 17));

    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(-10);
    const h = f.house;
    this.add.image(h.x * T, (h.y + h.h) * T, 'house').setOrigin(0, 1).setDepth((h.y + h.h) * T);
    f.trees.forEach((t, i) => this.add.image(t.x * T + 16, (t.y + 1) * T, `tree${i % 3}`).setOrigin(0.5, 1).setDepth((t.y + 1) * T));
    for (const fe of f.fences) this.add.image(fe.x * T, fe.y * T, 'fence').setOrigin(0).setDepth(fe.y * T + 28);
    this.add.image(f.sign.x * T + 16, (f.sign.y + 1) * T, 'sign').setOrigin(0.5, 1).setDepth((f.sign.y + 1) * T);
    f.blocked[f.sign.y][f.sign.x] = true;
    this.add.image(f.shipping.x * T, f.shipping.y * T, 'shipbox').setOrigin(0).setDepth(f.shipping.y * T + 28);
    f.blocked[f.shipping.y][f.shipping.x] = true;
    // The farmhouse door is a way in, not a wall: walking onto it goes inside.
    f.blocked[f.house.door.y][f.house.door.x] = false;

    this.tileGroup = this.add.group();
    this.refreshTiles();

    const start = G.save.player.scene === 'farm' ? G.save.player : f.start;
    this.addPlayer(start);
    this.bramble = this.add.sprite(f.bramble.x * T + 16, f.bramble.y * T + 30, 'bramble', 8).setOrigin(0.5, 1).play('fox-sit');
    this.bramble.setInteractive({ useHandCursor: true });
    f.blocked[f.bramble.y][f.bramble.x] = true;

    this.input.on('gameobjectdown', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (this.talking || this.busy || anyPanelOpen()) return;
      const person = this.people.find((p) => p.sprite === obj);
      if (person) { this.tapPerson(person); return; }
      if (obj === this.bramble) {
        this.talkTarget = 'bramble';
        this.walkTo(f.bramble.x, f.bramble.y, true);
      }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      // Tapping a person is handled above; checking that first stops a tap on someone
      // standing right beside you from opening the chat and closing it again at once.
      if (over.length) return;
      if (this.busy || anyPanelOpen()) return;
      if (this.talking) { this.closeTalk(); return; }
      this.talkTarget = null;
      this.routeTap(Math.floor(p.worldX / T), Math.floor(p.worldY / T));
    });
    this.finishSetup();
    if (!guideActive()) setTimeout(() => { document.getElementById('hint')!.style.opacity = '0'; }, 6000);
    refreshHud();
    if (G.pendingSummary) {
      const summary = G.pendingSummary;
      G.pendingSummary = null;
      void showSummary(summary);
    }
  }

  /** Work out what a tap on a tile means: the sign, the box, a tool job, or just walking there. */
  routeTap(x: number, y: number) {
    const f = this.farm;
    if (x === f.sign.x && y === f.sign.y) { this.interactTarget = 'sign'; this.walkTo(x, y, true); return; }
    if (x === f.shipping.x && y === f.shipping.y) { this.interactTarget = 'ship'; this.walkTo(x, y, true); return; }
    this.interactTarget = null;
    if (this.toolApplies(x, y)) { this.pendingTile = { x, y }; this.walkTo(x, y, true); return; }
    this.pendingTile = null;
    this.walkTo(x, y, false);
  }

  hasTarget() { return !!(this.talkTarget || this.interactTarget || this.pendingTile); }

  arrivedAt() {
    if (this.interactTarget) {
      const target = this.interactTarget;
      this.interactTarget = null;
      if (target === 'sign') toast('To Hollow Square, east. The General Store sells seeds there.');
      else openShip();
      return true;
    }
    if (this.pendingTile) {
      const { x, y } = this.pendingTile;
      this.pendingTile = null;
      this.applyTool(x, y);
      return true;
    }
    return false;
  }

  /** Keep the save knowing where the farmer stands; notice the farmhouse door and the road to town. */
  onTile(here: { x: number; y: number }) {
    G.save.player = { x: here.x, y: here.y, scene: 'farm' };
    const door = this.farm.house.door;
    if (here.x === door.x && here.y === door.y) { this.goTo('house', { x: 4, y: 6 }); return true; }
    if (here.x === COLS - 1) { this.goTo('town', { x: 1, y: ENTRY_ROW }); return true; }
    return false;
  }

  /** Would the tool in hand do anything on this tile? */
  toolApplies(x: number, y: number): boolean {
    const tile = G.save.tiles[tileKey(x, y)];
    const ground = this.farm.ground[y]?.[x];
    switch (G.selectedTool) {
      case 'hoe': {
        if (tile?.dead) return true;
        const fd = this.farm.field;
        return !tile?.tilled && ground === 'grass' && x >= fd.x && x < fd.x + fd.w && y >= fd.y && y < fd.y + fd.h;
      }
      case 'can':
        return ground === 'water' || (!!tile?.crop && !tile.watered && !tile.dead);
      case 'seeds':
        if (G.selectedSeed === 'fertiliser') return !!tile?.tilled && !tile.fert && !tile.dead;
        return !!tile?.tilled && !tile.crop;
      case 'hand':
        return !!tile && isRipe(tile);
    }
  }

  /** Do the tool's work on a tile the farmer has walked up to. */
  applyTool(x: number, y: number) {
    const s = G.save;
    const key = tileKey(x, y);
    const tile = s.tiles[key];
    const me = this.tileOf(this.player);
    const face: Dir = x > me.x ? 'right' : x < me.x ? 'left' : y > me.y ? 'down' : 'up';
    this.playerDir = face;
    this.stand(this.player, face);
    if (s.energy <= 0) { toast('You are out of energy. A good sleep or a meal in town will bring it back.'); return; }
    let worked = false;
    let step: string | null = null;
    const cap = canCapacity(s);
    if (G.selectedTool === 'hoe') {
      if (tile?.dead) {
        delete tile.crop; delete tile.age; delete tile.dead;
        tile.tilled = true;
        s.energy -= ENERGY_COSTS.hoe;
        worked = true;
        step = 'hoe';
      } else if (this.toolApplies(x, y)) {
        tileAt(x, y).tilled = true;
        s.energy -= ENERGY_COSTS.hoe;
        worked = true;
        step = 'hoe';
      }
    } else if (G.selectedTool === 'can') {
      if (this.farm.ground[y]?.[x] === 'water') {
        if (s.can < cap) { s.can = cap; toast('You fill the can at the pond.'); worked = true; }
      } else if (tile?.crop && !tile.watered && !tile.dead) {
        if (s.can <= 0) { toast('The can is empty. Fill it at the pond.'); return; }
        tile.watered = true;
        s.can -= 1;
        s.energy -= ENERGY_COSTS.water;
        worked = true;
        step = 'water';
      }
    } else if (G.selectedTool === 'seeds') {
      const item = G.selectedSeed;
      if (item === 'fertiliser') {
        if (tile?.tilled && !tile.fert && !tile.dead) {
          if ((s.inventory.fertiliser ?? 0) <= 0) { toast('Out of fertiliser. The General Store in town has more.'); return; }
          s.inventory.fertiliser -= 1;
          if (!s.inventory.fertiliser) delete s.inventory.fertiliser;
          tile.fert = true;
          toast('Fertiliser spread. That patch grows faster on its first watered night.');
          worked = true;
        }
      } else {
        const crop = ITEMS[item]?.crop;
        if (tile?.tilled && !tile.crop && crop) {
          if ((s.inventory[item] ?? 0) <= 0) { toast('Out of those seeds. The General Store in town has more.'); return; }
          s.inventory[item] -= 1;
          if (!s.inventory[item]) delete s.inventory[item];
          tile.crop = crop;
          tile.age = 0;
          tile.watered = false;
          worked = true;
          step = 'plant';
        }
      }
    } else if (G.selectedTool === 'hand') {
      const gained = harvestTile(s, key);
      if (gained) {
        toast(`Picked a ${ITEMS[gained].name.toLowerCase()}.`);
        worked = true;
        step = 'harvest';
      }
    }
    if (worked) {
      if (step) markStep(step);
      s.energy = Math.max(0, s.energy);
      this.tweens.add({ targets: this.player, y: this.player.y - 4, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
      this.refreshTiles();
      refreshHud();
    }
  }

  /** Redraw the tilled soil and crops from the save. */
  refreshTiles() {
    this.tileGroup.clear(true, true);
    for (const [key, tile] of Object.entries(G.save.tiles)) {
      const [x, y] = key.split(',').map(Number);
      if (tile.tilled) this.tileGroup.add(this.add.image(x * T, y * T, tile.watered ? 'soilWet' : 'soil').setOrigin(0).setDepth(1));
      if (tile.fert) this.tileGroup.add(this.add.image(x * T, y * T, 'fert').setOrigin(0).setDepth(1.5));
      if (tile.crop) this.tileGroup.add(this.add.image(x * T, y * T, tile.dead ? 'deadPlant' : `crop_${tile.crop}_${cropStage(tile)}`).setOrigin(0).setDepth(2));
      else if (tile.dead) this.tileGroup.add(this.add.image(x * T, y * T, 'deadPlant').setOrigin(0).setDepth(2));
    }
  }

  update(time: number, delta: number) {
    this.tick(time, delta);
  }

  depthSort() {
    super.depthSort();
    const me = this.tileOf(this.player);
    // Walking out of the farmhouse door, the farmer stays in front of the house.
    if (me.y >= 5 && me.x === this.farm.house.door.x) this.player.setDepth(this.player.y + 40);
    if (this.playerPack) this.playerPack.setDepth(this.player.depth + 1);
    this.bramble.setDepth(this.bramble.y);
  }

  onDark(dark: number) {
    if (dark > 0.3 && this.bramble.anims.currentAnim?.key !== 'fox-sleep') this.bramble.play('fox-sleep');
    if (dark <= 0.3 && this.bramble.anims.currentAnim?.key !== 'fox-sit') this.bramble.play('fox-sit');
  }
}

void (async () => {
  await loadGame();
  initUI();
  startAutosave();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#7dbb5e',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [Boot, Farmyard, House, Town],
  });
})();
