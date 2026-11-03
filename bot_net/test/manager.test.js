import test from 'node:test';
import assert from 'node:assert/strict';
import { Manager } from '../www/js/manager.js';
import { defaultAccount } from '../www/js/core/store.js';

const mem = () => { const d = {}; return { get: async (k) => d[k] ?? null, set: async (k, v) => { d[k] = v; }, d }; };
const http = async () => ({ status: 404, headers: {}, data: '' });
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5)));

async function make() {
  const adapter = mem();
  const m = await new Manager({ adapter, http, sleep }).init();
  const a = { ...defaultAccount(), id: 'a1', email: 'e', password: 'p', name: 'Ly', displayName: 'Ly' };
  m.store.accounts.push(a);
  return { m, a, adapter };
}

test('xem ghi chú bot đã nhớ về từng người (tài khoản đang tắt)', async () => {
  const { m } = await make();
  m.memory.a1 = { u1: { name: 'An', notes: ['thích bún', 'học lớp 12'] }, u2: { name: 'Bình', notes: [] } };
  assert.deepEqual(m.memoryOf('a1'), [{ uid: 'u1', name: 'An', notes: ['thích bún', 'học lớp 12'] }]);
});

test('xóa ghi chú của một người; xóa sạch ghi chú cũ của tài khoản; lưu lại', async () => {
  const { m, adapter } = await make();
  m.memory.a1 = { u1: { name: 'An', notes: ['x'] }, u2: { name: 'Bình', notes: ['y'] } };
  m.forgetUser('a1', 'u1');
  assert.deepEqual(m.memoryOf('a1').map((x) => x.uid), ['u2']);
  m.clearMemory('a1');
  assert.deepEqual(m.memoryOf('a1'), []);
  await m.saveNow();
  assert.deepEqual(JSON.parse(adapter.d.botnet).memory.a1, {});
});

test('tài khoản đang chạy: nạp lại prompt tạo bot mới (xóa trạng thái cũ), xóa ghi chú cũng nạp lại AI từ đầu', async () => {
  const { m, a } = await make();
  try {
  m.setEnabled('a1', true);
  const first = m.bots.get('a1');
  first.memory.add('u1', 'An', 'thích bún');
  assert.equal(m.memoryOf('a1').length, 1, 'đọc từ bot đang chạy');
  m.updateAccount('a1', { prompt: 'Bạn là Ly mới' });
  m.reloadBot('a1');
  const second = m.bots.get('a1');
  assert.notEqual(second, first, 'bot được tạo lại');
  assert.equal(second.account.prompt, 'Bạn là Ly mới');
  assert.equal(first.stopped, true, 'bot cũ đã dừng hẳn');
  assert.equal(second.memory.get('u1').notes[0], 'thích bún', 'nạp lại prompt vẫn giữ ghi chú');
  m.clearMemory('a1');
  const third = m.bots.get('a1');
  assert.notEqual(third, second);
  assert.deepEqual(third.memory.get('u1').notes, [], 'xóa ghi chú cũ rồi AI bắt đầu từ đầu');
  assert.equal(second.stopped, true);
  void a;
  } finally { for (const id of [...m.bots.keys()]) m.setEnabled(id, false); }
});

test('xóa ghi chú cũ của mọi tài khoản', async () => {
  const { m } = await make();
  m.store.accounts.push({ ...defaultAccount(), id: 'a2', name: 'Mai', displayName: 'Mai' });
  m.memory.a1 = { u1: { name: 'An', notes: ['x'] } }; m.memory.a2 = { u2: { name: 'B', notes: ['y'] } };
  m.clearAllMemory();
  assert.deepEqual([m.memoryOf('a1'), m.memoryOf('a2')], [[], []]);
});
