import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatClient, parseProfile } from '../www/js/core/chatclient.js';

const BASE = 'https://nettruyen15s.com';
const fakeHttp = (routes, log = []) => async (r) => {
  log.push(`${r.method} ${r.url.replace(BASE, '')}`);
  const h = routes[`${r.method} ${r.url.replace(BASE, '')}`];
  if (!h) return { status: 404, headers: {}, data: '' };
  return typeof h === 'function' ? h(r) : h;
};

test('login: lấy cookie, gửi email/mật khẩu dạng form, nhận thành công', async () => {
  const log = [];
  const http = fakeHttp({
    'GET /auth/login': { status: 200, headers: { 'set-cookie': 'sess=abc; Path=/' }, data: '' },
    'POST /ajax/auth/login': (r) => {
      assert.match(r.headers.Cookie, /sess=abc/);
      assert.match(r.data, /email=a%40b\.c/);
      assert.match(r.data, /password=p%26w/);
      return { status: 200, headers: { 'set-cookie': ['UserID=7; Path=/'] }, data: { status: true, msg: 'ok' } };
    },
  }, log);
  const c = new ChatClient({ http, base: BASE });
  const r = await c.login('a@b.c', 'p&w');
  assert.equal(r.ok, true);
  assert.match(c.jar.header(), /sess=abc/);
  assert.match(c.jar.header(), /UserID=7/);
});

test('login: sai mật khẩu trả về thông báo của web', async () => {
  const http = fakeHttp({
    'GET /auth/login': { status: 200, headers: {}, data: '' },
    'POST /ajax/auth/login': { status: 200, headers: {}, data: { status: false, msg: 'Email hoặc mật khẩu không đúng' } },
  });
  const r = await new ChatClient({ http, base: BASE }).login('a@b.c', 'x');
  assert.deepEqual(r, { ok: false, msg: 'Email hoặc mật khẩu không đúng' });
});

test('listChat / sendChat', async () => {
  let sent;
  const http = fakeHttp({
    'GET /ajax/chat/list': { status: 200, headers: {}, data: { status: true, data: [{ id: 1, message: 'hi' }] } },
    'POST /ajax/chat/send': (r) => { sent = r.data; return { status: 200, headers: {}, data: { status: true } }; },
  });
  const c = new ChatClient({ http, base: BASE });
  assert.deepEqual(await c.listChat(), [{ id: 1, message: 'hi' }]);
  assert.deepEqual(await c.sendChat('xin chào'), { ok: true, msg: undefined });
  assert.match(sent, /message=xin\+ch%C3%A0o/);
});

test('sendChat: web từ chối thì báo lỗi kèm nội dung', async () => {
  const http = fakeHttp({ 'POST /ajax/chat/send': { status: 200, headers: {}, data: { status: false, message: 'Bạn gửi quá nhanh' } } });
  assert.deepEqual(await new ChatClient({ http, base: BASE }).sendChat('x'), { ok: false, msg: 'Bạn gửi quá nhanh' });
});

test('parseProfile: lấy avatar và tên hiển thị từ trang hồ sơ', () => {
  const html = '<img alt="" src="https://st.netcdn.one/a.jpg" class="avatar user-img" style="height:80px"><input type="text" name="user-name" value="Cô Bé Nhút Nhát" class="form-control">';
  assert.deepEqual(parseProfile(html), { avatar: 'https://st.netcdn.one/a.jpg', name: 'Cô Bé Nhút Nhát' });
});

test('searchManga: tìm truyện theo tên', async () => {
  let body;
  const http = fakeHttp({ 'POST /ajax/search': (r) => { body = r.data; return { status: 200, headers: {}, data: { list: [{ url: '/manga/one-piece', name: 'One Piece' }] } }; } });
  const r = await new ChatClient({ http, base: BASE }).searchManga('one piece');
  assert.match(body, /search=one\+piece/);
  assert.deepEqual(r, [{ slug: 'one-piece', name: 'One Piece' }]);
});
