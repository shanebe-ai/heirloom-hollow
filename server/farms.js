// Farm saves: one JSON file per farm in a saves folder outside public/.
// No accounts in Milestone 1: the farm id is a random UUID the player's
// browser makes up and keeps, and it doubles as the farm code they can
// type in on another device. Writes go to a temp file and are renamed
// over the old save, so a crash mid write cannot corrupt a farm.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CROPS, ITEMS, GUIDE_STEP_IDS, FARMER_LOOKS, nameIsKind, nameIsTaken, nameFold } from '../shared/rules.js';

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TILE_KEY_RE = /^(\d{1,2}),(\d{1,2})$/;
export const MAX_SAVE_BYTES = 64 * 1024;

export function validFarmId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const counts = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const [k, n] of Object.entries(v)) {
    if (!(k in ITEMS) || !num(n, 0, 100000) || !Number.isInteger(n)) return null;
    if (n > 0) out[k] = n;
  }
  return out;
};

/** Checks a save body from a player and returns a clean copy, or null when
 *  anything is off. The client is trusted to play fair, not to be careful:
 *  this keeps a broken or hostile body from reaching the disk. */
export function validateSave(body, opts = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.version !== 1) return null;
  if (!num(body.day, 1, 14) || !num(body.season, 0, 3) || !num(body.year, 1, 9999)) return null;
  if (!num(body.minutes, 0, 26 * 60) || !num(body.coins, 0, 100000000)) return null;
  if (!num(body.energy, 0, 100) || !num(body.can, 0, body.bigCan === true ? 40 : 20)) return null;
  const inventory = counts(body.inventory);
  const shipping = counts(body.shipping);
  if (!inventory || !shipping) return null;

  if (!body.tiles || typeof body.tiles !== 'object' || Array.isArray(body.tiles)) return null;
  const tileEntries = Object.entries(body.tiles);
  if (tileEntries.length > 700) return null;
  const tiles = {};
  for (const [key, t] of tileEntries) {
    const m = TILE_KEY_RE.exec(key);
    if (!m || Number(m[1]) > 29 || Number(m[2]) > 21) return null;
    if (!t || typeof t !== 'object' || typeof t.tilled !== 'boolean') return null;
    const tile = { tilled: t.tilled };
    if (t.crop !== undefined) {
      if (!(t.crop in CROPS) || !num(t.age ?? 0, 0, 99)) return null;
      tile.crop = t.crop;
      tile.age = t.age ?? 0;
    }
    if (t.watered !== undefined) {
      if (typeof t.watered !== 'boolean') return null;
      tile.watered = t.watered;
    }
    if (t.dead !== undefined) {
      if (typeof t.dead !== 'boolean') return null;
      tile.dead = t.dead;
    }
    if (t.fert === true) tile.fert = true;
    tiles[key] = tile;
  }

  const p = body.player;
  if (!p || !['farm', 'house', 'town', 'ranch'].includes(p.scene)) return null;
  // The town is a bigger map than the farm.
  if (!num(p.x, 0, p.scene === 'town' ? 39 : 29) || !num(p.y, 0, p.scene === 'town' ? 29 : 21)) return null;

  const save = {
    version: 1,
    day: Math.floor(body.day),
    season: Math.floor(body.season),
    year: Math.floor(body.year),
    minutes: Math.floor(body.minutes),
    coins: Math.floor(body.coins),
    energy: Math.floor(body.energy),
    can: Math.floor(body.can),
    inventory,
    shipping,
    tiles,
    player: { x: Math.floor(p.x), y: Math.floor(p.y), scene: p.scene },
  };
  if (body.bigCan === true) save.bigCan = true;
  // Today's meals, so the café's once a day rule survives a reload.
  const meals = body.meals;
  if (meals && typeof meals === 'object' && typeof meals.stamp === 'string' && /^\d{1,4}-\d-\d{1,2}$/.test(meals.stamp) && Array.isArray(meals.had)) {
    save.meals = { stamp: meals.stamp, had: [...new Set(meals.had.filter((f) => ['tea', 'pie', 'bread', 'honey'].includes(f)))] };
  }

  // The farmer's name and who they play as ride along when they are the
  // right shape. Names are short, plain, and safe to show anywhere.
  // A name the game keeps for its own people is refused, except by the
  // farmer who already had it before it was kept: she keeps her name.
  if (body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)) {
    const name = typeof body.profile.name === 'string' ? body.profile.name.trim().slice(0, 16) : '';
    const alreadyHers = typeof opts.existingName === 'string' && nameFold(opts.existingName) === nameFold(name);
    if (name && /^[\p{L}\p{N} '\-]+$/u.test(name) && nameIsKind(name) && (!nameIsTaken(name) || alreadyHers) && (body.profile.gender === 'girl' || body.profile.gender === 'boy')) {
      save.profile = { name, gender: body.profile.gender };
      if (FARMER_LOOKS.some((l) => l.key === body.profile.look)) save.profile.look = body.profile.look;
      if (['backpack', 'purse', 'none'].includes(body.profile.accessory)) save.profile.accessory = body.profile.accessory;
    }
  }

  // The first steps guide rides along when it is the right shape; unknown
  // step ids are dropped rather than trusted.
  if (body.guide && typeof body.guide === 'object' && !Array.isArray(body.guide)) {
    const done = Array.isArray(body.guide.done)
      ? [...new Set(body.guide.done.filter((d) => GUIDE_STEP_IDS.includes(d)))]
      : [];
    save.guide = { seen: body.guide.seen === true, off: body.guide.off === true, done };
  }

  // Chat memory rides along when it is the right shape, capped like the client keeps it.
  if (body.chatMemory && typeof body.chatMemory === 'object' && !Array.isArray(body.chatMemory)) {
    const mem = {};
    for (const [who, list] of Object.entries(body.chatMemory)) {
      if (!Array.isArray(list)) continue;
      const clean = list.slice(-8).filter((h) => h && typeof h.from === 'string' && typeof h.text === 'string')
        .map((h) => ({ from: h.from.slice(0, 40), text: h.text.slice(0, 240) }));
      if (clean.length) mem[who.slice(0, 40)] = clean;
    }
    if (Object.keys(mem).length) save.chatMemory = mem;
  }
  return save;
}

export class FarmStore {
  constructor(dir) {
    this.dir = dir;
    this.ready = mkdir(dir, { recursive: true });
  }

  path(id) {
    return join(this.dir, `${id}.json`);
  }

  async load(id) {
    try {
      return JSON.parse(await readFile(this.path(id), 'utf8'));
    } catch {
      return null;
    }
  }

  async store(id, save) {
    await this.ready;
    const tmp = `${this.path(id)}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(save));
    await rename(tmp, this.path(id));
  }
}
