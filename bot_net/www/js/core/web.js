// Truy cập internet cho bot: tra Wikipedia (kiến thức) và tìm ảnh Creative Commons trên Openverse.
// Cả hai đều miễn phí, không cần khóa, và không tốn hạn mức Gemini.
import { normalize, stripTrigger } from './text.js';

const KNOW = /(la gi|la ai|ai la|la sao|nghia la|o dau|khi nao|bao gio|bao nhieu|tai sao|vi sao|nhu the nao|the nao|nhu nao|tim hieu|giai thich|nguon goc|lich su|dinh nghia|wiki|tac gia|ai viet|ai sang tac|cao bao|nang bao|dai bao|rong bao|nam nao|nguoi nao|cua nuoc nao)/;

/** Câu hỏi kiến thức (cần tra cứu) hay chỉ là tán gẫu. */
export function needsKnowledge(question) {
  return KNOW.test(normalize(question));
}

const PHRASES = ['là gì', 'là ai', 'ai là', 'ở đâu', 'khi nào', 'bao giờ', 'bao nhiêu', 'tại sao', 'vì sao', 'như thế nào', 'thế nào', 'như nào', 'giải thích', 'tìm hiểu', 'giúp mình', 'cho mình', 'về'];
const STOP = ['ơi', 'vậy', 'nhỉ', 'nhé', 'ạ', 'hả', 'đi', 'nha', 'hen', 'với', 'à'];

/** Rút từ khóa tìm kiếm từ câu hỏi: bỏ lệnh gọi, từ hỏi và từ đệm. */
export function knowledgeQuery(question, account) {
  const base = stripTrigger(question, account) || String(question);
  let q = ` ${base.replace(/[?!.,;:]/g, ' ')} `;
  for (const p of [...PHRASES].sort((a, b) => b.length - a.length)) q = q.replace(new RegExp(`(?<=\\s)${p}(?=\\s)`, 'gi'), ' ');
  for (const w of STOP) q = q.replace(new RegExp(`(?<=\\s)${w}(?=\\s)`, 'gi'), ' ');
  q = q.replace(/\s+/g, ' ').trim();
  return q || base.trim();
}

const UA = { 'User-Agent': 'BotNet/1.0 (chat bot nho; tra cuu Wikipedia)', 'Api-User-Agent': 'BotNet/1.0' };

/** Tra Wikipedia (tiếng Việt rồi tiếng Anh): trả về các bài liên quan nhất kèm đoạn mở đầu. Lỗi thì trả mảng rỗng. */
export async function wikiSearch(http, query, langs = ['vi', 'en'], limit = 2) {
  for (const lang of langs) {
    try {
      const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}&prop=extracts%7Cinfo&inprop=url&exintro=1&explaintext=1&exchars=500&format=json&formatversion=2&origin=*`;
      const res = await http({ url, method: 'GET', headers: UA, timeout: 8000 });
      const pages = res.status === 200 ? res.data?.query?.pages : null;
      const out = (Array.isArray(pages) ? pages : []).filter((p) => p.extract).sort((a, b) => (a.index || 0) - (b.index || 0))
        .map((p) => ({ title: p.title, extract: p.extract.trim(), url: p.fullurl, lang }));
      if (out.length) return out;
    } catch { /* thử ngôn ngữ kế */ }
  }
  return [];
}

/** Tìm một ảnh Creative Commons (đã lọc nội dung người lớn) trên Openverse; chọn ngẫu nhiên trong vài kết quả đầu. */
export async function searchPhoto(http, query, rand = Math.random) {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=5&mature=false&filter_dead=true`;
    const res = await http({ url, method: 'GET', headers: UA, timeout: 8000 });
    const list = (res.status === 200 ? res.data?.results : null) || [];
    const usable = list.filter((r) => r.thumbnail);
    if (!usable.length) return null;
    const r = usable[Math.min(usable.length - 1, Math.floor(rand() * usable.length))];
    return { url: r.thumbnail, title: r.title, license: r.license, creator: r.creator };
  } catch { return null; }
}
