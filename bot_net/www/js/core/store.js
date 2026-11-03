// Dữ liệu cấu hình: giá trị mặc định, lưu/khôi phục, xuất/nhập.

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function defaultSettings() {
  return {
    bg: '#0b1020', accent: '#2d6bff', wallpaper: null, wallpaperDim: 0.55,
    chatDelayMs: 2000, keyDelayMs: 1000, reconnectDelayMs: 10000, pollMs: 1500,
    typingPerCharMs: 40, typingMinMs: 800, typingMaxMs: 4000,
    proactiveChance: 0.15, proactiveMaxPerHour: 6, convoWindowMs: 180000, starterEnabled: false, starterIdleMs: 20 * 60 * 1000,
    imagePerDay: 5, imageCooldownMs: 60000, moodEnabled: true, avoidRepeat: true,
    sensitiveWords: ['đm', 'địt', 'cặc', 'lồn', 'vcl', 'đéo', 'mẹ mày', 'óc chó', 'cút đi'],
    maxChars: 200, maxChain: 2, contextSize: 6, model: '', blockedWords: [],
    runInBackground: true, profileRefreshMs: 30 * 60 * 1000, wallpaperBlur: 0, panelAlpha: 0.07,
    combo: { text: [], image: [], vision: [] },
    schedule: { enabled: false, from: '08:00', to: '22:00', weekdays: [0, 1, 2, 3, 4, 5, 6], dateFrom: '', dateTo: '' },
  };
}

export function defaultAccount() {
  return {
    id: uid(), email: '', password: '', name: '', displayName: '', avatar: '',
    enabled: false, command: '/ai', aliases: [], keys: [], model: '', combo: { text: [], image: [], vision: [] }, prompt: '', maxChars: 0, proactive: true, stickerPacks: [],
    chatUserId: null, cookies: {}, stats: { sent: 0, errors: 0, lastAt: 0, days: {} },
  };
}

/** Lưu bằng bộ nhớ trừu tượng {get(key), set(key, value)} (Capacitor Preferences hoặc localStorage). */
export class Store {
  constructor(adapter) { this.adapter = adapter; this.settings = defaultSettings(); this.accounts = []; this.usage = {}; this.memory = {}; }

  async load() {
    const raw = await this.adapter.get('botnet');
    if (raw) {
      const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
      this.settings = { ...defaultSettings(), ...d.settings, schedule: { ...defaultSettings().schedule, ...(d.settings?.schedule || {}) } };
      this.accounts = (d.accounts || []).map((a) => ({ ...defaultAccount(), ...a }));
      this.usage = d.usage || {};
      this.memory = d.memory || {};
    }
    return this;
  }

  async save() { await this.adapter.set('botnet', JSON.stringify({ settings: this.settings, accounts: this.accounts })); }

  /** Xuất cấu hình; mặc định KHÔNG kèm mật khẩu, cookie và API key. */
  exportAll({ secrets = false } = {}) {
    const accounts = this.accounts.map((a) => (secrets ? { ...a } : { ...a, password: '', keys: [], cookies: {} }));
    return JSON.stringify({ app: 'bot-net', version: 1, settings: { ...this.settings }, accounts }, null, 2);
  }

  importAll(text) {
    const d = JSON.parse(text);
    if (d.app !== 'bot-net') throw new Error('Không phải tệp cấu hình Bot Net');
    this.settings = { ...defaultSettings(), ...d.settings, schedule: { ...defaultSettings().schedule, ...(d.settings?.schedule || {}) } };
    this.accounts = (d.accounts || []).map((a) => ({ ...defaultAccount(), ...a, enabled: false }));
  }
}
