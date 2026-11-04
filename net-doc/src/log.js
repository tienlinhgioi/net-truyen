// Ghi nhật ký ra màn hình kèm giờ và tên tài khoản.
const t = () => new Date().toLocaleTimeString('vi-VN', { hour12: false });
export const makeLog = (tag) => (msg) => console.log(`[${t()}] ${tag ? `[${tag}] ` : ''}${msg}`);
