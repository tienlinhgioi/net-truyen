import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountBot, BotSet } from '../www/js/core/runner.js';
import { RoomFeed } from '../www/js/core/feed.js';
import { ChatClient } from '../www/js/core/chatclient.js';
import { defaultAccount, defaultSettings } from '../www/js/core/store.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const m = (id, user, message, name = 'X') => ({ id, user_id: user, name, message, manga: null });
const gem = (text) => ({ status: 200, data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 1 } } });

test('quét chat KHÔNG bị dừng khi bot đang gõ/chờ/gửi tin (thời gian thật, thu nhỏ)', async () => {
  const t0 = Date.now();
  const polls = [];
  let n = 0;
  const mentions = [m(2, 'u1', '/ai một', 'A'), m(3, 'u2', '/ai hai', 'B'), m(4, 'u3', '/ai ba', 'C')];
  const http = async (r) => {
    if (r.url.endsWith('/ajax/chat/list')) {
      await wait(20); polls.push(Date.now() - t0);
      const now = Date.now() - t0;
      return { status: 200, headers: {}, data: { status: true, data: now < 250 ? [m(1, 'u', 'x')] : [m(1, 'u', 'x'), ...mentions] } };
    }
    if (r.url.includes('generativelanguage')) { await wait(60); return gem(JSON.stringify({ reply: `trả lời ${++n}` })); }
    if (r.url.endsWith('/ajax/chat/send')) { await wait(20); return { status: 200, headers: {}, data: { status: true } }; }
    return { status: 200, headers: {}, data: { status: true } };
  };
  const a = { ...defaultAccount(), id: 'a1', cookies: { UserID: '1' }, name: 'Ly', displayName: 'Ly', keys: ['K'], model: 'm' };
  const st = { ...defaultSettings(), pollMs: 100, chatDelayMs: 150, typingPerCharMs: 0, typingMinMs: 200, typingMaxMs: 200, hedgeMs: 0 };
  const bot = new AccountBot({ account: a, getSettings: () => st, http, bots: new BotSet(), rand: () => 0.5 });
  const run = bot.start();
  await wait(1700);
  bot.stop(); await run;
  assert.ok(n >= 3, `đã trả lời ${n} tin`);
  // khoảng cách giữa các lần quét liên tiếp, tính cả lần quét ngay trước khi tin nhắn xuất hiện
  const gaps = polls.slice(1).map((p, i) => ({ end: p, gap: p - polls[i] })).filter((g) => g.end > 300).map((g) => g.gap);
  const worst = Math.max(...gaps);
  console.log('  [đo] khoảng cách quét lâu nhất khi bận:', worst, 'ms (pollMs=100)');
  assert.ok(worst < 350, `khoảng cách quét lâu nhất ${worst}ms (phải gần 100ms; lúc bận không được dừng quét): ${JSON.stringify(gaps)}`);
});

test('chu kỳ quét = pollMs (thời gian quét được trừ vào thời gian nghỉ, không cộng thêm)', async () => {
  let clock = 0;
  const sleeps = [];
  const http = async (r) => { if (r.url.endsWith('/ajax/chat/list')) { clock += 500; return { status: 200, headers: {}, data: { status: true, data: [m(1, 'u', 'x')] } }; } return { status: 200, headers: {}, data: { status: true } }; };
  const a = { ...defaultAccount(), id: 'a1', cookies: { UserID: '1' }, name: 'Ly', displayName: 'Ly', keys: ['K'], model: 'm' };
  let bot;
  const sleep = async (ms) => { sleeps.push(ms); clock += ms; if (sleeps.filter((x) => x > 120).length >= 2) bot.stop(); };
  bot = new AccountBot({ account: a, getSettings: () => ({ ...defaultSettings(), pollMs: 1000 }), http, bots: new BotSet(), now: () => new Date(clock), sleep });
  await bot.start();
  const cycle = sleeps.filter((x) => x > 120);
  assert.ok(cycle.every((x) => x <= 500), 'nghỉ chỉ còn phần chưa dùng của chu kỳ: ' + JSON.stringify(sleeps));
});

test('RoomFeed: nhiều bot cùng phòng chia sẻ một lần quét; hết hạn thì quét lại', async () => {
  let t = 0, calls = 0;
  const feed = new RoomFeed({ now: () => t, maxAgeMs: 700 });
  const fetcher = async () => { calls++; await wait(5); return [calls]; };
  const [a, b, c] = await Promise.all([feed.get(fetcher), feed.get(fetcher), feed.get(fetcher)]);
  assert.deepEqual([a, b, c], [[1], [1], [1]]);
  assert.equal(calls, 1);
  t = 300; await feed.get(fetcher); assert.equal(calls, 1, 'còn mới thì dùng lại');
  t = 800; await feed.get(fetcher); assert.equal(calls, 2, 'cũ thì quét lại');
});

test('RoomFeed: lần quét chung bị lỗi thì từng bot tự quét bằng phiên của mình (không kéo cả nhóm đăng nhập lại)', async () => {
  const feed = new RoomFeed({ now: () => 0, maxAgeMs: 700 });
  let own = 0;
  const bad = async () => { await wait(5); throw new Error('phiên hết hạn'); };
  const good = async () => { own++; return ['ok']; };
  const [x, y] = await Promise.allSettled([feed.get(bad), feed.get(good)]);
  assert.equal(x.status, 'rejected');
  assert.deepEqual(y.value, ['ok']);
  assert.equal(own, 1);
});

test('ChatClient: mỗi yêu cầu có giới hạn thời gian (một yêu cầu treo không được chặn cả vòng quét)', async () => {
  const seen = {};
  const http = async (r) => { seen[`${r.method} ${r.url.replace('https://nettruyen15s.com', '')}`] = r.timeout; return { status: 200, headers: {}, data: { status: true, data: [] } }; };
  const c = new ChatClient({ http });
  await c.listChat(); await c.sendChat('x');
  assert.ok(seen['GET /ajax/chat/list'] <= 10000, 'quét chat tối đa 10 giây');
  assert.ok(seen['POST /ajax/chat/send'] <= 20000);
});
