import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirective } from '../www/js/core/directive.js';

test('JSON chuẩn', () => {
  const d = parseDirective('{"reply":"chào nha","sticker":true,"draw":null,"manga":"One Piece","remember":"thích ăn bún"}');
  assert.deepEqual(d, { reply: 'chào nha', sticker: true, draw: '', manga: 'One Piece', remember: 'thích ăn bún' });
});

test('JSON bọc trong khối code', () => {
  const d = parseDirective('```json\n{"reply":"ok"}\n```');
  assert.equal(d.reply, 'ok'); assert.equal(d.sticker, false);
});

test('không phải JSON thì coi cả đoạn là câu trả lời', () => {
  assert.deepEqual(parseDirective('Chào bạn nhé'), { reply: 'Chào bạn nhé', sticker: false, draw: '', manga: '', remember: '' });
});

test('JSON hỏng nửa chừng vẫn cứu được phần reply', () => {
  assert.equal(parseDirective('{"reply":"xin chào cả nhà","sticker":tr').reply, 'xin chào cả nhà');
});

test('reply rỗng nhưng có sticker/draw vẫn hợp lệ', () => {
  const d = parseDirective('{"reply":"","sticker":true}');
  assert.equal(d.reply, ''); assert.equal(d.sticker, true);
});
