import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'auth_sync.dart';
import 'guest_redirect.dart';
import 'injector.dart';
import 'theme.dart';
import 'url_policy.dart';
import 'widgets/error_view.dart';

class WebTab extends StatefulWidget {
  const WebTab({
    super.key,
    required this.initialUrl,
    required this.sync,
    this.needsAuth = false,
    this.active = true,
    this.onBackAtRoot,
  });
  final String initialUrl;
  final AuthSync sync;

  /// Tab chỉ có nội dung khi đã đăng nhập (Tài khoản, Theo dõi).
  final bool needsAuth;

  /// Chỉ tab đang hiển thị mới xử lý nút Back.
  final bool active;

  /// Gọi khi bấm Back mà trang web không còn lịch sử để lùi.
  final VoidCallback? onBackAtRoot;

  @override
  State<WebTab> createState() => WebTabState();
}

class WebTabState extends State<WebTab> with AutomaticKeepAliveClientMixin {
  late final WebViewController _c;
  int _progress = 0;
  String? _error;
  String? _loadedAuth;
  Uri _current = Uri.parse('about:blank');

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    widget.sync.addListener(_onAuthChanged);
    _c = WebViewController()
      ..addJavaScriptChannel('NetVip', onMessageReceived: _onMessage)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(kBg)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (r) {
            switch (decideNavigation(Uri.parse(r.url))) {
              case NavDecision.inApp:
                return NavigationDecision.navigate;
              case NavDecision.external:
                launchUrl(
                  Uri.parse(r.url),
                  mode: LaunchMode.externalApplication,
                );
                return NavigationDecision.prevent;
              case NavDecision.block:
                return NavigationDecision.prevent;
            }
          },
          onProgress: (p) => setState(() => _progress = p),
          onPageStarted: (u) {
            _current = Uri.tryParse(u) ?? _current;
            setState(() => _error = null);
          },
          onPageFinished: (u) {
            _current = Uri.tryParse(u) ?? _current;
            _inject();
          },
          onWebResourceError: (e) {
            if (e.isForMainFrame ?? false) {
              setState(() => _error = 'Không tải được trang. Kiểm tra mạng.');
            }
          },
        ),
      );
    // Cho phép trang mở hộp chọn ảnh (nút Gửi ảnh trong chat).
    final platform = _c.platform;
    if (platform is AndroidWebViewController) {
      platform.setOnShowFileSelector(_pickFiles);
    }
    _load();
  }

  Future<List<String>> _pickFiles(FileSelectorParams params) async {
    final picker = ImagePicker();
    if (params.mode == FileSelectorMode.openMultiple) {
      final files = await picker.pickMultiImage();
      return [for (final f in files) Uri.file(f.path).toString()];
    }
    final f = await picker.pickImage(source: ImageSource.gallery);
    return f == null ? [] : [Uri.file(f.path).toString()];
  }

  /// Mở một địa chỉ trong tab này (dùng cho menu Cộng đồng).
  Future<void> load(String url) => _c.loadRequest(Uri.parse(url));

  Future<void> _load() => _c.loadRequest(Uri.parse(widget.initialUrl));

  void _onMessage(JavaScriptMessage m) {
    final t = m.message;
    if (t == 'refresh') {
      _c.reload();
    } else if (t.startsWith('auth:')) {
      _loadedAuth = t.substring(5);
      final login = widget.needsAuth
          ? guestRedirect(
              current: _current,
              initialUrl: widget.initialUrl,
              auth: _loadedAuth,
            )
          : null;
      if (login != null) {
        _c.loadRequest(Uri.parse(login));
      }
      widget.sync.report(_loadedAuth!);
    }
  }

  // Đăng nhập/đăng xuất ở tab khác: tải lại tab này cho đồng bộ.
  void _onAuthChanged() {
    if (_loadedAuth == null || _loadedAuth == widget.sync.state) return;
    // Tab cần đăng nhập đang kẹt ở trang chủ/đăng nhập: tải lại đúng trang đích.
    if (widget.needsAuth) {
      _c.loadRequest(Uri.parse(widget.initialUrl));
    } else {
      _c.reload();
    }
  }

  Future<String> _asset(String n) => rootBundle.loadString('assets/inject/$n');

  Future<void> _inject() async {
    final a = assetsForUrl(_current);
    final css = (await Future.wait(a.css.map(_asset))).join('\n');
    var js = '';
    if (a.js.contains('chat.js')) {
      js += 'window.__NV_STICKERS=${await _asset('stickers.json')};\n';
    }
    js += (await Future.wait(a.js.map(_asset))).join('\n');
    await _c.runJavaScript(buildInjectionScript(css: css, js: js));
  }

  @override
  void dispose() {
    widget.sync.removeListener(_onAuthChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || !widget.active) return;
        if (await _c.canGoBack()) {
          _c.goBack();
        } else if (widget.onBackAtRoot != null) {
          widget.onBackAtRoot!();
        } else {
          SystemNavigator.pop();
        }
      },
      child: Stack(
        children: [
          if (_error != null)
            ErrorView(message: _error!, onRetry: () => _c.reload())
          else
            WebViewWidget(controller: _c),
          if (_progress < 100 && _error == null)
            LinearProgressIndicator(
              value: _progress / 100,
              color: kAccent,
              minHeight: 2,
            ),
        ],
      ),
    );
  }
}
