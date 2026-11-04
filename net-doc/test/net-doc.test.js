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

const fast = { viewWaitMs: 30, betweenChaptersMs: 5, betweenLoopsMs: 40, jitterPercent: 0, requestTimeoutMs: 2000, retryLoginMs: 30, reloginEveryMs: 1e9 };
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
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).delay.viewWaitMs, 7500);
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

test('trang chương lỗi/treo cũng không làm dừng: bỏ qua và đọc tiếp', async () => {
  const s = await fakeSite({ chapters: [1, 2, 3] });
  try {
    const site = new Site({ web: s.url, timeoutMs: 300 });
    const real = site.getText.bind(site);
    let n = 0;
    site.getText = async (p) => { if (p.includes('chapter-2') && n++ === 0) throw new Error('timeout giả'); return real(p); };
    await readAccount({ site, account: { email: 'a@x.com', password: 'pw' }, links: [`${s.url}/manga/truyen-a`], delay: fast, loops: 1, log: quiet });
    assert.deepEqual(s.log.views.map((v) => v.chapter), ['91', '93']);
  } finally { await s.close(); }
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
