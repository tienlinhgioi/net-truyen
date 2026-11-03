import test from 'node:test';
import assert from 'node:assert/strict';
import { needsKnowledge, knowledgeQuery, wikiSearch, searchPhoto } from '../www/js/core/web.js';
import { parseDirective } from '../www/js/core/directive.js';
import { ImageQuota } from '../www/js/core/media.js';

const acc = { name: 'Tiểu Ly', aliases: [], command: '/ai' };

test('parseDirective: có trường photo (tìm ảnh thật trên mạng) tách riêng với draw (AI vẽ)', () => {
  const d = parseDirective('{"reply":"nè","photo":"orange cat","draw":""}');
  assert.equal(d.photo, 'orange cat'); assert.equal(d.draw, '');
  assert.equal(parseDirective('chào').photo, '');
});

test('needsKnowledge: câu hỏi kiến thức thì tra Wikipedia, tán gẫu thì không', () => {
  for (const q of ['Naruto là gì?', 'ai là tác giả One Piece', 'Hà Nội ở đâu', 'tại sao bầu trời màu xanh', 'tìm hiểu về núi lửa Phú Sĩ']) assert.equal(needsKnowledge(q), true, q);
  for (const q of ['chào cả nhà', 'bạn khỏe không', 'haha vui quá', 'ok', 'hôm nay mưa quá']) assert.equal(needsKnowledge(q), false, q);
});

test('knowledgeQuery: bỏ từ hỏi và lệnh gọi, giữ từ khóa chính', () => {
  assert.equal(knowledgeQuery('/ai Naruto là gì vậy?', acc), 'Naruto');
  assert.equal(knowledgeQuery('Tiểu Ly ơi núi Phú Sĩ cao bao nhiêu', acc), 'núi Phú Sĩ cao');
});

const wikiRes = (pages) => ({ status: 200, headers: {}, data: { query: { pages } } });

test('wikiSearch: lấy tóm tắt các kết quả đầu, sắp theo độ liên quan, thử tiếng Việt rồi tiếng Anh', async () => {
  const urls = [];
  const http = async (r) => {
    urls.push(r.url);
    if (r.url.includes('//vi.')) return { status: 200, headers: {}, data: { query: { pages: [] } } };
    return wikiRes([{ title: 'B', extract: 'Bbb', index: 2, fullurl: 'https://en.wikipedia.org/wiki/B' }, { title: 'A', extract: 'Aaa', index: 1, fullurl: 'https://en.wikipedia.org/wiki/A' }]);
  };
  const r = await wikiSearch(http, 'thing');
  assert.deepEqual(r.map((x) => x.title), ['A', 'B']);
  assert.ok(urls[0].includes('vi.wikipedia.org') && urls[1].includes('en.wikipedia.org'));
  assert.match(urls[0], /gsrsearch=thing/);
});

test('wikiSearch: lỗi mạng hoặc không có kết quả thì trả mảng rỗng, không ném lỗi', async () => {
  assert.deepEqual(await wikiSearch(async () => { throw new Error('timeout'); }, 'x'), []);
  assert.deepEqual(await wikiSearch(async () => ({ status: 500, headers: {}, data: {} }), 'x'), []);
});

test('searchPhoto: lấy ảnh Creative Commons đã lọc nội dung người lớn, chọn ngẫu nhiên trong vài kết quả đầu', async () => {
  let url;
  const http = async (r) => { url = r.url; return { status: 200, headers: {}, data: { results: [1, 2, 3].map((i) => ({ title: `T${i}`, thumbnail: `https://api.openverse.org/v1/images/${i}/thumb/`, license: 'by', creator: `C${i}` })) } }; };
  const p = await searchPhoto(http, 'orange cat', () => 0.99);
  assert.equal(p.url, 'https://api.openverse.org/v1/images/3/thumb/');
  assert.match(url, /mature=false/); assert.match(url, /q=orange\+cat|q=orange%20cat/);
  assert.equal(await searchPhoto(async () => ({ status: 200, headers: {}, data: { results: [] } }), 'zzz'), null);
  assert.equal(await searchPhoto(async () => { throw new Error('x'); }, 'zzz'), null);
});

test('ImageQuota: dùng được cho trường khác (ảnh tìm trên mạng đếm riêng với ảnh AI vẽ)', () => {
  let t = 1;
  const q = new ImageQuota({ perDay: 1, cooldownMs: 0, now: () => t, field: 'photo' });
  const stats = {};
  q.record(stats);
  assert.equal(q.check(stats).ok, false);
  assert.equal(stats.photo.count, 1); assert.equal(stats.img, undefined);
});
