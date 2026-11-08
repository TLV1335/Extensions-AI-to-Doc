const $ = (id) => document.getElementById(id);

const SITES = [
  { id: 'site_notebooklm', name: 'NotebookLM', hosts: ['notebooklm.google.com', 'notebook.google.com', 'notebooklm.google'] },
  { id: 'site_chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com'] },
  { id: 'site_deepseek', name: 'DeepSeek', hosts: ['chat.deepseek.com'] },
  { id: 'site_gemini', name: 'Gemini', hosts: ['gemini.google.com'] },
  { id: 'site_claude', name: 'Claude', hosts: ['claude.ai'] }
];

let savedDocsList = [];
let currentAuthMode = 'google';

function extractDocId(str) {
  if (!str) return '';
  const m = String(str).match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : String(str).trim();
}

// Khởi tạo hiển thị Redirect URI của Extension
if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getRedirectURL) {
  try {
    const redirectEl = $('extension-redirect-uri');
    if (redirectEl) {
      redirectEl.textContent = chrome.identity.getRedirectURL();
    }
  } catch (_) {}
}

// Nạp cài đặt khi mở trang
chrome.storage.local.get({
  authMode: 'google',
  userEmail: '',
  oauthToken: '',
  googleClientId: '',
  url: '',
  token: '',
  defaultDoc: '',
  siteDocs: {},
  savedDocs: []
}).then((store) => {
  currentAuthMode = store.authMode || 'google';
  setAuthTab(currentAuthMode);

  if ($('url')) $('url').value = store.url || '';
  if ($('token')) $('token').value = store.token || '';
  if ($('google-client-id')) $('google-client-id').value = store.googleClientId || '';

  updateGoogleAuthUI(store.userEmail, Boolean(store.oauthToken));

  savedDocsList = store.savedDocs || [];
  if (store.defaultDoc && !savedDocsList.some(d => d.id === extractDocId(store.defaultDoc))) {
    savedDocsList.unshift({
      id: extractDocId(store.defaultDoc),
      name: 'Google Doc chính',
      url: store.defaultDoc
    });
  }

  renderUI(store.defaultDoc, store.siteDocs);
});

function setAuthTab(mode) {
  currentAuthMode = mode;
  if (mode === 'google') {
    $('tab-google').classList.add('active');
    $('tab-appsscript').classList.remove('active');
    $('section-google-auth').style.display = 'block';
    $('section-appsscript').style.display = 'none';
  } else {
    $('tab-appsscript').classList.add('active');
    $('tab-google').classList.remove('active');
    $('section-appsscript').style.display = 'block';
    $('section-google-auth').style.display = 'none';
  }
  chrome.storage.local.set({ authMode: mode });
}

$('tab-google').addEventListener('click', () => setAuthTab('google'));
$('tab-appsscript').addEventListener('click', () => setAuthTab('appsscript'));

function updateGoogleAuthUI(email, isConnected) {
  const disView = $('google-disconnected-view');
  const connView = $('google-connected-view');
  const emailDisplay = $('user-email-display');

  if (isConnected && email) {
    disView.style.display = 'none';
    connView.style.display = 'block';
    emailDisplay.textContent = email;
  } else {
    disView.style.display = 'block';
    connView.style.display = 'none';
  }
}

// Xử lý nút Đăng nhập Google
$('btn-login-google').addEventListener('click', () => {
  const statusEl = $('google-login-status');
  statusEl.textContent = 'Đang mở cửa sổ đăng nhập Google...';
  statusEl.style.color = '#1a73e8';

  const customClientId = ($('google-client-id') && $('google-client-id').value.trim()) || '';
  chrome.storage.local.set({ googleClientId: customClientId }).then(() => {
    chrome.runtime.sendMessage({ type: 'loginGoogle' }, (res) => {
      if (res && res.ok) {
        statusEl.textContent = '';
        updateGoogleAuthUI(res.email, true);
        showStatus('Đăng nhập tài khoản Google thành công!');
      } else {
        statusEl.textContent = `Lỗi đăng nhập: ${res?.error || 'Không thành công'}`;
        statusEl.style.color = '#c5221f';
      }
    });
  });
});

// Xử lý nút Đăng xuất Google
$('btn-logout-google').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'logoutGoogle' }, () => {
    updateGoogleAuthUI('', false);
    showStatus('Đã đăng xuất tài khoản Google.');
  });
});

function renderUI(defaultDoc, siteDocs) {
  const activeDefaultId = extractDocId(defaultDoc);
  const map = siteDocs || {};

  // 1. Render Default Doc select
  const defaultSelect = $('default-doc-select');
  defaultSelect.innerHTML = '';

  if (savedDocsList.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(Chưa có tài liệu nào - Hãy dán link bên dưới để thêm)';
    defaultSelect.appendChild(opt);
  } else {
    savedDocsList.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.name} (${d.id.slice(0, 8)}...)`;
      if (d.id === activeDefaultId) opt.selected = true;
      defaultSelect.appendChild(opt);
    });
  }

  // 2. Render Site-specific selects
  SITES.forEach(s => {
    const el = $(s.id);
    if (!el) return;
    el.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- (Dùng Google Doc mặc định chung) --';
    el.appendChild(defaultOpt);

    const siteDocVal = map[s.hosts[0]] ? extractDocId(map[s.hosts[0]]) : '';
    savedDocsList.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      if (d.id === siteDocVal) opt.selected = true;
      el.appendChild(opt);
    });
  });

  // 3. Render danh sách tài liệu đã lưu
  const listContainer = $('doc-list-container');
  const itemsContainer = $('doc-list-items');
  itemsContainer.innerHTML = '';

  if (savedDocsList.length > 0) {
    listContainer.style.display = 'block';
    savedDocsList.forEach((d, idx) => {
      const row = document.createElement('div');
      row.className = 'doc-item';
      row.innerHTML = `
        <div>
          <div class="doc-name">${escapeHtml(d.name)}</div>
          <div class="doc-id">ID: ${escapeHtml(d.id)}</div>
        </div>
        <button class="btn-del" data-idx="${idx}" type="button">Xóa</button>
      `;
      itemsContainer.appendChild(row);
    });

    itemsContainer.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const i = Number(e.target.getAttribute('data-idx'));
        savedDocsList.splice(i, 1);
        await chrome.storage.local.set({ savedDocs: savedDocsList });
        const { defaultDoc: curDef, siteDocs: curSites } = await chrome.storage.local.get({ defaultDoc: '', siteDocs: {} });
        renderUI(curDef, curSites);
      });
    });
  } else {
    listContainer.style.display = 'none';
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// Nút Thêm Doc & Tự động lấy tên
$('btn-fetch-add').addEventListener('click', async () => {
  const inputVal = $('new-doc-input').value.trim();
  const feedback = $('add-feedback');

  if (!inputVal) {
    feedback.textContent = 'Vui lòng dán link hoặc ID Google Doc.';
    feedback.style.color = '#c5221f';
    return;
  }

  const docId = extractDocId(inputVal);
  feedback.textContent = 'Đang tự động lấy tên Google Doc...';
  feedback.style.color = '#1a73e8';

  // Lấy dữ liệu input hiện tại để gửi kèm
  const currentUrl = $('url') ? $('url').value.trim() : '';
  const currentToken = $('token') ? $('token').value.trim() : '';

  // Tự động lưu ngầm URL và Token
  await chrome.storage.local.set({
    url: currentUrl,
    token: currentToken,
    authMode: currentAuthMode
  });

  chrome.runtime.sendMessage({
    type: 'getDocName',
    docId,
    mode: currentAuthMode,
    url: currentUrl,
    token: currentToken
  }, async (res) => {
    let docName = '';
    if (res && res.ok && res.name) {
      docName = res.name;
      feedback.textContent = `✓ Đã tìm thấy: "${docName}"`;
      feedback.style.color = '#137333';
    } else {
      docName = 'Google Doc (' + docId.slice(0, 8) + '...)';
      const errMsg = (res && res.error) || 'Không thể kết nối đến tài liệu';
      feedback.textContent = `Đã thêm ID (Chưa lấy được tên tự động: ${errMsg})`;
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
    renderUI(newDefault, siteDocs);
  });
});

// Tự động lưu khi thay đổi chọn lựa
$('default-doc-select').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ defaultDoc: e.target.value });
  showStatus('Đã cập nhật Google Doc mặc định.');
});

// Nút Lưu toàn bộ cài đặt
$('save').addEventListener('click', async () => {
  const url = $('url') ? $('url').value.trim() : '';
  const token = $('token') ? $('token').value.trim() : '';
  const googleClientId = $('google-client-id') ? $('google-client-id').value.trim() : '';
  const defaultDoc = $('default-doc-select').value;

  const siteDocs = {};
  SITES.forEach(s => {
    const val = $(s.id) ? $(s.id).value : '';
    if (val) {
      s.hosts.forEach(h => {
        siteDocs[h] = val;
      });
    }
  });

  await chrome.storage.local.set({
    authMode: currentAuthMode,
    googleClientId,
    url,
    token,
    defaultDoc,
    siteDocs,
    savedDocs: savedDocsList
  });

  showStatus('Đã lưu toàn bộ cài đặt thành công.');
});

function showStatus(text) {
  const el = $('status');
  if (!el) return;
  el.textContent = text;
  setTimeout(() => {
    el.textContent = '';
  }, 2500);
}
