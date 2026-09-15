/**
 * เทส — Redwood searchable combobox ของ WO Status Tracking (issue #64 ขั้น 3 — list field)
 *
 * สามช่องข้อมูล (มาจาก SuiteQL): subsidiaryId · locationId · subItemTypeId ต้องถูกครอบเป็น
 * combobox ค้นได้ — ตัวควบคุมรายการสั้นคงที่ (sort/month/basis) ไม่มีอยู่ในหน้านี้ (อยู่ที่
 * wo-cost-trace แทน มีเทสของตัวเองที่ test_summary_listfield.js)
 *
 * ทำตามท่าเดียวกับ test_wostatus_datefilter.js: ดึงโค้ด client ออกจาก HTML ที่ render จริง
 * มารันบน DOM ปลอมขั้นต่ำ พิสูจน์ว่า "กด" ได้จริง ไม่ใช่แค่ parse ผ่าน
 *
 * เทสนี้ตั้งใจพิสูจน์สัญญาที่ห้ามแตะทุกข้อ (ดู list-field.md):
 *   - <select> ยังอยู่ใน DOM ซ่อนด้วย sr-only (ไม่ใช่ display:none) — label for= ยังโฟกัสไปหาได้
 *   - เลือกแล้ว select.selectedIndex = i แล้ว dispatchEvent('change',{bubbles:true}) ครั้งเดียว
 *   - ไม่มีปุ่ม ✕
 *   - init ซ้ำไม่ได้ (data-searchable=1) — เรียกซ้ำ = sync
 *   - signature รวม label ไม่ใช่แค่ length+value (บั๊กจริงของ MRP)
 *   - ไม่มีเกณฑ์ตัดจำนวนตัวเลือก (>8 ถูกผู้ใช้ปฏิเสธแล้ว — MRP #500)
 */
const H = require('../../../test/lib/_harness');

const eq = H.makeEq();

const SUBS = [{ id: '2', name: 'Foodstar Co., Ltd.' }, { id: '5', name: 'FS Group' }];
const LOCS = [{ id: '10', name: 'PD_B1' }, { id: '23', name: 'PD_B2' }, { id: '30', name: 'PD_B3' }];
const SIT = [{ id: '1', name: 'วัตถุดิบหลัก' }, { id: '4', name: 'บรรจุภัณฑ์' }];

function sqlRows(sql) {
  if (/FROM subsidiary/i.test(sql)) return SUBS;
  if (/FROM location WHERE custrecord_mfg_productionplant/i.test(sql)) return LOCS;
  if (/customrecord_cseg_subitemtype/.test(sql)) return SIT;
  return [];
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

const form = run({});

// ── ชั้น 1: markup ยังตรงสัญญา ────────────────────────────────────────────
console.log('\n── markup ของช่องข้อมูล ──');
eq('subsidiaryId ยังเป็น <select> เดิม ไม่มี attribute แปลกเพิ่ม',
  /<select name="subsidiaryId">/.test(form), true);
eq('locationId ยังเป็น <select> เดิม', /<select name="locationId">/.test(form), true);
eq('subItemTypeId ยังเป็น <select> เดิม', /<select name="subItemTypeId">/.test(form), true);

// ── ชั้น 2: CSS block ต้องอยู่ครบ (ก๊อปมาจาก shared/WOReportTheme.js ผ่าน sync:theme) ──
console.log('\n── CSS block ──');
const styleBlock = (form.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
[
  '.rw-select', '.rw-combobox{', '.rw-combobox-input', '.rw-combobox-chevron',
  '.rw-combobox-list', '.rw-combobox-option', '.rw-combobox-empty',
  '.rw-combobox-clear{display:none !important}', '.sr-only{',
].forEach((needle) => {
  eq('CSS มี ' + needle, styleBlock.indexOf(needle) >= 0, true);
});
eq('.sr-only ไม่ใช้ display:none (ต้องยังโฟกัสได้ผ่าน label for=)',
  /\.sr-only\{[^}]*display:\s*none/.test(styleBlock), false);
eq('ไม่มี content:\'▼\' เหลืออยู่ (ต้องเป็น svg ล้วน)', styleBlock.indexOf("content:'▼'") >= 0, false);
eq('ไม่มีตัวอักษร ▼ ในทุกที่ของหน้า', form.indexOf('▼') >= 0, false);
eq('ไม่มีตัวอักษร ⯆ ในทุกที่ของหน้า', form.indexOf('⯆') >= 0, false);

// ── ชั้น 3: script parse ได้ทั้งก้อน ──────────────────────────────────────
console.log('\n── JS ฝั่งเบราว์เซอร์ต้อง parse ผ่าน ──');
const scripts = form.match(/<script>[\s\S]*?<\/script>/g) || [];
let parsed = 0;
scripts.forEach((block, i) => {
  const js = block.replace(/^<script>/, '').replace(/<\/script>$/, '');
  try { new Function(js); parsed++; } catch (e) { H.addFail('script block ' + i + ' parse ไม่ผ่าน: ' + e.message); }
});
eq('ทุก block parse ผ่าน', parsed, scripts.length);

// ── รันเอนจินคอมโบบ็อกซ์จริงบน DOM ปลอม ──────────────────────────────────
console.log('\n── รันคอมโบบ็อกซ์บน DOM ปลอม ──');

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
      // trigger() จำลอง event จริง (focus/input/keydown/...) ผ่าน dispatchEvent เดียวกัน —
      // evt เพิ่ม type ให้เอง ผู้เรียกส่งมาแค่ payload (key/preventDefault/ฯลฯ)
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

/** select ปลอม + option — value/text แบบเดียวกับ DOM จริง (selectedIndex ตัดสิน .value) */
function makeSelect(dom, name, optionRows) {
  const select = dom.createElement("select");
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

const engineSrc = (form.match(
  /\/\/ ── Redwood searchable combobox[\s\S]*?\n\}\)\(\);/
) || [])[0];
eq('ดึงโค้ดคอมโบบ็อกซ์ออกมาได้', !!engineSrc, true);

const chevronSvgJson = (form.match(/const RW_CHEVRON_SVG = ([\s\S]*?);\n/) || [])[1];
eq('ดึง RW_CHEVRON_SVG ออกมาได้', !!chevronSvgJson, true);

// ── มัดพิสูจน์ "ไม่มีเกณฑ์ตัดจำนวนตัวเลือก" (MRP #500 ปฏิเสธ >8) ────────────
console.log('\n── ไม่มี threshold ตัดจำนวนตัวเลือก ──');
eq('ไม่มีการเทียบ options.length กับตัวเลข (threshold)',
  /opts\.length\s*[<>]=?\s*\d|options\.length\s*[<>]=?\s*\d/.test(engineSrc), false);
eq('ไม่มี .style.display ถูกตั้งค่าที่ไหนเลย (ต้องซ่อนด้วย sr-only เท่านั้น)',
  /\.style\.display\s*=/.test(engineSrc), false);
eq('ไม่มีปุ่ม ✕ / clear ถูกสร้างขึ้นจริงในโค้ด (createElement ปุ่ม clear)',
  /rw-combobox-clear/.test(engineSrc), false);

if (engineSrc && chevronSvgJson) {
  const { dom, el } = makeDom();
  const win = makeWindow();

  function makeFld(select) {
    const fld = el('div');
    fld.className = 'fld';
    fld.appendChild(select);
    dom.body.appendChild(fld);
    return fld;
  }

  const selSub = makeSelect(dom, 'subsidiaryId', [
    { value: '', text: 'ทุกบริษัท' },
    { value: '2', text: 'Foodstar Co., Ltd.' },
    { value: '5', text: 'FS Group' },
  ]);
  const selLoc = makeSelect(dom, 'locationId', [
    { value: '', text: 'ทุกอาคารผลิต' },
    { value: '10', text: 'PD_B1' },
    { value: '23', text: 'PD_B2' },
  ]);
  const selSit = makeSelect(dom, 'subItemTypeId', [
    { value: '', text: 'ทุกประเภทย่อย' },
    { value: '1', text: 'วัตถุดิบหลัก' },
    { value: '4', text: 'บรรจุภัณฑ์' },
  ]);
  makeFld(selSub);
  makeFld(selLoc);
  makeFld(selSit);
  selSub._rect = Object.assign({}, DEFAULT_RECT);
  selLoc._rect = Object.assign({}, DEFAULT_RECT);
  selSit._rect = Object.assign({}, DEFAULT_RECT);

  const run = new Function('document', 'window', 'Event', 'RW_CHEVRON_SVG', engineSrc);
  function FakeEvent(type, opts) { this.type = type; this.bubbles = !!(opts && opts.bubbles); }
  run(dom, win, FakeEvent, JSON.parse(chevronSvgJson));

  // ── init: ทั้งสามช่องถูกครอบเป็น combobox ───────────────────────────────
  console.log('\n── init ──');
  [selSub, selLoc, selSit].forEach((select, i) => {
    const wrapper = select.parentNode;
    eq('select #' + i + ' ถูกครอบด้วย .rw-combobox', wrapper && wrapper.classList.contains('rw-combobox'), true);
    eq('select #' + i + ' ยัง data-searchable=1', select.getAttribute('data-searchable'), '1');
    eq('select #' + i + ' ซ่อนด้วย sr-only (ไม่ใช่ display:none)', select.classList.contains('sr-only'), true);
    eq('select #' + i + ' ไม่มี style.display ถูกตั้งค่า', select.style.display, undefined);
    eq('select #' + i + ' tabIndex = -1', select.tabIndex, -1);
    eq('select #' + i + ' ยังอยู่ใน DOM จริง (เป็นลูกของ wrapper)', wrapper.children.indexOf(select) >= 0, true);
  });

  const wSub = selSub.parentNode;
  const inputSub = wSub.children.filter((c) => c.tagName === 'INPUT')[0];
  eq('มีช่องค้นหาในกล่อง subsidiaryId', !!inputSub, true);
  eq('ช่องค้นหาแสดงค่าเริ่มต้นตาม select (ทุกบริษัท)', inputSub.value, 'ทุกบริษัท');
  eq('มี chevron span', wSub.children.some((c) => c.className === 'rw-combobox-chevron'), true);
  eq('ไม่มีปุ่ม clear (✕) ในกล่อง', wSub.children.some((c) => c.tagName === 'BUTTON'), false);

  // ── ไม่ double-init ──────────────────────────────────────────────────
  console.log('\n── เรียกซ้ำไม่ init ซ้ำ ──');
  eq('มี window.__rwEnhanceSelect ให้เรียกตรง ๆ หลัง init รอบแรก', typeof win.__rwEnhanceSelect === 'function', true);
  // เรียก enhance ซ้ำตรง ๆ ผ่าน window.__rwEnhanceSelect (ท่าเดียวกับที่โค้ดจริงเรียกตอน sync) —
  // ไม่ใช่การรัน IIFE ทั้งก้อนใหม่ (การรันซ้ำทั้งก้อนจะไป querySelector หา select ทั้งสามตัวอีกครั้ง
  // ด้วย ซึ่งก็ต้องไม่ init ซ้ำเหมือนกัน แต่ที่นี่ตั้งใจพิสูจน์ทาง enhanceRwSelect ตรง ๆ ก่อน)
  win.__rwEnhanceSelect(selSub);
  eq('เรียกซ้ำไม่สร้าง .rw-combobox ซ้อนอีกชั้น',
    dom.body.children.filter((c) => c.classList && c.classList.contains('fld')).every(
      (fld) => fld.children.filter((c) => c.classList && c.classList.contains('rw-combobox')).length === 1
    ), true);
  eq('เรียกซ้ำไม่เพิ่มช่องค้นหาซ้ำ', wSub.children.filter((c) => c.tagName === 'INPUT').length, 1);

  // ── เปิด dropdown แล้วกรอง ───────────────────────────────────────────
  console.log('\n── เปิด + กรอง ──');
  inputSub.trigger('focus', {});
  let list = dom.body.children.filter((c) => c.className === 'rw-combobox-list')[0];
  eq('โฟกัสช่องค้นหาแล้ว dropdown เปิดที่ <body>', !!list, true);
  eq('dropdown เป็น role=listbox', list && list.getAttribute('role'), 'listbox');
  eq('dropdown position เป็น fixed (ท่าเดียวกับปฏิทิน)', list && list.style.position, 'fixed');
  let rows = list.children.filter((c) => c.className.indexOf('rw-combobox-option') >= 0);
  eq('ยังไม่กรอง — เห็นตัวเลือกครบ (3 ตัวเลือก)', rows.length, 3);

  inputSub.value = 'fs';
  inputSub.trigger('input', {});
  list = dom.body.children.filter((c) => c.className === 'rw-combobox-list')[0];
  rows = list.children.filter((c) => c.className.indexOf('rw-combobox-option') >= 0);
  eq('พิมพ์ "fs" แล้วตัวเลือกลดเหลือที่ตรงกัน (FS Group)', rows.length, 1);
  eq('ตัวที่เหลือคือ FS Group', rows[0].textContent, 'FS Group');

  inputSub.value = 'ไม่มีทางตรง';
  inputSub.trigger('input', {});
  list = dom.body.children.filter((c) => c.className === 'rw-combobox-list')[0];
  eq('พิมพ์คำที่ไม่ตรงเลย → แสดงข้อความไม่พบ', list.children.some((c) => c.className === 'rw-combobox-empty'), true);

  // ── Enter เลือก → change 1 ครั้งพร้อมค่าถูก ─────────────────────────────
  console.log('\n── Enter → change ครั้งเดียว ──');
  inputSub.value = 'foodstar';
  inputSub.trigger('input', {});
  let changeCount = 0;
  let lastValue = null;
  selSub.addEventListener('change', (e) => {
    changeCount++;
    lastValue = e.target.value;
  });
  inputSub.trigger('keydown', { key: 'Enter', preventDefault() {} });
  eq('Enter ยิง change ครั้งเดียว', changeCount, 1);
  eq('ค่าที่ได้ถูกต้อง (id 2 = Foodstar)', lastValue, '2');
  eq('select.selectedIndex อัปเดตจริง', selSub.selectedIndex, 1);
  eq('dropdown ปิดหลังเลือก', dom.body.children.some((c) => c.className === 'rw-combobox-list'), false);
  eq('ช่องค้นหาแสดงชื่อที่เลือก', inputSub.value, 'Foodstar Co., Ltd.');

  // เลือกซ้ำอีกครั้งด้วยตัวเลือกเดิม (เปิด-กด Enter โดยไม่พิมพ์กรอง) ต้องยัง 1 ครั้งต่อครั้งกด
  changeCount = 0;
  inputSub.trigger('focus', {});
  inputSub.trigger('keydown', { key: 'Enter', preventDefault() {} });
  eq('กด Enter อีกครั้งบนตัวเลือกที่ active อยู่แล้ว ก็ยังยิง change แค่ 1 ครั้ง', changeCount, 1);

  // ── คลิกนอกปิด dropdown โดยไม่เปลี่ยนค่า ────────────────────────────────
  console.log('\n── คลิกนอกปิด dropdown ──');
  inputSub.trigger('focus', {});
  eq('เปิดอยู่ก่อนคลิกนอก', dom.body.children.some((c) => c.className === 'rw-combobox-list'), true);
  const outside = el('div');
  dom._fire('mousedown', { target: outside });
  eq('คลิกนอกปิด dropdown', dom.body.children.some((c) => c.className === 'rw-combobox-list'), false);
  eq('ค่าที่เลือกไว้ยังเป็นเดิม (คลิกนอกไม่แตะค่า)', selSub.value, '2');

  // ── repopulate: signature ต้องรวม label — เห็นค่าใหม่หลังชื่อเปลี่ยน ─────
  console.log('\n── repopulate เมื่อ label เปลี่ยน (signature ต้องรวม text) ──');
  const sigMatch = engineSrc.match(/function _sig\(select\) \{[\s\S]*?\n  \}/);
  eq('ดึงฟังก์ชัน _sig ออกมาได้', !!sigMatch, true);
  const _sig = sigMatch
    ? new Function(sigMatch[0] + ';\nreturn _sig;')()
    : () => '';
  // signature แบบเดิมของ MRP (บั๊กจริง) — length+value อย่างเดียว ไม่รวม text/label
  function buggySig(select) {
    const opts = select.options;
    if (!opts.length) return '0';
    return opts.length + '|' + opts[0].value + '|' + opts[opts.length - 1].value;
  }
  const sigBefore = _sig(selSub);
  const buggySigBefore = buggySig(selSub);
  // เปลี่ยนแค่ "ชื่อที่แสดง" ของตัวเลือกตัวสุดท้าย — จำนวนตัวเลือกและ value เดิมทุกตัว
  selSub.options[2].text = 'FS Group (เปลี่ยนชื่อใหม่)';
  const sigAfter = _sig(selSub);
  const buggySigAfter = buggySig(selSub);
  eq('signature จริงของเราเปลี่ยนตามชื่อที่แสดง (ไม่ใช่แค่ length/value)', sigBefore === sigAfter, false);
  // mutation-proof (บั๊กจริงของ makeSearchableSelect ใน MRP): signature ที่ใช้แค่ length+value
  // "มองไม่เห็น" การเปลี่ยนชื่อนี้เลย — ถ้า _sig ของเราถูกลดรูปกลับไปเป็นแบบนี้เมื่อไหร่ บรรทัดข้างบน
  // (sigBefore === sigAfter ต้องเป็น false) จะกลับมาเป็น true ทันที คือด่านที่ต้องแดงเมื่อ mutate
  eq('mutation-proof: signature แบบ length+value อย่างเดียว (บั๊กเดิมของ MRP) มองไม่เห็นการเปลี่ยนชื่อเดียวกันนี้',
    buggySigBefore === buggySigAfter, true);

  // รัน enhance ซ้ำ (จำลอง repopulate) แล้วเปิด dropdown ดูว่าเห็นชื่อใหม่จริงในรายการ
  run(dom, win, FakeEvent, JSON.parse(chevronSvgJson));
  inputSub.value = '';
  inputSub.trigger('focus', {});
  const listAfter = dom.body.children.filter((c) => c.className === 'rw-combobox-list')[0];
  const rowsAfter = listAfter.children.filter((c) => c.className.indexOf('rw-combobox-option') >= 0);
  eq('repopulate แล้วเห็นชื่อใหม่ในรายการ', rowsAfter.some((r) => r.textContent === 'FS Group (เปลี่ยนชื่อใหม่)'), true);
  eq('ชื่อเก่าไม่ค้างอยู่ในรายการ', rowsAfter.some((r) => r.textContent === 'FS Group'), false);
  inputSub.trigger('keydown', { key: 'Escape', preventDefault() {} });

  // ── regression: focus เลือกข้อความทั้งช่อง + พิมพ์ตอนปิดอยู่ต้องกรองจริง ──────
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

  // ── list 3 ตัวเลือกก็ถูก enhance (พิสูจน์ว่าไม่มี threshold) ─────────────
  console.log('\n── select 3 ตัวเลือกก็ถูก enhance ──');
  const tinyFld = el('div');
  const tinySelect = makeSelect(dom, 'tinyTest', [
    { value: 'a', text: 'A' }, { value: 'b', text: 'B' }, { value: 'c', text: 'C' },
  ]);
  tinyFld.appendChild(tinySelect);
  dom.body.appendChild(tinyFld);
  // เรียกผ่าน window.__rwEnhanceSelect ที่โค้ดจริงแนบไว้ (ดูท้ายไฟล์ WOStatusTracking.js)
  eq('มี window.__rwEnhanceSelect ให้เรียกตรง ๆ', typeof win.__rwEnhanceSelect === 'function', true);
  win.__rwEnhanceSelect(tinySelect);
  eq('select 3 ตัวเลือกถูกครอบเป็น combobox เหมือนกันทุกประการ (ไม่มี threshold กัน)',
    tinySelect.parentNode.classList.contains('rw-combobox'), true);
}

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
