// Báo cáo hằng ngày: số tin, chen ngang, sticker, truyện, ảnh, lỗi.
import { h, openSheet } from './dom.js';

export function openReport(mgr) {
  openSheet({
    title: 'Báo cáo', side: 'right',
    build(body) {
      const rows = mgr.report(7);
      if (!rows.length) { body.append(h('div', { class: 'empty', text: 'Chưa có dữ liệu. Bật tài khoản để bắt đầu thống kê.' })); return; }
      for (const r of rows) {
        body.append(h('div', { class: 'card rep', 'data-day': r.day },
          h('b', { text: r.day }),
          h('div', { class: 'grid2' },
            h('span', { text: `Tin đã gửi: ${r.sent}` }), h('span', { text: `Lỗi: ${r.errors}` }),
            h('span', { text: `Tự chen vào: ${r.proactive}` }), h('span', { text: `Sticker: ${r.stickers}` }),
            h('span', { text: `Truyện: ${r.mangas}` }), h('span', { text: `Ảnh AI vẽ: ${r.images}` }), h('span', { text: `Ảnh tìm trên mạng: ${r.photos}` }))));
      }
      const keys = mgr.accounts.flatMap((a) => a.keys);
      const bad = keys.filter((k) => mgr.keyStatus[k] && mgr.keyStatus[k].state !== 'ok').length;
      body.append(h('p', { class: 'muted', text: `API key: ${keys.length} (đã kiểm tra có vấn đề: ${bad}).` }));
    },
  });
}
