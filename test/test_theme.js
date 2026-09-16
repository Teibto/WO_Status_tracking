/**
 * เทส — รายงานทุกใบต้องใช้ design token ชุดเดียวกับ teibto-report-builder (issue #18 · ปรับที่ #38)
 *
 * ปัญหาที่กัน: style ที่ "เข้ากัน" วันนี้ drift ได้เงียบ ๆ ด้วยการที่ใครเติม hex ลง markup
 * ตรง ๆ อีกที หรือก็อป token block ไปวางไฟล์ที่สองแล้วแก้ทีละไฟล์
 *
 * epic #37 แยกเป็นสองแอปที่มี `WOReportTheme.js` เป็นก๊อปของ `shared/WOReportTheme.js` คนละใบ
 * — เทสนี้จึงตรวจ **ต่อแอป** และใช้ `shared/` เป็นแหล่งความจริงเวลาเทียบกับต้นทาง
 * (เทสที่ยันว่าก๊อป byte ตรงต้นฉบับอยู่ในก้อน S2 #39 ไม่ใช่ที่นี่)
 *
 * เทสนี้ตรวจ 4 อย่าง
 *   1. token block ประกาศที่เดียวในแต่ละแอป — ไฟล์ theme เท่านั้น
 *   2. ไม่มี hex สีในไฟล์อื่น (ยกเว้น `#fff` ซึ่ง template เองก็เขียนตรง ๆ)
 *   3. หน้าที่ render ออกมาจริงมี token + คลาสคอมโพเนนต์ของ template
 *   4. ค่าทุก token ตรงกับ builder.css ของ repo ต้นทาง — แยกเป็นสองชั้น (ปรับที่ #49 · ตัดสินใจ
 *      แล้วที่ #64/#56: ยึด Teibto Redwood ตั้งแต่ commit 034724c เป็นต้นไป ไม่ใช่รอการตัดสินใจ
 *      อีกต่อไป — `shared/WOReportTheme.js` ฝัง `--c-*` ของ Redwood เข้ามาแล้วและให้ `--pj-*`
 *      ชี้ `var(--c-*)` ตามที่ builder.css นิยาม ขั้นนี้ (#64 ขั้น 1) ทำเฉพาะสี — สเกลระยะ/รัศมี/
 *      ตัวอักษร (`--sp-*` `--radius-*` `--shadow-*` `--fs-*`) ยังเป็นค่าเดิมของขั้นก่อน Redwood):
 *        4a. เทียบกับ BASELINE ที่ pin ไว้ในไฟล์นี้ (ตอนนี้ค่า --pj-* ใน BASELINE คือ
 *            `var(--c-*)` ตาม Redwood แล้ว ไม่ใช่ hex ก่อน 034724c อีกต่อไป) — เป็น gate ของ
 *            npm test จริง ไม่ง้อว่าเครื่องนี้จะมี repo ต้นทางวางข้าง ๆ หรือเปล่า
 *        4b. ถ้ามี repo ต้นทางวางข้าง ๆ ด้วย resolve `var(--x)`/`calc()` ของไฟล์สด ๆ
 *            แล้วพิมพ์รายงานว่าต่างจาก BASELINE ตรงไหน — ไม่กระทบ exit code เพราะยังมีของที่
 *            ตั้งใจไม่ตามในขั้นนี้อยู่จริง (สเกลระยะ/รัศมี/ตัวอักษรข้างต้น) ไม่ใช่เพราะรอตัดสินใจ
 */
const fs = require('fs');
const path = require('path');
const H = require('./lib/_harness');

const eq = H.makeEq({ json: true });

const ROOT = path.join(__dirname, '..');
const THEME_SOURCE = path.join(ROOT, 'shared/WOReportTheme.js');
const themeSrc = fs.readFileSync(THEME_SOURCE, 'utf8');

// entry ของแต่ละแอป — ใช้ตรวจว่ายัง require theme และยังมีกลไก embed
const ENTRY_OF = { 'wo-cost-trace': 'WOCostTrace.js', 'wo-status': 'WOStatusTracking.js' };
const apps = Object.keys(H.APP_DIRS).sort();
eq('เจอแอปครบสองตัว', apps.join(','), 'wo-cost-trace,wo-status');

apps.forEach((app) => {
  const SRC = H.APP_DIRS[app];
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
  const styled = files.filter((f) => f !== 'WOReportTheme.js');

  console.log('\n════ ' + app + ' ════');

  // ── 1. token block ต้องมีที่เดียวในแอปนี้ ─────────────────────────────────
  const declaring = files
    .filter((f) => fs.readFileSync(path.join(SRC, f), 'utf8').indexOf('--pj-primary:') >= 0);
  if (declaring.length !== 1) console.log('     ไฟล์ที่ประกาศค่า token: ' + declaring.join(', '));
  eq('มีไฟล์เดียวที่ประกาศค่า --pj-primary', declaring.join(','), 'WOReportTheme.js');

  const entry = ENTRY_OF[app];
  const entrySrc = fs.readFileSync(path.join(SRC, entry), 'utf8');
  eq(entry + ' require theme', entrySrc.indexOf("'./WOReportTheme'") > 0, true);

  // ── 2. ห้ามมี hex สีในไฟล์ไหนก็ตาม ยกเว้นไฟล์ theme ──────────────────────
  // `#fff` ปล่อยผ่านเพราะไฟล์ของเราเองก็เขียน `color:#fff` ตรง ๆ บนพื้นสีเข้มอยู่หลายจุด
  // (ต้นทางตอนนี้เขียน `var(--c-brand-on)` แทนแล้วหลัง Redwood — ไม่ใช่ #fff ตรง ๆ อีกต่อไป
  // แต่ของเรายังไม่ตามจุดนี้ในขั้นนี้ จึงยังต้อง whitelist #fff ไว้)
  // ตรวจ **ทุกไฟล์** ไม่ใช่แค่ entry — lib อย่าง `_Drilldown.js` / `_Labels.js`
  // ก็ประกอบ markup ที่ผู้ใช้เห็น จึงเติมสีของตัวเองได้เหมือนกัน
  styled.forEach((f) => {
    const s = fs.readFileSync(path.join(SRC, f), 'utf8');
    // นับเฉพาะ hex ที่อยู่ใน **โค้ด** — คอมเมนต์ที่ยกสีเก่ามาเล่าว่าเปลี่ยนจากอะไรเป็นอะไร
    // คือหลักฐานที่ต้องเก็บไว้ ไม่ใช่สีที่ render ออกมา
    const bad = (s.split('\n')
      .filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln))
      .join('\n')
      .match(/#[0-9a-fA-F]{3,8}\b/g) || [])
      .filter((h) => h.toLowerCase() !== '#fff' && h.toLowerCase() !== '#ffffff');
    if (bad.length) console.log('     ' + f + ' เหลือ: ' + bad.join(' '));
    eq('ไม่มี hex ใน ' + f, bad.join(' '), '');
  });

  // `.badge` ของ template เป็นป้ายทรงแคปซูล และ**มาพร้อมตัวบอกชนิดเสมอ**
  // (`info` `success` `warning` `error` `muted`) · `class="badge"` เปล่า ๆ คือร่องรอยของ
  // การยืมชื่อคลาสไปใช้กับอย่างอื่น ซึ่งจะทับกฎของ template แล้วต้องเขียนกฎสวนกลับ
  // (เคสจริง: legend ของ WO Status เคยยืมไปใส่ไอคอน ✓ ◷ ✕ – ตัวเปล่า)
  styled.forEach((f) => {
    const s = fs.readFileSync(path.join(SRC, f), 'utf8');
    eq(f + ' ไม่มี class="badge" เปล่า', s.indexOf('class="badge"') >= 0, false);
  });

  // กลไก embed ต้องยังอยู่ — entry ต้องอ่านพารามิเตอร์นี้ได้
  eq(entry + ' อ่านพารามิเตอร์ embed', /embed/.test(entrySrc), true);
});

// ── 3. หน้าที่ render จริงต้องมี token + คลาสของ template ───────────────────
console.log('\n── หน้าภาพรวมที่ render จริง (wo-cost-trace) ──');
const FX = require('./lib/fixtures_parity');
const { T } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['buildSummary', 'readFilters', 'renderSummaryPage']
});
const page = T.renderSummaryPage(T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31' })));

eq('มี token block', page.indexOf('--pj-primary:var(--c-brand)') > 0, true);
eq('token ประกาศครั้งเดียวในหน้า', page.split('--pj-primary:').length - 1, 1);
eq('font stack มี Sarabun', page.indexOf("'Sarabun'") > 0, true);
eq('KPI ใช้คลาสของ template', page.indexOf('class="kpi-grid"') > 0, true);
eq('การ์ด KPI ใช้คลาสของ template', page.indexOf('class="kpi-card accent-') > 0, true);
eq('ไม่เหลือคลาส KPI ชุดเก่า', page.indexOf('class="kpis"') > 0, false);
eq('มีแถบหัวเรื่องแบบ report-builder', page.indexOf('class="topbar"') > 0, true);
eq('มี breadcrumbs', page.indexOf('class="breadcrumbs"') > 0, true);
eq('เนื้อหาอยู่ใน .content', page.indexOf('<div class="content">') > 0, true);
eq('ปุ่มค้นหาใช้คลาสปุ่มของ template', page.indexOf('class="btn primary"') > 0, true);

// ── 2b. ห้าม `background:` shorthand บนกฎที่แตะ tag `select` ตรง ๆ (#64 ขั้น 3 — list field) ──
// กับดักจริงที่ list-field.md เตือนไว้ (เจอตอน adopt ที่ MRP #489): shorthand เช่น
// `.form-group select{background:...}` รีเซ็ต background-image ของ `.rw-select` (ลูกศร
// chevron ของ native select) ให้หายไปเงียบ ๆ ถ้าสปีซิฟิซิตี้ของกฎนั้นสูงกว่า (0,1,0) ของ
// .rw-select เอง — ตรวจบน CSS ที่ resolve จริงจากหน้าเรนเดอร์ (ไม่ใช่ text scan ของ .js
// source เพราะ CSS ในไฟล์นี้ถูกต่อเป็น string หลายชิ้น ขอบเขต { } จริงอยู่ในผลลัพธ์ที่ evaluate
// แล้วเท่านั้น) ของทั้งสองแอป
function findBackgroundShorthandOnSelect(css) {
  const rules = css.match(/[^{}]+\{[^{}]*\}/g) || [];
  const offenders = [];
  rules.forEach((rule) => {
    const m = /^([^{]+)\{([^}]*)\}$/.exec(rule);
    if (!m) return;
    const selectors = m[1].split(',').map((s) => s.trim());
    // "select" เป็น tag ตรง ๆ เท่านั้น (กันชนกับ .rw-select / .setup-sel ฯลฯ) — ต้องไม่มี
    // ตัวอักษร/ตัวเลข/`-`/`.`/`#` นำหน้าคำว่า select ทันที
    const touchesSelectTag = selectors.some((s) => /(^|[^\w.#-])select($|[^\w-])/.test(s));
    if (!touchesSelectTag) return;
    // `background:` shorthand เท่านั้น (ไม่ใช่ background-color:/background-image: ฯลฯ)
    if (/\bbackground\s*:/.test(m[2])) offenders.push(rule.trim());
  });
  return offenders;
}
console.log('\n── ไม่มี background: shorthand แตะ tag select (กัน chevron หาย — #64 ขั้น 3) ──');
const costTraceStyle = (page.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const costTraceOffenders = findBackgroundShorthandOnSelect(costTraceStyle);
if (costTraceOffenders.length) console.log('     wo-cost-trace เจอ: ' + costTraceOffenders.join(' | '));
eq('wo-cost-trace ไม่มีกฎ background: shorthand แตะ select', costTraceOffenders.join(' | '), '');

const { module: statusMod } = H.load({
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
});
const statusChunks = [];
statusMod.onRequest({
  request: { parameters: {} },
  response: { write: (s) => statusChunks.push(String(s)), setHeader: () => {} },
});
const statusPage = statusChunks.join('');
const statusStyle = (statusPage.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const statusOffenders = findBackgroundShorthandOnSelect(statusStyle);
if (statusOffenders.length) console.log('     wo-status เจอ: ' + statusOffenders.join(' | '));
eq('wo-status ไม่มีกฎ background: shorthand แตะ select', statusOffenders.join(' | '), '');

// โหมด embed ต้องไม่วาดแถบหัวเรื่องซ้อนกับหน้าที่ฝังเราไว้ — ตรวจที่การผูกพารามิเตอร์
// (EMBED เป็นตัวแปรระดับ module ที่ onRequest ตั้งค่า จึงเรียกตรงจากเทสไม่ได้)
// ตรวจข้ามทุกไฟล์ของแอป cost trace ไม่ผูกกับว่าโค้ดอยู่ไฟล์ไหน — ก้อน E1/E2 ย้ายของพวกนี้
// ไป WOCostTrace_Common.js แล้ว และจะย้ายอีกได้ · ที่ต้องคงไว้คือ "มีกลไกนี้อยู่"
console.log('\n── โหมดฝังในหน้าอื่น ──');
const traceDir = H.APP_DIRS['wo-cost-trace'];
const traceSrc = fs.readdirSync(traceDir).filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(traceDir, f), 'utf8')).join('\n');
eq('มีที่ผูก EMBED กับ &embed=1', traceSrc.indexOf("asStr(p.embed) === '1'") > 0, true);
eq('มีที่ข้ามแถบหัวเรื่องเมื่อ embed', traceSrc.indexOf('if (EMBED) return \'\'') > 0, true);

// ── 4. เทียบค่า token กับ builder.css ของ repo ต้นทาง ───────────────────────
// ต้นทางอยู่นอก repo นี้ (repo คนละใบ) จึงเป็นการตรวจแบบมีก็ตรวจ ไม่มีก็บอก
//
// (issue #49 → ตัดสินใจแล้วที่ #64/#56) ต้นทางเปลี่ยน theme ทั้งยวงไปแล้วที่ commit
// 034724c8551babd4e6f5d26a7664fae00680945b ("feat(ui): adopt Teibto Redwood theme"
// PR #293/#294, merged 2026-09-09 — `git log` ใน teibto-report-builder) จาก hex ตรง ๆ
// (palette เดิมชื่อ "Porjai") เปลี่ยนไปเขียน `var(--c-*)` ที่ชี้ table ใหม่
// `00-teibto-tokens.css` (สี/ระยะ/เงาคนละชุดจริง ไม่ใช่แค่เปลี่ยนวิธีเขียน)
//
// เรายึด Redwood แล้ว (ขั้น 1 ของ #64 — เฉพาะสี): `shared/WOReportTheme.js` ฝัง `--c-*`
// ของ 00-teibto-tokens.css เข้ามาทั้ง 33 ตัว แล้วให้ `--pj-*` ทุกตัวชี้ `var(--c-*)` ตามที่
// builder.css นิยามไว้ตรง ๆ — ยังคงแยกเป็นสองชั้นเหมือนเดิม แต่เปลี่ยนความหมาย:
//
//   4a (gate ของ npm test — ต้องผ่านเสมอ ไม่ง้อ repo ต้นทาง) เทียบกับ BASELINE ด้านล่าง
//        ซึ่งตอนนี้คือค่า **หลัง** ยึด Redwood แล้ว (`--pj-*` เป็น `var(--c-*)`, `--c-*` เป็น
//        hex ของ 00-teibto-tokens.css) เท่ากับค่าที่ shared/WOReportTheme.js ใช้อยู่จริงทุกตัว
//        ตอนเขียนเทสนี้ (byte ต่อ byte) จับได้จริงถ้าใครเผลอแก้ token ในไฟล์นี้ให้ต่างจากที่
//        ตั้งใจไว้ — และรันได้แม้เครื่องไม่มี teibto-report-builder วางข้าง ๆ เลย
//   4b (รายงานอย่างเดียว — ไม่ทำให้ npm test แดง) resolve `var(--x)` ของ builder.css ตัวจริง
//        ในเครื่อง (ถ้ามี) โดยไล่ค่าจาก 00-teibto-tokens.css แล้วพิมพ์ดัง ๆ ว่าต่างจากของเรา
//        ตรงไหนบ้าง — ตอนนี้ไม่ใช่ "รอคนตัดสินใจว่าจะตามไหม" อีกต่อไป (ตัดสินแล้ว) แต่เป็น
//        การเตือนดริฟต์ + บอกว่าขั้นนี้ตั้งใจตามเฉพาะสี ยังไม่ตามสเกลระยะ/รัศมี/ตัวอักษร
//        (`--sp-*` `--radius-*` `--shadow-*` `--fs-*` ยังเป็น literal ของขั้นก่อน Redwood) —
//        เพราะงั้น 4b จะยังพิมพ์ต่างสำหรับกลุ่มนี้ต่อไปจนกว่าจะทำขั้นถัดไป ไม่ใช่ของหาย
console.log('\n── 4a. ค่า token ตรงกับ baseline หลังยึด Teibto Redwood (สี — #64 ขั้น 1) ──');

// BASELINE = ค่าจริงที่ shared/WOReportTheme.js ประกาศตอนเขียนเทสนี้ (byte ต่อ byte)
//   - --sp-* / --radius-* / --shadow-* / --fs-* : ยังเป็น literal ของขั้นก่อน Redwood
//     (ต้นทางย้ายไป --s-* / --r-* / --sh-* / --t-* แล้ว แต่ขั้นนี้ทำเฉพาะสี — ดู comment ด้านบน)
//   - --c-* (33 ตัว) : คัดลอกตรงจาก `00-teibto-tokens.css` ของ teibto-report-builder
//     ซึ่งยืนยันแล้วว่าชื่อตรงกับ `00-tokens.css` ของ teibto-ui-workspace ทุกตัว
//   - --pj-* : alias layer ที่ชี้ `var(--c-*)` ตามที่ builder.css นิยามไว้ตรง ๆ (22 ตัว —
//     ไม่มีตัวไหนที่ builder.css นิยามไม่ได้ ยกเว้น --pj-mono ซึ่งเป็นของเราเพิ่มเอง ไม่ผูก --c-*)
const BASELINE = {
  '--sp-1': '4px', '--sp-2': '8px', '--sp-3': '12px', '--sp-4': '16px',
  '--sp-5': '20px', '--sp-6': '24px', '--sp-7': '28px', '--sp-8': '32px',
  '--radius-sm': 'var(--r-sm)', '--radius-md': 'var(--r-md)', '--radius-lg': 'var(--r-lg)',
  '--shadow-sm': 'var(--sh-sm)',
  '--shadow-md': 'var(--sh-md)',
  // ต้นทางยุบ --shadow-lg ให้ชี้ --sh-md ตัวเดียวกับ --shadow-md = เหลือเงาระดับเดียว
  '--shadow-lg': 'var(--sh-md)',
  '--fs-xs': 'var(--t-xs)', '--fs-sm': 'var(--t-sm)', '--fs-md': 'var(--t-base)',
  '--fs-lg': 'var(--t-md)', '--fs-xl': 'var(--t-lg)', '--fs-xxl': 'var(--t-2xl)',
  // ตระกูลสเกลของ Redwood ที่ตัวข้างบนชี้ไปหา — ยกจาก 00-teibto-tokens.css
  '--r-sm': '2px', '--r-md': '4px', '--r-lg': '6px', '--r-pill': '999px',
  '--sh-sm': '0 1px 4px 0 rgba(0,0,0,.12)', '--sh-md': '0 4px 8px 0 rgba(0,0,0,.16)',
  '--t-xs': '11px', '--t-sm': '12px', '--t-base': '14px', '--t-md': '16px',
  '--t-lg': '18px', '--t-xl': '20px', '--t-2xl': '24px',
  '--c-brand': '#36677d', '--c-brand-strong': '#325c72', '--c-brand-on': '#ffffff', '--c-brand-soft': '#e7f2f5',
  '--c-sidebar': '#325c72', '--c-sidebar-text': '#ffffff',
  '--c-sidebar-hover': 'rgba(255,255,255,.08)', '--c-sidebar-active': 'rgba(255,255,255,.16)',
  '--c-sidebar-border': 'rgba(255,255,255,.12)',
  '--c-bg': '#f5f4f2', '--c-surface': '#ffffff', '--c-surface-2': '#fbf9f8', '--c-surface-3': '#f1efed',
  '--c-text': '#161513', '--c-text-subtle': 'rgba(22,21,19,.7)', '--c-text-muted': 'rgba(22,21,19,.7)',
  '--c-border': 'rgba(22,21,19,.12)', '--c-border-control': 'rgba(22,21,19,.5)',
  '--c-success': '#436b1d', '--c-success-soft': '#f4fceb',
  '--c-warning': '#8f520a', '--c-warning-soft': '#fef9f2',
  '--c-danger': '#b3311f', '--c-danger-soft': '#fff8f7',
  '--c-info': '#00688c', '--c-info-soft': '#f6fafc', '--c-link': '#00688c',
  '--c-console': '#201e1c', '--c-console-text': '#f1efed',
  '--c-console-ok': '#6ea73a', '--c-console-warn': '#eca452', '--c-console-err': '#ee7362',
  '--c-scrim': 'rgba(22,21,19,.5)',
  '--pj-primary': 'var(--c-brand)', '--pj-primary-light': 'var(--c-brand)', '--pj-primary-dark': 'var(--c-brand-strong)',
  '--pj-success': 'var(--c-success)', '--pj-success-bg': 'var(--c-success-soft)',
  '--pj-info': 'var(--c-info)', '--pj-info-bg': 'var(--c-info-soft)',
  '--pj-warning': 'var(--c-warning)', '--pj-warning-bg': 'var(--c-warning-soft)',
  '--pj-error': 'var(--c-danger)', '--pj-error-bg': 'var(--c-danger-soft)',
  '--pj-muted': 'var(--c-text-muted)', '--pj-muted-bg': 'var(--c-surface-3)',
  '--pj-bg': 'var(--c-bg)', '--pj-surface': 'var(--c-surface)', '--pj-surface-alt': 'var(--c-surface-2)',
  '--pj-border': 'var(--c-border)', '--pj-border-strong': 'var(--c-border-control)',
  '--pj-text': 'var(--c-text)', '--pj-text-dim': 'var(--c-text-subtle)',
  '--pj-text-muted': 'var(--c-text-muted)', '--pj-text-label': 'var(--c-text-muted)'
};

function rootVars(css) {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!m) return null;
  const out = {};
  m[1].replace(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi, (_, k, v) => {
    out[k] = v.trim().replace(/\s+/g, ' ');
    return '';
  });
  return out;
}

const ours = rootVars(themeSrc.replace(/'\s*\+\s*'/g, '').replace(/\\n/g, ''));
eq('อ่าน :root ของเราได้', ours && Object.keys(ours).length > 0, true);
const baselineMissing = Object.keys(BASELINE).filter((k) => !(ours || {})[k]);
const baselineDiffer = Object.keys(BASELINE)
  .filter((k) => (ours || {})[k] && ours[k] !== BASELINE[k]);
if (baselineMissing.length) console.log('     token หายไปจาก shared/WOReportTheme.js: ' + baselineMissing.join(' '));
if (baselineDiffer.length) {
  baselineDiffer.forEach((k) => console.log('     ' + k + ' baseline=' + BASELINE[k] + ' เรา=' + ours[k]));
}
eq('ไม่มี token ที่หายไปจาก baseline', baselineMissing.join(' '), '');
eq('ไม่มี token ที่ค่าต่างจาก baseline', baselineDiffer.join(' '), '');

// ── 4b. เทียบกับ builder.css ตัวจริงในเครื่อง (รายงานเฉย ๆ ไม่ตัดสิน exit code) ──
console.log('\n── 4b. ค่า token เทียบกับ builder.css ต้นทางสด ๆ (รายงานอย่างเดียว) ──');
const UPSTREAM = path.join(ROOT,
  '../Reports/General_report/teibto-report-builder/ui-src/styles/builder.css');
const TOKENS_CSS = path.join(ROOT,
  '../Reports/General_report/teibto-report-builder/ui-src/styles/00-teibto-tokens.css');

// token 4 ตัวที่ builder.css ต้นทางมีแต่เราไม่มี: --pj-danger --pj-bg-soft --pj-border-soft
// --pj-accent — **ไม่ใช่ชื่อที่เปลี่ยน** ของ token ไหนที่เรามีอยู่ ตรวจแล้วสามทาง:
//   1. `git show 034724c -- ui-src/styles/builder.css` — 4 ชื่อนี้เพิ่งถูก "เพิ่ม" เข้ามาใน
//      diff นั้น (บรรทัด `+`) โดยที่ชื่อเดิม --pj-error / --pj-surface-alt / --pj-border /
//      --pj-primary ยังอยู่ครบ (ไม่ถูกลบ) — ถ้าเป็นการ "เปลี่ยนชื่อ" ของเดิมต้องหายไปด้วย
//   2. ก่อนคอมมิตนั้น (034724c^) ทั้ง 4 ชื่อนี้ไม่มีอยู่เลยใน builder.css — ดังนั้นไม่ใช่ของที่
//      มีมาแต่ต้นแล้วเราพลาดยกมา
//   3. builder.css:15,17,18,19 (บรรทัดปัจจุบัน) ค่าที่ 4 ชื่อนี้ชี้ไปคือค่าเดียวกับที่ชื่อเดิม
//      ของเราชี้อยู่แล้ว: --pj-danger = --pj-error (= var(--c-danger)), --pj-bg-soft =
//      --pj-surface-alt (= var(--c-surface-2)), --pj-border-soft = --pj-border
//      (= var(--c-border)), --pj-accent = --pj-primary (= var(--c-brand))
// สรุป: เป็น alias ใหม่ที่ต้นทางเพิ่มไว้เผื่ออนาคตตอนย้ายไป Redwood ไม่ใช่การเปลี่ยนชื่อ และ
// `grep -rn -- "--pj-danger\|--pj-bg-soft\|--pj-border-soft\|--pj-accent" shared/ apps/`
// ไม่เจอที่ใช้จริงในโค้ดเราเลยสักที่ — จึงไม่เพิ่มลง shared/WOReportTheme.js (จะเป็นการแก้ไฟล์
// ที่กระทบรายงานจริงสองใบโดยไม่มีใครขอ) แค่ประกาศไว้ตรงนี้ว่า "รู้แล้ว ไม่ใช่ของหาย"
const KNOWN_UPSTREAM_ONLY_ALIASES = ['--pj-danger', '--pj-bg-soft', '--pj-border-soft', '--pj-accent'];

// ประเมิน calc() แบบง่าย — บวก/ลบของค่าที่หน่วยเดียวกันเท่านั้น (เช่น `24px + 4px`)
// เหตุที่ประเมินแทนที่จะเทียบสตริง: --sp-7 ต้นทางเขียน `calc(var(--s-6) + var(--s-1))`
// ซึ่ง resolve ได้แค่ชั้นเดียวเป็น `calc(24px + 4px)` — เทียบสตริงกับ `28px` ของเราไม่มีทางเท่า
// ทั้งที่ค่าจริงเท่ากัน การบวกเลขที่หน่วยตรงกันเป็นเลขคณิตล้วน ไม่ใช่การเดาหรือปิดเทส ·
// ถ้าหน่วยไม่ตรงกันหรือมีมากกว่าบวก/ลบ (เช่น mix หน่วย หรือ min()/max() ซ้อน) ฟังก์ชันคืน
// null แล้วปล่อยเป็นข้อความ calc(...) ดิบไปเทียบ (จะขึ้น "ต่าง" ให้คนอ่านไปตรวจเอง)
function evalSimpleCalc(expr) {
  const terms = expr.match(/[+-]?\s*\d+(\.\d+)?[a-z%]*/gi);
  if (!terms) return null;
  let unit = null;
  let total = 0;
  for (let i = 0; i < terms.length; i++) {
    const tm = terms[i].replace(/\s+/g, '').match(/^([+-]?\d+(?:\.\d+)?)([a-z%]*)$/i);
    if (!tm) return null;
    const num = parseFloat(tm[1]);
    const u = tm[2] || '';
    if (unit === null) unit = u;
    else if (u !== unit) return null; // หน่วยไม่ตรงกัน — ไม่เดา ปล่อยดิบ
    total += num;
  }
  return total + unit;
}

// resolve var(--x) ซ้อนได้หลายชั้น (กันเผื่ออนาคต แม้ปัจจุบัน 00-teibto-tokens.css จะเป็น
// ค่าตรงทุกตัวอยู่แล้ว ไม่ต้องไล่เกินชั้นเดียว) แล้วค่อยประเมิน calc() ที่เหลือ
function resolveValue(raw, dict) {
  let v = raw;
  for (let i = 0; i < 10; i++) {
    let changed = false;
    v = v.replace(/var\((--[a-z0-9-]+)\)/gi, (m, name) => {
      if (dict[name] == null) return m;
      changed = true;
      return dict[name];
    });
    if (!changed) break;
  }
  v = v.replace(/calc\(([^()]+)\)/g, (m, expr) => {
    const evaluated = evalSimpleCalc(expr);
    return evaluated == null ? m : evaluated;
  });
  return v;
}

// สีฐาน 16 (`#rrggbb`) ไม่สนตัวพิมพ์เล็ก/ใหญ่ใน CSS — `#ffffff` กับ `#FFFFFF` คือสีเดียวกัน
// ไม่ใช่ของที่ "ต่างจริง" เทียบแบบ lowercase เฉพาะค่าที่หน้าตาเป็น hex เท่านั้น
function normalizeForCompare(v) {
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v.toLowerCase() : v;
}

if (!fs.existsSync(UPSTREAM) || !fs.existsSync(TOKENS_CSS)) {
  console.log('     ข้าม — ไม่พบ builder.css หรือ 00-teibto-tokens.css ที่ ' + path.normalize(UPSTREAM));
  console.log('     (ต้อง clone teibto-report-builder ไว้ที่ Foodstar/Reports/General_report/ ถึงจะตรวจข้อนี้ได้)');
} else {
  const up = rootVars(fs.readFileSync(UPSTREAM, 'utf8')) || {};
  const dict = rootVars(fs.readFileSync(TOKENS_CSS, 'utf8')) || {};
  const upKeys = Object.keys(up);
  const missing = upKeys.filter((k) => !(ours || {})[k] && KNOWN_UPSTREAM_ONLY_ALIASES.indexOf(k) < 0);
  const differ = [];
  // ตั้งแต่ #64 ขั้น 1: ฝั่งเราเองก็เขียน --pj-* เป็น var(--c-*) แล้ว ไม่ใช่ hex ตรง ๆ อีกต่อไป
  // resolveValue(up[k], dict) เพียงอย่างเดียวจึงเทียบไม่ตรง (hex ที่ resolve แล้ว vs สตริง
  // var(--c-x) ดิบของเรา) ต้อง resolve ทั้งสองฝั่งด้วยพจนานุกรมเดียวกัน — dict ของต้นทาง
  // (00-teibto-tokens.css) ก่อน แล้วเสริมด้วย --c-* ที่เราฝังเองเผื่อกรณีมันต่างจากต้นทางจริง
  // (ถ้าต่าง อยากให้ resolveValue ใช้ของเรา แล้วปล่อยให้ differ จับที่ตัว --c-* เอง ไม่ใช่ปิดบัง)
  const oursDict = Object.assign({}, dict, ours);
  upKeys.forEach((k) => {
    if (!(ours || {})[k]) return;
    const resolved = resolveValue(up[k], dict);
    const oursResolved = resolveValue(ours[k], oursDict);
    if (normalizeForCompare(resolved) !== normalizeForCompare(oursResolved)) {
      differ.push({ k: k, resolved: resolved, ours: oursResolved });
    }
  });
  if (missing.length) console.log('     token ที่ต้นทางมีแต่เราไม่มี (นอกเหนือจาก alias ที่รู้แล้ว): ' + missing.join(' '));
  if (differ.length) {
    console.log('     ต้นทางย้ายไป Teibto Redwood theme ที่ 034724c (PR #293/#294, 2026-09-09) ·'
      + ' ' + differ.length + ' token ยังต่างจาก shared/WOReportTheme.js (ตัดสินใจแล้วที่ #64/#56 ว่ายึด'
      + ' Redwood — ขั้นนี้ทำเฉพาะสี ตัวที่เหลือคือสเกลระยะ/รัศมี/ตัวอักษรที่ตั้งใจยังไม่ทำรอบนี้):');
    differ.forEach((d) => console.log('       ' + d.k + ' ต้นทาง(resolve แล้ว)=' + d.resolved + ' เรา(resolve แล้ว)=' + d.ours));
    // หมายเหตุความหมาย ไม่ใช่แค่ค่า: ต้นทางยุบ --shadow-lg ให้ชี้ตัวเดียวกับ --shadow-md แล้ว
    // (`--shadow-lg:var(--sh-md)`) ไม่ได้แค่เปลี่ยนตัวเลข — ของเรายังมี --shadow-lg เป็นเงาที่
    // เข้มกว่า --shadow-md ชัดเจน และ `.kpi-card:hover` ใช้ --shadow-md อยู่แล้ว จุดนี้ไม่กระทบ
    // แต่ถ้าจะตามต้นทางควรรู้ว่า "เงาสองระดับ" ต้นทางเหลือระดับเดียวจริง ๆ แล้ว
    if (differ.some((d) => d.k === '--shadow-lg')) {
      console.log('       (หมายเหตุ: ต้นทางยุบ --shadow-lg ให้เท่ากับ --shadow-md แล้ว ไม่ใช่แค่ค่าตัวเลขต่าง)');
    }
  } else {
    console.log('     ไม่ต่างจาก builder.css ต้นทางสด ๆ (resolve แล้ว)');
  }
  // ข้อนี้เป็นรายงาน ไม่เรียก eq() — ตั้งใจไม่ให้กระทบ exit code ของ npm test (เหตุผลอยู่ใน
  // comment ก้อนใหญ่เหนือข้อ 4a/4b ด้านบน)
}

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
