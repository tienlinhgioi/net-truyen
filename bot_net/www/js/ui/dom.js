// Trợ giúp dựng giao diện bằng JavaScript thuần.
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/** Mở một bảng trượt; trả về hàm đóng. */
export function openSheet({ title, side = 'right', full = false, build, onClose }) {
  const root = document.getElementById('sheets');
  const body = h('div', { class: 'body' });
  const close = () => { sheet.remove(); onClose?.(); };
  const sheet = h('div', { class: `sheet ${side === 'left' ? 'left' : ''} ${full ? 'full' : ''}`, onclick: (e) => { if (e.target === sheet) close(); } },
    h('div', { class: 'panel' },
      h('header', {}, h('button', { class: 'back', onclick: close, 'aria-label': 'Đóng' }, '←'), h('h1', { text: title })),
      body));
  root.append(sheet);
  build(body, close);
  return close;
}

export const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(-2).join('').toUpperCase();

export function avatarEl(acc, cls = 'av') {
  if (acc.avatar) return h('img', { class: cls, src: acc.avatar, alt: '' });
  return h('div', { class: cls, text: initials(acc.displayName || acc.name) });
}

export function switchEl(checked, onChange) {
  const i = h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
  return h('span', { class: 'switch', onclick: (e) => e.stopPropagation() }, i, h('i'));
}

export const fmtTime = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
