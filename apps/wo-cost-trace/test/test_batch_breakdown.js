/**
 * Harness — ใบปิดงานผลิตต้องแตกเป็นกลุ่มราย batch (issue #77)
 *
 * ที่มา: ผู้ใช้ (ฝ่ายต้นทุน) อ่านตารางใบปิดงานผลิตของ WO ที่แตกหลาย batch ไม่ออก เพราะของเดิม
 * วนแถวเรียบ ๆ ใบละแถว ต้องไล่อ่านคอลัมน์ batch เองทีละบรรทัด · และคำถามจริงของผู้ใช้คือ
 * "ใบนี้แตกกี่ batch เดินไปกี่ batch แล้ว" ซึ่งตอบจากใบปิดงานอย่างเดียวไม่ได้
 * (ตรวจบน SB1: WO-FSC-00001293 มี task 19 ใบ = 19 batch แต่มีใบปิดงานแค่ 5 ใบ)
 *
 * สิ่งที่ล็อกไว้ที่นี่
 *   1. จัดกลุ่มตาม batch ถูก และยอดรวมต่อกลุ่มถูก
 *   2. "ปิดงานแล้ว" นับจาก **ใบปิดงานที่มีปริมาณ ≠ 0** ไม่ใช่นับ WOC (WOC เกิดต่อขั้นตอน)
 *   3. batch ที่ปิดงานแล้วแต่ไม่มีใบ summary cost ผูก = ธงแดง · ตัดสินที่ **การผูก** ไม่ใช่จำนวนใบ
 *      และต้องอ่านจาก `summaryLink.unlinkedWocs` ตัวเดียวกับที่ชั้น WO ใช้
 *   4. batch ที่ปล่อยงานแล้วแต่ยังไม่ปิดงาน = "ยังไม่ปิดงาน" **ห้ามเป็นธงแดง** และห้ามหายไป
 *   5. WOC ที่หา batch ไม่ได้ → กลุ่ม "ไม่ระบุ batch" ต้องแสดง ห้ามหายเงียบ ๆ
 *   6. WO ที่มี batch เดียวต้องไม่ถูกยัดหัวกลุ่ม (ตารางเหมือนเดิม)
 *   7. ผลรวม fg ของทุกกลุ่ม = `produced` ที่ทุกชั้นใช้เป็นตัวหาร (กติกายอดสองชั้นต้องเท่ากัน)
 *   8. ทุกค่าที่มาจากข้อมูลแล้ววาดลง HTML ผ่าน `esc()` (ต่อจาก XSS ที่ปิดไปใน #73)
 *   9. query รายการ batch พัง → ต้องอ่านเป็น "อ่านไม่สำเร็จ" ไม่ใช่ "0 batch"
 *  10. `explainSummaryGap` ยังจับคู่ batch ได้เหมือนเดิมหลังยกแผนที่ batch ออกมาเป็น
 *      `batchIndex()` — โดยเฉพาะ WOC ที่ไม่มี batch ซึ่งใช้คีย์สตริงว่าง ไม่ใช่ null
 *  11. ช่องเลขที่ใบสั่งผลิตรับทั้ง `WO-FSC-...` และ `WOFSC...` — **ทั้งสองชั้น** (#77 ข้อ B5)
 *      และเลขที่ที่ตัดขีดแล้วชนกันหลายใบต้องขึ้นคำเตือน ไม่ใช่เลือกใบให้เงียบ ๆ
 *  12. **ยอดราย batch ห้ามบวกข้ามขั้นตอน** — `pro_qty`/`good_qty` เป็นก้อนเดียวกันที่ไหลผ่าน
 *      สายผลิต (`pro_qty` ขั้น N = `good_qty` ขั้น N−1) · แผน = ขั้นแรก · ดี = ขั้นสุดท้าย ·
 *      เสีย/รับเข้าคลัง บวกข้ามขั้นได้ · ตัดสินขั้นไม่ได้ = "ไม่ทราบ" ห้ามเดาเป็น SUM/MAX
 *  13. ใบขั้นกลาง (`sc_ia` ว่างตามปกติของระบบ) ต้องไม่ทำให้ batch ขึ้นธงแดงปลอม
 *
 * ซีนที่อิงข้อมูลจริงบน SB1: WO-FSC-00001293 (19 batch × 1 ขั้น) · WO-FSC-00000216 batch 2888
 * (1 batch × 3 ขั้น) · ส่วน "หลาย batch × หลายขั้นตอนพร้อมกัน" บัญชียังไม่มีเคสจริง จึงเป็น unit test ล้วน
 *
 * รัน: node apps/wo-cost-trace/test/test_batch_breakdown.js
 */
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq();

const WO = FX.WO_ID;
const isSc = (r) => r.adj_summarycost === 'T' || r.is_summary === 'T';
const RM_LINES = FX.ISSUE_LINES.filter((r) => !isSc(r));

/** ใบ summary cost ที่ใช้ในซีนหลัก — ใบหนึ่งผูก batch 4423 อีกใบผูก WOC ที่ไม่มี batch */
const SC_LINES = [
  { wo_id: WO, tran_id: 6001, recordtype: 'inventoryadjustment', doc_no: 'IA-FSC-260800101',
    trandate: '2/8/2026', trandate_iso: '2026-08-02', line_id: 1,
    adj_type: 'MFG Summary Cost', adj_summarycost: 'T', adj_rawmaterial: 'F', adj_issuedsupply: 'F',
    item_id: 999, item_code: 'SUMMARYCOST', item_name: 'MFG Summary Cost Item', item_type: 'InvtPart',
    is_summary: 'T', quantity: 1, unit_name: 'UNIT', rate: 300000, amount: -300000,
    location_name: 'WH-TR', task_id: null, woc_id: 7101 },
  { wo_id: WO, tran_id: 6003, recordtype: 'inventoryadjustment', doc_no: 'IA-FSC-260800103',
    trandate: '4/8/2026', trandate_iso: '2026-08-04', line_id: 1,
    adj_type: 'MFG Summary Cost', adj_summarycost: 'T', adj_rawmaterial: 'F', adj_issuedsupply: 'F',
    item_id: 999, item_code: 'SUMMARYCOST', item_name: 'MFG Summary Cost Item', item_type: 'InvtPart',
    is_summary: 'T', quantity: 1, unit_name: 'UNIT', rate: 50000, amount: -50000,
    location_name: 'WH-TR', task_id: null, woc_id: 7104 }
];

// ── ซีนหลัก: WO แตก 4 batch (โครงเดียวกับ WO-FSC-00001293 บน SB1 แต่ย่อจำนวนลง) ──
// 4423 ปิดงานแล้ว + ผูกใบ summary cost   → ปกติ
// 4424 ปิดงานแล้ว + ยังไม่ผูก             → ธงแดง
// 4425 มีแต่ใบขั้นตอนกลาง (ปริมาณ 0)     → ยังไม่ปิดงาน ห้ามเป็นธงแดง
// 4426 ปล่อยงานแล้วแต่ยังไม่มีใบปิดงานเลย → ต้องยังเห็นในตาราง (ข้อ A1 ของ #77)
// เพิ่ม WOC ที่ไม่มี batch และ WOC ที่ batch เป็นข้อความอันตราย เพื่อคุมข้อ 5 และข้อ 8
const TASKS = [
  { wo_id: WO, batch_id: 4423, pro_qty: 87500, good_qty: 87500, op_seq: 1, last_task: 'T', prev_task: null },
  { wo_id: WO, batch_id: 4424, pro_qty: 87500, good_qty: 87500, op_seq: 1, last_task: 'T', prev_task: null },
  { wo_id: WO, batch_id: 4425, pro_qty: 87500, good_qty: 0, op_seq: 1, last_task: 'T', prev_task: null },
  { wo_id: WO, batch_id: 4426, pro_qty: 87500, good_qty: 0, op_seq: 1, last_task: 'T', prev_task: null },
  // 4428 ปิดงานแล้วแต่ `sc_ia` ชี้เอกสารที่ไม่ใช่ใบ summary cost (move adjustment) → ต้องเป็นธงแดง
  { wo_id: WO, batch_id: 4428, pro_qty: 1000, good_qty: 1000, op_seq: 1, last_task: 'T', prev_task: null }
];

const HOSTILE_BATCH = '44<img src=x onerror=alert(1)>';
const HOSTILE_TASK = '"><b>task</b>';

const WOCS = [
  { wo_id: WO, woc_id: 7101, woc_no: 'WOC-FSC-00000532', woc_date: '02/08/2026',
    good_qty: 87500, scrap_qty: 0, sc_ia: 6001, fg_qty: 87500,
    task_no: 'OP-30', task_name: 'Packing', batch_id: 4423, pro_qty: 87500,
    op_seq: 1, last_task: 'T' },
  { wo_id: WO, woc_id: 7102, woc_no: 'WOC-FSC-00000533', woc_date: '03/08/2026',
    good_qty: 87000, scrap_qty: 500, sc_ia: null, fg_qty: 87500,
    task_no: 'OP-30', task_name: 'Packing', batch_id: 4424, pro_qty: 87500,
    op_seq: 1, last_task: 'T' },
  { wo_id: WO, woc_id: 7103, woc_no: 'WOC-FSC-00000534', woc_date: '03/08/2026',
    good_qty: 0, scrap_qty: 0, sc_ia: null, fg_qty: 0,
    task_no: 'OP-10', task_name: 'Mixing', batch_id: 4425, pro_qty: 0,
    op_seq: 1, last_task: 'F' },
  { wo_id: WO, woc_id: 7104, woc_no: 'WOC-FSC-00000535', woc_date: '04/08/2026',
    good_qty: 5000, scrap_qty: 0, sc_ia: 6003, fg_qty: 5000,
    task_no: 'OP-30', task_name: 'Packing', batch_id: null, pro_qty: 5000,
    op_seq: 1, last_task: 'T' },
  { wo_id: WO, woc_id: 7105, woc_no: 'WOC-FSC-00000536', woc_date: '04/08/2026',
    good_qty: 0, scrap_qty: 0, sc_ia: null, fg_qty: 0,
    task_no: 'OP-10', task_name: HOSTILE_TASK, batch_id: HOSTILE_BATCH, pro_qty: 0,
    op_seq: 1, last_task: 'T' },
  // ⚠ เคสที่คอมเมนต์ของ summaryLink() เตือนไว้เอง: `custbody_mfg_adjsummarycost` ถูก engine
  // ใช้ปั๊ม move adjustment ด้วย · ใบนี้ "มี sc_ia" แต่เอกสารนั้นไม่ใช่ใบ summary cost
  // ต้องถูกนับเป็น "ยังไม่ผูก" — เช็กแค่ `!sc_ia` จะหลุดเคสนี้
  { wo_id: WO, woc_id: 7106, woc_no: 'WOC-FSC-00000537', woc_date: '05/08/2026',
    good_qty: 1000, scrap_qty: 0, sc_ia: 777777, fg_qty: 1000,
    task_no: 'OP-30', task_name: 'Packing', batch_id: 4428, pro_qty: 1000,
    op_seq: 1, last_task: 'T' }
];

const CAS = [
  { wo_id: WO, ca_id: 8101, ca_no: 'WCA-FSC-260800001', ca_date: '2/8/2026', woc_id: 7101,
    cost_class: 2, acct_no: '5301001', acct_name: 'Direct Labor', std_cost: 1000, act_cost: 1000 },
  { wo_id: WO, ca_id: 8101, ca_no: 'WCA-FSC-260800001', ca_date: '4/8/2026', woc_id: 7104,
    cost_class: 3, acct_no: '5302001', acct_name: 'Overhead', std_cost: 500, act_cost: 500 },
  { wo_id: WO, ca_id: 8101, ca_no: 'WCA-FSC-260800001', ca_date: '4/8/2026', woc_id: null,
    cost_class: FX.CLASS_WIP, acct_no: '1414001', acct_name: 'WIP', std_cost: 1500, act_cost: 1500 }
];

/** fixture ของซีน = ของ parity ทั้งชุด แล้วทับเฉพาะ label ที่ซีนนี้สนใจ */
function scene(over) {
  return Object.assign({}, FX.drilldown(), over || {});
}

const MAIN_FX = scene({
  'ใบปิดงานผลิต (WOC)': WOCS,
  'งานที่ปล่อยราย batch (task)': TASKS,
  'ใบเบิกวัตถุดิบเข้า WO': RM_LINES.concat(SC_LINES),
  'เอกสารปันส่วนต้นทุน': CAS
});

const EXPORTS = ['buildModel', 'batchIndex', 'batchGroups', 'renderWOCs', 'renderPage',
  'explainSummaryGap', 'renderMaterials', 'rowStatus'];

const main = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: MAIN_FX,
  quietLog: true,
  exports: EXPORTS,
  libExports: { 'WOCostTrace_Common.js': ['qWO', 'QLOG'] }
});
const T = main.T;
const m = T.buildModel(FX.WO_HEADER.wo_no);
const s = m.root;
const bg = T.batchGroups(s);
const byKey = {};
bg.groups.forEach((g) => { byKey[g.key] = g; });

console.log('\n── 1. จัดกลุ่มตาม batch ──');
eq('หา WO เจอ', m.ok, true);
// จำนวนคำสั่งที่ชั้นเจาะลึกยิงจริง — วัดจาก QLOG ไม่ใช่นับด้วยตา (เอกสารอ้างตัวเลขนี้อยู่)
// ⚠ 17 คือของ **ใบที่ไม่มีกึ่งสำเร็จรูป** ตาม fixture ชุดนี้ (ไม่มี lot → ไม่มี WO ต้นทาง
// → ชุด query ของชั้นที่ 2 ไม่ถูกยิง) · ตัวเลข "20 คำสั่ง" ในเอกสารเป็นของใบจริงบน SB1
// ที่มีชั้นที่ 2 ครบ — คนละฐานกัน ห้ามเอามาเทียบกันตรง ๆ
// สิ่งที่ล็อกที่นี่คือ **ก้อนนี้เพิ่ม query ให้ชั้นเจาะลึกตัวเดียว** ไม่ใช่เพิ่มเป็นชุด
const QLOG = main.libT['WOCostTrace_Common.js'].QLOG;
eq('จำนวนคำสั่งของชั้นเจาะลึก (ใบที่ไม่มีกึ่งสำเร็จรูป ตาม fixture นี้)', QLOG.length, 17);
eq('query รายการ batch ยิงครั้งเดียวต่อการเปิดหนึ่งครั้ง',
  QLOG.filter((q) => q.label === 'งานที่ปล่อยราย batch (task)').length, 1);
eq('ไม่มีคำสั่งไหนพังในซีนนี้', QLOG.filter((q) => q.error).length, 0);
eq('จำนวนกลุ่มบนหน้าจอ (5 batch ที่ปล่อยงาน + batch ที่มาจาก WOC + ไม่ระบุ batch)', bg.groupCount, 7);
// กลุ่ม "ไม่ระบุ batch" ไม่ใช่ batch — ห้ามถูกนับรวมในบรรทัด "แตกกี่ batch"
eq('จำนวน batch จริง (ไม่นับกลุ่มไม่ระบุ batch)', bg.batches, 6);
eq('จำนวนใบปิดงานที่ระบุ batch ไม่ได้', bg.unbatchedWocs, 1);
eq('ลำดับกลุ่มเริ่มที่ batch ที่ปล่อยงานแล้ว', bg.groups.map((g) => g.key).slice(0, 4).join(','),
  '4423,4424,4425,4426');
eq('กลุ่ม "ไม่ระบุ batch" ใช้คีย์สตริงว่าง (ไม่ใช่ null)',
  bg.groups.some((g) => g.key === ''), true);
eq('batch ที่ปล่อยงานแล้ว', bg.releasedBatches, 5);
eq('ใบปิดงานผลิตทั้งหมด', bg.wocCount, WOCS.length);

console.log('\n── 2. "ปิดงานแล้ว" นับจากใบที่มีปริมาณ ไม่ใช่นับ WOC ──');
eq('ปิดงานแล้วกี่ batch (4423 · 4424 · 4428 — กลุ่มไม่ระบุ batch ไม่ถูกนับ)', bg.closedBatches, 3);
eq('4425 มีแต่ใบขั้นตอนกลาง → ยังไม่ปิดงาน', byKey['4425'].closed, false);
eq('4425 ไม่ใช่ธงแดง (งานที่ยังไม่ถึงคิว ไม่ใช่ข้อมูลผิด)', byKey['4425'].flagged, false);
eq('4426 ปล่อยงานแล้วแต่ไม่มีใบปิดงานเลย', byKey['4426'].wocs.length, 0);
eq('4426 ไม่ใช่ธงแดง', byKey['4426'].flagged, false);
eq('4426 ยังรู้ปริมาณที่ปล่อยงานไว้', byKey['4426'].releasedPlan, 87500);

console.log('\n── 3. ยอดรวมต่อกลุ่ม ──');
eq('4423 รับเข้าคลัง', byKey['4423'].fg, 87500);
eq('4424 ดี', byKey['4424'].good, 87000);
eq('4424 เสีย', byKey['4424'].scrap, 500);
// แผนอ่านจาก task ขั้นแรก ไม่ใช่จากใบปิดงาน — ใบขั้นกลางที่ pro_qty 0 จึงไม่ลบยอดแผนทิ้ง
eq('4425 แผน (มาจาก task ขั้นแรก ไม่ใช่จากใบปิดงาน)', byKey['4425'].plan, 87500);
eq('ไม่ระบุ batch รับเข้าคลัง', byKey[''].fg, 5000);
// กติกาที่ห้ามพัง: ตัวหารของต้นทุนต่อหน่วยต้องเป็นค่าเดียวกันทุกชั้น
let sumFg = 0;
bg.groups.forEach((g) => { sumFg += g.fg; });
eq('ผลรวมทุกกลุ่ม = ปริมาณที่ผลิตได้ของ WO', sumFg, s.produced);

console.log('\n── 4. ธงแดงตัดสินที่การผูก ไม่ใช่จำนวนใบ ──');
eq('4423 ผูกใบ summary cost แล้ว', byKey['4423'].scDocs.length, 1);
eq('4423 ไม่ขึ้นธงแดง', byKey['4423'].flagged, false);
eq('4424 ปิดงานแล้วแต่ไม่มีใบผูก → ธงแดง', byKey['4424'].flagged, true);
eq('4424 จำนวนรอบที่ยังไม่ผูก', byKey['4424'].unlinkedWocs, 1);
eq('จำนวน batch ที่ขึ้นธงแดง', bg.flaggedBatches, 2);
// ⚠ เคส move adjustment: `sc_ia` ไม่ว่างแต่ไม่ใช่ใบ summary cost — ถ้าตัดสินด้วย `!sc_ia`
// ตรง ๆ เคสนี้จะหลุดเป็น "ผูกแล้ว" ทั้งที่ต้นทุนรอบนั้นยังไม่ถูกสรุป
eq('4428 sc_ia ชี้เอกสารที่ไม่ใช่ใบ summary cost → ยังไม่ผูก', byKey['4428'].unlinkedWocs, 1);
eq('4428 ไม่มีใบ summary cost ผูกเลย', byKey['4428'].scDocs.length, 0);
eq('4428 ขึ้นธงแดง', byKey['4428'].flagged, true);
// ธงของ batch ต้องมาจากชุดเดียวกับที่ชั้น WO ใช้ ไม่งั้นสองระดับตอบคนละอย่างกับใบเดียวกัน
let unlinkedInGroups = 0;
bg.groups.forEach((g) => { unlinkedInGroups += g.unlinkedWocs; });
eq('จำนวนใบที่ยังไม่ผูก = ของ summaryLink ทั้งใบ', unlinkedInGroups, s.summaryLink.unlinkedWocs.length);

console.log('\n── 5. HTML ของตารางใบปิดงานผลิต ──');
const html = T.renderWOCs(s);
eq('ห่อด้วย .scroll', /<div class="scroll"><table><thead>/.test(html), true);
eq('มี thead จริง (ไม่งั้น sticky ไม่ทำงาน)', /<thead>[\s\S]*<\/thead>/.test(html), true);
eq('มี tbody ปิดครบ', html.indexOf('</tbody></table></div>') > 0, true);
eq('หัวตารางบอกว่าแตกกี่ batch', html.indexOf('แตก 6 batch') >= 0, true);
eq('หัวตารางบอกว่าปิดงานแล้วกี่ batch', html.indexOf('ปิดงานแล้ว 3 batch') >= 0, true);
eq('หัวตารางบอกจำนวนใบที่ระบุ batch ไม่ได้', html.indexOf('ระบุ batch ไม่ได้ 1 ใบ') >= 0, true);
eq('หัวตารางบอกจำนวนใบปิดงาน', html.indexOf('6 ใบปิดงานผลิต') >= 0, true);
eq('มีหัวกลุ่มของ batch', html.indexOf('batch 4423') >= 0, true);
// กลุ่มที่มีใบปิดงานใบเดียวขั้นเดียวไม่ต้องมีแถวรวม — แถวนั้นคือคำตอบอยู่แล้ว
eq('กลุ่มใบเดียวขั้นเดียวไม่มีแถวรวม', html.indexOf('รวม batch 4423') >= 0, false);
eq('กลุ่ม "ไม่ระบุ batch" แสดงจริง', html.indexOf('ไม่ระบุ batch') >= 0, true);
eq('batch ที่ยังไม่ปิดงานขึ้นข้อความ "ยังไม่ปิดงาน"', html.indexOf('ยังไม่ปิดงาน') >= 0, true);
eq('batch ที่ปล่อยงานแล้วแต่ไม่มีใบปิดงานยังอยู่ในตาราง', html.indexOf('batch 4426') >= 0, true);
eq('ธงแดงของ batch บอกว่ายังไม่มีใบ summary cost ผูก',
  html.indexOf('แต่ยังไม่มีใบ MFG Summary Cost ผูก') >= 0, true);
eq('แถวรวมท้ายตารางยังอ่านจาก produced เดิม',
  html.indexOf('รวมรับเข้าคลัง (ตัวหารของต้นทุนต่อหน่วย)') >= 0, true);

console.log('\n── 6. ทุกค่าที่มาจากข้อมูลผ่าน esc() ──');
eq('batch ที่เป็นข้อความอันตรายถูก escape', html.indexOf('&lt;img src=x onerror=alert(1)&gt;') >= 0, true);
eq('ไม่มี <img ดิบหลุดลง HTML', html.indexOf('<img src=x') >= 0, false);
eq('ชื่อขั้นตอนที่เป็นข้อความอันตรายถูก escape', html.indexOf('&quot;&gt;&lt;b&gt;task&lt;/b&gt;') >= 0, true);
eq('ไม่มี <b> ดิบจากชื่อขั้นตอน', html.indexOf('><b>task</b>') >= 0, false);

console.log('\n── 7. explainSummaryGap ยังจับคู่ batch เหมือนเดิมหลังยก batchIndex ออกมา ──');
const idx = T.batchIndex(s.wocs);
eq('batchIndex ให้คีย์สตริงว่างกับ WOC ที่ไม่มี batch', idx.batchByWoc['7104'], '');
eq('batchIndex เก็บ WOC ครบทุกใบ',
  Object.keys(idx.wocsByBatch).reduce((t, k) => t + idx.wocsByBatch[k].length, 0), WOCS.length);
const gap = T.explainSummaryGap(s, m.ctx);
const rowByDoc = {};
gap.rows.forEach((r) => { rowByDoc[r.tran_id] = r; });
eq('ใบที่ผูก WOC ของ batch 4423 ได้ batch 4423', rowByDoc['6001'].batch_id, '4423');
eq('ใบที่ผูก WOC ที่ไม่มี batch ได้คีย์ว่าง (ไม่ใช่ "หา batch ไม่ได้")', rowByDoc['6003'].batch_id, '');
eq('ต้นทุนแปรสภาพของ batch 4423', rowByDoc['6001'].conv_batch, 1000);
eq('ต้นทุนแปรสภาพของกลุ่มที่ไม่มี batch ยังนับได้', rowByDoc['6003'].conv_batch, 500);

console.log('\n── 8. หน้าเจาะลึกมีสารบัญและ anchor ครบ ──');
const page = T.renderPage(m);
eq('มีแถบสารบัญ', page.indexOf('<nav class="toc"') >= 0, true);
['sec-totals', 'sec-wip', 'sec-wocs', 'sec-materials', 'sec-conv', 'sec-level2',
  'sec-audit', 'sec-qlog'].forEach((id) => {
  eq('หัวข้อ ' + id + ' มี id', page.indexOf('<h2 id="' + id + '"') >= 0, true);
  eq('สารบัญลิงก์ถึง ' + id, page.indexOf('href="#' + id + '"') >= 0, true);
});
eq('ตารางวัตถุดิบห่อ .scroll + มี thead',
  /<div class="scroll"><table><thead>/.test(T.renderMaterials(s, m.ctx, true)), true);

// ── 9. WO ที่มี batch เดียว — ห้ามยัดหัวกลุ่ม ───────────────────────────────
const SOLO_FX = scene({
  'ใบปิดงานผลิต (WOC)': [
    { wo_id: WO, woc_id: 7201, woc_no: 'WOC-FSC-00000600', woc_date: '05/08/2026',
      good_qty: 0, scrap_qty: 0, sc_ia: null, fg_qty: 0,
      task_no: 'OP-10', task_name: 'Mixing', batch_id: 4500, pro_qty: 0 },
    { wo_id: WO, woc_id: 7202, woc_no: 'WOC-FSC-00000601', woc_date: '05/08/2026',
      good_qty: 1000, scrap_qty: 0, sc_ia: 6001, fg_qty: 1000,
      task_no: 'OP-30', task_name: 'Packing', batch_id: 4500, pro_qty: 1000 }
  ],
  'งานที่ปล่อยราย batch (task)': [
    { wo_id: WO, task_id: 5500, task_no: 'TM-1', task_name: 'Packing', batch_id: 4500,
      pro_qty: 1000, good_qty: 1000 }
  ],
  'ใบเบิกวัตถุดิบเข้า WO': RM_LINES.concat([SC_LINES[0]]),
  'เอกสารปันส่วนต้นทุน': []
});
H.setFixtures(SOLO_FX);
const solo = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: SOLO_FX, quietLog: true, exports: EXPORTS
}).T;
const soloM = solo.buildModel(FX.WO_HEADER.wo_no);
const soloBg = solo.batchGroups(soloM.root);
const soloHtml = solo.renderWOCs(soloM.root);

console.log('\n── 9. WO batch เดียวยังแสดงแบบเดิม ──');
eq('มีกลุ่มเดียว', soloBg.batches, 1);
eq('ปิดงานแล้ว 1 batch (ใบขั้นตอนกลางไม่นับซ้ำ)', soloBg.closedBatches, 1);
eq('ไม่มีหัวกลุ่ม (กลุ่มเดียวไม่ต้องมีหัว)', soloHtml.indexOf('class="sub bhead"') >= 0, false);
// 1 กลุ่ม แต่ 2 ขั้นตอน → **ต้องมี** แถวรวม ไม่งั้นผู้ใช้ต้องบวกเองจากตัวเลขที่ไล่กันเป็นลูกโซ่
// (QA บน SB1 เจอเคสนี้ที่ WO-FSC-00000216)
eq('มีแถวรวมของกลุ่มเพราะมีหลายขั้นตอน', soloHtml.indexOf('class="sub bsum"') >= 0, true);
eq('ยังแสดงใบปิดงานครบทั้งสองใบ',
  (soloHtml.match(/WOC-FSC-000006/g) || []).length, 2);
eq('ยังมีแถวรวมท้ายตาราง', soloHtml.indexOf('รวมรับเข้าคลัง') >= 0, true);
eq('บรรทัดสรุปยังบอกจำนวน batch', soloHtml.indexOf('แตก 1 batch') >= 0, true);

// ── 10. query รายการ batch พัง — ห้ามอ่านเป็น "0 batch" ─────────────────────
const FAIL_FX = scene({
  'ใบปิดงานผลิต (WOC)': WOCS,
  'งานที่ปล่อยราย batch (task)': 'THROW',
  'ใบเบิกวัตถุดิบเข้า WO': RM_LINES.concat(SC_LINES),
  'เอกสารปันส่วนต้นทุน': CAS
});
H.setFixtures(FAIL_FX);
const broke = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FAIL_FX, quietLog: true, exports: EXPORTS
}).T;
const brokeM = broke.buildModel(FX.WO_HEADER.wo_no);
const brokeBg = broke.batchGroups(brokeM.root);
const brokeHtml = broke.renderWOCs(brokeM.root);

console.log('\n── 10. query รายการ batch พัง ──');
eq('รู้ว่าอ่านไม่สำเร็จ', brokeBg.tasksFailed, true);
// ถอยไปใช้เฉพาะ batch ที่มีใบปิดงาน (4423 · 4424 · 4425 · ไม่ระบุ batch · batch จาก WOC)
eq('ไม่กลายเป็น 0 batch — ยังถอยไปใช้กลุ่มจากใบปิดงาน', brokeBg.batches, 5);
eq('กลุ่มบนหน้าจอยังครบ (รวมกลุ่มไม่ระบุ batch)', brokeBg.groupCount, 6);
eq('บอกผู้ใช้ว่าอ่านรายการ batch ไม่สำเร็จ',
  brokeHtml.indexOf('อ่านรายการ batch ที่ปล่อยงานไม่สำเร็จ') >= 0, true);
eq('ยังไม่มี batch ที่ปล่อยงานแล้วให้แสดง', brokeBg.releasedBatches, 0);

// ── 11. ช่องเลขที่ใบสั่งผลิตรับทั้งแบบมีขีดและไม่มีขีด (#77 ข้อ B5) ──────────
console.log('\n── 11. เลขที่ใบสั่งผลิตมีขีด/ไม่มีขีด ──');
const qWO = main.libT['WOCostTrace_Common.js'].qWO;
qWO('WO-FSC-00001293');
const sqlDash = H.sqlOf('WO header');
eq('เลขที่เอกสารเทียบแบบตัดขีดออกทั้งสองฝั่ง',
  /REPLACE\(UPPER\(WO\.tranid\), '-', ''\) = REPLACE\(UPPER\(\?\), '-', ''\)/.test(sqlDash), true);
eq('ผูกค่าเข้า SQL ตัวเดียว (ลำดับทำใน JS ไม่ใช่ใน ORDER BY ที่มี bind)',
  (sqlDash.match(/\?/g) || []).length, 1);
// ตัดขีดแล้วเลขคนละใบชนกันได้ — ใบที่ตรงตัวต้องมาก่อนแม้ฐานข้อมูลคืนมาทีหลังและ id มากกว่า
// เทสต์ลำดับจริงจากค่าที่คืนกลับมา ไม่ใช่เทียบข้อความ SQL
H.setFixtures(scene({ 'WO header': [
  { wo_id: 8001, wo_no: 'WOF-SC00000900' },
  { wo_id: 9900, wo_no: 'WO-FSC-00000900' }
] }));
const ordered = qWO('WO-FSC-00000900');
eq('ใบที่ตรงตัวถูกเรียงมาก่อน แม้ id มากกว่า', ordered[0].wo_no, 'WO-FSC-00000900');
eq('ใบที่ชนกันไม่ถูกทิ้ง', ordered.length, 2);
H.setFixtures(scene({ 'WO header': [
  { wo_id: 8001, wo_no: 'WOF-SC00000900' },
  { wo_id: 9900, wo_no: 'WO-FSC-00000900' }
] }));
eq('ไม่มีใบไหนตรงตัว → เรียงตาม id เหมือนเดิม', qWO('WOFSC00000900')[0].wo_no, 'WOF-SC00000900');
qWO('188775');
eq('ตัวเลขล้วนยังเป็น internal id เหมือนเดิม', /WO\.id = \?/.test(H.sqlOf('WO header')), true);
eq('กิ่ง id ไม่ไปแตะ tranid', /tranid\) = REPLACE/.test(H.sqlOf('WO header')), false);

// ── 12. ชั้นภาพรวม: ป้าย KPI บอกฐาน + คำเตือนตัดแถวอยู่เหนือ KPI (#77 ข้อ 2.1/2.2) ────
// ใบที่สองไม่มีแถวในชุดยอดใด ๆ (ยังไม่ปิดงาน ยังไม่เบิก) จึงได้หมายเหตุระดับเตือน
// ซึ่งเป็นสิ่งที่ตัวชี้สถานะต้นแถวต้องหยิบมาแสดงโดยไม่ต้องเลื่อนไปคอลัมน์ขวาสุด
const SUM_FX = (function () {
  const base = FX.summary();
  const head = base['ภาพรวม — รายการใบสั่งผลิต'][0];
  const second = Object.assign({}, head, {
    wo_id: 9002, wo_no: 'WOFSC00000901', item_id: 702, item_code: 'Z9000000001',
    item_name: 'FG ที่ยังไม่มีความเคลื่อนไหว'
  });
  return Object.assign({}, base, { 'ภาพรวม — รายการใบสั่งผลิต': [head, second] });
})();
H.setFixtures(SUM_FX);
const sumT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: SUM_FX, quietLog: true,
  exports: ['buildSummary', 'readFilters', 'renderSummaryPage']
}).T;

const cut = sumT.buildSummary(sumT.readFilters({ from: '2026-07-01', to: '2026-07-31', max: '1' }));
const cutHtml = sumT.renderSummaryPage(cut);
const both = sumT.buildSummary(sumT.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
const bothHtml = sumT.renderSummaryPage(both);

console.log('\n── 12. KPI บอกฐาน + คำเตือนตัดแถวอยู่เหนือ KPI + ตัวชี้สถานะต้นแถว ──');
eq('ตัดแถวจริง', cut.truncated, true);
// เทียบกับ markup ของแถบ KPI ไม่ใช่คำว่า kpi-grid เฉย ๆ — ชื่อคลาสโผล่ในบล็อก <style> ก่อนเสมอ
eq('คำเตือนตัดแถวอยู่ก่อน KPI',
  cutHtml.indexOf('แต่แสดงเพียง') < cutHtml.indexOf('<div class="kpi-grid">'), true);
eq('คำเตือนชี้ลงไปที่ KPI ด้านล่าง (ไม่ใช่ "ด้านบน" ของเดิม)',
  cutHtml.indexOf('ยอดรวมและ KPI ด้านล่างนับแค่ที่แสดง') >= 0, true);
eq('ป้าย KPI บอกว่าเป็นยอดของกี่ใบที่แสดง',
  cutHtml.indexOf('ยอดของ 1 ใบที่แสดง') >= 0, true);
eq('ตัดแถวแล้วป้าย KPI บอกจำนวนที่เข้าเงื่อนไขทั้งหมดด้วย',
  cutHtml.indexOf('ยอดของ 1 ใบที่แสดง (จาก 2 ใบที่เข้าเงื่อนไข)') >= 0, true);
eq('ไม่ตัดแถวก็ยังบอกฐานของยอด', bothHtml.indexOf('ยอดของ 2 ใบที่แสดง') >= 0, true);
eq('แถวที่มีหมายเหตุขึ้นตัวชี้สถานะที่คอลัมน์แรก',
  bothHtml.indexOf('<div class="rowstat warn"') >= 0, true);
eq('ตัวชี้สถานะไม่ได้เพิ่มคอลัมน์ให้ตาราง (หัวตารางยังมี 16 ช่องเท่าเดิม)',
  (bothHtml.match(/<th[ >]/g) || []).length, 16);

// ── 13. โครงจริงของ WO-FSC-00001293 บน SB1 — ต้องอ่านได้ว่า 19 / 5 / 5 ──────
// ข้อเท็จจริงที่ยิง SuiteQL มาแล้ว (transaction id 188775): task 19 ใบ = batch 4423–4441 ·
// ใบปิดงาน 5 ใบ (batch 4423–4427 ใบละ 87,500 · scrap 0) · ใบ MFG Summary Cost ผูกครบทั้ง 5
// ทุก task เป็นขั้นสุดท้าย ใบนี้จึงไม่ได้ทดสอบสาขา "ใบขั้นกลางปริมาณ 0" (คุมไว้ที่ซีนหลัก batch 4425)
const REAL_TASKS = [];
for (let b = 4423; b <= 4441; b++) {
  REAL_TASKS.push({ wo_id: WO, task_id: 5000 + b, task_no: 'TM-' + b, task_name: 'Packing',
    batch_id: b, pro_qty: 87500, good_qty: b <= 4427 ? 87500 : 0 });
}
const REAL_WOCS = [];
const REAL_SC = [];
for (let b = 4423; b <= 4427; b++) {
  REAL_WOCS.push({ wo_id: WO, woc_id: 210000 + b, woc_no: 'WOC-FSC-0000' + b, woc_date: '01/08/2026',
    good_qty: 87500, scrap_qty: 0, sc_ia: 220000 + b, fg_qty: 87500,
    task_no: 'OP-10', task_name: 'Packing', batch_id: b, pro_qty: 87500 });
  REAL_SC.push(Object.assign({}, SC_LINES[0], { tran_id: 220000 + b,
    doc_no: 'IA-FSC-2608' + b, woc_id: 210000 + b, amount: -100000 }));
}
const REAL_FX = scene({
  'ใบปิดงานผลิต (WOC)': REAL_WOCS,
  'งานที่ปล่อยราย batch (task)': REAL_TASKS,
  'ใบเบิกวัตถุดิบเข้า WO': RM_LINES.concat(REAL_SC),
  'เอกสารปันส่วนต้นทุน': []
});
H.setFixtures(REAL_FX);
const realT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: REAL_FX, quietLog: true, exports: EXPORTS
}).T;
const realM = realT.buildModel(FX.WO_HEADER.wo_no);
const realBg = realT.batchGroups(realM.root);
const realHtml = realT.renderWOCs(realM.root);

console.log('\n── 13. โครงจริงของ WO-FSC-00001293 (19 batch / ปิดงาน 5 / ใบปิดงาน 5) ──');
eq('แตกกี่ batch', realBg.batches, 19);
eq('ปิดงานแล้วกี่ batch', realBg.closedBatches, 5);
eq('ใบปิดงานผลิตกี่ใบ', realBg.wocCount, 5);
eq('ไม่มี batch ไหนขึ้นธงแดง (ผูกใบ summary cost ครบ)', realBg.flaggedBatches, 0);
eq('ไม่มีใบปิดงานที่ระบุ batch ไม่ได้', realBg.unbatchedWocs, 0);
eq('หัวตารางอ่านได้ตรงตามที่นับจาก SuiteQL',
  realHtml.indexOf('แตก 19 batch · ปิดงานแล้ว 5 batch') >= 0, true);
eq('batch ที่ยังไม่ถึงคิวยังแสดงครบ (4441 = batch สุดท้าย)',
  realHtml.indexOf('batch 4441') >= 0, true);
eq('ปริมาณที่ปล่อยงานรวมของทุก batch ตรงกับที่นับจาก task',
  realBg.groups.reduce((t, g) => t + g.releasedPlan, 0), 19 * 87500);

// ── 14. batch เดียวหลายขั้นตอน — ตัวเลขจริงของ WO-FSC-00000216 batch 2888 ────
// ยิง SuiteQL มาแล้ว (WO 182154): 3 ขั้น · pro 96,000 / 104,698 / 93,424 ·
// good 104,698 / 93,424 / 93,424 · scrap 0 / 11,274 / 0 · fg 0 / 0 / 93,424 · ยอดบน WO = 96,000
// ถ้าเผลอ SUM ข้ามขั้น: แผนจะกลายเป็น 294,122 และดีกลายเป็น 291,546 — เฟ้อทั้งคู่
const OP3_TASKS = [
  { wo_id: WO, batch_id: 2888, pro_qty: 96000, good_qty: 104698, op_seq: 1, last_task: 'F', prev_task: null },
  { wo_id: WO, batch_id: 2888, pro_qty: 104698, good_qty: 93424, op_seq: 2, last_task: 'F', prev_task: 1963 },
  { wo_id: WO, batch_id: 2888, pro_qty: 93424, good_qty: 93424, op_seq: 3, last_task: 'T', prev_task: 1964 }
];
const OP3_WOCS = [
  { wo_id: WO, woc_id: 323, woc_no: 'WOC-FSC-00000323', woc_date: '01/06/2026',
    good_qty: 104698, scrap_qty: 0, sc_ia: null, fg_qty: 0,
    task_no: 'TM-1963', task_name: 'Mixing', batch_id: 2888, pro_qty: 96000,
    op_seq: 1, last_task: 'F' },
  { wo_id: WO, woc_id: 324, woc_no: 'WOC-FSC-00000324', woc_date: '01/06/2026',
    good_qty: 93424, scrap_qty: 11274, sc_ia: null, fg_qty: 0,
    task_no: 'TM-1964', task_name: 'Filling', batch_id: 2888, pro_qty: 104698,
    op_seq: 2, last_task: 'F' },
  { wo_id: WO, woc_id: 325, woc_no: 'WOC-FSC-00000325', woc_date: '02/06/2026',
    good_qty: 93424, scrap_qty: 0, sc_ia: 6001, fg_qty: 93424,
    task_no: 'TM-1965', task_name: 'Packing', batch_id: 2888, pro_qty: 93424,
    op_seq: 3, last_task: 'T' }
];
const OP3_FX = scene({
  'ใบปิดงานผลิต (WOC)': OP3_WOCS,
  'งานที่ปล่อยราย batch (task)': OP3_TASKS,
  'ใบเบิกวัตถุดิบเข้า WO': RM_LINES.concat([SC_LINES[0]]),
  'เอกสารปันส่วนต้นทุน': []
});
H.setFixtures(OP3_FX);
const op3T = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: OP3_FX, quietLog: true, exports: EXPORTS
}).T;
const op3M = op3T.buildModel(FX.WO_HEADER.wo_no);
const op3G = op3T.batchGroups(op3M.root).groups[0];

console.log('\n── 14. 1 batch × 3 ขั้นตอน (WO-FSC-00000216 batch 2888) ──');
eq('แผน = pro_qty ของขั้นแรกเท่านั้น (ไม่ใช่ 294,122)', op3G.plan, 96000);
eq('ดี = good_qty ของขั้นสุดท้ายเท่านั้น (ไม่ใช่ 291,546)', op3G.good, 93424);
eq('เสีย = บวกข้ามขั้นได้ (ของเสียลงขั้นที่เสียจริงขั้นเดียว)', op3G.scrap, 11274);
eq('รับเข้าคลัง = บวกได้ (ใบที่ไม่ใช่ขั้นสุดท้ายเป็น 0 อยู่แล้ว)', op3G.fg, 93424);
eq('นับเป็นรอบปิดงานเฉพาะใบขั้นสุดท้าย', op3G.fgWocs, 1);
// ใบขั้นกลางมี sc_ia เป็น null ตามปกติของระบบ — ห้ามทำให้ batch นี้ขึ้นธงแดงปลอม
eq('ใบขั้นกลางที่ sc_ia ว่างไม่ทำให้ขึ้นธงแดง', op3G.flagged, false);
eq('ใบขั้นกลางไม่ถูกนับว่า "ยังไม่ผูก"', op3G.unlinkedWocs, 0);
// ตัวกรอง "ใบขั้นสุดท้าย" 3 ตัวต้องชี้ใบเดียวกันเสมอ (ตรวจกับบัญชีแล้ว 384/384 · 686/686)
OP3_WOCS.forEach((w) => {
  eq('ใบ ' + w.woc_no + ': last_task / fg_qty / sc_ia สอดคล้องกัน',
    (w.last_task === 'T') === (w.fg_qty !== 0) && (w.last_task === 'T') === (w.sc_ia !== null), true);
});
const op3Html = op3T.renderWOCs(op3M.root);
eq('แถวรวมของกลุ่มบนหน้าจอไม่เฟ้อ', op3Html.indexOf('294,122') >= 0, false);
// 1 กลุ่ม × 3 ขั้น ต้องมีแถวรวมให้อ่าน (ไม่ใช่ปล่อยให้ผู้ใช้บวกเองจาก 3 แถวที่ไล่กัน)
eq('มีแถวรวมของกลุ่ม', op3Html.indexOf('class="sub bsum"') >= 0, true);
eq('ไม่มีหัวกลุ่ม (มีกลุ่มเดียว)', op3Html.indexOf('class="sub bhead"') >= 0, false);
const op3Sum = (op3Html.match(/<tr class="sub bsum">[\s\S]*?<\/tr>/) || [''])[0];
eq('แถวรวมอ่านได้ แผน 96,000', op3Sum.indexOf('>96,000<') >= 0, true);
eq('แถวรวมอ่านได้ ดี 93,424', (op3Sum.match(/>93,424</g) || []).length, 2);
eq('แถวรวมอ่านได้ เสีย 11,274', op3Sum.indexOf('>11,274<') >= 0, true);

// ── 15. หลาย batch × หลายขั้นตอนพร้อมกัน — ของจริงบน SB1 ยังไม่มีเคสนี้ ──────
// (SB1 มี batch ที่มีหลายขั้นตอน 192 batch แต่ไม่มี WO ใบไหนที่แตกหลาย batch **และ**
//  หลายขั้นตอนพร้อมกัน) — มิติที่ข้อมูลจริงยังไม่ครอบคลุม ต้องพิสูจน์ด้วย unit test เท่านั้น
const MIX_TASKS = [];
const MIX_WOCS = [];
[7001, 7002, 7003].forEach((b, bi) => {
  [1, 2, 3].forEach((op) => {
    MIX_TASKS.push({ wo_id: WO, batch_id: b, pro_qty: op === 1 ? 1000 : 900,
      good_qty: op === 1 ? 900 : 900, op_seq: op, last_task: op === 3 ? 'T' : 'F',
      prev_task: op === 1 ? null : b * 10 + (op - 1) });
    MIX_WOCS.push({ wo_id: WO, woc_id: b * 10 + op, woc_no: 'WOC-MIX-' + b + '-' + op,
      woc_date: '10/08/2026', good_qty: 900, scrap_qty: op === 1 ? 100 : 0,
      sc_ia: op === 3 ? 6001 : null, fg_qty: op === 3 ? 900 : 0,
      task_no: 'OP-' + op, task_name: 'Step ' + op, batch_id: b,
      pro_qty: op === 1 ? 1000 : 900, op_seq: op, last_task: op === 3 ? 'T' : 'F' });
  });
  return bi;
});
const MIX_FX = scene({
  'ใบปิดงานผลิต (WOC)': MIX_WOCS,
  'งานที่ปล่อยราย batch (task)': MIX_TASKS,
  'ใบเบิกวัตถุดิบเข้า WO': RM_LINES.concat([SC_LINES[0]]),
  'เอกสารปันส่วนต้นทุน': []
});
H.setFixtures(MIX_FX);
const mixT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: MIX_FX, quietLog: true, exports: EXPORTS
}).T;
const mixM = mixT.buildModel(FX.WO_HEADER.wo_no);
const mixBg = mixT.batchGroups(mixM.root);

console.log('\n── 15. 3 batch × 3 ขั้นตอน (เคสที่ข้อมูลจริงยังไม่มี) ──');
eq('แตก 3 batch (ไม่ใช่ 9 ตามจำนวน task)', mixBg.batches, 3);
eq('ใบปิดงานผลิต 9 ใบ', mixBg.wocCount, 9);
eq('ปิดงานแล้ว 3 batch', mixBg.closedBatches, 3);
// assert ราย**กลุ่ม** ไม่ใช่ผลรวมข้ามกลุ่ม — ผลรวมข้ามกลุ่มไม่เปลี่ยนแม้แต่ละกลุ่มเฟ้อ
mixBg.groups.forEach((g) => {
  eq('batch ' + g.key + ' แผนไม่เฟ้อ (ขั้นแรกขั้นเดียว)', g.plan, 1000);
  eq('batch ' + g.key + ' ดีไม่เฟ้อ (ขั้นสุดท้ายขั้นเดียว)', g.good, 900);
  eq('batch ' + g.key + ' เสียรวมทุกขั้น', g.scrap, 100);
  eq('batch ' + g.key + ' รับเข้าคลัง', g.fg, 900);
  eq('batch ' + g.key + ' ไม่ขึ้นธงแดงปลอมจากใบขั้นกลาง', g.flagged, false);
});
eq('ผลรวมรับเข้าคลังของทุกกลุ่ม = ปริมาณที่ผลิตได้ของ WO',
  mixBg.groups.reduce((t, g) => t + g.fg, 0), mixM.root.produced);
// หลายกลุ่ม × หลายขั้น → ทุกกลุ่มต้องมีทั้งหัวกลุ่มและแถวรวม
const mixHtml = mixT.renderWOCs(mixM.root);
eq('หัวกลุ่มครบทุกกลุ่ม', (mixHtml.match(/class="sub bhead"/g) || []).length, 3);
eq('แถวรวมครบทุกกลุ่ม', (mixHtml.match(/class="sub bsum"/g) || []).length, 3);

// ── 16. ไม่มีข้อมูลลำดับขั้นตอนเลย — ต้อง "ไม่ทราบ" ไม่ใช่เลขมั่ว ──────────
// สอง batch เพื่อให้ตารางแบ่งกลุ่มจริง (กลุ่มเดียวไม่มีแถวรวมกลุ่มตามที่ตั้งใจไว้)
const BLIND_TASKS = MIX_TASKS.filter((t) => t.batch_id !== 7003)
  .map((t) => ({ wo_id: t.wo_id, batch_id: t.batch_id, pro_qty: t.pro_qty, good_qty: t.good_qty,
    op_seq: null, last_task: null, prev_task: null }));
const BLIND_WOCS = MIX_WOCS.filter((w) => w.batch_id !== 7003)
  .map((w) => Object.assign({}, w, { op_seq: null, last_task: null }));
const BLIND_FX = scene({
  'ใบปิดงานผลิต (WOC)': BLIND_WOCS,
  'งานที่ปล่อยราย batch (task)': BLIND_TASKS,
  'ใบเบิกวัตถุดิบเข้า WO': RM_LINES.concat([SC_LINES[0]]),
  'เอกสารปันส่วนต้นทุน': []
});
H.setFixtures(BLIND_FX);
const blindT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: BLIND_FX, quietLog: true, exports: EXPORTS
}).T;
const blindM = blindT.buildModel(FX.WO_HEADER.wo_no);
const blindG = blindT.batchGroups(blindM.root).groups[0];

console.log('\n── 16. ไม่มีลำดับขั้นตอนเลย → "ไม่ทราบ" ห้ามเดา ──');
eq('แผนตัดสินไม่ได้ → null', blindG.plan, null);
eq('ดีตัดสินไม่ได้ → null', blindG.good, null);
eq('ไม่แอบใช้ SUM (2,800 / 2,700) เป็นคำตอบ',
  blindG.plan === 2800 || blindG.good === 2700, false);
eq('เสีย/รับเข้าคลังยังรวมได้ตามปกติ', blindG.scrap + blindG.fg, 1000);
// ถอยไป previous_task ได้เมื่อ field มีค่ามาจริงบางแถว
const PREV_TASKS = BLIND_TASKS.map((t, i) => Object.assign({}, t,
  { prev_task: (i % 3) === 0 ? null : 999 }));
const PREV_FX = scene({
  'ใบปิดงานผลิต (WOC)': BLIND_WOCS,
  'งานที่ปล่อยราย batch (task)': PREV_TASKS,
  'ใบเบิกวัตถุดิบเข้า WO': RM_LINES.concat([SC_LINES[0]]),
  'เอกสารปันส่วนต้นทุน': []
});
H.setFixtures(PREV_FX);
const prevT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: PREV_FX, quietLog: true, exports: EXPORTS
}).T;
const prevG = prevT.batchGroups(prevT.buildModel(FX.WO_HEADER.wo_no).root).groups[0];
eq('op_seq ว่าง → ถอยไปใช้แถวที่ไม่มี previous_task', prevG.plan, 1000);
eq('หน้าจอแสดงคำว่า "ไม่ทราบ" เมื่อตัดสินขั้นไม่ได้',
  blindT.renderWOCs(blindM.root).indexOf('ไม่ทราบ') >= 0, true);

// ── 17. ข้อความหมายเหตุที่วาดเป็นตัวชี้สถานะต้องผ่าน esc() ────────────────
console.log('\n── 17. rowStatus escape ──');
const hostileNote = T.rowStatus([{ cls: 'bad', text: '<script>alert(1)</script>' },
  { cls: 'bad', text: 'ใบ "A" & ใบ B' }]);
eq('title ของตัวชี้สถานะถูก escape', hostileNote.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') >= 0, true);
eq('ไม่มี <script> ดิบหลุดออกมา', hostileNote.indexOf('<script>') >= 0, false);
eq('เครื่องหมายคำพูดถูก escape ไม่ให้ปิด attribute', hostileNote.indexOf('&quot;A&quot;') >= 0, true);
eq('แอมเปอร์แซนด์ถูก escape', hostileNote.indexOf('&amp; ใบ B') >= 0, true);
eq('ไม่มีหมายเหตุ → ไม่วาดอะไรเลย', T.rowStatus([]), '');

// ── 18. ชั้นภาพรวมต้องรับเลขที่แบบไม่มีขีดเหมือนชั้นเจาะลึก (#77 ข้อ B5) ─────
console.log('\n── 18. ช่องค้น WO ของชั้นภาพรวม ──');
H.setFixtures(SUM_FX);
sumT.buildSummary(sumT.readFilters({ from: '2026-07-01', to: '2026-07-31', wono: 'WOFSC00000901' }));
const sqlSummary = H.sqlOf('ภาพรวม — รายการใบสั่งผลิต');
eq('ตัดขีดทั้งสองฝั่งเหมือน qWO ของชั้นเจาะลึก',
  /REPLACE\(UPPER\(WO\.tranid\), '-', ''\) LIKE REPLACE\(\?, '-', ''\)/.test(sqlSummary), true);
eq('ยังเป็นการค้นบางส่วน (LIKE) ไม่ได้กลายเป็นเทียบเต็มเลข',
  /LIKE/.test(sqlSummary), true);
eq('ไม่เหลือการเทียบ tranid ตรง ๆ ที่ทำให้สองชั้นตอบไม่ตรงกัน',
  /UPPER\(WO\.tranid\) LIKE \?/.test(sqlSummary), false);

// ── 19. เลขที่ตัดขีดแล้วชนกันหลายใบ — ต้องเตือน ห้ามเลือกใบให้เงียบ ๆ ────────
const AMB_FX = scene({
  'WO header': [
    Object.assign({}, FX.WO_HEADER, { wo_no: 'WO-FSC-00000900' }),
    Object.assign({}, FX.WO_HEADER, { wo_id: 9099, wo_no: 'WOF-SC00000900' })
  ]
});
H.setFixtures(AMB_FX);
const ambT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: AMB_FX, quietLog: true, exports: EXPORTS
}).T;
const ambM = ambT.buildModel('WOFSC00000900');

console.log('\n── 19. เลขที่กำกวมหลังตัดขีด ──');
eq('รู้ว่ากำกวม', ambM.ambiguous.count, 2);
eq('หยิบใบแรกที่ query เรียงมาให้ (ตรงตัวมาก่อน)', ambM.ambiguous.picked, 'WO-FSC-00000900');
eq('บอกด้วยว่าใบอื่นคือใบไหน', ambM.ambiguous.others.join(','), 'WOF-SC00000900');
const ambPage = ambT.renderPage(ambM);
eq('หน้าจอเตือนว่าเลขที่นี้ตรงหลายใบ', ambPage.indexOf('ตรงกับใบสั่งผลิต 2 ใบ') >= 0, true);
eq('บอกว่ากำลังแสดงใบไหน', ambPage.indexOf('<b>WO-FSC-00000900</b>') >= 0, true);
eq('ใบเดียวไม่ขึ้นคำเตือนนี้', T.renderPage(m).indexOf('ตรงกับใบสั่งผลิต') >= 0, false);

// ── 20. เงื่อนไขแถวรวมของกลุ่ม ครบทั้งสามแบบ (QA #77 รอบที่ 2) ──────────────
// 1 กลุ่ม × 1 ขั้น → ไม่มีแถวรวม (แถวเดียวคือคำตอบอยู่แล้ว ใส่ไปก็รกเปล่า)
// 1 กลุ่ม × หลายขั้น → มีแถวรวม (ซีน 9 และ 14) · หลายกลุ่ม → มีทุกกลุ่มที่เข้าเงื่อนไข (ซีน 15)
const ONE_FX = scene({
  'ใบปิดงานผลิต (WOC)': [
    { wo_id: WO, woc_id: 7301, woc_no: 'WOC-FSC-00000700', woc_date: '06/08/2026',
      good_qty: 1000, scrap_qty: 0, sc_ia: 6001, fg_qty: 1000,
      task_no: 'OP-30', task_name: 'Packing', batch_id: 4600, pro_qty: 1000,
      op_seq: 1, last_task: 'T' }
  ],
  'งานที่ปล่อยราย batch (task)': [
    { wo_id: WO, batch_id: 4600, pro_qty: 1000, good_qty: 1000,
      op_seq: 1, last_task: 'T', prev_task: null }
  ],
  'ใบเบิกวัตถุดิบเข้า WO': RM_LINES.concat([SC_LINES[0]]),
  'เอกสารปันส่วนต้นทุน': []
});
H.setFixtures(ONE_FX);
const oneT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: ONE_FX, quietLog: true, exports: EXPORTS
}).T;
const oneHtml = oneT.renderWOCs(oneT.buildModel(FX.WO_HEADER.wo_no).root);

console.log('\n── 20. 1 กลุ่ม × 1 ขั้นตอน ──');
eq('ไม่มีหัวกลุ่ม', oneHtml.indexOf('class="sub bhead"') >= 0, false);
eq('ไม่มีแถวรวมของกลุ่ม', oneHtml.indexOf('class="sub bsum"') >= 0, false);
eq('ยังมีแถวใบปิดงานและแถวรวมท้ายตาราง',
  oneHtml.indexOf('WOC-FSC-00000700') >= 0 && oneHtml.indexOf('รวมรับเข้าคลัง') >= 0, true);

// ── 21. ผลลัพธ์ 0 แถวต้องบอกเงื่อนไขที่ใช้กรองอยู่ (QA #77 รอบที่ 2) ─────────
// QA เลือกบริษัทค้างไว้โดยไม่ตั้งใจ (รายการที่เปิดอยู่บังปุ่ม) แล้วได้ตารางว่างที่ไม่บอกสาเหตุ
const EMPTY_FX = Object.assign({}, FX.summary(), { 'ภาพรวม — รายการใบสั่งผลิต': [] });
H.setFixtures(EMPTY_FX);
const emptyT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: EMPTY_FX, quietLog: true,
  exports: ['buildSummary', 'readFilters', 'renderSummaryPage']
}).T;
const emptyF = emptyT.readFilters({ from: '2026-07-01', to: '2026-07-31', sub: '1', loc: '10' });
emptyF.subRows = [{ id: 1, name: 'FS Group' }, { id: 2, name: 'Foodstar' }];
emptyF.locRows = [{ id: 10, name: 'PD_B1' }];
const emptyHtml = emptyT.renderSummaryPage(emptyT.buildSummary(emptyF));

console.log('\n── 21. ตารางว่างต้องบอกเงื่อนไขที่ใช้อยู่ ──');
eq('ยังบอกว่าไม่พบ', emptyHtml.indexOf('ไม่พบใบสั่งผลิตตามเงื่อนไขนี้') >= 0, true);
eq('บอกชื่อบริษัทที่กรองอยู่', emptyHtml.indexOf('บริษัท FS Group') >= 0, true);
eq('บอกสถานที่ผลิตที่กรองอยู่', emptyHtml.indexOf('สถานที่ผลิต PD_B1') >= 0, true);
eq('บอกช่วงวันที่ที่ใช้', emptyHtml.indexOf('ช่วง 2026-07-01 ถึง 2026-07-31') >= 0, true);
eq('แนะทางออกให้ล้างตัวกรอง', emptyHtml.indexOf('ให้ล้างช่องบริษัท') >= 0, true);
// บรรทัดสรุปตัวกรองด้านบนต้องพิมพ์บริษัท/สถานที่ผลิตด้วย ไม่ใช่มีแต่ช่วงวันที่
eq('บรรทัดสรุปด้านบนบอกบริษัทที่เลือก', emptyHtml.indexOf('· บริษัท <b>FS Group</b>') >= 0, true);
eq('บรรทัดสรุปด้านบนบอกสถานที่ผลิต', emptyHtml.indexOf('· สถานที่ผลิต <b>PD_B1</b>') >= 0, true);
// id ที่ค้างมากับ URL แต่ไม่อยู่ในรายชื่อ ต้องบอกเป็น id ไม่ใช่เงียบ
const ghostF = emptyT.readFilters({ from: '2026-07-01', to: '2026-07-31', sub: '99' });
ghostF.subRows = [{ id: 1, name: 'FS Group' }];
ghostF.locRows = [];
eq('บริษัทที่ไม่อยู่ในรายชื่อยังถูกบอกเป็น id',
  emptyT.renderSummaryPage(emptyT.buildSummary(ghostF)).indexOf('บริษัท id 99') >= 0, true);

// ── 22. ปิดงานยังไม่ถึงขั้นสุดท้าย — ห้ามเอา good ของขั้นกลางมาเป็นยอดของ batch ─────
// รีวิวรอบสองจับได้: lastStepRows(wocs) ตอบ "ขั้นสูงสุดเท่าที่ปิดไปแล้ว" ไม่ใช่ "ขั้นสุดท้ายของ
// batch" · batch ที่มี task op1+op2 แต่ปิดแค่ op1 จะขึ้น ดี = 90 ทั้งที่ closed=false และ
// รับเข้าคลัง = 0 — ตัวเลขในหน้าเดียวกันขัดกันเอง และไม่ตรงกับชั้นภาพรวม
const PARTIAL_FX = scene({
  'ใบปิดงานผลิต (WOC)': [
    { wo_id: WO, woc_id: 7401, woc_no: 'WOC-FSC-00000800', woc_date: '07/08/2026',
      good_qty: 90, scrap_qty: 10, sc_ia: null, fg_qty: 0,
      task_no: 'OP-10', task_name: 'Mixing', batch_id: 4700, pro_qty: 100,
      op_seq: 1, last_task: 'F' },
    // batch 4701 ปิดครบทั้งสองขั้น — ต้องยังอ่าน ดี จากขั้นสุดท้ายได้ตามปกติ
    { wo_id: WO, woc_id: 7402, woc_no: 'WOC-FSC-00000801', woc_date: '07/08/2026',
      good_qty: 95, scrap_qty: 5, sc_ia: null, fg_qty: 0,
      task_no: 'OP-10', task_name: 'Mixing', batch_id: 4701, pro_qty: 100,
      op_seq: 1, last_task: 'F' },
    { wo_id: WO, woc_id: 7403, woc_no: 'WOC-FSC-00000802', woc_date: '08/08/2026',
      good_qty: 95, scrap_qty: 0, sc_ia: 6001, fg_qty: 95,
      task_no: 'OP-30', task_name: 'Packing', batch_id: 4701, pro_qty: 95,
      op_seq: 2, last_task: 'T' }
  ],
  'งานที่ปล่อยราย batch (task)': [
    { wo_id: WO, batch_id: 4700, pro_qty: 100, good_qty: 90, op_seq: 1, last_task: 'F', prev_task: null },
    { wo_id: WO, batch_id: 4700, pro_qty: 90, good_qty: 0, op_seq: 2, last_task: 'T', prev_task: 1 },
    { wo_id: WO, batch_id: 4701, pro_qty: 100, good_qty: 95, op_seq: 1, last_task: 'F', prev_task: null },
    { wo_id: WO, batch_id: 4701, pro_qty: 95, good_qty: 95, op_seq: 2, last_task: 'T', prev_task: 3 },
    // 4702 ปล่อยงาน 3 ขั้น แต่ยังไม่ปิดสักใบ → ต้องมีแถวรวม (แผนอ่านได้ · ดี = ยังไม่ปิดงาน)
    { wo_id: WO, batch_id: 4702, pro_qty: 100, good_qty: 0, op_seq: 1, last_task: 'F', prev_task: null },
    { wo_id: WO, batch_id: 4702, pro_qty: 0, good_qty: 0, op_seq: 2, last_task: 'F', prev_task: 5 },
    { wo_id: WO, batch_id: 4702, pro_qty: 0, good_qty: 0, op_seq: 3, last_task: 'T', prev_task: 6 }
  ],
  'ใบเบิกวัตถุดิบเข้า WO': RM_LINES.concat([SC_LINES[0]]),
  'เอกสารปันส่วนต้นทุน': []
});
H.setFixtures(PARTIAL_FX);
const partT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: PARTIAL_FX, quietLog: true, exports: EXPORTS
}).T;
const partM = partT.buildModel(FX.WO_HEADER.wo_no);
const partBg = partT.batchGroups(partM.root);
const partBy = {};
partBg.groups.forEach((g) => { partBy[g.key] = g; });
const partHtml = partT.renderWOCs(partM.root);

console.log('\n── 22. ปิดงานยังไม่ถึงขั้นสุดท้าย ──');
eq('ดี ของ batch ที่ยังไม่ปิดขั้นสุดท้าย = ไม่มีเลข (ไม่ใช่ 90 ของขั้นกลาง)',
  partBy['4700'].good, null);
eq('บอกสาเหตุว่า "ยังไม่ปิดงาน" ไม่ใช่ "ไม่ทราบ"', partBy['4700'].goodPending, true);
eq('สอดคล้องกับ closed', partBy['4700'].closed, false);
eq('สอดคล้องกับรับเข้าคลัง', partBy['4700'].fg, 0);
eq('แผนยังอ่านได้จากขั้นแรก', partBy['4700'].plan, 100);
eq('เสียยังรวมได้', partBy['4700'].scrap, 10);
eq('หน้าจอขึ้นคำว่า "ยังไม่ปิดงาน" ในช่องดี', partHtml.indexOf('>ยังไม่ปิดงาน</td>') >= 0, true);
eq('ไม่มีเลข 90 หลุดไปเป็นยอดของ batch ในแถวรวม',
  (partHtml.match(/<tr class="sub bsum">[\s\S]*?<\/tr>/g) || []).join('').indexOf('>90<') >= 0, false);

console.log('\n   batch ที่ปิดครบทุกขั้น ยังอ่านค่าเดิม');
eq('ดี = good ของขั้นสุดท้าย', partBy['4701'].good, 95);
eq('ไม่ pending', partBy['4701'].goodPending, false);
eq('แผน = ขั้นแรก', partBy['4701'].plan, 100);
eq('เสีย = รวมทุกขั้น', partBy['4701'].scrap, 5);
eq('รับเข้าคลัง = ขั้นสุดท้าย', partBy['4701'].fg, 95);

console.log('\n── 23. กลุ่มหลายขั้นตอนที่ยังไม่มีใบปิดงานเลย ต้องมีแถวรวม ──');
eq('4702 ปล่อยงาน 3 งาน', partBy['4702'].tasks, 3);
eq('4702 ยังไม่มีใบปิดงาน', partBy['4702'].wocs.length, 0);
eq('4702 แผนอ่านได้จากขั้นแรก', partBy['4702'].plan, 100);
eq('4702 ดี = ยังไม่ปิดงาน', partBy['4702'].goodPending, true);
eq('มีแถวรวมของ batch 4702 ทั้งที่ยังไม่มีใบปิดงาน',
  partHtml.indexOf('รวม batch 4702') >= 0, true);
eq('จำนวนแถวรวมเท่ากับจำนวนกลุ่มที่เข้าเงื่อนไข (ทุกกลุ่มมีหลายขั้น)',
  (partHtml.match(/class="sub bsum"/g) || []).length, 3);

// ── 24. ค่า sub/loc ที่มีอักขระปน — ห้ามขัดให้เป็น id แล้วกรองเงียบ ๆ (QA #77) ──
// `?sub=<script>alert(1)</script>` ไม่ใช่ช่องโหว่ (ทุกช่องผ่าน esc) แต่ของเดิม
// `replace(/[^0-9]/g,'')` ทำให้เหลือ `1` แล้วรายงานกรองด้วยบริษัทแรกโดยผู้ใช้ไม่ได้เลือก
// และหน้าจอเขียนหน้าตาเฉยว่า "บริษัท FS Group" — ตารางที่อธิบายไม่ได้ ซึ่งเป็นโจทย์ของใบนี้
H.setFixtures(SUM_FX);
const idT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: SUM_FX, quietLog: true,
  exports: ['buildSummary', 'readFilters', 'renderSummaryPage']
}).T;
const withRows = (f) => {
  f.subRows = [{ id: 1, name: 'FS Group' }, { id: 2, name: 'Foodstar' }];
  f.locRows = [{ id: 10, name: 'PD_B1' }];
  return f;
};
const runWith = (over) => {
  const f = withRows(idT.readFilters(
    Object.assign({ from: '2026-07-01', to: '2026-07-31' }, over)));
  const html = idT.renderSummaryPage(idT.buildSummary(f));
  return { f: f, html: html, sql: H.sqlOf('ภาพรวม — รายการใบสั่งผลิต') };
};

console.log('\n── 24. ค่า sub/loc ที่ใช้ไม่ได้ ──');
const junk = runWith({ sub: '<script>alert(1)</script>' });
eq('ไม่เก็บเศษตัวเลขไปใช้กรอง', junk.f.sub, '');
eq('SQL ไม่มีเงื่อนไขบริษัท', /TL\.subsidiary = \?/.test(junk.sql), false);
eq('ขึ้นคำเตือนว่าค่าที่ส่งมาใช้ไม่ได้',
  junk.html.indexOf('ค่าที่ส่งมาในช่อง <b>บริษัท</b> ใช้ไม่ได้') >= 0, true);
eq('บอกว่าไม่ได้กรองด้วยค่านั้น',
  junk.html.indexOf('<b>ไม่ได้กรองด้วยค่านั้น</b>') >= 0, true);
eq('ไม่แอบอ้างว่ากรองด้วย FS Group', junk.html.indexOf('บริษัท FS Group') >= 0, false);
eq('ค่าที่สะท้อนกลับถูก escape', junk.html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') >= 0, true);
eq('ไม่มี <script> ดิบในหน้า', junk.html.indexOf('<script>alert(1)') >= 0, false);
// ห้ามสะท้อนสตริงยาว ๆ กลับลงหน้า — ตัดที่ 40 ตัวอักษร
const long = runWith({ sub: 'x'.repeat(200) });
eq('ค่ายาวถูกตัดก่อนแสดง', long.f.badParams[0].raw.length, 41);
eq('ตัดแล้วต่อท้ายด้วยจุดไข่ปลา', long.f.badParams[0].raw.slice(-1), '…');
eq('ไม่สะท้อนสตริงยาวเต็มลงหน้า', long.html.indexOf('x'.repeat(60)) >= 0, false);

const junkLoc = runWith({ loc: "10' OR 1=1" });
eq('loc ใช้กฎเดียวกัน — ไม่กรอง', junkLoc.f.loc, '');
eq('loc: SQL ไม่มีเงื่อนไขสถานที่ผลิต', /TL\.location = \?/.test(junkLoc.sql), false);
eq('loc: ขึ้นคำเตือน',
  junkLoc.html.indexOf('ค่าที่ส่งมาในช่อง <b>สถานที่ผลิต</b> ใช้ไม่ได้') >= 0, true);

console.log('\n   ค่าตัวเลขล้วนและค่าว่าง ต้องได้พฤติกรรมเดิมทุกอย่าง');
const ghost = runWith({ sub: '99' });
eq('ตัวเลขล้วนยังถูกใช้กรอง', ghost.f.sub, '99');
eq('SQL ยังมีเงื่อนไขบริษัท', /TL\.subsidiary = \?/.test(ghost.sql), true);
// บรรทัดสรุปด้านบนพิมพ์ชื่อไว้ใน <b> (การ์ด "ไม่พบ…" พิมพ์เป็นข้อความล้วน — คนละที่กัน)
eq('ยังบอกว่าเป็น id ที่ไม่อยู่ในรายชื่อ',
  ghost.html.indexOf('บริษัท <b>id 99</b>') >= 0, true);
eq('ช่องเลือกยังฟ้องว่าไม่อยู่ในรายชื่อ',
  ghost.html.indexOf('รหัสนี้ไม่อยู่ในรายชื่อบริษัท (id: 99)') >= 0, true);
eq('ไม่ขึ้นคำเตือนค่าใช้ไม่ได้', ghost.html.indexOf('ใช้ไม่ได้') >= 0, false);
const bothIds = runWith({ sub: '2', loc: '10' });
eq('ค่าปกติยังกรองครบทั้งสองช่อง',
  /TL\.subsidiary = \?/.test(bothIds.sql) && /TL\.location = \?/.test(bothIds.sql), true);
const none = runWith({});
eq('ค่าว่าง → ไม่กรอง ไม่เตือน', none.f.sub + none.f.loc, '');
eq('ค่าว่าง → ไม่มีคำเตือน', none.html.indexOf('ใช้ไม่ได้') >= 0, false);
eq('ค่าว่าง → badParams ว่าง', none.f.badParams.length, 0);

const fails = H.fails();
console.log(fails ? '\nไม่ผ่าน ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
