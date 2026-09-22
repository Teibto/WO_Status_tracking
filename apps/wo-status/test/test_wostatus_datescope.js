/**
 * เทส — ขอบเขตข้อมูล/performance ของ WO Status Tracking (issue #78)
 *
 * ปัญหาที่กัน: เดิมเพดานช่วงวันที่ถูกฟิกไว้ที่ 7 วัน เพราะงานหนักผูกกับ "จำนวน WO ทั้งช่วง"
 * (CP1 คืนทุกใบ → ยิง CP2–CP9 ให้ทุกใบ → เพิ่ง slice 100 แถวมาแสดง)
 *
 * หลังแก้: CP1 แบ่งหน้าด้วย window function ในตัวเดียว (`COUNT(*) OVER ()` + `ROW_NUMBER()`)
 * และ CP2–CP9 รับเฉพาะ woids ของหน้าปัจจุบัน — เทสนี้ยันสามชั้น
 *
 *   1. **SQL ของ CP1** ใช้ window pagination จริง และ **ไม่มี `OFFSET`** (SuiteQL เงียบ ๆ ไม่ทำตาม)
 *      พร้อมยืนยันว่า param ที่ผูกยังเป็นตัวกรองเดิม ไม่มีเลขหน้าปนเข้ามา
 *   2. **งานหนักผูกกับขนาดหน้า** — CP2 ต้องเห็นเฉพาะ woid ในหน้า ไม่ใช่ทุกใบในช่วง
 *   3. **หน้าที่เกินหน้าสุดท้าย** ถอยไปหน้า 1 ให้เอง และจำนวนทั้งช่วงยังถูกต้อง
 */
const H = require('../../../test/lib/_harness');

const eq = H.makeEq();

// 250 ใบ — พอให้มี 3 หน้าเมื่อ PAGE_SIZE = 100
const ALL = [];
for (let i = 0; i < 250; i++) {
  ALL.push({
    woid: String(1001 + i),
    wo_number: 'WOFSC' + (1001 + i),
    item_id: '9', item_code: 'X', item_displayname: 'X', item_name: 'X',
    qty: 1, unit_name: 'KG', wo_date: '2026-09-02',
    location_id: '1', location_name: 'L', line_name: 'A',
    approval_status: '2', approval_status_name: 'Approved', back_order_qty: 0,
  });
}

/** จำลอง ROWNUM pagination ของจริง: อ่าน `rn BETWEEN a AND b` จาก SQL แล้ว slice fixture */
function sqlRows(sql) {
  if (/customrecord_cseg_subitemtype/.test(sql)) return [];
  if (/FROM subsidiary/i.test(sql)) return [];
  if (/t\.type\s*=\s*'WorkOrd'/.test(sql)) {
    const m = sql.match(/rn BETWEEN (\d+) AND (\d+)/);
    const slice = m ? ALL.slice(Number(m[1]) - 1, Number(m[2])) : ALL;
    // COUNT(*) OVER () มากับทุกแถวของหน้า — จำลองให้ตรง
    return slice.map(r => Object.assign({}, r, { total_count: ALL.length }));
  }
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

function cp1Calls() {
  // CP3a ก็มี `t.type = 'WorkOrd'` เหมือนกัน — แยกด้วย marker ของ pagination ของ CP1
  return H.calls.filter(c => /ROW_NUMBER\(\) OVER \(ORDER BY t\.trandate/.test(c.sql));
}
function cp2Calls() {
  return H.calls.filter(c => /customrecord_mfg_releasedwobatch/.test(c.sql));
}

// ── 1. SQL ของ CP1 ─────────────────────────────────────────────────────
console.log('\n── CP1 ใช้ window pagination ไม่ใช่ OFFSET ──');
H.calls.length = 0;
const body = run({ action: 'search', dateFrom: '01/09/2026', dateTo: '30/09/2026' });
const c1 = cp1Calls()[0];
eq('ยิง CP1', !!c1, true);
eq('ใช้ COUNT(*) OVER () เอาจำนวนทั้งช่วง', /COUNT\(\*\) OVER \(\)/.test(c1.sql), true);
eq('ใช้ ROW_NUMBER() OVER (ORDER BY ...) แบ่งหน้า', /ROW_NUMBER\(\) OVER \(ORDER BY/.test(c1.sql), true);
eq('ไม่ใช้ OFFSET (SuiteQL ไม่ทำตาม)', /OFFSET/i.test(c1.sql), false);
eq('มีกรอบ rn BETWEEN ของหน้าแรก', /rn BETWEEN 1 AND 100/.test(c1.sql), true);
// param ต้องเป็นตัวกรองเดิมเท่านั้น — เลขหน้าฝังเป็นตัวเลขใน SQL ไม่ผูก param
eq('param ยังเป็นช่วงวันที่เดิม', JSON.stringify(c1.params), '["2026-09-01","2026-09-30"]');

// ── 2. งานหนักผูกกับขนาดหน้า ──────────────────────────────────────────
console.log('\n── CP2 รับเฉพาะ woid ของหน้าแรก ──');
const cp2 = cp2Calls()[0];
eq('ยิง CP2', !!cp2, true);
eq('มี woid ใบแรกของหน้า', /IN \('1001'/.test(cp2.sql), true);
eq('มี woid ใบสุดท้ายของหน้าแรก (1100)', /'1100'/.test(cp2.sql), true);
eq('ไม่มี woid ที่อยู่หน้าถัดไป (1200)', /'1200'/.test(cp2.sql), false);

// ── 3. หน้า 3 ต้องเห็น woid ของหน้า 3 เท่านั้น ────────────────────────
console.log('\n── หน้า 3 แบ่งกรอบถูกและส่ง woid เฉพาะหน้านั้น ──');
H.calls.length = 0;
run({ action: 'search', dateFrom: '01/09/2026', dateTo: '30/09/2026', page: '3' });
const c1p3 = cp1Calls()[0];
eq('กรอบ rn ของหน้า 3', /rn BETWEEN 201 AND 300/.test(c1p3.sql), true);
const cp2p3 = cp2Calls()[0];
eq('woid ใบแรกของหน้า 3 ที่ CP2 (1201)', /'1201'/.test(cp2p3.sql), true);
eq('woid ของหน้า 1 ไม่โผล่ใน CP2 ของหน้า 3', /'1001'/.test(cp2p3.sql), false);

// ── 4. หน้าที่เกินหน้าสุดท้าย ──────────────────────────────────────────
console.log('\n── หน้าที่เกินหน้าสุดท้ายถอยไปหน้า 1 ──');
H.calls.length = 0;
const over = run({ action: 'search', dateFrom: '01/09/2026', dateTo: '30/09/2026', page: '99' });
const overCp1 = cp1Calls();
eq('ยิง CP1 สองครั้ง (หน้ารั่ว → ถอยไปหน้า 1)', overCp1.length, 2);
eq('ครั้งที่สองเป็นหน้าแรก', /rn BETWEEN 1 AND 100/.test(overCp1[1].sql), true);
eq('ยังแสดงจำนวนทั้งช่วง 250', /data-i18n="kRange"[^>]*>[\s\S]{0,60}?250/.test(over), true);

// ── 5. KPI บอกขอบเขตของตัวเอง ────────────────────────────────────────
console.log('\n── KPI ระบุว่าเป็นของหน้าปัจจุบัน + จำนวนทั้งช่วง ──');
eq('มีบรรทัดกำกับขอบเขต KPI', /class="kpiscope"/.test(body), true);
eq('KPI ใบแรกนับเฉพาะหน้า (100) ไม่ใช่ทั้งช่วง (250)',
  /class="n">100<\/div>\s*<div class="l" data-i18n="kTotal"/.test(body), true);
eq('บรรทัดขอบเขตบอกจำนวนทั้งช่วง 250',
  /data-i18n="kRange"[\s\S]{0,60}?<b>250<\/b>/.test(body), true);

// ── 6. เพดานช่วงวันที่ใหม่ ────────────────────────────────────────────
console.log('\n── เพดานช่วงวันที่ใหม่ ──');
eq('ช่วง 30 วันผ่าน (เดิมถูกบล็อกที่ 7 วัน)', /class="error-page"/.test(body), false);
const reject = run({ action: 'search', dateFrom: '01/01/2026', dateTo: '31/12/2026' });
eq('ช่วง 365 วันถูกปฏิเสธ', /92 วัน/.test(reject), true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
