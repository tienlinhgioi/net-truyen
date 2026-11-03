// Cài đặt chung (bên trái): giao diện, delay, lịch chạy, giới hạn, từ cấm, xuất/nhập.
import { h, openSheet, switchEl, toast } from './dom.js';
import { openModelPicker } from './models.js';
import { pickImageAsDataUrl, download, pickTextFile } from '../platform.js';

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function openSettings(mgr, applyTheme) {
  openSheet({
    title: 'Cài đặt', side: 'left',
    build(body) {
      const st = mgr.settings;
      const set = (p) => { mgr.updateSettings(p); applyTheme(); };
      const num = (label, key, unit, id, scale = 1000) => h('label', { class: 'f' }, `${label} (${unit})`,
        h('input', { type: 'number', min: 0, step: 'any', id, value: st[key] / scale, onchange: (e) => set({ [key]: Math.max(0, Number(e.target.value) || 0) * scale }) }));
      const sched = () => st.schedule;
      const setSched = (p) => set({ schedule: { ...st.schedule, ...p } });
      const days = h('div', { class: 'chips' });
      const renderDays = () => { days.replaceChildren(...DAYS.map((d, i) => h('button', { class: `chip ${sched().weekdays.includes(i) ? 'on' : ''}`, text: d, onclick: () => {
        const w = sched().weekdays.includes(i) ? sched().weekdays.filter((x) => x !== i) : [...sched().weekdays, i];
        setSched({ weekdays: w.sort() }); renderDays();
      } }))); };
      renderDays();
      const wallBtns = h('div', { class: 'grid2' },
        h('button', { class: 'btn ghost', id: 'wallAdd', text: 'Thêm hình nền', onclick: async () => { const d = await pickImageAsDataUrl(); if (d) set({ wallpaper: d }); } }),
        h('button', { class: 'btn ghost', id: 'wallDel', text: 'Bỏ hình nền', onclick: () => set({ wallpaper: null }) }));

      body.append(
        h('div', { class: 'sec' }, h('h3', { text: 'Giao diện' }),
          h('label', { class: 'f' }, 'Màu nền', h('input', { type: 'color', id: 'setBg', value: st.bg, oninput: (e) => set({ bg: e.target.value }) })),
          h('label', { class: 'f' }, 'Màu nhấn', h('input', { type: 'color', id: 'setAccent', value: st.accent, oninput: (e) => set({ accent: e.target.value }) })),
          wallBtns,
          h('label', { class: 'f' }, 'Độ tối của hình nền', h('input', { type: 'range', min: 0, max: 0.9, step: 0.05, value: st.wallpaperDim, oninput: (e) => set({ wallpaperDim: Number(e.target.value) }) }))),
        h('div', { class: 'sec' }, h('h3', { text: 'Delay' }),
          num('Delay chat mặc định', 'chatDelayMs', 'giây', 'setChatDelay'), num('Delay đổi API key', 'keyDelayMs', 'giây', 'setKeyDelay'),
          num('Delay tự kết nối lại', 'reconnectDelayMs', 'giây', 'setReconDelay'), num('Quét chat mỗi', 'pollMs', 'giây', 'setPoll')),
        h('div', { class: 'sec' }, h('h3', { text: 'Giới hạn và logic' }),
          h('label', { class: 'f' }, 'Giới hạn ký tự trả lời chung (0 = không giới hạn)', h('input', { type: 'number', min: 0, id: 'setMax', value: st.maxChars, onchange: (e) => set({ maxChars: Math.max(0, Number(e.target.value) || 0) }) })),
          h('label', { class: 'f' }, 'Bot trả lời bot tối đa (tin liên tiếp)', h('input', { type: 'number', min: 1, max: 5, id: 'setChain', value: st.maxChain, onchange: (e) => set({ maxChain: Math.min(5, Math.max(1, Number(e.target.value) || 2)) }) })),
          h('label', { class: 'f' }, 'Số tin gần nhất gửi kèm làm ngữ cảnh', h('input', { type: 'number', min: 0, max: 20, value: st.contextSize, onchange: (e) => set({ contextSize: Math.min(20, Math.max(0, Number(e.target.value) || 0)) }) })),
          h('button', { class: 'btn ghost', id: 'setModel', text: `Mô hình mặc định: ${st.model || 'chưa chọn'}`, onclick: (e) => {
            const keys = mgr.accounts.flatMap((a) => a.keys);
            openModelPicker(mgr, { keys, current: st.model, onPick: (m) => { set({ model: m }); e.target.textContent = `Mô hình mặc định: ${m}`; } });
          } }),
          h('label', { class: 'f' }, 'Từ cấm: không trả lời câu chứa (mỗi dòng một từ)', (() => { const t = h('textarea', { id: 'setBlocked', onchange: (e) => set({ blockedWords: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }) }); t.value = st.blockedWords.join('\n'); return t; })())),
        h('div', { class: 'sec' }, h('h3', { text: 'Lịch chạy' }),
          h('div', { class: 'sw-row' }, h('span', { text: 'Chỉ chạy theo lịch' }), switchEl(sched().enabled, (on) => setSched({ enabled: on }))),
          h('div', { class: 'grid2' },
            h('label', { class: 'f' }, 'Từ giờ', h('input', { type: 'time', id: 'setFrom', value: sched().from, onchange: (e) => setSched({ from: e.target.value }) })),
            h('label', { class: 'f' }, 'Đến giờ', h('input', { type: 'time', id: 'setTo', value: sched().to, onchange: (e) => setSched({ to: e.target.value }) }))),
          h('span', { class: 'muted', text: 'Các thứ trong tuần' }), days,
          h('div', { class: 'grid2' },
            h('label', { class: 'f' }, 'Từ ngày', h('input', { type: 'date', value: sched().dateFrom, onchange: (e) => setSched({ dateFrom: e.target.value }) })),
            h('label', { class: 'f' }, 'Đến ngày', h('input', { type: 'date', value: sched().dateTo, onchange: (e) => setSched({ dateTo: e.target.value }) })))),
        h('div', { class: 'sec' }, h('h3', { text: 'Hệ thống' }),
          h('div', { class: 'sw-row' }, h('span', { text: 'Chạy ngầm (giữ app khi tắt màn hình)' }), switchEl(st.runInBackground, (on) => set({ runInBackground: on }))),
          h('div', { class: 'grid2' },
            h('button', { class: 'btn ghost', id: 'cfgExport', text: 'Xuất cấu hình', onclick: () => { download('bot-net-cau-hinh.json', mgr.exportConfig(false)); toast('Đã xuất (không kèm mật khẩu và key)'); } }),
            h('button', { class: 'btn ghost', id: 'cfgImport', text: 'Nhập cấu hình', onclick: async () => { const t = await pickTextFile(); if (!t) return; try { await mgr.importConfig(t); applyTheme(); toast('Đã nhập cấu hình, các tài khoản đang tắt'); } catch (e) { toast(e.message); } } }))));
    },
  });
}
