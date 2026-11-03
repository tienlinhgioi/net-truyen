// Kiểm thử kéo-để-làm-mới trong base.js. Chạy: NODE_PATH=$(npm root -g) node test_js/ptr_test.js
const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('assert');
const A = __dirname + '/../assets/inject/';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ hasTouch: true, viewport: { width: 400, height: 700 } });
  await p.route('http://t.local/', r => r.fulfill({ contentType: 'text/html', body:
    '<ul id="listMessages" style="height:300px;overflow-y:auto"><li style="height:900px"><span id="inList">tin</span></li></ul>' +
    '<div id="scrollbox" style="height:200px;overflow-y:auto"><div style="height:800px"><span id="inBox">x</span></div></div>' +
    '<div id="plain" style="height:300px">trang</div>' }));
  await p.goto('http://t.local/');
  await p.evaluate(() => { window.msgs = []; window.NetVip = { postMessage: m => window.msgs.push(m) }; });
  await p.evaluate(fs.readFileSync(A + 'base.js', 'utf8'));
  const pull = sel => p.evaluate(s => {
    const t = document.querySelector(s);
    const mk = y => new Touch({ identifier: 1, target: t, clientX: 50, clientY: y });
    const fire = (type, y) => t.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [mk(y)], changedTouches: [mk(y)] }));
    fire('touchstart', 100); fire('touchmove', 200); fire('touchmove', 330); fire('touchend', 330);
    return window.msgs.filter(m => m === 'refresh').length;
  }, sel);
  assert.strictEqual(await pull('#plain'), 1, 'kéo ở trang thường thì làm mới');
  assert.strictEqual(await pull('#inList'), 1, 'kéo trong danh sách chat không được làm mới');
  assert.strictEqual(await pull('#inBox'), 1, 'kéo trong vùng tự cuộn không được làm mới');
  console.log('ptr_test: PASS');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
