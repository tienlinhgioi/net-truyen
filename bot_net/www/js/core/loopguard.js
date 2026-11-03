// Chống vòng lặp vô tận khi nhiều tài khoản bot chat với nhau.

/** Số tin liên tiếp của các bot, kết thúc tại tin có id [id] (0 nếu tin đó không phải của bot). */
export function botChainLength(list, id, bots) {
  const idx = list.findIndex((m) => m.id === id);
  if (idx < 0) return 0;
  let n = 0;
  for (let i = idx; i >= 0 && bots.has(list[i].user_id, list[i]); i--) n++;
  return n;
}

/** Tin này có được bot trả lời không: người thật luôn được, bot chỉ khi chuỗi bot chưa quá [max]. */
export function allowedToReply(list, id, bots, max = 2) {
  const n = botChainLength(list, id, bots);
  return n === 0 || n <= max;
}
