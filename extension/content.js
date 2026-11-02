const FENCE = '`'.repeat(3);

/* Selector lấy tin nhắn AI cuối cùng.
   Có thể cập nhật lại khi giao diện của các site thay đổi. */
const ADAPTERS = [
  {
    host: 'chat.deepseek.com',
    name: 'DeepSeek',
    last: () => [...document.querySelectorAll('.ds-markdown')].pop()
  },
  {
    host: 'chatgpt.com',
    name: 'ChatGPT',
    last: () => [...document.querySelectorAll('[data-message-author-role="assistant"]')].pop()
  },
  {
    host: 'gemini.google.com',
    name: 'Gemini',
    last: () => [...document.querySelectorAll('message-content')].pop()
  },
  {
    host: 'claude.ai',
    name: 'Claude',
    last: () => [...document.querySelectorAll('.font-claude-response')].pop()
  },
  {
    host: 'notebooklm.google.com',
    name: 'NotebookLM',
    last: () => [...document.querySelectorAll('labs-tailwind-doc-viewer, chat-message .message-content, chat-message')].pop()
  },
  {
    host: 'notebook.google.com',
    name: 'NotebookLM',
    last: () => [...document.querySelectorAll('labs-tailwind-doc-viewer, chat-message .message-content, chat-message')].pop()
  }
];

const SKIP = new Set(['BUTTON', 'SVG', 'STYLE', 'SCRIPT', 'NOSCRIPT', 'THINKING-CHAIN-VIEW']);

/* ---------- HTML -> Markdown ---------- */

function md(node, depth = 0) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/[ \t]*\r?\n[ \t]*/g, ' ');
  }
  const isFrag = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
  if (!isFrag && node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = isFrag ? 'frag' : node.tagName.toLowerCase();
  if (!isFrag && SKIP.has(node.tagName.toUpperCase())) return '';

  const kids = () => [...node.childNodes].map((c) => md(c, depth)).join('');

  // Hỗ trợ heading dạng role="heading" và aria-level (NotebookLM, v.v.)
  const role = node.getAttribute && node.getAttribute('role');
  const ariaLevel = node.getAttribute && node.getAttribute('aria-level');
  if (role === 'heading' && ariaLevel) {
    const lvl = Math.min(Math.max(Number(ariaLevel) || 1, 1), 6);
    return '\n\n' + '#'.repeat(lvl) + ' ' + kids().trim() + '\n\n';
  }

  // Inline code dạng <b class="code"> hoặc <span class="code">
  const cls = (node.getAttribute && node.getAttribute('class')) || '';
  if (/\bcode\b/.test(cls) && (tag === 'b' || tag === 'span' || tag === 'strong')) {
    return '`' + kids().trim() + '`';
  }

  // Đoạn văn dạng div.paragraph (NotebookLM)
  if (tag === 'div' && /\bparagraph\b/.test(cls) && !/\blist-item\b/.test(cls)) {
    return '\n\n' + kids().trim() + '\n\n';
  }

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
      const href = (node.getAttribute && node.getAttribute('href')) || '';
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
      // Tìm các thẻ li (hỗ trợ cả trường hợp bị bọc bởi custom element trong Angular/NotebookLM)
      let directLi = [...node.children].filter((e) => e.tagName === 'LI');
      if (!directLi.length) {
        directLi = [...node.children].map((c) => {
          if (c.tagName === 'LI') return c;
          const found = c.querySelectorAll ? c.querySelectorAll('li') : [];
          return found[0] || null;
        }).filter(Boolean);
      }

      const items = directLi.map((li, i) => {
        const own = [...li.childNodes]
          .filter((c) => !(c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)))
          .map((c) => md(c, depth)).join('').replace(/\s*\n+\s*/g, ' ').trim();
        const nested = [...li.children]
          .filter((c) => /^(UL|OL)$/.test(c.tagName))
          .map((c) => md(c, depth + 1)).join('').replace(/^\n+|\n+$/g, '');
        const line = '  '.repeat(depth) + (tag === 'ol' ? (i + 1) + '. ' : '- ') + own;
        return nested ? line + '\n' + nested + '\n' : line + '\n';
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

const toMarkdown = (node) => md(node)
  .replace(/(\r?\n\s*){2,}\r?\n/g, '\n\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/* ---------- Lấy nội dung ---------- */

function getPayload() {
  const adapter = ADAPTERS.find((a) =>
    location.hostname === a.host || location.hostname.endsWith('.' + a.host));

  let text = '';
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) {
    text = toMarkdown(sel.getRangeAt(0).cloneContents()); // Ưu tiên đoạn bôi đen
  } else if (adapter) {
    const el = adapter.last();
    if (el) text = toMarkdown(el);                         // Không có thì lấy tin nhắn cuối
  }
  return {
    text,
    site: adapter ? adapter.name : location.hostname,
    url: location.href,
    title: document.title
  };
}

/* ---------- UI ---------- */

let lastPayload = null;

function toast(msg, type = 'ok', action = null) {
  let el = document.getElementById('a2d-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'a2d-toast';
    // Di chuột vào thì tạm dừng biến mất để kịp bấm nút
    el.addEventListener('mouseenter', () => clearTimeout(toast._t));
    el.addEventListener('mouseleave', () => {
      clearTimeout(toast._t);
      toast._t = setTimeout(() => {
        el.classList.remove('show');
      }, action ? 6000 : 2800);
    });
    document.documentElement.appendChild(el);
  }
  el.innerHTML = '';
  const textSpan = document.createElement('span');
  textSpan.textContent = msg;
  el.appendChild(textSpan);

  if (action) {
    const actBtn = document.createElement('button');
    actBtn.type = 'button';
    actBtn.className = 'a2d-toast-btn';
    actBtn.textContent = action.text;
    actBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    actBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      action.onClick();
    });
    el.appendChild(actBtn);
  }

  el.className = `${type} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove('show');
  }, action ? 8000 : 2800);
}

async function run(force = false, callback = null) {
  let payload = getPayload();
  // Nếu là gửi đè (force) mà getPayload() rỗng (do mất vùng bôi đen khi click), dùng lại payload vừa bắt được
  if ((!payload || !payload.text) && force && lastPayload) {
    payload = lastPayload;
  }
  if (!payload || !payload.text) {
    toast('No content found to send (check selector).', 'err');
    if (callback) callback({ ok: false, error: 'No content' });
    return;
  }
  lastPayload = payload;

  toast(force ? 'Sending anyway...' : 'Sending...', 'ok');
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'append',
      payload: { ...payload, force }
    });
    if (res && res.ok) {
      if (res.duplicate) {
        toast('Already sent.', 'warn', {
          text: 'Send anyway',
          onClick: () => run(true)
        });
      } else {
        const successMsg = res.docName ? `Added to: ${res.docName}` : 'Added to Docs.';
        toast(successMsg, 'ok');
      }
    } else {
      toast('Error: ' + ((res && res.error) || 'unknown'), 'err');
    }
    if (callback) callback(res);
  } catch (e) {
    toast('Error: ' + e, 'err');
    if (callback) callback({ ok: false, error: String(e) });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'trigger') {
    run(!!msg.force, sendResponse);
    return true; // Giữ kênh mở cho sendResponse bất đồng bộ
  }
  if (msg.type === 'getSiteInfo') {
    const adapter = ADAPTERS.find((a) =>
      location.hostname === a.host || location.hostname.endsWith('.' + a.host)
    );
    sendResponse({
      ok: true,
      hostname: location.hostname,
      siteName: adapter ? adapter.name : location.hostname
    });
  }
});

const btn = document.createElement('button');
btn.id = 'a2d-btn';
btn.title = 'Send to Google Docs (Alt+Shift+D)';
btn.innerHTML = '<span class="a2d-arrow">→</span><span class="a2d-txt">Docs</span>';
btn.addEventListener('mousedown', (e) => e.preventDefault()); // Giữ nguyên vùng bôi đen khi bấm
btn.addEventListener('click', () => run(false));
document.documentElement.appendChild(btn);

