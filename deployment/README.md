# Triển khai

Repository hiện chưa có cấu hình Docker/Compose, Nginx, Prometheus, Grafana,
Loki hoặc Promtail. Hướng dẫn này không đại diện cho một cấu hình triển khai
production đã được kiểm thử.

Khi triển khai, cần cung cấp MySQL Server riêng, cấu hình các biến `DB_*`,
đặt `CLIENT_ORIGIN` thành origin frontend chính xác, bật HTTPS và chạy backend
với `NODE_ENV=production` để cookie phiên có cờ `Secure`. Có thể phục vụ
frontend và API cùng site qua reverse proxy; hiện chưa có reverse proxy hay
pipeline deploy trong repository.

Kiểm tra cú pháp schema và kết nối ở môi trường đích bằng `npm run db:init` và
`npm run db:check` trước khi khởi chạy ứng dụng. Không sử dụng dữ liệu seed
hoặc thông tin đăng nhập mẫu.
