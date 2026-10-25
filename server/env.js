// Reads .env next to server.js into process.env, without overriding anything already set.
// Tiny on purpose, so the server keeps zero dependencies.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadEnv(file = join(fileURLToPath(new URL('..', import.meta.url)), '.env')) {
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return; }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

const num = (v, d) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export function config() {
  const e = process.env;
  return {
    port: num(e.PORT, 3005),
    aiand: { key: e.AIAND_API_KEY || '', model: e.AIAND_MODEL || 'google/gemma-4-31b-it', effort: e.AIAND_REASONING_EFFORT ?? 'none', rpm: num(e.AIAND_RPM, 60) },
    groq: { key: e.GROQ_API_KEY || '', model: e.GROQ_MODEL || 'openai/gpt-oss-20b', rpm: num(e.GROQ_RPM, 25) },
    gemini: { key: e.GEMINI_API_KEY || '', model: e.GEMINI_MODEL || 'gemini-3.5-flash-lite', rpm: num(e.GEMINI_RPM, 12) },
    timeoutMs: num(e.AI_TIMEOUT_MS, 8000),
    perIpPerMinute: num(e.AI_PER_IP_PER_MINUTE, 20),
    dailyCap: num(e.AI_DAILY_CAP_GLOBAL, 5000),
  };
}
