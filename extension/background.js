/**
 * background.js
 * Service Worker quản lý điều phối: Phím tắt, Google Docs REST API (OAuth2) và Apps Script Web App.
 */

try {
  importScripts('gdocs-compiler.js', 'gdocs-service.js');
} catch (e) {
  console.warn('importScripts failed:', e);
}

function extractDocId(str) {
  if (!str) return '';
  const m = String(str).match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : String(str).trim();
}

/**
 * Phân tích phản hồi nếu Web App trả về HTML thay vì JSON
 */
function parseHtmlError(htmlText) {
  if (!htmlText) return 'Không có phản hồi từ máy chủ.';
  if (/accounts\.google\.com|ServiceLogin|signin/i.test(htmlText)) {
    return 'Lỗi xác thực: Google yêu cầu đăng nhập. Khi Deploy Web App, hãy đảm bảo chọn mục "Who has access" là "Anyone" (Bất kỳ ai).';
  }
  if (/script\.google\.com.*error|Exception/i.test(htmlText)) {
    return 'Lỗi Apps Script: Chưa cấp quyền (Run hàm testAppend) hoặc tài khoản không có quyền truy cập Google Doc này.';
  }
  return 'Web App trả về trang HTML thay vì JSON. Hãy kiểm tra URL Web App có kết thúc bằng /exec chưa.';
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'append-to-doc') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'trigger' }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // 1. Đăng nhập Google
  if (msg.type === 'loginGoogle') {
    (async () => {
      try {
        const token = await GDocsService.getAuthToken(true);
        const userInfo = await GDocsService.getUserInfo(token);
        sendResponse({ ok: true, email: userInfo?.email || '', name: userInfo?.name || '' });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true;
  }

  // 2. Đăng xuất Google
  if (msg.type === 'logoutGoogle') {
    (async () => {
      try {
        await GDocsService.logout();
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  // 3. Lấy tên tự động từ Google Docs
  if (msg.type === 'getDocName') {
    (async () => {
      try {
        const docId = extractDocId(msg.docId);
        if (!docId) {
          sendResponse({ ok: false, error: 'Chưa cung cấp Google Doc ID.' });
          return;
        }

        const store = await chrome.storage.local.get({
          authMode: 'google',
          oauthToken: '',
          tokenExpiry: 0,
          url: '',
          token: ''
        });

        const activeMode = msg.mode || store.authMode;

        // Ưu tiên dùng Google Docs REST API (nếu chọn mode google hoặc có oauthToken)
        if (activeMode === 'google' || (!store.url && store.oauthToken)) {
          try {
            const title = await GDocsService.getDocTitle(docId);
            sendResponse({ ok: true, name: title });
            return;
          } catch (gErr) {
            // Nếu lỗi Google Docs API mà có cấu hình Apps Script thì fallback, còn không thì ném lỗi
            if (!store.url) {
              sendResponse({ ok: false, error: gErr.message || String(gErr) });
              return;
            }
          }
        }

        // Dùng Apps Script Web App
        const appUrl = msg.url || store.url;
        const appToken = msg.token || store.token;

        if (!appUrl || !appToken) {
          sendResponse({
            ok: false,
            error: 'Chưa cấu hình tài khoản Google hoặc Web App URL/Token.'
          });
          return;
        }

        const res = await fetch(appUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ token: appToken, action: 'getDocName', docId })
        });

        const rawText = await res.text();
        try {
          const data = JSON.parse(rawText);
          sendResponse(data);
        } catch (_) {
          sendResponse({ ok: false, error: parseHtmlError(rawText) });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true;
  }

  // 4. Ghi nội dung vào Doc
  if (msg.type === 'append') {
    (async () => {
      try {
        const store = await chrome.storage.local.get({
          authMode: 'google',
          oauthToken: '',
          tokenExpiry: 0,
          url: '',
          token: '',
          defaultDoc: '',
          siteDocs: {}
        });

        // Xác định Doc ID đích
        let docId = '';
        if (msg.payload && msg.payload.url) {
          try {
            const hostname = new URL(msg.payload.url).hostname;
            const map = store.siteDocs || {};
            const matchedKey = Object.keys(map).find(h => hostname === h || hostname.endsWith('.' + h));
            if (matchedKey && map[matchedKey]) {
              docId = extractDocId(map[matchedKey]);
            }
          } catch (_) {}
        }
        if (!docId && store.defaultDoc) {
          docId = extractDocId(store.defaultDoc);
        }

        if (!docId) {
          sendResponse({ ok: false, error: 'Chưa chọn Google Doc để lưu. Vui lòng vào Cài đặt hoặc Popup để chọn.' });
          return;
        }

        // Chế độ 1: Google Docs REST API (Tự động 100%)
        if (store.authMode === 'google' || (!store.url && store.oauthToken)) {
          try {
            const result = await GDocsService.appendMarkdownToDoc(docId, msg.payload.text);
            sendResponse(result);
            return;
          } catch (gErr) {
            if (!store.url) {
              sendResponse({ ok: false, error: gErr.message || String(gErr) });
              return;
            }
          }
        }

        // Chế độ 2: Apps Script Web App
        if (!store.url || !store.token) {
          sendResponse({ ok: false, error: 'Chưa cấu hình tài khoản Google hoặc Web App URL.' });
          return;
        }

        const res = await fetch(store.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ token: store.token, docId, ...msg.payload })
        });

        const rawText = await res.text();
        try {
          const data = JSON.parse(rawText);
          sendResponse(data);
        } catch (_) {
          sendResponse({ ok: false, error: parseHtmlError(rawText) });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true;
  }
});
