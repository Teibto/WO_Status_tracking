/**
 * เทส — date field ของ WO Cost Trace ตาม references/date-field.md (#75)
 *
 * ล็อก 4 ชั้น:
 *   1. parse/format ตาม DATEFORMAT ของบัญชี + ISO · อ่านไม่ออก/วันไม่มีจริง → '' (ไม่เดา)
 *   2. markup ของทั้งสามฟอร์มเป็น .datewrap + ปุ่ม .datebtn · ไม่มี <input type="date"> ที่มองเห็น
 *   3. สคริปต์ที่ส่งออกมีปฏิทินของแอป (role=dialog, ผูก .datebtn, append body) ไม่มี showPicker
 *   4. คำสั่ง readFilters/readReadyParams แปลง dd/mm/yyyy → ISO ก่อนถึง SQL/ใช้จริง
 */
const fs = require('fs');
const path = require('path');
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ json: true });
const DIR = path.join(__dirname, '..', 'src', 'FileCabinet', 'SuiteScripts', 'Foodstar', 'WO_Status_tracking');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// ── 1. parse/format (โหลด Common ตรง ๆ) ─────────────────────────────────────
console.log('\n── parse/format วันที่ตาม DATEFORMAT ──');
const { module: C } = H.load({
  file: 'WOCostTrace_Common.js',
  dir: DIR,
  libs: ['WOReportTheme.js'],
  fixtures: FX.summary(),
  quietLog: true,
});

eq('DD/MM/YYYY 14/09/2026', C.parseDateInput('14/09/2026', 'DD/MM/YYYY'), '2026-09-14');
eq('MM/DD/YYYY 09/14/2026', C.parseDateInput('09/14/2026', 'MM/DD/YYYY'), '2026-09-14');
eq('MM/DD/YYYY 14/09/2026 → ไม่เดา', C.parseDateInput('14/09/2026', 'MM/DD/YYYY'), '');
eq('ISO ผ่านได้เสมอ', C.parseDateInput('2026-09-14', 'DD/MM/YYYY'), '2026-09-14');
eq('วันไม่มีจริง 31/02/2026 → ว่าง', C.parseDateInput('31/02/2026', 'DD/MM/YYYY'), '');
eq('ข้อความมั่ว → ว่าง', C.parseDateInput('abc', 'DD/MM/YYYY'), '');
eq('ช่องว่าง = ล้าง', C.parseDateInput('', 'DD/MM/YYYY'), '');
eq('fmtDateDisp ISO → dd/mm/yyyy', C.fmtDateDisp('2026-09-14', 'DD/MM/YYYY'), '14/09/2026');
eq('fmtDateDisp ตาม MM/DD/YYYY', C.fmtDateDisp('2026-09-14', 'MM/DD/YYYY'), '09/14/2026');
eq('dateFormat อ่าน preference ไม่ได้ → DD/MM/YYYY', C.dateFormat(), 'DD/MM/YYYY');

// ── 2. markup ───────────────────────────────────────────────────────────────
console.log('\n── markup: .datewrap + .datebtn ทุกช่อง ──');
const { T, libT } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['readFilters', 'renderSummaryForm', 'renderForm'],
  libExports: { 'WOCostTrace_Ready.js': ['renderReadyForm', 'readReadyParams'] },
});

const f = T.readFilters({ month: 'custom', from: '01/07/2026', to: '31/07/2026' });
f.subRows = [];
f.locRows = [];

const sumForm = T.renderSummaryForm(f);
eq('ภาพรวม: from เป็น dateinput แสดง 01/07/2026',
  /name="from" id="from" class="dateinput" value="01\/07\/2026"/.test(sumForm), true);
eq('ภาพรวม: to แสดง 31/07/2026',
  /name="to" id="to" class="dateinput" value="31\/07\/2026"/.test(sumForm), true);
eq('ภาพรวม: มีปุ่มปฏิทินของ from', /data-for="from"/.test(sumForm), true);
eq('ภาพรวม: มีปุ่มปฏิทินของ to', /data-for="to"/.test(sumForm), true);
eq('ภาพรวม: ไม่มี input type=date', /type="date"/.test(sumForm), false);

const drillForm = T.renderForm('WOFSC00000470', '2026-07-31', f);
eq('เจาะลึก: asof แสดง 31/07/2026 (จาก ISO)',
  /name="asof" id="asof" class="dateinput" value="31\/07\/2026"/.test(drillForm), true);
eq('เจาะลึก: ไม่มี input type=date', /type="date"/.test(drillForm), false);

const READY_RD = {
  woKey: '', date_iso: '2026-08-07', qty_from_wo: 0, params: { asOf: '2026-07-31' },
  stock_locs: [], locations: [],
};
const readyForm = libT['WOCostTrace_Ready.js'].renderReadyForm(READY_RD);
eq('ความพร้อม: rdate แสดง 31/07/2026',
  /name="rdate" id="rdate" class="dateinput" value="31\/07\/2026"/.test(readyForm), true);
eq('ความพร้อม: ไม่มี input type=date', /type="date"/.test(readyForm), false);

// ── 3. สคริปต์ปฏิทินของแอป ─────────────────────────────────────────────────
console.log('\n── สคริปต์ปฏิทิน (ไม่ใช่ showPicker) ──');
const script = C.renderDateFieldScript();
eq('มี role=dialog', /setAttribute\('role', 'dialog'\)/.test(script), true);
eq('ผูกกับ .datebtn', /querySelectorAll\('\.datebtn'\)/.test(script), true);
eq('ไม่มี showPicker', /showPicker/.test(script), false);
eq('คำนวณตำแหน่งด้วย documentElement.clientWidth (ไม่ใช่ innerWidth เป็นหลัก)',
  /documentElement && document\.documentElement\.clientWidth/.test(script), true);
eq('append ที่ body', /document\.body \|\| document\)\.appendChild/.test(script), true);

['WOCostTrace.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'].forEach((file) => {
  const src = read(file);
  eq(file + ': ไม่มี showPicker', /showPicker\s*\(/.test(src), false);
});

// ── 4. คำสั่งแปลง dd/mm/yyyy → ISO ก่อนใช้ ──────────────────────────────────
console.log('\n── readFilters / readReadyParams แปลงเป็น ISO ──');
const g = T.readFilters({ month: 'custom', from: '01/07/2026', to: '31/07/2026' });
eq('from dd/mm/yyyy → ISO', g.from, '2026-07-01');
eq('to dd/mm/yyyy → ISO', g.to, '2026-07-31');

const gIso = T.readFilters({ month: 'custom', from: '2026-07-01', to: '2026-07-31' });
eq('ลิงก์ ISO เดิมยังใช้ได้', gIso.from + '|' + gIso.to, '2026-07-01|2026-07-31');

const gBad = T.readFilters({ month: 'custom', from: '31/02/2026', to: '' });
eq('31/02/2026 ไม่ถูกเดาเป็น 03-03', gBad.from === '2026-03-03', false);

const rp = libT['WOCostTrace_Ready.js'].readReadyParams({ rdate: '31/07/2026' });
eq('rdate dd/mm/yyyy → ISO', rp.asOf, '2026-07-31');
const rpBad = libT['WOCostTrace_Ready.js'].readReadyParams({ rdate: '31/02/2026' });
eq('rdate วันไม่มีจริง → ว่าง (ไม่เดา)', rpBad.asOf, '');

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
