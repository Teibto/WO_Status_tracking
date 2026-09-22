/**
 * Harness — แถบตัวกรองของ WO Cost Trace ต้องเป็นโครง .filterbar/.fld ไม่ใช่ข้อความไหลต่อกัน
 *
 * ที่มา: ผู้ใช้รายงานว่า "จัดวาง field ยังเบียดกัน ความกว้างของ field ยังไม่เหมาะสม"
 * ของเดิมเป็น inline flow — ป้ายกับช่องอยู่บรรทัดเดียวกันคั่นด้วย `&nbsp;` ขึ้นบรรทัดด้วย `<br>`
 * และความกว้างเขียนเป็น `style="width:45px"` ติดที่ตัว input เอง
 *
 * สิ่งที่ล็อกไว้ที่นี่ (ทั้งหน้าภาพรวมและหน้าเจาะลึก)
 *   1. ไม่มี `&nbsp;` / `<br>` เป็นตัวจัดระยะอีก — ระยะห่างมาจาก gap ของ flex เท่านั้น
 *   2. ทุกช่องที่ผู้ใช้เห็นอยู่ใน `.fld` ที่มี `<label>` ของตัวเอง (ป้ายอยู่เหนือช่อง)
 *   3. ห้ามมี `style="width:"` ที่ตัว input/select — inline style ชนะ CSS ของ .filterbar ทุกกรณี
 *      ความกว้างจึงต้องอยู่ที่ `.fld` จุดเดียว (เขียนเป็น flex-basis)
 *   4. CSS ของ .fld ต้องมี `min-width:0` — flex item มี min-width:auto มาแต่เกิด ซึ่งดัน .fld
 *      ให้กว้างเท่า min-content ของลูก ชนะ flex-basis เงียบ ๆ · วัดจริงตอนทำ: ช่องช่วงวันที่
 *      บานจาก 270px เป็น 399px ทั้งที่ตั้ง flex:0 0 270px ไว้ (ไม่มี error ใด ๆ ให้เห็น)
 *   5. .filterbar ต้องไม่มีพื้น/เส้นขอบ/padding ของตัวเอง — `form` เป็นการ์ดอยู่แล้ว
 *      (กฎ form{} ใน REPORT_CSS) ใส่ซ้ำจะได้กล่องซ้อนกล่อง
 */
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ json: true });

const { T, libT } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['readFilters', 'renderSummaryForm', 'renderForm'],
  libExports: { 'WOCostTrace_Ready.js': ['renderReadyForm'] }
});

/** rd ย่อ ๆ เท่าที่ renderReadyForm ใช้จริง — เทสนี้ดูโครง markup ไม่ได้ดูตัวเลข */
const READY_RD = {
  woKey: 'WO-FSC-00000392',
  date_iso: '2026-08-07',
  qty_from_wo: 10000,
  params: {},
  stock_locs: [10],
  locations: [{ loc_id: 10, loc_name: 'PD_B1', is_plant: 'T' }]
};

const f = T.readFilters({ from: '2026-07-01', to: '2026-07-31' });
f.subRows = [{ id: 2, name: 'Foodstar' }];
f.locRows = [{ id: 10, name: 'PD_B1' }];

/**
 * เอาเฉพาะก้อน <div class="filterbar">…</div> โดยนับชั้น <div> ให้จบพอดี
 * ตัดไม่ได้ด้วย indexOf('</form>') เพราะข้อความช่วยใต้ฟอร์มจะติดมาด้วย — ข้อความนั้นมี <br>
 * ได้ตามปกติ (เป็นย่อหน้า ไม่ใช่ตัวจัดระยะของช่องกรอก) แล้วจะทำให้ข้อ 1 ฟ้องผิดตัว
 */
function bar(html) {
  const start = html.indexOf('<div class="filterbar">');
  if (start < 0) return '';
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html)) !== null) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.substring(start, re.lastIndex);
  }
  return html.substring(start);
}

/**
 * ชื่อช่องที่ผู้ใช้เห็น (ไม่นับ hidden) ซึ่ง **ไม่ได้** อยู่ใน .fld
 * นับชั้น <div> จริงแทนการ strip ด้วย regex เพราะ .fld มี <div class="range"> ซ้อนอยู่ข้างใน
 * — regex non-greedy จะตัดผิดชั้นแล้วรายงานผลลวง (เจอมาแล้วตอนเขียนเทสนี้)
 */
function ctrlsOutsideFld(html) {
  const re = /<div\b[^>]*>|<\/div>|<(?:input|select)\b[^>]*>/g;
  const out = [];
  let depth = 0, fldDepth = -1, m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (tag === '</div>') {
      depth -= 1;
      if (fldDepth >= depth) fldDepth = -1;
    } else if (tag.indexOf('<div') === 0) {
      if (fldDepth < 0 && / class="fld"/.test(tag)) fldDepth = depth;
      depth += 1;
    } else if (fldDepth < 0 && tag.indexOf('type="hidden"') < 0) {
      out.push((tag.match(/name="([^"]*)"/) || [, tag])[1]);
    }
  }
  return out;
}

const FORMS = [
  { name: 'หน้าภาพรวม', html: T.renderSummaryForm(f) },
  { name: 'หน้าเจาะลึก', html: T.renderForm('WOFSC00000470', '2026-07-31', f) },
  { name: 'หน้าตรวจความพร้อม', html: libT['WOCostTrace_Ready.js'].renderReadyForm(READY_RD) }
];

FORMS.forEach((form) => {
  console.log('\n── ' + form.name + ' ──');
  const b = bar(form.html);
  eq('มีแถบ .filterbar', b.length > 0, true);

  // 1. ไม่มีตัวจัดระยะแบบข้อความอีก
  eq('ไม่มี &nbsp; เป็นตัวคั่นช่อง', b.indexOf('&nbsp;') >= 0, false);
  eq('ไม่มี <br> เป็นตัวขึ้นบรรทัด', /<br[\s/>]/.test(b), false);

  // 2. ทุกช่องอยู่ใน .fld ที่มี label ของตัวเอง
  const flds = b.split('<div class="fld"').slice(1);
  eq('มี .fld อย่างน้อย 2 ช่อง', flds.length >= 2, true);
  flds.forEach((fld, i) => {
    eq('.fld ที่ ' + (i + 1) + ' มี <label> ของตัวเอง', /<label>/.test(fld), true);
    eq('.fld ที่ ' + (i + 1) + ' กำหนดความกว้างเป็น flex-basis ที่ตัวมันเอง',
      /^ style="flex:0 0 \d+px">/.test(fld), true);
  });
  eq('ไม่มี input/select ที่ผู้ใช้เห็นหลุดออกนอก .fld', ctrlsOutsideFld(b).join(','), '');

  // 3. ความกว้างต้องอยู่ที่ .fld ไม่ใช่ที่ตัวควบคุม
  eq('ไม่มี style="width:" ติดที่ input/select',
    /<(?:input|select)[^>]*style="[^"]*width:/.test(b), false);
});

// ── CSS ของแถบตัวกรอง (มาจาก REPORT_CSS ผ่าน shell()) ────────────────────
console.log('\n── CSS ของแถบตัวกรอง (หน้าเต็มผ่าน onRequest) ──');
const { module: mod } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true
});
const chunks = [];
mod.onRequest({
  request: { parameters: { from: '2026-07-01', to: '2026-07-31' } },
  response: { write: (s) => chunks.push(String(s)), setHeader: () => {} }
});
const style = (chunks.join('').match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';

[
  '.filterbar{', '.filterbar .fld{', '.filterbar .brk{', '.filterbar .range{',
  '.filterbar .act{', '.filterbar .rw-combobox{', '.filterbar .rw-combobox .rw-combobox-input{'
].forEach((needle) => eq('CSS มี ' + needle, style.indexOf(needle) >= 0, true));

const fldRule = (style.match(/\.filterbar \.fld\{([^}]*)\}/) || [])[1] || '';
eq('.fld มี min-width:0 (กัน min-width:auto ดันช่องให้บานเกิน flex-basis)',
  /min-width:0/.test(fldRule), true);
eq('.fld ยังเป็นกล่องแนวตั้ง ป้ายอยู่เหนือช่อง', /flex-direction:column/.test(fldRule), true);

const barRule = (style.match(/\.filterbar\{([^}]*)\}/) || [])[1] || '';
eq('.filterbar เป็น flex ที่ตัดบรรทัดได้', /display:flex/.test(barRule) && /flex-wrap:wrap/.test(barRule), true);
eq('.filterbar ไม่ประกาศพื้น/ขอบ/padding ซ้ำกับการ์ด form',
  /background|border|padding/.test(barRule), false);

// ── ที่พับ "ตัวกรองเพิ่มเติม" ของหน้าภาพรวม (issue #86) ──────────────────────
/**
 * แถบตัวกรองเคยสูง 231px เพราะ `.brk` สองตัวบังคับขึ้นบรรทัดตายตัว · ตัวกรองรองย้ายเข้า
 * `<details>` แล้ว — สิ่งที่เทสชุดนี้เฝ้าคือ "การพับต้องไม่ทำให้ตัวกรองหายไป" ซึ่งเป็นอาการ
 * เดียวกับ "ตารางว่างที่อธิบายไม่ได้" ที่ #77 เพิ่งปิดไป
 *
 *   1. สถานะกาง/พับมาจาก **เซิร์ฟเวอร์** (attribute `open` ใน HTML) ไม่ใช่ JS — ต้องถูกแม้ JS พัง
 *   2. นิยาม "ค่าเริ่มต้น" มาจาก SUMMARY_DEFAULTS ชุดเดียวกับที่ readFilters ใช้ · ค่าที่
 *      readFilters ปัดกลับเป็นค่าเริ่มต้นไปแล้ว (`?sort=ขยะ`) ต้องไม่ทำให้กางโดยไม่มีสาเหตุที่มองเห็น
 *   3. ช่องที่อยู่ในที่พับยังอยู่ใน <form> เดียวกันและไม่ถูก disabled — สองทางเดียวที่ markup
 *      ทำให้ค่าไม่ถูกส่งไปกับฟอร์ม (เทสต์สถิตพิสูจน์การ submit จริงของเบราว์เซอร์ไม่ได้)
 *   4. แถวหลักเหลือ 4 ช่อง + ปุ่ม และไม่มี `.brk` อีก · ช่องบริษัท/อาคารผลิตยังกว้าง ≥170px
 *      (ต่ำกว่านั้น combobox ที่ client สร้างครอบจะล้นกรอบ — WOCostTrace_Common.js:262-264)
 */
console.log('\n── ที่พับ "ตัวกรองเพิ่มเติม" (#86) ──');

/** ก้อน <details class="morefld"> … </details> ของหน้าภาพรวม (ไม่มี <details> ซ้อนข้างใน) */
function moreBlock(html) {
  const i = html.indexOf('<details class="morefld"');
  if (i < 0) return '';
  const end = html.indexOf('</details>', i);
  return end < 0 ? html.substring(i) : html.substring(i, end + '</details>'.length);
}

/** ฟอร์มภาพรวมจาก param ดิบ — ผ่าน readFilters เสมอ เทสนี้จึงไม่ได้ตั้งค่าเริ่มต้นซ้ำเอง */
function sumForm(params) {
  const ff = T.readFilters(params || {});
  ff.subRows = [{ id: 2, name: 'Foodstar' }];
  ff.locRows = [{ id: 10, name: 'PD_B1' }];
  return T.renderSummaryForm(ff);
}

const CLOSED = /^<details class="morefld">/;
const OPEN = /^<details class="morefld" open>/;

// ไม่ส่ง param อะไรเลย = เดือนปัจจุบันทั้งเดือน + ค่าเริ่มต้นทุกช่อง
const noneBlk = moreBlock(sumForm({}));
eq('มีที่พับ <details class="morefld">', noneBlk.length > 0, true);
eq('ไม่มีตัวกรองรอง → พับไว้ (ไม่มี open)', CLOSED.test(noneBlk), true);
eq('ไม่มีตัวกรองรอง → summary ไม่มีคำว่า "ตั้งไว้"', noneBlk.indexOf('ตั้งไว้') >= 0, false);
eq('summary ยังบอกว่ามันคืออะไร',
  noneBlk.indexOf('<summary>ตัวกรองเพิ่มเติม</summary>') > 0, true);

// ทีละช่อง — แต่ละช่องต้องกางเองได้ด้วยตัวมันเอง
[
  { name: 'รหัสสินค้า (item)', p: { item: 'FG-001' } },
  { name: 'จับจาก (basis=wo)', p: { basis: 'wo' } },
  { name: 'เรียงตาม (sort=gap)', p: { sort: 'gap' } },
  { name: 'ไม่เกิน (max=50)', p: { max: '50' } }
].forEach((c) => {
  const blk = moreBlock(sumForm(c.p));
  eq(c.name + ' → เซิร์ฟเวอร์ใส่ open มาเอง', OPEN.test(blk), true);
  eq(c.name + ' → summary บอก "ตั้งไว้ 1 ช่อง"', blk.indexOf('ตั้งไว้ 1 ช่อง') > 0, true);
});

// ค่าที่อ่านไม่ออก — readFilters ปัดกลับเป็นค่าเริ่มต้นไปแล้ว จึงต้องไม่กาง
const junkBlk = moreBlock(sumForm({ sort: 'ไม่มีจริง', max: 'abc', basis: 'zz' }));
eq('ค่าที่ถูกปัดกลับเป็นค่าเริ่มต้น → ไม่กางโดยไม่มีสาเหตุที่มองเห็น', CLOSED.test(junkBlk), true);

// เดือน = กำหนดวันที่เอง → กางเสมอ เพราะช่องวันที่ที่ต้องกรอกอยู่ข้างใน
const customBlk = moreBlock(sumForm({ month: 'custom' }));
eq('month=custom → กางเสมอ', OPEN.test(customBlk), true);
eq('month=custom อย่างเดียวไม่นับเป็น "ช่องที่ตั้งไว้" (เดือนอยู่แถวหลักที่เห็นอยู่แล้ว)',
  customBlk.indexOf('ตั้งไว้') >= 0, false);
eq('ลิงก์เก่าที่ส่ง from/to มาเอง → กางเช่นกัน (month ว่าง)',
  OPEN.test(moreBlock(sumForm({ from: '2026-07-01', to: '2026-07-31' }))), true);

// นับหลายช่องพร้อมกัน
eq('3 ช่องพร้อมกัน → "ตั้งไว้ 3 ช่อง"',
  moreBlock(sumForm({ item: 'FG', sort: 'unit', max: '10' })).indexOf('ตั้งไว้ 3 ช่อง') > 0, true);
eq('ครบทั้ง 4 ช่องในที่พับ → "ตั้งไว้ 4 ช่อง"',
  moreBlock(sumForm({ item: 'FG', sort: 'unit', max: '10', basis: 'wo' }))
    .indexOf('ตั้งไว้ 4 ช่อง') > 0, true);
eq('ช่องที่อยู่แถวหลัก (sub/loc/wono) ไม่ถูกนับเข้ากับที่พับ',
  CLOSED.test(moreBlock(sumForm({ sub: '2', loc: '10', wono: 'WOFSC00000470' }))), true);

// ลิงก์ "กลับหน้าภาพรวม" จากหน้าเจาะลึก — `filterParams` (WOCostTrace_Common.js) ส่ง
// `basis`/`sort`/`max` ติดไปทุกครั้งแม้ผู้ใช้ไม่เคยแตะ — URL ที่มีค่าเท่าค่าเริ่มต้น
// ต้องไม่ทำให้ที่พับกางและไม่ขึ้นว่า "ตั้งไว้ n ช่อง" ทั้งที่ผู้ใช้ไม่ได้ตั้งเอง
const backBlk = moreBlock(sumForm({
  month: '2026-09', from: '2026-09-01', to: '2026-09-30',
  basis: 'woc', sort: 'item', max: '200'
}));
eq('ลิงก์กลับจากหน้าเจาะลึก (filterParams ส่ง basis/sort/max มาครบ) → ไม่กางเอง',
  CLOSED.test(backBlk), true);
eq('ลิงก์กลับจากหน้าเจาะลึก → summary ไม่ขึ้นว่า "ตั้งไว้"',
  backBlk.indexOf('ตั้งไว้') >= 0, false);

// ── ช่องในที่พับยังถูกส่งไปกับฟอร์มเดียวกัน ─────────────────────────────────
console.log('\n── ช่องในที่พับต้องยังถูกส่งไปกับฟอร์ม ──');
const full = sumForm({ item: 'FG', sort: 'gap', max: '10', basis: 'wo', sub: '2', loc: '10' });
const formStart = full.indexOf('<form');
const formEnd = full.indexOf('</form>');
eq('มี <form> เดียวในหน้านี้', full.split('<form').length - 1, 1);
const detailsAt = full.indexOf('<details class="morefld"');
eq('ที่พับอยู่ข้างใน <form> (ไม่หลุดออกไปนอก)',
  detailsAt > formStart && detailsAt < formEnd, true);
const inForm = full.substring(formStart, formEnd);
['from', 'to', 'item', 'sort', 'basis', 'max'].forEach((n) => {
  eq('ช่อง ' + n + ' ยังอยู่ใน <form> เดียวกัน',
    new RegExp('<(?:input|select)[^>]*name="' + n + '"').test(inForm), true);
});
eq('ไม่มีช่องไหนถูกตั้ง disabled (ค่าจะไม่ถูกส่งไปกับฟอร์ม)',
  /<(?:input|select)[^>]*\sdisabled/.test(inForm), false);
eq('ไม่มีปุ่ม submit ตัวที่สองในที่พับ (combobox _avoid หยิบตัวแรกในเอกสาร)',
  moreBlock(full).indexOf('type="submit"') >= 0, false);

// ── แถวหลักเหลือ 4 ช่อง + ปุ่ม ────────────────────────────────────────────
console.log('\n── แถวหลักเหลือ 4 ช่อง + ปุ่ม ──');
const mainBar = bar(full);
eq('แถวหลักมี .fld 4 ช่อง', mainBar.split('<div class="fld"').length - 1, 4);
// #88 — `.act` ย้ายออกจาก .filterbar มาอยู่นอก details.filterbox แล้ว
// (พิสูจน์ตำแหน่งใหม่แบบโครงสร้างที่ท้ายไฟล์ ไม่ใช่แค่ "ไม่มีในแถวนี้")
eq('แถวหลักไม่มี .act อีกแล้ว (ปุ่มย้ายออกไปนอกกล่องตัวกรอง)',
  mainBar.indexOf('<div class="act">') >= 0, false);
eq('ฟอร์มภาพรวมไม่ใช้ <div class="brk"> อีกแล้ว', full.indexOf('class="brk"') >= 0, false);
['month', 'sub', 'loc', 'wono'].forEach((n) => {
  eq('แถวหลักมีช่อง ' + n,
    new RegExp('<(?:input|select)[^>]*name="' + n + '"').test(mainBar), true);
});
const mainFlds = [];
mainBar.replace(/<div class="fld" style="flex:0 0 (\d+)px">\s*<label>([^<]*)<\/label>/g,
  (m, px, label) => { mainFlds.push({ px: Number(px), label: label }); return m; });
eq('อ่านความกว้างของทุกช่องในแถวหลักได้ครบ', mainFlds.length, 4);
['บริษัท', 'อาคารผลิต'].forEach((label) => {
  const hit = mainFlds.filter(x => x.label === label)[0];
  eq('ช่อง ' + label + ' อยู่แถวหลักและกว้าง >=170px (กัน combobox ล้นกรอบ)',
    !!hit && hit.px >= 170, true);
});

// ── โครงของแถบในที่พับต้องเข้มเท่าแถวหลัก ──────────────────────────────────
console.log('\n── โครงของแถบในที่พับ ──');
const moreBar = bar(moreBlock(full));
eq('ในที่พับเป็นโครง .filterbar เหมือนแถวหลัก', moreBar.length > 0, true);
const moreFlds = moreBar.split('<div class="fld"').slice(1);
eq('ที่พับมี 5 ช่อง', moreFlds.length, 5);
moreFlds.forEach((fld, i) => {
  eq('ช่องที่ ' + (i + 1) + ' ในที่พับมี <label> ของตัวเอง', /<label>/.test(fld), true);
  eq('ช่องที่ ' + (i + 1) + ' ในที่พับกำหนดความกว้างเป็น flex-basis ที่ตัวมันเอง',
    /^ style="flex:0 0 \d+px">/.test(fld), true);
});
eq('ที่พับไม่มี style="width:" ติดที่ input/select',
  /<(?:input|select)[^>]*style="[^"]*width:/.test(moreBar), false);
eq('ที่พับไม่ใช้ &nbsp; / <br> จัดระยะ',
  moreBar.indexOf('&nbsp;') >= 0 || /<br[\s/>]/.test(moreBar), false);
eq('ไม่มี input/select หลุดออกนอก .fld ในที่พับ', ctrlsOutsideFld(moreBar).join(','), '');

// ── CSS ของที่พับ ─────────────────────────────────────────────────────────
console.log('\n── CSS ของที่พับ ──');
['.morefld{', '.morefld>summary{', '.morefld>.filterbar{'].forEach((needle) => {
  eq('CSS มี ' + needle, style.indexOf(needle) >= 0, true);
});
const moreCss = ((style.match(/\.morefld\{([^}]*)\}/) || [])[1] || '')
  + ((style.match(/\.morefld>summary\{([^}]*)\}/) || [])[1] || '')
  + ((style.match(/\.morefld>\.filterbar\{([^}]*)\}/) || [])[1] || '');
eq('summary ของที่พับไม่เปลี่ยน display (เปลี่ยนแล้วสามเหลี่ยมเปิด/ปิดหาย)',
  /display:/.test((style.match(/\.morefld>summary\{([^}]*)\}/) || [])[1] || ''), false);


// ── ทั้งกล่องตัวกรองหุบ/ขยายได้ `<details class="filterbox">` (issue #88) ──────
/**
 * โจทย์: "filter ทั้งกล่องให้ หุบขยายได้ · ย้ายปุ่ม export excel ไปอยู่หลังปุ่มดูภาพรวม"
 *
 * สามอย่างที่ต้องจริงพร้อมกัน — ข้อ 2 กับ 3 คือเหตุผลที่ `.act` ต้องอยู่**นอก**กล่อง
 *   1. กล่องกางเป็นค่าเริ่มต้นเสมอ (`open` มาจากเซิร์ฟเวอร์ ไม่ใช่ JS) · ถ้ากล่องหุบเองได้
 *      เมื่อไหร่ จะเกิดเคส "morefld กางอยู่แต่ถูกกล่องที่หุบบังไว้" ซึ่งคือตัวกรองซ่อนหาย
 *   2. หุบแล้วยังรู้ว่ากรองอะไรอยู่ — `<summary>` พิมพ์เงื่อนไขจริงด้วย `activeFilterText`
 *      ตัวเดียวกับที่ตารางว่างใช้ (#77) ไม่ใช่ข้อความคงที่
 *   3. หุบแล้วปุ่มทั้งสองยังกดได้ — `.act` อยู่นอก `details.filterbox`
 *
 * และลำดับปุ่มใน DOM แบกน้ำหนักจริง: `_avoid` ของคอมโบบ็อกซ์หยิบ
 * `querySelector('button[type="submit"],.act button,#btnSearch')` = **ตัวแรกตามลำดับเอกสาร**
 * ปุ่ม submit จึงต้องมาก่อน `#btnXlsx` เสมอ ไม่งั้น popup ไปหลบปุ่ม export แทนปุ่มค้นหา
 */
console.log('\n── ทั้งกล่องตัวกรองหุบ/ขยายได้ (#88) ──');

/** ก้อน <details class="filterbox"> … </details> โดยนับชั้น <details> (มี morefld ซ้อนอยู่) */
function boxBlock(html) {
  const start = html.indexOf('<details class="filterbox"');
  if (start < 0) return { start: -1, end: -1, html: '' };
  const re = /<details\b[^>]*>|<\/details>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html)) !== null) {
    depth += m[0] === '</details>' ? -1 : 1;
    if (depth === 0) return { start: start, end: re.lastIndex, html: html.substring(start, re.lastIndex) };
  }
  return { start: start, end: html.length, html: html.substring(start) };
}

/** ข้อความใน <summary> ของกล่องนอกสุด (ตัวแรกในก้อน = ของ filterbox เอง) */
function boxSummary(html) {
  const blk = boxBlock(html).html;
  return (blk.match(/<summary>([\s\S]*?)<\/summary>/) || [, ''])[1];
}

// 1. กางเป็นค่าเริ่มต้นเสมอ — ทุกชุด param ไม่มีข้อยกเว้น
[
  ['ไม่ส่ง param อะไรเลย', {}],
  ['กรองด้วยเลขที่ WO', { wono: 'WOFSC00000470' }],
  ['เดือน = กำหนดวันที่เอง (morefld กางด้วย)', { month: 'custom' }],
  ['ตั้งตัวกรองในที่พับไว้', { item: 'FG', sort: 'gap', max: '10' }],
  ['ตั้งครบทุกช่อง', { sub: '2', loc: '10', wono: 'WO-1', item: 'FG', basis: 'wo' }]
].forEach((c) => {
  const blk = boxBlock(sumForm(c[1])).html;
  eq(c[0] + ' → มี <details class="filterbox"> และมี open มาจากเซิร์ฟเวอร์',
    /^<details class="filterbox" open>/.test(blk), true);
});

// morefld ต้องยังอยู่ข้างในกล่อง (ไม่ใช่หลุดออกมาเป็นพี่น้องของ .act)
const openBoth = sumForm({ item: 'FG' });
eq('ที่พับ "ตัวกรองเพิ่มเติม" อยู่ข้างใน filterbox',
  boxBlock(openBoth).html.indexOf('<details class="morefld" open>') > 0, true);

// 2. <summary> บอกเงื่อนไขที่ใช้อยู่จริง — ไม่ใช่ข้อความคงที่
console.log('\n── <summary> ต้องบอกเงื่อนไขที่กรองอยู่ ──');
[
  { name: 'เลขที่ WO', p: { wono: 'WOFSC00000470' }, want: ['WOFSC00000470'] },
  { name: 'รหัสสินค้า', p: { item: '11010900010' }, want: ['11010900010'] },
  { name: 'บริษัท', p: { sub: '2' }, want: ['Foodstar'] },
  { name: 'อาคารผลิต', p: { loc: '10' }, want: ['PD_B1'] },
  { name: 'ช่วงวันที่เอง', p: { month: 'custom', from: '2026-07-01', to: '2026-07-31' },
    want: ['2026-07-01', '2026-07-31'] },
  { name: 'หลายเงื่อนไขพร้อมกัน', p: { sub: '2', loc: '10', item: 'FG-9' },
    want: ['Foodstar', 'PD_B1', 'FG-9'] }
].forEach((c) => {
  const sum = boxSummary(sumForm(c.p));
  eq(c.name + ' → summary ขึ้นต้นด้วยคำว่า "ตัวกรอง"', /^ตัวกรอง · /.test(sum), true);
  c.want.forEach((w) => {
    eq(c.name + ' → summary มี "' + w + '"', sum.indexOf(w) > 0, true);
  });
});
// ข้อความคงที่ = บั๊กที่ #77/#86 เพิ่งปิด · สองชุดที่กรองคนละอย่างต้องได้ข้อความคนละแบบ
eq('summary ไม่ใช่ข้อความคงที่ (เปลี่ยนเงื่อนไขแล้วเปลี่ยนตาม)',
  boxSummary(sumForm({ wono: 'A-1' })) === boxSummary(sumForm({ wono: 'B-2' })), false);
// เดือนปกติต้องบอกช่วงด้วย ไม่ใช่เงียบ
eq('ไม่ตั้งอะไรเลย → summary ยังบอกช่วงและ "จับจาก"',
  /จับจาก/.test(boxSummary(sumForm({}))), true);

// ค่าที่ผู้ใช้พิมพ์ต้องผ่าน esc() ก่อนลง summary
console.log('\n── ค่าที่ผู้ใช้พิมพ์ใน summary ต้องถูก escape ──');
const evilForm = sumForm({ wono: '<script>alert(1)</script>', item: 'a"b&c<d' });
const evilSum = boxSummary(evilForm);
eq('summary มีค่าที่ผู้ใช้พิมพ์จริง (ไม่ได้ทิ้งเงียบ)', evilSum.indexOf('alert(1)') > 0, true);
eq('ไม่มีแท็ก <script> ดิบใน summary', /<script/.test(evilSum), false);
eq('escape เป็น &lt;script&gt;', evilSum.indexOf('&lt;script&gt;') > 0, true);
eq('escape เครื่องหมายคำพูดและ &', evilSum.indexOf('a&quot;b&amp;c&lt;d') > 0, true);
eq('ทั้งฟอร์มไม่มี <script> ดิบหลุดจากค่าตัวกรอง',
  evilForm.indexOf('<script>alert(1)') >= 0, false);

// 3. `.act` อยู่นอก filterbox — พิสูจน์ด้วยโครงสร้าง ไม่ใช่ regex หลวม ๆ
console.log('\n── .act ต้องอยู่นอก details.filterbox ──');
const SM3 = { rows: [1, 2, 3], shown: 3, total: 3, truncated: false };
const SM_CUT = { rows: [1], shown: 1, total: 9, truncated: true };
const SM_EMPTY = { rows: [], shown: 0, total: 0, truncated: false };
function sumFormSm(params, sm) {
  const ff = T.readFilters(params || {});
  ff.subRows = [{ id: 2, name: 'Foodstar' }];
  ff.locRows = [{ id: 10, name: 'PD_B1' }];
  return T.renderSummaryForm(ff, sm);
}

const withBtn = sumFormSm({ item: 'FG' }, SM3);
const box = boxBlock(withBtn);
const actAt = withBtn.indexOf('<div class="act">');
eq('มีแถว .act ในฟอร์ม', actAt > 0, true);
eq('.act อยู่หลัง </details> ของ filterbox (= นอกกล่อง)', actAt > box.end, true);
eq('ในก้อน filterbox ไม่มี .act ปนอยู่เลย', box.html.indexOf('class="act"') >= 0, false);
eq('.act ยังอยู่ใน <form> เดียวกัน',
  actAt < withBtn.indexOf('</form>') && actAt > withBtn.indexOf('<form'), true);
// หุบกล่องแล้วปุ่มต้องยังกดได้ = ปุ่มต้องไม่ใช่ลูกของ details ที่หุบ (ข้อบนพิสูจน์แล้ว)
// ที่พับชั้นในมี <button class="datebtn"> ของช่องวันที่อยู่แล้วโดยตั้งใจ — ที่ห้ามคือปุ่มของ .act
eq('ปุ่ม export ไม่หลงเข้าไปอยู่ในที่พับ "ตัวกรองเพิ่มเติม"',
  moreBlock(withBtn).indexOf('id="btnXlsx"') >= 0, false);

// 4. ปุ่ม export อยู่หลังปุ่ม "ดูภาพรวม" ในลำดับ DOM
console.log('\n── ปุ่ม export อยู่หลังปุ่ม "ดูภาพรวม" ──');
const actBlk = withBtn.substring(actAt, withBtn.indexOf('</div>', actAt) + 6);
eq('ปุ่มดูภาพรวมอยู่ในแถว .act', actBlk.indexOf('ดูภาพรวม') > 0, true);
eq('ปุ่ม export อยู่ในแถว .act เดียวกัน', actBlk.indexOf('id="btnXlsx"') > 0, true);
eq('ปุ่ม export อยู่หลังปุ่มดูภาพรวมในลำดับ DOM',
  withBtn.indexOf('ดูภาพรวม</button>') < withBtn.indexOf('id="btnXlsx"'), true);
// _avoid ของคอมโบบ็อกซ์หยิบ **ตัวแรกตามลำดับเอกสาร** ที่เข้า selector
// 'button[type="submit"],.act button,#btnSearch' — จำลอง selector นั้นกับ markup จริง
// (ปุ่มปฏิทิน .datebtn ในที่พับมาก่อนในเอกสาร แต่ไม่เข้า selector จึงต้องไม่ถูกหยิบ)
const actEnd = withBtn.indexOf('</div>', actAt) + '</div>'.length;
const avoidHit = (function () {
  const re = /<button[^>]*>/g;
  let m;
  while ((m = re.exec(withBtn)) !== null) {
    const inAct = m.index > actAt && m.index < actEnd;
    if (/type="submit"/.test(m[0]) || inAct || /id="btnSearch"/.test(m[0])) return m[0];
  }
  return '';
})();
eq('ปุ่มตัวแรกที่เข้า selector ของ _avoid คือปุ่ม submit (ไม่ใช่ปุ่มปฏิทินหรือปุ่ม export)',
  /type="submit"/.test(avoidHit), true);
eq('ปุ่มปฏิทินในที่พับไม่ถูก _avoid หยิบไปเป็นปุ่มหลัก', /datebtn/.test(avoidHit), false);
eq('ฟอร์มมีปุ่ม type="submit" ตัวเดียว',
  (withBtn.match(/<button[^>]*type="submit"/g) || []).length, 1);
// ปุ่มนี้อยู่ใน <form> — ลืม type=button เมื่อไหร่ กดแล้ว submit แทนการ export
eq('ปุ่ม export เป็น type="button" ไม่ใช่ submit',
  /<button type="button"[^>]*id="btnXlsx"/.test(withBtn), true);
eq('ปุ่ม export มี title อธิบายรูปแบบไฟล์', /id="btnXlsx" title="[^"]+"/.test(withBtn), true);
eq('จำนวนแถวเห็นได้โดยไม่ต้อง hover', /<span class="xnote">[^<]*3 แถว/.test(withBtn), true);
eq('ตัด max แล้วบอกในแถว .act ด้วย',
  sumFormSm({}, SM_CUT).indexOf('ได้ 1 แถวเท่าที่แสดง จากทั้งหมด 9 ใบ') > 0, true);

// เคส 0 แถว / ไม่มี sm เลย
const emptyForm = sumFormSm({}, SM_EMPTY);
eq('0 แถว → ปุ่ม export ถูกปิด', /<button type="button"[^>]*disabled/.test(emptyForm), true);
eq('0 แถว → บอกเหตุผล', emptyForm.indexOf('ไม่มีรายการให้ export ตามเงื่อนไขนี้') > 0, true);
eq('0 แถว → ยังมีปุ่ม submit ตัวเดียวเหมือนเดิม',
  (emptyForm.match(/<button[^>]*type="submit"/g) || []).length, 1);
const noSm = sumFormSm({}, undefined);
eq('ไม่มี sm (ทาง error ของ buildSummary) → ไม่มีปุ่ม export',
  noSm.indexOf('Export Excel') >= 0, false);
// ตัด <script> ท้ายฟอร์มออกก่อน — โค้ด client มีสำนวน `typeof window !== 'undefined'`
// เป็นตัวอักษรจริงโดยตั้งใจ (ด่านเดียวกับ test_summary_math.js)
eq('ไม่มี sm → ไม่มีคำว่า undefined หลุดลงใน markup ของฟอร์ม',
  noSm.substring(0, noSm.indexOf('</form>')).indexOf('undefined') >= 0, false);
eq('ไม่มี sm → ปุ่มดูภาพรวมยังอยู่', noSm.indexOf('ดูภาพรวม</button>') > 0, true);

// 5. ช่องกรอกทุกช่อง (ทั้งสองชั้นของที่พับ) ยังอยู่ในฟอร์มเดียวกันและไม่ถูก disabled
console.log('\n── ช่องกรอกทุกช่องยังอยู่ในฟอร์มเดียวกัน ──');
const inFormAll = withBtn.substring(withBtn.indexOf('<form'), withBtn.indexOf('</form>'));
eq('มี <form> เดียว', withBtn.split('<form').length - 1, 1);
['month', 'sub', 'loc', 'wono', 'from', 'to', 'basis', 'item', 'sort', 'max'].forEach((n) => {
  eq('ช่อง ' + n + ' อยู่ใน <form> เดียวกัน',
    new RegExp('<(?:input|select)[^>]*name="' + n + '"').test(inFormAll), true);
});
eq('ไม่มีช่องไหนถูก disabled (ค่าจะไม่ถูกส่งไปกับฟอร์ม)',
  /<(?:input|select)[^>]*\sdisabled/.test(inFormAll), false);
eq('ช่องกรอกทุกช่องอยู่ในกล่อง filterbox (นอกกล่องเหลือแต่ hidden + ปุ่ม)',
  ctrlsOutsideFld(inFormAll.replace(box.html, '')).join(','), '');

// 6. CSS ของกล่องใหม่
console.log('\n── CSS ของกล่องตัวกรอง (#88) ──');
['.filterbox{', '.filterbox>summary{', '.filterbox>.filterbar{', 'form>.act{'].forEach((needle) => {
  eq('CSS มี ' + needle, style.indexOf(needle) >= 0, true);
});
eq('summary ของกล่องไม่เปลี่ยน display (เปลี่ยนแล้วสามเหลี่ยมเปิด/ปิดหาย)',
  /display:/.test((style.match(/\.filterbox>summary\{([^}]*)\}/) || [])[1] || ''), false);
const formActRule = (style.match(/form>\.act\{([^}]*)\}/) || [])[1] || '';
eq('แถว .act นอก .filterbar มี flex + gap ของตัวเอง',
  /display:flex/.test(formActRule) && /gap:/.test(formActRule), true);
eq('แถว .act นอก .filterbar มีระยะห่างบนของตัวเอง (ไม่ได้ gap จาก .filterbar อีกแล้ว)',
  /margin:/.test(formActRule), true);
eq('กฎ .filterbar .act ยังอยู่ (หน้าเจาะลึก/หน้าความพร้อมยังใช้อยู่)',
  style.indexOf('.filterbar .act{') >= 0, true);
eq('.xbar ถูกถอดออกจาก CSS แล้ว (ไม่มีใครใช้)', style.indexOf('.xbar{') >= 0, false);
eq('.xnote ยังอยู่ (ใช้ในแถว .act)', style.indexOf('.xnote{') >= 0, true);
eq('CSS ของที่พับใช้ var() ไม่มีค่าสีตรง ๆ', /#[0-9a-fA-F]{3}/.test(moreCss), false);
// กฎ .brk ยังต้องคงอยู่ — WOCostTrace_Ready.js ยังใช้ markup นี้อยู่จริง (ตรวจ 2026-09-22)
eq('กฎ .filterbar .brk{ ยังอยู่ เพราะหน้าความพร้อมยังใช้', style.indexOf('.filterbar .brk{') >= 0, true);

// ── ตัวช่วยฝั่ง client: เลือก "กำหนดวันที่เอง" แล้วกางที่พับให้ (#86) ────────
/**
 * ฝั่งเซิร์ฟเวอร์ตัดสินสถานะกาง/พับเสมอ (ข้อ 1 ด้านบน) แต่มีจังหวะเดียวที่เซิร์ฟเวอร์ตอบไม่ได้
 * คือ **ก่อน submit** — ผู้ใช้เพิ่งเลือก "— กำหนดวันที่เอง —" ในช่องเดือนที่แถวหลัก แล้วช่อง
 * วันที่ที่ต้องกรอกยังอยู่ในที่พับที่เซิร์ฟเวอร์ปิดมา · ถ้าไม่ทำอะไรเลยผู้ใช้เจอทางตัน ต้องเดาเอง
 * ว่าต้องไปกดแถบ "ตัวกรองเพิ่มเติม" — เป็นอาการ "ตัวกรองซ่อนหาย" แบบหนึ่งที่ #86 ตั้งใจกัน
 *
 * สิ่งที่ล็อกไว้ที่นี่
 *   1. เปลี่ยนเป็น custom → `details.open = true` และ focus ไปช่องวันที่ช่องแรก
 *   2. เปลี่ยนกลับเป็นเดือนปกติ → **ห้ามปิดที่พับให้เอง** (ปิดเอง = ตัวกรองหายอีกแบบ)
 *   3. หน้าที่ไม่มี `.morefld` (ชั้นเจาะลึก/ชั้นความพร้อม) → เงียบ ไม่ throw
 *   4. สคริปต์ตัวนี้เป็น enhancement ล้วน — ไม่มีบรรทัดไหนไปตัดสินสถานะแทนเซิร์ฟเวอร์
 */
console.log('\n── ตัวช่วยฝั่ง client ของที่พับ (#86) ──');

/** เนื้อ <script> ก้อนที่จัดการที่พับ (ฟอร์มภาพรวมมีสอง <script> — อีกก้อนเป็น combobox) */
function moreScript(html) {
  const parts = html.split('<script>');
  for (let i = 1; i < parts.length; i++) {
    const body = parts[i].split('</script>')[0];
    if (body.indexOf('details.morefld') >= 0) return body;
  }
  return '';
}

const moreJs = moreScript(sumForm({}));
eq('ฟอร์มภาพรวมมีสคริปต์ที่อ้าง details.morefld', moreJs.length > 0, true);
eq('สคริปต์ไม่ได้หลุด </script> ออกมากลางทาง (ต้องเขียนเป็น <\\/script> ในเทมเพลต)',
  sumForm({}).split('</script>').length - 1, 2);

/** DOM ปลอมเท่าที่สคริปต์ใช้จริง — ไม่ได้จำลองเบราว์เซอร์ทั้งใบ */
function fakeDom(opts) {
  const o = opts || {};
  const dateInput = { focusCount: 0, focus() { this.focusCount += 1; } };
  const details = {
    open: !!o.open,
    querySelector: (s) => (s === 'input.dateinput' ? dateInput : null)
  };
  const handlers = {};
  const select = {
    value: o.month || '2026-09',
    addEventListener: (ev, fn) => { handlers[ev] = fn; }
  };
  const document = {
    querySelector: (s) => {
      if (s === 'details.morefld') return o.noDetails ? null : details;
      if (s === 'select[name="month"]') return o.noSelect ? null : select;
      return null;
    }
  };
  return {
    details: details,
    dateInput: dateInput,
    run: () => new Function('document', moreJs)(document),
    change: (v) => { select.value = v; if (handlers.change) handlers.change(); },
    bound: () => !!handlers.change
  };
}

// 1. เลือก custom → กางให้ + พาไปช่องวันที่
const d1 = fakeDom({});
d1.run();
eq('ผูก listener ของ change ไว้แล้ว', d1.bound(), true);
eq('ตอนโหลดยังไม่แตะสถานะที่เซิร์ฟเวอร์ส่งมา', d1.details.open, false);
d1.change('custom');
eq('เลือก "กำหนดวันที่เอง" → กางที่พับให้', d1.details.open, true);
eq('เลือก "กำหนดวันที่เอง" → focus ไปช่องวันที่ช่องแรก', d1.dateInput.focusCount, 1);

// 2. เปลี่ยนกลับเป็นเดือนปกติ → ห้ามปิดให้เอง
const d2 = fakeDom({});
d2.run();
d2.change('custom');
d2.change('2026-08');
eq('เปลี่ยนกลับเป็นเดือนปกติ → ไม่ปิดที่พับให้เอง', d2.details.open, true);
eq('เปลี่ยนกลับเป็นเดือนปกติ → ไม่ย้าย focus ซ้ำ', d2.dateInput.focusCount, 1);

// ที่พับที่เซิร์ฟเวอร์กางมาแล้ว (มีช่องอื่นตั้งค่าอยู่) ต้องไม่ถูกปิดจากการเปลี่ยนเดือน
const d3 = fakeDom({ open: true });
d3.run();
d3.change('2026-08');
eq('ที่พับที่กางมาจากเซิร์ฟเวอร์ ไม่ถูกปิดเพราะเปลี่ยนเดือน', d3.details.open, true);
eq('ไม่ใช่ custom → ไม่ focus ช่องวันที่', d3.dateInput.focusCount, 0);

// 3. หน้าที่ไม่มี .morefld / ไม่มีช่องเดือน → เงียบ ไม่ throw
[['ไม่มี details.morefld ในหน้า', { noDetails: true }],
 ['ไม่มีช่องเดือนในหน้า', { noSelect: true }]].forEach((c) => {
  let threw = '';
  try { fakeDom(c[1]).run(); } catch (e) { threw = String(e && e.message); }
  eq(c[0] + ' → ไม่ throw', threw, '');
});

// 4. เป็น enhancement ล้วน — ไม่มีบรรทัดไหนไปปิดที่พับหรือแก้ค่าในฟอร์ม
eq('สคริปต์ไม่มีบรรทัดที่สั่งปิดที่พับ (open = false / removeAttribute)',
  /open\s*=\s*false|removeAttribute\(\s*['"]open/.test(moreJs), false);
eq('สคริปต์ไม่แก้ค่าของช่องกรองใด ๆ (.value =)', /\.value\s*=[^=]/.test(moreJs), false);

// ═══ 5. ค่าที่ผู้ใช้พิมพ์ต้องถูก escape ก่อนสะท้อนกลับลงฟอร์ม ════
//
// `item` เป็นช่องเดียวในฟอร์มภาพรวมที่เก็บข้อความดิบของผู้ใช้ (trim อย่างเดียว) แล้ววาดกลับ
// เป็น value="..." · `sub`/`loc` ถูกกรองเหลือตัวเลขไปแล้วตั้งแต่ readFilters จึงไม่ใช่ทางนี้
// รีวิวของ #86 ทำ mutation test แล้วพบว่าถอด esc() ออกจากช่องนี้ npm test ยังเขียวทั้งชุด
// — ด่านนี้คือตัวปิดรูนั้น (repo เคยปิด stored XSS ไป 2 จุดใน #73)
console.log('\n── ค่าที่ผู้ใช้พิมพ์ถูก escape ──');
const XSS = '"><img src=x onerror=alert(1)>';
const xssForm = sumForm({ item: XSS });
eq('ค่า item ดิบไม่หลุดลง HTML', xssForm.indexOf(XSS) >= 0, false);
eq('ค่า item ถูก escape เป็น entity',
  xssForm.indexOf('value="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"') >= 0, true);
eq('ไม่มี <img> เกิดขึ้นจากค่าที่พิมพ์', xssForm.indexOf('<img') >= 0, false);
// ค่าแบบนี้ไม่ใช่ค่าเริ่มต้น → ที่พับต้องกางด้วย ไม่งั้นผู้ใช้ไม่เห็นว่ากรองอะไรอยู่
eq('ค่าแปลก ๆ ใน item ยังทำให้ที่พับกาง', OPEN.test(moreBlock(xssForm)), true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
