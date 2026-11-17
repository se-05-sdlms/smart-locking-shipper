# Hỗ trợ tại tủ cho Shipper

Phụ thuộc backend PR #207 (BE #187), cùng quyền phụ trách có hiệu lực của BE #195.

Liên kết hỗ trợ xuất hiện khi có mã tủ ở trang đầu và các bước gửi, lấy hàng trả, chờ duyệt, mở ngăn và lỗi. Mở liên kết để tải tên liên hệ công việc, số công khai, giờ hỗ trợ hoặc hướng dẫn dự phòng.

API công khai `/api/lockers/public/by-code/{code}/support` đi qua rewrite `/backend`. Không truyền guest session token hay OTP. Liên hệ được tải lại khi mở, trở lại tab, mỗi phút trong lúc mở và trước khi gọi.

Có thể gọi hoặc sao chép số khả dụng, sao chép mã tủ và mã bản ghi giao dịch. Clipboard cần trình duyệt hỗ trợ và secure context; khi trình duyệt từ chối, thông tin vẫn có thể chọn để sao chép thủ công. Không lưu liên hệ vào storage.

Build và lint không thay thế kiểm chứng API, dialer và clipboard trên trình duyệt điện thoại thật.
