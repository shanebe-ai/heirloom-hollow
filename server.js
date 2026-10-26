// Heirloom Hollow: serves the game and the townsfolk's voices. No dependencies, just Node.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, config } from './server/env.js';
import { AIService, AiandProvider, GroqProvider, GeminiProvider } from './server/ai.js';
import { talk, Limits } from './server/talk.js';
import { validFarmId, validateSave, FarmStore, MAX_SAVE_BYTES } from './server/farms.js';

loadEnv();
const cfg = config();
const farms = new FarmStore(join(fileURLToPath(new URL('.', import.meta.url)), 'saves'));
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
  const farmMatch = /^\/api\/farm\/(.+)$/.exec(path);
  if (farmMatch && (req.method === 'GET' || req.method === 'PUT')) {
    const id = farmMatch[1];
    if (!validFarmId(id)) return send(res, 400, { error: 'bad farm id' });
    if (req.method === 'GET') {
      const save = await farms.load(id);
      return save ? send(res, 200, save) : send(res, 404, { error: 'no farm with that code' });
    }
    if (!saveLimits.allow(req.socket.remoteAddress || '?')) return send(res, 429, { error: 'saving too often' });
    let body;
    try { body = JSON.parse(await readBody(req, MAX_SAVE_BYTES)); } catch { return send(res, 400, { error: 'bad request' }); }
    const save = validateSave(body);
    if (!save) return send(res, 400, { error: 'that save does not look right' });
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
