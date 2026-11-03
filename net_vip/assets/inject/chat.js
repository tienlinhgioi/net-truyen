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
    var a = document.querySelectorAll('#listMessages a[id^="view-img-btn-"]');
    for (var i = 0; i < a.length; i++) a[i].click();
  }, 800);
}
