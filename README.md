# 🚀 9router Auto-Patches & K12 Token-Aware Rotation Engine

Bộ công cụ tự động vá lỗi, tối ưu hóa hiệu năng, thêm tính năng quản lý hạn mức Quota và **Động cơ luân chuyển tài khoản K12 thông minh (K12 Token-Aware Rotation Engine)** cho [9router Proxy](https://github.com/9router/9router).

---

## ✨ Tính năng nổi bật (28 Patches Tích hợp)

### 🎓 1. K12 Token-Aware Rotation Engine (Patch 24 & 25)
- **Quản lý nghỉ ngơi thông minh:** Tự động điều chỉnh trạng thái tài khoản K12 dựa trên hạn mức token thực tế (Session % & Weekly %).
- **Scoring System:** Đánh giá ưu tiên tài khoản còn nhiều token nhất để kích hoạt (Active), đưa tài khoản hết token hoặc cần nghỉ vào trạng thái nghỉ (Resting).
- **Tuần hoàn linh hoạt:** Cho phép cài đặt duy trì từ **5% đến 100%** tài khoản hoạt động đồng thời (mặc định 20-30%).
- **Thời gian nghỉ tối ưu:**
  - Hết token Session ➔ Nghỉ đến thời điểm `session.resetAt` (~5h).
  - Hết token Weekly ➔ Nghỉ đến thời điểm `weekly.resetAt`.
  - Nghỉ xoay vòng định kỳ ➔ Nghỉ ngẫu nhiên 30-60 phút.
- **Emergency Mode:** Tự động khôi phục tài khoản có thời gian reset sớm nhất nếu tất cả tài khoản đều cạn token.

### 🛡️ 2. Bảo mật & Giao diện Dashboard (Patch 26 & 8)
- **Email Masking (Patch 26):** Tự động che định dạng email trên giao diện Quota Tracker và API Status để bảo mật (Ví dụ: `pha***uy@ye***.com.vn`, `wei***y9@ic***.com`).
- **Plan Badge (Patch 8):** Hiển thị nhãn gói tài khoản trực quan (K12, Plus, Pro, Free, Team, Enterprise).
- **Lọc theo gói tài khoản & Tắt/Bật theo hàng loạt (Patch 23):** Thêm nút thao tác nhanh theo loại gói.

### ⚡ 3. Tối ưu hiệu năng & Quota Management
- **Bulk Import (Patch 1):** Tự động chuẩn hóa dữ liệu khi import tài khoản hàng loạt (Codex, CPA JSON, sub2api).
- **Quota Performance & Hydration (Patch 20 & 14):** Tối ưu tải danh sách lớn (up to 500 accounts/page), chống giật lag và giảm thiểu lỗi Hydration.
- **Smart Priority (Patch 21):** Tự động sắp xếp thứ tự ưu tiên các tài khoản theo hạn mức khả dụng.

### 🧭 4. Cost-aware Codex Account Routing (Patch 28)
- **Codex chọn model, 9router chọn tài khoản:** 9router không phân loại công việc; nó chỉ lọc tài khoản phù hợp với model mà Codex đã yêu cầu.
- **Terra mặc định:** tác vụ mới thông thường dùng Terra và ưu tiên Free, Go, K12, Edu; nếu các gói này không khả dụng thì Terra có thể dùng Plus+.
- **Sol ngoại lệ:** Sol chỉ dùng Plus+ và fail closed khi không có tài khoản phù hợp, nên không tiêu quota Free/Go/K12/Edu.
- **Phiên đang chạy:** task cũ giữ model đã chọn; cần đổi model hoặc tạo lại task để chuyển từ Sol sang Terra.

---

## 🛠️ Yêu cầu hệ thống

- **Hệ điều hành:** Windows 10 / 11 (64-bit)
- **Node.js:** v18.x trở lên
- **PowerShell:** PowerShell 7 (`pwsh.exe`)
- **9router Proxy:** Đã cài đặt phiên bản 0.5.40 (hoặc mới hơn)

---

## 📥 Hướng dẫn Cài đặt

### Cách 1: Sử dụng File Batch Cài đặt Nhanh (Khuyên dùng)
1. Tải repository này về máy hoặc clone qua Git:
   ```cmd
   git clone https://github.com/lynkvproerror/autopatches9router.git
   cd autopatches9router
   ```
2. Nhấp chuột phải vào `install-9router.bat` và chọn **Run as Administrator** (hoặc chạy trực tiếp qua Command Prompt / PowerShell).
3. Script sẽ tự động:
   - Kiểm tra môi trường Node.js và PowerShell 7.
   - Sao lưu và áp dụng toàn bộ 26 bản vá vào 9router.
   - Khởi chạy dịch vụ 9router ngầm với 2 cổng độc lập (API: 53220, Dashboard UI: 20128).

---

### Cách 2: Cài đặt thủ công bằng PowerShell 7
Mở PowerShell 7 tại thư mục dự án và chạy lệnh:
```powershell
& "C:\Program Files\PowerShell\7\pwsh.exe" -ExecutionPolicy Bypass -File ".\automation\install-automation.ps1"
```

---

## 🖥️ Hướng dẫn Sử dụng & Lệnh điều khiển

### Các file script điều khiển nhanh (`.bat`):
- `start-9router.bat`: Khởi động lại dịch vụ 9router (chạy ngầm).
- `check-9router.bat`: Kiểm tra trạng thái hoạt động & số dư tài khoản.
- `repair-9router.bat`: Sửa lỗi, phục hồi lại trạng thái patcher chuẩn.
- `update-9router.bat`: Cập nhật bản vá mới nhất.

### Điều khiển qua CLI PowerShell:
```powershell
# Kiểm tra trạng thái các dịch vụ
pwsh -File .\automation\9router-control.ps1 -Action Status

# Khởi động lại riêng API backend
pwsh -File .\automation\9router-control.ps1 -Action RestartApi

# Khởi động lại giao diện Dashboard
pwsh -File .\automation\9router-control.ps1 -Action RestartDashboard
```

---

## ⚙️ Cấu hình K12 Rotation trên Dashboard

1. Truy cập **Dashboard 9router Proxy** ➔ Chọn tab **Quota Tracker**.
2. Nhấn vào nút **K12 Rotation** trên thanh công cụ.
3. Trong bảng cấu hình:
   - **Bật / Tắt:** Chuyển đổi trạng thái hoạt động của Engine.
   - **% Active:** Tùy chỉnh tỷ lệ tài khoản hoạt động đồng thời (từ **5% đến 100%**).
   - **Làm việc (phút):** Thời gian làm việc liên tục trước khi nghỉ (mặc định: 60 phút).
   - **Nghỉ tối thiểu / tối đa:** Thời gian nghỉ ngẫu nhiên (mặc định: 30 - 60 phút).
4. Nhấn **Lưu Cấu hình** hoặc nút **Force Rotation** để kích hoạt xoay vòng ngay lập tức.

---

## 📄 Bản quyền & Đóng góp

- **Author:** Lynk Vpro
- **Repository:** [https://github.com/lynkvproerror/autopatches9router.git](https://github.com/lynkvproerror/autopatches9router.git)
- Mọi đóng góp hoặc báo lỗi vui lòng mở Issue trên Repository.
