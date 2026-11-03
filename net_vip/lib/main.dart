import 'package:flutter/material.dart';

import 'shell.dart';
import 'theme.dart';
import 'widgets/splash.dart';

void main() => runApp(const NetVipApp());

class NetVipApp extends StatefulWidget {
  const NetVipApp({super.key, this.shellBuilder});
  final WidgetBuilder? shellBuilder;

  @override
  State<NetVipApp> createState() => _NetVipAppState();
}

class _NetVipAppState extends State<NetVipApp> {
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _ready = true);
    });
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Net Vip',
        debugShowCheckedModeBanner: false,
        theme: netVipTheme(),
        home: _ready
            ? (widget.shellBuilder ?? (_) => const NetVipShell())(context)
            : const Scaffold(body: Splash()),
      );
}
