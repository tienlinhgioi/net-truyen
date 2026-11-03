import test from 'node:test';
import assert from 'node:assert/strict';
import { ConvoTracker, UserMemory } from '../www/js/core/convo.js';

test('ConvoTracker: người vừa nói chuyện với bot được coi là đang trò chuyện trong N phút', () => {
  let t = 0;
  const c = new ConvoTracker({ windowMs: 180000, now: () => t });
  assert.equal(c.isActive('u1'), false);
  c.touch('u1', 'A', 'xin chào', 'chào bạn');
  assert.equal(c.isActive('u1'), true);
  t = 179000; assert.equal(c.isActive('u1'), true);
  t = 181000; assert.equal(c.isActive('u1'), false);
});

test('ConvoTracker: nhớ vài lượt hội thoại gần nhất của từng người', () => {
  const c = new ConvoTracker({ windowMs: 1e9, now: () => 0, maxTurns: 2 });
  c.touch('u1', 'A', 'q1', 'a1'); c.touch('u1', 'A', 'q2', 'a2'); c.touch('u1', 'A', 'q3', 'a3');
  assert.deepEqual(c.history('u1'), [{ q: 'q2', a: 'a2' }, { q: 'q3', a: 'a3' }]);
});

test('UserMemory: ghi chú về từng người, tối đa số ghi chú, không trùng', () => {
  const m = new UserMemory({ maxNotes: 3 });
  m.add('u1', 'An', 'thích bún');
  m.add('u1', 'An', 'thích bún');
  m.add('u1', 'An', 'học lớp 12'); m.add('u1', 'An', 'có mèo'); m.add('u1', 'An', 'ghét sáng sớm');
  assert.deepEqual(m.get('u1').notes, ['học lớp 12', 'có mèo', 'ghét sáng sớm']);
  assert.equal(m.get('u1').name, 'An');
  assert.deepEqual(m.get('zz').notes, []);
});

test('UserMemory: xuất và khôi phục', () => {
  const m = new UserMemory();
  m.add('u1', 'An', 'x');
  const k = UserMemory.from(m.toJSON());
  assert.deepEqual(k.get('u1').notes, ['x']);
});

test('UserMemory: quên một người', () => {
  const m = new UserMemory();
  m.add('u1', 'An', 'x'); m.add('u2', 'Bình', 'y');
  m.forget('u1');
  assert.deepEqual(m.get('u1').notes, []);
  assert.deepEqual(m.get('u2').notes, ['y']);
});
