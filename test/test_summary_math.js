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
    // บรรทัด mainline='T' ซ้ำของใบเดิม — ต้องถูกตัดออก ไม่งั้นยอดของใบนี้ถูกบวกสองครั้ง
    { wo_id: 1001, wo_no: 'WOFSC00000470', wo_date: '23/7/2026', wo_date_iso: '2026-07-23',
      wo_status: 'Released', production_line: 'LINE1', item_id: 501,
      item_code: '11010900010', item_name: 'FG ส้ม 300 มล.', wo_qty: 163000,
      unit_name: 'BOTTLE', base_per_carton: 48 }
  ],
  'ภาพรวม — ผลิตได้จริง': [
    // woc_in_range < woc_count = ปิดงานคร่อมช่วง ต้องขึ้นหมายเหตุแต่ยอดยังนับทุกใบ
    { wo_id: 1001, woc_qty: 160276, woc_count: 3, woc_in_range: 3,
      woc_last: '25/07/2026', woc_last_iso: '2026-07-25' },
    { wo_id: 1003, woc_qty: 900, woc_count: 2, woc_in_range: 1,
      woc_last: '02/08/2026', woc_last_iso: '2026-08-02' },
    { wo_id: 1004, woc_qty: 24000, woc_count: 1, woc_in_range: 1,
      woc_last: '23/07/2026', woc_last_iso: '2026-07-23' },
    // สามใบทดสอบ Cost ref — ปิดงานและเบิกของครบ ต่างกันแค่เรื่อง Cost ref อย่างเดียว
    { wo_id: 1005, woc_qty: 500, woc_count: 1, woc_in_range: 1,
      woc_last: '21/07/2026', woc_last_iso: '2026-07-21' },
    { wo_id: 1006, woc_qty: 500, woc_count: 1, woc_in_range: 1,
      woc_last: '21/07/2026', woc_last_iso: '2026-07-21' },
    { wo_id: 1007, woc_qty: 500, woc_count: 1, woc_in_range: 1,
      woc_last: '21/07/2026', woc_last_iso: '2026-07-21' },
    { wo_id: 1008, woc_qty: 500, woc_count: 1, woc_in_range: 1,
      woc_last: '21/07/2026', woc_last_iso: '2026-07-21' },
    { wo_id: 1009, woc_qty: 500, woc_count: 1, woc_in_range: 1,
      woc_last: '21/07/2026', woc_last_iso: '2026-07-21' }
  ],
  'ภาพรวม — วัตถุดิบและบรรจุภัณฑ์': [
    { wo_id: 1001, rm_cost: 347651.01, doc_count: 1, item_count: 30 },
    { wo_id: 1003, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1005, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1006, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1007, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1008, rm_cost: 1000, doc_count: 1, item_count: 2 },
    { wo_id: 1009, rm_cost: 1000, doc_count: 1, item_count: 2 }
  ],
  'ภาพรวม — ต้นทุนแปรสภาพ': [
    { wo_id: 1001, dl_oh_std: 70298.58, dl_oh_act: 70298.58, ca_docs: 1 },
    { wo_id: 1003, dl_oh_std: 100, dl_oh_act: 100, ca_docs: 1 },
    { wo_id: 1004, dl_oh_std: 21754, dl_oh_act: 21754, ca_docs: 1 }
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
  'ภาพรวม — Summary Cost Item': [
    { wo_id: 1001, sc_value: 1020186.59, sc_docs: 1, sc_docs_valued: 1 },
    // 3 ใบ แต่มีมูลค่าจริง 2 ใบ = ตีราคาซ้ำ (bad) · อีกใบมูลค่า 0 = เอกสารเปล่า
    { wo_id: 1003, sc_value: 1100, sc_docs: 3, sc_docs_valued: 2 },
    { wo_id: 1004, sc_value: 21754, sc_docs: 1, sc_docs_valued: 1 },
    { wo_id: 1005, sc_value: 1000, sc_docs: 1, sc_docs_valued: 1 },
    { wo_id: 1006, sc_value: 1000, sc_docs: 1, sc_docs_valued: 1 },
    { wo_id: 1007, sc_value: 1000, sc_docs: 1, sc_docs_valued: 1 },
    { wo_id: 1008, sc_value: 1000, sc_docs: 1, sc_docs_valued: 1 },
    { wo_id: 1009, sc_value: 1000, sc_docs: 1, sc_docs_valued: 1 }
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
  'return { onRequest: onRequest, __t: { buildSummary, readFilters, renderSummaryPage, renderSummaryGrid } };');

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
eq('ข้อความบอกจำนวนใบที่มีมูลค่า', r3.notes.some(n => n.text.indexOf('มีมูลค่า 2 ใบ') >= 0), true);
eq('เตือนปิดงานคร่อมช่วง', r3.notes.some(n => n.text.indexOf('คร่อมช่วง') >= 0), true);
eq('ไม่เตือนคร่อมช่วงกับใบที่อยู่ในช่วงทั้งหมด',
  r.notes.some(n => n.text.indexOf('คร่อมช่วง') >= 0), false);

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
eq('shown', sm.shown, 9);
eq('total', sm.total, 9);
eq('truncated', sm.truncated, false);
eq('WOFSC00000470 โผล่ครั้งเดียว', sm.rows.filter(x => x.wo_no === 'WOFSC00000470').length, 1);
let sumRm = 0; sm.rows.forEach(x => { sumRm += x.rm_cost; });
eq('ผลรวมวัตถุดิบไม่ถูกนับซ้ำ', sumRm, 347651.01 + 1000 * 6, 1e-8);

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
FX['ภาพรวม — Summary Cost Item'] = [
  { wo_id: 1001, sc_value: 1020186.59, sc_docs: 1, sc_docs_valued: 1 },
  { wo_id: 1003, sc_value: 1100, sc_docs: 3, sc_docs_valued: 1 }
];
const smZ = T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
const rz = smZ.rows.filter(x => x.wo_no === 'WOFSC00000480')[0];
eq('ไม่ขึ้น bad', rz.notes.filter(n => n.cls === 'bad').length, 0);
eq('ขึ้น warn เอกสารเปล่า 2 ใบ', rz.notes.some(n => n.text.indexOf('มูลค่า 0 ค้างอยู่ 2 ใบ') >= 0), true);

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
eq('total', sm2.total, 9);
eq('truncated', sm2.truncated, true);
eq('html แจ้งการตัด', T.renderSummaryPage(sm2).indexOf('แต่แสดงเพียง') > 0, true);

console.log('\n' + (fail ? fail + ' FAILED' : 'ผ่านทั้งหมด'));
process.exit(fail ? 1 : 0);
