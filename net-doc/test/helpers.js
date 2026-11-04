// Máy chủ giả mô phỏng NetTruyen: đăng nhập, trang truyện, trang chương, gửi lượt đọc.
import { createServer } from 'node:http';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function fakeSite({ chapters = [1, 2, 3], accounts = { 'a@x.com': 'pw', 'b@x.com': 'pw' }, viewStatus = 200, viewBody = '{"status":true,"counted":true}', loginOk = () => true, pageDelayMs = 0 } = {}) {
  const log = { hits: [], views: [], logins: [] };
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
    if (url.pathname === '/manga/truyen-a') return send(200, `<html>MANGA_ID = 7; ${[...chapters].reverse().map((n) => `<a href="/manga/truyen-a/chapter-${n}">c${n}</a>`).join('')} <a href="/manga/khac/chapter-9">x</a></html>`);
    const m = /^\/manga\/truyen-a\/chapter-(.+)$/.exec(url.pathname);
    if (m) { if (pageDelayMs) await wait(pageDelayMs); return send(200, `<html>MANGA_ID = 7; CHAPTER_ID = 9${m[1].replace(/\D/g, '')};</html>`); }
    if (url.pathname === '/ajax/manga/view') {
      const f = new URLSearchParams(body);
      log.views.push({ manga: f.get('manga'), chapter: f.get('chapter'), referer: req.headers.referer, cookie, t: Date.now(), who: /UserID=([^;]+)/.exec(cookie)?.[1] });
      return send(viewStatus, viewBody);
    }
    return send(404, 'no');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, log, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) })));
}
