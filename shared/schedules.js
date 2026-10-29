// Who is where, and when. Each person has a home and a list of stops: from a
// time of day they stand at a named spot (see SPOTS in town.js), doing
// something the AI is told about. Before their first stop and after their
// last one ends they are at home, out of sight. Code decides all of this.

import { SPOTS, isRestDay } from './town.js';

const hm = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** The post round: Ollie walks it all day, one door after another. */
export const POST_ROUND = ['store', 'cafe', 'bakery', 'library', 'mayor', 'clinic', 'pottery', 'teahouse', 'weaving', 'smithy'];

/**
 * Homes are a building (they walk to its door and go in) or 'east', the ranch
 * road out of town for those who live outside it. `rest: true` stops happen
 * only on rest days, `rest: false` only on working days. A stop with `at: 'home'`
 * sends them home early.
 */
export const SCHEDULES = {
  rosie: { home: 'cottage_rose', stops: [
    { from: '8:00', at: 'flowerbeds', doing: 'tending the flower beds in the square' },
    { from: '12:00', at: 'fountain_s', doing: 'eating her lunch by the fountain' },
    { from: '13:30', at: 'flowerbeds', doing: 'tending the flower beds in the square' },
    { from: '18:00', at: 'home' },
  ] },
  kai: { home: 'smithy', stops: [
    { from: '8:00', at: 'smithy', doing: 'working the forge at the smithy' },
    { from: '18:00', at: 'cafe_left', doing: 'having supper outside the café' },
    { from: '20:00', at: 'home' },
  ] },
  mira: { home: 'library', stops: [
    { from: '9:00', at: 'library', doing: 'minding the library' },
    { from: '13:00', at: 'bench_n', doing: 'reading on a bench in the square' },
    { from: '14:00', at: 'library', doing: 'minding the library' },
    { from: '19:00', at: 'bridge', doing: 'watching the river from the bridge' },
    { from: '21:00', at: 'home' },
  ] },
  theo: { home: 'cottage_gull', stops: [
    { from: '6:00', at: 'dock_w', doing: 'fishing off the dock' },
    { from: '12:00', at: 'cafe', doing: 'grabbing lunch at the café' },
    { from: '13:00', at: 'riverbank_w', doing: 'fishing from the riverbank' },
    { from: '20:00', at: 'home' },
  ] },
  june: { home: 'east', stops: [
    { from: '11:00', at: 'bakery_left', doing: 'buying bread on her way through town' },
    { from: '12:30', at: 'noticeboard', doing: 'reading the noticeboard' },
    { from: '15:00', at: 'home' },
  ] },
  silas: { home: 'cafe', stops: [
    { from: '11:00', at: 'fountain_e', doing: 'playing his fiddle by the fountain' },
    { from: '15:00', at: 'bridge', doing: 'writing a song on the bridge' },
    { from: '18:00', at: 'cafe', doing: 'playing a tune outside the café, where he rents the room upstairs' },
    { from: '23:00', at: 'home' },
  ] },
  amara: { home: 'pottery', stops: [
    { from: '8:00', at: 'pottery', doing: 'throwing pots at the pottery' },
    { from: '17:00', at: 'riverbank_e', doing: 'digging river clay on the bank' },
    { from: '19:00', at: 'home' },
  ] },
  priya: { home: 'weaving', stops: [
    { from: '9:00', at: 'weaving', doing: 'at the loom in the weaving shop' },
    { from: '17:00', at: 'square_e', doing: 'people watching in the square, for colour ideas' },
    { from: '19:00', at: 'home' },
  ] },
  hana: { home: 'teahouse', stops: [
    { from: '7:00', at: 'bonsai', doing: 'tending her bonsai garden' },
    { from: '9:00', at: 'teahouse', doing: 'pouring tea at the tea house' },
    { from: '19:00', at: 'home' },
  ] },
  mayor: { home: 'mayor', stops: [
    { from: '9:00', at: 'mayor', doing: "at the door of the Mayor's House" },
    { from: '11:00', at: 'fountain_n', doing: 'practising a speech by the fountain' },
    { from: '13:00', at: 'cafe', doing: 'having a long lunch at the café' },
    { from: '15:00', at: 'mayor', doing: "at the door of the Mayor's House" },
    { from: '18:00', at: 'home' },
  ] },
  pip: { home: 'store', stops: [
    { from: '9:00', at: 'store', doing: 'at the General Store counter with his sister', rest: false },
    { from: '17:00', at: 'cafe', doing: 'at the café after work', rest: false },
    { from: '10:00', at: 'fountain_w', doing: 'enjoying the rest day by the fountain', rest: true },
    { from: '13:00', at: 'cafe', doing: 'having lunch at the café on the rest day', rest: true },
    { from: '19:00', at: 'home' },
  ] },
  poppy: { home: 'store', stops: [
    { from: '9:00', at: 'store_left', doing: 'at the General Store counter with her brother', rest: false },
    { from: '17:00', at: 'cafe_left', doing: 'at the café after work', rest: false },
    { from: '10:00', at: 'fountain_n', doing: 'enjoying the rest day by the fountain', rest: true },
    { from: '13:00', at: 'cafe_left', doing: 'having lunch at the café on the rest day', rest: true },
    { from: '19:00', at: 'home' },
  ] },
  fennick: { home: 'smithy', stops: [
    { from: '7:00', at: 'smithy_left', doing: 'planing timber in the smithy yard' },
    { from: '12:00', at: 'bakery', doing: 'buying a pie at the bakery' },
    { from: '13:00', at: 'smithy_left', doing: 'building a cart wheel in the smithy yard' },
    { from: '17:00', at: 'home' },
  ] },
  ines: { home: 'clinic', stops: [
    { from: '8:00', at: 'clinic', doing: 'at the clinic', rest: false },
    { from: '10:00', at: 'bench_s', doing: 'taking her day off in the square', rest: true },
    { from: '18:00', at: 'bench_s', doing: 'resting on a bench after the clinic closes' },
    { from: '20:00', at: 'home' },
  ] },
  tibbs: { home: 'cafe', stops: [
    { from: '7:00', at: 'cafe', doing: 'running the café' },
    { from: '21:00', at: 'home' },
  ] },
  wren: { home: 'cottage_rose', stops: [
    { from: '8:00', at: 'fountain_s', doing: 'racing round the fountain' },
    { from: '11:00', at: 'bridge', doing: 'dropping sticks off the bridge to see which wins' },
    { from: '14:00', at: 'noticeboard', doing: 'reading the noticeboard for anything exciting' },
    { from: '17:00', at: 'dock', doing: 'pestering Captain Gull for sea stories' },
    { from: '19:00', at: 'home' },
  ] },
  ollie: { home: 'cottage_gull', stops: [
    { from: '8:00', at: 'route', route: POST_ROUND, doing: 'doing the post round' },
    { from: '16:00', at: 'noticeboard', doing: 'pinning new notices on the noticeboard' },
    { from: '18:00', at: 'home' },
  ] },
  clementine: { home: 'cottage_rose', stops: [
    { from: '9:00', at: 'bench_s', doing: 'knitting on a bench in the square' },
    { from: '12:00', at: 'cafe', doing: 'having tea and cake at the café' },
    { from: '14:00', at: 'library_left', doing: 'returning her library books' },
    { from: '15:00', at: 'bench_s', doing: 'knitting on a bench in the square' },
    { from: '18:00', at: 'home' },
  ] },
  benji: { home: 'bakery', stops: [
    { from: '6:00', at: 'bakery', doing: 'baking at the bakery' },
    { from: '14:00', at: 'cafe', doing: 'delivering pies to the café' },
    { from: '15:00', at: 'home' },
  ] },
  gull: { home: 'cottage_gull', stops: [
    { from: '7:00', at: 'dock', doing: 'watching the river from the dock' },
    { from: '12:00', at: 'cafe_left', doing: 'having chowder at the café' },
    { from: '14:00', at: 'dock', doing: 'mending a net on the dock' },
    { from: '20:00', at: 'home' },
  ] },
  lottie: { home: 'cottage_gull', stops: [
    { from: '8:00', at: 'library_left', doing: 'teaching the village children at the library', rest: false },
    { from: '15:00', at: 'square_e', doing: 'marking homework in the square', rest: false },
    { from: '10:00', at: 'bridge', doing: 'sketching the river on her day off', rest: true },
    { from: '17:00', at: 'bridge', doing: 'sketching the river from the bridge' },
    { from: '19:00', at: 'home' },
  ] },
  hugo: { home: 'east', stops: [
    { from: '9:00', at: 'flowerbeds', doing: 'checking the flower beds for his bees' },
    { from: '12:00', at: 'bakery', doing: 'selling honey to the bakery' },
    { from: '14:00', at: 'home' },
  ] },
  jed: { home: 'east', stops: [
    { from: '10:00', at: 'store_left', doing: 'picking up supplies for the ranch', rest: false },
    { from: '10:00', at: 'fountain_w', doing: 'loafing by the fountain on his day off', rest: true },
    { from: '12:00', at: 'cafe', doing: 'eating lunch at the café' },
    { from: '14:00', at: 'home' },
  ] },
  marigold: { home: 'cottage_rose', stops: [
    { from: '8:00', at: 'farm_stall', doing: "selling flowers at her stall on Hazel's farm" },
    { from: '18:00', at: 'home' },
  ] },
};

export const PEOPLE = Object.keys(SCHEDULES);

/** Who strolls out to the farm today, and when: two of these, chosen by the date. */
export const FARM_STROLLERS = ['kai', 'june', 'mayor', 'amara', 'priya', 'hana', 'rosie', 'theo', 'mira', 'silas', 'wren', 'clementine'];
const FARM_SPOTS = ['farm_a', 'farm_b', 'farm_c', 'farm_d', 'farm_e', 'farm_f'];
export const FARM_WINDOWS = [['10:00', '12:00'], ['14:00', '16:00']];

export function farmVisits(day, season = 0, year = 1) {
  const n = ((year - 1) * 4 + season) * 14 + day;
  const a = (n * 7) % FARM_STROLLERS.length;
  let b = (n * 5 + 3) % FARM_STROLLERS.length;
  if (b === a) b = (b + 1) % FARM_STROLLERS.length;
  return [
    { who: FARM_STROLLERS[a], from: hm(FARM_WINDOWS[0][0]), to: hm(FARM_WINDOWS[0][1]), at: FARM_SPOTS[n % FARM_SPOTS.length] },
    { who: FARM_STROLLERS[b], from: hm(FARM_WINDOWS[1][0]), to: hm(FARM_WINDOWS[1][1]), at: FARM_SPOTS[(n + 3) % FARM_SPOTS.length] },
  ];
}

/**
 * Where someone is at a time on a day. Returns { at, doing, scene, route? }:
 * at is a spot name or 'home'; scene is 'town', 'farm' or 'home' (out of sight).
 */
export function whereIs(who, minutes, day, season = 0, year = 1) {
  const sched = SCHEDULES[who];
  if (!sched) return null;
  const m = minutes;
  const visit = farmVisits(day, season, year).find((v) => v.who === who && m >= v.from && m < v.to);
  if (visit) return { at: visit.at, doing: "strolling round Hazel's farm to see how the new farmer is getting on", scene: 'farm' };
  const rest = isRestDay(day);
  let cur = null;
  for (const s of sched.stops) {
    if (s.rest === true && !rest) continue;
    if (s.rest === false && rest) continue;
    if (hm(s.from) <= m && (!cur || hm(s.from) >= hm(cur.from))) cur = s;
  }
  if (!cur || cur.at === 'home') return { at: 'home', doing: 'at home', scene: 'home' };
  if (cur.at === 'route') {
    // One door every twenty game minutes, round and round.
    const i = Math.floor((m - hm(cur.from)) / 20) % cur.route.length;
    return { at: cur.route[i], doing: cur.doing, scene: 'town', route: cur.route };
  }
  return { at: cur.at, doing: cur.doing, scene: SPOTS[cur.at]?.scene ?? 'town' };
}

/** Where on the map someone goes in to be home: a building door, or the east road. */
export function homeOf(who) {
  return SCHEDULES[who]?.home ?? 'east';
}
