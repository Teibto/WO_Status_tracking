/**
 * Harness — ชั้นภาพรวมต้องได้ยอดเท่าชั้นเจาะลึกทุกหลัก (issue #11)
 *
 * กติกานี้เขียนล็อกไว้ในโค้ดที่ `WOCostTrace.js:613-624` ("ชั้นนี้ต้องได้ตัวเลขเท่ากับชั้นเจาะ")
 * แต่ก่อนหน้านี้ไม่มีเทสไหนยันมัน — มีแต่เทสของชั้นภาพรวม (`test_summary_math.js`)
 * ชั้นเจาะลึกจึงไม่มีอะไรคุมเลย ทั้งที่เป็นชั้นที่ผู้ใช้เอาไปยันกับเอกสารจริงทีละใบ
 *
 * วิธี: ป้อน**บรรทัดเอกสารชุดเดียวกัน** (`fixtures_parity.js`) ให้ทั้งสองชั้น แล้วเทียบยอดกันเอง
 * ถ้าใครไปแก้กฎรวมยอดของชั้นใดชั้นหนึ่ง (เช่น เปลี่ยนตัวตั้งมูลค่า หรือลืมตัดบรรทัด summary cost)
 * เทสนี้จะตกทันทีโดยไม่ต้องมีใครไปอัปเดตตัวเลขที่คาดหวัง
 *
 * รัน: node test/test_trace_parity.js
 */
const H = require('./_harness');
const FX = require('./fixtures_parity');

const eq = H.makeEq({ tol: 1e-9 });

// ── ชั้นเจาะลึก ─────────────────────────────────────────────────────────────
const dd = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js'],
  fixtures: FX.drilldown(),
  quietLog: true,
  exports: ['buildModel', 'summaryLink']
});
const m = dd.T.buildModel(FX.WO_HEADER.wo_no);

console.log('\n── ชั้นเจาะลึกอ่านบรรทัดได้ตามที่ป้อน ──');
eq('หา WO เจอ', m.ok, true);
const root = m.root;
eq('ยอดวัตถุดิบ', root.rmTotal, FX.EXPECT.rm_cost);
eq('ผลิตได้', root.produced, FX.EXPECT.woc_qty);
eq('ต้นทุนแปรสภาพ (std)', root.convStd, FX.EXPECT.dl_oh_std);
eq('ต้นทุนแปรสภาพ (act)', root.convAct, FX.EXPECT.dl_oh_act);
eq('ตัดบรรทัด summary cost ออกจากวัตถุดิบแล้ว',
  root.rows.some((r) => String(r.item_id) === '999'), false);
eq('ใบ summary cost', root.summaryDocs.length, FX.EXPECT.sc_docs);
eq('ใบปิดงานที่มีปริมาณ', root.summaryLink.fgWocs, FX.EXPECT.woc_fg_count);
eq('ใบ summary cost ที่ผูกแล้ว', root.summaryLink.linkedDocs, FX.EXPECT.linked_docs);
eq('ไม่มีใบมีมูลค่าที่ไม่มีใบปิดงานอ้างถึง', root.summaryLink.orphanDocs.length, 0);

// ── ชั้นภาพรวม (คนละ process ไม่ได้ จึงโหลดใหม่ในไฟล์เดียวกันแล้วสลับ fixture) ──
H.setFixtures(FX.summary());
const sumT = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['buildSummary', 'readFilters']
}).T;
const sm = sumT.buildSummary(sumT.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
const row = sm.rows.filter((r) => r.wo_no === FX.WO_HEADER.wo_no)[0];

console.log('\n── ยอดสองชั้นต้องเท่ากันทุกหลัก ──');
eq('มีแถวของ WO นี้ในชั้นภาพรวม', !!row, true);
eq('วัตถุดิบ', row.rm_cost, root.rmTotal);
eq('แปรสภาพ', row.dl_oh_cost, root.convStd);
eq('ผลิตได้', row.woc_qty, root.produced);
eq('รวมต้นทุน', row.cost, root.rmTotal + root.convStd);
eq('ต้นทุน/หน่วย', row.cost_per_unit, root.unitCostFull);
eq('Summary Cost Item', row.sc_value,
  Object.keys(root.summaryLink.valueByDoc).reduce((t, k) => t + root.summaryLink.valueByDoc[k], 0));
eq('ผลต่าง', row.sc_gap, row.sc_value - (root.rmTotal + root.convStd));

console.log('\n── ต้นทุนต่อลังคิดจากยอดเดียวกัน ──');
const cartons = root.produced / FX.EXPECT.base_per_carton;
eq('จำนวนลัง', row.cartons, cartons, 1e-6);
eq('ต้นทุน/ลัง', row.cost_per_carton, (root.rmTotal + root.convStd) / cartons, 1e-8);

console.log('\n── ตัวเลขที่ verify กับ SB1 แล้ว (WOFSC00000470) ต้องยังได้เท่าเดิม ──');
// บรรทัดใน fixture ถูกตั้งให้รวมได้เท่าชุดที่ verify ไว้ในเอกสาร — ถ้าใครแก้ fixture
// โดยไม่ตั้งใจ สองข้อนี้จะตกก่อนที่ข้ออื่นจะเริ่มโกหก
eq('วัตถุดิบ = 347,651.01', root.rmTotal, 347651.01, 1e-8);
eq('แปรสภาพ = 70,298.58', root.convStd, 70298.58, 1e-8);
eq('รวม = 417,949.59', root.rmTotal + root.convStd, 417949.59, 1e-8);
eq('ผลิตได้ = 160,276', root.produced, 160276);
eq('ต้นทุน/หน่วย = 2.60768668', root.unitCostFull, 2.60768668, 1e-8);
eq('ต้นทุน/ลัง = 125.16896054', row.cost_per_carton, 125.16896054, 1e-8);
eq('ผลต่าง = 602,237.00', row.sc_gap, 602237.00, 1e-6);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
