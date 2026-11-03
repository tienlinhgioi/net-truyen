// Nhóm API key: key chính trước, lỗi thì chuyển key dự phòng, hồi lại sau thời gian nghỉ.

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export class KeyPool {
  constructor(keys, { now = () => Date.now(), cooldownMs = 60000 } = {}) {
    this.keys = keys.filter(Boolean);
    this.now = now;
    this.cooldownMs = cooldownMs;
    this.state = new Map(this.keys.map((k) => [k, { until: 0, dead: false }]));
    this.usageData = {};
  }

  setCooldown(ms) { this.cooldownMs = ms; }

  /** Key đang dùng được (ưu tiên theo thứ tự), hoặc null. */
  current() {
    const t = this.now();
    for (const k of this.keys) {
      const s = this.state.get(k);
      if (!s.dead && s.until <= t) return k;
    }
    return null;
  }

  /** 'invalid' = key sai, loại hẳn; lý do khác = nghỉ một lúc rồi thử lại. */
  fail(key, reason) {
    const s = this.state.get(key);
    if (!s) return;
    if (reason === 'invalid') s.dead = true;
    else s.until = this.now() + this.cooldownMs;
  }

  /** Thời điểm sớm nhất có key dùng lại được (null nếu không còn key nào). */
  retryAt() {
    let best = null;
    for (const s of this.state.values()) if (!s.dead && (best === null || s.until < best)) best = s.until;
    return best;
  }

  record(key, model, tokens = 0) {
    const d = dayOf(this.now());
    const day = (this.usageData[d] ??= {});
    const k = (day[key] ??= {});
    const u = (k[model] ??= { requests: 0, tokens: 0 });
    u.requests++;
    u.tokens += tokens;
  }

  usage(key, model) {
    return { ...(this.usageData[dayOf(this.now())]?.[key]?.[model] ?? { requests: 0, tokens: 0 }) };
  }

  exportUsage() { return JSON.parse(JSON.stringify(this.usageData)); }
  importUsage(data) { this.usageData = data || {}; }
}
