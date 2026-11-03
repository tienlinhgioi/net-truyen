// Cài đặt (bên trái), chia 4 màn riêng: Giao diện, Model và API key, Hành vi và tốc độ, Lịch và hệ thống.
import { h, openSheet, switchEl, toast } from './dom.js';
import { comboEditor } from './combo.js';
import { openReport } from './report.js';
import { keyRow } from './keyrow.js';
import { filterKeys } from '../core/keys.js';
import { openScanSheet } from './scan.js';
import { pickImageAsDataUrl, download, pickTextFile } from '../platform.js';

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Công cụ dựng ô nhập dùng chung cho các màn cài đặt. */
function tools(mgr, applyTheme) {
  const st = mgr.settings;
  const set = (p) => { mgr.updateSettings(p); applyTheme(); };
  const num = (label, key, unit, id, scale = 1) => h('label', { class: 'f' }, `${label} (${unit})`,
    h('input', { type: 'number', min: 0, step: 'any', id, value: +(st[key] / scale).toFixed(3), onchange: (e) => set({ [key]: Math.max(0, Number(e.target.value) || 0) * scale }) }));
  const range = (label, key, min, max, step, id) => h('label', { class: 'f' }, label,
    h('input', { type: 'range', id, min, max, step, value: st[key], oninput: (e) => set({ [key]: Number(e.target.value) }) }));
  const sw = (label, key) => h('div', { class: 'sw-row' }, h('span', { text: label }), switchEl(!!st[key], (on) => set({ [key]: on })));
  const ta = (id, key) => { const t = h('textarea', { id, onchange: (e) => set({ [key]: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) }) }); t.value = st[key].join('\n'); return t; };
  const intField = (label, key, id, min, max, fallback) => h('label', { class: 'f' }, label,
    h('input', { type: 'number', min, max, id, value: st[key], onchange: (e) => set({ [key]: Math.min(max, Math.max(min, Number(e.target.value) || fallback)) }) }));
  return { st, set, num, range, sw, ta, intField };
}

// ---------------------------------------------------------------- 1. Giao diện
function appearance(body, mgr, applyTheme) {
  const { st, set, range } = tools(mgr, applyTheme);
  const dim = range('Độ tối của hình nền', 'wallpaperDim', 0, 0.9, 0.05, 'setDim');
  const dimInput = dim.querySelector('input');
  const syncDim = () => { dimInput.disabled = !st.wallpaper; };
  syncDim();
  body.append(h('div', { class: 'sec' },
    h('label', { class: 'f' }, 'Màu nền', h('input', { type: 'color', id: 'setBg', value: st.bg, oninput: (e) => set({ bg: e.target.value }) })),
    h('label', { class: 'f' }, 'Màu nhấn', h('input', { type: 'color', id: 'setAccent', value: st.accent, oninput: (e) => set({ accent: e.target.value }) })),
    h('div', { class: 'grid2' },
      h('button', { class: 'btn ghost', id: 'wallAdd', text: 'Thêm hình nền', onclick: async () => { const d = await pickImageAsDataUrl(); if (d) { set({ wallpaper: d }); syncDim(); } } }),
      h('button', { class: 'btn ghost', id: 'wallDel', text: 'Bỏ hình nền', onclick: () => { set({ wallpaper: null }); syncDim(); } })),
    dim, h('span', { class: 'hint', text: 'Độ tối chỉ có tác dụng khi đã thêm hình nền.' }),
    range('Độ mờ của khung (độ đục)', 'panelAlpha', 0.02, 0.45, 0.01, 'setPanel'),
    range('Làm mờ kính phía sau khung (px)', 'wallpaperBlur', 0, 28, 1, 'setBlur')));
}

// ---------------------------------------------------------------- 2. Model và API key
function models(body, mgr, applyTheme) {
  const { st, set } = tools(mgr, applyTheme);
  const keyReport = h('div', { class: 'sec', id: 'allKeys' });
  const keySearch = h('input', { type: 'text', id: 'allKeySearch', placeholder: 'Tìm nhanh key: đoạn key, tên tài khoản, gói, trạng thái...', oninput: () => renderKeyReport() });
  const renderKeyReport = () => {
    keyReport.replaceChildren();
    for (const a of mgr.accounts) {
      if (!a.keys.length) continue;
      const model = mgr.checkModelOf(a);
      const rows = a.keys.map((k, i) => ({ key: k, i, account: a.displayName || a.name, plan: mgr.planOf(k), state: mgr.keyStatusFor(k, model)?.state }));
      const shown = filterKeys(rows, keySearch.value);
      if (!shown.length) continue;
      keyReport.append(h('div', { class: 'muted', text: `${a.displayName || a.name} · model ${model || '(chưa chọn)'}` }));
      for (const r of shown) keyReport.append(keyRow(mgr, { key: r.key, index: r.i, model }));
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
  const scanAll = h('button', { class: 'btn ghost', id: 'scanAllSettings', text: 'Kiểm tra tình trạng tất cả model', onclick: async () => {
    const keys = mgr.accounts.flatMap((a) => a.keys);
    if (!keys.length) return toast('Chưa có key nào');
    if (!confirm('Sẽ thử từng model chat một lần bằng key đầu tiên (mỗi model tốn 1 lượt nhỏ). Tiếp tục?')) return;
    scanAll.disabled = true;
    try { const r = await mgr.scanModels(keys, (d, t) => { scanAll.textContent = `Đang kiểm tra ${d}/${t}...`; }, { all: true }); openScanSheet({ results: r.results, title: 'Tình trạng tất cả model' }); }
    catch (err) { toast(err.message); }
    scanAll.disabled = false; scanAll.textContent = 'Kiểm tra tình trạng tất cả model'; renderKeyReport();
  } });

  // Giới hạn lượt theo model: tự học từ lỗi hạn mức của Google, bạn sửa tay được.
  const limBox = h('div', { class: 'sec', id: 'limBox' });
  const renderLimits = () => {
    limBox.replaceChildren();
    const names = [...new Set([...mgr.accounts.flatMap((a) => ['text', 'image', 'vision'].flatMap((r) => mgr.comboModels(a, r))), ...['text', 'image', 'vision'].flatMap((r) => st.combo[r] || [])])];
    if (!names.length) { limBox.append(h('span', { class: 'hint', text: 'Chưa có model nào trong combo.' })); return; }
    limBox.append(h('div', { class: 'limrow hint' }, h('span', { text: 'Model' }), h('span', { text: 'Lượt/ngày' }), h('span', { text: 'Lượt/phút' })));
    for (const m of names) {
      const g = mgr.limits.get(m), u = st.modelLimits[m] || {};
      const inp = (k, v, id) => h('input', { type: 'number', min: 0, 'data-lim': `${m}:${k}`, id, value: u[k] || '', placeholder: v ? `${v}${g.learned ? '*' : ''}` : '?',
        onchange: (e) => { const n = Math.max(0, Number(e.target.value) || 0); set({ modelLimits: { ...st.modelLimits, [m]: { ...(st.modelLimits[m] || {}), [k]: n } } }); } });
      limBox.append(h('div', { class: 'limrow' }, h('code', { text: m }), inp('rpd', g.rpd), inp('rpm', g.rpm)));
    }
    limBox.append(h('span', { class: 'hint', text: 'Số có dấu * do app tự học từ thông báo hết hạn mức của Google. Gõ số của bạn để ghi đè (hạn mức khác nhau tùy gói và model).' }));
  };
  renderLimits();

  body.append(
    h('div', { class: 'sec' }, h('h3', { text: 'Combo model chung' }),
      h('span', { class: 'hint', text: 'Dùng khi tài khoản không có combo riêng. Gói miễn phí giới hạn lượt rất thấp theo từng model (có model chỉ 20 lượt mỗi ngày), model Pro và model tạo ảnh thường không có hạn mức miễn phí: hãy thêm NHIỀU model vào combo để cộng dồn hạn mức, và dùng key từ các dự án Google khác nhau.' }),
      comboEditor(mgr, { combo: st.combo, keys: () => mgr.accounts.flatMap((a) => a.keys), onChange: () => set({ combo: st.combo }) })),
    h('div', { class: 'sec' }, h('h3', { text: 'API key và mức dùng' }), checkAll, scanAll, keySearch, keyReport),
    h('div', { class: 'sec' }, h('h3', { text: 'Giới hạn lượt theo model' }), limBox));
}

// ---------------------------------------------------------------- 3. Hành vi và tốc độ
function behavior(body, mgr, applyTheme) {
  const { st, set, num, sw, ta, intField } = tools(mgr, applyTheme);
  body.append(
    h('div', { class: 'sec' }, h('h3', { text: 'Delay và tốc độ' }),
      num('Khoảng cách tối thiểu giữa 2 tin (delay chat)', 'chatDelayMs', 'giây', 'setChatDelay', 1000), num('Delay đổi API key', 'keyDelayMs', 'giây', 'setKeyDelay', 1000),
      num('Delay tự kết nối lại', 'reconnectDelayMs', 'giây', 'setReconDelay', 1000), num('Quét chat mỗi', 'pollMs', 'giây', 'setPoll', 1000),
      num('Tốc độ gõ', 'typingPerCharMs', 'ms mỗi ký tự', 'setTyping', 1),
      num('Chạy song song model dự phòng khi model đầu chậm quá (0 = tắt, tốn thêm lượt)', 'hedgeMs', 'giây', 'setHedge', 1000)),
    h('div', { class: 'sec' }, h('h3', { text: 'Giới hạn trả lời' }),
      intField('Số tin trả lời tối đa cho một câu hỏi (chữ, sticker, truyện, ảnh cộng lại)', 'maxRepliesPerQuestion', 'setMaxReplies', 1, 8, 3),
      h('label', { class: 'f' }, 'Giới hạn ký tự trả lời chung (0 = không giới hạn)', h('input', { type: 'number', min: 0, id: 'setMax', value: st.maxChars, onchange: (e) => set({ maxChars: Math.max(0, Number(e.target.value) || 0) }) })),
      intField('Bot trả lời bot tối đa (tin liên tiếp)', 'maxChain', 'setChain', 1, 5, 2),
      intField('Số tin gần nhất gửi kèm làm ngữ cảnh', 'contextSize', 'setContext', 0, 20, 0),
      h('label', { class: 'f' }, 'Từ cấm: không trả lời câu chứa (mỗi dòng một từ)', ta('setBlocked', 'blockedWords'))),
    h('div', { class: 'sec' }, h('h3', { text: 'Hành vi như người thật' }),
      sw('Tâm trạng theo giờ trong ngày', 'moodEnabled'), sw('Tránh lặp lại câu vừa nói', 'avoidRepeat'),
      h('label', { class: 'f' }, 'Xác suất tự chen vào tin của người khác (%)', h('input', { type: 'number', min: 0, max: 100, id: 'setProChance', value: Math.round(st.proactiveChance * 100), onchange: (e) => set({ proactiveChance: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 }) })),
      num('Tối đa tin tự chen/mở chủ đề mỗi giờ (mỗi tài khoản)', 'proactiveMaxPerHour', 'tin', 'setProMax', 1),
      num('Tiếp tục trò chuyện trong', 'convoWindowMs', 'phút', 'setConvo', 60000),
      sw('Tự mở chủ đề khi phòng chat vắng', 'starterEnabled'), num('Phòng vắng bao lâu thì mở chủ đề', 'starterIdleMs', 'phút', 'setStarterIdle', 60000),
      h('label', { class: 'f' }, 'Từ nhạy cảm: không chen vào, thấy cãi vã thì đứng ngoài (mỗi dòng một từ)', ta('setSensitive', 'sensitiveWords'))),
    h('div', { class: 'sec' }, h('h3', { text: 'Truy cập internet' }),
      h('span', { class: 'hint', text: 'Câu hỏi kiến thức được tra Wikipedia (miễn phí, không tốn lượt Gemini) rồi bot trả lời dựa vào đó; khi có người nhờ xem ảnh thật, bot tìm ảnh Creative Commons trên Openverse (đã lọc nội dung người lớn). Không có tin tức mới nhất vì Google Search của Gemini cần gói trả phí.' }),
      sw('Cho bot tra Wikipedia và tìm ảnh trên mạng', 'webEnabled'),
      num('Tối đa lượt tra Wikipedia mỗi giờ (mỗi tài khoản)', 'webPerHour', 'lượt', 'setWebHour', 1),
      num('Giới hạn số ảnh tìm trên mạng mỗi ngày (mỗi tài khoản)', 'photoPerDay', 'ảnh', 'setPhotoDay', 1), num('Chờ giữa hai lần tìm ảnh', 'photoCooldownMs', 'giây', 'setPhotoCd', 1000)),
    h('div', { class: 'sec' }, h('h3', { text: 'Ảnh AI vẽ' }),
      h('span', { class: 'hint', text: 'Ảnh bot tạo được tải lên bằng chính tài khoản đang chat, không cần khóa nào. Lưu ý: gói miễn phí của Google thường KHÔNG có hạn mức tạo ảnh (key sẽ báo "không có hạn mức miễn phí"), cần bật thanh toán cho dự án của key.' }),
      num('Giới hạn số ảnh tạo mỗi ngày (mỗi tài khoản)', 'imagePerDay', 'ảnh', 'setImgDay', 1), num('Chờ giữa hai lần tạo ảnh', 'imageCooldownMs', 'giây', 'setImgCd', 1000)));
}

// ---------------------------------------------------------------- 4. Lịch và hệ thống
function system(body, mgr, applyTheme) {
  const { st, set } = tools(mgr, applyTheme);
  const sched = () => st.schedule;
  const setSched = (p) => set({ schedule: { ...st.schedule, ...p } });
  const days = h('div', { class: 'chips' });
  const renderDays = () => { days.replaceChildren(...DAYS.map((d, i) => h('button', { class: `chip ${sched().weekdays.includes(i) ? 'on' : ''}`, text: d, onclick: () => {
    const w = sched().weekdays.includes(i) ? sched().weekdays.filter((x) => x !== i) : [...sched().weekdays, i];
    setSched({ weekdays: w.sort() }); renderDays();
  } }))); };
  renderDays();
  body.append(
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
      h('span', { class: 'hint', text: 'Tắt chạy ngầm thì bot dừng khi app ra nền. Nên tắt "tối ưu pin" cho Bot Net trong cài đặt điện thoại để chạy ngầm ổn định.' }),
      h('button', { class: 'btn ghost', id: 'openReport', text: 'Báo cáo hằng ngày', onclick: () => openReport(mgr) }),
      h('button', { class: 'btn danger', id: 'clearAllMemory', text: 'Xóa ghi chú cũ của tất cả tài khoản', onclick: () => { if (confirm('Xóa ghi chú bot đã nhớ về người chat ở TẤT CẢ tài khoản và nạp lại AI từ đầu?')) { mgr.clearAllMemory(); toast('Đã xóa ghi chú cũ của tất cả tài khoản'); } } }),
      h('div', { class: 'grid2' },
        h('button', { class: 'btn ghost', id: 'cfgExport', text: 'Xuất cấu hình', onclick: () => { download('bot-net-cau-hinh.json', mgr.exportConfig(false)); toast('Đã xuất (không kèm mật khẩu và key)'); } }),
        h('button', { class: 'btn ghost', id: 'cfgImport', text: 'Nhập cấu hình', onclick: async () => { const t = await pickTextFile(); if (!t) return; try { await mgr.importConfig(t); applyTheme(); toast('Đã nhập cấu hình, các tài khoản đang tắt'); } catch (e) { toast(e.message); } } }))));
}

const CATS = [
  { id: 'catAppearance', icon: '🎨', title: 'Giao diện', desc: 'Màu nền, hình nền, độ tối, độ mờ khung', build: appearance },
  { id: 'catModels', icon: '🧠', title: 'Model và API key', desc: 'Combo model, kiểm tra key, giới hạn lượt', build: models },
  { id: 'catBehavior', icon: '💬', title: 'Hành vi và tốc độ', desc: 'Delay, giới hạn trả lời, tính cách, ảnh', build: behavior },
  { id: 'catSystem', icon: '⚙', title: 'Lịch và hệ thống', desc: 'Lịch chạy, chạy ngầm, báo cáo, xuất/nhập', build: system },
];

export function openSettings(mgr, applyTheme) {
  openSheet({
    title: 'Cài đặt', side: 'left',
    build(body) {
      for (const c of CATS) {
        body.append(h('button', { class: 'cat', id: c.id, onclick: () => openSheet({ title: c.title, side: 'left', build: (b) => c.build(b, mgr, applyTheme) }) },
          h('span', { class: 'ico', text: c.icon }), h('span', { class: 'cat-t' }, h('b', { text: c.title }), h('small', { text: c.desc })), h('span', { class: 'chev', text: '›' })));
      }
    },
  });
}
