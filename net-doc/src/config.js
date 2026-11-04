// data.json: link web, tài khoản và các mức delay. Cho phép ghi chú // và /* */ trong file.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const DEFAULT_DELAY = {
  viewWaitMs: 7500,
  betweenChaptersMs: 1500,
  betweenLoopsMs: 60000,
  jitterPercent: 10,
  requestTimeoutMs: 20000,
  retryPageMs: 1500,
  retryLoginMs: 30000,
  reloginEveryMs: 6 * 60 * 60 * 1000,
};

export const DEFAULT_CONFIG = {
  web: 'https://nettruyen15s.com',
  accounts: [{ email: 'ban@example.com', password: 'matkhau', enabled: true }],
  order: 'asc',
  parallel: 3,
  manga: [],
  delay: DEFAULT_DELAY,
};

const PLACEHOLDER = 'ban@example.com';

// Bản mẫu có ghi chú (giữ cùng giá trị với DEFAULT_CONFIG).
const TEMPLATE = `{
  // ====== net-doc: cấu hình ======
  // Dòng bắt đầu bằng // là ghi chú, tool bỏ qua. Sửa xong lưu file rồi chạy lại.
  // Thời gian tính bằng mili giây: 1000 = 1 giây.

  // Link web NetTruyen (đổi sang tên miền khác nếu web đổi).
  "web": "${DEFAULT_CONFIG.web}",

  // Danh sách tài khoản dùng để đọc. Nhiều tài khoản thì chạy song song, mỗi tài khoản đăng nhập riêng.
  //   email, password : tài khoản đăng nhập web
  //   enabled         : true = dùng, false = tạm tắt tài khoản này
  // Muốn thêm tài khoản: copy nguyên một khối { ... }, thêm dấu phẩy giữa các khối.
  // (Mật khẩu lưu chữ thường trong file này, đừng chia sẻ file.)
  "accounts": [
    { "email": "ban@example.com", "password": "matkhau", "enabled": true }
  ],

  // Thứ tự đọc chương:
  //   "asc"    = từ chương đầu lên chương mới nhất
  //   "desc"   = từ chương mới nhất xuống chương đầu
  //   "random" = ngẫu nhiên
  "order": "${DEFAULT_CONFIG.order}",

  // Số chương mỗi tài khoản đọc CÙNG LÚC (mở sẵn chương kế trong lúc chờ chương trước).
  // Lớn hơn = nhanh hơn. 1 = tuần tự từng chương. Gợi ý 2 đến 4; quá cao dễ bị web chặn/lỗi.
  "parallel": ${DEFAULT_CONFIG.parallel},

  // (Tùy chọn) link truyện mặc định, ví dụ ["https://nettruyen15s.com/manga/ten-truyen"].
  // Khi tool hỏi link mà bạn chỉ bấm Enter, tool dùng danh sách này.
  "manga": [],

  // Các mức chờ (mili giây).
  //
  // Mỗi chương diễn ra như sau:
  //   mở trang chương -> chờ viewWaitMs -> gửi lượt đọc
  //   rồi cách betweenChaptersMs thì mở chương kế (không cần chờ chương trước xong nếu parallel > 1)
  //   hết truyện -> nghỉ betweenLoopsMs -> đọc lại từ đầu
  "delay": {
    // Chờ bao lâu SAU KHI mở trang chương rồi mới gửi lượt đọc. Web chỉ tính lượt đọc khi đã đủ 7 giây
    // kể từ lúc mở trang, nên KHÔNG để dưới 7000 (mặc định 7500 là vừa đủ, an toàn).
    "viewWaitMs": ${DEFAULT_DELAY.viewWaitMs},

    // Cách bao lâu thì mở chương kế tiếp. Nhỏ hơn = nhanh hơn (nhưng dễ bị web chặn).
    "betweenChaptersMs": ${DEFAULT_DELAY.betweenChaptersMs},

    // Đọc hết truyện thì nghỉ bao lâu rồi đọc lại từ chương đầu.
    "betweenLoopsMs": ${DEFAULT_DELAY.betweenLoopsMs},

    // Lệch ngẫu nhiên % cho các mức chờ để nhịp không đều như máy. Riêng viewWaitMs chỉ lệch THÊM (không bao giờ ngắn hơn).
    // 0 = tắt lệch.
    "jitterPercent": ${DEFAULT_DELAY.jitterPercent},

    // Mỗi yêu cầu tới web chờ tối đa bao lâu. Mạng chậm/web chậm thì tăng lên (ví dụ 30000).
    "requestTimeoutMs": ${DEFAULT_DELAY.requestTimeoutMs},

    // Tải trang chương bị lỗi/quá thời gian thì chờ bao lâu rồi thử lại (thử lại tối đa 2 lần, sau đó bỏ qua chương).
    "retryPageMs": ${DEFAULT_DELAY.retryPageMs},

    // Đăng nhập thất bại (sai mật khẩu, mất mạng) thì chờ bao lâu rồi thử lại. Thử mãi cho tới khi được.
    "retryLoginMs": ${DEFAULT_DELAY.retryLoginMs},

    // Đăng nhập lại sau mỗi chừng này để phiên không hết hạn khi chạy lâu (21600000 = 6 giờ).
    "reloginEveryMs": ${DEFAULT_DELAY.reloginEveryMs}
  }
}
`;

/** Bỏ ghi chú // và /* *\/ (không đụng tới chuỗi nằm trong dấu nháy kép). */
export function stripComments(text) {
  let out = '', i = 0, inStr = false;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === '"') inStr = false;
      i++;
    } else if (c === '"') { inStr = true; out += c; i++; }
    else if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; }
    else if (c === '/' && n === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; }
    else { out += c; i++; }
  }
  return out;
}

/** Trả về danh sách lỗi (rỗng = hợp lệ). */
export function validateConfig(c) {
  const errs = [];
  if (!/^https?:\/\/\S+/i.test(String(c.web || ''))) errs.push('Chưa điền link web hợp lệ ở "web" (ví dụ https://nettruyen15s.com).');
  const accs = (c.accounts || []).filter((a) => a && a.enabled !== false && a.email && a.email !== PLACEHOLDER && a.password);
  if (!accs.length) errs.push('Chưa có tài khoản nào hợp lệ trong "accounts" (cần email và password, enabled không phải false).');
  if (c.parallel !== undefined && !(Number.isInteger(c.parallel) && c.parallel >= 1)) errs.push('"parallel" phải là số nguyên từ 1 trở lên.');
  if (c.delay && c.delay.viewWaitMs !== undefined && c.delay.viewWaitMs < 7000) errs.push('"viewWaitMs" dưới 7000 thì web không tính lượt đọc. Hãy để từ 7000 trở lên.');
  return errs;
}

/** Đọc data.json. Chưa có thì tạo bản mẫu có ghi chú. Các mục thiếu được lấy mặc định. */
export function loadConfig(file) {
  if (!existsSync(file)) {
    writeFileSync(file, TEMPLATE);
    return { created: true, config: structuredClone(DEFAULT_CONFIG) };
  }
  let raw;
  try { raw = JSON.parse(stripComments(readFileSync(file, 'utf8'))); } catch (e) { throw new Error(`data.json không phải JSON hợp lệ: ${e.message}`); }
  return { created: false, config: { ...DEFAULT_CONFIG, ...raw, delay: { ...DEFAULT_DELAY, ...(raw.delay || {}) } } };
}
