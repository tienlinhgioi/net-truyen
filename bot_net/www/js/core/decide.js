// Quyết định tin nào cần trả lời: được nhắc tên/lệnh, đang trò chuyện dở, hoặc chen ngang ngẫu nhiên.
import { isMentioned, stripTrigger, normalize } from './text.js';
import { allowedToReply } from './loopguard.js';
import { isQuarrel, sensitiveHit } from './persona.js';

const IMG = /\[IMG=[^\]\s]+\]/g;
const plain = (m) => String(m.message || '').replace(IMG, '').trim();

/**
 * @param isActive  (userId) => đang trò chuyện dở với bot không
 * @param proactive {chance, rand, ok, words} chen ngang ngẫu nhiên (ok = còn hạn mức giờ)
 */
export function decideReplies({ messages, account, lastId, bots, maxChain = 2, contextSize = 6, isActive = () => false, proactive = null }) {
  const maxId = messages.reduce((a, m) => Math.max(a, m.id), lastId ?? 0);
  if (lastId === null || lastId === undefined) return { tasks: [], lastId: maxId };
  const isOwn = (m) => (account.chatUserId ? m.user_id === account.chatUserId : normalize(m.name) === normalize(account.displayName || account.name));
  const ctxOf = (i) => messages.slice(Math.max(0, i - contextSize), i).map((c) => ({ name: c.name, text: plain(c) })).filter((c) => c.text);
  const tasks = [];
  let lastHuman = null;
  messages.forEach((m, i) => {
    if (m.id <= lastId || isOwn(m) || m.manga) return;
    const text = plain(m);
    if (!text) return;
    const botMsg = bots.has(m.user_id, m);
    const mentioned = isMentioned(text, account);
    const follow = !mentioned && !botMsg && isActive(m.user_id);
    if (!mentioned && !follow) { if (!botMsg) lastHuman = { m, i, text }; return; }
    if (!allowedToReply(messages, m.id, bots, maxChain)) return;
    tasks.push({ id: m.id, from: m.name, userId: m.user_id, kind: mentioned ? 'mention' : 'followup', question: (mentioned ? stripTrigger(text, account) : text) || text, context: ctxOf(i) });
  });
  if (!tasks.length && proactive?.ok && lastHuman && proactive.chance > 0 && proactive.rand() < proactive.chance) {
    const { m, i, text } = lastHuman;
    const recent = messages.slice(-6);
    if (!sensitiveHit(text, proactive.words || []) && !isQuarrel(recent, proactive.words || [], 3)) {
      tasks.push({ id: m.id, from: m.name, userId: m.user_id, kind: 'proactive', question: text, context: ctxOf(i) });
    }
  }
  return { tasks, lastId: maxId };
}
