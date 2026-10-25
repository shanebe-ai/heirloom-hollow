// Heirloom Hollow, milestone 1 start: walk Hazel's farm on a phone, meet a few visitors, pet the fox.
import Phaser from 'phaser';
import { T, COLS, ROWS, layout, drawGround, drawHouse, drawTree, drawFence, drawSign, Farm } from './world';

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

const VISITORS = [
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
];
const BRAMBLE_LINES = [
  'Bramble flicks an ear at you, then yawns.',
  'Bramble watches the pond. He has seen a great many springs.',
  'Bramble lets you scratch behind his notched ear. Just this once.',
];

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
/** A day lasts 12 real minutes: 6am to 2am is 20 game hours. */
const GAME_MIN_PER_MS = (20 * 60) / (12 * 60 * 1000);

class Farmyard extends Phaser.Scene {
  farm!: Farm;
  player!: Phaser.GameObjects.Sprite;
  playerPath: { x: number; y: number }[] = [];
  playerDir: Dir = 'down';
  people: Person[] = [];
  bramble!: Phaser.GameObjects.Sprite;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  talking = false;
  talkTarget: Person | 'bramble' | null = null;
  minutes = 6 * 60;
  night!: Phaser.GameObjects.Rectangle;
  marker!: Phaser.GameObjects.Graphics;

  constructor() { super('farm'); }

  preload() {
    const sheet = (k: string) => this.load.spritesheet(k, `assets/sprites/${k}_walk.png`, { frameWidth: 32, frameHeight: 48 });
    sheet('rosie');
    for (const v of VISITORS) sheet(v.key);
    this.load.spritesheet('bramble', 'assets/sprites/bramble.png', { frameWidth: 32, frameHeight: 32 });
  }

  create() {
    (window as unknown as { hh: Farmyard }).hh = this; // handy for testing in the browser
    this.farm = layout();
    const f = this.farm;
    this.textures.addCanvas('ground', drawGround(f));
    this.textures.addCanvas('house', drawHouse());
    this.textures.addCanvas('fence', drawFence());
    this.textures.addCanvas('sign', drawSign());
    for (let i = 0; i < 3; i++) this.textures.addCanvas(`tree${i}`, drawTree(11 + i * 17));

    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(-10);
    const h = f.house;
    this.add.image(h.x * T, (h.y + h.h) * T, 'house').setOrigin(0, 1).setDepth((h.y + h.h) * T);
    f.trees.forEach((t, i) => this.add.image(t.x * T + 16, (t.y + 1) * T, `tree${i % 3}`).setOrigin(0.5, 1).setDepth((t.y + 1) * T));
    for (const fe of f.fences) this.add.image(fe.x * T, fe.y * T, 'fence').setOrigin(0).setDepth(fe.y * T + 28);
    this.add.image(f.sign.x * T + 16, (f.sign.y + 1) * T, 'sign').setOrigin(0.5, 1).setDepth((f.sign.y + 1) * T);
    f.blocked[f.sign.y][f.sign.x] = true;

    this.marker = this.add.graphics().setDepth(-5);

    for (const key of ['rosie', ...VISITORS.map(v => v.key)])
      DIRS.forEach((d, row) => this.anims.create({
        key: `${key}-${d}`, frameRate: 8, repeat: -1,
        frames: this.anims.generateFrameNumbers(key, { start: row * 4, end: row * 4 + 3 }),
      }));
    this.anims.create({ key: 'fox-sit', frameRate: 2, repeat: -1, frames: this.anims.generateFrameNumbers('bramble', { start: 8, end: 11 }) });
    this.anims.create({ key: 'fox-sleep', frameRate: 1.5, repeat: -1, frames: this.anims.generateFrameNumbers('bramble', { start: 12, end: 15 }) });

    this.player = this.add.sprite(f.start.x * T + 16, f.start.y * T + 28, 'rosie', 1).setOrigin(0.5, 1);
    for (const v of VISITORS) {
      const s = this.add.sprite(v.at.x * T + 16, v.at.y * T + 28, v.key, 1).setOrigin(0.5, 1);
      s.setInteractive({ useHandCursor: true, pixelPerfect: false });
      this.people.push({ key: v.key, name: v.name, lines: v.lines, sprite: s, path: [], dir: 'down', speed: 38,
        idleUntil: this.time.now + 1000 + Math.random() * 3000, home: v.at });
    }
    this.bramble = this.add.sprite(f.bramble.x * T + 16, f.bramble.y * T + 30, 'bramble', 8).setOrigin(0.5, 1).play('fox-sit');
    this.bramble.setInteractive({ useHandCursor: true });
    f.blocked[f.bramble.y][f.bramble.x] = true;

    this.night = this.add.rectangle(0, 0, COLS * T, ROWS * T, 0x1a1840, 0).setOrigin(0).setDepth(9000);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, COLS * T, ROWS * T);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.fitZoom();
    this.scale.on('resize', () => this.fitZoom());

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.on('gameobjectdown', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (this.talking) return;
      const person = this.people.find(p => p.sprite === obj);
      this.talkTarget = person ?? (obj === this.bramble ? 'bramble' : null);
      const target = person ? person.sprite : this.bramble;
      this.walkTo(Math.floor(target.x / T), Math.floor((target.y - 4) / T), true);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.talking) { this.closeTalk(); return; }
      if (over.length) return;
      this.talkTarget = null;
      this.walkTo(Math.floor(p.worldX / T), Math.floor(p.worldY / T), false);
    });
    document.getElementById('talk')!.addEventListener('pointerdown', e => { e.stopPropagation(); this.closeTalk(); });
    setTimeout(() => { document.getElementById('hint')!.style.opacity = '0'; }, 6000);
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
    if (beside && !path.length && this.talkTarget) this.openTalk(this.talkTarget);
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

  update(time: number, delta: number) {
    const dt = delta / 1000;
    this.tickClock(delta);
    if (this.talking) { this.depthSort(); return; }

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

    const walking = this.step(this.player, this.playerPath, 92, dt, 'rosie', d => { this.playerDir = d; });
    if (!walking) {
      if (this.player.anims.isPlaying) this.stand(this.player, this.playerDir);
      this.marker.clear();
      if (this.talkTarget) this.openTalk(this.talkTarget);
    }
    // A little bob in her step.
    this.player.setDisplayOrigin(16, walking ? 48 + Math.abs(Math.sin(time / 90)) : 48);

    // Visitors wander near where they started, pausing now and then.
    for (const p of this.people) {
      if (this.step(p.sprite, p.path, p.speed, dt, p.key, d => { p.dir = d; })) continue;
      if (p.sprite.anims.isPlaying) { this.stand(p.sprite, p.dir); p.idleUntil = time + 1500 + Math.random() * 4000; }
      if (time > p.idleUntil) {
        const here = this.tileOf(p.sprite);
        const x = p.home.x + Math.floor(Math.random() * 9) - 4, y = p.home.y + Math.floor(Math.random() * 7) - 3;
        const pt = this.tileOf(this.player);
        if (this.free(x, y) && !(x === pt.x && y === pt.y)) p.path = this.findPath(here, { x, y }, false).slice(0, 8);
        p.idleUntil = time + 800;
      }
    }
    this.depthSort();
  }

  depthSort() {
    this.player.setDepth(this.player.y);
    for (const p of this.people) p.sprite.setDepth(p.sprite.y);
    this.bramble.setDepth(this.bramble.y);
  }

  tickClock(delta: number) {
    this.minutes += delta * GAME_MIN_PER_MS;
    if (this.minutes >= 26 * 60) this.minutes = 6 * 60; // a new morning
    const m = Math.floor(this.minutes) % (24 * 60);
    const hh = Math.floor(m / 60), mm = Math.floor(m / 10) * 10 % 60;
    const h12 = ((hh + 11) % 12) + 1, ap = hh < 12 ? 'am' : 'pm';
    const el = document.getElementById('clock')!;
    const text = `${SEASONS[0]} 1  ${h12}:${String(mm).padStart(2, '0')}${ap}`;
    if (el.textContent !== text) el.textContent = text;
    // Evening falls from 6pm, full night by 10pm.
    const dark = Phaser.Math.Clamp((this.minutes - 18 * 60) / (4 * 60), 0, 1) * 0.55;
    this.night.setFillStyle(0x1a1840, dark);
    if (dark > 0.3 && this.bramble.anims.currentAnim?.key !== 'fox-sleep') this.bramble.play('fox-sleep');
    if (dark <= 0.3 && this.bramble.anims.currentAnim?.key !== 'fox-sit') this.bramble.play('fox-sit');
  }

  openTalk(who: Person | 'bramble') {
    this.talkTarget = null;
    this.talking = true;
    const box = document.getElementById('talk')!;
    const img = box.querySelector('img')!;
    if (who === 'bramble') {
      img.src = 'assets/sprites/bramble.png';
      img.style.objectFit = 'none';
      img.style.objectPosition = '-64px -64px';
      img.style.width = img.style.height = '32px';
      img.style.transform = 'scale(3)';
      img.style.margin = '32px';
      box.querySelector('.who')!.textContent = 'Bramble';
      box.querySelector('.line')!.textContent = Phaser.Utils.Array.GetRandom(BRAMBLE_LINES);
    } else {
      img.removeAttribute('style');
      const mood = Math.random() < 0.6 ? 'happy' : 'neutral';
      img.src = `assets/portraits/${who.key}_${mood}.png`;
      box.querySelector('.who')!.textContent = who.name;
      box.querySelector('.line')!.textContent = Phaser.Utils.Array.GetRandom(who.lines);
      // They stop and turn to face you.
      who.path = [];
      const dx = this.player.x - who.sprite.x, dy = this.player.y - who.sprite.y;
      who.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.stand(who.sprite, who.dir);
      who.idleUntil = this.time.now + 4000;
      const back: Dir = who.dir === 'left' ? 'right' : who.dir === 'right' ? 'left' : who.dir === 'up' ? 'down' : 'up';
      this.playerDir = back;
      this.stand(this.player, back);
    }
    box.classList.add('open');
  }

  closeTalk() {
    this.talking = false;
    document.getElementById('talk')!.classList.remove('open');
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#7dbb5e',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [Farmyard],
});
