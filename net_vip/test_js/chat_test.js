// Kiểm thử DOM cho chat.js (chạy: NODE_PATH=$(npm root -g) node test_js/chat_test.js)
const { chromium } = require('playwright');
const fs = require('fs');
const A = __dirname + '/../assets/inject/';
const assert = require('assert');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('http://t.local/', r => r.fulfill({ contentType: 'text/html', body:
    '<ul id="listMessages"><li><a class="btn btn-info" id="view-img-btn-1" onclick="window.clicked=1">Xem</a></li>' +
    '<li><a class="avatar"></a><div class="info"><a class="name" href="/u/1">A</a></div><p>xin chào</p></li>' +
    '<li><a class="avatar"></a><div class="info"><a class="name" href="/u/1">A</a></div><p>tin 2</p></li>' +
    '<li><a class="avatar"></a><div class="info"><a class="name" href="/u/2">B</a></div><p>chữ <img id="chat-img-9" src="x"></p></li>' +
    '<li><a class="avatar"></a><div class="info"><a class="name" href="/u/2">B</a></div><p><img id="chat-img-10" src="x"></p></li></ul>' +
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
  assert.strictEqual(await p.evaluate(() => [...document.querySelectorAll('#nvEmoji img')].filter(i => i.src.startsWith('http:')).length), 0, 'không còn ảnh http (WebView chặn mixed content)');
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
  // Giao diện toàn màn hình: tiêu đề, nút gửi, gộp tin cùng người, tin chỉ có ảnh bỏ bong bóng
  await p.waitForTimeout(900);
  assert.strictEqual(await p.locator('#nvChatHeader .t').innerText(), 'Vạn Giới Đàm Đạo');
  assert.strictEqual(await p.locator('#nvSend').count(), 1, 'có nút gửi');
  const cls = await p.evaluate(() => [...document.querySelectorAll('#listMessages li')].map(l => l.className));
  assert.deepStrictEqual(cls.slice(1), ['', 'cont', '', 'cont'], 'gộp tin liên tiếp của cùng một người: ' + JSON.stringify(cls));
  const imgonly = await p.evaluate(() => [...document.querySelectorAll('#listMessages li p')].map(x => x.classList.contains('imgonly')));
  assert.deepStrictEqual(imgonly, [false, false, false, true], 'chỉ tin thuần ảnh mới bỏ bong bóng');
  // bấm nút gửi (không có sticker) kích hoạt Enter như bàn phím
  await p.evaluate(() => document.querySelector('#nvChips .chip .x').click());
  const before = await p.evaluate(() => window.webEnter);
  await p.click('#nvSend');
  assert.strictEqual(await p.evaluate(() => window.webEnter), before + 1, 'nút gửi = Enter');
  console.log('chat_test: PASS');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
