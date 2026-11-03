import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyPool } from '../www/js/core/keys.js';

test('KeyPool: dùng key chính trước, lỗi thì chuyển key dự phòng', () => {
  let t = 1000;
  const p = new KeyPool(['A', 'B', 'C'], { now: () => t });
  assert.equal(p.current(), 'A');
  p.fail('A', 'quota');
  assert.equal(p.current(), 'B');
  p.fail('B', 'quota');
  assert.equal(p.current(), 'C');
});

test('KeyPool: key lỗi hồi lại sau thời gian nghỉ', () => {
  let t = 0;
  const p = new KeyPool(['A', 'B'], { now: () => t, cooldownMs: 60000 });
  p.fail('A', 'quota');
  assert.equal(p.current(), 'B');
  t = 61000;
  assert.equal(p.current(), 'A'); // ưu tiên key chính khi đã hồi
});

test('KeyPool: key sai (invalid) bị loại hẳn', () => {
  let t = 0;
  const p = new KeyPool(['A', 'B'], { now: () => t, cooldownMs: 1000 });
  p.fail('A', 'invalid');
  t = 10 ** 9;
  assert.equal(p.current(), 'B');
});

test('KeyPool: hết key khả dụng trả null và báo thời điểm sớm nhất thử lại', () => {
  let t = 0;
  const p = new KeyPool(['A'], { now: () => t, cooldownMs: 5000 });
  p.fail('A', 'quota');
  assert.equal(p.current(), null);
  assert.equal(p.retryAt(), 5000);
});

test('KeyPool: đếm lượt dùng theo key/mô hình/ngày', () => {
  const p = new KeyPool(['A'], { now: () => new Date('2026-11-03T10:00:00').getTime() });
  p.record('A', 'gemini-x', 120);
  p.record('A', 'gemini-x', 80);
  assert.deepEqual(p.usage('A', 'gemini-x'), { requests: 2, tokens: 200 });
  assert.deepEqual(p.usage('A', 'khac'), { requests: 0, tokens: 0 });
});
