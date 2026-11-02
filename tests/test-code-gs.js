/**
 * Unit & Logic Testing for Backend Apps Script Parser (Code.gs)
 * Tests Markdown-to-Docs line parsing, inline formatting, table extraction, and deduplication.
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

// Mock DocumentApp and PropertiesService
class MockText {
  constructor() {
    this.text = '';
    this.styles = [];
  }
  setText(t) { this.text = t; return this; }
  setFontSize() { return this; }
  setForegroundColor() { return this; }
  setFontFamily(s, e, font) { this.styles.push({ type: 'font', s, e, font }); return this; }
  setBackgroundColor(s, e, col) { this.styles.push({ type: 'bg', s, e, col }); return this; }
  setLinkUrl(s, e, url) { this.styles.push({ type: 'link', s, e, url }); return this; }
  setBold(s, e) { this.styles.push({ type: 'bold', s, e }); return this; }
  setItalic(s, e) { this.styles.push({ type: 'italic', s, e }); return this; }
}

class MockParagraph {
  constructor(heading) {
    this.heading = heading;
    this._text = new MockText();
    this.indent = 0;
  }
  setHeading(h) { this.heading = h; }
  setAttributes() {}
  setIndentStart(i) { this.indent = i; }
  editAsText() { return this._text; }
}

class MockListItem {
  constructor(glyph, indent) {
    this.glyph = glyph;
    this.indent = indent;
    this._text = new MockText();
  }
  setAttributes() {}
  setListId() {}
  setGlyphType(g) { this.glyph = g; }
  setNestingLevel(l) { this.nesting = l; }
  editAsText() { return this._text; }
}

class MockBody {
  constructor() {
    this.elements = [];
  }
  getNumChildren() { return this.elements.length; }
  appendHorizontalRule() {
    this.elements.push({ type: 'hr' });
  }
  appendParagraph(text) {
    const p = new MockParagraph();
    if (text) p.editAsText().setText(text);
    this.elements.push(p);
    return p;
  }
  appendListItem() {
    const li = new MockListItem();
    this.elements.push(li);
    return li;
  }
  appendTable(rows) {
    const tbl = {
      type: 'table',
      rows,
      getRow: (idx) => ({
        getNumCells: () => rows[idx].length,
        getCell: () => ({ editAsText: () => new MockText() })
      })
    };
    this.elements.push(tbl);
    return tbl;
  }
}

// Load Code.gs into Node sandbox with mocked Apps Script environment
const codeGsRaw = fs.readFileSync('apps-script/Code.gs', 'utf8');

const mockProps = new Map([
  ['DOC_ID', 'test-doc-id-12345'],
  ['TOKEN', 'super-secret-token-32-chars-long-abc']
]);

const sandbox = {
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => mockProps.get(k) || null,
      setProperty: (k, v) => { mockProps.set(k, v); }
    })
  },
  DocumentApp: {
    ParagraphHeading: {
      NORMAL: 'NORMAL',
      HEADING1: 'HEADING1',
      HEADING2: 'HEADING2',
      HEADING3: 'HEADING3',
      HEADING4: 'HEADING4',
      HEADING5: 'HEADING5',
      HEADING6: 'HEADING6'
    },
    GlyphType: {
      BULLET: 'BULLET',
      NUMBER: 'NUMBER'
    },
    Attribute: {
      BOLD: 'BOLD',
      ITALIC: 'ITALIC',
      UNDERLINE: 'UNDERLINE',
      FOREGROUND_COLOR: 'FOREGROUND_COLOR',
      FONT_FAMILY: 'FONT_FAMILY',
      FONT_SIZE: 'FONT_SIZE'
    },
    openById: () => ({
      getBody: () => new MockBody(),
      saveAndClose: () => {}
    })
  },
  Utilities: {
    DigestAlgorithm: { MD5: 'MD5' },
    computeDigest: (_algo, text) => crypto.createHash('md5').update(text, 'utf8').digest(),
    base64Encode: (buf) => Buffer.from(buf).toString('base64'),
    formatDate: () => '2026-11-01 23:00'
  },
  Session: {
    getScriptTimeZone: () => 'Asia/Ho_Chi_Minh'
  },
  LockService: {
    getScriptLock: () => ({
      waitLock: () => {},
      releaseLock: () => {}
    })
  },
  ContentService: {
    createTextOutput: (s) => ({
      content: s,
      setMimeType: function(m) { this.mime = m; return this; }
    }),
    MimeType: { JSON: 'JSON' }
  }
};

vm.createContext(sandbox);
vm.runInContext(codeGsRaw, sandbox);

const suite = {
  name: 'Apps Script Backend Converter & Deduplication Logic (Code.gs)',
  tests: []
};

function test(name, fn) {
  suite.tests.push({ name, fn });
}

/* ==================== TEST CASES ==================== */

// --- 1. Markdown Parsing: Headings & Paragraphs ---
test('Backend Parser: Heading 1 through Heading 3', () => {
  const body = new MockBody();
  const md = '# Tiêu đề 1\n## Tiêu đề 2\n### Tiêu đề 3';
  sandbox.appendMarkdown(body, md);

  assert.strictEqual(body.elements.length, 3);
  assert.strictEqual(body.elements[0].heading, 'HEADING1');
  assert.strictEqual(body.elements[0].editAsText().text, 'Tiêu đề 1');
  assert.strictEqual(body.elements[1].heading, 'HEADING2');
  assert.strictEqual(body.elements[2].heading, 'HEADING3');
});

// --- 2. Markdown Parsing: Lists (Bullet and Numbered) ---
test('Backend Parser: Bullet list and Numbered list', () => {
  const body = new MockBody();
  const md = '- Mục đạn 1\n* Mục đạn 2\n1. Bước một\n2. Bước hai';
  sandbox.appendMarkdown(body, md);

  assert.strictEqual(body.elements.length, 4);
  assert.strictEqual(body.elements[0].glyph, 'BULLET');
  assert.strictEqual(body.elements[0].editAsText().text, 'Mục đạn 1');
  assert.strictEqual(body.elements[1].glyph, 'BULLET');
  assert.strictEqual(body.elements[2].glyph, 'NUMBER');
  assert.strictEqual(body.elements[2].editAsText().text, 'Bước một');
});

// --- 3. Markdown Parsing: Horizontal Rules ---
test('Backend Parser: Horizontal rules (---, ***, ___)', () => {
  const body = new MockBody();
  const md = 'Đoạn trên\n---\nĐoạn dưới';
  sandbox.appendMarkdown(body, md);

  assert.strictEqual(body.elements.length, 3);
  assert.strictEqual(body.elements[1].type, 'hr');
});

// --- 4. Markdown Parsing: Tables ---
test('Backend Parser: Table extraction & separator line stripping', () => {
  const body = new MockBody();
  const md = '| Cột 1 | Cột 2 |\n|---|---|\n| Giá trị 1 | Giá trị 2 |';
  sandbox.appendMarkdown(body, md);

  assert.strictEqual(body.elements.length, 1);
  const tbl = body.elements[0];
  assert.strictEqual(tbl.type, 'table');
  // Hàng phân cách |---|---| phải bị loại bỏ
  assert.strictEqual(tbl.rows.length, 2);
  assert.deepEqual(Array.from(tbl.rows[0]), ['Cột 1', 'Cột 2']);
  assert.deepEqual(Array.from(tbl.rows[1]), ['Giá trị 1', 'Giá trị 2']);
});

// --- 5. Inline Formatting (addInline) ---
test('Inline parser: Bold, Italic, Code, Link combined', () => {
  const p = new MockParagraph();
  const rawText = 'Đây là **đậm**, *nghiêng*, `code` và [liên kết](https://example.com)';
  sandbox.addInline(p, rawText);

  const t = p.editAsText();
  assert.strictEqual(t.text, 'Đây là đậm, nghiêng, code và liên kết');
  // 5 style calls: bold, italic, code(font+bg), link
  const types = t.styles.map((s) => s.type);
  assert.strictEqual(types.includes('bold'), true);
  assert.strictEqual(types.includes('italic'), true);
  assert.strictEqual(types.includes('link'), true);
  assert.strictEqual(types.includes('font'), true);
  assert.strictEqual(types.includes('bg'), true);
});

// --- 6. Security & Deduplication via doPost ---
test('doPost: Rejects unauthorized requests without valid token', () => {
  const req = {
    postData: {
      contents: JSON.stringify({ token: 'wrong-token', text: 'Nội dung' })
    }
  };
  const res = JSON.parse(sandbox.doPost(req).content);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'unauthorized');
});

test('doPost: Rejects empty content', () => {
  const req = {
    postData: {
      contents: JSON.stringify({
        token: 'super-secret-token-32-chars-long-abc',
        text: '   '
      })
    }
  };
  const res = JSON.parse(sandbox.doPost(req).content);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'empty');
});

test('doPost: Deduplication prevents sending identical content twice', () => {
  const textContent = 'Kiểm thử bài viết số 123';
  const req = {
    postData: {
      contents: JSON.stringify({
        token: 'super-secret-token-32-chars-long-abc',
        text: textContent
      })
    }
  };

  // Lần 1: Thành công
  const res1 = JSON.parse(sandbox.doPost(req).content);
  assert.strictEqual(res1.ok, true);
  assert.strictEqual(res1.duplicate, undefined);

  // Lần 2 (ngay sau đó): Phải báo duplicate
  const res2 = JSON.parse(sandbox.doPost(req).content);
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(res2.duplicate, true);

  // Lần 3: Đổi nội dung -> Phải cho phép ghi
  const req3 = {
    postData: {
      contents: JSON.stringify({
        token: 'super-secret-token-32-chars-long-abc',
        text: textContent + ' mới'
      })
    }
  };
  const res3 = JSON.parse(sandbox.doPost(req3).content);
  assert.strictEqual(res3.ok, true);
  assert.strictEqual(res3.duplicate, undefined);
});

// --- 7. Flexible Doc Routing ---
test('doPost: Supports custom docId passed in payload', () => {
  let openedId = null;
  const origOpen = sandbox.DocumentApp.openById;
  sandbox.DocumentApp.openById = (id) => {
    openedId = id;
    return origOpen(id);
  };

  const req = {
    postData: {
      contents: JSON.stringify({
        token: 'super-secret-token-32-chars-long-abc',
        docId: 'custom-user-doc-id-999',
        text: 'Nội dung cho doc riêng'
      })
    }
  };
  const res = JSON.parse(sandbox.doPost(req).content);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(openedId, 'custom-user-doc-id-999', 'Phải mở đúng Doc ID được truyền lên từ extension');

  sandbox.DocumentApp.openById = origOpen;
});

test('doPost: Falls back to ScriptProperties DOC_ID when docId is omitted', () => {
  let openedId = null;
  const origOpen = sandbox.DocumentApp.openById;
  sandbox.DocumentApp.openById = (id) => {
    openedId = id;
    return origOpen(id);
  };

  const req = {
    postData: {
      contents: JSON.stringify({
        token: 'super-secret-token-32-chars-long-abc',
        text: 'Nội dung dùng fallback'
      })
    }
  };
  const res = JSON.parse(sandbox.doPost(req).content);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(openedId, 'test-doc-id-12345', 'Phải fallback về DOC_ID mặc định');

  sandbox.DocumentApp.openById = origOpen;
});

module.exports = suite;
