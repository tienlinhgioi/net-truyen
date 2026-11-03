// Quyết định tin nào cần trả lời: được nhắc tên/lệnh, đang trò chuyện dở, hoặc chen ngang ngẫu nhiên.
import { isMentioned, stripTrigger, normalize, squashMsg } from './text.js';
import { allowedToReply } from './loopguard.js';
import { isQuarrel, sensitiveHit } from './persona.js';

const IMG = /\[IMG=[^\]\s]+\]/g;
const plain = (m) => String(m.message || '').replace(IMG, '').trim();

/**
 * @param isActive  (userId) => đang trò chuyện dở với bot không
 * @param proactive {chance, rand, ok, words} chen ngang ngẫu nhiên (ok = còn hạn mức giờ)
 */
export function decideReplies({ messages, account, lastId, bots, maxChain = 2, contextSize = 6, isActive = () => false, proactive = null, ownNames = [], sentTexts = new Set(), coordinator = null }) {
  const maxId = messages.reduce((a, m) => Math.max(a, m.id), lastId ?? 0);
  if (lastId === null || lastId === undefined) return { tasks: [], lastId: maxId };
  const mine = new Set([account.displayName, account.name, ...ownNames].map(normalize).filter(Boolean));
  // Là tin của mình nếu: đúng user_id; hoặc (chưa biết user_id) trùng một trong các tên của mình; hoặc trùng chữ với tin mình vừa gửi (web có thể đổi chữ/tên hiển thị).
  const isOwn = (m) => (account.chatUserId ? m.user_id === account.chatUserId : mine.has(normalize(m.name))) || sentTexts.has(squashMsg(m.message));
  const selfLabel = `Bạn (${account.displayName || account.name})`;
  const ctxOf = (i) => messages.slice(Math.max(0, i - contextSize), i).map((c) => ({ name: isOwn(c) ? selfLabel : c.name, text: plain(c) })).filter((c) => c.text);
  const tasks = [];
  let lastHuman = null;
  messages.forEach((m, i) => {
    if (m.id <= lastId || isOwn(m) || m.manga) return;
    const text = plain(m);
    if (!text) return;
    const botMsg = bots.has(m.user_id, m);
    // Nhiều tài khoản cùng phòng: lệnh chung /ai chỉ một tài khoản trả lời, gọi đích danh thì đúng tài khoản đó
    const mentioned = isMentioned(text, account) && (!coordinator?.allowed || coordinator.allowed(m));
    const follow = !mentioned && !botMsg && isActive(m.user_id) && (!coordinator?.claim || coordinator.claim(m.id));
    const addressedElsewhere = !mentioned && coordinator?.addressed?.(m);
    if (!mentioned && !follow) { if (!botMsg && !addressedElsewhere) lastHuman = { m, i, text }; return; }
    if (!allowedToReply(messages, m.id, bots, maxChain)) return;
    tasks.push({ id: m.id, from: m.name, userId: m.user_id, fromBot: botMsg, kind: mentioned ? 'mention' : 'followup', question: (mentioned ? stripTrigger(text, account) : text) || text, context: ctxOf(i) });
  });
  if (!tasks.length && proactive?.ok && lastHuman && proactive.chance > 0 && proactive.rand() < proactive.chance) {
    const { m, i, text } = lastHuman;
    const recent = messages.slice(-6);
    if (!sensitiveHit(text, proactive.words || []) && !isQuarrel(recent, proactive.words || [], 3) && (!coordinator?.claim || coordinator.claim(m.id))) {
      tasks.push({ id: m.id, from: m.name, userId: m.user_id, fromBot: false, kind: 'proactive', question: text, context: ctxOf(i) });
    }
  }
  return { tasks, lastId: maxId };
}
