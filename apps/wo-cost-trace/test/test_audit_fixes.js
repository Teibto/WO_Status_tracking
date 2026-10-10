/**
 * เทส — ชุดแก้จากการ audit ของ WO Cost Trace
 *
 *   1. โหมด embed ต้องติดไปกับทุกลิงก์ภายใน (selfUrl) — เดิมหลุดทุกครั้งที่กดลิงก์
 *   2. lot ในตารางวัตถุดิบต้อง escape (stored XSS) และแถวรวมต้องจัดคอลัมน์ถูกเมื่อไม่มี lot
 *   3. ทุกคำสั่งที่ JOIN transactionaccountingline ต้องกรอง posting/accountingbook
 *      ตาม invariant ที่ประกาศไว้ใน WOCostTrace_Common.js
 *
 * ข้อ 2-3 เป็น source guard เพราะการ render ตารางวัตถุดิบต้องป้อน fixture drilldown 19 คำสั่ง
 * ซึ่งไม่คุ้มกับจุดที่แก้ — ล็อกบรรทัดที่ห้ามถอยกลับ พร้อมพิสูจน์ว่าแดงได้ (ลบ esc → ตก)
 */
const fs = require('fs');
const path = require('path');
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ json: true });
const DIR = path.join(__dirname, '..', 'src', 'FileCabinet', 'SuiteScripts', 'Foodstar', 'WO_Status_tracking');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// ═══ 1. embed ติดไปกับ selfUrl (พฤติกรรมจริง) ═══════════════════════════════
console.log('\n── selfUrl พา embed ติดไปด้วย ──');
const { module: C } = H.load({
  file: 'WOCostTrace_Common.js',
  dir: DIR,
  libs: ['WOReportTheme.js'],
  fixtures: FX.summary(),
  quietLog: true,
});
C.setEmbed(true);
eq('เปิด embed → ลิงก์เจาะลึกมี &embed=1', /[?&]embed=1/.test(C.selfUrl({ wo: 'WOFSC00000470' })), true);
eq('เปิด embed → ลิงก์กลับภาพรวมมี embed', /[?&]embed=1/.test(C.selfUrl({})), true);
C.setEmbed(false);
eq('ไม่เปิด embed → ลิงก์ไม่มี embed', /embed=1/.test(C.selfUrl({ wo: 'X' })), false);

// ═══ 2. lot ต้อง escape + แถวรวมจัดคอลัมน์ถูก ═══════════════════════════════
console.log('\n── ตารางวัตถุดิบ (source guard) ──');
const trace = read('WOCostTrace.js');
eq('lot รวมถูก escape ก่อนต่อ HTML',
  /uniq\(r\.lots\.map\(l => esc\(/.test(trace), true);
eq('แถวรวมใช้ colspan ป้าย 7 คงที่ (มี/ไม่มี lot ตรงกันทั้งคู่)',
  /colspan="7">รวมมูลค่าวัตถุดิบที่เบิก/.test(trace)
  && /colspan="7">÷ ผลิตได้/.test(trace), true);
eq('ท้ายแถวรวมเว้น 2 เมื่อมี lot / 1 เมื่อไม่มี',
  /<td colspan="\$\{showLots \? 2 : 1\}"><\/td><\/tr>/.test(trace), true);

// ═══ 3. TAL ต้องกรอง posting = 'T' และ accountingbook = 1 ทุกคำสั่ง ═════════
console.log('\n── ทุก JOIN transactionaccountingline ต้องกรอง posting/book ──');
const talMark = 'JOIN transactionaccountingline TAL';
const joins = [];
for (let at = trace.indexOf(talMark); at >= 0; at = trace.indexOf(talMark, at + 1)) {
  joins.push(trace.substring(at, at + 300));
}
eq('มี JOIN transactionaccountingline ให้ตรวจ', joins.length >= 4, true);
joins.forEach((j, i) => {
  eq('JOIN TAL ที่ ' + (i + 1) + ' มี posting/accountingbook',
    /TAL\.posting = 'T'/.test(j) && /TAL\.accountingbook = 1/.test(j), true);
});

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
