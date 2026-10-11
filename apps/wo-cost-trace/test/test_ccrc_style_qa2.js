/**
 * เทส — ผล QA สไตล์ CCRC รอบสอง (issue #96 · PR #97 · ผู้ใช้ตัดสิน 2026-10-11)
 *
 *   A  embed: กล่องชั้นบนสุดไม่มีเส้นซ้าย/ขวาและมุมโค้ง (ไม่เกิดเส้นคู่กับ .appframe ของ CCRC) · ระยะบน --sp-2
 *   B  หน้าภาพรวม: แถวปุ่ม .act อยู่เหนือช่องตัวกรอง → popup (ปฏิทิน · คอมโบบ็อกซ์) เปิดลงล่างเต็มความสูง
 *      ไม่ทับปุ่ม · ปฏิทินหลบ "ตัวปุ่มจริง" ไม่ใช่กรอบทั้งแถว · เอนจินคอมโบบ็อกซ์ไม่ถูกแตะ (test_listfield_sync)
 *   C  .tag = หน้าตา .badge ของ CCRC (สูง 20 · padding 0 6px · inline-flex)
 *   D  หน้าเจาะลึกแบน — ไม่มีแถบซ้าย 3px ที่ .lvl2/.lvl3 · บอกชั้นด้วยป้าย "ชั้นที่ 2/3" ในหัวพับ
 *   E  ลิงก์เจาะลึก↔ความพร้อมพาตัวกรองครบ → "กลับภาพรวม" ได้ตัวกรองเดิม
 *   F  วง focus ของหัวพับที่กางอยู่ = มุม --r-md
 * เรขาคณิตจริงของ A/B วัดด้วย headless Chrome อีกชั้น (ผลอยู่ในคอมเมนต์ PR #97) — เทสนี้ล็อกกฎ/ตรรกะ
 */
const fs = require('fs');
const path = require('path');
const H = require('../../../test/lib/_harness');
const FXP = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ json: true });

const rsrc = fs.readFileSync(path.join(__dirname, 'test_ready_master.js'), 'utf8');
const ra = rsrc.indexOf('const BASE = {');
const rb = rsrc.indexOf('let FX = BASE;');
if (ra < 0 || rb < ra) throw new Error('หา fixture BASE ใน test_ready_master.js ไม่เจอ');
const READY_FX = eval('(function(){' + rsrc.slice(ra, rb) + '; return BASE;})()');

const { module: C } = H.load({
  file: 'WOCostTrace_Common.js', libs: ['WOReportTheme.js'], fixtures: FXP.summary(), quietLog: true
});
let FIX = FXP.summary();
const { module: mod, T } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: () => FIX,
  quietLog: true,
  exports: ['renderListFieldScript'],
});
function run(params) {
  const chunks = [];
  mod.onRequest({
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: () => {} }
  });
  return chunks.join('');
}
/** fixture เจาะลึกที่มีชั้นที่ 2/3 จริง — 801 มี BOM (หัวพับกาง + .lvl2) · 802 ไม่มี (ซื้อมาใช้ตรง) */
function drillWithLevel2() {
  const f = FXP.drilldown();
  f['BOM มาตรฐาน'] = [{ parent_item: 801, rev_id: 1, rev_name: 'R1', batch_qty: 1, comp_item: 901,
    comp_code: 'RM-A', comp_name: 'วัตถุดิบ A', bom_qty: 1, comp_yield: 100, comp_unit_id: 1,
    comp_unit_name: 'KG', item_source: 'STOCK', comp_avg_cost: 3, comp_stock_unit_id: 1, comp_stock_unit: 'KG' }];
  return f;
}

const BASEP = { from: '2026-07-01', to: '2026-07-31', sub: '2', rmloc: '35', loc: '10', line: '3' };
const ovEmbed = run(Object.assign({ embed: '1' }, BASEP));
const ovSolo = run(Object.assign({}, BASEP));
const css = (ovEmbed.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
/** body ของกฎแรกที่ selector ตรงตัว */
const rule = (sel) => {
  const i = css.indexOf(sel + '{');
  return i < 0 ? '' : css.slice(i + sel.length + 1, css.indexOf('}', i));
};

// ═══ A. embed: กล่องชั้นบนสุด ═══════════════════════════════════════════════════
console.log('\n── A. embed: กล่องชั้นบนสุดไม่มีเส้นซ้าย/ขวา · ระยะบน ──');
const TOP_SEL = ['body.is-embed .content>details', 'body.is-embed .content>form>details', 'body.is-embed .content>.card',
  'body.is-embed .content>.toc', 'body.is-embed .content>.rw-tablewrap', 'body.is-embed .content>.scroll'];
const topRule = (css.match(/body\.is-embed \.content>details,[^{]*\{([^}]*)\}/) || []);
const topSels = (topRule[0] || '').split('{')[0].split(',');
TOP_SEL.forEach((s) => eq('กฎตัดเส้นข้างครอบ ' + s, topSels.indexOf(s) >= 0, true));
eq('กล่องชั้นบนสุด: border-left/right 0 + มุม 0',
  /border-left-width:0;border-right-width:0;border-radius:0/.test(topRule[1] || ''), true);
eq('.err ชั้นบนสุด: ตัดเส้นขวา+มุม (คงแถบซ้าย 3px ของ alert)',
  /^border-right-width:0;border-radius:0$/.test(rule('body.is-embed .content>.err')), true);
eq('หัวพับของกล่องชั้นบนสุดไม่มีมุมโค้ง',
  css.indexOf('body.is-embed .content>details>summary,body.is-embed .content>form>details>summary{border-radius:0}') >= 0, true);
eq('การ์ดตัวเลขที่ชิดขอบซ้าย: ไม่มีเส้น/มุมซ้าย',
  rule('body.is-embed .kpi-card.is-edge-l'), 'border-left-width:0;border-top-left-radius:0;border-bottom-left-radius:0');
eq('การ์ดตัวเลขที่ชิดขอบขวา: ไม่มีเส้น/มุมขวา',
  rule('body.is-embed .kpi-card.is-edge-r'), 'border-right-width:0;border-top-right-radius:0;border-bottom-right-radius:0');
eq('embed มีสคริปต์ติดคลาส is-edge-l/r ให้การ์ดริม', /classList\.toggle\("is-edge-l"/.test(ovEmbed), true);
eq('สคริปต์ริมวัดกับ documentElement.clientWidth (ไม่ใช่ innerWidth)',
  ovEmbed.indexOf('var cw=document.documentElement.clientWidth;var cs=document.querySelectorAll(".kpi-card")') >= 0, true);
eq('เปิดเดี่ยวไม่มีสคริปต์ริม (มี padding ข้าง ไม่ชิดขอบ)', /classList\.toggle\("is-edge-l"/.test(ovSolo), false);
eq('ระยะบนใน embed = --sp-2 (เดิม --sp-4)',
  css.indexOf('body.is-embed .content{padding:var(--sp-2) 0 var(--sp-6);position:relative}') >= 0, true);
eq('ระยะบนใน embed จอแคบ = --sp-2 ด้วย (กฎที่สองใน @media)',
  css.indexOf('body.is-embed .content{padding:var(--sp-2) 0 var(--sp-4)}') >= 0, true);
eq('embed ยังไม่เยื้องซ้าย/ขวา (แนวตรงหัว .sec ของ CCRC)',
  /body\.is-embed \.content\{padding:var\(--sp-[24]\) 0 /.test(css)
  && !/body\.is-embed \.content\{padding:[^;}]* var\(--sp-\d\) var/.test(css), true);
eq('ปุ่ม i ของภาพรวม (embed) ไม่ float แล้ว (float ทำให้ฟอร์มหดไม่ชิดขอบขวา)',
  rule('.pagehead.is-float'), 'position:absolute;top:var(--sp-2);right:0;margin:0');

// ═══ B. แถวปุ่มอยู่เหนือช่อง → popup เปิดลงล่าง ═══════════════════════════════════
console.log('\n── B. หน้าภาพรวม: แถวปุ่มเหนือช่องตัวกรอง ──');
eq('ฟอร์มภาพรวมเป็น flex คอลัมน์', rule('#wct-summary-form'), 'display:flex;flex-direction:column');
const actRule = rule('form>.act');
eq('form>.act ขึ้นไปบนสุดด้วย order:-1', /(^|;)order:-1(;|$)/.test(actRule), true);
eq('form>.act ชิดขวาแบบปุ่ม Apply ของ CCRC', /justify-content:flex-end/.test(actRule), true);
eq('ใน DOM .act ยังอยู่หลัง </details> ของ filterbox (หุบแล้วปุ่มยังกดได้)',
  ovEmbed.indexOf('<div class="act">') > ovEmbed.lastIndexOf('</details>', ovEmbed.indexOf('<div class="act">'))
  && ovEmbed.indexOf('<div class="act">') > ovEmbed.indexOf('<details class="filterbox"'), true);
eq('embed: แถวปุ่มเว้นที่ให้ปุ่ม i', rule('body.is-embed form>.act'), 'padding-right:calc(var(--tap-min) + var(--sp-2))');

// คอมโบบ็อกซ์ — ขับเอนจินจริง (ไม่แก้) ด้วยเรขาคณิตก่อน/หลังย้ายแถวปุ่ม
const engineJs = (T.renderListFieldScript().match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
const comboPosSrc = (engineJs.match(/function _position\(w\) \{[\s\S]*?\n  \}/) || [])[0];
eq('ดึง _position(w) ของเอนจินคอมโบบ็อกซ์ได้', !!comboPosSrc, true);
function combo(fieldRect, btnRect, vh, fullH) {
  const list = { style: {}, _a: {}, setAttribute(k, v) { this._a[k] = String(v); }, getAttribute(k) { return this._a[k]; },
    getBoundingClientRect() { const c = parseInt(this.style.maxHeight, 10); return { height: isNaN(c) ? fullH : Math.min(fullH, c) }; } };
  new Function('document', 'window', comboPosSrc + ';\nreturn _position;')(
    { documentElement: { clientWidth: 1902 } }, { innerWidth: 1919, innerHeight: vh })(
    { _list: list, _input: { getBoundingClientRect() { return fieldRect; } },
      _avoid: { getBoundingClientRect() { return btnRect; } } });
  return { flip: list.getAttribute('data-flip'), top: parseInt(list.style.top, 10), h: parseInt(list.style.maxHeight, 10) };
}
// เรขาคณิตวัดจาก headless 1920×987 (fixture + ตัวเลือกยาวแบบ SB1) — ช่อง Subsidiary
const SUB = { top: 155, bottom: 187, left: 41, right: 241, width: 200, height: 32 };
const before = combo(SUB, { top: 308, bottom: 340, left: 24, right: 112 }, 987, 300);
eq('ก่อนแก้ (ปุ่มอยู่ใต้ช่อง 121px): คอมโบบ็อกซ์พลิกขึ้น — อาการเดียวกับ QA (y=4 สูง 147)',
  [before.flip, before.top, before.h].join(','), 'up,4,147');
const SUB2 = { top: 207, bottom: 239, left: 41, right: 241, width: 200, height: 32 };
const after = combo(SUB2, { top: 84, bottom: 116, left: 1642, right: 1730 }, 987, 280);
eq('หลังแก้ (ปุ่มอยู่เหนือช่อง): เปิดลงล่าง', after.flip, 'down');
eq('หลังแก้: เริ่มใต้ช่องพอดี', after.top, SUB2.bottom + 4);
eq('หลังแก้: สูงเต็ม 280 แบบ CCRC (ไม่ถูกบีบ)', after.h, 280);

// ปฏิทิน — ตรรกะใน Common (แก้ได้)
const calScript = C.renderDateFieldScript();
const calPosSrc = (calScript.match(/function _position\(\) \{[\s\S]*?\n  \}/) || [])[0];
eq('ดึง _position() ของปฏิทินได้', !!calPosSrc, true);
function cal(rect, avoid, vh) {
  const box = { style: {}, _a: {}, setAttribute(k, v) { this._a[k] = String(v); }, getAttribute(k) { return this._a[k]; },
    getBoundingClientRect() { const c = parseInt(this.style.maxHeight, 10); return { width: 238, height: isNaN(c) ? 264 : Math.min(264, c) }; } };
  new Function('document', 'window', 'openCal', calPosSrc + ';\nreturn _position;')(
    { documentElement: { clientWidth: 1902 } }, { innerWidth: 1919, innerHeight: vh },
    { box: box, anchor: { getBoundingClientRect() { return rect; } }, avoid: avoid })();
  return { flip: box.getAttribute('data-flip'), top: parseInt(box.style.top, 10), shrunk: !!box.style.maxHeight };
}
const FROM = { top: 207, bottom: 239, left: 257, right: 408 };
/** แถว .act เต็มความกว้างฟอร์ม + ปุ่มจริงสองปุ่มชิดขวา */
const actEl = (top) => ({
  getBoundingClientRect() { return { top: top, bottom: top + 40, left: 24, right: 1878 }; },
  querySelectorAll() {
    return [{ left: 1642, right: 1730 }, { left: 1742, right: 1878 }].map((b) => ({
      getBoundingClientRect() { return { top: top + 4, bottom: top + 36, left: b.left, right: b.right, width: b.right - b.left, height: 32 }; }
    }));
  }
});
const c1 = cal(FROM, actEl(76), 987);
eq('ปฏิทิน: แถวปุ่มอยู่เหนือช่อง → เปิดลงล่าง', c1.flip, 'down');
eq('ปฏิทิน: เปิดลงล่างเต็มเดือน ไม่ถูกย่อ', c1.shrunk, false);
eq('ปฏิทิน: เริ่มใต้ช่องพอดี', c1.top, FROM.bottom + 4);
// แถวปุ่มอยู่ใต้ช่องใกล้ ๆ แต่ตัวปุ่มชิดขวา ไม่ตรงคอลัมน์ช่อง → ต้องหลบเฉพาะตัวปุ่ม ไม่ใช่ทั้งแถว
const c2 = cal(FROM, actEl(300), 987);
eq('ปฏิทิน: ปุ่มจริงอยู่คนละคอลัมน์ (แม้แถวจะกว้างเต็ม) → เปิดลงล่างเต็มเดือน',
  [c2.flip, c2.shrunk].join(','), 'down,false');
// ตัวจำลองที่ไม่มี querySelectorAll (เทสเดิม/element ทั่วไป) → ใช้กรอบของ element ตามเดิม
const c3 = cal(FROM, { getBoundingClientRect() { return { top: 300, bottom: 340, left: 24, right: 1878 }; } }, 987);
eq('ปฏิทิน: avoid ไม่มีปุ่มให้วัด → หลบทั้งกรอบเหมือนเดิม (ไม่ทับ)', c3.top + 264 <= 300 || c3.flip === 'up' || c3.shrunk, true);

// ═══ C. .tag = .badge ═══════════════════════════════════════════════════════════
console.log('\n── C. .tag หน้าตา .badge ของ CCRC ──');
const tag = rule('.tag');
eq('.tag inline-flex', /(^|;)display:inline-flex(;|$)/.test(tag), true);
eq('.tag สูง 20px', /(^|;)height:20px(;|$)/.test(tag), true);
eq('.tag padding 0 6px', /(^|;)padding:0 6px(;|$)/.test(tag), true);
eq('.tag มุม pill · สี info จาก token', /border-radius:var\(--r-pill\)/.test(tag)
  && /background:var\(--c-info-soft\);color:var\(--c-info\)/.test(tag), true);
eq('.tag ตัว --t-xs semibold', /font-size:var\(--t-xs\);font-weight:var\(--w-semibold\)/.test(tag), true);

// ═══ D. หน้าเจาะลึกแบน ═══════════════════════════════════════════════════════════
console.log('\n── D. หน้าเจาะลึกแบนแบบ CCRC ──');
eq('ไม่มีกฎ .lvl2{ / .lvl3{ (แถบซ้าย 3px + เยื้องซ้อนถูกถอด)', /(^|\})\.lvl[23]\{/.test(css), false);
const lvlRules = (css.match(/[^{}]*lvl[^{}]*\{[^}]*\}/g) || []);
eq('ไม่มีกฎใดของ .lvl* วาดเส้นซ้าย/เยื้อง', lvlRules.filter((r) => /border-left|margin-left|padding-left/.test(r)).join('|'), '');
eq('หน้าเจาะลึกไม่มี style inline เส้นซ้าย 3px', /style="[^"]*border-left:3px/.test(drillHtmlForThick()), false);
function drillHtmlForThick() { FIX = drillWithLevel2(); return run(Object.assign({ wo: FXP.WO_HEADER.wo_no }, BASEP)); }
FIX = drillWithLevel2();
const drill = run(Object.assign({ wo: FXP.WO_HEADER.wo_no }, BASEP));
eq('fixture ชั้นที่ 2 ถูกวาดจริง (มี .lvl2)', drill.indexOf('<div class="lvl2">') > 0, true);
eq('หัวพับชั้นที่ 2 มีป้าย "ชั้นที่ 2"', (drill.match(/<span class="acclbl"><span class="tag lvltag">ชั้นที่ 2<\/span>/g) || []).length >= 2, true);
eq('หัวพับ ledger มีป้าย "ชั้นที่ 3"', (drill.match(/<span class="acclbl"><span class="tag lvltag">ชั้นที่ 3<\/span>/g) || []).length >= 2, true);
eq('ป้ายชั้นไม่เว้นซ้าย', rule('.lvltag'), 'margin:0 var(--sp-2) 0 0');

// ═══ E. ลิงก์ข้ามหน้าพาตัวกรองครบ ═════════════════════════════════════════════════
console.log('\n── E. เจาะลึก ↔ ความพร้อม พาตัวกรองครบ ──');
const params = (href) => {
  const q = {};
  href.replace(/&amp;/g, '&').split('?')[1].split('&').forEach((kv) => {
    const i = kv.indexOf('='); q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  });
  return q;
};
const hrefOf = (html, text) => {
  const i = html.indexOf(text);
  const a = html.lastIndexOf('<a href="', i);
  return i < 0 || a < 0 ? '' : html.slice(a + 9, html.indexOf('"', a + 9));
};
const KEYS = Object.keys(BASEP);
[false, true].forEach((embed) => {
  const tagE = embed ? ' (embed)' : ' (เปิดเดี่ยว)';
  FIX = FXP.drilldown();
  const d = run(Object.assign({ wo: FXP.WO_HEADER.wo_no }, embed ? { embed: '1' } : {}, BASEP));
  const toReady = hrefOf(d, 'ตรวจความพร้อม master ของใบนี้');
  eq('เจาะลึก→ความพร้อม' + tagE + ': มีลิงก์', !!toReady, true);
  const pr = params(toReady);
  eq('เจาะลึก→ความพร้อม' + tagE + ': พาตัวกรองครบทุก key', KEYS.filter((k) => pr[k] == null).join(','), '');
  eq('เจาะลึก→ความพร้อม' + tagE + ': sub/rmloc/loc/line ค่าเดิม',
    ['sub', 'rmloc', 'loc', 'line'].map((k) => pr[k]).join(','), '2,35,10,3');
  eq('เจาะลึก→ความพร้อม' + tagE + ': embed ติดไปตามโหมด', pr.embed === '1', embed);
  FIX = READY_FX;
  const r = run(Object.assign({}, pr, { ready: 'WO-FSC-00000392' }));
  const back = params(hrefOf(r, 'กลับภาพรวมต้นทุน'));
  eq('ความพร้อม→กลับภาพรวม' + tagE + ': ตัวกรองยังอยู่ครบ', KEYS.filter((k) => back[k] == null).join(','), '');
  eq('ความพร้อม→กลับภาพรวม' + tagE + ': ไม่มี ready/wo ติดไป', back.ready == null && back.wo == null, true);
  const toDrill = hrefOf(r, 'ดูที่มาของต้นทุนใบนี้');
  eq('ความพร้อม→เจาะลึก' + tagE + ': มีลิงก์ (basis=wo)', !!toDrill, true);
  if (toDrill) {
    const pd = params(toDrill);
    eq('ความพร้อม→เจาะลึก' + tagE + ': พาตัวกรองครบทุก key', KEYS.filter((k) => pd[k] == null).join(','), '');
    eq('ความพร้อม→เจาะลึก' + tagE + ': wo = ใบเดิม', pd.wo, 'WO-FSC-00000392');
  }
});

// ═══ F. focus ring ของหัวพับที่กาง ══════════════════════════════════════════════════
console.log('\n── F. focus ของ summary ที่กางอยู่ = --r-md ──');
const fIdx = css.indexOf('details>summary:focus-visible,details[open]>summary:focus-visible{border-radius:var(--r-md) !important}');
eq('มีกฎมุม --r-md ของ summary:focus-visible ที่ชนะ details[open]>summary', fIdx >= 0, true);
eq('กฎ focus มาหลังกฎ details[open]>summary และกฎ embed', fIdx > css.indexOf('details[open]>summary{')
  && fIdx > css.indexOf('body.is-embed .content>details>summary'), true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
