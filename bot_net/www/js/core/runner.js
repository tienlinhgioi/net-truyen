// Bộ chạy bot cho từng tài khoản: đọc chat, nhận lệnh/tên, hỏi Gemini, gửi trả lời.
import { ChatClient } from './chatclient.js';
import { CookieJar } from './cookies.js';
import { KeyPool } from './keys.js';
import { generate } from './gemini.js';
import { decideReplies } from './decide.js';
import { isActive } from './schedule.js';
import { normalize } from './text.js';

/** Tập các tài khoản bot (theo user_id chat hoặc tên hiển thị) để chống vòng lặp. */
export class BotSet {
  constructor() { this.ids = new Set(); this.names = new Set(); }
  add(acc) {
    if (acc.chatUserId) this.ids.add(acc.chatUserId);
    const n = normalize(acc.displayName || acc.name);
    if (n) this.names.add(n);
  }
  has(userId, msg) { return this.ids.has(userId) || (!!msg && this.names.has(normalize(msg.name))); }
}

const RATE = /nhanh|chậm|đợi|vui lòng|wait|spam|giới hạn/i;
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function buildSystem(account, settings) {
  const max = account.maxChars || settings.maxChars;
  const who = account.displayName || account.name || 'một thành viên';
  return [
    account.prompt || '',
    `Bạn đang chat trong phòng chat công khai về truyện tranh NetTruyen với tên "${who}".`,
    'Trả lời bằng tiếng Việt, tự nhiên, ngắn gọn như người nhắn tin, một đoạn duy nhất, không dùng định dạng markdown.',
    max ? `Mỗi câu trả lời tối đa ${max} ký tự.` : '',
  ].filter(Boolean).join('\n');
}

export class AccountBot {
  constructor({ account, getSettings, http, bots, now = () => new Date(), sleep = realSleep, log = () => {}, save = () => {} }) {
    this.account = account; this.getSettings = getSettings; this.http = http; this.bots = bots;
    this.now = now; this.sleep = sleep; this.log = (text, level = 'info') => log({ t: Date.now(), level, text, acc: account.id });
    this.saveAcc = save;
    this.client = new ChatClient({ http, jar: CookieJar.from(account.cookies) });
    this.pool = new KeyPool(account.keys || []);
    this.lastId = null; this.pending = []; this.lastSent = null; this.delay = null; this.running = false;
    this.stats = account.stats || (account.stats = { sent: 0, errors: 0, lastAt: 0 });
    bots.add(account);
  }

  persist() { this.account.cookies = this.client.jar.toJSON(); this.saveAcc(this.account); }

  async connect() {
    this.log('Đang đăng nhập...');
    this.client.jar = new CookieJar();
    const r = await this.client.login(this.account.email, this.account.password);
    if (!r.ok) throw new Error(`Đăng nhập thất bại: ${r.msg}`);
    try {
      const p = await this.client.profile();
      if (p.avatar) this.account.avatar = p.avatar;
      if (p.name) { this.account.displayName = p.name; if (!this.account.name) this.account.name = p.name; }
    } catch { /* không bắt buộc */ }
    this.bots.add(this.account);
    this.persist();
    this.log('Đã đăng nhập');
  }

  #learn(list) {
    if (this.account.chatUserId || !this.lastSent) return;
    const me = normalize(this.account.displayName || this.account.name);
    const hit = list.find((m) => normalize(m.name) === me && String(m.message).trim() === this.lastSent);
    if (hit) { this.account.chatUserId = hit.user_id; this.bots.add(this.account); this.persist(); }
  }

  /** Một vòng: kiểm tra lịch, đọc chat, xếp việc, xử lý việc đang chờ. */
  async tick() {
    const st = this.getSettings();
    if (!isActive(this.now(), st.schedule)) return;
    if (!this.client.jar.header()) {
      try { await this.connect(); } catch (e) { this.log(e.message, 'error'); this.stats.errors++; await this.sleep(st.reconnectDelayMs); return; }
    }
    let list;
    try { list = await this.client.listChat(); } catch {
      this.log('Mất kết nối, sẽ đăng nhập lại', 'warn');
      this.client.jar = new CookieJar();
      await this.sleep(st.reconnectDelayMs);
      return;
    }
    this.#learn(list);
    const r = decideReplies({ messages: list, account: this.account, lastId: this.lastId, bots: this.bots, maxChain: st.maxChain, contextSize: st.contextSize });
    this.lastId = r.lastId;
    const blocked = (st.blockedWords || []).map(normalize).filter(Boolean);
    for (const t of r.tasks) {
      if (blocked.some((w) => normalize(t.question).includes(w))) { this.log(`Bỏ qua câu có từ cấm (từ ${t.from})`, 'warn'); continue; }
      if (!this.pending.some((p) => p.id === t.id)) this.pending.push(t);
    }
    await this.#drain(st);
  }

  async #drain(st) {
    const model = this.account.model || st.model;
    if (this.pending.length && !model) { this.log('Chưa chọn mô hình Gemini', 'error'); return; }
    this.delay ??= st.chatDelayMs;
    while (this.pending.length) {
      const task = this.pending[0];
      let out;
      try {
        out = await generate({
          http: this.http, pool: this.pool, model, system: buildSystem(this.account, st), context: task.context,
          question: task.question, asker: task.from, maxChars: this.account.maxChars || st.maxChars, keyDelayMs: st.keyDelayMs, sleep: this.sleep,
        });
      } catch (e) {
        if (e.kind === 'nokey') this.log('Hết API key khả dụng, sẽ thử lại sau', 'error');
        else if (e.kind === 'blocked') { this.log('Gemini từ chối trả lời câu này, bỏ qua', 'warn'); this.pending.shift(); continue; }
        else this.log(`Lỗi Gemini: ${e.kind}${e.detail ? ' - ' + e.detail : ''}`, 'error');
        this.stats.errors++;
        return;
      }
      await this.sleep(this.delay);
      let sent = false;
      for (let attempt = 0; attempt < 3 && !sent; attempt++) {
        const r = await this.client.sendChat(out.text);
        if (r.ok) sent = true;
        else if (RATE.test(r.msg || '')) {
          this.delay = Math.min(this.delay * 2, 60000);
          this.log(`Web báo gửi quá nhanh, tăng delay lên ${this.delay / 1000}s`, 'warn');
          await this.sleep(this.delay);
        } else { this.log(`Gửi thất bại: ${r.msg || 'không rõ'}`, 'error'); break; }
      }
      this.pending.shift();
      if (sent) { this.lastSent = out.text; this.stats.sent++; this.stats.lastAt = Date.now(); this.log(`Đã trả lời ${task.from}: ${out.text}`); }
      else this.stats.errors++;
      this.persist();
    }
  }

  async start() {
    this.running = true;
    while (this.running) {
      try { await this.tick(); } catch (e) { this.log(`Lỗi: ${e.message}`, 'error'); }
      await this.sleep(this.getSettings().pollMs);
    }
  }

  stop() { this.running = false; }
}
