// Danh sách tài khoản (bên phải) và màn sửa từng tài khoản.
import { h, openSheet, avatarEl, switchEl, toast } from './dom.js';
import { openModelPicker } from './models.js';

export function openAccounts(mgr) {
  openSheet({
    title: 'Tài khoản', side: 'right',
    build(body) {
      const list = h('div', { class: 'sec' });
      const render = () => {
        list.replaceChildren();
        if (!mgr.accounts.length) list.append(h('div', { class: 'empty', text: 'Chưa có tài khoản. Bấm "Thêm tài khoản" bên dưới.' }));
        for (const a of mgr.accounts) {
          list.append(h('div', { class: 'acc', onclick: () => openEditor(mgr, a.id) },
            avatarEl(a),
            h('div', { class: 'meta' }, h('b', { text: a.displayName || a.name || a.email }),
              h('span', { class: 'muted' }, h('i', { class: `dot ${mgr.isRunning(a.id) ? 'on' : ''}` }), mgr.isRunning(a.id) ? 'Đang chạy' : 'Đang tắt', ` · ${a.email}`)),
            switchEl(mgr.isRunning(a.id), (on) => mgr.setEnabled(a.id, on))));
        }
      };
      render();
      const off = mgr.on((t) => { if (t === 'accounts') render(); });
      body.append(list, h('button', { class: 'btn', onclick: () => openAdd(mgr), text: '+ Thêm tài khoản' }));
      body.closest('.sheet').addEventListener('remove', off);
      new MutationObserver((_, o) => { if (!body.isConnected) { off(); o.disconnect(); } }).observe(document.getElementById('sheets'), { childList: true });
    },
  });
}

function openAdd(mgr) {
  openSheet({
    title: 'Thêm tài khoản', side: 'right',
    build(body, close) {
      const email = h('input', { type: 'email', placeholder: 'Email NetTruyen', autocomplete: 'off', id: 'addEmail' });
      const pass = h('input', { type: 'password', placeholder: 'Mật khẩu', autocomplete: 'off', id: 'addPass' });
      const btn = h('button', { class: 'btn', id: 'addGo', text: 'Đăng nhập và thêm' });
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = 'Đang đăng nhập...';
        try { const a = await mgr.addAccount({ email: email.value.trim(), password: pass.value }); toast(`Đã thêm ${a.displayName}`); close(); }
        catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Đăng nhập và thêm'; }
      };
      body.append(h('label', { class: 'f' }, 'Email', email), h('label', { class: 'f' }, 'Mật khẩu', pass), btn,
        h('p', { class: 'muted', text: 'Mật khẩu chỉ lưu trong máy này để tự đăng nhập lại khi mất kết nối.' }));
    },
  });
}

const maskKey = (k) => (k.length > 10 ? `${k.slice(0, 6)}…${k.slice(-4)}` : '••••');

export function openEditor(mgr, id) {
  const a = mgr.account(id);
  if (!a) return;
  openSheet({
    title: a.displayName || a.name || 'Tài khoản', side: 'right',
    build(body, close) {
      const save = (patch) => mgr.updateAccount(id, patch);

      // ---- API key ----
      const keysBox = h('div', { class: 'sec' });
      const keyInput = h('input', { type: 'password', placeholder: 'Dán Gemini API key', id: 'keyInput', autocomplete: 'off' });
      const renderKeys = () => {
        keysBox.replaceChildren();
        a.keys.forEach((k, i) => keysBox.append(h('div', { class: 'keyrow' },
          h('span', { class: `tag ${i ? 'alt' : ''}`, text: i ? `Dự phòng ${i}` : 'Chính' }), h('code', { text: maskKey(k) }),
          h('button', { class: 'link', text: 'Xóa', onclick: () => { save({ keys: a.keys.filter((_, j) => j !== i) }); renderKeys(); } }))));
      };
      renderKeys();
      const addKey = h('button', { class: 'btn', id: 'keyAdd', text: 'Lưu key', onclick: () => {
        const v = keyInput.value.trim();
        if (!v) return toast('Chưa nhập key');
        if (a.keys.includes(v)) return toast('Key này đã có');
        save({ keys: [...a.keys, v] }); keyInput.value = ''; renderKeys();
        toast(a.keys.length === 1 ? 'Đã lưu key chính' : 'Đã thêm key dự phòng');
      } });

      const modelBtn = h('button', { class: 'btn ghost', id: 'modelBtn', text: `Mô hình: ${a.model || mgr.settings.model || 'chưa chọn (bấm để chọn)'}`,
        onclick: () => openModelPicker(mgr, { keys: a.keys, current: a.model || mgr.settings.model, onPick: (m) => { save({ model: m }); modelBtn.textContent = `Mô hình: ${m}`; } }) });

      const field = (label, el) => h('label', { class: 'f' }, label, el);
      const cmd = h('input', { type: 'text', value: a.command, id: 'fCmd', onchange: (e) => save({ command: e.target.value.trim() || '/ai' }) });
      const nm = h('input', { type: 'text', value: a.displayName || a.name, id: 'fName', onchange: (e) => save({ name: e.target.value.trim(), displayName: e.target.value.trim() || a.displayName }) });
      const al = h('input', { type: 'text', value: a.aliases.join(', '), id: 'fAlias', placeholder: 'ví dụ: ly, bé ly, cô ly', onchange: (e) => save({ aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }) });
      const pr = h('textarea', { id: 'fPrompt', placeholder: 'Sơ yếu lý lịch, tính cách, cách xưng hô, sở thích... của tài khoản này', onchange: (e) => save({ prompt: e.target.value }) });
      pr.value = a.prompt;
      const mx = h('input', { type: 'number', min: 0, value: a.maxChars, id: 'fMax', onchange: (e) => save({ maxChars: Math.max(0, Number(e.target.value) || 0) }) });

      // ---- Chat thử ----
      const ans = h('div', { class: 'ans', style: 'display:none' });
      const tin = h('input', { type: 'text', placeholder: 'Nhập câu để thử (không gửi lên web)', id: 'testIn' });
      const tbtn = h('button', { class: 'btn ghost', id: 'testGo', text: 'Chat thử', onclick: async () => {
        if (!tin.value.trim()) return;
        tbtn.disabled = true; ans.style.display = 'block'; ans.textContent = 'Đang nghĩ...';
        try { ans.textContent = (await mgr.testReply(id, tin.value)).text; } catch (e) { ans.textContent = `Lỗi: ${e.message}${e.detail ? ' - ' + e.detail : ''}`; }
        tbtn.disabled = false;
      } });

      const st = a.stats || {};
      body.append(
        h('div', { class: 'row' }, avatarEl(a), h('div', { class: 'meta' }, h('b', { text: a.displayName || a.name }), h('div', { class: 'muted', text: `${a.email} · đã gửi ${st.sent || 0}, lỗi ${st.errors || 0}` })),
          h('span', { style: 'margin-left:auto' }, switchEl(mgr.isRunning(id), (on) => mgr.setEnabled(id, on)))),
        h('div', { class: 'sec' }, h('h3', { text: 'Gemini API' }), keyInput, addKey, keysBox, modelBtn),
        h('div', { class: 'sec' }, h('h3', { text: 'Nhận diện' }),
          field('Lệnh gọi (đặt ở đầu hoặc trong tin nhắn)', cmd), field('Tên gọi', nm), field('Tên gọi khác, ghi chú tìm kiếm thông minh (cách nhau dấu phẩy)', al)),
        h('div', { class: 'sec' }, h('h3', { text: 'Hồ sơ và prompt' }), pr, field('Giới hạn ký tự trả lời (0 = theo cài đặt chung)', mx)),
        h('div', { class: 'sec chat-test' }, h('h3', { text: 'Thử' }), tin, tbtn, ans),
        h('button', { class: 'btn danger', id: 'delAcc', text: 'Xóa tài khoản', onclick: async () => { if (confirm('Xóa tài khoản này khỏi Bot Net?')) { await mgr.removeAccount(id); close(); } } }));
    },
  });
}
