/**
 * Harness — กันไฟล์ source หลงที่ และกันโครงเก่ากลับมา (issue #11 · ปรับที่ #38)
 *
 * ปัญหาที่กันมาตั้งแต่ #11: ไฟล์ `.js` ที่วางไว้นอก path ที่ SDF deploy จริง เป็นสำเนา
 * ที่ไม่ถูกอัปขึ้นบัญชี และเคยทำให้ `README.md` สอนคนอัปโหลดชุดเก่าทับของที่รันอยู่ (#9)
 *
 * epic #37 แยกเป็นสองแอป — กฎเดิมยังต้องอยู่ แต่ต้องตรวจ **ทุกแอป** และเพิ่มสองข้อ
 *   · โครงเก่า (`src/` ที่รากของ repo) ห้ามกลับมา ไม่งั้นจะมีสองความจริงเรื่องว่า deploy อะไร
 *   · ไฟล์ของแอปหนึ่งห้ามไปโผล่ในโฟลเดอร์ของอีกแอป — สองแอปใช้โฟลเดอร์เดียวกันบนบัญชี
 *     ไฟล์ที่หลงข้ามฝั่งจะถูก deploy ทับกันโดยไม่มีใครเห็นใน dry-run ของแอปตัวเอง
 *
 * repo นี้ไม่มี CI ให้แขวน hook จึงทำเป็นเทส — `npm test` เป็นด่านเดียวที่ทุกคนวิ่งผ่าน
 */
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

const eq = H.makeEq({ json: true });

const ROOT = path.join(__dirname, '..');
const APPS_DIR = path.join(ROOT, 'apps');
const FC_SUB = path.join('src', 'FileCabinet', 'SuiteScripts', 'Foodstar', 'WO_Status_tracking');

// ── โครงเก่าห้ามกลับมา ──────────────────────────────────────────────────────
console.log('\n── โครงเก่าที่ราก repo ──');
eq('ไม่มี src/ ที่รากของ repo แล้ว', fs.existsSync(path.join(ROOT, 'src')), false);
eq('ไม่มี project.json ที่ราก (แต่ละแอปถือของตัวเอง)', fs.existsSync(path.join(ROOT, 'project.json')), false);
eq('ไม่มี suitecloud.config.js ที่ราก', fs.existsSync(path.join(ROOT, 'suitecloud.config.js')), false);

const apps = fs.readdirSync(APPS_DIR).sort()
  .filter((a) => fs.existsSync(path.join(APPS_DIR, a, FC_SUB)));
eq('เจอแอปครบสองตัว', apps.join(','), 'wo-cost-trace,wo-status');

// ── แต่ละแอป: ห้ามมี .js หลงนอก path ที่ deploy ─────────────────────────────
// ไฟล์ที่ราก `apps/<app>/src/` คือที่ที่สำเนาเคยไปโผล่ (ก่อน #9 มี 4 ไฟล์)
apps.forEach((app) => {
  const appSrc = path.join(APPS_DIR, app, 'src');
  const deployDir = path.join(APPS_DIR, app, FC_SUB);

  console.log('\n════ ' + app + ' ════');
  const rootJs = fs.readdirSync(appSrc).filter((f) => f.toLowerCase().endsWith('.js')).sort();
  if (rootJs.length) {
    console.log('     ไฟล์ที่ไม่ควรมี: ' + rootJs.join(', '));
    console.log('     source ที่ deploy จริงอยู่ที่ ' + path.join('apps', app, FC_SUB));
  }
  eq('ไม่มีไฟล์ .js ที่ราก src/ ของแอป', rootJs.join(','), '');

  const deployed = fs.readdirSync(deployDir).filter((f) => f.endsWith('.js')).sort();
  eq('มีไฟล์ .js ใน path ที่ deploy', deployed.length > 0, true);
  eq('มี WOReportTheme.js (ก๊อปของ shared/)', deployed.indexOf('WOReportTheme.js') >= 0, true);
});

// ── ไฟล์ห้ามหลงข้ามแอป ─────────────────────────────────────────────────────
// เจ้าของไฟล์อ่านจากชื่อ: WOCostTrace* เป็นของ wo-cost-trace · WOStatusTracking* เป็นของ wo-status
// WOReportTheme.js เป็นของทั้งสอง (ก๊อปจาก shared/) จึงไม่นับ
console.log('\n── ไฟล์ของแอปอื่นหลงเข้ามาไหม ──');
const OWNER = [
  { app: 'wo-cost-trace', re: /^WOCostTrace/ },
  { app: 'wo-status', re: /^WOStatusTracking/ }
];
apps.forEach((app) => {
  const deployDir = path.join(APPS_DIR, app, FC_SUB);
  const files = fs.readdirSync(deployDir).filter((f) => f.endsWith('.js') && f !== 'WOReportTheme.js');
  const strangers = files.filter((f) => {
    const owner = OWNER.filter((o) => o.re.test(f))[0];
    return !owner || owner.app !== app;
  });
  if (strangers.length) console.log('     ' + app + ' มีไฟล์ที่ไม่ใช่ของตัวเอง: ' + strangers.join(', '));
  eq(app + ' มีแต่ไฟล์ของตัวเอง', strangers.join(','), '');
});

// ── ต้นฉบับ theme ต้องอยู่ที่ shared/ ที่เดียว ───────────────────────────────
// ก๊อปในแอปสร้างด้วย `npm run sync:theme` (#39) — เทสที่ยันว่า byte ตรงกันอยู่ในก้อนนั้น
console.log('\n── ต้นฉบับ theme ──');
eq('shared/WOReportTheme.js มีอยู่', fs.existsSync(path.join(ROOT, 'shared/WOReportTheme.js')), true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
