// Nút sticker (bộ emoji của web) trong chat + tự hiện ảnh trong tin nhắn.
if (!window.__nvChat) {
  window.__nvChat = 1;
  var packs = window.__NV_STICKERS || [];
  var tryInit = function () {
    var txt = document.getElementById('txtMessage');
    if (!txt || document.getElementById('btnEmoji') || !packs.length) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'btnEmoji'; btn.className = 'btn btn-warning'; btn.textContent = '😀';
    txt.parentNode.insertBefore(btn, txt);
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
        im.onclick = function () {
          $.post('/ajax/chat/send', { message: '[IMG=' + u + ']', reply_id: null }, function (r) {
            if (r && r.status === false) alert(r.msg || 'Không gửi được');
          });
          panel.classList.remove('open');
        };
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
  };
  setInterval(tryInit, 500);
  setInterval(function () {
    var a = document.querySelectorAll('#listMessages a[id^="view-img-btn-"]');
    for (var i = 0; i < a.length; i++) a[i].click();
  }, 800);
}
