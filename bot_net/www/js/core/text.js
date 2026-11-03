// Xử lý chữ: chuẩn hóa không dấu, nhận diện nhắc tên/lệnh (chịu sai chính tả nhẹ), giới hạn ký tự.

const MARKS = /[̀-ͯ]/g;

const charNorm = (c) => c.normalize('NFD').replace(MARKS, '').replace(/đ/gi, 'd').toLowerCase();

/** Không dấu, chữ thường, gộp khoảng trắng. */
export function normalize(s) {
  return String(s ?? '').normalize('NFC').split('').map(charNorm).join('').replace(/\s+/g, ' ').trim();
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (p) => new RegExp(`(^|[^a-z0-9])@?(${esc(p)})(?=$|[^a-z0-9])`, 'g');

function phrases(acc) {
  return [acc.name, ...(acc.aliases || [])].map(normalize).filter(Boolean);
}

/** Tin nhắn có nhắc tới tài khoản (lệnh, tên gọi hoặc tên gọi khác) không. */
export function isMentioned(message, acc) {
  const n = normalize(message);
  if (!n) return false;
  const cmd = normalize(acc.command || '');
  if (cmd && (wordRe(cmd).test(n) || n.startsWith(cmd + ' ') || n === cmd)) return true;
  const tokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  for (const p of phrases(acc)) {
    if (wordRe(p).test(n)) return true;
    // Sai chính tả nhẹ: chỉ áp dụng với tên đủ dài (>=5 ký tự không dấu cách)
    const flat = p.replace(/\s+/g, '');
    if (flat.length < 5) continue;
    const words = p.split(' ').length;
    for (let i = 0; i + words <= tokens.length; i++) {
      const cand = tokens.slice(i, i + words).join('');
      if (lev(cand, flat, 1) <= 1) return true;
    }
  }
  return false;
}

/** Bỏ lệnh/tên khỏi câu hỏi, giữ lại nội dung cần trả lời. */
export function stripTrigger(message, acc) {
  const orig = String(message ?? '').normalize('NFC');
  const norm = orig.split('').map(charNorm).join('');
  if (norm.length !== orig.length) return orig.trim();
  const cuts = [];
  const list = [normalize(acc.command || ''), ...phrases(acc)].filter(Boolean);
  for (const p of list) {
    const re = wordRe(p);
    let m;
    while ((m = re.exec(norm))) {
      const start = m.index + m[1].length;
      cuts.push([start, m.index + m[0].length]);
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  cuts.sort((a, b) => b[0] - a[0]);
  let out = orig;
  for (const [s, e] of cuts) out = out.slice(0, s) + out.slice(e);
  return out.replace(/\s+/g, ' ').replace(/^[\s,.:;!?-]+/, '').trim();
}

/** Cắt về tối đa [max] ký tự ở ranh giới từ (0 hoặc rỗng = không giới hạn). */
export function limitChars(text, max) {
  const t = String(text ?? '');
  if (!max || t.length <= max) return t;
  let cut = t.slice(0, Math.max(1, max - 1));
  const sp = cut.search(/\s\S*$/);
  if (sp > max * 0.4) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:.]+$/, '') + '…';
}
