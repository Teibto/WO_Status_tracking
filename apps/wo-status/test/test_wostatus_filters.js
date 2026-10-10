/**
 * เทส — ตัวกรองชุดใหม่ของ WO Status Tracking (issue #90)
 *
 * ผู้ใช้สั่ง 2026-10-10: เรียง Subsidiary · Date from–to · Location · WO/Batch/Order Sheet
 * เพิ่ม Production Line กับ Item code และลบ Sub Item Type (#27) ทิ้ง · เทสนี้แทน
 * test_wostatus_subitemtype.js และกันสี่เรื่อง
 *
 *   1. **ลำดับช่องในฟอร์ม** ตามที่ผู้ใช้สั่ง และไม่มีอะไรของ Sub Item Type เหลือ
 *   2. **เงื่อนไขต้องลงไปถึง SQL จริง** — อ่านจาก `H.calls` ว่า clause กับ param ไปถึง CP1
 *      และหายไปเมื่อไม่ได้กรอก
 *   3. **ค่าที่เลือกต้องไม่หลุดกลางทาง** — หน้าผลลัพธ์, fragment (AJAX) และลิงก์เปลี่ยนหน้า
 *   4. **รายการไลน์ผลิตพังแล้วหน้าไม่ล่ม** — dropdown เหลือแค่ "ทุกไลน์"
 */
const H = require('../../../test/lib/_harness');

const eq = H.makeEq();

const LINES = [
  { id: '3', name: 'Line1' },
  { id: '5', name: 'Line5' },
  { id: '18', name: 'Line18' },
];

let woRows = [];
let linesFail = false;

// subsidiaryId='2' ต้องอยู่ใน allow-list ถึงจะไหลไปถึง CP1 (ด่านสิทธิ์ #47 มีเทสของตัวเอง)
const SUBS = [{ id: '2', name: 'Foodstar Co., Ltd.' }];

function sqlRows(sql) {
  if (/FROM customrecord_mfg_productionline pl/.test(sql)) {
    if (linesFail) throw new Error('Invalid or unsupported search (จำลอง)');
    return LINES;
  }
  if (/FROM subsidiary/i.test(sql)) return SUBS;
  if (/t\.type\s*=\s*'WorkOrd'/.test(sql)) return woRows;
  return [];
}

const { module: mod } = H.load({
  file: 'WOStatusTracking.js',
  libs: [
    'WOReportTheme.js',
    'WOStatusTracking_Labels.js',
    'WOStatusTracking_Queries.js',
    'WOStatusTracking_Drilldown.js',
  ],
  requireRunSQL: false,
  sqlRows,
  quietLog: true,
});

function run(params) {
  const chunks = [];
  mod.onRequest({
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: () => {} },
  });
  return chunks.join('');
}

/** SQL ของ CP1 รอบล่าสุด (คำสั่งที่เป็นรายการ WO ตัวจริง) */
function cp1() {
  const hits = H.calls.filter((c) => /t\.type\s*=\s*'WorkOrd'/.test(c.sql));
  return hits.length ? hits[hits.length - 1] : null;
}

// ── 1. ลำดับช่องและสิ่งที่ถูกลบ ─────────────────────────────────────────
console.log('\n── ลำดับช่องในฟอร์ม ──');
const form = run({});
const bar = (form.match(/<div class="filterbar">[\s\S]*?id="btnSearch"/) || [''])[0];
const order = [
  ['Subsidiary', 'name="subsidiaryId"'],
  ['Date from', 'id="dateFrom"'],
  ['Date to', 'id="dateTo"'],
  ['Location', 'name="locationId"'],
  ['WO / Batch / Order Sheet', 'id="entityFilter"'],
  ['Production Line', 'name="lineId"'],
  ['Item code', 'id="itemCode"'],
  ['ปุ่มค้นหา', 'id="btnSearch"'],
];
const pos = order.map(([, marker]) => bar.indexOf(marker));
eq('เจอทุกช่องในแถบตัวกรอง', pos.every((p) => p >= 0), true);
eq('เรียง ' + order.map((o) => o[0]).join(' → '),
  pos.every((p, i) => i === 0 || p > pos[i - 1]), true);
eq('ไม่มี Sub Item Type เหลือในหน้า', /subItemTypeId|data-i18n="fSit"|allSit/.test(form), false);
eq('Production Line มี label สองภาษา', /data-i18n="fLine"/.test(bar) && /data-i18n-placeholder="allLine"/.test(bar), true);
eq('Item code มี label + placeholder สองภาษา', /data-i18n="fItem"/.test(bar) && /data-i18n-placeholder="phItem"/.test(bar), true);
LINES.forEach((l) => eq('มีตัวเลือก ' + l.name, form.indexOf('value="' + l.id + '"') >= 0, true));
eq('Production Line เป็น combobox ค้นหาได้', /\['subsidiaryId', 'locationId', 'lineId'\]\.forEach/.test(form), true);
eq('Enter ในช่อง Item code ค้นหา', /\['dateFrom', 'dateTo', 'itemCode'\]\.forEach/.test(form), true);

console.log('\n── รายการไลน์ผลิตพัง: หน้าต้องไม่ล่ม ──');
linesFail = true;
const formNone = run({});
const lineSelect = (formNone.match(/<select name="lineId">[\s\S]*?<\/select>/) || [''])[0];
eq('หน้ายังขึ้นพร้อมช่องไลน์ผลิต', lineSelect !== '', true);
eq('เหลือแต่ตัวเลือก "ทุกไลน์"', (lineSelect.match(/<option value="/g) || []).length, 1);
linesFail = false;

// ── 2. เงื่อนไขต้องถึง SQL ──────────────────────────────────────────────
console.log('\n── Production Line ──');
H.calls.length = 0;
const picked = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026', lineId: '5' });
eq('CP1 มีเงื่อนไขไลน์ผลิตบนหัว WO', /t\.custbody_mfg_production_line = \?/.test(cp1().sql), true);
eq('param = ช่วงวันที่ + ไลน์', JSON.stringify(cp1().params), '["2026-09-02","2026-09-08","5"]');
eq('หน้าผลลัพธ์คงไลน์ที่เลือกไว้', /<option value="5"\s+selected>/.test(picked), true);

console.log('\n── Item code: ค้นบางส่วนทั้งรหัสและชื่อ ไม่สนตัวพิมพ์ ──');
H.calls.length = 0;
const typed = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026', itemCode: '  1001ab ' });
eq('CP1 ค้นทั้ง itemid และ displayname',
  /\(UPPER\(item\.itemid\) LIKE \? OR UPPER\(item\.displayname\) LIKE \?\)/.test(cp1().sql), true);
eq('param เป็น %ตัวใหญ่% สองตัว และตัดช่องว่าง', JSON.stringify(cp1().params),
  '["2026-09-02","2026-09-08","%1001AB%","%1001AB%"]');
eq('หน้าผลลัพธ์คงคำที่พิมพ์ไว้', /id="itemCode" value="1001ab"/.test(typed), true);

console.log('\n── ไม่กรอก = ไม่มีเงื่อนไข ──');
H.calls.length = 0;
run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026' });
eq('CP1 ไม่มีเงื่อนไขไลน์/สินค้า', /custbody_mfg_production_line = \?|item\.itemid\) LIKE/.test(cp1().sql), false);
eq('param มีแค่ช่วงวันที่', JSON.stringify(cp1().params), '["2026-09-02","2026-09-08"]');
eq('CP1 ไม่มี cseg_subitemtype', /cseg_subitemtype/.test(cp1().sql), false);

console.log('\n── ใช้คู่กับตัวกรองอื่นได้ ──');
H.calls.length = 0;
run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026',
      locationId: '12', subsidiaryId: '2', lineId: '18', itemCode: 'juice' });
eq('param ครบตามลำดับ clause', JSON.stringify(cp1().params),
  '["2026-09-02","2026-09-08","12","2","18","%JUICE%","%JUICE%"]');

console.log('\n── ระบุ WO ตรง ๆ ยังใช้ร่วมกันได้ ──');
H.calls.length = 0;
run({ action: 'search', woNumber: 'WOFSC00000470', lineId: '3' });
eq('param = เลข WO + ไลน์', JSON.stringify(cp1().params), '["WOFSC00000470","3"]');

// ── 3. ค่าต้องไม่หลุดตอน AJAX / เปลี่ยนหน้า ─────────────────────────────
console.log('\n── ชั้น fragment (AJAX) ──');
H.calls.length = 0;
run({ action: 'search', fragment: '1', dateFrom: '02/09/2026', dateTo: '08/09/2026', lineId: '5', itemCode: 'x' });
eq('fragment ส่งเงื่อนไขไปด้วย', JSON.stringify(cp1().params), '["2026-09-02","2026-09-08","5","%X%","%X%"]');
eq('JS ฝั่ง client ใส่ lineId / itemCode ใน URL',
  /params\.set\('lineId'/.test(form) && /params\.set\('itemCode'/.test(form), true);
eq('ปุ่มค้นหาอ่านค่าจากทั้งสองช่อง',
  /\[name=lineId\]/.test(form) && /getElementById\('itemCode'\)/.test(form), true);

console.log('\n── ลิงก์เปลี่ยนหน้าต้องพาค่าไปด้วย ──');
woRows = [];
for (let i = 0; i < 150; i++) {
  woRows.push({ woid: String(1000 + i), wo_number: 'WOFSC' + (1000 + i), item_id: '9',
                item_code: 'X', item_displayname: 'X', item_name: 'X', qty: 1,
                unit_name: 'KG', wo_date: '2026-09-02', location_id: '1',
                location_name: 'L', line_name: 'A', approval_status: '1',
                approval_status_name: 'Approved', back_order_qty: 0 });
}
const paged = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026', lineId: '5', itemCode: 'ab' });
eq('มีลิงก์เปลี่ยนหน้า', /[?&]page=2/.test(paged), true);
eq('ลิงก์พา lineId และ itemCode ไปด้วย', /lineId=5[^0-9]/.test(paged) && /itemCode=ab/.test(paged), true);
woRows = [];

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
