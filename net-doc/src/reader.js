// Vòng đọc truyện của một tài khoản: lần lượt từng chương, hết truyện thì đọc lại từ đầu.
// Không kiểm tra lượt đọc có thành công hay không: gửi xong là sang chương kế.
import { DEFAULT_DELAY } from './config.js';
import { slugOf, parseChapters, parseIds } from './parse.js';

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const PAGE_TRIES = 3; // tải trang chương: thử tối đa 3 lần rồi bỏ qua chương

export async function readAccount({ site, account, links, delay = {}, order = 'asc', parallel = 1, loops = Infinity, log = () => {}, signal }) {
  const d = { ...DEFAULT_DELAY, ...delay };
  const slugs = [...new Set(links.map(slugOf).filter(Boolean))];
  const aborted = () => !!signal?.aborted;
  const rnd = () => Math.random() * 2 - 1;
  const jit = (ms) => Math.max(0, Math.round(ms * (1 + (rnd() * d.jitterPercent) / 100))); // lệch hai phía
  const jitUp = (ms) => Math.round(ms * (1 + (Math.random() * d.jitterPercent) / 100)); // chỉ kéo dài
  // Chờ đúng [ms] mili giây, dừng ngay khi bị hủy.
  const sleepRaw = (ms) => new Promise((resolve) => {
    if (aborted() || ms <= 0) return resolve();
    const t = setTimeout(done, ms);
    function done() { clearTimeout(t); signal?.removeEventListener('abort', done); resolve(); }
    signal?.addEventListener('abort', done, { once: true });
  });
  const sleep = (ms) => sleepRaw(jit(ms));

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

  // Mở trang chương (thử lại khi lỗi/quá thời gian), trả về mã truyện/chương hoặc null.
  const openChapter = async (ch) => {
    for (let k = 1; k <= PAGE_TRIES && !aborted(); k++) {
      try { return parseIds(await site.getText(ch.path)) ?? undefined; } catch (e) {
        log(`Chương ${ch.id}: lỗi ${e.message}${k < PAGE_TRIES ? ', thử lại' : ', bỏ qua'}`);
        if (k < PAGE_TRIES) await sleep(d.retryPageMs);
      }
    }
    return null;
  };

  const readChapter = async (ch) => {
    const opened = Date.now(); // web tính 7 giây từ lúc mở trang chương
    const ids = await openChapter(ch);
    if (aborted() || ids === null) return;
    if (!ids) return log(`Chương ${ch.id}: không đọc được mã chương, bỏ qua`);
    await sleepRaw(jitUp(d.viewWaitMs) - (Date.now() - opened));
    if (aborted()) return;
    try {
      const r = await site.postView({ ...ids, referer: site.url(ch.path) });
      const counted = /"counted"\s*:\s*true/.test(r.text) ? 'được tính' : /"counted"\s*:\s*false/.test(r.text) ? 'đã đọc trước đó' : r.text.includes('invalid') ? 'web từ chối (chưa đủ thời gian?)' : `HTTP ${r.status}`;
      log(`Chương ${ch.id}: đã gửi lượt đọc (${counted})`); // chỉ ghi nhận, không dùng để quyết định gì
    } catch (e) { log(`Chương ${ch.id}: lỗi gửi ${e.message}, đọc tiếp`); }
  };

  // Đọc danh sách chương với tối đa [parallel] chương cùng lúc; mỗi chương mở cách chương trước betweenChaptersMs.
  const readList = async (chapters) => {
    let next = 0, slot = 0;
    const worker = async () => {
      while (!aborted() && next < chapters.length) {
        const ch = chapters[next++];
        const at = Math.max(slot, Date.now());
        slot = at + jit(d.betweenChaptersMs); // giữ chỗ trước, các tiến trình khác không mở cùng lúc
        await sleepRaw(at - Date.now());
        if (aborted()) return;
        await readChapter(ch);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, chapters.length)) }, worker));
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
      await readList(chapters);
    }
    if (aborted()) return;
    log(`Vòng ${loop}: xong`);
    if (loop < loops) await sleep(d.betweenLoopsMs);
  }
}
