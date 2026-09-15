/**
 * เทส — โค้ด client ของ Redwood searchable combobox (#64 ขั้น 3 — list field) ต้องเหมือนกัน
 * ทุกตัวอักษรระหว่างสองแอป นอกเหนือจากส่วนที่ตั้งใจให้ต่างกัน
 *
 * ทำไมต้องมีเทสนี้: ต่างจาก CSS/ไอคอน (shared/WOReportTheme.js + npm run sync:theme ที่
 * test_theme_sync.js เฝ้าอยู่) ยังไม่มีกลไก sync ไฟล์ JS ของ client ข้ามแอป (WOStatusTracking.js
 * กับ WOCostTrace.js เป็นคนละ SDF project deploy อิสระกัน — epic #37) เอนจินคอมโบบ็อกซ์จึงเป็น
 * "สำเนาที่ตั้งใจซ้ำ" ก็อปด้วยมือทั้งก้อน — ถ้าไม่มีด่านกัน ใครแก้ที่หนึ่งแล้วลืมอีกที่จะไม่มีใครรู้
 * จนกว่าจะมีคนเจอบั๊กในหน้าใดหน้าหนึ่งเท่านั้น (รูปแบบเดียวกับที่ test_theme_sync.js กันไว้ให้ CSS)
 *
 * ส่วนที่ตั้งใจต่างกัน (normalize ก่อนเทียบ แล้วเทียบแยกว่าตรงกับที่ "ตั้งใจ" จริงไหม)
 *   1. ข้อความ "ไม่พบตัวเลือกที่ตรงกัน" — wo-status มีสองภาษา (หน้านี้มีปุ่มสลับ ไทย/ENG จริง)
 *      wo-cost-trace เป็นภาษาไทยล้วนทั้งหน้า (ไม่มีกลไกสลับภาษาเลยสักจุด) — ตั้งใจให้ต่าง ไม่ใช่ลืม
 *   2. รายการชื่อ select ที่ enhance ตอนโหลดหน้า — subsidiaryId/locationId/subItemTypeId
 *      (wo-status) vs sub/loc (wo-cost-trace) เพราะคนละหน้า คนละชื่อ field จริง
 */
const fs = require('fs');
const H = require('./lib/_harness');

const eq = H.makeEq();

// ── ดึงเอนจินของ wo-status จากหน้าที่ render จริง ────────────────────────
const { module: statusMod } = H.load({
  file: 'WOStatusTracking.js',
  libs: [
    'WOReportTheme.js',
    'WOStatusTracking_Labels.js',
    'WOStatusTracking_Queries.js',
    'WOStatusTracking_Drilldown.js',
  ],
  requireRunSQL: false,
  sqlRows: () => [],
  quietLog: true,
});
const statusChunks = [];
statusMod.onRequest({
  request: { parameters: {} },
  response: { write: (s) => statusChunks.push(String(s)), setHeader: () => {} },
});
const statusPage = statusChunks.join('');

// ── ดึงเอนจินของ wo-cost-trace ผ่าน renderListFieldScript() ตรง ๆ ────────
const { T: traceT } = H.load({
  file: 'WOCostTrace.js',
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: {},
  quietLog: true,
  exports: ['renderListFieldScript'],
});
const traceScriptTag = traceT.renderListFieldScript();

// ตัดจาก "function _sig(select) {" ถึงปิด IIFE — ข้ามส่วนก่อนหน้าที่ตั้งใจต่างกันโดยไม่เกี่ยวกับ
// พฤติกรรม (wo-status: คอมเมนต์อธิบายยาวก่อน IIFE · wo-cost-trace: ประกาศ `var RW_CHEVRON_SVG`
// ในตัว IIFE เพราะย้าย JSDoc อธิบายไปไว้ที่ renderListFieldScript() ฝั่งเซิร์ฟเวอร์แทน)
function extractEngineBody(text) {
  const m = text.match(/function _sig\(select\) \{[\s\S]*?\n\}\)\(\);/);
  return m ? m[0] : null;
}
const statusBody = extractEngineBody(statusPage);
const traceBody = extractEngineBody(traceScriptTag);
eq('ดึงเอนจินของ wo-status ออกมาได้', !!statusBody, true);
eq('ดึงเอนจินของ wo-cost-trace ออกมาได้', !!traceBody, true);

/** normalize ส่วนที่ตั้งใจต่างกัน (ดูหัวไฟล์) ให้เหลือ placeholder เดียวกัน ก่อนเทียบ byte ต่อ byte */
function normalize(text, emptyMsg, enhanceTargets) {
  return text
    .replace(emptyMsg, '__EMPTY_TEXT__')
    .replace(enhanceTargets, '__ENHANCE_TARGETS__');
}

const statusNorm = statusBody && normalize(
  statusBody,
  "'ไม่พบตัวเลือกที่ตรงกัน / No matching option'",
  "['subsidiaryId', 'locationId', 'subItemTypeId']"
);
const traceNorm = traceBody && normalize(
  traceBody,
  "'ไม่พบตัวเลือกที่ตรงกัน'",
  "['sub', 'loc']"
);

// ── พิสูจน์ว่า "ส่วนที่ต่าง" ตรงกับที่ตั้งใจจริง ไม่ใช่ normalize ทับปัญหาอื่นไปเงียบ ๆ ──
console.log('\n── ส่วนที่ตั้งใจต่างกันตรงตามที่คาด ──');
eq('wo-status ใช้ข้อความสองภาษา (มีปุ่มสลับ ไทย/ENG จริงในหน้านี้)',
  (statusBody || '').indexOf("'ไม่พบตัวเลือกที่ตรงกัน / No matching option'") >= 0, true);
eq('wo-cost-trace ใช้ข้อความไทยล้วน (ไม่มีกลไกสลับภาษาในหน้านี้)',
  (traceBody || '').indexOf("'ไม่พบตัวเลือกที่ตรงกัน'") >= 0
  && (traceBody || '').indexOf('No matching option') < 0, true);
eq('wo-status enhance ช่อง subsidiaryId/locationId/subItemTypeId',
  (statusBody || '').indexOf("['subsidiaryId', 'locationId', 'subItemTypeId']") >= 0, true);
eq('wo-cost-trace enhance ช่อง sub/loc', (traceBody || '').indexOf("['sub', 'loc']") >= 0, true);

// ── หลัง normalize สองจุดที่ตั้งใจต่างแล้ว ต้องเหมือนกัน byte ต่อ byte ──────
console.log('\n── หลัง normalize ส่วนที่ตั้งใจต่าง — engine เหมือนกันทุกตัวอักษร ──');
if (statusNorm && traceNorm && statusNorm !== traceNorm) {
  // หา diff แบบง่าย ๆ (บรรทัดแรกที่ต่าง) ช่วยไล่ตอนแดง — ไม่ต้องพึ่ง diff tool ภายนอก
  const a = statusNorm.split('\n'), b = traceNorm.split('\n');
  let firstDiff = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { firstDiff = i; break; }
  }
  console.log('     บรรทัดแรกที่ต่าง (index ' + firstDiff + '):');
  console.log('       wo-status     : ' + JSON.stringify(a[firstDiff]));
  console.log('       wo-cost-trace : ' + JSON.stringify(b[firstDiff]));
}
eq('engine เหมือนกันทุกตัวอักษร (นอกเหนือจากสองจุดที่ normalize ไว้)', statusNorm === traceNorm, true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
