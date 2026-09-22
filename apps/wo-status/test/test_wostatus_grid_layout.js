/**
 * เทส — โครงตารางของ WO Status Tracking (issue #80)
 *
 * ปัญหาที่กัน:
 *   1. **หัวตารางกับแถวไม่ตรงกัน** — `cpStatus` มี 11 ช่อง แต่ `Labels.cols` ประกาศไว้ 10
 *      (ขาด "ต้นทุนมาตรฐาน" ซึ่งเป็น checkpoint ที่ 11) ตารางจึงมี 14 หัวคอลัมน์แต่ 15 ช่อง
 *      → หัวคอลัมน์เลื่อนทั้งแถวและช่องท้ายไม่มีหัว
 *   2. **ปุ่มขยาย/ย่อทั้งหมด** ต้องมีเฉพาะเมื่อมีแถว และต้องไม่โผล่ตอนไม่มีผลลัพธ์
 */
const H = require('../../../test/lib/_harness');

const eq = H.makeEq();

function sqlRows(sql) {
  if (/customrecord_cseg_subitemtype/.test(sql)) return [];
  if (/FROM subsidiary/i.test(sql)) return [];
  if (/ROW_NUMBER\(\) OVER \(ORDER BY t\.trandate/.test(sql)) {
    return [{
      woid: '5001', wo_number: 'WOFSC00005001', item_id: '9', item_code: 'X',
      item_displayname: 'X', item_name: 'X', qty: 1, unit_name: 'KG', wo_date: '2026-09-02',
      location_id: '1', location_name: 'L', line_name: 'A', approval_status: '2',
      approval_status_name: 'Approved', back_order_qty: 0, total_count: 1,
    }];
  }
  return [];
}

// สลับได้ระหว่างซีน: แถว WO ที่ CP1 จะคืน
let woRows = null;

const { module: mod } = H.load({
  file: 'WOStatusTracking.js',
  libs: [
    'WOReportTheme.js',
    'WOStatusTracking_Labels.js',
    'WOStatusTracking_Queries.js',
    'WOStatusTracking_Drilldown.js',
  ],
  requireRunSQL: false,
  sqlRows: (sql) => {
    if (/ROW_NUMBER\(\) OVER \(ORDER BY t\.trandate/.test(sql)) {
      return woRows ? woRows.map(r => Object.assign({}, r, { total_count: woRows.length })) : [];
    }
    return sqlRows(sql);
  },
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

const ONE = [{
  woid: '5001', wo_number: 'WOFSC00005001', item_id: '9', item_code: 'X',
  item_displayname: 'X', item_name: 'X', qty: 1, unit_name: 'KG', wo_date: '2026-09-02',
  location_id: '1', location_name: 'L', line_name: 'A', approval_status: '2',
  approval_status_name: 'Approved', back_order_qty: 0,
}];

function countTag(html, tag) {
  return (html.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length;
}

// ── 1. หัวตาราง/แถว ต้องมีจำนวนช่องเท่ากัน ──────────────────────────────
console.log('\n── หัวตารางตรงกับแถว (11 checkpoint + 4 คอลัมน์ข้อมูล) ──');
woRows = ONE;
const body = run({ action: 'search', dateFrom: '26/08/2026', dateTo: '01/09/2026' });
const thead = (body.match(/<thead>[\s\S]*?<\/thead>/) || [''])[0];
const firstRow = (body.match(/<tr class="wo"[\s\S]*?<\/tr>/) || [''])[0];
const headCells = countTag(thead, 'th');
const bodyCells = countTag(firstRow, 'td');
eq('มีหัวคอลัมน์ 15 (WO · สถานที่ · ไลน์ · 11 checkpoint · หมายเหตุ)', headCells, 15);
eq('แถวมี 15 ช่องเท่ากับหัว', bodyCells, headCells);

console.log('\n── คอลัมน์ที่ 11 (ต้นทุนมาตรฐาน) ต้องมีหัวของตัวเอง ──');
eq('มีหัวคอลัมน์ต้นทุนมาตรฐาน', body.indexOf('ต้นทุนมาตรฐาน') >= 0, true);

// ── 2. ปุ่มขยาย/ย่อทั้งหมด ─────────────────────────────────────────────
console.log('\n── ปุ่มขยาย/ย่อทั้งหมด ──');
eq('มีปุ่มเมื่อมีแถว', body.indexOf('id="btnExpandAll"') >= 0, true);
eq('ป้ายเริ่มต้นเป็น "ขยายทั้งหมด"', /id="btnExpandAll"[^>]*>ขยายทั้งหมด</.test(body), true);
eq('มีฟังก์ชัน toggleAllRows ฝั่ง client', /function toggleAllRows\(\)/.test(body), true);
eq('ผูกปุ่มตอน init', /bindExpandAll\(\);/.test(body), true);

woRows = null;
const empty = run({ action: 'search', dateFrom: '26/08/2026', dateTo: '01/09/2026' });
eq('ไม่มีแถว → ไม่มีปุ่ม', empty.indexOf('id="btnExpandAll"') < 0, true);
eq('ไม่มีแถว → มีข้อความไม่พบข้อมูล', /ไม่พบใบสั่งผลิตตามเงื่อนไขที่เลือก/.test(empty), true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
