/**
 * เทส — ตาราง + layout ตามมาตรฐาน Teibto Redwood (issue #64 ขั้น 5 — ก้อนสุดท้าย)
 *
 * ครอบคลุมกฎจาก table.md + layout-and-controls.md ที่ "แก้จริง" ในขั้นนี้ (ข้อที่สำรวจแล้วว่า
 * ถูกอยู่ก่อนแล้วไม่อยู่ในนี้ — ดูรายงานของขั้นนี้สำหรับรายการที่ไม่แตะ):
 *   1. หัวตาราง — muted semibold ไม่ uppercase ไม่ใช่แถบแบรนด์เข้ม (ทั้งสองแอป)
 *   2. sticky thead ในกล่อง overflow — พื้นทึบแสงจริง ไม่ใช่โปร่งใส (wo-cost-trace `.scroll`)
 *   3. ห้ามซ่อนคอลัมน์เพื่อความกว้าง (ทั้งสองแอป)
 *   4. กล่อง detail ที่ยืดได้ใช้ max-height+overflow ไม่ใช่ height/min-height ตายตัว
 *      (.scroll ของ wo-cost-trace, .rw-combobox-list ของทั้งสองแอป)
 *   5. hit target ของ pagination (wo-status) — 24–28 กว้าง × 32 สูง + .pglink เป็น <a> จริง
 *   6. focus-visible ที่เพิ่มรอบนี้ (.langtog button, .filterbar>button, .pglink, .cal-today,
 *      .btn ที่ shared, summary ของ wo-cost-trace)
 *
 * เรื่องตำแหน่ง popup (documentElement.clientWidth vs window.innerWidth) มีเทสแยกเฉพาะที่
 * apps/wo-status/test/test_wostatus_widthcalc.js และ apps/wo-cost-trace/test/test_widthcalc.js
 * เพราะต้อง "กด" ฟังก์ชันจริงบน DOM ปลอม ไม่ใช่แค่สแกนข้อความ CSS
 */
const fs = require('fs');
const path = require('path');
const H = require('./lib/_harness');
const FX = require('./lib/fixtures_parity');

const eq = H.makeEq();

// ── เรนเดอร์หน้าเต็มของทั้งสองแอปแบบเดียวกับ test_theme.js ──────────────────
const { T: T_trace } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['buildSummary', 'readFilters', 'renderSummaryPage'],
});
const tracePage = T_trace.renderSummaryPage(T_trace.buildSummary(T_trace.readFilters({ from: '2026-07-01', to: '2026-07-31' })));
const traceStyle = (tracePage.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';

const { module: statusMod, T: T_status } = H.load({
  file: 'WOStatusTracking.js',
  libs: [
    'WOReportTheme.js',
    'WOStatusTracking_Labels.js',
    'WOStatusTracking_Queries.js',
    'WOStatusTracking_Drilldown.js',
  ],
  requireRunSQL: false,
  sqlRows: () => [],
  quietLog: true,
  exports: ['buildPaginationHtml'],
});
const statusChunks = [];
statusMod.onRequest({
  request: { parameters: {} },
  response: { write: (s) => statusChunks.push(String(s)), setHeader: () => {} },
});
const statusPage = statusChunks.join('');
const statusStyle = (statusPage.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';

// ── ตัวช่วย parse CSS ที่ resolve จริงแล้ว (เหมือน test_listfield_portal_css.js) ────────────
function parseRules(css) {
  const rules = css.match(/[^{}]+\{[^{}]*\}/g) || [];
  const out = [];
  rules.forEach((rule) => {
    const m = /^([^{]+)\{([^}]*)\}$/.exec(rule);
    if (!m) return;
    m[1].split(',').forEach((sel) => out.push({ selector: sel.trim(), body: m[2] }));
  });
  return out;
}
function bodiesOfSelectorSuffix(rules, suffixToken) {
  // รวม body ของทุกกฎที่ selector "ลงท้าย" ด้วย token นี้ (เช่น "th" ต่อจาก combinator ใด ๆ)
  // — ใช้แทนการ match DOM เต็มรูปแบบเพราะ th/thead ไม่ถูกย้ายด้วย JS (ไม่ใช่ของที่ portal)
  return rules
    .filter((r) => new RegExp('(^|[\\s>+~])' + suffixToken + '$').test(r.selector))
    .map((r) => r.body)
    .join(';');
}

console.log('\n════ 1. หัวตาราง — muted semibold ไม่ uppercase ไม่ใช่แถบแบรนด์เข้ม ════');
[['wo-status', statusStyle], ['wo-cost-trace', traceStyle]].forEach(([app, css]) => {
  const rules = parseRules(css);
  const thBody = bodiesOfSelectorSuffix(rules, 'th');
  eq(app + ': มีกฎ th อย่างน้อยหนึ่งกฎ', thBody.length > 0, true);
  eq(app + ': th ไม่มี text-transform:uppercase', /text-transform\s*:\s*uppercase/.test(thBody), false);
  eq(app + ': th ไม่ใช้สีแบรนด์/primary เป็นพื้นหลัง (ไม่ใช่แถบแบรนด์เข้ม)',
    /background(?:-color)?\s*:\s*var\(--(?:pj-primary|c-brand)\b/.test(thBody), false);
  eq(app + ': th มีพื้นหลังโทนกลาง (surface-2/surface-3) จาก BASE หรือกฎเฉพาะหน้า',
    /background(?:-color)?\s*:\s*var\(--(?:pj-muted-bg|pj-surface-alt|c-surface-2|c-surface-3)\)/.test(thBody), true);
  eq(app + ': th เป็นตัวหนา (semibold) อย่างน้อย 600', /font-weight\s*:\s*600/.test(thBody), true);
});

console.log('\n════ 2. sticky thead ในกล่อง overflow ════');
eq('wo-status: กล่องเลื่อนของตารางหลัก .tscroll{overflow-x:auto}', statusStyle.indexOf('.tscroll{overflow-x:auto}') >= 0, true);
eq('wo-status: มีกฎ th{position:sticky (สืบทอด background muted จาก BASE ตามข้อ 1)',
  /\bth\{[^}]*position\s*:\s*sticky/.test(statusStyle), true);
eq('wo-cost-trace: กล่องเลื่อนของตารางกว้าง .scroll{overflow:auto', traceStyle.indexOf('.scroll{overflow:auto') >= 0, true);
eq('wo-cost-trace: .scroll thead th{position:sticky', traceStyle.indexOf('.scroll thead th{position:sticky') >= 0, true);
{
  // .scroll thead th ไม่ประกาศ background เอง (ตั้งใจ — ดูคอมเมนต์ใน WOCostTrace_Common.js)
  // แต่ผลรวม cascade ของทุกกฎที่ "ลงท้ายด้วย th" ต้องยังมี background ทึบแสงอยู่จริง ไม่ใช่โปร่งใส
  //
  // ⚠ regex บนบล็อกที่รวมทุกกฎเข้าด้วยกันแบบนี้ **ไม่ได้ resolve cascade ว่าใครชนะจริง** —
  // ยันแค่ว่า "มีกฎ th อย่างน้อยหนึ่งกฎที่ให้ background โทนกลาง" ไม่ได้พิสูจน์ว่า .scroll
  // thead th เองไม่ได้แอบประกาศ background อื่นทับ (เช่น transparent) จึงต้องมีเทสข้อสอง
  // แยกปักหมุดกฎนี้เจาะจงด้วย — ดูบล็อกถัดไป
  const rules = parseRules(traceStyle);
  const thBody = bodiesOfSelectorSuffix(rules, 'th');
  eq('wo-cost-trace: ผลรวม th ทุกกฎมี background ทึบแสงจริง (ไม่ใช่แค่ .scroll thead th กฎเดียวที่ไม่มี background เอง)',
    /background(?:-color)?\s*:\s*var\(--(?:pj-muted-bg|c-surface-3)\)/.test(thBody), true);

  // ปักหมุดว่า .scroll thead th เอง "ยังไม่มี" background ประกาศอยู่ในตัวมันเอง (ทั้งจงใจ —
  // ดูคอมเมนต์ WOCostTrace_Common.js) — ถ้าใครมาเติม background ที่นี่ภายหลัง (แม้จะเป็นค่า
  // ทึบแสงที่ "ดูถูกต้อง" เช่น background:transparent ที่ทำให้พื้นหายไปจริง) เทสนี้ต้องแดง
  // ให้มารีวิวว่าตั้งใจเปลี่ยนกลยุทธ์จริงหรือเผลอ — เทสข้างบนอย่างเดียวจับไม่ได้เพราะกฎ th อื่น
  // (จาก BASE) ยังทำให้ผลรวมผ่านอยู่ดีแม้ .scroll thead th จะประกาศ background:transparent เอง
  const scrollTheadThRule = rules.find((r) => r.selector === '.scroll thead th');
  eq('wo-cost-trace: .scroll thead th มีกฎประกาศจริง', !!scrollTheadThRule, true);
  eq('wo-cost-trace: .scroll thead th เองไม่ประกาศ background ซ้ำ (สืบทอดจาก BASE ตามที่ตั้งใจ)',
    scrollTheadThRule ? /\bbackground(?:-color)?\s*:/.test(scrollTheadThRule.body) : null, false);
}

console.log('\n════ 3. ห้ามซ่อนคอลัมน์เพื่อความกว้าง ════');
[['wo-status', statusStyle], ['wo-cost-trace', traceStyle]].forEach(([app, css]) => {
  eq(app + ': ไม่มีกฎซ่อน th/td ด้วย display:none',
    /\b(th|td)(\[[^\]]*\]|\.[\w-]+)*\s*\{[^}]*display\s*:\s*none/.test(css), false);
});

console.log('\n════ 4. กล่อง detail ที่ยืดได้ — max-height ไม่ใช่ height ตายตัว ════');
function fixedHeightOnRule(css, selectorText) {
  const re = new RegExp(selectorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}');
  const m = re.exec(css);
  if (!m) return null;
  // "height:" ที่ไม่ใช่ prefix ของ max-height/min-height (คั่นด้วย ; หรือต้นสตริง)
  return /(^|;)\s*height\s*:/.test(m[1]);
}
eq('wo-cost-trace: .scroll มี max-height', traceStyle.indexOf('max-height:76vh') >= 0, true);
eq('wo-cost-trace: .scroll ไม่มี height: ตายตัว', fixedHeightOnRule(traceStyle, '.scroll'), false);
eq('wo-status: .rw-combobox-list มี max-height', statusStyle.indexOf('.rw-combobox-list{position:fixed;z-index:60;max-height:280px') >= 0, true);
eq('wo-status: .rw-combobox-list ไม่มี height: ตายตัว', fixedHeightOnRule(statusStyle, '.rw-combobox-list'), false);
eq('wo-cost-trace: .rw-combobox-list ไม่มี height: ตายตัว', fixedHeightOnRule(traceStyle, '.rw-combobox-list'), false);

console.log('\n════ 5. hit target ของ pagination (wo-status) ════');
const pagHtml = T_status.buildPaginationHtml({ page: 2, totalPages: 5, lang: 'th' });
eq('มีลิงก์เปลี่ยนหน้าเป็น <a class="pglink">', /<a href="[^"]*" class="pglink">/.test(pagHtml), true);
eq('หน้าปัจจุบันเป็น <span class="pgcur"> (กดไม่ได้จริง ไม่ใช่ลิงก์)', /<span class="pgcur">/.test(pagHtml), true);
eq('หน้าปัจจุบันไม่ใช่ <a> (ต้องไม่ focusable ปลอม)', /<a[^>]*class="pgcur"/.test(pagHtml), false);
eq('.pglink,.pgcur สูง 32px (btn-h เป้าหมายของ hit target)',
  /\.pglink,\.pgcur\{[^}]*height:32px/.test(statusStyle), true);
eq('.pglink,.pgcur กว้างอย่างน้อย 28px', /\.pglink,\.pgcur\{[^}]*min-width:28px/.test(statusStyle), true);

console.log('\n════ 6. focus-visible ที่เพิ่มในขั้นนี้ (ทุกตัวต้องมี !important เพราะ NetSuite reset :focus{outline:0}) ════');
[
  ['.langtog button:focus-visible', statusStyle, 'wo-status'],
  ['.filterbar>button:focus-visible', statusStyle, 'wo-status'],
  ['.pglink:focus-visible', statusStyle, 'wo-status'],
  ['.cal-today:focus-visible', statusStyle, 'wo-status'],
  ['.btn:focus-visible', traceStyle, 'wo-cost-trace (มาจาก shared COMPONENTS)'],
  ['summary:focus-visible', traceStyle, 'wo-cost-trace'],
].forEach(([sel, css, where]) => {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '\\{outline:2px solid var\\(--pj-primary\\) !important');
  eq(where + ': ' + sel + ' มี outline !important', re.test(css), true);
});
// pj-primary ต้องยังอ้าง token เดิม (ไม่ใช่ hex ที่หลุดมาตอนแก้ครั้งนี้ — เทส hex ทั่วไปอยู่ที่
// test_theme.js แล้ว แต่ตรวจซ้ำเจาะจงจุดที่เพิ่มรอบนี้กันคนละกับดัก)
eq('.btn:focus-visible ไม่มี hex หลุดมา', /\.btn:focus-visible\{[^}]*#[0-9a-fA-F]{3,8}/.test(traceStyle), false);

// ── ก๊อป WOReportTheme.js ทั้งสองแอปต้องตรง shared/ เป๊ะ (test_theme_sync.js คุมอยู่แล้ว
//    แต่ยืนยันซ้ำตรงนี้ว่า .btn:focus-visible ที่เพิ่มถูก sync มาจริง ไม่ใช่แก้ก๊อปตรง ๆ) ────
const ROOT = path.join(__dirname, '..');
const sharedSrc = fs.readFileSync(path.join(ROOT, 'shared/WOReportTheme.js'), 'utf8');
eq('.btn:focus-visible อยู่ใน shared/WOReportTheme.js (ต้นฉบับ ไม่ใช่แก้ก๊อป)',
  sharedSrc.indexOf('.btn:focus-visible{outline:2px solid var(--pj-primary) !important') >= 0, true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
