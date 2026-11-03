# Net Vip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use phat-trien-bang-subagent (recommended) or thuc-thi-ke-hoach to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Android "Net Vip" (Flutter) bọc web nettruyen15s.com bằng WebView, có vỏ native đẹp (thanh điều hướng dưới, splash, màn lỗi), chèn CSS/JS để tinh chỉnh giao diện và thêm 3 tính năng của bản 1.2.

**Architecture:** Một Flutter app, mỗi tab ở thanh dưới giữ một `WebViewController` riêng (IndexedStack, không tải lại). Lớp `UrlPolicy` quyết định link nào mở trong app, link nào mở ngoài. Lớp `Injector` sinh CSS/JS chèn sau mỗi lần tải trang. Không có server riêng; đăng nhập/chat/nhiệm vụ do web xử lý, cookie do WebView giữ.

**Tech Stack:** Flutter stable, `webview_flutter` + `webview_flutter_android`, `url_launcher`, `connectivity_plus`, GitHub Actions để build APK (môi trường này chưa cài Flutter).

**Spec:** Chưa có file design riêng. Quyết định chốt trong hội thoại: lấy dữ liệu từ web (phương án B: WebView, UI native đẹp hơn); tên app **Net Vip**; UI theo app NetTruyen; làm đủ chức năng như app gốc nhờ web; kèm 3 mục "1.2" (emoji trong chat, nhiệm vụ thay quảng cáo, tin nhắn của mình hiển thị đầy đủ).

## Global Constraints

- Tên hiển thị `Net Vip`, applicationId `com.netvip.app`, phiên bản bắt đầu `1.0.0+1`, mỗi lần sửa đổi tăng 1 số.
- Domain gốc `https://nettruyen15s.com` đặt ở một hằng số duy nhất `kBaseUrl`.
- Chỉ Android (arm64-v8a trở lên), minSdk 24.
- Giao diện tối, dùng màu lấy từ CSS của web (không tự bịa màu).
- Không sửa logic web; mọi tinh chỉnh chỉ bằng CSS/JS chèn thêm, lỗi chèn không được làm hỏng trang.
- Nhánh làm việc: `main` (theo yêu cầu người dùng).
- Không tự thêm tính năng ngoài danh sách; mơ hồ thì hỏi.

## Review Focus

- Mất mạng hoặc web lỗi 5xx: hiện màn lỗi có nút "Thử lại", không trắng trang.
- Cloudflare hiện trang kiểm tra: WebView phải cho qua, không bị chặn bởi script chèn.
- Nút Back ở trang gốc của tab: thoát hoặc về tab Trang chủ, không đóng app đột ngột khi còn lịch sử.
- Link ra ngoài (Facebook, quảng cáo): mở trình duyệt ngoài, không nằm trong WebView.
- Chat gửi ảnh: cần chọn file trong WebView (`onShowFileSelector`), nếu thiếu sẽ không gửi được.
- Selector trên web đổi: script chèn phải bỏ qua khi không tìm thấy phần tử, không ném lỗi.

---

### Task 1: Dựng khung dự án

**Files:**
- Create: `net_vip/` (bằng `flutter create`), `net_vip/lib/main.dart`, `net_vip/lib/config.dart`
- Modify: `net_vip/pubspec.yaml`, `net_vip/android/app/build.gradle`, `AndroidManifest.xml` (quyền INTERNET, label `Net Vip`, applicationId `com.netvip.app`)
- Test: `net_vip/test/app_test.dart`

**Interfaces:**
- Produces: `const String kBaseUrl = 'https://nettruyen15s.com'` trong `config.dart`; `class NetVipApp extends StatelessWidget`.

- [ ] **Step 1:** Viết test `app khởi động hiển thị tiêu đề Net Vip` (pumpWidget `NetVipApp`, expect `find.text('Net Vip')` có mặt ở splash).
- [ ] **Step 2:** Chạy `flutter test`, expect FAIL (chưa có `NetVipApp`).
- [ ] **Step 3:** Chạy `flutter create --org com.netvip --project-name net_vip net_vip`, thêm dependency, cấu hình label/applicationId/minSdk, viết `NetVipApp` và `kBaseUrl`.
- [ ] **Step 4:** `flutter test` PASS, `flutter analyze` sạch.
- [ ] **Step 5:** Commit `feat: dựng khung Net Vip`.

### Task 2: Giao diện (theme, splash, màn lỗi)

**Files:**
- Create: `net_vip/lib/theme.dart`, `net_vip/lib/widgets/splash.dart`, `net_vip/lib/widgets/error_view.dart`
- Test: `net_vip/test/error_view_test.dart`

**Interfaces:**
- Produces: `ThemeData netVipTheme()`, `class ErrorView extends StatelessWidget { const ErrorView({required this.message, required this.onRetry}); }`.

- [ ] **Step 1:** Lấy màu nền/accent/chữ từ CSS web (`https://st.netcdn.one/assets/css/*`), ghi vào comment đầu `theme.dart`.
- [ ] **Step 2:** Test `ErrorView hiện nút Thử lại và gọi onRetry khi bấm`.
- [ ] **Step 3:** Chạy test, expect FAIL; cài `ErrorView`, `Splash` (logo chữ Net Vip, hiệu ứng fade 600ms), `netVipTheme()` tối.
- [ ] **Step 4:** Test PASS.
- [ ] **Step 5:** Commit.

### Task 3: Chính sách URL

**Files:**
- Create: `net_vip/lib/url_policy.dart`
- Test: `net_vip/test/url_policy_test.dart`

**Interfaces:**
- Produces: `enum NavDecision { inApp, external, block }`, `NavDecision decideNavigation(Uri uri)`.

- [ ] **Step 1:** Test: `nettruyen15s.com/manga/x` -> `inApp`; `st.netcdn.one/...` -> `inApp`; `facebook.com/...` -> `external`; `googlesyndication.com/...` và `doubleclick.net/...` -> `block`; scheme `intent:`/`market:` -> `external`; URL không phải http(s) -> `external`.
- [ ] **Step 2:** Chạy, expect FAIL.
- [ ] **Step 3:** Cài `decideNavigation` với danh sách host cho phép (domain gốc và subdomain, `netcdn.one`), danh sách host chặn quảng cáo.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 4: Lớp chèn CSS/JS

**Files:**
- Create: `net_vip/lib/injector.dart`, `net_vip/assets/inject/base.css`, `net_vip/assets/inject/base.js`
- Test: `net_vip/test/injector_test.dart`

**Interfaces:**
- Produces: `String buildInjectionScript({required String css, required String js})` trả về JS tự bọc try/catch và gắn `<style id="netvip-css">`; gọi hai lần không nhân đôi style (idempotent).

- [ ] **Step 1:** Test: script chứa `id="netvip-css"`; kiểm tra có `try`/`catch`; chuỗi CSS có dấu nháy/backtick được escape đúng.
- [ ] **Step 2:** Chạy, expect FAIL.
- [ ] **Step 3:** Cài hàm. `base.css`: ẩn `.header`, `.main-nav`, `.footer` của web (vì app có thanh native), ẩn khối quảng cáo (`ins.adsbygoogle`, `[id*="ads"]`), chừa safe-area. Chỉ ẩn phần tử đã xác nhận trên HTML thật.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 5: Vỏ native và WebView theo tab

**Files:**
- Create: `net_vip/lib/shell.dart`, `net_vip/lib/web_tab.dart`
- Test: `net_vip/test/shell_test.dart`

**Interfaces:**
- Consumes: `decideNavigation`, `buildInjectionScript`, `ErrorView`, `kBaseUrl`.
- Produces: `class NetVipShell` (thanh dưới 5 tab: Trang chủ `/`, Theo dõi, Lịch sử, Chat `/chat`, Tài khoản `/user/profile`), `class WebTab extends StatefulWidget { const WebTab({required this.initialUrl}); }`.

- [ ] **Step 1:** Test widget: shell có 5 mục; bấm tab đổi `IndexedStack.index`; tab không bị tạo lại khi quay về.
- [ ] **Step 2:** Chạy, expect FAIL.
- [ ] **Step 3:** Cài shell + `WebTab`: thanh tiến trình, kéo để làm mới, `onNavigationRequest` dùng `decideNavigation`, `onPageFinished` chèn script, `onWebResourceError` hiện `ErrorView`, `PopScope` xử lý Back, `onShowFileSelector` cho chọn ảnh, bật lưu cookie. URL Theo dõi/Lịch sử lấy từ HTML thật (xác minh trước khi hardcode).
- [ ] **Step 4:** Test PASS; `flutter build apk --debug` thành công.
- [ ] **Step 5:** Commit.

### Task 6: Khảo sát DOM chat và hồ sơ (cần bạn hỗ trợ)

**Files:**
- Create: `docs/superpowers/notes/dom-chat-profile.md`

**Produces:** Selector thật của khung chat, nút `+`, ô nhập, tin nhắn người khác/của mình, bảng nhiệm vụ.

- [ ] **Step 1:** `/chat` công khai nên tôi tự tải HTML và ghi selector; trang Nhiệm vụ cần đăng nhập nên **bạn gửi file HTML đã lưu** (Chrome: Lưu trang) của `/user/profile` tab Nhiệm vụ và của một khung chat có tin nhắn của bạn.
- [ ] **Step 2:** Ghi selector, tên class và cấu trúc tin nhắn vào file ghi chú; không đoán.
- [ ] **Step 3:** Commit.

### Task 7: Tính năng 1.2 bằng chèn JS/CSS

**Files:**
- Create: `net_vip/assets/inject/chat.js`, `net_vip/assets/inject/chat.css`, `net_vip/assets/inject/quests.css`
- Modify: `net_vip/lib/injector.dart` (chọn script theo đường dẫn trang)
- Test: `net_vip/test/injector_routes_test.dart`; kiểm thử DOM bằng Playwright trên HTML đã lưu ở Task 6.

**Interfaces:**
- Consumes: selector từ `dom-chat-profile.md`.
- Produces: `List<String> assetsForUrl(Uri uri)` trả danh sách asset chèn cho URL (ví dụ `/chat` -> `chat.js`, `chat.css`).

- [ ] **Step 1:** Test `assetsForUrl`: `/chat` gồm chat; `/user/profile` gồm quests; `/` chỉ base.
- [ ] **Step 2:** Test Playwright trên HTML đã lưu: bấm nút emoji cạnh nút `+` mở bảng emoji; chọn emoji chèn đúng vào ô nhập tại vị trí con trỏ; tin nhắn của mình có avatar, tên, cảnh giới, huy hiệu VIP và căn phải.
- [ ] **Step 3:** Cài `chat.js` (bảng emoji dùng cùng bộ emoji của khung bình luận truyện; nếu web không có bộ này, dùng danh sách emoji tĩnh trong asset), `chat.css` (bố cục tin nhắn của mình đảo chiều), `quests.css` (sắp xếp bảng nhiệm vụ theo ảnh bạn đã gửi, bỏ dòng quảng cáo). Phần "nhiệm vụ trên web" chỉ hiển thị lại nhiệm vụ web có sẵn, không tạo nhiệm vụ mới ở phía app vì phần thưởng do server tính.
- [ ] **Step 4:** Test PASS; thử trên emulator/thiết bị.
- [ ] **Step 5:** Commit.

### Task 8: Build APK bằng CI

**Files:**
- Create: `.github/workflows/build-apk.yml`
- Modify: `net_vip/android/app/build.gradle` (ký release bằng keystore từ secret)

- [ ] **Step 1:** Workflow: `flutter pub get`, `flutter analyze`, `flutter test`, `flutter build apk --release --split-per-abi`, upload artifact `net-vip-1.0.0.apk`.
- [ ] **Step 2:** Chạy workflow, expect xanh và có artifact tải về được.
- [ ] **Step 3:** Cài thử trên máy: đọc truyện, đăng nhập, chat, nhiệm vụ.
- [ ] **Step 4:** Commit.

### Task 9: Bản 1.0.1 - Đồng bộ đăng nhập, kéo làm mới, sửa tab Theo dõi

**Files:**
- Create: `net_vip/lib/auth_sync.dart`, `net_vip/assets/inject/base.js` (thay nội dung)
- Modify: `net_vip/lib/web_tab.dart`, `net_vip/lib/shell.dart`, `net_vip/pubspec.yaml` (version `1.0.1+2`)
- Test: `net_vip/test/app_test.dart`

**Interfaces:**
- Produces: `class AuthSync extends ChangeNotifier { String? state; void report(String s); }` (chỉ notify khi đổi); `WebTab({required String initialUrl, required AuthSync sync})`; JavaScriptChannel `NetVip` nhận `auth:<UserID|out>` và `refresh`.

- [ ] **Step 1:** Test `AuthSync chỉ báo khi đổi`: report('out'), report('out'), report('123') cho đúng 2 lần notify.
- [ ] **Step 2:** Chạy `flutter test`, expect FAIL (chưa có `AuthSync`).
- [ ] **Step 3:** Cài `AuthSync`; `WebTab` đăng ký channel, khi `auth:` đổi so với trạng thái tab đã tải thì `reload()`; `refresh` thì `reload()`. `base.js` đọc cookie `UserID` (không HttpOnly, đã xác minh) và gửi `auth:`; kéo xuống từ đầu trang quá 150px gửi `refresh`. Tab Theo dõi trỏ `/user/bookmarks` (đã xác minh trên web khi đăng nhập). Bỏ `RefreshIndicator` (không kích hoạt được trên WebView).
- [ ] **Step 4:** `flutter test` và `flutter analyze` sạch.
- [ ] **Step 5:** Commit.

### Task 10: Nút sticker trong chat

**Files:**
- Create: `net_vip/assets/inject/chat.js`, `chat.css`, `stickers.json` (13 bộ, URL lấy từ plugin tinymce của web, bỏ URL trùng giữa các bộ)
- Modify: `net_vip/lib/injector.dart` (`assetsForUrl`), `net_vip/lib/web_tab.dart` (chèn theo trang)
- Test: `net_vip/test/app_test.dart`

**Interfaces:**
- Produces: `({List<String> css, List<String> js}) assetsForUrl(Uri uri)`: `/chat` thêm `chat.css`, `chat.js`; trang khác chỉ `base.*`.

- [ ] **Step 1:** Test: `assetsForUrl('/chat').js` chứa `chat.js`; `assetsForUrl('/').js == ['base.js']`.
- [ ] **Step 2:** Chạy, expect FAIL.
- [ ] **Step 3:** Cài hàm; `chat.js` thêm nút `#btnEmoji` cạnh `#txtMessage`, bảng sticker có tab theo bộ; bấm sticker gửi `POST /ajax/chat/send {message:"[IMG=url]", reply_id:null}` (đúng như web gửi ảnh); tự bấm các nút "Xem ảnh" để ảnh hiện sẵn.
- [ ] **Step 4:** Test PASS, `flutter analyze` sạch.
- [ ] **Step 5:** Commit, push `main`, kiểm tra CI xanh.

---

## Self-Review

- Phủ yêu cầu: UI native (T2, T5), đọc truyện như web (T5), chat/nhiệm vụ/đăng nhập (T5, T7), 3 mục 1.2 (T7), build APK (T8). Chưa có: tinh chỉnh sâu từng trang web ngoài danh sách, thông báo đẩy, chế độ đọc offline (ngoài phạm vi, nếu muốn thì bàn thêm).
- Rủi ro lớn: nhờ web mà đổi HTML thì phần chèn CSS/JS hỏng; Task 6 cần HTML đăng nhập từ bạn.

## Câu hỏi cho bạn trước khi làm

1. **Pháp lý:** App dùng lại giao diện/nội dung/tên miền của NetTruyen và dữ liệu của họ; đưa lên CH Play có thể bị gỡ hoặc kiện. Bạn chỉ dùng cá nhân hay phát hành?
2. **Nhánh `main`:** tôi sẽ đẩy thẳng lên `main` như bạn nói, đúng không?
3. **Ảnh:** bạn gửi giúp ảnh màn hình chat (cả tin của bạn và của người khác) và file HTML ở Task 6.
