// Kho cookie riêng cho từng tài khoản (HTTP của app không dùng chung cookie giữa các tài khoản).

export class CookieJar {
  constructor() { this.map = new Map(); }

  static from(obj) {
    const j = new CookieJar();
    for (const [k, v] of Object.entries(obj || {})) j.map.set(k, v);
    return j;
  }

  /** Nhận giá trị set-cookie: mảng, hoặc một chuỗi gộp bằng dấu phẩy. */
  update(input) {
    if (!input) return;
    const list = Array.isArray(input) ? input : String(input).split(/,(?=\s*[^\s;,=]+=)/);
    for (const raw of list) {
      const parts = raw.split(';').map((p) => p.trim());
      const eq = parts[0].indexOf('=');
      if (eq < 1) continue;
      const name = parts[0].slice(0, eq), value = parts[0].slice(eq + 1);
      let expired = value === '';
      for (const a of parts.slice(1)) {
        const [k, v] = a.split('=');
        if (/^max-age$/i.test(k) && Number(v) <= 0) expired = true;
        if (/^expires$/i.test(k) && v && Date.parse(v) < Date.now()) expired = true;
      }
      if (expired) this.map.delete(name);
      else this.map.set(name, value);
    }
  }

  header() { return [...this.map].map(([k, v]) => `${k}=${v}`).join('; '); }
  toJSON() { return Object.fromEntries(this.map); }
}
