// Đọc dữ liệu từ HTML của web: mã truyện, danh sách chương, mã chương.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Mã truyện từ link: .../manga/<mã> (có thể kèm /chapter-N, ?tham số). */
export function slugOf(link) {
  const m = /\/manga\/([^/?#\s]+)/.exec(String(link || ''));
  return m ? m[1] : null;
}

const order = (id) => parseFloat(id.replace(/-/, '.').replace(/[^0-9.]/g, '')) || 0;

/** Mọi chương của đúng truyện trong trang truyện: bỏ trùng, sắp tăng dần theo số chương. */
export function parseChapters(html, slug) {
  const re = new RegExp(`/manga/${esc(slug)}/chapter-([0-9][0-9A-Za-z\\-]*)`, 'g');
  const seen = new Set(), out = [];
  let m;
  while ((m = re.exec(html))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ id: m[1], path: `/manga/${slug}/chapter-${m[1]}` });
  }
  return out.sort((a, b) => order(a.id) - order(b.id));
}

/** MANGA_ID và CHAPTER_ID mà trang chương khai báo (web dùng để gửi lượt đọc). */
export function parseIds(html) {
  const manga = /MANGA_ID\s*=\s*(\d+)/.exec(html)?.[1];
  const chapter = /CHAPTER_ID\s*=\s*(\d+)/.exec(html)?.[1];
  return manga && chapter ? { manga, chapter } : null;
}

/** Mã truyện trên trang danh sách/bảng xếp hạng, theo thứ tự xuất hiện (bỏ trùng, bỏ phần trước khung danh sách như menu/sidebar). */
export function parseStoryList(html) {
  const start = html.indexOf('class="items"');
  const body = start >= 0 ? html.slice(start) : html;
  const seen = new Set(), out = [];
  for (const m of body.matchAll(/href="(?:https?:\/\/[^"\/]+)?\/manga\/([a-z0-9][a-z0-9-]*)(?:\/[^"]*)?"/gi)) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

/** Số trang cuối của danh sách (lớn nhất trong các link /danh-sach-truyen/<trang>). */
export function parseLastPage(html) {
  let max = 1;
  for (const m of html.matchAll(/\/danh-sach-truyen\/(\d+)/g)) max = Math.max(max, Number(m[1]));
  return max;
}
