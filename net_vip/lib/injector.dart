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
