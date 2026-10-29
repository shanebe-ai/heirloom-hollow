// The one game state, shared by the farm and house scenes and the panels.
// It loads from the server under the player's farm code, saves itself back
// every couple of minutes and whenever the player sleeps, and knows how a
// night passes. Game code decides everything here; the AI never touches it.
import { Save, Tile, newSave, advanceNight, passOutPenalty, DAY_START, MAX_ENERGY, SEASONS, ITEMS, GUIDE_STEP_IDS, FARMER_LOOKS } from '../shared/rules.js';

/** A day lasts 12 real minutes: 6am to 2am is 20 game hours. */
export const GAME_MIN_PER_MS = (20 * 60) / (12 * 60 * 1000);

/** The clock chip's words for the current save time, like "Spring 3  6:00am". */
export function clockLabel(): string {
  const s = G.save;
  const m = Math.floor(s.minutes) % (24 * 60);
  const hh = Math.floor(m / 60), mm = Math.floor(m / 10) * 10 % 60;
  const h12 = ((hh + 11) % 12) + 1, ap = hh < 12 ? 'am' : 'pm';
  return `${SEASONS[s.season]} ${s.day}  ${h12}:${String(mm).padStart(2, '0')}${ap}`;
}

export const G = {
  save: newSave() as Save,
  farmId: '',
  loaded: false,
  /** True when the server is holding this farm behind its password. */
  locked: false,
  /** Lines for the morning summary card, set by a sleep or a pass out, read by the scene that wakes. */
  pendingSummary: null as { title: string; lines: string[] } | null,
  selectedTool: 'hand' as 'hoe' | 'can' | 'seeds' | 'hand',
  selectedSeed: 'seed_turnip',
};

const ID_KEY = 'hh-farm-id';
const MEMORY_KEY = 'hh-memory';
const TOKEN_PREFIX = 'hh-token-';

/** This device's token for the current farm, earned by setting or typing its password. */
export function deviceToken(): string {
  try { return localStorage.getItem(TOKEN_PREFIX + farmId()) || ''; } catch { return ''; }
}

function storeToken(token: string) {
  try { localStorage.setItem(TOKEN_PREFIX + farmId(), token); } catch { /* private mode */ }
}

/** Which farmer walks the farm: the chosen look when there is one, and
 *  before looks existed it was Rowan for a boy and Rosie for a girl. */
export function farmerKey(): string {
  const p = G.save.profile;
  if (p?.look && FARMER_LOOKS.some((l) => l.key === p.look)) return p.look;
  return p?.gender === 'boy' ? 'rowan' : 'rosie';
}

/** The sheet for what the farmer carries, or '' for empty hands. */
export function farmerPack(): string {
  const a = G.save.profile?.accessory;
  return a === 'backpack' ? 'pack' : a === 'purse' ? 'purse' : '';
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Older browsers: the same shape, made by hand.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function farmId(): string {
  if (G.farmId) return G.farmId;
  let id = '';
  try { id = localStorage.getItem(ID_KEY) || ''; } catch { /* private mode */ }
  if (!id) {
    id = makeId();
    try { localStorage.setItem(ID_KEY, id); } catch { /* private mode */ }
  }
  G.farmId = id;
  return id;
}

/** Point this browser at a different farm code (typed in on another device, say). */
/** Log in with the farmer's name and password: the server finds the farm
 *  and gives this device a token for it. False when they do not match. */
export async function logIn(name: string, password: string): Promise<boolean> {
  try {
    const res = await fetch('api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.farmId || !data.token) return false;
    // From here this page must never save: it holds an empty farm, and
    // the farm id is about to point at the real one.
    savesBlocked = true;
    useFarmId(data.farmId);
    storeToken(data.token);
    return true;
  } catch { return false; }
}

/** Log out on this device: forget the farm and its token, so the next visit
 *  starts at the move in screen with its log in button. */
export function logOut() {
  try {
    localStorage.removeItem(TOKEN_PREFIX + farmId());
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(MEMORY_KEY);
  } catch { /* private mode */ }
}

export function useFarmId(id: string) {
  G.farmId = id;
  try { localStorage.setItem(ID_KEY, id); } catch { /* private mode */ }
}

/** Load the farm from the server, or start a new one. Keeps the chat memory
 *  the browser already had when the save has none yet. */
export async function loadGame(): Promise<void> {
  const id = farmId();
  try {
    const token = deviceToken();
    const res = await fetch(`api/farm/${id}`, { headers: token ? { 'x-farm-token': token } : {} });
    if (res.status === 401) G.locked = true; // the farm is waiting for its password
    else if (res.ok) {
      const data = await res.json();
      if (data && data.version === 1) G.save = data as Save;
    }
  } catch { /* offline or first visit: a fresh farm below */ }
  if (!G.save.chatMemory) {
    try {
      const old = localStorage.getItem(MEMORY_KEY);
      if (old) G.save.chatMemory = JSON.parse(old);
    } catch { /* nothing to carry over */ }
  }
  if (!G.locked) ensureGuide();
  G.loaded = true;
}

/** Give this farm a password. The server hands this device its token in
 *  return, so the farmer who sets it is never locked out of their own farm.
 *  False only when the server could not be reached; a password that is
 *  already set counts as done. */
export async function setFarmPassword(password: string): Promise<boolean> {
  try {
    const res = await fetch(`api/farm/${farmId()}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.status === 201) {
      const data = await res.json();
      if (data.token) storeToken(data.token);
      return true;
    }
    return res.status === 409;
  } catch { return false; }
}

/** Type the farm's password on a new device: the server checks it and
 *  hands this device a token of its own. */
export async function unlockFarm(password: string): Promise<boolean> {
  try {
    const res = await fetch(`api/farm/${farmId()}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.token) return false;
    storeToken(data.token);
    return true;
  } catch { return false; }
}

let saving = false;
let savesBlocked = false;
/** Stop all saving from this page. For the moment the player switches to a
 * different farm code: the page reloads, and the unload save would otherwise
 * write this page's farm over the one they are switching to. */
export function blockSaves() { savesBlocked = true; }
/** Send the farm to the server. Quiet on failure; the next autosave retries. */
export async function saveGame(): Promise<void> {
  if (!G.loaded || saving || savesBlocked || G.locked) return;
  saving = true;
  try {
    const token = deviceToken();
    await fetch(`api/farm/${farmId()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-farm-token': token } : {}) },
      body: JSON.stringify(G.save),
      keepalive: true, // still lands when the page is closing
    });
  } catch { /* offline: try again next time */ }
  saving = false;
}

export function startAutosave() {
  setInterval(() => { void saveGame(); }, 2 * 60 * 1000);
  // Closing or switching away from the tab saves too, so a reload never
  // loses the last thing the player did.
  window.addEventListener('beforeunload', () => { void saveGame(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void saveGame();
  });
}

/** Steps an older farm has plainly already done, judged from the save
 * itself, so the guide only teaches what is genuinely left to learn. */
function inferDone(s: Save): string[] {
  const tiles = Object.values(s.tiles);
  const anyCrop = tiles.some((t) => t.crop);
  const tilled = tiles.filter((t) => t.tilled).length;
  const done = new Set<string>();
  if ((s.inventory['seed_turnip'] ?? 0) > 10
    || ['seed_strawberry', 'seed_potato', 'seed_tulip'].some((k) => (s.inventory[k] ?? 0) > 0)) done.add('buy');
  if (anyCrop || tilled > 5) done.add('hoe');
  if (anyCrop) done.add('plant');
  if (tiles.some((t) => t.watered) || s.can < 20) done.add('water');
  if (!(s.day === 1 && s.season === 0 && s.year === 1)) done.add('sleep');
  const hasProduce = Object.keys(s.inventory).some((k) => (ITEMS[k]?.sell ?? 0) > 0)
    || Object.keys(s.shipping).length > 0;
  if (hasProduce) done.add('harvest');
  if (Object.keys(s.shipping).length > 0) done.add('ship');
  return GUIDE_STEP_IDS.filter((id) => done.has(id));
}

/** Give the save a guide record if it predates one, filling in whatever the
 * farm has already plainly done. */
export function ensureGuide() {
  if (!G.save.guide) G.save.guide = { seen: false, off: false, done: inferDone(G.save) };
}

/** Tick off one first step. The UI listens for the event and redraws. */
export function markStep(id: string) {
  ensureGuide();
  const g = G.save.guide!;
  if (g.off || g.done.includes(id)) return;
  g.done.push(id);
  document.dispatchEvent(new CustomEvent('hh-guide'));
  void saveGame();
}

/** True while the guide still has something to teach this player. */
export function guideActive(): boolean {
  const g = G.save.guide;
  return !!g && !g.off && GUIDE_STEP_IDS.some((id) => !g.done.includes(id));
}

/**
 * Night passes: the day rolls on, crops grow, the shipping box pays out and
 * the farmer wakes at 6am with full energy. Passing out first costs 10 percent
 * of their coins (capped at 50) and lands them in bed. Returns the summary.
 */
export function sleepNight(passedOut: boolean): { title: string; lines: string[] } {
  const s = G.save;
  const lines: string[] = [];
  if (passedOut) {
    const lost = passOutPenalty(s.coins);
    s.coins -= lost;
    if (lost > 0) lines.push(`You passed out where you stood. Someone carried you home, and ${lost} coins slipped from your pocket on the way.`);
    else lines.push('You passed out where you stood. Someone carried you home to bed.');
  }
  const { lines: shipped } = advanceNight(s);
  lines.push(...shipped);
  s.minutes = DAY_START;
  s.energy = MAX_ENERGY;
  s.player = { x: 2, y: 3, scene: 'house' }; // beside the bed
  const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const title = `${seasons[s.season]} ${s.day}, Year ${s.year}`;
  if (!lines.length) lines.push('A quiet night. The farm is glad of the rest.');
  G.pendingSummary = { title, lines };
  markStep('sleep');
  void saveGame();
  return G.pendingSummary;
}

/** The tile record for one map square, made when something first happens there. */
export function tileAt(x: number, y: number): Tile {
  const key = `${x},${y}`;
  if (!G.save.tiles[key]) G.save.tiles[key] = { tilled: false };
  return G.save.tiles[key];
}

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}
