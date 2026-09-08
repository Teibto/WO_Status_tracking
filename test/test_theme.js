/**
 * เทส — รายงานทุกใบต้องใช้ design token ชุดเดียวกับ teibto-report-builder (issue #18)
 *
 * ปัญหาที่กัน: style ที่ "เข้ากัน" วันนี้ drift ได้เงียบ ๆ ด้วยการที่ใครเติม hex ลง markup
 * ตรง ๆ อีกที หรือก็อป token block ไปวางไฟล์ที่สองแล้วแก้ทีละไฟล์
 *
 * เทสนี้ตรวจ 4 อย่าง
 *   1. token block ประกาศที่เดียว — WOReportTheme.js เท่านั้น
 *   2. ไม่มี hex สีใน entry Suitelet (ยกเว้น `#fff` ซึ่ง template เองก็เขียนตรง ๆ)
 *   3. หน้าที่ render ออกมาจริงมี token + คลาสคอมโพเนนต์ของ template
 *   4. ค่าทุก token ตรงกับ builder.css ของ repo ต้นทาง — ถ้าหา repo นั้นไม่เจอจะข้ามข้อนี้
 *      และบอกไว้ ไม่เงียบ (เครื่อง CI/เครื่องคนอื่นอาจไม่มี repo นั้นวางข้าง ๆ)
 */
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

const eq = H.makeEq({ json: true });

const SRC = H.SRC_DIR;
const THEME_FILE = path.join(SRC, 'WOReportTheme.js');
const ENTRIES = ['WOCostTrace.js', 'WOStatusTracking.js'];
const themeSrc = fs.readFileSync(THEME_FILE, 'utf8');

// ── 1. token block ต้องมีที่เดียว ────────────────────────────────────────────
console.log('\n── token ประกาศที่เดียว ──');
const declaring = fs.readdirSync(SRC)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => fs.readFileSync(path.join(SRC, f), 'utf8').indexOf('--pj-primary:') >= 0);
if (declaring.length !== 1) console.log('     ไฟล์ที่ประกาศค่า token: ' + declaring.join(', '));
eq('มีไฟล์เดียวที่ประกาศค่า --pj-primary', declaring.join(','), 'WOReportTheme.js');

ENTRIES.forEach((f) => {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  eq(f + ' require theme', s.indexOf("'./WOReportTheme'") > 0, true);
});

// ── 2. ห้ามมี hex สีในไฟล์ไหนก็ตาม ยกเว้นไฟล์ theme ─────────────────────────
// `#fff` ปล่อยผ่านเพราะ builder.css ต้นทางก็เขียน `color:#fff` ตรง ๆ บนพื้นสีเข้ม
//
// ตรวจ **ทุกไฟล์** ไม่ใช่แค่ entry — `WOStatusTracking_Drilldown.js` และ `_Labels.js`
// ก็ประกอบ markup ที่ผู้ใช้เห็น จึงเติมสีของตัวเองได้เหมือนกัน
const STYLED = fs.readdirSync(SRC)
  .filter((f) => f.endsWith('.js') && f !== 'WOReportTheme.js')
  .sort();
console.log('\n── ไม่มีไฟล์ไหนถือ hex สีของตัวเอง ──');
STYLED.forEach((f) => {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  // นับเฉพาะ hex ที่อยู่ใน **โค้ด** — คอมเมนต์ที่ยกสีเก่ามาเล่าว่าเปลี่ยนจากอะไรเป็นอะไร
  // คือหลักฐานที่ต้องเก็บไว้ ไม่ใช่สีที่ render ออกมา
  const bad = (s.split('\n')
    .filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln))
    .join('\n')
    .match(/#[0-9a-fA-F]{3,6}\b/g) || [])
    .filter((h) => h.toLowerCase() !== '#fff' && h.toLowerCase() !== '#ffffff');
  if (bad.length) console.log('     ' + f + ' เหลือ: ' + bad.join(' '));
  eq(f, bad.join(' '), '');
});

// `.badge` ของ template เป็นป้ายทรงแคปซูล (มีพื้น มี padding) และ**มาพร้อมตัวบอกชนิดเสมอ**
// (`info` `success` `warning` `error` `muted`) · `class="badge"` เปล่า ๆ คือร่องรอยของ
// การยืมชื่อคลาสไปใช้กับอย่างอื่น ซึ่งจะทับกฎของ template แล้วต้องเขียนกฎสวนกลับ
// (เคสจริง: legend ของ WO Status เคยยืมไปใส่ไอคอน ✓ ◷ ✕ – ตัวเปล่า)
console.log('\n── ไม่มีใครยืมชื่อคลาส .badge ไปใช้อย่างอื่น ──');
STYLED.forEach((f) => {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  eq(f + ' ไม่มี class="badge" เปล่า', s.indexOf('class="badge"') >= 0, false);
});

// ── 3. หน้าที่ render จริงต้องมี token + คลาสของ template ───────────────────
console.log('\n── หน้าภาพรวมที่ render จริง ──');
const FX = require('./fixtures_parity');
const { T } = H.load({
  libs: ['WOReportTheme.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['buildSummary', 'readFilters', 'renderSummaryPage']
});
const page = T.renderSummaryPage(T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31' })));

eq('มี token block', page.indexOf('--pj-primary:#185FA5') > 0, true);
eq('token ประกาศครั้งเดียวในหน้า', page.split('--pj-primary:').length - 1, 1);
eq('font stack มี Sarabun', page.indexOf("'Sarabun'") > 0, true);
eq('KPI ใช้คลาสของ template', page.indexOf('class="kpi-grid"') > 0, true);
eq('การ์ด KPI ใช้คลาสของ template', page.indexOf('class="kpi-card accent-') > 0, true);
eq('ไม่เหลือคลาส KPI ชุดเก่า', page.indexOf('class="kpis"') > 0, false);
eq('มีแถบหัวเรื่องแบบ report-builder', page.indexOf('class="topbar"') > 0, true);
eq('มี breadcrumbs', page.indexOf('class="breadcrumbs"') > 0, true);
eq('เนื้อหาอยู่ใน .content', page.indexOf('<div class="content">') > 0, true);
eq('ปุ่มค้นหาใช้คลาสปุ่มของ template', page.indexOf('class="btn primary"') > 0, true);

// โหมด embed ต้องไม่วาดแถบหัวเรื่องซ้อนกับหน้าที่ฝังเราไว้ — ตรวจที่การผูกพารามิเตอร์
// (EMBED เป็นตัวแปรระดับ module ที่ onRequest ตั้งค่า จึงเรียกตรงจากเทสไม่ได้)
console.log('\n── โหมดฝังในหน้าอื่น ──');
ENTRIES.forEach((f) => {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  eq(f + ' อ่านพารามิเตอร์ embed', /embed/.test(s), true);
});
const traceSrc = fs.readFileSync(path.join(SRC, 'WOCostTrace.js'), 'utf8');
eq('WOCostTrace ผูก EMBED กับ &embed=1', traceSrc.indexOf("EMBED = asStr(p.embed) === '1'") > 0, true);
eq('WOCostTrace ข้ามแถบหัวเรื่องเมื่อ embed', traceSrc.indexOf('if (EMBED) return \'\'') > 0, true);

// ── 4. เทียบค่า token กับ builder.css ของ repo ต้นทาง ───────────────────────
// ต้นทางอยู่นอก repo นี้ (repo คนละใบ) จึงเป็นการตรวจแบบมีก็ตรวจ ไม่มีก็บอก
console.log('\n── ค่า token ตรงกับ builder.css ต้นทาง ──');
const UPSTREAM = path.join(SRC,
  '../../../../../../Reports/General_report/teibto-report-builder/ui-src/styles/builder.css');

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

if (!fs.existsSync(UPSTREAM)) {
  console.log('     ข้าม — ไม่พบ builder.css ที่ ' + path.normalize(UPSTREAM));
  console.log('     (ต้อง clone teibto-report-builder ไว้ที่ Foodstar/Reports/General_report/ ถึงจะตรวจข้อนี้ได้)');
} else {
  const up = rootVars(fs.readFileSync(UPSTREAM, 'utf8'));
  const ours = rootVars(themeSrc.replace(/'\s*\+\s*'/g, '').replace(/\\n/g, ''));
  eq('อ่าน :root ของต้นทางได้', up && Object.keys(up).length > 0, true);
  eq('อ่าน :root ของเราได้', ours && Object.keys(ours).length > 0, true);
  const upKeys = Object.keys(up || {});
  const missing = upKeys.filter((k) => !(ours || {})[k]);
  const differ = upKeys.filter((k) => (ours || {})[k] && ours[k] !== up[k]);
  if (missing.length) console.log('     token ที่ต้นทางมีแต่เราไม่มี: ' + missing.join(' '));
  if (differ.length) {
    differ.forEach((k) => console.log('     ' + k + ' ต้นทาง=' + up[k] + ' เรา=' + ours[k]));
  }
  eq('ไม่มี token ที่หายไป', missing.join(' '), '');
  eq('ไม่มี token ที่ค่าต่างจากต้นทาง', differ.join(' '), '');
}

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
