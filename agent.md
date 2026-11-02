# agent.md: AI to Google Docs

Tài liệu hướng dẫn cho AI agent (Antigravity, Claude Code, Cursor, v.v.) khi làm việc trên dự án này. Đọc hết file trước khi sửa bất kỳ thứ gì. Thiết kế đầy đủ nằm trong `ai-to-google-docs.md`; file này chỉ nói agent phải làm gì và không được làm gì.

---

## 1. Dự án là gì

Extension Chrome/Edge (Manifest V3) cho phép bấm một phím tắt để gửi câu trả lời của AI (DeepSeek, ChatGPT, Gemini, Claude) vào cuối một Google Doc, giữ định dạng. Doc này là nguồn cho NotebookLM.
Hướng dẫn: ai-to-google-docs.md (có thể phân tích trước khi làm theo)

```
Phím tắt -> background.js -> content.js (lấy DOM, chuyển HTML sang Markdown)
         -> background.js POST JSON -> Apps Script Web App (Code.gs)
         -> chuyển Markdown sang định dạng Docs -> append cuối Doc
```

Cấu trúc:

```
apps-script/Code.gs
extension/{manifest.json, background.js, content.js, content.css, options.html, options.js}
```

## 2. Ràng buộc cứng (không được vi phạm)

1. **Không đưa secret vào code hay git.** Web App URL và `TOKEN` chỉ nằm trong `chrome.storage.local` (extension) và Script Properties (Apps Script). Không hardcode, không in ra log, không đưa vào ví dụ.
2. **Không thêm permission vào `manifest.json`** (ví dụ `tabs`, `activeTab`, `<all_urls>`, `identity`) mà không hỏi người dùng trước. Hiện chỉ có `storage` và host permission tới `script.google.com` / `script.googleusercontent.com`.
3. **`fetch` tới Apps Script chỉ được nằm trong `background.js`**, không chuyển sang `content.js` (sẽ dính CSP của trang AI).
4. **Header `Content-Type` luôn là `text/plain;charset=utf-8`** khi POST tới Apps Script, để tránh preflight CORS. Token nằm trong body JSON, vì `doPost` không đọc được header.
5. **Không dùng thư viện ngoài, không thêm bước build.** Extension là JS thuần, tải được bằng Load unpacked. Muốn thêm dependency thì hỏi trước.
6. **Không viết literal ba dấu backtick trong code** (`Code.gs`, `content.js`). Dùng `` '`'.repeat(3) `` hoặc `` /`{3}/ `` để các file `.md` chứa code không bị vỡ khung.
7. **Không tự khẳng định "đã chạy được" với phần không chạy được.** Agent không thể deploy Apps Script, không đăng nhập được các site AI, không bấm được phím tắt trên trình duyệt thật. Phần nào chưa kiểm chứng thì nói rõ là chưa kiểm chứng.

## 3. Việc agent làm được và không làm được

| Làm được | Không làm được (phải nhờ người dùng) |
|---|---|
| Sửa code, đọc code, review | Deploy Apps Script (cần "New version" thủ công trong UI) |
| Chạy unit test cho `md()` bằng jsdom trong Node | Xem DOM thật của site AI khi đã đăng nhập |
| Kiểm tra cú pháp (`node --check`, JSON lint cho manifest) | Cấp quyền OAuth lần đầu cho Apps Script |
| Viết tài liệu, changelog | Reload extension và thử phím tắt |

Khi cần dữ liệu từ phía người dùng (HTML của tin nhắn AI, thông báo lỗi trong Console, kết quả `testAppend`), **yêu cầu cụ thể là gì và lấy ở đâu**, không đoán.

## 4. Quy trình chung cho mọi thay đổi

1. **Xác định phạm vi:** thay đổi nằm ở đâu: selector, chuyển HTML sang Markdown, chuyển Markdown sang Docs, giao tiếp, hay cấu hình. Chỉ đụng các file liên quan.
2. **Đọc code hiện tại** của phần đó. Không viết lại từ trí nhớ.
3. **Sửa tối thiểu.** Không refactor ngoài phạm vi yêu cầu, không đổi tên hàm/biến công khai nếu không cần.
4. **Tự kiểm tra** theo mục "Done khi" của skill tương ứng (mục 5).
5. **Báo cáo** theo mẫu ở mục 6, tách rõ *đã kiểm tra* và *chưa kiểm tra*.
6. **Nhắc bước thủ công** còn lại cho người dùng (deploy version mới, reload extension, sync NotebookLM) nếu thay đổi liên quan.

---

## 5. Danh sách skill

Mỗi skill là một quy trình có điều kiện kích hoạt, các bước, và tiêu chí hoàn thành.

### Skill 1: `fix-selector` (sửa selector khi site AI đổi giao diện)

**Kích hoạt:** toast báo "Không tìm thấy nội dung", hoặc nội dung gửi sai (lấy cả thinking, lấy nhầm tin nhắn người dùng, thiếu phần cuối).

**Cần từ người dùng:** HTML (Inspect > chuột phải phần tử > Copy > Copy outerHTML) của tin nhắn AI cuối cùng *và* phần tử bao ngoài nó, kèm tên site. Nếu chưa có, hỏi trước khi sửa.

**Các bước:**
1. Trong HTML nhận được, tìm định danh ổn định theo thứ tự ưu tiên: `data-*` attribute, `role`/`aria-*`, tên custom element, class mang nghĩa ngữ nghĩa. Tránh class dạng hash/sinh tự động (`css-1x2y3z`, `_a1b2c`).
2. Sửa **chỉ** mục tương ứng trong mảng `ADAPTERS` của `content.js`.
3. Đảm bảo `last()` trả về đúng một phần tử (tin nhắn cuối), không phải danh sách.
4. Nếu site có phần "thinking/reasoning" nằm cùng class với câu trả lời, loại nó ra bằng cách lọc phần tử cha hoặc dùng selector hẹp hơn.

**Done khi:** selector khớp với HTML mẫu người dùng đưa (kiểm tra bằng jsdom nếu có thể), và agent nói rõ cần người dùng reload extension rồi thử trên site thật.

### Skill 2: `add-site-adapter` (thêm site AI mới)

**Kích hoạt:** người dùng muốn dùng thêm một site (Perplexity, Copilot, Grok, ...).

**Các bước:**
1. Xin HTML mẫu như Skill 1.
2. Thêm một object vào `ADAPTERS` (`host`, `name`, `last`).
3. Thêm URL vào `content_scripts.matches` trong `manifest.json`. Đây là thay đổi manifest nhưng là thay đổi hợp lệ cho skill này; ghi rõ trong báo cáo.
4. Không thêm host permission mới (không cần, vì `fetch` chỉ tới Apps Script).

**Done khi:** manifest vẫn là JSON hợp lệ, host mới có trong `matches`, người dùng được nhắc reload extension.

### Skill 3: `extend-md-converter` (cải thiện HTML sang Markdown trong `content.js`)

**Kích hoạt:** định dạng bị mất hoặc sai ở phía trang: danh sách lồng sai thứ tự, bảng vỡ, link mất, code block mất ngôn ngữ, công thức toán.

**Các bước:**
1. Viết test case HTML đầu vào và Markdown mong đợi (jsdom, chạy trong Node, không cần trình duyệt).
2. Sửa nhánh `switch` tương ứng trong hàm `md()`.
3. Chạy lại toàn bộ test case cũ để chắc không hỏng chỗ khác.
4. Giữ nguyên chữ ký `md(node, depth)` và `toMarkdown(node)`.

**Done khi:** test mới và cũ đều qua; agent đính kèm cặp (HTML vào, Markdown ra) đã kiểm tra.

**Lưu ý:** công thức toán (KaTeX/MathJax) hiện bị bỏ qua. Nếu thêm hỗ trợ, ưu tiên lấy từ `<annotation encoding="application/x-tex">` và gửi dưới dạng text `$...$`; Google Docs không render LaTeX, nên nói rõ giới hạn này với người dùng.

### Skill 4: `extend-docs-converter` (cải thiện Markdown sang định dạng Docs trong `Code.gs`)

**Kích hoạt:** định dạng sai trong Doc: heading không đúng cấp, list không nối số thứ tự, định dạng "rò" từ đoạn trước sang đoạn sau, bảng lỗi.

**Các bước:**
1. Tái hiện bằng một chuỗi Markdown nhỏ nhất gây lỗi, thêm vào `testAppend()` (hoặc tạo hàm `testCase_<tên>()`).
2. Sửa trong `appendMarkdown`, `addInline`, `listItem`, `para`, `addTable` tùy chỗ lỗi.
3. Nhớ quy tắc của Docs API: đoạn mới thừa hưởng định dạng đoạn trước, nên mọi đoạn mới phải đi qua `para()` / `listItem()` để reset thuộc tính.
4. Không dùng API chỉ có trong Advanced Docs Service trừ khi người dùng đồng ý bật dịch vụ đó.

**Done khi:** agent giải thích thay đổi bằng lời, hướng dẫn người dùng chạy hàm test và nói họ cần quan sát điều gì trong Doc. **Agent không được tuyên bố đã xác nhận kết quả hiển thị trong Doc**, vì không có cách xem.

### Skill 5: `deploy-checklist` (hướng dẫn deploy sau khi sửa `Code.gs`)

**Kích hoạt:** mọi thay đổi trong `Code.gs`.

**Agent nhắc người dùng đúng các bước sau, không bỏ bước nào:**
1. Dán `Code.gs` mới vào Apps Script editor.
2. Chạy `testAppend` bằng tay, kiểm tra Doc.
3. Deploy > Manage deployments > bút chì > Version: **New version** > Deploy. (Không tạo deployment mới, vì URL sẽ đổi.)
4. Nếu đổi scope hay thêm dịch vụ: chạy lại một hàm bất kỳ để cấp quyền lại.

**Done khi:** đã liệt kê 4 bước trong phản hồi.

### Skill 6: `debug-request` (chẩn đoán khi bấm phím tắt mà không vào Doc)

**Kích hoạt:** người dùng báo lỗi, toast đỏ, hoặc không có phản ứng.

**Thứ tự chẩn đoán (dừng ở bước tìm ra nguyên nhân):**

| Triệu chứng | Kiểm tra |
|---|---|
| Không có toast gì | Phím tắt trùng? (`chrome://extensions/shortcuts`). Content script chưa nạp (tải lại tab). |
| "Không tìm thấy nội dung" | Chuyển sang Skill 1. |
| "Chưa cấu hình URL/token" | Trang Options chưa lưu. |
| `Unexpected token '<'` | Web app chưa đặt "Anyone", hoặc URL kết thúc bằng `/dev` thay vì `/exec`. |
| `unauthorized` | Token Options khác `TOKEN` trong Script Properties (khoảng trắng thừa). |
| Sửa `Code.gs` nhưng hành vi không đổi | Chưa tạo New version (Skill 5). |
| `You do not have permission...` | Chưa chạy `testAppend` để cấp quyền, hoặc `DOC_ID` sai/không có quyền sửa. |
| `ok: true, duplicate: true` | Nội dung trùng lần gửi trước; xóa property `LAST_HASH` nếu muốn gửi lại. |

Yêu cầu người dùng gửi **nguyên văn** thông báo lỗi và, nếu cần, log từ `chrome://extensions` > extension > "service worker" > Console.

### Skill 7: `security-review` (rà soát trước khi chia sẻ code hoặc đẩy lên git)

**Kích hoạt:** người dùng chuẩn bị commit, chia sẻ, hoặc đăng code.

**Các bước:** tìm trong toàn bộ repo các chuỗi dạng `AKfycb...` (ID deployment của Apps Script), `/macros/s/`, giá trị token, Doc ID thật; đảm bảo không có. Kiểm tra `manifest.json` không có permission thừa. Đảm bảo có `.gitignore` nếu người dùng dùng file cấu hình cục bộ.

**Done khi:** liệt kê kết quả quét và các điểm cần xử lý (nếu có).

---

## 6. Mẫu báo cáo sau mỗi thay đổi

```
**Đã sửa:** <file>: <một câu mô tả>
**Đã kiểm tra:** <những gì thực sự chạy được: test jsdom, node --check, JSON lint>
**Chưa kiểm tra (cần bạn làm):** <deploy New version / reload extension / thử trên site X / chạy testAppend>
**Rủi ro:** <nếu có, ví dụ selector có thể đổi lại>
```

## 7. Khi nào nên dừng và hỏi

- Yêu cầu cần thêm permission vào manifest.
- Yêu cầu thêm dependency hoặc bước build.
- Thay đổi làm lộ hoặc di chuyển secret.
- Thiếu HTML mẫu để sửa selector.
- Hai yêu cầu mâu thuẫn với nhau (ví dụ "không cần token" và "chỉ mình tôi ghi được vào Doc").

## 8. Phong cách làm việc

- Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào nội dung kỹ thuật.
- Nếu phát hiện một yêu cầu của người dùng có điểm yếu (dễ vỡ, kém an toàn, tốn công không đáng), nói rõ điểm yếu và lý do trước khi làm, rồi để người dùng quyết định.
- Không khen, không rào đón xã giao.
