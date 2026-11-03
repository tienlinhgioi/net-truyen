import 'package:flutter/material.dart';

// Màu lấy từ CSS web (styles.min.css): đỏ #d9534f, cam #ff9601.
const Color kAccent = Color(0xFFD9534F);
const Color kBg = Color(0xFF121212);
const Color kSurface = Color(0xFF1E1E1E);

ThemeData netVipTheme() => ThemeData(
  brightness: Brightness.dark,
  scaffoldBackgroundColor: kBg,
  colorScheme: const ColorScheme.dark(primary: kAccent, surface: kSurface),
  navigationBarTheme: NavigationBarThemeData(
    backgroundColor: kSurface,
    indicatorColor: kAccent.withValues(alpha: 0.25),
  ),
);
