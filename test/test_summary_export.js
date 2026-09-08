/**
 * Harness — ตรวจไฟล์ Excel ของชั้นภาพรวม (Teibto/Foodstar-All-Reports#10)
 * ไม่แตะ NetSuite · stub N/query ให้คืนแถวตาม label ของ query เหมือน test_summary_math.js
 *
 * สิ่งที่ล็อกไว้ที่นี่
 *   หัวและลำดับคอลัมน์ของไฟล์ = หัวของตารางบนหน้าจอ (ดึง <th> ออกมาเทียบตรง ๆ)
 *   จำนวนแถว = จำนวนใบที่แสดง · ไม่มีแถวรวมกลุ่ม/แถวรวมท้ายปนมา
 *   ช่องตัวเลขเป็นค่าดิบ ไม่ใช่ข้อความจัดรูปแบบ · ห้ามมี NaN/Infinity ที่ทำให้ Excel ฟ้องไฟล์เสีย
 *   วันที่เป็นเลขวันที่ของ Excel ไม่ใช่ข้อความ d/m/yyyy ที่ sort ไม่ได้
 */
const fs = require('fs');
const path = require('path');

// รัน: node test/test_summary_export.js
const FILE = path.join(__dirname,
  '../src/FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking/WOCostTrace.js');

// ── fixture: 3 ใบ ครอบเคสที่ทำให้ช่องตัวเลขพังได้ ──────────────────────────
const FX = {
  'ภาพรวม — รายการใบสั่งผลิต': [
    // ปกติ ปิดงานแล้ว ตั้ง basepercarton ครบ
    { wo_id: 1001, wo_no: 'WOFSC00000470', wo_date: '23/7/2026', wo_date_iso: '2026-07-23',
      item_id: 501, item_code: '11010900010', item_name: 'FG ส้ม 300 มล. <ขวด>', wo_qty: 163000,
      sub_id: 2, unit_name: 'BOTTLE', base_per_carton: 48 },
    // ยังไม่ปิดงานผลิต → ต้นทุน/หน่วยและต้นทุน/ลังเป็น null
    { wo_id: 1002, wo_no: 'WOFSC00000471', wo_date: '24/7/2026', wo_date_iso: '2026-07-24',
      item_id: 501, item_code: '11010900010', item_name: 'FG ส้ม 300 มล.', wo_qty: 50000,
      sub_id: 2, unit_name: 'BOTTLE', base_per_carton: 48 },
    // ไม่ได้ตั้ง basepercarton → ตัวหารเป็นศูนย์ ต้องไม่กลายเป็น Infinity ในไฟล์
    { wo_id: 1003, wo_no: 'WOFSC00000480', wo_date: '25/7/2026', wo_date_iso: '2026-07-25',
      item_id: 502, item_code: '11010900099', item_name: 'FG ไม่ตั้ง basepercarton', wo_qty: 1000,
      sub_id: 2, unit_name: 'BOTTLE', base_per_carton: null }
  ],
  'ภาพรวม — ผลิตได้จริง': [
    { wo_id: 1001, woc_qty: 160276, woc_count: 1, woc_fg_count: 1, woc_sc_linked: 1, woc_in_range: 1,
      woc_last: '31/7/2026', woc_last_iso: '2026-07-31' },
    { wo_id: 1003, woc_qty: 900, woc_count: 1, woc_fg_count: 1, woc_sc_linked: 1, woc_in_range: 1,
      woc_last: '28/7/2026', woc_last_iso: '2026-07-28' }
  ],
  'ภาพรวม — วัตถุดิบและบรรจุภัณฑ์': [
    { wo_id: 1001, rm_cost: 347651.01, doc_count: 1, item_count: 30 },
    { wo_id: 1003, rm_cost: 1000, doc_count: 1, item_count: 2 }
  ],
  'ภาพรวม — ต้นทุนแปรสภาพ': [
    { wo_id: 1001, dl_oh_std: 70298.58, dl_oh_act: 70298.58, ca_docs: 1 },
    { wo_id: 1003, dl_oh_std: 100, dl_oh_act: 100, ca_docs: 1 }
  ],
  'ภาพรวม — Summary Cost Item': [
    { wo_id: 1001, sc_value: 1020186.59, sc_docs: 1, sc_docs_valued: 1, sc_docs_orphan: 0 },
    { wo_id: 1003, sc_value: 1100, sc_docs: 1, sc_docs_valued: 1, sc_docs_orphan: 0 }
  ],
  'Cost ref ของสินค้าที่ผลิต': []
};

// ── stub SuiteScript modules ────────────────────────────────────────────────
const MOD = {
  'N/query': {
    runSuiteQLPaged() {
      const rows = FX[CURRENT_LABEL] || [];
      return {
        pageRanges: rows.length ? [{ index: 0 }] : [],
        fetch: () => ({ data: { asMappedResults: () => rows } })
      };
    }
  },
  'N/log': { error: (o) => console.error('LOG.error', o.title, o.details), debug: () => {} },
  'N/runtime': { getCurrentScript: () => ({ id: 'customscript_fs_wo_cost_trace', deploymentId: 'customdeploy_fs_wo_cost_trace' }) }
};

let CURRENT_LABEL = '';
let MODULE = null;
global.define = (deps, factory) => { MODULE = factory.apply(null, deps.map(d => MOD[d])); };

const src = fs.readFileSync(FILE, 'utf8')
  .replace('function runSQL(label, sql, params) {',
           'function runSQL(label, sql, params) { global.__setLabel(label);');
global.__setLabel = (l) => { CURRENT_LABEL = l; };

const patched = src.replace('return { onRequest: onRequest };',
  'return { onRequest: onRequest, __t: { buildSummary, readFilters, renderSummaryPage, '
  + 'renderSummaryGrid, summaryExportData, renderSummaryExport, excelDate, summaryExportName } };');

eval(patched);

// ── run ────────────────────────────────────────────────────────────────────
const T = MODULE.__t;
const sm = T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
const d = T.summaryExportData(sm);

let fail = 0;
function eq(label, got, want, tol) {
  const ok = want == null ? got == null
    : (typeof want === 'number' ? Math.abs(got - want) <= (tol == null ? 1e-8 : tol) : got === want);
  if (!ok) { fail++; console.log('  FAIL ' + label + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
  else console.log('  ok   ' + label + ' = ' + JSON.stringify(got));
}

console.log('\n── หัวและลำดับคอลัมน์ต้องตรงกับตารางบนหน้าจอ ──');
// ดึง <th> ของ thead ออกจาก renderSummaryGrid — คอลัมน์ที่เพิ่มในตารางแล้วลืมเพิ่มในไฟล์จะตกที่นี่
const grid = T.renderSummaryGrid(sm);
const thead = /<thead>([\s\S]*?)<\/thead>/.exec(grid);
const gridHeads = (thead ? thead[1] : '').match(/<th[^>]*>([\s\S]*?)<\/th>/g)
  .map(s => s.replace(/<[^>]*>/g, '').trim());
eq('จำนวนคอลัมน์เท่ากัน', d.headers.length, gridHeads.length);
eq('ข้อความและลำดับตรงกันทุกคอลัมน์', d.headers.join('|'), gridHeads.join('|'));

console.log('\n── จำนวนแถว: เท่าที่แสดง ไม่มีแถวรวมปนมา ──');
eq('จำนวนแถวในไฟล์', d.rows.length, sm.shown);
eq('ไม่มีแถวรวมกลุ่ม', d.rows.some(r => String(r[0]).indexOf('รวม ') === 0), false);
eq('ทุกแถวมีช่องครบตามหัว', d.rows.every(r => r.length === d.headers.length), true);

console.log('\n── ค่าตัวเลขต้องเป็นค่าดิบที่ Excel คำนวณต่อได้ ──');
const col = h => d.headers.indexOf(h);
const row470 = d.rows.filter(r => r[0] === 'WOFSC00000470')[0];
eq('วัตถุดิบเป็น number', typeof row470[col('วัตถุดิบ')], 'number');
eq('วัตถุดิบค่าดิบ', row470[col('วัตถุดิบ')], 347651.01);
eq('แปรสภาพค่าดิบ', row470[col('แปรสภาพ (DL+OH)')], 70298.58);
eq('รวมต้นทุนค่าดิบ', row470[col('รวมต้นทุน')], 417949.59);
eq('ต้นทุน/หน่วยไม่ถูกปัด', row470[col('ต้นทุน/หน่วย')], 417949.59 / 160276, 1e-12);
eq('Summary Cost Item', row470[col('Summary Cost Item')], 1020186.59);
eq('ผลต่าง', row470[col('ผลต่าง')], 1020186.59 - 417949.59, 1e-6);
eq('ห้ามมีเครื่องหมายคั่นหลักในช่องตัวเลข',
  d.rows.some(r => typeof r[col('รวมต้นทุน')] === 'string' && r[col('รวมต้นทุน')].indexOf(',') >= 0), false);

console.log('\n── ช่องที่คิดไม่ได้ต้องว่าง ไม่ใช่ 0 / NaN / Infinity ──');
const row471 = d.rows.filter(r => r[0] === 'WOFSC00000471')[0];   // ยังไม่ปิดงานผลิต
eq('ต้นทุน/หน่วยว่าง', row471[col('ต้นทุน/หน่วย')], '');
eq('ต้นทุน/ลังว่าง', row471[col('ต้นทุน/ลัง')], '');
eq('วันปิดงานผลิตว่าง', row471[col('ปิดงานผลิต')], '');
const row480 = d.rows.filter(r => r[0] === 'WOFSC00000480')[0];   // ไม่ตั้ง basepercarton
eq('ต้นทุน/ลังว่างเมื่อไม่ตั้ง basepercarton', row480[col('ต้นทุน/ลัง')], '');
eq('แต่ต้นทุน/หน่วยยังคิดได้', row480[col('ต้นทุน/หน่วย')], 1100 / 900, 1e-12);
const flat = d.rows.reduce((a, r) => a.concat(r), []);
eq('ไม่มี NaN', flat.some(v => typeof v === 'number' && isNaN(v)), false);
eq('ไม่มี Infinity', flat.some(v => typeof v === 'number' && !isFinite(v)), false);
eq('ไม่มี null/undefined', flat.some(v => v == null), false);
eq('ไม่มี [object Object]', flat.some(v => String(v).indexOf('[object') >= 0), false);

console.log('\n── วันที่ต้องเป็นเลขวันที่ของ Excel ──');
eq('2026-07-23 = serial 46226', T.excelDate('2026-07-23'), 46226);
eq('1900-03-01 = serial 61 (ตรงกับ Excel)', T.excelDate('1900-03-01'), 61);
eq('ไม่มีวันที่คืนค่าว่าง', T.excelDate(''), '');
eq('วันที่ WO เป็น number', typeof row470[col('วันที่ WO')], 'number');
eq('วันที่ WO ตรงกับ 2026-07-23', row470[col('วันที่ WO')], T.excelDate('2026-07-23'));
eq('ปิดงานผลิตตรงกับ 2026-07-31', row470[col('ปิดงานผลิต')], T.excelDate('2026-07-31'));
eq('คอลัมน์วันที่ใช้รูปแบบวันที่', d.cols[col('วันที่ WO')].fmt, 'yyyy-mm-dd');

console.log('\n── หมายเหตุต้องเป็นข้อความอ่านได้ ──');
const noteCell = row471[col('หมายเหตุ')];
eq('เป็น string', typeof noteCell, 'string');
eq('มีข้อความจริง', noteCell.indexOf('ยังไม่มีใบปิดงานผลิต') >= 0, true);
eq('หลายข้อคั่นด้วย ·', noteCell.indexOf(' · ') > 0, true);
eq('ใบปกติไม่มีหมายเหตุ', row470[col('หมายเหตุ')], '');

console.log('\n── ชื่อไฟล์ ──');
eq('บอกชื่อรายงาน', d.filebase.indexOf('WOCostTrace') === 0, true);
eq('บอกช่วงที่กรอง', d.filebase.indexOf('2026-07-01_to_2026-07-31') > 0, true);
eq('เลือกเดือนแล้วใช้เดือนในชื่อไฟล์',
  T.summaryExportName({ month: '2026-06', from: '2026-06-01', to: '2026-06-30' }).indexOf('2026-06') > 0, true);
eq('กรองด้วยเลขที่ใบสั่งผลิตแล้วใช้เลขนั้น',
  T.summaryExportName({ wono: 'WOFSC00000470' }), 'WOCostTrace_Summary_WO-WOFSC00000470');
eq('ชื่อไฟล์ไม่มีอักขระต้องห้ามของ Windows', /[\\/:*?"<>|]/.test(d.filebase), false);
// ชื่อไฟล์ถูกส่งอีเมล/อัปโหลดต่อ — ASCII ล้วนกันชื่อเพี้ยนที่ระบบปลายทาง
eq('ชื่อไฟล์เป็น ASCII ล้วน', /^[\x20-\x7e]+$/.test(d.filebase), true);
eq('ชื่อชีทไม่เกิน 31 ตัว', d.sheet.length <= 31, true);

console.log('\n── ปุ่มและข้อมูลที่ฝังมากับหน้า ──');
const html = T.renderSummaryExport(sm);
eq('มีปุ่ม', html.indexOf('id="btnXlsx"') > 0, true);
eq('โหลดตัวสร้าง xlsx', html.indexOf('xlsx-js-style@1.2.0') > 0, true);
eq('บอกจำนวนแถวที่จะได้', html.indexOf('ได้ 3 แถว') > 0, true);
// "<" ในชื่อสินค้าต้องไม่ปิดแท็ก script กลางคัน
eq('ข้อมูลฝังหนีอักขระ < แล้ว', html.indexOf('FG ส้ม 300 มล. <ขวด>') < 0, true);
eq('หนีเป็น \\u003c', html.indexOf('\\u003c\\u0e02') > 0 || html.indexOf('\\u003cขวด') > 0, true);
eq('ไม่มีแท็กปิด script เกินมา', (html.match(/<\/script>/g) || []).length, 2);
// คำว่า undefined ห้ามโผล่ในหน้าเลย — test_summary_math.js ใช้เงื่อนไขนี้กับทั้งหน้า
// การ์ดเช็ก CDN จึงต้องเขียนเป็น !window.XLSX ไม่ใช่ typeof ... === "undefined"
eq('ไม่มี undefined', html.indexOf('undefined') < 0, true);
eq('เช็กว่าโหลด XLSX สำเร็จก่อนใช้', html.indexOf('if(!window.XLSX)') > 0, true);
// ตัวกันพลาดฝั่งเบราว์เซอร์: หน้าเจอ CDN ไม่ได้ต้องบอกผู้ใช้ ไม่ใช่กดแล้วเงียบ
eq('มีข้อความเตือนเมื่อโหลดตัวสร้างไม่สำเร็จ',
  html.indexOf('โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ') > 0, true);

console.log('\n── ตัด max แล้วต้องบอกในแถบ export ──');
const smCut = T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31', max: '1' }));
const htmlCut = T.renderSummaryExport(smCut);
eq('ไฟล์ได้เท่าที่แสดง', T.summaryExportData(smCut).rows.length, 1);
eq('บอกว่าได้ไม่ครบ', htmlCut.indexOf('ได้ 1 แถวเท่าที่แสดง จากทั้งหมด 3 ใบ') > 0, true);

console.log('\n── ไม่มีข้อมูล: ปุ่มต้องปิด ไม่ใช่กดแล้ว error ──');
const smEmpty = { filters: T.readFilters({}), rows: [], total: 0, shown: 0, truncated: false };
const htmlEmpty = T.renderSummaryExport(smEmpty);
eq('ปุ่มถูกปิด', htmlEmpty.indexOf('disabled') > 0, true);
eq('ไม่โหลดตัวสร้าง xlsx เปล่า ๆ', htmlEmpty.indexOf('xlsx-js-style') < 0, true);
eq('บอกเหตุผล', htmlEmpty.indexOf('ไม่มีรายการให้ export') > 0, true);
eq('summaryExportData ไม่พังกับผลลัพธ์ว่าง', T.summaryExportData(smEmpty).rows.length, 0);

console.log('\n── หน้าภาพรวมต้องมีปุ่มอยู่เหนือตาราง ──');
const page = T.renderSummaryPage(sm);
eq('ปุ่มอยู่ในหน้า', page.indexOf('id="btnXlsx"') > 0, true);
eq('ปุ่มมาก่อนตาราง', page.indexOf('id="btnXlsx"') < page.indexOf('<div class="scroll">'), true);

console.log(fail ? '\n✖ ' + fail + ' ข้อไม่ผ่าน' : '\n✔ ผ่านทั้งหมด');
process.exit(fail ? 1 : 0);
