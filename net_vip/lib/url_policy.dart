import 'config.dart';

enum NavDecision { inApp, external, block }

const _allowedHosts = ['netcdn.one'];
const _blockedHosts = [
  'googlesyndication.com',
  'doubleclick.net',
  'googleadservices.com',
  'adservice.google.com',
];

bool _hostIs(String host, String domain) =>
    host == domain || host.endsWith('.$domain');

NavDecision decideNavigation(Uri uri) {
  if (uri.scheme != 'http' && uri.scheme != 'https') return NavDecision.external;
  final host = uri.host.toLowerCase();
  if (_blockedHosts.any((d) => _hostIs(host, d))) return NavDecision.block;
  final base = Uri.parse(kBaseUrl).host;
  if (_hostIs(host, base) || _allowedHosts.any((d) => _hostIs(host, d))) {
    return NavDecision.inApp;
  }
  return NavDecision.external;
}
