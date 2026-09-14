/**
 * เทส — #47: id นอกสิทธิ์ที่ยัดผ่าน URL ต้องไม่หายเงียบ + loader ห้าม fail-open เงียบ
 *
 * ยึดผล spike ของ #47 (2026-09-14, SB1, role `FS - Manufacturing Costing (User Sub)`):
 *   • subsidiary เป็นด่านสิทธิ์จริง — NetSuite บีบ `SELECT id, name FROM subsidiary` ให้แคบลง
 *     เองตาม role ที่กำลังรัน (ยืนยันแล้ว 5→2 ตัวเลือกบน SB1) แถวที่คืนมาจึงเป็น allow-list
 *     ที่เชื่อถือได้ — id นอกลิสต์ต้องถูก "บีบกลับ" ก่อนถึง query จริงเสมอ (ไม่ใช่แค่ dropdown
 *     แสดงผิด แบบที่ #50 แก้ให้ WO Cost Trace — อันนั้นเป็นเรื่องความสะดวก ไม่ใช่ด่านสิทธิ์)
 *   • location ยังไม่พิสูจน์ว่าเป็นด่านสิทธิ์ (role ที่ทดสอบไม่มี location restriction ตั้งไว้เลย
 *     และ role record ไม่มีช่อง accessible locations แบบที่ subsidiary มี) จึงยังคงพฤติกรรม
 *     แบบ #50 ไว้ (เก็บค่าดิบไว้แสดง+เตือน ไม่บีบ) — ห้ามเดาเพิ่มจนกว่าจะมี role พิสูจน์จริง
 *
 * ล็อกสามเรื่อง
 *   1. subsidiaryId นอกลิสต์ → ค่าที่ถึง CP1 (SQL จริง) ถูกบีบเป็น "" เสมอ ทั้งทาง renderResults
 *      (full page) และ renderFragment (ทางที่ปุ่ม "ค้นหา" จริงยิง AJAX ไป — ดู client JS btnSearch)
 *   2. locationId นอกลิสต์ → ยังไหลไปถึง CP1 ตามที่ส่งมา (ไม่ใช่ด่านสิทธิ์) แต่ dropdown ต้องไม่
 *      หายเงียบ (เก็บเป็นตัวเลือกชั่วคราว)
 *   3. โหลด allow-list ของบริษัทไม่สำเร็จ → fail closed ทั้งหน้า/ทั้ง fragment (ไม่ยิง CP1 เลย)
 *      ส่วนโหลดรายชื่ออาคารผลิตไม่สำเร็จ → ไม่บล็อก (ไม่ใช่ด่านสิทธิ์) แต่ต้องเตือนให้เห็น
 */
const H = require('../../../test/lib/_harness');

const eq = H.makeEq({ json: true });

const SUBS = [{ id: '2', name: 'Foodstar Co., Ltd.' }, { id: '5', name: 'FS Group' }];
const LOCS = [{ id: '10', name: 'PD_B1' }, { id: '23', name: 'PD_B2' }];
const WO_ROWS = [{
  woid: '1001', wo_number: 'WOFSC00001001', item_id: '9', item_code: 'X',
  item_displayname: 'X', item_name: 'X', qty: 1, unit_name: 'KG',
  wo_date: '2026-09-02', location_id: '10', location_name: 'PD_B1',
  line_name: 'A', approval_status: '1', approval_status_name: 'Approved', back_order_qty: 0,
}];

// สลับพฤติกรรมของ query ระหว่างซีน (จำลอง query ล้ม)
let MODE = { subThrow: false, locThrow: false };

function sqlRows(sql) {
  if (/FROM subsidiary/i.test(sql)) {
    if (MODE.subThrow) throw new Error('Invalid or unsupported search (จำลอง)');
    return SUBS;
  }
  if (/FROM location WHERE custrecord_mfg_productionplant/i.test(sql)) {
    if (MODE.locThrow) throw new Error('Invalid or unsupported search (จำลอง)');
    return LOCS;
  }
  if (/cseg_subitemtype/.test(sql)) return []; // ไม่เกี่ยวกับเทสนี้ ให้เหลือ "ทุกประเภทย่อย"
  if (/AS wo_number/.test(sql)) return WO_ROWS; // CP1 เท่านั้น — CP3a ก็มี `t.type = 'WorkOrd'` เหมือนกัน
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

/**
 * เรียก CP1 (คำสั่งที่เป็นรายการ WO ตัวจริง) ทุกครั้งที่ยิงในรอบนี้
 * ใช้ `AS wo_number` เป็นลายเซ็น — `t.type = 'WorkOrd'` เพียงอย่างเดียวไม่พอเพราะ CP3a
 * (BOM components) ก็มีเงื่อนไขนี้เหมือนกัน จะนับซ้ำถ้าใช้ regex เดิม
 */
function cp1Calls() {
  return H.calls.filter((c) => /AS wo_number/.test(c.sql));
}

/** ข้อความในหน้า error เต็มหน้า (คืน '' ถ้าไม่ใช่หน้า error) — ดู test_wostatus_datefilter.js */
function errorText(html) {
  const m = html.match(/<div class="error-page">[\s\S]*?<pre>([\s\S]*?)<\/pre>/);
  return m ? m[1] : '';
}

/** ตัด <select name="..."> ...</select> ออกมาเฉพาะช่องที่สนใจ กันชนกับ id ที่บังเอิญซ้ำที่อื่น */
function selectBlock(html, name) {
  const m = html.match(new RegExp('<select name="' + name + '">[\\s\\S]*?</select>'));
  return m ? m[0] : '';
}

// ═══ 1. subsidiaryId นอกสิทธิ์ผ่าน URL ต้องถูกบีบก่อนถึง query ═══════════════
console.log('\n── subsidiaryId นอกสิทธิ์ (renderResults — full page) ──');
MODE = { subThrow: false, locThrow: false };
H.calls.length = 0;
const bodyResults = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026', subsidiaryId: '999' });
eq('CP1 ยิงจริง', cp1Calls().length, 1);
eq('CP1 ไม่มีเงื่อนไข subsidiary (ถูกบีบเป็นไม่มีเงื่อนไขเลย)',
  /tl_main\.subsidiary = \?/.test(cp1Calls()[0].sql), false);
eq('param ของ CP1 ไม่มี "999" หลุดไปถึง SQL จริง',
  (cp1Calls()[0].params || []).indexOf('999') >= 0, false);
const subBlockR = selectBlock(bodyResults, 'subsidiaryId');
eq('เมนูบริษัทไม่มี option ของค่านอกสิทธิ์ (999) ค้างอยู่ (ต่างจาก location — ดูเคสข้อ 2)',
  /value="999"/.test(subBlockR), false);
eq('ไม่มี option ไหนในเมนูบริษัทถูกเลือกไว้ (ตกไปที่ "ทุกบริษัท" โดย default อย่างถูกต้อง — ไม่ใช่ 999)',
  /selected/.test(subBlockR), false);
eq('มีข้อความเตือนบอกว่าค่าที่ระบุ (999) ไม่อยู่ในสิทธิ์ — ไม่ใช่เปลี่ยนเงียบ ๆ',
  /999/.test(bodyResults) && /ไม่อยู่ในสิทธิ์/.test(bodyResults), true);

console.log('\n── subsidiaryId นอกสิทธิ์ (renderFragment — ทางที่ปุ่มค้นหาจริงยิง AJAX) ──');
H.calls.length = 0;
const bodyFrag = run({ action: 'search', fragment: '1', dateFrom: '02/09/2026', dateTo: '08/09/2026', subsidiaryId: '999' });
eq('CP1 (ผ่าน fragment) ยิงจริง', cp1Calls().length, 1);
eq('CP1 (ผ่าน fragment) ไม่มีเงื่อนไข subsidiary',
  /tl_main\.subsidiary = \?/.test(cp1Calls()[0].sql), false);
eq('param ของ CP1 (fragment) ไม่มี "999" หลุดไปถึง SQL จริง',
  (cp1Calls()[0].params || []).indexOf('999') >= 0, false);
eq('fragment แจ้งเตือนว่าค่าที่ระบุถูกเปลี่ยน', /ไม่อยู่ในสิทธิ์/.test(bodyFrag), true);

console.log('\n── subsidiaryId ที่อยู่ในสิทธิ์จริง ยังใช้งานได้ปกติ (ไม่ใช่บล็อกทุกค่า) ──');
H.calls.length = 0;
const bodyOk = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026', subsidiaryId: '2' });
eq('CP1 มีเงื่อนไข subsidiary', /tl_main\.subsidiary = \?/.test(cp1Calls()[0].sql), true);
eq('param มี "2" ถึง SQL จริง', (cp1Calls()[0].params || []).indexOf('2') >= 0, true);
eq('ไม่มีข้อความเตือนเรื่องสิทธิ์ (เพราะไม่ได้ถูกบีบ)', /ไม่อยู่ในสิทธิ์/.test(bodyOk), false);

// ═══ 2. locationId นอกลิสต์ — ไม่ใช่ด่านสิทธิ์ (ต่างจาก subsidiary โดยตั้งใจ) ═══
console.log('\n── locationId นอกลิสต์ — ไม่ใช่ด่านสิทธิ์ ยังไหลไปถึง query ตามที่ส่งมา ──');
H.calls.length = 0;
const bodyLoc = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026', locationId: '777' });
eq('CP1 ยังได้ locationId ดิบ (777) — ไม่ถูกบีบเหมือน subsidiary',
  (cp1Calls()[0].params || []).indexOf('777') >= 0, true);
const locBlock = selectBlock(bodyLoc, 'locationId');
eq('เมนูอาคารผลิตเก็บ 777 ไว้เป็นตัวเลือกชั่วคราวที่ถูกเลือก (ท่าเดียวกับที่ #50 ทำให้ WO Cost Trace)',
  /<option value="777" selected>/.test(locBlock), true);
eq('บอกว่าไม่อยู่ในรายชื่ออาคารผลิต ไม่ใช่ทำเนียนเป็นชื่อจริง',
  /ไม่อยู่ในรายชื่ออาคารผลิต/.test(locBlock), true);

// ═══ 3. loader ล้ม — subsidiary fail closed / location แค่เตือน ═══════════
console.log('\n── โหลด allow-list บริษัทไม่สำเร็จ → fail closed ทั้งหน้า (renderResults) ──');
MODE = { subThrow: true, locThrow: false };
H.calls.length = 0;
const failBody = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026' });
eq('ไม่ยิง CP1 เลย — ไม่ใช่ "รายการว่างแล้วเดินต่อ"', cp1Calls().length, 0);
eq('ขึ้นหน้า error จริง ไม่ใช่หน้าผลลัพธ์ว่างที่ดูเหมือนคำตอบปกติ', errorText(failBody) !== '', true);
eq('ข้อความบอกตรง ๆ ว่าดึงชุดสิทธิ์บริษัทไม่สำเร็จ', /ชุดสิทธิ์บริษัท/.test(errorText(failBody)), true);

console.log('\n── โหลด allow-list บริษัทไม่สำเร็จ → fail closed (renderFragment) ──');
H.calls.length = 0;
const failFrag = run({ action: 'search', fragment: '1', dateFrom: '02/09/2026', dateTo: '08/09/2026' });
eq('ไม่ยิง CP1 เลย (fragment)', cp1Calls().length, 0);
eq('fragment ตอบเป็นแถบแจ้งเตือน ไม่ใช่ผลลัพธ์ว่าง', /schema-notice/.test(failFrag), true);
eq('ข้อความบอกตรง ๆ ว่าดึงชุดสิทธิ์บริษัทไม่สำเร็จ (fragment)', /ชุดสิทธิ์บริษัท/.test(failFrag), true);

console.log('\n── โหลดรายชื่ออาคารผลิตไม่สำเร็จ → ไม่บล็อก (ไม่ใช่ด่านสิทธิ์) แต่ต้องเตือน ──');
MODE = { subThrow: false, locThrow: true };
H.calls.length = 0;
const locFailBody = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026' });
eq('ยังยิง CP1 ตามปกติ', cp1Calls().length, 1);
eq('มีข้อความเตือนว่าโหลดรายชื่ออาคารผลิตไม่สำเร็จ — ไม่ใช่ dropdown ว่างเงียบ ๆ',
  /อาคารผลิตไม่สำเร็จ/.test(locFailBody), true);

MODE = { subThrow: false, locThrow: false };

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
