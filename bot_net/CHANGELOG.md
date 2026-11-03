# Bot Net - Lịch sử phiên bản

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
