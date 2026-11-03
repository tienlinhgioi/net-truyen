// Bộ chạy bot cho từng tài khoản: đọc chat, nhận lệnh/tên, hỏi Gemini, gửi trả lời (chữ, sticker, truyện, ảnh).
import { ChatClient } from './chatclient.js';
import { CookieJar } from './cookies.js';
import { KeyPool } from './keys.js';
import { generateCombo } from './gemini.js';
import { decideReplies } from './decide.js';
import { isActive } from './schedule.js';
import { normalize, limitChars } from './text.js';
import { comboFor, ModelHealth, orderByBudget } from './combo.js';
import { parseDirective } from './directive.js';
import { pickSticker, ImageQuota } from './media.js';
import { moodFor, typingDelayMs, splitReply, isRepeat } from './persona.js';
import { ConvoTracker, UserMemory } from './convo.js';

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
const pad = (n) => String(n).padStart(2, '0');

export function buildSystem(account, settings, { mood = '', notes = [] } = {}) {
  const max = account.maxChars || settings.maxChars;
  const who = account.displayName || account.name || 'một thành viên';
  return [
    account.prompt || '',
    `Bạn đang chat trong phòng chat công khai về truyện tranh NetTruyen với tên "${who}".`,
    'Nhắn tin như một thành viên bình thường: tiếng Việt tự nhiên, ngắn gọn, một đoạn, không dùng markdown, không giải thích về cách bạn hoạt động.',
    max ? `Mỗi câu trả lời tối đa ${max} ký tự.` : '',
    mood,
    notes.length ? `Điều bạn đã biết về người đang nói chuyện: ${notes.join('; ')}.` : '',
    'Luôn trả về DUY NHẤT một JSON: {"reply":"nội dung nhắn","sticker":false,"draw":"","manga":"","remember":""}.',
    '"sticker": true thỉnh thoảng khi hợp ngữ cảnh. "draw": chỉ điền mô tả ảnh khi người ta nhờ vẽ/tạo ảnh. "manga": chỉ điền tên truyện khi người ta nhờ gửi/giới thiệu một truyện cụ thể. "remember": một điều ngắn đáng nhớ về người đối thoại (nếu có).',
  ].filter(Boolean).join('\n');
}

export class AccountBot {
  constructor({ account, getSettings, http, bots, now = () => new Date(), sleep = realSleep, rand = Math.random, stickers = [], memory = new UserMemory(), onLimit = null, onRecord = null, quotaPct = () => null, log = () => {}, save = () => {} }) {
    this.account = account; this.getSettings = getSettings; this.http = http; this.bots = bots;
    this.now = now; this.nowMs = () => now().getTime(); this.sleep = sleep; this.rand = rand; this.stickers = stickers; this.memory = memory;
    this.log = (text, level = 'info') => log({ t: Date.now(), level, text, acc: account.id });
    this.saveAcc = save; this.onLimit = onLimit; this.quotaPct = quotaPct;
    this.client = new ChatClient({ http, jar: CookieJar.from(account.cookies) });
    this.pool = new KeyPool(account.keys || [], { onRecord });
    this.health = new ModelHealth({ now: this.nowMs });
    this.convo = new ConvoTracker({ now: this.nowMs });
    this.lastId = null; this.pending = []; this.lastSentTexts = []; this.mult = 1; this.running = false;
    this.lastSendAt = 0; this.lastProfileAt = 0; this.lastStarterAt = 0; this.recent = []; this.proTimes = [];
    this.stats = account.stats || (account.stats = { sent: 0, errors: 0, lastAt: 0, days: {} });
    this.stats.days ??= {};
    bots.add(account);
  }

  persist() { this.account.cookies = this.client.jar.toJSON(); this.saveAcc(this.account); }

  #day() {
    const d = new Date(this.nowMs());
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const days = this.stats.days;
    days[k] ??= { sent: 0, errors: 0, proactive: 0, images: 0, mangas: 0, stickers: 0 };
    const keys = Object.keys(days).sort();
    while (keys.length > 14) delete days[keys.shift()];
    return days[k];
  }
  #bump(field) { this.#day()[field]++; }

  async connect() {
    this.log('Đang đăng nhập...');
    this.client.jar = new CookieJar();
    const r = await this.client.login(this.account.email, this.account.password);
    if (!r.ok) throw new Error(`Đăng nhập thất bại: ${r.msg}`);
    await this.refreshProfile();
    this.bots.add(this.account);
    this.persist();
    this.log('Đã đăng nhập');
  }

  /** Tải lại avatar và tên từ trang hồ sơ. Trả về true nếu có thay đổi. */
  async refreshProfile() {
    this.lastProfileAt = this.nowMs();
    try {
      const p = await this.client.profile();
      let changed = false;
      if (p.avatar && p.avatar !== this.account.avatar) { this.account.avatar = p.avatar; changed = true; }
      if (p.name && p.name !== this.account.displayName) { this.account.displayName = p.name; if (!this.account.name) this.account.name = p.name; changed = true; }
      if (changed) { this.bots.add(this.account); this.persist(); }
      return changed;
    } catch { return false; }
  }

  #learn(list) {
    const a = this.account;
    if (!a.chatUserId && this.lastSentTexts.length) {
      const me = normalize(a.displayName || a.name);
      const hit = list.find((m) => normalize(m.name) === me && this.lastSentTexts.includes(String(m.message).trim()));
      if (hit) { a.chatUserId = hit.user_id; this.bots.add(a); this.persist(); }
    }
    if (a.chatUserId) {
      const mine = [...list].reverse().find((m) => m.user_id === a.chatUserId);
      if (mine) {
        let ch = false;
        if (mine.avatar && mine.avatar !== a.avatar) { a.avatar = mine.avatar; ch = true; }
        if (mine.name && mine.name !== a.displayName) { a.displayName = mine.name; ch = true; }
        if (ch) { this.bots.add(a); this.persist(); }
      }
    }
  }

  #proOk(st) {
    const t = this.nowMs();
    this.proTimes = this.proTimes.filter((x) => t - x < 3600000);
    return this.proTimes.length < (st.proactiveMaxPerHour ?? 6);
  }

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
    if (this.nowMs() - this.lastProfileAt > (st.profileRefreshMs ?? 1800000) && this.lastProfileAt) await this.refreshProfile();
    this.#learn(list);
    this.convo.setWindow(st.convoWindowMs ?? 180000);
    const allow = this.account.proactive !== false;
    const r = decideReplies({
      messages: list, account: this.account, lastId: this.lastId, bots: this.bots, maxChain: st.maxChain, contextSize: st.contextSize,
      isActive: (uid) => this.convo.isActive(uid),
      proactive: { chance: allow ? (st.proactiveChance ?? 0) : 0, rand: this.rand, ok: this.#proOk(st), words: st.sensitiveWords || [] },
    });
    this.lastId = r.lastId;
    const blocked = (st.blockedWords || []).map(normalize).filter(Boolean);
    for (const t of r.tasks) {
      if (blocked.some((w) => normalize(t.question).includes(w))) { this.log(`Bỏ qua câu có từ cấm (từ ${t.from})`, 'warn'); continue; }
      if (!this.pending.some((p) => p.id === t.id)) this.pending.push(t);
    }
    this.#maybeStarter(st, list);
    await this.#drain(st);
  }

  /** Phòng im lặng lâu thì thỉnh thoảng mở một chủ đề (nếu bật). */
  #maybeStarter(st, list) {
    if (!st.starterEnabled || this.account.proactive === false || this.pending.length || !this.#proOk(st)) return;
    const now = this.nowMs();
    const lastTs = (list.at(-1)?.timestamp || 0) * 1000;
    const idle = st.starterIdleMs ?? 1200000;
    if (!lastTs || now - lastTs < idle || now - this.lastStarterAt < idle) return;
    if (this.rand() >= 0.5) return;
    this.lastStarterAt = now;
    this.pending.push({ id: `starter-${now}`, from: '', userId: '', kind: 'starter', question: 'Phòng chat đang vắng. Hãy mở một chủ đề trò chuyện tự nhiên, nhẹ nhàng về truyện tranh hoặc đời sống, chỉ một câu ngắn.', context: list.slice(-4).map((m) => ({ name: m.name, text: String(m.message).replace(/\[IMG=[^\]\s]+\]/g, '').trim() })).filter((c) => c.text) });
  }

  gap(st) { return (st.chatDelayMs ?? 2000) * this.mult; }

  async #send(text, st) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await this.client.sendChat(text);
      if (r.ok) {
        this.lastSendAt = this.nowMs(); this.lastSentTexts = [...this.lastSentTexts, text].slice(-8);
        this.stats.sent++; this.stats.lastAt = Date.now(); this.#bump('sent');
        this.mult = Math.max(1, this.mult - 0.5);
        return true;
      }
      if (RATE.test(r.msg || '')) {
        this.mult = Math.min(this.mult * 2, 30);
        this.log(`Web báo gửi quá nhanh, tăng delay lên ${Math.round(this.gap(st) / 1000)}s`, 'warn');
        await this.sleep(this.gap(st));
      } else { this.log(`Gửi thất bại: ${r.msg || 'không rõ'}`, 'error'); return false; }
    }
    return false;
  }

  /** Chờ cho đủ thời gian "gõ" (đã tính phần Gemini suy nghĩ) và khoảng cách tối thiểu với tin trước. */
  async #waitToSend(len, since, st) {
    const typing = typingDelayMs(len, { perCharMs: st.typingPerCharMs ?? 40, minMs: st.typingMinMs ?? 800, maxMs: st.typingMaxMs ?? 4000 }, this.rand);
    const elapsed = this.nowMs() - since;
    const gapLeft = this.lastSendAt ? this.gap(st) - (this.nowMs() - this.lastSendAt) : 0;
    const wait = Math.max(typing - elapsed, gapLeft, 0);
    if (wait > 0) await this.sleep(wait);
  }

  async #drain(st) {
    while (this.pending.length) {
      const task = this.pending[0];
      let result;
      try { result = await this.#handle(task, st); } catch (e) { result = this.#onError(e, task); }
      if (result === 'retry') return;
      this.pending.shift();
      this.persist();
    }
  }

  #onError(e, task) {
    this.stats.errors++; this.#bump('errors');
    const urgent = task.kind === 'mention' || task.kind === 'followup';
    if (e.kind === 'nokey') { this.log(`Hết API key khả dụng${e.why ? `: ${e.why}` : ''}${e.retryAt ? `, thử lại lúc ${new Date(e.retryAt).toLocaleTimeString('vi-VN')}` : ''}`, 'error'); return urgent ? 'retry' : 'drop'; }
    if (e.kind === 'blocked') { this.log('Gemini từ chối trả lời câu này, bỏ qua', 'warn'); return 'drop'; }
    if (e.kind === 'nomodel') { this.log(`Không model nào dùng được: ${e.detail || ''}`, 'error'); return 'drop'; }
    const why = { invalid: 'API key sai hoặc bị khóa', quota: 'hết hạn mức', model: 'model không tồn tại hoặc không hỗ trợ', server: 'máy chủ Google đang lỗi' }[e.kind] || e.kind || e.message;
    this.log(`Lỗi Gemini${e.status ? ` (HTTP ${e.status})` : ''}: ${why}${e.detail ? ' - ' + String(e.detail).slice(0, 140) : ''}`, 'error');
    return 'drop';
  }

  async #handle(task, st) {
    const a = this.account;
    let models = comboFor(a, st, 'text');
    if (!models.length) { this.log('Chưa chọn mô hình Gemini', 'error'); return 'drop'; }
    const urgentTask = task.kind === 'mention' || task.kind === 'followup';
    // Hạn mức miễn phí rất thấp: tin chen ngang/mở chủ đề chỉ dùng model còn dưới 70%, dành phần còn lại cho người gọi bot.
    if (!urgentTask) {
      models = models.filter((m) => (this.quotaPct(m) ?? 0) < 70);
      if (!models.length) { this.log('Tiết kiệm hạn mức: bỏ qua tin tự chen vào', 'warn'); return 'drop'; }
    }
    models = orderByBudget(models, this.quotaPct);
    const t0 = this.nowMs();
    const notes = this.memory.get(task.userId).notes;
    const system = buildSystem(a, st, { mood: st.moodEnabled === false ? '' : moodFor(this.now()), notes });
    const past = this.convo.history(task.userId).flatMap((h) => [{ name: task.from, text: h.q }, { name: a.displayName || a.name, text: h.a }]);
    const context = [...past, ...(task.context || [])];
    const hint = task.kind === 'proactive' ? '\n(Bạn tự chen vào câu chuyện, không phải ai gọi bạn: bình luận ngắn như một người bạn, đừng giới thiệu bản thân.)' : '';
    const ask = (extra = '') => generateCombo({
      http: this.http, pool: this.pool, health: this.health, models, system, context, question: task.question + hint + extra,
      asker: task.from, mode: 'json', keyDelayMs: st.keyDelayMs, sleep: this.sleep, onLimit: this.onLimit, hedgeMs: urgentTask ? (st.hedgeMs ?? 0) : 0,
    });
    let d = parseDirective((await ask()).text);
    if (st.avoidRepeat !== false && d.reply && isRepeat(d.reply, this.recent)) {
      this.log('Câu trả lời trùng câu vừa gửi, hỏi lại để có câu khác');
      d = parseDirective((await ask(`\n(Đừng lặp lại các câu bạn vừa nói: ${this.recent.slice(-3).join(' | ')})`)).text);
      if (isRepeat(d.reply, this.recent)) { this.log('Vẫn trùng câu cũ, bỏ qua', 'warn'); return 'drop'; }
    }
    const reply = limitChars(d.reply, a.maxChars || st.maxChars);
    if (!reply && !d.sticker && !d.draw && !d.manga) { this.log('Gemini không trả nội dung, bỏ qua', 'warn'); return 'drop'; }

    const parts = reply ? splitReply(reply) : [];
    let first = true;
    for (const part of parts) {
      await this.#waitToSend(part.length, first ? t0 : this.nowMs(), st);
      if (!(await this.#send(part, st))) return 'drop';
      first = false;
    }
    if (parts.length) this.log(`Đã trả lời ${task.from || 'phòng chat'}: ${parts.join(' / ')}`);
    if (task.kind === 'proactive' || task.kind === 'starter') { this.proTimes.push(this.nowMs()); this.#bump('proactive'); }
    if (reply) { this.recent = [...this.recent, reply].slice(-6); }

    if (d.sticker) await this.#sendSticker(st);
    if (d.manga) await this.#sendManga(d.manga, st);
    if (d.draw) await this.#sendImage(d.draw, st);
    if (d.remember && task.userId) this.memory.add(task.userId, task.from, d.remember);
    if (task.userId) this.convo.touch(task.userId, task.from, task.question, reply);
    return 'sent';
  }

  async #sendSticker(st) {
    const url = pickSticker(this.stickers, this.account.stickerPacks || [], this.rand);
    if (!url) return;
    await this.#waitToSend(8, this.nowMs(), st);
    if (await this.#send(`[IMG=${url}]`, st)) this.#bump('stickers');
  }

  async #sendManga(name, st) {
    let found;
    try { found = (await this.client.searchManga(name))[0]; } catch { found = null; }
    if (!found) { this.log(`Không tìm thấy truyện "${name}"`, 'warn'); return; }
    await this.#waitToSend(8, this.nowMs(), st);
    if (await this.#send(`[MANGA=${found.slug}]`, st)) this.#bump('mangas');
  }

  async #sendImage(prompt, st) {
    const quota = new ImageQuota({ perDay: st.imagePerDay ?? 5, cooldownMs: st.imageCooldownMs ?? 60000, now: this.nowMs });
    const q = quota.check(this.stats);
    if (!q.ok) { this.log(q.reason === 'daily' ? 'Đã đạt giới hạn số ảnh tạo mỗi ngày' : 'Đang chờ giữa hai lần tạo ảnh (giới hạn)', 'warn'); return; }
    const models = comboFor(this.account, st, 'image');
    if (!models.length) { this.log('Chưa chọn model tạo ảnh trong combo', 'warn'); return; }
    this.log(`Đang tạo ảnh: ${prompt}`);
    try {
      const out = await generateCombo({ http: this.http, pool: this.pool, health: this.health, models, system: '', context: [], question: prompt, mode: 'image', keyDelayMs: st.keyDelayMs, sleep: this.sleep, onLimit: this.onLimit });
      const url = await this.client.uploadImage(out.image.data, out.image.mime);
      quota.record(this.stats);
      await this.#waitToSend(8, this.nowMs(), st);
      if (await this.#send(`[IMG=${url}]`, st)) this.#bump('images');
    } catch (e) { this.log(`Không tạo/gửi được ảnh: ${e.kind === 'nomodel' ? 'không có model tạo ảnh dùng được' : (e.message || e.kind)}`, 'error'); }
  }

  async start() {
    this.running = true;
    while (this.running) {
      try { await this.tick(); } catch (e) { this.log(`Lỗi: ${e.message}`, 'error'); }
      const st = this.getSettings();
      const busy = this.pending.length || this.nowMs() - this.lastSendAt < 60000;
      await this.sleep(busy ? Math.min(st.pollMs, 1000) : st.pollMs);
    }
  }

  stop() { this.running = false; }
}
