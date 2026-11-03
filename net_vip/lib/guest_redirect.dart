/// Khách vào tab cần đăng nhập (Tài khoản, Theo dõi) bị web đẩy về trang chủ.
/// Trả về link đăng nhập (quay lại trang đích sau khi đăng nhập), hoặc null nếu không cần.
String? guestRedirect({
  required Uri current,
  required String initialUrl,
  required String? auth,
}) {
  if (auth != 'out') return null;
  final initial = Uri.parse(initialUrl);
  if (initial.path == '/' || initial.path.isEmpty) return null;
  if (current.path != '/') return null;
  final base = '${initial.scheme}://${initial.host}';
  return '$base/auth/login?return=${Uri.encodeComponent(initialUrl)}';
}
