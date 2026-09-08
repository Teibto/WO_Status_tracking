/**
 * เทส — ช่องกรองวันที่ของ WO Status Tracking แสดง dd/mm/yyyy (issue #28)
 *
 * ปัญหาที่กัน: หน้ากรองเปลี่ยนจาก `<input type="date">` (เบราว์เซอร์บังคับรูปแบบเอง
 * และ `.value` เป็น ISO ตาม spec) มาเป็นช่องข้อความ dd/mm/yyyy · **สายที่วิ่งต่อ
 * ยังต้องเป็น ISO ทั้งเส้น** เพราะ `buildWoFilter` ผูกกับ `TO_DATE(?, 'YYYY-MM-DD')`
 * ถ้าปล่อย dd/mm/yyyy หลุดลงไปถึง SQL จะไม่ระเบิด — SuiteQL พังแล้วถูก catch
 * แล้วผู้ใช้เห็นเป็น "ไม่พบข้อมูลในช่วงเวลาที่เลือก" ซึ่งอ่านเหมือนคำตอบจริง
 *
 * เทสนี้จึงยัน 3 ชั้น: ตัวแปลง · สิ่งที่ render ออกไป · **param ที่ถึง SQL จริง**
 * (อ่านจาก `H.calls` ไม่ใช่เชื่อว่าโค้ดแปลงให้แล้ว)
 *
 * เป็นเทสพฤติกรรมตัวแรกของ Suitelet 1 — ก่อนหน้านี้มีแต่ `test_deploy_manifest`
 * (นับ dependency) กับ `test_theme` (สแกน source)
 */
const H = require('./_harness');

const eq = H.makeEq();

// Suitelet 1 ยิง query เองไม่ผ่าน runSQL จึงไม่มี label ให้ fixture เกาะ
// เทสนี้ไม่สนใจข้อมูล สนใจชั้นตัวกรอง — ทุก query คืน "ไม่มีแถว" อย่างตั้งใจ
function sqlRows() { return []; }

const { module: mod, T } = H.load({
  file: 'WOStatusTracking.js',
  libs: [
    'WOReportTheme.js',
    'WOStatusTracking_Labels.js',
    'WOStatusTracking_Queries.js',
    'WOStatusTracking_Drilldown.js',
  ],
  exports: ['parseFilterDate', 'fmtDate'],
  requireRunSQL: false,
  sqlRows,
  quietLog: true,
});

function run(params) {
  const chunks = [];
  mod.onRequest({
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: () => {} },
  });
  return chunks.join('');
}

/** ข้อความในหน้า error (คืน '' ถ้าไม่ใช่หน้า error)
 *
 * ห้ามเทียบด้วยการหาข้อความเตือนในทั้งหน้า — ทุกหน้าฝัง I18N ของ client ไว้
 * ซึ่งมีข้อความเตือน**ทุกอัน**อยู่แล้ว เทสแบบนั้นจะผ่านตลอดไม่ว่าโค้ดถูกหรือผิด
 * (เจอมาแล้วตอนเขียนเทสนี้) จึงอ่านจาก `<div class="error-page">` ของ buildErrorPage
 */
function errorText(html) {
  const m = html.match(/<div class="error-page">[\s\S]*?<pre>([\s\S]*?)<\/pre>/);
  return m ? m[1] : '';
}

// ── ชั้น 1: ตัวแปลงวันที่ ────────────────────────────────────────────────
console.log('\n── parseFilterDate ──');
eq('dd/mm/yyyy → ISO',            T.parseFilterDate('08/09/2026'), '2026-09-08');
eq('ไม่เติมศูนย์ก็รับ',            T.parseFilterDate('8/9/2026'),   '2026-09-08');
eq('ขีดกลางเป็นตัวคั่นก็รับ',      T.parseFilterDate('08-09-2026'), '2026-09-08');
eq('ISO ผ่านตรง (ลิงก์เก่าใช้ได้)', T.parseFilterDate('2026-09-08'), '2026-09-08');
eq('ISO ไม่เติมศูนย์',             T.parseFilterDate('2026-9-8'),   '2026-09-08');
eq('ว่าง = ว่าง',                  T.parseFilterDate(''),           '');
// 31/02 คือกับดักตัวจริง — `new Date(2026,1,31)` เลื่อนเป็น 3 มี.ค. ให้เองโดยไม่บอก
eq('31/02/2026 ไม่ใช่วันที่จริง',   T.parseFilterDate('31/02/2026'), '');
eq('เดือน 13 ไม่ผ่าน',             T.parseFilterDate('01/13/2026'), '');
eq('ข้อความมั่ว ๆ ไม่ผ่าน',        T.parseFilterDate('พรุ่งนี้'),    '');
eq('ปีสองหลักไม่ผ่าน',             T.parseFilterDate('08/09/26'),   '');
eq('fmtDate เป็นทางกลับของกัน',    T.fmtDate(T.parseFilterDate('08/09/2026')), '08/09/2026');

// ── ชั้น 2: สิ่งที่ render ออกไป ─────────────────────────────────────────
console.log('\n── หน้ากรอง ──');
const form = run({});
eq('ไม่มี input type=date เหลืออยู่', /type="date"/.test(form), false);
eq('ช่องตั้งแต่เป็นช่องข้อความ', /<input type="text" name="dateFrom"/.test(form), true);
eq('ช่องถึงเป็นช่องข้อความ',     /<input type="text" name="dateTo"/.test(form), true);
eq('บอกรูปแบบที่ต้องกรอก',       (form.match(/placeholder="dd\/mm\/yyyy"/g) || []).length, 2);
const shown = form.match(/name="dateFrom"[\s\S]{0,120}?value="([^"]*)"/);
eq('ค่าเริ่มต้นแสดงเป็น dd/mm/yyyy', /^\d{2}\/\d{2}\/\d{4}$/.test(shown && shown[1]), true);

console.log('\n── JS ฝั่งเบราว์เซอร์ต้อง parse ผ่าน ──');
// เทสอื่นสแกน source ของโมดูลได้ แต่ JS ก้อนนี้อยู่ใน template string
// พิมพ์ผิดจะรู้ตอนผู้ใช้เปิดหน้าเท่านั้น — parse ที่นี่ให้รู้ตอน npm test
const scripts = form.match(/<script>[\s\S]*?<\/script>/g) || [];
eq('มี <script> ในหน้า', scripts.length > 0, true);
let parsed = 0;
scripts.forEach((block, i) => {
  const js = block.replace(/^<script>/, '').replace(/<\/script>$/, '');
  try { new Function(js); parsed++; } catch (e) { H.addFail('script block ' + i + ' parse ไม่ผ่าน: ' + e.message); }
});
eq('ทุก block parse ผ่าน', parsed, scripts.length);
eq('มีตัวแปลงวันที่ฝั่ง client', /_isoFromDateInput/.test(form), true);

// escape ที่หลุด backslash เป็นอาการเงียบที่สุดของโค้ดที่อยู่ใน template literal —
// regex ยัง parse ผ่าน แต่ไม่ตรงอะไรเลย (issue #35: `/-B\d+$/i` เคย render ออกไป
// เป็น `/-Bd+$/i` ทำให้ค้นด้วยเลข Batch ไม่เจอมาตลอด โดยไม่มี error ที่ไหน)
// ตัดบรรทัดคอมเมนต์ออกก่อน — คอมเมนต์ที่อธิบายอาการนี้จะไปตรงกับ pattern ของด่านเอง
// (แบบเดียวกับที่ test_theme.js ต้องตัดคอมเมนต์ก่อนตรวจ hex)
const clientJs = scripts.join('\n').split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
eq('ไม่มี escape ที่หลุด backslash', /\(d\{|-Bd\+|\[d\{/.test(clientJs), false);
eq('regex เลข batch ยังครบ', clientJs.indexOf('-B\\d+') >= 0, true);
eq('regex วันที่ฝั่ง client ยังครบ', (clientJs.match(/\\d\{/g) || []).length >= 6, true);

// ── ตัวแปลงฝั่ง client ต้องตอบเหมือนฝั่งเซิร์ฟเวอร์ (issue #33) ─────────
// ตรรกะเดียวกันอยู่สองที่โดยจำเป็น (เซิร์ฟเวอร์อ่าน param · เบราว์เซอร์อ่านช่องกรอก)
// คอมเมนต์ในโค้ดกำกับว่าแก้ที่ไหนต้องแก้อีกที่ — บล็อกนี้คือสิ่งที่บังคับให้จริง
// ดึงฟังก์ชันออกจาก HTML ที่ render แล้วรันด้วยเคสชุดเดียวกัน
const clientSrc = (form.match(/function _isoFromDateInput\(el\)[\s\S]*?\n\}/) || [])[0];
eq('ดึงตัวแปลงฝั่ง client ออกมาได้', !!clientSrc, true);
const clientIso = clientSrc
  ? new Function(clientSrc + ';\nreturn _isoFromDateInput;')()
  : () => undefined;

// ฝั่ง client คืน null = อ่านไม่ออก · '' = ว่าง (แยกกันโดยตั้งใจ เพื่อเลือกข้อความเตือน)
// ฝั่งเซิร์ฟเวอร์รวมสองกรณีเป็น '' แล้วให้ผู้เรียกดู raw เอง
[
  ['08/09/2026', '2026-09-08'],
  ['8/9/2026',   '2026-09-08'],
  ['08-09-2026', '2026-09-08'],
  ['2026-09-08', '2026-09-08'],
  ['2026-9-8',   '2026-09-08'],
  ['',           ''],
  ['31/02/2026', null],
  ['01/13/2026', null],
  ['พรุ่งนี้',    null],
  ['08/09/26',   null],
].forEach(([input, want]) => {
  const got = clientIso({ value: input });
  eq('client "' + input + '"', got, want);
  eq('สองฝั่งตรงกัน "' + input + '"', got === null ? '' : got, T.parseFilterDate(input));
});

// ── ชั้น 3: param ที่ถึง SQL ต้องเป็น ISO ───────────────────────────────
console.log('\n── ค้นหาด้วย dd/mm/yyyy ──');
H.calls.length = 0;
const okBody = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026' });
eq('ไม่ขึ้นหน้า error', errorText(okBody), '');
const cp1 = H.calls.filter((c) => /t\.type\s*=\s*'WorkOrd'/.test(c.sql));
eq('ยิง CP1 จริง', cp1.length > 0, true);
eq('param ที่ถึง SQL เป็น ISO', JSON.stringify(cp1[0] && cp1[0].params), '["2026-09-02","2026-09-08"]');
eq('ไม่มี dd/mm/yyyy หลุดไปถึง param',
  H.calls.some((c) => (c.params || []).some((v) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(v)))), false);

console.log('\n── ลิงก์เก่าที่เป็น ISO ต้องยังใช้ได้ ──');
H.calls.length = 0;
const isoBody = run({ action: 'search', dateFrom: '2026-09-02', dateTo: '2026-09-08' });
eq('ไม่ขึ้นหน้า error', errorText(isoBody), '');
const cp1iso = H.calls.filter((c) => /t\.type\s*=\s*'WorkOrd'/.test(c.sql));
eq('param เดิมไม่ถูกแปลงเพี้ยน', JSON.stringify(cp1iso[0] && cp1iso[0].params), '["2026-09-02","2026-09-08"]');
// ช่องกรองบนหน้าผลลัพธ์ต้องกลับมาเป็น dd/mm/yyyy ให้คนอ่าน
eq('หน้าผลลัพธ์แสดงช่องเป็น dd/mm/yyyy', /name="dateFrom"[\s\S]{0,120}?value="02\/09\/2026"/.test(isoBody), true);

// ── ด่าน: รูปแบบผิดต้องบอก ไม่ใช่ตอบว่าไม่มีข้อมูล ──────────────────────
console.log('\n── รูปแบบผิด ──');
H.calls.length = 0;
const badBody = run({ action: 'search', dateFrom: '31/02/2026', dateTo: '08/09/2026' });
eq('บอกว่ารูปแบบวันที่ไม่ถูกต้อง', /รูปแบบวันที่ไม่ถูกต้อง/.test(errorText(badBody)), true);
eq('ไม่พูดว่าไม่พบข้อมูล', /ไม่พบข้อมูลในช่วงเวลาที่เลือก/.test(badBody), false);
eq('หยุดก่อนยิง query', H.calls.length, 0);

const badEn = run({ action: 'search', lang: 'en', dateFrom: '2026/13/01', dateTo: '08/09/2026' });
eq('ภาษาอังกฤษได้ข้อความอังกฤษ', /Invalid date format/.test(errorText(badEn)), true);

console.log('\n── ด่านช่วง 7 วัน ยังทำงาน ──');
const wide = run({ action: 'search', dateFrom: '01/09/2026', dateTo: '30/09/2026' });
eq('เตือนช่วงเกิน 7 วัน', /7 วัน/.test(errorText(wide)), true);

console.log('\n── ชั้น fragment (AJAX) ──');
H.calls.length = 0;
const frag = run({ action: 'search', fragment: '1', dateFrom: '31/02/2026', dateTo: '08/09/2026' });
eq('ตอบเป็นแถบแจ้งใน results-zone', /schema-notice/.test(frag), true);
eq('ไม่ยิง query', H.calls.length, 0);

H.calls.length = 0;
const fragOk = run({ action: 'search', fragment: '1', dateFrom: '02/09/2026', dateTo: '08/09/2026' });
eq('fragment ที่วันที่ถูกต้องไม่ติดด่าน', /schema-notice/.test(fragOk), false);
const cp1frag = H.calls.filter((c) => /t\.type\s*=\s*'WorkOrd'/.test(c.sql));
eq('fragment ส่ง ISO ถึง SQL', JSON.stringify(cp1frag[0] && cp1frag[0].params), '["2026-09-02","2026-09-08"]');

// ระบุ WO ตรง ๆ = ไม่ต้องใช้วันที่เลย ด่านวันที่ต้องไม่ขวาง
console.log('\n── ระบุ WO ตรง ๆ ต้องข้ามด่านวันที่ ──');
H.calls.length = 0;
const byWo = run({ action: 'search', woNumber: 'WOFSC00000470', dateFrom: 'มั่ว', dateTo: '' });
eq('ไม่ขึ้นหน้า error', errorText(byWo), '');
const cp1wo = H.calls.filter((c) => /t\.type\s*=\s*'WorkOrd'/.test(c.sql));
eq('กรองด้วยเลข WO ไม่ใช่วันที่', JSON.stringify(cp1wo[0] && cp1wo[0].params), '["WOFSC00000470"]');

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
