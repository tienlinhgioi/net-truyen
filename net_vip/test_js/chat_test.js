// Kiểm thử DOM cho chat.js (chạy: NODE_PATH=$(npm root -g) node test_js/chat_test.js)
const { chromium } = require('playwright');
const fs = require('fs');
const A = __dirname + '/../assets/inject/';
const assert = require('assert');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('http://t.local/', r => r.fulfill({ contentType: 'text/html', body:
    '<ul id="listMessages"><li><a class="btn btn-info" id="view-img-btn-1" onclick="window.clicked=1">Xem</a></li></ul>' +
    '<div class="chat-board"><div class="form-group"><button id="btnMore">m</button><input id="txtMessage"></div></div>' }));
  await p.goto('http://t.local/');
  await p.evaluate(() => {
    window.sent = []; window.webEnter = 0;
    window.$ = { post: (u, d, cb) => { window.sent.push(d.message); cb && cb({ status: true }); } };
    document.getElementById('txtMessage').addEventListener('keydown', e => { if (e.key === 'Enter') window.webEnter++; });
  });
  await p.evaluate('window.__NV_STICKERS=' + fs.readFileSync(A + 'stickers.json', 'utf8'));
  await p.evaluate(fs.readFileSync(A + 'chat.js', 'utf8'));
  await p.waitForSelector('#btnEmoji');
  await p.evaluate(() => document.getElementById('btnEmoji').click());
  // chọn 2 sticker -> hiện 2 chip, panel vẫn mở được chọn tiếp
  await p.evaluate(() => { const g = document.querySelectorAll('#nvEmoji .grid img'); g[0].click(); g[1].click(); });
  assert.strictEqual(await p.locator('#nvChips .chip').count(), 2, '2 chip');
  // xóa 1 chip rồi chọn lại
  await p.evaluate(() => document.querySelector('#nvChips .chip .x').click());
  assert.strictEqual(await p.locator('#nvChips .chip').count(), 1, 'xóa chip');
  await p.evaluate(() => document.querySelectorAll('#nvEmoji .grid img')[2].click());
  // gõ chữ + Enter: tin 1 = chữ + sticker đầu, tin 2 = sticker còn lại; web không nhận Enter
  await p.fill('#txtMessage', 'hello');
  await p.press('#txtMessage', 'Enter');
  await p.waitForTimeout(300);
  const sent = await p.evaluate(() => window.sent);
  assert.strictEqual(sent.length, 2, 'gửi 2 tin: ' + JSON.stringify(sent));
  assert.ok(sent[0].startsWith('hello [IMG=http'), sent[0].slice(0, 40));
  assert.ok(sent[1].startsWith('[IMG=http') && !sent[1].includes('hello'));
  assert.strictEqual(await p.evaluate(() => window.webEnter), 0, 'Enter không lọt xuống web khi có sticker');
  assert.strictEqual(await p.locator('#nvChips .chip').count(), 0, 'chip được xóa sau khi gửi');
  assert.strictEqual(await p.inputValue('#txtMessage'), '', 'ô nhập được xóa');
  // không có sticker: Enter lọt xuống web như cũ
  await p.press('#txtMessage', 'Enter');
  assert.strictEqual(await p.evaluate(() => window.webEnter), 1, 'Enter thường vẫn chạy');
  // lỗi server: báo lỗi và giữ chip
  await p.evaluate(() => { window.$.post = (u, d, cb) => cb({ status: false, message: 'Quá số lượng' }); window.alerts = []; window.alert = m => window.alerts.push(m); });
  await p.evaluate(() => document.querySelectorAll('#nvEmoji .grid img')[3].click());
  await p.press('#txtMessage', 'Enter');
  await p.waitForTimeout(200);
  assert.deepStrictEqual(await p.evaluate(() => window.alerts), ['Quá số lượng']);
  assert.strictEqual(await p.locator('#nvChips .chip').count(), 1, 'lỗi thì giữ chip');
  console.log('chat_test: PASS');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
