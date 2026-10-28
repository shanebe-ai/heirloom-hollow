// Heirloom Hollow: serves the game and the townsfolk's voices. No dependencies, just Node.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, config } from './server/env.js';
import { AIService, AiandProvider, GroqProvider, GeminiProvider } from './server/ai.js';
import { talk, Limits } from './server/talk.js';
import { validFarmId, validateSave, FarmStore, MAX_SAVE_BYTES } from './server/farms.js';
import { CredStore, hashPassword, passwordMatches, newDeviceToken } from './server/creds.js';
import { NameRegistry } from './server/names.js';
import { nameFold, nameIsTaken } from './shared/rules.js';

loadEnv();
const cfg = config();
const farms = new FarmStore(join(fileURLToPath(new URL('.', import.meta.url)), 'saves'));
const creds = new CredStore(join(fileURLToPath(new URL('.', import.meta.url)), 'creds'));
const names = new NameRegistry(join(fileURLToPath(new URL('.', import.meta.url)), 'saves'));
// Password guesses get six tries a minute per farm from one address:
// plenty for a farmer who mistypes, a wall for anyone fishing.
const unlockLimits = new Limits(6, Number.MAX_SAFE_INTEGER);
// Saves are cheap but not free: a player autosaves every couple of minutes,
// so 30 a minute each is generous headroom that still stops a flood.
const saveLimits = new Limits(30, Number.MAX_SAFE_INTEGER);
const ai = new AIService([
  { provider: new AiandProvider(cfg.aiand.key, cfg.aiand.model, cfg.timeoutMs, cfg.aiand.effort), rpm: cfg.aiand.rpm },
  { provider: new GroqProvider(cfg.groq.key, cfg.groq.model, cfg.timeoutMs), rpm: cfg.groq.rpm },
  { provider: new GeminiProvider(cfg.gemini.key, cfg.gemini.model, cfg.timeoutMs), rpm: cfg.gemini.rpm },
]);
const limits = new Limits(cfg.perIpPerMinute, cfg.dailyCap);

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, max = 8000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('too big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function api(req, res, path) {
  // Is this farmer name already somebody's? Asked at move in, answered
  // from the registry. A name the game keeps for its own people counts
  // as taken too.
  const nameMatch = /^\/api\/name\/(.+)$/.exec(path);
  if (nameMatch && req.method === 'GET') {
    let wanted = '';
    try {
      wanted = decodeURIComponent(nameMatch[1]);
    } catch {
      return send(res, 400, { error: 'bad name' });
    }
    await names.ready;
    const taken = nameIsTaken(wanted) || names.ownerOf(nameFold(wanted)) !== undefined;
    return send(res, 200, { taken });
  }
  const credMatch = /^\/api\/farm\/([^/]+)\/(password|unlock)$/.exec(path);
  if (credMatch && req.method === 'POST') {
    const id = credMatch[1];
    if (!validFarmId(id)) return send(res, 400, { error: 'bad farm id' });
    let body;
    try { body = JSON.parse(await readBody(req, 2000)); } catch { return send(res, 400, { error: 'bad request' }); }
    const password = typeof body?.password === 'string' ? body.password : '';
    if (credMatch[2] === 'password') {
      if (password.length < 4 || password.length > 64) return send(res, 400, { error: 'password needs 4 to 64 characters' });
      if (await creds.load(id)) return send(res, 409, { error: 'this farm already has a password' });
      const cred = await hashPassword(password);
      const token = newDeviceToken();
      await creds.addDevice(id, cred, token);
      return send(res, 201, { token });
    }
    // Unlocking: the right password earns this device a token of its own.
    if (!unlockLimits.allow(`${req.socket.remoteAddress || '?'}|${id}`)) return send(res, 429, { error: 'too many tries, rest a minute' });
    const cred = await creds.load(id);
    if (!cred) return send(res, 400, { error: 'this farm has no password' });
    if (!(await passwordMatches(password, cred))) return send(res, 401, { error: 'wrong password' });
    const token = newDeviceToken();
    await creds.addDevice(id, cred, token);
    return send(res, 200, { token });
  }
  const farmMatch = /^\/api\/farm\/(.+)$/.exec(path);
  if (farmMatch && (req.method === 'GET' || req.method === 'PUT')) {
    const id = farmMatch[1];
    if (!validFarmId(id)) return send(res, 400, { error: 'bad farm id' });
    // A farm with a password only opens, and only accepts saves, from a
    // device it trusts. Farms without one behave exactly as they always did.
    const cred = await creds.load(id);
    if (cred && !CredStore.trusts(cred, req.headers['x-farm-token'])) {
      return send(res, 401, { error: 'password required', passwordRequired: true });
    }
    if (req.method === 'GET') {
      const save = await farms.load(id);
      return save ? send(res, 200, save) : send(res, 404, { error: 'no farm with that code' });
    }
    if (!saveLimits.allow(req.socket.remoteAddress || '?')) return send(res, 429, { error: 'saving too often' });
    let body;
    try { body = JSON.parse(await readBody(req, MAX_SAVE_BYTES)); } catch { return send(res, 400, { error: 'bad request' }); }
    const existing = await farms.load(id);
    const save = validateSave(body, { existingName: existing?.profile?.name });
    if (!save) return send(res, 400, { error: 'that save does not look right' });
    // No two farmers share a name. A profile claiming a name another
    // farm owns is dropped at the door, the way any bad profile is,
    // unless the name was already this farm's own before the registry.
    if (save.profile) {
      const folded = nameFold(save.profile.name);
      const alreadyMine = typeof existing?.profile?.name === 'string' && nameFold(existing.profile.name) === folded;
      if (!(await names.tryClaim(id, folded, alreadyMine))) delete save.profile;
    }
    await farms.store(id, save);
    return send(res, 200, { ok: true });
  }
  if (path === '/api/talk' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'bad request' }); }
    const r = await talk(ai, limits, req.socket.remoteAddress || '?', body);
    return send(res, r.status, r.json);
  }
  // Which voices are switched on, and how the last call to each went. Never shows a key.
  if (path === '/api/health') return send(res, 200, { ok: true, ai: ai.status() });
  return send(res, 404, { error: 'not found' });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname);
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) throw new Error('outside');
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const body = await readFile(file);
    // Art and code are rebuilt on every deploy, so a short cache keeps phones fresh.
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
    res.end(body);
  } catch {
    if (!res.headersSent) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
  }
}).listen(cfg.port, () => {
  const on = ai.status().filter((p) => p.configured).map((p) => p.name);
  console.log(`Heirloom Hollow on port ${cfg.port}. Voices: ${on.length ? on.join(', ') : 'none, written lines only'}`);
});
