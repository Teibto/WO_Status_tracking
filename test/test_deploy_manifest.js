/**
 * เทส — `src/deploy.xml` ต้องระบุตรงตัวและครบ (issue #10)
 *
 * explicit list แลก "ลืมไม่ได้" มาด้วย "ต้องไม่ลืมเติม" · ถ้าไม่มีด่านนี้ ไฟล์ใหม่ที่ใครเพิ่ม
 * เข้าโฟลเดอร์จะไม่ขึ้นบัญชีโดยไม่มีใครรู้ตัว ซึ่งเป็นอาการที่หายากกว่า wildcard ยิงกว้างเกิน
 * (wildcard ยิงเกินยังเห็นใน dry-run · ไฟล์ที่ไม่ได้ยิงไม่โผล่ที่ไหนเลย)
 *
 * ที่ต้องมีในนี้ ไม่ใช่แค่ "นับให้ครบ"
 *   · dependency closure — entry ที่ require lib แต่ lib ไม่อยู่ใน list = Suitelet ตายทั้งตัว
 *   · <scriptfile> เทียบตัวพิมพ์ — Windows/macOS มองชื่อไฟล์ไม่สนตัวพิมพ์ แต่ File Cabinet สน
 */
const path = require('path');
const H = require('./_harness');
const P = require('../scripts/lib/sdf_payload');

const eq = H.makeEq({ json: true });
const SRC = path.join(__dirname, '../src');
const d = P.readDeployPaths(SRC);

console.log('\n── ไม่ใช้ wildcard ──');
if (d.wildcards.length) console.log('     ' + d.wildcards.join(' '));
eq('ไม่มี path ที่มี *', d.wildcards.join(' '), '');

console.log('\n── list ต้องตรงกับไฟล์ที่มีอยู่จริง ──');
const onDisk = P.listFileCabinetJs(SRC);
const listed = d.files.slice().sort();
const missing = onDisk.filter((f) => listed.indexOf(f) < 0);
const ghost = listed.filter((f) => onDisk.indexOf(f) < 0);
if (missing.length) console.log('     มีไฟล์จริงแต่ไม่อยู่ใน deploy.xml: ' + missing.join(' '));
if (ghost.length) console.log('     อยู่ใน deploy.xml แต่ไม่มีไฟล์จริง: ' + ghost.join(' '));
eq('ไม่มีไฟล์ที่ตกจาก list', missing.join(' '), '');
eq('ไม่มี path ที่ชี้ไฟล์ไม่มีจริง', ghost.join(' '), '');
eq('จำนวนไฟล์ที่ระบุ = จำนวนไฟล์ .js ที่มีจริง', d.files.length, onDisk.length);

console.log('\n── object ทุกใบต้องอยู่ใน list ──');
const objDisk = P.listObjectXml(SRC);
const objMissing = objDisk.filter((o) => d.objects.indexOf(o) < 0);
if (objMissing.length) console.log('     ตกจาก list: ' + objMissing.join(' '));
eq('ไม่มี object ที่ตกจาก list', objMissing.join(' '), '');
eq('จำนวน object ที่ระบุ = จำนวนไฟล์ xml ที่มีจริง', d.objects.length, objDisk.length);

console.log('\n── dependency closure (กัน MODULE_DOES_NOT_EXIST) ──');
const dep = P.dependencyClosureProblems(SRC, d.files);
dep.forEach((p) => console.log('     ' + p));
eq('ทุก dependency อยู่ใน deploy.xml', dep.join(' | '), '');

// ยันว่าตัวอ่าน dependency เห็นของจริง ไม่ใช่ผ่านเพราะอ่านไม่เจออะไรเลย
const fs = require('fs');
const entrySrc = fs.readFileSync(path.join(H.SRC_DIR, 'WOStatusTracking.js'), 'utf8');
const deps = P.amdRelativeDeps(entrySrc);
eq('อ่าน dependency ของ WOStatusTracking ได้ครบ 4 ตัว', deps.length, 4);
eq('เห็น WOReportTheme เป็น dependency', deps.indexOf('WOReportTheme') >= 0, true);

console.log('\n── <scriptfile> ของ object ชี้ไฟล์จริง (สนตัวพิมพ์) ──');
const sf = P.scriptFileProblems(SRC, d.objects);
sf.forEach((p) => console.log('     ' + p));
eq('scriptfile resolve ได้ทุกใบ', sf.join(' | '), '');

console.log('\n── กฎห้าม deploy production ต้องยังอยู่ ──');
const deployXml = fs.readFileSync(path.join(SRC, 'deploy.xml'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
eq('deploy.xml เขียนกฎกำกับไว้', deployXml.indexOf('ห้าม deploy production จาก repo') > 0, true);
eq('README เขียนกฎเดียวกัน', readme.indexOf('ห้าม deploy production จาก repo') > 0, true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
