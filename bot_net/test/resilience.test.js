import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, generateCombo } from '../www/js/core/gemini.js';
import { KeyPool } from '../www/js/core/keys.js';
import { ModelHealth } from '../www/js/core/combo.js';
import { parseDirective } from '../www/js/core/directive.js';

const ok = (text) => ({ status: 200, data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 3 } } });
const base = { system: 'S', context: [], question: 'q', sleep: async () => {} };

test('400 "invalid argument" không nói rõ nguyên nhân: tự bỏ dần thinking, JSON, hướng dẫn hệ thống cho tới khi được', async () => {
  const pool = new KeyPool(['A']);
  const seen = [];
  const http = async (r) => {
    const g = r.data.generationConfig;
    seen.push(!!g.thinkingConfig);
    return g.thinkingConfig ? { status: 400, data: { error: { status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.' } } } : ok('xong');
  };
  const r = await generate({ ...base, http, pool, model: 'lite-1', mode: 'json' });
  assert.equal(r.text, 'xong');
  assert.deepEqual(seen, [true, false]);
  assert.equal(pool.current('lite-1'), 'A', 'không bị tính là lỗi key');
});

test('lỗi mạng/quá thời gian được coi là lỗi tạm: chuyển sang model kế trong combo', async () => {
  const pool = new KeyPool(['A']);
  const http = async (r) => { if (r.url.includes('models/m1:')) throw new Error('timeout'); return ok('từ m2'); };
  const r = await generateCombo({ ...base, http, pool, health: new ModelHealth(), models: ['m1', 'm2'] });
  assert.equal(r.model, 'm2');
});

test('model bận (503): chỉ thử lại một lần, rồi bỏ qua ngắn hạn (45 giây) thay vì kẹt lâu', async () => {
  let t = 0;
  const pool = new KeyPool(['A'], { now: () => t });
  const health = new ModelHealth({ now: () => t });
  let m1calls = 0;
  const http = async (r) => { if (r.url.includes('models/m1:')) { m1calls++; return { status: 503, data: { error: { message: 'high demand' } } }; } return ok('từ m2'); };
  await generateCombo({ ...base, http, pool, health, models: ['m1', 'm2'] });
  assert.equal(m1calls, 2, 'thử 1 lần + 1 lần lại');
  m1calls = 0;
  await generateCombo({ ...base, http, pool, health, models: ['m1', 'm2'] });
  assert.equal(m1calls, 0, 'còn trong thời gian nghỉ ngắn');
  t = 46000;
  await generateCombo({ ...base, http, pool, health, models: ['m1', 'm2'] });
  assert.ok(m1calls > 0, 'hết thời gian nghỉ thì thử lại');
});

test('hedge: model đầu chậm quá ngưỡng thì chạy song song model kế và lấy kết quả nào về trước', async () => {
  const pool = new KeyPool(['A']);
  const http = async (r) => {
    if (r.url.includes('models/slow:')) { await new Promise((x) => setTimeout(x, 300)); return ok('chậm'); }
    return ok('nhanh');
  };
  const t0 = Date.now();
  const r = await generateCombo({ ...base, http, pool, health: new ModelHealth(), models: ['slow', 'fast'], hedgeMs: 30 });
  assert.equal(r.text, 'nhanh');
  assert.ok(Date.now() - t0 < 200);
});

test('hedge: nếu model đầu trả lời kịp thì không gọi model thứ hai', async () => {
  const pool = new KeyPool(['A']);
  const used = [];
  const http = async (r) => { used.push(/models\/([^:]+):/.exec(r.url)[1]); return ok('ổn'); };
  await generateCombo({ ...base, http, pool, health: new ModelHealth(), models: ['m1', 'm2'], hedgeMs: 50 });
  assert.deepEqual(used, ['m1']);
});

test('parseDirective: tìm JSON nằm trong đoạn văn, và không gửi đoạn "suy nghĩ" của model vào chat', () => {
  assert.equal(parseDirective('Đây là câu trả lời:\n{"reply":"chào nha"}').reply, 'chào nha');
  const reasoning = '*   Persona: Ly, 18 years old, playful/joking.\n*   Constraint: Return ONLY a valid JSON.\n*   Format: {"reply": ...}';
  assert.equal(parseDirective(reasoning).reply, '');
  assert.equal(parseDirective('Chào bạn nhé').reply, 'Chào bạn nhé');
});
