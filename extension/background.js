function extractDocId(str) {
  if (!str) return '';
  const m = String(str).match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : String(str).trim();
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'append-to-doc') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'trigger' }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Lấy tên tự động từ Google Docs qua Apps Script
  if (msg.type === 'getDocName') {
    (async () => {
      try {
        const { url, token } = await chrome.storage.local.get({ url: '', token: '' });
        if (!url || !token) {
          sendResponse({ ok: false, error: 'Chưa cấu hình Web App URL/Token.' });
          return;
        }
        const docId = extractDocId(msg.docId);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ token, action: 'getDocName', docId })
        });
        sendResponse(await res.json());
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  // Ghi nội dung vào Doc
  if (msg.type === 'append') {
    (async () => {
      try {
        const { url, token, defaultDoc, siteDocs } = await chrome.storage.local.get({
          url: '',
          token: '',
          defaultDoc: '',
          siteDocs: {}
        });

        if (!url || !token) {
          sendResponse({ ok: false, error: 'Chưa cấu hình URL/token (trang Options của extension).' });
          return;
        }

        // Xác định Doc ID đích: ưu tiên Doc riêng theo trang -> fallback về Doc mặc định
        let docId = '';
        if (msg.payload && msg.payload.url) {
          try {
            const hostname = new URL(msg.payload.url).hostname;
            const map = siteDocs || {};
            const matchedKey = Object.keys(map).find(h => hostname === h || hostname.endsWith('.' + h));
            if (matchedKey && map[matchedKey]) {
              docId = extractDocId(map[matchedKey]);
            }
          } catch (_) {}
        }

        if (!docId && defaultDoc) {
          docId = extractDocId(defaultDoc);
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ token, docId, ...msg.payload })
        });
        sendResponse(await res.json());
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // Giữ kênh mở cho sendResponse bất đồng bộ
  }
});
