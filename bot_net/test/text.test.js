import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, isMentioned, stripTrigger, limitChars } from '../www/js/core/text.js';

test('normalize: bỏ dấu, hoa thường, đ', () => {
  assert.equal(normalize('  Tiểu Ly ĐẠO  '), 'tieu ly dao');
});

test('isMentioned: lệnh mặc định ở đầu tin', () => {
  const acc = { name: 'Tiểu Ly', aliases: [], command: '/ai' };
  assert.equal(isMentioned('/ai kể chuyện đi', acc), true);
  assert.equal(isMentioned('xin chào mọi người', acc), false);
});

test('isMentioned: tên gọi, không phân biệt dấu/hoa thường', () => {
  const acc = { name: 'Tiểu Ly', aliases: ['ly ly', 'bé ly'], command: '/ai' };
  assert.equal(isMentioned('tieu ly ơi', acc), true);
  assert.equal(isMentioned('Bé LY đâu rồi', acc), true);
  assert.equal(isMentioned('@Tiểu Ly hỏi chút', acc), true);
});

test('isMentioned: chịu sai chính tả nhẹ với tên dài, không khớp bừa với tên ngắn', () => {
  assert.equal(isMentioned('mazindoo ơi', { name: 'MAZINDO', aliases: [], command: '/ai' }), true);
  assert.equal(isMentioned('lan ơi', { name: 'Lam', aliases: [], command: '/ai' }), false);
});

test('isMentioned: không khớp giữa từ khác', () => {
  assert.equal(isMentioned('ailytics là gì', { name: 'Ly', aliases: [], command: '/ai' }), false);
});

test('stripTrigger: bỏ lệnh/tên khỏi câu hỏi', () => {
  const acc = { name: 'Tiểu Ly', aliases: [], command: '/ai' };
  assert.equal(stripTrigger('/ai kể chuyện đi', acc), 'kể chuyện đi');
  assert.equal(stripTrigger('Tiểu Ly ơi hôm nay sao', acc), 'ơi hôm nay sao');
});

test('limitChars: cắt ở ranh giới từ, không vượt giới hạn', () => {
  const t = 'Hôm nay trời đẹp quá, mình đi chơi nhé các bạn ơi';
  const r = limitChars(t, 20);
  assert.ok(r.length <= 20, r);
  assert.ok(t.startsWith(r.replace(/…$/, '').trimEnd()));
  assert.equal(limitChars('ngắn', 20), 'ngắn');
  assert.equal(limitChars('abc', 0), 'abc'); // 0 = không giới hạn
});
