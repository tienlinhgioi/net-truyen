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

// ===================== 1.0.2: ba chế độ chọn truyện + điều kiện đổi truyện =====================
import { parseStoryList, parseLastPage } from '../src/parse.js';

const rule = { window: 4, alreadyReadPercent: 75 }; // trong 4 chương gần nhất, >= 3 chương "đã đọc" thì đổi truyện
const slugsOf = (s) => [...new Set(s.log.views.map((v) => v.slug))];
const run = (s, over = {}) => readAccount({ site: new Site({ web: s.url, timeoutMs: 2000 }), account: { email: 'a@x.com', password: 'pw' }, links: [], delay: fast, loops: 1, log: quiet, switchRule: rule, ...over });

test('parseStoryList: lấy mã truyện theo thứ tự trên trang, bỏ trùng, bỏ sidebar; parseLastPage: số trang cuối', () => {
  const html = '<div class="side"><a href="/manga/side">s</a></div><div class="items"><a href="/manga/b"><img></a><a title="B" href="/manga/b">B</a><a href="https://w.com/manga/a">A</a><a href="/manga/c/chapter-5">c5</a></div><a href="/danh-sach-truyen/562?sort=views_day">»</a><a href="/danh-sach-truyen/2">2</a>';
  assert.deepEqual(parseStoryList(html), ['b', 'a', 'c']);
  assert.equal(parseLastPage(html), 562);
  assert.equal(parseLastPage('không có'), 1);
});

test('đổi truyện: gặp nhiều chương "đã đọc" (counted:false) thì sang truyện kế, không đọc hết truyện', async () => {
  const s = await fakeSite({ stories: { 'truyen-a': Array.from({ length: 30 }, (_, i) => i + 1), 'truyen-b': [1, 2, 3] }, countedFn: (slug) => slug !== 'truyen-a' });
  try {
    await run(s, { links: [`${s.url}/manga/truyen-a`, `${s.url}/manga/truyen-b`] });
    const a = s.log.views.filter((v) => v.slug === 'truyen-a').length;
    assert.ok(a >= 4 && a <= 8, `truyen-a toàn "đã đọc": chỉ đọc vài chương rồi đổi, thực tế ${a}`);
    assert.equal(s.log.views.filter((v) => v.slug === 'truyen-b').length, 3, 'truyen-b đọc đủ');
  } finally { await s.close(); }
});

test('đổi truyện: chương "đã đọc" ít hơn ngưỡng thì vẫn đọc hết truyện; invalid/lỗi không tính là "đã đọc"', async () => {
  const s = await fakeSite({ stories: { 'truyen-a': Array.from({ length: 12 }, (_, i) => i + 1) }, countedFn: (slug, n) => n % 3 !== 0 }); // 1/3 chương "đã đọc"
  try {
    await run(s, { links: [`${s.url}/manga/truyen-a`] });
    assert.equal(s.log.views.length, 12, 'dưới ngưỡng: đọc đủ 12 chương');
  } finally { await s.close(); }
  const s2 = await fakeSite({ stories: { 'truyen-a': Array.from({ length: 12 }, (_, i) => i + 1) }, viewBody: '{"message":"invalid request","status":false}' });
  try {
    await run(s2, { links: [`${s2.url}/manga/truyen-a`] });
    assert.equal(s2.log.views.length, 12, 'web từ chối (invalid) không bị hiểu là "đã đọc"');
  } finally { await s2.close(); }
});

test('mode list: các link đọc tuần tự theo đúng thứ tự cấu hình, hết thì lặp lại từ link 1', async () => {
  const s = await fakeSite({ stories: { 'truyen-a': [1], 'truyen-b': [1], 'truyen-c': [1] } });
  try {
    await run(s, { mode: 'list', loops: 2, links: [`${s.url}/manga/truyen-c`, `${s.url}/manga/truyen-a`, `${s.url}/manga/truyen-b`] });
    assert.deepEqual(s.log.views.map((v) => v.slug), ['truyen-c', 'truyen-a', 'truyen-b', 'truyen-c', 'truyen-a', 'truyen-b']);
  } finally { await s.close(); }
});

test('mode random (có link): đọc đủ mọi truyện nhưng thứ tự được trộn mỗi vòng', async () => {
  const names = ['t1', 't2', 't3', 't4', 't5', 't6'];
  const s = await fakeSite({ stories: Object.fromEntries(names.map((n) => [n, [1]])) });
  try {
    await run(s, { mode: 'random', loops: 6, links: names.map((n) => `${s.url}/manga/${n}`) });
    const orders = []; const v = s.log.views.map((x) => x.slug);
    for (let i = 0; i < v.length; i += 6) orders.push(v.slice(i, i + 6));
    assert.equal(orders.length, 6);
    for (const o of orders) assert.deepEqual([...o].sort(), names, 'mỗi vòng đủ 6 truyện, không lặp');
    assert.ok(new Set(orders.map((o) => o.join())).size > 1, 'thứ tự khác nhau giữa các vòng');
  } finally { await s.close(); }
});

test('mode random (không có link): lấy truyện ngẫu nhiên từ danh sách truyện của web, đủ maxStories', async () => {
  const names = Array.from({ length: 20 }, (_, i) => `w${i + 1}`);
  const s = await fakeSite({ stories: Object.fromEntries(names.map((n) => [n, [1]])), webList: names, pageSize: 5 });
  try {
    await run(s, { mode: 'random', links: [], ranking: { sort: 'views_day', maxStories: 6 } });
    const got = s.log.views.map((v) => v.slug);
    assert.equal(got.length, 6); assert.equal(new Set(got).size, 6, 'không trùng truyện');
    assert.ok(got.every((n) => names.includes(n)));
  } finally { await s.close(); }
});

test('mode ranking: đọc từ hạng 1 xuống theo thứ tự bảng, qua nhiều trang, dừng ở maxStories', async () => {
  const names = Array.from({ length: 9 }, (_, i) => `r${i + 1}`);
  const s = await fakeSite({ stories: Object.fromEntries(names.map((n) => [n, [1]])), ranking: { views_day: names, views_week: [...names].reverse() }, pageSize: 4 });
  try {
    await run(s, { mode: 'ranking', ranking: { sort: 'views_day', maxStories: 6 } });
    assert.deepEqual(s.log.views.map((v) => v.slug), ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    assert.deepEqual([...new Set(s.log.pages.map((p) => `${p.sort}:${p.page}`))], ['views_day:1', 'views_day:2'], 'chỉ tải đủ số trang cần');
  } finally { await s.close(); }
  const s2 = await fakeSite({ stories: Object.fromEntries(names.map((n) => [n, [1]])), ranking: { views_day: names, views_week: [...names].reverse() }, pageSize: 4 });
  try {
    await run(s2, { mode: 'ranking', ranking: { sort: 'views_week', maxStories: 100 } });
    assert.deepEqual(s2.log.views.map((v) => v.slug), [...names].reverse(), 'sort khác thì theo bảng khác; maxStories lớn hơn số truyện thì đọc hết bảng');
  } finally { await s2.close(); }
});

test('mode ranking: truyện toàn "đã đọc" thì chuyển xuống hạng kế; hết bảng thì nghỉ rồi lặp lại từ hạng 1', async () => {
  const s = await fakeSite({ stories: { r1: Array.from({ length: 20 }, (_, i) => i + 1), r2: [1, 2] }, ranking: { views_day: ['r1', 'r2'] }, countedFn: (slug) => slug !== 'r1' });
  try {
    await run(s, { mode: 'ranking', loops: 2, ranking: { sort: 'views_day', maxStories: 10 } });
    const seq = s.log.views.map((v) => v.slug);
    assert.ok(seq.filter((x) => x === 'r1').length <= 2 * 8, 'r1 bị bỏ sớm ở mỗi vòng');
    assert.equal(seq.filter((x) => x === 'r2').length, 4, 'r2 đọc đủ 2 chương x 2 vòng');
    assert.equal(seq[0], 'r1'); assert.equal(seq.at(-1), 'r2');
    assert.ok(s.log.pages.filter((p) => p.page === 1).length >= 2, 'mỗi vòng tải lại bảng xếp hạng (bảng có thể đổi)');
  } finally { await s.close(); }
});

test('mode ranking: tải bảng xếp hạng lỗi thì ghi lỗi, nghỉ rồi thử lại (không thoát)', async () => {
  const s = await fakeSite({ stories: { r1: [1] }, ranking: { views_day: ['r1'] } });
  try {
    const site = new Site({ web: s.url, timeoutMs: 2000 });
    const real = site.getText.bind(site); let n = 0;
    site.getText = async (p) => { if (p.startsWith('/danh-sach-truyen') && n++ < 1) throw new Error('timeout giả'); return real(p); };
    await readAccount({ site, account: { email: 'a@x.com', password: 'pw' }, links: [], delay: fast, loops: 2, log: quiet, mode: 'ranking', ranking: { sort: 'views_day', maxStories: 5 }, switchRule: rule });
    assert.equal(s.log.views.length, 1, 'vòng 1 lỗi bảng, vòng 2 đọc được r1');
  } finally { await s.close(); }
});

test('validateConfig + loadConfig: mode/ranking/switch hợp lệ, thiếu thì lấy mặc định, sai thì báo lỗi', () => {
  const ok = { web: 'https://w.com', accounts: [{ email: 'a@b.c', password: 'p' }], delay: {} };
  assert.deepEqual(validateConfig({ ...ok, mode: 'ranking', ranking: { sort: 'views_week', maxStories: 10 } }), []);
  assert.match(validateConfig({ ...ok, mode: 'abc' }).join(' '), /mode/);
  assert.match(validateConfig({ ...ok, mode: 'ranking', ranking: { sort: 'xxx' } }).join(' '), /sort/);
  assert.match(validateConfig({ ...ok, mode: 'ranking', ranking: { sort: 'views', maxStories: 0 } }).join(' '), /maxStories/);
  assert.match(validateConfig({ ...ok, switch: { window: 0, alreadyReadPercent: 80 } }).join(' '), /window/);
  assert.match(validateConfig({ ...ok, switch: { window: 10, alreadyReadPercent: 150 } }).join(' '), /alreadyReadPercent/);
  const dir = mkdtempSync(join(tmpdir(), 'nd-'));
  const f = join(dir, 'data.json');
  writeFileSync(f, JSON.stringify(ok));
  const c = loadConfig(f).config;
  assert.equal(c.mode, 'list'); assert.equal(c.ranking.sort, 'views_day'); assert.equal(c.ranking.maxStories, 50);
  assert.equal(c.switch.window, 10); assert.equal(c.switch.alreadyReadPercent, 80);
  writeFileSync(f, JSON.stringify({ ...ok, ranking: { sort: 'views_week' }, switch: { window: 5 } }));
  const d = loadConfig(f).config;
  assert.equal(d.ranking.sort, 'views_week'); assert.equal(d.ranking.maxStories, 50, 'ghép từng trường con');
  assert.equal(d.switch.window, 5); assert.equal(d.switch.alreadyReadPercent, 80);
});
