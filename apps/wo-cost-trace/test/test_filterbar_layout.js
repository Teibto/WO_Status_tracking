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

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
