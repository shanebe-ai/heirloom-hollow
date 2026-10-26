// Heirloom Hollow: walk Hazel's farm on a phone, work the field, meet the
// visitors, and sleep in the farmhouse. Milestone 1: a farm that grows.
import Phaser from 'phaser';
import { T, COLS, ROWS, layout, drawGround, drawHouse, drawTree, drawFence, drawSign, drawSoil, drawCrop, drawDeadPlant, drawShippingBox, Farm } from './world';
import { G, loadGame, saveGame, startAutosave, tileAt, tileKey, sleepNight, markStep, guideActive, farmerKey, farmerPack, GAME_MIN_PER_MS, clockLabel } from './state';
import { initUI, refreshHud, openShop, openShip, openStall, showSummary, toast, fade, anyPanelOpen, closePanels } from './ui';
import { SEASONS, DAY_END, ENERGY_COSTS, TIRED_BELOW, CROPS, ITEMS, cropStage, isRipe, harvestTile, CAN_CAPACITY } from '../shared/rules.js';
import { House } from './house';

type Dir = 'down' | 'left' | 'right' | 'up';
const DIRS: Dir[] = ['down', 'left', 'right', 'up'];

interface Person {
  key: string;
  name: string;
  lines: string[];
  sprite: Phaser.GameObjects.Sprite;
  path: { x: number; y: number }[];
  dir: Dir;
  speed: number;
  idleUntil: number;
  home: { x: number; y: number };
}

export const VISITORS = [
  { key: 'kai', name: 'Kai', at: { x: 14, y: 13 }, lines: [
    'Careful round the forge, the sparks bite.',
    'You want honest? Your fence leans a bit.',
    'Thanks for saying hi. Means more than you think.',
  ] },
  { key: 'june', name: 'June', at: { x: 22, y: 14 }, lines: [
    'Your hens would love a bigger coop, just saying!',
    'Mud on your boots already. You will fit right in.',
    'My dog likes you. That is the only reference I need.',
  ] },
  { key: 'mayor', name: 'Mayor Barnaby', at: { x: 9, y: 9 }, lines: [
    'Welcome, welcome, er... farmer! Splendid name, whatever it is.',
    'The Flower Festival is in spring. You will come, won\'t you?',
    'Hazel would be proud to see the old place breathing again.',
  ] },
  { key: 'amara', name: 'Amara', at: { x: 24, y: 18 }, lines: [
    'Mind the clay, it gets everywhere. Ask my cheeks.',
    'Bring me river mud some day and I will make you a bowl from your own farm.',
    'Hazel bought a jug from me every spring. I kept her favourite glaze.',
  ] },
  { key: 'priya', name: 'Priya', at: { x: 16, y: 16 }, lines: [
    'That shirt has seen some summers! Come by the shop, I will find you a colour.',
    'Every thread in my window was spun by someone in this valley.',
    'Hold still... yes, I was measuring you for a scarf. Sorry!',
  ] },
  { key: 'marigold', name: 'Marigold', at: { x: 24, y: 5 }, lines: [
    'A flower given means more than a flower kept. That is the whole business, really.',
    'Your grandma bought tulips from my mother every spring. Every single spring.',
    'Daisies for friends, sunflowers for courage, tulips for someone special.',
  ] },
  { key: 'hana', name: 'Hana', at: { x: 26, y: 8 }, lines: [
    'Your tomatoes are leaning east. So is your fence. Interesting.',
    'Tea is better shared. The pot is always warm at mine.',
    'A bonsai teaches patience. So, it seems, does farming.',
  ] },
];
const BRAMBLE_LINES = [
  'Bramble flicks an ear at you, then yawns.',
  'Bramble watches the pond. He has seen a great many springs.',
  'Bramble lets you scratch behind his notched ear. Just this once.',
];

/** Loads every sprite sheet once and builds the shared animations, then
 *  starts whichever scene the farmer was last in. */
class Boot extends Phaser.Scene {
  constructor() { super('boot'); }
  preload() {
    const sheet = (k: string) => this.load.spritesheet(k, `assets/sprites/${k}_walk.png`, { frameWidth: 32, frameHeight: 48 });
    sheet('rosie');
    sheet('rowan');
    sheet('ivy');
    sheet('reed');
    sheet('pack');
    sheet('purse');
    for (const v of VISITORS) sheet(v.key);
    this.load.spritesheet('bramble', 'assets/sprites/bramble.png', { frameWidth: 32, frameHeight: 32 });
  }
  create() {
    for (const key of ['rosie', 'rowan', 'ivy', 'reed', 'pack', 'purse', ...VISITORS.map((v) => v.key)])
      DIRS.forEach((d, row) => this.anims.create({
        key: `${key}-${d}`, frameRate: 8, repeat: -1,
        frames: this.anims.generateFrameNumbers(key, { start: row * 4, end: row * 4 + 3 }),
      }));
    this.anims.create({ key: 'fox-sit', frameRate: 2, repeat: -1, frames: this.anims.generateFrameNumbers('bramble', { start: 8, end: 11 }) });
    this.anims.create({ key: 'fox-sleep', frameRate: 1.5, repeat: -1, frames: this.anims.generateFrameNumbers('bramble', { start: 12, end: 15 }) });
    this.scene.start(G.save.player.scene === 'house' ? 'house' : 'farm');
  }
}

class Farmyard extends Phaser.Scene {
  farm!: Farm;
  player!: Phaser.GameObjects.Sprite;
  playerPack?: Phaser.GameObjects.Sprite;
  packKey = '';
  playerPath: { x: number; y: number }[] = [];
  playerDir: Dir = 'down';
  people: Person[] = [];
  bramble!: Phaser.GameObjects.Sprite;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  talking = false;
  talkTarget: Person | 'bramble' | null = null;
  chatWith: Person | null = null;
  waiting = false;
  /** What each person and the farmer have said lately, so they remember the conversation. */
  memory: Record<string, { from: string; text: string }[]> = {};
  night!: Phaser.GameObjects.Rectangle;
  marker!: Phaser.GameObjects.Graphics;
  tileGroup!: Phaser.GameObjects.Group;
  pendingTile: { x: number; y: number } | null = null;
  interactTarget: 'sign' | 'ship' | null = null;
  busy = false;
  lastTile = { x: -1, y: -1 };

  constructor() { super('farm'); }

  private canvasTex(key: string, make: () => HTMLCanvasElement) {
    if (!this.textures.exists(key)) this.textures.addCanvas(key, make());
  }

  create() {
    (window as unknown as { hh: Farmyard }).hh = this; // handy for testing in the browser
    (window as unknown as { hhG: typeof G }).hhG = G;
    // Phaser reuses this scene object on every visit to the farm, so anything
    // per visit starts over here rather than leaking in from the last one.
    this.people = [];
    this.playerPath = [];
    this.talkTarget = null;
    this.interactTarget = null;
    this.pendingTile = null;
    this.talking = false;
    this.chatWith = null;
    this.waiting = false;
    this.busy = false;
    this.lastTile = { x: -1, y: -1 };
    document.body.classList.remove('indoors');
    document.getElementById('where')!.textContent = "Hazel's Farm";
    this.memory = G.save.chatMemory ?? {};
    this.farm = layout();
    const f = this.farm;
    this.canvasTex('ground', () => drawGround(f));
    this.canvasTex('house', () => drawHouse());
    this.canvasTex('fence', () => drawFence());
    this.canvasTex('sign', () => drawSign());
    this.canvasTex('shipbox', () => drawShippingBox());
    this.canvasTex('soil', () => drawSoil(false));
    this.canvasTex('soilWet', () => drawSoil(true));
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
    this.marker = this.add.graphics().setDepth(-5);

    const start = G.save.player.scene === 'farm' ? G.save.player : f.start;
    this.player = this.add.sprite(start.x * T + 16, start.y * T + 28, farmerKey(), 1).setOrigin(0.5, 1);
    this.packKey = farmerPack();
    this.playerPack = this.packKey
      ? this.add.sprite(start.x * T + 16, start.y * T + 28, this.packKey, 1).setOrigin(0.5, 1)
      : undefined;
    for (const v of VISITORS) {
      const s = this.add.sprite(v.at.x * T + 16, v.at.y * T + 28, v.key, 1).setOrigin(0.5, 1);
      s.setInteractive({ useHandCursor: true, pixelPerfect: false });
      this.people.push({ key: v.key, name: v.name, lines: v.lines, sprite: s, path: [], dir: 'down', speed: 38,
        idleUntil: this.time.now + 1000 + Math.random() * 3000, home: v.at });
    }
    this.bramble = this.add.sprite(f.bramble.x * T + 16, f.bramble.y * T + 30, 'bramble', 8).setOrigin(0.5, 1).play('fox-sit');
    this.bramble.setInteractive({ useHandCursor: true });
    f.blocked[f.bramble.y][f.bramble.x] = true;

    // The stall's chat button asks for a conversation by name; answer it here.
    const onChat = (e: Event) => {
      const person = this.people.find((p) => p.key === (e as CustomEvent).detail);
      if (person) this.openTalk(person);
    };
    document.addEventListener('hh-chat', onChat);
    this.events.once('shutdown', () => document.removeEventListener('hh-chat', onChat));

    this.night = this.add.rectangle(0, 0, COLS * T, ROWS * T, 0x1a1840, 0).setOrigin(0).setDepth(9000);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, COLS * T, ROWS * T);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.fitZoom();
    this.scale.on('resize', () => this.fitZoom());

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.on('gameobjectdown', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (this.talking || this.busy || anyPanelOpen()) return;
      const person = this.people.find(p => p.sprite === obj);
      this.talkTarget = person ?? (obj === this.bramble ? 'bramble' : null);
      const target = person ? person.sprite : this.bramble;
      this.walkTo(Math.floor(target.x / T), Math.floor((target.y - 4) / T), true);
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
    // Taps inside the chat box stay there; the cross or a tap on the farm closes it.
    // These live on the document, not the scene, so they are wired once only.
    if (!domWired) {
      domWired = true;
      document.getElementById('talk')!.addEventListener('pointerdown', e => e.stopPropagation());
      document.getElementById('bye')!.addEventListener('click', () => farmScene?.closeTalk());
      document.getElementById('say')!.addEventListener('submit', e => {
        e.preventDefault();
        const input = document.getElementById('said') as HTMLInputElement;
        const text = input.value.trim();
        if (text && farmScene?.chatWith && !farmScene.waiting) { input.value = ''; farmScene.ask(farmScene.chatWith, text); }
      });
    }
    farmScene = this;
    if (!guideActive()) setTimeout(() => { document.getElementById('hint')!.style.opacity = '0'; }, 6000);
    refreshHud();
    if (G.pendingSummary) {
      const summary = G.pendingSummary;
      G.pendingSummary = null;
      void showSummary(summary);
    }
  }

  /** Work out what a tap on a tile means: chat targets, the sign, the box,
   *  a tool job, or just walking there. */
  routeTap(x: number, y: number) {
    const f = this.farm;
    if (x === f.sign.x && y === f.sign.y) { this.interactTarget = 'sign'; this.walkTo(x, y, true); return; }
    if (x === f.shipping.x && y === f.shipping.y) { this.interactTarget = 'ship'; this.walkTo(x, y, true); return; }
    this.interactTarget = null;
    if (this.toolApplies(x, y)) { this.pendingTile = { x, y }; this.walkTo(x, y, true); return; }
    this.pendingTile = null;
    this.walkTo(x, y, false);
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
    const face: Dir = x > this.tileOf(this.player).x ? 'right' : x < this.tileOf(this.player).x ? 'left'
      : y > this.tileOf(this.player).y ? 'down' : 'up';
    this.playerDir = face;
    this.stand(this.player, face);
    if (s.energy <= 0) { toast('You are out of energy. A good sleep will bring it back.'); return; }
    let worked = false;
    let step: string | null = null;
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
        if (s.can < CAN_CAPACITY) { s.can = CAN_CAPACITY; toast('You fill the can at the pond.'); worked = true; }
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
      const crop = ITEMS[item]?.crop;
      if (tile?.tilled && !tile.crop && crop) {
        if ((s.inventory[item] ?? 0) <= 0) { toast('Out of those seeds. The sack by the signpost has more.'); return; }
        s.inventory[item] -= 1;
        if (!s.inventory[item]) delete s.inventory[item];
        tile.crop = crop;
        tile.age = 0;
        tile.watered = false;
        worked = true;
        step = 'plant';
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
      if (tile.crop) this.tileGroup.add(this.add.image(x * T, y * T, tile.dead ? 'deadPlant' : `crop_${tile.crop}_${cropStage(tile)}`).setOrigin(0).setDepth(2));
      else if (tile.dead) this.tileGroup.add(this.add.image(x * T, y * T, 'deadPlant').setOrigin(0).setDepth(2));
    }
  }

  /** Roughly 10 tiles across on a phone, more on a bigger screen. */
  fitZoom() {
    const w = this.scale.width, h = this.scale.height;
    const z = Math.max(1, Math.min(4, Math.round((Math.min(w, h * 1.4) / (10 * T)) * 2) / 2));
    this.cameras.main.setZoom(z);
  }

  tileOf(s: Phaser.GameObjects.Sprite) { return { x: Math.floor(s.x / T), y: Math.floor((s.y - 4) / T) }; }

  free(x: number, y: number) { return x >= 0 && y >= 0 && x < COLS && y < ROWS && !this.farm.blocked[y][x]; }

  /** Breadth first search on the tile grid. With `beside`, stop next to the target instead of on it. */
  findPath(from: { x: number; y: number }, to: { x: number; y: number }, beside: boolean) {
    const goal = (x: number, y: number) => beside ? Math.abs(x - to.x) + Math.abs(y - to.y) === 1 : x === to.x && y === to.y;
    if (!beside && !this.free(to.x, to.y)) {
      // Tapped on a tree or the house: walk to the nearest open tile instead.
      let best: { x: number; y: number } | null = null, bd = 1e9;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = to.x + dx, y = to.y + dy, d = dx * dx + dy * dy;
        if (this.free(x, y) && d < bd) { bd = d; best = { x, y }; }
      }
      if (!best) return [];
      to = best;
    }
    const prev = new Map<number, number>();
    const id = (x: number, y: number) => y * COLS + x;
    const q = [from];
    prev.set(id(from.x, from.y), -1);
    while (q.length) {
      const c = q.shift()!;
      if (goal(c.x, c.y) || (beside && c.x === to.x && c.y === to.y)) {
        const out: { x: number; y: number }[] = [];
        let k = id(c.x, c.y);
        while (k !== -1) { out.unshift({ x: k % COLS, y: Math.floor(k / COLS) }); k = prev.get(k)!; }
        return out.slice(1);
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, ny = c.y + dy;
        if (!this.free(nx, ny) && !(beside && nx === to.x && ny === to.y)) continue;
        if (prev.has(id(nx, ny))) continue;
        prev.set(id(nx, ny), id(c.x, c.y));
        q.push({ x: nx, y: ny });
      }
    }
    return [];
  }

  walkTo(x: number, y: number, beside: boolean) {
    const from = this.tileOf(this.player);
    let path = this.findPath(from, { x, y }, beside);
    if (beside && path.length && path[path.length - 1].x === x && path[path.length - 1].y === y) path = path.slice(0, -1);
    this.playerPath = path;
    this.marker.clear();
    const end = path[path.length - 1];
    if (end) this.marker.lineStyle(2, 0xfff6e6, 0.9).strokeRect(end.x * T + 3, end.y * T + 3, T - 6, T - 6);
    if (beside && !path.length) this.arrived();
  }

  /** Fires when the farmer reaches whatever they were walking to. */
  arrived() {
    if (this.talkTarget) {
      // Marigold sells first and chats second: her stall opens on approach,
      // and the chat button inside it finds its way back to a conversation.
      if (this.talkTarget !== 'bramble' && this.talkTarget.key === 'marigold') { openStall(); return; }
      this.openTalk(this.talkTarget);
      return;
    }
    if (this.interactTarget) {
      const target = this.interactTarget;
      this.interactTarget = null;
      if (target === 'sign') openShop();
      else openShip();
      return;
    }
    if (this.pendingTile) {
      const { x, y } = this.pendingTile;
      this.pendingTile = null;
      this.applyTool(x, y);
    }
  }

  /** Moves a sprite along its path; returns true while still walking. */
  step(s: Phaser.GameObjects.Sprite, path: { x: number; y: number }[], speed: number, dt: number, key: string, setDir: (d: Dir) => void) {
    if (!path.length) return false;
    const n = path[0];
    const tx = n.x * T + 16, ty = n.y * T + 28;
    const dx = tx - s.x, dy = ty - s.y, dist = Math.hypot(dx, dy);
    const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    setDir(d);
    if (s.anims.currentAnim?.key !== `${key}-${d}` || !s.anims.isPlaying) s.play(`${key}-${d}`);
    const move = speed * dt;
    if (dist <= move) { s.setPosition(tx, ty); path.shift(); }
    else s.setPosition(s.x + (dx / dist) * move, s.y + (dy / dist) * move);
    return true;
  }

  stand(s: Phaser.GameObjects.Sprite, d: Dir) {
    s.stop();
    s.setFrame(DIRS.indexOf(d) * 4 + 1);
  }

  /** The farmer's bag rides exactly where the farmer rides. */
  syncPack(walking: boolean) {
    if (!this.playerPack || !this.packKey) return;
    const p = this.playerPack;
    p.setPosition(this.player.x, this.player.y);
    p.setDisplayOrigin(16, this.player.displayOriginY);
    if (walking) {
      const key = `${this.packKey}-${this.playerDir}`;
      if (p.anims.currentAnim?.key !== key || !p.anims.isPlaying) p.play(key);
    } else {
      p.stop();
      p.setFrame(DIRS.indexOf(this.playerDir) * 4 + 1);
    }
  }

  update(time: number, delta: number) {
    const dt = delta / 1000;
    this.tickClock(delta);
    if (this.busy) return;
    if (this.talking || document.activeElement?.id === 'said' || anyPanelOpen()) { this.depthSort(); this.syncPack(false); return; }

    // Keyboard on a computer: walk one tile at a time in the pressed direction.
    const k = this.keys;
    const kd: [number, number] | null = (k.LEFT.isDown || k.A.isDown) ? [-1, 0] : (k.RIGHT.isDown || k.D.isDown) ? [1, 0]
      : (k.UP.isDown || k.W.isDown) ? [0, -1] : (k.DOWN.isDown || k.S.isDown) ? [0, 1] : null;
    if (kd && !this.playerPath.length) {
      const t = this.tileOf(this.player);
      const d: Dir = kd[0] < 0 ? 'left' : kd[0] > 0 ? 'right' : kd[1] < 0 ? 'up' : 'down';
      this.playerDir = d;
      if (this.free(t.x + kd[0], t.y + kd[1])) { this.playerPath = [{ x: t.x + kd[0], y: t.y + kd[1] }]; this.marker.clear(); }
      else this.stand(this.player, d);
    }

    const speed = G.save.energy < TIRED_BELOW ? 58 : 92;
    const walking = this.step(this.player, this.playerPath, speed, dt, farmerKey(), d => { this.playerDir = d; });
    if (!walking) {
      if (this.player.anims.isPlaying) this.stand(this.player, this.playerDir);
      this.marker.clear();
      if (this.talkTarget || this.interactTarget || this.pendingTile) this.arrived();
    }
    // A little bob in her step.
    this.player.setDisplayOrigin(16, walking ? 48 + Math.abs(Math.sin(time / 90)) : 48);
    this.syncPack(walking);

    // Keep the save knowing where the farmer stands, and notice the farmhouse door.
    const here = this.tileOf(this.player);
    if (here.x !== this.lastTile.x || here.y !== this.lastTile.y) {
      this.lastTile = here;
      G.save.player = { x: here.x, y: here.y, scene: 'farm' };
      const door = this.farm.house.door;
      if (here.x === door.x && here.y === door.y) { this.enterHouse(); return; }
    }

    // Visitors wander near where they started, pausing now and then.
    for (const p of this.people) {
      if (this.step(p.sprite, p.path, p.speed, dt, p.key, d => { p.dir = d; })) continue;
      if (p.sprite.anims.isPlaying) { this.stand(p.sprite, p.dir); p.idleUntil = time + 1500 + Math.random() * 4000; }
      if (time > p.idleUntil) {
        const hereV = this.tileOf(p.sprite);
        const x = p.home.x + Math.floor(Math.random() * 9) - 4, y = p.home.y + Math.floor(Math.random() * 7) - 3;
        const pt = this.tileOf(this.player);
        if (this.free(x, y) && !(x === pt.x && y === pt.y)) p.path = this.findPath(hereV, { x, y }, false).slice(0, 8);
        p.idleUntil = time + 800;
      }
    }
    this.depthSort();
  }

  depthSort() {
    this.player.setDepth(this.player.y + (this.tileOf(this.player).y >= 5 && this.tileOf(this.player).x === this.farm.house.door.x ? 40 : 0));
    if (this.playerPack) this.playerPack.setDepth(this.player.depth + 1);
    for (const p of this.people) p.sprite.setDepth(p.sprite.y);
    this.bramble.setDepth(this.bramble.y);
  }

  enterHouse() {
    if (this.busy) return;
    this.busy = true;
    this.playerPath = [];
    fade(true);
    window.setTimeout(() => {
      G.save.player = { x: 4, y: 6, scene: 'house' };
      void saveGame();
      this.scene.start('house');
      fade(false);
    }, 650);
  }

  passOut() {
    if (this.busy) return;
    this.busy = true;
    if (this.talking) this.closeTalk();
    closePanels();
    this.playerPath = [];
    fade(true);
    window.setTimeout(() => {
      sleepNight(true);
      this.scene.start('house');
      fade(false);
    }, 800);
  }

  tickClock(delta: number) {
    const s = G.save;
    s.minutes += delta * GAME_MIN_PER_MS;
    if (s.minutes >= DAY_END) { this.passOut(); return; }
    const el = document.getElementById('clock')!;
    const text = clockLabel();
    if (el.textContent !== text) el.textContent = text;
    // Evening falls from 6pm, full night by 10pm.
    const dark = Phaser.Math.Clamp((s.minutes - 18 * 60) / (4 * 60), 0, 1) * 0.55;
    this.night.setFillStyle(0x1a1840, dark);
    if (dark > 0.3 && this.bramble.anims.currentAnim?.key !== 'fox-sleep') this.bramble.play('fox-sleep');
    if (dark <= 0.3 && this.bramble.anims.currentAnim?.key !== 'fox-sit') this.bramble.play('fox-sit');
  }

  openTalk(who: Person | 'bramble') {
    this.talkTarget = null;
    this.talking = true;
    const box = document.getElementById('talk')!;
    const img = box.querySelector('img')!;
    const form = document.getElementById('say')!;
    const line = box.querySelector('.line')!;
    if (who === 'bramble') {
      this.chatWith = null;
      img.src = 'assets/sprites/bramble.png';
      img.style.objectFit = 'none';
      img.style.objectPosition = '-64px -64px';
      img.style.width = img.style.height = '32px';
      img.style.transform = 'scale(3)';
      img.style.margin = '32px';
      box.querySelector('.who')!.textContent = 'Bramble';
      line.textContent = Phaser.Utils.Array.GetRandom(BRAMBLE_LINES);
      line.classList.remove('waiting');
      form.classList.add('hidden'); // foxes don't chat
    } else {
      this.chatWith = who;
      img.removeAttribute('style');
      img.src = `assets/portraits/${who.key}_neutral.png`;
      box.querySelector('.who')!.textContent = who.name;
      form.classList.remove('hidden');
      // They stop, turn to face you, and wait while you talk.
      who.path = [];
      const dx = this.player.x - who.sprite.x, dy = this.player.y - who.sprite.y;
      who.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.stand(who.sprite, who.dir);
      who.idleUntil = Number.MAX_SAFE_INTEGER;
      const back: Dir = who.dir === 'left' ? 'right' : who.dir === 'right' ? 'left' : who.dir === 'up' ? 'down' : 'up';
      this.playerDir = back;
      this.stand(this.player, back);
      this.ask(who, '');
    }
    box.classList.add('open');
  }

  /** One exchange with the server: greet them when `said` is empty, otherwise say it. */
  async ask(who: Person, said: string) {
    const box = document.getElementById('talk')!;
    const line = box.querySelector('.line')!;
    const img = box.querySelector('img')!;
    this.waiting = true;
    line.textContent = said ? `You: ${said}` : '...';
    line.classList.add('waiting');
    const history = this.memory[who.key] ?? [];
    let reply = { line: Phaser.Utils.Array.GetRandom(who.lines) as string, mood: 'neutral' };
    try {
      const res = await fetch('api/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who: who.key, said, history, context: { time: this.clockText(), season: SEASONS[G.save.season], day: G.save.day } }),
      });
      if (res.ok) reply = await res.json();
    } catch { /* offline: their written line it is */ }
    this.waiting = false;
    if (this.chatWith !== who) return; // they closed the chat while we waited
    line.classList.remove('waiting');
    line.textContent = reply.line;
    img.src = `assets/portraits/${who.key}_${reply.mood || 'neutral'}.png`;
    const mem = [...history];
    if (said) mem.push({ from: 'player', text: said });
    mem.push({ from: who.key, text: reply.line });
    this.memory[who.key] = mem.slice(-8);
    G.save.chatMemory = this.memory;
    saveMemory(this.memory);
  }

  clockText() {
    return clockLabel().replace(/^\S+ \d+\s+/, '');
  }

  closeTalk() {
    this.talking = false;
    if (this.chatWith) this.chatWith.idleUntil = this.time.now + 2000;
    this.chatWith = null;
    (document.getElementById('said') as HTMLInputElement).blur();
    document.getElementById('talk')!.classList.remove('open');
  }
}

type Memory = Record<string, { from: string; text: string }[]>;
/** The live farm scene, for the document level chat handlers wired once below. */
let farmScene: Farmyard | null = null;
let domWired = false;
function saveMemory(m: Memory) {
  try { localStorage.setItem('hh-memory', JSON.stringify(m)); } catch { /* private mode: they forget, that's fine */ }
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
    scene: [Boot, Farmyard, House],
  });
})();
