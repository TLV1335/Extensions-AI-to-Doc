/**
 * Security, Compliance & Rules Testing (Skill 7: security-review + Project Constraints)
 */

const assert = require('assert');
const fs = require('fs');

const suite = {
  name: 'Security, Boundary & Constraint Compliance (Skill 7)',
  tests: []
};

function test(name, fn) {
  suite.tests.push({ name, fn });
}

/* ==================== TEST CASES ==================== */

// --- 1. Manifest V3 Permission Audit (Principle of Least Privilege) ---
test('Manifest: Strictly limited to storage permission', () => {
  const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3);
  assert.deepStrictEqual(manifest.permissions, ['storage'], 'Không được thêm permission thừa vào manifest');

  const forbiddenPermissions = ['tabs', 'activeTab', '<all_urls>', 'identity', 'cookies', 'webRequest'];
  for (const p of forbiddenPermissions) {
    assert.strictEqual(manifest.permissions.includes(p), false, `Phát hiện quyền bị cấm: ${p}`);
  }
});

test('Manifest: Host permissions restricted strictly to Google Script', () => {
  const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
  const allowed = [
    'https://script.google.com/*',
    'https://script.googleusercontent.com/*'
  ];
  assert.deepStrictEqual(manifest.host_permissions, allowed);
});

// --- 2. Secret Leak Scanning ---
test('Security Audit: No hardcoded deployment IDs or real token values', () => {
  const filesToScan = [
    'apps-script/Code.gs',
    'extension/manifest.json',
    'extension/background.js',
    'extension/content.js',
    'extension/options.js',
    'extension/options.html'
  ];

  for (const file of filesToScan) {
    const content = fs.readFileSync(file, 'utf8');
    // Kiểm tra deployment ID thực dạng AKfycb...
    assert.strictEqual(/AKfycb[A-Za-z0-9_-]{20,}/.test(content), false, `Rò rỉ deployment ID trong ${file}`);
    // Kiểm tra link deployment thực
    assert.strictEqual(/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec/.test(content), false, `Rò rỉ Web App URL thực trong ${file}`);
  }
});

// --- 3. Rule 6: No literal triple backticks in source code ---
test('Rule 6: No literal triple backticks in Code.gs or content.js', () => {
  const bt3 = String.fromCharCode(96).repeat(3);
  const codeGs = fs.readFileSync('apps-script/Code.gs', 'utf8');
  const contentJs = fs.readFileSync('extension/content.js', 'utf8');

  assert.strictEqual(codeGs.includes(bt3), false, 'Phát hiện literal triple backtick trong apps-script/Code.gs');
  assert.strictEqual(contentJs.includes(bt3), false, 'Phát hiện literal triple backtick trong extension/content.js');
});

// --- 4. CORS & CSP Rule Check ---
test('CORS Constraint: background.js uses Content-Type: text/plain;charset=utf-8', () => {
  const bg = fs.readFileSync('extension/background.js', 'utf8');
  assert.strictEqual(
    bg.includes("'Content-Type': 'text/plain;charset=utf-8'"),
    true,
    'background.js bắt buộc dùng text/plain để tránh preflight CORS'
  );
});

test('CSP Constraint: content.js does not contain fetch to Apps Script', () => {
  const content = fs.readFileSync('extension/content.js', 'utf8');
  assert.strictEqual(
    content.includes('fetch('),
    false,
    'content.js không được gọi fetch trực tiếp (phải thông qua background.js để tránh CSP của site AI)'
  );
});

module.exports = suite;

