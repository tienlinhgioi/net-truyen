# Bot Net

Bot chat Gemini cho NetTruyen, nhiều tài khoản. Capacitor + JavaScript thuần (HTML5/CSS3).

- Logic lõi: `www/js/core/` (có test: `npm test`)
- Giao diện: `www/index.html`, `www/css/app.css`, `www/js/ui/`
- Test giao diện (cần Playwright): `NODE_PATH=$(npm root -g) node test/ui.e2e.mjs`
- Build APK: GitHub Actions (`.github/workflows/bot-net.yml`), tệp `bot-net-<phiên bản>.apk`
