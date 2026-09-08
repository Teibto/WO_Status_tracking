/**
 * fixtures_parity.js — ข้อเท็จจริงระดับบรรทัดชุดเดียว ป้อนได้ทั้งชั้นเจาะลึกและชั้นภาพรวม
 *
 * เหตุที่ต้องมีไฟล์นี้: โค้ดล็อกกติกาไว้ว่า "ชั้นภาพรวมต้องได้ยอดเท่าชั้นเจาะลึกทุกหลัก"
 * (`WOCostTrace.js` comment ที่ `:613-624`) แต่สองชั้นยิง query คนละชุดคนละ grain —
 * ถ้าเขียน fixture แยกกันสองชุด วันหนึ่งมันจะ drift แล้วเทสจะบอกว่า "เท่ากัน" ทั้งที่โค้ดพัง
 *
 * วิธีที่ใช้ที่นี่: เก็บ**บรรทัดเอกสารจริง**ไว้ชุดเดียว แล้วรวมยอดให้ชั้นภาพรวมด้วยกฎเดียวกับ SQL
 *   rm_cost    = SUM(ABS(foreignamount)) ของบรรทัดที่ไม่ใช่ summary cost
 *   sc_value   = SUM(ABS(foreignamount)) ของบรรทัด summary cost
 *   dl_oh_*    = SUM(standardcost/actualcost) โดยตัดบัญชี WIP (ฝั่ง SQL ตัดด้วย
 *                `custrecord_mfg_acc_dl_oh <> 1` · ฝั่ง JS ตัดด้วย `cost_class = CLASS_WIP`)
 *   woc_qty    = SUM(fg_qty) ของใบปิดงานทุกใบ
 * ตัวเลขที่ใช้เป็นชุดที่ verify กับ WOFSC00000470 บน SB1 แล้ว (ดู WO_COST_TRACE.md)
 * เพื่อให้ค่าที่คาดหวังอ่านออกว่ามาจากไหน ไม่ใช่เลขสุ่ม
 */

const CLASS_WIP = 1;           // ต้องตรงกับ CLASS_WIP ใน WOCostTrace.js
const WO_ID = 9001;
const FG_ITEM = 701;

const WO_HEADER = {
  wo_id: WO_ID, wo_no: 'WOFSC00000900', wo_date: '23/7/2026', wo_date_iso: '2026-07-23',
  wo_status: 'Released', subsidiary: 'Foodstar', wo_type: 'Production',
  production_line: 'LINE1', backorder_qty: 0
};

// บรรทัดสินค้าบนใบสั่งผลิต — mainline='T' คือของที่จะผลิต
const WO_LINES = [
  { wo_id: WO_ID, mainline: 'T', item_id: FG_ITEM, item_code: '11010900010',
    item_name: 'FG ส้ม 300 มล.', is_phantom: 'F', is_summary: 'F',
    quantity: 163000, unit_name: 'BOTTLE', sub_id: 2 },
  { wo_id: WO_ID, mainline: 'F', item_id: 801, item_code: '21030200001',
    item_name: 'น้ำเชื่อม', is_phantom: 'F', is_summary: 'F',
    quantity: -50000, unit_name: 'KG', sub_id: 2 },
  { wo_id: WO_ID, mainline: 'F', item_id: 802, item_code: '23010100009',
    item_name: 'Premixed', is_phantom: 'F', is_summary: 'F',
    quantity: -49, unit_name: 'BAG', sub_id: 2 },
  // summary cost item บนใบสั่งผลิต — เป็นตัวเก็บยอด ไม่ใช่วัตถุดิบ ต้องถูกตัดทั้งสองชั้น
  { wo_id: WO_ID, mainline: 'F', item_id: 999, item_code: 'SUMMARYCOST',
    item_name: 'MFG Summary Cost Item', is_phantom: 'F', is_summary: 'T',
    quantity: -1, unit_name: 'UNIT', sub_id: 2 }
];

// ใบเบิกวัตถุดิบเข้า WO — รวมบรรทัด summary cost ไว้ในชุดเดียวกันเหมือนของจริง
// (query เดียวคืนทั้งสองบทบาท แล้วโค้ดแยกด้วย adj_summarycost / is_summary)
const ISSUE_LINES = [
  { wo_id: WO_ID, tran_id: 5001, recordtype: 'inventoryadjustment', doc_no: 'IA-FSC-260700198',
    trandate: '25/7/2026', trandate_iso: '2026-07-25', line_id: 1,
    adj_type: 'Raw Material', adj_summarycost: 'F', adj_rawmaterial: 'T', adj_issuedsupply: 'F',
    item_id: 801, item_code: '21030200001', item_name: 'น้ำเชื่อม', item_type: 'InvtPart',
    is_summary: 'F', quantity: -50000, unit_name: 'KG', rate: 4.0000174,
    amount: -200000.87, location_name: 'PD_B1', task_id: null, woc_id: null },
  { wo_id: WO_ID, tran_id: 5001, recordtype: 'inventoryadjustment', doc_no: 'IA-FSC-260700198',
    trandate: '25/7/2026', trandate_iso: '2026-07-25', line_id: 2,
    adj_type: 'Raw Material', adj_summarycost: 'F', adj_rawmaterial: 'T', adj_issuedsupply: 'F',
    item_id: 802, item_code: '23010100009', item_name: 'Premixed', item_type: 'InvtPart',
    is_summary: 'F', quantity: -49, unit_name: 'BAG', rate: 2040.8189796,
    amount: -100000.13, location_name: 'PD_B1', task_id: null, woc_id: null },
  { wo_id: WO_ID, tran_id: 5001, recordtype: 'inventoryadjustment', doc_no: 'IA-FSC-260700198',
    trandate: '25/7/2026', trandate_iso: '2026-07-25', line_id: 3,
    adj_type: 'Raw Material', adj_summarycost: 'F', adj_rawmaterial: 'T', adj_issuedsupply: 'F',
    item_id: 803, item_code: '31010100001', item_name: 'ขวด PET', item_type: 'InvtPart',
    is_summary: 'F', quantity: -163000, unit_name: 'PCS', rate: 0.2923313,
    amount: -47650.01, location_name: 'PD_B1', task_id: null, woc_id: null },
  // ── ใบ MFG Summary Cost 2 ใบ = 2 รอบปิดงานที่มีปริมาณ (กติกาจาก issue #3) ──
  { wo_id: WO_ID, tran_id: 6001, recordtype: 'inventoryadjustment', doc_no: 'IA-FSC-260700301',
    trandate: '26/7/2026', trandate_iso: '2026-07-26', line_id: 1,
    adj_type: 'MFG Summary Cost', adj_summarycost: 'T', adj_rawmaterial: 'F', adj_issuedsupply: 'F',
    item_id: 999, item_code: 'SUMMARYCOST', item_name: 'MFG Summary Cost Item', item_type: 'InvtPart',
    is_summary: 'T', quantity: 1, unit_name: 'UNIT', rate: 510093.30,
    amount: -510093.30, location_name: 'PD_B1', task_id: null, woc_id: 7001 },
  { wo_id: WO_ID, tran_id: 6002, recordtype: 'inventoryadjustment', doc_no: 'IA-FSC-260700302',
    trandate: '27/7/2026', trandate_iso: '2026-07-27', line_id: 1,
    adj_type: 'MFG Summary Cost', adj_summarycost: 'T', adj_rawmaterial: 'F', adj_issuedsupply: 'F',
    item_id: 999, item_code: 'SUMMARYCOST', item_name: 'MFG Summary Cost Item', item_type: 'InvtPart',
    is_summary: 'T', quantity: 1, unit_name: 'UNIT', rate: 510093.29,
    amount: -510093.29, location_name: 'PD_B1', task_id: null, woc_id: 7002 }
];

// ใบปิดงานผลิต — 2 ใบมีปริมาณ (2 batch) + 1 ใบขั้นตอนกลางที่ปริมาณ 0 ไม่ตีราคา
const WOC_ROWS = [
  { wo_id: WO_ID, woc_id: 7001, woc_no: 'WOCFSC00000900', woc_date: '26/07/2026',
    good_qty: 100276, scrap_qty: 0, sc_ia: 6001, fg_qty: 100276,
    task_no: 'OP-30', task_name: 'Packing', batch_id: 3001, pro_qty: 100276 },
  { wo_id: WO_ID, woc_id: 7002, woc_no: 'WOCFSC00000901', woc_date: '27/07/2026',
    good_qty: 60000, scrap_qty: 0, sc_ia: 6002, fg_qty: 60000,
    task_no: 'OP-30', task_name: 'Packing', batch_id: 3002, pro_qty: 60000 },
  { wo_id: WO_ID, woc_id: 7003, woc_no: 'WOCFSC00000902', woc_date: '26/07/2026',
    good_qty: 0, scrap_qty: 0, sc_ia: null, fg_qty: 0,
    task_no: 'OP-10', task_name: 'Mixing', batch_id: 3001, pro_qty: 0 }
];

// เอกสารปันส่วนต้นทุน — บรรทัด WIP เป็นยอดรวม ไม่ใช่องค์ประกอบ ต้องถูกตัดทั้งสองชั้น
const CA_ROWS = [
  { wo_id: WO_ID, ca_id: 8001, ca_no: 'WCA-FSC-260700016', ca_date: '27/7/2026', woc_id: 7001,
    cost_class: 2, acct_no: '5301001', acct_name: 'Direct Labor', std_cost: 40298.58, act_cost: 40298.58 },
  { wo_id: WO_ID, ca_id: 8001, ca_no: 'WCA-FSC-260700016', ca_date: '27/7/2026', woc_id: 7002,
    cost_class: 3, acct_no: '5302001', acct_name: 'Overhead', std_cost: 30000.00, act_cost: 30000.00 },
  { wo_id: WO_ID, ca_id: 8001, ca_no: 'WCA-FSC-260700016', ca_date: '27/7/2026', woc_id: null,
    cost_class: CLASS_WIP, acct_no: '1414001', acct_name: 'WIP', std_cost: 417949.59, act_cost: 417949.59 }
];

// ── รวมยอดด้วยกฎเดียวกับ SQL ของชั้นภาพรวม ────────────────────────────────
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const uniq = (a) => a.filter((v, i) => a.indexOf(v) === i);
const isSc = (r) => r.adj_summarycost === 'T' || r.is_summary === 'T';

const rmLines = ISSUE_LINES.filter((r) => !isSc(r));
const scLines = ISSUE_LINES.filter(isSc);
const convRows = CA_ROWS.filter((r) => num(r.cost_class) !== CLASS_WIP);
const fgWocs = WOC_ROWS.filter((r) => num(r.fg_qty) !== 0);

const sum = (rows, k, abs) => rows.reduce(
  (t, r) => t + (abs ? Math.abs(num(r[k])) : num(r[k])), 0);

const scValueByDoc = {};
scLines.forEach((r) => {
  scValueByDoc[String(r.tran_id)] = (scValueByDoc[String(r.tran_id)] || 0) + Math.abs(num(r.amount));
});
const linkedDocs = uniq(fgWocs.map((w) => String(w.sc_ia))
  .filter((id) => Object.prototype.hasOwnProperty.call(scValueByDoc, id)));

const EXPECT = {
  rm_cost: sum(rmLines, 'amount', true),          // 347,651.01
  sc_value: sum(scLines, 'amount', true),         // 1,020,186.59
  dl_oh_std: sum(convRows, 'std_cost'),           // 70,298.58
  dl_oh_act: sum(convRows, 'act_cost'),
  woc_qty: sum(WOC_ROWS, 'fg_qty'),               // 160,276
  woc_fg_count: fgWocs.length,
  sc_docs: Object.keys(scValueByDoc).length,
  sc_docs_valued: Object.keys(scValueByDoc).filter((k) => scValueByDoc[k] > 0.005).length,
  linked_docs: linkedDocs.length,
  base_per_carton: 48
};

/** fixture ของชั้นเจาะลึก — label ครบทุกตัวที่ buildModel ยิง (ไม่มีตัวไหนพึ่ง default เงียบ ๆ) */
function drilldown() {
  return {
    'WO header': [WO_HEADER],
    'WO lines (BOM standard)': WO_LINES,
    'ใบเบิกวัตถุดิบเข้า WO': ISSUE_LINES,
    'ใบปิดงานผลิต (WOC)': WOC_ROWS,
    'เอกสารปันส่วนต้นทุน': CA_ROWS,
    // ชั้นที่ 2 (ไล่ lot หา WO ต้นทาง) ไม่ใช้ในเทสนี้ — ประกาศว่าไม่มีแถว ไม่ใช่ปล่อยว่าง
    'lot ที่เบิก': [],
    'WO ต้นทางของ lot': [],
    'WO ต้นทาง (header)': [],
    'BOM มาตรฐาน': [],
    'อัตราแปลงหน่วย': [],
    'ข้อมูลสินค้า + average cost': [],
    'ledger เข้า-ออก (ที่มา average cost)': [],
    'ตรวจสุขภาพ ledger': [],
    'มูลค่าจากบัญชี (accounting line)': [],
    'กระทบยอด WIP': [],
    'เอกสารอ้างถึง WO ใดบ้าง': [],
    'Cost ref ของสินค้าที่ผลิต': []
  };
}

/** fixture ของชั้นภาพรวม — ทุกยอดคำนวณจากบรรทัดชุดเดียวกันข้างบน ไม่ได้พิมพ์เลขซ้ำ */
function summary() {
  const fg = WO_LINES.filter((r) => r.mainline === 'T')[0];
  return {
    'ภาพรวม — รายการใบสั่งผลิต': [{
      wo_id: WO_ID, wo_no: WO_HEADER.wo_no, wo_date: WO_HEADER.wo_date,
      wo_date_iso: WO_HEADER.wo_date_iso, wo_status: WO_HEADER.wo_status,
      production_line: WO_HEADER.production_line, item_id: fg.item_id, sub_id: fg.sub_id,
      item_code: fg.item_code, item_name: fg.item_name, wo_qty: fg.quantity,
      unit_name: fg.unit_name, base_per_carton: EXPECT.base_per_carton
    }],
    'ภาพรวม — ผลิตได้จริง': [{
      wo_id: WO_ID, woc_qty: EXPECT.woc_qty, woc_count: WOC_ROWS.length,
      woc_fg_count: EXPECT.woc_fg_count, woc_sc_linked: EXPECT.linked_docs,
      woc_in_range: WOC_ROWS.length, woc_last: '27/07/2026', woc_last_iso: '2026-07-27'
    }],
    'ภาพรวม — วัตถุดิบและบรรจุภัณฑ์': [{
      wo_id: WO_ID, rm_cost: EXPECT.rm_cost,
      doc_count: uniq(rmLines.map((r) => r.tran_id)).length,
      item_count: uniq(rmLines.map((r) => r.item_id)).length
    }],
    'ภาพรวม — Summary Cost Item': [{
      wo_id: WO_ID, sc_value: EXPECT.sc_value, sc_docs: EXPECT.sc_docs,
      sc_docs_valued: EXPECT.sc_docs_valued,
      sc_docs_orphan: EXPECT.sc_docs_valued - EXPECT.linked_docs
    }],
    'ภาพรวม — ต้นทุนแปรสภาพ': [{
      wo_id: WO_ID, dl_oh_std: EXPECT.dl_oh_std, dl_oh_act: EXPECT.dl_oh_act,
      ca_docs: uniq(convRows.map((r) => r.ca_id)).length
    }],
    'Cost ref ของสินค้าที่ผลิต': []
  };
}

module.exports = {
  CLASS_WIP, WO_ID, FG_ITEM, WO_HEADER, WO_LINES, ISSUE_LINES, WOC_ROWS, CA_ROWS,
  EXPECT, drilldown, summary
};
