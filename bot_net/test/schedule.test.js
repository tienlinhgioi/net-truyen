import test from 'node:test';
import assert from 'node:assert/strict';
import { isActive } from '../www/js/core/schedule.js';

const d = (s) => new Date(s); // giờ địa phương của máy chạy test

test('tắt lịch thì luôn chạy', () => {
  assert.equal(isActive(d('2026-11-03T03:00:00'), { enabled: false }), true);
});

test('khung giờ trong ngày', () => {
  const s = { enabled: true, from: '08:00', to: '22:00' };
  assert.equal(isActive(d('2026-11-03T09:00:00'), s), true);
  assert.equal(isActive(d('2026-11-03T23:00:00'), s), false);
  assert.equal(isActive(d('2026-11-03T07:59:00'), s), false);
});

test('khung giờ qua nửa đêm', () => {
  const s = { enabled: true, from: '22:00', to: '06:00' };
  assert.equal(isActive(d('2026-11-03T23:30:00'), s), true);
  assert.equal(isActive(d('2026-11-03T05:00:00'), s), true);
  assert.equal(isActive(d('2026-11-03T12:00:00'), s), false);
});

test('thứ trong tuần (0=CN)', () => {
  const s = { enabled: true, weekdays: [1, 2, 3] }; // T2 T3 T4
  assert.equal(isActive(d('2026-11-03T12:00:00'), s), true); // thứ 3
  assert.equal(isActive(d('2026-11-07T12:00:00'), s), false); // thứ 7
});

test('khoảng ngày tháng năm', () => {
  const s = { enabled: true, dateFrom: '2026-11-01', dateTo: '2026-11-30' };
  assert.equal(isActive(d('2026-11-15T12:00:00'), s), true);
  assert.equal(isActive(d('2026-12-01T00:30:00'), s), false);
  assert.equal(isActive(d('2026-10-31T23:59:00'), s), false);
  assert.equal(isActive(d('2026-11-30T23:59:00'), s), true);
});
