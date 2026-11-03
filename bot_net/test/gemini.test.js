import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, parseResponse, classifyError, generate, listModels } from '../www/js/core/gemini.js';
import { KeyPool } from '../www/js/core/keys.js';

const ok = (text, tokens = 10) => ({ status: 200, data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: tokens } } });

test('buildRequest: key đặt trong header, có hướng dẫn hệ thống và ngữ cảnh chat', () => {
  const r = buildRequest({ model: 'gemini-x', key: 'K', system: 'Bạn là Ly', context: [{ name: 'A', text: 'chào' }], question: 'khỏe không' });
  assert.equal(r.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
  assert.equal(r.headers['x-goog-api-key'], 'K');
  assert.ok(!r.url.includes('K='));
  assert.equal(r.data.systemInstruction.parts[0].text, 'Bạn là Ly');
  const u = r.data.contents[0].parts[0].text;
  assert.ok(u.includes('A: chào') && u.includes('khỏe không'));
});

test('parseResponse: lấy chữ và số token', () => {
  assert.deepEqual(parseResponse(ok('xin chào', 42).data), { text: 'xin chào', tokens: 42 });
});

test('parseResponse: bị chặn/rỗng thì ném lỗi blocked', () => {
  assert.throws(() => parseResponse({ promptFeedback: { blockReason: 'SAFETY' } }), (e) => e.kind === 'blocked');
  assert.throws(() => parseResponse({ candidates: [{ content: { parts: [] } }] }), (e) => e.kind === 'blocked');
});

test('classifyError', () => {
  assert.equal(classifyError(429, {}), 'quota');
  assert.equal(classifyError(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }), 'invalid');
  assert.equal(classifyError(403, {}), 'invalid');
  assert.equal(classifyError(404, {}), 'model');
  assert.equal(classifyError(503, {}), 'server');
});

test('generate: hết hạn mức key chính thì đổi sang key dự phòng sau delay đổi key', async () => {
  const pool = new KeyPool(['A', 'B'], { now: () => 0 });
  const used = [], sleeps = [];
  const http = async (r) => { used.push(r.headers['x-goog-api-key']); return r.headers['x-goog-api-key'] === 'A' ? { status: 429, data: {} } : ok('trả lời'); };
  const r = await generate({ http, pool, model: 'm', system: 's', context: [], question: 'q', keyDelayMs: 2000, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(r.text, 'trả lời');
  assert.deepEqual(used, ['A', 'B']);
  assert.deepEqual(sleeps, [2000]);
  assert.deepEqual(pool.usage('B', 'm'), { requests: 1, tokens: 10 });
});

test('generate: hết sạch key thì ném lỗi nokey kèm thời điểm thử lại', async () => {
  const pool = new KeyPool(['A'], { now: () => 0, cooldownMs: 5000 });
  const http = async () => ({ status: 429, data: {} });
  await assert.rejects(generate({ http, pool, model: 'm', system: '', context: [], question: 'q', sleep: async () => {} }), (e) => e.kind === 'nokey' && e.retryAt === 5000);
});

test('generate: giới hạn ký tự áp dụng lên câu trả lời', async () => {
  const pool = new KeyPool(['A']);
  const http = async () => ok('Hôm nay trời đẹp quá, mình đi chơi nhé các bạn ơi');
  const r = await generate({ http, pool, model: 'm', system: '', context: [], question: 'q', maxChars: 20, sleep: async () => {} });
  assert.ok(r.text.length <= 20);
});

test('listModels: chỉ mô hình hỗ trợ generateContent, kèm giới hạn token', async () => {
  const http = async () => ({ status: 200, data: { models: [
    { name: 'models/gemini-a', displayName: 'A', inputTokenLimit: 1000, outputTokenLimit: 100, supportedGenerationMethods: ['generateContent'] },
    { name: 'models/embed', displayName: 'E', supportedGenerationMethods: ['embedContent'] },
  ] } });
  const m = await listModels(http, 'K');
  assert.deepEqual(m.map((x) => x.id), ['gemini-a']);
  assert.equal(m[0].inputTokenLimit, 1000);
});

test('buildRequest: chế độ json và chế độ ảnh', () => {
  const j = buildRequest({ model: 'm', key: 'K', system: '', context: [], question: 'q', json: true });
  assert.equal(j.data.generationConfig.responseMimeType, 'application/json');
  const i = buildRequest({ model: 'm', key: 'K', system: '', context: [], question: 'q', image: true });
  assert.deepEqual(i.data.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
  assert.equal(i.data.generationConfig.responseMimeType, undefined);
});

test('generate: mode image trả về ảnh', async () => {
  const pool = new KeyPool(['A']);
  const http = async () => ({ status: 200, data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }], usageMetadata: { totalTokenCount: 9 } } });
  const r = await generate({ http, pool, model: 'img', system: '', context: [], question: 'vẽ mèo', mode: 'image', sleep: async () => {} });
  assert.equal(r.image.data, 'QUJD');
});

test('generate: mode json không cắt ký tự (việc cắt làm sau khi đọc JSON)', async () => {
  const pool = new KeyPool(['A']);
  const longJson = JSON.stringify({ reply: 'x'.repeat(300) });
  const http = async () => ok(longJson);
  const r = await generate({ http, pool, model: 'm', system: '', context: [], question: 'q', mode: 'json', maxChars: 50, sleep: async () => {} });
  assert.equal(r.text, longJson);
});
