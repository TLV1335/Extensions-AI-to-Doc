const $ = (id) => document.getElementById(id);

const SITES = [
  { id: 'site_notebooklm', name: 'NotebookLM', hosts: ['notebooklm.google.com', 'notebook.google.com', 'notebooklm.google'] },
  { id: 'site_chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com'] },
  { id: 'site_deepseek', name: 'DeepSeek', hosts: ['chat.deepseek.com'] },
  { id: 'site_gemini', name: 'Gemini', hosts: ['gemini.google.com'] },
  { id: 'site_claude', name: 'Claude', hosts: ['claude.ai'] }
];

let savedDocsList = [];

function extractDocId(str) {
  if (!str) return '';
  const m = String(str).match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : String(str).trim();
}

// Nạp cài đặt khi mở trang
chrome.storage.local.get({
  url: '',
  token: '',
  defaultDoc: '',
  siteDocs: {},
  savedDocs: []
}).then(({ url, token, defaultDoc, siteDocs, savedDocs }) => {
  $('url').value = url || '';
  $('token').value = token || '';

  savedDocsList = savedDocs || [];
  if (defaultDoc && !savedDocsList.some(d => d.id === extractDocId(defaultDoc))) {
    savedDocsList.unshift({
      id: extractDocId(defaultDoc),
      name: 'Google Doc chính',
      url: defaultDoc
    });
  }

  renderUI(defaultDoc, siteDocs);
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

  // 3. Render danh sách tài liệu đã lưu (quản lý / xóa)
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
          <div class="doc-name">${d.name}</div>
          <div class="doc-id">ID: ${d.id}</div>
        </div>
        <button class="btn-del" data-idx="${idx}">Xóa</button>
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

  chrome.runtime.sendMessage({ type: 'getDocName', docId }, async (res) => {
    let docName = '';
    if (res && res.ok && res.name) {
      docName = res.name;
      feedback.textContent = `Đã tìm thấy: "${docName}"`;
      feedback.style.color = '#137333';
    } else {
      docName = 'Google Doc (' + docId.slice(0, 8) + '...)';
      feedback.textContent = `Đã thêm (Không lấy được tên tự động: ${((res && res.error) || 'lỗi kết nối')})`;
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

// Nút Lưu toàn bộ cài đặt
$('save').addEventListener('click', async () => {
  const url = $('url').value.trim();
  const token = $('token').value.trim();
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
    url,
    token,
    defaultDoc,
    siteDocs,
    savedDocs: savedDocsList
  });

  $('status').textContent = 'Đã lưu toàn bộ cài đặt thành công.';
  setTimeout(() => {
    $('status').textContent = '';
  }, 2500);
});
