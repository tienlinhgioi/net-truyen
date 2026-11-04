# net-doc 1.0.1 – Tự động đọc truyện NetTruyen (Node.js, chạy trên Termux)

Nhập link truyện, tool đọc lần lượt từng chương, hết truyện thì đọc lại từ đầu, **chạy vô hạn** cho tới khi bạn bấm Ctrl+C.
Không kiểm tra lượt đọc có thành công hay không: gửi xong là sang chương kế.
Không cần cài thư viện nào (chỉ cần Node.js ≥ 18.14).

## Cài trên Termux

```bash
pkg update && pkg install nodejs unzip
unzip net-doc_1.zip
cd net-doc
```

## Cấu hình: `data.json`

Chạy lần đầu, nếu chưa có `data.json` tool sẽ tạo file mẫu **có ghi chú giải thích từng mục** (dòng bắt đầu bằng `//` là ghi chú, tool bỏ qua). Mở file (`nano data.json`), điền web và tài khoản rồi chạy lại.

| Trường | Ý nghĩa |
|---|---|
| `web` | Link web, ví dụ `https://nettruyen15s.com` |
| `accounts` | Danh sách tài khoản `{email, password, enabled}`. Nhiều tài khoản chạy song song. `enabled:false` để tạm tắt |
| `order` | Thứ tự đọc: `asc` (từ chương đầu), `desc` (từ chương mới nhất), `random` |
| `parallel` | Số chương mỗi tài khoản đọc cùng lúc (mặc định 3). 1 = tuần tự |
| `manga` | (Tùy chọn) link truyện mặc định, dùng khi bạn bấm Enter lúc được hỏi link |
| `delay.viewWaitMs` | Chờ sau khi **mở** trang chương rồi mới gửi lượt đọc. Web chỉ tính khi đủ 7 giây từ lúc mở trang, nên để từ 7000 trở lên (mặc định 7500) |
| `delay.betweenChaptersMs` | Cách bao lâu thì mở chương kế |
| `delay.betweenLoopsMs` | Nghỉ khi đọc hết truyện, trước khi đọc lại |
| `delay.jitterPercent` | Lệch ngẫu nhiên % cho các mức chờ (riêng `viewWaitMs` chỉ lệch thêm, không ngắn hơn) |
| `delay.requestTimeoutMs` | Mỗi yêu cầu chờ tối đa. Mạng/web chậm thì tăng lên |
| `delay.retryPageMs` | Tải chương lỗi/quá thời gian thì chờ rồi thử lại (tối đa 3 lần, sau đó bỏ qua chương) |
| `delay.retryLoginMs` | Đăng nhập lỗi thì chờ rồi thử lại, thử mãi |
| `delay.reloginEveryMs` | Đăng nhập lại định kỳ |

Mọi mức delay tính bằng mili giây (1000 = 1 giây). Thiếu mục nào thì dùng giá trị mặc định.

> Mật khẩu lưu dạng chữ thường trong `data.json`. Đừng chia sẻ file này.

## Chạy

```bash
node index.js                                   # hỏi link truyện
node index.js https://nettruyen15s.com/manga/ten-truyen
node index.js link1 link2                       # nhiều truyện, đọc lần lượt
node index.js link --loops 3                    # chỉ 3 vòng rồi dừng (mặc định: vô hạn)
node index.js link --once                       # 1 vòng
node index.js link --config /duong/dan/data.json
```

Link có thể là trang truyện hoặc một trang chương (tool tự lấy truyện tương ứng). Dừng bằng **Ctrl+C**.

## Chạy nền trên điện thoại

```bash
termux-wake-lock                                 # giữ máy không ngủ
nohup node index.js https://nettruyen15s.com/manga/ten-truyen > log.txt 2>&1 &
tail -f log.txt                                  # xem nhật ký
pkill -f "node index.js"                         # dừng
```

(Hoặc dùng `tmux`: `pkg install tmux`, `tmux`, chạy lệnh rồi bấm Ctrl+B rồi D để thoát ra mà tool vẫn chạy.)

## Kiểm thử

```bash
npm test
```
