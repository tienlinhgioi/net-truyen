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
      if ((r.headers['x-goog-api-key'] || '').includes('QUOTA')) return { status: 429, headers: {}, data: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '100' }] }] } } };
      if (r.url.includes('models/gemini-noq-pro:')) return { status: 429, headers: {}, data: { error: { code: 429, message: 'quota', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } } };
      if (r.url.includes('models/gemini-pro:')) return { status: 404, headers: {}, data: {} };
      if (r.url.includes('/v1beta/models?')) return ok({ models: [{ name: 'models/gemini-fast', displayName: 'Gemini Fast', inputTokenLimit: 1000000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-pro', displayName: 'Gemini Pro', inputTokenLimit: 2000000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-quick', displayName: 'Quick', inputTokenLimit: 1000000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-noq-pro', displayName: 'NoQ', inputTokenLimit: 1000000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.0-flash-image', displayName: 'Flash Image', inputTokenLimit: 32000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }] });
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
assert.equal(await T('.model').count(), 4); await shot('5-models');
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
await p.waitForSelector('.keyblock[data-key="2"] .badge.bad');
assert.match(await p.locator('.keyblock[data-key="0"] .badge:not(.plan)').innerText(), /Sống/);
assert.match(await p.locator('.keyblock[data-key="2"] .hint.err').innerText(), /HTTP 400.*API key not valid/, 'hiện lý do lỗi thật của Google');
assert.match(await p.locator('.keyblock[data-key="2"] .badge:not(.plan)').innerText(), /Sai/);

await p.locator('.keyblock[data-key="2"] button', { hasText: 'Xóa' }).click();
// key hết hạn mức theo ngày: app tự học giới hạn 100 lượt/ngày từ lời Google báo
await T('#keyInput').fill('AIzaSyQUOTA0000000'); await T('#keyAdd').click();
await T('#keyCheckAll').click();
await p.waitForSelector('.keyblock[data-key="2"] .badge.warn');
assert.match(await p.locator('.keyblock[data-key="2"] .badge:not(.plan)').innerText(), /Hết hạn mức/);
// gói: key bị 429 mang tên hạn mức FreeTier => Gói miễn phí; key chưa rõ thì ghi chưa rõ
assert.match(await p.locator('.keyblock[data-key="2"] .badge.plan').innerText(), /Gói miễn phí/);
assert.match(await p.locator('.keyblock[data-key="0"] .badge.plan').innerText(), /Gói miễn phí/); // đã thử model Pro khác: 429 mang tên FreeTier
// Google báo hết hạn mức theo ngày (100 lượt) => số lượt hôm nay đồng bộ 100/100 = 100%
assert.match(await p.locator('.keyblock[data-key="2"] .pct').innerText(), /100%/);
// tìm nhanh key
await T('#keySearch').fill('QUOTA');
assert.equal(await p.locator('#comboBox').count(), 1);
assert.equal(await p.locator('.sec .keyblock').count(), 1, 'chỉ còn key khớp');
await T('#keySearch').fill('miễn phí');
assert.equal(await p.locator('.sec .keyblock').count(), 3, 'cả 3 key đều nhận ra là gói miễn phí');
await T('#keySearch').fill('trả phí');
assert.equal(await p.locator('.sec .keyblock').count(), 0);
assert.match(await p.locator('.sec .empty').innerText(), /Không có key nào khớp/);
await T('#keySearch').fill('');
assert.equal(await p.locator('.sec .keyblock').count(), 3);
const accTexts = (await p.locator('.keyblock .badge').allInnerTexts()).map((x) => x.replace(/\d+ms/, 'Nms'));

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
const back = () => p.locator('.sheet .back').last().click();
await T('#btnSettings').click();
// Cài đặt tách thành 4 màn riêng
assert.deepEqual(await p.locator('.cat').evaluateAll((els) => els.map((e) => e.id)), ['catAppearance', 'catModels', 'catBehavior', 'catSystem']);
await shot('6-settings');
await T('#catAppearance').click();
await T('#setBg').evaluate((el) => { el.value = '#102030'; el.dispatchEvent(new Event('input', { bubbles: true })); });
assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), '#102030');
const svc0 = await p.evaluate(() => ({ ...window.__svc }));
for (const v of ['0.1', '0.3', '0.5', '0.7', '0.2']) await T('#setDim').evaluate((el, x) => { el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
for (const v of ['0.05', '0.2', '0.4']) await T('#setPanel').evaluate((el, x) => { el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pa').trim()), '0.4');
assert.deepEqual(await p.evaluate(() => ({ ...window.__svc })), svc0, 'kéo thanh trượt không được gọi lại dịch vụ nền');
assert.equal(await T('#setDim').isDisabled(), true, 'chưa có hình nền thì thanh độ tối bị khóa kèm chú thích');
assert.equal(await p.locator('#setChatDelay').count(), 0, 'màn Giao diện không chứa cài đặt delay');
await back();
await T('#catBehavior').click();
await T('#setChatDelay').fill('7'); await T('#setChatDelay').blur();
await T('#setMax').fill('90'); await T('#setMax').blur();
await T('#setBlocked').fill('tục\nxấu'); await T('#setBlocked').blur();
await T('#setMaxReplies').fill('2'); await T('#setMaxReplies').blur();
const st = await p.evaluate(() => window.__mgr.settings);
assert.equal(st.maxRepliesPerQuestion, 2);
assert.equal(st.chatDelayMs, 7000); assert.equal(st.maxChars, 90); assert.deepEqual(st.blockedWords, ['tục', 'xấu']);

await back();
await T('#catModels').click();
await T('#checkAllAcc').click();
await p.waitForSelector('#allKeys .badge.ok');
// kết quả ở Cài đặt phải GIỐNG HỆT màn Tài khoản (cùng cách kiểm tra)
const setTexts = (await p.locator('#allKeys .keyblock .badge').allInnerTexts()).map((x) => x.replace(/\d+ms/, 'Nms'));
assert.deepEqual(setTexts, accTexts, 'Cài đặt và Tài khoản phải cho cùng kết quả');
// phần trăm mức dùng theo giới hạn đã học (100 lượt/ngày), rồi đổi giới hạn thủ công
const q0 = await p.locator('#allKeys .keyblock').first().locator('.quota').innerText();
assert.match(q0, /\d+\/100 lượt/); assert.match(q0, /\d+%/); assert.match(q0, /tự học/);
await T('[data-lim="gemini-fast:rpd"]').fill('200'); await T('[data-lim="gemini-fast:rpd"]').blur();
await p.locator('#allKeys').evaluate(() => {});
await T('#checkAllAcc').click(); await p.waitForFunction(() => document.querySelector('#checkAllAcc').textContent.includes('Kiểm tra đồng loạt'));
assert.match(await p.locator('#allKeys .keyblock').first().locator('.quota').innerText(), /\/200 lượt/);
await p.locator('#allKeys').scrollIntoViewIfNeeded(); await shot('7-keys');
await back();
await T('#catSystem').click();
await T('#openReport').click();
await p.waitForSelector('.rep');
await back();
await back();
await back();
// 8b) Dừng tất cả rồi bật lại
await T('#btnPause').click();
assert.equal(await p.evaluate(() => window.__mgr.runningAccounts().length), 0);
await T('#btnPause').click();
assert.equal(await p.evaluate(() => window.__mgr.runningAccounts().length), 1);

// 9) Lưu bền vững: tài khoản giữ nguyên key, lệnh, mô hình sau khi mở lại app
const a = await p.evaluate(() => window.__mgr.accounts[0]);
assert.equal(a.keys.length, 3); assert.equal(a.command, '/ly'); assert.equal(a.model, 'gemini-fast'); assert.deepEqual(a.combo.text, ['gemini-fast', 'gemini-custom']); assert.deepEqual(a.aliases, ['bé ly', 'ly ly']); assert.equal(a.maxChars, 120);

// 10) Xuất cấu hình không kèm bí mật
const exp = JSON.parse(await p.evaluate(() => window.__mgr.exportConfig(false)));
assert.equal(exp.accounts[0].password, ''); assert.deepEqual(exp.accounts[0].keys, []);

// 10b) Trí nhớ: xem/quên ghi chú từng người, nạp lại prompt, xóa ghi chú cũ và nạp lại AI
const mid = await p.evaluate(() => window.__mgr.accounts[0].id);
await p.evaluate((id) => { window.__mgr.setEnabled(id, true); window.__mgr.bots.get(id).memory.add('u1', 'An', 'thích bún'); window.__b0 = window.__mgr.bots.get(id); }, mid);
await p.evaluate(() => document.querySelectorAll('.sheet').forEach((x) => x.remove()));
await T('#btnAccounts').click(); await T('.acc .meta').click();
assert.match(await p.locator('.mem-row[data-uid="u1"]').innerText(), /An[\s\S]*thích bún/);
await p.locator('.mem-row[data-uid="u1"] button', { hasText: 'Quên' }).click();
assert.equal(await p.locator('.mem-row').count(), 0);
await p.evaluate((id) => window.__mgr.bots.get(id).memory.add('u2', 'Bình', 'có mèo'), mid);
await T('#fPrompt').fill('Bạn là Ly phiên bản mới, hay mơ mộng.');
await T('#reloadPrompt').click();
assert.equal(await p.evaluate((id) => window.__mgr.bots.get(id).account.prompt, mid), 'Bạn là Ly phiên bản mới, hay mơ mộng.');
assert.equal(await p.evaluate(() => window.__mgr.bots.get(window.__mgr.accounts[0].id) !== window.__b0), true, 'nạp lại prompt tạo bot mới');
assert.equal(await p.locator('.mem-row').count(), 1, 'nạp lại prompt vẫn giữ ghi chú');
p.once('dialog', (d) => d.accept());
await T('#clearMemory').click();
assert.equal(await p.locator('.mem-row').count(), 0);
assert.deepEqual(await p.evaluate((id) => window.__mgr.memoryOf(id), mid), []);
// 11) Quét model: chỉ model sống vào combo, model 404/không có hạn mức bị loại
await p.evaluate(() => document.querySelectorAll('.sheet').forEach((x) => x.remove()));
await T('#btnAccounts').click(); await T('.acc .meta').click();
p.once('dialog', (d) => d.accept());
await T('#comboScan').click();
await p.waitForSelector('.scan-row');
assert.match(await p.locator('.scan-row[data-model="gemini-noq-pro"] .badge').innerText(), /Không có hạn mức/);
assert.match(await p.locator('.scan-row[data-model="gemini-pro"] .badge').innerText(), /Chết/);
await T('#scanApply').click();
await p.waitForTimeout(300);
assert.deepEqual([...(await p.evaluate(() => window.__mgr.accounts[0].combo.text))].sort(), ['gemini-fast', 'gemini-quick']);
// 12a) Giới hạn số tin trả lời riêng của tài khoản
await T('#fMaxReplies').fill('1'); await T('#fMaxReplies').blur();
assert.equal(await p.evaluate(() => window.__mgr.accounts[0].maxReplies), 1);
// 12) Dán nhiều key một lần + kiểm tra tình trạng tất cả model
await T('#keyBulk').fill('AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1, AIzaSyBBBBBBBBBBBBBBBBBBBBBBBBBBBBB2\nrác ngắn');
await T('#keyBulkAdd').click();
assert.equal(await p.evaluate(() => window.__mgr.accounts[0].keys.length), 5);
p.once('dialog', (d) => d.accept());
await T('#scanAllModels').click();
await p.waitForSelector('#scanSummary');
assert.equal(await p.locator('.scan-row').count(), 5);
assert.match(await p.locator('.scan-row[data-model="gemini-2.0-flash-image"] .badge').innerText(), /Không thử tự động/);
assert.match(await p.locator('#scanSummary').innerText(), /Sống: 2/);
assert.equal(await T('#getKey').getAttribute('href'), 'https://aistudio.google.com/apikey');

// 13) Tắt tài khoản là dừng thật; "Chạy ngầm" tắt thì app ra nền bot dừng, quay lại thì chạy lại
const accId = await p.evaluate(() => window.__mgr.accounts[0].id);
await p.evaluate((id) => window.__mgr.setEnabled(id, true), accId);
assert.equal(await p.evaluate(() => window.__mgr.runningAccounts().length), 1);
const hide = (hidden) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { get: () => h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
await hide(true);
assert.equal(await p.evaluate(() => window.__mgr.runningAccounts().length), 1, 'bật chạy ngầm: ra nền vẫn chạy');
await p.evaluate(() => window.__mgr.updateSettings({ runInBackground: false }));
await hide(true);
assert.equal(await p.evaluate(() => window.__mgr.runningAccounts().length), 0, 'tắt chạy ngầm: ra nền thì dừng');
assert.equal(await p.evaluate(() => window.__mgr.accounts[0].enabled), true, 'không đổi trạng thái bật/tắt của tài khoản');
await hide(false);
assert.equal(await p.evaluate(() => window.__mgr.runningAccounts().length), 1, 'quay lại app thì chạy lại');
await p.evaluate((id) => window.__mgr.setEnabled(id, false), accId);
const before = await p.evaluate(() => window.__sent.length);
await p.evaluate(() => window.__chat.push({ id: 900, user_id: 'u9', name: 'Ai đó', message: '/ly còn chạy không', manga: null }));
await p.waitForTimeout(600);
assert.equal(await p.evaluate(() => window.__sent.length), before, 'đã tắt tài khoản thì không trả lời nữa');

// 14) Nhật ký riêng từng tài khoản
await p.evaluate(() => document.querySelectorAll('.sheet').forEach((x) => x.remove()));
await p.evaluate(() => {
  const mg = window.__mgr;
  mg.accounts.push({ ...JSON.parse(JSON.stringify(mg.accounts[0])), id: 'acc2', displayName: 'Mai', name: 'Mai', enabled: false });
  mg.emit('accounts');
  mg.log({ t: Date.now() - 1, level: 'info', text: 'dòng của Tiểu Ly', acc: mg.accounts[0].id });
  mg.log({ t: Date.now(), level: 'info', text: 'dòng của Mai', acc: 'acc2' });
});
assert.deepEqual(await p.locator('#logTabs .chip').allInnerTexts(), ['Tất cả', 'Tiểu Ly', 'Mai']);
await p.locator('#logTabs .chip[data-acc="acc2"]').click();
assert.deepEqual(await p.locator('#log li').evaluateAll((els) => els.map((e) => e.dataset.acc)), ['acc2'], 'chỉ thấy nhật ký của Mai');
await p.locator('#logTabs .chip[data-acc=""]').click();
assert.ok((await p.locator('#log li').count()) > 1, 'xem tất cả gồm nhật ký của mọi tài khoản');
await p.locator('#logTabs .chip[data-acc="acc2"]').click();
await T('#btnClearLog').click();
assert.equal(await p.locator('#log li').count(), 0);
await p.locator('#logTabs .chip[data-acc=""]').click();
assert.ok((await p.locator('#log li').count()) > 0, 'xóa nhật ký của Mai không đụng nhật ký của Tiểu Ly');
await T('#btnAccounts').click(); await p.locator('.acc').first().locator('.meta').click();
assert.equal(await p.locator('#accLog li', { hasText: 'dòng của Tiểu Ly' }).count(), 1);
assert.equal(await p.locator('#accLog li', { hasText: 'dòng của Mai' }).count(), 0, 'nhật ký trong màn tài khoản chỉ của tài khoản đó');

assert.deepEqual(errs, [], 'không có lỗi JS: ' + errs.join('|'));
console.log('ui e2e: PASS');
await b.close(); srv.close();
