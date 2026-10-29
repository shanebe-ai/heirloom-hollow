// June's ranch, along the road east of Hollow Square: the ranch house, the
// barn, a paddock of cows and hens, and Hugo's beehives in a patch of flowers.
// June, Jed and Hugo live out here and walk into town on their schedules.
import Phaser from 'phaser';
import { T, rng, drawTree, drawFence } from './world';
import { G } from './state';
import { refreshHud, info, anyPanelOpen, openPlace, showSummary } from './ui';
import { Walker } from './walker';
import { drawTownGround, drawFront } from './town';
import { RANCH_COLS, RANCH_ROWS, RANCH_ROAD, RANCH_GATE, RANCH_BUILDINGS, PADDOCK, HIVES, TOWN_COLS, ENTRY_ROW, ranchLayout } from '../shared/town.js';

const OUT = '#4a2826';
type Ctx = CanvasRenderingContext2D;
const px = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const SIGN_FONT = '"IM Fell English SC", Georgia, serif';

function drawCow(spots: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 40; cv.height = 32;
  const c = cv.getContext('2d')!;
  px(c, 4, 8, 28, 16, OUT); px(c, 6, 10, 24, 12, '#fff6e6');
  px(c, 10, 11, 7, 5, spots); px(c, 21, 15, 6, 5, spots); px(c, 7, 17, 4, 3, spots);
  px(c, 28, 4, 11, 12, OUT); px(c, 29, 5, 9, 10, '#fff6e6'); px(c, 31, 11, 7, 4, '#f7a8c4');
  px(c, 32, 7, 2, 2, OUT); px(c, 28, 3, 3, 3, OUT); px(c, 36, 3, 3, 3, OUT);
  for (const lx of [7, 12, 22, 27]) { px(c, lx, 24, 4, 7, OUT); px(c, lx + 1, 24, 2, 5, '#fff6e6'); }
  px(c, 1, 9, 4, 2, OUT); px(c, 0, 10, 2, 6, OUT);
  return cv;
}

function drawHen(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 16;
  const c = cv.getContext('2d')!;
  px(c, 3, 5, 10, 8, OUT); px(c, 4, 6, 8, 6, '#fff6e6'); px(c, 4, 6, 4, 3, '#f6e6c6');
  px(c, 9, 2, 5, 6, OUT); px(c, 10, 3, 3, 4, '#fff6e6'); px(c, 11, 1, 2, 2, '#f26b5b');
  px(c, 14, 4, 2, 2, '#ffd166'); px(c, 11, 4, 1, 1, OUT);
  px(c, 6, 13, 1, 3, '#f0a03c'); px(c, 9, 13, 1, 3, '#f0a03c');
  return cv;
}

function drawHive(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 40;
  const c = cv.getContext('2d')!;
  px(c, 4, 6, 24, 30, OUT);
  for (let i = 0; i < 3; i++) { px(c, 6, 8 + i * 9, 20, 8, '#f7e3a8'); px(c, 6, 14 + i * 9, 20, 2, '#e2bd86'); }
  px(c, 2, 2, 28, 6, OUT); px(c, 4, 3, 24, 4, '#c99f6a');
  px(c, 13, 30, 6, 3, OUT);
  px(c, 26, 12, 2, 2, '#ffd166'); px(c, 2, 20, 2, 2, '#ffd166');
  return cv;
}

function drawTrough(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 24;
  const c = cv.getContext('2d')!;
  px(c, 2, 6, 60, 14, OUT); px(c, 4, 8, 56, 8, '#b5784e'); px(c, 6, 8, 52, 4, '#d9b56a');
  for (let k = 0; k < 10; k++) px(c, 7 + k * 5, 6, 3, 3, '#e8d18a');
  return cv;
}

interface Critter { img: Phaser.GameObjects.Image; kind: 'cow' | 'hen'; name: string; next: number }

export class Ranch extends Walker {
  readonly where = 'ranch' as const;
  gates() { return { west: RANCH_GATE }; }
  interact: { kind: 'building'; id: string } | { kind: 'hive' | 'critter' | 'trough'; text: string } | null = null;
  critters: Critter[] = [];
  trough = { x: PADDOCK.x + 1, y: PADDOCK.y, w: 2, h: 1 };

  constructor() { super('ranch'); }

  create() {
    (window as unknown as { hhRanch: Ranch }).hhRanch = this; // handy for testing in the browser
    this.beginVisit("June's Ranch");
    this.interact = null;
    this.critters = [];
    const L = ranchLayout();
    this.cols = RANCH_COLS;
    this.rows = RANCH_ROWS;
    this.blocked = L.blocked;
    for (let x = this.trough.x; x < this.trough.x + this.trough.w; x++) this.blocked[this.trough.y][x] = true;
    this.canvasTex('ranchGround', () => drawTownGround(L.ground));
    for (let i = 0; i < 3; i++) this.canvasTex(`tree${i}`, () => drawTree(11 + i * 17));
    this.canvasTex('fence', () => drawFence());
    this.canvasTex('hive', drawHive);
    this.canvasTex('hen', drawHen);
    this.canvasTex('trough', drawTrough);
    this.canvasTex('cowBrown', () => drawCow('#8a5a3c'));
    this.canvasTex('cowBlack', () => drawCow('#4a2826'));
    this.add.image(0, 0, 'ranchGround').setOrigin(0).setDepth(-10);

    const signs: Phaser.GameObjects.Text[] = [];
    for (const b of RANCH_BUILDINGS) {
      this.canvasTex(`front_${b.id}`, () => drawFront(b));
      const bottom = (b.y + b.h) * T;
      this.add.image(b.x * T, bottom, `front_${b.id}`).setOrigin(0, 1).setDepth(bottom);
      signs.push(this.add.text(b.x * T + (b.w * T) / 2, b.y * T + 45, b.name, {
        fontFamily: SIGN_FONT, fontSize: '13px', color: '#4a2826', resolution: 3,
      }).setOrigin(0.5).setDepth(bottom + 1));
    }
    void document.fonts?.load(`13px ${SIGN_FONT}`).then(() => { for (const t of signs) if (t.active) t.setFontFamily(SIGN_FONT); }).catch(() => {});
    L.trees.forEach((t, i) => this.add.image(t.x * T + 16, (t.y + 1) * T, `tree${i % 3}`).setOrigin(0.5, 1).setDepth((t.y + 1) * T));
    for (const f of L.fences) this.add.image(f.x * T, f.y * T, 'fence').setOrigin(0).setDepth(f.y * T + 28);
    for (const h of HIVES) this.add.image(h.x * T, (h.y + 1) * T, 'hive').setOrigin(0, 1).setDepth((h.y + 1) * T);
    this.add.image(this.trough.x * T, this.trough.y * T + 6, 'trough').setOrigin(0).setDepth(this.trough.y * T + 20);

    // The animals mooch about the paddock. Just to look at, for now.
    const r = rng(Math.floor(G.save.day + G.save.season * 14));
    const names: [Critter['kind'], string, string][] = [
      ['cow', 'Buttercup', 'cowBrown'], ['cow', 'Clover', 'cowBlack'],
      ['hen', 'Henrietta', 'hen'], ['hen', 'Peck', 'hen'], ['hen', 'Dot', 'hen'], ['hen', 'Mabel', 'hen'],
    ];
    for (const [kind, name, tex] of names) {
      const x = PADDOCK.x + 1 + Math.floor(r() * (PADDOCK.w - 2)), y = PADDOCK.y + 1 + Math.floor(r() * (PADDOCK.h - 2));
      const img = this.add.image(x * T + 16, y * T + 28, tex).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
      this.critters.push({ img, kind, name, next: 0 });
    }

    const start = G.save.player.scene === 'ranch' ? G.save.player : { x: 1, y: RANCH_ROAD };
    this.addPlayer(start);

    this.input.on('gameobjectdown', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (this.talking || this.busy || anyPanelOpen()) return;
      const person = this.people.find((p) => p.sprite === obj);
      if (person) { this.tapPerson(person); return; }
      const cr = this.critters.find((q) => q.img === obj);
      if (cr) {
        this.interact = { kind: 'critter', text: cr.kind === 'cow'
          ? `${cr.name} the cow chews slowly and looks at you as if you owe her an apple. June says you can have animals of your own one day.`
          : `${cr.name} the hen tilts her head at you, then goes back to hunting bugs.` };
        this.walkTo(PADDOCK.gate, PADDOCK.y - 2, false);
      }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length) return;
      if (this.busy || anyPanelOpen()) return;
      if (this.talking) { this.closeTalk(); return; }
      this.talkTarget = null;
      this.routeTap(Math.floor(p.worldX / T), Math.floor(p.worldY / T));
    });
    this.finishSetup();
    refreshHud();
    if (G.pendingSummary) {
      const summary = G.pendingSummary;
      G.pendingSummary = null;
      void showSummary(summary);
    }
  }

  routeTap(x: number, y: number) {
    const b = RANCH_BUILDINGS.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    if (b) { this.interact = { kind: 'building', id: b.id }; this.walkTo(b.front.x, b.front.y, false); return; }
    if (HIVES.some((h) => h.x === x && h.y === y)) {
      this.interact = { kind: 'hive', text: "One of Hugo's beehives. It hums like a kettle about to boil. Best admired from here." };
      this.walkTo(x, y, true);
      return;
    }
    const t = this.trough;
    if (x >= t.x && x < t.x + t.w && y === t.y) {
      this.interact = { kind: 'trough', text: 'A feed trough full of hay. The cows have opinions about who eats first.' };
      this.walkTo(PADDOCK.gate, PADDOCK.y - 2, false);
      return;
    }
    this.interact = null;
    this.walkTo(x, y, false);
  }

  hasTarget() { return !!(this.talkTarget || this.interact); }

  arrivedAt() {
    const it = this.interact;
    if (!it) return false;
    this.interact = null;
    if (it.kind === 'building') { this.playerDir = 'up'; this.stand(this.player, 'up'); openPlace(it.id); return true; }
    const title = it.kind === 'hive' ? 'A beehive' : it.kind === 'trough' ? 'The feed trough' : 'The paddock';
    info(title, it.text);
    return true;
  }

  onTile(here: { x: number; y: number }) {
    G.save.player = { x: here.x, y: here.y, scene: 'ranch' };
    if (here.x === 0) { this.goTo('town', { x: TOWN_COLS - 2, y: ENTRY_ROW }); return true; }
    return false;
  }

  update(time: number, delta: number) {
    if (!this.tick(time, delta)) return;
    // The animals take a slow step now and then, staying inside the fence.
    for (const cr of this.critters) {
      if (time < cr.next) continue;
      cr.next = time + 2500 + Math.random() * 5000;
      const tx = Phaser.Math.Clamp(Math.floor(cr.img.x / T) + Math.floor(Math.random() * 3) - 1, PADDOCK.x, PADDOCK.x + PADDOCK.w - 1);
      const ty = Phaser.Math.Clamp(Math.floor((cr.img.y - 4) / T) + Math.floor(Math.random() * 3) - 1, PADDOCK.y + 1, PADDOCK.y + PADDOCK.h - 1);
      const nx = tx * T + 16, ny = ty * T + 28;
      if (nx !== cr.img.x) cr.img.setFlipX(nx < cr.img.x);
      this.tweens.add({ targets: cr.img, x: nx, y: ny, duration: cr.kind === 'cow' ? 2200 : 700, ease: 'Sine.easeInOut' });
    }
    for (const cr of this.critters) cr.img.setDepth(cr.img.y);
  }
}
