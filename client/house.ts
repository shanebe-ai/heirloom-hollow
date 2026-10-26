// Inside Hazel's farmhouse: one cosy room, a bed to sleep in, a mat to leave by.
// The clock keeps running indoors, and staying up past 2am in here still ends
// with the farmer waking in bed, a little poorer.
import Phaser from 'phaser';
import { T, INTERIOR, drawInterior } from './world';
import { G, saveGame, sleepNight, farmerKey, farmerPack, GAME_MIN_PER_MS, clockLabel } from './state';
import { askSleep, showSummary, fade, anyPanelOpen, refreshHud } from './ui';
import { DAY_END } from '../shared/rules.js';

type Dir = 'down' | 'left' | 'right' | 'up';
const DIRS: Dir[] = ['down', 'left', 'right', 'up'];
const W = INTERIOR.cols, H = INTERIOR.rows;

const inRect = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export class House extends Phaser.Scene {
  player!: Phaser.GameObjects.Sprite;
  playerPack?: Phaser.GameObjects.Sprite;
  packKey = '';
  playerPath: { x: number; y: number }[] = [];
  playerDir: Dir = 'up';
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  blocked: boolean[][] = [];
  busy = false;
  pendingBed = false;
  lastTile = { x: -1, y: -1 };

  constructor() { super('house'); }

  create() {
    (window as unknown as { hhHouse: House }).hhHouse = this; // handy for testing in the browser
    // Like the farm, this scene object is reused on every visit.
    this.busy = false;
    this.playerPath = [];
    this.pendingBed = false;
    this.lastTile = { x: -1, y: -1 };
    document.body.classList.add('indoors');
    document.getElementById('where')!.textContent = "Hazel's Farmhouse";
    this.blocked = Array.from({ length: H }, () => Array(W).fill(false));
    for (let x = 0; x < W; x++) this.blocked[0][x] = true; // the top wall
    for (const r of [INTERIOR.bed, INTERIOR.table, INTERIOR.fireplace, INTERIOR.plant])
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.blocked[y][x] = true;

    if (!this.textures.exists('interior')) this.textures.addCanvas('interior', drawInterior());
    this.add.image(0, 0, 'interior').setOrigin(0).setDepth(-10);

    const p = G.save.player.scene === 'house' ? G.save.player : INTERIOR.enter;
    this.player = this.add.sprite(p.x * T + 16, p.y * T + 28, farmerKey(), 1).setOrigin(0.5, 1);
    this.packKey = farmerPack();
    this.playerPack = this.packKey
      ? this.add.sprite(p.x * T + 16, p.y * T + 28, this.packKey, 1).setOrigin(0.5, 1)
      : undefined;
    this.stand(this.player, 'up');

    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.fitZoom();
    this.scale.on('resize', () => this.fitZoom());

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (p2: Phaser.Input.Pointer) => {
      if (this.busy || anyPanelOpen()) return;
      const x = Math.floor(p2.worldX / T), y = Math.floor(p2.worldY / T);
      if (inRect(x, y, INTERIOR.bed)) {
        this.pendingBed = true;
        this.walkTo(x, y, true);
        return;
      }
      this.pendingBed = false;
      this.walkTo(x, y, false);
    });

    refreshHud();
    if (G.pendingSummary) {
      const summary = G.pendingSummary;
      G.pendingSummary = null;
      void showSummary(summary);
    }
  }

  fitZoom() {
    const w = this.scale.width, h = this.scale.height;
    const z = Math.max(1, Math.min(4, Math.round((Math.min(w, h * 1.4) / (10 * T)) * 2) / 2));
    const cam = this.cameras.main;
    cam.setZoom(z);
    // A phone screen is taller than the room: keep the room in the middle of a dark
    // surround, instead of pinned to the top left corner over the grass colour.
    const vw = w / z, vh = h / z, rw = W * T, rh = H * T;
    cam.setBounds(Math.min(0, (rw - vw) / 2), Math.min(0, (rh - vh) / 2), Math.max(rw, vw), Math.max(rh, vh));
    cam.setBackgroundColor('#2b1d1c');
  }

  tileOf(s: Phaser.GameObjects.Sprite) { return { x: Math.floor(s.x / T), y: Math.floor((s.y - 4) / T) }; }

  free(x: number, y: number) { return x >= 0 && y >= 0 && x < W && y < H && !this.blocked[y][x]; }

  findPath(from: { x: number; y: number }, to: { x: number; y: number }, beside: boolean) {
    const goal = (x: number, y: number) => beside ? Math.abs(x - to.x) + Math.abs(y - to.y) === 1 : x === to.x && y === to.y;
    if (!beside && !this.free(to.x, to.y)) return [];
    const prev = new Map<number, number>();
    const id = (x: number, y: number) => y * W + x;
    const q = [from];
    prev.set(id(from.x, from.y), -1);
    while (q.length) {
      const c = q.shift()!;
      if (goal(c.x, c.y) || (beside && c.x === to.x && c.y === to.y)) {
        const out: { x: number; y: number }[] = [];
        let k = id(c.x, c.y);
        while (k !== -1) { out.unshift({ x: k % W, y: Math.floor(k / W) }); k = prev.get(k)!; }
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
    if (beside && !path.length && this.pendingBed) this.arrivedBed();
  }

  arrivedBed() {
    this.pendingBed = false;
    askSleep(() => this.doSleep());
  }

  step(s: Phaser.GameObjects.Sprite, path: { x: number; y: number }[], speed: number, dt: number, setDir: (d: Dir) => void) {
    if (!path.length) return false;
    const n = path[0];
    const tx = n.x * T + 16, ty = n.y * T + 28;
    const dx = tx - s.x, dy = ty - s.y, dist = Math.hypot(dx, dy);
    const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    setDir(d);
    if (s.anims.currentAnim?.key !== `${farmerKey()}-${d}` || !s.anims.isPlaying) s.play(`${farmerKey()}-${d}`);
    const move = speed * dt;
    if (dist <= move) { s.setPosition(tx, ty); path.shift(); }
    else s.setPosition(s.x + (dx / dist) * move, s.y + (dy / dist) * move);
    return true;
  }

  stand(s: Phaser.GameObjects.Sprite, d: Dir) {
    s.stop();
    s.setFrame(DIRS.indexOf(d) * 4 + 1);
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    // The clock runs indoors too.
    G.save.minutes += delta * GAME_MIN_PER_MS;
    const el = document.getElementById('clock')!;
    const text = clockLabel();
    if (el.textContent !== text) el.textContent = text;
    if (G.save.minutes >= DAY_END) { this.passOut(); return; }
    if (this.busy || anyPanelOpen()) return;

    const k = this.keys;
    const kd: [number, number] | null = (k.LEFT.isDown || k.A.isDown) ? [-1, 0] : (k.RIGHT.isDown || k.D.isDown) ? [1, 0]
      : (k.UP.isDown || k.W.isDown) ? [0, -1] : (k.DOWN.isDown || k.S.isDown) ? [0, 1] : null;
    if (kd && !this.playerPath.length) {
      const t = this.tileOf(this.player);
      const d: Dir = kd[0] < 0 ? 'left' : kd[0] > 0 ? 'right' : kd[1] < 0 ? 'up' : 'down';
      this.playerDir = d;
      if (this.free(t.x + kd[0], t.y + kd[1])) this.playerPath = [{ x: t.x + kd[0], y: t.y + kd[1] }];
      else this.stand(this.player, d);
    }

    const walking = this.step(this.player, this.playerPath, 92, dt, (d) => { this.playerDir = d; });
    if (!walking) {
      if (this.player.anims.isPlaying) this.stand(this.player, this.playerDir);
      if (this.pendingBed) this.arrivedBed();
    }
    this.player.setDepth(this.player.y);
    if (this.playerPack && this.packKey) {
      const pack = this.playerPack;
      pack.setPosition(this.player.x, this.player.y);
      pack.setDepth(this.player.depth + 1);
      if (walking) {
        const key = `${this.packKey}-${this.playerDir}`;
        if (pack.anims.currentAnim?.key !== key || !pack.anims.isPlaying) pack.play(key);
      } else {
        pack.stop();
        pack.setFrame(DIRS.indexOf(this.playerDir) * 4 + 1);
      }
    }

    const here = this.tileOf(this.player);
    if (here.x !== this.lastTile.x || here.y !== this.lastTile.y) {
      this.lastTile = here;
      G.save.player = { x: here.x, y: here.y, scene: 'house' };
      if (inRect(here.x, here.y, INTERIOR.mat)) { this.exitHouse(); return; }
    }
  }

  wakeByBed() {
    const p = G.save.player;
    this.player.setPosition(p.x * T + 16, p.y * T + 28);
    this.stand(this.player, 'up');
    this.lastTile = { x: p.x, y: p.y };
  }

  doSleep() {
    if (this.busy) return;
    this.busy = true;
    this.playerPath = [];
    fade(true);
    window.setTimeout(() => {
      const summary = sleepNight(false);
      G.pendingSummary = null; // shown right here; the farm must not show it again
      this.wakeByBed();
      fade(false);
      this.busy = false;
      void showSummary(summary);
    }, 800);
  }

  passOut() {
    if (this.busy) return;
    this.busy = true;
    this.playerPath = [];
    fade(true);
    window.setTimeout(() => {
      const summary = sleepNight(true);
      G.pendingSummary = null; // shown right here; the farm must not show it again
      this.wakeByBed();
      fade(false);
      this.busy = false;
      void showSummary(summary);
    }, 800);
  }

  exitHouse() {
    if (this.busy) return;
    this.busy = true;
    this.playerPath = [];
    fade(true);
    window.setTimeout(() => {
      G.save.player = { x: 5, y: 6, scene: 'farm' };
      void saveGame();
      this.scene.start('farm');
      fade(false);
    }, 650);
  }
}
