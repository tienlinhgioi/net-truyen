import test from 'node:test';
import assert from 'node:assert/strict';
import { botChainLength, allowedToReply } from '../www/js/core/loopguard.js';

const bots = new Set(['b1', 'b2']);
const m = (id, user) => ({ id, user_id: user });

test('botChainLength: đếm tin liên tiếp của bot tính đến tin đang xét', () => {
  const list = [m(1, 'u'), m(2, 'b1'), m(3, 'b2'), m(4, 'b1')];
  assert.equal(botChainLength(list, 3, bots), 2);
  assert.equal(botChainLength(list, 4, bots), 3);
  assert.equal(botChainLength(list, 1, bots), 0);
});

test('allowedToReply: người thật luôn được trả lời', () => {
  assert.equal(allowedToReply([m(1, 'u')], 1, bots, 2), true);
});

test('allowedToReply: bot trả lời bot tối đa 2 tin liên tiếp rồi dừng (chống vòng lặp vô tận)', () => {
  const list = [m(1, 'u'), m(2, 'b1'), m(3, 'b2'), m(4, 'b1'), m(5, 'b2')];
  assert.equal(allowedToReply(list, 2, bots, 2), true); // chuỗi bot dài 1
  assert.equal(allowedToReply(list, 3, bots, 2), true); // dài 2
  assert.equal(allowedToReply(list, 4, bots, 2), false); // dài 3 -> dừng
  assert.equal(allowedToReply(list, 5, bots, 2), false);
});

test('allowedToReply: người thật chen vào thì chuỗi được tính lại', () => {
  const list = [m(1, 'b1'), m(2, 'b2'), m(3, 'b1'), m(4, 'u'), m(5, 'b2')];
  assert.equal(allowedToReply(list, 5, bots, 2), true);
});
