// Giới hạn lượt dùng theo model: tự học từ lỗi 429 của Google, người dùng đặt tay thì ưu tiên.

export const percentOf = (used, limit) => (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null);

export class LimitBook {
  constructor(user = {}) { this.user = user; this.learned = {}; }
  static from(learned, user = {}) { const b = new LimitBook(user); b.learned = learned || {}; return b; }
  setUser(user) { this.user = user || {}; }

  /** {perDay, limit} lấy từ lỗi hạn mức: perDay=true là giới hạn lượt mỗi ngày, ngược lại là mỗi phút. */
  learn(model, { perDay, limit }) {
    if (!limit) return;
    const l = (this.learned[model] ??= {});
    if (perDay) l.rpd = limit; else l.rpm = limit;
  }

  get(model) {
    const u = this.user[model] || {}, l = this.learned[model] || {};
    const out = { rpd: u.rpd || l.rpd || 0, rpm: u.rpm || l.rpm || 0 };
    if (!u.rpd && !u.rpm && (l.rpd || l.rpm)) out.learned = true;
    return out;
  }

  toJSON() { return JSON.parse(JSON.stringify(this.learned)); }
}
