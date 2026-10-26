// The farming rules, shared by the game and its tests. Pure functions only:
// they take a save object and return what changed, so the same code that runs
// in the browser can be tested here. Game code decides; nothing in here talks.

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const DAYS_PER_SEASON = 14;
export const DAY_START = 6 * 60; // 6:00am, in minutes from midnight
export const DAY_END = 26 * 60; // 2:00am the next night, when the farmer passes out
export const MAX_ENERGY = 100;
export const TIRED_BELOW = 15;
export const CAN_CAPACITY = 20;
export const START_COINS = 500;
export const PASS_OUT_CAP = 50;

export const ENERGY_COSTS = { hoe: 2, water: 1, plant: 0, harvest: 0 };

/** The four Spring crops. `days` is watered nights needed to ripen; `regrow` is
 *  nights to ripen again after a harvest (0 means the plant is done). */
export const CROPS = {
  turnip: { name: 'Turnip', plural: 'turnips', seed: 'seed_turnip', seedCost: 20, days: 4, sell: 35, regrow: 0, seasons: [0] },
  strawberry: { name: 'Strawberry', plural: 'strawberries', seed: 'seed_strawberry', seedCost: 40, days: 8, sell: 30, regrow: 3, seasons: [0] },
  potato: { name: 'Potato', plural: 'potatoes', seed: 'seed_potato', seedCost: 30, days: 6, sell: 60, regrow: 0, seasons: [0] },
  tulip: { name: 'Pink tulip', plural: 'pink tulips', seed: 'seed_tulip', seedCost: 25, days: 7, sell: 70, regrow: 0, seasons: [0] },
};

/** Everything a player can hold: produce (with a sell price) and seeds (with a buy price). */
export const ITEMS = {
  turnip: { name: 'Turnip', plural: 'turnips', sell: CROPS.turnip.sell },
  strawberry: { name: 'Strawberry', plural: 'strawberries', sell: CROPS.strawberry.sell },
  potato: { name: 'Potato', plural: 'potatoes', sell: CROPS.potato.sell },
  tulip: { name: 'Pink tulip', plural: 'pink tulips', sell: CROPS.tulip.sell },
  daisy: { name: 'Daisy', plural: 'daisies', sell: 20 },
  sunflower: { name: 'Sunflower', plural: 'sunflowers', sell: 45 },
  seed_turnip: { name: 'Turnip seeds', plural: 'turnip seeds', buy: CROPS.turnip.seedCost, crop: 'turnip' },
  seed_strawberry: { name: 'Strawberry seeds', plural: 'strawberry seeds', buy: CROPS.strawberry.seedCost, crop: 'strawberry' },
  seed_potato: { name: 'Potato seeds', plural: 'potato seeds', buy: CROPS.potato.seedCost, crop: 'potato' },
  seed_tulip: { name: 'Pink tulip seeds', plural: 'pink tulip seeds', buy: CROPS.tulip.seedCost, crop: 'tulip' },
};

/** A brand new farm: Spring 1 of year 1, 500 coins, 10 turnip seeds, a full can,
 *  and a few tiles Grandma had already tilled in the field (x 11 to 13, y 3 to 4). */
export function newSave() {
  const tiles = {};
  for (const [x, y] of [[11, 3], [12, 3], [13, 3], [11, 4], [12, 4]]) tiles[`${x},${y}`] = { tilled: true };
  return {
    version: 1,
    day: 1,
    season: 0,
    year: 1,
    minutes: DAY_START,
    coins: START_COINS,
    energy: MAX_ENERGY,
    can: CAN_CAPACITY,
    inventory: { seed_turnip: 10 },
    shipping: {},
    tiles,
    player: { x: 5, y: 7, scene: 'farm' },
  };
}

/** Which drawn stage a crop is at: 0 to 3 growing, 4 ripe. */
export function cropStage(tile) {
  if (!tile?.crop) return -1;
  const crop = CROPS[tile.crop];
  if (!crop) return -1;
  const age = tile.age ?? 0;
  if (age >= crop.days) return 4;
  return Math.min(3, Math.floor((age / crop.days) * 4));
}

export function isRipe(tile) {
  return cropStage(tile) === 4;
}

/** Harvest one tile. Returns the item gained, or null when there is nothing to pick.
 *  Regrowing crops stay planted and drop back so they ripen again in `regrow` nights;
 *  the rest leave plain tilled soil behind. */
export function harvestTile(save, key) {
  const tile = save.tiles[key];
  if (!tile?.crop || tile.dead || !isRipe(tile)) return null;
  const cropKey = tile.crop;
  const crop = CROPS[cropKey];
  save.inventory[cropKey] = (save.inventory[cropKey] ?? 0) + 1;
  if (crop.regrow > 0) tile.age = crop.days - crop.regrow;
  else { delete tile.crop; delete tile.age; }
  tile.watered = false;
  return cropKey;
}

/** The 2am penalty: 10 percent of coins, never more than 50. */
export function passOutPenalty(coins) {
  return Math.min(PASS_OUT_CAP, Math.floor(coins * 0.1));
}

/**
 * One night passing over the farm. Grows watered crops, withers anything out of
 * season when the season turns, pays the shipping box, clears the watered marks
 * and moves the calendar on. Mutates the save and returns a summary:
 * { lines: string[], payout: number, seasonChanged: boolean }
 * The caller sets the clock and energy for the morning.
 */
export function advanceNight(save) {
  const lines = [];

  // The shipping box pays out first, at the sell prices.
  let payout = 0;
  for (const [item, count] of Object.entries(save.shipping)) {
    const def = ITEMS[item];
    if (!def?.sell || !count) continue;
    const coins = def.sell * count;
    payout += coins;
    lines.push(`You shipped ${count} ${count === 1 ? def.name.toLowerCase() : def.plural}: ${coins} coins.`);
  }
  save.shipping = {};
  save.coins += payout;

  // The calendar moves on.
  save.day += 1;
  let seasonChanged = false;
  if (save.day > DAYS_PER_SEASON) {
    save.day = 1;
    save.season = (save.season + 1) % SEASONS.length;
    if (save.season === 0) save.year += 1;
    seasonChanged = true;
  }

  // Crops: watered ones grow a night, dry ones pause. On a season change,
  // anything not suited to the new season withers where it stands.
  for (const tile of Object.values(save.tiles)) {
    if (tile.crop && !tile.dead) {
      if (seasonChanged && !CROPS[tile.crop].seasons.includes(save.season)) {
        tile.dead = true;
      } else if (tile.watered) {
        tile.age = (tile.age ?? 0) + 1;
      }
    }
    tile.watered = false;
  }

  return { lines, payout, seasonChanged };
}

/** The first steps guide, in the order a new farmer meets them. The client
 * keeps the friendly words for each step; the server only checks the ids. */
export const GUIDE_STEP_IDS = ['buy', 'hoe', 'plant', 'water', 'sleep', 'harvest', 'ship'];

/** The farmers a player can move in as: two girls and two boys to start.
 *  The name is the one the setup offers before it is changed to anything. */
export const FARMER_LOOKS = [
  { key: 'rosie', name: 'Rosie', gender: 'girl' },
  { key: 'rowan', name: 'Rowan', gender: 'boy' },
  { key: 'ivy', name: 'Ivy', gender: 'girl' },
  { key: 'reed', name: 'Reed', gender: 'boy' },
];

/** A kind check for farmer names, run when a player moves in and again on
 *  the server as a backstop. It is a speed bump, not a tribunal: whole
 *  words are matched so a name like Essex or Grass sails through, and the
 *  strongest few words are caught even when they are hidden inside one. */
const UNKIND_WORDS = ['fuck', 'shit', 'bitch', 'bastard', 'whore', 'slut', 'cunt', 'dick', 'cock', 'pussy', 'porn', 'nigger', 'nigga', 'faggot', 'retard', 'nazi', 'hitler'];
const UNKIND_ANYWHERE = ['fuck', 'cunt', 'nigger', 'nigga', 'faggot'];

export function nameIsKind(name) {
  const leet = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
  const cleaned = String(name).toLowerCase().split('').map((c) => leet[c] || c).join('');
  const words = cleaned.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => UNKIND_WORDS.includes(w))) return false;
  const joined = words.join('');
  return !UNKIND_ANYWHERE.some((w) => joined.includes(w));
}

/** Marigold's flower stall. Every price sits above what the shipping box
 *  pays for the same flower, so a bought flower is for giving or keeping,
 *  never for printing coins. Growing your own stays the profitable way. */
export const FLOWER_STALL = [
  { item: 'tulip', price: 90 },
  { item: 'daisy', price: 30 },
  { item: 'sunflower', price: 60 },
];
