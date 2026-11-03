import test from 'node:test';
import assert from 'node:assert/strict';
import { LimitBook, quotaDay } from '../www/js/core/limits.js';
import { parseGoogleError, detectPlan, checkModel } from '../www/js/core/gemini.js';
import { parseKeys, filterKeys } from '../www/js/core/keys.js';

const free429 = { error: { code: 429, message: 'q', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] }] } };
const paid429 = { error: { code: 429, message: 'q', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel', quotaValue: '1000' }] }] } };

test('quotaDay: ngày hạn mức tính theo giờ Thái Bình Dương (Google làm mới lúc nửa đêm ở đó), không phải giờ máy', () => {
  assert.equal(quotaDay(new Date('2026-11-03T23:00:00+07:00').getTime()), '2026-11-03'); // 08:00 sáng 3/11 ở LA
  assert.equal(quotaDay(new Date('2026-11-04T05:00:00+07:00').getTime()), '2026-11-03'); // 14:00 ngày 3/11 ở LA: giờ VN đã sang 4/11 nhưng hạn mức chưa làm mới
  assert.equal(quotaDay(new Date('2026-11-04T16:00:00+07:00').getTime()), '2026-11-04'); // 01:00 ngày 4/11 ở LA: đã làm mới
});

test('parseGoogleError: nhận biết gói theo tên hạn mức', () => {
  assert.equal(parseGoogleError(free429).plan, 'free');
  assert.equal(parseGoogleError(paid429).plan, 'paid');
  assert.equal(parseGoogleError({}).plan, '');
});

test('LimitBook: giới hạn học được tách riêng theo gói (miễn phí / trả phí)', () => {
  const b = new LimitBook();
  b.learn('m', { perDay: true, limit: 20 }, 'free');
  b.learn('m', { perDay: true, limit: 10000 }, 'paid');
  assert.equal(b.get('m', 'free').rpd, 20);
  assert.equal(b.get('m', 'paid').rpd, 10000);
  assert.equal(b.get('m', 'free').learned, true);
  assert.equal(b.get('m').rpd, 20, 'chưa rõ gói thì dùng giá trị gói miễn phí đã học');
  const k = LimitBook.from(b.toJSON());
  assert.equal(k.get('m', 'paid').rpd, 10000);
});

test('LimitBook: đọc được dữ liệu cũ (chưa chia gói) như gói miễn phí', () => {
  const b = LimitBook.from({ m: { rpd: 20, rpm: 5 } });
  assert.deepEqual([b.get('m', 'free').rpd, b.get('m', 'free').rpm], [20, 5]);
});

test('detectPlan: thử model Pro: chạy được = trả phí, 429 FreeTier = miễn phí', async () => {
  const list = { status: 200, data: { models: [{ name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.1-pro-preview', supportedGenerationMethods: ['generateContent'] }] } };
  const mk = (probe) => async (r) => (r.method === 'GET' ? list : probe(r));
  assert.equal(await detectPlan(mk(() => ({ status: 200, data: { candidates: [{ content: { parts: [{ text: 'x' }] } }] } })), 'K'), 'paid');
  assert.equal(await detectPlan(mk(() => ({ status: 429, data: { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } } })), 'K'), 'free');
  assert.equal(await detectPlan(mk(() => ({ status: 404, data: {} })), 'K'), 'unknown');
  assert.equal(await detectPlan(async (r) => (r.method === 'GET' ? { status: 200, data: { models: [] } } : { status: 200, data: {} }), 'K'), 'unknown', 'không có model Pro để thử');
});

test('detectPlan: model Pro đầu tiên bị 404 thì thử tiếp model Pro khác (thực tế gemini-2.5-pro không còn cho key mới)', async () => {
  const list = { status: 200, data: { models: ['gemini-2.5-pro', 'gemini-pro-latest', 'gemini-3.1-pro-preview'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) } };
  const probed = [];
  const http = async (r) => {
    if (r.method === 'GET') return list;
    const m = /models\/([^:]+):/.exec(r.url)[1]; probed.push(m);
    return m === 'gemini-2.5-pro' ? { status: 404, data: {} } : { status: 429, data: { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } } };
  };
  assert.equal(await detectPlan(http, 'K'), 'free');
  assert.deepEqual(probed, ['gemini-2.5-pro', 'gemini-pro-latest']);
});

test('checkModel: kèm gói nhận biết được khi bị 429', async () => {
  const r = await checkModel(async () => ({ status: 429, data: free429 }), 'K', 'm', () => 0);
  assert.equal(r.plan, 'free');
});

test('parseKeys: dán nhiều key một lần (xuống dòng, dấu phẩy, khoảng trắng), bỏ trùng và rác', () => {
  const t = 'AQ.FakeKeyForTests_0123456789_abcdefghijklmnop\n  AIzaSyD-abcdefghijklmnopqrstuvwxyz12345 , rác ngắn\nAQ.FakeKeyForTests_0123456789_abcdefghijklmnop';
  assert.deepEqual(parseKeys(t), ['AQ.FakeKeyForTests_0123456789_abcdefghijklmnop', 'AIzaSyD-abcdefghijklmnopqrstuvwxyz12345']);
  assert.deepEqual(parseKeys(''), []);
});

test('filterKeys: tìm nhanh theo một đoạn key, tên tài khoản, gói hoặc trạng thái', () => {
  const rows = [
    { key: 'AQ.FakeKeyForT', account: 'Tiểu Ly', plan: 'free', state: 'ok' },
    { key: 'AIzaSyBBBB', account: 'Mazindo', plan: 'paid', state: 'quota' },
    { key: 'AIzaSyCCCC', account: 'Mazindo', plan: 'free', state: 'invalid' },
  ];
  assert.deepEqual(filterKeys(rows, 'fakek').map((r) => r.key), ['AQ.FakeKeyForT']);
  assert.deepEqual(filterKeys(rows, 'mazindo').length, 2);
  assert.deepEqual(filterKeys(rows, 'trả phí').map((r) => r.account), ['Mazindo']);
  assert.deepEqual(filterKeys(rows, 'sai').map((r) => r.key), ['AIzaSyCCCC']);
  assert.deepEqual(filterKeys(rows, 'hết hạn mức').map((r) => r.key), ['AIzaSyBBBB']);
  assert.equal(filterKeys(rows, '').length, 3);
});
