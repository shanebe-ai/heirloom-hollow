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
  field: { x: number; y: number; w: number; h: number };
  house: { x: number; y: number; w: number; h: number; door: { x: number; y: number } };
  pond: { x: number; y: number; w: number; h: number };
  start: { x: number; y: number };
  bramble: { x: number; y: number };
  sign: { x: number; y: number };
  shipping: { x: number; y: number };
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

  // The old field, gone back to grass, with a fence round it and a gate on the path side.
  // What is tilled and planted there lives in the player's save now, not the map.
  const fences: Farm['fences'] = [];
  const fx = 11, fy = 3, fw = 10, fh = 6;
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
    !(y >= 10 && y <= 12) && !(x >= 4 && x <= 6 && y >= 5 && y <= 12) &&
    !(x >= fx - 1 && x <= fx + fw && y >= fy - 1 && y <= fy + fh);
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
    ground, blocked, trees: treesKept, fences, field: { x: fx, y: fy, w: fw, h: fh }, house, pond,
    start: { x: 5, y: 7 }, bramble: { x: 9, y: 17 }, sign: { x: COLS - 3, y: 10 }, shipping: { x: 8, y: 5 },
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
  return cv;
}

/** One tile of tilled soil, dry or freshly watered (darker). Drawn over the grass. */
export function drawSoil(wet: boolean): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = T; cv.height = T;
  const c = cv.getContext('2d')!;
  px(c, 1, 1, T - 2, T - 2, wet ? '#5d3a24' : SOIL);
  for (let i = 4; i < T; i += 8) px(c, 2, i, T - 4, 2, wet ? '#4e2f1d' : SOIL_DARK);
  px(c, 1, 1, T - 2, 2, wet ? '#6e452c' : '#9a6b48');
  return cv;
}

/** Fertiliser spread on soil: pale flecks over the tilled earth. */
export function drawFertiliser(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = T; cv.height = T;
  const c = cv.getContext('2d')!;
  const r = rng(77);
  for (let k = 0; k < 22; k++) px(c, 3 + Math.floor(r() * 26), 3 + Math.floor(r() * 26), 2, 1, k % 3 ? '#e9dcc0' : '#c9b6f2');
  return cv;
}

const LEAF = '#5fae4a', LEAF_LIGHT = '#9be07a', STEM = '#4c8a3d';

/** A crop at one growth stage: 0 to 3 growing leaf clusters, 4 is ripe and shows itself. */
export function drawCrop(crop: string, stage: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = T; cv.height = T;
  const c = cv.getContext('2d')!;
  const cx = 16, base = 27;
  if (stage === 0) {
    px(c, cx - 1, base - 4, 2, 4, STEM);
    px(c, cx - 4, base - 6, 3, 2, LEAF_LIGHT); px(c, cx + 1, base - 6, 3, 2, LEAF_LIGHT);
    return cv;
  }
  // Leafy body that fills out with the stage.
  const spread = [0, 4, 7, 9][Math.min(3, stage)];
  const height = [0, 7, 11, 14][Math.min(3, stage)];
  px(c, cx - 1, base - height, 2, height, STEM);
  for (let i = 0; i < 5 + stage * 3; i++) {
    const lx = cx - spread + Math.floor(Math.abs(Math.sin(i * 7.3)) * spread * 2);
    const ly = base - 2 - Math.floor(Math.abs(Math.cos(i * 3.1)) * height);
    px(c, lx - 2, ly - 1, 4, 3, i % 3 ? LEAF : LEAF_LIGHT);
  }
  if (stage < 4) return cv;
  // Ripe: each crop shows what it has been growing.
  if (crop === 'turnip') {
    px(c, cx - 5, base - 6, 10, 7, '#fff6e6'); px(c, cx - 5, base - 6, 10, 3, '#c9b6f2');
    px(c, cx - 1, base - 5, 2, 2, '#e9f8ff');
  } else if (crop === 'strawberry') {
    for (const [bx, by] of [[-8, -8], [5, -11], [-3, -14], [8, -5]]) {
      px(c, cx + bx, base + by, 5, 6, '#e8483f'); px(c, cx + bx + 1, base + by + 1, 2, 2, '#ffb0a0');
    }
  } else if (crop === 'potato') {
    px(c, cx - 7, base - 3, 6, 4, '#c99f6a'); px(c, cx + 2, base - 2, 6, 4, '#b8895a');
    px(c, cx - 6, base - 3, 2, 1, '#e2bd86'); px(c, cx + 3, base - 2, 2, 1, '#e2bd86');
  } else if (crop === 'tulip') {
    px(c, cx - 2, base - 16, 5, 7, '#f26b9d'); px(c, cx - 2, base - 16, 5, 2, '#f7a8c4');
    px(c, cx - 1, base - 17, 1, 2, '#f26b9d'); px(c, cx + 1, base - 17, 1, 2, '#f26b9d');
  }
  return cv;
}

/** A withered out of season plant: brown and drooping, waiting for the hoe. */
export function drawDeadPlant(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = T; cv.height = T;
  const c = cv.getContext('2d')!;
  const cx = 16, base = 27;
  px(c, cx - 1, base - 9, 2, 9, '#8a6a42');
  px(c, cx - 6, base - 8, 5, 2, '#a3804f'); px(c, cx + 2, base - 10, 5, 2, '#a3804f');
  px(c, cx - 8, base - 3, 5, 2, '#8a6a42'); px(c, cx + 4, base - 4, 5, 2, '#8a6a42');
  px(c, cx - 3, base - 1, 7, 1, '#6e5230');
  return cv;
}

/** The four toolbar icons, 16 by 16 drawn in the house style. */
export function drawToolIcon(kind: 'hoe' | 'can' | 'seeds' | 'hand'): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 16;
  const c = cv.getContext('2d')!;
  if (kind === 'hoe') {
    // A wooden handle on the diagonal and a steel head at the top.
    for (let i = 0; i < 9; i++) px(c, 4 + i, 11 - i, 2, 2, '#9a6b48');
    px(c, 10, 1, 5, 3, OUT); px(c, 11, 2, 4, 2, '#b9c4c9');
    px(c, 13, 4, 2, 3, '#9aa7ad');
  } else if (kind === 'can') {
    // A blue watering can: body, spout to the left, handle on top.
    px(c, 5, 6, 9, 8, OUT); px(c, 6, 7, 7, 6, '#4fa8d0');
    px(c, 6, 7, 7, 2, '#6ec3e6');
    px(c, 1, 9, 5, 2, OUT); px(c, 1, 9, 4, 2, '#4fa8d0'); px(c, 0, 8, 2, 3, '#35708f');
    px(c, 8, 3, 2, 3, OUT); px(c, 6, 3, 6, 2, OUT); px(c, 6, 3, 6, 1, '#4fa8d0');
    px(c, 8, 11, 2, 2, '#bfe9f7');
  } else if (kind === 'seeds') {
    // A little brown sack tied at the neck, with a sprout on its front.
    px(c, 4, 5, 8, 10, OUT); px(c, 5, 6, 6, 8, '#b5784e');
    px(c, 6, 2, 4, 3, OUT); px(c, 6, 2, 4, 2, '#e2bd86');
    px(c, 7, 9, 2, 4, STEM); px(c, 5, 8, 3, 2, LEAF_LIGHT); px(c, 8, 7, 3, 2, LEAF);
  } else {
    // An open hand, palm up, in warm tones.
    px(c, 4, 6, 8, 8, OUT);
    px(c, 5, 7, 6, 6, '#f2c094');
    for (const [fx, fh] of [[5, 4], [7, 5], [9, 5], [11, 3]] as const) { px(c, fx, 6 - fh + 3, 1, fh, OUT); px(c, fx, 6 - fh + 3, 1, fh - 1, '#f2c094'); }
    px(c, 3, 9, 2, 3, OUT); px(c, 3, 9, 2, 2, '#f2c094');
    px(c, 6, 10, 4, 1, '#d99e73');
  }
  return cv;
}

/** The farmhouse room: where everything sits, so the drawing and the walking agree. */
export const INTERIOR = {
  cols: 10, rows: 8,
  bed: { x: 1, y: 1, w: 2, h: 2 },
  table: { x: 4, y: 2, w: 2, h: 1 },
  fireplace: { x: 7, y: 0, w: 2, h: 2 },
  plant: { x: 8, y: 6, w: 1, h: 1 },
  mat: { x: 4, y: 7, w: 2, h: 1 },
  enter: { x: 4, y: 6 },
};

/** Hazel's farmhouse inside: wooden floor, her quilt on the bed, a fireplace, one cosy room. */
export function drawInterior(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = INTERIOR.cols * T; cv.height = INTERIOR.rows * T;
  const c = cv.getContext('2d')!;
  const r = rng(5);
  // Wooden floor: warm planks running across, with grain and knots.
  for (let y = 0; y < INTERIOR.rows * T; y += 16) {
    px(c, 0, y, INTERIOR.cols * T, 16, (y / 16) % 2 ? '#b98a5e' : '#c2956a');
    px(c, 0, y + 14, INTERIOR.cols * T, 2, '#9a6b48');
    for (let k = 0; k < 7; k++) px(c, Math.floor(r() * 300), y + 3 + Math.floor(r() * 9), 8 + Math.floor(r() * 14), 1, '#a87c50');
  }
  for (let x = 0; x < INTERIOR.cols * T; x += 80) px(c, x, 0, 2, INTERIOR.rows * T, '#9a6b48');
  // The top wall: cream plaster, a beam, and a skirting line where it meets the floor.
  px(c, 0, 0, INTERIOR.cols * T, T + 6, '#f6e6c6');
  px(c, 0, 0, INTERIOR.cols * T, 8, '#9a6b48');
  px(c, 0, T + 2, INTERIOR.cols * T, 4, OUT);
  // A window with morning light in it and a flower box, left of the fireplace.
  const wx = 4 * T + 16;
  px(c, wx, 6, 34, 30, OUT); px(c, wx + 2, 8, 30, 26, '#9fd8f0');
  px(c, wx + 16, 8, 2, 26, OUT); px(c, wx + 2, 20, 30, 2, OUT);
  px(c, wx + 4, 10, 8, 5, '#e9f8ff');
  px(c, wx - 2, 36, 38, 5, '#9a6b48');
  for (let f = 0; f < 5; f++) px(c, wx + 1 + f * 7, 33, 4, 4, ['#f7a8c4', '#ffd166', '#f26b5b'][f % 3]);
  // The fireplace: brick breast at the top right, a dark mouth and a warm fire.
  const fx = INTERIOR.fireplace.x * T, fy = INTERIOR.fireplace.y * T;
  px(c, fx - 2, fy, 68, 66, OUT);
  px(c, fx, fy + 2, 64, 62, '#b36a5a');
  for (let by = fy + 6; by < fy + 60; by += 8) for (let bx = fx + 4; bx < fx + 60; bx += 14) px(c, bx, by, 10, 2, '#9a5546');
  px(c, fx + 14, fy + 26, 36, 38, OUT);
  px(c, fx + 17, fy + 29, 30, 35, '#2e1a14');
  px(c, fx + 24, fy + 50, 16, 6, '#6e452c');
  for (const [ox, oy, col] of [[26, 44, '#f26b3c'], [33, 40, '#f78c3c'], [29, 48, '#ffd166'], [37, 47, '#f26b3c']] as const)
    px(c, fx + ox, fy + oy, 6, 10, col);
  px(c, fx - 4, fy + 62, 72, 5, '#9a6b48');
  // The bed: headboard against the left wall, a pillow, and Hazel's patchwork quilt.
  const bx = INTERIOR.bed.x * T, by = INTERIOR.bed.y * T;
  px(c, bx - 4, by - 4, 6, 70, OUT); px(c, bx - 3, by - 3, 4, 68, '#9a6b48');
  px(c, bx, by, 64, 64, OUT);
  px(c, bx + 2, by + 2, 60, 60, '#fff6e6');
  px(c, bx + 6, by + 5, 52, 14, '#ffffff'); px(c, bx + 6, by + 5, 52, 3, '#e9f8ff');
  const quilt = ['#f7a8c4', '#ffd166', '#9fd8f0', '#f26b5b', '#c9b6f2', '#9be07a'];
  let qi = 0;
  for (let qy = 0; qy < 3; qy++) for (let qx = 0; qx < 4; qx++) {
    px(c, bx + 4 + qx * 14, by + 24 + qy * 12, 13, 11, quilt[qi++ % quilt.length]);
  }
  px(c, bx + 2, by + 58, 60, 4, '#e0857a');
  // The rug in the middle of the room, woven rings of colour.
  const rx = 3 * T, ry = 3 * T;
  px(c, rx, ry, 128, 94, '#b85d55');
  px(c, rx + 6, ry + 6, 116, 82, '#e2bd86');
  px(c, rx + 12, ry + 12, 104, 70, '#7fae7a');
  px(c, rx + 18, ry + 18, 92, 58, '#fff6e6');
  for (let d = 0; d < 5; d++) { px(c, rx + 30 + d * 14, ry + 40, 7, 7, '#f26b5b'); }
  // The table: a wooden top, a cloth runner and a tiny vase of flowers.
  const tx = INTERIOR.table.x * T, ty = INTERIOR.table.y * T;
  px(c, tx + 2, ty + 4, 60, 26, OUT);
  px(c, tx + 4, ty + 6, 56, 22, '#b5784e');
  px(c, tx + 26, ty + 6, 12, 22, '#fff6e6');
  px(c, tx + 29, ty + 10, 6, 8, '#7fae7a');
  px(c, tx + 28, ty + 6, 3, 4, '#f26b5b'); px(c, tx + 32, ty + 5, 3, 4, '#ffd166'); px(c, tx + 30, ty + 3, 3, 3, '#f7a8c4');
  px(c, tx + 6, ty + 30, 6, 4, OUT); px(c, tx + 52, ty + 30, 6, 4, OUT);
  // A plant in the bottom right corner, minding its own business.
  const plx = INTERIOR.plant.x * T, ply = INTERIOR.plant.y * T;
  px(c, plx + 8, ply + 18, 16, 12, OUT); px(c, plx + 10, ply + 20, 12, 8, '#c96a4a');
  for (let i = 0; i < 6; i++) px(c, plx + 6 + i * 4, ply + 8 + (i % 2) * 4, 4, 10, i % 2 ? LEAF : LEAF_LIGHT);
  // The door mat at the bottom, where you come in and out.
  const mx = INTERIOR.mat.x * T, my = INTERIOR.mat.y * T;
  px(c, mx + 2, my + 4, 60, 26, '#8a5a3c');
  px(c, mx + 6, my + 8, 52, 18, '#a87c50');
  px(c, mx + 10, my + 12, 44, 10, '#c2956a');
  return cv;
}

/** The wooden shipping box that stands by the farmhouse. */
export function drawShippingBox(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = T; cv.height = T;
  const c = cv.getContext('2d')!;
  px(c, 3, 10, 26, 19, OUT);
  px(c, 5, 12, 22, 15, '#b5784e');
  px(c, 5, 12, 22, 3, '#cf9466');
  px(c, 5, 19, 22, 2, '#9a6b48'); px(c, 5, 24, 22, 2, '#9a6b48');
  px(c, 2, 6, 28, 6, OUT);
  px(c, 4, 7, 24, 4, '#e0a874');
  px(c, 13, 16, 6, 5, '#ffd166'); px(c, 15, 17, 2, 3, OUT);
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
