// Farm passwords: hashing, checking, and device tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, passwordMatches, newDeviceToken, tokenHash, CredStore } from '../server/creds.js';

test('a password checks out against its own hash and no other', async () => {
  const cred = await hashPassword('bramble patch');
  assert.equal(await passwordMatches('bramble patch', cred), true);
  assert.equal(await passwordMatches('bramble', cred), false);
  assert.equal(await passwordMatches('bramble patch', null), false);
  const other = await hashPassword('bramble patch');
  assert.notEqual(other.hash, cred.hash); // salted, so the same words hash differently
});

test('device tokens are trusted by hash, never by the raw value stored', async () => {
  const cred = await hashPassword('pw');
  cred.devices = [];
  const token = newDeviceToken();
  cred.devices.push(tokenHash(token));
  assert.equal(CredStore.trusts(cred, token), true);
  assert.equal(CredStore.trusts(cred, newDeviceToken()), false);
  assert.equal(CredStore.trusts(cred, ''), false);
  assert.equal(CredStore.trusts(null, token), false);
  assert.ok(!JSON.stringify(cred).includes(token)); // the token itself is never stored
});

test('the cred store round trips through its folder', async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const store = new CredStore(await mkdtemp(join(tmpdir(), 'hh-creds-')));
  const id = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(await store.load(id), null);
  const cred = await hashPassword('pw');
  const token = newDeviceToken();
  await store.addDevice(id, cred, token);
  const back = await store.load(id);
  assert.equal(await passwordMatches('pw', back), true);
  assert.equal(CredStore.trusts(back, token), true);
});
