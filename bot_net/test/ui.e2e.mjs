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
  window.__sent = [];
  const chat = [{ id: 1, user_id: 'u1', name: 'Người lạ', message: 'hello', manga: null }];
  window.__chat = chat;
  window.__BOTNET_TEST__ = {
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
      if (r.url.includes('/v1beta/models?')) return ok({ models: [{ name: 'models/gemini-fast', displayName: 'Gemini Fast', inputTokenLimit: 1000000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-pro', displayName: 'Gemini Pro', inputTokenLimit: 2000000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }] });
      if (r.url.includes(':generateContent')) return ok({ candidates: [{ content: { parts: [{ text: 'Chào bạn, mình là Ly nè' }] } }], usageMetadata: { totalTokenCount: 21 } });
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
await T('#modelBtn').click();
await p.waitForSelector('.model');
assert.equal(await T('.model').count(), 2); await shot('5-models');
await p.locator('.model[data-id="gemini-fast"]').click();
assert.match(await T('#modelBtn').innerText(), /gemini-fast/);

// 5) Chat thử (không gửi lên web)
await T('#testIn').fill('chào Ly'); await T('#testGo').click();
await p.waitForFunction(() => document.querySelector('.chat-test .ans')?.textContent.includes('mình là Ly'));
assert.equal(await p.evaluate(() => window.__sent.length), 0, 'chat thử không được gửi lên web');

// 6) Bot thật: có người gọi bằng lệnh /ly -> bot trả lời và ghi nhật ký
await p.evaluate(() => window.__chat.push({ id: 2, user_id: 'u2', name: 'Bạn A', message: '/ly hôm nay vui không', manga: null }));
await p.waitForFunction(() => window.__sent.length > 0, null, { timeout: 15000 });
assert.deepEqual(await p.evaluate(() => window.__sent), ['Chào bạn, mình là Ly nè']);
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
await T('#setChatDelay').fill('7'); await T('#setChatDelay').blur();
await T('#setMax').fill('90'); await T('#setMax').blur();
await T('#setBlocked').fill('tục\nxấu'); await T('#setBlocked').blur();
const st = await p.evaluate(() => window.__mgr.settings);
assert.equal(st.chatDelayMs, 7000); assert.equal(st.maxChars, 90); assert.deepEqual(st.blockedWords, ['tục', 'xấu']);

// 9) Lưu bền vững: tài khoản giữ nguyên key, lệnh, mô hình sau khi mở lại app
const a = await p.evaluate(() => window.__mgr.accounts[0]);
assert.deepEqual(a.keys.length, 2); assert.equal(a.command, '/ly'); assert.equal(a.model, 'gemini-fast'); assert.deepEqual(a.aliases, ['bé ly', 'ly ly']); assert.equal(a.maxChars, 120);

// 10) Xuất cấu hình không kèm bí mật
const exp = JSON.parse(await p.evaluate(() => window.__mgr.exportConfig(false)));
assert.equal(exp.accounts[0].password, ''); assert.deepEqual(exp.accounts[0].keys, []);

assert.deepEqual(errs, [], 'không có lỗi JS: ' + errs.join('|'));
console.log('ui e2e: PASS');
await b.close(); srv.close();
