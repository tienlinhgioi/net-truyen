// Gemini trả về JSON {reply, sticker, draw, manga, remember}; hàm này đọc chắc tay cả khi JSON hỏng.

const blank = (reply = '') => ({ reply, sticker: false, draw: '', photo: '', manga: '', remember: '' });
const str = (v) => (typeof v === 'string' ? v.trim() : '');

const pick = (o) => ({ reply: str(o.reply), sticker: o.sticker === true, draw: str(o.draw), photo: str(o.photo), manga: str(o.manga), remember: str(o.remember) });

/** Văn bản giống đoạn "suy nghĩ" của model (gạch đầu dòng, Persona, Constraint...) thì không được gửi vào chat. */
function looksLikeReasoning(t) {
  const lines = t.split('\n');
  const bullets = lines.filter((l) => /^\s*[*\-•]\s/.test(l)).length;
  return bullets >= 2 || (lines.length > 2 && /constraint|persona|return only|json format/i.test(t));
}

export function parseDirective(raw) {
  let t = String(raw ?? '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const candidates = t.startsWith('{') ? [t] : [];
  const m = /\{[^{}]*"reply"[\s\S]*?\}/.exec(t);
  if (m) candidates.push(m[0]);
  for (const c of candidates) { try { return pick(JSON.parse(c)); } catch { /* thử cách khác */ } }
  const r = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(t);
  if (r) { let v = r[1]; try { v = JSON.parse(`"${r[1]}"`); } catch { /* giữ nguyên */ } return blank(v.trim()); }
  return looksLikeReasoning(t) ? blank('') : blank(t);
}
