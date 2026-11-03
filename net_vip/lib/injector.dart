import 'dart:convert';

/// Sinh JS chèn CSS/JS vào trang. An toàn: bọc try/catch, chèn lặp không nhân đôi.
String buildInjectionScript({required String css, required String js}) {
  final cssLit = jsonEncode(css);
  return '''
(function(){try{
var s=document.getElementById("netvip-css");
if(!s){s=document.createElement("style");s.id="netvip-css";(document.head||document.documentElement).appendChild(s);}
s.textContent=$cssLit;
}catch(e){}
try{
$js
}catch(e){}
})();''';
}

/// Danh sách asset (css, js) chèn cho từng đường dẫn.
({List<String> css, List<String> js}) assetsForUrl(Uri uri) {
  final css = ['base.css'];
  final js = ['base.js'];
  if (uri.path == '/chat' || uri.path.startsWith('/chat/')) {
    css.add('chat.css');
    js.add('chat.js');
  }
  if (uri.path == '/user/profile' && uri.queryParameters['tab'] == 'linh-thach') {
    css.add('quest.css');
    js.add('quest.js');
  }
  return (css: css, js: js);
}
