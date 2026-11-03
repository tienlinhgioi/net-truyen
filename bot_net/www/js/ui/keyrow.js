// Dòng hiển thị một API key: trạng thái kiểm tra, mức dùng theo phần trăm, lý do lỗi.
import { h } from './dom.js';

export const maskKey = (k) => (k.length > 10 ? `${k.slice(0, 6)}…${k.slice(-4)}` : '••••');

const STATE = {
  ok: ['ok', (s) => `Sống ${s.ms}ms`], quota: ['warn', () => 'Hết hạn mức'], noquota: ['bad', () => 'Model không có hạn mức miễn phí'], invalid: ['bad', () => 'Sai/khóa key'], denied: ['warn', () => 'Bị từ chối tạm'],
  region: ['bad', () => 'Vùng không hỗ trợ'], model: ['warn', () => 'Key ok, model chết'], server: ['warn', () => 'Google lỗi'], error: ['bad', () => 'Lỗi mạng'], other: ['bad', () => 'Lỗi khác'],
};

export function statusBadge(st) {
  if (!st) return h('span', { class: 'badge', text: 'chưa kiểm tra' });
  const [cls, txt] = STATE[st.state] || STATE.other;
  return h('span', { class: `badge ${cls}`, text: txt(st) });
}

export function planBadge(plan) {
  if (plan === 'free') return h('span', { class: 'badge plan free', title: 'Tên hạn mức Google báo có đuôi FreeTier', text: 'Gói miễn phí' });
  if (plan === 'paid') return h('span', { class: 'badge plan paid', title: 'Suy ra từ hạn mức không phải FreeTier hoặc model Pro chạy được', text: 'Gói trả phí' });
  return h('span', { class: 'badge plan', text: 'Gói chưa rõ' });
}

const hhmm = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** Phần trăm đã dùng trong ngày (theo giới hạn tự học từ Google hoặc do bạn đặt). */
export function quotaBar(mgr, key, model) {
  if (!model) return h('div', { class: 'hint', text: 'Chưa chọn model nên chưa tính được mức dùng.' });
  const q = mgr.quotaInfo(key, model);
  if (!q.rpd) return h('div', { class: 'hint quota', text: `Hôm nay: ${q.requests} lượt · chưa biết giới hạn${q.plan === 'paid' ? ' của gói trả phí' : ''} (đặt trong Cài đặt, hoặc tự học khi Google báo hết hạn mức)` });
  const cls = q.percent >= 90 ? 'bad' : q.percent >= 70 ? 'warn' : 'ok';
  return h('div', { class: 'quota' },
    h('div', { class: 'row between' }, h('span', { class: 'hint', text: `Hôm nay: ${q.requests}/${q.rpd} lượt${q.rpm ? ` · ${q.rpm}/phút` : ''}${q.learned ? ' (tự học)' : ''}` }), h('b', { class: `pct ${cls}`, text: `${q.percent}%` })),
    h('div', { class: 'bar' }, h('i', { class: cls, style: `width:${q.percent}%` })));
}

/** Một dòng key đầy đủ: nhãn, key rút gọn, trạng thái, thanh phần trăm, lý do lỗi. */
export function keyRow(mgr, { key, index, model, label, onRemove }) {
  const st = mgr.keyStatusFor(key, model);
  const reason = st && st.state !== 'ok' && st.detail ? `${st.status ? `HTTP ${st.status}: ` : ''}${String(st.detail).slice(0, 140)}` : '';
  return h('div', { class: 'keyblock', 'data-key': index },
    h('div', { class: 'keyrow' },
      h('span', { class: `tag ${index ? 'alt' : ''}`, text: label ?? (index ? `Dự phòng ${index}` : 'Chính') }), h('code', { text: maskKey(key) }), planBadge(mgr.planOf(key)), statusBadge(st),
      onRemove ? h('button', { class: 'link', text: 'Xóa', onclick: onRemove }) : null),
    quotaBar(mgr, key, model),
    st?.resetAt && st.resetAt > Date.now() ? h('div', { class: 'hint', text: `Hạn mức làm mới lúc ${hhmm(st.resetAt)} (giờ máy)` }) : null,
    reason ? h('div', { class: 'hint err', text: reason }) : null);
}
