// Talking to townsfolk: builds the prompt, asks the AI chain, checks the reply, and falls back to
// written lines when the AI is down. Code decides, AI talks: it only ever returns a line and a face.
import { CHARACTERS, WORLD } from './characters.js';
import { whereIs } from '../shared/schedules.js';
import { SEASONS } from '../shared/rules.js';

const MAX_SAID = 200;
const MAX_LINE = 240;
const MAX_HISTORY = 8;

// Kept gentle: a 14 year old plays this. Anything on this list in a reply sends us to a written line.
const UNSAFE = /\b(kill|murder|suicide|sex|sexy|nude|naked|drugs?|cocaine|heroin|rape|porn|fuck|shit|bitch|cunt|dick|cock|pussy|whore|slut|nazi|blood)\w*/i;
// Breaking character: no talk of being an AI or a model.
const META = /\b(as an ai|language model|i am an ai|i'm an ai|chatbot|openai|gemini|groq|anthropic|claude|gpt)\b/i;

export function clean(text, max) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Where the character is and what they are doing, from their schedule. The
 *  game works it out from the clock; the browser only says what time it is. */
export function placeLine(who, ctx) {
  const minutes = Number(ctx?.minutes);
  const day = Math.min(14, Math.max(1, Math.floor(Number(ctx?.day) || 1)));
  const season = Math.max(0, SEASONS.indexOf(String(ctx?.season ?? 'Spring')));
  const year = Math.max(1, Math.floor(Number(ctx?.year) || 1));
  if (!Number.isFinite(minutes)) return "You are out and about when the farmer walks up to you.";
  const w = whereIs(who, Math.max(0, Math.min(26 * 60, minutes)), day, season, year);
  if (!w || w.scene === 'home') return 'The farmer has caught you on your way home.';
  const place = w.scene === 'farm' ? "Hazel's farm" : 'Hollow Square, the town';
  const first = CHARACTERS[who].name.replace(/^(Mayor|Doctor|Mrs\.|Old|Captain) /, '').split(' ')[0];
  return `Where you are: ${place}. What you are doing, as others would put it: ${first} is ${w.doing}. The farmer walks up to you.`;
}

/** The prompt for one exchange. The history comes from the player's browser, so it is trimmed and fenced. */
export function buildPrompt(who, said, history, ctx) {
  const c = CHARACTERS[who];
  const hist = (Array.isArray(history) ? history : []).slice(-MAX_HISTORY)
    .map((h) => `${h.from === 'player' ? 'Farmer' : c.name.split(' ')[0]}: ${clean(h.text, MAX_LINE)}`).join('\n');
  const system = [
    WORLD,
    `You are ${c.name}, who ${c.who}`,
    `How you talk: ${c.voice}`,
    `Right now: ${clean(ctx?.time, 40) || 'morning'} on ${clean(ctx?.season, 20) || 'Spring'} day ${Number(ctx?.day) || 1}. ${placeLine(who, ctx)}`,
    'Rules: stay in character always. Reply with one or two short sentences, under 35 words, spoken out loud by you. No actions in asterisks, no stage directions, no emoji.',
    'Keep it warm and suitable for young teens: no violence, romance beyond gentle shyness, swearing or anything scary. Never mention being an AI. If the farmer says something rude or odd, react the way your character would and steer back to village life.',
    'You cannot give items, money or promises; you only talk.',
    `Answer only with JSON: {"line": "what you say", "mood": one of ${JSON.stringify(c.moods)}}`,
  ].join('\n');
  const user = [
    hist ? `The conversation so far:\n${hist}` : 'The farmer has just walked up to you.',
    said ? `The farmer says: "${clean(said, MAX_SAID)}"` : 'Greet the farmer.',
  ].join('\n\n');
  return { system, user, maxTokens: 120 };
}

/** Accepts the AI's reply only if it is a short, safe, in character line with a real face. */
export function parseReply(text, who) {
  const c = CHARACTERS[who];
  let obj;
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    obj = JSON.parse(m ? m[0] : text);
  } catch { return null; }
  let line = clean(obj?.line, 400).replace(/^["']|["']$/g, '').replace(/\*[^*]*\*/g, '').trim();
  if (!line || line.length > MAX_LINE) return null;
  if (UNSAFE.test(line) || META.test(line)) return null;
  line = line.replace(/\s[–—-]\s/g, ', ');
  const mood = c.moods.includes(obj?.mood) ? obj.mood : 'neutral';
  return { line, mood };
}

export function fallback(who, said) {
  const c = CHARACTERS[who];
  const line = c.lines[Math.floor(Math.random() * c.lines.length)];
  return { line, mood: said ? 'neutral' : 'happy' };
}

/** Per player limits: a few lines a minute each, plus a cap for the whole server per day. */
export class Limits {
  constructor(perMinute, dailyCap, now = Date.now) {
    Object.assign(this, { perMinute, dailyCap, now, hits: new Map(), day: '', today: 0 });
  }
  allow(ip) {
    const t = this.now();
    const d = new Date(t).toISOString().slice(0, 10);
    if (d !== this.day) { this.day = d; this.today = 0; this.hits.clear(); }
    const recent = (this.hits.get(ip) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= this.perMinute || this.today >= this.dailyCap) { this.hits.set(ip, recent); return false; }
    recent.push(t);
    this.hits.set(ip, recent);
    this.today++;
    return true;
  }
}

/** One exchange: returns { line, mood, by } where `by` says who wrote it (a provider, or "script"). */
export async function talk(ai, limits, ip, body) {
  const who = String(body?.who ?? '');
  if (!CHARACTERS[who]) return { status: 404, json: { error: 'nobody by that name' } };
  const said = body?.said ? clean(body.said, MAX_SAID) : '';
  if (!ai.hasProvider() || !limits.allow(ip)) return { status: 200, json: { ...fallback(who, said), by: 'script' } };
  try {
    const r = await ai.chat(buildPrompt(who, said, body?.history, body?.context), (t) => parseReply(t, who));
    return { status: 200, json: { ...r.value, by: r.provider } };
  } catch {
    return { status: 200, json: { ...fallback(who, said), by: 'script' } };
  }
}
