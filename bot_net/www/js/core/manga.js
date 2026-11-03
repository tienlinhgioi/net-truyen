// Gửi truyện: chọn đúng truyện trong kết quả tìm kiếm của web (web xếp theo độ liên quan riêng của nó, không phải khớp tên).
import { squashMsg } from './text.js';

/** Chọn truyện khớp nhất: khớp hệt tên > chứa đủ từ khóa mà ít từ thừa nhất > (chỉ một kết quả) nhận luôn. Không liên quan thì trả null. */
export function rankManga(results, query) {
  if (!results?.length) return null;
  if (results.length === 1) return results[0]; // web đã khớp theo tên khác (vd "đảo hải tặc" ra One Piece)
  const q = squashMsg(query).split(' ').filter(Boolean);
  let best = null, bestScore = -1;
  for (const r of results) {
    const n = squashMsg(r.name).split(' ').filter(Boolean);
    let score;
    if (n.join(' ') === q.join(' ')) score = 1000;
    else {
      const have = q.filter((t) => n.includes(t)).length;
      const cov = q.length ? have / q.length : 0;
      score = cov === 1 ? 500 - (n.length - q.length) : cov >= 0.5 ? 100 * cov - (n.length - q.length) : -1;
    }
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return bestScore >= 0 ? best : null;
}

/** Các tên để thử tìm (cách nhau dấu |); thêm tên chính khi có phụ đề sau dấu ":" hoặc " - ". Tối đa 4, bỏ trùng. */
export function mangaQueries(raw) {
  const given = String(raw ?? '').split('|').map((s) => s.trim()).filter(Boolean);
  const extra = given.map((g) => g.split(/\s*[:：]\s*|\s+-\s+/)[0].trim()).filter((g) => g.length >= 2);
  const out = [], seen = new Set();
  // Bỏ trùng theo chữ (không bỏ dấu): web tìm có phân biệt dấu nên "vo luyen" và "Võ Luyện" là hai lần thử khác nhau
  for (const q of [...given, ...extra]) { const k = q.toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(q); } }
  return out.slice(0, 4);
}
