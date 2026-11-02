/**
 * Master Test Runner for AI-to-Google-Docs
 * Executes Regression & System Test Suites with detailed statistics
 */

const suite1 = require('./test-md-converter');
const suite2 = require('./test-code-gs');
const suite3 = require('./test-security-and-rules');

const suites = [suite1, suite2, suite3];

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;
const failures = [];

const startTime = Date.now();

console.log('===========================================================');
console.log('   BẮT ĐẦU CHẠY KIỂM THỬ HỆ THỐNG (REGRESSION & UNIT TEST)  ');
console.log('===========================================================\n');

for (const suite of suites) {
  console.log(`[SUITE] ${suite.name}`);
  let suitePass = 0;

  for (const t of suite.tests) {
    totalTests++;
    try {
      t.fn();
      suitePass++;
      totalPassed++;
      console.log(`  ✓ [PASS] ${t.name}`);
    } catch (err) {
      totalFailed++;
      failures.push({ suite: suite.name, test: t.name, error: err.message });
      console.log(`  ✗ [FAIL] ${t.name} -> ${err.message}`);
    }
  }
  console.log(`  => Kết quả suite: ${suitePass}/${suite.tests.length} passed.\n`);
}

const duration = Date.now() - startTime;

console.log('===========================================================');
console.log('                   BÁO CÁO TỔNG HỢP KIỂM THỬ                ');
console.log('===========================================================');
console.log(`Tổng số ca kiểm thử (Test cases): ${totalTests}`);
console.log(`Thành công (Passed)             : ${totalPassed}`);
console.log(`Thất bại (Failed)               : ${totalFailed}`);
console.log(`Tỷ lệ thành công (Pass rate)    : ${((totalPassed / totalTests) * 100).toFixed(2)}%`);
console.log(`Thời gian thực thi              : ${duration} ms`);
console.log('===========================================================');

if (totalFailed > 0) {
  console.log('\nDANH SÁCH LỖI:');
  failures.forEach((f, i) => {
    console.log(`${i + 1}. [${f.suite}] ${f.test}: ${f.error}`);
  });
  process.exit(1);
} else {
  console.log('\n✓ TẤT CẢ CÁC BỘ KIỂM THỬ ĐÃ VƯỢT QUA XUẤT SẮC!');
  process.exit(0);
}

