// Nhiều tài khoản cùng một phòng chat: ai trả lời tin nào, để các tài khoản không dẫm lên nhau.
import { isMentioned } from './text.js';

/** Tin này gọi tài khoản theo tên/biệt danh ('name'), chỉ theo lệnh chung như /ai ('command'), hay không gọi ('null'). */
export function mentionKind(text, acc) {
  if (isMentioned(text, { ...acc, command: '' })) return 'name';
  if (acc.command && isMentioned(text, { ...acc, name: '', aliases: [] })) return 'command';
  return null;
}

/**
 * Những tài khoản được phép trả lời một tin: gọi đích danh thì đúng các tài khoản được gọi;
 * chỉ có lệnh chung (mọi tài khoản đều mặc định /ai) thì CHỈ MỘT tài khoản (tài khoản đầu tiên) trả lời.
 */
export function routeMention(text, accounts) {
  const kinds = accounts.map((a) => [a.id, mentionKind(text, a)]);
  const named = kinds.filter(([, k]) => k === 'name').map(([id]) => id);
  if (named.length) return named;
  const cmd = kinds.find(([, k]) => k === 'command');
  return cmd ? [cmd[0]] : [];
}

/** Mỗi tin chỉ một tài khoản giữ quyền trả lời (cho tin chen ngang và tiếp tục trò chuyện). */
export class ClaimBoard {
  constructor(max = 500) { this.max = max; this.map = new Map(); }
  claim(msgId, owner) {
    const cur = this.map.get(msgId);
    if (cur !== undefined) return cur === owner;
    this.map.set(msgId, owner);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return true;
  }
}
