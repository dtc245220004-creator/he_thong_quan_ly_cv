# Task Tracker

Task Tracker là ứng dụng quản lý công việc bằng React + Vite, Node.js + Express
và MySQL. Người dùng chỉ truy cập công việc của mình; quyền quản trị được kiểm
tra ở backend. Tài khoản demo là tùy chọn, chỉ khởi tạo bằng lệnh CLI ở môi
trường development/test và không được tạo tự động.

## 1. Phần mềm cần cài

- Node.js 22.12 trở lên và npm.
- MySQL Server 8 trở lên.
- MySQL Workbench để tạo schema, xem và quản lý dữ liệu.

MySQL Workbench là công cụ quản trị; MySQL Server mới là dịch vụ lưu trữ. Dự
án hiện không định nghĩa Docker Compose, Nginx, Prometheus, Grafana, Loki hay
Promtail. Các dịch vụ này không cần cho cách chạy Node/Vite dưới đây.

## 2. Cài MySQL Server và tạo database

Khởi động dịch vụ MySQL Server. Mở MySQL Workbench, kết nối tới server local
(thường là `127.0.0.1:3306`) rồi chạy:

```sql
CREATE DATABASE IF NOT EXISTS task_tracker
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Không chạy lệnh xóa schema/database. Nếu đã có database với tên khác, cấu hình
`DB_NAME` tương ứng; ứng dụng không tự xóa hay tạo lại database.

## 3. Cấu hình môi trường

Tại thư mục gốc, sao chép `.env.example` thành `.env` và nhập thông tin MySQL
local của bạn:

```dotenv
PORT=3001
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=mat_khau_mysql_cua_ban
DB_NAME=task_tracker
VITE_API_BASE_URL=/api
VITE_BACKEND_URL=http://localhost:3001
CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
SESSION_COOKIE_SAME_SITE=Lax
```

Không commit `.env` và không ghi mật khẩu thật vào source code. Trong môi
trường deploy cần đặt `CLIENT_ORIGIN` thành origin chính xác của frontend.
Frontend và API nên được phục vụ cùng site. Nếu cần cookie cross-site, chỉ
dùng HTTPS, đặt `SESSION_COOKIE_SAME_SITE=None`, và cấu hình CORS origin cụ
thể; không dùng wildcard origin với cookie.

## 4. Cài dependencies và khởi tạo schema

```powershell
npm install
npm run db:init
npm run db:check
```

Script khởi tạo tạo các bảng `users`, `auth_sessions`, `tasks`,
`admin_activity`, `admin_guard` và token đặt lại mật khẩu nếu chưa có; bổ sung
avatar, `completed_at`, khóa seed và các index còn thiếu. Script không drop
bảng, không tự động seed dữ liệu. Lịch sử hoàn
thành cũ không thể khôi phục đáng tin cậy nên các task `Done` hiện có được giữ
`completed_at = NULL`, không bị gán thời gian hiện tại. Chạy lại an toàn trên
schema ứng dụng.

Nếu database đã có công việc từ phiên bản chưa có tài khoản, các hàng đó được
giữ nguyên với `owner_id` rỗng và không xuất hiện trong tài khoản mới. Hãy
chủ động quyết định cách phân quyền/chuyển những dữ liệu cũ trong Workbench;
không tự động gán chúng cho một người dùng.

## 5. Chạy ứng dụng

Khởi động cả backend và frontend:

```powershell
npm run dev
```

Hoặc mở hai terminal tại thư mục gốc:

```powershell
npm run dev:backend
npm run dev:frontend
```

- Website: http://localhost:5173
- API health: http://localhost:3001/health

Mở website, chọn **Đăng ký**, tạo tài khoản, sau đó đăng nhập. Đăng ký chỉ tạo
tài khoản trong MySQL; người dùng cần đăng nhập riêng. Cookie phiên `HttpOnly`
được lưu bằng session token ngẫu nhiên, database chỉ lưu hash token và thời
hạn. Mật khẩu được hash bằng bcryptjs. Khi đăng xuất, session bị thu hồi ở
backend.

## 6. Tính năng

- Landing page tiếng Việt, trang đăng ký và đăng nhập.
- Ảnh bàn làm việc không có người từ Unsplash được lưu tại
  `frontend/public/images/task-workspace.jpg`; có ảnh SVG dự phòng.
- Dashboard thống kê từ MySQL; danh sách công việc sắp đến hạn và mới cập nhật.
- Lịch tháng/tuần/ngày, lọc trạng thái/ưu tiên và tạo task theo ngày chọn.
- Biểu đồ cột/đường thống kê hoàn thành theo ngày/tháng/năm từ `completed_at`.
- Hồ sơ cá nhân lưu avatar riêng trong MySQL, cập nhật tên và đổi mật khẩu có
  xác minh; Admin có hồ sơ và khu vực quản trị riêng.
- Quên/đặt lại mật khẩu qua email SMTP tùy chọn; không phát hành token khi
  dịch vụ email chưa được cấu hình.
- Nhật ký Admin ghi đăng nhập/đăng xuất cùng thay đổi vai trò/trạng thái; có
  tìm kiếm, lọc và phân trang.
- Tạo, xem chi tiết, sửa, đổi trạng thái và xóa công việc.
- Tìm theo tiêu đề/mô tả; lọc trạng thái, ưu tiên, hạn; sắp xếp và phân trang
  tại API.
- Backend xác thực session, kiểm tra đầu vào, giới hạn quyền truy cập theo
  `owner_id` và dùng truy vấn MySQL tham số hóa.
- Dữ liệu nghiệp vụ được lưu MySQL; frontend không dùng localStorage làm
  database.

## 7. REST API

| Phương thức | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/health` | Công khai | Liveness của backend |
| POST | `/api/auth/register` | Công khai | Tạo tài khoản thường |
| POST | `/api/auth/login` | Công khai | Xác thực và tạo phiên |
| GET | `/api/auth/me` | Phiên hợp lệ | Thông tin tài khoản hiện tại |
| POST | `/api/auth/logout` | Công khai, thu hồi cookie gửi kèm | Thu hồi session và xóa cookie |
| POST | `/api/auth/forgot-password` | Công khai | Gửi hướng dẫn qua SMTP, không tiết lộ email có tài khoản hay không |
| POST | `/api/auth/reset-password` | Công khai | Đặt mật khẩu bằng token một lần có thời hạn |
| GET | `/api/tasks` | Phiên hợp lệ | Danh sách phân trang, tìm kiếm/lọc/sắp xếp |
| GET | `/api/tasks/:id` | Phiên hợp lệ | Chi tiết công việc thuộc tài khoản |
| POST | `/api/tasks` | Phiên hợp lệ | Tạo công việc với chủ sở hữu lấy từ session |
| PUT | `/api/tasks/:id` | Phiên hợp lệ | Cập nhật công việc thuộc tài khoản |
| PATCH | `/api/tasks/:id/status` | Phiên hợp lệ | Cập nhật trạng thái |
| PATCH | `/api/tasks/:id` | Phiên hợp lệ | Cập nhật một phần trường được hỗ trợ |
| DELETE | `/api/tasks/:id` | Phiên hợp lệ | Xóa công việc thuộc tài khoản |
| GET | `/api/dashboard/stats` | Phiên hợp lệ | Thống kê, công việc sắp hạn và mới cập nhật |
| GET | `/api/calendar?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | User/Admin | Công việc trong cửa sổ lịch (tối đa 42 ngày), lọc `status`, `priority` |
| GET | `/api/progress/summary?from=...&to=...` | User/Admin | Tổng hợp hoàn thành, hôm nay, tháng này, tỷ lệ nhóm task tạo trong kỳ và so sánh kỳ trước |
| GET | `/api/progress/completions?groupBy=day\|month\|year&from=...&to=...` | User/Admin | Chuỗi số lượng hoàn thành theo khoảng ngày |
| GET, PATCH | `/api/profile` | User/Admin | Xem hồ sơ/thống kê, cập nhật tên; email và vai trò chỉ đọc |
| GET, PUT | `/api/profile/avatar` | User/Admin | Đọc/tải ảnh PNG/JPEG riêng tư (tối đa 2 MB) |
| PATCH | `/api/profile/password` | User/Admin | Đổi mật khẩu sau khi xác minh mật khẩu hiện tại; thu hồi các phiên khác |
| GET | `/api/admin/stats` | Admin | Thống kê thành viên và công việc có chủ sở hữu |
| GET | `/api/admin/users` | Admin | Tìm kiếm/lọc/phân trang thành viên; không trả password hash |
| GET | `/api/admin/users/:id` | Admin | Chi tiết cơ bản và thống kê task của thành viên |
| GET | `/api/admin/users/:id/tasks` | Admin | Task phân trang của một thành viên |
| PATCH | `/api/admin/users/:id` | Admin | Cập nhật tên hiển thị và ghi nhật ký |
| PATCH | `/api/admin/users/:id/status` | Admin | Kích hoạt/vô hiệu hóa; khóa sẽ thu hồi session |
| PATCH | `/api/admin/users/:id/role` | Admin | Đổi vai trò; đăng ký công khai luôn tạo user |
| GET | `/api/admin/tasks` | Admin | Danh sách task hệ thống có phân trang/lọc theo chủ sở hữu, trạng thái, ưu tiên và hạn |
| GET | `/api/admin/activity` | Admin | Nhật ký đăng nhập/đăng xuất, cập nhật hồ sơ, đổi vai trò/trạng thái và sự kiện mẫu |

`GET /api/tasks` nhận `page`, `pageSize` (tối đa 100), `search`, `status`,
`priority`, `due` (`overdue`, `upcoming`, `none`), `sort` (`created`, `due`,
`status`, `priority`) và `order` (`asc`, `desc`). Trạng thái trong database là
`To do`, `In Progress`, `Done`; ưu tiên là `Low`, `Medium`, `High`.

`PATCH /api/profile/password` nhận `currentPassword`, `newPassword` và
`passwordConfirmation` trong JSON body. Mật khẩu mới cần tối thiểu 10 ký tự,
chữ hoa, chữ thường, chữ số và tối đa 72 byte; xác minh mật khẩu hiện tại
trước khi lưu hash bcrypt. Những session khác bị thu hồi, session hiện tại
được giữ lại.

Quên mật khẩu cần cấu hình `SMTP_HOST`, `SMTP_FROM` và tùy chọn `SMTP_PORT`
(mặc định 587), `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`. Khi thiếu host
hoặc from, API báo rõ email chưa được cấu hình và không tạo token/giả vờ gửi.
Khi có SMTP, token ngẫu nhiên chỉ được lưu dạng hash trong
`password_reset_tokens`, hết hạn sau 30 phút, dùng một lần và giới hạn tối đa
ba yêu cầu mỗi email/IP trong 15 phút. Đặt mật khẩu lại sẽ thu hồi mọi phiên.
SMTP credentials chỉ được cung cấp qua secrets của môi trường.

`GET /api/admin/activity` nhận `page`, `limit` (tối đa 100), `search`,
`action` (`user.status`, `user.role`, `user.profile`, `auth.login`, `auth.logout`, `demo.seed`),
`adminId`, `from` và `to` (`YYYY-MM-DD`, bao gồm ngày kết thúc). API trả thông
tin quản trị viên để điền bộ lọc cùng tổng số trang. Sự kiện `demo.seed` là dữ
liệu minh họa được đánh dấu riêng, không đại diện cho thao tác quản trị thật.

Calendar/progress không nhận `userId`: chủ sở hữu luôn lấy từ phiên đã xác thực.
Progress date/time được ghi và nhóm theo UTC. Chỉ thao tác chuyển task sang
`Done` mới tạo `completed_at`; mở lại task sẽ đặt lại trường này thành `NULL`.
Tỷ lệ hoàn thành là phần trăm task được tạo trong kỳ đang có trạng thái `Done`;
số hoàn thành trong khoảng là số task có `completed_at` trong khoảng đó.

## 8. Dữ liệu demo và Admin

### Ba tài khoản demo có lịch sử

1. Dùng database development riêng, chạy `npm run db:init`.
2. Trong `.env`, đặt:

   ```dotenv
   NODE_ENV=development
   DEMO_SEED_ENABLED=true
   DEMO_USER_PASSWORD=choose_a_private_password_at_least_16_chars
   ```

3. Chạy `npm run seed:demo`. Script tạo ba tài khoản user sau và 24 công việc
   riêng cho mỗi người (72 công việc tổng cộng), với trạng thái/ưu tiên đa dạng,
   việc quá hạn và ngày hoàn thành phân bố trong khoảng 5-6 tuần:

   | Email | Tên hiển thị | Vai trò |
   | --- | --- | --- |
   | `user1@tasktracker.local` | Nguyễn Minh Anh | user |
   | `user2@tasktracker.local` | Trần Hoàng Nam | user |
   | `user3@tasktracker.local` | Lê Thu Hà | user |

   Cả ba tài khoản dùng chung mật khẩu lấy từ `DEMO_USER_PASSWORD`; mật khẩu
   được bcrypt hash và không in ra log. Tài khoản Admin có mật khẩu riêng.

Seed idempotent qua `seed_key`, chạy trong một transaction và in số tài khoản/
hoạt động mẫu mới so với đã có. Tám hoạt động quản trị minh họa được đánh dấu
`Mẫu minh họa` và dùng khóa riêng để chạy lại không tạo trùng. Chạy lại không
sửa mật khẩu, tên, quyền hay công việc hiện có. Nếu một email mẫu thuộc
Admin/tài khoản bị khóa, seed dừng thay vì sửa nó. Không chạy trong production;
script yêu cầu
`NODE_ENV=development` hoặc `test` và `DEMO_SEED_ENABLED=true`.

### Khởi tạo Admin

Đặt thông tin riêng trong `.env` (không commit hoặc chia sẻ các giá trị này):

```dotenv
ADMIN_EMAIL=admin@tasktracker.local
ADMIN_NAME=Quản trị viên
ADMIN_PASSWORD=choose_a_unique_password_at_least_16_chars
```

Chạy thủ công `npm run admin:create` sau `npm run db:init`. Nếu email chưa có,
lệnh tạo Admin với mật khẩu băm; nếu tài khoản đã tồn tại và đang hoạt động,
chỉ cấp vai trò `admin`, không đổi password/profile. Không có Admin mặc định
hoặc tự tạo lúc server khởi động. Với môi trường production, cấp quyền phải là
một thao tác vận hành có chủ đích với biến môi trường bí mật.

Admin có thể tìm/lọc/phân trang thành viên, xem task, cập nhật tên hiển thị,
kích hoạt/vô hiệu hóa tài khoản và đổi role. Email và thông tin xác thực không
được chỉnh sửa tại màn hình quản trị. Nhật ký hoạt động hỗ trợ lọc theo hành động/quản trị viên/
khoảng ngày, tìm kiếm và phân trang; sự kiện seed được đánh dấu rõ là mẫu.
Đăng nhập/đăng xuất Admin và thay đổi hồ sơ/quyền/trạng thái được ghi với mô tả và
đối tượng tác động. Danh sách task hệ thống hỗ trợ lọc chủ sở hữu và công việc
quá hạn. Vô hiệu hóa thu hồi session hiện có; lần gọi API tiếp theo
nhận 401. Không thể tự hạ quyền/vô hiệu hóa Admin đang đăng nhập hoặc vô hiệu
hóa/hạ quyền Admin cuối cùng. Thay đổi quyền/trạng thái chạy trong transaction,
được tuần tự hóa qua `admin_guard` để tránh đồng thời vô hiệu hóa Admin cuối.
Avatar được giới hạn PNG/JPEG, tối đa 2 MB, kiểm tra chữ ký/độ phân giải, lưu
trong MySQL và chỉ đọc qua session đã xác thực. Email hồ sơ vẫn chỉ đọc vì chưa
có quy tắc đổi email/xác minh địa chỉ mới. Xóa vĩnh viễn chưa được bật: khóa
ngoại hiện cascade công việc/session khi xóa người dùng và chưa có chính sách
lưu giữ dữ liệu.

Các sự kiện được lưu trong `admin_activity`; migration thêm metadata loại/ID
đối tượng, mô tả và `seed_key` duy nhất cho mẫu idempotent mà không xóa nhật
ký cũ. Không có API xóa hàng loạt.

Để khởi tạo bộ tài khoản cục bộ: đặt `ADMIN_EMAIL`, `ADMIN_NAME`,
`ADMIN_PASSWORD` trong `.env`, sau đó chạy `npm run admin:create`. Lệnh chỉ
được gọi thủ công, không chạy cùng seed demo và không tự chạy khi server khởi
động. Nếu email đã tồn tại và tài khoản đang hoạt động, script chỉ cấp quyền
Admin mà không thay mật khẩu hoặc hồ sơ; xác nhận email trước khi chạy.

Để kiểm tra: đăng nhập từng email user ở trên bằng mật khẩu
`DEMO_USER_PASSWORD`, kiểm tra mỗi tài khoản chỉ thấy công việc của mình rồi mở
`/calendar` và `/progress`. Đăng xuất và đăng nhập
`admin@tasktracker.local` bằng `ADMIN_PASSWORD` để mở `/admin`, `/admin/users`,
`/admin/tasks`, `/admin/activity`. Gọi API Admin bằng tài khoản user phải nhận
403.

Ảnh không có người trên hero được lưu cục bộ tại
`frontend/public/images/task-workspace.jpg`; biểu mẫu xác thực dùng ảnh desk
và SVG hiện có làm ảnh dự phòng.

## 9. Kiểm tra

```powershell
npm test
npm run lint
npm run build
```

`npm run test:integration` chạy MySQL thật: xác thực, CRUD, calendar/progress,
role Admin, phân trang, thu hồi session tài khoản bị khóa và audit log. Test
tạo dữ liệu tạm duy nhất rồi xóa chúng trong khối dọn dẹp. Chỉ chạy khi `.env`
đã cấu hình, MySQL đang chạy và đã thực hiện `npm run db:init`. Không coi unit
test/build thay thế cho việc xác minh thao tác trực tiếp trên website.

## 10. Xử lý lỗi thường gặp

- **Connection refused:** khởi động MySQL Server, kiểm tra `DB_HOST` và
  `DB_PORT`.
- **Access denied:** kiểm tra `DB_USER`/`DB_PASSWORD` trong `.env`.
- **Unknown database:** tạo database bằng Workbench, xác nhận `DB_NAME`.
- **Thiếu cột/bảng:** chạy `npm run db:init`, xem lỗi và kiểm tra quyền DDL của
  tài khoản MySQL.
- **Không gọi được API:** kiểm tra backend ở cổng 3001, Vite proxy và
  `VITE_BACKEND_URL`.
- **CORS/phiên không hoạt động khi deploy:** đặt origin frontend chính xác
  trong `CLIENT_ORIGIN`, dùng HTTPS nếu cookie `Secure`/cross-site cần thiết,
  không cấu hình wildcard.
- **Không thấy công việc cũ:** các bản ghi chưa có `owner_id` vẫn được giữ
  nguyên nhưng không hiển thị cho tài khoản nào; cần phân quyền có chủ đích.
