// Cài đặt chung (bên trái): giao diện, combo, delay, hành vi, ảnh, lịch chạy, kiểm tra key, báo cáo, xuất/nhập.
import { h, openSheet, switchEl, toast } from './dom.js';
import { comboEditor } from './combo.js';
import { openReport } from './report.js';
import { keyRow } from './keyrow.js';
import { pickImageAsDataUrl, download, pickTextFile } from '../platform.js';

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function openSettings(mgr, applyTheme) {
  openSheet({
    title: 'Cài đặt', side: 'left',
    build(body) {
      const st = mgr.settings;
      const set = (p) => { mgr.updateSettings(p); applyTheme(); };
      const num = (label, key, unit, id, scale = 1) => h('label', { class: 'f' }, `${label} (${unit})`,
        h('input', { type: 'number', min: 0, step: 'any', id, value: +(st[key] / scale).toFixed(3), onchange: (e) => set({ [key]: Math.max(0, Number(e.target.value) || 0) * scale }) }));
      const sched = () => st.schedule;
      const setSched = (p) => set({ schedule: { ...st.schedule, ...p } });
      const days = h('div', { class: 'chips' });
      const renderDays = () => { days.replaceChildren(...DAYS.map((d, i) => h('button', { class: `chip ${sched().weekdays.includes(i) ? 'on' : ''}`, text: d, onclick: () => {
        const w = sched().weekdays.includes(i) ? sched().weekdays.filter((x) => x !== i) : [...sched().weekdays, i];
        setSched({ weekdays: w.sort() }); renderDays();
      } }))); };
      renderDays();
      const range = (label, key, min, max, step, id) => h('label', { class: 'f' }, label,
        h('input', { type: 'range', id, min, max, step, value: st[key], oninput: (e) => set({ [key]: Number(e.target.value) }) }));
      const dim = range('Độ tối của hình nền', 'wallpaperDim', 0, 0.9, 0.05, 'setDim');
      const dimInput = dim.querySelector('input');
      const syncDim = () => { dimInput.disabled = !st.wallpaper; };
      syncDim();
      const wallBtns = h('div', { class: 'grid2' },
        h('button', { class: 'btn ghost', id: 'wallAdd', text: 'Thêm hình nền', onclick: async () => { const d = await pickImageAsDataUrl(); if (d) { set({ wallpaper: d }); syncDim(); } } }),
        h('button', { class: 'btn ghost', id: 'wallDel', text: 'Bỏ hình nền', onclick: () => { set({ wallpaper: null }); syncDim(); } }));
      const sw = (label, key, id) => h('div', { class: 'sw-row' }, h('span', { text: label }), switchEl(!!st[key], (on) => set({ [key]: on })));
      const ta = (id, key, split = '\n') => { const t = h('textarea', { id, onchange: (e) => set({ [key]: e.target.value.split(split).map((s) => s.trim()).filter(Boolean) }) }); t.value = st[key].join(split === '\n' ? '\n' : ', '); return t; };

      const keyReport = h('div', { class: 'sec', id: 'allKeys' });
      const renderKeyReport = () => {
        keyReport.replaceChildren();
        for (const a of mgr.accounts) {
          if (!a.keys.length) continue;
          const model = mgr.checkModelOf(a);
          keyReport.append(h('div', { class: 'muted', text: `${a.displayName || a.name} · model ${model || '(chưa chọn)'}` }));
          a.keys.forEach((k, i) => keyReport.append(keyRow(mgr, { key: k, index: i, model })));
        }
      };
      renderKeyReport();
      const checkAll = h('button', { class: 'btn ghost', id: 'checkAllAcc', text: 'Kiểm tra đồng loạt tất cả API key', onclick: async () => {
        if (!mgr.accounts.some((a) => a.keys.length)) return toast('Chưa có key nào');
        checkAll.disabled = true; checkAll.textContent = 'Đang kiểm tra...';
        const res = await mgr.checkAccountKeys(mgr.accounts.map((a) => a.id));
        checkAll.disabled = false; checkAll.textContent = 'Kiểm tra đồng loạt tất cả API key'; renderKeyReport();
        toast(`${res.filter((r) => r.state === 'ok').length}/${res.length} key đang sống`);
      } });

      // Giới hạn lượt theo model: tự học từ lỗi hạn mức của Google, bạn sửa tay được.
      const limBox = h('div', { class: 'sec', id: 'limBox' });
      const renderLimits = () => {
        limBox.replaceChildren();
        const models = [...new Set([...mgr.accounts.flatMap((a) => ['text', 'image', 'vision'].flatMap((r) => mgr.comboModels(a, r))), ...['text', 'image', 'vision'].flatMap((r) => st.combo[r] || [])])];
        if (!models.length) { limBox.append(h('span', { class: 'hint', text: 'Chưa có model nào trong combo.' })); return; }
        limBox.append(h('div', { class: 'limrow hint' }, h('span', { text: 'Model' }), h('span', { text: 'Lượt/ngày' }), h('span', { text: 'Lượt/phút' })));
        for (const m of models) {
          const g = mgr.limits.get(m), u = st.modelLimits[m] || {};
          const inp = (k, v, id) => h('input', { type: 'number', min: 0, 'data-lim': `${m}:${k}`, id, value: u[k] || '', placeholder: v ? `${v}${g.learned ? '*' : ''}` : '?',
            onchange: (e) => { const n = Math.max(0, Number(e.target.value) || 0); const next = { ...st.modelLimits, [m]: { ...(st.modelLimits[m] || {}), [k]: n } }; set({ modelLimits: next }); } });
          limBox.append(h('div', { class: 'limrow' }, h('code', { text: m }), inp('rpd', g.rpd), inp('rpm', g.rpm)));
        }
        limBox.append(h('span', { class: 'hint', text: 'Số có dấu * do app tự học từ thông báo hết hạn mức của Google. Gõ số của bạn để ghi đè (hạn mức khác nhau tùy gói và model).' }));
      };
      renderLimits();

      body.append(
        h('div', { class: 'sec' }, h('h3', { text: 'Giao diện' }),
          h('label', { class: 'f' }, 'Màu nền', h('input', { type: 'color', id: 'setBg', value: st.bg, oninput: (e) => set({ bg: e.target.value }) })),
          h('label', { class: 'f' }, 'Màu nhấn', h('input', { type: 'color', id: 'setAccent', value: st.accent, oninput: (e) => set({ accent: e.target.value }) })),
          wallBtns, dim, h('span', { class: 'hint', text: 'Độ tối chỉ có tác dụng khi đã thêm hình nền.' }),
          range('Độ mờ của khung (độ đục)', 'panelAlpha', 0.02, 0.45, 0.01, 'setPanel'),
          range('Làm mờ kính phía sau khung (px)', 'wallpaperBlur', 0, 28, 1, 'setBlur')),
        h('div', { class: 'sec' }, h('h3', { text: 'Combo model chung' }),
          h('span', { class: 'hint', text: 'Dùng khi tài khoản không có combo riêng. Gói miễn phí giới hạn lượt rất thấp theo từng model (có model chỉ 20 lượt mỗi ngày) và model Pro thường không có hạn mức: hãy thêm NHIỀU model vào combo để cộng dồn hạn mức, và dùng key từ các dự án Google khác nhau.' }),
          comboEditor(mgr, { combo: st.combo, keys: () => mgr.accounts.flatMap((a) => a.keys), onChange: () => set({ combo: st.combo }) })),
        h('div', { class: 'sec' }, h('h3', { text: 'API key và mức dùng' }), checkAll, keyReport),
        h('div', { class: 'sec' }, h('h3', { text: 'Giới hạn lượt theo model' }), limBox),
        h('div', { class: 'sec' }, h('h3', { text: 'Delay và tốc độ' }),
          num('Khoảng cách tối thiểu giữa 2 tin (delay chat)', 'chatDelayMs', 'giây', 'setChatDelay', 1000), num('Delay đổi API key', 'keyDelayMs', 'giây', 'setKeyDelay', 1000),
          num('Delay tự kết nối lại', 'reconnectDelayMs', 'giây', 'setReconDelay', 1000), num('Quét chat mỗi', 'pollMs', 'giây', 'setPoll', 1000),
          num('Tốc độ gõ', 'typingPerCharMs', 'ms mỗi ký tự', 'setTyping', 1)),
        h('div', { class: 'sec' }, h('h3', { text: 'Hành vi như người thật' }),
          sw('Tâm trạng theo giờ trong ngày', 'moodEnabled'), sw('Tránh lặp lại câu vừa nói', 'avoidRepeat'),
          h('label', { class: 'f' }, 'Xác suất tự chen vào tin của người khác (%)', h('input', { type: 'number', min: 0, max: 100, id: 'setProChance', value: Math.round(st.proactiveChance * 100), onchange: (e) => set({ proactiveChance: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 }) })),
          num('Tối đa tin tự chen/mở chủ đề mỗi giờ (mỗi tài khoản)', 'proactiveMaxPerHour', 'tin', 'setProMax', 1),
          num('Chạy song song model dự phòng khi model đầu chậm quá (0 = tắt, tốn thêm lượt)', 'hedgeMs', 'giây', 'setHedge', 1000),
          num('Tiếp tục trò chuyện trong', 'convoWindowMs', 'phút', 'setConvo', 60000),
          sw('Tự mở chủ đề khi phòng chat vắng', 'starterEnabled'), num('Phòng vắng bao lâu thì mở chủ đề', 'starterIdleMs', 'phút', 'setStarterIdle', 60000),
          h('label', { class: 'f' }, 'Từ nhạy cảm: không chen vào, thấy cãi vã thì đứng ngoài (mỗi dòng một từ)', ta('setSensitive', 'sensitiveWords'))),
        h('div', { class: 'sec' }, h('h3', { text: 'Ảnh' }),
          h('span', { class: 'hint', text: 'Ảnh bot tạo được tải lên bằng chính tài khoản đang chat, không cần khóa nào.' }),
          num('Giới hạn số ảnh tạo mỗi ngày (mỗi tài khoản)', 'imagePerDay', 'ảnh', 'setImgDay', 1), num('Chờ giữa hai lần tạo ảnh', 'imageCooldownMs', 'giây', 'setImgCd', 1000)),
        h('div', { class: 'sec' }, h('h3', { text: 'Giới hạn và logic' }),
          h('label', { class: 'f' }, 'Giới hạn ký tự trả lời chung (0 = không giới hạn)', h('input', { type: 'number', min: 0, id: 'setMax', value: st.maxChars, onchange: (e) => set({ maxChars: Math.max(0, Number(e.target.value) || 0) }) })),
          h('label', { class: 'f' }, 'Bot trả lời bot tối đa (tin liên tiếp)', h('input', { type: 'number', min: 1, max: 5, id: 'setChain', value: st.maxChain, onchange: (e) => set({ maxChain: Math.min(5, Math.max(1, Number(e.target.value) || 2)) }) })),
          h('label', { class: 'f' }, 'Số tin gần nhất gửi kèm làm ngữ cảnh', h('input', { type: 'number', min: 0, max: 20, value: st.contextSize, onchange: (e) => set({ contextSize: Math.min(20, Math.max(0, Number(e.target.value) || 0)) }) })),
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
          h('span', { class: 'hint', text: 'Nên tắt "tối ưu pin" cho Bot Net trong cài đặt điện thoại để chạy ngầm ổn định.' }),
          h('button', { class: 'btn ghost', id: 'openReport', text: 'Báo cáo hằng ngày', onclick: () => openReport(mgr) }),
          h('div', { class: 'grid2' },
            h('button', { class: 'btn ghost', id: 'cfgExport', text: 'Xuất cấu hình', onclick: () => { download('bot-net-cau-hinh.json', mgr.exportConfig(false)); toast('Đã xuất (không kèm mật khẩu và key)'); } }),
            h('button', { class: 'btn ghost', id: 'cfgImport', text: 'Nhập cấu hình', onclick: async () => { const t = await pickTextFile(); if (!t) return; try { await mgr.importConfig(t); applyTheme(); toast('Đã nhập cấu hình, các tài khoản đang tắt'); } catch (e) { toast(e.message); } } }))));
    },
  });
}
