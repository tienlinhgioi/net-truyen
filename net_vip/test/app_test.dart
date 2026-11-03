import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:net_vip/main.dart';
import 'package:net_vip/shell.dart';
import 'package:net_vip/url_policy.dart';
import 'package:net_vip/injector.dart';
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
    expect(find.byType(NavigationDestination), findsNWidgets(5));
    await t.tap(find.text('Chat'));
    await t.pump();
    await t.tap(find.text('Trang chủ'));
    await t.pump();
    expect(created, 5);
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
}
