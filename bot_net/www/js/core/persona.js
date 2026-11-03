// Nhắn tin tự nhiên: tâm trạng theo giờ, độ trễ gõ, tách tin, tránh lặp, bỏ qua cãi vã.
import { normalize } from './text.js';

export function moodFor(d) {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'Bây giờ là buổi sáng: tỉnh táo, hơi ngái ngủ, nói nhẹ nhàng.';
  if (h >= 11 && h < 14) return 'Bây giờ là buổi trưa: hơi lười, hay nhắc chuyện ăn uống.';
  if (h >= 14 && h < 18) return 'Bây giờ là buổi chiều: bình thường, thoải mái.';
  if (h >= 18 && h < 23) return 'Bây giờ là buổi tối: hăng hái, nói chuyện rôm rả.';
  return 'Bây giờ là khuya: buồn ngủ, nói ngắn, hơi lơ mơ.';
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Thời gian "gõ" theo độ dài câu, lệch ngẫu nhiên ±20% để không đều như máy. */
export function typingDelayMs(len, { perCharMs = 40, minMs = 800, maxMs = 4000 } = {}, rand = Math.random) {
  const base = clamp(len * perCharMs, minMs, maxMs);
  return clamp(Math.round(base * (0.8 + 0.4 * rand())), minMs, maxMs);
}

/** Tách thành tối đa 2 tin: ở chỗ xuống dòng đôi, hoặc ở cuối câu khi quá dài. */
export function splitReply(text, maxLen = 140) {
  const t = String(text ?? '').trim();
  const paras = t.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (paras.length > 1) return [paras[0], paras.slice(1).join(' ')];
  if (t.length <= maxLen) return [t];
  let cut = -1;
  const re = /[.!?…]\s+/g;
  let m;
  while ((m = re.exec(t))) { const end = m.index + m[0].length; if (end <= maxLen && end >= 20) cut = end; }
  return cut > 0 ? [t.slice(0, cut).trim(), t.slice(cut).trim()] : [t];
}

const squash = (s) => normalize(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export function isRepeat(text, recent) {
  const a = squash(text);
  return !!a && recent.some((r) => squash(r) === a);
}

function hit(norm, w) {
  const x = normalize(w);
  if (!x) return false;
  if (x.length <= 3) return norm.split(/[^a-z0-9]+/).includes(x);
  return norm.includes(x);
}

export function sensitiveHit(text, words) {
  const n = normalize(text);
  return words.some((w) => hit(n, w));
}

/** Nhiều tin gần đây chứa từ nặng => đang cãi vã, bot đứng ngoài. */
export function isQuarrel(messages, words, threshold = 3) {
  return messages.filter((m) => sensitiveHit(m.message, words)).length >= threshold;
}
