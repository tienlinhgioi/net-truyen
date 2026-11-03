import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImageResponse, pickSticker, ImageQuota } from '../www/js/core/media.js';

test('parseImageResponse: lấy ảnh inline từ Gemini', () => {
  const r = parseImageResponse({ candidates: [{ content: { parts: [{ text: 'đây' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }] });
  assert.deepEqual(r, { mime: 'image/png', data: 'QUJD', text: 'đây' });
});

test('parseImageResponse: không có ảnh thì ném lỗi noimage', () => {
  assert.throws(() => parseImageResponse({ candidates: [{ content: { parts: [{ text: 'xin lỗi' }] } }] }), (e) => e.kind === 'noimage');
});

test('pickSticker: chỉ lấy trong các bộ được chọn', () => {
  const packs = [{ id: 'a', urls: ['a1', 'a2'] }, { id: 'b', urls: ['b1'] }];
  assert.equal(pickSticker(packs, ['b'], () => 0.5), 'b1');
  assert.ok(['a1', 'a2'].includes(pickSticker(packs, ['a'], Math.random)));
  assert.equal(pickSticker(packs, [], () => 0), null);
  assert.equal(pickSticker(packs, ['zzz'], () => 0), null);
});

test('ImageQuota: giới hạn số ảnh mỗi ngày và thời gian chờ giữa 2 ảnh', () => {
  let t = new Date('2026-11-03T10:00:00').getTime();
  const q = new ImageQuota({ perDay: 2, cooldownMs: 60000, now: () => t });
  const stats = {};
  assert.equal(q.check(stats).ok, true);
  q.record(stats);
  assert.deepEqual(q.check(stats), { ok: false, reason: 'cooldown' });
  t += 61000; assert.equal(q.check(stats).ok, true);
  q.record(stats);
  t += 61000; assert.deepEqual(q.check(stats), { ok: false, reason: 'daily' });
  t = new Date('2026-11-04T00:05:00').getTime();
  assert.equal(q.check(stats).ok, true); // sang ngày mới
});
