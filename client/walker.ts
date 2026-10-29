// What the outdoor scenes share: the farmer walking by tap or keys, the clock
// and nightfall, passing out at 2am, the townsfolk following their schedules,
// name labels, and talking to anyone. The farm and the town each extend it
// with their own map and their own things to tap.
import Phaser from 'phaser';
import { T } from './world';
import { G, saveGame, sleepNight, farmerKey, farmerPack, GAME_MIN_PER_MS, clockLabel } from './state';
import { anyPanelOpen, closePanels, fade, openStall } from './ui';
import { SEASONS, DAY_END, TIRED_BELOW } from '../shared/rules.js';
import { SPOTS, BUILDING } from '../shared/town.js';
import { PEOPLE, whereIs, homeOf, homeScene, SCENE_ORDER } from '../shared/schedules.js';

export type Dir = 'down' | 'left' | 'right' | 'up';
export const DIRS: Dir[] = ['down', 'left', 'right', 'up'];
type Pt = { x: number; y: number };

/** Everyone's name as the farmer sees it, and a written line each for when the server cannot be reached. */
export const NAMES: Record<string, string> = {
  rosie: 'Rosie', kai: 'Kai', mira: 'Mira', theo: 'Theo', june: 'June', silas: 'Silas', amara: 'Amara', priya: 'Priya', hana: 'Hana',
  mayor: 'Mayor Barnaby', pip: 'Pip', poppy: 'Poppy', fennick: 'Old Fennick', ines: 'Doctor Ines', tibbs: 'Mrs. Tibbs',
  wren: 'Wren', ollie: 'Ollie', clementine: 'Clementine', benji: 'Benji', gull: 'Captain Gull', lottie: 'Lottie', hugo: 'Hugo',
  jed: 'Jed', marigold: 'Marigold',
};
const OFFLINE_LINES = ['Oh, hello there. Lovely day for it.', 'Settling in all right on the old farm?', 'Hazel would have liked you, I think.'];

export const ALL_SHEETS = [...PEOPLE];

const BRAMBLE_LINES = [
  'Bramble flicks an ear at you, then yawns.',
  'Bramble watches the pond. He has seen a great many springs.',
  'Bramble lets you scratch behind his notched ear. Just this once.',
];

export interface Person {
  key: string;
  name: string;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  path: Pt[];
  dir: Dir;
  /** The spot name they are heading for or standing at, and that tile. */
  at: string;
  goal: Pt;
  leaving: boolean;
  /** While chatting, they hold still. */
  held: boolean;
  shownUntil: number;
}

type Memory = Record<string, { from: string; text: string }[]>;

/** The live outdoor scene, for the chat box handlers wired once on the page. */
let active: Walker | null = null;
let domWired = false;

export abstract class Walker extends Phaser.Scene {
  abstract readonly where: 'farm' | 'town' | 'ranch';
  /** Where people walk in and out of this map, towards the maps west and east of it. */
  abstract gates(): { west?: Pt; east?: Pt };
  cols = 0;
  rows = 0;
  blocked: boolean[][] = [];
  player!: Phaser.GameObjects.Sprite;
  playerPack?: Phaser.GameObjects.Sprite;
  packKey = '';
  playerPath: Pt[] = [];
  playerDir: Dir = 'down';
  people: Person[] = [];
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  night!: Phaser.GameObjects.Rectangle;
  marker!: Phaser.GameObjects.Graphics;
  talking = false;
  talkTarget: Person | 'bramble' | null = null;
  chatWith: Person | null = null;
  waiting = false;
  memory: Memory = {};
  busy = false;
  lastTile = { x: -1, y: -1 };
  lastSync = -1e9;

  /** Fires when the farmer reaches what they walked to; the scene adds its own targets. */
  abstract arrivedAt(): boolean;
  /** Called every frame once the farmer has moved to a new tile. Return true if the scene changed. */
  abstract onTile(here: Pt): boolean;

  canvasTex(key: string, make: () => HTMLCanvasElement) {
    if (!this.textures.exists(key)) this.textures.addCanvas(key, make());
  }

  /** Per visit setup shared by both scenes. Phaser reuses the scene object, so everything starts over. */
  beginVisit(placeName: string) {
    (window as unknown as { hhG: typeof G }).hhG = G; // handy for testing in the browser
    this.people = [];
    this.playerPath = [];
    this.talkTarget = null;
    this.talking = false;
    this.chatWith = null;
    this.waiting = false;
    this.busy = false;
    this.lastTile = { x: -1, y: -1 };
    this.lastSync = -1e9;
    document.body.classList.remove('indoors');
    document.getElementById('where')!.textContent = placeName;
    this.memory = G.save.chatMemory ?? {};
  }

  addPlayer(start: Pt) {
    this.player = this.add.sprite(start.x * T + 16, start.y * T + 28, farmerKey(), 1).setOrigin(0.5, 1);
    this.packKey = farmerPack();
    this.playerPack = this.packKey ? this.add.sprite(start.x * T + 16, start.y * T + 28, this.packKey, 1).setOrigin(0.5, 1) : undefined;
    this.marker = this.add.graphics().setDepth(-5);
  }

  finishSetup() {
    this.night = this.add.rectangle(0, 0, this.cols * T, this.rows * T, 0x1a1840, 0).setOrigin(0).setDepth(9000);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.cols * T, this.rows * T);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.fitZoom();
    this.scale.on('resize', () => this.fitZoom());
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.syncPeople(true);
    // Another panel's chat button (Marigold's stall) asks for a conversation by name.
    const onChat = (e: Event) => {
      const person = this.people.find((p) => p.key === (e as CustomEvent).detail);
      if (person) this.openTalk(person);
    };
    document.addEventListener('hh-chat', onChat);
    this.events.once('shutdown', () => document.removeEventListener('hh-chat', onChat));
    active = this;
    if (!domWired) {
      domWired = true;
      document.getElementById('talk')!.addEventListener('pointerdown', (e) => e.stopPropagation());
      document.getElementById('bye')!.addEventListener('click', () => active?.closeTalk());
      document.getElementById('say')!.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('said') as HTMLInputElement;
        const text = input.value.trim();
        if (text && active?.chatWith && !active.waiting) { input.value = ''; void active.ask(active.chatWith, text); }
      });
    }
  }

  /** Roughly 10 tiles across on a phone, more on a bigger screen. */
  fitZoom() {
    const w = this.scale.width, h = this.scale.height;
    const z = Math.max(1, Math.min(4, Math.round((Math.min(w, h * 1.4) / (10 * T)) * 2) / 2));
    this.cameras.main.setZoom(z);
  }

  tileOf(s: Phaser.GameObjects.Sprite): Pt { return { x: Math.floor(s.x / T), y: Math.floor((s.y - 4) / T) }; }

  free(x: number, y: number) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows && !this.blocked[y][x]; }

  /** Breadth first search on the tile grid. With `beside`, stop next to the target instead of on it. */
  findPath(from: Pt, to: Pt, beside: boolean): Pt[] {
    const W = this.cols;
    const goal = (x: number, y: number) => beside ? Math.abs(x - to.x) + Math.abs(y - to.y) === 1 : x === to.x && y === to.y;
    if (!beside && !this.free(to.x, to.y)) {
      // Tapped on a tree or a wall: walk to the nearest open tile instead.
      let best: Pt | null = null, bd = 1e9;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = to.x + dx, y = to.y + dy, d = dx * dx + dy * dy;
        if (this.free(x, y) && d < bd) { bd = d; best = { x, y }; }
      }
      if (!best) return [];
      to = best;
    }
    const prev = new Map<number, number>();
    const id = (x: number, y: number) => y * W + x;
    const q = [from];
    prev.set(id(from.x, from.y), -1);
    while (q.length) {
      const c = q.shift()!;
      if (goal(c.x, c.y) || (beside && c.x === to.x && c.y === to.y)) {
        const out: Pt[] = [];
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
    this.marker.clear();
    const end = path[path.length - 1];
    if (end) this.marker.lineStyle(2, 0xfff6e6, 0.9).strokeRect(end.x * T + 3, end.y * T + 3, T - 6, T - 6);
    if (!path.length) this.arrived();
  }

  /** Fires when the farmer reaches whatever they were walking to. */
  arrived() {
    if (this.talkTarget) {
      const t = this.talkTarget;
      // Marigold sells first and chats second: her stall opens on approach,
      // and the chat button inside it finds its way back to a conversation.
      if (t !== 'bramble' && t.key === 'marigold') { this.talkTarget = null; openStall(); return; }
      this.openTalk(t);
      return;
    }
    this.arrivedAt();
  }

  hasTarget(): boolean { return !!this.talkTarget; }

  /** Moves a sprite along its path; returns true while still walking. */
  step(s: Phaser.GameObjects.Sprite, path: Pt[], speed: number, dt: number, key: string, setDir: (d: Dir) => void) {
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

  /** The farmer's bag rides exactly where the farmer rides. */
  syncPack(walking: boolean) {
    if (!this.playerPack || !this.packKey) return;
    const p = this.playerPack;
    p.setPosition(this.player.x, this.player.y);
    p.setDisplayOrigin(16, this.player.displayOriginY);
    if (walking) {
      const key = `${this.packKey}-${this.playerDir}`;
      if (p.anims.currentAnim?.key !== key || !p.anims.isPlaying) p.play(key);
    } else {
      p.stop();
      p.setFrame(DIRS.indexOf(this.playerDir) * 4 + 1);
    }
  }

  /** One frame of the farmer, the clock and the townsfolk. Returns false when the scene is busy or paused. */
  tick(time: number, delta: number): boolean {
    const dt = delta / 1000;
    this.tickClock(delta);
    if (this.busy) return false;
    if (this.talking || document.activeElement?.id === 'said' || anyPanelOpen()) {
      this.depthSort(); this.syncPack(false); this.updateLabels(time); return false;
    }
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
    const speed = G.save.energy < TIRED_BELOW ? 58 : 92;
    const walking = this.step(this.player, this.playerPath, speed, dt, farmerKey(), (d) => { this.playerDir = d; });
    if (!walking) {
      if (this.player.anims.isPlaying) this.stand(this.player, this.playerDir);
      this.marker.clear();
      if (this.hasTarget()) this.arrived();
    }
    this.player.setDisplayOrigin(16, walking ? 48 + Math.abs(Math.sin(time / 90)) : 48);
    this.syncPack(walking);
    const here = this.tileOf(this.player);
    if (here.x !== this.lastTile.x || here.y !== this.lastTile.y) {
      this.lastTile = here;
      if (this.onTile(here)) return false;
    }
    if (time - this.lastSync > 400) this.syncPeople(false);
    for (const p of this.people) this.movePerson(p, dt);
    this.people = this.people.filter((p) => p.sprite.active);
    this.updateLabels(time);
    this.depthSort();
    return true;
  }

  depthSort() {
    this.player.setDepth(this.player.y);
    if (this.playerPack) this.playerPack.setDepth(this.player.depth + 1);
    for (const p of this.people) p.sprite.setDepth(p.sprite.y);
  }

  tickClock(delta: number) {
    const s = G.save;
    s.minutes += delta * GAME_MIN_PER_MS;
    if (s.minutes >= DAY_END) { this.passOut(); return; }
    const el = document.getElementById('clock')!;
    const text = clockLabel();
    if (el.textContent !== text) el.textContent = text;
    // Evening falls from 6pm, full night by 10pm.
    const dark = Phaser.Math.Clamp((s.minutes - 18 * 60) / (4 * 60), 0, 1) * 0.55;
    this.night.setFillStyle(0x1a1840, dark);
    this.onDark(dark);
  }

  onDark(_dark: number) { /* the farm puts Bramble to sleep */ }

  passOut() {
    if (this.busy) return;
    this.busy = true;
    if (this.talking) this.closeTalk();
    closePanels();
    this.playerPath = [];
    fade(true);
    window.setTimeout(() => {
      sleepNight(true);
      this.scene.start('house');
      fade(false);
    }, 800);
  }

  /** Leave for another scene with the fade the farmhouse door uses. */
  goTo(scene: 'farm' | 'town' | 'ranch' | 'house', at: Pt) {
    if (this.busy) return;
    this.busy = true;
    if (this.talking) this.closeTalk();
    this.playerPath = [];
    fade(true);
    window.setTimeout(() => {
      G.save.player = { x: at.x, y: at.y, scene };
      void saveGame();
      this.scene.start(scene);
      fade(false);
    }, 650);
  }

  // ---- The townsfolk on their schedules ----

  /** The tile where someone enters or leaves this scene, given where they come from or go. */
  gateFor(other: 'farm' | 'town' | 'ranch' | 'home', who: string): Pt {
    let dest = other;
    if (dest === 'home') {
      dest = homeScene(who);
      if (dest === this.where) return BUILDING[homeOf(who)].front;
    }
    const g = this.gates();
    const east = SCENE_ORDER.indexOf(dest as 'farm') > SCENE_ORDER.indexOf(this.where);
    return (east ? g.east : g.west) ?? g.east ?? g.west!;
  }

  /** A free tile at or near a spot, not already someone else's goal. */
  spotTile(name: string, who: string): Pt {
    const sp = SPOTS[name];
    const taken = new Set(this.people.filter((p) => p.key !== who && !p.leaving).map((p) => `${p.goal.x},${p.goal.y}`));
    for (let r = 0; r < 4; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sp.x + dx, y = sp.y + dy;
        if (this.free(x, y) && !taken.has(`${x},${y}`)) return { x, y };
      }
    return { x: sp.x, y: sp.y };
  }

  /** Bring the scene's people in line with the clock: who arrives, who leaves, who moves on. */
  syncPeople(initial: boolean) {
    this.lastSync = this.time.now;
    const s = G.save;
    for (const key of PEOPLE) {
      const w = whereIs(key, s.minutes, s.day, s.season, s.year)!;
      const here = w.scene === this.where;
      let p = this.people.find((q) => q.key === key);
      if (here && (!p || p.leaving)) {
        if (p) { p.leaving = false; } else {
          // Arriving: at the spot when the scene opens, otherwise in through a gate or their door.
          const before = whereIs(key, s.minutes - 30, s.day, s.season, s.year)!;
          const start = initial ? this.spotTile(w.at, key) : this.gateFor(before.scene, key);
          p = this.spawn(key, start);
        }
        p.at = '';
      }
      if (!p) continue;
      if (here && p.at !== w.at) {
        p.at = w.at;
        p.goal = this.spotTile(w.at, key);
        if (!p.held) p.path = this.findPath(this.tileOf(p.sprite), p.goal, false);
      } else if (!here && !p.leaving) {
        p.leaving = true;
        p.at = '';
        p.goal = this.gateFor(w.scene, key);
        if (initial) { this.despawn(p); continue; }
        if (!p.held) p.path = this.findPath(this.tileOf(p.sprite), p.goal, false);
      }
    }
  }

  spawn(key: string, at: Pt): Person {
    const sprite = this.add.sprite(at.x * T + 16, at.y * T + 28, key, 1).setOrigin(0.5, 1);
    sprite.setInteractive({ useHandCursor: true });
    const label = this.add.text(sprite.x, sprite.y - 50, NAMES[key] ?? key, {
      fontFamily: '"Pixelify Sans", monospace', fontSize: '11px', color: '#fff6e6',
      backgroundColor: 'rgba(74,40,38,0.82)', padding: { x: 3, y: 1 }, resolution: 3,
    }).setOrigin(0.5, 1).setDepth(8000).setVisible(false);
    const p: Person = { key, name: NAMES[key] ?? key, sprite, label, path: [], dir: 'down', at: '', goal: at, leaving: false, held: false, shownUntil: 0 };
    this.people.push(p);
    return p;
  }

  despawn(p: Person) {
    p.sprite.destroy();
    p.label.destroy();
    if (this.chatWith === p) this.closeTalk();
  }

  movePerson(p: Person, dt: number) {
    if (p.held) return;
    if (this.step(p.sprite, p.path, 46, dt, p.key, (d) => { p.dir = d; })) return;
    if (p.sprite.anims.isPlaying) this.stand(p.sprite, p.dir);
    const t = this.tileOf(p.sprite);
    if (p.leaving && t.x === p.goal.x && t.y === p.goal.y) { this.despawn(p); return; }
    // Blocked or knocked off course: try again for the goal.
    if ((t.x !== p.goal.x || t.y !== p.goal.y) && Math.random() < 0.02) p.path = this.findPath(t, p.goal, false);
    // Standing still, they look about now and then.
    if (!p.path.length && Math.random() < dt * 0.15) { p.dir = DIRS[Math.floor(Math.random() * 4)]; this.stand(p.sprite, p.dir); }
  }

  /** Names show when the farmer is within 2 tiles, or for a moment after a tap. */
  updateLabels(time: number) {
    const me = this.tileOf(this.player);
    for (const p of this.people) {
      const t = this.tileOf(p.sprite);
      const near = Math.abs(t.x - me.x) <= 2 && Math.abs(t.y - me.y) <= 2;
      p.label.setVisible(near || time < p.shownUntil || this.chatWith === p);
      p.label.setPosition(Math.round(p.sprite.x), Math.round(p.sprite.y - 50));
    }
  }

  /** A tap on a person: show their name, walk over, and talk. */
  tapPerson(p: Person) {
    p.shownUntil = this.time.now + 3000;
    this.talkTarget = p;
    const t = this.tileOf(p.sprite);
    this.walkTo(t.x, t.y, true);
  }

  // ---- Talking ----

  openTalk(who: Person | 'bramble') {
    this.talkTarget = null;
    this.talking = true;
    const box = document.getElementById('talk')!;
    const img = box.querySelector('img')!;
    const form = document.getElementById('say')!;
    const line = box.querySelector('.line')!;
    if (who === 'bramble') {
      this.chatWith = null;
      img.src = 'assets/sprites/bramble.png';
      img.style.objectFit = 'none';
      img.style.objectPosition = '-64px -64px';
      img.style.width = img.style.height = '32px';
      img.style.transform = 'scale(3)';
      img.style.margin = '32px';
      box.querySelector('.who')!.textContent = 'Bramble';
      line.textContent = Phaser.Utils.Array.GetRandom(BRAMBLE_LINES);
      line.classList.remove('waiting');
      form.classList.add('hidden'); // foxes don't chat
    } else {
      this.chatWith = who;
      img.removeAttribute('style');
      img.src = `assets/portraits/${who.key}_neutral.png`;
      box.querySelector('.who')!.textContent = who.name;
      form.classList.remove('hidden');
      // They stop, turn to face you, and wait while you talk.
      who.held = true;
      who.path = [];
      const dx = this.player.x - who.sprite.x, dy = this.player.y - who.sprite.y;
      who.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.stand(who.sprite, who.dir);
      const back: Dir = who.dir === 'left' ? 'right' : who.dir === 'right' ? 'left' : who.dir === 'up' ? 'down' : 'up';
      this.playerDir = back;
      this.stand(this.player, back);
      void this.ask(who, '');
    }
    box.classList.add('open');
  }

  /** One exchange with the server: greet them when `said` is empty, otherwise say it. */
  async ask(who: Person, said: string) {
    const box = document.getElementById('talk')!;
    const line = box.querySelector('.line')!;
    const img = box.querySelector('img')!;
    this.waiting = true;
    line.textContent = said ? `You: ${said}` : '...';
    line.classList.add('waiting');
    const history = this.memory[who.key] ?? [];
    const s = G.save;
    let reply = { line: Phaser.Utils.Array.GetRandom(OFFLINE_LINES) as string, mood: 'neutral' };
    try {
      const res = await fetch('api/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          who: who.key, said, history,
          context: { time: clockLabel().replace(/^\S+ \d+\s+/, ''), season: SEASONS[s.season], day: s.day, year: s.year, minutes: Math.floor(s.minutes) },
        }),
      });
      if (res.ok) reply = await res.json();
    } catch { /* offline: a written line it is */ }
    this.waiting = false;
    if (this.chatWith !== who) return; // they closed the chat while we waited
    line.classList.remove('waiting');
    line.textContent = reply.line;
    img.src = `assets/portraits/${who.key}_${reply.mood || 'neutral'}.png`;
    const mem = [...history];
    if (said) mem.push({ from: 'player', text: said });
    mem.push({ from: who.key, text: reply.line });
    this.memory[who.key] = mem.slice(-8);
    // The memory lives in the save, so it follows the farm code to any device.
    G.save.chatMemory = this.memory;
    void saveGame();
  }

  closeTalk() {
    this.talking = false;
    const who = this.chatWith;
    this.chatWith = null;
    if (who) {
      who.held = false;
      if (who.sprite.active) who.path = this.findPath(this.tileOf(who.sprite), who.goal, false);
    }
    (document.getElementById('said') as HTMLInputElement).blur();
    document.getElementById('talk')!.classList.remove('open');
  }
}
