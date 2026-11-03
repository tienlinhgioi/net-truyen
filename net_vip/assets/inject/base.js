// Báo trạng thái đăng nhập (cookie UserID) để các tab đồng bộ; kéo xuống để làm mới.
if (window.NetVip) {
  var m = document.cookie.match(/(?:^|;\s*)UserID=([^;]*)/);
  NetVip.postMessage('auth:' + (m && m[1] ? m[1] : 'out'));
}
if (!window.__nvPtr) {
  window.__nvPtr = 1;
  var y0 = null, d = 0;
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;width:0;background:#d9534f;z-index:2147483647;pointer-events:none';
  document.documentElement.appendChild(bar);
  // Chạm trong vùng tự cuộn (danh sách chat, bảng sticker...) thì đó là cuộn nội dung, không phải kéo làm mới.
  var inScroller = function (el) {
    for (; el && el !== document.body && el.nodeType === 1; el = el.parentElement) {
      if (el.id === 'listMessages') return true;
      var oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return true;
    }
    return false;
  };
  document.addEventListener('touchstart', function (e) {
    y0 = (window.scrollY <= 0 && e.touches.length === 1 && !inScroller(e.target)) ? e.touches[0].clientY : null; d = 0;
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (y0 === null) return;
    d = e.touches[0].clientY - y0;
    if (d <= 0) { y0 = null; bar.style.width = '0'; return; }
    bar.style.width = Math.min(d / 150, 1) * 100 + '%';
  }, { passive: true });
  document.addEventListener('touchend', function () {
    if (y0 !== null && d > 150 && window.NetVip) NetVip.postMessage('refresh');
    y0 = null; d = 0; bar.style.width = '0';
  }, { passive: true });
}
