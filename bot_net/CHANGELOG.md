# Bot Net - Lịch sử phiên bản

## 1.0.11
- Sửa gửi truyện không ổn. Nguyên nhân (đo trên web thật): bot lấy kết quả đầu tiên của ô tìm kiếm, mà web không xếp theo độ khớp tên (tìm "naruto" ra *Renge To Naruto!* trước *Naruto*), và tìm không dấu ("vo luyen dinh phong") ra rỗng.
- Giờ bot chọn truyện khớp nhất: khớp hệt tên, rồi chứa đủ từ khóa mà ít từ thừa nhất; nhiều kết quả mà không cái nào liên quan thì không đoán bừa. Gemini được dặn viết tên truyện đúng như hiển thị ở web tiếng Việt (có dấu) kèm tên khác sau dấu | để thử lần lượt.
- Tìm không ra thì bot báo "không tìm thấy truyện ..." thay vì nói "nè bạn" rồi im lặng. Không gửi lại cùng một truyện trong 10 phút.

## 1.0.10
- Cho AI truy cập internet: câu hỏi kiến thức ("... là gì", "ai là...", "ở đâu"...) được tra Wikipedia (tiếng Việt rồi tiếng Anh) và đưa tóm tắt cho Gemini làm tư liệu, vẫn chỉ 1 lượt Gemini mỗi câu hỏi. Khi có người nhờ xem ảnh thật, bot tìm ảnh Creative Commons trên Openverse (đã lọc nội dung người lớn) và gửi vào chat. Cả hai miễn phí, không cần khóa, có giới hạn mỗi giờ/ngày chỉnh được trong Cài đặt, và có thể tắt. Google Search của Gemini không dùng được ở gói miễn phí (luôn 429) nên không dùng.
- Trí nhớ của AI: xem các ghi chú bot đã nhớ về từng người chat, bảo bot quên từng người; "Nạp lại prompt mới cho AI ngay"; "Xóa ghi chú cũ và nạp lại AI từ đầu" (mỗi tài khoản) và xóa ghi chú cũ của tất cả tài khoản trong Cài đặt.
- Sửa lỗi sửa bất kỳ trường nào của tài khoản đang chạy làm mất hết ghi chú đã nhớ về người chat.

## 1.0.9
- Giới hạn số tin trả lời cho một câu hỏi (mặc định 3, chỉnh chung trong Cài đặt hoặc riêng từng tài khoản): tin chữ được ưu tiên, rồi truyện, ảnh, sticker; phần vượt giới hạn bị bỏ và ghi vào nhật ký.
- Cài đặt tách thành 4 màn riêng: Giao diện; Model và API key; Hành vi và tốc độ; Lịch và hệ thống.
- Sửa thông báo lỗi ảnh "nokey" khó hiểu: nay nêu đúng lý do từng model ảnh, ví dụ "gemini-2.5-flash-image: model này không có hạn mức miễn phí với key này (cần bật thanh toán hoặc đổi model)". Qua thử với key thật: cả 8 model tạo ảnh đều không có hạn mức ở gói miễn phí.
- "Kiểm tra model sống" cho model ảnh gửi yêu cầu tạo ảnh thật (có hỏi xác nhận vì có thể tốn lượt) thay vì yêu cầu chữ, nên cho kết quả đúng.

## 1.0.8
- Sửa lỗi tự đối đáp một mình: bot nhận ra tin của chính nó chắc chắn hơn. Khớp tin vừa gửi theo dạng đã chuẩn hóa (web có thể đổi chữ khi hiển thị lại như & thành &amp;), dùng nhiều tên (tên hồ sơ, tên trong chat, tên trong cookie đăng nhập), và không bao giờ trả lời một tin trùng chữ với tin mình vừa gửi, kể cả khi chưa biết user_id.
- Câu trả lời không còn tự gọi tên mình: thay tên và biệt danh của chính mình bằng "mình", bỏ lệnh gọi, bỏ tiền tố "Tên:" và bỏ phần model tự viết lời người khác. Lịch sử chat gửi cho model ghi rõ dòng nào là của chính bot ("Bạn (tên)") và dặn không giả lời người khác.
- Hai bot không còn đối đáp nhau mãi: mỗi bot khác chỉ được trả lời một lần mỗi 2 phút (chỉnh được), ngoài giới hạn tối đa 2 tin liên tiếp.
- Sửa lỗi tắt tài khoản mà bot vẫn hoạt động: khi tắt, lượt đang xử lý dở (đang chờ gõ, đang hỏi Gemini, các tin xếp hàng) cũng dừng hẳn và không gửi thêm tin nào.
- Công tắc "Chạy ngầm": khi tắt, bot dừng hẳn lúc app ra nền và chạy lại khi quay về (không đổi trạng thái bật/tắt từng tài khoản).

## 1.0.7
- Phân biệt gói của từng key: nhãn "Gói miễn phí / Gói trả phí / Gói chưa rõ" cạnh mỗi key. Nhận biết theo tên hạn mức Google báo (đuôi FreeTier = miễn phí) và thử một model Pro khi kiểm tra key (Google không có API cho biết gói thanh toán trực tiếp). Giới hạn lượt học được tách riêng theo gói.
- Đếm hạn mức đúng giờ của Google: ngày hạn mức tính theo nửa đêm giờ Thái Bình Dương (khoảng 14 đến 15 giờ chiều giờ Việt Nam) chứ không theo nửa đêm giờ máy, nên phần trăm không còn lệch. Khi Google báo hết hạn mức theo ngày, số lượt hôm nay được đồng bộ bằng giới hạn (100%) và hiện giờ hạn mức làm mới.
- Tìm key nhanh: ô tìm theo đoạn key, tên tài khoản, gói hoặc trạng thái (cả trong Cài đặt và màn tài khoản); dán nhiều key một lần; liên kết lấy key mới ở Google AI Studio.
- "Kiểm tra tình trạng tất cả model": quét mọi model hiện có của key, hiện sống, hết hạn mức, không có hạn mức, bận hay không tồn tại kèm phần trăm đã dùng hôm nay (model ảnh/giọng nói được liệt kê nhưng không thử tự động vì tốn lượt).

## 1.0.6
- Nút "Quét và tự chọn model sống" trong combo chat chữ: thử từng model chat bằng key của bạn (mỗi model tốn 1 lượt nhỏ), hiện model nào sống, hết hạn mức hôm nay, không có hạn mức miễn phí, bận hay không tồn tại, rồi tự đặt combo từ các model sống, nhanh nhất lên đầu (tối đa 5).
- Bộ lọc model theo vai (chat chữ, tạo ảnh) chuyển vào lõi và loại thêm các model phiên âm, nhạc, nghiên cứu, Live.

## 1.0.5
- Tìm ra nguyên nhân lỗi 429 bằng cách thử với key thật: gói miễn phí chỉ cho rất ít lượt mỗi ngày theo từng model (ví dụ gemini-3.8-flash chỉ 20 lượt/ngày, nghỉ khoảng 22 giờ), và model Pro không có hạn mức miễn phí (luôn 429). App giờ nhận ra cả hai: học giới hạn thật từ Google, hiện đúng phần trăm và lý do ("model không có hạn mức miễn phí", "hết hạn mức theo ngày (20 lượt)"), nghỉ đúng thời gian Google báo.
- Tiết kiệm hạn mức: tin tự chen vào/mở chủ đề không dùng model đã dùng từ 70% hạn mức; model gần hết (từ 95%) bị đẩy xuống cuối combo để model còn hạn mức trả lời trước; tắt chạy song song model dự phòng theo mặc định (vì nhân đôi số lượt), bật được trong Cài đặt.
- Giảm độ trễ khi model bận/chậm: mỗi yêu cầu chờ tối đa 12 giây rồi sang model kế, model bận (503) chỉ thử lại một lần và bị bỏ qua 45 giây, lỗi mạng được coi là lỗi tạm.
- Sửa lỗi nhóm model Flash-Lite bị coi là lỗi vì không nhận cấu hình tắt "suy nghĩ" (Google chỉ báo "invalid argument"): app tự bỏ dần từng tính năng và nhớ lại cho lần sau.
- Không còn gửi vào chat đoạn "suy nghĩ" của model (ví dụ gemma): câu trả lời không phải JSON mà giống ghi chú suy luận sẽ bị bỏ.
- Cảnh báo trong danh sách model: Pro thường không có hạn mức miễn phí, gemma rất chậm.

## 1.0.4
- Hiện phần trăm mức dùng của từng API key theo ngày (kèm thanh màu): số lượt hôm nay / giới hạn. Giới hạn tự học từ thông báo hết hạn mức của Google (theo ngày và theo phút), hoặc bạn gõ tay trong Cài đặt, mục "Giới hạn lượt theo model".
- Sửa lỗi Cài đặt và Tài khoản cho kết quả kiểm tra key khác nhau: cả hai dùng chung một cách kiểm tra (gửi yêu cầu nhỏ qua model chat chữ của tài khoản), hiển thị cùng nội dung, và hiện lý do lỗi thật của Google (mã HTTP và lời báo).
- Phân loại lỗi key chính xác theo dữ liệu thật của Google: key sai/hết hạn/bị khóa, hết hạn mức theo ngày hay theo phút, 403 tạm thời, vùng không hỗ trợ. 403 tạm thời không còn làm key bị coi là chết; hết hạn mức theo phút nghỉ đúng thời gian Google yêu cầu, theo ngày nghỉ lâu hơn.
- Sửa lỗi đếm lượt dùng bị mất khi chạy nhiều tài khoản cùng lúc (cộng dồn chung).
- Kiểm tra key tối đa 2 yêu cầu song song để không tự gây quá hạn mức theo phút.

## 1.0.3
- Gửi ảnh không cần khóa nào nữa: ảnh bot tạo được tải lên bằng chính phiên đăng nhập của tài khoản đang chat (đường tải ảnh của web). Bỏ ô khóa imgbb.
- Sửa nhiều lỗi model và API key: không còn gửi "hướng dẫn hệ thống" rỗng khi kiểm tra; model không hỗ trợ JSON, tắt suy nghĩ hoặc hướng dẫn hệ thống thì tự hạ cấp và thử lại ngay, nhớ khả năng của từng model; thông báo lỗi nêu rõ nguyên nhân kèm mã HTTP.
- Giảm độ trễ: tắt chế độ "suy nghĩ" của model, key sai thì đổi key ngay không chờ, chờ đổi key mặc định giảm còn 1 giây, giới hạn thời gian chờ mỗi yêu cầu.
- Chọn model theo vai: chat chữ bỏ model ảnh/giọng nói, tạo ảnh chỉ hiện model ảnh (có nút hiện tất cả).

## 1.0.2
- Phản hồi nhanh hơn: hỏi Gemini ngay khi có người gọi, thời gian "gõ" tính chồng lên thời gian chờ; quét chat 1,5 giây (1 giây khi đang trò chuyện); delay chat mặc định là khoảng cách tối thiểu giữa 2 tin.
- Combo model: mỗi vai (chat chữ, tạo ảnh, hiểu ảnh) có nhiều model theo thứ tự ưu tiên, thêm nhiều model cùng lúc hoặc tự gõ tên; kiểm tra model sống, tự bỏ qua model chết, hết hạn mức model này thì dùng model kế.
- Kiểm tra đồng loạt API key (từng tài khoản hoặc tất cả): sống, hết hạn mức, sai key.
- Gửi sticker, gửi truyện (thẻ truyện như nút Gửi truyện của web) và tạo ảnh rồi gửi; ảnh có giới hạn mỗi ngày và thời gian chờ giữa hai ảnh. Cần nhập khóa imgbb của bạn để gửi ảnh.
- Tiếp tục cuộc trò chuyện sau khi đã nói chuyện với một người (mặc định 3 phút), nhớ ghi chú về từng người, thỉnh thoảng tự chen vào tin của người khác (có xác suất và giới hạn mỗi giờ), tự mở chủ đề khi phòng vắng (tùy chọn).
- Nhắn như người thật: tâm trạng theo giờ, độ trễ gõ theo độ dài, tách tin dài thành 2 tin, tránh lặp câu, bỏ qua cãi vã và từ nhạy cảm.
- Avatar và tên tự cập nhật theo tài khoản (mỗi 30 phút, theo tin trong chat, hoặc nút Làm mới hồ sơ). Avatar trong màn sửa nhỏ lại thành khung tròn.
- Sửa lỗi crash khi kéo thanh độ mờ (không còn gọi lại dịch vụ nền liên tục). Thêm thanh độ mờ khung và làm mờ kính.
- Nút Dừng tất cả (bật lại một chạm), báo cáo theo ngày, cảnh báo khi hết API key.

## 1.0.1
- Bản đầu tiên: bot chat Gemini cho NetTruyen, nhiều tài khoản chạy cùng lúc.
- Quản lý tài khoản (bên phải): thêm/đăng nhập nhiều tài khoản, bật/tắt từng tài khoản, sửa riêng từng tài khoản.
- Mỗi tài khoản: Gemini API key chính và dự phòng, mô hình, lệnh gọi, tên gọi và tên gọi khác (nhận diện không dấu, chịu sai chính tả nhẹ), prompt hồ sơ riêng, giới hạn ký tự.
- Bot chắc chắn trả lời khi bị nhắc tên/lệnh; bot trả lời bot tối đa 2 tin liên tiếp (chống vòng lặp).
- Cài đặt (bên trái): màu nền, hình nền, delay chat/đổi key/tự kết nối, lịch chạy theo giờ-ngày-tháng-năm, giới hạn ký tự, từ cấm, chạy ngầm, xuất/nhập cấu hình.
- Chọn mô hình Gemini từ danh sách tải trực tiếp từ Google, kèm mức dùng app tự đếm theo ngày.
- Chat thử trước khi bật bot; thống kê số tin đã gửi.
