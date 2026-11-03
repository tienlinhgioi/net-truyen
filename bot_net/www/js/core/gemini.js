// Gọi Google Gemini (generateContent), đổi key khi hết hạn mức, liệt kê mô hình.
import { KeyPool } from './keys.js';
import { limitChars } from './text.js';
import { parseImageResponse } from './media.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function buildRequest({ model, key, system, context = [], question, asker, maxOutputTokens = 512, json = false, image = false, caps = {} }) {
  const ctx = context.length ? `Tin nhắn gần đây trong phòng chat:\n${context.map((c) => `${c.name}: ${c.text}`).join('\n')}\n\n` : '';
  const who = asker ? `${asker} hỏi: ` : '';
  const useSys = !!system && caps.system !== false;
  const lead = system && !useSys ? `${system}\n\n` : '';
  const generationConfig = image
    ? { responseModalities: ['TEXT', 'IMAGE'] }
    : {
      maxOutputTokens, temperature: 0.9,
      ...(json && caps.json !== false ? { responseMimeType: 'application/json' } : {}),
      ...(caps.thinking !== false ? { thinkingConfig: { thinkingBudget: 0 } } : {}), // trả lời nhanh, không "suy nghĩ" lâu
    };
  return {
    url: `${BASE}/models/${model}:generateContent`,
    method: 'POST',
    timeout: image ? 60000 : 12000,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    data: {
      ...(useSys ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: `${lead}${ctx}${who}${question}` }] }],
      generationConfig,
    },
  };
}

const err = (kind, extra = {}) => Object.assign(new Error(kind), { kind, ...extra });

// Ghi nhớ model nào không hỗ trợ JSON / suy nghĩ tắt / hướng dẫn hệ thống để lần sau khỏi thử lại.
const CAPS = new Map();
export const capsOf = (model) => CAPS.get(model) || CAPS.set(model, {}).get(model);

/**
 * Nếu Google báo model không hỗ trợ một tính năng, tắt tính năng đó.
 * 'specific' = thông báo nêu rõ tính năng; 'generic' = chỉ báo "invalid argument", thử bỏ lần lượt từng tính năng.
 */
function downgrade(caps, status, data) {
  if (status !== 400) return null;
  const msg = String(data?.error?.message || '');
  if (/api key/i.test(msg)) return null;
  if (caps.thinking !== false && /thinking|budget/i.test(msg)) { caps.thinking = false; return 'specific'; }
  if (caps.json !== false && /json mode|responsemimetype|mime type/i.test(msg)) { caps.json = false; return 'specific'; }
  if (caps.system !== false && /developer instruction|system instruction|systeminstruction/i.test(msg)) { caps.system = false; return 'specific'; }
  if (data?.error?.status === 'INVALID_ARGUMENT' || /invalid argument/i.test(msg)) {
    for (const k of ['thinking', 'json', 'system']) if (caps[k] !== false) { caps[k] = false; return 'generic'; }
  }
  return null;
}

/** Gọi http, lỗi mạng/quá thời gian thành status 0 để xử lý như lỗi tạm. */
async function safeHttp(http, req) {
  try { return await http(req); } catch (e) { return { status: 0, headers: {}, data: { error: { message: String(e?.message || e) } } }; }
}

/** Gọi một model; nếu 400 vì tính năng không hỗ trợ thì hạ cấp và thử lại ngay (tối đa 4 lần). */
async function callModel(http, opts) {
  const caps = capsOf(opts.model);
  const trial = { ...caps };
  let generic = false;
  for (let i = 0; ; i++) {
    const res = await safeHttp(http, buildRequest({ ...opts, caps: trial }));
    // Lần thử lại sau khi hạ cấp không còn bị 400 (dù thành công hay lỗi khác) nghĩa là tính năng vừa bỏ chính là nguyên nhân
    if (generic && res.status !== 400) Object.assign(caps, trial);
    if (res.status === 200) return res;
    const d = i < 4 ? downgrade(trial, res.status, res.data) : null;
    if (!d) return res;
    if (d === 'specific') Object.assign(caps, trial); else generic = true;
  }
}

export function parseResponse(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  const text = (parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw err('blocked', { reason: json?.promptFeedback?.blockReason });
  return { text, tokens: json?.usageMetadata?.totalTokenCount ?? 0 };
}

/**
 * Đọc chi tiết lỗi của Google: reason, giới hạn số LƯỢT theo ngày/phút, thời gian chờ.
 * noQuota = có báo hạn mức nhưng không mục nào có giá trị: gói miễn phí không có hạn mức cho model này (vd model Pro).
 */
export function parseGoogleError(data) {
  const e = data?.error;
  const out = { reason: '', message: '', perDay: false, limit: 0, retryMs: 0, quotaId: '', limits: [], noQuota: false };
  if (!e || typeof e !== 'object') return out;
  out.message = String(e.message || '');
  const vs = [];
  for (const d of e.details || []) {
    if (d.reason && !out.reason) out.reason = d.reason;
    for (const v of d.violations || []) vs.push({ id: v.quotaId || '', val: Number(v.quotaValue) || 0 });
    if (d.retryDelay) out.retryMs = Math.round(parseFloat(d.retryDelay) * 1000) || 0;
  }
  const reqs = vs.filter((v) => /Requests/i.test(v.id) && v.val > 0);
  out.limits = reqs.map((v) => ({ perDay: /PerDay/i.test(v.id), limit: v.val }));
  const main = reqs.find((v) => /PerDay/i.test(v.id)) || reqs[0] || vs.find((v) => v.val > 0);
  if (main) { out.quotaId = main.id; out.perDay = /PerDay/i.test(main.id); out.limit = main.val; }
  else if (vs.length) { out.quotaId = vs[0].id; out.perDay = vs.some((v) => /PerDay/i.test(v.id)); }
  out.noQuota = vs.length > 0 && vs.every((v) => !v.val);
  return out;
}

export function classifyError(status, data) {
  const g = parseGoogleError(data);
  const txt = `${g.reason} ${g.message}`;
  if (status === 400 && (g.reason === 'API_KEY_INVALID' || /api key (not valid|expired)/i.test(g.message))) return 'invalid';
  if (status === 401) return 'invalid';
  if (status === 403) return /leaked|suspended|SERVICE_DISABLED|API_KEY/i.test(txt) ? 'invalid' : 'denied';
  if (status === 429) return 'quota';
  if (status === 400 && (data?.error?.status === 'FAILED_PRECONDITION' || /location is not supported|FAILED_PRECONDITION/i.test(txt))) return 'region';
  if (status === 404) return 'model';
  if (status === 0 || status >= 500) return 'server';
  return 'other';
}

/** Sinh câu trả lời; tự đổi sang key dự phòng khi key hiện tại hết hạn mức hoặc sai. */
export async function generate({ http, pool, model, system, context, question, asker, mode = 'text', onLimit, maxChars = 0, keyDelayMs = 3000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let serverRetries = 0, lastWhy = '';
  for (;;) {
    const key = pool.current(model);
    if (!key) throw err('nokey', { retryAt: pool.retryAt(model), why: lastWhy });
    const res = await callModel(http, { model, key, system, context, question, asker, json: mode === 'json', image: mode === 'image', maxOutputTokens: mode === 'json' ? 1024 : 512 });
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
    const g = parseGoogleError(res.data);
    if (kind === 'quota' || kind === 'invalid' || kind === 'denied') {
      if (kind === 'quota') for (const l of g.limits) onLimit?.(model, l);
      lastWhy = kind === 'invalid' ? 'API key sai hoặc bị khóa' : kind === 'denied' ? 'Google từ chối tạm thời (403)' : g.noQuota ? 'model này không có hạn mức miễn phí với key này (cần bật thanh toán hoặc đổi model)' : g.perDay ? `hết hạn mức theo ngày${g.limit ? ` (${g.limit} lượt)` : ''}` : 'hết hạn mức theo phút';
      // Theo phút: nghỉ đúng thời gian Google yêu cầu. Theo ngày: nghỉ lâu (kiểm tra lại sau 30 phút). 403 lạ: nghỉ 5 phút, không giết key.
      const cd = kind === 'quota' ? (g.retryMs || (g.perDay ? 30 * 60000 : undefined)) : kind === 'denied' ? 300000 : undefined;
      pool.fail(key, kind, model, cd);
      if (kind === 'quota' && pool.current(model)) await sleep(keyDelayMs); // key sai thì đổi ngay, không chờ
      continue;
    }
    if (kind === 'server' && serverRetries++ < 1) { await sleep(500); continue; }
    throw err(kind, { status: res.status, detail: g.message || (typeof res.data === 'string' ? res.data.slice(0, 120) : '') });
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

/**
 * Thử các model trong combo: model chết (404) bỏ qua lâu, model bận (503/quá thời gian) bỏ qua 45 giây,
 * hết hạn mức thì sang model kế. Có [hedgeMs]: model đầu chậm quá ngưỡng thì chạy song song model kế, lấy kết quả về trước.
 */
export async function generateCombo({ models, health, hedgeMs = 0, ...rest }) {
  const list = models.filter((m) => !health?.isDead(m));
  const attempt = async (model) => { const out = await generate({ ...rest, model }); health?.mark(model, true); return { ...out, model }; };
  const markFail = (model, e) => { if (e.kind === 'model') health?.mark(model, false); else if (e.kind === 'server') health?.mark(model, false, 45000); };
  const fatal = (e) => !['model', 'server', 'nokey', 'blocked'].includes(e.kind);
  const none = (nokey) => nokey || err('nomodel', { detail: models.length ? 'Tất cả model trong combo đều không dùng được' : 'Chưa chọn model' });

  if (!hedgeMs || list.length < 2) {
    let nokey = null;
    for (const model of list) {
      try { return await attempt(model); } catch (e) {
        if (fatal(e)) throw e;
        markFail(model, e);
        if (e.kind === 'nokey') nokey = e;
      }
    }
    throw none(nokey);
  }
  return new Promise((resolve, reject) => {
    let next = 0, active = 0, finished = false, nokey = null;
    const timers = [];
    const finish = (fn, v) => { if (finished) return; finished = true; timers.forEach(clearTimeout); fn(v); };
    const launch = () => {
      if (finished || next >= list.length) return;
      const model = list[next++];
      active++;
      timers.push(setTimeout(launch, hedgeMs));
      attempt(model).then((r) => finish(resolve, r)).catch((e) => {
        active--;
        if (fatal(e)) return finish(reject, e);
        markFail(model, e);
        if (e.kind === 'nokey') nokey = e;
        if (active === 0 && next < list.length) launch();
        if (!finished && active === 0 && next >= list.length) finish(reject, none(nokey));
      });
    };
    launch();
  });
}

/** Kiểm tra một model còn sống không (gửi một yêu cầu cực nhỏ), kèm độ trễ. */
export async function checkModel(http, key, model, now = () => Date.now()) {
  const t0 = now();
  const res = await callModel(http, { model, key, system: '', context: [], question: 'ping', maxOutputTokens: 8 });
  const ms = now() - t0;
  if (res.status === 200) return { alive: true, state: 'ok', ms };
  const state = classifyError(res.status, res.data);
  const g = parseGoogleError(res.data);
  const noq = state === 'quota' && g.noQuota;
  return { alive: state === 'quota' && !noq, state: noq ? 'noquota' : state, ms, status: res.status, detail: g.message, limits: state === 'quota' ? g.limits : [] };
}

/** Kiểm tra một API key: có [model] thì gửi yêu cầu thử (biết cả hạn mức), không thì dùng danh sách model. */
export async function checkKey(http, key, model, now = () => Date.now()) {
  if (model) {
    const r = await checkModel(http, key, model, now);
    return { state: r.state, ms: r.ms, status: r.status, detail: r.detail, limits: r.limits };
  }
  const t0 = now();
  const res = await http({ url: `${BASE}/models?pageSize=1`, method: 'GET', headers: { 'x-goog-api-key': key } });
  return { state: res.status === 200 ? 'ok' : classifyError(res.status, res.data), ms: now() - t0, status: res.status, detail: parseGoogleError(res.data).message };
}

/** Kiểm tra đồng loạt nhiều key, giữ thứ tự, tối đa [concurrency] yêu cầu song song. */
export async function checkKeys(http, keys, { concurrency = 2, model } = {}) {
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
