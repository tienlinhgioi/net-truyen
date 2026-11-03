// Kiểm thử giao diện (trình duyệt giả lập). Chạy: NODE_PATH=$(npm root -g) node test/ui.e2e.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = new URL('../www/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = createServer(async (q, r) => {
  try { const p = join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); r.writeHead(200, { 'Content-Type': types[extname(p)] || 'text/plain' }); r.end(await readFile(p)); }
  catch { r.writeHead(404); r.end(); }
}).listen(0);
const port = srv.address().port;

const mockInit = () => {
  window.__sent = []; window.__svc = { start: 0, update: 0, stop: 0 }; let gN = 0;
  const chat = [{ id: 1, user_id: 'u1', name: 'Người lạ', message: 'hello', manga: null }];
  window.__chat = chat;
  window.__BOTNET_TEST__ = {
    service: { start: async () => { window.__svc.start++; }, update: async () => { window.__svc.update++; }, stop: async () => { window.__svc.stop++; } },
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 20))),
    http: async (r) => {
      const ok = (data, headers = {}) => ({ status: 200, headers, data });
      if (r.url.endsWith('/ajax/auth/login')) {
        const f = new URLSearchParams(r.data);
        return f.get('password') === 'dung' ? ok({ status: true }, { 'set-cookie': 'UserID=9' }) : ok({ status: false, msg: 'Email hoặc mật khẩu không đúng' });
      }
      if (r.url.endsWith('/auth/login')) return ok('');
      if (r.url.endsWith('/user/profile')) return ok('<img src="https://x/av.jpg" class="avatar user-img"><input name="user-name" value="Tiểu Ly">');
      if (r.url.endsWith('/ajax/chat/list')) return ok({ status: true, data: window.__chat });
      if (r.url.endsWith('/ajax/chat/send')) { const m = new URLSearchParams(r.data).get('message'); window.__sent.push(m); return ok({ status: true }); }
      if ((r.headers['x-goog-api-key'] || '').includes('BAD')) return { status: 400, headers: {}, data: { error: { message: 'API key not valid. Please pass a valid API key.' } } };
      if (r.url.includes('models/gemini-pro:')) return { status: 404, headers: {}, data: {} };
      if (r.url.includes('/v1beta/models?')) return ok({ models: [{ name: 'models/gemini-fast', displayName: 'Gemini Fast', inputTokenLimit: 1000000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-pro', displayName: 'Gemini Pro', inputTokenLimit: 2000000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.0-flash-image', displayName: 'Flash Image', inputTokenLimit: 32000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }] });
      if (r.url.includes(':generateContent')) return ok({ candidates: [{ content: { parts: [{ text: `Chào bạn ${++gN}, mình là Ly nè` }] } }], usageMetadata: { totalTokenCount: 21 } });
      return { status: 404, headers: {}, data: '' };
    },
  };
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 860 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(mockInit);
await p.goto(`http://localhost:${port}/`);
await p.waitForSelector('#stage');
const T = (sel) => p.locator(sel);
const shot = async (n) => { if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${n}.png` }); };

// 1) Trạng thái ban đầu
assert.match(await T('#stage').innerText(), /Chưa có tài khoản nào chạy/);
assert.equal(await T('#whoName').innerText(), 'TK');

// 2) Thêm tài khoản: sai mật khẩu báo lỗi, đúng thì vào danh sách
await shot('1-main-empty');
await T('#btnAccounts').click();
await p.getByText('+ Thêm tài khoản').click();
await T('#addEmail').fill('ly@x.com'); await T('#addPass').fill('sai'); await T('#addGo').click();
await p.waitForFunction(() => document.getElementById('toast').textContent.includes('không đúng'));
await T('#addPass').fill('dung'); await T('#addGo').click();
await p.waitForSelector('.acc');
assert.match(await T('.acc').innerText(), /Tiểu Ly/);

// 3) Bật tài khoản -> hiện khung tròn avatar + tên ở màn chính
await T('.acc .switch input').check();
await p.locator('.sheet .back').last().click();
await p.waitForSelector('.ring'); await p.waitForTimeout(400); await shot('3-main-running');
assert.match(await T('.bubble .nm').innerText(), /Tiểu Ly/);
assert.match(await T('#runInfo').innerText(), /1 tài khoản đang chạy/);

// 4) Sửa tài khoản: key chính + dự phòng, lệnh, tên gọi khác, prompt, giới hạn ký tự, chọn mô hình
await T('#btnAccounts').click();
await T('.acc .meta').click();
await T('#keyInput').fill('AIzaSyMAIN000000000'); await T('#keyAdd').click();
await T('#keyInput').fill('AIzaSyBACKUP00000'); await T('#keyAdd').click();
const tags = await T('.keyrow .tag').allInnerTexts();
assert.deepEqual(tags, ['Chính', 'Dự phòng 1']);
await T('#fCmd').fill('/ly'); await T('#fCmd').blur();
await T('#fAlias').fill('bé ly, ly ly'); await T('#fAlias').blur();
await T('#fPrompt').fill('Bạn là Ly, cô gái 18 tuổi hay đùa.'); await T('#fPrompt').blur();
await T('#fMax').fill('120'); await T('#fMax').blur(); await shot('4-editor');
// avatar trong màn sửa: nhỏ và tròn
const av = await p.locator('.panel .row .av').first().evaluate((el) => ({ w: el.getBoundingClientRect().width, r: getComputedStyle(el).borderRadius }));
assert.ok(av.w <= 52, 'avatar nhỏ: ' + av.w); assert.match(av.r, /50%|\d{2,}px/);
// combo chat chữ: thêm nhiều model (chọn nhiều + tự gõ), có thứ tự
await p.locator('[data-add="text"]').click();
await p.waitForSelector('.model');
assert.equal(await T('.model').count(), 2); await shot('5-models');
await p.locator('.model[data-id="gemini-fast"]').click();
await p.locator('.model[data-id="gemini-pro"]').click();
await T('#modelManual').fill('gemini-custom'); await T('#modelManualAdd').click();
assert.match(await T('#modelDone').innerText(), /Thêm 3 model/);
await T('#modelDone').click();
const rows = await p.locator('#comboBox .role[data-role="text"] .keyrow code').allInnerTexts();
assert.deepEqual(rows, ['gemini-fast', 'gemini-pro', 'gemini-custom']);
// vai Tạo ảnh chỉ hiện model ảnh
await p.locator('[data-add="image"]').click();
await p.waitForSelector('.model');
assert.deepEqual(await p.locator('.model').evaluateAll((els) => els.map((e) => e.dataset.id)), ['gemini-2.0-flash-image']);
await p.locator('.sheet .back').last().click();
// kiểm tra model sống: gemini-pro bị 404 => chết
await T('#comboCheck').click();
await p.waitForSelector('.keyrow[data-model="gemini-pro"] .badge.bad');
await p.evaluate(() => document.querySelector('.panel .body').scrollTo(0, 360)); await shot('4b-combo');
assert.match(await p.locator('.keyrow[data-model="gemini-fast"] .badge').innerText(), /Sống/);
// đổi thứ tự rồi xóa model chết
await p.locator('.keyrow[data-model="gemini-custom"] button', { hasText: '↑' }).click();
assert.deepEqual(await p.locator('#comboBox .role[data-role="text"] .keyrow code').allInnerTexts(), ['gemini-fast', 'gemini-custom', 'gemini-pro']);
await p.locator('.keyrow[data-model="gemini-pro"] button', { hasText: 'Xóa' }).click();
// kiểm tra đồng loạt key: thêm một key sai
await T('#keyInput').fill('AIzaSyBADKEY0000000'); await T('#keyAdd').click();
await T('#keyCheckAll').click();
await p.waitForSelector('.keyrow[data-key="2"] .badge.bad');
assert.match(await p.locator('.keyrow[data-key="0"] .badge').innerText(), /Sống/);
assert.match(await p.locator('.keyrow[data-key="2"] .badge').innerText(), /Sai key/);

await p.locator('.keyrow[data-key="2"] button', { hasText: 'Xóa' }).click();

// 5) Chat thử (không gửi lên web)
await T('#testIn').fill('chào Ly'); await T('#testGo').click();
await p.waitForFunction(() => document.querySelector('.chat-test .ans')?.textContent.includes('mình là Ly'));
assert.equal(await p.evaluate(() => window.__sent.length), 0, 'chat thử không được gửi lên web');

// 6) Bot thật: có người gọi bằng lệnh /ly -> bot trả lời và ghi nhật ký
await p.evaluate(() => window.__chat.push({ id: 2, user_id: 'u2', name: 'Bạn A', message: '/ly hôm nay vui không', manga: null }));
await p.waitForFunction(() => window.__sent.length > 0, null, { timeout: 15000 });
assert.equal(await p.evaluate(() => window.__sent.length), 1);
assert.match(await p.evaluate(() => window.__sent[0]), /mình là Ly nè/);
await p.waitForFunction(() => document.getElementById('log').textContent.includes('Đã trả lời'));

// 7) Gọi bằng tên gọi khác "bé ly" (không dấu, hoa thường)
await p.evaluate(() => window.__chat.push({ id: 3, user_id: 'u3', name: 'Bạn B', message: 'BE LY oi', manga: null }));
await p.waitForFunction(() => window.__sent.length > 1, null, { timeout: 15000 });

// 8) Cài đặt: đổi màu nền, bật lịch, từ cấm
await p.waitForTimeout(500);
await p.reload(); await p.waitForSelector('#stage');
assert.match(await T('#runInfo').innerText(), /1 tài khoản đang chạy/, 'tài khoản tự chạy lại sau khi mở app');
await T('#btnSettings').click();
await shot('6-settings');
await T('#setBg').evaluate((el) => { el.value = '#102030'; el.dispatchEvent(new Event('input', { bubbles: true })); });
assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), '#102030');
const svc0 = await p.evaluate(() => ({ ...window.__svc }));
for (const v of ['0.1', '0.3', '0.5', '0.7', '0.2']) await T('#setDim').evaluate((el, x) => { el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
for (const v of ['0.05', '0.2', '0.4']) await T('#setPanel').evaluate((el, x) => { el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pa').trim()), '0.4');
assert.deepEqual(await p.evaluate(() => ({ ...window.__svc })), svc0, 'kéo thanh trượt không được gọi lại dịch vụ nền');
assert.equal(await T('#setDim').isDisabled(), true, 'chưa có hình nền thì thanh độ tối bị khóa kèm chú thích');
await T('#setChatDelay').fill('7'); await T('#setChatDelay').blur();
await T('#setMax').fill('90'); await T('#setMax').blur();
await T('#setBlocked').fill('tục\nxấu'); await T('#setBlocked').blur();
const st = await p.evaluate(() => window.__mgr.settings);
assert.equal(st.chatDelayMs, 7000); assert.equal(st.maxChars, 90); assert.deepEqual(st.blockedWords, ['tục', 'xấu']);

await T('#checkAllAcc').click();
await p.waitForSelector('#allKeys .badge.ok');
await T('#openReport').click();
await p.waitForSelector('.rep');
await p.locator('.sheet .back').last().click();
// 8b) Dừng tất cả rồi bật lại
await p.locator('.sheet .back').last().click();
await T('#btnPause').click();
assert.equal(await p.evaluate(() => window.__mgr.runningAccounts().length), 0);
await T('#btnPause').click();
assert.equal(await p.evaluate(() => window.__mgr.runningAccounts().length), 1);

// 9) Lưu bền vững: tài khoản giữ nguyên key, lệnh, mô hình sau khi mở lại app
const a = await p.evaluate(() => window.__mgr.accounts[0]);
assert.equal(a.keys.length, 2); assert.equal(a.command, '/ly'); assert.equal(a.model, 'gemini-fast'); assert.deepEqual(a.combo.text, ['gemini-fast', 'gemini-custom']); assert.deepEqual(a.aliases, ['bé ly', 'ly ly']); assert.equal(a.maxChars, 120);

// 10) Xuất cấu hình không kèm bí mật
const exp = JSON.parse(await p.evaluate(() => window.__mgr.exportConfig(false)));
assert.equal(exp.accounts[0].password, ''); assert.deepEqual(exp.accounts[0].keys, []);

assert.deepEqual(errs, [], 'không có lỗi JS: ' + errs.join('|'));
console.log('ui e2e: PASS');
await b.close(); srv.close();
