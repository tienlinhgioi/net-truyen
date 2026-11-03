// Lịch chạy: khung giờ trong ngày (kể cả qua nửa đêm), thứ trong tuần, khoảng ngày-tháng-năm.

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Tại thời điểm [now] bot có được chạy không. Không bật lịch thì luôn chạy. */
export function isActive(now, s) {
  if (!s || !s.enabled) return true;
  if (Array.isArray(s.weekdays) && s.weekdays.length && !s.weekdays.includes(now.getDay())) return false;
  const day = dateKey(now);
  if (s.dateFrom && day < s.dateFrom) return false;
  if (s.dateTo && day > s.dateTo) return false;
  if (s.from && s.to) {
    const m = now.getHours() * 60 + now.getMinutes();
    const a = toMin(s.from), b = toMin(s.to);
    if (a <= b ? !(m >= a && m < b) : !(m >= a || m < b)) return false;
  }
  return true;
}
