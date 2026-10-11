/**
 * เทส — finding จาก QA บน SB1 รอบหลัง deploy ของ issue #98 (2026-10-11)
 *
 *   2. การ์ดภาพรวม 10 ใบ 5 คอลัมน์ตายตัวถึง 641px → ตัวเลขล้นการ์ดที่กรอบ ~641–1023 (กรณีจริง: CCRC จอ laptop
 *      ที่ sidebar เปิด กรอบ ~730) · แก้: 5 → 2 → 1 คอลัมน์ ตามความกว้างที่ค่ายาว 15 อักขระยังพอดี
 *   3. การ์ดหน้าความพร้อม auto-fit ใน embed จอกว้างเป็น 8+1 → คลาสบอกจำนวนใบ แล้วจัดคอลัมน์ให้เต็มแถว
 *   4. ฟอร์มหน้าความพร้อมเว้นแถว 32px (.brk สูง 0 เป็นแถว flex ของตัวเอง ได้ gap สองครั้ง) → 12
 *   5. ป้ายที่ไม่สื่อความหมายกับผู้ใช้ (ศัพท์ระบบ · เลข issue · internal id) — ตรวจข้อความที่ "มองเห็น"
 *      ของทุกหน้าที่ผู้ใช้เปิด (ภาพรวม · เจาะลึก · ความพร้อมทั้งสองทางเข้า) · หน้าคู่มือมีเอกสารอ้างอิงทางเทคนิค
 *      โดยตั้งใจ (#96) จึงไม่อยู่ในขอบเขตของข้อนี้
 *
 * ผลวัดจริงด้วย Chrome headless (ความกว้าง 1920/1366/1100/1099/1088/1050/1049/1024/900/800/730/640/450/449/410/400
 * ทั้งเปิดเดี่ยวและ embed) บันทึกใน PR — เทสนี้ล็อกกฎ CSS และ markup ที่ผลวัดนั้นขึ้นอยู่ด้วย
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
const styles = (html) => (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('');
/** ข้อความที่ผู้ใช้มองเห็น — ตัด style/script/tag (attribute อย่าง title หายไปพร้อม tag) */
const visible = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<script>[\s\S]*?<\/script>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ');

FIX = FX.summary();
const ov = run(Object.assign({}, P));
const css = styles(ov);
const has = (s) => css.indexOf(s) >= 0;

// ═══ 2. การ์ดภาพรวม 5 → 2 → 1 คอลัมน์ ═════════════════════════════════════════════════
console.log('\n── 2. การ์ดภาพรวม: 5 → 2 → 1 คอลัมน์ ไม่ล้น ไม่มีใบกำพร้า ──');
eq('ค่าเริ่มต้น 5 คอลัมน์', has('#wct-summary-form~.kpi-grid{grid-template-columns:repeat(5,minmax(0,1fr))}'), true);
eq('เปิดเดี่ยว ≤1099px → 2 คอลัมน์ (กริด = จอ − 48 ต้อง ≥1043 สำหรับค่า 15 อักขระ)',
  has('@media (max-width:1099px){#wct-summary-form~.kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'), true);
eq('embed ≥1050px ยัง 5 คอลัมน์ (กรอบ CCRC จอ 1366 ที่ sidebar เปิด ~1088)',
  has('@media (min-width:1050px){body.is-embed #wct-summary-form~.kpi-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}'), true);
eq('embed 970–1049px (จอ laptop ใน CCRC) ยัง 5 คอลัมน์ + ตัวเลข --t-lg',
  has('@media (min-width:970px) and (max-width:1049px){body.is-embed #wct-summary-form~.kpi-grid{grid-template-columns:repeat(5,minmax(0,1fr))}'
    + 'body.is-embed #wct-summary-form~.kpi-grid .kpi-value{font-size:var(--t-lg)}}'), true);
eq('เปิดเดี่ยว 1020–1099px ยัง 5 คอลัมน์ + ตัวเลข --t-lg',
  has('@media (min-width:1020px) and (max-width:1099px){body:not(.is-embed) #wct-summary-form~.kpi-grid{grid-template-columns:repeat(5,minmax(0,1fr))}'
    + 'body:not(.is-embed) #wct-summary-form~.kpi-grid .kpi-value{font-size:var(--t-lg)}}'), true);
eq('กฎช่วง laptop มาหลังกฎ 2 คอลัมน์ (ชนะตามลำดับ)',
  css.indexOf('@media (min-width:970px) and (max-width:1049px)') > css.indexOf('@media (max-width:1099px){#wct'), true);
eq('≤449px → 1 คอลัมน์', has('@media (max-width:449px){#wct-summary-form~.kpi-grid{grid-template-columns:minmax(0,1fr)}}'), true);
eq('ไม่มีกฎ 5 คอลัมน์ถึง 641px แบบเดิมแล้ว',
  has('@media (max-width:640px){#wct-summary-form~.kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'), false);
eq('กฎ 1 คอลัมน์มาหลังกฎ 2 คอลัมน์ (specificity เท่ากัน ลำดับตัดสิน)',
  css.indexOf('@media (max-width:1099px){#wct') < css.indexOf('@media (max-width:449px){#wct'), true);
eq('ค่าที่ยาวเกินที่เผื่อไว้ตัดบรรทัดในการ์ด ไม่ล้นออกนอกการ์ด', /\.kpi-value\{[^}]*overflow-wrap:anywhere/.test(css), true);
eq('ภาพรวมยัง 10 ใบ (5/2/1 คอลัมน์เต็มแถวทุกแบบ)', (ov.match(/class="kpi-card/g) || []).length, 10);

// ═══ 3. การ์ดหน้าความพร้อมเต็มแถว ════════════════════════════════════════════════════
console.log('\n── 3. การ์ดหน้าความพร้อม: คลาสบอกจำนวนใบ · คอลัมน์หารลงตัว ──');
function readyCards(html) {
  const at = html.indexOf('<div class="kpi-grid');
  const cls = (html.slice(at).match(/^<div class="([^"]*)"/) || [])[1] || '';
  const end = html.indexOf('<div class="card', at);
  return { cls: cls, n: (html.slice(at, end).match(/class="kpi-card/g) || []).length };
}
FIX = READY_FX;
const readyWo = run(Object.assign({ ready: 'WO-FSC-00000392', embed: '1' }, P));
const rc = readyCards(readyWo);
eq('ทางเข้าด้วยเลขที่ใบสั่งผลิต (มีส่วนความพร้อม stock) = 9 ใบ', rc.n, 9);
eq('คลาส kpi-n9', rc.cls, 'kpi-grid kpi-n9');
FIX = Object.assign({}, READY_FX, {
  'WO header': [],
  'สินค้าจากรหัส': [{ item_id: 501, item_code: '10010900101', item_name: 'FG ส้ม 300 มล.',
    item_type: 'Assembly', item_inactive: 'F', stock_unit_id: 40, stock_unit_name: 'BOTTLE' }]
});
const readyItem = run(Object.assign({ ready: '10010900101', rloc: '10,23' }, P));
const ri = readyCards(readyItem);
eq('ทางเข้าด้วยรหัสสินค้า (ไม่มีส่วนความพร้อม stock) = 8 ใบ', ri.n, 8);
eq('คลาส kpi-n8', ri.cls, 'kpi-grid kpi-n8');
const rcss = styles(readyWo);
const rhas = (s) => rcss.indexOf(s) >= 0;
eq('9 ใบ = 3 × 3', rhas('.kpi-grid.kpi-n9{grid-template-columns:repeat(3,minmax(0,1fr))}'), true);
eq('8 ใบ = 4 × 2', rhas('.kpi-grid.kpi-n8{grid-template-columns:repeat(4,minmax(0,1fr))}'), true);
eq('8 ใบ ≤640 = 2 × 4', rhas('@media (max-width:640px){.kpi-grid.kpi-n8{grid-template-columns:repeat(2,minmax(0,1fr))}}'), true);
eq('9 ใบ ≤449 = 1 คอลัมน์', rhas('@media (max-width:449px){.kpi-grid.kpi-n9{grid-template-columns:minmax(0,1fr)}}'), true);
eq('กฎของหน้าความพร้อมอยู่ใน READY_CSS ไม่ใช่ CSS กลาง (หน้าภาพรวมไม่ได้รับ)', has('.kpi-grid.kpi-n9'), false);

// ═══ 4. ระยะแถวฟอร์มหน้าความพร้อม = 12 ═══════════════════════════════════════════════
console.log('\n── 4. ฟอร์มหน้าความพร้อม: ระยะแถว --sp-3 ──');
eq('row-gap ของแถบตัวกรอง = 0 (แถว .brk สูง 0 จะไม่ได้ gap สองครั้ง)', rhas('.filterbar{row-gap:0}'), true);
eq('ระยะแถวมาจาก margin ล่างของช่อง = --sp-3 (ยกเว้น .brk)', rhas('.filterbar>:not(.brk){margin-bottom:var(--sp-3)}'), true);
eq('ข้อความใต้ฟอร์มไม่มีระยะบนของตัวเองซ้อนอีก', readyWo.indexOf('<div class="sub" style="margin:0">') >= 0, true);
eq('ฟอร์มยังบังคับขึ้นแถวด้วย .brk เหมือนเดิม', readyWo.indexOf('<div class="brk"></div>') >= 0, true);
eq('ฟอร์มภาพรวม (CSS กลาง) ไม่ถูกกฎนี้แตะ', has('.filterbar{row-gap:0}'), false);

// ═══ 5. ป้ายที่ผู้ใช้เห็นเป็นภาษาธุรกิจ ════════════════════════════════════════════════
console.log('\n── 5. ไม่มีศัพท์ระบบ · เลข issue · internal id บนหน้าจอ ──');
FIX = FX.drilldown();
const drill = run(Object.assign({ wo: 'WOFSC00000470' }, P));
const PAGES = [
  ['ภาพรวม', ov], ['เจาะลึก', drill], ['ความพร้อม (เลขที่ใบสั่งผลิต)', readyWo], ['ความพร้อม (รหัสสินค้า)', readyItem]
];
const BAD = [
  ['เลข issue (#nn)', /\(#\d+\)/], ['คำว่า query', /query/i], ['ชิป id ตามด้วยเลข', /(^|\s)id \d/],
  ['ป้าย (id)', /\(id\)/], ['ชื่อฟิลด์ WOC.xxx', /WOC\.[a-z]/]
];
PAGES.forEach(([name, html]) => {
  const v = visible(html);
  BAD.forEach(([what, re]) => eq(name + ' — ไม่มี' + what, re.test(v), false));
});
eq('การ์ด "ตรวจไม่ได้" ไม่มีวงเล็บศัพท์ระบบ', readyWo.indexOf('<div class="kpi-label">ตรวจไม่ได้</div>') >= 0, true);
eq('หัวข้อความพร้อม stock ไม่มีเลข issue', readyWo.indexOf('<h2>ความพร้อม stock — วันรับเข้าเทียบวันปิดงาน</h2>') >= 0, true);
// id ยังอยู่ใน tooltip ไว้ไล่ปัญหา — ไม่ได้ลบทิ้ง
eq('เลขใบสั่งผลิตมี tooltip รหัสภายใน', readyWo.indexOf('title="รหัสภายใน NetSuite: 191254"') >= 0, true);
eq('หัวหน้าเจาะลึก: เลขใบสั่งผลิตมี tooltip รหัสภายใน', /title="รหัสภายใน NetSuite: \d+"/.test(drill), true);
eq('แถวบริษัทเป็นชื่อ ไม่ใช่เลข', /<td>บริษัท<\/td><td><span title="รหัสภายใน NetSuite: 2">บริษัททดสอบ<\/span>/.test(readyWo), true);
FIX = Object.assign({}, READY_FX, { 'ตัวกรอง — บริษัท': [] });
const readyNoSub = run(Object.assign({ ready: 'WO-FSC-00000392' }, P));
eq('หาชื่อบริษัทไม่เจอ = บอกเป็นคำ ไม่โชว์เลข', readyNoSub.indexOf('>บริษัทของใบสั่งผลิตนี้</span>') >= 0, true);
eq('ทางเข้าด้วยรหัสสินค้ายังบอกว่าไม่จำกัดบริษัท', readyItem.indexOf('ไม่จำกัด (ไม่มีเอกสารให้อ่าน)') >= 0, true);

// ข้อความเตือนเลขที่กำกวม (สถานะที่ fixture ปกติไม่ผ่าน) — เคยบอกให้ "ใช้ internal id"
const WO_ROW = READY_FX['WO header'][0];
FIX = Object.assign({}, READY_FX, { 'WO header': [WO_ROW, Object.assign({}, WO_ROW, { wo_id: 191299, wo_no: 'WOF-SC-00000392' })] });
const readyAmb = run(Object.assign({ ready: 'WO-FSC-00000392' }, P));
eq('ความพร้อม: เลขที่กำกวมยังเตือนอยู่', readyAmb.indexOf('ตรงกับใบสั่งผลิต 2 ใบ') >= 0, true);
eq('ความพร้อม: คำเตือนไม่บอกให้ใช้ internal id', /internal id/i.test(visible(readyAmb)), false);
eq('ความพร้อม: บอกวิธีเปิดใบที่ต้องการเป็นภาษาธุรกิจ', readyAmb.indexOf('พิมพ์เลขที่ให้ตรงทุกตัวอักษร (รวมขีดคั่น)') >= 0, true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
