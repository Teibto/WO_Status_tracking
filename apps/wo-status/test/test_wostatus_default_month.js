/**
 * เทส — วันที่ตั้งต้นของตัวกรอง WO Date From–To = เดือนปัจจุบัน (issue #92)
 *
 * ปัญหาที่กัน: เดิมหน้าแรกตั้งค่าเป็น today-6 → today (7 วัน) · ผู้ใช้สั่ง 2026-10-10
 * ให้ทุกรายงานใช้ความหมายเดียวกับรายงาน BOM คือวันที่ 1 ถึงวันสุดท้ายของเดือน
 * (`new Date(y, m, 1)` → `new Date(y, m+1, 0)`) ตามเวลาของ server
 *
 * เทสนี้ยัน
 *   1. หน้าแรก (ไม่มี action) ได้ 01..สิ้นเดือน — ต.ค. 31 วัน · ก.พ. ปีอธิกสุรทิน 29 วัน · ธ.ค. 31 วัน
 *   2. วันที่ที่ส่งมาเอง (action=search) ต้องได้วันที่นั้น ไม่ถูกค่าตั้งต้นแทน
 *   3. ช่วงเดือน 31 วันไม่ขึ้นคำเตือน "ช่วงกว้าง" (WIDE_RANGE_DAYS = 31) แต่ 32 วันขึ้น
 *
 * การ mock เวลา: แทน `global.Date` ด้วย subclass ที่ `new Date()` (ไม่มีอาร์กิวเมนต์) คืนเวลาที่กำหนด
 * ส่วนการเรียกแบบมีอาร์กิวเมนต์ทำงานเหมือนเดิม · คืน Date ตัวจริงทันทีหลังเรนเดอร์ (finally)
 */
const H = require('../../../test/lib/_harness');

const eq = H.makeEq();

// หน้าแรกยิงแค่ query ของ scope/ไลน์ผลิต — คืนแถวว่างได้หมด
function sqlRows() { return []; }

const { module: mod } = H.load({
  file: 'WOStatusTracking.js',
  libs: [
    'WOReportTheme.js',
    'WOStatusTracking_Labels.js',
    'WOStatusTracking_Queries.js',
    'WOStatusTracking_Drilldown.js',
  ],
  requireRunSQL: false,
  sqlRows,
  quietLog: true,
});

const RealDate = Date;

/** รัน fn ขณะที่ "ตอนนี้" ของ server = y/m/d (m เริ่มที่ 1) เวลา 23:30 local — ท้ายวันเพื่อจับวันเลื่อน */
function atServerTime(y, m, d, fn) {
  const fixed = new RealDate(y, m - 1, d, 23, 30, 0).getTime();
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() { return fixed; }
  }
  global.Date = MockDate;
  try { return fn(); } finally { global.Date = RealDate; }
}

function run(params) {
  const chunks = [];
  mod.onRequest({
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: () => {} },
  });
  return chunks.join('');
}

/** ค่าในช่อง input ของ dateFrom / dateTo ที่หน้าเรนเดอร์ออกมา */
function dateValues(html) {
  const pick = (id) => {
    const m = html.match(new RegExp('id="' + id + '" class="dateinput"\\s+value="([^"]*)"'));
    return m ? m[1] : null;
  };
  return { from: pick('dateFrom'), to: pick('dateTo') };
}

// ── 1. หน้าแรกได้เดือนปัจจุบัน ─────────────────────────────────────────
console.log('\n── หน้าแรก: วันที่ตั้งต้น = 1 ถึงวันสุดท้ายของเดือน ──');
const cases = [
  { now: [2026, 10, 10], from: '01/10/2026', to: '31/10/2026', name: '10 ต.ค. 2026' },
  { now: [2028, 2, 15],  from: '01/02/2028', to: '29/02/2028', name: 'ก.พ. ปีอธิกสุรทิน 2028' },
  { now: [2026, 2, 28],  from: '01/02/2026', to: '28/02/2026', name: 'ก.พ. ปีปกติ 2026 (วันสุดท้ายของเดือน)' },
  { now: [2026, 12, 31], from: '01/12/2026', to: '31/12/2026', name: '31 ธ.ค. 2026 (ไม่ล้นไปปีหน้า)' },
  { now: [2026, 11, 1],  from: '01/11/2026', to: '30/11/2026', name: '1 พ.ย. 2026 (วันแรกของเดือน)' },
];
cases.forEach((c) => {
  const html = atServerTime(c.now[0], c.now[1], c.now[2], () => run({}));
  const v = dateValues(html);
  eq(c.name + ' — From', v.from, c.from);
  eq(c.name + ' — To', v.to, c.to);
});

// ── 2. วันที่ที่ส่งมาเองต้องไม่ถูกแทน ─────────────────────────────────
console.log('\n── action=search: วันที่ที่ผู้ใช้ส่งมาคงเดิม ──');
const own = atServerTime(2026, 10, 10, () =>
  run({ action: 'search', dateFrom: '05/09/2026', dateTo: '20/09/2026' }));
const ov = dateValues(own);
eq('From ที่ส่งมา (05/09/2026) คงเดิม', ov.from, '05/09/2026');
eq('To ที่ส่งมา (20/09/2026) คงเดิม', ov.to, '20/09/2026');

// ── 3. เดือน 31 วันไม่ขึ้นคำเตือนช่วงกว้าง ─────────────────────────────
console.log('\n── คำเตือนช่วงกว้าง: 31 วันไม่เตือน · 32 วันเตือน ──');
const WIDE = /ช่วงกว้าง \(\d+ วัน\)/;
const oct = atServerTime(2026, 10, 10, () =>
  run({ action: 'search', dateFrom: '01/10/2026', dateTo: '31/10/2026' }));
eq('ช่วงเดือน ต.ค. (31 วัน) ไม่มีคำเตือนช่วงกว้าง', WIDE.test(oct), false);
const over = atServerTime(2026, 10, 10, () =>
  run({ action: 'search', dateFrom: '01/10/2026', dateTo: '01/11/2026' }));
eq('ช่วง 32 วันมีคำเตือนช่วงกว้าง (ตัวตรวจทำงานจริง)', /ช่วงกว้าง \(32 วัน\)/.test(over), true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
