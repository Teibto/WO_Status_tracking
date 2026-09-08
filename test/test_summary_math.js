/**
 * Harness — ตรวจเลขของ buildSummary ด้วย fixture ที่ล็อกกับตัวเลขที่ verify แล้วใน WO_COST_TRACE.md
 * ไม่แตะ NetSuite · stub N/query ให้คืนแถวตาม label ของ query
 */
const fs = require('fs');
const path = require('path');

// รัน: node test/test_summary_math.js  (จากรากโปรเจกต์ หรือที่ไหนก็ได้ — path ผูกกับไฟล์นี้)
const FILE = path.join(__dirname,
  '../src/FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking/WOCostTrace.js');

// ── fixture: WOFSC00000470 (ตัวเลขจาก WO_COST_TRACE.md) + WO ที่ยังไม่ปิดงาน ──
const FX = {
  'ภาพรวม — รายการใบสั่งผลิต': [
    { wo_id: 1001, wo_no: 'WOFSC00000470', wo_date: '23/7/2026', wo_date_iso: '2026-07-23',
      wo_status: 'Released', production_line: 'LINE1', item_id: 501,
      item_code: '11010900010', item_name: 'FG ส้ม 300 มล.', wo_qty: 163000,
      unit_name: 'BOTTLE', base_per_carton: 48 },
    { wo_id: 1002, wo_no: 'WOFSC00000471', wo_date: '24/7/2026', wo_date_iso: '2026-07-24',
      wo_status: 'Released', production_line: 'LINE1', item_id: 501,
      item_code: '11010900010', item_name: 'FG ส้ม 300 มล.', wo_qty: 50000,
      unit_name: 'BOTTLE', base_per_carton: 48 },   // ยังไม่มี WOC / ไม่มีใบเบิก
    { wo_id: 1003, wo_no: 'WOFSC00000480', wo_date: '25/7/2026', wo_date_iso: '2026-07-25',
      wo_status: 'Released', production_line: 'LINE2', item_id: 502,
      item_code: '11010900099', item_name: 'FG ไม่ตั้ง basepercarton', wo_qty: 1000,
      unit_name: 'BOTTLE', base_per_carton: null },
    // เคสจริงที่พบมากใน SB1: ปันส่วนต้นทุนแปรสภาพมาแล้วแต่ยังไม่มีใบเบิกวัตถุดิบเลย
    // ต้นทุน/หน่วยที่ได้เป็นค่าแปรสภาพล้วน ต้องมีธงที่ตัวเลข (เทียบ WOFSC00000496 บน SB1)
    { wo_id: 1004, wo_no: 'WOFSC00000496', wo_date: '23/7/2026', wo_date_iso: '2026-07-23',
      production_line: 'LINE3', item_id: 503, sub_id: 2,
      item_code: '10010600201', item_name: 'FG ยังไม่เบิกวัตถุดิบ', wo_qty: 24000,
      unit_name: 'BOTTLE', base_per_carton: 24 },
    // ── สามใบต่อไปนี้ไม่มีต้นทุนแปรสภาพเหมือนกัน แต่คนละสาเหตุ ต้องได้คนละหมายเหตุ ──
    // 1005 สินค้าที่ Cost ref ตั้งทุกช่องไว้ 0/ว่าง = ไม่มีต้นทุนแปรสภาพโดยการตั้งค่า (ห้ามเตือน)
    { wo_id: 1005, wo_no: 'WOFSC00000501', wo_date: '20/7/2026', wo_date_iso: '2026-07-20',
      production_line: 'LINE4', item_id: 601, sub_id: 2,
      item_code: '20010100001', item_name: 'FG กลุ่มไม่มีต้นทุนแปรสภาพ', wo_qty: 500,
      unit_name: 'BAG', base_per_carton: 10 },
    // 1006 Cost ref มีต้นทุนตั้งไว้จริง แต่ยังไม่ปันส่วน = งานค้าง ต้องเตือน
    { wo_id: 1006, wo_no: 'WOFSC00000502', wo_date: '20/7/2026', wo_date_iso: '2026-07-20',
      production_line: 'LINE4', item_id: 602, sub_id: 2,
      item_code: '20010100002', item_name: 'FG มีต้นทุนใน cost ref', wo_qty: 500,
      unit_name: 'BAG', base_per_carton: 10 },
    // 1007 ไม่มีแถว Cost ref ที่ตรงเลย = ตรวจไม่ได้ ต้องเตือนด้วยข้อความคนละแบบ
    { wo_id: 1007, wo_no: 'WOFSC00000503', wo_date: '20/7/2026', wo_date_iso: '2026-07-20',
      production_line: 'LINE4', item_id: 603, sub_id: 2,
      item_code: '20010100003', item_name: 'FG ไม่มี cost ref', wo_qty: 500,
      unit_name: 'BAG', base_per_carton: 10 },
    // 1008 จับคู่ได้หลายแถว (คนละ work center) — ห้ามบอกยอดรวมของทุกแถว
    { wo_id: 1008, wo_no: 'WOFSC00000504', wo_date: '20/7/2026', wo_date_iso: '2026-07-20',
      production_line: 'LINE4', item_id: 604, sub_id: 2,
      item_code: '20010100004', item_name: 'FG cost ref หลายแถว', wo_qty: 500,
      unit_name: 'BAG', base_per_carton: 10 },
    // 1009 Cost ref เป็น option 1 (Calculate from Set Up Rate) — ช่องต้นทุนบน record ไม่ใช่คำตอบ
    { wo_id: 1009, wo_no: 'WOFSC00000505', wo_date: '20/7/2026', wo_date_iso: '2026-07-20',
      production_line: 'LINE4', item_id: 605, sub_id: 2,
      item_code: '20010100005', item_name: 'FG คิดจาก set up rate', wo_qty: 500,
      unit_name: 'BAG', base_per_carton: 10 },
    // 1010 = WO-FSC-00000227 ของจริงบน SB1: แตก 10 batch · WOC 30 ใบ (ใบต่อขั้นตอน) ·
    // ใบที่มีปริมาณ 10 ใบ · ใบ summary cost 10 ใบ ผูกครบ → ห้ามขึ้นธง "ตีราคาซ้ำ" (บั๊กที่ issue #3 แก้)
    { wo_id: 1010, wo_no: 'WOFSC00000227', wo_date: '30/7/2026', wo_date_iso: '2026-07-30',
      production_line: 'LINE5', item_id: 606, sub_id: 2,
      item_code: '20010100010', item_name: 'FG แตกสิบ batch', wo_qty: 180000,
      unit_name: 'BOTTLE', base_per_carton: 12 },
    // 1011 = ปิดงาน 3 รอบ แต่มีใบ summary cost ผูกแค่ 2 ใบ → ต้นทุนอีกรอบยังไม่ถูกสรุป
    { wo_id: 1011, wo_no: 'WOFSC00000228', wo_date: '30/7/2026', wo_date_iso: '2026-07-30',
      production_line: 'LINE5', item_id: 607, sub_id: 2,
      item_code: '20010100011', item_name: 'FG ผูก summary cost ไม่ครบ', wo_qty: 54000,
      unit_name: 'BOTTLE', base_per_carton: 12 },
    // 1012 = ตัวเลขจริงของ WO-FSC-00000227 บน SB1 (ยอดวัตถุดิบถูกนับซ้ำ 10 ใบ)
    // ล็อกไว้เป็น golden ของการแยกส่วนผลต่าง — บั๊กฝั่ง engine ที่สร้างใบ summary cost
    { wo_id: 1012, wo_no: 'WOFSC00000227R', wo_date: '31/7/2026', wo_date_iso: '2026-07-31',
      production_line: 'LINE5', item_id: 608, sub_id: 2,
      item_code: '20010100012', item_name: 'FG วัตถุดิบถูกนับซ้ำ', wo_qty: 180000,
      unit_name: 'BOTTLE', base_per_carton: 12 },
    // บรรทัด mainline='T' ซ้ำของใบเดิม — ต้องถูกตัดออก ไม่งั้นยอดของใบนี้ถูกบวกสองครั้ง
    { wo_id: 1001, wo_no: 'WOFSC00000470', wo_date: '23/7/2026', wo_date_iso: '2026-07-23',
      wo_status: 'Released', production_line: 'LINE1', item_id: 501,
      item_code: '11010900010', item_name: 'FG ส้ม 300 มล.', wo_qty: 163000,
      unit_name: 'BOTTLE', base_per_carton: 48 }
  ],
  // woc_fg_count = ใบปิดงานที่มีปริมาณ = จำนวน batch ที่ปิดงานเสร็จ (ฐานของจำนวนใบ summary cost)
  // woc_sc_linked = จำนวนใบ summary cost ที่ใบปิดงานอ้างถึง
  'ภาพรวม — ผลิตได้จริง': [
    // woc_in_range < woc_count = ปิดงานคร่อมช่วง ต้องขึ้นหมายเหตุแต่ยอดยังนับทุกใบ
    { wo_id: 1001, woc_qty: 160276, woc_count: 3, woc_fg_count: 1, woc_sc_linked: 1, woc_in_range: 3,
      woc_last: '25/07/2026', woc_last_iso: '2026-07-25' },
    { wo_id: 1003, woc_qty: 900, woc_count: 2, woc_fg_count: 1, woc_sc_linked: 1, woc_in_range: 1,
      woc_last: '02/08/2026', woc_last_iso: '2026-08-02' },
    { wo_id: 1004, woc_qty: 24000, woc_count: 1, woc_fg_count: 1, woc_sc_linked: 1, woc_in_range: 1,
      woc_last: '23/07/2026', woc_last_iso: '2026-07-23' },
    // สามใบทดสอบ Cost ref — ปิดงานและเบิกของครบ ต่างกันแค่เรื่อง Cost ref อย่างเดียว
    { wo_id: 1005, woc_qty: 500, woc_count: 1, woc_fg_count: 1, woc_sc_linked: 1, woc_in_range: 1,
      woc_last: '21/07/2026', woc_last_iso: '2026-07-21' },
    { wo_id: 1006, woc_qty: 500, woc_count: 1, woc_fg_count: 1, woc_sc_linked: 1, woc_in_range: 1,
      woc_last: '21/07/2026', woc_last_iso: '2026-07-21' },
    { wo_id: 1007, woc_qty: 500, woc_count: 1, woc_fg_count: 1, woc_sc_linked: 1, woc_in_range: 1,
      woc_last: '21/07/2026', woc_last_iso: '2026-07-21' },
    { wo_id: 1008, woc_qty: 500, woc_count: 1, woc_fg_count: 1, woc_sc_linked: 1, woc_in_range: 1,
      woc_last: '21/07/2026', woc_last_iso: '2026-07-21' },
    { wo_id: 1009, woc_qty: 500, woc_count: 1, woc_fg_count: 1, woc_sc_linked: 1, woc_in_range: 1,
      woc_last: '21/07/2026', woc_last_iso: '2026-07-21' },
    // 1010 ค่าจริงจาก SB1: WOC 30 ใบ แต่มีปริมาณ 10 ใบ (10 batch) ผูกใบ summary cost ครบ 10 ใบ
    { wo_id: 1010, woc_qty: 165600, woc_count: 30, woc_fg_count: 10, woc_sc_linked: 10, woc_in_range: 30,
      woc_last: '31/07/2026', woc_last_iso: '2026-07-31' },
    { wo_id: 1011, woc_qty: 54000, woc_count: 9, woc_fg_count: 3, woc_sc_linked: 2, woc_in_range: 9,
      woc_last: '31/07/2026', woc_last_iso: '2026-07-31' },
    { wo_id: 1012, woc_qty: 165600, woc_count: 30, woc_fg_count: 10, woc_sc_linked: 10, woc_in_range: 30,
      woc_last: '31/07/2026', woc_last_iso: '2026-07-31' }
  ],
  'ภาพรวม — วัตถุดิบและบรรจุภัณฑ์': [
    { wo_id: 1001, rm_cost: 347651.01, doc_count: 1, item_count: 30 },
    { wo_id: 1003, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1005, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1006, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1007, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1008, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1009, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1010, rm_cost: 1000, doc_count: 10, item_count: 5 },
    { wo_id: 1011, rm_cost: 1000, doc_count: 3, item_count: 5 },
    // ใบเบิกใบเดียวสำหรับทั้ง 10 batch — ต้นตอที่ทำให้ยอดถูกนับซ้ำได้
    { wo_id: 1012, rm_cost: 173138.54, doc_count: 1, item_count: 19 }
  ],
  'ภาพรวม — ต้นทุนแปรสภาพ': [
    { wo_id: 1001, dl_oh_std: 70298.58, dl_oh_act: 70298.58, ca_docs: 1 },
    { wo_id: 1003, dl_oh_std: 100, dl_oh_act: 100, ca_docs: 1 },
    { wo_id: 1004, dl_oh_std: 21754, dl_oh_act: 21754, ca_docs: 1 },
    { wo_id: 1010, dl_oh_std: 500, dl_oh_act: 500, ca_docs: 10 },
    { wo_id: 1011, dl_oh_std: 300, dl_oh_act: 300, ca_docs: 3 },
    { wo_id: 1012, dl_oh_std: 60710, dl_oh_act: 60710, ca_docs: 3 }
  ],
  // Cost ref — ค่าจริงของ record 17 บน SB1 คือ option 2 (Using Cost from Record)
  // ช่องต้นทุนเป็น 0 สองช่อง ที่เหลือว่าง (null) · header ครอบทั้งปี 2026 บริษัท 2
  'Cost ref ของสินค้าที่ผลิต': [
    { cr_id: 17, item_id: 601, wc_id: 186700, cr_option: 2, ref_qty: 1,
      c_dept_fixed: 0, c_dept_var: null, c_dept_fac: null, c_mac_fixed: null,
      c_mac_var: null, c_labor: 0, c_indirect: null,
      setup_id: 1, setup_name: 'FS - Cost Reference Y2026', sub_id: 2,
      start_iso: '2026-01-01', end_iso: '2026-12-31' },
    { cr_id: 18, item_id: 602, wc_id: 186700, cr_option: 2, ref_qty: 1,
      c_dept_fixed: 12.5, c_dept_var: null, c_dept_fac: null, c_mac_fixed: null,
      c_mac_var: null, c_labor: 3.25, c_indirect: null,
      setup_id: 1, setup_name: 'FS - Cost Reference Y2026', sub_id: 2,
      start_iso: '2026-01-01', end_iso: '2026-12-31' },
    // สินค้า 604 มี Cost ref สองแถว คนละ work center คนละปริมาณอ้างอิง
    // ผลรวมดิบ 20 + 5 ไม่ใช่ต้นทุนของอะไรเลย เพราะฐานปริมาณคนละตัว
    { cr_id: 21, item_id: 604, wc_id: 186700, cr_option: 2, ref_qty: 1,
      c_dept_fixed: 20, c_dept_var: null, c_dept_fac: null, c_mac_fixed: null,
      c_mac_var: null, c_labor: 0, c_indirect: null,
      setup_id: 1, setup_name: 'FS - Cost Reference Y2026', sub_id: 2,
      start_iso: '2026-01-01', end_iso: '2026-12-31' },
    { cr_id: 22, item_id: 604, wc_id: 186701, cr_option: 2, ref_qty: 100,
      c_dept_fixed: 5, c_dept_var: null, c_dept_fac: null, c_mac_fixed: null,
      c_mac_var: null, c_labor: 0, c_indirect: null,
      setup_id: 1, setup_name: 'FS - Cost Reference Y2026', sub_id: 2,
      start_iso: '2026-01-01', end_iso: '2026-12-31' },
    // สินค้า 605 option 1 = Calculate Cost from Set Up Rate · ช่องต้นทุนเป็น 0 แต่สรุปว่าไม่มีต้นทุนไม่ได้
    { cr_id: 23, item_id: 605, wc_id: 186700, cr_option: 1, ref_qty: 1,
      c_dept_fixed: 0, c_dept_var: null, c_dept_fac: null, c_mac_fixed: null,
      c_mac_var: null, c_labor: null, c_indirect: null,
      setup_id: 1, setup_name: 'FS - Cost Reference Y2026', sub_id: 2,
      start_iso: '2026-01-01', end_iso: '2026-12-31' },
    // แถวของสินค้า 601 อีกใบ แต่หมดอายุปี 2025 — ต้องไม่ถูกจับคู่กับใบสั่งผลิตปี 2026
    { cr_id: 9, item_id: 601, wc_id: 186700, cr_option: 2, ref_qty: 1,
      c_dept_fixed: 99, c_dept_var: null, c_dept_fac: null, c_mac_fixed: null,
      c_mac_var: null, c_labor: 0, c_indirect: null,
      setup_id: 0, setup_name: 'FS - Cost Reference Y2025', sub_id: 2,
      start_iso: '2025-01-01', end_iso: '2025-12-31' }
  ],
  // sc_docs_orphan = ใบมีมูลค่าที่ไม่มีใบปิดงานอ้างถึง = ตีราคาซ้ำจริง (ไม่ใช่ "เกิน 1 ใบ")
  'ภาพรวม — Summary Cost Item': [
    { wo_id: 1001, sc_value: 1020186.59, sc_docs: 1, sc_docs_valued: 1, sc_docs_orphan: 0 },
    // 3 ใบ มีมูลค่า 2 ใบ แต่ปิดงานรอบเดียว → ใบเกินไม่มีใบปิดงานอ้างถึง = ตีราคาซ้ำ (bad)
    { wo_id: 1003, sc_value: 1100, sc_docs: 3, sc_docs_valued: 2, sc_docs_orphan: 1 },
    { wo_id: 1004, sc_value: 21754, sc_docs: 1, sc_docs_valued: 1, sc_docs_orphan: 0 },
    { wo_id: 1005, sc_value: 1000, sc_docs: 1, sc_docs_valued: 1, sc_docs_orphan: 0 },
    { wo_id: 1006, sc_value: 1000, sc_docs: 1, sc_docs_valued: 1, sc_docs_orphan: 0 },
    { wo_id: 1007, sc_value: 1000, sc_docs: 1, sc_docs_valued: 1, sc_docs_orphan: 0 },
    { wo_id: 1008, sc_value: 1000, sc_docs: 1, sc_docs_valued: 1, sc_docs_orphan: 0 },
    { wo_id: 1009, sc_value: 1000, sc_docs: 1, sc_docs_valued: 1, sc_docs_orphan: 0 },
    // 10 ใบมีมูลค่า ผูกครบทั้ง 10 รอบปิดงาน = ถูกต้อง (นี่คือเคสที่ระบบเดิมรายงานผิดว่า "ตีราคาซ้ำ")
    { wo_id: 1010, sc_value: 1500, sc_docs: 10, sc_docs_valued: 10, sc_docs_orphan: 0 },
    // ปิดงาน 3 รอบ มีใบ summary cost 2 ใบ ผูกครบทั้งสองใบ = ไม่ซ้ำ แต่ขาดไป 1 รอบ
    { wo_id: 1011, sc_value: 1300, sc_docs: 2, sc_docs_valued: 2, sc_docs_orphan: 0 },
    // 9 x 179,396.34 + 174,539.54 = 1,789,106.60 (ค่าจริงบน SB1)
    { wo_id: 1012, sc_value: 1789106.60, sc_docs: 10, sc_docs_valued: 10, sc_docs_orphan: 0 }
  ]
};

// ── stub SuiteScript modules ────────────────────────────────────────────────
const MOD = {
  'N/query': {
    runSuiteQLPaged({ query: sql }) {
      const label = CURRENT_LABEL;
      // 'THROW' = จำลอง query พัง เพื่อพิสูจน์ว่ารายงานไม่เอา "อ่านไม่ได้" ไปสรุปเป็น "ไม่มีข้อมูล"
      if (FX[label] === 'THROW') throw new Error('Invalid or unsupported search (จำลอง)');
      const rows = FX[label] || [];
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

// แทรก hook เพื่อรู้ว่ากำลังรัน query label ไหน — runSQL ส่ง label เข้ามาเป็นตัวแรก
const src = fs.readFileSync(FILE, 'utf8')
  .replace('function runSQL(label, sql, params) {',
           'function runSQL(label, sql, params) { global.__setLabel(label);');
global.__setLabel = (l) => { CURRENT_LABEL = l; };

// ดึงฟังก์ชันภายในออกมาทดสอบ: เติม export ชั่วคราวก่อน return ของ define
const patched = src.replace('return { onRequest: onRequest };',
  'return { onRequest: onRequest, __t: { buildSummary, readFilters, renderSummaryPage, renderSummaryGrid, summaryLink, explainSummaryGap } };');

eval(patched);

// ── run ────────────────────────────────────────────────────────────────────
const T = MODULE.__t;
const f = T.readFilters({ from: '2026-07-01', to: '2026-07-31' });
const sm = T.buildSummary(f);

let fail = 0;
function eq(label, got, want, tol) {
  const ok = want == null ? got == null
    : (typeof want === 'number' ? Math.abs(got - want) <= (tol == null ? 1e-8 : tol) : got === want);
  if (!ok) { fail++; console.log('  FAIL ' + label + ': got ' + got + ' want ' + want); }
  else console.log('  ok   ' + label + ' = ' + got);
}

console.log('\n── WOFSC00000470 ต้องตรงกับตัวเลขที่ verify แล้ว ──');
const r = sm.rows.filter(x => x.wo_no === 'WOFSC00000470')[0];
eq('rm_cost', r.rm_cost, 347651.01);
eq('dl_oh_cost', r.dl_oh_cost, 70298.58);
eq('cost (รวมต้นทุนการผลิต)', r.cost, 417949.59);
eq('woc_qty', r.woc_qty, 160276);
eq('cost_per_unit', r.cost_per_unit, 2.60768668, 1e-8);
eq('cartons', r.cartons, 3339.083333, 1e-6);
eq('cost_per_carton', r.cost_per_carton, 125.16896054, 1e-8);
eq('sc_value', r.sc_value, 1020186.59);
eq('sc_gap', r.sc_gap, 602237.00, 1e-6);
eq('notes (ปกติ ไม่มีหมายเหตุ)', r.notes.length, 0);

console.log('\n── WO ที่ยังไม่ปิดงานผลิต ต้องไม่โผล่เป็นศูนย์ ──');
const r2 = sm.rows.filter(x => x.wo_no === 'WOFSC00000471')[0];
eq('woc_qty', r2.woc_qty, 0);
eq('cost_per_unit เป็น null', r2.cost_per_unit, null);
eq('cost_per_carton เป็น null', r2.cost_per_carton, null);
eq('จำนวนหมายเหตุ', r2.notes.length, 4);

console.log('\n── สินค้าที่ไม่ตั้ง basepercarton + summary cost ซ้ำ + ปิดงานคร่อมช่วง ──');
const r3 = sm.rows.filter(x => x.wo_no === 'WOFSC00000480')[0];
eq('cost_per_unit หารด้วย WOC ทุกใบ', r3.cost_per_unit, 1100 / 900, 1e-12);
eq('cost_per_carton เป็น null', r3.cost_per_carton, null);
eq('ตีราคาซ้ำเป็น bad', r3.notes.filter(n => n.cls === 'bad').length, 1);
// ข้อความต้องบอกฐานที่ใช้ตัดสิน (ใบ orphan / ใบมีมูลค่า / รอบปิดงาน) ไม่ใช่จำนวนใบเทียบกติกาที่มองไม่เห็น
eq('ข้อความบอกจำนวนใบที่ไม่มีใบปิดงานอ้างถึง',
  r3.notes.some(n => n.text.indexOf('ไม่มีใบปิดงานอ้างถึง 1 ใบ') >= 0), true);
eq('ข้อความบอกฐาน: ใบมีมูลค่าและรอบปิดงาน',
  r3.notes.some(n => n.text.indexOf('มีมูลค่าทั้งหมด 2 ใบ · ปิดงานผลิต 1 รอบ') >= 0), true);
eq('เตือนปิดงานคร่อมช่วง', r3.notes.some(n => n.text.indexOf('คร่อมช่วง') >= 0), true);
eq('ไม่เตือนคร่อมช่วงกับใบที่อยู่ในช่วงทั้งหมด',
  r.notes.some(n => n.text.indexOf('คร่อมช่วง') >= 0), false);

// ── บั๊ก issue #3: WO ที่แตกหลาย batch ต้องมีใบ summary cost ได้ใบต่อ batch ที่ปิดงานเสร็จ ──
console.log('\n── WO แตก 10 batch (WO-FSC-00000227) ต้องไม่ขึ้นธง "ตีราคาซ้ำ" ──');
const rb = sm.rows.filter(x => x.wo_no === 'WOFSC00000227')[0];
eq('ใบ summary cost 10 ใบ', rb.sc_docs, 10);
eq('มีมูลค่าทั้ง 10 ใบ', rb.sc_docs_valued, 10);
eq('ไม่มีใบที่ไม่ถูกอ้างถึง', rb.sc_docs_orphan, 0);
eq('ใบปิดงาน 30 ใบ แต่รอบที่มีปริมาณ 10 รอบ', rb.woc_fg_count, 10);
eq('ผูกครบ 10 ใบ', rb.woc_sc_linked, 10);
eq('ไม่มีหมายเหตุ bad เลย', rb.notes.filter(n => n.cls === 'bad').length, 0);
eq('ห้ามพูดคำว่าตีราคาซ้ำ', rb.notes.some(n => n.text.indexOf('ตีราคาซ้ำ') >= 0), false);
eq('ห้ามอ้างกติกา 1 ใบ', rb.notes.some(n => n.text.indexOf('กติกาคือ 1 ใบ') >= 0), false);

console.log('\n── ปิดงาน 3 รอบ แต่ผูกใบ summary cost แค่ 2 ใบ = ต้นทุนบางรอบยังไม่ถูกสรุป ──');
const ru = sm.rows.filter(x => x.wo_no === 'WOFSC00000228')[0];
eq('ไม่ใช่เคสตีราคาซ้ำ', ru.sc_docs_orphan, 0);
eq('ขึ้น bad 1 ข้อ', ru.notes.filter(n => n.cls === 'bad').length, 1);
eq('บอกว่าขาดไป 1 รอบ',
  ru.notes.some(n => n.text.indexOf('ปิดงานผลิต 3 รอบ แต่มีใบ MFG Summary Cost ผูกแค่ 2 ใบ') >= 0), true);
eq('ห้ามกล่าวหาว่าซ้ำ', ru.notes.some(n => n.text.indexOf('ตีราคาซ้ำ') >= 0), false);

// ── ผลต่าง summary cost: ยอดวัตถุดิบถูกนับซ้ำเท่าจำนวนใบ (บั๊กฝั่ง engine ที่สร้างเอกสาร) ──
// ตัวเลขจริงของ WO-FSC-00000227 บน SB1 — ปิดสมการได้ทั้งก้อน จึงล็อกไว้เป็น golden
console.log('\n── แยกส่วนผลต่าง: ยอดใบเบิกวัตถุดิบถูกนับซ้ำ 10 ใบ ──');
const rd = sm.rows.filter(x => x.wo_no === 'WOFSC00000227R')[0];
eq('ใบเบิกวัตถุดิบใบเดียว', rd.rm_docs, 1);
eq('ยอดวัตถุดิบ', rd.rm_cost, 173138.54);
eq('ต้นทุนแปรสภาพ', rd.dl_oh_cost, 60710);
eq('ต้นทุนที่ควรเป็น', rd.cost, 233848.54);
eq('Summary Cost Item เป็นจริง', rd.sc_value, 1789106.60);
eq('ผลต่าง', rd.sc_gap, 1555258.06, 1e-6);
// 9 x 173,138.54 = 1,558,246.86 · เกินผลต่างจริงอยู่ 2,988.80 (แปรสภาพของ batch สุดท้ายที่ใบคิดต่ำไป)
eq('ยอดที่นับเกิน = (10-1) x ยอดวัตถุดิบ', rd.sc_rm_overcount, 1558246.86, 1e-6);
eq('อธิบายผลต่างได้เกือบทั้งก้อน', rd.sc_rm_overcount / rd.sc_gap, 1.00192, 1e-5);
eq('ขึ้นหมายเหตุแยกส่วนผลต่าง',
  rd.notes.some(n => n.text.indexOf('ถูกนับซ้ำใน 10 ใบ summary cost') >= 0), true);
eq('หมายเหตุชี้ไปฝั่งสร้างเอกสาร',
  rd.notes.some(n => n.text.indexOf('ประเด็นฝั่งสร้างเอกสาร') >= 0), true);
eq('เป็น warn ไม่ใช่ bad (ไม่ใช่งานที่ฝั่งนี้แก้)',
  rd.notes.filter(n => n.cls === 'bad').length, 0);
// ใบที่สมการปิดพอดี ต้องไม่ขึ้นหมายเหตุนี้ ไม่งั้นกลายเป็น noise ทุกใบที่มีหลาย batch
eq('ใบที่สมการปิดไม่ขึ้นหมายเหตุแยกส่วน',
  rb.notes.some(n => n.text.indexOf('ถูกนับซ้ำ') >= 0), false);
eq('ใบที่สมการปิด overcount เป็น 0 จริง', rb.sc_gap, 0, 1e-9);

console.log('\n── ปันส่วนแปรสภาพแล้วแต่ยังไม่เบิกวัตถุดิบ (เคสที่พบมากใน SB1) ──');
const r4 = sm.rows.filter(x => x.wo_no === 'WOFSC00000496')[0];
eq('rm_cost เป็น 0 จริง', r4.rm_cost, 0);
eq('cost/unit = แปรสภาพล้วน', r4.cost_per_unit, 21754 / 24000, 1e-12);
eq('มีหมายเหตุยังไม่มีใบเบิก', r4.notes.some(n => n.text.indexOf('ยังไม่มีใบเบิกวัตถุดิบ') >= 0), true);

console.log('\n── ไม่มีต้นทุนแปรสภาพ: แยกให้ออกว่าตั้งค่าไว้แบบนั้น หรือยังไม่ได้ปันส่วน ──');
const rz1 = sm.rows.filter(x => x.wo_no === 'WOFSC00000501')[0];   // Cost ref ตั้งไว้ 0 ทุกช่อง
eq('dl_oh_cost = 0', rz1.dl_oh_cost, 0);
eq('คำตัดสิน Cost ref = zero', rz1.cost_ref.verdict, 'zero');
eq('ไม่ขึ้นคำเตือนเลย', rz1.notes.filter(n => n.cls === 'warn' || n.cls === 'bad').length, 0);
eq('ขึ้นหมายเหตุแบบ info', rz1.notes.filter(n => n.cls === 'info').length, 1);
eq('บอกว่าเป็นการตั้งค่า', rz1.notes.some(n => n.text.indexOf('ตามการตั้งค่า') >= 0), true);
eq('อ้างเลข Cost ref ให้ตามไปดูได้', rz1.notes.some(n => n.text.indexOf('Cost ref 17') >= 0), true);
// แถวปี 2025 ของสินค้าเดียวกันมีต้นทุน 99 — ถ้าเผลอจับคู่จะกลายเป็น verdict 'has'
eq('ไม่จับคู่ Cost ref ที่หมดอายุแล้ว', rz1.cost_ref.rows, 1);

const rz2 = sm.rows.filter(x => x.wo_no === 'WOFSC00000502')[0];   // Cost ref มีต้นทุนจริง
eq('คำตัดสิน Cost ref = has', rz2.cost_ref.verdict, 'has');
eq('รวมต้นทุนที่ตั้งไว้', rz2.cost_ref.cost, 15.75, 1e-9);
eq('ยังเตือนเหมือนเดิม', rz2.notes.some(n => n.cls === 'warn'
  && n.text.indexOf('ยังไม่ปันส่วนต้นทุนแปรสภาพ') === 0), true);
eq('แถวเดียวบอกยอดพร้อมปริมาณอ้างอิงได้',
  rz2.notes.some(n => n.text.indexOf('ตั้งต้นทุนไว้ 15.75 ต่อปริมาณอ้างอิง 1') >= 0), true);

// จับคู่ได้หลายแถว = บอกยอดรวมไม่ได้ เพราะแต่ละแถวมีปริมาณอ้างอิงของตัวเอง
// (เจอจริงบน SB1: WO-FSC-00000243 จับคู่ได้ 6 แถว ถ้ารวมดิบจะได้ 56.04 ซึ่งไม่ใช่ต้นทุนของอะไรเลย)
const rz4 = sm.rows.filter(x => x.wo_no === 'WOFSC00000504')[0];
eq('คำตัดสิน Cost ref = has', rz4.cost_ref.verdict, 'has');
eq('ยังเตือน', rz4.notes.some(n => n.cls === 'warn'), true);
eq('บอกจำนวนแถวแทนยอดรวม',
  rz4.notes.some(n => n.text.indexOf('มีต้นทุนตั้งไว้ 2 แถว') >= 0), true);
eq('ห้ามบอกยอดรวมดิบของหลายแถว',
  rz4.notes.some(n => n.text.indexOf('ตั้งต้นทุนไว้ 25') >= 0), false);
eq('อ้างเลข Cost ref ครบทุกแถว',
  rz4.notes.some(n => n.text.indexOf('Cost ref 21, 22') >= 0), true);

// option 1 = ต้นทุนอยู่ที่ rate setup ไม่ได้อยู่บน record → ช่องเป็น 0 ก็สรุปว่า "ไม่มี" ไม่ได้
const rz5 = sm.rows.filter(x => x.wo_no === 'WOFSC00000505')[0];
eq('คำตัดสิน Cost ref = rate', rz5.cost_ref.verdict, 'rate');
eq('ยังเตือน ไม่ปล่อยผ่านเหมือน zero', rz5.notes.some(n => n.cls === 'warn'), true);
eq('บอกว่าคิดจาก Set Up Rate',
  rz5.notes.some(n => n.text.indexOf('คิดจาก Set Up Rate') >= 0), true);
eq('ต้องไม่ถูกนับเป็น "ไม่มีตามการตั้งค่า"',
  rz5.notes.some(n => n.cls === 'info'), false);

const rz3 = sm.rows.filter(x => x.wo_no === 'WOFSC00000503')[0];   // ไม่มี Cost ref เลย
eq('คำตัดสิน Cost ref = nomatch', rz3.cost_ref.verdict, 'nomatch');
eq('เตือนด้วยข้อความคนละแบบกับกรณีมีต้นทุน',
  rz3.notes.some(n => n.cls === 'warn' && n.text.indexOf('จับคู่ Cost ref ไม่ได้เลย') >= 0), true);

console.log('\n── ตัวกรองเดือน / จับจาก WOC ──');
const fm = T.readFilters({ month: '2026-06' });
eq('เลือกเดือนแล้ว from', fm.from, '2026-06-01');
eq('เลือกเดือนแล้ว to (สิ้นเดือน)', fm.to, '2026-06-30');
eq('ค่าเริ่มต้นจับจาก WOC', fm.basis, 'woc');
const ffeb = T.readFilters({ month: '2024-02' });
eq('ปีอธิกสุรทิน', ffeb.to, '2024-02-29');
const fc = T.readFilters({ month: 'custom', from: '2026-07-05', to: '2026-07-09' });
eq('กำหนดเอง from', fc.from, '2026-07-05');
eq('กำหนดเอง to', fc.to, '2026-07-09');
eq('กำหนดเองแล้ว month ว่าง', fc.month, '');
eq('เลือกจับจาก WO ได้', T.readFilters({ basis: 'wo' }).basis, 'wo');
const fdef = T.readFilters({});
eq('ไม่ส่งอะไรมา = เดือนปัจจุบันทั้งเดือน', fdef.from, fdef.month + '-01');

console.log('\n── โครงผลลัพธ์ (บรรทัด mainline ซ้ำต้องถูกตัด) ──');
eq('shown', sm.shown, 12);
eq('total', sm.total, 12);
eq('truncated', sm.truncated, false);
eq('WOFSC00000470 โผล่ครั้งเดียว', sm.rows.filter(x => x.wo_no === 'WOFSC00000470').length, 1);
let sumRm = 0; sm.rows.forEach(x => { sumRm += x.rm_cost; });
eq('ผลรวมวัตถุดิบไม่ถูกนับซ้ำ', sumRm, 347651.01 + 1000 * 8 + 173138.54, 1e-8);

console.log('\n── render ต้องไม่ throw และมีลิงก์เจาะลึก ──');
const html = T.renderSummaryPage(sm);
eq('มีลิงก์ &wo=WOFSC00000470', html.indexOf('wo=WOFSC00000470') > 0, true);
// เลข WO ต้องเป็นลิงก์ไปหน้าเจาะลึก ไม่ใช่ไป record — และลิงก์ record ต้องแยกบรรทัด กันกดผิด
const cell = /<td><a class="drill"[\s\S]*?<\/div><\/td>/.exec(html);
eq('เซลล์ WO มีโครงที่ถูก', !!cell, true);
eq('ลิงก์แรกไปหน้าเจาะลึก', /<a class="drill" href="[^"]*&wo=/.test(cell ? cell[0] : ''), true);
eq('ลิงก์ record อยู่ใน .nsrec แยกบรรทัด',
  /<div class="nsrec">[\s\S]*workord\.nl/.test(cell ? cell[0] : ''), true);
eq('ลิงก์ record มีข้อความบอกปลายทาง',
  (cell ? cell[0] : '').indexOf('เปิดใบสั่งผลิตใน NetSuite') > 0, true);
eq('ไม่มี undefined ใน html', html.indexOf('undefined') < 0, true);
eq('ขึ้น "ยังไม่มี" แทนศูนย์', html.indexOf('ยังไม่มี</td>') > 0, true);
eq('มีแถวรวมต่อสินค้า', html.indexOf('รวม 11010900010') > 0, true);
eq('มีคอลัมน์วันปิดงานผลิต', html.indexOf('<th>ปิดงานผลิต</th>') > 0, true);
eq('บอกว่าจับจากวันที่ปิดงานผลิต', html.indexOf('จับจาก<b>วันที่ปิดงานผลิต') > 0, true);
// จำนวนคอลัมน์ต้องเท่ากันทุกแถว ไม่งั้นตารางเบี้ยว (colspan ของแถวรวมต้องตามคอลัมน์ที่เพิ่ม)
const headCols = (html.match(/<th[ >]/g) || []).length;
eq('หัวตาราง 15 คอลัมน์', headCols, 15);
eq('ตารางอยู่ในกรอบเลื่อนได้', html.indexOf('<div class="scroll"><table><thead>') > 0, true);
// ใบที่ไม่มีใบเบิกวัตถุดิบ ต้องทำเครื่องหมายที่ตัวเลขต้นทุน/หน่วยเอง ไม่รอคอลัมน์หมายเหตุที่หลุดจอ
eq('ต้นทุนที่ไม่รวมวัตถุดิบมีธง ⚠ ที่ตัวเลข', html.indexOf('⚠</td>') > 0, true);
eq('มี title อธิบายว่าเป็นแปรสภาพล้วน', html.indexOf('เป็นต้นทุนแปรสภาพล้วน') > 0, true);

// ใบ MFG Summary Cost ซ้ำแบบมูลค่า 0 ต้องเป็น warn ไม่ใช่ bad (SB1 มีแบบนี้เยอะ ถ้าเป็น bad จะกลายเป็น noise)
console.log('\n── ใบ summary cost ซ้ำแบบมูลค่า 0 = warn ไม่ใช่ bad ──');
const FX_SC = FX['ภาพรวม — Summary Cost Item'];
FX['ภาพรวม — Summary Cost Item'] = [
  { wo_id: 1001, sc_value: 1020186.59, sc_docs: 1, sc_docs_valued: 1, sc_docs_orphan: 0 },
  { wo_id: 1003, sc_value: 1100, sc_docs: 3, sc_docs_valued: 1, sc_docs_orphan: 0 }
];
const smZ = T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
const rz = smZ.rows.filter(x => x.wo_no === 'WOFSC00000480')[0];
eq('ไม่ขึ้น bad', rz.notes.filter(n => n.cls === 'bad').length, 0);
eq('ขึ้น warn เอกสารเปล่า 2 ใบ', rz.notes.some(n => n.text.indexOf('มูลค่า 0 ค้างอยู่ 2 ใบ') >= 0), true);
FX['ภาพรวม — Summary Cost Item'] = FX_SC;

// query พังคืนแถวว่าง = อ่านเป็นเลข 0 ทุกช่อง ถ้าธงไม่มีการ์ดจะขึ้นแดงพร้อมกันทุกใบ
console.log('\n── อ่านจำนวนใบปิดงานไม่สำเร็จ ต้องไม่กล่าวหาว่าซ้ำ/ผูกไม่ครบ ──');
const FX_PROD = FX['ภาพรวม — ผลิตได้จริง'];
FX['ภาพรวม — ผลิตได้จริง'] = 'THROW';
const smNoWoc = T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
const rn = smNoWoc.rows.filter(x => x.wo_no === 'WOFSC00000227')[0];
eq('ขึ้นว่ายังไม่มีใบปิดงานผลิต',
  rn.notes.some(n => n.text.indexOf('ยังไม่มีใบปิดงานผลิต') >= 0), true);
eq('ไม่กล่าวหาว่าผูกไม่ครบ', rn.notes.some(n => n.text.indexOf('ยังไม่ถูกสรุป') >= 0), false);
eq('ทุกใบต้องไม่มีธงเรื่องการผูก',
  smNoWoc.rows.some(x => x.notes.some(n => n.text.indexOf('ผูกแค่') >= 0)), false);
FX['ภาพรวม — ผลิตได้จริง'] = FX_PROD;

console.log('\n── อ่านใบ summary cost ไม่สำเร็จ ต้องไม่กล่าวหาว่าตีราคาซ้ำ ──');
FX['ภาพรวม — Summary Cost Item'] = 'THROW';
const smNoSc = T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
eq('ไม่มีใบใดขึ้นตีราคาซ้ำ',
  smNoSc.rows.some(x => x.notes.some(n => n.text.indexOf('ตีราคาซ้ำ') >= 0)), false);
FX['ภาพรวม — Summary Cost Item'] = FX_SC;

// query พังคืนแถวว่าง ซึ่งอ่านเป็น "ไม่มี Cost ref" ได้ง่าย ๆ → จะกลายเป็นคำเตือนผิดทุกใบพร้อมกัน
console.log('\n── อ่าน Cost ref ไม่สำเร็จ ต้องไม่สรุปว่า "จับคู่ไม่ได้" ──');
const FX_CR = FX['Cost ref ของสินค้าที่ผลิต'];
FX['Cost ref ของสินค้าที่ผลิต'] = 'THROW';
const smErr = T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
const re1 = smErr.rows.filter(x => x.wo_no === 'WOFSC00000501')[0];
eq('คำตัดสินเป็น unknown', re1.cost_ref.verdict, 'unknown');
eq('กลับไปใช้คำเตือนเดิม', re1.notes.some(n => n.cls === 'warn'
  && n.text.indexOf('ยังไม่ปันส่วนต้นทุนแปรสภาพ') === 0), true);
eq('ไม่กล่าวหาว่าจับคู่ไม่ได้',
  re1.notes.some(n => n.text.indexOf('จับคู่ Cost ref ไม่ได้เลย') >= 0), false);
eq('บอกว่าอ่านไม่สำเร็จ', re1.notes.some(n => n.text.indexOf('อ่าน Cost ref ไม่สำเร็จ') >= 0), true);
FX['Cost ref ของสินค้าที่ผลิต'] = FX_CR;

console.log('\n── ตัด max แล้วต้องบอกว่าตัด ──');
const sm2 = T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31', max: '1' }));
eq('shown', sm2.shown, 1);
eq('total', sm2.total, 12);
eq('truncated', sm2.truncated, true);
eq('html แจ้งการตัด', T.renderSummaryPage(sm2).indexOf('แต่แสดงเพียง') > 0, true);

// ── ชั้นเจาะลึก: summaryLink คือฟังก์ชันที่ตัดสินซ้ำ/ครบ ต้องคิดเหมือนชั้นภาพรวมทุกกรณี ──
console.log('\n── summaryLink (ชั้นเจาะลึก) ──');
const scLine = (tran, amt) => ({ tran_id: tran, amount: amt, doc_no: 'IA-' + tran,
  recordtype: 'inventoryadjustment' });
const wocLine = (id, qty, ia) => ({ woc_id: id, woc_no: 'WOC-' + id, fg_qty: qty, sc_ia: ia });

// เคส WO-FSC-00000227 ย่อส่วน: 3 batch · ใบขั้นตอนกลางปริมาณ 0 · ใบ summary cost ผูกครบ
const lkOk = T.summaryLink(
  [scLine(9001, -100), scLine(9002, -100), scLine(9003, -100)],
  [wocLine(1, 0, null), wocLine(2, 0, null),
   wocLine(3, 50, 9001), wocLine(4, 50, 9002), wocLine(5, 50, 9003)]);
eq('รอบที่ตีราคา = ใบที่มีปริมาณ', lkOk.fgWocs, 3);
eq('ผูกครบ 3 ใบ', lkOk.linkedDocs, 3);
eq('ไม่มีใบ orphan', lkOk.orphanDocs.length, 0);
eq('ไม่มีใบปิดงานที่ยังไม่ผูก', lkOk.unlinkedWocs.length, 0);

// ตีราคาซ้ำ: ใบมีมูลค่า 2 ใบ แต่มีใบปิดงานอ้างถึงใบเดียว
const lkDup = T.summaryLink([scLine(9001, -100), scLine(9002, -100)], [wocLine(3, 50, 9001)]);
eq('ชี้ใบที่ไม่ถูกอ้างถึงได้', lkDup.orphanDocs.join(','), '9002');
eq('ไม่ปนกับเคสผูกไม่ครบ', lkDup.unlinkedWocs.length, 0);

// ใบเปล่ามูลค่า 0 ที่ไม่มีใครอ้าง ไม่ใช่ orphan — ไม่กระทบยอด
const lkEmpty = T.summaryLink([scLine(9001, -100), scLine(9002, 0)], [wocLine(3, 50, 9001)]);
eq('ใบมูลค่า 0 ไม่นับเป็นตีราคาซ้ำ', lkEmpty.orphanDocs.length, 0);
eq('นับใบทั้งหมดถูก', lkEmpty.docs, 2);
eq('นับใบที่มีมูลค่าถูก', lkEmpty.valuedDocs, 1);

// ปิดงานแล้วแต่ยังไม่มีใบ summary cost ผูก
const lkMiss = T.summaryLink([scLine(9001, -100)], [wocLine(3, 50, 9001), wocLine(4, 50, null)]);
eq('ชี้ใบปิดงานที่ยังไม่ผูก', lkMiss.unlinkedWocs.length, 1);
eq('ชี้เลขใบปิดงานได้', lkMiss.unlinkedWocs[0].woc_no, 'WOC-4');

// field custbody_mfg_adjsummarycost ถูก engine ใช้ปั๊ม move adjustment ด้วย
// ค่าที่ไม่ว่างแต่ไม่ใช่ใบ summary cost ต้องไม่ถูกนับว่า "ผูกแล้ว"
const lkMove = T.summaryLink([scLine(9001, -100)], [wocLine(3, 50, 8888)]);
eq('id ที่ไม่ใช่ใบ summary cost ไม่นับว่าผูก', lkMove.linkedDocs, 0);
eq('ใบ summary cost จึงกลายเป็น orphan', lkMove.orphanDocs.join(','), '9001');
eq('และใบปิดงานนับว่ายังไม่ผูก', lkMove.unlinkedWocs.length, 1);

// ── ชั้นเจาะลึก: explainSummaryGap ต้องแยกส่วนผลต่างได้ตรงกับตัวเลขจริงของ WO-FSC-00000227 ──
console.log('\n── explainSummaryGap (ชั้นเจาะลึก) ──');
// สร้าง s แบบย่อจากค่าจริงบน SB1: 10 batch · ใบเบิกใบเดียว 173,138.54 · แปรสภาพ batch ละ 6,257.80
// (batch สุดท้ายผลิต 3,600 จาก 18,000 แปรสภาพจึงเป็น 4,389.80 และใบคิดไว้แค่ 1,401.00)
const BATCHES = [3924, 3934, 3935, 3936, 3937, 3938, 3939, 3940, 3941, 3942];
const gWocs = [], gSc = [], gCa = [];
BATCHES.forEach((b, i) => {
  const last = i === BATCHES.length - 1;
  const iaId = 184213 + i * 2;
  const fgWocId = 184214 + i * 2;
  const convBatch = last ? 4389.8 : 6257.8;
  const onDoc = last ? 1401.0 : 6257.8;       // ยอดแปรสภาพที่ "ใบ summary cost" คิดไว้
  // ใบปิดงานขั้นกลางสองใบ (ปริมาณ 0) + ใบขั้นสุดท้ายที่ผูกใบ summary cost
  gWocs.push({ woc_id: 900 + i * 3, woc_no: 'WOC-mix-' + b, batch_id: b, fg_qty: 0, sc_ia: null });
  gWocs.push({ woc_id: 901 + i * 3, woc_no: 'WOC-fil-' + b, batch_id: b, fg_qty: 0, sc_ia: null });
  gWocs.push({ woc_id: fgWocId, woc_no: 'WOC-pack-' + b, batch_id: b,
    fg_qty: last ? 3600 : 18000, sc_ia: iaId });
  gSc.push({ tran_id: iaId, doc_no: 'IA-' + iaId, recordtype: 'inventoryadjustment',
    amount: -(173138.54 + onDoc) });
  // เอกสารปันส่วนอ้าง WOC ราย ขั้นตอน — ใส่ยอดของ batch ไว้ที่ใบปิดงานขั้นสุดท้ายของ batch นั้น
  gCa.push({ woc_id: fgWocId, cost_class: 7, std_cost: convBatch, act_cost: convBatch });
});
const gS = {
  rmTotal: 173138.54, convStd: 60710, summaryLines: gSc, wocs: gWocs, ca: gCa,
  issueDocs: [190321], summaryLink: T.summaryLink(gSc, gWocs)
};
const g = T.explainSummaryGap(gS, {});
eq('ผลต่างตรงกับที่ชั้นภาพรวมได้', g.gap, 1555258.06, 1e-6);
eq('เข้าลายเซ็นอาการ (ทุกใบมียอดวัตถุดิบทั้งก้อนอยู่ข้างใน)', g.detected, true);
eq('ใบ summary cost ที่มีมูลค่า', g.docs, 10);
eq('ใบเบิกวัตถุดิบใบเดียว', g.rmDocs, 1);
eq('ยอดที่นับเกิน', g.overCount, 1558246.86, 1e-6);
eq('เหลือที่อธิบายไม่ได้ = แปรสภาพ batch สุดท้ายที่ใบคิดต่ำไป', g.residual, -2988.80, 1e-6);
// ใบ 9 ใบแรกต้องปิดพอดี ใบสุดท้ายเท่านั้นที่ต่าง — ยืนยันว่าแยกส่วนราย batch ถูก
eq('เก้าใบแรกแปรสภาพตรงกับที่ปันส่วน',
  g.rows.slice(0, 9).every(r => Math.abs(r.conv_diff) < 0.005), true);
eq('ใบสุดท้ายคิดแปรสภาพต่ำไป 2,988.80', g.rows[9].conv_diff, -2988.80, 1e-6);
eq('ใบสุดท้ายผูก batch ถูก', g.rows[9].batch_id, '3942');
eq('หักยอดวัตถุดิบแล้วเหลือเท่าที่ใบคิดไว้', g.rows[9].less_rm, 1401.0, 1e-6);

// ใบเดียวไม่เข้าลายเซ็น — ห้ามสรุปว่านับซ้ำ
const g1 = T.explainSummaryGap({
  rmTotal: 1000, convStd: 100, summaryLines: [{ tran_id: 1, doc_no: 'IA-1', amount: -5000 }],
  wocs: [{ woc_id: 9, woc_no: 'W9', batch_id: 1, fg_qty: 10, sc_ia: 1 }], ca: [], issueDocs: [1],
  summaryLink: T.summaryLink([{ tran_id: 1, amount: -5000 }],
    [{ woc_id: 9, fg_qty: 10, sc_ia: 1 }])
}, {});
eq('ใบเดียว = ไม่เข้าลายเซ็น', g1.detected, false);
eq('ไม่คิดยอดนับเกิน', g1.overCount, 0);

// ไม่มียอดวัตถุดิบ = สูตรนี้อธิบายอะไรไม่ได้ ห้ามชี้นิ้วผิดจุด
const g0 = T.explainSummaryGap({
  rmTotal: 0, convStd: 100, summaryLines: [{ tran_id: 1, amount: -50 }, { tran_id: 2, amount: -50 }],
  wocs: [], ca: [], issueDocs: [],
  summaryLink: T.summaryLink([{ tran_id: 1, amount: -50 }, { tran_id: 2, amount: -50 }], [])
}, {});
eq('ไม่มียอดวัตถุดิบ = ไม่เข้าลายเซ็น', g0.detected, false);

console.log('\n' + (fail ? fail + ' FAILED' : 'ผ่านทั้งหมด'));
process.exit(fail ? 1 : 0);
