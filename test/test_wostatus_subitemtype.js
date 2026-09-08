/**
 * เทส — ตัวกรอง Sub Item Type ของ WO Status Tracking (issue #27)
 *
 * `cseg_subitemtype` เป็น custom segment บน item · เทสนี้กันสามเรื่อง
 *
 *   1. **เงื่อนไขต้องลงไปถึง SQL จริง** ไม่ใช่แค่ dropdown สวย — อ่านจาก `H.calls`
 *      ว่า clause กับ param ไปถึง CP1 จริง และหายไปเมื่อไม่ได้เลือก
 *   2. **ค่าที่เลือกต้องไม่หลุดกลางทาง** — dropdown ซ้ำอยู่สองที่ (หน้ากรอง/หน้าผลลัพธ์)
 *      และค่าต้องติดไปกับลิงก์เปลี่ยนหน้า กับ URL ของ fragment ด้วย
 *   3. **รายการค่ามีสองทางมา** (ตาราง master กับค่าที่ item ใช้จริง) เพราะยังไม่ยืนยัน
 *      ชื่อตารางของ segment — ต้องพิสูจน์ว่าทางถอยทำงาน และพังทั้งสองทางแล้วหน้าไม่ล่ม
 */
const H = require('./_harness');

const eq = H.makeEq();

const SIT = [
  { id: '1', name: 'วัตถุดิบหลัก' },
  { id: '4', name: 'บรรจุภัณฑ์' },
  { id: '6', name: 'สูตรลับ' },
];

// จำนวนแถว WO ที่ CP1 จะคืน — เปลี่ยนได้ระหว่างซีนเพื่อบังคับให้มีหลายหน้า
let woRows = [];
// พฤติกรรมของสองทางที่ดึงรายการค่า — 'master' | 'item' | 'none'
let listSource = 'master';

function sqlRows(sql) {
  if (/customrecord_cseg_subitemtype/.test(sql)) {
    if (listSource === 'master') return SIT;
    if (listSource === 'item') throw new Error('Invalid or unsupported search (จำลอง)');
    throw new Error('Invalid or unsupported search (จำลอง)');
  }
  if (/BUILTIN\.DF\(cseg_subitemtype\)/.test(sql)) {
    if (listSource === 'item') return SIT;
    throw new Error('Invalid or unsupported search (จำลอง)');
  }
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

// ── รายการค่าใน dropdown ────────────────────────────────────────────────
console.log('\n── dropdown จากตาราง master ──');
listSource = 'master';
const form = run({});
eq('มีช่องเลือกประเภทย่อย', /<select name="subItemTypeId">/.test(form), true);
eq('มี label สองภาษาผูกไว้',   /data-i18n="fSit"/.test(form), true);
eq('มีตัวเลือก "ทุกประเภทย่อย"', /data-i18n-placeholder="allSit"/.test(form), true);
SIT.forEach((s) => eq('มีตัวเลือก ' + s.name, form.indexOf('value="' + s.id + '"') >= 0, true));

console.log('\n── ทางถอย: ตาราง master ใช้ไม่ได้ ──');
listSource = 'item';
H.calls.length = 0;
const formFb = run({});
eq('ยังได้ตัวเลือกครบ', SIT.every((s) => formFb.indexOf('value="' + s.id + '"') >= 0), true);
const fromItem = H.calls.filter((c) => /BUILTIN\.DF\(cseg_subitemtype\)/.test(c.sql));
eq('ยิงคำสั่งที่ดึงจาก item', fromItem.length, 1);
// กับดักที่จดไว้: BUILTIN.DF ในคำสั่งที่มี GROUP BY จะพัง — คำสั่งนี้ต้องไม่มี GROUP BY
eq('ไม่มี GROUP BY ในคำสั่งนั้น', /GROUP BY/i.test(fromItem[0].sql), false);

console.log('\n── พังทั้งสองทาง: หน้าต้องไม่ล่ม ──');
listSource = 'none';
const formNone = run({});
eq('หน้ายังขึ้น', formNone.indexOf('<select name="subItemTypeId">') >= 0, true);
eq('เหลือแต่ตัวเลือกรวม', (formNone.match(/<option value="/g) || []).length,
  (formNone.match(/<option value="" /g) || []).length);
listSource = 'master';

// ── เงื่อนไขต้องถึง SQL ─────────────────────────────────────────────────
console.log('\n── เลือกประเภทย่อยแล้วต้องกรองจริง ──');
H.calls.length = 0;
const picked = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026', subItemTypeId: '4' });
eq('CP1 มีเงื่อนไข cseg_subitemtype', /item\.cseg_subitemtype = \?/.test(cp1().sql), true);
eq('param เรียงตามลำดับที่ใส่ clause', JSON.stringify(cp1().params),
  '["2026-09-02","2026-09-08","4"]');
eq('หน้าผลลัพธ์คงค่าที่เลือกไว้', /<option value="4"\s+selected>/.test(picked), true);

console.log('\n── ไม่เลือก = ไม่มีเงื่อนไขนี้ ──');
H.calls.length = 0;
run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026' });
eq('CP1 ไม่มีเงื่อนไข cseg', /cseg_subitemtype/.test(cp1().sql), false);
eq('param มีแค่ช่วงวันที่', JSON.stringify(cp1().params), '["2026-09-02","2026-09-08"]');

console.log('\n── ใช้คู่กับตัวกรองอื่นได้ ──');
H.calls.length = 0;
run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026',
      locationId: '12', subsidiaryId: '2', subItemTypeId: '6' });
eq('param ครบทั้งห้าตัว', JSON.stringify(cp1().params),
  '["2026-09-02","2026-09-08","12","2","6"]');
eq('เงื่อนไขอยู่ครบทั้งสามชั้น',
  /tl_main\.location = \?/.test(cp1().sql)
  && /tl_main\.subsidiary = \?/.test(cp1().sql)
  && /item\.cseg_subitemtype = \?/.test(cp1().sql), true);

console.log('\n── ระบุ WO ตรง ๆ ยังใช้ร่วมกันได้ ──');
H.calls.length = 0;
run({ action: 'search', woNumber: 'WOFSC00000470', subItemTypeId: '4' });
eq('param = เลข WO + ประเภทย่อย', JSON.stringify(cp1().params), '["WOFSC00000470","4"]');

// ── ค่าต้องไม่หลุดตอนเปลี่ยนหน้า / ตอน AJAX ─────────────────────────────
console.log('\n── ชั้น fragment (AJAX) ──');
H.calls.length = 0;
run({ action: 'search', fragment: '1', dateFrom: '02/09/2026', dateTo: '08/09/2026', subItemTypeId: '4' });
eq('fragment ส่งเงื่อนไขไปด้วย', JSON.stringify(cp1().params), '["2026-09-02","2026-09-08","4"]');
eq('JS ฝั่ง client ใส่ค่าใน URL', /params\.set\('subItemTypeId'/.test(form), true);
eq('ปุ่มค้นหาอ่านค่าจากช่องเลือก', /\[name=subItemTypeId\]/.test(form), true);

console.log('\n── ลิงก์เปลี่ยนหน้าต้องพาค่าไปด้วย ──');
// ต้องมีมากกว่า 1 หน้า ลิงก์เปลี่ยนหน้าจึงจะถูก render (PAGE_SIZE = 100)
woRows = [];
for (let i = 0; i < 150; i++) {
  woRows.push({ woid: String(1000 + i), wo_number: 'WOFSC' + (1000 + i), item_id: '9',
                item_code: 'X', item_displayname: 'X', item_name: 'X', qty: 1,
                unit_name: 'KG', wo_date: '2026-09-02', location_id: '1',
                location_name: 'L', line_name: 'A', approval_status: '1',
                approval_status_name: 'Approved', back_order_qty: 0 });
}
const paged = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026', subItemTypeId: '4' });
eq('มีลิงก์เปลี่ยนหน้า', /[?&]page=2/.test(paged), true);
eq('ลิงก์พา subItemTypeId ไปด้วย', /subItemTypeId=4[^0-9]/.test(paged), true);
woRows = [];

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
