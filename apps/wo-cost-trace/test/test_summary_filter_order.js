/**
 * เทส — ตัวกรองหน้าภาพรวม WO Cost Trace ชุดใหม่ (issue #94)
 *
 * ผู้ใช้สั่ง 2026-10-10: เพิ่ม RM Location กับ Production Line แล้วเรียงช่องเป็น
 *   Subsidiary · Date from–to · RM Location · Production location · Production Line
 * เทสนี้กันห้าเรื่อง
 *
 *   1. **ลำดับช่องในฟอร์ม** ตามที่ผู้ใช้สั่ง และช่องเดิม (เดือน · จับจาก · รหัสสินค้า · เลขที่ใบสั่งผลิต ·
 *      เรียงตาม · ไม่เกิน) ยังอยู่ครบ ไม่ถูกตัดทิ้ง — หลังรวม #77/#86 ช่องเดิมอยู่ในที่พับ
 *      `<details class="morefld">` "ตัวกรองเพิ่มเติม" ห้าช่องของ #94 คือแถวหลักที่อยู่ก่อนที่พับ
 *   2. **เงื่อนไขต้องลงไปถึง SQL จริง** — อ่านจาก `H.calls` ว่า clause กับ param ไปถึง query
 *      รายการใบสั่งผลิต และหายไปเมื่อไม่ได้เลือก · RM Location ต้อง "คัดใบ" ด้วย EXISTS เท่านั้น
 *      ห้ามไปตัดยอดวัตถุดิบ (ยอดสองชั้นต้องเท่ากัน)
 *   3. **ค่าที่เลือกต้องไม่หลุดกลางทาง** — ลิงก์เจาะลึก · ความพร้อม · กลับภาพรวม · ฟอร์มชั้นเจาะลึก ·
 *      mode=json · และ embed=1 ต้องติดไปกับการกดค้นหาในโหมดฝัง
 *   4. **ช่องเดือนกับช่วงวันที่ไม่ทับกันเงียบ ๆ** — from/to ที่ไม่ใช่ขอบเดือนชนะ month ที่ค้างอยู่
 *   5. **dropdown ต่อเนื่องตามบริษัท/สถานที่ผลิต** (รันสคริปต์จริงบน DOM ปลอม) และรายการพังแล้วหน้าไม่ล่ม
 */
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ json: true });
// เทียบ array/object ด้วยค่า (eq ของ harness เทียบด้วย ===)
const eqJ = (label, got, want) => eq(label, JSON.stringify(got), JSON.stringify(want));

const LIST_WO = 'ภาพรวม — รายการใบสั่งผลิต';

const { module: mod, T } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['readFilters', 'renderSummaryForm', 'renderFilterCascadeScript']
});

function run(params) {
  const chunks = [];
  mod.onRequest({
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: () => {} }
  });
  return chunks.join('');
}

function lastCall(label) {
  for (let i = H.calls.length - 1; i >= 0; i--) if (H.calls[i].label === label) return H.calls[i];
  return null;
}

const BASE = { from: '2026-07-01', to: '2026-07-31' };

// ── 1. ลำดับช่อง ─────────────────────────────────────────────────────────
console.log('\n── 1. ลำดับช่องตามที่ผู้ใช้สั่ง ──');
const page = run(BASE);
const form = (page.match(/<form method="get" id="wct-summary-form">[\s\S]*?<\/form>/) || [''])[0];
eq('หาฟอร์มภาพรวมเจอ', form.length > 0, true);

const ORDER = ['name="sub"', 'name="from"', 'name="to"', 'name="rmloc"', 'name="loc"', 'name="line"'];
const pos = ORDER.map((n) => form.indexOf(n));
eq('ทุกช่องในลำดับมีอยู่จริง', pos.every((p) => p > 0), true);
eq('ลำดับ Subsidiary · Date from · to · RM Location · Production location · Production Line',
  pos.every((p, i) => i === 0 || p > pos[i - 1]), true);

const LABELS = ['Subsidiary', 'Date from – to', 'RM Location', 'Production location', 'Production Line'];
const lpos = LABELS.map((l) => form.indexOf('<label>' + l + '</label>'));
eq('ป้ายห้าช่องมีครบ', lpos.every((p) => p > 0), true);
eq('ป้ายเรียงตามลำดับเดียวกัน', lpos.every((p, i) => i === 0 || p > lpos[i - 1]), true);

// ห้าช่องต้องอยู่แถวหลัก ก่อนที่พับ "ตัวกรองเพิ่มเติม" — ช่องอื่นอยู่ในที่พับทั้งหมด
// (เดิมเทสนี้ใช้ .brk ตัวแรกเป็นเส้นแบ่ง · หลังรวม #86 ฟอร์มภาพรวมไม่มี .brk แล้ว เส้นแบ่งจึงเป็นที่พับ)
const moreAt = form.indexOf('<details class="morefld"');
const moreEnd = form.indexOf('</details>', moreAt);
eq('มีที่พับ "ตัวกรองเพิ่มเติม"', moreAt > 0 && moreEnd > moreAt, true);
eq('ห้าช่องอยู่แถวหลัก (ก่อนที่พับ)', moreAt > pos[pos.length - 1], true);
eq('ฟอร์มภาพรวมไม่มี .brk (แถวหลักไม่ถูกบังคับขึ้นบรรทัด)', form.indexOf('class="brk"') >= 0, false);
['name="month"', 'name="basis"', 'name="item"', 'name="wono"', 'name="sort"', 'name="max"'].forEach((n) => {
  const p = form.indexOf(n);
  eq('ช่องเดิม ' + n + ' ยังอยู่ และอยู่ในที่พับ', p > moreAt && p < moreEnd, true);
});
eq('ช่องเดือนยังมีตัวเลือก "กำหนดวันที่เอง"', form.indexOf('value="custom"') > 0, true);
eq('ตัวเลือกเดือนพกขอบเดือนไว้เติมช่องวันที่ (data-from/data-to)',
  /<option value="\d{4}-\d{2}" data-from="[^"]+" data-to="[^"]+"/.test(form), true);
eq('Production location ยังใช้ param loc เดิม (ลิงก์เก่า &loc= ใช้ได้)', /<select name="loc">/.test(form), true);
eq('ไม่ใช่โหมดฝัง → ไม่มี hidden embed', /name="embed"/.test(form), false);

// ── 2. เงื่อนไขลงถึง SQL ─────────────────────────────────────────────────
console.log('\n── 2. เงื่อนไขลงถึง SQL ──');
H.calls.length = 0;
run(BASE);
let c = lastCall(LIST_WO);
eq('ไม่เลือก → ไม่มีเงื่อนไขไลน์ผลิต', /custbody_mfg_production_line = \?/.test(c.sql), false);
eq('ไม่เลือก → ไม่มีเงื่อนไข RM Location', /RML\.location = \?/.test(c.sql), false);

H.calls.length = 0;
run(Object.assign({ line: '3' }, BASE));
c = lastCall(LIST_WO);
eq('เลือกไลน์ → WO.custbody_mfg_production_line = ?', /WO\.custbody_mfg_production_line = \?/.test(c.sql), true);
eq('param ของไลน์ไปถึง query', c.params.indexOf('3') >= 0, true);

H.calls.length = 0;
run(Object.assign({ rmloc: '35' }, BASE));
c = lastCall(LIST_WO);
const ex = (c.sql.match(/EXISTS \(\s*SELECT 1\s*FROM transaction RMT[\s\S]*?\)\s*(?=AND|\n\s*ORDER|$)/) || [''])[0];
eq('เลือก RM Location → มี EXISTS บนบรรทัดใบเบิก', ex.length > 0, true);
eq('EXISTS ผูกกับ WO ด้วย custcol_mfg2_ref_workorder', /RML\.custcol_mfg2_ref_workorder = WO\.id/.test(c.sql), true);
eq('EXISTS กรอง location ของบรรทัดใบเบิก', /RML\.location = \?/.test(c.sql), true);
eq('EXISTS เป็นใบเบิก inventoryadjustment', /RMT\.recordtype = 'inventoryadjustment'/.test(c.sql), true);
eq('EXISTS ตัดบรรทัด summary cost (ประเภทเอกสาร) แบบเดียวกับ qSummaryRM',
  /NVL\(RMA\.custrecord_adjt_mfgsummarycost, 'F'\) = 'F'/.test(c.sql), true);
eq('EXISTS ตัดบรรทัด summary cost (ตัวสินค้า) แบบเดียวกับ qSummaryRM',
  /NVL\(RMI\.custitem_mfg_summarycostitem, 'F'\) = 'F'/.test(c.sql), true);
eq('param ของ RM Location ไปถึง query', c.params.indexOf('35') >= 0, true);
eq('Production location ยังเป็น TL.location ของบรรทัด mainline (ไม่ปนกับ RM Location)',
  /TL\.location = \?/.test(c.sql), false);
const rm = lastCall('ภาพรวม — วัตถุดิบและบรรจุภัณฑ์');
eq('ยอดวัตถุดิบไม่ถูกตัดตาม RM Location (ยอดสองชั้นต้องเท่ากัน)',
  !!rm && !/location/i.test(rm.sql), true);

H.calls.length = 0;
run(Object.assign({ sub: '2', rmloc: '35', loc: '10', line: '3' }, BASE));
c = lastCall(LIST_WO);
eq('ครบสี่ช่อง — ทุกเงื่อนไขอยู่พร้อมกัน',
  /TL\.subsidiary = \?/.test(c.sql) && /TL\.location = \?/.test(c.sql)
  && /WO\.custbody_mfg_production_line = \?/.test(c.sql) && /RML\.location = \?/.test(c.sql), true);
eqJ('param ครบตามลำดับ clause (sub · loc · line · rmloc)',
  c.params.slice(-4), ['2', '10', '3', '35']);

H.calls.length = 0;
run({ wono: 'WOFSC00000900', rmloc: '35', line: '3' });
c = lastCall(LIST_WO);
eq('ค้นด้วยเลขที่ใบสั่งผลิต — ตัวกรองใหม่ยังทำงาน (แบบเดียวกับ sub/loc)',
  /RML\.location = \?/.test(c.sql) && /custbody_mfg_production_line = \?/.test(c.sql), true);

// หลังรวม #77: rmloc/line ผ่าน idParam เหมือน sub/loc — ค่าที่มีอักขระอื่นปนถูก **ทิ้งทั้งค่า**
// พร้อมคำเตือน ไม่ขัดให้เหลือแต่ตัวเลข (เดิม `35' OR 1=1` กลายเป็น 3511 = กรองด้วย id ที่ไม่มีใครเลือก)
console.log('\n── readFilters: ค่าแปลกปลอมถูกทิ้ง ไม่ถูกขัดเป็นตัวเลข ──');
const fx = T.readFilters({ rmloc: "35' OR 1=1", line: '3abc' });
eq('rmloc ที่มีอักขระอื่นปน → ไม่กรอง (ค่าว่าง)', fx.rmloc, '');
eq('line ที่มีอักขระอื่นปน → ไม่กรอง (ค่าว่าง)', fx.line, '');
eqJ('ทั้งสองค่าถูกรายงานใน badParams พร้อมค่าดิบ',
  fx.badParams.map((b) => [b.name, b.raw]), [['rmloc', "35' OR 1=1"], ['line', '3abc']]);
const fxOk = T.readFilters({ rmloc: ' 35 ', line: '3' });
eqJ('ตัวเลขล้วน (มีช่องว่างหัวท้าย) → ใช้กรอง ไม่ขึ้นคำเตือน',
  [fxOk.rmloc, fxOk.line, fxOk.badParams.length], ['35', '3', 0]);
H.calls.length = 0;
run(Object.assign({ rmloc: "35' OR 1=1", line: '3abc' }, BASE));
c = lastCall(LIST_WO);
eq('ค่าที่ถูกทิ้งไม่ลงไปถึง SQL (ไม่มีเงื่อนไข RM Location/ไลน์ผลิต)',
  /RML\.location = \?/.test(c.sql) || /custbody_mfg_production_line = \?/.test(c.sql), false);

// ── 3. ค่าไม่หลุดกลางทาง ─────────────────────────────────────────────────
console.log('\n── 3. ค่าติดไปกับลิงก์ / json / embed ──');
const pSel = run(Object.assign({ sub: '2', rmloc: '35', loc: '10', line: '3' }, BASE));
eq('dropdown RM Location เลือกค่าเดิมค้างไว้',
  /<select name="rmloc">[\s\S]*?<option value="35"[^>]* selected>/.test(pSel), true);
eq('dropdown Production Line เลือกค่าเดิมค้างไว้',
  /<select name="line">[\s\S]*?<option value="3"[^>]* selected>/.test(pSel), true);
const drill = (pSel.match(/<a class="drill" href="([^"]+)"/) || [])[1] || '';
eq('มีลิงก์เจาะลึกในตาราง', drill.length > 0, true);
eq('ลิงก์เจาะลึกพา rmloc ไปด้วย', /[?&]rmloc=35(&|$)/.test(drill), true);
eq('ลิงก์เจาะลึกพา line ไปด้วย', /[?&]line=3(&|$)/.test(drill), true);
const ready = (pSel.match(/href="([^"]*[?&]ready=[^"]+)"/) || [])[1] || '';
eq('ลิงก์ความพร้อมพา rmloc/line ไปด้วย', /rmloc=35/.test(ready) && /line=3/.test(ready), true);

const fp = T.readFilters({ rmloc: '35', line: '3' });
eqJ('ลิงก์ที่มีอยู่แล้ว (ไม่ส่ง rmloc/line) ยังได้ค่าว่าง ไม่มีค่าเดาเติม',
  [T.readFilters(BASE).rmloc, T.readFilters(BASE).line], ['', '']);
eqJ('readFilters อ่าน rmloc/line', [fp.rmloc, fp.line], ['35', '3']);

H.calls.length = 0;
const jsonOut = JSON.parse(run(Object.assign({ mode: 'json', rmloc: '35', line: '3' }, BASE)));
eqJ('mode=json คืน filters ที่มี rmloc/line', [jsonOut.summary.filters.rmloc, jsonOut.summary.filters.line], ['35', '3']);
eq('mode=json — query ของ dropdown ใหม่ไม่มี error',
  jsonOut.qlog.filter((q) => (q.label === 'ตัวกรอง — RM Location' || q.label === 'ตัวกรอง — Production Line') && q.error).length, 0);

const pEmbed = run(Object.assign({ embed: '1', rmloc: '35' }, BASE));
const formEmbed = (pEmbed.match(/<form method="get" id="wct-summary-form">[\s\S]*?<\/form>/) || [''])[0];
eq('โหมดฝัง → ฟอร์มค้นหาพา embed=1 ไปด้วย', /<input type="hidden" name="embed" value="1">/.test(formEmbed), true);
const drillEmbed = (pEmbed.match(/<a class="drill" href="([^"]+)"/) || [])[1] || '';
eq('โหมดฝัง → ลิงก์เจาะลึกยังมี embed=1 และ rmloc', /embed=1/.test(drillEmbed) && /rmloc=35/.test(drillEmbed), true);

H.setFixtures(Object.assign({}, FX.summary(), FX.drilldown()));
const pWo = run({ wo: 'WOFSC00000900', rmloc: '35', line: '3', sub: '2' });
H.setFixtures(FX.summary());
const back = (pWo.match(/<div class="crumb"><a href="([^"]+)"/) || [])[1] || '';
eq('ชั้นเจาะลึก: ลิงก์กลับภาพรวมพา rmloc/line กลับ', /rmloc=35/.test(back) && /line=3/.test(back), true);
eq('ชั้นเจาะลึก: ฟอร์มเก็บ rmloc/line เป็น hidden',
  /<input type="hidden" name="rmloc" value="35">/.test(pWo) && /<input type="hidden" name="line" value="3">/.test(pWo), true);

// ── 4. เดือนกับช่วงวันที่ ────────────────────────────────────────────────
console.log('\n── 4. เดือนกับช่วงวันที่ไม่ทับกันเงียบ ๆ ──');
let f = T.readFilters({ month: '2026-07', from: '2026-07-01', to: '2026-07-31' });
eqJ('ลิงก์ของระบบ (month + ขอบเดือน) → ยังเป็นเดือนเดิม', [f.month, f.from, f.to], ['2026-07', '2026-07-01', '2026-07-31']);
f = T.readFilters({ month: '2026-07', from: '2026-07-05', to: '2026-07-20' });
eqJ('month ค้าง + วันที่ที่ผู้ใช้แก้ → วันที่ชนะ', [f.month, f.from, f.to], ['', '2026-07-05', '2026-07-20']);
f = T.readFilters({ month: '2026-07' });
eqJ('ส่งแค่ month → ทั้งเดือน', [f.month, f.from, f.to], ['2026-07', '2026-07-01', '2026-07-31']);
f = T.readFilters({ month: 'custom', from: '2026-06-10', to: '2026-07-10' });
eqJ('custom + วันที่ → วันที่ตามที่ส่ง', [f.month, f.from, f.to], ['', '2026-06-10', '2026-07-10']);

// ── 5. dropdown ต่อเนื่อง (รันสคริปต์จริงบน DOM ปลอม) ──────────────────────
console.log('\n── 5. dropdown ต่อเนื่องตามบริษัท/สถานที่ผลิต ──');

function makeOption(value, text, attrs) {
  const a = Object.assign({}, attrs || {});
  return {
    value: value, text: text, selected: false,
    setAttribute(k, v) { a[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(a, k) ? a[k] : null; }
  };
}
function makeSelect(name, opts, selectedValue) {
  const listeners = {};
  const s = {
    name: name,
    options: opts,
    get selectedIndex() { return this.options.findIndex((o) => o.selected); },
    get value() { const o = this.options.find((x) => x.selected); return o ? o.value : (this.options[0] ? this.options[0].value : ''); },
    set value(v) {
      let hit = false;
      this.options.forEach((o) => { o.selected = !hit && o.value === v; if (o.selected) hit = true; });
      if (!hit && this.options[0]) this.options[0].selected = true;
    },
    remove(i) { this.options.splice(i, 1); },
    add(o) { this.options.push(o); },
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    fire(ev) { (listeners[ev] || []).forEach((fn) => fn({})); }
  };
  s.value = selectedValue || '';
  return s;
}
function makeInput(name, value) {
  const listeners = {};
  return {
    name: name, value: value,
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    fire(ev) { (listeners[ev] || []).forEach((fn) => fn({})); }
  };
}
function cascadeEnv(sel) {
  const all = () => makeOption('', '— ทั้งหมด —');
  const selects = {
    sub: makeSelect('sub', [all(), makeOption('2', 'A Co'), makeOption('5', 'B Co')], sel.sub),
    rmloc: makeSelect('rmloc', [all(),
      makeOption('35', 'TANK-A', { 'data-sub': '2' }),
      makeOption('77', 'TANK-B', { 'data-sub': '5' }),
      makeOption('99', 'NO-SUB')], sel.rmloc),
    loc: makeSelect('loc', [all(),
      makeOption('10', 'PD_B1', { 'data-sub': '2' }),
      makeOption('50', 'PD_X', { 'data-sub': '5' })], sel.loc),
    line: makeSelect('line', [all(),
      makeOption('3', 'LINE1', { 'data-sub': '2', 'data-loc': '10' }),
      makeOption('4', 'LINE2', { 'data-sub': '2', 'data-loc': '11' }),
      makeOption('8', 'LINE8', { 'data-sub': '5', 'data-loc': '50' })], sel.line),
    month: makeSelect('month', [
      makeOption('2026-07', 'ก.ค.', { 'data-from': '1/7/2026', 'data-to': '31/7/2026' }),
      makeOption('custom', 'เอง')], '2026-07')
  };
  const inputs = { from: makeInput('from', '1/7/2026'), to: makeInput('to', '31/7/2026') };
  const synced = [];
  const formEl = {
    querySelector(q) {
      let m = /^select\[name="([a-z]+)"\]$/.exec(q);
      if (m) return selects[m[1]] || null;
      m = /^input\[name="([a-z]+)"\]$/.exec(q);
      if (m) return inputs[m[1]] || null;
      return null;
    }
  };
  const document = {
    getElementById: (id) => (id === 'wct-summary-form' ? formEl : null),
    createElement: () => makeOption('', '')
  };
  const window = { __rwSyncCombobox: (s) => synced.push(s.name) };
  const tag = T.renderFilterCascadeScript();
  const js = (tag.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  new Function('document', 'window', js)(document, window);
  const vals = (n) => selects[n].options.map((o) => o.value);
  return { selects, inputs, synced, vals };
}

let env = cascadeEnv({});
eqJ('ไม่เลือกบริษัท → แสดงทุกตัวเลือก (RM Location)', env.vals('rmloc'), ['', '35', '77', '99']);
eqJ('sync combobox หลังสร้างตัวเลือกใหม่', env.synced.sort(), ['line', 'loc', 'rmloc']);

env.selects.sub.value = '2';
env.selects.sub.fire('change');
eqJ('เลือกบริษัท 2 → RM Location เหลือของบริษัท 2 + ตัวที่ไม่รู้บริษัท', env.vals('rmloc'), ['', '35', '99']);
eqJ('เลือกบริษัท 2 → Production location เหลือของบริษัท 2', env.vals('loc'), ['', '10']);
eqJ('เลือกบริษัท 2 → Production Line เหลือของบริษัท 2', env.vals('line'), ['', '3', '4']);

env.selects.loc.value = '10';
env.selects.loc.fire('change');
eqJ('เลือก Production location 10 → Production Line เหลือเฉพาะไลน์ของที่นั้น', env.vals('line'), ['', '3']);

env = cascadeEnv({ sub: '2', rmloc: '77' });
eq('ค่าที่มาจากลิงก์ไม่อยู่ในบริษัทที่เลือก → ไม่ถูกล้างตอนโหลดหน้า (สัญญา #50)',
  env.selects.rmloc.value, '77');
env.selects.sub.value = '5';
env.selects.sub.fire('change');
eq('ผู้ใช้เปลี่ยนบริษัทเอง → ค่าที่อยู่ในชุดใหม่ยังเลือกค้างไว้', env.selects.rmloc.value, '77');
env.selects.sub.value = '2';
env.selects.sub.fire('change');
eq('ผู้ใช้เปลี่ยนบริษัทแล้วค่าเดิมไม่อยู่ในชุดใหม่ → กลับเป็น "ทั้งหมด"', env.selects.rmloc.value, '');

env = cascadeEnv({});
env.inputs.from.value = '5/7/2026';
env.inputs.from.fire('input');
eq('แก้วันที่เอง → ช่องเดือนเป็น custom', env.selects.month.value, 'custom');
env.selects.month.value = '2026-07';
env.selects.month.fire('change');
eqJ('เลือกเดือน → เติม from/to เป็นขอบเดือน', [env.inputs.from.value, env.inputs.to.value], ['1/7/2026', '31/7/2026']);
eq('เติมวันที่จากเดือนไม่ทำให้ช่องเดือนเด้งเป็น custom', env.selects.month.value, '2026-07');

console.log('\n── รายการ dropdown ใหม่พังแล้วหน้าไม่ล่ม ──');
H.setFixtures(Object.assign({}, FX.summary(), {
  'ตัวกรอง — RM Location': 'THROW', 'ตัวกรอง — Production Line': 'THROW'
}));
let threw = false, broken = '';
try { broken = run(Object.assign({ rmloc: '35', line: '3' }, BASE)); } catch (e) { threw = true; }
eq('onRequest ไม่ throw', threw, false);
eq('ช่อง RM Location ยังวาด และค่าเดิมยังถูกเลือกไว้เป็นตัวเลือกชั่วคราว',
  /<select name="rmloc">[\s\S]*?<option value="35" selected>/.test(broken), true);
eq('ช่อง Production Line ยังวาด และค่าเดิมยังถูกเลือกไว้เป็นตัวเลือกชั่วคราว',
  /<select name="line">[\s\S]*?<option value="3" selected>/.test(broken), true);
H.setFixtures(FX.summary());

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
