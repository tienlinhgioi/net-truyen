// Kiểm thử quest.js với jQuery giả. Chạy: NODE_PATH=$(npm root -g) node test_js/quest_test.js
const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('assert');
const A = __dirname + '/../assets/inject/';

async function scenario(settings, hadSpin) {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('http://t.local/', r => r.fulfill({ contentType: 'text/html', body:
    '<input type="hidden" id="hadSpin" value="' + hadSpin + '"><div id="boxLinhThach"></div>' }));
  await p.goto('http://t.local/');
  await p.evaluate(s => {
    localStorage.setItem('nvq', JSON.stringify(s));
    window.__NVQ_FAST = 1; window.calls = [];
    window.fetch = (u, o) => { window.calls.push('POST ' + u + ' ' + o.body + ' ref=' + o.referrer); return Promise.resolve({ json: () => Promise.resolve({ status: true, counted: true }) }); };
    const chapters = Array.from({ length: 12 }, (_, i) => '<a href="/manga/abc/chapter-' + (i + 1) + '">c</a>').join('');
    window.$ = { ajax: o => {
      window.calls.push((o.type || 'GET') + ' ' + o.url + (o.data ? ' ' + JSON.stringify(o.data) : ''));
      const done = d => ({ then: f => (f(d), { catch: () => {} }), done: f => (f(d), { fail: () => {} }), fail: () => ({}) });
      let d;
      if (o.url.startsWith('/ajax/user/mission')) d = { data: { daily: [
          { id: 'daily_mission_1', text: 'Đọc 10 chương truyện', reward: 100, status: 0, progress: '0/10' },
          { id: 'daily_mission_2', text: 'Bình luận 3 lần (từ 10 ký tự)', reward: 100, status: 0, progress: '0/3' }],
        weekly: [
          { id: 'weekly_mission_1', text: 'Đăng 1 bài viết trên diễn đàn.', reward: 500, status: 0, progress: '0/1' },
          { id: 'weekly_mission_2', text: 'Bình luận 3 bài viết trên diễn đàn của người khác.', reward: 500, status: 0, progress: '0/3' }] } };
      else if (o.url.startsWith('/danh-sach-truyen')) d = '<a href="/manga/abc">x</a><a href="/manga/xyz">y</a>';
      else if (o.url === '/manga/abc') d = chapters + 'MANGA_ID = 7;';
      else if (o.url.startsWith('/manga/abc/chapter-')) d = 'MANGA_ID = 7; CHAPTER_ID = 900' + o.url.split('-')[1];
      else if (o.url === '/forum') d = '<a href="/forum/post/aa-11">a</a><a href="/forum/post/bb-12">b</a><a href="/forum/post/cc-13">c</a><a href="/forum/post/dd-14">d</a>';
      else if (o.url === '/forum/new-post') d = { status: true, redirect: '/forum/post/mine-99' };
      else d = { status: true, msg: 'ok', rotate: 1 };
      return done(d);
    } };
  }, settings);
  await p.addStyleTag({ content: fs.readFileSync(A + 'quest.css', 'utf8') });
  await p.evaluate(fs.readFileSync(A + 'quest.js', 'utf8'));
  await p.waitForSelector('#nvqBtn');
  await p.waitForFunction(() => window.__nvqDone === true, null, { timeout: 15000 });
  const calls = await p.evaluate(() => window.calls);
  await b.close();
  return calls;
}
const count = (c, re) => c.filter(x => re.test(x)).length;

(async () => {
  // 1) Chỉ bật "ngày": không đụng nhiệm vụ tuần, không điểm danh/quay
  let c = await scenario({ daily: true, weekly: false, all: false }, 'false');
  assert.ok(c.filter(x => /manga\/view/.test(x)).every(x => /ref=http:\/\/t\.local\/manga\/abc\/chapter-\d+$/.test(x)), 'lượt đọc phải gửi kèm Referer là trang chương (server chặn nếu sai)');
  assert.strictEqual(count(c, /^POST \/ajax\/manga\/view/), 10, 'đọc 10 chương: ' + count(c, /manga\/view/));
  assert.strictEqual(count(c, /^POST \/ajax\/comment\/add/), 3, '3 bình luận truyện');
  assert.strictEqual(count(c, /new-post|ajax\/forum\/comment/), 0, 'không làm nhiệm vụ tuần');
  assert.strictEqual(count(c, /user\/daily|user\/spin/), 0, 'không điểm danh/quay khi chưa bật tất cả');
  assert.strictEqual(count(c, /missionReward.*daily_mission/), 2, 'nhận thưởng 2 nhiệm vụ ngày');
  // 2) Chỉ bật "tuần"
  c = await scenario({ daily: false, weekly: true, all: false }, 'false');
  assert.strictEqual(count(c, /^POST \/forum\/new-post/), 1, 'đăng 1 bài');
  assert.strictEqual(count(c, /^POST \/ajax\/forum\/comment /), 3, '3 bình luận diễn đàn');
  assert.ok(!c.some(x => /post_id":99/.test(x)), 'không bình luận bài của mình');
  assert.strictEqual(count(c, /manga\/view|comment\/add/), 0, 'không làm nhiệm vụ ngày');
  // 3) Tất cả: có điểm danh + quay miễn phí
  c = await scenario({ daily: false, weekly: false, all: true }, 'false');
  assert.strictEqual(count(c, /^POST \/ajax\/user\/daily/), 1, 'điểm danh');
  assert.strictEqual(count(c, /^GET \/ajax\/user\/spin/), 1, 'quay miễn phí');
  assert.strictEqual(count(c, /missionReward/), 4, 'nhận 4 phần thưởng');
  // 4) Hết lượt quay miễn phí: TUYỆT ĐỐI không quay (mất 200 linh thạch)
  c = await scenario({ daily: false, weekly: false, all: true }, 'true');
  assert.strictEqual(count(c, /user\/spin/), 0, 'không quay khi hết lượt miễn phí');
  // 5) Tắt hết: không gọi gì
  c = await scenario({ daily: false, weekly: false, all: false }, 'false');
  assert.strictEqual(c.length, 0, 'tắt hết thì không gọi: ' + c.length);
  console.log('quest_test: PASS');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
