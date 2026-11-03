// Combo model: mỗi vai (chat chữ, tạo ảnh, hiểu ảnh) có danh sách model theo thứ tự ưu tiên.

export const ROLES = ['text', 'image', 'vision'];

/** Danh sách model cho một vai: combo của tài khoản, rồi combo chung, rồi model đơn cũ (chỉ vai chat chữ). */
export function comboFor(account, settings, role) {
  const own = account?.combo?.[role];
  if (own?.length) return [...own];
  const shared = settings?.combo?.[role];
  if (shared?.length) return [...shared];
  if (role === 'text') return [account?.model || settings?.model].filter(Boolean);
  return [];
}

/** Ghi nhớ model nào đang chết để bỏ qua một lúc (mặc định 10 phút). */
export class ModelHealth {
  constructor({ now = () => Date.now(), ttlMs = 600000 } = {}) { this.now = now; this.ttlMs = ttlMs; this.map = new Map(); }
  mark(model, alive, ttlMs) { this.map.set(model, { alive, at: this.now(), ttl: ttlMs }); }
  isDead(model) {
    const h = this.map.get(model);
    return !!h && !h.alive && this.now() - h.at < (h.ttl ?? this.ttlMs);
  }
}

/** Đưa model sắp hết hạn mức (>=95% trong ngày) xuống cuối, giữ nguyên thứ tự ưu tiên của các model còn lại. */
export function orderByBudget(models, pct) {
  const ok = models.filter((m) => (pct(m) ?? 0) < 95);
  return [...ok, ...models.filter((m) => !ok.includes(m))];
}

const NOT_CHAT = /image|imagen|tts|embedding|embed|aqa|veo|live|audio|robotics|computer-use|learnlm|native-audio|transcribe|lyria|omni|antigravity|deep-research/i;
const IS_IMAGE = /image|imagen/i;

/** Lọc danh sách model theo vai: chat chữ bỏ model ảnh/giọng nói..., tạo ảnh chỉ giữ model ảnh. */
export function filterForRole(models, role) {
  if (role === 'image') return models.filter((m) => IS_IMAGE.test(m.id));
  if (role === 'text' || role === 'vision') return models.filter((m) => !NOT_CHAT.test(m.id));
  return models;
}

/** Từ kết quả quét: chỉ model sống bình thường, nhanh nhất lên đầu, tối đa [max]. */
export function rankModels(results, max = 5) {
  return results.filter((r) => r.state === 'ok').sort((a, b) => a.ms - b.ms).slice(0, max).map((r) => r.model);
}
