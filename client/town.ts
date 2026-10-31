// Hollow Square: the town east of the farm. Building fronts with signs and
// doors that open their shop or say when they are closed, a fountain and a
// noticeboard, the river with its bridge and dock, and everyone in the valley
// going about their day. All drawn by code in the farm's style.
import Phaser from 'phaser';
import { T, rng, drawTree } from './world';
import { G, clockLabel } from './state';
import { refreshHud, info, anyPanelOpen, openPlace, showSummary } from './ui';
import { Walker } from './walker';
import {
  TOWN_COLS, TOWN_ROWS, BUILDINGS, WEST_GATE, EAST_GATE, RANCH_ROAD, FOUNTAIN, NOTICEBOARD, ENTRY_ROW, townLayout, isOpen, hoursText, isRestDay,
  type Building, type TownGround,
} from '../shared/town.js';
import { COLS as FARM_COLS } from './world';

const OUT = '#4a2826';
/** Old fashioned lettering for the shop signs. */
const SIGN_FONT = '"IM Fell English SC", Georgia, serif';
const GRASS = ['#8ccb6a', '#84c463', '#93d070'];
const GRASS_DARK = '#6aa94f';
type Ctx = CanvasRenderingContext2D;
const px = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

export function drawTownGround(ground: TownGround[][]): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const ROWS = ground.length, COLS = ground[0].length;
  cv.width = COLS * T; cv.height = ROWS * T;
  const c = cv.getContext('2d')!;
  const r = rng(9 + COLS);
  const at = (x: number, y: number) => ground[y]?.[x] ?? 'grass';
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const X = x * T, Y = y * T, g = ground[y][x];
      px(c, X, Y, T, T, GRASS[0]);
      for (let k = 0; k < 3; k++) px(c, X + Math.floor(r() * 26), Y + Math.floor(r() * 28), 4 + Math.floor(r() * 6), 2 + Math.floor(r() * 3), GRASS[1 + Math.floor(r() * 2)]);
      for (let k = 0; k < 5; k++) { const tx = X + Math.floor(r() * 30), ty = Y + Math.floor(r() * 30); px(c, tx, ty, 1, 2, GRASS_DARK); }
      if (g === 'grass' && r() < 0.1) {
        const fx = X + 6 + Math.floor(r() * 18), fy = Y + 6 + Math.floor(r() * 18);
        const petal = ['#fff6e6', '#f7a8c4', '#ffd166', '#c9b6f2'][Math.floor(r() * 4)];
        px(c, fx - 1, fy, 3, 1, petal); px(c, fx, fy - 1, 1, 3, petal); px(c, fx, fy, 1, 1, '#f0a03c');
      }
      if (g === 'path') {
        px(c, X, Y, T, T, '#e2bd86');
        for (let k = 0; k < 5; k++) px(c, X + Math.floor(r() * 30), Y + Math.floor(r() * 30), 2, 1, '#c99f6a');
        if (at(x, y - 1) === 'grass') for (let i = 0; i < T; i += 3) px(c, X + i, Y, 2, 1 + Math.floor(r() * 3), GRASS[0]);
        if (at(x, y + 1) === 'grass') for (let i = 0; i < T; i += 3) px(c, X + i, Y + T - 2, 2, 2, '#c99f6a');
      }
      if (g === 'mud') {
        px(c, X, Y, T, T, '#a8805a');
        for (let k = 0; k < 6; k++) px(c, X + Math.floor(r() * 28), Y + Math.floor(r() * 28), 4, 2, r() < 0.5 ? '#8a6544' : '#d9b56a');
      }
      if (g === 'flowers') {
        for (let k = 0; k < 7; k++) {
          const fx = X + 3 + Math.floor(r() * 26), fy = Y + 3 + Math.floor(r() * 26);
          const petal = ['#f7a8c4', '#ffd166', '#c9b6f2', '#fff6e6', '#f26b5b'][Math.floor(r() * 5)];
          px(c, fx, fy + 2, 1, 3, '#4c8a3d'); px(c, fx - 1, fy, 3, 2, petal);
        }
      }
      if (g === 'cobble') {
        px(c, X, Y, T, T, '#cdbfa8');
        for (let sy = 0; sy < T; sy += 8)
          for (let sx = (sy / 8) % 2 ? 4 : 0; sx < T; sx += 8) {
            px(c, X + sx, Y + sy, 7, 7, ['#d9ccb4', '#c4b49a', '#e2d6bf'][Math.floor(r() * 3)]);
            px(c, X + sx, Y + sy + 6, 7, 1, '#a99a80');
          }
      }
      if (g === 'water') {
        px(c, X, Y, T, T, '#6ec3e6');
        for (let k = 0; k < 3; k++) px(c, X + 3 + Math.floor(r() * 22), Y + 4 + Math.floor(r() * 24), 5, 1, '#bfe9f7');
        if (at(x, y - 1) !== 'water' && at(x, y - 1) !== 'bridge') { px(c, X, Y, T, 4, '#a3d48a'); px(c, X, Y + 4, T, 2, OUT); }
        if (at(x, y + 1) !== 'water' && at(x, y + 1) !== 'bridge') { px(c, X, Y + T - 4, T, 2, OUT); px(c, X, Y + T - 2, T, 2, '#a3d48a'); }
      }
      if (g === 'bridge' || g === 'dock') {
        if (g === 'dock') px(c, X, Y, T, T, '#6ec3e6');
        px(c, X, Y, T, T, '#b5784e');
        for (let i = 0; i < T; i += 8) { px(c, X + i, Y, 1, T, '#8a5a3c'); px(c, X + i + 1, Y, 6, 2, '#cf9466'); }
        if (g === 'bridge') { px(c, X, Y, 3, T, OUT); px(c, X + T - 3, Y, 3, T, OUT); }
      }
    }
  return cv;
}

/** One building front: a roof, a wall with windows, a door, and a board for its sign. */
export function drawFront(b: Building): HTMLCanvasElement {
  const W = b.w * T, H = b.h * T;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const roofH = 58;
  // Roof with rows of tiles.
  px(c, 2, 4, W - 4, roofH, OUT);
  px(c, 4, 6, W - 8, roofH - 4, b.roof);
  for (let y = 12; y < roofH; y += 8) px(c, 4, y, W - 8, 2, 'rgba(74,40,38,0.25)');
  px(c, 0, roofH, W, 5, OUT);
  // Wall.
  px(c, 6, roofH + 5, W - 12, H - roofH - 5, OUT);
  px(c, 8, roofH + 5, W - 16, H - roofH - 7, b.wall);
  px(c, 8, roofH + 5, W - 16, 4, 'rgba(74,40,38,0.18)');
  // Door in the middle of the door tile.
  const dx = (b.door.x - b.x) * T + 4;
  px(c, dx - 2, H - 46, 28, 46, OUT);
  px(c, dx, H - 44, 24, 44, '#b5784e');
  px(c, dx, H - 44, 24, 3, '#cf9466');
  px(c, dx + 18, H - 22, 3, 3, '#ffd166');
  if (b.id === 'barn') {
    // A barn: big double doors with cross braces, and a hayloft hatch under the roof.
    const bw = 76, bx = Math.floor((W - bw) / 2), by = H - 64;
    px(c, bx - 3, by - 3, bw + 6, 67, OUT);
    for (const half of [0, 1]) {
      const x0 = bx + half * (bw / 2);
      px(c, x0, by, bw / 2 - 1, 64, '#b5784e');
      for (let i = 0; i < bw / 2 - 1; i += 8) px(c, x0 + i, by, 1, 64, '#9a6b48');
      px(c, x0, by, bw / 2 - 1, 3, '#f6e6c6'); px(c, x0, by + 61, bw / 2 - 1, 3, '#f6e6c6');
      for (let k = 0; k < 34; k++) { px(c, x0 + k, by + Math.floor(k * 1.8), 3, 3, '#f6e6c6'); px(c, x0 + 34 - k, by + Math.floor(k * 1.8), 3, 3, '#f6e6c6'); }
    }
    px(c, bx + bw / 2 - 1, by, 2, 64, OUT);
    px(c, W / 2 - 14, roofH + 9, 28, 20, OUT); px(c, W / 2 - 12, roofH + 11, 24, 16, '#5c3a26');
    px(c, W / 2 - 10, roofH + 19, 20, 8, '#e8d18a');
    px(c, 10, roofH - 22, W - 20, 18, OUT);
    px(c, 12, roofH - 20, W - 24, 14, '#f6e6c6');
    return cv;
  }
  // Windows either side of the door, with flower boxes.
  for (let wx = 16; wx < W - 28; wx += 40) {
    if (Math.abs(wx + 13 - (dx + 12)) < 30) continue;
    px(c, wx, roofH + 16, 26, 22, OUT); px(c, wx + 2, roofH + 18, 22, 18, '#9fd8f0');
    px(c, wx + 12, roofH + 18, 2, 18, OUT); px(c, wx + 3, roofH + 19, 5, 3, '#e9f8ff');
    px(c, wx - 2, roofH + 38, 30, 5, '#9a6b48');
    for (let f = 0; f < 4; f++) px(c, wx + 1 + f * 7, roofH + 35, 4, 4, ['#f7a8c4', '#ffd166', '#f26b5b'][f % 3]);
  }
  // The board the sign hangs on, under the eaves.
  px(c, 10, roofH - 22, W - 20, 18, OUT);
  px(c, 12, roofH - 20, W - 24, 14, '#f6e6c6');
  return cv;
}

function drawFountain(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 72;
  const c = cv.getContext('2d')!;
  px(c, 2, 34, 60, 36, OUT); px(c, 4, 36, 56, 32, '#c4b49a'); px(c, 8, 40, 48, 22, '#6ec3e6');
  px(c, 12, 44, 10, 2, '#bfe9f7'); px(c, 36, 52, 12, 2, '#bfe9f7');
  px(c, 28, 14, 8, 30, OUT); px(c, 30, 14, 4, 30, '#d9ccb4');
  px(c, 20, 10, 24, 8, OUT); px(c, 22, 11, 20, 6, '#d9ccb4');
  for (const [x, y] of [[18, 20], [42, 22], [24, 28], [38, 30], [31, 4]] as const) px(c, x, y, 3, 6, '#9fd8f0');
  return cv;
}

function drawNoticeboard(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 48;
  const c = cv.getContext('2d')!;
  px(c, 6, 26, 4, 22, OUT); px(c, 22, 26, 4, 22, OUT);
  px(c, 1, 4, 30, 26, OUT); px(c, 3, 6, 26, 22, '#b5784e');
  px(c, 6, 9, 9, 8, '#fff6e6'); px(c, 17, 8, 9, 11, '#f7e3a8'); px(c, 8, 19, 11, 7, '#e9f8ff');
  px(c, 10, 9, 1, 1, '#f26b5b'); px(c, 21, 8, 1, 1, '#f26b5b'); px(c, 13, 19, 1, 1, '#f26b5b');
  return cv;
}

function drawLamp(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 64;
  const c = cv.getContext('2d')!;
  px(c, 14, 18, 4, 46, OUT); px(c, 9, 4, 14, 16, OUT); px(c, 11, 6, 10, 12, '#ffd166'); px(c, 12, 7, 3, 4, '#fff6e6');
  px(c, 10, 60, 12, 4, OUT);
  return cv;
}

function drawBench(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 32;
  const c = cv.getContext('2d')!;
  px(c, 1, 10, 30, 6, OUT); px(c, 2, 11, 28, 4, '#cf9466');
  px(c, 1, 18, 30, 6, OUT); px(c, 2, 19, 28, 4, '#b5784e');
  px(c, 4, 24, 4, 8, OUT); px(c, 24, 24, 4, 8, OUT);
  return cv;
}

function drawBed(seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 32;
  const c = cv.getContext('2d')!;
  const r = rng(seed);
  px(c, 1, 8, 30, 23, OUT); px(c, 3, 10, 26, 19, '#8a5a3c');
  for (let k = 0; k < 9; k++) {
    const x = 5 + Math.floor(r() * 20), y = 11 + Math.floor(r() * 14);
    px(c, x, y + 2, 1, 3, '#4c8a3d');
    const col = ['#f26b9d', '#ffd166', '#c9b6f2', '#fff6e6', '#f26b5b'][k % 5];
    px(c, x - 1, y, 3, 2, col);
  }
  return cv;
}

function drawBonsai(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 32;
  const c = cv.getContext('2d')!;
  px(c, 6, 22, 20, 9, OUT); px(c, 8, 23, 16, 6, '#5f8f6a');
  px(c, 15, 12, 3, 11, '#6e452c'); px(c, 11, 14, 5, 2, '#6e452c');
  px(c, 4, 6, 14, 8, OUT); px(c, 5, 7, 12, 6, '#5fae4a');
  px(c, 15, 3, 13, 9, OUT); px(c, 16, 4, 11, 7, '#79c35a');
  return cv;
}

export class Town extends Walker {
  readonly where = 'town' as const;
  gates() { return { west: WEST_GATE, east: EAST_GATE }; }
  ground!: TownGround[][];
  interact: { kind: 'building'; id: string } | { kind: 'fountain' | 'notices' | 'bench' | 'bed' | 'bonsai' } | null = null;
  things: { x: number; y: number; w: number; h: number; kind: 'fountain' | 'notices' | 'bench' | 'bed' | 'bonsai' }[] = [];

  constructor() { super('town'); }

  create() {
    (window as unknown as { hhTown: Town }).hhTown = this; // handy for testing in the browser
    this.beginVisit('Hollow Square');
    this.interact = null;
    const L = townLayout();
    this.cols = TOWN_COLS;
    this.rows = TOWN_ROWS;
    this.blocked = L.blocked;
    this.ground = L.ground;
    this.canvasTex('townGround', () => drawTownGround(L.ground));
    for (let i = 0; i < 3; i++) this.canvasTex(`tree${i}`, () => drawTree(11 + i * 17));
    this.canvasTex('fountain', drawFountain);
    this.canvasTex('noticeboard', drawNoticeboard);
    this.canvasTex('lamp', drawLamp);
    this.canvasTex('bench', drawBench);
    this.canvasTex('bonsai', drawBonsai);
    this.add.image(0, 0, 'townGround').setOrigin(0).setDepth(-10);

    const signs: Phaser.GameObjects.Text[] = [];
    for (const b of BUILDINGS) {
      this.canvasTex(`front_${b.id}`, () => drawFront(b));
      const bottom = (b.y + b.h) * T;
      this.add.image(b.x * T, bottom, `front_${b.id}`).setOrigin(0, 1).setDepth(bottom);
      signs.push(this.add.text(b.x * T + (b.w * T) / 2, b.y * T + 45, b.name, {
        fontFamily: SIGN_FONT, fontSize: '13px', color: '#4a2826', resolution: 3,
      }).setOrigin(0.5).setDepth(bottom + 1));
    }
    // The sign font comes from the web; redraw the signs once it has arrived.
    void document.fonts?.load(`13px ${SIGN_FONT}`).then(() => { for (const t of signs) if (t.active) t.setFontFamily(SIGN_FONT); }).catch(() => {});
    L.trees.forEach((t, i) => this.add.image(t.x * T + 16, (t.y + 1) * T, `tree${i % 3}`).setOrigin(0.5, 1).setDepth((t.y + 1) * T));
    this.add.image(FOUNTAIN.x * T, (FOUNTAIN.y + FOUNTAIN.h) * T, 'fountain').setOrigin(0, 1).setDepth((FOUNTAIN.y + FOUNTAIN.h) * T);
    this.add.image(NOTICEBOARD.x * T, (NOTICEBOARD.y + 1) * T, 'noticeboard').setOrigin(0, 1).setDepth((NOTICEBOARD.y + 1) * T);
    for (const l of L.lamps) this.add.image(l.x * T, (l.y + 1) * T, 'lamp').setOrigin(0, 1).setDepth((l.y + 1) * T);
    for (const b of L.benches) this.add.image(b.x * T, b.y * T, 'bench').setOrigin(0).setDepth(b.y * T + 20);
    L.beds.forEach((b, i) => { this.canvasTex(`bed${i}`, () => drawBed(30 + i)); this.add.image(b.x * T, b.y * T, `bed${i}`).setOrigin(0).setDepth(b.y * T + 4); });
    for (let x = L.bonsai.x; x < L.bonsai.x + L.bonsai.w; x += 2) this.add.image(x * T, L.bonsai.y * T, 'bonsai').setOrigin(0).setDepth(L.bonsai.y * T + 20);
    this.things = [
      { ...FOUNTAIN, kind: 'fountain' },
      { x: NOTICEBOARD.x, y: NOTICEBOARD.y, w: 1, h: 1, kind: 'notices' },
      ...L.benches.map((b) => ({ x: b.x, y: b.y, w: 1, h: 1, kind: 'bench' as const })),
      ...L.beds.map((b) => ({ x: b.x, y: b.y, w: 1, h: 1, kind: 'bed' as const })),
      { x: L.bonsai.x, y: L.bonsai.y, w: L.bonsai.w, h: 1, kind: 'bonsai' },
    ];

    const start = G.save.player.scene === 'town' ? G.save.player : { x: 1, y: ENTRY_ROW };
    this.addPlayer(start);

    this.input.on('gameobjectdown', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (this.talking || this.busy || anyPanelOpen()) return;
      const person = this.people.find((p) => p.sprite === obj);
      if (person) this.tapPerson(person);
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

  /** A tap on a building walks to its door; a tap on the fountain or the board walks up to it. */
  routeTap(x: number, y: number) {
    const b = BUILDINGS.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    if (b) { this.interact = { kind: 'building', id: b.id }; this.walkTo(b.front.x, b.front.y, false); return; }
    const t = this.things.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    if (t) { this.interact = { kind: t.kind }; this.walkTo(x, y, true); return; }
    this.interact = null;
    this.walkTo(x, y, false);
  }

  hasTarget() { return !!(this.talkTarget || this.interact); }

  arrivedAt() {
    const it = this.interact;
    if (!it) return false;
    this.interact = null;
    if (it.kind === 'building') { this.playerDir = 'up'; this.stand(this.player, 'up'); openPlace(it.id); return true; }
    if (it.kind === 'fountain') info('The fountain', 'Coins glint at the bottom of the fountain. Someone has wished a lot of wishes.');
    else if (it.kind === 'notices') info('The noticeboard', this.notices());
    else if (it.kind === 'bench') info('A bench', 'A sun warmed bench. Somebody has carved a heart into the arm.');
    else if (it.kind === 'bed') info('Flower beds', "Rosie's flower beds, every one of them in bloom.");
    else info('The bonsai garden', "Hana's bonsai garden. Each little tree is older than you are.");
    return true;
  }

  /** What the noticeboard says today: written by code from the day and the hours. */
  notices(): string {
    const s = G.save;
    const store = isOpen('store', s.minutes, s.day) ? 'The General Store is open now.' : `The General Store: ${hoursText('store')}`;
    const rest = isRestDay(s.day) ? 'Rest day today: the store, the clinic and the Mayor\'s House are shut.' : 'Next rest day is day ' + (Math.floor(s.day / 7) * 7 + 7) + '.';
    return `${clockLabel().split('  ')[0]}. ${store} ${rest} Flower Festival on Spring 14. Lost: one grey cat, answers to Biscuit.`;
  }

  onTile(here: { x: number; y: number }) {
    G.save.player = { x: here.x, y: here.y, scene: 'town' };
    if (here.x === 0) { this.goTo('farm', { x: FARM_COLS - 2, y: 11 }); return true; }
    if (here.x === TOWN_COLS - 1) { this.goTo('ranch', { x: 1, y: RANCH_ROAD }); return true; }
    return false;
  }

  update(time: number, delta: number) {
    this.tick(time, delta);
  }
}
