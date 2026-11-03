// Nhóm API key: key chính trước, lỗi thì chuyển key dự phòng, hồi lại sau thời gian nghỉ.

import { normalize } from './text.js';

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export class KeyPool {
  constructor(keys, { now = () => Date.now(), cooldownMs = 60000, onRecord = null } = {}) {
    this.onRecord = onRecord;
    this.keys = keys.filter(Boolean);
    this.now = now;
    this.cooldownMs = cooldownMs;
    this.state = new Map(this.keys.map((k) => [k, { until: 0, dead: false, mu: {} }]));
    this.usageData = {};
  }

  setCooldown(ms) { this.cooldownMs = ms; }

  /** Key đang dùng được (ưu tiên theo thứ tự) cho [model], hoặc null. */
  current(model) {
    const t = this.now();
    for (const k of this.keys) {
      const s = this.state.get(k);
      if (!s.dead && s.until <= t && (!model || (s.mu[model] || 0) <= t)) return k;
    }
    return null;
  }

  /** 'invalid' = key sai, loại hẳn. 'quota' kèm [model] = chỉ khóa model đó (hạn mức tính theo model). */
  fail(key, reason, model, ms) {
    const s = this.state.get(key);
    if (!s) return;
    const cd = ms ?? this.cooldownMs;
    if (reason === 'invalid') s.dead = true;
    else if (reason === 'quota' && model) s.mu[model] = this.now() + cd;
    else s.until = this.now() + cd;
  }

  /** Thời điểm sớm nhất có key dùng lại được cho [model] (null nếu không còn key nào). */
  retryAt(model) {
    let best = null;
    for (const s of this.state.values()) {
      if (s.dead) continue;
      const t = Math.max(s.until, model ? s.mu[model] || 0 : 0);
      if (best === null || t < best) best = t;
    }
    return best;
  }

  record(key, model, tokens = 0) {
    const d = dayOf(this.now());
    const day = (this.usageData[d] ??= {});
    const k = (day[key] ??= {});
    const u = (k[model] ??= { requests: 0, tokens: 0 });
    u.requests++;
    u.tokens += tokens;
    this.onRecord?.(key, model, tokens);
  }

  usage(key, model) {
    return { ...(this.usageData[dayOf(this.now())]?.[key]?.[model] ?? { requests: 0, tokens: 0 }) };
  }

  exportUsage() { return JSON.parse(JSON.stringify(this.usageData)); }
  importUsage(data) { this.usageData = data || {}; }
}

/** Tách nhiều API key từ một đoạn dán (xuống dòng, dấu phẩy, khoảng trắng), bỏ trùng và bỏ rác. */
export function parseKeys(text) {
  const out = [];
  for (const t of String(text ?? '').split(/[\s,;]+/)) if (t.length >= 20 && /^[A-Za-z0-9._\-]+$/.test(t) && !out.includes(t)) out.push(t);
  return out;
}

const PLAN_LABEL = { free: 'miễn phí', paid: 'trả phí' };
const STATE_LABEL = { ok: 'sống', quota: 'hết hạn mức', noquota: 'không có hạn mức', invalid: 'sai key khóa', denied: 'từ chối', server: 'bận', model: 'model chết', error: 'lỗi mạng' };

/** Tìm nhanh trong danh sách key theo một đoạn key, tên tài khoản, gói hoặc trạng thái. */
export function filterKeys(rows, q) {
  const n = normalize(q);
  if (!n) return rows;
  return rows.filter((r) => normalize([r.key, r.account, PLAN_LABEL[r.plan], STATE_LABEL[r.state]].filter(Boolean).join(' ')).includes(n));
}
