// Gọi Google Gemini (generateContent), đổi key khi hết hạn mức, liệt kê mô hình.
import { KeyPool } from './keys.js';
import { limitChars } from './text.js';
import { parseImageResponse } from './media.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function buildRequest({ model, key, system, context = [], question, asker, maxOutputTokens = 512, json = false, image = false }) {
  const ctx = context.length ? `Tin nhắn gần đây trong phòng chat:\n${context.map((c) => `${c.name}: ${c.text}`).join('\n')}\n\n` : '';
  const who = asker ? `${asker} hỏi: ` : '';
  return {
    url: `${BASE}/models/${model}:generateContent`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    data: {
      systemInstruction: { parts: [{ text: system || '' }] },
      contents: [{ role: 'user', parts: [{ text: `${ctx}${who}${question}` }] }],
      generationConfig: image ? { responseModalities: ['TEXT', 'IMAGE'] } : { maxOutputTokens, temperature: 0.9, ...(json ? { responseMimeType: 'application/json' } : {}) },
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
export async function generate({ http, pool, model, system, context, question, asker, mode = 'text', maxChars = 0, keyDelayMs = 3000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let serverRetries = 0;
  for (;;) {
    const key = pool.current(model);
    if (!key) throw err('nokey', { retryAt: pool.retryAt(model) });
    const res = await http(buildRequest({ model, key, system, context, question, asker, json: mode === 'json', image: mode === 'image', maxOutputTokens: mode === 'json' ? 1024 : 512 }));
    if (res.status === 200) {
      if (mode === 'image') {
        let image;
        try { image = parseImageResponse(res.data); } catch { throw err('blocked', { reason: 'noimage' }); }
        pool.record(key, model, res.data?.usageMetadata?.totalTokenCount ?? 0);
        return { image, tokens: res.data?.usageMetadata?.totalTokenCount ?? 0, key };
      }
      const out = parseResponse(res.data);
      pool.record(key, model, out.tokens);
      return { text: mode === 'json' ? out.text : limitChars(out.text, maxChars), tokens: out.tokens, key };
    }
    const kind = classifyError(res.status, res.data);
    if (kind === 'quota' || kind === 'invalid') {
      pool.fail(key, kind, model);
      if (pool.current(model)) await sleep(keyDelayMs);
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

/** Thử lần lượt các model trong combo; model chết (404/lỗi máy chủ) bị bỏ qua, hết hạn mức thì sang model kế. */
export async function generateCombo({ models, health, ...rest }) {
  let last = null;
  for (const model of models) {
    if (health?.isDead(model)) continue;
    try {
      const out = await generate({ ...rest, model });
      health?.mark(model, true);
      return { ...out, model };
    } catch (e) {
      if (e.kind === 'model' || e.kind === 'server') { health?.mark(model, false); last = last?.kind === 'nokey' ? last : e; continue; }
      if (e.kind === 'nokey') { last = e; continue; }
      throw e;
    }
  }
  if (last?.kind === 'nokey') throw last;
  throw err('nomodel', { detail: models.length ? 'Tất cả model trong combo đều không dùng được' : 'Chưa chọn model' });
}

/** Kiểm tra một model còn sống không (gửi một yêu cầu cực nhỏ), kèm độ trễ. */
export async function checkModel(http, key, model, now = () => Date.now()) {
  const t0 = now();
  const res = await http(buildRequest({ model, key, system: '', context: [], question: 'ping', maxOutputTokens: 1 }));
  const ms = now() - t0;
  if (res.status === 200) return { alive: true, state: 'ok', ms };
  const state = classifyError(res.status, res.data);
  return { alive: state === 'quota', state, ms };
}

/** Kiểm tra một API key: có [model] thì gửi yêu cầu thử (biết cả hạn mức), không thì dùng danh sách model. */
export async function checkKey(http, key, model, now = () => Date.now()) {
  if (model) {
    const r = await checkModel(http, key, model, now);
    return { state: r.state, ms: r.ms };
  }
  const t0 = now();
  const res = await http({ url: `${BASE}/models?pageSize=1`, method: 'GET', headers: { 'x-goog-api-key': key } });
  return { state: res.status === 200 ? 'ok' : classifyError(res.status, res.data), ms: now() - t0 };
}

/** Kiểm tra đồng loạt nhiều key, giữ thứ tự, tối đa [concurrency] yêu cầu song song. */
export async function checkKeys(http, keys, { concurrency = 3, model } = {}) {
  const out = new Array(keys.length);
  let i = 0;
  const worker = async () => {
    while (i < keys.length) {
      const idx = i++;
      try { out[idx] = { key: keys[idx], ...(await checkKey(http, keys[idx], model)) }; }
      catch { out[idx] = { key: keys[idx], state: 'error', ms: 0 }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker));
  return out;
}

export { KeyPool };
