# AI to Google Docs 🚀

> **Chrome & Edge Extension (Manifest V3)** giúp lưu ngay câu trả lời từ các nền tảng AI (**NotebookLM, ChatGPT, DeepSeek, Claude, Gemini**) vào thẳng Google Docs chỉ bằng một phím tắt hoặc 1 cú click chuột, giữ nguyên định dạng Markdown chuẩn (tiêu đề, in đậm/nghiêng, danh sách, bảng, khối code).

Tài liệu này hoạt động như một nguồn dữ liệu sống (Knowledge Base) tự động cho **Google NotebookLM** hoặc kho lưu trữ ghi chú học tập/nghiên cứu cá nhân.

---

## ✨ Tính năng nổi bật

- **Hỗ trợ đa nền tảng AI hàng đầu:** Tích hợp bộ chuyển đổi thông minh cho **Google NotebookLM**, **ChatGPT**, **DeepSeek**, **Claude**, và **Google Gemini**.
- **Định tuyến Google Docs linh hoạt (Hybrid Routing) với Menu sổ xuống:**
  - **Menu sổ xuống chọn Doc mặc định:** Lưu danh sách các Google Docs theo tên thật, người dùng chỉ cần bấm menu chọn tên Doc là áp dụng hàng loạt cho tất cả các trang ngay tức thì.
  - **Tự động nhận diện tên tài liệu từ link:** Chỉ cần dán link Google Doc và bấm *"Lấy tên & Thêm"*, hệ thống tự động kết nối và lấy đúng tiêu đề tài liệu.
  - **Doc Riêng theo từng trang:** Chỉ định tài liệu riêng cho từng nền tảng (ví dụ: *NotebookLM* lưu vào Doc A, *ChatGPT* lưu vào Doc B...). Trang nào đã có Doc riêng thì không bị áp dụng bởi Doc mặc định.
  - **Fallback thông minh:** Tự động lấy Doc mặc định nếu trang đó chưa được gán Doc riêng.
- **Thao tác cực nhanh qua Popup:** Bấm trực tiếp vào icon tiện ích trên thanh công cụ để đổi nhanh Doc mặc định, đổi Doc riêng cho trang hiện tại và gửi nội dung ngay lập tức.
- **Tự động lọc rác & khối suy luận ("Thoughts"):** Loại bỏ các khối suy nghĩ (DeepSeek-R1 / NotebookLM Thoughts) để tài liệu luôn gọn gàng và chuẩn xác.
- **Chuyển đổi định dạng trung thực:** Giữ nguyên các cấp tiêu đề Heading H1-H6, danh sách đánh số liên tục, code monospace, và bảng biểu.
- **Khung kiểm thử tự động toàn diện (37 Test Cases):** Áp dụng đầy đủ phương pháp luận kiểm thử phần mềm (Kiểm thử biên BVA, Phân vùng tương đương EP, Kiểm thử hồi quy Regression).

---

## 🏗️ Kiến trúc hoạt động

```
[ Người dùng trên Tab AI (NotebookLM / ChatGPT / DeepSeek...) ]
      │  
      ├─ Bấm phím tắt (Ctrl+Shift+S / Alt+Shift+D)
      ├─ Click nút nổi [ → Docs ] ở góc màn hình
      └─ Hoặc bấm nút trên Popup tiện ích
                 │
                 ▼
          [ content.js ]
          Trích xuất DOM (ưu tiên bôi đen, fallback tin nhắn cuối) 
          và chuyển đổi HTML -> Markdown
                 │
                 ▼
          [ background.js ]
          Tra cứu Doc ID (Doc riêng hoặc Doc mặc định)
                 │
                 ▼ HTTP POST (Content-Type: text/plain)
     [ Google Apps Script Web App (Code.gs) ]
     - Xác thực Token bí mật & Chặn gửi trùng (MD5 hash)
     - Khóa luồng (LockService) chống race condition
     - Chuyển Markdown thành Google Docs Elements
     - Reset thuộc tính tường minh (tránh lem màu/font)
                 │
                 ▼
         [ Google Docs ]
```

---

## 📦 Hướng dẫn cài đặt & Triển khai

### Bước 1: Thiết lập Google Apps Script (Backend)

1. Mở [Google Docs](https://docs.google.com) và tạo một tài liệu mới (ví dụ: `AI Notes`). Copy mã **Doc ID** từ URL:
   `https://docs.google.com/document/d/`<**DOC_ID**>`/edit`
2. Mở [Google Apps Script](https://script.google.com), tạo dự án mới và dán toàn bộ mã nguồn trong [`apps-script/Code.gs`](apps-script/Code.gs) vào editor.
3. Vào **Project Settings (Bánh răng)** > **Script Properties** > thêm 2 biến:
   - `DOC_ID`: Mã Doc ID vừa lấy ở bước 1.
   - `TOKEN`: Chuỗi mật mã bí mật ngẫu nhiên (tối thiểu 32 ký tự).
4. Quay lại editor, chọn hàm `testAppend` trên thanh công cụ và bấm **Run (Chạy)** để cấp quyền OAuth lần đầu.
5. Bấm **Deploy > New deployment**:
   - Chọn loại: **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone** *(bắt buộc để extension gửi dữ liệu được)*.
   - Copy lại **Web App URL** (link kết thúc bằng `/exec`).

### Bước 2: Cài đặt Extension vào trình duyệt (Chrome / Edge)

1. Truy cập `chrome://extensions` hoặc `edge://extensions`.
2. Bật công tắc **Developer mode (Chế độ nhà phát triển)**.
3. Bấm **Load unpacked (Tải tiện ích đã giải nén)** > chọn thư mục [`extension/`](extension).
4. Ghim tiện ích lên thanh công cụ trình duyệt (biểu tượng 🧩).

### Bước 3: Cấu hình nhanh

1. Bấm vào biểu tượng tiện ích **AI to Google Docs** trên thanh công cụ > chọn **Cài đặt nâng cao (URL/Token)**:
   - Dán **Web App URL** (ở Bước 1.5).
   - Dán **Token** bí mật (ở Bước 1.3).
   - Bấm **Lưu cài đặt**.
2. Dán link Google Doc của bạn vào ô **Google Doc Mặc định** là xong!

---

## ⌨️ Phím tắt & Cách sử dụng

- **Gửi câu trả lời mới nhất:** Bấm phím tắt (mặc định cấu hình tại `edge://extensions/shortcuts` hoặc `chrome://extensions/shortcuts`, ví dụ `Ctrl+Shift+S`) hoặc bấm nút nổi xanh **`[ → Docs ]`**.
- **Gửi đoạn văn bản chọn lọc:** Dùng chuột **bôi đen** đoạn văn bản cần lấy ➔ bấm phím tắt hoặc click nút **`→ Docs`**.
- **Đồng bộ với NotebookLM:** Vào cuốn sổ NotebookLM của bạn, bấm vào nguồn Google Doc và chọn **Click to sync with Google Drive**.

---

## 🧪 Kiểm thử tự động (Software Testing - SWT301)

Dự án tích hợp bộ kiểm thử đơn vị, kiểm thử tích hợp logic và kiểm toán bảo mật độc lập:

```bash
# Chạy toàn bộ 37 ca kiểm thử hồi quy
npm test
```

### Các nhóm kiểm thử chính:
- **Suite 1:** HTML to Markdown Converter (Phân tích giá trị biên BVA, phân vùng tương đương EP, xử lý Angular component của NotebookLM).
- **Suite 2:** Apps Script Logic (Chuyển đổi Docs element, xác thực token, chống trùng nội dung bằng MD5, routing đa Doc).
- **Suite 3:** Security & Boundary Compliance (Nguyên tắc đặc quyền tối thiểu, quét rò rỉ secret, tuân thủ CSP và CORS).

---

## 🔒 Bảo mật & Quyền riêng tư

- **Không sử dụng máy chủ trung gian:** Mọi dữ liệu được gửi trực tiếp từ trình duyệt của bạn tới Google Apps Script chạy dưới chính tài khoản Google của bạn.
- **Không rò rỉ Token:** Token xác thực chỉ lưu trong `chrome.storage.local` trên máy cá nhân, không đồng bộ lên đám mây.
- **Quyền hạn tối thiểu:** Extension chỉ sử dụng duy nhất quyền `storage` trong `manifest.json`.

---

## 📄 Giấy phép

Dự án được phát hành dưới giấy phép mã nguồn mở MIT.
