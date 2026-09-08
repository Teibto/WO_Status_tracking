/**
 * sync-theme — ก๊อป shared/WOReportTheme.js ลงเป็นไฟล์ของแต่ละแอป (issue #39)
 *
 * ทำไมต้องก๊อป ไม่ใช่ให้ทั้งสองแอปชี้ไฟล์เดียวบนบัญชี:
 * epic #37 ต้องการให้ deploy สองชุดเป็นอิสระจริง · ถ้า theme เป็นไฟล์เดียวที่ทั้งสองแอป
 * `define` ถึง มันจะกลายเป็น deploy artifact ที่ต้องมีเจ้าของคนเดียว แล้วการอัป theme
 * ก็ลาก lifecycle ของอีกแอปมาด้วยทุกครั้ง · ก๊อปแล้วแต่ละแอปถือของตัวเอง แต่ยังแก้ที่เดียว
 *
 * ราคาที่จ่ายคือ "ก๊อปอาจไม่ตรงต้นฉบับ" — จ่ายด้วย test/test_theme_sync.js ที่ล้มทันที
 * ถ้าไม่ตรง (npm test เป็นด่านเดียวที่ทุกคนวิ่งผ่าน repo นี้ไม่มี CI)
 *
 * ใช้: npm run sync:theme
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(__dirname, 'WOReportTheme.js');
const APPS_DIR = path.join(ROOT, 'apps');
const FC_SUB = path.join('src', 'FileCabinet', 'SuiteScripts', 'Foodstar', 'WO_Status_tracking');

if (!fs.existsSync(SOURCE)) {
  console.error('ไม่พบต้นฉบับ ' + SOURCE);
  process.exit(1);
}

const src = fs.readFileSync(SOURCE);
const targets = fs.readdirSync(APPS_DIR).sort()
  .map((app) => ({ app: app, file: path.join(APPS_DIR, app, FC_SUB, 'WOReportTheme.js') }))
  .filter((t) => fs.existsSync(path.dirname(t.file)));

if (!targets.length) {
  console.error('ไม่พบโฟลเดอร์ source ของแอปไหนเลยใต้ ' + APPS_DIR);
  process.exit(1);
}

console.log('ต้นฉบับ: shared/WOReportTheme.js (' + src.length + ' bytes)');
let changed = 0;
targets.forEach((t) => {
  const had = fs.existsSync(t.file) ? fs.readFileSync(t.file) : null;
  if (had && had.equals(src)) {
    console.log('  = ' + t.app + ' ตรงอยู่แล้ว');
    return;
  }
  fs.writeFileSync(t.file, src);
  changed++;
  console.log('  → ' + t.app + (had ? ' อัปเดตแล้ว' : ' สร้างใหม่'));
});

console.log(changed
  ? 'ก๊อปแล้ว ' + changed + ' แอป — commit ไฟล์ที่เปลี่ยนไปด้วย ไม่งั้น deploy ได้ style เก่า'
  : 'ไม่มีอะไรต้องก๊อป');
