// Vòng đọc truyện của một tài khoản: lần lượt từng chương, hết truyện thì đọc lại từ đầu.
// Không kiểm tra lượt đọc có thành công hay không: gửi xong là sang chương kế.
import { DEFAULT_DELAY, DEFAULT_RANKING, DEFAULT_SWITCH } from './config.js';
import { slugOf, parseChapters, parseIds, parseStoryList, parseLastPage } from './parse.js';

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const PAGE_TRIES = 3; // tải trang chương: thử tối đa 3 lần rồi bỏ qua chương

export async function readAccount({ site, account, links, mode = 'list', ranking = {}, switchRule = {}, delay = {}, order = 'asc', parallel = 1, loops = Infinity, log = () => {}, signal }) {
  const d = { ...DEFAULT_DELAY, ...delay };
  const rk = { ...DEFAULT_RANKING, ...ranking };
  const sw = { ...DEFAULT_SWITCH, ...switchRule };
  const needAlready = Math.ceil((sw.window * sw.alreadyReadPercent) / 100); // số chương "đã đọc" trong cửa sổ để đổi truyện
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

  // Trả về: 'new' (web tính lượt đọc), 'already' (web báo đã đọc trước đó), 'unknown' (không rõ/lỗi/bị từ chối).
  const readChapter = async (ch) => {
    const opened = Date.now(); // web tính 7 giây từ lúc mở trang chương
    const ids = await openChapter(ch);
    if (aborted() || ids === null) return 'unknown';
    if (!ids) { log(`Chương ${ch.id}: không đọc được mã chương, bỏ qua`); return 'unknown'; }
    await sleepRaw(jitUp(d.viewWaitMs) - (Date.now() - opened));
    if (aborted()) return 'unknown';
    try {
      const r = await site.postView({ ...ids, referer: site.url(ch.path) });
      const kind = /"counted"\s*:\s*true/.test(r.text) ? 'new' : /"counted"\s*:\s*false/.test(r.text) ? 'already' : 'unknown';
      const label = kind === 'new' ? 'được tính' : kind === 'already' ? 'đã đọc trước đó' : r.text.includes('invalid') ? 'web từ chối (chưa đủ thời gian?)' : `HTTP ${r.status}`;
      log(`Chương ${ch.id}: đã gửi lượt đọc (${label})`);
      return kind;
    } catch (e) { log(`Chương ${ch.id}: lỗi gửi ${e.message}, đọc tiếp`); return 'unknown'; }
  };

  // Đọc danh sách chương với tối đa [parallel] chương cùng lúc; mỗi chương mở cách chương trước betweenChaptersMs.
  // Dừng sớm (đổi truyện) khi trong [window] chương gần nhất có đủ số chương web báo "đã đọc trước đó".
  const readList = async (chapters, slug) => {
    let next = 0, slot = 0, stop = false;
    const recent = []; // kết quả rõ ràng gần nhất: true = đã đọc, false = được tính
    const worker = async () => {
      while (!aborted() && !stop && next < chapters.length) {
        const ch = chapters[next++];
        const at = Math.max(slot, Date.now());
        slot = at + jit(d.betweenChaptersMs); // giữ chỗ trước, các tiến trình khác không mở cùng lúc
        await sleepRaw(at - Date.now());
        if (aborted() || stop) return;
        const kind = await readChapter(ch);
        if (kind === 'unknown') continue;
        recent.push(kind === 'already');
        if (recent.length > sw.window) recent.shift();
        if (!stop && recent.length >= sw.window && recent.filter(Boolean).length >= needAlready) {
          stop = true;
          log(`Truyện ${slug}: ${recent.filter(Boolean).length}/${recent.length} chương gần nhất đã đọc trước đó, đổi truyện`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, chapters.length)) }, worker));
  };

  // ----- Chọn danh sách truyện cho mỗi vòng theo chế độ -----
  const rankingStories = async () => {
    const out = [], seen = new Set();
    for (let page = 1; out.length < rk.maxStories && !aborted(); page++) {
      let html;
      try { html = await site.getText(`/danh-sach-truyen/${page}?sort=${rk.sort}`); } catch (e) { log(`Không tải được bảng xếp hạng (trang ${page}): ${e.message}`); break; }
      const fresh = parseStoryList(html).filter((x) => !seen.has(x));
      if (!fresh.length) break;
      for (const x of fresh) { seen.add(x); out.push(x); }
      if (page >= parseLastPage(html)) break;
    }
    return out.slice(0, rk.maxStories);
  };

  const webRandomStories = async () => {
    let first;
    try { first = await site.getText('/danh-sach-truyen/1'); } catch (e) { log(`Không tải được danh sách truyện của web: ${e.message}`); return []; }
    const pages = shuffle(Array.from({ length: parseLastPage(first) }, (_, i) => i + 1));
    const out = [], seen = new Set();
    for (const page of pages) {
      if (out.length >= rk.maxStories || aborted()) break;
      let html = first;
      if (page !== 1) { try { html = await site.getText(`/danh-sach-truyen/${page}`); } catch (e) { log(`Không tải được danh sách truyện (trang ${page}): ${e.message}`); continue; } }
      for (const x of shuffle(parseStoryList(html).filter((y) => !seen.has(y))).slice(0, 3)) { if (out.length < rk.maxStories) { seen.add(x); out.push(x); } }
    }
    return out;
  };

  const storiesForLoop = async () => {
    if (mode === 'ranking') return rankingStories();
    if (mode === 'random') return slugs.length ? shuffle([...slugs]) : webRandomStories();
    return slugs;
  };

  for (let loop = 1; loop <= loops && !aborted(); loop++) {
    if (!loggedAt || Date.now() - loggedAt > d.reloginEveryMs) { if (!(await ensureLogin())) return; }
    log(`Vòng ${loop}: bắt đầu`);
    const stories = await storiesForLoop();
    if (!stories.length) log('Không có truyện nào để đọc ở vòng này (kiểm tra link/bảng xếp hạng/mạng)');
    for (const slug of stories) {
      if (aborted()) return;
      let chapters;
      try { chapters = parseChapters(await site.getText(`/manga/${slug}`), slug); } catch (e) { log(`Không tải được trang truyện ${slug}: ${e.message}`); continue; }
      if (!chapters.length) { log(`Truyện ${slug}: không thấy chương nào`); continue; }
      if (order === 'desc') chapters.reverse(); else if (order === 'random') shuffle(chapters);
      log(`Truyện ${slug}: ${chapters.length} chương`);
      await readList(chapters, slug);
    }
    if (aborted()) return;
    log(`Vòng ${loop}: xong`);
    if (loop < loops) await sleep(d.betweenLoopsMs);
  }
}
