// Gọi Google Gemini (generateContent), đổi key khi hết hạn mức, liệt kê mô hình.
import { KeyPool } from './keys.js';
import { limitChars } from './text.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function buildRequest({ model, key, system, context = [], question, asker, maxOutputTokens = 512 }) {
  const ctx = context.length ? `Tin nhắn gần đây trong phòng chat:\n${context.map((c) => `${c.name}: ${c.text}`).join('\n')}\n\n` : '';
  const who = asker ? `${asker} hỏi: ` : '';
  return {
    url: `${BASE}/models/${model}:generateContent`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    data: {
      systemInstruction: { parts: [{ text: system || '' }] },
      contents: [{ role: 'user', parts: [{ text: `${ctx}${who}${question}` }] }],
      generationConfig: { maxOutputTokens, temperature: 0.9 },
    },
  };
}

const err = (kind, extra = {}) => Object.assign(new Error(kind), { kind, ...extra });

export function parseResponse(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  const text = (parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw err('blocked', { reason: json?.promptFeedback?.blockReason });
  return { text, tokens: json?.usageMetadata?.totalTokenCount ?? 0 };
}

export function classifyError(status, data) {
  const msg = String(data?.error?.message || '');
  if (status === 429) return 'quota';
  if (status === 400 && /api key/i.test(msg)) return 'invalid';
  if (status === 401 || status === 403) return 'invalid';
  if (status === 404) return 'model';
  if (status >= 500) return 'server';
  return 'other';
}

/** Sinh câu trả lời; tự đổi sang key dự phòng khi key hiện tại hết hạn mức hoặc sai. */
export async function generate({ http, pool, model, system, context, question, asker, maxChars = 0, keyDelayMs = 3000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let serverRetries = 0;
  for (;;) {
    const key = pool.current();
    if (!key) throw err('nokey', { retryAt: pool.retryAt() });
    const res = await http(buildRequest({ model, key, system, context, question, asker }));
    if (res.status === 200) {
      const out = parseResponse(res.data);
      pool.record(key, model, out.tokens);
      return { text: limitChars(out.text, maxChars), tokens: out.tokens, key };
    }
    const kind = classifyError(res.status, res.data);
    if (kind === 'quota' || kind === 'invalid') {
      pool.fail(key, kind);
      if (pool.current()) await sleep(keyDelayMs);
      continue;
    }
    if (kind === 'server' && serverRetries++ < 2) { await sleep(1500); continue; }
    throw err(kind, { status: res.status, detail: res.data?.error?.message });
  }
}

export async function listModels(http, key) {
  const res = await http({ url: `${BASE}/models?pageSize=1000`, method: 'GET', headers: { 'x-goog-api-key': key } });
  if (res.status !== 200) throw err(classifyError(res.status, res.data), { status: res.status });
  return (res.data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), displayName: m.displayName, inputTokenLimit: m.inputTokenLimit, outputTokenLimit: m.outputTokenLimit, description: m.description }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export { KeyPool };
