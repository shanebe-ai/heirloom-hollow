// The farming rules: growth, watering, harvest, shipping payout, seasons, passing out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSave, advanceNight, harvestTile, isRipe, cropStage, passOutPenalty, CROPS } from '../shared/rules.js';

/** A save with one planted, watered crop ready for the night. */
function planted(crop, age = 0) {
  const s = newSave();
  s.tiles['11,3'] = { tilled: true, crop, age, watered: true };
  return s;
}

/** Sleep `nights` times, watering the crop at 11,3 each day. */
function sleepWatering(s, nights) {
  for (let i = 0; i < nights; i++) {
    if (s.tiles['11,3']) s.tiles['11,3'].watered = true;
    advanceNight(s);
  }
}

test('a new farm starts as the spec says: Spring 1, 500 coins, 10 turnip seeds, full can', () => {
  const s = newSave();
  assert.equal(s.day, 1);
  assert.equal(s.season, 0);
  assert.equal(s.year, 1);
  assert.equal(s.coins, 500);
  assert.equal(s.energy, 100);
  assert.equal(s.can, 20);
  assert.equal(s.inventory.seed_turnip, 10);
  assert.ok(Object.values(s.tiles).filter((t) => t.tilled).length >= 3);
  assert.ok(Object.values(s.tiles).every((t) => !t.crop), 'no decorative crops any more');
});

test('a watered crop grows one night at a time and ripens on schedule', () => {
  const s = planted('turnip');
  sleepWatering(s, 3);
  assert.equal(s.tiles['11,3'].age, 3);
  assert.equal(isRipe(s.tiles['11,3']), false);
  sleepWatering(s, 1);
  assert.equal(s.tiles['11,3'].age, CROPS.turnip.days);
  assert.equal(isRipe(s.tiles['11,3']), true);
  assert.equal(cropStage(s.tiles['11,3']), 4);
});

test('an unwatered crop pauses and never dies', () => {
  const s = planted('turnip');
  s.tiles['11,3'].watered = false;
  advanceNight(s);
  advanceNight(s);
  assert.equal(s.tiles['11,3'].age, 0);
  assert.equal(s.tiles['11,3'].dead, undefined);
});

test('watered marks reset each morning', () => {
  const s = planted('potato');
  advanceNight(s);
  assert.equal(s.tiles['11,3'].watered, false);
});

test('growth stages run 0 to 3 then ripe', () => {
  const s = planted('potato'); // 6 days to ripe
  const stages = [];
  for (let i = 0; i <= 6; i++) {
    stages.push(cropStage(s.tiles['11,3']));
    s.tiles['11,3'].watered = true;
    advanceNight(s);
  }
  assert.deepEqual(stages, [0, 0, 1, 2, 2, 3, 4]);
});

test('harvest puts produce in the inventory and clears a one time crop', () => {
  const s = planted('turnip', CROPS.turnip.days);
  const got = harvestTile(s, '11,3');
  assert.equal(got, 'turnip');
  assert.equal(s.inventory.turnip, 1);
  assert.equal(s.tiles['11,3'].crop, undefined);
  assert.equal(s.tiles['11,3'].tilled, true, 'the soil stays tilled');
});

test('an unripe crop cannot be harvested', () => {
  const s = planted('turnip', 1);
  assert.equal(harvestTile(s, '11,3'), null);
  assert.equal(s.inventory.turnip, undefined);
});

test('strawberries regrow: harvest drops them back and they ripen again', () => {
  const s = planted('strawberry', CROPS.strawberry.days);
  assert.equal(harvestTile(s, '11,3'), 'strawberry');
  assert.equal(s.inventory.strawberry, 1);
  assert.equal(s.tiles['11,3'].crop, 'strawberry', 'the plant stays in the ground');
  assert.equal(isRipe(s.tiles['11,3']), false);
  sleepWatering(s, CROPS.strawberry.regrow - 1);
  assert.equal(isRipe(s.tiles['11,3']), false);
  sleepWatering(s, 1);
  assert.equal(isRipe(s.tiles['11,3']), true);
  assert.equal(harvestTile(s, '11,3'), 'strawberry');
  assert.equal(s.inventory.strawberry, 2);
});

test('the shipping box pays out overnight at the sell prices', () => {
  const s = newSave();
  s.shipping = { turnip: 6, potato: 1 };
  const before = s.coins;
  const { lines, payout } = advanceNight(s);
  assert.equal(payout, 6 * 35 + 60);
  assert.equal(s.coins, before + payout);
  assert.deepEqual(s.shipping, {});
  assert.ok(lines.some((l) => l.includes('6 turnips') && l.includes('210 coins')));
  assert.ok(lines.some((l) => l.includes('1 potato') && l.includes('60 coins')));
});

test('seasons run 14 days, then the year turns after Winter', () => {
  const s = newSave();
  for (let i = 0; i < 14; i++) advanceNight(s);
  assert.equal(s.season, 1);
  assert.equal(s.day, 1);
  assert.equal(s.year, 1);
  for (let i = 0; i < 14 * 3; i++) advanceNight(s);
  assert.equal(s.season, 0);
  assert.equal(s.day, 1);
  assert.equal(s.year, 2);
});

test('crops out of season wither when the season changes and can be cleared later', () => {
  const s = planted('turnip', 2);
  s.day = 14; // tonight the season turns to Summer
  advanceNight(s);
  assert.equal(s.season, 1);
  assert.equal(s.tiles['11,3'].dead, true);
  assert.equal(harvestTile(s, '11,3'), null, 'a dead crop gives nothing');
});

test('passing out costs 10 percent of coins, capped at 50', () => {
  assert.equal(passOutPenalty(500), 50);
  assert.equal(passOutPenalty(1000), 50);
  assert.equal(passOutPenalty(120), 12);
  assert.equal(passOutPenalty(0), 0);
});

test('the flower stall never pays out: every price beats the shipping box', async () => {
  const { ITEMS, FLOWER_STALL, FARMER_LOOKS } = await import('../shared/rules.js');
  for (const { item, price } of FLOWER_STALL) {
    assert.ok(ITEMS[item], `stall item ${item} exists`);
    assert.ok(price > ITEMS[item].sell, `${item} costs ${price} at the stall, ships for ${ITEMS[item].sell}`);
  }
  assert.equal(FARMER_LOOKS.length, 4);
  assert.equal(new Set(FARMER_LOOKS.map((l) => l.key)).size, 4);
});

test('the kind name check refuses rude names and leaves ordinary ones alone', async () => {
  const { nameIsKind } = await import('../shared/rules.js');
  assert.equal(nameIsKind('Ash'), true);
  assert.equal(nameIsKind('Essex'), true);
  assert.equal(nameIsKind('Grass'), true);
  assert.equal(nameIsKind('Rosie'), true);
  assert.equal(nameIsKind('Fuck'), false);
  assert.equal(nameIsKind('sh1t'), false);
  assert.equal(nameIsKind('xxFuckxx'), false);
  assert.equal(nameIsKind('Nazi Bob'), false);
});
