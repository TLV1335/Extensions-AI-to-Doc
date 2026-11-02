const $ = (id) => document.getElementById(id);

// Danh sách các trang được hỗ trợ
const SITES = [
  { id: 'site_notebooklm', hosts: ['notebooklm.google.com', 'notebook.google.com', 'notebooklm.google'] },
  { id: 'site_chatgpt', hosts: ['chatgpt.com'] },
  { id: 'site_deepseek', hosts: ['chat.deepseek.com'] },
  { id: 'site_gemini', hosts: ['gemini.google.com'] },
  { id: 'site_claude', hosts: ['claude.ai'] }
];

// Nạp cài đặt đã lưu
chrome.storage.local.get({
  url: '',
  token: '',
  defaultDoc: '',
  siteDocs: {}
}).then(({ url, token, defaultDoc, siteDocs }) => {
  $('url').value = url || '';
  $('token').value = token || '';
  $('defaultDoc').value = defaultDoc || '';

  const map = siteDocs || {};
  SITES.forEach((s) => {
    // Lấy giá trị theo host đại diện đầu tiên
    const val = map[s.hosts[0]] || '';
    if ($(s.id)) $(s.id).value = val;
  });
});

// Lưu cài đặt
$('save').addEventListener('click', async () => {
  const url = $('url').value.trim();
  const token = $('token').value.trim();
  const defaultDoc = $('defaultDoc').value.trim();

  const siteDocs = {};
  SITES.forEach((s) => {
    const val = $(s.id) ? $(s.id).value.trim() : '';
    if (val) {
      s.hosts.forEach((h) => {
        siteDocs[h] = val;
      });
    }
  });

  await chrome.storage.local.set({
    url,
    token,
    defaultDoc,
    siteDocs
  });

  $('status').textContent = 'Đã lưu toàn bộ cài đặt thành công.';
  setTimeout(() => {
    $('status').textContent = '';
  }, 2500);
});
