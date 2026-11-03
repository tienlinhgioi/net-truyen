import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleError, classifyError, generate } from '../www/js/core/gemini.js';
import { KeyPool } from '../www/js/core/keys.js';
import { LimitBook, percentOf } from '../www/js/core/limits.js';

const quota = (id, value, retry) => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota', details: [
  { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: id, quotaDimensions: { model: 'gemini-x' }, quotaValue: String(value) }] },
  ...(retry ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: retry }] : []),
] } });

test('parseGoogleError: đọc reason, hạn mức theo ngày/phút, giới hạn và thời gian chờ', () => {
  const day = parseGoogleError(quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier', 250));
  assert.deepEqual([day.perDay, day.limit, day.retryMs], [true, 250, 0]);
  const min = parseGoogleError(quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', 10, '35s'));
  assert.deepEqual([min.perDay, min.limit, min.retryMs], [false, 10, 35000]);
  assert.equal(parseGoogleError({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }).reason, 'API_KEY_INVALID');
  assert.deepEqual(parseGoogleError('rác'), { reason: '', message: '', perDay: false, limit: 0, retryMs: 0, quotaId: '', limits: [], noQuota: false, plan: '' });
});

test('classifyError: phân loại theo dữ liệu thật của Google', () => {
  assert.equal(classifyError(400, { error: { message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } }), 'invalid');
  assert.equal(classifyError(400, { error: { message: 'API key expired. Please renew the API key.', details: [{ reason: 'API_KEY_INVALID' }] } }), 'invalid');
  assert.equal(classifyError(403, { error: { message: 'Your API key was reported as leaked. Please use another API key.' } }), 'invalid');
  assert.equal(classifyError(403, { error: { details: [{ reason: 'CONSUMER_SUSPENDED' }] } }), 'invalid');
  assert.equal(classifyError(403, { error: { message: "Method doesn't allow unregistered callers" } }), 'denied', '403 khác chỉ là tạm thời, key chưa chắc chết');
  assert.equal(classifyError(429, quota('x', 1)), 'quota');
  assert.equal(classifyError(400, { error: { message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' } }), 'region');
  assert.equal(classifyError(404, {}), 'model');
  assert.equal(classifyError(503, {}), 'server');
});

test('KeyPool.fail: thời gian nghỉ tùy chỉnh', () => {
  let t = 0;
  const p = new KeyPool(['A'], { now: () => t, cooldownMs: 60000 });
  p.fail('A', 'quota', 'm', 5000);
  assert.equal(p.retryAt('m'), 5000);
  t = 5001; assert.equal(p.current('m'), 'A');
});

test('generate: hết hạn mức theo phút nghỉ đúng retryDelay, theo ngày nghỉ lâu hơn nhiều', async () => {
  const run = async (body) => {
    const pool = new KeyPool(['A'], { now: () => 0 });
    await generate({ http: async () => ({ status: 429, data: body }), pool, model: 'm', system: '', context: [], question: 'q', sleep: async () => {} }).catch(() => {});
    return pool.retryAt('m');
  };
  assert.equal(await run(quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', 10, '35s')), 35000);
  assert.ok((await run(quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier', 250))) >= 30 * 60000);
});

test('generate: 403 tạm thời không giết key; chỉ đánh dấu nghỉ', async () => {
  const pool = new KeyPool(['A'], { now: () => 0 });
  await generate({ http: async () => ({ status: 403, data: { error: { message: "Method doesn't allow unregistered callers" } } }), pool, model: 'm', system: '', context: [], question: 'q', sleep: async () => {} }).catch(() => {});
  assert.notEqual(pool.retryAt('m'), null, 'key còn sống, chỉ nghỉ một lúc');
});

test('generate: lỗi hạn mức được ném kèm giới hạn đã học để hiển thị phần trăm', async () => {
  const pool = new KeyPool(['A']);
  const seen = [];
  await generate({ http: async () => ({ status: 429, data: quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier', 250) }), pool, model: 'gemini-x', system: '', context: [], question: 'q', sleep: async () => {}, onLimit: (m, l) => seen.push([m, l]) }).catch(() => {});
  assert.deepEqual(seen, [['gemini-x', { perDay: true, limit: 250 }]]);
});

test('LimitBook: tự học giới hạn từ lỗi 429, người dùng đặt tay thì ưu tiên', () => {
  const b = new LimitBook({ 'gemini-x': { rpd: 100 } });
  assert.equal(b.get('gemini-x').rpd, 100);
  b.learn('gemini-y', { perDay: true, limit: 250 });
  b.learn('gemini-y', { perDay: false, limit: 10 });
  assert.deepEqual(b.get('gemini-y'), { rpd: 250, rpm: 10, learned: true });
  b.learn('gemini-x', { perDay: true, limit: 999 });
  assert.equal(b.get('gemini-x').rpd, 100, 'giá trị người dùng đặt không bị ghi đè');
  assert.deepEqual(b.get('lạ'), { rpd: 0, rpm: 0 });
  assert.deepEqual(LimitBook.from(b.toJSON()).get('gemini-y'), { rpd: 250, rpm: 10, learned: true });
});

test('percentOf: phần trăm đã dùng, chặn ở 100, 0 giới hạn thì null', () => {
  assert.equal(percentOf(37, 250), 15);
  assert.equal(percentOf(300, 250), 100);
  assert.equal(percentOf(5, 0), null);
});
