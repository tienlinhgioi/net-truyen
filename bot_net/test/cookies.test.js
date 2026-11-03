import test from 'node:test';
import assert from 'node:assert/strict';
import { CookieJar } from '../www/js/core/cookies.js';

test('CookieJar: nhận set-cookie (mảng) và tạo header Cookie', () => {
  const j = new CookieJar();
  j.update(['UserID=42; Path=/; Max-Age=3600', 'XSRF-TOKEN=abc%3D; Path=/; HttpOnly']);
  assert.equal(j.header(), 'UserID=42; XSRF-TOKEN=abc%3D');
});

test('CookieJar: nhận set-cookie gộp bằng dấu phẩy, không cắt nhầm ngày hết hạn', () => {
  const j = new CookieJar();
  j.update('a=1; Expires=Wed, 21 Oct 2099 07:28:00 GMT; Path=/, b=2; Path=/');
  assert.equal(j.header(), 'a=1; b=2');
});

test('CookieJar: ghi đè cookie cùng tên, xóa khi hết hạn/giá trị rỗng', () => {
  const j = new CookieJar();
  j.update(['a=1', 'b=2']);
  j.update(['a=9']);
  assert.equal(j.header(), 'a=9; b=2');
  j.update(['b=; Max-Age=0']);
  assert.equal(j.header(), 'a=9');
});

test('CookieJar: lưu và khôi phục', () => {
  const j = new CookieJar();
  j.update(['a=1']);
  const k = CookieJar.from(j.toJSON());
  assert.equal(k.header(), 'a=1');
});
