/**
 * Harness — แถวย่อยราย batch ของชั้นภาพรวม + Excel 1 แถวต่อ batch
 *
 * ผู้ใช้ขอให้ WO ที่มีหลายใบปิดงาน (หลาย batch) แยกบรรทัดตาม batch ในตารางภาพรวม
 * คำตัดสินที่ล็อกไว้ที่นี่
 *   - แถว WO คงเดิมทุกหลัก แถว batch อยู่ใต้แถว WO และไม่ถูกบวกเข้าแถวรวม/KPI
 *   - ยอดเงินจับคู่ batch ผ่านใบปิดงานที่บรรทัดอ้าง (วัตถุดิบอ้างใบปิดงานของ task สุดท้าย)
 *     ไม่ปันตามสัดส่วน · บรรทัดที่อ้างใบปิดงานไม่ได้ลงแถว "ไม่ระบุ batch"
 *   - ยอดทุก batch รวมกัน = แถว WO ทุกช่องเงินและช่องผลิตได้
 *   - Excel ได้แถวละ batch แทนแถว WO (ไม่ส่งซ้ำทั้งคู่) + คอลัมน์ batch
 *
 * รัน: node apps/wo-cost-trace/test/test_summary_batch_rows.js
 */
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ tol: 1e-6 });
const LIBS = ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'];
const EXPORTS = ['buildSummary', 'readFilters', 'renderSummaryGrid', 'renderSummaryPage',
  'summaryExportData', 'summaryExportNote'];
const WO = FX.WO_ID;
const sumOf = (rows, k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);

function run(fx) {
  H.setFixtures(fx);
  const T = H.load({ libs: LIBS, fixtures: fx, quietLog: true, exports: EXPORTS }).T;
  const sm = T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
  return { T: T, sm: sm, r: sm.rows[0], html: T.renderSummaryGrid(sm) };
}

// ── 1. fixture กลาง: 2 batch (3001 สองขั้น · 3002 ขั้นเดียว) · ใบเบิกไม่ได้อ้างใบปิดงาน ──
console.log('\n── 1. แถว WO เดิม + แถวย่อยราย batch ──');
const a = run(FX.summary());
eq('แถว WO: วัตถุดิบไม่ขยับ', a.r.rm_cost, FX.EXPECT.rm_cost);
eq('แถว WO: แปรสภาพไม่ขยับ', a.r.dl_oh_cost, FX.EXPECT.dl_oh_std);
eq('แถว WO: Summary Cost ไม่ขยับ', a.r.sc_value, FX.EXPECT.sc_value);
eq('แถว WO: ผลิตได้ไม่ขยับ', a.r.woc_qty, FX.EXPECT.woc_qty);
eq('แตก 2 batch', a.r.batch_count, 2);
eq('ป้ายช่อง batch ของแถว WO', a.r.batch_label, '2 batch');
// ใบเบิกใน fixture กลาง woc_id = null ทุกบรรทัด → ต้องไปอยู่แถว "ไม่ระบุ batch" ไม่ใช่ปัน
// ชื่อแถว = เลขที่ใบปิดงานของ task สุดท้าย (3001 มีสองขั้น — ต้องเป็นใบของ OP-30 ไม่ใช่ใบ Mixing 7003)
eq('แถวย่อย = 2 batch + ไม่ระบุ batch', a.r.batches.map(b => b.batch_label).join('|'),
  'WOCFSC00000900|WOCFSC00000901|ไม่ระบุ batch');
eq('ไม่ใช้เลขใบของขั้นกลาง', a.r.batches[0].batch_label.indexOf('WOCFSC00000902') >= 0, false);
const b1 = a.r.batches[0], b2 = a.r.batches[1], bx = a.r.batches[2];
eq('3001 แผน = ขั้นแรกเท่านั้น (ไม่บวกข้ามขั้น)', b1.wo_qty, 100276);
eq('3001 ผลิตได้', b1.woc_qty, 100276);
eq('3001 แปรสภาพผ่านใบปิดงาน 7001', b1.dl_oh_cost, 40298.58);
eq('3001 Summary Cost ผ่านใบปิดงานที่อ้างใบ 6001', b1.sc_value, 510093.30);
eq('3001 วันที่ปิดงาน', b1.woc_last, '26/07/2026');
eq('3002 แปรสภาพ', b2.dl_oh_cost, 30000);
eq('3002 Summary Cost', b2.sc_value, 510093.29);
eq('3002 ผลิตได้', b2.woc_qty, 60000);
eq('batch ที่ไม่มีใบเบิกอ้างถึง = วัตถุดิบ 0 (ไม่ปันให้)', b1.rm_cost + b2.rm_cost, 0);
eq('วัตถุดิบทั้งก้อนอยู่แถวไม่ระบุ batch', bx.rm_cost, FX.EXPECT.rm_cost);
eq('แถวไม่ระบุ batch ขึ้นเตือน', bx.notes.some(n => n.cls === 'warn'), true);
eq('batch ที่ปิดงานแต่ไม่มีใบเบิก ขึ้นเตือน',
  b1.notes.some(n => n.text.indexOf('ไม่มีบรรทัดใบเบิกวัตถุดิบ') >= 0), true);

console.log('\n── 2. ยอดทุก batch รวมกัน = แถว WO ──');
['woc_qty', 'rm_cost', 'dl_oh_cost', 'sc_value', 'cost'].forEach(k => {
  eq('ผลรวม ' + k, sumOf(a.r.batches, k), a.r[k]);
});
eq('ยอดตรงกัน → ไม่มีหมายเหตุว่ารวมไม่เท่า',
  a.r.notes.some(n => n.text.indexOf('รวมกันไม่เท่า') >= 0), false);

console.log('\n── 3. ตาราง: แถวย่อยอยู่ใต้แถว WO และไม่ถูกบวกเข้าแถวรวม ──');
eq('มีแถวย่อย 3 แถว', (a.html.match(/<tr class="brow">/g) || []).length, 3);
eq('ทุกแถวมี 17 เซลล์เท่าหัวตาราง', a.html.split('<tr class="brow">').slice(1)
  .every(s => (s.split('</tr>')[0].match(/<td[ >]/g) || []).length === 17), true);
eq('แถวย่อยอยู่หลังแถว WO', a.html.indexOf('WOCFSC00000900') > a.html.indexOf(FX.WO_HEADER.wo_no), true);
eq('เลขใบปิดงานเป็นลิงก์ไปเปิดใบนั้น', /<a [^>]*href="[^"]*7001"[^>]*>WOCFSC00000900<\/a>/.test(a.html), true);
const grand = /<tr class="grand">([\s\S]*?)<\/tr>/.exec(a.html)[1];
// แถวรวมท้ายตาราง: ช่องวัตถุดิบ = แถว WO ครั้งเดียว (ถ้าบวกแถวย่อยด้วยจะได้สองเท่า)
eq('แถวรวมท้ายตาราง วัตถุดิบ = ยอดของแถว WO ครั้งเดียว', grand.indexOf('347,651.01') >= 0, true);
eq('แถวรวมท้ายตารางนับเป็นใบ ไม่ใช่นับแถว', grand.indexOf('รวมทั้งหมด 1 ใบ') >= 0, true);

console.log('\n── 4. Excel: แถวละ batch แทนแถว WO + คอลัมน์ batch ──');
const d = a.T.summaryExportData(a.sm);
const ci = h => d.headers.indexOf(h);
eq('มีคอลัมน์ WOC task สุดท้าย ต่อจากใบสั่งผลิต', ci('WOC task สุดท้าย'), 1);
eq('ได้ 3 แถว (ไม่มีแถว WO ซ้ำ)', d.rows.length, 3);
eq('คอลัมน์ WOC task สุดท้าย', d.rows.map(r => r[ci('WOC task สุดท้าย')]).join('|'),
  'WOCFSC00000900|WOCFSC00000901|ไม่ระบุ batch');
eq('ทุกแถวมีเลขที่ใบสั่งผลิต (filter ได้)', d.rows.every(r => r[0] === FX.WO_HEADER.wo_no), true);
eq('ทุกแถวมีรหัสสินค้า', d.rows.every(r => r[ci('รหัสสินค้า')] === '11010900010'), true);
eq('SUM วัตถุดิบในไฟล์ = แถว WO', sumOf(d.rows.map(r => ({ v: r[ci('วัตถุดิบ')] })), 'v'), a.r.rm_cost);
eq('SUM Summary Cost ในไฟล์ = แถว WO',
  sumOf(d.rows.map(r => ({ v: r[ci('Summary Cost Item')] })), 'v'), a.r.sc_value);
eq('แถวไม่ระบุ batch ไม่มีผลิตได้ → ต้นทุน/หน่วย เป็นช่องว่าง ไม่ใช่ Infinity',
  d.rows[2][ci('ต้นทุน/หน่วย')], '');
eq('ข้อความจำนวนแถวบอกว่าเป็นแถวละ batch',
  a.T.summaryExportNote(a.sm), 'ได้ 3 แถวตามตารางด้านล่าง (1 ใบ · แถวละ batch)');

// หมายเหตุของแถว WO ต้องตามไปทุกแถวของไฟล์ — ในไฟล์ไม่มีแถว WO ให้อ่านแล้ว
console.log('\n── 4b. Excel: หมายเหตุระดับใบตามไปทุกแถว batch ──');
const fx4 = FX.summary();
fx4['ต้นทุนต่อลังตามประเภทย่อยสินค้า'] = [{ item_id: FX.FG_ITEM, cost_per_carton_flag: 'F' }];
const a4 = run(fx4);
const d4 = a4.T.summaryExportData(a4.sm);
const noteCol = d4.headers.indexOf('หมายเหตุ');
eq('แถว WO มีหมายเหตุ conversion = 1', a4.r.notes.some(n => n.text.indexOf('conversion = 1') >= 0), true);
eq('ทุกแถว batch ในไฟล์มีหมายเหตุระดับใบ (ติดป้าย "ทั้งใบ:")',
  d4.rows.every(r => String(r[noteCol]).indexOf('ทั้งใบ: ประเภทย่อยสินค้าตั้งไว้ไม่คิดต่อลัง') >= 0), true);
eq('หมายเหตุของ batch เองยังอยู่', String(d4.rows[2][noteCol]).indexOf('ระบุ batch ไม่ได้') >= 0, true);
eq('แถว batch บนจอไม่ถูกปนหมายเหตุระดับใบ',
  a4.r.batches.every(b => b.notes.every(n => n.text.indexOf('ทั้งใบ:') < 0)), true);

// ── 5. ใบเบิกอ้างใบปิดงานของ task สุดท้าย → วัตถุดิบลง batch นั้นตรง ๆ ──
console.log('\n── 5. วัตถุดิบอ้างใบปิดงาน → ลง batch ของใบนั้น ──');
const fx5 = FX.summary();
fx5['ภาพรวม — วัตถุดิบราย batch'] = [
  { wo_id: WO, woc_id: 7001, rm_cost: 200000.87 },
  { wo_id: WO, woc_id: 7002, rm_cost: 147650.14 }
];
const e = run(fx5);
eq('ไม่มีแถวไม่ระบุ batch', e.r.batches.map(b => b.batch_label).join('|'), 'WOCFSC00000900|WOCFSC00000901');
eq('3001 วัตถุดิบ', e.r.batches[0].rm_cost, 200000.87);
eq('3002 วัตถุดิบ', e.r.batches[1].rm_cost, 147650.14);
eq('3001 ต้นทุน/หน่วย = (วัตถุดิบ + แปรสภาพ) ÷ ผลิตได้ของ batch',
  e.r.batches[0].cost_per_unit, (200000.87 + 40298.58) / 100276);
eq('3002 ผลต่าง = Summary Cost − ต้นทุนของ batch', e.r.batches[1].sc_gap, 510093.29 - 177650.14);
eq('Excel ได้ 2 แถว', e.T.summaryExportData(e.sm).rows.length, 2);

// ── 6. ยอดราย batch ไม่เท่าแถว WO → แถว WO บอก ไม่ใช่เงียบ ──
console.log('\n── 6. ยอดรวมราย batch ไม่เท่าแถว WO ──');
const fx6 = FX.summary();
fx6['ภาพรวม — วัตถุดิบราย batch'] = [{ wo_id: WO, woc_id: 7001, rm_cost: 1 }];
const g = run(fx6);
eq('แถว WO ยังใช้ยอดทั้งใบ', g.r.rm_cost, FX.EXPECT.rm_cost);
eq('ขึ้นหมายเหตุช่องที่ไม่เท่า', g.r.notes.some(n => n.cls === 'warn'
  && n.text.indexOf('รวมกันไม่เท่ายอดทั้งใบที่ช่อง วัตถุดิบ') >= 0), true);

// ── 7. query ราย batch พัง → ไม่มีแถวย่อย แถว WO เดิมทุกหลัก + บอกเหตุ ──
console.log('\n── 7. query ราย batch พัง ──');
const fx7 = Object.assign({}, FX.summary(), { 'ใบปิดงานผลิต (WOC)': 'THROW' });
const k = run(fx7);
eq('ไม่มีแถวย่อย', k.r.batches.length, 0);
eq('แถว WO ไม่ขยับ', k.r.rm_cost + k.r.sc_value, FX.EXPECT.rm_cost + FX.EXPECT.sc_value);
eq('ขึ้นหมายเหตุว่าอ่านราย batch ไม่สำเร็จ',
  k.r.notes.some(n => n.text.indexOf('อ่านยอดราย batch ไม่สำเร็จ') >= 0), true);
eq('Excel กลับเป็นแถว WO แถวเดียว', k.T.summaryExportData(k.sm).rows.length, 1);

// ── 8. batch เดียว = แถวเดียวเหมือนเดิม + เลข batch ลงช่อง batch ──
console.log('\n── 8. batch เดียว ──');
const fx8 = FX.summary();
fx8['งานที่ปล่อยราย batch (task)'] = FX.TASK_ROWS.filter(t => t.batch_id === 3002);
fx8['ใบปิดงานผลิต (WOC)'] = fx8['ใบปิดงานผลิต (WOC)'].filter(w => w.batch_id === 3002);
fx8['ภาพรวม — วัตถุดิบราย batch'] = [{ wo_id: WO, woc_id: 7002, rm_cost: FX.EXPECT.rm_cost }];
fx8['ภาพรวม — แปรสภาพราย batch'] = [{ wo_id: WO, woc_id: 7002, dl_oh_std: FX.EXPECT.dl_oh_std }];
fx8['ภาพรวม — Summary Cost ราย batch'] = [{ wo_id: WO, tran_id: 6002, amount: FX.EXPECT.sc_value }];
const s1 = run(fx8);
eq('ไม่แตกแถวย่อย', s1.r.batches.length, 0);
eq('ช่อง WOC = เลขใบปิดงาน task สุดท้ายของ batch นั้น', s1.r.batch_label, 'WOCFSC00000901');
eq('ไม่มีแถว brow', s1.html.indexOf('<tr class="brow">') >= 0, false);
eq('Excel แถวเดียว + มีเลขใบปิดงาน', s1.T.summaryExportData(s1.sm).rows[0][1], 'WOCFSC00000901');

// ── 9. batch ปล่อยงานแล้วยังไม่ปิด = แถวที่บอกสถานะ ไม่ใช่ธงแดง ──
console.log('\n── 9. batch ยังไม่ปิดงาน ──');
const fx9 = FX.summary();
fx9['งานที่ปล่อยราย batch (task)'] = FX.TASK_ROWS.concat([
  { wo_id: WO, batch_id: 3003, pro_qty: 2724, good_qty: 0, op_seq: 1, last_task: 'T', prev_task: null }
]);
const u = run(fx9);
const b3 = u.r.batches.filter(b => b.batch_key === '3003')[0];
eq('มีแถว 3003', !!b3, true);
eq('3003 แผน', b3.wo_qty, 2724);
eq('3003 ยังไม่มีใบปิดงาน → ชื่อแถว "ยังไม่ปิดงาน"', b3.batch_label, 'ยังไม่ปิดงาน');
eq('3003 ยังไม่ปิด → ไม่มีวันที่ปิดงาน', b3.woc_last, '');
eq('3003 ต้นทุน/หน่วย = null (ยังไม่มีตัวหาร)', b3.cost_per_unit, null);
eq('3003 ไม่ใช่ธงแดง', b3.notes.some(n => n.cls === 'bad'), false);
eq('แถว WO บอกว่าปิดงานแล้วกี่ batch', u.html.indexOf('ปิดงานแล้ว 2 batch') >= 0, true);

// ── 10. ปิดงานแล้วแต่ไม่มีใบ summary cost ผูก = ธงแดงของ batch นั้น ──
console.log('\n── 10. ธงแดงราย batch ──');
const fx10 = FX.summary();
fx10['ใบปิดงานผลิต (WOC)'] = fx10['ใบปิดงานผลิต (WOC)']
  .map(w => (w.woc_id === 7002 ? Object.assign({}, w, { sc_ia: null }) : w));
const f10 = run(fx10);
const r3002 = f10.r.batches.filter(b => b.batch_key === '3002')[0];
eq('3002 ขึ้นธงแดง', r3002.notes.some(n => n.cls === 'bad'), true);
eq('3001 ไม่ขึ้นธงแดง', f10.r.batches[0].notes.some(n => n.cls === 'bad'), false);
eq('ใบ summary cost ที่ไม่มีใบปิดงานอ้าง ลงแถวไม่ระบุ batch',
  f10.r.batches.filter(b => b.batch_key === '')[0].sc_value, 510093.29);

// ── 11. ค่าจากข้อมูลผ่าน esc() ──
console.log('\n── 11. esc ──');
const fx11 = FX.summary();
const evil = '<img src=x onerror=alert(1)>';
fx11['ใบปิดงานผลิต (WOC)'] = fx11['ใบปิดงานผลิต (WOC)'].map(w => Object.assign({}, w, {
  woc_no: w.woc_id === 7002 ? evil : w.woc_no
}));
const x = run(fx11);
eq('เลขใบปิดงานถูก escape', x.html.indexOf(evil) >= 0, false);
eq('ยังแสดงค่าที่ escape แล้ว', x.html.indexOf('&lt;img src=x') >= 0, true);

const fails = H.fails();
console.log(fails ? '\nไม่ผ่าน ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
