// Hollow Square: the town map, its buildings, the shops and their hours, and
// what the shops sell. Pure data and pure functions, shared by the game and its
// tests. Code decides prices, hours and what a meal does; nobody talks in here.

import { ITEMS, CROPS, MAX_ENERGY } from './rules.js';

export const TOWN_COLS = 40;
export const TOWN_ROWS = 30;

/** Rows of the roads that run in front of the two rows of buildings. */
export const NORTH_ROAD = 8;
export const SOUTH_ROAD = 23;
/** The road in from the farm (west edge) and out to the ranch road (east edge). */
export const ENTRY_ROW = 13;
export const RIVER_ROWS = [25, 26];
export const BRIDGE_COLS = [19, 20];
export const SQUARE = { x: 14, y: 10, w: 12, h: 8 };
export const FOUNTAIN = { x: 19, y: 13, w: 2, h: 2 };
export const NOTICEBOARD = { x: 24, y: 11 };
export const WEST_GATE = { x: 0, y: ENTRY_ROW };
export const EAST_GATE = { x: TOWN_COLS - 1, y: ENTRY_ROW };

/** Rest day: every seventh day of a season some places close. */
export function isRestDay(day) {
  return day % 7 === 0;
}

const hm = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Building fronts. North row faces the north road, south row the south road.
 *  `hours` are [open, close] as "H:MM"; `rest` closes it on rest days.
 *  `keepers` are who works there, for the door panel. */
export const BUILDINGS = [
  { id: 'store', name: 'General Store', keepers: ['pip', 'poppy'], x: 2, row: 'north', w: 5, hours: ['9:00', '17:00'], rest: true, roof: '#e0857a', wall: '#f6e6c6' },
  { id: 'cafe', name: 'Café', keepers: ['tibbs'], x: 8, row: 'north', w: 5, hours: ['7:00', '21:00'], roof: '#7fae7a', wall: '#fff6e6' },
  { id: 'bakery', name: 'Bakery', keepers: ['benji'], x: 14, row: 'north', w: 4, hours: ['6:00', '14:00'], roof: '#e2bd86', wall: '#f6e6c6' },
  { id: 'library', name: 'Library', keepers: ['mira'], x: 19, row: 'north', w: 5, hours: ['9:00', '21:00'], roof: '#8f7fc7', wall: '#efe4d0' },
  { id: 'mayor', name: "Mayor's House", keepers: ['mayor'], x: 25, row: 'north', w: 6, hours: ['9:00', '17:00'], rest: true, roof: '#b85d55', wall: '#f6e6c6' },
  { id: 'clinic', name: 'Clinic', keepers: ['ines'], x: 32, row: 'north', w: 5, hours: ['8:00', '18:00'], rest: true, roof: '#9fd8f0', wall: '#ffffff' },
  { id: 'smithy', name: 'Smithy', keepers: ['kai', 'fennick'], x: 2, row: 'south', w: 5, hours: ['8:00', '18:00'], roof: '#6e6a72', wall: '#c4b29a' },
  { id: 'weaving', name: 'Weaving Shop', keepers: ['priya'], x: 8, row: 'south', w: 5, hours: ['9:00', '17:00'], roof: '#f26b9d', wall: '#fff6e6' },
  { id: 'cottage_rose', name: 'Rose Cottage', keepers: [], x: 14, row: 'south', w: 4, home: true, roof: '#f7a8c4', wall: '#f6e6c6' },
  { id: 'cottage_gull', name: 'Harbour Cottage', keepers: [], x: 22, row: 'south', w: 4, home: true, roof: '#4fa8d0', wall: '#efe4d0' },
  { id: 'teahouse', name: 'Tea House', keepers: ['hana'], x: 27, row: 'south', w: 5, hours: ['9:00', '19:00'], roof: '#5f8f6a', wall: '#f6e6c6' },
  { id: 'pottery', name: 'Pottery', keepers: ['amara'], x: 33, row: 'south', w: 5, hours: ['8:00', '17:00'], roof: '#c96a4a', wall: '#efe4d0' },
].map((b) => {
  const y = b.row === 'north' ? NORTH_ROAD - 5 : SOUTH_ROAD - 5;
  const door = { x: b.x + Math.floor(b.w / 2), y: y + 4 };
  const road = b.row === 'north' ? NORTH_ROAD : SOUTH_ROAD;
  return { ...b, scene: 'town', y, h: 5, door, front: { x: door.x, y: road } };
});

/** June's ranch, east along the ranch road: its own small map. */
export const RANCH_COLS = 30;
export const RANCH_ROWS = 22;
export const RANCH_ROAD = 11;
export const RANCH_GATE = { x: 0, y: RANCH_ROAD };
export const PADDOCK = { x: 15, y: 14, w: 12, h: 6, gate: 19 };
export const HIVES = [{ x: 3, y: 15 }, { x: 5, y: 15 }, { x: 7, y: 15 }, { x: 4, y: 18 }, { x: 6, y: 18 }];
export const RANCH_BUILDINGS = [
  { id: 'ranch_house', name: "June's Ranch", keepers: ['june'], x: 3, w: 5, hours: ['7:00', '19:00'], roof: '#b85d55', wall: '#f6e6c6' },
  { id: 'barn', name: 'Barn', keepers: ['jed'], x: 15, w: 7, hours: ['6:00', '20:00'], roof: '#a8473e', wall: '#c96a4a' },
  { id: 'honey_shed', name: "Hugo's Honey", keepers: ['hugo'], x: 24, w: 4, hours: ['8:00', '16:00'], roof: '#e2bd86', wall: '#f7e3a8' },
].map((b) => {
  const y = RANCH_ROAD - 8;
  const door = { x: b.x + Math.floor(b.w / 2), y: y + 4 };
  return { ...b, row: 'north', scene: 'ranch', y, h: 5, door, front: { x: door.x, y: y + 5 } };
});

/** The ranch's ground and what blocks: the road, paths up to the doors, the paddock fence, the hives, trees. */
export function ranchLayout() {
  const ground = [], blocked = [];
  for (let y = 0; y < RANCH_ROWS; y++) { ground.push(Array(RANCH_COLS).fill('grass')); blocked.push(Array(RANCH_COLS).fill(false)); }
  for (let x = 0; x < RANCH_COLS - 2; x++) ground[RANCH_ROAD][x] = 'path';
  for (const b of RANCH_BUILDINGS) {
    for (let y = b.front.y; y < RANCH_ROAD; y++) ground[y][b.front.x] = 'path';
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) blocked[y][x] = true;
  }
  for (let y = RANCH_ROAD + 1; y < PADDOCK.y; y++) ground[y][PADDOCK.gate] = 'path';
  // The paddock: a fence all round with a gap at the gate, mud and hay inside.
  const fences = [];
  for (let x = PADDOCK.x - 1; x <= PADDOCK.x + PADDOCK.w; x++) {
    if (x !== PADDOCK.gate) fences.push({ x, y: PADDOCK.y - 1 });
    fences.push({ x, y: PADDOCK.y + PADDOCK.h });
  }
  for (let y = PADDOCK.y; y < PADDOCK.y + PADDOCK.h; y++) { fences.push({ x: PADDOCK.x - 1, y }); fences.push({ x: PADDOCK.x + PADDOCK.w, y }); }
  for (const f of fences) blocked[f.y][f.x] = true;
  for (let y = PADDOCK.y; y < PADDOCK.y + PADDOCK.h; y++) for (let x = PADDOCK.x; x < PADDOCK.x + PADDOCK.w; x++) ground[y][x] = 'mud';
  // Hugo's flower patch and hives.
  for (let y = 14; y <= 19; y++) for (let x = 2; x <= 9; x++) ground[y][x] = 'flowers';
  for (const h of HIVES) blocked[h.y][h.x] = true;
  const trees = [];
  for (let x = 0; x < RANCH_COLS; x += 2) { trees.push({ x, y: 0 }); trees.push({ x, y: RANCH_ROWS - 1 }); }
  for (let y = 2; y < RANCH_ROWS - 1; y += 2) {
    if (Math.abs(y - RANCH_ROAD) > 1) trees.push({ x: 0, y });
    trees.push({ x: RANCH_COLS - 1, y });
  }
  for (const [x, y] of [[11, 4], [12, 16], [28, 13], [10, 20], [23, 2]]) trees.push({ x, y });
  const kept = trees.filter((t) => !blocked[t.y][t.x] && ground[t.y][t.x] === 'grass');
  for (const t of kept) blocked[t.y][t.x] = true;
  return { ground, blocked, trees: kept, fences };
}

export const BUILDING = Object.fromEntries([...BUILDINGS, ...RANCH_BUILDINGS].map((b) => [b.id, b]));

/** Is this place open at this time on this day? Homes never are. */
export function isOpen(id, minutes, day) {
  const b = BUILDING[id];
  if (!b || !b.hours) return false;
  if (b.rest && isRestDay(day)) return false;
  const m = minutes % (24 * 60);
  return m >= hm(b.hours[0]) && m < hm(b.hours[1]);
}

const clock = (s) => {
  const t = hm(s), h = Math.floor(t / 60), mm = t % 60;
  return `${((h + 11) % 12) + 1}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
};

/** "Open 9am to 5pm, closed on rest days" and the like. */
export function hoursText(id) {
  const b = BUILDING[id];
  if (!b?.hours) return '';
  return `Open ${clock(b.hours[0])} to ${clock(b.hours[1])}${b.rest ? ', closed on rest days (day 7 and day 14)' : ''}.`;
}

/** The ground of every tile: grass, path, cobble or water. Plus which tiles block. */
export function townLayout() {
  const ground = [], blocked = [];
  for (let y = 0; y < TOWN_ROWS; y++) {
    ground.push(Array(TOWN_COLS).fill('grass'));
    blocked.push(Array(TOWN_COLS).fill(false));
  }
  const path = (x, y) => { if (ground[y]?.[x] !== undefined) ground[y][x] = 'path'; };
  for (let x = 1; x < TOWN_COLS - 1; x++) { path(x, NORTH_ROAD); path(x, SOUTH_ROAD); }
  for (let y = NORTH_ROAD; y <= SOUTH_ROAD; y++) { path(1, y); path(TOWN_COLS - 2, y); for (const x of BRIDGE_COLS) path(x, y); }
  for (let x = 0; x < TOWN_COLS; x++) path(x, ENTRY_ROW);
  for (let y = SQUARE.y; y < SQUARE.y + SQUARE.h; y++)
    for (let x = SQUARE.x; x < SQUARE.x + SQUARE.w; x++) ground[y][x] = 'cobble';
  for (const y of RIVER_ROWS) for (let x = 0; x < TOWN_COLS; x++) { ground[y][x] = 'water'; blocked[y][x] = true; }
  for (const x of BRIDGE_COLS) {
    for (const y of RIVER_ROWS) { ground[y][x] = 'bridge'; blocked[y][x] = false; }
    path(x, SOUTH_ROAD + 1); path(x, RIVER_ROWS[1] + 1);
  }
  // The dock on the far bank, where the fishing is.
  for (let x = 21; x <= 24; x++) ground[RIVER_ROWS[1] + 1][x] = 'dock';
  for (const b of BUILDINGS)
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) blocked[y][x] = true;
  for (let y = FOUNTAIN.y; y < FOUNTAIN.y + FOUNTAIN.h; y++)
    for (let x = FOUNTAIN.x; x < FOUNTAIN.x + FOUNTAIN.w; x++) blocked[y][x] = true;
  blocked[NOTICEBOARD.y][NOTICEBOARD.x] = true;
  // Trees all round the edge, except where the roads leave town.
  const trees = [];
  for (let x = 0; x < TOWN_COLS; x += 2) { trees.push({ x, y: 0 }); trees.push({ x, y: TOWN_ROWS - 1 }); }
  for (let y = 2; y < TOWN_ROWS - 1; y += 2) {
    if (y < RIVER_ROWS[0] - 1 || y > RIVER_ROWS[1]) {
      if (Math.abs(y - ENTRY_ROW) > 1 && ground[y][0] === 'grass') trees.push({ x: 0, y });
      if (Math.abs(y - ENTRY_ROW) > 1 && ground[y][TOWN_COLS - 1] === 'grass') trees.push({ x: TOWN_COLS - 1, y });
    }
  }
  for (const [x, y] of [[13, 1], [27, 1], [6, 28], [33, 28], [12, 20], [26, 20], [31, 13], [8, 13 - 2], [36, 11]]) {
    if (ground[y][x] === 'grass' && !blocked[y][x]) trees.push({ x, y });
  }
  for (const t of trees) blocked[t.y][t.x] = true;
  // Flower beds in the corners of the square: pretty, and walked round.
  const beds = [{ x: SQUARE.x, y: SQUARE.y }, { x: SQUARE.x + SQUARE.w - 1, y: SQUARE.y + SQUARE.h - 1 }, { x: SQUARE.x, y: SQUARE.y + SQUARE.h - 1 }];
  for (const b of beds) blocked[b.y][b.x] = true;
  const lamps = [{ x: SQUARE.x + 2, y: SQUARE.y - 1 }, { x: SQUARE.x + SQUARE.w - 3, y: SQUARE.y - 1 }, { x: 10, y: SOUTH_ROAD + 1 }, { x: 30, y: SOUTH_ROAD + 1 }];
  for (const l of lamps) blocked[l.y][l.x] = true;
  const benches = [{ x: 16, y: SQUARE.y }, { x: 22, y: SQUARE.y + SQUARE.h - 1 }];
  for (const b of benches) blocked[b.y][b.x] = true;
  const bonsai = { x: 28, y: SOUTH_ROAD + 1, w: 4 };
  for (let x = bonsai.x; x < bonsai.x + bonsai.w; x += 2) blocked[bonsai.y][x] = true;
  return { ground, blocked, trees, beds, lamps, benches, bonsai };
}

/** Named places people stand in town and on the farm. Town spots are on open ground. */
export const SPOTS = {
  ...Object.fromEntries(BUILDINGS.flatMap((b) => [
    [b.id, { scene: 'town', x: b.front.x + 1, y: b.front.y }],
    [`${b.id}_left`, { scene: 'town', x: b.front.x - 1, y: b.front.y }],
  ])),
  fountain_n: { scene: 'town', x: 19, y: 12 },
  fountain_s: { scene: 'town', x: 20, y: 15 },
  fountain_e: { scene: 'town', x: 21, y: 14 },
  fountain_w: { scene: 'town', x: 18, y: 13 },
  noticeboard: { scene: 'town', x: 24, y: 12 },
  bench_n: { scene: 'town', x: 17, y: 10 },
  bench_s: { scene: 'town', x: 23, y: 17 },
  flowerbeds: { scene: 'town', x: 15, y: 16 },
  square_e: { scene: 'town', x: 24, y: 15 },
  bridge: { scene: 'town', x: 19, y: 25 },
  dock: { scene: 'town', x: 23, y: 27 },
  dock_w: { scene: 'town', x: 21, y: 27 },
  riverbank_w: { scene: 'town', x: 12, y: 24 },
  riverbank_e: { scene: 'town', x: 34, y: 24 },
  bonsai: { scene: 'town', x: 29, y: 24 },
  ranch_paddock: { scene: 'ranch', x: 20, y: 12 },
  ranch_porch: { scene: 'ranch', x: 6, y: 9 },
  ranch_barn: { scene: 'ranch', x: 19, y: 9 },
  ranch_road: { scene: 'ranch', x: 13, y: 11 },
  ranch_hives: { scene: 'ranch', x: 6, y: 16 },
  honey_shed: { scene: 'ranch', x: 27, y: 9 },
  farm_stall: { scene: 'farm', x: 24, y: 5 },
  farm_a: { scene: 'farm', x: 14, y: 13 },
  farm_b: { scene: 'farm', x: 22, y: 14 },
  farm_c: { scene: 'farm', x: 9, y: 9 },
  farm_d: { scene: 'farm', x: 24, y: 18 },
  farm_e: { scene: 'farm', x: 16, y: 16 },
  farm_f: { scene: 'farm', x: 26, y: 8 },
};

/** The General Store's shelves, beyond the seeds. */
export const STORE_GOODS = [
  { id: 'fertiliser', name: 'Basic fertiliser', price: 50, about: 'Spread it on tilled soil. The crop there grows one extra stage on its first watered night.' },
  { id: 'big_can', name: 'Bigger watering can', price: 1500, about: 'Holds 40 waters instead of 20. One per farmer.' },
];

/** Food that restores energy. `daily` means once a day. */
export const FOOD = {
  tea: { name: 'Tea', price: 30, energy: 20, place: 'cafe', daily: true },
  pie: { name: 'Pie', price: 80, energy: 50, place: 'cafe', daily: true },
  bread: { name: 'Bread', price: 40, energy: 25, place: 'bakery', daily: false },
  honey: { name: 'Honey on toast', price: 25, energy: 15, place: 'honey_shed', daily: true },
};

export function dayStamp(save) {
  return `${save.year}-${save.season}-${save.day}`;
}

/** Has the farmer already had this today? */
export function hadToday(save, food) {
  return save.meals?.stamp === dayStamp(save) && save.meals.had.includes(food);
}

/** Buy and eat a meal. Code decides: price, energy, opening hours and the once a day rule. */
export function eat(save, food) {
  const f = FOOD[food];
  if (!f) return { ok: false, msg: 'That is not on the menu.' };
  if (!isOpen(f.place, save.minutes, save.day)) return { ok: false, msg: `The ${BUILDING[f.place].name} is closed. ${hoursText(f.place)}` };
  if (f.daily && hadToday(save, food)) return { ok: false, msg: `You have had your ${f.name.toLowerCase()} today. Come back tomorrow.` };
  if (save.coins < f.price) return { ok: false, msg: `${f.name} is ${f.price} coins. You have ${save.coins}.` };
  if (save.energy >= MAX_ENERGY) return { ok: false, msg: 'You are full of beans already. Save it for later.' };
  save.coins -= f.price;
  const before = save.energy;
  save.energy = Math.min(MAX_ENERGY, save.energy + f.energy);
  if (save.meals?.stamp !== dayStamp(save)) save.meals = { stamp: dayStamp(save), had: [] };
  if (!save.meals.had.includes(food)) save.meals.had.push(food);
  return { ok: true, msg: `${f.name} for ${f.price} coins. Energy up ${save.energy - before}. You have ${save.coins} coins.` };
}

/** Buy one thing at the General Store: a seed, fertiliser, or the bigger can. */
export function buyAtStore(save, id) {
  if (!isOpen('store', save.minutes, save.day)) return { ok: false, msg: `The General Store is closed. ${hoursText('store')}` };
  const crop = Object.values(CROPS).find((c) => c.seed === id);
  const good = STORE_GOODS.find((g) => g.id === id);
  const price = crop ? crop.seedCost : good?.price;
  if (!price) return { ok: false, msg: 'They do not sell that here.' };
  if (id === 'big_can' && save.bigCan) return { ok: false, msg: 'You already have the bigger can.' };
  if (save.coins < price) return { ok: false, msg: `That is ${price} coins. You have ${save.coins}.` };
  save.coins -= price;
  if (id === 'big_can') {
    save.bigCan = true;
    save.can = canCapacity(save);
    return { ok: true, msg: `The bigger watering can is yours. It holds 40 now, and it is full. You have ${save.coins} coins.` };
  }
  save.inventory[id] = (save.inventory[id] ?? 0) + 1;
  const name = crop ? `${crop.name.toLowerCase()} seed` : ITEMS[id].name.toLowerCase();
  return { ok: true, msg: `Bought ${crop ? 'a' : 'some'} ${name} for ${price} coins. You have ${save.coins} coins.` };
}

/** How much water the farmer's can holds. */
export function canCapacity(save) {
  return save.bigCan ? 40 : 20;
}
