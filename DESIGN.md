# Tài liệu Thiết kế Hệ thống: AI to Google Docs

Tài liệu này lưu trữ toàn bộ phân tích kỹ thuật, kiến trúc hệ thống, quy chuẩn giao tiếp và kế hoạch kiểm thử cho dự án **AI to Google Docs**.

---

## 1. Mục tiêu & Phạm vi

- **Mục tiêu:** Cung cấp tiện ích mở rộng (Chrome/Edge Extension - Manifest V3) và một Google Apps Script Web App đóng vai trò backend trung chuyển, cho phép trích xuất nội dung trả lời từ các nền tảng AI (ChatGPT, Claude, Gemini, DeepSeek...) hoặc đoạn văn bản được bôi đen và đẩy trực tiếp vào một Google Doc chỉ định bằng phím tắt hoặc nút nổi trên trang.
- **Mục đích sử dụng:** Google Doc này hoạt động như một cơ sở tri thức (Knowledge Base) tự động để đồng bộ trực tiếp làm tài liệu nguồn cho Google NotebookLM.

---

## 2. Kiến trúc & Luồng dữ liệu (Architecture & Data Flow)

```
[ Người dùng trên Tab AI (ChatGPT/Claude/Gemini/DeepSeek...) ]
      │  
      ├─ (A) Bấm phím tắt Alt+Shift+D ──► chrome.commands ──► background.js ──┐
      │                                                                         │ (gửi trigger)
      └─ (B) Hoặc bấm nút nổi "→ Docs"                                        ▼
                                                                        [ content.js ]
                                                                               │
                                                                   1. Trích xuất DOM:
                                                                      - Ưu tiên: Selection (bôi đen)
                                                                      - Hoặc: AI message cuối (ADAPTERS)
                                                                   2. Chuyển đổi DOM -> Markdown: md()
                                                                               │
                                                                               ▼ (gửi payload)
                                                                        [ background.js ]
                                                                               │
                                                                   Đọc chrome.storage.local:
                                                                   - url (Apps Script Web App)
                                                                   - token (secret)
                                                                               │
                                                                               ▼ HTTP POST (text/plain)
                                                                [ Google Apps Script Web App ]
                                                                (Code.gs chạy dưới tài khoản cá nhân)
                                                                               │
                                                                   1. Xác thực Token & Chống trùng (MD5)
                                                                   2. LockService (tránh race condition)
                                                                   3. Chuyển Markdown -> Docs Elements
                                                                   4. Reset thuộc tính định dạng (BASE_ATTR)
                                                                   5. Lưu vào Google Doc (DOC_ID)
                                                                               │
                                                                               ▼ Phản hồi JSON: { ok: true }
                                                                        [ content.js ]
                                                                               │
                                                                   Hiển thị Toast ("Đã thêm vào Docs")
```

---

## 3. Cấu trúc thư mục chuẩn (File Structure)

```
Extension/
├── .agent/                      # Quy trình vận hành & kỹ năng của Agent
│   └── skills/
├── apps-script/
│   └── Code.gs                  # Backend Web App chạy trên Google Apps Script
├── extension/                   # Chrome/Edge Extension (Manifest V3)
│   ├── manifest.json            # Cấu hình extension, quyền storage, content_scripts
│   ├── background.js            # Service worker xử lý shortcut và gửi request fetch
│   ├── content.js               # Logic trích xuất DOM, chuyển đổi Markdown & UI
│   ├── content.css              # Style nút bấm nổi và thông báo toast
│   ├── options.html             # Giao diện cấu hình Web App URL và Token
│   └── options.js               # Logic lưu/lấy cấu hình từ chrome.storage.local
├── .gitignore                   # Loại trừ các file secret, logs và dependencies
├── agent.md                     # Nguyên tắc làm việc & checklist
├── ai-to-google-docs.md         # Hướng dẫn chi tiết & code mẫu nguyên bản
└── DESIGN.md                    # Tài liệu thiết kế hệ thống (file này)
```

---

## 4. Đặc tả Giao tiếp dữ liệu (API & Data Contracts)

### 4.1 Message giữa `content.js` và `background.js` (Nội bộ Extension)
- **Kênh:** `chrome.runtime.sendMessage`
- **Payload:**
```json
{
  "type": "append",
  "payload": {
    "text": "Nội dung Markdown cần append",
    "site": "ChatGPT",
    "url": "https://chatgpt.com/c/xxx",
    "title": "Tiêu đề tab chat"
  }
}
```

### 4.2 Request từ `background.js` tới `Apps Script Web App`
- **URL:** Web App URL được cấp khi deploy (`https://script.google.com/macros/s/.../exec`).
- **Method:** `POST`
- **Headers:** `Content-Type: text/plain;charset=utf-8` *(bắt buộc text/plain để tránh preflight CORS)*
- **Body JSON:**
```json
{
  "token": "CHUO_I_TOKEN_MAT_MA_32_KY_TU",
  "text": "Nội dung Markdown...",
  "site": "ChatGPT",
  "url": "https://chatgpt.com/c/xxx",
  "title": "Tiêu đề tab chat"
}
```

### 4.3 Phản hồi từ `Apps Script Web App`
- **Thành công:**
  ```json
  { "ok": true }
  ```
- **Trùng nội dung liền kề (Duplicate):**
  ```json
  { "ok": true, "duplicate": true }
  ```
- **Lỗi xác thực / Tham số / Xử lý:**
  ```json
  { "ok": false, "error": "unauthorized | empty | <thông báo lỗi>" }
  ```

---

## 5. Ràng buộc bảo mật & Quy tắc hệ thống (Hard Constraints)

1. **Tuyệt đối không lưu Secret vào Code/Git:**
   - Web App URL và Token chỉ được lưu tại `chrome.storage.local` và Script Properties của Apps Script.
2. **Quyền hạn tối thiểu (Least Privilege):**
   - `manifest.json` chỉ dùng quyền `storage` và host permissions tới domain `script.google.com` và `script.googleusercontent.com`. Không thêm `tabs`, `activeTab`, `<all_urls>`.
3. **Môi trường thuần JS (Zero-build):**
   - Extension dùng Vanilla JavaScript, nạp trực tiếp qua "Load unpacked" mà không cần qua bước biên dịch/đóng gói bundler.
4. **Docs API Attribute Isolation:**
   - Trong Docs API, mỗi đoạn văn mới (`appendParagraph`) hoặc mục danh sách (`appendListItem`) đều tự động thừa hưởng style của đoạn liền trước. Do đó, hàm `para()` và `listItem()` bắt buộc phải set lại bộ thuộc tính `BASE_ATTR()` tường minh để tránh rò rỉ font, màu, cỡ chữ.
5. **Tránh Literal Triple Backticks:**
   - Không viết 3 dấu backtick liên tiếp trực tiếp trong source code JS để tránh vỡ khối mã khi nhúng vào tài liệu Markdown.

