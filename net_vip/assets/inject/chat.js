// Nút sticker (bộ emoji của web) trong chat: chọn nhiều sticker, gửi cùng chữ khi bấm Enter.
// Tự hiện ảnh trong tin nhắn.
if (!window.__nvChat) {
  window.__nvChat = 1;
  var packs = window.__NV_STICKERS || [];
  var picked = [];
  var chips = null;

  var renderChips = function () {
    if (!chips) return;
    chips.innerHTML = '';
    picked.forEach(function (u, i) {
      var c = document.createElement('span'); c.className = 'chip';
      var im = document.createElement('img'); im.src = u;
      var x = document.createElement('b'); x.className = 'x'; x.textContent = '×';
      x.onclick = function () { picked.splice(i, 1); renderChips(); };
      c.appendChild(im); c.appendChild(x); chips.appendChild(c);
    });
    chips.style.display = picked.length ? 'flex' : 'none';
  };

  // Web chỉ hiện ảnh đầu tiên của mỗi tin: tin 1 = chữ + sticker đầu, mỗi sticker còn lại 1 tin riêng.
  var sendAll = function (txt) {
    var text = txt.value.trim();
    var msgs = picked.map(function (u, i) {
      return i === 0 && text ? text + ' [IMG=' + u + ']' : '[IMG=' + u + ']';
    });
    var done = 0;
    var next = function () {
      if (done >= msgs.length) { txt.value = ''; picked = []; renderChips(); return; }
      $.post('/ajax/chat/send', { message: msgs[done], reply_id: null }, function (r) {
        if (r && r.status === false) {
          // Giữ lại các sticker chưa gửi được, báo lỗi (ví dụ quá số lượng).
          picked = picked.slice(done); renderChips();
          if (done > 0) txt.value = '';
          alert(r.message || r.msg || 'Không gửi được');
          return;
        }
        done++; next();
      });
    };
    next();
  };

  var tryInit = function () {
    var txt = document.getElementById('txtMessage');
    if (!txt || document.getElementById('btnEmoji') || !packs.length) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'btnEmoji'; btn.className = 'btn btn-warning'; btn.textContent = '😀';
    txt.parentNode.insertBefore(btn, txt);
    chips = document.createElement('div'); chips.id = 'nvChips'; chips.style.display = 'none';
    txt.parentNode.appendChild(chips);
    var panel = document.createElement('div');
    panel.id = 'nvEmoji';
    var tabs = document.createElement('div'); tabs.className = 'tabs';
    var grid = document.createElement('div'); grid.className = 'grid';
    panel.appendChild(tabs); panel.appendChild(grid);
    txt.parentNode.appendChild(panel);
    var show = function (i) {
      Array.prototype.forEach.call(tabs.children, function (t, k) { t.className = k === i ? 'on' : ''; });
      grid.innerHTML = '';
      packs[i].urls.forEach(function (u) {
        var im = document.createElement('img');
        im.src = u; im.loading = 'lazy';
        im.onclick = function () { picked.push(u); renderChips(); };
        grid.appendChild(im);
      });
      grid.scrollTop = 0;
    };
    packs.forEach(function (p, i) {
      var t = document.createElement('img'); t.src = p.urls[0]; t.title = p.name;
      t.onclick = function () { show(i); };
      tabs.appendChild(t);
    });
    show(0);
    btn.onclick = function () { panel.classList.toggle('open'); };
    // Chặn Enter của web khi có sticker chờ gửi (capture, chạy trước jQuery của web).
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target === txt && picked.length) {
        e.preventDefault(); e.stopImmediatePropagation();
        sendAll(txt);
      }
    }, true);
  };
  setInterval(tryInit, 500);
  setInterval(function () {
    // WebView chặn ảnh http trên trang https: đổi sang https.
    var im = document.querySelectorAll('#listMessages img[src^="http:"]');
    for (var j = 0; j < im.length; j++) im[j].src = im[j].src.replace('http:', 'https:');
    // Hiện ảnh trực tiếp, KHÔNG giả lập click: web đóng menu + mỗi khi có click ngoài menu.
    var a = document.querySelectorAll('#listMessages a[id^="view-img-btn-"]');
    for (var i = 0; i < a.length; i++) {
      var im = document.getElementById(a[i].id.replace('view-img-btn-', 'chat-img-'));
      if (im) { im.style.display = 'block'; a[i].style.display = 'none'; }
    }
  }, 800);

  // ===== Giao diện chat toàn màn hình =====
  var nameOf = function (li) { var a = li.querySelector('.info .name'); return a ? a.getAttribute('href') : null; };
  var group = function () {
    var items = document.querySelectorAll('#listMessages > li'), prev = null;
    for (var i = 0; i < items.length; i++) {
      var n = nameOf(items[i]);
      var cont = !!n && n === prev;
      if (cont !== items[i].classList.contains('cont')) items[i].classList.toggle('cont', cont);
      prev = n;
      // Tin chỉ có ảnh/sticker (không có chữ) thì bỏ khung bong bóng.
      var p = items[i].querySelector('p');
      if (p) {
        var txt = '';
        for (var k = 0; k < p.childNodes.length; k++) if (p.childNodes[k].nodeType === 3) txt += p.childNodes[k].nodeValue;
        var only = !txt.trim() && !!p.querySelector('img');
        if (only !== p.classList.contains('imgonly')) p.classList.toggle('imgonly', only);
      }
    }
  };
  var dress = function () {
    var board = document.querySelector('.chat-board'), txt = document.getElementById('txtMessage');
    if (!board || board.getAttribute('data-nv')) return;
    board.setAttribute('data-nv', '1');
    var h = document.createElement('div'); h.id = 'nvChatHeader';
    h.innerHTML = '<div class="ico">💬</div><div><div class="t">Vạn Giới Đàm Đạo</div><div class="s">Đang trực tuyến</div></div>';
    board.insertBefore(h, board.firstChild);
    if (txt) {
      var send = document.createElement('button');
      send.type = 'button'; send.id = 'nvSend'; send.textContent = '➤';
      send.onclick = function () { txt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); };
      txt.parentNode.appendChild(send);
    }
  };
  setInterval(function () {
    dress();
    var list = document.getElementById('listMessages');
    if (!list) return;
    var near = list.scrollHeight - list.scrollTop - list.clientHeight < 140;
    var before = list.children.length;
    group();
    if (near && list.children.length !== window.__nvCount) list.scrollTop = list.scrollHeight;
    window.__nvCount = list.children.length;
  }, 600);
}
