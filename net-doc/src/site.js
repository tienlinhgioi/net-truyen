// Máy khách web NetTruyen: đăng nhập, tải trang, gửi lượt đọc. Giữ cookie riêng cho từng tài khoản.

const UA = 'Mozilla/5.0 (Linux; Android 13; Termux) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

export class Site {
  constructor({ web, timeoutMs = 15000, fetchImpl = globalThis.fetch, signal } = {}) {
    this.web = String(web).replace(/\/+$/, '');
    this.timeoutMs = timeoutMs; this.fetch = fetchImpl; this.signal = signal;
    this.jar = new Map();
  }

  url(path) { return /^https?:\/\//i.test(path) ? path : this.web + path; }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '); }

  #store(res) {
    const list = res.headers.getSetCookie?.() ?? (res.headers.get('set-cookie') ? res.headers.get('set-cookie').split(/,(?=\s*[^;,=\s]+=)/) : []);
    for (const raw of list) {
      const parts = raw.split(';').map((p) => p.trim());
      const eq = parts[0].indexOf('=');
      if (eq < 1) continue;
      const name = parts[0].slice(0, eq), value = parts[0].slice(eq + 1);
      const gone = value === '' || parts.slice(1).some((a) => /^max-age=0*-?\d*$/i.test(a) && Number(a.split('=')[1]) <= 0);
      if (gone) this.jar.delete(name); else this.jar.set(name, value);
    }
  }

  /** Gọi một yêu cầu, tự theo chuyển hướng (và lưu cookie ở từng bước). Quá thời gian hoặc bị dừng thì ném lỗi. */
  async request(method, path, { form, referer, headers = {} } = {}) {
    let url = this.url(path), m = method, body = form ? new URLSearchParams(form).toString() : undefined;
    for (let hop = 0; hop < 6; hop++) {
      const h = { 'User-Agent': UA, 'Accept-Language': 'vi,en;q=0.8', ...headers };
      const ck = this.cookieHeader();
      if (ck) h.Cookie = ck;
      if (referer) h.Referer = referer;
      if (body !== undefined) h['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const signal = this.signal && AbortSignal.any ? AbortSignal.any([timeout, this.signal]) : timeout;
      const res = await this.fetch(url, { method: m, headers: h, body, redirect: 'manual', signal });
      this.#store(res);
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).toString(); m = 'GET'; body = undefined; continue; }
      return res;
    }
    throw new Error('Chuyển hướng quá nhiều');
  }

  /** Đăng nhập: lấy cookie phiên ở trang đăng nhập rồi gửi email/mật khẩu như nút Đăng nhập của web. */
  async login(email, password) {
    await this.request('GET', '/auth/login');
    const res = await this.request('POST', '/ajax/auth/login', { form: { email, password }, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    let d = {};
    try { d = await res.json(); } catch { /* không phải JSON */ }
    return d.status ? { ok: true, msg: d.msg } : { ok: false, msg: d.msg || `Lỗi HTTP ${res.status}` };
  }

  async getText(path) {
    const res = await this.request('GET', path);
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  /** Gửi lượt đọc chương. Web chỉ nhận khi Referer là chính trang chương đó. Không ném lỗi theo mã trả về. */
  async postView({ manga, chapter, referer }) {
    const res = await this.request('POST', '/ajax/manga/view', { form: { manga, chapter }, referer, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    return { status: res.status, text: await res.text().catch(() => '') };
  }
}
