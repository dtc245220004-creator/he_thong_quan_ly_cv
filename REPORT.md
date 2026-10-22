<style>
@media print {
  .page-break { page-break-after: always; break-after: page; }
}
</style>

# BÁO CÁO ĐỒ ÁN

## TRIỂN KHAI VÀ QUẢN TRỊ HỆ THỐNG PHẦN MỀM

### ĐỀ TÀI 24: HỆ THỐNG QUẢN LÝ CÔNG VIỆC

**Sinh viên:** [Họ và tên]  
**Mã số sinh viên:** [Mã số sinh viên]  
**Lớp:** [Lớp]  
**Khoa/Viện:** [Khoa/Viện]  
**Giảng viên hướng dẫn:** [Họ tên giảng viên]  
**Trường:** [Tên trường]  
**Năm học:** [Năm học]

> Trước khi nộp: điền thông tin cá nhân, tên trường/lớp/giảng viên; xuất thành
> PDF theo mẫu bìa của trường; thay các khung `[BỔ SUNG ẢNH ...]` bằng ảnh
> chụp demo thật. Không đưa `.env`, mật khẩu, token hoặc dữ liệu cá nhân vào
> báo cáo.

<div class="page-break"></div>

## TÓM TẮT

Đề tài xây dựng hệ thống quản lý công việc cá nhân/nhóm, đồng thời triển khai
các thành phần hạ tầng thường gặp trong vận hành phần mềm. Người dùng có thể
tạo tài khoản, đăng nhập, quản lý công việc theo trạng thái và mức ưu tiên,
đặt ngày bắt đầu/hạn hoàn thành, tìm kiếm, lọc, xem lịch và theo dõi tiến độ.
Ứng dụng có phân quyền quản trị và mỗi công việc chỉ được truy cập theo chủ
sở hữu đã xác thực.

Kiến trúc ứng dụng gồm giao diện React/Vite, API Node.js/Express và cơ sở dữ
liệu PostgreSQL. pgAdmin cung cấp giao diện quản trị dữ liệu. Nginx phục vụ
frontend tĩnh, chuyển tiếp yêu cầu API và Grafana, chuyển HTTP sang HTTPS
bằng chứng thư tự ký phục vụ demo, đồng thời thiết lập security headers.
Prometheus lấy metrics từ API, Nginx exporter, PostgreSQL exporter và
cAdvisor; Grafana cung cấp dashboard tổng hợp. Promtail chuyển log container
được lọc theo project Compose tới Loki để tra cứu bằng LogQL.

Toàn bộ cấu hình triển khai được tổ chức trong Docker Compose, với các mạng
riêng cho traffic web, database, monitoring và Docker API read-only. API và
Nginx chạy non-root, giới hạn capability và dùng filesystem read-only. Role
ứng dụng PostgreSQL không phải superuser; role scrape metrics được tách riêng.

**Phạm vi xác minh trong bản báo cáo này:** kiểm thử unit/API, lint frontend
và backend, build frontend và kiểm tra cú pháp Compose đã chạy thành công.
Docker Engine trên máy làm việc hiện không hoạt động, do đó chưa thể xác nhận
việc pull/build image, khởi động container, tích hợp PostgreSQL thật, Grafana,
Loki/LogQL hoặc chụp ảnh giao diện runtime. Các phần này được ghi rõ là bước
cần xác minh trực tiếp trước khi trình diễn/nộp báo cáo.

<div class="page-break"></div>

## 1. GIỚI THIỆU ĐỀ TÀI

### 1.1. Bối cảnh

Trong công việc học tập hoặc dự án nhóm, nhiệm vụ thường có người phụ trách,
thời hạn và trạng thái khác nhau. Nếu theo dõi bằng danh sách rời rạc, người
dùng khó biết nhiệm vụ nào quá hạn, đang thực hiện hoặc đã hoàn thành. Đề tài
xây dựng một ứng dụng web tập trung để lưu, phân loại và xem lại công việc,
đồng thời triển khai ứng dụng trong môi trường gần với hệ thống thực tế.

### 1.2. Mục tiêu

1. Xây dựng website quản lý công việc có đăng nhập và phân quyền.
2. Lưu dữ liệu nghiệp vụ trên PostgreSQL và hỗ trợ quản trị bằng pgAdmin.
3. Đóng gói các dịch vụ bằng Docker Compose để có thể khởi động thống nhất.
4. Đặt Nginx phía trước ứng dụng làm reverse proxy và thiết lập HTTPS/demo
   security headers.
5. Thu thập metrics bằng Prometheus, trực quan hóa bằng Grafana.
6. Tập trung log bằng Loki/Promtail, chuẩn bị truy vấn LogQL phục vụ kiểm tra.
7. Hạn chế quyền container, phân tách network và bảo vệ thông tin cấu hình.

### 1.3. Phạm vi

Phiên bản hiện tại tập trung vào quản lý task, PostgreSQL, pgAdmin, Nginx,
monitoring và logging cho môi trường thực hành. HTTPS sử dụng chứng thư tự
ký, không thay thế chứng thư từ CA tin cậy. Báo cáo không tuyên bố hệ thống
đã được kiểm thử production, có backup/restore tự động hoặc Alertmanager.

**[BỔ SUNG HÌNH 1: Ảnh website sau khi chạy thành công tại `https://localhost`]**

<div class="page-break"></div>

## 2. YÊU CẦU VÀ ĐỐI CHIẾU

| Yêu cầu | Thành phần thực hiện | Tình trạng cần ghi nhận |
|---|---|---|
| Mã nguồn/cấu hình, README, GitHub | Repository, README, Compose và cấu hình dưới `deployment/` | Cấu hình đã có trong working tree; cần kiểm tra repo GitHub, tên tài khoản theo MSSV, push và đủ 3 commit có ý nghĩa |
| Ứng dụng và database | React/Vite, Express, PostgreSQL, pgAdmin | Mã ứng dụng/schema đã có; runtime PostgreSQL/pgAdmin phải được kiểm tra sau khi Docker chạy |
| Nginx reverse proxy | HTTPS, `/api`, `/health`, `/grafana`, SPA fallback | Cấu hình đã viết; chưa runtime-verify do Docker daemon chưa chạy |
| Prometheus/Grafana | API metrics, exporters, cAdvisor, dashboard JSON provision | Cấu hình scrape/dashboard đã viết; cần kiểm tra Targets và dashboard sau khi chạy |
| Loki/Promtail/LogQL | Promtail discovery theo Compose project, Loki filesystem, truy vấn mẫu | Cấu hình và truy vấn đã viết; cần xác nhận log xuất hiện trên Windows Docker Desktop |
| Hardening | Non-root, cap drop, read-only, networks, PostgreSQL roles, headers | Đã cấu hình trong mã; cần kiểm tra trạng thái container thực tế và quyền mount |
| Báo cáo/demo | Tài liệu này, README, ảnh chụp | Bản thảo đã tạo; cần điền thông tin sinh viên và ảnh demo thật |

### Kết quả code ứng dụng

Các luồng hiện có gồm đăng ký/đăng nhập, cookie phiên, quản lý task, phân
trang/tìm kiếm/lọc, dashboard, calendar, progress, hồ sơ người dùng và khu vực
Admin. Các truy vấn task lọc theo chủ sở hữu lấy từ session; mật khẩu hash
bằng bcrypt; SQL dùng tham số bind. Mã schema dùng khóa ngoại và ràng buộc
CHECK cho role, status và priority.

### Thay đổi nền tảng dữ liệu

Phiên bản trước của repository dùng MySQL. Bản triển khai theo đề chuyển driver,
cấu hình và schema sang PostgreSQL. Đây **không phải** quy trình chuyển dữ liệu
tự động từ MySQL; nếu cần giữ dữ liệu cũ phải sao lưu và lập migration riêng.

<div class="page-break"></div>

## 3. KIẾN TRÚC HỆ THỐNG

Các dịch vụ được định nghĩa trong `compose.yaml`. Mạng `edge` nhận traffic
web; mạng `database` và `monitoring` là internal network; mạng `docker-api`
chỉ kết nối Promtail tới socket proxy được giới hạn API đọc. Nginx là điểm
vào web. PostgreSQL và API không publish port trực tiếp ra host.

```text
Người dùng
   |
   | HTTPS :443 / HTTP :80
   v
 Nginx ---- /api, /health ----> API Node/Express ----> PostgreSQL
   |                                  |                    ^
   +---- /grafana ----------------> Grafana               |
                                      |                    |
                         Prometheus -+---- exporters ------+
                                      |
 Promtail ---- Docker log files ----> Loki ----> Grafana Explore
    |
    +---- Docker Socket Proxy (API GET giới hạn theo cấu hình)
```

### Vai trò dịch vụ

| Dịch vụ | Vai trò |
|---|---|
| `nginx` | Phục vụ frontend, reverse proxy, TLS và security headers |
| `api` | REST API, xác thực, nghiệp vụ task và `/metrics` |
| `postgres` | Lưu trữ nghiệp vụ; không publish cổng ra host |
| `pgadmin` | Giao diện quản trị PostgreSQL, bind localhost |
| `prometheus` | Scrape metrics từ API, exporters và cAdvisor |
| `grafana` | Dashboard metrics và Explore với datasource Prometheus/Loki |
| `loki`, `promtail` | Lưu log tập trung và chuyển log Docker |
| `postgres-exporter`, `nginx-exporter` | Metrics database và web server |
| `cadvisor` | CPU/RAM và chỉ số container |
| `docker-socket-proxy` | Cung cấp API Docker cần thiết cho service discovery, chặn POST |

**[BỔ SUNG HÌNH 2: Sơ đồ container/network xuất từ Docker Desktop hoặc vẽ lại]**

<div class="page-break"></div>

## 4. ỨNG DỤNG VÀ CƠ SỞ DỮ LIỆU

### 4.1. Chức năng

Người dùng có thể tạo/sửa/xóa task và thay đổi trạng thái; mỗi task có tiêu
đề, mô tả, ngày bắt đầu, hạn, mức ưu tiên và người phụ trách. Danh sách hỗ
trợ tìm kiếm, lọc, sắp xếp và phân trang. Dashboard tổng hợp trạng thái, task
sắp hạn và task cập nhật gần đây. Calendar hiển thị task theo khoảng ngày;
progress tính số task hoàn thành theo thời gian. Tài khoản Admin có chức năng
quản lý thành viên và audit activity.

### 4.2. Mô hình dữ liệu

- `users`: tài khoản, password hash, role, trạng thái, avatar.
- `tasks`: công việc, ngày, trạng thái, ưu tiên, owner và thời điểm hoàn tất.
- `auth_sessions`: hash token phiên và thời hạn.
- `admin_activity`: sự kiện quản trị, actor, target và JSONB details.
- `admin_guard`: khóa đồng bộ thao tác bảo vệ Admin cuối cùng.
- `password_reset_tokens`: token đặt lại mật khẩu ở dạng hash và thời hạn.

PostgreSQL dùng identity columns, `BOOLEAN`, `BYTEA`, `JSONB`, khóa ngoại,
unique constraint, CHECK constraint và indexes. Trigger cập nhật `updated_at`
cho user/task. Schema nguồn ở `database/schema.sql`; backend chạy
`backend/src/init-db.js` trước khi start server trong Compose.

### 4.3. Quản trị DB

pgAdmin bind tại `127.0.0.1:5050`. Sau khi đăng nhập, thêm PostgreSQL server
với host `postgres`, port `5432`, database/user/password theo `.env`. Cần chụp
ảnh Object Explorer thể hiện các bảng và ảnh query kiểm tra dữ liệu đã đăng ký.
Không dùng superuser `postgres` trong ứng dụng. Exporter dùng role riêng
`DB_MONITOR_USER`, có quyền `pg_monitor` và `CONNECT`.

**[BỔ SUNG HÌNH 3: pgAdmin hiển thị server, database và bảng `tasks`]**

<div class="page-break"></div>

## 5. DOCKER COMPOSE VÀ QUY TRÌNH TRIỂN KHAI

### 5.1. Cấu hình

`backend/Dockerfile` đóng gói API trên Node 22 Alpine, chạy UID/GID 1000.
`deployment/nginx/Dockerfile` build frontend nhiều stage và chạy Nginx
unprivileged. PostgreSQL dùng named volume; pgAdmin, Prometheus, Grafana và
Loki cũng có volume để giữ dữ liệu giữa các lần restart. Healthcheck PostgreSQL
được dùng làm điều kiện khởi động API.

### 5.2. Lệnh chạy

```powershell
Copy-Item .env.example .env
# Chỉ chạy Copy-Item nếu chưa có .env; nếu đã tồn tại, hợp nhất biến thủ công.
# Thay các mật khẩu mẫu bằng mật khẩu riêng, mạnh và không trùng nhau.
docker compose config
docker compose up -d --build
docker compose ps
```

Truy cập website tại `https://localhost`; `http://localhost` chuyển hướng
sang HTTPS. pgAdmin ở `http://localhost:5050`; Prometheus ở
`http://localhost:9090`; Grafana được phục vụ qua
`https://localhost/grafana/`.

### 5.3. Dữ liệu và vận hành

`docker compose down` dừng stack nhưng giữ volumes. `docker compose down -v`
xóa dữ liệu database, Grafana, Loki và Prometheus nên chỉ dùng khi đã sao lưu
và thực sự muốn reset. Thay mật khẩu trong `.env` sau khi volume PostgreSQL
đã khởi tạo không tự đổi mật khẩu trong database; cần ALTER ROLE và cập nhật
đồng bộ cấu hình exporter/API.

**[BỔ SUNG HÌNH 4: `docker compose ps` thể hiện các service healthy/up]**

<div class="page-break"></div>

## 6. NGINX REVERSE PROXY VÀ HTTPS

Nginx phục vụ các file build frontend và điều hướng các route SPA về
`index.html`. `/api/` được proxy tới API Node.js, `/health` chuyển tiếp health
check, còn `/grafana/` chuyển tiếp tới Grafana. Website ngoài người dùng chỉ
đi qua Nginx; API và PostgreSQL không được publish port.

HTTP port 80 chuyển hướng sang HTTPS port 443. Container tạo chứng thư tự ký
cho `localhost` khi khởi động; private key chỉ tồn tại trong `/tmp` của
container và không được commit. Trình duyệt cảnh báo chứng thư vì chưa có CA
tin cậy; cần xác nhận ngoại lệ trong môi trường demo để cookie `Secure` hoạt
động. Đây không phải chứng thư dùng cho website công khai.

Các header được thiết lập gồm HSTS, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy` và `Permissions-Policy`. Nginx ẩn phiên
bản server, giới hạn kích thước request body và chuyển tiếp các header host,
client IP, scheme tới API. Nginx exporter đọc `stub_status` trên cổng nội bộ
8081; cổng này không publish ra host.

Kiểm tra demo: mở `http://localhost` và xác nhận URL chuyển sang HTTPS; mở
DevTools/Network xem response headers; truy cập `/health`; tạo task và xác
nhận request `/api` đi qua Nginx. Không chụp/đưa token cookie vào báo cáo.

**[BỔ SUNG HÌNH 5: Website HTTPS và response headers trong DevTools]**

<div class="page-break"></div>

## 7. PROMETHEUS VÀ GRAFANA

API cung cấp endpoint `/metrics` bằng `prom-client`: metrics mặc định của
Node.js và histogram `http_request_duration_seconds` theo method, route,
status code. Labels route dùng template Express, tránh tạo chuỗi metric riêng
cho từng task ID. Endpoint không được proxy qua Nginx và chỉ tồn tại trên
network nội bộ giữa API và Prometheus.

Prometheus scrape theo chu kỳ 15 giây:

| Job | Target | Ý nghĩa |
|---|---|---|
| `task-tracker-api` | `api:3001/metrics` | Request rate/latency và Node.js |
| `nginx` | `nginx-exporter:9113` | Thống kê Nginx |
| `postgresql` | `postgres-exporter:9187` | PostgreSQL qua role monitoring |
| `containers` | `cadvisor:8080` | CPU, RAM và trạng thái container |

Datasource Prometheus được provision tự động vào Grafana. Dashboard
**Task Tracker - System Overview** có panel API request rate, latency p95,
CPU, memory, PostgreSQL availability và Nginx request rate. Trong Prometheus
có thể kiểm tra `up`, `pg_up`,
`rate(http_request_duration_seconds_count{route!="/metrics"}[5m])` và
`container_memory_working_set_bytes{name!=""}`.

Khi demo cần vào `Status → Targets`, xác nhận các target có trạng thái UP,
phát sinh một số traffic web rồi mở dashboard Grafana. Nếu panel trống, kiểm
tra target, tên metric, thời gian dashboard và log exporter trước khi chụp ảnh.

**[BỔ SUNG HÌNH 6: Prometheus Targets đều UP]**  
**[BỔ SUNG HÌNH 7: Dashboard Grafana có metrics API/container/DB/Nginx]**

<div class="page-break"></div>

## 8. LOKI, PROMTAIL VÀ LOGQL

Promtail dùng Docker service discovery thông qua `docker-socket-proxy`, chỉ
giữ container mang label Compose project `task-tracker`, gắn label service và
đọc file JSON log tương ứng. Socket proxy chỉ bật các endpoint cần thiết như
container listing/events; `POST` bị tắt. Log được chuyển qua network nội bộ
tới Loki, Loki lưu trên named volume. Grafana có datasource Loki để truy vấn
trong Explore.

Các truy vấn dùng trong demo:

```logql
{job="docker"}
{job="docker"} |= "error"
{job="docker"} |~ "(?i)(error|fail|exception)"
```

Truy vấn đầu xem tất cả log thuộc project; truy vấn thứ hai lọc chuỗi
`error`; truy vấn thứ ba lọc không phân biệt hoa thường các từ error/fail/
exception. Khi cần lọc một dịch vụ cụ thể, dùng thêm
`{job="docker", service="api"}` hoặc nhãn service tương ứng trong Explore.

Do môi trường phát triển là Windows, Docker Desktop chạy Docker Engine trong
môi trường Linux VM. Cần kiểm tra Promtail thực tế có đọc được đường dẫn log
container đã mount hay không; nếu không, xem `docker compose logs promtail`,
xác nhận Docker logging driver `json-file` và kiểm tra bind mount host. Không
được kết luận Loki hoạt động chỉ từ việc container ở trạng thái running: cần
hiển thị ít nhất một log stream và chạy thành công 2–3 truy vấn LogQL.

**[BỔ SUNG HÌNH 8: Grafana Explore truy vấn `{job="docker"}`]**  
**[BỔ SUNG HÌNH 9: Kết quả truy vấn lọc lỗi và truy vấn theo service]**

<div class="page-break"></div>

## 9. HARDENING VÀ QUẢN LÝ BÍ MẬT

1. **Non-root:** API chạy UID/GID 1000; Nginx chạy UID/GID 101.
2. **Least privilege:** API/Nginx bỏ toàn bộ Linux capabilities, bật
   `no-new-privileges`, dùng root filesystem read-only và chỉ cấp `/tmp`
   tmpfs.
3. **Network isolation:** `database`, `monitoring` và `docker-api` là internal
   networks; PostgreSQL/API/Loki không publish port. Nginx là điểm vào web;
   pgAdmin, Prometheus, Grafana bind loopback.
4. **Database roles:** app role là chủ database nhưng không phải superuser;
   exporter có role `pg_monitor` riêng; superuser chỉ dùng nội bộ lúc init.
5. **Secrets:** `.env` bị Git ignore, không được copy vào Docker image theo
   `.dockerignore`; yêu cầu mật khẩu riêng cho PostgreSQL admin, DB app,
   DB monitor, pgAdmin và Grafana.
6. **Web:** HTTPS demo, security headers, CORS origin rõ ràng, session cookie
   HttpOnly và Secure trong production, SQL bind parameters, bcrypt password
   hash và kiểm tra quyền sở hữu task.
7. **Monitoring surface:** exporter endpoints chỉ kết nối trong mạng nội bộ.
   Promtail được cấp quyền đọc log và kết nối socket proxy; cAdvisor cần các
   mount đọc host để thu thập container metrics. Hai thành phần này có quyền
   quan sát cao hơn API và cần được giữ nội bộ.

Các kiểm soát này phù hợp demo môn học, chưa thay thế quản lý secrets tập
trung, image scanning, backup mã hóa, TLS CA, firewall/IDS hay chính sách
retention production. Chứng thư tự ký và mật khẩu ví dụ trong file mẫu phải
được thay trước khi sử dụng.

**[BỔ SUNG HÌNH 10: Cấu hình non-root/read-only/network từ `docker inspect`]**

<div class="page-break"></div>

## 10. KIỂM THỬ VÀ RÀ SOÁT CODE

### 10.1. Kết quả đã thực hiện

| Lệnh/kiểm tra | Kết quả |
|---|---|
| `npm test` | Đạt: 14 test unit/API, gồm health, metrics, chuyển placeholder PostgreSQL và các luồng API |
| `npm run lint` | Đạt |
| `npm run build` | Đạt; Vite build bundle frontend production |
| `docker compose config --quiet` | Đạt khi dùng giá trị placeholder tạm không nhạy cảm cho biến bắt buộc |
| `git diff --check` | Đạt, không phát hiện whitespace error |
| Docker Engine | Không chạy: không kết nối được pipe `dockerDesktopLinuxEngine` |
| PostgreSQL integration test | Chưa chạy do Docker Engine chưa khởi động và `.env` cần cấu hình PostgreSQL |
| Dashboard, Nginx TLS, Loki/LogQL runtime | Chưa xác minh; cần demo sau khi stack khởi động |

### 10.2. Nội dung rà soát

Đã rà lại truy vấn MySQL đặc thù và chuyển sang PostgreSQL: `?` bind
parameters được chuyển thành `$n` trong lớp DB; boolean dùng kiểu PostgreSQL;
aggregate điều kiện chuyển sang `COUNT FILTER`; ngày giờ dùng interval,
`TO_CHAR`, `AT TIME ZONE`; insert cần ID dùng `RETURNING`; cập nhật/xóa kiểm
tra số hàng trả về. Schema được kiểm tra bằng ràng buộc PostgreSQL và trigger
`updated_at`.

Rà soát cấu hình triển khai xác nhận `.env` không được đưa vào Docker build
context, API/Nginx chạy non-root, PostgreSQL không publish cổng, và Promtail
lọc container theo project. Tuy nhiên, không thể kết luận tương thích runtime
của mọi image/config exporter hoặc mount Docker Desktop nếu chưa chạy Docker.

<div class="page-break"></div>

## 11. KỊCH BẢN DEMO VÀ MINH CHỨNG CẦN BỔ SUNG

### Kịch bản trình diễn

1. Chạy `docker compose config`, `docker compose up -d --build`,
   `docker compose ps`; chứng minh các service hoạt động.
2. Mở `https://localhost`, chấp nhận cảnh báo chứng thư demo, đăng ký user,
   đăng nhập và tạo công việc có hạn hoàn thành.
3. Mở pgAdmin, kết nối `postgres`, xem các bảng và task vừa tạo.
4. Mở Prometheus Targets, xác nhận API, Nginx, PostgreSQL và cAdvisor UP.
5. Mở Grafana dashboard, giải thích request rate, latency, CPU/RAM và
   PostgreSQL availability.
6. Mở Grafana Explore, chọn Loki, chạy 3 truy vấn LogQL ở Chương 8.
7. Mở DevTools hoặc `docker inspect` để trình bày HTTPS/security headers,
   non-root, read-only và network isolation.

### Danh sách ảnh để hoàn thiện báo cáo

- Ảnh 1: website Task Tracker đã đăng nhập.
- Ảnh 2: sơ đồ dịch vụ/container và network Compose.
- Ảnh 3: pgAdmin hiển thị PostgreSQL và bảng nghiệp vụ.
- Ảnh 4: `docker compose ps` và health status.
- Ảnh 5: HTTPS/security headers.
- Ảnh 6: Prometheus Targets.
- Ảnh 7: Grafana dashboard.
- Ảnh 8–9: Grafana Explore với truy vấn LogQL và kết quả.
- Ảnh 10: `docker inspect`/cấu hình chứng minh hardening.

Che email cá nhân nếu cần; tuyệt đối che mật khẩu, cookie, token và nội dung
`.env`. Ảnh phải được chụp từ lần chạy thật, không dùng ảnh minh họa thay cho
kết quả.

### GitHub và commit

Sau khi xác minh README và cấu hình `.env.example`, cần đẩy repository lên
GitHub bằng tài khoản/tên theo mã số sinh viên. Tạo ít nhất ba commit có nội
dung riêng biệt và rõ ràng, ví dụ: (1) PostgreSQL + ứng dụng, (2) Nginx +
hardening, (3) monitoring/logging + tài liệu. Bản làm việc này chưa tạo/push
commit và chưa xác minh username/repository GitHub.

<div class="page-break"></div>

## 12. KẾT LUẬN, HẠN CHẾ VÀ HƯỚNG PHÁT TRIỂN

Đề tài đã có phần mềm Task Tracker hoạt động ở mức mã nguồn, được chuyển từ
MySQL sang PostgreSQL và bổ sung bộ cấu hình triển khai Docker Compose cho
pgAdmin, Nginx, Prometheus, Grafana, Loki, Promtail và exporters. API có
Prometheus metrics; dashboard và LogQL mẫu được chuẩn bị. Một số kiểm thử
chạy thành công và xác nhận frontend build được.

Giới hạn quan trọng của kết quả hiện tại là Docker Engine chưa chạy tại môi
trường làm việc nên stack chưa được khởi động. Vì vậy PostgreSQL integration,
TLS trên Nginx, tình trạng Prometheus targets, dashboard, log stream Loki và
LogQL chưa có kết quả runtime. Báo cáo cũng chưa có ảnh demo thực tế, thông
tin sinh viên, link repository, tên tài khoản GitHub và lịch sử ba commit.
Các mục này phải hoàn thiện trước khi dùng báo cáo để nộp.

Hướng phát triển: chạy stack trên Docker Desktop/Engine có đủ RAM; xác nhận
healthcheck và logs từng service; khắc phục khác biệt log path trên Windows
nếu gặp; chạy PostgreSQL integration test; bổ sung backup/restore và kiểm
thử khôi phục; thay chứng thư tự ký nếu triển khai công khai; cấu hình alert
và retention phù hợp; tạo các commit theo yêu cầu và thêm ảnh vào báo cáo.

### Tài liệu tham khảo

1. PostgreSQL Documentation — <https://www.postgresql.org/docs/>
2. Docker Compose Documentation — <https://docs.docker.com/compose/>
3. Nginx Documentation — <https://nginx.org/en/docs/>
4. Prometheus Documentation — <https://prometheus.io/docs/>
5. Grafana Documentation — <https://grafana.com/docs/grafana/latest/>
6. Loki/LogQL Documentation — <https://grafana.com/docs/loki/latest/query/>
7. Promtail Documentation — <https://grafana.com/docs/loki/latest/send-data/promtail/>

<div class="page-break"></div>

## PHỤ LỤC A — LỆNH THAM KHẢO

```powershell
# Xem trạng thái và log
docker compose ps
docker compose logs -f api postgres nginx
docker compose logs -f prometheus grafana loki promtail

# Kiểm tra endpoint qua Nginx
curl.exe -k https://localhost/health

# Chạy unit/API tests tại máy phát triển
npm test
npm run lint
npm run build

# Chạy PostgreSQL integration test trong network nội bộ
docker compose run --rm --no-deps api node --test tests/postgres-integration.test.js

# Dừng stack, giữ volumes
docker compose down
```

Không chạy `docker compose down -v` nếu chưa sao lưu dữ liệu cần giữ. Không
đưa output lệnh chứa environment variables hoặc cấu hình bí mật vào phụ lục.
