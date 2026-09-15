/**
 * เทส — CSS ของ dropdown panel (.rw-combobox-list/.rw-combobox-option/.rw-combobox-empty)
 * ต้อง "match" กับ DOM จริงหลัง portal ไป <body> (issue #64 ขั้น 3 — bug พบตอน deploy ขึ้น SB1)
 *
 * บั๊กจริงที่เจอ: `enhanceRwSelect()` ทำ `document.body.appendChild(list)` ย้าย panel ไปอยู่
 * ใต้ <body> ตรง ๆ (ท่าเดียวกับปฏิทินของ #64 ขั้น 4 — จำเป็นเพราะ dropdown อยู่ในกล่อง
 * overflow:hidden/auto ของหน้า) แต่ CSS ตอนนั้นยังเขียนเป็น **descendant selector**
 * `.rw-combobox .rw-combobox-list{...}` ซึ่งไม่มีวันตรงกับ DOM จริงอีกต่อไป (panel ไม่ใช่ลูกของ
 * .rw-combobox แล้ว) — ผลคือ panel ไม่ได้พื้น/ขอบ/เงา/max-height/z-index อะไรเลย กลายเป็น
 * ตัวหนังสือลอยไม่มีกรอบ ล้นจอ (getComputedStyle ยืนยันแล้วว่าทุกค่าเป็น initial)
 *
 * ปัญหาชนิดนี้ (selector ไม่ตรงกับ DOM จริง) เคยเกิดมาแล้วที่ #45 (`.filterbar button`) —
 * เทสแบบ "สแกนว่าข้อความ CSS มีอยู่" (เช่นที่ test_wostatus_listfield.js ทำ) จับไม่ได้เลย
 * เพราะ selector ที่ผิดก็ยัง "มีอยู่ในข้อความ" ปกติ — เทสนี้จึงต้อง**จำลอง DOM จริงหลัง portal**
 * แล้วเช็คว่า selector ที่ใช้จริง "match" element ที่ตำแหน่งนั้นหรือไม่ ไม่ใช่แค่เช็คว่ามีข้อความ
 *
 * ขอบเขต: ตรวจเฉพาะกฎที่ "ต้อง" match panel/option/empty ที่ portal ไป body แล้ว (พื้น สี ขอบ
 * เงา max-height overflow-y z-index) — .rw-combobox-input/.rw-combobox-chevron/.rw-combobox-clear
 * ยังเป็นลูกจริงของ .rw-combobox เสมอ (ไม่ถูก portal) จึงยังใช้ descendant selector ได้ปกติ
 * และมีเทสยันแยกไว้ว่ายัง match ด้วยเช่นกัน (กันเผื่อมีคนลบ ".rw-combobox " ออกทั้งที่ไม่ควร)
 */
const fs = require('fs');
const path = require('path');
const H = require('./lib/_harness');

const eq = H.makeEq();

// ── ตัวช่วย: parse + match selector อย่างง่าย (รองรับ descendant combinator ระดับเดียว
//    ที่โครงสร้างจริงของเราใช้ — class, [attr="value"]/[attr], ตัด pseudo-class ก่อน parse
//    เพราะที่นี่สนใจแค่ "อยู่ตรงไหนใน DOM" ไม่สนใจ state ชั่วคราวอย่าง :hover/:focus) ──
function parseSimpleSelector(token) {
  const classes = (token.match(/\.[a-zA-Z0-9_-]+/g) || []).map((c) => c.slice(1));
  const attrs = [];
  const attrRe = /\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g;
  let m;
  while ((m = attrRe.exec(token))) attrs.push({ name: m[1], value: m[2] });
  const tag = (token.match(/^[a-zA-Z][a-zA-Z0-9]*/) || [])[0] || null;
  return { classes, attrs, tag };
}

function elementMatchesSimple(simple, el) {
  if (simple.tag && (el.tag || '').toLowerCase() !== simple.tag.toLowerCase()) return false;
  if (!simple.classes.every((c) => (el.classes || []).indexOf(c) >= 0)) return false;
  return simple.attrs.every((a) => (
    a.value === undefined ? Object.prototype.hasOwnProperty.call(el.attrs || {}, a.name)
      : (el.attrs || {})[a.name] === a.value
  ));
}

/**
 * selector ตัวเดียว (ตัดด้วย comma มาแล้ว) match element ที่ตำแหน่งจริงใน DOM หรือไม่
 * @param {string} selector      เช่น ".rw-combobox .rw-combobox-list" หรือ ".rw-combobox-list"
 * @param {object} el            { tag, classes, attrs } ของ element เป้าหมาย
 * @param {object[]} ancestors   ancestor เรียงจากใกล้สุดไปไกลสุด (parentNode ก่อน แล้วค่อย root)
 */
function selectorMatchesElement(selector, el, ancestors) {
  const clean = selector.trim().replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  const last = parseSimpleSelector(parts[parts.length - 1]);
  if (!elementMatchesSimple(last, el)) return false;
  let chain = ancestors.slice();
  for (let i = parts.length - 2; i >= 0; i--) {
    const simple = parseSimpleSelector(parts[i]);
    let foundAt = -1;
    for (let j = 0; j < chain.length; j++) {
      if (elementMatchesSimple(simple, chain[j])) { foundAt = j; break; }
    }
    if (foundAt < 0) return false;
    chain = chain.slice(foundAt + 1);
  }
  return true;
}

/** ดึง {selector, body} ทุกกฎจาก CSS ที่ resolve จริงแล้ว (ไม่ใช่ text ของ .js source) */
function parseRules(css) {
  const rules = css.match(/[^{}]+\{[^{}]*\}/g) || [];
  const out = [];
  rules.forEach((rule) => {
    const m = /^([^{]+)\{([^}]*)\}$/.exec(rule);
    if (!m) return;
    m[1].split(',').forEach((sel) => out.push({ selector: sel.trim(), body: m[2] }));
  });
  return out;
}

/** declaration ที่ match element นี้ (รวมทุกกฎที่ match ต่อกันเป็นก้อนเดียว ก้อนหลังทับก้อนก่อน
 *  แบบง่าย ๆ พอสำหรับเช็คว่า "property นี้ถูกตั้งค่าไว้จริง" ไม่ใช่ resolve cascade เป๊ะ ๆ) */
function computedDeclarations(rules, el, ancestors) {
  let body = '';
  rules.forEach((r) => {
    if (selectorMatchesElement(r.selector, el, ancestors)) body += ';' + r.body;
  });
  return body;
}

function hasDecl(body, propValueRe) {
  return propValueRe.test(body);
}

// ── โหลดหน้าเต็มของ wo-status (มี CSS ที่ resolve จริงแล้วใน <style>) ─────
const { module: statusMod } = H.load({
  file: 'WOStatusTracking.js',
  libs: [
    'WOReportTheme.js',
    'WOStatusTracking_Labels.js',
    'WOStatusTracking_Queries.js',
    'WOStatusTracking_Drilldown.js',
  ],
  requireRunSQL: false,
  sqlRows: () => [],
  quietLog: true,
});
const statusChunks = [];
statusMod.onRequest({
  request: { parameters: {} },
  response: { write: (s) => statusChunks.push(String(s)), setHeader: () => {} },
});
const statusPage = statusChunks.join('');
const styleBlock = (statusPage.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
eq('ดึง <style> ของหน้าเต็มได้', styleBlock.length > 0, true);

/** จำลองโครง DOM จริงหลังเอนแฮนซ์ + เปิด dropdown (ดู enhanceRwSelect/_open ใน WOStatusTracking.js)
 *  wrapper = .rw-combobox (ลูกของ .fld) · input/chevron ยังเป็นลูกของ wrapper ·
 *  list/option/empty ถูก document.body.appendChild(list) ย้ายไปเป็นลูกของ <body> ตรง ๆ — ไม่ใช่
 *  ลูกของ wrapper อีกต่อไป (นี่คือจุดที่บั๊กเกิด) */
function buildPortalDom() {
  const body = { tag: 'div', classes: [], attrs: {} }; // ตัวแทน <body> (ไม่มีคลาส)
  const fld = { tag: 'div', classes: ['fld'], attrs: {} };
  const wrapper = { tag: 'div', classes: ['rw-combobox'], attrs: {} };
  const input = { tag: 'input', classes: ['rw-combobox-input'], attrs: {} };
  const chevron = { tag: 'span', classes: ['rw-combobox-chevron'], attrs: {} };
  const list = { tag: 'div', classes: ['rw-combobox-list'], attrs: { role: 'listbox' } }; // ← ลูกของ body
  const optionPlain = { tag: 'div', classes: ['rw-combobox-option'], attrs: { 'aria-selected': 'false' } };
  const optionActive = { tag: 'div', classes: ['rw-combobox-option', 'is-active'], attrs: { 'aria-selected': 'false' } };
  const optionSelected = { tag: 'div', classes: ['rw-combobox-option'], attrs: { 'aria-selected': 'true' } };
  const empty = { tag: 'div', classes: ['rw-combobox-empty'], attrs: {} };
  return {
    ancestorsOf: {
      input: [wrapper, fld, body],
      chevron: [wrapper, fld, body],
      list: [body],                    // ★ ไม่มี wrapper อยู่ใน chain นี้ — ประเด็นทั้งหมดของบั๊ก
      optionPlain: [list, body],
      optionActive: [list, body],
      optionSelected: [list, body],
      empty: [list, body],
    },
    el: { wrapper, input, chevron, list, optionPlain, optionActive, optionSelected, empty },
  };
}

const rules = parseRules(styleBlock);
const { ancestorsOf, el } = buildPortalDom();

console.log('\n── panel/option/empty ที่ portal ไป <body> ต้องยังได้ style จริง (ไม่ใช่แค่มีข้อความ CSS) ──');

const listDecl = computedDeclarations(rules, el.list, ancestorsOf.list);
eq('panel มีพื้นหลัง (--pj-surface / --c-surface)',
  hasDecl(listDecl, /background(?:-color)?\s*:\s*var\(--(?:pj-surface|c-surface)\)/), true);
eq('panel มีขอบ (--pj-border-strong / --c-border-control)',
  hasDecl(listDecl, /border\s*:\s*[^;]*var\(--(?:pj-border-strong|c-border-control)\)/), true);
eq('panel มีเงา (box-shadow)', hasDecl(listDecl, /box-shadow\s*:\s*var\(--(?:shadow-md|sh-md)\)/), true);
eq('panel มี max-height (กันล้นจอ)', hasDecl(listDecl, /max-height\s*:\s*280px/), true);
eq('panel มี overflow-y:auto (scroll เมื่อเกิน max-height)', hasDecl(listDecl, /overflow-y\s*:\s*auto/), true);
eq('panel มี z-index สูงพอจะลอยเหนือ element อื่น', hasDecl(listDecl, /z-index\s*:\s*60/), true);
eq('panel ยังมี position:fixed จาก CSS ด้วย (ไม่ใช่พึ่ง inline style ของ JS อย่างเดียว)',
  hasDecl(listDecl, /position\s*:\s*fixed/), true);

const optionDecl = computedDeclarations(rules, el.optionPlain, ancestorsOf.optionPlain);
eq('ตัวเลือกในรายการมี padding/สี/cursor', hasDecl(optionDecl, /cursor\s*:\s*pointer/), true);

const activeDecl = computedDeclarations(rules, el.optionActive, ancestorsOf.optionActive);
eq('ตัวเลือกที่ active (keyboard highlight) มีพื้นไฮไลต์',
  hasDecl(activeDecl, /background(?:-color)?\s*:\s*var\(--c-brand-soft\)/), true);

const selectedDecl = computedDeclarations(rules, el.optionSelected, ancestorsOf.optionSelected);
eq('ตัวเลือกที่ aria-selected=true มีพื้นไฮไลต์เหมือนกัน',
  hasDecl(selectedDecl, /background(?:-color)?\s*:\s*var\(--c-brand-soft\)/), true);

const emptyDecl = computedDeclarations(rules, el.empty, ancestorsOf.empty);
eq('ข้อความ "ไม่พบตัวเลือก" มีสไตล์ (สี/ขนาดตัวอักษร)', hasDecl(emptyDecl, /color\s*:\s*var\(--pj-text-muted\)/), true);

console.log('\n── ส่วนที่ยังเป็นลูกจริงของ .rw-combobox (ไม่ถูก portal) ยัง match ปกติ ──');
const inputDecl = computedDeclarations(rules, el.input, ancestorsOf.input);
eq('ช่องค้นหายังได้กรอบ/พื้นจาก CSS', hasDecl(inputDecl, /border\s*:\s*[^;]*var\(--pj-border-strong\)/), true);
const chevronDecl = computedDeclarations(rules, el.chevron, ancestorsOf.chevron);
eq('chevron span ยังได้ position:absolute', hasDecl(chevronDecl, /position\s*:\s*absolute/), true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
