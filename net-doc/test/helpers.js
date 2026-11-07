// Máy chủ giả mô phỏng NetTruyen: đăng nhập, trang truyện, trang chương, gửi lượt đọc, bảng xếp hạng.
import { createServer } from 'node:http';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * stories: { slug: [số chương...] } (mặc định: truyen-a lấy từ `chapters`). Truyện thứ i có MANGA_ID = 7+i,
 *   CHAPTER_ID = `${9+i}${số chương}` (truyen-a: 7 và 9<n>).
 * countedFn(slug, n) -> true/false: web báo `counted` cho lượt đọc đó (mặc định lấy từ viewBody).
 * ranking: { [sort]: [slug...] } phục vụ /danh-sach-truyen/<trang>?sort=<sort>, pageSize truyện mỗi trang.
 * webList: danh sách truyện của cả web (cho chế độ random không có link), phân trang bằng pageSize.
 */
export function fakeSite({ chapters = [1, 2, 3], stories, accounts = { 'a@x.com': 'pw', 'b@x.com': 'pw' }, viewStatus = 200, viewBody = '{"status":true,"counted":true}', countedFn, loginOk = () => true, pageDelayMs = 0, ranking = {}, pageSize = 36, webList } = {}) {
  const st = stories || { 'truyen-a': chapters };
  const slugs = Object.keys(st);
  const log = { hits: [], views: [], logins: [], pages: [] };
  const opened = new Map(); // CHAPTER_ID -> { slug, n }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    for await (const c of req) body += c;
    const cookie = req.headers.cookie || '';
    log.hits.push({ method: req.method, path: url.pathname, t: Date.now(), cookie });
    const send = (code, data, headers = {}) => { res.writeHead(code, { 'Content-Type': typeof data === 'string' ? 'text/html' : 'application/json', ...headers }); res.end(typeof data === 'string' ? data : JSON.stringify(data)); };
    if (url.pathname === '/auth/login') return send(200, '<html>login</html>', { 'Set-Cookie': 'sess=s1; Path=/' });
    if (url.pathname === '/ajax/auth/login') {
      const f = new URLSearchParams(body);
      log.logins.push({ email: f.get('email'), cookie });
      if (!loginOk(f.get('email')) || accounts[f.get('email')] !== f.get('password')) return send(200, { status: false, msg: 'Email hoặc mật khẩu không đúng' });
      return send(200, { status: true }, { 'Set-Cookie': [`UserID=${f.get('email')}; Path=/`, 'sess=s2; Path=/'] });
    }
    const lm = /^\/danh-sach-truyen(?:\/(\d+))?$/.exec(url.pathname);
    if (lm) {
      const sort = url.searchParams.get('sort');
      const page = Number(lm[1] || 1);
      const all = sort && ranking[sort] ? ranking[sort] : webList || [];
      log.pages.push({ sort, page });
      const part = all.slice((page - 1) * pageSize, page * pageSize);
      const last = Math.max(1, Math.ceil(all.length / pageSize));
      const item = (s) => `<div class="item"><a href="/manga/${s}"><img></a><h3><a title="${s}" href="/manga/${s}">${s}</a></h3></div>`;
      return send(200, `<html><div class="side"><a href="/manga/side-bar-1">sidebar</a></div><div class="items"><div class="row">${part.map(item).join('')}</div></div><ul class="pagination"><a href="/danh-sach-truyen/${last}">&raquo;</a><a href="/danh-sach-truyen/1">1</a></ul></html>`);
    }
    const sm = /^\/manga\/([a-z0-9-]+)$/.exec(url.pathname);
    if (sm && st[sm[1]]) {
      const i = slugs.indexOf(sm[1]);
      return send(200, `<html>MANGA_ID = ${7 + i}; ${[...st[sm[1]]].reverse().map((n) => `<a href="/manga/${sm[1]}/chapter-${n}">c${n}</a>`).join('')} <a href="/manga/khac/chapter-9">x</a></html>`);
    }
    const m = /^\/manga\/([a-z0-9-]+)\/chapter-(.+)$/.exec(url.pathname);
    if (m && st[m[1]]) {
      if (pageDelayMs) await wait(pageDelayMs);
      const i = slugs.indexOf(m[1]);
      const cid = `${9 + i}${m[2].replace(/\D/g, '')}`;
      opened.set(cid, { slug: m[1], n: Number(m[2]) });
      return send(200, `<html>MANGA_ID = ${7 + i}; CHAPTER_ID = ${cid};</html>`);
    }
    if (url.pathname === '/ajax/manga/view') {
      const f = new URLSearchParams(body);
      const info = opened.get(f.get('chapter'));
      log.views.push({ manga: f.get('manga'), chapter: f.get('chapter'), referer: req.headers.referer, cookie, t: Date.now(), who: /UserID=([^;]+)/.exec(cookie)?.[1], slug: info?.slug, n: info?.n });
      const out = countedFn && info ? `{"message":"success","status":true,"counted":${countedFn(info.slug, info.n)}}` : viewBody;
      return send(viewStatus, out);
    }
    return send(404, 'no');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, log, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) })));
}
