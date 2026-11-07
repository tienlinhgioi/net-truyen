#!/usr/bin/env node
// net-doc: tự động đọc truyện NetTruyen, chạy vô hạn. Xem README.md.
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, validateConfig, RANKINGS } from './src/config.js';
import { Site } from './src/site.js';
import { readAccount } from './src/reader.js';
import { slugOf } from './src/parse.js';
import { makeLog } from './src/log.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return undefined; return args.splice(i, 2)[1]; };
const has = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };

if (has('--help') || has('-h')) {
  console.log(`Dùng: node index.js [link truyện ...] [--mode list|random|ranking] [--config data.json] [--loops N | --once]
  --mode list     đọc lần lượt các link (mặc định, hoặc theo "mode" trong data.json)
  --mode random   đọc ngẫu nhiên (trộn các link, hoặc lấy ngẫu nhiên từ web nếu không có link)
  --mode ranking  đọc theo bảng xếp hạng từ hạng 1 xuống (chọn bảng ở "ranking" trong data.json)
  Chế độ list không có link: tool sẽ hỏi link (Enter = dùng "manga" trong data.json).
  --loops N   chỉ đọc N vòng rồi dừng (mặc định chạy vô hạn)
  --once      như --loops 1
  Dừng: Ctrl+C`);
  process.exit(0);
}

const file = resolve(flag('--config') || resolve(here, 'data.json'));
const once = has('--once');
const modeArg = flag('--mode');
const loopsArg = flag('--loops');
const loops = once ? 1 : loopsArg ? Number(loopsArg) : Infinity;
if (!(loops >= 1)) { console.error('--loops phải là số >= 1'); process.exit(1); }

const main = async () => {
  const { config, created } = loadConfig(file);
  if (created) {
    console.log(`Đã tạo file mẫu ${file}.\nHãy mở file, điền "web" và tài khoản trong "accounts", rồi chạy lại.`);
    return;
  }
  if (modeArg) config.mode = modeArg;
  const errs = validateConfig(config);
  if (errs.length) { errs.forEach((e) => console.error('✗ ' + e)); console.error(`Sửa trong ${file} rồi chạy lại.`); process.exit(1); }

  let links = args.filter((a) => !a.startsWith('--'));
  if (config.mode === 'list' && !links.length) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question('Nhập link truyện (nhiều link cách nhau bằng dấu cách, Enter = dùng "manga" trong data.json): ')).trim();
    rl.close();
    links = ans ? ans.split(/\s+/) : (config.manga || []);
  } else if (config.mode === 'random' && !links.length) links = config.manga || [];
  links = links.filter((l) => slugOf(l));
  if (config.mode === 'list' && !links.length) { console.error('✗ Không có link truyện hợp lệ (dạng https://.../manga/ten-truyen).'); process.exit(1); }
  if (config.mode === 'ranking') links = [];

  const accounts = config.accounts.filter((a) => a && a.enabled !== false && a.email && a.password);
  const ac = new AbortController();
  process.on('SIGINT', () => { console.log('\nĐang dừng...'); ac.abort(); });
  process.on('SIGTERM', () => ac.abort());

  const what = config.mode === 'ranking' ? `bảng xếp hạng ${RANKINGS[config.ranking.sort]} (tối đa ${config.ranking.maxStories} truyện)` : config.mode === 'random' ? (links.length ? `${links.length} truyện, thứ tự ngẫu nhiên` : `ngẫu nhiên từ web (${config.ranking.maxStories} truyện mỗi vòng)`) : `${links.length} truyện lần lượt`;
  console.log(`Web: ${config.web} | ${accounts.length} tài khoản | ${what} | ${loops === Infinity ? 'chạy vô hạn' : loops + ' vòng'} (Ctrl+C để dừng)`);
  await Promise.all(accounts.map((account) => readAccount({
    site: new Site({ web: config.web, timeoutMs: config.delay.requestTimeoutMs, signal: ac.signal }),
    account, links, mode: config.mode, ranking: config.ranking, switchRule: config.switch, delay: config.delay, order: config.order, parallel: config.parallel, loops,
    log: makeLog(account.email.split('@')[0]), signal: ac.signal,
  }).catch((e) => makeLog(account.email)(`Dừng do lỗi: ${e.message}`))));
  console.log('Đã dừng.');
};

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
