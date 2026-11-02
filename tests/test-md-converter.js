/**
 * Unit & Boundary Value Analysis Testing for HTML to Markdown Converter
 * (md() and toMarkdown() in extension/content.js)
 */

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { Node, parseHTML } = require('./mock-dom');

// Load content.js functions into sandbox
const contentJsCode = fs.readFileSync('extension/content.js', 'utf8');

const sandbox = {
  Node,
  location: { hostname: 'chatgpt.com', href: 'https://chatgpt.com/test' },
  document: {
    documentElement: { appendChild: () => {} },
    createElement: () => ({ addEventListener: () => {}, setAttribute: () => {} }),
    querySelectorAll: () => []
  },
  window: { getSelection: () => null },
  chrome: { runtime: { onMessage: { addListener: () => {} } } },
  clearTimeout: () => {},
  setTimeout: () => {}
};

vm.createContext(sandbox);
const { md, toMarkdown } = vm.runInContext(contentJsCode + '\n;({ md, toMarkdown });', sandbox);

const suite = {
  name: 'HTML to Markdown Converter (EP & BVA)',
  tests: []
};

function test(name, fn) {
  suite.tests.push({ name, fn });
}

/* ==================== TEST CASES ==================== */

// --- 1. Headings (Boundary Value Analysis: h1 - h6) ---
test('Headings: H1 boundary', () => {
  const dom = parseHTML('<h1>Chương 1: Mở đầu</h1>');
  const res = toMarkdown(dom);
  assert.strictEqual(res, '# Chương 1: Mở đầu');
});

test('Headings: H3 middle', () => {
  const dom = parseHTML('<h3>Tiểu mục 1.1</h3>');
  const res = toMarkdown(dom);
  assert.strictEqual(res, '### Tiểu mục 1.1');
});

test('Headings: H6 boundary', () => {
  const dom = parseHTML('<h6>Mục nhỏ nhất</h6>');
  const res = toMarkdown(dom);
  assert.strictEqual(res, '###### Mục nhỏ nhất');
});

test('Headings: Heading with nested inline styles', () => {
  const dom = parseHTML('<h2>Tiêu đề <strong>đậm</strong> và <em>nghiêng</em></h2>');
  const res = toMarkdown(dom);
  assert.strictEqual(res, '## Tiêu đề **đậm** và *nghiêng*');
});

// --- 2. Inline Styles & Equivalence Partitioning ---
test('Inline: Strong & Bold tags', () => {
  const dom1 = parseHTML('<p>Từ <strong>quan trọng</strong></p>');
  const dom2 = parseHTML('<p>Từ <b>quan trọng</b></p>');
  assert.strictEqual(toMarkdown(dom1), 'Từ **quan trọng**');
  assert.strictEqual(toMarkdown(dom2), 'Từ **quan trọng**');
});

test('Inline: Empty strong tag should not produce empty asterisks', () => {
  const dom = parseHTML('<p>Trước <strong></strong> sau</p>');
  assert.strictEqual(toMarkdown(dom), 'Trước  sau');
});

test('Inline: Italic & Em tags', () => {
  const dom = parseHTML('<p>Chữ <em>nghiêng</em> và <i>italic</i></p>');
  assert.strictEqual(toMarkdown(dom), 'Chữ *nghiêng* và *italic*');
});

test('Inline: Code tag (standalone)', () => {
  const dom = parseHTML('<p>Chạy lệnh <code>git status</code> để xem</p>');
  assert.strictEqual(toMarkdown(dom), 'Chạy lệnh `git status` để xem');
});

test('Inline: Links (Equivalence Partitioning: valid vs invalid scheme)', () => {
  const valid = parseHTML('<p><a href="https://example.com/doc">Tài liệu</a></p>');
  assert.strictEqual(toMarkdown(valid), '[Tài liệu](https://example.com/doc)');

  const invalidScheme = parseHTML('<p><a href="javascript:alert(1)">Bấm đây</a></p>');
  assert.strictEqual(toMarkdown(invalidScheme), 'Bấm đây'); // Không sinh Markdown link nguy hiểm
});

// --- 3. Pre & Code Blocks ---
test('Code Block: pre and pre > code', () => {
  const dom = parseHTML('<pre><code>const a = 1;\nconst b = 2;</code></pre>');
  const res = toMarkdown(dom);
  const fence = '`'.repeat(3);
  assert.strictEqual(res, `${fence}\nconst a = 1;\nconst b = 2;\n${fence}`);
});

// --- 4. Lists (Equivalence Partitioning: Unordered, Ordered, Nested) ---
test('Lists: Unordered list (UL)', () => {
  const dom = parseHTML('<ul><li>Mục A</li><li>Mục B</li></ul>');
  const res = toMarkdown(dom);
  assert.strictEqual(res, '- Mục A\n- Mục B');
});

test('Lists: Ordered list (OL) sequential numbering', () => {
  const dom = parseHTML('<ol><li>Bước 1</li><li>Bước 2</li><li>Bước 3</li></ol>');
  const res = toMarkdown(dom);
  assert.strictEqual(res, '1. Bước 1\n2. Bước 2\n3. Bước 3');
});

test('Lists: Nested lists (depth indentation)', () => {
  const dom = parseHTML('<ul><li>Cha 1<ul><li>Con 1.1</li><li>Con 1.2</li></ul></li><li>Cha 2</li></ul>');
  const res = toMarkdown(dom);
  assert.strictEqual(res, '- Cha 1\n  - Con 1.1\n  - Con 1.2\n- Cha 2');
});

// --- 5. Tables & Special Character Sanitization ---
test('Table: Header and rows with separator', () => {
  const dom = parseHTML('<table><tr><th>Tên</th><th>Điểm</th></tr><tr><td>An</td><td>10</td></tr></table>');
  const res = toMarkdown(dom);
  const expected = '| Tên | Điểm |\n| --- | --- |\n| An | 10 |';
  assert.strictEqual(res, expected);
});

test('Table: Pipe escaping inside cell', () => {
  const dom = parseHTML('<table><tr><th>Biểu thức</th></tr><tr><td>A | B</td></tr></table>');
  const res = toMarkdown(dom);
  // Pipe "|" trong cell phải được thay bằng "/" để không vỡ bảng Markdown
  assert.strictEqual(res, '| Biểu thức |\n| --- |\n| A / B |');
});

// --- 6. Blockquote & Line Breaks ---
test('Blockquote: Single and multiple lines', () => {
  const dom = parseHTML('<blockquote>Đây là trích dẫn</blockquote>');
  assert.strictEqual(toMarkdown(dom), '> Đây là trích dẫn');
});

test('Line break: hr and br', () => {
  const dom = parseHTML('<p>Dòng 1<br>Dòng 2</p><hr><p>Dòng 3</p>');
  const res = toMarkdown(dom);
  assert.strictEqual(res, 'Dòng 1\nDòng 2\n\n---\n\nDòng 3');
});

// --- 7. Ignored / Skipped Elements ---
test('Ignored Elements: Button, SVG, Script, Style should be removed', () => {
  const dom = parseHTML('<div><p>Nội dung chính</p><button>Copy</button><svg></svg><script>var x=1;</script></div>');
  const res = toMarkdown(dom);
  assert.strictEqual(res, 'Nội dung chính');
});

// --- 8. Whitespace Normalization (Boundary: > 2 consecutive newlines) ---
test('Whitespace: Multiple redundant newlines collapsed to maximum 2', () => {
  const dom = parseHTML('<p>Đoạn 1</p><p></p><p></p><p>Đoạn 2</p>');
  const res = toMarkdown(dom);
  assert.strictEqual(res, 'Đoạn 1\n\nĐoạn 2');
});

// --- 9. Real-World Fixture: NotebookLM Angular Web Component Hierarchy ---
test('NotebookLM: Angular custom elements, role heading, code formatting & lists', () => {
  const html = fs.readFileSync('tests/fixtures/notebooklm-sample.html', 'utf8');
  const dom = parseHTML(html);
  const res = toMarkdown(dom);

  // Không chứa "Thoughts"
  assert.strictEqual(res.includes('Thoughts'), false, 'Phải loại bỏ khối Thoughts');
  // Chứa heading 3 chuẩn Markdown
  assert.strictEqual(res.includes('### Các cải tiến cấu trúc chính:'), true, 'Phải nhận diện heading 3');
  // Chứa danh sách numbered list với số thứ tự
  assert.strictEqual(res.includes('1. **Chia nhóm rõ ràng:**'), true, 'Phải nhận diện numbered list item 1');
  assert.strictEqual(res.includes('2. **Mỗi loại một đoạn/mục riêng biệt:**'), true, 'Phải nhận diện numbered list item 2');
  // Chứa inline code
  assert.strictEqual(res.includes('`Cheat_Seat.md`'), true, 'Phải chuyển b.code thành inline code');
});

module.exports = suite;
