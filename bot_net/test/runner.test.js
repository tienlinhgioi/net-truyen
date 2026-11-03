import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountBot, BotSet } from '../www/js/core/runner.js';
import { defaultAccount, defaultSettings } from '../www/js/core/store.js';

const gem = (text) => ({ status: 200, data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 7 } } });

function setup({ uploadResult = () => ({ status: 200, headers: {}, data: { status: true, url: 'https://st.netcdn.one/uploads/forum/ve.png' } }), profile = () => '', rand = () => 0.5, stickers = [], chatLists, gemini = () => gem('Chào bạn nhé'), sendResult = () => ({ ok: true }), account = {}, settings = {}, now = () => new Date('2026-11-03T12:00:00') } = {}) {
  const sleeps = [], sent = [], logs = [], saved = [];
  let call = 0, loggedIn = 0;
  const acc = { ...defaultAccount(), id: 'a1', email: 'e', password: 'p', name: 'Tiểu Ly', displayName: 'Tiểu Ly', command: '/ai', keys: ['K1'], model: 'm', ...account };
  const st = { ...defaultSettings(), chatDelayMs: 5000, ...settings };
  const http = async (r) => {
    if (r.url.endsWith('/ajax/forum/upload-image')) return uploadResult();
    if (r.url.endsWith('/ajax/search')) return { status: 200, headers: {}, data: { list: [{ url: '/manga/one-piece', name: 'One Piece' }] } };
    if (r.url.includes('generativelanguage')) return gemini(r);
    if (r.url.endsWith('/ajax/auth/login')) { loggedIn++; return { status: 200, headers: { 'set-cookie': 'UserID=1' }, data: { status: true } }; }
    if (r.url.endsWith('/auth/login')) return { status: 200, headers: {}, data: '' };
    if (r.url.endsWith('/user/profile')) return { status: 200, headers: {}, data: profile() };
    if (r.url.endsWith('/ajax/chat/list')) return { status: 200, headers: {}, data: { status: true, data: chatLists[Math.min(call++, chatLists.length - 1)] } };
    if (r.url.endsWith('/ajax/chat/send')) { const m = new URLSearchParams(r.data).get('message'); const res = sendResult(m); if (res.ok) sent.push(m); return { status: 200, headers: {}, data: { status: res.ok, message: res.msg } }; }
    return { status: 404, headers: {}, data: '' };
  };
  const bot = new AccountBot({ account: acc, getSettings: () => st, http, bots: new BotSet(), now, rand, stickers, sleep: async (ms) => sleeps.push(ms), log: (l) => logs.push(l), save: (a) => saved.push(a) });
  return { bot, sleeps, sent, logs, saved, acc, loggedIn: () => loggedIn };
}
const m = (id, user, message, name = 'X') => ({ id, user_id: user, name, message, manga: null });

test('lần poll đầu chỉ ghi mốc; poll sau có người gọi thì trả lời sau delay chat', async () => {
  const t = setup({ chatLists: [[m(1, 'u', '/ai cũ')], [m(1, 'u', '/ai cũ'), m(2, 'u', '/ai chào bạn')]] });
  await t.bot.tick();
  assert.deepEqual(t.sent, []);
  await t.bot.tick();
  assert.deepEqual(t.sent, ['Chào bạn nhé']);
  assert.ok(t.sleeps.some((x) => x >= 600 && x <= 1000), 'chờ theo thời gian gõ ngắn, không chờ 5 giây: ' + t.sleeps);
  assert.equal(t.bot.stats.sent, 1);
});

test('đăng nhập khi chưa có cookie và lưu lại cookie', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')]] });
  await t.bot.tick();
  assert.equal(t.loggedIn(), 1);
  assert.equal(t.saved.at(-1).cookies.UserID, '1');
});

test('ngoài lịch chạy thì không đọc chat, không trả lời', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai hi')]], settings: { schedule: { enabled: true, from: '01:00', to: '02:00' } } });
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, []);
  assert.equal(t.loggedIn(), 0);
});

test('từ khóa cấm: không trả lời câu chứa từ cấm', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai nói tục đi')]], settings: { blockedWords: ['nói tục'] } });
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, []);
});

test('web báo gửi quá nhanh thì tăng delay chat và thử lại cùng tin', async () => {
  let n = 0;
  const t = setup({
    chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai chào')]],
    sendResult: () => (n++ === 0 ? { ok: false, msg: 'Bạn gửi tin quá nhanh, vui lòng đợi' } : { ok: true }),
  });
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, ['Chào bạn nhé']);
  assert.ok(t.sleeps.some((s) => s >= 10000), 'delay đã tăng gấp đôi: ' + t.sleeps);
});

test('hết sạch key Gemini thì ghi log, không gửi gì, tin vẫn được thử lại lượt sau', async () => {
  let fail = true;
  const t = setup({
    chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai chào')], [m(2, 'u', '/ai chào')]],
    gemini: () => (fail ? { status: 429, data: {} } : gem('ok rồi')),
  });
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, []);
  assert.ok(t.logs.some((l) => /key/i.test(l.text)));
  fail = false; t.bot.pool.fail = () => {}; // key hồi lại
  Object.assign(t.bot.pool.state.get('K1'), { until: 0, mu: {} });
  await t.bot.tick();
  assert.deepEqual(t.sent, ['ok rồi']);
});

test('tự học chatUserId từ tin mình vừa gửi để không tự trả lời chính mình', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai chào')], [m(2, 'u', '/ai chào'), m(3, 'me-hash', 'Chào bạn nhé', 'Tiểu Ly')]] });
  await t.bot.tick(); await t.bot.tick(); await t.bot.tick();
  assert.equal(t.bot.account.chatUserId, 'me-hash');
});

test('giới hạn ký tự của tài khoản áp dụng lên câu trả lời', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai chào')]], account: { maxChars: 10 }, gemini: () => gem('Hôm nay trời đẹp quá, mình đi chơi nhé') });
  await t.bot.tick(); await t.bot.tick();
  assert.ok(t.sent[0].length <= 10, t.sent[0]);
});

test('combo: model đầu chết thì tự dùng model kế trong combo', async () => {
  const t = setup({
    chatLists: [[m(1, 'u', 'x')], [m(2, 'u', '/ai chào')]],
    account: { model: '', combo: { text: ['chet', 'song'], image: [], vision: [] } },
    gemini: (r) => (r.url.includes('models/chet:') ? { status: 404, data: {} } : gem('từ model sống')),
  });
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, ['từ model sống']);
});

test('làm mới hồ sơ định kỳ: avatar và tên cập nhật theo tài khoản', async () => {
  let avatar = 'https://x/a1.jpg';
  let clock = new Date('2026-11-03T12:00:00');
  const prof = () => `<img class="avatar user-img" src="${avatar}"><input name="user-name" value="Tiểu Ly">`;
  const t = setup({ profile: prof, chatLists: [[m(1, 'u', 'x')]], now: () => clock, settings: { profileRefreshMs: 60000 } });
  await t.bot.tick();
  assert.equal(t.acc.avatar, 'https://x/a1.jpg');
  avatar = 'https://x/a2.jpg';
  await t.bot.tick();
  assert.equal(t.acc.avatar, 'https://x/a1.jpg', 'chưa tới hạn làm mới');
  clock = new Date('2026-11-03T12:02:00');
  await t.bot.tick();
  assert.equal(t.acc.avatar, 'https://x/a2.jpg');
});

test('tin của chính mình trong chat kèm avatar/tên mới thì cập nhật luôn', async () => {
  const t = setup({
    account: { chatUserId: 'me-hash', avatar: 'old.jpg', cookies: { UserID: '1' } },
    chatLists: [[m(1, 'u', 'x')], [m(1, 'u', 'x'), { ...m(2, 'me-hash', 'alo', 'Tên Mới'), avatar: 'https://x/new.jpg' }]],
  });
  await t.bot.tick(); await t.bot.tick();
  assert.equal(t.acc.avatar, 'https://x/new.jpg');
  assert.equal(t.acc.displayName, 'Tên Mới');
});

test('refreshProfile thủ công trả về true khi có thay đổi', async () => {
  const t = setup({ profile: () => '<img class="avatar user-img" src="https://x/z.jpg"><input name="user-name" value="Ly Mới">', chatLists: [[m(1, 'u', 'x')]] });
  await t.bot.tick();
  t.acc.avatar = 'khac';
  assert.equal(await t.bot.refreshProfile(), true);
  assert.equal(t.acc.avatar, 'https://x/z.jpg');
});

const json = (o) => gem(JSON.stringify(o));
const uniq = (extra = {}) => { let n = 0; return () => json({ reply: `trả lời số ${++n}`, ...extra }); };
const mention = (extra = {}) => ({ chatLists: [[m(1, 'u', 'x')], [m(1, 'u', 'x'), m(2, 'u', '/ai chào', 'Bạn A')]], ...extra });
const twoTicks = async (t) => { await t.bot.tick(); await t.bot.tick(); };

test('phản hồi nhanh: bắt đầu hỏi Gemini ngay, thời gian gõ tính chồng lên thời gian chờ Gemini', async () => {
  const t = setup(mention());
  await twoTicks(t);
  assert.ok(t.sleeps.every((x) => x < 2000), 'không còn chờ cố định 5 giây: ' + t.sleeps);
});

test('delay chat là khoảng cách tối thiểu giữa 2 tin liên tiếp', async () => {
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(1, 'u', 'x'), m(2, 'u', '/ai một', 'A'), m(3, 'u', '/ai hai', 'A')]], settings: { chatDelayMs: 5000 }, gemini: uniq() });
  await twoTicks(t);
  assert.equal(t.sent.length, 2);
  assert.ok(t.sleeps.some((x) => x >= 4000), 'tin thứ 2 phải chờ đủ khoảng cách: ' + t.sleeps);
});

test('tách câu trả lời dài/hai đoạn thành 2 tin', async () => {
  const t = setup(mention({ gemini: () => json({ reply: 'đoạn một\n\nđoạn hai' }) }));
  await twoTicks(t);
  assert.deepEqual(t.sent, ['đoạn một', 'đoạn hai']);
});

test('sticker: kèm sticker từ bộ đã chọn của tài khoản', async () => {
  const t = setup(mention({ account: { stickerPacks: ['p1'] }, stickers: [{ id: 'p1', urls: ['https://s/1.png'] }], gemini: () => json({ reply: 'haha', sticker: true }) }));
  await twoTicks(t);
  assert.deepEqual(t.sent, ['haha', '[IMG=https://s/1.png]']);
});

test('gửi truyện: tìm theo tên rồi gửi thẻ truyện', async () => {
  const t = setup(mention({ gemini: () => json({ reply: 'nè bạn', manga: 'one piece' }) }));
  await twoTicks(t);
  assert.deepEqual(t.sent, ['nè bạn', '[MANGA=one-piece]']);
});

test('tạo ảnh: dùng combo ảnh, tải lên bằng phiên đăng nhập của tài khoản (không cần khóa nào) rồi gửi', async () => {
  const gemini = (r) => (r.data.generationConfig?.responseModalities ? { status: 200, data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }] } } : json({ reply: 'để mình vẽ', draw: 'một chú mèo' }));
  const t = setup(mention({ gemini, account: { combo: { text: [], image: ['img-model'], vision: [] } }, }));
  await twoTicks(t);
  assert.deepEqual(t.sent, ['để mình vẽ', '[IMG=https://st.netcdn.one/uploads/forum/ve.png]']);
  assert.equal(t.bot.account.stats.days[Object.keys(t.bot.account.stats.days)[0]].images, 1);
});

test('tạo ảnh: web từ chối tải ảnh thì chỉ báo lỗi trong nhật ký, tin chữ vẫn gửi', async () => {
  const gemini = (r) => (r.data.generationConfig?.responseModalities ? { status: 200, data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }] } } : json({ reply: 'để mình vẽ', draw: 'mèo' }));
  const t = setup(mention({ gemini, uploadResult: () => ({ status: 200, headers: {}, data: { status: false, message: 'Bạn cần đăng nhập' } }), account: { combo: { text: [], image: ['img-model'], vision: [] } } }));
  await twoTicks(t);
  assert.deepEqual(t.sent, ['để mình vẽ']);
  assert.ok(t.logs.some((l) => /ảnh/i.test(l.text) && l.level === 'error'));
});

test('tạo ảnh: giới hạn số ảnh mỗi ngày', async () => {
  let drawN = 0;
  const gemini = (r) => (r.data.generationConfig?.responseModalities ? { status: 200, data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }] } } : (() => { drawN++; return json({ reply: `vẽ nè ${drawN}`, draw: 'mèo' }); })());
  const t = setup({
    chatLists: [[m(1, 'u', 'x')], [m(1, 'u', 'x'), m(2, 'u', '/ai vẽ mèo', 'A'), m(3, 'u', '/ai vẽ chó', 'A')]],
    gemini, account: { combo: { text: [], image: ['img-model'], vision: [] } }, settings: { imagePerDay: 1, imageCooldownMs: 0 },
  });
  await twoTicks(t);
  assert.equal(t.sent.filter((x) => x.startsWith('[IMG=')).length, 1);
  assert.ok(t.logs.some((l) => /giới hạn/i.test(l.text)));
});

test('ghi nhớ về người đối thoại và dùng lại ở lần sau', async () => {
  let seen = '';
  const t = setup({
    chatLists: [[m(1, 'u', 'x')], [m(1, 'u', 'x'), m(2, 'u7', '/ai mình thích bún', 'An')], [m(1, 'u', 'x'), m(2, 'u7', '/ai mình thích bún', 'An'), m(3, 'u7', '/ai nhớ mình không', 'An')]],
    gemini: (r) => { seen += JSON.stringify(r.data.systemInstruction) + JSON.stringify(r.data.contents); return json({ reply: 'ok', remember: 'thích bún' }); },
  });
  await t.bot.tick(); await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.bot.memory.get('u7').notes, ['thích bún']);
  assert.match(seen, /thích bún/);
});

test('tiếp tục trò chuyện: sau khi trả lời, người đó nhắn tiếp không cần gọi tên vẫn được trả lời; hết 3 phút thì thôi', async () => {
  let clock = new Date('2026-11-03T12:00:00');
  const t = setup({
    now: () => clock,
    chatLists: [[m(1, 'u', 'x')], [m(1, 'u', 'x'), m(2, 'u7', '/ai chào', 'An')], [m(1, 'u', 'x'), m(2, 'u7', '/ai chào', 'An'), m(3, 'u7', 'bạn khỏe không', 'An')], [m(1, 'u', 'x'), m(2, 'u7', '/ai chào', 'An'), m(3, 'u7', 'bạn khỏe không', 'An'), m(4, 'u7', 'còn đó không', 'An')]],
    gemini: uniq(),
  });
  await t.bot.tick(); await t.bot.tick();
  assert.equal(t.sent.length, 1);
  clock = new Date('2026-11-03T12:01:00');
  await t.bot.tick();
  assert.equal(t.sent.length, 2, 'trả lời tiếp khi đang trò chuyện');
  clock = new Date('2026-11-03T12:10:00');
  await t.bot.tick();
  assert.equal(t.sent.length, 2, 'quá 3 phút thì không tự trả lời nữa');
});

test('chen ngang ngẫu nhiên có giới hạn mỗi giờ và tắt được theo tài khoản', async () => {
  const lists = [[m(1, 'u', 'x')], [m(1, 'u', 'x'), m(2, 'u2', 'hôm nay mưa', 'B')], [m(1, 'u', 'x'), m(2, 'u2', 'hôm nay mưa', 'B'), m(3, 'u3', 'trời mát ghê', 'C')]];
  const on = setup({ chatLists: lists, settings: { proactiveChance: 1, proactiveMaxPerHour: 1, chatDelayMs: 0 }, rand: () => 0 });
  await on.bot.tick(); await on.bot.tick(); await on.bot.tick();
  assert.equal(on.sent.length, 1, 'tối đa 1 tin chen ngang mỗi giờ');
  const off = setup({ chatLists: lists, settings: { proactiveChance: 1 }, rand: () => 0, account: { proactive: false } });
  await off.bot.tick(); await off.bot.tick();
  assert.equal(off.sent.length, 0);
});

test('tránh lặp: câu trả lời giống câu vừa gửi thì hỏi lại một lần để có câu khác', async () => {
  let n = 0;
  const outs = ['Chào bạn', 'Chào bạn', 'Ừa chào nha'];
  const t = setup({
    chatLists: [[m(1, 'u', 'x')], [m(1, 'u', 'x'), m(2, 'u', '/ai một', 'A')], [m(1, 'u', 'x'), m(2, 'u', '/ai một', 'A'), m(3, 'v', '/ai hai', 'B')]],
    gemini: () => gem(outs[n++]),
  });
  await t.bot.tick(); await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, ['Chào bạn', 'Ừa chào nha']);
});

test('thống kê theo ngày: tin đã gửi, chen ngang, sticker, truyện', async () => {
  const t = setup(mention({ gemini: () => json({ reply: 'x', manga: 'one piece' }) }));
  await twoTicks(t);
  const d = Object.values(t.bot.account.stats.days)[0];
  assert.equal(d.sent, 2); assert.equal(d.mangas, 1);
});

test('mở chủ đề khi phòng chat im lặng lâu (nếu bật), có giới hạn', async () => {
  let clock = new Date('2026-11-03T12:00:00');
  const old = { id: 1, user_id: 'u', name: 'X', message: 'cũ', manga: null, timestamp: Math.floor(clock.getTime() / 1000) - 3600 };
  const t = setup({ now: () => clock, chatLists: [[old]], settings: { starterEnabled: true, starterIdleMs: 20 * 60000, proactiveMaxPerHour: 3 }, rand: () => 0, gemini: () => json({ reply: 'mọi người ơi dạo này đọc bộ nào hay không' }) });
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(t.sent, ['mọi người ơi dạo này đọc bộ nào hay không']);
});

test('tiết kiệm hạn mức: tin tự chen vào bị bỏ khi model đã dùng từ 70%, người gọi bot vẫn được trả lời', async () => {
  let called = 0;
  const lists = [[m(1, 'u', 'x')], [m(1, 'u', 'x'), m(2, 'u2', 'hôm nay mưa', 'B')], [m(1, 'u', 'x'), m(2, 'u2', 'hôm nay mưa', 'B'), m(3, 'u', '/ai chào', 'A')]];
  const t = setup({ chatLists: lists, settings: { proactiveChance: 1, chatDelayMs: 0 }, rand: () => 0, gemini: () => { called++; return gem('Chào bạn nhé'); } });
  t.bot.quotaPct = () => 80;
  await t.bot.tick(); await t.bot.tick();
  assert.equal(called, 0, 'tin chen ngang không tốn lượt khi gần hết hạn mức');
  assert.ok(t.logs.some((l) => /Tiết kiệm hạn mức/.test(l.text)));
  await t.bot.tick();
  assert.equal(called, 1, 'người gọi bot vẫn được trả lời');
});

test('ưu tiên model còn hạn mức: model gần hết (>=95%) bị đẩy xuống cuối combo', async () => {
  const used = [];
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(1, 'u', 'x'), m(2, 'u', '/ai chào', 'A')]], account: { combo: { text: ['hetquota', 'con'], image: [], vision: [] } }, gemini: (r) => { used.push(/models\/([^:]+):/.exec(r.url)[1]); return gem('ok nhé'); } });
  t.bot.quotaPct = (model) => (model === 'hetquota' ? 100 : 5);
  await t.bot.tick(); await t.bot.tick();
  assert.deepEqual(used, ['con']);
});

test('hết key vì model không có hạn mức: nhật ký nêu đúng lý do', async () => {
  const pro = { error: { code: 429, message: 'q', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { retryDelay: '78958s' }] } };
  const t = setup({ chatLists: [[m(1, 'u', 'x')], [m(1, 'u', 'x'), m(2, 'u', '/ai chào', 'A')]], gemini: () => ({ status: 429, data: pro }) });
  await t.bot.tick(); await t.bot.tick();
  assert.ok(t.logs.some((l) => /không có hạn mức miễn phí/.test(l.text)), JSON.stringify(t.logs.map((l) => l.text)));
});
