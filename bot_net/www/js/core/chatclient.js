// Máy khách chat NetTruyen: đăng nhập, đọc và gửi tin, mỗi tài khoản một kho cookie.
import { CookieJar } from './cookies.js';

const form = (o) => new URLSearchParams(o).toString();
const json = (d) => { if (typeof d !== 'string') return d; try { return JSON.parse(d); } catch { return {}; } };

export function parseProfile(html) {
  const img = /<img[^>]*class="[^"]*\buser-img\b[^"]*"[^>]*>/i.exec(html)?.[0] || '';
  const avatar = /\ssrc="([^"]+)"/i.exec(img)?.[1];
  const inp = /<input[^>]*name="user-name"[^>]*>/i.exec(html)?.[0] || '';
  const name = /\svalue="([^"]*)"/i.exec(inp)?.[1];
  return { avatar, name };
}

export class ChatClient {
  constructor({ http, base = 'https://nettruyen15s.com', jar = new CookieJar() }) {
    this.http = http; this.base = base; this.jar = jar;
  }

  async #req(method, path, data, extra = {}) {
    const headers = { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', ...extra };
    const cookie = this.jar.header();
    if (cookie) headers.Cookie = cookie;
    if (data !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    const res = await this.http({ url: this.base + path, method, headers, data: data === undefined ? undefined : form(data) });
    const sc = Object.entries(res.headers || {}).find(([k]) => k.toLowerCase() === 'set-cookie')?.[1];
    this.jar.update(sc);
    return { ...res, data: res.data };
  }

  async login(email, password) {
    await this.#req('GET', '/auth/login');
    const r = await this.#req('POST', '/ajax/auth/login', { email, password });
    const d = json(r.data);
    return d.status ? { ok: true, msg: d.msg } : { ok: false, msg: d.msg || `Lỗi ${r.status}` };
  }

  async profile() {
    const r = await this.#req('GET', '/user/profile');
    return typeof r.data === 'string' ? parseProfile(r.data) : {};
  }

  async listChat() {
    const r = await this.#req('GET', '/ajax/chat/list');
    const d = json(r.data);
    if (r.status !== 200 || !d.status) throw Object.assign(new Error('chat-list'), { status: r.status });
    return d.data || [];
  }

  /** Tìm truyện theo tên (như ô tìm kiếm của nút Gửi truyện). */
  async searchManga(q) {
    const r = await this.#req('POST', '/ajax/search', { search: q });
    const d = json(r.data);
    return (d.list || []).map((m) => ({ slug: String(m.url || '').split('/manga/')[1] || '', name: m.name })).filter((m) => m.slug);
  }

  async sendChat(message) {
    const r = await this.#req('POST', '/ajax/chat/send', { message, reply_id: '' });
    const d = json(r.data);
    return { ok: !!d.status, msg: d.message ?? d.msg };
  }
}
