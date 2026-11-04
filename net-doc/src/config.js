// data.json: link web, tài khoản và các mức delay.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const DEFAULT_DELAY = {
  viewWaitMs: 7500, // chờ sau khi mở chương rồi mới gửi lượt đọc (web chỉ tính sau khoảng 7 giây)
  betweenChaptersMs: 2000, // nghỉ giữa hai chương
  betweenLoopsMs: 60000, // nghỉ khi đọc hết truyện, trước khi đọc lại từ đầu
  jitterPercent: 20, // lệch ngẫu nhiên +- % cho các mức chờ, để không đều như máy
  requestTimeoutMs: 15000, // mỗi yêu cầu chờ tối đa
  retryLoginMs: 30000, // đăng nhập lỗi thì chờ rồi thử lại
  reloginEveryMs: 6 * 60 * 60 * 1000, // đăng nhập lại định kỳ cho phiên không hết hạn
};

export const DEFAULT_CONFIG = {
  web: 'https://nettruyen15s.com',
  accounts: [{ email: 'ban@example.com', password: 'matkhau', enabled: true }],
  order: 'asc', // thứ tự đọc: asc (từ chương đầu), desc (từ chương mới nhất), random (ngẫu nhiên)
  manga: [], // (tùy chọn) link truyện mặc định, dùng khi bạn bấm Enter lúc được hỏi link
  delay: DEFAULT_DELAY,
};

const PLACEHOLDER = 'ban@example.com';

/** Trả về danh sách lỗi (rỗng = hợp lệ). */
export function validateConfig(c) {
  const errs = [];
  if (!/^https?:\/\/\S+/i.test(String(c.web || ''))) errs.push('Chưa điền link web hợp lệ ở "web" (ví dụ https://nettruyen15s.com).');
  const accs = (c.accounts || []).filter((a) => a && a.enabled !== false && a.email && a.email !== PLACEHOLDER && a.password);
  if (!accs.length) errs.push('Chưa có tài khoản nào hợp lệ trong "accounts" (cần email và password, enabled không phải false).');
  return errs;
}

/** Đọc data.json. Chưa có thì tạo bản mẫu. Các mức delay thiếu được lấy mặc định. */
export function loadConfig(file) {
  if (!existsSync(file)) {
    writeFileSync(file, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    return { created: true, config: structuredClone(DEFAULT_CONFIG) };
  }
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`data.json không phải JSON hợp lệ: ${e.message}`); }
  return { created: false, config: { ...DEFAULT_CONFIG, ...raw, delay: { ...DEFAULT_DELAY, ...(raw.delay || {}) } } };
}
