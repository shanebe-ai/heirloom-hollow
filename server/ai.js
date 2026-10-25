// The AI chain, the same as Gallowmere's: ai& first, then Groq, then Gemini.
// Each has its own rate guard and timeout. If all three fail the caller uses written lines.

export class RateBucket {
  constructor(perMinute, now = Date.now) {
    this.perMinute = perMinute;
    this.now = now;
    this.tokens = perMinute;
    this.last = now();
  }
  take() {
    const t = this.now();
    this.tokens = Math.min(this.perMinute, this.tokens + ((t - this.last) / 60000) * this.perMinute);
    this.last = t;
    if (this.tokens >= 1) { this.tokens -= 1; return true; }
    return false;
  }
}

async function failed(res, who) {
  const body = await res.text();
  return new Error(`${who} API error ${res.status}: ${body.slice(0, 200)}`);
}

/** ai& (aiand.com): open models behind an OpenAI style API. Thinking models are asked not to think. */
export class AiandProvider {
  constructor(key, model, timeoutMs, effort = 'none') {
    Object.assign(this, { name: 'aiand', key, model, timeoutMs, effort });
    this.effortFor = new Map();
  }
  isConfigured() { return this.key.length > 0; }
  async chat(req, signal) {
    const known = this.effortFor.get(this.model);
    const efforts = known !== undefined ? [known] : [...new Set([this.effort, 'low', ''])];
    let res;
    for (const [i, effort] of efforts.entries()) {
      res = await fetch('https://api.aiand.com/v1/chat/completions', {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
          temperature: 0.9,
          max_tokens: req.maxTokens * 4,
          ...(effort ? { reasoning_effort: effort } : {}),
          response_format: { type: 'json_object' },
        }),
      });
      // Some models refuse a thinking setting: try the next one down.
      if (res.status === 400 && effort && i < efforts.length - 1) {
        const body = await res.text();
        if (/reasoning/i.test(body)) continue;
        throw new Error(`aiand API error 400: ${body.slice(0, 200)}`);
      }
      if (res.ok) this.effortFor.set(this.model, effort);
      break;
    }
    if (!res.ok) throw await failed(res, 'aiand');
    const data = await res.json();
    return (data.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
}

export class GroqProvider {
  constructor(key, model, timeoutMs) { Object.assign(this, { name: 'groq', key, model, timeoutMs }); }
  isConfigured() { return this.key.length > 0; }
  async chat(req, signal) {
    const thinks = this.model.includes('gpt-oss');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
        temperature: 0.8,
        max_tokens: thinks ? req.maxTokens * 4 : req.maxTokens,
        ...(thinks ? { reasoning_effort: 'low' } : {}),
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw await failed(res, 'Groq');
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
}

export class GeminiProvider {
  constructor(key, model, timeoutMs) { Object.assign(this, { name: 'gemini', key, model, timeoutMs }); }
  isConfigured() { return this.key.length > 0; }
  async chat(req, signal) {
    // The key goes in a header, never the URL, so it can't land in a log.
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: req.maxTokens * 4, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw await failed(res, 'Gemini');
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.find((p) => p.text && !p.thought)?.text ?? '';
  }
}

/** Tries each provider in order and returns the first reply that passes `validate`. */
export class AIService {
  constructor(entries) {
    this.slots = entries.map(({ provider, rpm }) => ({ provider, bucket: new RateBucket(rpm) }));
    this.last = new Map();
  }
  hasProvider() { return this.slots.some((s) => s.provider.isConfigured()); }
  status() {
    return this.slots.map(({ provider }) => ({ name: provider.name, model: provider.model, configured: provider.isConfigured(), last: this.last.get(provider.name) }));
  }
  async chat(req, validate = () => true) {
    const attempts = [];
    const note = (a) => { attempts.push(a); this.last.set(a.provider, { ok: a.ok, at: Date.now(), error: a.error, latencyMs: a.latencyMs }); };
    for (const { provider, bucket } of this.slots) {
      if (!provider.isConfigured()) continue;
      if (!bucket.take()) { note({ provider: provider.name, ok: false, error: 'rate guard', latencyMs: 0 }); continue; }
      for (let tries = 0; tries < 2; tries++) {
        const started = Date.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), provider.timeoutMs);
        try {
          const text = await provider.chat(req, ctrl.signal);
          const latencyMs = Date.now() - started;
          const value = validate(text);
          if (!value) { note({ provider: provider.name, ok: false, error: 'invalid reply', latencyMs }); continue; }
          note({ provider: provider.name, ok: true, latencyMs });
          return { value, provider: provider.name, model: provider.model, latencyMs, attempts };
        } catch (err) {
          note({ provider: provider.name, ok: false, error: ctrl.signal.aborted ? 'timeout' : String(err?.message ?? err).slice(0, 200), latencyMs: Date.now() - started });
          break; // network or API trouble: straight on to the next provider
        } finally {
          clearTimeout(timer);
        }
      }
    }
    const err = new Error('All AI providers unavailable');
    err.attempts = attempts;
    throw err;
  }
}
