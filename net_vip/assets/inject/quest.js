// Tự làm nhiệm vụ linh thạch (ngày, tuần, tất cả = + điểm danh + vòng quay miễn phí).
(function () {
  if (window.__nvq) return;
  window.__nvq = 1;
  var DEF = {
    daily: false, weekly: false, all: false,
    comments: ['Truyện hay quá, cảm ơn nhóm dịch', 'Chương này cuốn thật sự', 'Mong tác giả ra chương mới sớm', 'Cốt truyện càng ngày càng hấp dẫn', 'Nét vẽ đẹp quá, ủng hộ truyện'],
    fcomments: ['Bài viết hay, cảm ơn bạn đã chia sẻ', 'Mình cũng nghĩ giống bạn đó', 'Cảm ơn thông tin hữu ích nhé', 'Đồng ý với ý kiến của bạn'],
    posts: ['Chia sẻ truyện hay đang đọc | Dạo này mình đang đọc khá nhiều truyện mới, bạn nào có bộ nào hay thì giới thiệu giúp mình với nhé. Mình thích thể loại hành động, phiêu lưu và có cốt truyện chặt chẽ, nhân vật chính phát triển dần theo thời gian.'],
    day: {}
  };
  var load = function () {
    var s = {};
    try { s = JSON.parse(localStorage.getItem('nvq') || '{}'); } catch (e) {}
    var o = {}; for (var k in DEF) o[k] = (s[k] !== undefined ? s[k] : DEF[k]);
    return o;
  };
  var save = function (s) { try { localStorage.setItem('nvq', JSON.stringify(s)); } catch (e) {} };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, window.__NVQ_FAST ? 0 : ms); }); };
  var jitter = function (ms) { return ms + Math.floor(Math.random() * 3000); };
  var ajax = function (o) { return new Promise(function (res, rej) { $.ajax(o).done(res).fail(function () { rej(new Error('Lỗi kết nối ' + o.url)); }); }); };
  var getText = function (u) { return ajax({ url: u, type: 'GET', dataType: 'text' }); };
  var getJson = function (u) { return ajax({ url: u, type: 'GET', dataType: 'json' }); };
  var post = function (u, d) { return ajax({ url: u, type: 'POST', data: d, dataType: 'json' }); };
  var status = function (t) { var el = document.getElementById('nvqStatus'); if (el) el.textContent = t; };
  var pick = function (arr, last) {
    var a = arr.filter(function (x) { return x && x.trim().length >= 10; });
    if (!a.length) throw new Error('Danh sách câu bình luận trống hoặc dưới 10 ký tự');
    var c = a.filter(function (x) { return x !== last.v; }); if (!c.length) c = a;
    last.v = c[Math.floor(Math.random() * c.length)]; return last.v;
  };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  var weekKey = function () { var d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return 'w' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  var uniq = function (a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); };
  var matches = function (t, re) { var m, out = []; while ((m = re.exec(t))) out.push(m[1]); return out; };
  var escapeHtml = function (t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var lastC = { v: null }, lastF = { v: null };
  var manga = null, ownPost = null;

  var pickManga = async function () {
    if (manga) return manga;
    status('Đang chọn truyện mới có hơn 10 chương...');
    var slugs = uniq(matches(await getText('/danh-sach-truyen/1?sort=latest-updated'), /href="\/manga\/([a-z0-9-]+)"/g)).slice(0, 12);
    for (var i = 0; i < slugs.length; i++) {
      var html = await getText('/manga/' + slugs[i]);
      var nums = uniq(matches(html, new RegExp('/manga/' + slugs[i] + '/chapter-(\\d+)', 'g'))).map(Number).sort(function (a, b) { return b - a; });
      var id = /MANGA_ID\s*=\s*(\d+)/.exec(html);
      if (nums.length > 10 && id) { manga = { slug: slugs[i], id: id[1], chapters: nums }; return manga; }
    }
    throw new Error('Không tìm được truyện nào có hơn 10 chương');
  };

  var doRead = async function (need) {
    var m = await pickManga(), counted = 0;
    for (var i = 0; i < m.chapters.length && counted < need; i++) {
      status('Đọc chương ' + (counted + 1) + '/' + need + '...');
      var url = '/manga/' + m.slug + '/chapter-' + m.chapters[i];
      var html = await getText(url);
      var mid = /MANGA_ID\s*=\s*(\d+)/.exec(html), cid = /CHAPTER_ID\s*=\s*(\d+)/.exec(html);
      if (!mid || !cid) throw new Error('Không đọc được mã chương');
      await sleep(7500); // web chỉ tính lượt đọc sau 7 giây
      // Server chặn ("invalid request") nếu Referer không phải trang chương.
      var r = await fetch('/ajax/manga/view', {
        method: 'POST', credentials: 'same-origin', referrer: location.origin + url, referrerPolicy: 'unsafe-url',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: 'manga=' + mid[1] + '&chapter=' + cid[1]
      });
      var j = await r.json();
      if (!j || j.status === false) throw new Error((j && j.message) || 'Không tính được lượt đọc');
      if (j.counted !== false) counted++; // chương đã đọc trước đó thì đọc tiếp chương khác
    }
    if (counted < need) throw new Error('Không đủ chương mới để đọc (' + counted + '/' + need + ')');
  };

  var doComment = async function (need, s) {
    var m = await pickManga();
    for (var i = 0; i < need; i++) {
      status('Bình luận truyện ' + (i + 1) + '/' + need + '...');
      var r = await post('/ajax/comment/add', { manga_id: m.id, chapter_id: '', parent_id: '', mention_id: null, content: pick(s.comments, lastC), is_spoil: 0 });
      if (!r || r.status === false) throw new Error((r && r.msg) || 'Không bình luận được');
      await sleep(jitter(7000));
    }
  };

  var doPost = async function (s) {
    var line = s.posts[Math.floor(Math.random() * s.posts.length)] || '';
    var i = line.indexOf('|'), title = (i < 0 ? '' : line.slice(0, i)).trim(), body = (i < 0 ? '' : line.slice(i + 1)).trim();
    if (title.length < 5 || body.length < 100) throw new Error('Bài đăng cần "tiêu đề | nội dung" (tiêu đề ≥5, nội dung ≥100 ký tự)');
    status('Đang đăng bài diễn đàn...');
    var r = await post('/forum/new-post', { title: title, category_id: 2, comic_id: '', content: '<p>' + escapeHtml(body) + '</p>' });
    if (!r || !r.status) throw new Error((r && r.message) || 'Không đăng được bài');
    var m = /-(\d+)$/.exec(r.redirect || ''); if (m) ownPost = m[1];
  };

  var doForumComment = async function (need, s) {
    var ids = uniq(matches(await getText('/forum'), /\/forum\/post\/[a-z0-9-]*?-(\d+)/g)).filter(function (x) { return x !== ownPost; }).slice(0, need);
    for (var i = 0; i < ids.length; i++) {
      status('Bình luận bài diễn đàn ' + (i + 1) + '/' + need + '...');
      var r = await post('/ajax/forum/comment', { post_id: ids[i], content: pick(s.fcomments, lastF), parent_id: null });
      if (!r || !r.status) throw new Error((r && (r.message || r.messsage)) || 'Không bình luận được bài');
      await sleep(jitter(7000));
    }
  };

  var run = async function () {
    if (window.__nvqRunning) return;
    var s = load();
    if (!s.daily && !s.weekly && !s.all) { window.__nvqDone = true; status('Đang tắt'); return; }
    window.__nvqRunning = true; window.__nvqDone = false;
    var btn = document.getElementById('nvqBtn'); if (btn) btn.className = 'run';
    try {
      if (s.all) {
        if (s.day.checkin !== today()) { status('Đang điểm danh...'); await post('/ajax/user/daily'); s.day.checkin = today(); save(s); }
        var had = document.getElementById('hadSpin');
        // Hết lượt miễn phí thì tuyệt đối không quay (mất 200 linh thạch).
        if (had && had.value === 'false' && s.day.spin !== today()) { status('Đang quay miễn phí...'); await getJson('/ajax/user/spin'); s.day.spin = today(); save(s); }
      }
      var wantD = s.daily || s.all, wantW = s.weekly || s.all;
      var data = (await getJson('/ajax/user/mission')).data || {};
      var list = [];
      if (wantD) (data.daily || []).forEach(function (x) { list.push([x, today()]); });
      if (wantW) (data.weekly || []).forEach(function (x) { list.push([x, weekKey()]); });
      for (var i = 0; i < list.length; i++) {
        var mi = list[i][0], key = list[i][1] + mi.id;
        var pr = String(mi.progress || '0/1').split('/'), need = Number(pr[1]) - Number(pr[0]);
        var t = mi.text || '';
        if (need > 0) {
          if (/bình luận.*bài viết/i.test(t)) await doForumComment(need, s);
          else if (/bình luận/i.test(t)) await doComment(need, s);
          else if (/đăng.*bài/i.test(t)) await doPost(s);
          else if (/đọc.*chương/i.test(t)) await doRead(need);
          else continue; // nhiệm vụ lạ: bỏ qua
        }
        if (!s.day[key]) {
          status('Nhận thưởng: ' + t);
          await post('/ajax/user/missionReward', { mission: mi.id });
          s.day[key] = 1; save(s);
        }
      }
      status('Xong. Tải lại trang để xem kết quả.');
    } catch (e) {
      status('Dừng: ' + e.message);
    } finally {
      window.__nvqRunning = false; window.__nvqDone = true;
      if (btn) btn.className = '';
    }
  };

  var build = function () {
    if (document.getElementById('nvqBtn')) return;
    var s = load();
    var btn = document.createElement('button'); btn.id = 'nvqBtn'; btn.type = 'button'; btn.textContent = '⚡';
    var panel = document.createElement('div'); panel.id = 'nvqPanel';
    panel.innerHTML = '<h4>Tự làm nhiệm vụ</h4>' +
      '<label class="sw">Nhiệm vụ ngày<input type="checkbox" data-k="daily"></label>' +
      '<label class="sw">Nhiệm vụ tuần<input type="checkbox" data-k="weekly"></label>' +
      '<label class="sw">Tất cả (+ điểm danh, quay miễn phí)<input type="checkbox" data-k="all"></label>' +
      '<div id="nvqStatus"></div>' +
      '<details><summary>Câu bình luận truyện</summary><textarea data-l="comments"></textarea><small>Mỗi câu một dòng, từ 10 ký tự.</small></details>' +
      '<details><summary>Câu bình luận diễn đàn</summary><textarea data-l="fcomments"></textarea><small>Mỗi câu một dòng, từ 10 ký tự.</small></details>' +
      '<details><summary>Bài đăng diễn đàn</summary><textarea data-l="posts"></textarea><small>Mỗi bài một dòng: tiêu đề | nội dung (≥100 ký tự).</small></details>';
    document.body.appendChild(panel); document.body.appendChild(btn);
    btn.onclick = function () { panel.classList.toggle('open'); };
    Array.prototype.forEach.call(panel.querySelectorAll('input[data-k]'), function (c) {
      c.checked = !!s[c.getAttribute('data-k')];
      c.onchange = function () { var n = load(); n[c.getAttribute('data-k')] = c.checked; save(n); if (c.checked) run(); };
    });
    Array.prototype.forEach.call(panel.querySelectorAll('textarea[data-l]'), function (t) {
      t.value = s[t.getAttribute('data-l')].join('\n');
      t.onchange = function () { var n = load(); n[t.getAttribute('data-l')] = t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); save(n); };
    });
  };
  build();
  setTimeout(run, window.__NVQ_FAST ? 0 : 1500);
})();
