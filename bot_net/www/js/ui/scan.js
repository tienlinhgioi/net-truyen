// Bảng kết quả quét model: tình trạng từng model (sống, hết hạn mức, không có hạn mức, bận, không tồn tại).
import { h, openSheet } from './dom.js';

const STATE = {
  ok: ['ok', (r) => `Sống ${r.ms}ms`], quota: ['warn', () => 'Hết hạn mức hôm nay'], noquota: ['bad', () => 'Không có hạn mức miễn phí'], server: ['warn', () => 'Đang bận'],
  model: ['bad', () => 'Chết (không có model)'], invalid: ['bad', () => 'Sai key'], denied: ['warn', () => 'Bị từ chối tạm'], skip: ['', () => 'Không thử tự động'], error: ['bad', () => 'Lỗi mạng'], other: ['bad', () => 'Lỗi khác'],
};

export function openScanSheet({ results, best = [], title = 'Kết quả quét model', onApply = null, applyLabel = '' }) {
  openSheet({
    title, side: 'right',
    build(body, close) {
      const count = (s) => results.filter((r) => r.state === s).length;
      body.append(h('div', { class: 'card rep', id: 'scanSummary' },
        h('b', { text: `${results.length} model` }),
        h('span', { text: `Sống: ${count('ok')} · hết hạn mức: ${count('quota')} · không có hạn mức: ${count('noquota')} · bận: ${count('server')} · không tồn tại: ${count('model')} · không thử: ${count('skip')}` })));
      const order = [...results].sort((a, b) => (a.state === 'ok' ? 0 : 1) - (b.state === 'ok' ? 0 : 1) || a.ms - b.ms);
      for (const r of order) {
        const [cls, txt] = STATE[r.state] || STATE.other;
        body.append(h('div', { class: 'keyblock scan-row', 'data-model': r.model },
          h('div', { class: 'keyrow' }, h('code', { text: r.model }), h('span', { class: `badge ${cls}`, text: txt(r) })),
          r.percent != null ? h('div', { class: 'hint', text: `Đã dùng hôm nay: ${r.percent}% hạn mức` }) : null,
          r.state !== 'ok' && r.state !== 'skip' && r.detail ? h('div', { class: 'hint err', text: `HTTP ${r.status || '?'}: ${String(r.detail).slice(0, 120)}` }) : null));
      }
      if (onApply) body.append(h('button', { class: 'btn', id: 'scanApply', text: best.length ? applyLabel : 'Không có model sống nào', disabled: !best.length, onclick: () => { onApply(best); close(); } }));
    },
  });
}
