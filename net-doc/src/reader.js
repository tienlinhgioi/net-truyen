// Vòng đọc truyện của một tài khoản: lần lượt từng chương, hết truyện thì đọc lại từ đầu.
// Không kiểm tra lượt đọc có thành công hay không: gửi xong là sang chương kế.
import { DEFAULT_DELAY } from './config.js';
import { slugOf, parseChapters, parseIds } from './parse.js';

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export async function readAccount({ site, account, links, delay = {}, order = 'asc', loops = Infinity, log = () => {}, signal }) {
  const d = { ...DEFAULT_DELAY, ...delay };
  const slugs = [...new Set(links.map(slugOf).filter(Boolean))];
  const aborted = () => !!signal?.aborted;
  const jit = (ms) => Math.max(0, Math.round(ms * (1 + ((Math.random() * 2 - 1) * d.jitterPercent) / 100)));
  // Chờ [ms] (có lệch ngẫu nhiên), dừng ngay khi bị hủy.
  const sleep = (ms) => new Promise((resolve) => {
    if (aborted()) return resolve();
    const t = setTimeout(done, jit(ms));
    function done() { clearTimeout(t); signal?.removeEventListener('abort', done); resolve(); }
    signal?.addEventListener('abort', done, { once: true });
  });

  let loggedAt = 0;
  const ensureLogin = async () => {
    while (!aborted()) {
      try {
        const r = await site.login(account.email, account.password);
        if (r.ok) { loggedAt = Date.now(); log('Đã đăng nhập'); return true; }
        log(`Đăng nhập thất bại: ${r.msg}`);
      } catch (e) { log(`Đăng nhập lỗi: ${e.message}`); }
      await sleep(d.retryLoginMs);
    }
    return false;
  };

  for (let loop = 1; loop <= loops && !aborted(); loop++) {
    if (!loggedAt || Date.now() - loggedAt > d.reloginEveryMs) { if (!(await ensureLogin())) return; }
    log(`Vòng ${loop}: bắt đầu`);
    for (const slug of slugs) {
      if (aborted()) return;
      let chapters;
      try { chapters = parseChapters(await site.getText(`/manga/${slug}`), slug); } catch (e) { log(`Không tải được trang truyện ${slug}: ${e.message}`); continue; }
      if (!chapters.length) { log(`Truyện ${slug}: không thấy chương nào`); continue; }
      if (order === 'desc') chapters.reverse(); else if (order === 'random') shuffle(chapters);
      log(`Truyện ${slug}: ${chapters.length} chương`);
      for (const ch of chapters) {
        if (aborted()) return;
        try {
          const ids = parseIds(await site.getText(ch.path));
          if (!ids) log(`Chương ${ch.id}: không đọc được mã chương, bỏ qua`);
          else {
            await sleep(d.viewWaitMs);
            if (aborted()) return;
            const r = await site.postView({ ...ids, referer: site.url(ch.path) });
            log(`Chương ${ch.id}: đã gửi lượt đọc (HTTP ${r.status})`); // chỉ ghi nhận, không kiểm tra kết quả
          }
        } catch (e) { log(`Chương ${ch.id}: lỗi ${e.message}, đọc tiếp`); }
        await sleep(d.betweenChaptersMs);
      }
    }
    log(`Vòng ${loop}: xong`);
    if (loop < loops) await sleep(d.betweenLoopsMs);
  }
}
