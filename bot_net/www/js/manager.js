// Quản lý nhiều tài khoản bot: bật/tắt, nhật ký, lưu cấu hình, dịch vụ nền.
import { Store, defaultAccount } from './core/store.js';
import { AccountBot, BotSet, buildSystem } from './core/runner.js';
import { ChatClient } from './core/chatclient.js';
import { generateCombo, listModels, checkKeys, checkModel } from './core/gemini.js';
import { ModelHealth } from './core/combo.js';
import { parseDirective } from './core/directive.js';
import { UserMemory } from './core/convo.js';
import { comboFor } from './core/combo.js';
import { KeyPool } from './core/keys.js';

export class Manager {
  constructor({ adapter, http, service = null, sleep, loadStickers = null }) {
    this.store = new Store(adapter);
    this.http = http; this.service = service; this.sleep = sleep; this.loadStickers = loadStickers;
    this.stickers = []; this.memory = {}; this.keyStatus = {}; this.modelStatus = {}; this.svcKey = null; this.paused = [];
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
    this.memory = this.store.memory || {};
    try { this.stickers = (await this.loadStickers?.()) || []; } catch { this.stickers = []; }
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
    if (entry?.level === 'error' && /Hết API key/.test(entry.text) && this.service) this.service.update('Cảnh báo: hết API key khả dụng');
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
    for (const [id, b] of this.bots) this.memory[id] = b.memory.toJSON();
    await this.store.adapter.set('botnet', JSON.stringify({ settings: this.store.settings, accounts: this.store.accounts, usage: this.usage, memory: this.memory }));
  }

  #mergeUsage(u) {
    for (const [day, keys] of Object.entries(u)) this.usage[day] = keys;
  }

  #spawn(account) {
    if (this.bots.has(account.id)) return;
    const bot = new AccountBot({
      account, getSettings: () => this.store.settings, http: this.http, bots: this.botSet,
      sleep: this.sleep, stickers: this.stickers, memory: UserMemory.from(this.memory[account.id]), log: (l) => this.log(l), save: () => { this.save(); this.emit('account', account); },
    });
    bot.pool.importUsage(JSON.parse(JSON.stringify(this.usage)));
    this.bots.set(account.id, bot);
    bot.start();
  }

  #kill(id) {
    this.bots.get(id)?.stop();
    this.bots.delete(id);
  }

  /** Chỉ gọi dịch vụ nền khi trạng thái thật sự đổi (kéo thanh cài đặt không được làm gọi lại liên tục). */
  #syncService() {
    if (!this.service) return;
    const n = this.bots.size;
    const key = n > 0 && this.store.settings.runInBackground ? `on:${n}` : 'off';
    if (key === this.svcKey) return;
    const was = this.svcKey;
    this.svcKey = key;
    if (key === 'off') this.service.stop();
    else if (was && was.startsWith('on:')) this.service.update(`${n} tài khoản đang hoạt động`);
    else this.service.start(`${n} tài khoản đang hoạt động`);
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
    const models = comboFor(a, st, 'text');
    if (!models.length) throw new Error('Chưa chọn model Gemini');
    if (!a.keys.length) throw new Error('Chưa có API key');
    const out = await generateCombo({ http: this.http, pool: new KeyPool(a.keys), health: new ModelHealth(), models, system: buildSystem(a, st), context: [], question: text, asker: 'Người thử', mode: 'json', keyDelayMs: 0, sleep: async () => {} });
    return { text: parseDirective(out.text).reply || '(không có nội dung)', model: out.model };
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

  /** Dừng khẩn cấp: tắt mọi tài khoản đang chạy (nhớ lại để bật lại một chạm). */
  pauseAll() {
    this.paused = [...this.bots.keys()];
    for (const id of this.paused) this.setEnabled(id, false);
    this.emit('accounts');
  }

  resumeAll() {
    for (const id of this.paused) this.setEnabled(id, true);
    this.paused = [];
  }

  async refreshProfile(id) {
    const bot = this.bots.get(id);
    const a = this.account(id);
    if (bot) return bot.refreshProfile();
    const c = new ChatClient({ http: this.http });
    const r = await c.login(a.email, a.password);
    if (!r.ok) throw new Error(r.msg || 'Đăng nhập thất bại');
    const p = await c.profile();
    let changed = false;
    if (p.avatar && p.avatar !== a.avatar) { a.avatar = p.avatar; changed = true; }
    if (p.name && p.name !== a.displayName) { a.displayName = p.name; changed = true; }
    a.cookies = c.jar.toJSON();
    if (changed) { this.save(); this.emit('accounts'); }
    return changed;
  }

  /** Kiểm tra đồng loạt API key (của một tài khoản hoặc tất cả); trả về kết quả theo thứ tự. */
  async checkAllKeys(keys, model) {
    const uniq = [...new Set(keys)];
    const res = await checkKeys(this.http, uniq, { concurrency: 3, model });
    for (const r of res) this.keyStatus[r.key] = { state: r.state, ms: r.ms, at: Date.now() };
    this.emit('keys');
    return res;
  }

  /** Kiểm tra model nào còn sống (dùng key khả dụng đầu tiên). */
  async checkModels(keys, models) {
    const key = keys[0];
    if (!key) throw new Error('Chưa có API key');
    const out = {};
    await Promise.all([...new Set(models)].map(async (m) => {
      try { out[m] = await checkModel(this.http, key, m); } catch { out[m] = { alive: false, state: 'error', ms: 0 }; }
      this.modelStatus[m] = { ...out[m], at: Date.now() };
    }));
    this.emit('models');
    return out;
  }

  /** Báo cáo theo ngày (gộp mọi tài khoản), mới nhất trước. */
  report(days = 7) {
    const sum = {};
    for (const a of this.accounts) for (const [d, v] of Object.entries(a.stats?.days || {})) {
      const x = (sum[d] ??= { sent: 0, errors: 0, proactive: 0, images: 0, mangas: 0, stickers: 0 });
      for (const k of Object.keys(x)) x[k] += v[k] || 0;
    }
    return Object.entries(sum).sort((a, b) => b[0].localeCompare(a[0])).slice(0, days).map(([day, v]) => ({ day, ...v }));
  }

  comboModels(account, role) { return comboFor(account, this.settings, role); }
}
