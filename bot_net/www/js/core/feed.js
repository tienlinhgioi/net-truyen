// Nhiều tài khoản bot cùng một phòng chat: chia sẻ một lần quét thay vì mỗi tài khoản quét riêng (mỗi lần ~36KB, ~0,5 giây).

export class RoomFeed {
  constructor({ now = () => Date.now(), maxAgeMs = 700 } = {}) { this.now = now; this.maxAgeMs = maxAgeMs; this.list = null; this.at = -Infinity; this.inflight = null; }

  /**
   * Trả về danh sách tin mới nhất. Còn mới (< maxAgeMs) thì dùng lại; đang có lần quét dở thì chờ chung.
   * Lần quét chung lỗi thì mỗi bot tự quét bằng phiên của chính nó (không kéo cả nhóm cùng đăng nhập lại).
   */
  async get(fetcher) {
    if (this.list && this.now() - this.at < this.maxAgeMs) return this.list;
    if (this.inflight) return this.inflight.catch(() => fetcher());
    const p = fetcher().then((l) => { this.list = l; this.at = this.now(); return l; });
    this.inflight = p;
    const clear = () => { if (this.inflight === p) this.inflight = null; };
    p.then(clear, clear);
    return p;
  }
}
