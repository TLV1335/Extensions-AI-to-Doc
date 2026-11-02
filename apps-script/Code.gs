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

    // Hành động 1: Lấy tên Google Doc tự động theo Doc ID
    if (data.action === 'getDocName') {
      const targetDocId = (data.docId && String(data.docId).trim()) || P.getProperty('DOC_ID');
      if (!targetDocId) return json({ ok: false, error: 'Chưa cấu hình Google Doc ID.' });
      lock.waitLock(10000);
      const doc = DocumentApp.openById(targetDocId);
      return json({ ok: true, name: doc.getName() });
    }

    // Hành động 2: Ghi nội dung vào Doc (mặc định)
    const text = String(data.text || '').trim();
    if (!text) return json({ ok: false, error: 'empty' });

    // Chặn bấm hai lần liên tiếp cùng một nội dung (trừ khi có cờ force: true)
    const hash = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
    );
    if (!data.force && P.getProperty('LAST_HASH') === hash) return json({ ok: true, duplicate: true });

    lock.waitLock(15000);
    // Hỗ trợ chọn linh hoạt Doc ID từ extension; nếu không có thì fallback về DOC_ID mặc định trong Script Properties
    const targetDocId = (data.docId && String(data.docId).trim()) || P.getProperty('DOC_ID');
    if (!targetDocId) return json({ ok: false, error: 'Chưa cấu hình Google Doc ID.' });

    const doc = DocumentApp.openById(targetDocId);
    appendEntry(doc.getBody(), text, data);
    doc.saveAndClose();
    P.setProperty('LAST_HASH', hash);

    return json({ ok: true, docName: doc.getName() });
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
  // Thêm đường kẻ phân cách giữa các lần gửi
  if (body.getNumChildren() > 1) body.appendHorizontalRule();

  // Đã bỏ dòng thời gian và nguồn theo yêu cầu, ghi thẳng nội dung Markdown
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
  t.setForegroundColor('#000000'); // Đảm bảo màu chữ luôn là đen chuẩn, không bị lem màu mờ
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
  const fence = '`'.repeat(3);
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
    fence,
    'print("hello")',
    fence
  ].join('\n');
  appendEntry(DocumentApp.openById(P.getProperty('DOC_ID')).getBody(), md, { site: 'Test', url: 'https://example.com' });
}

