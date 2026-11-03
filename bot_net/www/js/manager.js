// Quản lý nhiều tài khoản bot: bật/tắt, nhật ký, lưu cấu hình, dịch vụ nền.
import { Store, defaultAccount } from './core/store.js';
import { AccountBot, BotSet, buildSystem } from './core/runner.js';
import { ChatClient } from './core/chatclient.js';
import { generate, listModels } from './core/gemini.js';
import { KeyPool } from './core/keys.js';

export class Manager {
  constructor({ adapter, http, service = null, sleep }) {
    this.store = new Store(adapter);
    this.http = http; this.service = service; this.sleep = sleep;
    this.bots = new Map();
    this.botSet = new BotSet();
    this.logs = [];
    this.usage = {};
    this.listeners = new Set();
    this.saveTimer = null;
  }

  async init() {
    await this.store.load();
    this.usage = this.store.usage || {};
    for (const a of this.store.accounts) this.botSet.add(a);
    for (const a of this.store.accounts) if (a.enabled) this.#spawn(a);
    this.#syncService();
    return this;
  }

  get settings() { return this.store.settings; }
  get accounts() { return this.store.accounts; }
  account(id) { return this.accounts.find((a) => a.id === id); }
  isRunning(id) { return this.bots.has(id); }
  runningAccounts() { return this.accounts.filter((a) => this.bots.has(a.id)); }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const f of this.listeners) f(type, data); }

  log(entry) {
    this.logs.push(entry);
    if (this.logs.length > 300) this.logs.shift();
    this.emit('log', entry);
  }

  /** Lưu có trễ 300ms, gom nhiều thay đổi liên tiếp thành một lần ghi (không bị dồn mãi). */
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
  }

  async saveNow() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    for (const b of this.bots.values()) this.#mergeUsage(b.pool.exportUsage());
    this.store.usage = this.usage;
    await this.store.adapter.set('botnet', JSON.stringify({ settings: this.store.settings, accounts: this.store.accounts, usage: this.usage }));
  }

  #mergeUsage(u) {
    for (const [day, keys] of Object.entries(u)) this.usage[day] = keys;
  }

  #spawn(account) {
    if (this.bots.has(account.id)) return;
    const bot = new AccountBot({
      account, getSettings: () => this.store.settings, http: this.http, bots: this.botSet,
      sleep: this.sleep, log: (l) => this.log(l), save: () => { this.save(); this.emit('account', account); },
    });
    bot.pool.importUsage(JSON.parse(JSON.stringify(this.usage)));
    this.bots.set(account.id, bot);
    bot.start();
  }

  #kill(id) {
    this.bots.get(id)?.stop();
    this.bots.delete(id);
  }

  #syncService() {
    if (!this.service) return;
    const n = this.bots.size;
    if (n > 0 && this.store.settings.runInBackground) this.service.start(`${n} tài khoản đang hoạt động`);
    else this.service.stop();
  }

  async addAccount({ email, password }) {
    const acc = { ...defaultAccount(), email, password };
    const c = new ChatClient({ http: this.http });
    const r = await c.login(email, password);
    if (!r.ok) throw new Error(r.msg || 'Đăng nhập thất bại');
    const p = await c.profile().catch(() => ({}));
    acc.avatar = p.avatar || ''; acc.displayName = p.name || email.split('@')[0]; acc.name = acc.displayName;
    acc.cookies = c.jar.toJSON();
    this.store.accounts.push(acc);
    this.botSet.add(acc);
    await this.saveNow();
    this.emit('accounts');
    return acc;
  }

  async removeAccount(id) {
    this.#kill(id);
    this.store.accounts = this.store.accounts.filter((a) => a.id !== id);
    await this.saveNow();
    this.#syncService();
    this.emit('accounts');
  }

  setEnabled(id, on) {
    const a = this.account(id);
    if (!a) return;
    a.enabled = on;
    if (on) this.#spawn(a); else this.#kill(id);
    this.#syncService();
    this.save();
    this.emit('accounts');
  }

  /** Sau khi sửa tài khoản: lưu và khởi động lại bot nếu đang chạy để nhận cấu hình mới. */
  updateAccount(id, patch) {
    const a = this.account(id);
    if (!a) return;
    Object.assign(a, patch);
    this.botSet.add(a);
    if (this.bots.has(id)) { this.#kill(id); this.#spawn(a); }
    this.save();
    this.emit('accounts');
  }

  updateSettings(patch) {
    Object.assign(this.store.settings, patch);
    this.#syncService();
    this.save();
    this.emit('settings');
  }

  /** Chat thử: hỏi Gemini bằng cấu hình của tài khoản, KHÔNG gửi lên web. */
  async testReply(id, text) {
    const a = this.account(id);
    const st = this.settings;
    const model = a.model || st.model;
    if (!model) throw new Error('Chưa chọn mô hình Gemini');
    if (!a.keys.length) throw new Error('Chưa có API key');
    const pool = new KeyPool(a.keys);
    return generate({ http: this.http, pool, model, system: buildSystem(a, st), context: [], question: text, asker: 'Người thử', maxChars: a.maxChars || st.maxChars, keyDelayMs: 0, sleep: async () => {} });
  }

  async loadModels(key) { return listModels(this.http, key); }

  usageFor(key, model) {
    const day = new Date();
    const k = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return this.usage[k]?.[key]?.[model] ?? { requests: 0, tokens: 0 };
  }

  exportConfig(secrets) { return this.store.exportAll({ secrets }); }
  async importConfig(text) {
    for (const id of [...this.bots.keys()]) this.#kill(id);
    this.store.importAll(text);
    for (const a of this.store.accounts) this.botSet.add(a);
    await this.saveNow();
    this.#syncService();
    this.emit('accounts'); this.emit('settings');
  }

  clearLogs() { this.logs.length = 0; this.emit('log', null); }
}
