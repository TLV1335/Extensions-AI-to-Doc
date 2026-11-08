const assert = require('assert');
const GDocsCompiler = require('../extension/gdocs-compiler.js');

const suite = {
  name: 'Google Docs REST API Compiler (Markdown -> batchUpdate requests)',
  tests: []
};

function test(name, fn) {
  suite.tests.push({ name, fn });
}

// Test 1: Bóc tách inline styles
test('parseInline: Bold, Italic, Code and Link', () => {
  const text = 'Đoạn này có **in đậm**, *nghiêng*, `mã code` và [Google](https://google.com).';
  const { plain, styles } = GDocsCompiler.parseInline(text);

  assert.strictEqual(plain, 'Đoạn này có in đậm, nghiêng, mã code và Google.');
  assert.strictEqual(styles.length, 4);
  assert.strictEqual(styles[0].type, 'bold');
  assert.strictEqual(styles[1].type, 'italic');
  assert.strictEqual(styles[2].type, 'code');
  assert.strictEqual(styles[3].type, 'link');
  assert.strictEqual(styles[3].url, 'https://google.com');
});

// Test 2: Phân tích các khối Markdown sang blocks
test('parseMarkdownToBlocks: Headings, Lists, Quotes, CodeBlocks and Tables', () => {
  const md = [
    '# Tiêu đề 1',
    '## Tiêu đề 2',
    '- Mục danh sách 1',
    '1. Số thứ tự 1',
    '> Trích dẫn',
    '```javascript',
    'console.log("hello");',
    '```',
    '| Cột 1 | Cột 2 |',
    '|---|---|',
    '| A | B |'
  ].join('\n');

  const blocks = GDocsCompiler.parseMarkdownToBlocks(md);
  assert.strictEqual(blocks[0].type, 'heading');
  assert.strictEqual(blocks[0].level, 1);
  assert.strictEqual(blocks[1].type, 'heading');
  assert.strictEqual(blocks[1].level, 2);
  assert.strictEqual(blocks[2].type, 'bullet');
  assert.strictEqual(blocks[3].type, 'number');
  assert.strictEqual(blocks[4].type, 'quote');
  assert.strictEqual(blocks[5].type, 'code_block');
  assert.strictEqual(blocks[6].type, 'table');
});

// Test 3: Biên dịch toàn bộ sang requests batchUpdate
test('compile: Generates valid batchUpdate requests for Google Docs API', () => {
  const md = [
    '# Giới thiệu',
    'Nội dung có **chữ đậm** và `code`.',
    '- Ý chính 1',
    '- Ý chính 2'
  ].join('\n');

  const { fullText, requests } = GDocsCompiler.compile(md, 100, true);
  assert(fullText.length > 0);
  assert(requests.length > 0);

  // Phải có insertText đầu tiên
  assert(requests[0].insertText);
  assert.strictEqual(requests[0].insertText.location.index, 100);

  // Phải có updateTextStyle reset ban đầu
  assert(requests[1].updateTextStyle);

  // Phải có lệnh updateParagraphStyle cho heading
  const headingReq = requests.find(r => r.updateParagraphStyle && r.updateParagraphStyle.paragraphStyle.namedStyleType === 'HEADING_1');
  assert(headingReq, 'Phải có request tạo HEADING_1');

  // Phải có lệnh createParagraphBullets cho list
  const bulletReq = requests.find(r => r.createParagraphBullets);
  assert(bulletReq, 'Phải có request tạo danh sách bullet');
});

module.exports = suite;
