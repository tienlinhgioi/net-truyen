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
