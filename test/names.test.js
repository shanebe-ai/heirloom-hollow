// The name registry: no two farmers anywhere share a name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NameRegistry } from '../server/names.js';
import { newSave } from '../shared/rules.js';

const A = '123e4567-e89b-42d3-a456-426614174001';
const B = '123e4567-e89b-42d3-a456-426614174002';
const C = '123e4567-e89b-42d3-a456-426614174003';

async function seededDir() {
  const dir = await mkdtemp(join(tmpdir(), 'hh-names-'));
  const save = (name) => JSON.stringify({ ...newSave(), profile: { name, gender: 'girl' } });
  await writeFile(join(dir, `${A}.json`), save('Ash'));
  await writeFile(join(dir, `${B}.json`), save('Beth'));
  await writeFile(join(dir, `${C}.json`), JSON.stringify(newSave())); // no farmer yet
  await writeFile(join(dir, 'broken.json'), '{not json');
  return dir;
}

test('the registry is rebuilt from the saves at startup', async () => {
  const reg = new NameRegistry(await seededDir());
  await reg.ready;
  assert.equal(reg.ownerOf('ash'), A);
  assert.equal(reg.ownerOf('beth'), B);
  assert.equal(reg.ownerOf('cora'), undefined);
});

test('a taken name cannot be claimed, folded or not', async () => {
  const reg = new NameRegistry(await seededDir());
  assert.equal(await reg.tryClaim(C, 'ash'), false);
  assert.equal(await reg.tryClaim(C, 'ASH'), false);
  assert.equal(await reg.tryClaim(C, 'Ásh'), false);
  assert.equal(reg.ownerOf('ash'), A);
});

test('a free name is claimed, and changing names frees the old one', async () => {
  const reg = new NameRegistry(await seededDir());
  assert.equal(await reg.tryClaim(C, 'cora'), true);
  assert.equal(reg.ownerOf('cora'), C);
  assert.equal(await reg.tryClaim(C, 'dana'), true);
  assert.equal(reg.ownerOf('cora'), undefined);
  assert.equal(reg.ownerOf('dana'), C);
  assert.equal(await reg.tryClaim(C, 'dana'), true); // her own name, again
});

test('a farmer who had the name before the registry keeps it', async () => {
  const reg = new NameRegistry(await seededDir());
  assert.equal(await reg.tryClaim(B, 'ash', true), true);
  assert.equal(reg.ownerOf('ash'), A); // the registry still points at the first
  assert.equal(await reg.tryClaim(B, 'ash'), false); // but only grandfathered saves pass
});
