/**
 * Harness — ตรวจชั้นความพร้อม master (buildReady) ด้วย fixture ที่ล้อข้อมูลจริงบน 9751184_SB1
 * ไม่แตะ NetSuite · stub N/query ให้คืนแถวตาม label ของ query
 *
 * เลข golden มาจาก BOM ของ 10010900101 (BOM 3720 · revision 1733 · batch 3,300 ขวด)
 * เทียบกับบรรทัด component บน WO-FSC-00000392 (สั่งผลิต 10,000 ขวด) ซึ่งอ่านจากระบบจริงแล้ว:
 *   21030200001 → 100 KG · 22050900036 → 209.09091 Pcs
 * สูตรที่ล็อกไว้คือ bomquantity ÷ batch qty × จำนวนที่จะผลิต
 *
 * รัน: node test/test_ready_master.js
 */
const H = require('./_harness');

// ── fixture ────────────────────────────────────────────────────────────────
// โครงที่ใช้ทดสอบ (ล้อของจริงแต่ย่อให้อ่านออก)
//
//   501 FG  10010900101      สั่งผลิต 10,000 ขวด · BOM 3720 rev 1733 batch 3,300
//     ├ 601 semi 23010100009  BOM 3721 rev 1801 batch 100 · routing ครบแต่ cost ref ขาด 1 WC
//     │   ├ 701 RM (ตัวเดียวกับชั้น 1 — ต้องรวมยอดข้ามกิ่ง)
//     │   └ 602 semi          revision ไม่ตั้ง batch qty · ไม่มี routing
//     │       └ 601 semi      BOM วนกลับ → ต้องหยุดไล่
//     ├ 701 RM 21030200001    33 KG/batch  → 100 KG      (golden)
//     ├ 702 RM 22050900036    69 Pcs/batch → 209.09091   (golden)
//     ├ 703 RM หน่วย BOM = G  3,300 G/batch → 10 KG      (ทดสอบแปลงหน่วย)
//     ├ 704 RM ของไม่พอ       6,600 Pcs/batch → 20,000 แต่มี 15,000
//     ├ 705 RM ของถูกจองไว้    3.3/batch → 10 มี 100 แต่พร้อมใช้ 5
//     └ 603 Assembly ไม่มี BOM  → ถือเป็นปลายทาง + เตือน
const BASE = {
  // ทางค้นด้วยรหัสสินค้า — BASE ค้นด้วยเลขที่ใบสั่งผลิต จึงไม่มีแถวทางนี้
  'สินค้าจากรหัส': [],
  'WO header': [
    { wo_id: 191254, wo_no: 'WO-FSC-00000392', wo_date: '7/8/2026', wo_date_iso: '2026-08-07',
      wo_status: 'Released', subsidiary: 'Foodstar Co., Ltd.', wo_type: 'Production' }
  ],
  'WO lines (BOM standard)': [
    { wo_id: 191254, mainline: 'T', item_id: 501, item_code: '10010900101',
      item_name: 'FG ส้ม 300 มล.', quantity: 10000, unit_name: 'BOTTLE', sub_id: 2, is_summary: 'F' },
    { wo_id: 191254, mainline: 'F', item_id: 601, item_code: '23010100009', quantity: -3.0303,
      unit_name: 'Bag', sub_id: 2, is_summary: 'F' },
    { wo_id: 191254, mainline: 'F', item_id: 701, item_code: '21030200001', quantity: -100,
      unit_name: 'KG', sub_id: 2, is_summary: 'F' },
    { wo_id: 191254, mainline: 'F', item_id: 702, item_code: '22050900036', quantity: -209.09091,
      unit_name: 'Pcs', sub_id: 2, is_summary: 'F' },
    { wo_id: 191254, mainline: 'F', item_id: 703, item_code: '22080900001', quantity: -10,
      unit_name: 'KG', sub_id: 2, is_summary: 'F' },
    { wo_id: 191254, mainline: 'F', item_id: 704, item_code: '22010900001', quantity: -20000,
      unit_name: 'Pcs', sub_id: 2, is_summary: 'F' },
    { wo_id: 191254, mainline: 'F', item_id: 705, item_code: '22070900001', quantity: -10,
      unit_name: 'Suit', sub_id: 2, is_summary: 'F' },
    // มีบนใบสั่งผลิตแต่ไม่อยู่ใน BOM ที่รายงานเลือก — ต้องรายงานว่าเกินมา ไม่ใช่เงียบ
    { wo_id: 191254, mainline: 'F', item_id: 999, item_code: '22999999999', quantity: -5,
      unit_name: 'Pcs', sub_id: 2, is_summary: 'F' },
    // ตัวเก็บยอดต้นทุน ไม่ใช่วัตถุดิบ ต้องถูกตัดออกทั้งฝั่ง BOM และฝั่งการยันยอด
    { wo_id: 191254, mainline: 'F', item_id: 99900000017, item_code: 'SUMMARYCOST',
      quantity: -1, unit_name: '', sub_id: 2, is_summary: 'T' }
  ],
  'คลังของใบสั่งผลิต': [{ loc_id: 10, loc_name: 'PD_B1' }],
  'รายการคลัง': [
    { loc_id: 10, loc_name: 'PD_B1', is_plant: 'T' },
    { loc_id: 23, loc_name: 'WRM-NP', is_plant: 'F' },
    { loc_id: 32, loc_name: 'RMRD', is_plant: 'T' }
  ],
  'อัตราแปลงหน่วย': [
    { uom_id: 10, units_type: 1, unit_name: 'G', conv_rate: 1, is_base: 'T' },
    { uom_id: 11, units_type: 1, unit_name: 'KG', conv_rate: 1000, is_base: 'F' },
    { uom_id: 20, units_type: 2, unit_name: 'Pcs', conv_rate: 1, is_base: 'T' }
  ],
  'BOM ที่ผูกกับสินค้า': [
    { item_id: 501, bom_id: 3720, bom_name: 'BOM น้ำส้ม300ml', cur_rev: 1733,
      master_default: 'F', def_loc: 10, def_loc_name: 'PD_B1',
      eff_start: '2026-07-01', eff_end: '2099-07-01', ab_inactive: 'No', bom_inactive: 'F' },
    // BOM ใบที่สองของสินค้าเดียวกัน default ของคลังอื่น — ต้องไม่ถูกเลือก
    { item_id: 501, bom_id: 3730, bom_name: 'BOM น้ำส้ม300ml (B3)', cur_rev: 1740,
      master_default: 'F', def_loc: 27, def_loc_name: 'PD_B3_F1',
      eff_start: '2026-07-01', eff_end: '2099-07-01', ab_inactive: 'No', bom_inactive: 'F' },
    { item_id: 601, bom_id: 3721, bom_name: 'BOM premixed', cur_rev: 1801,
      master_default: 'T', def_loc: null, def_loc_name: null,
      eff_start: '2026-01-01', eff_end: null, ab_inactive: 'No', bom_inactive: 'F' },
    { item_id: 602, bom_id: 3722, bom_name: 'BOM semi ไม่ตั้ง batch', cur_rev: 1802,
      master_default: 'T', def_loc: null, def_loc_name: null,
      eff_start: '2026-01-01', eff_end: null, ab_inactive: 'No', bom_inactive: 'F' },
    // BOM ใบที่สองของ 602 ไม่ได้เป็น default ของอะไรเลย — มีหลายใบแล้วต้องยืนยันว่าใบที่เลือกถูก
    { item_id: 602, bom_id: 3723, bom_name: 'BOM semi ใบสำรอง', cur_rev: 1803,
      master_default: 'F', def_loc: null, def_loc_name: null,
      eff_start: '2026-01-01', eff_end: null, ab_inactive: 'No', bom_inactive: 'F' }
    // 603 ไม่มีแถวเลย = Assembly ที่ยังไม่ผูก BOM
  ],
  'BOM revision + ช่วงผลบังคับ': [
    { rev_id: 1733, bom_id: 3720, rev_name: 'Rev น้ำส้ม300ml', eff_start: '2026-07-01',
      eff_end: '2099-07-01', rev_inactive: 'F', batch_qty: 3300 },
    { rev_id: 1740, bom_id: 3730, rev_name: 'Rev B3', eff_start: '2026-07-01',
      eff_end: '2099-07-01', rev_inactive: 'F', batch_qty: 3300 },
    { rev_id: 1801, bom_id: 3721, rev_name: 'Rev premixed', eff_start: '2026-01-01',
      eff_end: null, rev_inactive: 'F', batch_qty: 100 },
    { rev_id: 1802, bom_id: 3722, rev_name: 'Rev semi ไม่ตั้ง batch', eff_start: '2026-01-01',
      eff_end: null, rev_inactive: 'F', batch_qty: null }
  ],
  'component ใน revision': [
    // ชั้น 1 ของ FG
    { rev_id: 1733, line_id: 1, comp_item: 601, comp_code: '23010100009', comp_name: 'Premixed',
      comp_type: 'Assembly', comp_inactive: 'F', is_summary: 'F', bom_qty: 1, comp_yield: 1,
      item_source: 'STOCK', comp_unit_id: 30, comp_unit_name: 'Bag',
      stock_unit_id: 30, stock_unit_name: 'Bag' },
    { rev_id: 1733, line_id: 2, comp_item: 701, comp_code: '21030200001', comp_name: 'น้ำเชื่อม',
      comp_type: 'InvtPart', comp_inactive: 'F', is_summary: 'F', bom_qty: 33, comp_yield: 1,
      item_source: 'STOCK', comp_unit_id: 11, comp_unit_name: 'KG',
      stock_unit_id: 11, stock_unit_name: 'KG' },
    { rev_id: 1733, line_id: 3, comp_item: 702, comp_code: '22050900036', comp_name: 'ฝา',
      comp_type: 'InvtPart', comp_inactive: 'F', is_summary: 'F', bom_qty: 69, comp_yield: 1,
      item_source: 'STOCK', comp_unit_id: 20, comp_unit_name: 'Pcs',
      stock_unit_id: 20, stock_unit_name: 'Pcs' },
    // หน่วยใน BOM เป็น G ขณะสต๊อกเป็น KG — เคสที่เจอจริงในบัญชีนี้
    { rev_id: 1733, line_id: 4, comp_item: 703, comp_code: '22080900001', comp_name: 'กาว',
      comp_type: 'InvtPart', comp_inactive: 'F', is_summary: 'F', bom_qty: 3300, comp_yield: 1,
      item_source: 'STOCK', comp_unit_id: 10, comp_unit_name: 'G',
      stock_unit_id: 11, stock_unit_name: 'KG' },
    { rev_id: 1733, line_id: 5, comp_item: 704, comp_code: '22010900001', comp_name: 'ขวด',
      comp_type: 'InvtPart', comp_inactive: 'F', is_summary: 'F', bom_qty: 6600, comp_yield: 1,
      item_source: 'STOCK', comp_unit_id: 20, comp_unit_name: 'Pcs',
      stock_unit_id: 20, stock_unit_name: 'Pcs' },
    { rev_id: 1733, line_id: 6, comp_item: 705, comp_code: '22070900001', comp_name: 'กล่อง',
      comp_type: 'InvtPart', comp_inactive: 'F', is_summary: 'F', bom_qty: 3.3, comp_yield: 1,
      item_source: 'STOCK', comp_unit_id: 20, comp_unit_name: 'Suit',
      stock_unit_id: 20, stock_unit_name: 'Suit' },
    { rev_id: 1733, line_id: 7, comp_item: 603, comp_code: '23099900001', comp_name: 'Semi ไม่มี BOM',
      comp_type: 'Assembly', comp_inactive: 'F', is_summary: 'F', bom_qty: 1, comp_yield: 1,
      item_source: 'STOCK', comp_unit_id: 30, comp_unit_name: 'Bag',
      stock_unit_id: 30, stock_unit_name: 'Bag' },
    // บรรทัด summary cost item ต้องถูกตัดออก ไม่ใช่วัตถุดิบ
    { rev_id: 1733, line_id: 8, comp_item: 99900000017, comp_code: 'SUMMARYCOST',
      comp_name: 'Summary cost', comp_type: 'NonInvtPart', comp_inactive: 'F', is_summary: 'T',
      bom_qty: 1, comp_yield: 1, item_source: 'STOCK', comp_unit_id: 20,
      comp_unit_name: 'Pcs', stock_unit_id: 20, stock_unit_name: 'Pcs' },
    // ชั้น 2 (BOM ของ 601 · batch 100 Bag)
    { rev_id: 1801, line_id: 1, comp_item: 701, comp_code: '21030200001', comp_name: 'น้ำเชื่อม',
      comp_type: 'InvtPart', comp_inactive: 'F', is_summary: 'F', bom_qty: 10, comp_yield: 1,
      item_source: 'STOCK', comp_unit_id: 11, comp_unit_name: 'KG',
      stock_unit_id: 11, stock_unit_name: 'KG' },
    { rev_id: 1801, line_id: 2, comp_item: 602, comp_code: '23020100004', comp_name: 'Semi ชั้นสาม',
      comp_type: 'Assembly', comp_inactive: 'F', is_summary: 'F', bom_qty: 1, comp_yield: 1,
      item_source: 'STOCK', comp_unit_id: 30, comp_unit_name: 'Bag',
      stock_unit_id: 30, stock_unit_name: 'Bag' },
    // ชั้น 3 (BOM ของ 602) วนกลับไปที่ 601
    { rev_id: 1802, line_id: 1, comp_item: 601, comp_code: '23010100009', comp_name: 'Premixed',
      comp_type: 'Assembly', comp_inactive: 'F', is_summary: 'F', bom_qty: 2, comp_yield: 1,
      item_source: 'STOCK', comp_unit_id: 30, comp_unit_name: 'Bag',
      stock_unit_id: 30, stock_unit_name: 'Bag' }
  ],
  'Manufacturing routing': [
    { routing_id: 614, routing_name: 'RT_น้ำส้ม300ml', bom_id: 3720, is_default: 'F',
      loc_id: 10, loc_name: 'PD_B1', sub_id: 2, r_inactive: 'F' },
    // routing ของ semi อยู่คลัง RMRD ขณะ FG ผลิตที่ PD_B1 — ถูกต้องตามการตั้งค่า
    // เพราะ semi ถูกผลิตด้วยใบสั่งผลิตของตัวเองที่คลังของตัวเอง (เคสจริงบน SB1)
    { routing_id: 700, routing_name: 'RT_premixed', bom_id: 3721, is_default: 'F',
      loc_id: 32, loc_name: 'RMRD', sub_id: 2, r_inactive: 'F' }
    // BOM 3722 ไม่มี routing เลย
  ],
  'ขั้นตอนของ routing': [
    { routing_id: 614, seq: 1, op_name: 'Mixing', wc_id: 1490, run_rate: 0, setup_time: 0, cost_template: 1 },
    { routing_id: 614, seq: 2, op_name: 'Filling', wc_id: 1491, run_rate: 0, setup_time: 0, cost_template: 1 },
    { routing_id: 614, seq: 3, op_name: 'Packing', wc_id: 1492, run_rate: 0, setup_time: 0, cost_template: 1 },
    { routing_id: 700, seq: 1, op_name: 'RD Mixing', wc_id: 1494, run_rate: 0, setup_time: 0, cost_template: 1 },
    { routing_id: 700, seq: 2, op_name: 'RD Packing', wc_id: 1495, run_rate: 0, setup_time: 0, cost_template: 1 }
  ],
  'Work center': [
    { wc_id: 1490, wc_name: 'Mixing_PD_B1', is_wc: 'T', wc_inactive: 'F', sub_id: 2, wc_loc: 10, wc_loc_name: 'PD_B1' },
    { wc_id: 1491, wc_name: 'Filling_PD_B1', is_wc: 'T', wc_inactive: 'F', sub_id: 2, wc_loc: 10, wc_loc_name: 'PD_B1' },
    { wc_id: 1492, wc_name: 'Packing_PD_B1', is_wc: 'T', wc_inactive: 'F', sub_id: 2, wc_loc: 10, wc_loc_name: 'PD_B1' },
    // work center ของ semi ผูกคลัง RMRD ให้ตรงกับ routing ของมัน (ข้อมูลจริงบน SB1 ตรงกันทั้ง 12 ขั้นตอน)
    { wc_id: 1494, wc_name: 'RD Mixing_RMRD', is_wc: 'T', wc_inactive: 'F', sub_id: 2, wc_loc: 32, wc_loc_name: 'RMRD' },
    { wc_id: 1495, wc_name: 'RD Packing_RMRD', is_wc: 'T', wc_inactive: 'F', sub_id: 2, wc_loc: 32, wc_loc_name: 'RMRD' }
  ],
  'Cost ref ของสินค้าที่ผลิต': [
    { cr_id: 14, item_id: 501, wc_id: 1490, cr_option: 2, ref_qty: 48, c_labor: 0.95,
      setup_id: 1, sub_id: 2, start_iso: '2026-01-01', end_iso: '2026-12-31' },
    { cr_id: 15, item_id: 501, wc_id: 1491, cr_option: 2, ref_qty: 48, c_labor: 0.95,
      setup_id: 1, sub_id: 2, start_iso: '2026-01-01', end_iso: '2026-12-31' },
    { cr_id: 16, item_id: 501, wc_id: 1492, cr_option: 2, ref_qty: 48, c_labor: 0.95,
      setup_id: 1, sub_id: 2, start_iso: '2026-01-01', end_iso: '2026-12-31' },
    // 601 ตั้งไว้แค่ work center เดียวจากสองขั้นตอน → ขาด
    { cr_id: 17, item_id: 601, wc_id: 1494, cr_option: 2, ref_qty: 1, c_labor: 0,
      setup_id: 1, sub_id: 2, start_iso: '2026-01-01', end_iso: '2026-12-31' },
    // แถวปีที่แล้วของ 501 — ต้องไม่ถูกนับ (ช่วงวันที่ไม่ครอบ)
    { cr_id: 99, item_id: 501, wc_id: 1495, cr_option: 2, ref_qty: 48, c_labor: 9.99,
      setup_id: 2, sub_id: 2, start_iso: '2025-01-01', end_iso: '2025-12-31' }
  ],
  'ยอดคงเหลือรายคลัง': [
    { item_id: 701, loc_id: 10, loc_name: 'PD_B1', on_hand: 60, avail: 60, committed: 0 },
    { item_id: 701, loc_id: 23, loc_name: 'WRM-NP', on_hand: 50, avail: 50, committed: 0 },
    { item_id: 702, loc_id: 10, loc_name: 'PD_B1', on_hand: 300, avail: 300, committed: 0 },
    { item_id: 703, loc_id: 10, loc_name: 'PD_B1', on_hand: 5, avail: 5, committed: 0 },
    { item_id: 704, loc_id: 10, loc_name: 'PD_B1', on_hand: 15000, avail: 15000, committed: 0 },
    // ของมีพอแต่ถูกจองไว้เกือบหมด — ต้องเป็นข้อสังเกต ไม่ใช่ของขาด
    { item_id: 705, loc_id: 10, loc_name: 'PD_B1', on_hand: 100, avail: 5, committed: 95 }
    // 603 ไม่มีของเลย
  ]
};

// fixture ตั้งต้น — ซีนทดสอบด้านล่างเขียนทับตัวแปรนี้ harness อ่านผ่าน getter
let FX = BASE;

// ── โหลด module ด้วย harness (stub · label hook · เปิดฟังก์ชันก์ภายใน) ──
// ก้อน E2 (#14) ย้ายชั้นนี้ไปเป็น lib ของตัวเอง
// entry เรียกมันผ่าน interface แค่ 4 ตัว จึงต้องเปิดฟังก์ชันภายในที่ lib ไม่ใช่ที่ entry
const READY_LIB = 'WOCostTrace_Ready.js';
const T = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', READY_LIB],
  fixtures: () => FX,
  quietLog: true,
  libExports: {
    [READY_LIB]: ['buildReady', 'readReadyParams', 'renderReadyPage', 'bomVerdictText',
      'revVerdictText', 'routingVerdictText', 'costRefVerdictText', 'stockVerdictText',
      'compVerdictText']
  }
}).libT[READY_LIB];


// ── ตัวช่วยเทียบผล ──────────────────────────────────────────────────────────
const eq = H.makeEq({ tol: 1e-9, json: true });
function run(params) {
  const rp = T.readReadyParams(Object.assign({ ready: 'WO-FSC-00000392' }, params || {}));
  const rd = T.buildReady(rp);
  rd.params = rp;
  rd.woKey = rp.woKey;
  return rd;
}
function run2(key, params) {
  const rp = T.readReadyParams(Object.assign({ ready: key }, params || {}));
  const rd = T.buildReady(rp);
  rd.params = rp;
  rd.woKey = rp.woKey;
  return rd;
}
function node(rd, itemId, depth) {
  return rd.nodes.filter(n => n.item_id === String(itemId)
    && (depth == null || n.depth === depth))[0];
}
function need(rd, itemId) {
  const r = rd.need_rows.filter(x => x.item_id === String(itemId))[0];
  return r ? r.need : null;
}

// ── รอบที่ 1: ข้อมูลครบ ─────────────────────────────────────────────────────
const rd = run({ rloc: '10,23' });

console.log('\n── ปริมาณที่ต้องใช้ = bomquantity ÷ batch qty × จำนวนที่จะผลิต ──');
eq('อ่านจำนวนจากใบสั่งผลิต', rd.root_qty, 10000);
eq('21030200001 ชั้น 1 ตรงกับ WO จริง', node(rd, 701, 1).need, 100);
eq('22050900036 ชั้น 1 ตรงกับ WO จริง', node(rd, 702, 1).need, 209.09090909090909, 1e-9);
eq('semi ชั้น 1', node(rd, 601, 1).need, 3.0303030303030303, 1e-12);
eq('ชั้น 2 คิดต่อจากปริมาณของแม่', node(rd, 701, 2).need, 0.30303030303030304, 1e-12);
eq('รวมยอดสินค้าเดียวกันข้ามกิ่ง', need(rd, 701), 100.30303030303031, 1e-9);

console.log('\n── แปลงหน่วยจาก BOM ไปหน่วยสต๊อกก่อนเทียบของ ──');
eq('3,300 G ต่อ batch → 10 KG', node(rd, 703, 1).need, 10, 1e-12);
eq('เก็บยอดหน่วย BOM ไว้ให้ตรวจ', node(rd, 703, 1).need_bom_unit, 10000, 1e-9);
eq('หน่วยที่ใช้เทียบสต๊อกเป็นหน่วยสต๊อก', node(rd, 703, 1).unit_name, 'KG');

console.log('\n── ตัดบรรทัดตัวเก็บยอดต้นทุนออก ──');
eq('summary cost item ไม่อยู่ในต้นไม้', node(rd, 99900000017) == null, true);

console.log('\n── BOM วนซ้ำต้องหยุด ไม่ใช่ไล่ไม่จบ ──');
const cyc = rd.nodes.filter(n => n.cycle);
eq('เจอจุดวนซ้ำ 1 จุด', cyc.length, 1);
eq('จุดที่วนคือสินค้าเดิม', cyc[0].item_id, '601');
eq('ไม่นับซ้ำเข้าไปในของที่ต้องมีในคลัง', need(rd, 601), null);

console.log('\n── revision ที่ไม่ตั้งขนาด batch ต้องเตือน ไม่ใช่หารด้วยศูนย์ ──');
const n602 = node(rd, 602, 2);
eq('มีคำเตือนเรื่อง batch', n602.notes.some(t => t.text.indexOf('ขนาด batch') >= 0), true);
eq('ยอดยังคิดได้ (อ่านเป็นต่อหน่วย)', n602.need, 0.030303030303030304, 1e-12);

console.log('\n── เลือก BOM ตาม default ของคลังที่ผลิต (M-02) ──');
eq('เลือกจาก default ของคลัง', rd.nodes[0].bom.verdict, 'loc');
eq('เลือก BOM ใบที่ตรงคลัง', String(rd.nodes[0].bom.bom.bom_id), '3720');
eq('ผลตรวจเป็นผ่าน', T.bomVerdictText(rd.nodes[0]).cls, 'ok');
// semi ไม่ได้ผลิตที่คลังของ FG จึงห้ามเอาคลังของ FG ไปตัดสิน — มี BOM ใบเดียวคือไม่มีอะไรให้เลือกผิด
eq('semi ที่มี BOM ใบเดียว = ผ่าน ไม่ใช่ข้อสังเกต', T.bomVerdictText(node(rd, 601, 1)).cls, 'ok');
eq('มี BOM หลายใบแล้วเลือกจาก master default = ข้อสังเกต',
  T.bomVerdictText(node(rd, 602, 2)).cls, 'warn');
eq('บอกจำนวนใบที่มี',
  T.bomVerdictText(node(rd, 602, 2)).text.indexOf('มี BOM 2 ใบ') >= 0, true);
eq('Assembly ที่ยังไม่ผูก BOM = ต้องแก้', T.bomVerdictText(node(rd, 603, 1)).cls, 'bad');
eq('บอกด้วยว่ายังไม่ผูก BOM',
  T.bomVerdictText(node(rd, 603, 1)).text.indexOf('ยังไม่ผูก BOM') >= 0, true);
eq('RM ไม่ต้องมี BOM', T.bomVerdictText(node(rd, 701, 1)).cls, 'info');

console.log('\n── revision + component (M-03/M-04) ──');
eq('revision มีผลบังคับ', T.revVerdictText(rd.nodes[0]).cls, 'ok');
eq('บอกช่วงวันที่ให้ตรวจได้',
  T.revVerdictText(rd.nodes[0]).text.indexOf('2026-07-01') >= 0, true);
eq('นับ component ที่ตัด summary cost แล้ว', T.compVerdictText(rd.nodes[0]).text, '7 รายการ');

console.log('\n── routing + work center (M-05/M-06) ──');
eq('routing ของคลังนี้ผ่าน', T.routingVerdictText(rd.nodes[0]).cls, 'ok');
eq('ไล่ลำดับ operation ให้เห็น พร้อมคลังที่ routing ผูกไว้',
  T.routingVerdictText(rd.nodes[0]).text, 'Mixing → Filling → Packing @PD_B1');
eq('semi ที่ไม่มี routing เลย = ต้องแก้', T.routingVerdictText(n602).cls, 'bad');
eq('บอกว่ายังไม่ตั้ง routing',
  T.routingVerdictText(n602).text.indexOf('ยังไม่ตั้ง routing') >= 0, true);
// routing ของ semi อยู่คลังอื่น (RMRD) = ถูกต้อง ไม่ใช่ปัญหา — เอาคลังของ FG ไปตัดสินคือ false positive
eq('routing ของ semi อยู่คลังตัวเอง = ผ่าน', T.routingVerdictText(node(rd, 601, 1)).cls, 'ok');
eq('บอกคลังของ routing ไว้เป็นข้อเท็จจริง',
  T.routingVerdictText(node(rd, 601, 1)).text.indexOf('@RMRD') >= 0, true);

console.log('\n── work center ที่ผูกคลังคนละคลังกับ routing = การตั้งค่าที่ขัดกันเอง (M-06) ──');
// ข้อมูลจริงบน SB1 ตรงกันทั้ง 12 ขั้นตอน เช็คนี้จึงไม่ใช่ noise
FX = Object.assign({}, BASE, {
  'Work center': BASE['Work center'].map(w =>
    w.wc_id === 1494 ? Object.assign({}, w, { wc_loc: 10, wc_loc_name: 'PD_B1' }) : w)
});
const rdw = run({ rloc: '10' });
eq('ขึ้นข้อสังเกต', T.routingVerdictText(node(rdw, 601, 1)).cls, 'warn');
eq('บอกชื่อ work center และคลังที่ขัดกัน',
  T.routingVerdictText(node(rdw, 601, 1)).text.indexOf('RD Mixing_RMRD (PD_B1)') >= 0, true);
FX = BASE;

console.log('\n── Cost ref ต้องครบทุก work center ที่ routing ใช้ (M-09) ──');
eq('FG ครบทั้ง 3 work center', T.costRefVerdictText(rd.nodes[0]).cls, 'ok');
eq('อ้างเลข Cost ref ให้ตามไปดู',
  T.costRefVerdictText(rd.nodes[0]).text.indexOf('14, 15, 16') >= 0, true);
eq('ไม่จับคู่แถวที่ช่วงวันที่ไม่ครอบ',
  T.costRefVerdictText(rd.nodes[0]).text.indexOf('99') >= 0, false);
const n601 = node(rd, 601, 1);
eq('semi ขาด cost ref 1 จาก 2 WC', T.costRefVerdictText(n601).cls, 'bad');
eq('บอกจำนวนที่ขาด', T.costRefVerdictText(n601).text.indexOf('ขาด Cost ref 1 จาก 2') >= 0, true);
eq('ไม่มี routing = ตรวจ cost ref ไม่ได้ ไม่ใช่ไม่มี', T.costRefVerdictText(n602).cls, 'unk');

console.log('\n── ของที่ต้องมีในคลัง ──');
eq('ของพอ (รวมสองคลัง)', T.stockVerdictText(node(rd, 701, 1), rd).cls, 'ok');
const short703 = rd.need_rows.filter(r => r.item_id === '703')[0];
eq('ของขาด = ต้องแก้', T.stockVerdictText(node(rd, 703, 1), rd).cls, 'bad');
eq('บอกยอดที่ขาด', short703.short, 5, 1e-12);
eq('ของขาดของขวด', rd.need_rows.filter(r => r.item_id === '704')[0].short, 5000, 1e-9);
eq('ของถูกจองไว้ = ข้อสังเกต ไม่ใช่ของขาด', T.stockVerdictText(node(rd, 705, 1), rd).cls, 'warn');
eq('ไม่มีของเลย = ขาดเต็มจำนวน',
  rd.need_rows.filter(r => r.item_id === '603')[0].short, 3.0303030303030303, 1e-12);
eq('นับเฉพาะคลังที่เลือก', rd.stock_locs.join(','), '10,23');

console.log('\n── ยันยอดชั้นที่ 1 กับบรรทัดบนใบสั่งผลิต ──');
const chk701 = rd.wo_check.filter(c => c.item_id === '701')[0];
eq('ยอดตรงกับบรรทัดบน WO', chk701.match, true);
eq('ยอมรับการปัดเศษของ WO (3.0303 vs 3.030303)',
  rd.wo_check.filter(c => c.item_id === '601')[0].match, true);
eq('ไม่มีบรรทัดบน WO ต้องรายงาน',
  rd.wo_check.filter(c => c.item_id === '603')[0].missing, true);
eq('รายการที่มีบน WO แต่ไม่อยู่ใน BOM', rd.wo_extra.length, 1);
eq('ไม่นับ summary cost เป็นรายการเกิน', rd.wo_extra[0].item_id, '999');

console.log('\n── หน้ารายงานประกอบได้ ไม่ใช่แค่ตัวเลข ──');
const html = T.renderReadyPage(rd);
eq('มีตารางสายการผลิต', html.indexOf('สายการผลิตตามชั้น BOM') >= 0, true);
eq('มีรายการงานที่ต้องเคลียร์', html.indexOf('ต้องเคลียร์ก่อนเริ่มทดสอบ') >= 0, true);
eq('คำตัดสินรวมเป็นยังไม่พร้อม', html.indexOf('ยังไม่พร้อม') >= 0, true);

// ── รอบที่ 2: query พัง ต้องไม่กลายเป็น "ยังไม่ตั้งค่า" ─────────────────────
console.log('\n── query พัง = "อ่านไม่สำเร็จ" ไม่ใช่ "ยังไม่ตั้งค่า" ──');
FX = Object.assign({}, BASE, {
  'Manufacturing routing': 'THROW',
  'Cost ref ของสินค้าที่ผลิต': 'THROW',
  'ยอดคงเหลือรายคลัง': 'THROW'
});
const rd2 = run({ rloc: '10' });
eq('routing = อ่านไม่สำเร็จ', T.routingVerdictText(rd2.nodes[0]).cls, 'unk');
eq('cost ref = อ่านไม่สำเร็จ', T.costRefVerdictText(rd2.nodes[0]).cls, 'unk');
eq('สต๊อก = อ่านไม่สำเร็จ', T.stockVerdictText(node(rd2, 701, 1), rd2).cls, 'unk');
eq('ไม่มีช่องไหนถูกสรุปว่าไม่มีของ',
  rd2.need_rows.every(r => r.short === 0 || r.on_hand === 0), true);
eq('BOM ยังอ่านได้ปกติ', T.bomVerdictText(rd2.nodes[0]).cls, 'ok');

console.log('\n── โครง BOM อ่านไม่ได้ทั้งก้อน ──');
FX = Object.assign({}, BASE, { 'BOM ที่ผูกกับสินค้า': 'THROW' });
const rd3 = run({});
eq('BOM = อ่านไม่สำเร็จ', T.bomVerdictText(rd3.nodes[0]).cls, 'unk');
eq('ไม่สรุปว่ายังไม่ผูก BOM',
  T.bomVerdictText(rd3.nodes[0]).text.indexOf('ยังไม่ผูก') >= 0, false);
eq('ติดธงไว้ที่ผลรวม', rd3.struct_failed, true);

// ── ทางเข้าด้วยรหัสสินค้า: วันตั้ง master ยังไม่มีใบสั่งผลิตให้อ้าง ──
// D1 ของ UAT (2026-08-10) ต้องตรวจ master ให้จบ แต่ WO ถูกเปิดวัน D2
function itemFx(itemRow, more) {
  return Object.assign({}, BASE, { 'WO header': [], 'สินค้าจากรหัส': [itemRow] }, more || {});
}
const FG_ROW = { item_id: 501, item_code: '10010900101', item_name: 'FG ส้ม 300 มล.',
  item_type: 'Assembly', item_inactive: 'F', stock_unit_id: 40, stock_unit_name: 'BOTTLE' };

console.log('\n── ทางเข้าด้วยรหัสสินค้า (ยังไม่มีใบสั่งผลิต) ──');
FX = itemFx(FG_ROW);
const rdi = run2('10010900101', { rloc: '10,23' });
eq('ตรวจได้แม้ไม่มีใบสั่งผลิต', rdi.ok, true);
eq('รู้ว่ามาทางรหัสสินค้า', rdi.basis, 'item');
eq('ใช้ขนาด batch ของ revision เป็นฐาน', rdi.root_qty, 3300);
eq('บอกฐานที่ใช้', rdi.qty_basis, 'batch');
eq('คลังแรกที่เลือกถูกใช้เป็นคลังผลิต', rdi.loc_id, '10');
eq('เลือก BOM ตาม default ของคลังนั้นได้', rdi.nodes[0].bom.verdict, 'loc');
eq('ปริมาณคิดจากฐาน batch (33 KG ต่อ batch 3,300)',
  rdi.nodes.filter(n => n.item_id === '701' && n.depth === 1)[0].need, 33, 1e-12);
eq('ไม่ยันยอดกับใบสั่งผลิต', rdi.wo_check.length, 0);
const htmlI = T.renderReadyPage(rdi);
eq('บอกบนหน้าว่ายังไม่มีใบให้เทียบ', htmlI.indexOf('ยังไม่มีใบสั่งผลิตให้เทียบ') >= 0, true);
eq('บอกฐานจำนวนบนหน้า', htmlI.indexOf('ขนาด batch ของ revision') >= 0, true);

console.log('\n── กรอกจำนวนเองทับฐานได้ ──');
const rdi2 = run2('10010900101', { rloc: '10', rqty: '6600' });
eq('ใช้จำนวนที่กรอก', rdi2.root_qty, 6600);
eq('บอกว่ากรอกเอง', rdi2.qty_basis, 'manual');
eq('ปริมาณสองเท่าของ batch',
  rdi2.nodes.filter(n => n.item_id === '701' && n.depth === 1)[0].need, 66, 1e-12);

console.log('\n── ทางรหัสสินค้าที่ไม่เลือกคลัง ต้องไม่สรุปว่าพร้อม ──');
const rdi3 = run2('10010900101', {});
eq('ไม่มีคลังให้ตัดสิน', rdi3.loc_id, '');
// FG มี BOM 2 ใบที่เป็น default ของคนละคลัง ไม่มีใบไหน master default
// ไม่รู้คลังก็เลือกไม่ได้จริง จึงต้องเป็น ambiguous ไม่ใช่หยิบใบแรกมาใช้
eq('เลือก BOM ไม่ได้เมื่อไม่รู้คลัง', rdi3.nodes[0].bom.verdict, 'ambiguous');
eq('ผลตรวจ BOM เป็นต้องแก้', T.bomVerdictText(rdi3.nodes[0]).cls, 'bad');
const htmlI3 = T.renderReadyPage(rdi3);
eq('ติดป้ายบอกว่ายังไม่เลือกคลัง', htmlI3.indexOf('ยังไม่เลือกคลัง') >= 0, true);
eq('หัวตารางบอกว่าข้ามการตรวจตามคลัง',
  htmlI3.indexOf('ข้ามการตรวจ BOM/routing ตามคลัง') >= 0, true);

// กิ่งที่ทุกช่องผ่านหมด แต่ไม่ได้เลือกคลัง ต้องยังเป็น "ตรวจไม่ครบ" ไม่ใช่ "พร้อม"
FX = itemFx({ item_id: 601, item_code: '23010100009', item_name: 'Premixed',
  item_type: 'Assembly', item_inactive: 'F', stock_unit_id: 30, stock_unit_name: 'Bag' }, {
  'component ใน revision': BASE['component ใน revision'].filter(c =>
    !(c.rev_id === 1801 && c.comp_item === 602)),
  'Cost ref ของสินค้าที่ผลิต': BASE['Cost ref ของสินค้าที่ผลิต'].concat([
    { cr_id: 18, item_id: 601, wc_id: 1495, cr_option: 2, ref_qty: 1, c_labor: 0,
      setup_id: 1, sub_id: 2, start_iso: '2026-01-01', end_iso: '2026-12-31' }
  ]),
  'ยอดคงเหลือรายคลัง': [
    { item_id: 701, loc_id: 10, loc_name: 'PD_B1', on_hand: 99999, avail: 99999, committed: 0 }
  ]
});
const rdi4 = run2('23010100009', {});
eq('ทุกช่องผ่าน', T.bomVerdictText(rdi4.nodes[0]).cls, 'ok');
eq('คำตัดสินรวมเป็น "ตรวจไม่ครบ" เพราะไม่รู้คลังผลิต',
  T.renderReadyPage(rdi4).indexOf('ตรวจไม่ครบ') >= 0, true);

console.log('\n── ใส่รหัสวัตถุดิบที่ไม่ได้ผลิตเอง ──');
FX = itemFx({ item_id: 701, item_code: '21030200001', item_name: 'น้ำเชื่อม',
  item_type: 'InvtPart', item_inactive: 'F', stock_unit_id: 11, stock_unit_name: 'KG' });
const rdr = run2('21030200001', { rloc: '10' });
eq('ไม่ขึ้นว่ายังไม่ผูก BOM', T.bomVerdictText(rdr.nodes[0]).cls, 'info');
eq('ยังเทียบยอดคงเหลือให้', rdr.need_rows.length, 1);

console.log('\n── หาไม่เจอทั้งใบสั่งผลิตและรหัสสินค้า ──');
FX = Object.assign({}, BASE, { 'WO header': [], 'สินค้าจากรหัส': [] });
const rdx = T.buildReady(T.readReadyParams({ ready: 'ไม่มีจริง' }));
eq('บอกว่าหาไม่เจอทั้งสองแบบ', rdx.error.indexOf('ไม่พบทั้งใบสั่งผลิตและรหัสสินค้า') >= 0, true);

FX = BASE;

console.log('\n── สินค้าที่ใบสั่งผลิตนี้ผลิตเอง ต้องมี routing ของคลังนั้นจริง ──');
FX = Object.assign({}, BASE, {
  'Manufacturing routing': BASE['Manufacturing routing'].map(r =>
    r.routing_id === 614 ? Object.assign({}, r, { loc_id: 27, loc_name: 'PD_B3_F1' }) : r)
});
const rd5 = run({});
eq('routing อยู่คลังอื่น = ต้องแก้', T.routingVerdictText(rd5.nodes[0]).cls, 'bad');
eq('บอกว่า routing อยู่คลังไหน',
  T.routingVerdictText(rd5.nodes[0]).text.indexOf('PD_B3_F1') >= 0, true);
eq('cost ref ตรวจไม่ได้เพราะยังไม่รู้ work center',
  T.costRefVerdictText(rd5.nodes[0]).cls, 'unk');

console.log('\n── ไม่พบใบสั่งผลิต ──');
FX = Object.assign({}, BASE, { 'WO header': [] });
const rd4 = run({});
eq('บอกว่าไม่พบ', rd4.ok, false);
eq('ยังมีตัวเลือกคลังให้แก้ต่อ', rd4.locations.length, 3);

console.log(H.fails() ? '\n' + H.fails() + ' รายการไม่ผ่าน\n' : '\nผ่านทั้งหมด\n');
process.exit(H.fails() ? 1 : 0);
