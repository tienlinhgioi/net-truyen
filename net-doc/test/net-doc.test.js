import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeSite, wait } from './helpers.js';
import { Site } from '../src/site.js';
import { parseChapters, parseIds, slugOf } from '../src/parse.js';
import { readAccount } from '../src/reader.js';
import { loadConfig, validateConfig, DEFAULT_CONFIG } from '../src/config.js';
import { writeFileSync, mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fast = { viewWaitMs: 30, betweenChaptersMs: 5, betweenLoopsMs: 40, jitterPercent: 0, requestTimeoutMs: 2000, retryLoginMs: 30, retryPageMs: 5, reloginEveryMs: 1e9 };
const quiet = () => {};

test('slugOf: lấy mã truyện từ link (có/không có chương, có tham số)', () => {
  assert.equal(slugOf('https://nettruyen15s.com/manga/vo-luyen-dinh-phong'), 'vo-luyen-dinh-phong');
  assert.equal(slugOf('https://nettruyen15s.com/manga/vo-luyen-dinh-phong/chapter-12?x=1#c'), 'vo-luyen-dinh-phong');
  assert.equal(slugOf('/manga/abc/'), 'abc');
  assert.equal(slugOf('không phải link'), null);
});

test('parseChapters: lấy mọi chương của đúng truyện, bỏ trùng, sắp tăng dần theo số chương', () => {
  const html = '<a href="/manga/a/chapter-10">x</a><a href="https://w.com/manga/a/chapter-2">x</a><a href="/manga/a/chapter-2">dup</a><a href="/manga/a/chapter-10-5">x</a><a href="/manga/khac/chapter-1">x</a>';
  assert.deepEqual(parseChapters(html, 'a').map((c) => c.id), ['2', '10', '10-5']);
  assert.equal(parseChapters(html, 'a')[0].path, '/manga/a/chapter-2');
});

test('parseIds: lấy MANGA_ID và CHAPTER_ID', () => {
  assert.deepEqual(parseIds('MANGA_ID = 105; CHAPTER_ID = 1038606;'), { manga: '105', chapter: '1038606' });
  assert.equal(parseIds('không có gì'), null);
});

test('validateConfig: báo lỗi rõ khi chưa điền tài khoản hoặc link web', () => {
  assert.match(validateConfig({ web: 'x', accounts: [] }).join(' '), /tài khoản/);
  assert.match(validateConfig({ web: '', accounts: [{ email: 'a@b.c', password: 'p' }] }).join(' '), /web/);
  assert.match(validateConfig(DEFAULT_CONFIG).join(' '), /tài khoản/, 'mẫu chưa điền thì không chạy');
  assert.deepEqual(validateConfig({ web: 'https://w.com', accounts: [{ email: 'a@b.c', password: 'p', enabled: true }], delay: {} }), []);
});

test('loadConfig: chưa có data.json thì tạo bản mẫu và báo; có thì ghép delay mặc định', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nd-'));
  const f = join(dir, 'data.json');
  const r = loadConfig(f);
  assert.equal(r.created, true); assert.ok(existsSync(f));
  assert.equal(loadConfig(f).config.delay.viewWaitMs, 7500, 'bản mẫu (có ghi chú) đọc lại được');
  writeFileSync(f, JSON.stringify({ web: 'https://w.com', accounts: [{ email: 'a@b.c', password: 'p' }], delay: { viewWaitMs: 9000 } }));
  const c = loadConfig(f).config;
  assert.equal(c.delay.viewWaitMs, 9000); assert.equal(c.delay.betweenChaptersMs, DEFAULT_CONFIG.delay.betweenChaptersMs, 'trường thiếu lấy mặc định');
});

test('Site.login: lấy cookie, gửi email/mật khẩu; sai mật khẩu thì báo', async () => {
  const s = await fakeSite();
  try {
    const ok = new Site({ web: s.url, timeoutMs: 2000 });
    assert.equal((await ok.login('a@x.com', 'pw')).ok, true);
    assert.match(ok.cookieHeader(), /UserID=a@x\.com/);
    assert.match(s.log.logins[0].cookie, /sess=s1/, 'đăng nhập kèm cookie phiên lấy từ trang đăng nhập');
    const bad = new Site({ web: s.url, timeoutMs: 2000 });
    const r = await bad.login('a@x.com', 'sai');
    assert.equal(r.ok, false); assert.match(r.msg, /không đúng/);
  } finally { await s.close(); }
});

test('đọc truyện: đúng thứ tự chương, chờ trước khi gửi lượt đọc, kèm Referer là trang chương', async () => {
  const s = await fakeSite({ chapters: [1, 2, 3] });
  try {
    const site = new Site({ web: s.url, timeoutMs: 2000 });
    await readAccount({ site, account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: fast, order: 'asc', loops: 1, log: quiet });
    assert.deepEqual(s.log.views.map((v) => v.chapter), ['91', '92', '93']);
    assert.ok(s.log.views.every((v) => v.referer === `${s.url}/manga/truyen-a/chapter-${v.chapter.slice(1)}`), 'Referer là trang chương: ' + JSON.stringify(s.log.views.map((v) => v.referer)));
    assert.ok(s.log.views.every((v) => v.manga === '7'));
    const t = (p) => s.log.hits.filter((h) => h.path === p).map((h) => h.t);
    assert.ok(s.log.views[0].t - t('/manga/truyen-a/chapter-1')[0] >= 25, 'chờ viewWaitMs sau khi mở chương rồi mới gửi');
    assert.match(s.log.views[0].cookie, /UserID=a@x\.com/);
  } finally { await s.close(); }
});

test('thứ tự đọc tùy chỉnh: giảm dần và ngẫu nhiên vẫn đọc đủ mọi chương', async () => {
  const s = await fakeSite({ chapters: [1, 2, 3, 4] });
  try {
    const run = async (order) => { s.log.views.length = 0; await readAccount({ site: new Site({ web: s.url, timeoutMs: 2000 }), account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: fast, order, loops: 1, log: quiet }); return s.log.views.map((v) => v.chapter); };
    assert.deepEqual(await run('desc'), ['94', '93', '92', '91']);
    assert.deepEqual((await run('random')).sort(), ['91', '92', '93', '94']);
  } finally { await s.close(); }
});

test('chạy vô hạn: hết truyện thì nghỉ rồi đọc lại từ đầu (loops=3)', async () => {
  const s = await fakeSite({ chapters: [1, 2] });
  try {
    await readAccount({ site: new Site({ web: s.url, timeoutMs: 2000 }), account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: fast, loops: 3, log: quiet });
    assert.deepEqual(s.log.views.map((v) => v.chapter), ['91', '92', '91', '92', '91', '92']);
  } finally { await s.close(); }
});

test('KHÔNG kiểm tra thành công: máy chủ báo lỗi hay từ chối vẫn đọc chương kế tiếp', async () => {
  for (const [status, body] of [[500, 'lỗi'], [200, '{"status":false,"message":"invalid request"}'], [403, '']]) {
    const s = await fakeSite({ chapters: [1, 2, 3], viewStatus: status, viewBody: body });
    try {
      await readAccount({ site: new Site({ web: s.url, timeoutMs: 2000 }), account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: fast, loops: 1, log: quiet });
      assert.equal(s.log.views.length, 3, `trạng thái ${status}: vẫn gửi đủ 3 chương`);
    } finally { await s.close(); }
  }
});

test('trang chương lỗi/treo: thử lại, nếu vẫn lỗi thì bỏ qua và đọc tiếp', async () => {
  const run = async (failTimes) => {
    const s = await fakeSite({ chapters: [1, 2, 3] });
    try {
      const site = new Site({ web: s.url, timeoutMs: 300 });
      const real = site.getText.bind(site);
      let n = 0;
      site.getText = async (p) => { if (p.includes('chapter-2') && n++ < failTimes) throw new Error('timeout giả'); return real(p); };
      await readAccount({ site, account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: fast, loops: 1, log: quiet });
      return s.log.views.map((v) => v.chapter);
    } finally { await s.close(); }
  };
  assert.deepEqual(await run(1), ['91', '92', '93'], 'lỗi 1 lần: thử lại được thì vẫn đọc chương đó');
  assert.deepEqual(await run(2), ['91', '92', '93'], 'lỗi 2 lần: vẫn thử lại (tối đa 3 lần)');
  assert.deepEqual(await run(99), ['91', '93'], 'lỗi mãi: bỏ qua chương, đọc tiếp');
});

test('chờ viewWaitMs tính từ lúc MỞ trang chương (không cộng thêm thời gian tải trang)', async () => {
  const s = await fakeSite({ chapters: [1], pageDelayMs: 80 });
  try {
    await readAccount({ site: new Site({ web: s.url, timeoutMs: 2000 }), account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: { ...fast, viewWaitMs: 120 }, loops: 1, log: quiet });
    const dt = s.log.views[0].t - s.log.hits.find((h) => h.path === '/manga/truyen-a/chapter-1').t;
    assert.ok(dt >= 115, `không gửi sớm hơn viewWaitMs (dt=${dt})`);
    assert.ok(dt < 120 + 60, `không chờ thêm sau khi trang tải xong (dt=${dt})`);
  } finally { await s.close(); }
});

test('jitter chỉ kéo dài viewWaitMs, không bao giờ rút ngắn (web cần đủ 7 giây)', async () => {
  const s = await fakeSite({ chapters: [1, 2, 3, 4, 5, 6, 7, 8] });
  try {
    await readAccount({ site: new Site({ web: s.url, timeoutMs: 2000 }), account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: { ...fast, viewWaitMs: 60, jitterPercent: 80 }, parallel: 4, loops: 1, log: quiet });
    assert.equal(s.log.views.length, 8);
    for (const v of s.log.views) {
      const dt = v.t - s.log.hits.find((h) => h.path === `/manga/truyen-a/chapter-${v.chapter.slice(1)}`).t;
      assert.ok(dt >= 57, `chương ${v.chapter} gửi sau ${dt}ms < 60ms`);
    }
  } finally { await s.close(); }
});

test('đọc song song (parallel): nhanh hơn tuần tự nhưng vẫn đủ chương và mỗi chương vẫn chờ đủ', async () => {
  const run = async (parallel) => {
    const s = await fakeSite({ chapters: [1, 2, 3, 4, 5, 6] });
    try {
      const t0 = Date.now();
      await readAccount({ site: new Site({ web: s.url, timeoutMs: 2000 }), account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: { ...fast, viewWaitMs: 100, betweenChaptersMs: 10 }, parallel, loops: 1, log: quiet });
      const dt = Date.now() - t0;
      for (const v of s.log.views) assert.ok(v.t - s.log.hits.find((h) => h.path === `/manga/truyen-a/chapter-${v.chapter.slice(1)}`).t >= 95);
      return { dt, chapters: s.log.views.map((v) => v.chapter) };
    } finally { await s.close(); }
  };
  const seq = await run(1), par = await run(3);
  assert.deepEqual(seq.chapters, ['91', '92', '93', '94', '95', '96']);
  assert.deepEqual(par.chapters, ['91', '92', '93', '94', '95', '96'], 'song song vẫn đúng thứ tự mở chương');
  assert.ok(seq.dt >= 600, `tuần tự mất >= 600ms (${seq.dt})`);
  assert.ok(par.dt < seq.dt * 0.6, `song song nhanh hơn rõ rệt (${par.dt} vs ${seq.dt})`);
});

test('data.json cho phép ghi chú // và /* */; không phá chuỗi chứa //; bản mẫu có ghi chú', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nd-'));
  const f = join(dir, 'data.json');
  writeFileSync(f, `{
  // link web
  "web": "https://w.com", /* không được cắt chuỗi có // */
  "accounts": [{ "email": "a@b.c", "password": "p//q", "enabled": true }], // hết
  "parallel": 2
}`);
  const c = loadConfig(f).config;
  assert.equal(c.web, 'https://w.com'); assert.equal(c.accounts[0].password, 'p//q'); assert.equal(c.parallel, 2);
  assert.equal(c.delay.viewWaitMs, 7500, 'thiếu delay lấy mặc định');
  const g = join(dir, 'moi.json');
  loadConfig(g);
  const text = readFileSync(g, 'utf8');
  assert.match(text, /\/\/.*viewWaitMs|viewWaitMs.*\/\//s, 'bản mẫu giải thích viewWaitMs');
  assert.ok((text.match(/^\s*\/\//gm) || []).length >= 12, 'bản mẫu có nhiều dòng ghi chú');
  assert.equal(loadConfig(g).config.parallel, DEFAULT_CONFIG.parallel);
});

test('đăng nhập thất bại thì thử lại sau retryLoginMs (không thoát), rồi đọc khi đăng nhập được', async () => {
  let tries = 0;
  const s = await fakeSite({ chapters: [1], loginOk: () => ++tries > 2 });
  try {
    await readAccount({ site: new Site({ web: s.url, timeoutMs: 2000 }), account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: fast, loops: 1, log: quiet });
    assert.equal(s.log.logins.length, 3);
    assert.equal(s.log.views.length, 1);
  } finally { await s.close(); }
});

test('nhiều tài khoản chạy song song, mỗi tài khoản cookie riêng; nhiều link truyện đọc lần lượt', async () => {
  const s = await fakeSite({ chapters: [1, 2] });
  try {
    const mk = (email) => readAccount({ site: new Site({ web: s.url, timeoutMs: 2000 }), account: { email, password: 'pw' }, links: [`${s.url}/manga/truyen-a`, `${s.url}/manga/truyen-a/chapter-1`], delay: fast, loops: 1, log: quiet });
    await Promise.all([mk('a@x.com'), mk('b@x.com')]);
    const by = (w) => s.log.views.filter((v) => v.who === w).length;
    assert.equal(by('a@x.com'), 2); assert.equal(by('b@x.com'), 2, 'mỗi tài khoản đọc đủ 2 chương; 2 link cùng một truyện được gộp, không đọc lặp');
  } finally { await s.close(); }
});

test('dừng được bất cứ lúc nào bằng AbortSignal, kể cả khi đang chờ', async () => {
  const s = await fakeSite({ chapters: [1, 2, 3] });
  try {
    const ac = new AbortController();
    const p = readAccount({ site: new Site({ web: s.url, timeoutMs: 2000 }), account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: { ...fast, viewWaitMs: 5000, betweenLoopsMs: 5000 }, loops: Infinity, log: quiet, signal: ac.signal });
    await wait(150); ac.abort();
    const t0 = Date.now(); await p;
    assert.ok(Date.now() - t0 < 500, 'dừng ngay, không chờ hết 5 giây');
  } finally { await s.close(); }
});
