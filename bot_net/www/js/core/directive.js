// Gemini trả về JSON {reply, sticker, draw, manga, remember}; hàm này đọc chắc tay cả khi JSON hỏng.

const blank = (reply = '') => ({ reply, sticker: false, draw: '', manga: '', remember: '' });
const str = (v) => (typeof v === 'string' ? v.trim() : '');

export function parseDirective(raw) {
  let t = String(raw ?? '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t);
      return { reply: str(o.reply), sticker: o.sticker === true, draw: str(o.draw), manga: str(o.manga), remember: str(o.remember) };
    } catch {
      const m = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(t);
      if (m) { let r = m[1]; try { r = JSON.parse(`"${m[1]}"`); } catch { /* giữ nguyên */ } return blank(r.trim()); }
    }
  }
  return blank(t);
}
