// Bộ sửa combo model: mỗi vai có nhiều model theo thứ tự ưu tiên, kiểm tra model còn sống.
import { h, toast, openSheet } from './dom.js';
import { openModelPicker } from './models.js';

const ROLES = [['text', 'Chat chữ'], ['image', 'Tạo ảnh'], ['vision', 'Hiểu ảnh']];

const badge = (st) => {
  if (!st) return h('span', { class: 'badge', text: 'chưa kiểm tra' });
  if (st.state === 'ok') return h('span', { class: 'badge ok', text: `Sống ${st.ms}ms` });
  if (st.state === 'quota') return h('span', { class: 'badge warn', text: 'Hết hạn mức' });
  if (st.state === 'noquota') return h('span', { class: 'badge bad', text: 'Không có hạn mức miễn phí' });
  if (st.state === 'server') return h('span', { class: 'badge warn', text: 'Đang bận' });
  return h('span', { class: 'badge bad', text: st.state === 'model' ? 'Chết (không có model)' : 'Lỗi' });
};

/**
 * @param combo  đối tượng {text:[], image:[], vision:[]} (được sửa tại chỗ rồi gọi onChange)
 * @param keys   các API key dùng để kiểm tra
 */
export function comboEditor(mgr, { combo, keys, onChange }) {
  const root = h('div', { class: 'sec', id: 'comboBox' });
  const render = () => {
    root.replaceChildren();
    for (const [role, label] of ROLES) {
      const list = combo[role] || (combo[role] = []);
      const box = h('div', { class: 'role', 'data-role': role }, h('div', { class: 'row between' }, h('b', { text: label }),
        h('button', { class: 'link', 'data-add': role, text: '+ Thêm model', onclick: () => openModelPicker(mgr, { keys: keys(), multi: true, selected: list, role,
          onDone: (add) => { combo[role] = [...list, ...add]; onChange(); render(); } }) })));
      if (!list.length) box.append(h('div', { class: 'muted', text: role === 'text' ? 'Trống: dùng model đơn ở trên hoặc combo chung.' : 'Trống: tính năng này sẽ tắt.' }));
      list.forEach((m, i) => box.append(h('div', { class: 'keyrow', 'data-model': m },
        h('span', { class: 'tag alt', text: i + 1 }), h('code', { text: m }), badge(mgr.modelStatus[m]),
        h('button', { class: 'link', text: '↑', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; onChange(); render(); } }),
        h('button', { class: 'link', text: '↓', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; onChange(); render(); } }),
        h('button', { class: 'link', text: 'Xóa', onclick: () => { combo[role] = list.filter((_, j) => j !== i); onChange(); render(); } }))));
      root.append(box);
    }
    root.append(h('button', { class: 'btn ghost', id: 'comboScan', text: 'Quét và tự chọn model sống', onclick: async (e) => {
      if (!keys().length) return toast('Chưa có API key để quét');
      if (!confirm('Quét sẽ thử từng model một lần (mỗi model tốn 1 lượt nhỏ trong hạn mức). Tiếp tục?')) return;
      e.target.disabled = true;
      try {
        const { results, best } = await mgr.scanModels(keys(), (d, t) => { e.target.textContent = `Đang quét ${d}/${t}...`; });
        showScan(results, best);
      } catch (err) { toast(err.message); }
      e.target.disabled = false; e.target.textContent = 'Quét và tự chọn model sống';
      render();
    } }));
    root.append(h('button', { class: 'btn ghost', id: 'comboCheck', text: 'Kiểm tra model sống', onclick: async (e) => {
      const all = ROLES.flatMap(([r]) => combo[r] || []);
      if (!all.length) return toast('Chưa có model nào trong combo');
      if (!keys().length) return toast('Chưa có API key để kiểm tra');
      e.target.disabled = true; e.target.textContent = 'Đang kiểm tra...';
      try { await mgr.checkModels(keys(), all); } catch (err) { toast(err.message); }
      render();
    } }));
  };
  function showScan(results, best) {
    openSheet({
      title: 'Kết quả quét model', side: 'right',
      build(body, close) {
        body.append(h('p', { class: 'muted', text: 'Sắp theo tốc độ. Chỉ model "Sống" mới được đề xuất làm combo chat chữ.' }));
        const order = [...results].sort((a, b) => (a.state === 'ok' ? 0 : 1) - (b.state === 'ok' ? 0 : 1) || a.ms - b.ms);
        for (const r of order) body.append(h('div', { class: 'keyrow scan-row', 'data-model': r.model }, h('code', { text: r.model }), badge(r),
          r.state !== 'ok' && r.detail ? h('span', { class: 'hint err', text: `HTTP ${r.status || '?'}` }) : null));
        body.append(h('button', { class: 'btn', id: 'scanApply', text: best.length ? `Dùng ${best.length} model sống làm combo chat chữ` : 'Không có model sống nào', disabled: !best.length, onclick: () => {
          combo.text = best; onChange(); toast(`Đã đặt combo: ${best.join(', ')}`); close(); render();
        } }));
      },
    });
  }
  render();
  return root;
}
