// Hollow Square: schedules, shop hours, purchases, food, fertiliser, the town map and talk context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { newSave, advanceNight } from '../shared/rules.js';
import {
  BUILDINGS, BUILDING, SPOTS, TOWN_COLS, TOWN_ROWS, WEST_GATE, EAST_GATE, townLayout, RANCH_COLS, RANCH_ROWS, RANCH_GATE, RANCH_BUILDINGS, ranchLayout, isOpen, hoursText, eat, buyAtStore, canCapacity, hadToday,
} from '../shared/town.js';
import { SCHEDULES, PEOPLE, whereIs, farmVisits, homeOf } from '../shared/schedules.js';
import { CHARACTERS } from '../server/characters.js';
import { buildPrompt, placeLine } from '../server/talk.js';
import { validateSave } from '../server/farms.js';

const at = (h, m = 0) => h * 60 + m;
const shopSave = (h = 10, day = 2) => { const s = newSave(); s.minutes = at(h); s.day = day; return s; };

test('everyone with art has a schedule, a persona and portraits for every mood', () => {
  const portraits = new Set(readdirSync(new URL('../art/portraits/', import.meta.url)));
  const sprites = new Set(readdirSync(new URL('../art/sprites/', import.meta.url)));
  assert.equal(PEOPLE.length, 24);
  for (const who of PEOPLE) {
    assert.ok(CHARACTERS[who], `${who} persona`);
    assert.ok(sprites.has(`${who}_walk.png`), `${who} sprite`);
    for (const mood of CHARACTERS[who].moods) assert.ok(portraits.has(`${who}_${mood}.png`), `${who}_${mood}`);
    assert.equal(CHARACTERS[who].lines.length, 3, `${who} has three written lines`);
  }
  for (const who of ['rosie', 'kai', 'mira', 'theo', 'june', 'silas', 'amara', 'priya', 'hana']) assert.equal(CHARACTERS[who].moods.length, 5, who);
  for (const who of ['mayor', 'pip', 'poppy', 'fennick', 'ines', 'tibbs', 'wren', 'ollie', 'clementine', 'benji', 'gull', 'lottie', 'hugo', 'jed', 'marigold']) assert.equal(CHARACTERS[who].moods.length, 3, who);
});

test('schedules: who is where at a given time', () => {
  assert.equal(whereIs('pip', at(10), 2).at, 'store');
  assert.equal(whereIs('pip', at(17, 30), 2).at, 'cafe');
  assert.equal(whereIs('pip', at(20), 2).scene, 'home');
  assert.equal(whereIs('pip', at(10), 7).at, 'fountain_w', 'rest day by the fountain');
  assert.equal(whereIs('tibbs', at(6), 2).scene, 'home', 'before her first stop she is at home');
  assert.equal(whereIs('tibbs', at(8), 2).doing, 'running the café');
  assert.equal(whereIs('marigold', at(9), 2).at, 'farm_stall');
  assert.equal(whereIs('marigold', at(9), 2).scene, 'farm');
  assert.equal(whereIs('marigold', at(19), 2).scene, 'home');
  assert.equal(whereIs('ines', at(10, 30), 7).at, 'bench_s', 'the clinic is shut on rest days');
  assert.equal(homeOf('june'), 'ranch_house');
  assert.equal(whereIs('june', at(7), 2).scene, 'ranch');
  assert.equal(whereIs('hugo', at(15), 2).at, 'honey_shed');
});

test('Ollie walks his post round, a new door every twenty minutes', () => {
  const doors = [0, 20, 40, 60].map((m) => whereIs('ollie', at(8) + m, 2).at);
  assert.deepEqual(doors, ['store', 'cafe', 'bakery', 'library']);
  assert.equal(whereIs('ollie', at(16, 30), 2).at, 'noticeboard');
});

test('two strollers visit the farm each day, by code, and every one of the 24 is out at some point', () => {
  for (let day = 1; day <= 14; day++) {
    const v = farmVisits(day);
    assert.equal(v.length, 2);
    assert.notEqual(v[0].who, v[1].who);
    const w = whereIs(v[0].who, v[0].from + 30, day);
    assert.equal(w.scene, 'farm');
    assert.match(w.doing, /farm/);
  }
  for (const who of PEOPLE) {
    const seen = [];
    for (let m = at(6); m < at(26); m += 10) seen.push(whereIs(who, m, 3).scene);
    assert.ok(seen.some((s) => s !== 'home'), `${who} is out during day 3`);
  }
});

test('every schedule stop names a real spot, and every town spot is open ground reachable from the farm road', () => {
  const L = townLayout();
  const seen = new Set([`${WEST_GATE.x},${WEST_GATE.y}`]);
  const q = [[WEST_GATE.x, WEST_GATE.y]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= TOWN_COLS || ny >= TOWN_ROWS || L.blocked[ny][nx] || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  for (const [name, sp] of Object.entries(SPOTS)) {
    if (sp.scene !== 'town') continue;
    assert.ok(!L.blocked[sp.y][sp.x], `${name} is open ground`);
    assert.ok(seen.has(`${sp.x},${sp.y}`), `${name} can be walked to`);
  }
  for (const b of BUILDINGS) assert.ok(seen.has(`${b.front.x},${b.front.y}`), `${b.id} door can be reached`);
  assert.ok(seen.has(`${EAST_GATE.x},${EAST_GATE.y}`), 'the ranch road');
  // The ranch: every spot and door reachable from the road in from town.
  const R = ranchLayout();
  const rs = new Set([`${RANCH_GATE.x},${RANCH_GATE.y}`]);
  const rq = [[RANCH_GATE.x, RANCH_GATE.y]];
  while (rq.length) {
    const [x, y] = rq.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= RANCH_COLS || ny >= RANCH_ROWS || R.blocked[ny][nx] || rs.has(`${nx},${ny}`)) continue;
      rs.add(`${nx},${ny}`);
      rq.push([nx, ny]);
    }
  }
  for (const [name, sp] of Object.entries(SPOTS)) if (sp.scene === 'ranch') assert.ok(rs.has(`${sp.x},${sp.y}`), `${name} on the ranch`);
  for (const b of RANCH_BUILDINGS) assert.ok(rs.has(`${b.front.x},${b.front.y}`), `${b.id} door`);
  for (const [who, sched] of Object.entries(SCHEDULES)) {
    for (const s of sched.stops) {
      if (s.at === 'home') continue;
      for (const spot of s.route ?? [s.at]) assert.ok(SPOTS[spot], `${who}: ${spot}`);
    }
    assert.ok(BUILDING[sched.home], `${who} home`);
  }
});

test('shop hours: the store keeps 9 to 5 and shuts on rest days', () => {
  assert.equal(isOpen('store', at(8, 59), 2), false);
  assert.equal(isOpen('store', at(9), 2), true);
  assert.equal(isOpen('store', at(16, 59), 2), true);
  assert.equal(isOpen('store', at(17), 2), false);
  assert.equal(isOpen('store', at(12), 7), false);
  assert.equal(isOpen('store', at(12), 14), false);
  assert.equal(isOpen('cafe', at(12), 7), true, 'the café opens every day');
  assert.equal(isOpen('cottage_rose', at(12), 2), false, 'homes are not shops');
  assert.equal(hoursText('store'), 'Open 9am to 5pm, closed on rest days (day 7 and day 14).');
  assert.equal(hoursText('bakery'), 'Open 6am to 2pm.');
  const s = shopSave(18);
  const r = buyAtStore(s, 'seed_turnip');
  assert.equal(r.ok, false);
  assert.match(r.msg, /closed\. Open 9am to 5pm/);
  assert.equal(s.coins, 500);
});

test('the General Store sells seeds at Milestone 1 prices, fertiliser, and one bigger can', () => {
  const s = shopSave();
  assert.ok(buyAtStore(s, 'seed_potato').ok);
  assert.equal(s.coins, 470);
  assert.equal(s.inventory.seed_potato, 1);
  assert.ok(buyAtStore(s, 'fertiliser').ok);
  assert.equal(s.coins, 420);
  assert.equal(s.inventory.fertiliser, 1);
  assert.equal(buyAtStore(s, 'big_can').ok, false, 'not enough coins');
  s.coins = 2000;
  s.can = 3;
  assert.ok(buyAtStore(s, 'big_can').ok);
  assert.equal(s.coins, 500);
  assert.equal(canCapacity(s), 40);
  assert.equal(s.can, 40, 'it comes full');
  assert.equal(buyAtStore(s, 'big_can').ok, false, 'one per farmer');
  assert.equal(buyAtStore(s, 'pie').ok, false, 'the store sells no pie');
});

test('food: café meals once each a day, bread any time the bakery is open, energy capped', () => {
  const s = shopSave(12);
  s.energy = 10;
  assert.ok(eat(s, 'tea').ok);
  assert.equal(s.energy, 30);
  assert.equal(s.coins, 470);
  assert.equal(eat(s, 'tea').ok, false, 'once a day');
  assert.ok(hadToday(s, 'tea'));
  assert.ok(eat(s, 'pie').ok);
  assert.equal(s.energy, 80);
  assert.ok(eat(s, 'bread').ok);
  assert.equal(s.energy, 100, 'capped at full');
  assert.equal(eat(s, 'bread').ok, false, 'full already');
  s.energy = 50;
  s.minutes = at(15);
  assert.match(eat(s, 'bread').msg, /Bakery is closed/);
  advanceNight(s);
  s.minutes = at(9);
  assert.equal(hadToday(s, 'tea'), false, 'a new day, a new cup');
  assert.ok(eat(s, 'tea').ok);
  s.coins = 10;
  assert.equal(eat(s, 'pie').ok, false, 'not enough coins');
});

test('fertiliser: one extra stage on the first watered night, then spent', () => {
  const s = newSave();
  s.tiles['11,3'] = { tilled: true, crop: 'turnip', age: 0, watered: true, fert: true };
  s.tiles['12,3'] = { tilled: true, crop: 'turnip', age: 0, watered: true };
  advanceNight(s);
  assert.equal(s.tiles['11,3'].age, 2);
  assert.equal(s.tiles['12,3'].age, 1);
  assert.equal(s.tiles['11,3'].fert, undefined);
  s.tiles['11,3'].watered = true;
  advanceNight(s);
  assert.equal(s.tiles['11,3'].age, 3);
  // Dry, the fertiliser waits for water.
  s.tiles['13,3'] = { tilled: true, crop: 'potato', age: 0, fert: true };
  advanceNight(s);
  assert.equal(s.tiles['13,3'].fert, true);
});

test('saves carry the town, the bigger can, fertiliser and meals; a can over 20 needs the big can', () => {
  const s = newSave();
  s.player = { x: 35, y: 20, scene: 'town' };
  s.bigCan = true;
  s.can = 40;
  s.inventory.fertiliser = 2;
  s.tiles['11,3'] = { tilled: true, fert: true };
  s.meals = { stamp: '1-0-1', had: ['tea', 'cake'] };
  const v = validateSave(s);
  assert.ok(v);
  assert.deepEqual(v.player, { x: 35, y: 20, scene: 'town' });
  assert.equal(v.can, 40);
  assert.equal(v.inventory.fertiliser, 2);
  assert.equal(v.tiles['11,3'].fert, true);
  assert.deepEqual(v.meals, { stamp: '1-0-1', had: ['tea'] });
  assert.equal(validateSave({ ...s, bigCan: false }), null, 'a 40 can without the big can');
  assert.equal(validateSave({ ...s, player: { x: 35, y: 20, scene: 'farm' } }), null, 'the farm is smaller');
  assert.equal(validateSave({ ...s, player: { x: 1, y: 1, scene: 'moon' } }), null);
  assert.deepEqual(validateSave({ ...s, player: { x: 12, y: 11, scene: 'ranch' } }).player, { x: 12, y: 11, scene: 'ranch' });
});

test('talk context comes from the schedule, worked out by the game from the clock', () => {
  assert.match(placeLine('pip', { minutes: at(10), day: 2, season: 'Spring' }), /Hollow Square.*Pip is at the General Store counter/);
  assert.match(placeLine('marigold', { minutes: at(10), day: 2 }), /Hazel's farm.*selling flowers/);
  assert.match(placeLine('tibbs', { minutes: at(23), day: 2 }), /on your way home/);
  assert.match(placeLine('kai', {}), /out and about/);
  const p = buildPrompt('gull', 'ahoy', [], { minutes: at(12, 30), day: 3, time: '12:30pm', season: 'Spring' });
  assert.match(p.system, /Gull is having chowder at the café/);
  assert.doesNotMatch(p.system, /visiting the farmer on Hazel's farm/);
});
