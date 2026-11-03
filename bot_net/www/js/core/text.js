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

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Dạng so khớp của một tin: giải mã &amp; &lt;..., bỏ dấu, bỏ dấu câu, gộp khoảng trắng. Để nhận ra tin web hiển thị lại của chính mình. */
export function squashMsg(s) {
  const t = String(s ?? '').replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENT[e]);
  return normalize(t).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const ownPhrases = (acc) => [acc.name, acc.displayName, ...(acc.aliases || [])].map(normalize).filter(Boolean);

/** Thay tên/biệt danh của chính mình trong câu trả lời bằng "mình" và bỏ lệnh gọi, để bot không tự gọi lại chính nó. */
export function replaceSelf(text, acc, repl = 'mình') {
  const orig = String(text ?? '').normalize('NFC');
  const norm = orig.split('').map(charNorm).join('');
  if (norm.length !== orig.length) return orig;
  const cuts = [];
  const cmd = normalize(acc.command || '');
  const list = [...new Set(ownPhrases(acc))].filter((p) => p.length >= 2);
  for (const [p, r] of [...(cmd ? [[cmd, '']] : []), ...list.map((x) => [x, repl])]) {
    const re = wordRe(p);
    let m;
    while ((m = re.exec(norm))) {
      cuts.push([m.index + m[1].length, m.index + m[0].length, r]);
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  cuts.sort((a, b) => b[0] - a[0]);
  let out = orig, lastStart = Infinity;
  for (const [s, e, r] of cuts) { if (e > lastStart) continue; out = out.slice(0, s) + r + out.slice(e); lastStart = s; }
  return out.replace(/[ \t]+/g, ' ').replace(/ +([,.!?])/g, '$1').trim();
}

/** Làm sạch câu trả lời: bỏ tiền tố "Tên:" ở đầu và bỏ phần model tự viết thêm lời người khác (kịch bản hai bên). */
export function cleanReply(text, { account, names = [] }) {
  const speakers = [...new Set([...ownPhrases(account), ...names.map(normalize)].filter(Boolean))];
  const label = (line) => { const m = /^\s*(?:bạn\s*\()?([^:：\n]{1,40}?)\)?\s*[:：]/i.exec(line); return m && speakers.includes(normalize(m[1])) ? m[0] : null; };
  const lines = String(text ?? '').split('\n');
  const keep = [];
  for (let i = 0; i < lines.length; i++) {
    const lab = label(lines[i]);
    if (lab && i > 0) break; // dòng sau mở đầu bằng "Tên:" là model tự viết lời người khác
    keep.push(lab ? lines[i].slice(lab.length).trim() : lines[i]);
  }
  return keep.join('\n').trim();
}
