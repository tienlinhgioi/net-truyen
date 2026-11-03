import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:net_vip/main.dart';
import 'package:net_vip/shell.dart';
import 'package:net_vip/url_policy.dart';
import 'package:net_vip/injector.dart';
import 'package:net_vip/auth_sync.dart';
import 'package:net_vip/guest_redirect.dart';
import 'package:net_vip/widgets/error_view.dart';

void main() {
  testWidgets('splash hiển thị Net Vip', (t) async {
    await t.pumpWidget(NetVipApp(shellBuilder: (_) => const SizedBox()));
    expect(find.text('Net Vip'), findsOneWidget);
    await t.pump(const Duration(seconds: 2));
  });

  testWidgets('ErrorView gọi onRetry', (t) async {
    var n = 0;
    await t.pumpWidget(MaterialApp(
        home: ErrorView(message: 'lỗi', onRetry: () => n++)));
    await t.tap(find.text('Thử lại'));
    expect(n, 1);
  });

  testWidgets('shell có 5 tab và giữ trạng thái', (t) async {
    var created = 0;
    await t.pumpWidget(MaterialApp(
        home: NetVipShell(buildTab: (u) {
      created++;
      return Text(u);
    })));
    expect(find.byType(NavigationDestination), findsNWidgets(6));
    await t.tap(find.text('Chat'));
    await t.pump();
    await t.tap(find.text('Trang chủ'));
    await t.pump();
    expect(created, 7); // 6 tab + 1 tab nhiệm vụ ẩn
  });

  test('url policy', () {
    NavDecision d(String u) => decideNavigation(Uri.parse(u));
    expect(d('https://nettruyen15s.com/manga/x'), NavDecision.inApp);
    expect(d('https://st.netcdn.one/a.js'), NavDecision.inApp);
    expect(d('https://facebook.com/x'), NavDecision.external);
    expect(d('https://pagead2.googlesyndication.com/x'), NavDecision.block);
    expect(d('https://ad.doubleclick.net/x'), NavDecision.block);
    expect(d('intent://x'), NavDecision.external);
  });

  test('injector', () {
    final s = buildInjectionScript(css: 'a{content:"x`y"}', js: '');
    expect(s, contains('netvip-css'));
    expect(s, contains('try'));
    expect(s, contains('catch'));
  });

  test('AuthSync chỉ báo khi đổi', () {
    final s = AuthSync();
    var n = 0;
    s.addListener(() => n++);
    s.report('out');
    s.report('out');
    s.report('123');
    expect(n, 2);
  });

  test('assetsForUrl theo trang', () {
    expect(assetsForUrl(Uri.parse('https://nettruyen15s.com/chat')).js,
        contains('chat.js'));
    expect(assetsForUrl(Uri.parse('https://nettruyen15s.com/')).js,
        ['base.js']);
  });

  test('guestRedirect: khách vào tab cần đăng nhập bị đẩy về trang chủ -> sang trang đăng nhập', () {
    final r = guestRedirect(
        current: Uri.parse('https://nettruyen15s.com/'),
        initialUrl: 'https://nettruyen15s.com/user/profile',
        auth: 'out');
    expect(r, 'https://nettruyen15s.com/auth/login?return=https%3A%2F%2Fnettruyen15s.com%2Fuser%2Fprofile');
    expect(
        guestRedirect(
            current: Uri.parse('https://nettruyen15s.com/'),
            initialUrl: 'https://nettruyen15s.com/user/profile',
            auth: '42'),
        isNull);
    expect(
        guestRedirect(
            current: Uri.parse('https://nettruyen15s.com/'),
            initialUrl: 'https://nettruyen15s.com/',
            auth: 'out'),
        isNull);
  });

  testWidgets('bấm Cộng đồng mở menu Diễn đàn và BXH thành viên', (t) async {
    await t.pumpWidget(MaterialApp(home: NetVipShell(buildTab: (u) => Text(u))));
    await t.tap(find.text('Cộng đồng'));
    await t.pumpAndSettle();
    expect(find.text('Diễn đàn'), findsOneWidget);
    expect(find.text('Bảng xếp hạng thành viên'), findsOneWidget);
    expect(find.text('Nhiệm vụ (Linh thạch)'), findsOneWidget);
  });

  test('assetsForUrl: trang linh thạch có quest.js, hồ sơ thường thì không', () {
    expect(
        assetsForUrl(Uri.parse('https://nettruyen15s.com/user/profile?tab=linh-thach')).js,
        contains('quest.js'));
    expect(assetsForUrl(Uri.parse('https://nettruyen15s.com/user/profile')).js,
        isNot(contains('quest.js')));
  });
}
