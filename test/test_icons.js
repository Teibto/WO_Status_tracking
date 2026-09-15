/**
 * เทส — ไอคอนสถานะต้องเป็น inline SVG ตามมาตรฐาน Teibto Redwood ไม่ใช่ตัวอักษร (#64 ขั้น 2)
 * + ไอคอนที่สื่อความหมายต้องมี accessible name ให้ screen reader (#64 ขั้น 2b — a11y regression
 * ที่ขั้น 2 สร้างเอง: svg ทุกตัวเดิมเป็น aria-hidden ล้วน ทำให้ pill/note-icon ที่ไม่มีข้อความ
 * อื่นบอกความหมายกลายเป็น "เงียบ" ทั้งที่ตัวอักษร ✓/◷/✕/⚠ เดิมยังอ่านออกเสียงได้)
 *
 * ก่อนหน้านี้ ✓ ◷ ✕ ⚠ ↗ ถูกใช้เป็นไอคอนตรง ๆ กระจายอยู่หลายจุด (STATUS_ICONS/S/SYM/READY_ICON
 * legend และ note-icon ของทั้งสองแอป) — ขั้นนี้รวมมาเป็น `theme.ICONS` แหล่งเดียวใน
 * shared/WOReportTheme.js แล้วให้ทุกจุดอ้างจากที่นั่น (ดูหัวไฟล์ ICONS ที่นั่นสำหรับกติกา)
 *
 * เทสนี้ตรวจสี่ชั้นตั้งใจให้ทับซ้อนกันบางส่วน (กันแก้ไม่ครบ):
 *   1. source guard — สแกน src/ ของทั้งสองแอป (ไม่รวมคอมเมนต์ เหมือนวิธีของ test_theme.js
 *      ข้อ 2) ต้องไม่มี ✓ ◷ ✕ ⚠ ↗ เหลืออยู่ใน**โค้ด** เลย ไม่ว่าจะอยู่ในไฟล์ไหน — จับได้ทุกจุด
 *      รวมถึงจุดที่ไม่มี test render ปิดอยู่ (เช่น _Drilldown.js, _Ready.js)
 *   2. theme.ICONS + theme.iconImg — แหล่งเดียวมี svg ครบตามสเปก และมีฟังก์ชันห่อ accessible
 *      name ให้เรียกใช้ (ไม่ต้องให้แต่ละไฟล์คิด markup role="img" เอง)
 *   3. ปักหมุดว่า "–" (na/info) ยังเป็นข้อความ ไม่ใช่ svg — เป็นการตัดสินใจ ไม่ใช่ความบังเอิญ
 *   4. rendered-output — เรียก Suitelet จริงผ่าน harness แล้วเช็ค HTML ที่ได้ ไม่ใช่ source
 *      (พิสูจน์ว่าของที่ผู้ใช้เห็นจริงเป็น svg + มีชื่อจริง ไม่ใช่แค่โค้ดหน้าตาดี) — ครอบคลุม
 *      legend/grid/note ของ wo-status ที่นี่ · ของ wo-cost-trace (unitCell warn + tranLink
 *      extLink) มี rendered-output test อยู่แล้วที่ apps/wo-cost-trace/test/test_summary_math.js
 *
 * `–` (en-dash ของสถานะ "ไม่มี/ยังไม่ถึง" — key `na`/`info`) **ไม่ถูกแบน** โดยตั้งใจ: มันเป็น
 * เครื่องหมายวรรคตอนธรรมดาที่ใช้พิมพ์ range ทั่วทั้ง repo (`CP1–CP8`, `start–end`) ไม่ใช่ตัวอักษร
 * เลียนแบบไอคอนแบบ ✓/✕/◷/⚠ — แบนทั้งตัวจะ false-positive รัว ๆ · เทสนี้จึง "ปักหมุด" ว่า
 * ยังคงเป็นข้อความ (ข้อ 3) แทนการห้าม เพื่อให้เห็นถ้ามีคนเปลี่ยนโดยไม่ตั้งใจ
 *
 * meaningful vs decorative (#64 ขั้น 2b): ไอคอนที่**มีข้อความอื่นบอกความหมายซ้ำอยู่ข้างๆ อยู่แล้ว**
 * (legend — มี t.legend[i] ติดข้าง · audit "✓ ตรง" ของ WOCostTrace.js — มีคำ "ตรง" ต่อท้าย ·
 * tranLink ↗ — มี label บอกปลายทางอยู่ในลิงก์เดียวกัน) ปล่อยเป็น aria-hidden ตามเดิม ห่อซ้ำจะ
 * กลายเป็นอ่านสองรอบ · ไอคอนที่**ไม่มีข้อความอื่นบอกความหมายเลย** (pill, note-icon, READY_ICON,
 * unitCell warn) ต้องห่อด้วย `theme.iconImg()`/`C.iconImg()` เสมอ — เทสข้อ 4 พิสูจน์การแบ่งนี้
 * ด้วยการอ่าน HTML จริงทั้งสองแบบ ไม่ใช่แค่เชื่อคอมเมนต์ในซอร์ส
 */
const fs = require('fs');
const path = require('path');
const H = require('./lib/_harness');

const eq = H.makeEq({ json: true });

const BAD_GLYPHS = ['✓', '✕', '◷', '⚠', '↗'];

// ── 1. source guard — ทุกไฟล์ .js ใต้ src/ ของทั้งสองแอป ──────────────────────
console.log('── source guard: ไม่มี ✓ ◷ ✕ ⚠ ↗ เหลือในโค้ด (ไม่รวมคอมเมนต์) ──');
Object.keys(H.APP_DIRS).sort().forEach((app) => {
  const dir = H.APP_DIRS[app];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    // เอาบรรทัดที่เป็นคอมเมนต์ล้วนออกก่อน (เหมือน test_theme.js ข้อ 2) — comment ของ repo นี้
    // เป็นบรรทัดคอมเมนต์เต็มบรรทัดเสมอ (ไม่มี code; // ... ท้ายบรรทัดที่มี glyph พวกนี้)
    const codeOnly = src.split('\n')
      .filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln))
      .join('\n');
    const found = BAD_GLYPHS.filter((g) => codeOnly.indexOf(g) >= 0);
    if (found.length) console.log('     ' + app + '/' + f + ' เหลือ: ' + found.join(' '));
    eq(app + '/' + f + ' ไม่มีไอคอนตัวอักษรเหลือในโค้ด', found.join(' '), '');
  });
});

// ── 2. theme.ICONS — แหล่งเดียว มี svg ครบ ตามสเปก 16px/viewBox/currentColor ────
console.log('\n── shared/WOReportTheme.js: theme.ICONS ตามสเปก Redwood ──');
const themeSrc = fs.readFileSync(path.join(__dirname, '../shared/WOReportTheme.js'), 'utf8');
const iconMatch = themeSrc.match(/var ICONS = \{[\s\S]*?\n  \};/);
eq('เจอ ICONS block ใน shared/WOReportTheme.js', !!iconMatch, true);
const iconBlock = iconMatch ? iconMatch[0] : '';
['check', 'cross', 'clock', 'warn', 'help', 'extLink'].forEach((name) => {
  eq('ICONS มี ' + name, new RegExp('\\b' + name + ':').test(iconBlock), true);
});
const svgTags = iconBlock.match(/<svg[^>]*>/g) || [];
eq('มี <svg> ครบ 6 ตัว', svgTags.length, 6);
eq('ทุก <svg> เป็น viewBox 0 0 16 16', svgTags.every((s) => s.indexOf('viewBox="0 0 16 16"') >= 0), true);
eq('ทุก <svg> มี width/height=16', svgTags.every((s) => /width="16"/.test(s) && /height="16"/.test(s)), true);
eq('ทุก <svg> aria-hidden + focusable=false', svgTags.every((s) => /aria-hidden="true"/.test(s) && /focusable="false"/.test(s)), true);
eq('ไม่มี fill สีจริงในไอคอน (fill=none เท่านั้น หรือไม่ระบุ fill นอก none)', /fill="(?!none)[^"]/.test(iconBlock), false);
eq('ไม่มี hex สีในบล็อกไอคอน (ต้องพึ่ง currentColor ทั้งหมด)',
  (iconBlock.match(/#[0-9a-fA-F]{3,6}\b/g) || []).join(' '), '');

// iconImg() — ฟังก์ชันห่อ accessible name แหล่งเดียว (#64 ขั้น 2b)
eq('เจอ function iconImg ใน shared/WOReportTheme.js',
  /function iconImg\(name, escapedLabel\)/.test(themeSrc), true);
eq('iconImg export ออกไป', /iconImg:\s*iconImg,/.test(themeSrc), true);
eq('iconImg สร้าง role="img" + aria-label',
  /role="img" aria-label="' \+ escapedLabel \+ '"/.test(themeSrc), true);

// จุดที่ต้องเรียก iconImg() จริง (ไอคอนที่ไม่มีข้อความอื่นบอกความหมายซ้ำ — ดูเหตุผลหัวไฟล์)
console.log('\n── จุดที่เป็น "ไอคอนสื่อความหมาย" ต้องเรียก theme.iconImg()/C.iconImg() ──');
const woStatusSrc = fs.readFileSync(path.join(H.APP_DIRS['wo-status'], 'WOStatusTracking.js'), 'utf8');
const drilldownSrc = fs.readFileSync(path.join(H.APP_DIRS['wo-status'], 'WOStatusTracking_Drilldown.js'), 'utf8');
const costTraceSrc = fs.readFileSync(path.join(H.APP_DIRS['wo-cost-trace'], 'WOCostTrace.js'), 'utf8');
const readySrc = fs.readFileSync(path.join(H.APP_DIRS['wo-cost-trace'], 'WOCostTrace_Ready.js'), 'utf8');
eq('WOStatusTracking.js: pill (S) ใช้ theme.iconImg', (woStatusSrc.match(/theme\.iconImg\(/g) || []).length >= 4, true);
eq('WOStatusTracking_Drilldown.js: cpCell + note ใช้ theme.iconImg',
  (drilldownSrc.match(/theme\.iconImg\(/g) || []).length >= 3, true);
eq('WOCostTrace.js: unitCell warn ใช้ theme.iconImg', /theme\.iconImg\('warn'/.test(costTraceSrc), true);
eq('WOCostTrace_Ready.js: READY_ICON ใช้ C.iconImg ครบ 4 สถานะ (ok/bad/warn/unk)',
  (readySrc.match(/C\.iconImg\(/g) || []).length >= 4, true);

// ── 3. ปักหมุดว่า "–" (na/info) ยังเป็นข้อความ ไม่ใช่ svg — เป็นการตัดสินใจ ไม่ใช่ความบังเอิญ ──
console.log('\n── "–" (na/info) ยังตั้งใจเป็นข้อความ ไม่ใช่ svg (ตัดสินใจของ #64 ขั้น 2) ──');
eq('WOStatusTracking.js: na ยังเป็น "–" ข้อความ', /na:\s*'–'/.test(woStatusSrc), true);
eq('WOStatusTracking_Drilldown.js: NA ยังเป็น "–" ข้อความ', /NA\s*=\s*'–'/.test(drilldownSrc), true);
eq('WOCostTrace_Ready.js: info ยังเป็น "–" ข้อความ', /info:\s*'–'/.test(readySrc), true);

// ── 4. rendered-output ของ wo-status — legend + grid ต้องออกมาเป็น svg จริง ────
console.log('\n── rendered-output: WOStatusTracking.js (legend + grid pill) ──');
const WO_ROWS = [{
  woid: '1001', wo_number: 'WOFSC00001001', item_id: '9', item_code: 'X',
  item_displayname: 'X', item_name: 'X', qty: 1, unit_name: 'KG',
  wo_date: '2026-09-02', location_id: '10', location_name: 'PD_B1',
  line_name: 'A', approval_status: '1', approval_status_name: 'Approved', back_order_qty: 0,
}];
function sqlRows(sql) {
  if (/FROM subsidiary/i.test(sql)) return [{ id: '2', name: 'Foodstar Co., Ltd.' }];
  if (/FROM location WHERE custrecord_mfg_productionplant/i.test(sql)) return [];
  if (/cseg_subitemtype/.test(sql)) return [];
  if (/AS wo_number/.test(sql)) return WO_ROWS; // CP1 — ให้มีแถวจริง กระตุ้น legend/grid ให้ render
  return []; // checkpoint queries อื่น ๆ — ไม่สนใจสถานะที่ได้ (na ทุกตัว) แค่ต้องการให้มีแถว
}
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
function run(params) {
  const chunks = [];
  mod.onRequest({
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: () => {} },
  });
  return chunks.join('');
}
const html = run({ action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026' });
eq('มีผลลัพธ์จริง (ไม่ใช่หน้า error/ว่าง)', /class="legend"/.test(html), true);
eq('legend/grid มี inline svg (viewBox 0 0 16 16)', (html.match(/viewBox="0 0 16 16"/g) || []).length > 0, true);
BAD_GLYPHS.forEach((g) => {
  eq('หน้าผลลัพธ์ไม่มี "' + g + '" เป็นเนื้อ HTML เหลืออยู่ (ล้อมด้วย > <)',
    new RegExp('>' + g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<').test(html), false);
});
// STATUS_ICONS ฝั่ง client (dead code — ดูหมายเหตุใน WOStatusTracking.js) ถูกฝังผ่าน
// JSON.stringify() เข้า <script> จึงมี `"` เป็น `\"` ในเนื้อ HTML ดิบ — ยอมทั้งสองแบบ
eq('ทุก <svg> ในหน้ามี aria-hidden ครบ (ไม่มีตัวไหนหลุด text)',
  (html.match(/<svg[^>]*>/g) || []).every((s) => /aria-hidden=\\?"true\\?"/.test(s)), true);

// ── 5. accessible name — ไอคอนสื่อความหมายต้องมีชื่อจริงในหน้า HTML (a11y regression #64 ขั้น 2b) ──
console.log('\n── accessible name: pill/note-icon มี role="img" aria-label · legend ไม่มี (decorative) ──');
const legendBlock = (html.match(/<div class="legend"[^>]*>[\s\S]*?<\/div>/) || [''])[0];
eq('เจอ legend block', legendBlock.length > 0, true);
eq('legend-icon ไม่มี role="img" (decorative จริง — มี t.legend[i] ติดข้างอยู่แล้ว ห่อซ้ำจะอ่านสองรอบ)',
  legendBlock.indexOf('role="img"') >= 0, false);
eq('legend-icon ยังมี svg aria-hidden ตามเดิม (ไม่ได้หายไปเฉยๆ)',
  (legendBlock.match(/<svg[^>]*aria-hidden="true"[^>]*>/g) || []).length, 3);

const pillMatches = html.match(/<span class="pill [a-z]+">[\s\S]*?<\/span>\s*<\/td>/g) || [];
eq('เจอ pill อย่างน้อย 1 ช่อง', pillMatches.length > 0, true);
const meaningfulPills = pillMatches.filter((p) => p.indexOf('class="pill na"') < 0);
eq('เจอ pill ที่ไม่ใช่ na อย่างน้อย 1 ช่อง (มีสถานะให้ตรวจ role="img")', meaningfulPills.length > 0, true);
eq('pill ที่ไม่ใช่ na ทุกช่องมี role="img" + aria-label ที่ไม่ว่าง',
  meaningfulPills.every((p) => /role="img" aria-label="[^"]+"/.test(p)), true);
const naPills = pillMatches.filter((p) => p.indexOf('class="pill na"') >= 0);
eq('pill na ยังเป็น "–" ข้อความล้วน ไม่ห่อ role="img" (ตรงกับตัดสินใจข้อ 3)',
  naPills.length > 0 && naPills.every((p) => p.indexOf('>–</span>') >= 0 && p.indexOf('role="img"') < 0), true);

const noteMatches = html.match(/<span class="note-icon[^"]*" data-tip="[^"]*">[\s\S]*?<\/span>/g) || [];
if (noteMatches.length) {
  eq('note-icon ทุกอันมี role="img" + aria-label ที่ตรงกับ data-tip (ใช้ข้อความเดียวกัน ไม่ตั้งคำใหม่)',
    noteMatches.every((n) => {
      const tip = (n.match(/data-tip="([^"]*)"/) || [])[1];
      const label = (n.match(/role="img" aria-label="([^"]*)"/) || [])[1];
      return tip && label && tip === label;
    }), true);
} else {
  console.log('     (ไม่มี note-icon ในหน้านี้ — fixture ไม่ได้กระตุ้นให้มี worst-status note ก็ข้ามส่วนนี้)');
}

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
