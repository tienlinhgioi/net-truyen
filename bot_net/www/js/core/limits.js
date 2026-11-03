// Giới hạn lượt dùng theo model: tự học từ lỗi 429 của Google, người dùng đặt tay thì ưu tiên.

export const percentOf = (used, limit) => (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null);

const LA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Ngày tính hạn mức: Google làm mới hạn mức lúc nửa đêm giờ Thái Bình Dương, không phải nửa đêm giờ máy. */
export const quotaDay = (ms = Date.now()) => LA.format(ms);

export class LimitBook {
  constructor(user = {}) { this.user = user; this.learned = { free: {}, paid: {} }; }

  static from(learned, user = {}) {
    const b = new LimitBook(user);
    const l = learned || {};
    // Dữ liệu cũ (chưa chia gói): {model: {rpd, rpm}} coi như gói miễn phí.
    const old = Object.values(l).some((v) => v && typeof v === 'object' && ('rpd' in v || 'rpm' in v));
    b.learned = old ? { free: l, paid: {} } : { free: l.free || {}, paid: l.paid || {} };
    return b;
  }

  setUser(user) { this.user = user || {}; }

  /** {perDay, limit} lấy từ lỗi hạn mức: perDay=true là giới hạn lượt mỗi ngày, ngược lại là mỗi phút. */
  learn(model, { perDay, limit }, plan = 'free') {
    if (!limit) return;
    const l = ((this.learned[plan === 'paid' ? 'paid' : 'free']) [model] ??= {});
    if (perDay) l.rpd = limit; else l.rpm = limit;
  }

  /** Giới hạn của model theo gói của key (chưa rõ gói thì dùng số đã học của gói miễn phí); số người dùng đặt tay luôn ưu tiên. */
  get(model, plan) {
    const u = this.user[model] || {}, l = this.learned[plan === 'paid' ? 'paid' : 'free'][model] || {};
    const out = { rpd: u.rpd || l.rpd || 0, rpm: u.rpm || l.rpm || 0 };
    if (!u.rpd && !u.rpm && (l.rpd || l.rpm)) out.learned = true;
    return out;
  }

  toJSON() { return JSON.parse(JSON.stringify(this.learned)); }
}
