import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleError, generate } from '../www/js/core/gemini.js';
import { KeyPool } from '../www/js/core/keys.js';
import { orderByBudget } from '../www/js/core/combo.js';

// Dạng lỗi 429 thật của Google (rút gọn) cho gói miễn phí
const flash429 = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota', details: [
  { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaDimensions: { model: 'gemini-3.8-flash' }, quotaValue: '20' }] },
  { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '78959s' }] } };
const pro429 = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota', details: [
  { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [
    { quotaId: 'GenerateContentInputTokensPerModelPerDay-FreeTier', quotaDimensions: { model: 'gemini-3.1-pro' } },
    { quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaDimensions: { model: 'gemini-3.1-pro' } },
    { quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaDimensions: { model: 'gemini-3.1-pro' } }] },
  { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '78958s' }] } };
const both = { error: { code: 429, message: 'q', details: [{ violations: [
  { quotaId: 'GenerateContentInputTokensPerModelPerMinute-FreeTier', quotaValue: '250000' },
  { quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaValue: '5' },
  { quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] }] } };

test('parseGoogleError (429 thật): 20 lượt/ngày, nghỉ ~22 giờ', () => {
  const g = parseGoogleError(flash429);
  assert.deepEqual([g.perDay, g.limit, g.noQuota, g.retryMs], [true, 20, false, 78959000]);
});

test('parseGoogleError: model Pro gói miễn phí không có hạn mức (mục hạn mức không có giá trị)', () => {
  const g = parseGoogleError(pro429);
  assert.equal(g.noQuota, true); assert.equal(g.limit, 0);
});

test('parseGoogleError: nhiều mục thì lấy giới hạn số LƯỢT (không lấy token), ưu tiên theo ngày; trả đủ danh sách để học', () => {
  const g = parseGoogleError(both);
  assert.deepEqual([g.perDay, g.limit], [true, 20]);
  assert.deepEqual(g.limits, [{ perDay: false, limit: 5 }, { perDay: true, limit: 20 }]);
});

test('generate: model không có hạn mức bị nghỉ theo thời gian Google báo, không học giới hạn 0, lỗi nêu rõ lý do', async () => {
  const pool = new KeyPool(['A'], { now: () => 0 });
  const learned = [];
  const err = await generate({ http: async () => ({ status: 429, data: pro429 }), pool, model: 'gemini-3.1-pro', system: '', context: [], question: 'q', sleep: async () => {}, onLimit: (m, l) => learned.push(l) }).catch((e) => e);
  assert.equal(err.kind, 'nokey');
  assert.match(err.why, /không có hạn mức/i);
  assert.deepEqual(learned, []);
  assert.equal(pool.retryAt('gemini-3.1-pro'), 78958000);
});

test('generate: học cả giới hạn theo phút và theo ngày từ một lỗi', async () => {
  const pool = new KeyPool(['A']);
  const learned = [];
  await generate({ http: async () => ({ status: 429, data: both }), pool, model: 'm', system: '', context: [], question: 'q', sleep: async () => {}, onLimit: (m, l) => learned.push(l) }).catch(() => {});
  assert.deepEqual(learned, [{ perDay: false, limit: 5 }, { perDay: true, limit: 20 }]);
});

test('generate: hạ cấp "invalid argument" được ghi nhớ ngay cả khi lần thử lại bị lỗi mạng', async () => {
  const pool = new KeyPool(['A']);
  const withThinking = [];
  let n = 0;
  const http = async (r) => {
    withThinking.push(!!r.data.generationConfig.thinkingConfig);
    n++;
    if (r.data.generationConfig.thinkingConfig) return { status: 400, data: { error: { status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.' } } };
    if (n === 2) throw new Error('timeout');
    return { status: 200, data: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } };
  };
  await generate({ http, pool, model: 'lite-x', system: '', context: [], question: 'q', sleep: async () => {} });
  assert.equal(withThinking.filter(Boolean).length, 1, 'chỉ thử thinking đúng một lần');
});

test('orderByBudget: model sắp hết hạn mức (>=95%) xuống cuối, giữ nguyên thứ tự ưu tiên của các model còn lại', () => {
  const pct = { a: 100, b: 10, c: null, d: 96 };
  assert.deepEqual(orderByBudget(['a', 'b', 'c', 'd'], (m) => pct[m]), ['b', 'c', 'a', 'd']);
  assert.deepEqual(orderByBudget(['x'], () => 100), ['x']);
});
