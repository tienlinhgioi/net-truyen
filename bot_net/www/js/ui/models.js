// Chọn model Gemini: danh sách tải từ Google (kèm giới hạn token và mức dùng app tự đếm), chọn nhiều hoặc tự gõ tên.
import { h, openSheet, toast } from './dom.js';

const fmt = (n) => (n == null ? '?' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/**
 * @param multi    true = chọn nhiều, bấm "Thêm" để xác nhận (onDone(list)); false = chọn một (onPick(id))
 * @param selected các model đã có sẵn trong danh sách (hiện dấu tích khi multi)
 */
export function openModelPicker(mgr, { keys, current, multi = false, selected = [], onPick, onDone }) {
  openSheet({
    title: multi ? 'Thêm model vào combo' : 'Chọn model Gemini', side: 'right',
    build(body, close) {
      const chosen = new Set(selected);
      const list = h('div', { class: 'sec' });
      const doneBtn = h('button', { class: 'btn', id: 'modelDone', text: 'Xong' });
      const refreshDone = () => { doneBtn.textContent = `Thêm ${[...chosen].filter((x) => !selected.includes(x)).length} model đã chọn`; };
      const manual = h('input', { type: 'text', id: 'modelManual', placeholder: 'Hoặc gõ tên model, ví dụ gemini-2.5-flash' });
      const pick = (id) => {
        if (!multi) { onPick?.(id); toast(`Đã chọn ${id}`); close(); return; }
        if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
        list.querySelectorAll('.model').forEach((el) => el.classList.toggle('sel', chosen.has(el.dataset.id)));
        refreshDone();
      };
      const addManual = h('button', { class: 'btn ghost', id: 'modelManualAdd', text: 'Dùng tên này', onclick: () => {
        const v = manual.value.trim().replace(/^models\//, '');
        if (!v) return;
        if (multi) { chosen.add(v); manual.value = ''; refreshDone(); toast(`Đã chọn ${v}`); } else pick(v);
      } });
      doneBtn.onclick = () => { onDone?.([...chosen].filter((x) => !selected.includes(x))); close(); };
      refreshDone();
      body.append(
        h('p', { class: 'muted', text: 'Danh sách lấy từ Google bằng API key của bạn. "Hôm nay" là số lượt và token Bot Net tự đếm trên máy này (Google không cung cấp hạn mức còn lại qua API).' }),
        h('div', { class: 'row' }, manual, addManual),
        h('button', { class: 'btn ghost', id: 'modelReload', text: 'Tải lại danh sách', onclick: load }), list, multi ? doneBtn : null);
      async function load() {
        if (!keys.length) { list.replaceChildren(h('div', { class: 'empty', text: 'Hãy lưu API key trước (hoặc gõ tên model ở trên).' })); return; }
        list.replaceChildren(h('div', { class: 'empty', text: 'Đang tải...' }));
        try {
          const models = await mgr.loadModels(keys[0]);
          list.replaceChildren(...models.map((m) => {
            const u = keys.reduce((s, k) => { const x = mgr.usageFor(k, m.id); return { requests: s.requests + x.requests, tokens: s.tokens + x.tokens }; }, { requests: 0, tokens: 0 });
            return h('div', { class: `model ${(multi ? chosen.has(m.id) : m.id === current) ? 'sel' : ''}`, 'data-id': m.id, onclick: () => pick(m.id) },
              h('b', { text: m.displayName || m.id }), h('span', { class: 'muted', text: m.id }),
              h('span', { class: 'muted', text: `Vào ${fmt(m.inputTokenLimit)} token · ra ${fmt(m.outputTokenLimit)} token` }),
              h('span', { class: 'muted', text: `Hôm nay: ${u.requests} lượt, ${fmt(u.tokens)} token` }));
          }));
        } catch (e) { list.replaceChildren(h('div', { class: 'empty', text: `Không tải được (${e.kind || e.message}). Kiểm tra API key hoặc gõ tên model ở trên.` })); }
      }
      load();
    },
  });
}
