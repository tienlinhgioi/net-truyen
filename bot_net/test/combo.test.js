import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyPool } from '../www/js/core/keys.js';
import { comboFor, ModelHealth } from '../www/js/core/combo.js';
import { generateCombo, checkKey, checkModel, checkKeys } from '../www/js/core/gemini.js';

const ok = (text = 'xin chào', tokens = 5) => ({ status: 200, data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: tokens } } });

test('KeyPool: hết hạn mức của một model không khóa các model khác', () => {
  let t = 0;
  const p = new KeyPool(['A'], { now: () => t, cooldownMs: 5000 });
  p.fail('A', 'quota', 'm1');
  assert.equal(p.current('m1'), null);
  assert.equal(p.current('m2'), 'A');
  assert.equal(p.retryAt('m1'), 5000);
  t = 6000;
  assert.equal(p.current('m1'), 'A');
});

test('comboFor: ưu tiên combo của tài khoản, rồi combo chung, rồi model cũ', () => {
  const st = { model: 'old', combo: { text: ['g1'], image: ['img1'], vision: [] } };
  assert.deepEqual(comboFor({ combo: { text: ['a1', 'a2'] }, model: '' }, st, 'text'), ['a1', 'a2']);
  assert.deepEqual(comboFor({ combo: { text: [] }, model: '' }, st, 'text'), ['g1']);
  assert.deepEqual(comboFor({ combo: {}, model: '' }, { model: 'old', combo: {} }, 'text'), ['old']);
  assert.deepEqual(comboFor({ combo: {}, model: '' }, st, 'image'), ['img1']);
  assert.deepEqual(comboFor({ combo: {}, model: '' }, st, 'vision'), []);
});

test('ModelHealth: model chết được bỏ qua một lúc rồi thử lại', () => {
  let t = 0;
  const h = new ModelHealth({ now: () => t, ttlMs: 1000 });
  h.mark('m', false);
  assert.equal(h.isDead('m'), true);
  t = 1500;
  assert.equal(h.isDead('m'), false);
  h.mark('x', true);
  assert.equal(h.isDead('x'), false);
});

test('generateCombo: model đầu chết (404) thì sang model kế, model chết được ghi nhớ', async () => {
  const pool = new KeyPool(['A']);
  const health = new ModelHealth();
  const used = [];
  const http = async (r) => { const m = /models\/([^:]+):/.exec(r.url)[1]; used.push(m); return m === 'm1' ? { status: 404, data: {} } : ok('từ m2'); };
  const r = await generateCombo({ http, pool, health, models: ['m1', 'm2'], system: '', context: [], question: 'q', sleep: async () => {} });
  assert.equal(r.text, 'từ m2'); assert.equal(r.model, 'm2');
  assert.equal(health.isDead('m1'), true);
  used.length = 0;
  await generateCombo({ http, pool, health, models: ['m1', 'm2'], system: '', context: [], question: 'q', sleep: async () => {} });
  assert.deepEqual(used, ['m2'], 'lần sau bỏ qua m1');
});

test('generateCombo: hết hạn mức model đầu thì dùng model kế (hạn mức tính theo model)', async () => {
  const pool = new KeyPool(['A']);
  const http = async (r) => (r.url.includes('models/m1:') ? { status: 429, data: {} } : ok('từ m2'));
  const r = await generateCombo({ http, pool, health: new ModelHealth(), models: ['m1', 'm2'], system: '', context: [], question: 'q', sleep: async () => {} });
  assert.equal(r.model, 'm2');
});

test('generateCombo: không có model nào dùng được thì ném lỗi', async () => {
  const pool = new KeyPool(['A']);
  const http = async () => ({ status: 404, data: {} });
  await assert.rejects(generateCombo({ http, pool, health: new ModelHealth(), models: ['m1'], system: '', context: [], question: 'q', sleep: async () => {} }), (e) => e.kind === 'nomodel');
});

test('checkModel: sống/chết kèm độ trễ', async () => {
  let t = 0;
  const live = await checkModel(async () => { t += 120; return ok('hi'); }, 'K', 'm', () => t);
  assert.deepEqual(live, { alive: true, state: 'ok', ms: 120 });
  const dead = await checkModel(async () => ({ status: 404, data: {} }), 'K', 'm', () => 0);
  assert.equal(dead.alive, false); assert.equal(dead.state, 'model');
  const quota = await checkModel(async () => ({ status: 429, data: {} }), 'K', 'm', () => 0);
  assert.equal(quota.alive, true); assert.equal(quota.state, 'quota'); // model còn, chỉ hết hạn mức
});

test('checkKey: sai / hết hạn mức / sống', async () => {
  assert.equal((await checkKey(async () => ({ status: 400, data: { error: { message: 'API key not valid' } } }), 'K')).state, 'invalid');
  assert.equal((await checkKey(async () => ({ status: 429, data: {} }), 'K', 'm')).state, 'quota');
  assert.equal((await checkKey(async () => ok(), 'K', 'm')).state, 'ok');
  assert.equal((await checkKey(async () => ({ status: 200, data: { models: [] } }), 'K')).state, 'ok'); // không có model: kiểm tra bằng danh sách
});

test('checkKeys: kiểm tra đồng loạt, giữ thứ tự, không quá giới hạn song song', async () => {
  let running = 0, peak = 0;
  const http = async (r) => { running++; peak = Math.max(peak, running); await new Promise((x) => setTimeout(x, 5)); running--; return r.headers['x-goog-api-key'] === 'BAD' ? { status: 400, data: { error: { message: 'API key not valid' } } } : { status: 200, data: { models: [] } }; };
  const r = await checkKeys(http, ['A', 'BAD', 'C', 'D', 'E'], { concurrency: 2 });
  assert.deepEqual(r.map((x) => x.state), ['ok', 'invalid', 'ok', 'ok', 'ok']);
  assert.ok(peak <= 2);
});
