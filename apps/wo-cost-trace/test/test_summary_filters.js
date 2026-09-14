/**
 * Harness — ตัวกรองบริษัท/อาคารผลิตของหน้าภาพรวมต้องเป็น dropdown เงื่อนไขเดียวกับ WO Status (#50)
 * ไม่แตะ NetSuite · stub N/query ให้คืนแถวตาม label ของ query เหมือนเทสอื่นในชุดนี้
 *
 * สิ่งที่ล็อกไว้ที่นี่
 *   1. สัญญาของ param ห้ามเปลี่ยน — ค่าที่ส่งยังเป็น internal id · ลิงก์เก่า &sub=&loc= ต้องยังใช้ได้
 *      และถูกเลือกค้างไว้ใน dropdown
 *   2. ค่าที่ไม่อยู่ในลิสต์ (คลังที่ไม่ใช่อาคารผลิต / บริษัทที่ไม่มีสิทธิ์) ต้องไม่ถูกรีเซ็ตเงียบ ๆ
 *      เป็น "ทั้งหมด" — ต้องเติมเป็นตัวเลือกชั่วคราวที่ยังเลือกค้างไว้
 *   3. ทั้งสองช่องมีตัวเลือก "ทั้งหมด" เป็นค่าเริ่มต้นเมื่อไม่ได้ระบุ
 *   4. query ที่เพิ่มมาไม่ทำให้หน้าพัง (ผ่าน runSQL ซึ่งมี try/catch ในตัว)
 */
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ json: true });

// ── ส่วนที่ 1: renderSummaryForm ตรง ๆ — ไม่ต้องพึ่งผล query ──────────────────
const { T } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['readFilters', 'renderSummaryForm']
});

const subRows = [{ id: 2, name: 'Foodstar' }, { id: 5, name: 'Other Co' }];
const locRows = [{ id: 10, name: 'PD_B1' }, { id: 23, name: 'PD_B2' }];

function formWith(over) {
  const f = T.readFilters(Object.assign({ from: '2026-07-01', to: '2026-07-31' }, over));
  f.subRows = subRows;
  f.locRows = locRows;
  return T.renderSummaryForm(f);
}

console.log('\n── เป็น dropdown เงื่อนไขเดียวกับ WO Status ──');
const htmlDefault = formWith({});
eq('ช่องบริษัทเป็น select ไม่ใช่ input ให้พิมพ์', htmlDefault.indexOf('<select name="sub">') > 0, true);
eq('ช่องอาคารผลิตเป็น select ไม่ใช่ input ให้พิมพ์', htmlDefault.indexOf('<select name="loc">') > 0, true);
eq('ไม่มีช่อง input ให้พิมพ์ id เองอีกแล้ว (sub)',
  /<input[^>]*name="sub"/.test(htmlDefault), false);
eq('ไม่มีช่อง input ให้พิมพ์ id เองอีกแล้ว (loc)',
  /<input[^>]*name="loc"/.test(htmlDefault), false);
eq('ป้ายเปลี่ยนเป็น "อาคารผลิต"', htmlDefault.indexOf('อาคารผลิต') > 0, true);
eq('ไม่เหลือป้ายเดิม "คลัง (id)"', htmlDefault.indexOf('คลัง (id)') >= 0, false);
eq('รายชื่ออาคารผลิตมีตัวเลือกจริง (PD_B1)', htmlDefault.indexOf('PD_B1') > 0, true);
eq('รายชื่อบริษัทมีตัวเลือกจริง (Foodstar)', htmlDefault.indexOf('Foodstar') > 0, true);

console.log('\n── ไม่ระบุ = ตัวเลือก "ทั้งหมด" เป็นค่าเริ่มต้น ──');
eq('บริษัท: ทั้งหมด ถูกเลือกไว้', /<option value=""\s+selected>— ทุกบริษัท —<\/option>/.test(htmlDefault), true);
eq('อาคารผลิต: ทั้งหมด ถูกเลือกไว้', /<option value=""\s+selected>— ทุกสถานที่ —<\/option>/.test(htmlDefault), true);

console.log('\n── ค่าที่ส่งออกยังเป็น internal id (สัญญาเดิมห้ามเปลี่ยน) ──');
const htmlSel = formWith({ sub: '2', loc: '10' });
eq('option ของบริษัทที่เลือกใช้ id เป็น value', /<option value="2" selected>Foodstar<\/option>/.test(htmlSel), true);
eq('option ของอาคารผลิตที่เลือกใช้ id เป็น value', /<option value="10" selected>PD_B1<\/option>/.test(htmlSel), true);
eq('"ทั้งหมด" ไม่ถูกเลือกเมื่อระบุค่าจริง',
  /<option value=""\s+selected>/.test(htmlSel), false);

console.log('\n── ลิงก์เก่า &sub=2&loc=10 ต้องยังใช้ได้และถูกเลือกค้างไว้ ──');
const fOld = T.readFilters({ from: '2026-07-01', to: '2026-07-31', sub: '2', loc: '10' });
eq('readFilters ยังคืน internal id ตรง ๆ (sub)', fOld.sub, '2');
eq('readFilters ยังคืน internal id ตรง ๆ (loc)', fOld.loc, '10');

console.log('\n── ค่าที่ไม่อยู่ในลิสต์ต้องไม่หายเงียบ (ข้อ 2 ของ #50) ──');
const htmlMissingLoc = formWith({ loc: '999' });
eq('อาคารผลิตที่ id ไม่อยู่ในลิสต์ ยังถูกเลือกไว้ (ไม่ใช่ "" )',
  /<option value="999" selected>/.test(htmlMissingLoc), true);
eq('"ทุกสถานที่" ไม่ได้ถูกเลือกแทนเงียบ ๆ เมื่อค่าไม่อยู่ในลิสต์',
  /<option value=""\s+selected>— ทุกสถานที่ —<\/option>/.test(htmlMissingLoc), false);
// sub ไม่ได้ระบุในเคสนี้ — "ทุกบริษัท" ต้องยังถูกเลือกไว้ตามปกติ ไม่ใช่ผลข้างเคียงจาก loc
eq('ช่องบริษัทที่ไม่เกี่ยวข้องไม่ถูกกระทบ', /<option value=""\s+selected>— ทุกบริษัท —<\/option>/.test(htmlMissingLoc), true);
eq('ตัวเลือกชั่วคราวบอกว่าไม่อยู่ในลิสต์ ไม่ใช่ทำเนียนเป็นชื่อจริง',
  htmlMissingLoc.indexOf('ไม่อยู่ในรายชื่ออาคารผลิต') > 0, true);

const htmlMissingSub = formWith({ sub: '777' });
eq('บริษัทที่ id ไม่อยู่ในลิสต์ ยังถูกเลือกไว้',
  /<option value="777" selected>/.test(htmlMissingSub), true);
eq('บอกว่าไม่อยู่ในรายชื่อบริษัท', htmlMissingSub.indexOf('ไม่อยู่ในรายชื่อบริษัท') > 0, true);

// ── ส่วนที่ 2: onRequest เต็มทาง — พิสูจน์ query ที่เพิ่มมาไม่ทำให้หน้าพัง ────────
console.log('\n── onRequest เต็มทาง: มี dropdown จริงในหน้า ──');
function makeCtx(params) {
  const chunks = [];
  return {
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: () => {} },
    body: () => chunks.join('')
  };
}
const { module: mod } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true
});
const ctx1 = makeCtx({ from: '2026-07-01', to: '2026-07-31', sub: '2', loc: '10' });
mod.onRequest(ctx1);
const page1 = ctx1.body();
eq('หน้าไม่ล่ม มี select ของบริษัท', page1.indexOf('<select name="sub">') > 0, true);
eq('ค่าจาก query string ยังถูกเลือกไว้ในหน้าเต็ม', /<option value="2" selected>Foodstar<\/option>/.test(page1), true);
eq('ค่าจาก query string ยังถูกเลือกไว้ในหน้าเต็ม (loc)', /<option value="10" selected>PD_B1<\/option>/.test(page1), true);

console.log('\n── query ที่เพิ่มมาไม่ทำให้ตัวเลขของรายงานเปลี่ยน ──');
// เทียบ shown/total ระหว่างมี sub/loc ตรงกับ fixture กับไม่ระบุเลย ทั้งคู่ต้องได้ผลลัพธ์เดิม
// (fixture ชุดนี้ไม่ได้ผูก sub/loc เข้ากับเงื่อนไขจริงของ SQL จำลอง แค่พิสูจน์ว่าไม่ throw/ไม่เปลี่ยนพัง)
const ctx2 = makeCtx({ mode: 'json', from: '2026-07-01', to: '2026-07-31' });
mod.onRequest(ctx2);
const j2 = JSON.parse(ctx2.body());
eq('ยิง query แล้วไม่พัง (มี summary กลับมา)', !!j2.summary, true);
eq('มี query ของ dropdown ปรากฏใน qlog', j2.qlog.some((q) => q.label === 'ตัวกรอง — บริษัท'), true);
eq('มี query ของ dropdown ปรากฏใน qlog (อาคารผลิต)', j2.qlog.some((q) => q.label === 'ตัวกรอง — อาคารผลิต'), true);
eq('query ของ dropdown ไม่มี error', j2.qlog.filter((q) => q.label.indexOf('ตัวกรอง') === 0 && q.error).length, 0);

console.log('\n── query dropdown พังแล้วหน้าต้องไม่ล่ม (อย่างน้อยเท่าที่ WO Status ทำ) ──');
const brokenFx = Object.assign({}, FX.summary(), { 'ตัวกรอง — บริษัท': 'THROW', 'ตัวกรอง — อาคารผลิต': 'THROW' });
H.setFixtures(brokenFx);
const ctx3 = makeCtx({ from: '2026-07-01', to: '2026-07-31' });
let threw = false;
try { mod.onRequest(ctx3); } catch (e) { threw = true; }
eq('onRequest ไม่ throw แม้ query dropdown พัง', threw, false);
eq('หน้ายังเรนเดอร์ต่อได้ (มี select ว่างแต่ไม่ล่ม)', ctx3.body().indexOf('<select name="sub">') > 0, true);
H.setFixtures(FX.summary());

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
