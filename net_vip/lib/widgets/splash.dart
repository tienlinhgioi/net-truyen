import 'package:flutter/material.dart';
import '../theme.dart';

class Splash extends StatelessWidget {
  const Splash({super.key});

  @override
  Widget build(BuildContext context) => Center(
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: const Duration(milliseconds: 600),
          builder: (_, v, child) => Opacity(opacity: v, child: child),
          child: const Text('Net Vip',
              style: TextStyle(
                  fontSize: 36, fontWeight: FontWeight.bold, color: kAccent)),
        ),
      );
}
