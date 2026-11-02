# Gửi câu trả lời AI vào Google Docs bằng một phím tắt

Mục tiêu: đang chat với AI (DeepSeek, ChatGPT, Gemini, Claude), bấm một phím tắt, câu trả lời được append vào cuối một Google Doc cố định, giữ heading, bold, list, bảng, code. Doc này làm nguồn cho NotebookLM.

---
skill path: .agent/skills/
## 1. Luồng hoạt động

```
Phím tắt (chrome.commands)
   -> background.js báo cho tab đang mở
   -> content.js lấy nội dung (đoạn bôi đen, nếu không có thì tin nhắn AI cuối cùng)
   -> chuyển HTML sang Markdown
   -> background.js POST JSON tới Apps Script Web App
   -> Apps Script kiểm tra token, chuyển Markdown thành định dạng Docs, append vào cuối Doc
   -> Toast "Đã thêm vào Docs" trên trang
```

## 2. Quyết định thiết kế (và lý do)

| Quyết định | Lý do |
|---|---|
| Dùng **Google Apps Script Web App**, không gọi Docs API trực tiếp | Không cần OAuth trong extension. Chạy dưới tài khoản của bạn, extension chỉ cần URL + token. |
| Extension (Manifest V3), không dùng Tampermonkey | Cần `chrome.commands` để có phím tắt toàn cục và `fetch` từ service worker. |
| `fetch` đặt trong `background.js` | Tránh CSP của trang AI chặn request. Host permission của extension bỏ qua CORS. |
| Gửi `Content-Type: text/plain` | Tránh preflight CORS. Apps Script không xử lý được `OPTIONS`. |
| Token nằm **trong body** | Apps Script `doPost` không đọc được header tùy ý. |
| Chuyển HTML sang **Markdown** ở phía trang, rồi sang định dạng Docs ở phía Apps Script | `InsertText` thuần sẽ để lộ `**`, `##`. Phải tự dựng heading/bold/list. |
| Tin nhắn AI lấy bằng **selector DOM** | Đây là phần dễ vỡ nhất của cả hệ thống. Giao diện AI đổi thì selector phải sửa. Xem mục 8. |

## 3. Cấu trúc thư mục

```
ai-to-docs/
├── apps-script/
│   └── Code.gs
└── extension/
    ├── manifest.json
    ├── background.js
    ├── content.js
    ├── content.css
    ├── options.html
    └── options.js
```

---

## 4. Bước 1: Google Doc + Apps Script

### 4.1 Chuẩn bị

1. Tạo một Google Doc trống (ví dụ `AI Notes`).
2. Lấy **Doc ID** từ URL: `https://docs.google.com/document/d/<DOC_ID>/edit`.
3. Mở https://script.google.com, tạo project mới, dán code ở 4.2 vào `Code.gs`.
4. **Project Settings** (biểu tượng bánh răng): đặt time zone là `Asia/Ho_Chi_Minh` để dấu thời gian đúng giờ.
5. Project Settings > **Script Properties** > thêm hai property:
   - `DOC_ID` = Doc ID ở trên
   - `TOKEN` = một chuỗi ngẫu nhiên dài (tối thiểu 32 ký tự, ví dụ sinh bằng trình quản lý mật khẩu)

### 4.2 `Code.gs`

```javascript
const P = PropertiesService.getScriptProperties();
const H = DocumentApp.ParagraphHeading;
const HEADINGS = [H.HEADING1, H.HEADING2, H.HEADING3, H.HEADING4, H.HEADING5, H.HEADING6];

function doGet() {
  return ContentService.createTextOutput('alive');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);

    if (!data.token || data.token !== P.getProperty('TOKEN')) {
      return json({ ok: false, error: 'unauthorized' });
    }
    const text = String(data.text || '').trim();
    if (!text) return json({ ok: false, error: 'empty' });

    // Chặn bấm hai lần liên tiếp cùng một nội dung
    const hash = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
    );
    if (P.getProperty('LAST_HASH') === hash) return json({ ok: true, duplicate: true });

    lock.waitLock(15000);
    const doc = DocumentApp.openById(P.getProperty('DOC_ID'));
    appendEntry(doc.getBody(), text, data);
    doc.saveAndClose();
    P.setProperty('LAST_HASH', hash);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Ghi vào Doc ---------- */

function appendEntry(body, md, meta) {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  if (body.getNumChildren() > 1) body.appendHorizontalRule();

  const head = para(body, H.NORMAL);
  const label = stamp + ' · ' + (meta.site || 'AI');
  const t = head.editAsText();
  t.setText(label);
  t.setFontSize(9).setForegroundColor('#888888');
  if (meta.url && /^https?:\/\//.test(meta.url)) t.setLinkUrl(meta.url);

  appendMarkdown(body, md);
}

const BASE_ATTR = () => {
  const a = {};
  a[DocumentApp.Attribute.BOLD] = false;
  a[DocumentApp.Attribute.ITALIC] = false;
  a[DocumentApp.Attribute.UNDERLINE] = false;
  a[DocumentApp.Attribute.FOREGROUND_COLOR] = '#000000';
  a[DocumentApp.Attribute.FONT_FAMILY] = 'Arial';
  return a;
};

// Đoạn mới thường thừa hưởng định dạng của đoạn trước, nên phải reset tường minh.
function para(body, heading) {
  const p = body.appendParagraph('');
  p.setHeading(heading);
  const a = BASE_ATTR();
  if (heading === H.NORMAL) a[DocumentApp.Attribute.FONT_SIZE] = 11;
  p.setAttributes(a);
  return p;
}

function listItem(body, glyph, indent, st) {
  const item = body.appendListItem('');
  const nest = Math.min(Math.floor(indent / 2), 8);
  const a = BASE_ATTR();
  a[DocumentApp.Attribute.FONT_SIZE] = 11;
  item.setAttributes(a);
  // Nối vào danh sách đang có để số thứ tự chạy liên tục
  if (st.list && (nest > 0 || st.type === glyph)) item.setListId(st.list);
  item.setGlyphType(glyph);
  item.setNestingLevel(nest);
  if (nest === 0) st.type = glyph;
  st.list = item;
  return item;
}

function appendMarkdown(body, md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const st = { list: null, type: null };
  let inCode = false;
  let table = [];

  const flushTable = () => {
    if (table.length) { addTable(body, table); table = []; }
  };

  for (const raw of lines) {
    if (/^\s*`{3}/.test(raw)) { flushTable(); st.list = null; inCode = !inCode; continue; }
    if (inCode) { codeLine(body, raw); continue; }

    if (/^\s*\|.*\|\s*$/.test(raw)) { table.push(raw); st.list = null; continue; }
    flushTable();

    if (!raw.trim()) { st.list = null; continue; }

    let m;
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) {
      st.list = null;
      body.appendHorizontalRule();
    } else if ((m = raw.match(/^(#{1,6})\s+(.*)$/))) {
      st.list = null;
      addInline(para(body, HEADINGS[m[1].length - 1]), m[2]);
    } else if ((m = raw.match(/^(\s*)[-*+]\s+(.*)$/))) {
      addInline(listItem(body, DocumentApp.GlyphType.BULLET, m[1].length, st), m[2]);
    } else if ((m = raw.match(/^(\s*)\d+[.)]\s+(.*)$/))) {
      addInline(listItem(body, DocumentApp.GlyphType.NUMBER, m[1].length, st), m[2]);
    } else if ((m = raw.match(/^>\s?(.*)$/))) {
      st.list = null;
      const p = para(body, H.NORMAL);
      p.setIndentStart(18);
      addInline(p, m[1]);
    } else {
      st.list = null;
      addInline(para(body, H.NORMAL), raw.trim());
    }
  }
  flushTable();
}

// Inline: **bold**, *italic*, `code`, [text](url)
function addInline(p, text) {
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\*(.+?)\*|\[([^\]]+)\]\((\S+?)\)/g;
  let plain = '', last = 0, m;
  const spans = [];

  while ((m = re.exec(text)) !== null) {
    plain += text.slice(last, m.index);
    const s = plain.length;
    if (m[1] !== undefined)      { plain += m[1]; spans.push(['b', s, plain.length - 1]); }
    else if (m[2] !== undefined) { plain += m[2]; spans.push(['c', s, plain.length - 1]); }
    else if (m[3] !== undefined) { plain += m[3]; spans.push(['i', s, plain.length - 1]); }
    else                         { plain += m[4]; spans.push(['l', s, plain.length - 1, m[5]]); }
    last = re.lastIndex;
  }
  plain += text.slice(last);
  if (!plain) return;

  const t = p.editAsText();
  t.setText(plain);
  spans.forEach(([k, s, e, url]) => {
    if (e < s) return;
    if (k === 'b') t.setBold(s, e, true);
    else if (k === 'i') t.setItalic(s, e, true);
    else if (k === 'c') { t.setFontFamily(s, e, 'Consolas'); t.setBackgroundColor(s, e, '#f1f3f4'); }
    else if (k === 'l') t.setLinkUrl(s, e, url);
  });
}

function codeLine(body, raw) {
  const p = para(body, H.NORMAL);
  const t = p.editAsText();
  t.setText(raw === '' ? ' ' : raw);
  t.setFontFamily('Consolas').setFontSize(10).setBackgroundColor('#f1f3f4');
}

function addTable(body, lines) {
  const strip = (s) => s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*(.+?)\*/g, '$1');

  const rows = lines
    .filter((l) => !(/^[\s|:-]+$/.test(l) && l.indexOf('-') >= 0)) // bỏ hàng ngăn |---|---|
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => strip(c.trim())));
  if (!rows.length) return;

  const table = body.appendTable(rows);
  const headRow = table.getRow(0);
  for (let i = 0; i < headRow.getNumCells(); i++) {
    headRow.getCell(i).editAsText().setBold(true);
  }
}

/* ---------- Chạy thử trong editor ---------- */

function testAppend() {
  const md = [
    '# Tiêu đề thử',
    'Đoạn có **đậm**, *nghiêng*, `code` và [liên kết](https://example.com).',
    '- Mục 1',
    '  - Mục con',
    '1. Bước một',
    '2. Bước hai',
    '| Cột A | Cột B |',
    '|---|---|',
    '| a | b |',
    '```',
    'print("hello")',
    '```'
  ].join('\n');
  appendEntry(DocumentApp.openById(P.getProperty('DOC_ID')).getBody(), md, { site: 'Test', url: 'https://example.com' });
}
```

### 4.3 Cấp quyền và deploy

1. Chọn hàm `testAppend` trên thanh công cụ, bấm **Run**. Lần đầu sẽ hiện hộp thoại cấp quyền (Advanced > Go to project > Allow). Kiểm tra Doc có nội dung thử, rồi xóa đi.
2. **Deploy > New deployment > Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** (bắt buộc là "Anyone", không phải "Anyone with Google account", vì extension gọi không kèm đăng nhập Google; bảo vệ nằm ở `TOKEN`)
3. Copy **Web app URL** (dạng `https://script.google.com/macros/s/.../exec`).
4. **Mỗi lần sửa code** phải vào Deploy > Manage deployments > biểu tượng bút chì > Version: **New version** > Deploy. Nếu không, URL vẫn chạy bản cũ. URL không đổi.

---

## 5. Bước 2: Extension (Manifest V3)

### 5.1 `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "AI to Google Docs",
  "version": "1.0.0",
  "description": "Gửi câu trả lời AI vào Google Docs bằng phím tắt.",
  "permissions": ["storage"],
  "host_permissions": [
    "https://script.google.com/*",
    "https://script.googleusercontent.com/*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    {
      "matches": [
        "https://chat.deepseek.com/*",
        "https://chatgpt.com/*",
        "https://gemini.google.com/*",
        "https://claude.ai/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ],
  "commands": {
    "append-to-doc": {
      "suggested_key": { "default": "Alt+Shift+D" },
      "description": "Gửi câu trả lời AI vào Google Docs"
    }
  },
  "options_page": "options.html"
}
```

### 5.2 `background.js`

```javascript
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'append-to-doc') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'trigger' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'append') return;

  (async () => {
    try {
      const { url, token } = await chrome.storage.local.get({ url: '', token: '' });
      if (!url || !token) {
        sendResponse({ ok: false, error: 'Chưa cấu hình URL/token (trang Options của extension).' });
        return;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token, ...msg.payload })
      });
      sendResponse(await res.json());
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true; // giữ kênh mở cho sendResponse bất đồng bộ
});
```

### 5.3 `content.js`

```javascript
const FENCE = '`'.repeat(3);

/* Selector lấy tin nhắn AI cuối cùng. Đây là điểm xuất phát,
   cần kiểm tra lại bằng DevTools vì giao diện các site đổi thường xuyên. */
const ADAPTERS = [
  { host: 'chat.deepseek.com', name: 'DeepSeek',
    last: () => [...document.querySelectorAll('.ds-markdown')].pop() },
  { host: 'chatgpt.com', name: 'ChatGPT',
    last: () => [...document.querySelectorAll('[data-message-author-role="assistant"]')].pop() },
  { host: 'gemini.google.com', name: 'Gemini',
    last: () => [...document.querySelectorAll('message-content')].pop() },
  { host: 'claude.ai', name: 'Claude',
    last: () => [...document.querySelectorAll('.font-claude-response')].pop() }
];

const SKIP = new Set(['BUTTON', 'SVG', 'STYLE', 'SCRIPT', 'NOSCRIPT']);

/* ---------- HTML -> Markdown ---------- */

function md(node, depth = 0) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  const isFrag = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
  if (!isFrag && node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = isFrag ? 'frag' : node.tagName.toLowerCase();
  if (!isFrag && SKIP.has(node.tagName.toUpperCase())) return '';

  const kids = () => [...node.childNodes].map((c) => md(c, depth)).join('');

  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + kids().trim() + '\n\n';
    case 'p':
      return '\n\n' + kids().trim() + '\n\n';
    case 'br':
      return '\n';
    case 'hr':
      return '\n\n---\n\n';
    case 'strong': case 'b':
      return kids().trim() ? '**' + kids().trim() + '**' : '';
    case 'em': case 'i':
      return kids().trim() ? '*' + kids().trim() + '*' : '';
    case 'a': {
      const href = node.getAttribute('href') || '';
      return /^https?:/.test(href) ? '[' + kids().trim() + '](' + href + ')' : kids();
    }
    case 'code':
      return node.parentElement && node.parentElement.tagName === 'PRE'
        ? kids() : '`' + kids() + '`';
    case 'pre':
      return '\n\n' + FENCE + '\n' + node.textContent.replace(/\n$/, '') + '\n' + FENCE + '\n\n';
    case 'blockquote':
      return '\n\n' + kids().trim().split('\n').map((l) => '> ' + l).join('\n') + '\n\n';
    case 'ul': case 'ol': {
      const items = [...node.children].filter((e) => e.tagName === 'LI').map((li, i) => {
        const own = [...li.childNodes]
          .filter((c) => !(c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)))
          .map((c) => md(c, depth)).join('').replace(/\s*\n+\s*/g, ' ').trim();
        const nested = [...li.children]
          .filter((c) => /^(UL|OL)$/.test(c.tagName))
          .map((c) => md(c, depth + 1)).join('');
        return '  '.repeat(depth) + (tag === 'ol' ? (i + 1) + '. ' : '- ') + own + '\n' + nested;
      });
      return '\n' + items.join('') + '\n';
    }
    case 'table': {
      const rows = [...node.querySelectorAll('tr')].map((tr) =>
        [...tr.children].map((c) => c.textContent.trim().replace(/\|/g, '/').replace(/\s*\n\s*/g, ' '))
      );
      if (!rows.length) return '';
      const head = rows[0];
      return '\n\n| ' + head.join(' | ') + ' |\n| ' + head.map(() => '---').join(' | ') + ' |\n' +
        rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n\n';
    }
    default:
      return kids();
  }
}

const toMarkdown = (node) => md(node).replace(/\n{3,}/g, '\n\n').trim();

/* ---------- Lấy nội dung ---------- */

function getPayload() {
  const adapter = ADAPTERS.find((a) =>
    location.hostname === a.host || location.hostname.endsWith('.' + a.host));

  let text = '';
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) {
    text = toMarkdown(sel.getRangeAt(0).cloneContents());       // ưu tiên đoạn bôi đen
  } else if (adapter) {
    const el = adapter.last();
    if (el) text = toMarkdown(el);                               // không có thì lấy tin nhắn cuối
  }
  return { text, site: adapter ? adapter.name : location.hostname, url: location.href, title: document.title };
}

/* ---------- UI ---------- */

function toast(msg, ok = true) {
  let el = document.getElementById('a2d-toast');
  if (!el) { el = document.createElement('div'); el.id = 'a2d-toast'; document.documentElement.appendChild(el); }
  el.textContent = msg;
  el.className = ok ? 'ok' : 'err';
  el.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.opacity = '0'; }, 2800);
}

async function run() {
  const payload = getPayload();
  if (!payload.text) { toast('Không tìm thấy nội dung để gửi (kiểm tra selector).', false); return; }
  toast('Đang gửi...');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'append', payload });
    if (res && res.ok) toast(res.duplicate ? 'Nội dung này vừa được gửi rồi.' : 'Đã thêm vào Docs.');
    else toast('Lỗi: ' + ((res && res.error) || 'không rõ'), false);
  } catch (e) {
    toast('Lỗi: ' + e, false);
  }
}

chrome.runtime.onMessage.addListener((msg) => { if (msg.type === 'trigger') run(); });

const btn = document.createElement('button');
btn.id = 'a2d-btn';
btn.textContent = '→ Docs';
btn.addEventListener('mousedown', (e) => e.preventDefault()); // giữ nguyên vùng bôi đen khi bấm
btn.addEventListener('click', run);
document.documentElement.appendChild(btn);
```

### 5.4 `content.css`

```css
#a2d-btn {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  padding: 8px 12px; border: 0; border-radius: 8px;
  background: #1a73e8; color: #fff; font: 600 13px system-ui, sans-serif;
  cursor: pointer; opacity: .8;
}
#a2d-btn:hover { opacity: 1; }
#a2d-toast {
  position: fixed; right: 16px; bottom: 60px; z-index: 2147483647;
  padding: 8px 12px; border-radius: 8px; color: #fff;
  font: 13px system-ui, sans-serif; opacity: 0; transition: opacity .2s;
  pointer-events: none;
}
#a2d-toast.ok  { background: #188038; }
#a2d-toast.err { background: #d93025; }
```

### 5.5 `options.html` và `options.js`

```html
<!doctype html>
<meta charset="utf-8">
<title>AI to Google Docs</title>
<style>
  body { font: 14px system-ui, sans-serif; max-width: 560px; margin: 32px auto; }
  label { display: block; margin-top: 16px; font-weight: 600; }
  input { width: 100%; padding: 8px; box-sizing: border-box; }
  button { margin-top: 20px; padding: 8px 16px; }
</style>
<label>Web App URL (Apps Script)
  <input id="url" placeholder="https://script.google.com/macros/s/.../exec">
</label>
<label>Token
  <input id="token" type="password">
</label>
<button id="save">Lưu</button>
<span id="status"></span>
<script src="options.js"></script>
```

```javascript
const $ = (id) => document.getElementById(id);

chrome.storage.local.get({ url: '', token: '' }).then(({ url, token }) => {
  $('url').value = url;
  $('token').value = token;
});

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ url: $('url').value.trim(), token: $('token').value.trim() });
  $('status').textContent = ' Đã lưu.';
  setTimeout(() => ($('status').textContent = ''), 1500);
});
```

---

## 6. Bước 3: Cài đặt

1. Chrome: `chrome://extensions` > bật **Developer mode** > **Load unpacked** > chọn thư mục `extension/`.
   Edge: `edge://extensions` > bật **Developer mode** > **Load unpacked**. Cùng một thư mục dùng được cho cả hai.
2. Mở **Details > Extension options**, dán Web App URL và token, bấm Lưu.
3. Kiểm tra phím tắt tại `chrome://extensions/shortcuts` (Edge: `edge://extensions/shortcuts`). Mặc định là `Alt+Shift+D`; nếu trùng phím khác thì đổi ở đó.
4. Mở một cuộc chat, để AI trả lời xong, bấm phím tắt. Cách dùng:
   - Không bôi đen gì: gửi tin nhắn AI cuối cùng.
   - Bôi đen một đoạn: chỉ gửi đoạn đó.
   - Nút **→ Docs** góc phải dưới làm đúng việc tương tự phím tắt.

## 7. Bước 4: Đồng bộ với NotebookLM

NotebookLM **không tự cập nhật** khi Doc nguồn thay đổi. Sau khi append xong, mở notebook, bấm vào nguồn Google Docs đó và chọn **Click to sync with Google Drive** (hoặc dùng nút Refresh Drive của extension bạn đang có). Việc này vẫn là thao tác thủ công, không tránh được.

---

## 8. Giới hạn đã biết

| Vấn đề | Chi tiết |
|---|---|
| **Selector hỏng** | Phần dễ vỡ nhất. Khi nút báo "Không tìm thấy nội dung", mở DevTools (F12), inspect tin nhắn AI cuối cùng, tìm class/attribute ổn định nhất và sửa mảng `ADAPTERS`. Bôi đen rồi bấm phím tắt vẫn hoạt động khi selector hỏng. |
| **Markdown phức tạp** | Chưa hỗ trợ: công thức toán (KaTeX), danh sách lồng sâu có đoạn văn bên trong, bold/italic lồng nhau, ảnh. Bảng được chuyển thành bảng Docs thật nhưng ô chỉ giữ text thuần. |
| **`*` lẻ** | Chuỗi như `2 * 3 * 4` có thể bị hiểu nhầm là chữ nghiêng. |
| **Dấu thời gian** | Dùng time zone của Apps Script project. Quên đặt ở bước 4.1 thì giờ sẽ lệch. |
| **Dung lượng Doc** | Doc rất dài thì mỗi lần append chậm dần. Khi quá lớn, tạo Doc mới và đổi `DOC_ID`. NotebookLM cũng giới hạn kích thước mỗi nguồn. |
| **Gửi trùng** | Script chặn gửi lại đúng nội dung vừa gửi liền trước. Muốn cố tình gửi hai lần thì sửa nội dung hoặc xóa property `LAST_HASH`. |

### Lỗi thường gặp

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `Unexpected token '<'` | Web app chưa đặt "Who has access: Anyone", hoặc URL sai (phải kết thúc bằng `/exec`, không phải `/dev`). |
| `unauthorized` | Token trong Options khác `TOKEN` trong Script Properties (kiểm tra khoảng trắng thừa). |
| Sửa code mà hành vi không đổi | Chưa tạo **New version** khi deploy (xem 4.3 bước 4). |
| `You do not have permission to call DocumentApp...` | Chưa chạy `testAppend` bằng tay để cấp quyền, hoặc `DOC_ID` thuộc Doc bạn không có quyền sửa. |
| Phím tắt không phản ứng | Trùng phím với tiện ích khác, hoặc tab chưa tải content script (tải lại trang sau khi cài/sửa extension). |
| Format bị lệch sau tin nhắn đầu tiên | Định dạng thừa hưởng từ đoạn trước; hàm `para()` đã reset, nếu vẫn lệch thì kiểm tra `BASE_ATTR`. |

## 9. Bảo mật

- Ai có **cả URL lẫn token** thì ghi được vào Doc của bạn (nhưng không đọc được gì, vì `doPost` chỉ ghi). Hãy coi hai thứ này như mật khẩu, không đưa lên GitHub, không dán vào chat.
- Token lưu trong `chrome.storage.local`, không đồng bộ qua tài khoản trình duyệt.
- Muốn đổi token: sửa `TOKEN` trong Script Properties rồi cập nhật lại trong Options. Không cần deploy lại.
- Nội dung chat được gửi qua HTTPS tới script chạy dưới tài khoản Google của bạn, không qua bên thứ ba.
