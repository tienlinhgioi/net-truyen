// Quản lý nhiều tài khoản bot: bật/tắt, nhật ký, lưu cấu hình, dịch vụ nền.
import { Store, defaultAccount } from './core/store.js';
import { AccountBot, BotSet, buildSystem } from './core/runner.js';
import { ChatClient } from './core/chatclient.js';
import { generateCombo, listModels, checkKey, checkModel, detectPlan } from './core/gemini.js';
import { LimitBook, percentOf, quotaDay } from './core/limits.js';
import { ModelHealth } from './core/combo.js';
import { parseDirective } from './core/directive.js';
import { UserMemory } from './core/convo.js';
import { comboFor, filterForRole, rankModels } from './core/combo.js';
import { KeyPool } from './core/keys.js';

export class Manager {
  constructor({ adapter, http, service = null, sleep, loadStickers = null }) {
    this.store = new Store(adapter);
    this.http = http; this.service = service; this.sleep = sleep; this.loadStickers = loadStickers;
    this.stickers = []; this.memory = {}; this.keyStatus = {}; this.modelStatus = {}; this.limits = new LimitBook(); this.plans = {}; this.svcKey = null; this.paused = []; this.suspended = [];
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
    this.plans = this.store.plans || {};
    this.limits = LimitBook.from(this.store.limitsLearned, this.store.settings.modelLimits);
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
    this.store.usage = this.usage;
    for (const [id, b] of this.bots) this.memory[id] = b.memory.toJSON();
    await this.store.adapter.set('botnet', JSON.stringify({ settings: this.store.settings, accounts: this.store.accounts, usage: this.usage, memory: this.memory, limitsLearned: this.limits.toJSON(), plans: this.plans }));
  }

  /** Cộng dồn lượt dùng theo ngày/key/model (dùng chung cho mọi tài khoản và chat thử). */
  recordUsage(key, model, tokens = 0) {
    const u = (((this.usage[quotaDay()] ??= {})[key] ??= {})[model] ??= { requests: 0, tokens: 0 });
    u.requests++; u.tokens += tokens;
    this.save();
  }

  #spawn(account) {
    if (this.bots.has(account.id)) return;
    const bot = new AccountBot({
      account, getSettings: () => this.store.settings, http: this.http, bots: this.botSet,
      sleep: this.sleep, stickers: this.stickers, memory: UserMemory.from(this.memory[account.id]), log: (l) => this.log(l),
      onRecord: (key, model, tokens) => this.recordUsage(key, model, tokens),
      quotaPct: (model) => this.modelPercent(account, model),
      onLimit: (model, l, ctx) => { this.#learnLimit(model, l, ctx?.key, ctx?.plan); this.emit('keys'); },
      onPlan: (key, plan) => this.setPlan(key, plan), save: () => { this.save(); this.emit('account', account); },
    });
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
    this.limits.setUser(this.store.settings.modelLimits);
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
    const out = await generateCombo({ http: this.http, pool: new KeyPool(a.keys, { onRecord: (k, m, t) => this.recordUsage(k, m, t) }), health: new ModelHealth(), models, system: buildSystem(a, st), context: [], question: text, asker: 'Người thử', mode: 'json', keyDelayMs: 0, sleep: async () => {} });
    return { text: parseDirective(out.text).reply || '(không có nội dung)', model: out.model };
  }

  async loadModels(key) { return listModels(this.http, key); }

  usageFor(key, model) {
    return this.usage[quotaDay()]?.[key]?.[model] ?? { requests: 0, tokens: 0 };
  }

  planOf(key) { return this.plans[key]?.plan || ''; }
  setPlan(key, plan) { if (plan && plan !== 'unknown' && this.plans[key]?.plan !== plan) { this.plans[key] = { plan, at: Date.now() }; this.save(); } }

  /** Google báo hết hạn mức theo ngày thì số lượt đã dùng chắc chắn bằng giới hạn: đồng bộ để phần trăm đúng. */
  syncUsage(key, model, limit) {
    const u = (((this.usage[quotaDay()] ??= {})[key] ??= {})[model] ??= { requests: 0, tokens: 0 });
    if (u.requests < limit) u.requests = limit;
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

  /**
   * App ra nền / quay lại. Nếu "Chạy ngầm" tắt thì bot dừng hẳn khi app ra nền (không đổi trạng thái bật/tắt
   * của từng tài khoản) và chạy lại khi quay về.
   */
  setForeground(fg) {
    if (!fg && !this.store.settings.runInBackground) {
      this.suspended = this.accounts.filter((a) => this.bots.has(a.id)).map((a) => a.id);
      for (const id of this.suspended) this.#kill(id);
      this.emit('accounts');
    } else if (fg && this.suspended?.length) {
      for (const id of this.suspended) { const a = this.account(id); if (a?.enabled) this.#spawn(a); }
      this.suspended = [];
      this.emit('accounts');
    }
  }

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

  keyStatusFor(key, model) { return this.keyStatus[`${key}|${model || ''}`]; }

  /** Model dùng để kiểm tra key của một tài khoản: model chat chữ đầu tiên (không có thì kiểm tra bằng danh sách model). */
  checkModelOf(account) { return comboFor(account, this.settings, 'text')[0] || ''; }

  #learnLimit(model, l, key, plan) {
    if (key && plan) this.setPlan(key, plan);
    this.limits.learn(model, l, plan || this.planOf(key));
    if (l.perDay && key) this.syncUsage(key, model, l.limit);
    this.save();
  }

  /** Phần trăm hạn mức hôm nay của một model với key tốt nhất của tài khoản (null nếu chưa biết giới hạn). */
  modelPercent(account, model) {
    const ps = account.keys.map((k) => this.quotaInfo(k, model).percent).filter((p) => p !== null);
    return ps.length ? Math.min(...ps) : null;
  }

  /** Số lượt đã dùng hôm nay, giới hạn (tự học hoặc người dùng đặt) và phần trăm cho một key + model. */
  quotaInfo(key, model) {
    const u = this.usageFor(key, model);
    const lim = this.limits.get(model, this.planOf(key));
    return { ...u, plan: this.planOf(key), rpd: lim.rpd, rpm: lim.rpm, learned: !!lim.learned, percent: percentOf(u.requests, lim.rpd) };
  }

  /**
   * Kiểm tra đồng loạt API key của các tài khoản. Cả màn Cài đặt và màn Tài khoản đều gọi hàm này
   * (cùng cách kiểm tra: gửi yêu cầu nhỏ qua model chat chữ của tài khoản) nên kết quả luôn giống nhau.
   */
  async checkAccountKeys(ids) {
    const jobs = [];
    const seen = new Set();
    for (const id of ids) {
      const a = this.account(id);
      if (!a) continue;
      const model = this.checkModelOf(a);
      for (const key of a.keys) { const k = `${key}|${model}`; if (!seen.has(k)) { seen.add(k); jobs.push({ key, model }); } }
    }
    let i = 0;
    const worker = async () => {
      while (i < jobs.length) {
        const j = jobs[i++];
        let r;
        try { r = await checkKey(this.http, j.key, j.model); } catch (e) { r = { state: 'error', ms: 0, detail: e.message }; }
        if (r.plan) this.setPlan(j.key, r.plan);
        for (const l of r.limits || []) this.#learnLimit(j.model, l, j.key, r.plan);
        this.keyStatus[`${j.key}|${j.model}`] = { ...r, model: j.model, at: Date.now(), resetAt: r.retryMs ? Date.now() + r.retryMs : undefined };
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, worker));
    // Key chưa rõ gói: thử một model Pro để đoán (miễn phí hay trả phí).
    const unknown = [...new Set(jobs.map((j) => j.key))].filter((k) => !this.planOf(k));
    for (const k of unknown) { try { this.setPlan(k, await detectPlan(this.http, k)); } catch { /* bỏ qua */ } }
    this.save();
    this.emit('keys');
    return jobs.map((j) => ({ ...j, ...this.keyStatusFor(j.key, j.model) }));
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

  /**
   * Quét model dùng được: thử từng model chat chữ bằng key đầu tiên (mỗi model tốn 1 lượt nhỏ), 2 yêu cầu song song.
   * Trả về kết quả từng model và danh sách đề xuất (sống, nhanh nhất lên đầu).
   */
  async scanModels(keys, onProgress = () => {}, { all = false } = {}) {
    const key = keys[0];
    if (!key) throw new Error('Chưa có API key');
    const listed = await listModels(this.http, key);
    const chat = new Set(filterForRole(listed, 'text').filter((m) => !/gemma/i.test(m.id)).map((m) => m.id));
    const models = all ? listed : listed.filter((m) => chat.has(m.id));
    const results = [];
    let i = 0;
    const worker = async () => {
      while (i < models.length) {
        const m = models[i++];
        let r;
        if (!chat.has(m.id)) r = { alive: false, state: 'skip', ms: 0, limits: [] }; // ảnh/giọng nói/nhúng: không thử tự động vì tốn lượt tạo ảnh/âm thanh
        else {
          try { r = await checkModel(this.http, key, m.id); } catch (e) { r = { alive: false, state: 'error', ms: 0, detail: e.message, limits: [] }; }
          if (r.plan) this.setPlan(key, r.plan);
          for (const l of r.limits || []) this.#learnLimit(m.id, l, key, r.plan);
        }
        this.modelStatus[m.id] = { ...r, at: Date.now() };
        results.push({ model: m.id, ...r, percent: this.quotaInfo(key, m.id).percent });
        onProgress(results.length, models.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, models.length) }, worker));
    this.save(); this.emit('models');
    results.sort((a, b) => models.findIndex((x) => x.id === a.model) - models.findIndex((x) => x.id === b.model));
    return { results, best: rankModels(results, 5) };
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
