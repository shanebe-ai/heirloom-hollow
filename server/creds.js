// Farm passwords, kept apart from the saves themselves. A password is a
// salted scrypt hash (Node's built in crypto, no dependencies), and each
// phone or browser that opens the farm holds a random device token. Only
// the token's hash is stored, so the file on disk can neither unlock a
// farm nor reveal a password.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const MAX_DEVICES = 8;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return { salt: salt.toString('hex'), hash: Buffer.from(derived).toString('hex') };
}

export async function passwordMatches(password, cred) {
  if (!cred || typeof cred.salt !== 'string' || typeof cred.hash !== 'string') return false;
  const derived = Buffer.from(await scryptAsync(password, Buffer.from(cred.salt, 'hex'), 64));
  const stored = Buffer.from(cred.hash, 'hex');
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}

export function newDeviceToken() {
  return randomBytes(32).toString('hex');
}

export function tokenHash(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export class CredStore {
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

  async store(id, cred) {
    await this.ready;
    const tmp = `${this.path(id)}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(cred));
    await rename(tmp, this.path(id));
  }

  /** Remember one more trusted device for this farm, oldest forgotten past the cap. */
  async addDevice(id, cred, token) {
    const devices = Array.isArray(cred.devices) ? cred.devices : [];
    devices.push(tokenHash(token));
    cred.devices = devices.slice(-MAX_DEVICES);
    await this.store(id, cred);
  }

  /** True when this device token is trusted for this farm. */
  static trusts(cred, token) {
    if (!cred || !token || !Array.isArray(cred.devices)) return false;
    return cred.devices.includes(tokenHash(token));
  }
}
