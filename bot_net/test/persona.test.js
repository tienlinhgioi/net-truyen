import test from 'node:test';
import assert from 'node:assert/strict';
import { moodFor, typingDelayMs, splitReply, isRepeat, sensitiveHit, isQuarrel } from '../www/js/core/persona.js';

test('moodFor: tâm trạng theo giờ', () => {
  assert.match(moodFor(new Date('2026-11-03T06:00:00')), /sáng/);
  assert.match(moodFor(new Date('2026-11-03T12:30:00')), /trưa/);
  assert.match(moodFor(new Date('2026-11-03T20:00:00')), /tối/);
  assert.match(moodFor(new Date('2026-11-03T02:00:00')), /khuya/);
});

test('typingDelayMs: tỉ lệ độ dài, có chặn dưới/trên, có độ lệch ngẫu nhiên', () => {
  const o = { perCharMs: 40, minMs: 800, maxMs: 4000 };
  assert.equal(typingDelayMs(1, o, () => 0.5), 800);
  assert.equal(typingDelayMs(50, o, () => 0.5), 2000);
  assert.equal(typingDelayMs(1000, o, () => 0.5), 4000);
  assert.ok(typingDelayMs(50, o, () => 0) < typingDelayMs(50, o, () => 1));
});

test('splitReply: tách tối đa 2 tin ở chỗ xuống dòng hoặc cuối câu khi dài', () => {
  assert.deepEqual(splitReply('ngắn thôi'), ['ngắn thôi']);
  assert.deepEqual(splitReply('câu một\n\ncâu hai'), ['câu một', 'câu hai']);
  const long = 'Hôm nay mình đi chơi rất vui. ' + 'Mình ăn rất nhiều món ngon ở chợ đêm và gặp nhiều bạn. '.repeat(3);
  const r = splitReply(long, 100);
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => x.length <= 200));
  assert.equal(splitReply('a\n\nb\n\nc').length, 2); // không quá 2
});

test('isRepeat: giống câu vừa gửi gần đây (không phân biệt hoa thường/dấu câu)', () => {
  const recent = ['Chào bạn nhé!', 'ok luôn'];
  assert.equal(isRepeat('chào bạn nhé', recent), true);
  assert.equal(isRepeat('Chào bạn, hôm nay sao', recent), false);
});

test('sensitiveHit và isQuarrel', () => {
  assert.equal(sensitiveHit('mày ngu vãi', ['ngu vãi']), true);
  assert.equal(sensitiveHit('chào', ['ngu vãi']), false);
  const msgs = ['đm mày', 'thằng ngu', 'cút', 'ok'].map((message) => ({ message }));
  assert.equal(isQuarrel(msgs, ['đm', 'ngu', 'cút'], 3), true);
  assert.equal(isQuarrel(msgs, ['đm'], 3), false);
});
