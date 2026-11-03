// Chọn mô hình Gemini: tải danh sách từ Google, kèm giới hạn token và mức dùng app tự đếm.
import { h, openSheet, toast } from './dom.js';

export function openModelPicker(mgr, { keys, current, onPick }) {
  openSheet({
    title: 'Chọn mô hình Gemini', side: 'right',
    build(body, close) {
      const list = h('div', { class: 'sec' });
      const note = h('p', { class: 'muted', text: 'Danh sách lấy từ Google bằng API key của bạn. "Hôm nay" là số lượt và token Bot Net tự đếm trên máy này (Google không cung cấp hạn mức còn lại qua API).' });
      body.append(note, h('button', { class: 'btn ghost', id: 'modelReload', text: 'Tải lại danh sách', onclick: load }), list);
      async function load() {
        if (!keys.length) { list.replaceChildren(h('div', { class: 'empty', text: 'Hãy lưu API key trước.' })); return; }
        list.replaceChildren(h('div', { class: 'empty', text: 'Đang tải...' }));
        try {
          const models = await mgr.loadModels(keys[0]);
          list.replaceChildren(...models.map((m) => {
            const u = keys.reduce((s, k) => { const x = mgr.usageFor(k, m.id); return { requests: s.requests + x.requests, tokens: s.tokens + x.tokens }; }, { requests: 0, tokens: 0 });
            return h('div', { class: `model ${m.id === current ? 'sel' : ''}`, 'data-id': m.id, onclick: () => { onPick(m.id); toast(`Đã chọn ${m.id}`); close(); } },
              h('b', { text: m.displayName || m.id }), h('span', { class: 'muted', text: m.id }),
              h('span', { class: 'muted', text: `Vào ${fmt(m.inputTokenLimit)} token · ra ${fmt(m.outputTokenLimit)} token` }),
              h('span', { class: 'muted', text: `Hôm nay: ${u.requests} lượt, ${fmt(u.tokens)} token` }));
          }));
        } catch (e) { list.replaceChildren(h('div', { class: 'empty', text: `Không tải được (${e.kind || e.message}). Kiểm tra API key.` })); }
      }
      load();
    },
  });
}

const fmt = (n) => (n == null ? '?' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
