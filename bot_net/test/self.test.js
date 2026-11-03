import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceSelf, cleanReply, squashMsg } from '../www/js/core/text.js';
import { decideReplies } from '../www/js/core/decide.js';
import { AccountBot, BotSet } from '../www/js/core/runner.js';
import { defaultAccount, defaultSettings } from '../www/js/core/store.js';

const acc = { name: 'Tiểu Ly', displayName: 'Tiểu Ly', aliases: ['bé ly'], command: '/ai', chatUserId: null };
const msg = (id, user, message, name = 'X') => ({ id, user_id: user, name, message, manga: null });

test('replaceSelf: thay tên/biệt danh của chính mình bằng "mình" và bỏ lệnh, để câu trả lời không tự gọi chính nó', () => {
  assert.equal(replaceSelf('Để Tiểu Ly kể cho nghe nhé', acc), 'Để mình kể cho nghe nhé');
  assert.equal(replaceSelf('bé ly đây, /ai nghe nè', acc), 'mình đây, nghe nè');
  assert.equal(replaceSelf('Chào An nhé', acc), 'Chào An nhé');
});

test('cleanReply: bỏ tiền tố "Tên:" ở đầu và bỏ phần model tự viết thêm lời người khác (kịch bản hai bên)', () => {
  const o = { account: acc, names: ['An', 'MAZINDO'] };
  assert.equal(cleanReply('Tiểu Ly: chào An nhé', o), 'chào An nhé');
  assert.equal(cleanReply('Chào An nhé\nAn: ừ chào\nTiểu Ly: hihi', o), 'Chào An nhé');
  assert.equal(cleanReply('Mình khỏe, còn bạn: sao?', o), 'Mình khỏe, còn bạn: sao?', 'dấu hai chấm bình thường không bị cắt');
});

test('squashMsg: so khớp tin đã gửi với tin web hiển thị lại (mã hóa &, khoảng trắng, dấu câu)', () => {
  assert.equal(squashMsg('Tôi &amp; bạn   nhé!'), squashMsg('Tôi & bạn nhé'));
  assert.equal(squashMsg('&lt;b&gt;xin chào&lt;/b&gt;'), squashMsg('<b>xin chào</b>'));
});

test('decide: tin trùng chữ với tin mình vừa gửi thì không trả lời, dù không biết user_id và tên không khớp', () => {
  const sent = new Set([squashMsg('Ly ơi nghe nè')]);
  const list = [msg(1, 'u', 'x'), msg(2, 'zz', 'Ly ơi nghe nè', 'Tên Khác Hẳn')];
  const r = decideReplies({ messages: list, account: { ...acc, aliases: ['ly'] }, lastId: 1, bots: new Set(), sentTexts: sent });
  assert.deepEqual(r.tasks, []);
});

test('decide: nhận ra mình bằng nhiều tên (tên hồ sơ, tên trong chat, tên trong cookie)', () => {
  const list = [msg(1, 'u', 'x'), msg(2, 'zz', 'tieu ly nghe nè', 'Tiểu Ly ✨')];
  const a = { ...acc, displayName: 'Ly (hồ sơ)' };
  assert.equal(decideReplies({ messages: list, account: a, lastId: 1, bots: new Set() }).tasks.length, 1, 'không biết tên thì tưởng người khác');
  assert.equal(decideReplies({ messages: list, account: a, lastId: 1, bots: new Set(), ownNames: ['Tiểu Ly ✨'] }).tasks.length, 0);
});

test('decide: ngữ cảnh ghi rõ dòng nào là của chính bot, tin từ bot khác được đánh dấu fromBot', () => {
  const list = [msg(1, 'u', 'a', 'An'), msg(2, 'me', 'Ai bt a', 'Tiểu Ly'), msg(3, 'u2', '/ai chào', 'An'), msg(4, 'bot2', '/ai bot đây', 'Mazindo')];
  const a = { ...acc, chatUserId: 'me' };
  const r = decideReplies({ messages: list, account: a, lastId: 2, bots: new Set(['me', 'bot2']) });
  assert.equal(r.tasks[0].context.at(-1).name, 'Bạn (Tiểu Ly)');
  assert.equal(r.tasks[0].fromBot, false);
  assert.equal(r.tasks[1].fromBot, true);
});

// ---- Tái hiện lỗi "tự kỷ": không nhận ra tin của mình, tin mình có chứa biệt danh của mình
const gem = (text) => ({ status: 200, data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 1 } } });
function bot({ lists, reply, account = {} }) {
  const sent = []; let n = 0;
  const http = async (r) => {
    if (r.url.includes('generativelanguage')) return gem(JSON.stringify({ reply: reply() }));
    if (r.url.endsWith('/ajax/auth/login')) return { status: 200, headers: { 'set-cookie': 'UserID=1; UserName=Ti%E1%BB%83u%20Ly%20%E2%9C%A8' }, data: { status: true } };
    if (r.url.endsWith('/auth/login')) return { status: 200, headers: {}, data: '' };
    if (r.url.endsWith('/user/profile')) return { status: 200, headers: {}, data: '<img class="avatar user-img" src="a.jpg"><input name="user-name" value="Ly (hồ sơ)">' };
    if (r.url.endsWith('/ajax/chat/list')) return { status: 200, headers: {}, data: { status: true, data: lists[Math.min(n++, lists.length - 1)](sent) } };
    if (r.url.endsWith('/ajax/chat/send')) { sent.push(new URLSearchParams(r.data).get('message')); return { status: 200, headers: {}, data: { status: true } }; }
    return { status: 404, headers: {}, data: '' };
  };
  const a = { ...defaultAccount(), id: 'a1', email: 'e', password: 'p', name: 'Tiểu Ly', displayName: 'Tiểu Ly', aliases: ['ly'], keys: ['K'], model: 'm', ...account };
  const b = new AccountBot({ account: a, getSettings: () => ({ ...defaultSettings(), chatDelayMs: 0, typingMinMs: 0, typingMaxMs: 0 }), http, bots: new BotSet(), sleep: async () => {}, rand: () => 0.5 });
  return { b, sent, a };
}

test('KHÔNG tự trả lời chính mình dù web đổi chữ khi hiển thị, tên chat khác tên hồ sơ và câu trả lời có biệt danh', async () => {
  const echoed = (sent) => sent.map((t, i) => msg(10 + i, 'self-id', t.replace('&', '&amp;'), 'Tên Chat Khác'));
  const { b, sent } = bot({
    reply: () => 'Ly ơi nghe nè & chào',
    lists: [() => [msg(1, 'u', 'x')], () => [msg(1, 'u', 'x'), msg(2, 'u', '/ai chào', 'An')], (s) => [msg(1, 'u', 'x'), msg(2, 'u', '/ai chào', 'An'), ...echoed(s)], (s) => [msg(1, 'u', 'x'), msg(2, 'u', '/ai chào', 'An'), ...echoed(s)], (s) => [msg(1, 'u', 'x'), msg(2, 'u', '/ai chào', 'An'), ...echoed(s)]],
  });
  for (let i = 0; i < 5; i++) await b.tick();
  assert.equal(sent.length, 1, 'chỉ trả lời người hỏi một lần, không tự đáp lại tin của mình: ' + JSON.stringify(sent));
  assert.ok(!/\bly\b/i.test(sent[0]), 'câu trả lời không tự gọi tên mình: ' + sent[0]);
});

test('học được user_id của chính mình dù web hiển thị lại chữ đã bị đổi', async () => {
  const echoed = (sent) => sent.map((t, i) => msg(10 + i, 'self-id', t.replace('&', '&amp;'), 'Tên Chat Khác'));
  const { b, a } = bot({ reply: () => 'ừ chào & hẹn gặp', lists: [() => [msg(1, 'u', 'x')], () => [msg(1, 'u', 'x'), msg(2, 'u', '/ai chào', 'An')], (s) => [msg(1, 'u', 'x'), msg(2, 'u', '/ai chào', 'An'), ...echoed(s)]] });
  for (let i = 0; i < 3; i++) await b.tick();
  assert.equal(a.chatUserId, 'self-id');
});

test('bot trả lời bot khác không quá một lần mỗi 2 phút (chống hai bot tự đối đáp mãi)', async () => {
  let clock = new Date('2026-11-03T12:00:00');
  const sent = []; let n = 0;
  const lists = [[msg(1, 'u', 'x')], [msg(1, 'u', 'x'), msg(2, 'bot2', '/ai một', 'Bot Hai')], [msg(1, 'u', 'x'), msg(2, 'bot2', '/ai một', 'Bot Hai'), msg(3, 'u9', 'chen', 'Người'), msg(4, 'bot2', '/ai hai', 'Bot Hai')]];
  let k = 0;
  const http = async (r) => {
    if (r.url.includes('generativelanguage')) return gem(JSON.stringify({ reply: `trả lời ${++k}` }));
    if (r.url.endsWith('/ajax/chat/list')) return { status: 200, headers: {}, data: { status: true, data: lists[Math.min(n++, 2)] } };
    if (r.url.endsWith('/ajax/chat/send')) { sent.push(new URLSearchParams(r.data).get('message')); return { status: 200, headers: {}, data: { status: true } }; }
    return { status: 200, headers: {}, data: { status: true } };
  };
  const bots = new BotSet(); bots.ids.add('bot2');
  const a = { ...defaultAccount(), id: 'a1', cookies: { UserID: '1' }, name: 'Tiểu Ly', displayName: 'Tiểu Ly', keys: ['K'], model: 'm' };
  const b = new AccountBot({ account: a, getSettings: () => ({ ...defaultSettings(), chatDelayMs: 0, typingMinMs: 0, typingMaxMs: 0 }), http, bots, now: () => clock, sleep: async () => {}, rand: () => 0.5 });
  await b.tick(); await b.tick();
  clock = new Date('2026-11-03T12:00:30');
  await b.tick();
  assert.equal(sent.length, 1, 'tin thứ hai của cùng bot trong vòng 2 phút bị bỏ: ' + JSON.stringify(sent));
});
