import 'package:flutter/foundation.dart';

/// Trạng thái đăng nhập dùng chung giữa các tab ('out' hoặc UserID).
class AuthSync extends ChangeNotifier {
  String? state;

  void report(String s) {
    if (s == state) return;
    state = s;
    notifyListeners();
  }
}
