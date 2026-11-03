import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionKind, routeMention, ClaimBoard } from '../www/js/core/route.js';
import { AccountBot, BotSet } from '../www/js/core/runner.js';
import { Manager } from '../www/js/manager.js';
import { defaultAccount, defaultSettings } from '../www/js/core/store.js';

const ly = { id: 'ly', name: 'Tiểu Ly', displayName: 'Tiểu Ly', aliases: ['bé ly'], command: '/ai' };
const mai = { id: 'mai', name: 'Mai', displayName: 'Mai', aliases: [], command: '/ai' };
const m = (id, user, message, name = 'X') => ({ id, user_id: user, name, message, manga: null });

test('mentionKind: gọi theo tên hay chỉ theo lệnh', () => {
  assert.equal(mentionKind('tiểu ly ơi', ly), 'name');
  assert.equal(mentionKind('/ai chào', ly), 'command');
  assert.equal(mentionKind('mai /ai chào', mai), 'name', 'có cả tên và lệnh thì tính là gọi theo tên');
  assert.equal(mentionKind('chào cả nhà', ly), null);
});

test('routeMention: lệnh chung /ai chỉ MỘT tài khoản trả lời; gọi đích danh thì đúng tài khoản đó', () => {
  const all = [ly, mai];
  assert.deepEqual(routeMention('/ai chào', all), ['ly'], 'lệnh chung: chỉ tài khoản đầu tiên');
  assert.deepEqual(routeMention('mai ơi /ai chào', all), ['mai'], 'gọi tên thì tài khoản được gọi, không phải tất cả');
  assert.deepEqual(routeMention('tiểu ly và mai ơi', all), ['ly', 'mai'], 'gọi cả hai thì cả hai');
  assert.deepEqual(routeMention('chào cả nhà', all), []);
});

test('ClaimBoard: mỗi tin chỉ một tài khoản giữ quyền trả lời (chen ngang/tiếp tục)', () => {
  const b = new ClaimBoard();
  assert.equal(b.claim(10, 'ly'), true);
  assert.equal(b.claim(10, 'mai'), false);
  assert.equal(b.claim(10, 'ly'), true, 'chính chủ hỏi lại vẫn được');
  assert.equal(b.claim(11, 'mai'), true);
});

// ---- Nhiều bot cùng một phòng, dùng chung BotSet như app thật
const gem = (text) => ({ status: 200, data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 1 } } });
function room(lists) {
  const sent = { ly: [], mai: [] };
  let n = 0, k = 0;
  const mk = (acc, who) => async (r) => {
    if (r.url.includes('generativelanguage')) return gem(JSON.stringify({ reply: `trả lời ${who} ${++k}` }));
    if (r.url.endsWith('/ajax/chat/list')) return { status: 200, headers: {}, data: { status: true, data: lists[Math.min(n++ >> 1, lists.length - 1)](sent) } };
    if (r.url.endsWith('/ajax/chat/send')) { sent[who].push(new URLSearchParams(r.data).get('message')); return { status: 200, headers: {}, data: { status: true } }; }
    return { status: 200, headers: {}, data: { status: true } };
  };
  const bots = new BotSet(); const claims = new ClaimBoard(); const accounts = [];
  const make = (base, who) => {
    const a = { ...defaultAccount(), cookies: { UserID: '1' }, keys: ['K'], model: 'm', ...base };
    accounts.push(a);
    return new AccountBot({ account: a, getSettings: () => ({ ...defaultSettings(), chatDelayMs: 0, typingMinMs: 0, typingMaxMs: 0, proactiveChance: 1, botToBotCooldownMs: 0 }), http: mk(a, who), bots, sleep: async () => {}, rand: () => 0,
      coordinator: { allowed: (msg) => routeMention(msg.message, accounts).includes(a.id), addressed: (msg) => routeMention(msg.message, accounts).length > 0, claim: (id) => claims.claim(id, a.id) } });
  };
  return { sent, A: make(ly, 'ly'), B: make(mai, 'mai'), accounts };
}

test('hai tài khoản cùng phòng: tin "/ai ..." chỉ một tài khoản trả lời, gọi tên thì đúng tài khoản đó', async () => {
  const base = [m(1, 'u', 'x')];
  const { sent, A, B } = room([() => base, () => [...base, m(2, 'u', '/ai chào mọi người', 'An'), m(3, 'u2', 'mai ơi giúp mình', 'Bình')]]);
  await A.tick(); await B.tick(); await A.tick(); await B.tick();
  assert.equal(sent.ly.length + sent.mai.length, 2, JSON.stringify(sent));
  assert.equal(sent.ly.length, 1, 'tin /ai chỉ Tiểu Ly (tài khoản đầu) trả lời');
  assert.equal(sent.mai.length, 1, 'tin gọi "mai" chỉ Mai trả lời');
});

test('hai tài khoản cùng phòng: chen ngang ngẫu nhiên không bao giờ trùng một tin', async () => {
  const base = [m(1, 'u', 'x')];
  const { sent, A, B } = room([() => base, () => [...base, m(2, 'u', 'hôm nay mưa quá', 'An')]]);
  await A.tick(); await B.tick(); await A.tick(); await B.tick();
  assert.equal(sent.ly.length + sent.mai.length, 1, 'chỉ một tài khoản chen vào: ' + JSON.stringify(sent));
});

test('hai tài khoản gửi câu giống hệt nhau: không nhận nhầm tin của tài khoản kia là của mình', async () => {
  const same = 'ok nhé';
  const base = [m(1, 'u', 'x')];
  const echo = [m(2, 'idLy', same, 'Tiểu Ly'), m(3, 'idMai', same, 'Mai')];
  const { A, B } = room([() => base, () => [...base, ...echo]]);
  A.sentNorms.add('ok nhe'); B.sentNorms.add('ok nhe');
  await A.tick(); await B.tick(); await A.tick(); await B.tick();
  assert.equal(B.account.chatUserId, 'idMai', 'Mai nhận đúng tin của Mai');
  assert.notEqual(A.account.chatUserId, 'idMai', 'Tiểu Ly không được nhận nhầm tin của Mai');
});

// ---- Nhật ký riêng từng tài khoản
test('nhật ký riêng từng tài khoản: tài khoản nói nhiều không đẩy nhật ký của tài khoản khác ra khỏi danh sách', async () => {
  const m1 = await new Manager({ adapter: { get: async () => null, set: async () => {} }, http: async () => ({ status: 404, headers: {}, data: '' }) }).init();
  for (let i = 0; i < 400; i++) m1.log({ t: i, level: 'info', text: `ly ${i}`, acc: 'ly' });
  m1.log({ t: 1000, level: 'info', text: 'mai chỉ có một dòng', acc: 'mai' });
  assert.equal(m1.logsOf('mai').length, 1, 'nhật ký của Mai vẫn còn');
  assert.equal(m1.logsOf('ly').length, 200, 'mỗi tài khoản giữ tối đa 200 dòng');
  assert.equal(m1.logsOf('ly').at(-1).text, 'ly 399');
  assert.equal(m1.logsOf('mai')[0].text, 'mai chỉ có một dòng');
  assert.equal(m1.logsOf(null).length, 201, 'xem chung (tất cả tài khoản) gộp theo thời gian');
  m1.clearLogs('ly');
  assert.equal(m1.logsOf('ly').length, 0); assert.equal(m1.logsOf('mai').length, 1, 'xóa nhật ký một tài khoản không đụng tài khoản khác');
});
