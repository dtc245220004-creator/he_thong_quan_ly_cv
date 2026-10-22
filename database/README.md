# PostgreSQL

Hệ thống sử dụng PostgreSQL 16 và pgAdmin 4 thông qua Docker Compose. Schema
nguồn đặt tại `database/schema.sql`; API chạy `backend/src/init-db.js` khi
container khởi động, tạo bảng/index/trigger và một dòng khóa Admin theo cách
idempotent.

## Truy cập bằng pgAdmin

1. Chạy `docker compose up -d`.
2. Mở <http://localhost:5050> và đăng nhập bằng `PGADMIN_DEFAULT_EMAIL` cùng
   `PGADMIN_DEFAULT_PASSWORD` trong file `.env`.
3. Add New Server:
   - Host: `postgres`
   - Port: `5432`
   - Database: giá trị `DB_NAME` (mặc định `task_tracker`)
   - User/password: `DB_USER` / `DB_PASSWORD`
4. Xác nhận các bảng `users`, `tasks`, `auth_sessions`, `admin_activity`,
   `admin_guard`, `password_reset_tokens`.

PostgreSQL không publish port ra host. pgAdmin chỉ bind `127.0.0.1:5050`;
database role ứng dụng chỉ sở hữu database app, không phải PostgreSQL
superuser. Exporter có role `DB_MONITOR_USER` riêng với quyền PostgreSQL
`pg_monitor` và `CONNECT`. Không dùng tài khoản `postgres` trong ứng dụng.

## Chạy local ngoài Docker

Tạo database và role ứng dụng bằng tài khoản quản trị PostgreSQL riêng, sau
đó đặt `DB_HOST=localhost`, `DB_PORT=5432`, `DB_USER`, `DB_PASSWORD`,
`DB_NAME` trong `.env`:

```sql
CREATE ROLE task_tracker LOGIN PASSWORD 'set-a-unique-strong-password';
CREATE DATABASE task_tracker OWNER task_tracker;
```

Chạy từ thư mục gốc:

```powershell
npm install
npm run db:init
npm run db:check
```

Không dùng mật khẩu mẫu trong môi trường thực. `.env` bị loại khỏi Git. Schema
không tự chuyển dữ liệu MySQL cũ; cần sao lưu và migration riêng nếu cần giữ
dữ liệu.
