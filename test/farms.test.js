// Farm saves: id checks, save validation, and the file store round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validFarmId, validateSave, FarmStore } from '../server/farms.js';
import { newSave } from '../shared/rules.js';

const ID = '123e4567-e89b-42d3-a456-426614174000';

test('farm ids must look like the UUIDs the client makes', () => {
  assert.equal(validFarmId(ID), true);
  assert.equal(validFarmId('../etc/passwd'), false);
  assert.equal(validFarmId('not-a-uuid'), false);
  assert.equal(validFarmId(''), false);
  assert.equal(validFarmId(undefined), false);
});

test('a fresh save from the game validates and round trips clean', () => {
  const clean = validateSave(newSave());
  assert.ok(clean);
  assert.equal(clean.coins, 500);
  assert.equal(clean.inventory.seed_turnip, 10);
});

test('validation rejects the wrong version and wild numbers', () => {
  assert.equal(validateSave({ ...newSave(), version: 2 }), null);
  assert.equal(validateSave({ ...newSave(), coins: -5 }), null);
  assert.equal(validateSave({ ...newSave(), day: 99 }), null);
  assert.equal(validateSave({ ...newSave(), energy: 101 }), null);
  assert.equal(validateSave(null), null);
  assert.equal(validateSave('a farm'), null);
});

test('validation rejects unknown items, unknown crops and tiles off the map', () => {
  assert.equal(validateSave({ ...newSave(), inventory: { gold_watch: 1 } }), null);
  const badCrop = newSave();
  badCrop.tiles['11,3'] = { tilled: true, crop: 'diamond', age: 1 };
  assert.equal(validateSave(badCrop), null);
  const offMap = newSave();
  offMap.tiles['99,99'] = { tilled: true };
  assert.equal(validateSave(offMap), null);
  const badKey = newSave();
  badKey.tiles['../../etc'] = { tilled: true };
  assert.equal(validateSave(badKey), null);
});

test('validation drops zero counts and keeps the save small and plain', () => {
  const s = newSave();
  s.inventory.turnip = 0;
  const clean = validateSave(s);
  assert.equal('turnip' in clean.inventory, false);
});

test('the store saves, loads back the same farm, and leaves no temp files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hh-farms-'));
  const store = new FarmStore(dir);
  assert.equal(await store.load(ID), null, 'nothing saved yet');
  const save = validateSave(newSave());
  await store.store(ID, save);
  assert.deepEqual(await store.load(ID), save);
  const files = await readdir(dir);
  assert.deepEqual(files, [`${ID}.json`]);
});

test('the store overwrites on the next save', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hh-farms-'));
  const store = new FarmStore(dir);
  const save = validateSave(newSave());
  await store.store(ID, save);
  save.coins = 42;
  await store.store(ID, save);
  assert.equal((await store.load(ID)).coins, 42);
});

test('a well formed guide rides along with the save', () => {
  const clean = validateSave({ ...newSave(), guide: { seen: true, off: false, done: ['buy', 'hoe'] } });
  assert.ok(clean);
  assert.deepEqual(clean.guide, { seen: true, off: false, done: ['buy', 'hoe'] });
});

test('guide step ids are filtered to the ones the game knows', () => {
  const clean = validateSave({ ...newSave(), guide: { seen: 'yes', done: ['buy', 'teleport', 'buy', 'ship'] } });
  assert.ok(clean);
  assert.deepEqual(clean.guide, { seen: false, off: false, done: ['buy', 'ship'] });
});

test('a malformed guide is dropped, not fatal to the save', () => {
  const clean = validateSave({ ...newSave(), guide: 'skip it' });
  assert.ok(clean);
  assert.equal(clean.guide, undefined);
});

test('a well formed profile rides along with the save', () => {
  const clean = validateSave({ ...newSave(), profile: { name: '  Ash Ketchum  ', gender: 'boy' } });
  assert.ok(clean);
  assert.deepEqual(clean.profile, { name: 'Ash Ketchum', gender: 'boy' });
});

test('a malformed profile is dropped, not fatal to the save', () => {
  assert.equal(validateSave({ ...newSave(), profile: { name: 'Ash', gender: 'cat' } }).profile, undefined);
  assert.equal(validateSave({ ...newSave(), profile: { name: '<script>', gender: 'girl' } }).profile, undefined);
  assert.equal(validateSave({ ...newSave(), profile: 'Ash' }).profile, undefined);
});
