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

  const akfRegex = /AKfycb[a-zA-Z0-9_-]{20,}/g;
  const tokenRegex = /token\s*[:=]\s*['"][a-zA-Z0-9_-]{32,}['"]/g;

  for (const file of filesToScan) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    assert(!akfRegex.test(content), `Phát hiện hardcode Apps Script Deployment ID trong ${file}`);
    assert(!tokenRegex.test(content), `Phát hiện hardcode Secret Token trong ${file}`);
  }
});

// --- 3. Rules & Code Constraints ---
test('Rule 6: No literal triple backticks in Code.gs or content.js', () => {
  const codeGs = fs.readFileSync('apps-script/Code.gs', 'utf8');
  assert(!codeGs.includes('```'), 'Code.gs không được chứa ký tự 3 dấu backtick trực tiếp (phải dùng FENCE hoặc regex)');

  const contentJs = fs.readFileSync('extension/content.js', 'utf8');
  assert(!contentJs.includes('```'), 'content.js không được chứa 3 dấu backtick trực tiếp');
});

test('CORS Constraint: background.js uses Content-Type: text/plain;charset=utf-8', () => {
  const bg = fs.readFileSync('extension/background.js', 'utf8');
  assert(bg.includes("'Content-Type': 'text/plain;charset=utf-8'"), 'background.js bắt buộc dùng text/plain để tránh CORS preflight');
});

test('CSP Constraint: content.js does not contain fetch to Apps Script', () => {
  const content = fs.readFileSync('extension/content.js', 'utf8');
  assert(!content.includes('fetch('), 'content.js không được tự ý gọi fetch (vi phạm CSP của AI sites)');
});

module.exports = suite;
