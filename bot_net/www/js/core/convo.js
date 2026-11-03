// Tiếp tục cuộc trò chuyện với từng người và ghi nhớ họ.

export class ConvoTracker {
  constructor({ windowMs = 180000, now = () => Date.now(), maxTurns = 6 } = {}) { this.windowMs = windowMs; this.now = now; this.maxTurns = maxTurns; this.s = new Map(); }
  touch(uid, name, q, a) {
    const e = this.s.get(uid) || { turns: [] };
    e.at = this.now(); e.name = name;
    e.turns.push({ q, a });
    e.turns = e.turns.slice(-this.maxTurns);
    this.s.set(uid, e);
  }
  isActive(uid) { const e = this.s.get(uid); return !!e && this.now() - e.at < this.windowMs; }
  history(uid) { return [...(this.s.get(uid)?.turns || [])]; }
  setWindow(ms) { this.windowMs = ms; }
}

export class UserMemory {
  constructor({ maxNotes = 8 } = {}) { this.maxNotes = maxNotes; this.m = new Map(); }
  static from(obj, opts) { const u = new UserMemory(opts); for (const [k, v] of Object.entries(obj || {})) u.m.set(k, v); return u; }
  add(uid, name, note) {
    const e = this.m.get(uid) || { name, notes: [] };
    e.name = name || e.name;
    const n = String(note || '').trim();
    if (n && !e.notes.includes(n)) e.notes.push(n);
    e.notes = e.notes.slice(-this.maxNotes);
    this.m.set(uid, e);
  }
  get(uid) { return this.m.get(uid) || { name: '', notes: [] }; }
  forget(uid) { this.m.delete(uid); }
  toJSON() { return Object.fromEntries(this.m); }
}
