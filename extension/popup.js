const $ = (id) => document.getElementById(id);

let currentHost = null;
let currentTabId = null;

// Khởi tạo Popup
async function init() {
  // Đọc cấu hình lưu trữ
  const { url, token, defaultDoc, siteDocs } = await chrome.storage.local.get({
    url: '',
    token: '',
    defaultDoc: '',
    siteDocs: {}
  });

  // Trạng thái kết nối
  const connBadge = $('conn-status');
  if (url && token) {
    connBadge.textContent = 'Đã kết nối';
    connBadge.className = 'status-badge';
  } else {
    connBadge.textContent = 'Chưa có URL/Token';
    connBadge.className = 'status-badge err';
  }

  // Nạp Doc mặc định
  $('default-doc').value = defaultDoc || '';

  // Lấy tab hiện tại
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      currentTabId = tab.id;
      // Gửi message tới content script để lấy thông tin site
      chrome.tabs.sendMessage(tab.id, { type: 'getSiteInfo' }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
          $('site-name').textContent = 'Trang này không hỗ trợ AI';
          $('current-site-doc').disabled = true;
          $('btn-send').disabled = true;
          $('btn-send').style.opacity = '0.5';
          return;
        }

        currentHost = res.hostname;
        $('site-name').textContent = res.siteName;

        const map = siteDocs || {};
        const matchedKey = Object.keys(map).find(h => currentHost === h || currentHost.endsWith('.' + h));
        $('current-site-doc').value = (matchedKey && map[matchedKey]) || '';
      });
    }
  } catch (_) {
    $('site-name').textContent = 'Không rõ trang';
  }
}

// Lưu nhanh cài đặt
$('btn-save').addEventListener('click', async () => {
  const defaultDoc = $('default-doc').value.trim();
  const currentSiteVal = $('current-site-doc').value.trim();

  const { siteDocs } = await chrome.storage.local.get({ siteDocs: {} });
  const map = siteDocs || {};

  if (currentHost) {
    if (currentSiteVal) {
      map[currentHost] = currentSiteVal;
    } else {
      delete map[currentHost];
    }
  }

  await chrome.storage.local.set({
    defaultDoc,
    siteDocs: map
  });

  $('save-status').textContent = 'Đã lưu!';
  setTimeout(() => {
    $('save-status').textContent = '';
  }, 2000);
});

// Gửi nội dung ngay từ popup
$('btn-send').addEventListener('click', async () => {
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, { type: 'trigger' });
    window.close(); // Đóng popup sau khi bấm gửi
  }
});

// Mở trang Options nâng cao
$('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.addEventListener('DOMContentLoaded', init);

