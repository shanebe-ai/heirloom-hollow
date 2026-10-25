// The farm, drawn by code: ground, the farmhouse, trees and fences, plus which tiles you can walk on.
// Everything is drawn at true pixel size with the same warm outline as the characters.

export const T = 32; // tile size in pixels
export const COLS = 30;
export const ROWS = 22;

const OUT = '#4a2826';
const GRASS = ['#8ccb6a', '#84c463', '#93d070'];
const GRASS_DARK = '#6aa94f';
const PATH = '#e2bd86';
const PATH_DARK = '#c99f6a';
const SOIL = '#8a5a3c';
const SOIL_DARK = '#6e452c';
const WATER = '#6ec3e6';
const WATER_DARK = '#4fa8d0';

/** A little seeded random so the farm looks the same every visit. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type Ground = 'grass' | 'path' | 'soil' | 'water';

export interface Farm {
  ground: Ground[][];
  blocked: boolean[][];
  trees: { x: number; y: number }[];
  fences: { x: number; y: number }[];
  crops: { x: number; y: number; stage: number }[];
  house: { x: number; y: number; w: number; h: number; door: { x: number; y: number } };
  pond: { x: number; y: number; w: number; h: number };
  start: { x: number; y: number };
  bramble: { x: number; y: number };
  sign: { x: number; y: number };
}

/** Lays out Hazel's farm on the tile grid. */
export function layout(): Farm {
  const ground: Ground[][] = [];
  const blocked: boolean[][] = [];
  for (let y = 0; y < ROWS; y++) {
    ground.push(Array(COLS).fill('grass'));
    blocked.push(Array(COLS).fill(false));
  }
  const house = { x: 3, y: 2, w: 5, h: 4, door: { x: 5, y: 5 } };
  for (let y = house.y; y < house.y + house.h; y++)
    for (let x = house.x; x < house.x + house.w; x++) blocked[y][x] = true;

  // A path from the door down and out east, towards town.
  for (let y = 6; y <= 11; y++) ground[y][5] = 'path';
  for (let x = 5; x < COLS; x++) ground[11][x] = 'path';
  for (let x = 6; x <= 7; x++) ground[6][x] = 'path';

  // The old field, cleared and tilled, with a fence round it and a gate on the path side.
  const crops: Farm['crops'] = [];
  const fences: Farm['fences'] = [];
  const fx = 11, fy = 3, fw = 10, fh = 6;
  const r = rng(7);
  for (let y = fy; y < fy + fh; y++)
    for (let x = fx; x < fx + fw; x++) {
      ground[y][x] = 'soil';
      if (r() < 0.55) crops.push({ x, y, stage: Math.floor(r() * 4) });
    }
  for (let x = fx - 1; x <= fx + fw; x++) {
    fences.push({ x, y: fy - 1 });
    if (x !== fx + 4 && x !== fx + 5) fences.push({ x, y: fy + fh });
  }
  for (let y = fy; y < fy + fh; y++) {
    fences.push({ x: fx - 1, y });
    fences.push({ x: fx + fw, y });
  }
  for (const f of fences) blocked[f.y][f.x] = true;
  // A short path from the gate down to the main path.
  for (let y = fy + fh; y < 11; y++) { ground[y][fx + 4] = 'path'; ground[y][fx + 5] = 'path'; }

  // The pond, bottom left.
  const pond = { x: 2, y: 14, w: 7, h: 5 };
  for (let y = pond.y; y < pond.y + pond.h; y++)
    for (let x = pond.x; x < pond.x + pond.w; x++) {
      const cx = (x - pond.x + 0.5) / pond.w - 0.5, cy = (y - pond.y + 0.5) / pond.h - 0.5;
      if (cx * cx + cy * cy < 0.26) { ground[y][x] = 'water'; blocked[y][x] = true; }
    }

  // Trees round the edge and a few dotted about, never on the path or the field.
  const trees: Farm['trees'] = [];
  const tr = rng(42);
  const free = (x: number, y: number) => ground[y][x] === 'grass' && !blocked[y][x] &&
    !(y >= 10 && y <= 12) && !(x >= 4 && x <= 6 && y >= 5 && y <= 12);
  for (let x = 0; x < COLS; x += 2) {
    if (free(x, 0)) trees.push({ x, y: 0 });
    if (free(x, ROWS - 1) && tr() < 0.8) trees.push({ x, y: ROWS - 1 });
  }
  for (let y = 2; y < ROWS - 1; y += 2) {
    if (free(0, y)) trees.push({ x: 0, y });
    if (free(COLS - 1, y) && tr() < 0.7) trees.push({ x: COLS - 1, y });
  }
  for (let i = 0; i < 14; i++) {
    const x = 2 + Math.floor(tr() * (COLS - 4)), y = 2 + Math.floor(tr() * (ROWS - 4));
    if (free(x, y) && free(x, y + 1) && !trees.some(t => Math.abs(t.x - x) < 2 && Math.abs(t.y - y) < 2))
      trees.push({ x, y });
  }
  for (const t of trees) blocked[t.y][t.x] = true;
  // The way to town stays open.
  for (let x = COLS - 2; x < COLS; x++) { blocked[11][x] = false; }
  const treesKept = trees.filter(t => !(t.y >= 10 && t.y <= 12 && t.x >= COLS - 2));

  return {
    ground, blocked, trees: treesKept, fences, crops, house, pond,
    start: { x: 5, y: 7 }, bramble: { x: 9, y: 17 }, sign: { x: COLS - 3, y: 10 },
  };
}

type Ctx = CanvasRenderingContext2D;
const px = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

/** The whole ground in one picture: grass with tufts and flowers, the path, the field, the pond. */
export function drawGround(farm: Farm): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = COLS * T; cv.height = ROWS * T;
  const c = cv.getContext('2d')!;
  const r = rng(3);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? 'grass' : farm.ground[y][x]);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const X = x * T, Y = y * T, g = farm.ground[y][x];
      px(c, X, Y, T, T, GRASS[0]);
      // Soft lighter and darker patches so the grass doesn't look tiled.
      for (let k = 0; k < 3; k++) px(c, X + Math.floor(r() * 26), Y + Math.floor(r() * 28), 4 + Math.floor(r() * 6), 2 + Math.floor(r() * 3), GRASS[1 + Math.floor(r() * 2)]);
      // Grass texture: little tufts and the odd flower.
      for (let k = 0; k < 6; k++) {
        const tx = X + Math.floor(r() * 30), ty = Y + Math.floor(r() * 30);
        px(c, tx, ty, 1, 2, GRASS_DARK); px(c, tx + 2, ty + 1, 1, 2, GRASS_DARK);
      }
      if (g === 'grass' && r() < 0.12) {
        const fx = X + 6 + Math.floor(r() * 18), fy = Y + 6 + Math.floor(r() * 18);
        const petal = ['#fff6e6', '#f7a8c4', '#ffd166', '#c9b6f2'][Math.floor(r() * 4)];
        px(c, fx - 1, fy, 3, 1, petal); px(c, fx, fy - 1, 1, 3, petal); px(c, fx, fy, 1, 1, '#f0a03c');
      }
      if (g === 'path') {
        px(c, X, Y, T, T, PATH);
        for (let k = 0; k < 5; k++) px(c, X + Math.floor(r() * 30), Y + Math.floor(r() * 30), 2, 1, PATH_DARK);
        // Soft grass edges where the path meets grass.
        if (at(x, y - 1) === 'grass') for (let i = 0; i < T; i += 3) px(c, X + i, Y, 2, 1 + Math.floor(r() * 3), GRASS[0]);
        if (at(x, y + 1) === 'grass') for (let i = 0; i < T; i += 3) px(c, X + i, Y + T - 2, 2, 2, PATH_DARK);
        if (at(x - 1, y) === 'grass') for (let i = 0; i < T; i += 3) px(c, X, Y + i, 1 + Math.floor(r() * 3), 2, GRASS[0]);
        if (at(x + 1, y) === 'grass') for (let i = 0; i < T; i += 3) px(c, X + T - 2, Y + i, 2, 2, GRASS[0]);
      }
      if (g === 'soil') {
        px(c, X + 1, Y + 1, T - 2, T - 2, SOIL);
        for (let i = 4; i < T; i += 8) px(c, X + 2, Y + i, T - 4, 2, SOIL_DARK);
      }
      if (g === 'water') {
        px(c, X, Y, T, T, WATER);
        for (let k = 0; k < 3; k++) {
          const wx = X + 3 + Math.floor(r() * 22), wy = Y + 4 + Math.floor(r() * 24);
          px(c, wx, wy, 5, 1, '#bfe9f7');
        }
        if (at(x, y - 1) !== 'water') { px(c, X, Y, T, 4, '#a3d48a'); px(c, X, Y + 4, T, 2, OUT); }
        if (at(x, y + 1) !== 'water') { px(c, X, Y + T - 3, T, 3, WATER_DARK); }
        if (at(x - 1, y) !== 'water') { px(c, X, Y, 2, T, OUT); }
        if (at(x + 1, y) !== 'water') { px(c, X + T - 2, Y, 2, T, OUT); }
      }
    }
  // Sprouts and growing crops on the field.
  for (const cr of farm.crops) {
    const X = cr.x * T + 16, Y = cr.y * T + 20;
    const leaf = '#5fae4a', light = '#9be07a';
    if (cr.stage === 0) { px(c, X - 1, Y - 3, 2, 3, leaf); px(c, X - 3, Y - 4, 2, 2, light); px(c, X + 1, Y - 4, 2, 2, light); }
    if (cr.stage >= 1) { px(c, X, Y - 8, 1, 8, leaf); px(c, X - 4, Y - 7, 4, 3, light); px(c, X + 1, Y - 9, 4, 3, light); }
    if (cr.stage >= 2) { px(c, X - 5, Y - 3, 4, 3, leaf); px(c, X + 2, Y - 4, 4, 3, leaf); }
    if (cr.stage === 3) { px(c, X - 2, Y - 13, 5, 5, '#f26b5b'); px(c, X - 1, Y - 12, 2, 2, '#ffb0a0'); }
  }
  return cv;
}

/** Hazel's farmhouse: cream walls, timber beams, a rosy roof. */
export function drawHouse(): HTMLCanvasElement {
  const W = 5 * T, H = 4 * T + 24;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const wallTop = 62;
  // Chimney.
  px(c, 118, 6, 18, 34, OUT); px(c, 120, 8, 14, 32, '#b36a5a'); px(c, 120, 8, 14, 4, '#d98a76');
  // Roof.
  for (let i = 0; i < 56; i++) {
    const inset = Math.max(0, 28 - i);
    px(c, 4 + inset, 8 + i, W - 8 - inset * 2, 1, i < 2 ? OUT : (i % 8 < 4 ? '#e0857a' : '#d4766b'));
  }
  px(c, 2, 62, W - 4, 4, OUT); px(c, 4, 58, W - 8, 4, '#b85d55');
  // Walls.
  px(c, 8, wallTop, W - 16, H - wallTop - 6, OUT);
  px(c, 10, wallTop + 2, W - 20, H - wallTop - 10, '#f6e6c6');
  for (const bx of [10, 74, W - 16]) px(c, bx, wallTop + 2, 6, H - wallTop - 10, '#9a6b48');
  px(c, 10, wallTop + 2, W - 20, 5, '#9a6b48');
  // Windows with flower boxes.
  for (const wx of [24, 104]) {
    px(c, wx, 84, 30, 26, OUT); px(c, wx + 2, 86, 26, 22, '#9fd8f0'); px(c, wx + 14, 86, 2, 22, OUT); px(c, wx + 2, 96, 26, 2, OUT);
    px(c, wx + 3, 87, 6, 4, '#e9f8ff');
    px(c, wx - 2, 110, 34, 6, '#9a6b48');
    for (let f = 0; f < 5; f++) px(c, wx + 1 + f * 6, 106, 4, 4, ['#f7a8c4', '#ffd166', '#f26b5b'][f % 3]);
  }
  // Door.
  px(c, 62, 96, 36, H - 102, OUT); px(c, 65, 99, 30, H - 104, '#b5784e');
  px(c, 65, 99, 30, 3, '#cf9466'); px(c, 88, 120, 3, 3, '#ffd166');
  // Step.
  px(c, 58, H - 8, 44, 8, '#c4b29a'); px(c, 58, H - 8, 44, 2, OUT);
  return cv;
}

/** A round leafy tree, two tiles wide, standing on its trunk tile. */
export function drawTree(seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 80;
  const c = cv.getContext('2d')!;
  const r = rng(seed);
  px(c, 26, 52, 12, 26, OUT); px(c, 28, 52, 8, 26, '#8a5a3c'); px(c, 28, 52, 3, 26, '#a8714c');
  const blobs = [[32, 30, 24], [18, 36, 14], [46, 36, 14], [32, 16, 14]];
  const shades = ['#4f9a45', '#5fae4a', '#79c35a'];
  for (const [layer, col] of shades.entries()) {
    for (const [bx, by, br] of blobs) {
      const rr = br - layer * 4, ox = -layer * 2, oy = -layer * 3;
      for (let y = -rr; y <= rr; y++)
        for (let x = -rr; x <= rr; x++)
          if (x * x + y * y <= rr * rr + r() * 6) px(c, bx + x + ox, by + y + oy, 1, 1, col);
    }
  }
  // Outline the canopy.
  const img = c.getImageData(0, 0, 64, 80);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < 64 && y < 80 && img.data[(y * 64 + x) * 4 + 3] > 0;
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 64; x++)
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) px(c, x, y, 1, 1, OUT);
  // A few apples or blossoms.
  for (let k = 0; k < 4; k++) px(c, 14 + Math.floor(r() * 36), 14 + Math.floor(r() * 26), 3, 3, r() < 0.5 ? '#f7a8c4' : '#f26b5b');
  return cv;
}

/** One fence post with rails, a tile wide. */
export function drawFence(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = T; cv.height = T;
  const c = cv.getContext('2d')!;
  px(c, 0, 12, T, 6, OUT); px(c, 0, 13, T, 4, '#c98f5f');
  px(c, 0, 22, T, 6, OUT); px(c, 0, 23, T, 4, '#c98f5f');
  px(c, 12, 4, 8, 28, OUT); px(c, 14, 6, 4, 26, '#e0a874'); px(c, 14, 6, 4, 2, '#f0c08c');
  return cv;
}

/** The signpost pointing to town. */
export function drawSign(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 40; cv.height = 40;
  const c = cv.getContext('2d')!;
  px(c, 18, 14, 6, 26, OUT); px(c, 19, 14, 4, 26, '#9a6b48');
  px(c, 2, 4, 36, 14, OUT); px(c, 4, 6, 32, 10, '#e0a874');
  px(c, 30, 8, 4, 6, OUT); px(c, 8, 10, 18, 2, '#9a6b48');
  return cv;
}
