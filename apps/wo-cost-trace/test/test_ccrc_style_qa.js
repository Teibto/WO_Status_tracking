/**
 * เทส — ผล QA สไตล์ CCRC บน SB1 (issue #96 · PR #97) ทุกหน้าของ WO Cost Trace
 *
 * ล็อกข้อที่ QA วัดเจอ (ลำดับข้อตาม QA) ให้ไม่ถอยกลับ:
 *   0  ทุกหน้าเป็นเอกสาร HTML เต็ม (doctype · lang · viewport · title) — เดิมไม่มี doctype = quirks mode
 *   1  โหมด embed: ทุกฟอร์มมี hidden embed=1 · ทุกลิงก์ภายในพา embed=1
 *   2  ทุกตารางอยู่ใน wrapper ที่เลื่อนแนวนอนเองได้ (.rw-tablewrap / .scroll) — หน้าไม่ล้น
 *   3-5 จอแคบ ≤1023px: ตัวควบคุมสูง --tap-min · .iconbtn 40×40 สีหมึก
 *   8  ทุก <summary> เป็นหัว accordion ที่มีไอคอน svg (marker ถูกซ่อน)
 *   12-13 ไอคอน 18px · ไม่มีตัวอักษร ← แทนไอคอน
 *   14 เปิดเดี่ยว: ชื่อหน้าเป็น h1.viewtitle ใน topbar มีปุ่ม i · embed: ไม่มี topbar
 *   18 ฟอร์มไม่มีการ์ด
 * ขับผ่าน onRequest จริงทั้งสี่ชั้น (ภาพรวม · เจาะลึก · ความพร้อม · คู่มือ) × (เปิดเดี่ยว · embed)
 * ค่าสี literal ตรวจอยู่แล้วที่ test_help_page.js ข้อ 7
 */
const fs = require('fs');
const path = require('path');
const H = require('../../../test/lib/_harness');
const FXP = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ json: true });
const DIR = path.join(__dirname, '..', 'src', 'FileCabinet', 'SuiteScripts', 'Foodstar', 'WO_Status_tracking');

// fixture ของชั้นความพร้อม = ก้อน BASE ใน test_ready_master.js (ตัวเดียวกับที่เทสนั้นใช้ · ไม่ก๊อปซ้ำ)
// ถ้าโครงไฟล์นั้นเปลี่ยนจนหา BASE ไม่เจอ เทสนี้ต้องล้มดัง ๆ ไม่ใช่ข้ามชั้นความพร้อมเงียบ ๆ
const rsrc = fs.readFileSync(path.join(__dirname, 'test_ready_master.js'), 'utf8');
const ra = rsrc.indexOf('const BASE = {');
const rb = rsrc.indexOf('let FX = BASE;');
if (ra < 0 || rb < ra) throw new Error('หา fixture BASE ใน test_ready_master.js ไม่เจอ');
const READY_FX = eval('(function(){' + rsrc.slice(ra, rb) + '; return BASE;})()');

// โหลด lib ตรง ๆ ก่อน — harness ถือ fixture เป็นตัวแปรกลาง ตัวที่โหลดทีหลังต้องเป็นตัวที่ใช้ getter
const { module: C } = H.load({
  file: 'WOCostTrace_Common.js', dir: DIR, libs: ['WOReportTheme.js'], fixtures: FXP.summary(), quietLog: true
});
let FIX = FXP.summary();
const { module: mod } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: () => FIX,
  quietLog: true
});
function run(params) {
  const chunks = [];
  mod.onRequest({
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: () => {} }
  });
  return chunks.join('');
}

const BASEP = { from: '2026-07-01', to: '2026-07-31', sub: '2', rmloc: '35', loc: '10', line: '3' };
const LAYERS = [
  ['ภาพรวม', () => { FIX = FXP.summary(); return Object.assign({}, BASEP); }],
  ['เจาะลึก', () => { FIX = FXP.drilldown(); return Object.assign({ wo: FXP.WO_HEADER.wo_no }, BASEP); }],
  ['ความพร้อม', () => { FIX = READY_FX; return { ready: 'WO-FSC-00000392' }; }],
  ['คู่มือ', () => { FIX = FXP.summary(); return Object.assign({ view: 'help' }, BASEP); }]
];
const PAGES = [];
LAYERS.forEach(([name, prep]) => {
  PAGES.push({ name: name + ' (เปิดเดี่ยว)', layer: name, embed: false, html: run(prep()) });
  PAGES.push({ name: name + ' (embed)', layer: name, embed: true, html: run(Object.assign(prep(), { embed: '1' })) });
});

/** HTML ที่ไม่รวม <style>/<script> — ใช้ตรวจของที่ผู้ใช้เห็น */
const visible = (h) => h.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, '');
/** ก้อน <form …>…</form> ทั้งหมด */
const forms = (h) => visible(h).match(/<form\b[\s\S]*?<\/form>/g) || [];

// ═══ 0. เอกสาร HTML เต็ม (standards mode) ═══════════════════════════════════════
console.log('\n── 0. doctype / lang / viewport / title ทุกหน้า ──');
PAGES.forEach((p) => {
  eq(p.name + ' → ขึ้นต้นด้วย <!doctype html><html lang="th">', p.html.indexOf('<!doctype html><html lang="th"><head>'), 0);
  eq(p.name + ' → มี meta charset + viewport',
    p.html.indexOf('<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">') > 0, true);
  const t = (p.html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  eq(p.name + ' → <title> มีชื่อหน้า', t.length > 0, true);
  eq(p.name + ' → style อยู่ใน <head>', p.html.indexOf('<style>') < p.html.indexOf('</head>'), true);
  eq(p.name + ' → ปิดด้วย </body></html>', /<\/body><\/html>$/.test(p.html), true);
  eq(p.name + ' → body ติดคลาส is-embed เฉพาะโหมด embed', /<body class="is-embed">/.test(p.html), p.embed);
});

// ═══ 1. embed ต้องติดไปกับทุกฟอร์มและทุกลิงก์ภายใน ═════════════════════════════════
console.log('\n── 1. embed=1 ติดทุกฟอร์ม/ลิงก์ ──');
PAGES.forEach((p) => {
  const fs_ = forms(p.html);
  fs_.forEach((f, i) => {
    eq(p.name + ' → ฟอร์มที่ ' + (i + 1) + (p.embed ? ' มี' : ' ไม่มี') + ' hidden embed',
      f.indexOf('<input type="hidden" name="embed" value="1">') >= 0, p.embed);
  });
  const links = (visible(p.html).match(/href="(\/app\/site\/hosting\/scriptlet\.nl\?[^"]*)"/g) || []);
  if (p.embed) {
    const lost = links.filter((l) => l.indexOf('embed=1') < 0);
    eq(p.name + ' → ลิงก์ภายในทุกตัวพา embed=1 (' + links.length + ' ลิงก์)', lost.join(' '), '');
  }
});
eq('หน้าเจาะลึก/ความพร้อม (embed) มีฟอร์มให้ตรวจจริง',
  PAGES.filter((p) => p.embed && (p.layer === 'เจาะลึก' || p.layer === 'ความพร้อม'))
    .every((p) => forms(p.html).length >= 1), true);

// ═══ 2. ทุกตารางอยู่ใน wrapper ที่เลื่อนเองได้ ═══════════════════════════════════
console.log('\n── 2. ตารางอยู่ใน .rw-tablewrap / .scroll ──');
PAGES.forEach((p) => {
  const v = visible(p.html);
  const total = (v.match(/<table\b/g) || []).length;
  const wrapped = (v.match(/<div class="(?:rw-tablewrap|scroll)"><table\b/g) || []).length;
  eq(p.name + ' → ตารางทุกตัว (' + total + ') อยู่ใน wrapper', wrapped, total);
});
const drillSolo = PAGES.find((p) => p.layer === 'เจาะลึก' && !p.embed).html;
// ตารางใน .lvl2 (ชั้นที่ 2) — fixture ชุดเจาะลึกไม่มีกึ่งสำเร็จรูป จึงพิสูจน์ด้วย wrapTables ตรง ๆ
// ด้วย markup รูปเดียวกับ WOCostTrace.js (ตารางเปล่าใน .lvl2 ภายใน details)
const lvl2 = C.wrapTables('<details open><summary>x</summary><div class="lvl2"><h3>a</h3><table><tr><th>t</th></tr></table>'
  + '<table><tr><td>1</td></tr></table></div></details><div class="scroll"><table><tr><td>2</td></tr></table></div>');
eq('wrapTables: ตารางเปล่าใน .lvl2 ถูกห่อ .rw-tablewrap ทุกตัว', (lvl2.match(/<div class="rw-tablewrap"><table>/g) || []).length, 2);
eq('wrapTables: ตารางใน .scroll ไม่ถูกห่อซ้ำ', lvl2.indexOf('<div class="scroll"><table>') >= 0
  && lvl2.indexOf('<div class="rw-tablewrap"><div class="scroll">') < 0, true);
const css = C.REPORT_CSS;
eq('.rw-tablewrap เลื่อนแนวนอนเองได้ (overflow:auto)', /\.rw-tablewrap\{overflow:auto;max-width:100%/.test(css), true);
eq('wrapper ในการ์ดไม่วาดกรอบซ้อน', css.indexOf('.card>.rw-tablewrap{border:0') >= 0, true);
eq('<table> เองไม่มีกรอบ (กรอบเป็นของ wrapper)', /(^|\})table\{border:0;/.test(css), true);

// ═══ 3-5. จอแคบ + ปุ่ม i ════════════════════════════════════════════════════════
console.log('\n── 3-5. media ≤1023px · .iconbtn ──');
const mq = (css.match(/@media \(max-width:1023px\)\{([\s\S]*)\}$/) || [])[1] || '';
eq('มี @media (max-width:1023px) ท้าย REPORT_CSS', mq.length > 0, true);
['.btn', 'input[type=text]', 'select:not([multiple])', '.rw-select', '.rw-combobox .rw-combobox-input', '.datewrap']
  .forEach((sel) => {
    const rule = (mq.match(/([^{}]+)\{height:var\(--tap-min\);min-height:var\(--tap-min\)\}/) || [])[1] || '';
    eq('จอแคบ: ' + sel + ' สูง --tap-min', rule.split(',').indexOf(sel) >= 0, true);
  });
eq('จอแคบ: ช่องเลือกหลายคลังไม่ถูกบีบ (ไม่มี select เปล่าในกฎ 40px)',
  /(^|[,}])select[,{]/.test(mq), false);
eq('จอแคบ: topbar 0 16px', mq.indexOf('.topbar{padding:0 var(--sp-4)}') >= 0, true);
eq('จอแคบ: เนื้อหา 16px', mq.indexOf('.content{padding:var(--sp-4)}') >= 0, true);
const ib = (css.match(/\.iconbtn\{([^}]*)\}/) || [])[1] || '';
eq('.iconbtn 40×40 (--tap-min)', /width:var\(--tap-min\);height:var\(--tap-min\)/.test(ib), true);
eq('.iconbtn สีหมึกเต็ม var(--c-text)', /(^|;)color:var\(--c-text\)/.test(ib), true);

// ═══ 6-7, 14. หัวหน้า: topbar (เปิดเดี่ยว) / pagehead (embed) ═════════════════════
console.log('\n── 14. topbar แบบ CCRC · 6-7 หัวหน้าในโหมด embed ──');
PAGES.forEach((p) => {
  const hasTop = p.html.indexOf('<header class="topbar"><h1 class="viewtitle">') >= 0;
  eq(p.name + (p.embed ? ' → ไม่มี topbar' : ' → topbar มี h1.viewtitle'), hasTop, !p.embed);
  eq(p.name + ' → ไม่มี breadcrumb', p.html.indexOf('class="breadcrumbs"') >= 0, false);
  eq(p.name + ' → h1 ไม่เกินหนึ่งตัว', (p.html.match(/<h1[\s>]/g) || []).length <= 1, true);
  if (p.layer !== 'คู่มือ') {
    const where = p.embed ? /<div class="pagehead[^"]*">[\s\S]*?<a class="iconbtn"/ : /<div class="right"><a class="iconbtn"/;
    eq(p.name + ' → ปุ่ม i อยู่' + (p.embed ? 'ใน pagehead' : 'ใน topbar'), where.test(p.html), true);
  }
});
const ovEmb = PAGES.find((p) => p.layer === 'ภาพรวม' && p.embed).html;
eq('ภาพรวม (embed) → ปุ่ม i ลอยขวา ไม่กินแถวเปล่า (pagehead.is-float)',
  /<div class="pagehead is-float"><a class="iconbtn"/.test(ovEmb), true);
eq('embed: h1 ของหน้าย่อย = --t-md', css.indexOf('body.is-embed h1{font-size:var(--t-md)}') >= 0, true);
eq('embed: เนื้อหาไม่เยื้องซ้ายขวา', css.indexOf('body.is-embed .content{padding:var(--sp-4) 0 var(--sp-6)}') >= 0, true);
eq('embed: พื้นเท่า .appframe (--c-surface)', css.indexOf('body.is-embed{background:var(--c-surface)}') >= 0, true);

const srcCode = ['WOCostTrace.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js']
  .map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n')
  .split('\n').filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln)).join('\n');
// ═══ 8. หัวข้อพับเป็น accordion ที่มีไอคอน ═══════════════════════════════════════
console.log('\n── 8. ทุก <summary> มีไอคอน svg ──');
PAGES.forEach((p) => {
  const sums = visible(p.html).match(/<summary>[\s\S]*?<\/summary>/g) || [];
  const bare = sums.filter((s) => !/^<summary><span class="accico"><svg /.test(s));
  eq(p.name + ' → summary ' + sums.length + ' อันมีไอคอนครบ', bare.length, 0);
});
eq('หน้าภาพรวมมีหัวข้อพับจริง (ไม่ใช่ผ่านเพราะว่าง)', (ovEmb.match(/<summary>/g) || []).length >= 2, true);
// ทุก <summary> ในซอร์สต้องมาจาก accSummary() — จุดที่ไม่มี fixture ปิดอยู่ (หัวข้อพับชั้นที่ 2/3) ก็ถูกจับ
const rawSummary = srcCode.split('\n').filter((ln) => ln.indexOf('<summary>') >= 0
  && ln.indexOf('<summary><span class="accico">') < 0);
eq('ซอร์สไม่มี <summary> เปล่านอก accSummary()', rawSummary.join(' | '), '');

// ═══ 12-13. ไอคอน 18px · ไม่มี ← ═══════════════════════════════════════════════════
console.log('\n── 12-13. ไอคอน 18px · ไม่มีตัวอักษร ← ──');
eq('token --icon:18px', css.indexOf('--icon:18px') >= 0, true);
eq('svg ใน topbar/เนื้อหา/ปฏิทิน = --icon', css.indexOf('.topbar svg,.content svg,.cal svg{width:var(--icon);height:var(--icon)') >= 0, true);
eq('ไม่มีกฎย่อไอคอน .rowstat เหลือ 12px', /\.rowstat svg\{width:12px/.test(css), false);
eq('ไม่มีกฎย่อไอคอน .nsrec เหลือ 11px', /\.nsrec svg\{width:11px/.test(css), false);
const localSvgs = Object.keys(C.ICONS).filter((k) => ['info', 'download', 'arrowLeft', 'chevronRight'].indexOf(k) >= 0)
  .map((k) => C.ICONS[k]);
eq('LOCAL_ICONS ทุกตัว width/height 18 currentColor',
  localSvgs.length === 4 && localSvgs.every((s) => /^<svg width="18" height="18"/.test(s) && /currentColor/.test(s)), true);
PAGES.forEach((p) => {
  eq(p.name + ' → ไม่มีตัวอักษร ← / emoji ในของที่ผู้ใช้เห็น',
    /[←⬅\u{1F300}-\u{1FAFF}]/u.test(visible(p.html)), false);
});
eq('โค้ด (ไม่นับคอมเมนต์) ไม่มี ←', srcCode.indexOf('←') >= 0, false);

// ═══ 18. ฟอร์มไม่มีการ์ด ═══════════════════════════════════════════════════════════
console.log('\n── 18. ฟอร์มไม่มีการ์ด ──');
const formRules = (css.match(/(?:^|\})form\{[^}]*\}/g) || []).join('');
eq('มีกฎ form{}', formRules.length > 0, true);
eq('form ไม่มีพื้น/กรอบ/มุมโค้ง', /background|border/.test(formRules), false);

// ═══ ข้ออื่นจาก QA (9-11, 15-17, 19-20) ═══════════════════════════════════════════
console.log('\n── ข้ออื่น ──');
eq('9 th nowrap', /(^|\})th\{[^}]*white-space:nowrap/.test(css), true);
eq('10 combobox/select padding 0 32px 0 8px', css.indexOf('padding:0 var(--sp-8) 0 var(--sp-2)') >= 0, true);
eq('15 .engine-badge = .badge--brand', /\.engine-badge\{[^}]*background:var\(--c-brand-soft\);color:var\(--c-brand\)/.test(css), true);
eq('16 option:checked โทนแบรนด์อ่อน', /select\[multiple\] option:checked\{background-color:var\(--c-brand-soft\);color:var\(--c-brand\)/.test(css), true);
eq('17 .kpi-grid margin-bottom 24px', /\.kpi-grid\{[^}]*margin-bottom:var\(--sp-6\)/.test(css), true);
eq('19 :focus-visible มีมุม --r-md', /box-shadow:var\(--focus-ring\) !important;border-radius:var\(--r-md\)\}/.test(css), true);
eq('20 KPI label/meta ตัดบรรทัดได้', css.indexOf('.kpi-label,.kpi-meta{white-space:normal;overflow:visible;text-overflow:clip') >= 0, true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
