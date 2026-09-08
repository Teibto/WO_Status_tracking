/**
 * เทส — query log ต้องมีอายุเท่ากับหนึ่ง request (issue #13)
 *
 * ปัญหาที่กัน: `QLOG` เป็น array ระดับ module และ NetSuite reuse module instance
 * ข้าม request ได้ · ถ้าลืมล้าง จะได้ log สะสมข้าม request **แบบเงียบ**
 * หน้ารายงานจะบอกว่ายิง query ไป 38 คำสั่งทั้งที่รอบนี้ยิงไป 19 แล้วคนอ่านจะสรุปว่า
 * รายงานช้าเพราะยิงซ้ำ ซึ่งไม่จริง · และตัวนับ error จะนับ error ของรอบก่อนมาด้วย
 *
 * วิธีเทส: ยิง `onRequest` **สองครั้งติดกันบน module instance เดียวกัน**
 * แล้วดูว่ารอบสองไม่มีของรอบแรกติดมา — ทั้งชั้นภาพรวมและชั้นเจาะลึก
 */
const H = require('./_harness');
const FX = require('./fixtures_parity');

const eq = H.makeEq({ json: true });

// ── ctx ปลอมที่พอให้ onRequest ทำงาน ────────────────────────────────────────
function makeCtx(params) {
  const chunks = [];
  return {
    request: { parameters: params },
    response: {
      write: (s) => chunks.push(typeof s === 'string' ? s : String(s)),
      setHeader: () => {}
    },
    body: () => chunks.join('')
  };
}

const { module: mod } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js'],
  fixtures: FX.summary(),
  quietLog: true
});

function runJson(params) {
  const ctx = makeCtx(params);
  mod.onRequest(ctx);
  return JSON.parse(ctx.body());
}

console.log('\n── ชั้นภาพรวม: ยิงสองรอบติดกัน ──');
const a = runJson({ mode: 'json', from: '2026-07-01', to: '2026-07-31' });
const b = runJson({ mode: 'json', from: '2026-07-01', to: '2026-07-31' });

eq('รอบแรกมี query จริง', a.qlog.length > 0, true);
eq('รอบสองยิงเท่ารอบแรก ไม่สะสม', b.qlog.length, a.qlog.length);
eq('label ตัวแรกของรอบสองไม่ใช่ของรอบแรกที่ค้าง',
  b.qlog[0].label, a.qlog[0].label);
eq('ยอดของรอบสองเท่ารอบแรก', JSON.stringify(b.summary.rows.length), JSON.stringify(a.summary.rows.length));

console.log('\n── ยิงสามรอบแล้วจำนวนต้องคงที่ ──');
const c = runJson({ mode: 'json', from: '2026-07-01', to: '2026-07-31' });
eq('รอบสามก็เท่าเดิม', c.qlog.length, a.qlog.length);

console.log('\n── ชั้นเจาะลึก: สลับชั้นแล้วต้องไม่เอา log ข้ามชั้นมาด้วย ──');
H.setFixtures(FX.drilldown());
const d1 = runJson({ mode: 'json', wo: FX.WO_HEADER.wo_no });
const d2 = runJson({ mode: 'json', wo: FX.WO_HEADER.wo_no });
eq('ชั้นเจาะลึกมี query จริง', d1.qlog.length > 0, true);
eq('ยิงซ้ำแล้วไม่สะสม', d2.qlog.length, d1.qlog.length);
// ชั้นเจาะลึกยิง query มากกว่าชั้นภาพรวม — ถ้าเลขสองชั้นเท่ากันแปลว่าอ่านผิดตัว
eq('สองชั้นยิงไม่เท่ากัน (ยันว่านับของชั้นที่เรียกจริง)', d1.qlog.length === a.qlog.length, false);

console.log('\n── error ของรอบก่อนต้องไม่ติดมารอบใหม่ ──');
// ให้ label หนึ่งพังในรอบแรก แล้วรอบสองใช้ fixture ปกติ
// ใช้ label ที่ qlog รอบแรกบอกมาจริง ไม่เดาชื่อเอง (เดาผิดแล้วเทสจะผ่านแบบไม่ได้ทดสอบอะไร)
const broken = Object.assign({}, FX.summary());
broken[a.qlog[0].label] = 'THROW';
H.setFixtures(broken);
const e1 = runJson({ mode: 'json', from: '2026-07-01', to: '2026-07-31' });
const errs1 = e1.qlog.filter((q) => q.error).length;
H.setFixtures(FX.summary());
const e2 = runJson({ mode: 'json', from: '2026-07-01', to: '2026-07-31' });
const errs2 = e2.qlog.filter((q) => q.error).length;
eq('รอบที่ fixture พังต้องมี error', errs1 > 0, true);
eq('รอบถัดมาที่ fixture ปกติต้องไม่มี error ค้าง', errs2, 0);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
