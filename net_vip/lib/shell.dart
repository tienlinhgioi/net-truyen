import 'package:flutter/material.dart';

import 'auth_sync.dart';
import 'config.dart';
import 'tab_history.dart';

import 'package:flutter/services.dart';

import 'web_tab.dart';

class NetVipShell extends StatefulWidget {
  const NetVipShell({super.key, this.buildTab});
  final Widget Function(String url)? buildTab;

  @override
  State<NetVipShell> createState() => _NetVipShellState();
}

/// (nhãn, icon, đường dẫn, cần đăng nhập)
const kTabs = <(String, IconData, String, bool)>[
  ('Trang chủ', Icons.home_rounded, '/', false),
  ('Theo dõi', Icons.bookmark_rounded, '/user/bookmarks', true),
  ('Lịch sử', Icons.history_rounded, '/lich-su', false),
  ('Chat', Icons.chat_bubble_rounded, '/chat', false),
  ('Tài khoản', Icons.person_rounded, '/user/profile', true),
  ('Cộng đồng', Icons.groups_rounded, '/forum', false),
];

/// Mục trong menu Cộng đồng: (nhãn, icon, đường dẫn)
const kCommunity = <(String, IconData, String)>[
  ('Diễn đàn', Icons.forum_rounded, '/forum'),
  (
    'Bảng xếp hạng thành viên',
    Icons.leaderboard_rounded,
    '/bang-xep-hang-thanh-vien',
  ),
  ('Nhiệm vụ (Linh thạch)', Icons.bolt_rounded, kQuestPath),
];

const String kQuestPath = '/user/profile?tab=linh-thach';
const int kCommunityIndex = 5;

/// Tab ẩn (không có trên thanh dưới), tải sẵn khi mở app để tự làm nhiệm vụ.
const int kQuestIndex = 6;

class _NetVipShellState extends State<NetVipShell> {
  final _history = TabHistory(0);
  int get _i => _history.current;
  final _communityKey = GlobalKey<WebTabState>();
  final _sync = AuthSync();

  /// Địa chỉ của từng tab, theo thứ tự: 6 tab trên thanh dưới + tab nhiệm vụ ẩn.
  List<(String, bool)> get _specs => [
    for (final t in kTabs) ('$kBaseUrl${t.$3}', t.$4),
    ('$kBaseUrl$kQuestPath', true),
  ];

  void _go(int i) => setState(() => _history.select(i));

  void _back() {
    final t = _history.back();
    if (t == null) {
      SystemNavigator.pop();
    } else {
      setState(() {});
    }
  }

  Widget _tab(int n) {
    final (url, needsAuth) = _specs[n];
    if (widget.buildTab != null) return widget.buildTab!(url);
    return WebTab(
      key: n == kCommunityIndex ? _communityKey : null,
      initialUrl: url,
      sync: _sync,
      needsAuth: needsAuth,
      active: n == _i,
      onBackAtRoot: _back,
    );
  }

  Future<void> _openCommunityMenu() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final m in kCommunity)
              ListTile(
                leading: Icon(m.$2),
                title: Text(m.$1),
                onTap: () => Navigator.pop(context, m.$3),
              ),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    if (picked == kQuestPath) {
      _go(kQuestIndex);
      return;
    }
    _go(kCommunityIndex);
    _communityKey.currentState?.load('$kBaseUrl$picked');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(
          index: _i,
          children: [for (var n = 0; n < _specs.length; n++) _tab(n)],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _i >= kTabs.length ? kCommunityIndex : _i,
        onDestinationSelected: (v) =>
            v == kCommunityIndex ? _openCommunityMenu() : _go(v),
        destinations: [
          for (final t in kTabs)
            NavigationDestination(icon: Icon(t.$2), label: t.$1),
        ],
      ),
    );
  }
}
