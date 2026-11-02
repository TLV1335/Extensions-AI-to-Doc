const fs = require('fs');
const { parseHTML, Node } = require('./mock-dom');

const SKIP = new Set(['BUTTON', 'SVG', 'STYLE', 'SCRIPT', 'NOSCRIPT', 'THINKING-CHAIN-VIEW']);
const FENCE = '`'.repeat(3);

function md(node, depth = 0) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/[ \t]*\r?\n[ \t]*/g, ' ');
  }
  const isFrag = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
  if (!isFrag && node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = isFrag ? 'frag' : node.tagName.toLowerCase();
  if (!isFrag && SKIP.has(node.tagName.toUpperCase())) return '';

  const kids = () => [...node.childNodes].map((c) => md(c, depth)).join('');

  // Hỗ trợ heading role và custom attributes (NotebookLM, v.v.)
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

  // Khối đoạn văn paragraph (NotebookLM dùng div.paragraph thay vì thẻ p)
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
        directLi = [...node.children].map(c => {
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

const toMarkdown = (node) => md(node).replace(/(\r?\n\s*){2,}\r?\n/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim();

const html = fs.readFileSync('tests/fixtures/notebooklm-sample.html', 'utf8');
const dom = parseHTML(html);
console.log('=== TEST OUTPUT ===');
console.log(toMarkdown(dom));
console.log('===================');
