/**
 * เทส — หน้าคู่มือแยก + ปุ่ม i + style เดียวกับ CCRC (issue #96)
 *
 * ผู้ใช้สั่ง 2026-10-10 (WO Cost Trace ถูกฝังใน Costing Custom Report Center ด้วย `&embed=1`)
 *   1. ลบย่อหน้าคำอธิบายใต้หัวเรื่องหน้าภาพรวม · โหมด embed ไม่วาด h1 (CCRC แสดงชื่อรายงานเอง)
 *   2. "อ่านตารางนี้อย่างไร" + "เอกสารอ้างอิงทางเทคนิค" ย้ายไปหน้าคู่มือ (`&view=help`)
 *      หน้ารายงานเหลือปุ่มไอคอน i ที่ลิงก์ไปหน้านั้น — พา embed และตัวกรองไปด้วย
 *   3. CSS เฉพาะรายงานไม่มีค่าสี literal — สีมาจาก var(--c-*) / var(--pj-*) เท่านั้น
 *
 * เทสขับผ่าน onRequest จริง (ไม่ใช่ source scan) ยกเว้นข้อ CSS ซึ่งตรวจสตริง REPORT_CSS/READY_CSS
 * ที่ export ออกมาจริง · ทุกข้อพิสูจน์ด้วยการ mutate แล้วเทสต้องแดง (บันทึกใน PR)
 */
const fs = require('fs');
const path = require('path');
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ json: true });
const DIR = path.join(__dirname, '..', 'src', 'FileCabinet', 'SuiteScripts', 'Foodstar', 'WO_Status_tracking');

const LIBS = ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'];
const DESCRIPTION = 'ดูหลายสินค้าหลายใบสั่งผลิตพร้อมกัน แล้วกดเลขที่ใบสั่งผลิตเพื่อเจาะที่มาของทุกตัวเลข';
const DESCRIPTION_TAIL = 'ยอดในหน้านี้ใช้แหล่งข้อมูลเดียวกับหน้าเจาะลึกทุกช่อง';

let FIX = FX.summary();
const { module: mod } = H.load({
  libs: LIBS,
  fixtures: () => FIX,
  quietLog: true
});

function run(params) {
  const chunks = [];
  const headers = [];
  mod.onRequest({
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: (h) => headers.push(h) }
  });
  return { html: chunks.join(''), headers: headers };
}

/** href ของปุ่ม i (a.iconbtn) — คืน '' ถ้าไม่มี */
function helpHref(html) {
  const m = html.match(/<a class="iconbtn" href="([^"]*)"/);
  return m ? m[1].replace(/&amp;/g, '&') : '';
}
const qs = (href) => {
  const out = {};
  href.split('?')[1].split('&').forEach((kv) => {
    const i = kv.indexOf('=');
    out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
  });
  return out;
};

const BASE = { from: '2026-07-01', to: '2026-07-31', sub: '2', rmloc: '35', loc: '10', line: '3' };

// ═══ 1. หน้าภาพรวม — ไม่มีคำอธิบาย · ไม่มีสองส่วนที่ย้าย · มีปุ่ม i ═══════════════
console.log('\n── 1. หน้าภาพรวม (เปิดเดี่ยว) ──');
const solo = run(BASE).html;
eq('ไม่มีย่อหน้าคำอธิบายใต้หัวเรื่อง', solo.indexOf(DESCRIPTION) >= 0, false);
eq('ไม่มีท่อนท้ายของคำอธิบาย', solo.indexOf(DESCRIPTION_TAIL) >= 0, false);
// #96 QA ข้อ 14 — ชื่อหน้าอยู่ใน topbar เป็น h1.viewtitle แบบ CCRC (ไม่มี h1 ซ้ำใต้แถบ)
eq('เปิดเดี่ยว → ยังมี h1 ชื่อรายงาน (h1.viewtitle ใน topbar)',
  /<header class="topbar"><h1 class="viewtitle">ภาพรวมต้นทุนใบสั่งผลิต<\/h1>/.test(solo), true);
eq('เปิดเดี่ยว → มี h1 ตัวเดียว', (solo.match(/<h1[\s>]/g) || []).length, 1);
eq('ไม่มีหัวข้อ "อ่านตารางนี้อย่างไร" ในหน้ารายงาน', solo.indexOf('อ่านตารางนี้อย่างไร') >= 0, false);
eq('ไม่มีหัวข้อ "เอกสารอ้างอิงทางเทคนิค" ในหน้ารายงาน', solo.indexOf('<h2>เอกสารอ้างอิงทางเทคนิค</h2>') >= 0, false);
eq('ไม่มี query log ในหน้ารายงาน', solo.indexOf('รายละเอียดทางเทคนิค — คำสั่งดึงข้อมูล') >= 0, false);
eq('ไม่มีตาราง kv ของคู่มือในหน้ารายงาน', solo.indexOf('<table class="kv">') >= 0, false);

const soloHref = helpHref(solo);
eq('มีปุ่ม i (a.iconbtn)', soloHref.length > 0, true);
const soloBtn = (solo.match(/<a class="iconbtn"[\s\S]*?<\/a>/) || [''])[0];
eq('ปุ่ม i เป็น inline SVG 18px (--icon ของ CCRC) currentColor', /<svg width="18" height="18"[^>]*>/.test(soloBtn)
  && /stroke="currentColor"/.test(soloBtn), true);
eq('ปุ่ม i มี aria-label และ title', /aria-label="[^"]+"/.test(soloBtn) && /title="[^"]+"/.test(soloBtn), true);
eq('ปุ่ม i ไม่มีตัวอักษร i/emoji แทนไอคอน', soloBtn.replace(/<[^>]+>/g, '').trim(), '');
const soloQ = qs(soloHref);
eq('ลิงก์ i → view=help', soloQ.view, 'help');
eq('ลิงก์ i (เปิดเดี่ยว) → ไม่มี embed', 'embed' in soloQ, false);
eq('ลิงก์ i พาตัวกรองไปครบ (sub/rmloc/loc/line/from/to)',
  [soloQ.sub, soloQ.rmloc, soloQ.loc, soloQ.line, soloQ.from, soloQ.to].join('|'),
  ['2', '35', '10', '3', '2026-07-01', '2026-07-31'].join('|'));
eq('error ของ query ยังขึ้นบนหน้ารายงาน (renderErrors ยังถูกเรียก — ไม่มี error ใน fixture → ไม่มีกล่อง)',
  /ดึงข้อมูลไม่สำเร็จ/.test(solo), false);

// ═══ 2. โหมด embed — ไม่มี h1 · ลิงก์ i พา embed=1 ════════════════════════════
console.log('\n── 2. หน้าภาพรวม (embed=1) ──');
const emb = run(Object.assign({ embed: '1' }, BASE)).html;
eq('embed → ไม่มี <h1> เลย', /<h1[\s>]/.test(emb), false);
eq('embed → ไม่มีแถบหัวเรื่องของตัวเอง', emb.indexOf('class="topbar"') >= 0, false);
eq('embed → ไม่มีคำอธิบาย', emb.indexOf(DESCRIPTION) >= 0, false);
const embQ = qs(helpHref(emb));
eq('embed → ลิงก์ i มี embed=1', embQ.embed, '1');
eq('embed → ลิงก์ i มี view=help', embQ.view, 'help');
eq('embed → ลิงก์ i ยังมี rmloc/line', embQ.rmloc + '|' + embQ.line, '35|3');
// ฟอร์มค้นหายังพา embed ไป (#95 ห้ามพัง)
eq('embed → ฟอร์มค้นหายังมี hidden embed', /<input type="hidden" name="embed" value="1">/.test(emb), true);

// ═══ 3. หน้าคู่มือ — มีครบสองส่วน + log ของจริง ════════════════════════════════
console.log('\n── 3. หน้าคู่มือ (view=help) ──');
const callsBefore = H.calls.length;
const helpRes = run(Object.assign({ embed: '1', view: 'help' }, BASE));
const help = helpRes.html;
const helpCalls = H.calls.length - callsBefore;
eq('หน้าคู่มือเป็น HTML ไม่ใช่ json', helpRes.headers.length, 0);
eq('มีหัวข้อ "อ่านตารางนี้อย่างไร"', /<h2>อ่านตารางนี้อย่างไร<\/h2>/.test(help), true);
eq('มีหัวข้อ "เอกสารอ้างอิงทางเทคนิค"', /<h2>เอกสารอ้างอิงทางเทคนิค<\/h2>/.test(help), true);
// เนื้อหาเดิมของ "อ่านตารางนี้อย่างไร" ครบทุกแถว (ย้าย ไม่ใช่ลบ)
['ช่วงวันที่', 'วัตถุดิบ', 'แปรสภาพ (DL+OH)', 'ต้นทุน/หน่วย', 'ต้นทุน/ลัง', 'ผลต่าง'].forEach((k) => {
  eq('คู่มือมีแถว ' + k, help.indexOf('<tr><td>' + k + '</td>') >= 0, true);
});
eq('คู่มือคงถ้อยคำเดิม (custitem_item_basepercarton)', help.indexOf('custitem_item_basepercarton') >= 0, true);
const logCount = (help.match(/รายละเอียดทางเทคนิค — คำสั่งดึงข้อมูล (\d+) ชุด/) || [])[1];
eq('มี query log', !!logCount, true);
eq('log นับเท่าจำนวน query ที่หน้าคู่มือรันจริง', Number(logCount), helpCalls);
eq('log มี query ของรายการใบสั่งผลิต (ไม่ใช่ log ว่าง)', help.indexOf('ภาพรวม — รายการใบสั่งผลิต') >= 0, true);
eq('log มี query ของ dropdown ตัวกรอง (ชุดเดียวกับหน้ารายงาน)', help.indexOf('ตัวกรอง — RM Location') >= 0, true);
eq('หน้าคู่มือไม่วาดตารางรายงานซ้ำ', help.indexOf('id="wct-summary-form"') >= 0, false);
const backM = help.match(/<div class="crumb"><a href="([^"]*)">/);
const backQ = backM ? qs(backM[1].replace(/&amp;/g, '&')) : {};
eq('มีลิงก์กลับหน้ารายงาน', !!backM, true);
eq('ลิงก์กลับไม่มี view', 'view' in backQ, false);
eq('ลิงก์กลับยังอยู่ในโหมด embed', backQ.embed, '1');
eq('ลิงก์กลับพาตัวกรองกลับไป', backQ.rmloc + '|' + backQ.line + '|' + backQ.sub, '35|3|2');

// ═══ 4. mode=json ชนะ view=help (json เดิมไม่เปลี่ยน) ═════════════════════════
console.log('\n── 4. mode=json + view=help ──');
const js = run(Object.assign({ mode: 'json', view: 'help' }, BASE));
let parsed = null;
try { parsed = JSON.parse(js.html); } catch (e) { parsed = null; }
eq('ยังได้ JSON', !!parsed, true);
eq('JSON มี summary + qlog เหมือนเดิม', !!(parsed && parsed.summary && parsed.qlog), true);

// ═══ 5. ชั้นเจาะลึก — ปุ่ม i พา wo ไป · คู่มือของชั้นเจาะลึกมี log ═════════════
console.log('\n── 5. ชั้นเจาะลึก (wo=) ──');
FIX = FX.drilldown();
const wo = FX.WO_HEADER.wo_no;
const drill = run(Object.assign({ embed: '1', wo: wo }, BASE)).html;
eq('หน้าเจาะลึกไม่มี "เอกสารอ้างอิงทางเทคนิค"', drill.indexOf('<h2>เอกสารอ้างอิงทางเทคนิค</h2>') >= 0, false);
eq('หน้าเจาะลึกไม่มี query log', drill.indexOf('รายละเอียดทางเทคนิค — คำสั่งดึงข้อมูล') >= 0, false);
const drillQ = qs(helpHref(drill));
eq('ปุ่ม i ของหน้าเจาะลึก → view=help + wo + embed',
  [drillQ.view, drillQ.wo, drillQ.embed].join('|'), ['help', wo, '1'].join('|'));
eq('ปุ่ม i ของหน้าเจาะลึกพาตัวกรองภาพรวมไปด้วย', drillQ.rmloc, '35');
const drillHelp = run({ embed: '1', wo: wo, view: 'help' }).html;
eq('คู่มือชั้นเจาะลึกมี "เอกสารอ้างอิงทางเทคนิค"', /<h2>เอกสารอ้างอิงทางเทคนิค<\/h2>/.test(drillHelp), true);
eq('คู่มือชั้นเจาะลึกมี log ของ WO header', drillHelp.indexOf('WO header') >= 0, true);

// ═══ 6. ปุ่ม i ของชั้นความพร้อม (ผ่าน helpButton — ชั้นนี้ต้องใช้ fixture BOM ทั้งชุด) ═══
console.log('\n── 6. helpButton ของชั้นความพร้อม ──');
// โหลด lib ตรง ๆ (ท่าเดียวกับ test_audit_fixes.js) — entry ไม่ export lib ออกมา
const { module: C } = H.load({
  file: 'WOCostTrace_Common.js', dir: DIR, libs: ['WOReportTheme.js'], fixtures: FX.summary(), quietLog: true
});
C.setEmbed(true);
const readyQ = qs(helpHref(C.helpButton({ ready: 'WO-1', rloc: 'all', rdate: '2026-07-01' })));
C.setEmbed(false);
eq('ready → view=help + ready + rloc + embed',
  [readyQ.view, readyQ.ready, readyQ.rloc, readyQ.embed].join('|'), 'help|WO-1|all|1');
const readySrc = fs.readFileSync(path.join(DIR, 'WOCostTrace_Ready.js'), 'utf8');
eq('หน้าความพร้อมไม่ต่อ renderQLog ท้ายหน้าแล้ว',
  /h \+= '<h2>เอกสารอ้างอิงทางเทคนิค<\/h2>' \+ renderQLog\(\)/.test(readySrc), false);
eq('หน้าความพร้อมใช้ pageHead (มีปุ่ม i)', /const helpParams = rd\.helpParams[\s\S]{0,80}pageHead\(READY_TITLE, helpParams/.test(readySrc), true);
eq('หน้าความพร้อมส่ง helpParams ให้ shell (ปุ่ม i ใน topbar ตอนเปิดเดี่ยว)',
  /shell\(READY_TITLE, body, READY_CSS, helpParams\)/.test(readySrc), true);
const allSrc = ['WOCostTrace.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js']
  .map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
eq('ไม่มีข้อความชี้ "ท้ายหน้า" ที่ไม่มีแล้วหลงเหลือในโค้ด (ไม่นับคอมเมนต์)',
  allSrc.split('\n').filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln)).join('\n').indexOf('ดูท้ายหน้า') >= 0
  || /ดูรายละเอียดท้ายหน้า|ดูสาเหตุที่ท้ายหน้า/.test(allSrc), false);

// ═══ 7. ไม่มีสี literal ใหม่ใน CSS เฉพาะรายงาน ══════════════════════════════════
console.log('\n── 7. CSS เฉพาะ WO Cost Trace ไม่มีค่าสี literal ──');
const { module: R } = H.load({
  file: 'WOCostTrace_Ready.js', dir: DIR, libs: ['WOReportTheme.js', 'WOCostTrace_Common.js'],
  fixtures: FX.summary(), quietLog: true
});
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;
[['REPORT_CSS', C.REPORT_CSS], ['READY_CSS', R.READY_CSS]].forEach(([name, css]) => {
  // data: URI ของ svg ใน theme กลางไม่อยู่ในสตริงนี้ (อยู่ใน COMPONENTS ของ WOReportTheme.js)
  const hits = css.match(LITERAL) || [];
  if (hits.length) console.log('     ' + name + ' เจอ: ' + hits.join(' '));
  eq(name + ' ไม่มี hex/rgb()/hsl()', hits.join(' '), '');
  // ทุก property สีต้องเป็น var(...) หรือคีย์เวิร์ดที่ไม่ใช่สี
  const colorDecls = css.match(/(?:^|[;{])\s*(?:color|background(?:-color)?|border(?:-[a-z]+)?-color)\s*:\s*[^;}]+/g) || [];
  const bad = colorDecls.map((d) => d.replace(/^[;{]\s*/, ''))
    .filter((d) => !/:\s*(var\(--(?:c|pj)-[a-z0-9-]+\)|none|transparent|inherit|currentColor)\s*(!important)?\s*$/.test(d));
  if (bad.length) console.log('     ' + name + ' สีที่ไม่ใช่ token: ' + bad.join(' | '));
  eq(name + ' ทุก color/background(-color)/border-*-color เป็น var(--c-*|--pj-*)', bad.join(' | '), '');
});
eq('REPORT_CSS ใช้ token ของ CCRC (--btn-h · --focus-ring · --c-surface-3)',
  ['var(--btn-h)', 'var(--focus-ring)', 'var(--c-surface-3)'].every((t) => C.REPORT_CSS.indexOf(t) >= 0), true);
eq('--focus-ring อ้าง var(--c-text) ไม่ใช่ hex', /--focus-ring:0 0 0 2px var\(--c-text\)/.test(C.REPORT_CSS), true);
// height:32px ของ select ต้องไม่ไปบีบ <select multiple size=6> ของชั้นความพร้อมให้เหลือแถวเดียว
eq('select[multiple] คืนความสูงเป็น auto', /select\[multiple\]\{height:auto/.test(C.REPORT_CSS), true);
// hover ต้องไม่ทับสีแถวรวม (tr.tot/.grand/.sub)
eq('hover ของแถวยกเว้นแถวรวม', /tbody tr:not\(\.tot\):not\(\.grand\):not\(\.sub\):hover td/.test(C.REPORT_CSS)
  && !/(^|\})tbody tr:hover td\{/.test(C.REPORT_CSS), true);
eq('ปุ่ม Export Excel ใช้ไอคอน svg ไม่ใช่ตัวอักษร ⬇', solo.indexOf('⬇') >= 0, false);

// ═══ 8. WO Status ไม่ได้รับ CSS ชุด CCRC (theme กลางแก้แบบเพิ่มของเท่านั้น) ═════
console.log('\n── 8. WO Status Tracking ไม่เปลี่ยนหน้าตา ──');
const { module: statusMod } = H.load({
  file: 'WOStatusTracking.js',
  libs: ['WOReportTheme.js', 'WOStatusTracking_Labels.js', 'WOStatusTracking_Queries.js',
    'WOStatusTracking_Drilldown.js'],
  requireRunSQL: false,
  sqlRows: () => [],
  quietLog: true,
});
const sChunks = [];
statusMod.onRequest({
  request: { parameters: {} },
  response: { write: (s) => sChunks.push(String(s)), setHeader: () => {} },
});
const statusPage = sChunks.join('');
eq('WO Status ไม่มี token ชุด CCRC (--btn-h)', statusPage.indexOf('--btn-h:') >= 0, false);
eq('WO Status ไม่มีปุ่ม i', statusPage.indexOf('class="iconbtn"') >= 0, false);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
