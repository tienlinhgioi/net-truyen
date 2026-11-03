// Ảnh: đọc ảnh Gemini tạo, sticker, giới hạn số ảnh. (Tải ảnh lên do ChatClient.uploadImage làm.)

export function parseImageResponse(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) throw Object.assign(new Error('noimage'), { kind: 'noimage' });
  const text = parts.map((p) => p.text || '').join('').trim();
  return { mime: img.inlineData.mimeType || 'image/png', data: img.inlineData.data, text };
}

/** Chọn ngẫu nhiên một sticker trong các bộ [packIds]. */
export function pickSticker(packs, packIds, rand = Math.random) {
  const urls = packs.filter((p) => packIds.includes(p.id)).flatMap((p) => p.urls);
  return urls.length ? urls[Math.floor(rand() * urls.length) % urls.length] : null;
}

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Giới hạn tạo ảnh: tối đa [perDay] ảnh mỗi ngày và cách nhau ít nhất [cooldownMs]. Trạng thái nằm trong stats.img. */
export class ImageQuota {
  constructor({ perDay = 5, cooldownMs = 60000, now = () => Date.now() } = {}) { this.perDay = perDay; this.cooldownMs = cooldownMs; this.now = now; }
  #state(stats) {
    const d = dayOf(this.now());
    if (!stats.img || stats.img.day !== d) stats.img = { day: d, count: 0, last: stats.img?.last || 0 };
    return stats.img;
  }
  check(stats) {
    const s = this.#state(stats);
    if (s.count >= this.perDay) return { ok: false, reason: 'daily' };
    if (this.now() - s.last < this.cooldownMs) return { ok: false, reason: 'cooldown' };
    return { ok: true };
  }
  record(stats) { const s = this.#state(stats); s.count++; s.last = this.now(); }
}
