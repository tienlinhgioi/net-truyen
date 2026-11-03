import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'injector.dart';
import 'theme.dart';
import 'url_policy.dart';
import 'widgets/error_view.dart';

class WebTab extends StatefulWidget {
  const WebTab({super.key, required this.initialUrl});
  final String initialUrl;

  @override
  State<WebTab> createState() => _WebTabState();
}

class _WebTabState extends State<WebTab> with AutomaticKeepAliveClientMixin {
  late final WebViewController _c;
  int _progress = 0;
  String? _error;
  String _css = '';
  String _js = '';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(kBg)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (r) {
          switch (decideNavigation(Uri.parse(r.url))) {
            case NavDecision.inApp:
              return NavigationDecision.navigate;
            case NavDecision.external:
              launchUrl(Uri.parse(r.url), mode: LaunchMode.externalApplication);
              return NavigationDecision.prevent;
            case NavDecision.block:
              return NavigationDecision.prevent;
          }
        },
        onProgress: (p) => setState(() => _progress = p),
        onPageStarted: (_) => setState(() => _error = null),
        onPageFinished: (_) => _inject(),
        onWebResourceError: (e) {
          if (e.isForMainFrame ?? false) {
            setState(() => _error = 'Không tải được trang. Kiểm tra mạng.');
          }
        },
      ));
    _load();
  }

  Future<void> _load() async {
    _css = await rootBundle.loadString('assets/inject/base.css');
    _js = await rootBundle.loadString('assets/inject/base.js');
    await _c.loadRequest(Uri.parse(widget.initialUrl));
  }

  Future<void> _inject() =>
      _c.runJavaScript(buildInjectionScript(css: _css, js: _js));

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _c.canGoBack()) {
          _c.goBack();
        } else {
          SystemNavigator.pop();
        }
      },
      child: Stack(children: [
        if (_error != null)
          ErrorView(message: _error!, onRetry: () => _c.reload())
        else
          RefreshIndicator(
            color: kAccent,
            onRefresh: () => _c.reload(),
            child: WebViewWidget(controller: _c),
          ),
        if (_progress < 100 && _error == null)
          LinearProgressIndicator(
              value: _progress / 100, color: kAccent, minHeight: 2),
      ]),
    );
  }
}
