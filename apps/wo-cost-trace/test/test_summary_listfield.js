/**
 * เทส — Redwood searchable combobox ของหน้าภาพรวม WO Cost Trace (issue #64 ขั้น 3 — list field)
 *
 * แบ่งสองกลุ่มตามสเปกกลาง (list-field.md):
 *   ข้อมูล (มาจาก SuiteQL) → ต้องเป็น combobox ค้นได้: sub · loc
 *   ตัวควบคุมรายการสั้นคงที่ (เขียนตายในโค้ด) → คง native แค่แปะ class rw-select: sort · month · basis
 *
 * โค้ด client ของหน้านี้ (renderListFieldScript) เป็นสำเนาของ WOStatusTracking.js โดยตั้งใจ
 * (สองแอปนี้เป็นคนละ SDF project deploy อิสระกัน ไม่มีกลไก sync JS ข้ามแอปแบบที่ CSS มี) —
 * เทสนี้พิสูจน์ทุกสัญญาเดียวกับ apps/wo-status/test/test_wostatus_listfield.js แยกอิสระ เพราะ
 * เป็นคนละสำเนาโค้ดจริง ไม่ใช่แค่ก๊อปเทส
 */
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq({ json: true });

const { T } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['readFilters', 'renderSummaryForm', 'renderListFieldScript']
});

const subRows = [{ id: 2, name: 'Foodstar' }, { id: 5, name: 'Other Co' }];
const locRows = [{ id: 10, name: 'PD_B1' }, { id: 23, name: 'PD_B2' }];

function formWith(over) {
  const f = T.readFilters(Object.assign({ from: '2026-07-01', to: '2026-07-31' }, over));
  f.subRows = subRows;
  f.locRows = locRows;
  return T.renderSummaryForm(f);
}

const form = formWith({});

// ── ชั้น 1: การแบ่งกลุ่ม native vs combobox ตรงสเปก ──────────────────────
console.log('\n── native (ตัวควบคุมรายการสั้นคงที่) vs combobox (ข้อมูล) ──');
eq('sort เป็น native rw-select (ตัวควบคุม ไม่ใช่ข้อมูล)',
  /<select name="sort" class="rw-select">/.test(form), true);
eq('month เป็น native rw-select', /<select name="month" class="rw-select">/.test(form), true);
eq('basis เป็น native rw-select', /<select name="basis" class="rw-select">/.test(form), true);
eq('sub ยังเป็น <select> เดิม ไม่แปะ rw-select (จะถูกครอบเป็น combobox แทน)',
  /<select name="sub">/.test(form), true);
eq('loc ยังเป็น <select> เดิม ไม่แปะ rw-select', /<select name="loc">/.test(form), true);

// ── ชั้น 2: CSS block (ก๊อปจาก shared/WOReportTheme.js ผ่าน sync:theme) ───
// renderSummaryForm คืนแค่ <form> — CSS มาจาก shell() ตอน render หน้าเต็มเท่านั้น
// (เหมือนที่ test_theme.js ข้อ 3 ต้องเรียก onRequest เต็มทางเช่นกัน)
console.log('\n── CSS block (หน้าเต็มผ่าน onRequest) ──');
function makeCtx(params) {
  const chunks = [];
  return {
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: () => {} },
    body: () => chunks.join('')
  };
}
const { module: modFull } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true
});
const ctxFull = makeCtx({ from: '2026-07-01', to: '2026-07-31' });
modFull.onRequest(ctxFull);
const fullPage = ctxFull.body();
const styleBlock = (fullPage.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
[
  '.rw-select', '.rw-combobox{', '.rw-combobox-input', '.rw-combobox-chevron',
  '.rw-combobox-list', '.rw-combobox-option', '.rw-combobox-empty',
  '.rw-combobox-clear{display:none !important}', '.sr-only{',
].forEach((needle) => {
  eq('CSS มี ' + needle, styleBlock.indexOf(needle) >= 0, true);
});
eq('.sr-only ไม่ใช้ display:none', /\.sr-only\{[^}]*display:\s*none/.test(styleBlock), false);
eq('ไม่มี content:\'▼\' เหลืออยู่', styleBlock.indexOf("content:'▼'") >= 0, false);
eq('ไม่มีตัวอักษร ▼ ในทุกที่ของหน้า', fullPage.indexOf('▼') >= 0, false);
eq('ไม่มีตัวอักษร ⯆ ในทุกที่ของหน้า', fullPage.indexOf('⯆') >= 0, false);

// ── ชั้น 3: script parse ได้ ─────────────────────────────────────────────
console.log('\n── JS ฝั่งเบราว์เซอร์ต้อง parse ผ่าน ──');
const scripts = form.match(/<script>[\s\S]*?<\/script>/g) || [];
eq('มี <script> ในฟอร์ม', scripts.length > 0, true);
let parsed = 0;
scripts.forEach((block, i) => {
  const js = block.replace(/^<script>/, '').replace(/<\/script>$/, '');
  try { new Function(js); parsed++; } catch (e) { H.addFail('script block ' + i + ' parse ไม่ผ่าน: ' + e.message); }
});
eq('ทุก block parse ผ่าน', parsed, scripts.length);

// ── รันเอนจินคอมโบบ็อกซ์จริงบน DOM ปลอม ──────────────────────────────────
console.log('\n── รันคอมโบบ็อกซ์บน DOM ปลอม ──');

const scriptTag = T.renderListFieldScript();
const engineJs = (scriptTag.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
eq('ดึงเนื้อ <script> ของ renderListFieldScript ออกมาได้', engineJs.length > 0, true);
eq('ไม่มีการเทียบ options.length กับตัวเลข (threshold — MRP #500 ปฏิเสธ >8)',
  /opts\.length\s*[<>]=?\s*\d|options\.length\s*[<>]=?\s*\d/.test(engineJs), false);
eq('ไม่มี .style.display ถูกตั้งค่าที่ไหนเลย', /\.style\.display\s*=/.test(engineJs), false);
eq('ไม่มีปุ่ม ✕ / clear ถูกสร้างขึ้นจริงในโค้ด', /createElement\([^)]*\)[\s\S]{0,80}clear/.test(engineJs), false);

const DEFAULT_RECT = { top: 100, bottom: 132, left: 20, right: 220, width: 200, height: 32 };

function makeClassList(node) {
  function has(c) { return String(node.className || '').split(/\s+/).filter(Boolean).indexOf(c) >= 0; }
  return {
    contains: has,
    add(c) { if (!has(c)) node.className = (String(node.className || '') + ' ' + c).trim(); },
    remove(c) {
      node.className = String(node.className || '').split(/\s+/).filter((x) => x && x !== c).join(' ');
    },
    toggle(c, force) {
      const want = force === undefined ? !has(c) : !!force;
      if (want) this.add(c); else this.remove(c);
    },
  };
}

function makeDom() {
  const listeners = [];
  const all = [];
  function el(tag) {
    const node = {
      tagName: String(tag).toUpperCase(), attrs: {}, style: {}, children: [], parentNode: null,
      _handlers: {}, value: '', textContent: '', tabIndex: 0, disabled: false, type: '',
      _rect: null,
      get className() { return node.attrs['class'] || ''; },
      set className(v) { node.attrs['class'] = v; },
      get firstChild() { return node.children.length ? node.children[0] : null; },
      setAttribute(k, v) { node.attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(node.attrs, k) ? node.attrs[k] : null; },
      removeAttribute(k) { delete node.attrs[k]; },
      appendChild(c) {
        if (c.parentNode) {
          const arr = c.parentNode.children;
          const i = arr.indexOf(c);
          if (i >= 0) arr.splice(i, 1);
        }
        c.parentNode = node;
        node.children.push(c);
        return c;
      },
      insertBefore(newNode, ref) {
        if (newNode.parentNode) {
          const arr = newNode.parentNode.children;
          const i = arr.indexOf(newNode);
          if (i >= 0) arr.splice(i, 1);
        }
        newNode.parentNode = node;
        const refIdx = node.children.indexOf(ref);
        if (refIdx < 0) node.children.push(newNode); else node.children.splice(refIdx, 0, newNode);
        return newNode;
      },
      removeChild(c) {
        const i = node.children.indexOf(c);
        if (i >= 0) node.children.splice(i, 1);
        c.parentNode = null;
        return c;
      },
      addEventListener(type, fn) { (node._handlers[type] = node._handlers[type] || []).push(fn); },
      removeEventListener(type, fn) {
        if (!node._handlers[type]) return;
        const i = node._handlers[type].indexOf(fn);
        if (i >= 0) node._handlers[type].splice(i, 1);
      },
      dispatchEvent(evt) {
        evt.target = evt.target || node;
        (node._handlers[evt.type] || []).slice().forEach((fn) => fn(evt));
        if (evt.bubbles && node.parentNode) node.parentNode.dispatchEvent(evt);
        return true;
      },
      contains(other) {
        if (other === node) return true;
        return node.children.some((c) => c.contains(other));
      },
      focus() { dom.activeElement = node; },
      blur() {
        if (dom.activeElement === node) dom.activeElement = null;
        node.dispatchEvent({ type: 'blur' });
      },
      scrollIntoView() {},
      select() { node._selectCalled = true; },
      getBoundingClientRect() { return node._rect || DEFAULT_RECT; },
      querySelectorAll(sel) { return matchAll(sel, node); },
      trigger(type, evt) { node.dispatchEvent(Object.assign({ type }, evt || {})); },
    };
    node.classList = makeClassList(node);
    return node;
  }

  function matchAll(sel, scopeRoot) {
    const attrMatch = /^([a-zA-Z]+)\[([a-zA-Z-]+)="([^"]*)"\]$/.exec(sel);
    let pool = all;
    if (scopeRoot) {
      pool = [];
      (function walk(n) { pool.push(n); n.children.forEach(walk); })(scopeRoot);
    }
    if (attrMatch) {
      const tag = attrMatch[1].toUpperCase(), attr = attrMatch[2], val = attrMatch[3];
      return pool.filter((n) => n.tagName === tag && n.getAttribute(attr) === val);
    }
    if (sel.charAt(0) === '.') {
      const classes = sel.slice(1).split('.');
      return pool.filter((n) => n.classList && classes.every((c) => n.classList.contains(c)));
    }
    return [];
  }

  const dom = {
    activeElement: null,
    createElement(tag) { const n = el(tag); all.push(n); return n; },
    addEventListener(type, fn) { listeners.push([type, fn]); },
    _fire(type, evt) { listeners.filter((l) => l[0] === type).forEach((l) => l[1](evt || {})); },
    querySelectorAll(sel) { return matchAll(sel, null); },
    querySelector(sel) { return matchAll(sel, null)[0] || null; },
  };
  dom.body = el('div');
  all.push(dom.body);
  return { dom, el, all };
}

function makeWindow() {
  const handlers = {};
  return {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    removeEventListener(type, fn) {
      if (!handlers[type]) return;
      const i = handlers[type].indexOf(fn);
      if (i >= 0) handlers[type].splice(i, 1);
    },
    _handlers: handlers,
  };
}

function makeSelect(dom, name, optionRows) {
  const select = dom.createElement('select');
  select.setAttribute('name', name);
  select.selectedIndex = 0;
  select.options = optionRows.map((o) => {
    const opt = dom.createElement('option');
    opt.value = o.value;
    opt.text = o.text;
    return opt;
  });
  Object.defineProperty(select, 'value', {
    get() { return select.options[select.selectedIndex] ? select.options[select.selectedIndex].value : ''; },
  });
  return select;
}

function FakeEvent(type, opts) { this.type = type; this.bubbles = !!(opts && opts.bubbles); }

const { dom, el } = makeDom();
const win = makeWindow();

function makeField(select) {
  const wrap = el('div');
  wrap.appendChild(select);
  dom.body.appendChild(wrap);
  return wrap;
}

const selSub = makeSelect(dom, 'sub', [
  { value: '', text: '— ทุกบริษัท —' },
  { value: '2', text: 'Foodstar' },
  { value: '5', text: 'Other Co' },
]);
const selLoc = makeSelect(dom, 'loc', [
  { value: '', text: '— ทุกสถานที่ —' },
  { value: '10', text: 'PD_B1' },
  { value: '23', text: 'PD_B2' },
]);
const fieldSub = makeField(selSub);
makeField(selLoc);
selSub._rect = Object.assign({}, DEFAULT_RECT);
selLoc._rect = Object.assign({}, DEFAULT_RECT);

const run = new Function('document', 'window', 'Event', engineJs);
run(dom, win, FakeEvent);

// ── init ──────────────────────────────────────────────────────────────
console.log('\n── init ──');
[selSub, selLoc].forEach((select, i) => {
  const wrapper = select.parentNode;
  eq('select #' + i + ' ถูกครอบด้วย .rw-combobox', wrapper && wrapper.classList.contains('rw-combobox'), true);
  eq('select #' + i + ' data-searchable=1', select.getAttribute('data-searchable'), '1');
  eq('select #' + i + ' ซ่อนด้วย sr-only (ไม่ใช่ display:none)', select.classList.contains('sr-only'), true);
  eq('select #' + i + ' ไม่มี style.display ถูกตั้งค่า', select.style.display, undefined);
  eq('select #' + i + ' tabIndex = -1', select.tabIndex, -1);
});

const wSub = selSub.parentNode;
const inputSub = wSub.children.filter((c) => c.tagName === 'INPUT')[0];
eq('มีช่องค้นหาในกล่อง sub', !!inputSub, true);
eq('ช่องค้นหาแสดงค่าเริ่มต้นตาม select', inputSub.value, '— ทุกบริษัท —');
eq('ไม่มีปุ่ม clear (✕) ในกล่อง', wSub.children.some((c) => c.tagName === 'BUTTON'), false);

// ── ไม่ double-init ───────────────────────────────────────────────────
console.log('\n── เรียกซ้ำไม่ init ซ้ำ ──');
eq('มี window.__rwEnhanceSelect ให้เรียกตรง ๆ', typeof win.__rwEnhanceSelect === 'function', true);
win.__rwEnhanceSelect(selSub);
eq('เรียกซ้ำไม่สร้าง .rw-combobox ซ้อนอีกชั้น (ยังมีแค่ใบเดียวในกล่องนอก)',
  fieldSub.children.filter((c) => c.classList && c.classList.contains('rw-combobox')).length, 1);
eq('เรียกซ้ำ select ยังอยู่ที่ wrapper เดิม (ไม่ถูกย้าย/สร้างใหม่)', selSub.parentNode === wSub, true);
eq('เรียกซ้ำไม่เพิ่มช่องค้นหาซ้ำ', wSub.children.filter((c) => c.tagName === 'INPUT').length, 1);

// ── เปิด + กรอง ──────────────────────────────────────────────────────
console.log('\n── เปิด + กรอง ──');
inputSub.trigger('focus', {});
let list = dom.body.children.filter((c) => c.className === 'rw-combobox-list')[0];
eq('โฟกัสแล้ว dropdown เปิดที่ <body>', !!list, true);
eq('dropdown เป็น role=listbox', list && list.getAttribute('role'), 'listbox');
eq('dropdown position เป็น fixed', list && list.style.position, 'fixed');
let rows = list.children.filter((c) => c.className.indexOf('rw-combobox-option') >= 0);
eq('ยังไม่กรอง — เห็นตัวเลือกครบ (3 ตัวเลือก)', rows.length, 3);

inputSub.value = 'other';
inputSub.trigger('input', {});
list = dom.body.children.filter((c) => c.className === 'rw-combobox-list')[0];
rows = list.children.filter((c) => c.className.indexOf('rw-combobox-option') >= 0);
eq('พิมพ์ "other" แล้วตัวเลือกลดเหลือที่ตรงกัน', rows.length, 1);
eq('ตัวที่เหลือคือ Other Co', rows[0].textContent, 'Other Co');

// ── Enter → change ครั้งเดียว พร้อมค่าถูก ───────────────────────────────
console.log('\n── Enter → change ครั้งเดียว ──');
inputSub.value = 'foodstar';
inputSub.trigger('input', {});
let changeCount = 0;
let lastValue = null;
selSub.addEventListener('change', (e) => { changeCount++; lastValue = e.target.value; });
inputSub.trigger('keydown', { key: 'Enter', preventDefault() {} });
eq('Enter ยิง change ครั้งเดียว', changeCount, 1);
eq('ค่าที่ได้ถูกต้อง (id 2 = Foodstar)', lastValue, '2');
eq('select.selectedIndex อัปเดตจริง', selSub.selectedIndex, 1);
eq('dropdown ปิดหลังเลือก', dom.body.children.some((c) => c.className === 'rw-combobox-list'), false);

// ── คลิกนอกปิด dropdown โดยไม่แตะค่า ────────────────────────────────────
console.log('\n── คลิกนอกปิด dropdown ──');
inputSub.trigger('focus', {});
const outside = el('div');
dom._fire('mousedown', { target: outside });
eq('คลิกนอกปิด dropdown', dom.body.children.some((c) => c.className === 'rw-combobox-list'), false);
eq('ค่าที่เลือกไว้ยังเป็นเดิม', selSub.value, '2');

// ── repopulate: signature ต้องรวม label ──────────────────────────────────
console.log('\n── repopulate เมื่อ label เปลี่ยน (signature ต้องรวม text) ──');
const sigMatch = engineJs.match(/function _sig\(select\) \{[\s\S]*?\n  \}/);
eq('ดึงฟังก์ชัน _sig ออกมาได้', !!sigMatch, true);
const _sig = sigMatch ? new Function(sigMatch[0] + ';\nreturn _sig;')() : () => '';
function buggySig(select) {
  const opts = select.options;
  if (!opts.length) return '0';
  return opts.length + '|' + opts[0].value + '|' + opts[opts.length - 1].value;
}
const sigBefore = _sig(selSub);
const buggySigBefore = buggySig(selSub);
selSub.options[2].text = 'Other Co (ชื่อใหม่)';
const sigAfter = _sig(selSub);
const buggySigAfter = buggySig(selSub);
eq('signature จริงของเราเปลี่ยนตามชื่อที่แสดง', sigBefore === sigAfter, false);
eq('mutation-proof: signature length+value อย่างเดียว (บั๊กเดิมของ MRP) มองไม่เห็นการเปลี่ยนชื่อนี้',
  buggySigBefore === buggySigAfter, true);

win.__rwEnhanceSelect(selSub);
inputSub.value = '';
inputSub.trigger('focus', {});
const listAfter = dom.body.children.filter((c) => c.className === 'rw-combobox-list')[0];
const rowsAfter = listAfter.children.filter((c) => c.className.indexOf('rw-combobox-option') >= 0);
eq('repopulate แล้วเห็นชื่อใหม่ในรายการ', rowsAfter.some((r) => r.textContent === 'Other Co (ชื่อใหม่)'), true);
eq('ชื่อเก่าไม่ค้างอยู่ในรายการ', rowsAfter.some((r) => r.textContent === 'Other Co'), false);
inputSub.trigger('keydown', { key: 'Escape', preventDefault() {} });

// ── regression: focus เลือกข้อความทั้งช่อง + พิมพ์ตอนปิดอยู่ต้องกรองจริง ──────────
// บั๊กที่แก้จริง (พบตอนรีวิว): _open() เดิมเคยรีเซ็ต w._filterText = '' เอง ทำให้ตัวอักษรแรก
// ที่พิมพ์ตอนช่องยังปิดอยู่ถูกโยนทิ้ง (handler ของ 'input' ตั้งค่าไว้ก่อนเรียก _open() แล้ว
// _open() มาล้างทับซ้ำ) — ใช้ selLoc (ยังไม่ถูกแตะจากเทสก่อนหน้า) พิสูจน์แยกจาก selSub
console.log('\n── regression: focus เลือกข้อความทั้งช่อง + พิมพ์ตอนปิดอยู่ต้องกรองจริง ──');
const wLoc = selLoc.parentNode;
const inputLoc = wLoc.children.filter((c) => c.tagName === 'INPUT')[0];
eq('ก่อนโฟกัส ยังไม่เรียก input.select()', !!inputLoc._selectCalled, false);
inputLoc.trigger('focus', {});
eq('โฟกัสแล้วเรียก input.select() (พิมพ์ทับป้ายเดิมได้ทันทีแบบ combobox ทั่วไป)',
  !!inputLoc._selectCalled, true);
inputLoc.trigger('keydown', { key: 'Escape', preventDefault() {} });
eq('ปิดแล้วก่อนเริ่มเคสถัดไป', wLoc.classList.contains('is-open'), false);

inputLoc.value = 'PD_B2';
inputLoc.trigger('input', {});
const listLoc = dom.body.children.filter((c) => c.className === 'rw-combobox-list')[0];
eq('พิมพ์ตอนช่องปิดอยู่ทำให้เปิด', !!listLoc, true);
const rowsLoc = listLoc ? listLoc.children.filter((c) => c.className.indexOf('rw-combobox-option') >= 0) : [];
eq('เปิดจากการพิมพ์ตอนปิดอยู่ ต้องกรองตามที่พิมพ์ทันที (ไม่ใช่โชว์ครบ 3 ตัวเลือก — บั๊กเดิม)',
  rowsLoc.length, 1);
eq('ตัวที่เหลือคือ PD_B2 ตรงกับที่พิมพ์', rowsLoc[0] && rowsLoc[0].textContent, 'PD_B2');
inputLoc.trigger('keydown', { key: 'Escape', preventDefault() {} });

// ── select 3 ตัวเลือกก็ถูก enhance (พิสูจน์ว่าไม่มี threshold) ─────────────
console.log('\n── select 3 ตัวเลือกก็ถูก enhance ──');
const tinyWrap = el('div');
const tinySelect = makeSelect(dom, 'tinyTest', [
  { value: 'a', text: 'A' }, { value: 'b', text: 'B' }, { value: 'c', text: 'C' },
]);
tinyWrap.appendChild(tinySelect);
dom.body.appendChild(tinyWrap);
win.__rwEnhanceSelect(tinySelect);
eq('select 3 ตัวเลือกถูกครอบเป็น combobox เหมือนกันทุกประการ (ไม่มี threshold กัน)',
  tinySelect.parentNode.classList.contains('rw-combobox'), true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
