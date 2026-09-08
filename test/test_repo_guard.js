/**
 * Harness — กันไฟล์ source ซ้ำกลับเข้ามาใน repo (issue #11)
 *
 * ปัญหาที่กัน: `src/FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking/` คือ path เดียว
 * ที่ SDF deploy จริง · ไฟล์ `.js` ที่ราก `src/` เป็นสำเนาที่ไม่ถูก deploy และเคยทำให้
 * `README.md` สอนคนอัปโหลดชุดเก่าทับของที่รันอยู่ (ดู issue #9)
 *
 * repo นี้ไม่มี CI ให้แขวน hook จึงทำเป็นเทส — `npm test` กลายเป็นด่านเดียวที่ทุกคนวิ่งผ่าน
 *
 * issue #9 ลบ 4 ไฟล์สำเนาที่ราก `src/` ออกแล้ว (2026-09-08) `PENDING_REMOVAL` จึงว่าง
 * เทสนี้บังคับ**ศูนย์** — ไฟล์ `.js` ที่ราก `src/` โผล่มาอีกเมื่อไหร่เทสตกทันที
 */
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

const eq = H.makeEq({ json: true });

const SRC = path.join(__dirname, '../src');
const DEPLOY_DIR = path.join(SRC, 'FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking');

// ไฟล์ที่รู้ตัวว่ายังค้าง — issue #9 จะลบออกแล้วทำ list นี้ให้ว่าง
const PENDING_REMOVAL = [];   // issue #9 ลบครบแล้ว 2026-09-08 — ต่อจากนี้เทสนี้บังคับศูนย์

const rootJs = fs.readdirSync(SRC)
  .filter((f) => f.toLowerCase().endsWith('.js'))
  .sort();

console.log('\n── ไฟล์ .js ที่ราก src/ ──');
const unexpected = rootJs.filter((f) => PENDING_REMOVAL.indexOf(f) < 0);
if (unexpected.length) {
  console.log('     ไฟล์ที่ไม่ควรมี: ' + unexpected.join(', '));
  console.log('     source ที่ deploy จริงอยู่ที่ src/FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking/');
}
eq('ไม่มีไฟล์ .js ใหม่นอก list ที่รู้ตัว', unexpected.join(','), '');

const stillPending = PENDING_REMOVAL.filter((f) => rootJs.indexOf(f) >= 0);
// ratchet ต้องกินตัวเอง: ไฟล์ที่ถูกลบไปแล้วห้ามค้างใน list ไม่งั้น list จะกลายเป็นข้ออ้างถาวร
const staleEntries = PENDING_REMOVAL.filter((f) => rootJs.indexOf(f) < 0);
if (staleEntries.length) {
  console.log('     ลบไปแล้วแต่ยังค้างใน PENDING_REMOVAL: ' + staleEntries.join(', '));
}
eq('PENDING_REMOVAL ไม่มีรายการที่ลบไปแล้ว', staleEntries.join(','), '');
if (stillPending.length) {
  console.log('     ยังค้าง ' + stillPending.length + ' ไฟล์ (issue #9) — ลบแล้วให้ล้าง PENDING_REMOVAL ในไฟล์นี้');
} else {
  // เมื่อ issue #9 ลบครบแล้ว list ต้องถูกล้างด้วย ไม่งั้น ratchet จะค้างอยู่แบบไร้ความหมาย
  eq('PENDING_REMOVAL ถูกล้างแล้วเมื่อไม่มีไฟล์ค้าง', PENDING_REMOVAL.join(','), '');
}

console.log('\n── source ที่ deploy จริงต้องอยู่ครบ ──');
const deployed = fs.readdirSync(DEPLOY_DIR).filter((f) => f.endsWith('.js')).sort();
eq('มีไฟล์ .js ใน path ที่ deploy', deployed.length > 0, true);
eq('มี WOCostTrace.js', deployed.indexOf('WOCostTrace.js') >= 0, true);

// ทุกไฟล์ที่ราก src/ ที่ชื่อซ้ำกับใน path ที่ deploy = สำเนาที่อ่านผิดตัวได้
console.log('\n── ชื่อที่ซ้ำกันสองที่ (อ่านผิดตัวได้) ──');
const dupes = rootJs.filter((f) => deployed.indexOf(f) >= 0);
if (dupes.length) console.log('     ซ้ำ: ' + dupes.join(', '));
eq('จำนวนชื่อที่ซ้ำ = จำนวนที่ค้างอยู่ (ไม่มีของใหม่โผล่)', dupes.length, stillPending.length);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
