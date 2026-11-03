// Quyết định tin nào cần trả lời: có nhắc tới tài khoản, không phải của mình, không vòng lặp bot.
import { isMentioned, stripTrigger, normalize } from './text.js';
import { allowedToReply } from './loopguard.js';

const IMG = /\[IMG=[^\]\s]+\]/g;
const plain = (m) => String(m.message || '').replace(IMG, '').trim();

export function decideReplies({ messages, account, lastId, bots, maxChain = 2, contextSize = 6 }) {
  const maxId = messages.reduce((a, m) => Math.max(a, m.id), lastId ?? 0);
  if (lastId === null || lastId === undefined) return { tasks: [], lastId: maxId };
  const isOwn = (m) => (account.chatUserId ? m.user_id === account.chatUserId : normalize(m.name) === normalize(account.displayName || account.name));
  const tasks = [];
  messages.forEach((m, i) => {
    if (m.id <= lastId || isOwn(m) || m.manga) return;
    const text = plain(m);
    if (!text || !isMentioned(text, account)) return;
    if (!allowedToReply(messages, m.id, bots, maxChain)) return;
    const context = messages.slice(Math.max(0, i - contextSize), i).map((c) => ({ name: c.name, text: plain(c) })).filter((c) => c.text);
    tasks.push({ id: m.id, from: m.name, question: stripTrigger(text, account) || text, context });
  });
  return { tasks, lastId: maxId };
}
