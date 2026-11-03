// Lớp nối với Android (Capacitor). Chạy được cả trên trình duyệt để thử giao diện.
const cap = () => window.Capacitor;
const plugin = (n) => cap()?.Plugins?.[n];

export const isNative = () => !!cap()?.isNativePlatform?.();

/** HTTP có kho cookie riêng cho từng tài khoản (CapacitorCookies tắt), không bị CORS. */
export async function http({ url, method = 'GET', headers = {}, data, dataType, timeout }) {
  const h = plugin('CapacitorHttp');
  if (h) {
    const isForm = /x-www-form-urlencoded/i.test(headers['Content-Type'] || '');
    const body = isForm && typeof data === 'string' ? Object.fromEntries(new URLSearchParams(data)) : data;
    const t = timeout || 20000;
    const r = await h.request({ url, method, headers, data: body, dataType, responseType: 'json', connectTimeout: t, readTimeout: t });
    return { status: r.status, headers: r.headers || {}, data: r.data };
  }
  const r = await fetch(url, { method, headers, body: typeof data === 'object' ? JSON.stringify(data) : data });
  const text = await r.text();
  let d = text; try { d = JSON.parse(text); } catch { /* giữ nguyên chữ */ }
  return { status: r.status, headers: Object.fromEntries(r.headers), data: d };
}

export const storage = {
  async get(key) {
    const p = plugin('Preferences');
    if (p) return (await p.get({ key })).value;
    return localStorage.getItem(key);
  },
  async set(key, value) {
    const p = plugin('Preferences');
    if (p) return p.set({ key, value });
    localStorage.setItem(key, value);
  },
};

const SPECIAL_USE = 1073741824; // FOREGROUND_SERVICE_TYPE_SPECIAL_USE: không bị giới hạn 6 giờ như dataSync

/** Dịch vụ nền: giữ app chạy khi tắt màn hình. */
export const service = {
  async start(body) {
    const p = plugin('ForegroundService');
    if (!p) return false;
    try {
      const perm = await p.checkPermissions();
      if (perm.display !== 'granted') await p.requestPermissions();
      await p.startForegroundService({ id: 1001, title: 'Bot Net đang chạy', body, smallIcon: 'ic_stat_bot', serviceType: SPECIAL_USE, silent: true });
      return true;
    } catch (e) { console.warn('service.start', e); return false; }
  },
  async update(body) {
    const p = plugin('ForegroundService');
    if (p) try { await p.updateForegroundService({ id: 1001, title: 'Bot Net đang chạy', body, smallIcon: 'ic_stat_bot' }); } catch { /* bỏ qua */ }
  },
  async stop() {
    const p = plugin('ForegroundService');
    if (p) try { await p.stopForegroundService(); } catch { /* bỏ qua */ }
  },
};

export function pickImageAsDataUrl() {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => {
      const f = i.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(shrink(r.result));
      r.readAsDataURL(f);
    };
    i.click();
  });
}

// Thu nhỏ ảnh nền để không làm phình bộ nhớ cấu hình.
function shrink(dataUrl, max = 1280) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
}

export function pickTextFile() {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'application/json,.json';
    i.onchange = async () => resolve(i.files?.[0] ? await i.files[0].text() : null);
    i.click();
  });
}
