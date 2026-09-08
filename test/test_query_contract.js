/**
 * Harness — สัญญาระหว่างโค้ดกับ query: label · alias ของแถว · clause ที่แบกน้ำหนัก (issue #11)
 *
 * เทสนี้ไม่ได้ตรวจว่า SQL รันได้บน NetSuite (ต้อง auth และข้อมูลเปลี่ยนทุกวัน — นั่นคือ
 * "เทสรับของบน SB1" ที่ทำมือ) · ที่ตรวจได้แบบ offline คือ **สัญญาที่ฝั่ง JS พึ่งอยู่**
 *   1. label ที่โค้ดยิงต้องมี fixture — ไม่มีแล้วต้องตก ไม่ใช่ได้แถวว่างซึ่งอ่านเป็นเลข 0
 *   2. แถวใน fixture ต้องมี alias ที่โค้ดอ่านครบ และช่องตัวเลขต้องเป็นตัวเลขจริง
 *   3. clause ที่เคยจ่ายบทเรียนไปแล้วต้องยังอยู่ใน SQL — `foreignamount` ของสมการต้นทุน ·
 *      `posting`/`accountingbook`/`assetaccount` ของเส้นบัญชี (ทั้งสองเส้นคนละหน้าที่ ห้ามสลับ)
 *   4. harness ต้องโหลด module ที่มี dependency หลายไฟล์ได้ — เงื่อนไขก่อนเริ่ม issue #13/#14
 *
 * รัน: node test/test_query_contract.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./_harness');
const FX = require('./fixtures_parity');

const eq = H.makeEq({ tol: 1e-9, json: true });

// ── 1. alias ที่โค้ดอ่านจากแต่ละ label ─────────────────────────────────────
// เขียนไว้เฉพาะ label ที่ยอดเงิน/ยอดผลิตพึ่งอยู่ — ขาด alias พวกนี้แล้วรายงานเงียบเป็นศูนย์
const ALIASES = {
  'WO header': { required: ['wo_id', 'wo_no', 'wo_date_iso'] },
  'WO lines (BOM standard)': {
    required: ['wo_id', 'mainline', 'item_id', 'is_summary', 'quantity', 'sub_id'],
    numeric: ['quantity']
  },
  'ใบเบิกวัตถุดิบเข้า WO': {
    required: ['wo_id', 'tran_id', 'line_id', 'item_id', 'is_summary', 'adj_summarycost',
               'quantity', 'amount', 'trandate_iso'],
    numeric: ['quantity', 'amount']
  },
  'ใบปิดงานผลิต (WOC)': {
    required: ['wo_id', 'woc_id', 'fg_qty', 'sc_ia'], numeric: ['fg_qty']
  },
  'เอกสารปันส่วนต้นทุน': {
    required: ['wo_id', 'ca_id', 'cost_class', 'std_cost', 'act_cost'],
    numeric: ['cost_class', 'std_cost', 'act_cost']
  },
  'ภาพรวม — รายการใบสั่งผลิต': {
    required: ['wo_id', 'wo_no', 'item_id', 'item_code', 'wo_qty', 'base_per_carton'],
    numeric: ['wo_qty', 'base_per_carton']
  },
  'ภาพรวม — ผลิตได้จริง': {
    required: ['wo_id', 'woc_qty', 'woc_count', 'woc_fg_count', 'woc_sc_linked'],
    numeric: ['woc_qty', 'woc_count', 'woc_fg_count', 'woc_sc_linked']
  },
  'ภาพรวม — วัตถุดิบและบรรจุภัณฑ์': {
    required: ['wo_id', 'rm_cost', 'doc_count'], numeric: ['rm_cost', 'doc_count']
  },
  'ภาพรวม — ต้นทุนแปรสภาพ': {
    required: ['wo_id', 'dl_oh_std', 'dl_oh_act'], numeric: ['dl_oh_std', 'dl_oh_act']
  },
  'ภาพรวม — Summary Cost Item': {
    required: ['wo_id', 'sc_value', 'sc_docs', 'sc_docs_valued', 'sc_docs_orphan'],
    numeric: ['sc_value', 'sc_docs', 'sc_docs_valued', 'sc_docs_orphan']
  }
};

console.log('\n── fixture ที่ใช้จริงต้องมี alias ครบทุก label ──');
const ddFx = FX.drilldown();
const smFx = FX.summary();
const problems = H.checkAliases(ALIASES, ddFx).concat(H.checkAliases(ALIASES, smFx));
if (problems.length) problems.forEach((p) => console.log('     ' + p));
eq('จำนวนปัญหาที่พบ', problems.length, 0);

console.log('\n── แถวที่รูปผิดต้องถูกจับได้ (เทสฝั่งลบ) ──');
const broken = JSON.parse(JSON.stringify(ddFx));
delete broken['ใบเบิกวัตถุดิบเข้า WO'][0].amount;             // ขาด alias
broken['ใบเบิกวัตถุดิบเข้า WO'][1].amount = '-100,000.13';    // ตัวเลขมาเป็นสตริงมี comma
broken['ใบปิดงานผลิต (WOC)'][0].fg_qty = null;                // null ยอมได้ ไม่ควรถูกฟ้อง
const found = H.checkAliases(ALIASES, broken);
eq('จับได้ 2 ข้อ', found.length, 2);
eq('บอกว่า alias ไหนขาด', found.some((p) => p.indexOf('ขาด alias "amount"') >= 0), true);
eq('บอกว่าช่องไหนไม่ใช่ตัวเลข', found.some((p) => p.indexOf('"amount" ต้องเป็นตัวเลข') >= 0), true);
eq('null ไม่ถูกฟ้องว่าไม่ใช่ตัวเลข', found.some((p) => p.indexOf('fg_qty') >= 0), false);

// ── 2. รันสองชั้นเพื่อเก็บ SQL ที่ยิงจริง ──────────────────────────────────
const dd = H.load({ libs: ['WOReportTheme.js'], fixtures: ddFx, quietLog: true, exports: ['buildModel'] });
dd.T.buildModel(FX.WO_HEADER.wo_no);
const sum = H.load({ libs: ['WOReportTheme.js'], fixtures: smFx, quietLog: true, exports: ['buildSummary', 'readFilters'] });
sum.T.buildSummary(sum.T.readFilters({ from: '2026-07-01', to: '2026-07-31' }));

console.log('\n── clause ที่แบกน้ำหนักต้องยังอยู่ใน SQL ──');
// สมการต้นทุนใช้มูลค่าบรรทัด (foreignamount) ทั้งชั้นเจาะลึกและชั้นภาพรวม
// ห้ามเปลี่ยนไปใช้ TAL.amount — ยอด 347,651.01 ที่ verify ไว้มาจาก foreignamount
[
  'ใบเบิกวัตถุดิบเข้า WO',
  'ภาพรวม — วัตถุดิบและบรรจุภัณฑ์',
  'ภาพรวม — Summary Cost Item'
].forEach((label) => {
  const sql = H.sqlOf(label);
  eq('"' + label + '" ยิงจริง', sql != null, true);
  eq('"' + label + '" ใช้ foreignamount', (sql || '').indexOf('foreignamount') >= 0, true);
  eq('"' + label + '" ไม่ได้เปลี่ยนไปใช้ TAL.amount',
    /TAL\.amount/.test(sql || ''), false);
});

// เส้นบัญชี (average cost / กระทบยอด) เป็นอีกคำถามหนึ่ง ต้องกรอง posting + สมุดบัญชีเสมอ
[
  'ledger เข้า-ออก (ที่มา average cost)',
  'ตรวจสุขภาพ ledger',
  'มูลค่าจากบัญชี (accounting line)',
  'กระทบยอด WIP'
].forEach((label) => {
  const sql = H.sqlOf(label);
  eq('"' + label + '" ยิงจริง', sql != null, true);
  eq('"' + label + '" กรอง posting', /posting\s*=\s*'T'/.test(sql || ''), true);
  eq('"' + label + '" กรองสมุดบัญชี', /accountingbook\s*=\s*1/.test(sql || ''), true);
});

// average cost ต้องผูกกับบัญชีสินทรัพย์ของสินค้า ไม่ใช่บัญชีอะไรก็ได้
['ledger เข้า-ออก (ที่มา average cost)', 'ตรวจสุขภาพ ledger'].forEach((label) => {
  eq('"' + label + '" ผูกกับ item.assetaccount',
    /assetaccount/.test(H.sqlOf(label) || ''), true);
});

// ── 3. label ที่ไม่มี fixture ต้องถูกจับได้ ────────────────────────────────
console.log('\n── label ที่ fixture ไม่ได้ประกาศ ต้องถูกจับ ──');
const LOST = 'ภาพรวม — ต้นทุนแปรสภาพ';
const partial = {};
Object.keys(smFx).forEach((k) => { if (k !== LOST) partial[k] = smFx[k]; });
H.expectMissingLabel(LOST);   // ตั้งว่าตั้งใจให้ขาด เพื่อไม่ให้ไปบวกตัวนับข้อไม่ผ่าน
H.setFixtures(partial);
sum.T.buildSummary(sum.T.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
eq('กลไกจับ label ที่ขาดได้', H.missingWasHit(), true);

// ── 4. โหลด module หลายไฟล์ได้ (เงื่อนไขก่อน issue #13/#14) ────────────────
console.log('\n── harness โหลด entry ที่ define ถึง lib ได้ ──');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wotrace-harness-'));
// เขียนไว้ใน temp ของระบบ ไม่ใช่ใน repo — `git status` ต้องสะอาดหลังรันเทส
fs.writeFileSync(path.join(tmp, 'FakeLib.js'),
  "define([], () => { return { tag: () => 'จาก lib' }; });\n");
fs.writeFileSync(path.join(tmp, 'FakeEntry.js'),
  "define(['N/query', './FakeLib'], (query, lib) => {\n"
  + "  function runSQL(label, sql, params) { return { label: label, from: lib.tag() }; }\n"
  + "  function onRequest(ctx) { return runSQL('probe', 'SELECT 1', []); }\n"
  + "  return { onRequest: onRequest };\n"
  + "});\n");
const fake = H.load({
  dir: tmp, file: 'FakeEntry.js', libs: ['FakeLib.js'],
  fixtures: {}, quietLog: true, exports: ['runSQL', 'onRequest']
});
eq('entry เรียก lib ที่โหลดมาก่อนได้', fake.T.onRequest({}).from, 'จาก lib');
eq('lib ถูก register เป็น ./FakeLib', typeof fake.stubs['./FakeLib'], 'object');
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
