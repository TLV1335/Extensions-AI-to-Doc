const $ = (id) => document.getElementById(id);

let currentHost = null;
let currentTabId = null;
let savedDocsList = [];

function extractDocId(str) {
  if (!str) return '';
  const m = String(str).match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : String(str).trim();
}

// Khởi tạo Popup
async function init() {
  const { url, token, defaultDoc, siteDocs, savedDocs } = await chrome.storage.local.get({
    url: '',
    token: '',
    defaultDoc: '',
    siteDocs: {},
    savedDocs: []
  });

  // Trạng thái kết nối
  const connBadge = $('conn-status');
  if (url && token) {
    connBadge.textContent = 'Connected';
    connBadge.className = 'status-badge';
  } else {
    connBadge.textContent = 'Missing URL/Token';
    connBadge.className = 'status-badge err';
  }

  // Khởi tạo danh sách savedDocs
  savedDocsList = savedDocs || [];
  if (defaultDoc && !savedDocsList.some(d => d.id === extractDocId(defaultDoc))) {
    savedDocsList.unshift({
      id: extractDocId(defaultDoc),
      name: 'Main Google Doc',
      url: defaultDoc
    });
    await chrome.storage.local.set({ savedDocs: savedDocsList });
  }

  // Lấy thông tin tab đang mở
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      currentTabId = tab.id;
      chrome.tabs.sendMessage(tab.id, { type: 'getSiteInfo' }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
          $('site-name').textContent = 'Unsupported';
          $('site-doc-select').disabled = true;
          $('btn-send').disabled = true;
          $('btn-send').style.opacity = '0.5';
          return;
        }

        currentHost = res.hostname;
        $('site-name').textContent = res.siteName;
        renderDropdowns(defaultDoc, siteDocs);
      });
    }
  } catch (_) {
    $('site-name').textContent = 'Unknown';
  }

  renderDropdowns(defaultDoc, siteDocs);
}

// Vẽ lại 2 menu sổ xuống
function renderDropdowns(defaultDoc, siteDocs) {
  const defaultSelect = $('default-doc-select');
  const siteSelect = $('site-doc-select');

  defaultSelect.innerHTML = '';
  siteSelect.innerHTML = '';

  const activeDefaultId = extractDocId(defaultDoc);

  // 1. Menu sổ xuống Default Doc
  if (savedDocsList.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(No Docs yet - paste link below)';
    defaultSelect.appendChild(opt);
  } else {
    savedDocsList.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      if (d.id === activeDefaultId) opt.selected = true;
      defaultSelect.appendChild(opt);
    });
  }

  // 2. Menu sổ xuống Doc cho trang hiện tại
  const defaultDocObj = savedDocsList.find(d => d.id === activeDefaultId);
  const defaultName = defaultDocObj ? defaultDocObj.name : 'None';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = `Default (${defaultName})`;
  siteSelect.appendChild(defaultOption);

  const map = siteDocs || {};
  let currentSiteDocId = '';
  if (currentHost) {
    const matchedKey = Object.keys(map).find(h => currentHost === h || currentHost.endsWith('.' + h));
    currentSiteDocId = matchedKey ? extractDocId(map[matchedKey]) : '';
  }

  savedDocsList.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name;
    if (d.id === currentSiteDocId) opt.selected = true;
    siteSelect.appendChild(opt);
  });
}

// Khi người dùng chọn thay đổi Google Doc Mặc định
$('default-doc-select').addEventListener('change', async (e) => {
  const chosenId = e.target.value;
  if (!chosenId) return;

  await chrome.storage.local.set({ defaultDoc: chosenId });

  const { siteDocs } = await chrome.storage.local.get({ siteDocs: {} });
  renderDropdowns(chosenId, siteDocs);

  flashStatus('Default Doc updated!');
});

// Khi người dùng chọn Google Doc riêng cho trang này
$('site-doc-select').addEventListener('change', async (e) => {
  const chosenId = e.target.value;
  if (!currentHost) return;

  const { siteDocs, defaultDoc } = await chrome.storage.local.get({ siteDocs: {}, defaultDoc: '' });
  const map = siteDocs || {};

  if (chosenId) {
    map[currentHost] = chosenId;
    flashStatus(`Set for ${$('site-name').textContent}!`);
  } else {
    delete map[currentHost];
    flashStatus(`Reset to Default!`);
  }

  await chrome.storage.local.set({ siteDocs: map });
  renderDropdowns(defaultDoc, map);
});

// Nút Thêm link mới & Tự động lấy tên
$('btn-fetch-add').addEventListener('click', async () => {
  const inputVal = $('new-doc-input').value.trim();
  const feedback = $('add-feedback');

  if (!inputVal) {
    feedback.textContent = 'Please paste a valid Google Doc link.';
    feedback.style.color = '#c5221f';
    return;
  }

  const docId = extractDocId(inputVal);
  feedback.textContent = 'Fetching document name...';
  feedback.style.color = '#1a73e8';

  chrome.runtime.sendMessage({ type: 'getDocName', docId }, async (res) => {
    let docName = '';
    if (res && res.ok && res.name) {
      docName = res.name;
      feedback.textContent = `Found: "${docName}"`;
      feedback.style.color = '#137333';
    } else {
      docName = 'Doc (' + docId.slice(0, 8) + '...)';
      feedback.textContent = `Added (Could not fetch name: ${((res && res.error) || 'network')})`;
      feedback.style.color = '#e37400';
    }

    const existingIndex = savedDocsList.findIndex(d => d.id === docId);
    if (existingIndex >= 0) {
      savedDocsList[existingIndex].name = docName;
      savedDocsList[existingIndex].url = inputVal;
    } else {
      savedDocsList.push({ id: docId, name: docName, url: inputVal });
    }

    const { defaultDoc, siteDocs } = await chrome.storage.local.get({ defaultDoc: '', siteDocs: {} });
    const newDefault = defaultDoc || docId;

    await chrome.storage.local.set({
      savedDocs: savedDocsList,
      defaultDoc: newDefault
    });

    $('new-doc-input').value = '';
    renderDropdowns(newDefault, siteDocs);
  });
});

// Gửi ngay từ popup
$('btn-send').addEventListener('click', () => {
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, { type: 'trigger' });
    window.close();
  }
});

// Mở trang Options
$('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

function flashStatus(msg) {
  $('save-status').textContent = msg;
  setTimeout(() => {
    $('save-status').textContent = '';
  }, 2200);
}

document.addEventListener('DOMContentLoaded', init);
