import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountBot, BotSet } from '../www/js/core/runner.js';
import { defaultAccount, defaultSettings } from '../www/js/core/store.js';

const gem = (text) => ({ status: 200, data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 7 } } });

function setup({ chatLists, gemini = () => gem('Chào bạn nhé'), sendResult = () => ({ ok: true }), account = {}, settings = {}, now = () => new Date('2026-11-03T12:00:00') } = {}) {
  const sleeps = [], sent = [], logs = [], saved = [];
  let call = 0, loggedIn = 0;
  const acc = { ...defaultAccount(), id: 'a1', email: 'e', password: 'p', name: 'Tiểu Ly', displayName: 'Tiểu Ly', command: '/ai', keys: ['K1'], model: 'm', ...account };
  const st = { ...defaultSettings(), chatDelayMs: 5000, ...settings };
  const http = async (r) => {
    if (r.url.includes('generativelanguage')) return gemini(r);
    if (r.url.endsWith('/ajax/auth/login')) { loggedIn++; return { status: 200, headers: { 'set-cookie': 'UserID=1' }, data: { status: true } }; }
    if (r.url.endsWith('/auth/login')) return { status: 200, headers: {}, data: '' };
    if (r.url.endsWith('/ajax/chat/list')) return { status: 200, headers: {}, data: { status: true, data: chatLists[Math.min(call++, chatLists.length - 1)] } };
    if (r.url.endsWith('/ajax/chat/send')) { const m = new URLSearchParams(r.data).get('message'); const res = sendResult(m); if (res.ok) sent.push(m); return { status: 200, headers: {}, data: { status: res.ok, message: res.msg } }; }
    return { status: 404, headers: {}, data: '' };
  };
  const bot = new AccountBot({ account: acc, getSettings: () => st, http, bots: new BotSet(), now, sleep: async (ms) => sleeps.push(ms), log: (l) => logs.push(l), save: (a) => saved.push(a) });
  return { bot, sleeps, sent, logs, saved, acc, loggedIn: () => loggedIn };
}
const m = (id, user, message, name = 'X') => ({ id, user_id: user, name, message, manga: null });

test('lần poll đầu chỉ ghi mốc; poll sau có người gọi thì trả lời sau delay chat', async () => {
  const t = setup({ chatLists: [[m(1, 'u', '/ai cũ')], [m(1, 'u', '/ai cũ'), m(2, 'u', '/ai chào bạn')]] });
  await t.bot.tick();
  assert.deepEqual(t.sent, []);
  await t.bot.tick();
  assert.deepEqual(t.sent, ['Chào bạn nhé']);
  assert.ok(t.sleeps.includes(5000), 'có chờ delay chat mặc định');
  assert.equal(t.bot.stats.sent, 1);
});

test('đăng nhập khi chưa có cookie và lưu lại cookie', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')]] });
  await t.bot.tick();
  assert.equal(t.loggedIn(), 1);
  assert.equal(t.saved.at(-1).cookies.UserID, '1');
});

test('ngoài lịch chạy thì không đọc chat, không trả lời', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai hi')]], settings: { schedule: { enabled: true, from: '01:00', to: '02:00' } } });
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, []);
  assert.equal(t.loggedIn(), 0);
});

test('từ khóa cấm: không trả lời câu chứa từ cấm', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai nói tục đi')]], settings: { blockedWords: ['nói tục'] } });
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, []);
});

test('web báo gửi quá nhanh thì tăng delay chat và thử lại cùng tin', async () => {
  let n = 0;
  const t = setup({
    chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai chào')]],
    sendResult: () => (n++ === 0 ? { ok: false, msg: 'Bạn gửi tin quá nhanh, vui lòng đợi' } : { ok: true }),
  });
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, ['Chào bạn nhé']);
  assert.ok(t.sleeps.some((s) => s >= 10000), 'delay đã tăng gấp đôi: ' + t.sleeps);
});

test('hết sạch key Gemini thì ghi log, không gửi gì, tin vẫn được thử lại lượt sau', async () => {
  let fail = true;
  const t = setup({
    chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai chào')], [m(2, 'u', '/ai chào')]],
    gemini: () => (fail ? { status: 429, data: {} } : gem('ok rồi')),
  });
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, []);
  assert.ok(t.logs.some((l) => /key/i.test(l.text)));
  fail = false; t.bot.pool.fail = () => {}; // key hồi lại
  t.bot.pool.state.get('K1').until = 0;
  await t.bot.tick();
  assert.deepEqual(t.sent, ['ok rồi']);
});

test('tự học chatUserId từ tin mình vừa gửi để không tự trả lời chính mình', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai chào')], [m(2, 'u', '/ai chào'), m(3, 'me-hash', 'Chào bạn nhé', 'Tiểu Ly')]] });
  await t.bot.tick(); await t.bot.tick(); await t.bot.tick();
  assert.equal(t.bot.account.chatUserId, 'me-hash');
});

test('giới hạn ký tự của tài khoản áp dụng lên câu trả lời', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai chào')]], account: { maxChars: 10 }, gemini: () => gem('Hôm nay trời đẹp quá, mình đi chơi nhé') });
  await t.bot.tick(); await t.bot.tick();
  assert.ok(t.sent[0].length <= 10, t.sent[0]);
});
