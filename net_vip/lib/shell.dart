import 'package:flutter/material.dart';

import 'config.dart';
import 'web_tab.dart';

class NetVipShell extends StatefulWidget {
  const NetVipShell({super.key, this.buildTab});
  final Widget Function(String url)? buildTab;

  @override
  State<NetVipShell> createState() => _NetVipShellState();
}

const kTabs = <(String, IconData, String)>[
  ('Trang chủ', Icons.home_rounded, '/'),
  ('Theo dõi', Icons.bookmark_rounded, '/auth/login'),
  ('Lịch sử', Icons.history_rounded, '/lich-su'),
  ('Chat', Icons.chat_bubble_rounded, '/chat'),
  ('Tài khoản', Icons.person_rounded, '/user/profile'),
];

class _NetVipShellState extends State<NetVipShell> {
  int _i = 0;
  late final List<Widget> _tabs;

  @override
  void initState() {
    super.initState();
    final build = widget.buildTab ?? (u) => WebTab(initialUrl: u);
    _tabs = [for (final t in kTabs) build('$kBaseUrl${t.$3}')];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(
          index: _i,
          children: _tabs,
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _i,
        onDestinationSelected: (v) => setState(() => _i = v),
        destinations: [
          for (final t in kTabs)
            NavigationDestination(icon: Icon(t.$2), label: t.$1),
        ],
      ),
    );
  }
}
