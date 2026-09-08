/**
 * เทส — ก๊อป theme ของทุกแอปต้องตรงกับ shared/WOReportTheme.js แบบ byte ต่อ byte (issue #39)
 *
 * โครง #37 ให้แต่ละแอปถือ `WOReportTheme.js` ของตัวเองเพื่อให้ deploy สองชุดเป็นอิสระ
 * ราคาที่จ่ายคือก๊อปอาจ drift — ด่านนี้คือสิ่งที่จ่ายคืน
 *
 * สองอาการที่ด่านนี้จับ
 *   1. แก้ `shared/` แล้วลืม `npm run sync:theme` → deploy ได้ style เก่า
 *   2. แก้ไฟล์ก๊อปในแอปด้วยมือ → รอบหน้าที่ใครรัน sync งานนั้นหายเงียบ ๆ
 *
 * ทั้งสองอาการหน้าตาเหมือนกันในสายตา git (ไฟล์ต่างกัน) แต่ทางแก้ตรงข้ามกัน จึงต้องบอกให้ชัด
 * ว่าให้ไปแก้ที่ไหน — ข้อความที่เทสพิมพ์คือส่วนสำคัญของด่านนี้ ไม่ใช่แค่สถานะ ok/fail
 */
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

const eq = H.makeEq({ json: true });

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'shared', 'WOReportTheme.js');

console.log('\n── ต้นฉบับ ──');
eq('มี shared/WOReportTheme.js', fs.existsSync(SOURCE), true);
const src = fs.readFileSync(SOURCE);
eq('ต้นฉบับไม่ว่าง', src.length > 0, true);

const apps = Object.keys(H.APP_DIRS).sort();
console.log('\n── ก๊อปของแต่ละแอปต้องตรงต้นฉบับ ──');
eq('มีแอปให้ตรวจ', apps.length > 0, true);

apps.forEach((app) => {
  const file = path.join(H.APP_DIRS[app], 'WOReportTheme.js');
  if (!fs.existsSync(file)) {
    console.log('     ' + app + ' ไม่มีไฟล์ theme — รัน `npm run sync:theme`');
    eq(app + ' มีไฟล์ theme', false, true);
    return;
  }
  const copy = fs.readFileSync(file);
  const same = copy.equals(src);
  if (!same) {
    console.log('     ' + app + ' ไม่ตรงต้นฉบับ (' + copy.length + ' bytes vs ' + src.length + ')');
    console.log('     ถ้าเพิ่งแก้ shared/ → รัน `npm run sync:theme` แล้ว commit ไฟล์ที่เปลี่ยน');
    console.log('     ถ้าเพิ่งแก้ไฟล์ในแอปนี้ด้วยมือ → ย้ายการแก้ไปที่ shared/WOReportTheme.js');
  }
  eq(app + ' ก๊อปตรงต้นฉบับทุก byte', same, true);
});

// ไฟล์ก๊อปต้องประกาศตัวเองว่าเป็นของ generate — คนที่เปิดไฟล์เจอก่อนจะได้ไม่แก้ผิดที่
// (ข้อความอยู่ในต้นฉบับ จึงติดไปกับก๊อปทุกใบโดยไม่ทำให้ byte ต่างกัน)
console.log('\n── ต้นฉบับต้องเตือนไม่ให้แก้ก๊อป ──');
const head = src.toString('utf8').slice(0, 1200);
eq('บอกว่าต้นฉบับอยู่ที่ shared/', head.indexOf('shared/WOReportTheme.js') > 0, true);
eq('บอกคำสั่งที่ต้องใช้', head.indexOf('sync:theme') > 0, true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
