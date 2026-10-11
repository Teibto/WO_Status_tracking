/**
 * เทส — ช่องไฟเป็นระบบเดียวกับ CCRC · ลำดับหัวหน้า · การ์ดตัวเลขสองแถว · กรอบสูงตามเนื้อหา (issue #98)
 *
 * ผู้ใช้สั่ง 2026-10-11: "ปรับปรุงหน้าจอ UX/UI ให้สื่อความหมาย วาง layout ให้สวยงาม … ตอนนี้มีทั้งช่องไฟใหญ่/เล็กเกิน"
 * ทั้งในแท็บ Trace ของ CCRC (`&embed=1`) และเปิดเดี่ยวผ่าน customdeploy_fs_wo_cost_trace
 *
 *   1. ระยะแนวตั้งอยู่บน scale ของ CCRC — ภายในส่วน --sp-3 · ระหว่างส่วน --sp-6 · ไม่มีค่านอก scale (7px · 4px)
 *   2. หัวหน้าเรียงเหมือนกันทุกหน้าย่อย: ลิงก์กลับ → ชื่อ → คำอธิบาย → ฟอร์ม (หน้าความพร้อมเคยเอาลิงก์กลับไว้ใต้คำอธิบาย)
 *   3. การ์ดตัวเลขภาพรวม: แถวบน = จำนวนใบ + ยอดเงิน (รวมผลต่างสุทธิ) · แถวล่าง = ใบที่มีปัญหา · 5 คอลัมน์คงที่
 *   4. คำอธิบายตัวกรองย้ายไปหน้าคู่มือ (ย้าย ไม่ลบ)
 *   5. embed บอก CCRC ว่าให้กรอบสูงตามเนื้อหาได้ (meta) และตารางสูงจาก --host-h ที่ CCRC ตั้ง (fallback = 76vh เดิม)
 *
 * ขับผ่าน onRequest จริง · ข้อ CSS ตรวจสตริง <style> ที่หน้าเขียนออกมาจริง · mutation check บันทึกใน PR
 */
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ json: true });

const rsrc = require('fs').readFileSync(require('path').join(__dirname, 'test_ready_master.js'), 'utf8');
const READY_FX = eval('(function(){' + rsrc.slice(rsrc.indexOf('const BASE = {'), rsrc.indexOf('let FX = BASE;')) + '; return BASE;})()');

let FIX = FX.summary();
const { module: mod } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: () => FIX,
  quietLog: true
});
function run(params) {
  const chunks = [];
  mod.onRequest({ request: { parameters: params }, response: { write: (s) => chunks.push(String(s)), setHeader: () => {} } });
  return chunks.join('');
}
const P = { from: '2026-07-01', to: '2026-07-31' };
const ovEmbed = run(Object.assign({ embed: '1' }, P));
const ovSolo = run(Object.assign({}, P));
const css = (ovEmbed.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const has = (s) => css.indexOf(s) >= 0;

// ═══ 1. ระยะแนวตั้งบน scale ═══════════════════════════════════════════════════════════
console.log('\n── 1. ระยะแนวตั้งบน scale ของ CCRC ──');
eq('ฟอร์มทุกหน้า → บล็อกถัดไป = --sp-3', has('form{margin:0 0 var(--sp-3);padding:0}'), true);
eq('ฟอร์มภาพรวม (ส่วนตัวกรอง) → ส่วนผลลัพธ์ = --sp-6', has('form#wct-summary-form{margin-bottom:var(--sp-6)}'), true);
eq('กฎ margin ของฟอร์มภาพรวมมาหลัง #wct-summary-form{display:flex} (กฎนั้นถูกเทสอื่นอ่านตรงตัว)',
  css.indexOf('#wct-summary-form{display:flex') < css.indexOf('form#wct-summary-form{margin-bottom'), true);
eq('.rw-tablewrap ไม่มีระยะบน 4px', /\.rw-tablewrap\{[^}]*margin:0 0 var\(--sp-3\)\}/.test(css), true);
eq('h3 = --sp-4 บน · --sp-2 ล่าง', /(^|\})h3\{[^}]*margin:var\(--sp-4\) 0 var\(--sp-2\)\}/.test(css), true);
eq('.toc margin/padding บน scale', /\.toc\{[^}]*margin:0 0 var\(--sp-3\);padding:var\(--sp-2\) var\(--sp-3\)/.test(css), true);
// 7px ที่เหลือใน <style> มาจาก theme กลาง (WOReportTheme.js · ห้ามแก้) และถูกกฎของรายงานทับแล้ว — ตรวจเฉพาะกฎของ .toc
eq('.toc ไม่มีค่า 7px นอก scale', /\.toc\{[^}]*7px/.test(css), false);

// ═══ 2. ลำดับหัวหน้า ═══════════════════════════════════════════════════════════════
console.log('\n── 2. ลำดับหัวหน้า: ลิงก์กลับ → ชื่อ → คำอธิบาย → ฟอร์ม ──');
function order(html, label) {
  const body = html.slice(html.indexOf('<div class="content">'));
  const crumb = body.indexOf('<div class="crumb">');
  const title = body.indexOf('<h1');
  const sub = body.search(/<(p|div) class="sub">/);
  const form = body.indexOf('<form');
  eq(label + ' → ลิงก์กลับก่อนชื่อ', crumb >= 0 && title > crumb, true);
  eq(label + ' → ชื่อก่อนคำอธิบาย', sub > title, true);
  eq(label + ' → คำอธิบายก่อนฟอร์ม', form > sub, true);
}
FIX = READY_FX;
order(run(Object.assign({ ready: 'WOFSC00000470', embed: '1' }, P)), 'ความพร้อม (embed)');
FIX = FX.drilldown();
order(run(Object.assign({ wo: 'WOFSC00000470', embed: '1' }, P)), 'เจาะลึก (embed)');
// เปิดเดี่ยว: ชื่ออยู่ใน topbar · ลิงก์กลับยังต้องมาก่อนคำอธิบาย
FIX = READY_FX;
const readySolo = run(Object.assign({ ready: 'WOFSC00000470' }, P));
const rsBody = readySolo.slice(readySolo.indexOf('<div class="content">'));
eq('ความพร้อม (เปิดเดี่ยว) → ลิงก์กลับก่อนคำอธิบาย', rsBody.indexOf('<div class="crumb">') < rsBody.indexOf('<p class="sub">'), true);
FIX = FX.drilldown();
const drillE = run(Object.assign({ wo: 'WOFSC00000470', embed: '1' }, P));
eq('ลิงก์กลับของหน้าเจาะลึกใช้คำเดียวกับหน้าความพร้อม', drillE.indexOf('กลับภาพรวมต้นทุน</a>') >= 0, true);

// ═══ 3. การ์ดตัวเลขภาพรวม ═════════════════════════════════════════════════════════════
console.log('\n── 3. การ์ดตัวเลขภาพรวม: สองแถว 5 คอลัมน์ ──');
FIX = FX.summary();
const ov = run(Object.assign({}, P));
const at = (s) => ov.indexOf(s, ov.indexOf('<div class="kpi-grid">'));
eq('ผลต่างสุทธิ (ยอดเงิน) อยู่ใบที่ 5 ก่อน "ใบที่ Summary Cost ไม่ปิด"', at('ผลต่างสุทธิ') < at('ใบที่ Summary Cost ไม่ปิด'), true);
eq('รวมต้นทุนการผลิตมาก่อนผลต่างสุทธิ', at('รวมต้นทุนการผลิต') < at('ผลต่างสุทธิ'), true);
eq('การ์ดตัวเลขภาพรวม 10 ใบ = 5 × 2 แถวเต็ม', (ov.match(/class="kpi-card/g) || []).length, 10);
eq('กริดภาพรวม 5 คอลัมน์คงที่', has('#wct-summary-form~.kpi-grid{grid-template-columns:repeat(5,minmax(0,1fr))}'), true);
// breakpoint ของกริดภาพรวมย้ายไป 1099/1049(embed)/449 หลัง QA SB1 — ตรวจที่ test_trace_ux_qa_sb1.js
eq('กริดภาพรวมยังลงสองคอลัมน์เมื่อแคบ', has('{#wct-summary-form~.kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'), true);
eq('จอแคบ: การ์ดทั่วไปขั้นต่ำ 150px แบบ .kpis ของ CCRC', has('.kpi-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}'), true);

// ═══ 4. คำอธิบายตัวกรองอยู่หน้าคู่มือ ═══════════════════════════════════════════════════
console.log('\n── 4. คำอธิบายตัวกรองย้ายไปหน้าคู่มือ ──');
const HINT = 'แล้วช่วงวันที่ถูกเติมเป็นทั้งเดือนให้';
const formHtml = ovSolo.slice(ovSolo.indexOf('<form'), ovSolo.indexOf('</form>'));
eq('ฟอร์มภาพรวมไม่มีย่อหน้าคำอธิบายตัวกรองแล้ว', formHtml.indexOf(HINT) >= 0, false);
eq('ฟอร์มภาพรวมไม่มี style inline margin-top ที่ค้าง', /<div class="sub" style=/.test(formHtml), false);
const help = run(Object.assign({ view: 'help' }, P));
eq('หน้าคู่มือของภาพรวมมีคำอธิบายตัวกรอง', help.indexOf(HINT) >= 0, true);
eq('หน้าคู่มือบอก RM Location', help.indexOf('คลัง/ถังที่เบิกวัตถุดิบ') >= 0, true);

// ═══ 5. กรอบสูงตามเนื้อหาใน CCRC ══════════════════════════════════════════════════════
console.log('\n── 5. embed: บอก CCRC ว่าให้กรอบสูงตามเนื้อหาได้ ──');
const META = '<meta name="teibto-frame" content="autoheight">';
eq('embed มี meta autoheight ใน <head>', ovEmbed.indexOf(META) > 0 && ovEmbed.indexOf(META) < ovEmbed.indexOf('</head>'), true);
eq('เปิดเดี่ยวไม่มี meta นี้', ovSolo.indexOf(META) >= 0, false);
FIX = FX.drilldown();
eq('หน้าเจาะลึก embed มี meta', run(Object.assign({ wo: 'WOFSC00000470', embed: '1' }, P)).indexOf(META) > 0, true);
FIX = FX.summary();
eq('หน้าคู่มือ embed มี meta', run(Object.assign({ view: 'help', embed: '1' }, P)).indexOf(META) > 0, true);
eq('ตารางใน embed สูงจาก --host-h (fallback 100vh = 76vh เดิม)', has('body.is-embed .scroll{max-height:calc(var(--host-h,100vh) * .76)}'), true);
eq('เปิดเดี่ยวยังเป็น 76vh เดิม', /(^|\})\.scroll\{overflow:auto;max-height:76vh/.test(css), true);
eq('CSS ของรายงานไม่ซ่อน scrollbar ของตัวเอง (CCRC ตั้งให้ ไม่งั้น CCRC รุ่นเก่าที่กรอบสูงคงที่จะตัดหน้า)',
  /overflow-y:hidden|html\{[^}]*overflow:hidden/.test(css), false);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
