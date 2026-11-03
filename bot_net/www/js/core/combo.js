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
  mark(model, alive) { this.map.set(model, { alive, at: this.now() }); }
  isDead(model) {
    const h = this.map.get(model);
    return !!h && !h.alive && this.now() - h.at < this.ttlMs;
  }
}
