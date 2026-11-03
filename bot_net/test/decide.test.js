import test from 'node:test';
import assert from 'node:assert/strict';
import { decideReplies } from '../www/js/core/decide.js';

const acc = { name: 'Tiểu Ly', aliases: ['bé ly'], command: '/ai', displayName: 'Tiểu Ly', chatUserId: 'me' };
const msg = (id, user, message, name = 'X') => ({ id, user_id: user, name, message, manga: null });
const bots = new Set(['me', 'bot2']);

test('chỉ trả lời tin mới hơn lastId và có nhắc tới tài khoản', () => {
  const list = [msg(1, 'u', 'tieu ly oi'), msg(2, 'u', 'chào cả nhà'), msg(3, 'u', '/ai hôm nay sao')];
  const r = decideReplies({ messages: list, account: acc, lastId: 1, bots });
  assert.deepEqual(r.tasks.map((t) => t.id), [3]);
  assert.equal(r.tasks[0].question, 'hôm nay sao');
  assert.equal(r.lastId, 3);
});

test('không tự trả lời tin của chính mình (theo id hoặc theo tên khi chưa biết id)', () => {
  const a = { ...acc, chatUserId: null };
  const list = [msg(1, 'zz', 'tieu ly nay', 'Tiểu Ly'), msg(2, 'u', 'tieu ly nay', 'Người khác')];
  const r = decideReplies({ messages: list, account: a, lastId: 0, bots: new Set() });
  assert.deepEqual(r.tasks.map((t) => t.id), [2]);
});

test('bỏ qua tin chỉ có ảnh/sticker và tin gửi truyện', () => {
  const list = [msg(1, 'u', '[IMG=https://x/y.png]'), { ...msg(2, 'u', 'tieu ly'), manga: { name: 'x' } }];
  assert.equal(decideReplies({ messages: list, account: acc, lastId: 0, bots }).tasks.length, 0);
});

test('chuỗi bot trả lời nhau quá 2 tin thì dừng', () => {
  const list = [msg(1, 'u', 'hi'), msg(2, 'bot2', 'tieu ly nghe nè'), msg(3, 'bot3', 'tieu ly ơi'), msg(4, 'bot2', 'tieu ly nữa')];
  const b = new Set(['me', 'bot2', 'bot3']);
  const r = decideReplies({ messages: list, account: acc, lastId: 0, bots: b, maxChain: 2 });
  assert.deepEqual(r.tasks.map((t) => t.id), [2, 3]); // tin 4 là chuỗi bot dài 3 -> bỏ
});

test('lần đầu (lastId=null) chỉ ghi nhớ mốc, không trả lời tin cũ', () => {
  const list = [msg(5, 'u', '/ai chào'), msg(6, 'u', '/ai chào nữa')];
  const r = decideReplies({ messages: list, account: acc, lastId: null, bots });
  assert.deepEqual(r.tasks, []);
  assert.equal(r.lastId, 6);
});

test('ngữ cảnh gồm vài tin gần nhất trước tin cần trả lời', () => {
  const list = [msg(1, 'u', 'a', 'A'), msg(2, 'u', 'b', 'B'), msg(3, 'u', '/ai c', 'C')];
  const r = decideReplies({ messages: list, account: acc, lastId: 2, bots, contextSize: 2 });
  assert.deepEqual(r.tasks[0].context, [{ name: 'A', text: 'a' }, { name: 'B', text: 'b' }]);
});

test('đang trò chuyện: người vừa nói với bot nhắn tiếp không cần gọi tên vẫn được trả lời', () => {
  const list = [msg(1, 'u', 'hi'), msg(2, 'u9', 'còn bạn thì sao', 'Bạn Z'), msg(3, 'u8', 'ai đó nói gì', 'Khác')];
  const r = decideReplies({ messages: list, account: acc, lastId: 1, bots, isActive: (id) => id === 'u9' });
  assert.deepEqual(r.tasks.map((t) => [t.id, t.kind]), [[2, 'followup']]);
  assert.equal(r.tasks[0].question, 'còn bạn thì sao');
});

test('được nhắc tên thì kind=mention dù đang trò chuyện', () => {
  const list = [msg(1, 'u', 'hi'), msg(2, 'u9', '/ai hỏi tiếp', 'Z')];
  const r = decideReplies({ messages: list, account: acc, lastId: 1, bots, isActive: () => true });
  assert.equal(r.tasks[0].kind, 'mention');
});

test('chen ngang ngẫu nhiên: chỉ một tin mỗi lần, chọn tin mới nhất của người thật', () => {
  const list = [msg(1, 'u', 'x'), msg(2, 'u2', 'hôm nay mưa quá', 'A'), msg(3, 'u3', 'ai đi chơi không', 'B')];
  const p = { chance: 1, rand: () => 0, ok: true, words: [] };
  const r = decideReplies({ messages: list, account: acc, lastId: 1, bots, proactive: p });
  assert.deepEqual(r.tasks.map((t) => [t.id, t.kind]), [[3, 'proactive']]);
});

test('chen ngang: xác suất 0, hết hạn mức giờ, từ nhạy cảm, tin của bot, tin ảnh đều không chen', () => {
  const base = [msg(1, 'u', 'x')];
  const run = (m, p) => decideReplies({ messages: [...base, m], account: acc, lastId: 1, bots, proactive: { chance: 1, rand: () => 0, ok: true, words: ['ngu'], ...p } }).tasks.length;
  assert.equal(run(msg(2, 'u2', 'chào cả nhà', 'A'), { chance: 0 }), 0);
  assert.equal(run(msg(2, 'u2', 'chào cả nhà', 'A'), { ok: false }), 0);
  assert.equal(run(msg(2, 'u2', 'mày ngu quá', 'A'), {}), 0);
  assert.equal(run(msg(2, 'bot2', 'chào cả nhà', 'Bot'), {}), 0);
  assert.equal(run(msg(2, 'u2', '[IMG=https://x/y.png]', 'A'), {}), 0);
  assert.equal(run(msg(2, 'u2', 'chào cả nhà', 'A'), {}), 1);
});

test('chen ngang: đang cãi vã thì đứng ngoài', () => {
  const list = [msg(1, 'u', 'x'), msg(2, 'a', 'đm mày', 'A'), msg(3, 'b', 'thằng ngu', 'B'), msg(4, 'c', 'cút đi', 'C'), msg(5, 'd', 'hôm nay vui ghê', 'D')];
  const p = { chance: 1, rand: () => 0, ok: true, words: ['đm', 'ngu', 'cút'] };
  assert.equal(decideReplies({ messages: list, account: acc, lastId: 1, bots, proactive: p }).tasks.length, 0);
});
