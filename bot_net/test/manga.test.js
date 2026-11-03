import test from 'node:test';
import assert from 'node:assert/strict';
import { rankManga, mangaQueries } from '../www/js/core/manga.js';

const L = (...names) => names.map((name) => ({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
// Kết quả THẬT của ô tìm kiếm web (thứ tự độ liên quan của web khác thứ tự đúng ý)
const naruto = L('Renge To Naruto!', 'Naruto Full Màu', 'Sasuke Truyền Kì', 'Naruto', "Naruto: Chibi Sasuke's Sharingan Legend");
const solo = L('Tôi Thăng Cấp Một Mình Ss2', 'Solo Leveling : Ragnarok', 'Solo Leveling Arise: Nguồn Gốc Của Thợ Săn', 'Tôi Thăng Cấp Một Mình', 'Solo Leveling Ss3');

test('rankManga: tên khớp hệt (bỏ dấu, hoa thường) được chọn dù không đứng đầu danh sách', () => {
  assert.equal(rankManga(naruto, 'naruto').name, 'Naruto');
  assert.equal(rankManga(solo, 'Tôi Thăng Cấp Một Mình').name, 'Tôi Thăng Cấp Một Mình');
  assert.equal(rankManga(solo, 'toi thang cap mot minh').name, 'Tôi Thăng Cấp Một Mình');
});

test('rankManga: không khớp hệt thì chọn tên chứa đủ từ khóa mà ít từ thừa nhất', () => {
  const r = rankManga(L('Học Viện One Piece', 'One Piece: Hành Trình Của Ace', 'Dragon Ball X One Piece Cross Epoch'), 'one piece');
  assert.equal(r.name, 'Học Viện One Piece');
});

test('rankManga: chỉ có một kết quả thì nhận (web tìm theo tên khác, vd "đảo hải tặc" ra One Piece)', () => {
  assert.equal(rankManga(L('One Piece'), 'đảo hải tặc').name, 'One Piece');
});

test('rankManga: nhiều kết quả mà không cái nào liên quan thì không đoán bừa', () => {
  assert.equal(rankManga(L('Aaa Bbb', 'Ccc Ddd'), 'naruto'), null);
  assert.equal(rankManga([], 'naruto'), null);
});

test('mangaQueries: nhiều tên cách nhau dấu |, thêm tên chính khi có phụ đề, bỏ trùng, tối đa 4', () => {
  assert.deepEqual(mangaQueries('Tôi Thăng Cấp Một Mình | Solo Leveling'), ['Tôi Thăng Cấp Một Mình', 'Solo Leveling']);
  assert.deepEqual(mangaQueries('One Piece: Hành Trình Của Ace'), ['One Piece: Hành Trình Của Ace', 'One Piece']);
  assert.deepEqual(mangaQueries('a | A | b | c | d | e').length, 4);
  assert.deepEqual(mangaQueries('  '), []);
});
