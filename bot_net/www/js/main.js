import { http, storage, service, isNative } from './platform.js';
import { Manager } from './manager.js';
import { h, avatarEl, fmtTime, initials } from './ui/dom.js';
import { openAccounts } from './ui/accounts.js';
import { openSettings } from './ui/settings.js';
import { openReport } from './ui/report.js';

const mock = window.__BOTNET_TEST__; // dùng khi chạy test giao diện
const mgr = await new Manager({
  adapter: mock?.adapter || storage, http: mock?.http || http, service: mock ? (mock.service || null) : (isNative() ? service : null), sleep: mock?.sleep, loadStickers: mock?.stickers || (() => fetch('data/stickers.json').then((r) => r.json())),
}).init();
window.__mgr = mgr;

function applyTheme() {
  const s = mgr.settings, r = document.documentElement.style;
  r.setProperty('--bg', s.bg); r.setProperty('--accent', s.accent); r.setProperty('--dim', s.wallpaperDim);
  r.setProperty('--pa', s.panelAlpha); r.setProperty('--blur', `${s.wallpaperBlur}px`);
  const wall = document.getElementById('wall');
  wall.style.backgroundImage = s.wallpaper ? `url(${s.wallpaper})` : '';
  document.body.classList.toggle('has-wall', !!s.wallpaper);
  document.querySelector('meta[name=theme-color]').content = s.bg;
}

function renderStage() {
  const stage = document.getElementById('stage');
  const run = mgr.runningAccounts();
  stage.replaceChildren();
  if (!run.length) stage.append(h('div', { class: 'empty', text: 'Chưa có tài khoản nào chạy. Mở quản lý tài khoản (góc phải) và bật một tài khoản.' }));
  for (const a of run) {
    const ring = h('div', { class: 'ring', 'data-id': a.id }, a.avatar ? h('img', { src: a.avatar, alt: '' }) : h('div', { class: 'ph', text: initials(a.displayName || a.name) }));
    stage.append(h('div', { class: 'bubble' }, ring, h('div', { class: 'nm', text: a.displayName || a.name }), h('div', { class: 'st', text: `Đã gửi ${a.stats?.sent || 0}` })));
  }
  const pause = document.getElementById('btnPause');
  pause.textContent = run.length ? '⏸ Dừng tất cả' : (mgr.paused.length ? '▶ Bật lại' : '⏸ Dừng tất cả');
  pause.disabled = !run.length && !mgr.paused.length;
  document.getElementById('runInfo').textContent = run.length ? `${run.length} tài khoản đang chạy` : 'Chưa có tài khoản chạy';
  const first = run[0] || mgr.accounts[0];
  const who = document.getElementById('btnAccounts');
  who.classList.toggle('has-img', !!first?.avatar); who.classList.toggle('no-img', !first?.avatar);
  document.getElementById('whoImg').src = first?.avatar || '';
  document.getElementById('whoName').textContent = first ? (first.displayName || first.name).split(' ').slice(-1)[0] : 'TK';
}

// Nhật ký riêng từng tài khoản: chọn "Tất cả" hoặc một tài khoản để xem
let logSel = null;
const logLi = (e, withName) => {
  const acc = mgr.account(e.acc);
  return h('li', { class: e.level, 'data-acc': e.acc || '' }, h('small', { text: `${fmtTime(e.t)}${withName ? ` · ${acc?.displayName || acc?.name || ''}` : ''}` }), e.text);
};

function renderLog() {
  const ul = document.getElementById('log');
  ul.replaceChildren(...mgr.logsOf(logSel).slice(-120).map((e) => logLi(e, !logSel)));
  ul.scrollTop = ul.scrollHeight;
}

function renderLogTabs() {
  const tabs = document.getElementById('logTabs');
  if (logSel && !mgr.account(logSel)) logSel = null;
  const chip = (id, label) => h('button', { class: `chip ${(logSel || '') === id ? 'on' : ''}`, 'data-acc': id, role: 'tab', text: label, onclick: () => { logSel = id || null; renderLogTabs(); renderLog(); } });
  tabs.replaceChildren(chip('', 'Tất cả'), ...mgr.accounts.map((a) => chip(a.id, a.displayName || a.name || a.email)));
  tabs.style.display = mgr.accounts.length > 1 ? 'flex' : 'none';
}

function addLog(e) {
  if (!e) { renderLog(); return; }
  if (logSel && e.acc !== logSel) return;
  const ul = document.getElementById('log');
  ul.append(logLi(e, !logSel));
  while (ul.children.length > 120) ul.firstChild.remove();
  ul.scrollTop = ul.scrollHeight;
}

mgr.on((type, data) => {
  if (type === 'log') {
    addLog(data);
    const ring = document.querySelector(`.ring[data-id="${data?.acc}"]`);
    if (ring && /Đã trả lời/.test(data.text)) { ring.classList.add('busy'); setTimeout(() => ring.classList.remove('busy'), 1500); }
  } else if (type === 'accounts' || type === 'account') { renderStage(); renderLogTabs(); }
});

document.getElementById('btnSettings').onclick = () => openSettings(mgr, applyTheme);
document.getElementById('btnAccounts').onclick = () => openAccounts(mgr);
document.getElementById('btnReport').onclick = () => openReport(mgr);
document.getElementById('btnPause').onclick = () => { if (mgr.runningAccounts().length) { mgr.pauseAll(); } else { mgr.resumeAll(); } renderStage(); };
document.getElementById('btnClearLog').onclick = () => mgr.clearLogs(logSel);
applyTheme(); renderStage(); renderLogTabs(); renderLog(); 

// Lưu ngay khi app bị ẩn/đóng để không mất thay đổi.
addEventListener('pagehide', () => mgr.saveNow());
document.addEventListener('visibilitychange', () => { if (document.hidden) mgr.saveNow(); mgr.setForeground(!document.hidden); });
