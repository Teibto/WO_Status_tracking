/**
 * _harness.js — ตัวโหลด module และ stub NetSuite ที่เทสทุกไฟล์ใช้ร่วมกัน
 *
 * เหตุที่มี: เดิมเทส 3 ไฟล์ก๊อป stub `N/query` · `global.define` · การ patch ข้อความ source
 * ไว้คนละชุด แก้ที่หนึ่งลืมอีกสองที่ได้ง่าย · และไฟล์ที่ถูกผ่าเป็นหลายโมดูล (issue #13/#14)
 * ต้องโหลด dependency ได้ ซึ่ง `global.define` แบบเดิมทำไม่ได้
 *
 * สิ่งที่ harness นี้ทำให้ดีขึ้นกว่าของเดิม
 *   1. label ที่ query ถามหาแต่ fixture ไม่ได้ประกาศ = **ตก** ไม่ใช่คืนแถวว่างเงียบ ๆ
 *      (ของเดิม `FX[label] || []` ทำให้ fixture ที่หายกลายเป็นเลข 0 ซึ่งอ่านเหมือนคำตอบจริง
 *      กับดักเดียวกับ `error:` ใน qlog ที่หน้ารายงาน)
 *   2. anchor ที่ใช้ patch หาไม่เจอ = บอกทันทีว่า anchor ไหนเปลี่ยน ไม่ใช่ TypeError ที่ไล่ยาก
 *   3. เก็บ `{label, sql, params}` ทุกครั้งที่ยิง query ให้เทสตรวจ clause ที่แบกน้ำหนักได้
 *   4. โหลด lib หลายไฟล์ผ่าน `libs:` แล้ว register เป็น `./ชื่อไฟล์` ให้ entry `define` ถึง
 *
 * ⚠ ส่วนที่ยังเป็น transitional (patch ข้อความ source) มีสองจุดเท่านั้น คือ hook ของ `runSQL`
 * และการเติม `__t` ก่อน `return` ของ define · **ถอดออกได้เมื่อ issue #13 แยก `WOCostTrace_Common.js`**
 * เพราะตอนนั้น `runSQL` จะเป็น export ของ Common ให้ harness ครอบได้ตรง ๆ และแต่ละโมดูล
 * จะ export ฟังก์ชันของตัวเองตามปกติ ไม่ต้องแทรก `__t`
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname,
  '../src/FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking');

// ── state ต่อ process (เทสหนึ่งไฟล์ = หนึ่ง process จึงไม่ต้องแยก instance) ──
let fixtures = {};
let currentLabel = '';
let failCount = 0;
const calls = [];
const missingLabels = [];

/**
 * ตั้ง fixture — รับได้สองแบบ
 *   object   ชุดเดียวตลอดการรัน
 *   function เรียกทุกครั้งที่ query ถามหาแถว · ใช้กับเทสที่สลับ fixture ระหว่างซีน
 *            ด้วยการเขียนทับตัวแปรของตัวเอง (เช่น `FX = Object.assign({}, BASE, {...})`)
 */
function setFixtures(objOrFn) { fixtures = objOrFn || {}; }

/** ชุด fixture ที่ใช้อยู่ตอนนี้ */
function currentFixtures() {
  return typeof fixtures === 'function' ? (fixtures() || {}) : fixtures;
}

/**
 * แถวที่ stub จะคืนให้ query ของ label นี้
 * label ที่ไม่ได้ประกาศใน fixture = นับเป็นข้อไม่ผ่าน แล้วคืนแถวว่างเพื่อให้เทสเดินต่อ
 * จนจบ (ได้เห็นว่าขาดกี่ label ในรอบเดียว) ก่อนจะ exit ไม่เป็นศูนย์ที่ `finish()`
 */
function rowsFor(label) {
  const fx = currentFixtures();
  if (!Object.prototype.hasOwnProperty.call(fx, label)) {
    if (label === expectedMissing) { expectedMissingHit = true; return []; }
    if (missingLabels.indexOf(label) < 0) {
      missingLabels.push(label);
      failCount++;
      console.log('  FAIL fixture ไม่ได้ประกาศ label: "' + label + '"'
        + ' — ประกาศเป็น [] ถ้าตั้งใจให้ไม่มีแถว');
    }
    return [];
  }
  const rows = fx[label];
  if (rows === 'THROW') throw new Error('Invalid or unsupported search (จำลอง)');
  return rows;
}

function makeStubs(quietLog) {
  return {
    'N/query': {
      runSuiteQLPaged(o) {
        const rows = rowsFor(currentLabel);
        calls.push({ label: currentLabel, sql: (o && o.query) || '', params: (o && o.params) || [] });
        return {
          pageRanges: rows.length ? [{ index: 0 }] : [],
          fetch: () => ({ data: { asMappedResults: () => rows } })
        };
      }
    },
    'N/log': quietLog
      ? { error: () => {}, debug: () => {} }
      : { error: (o) => console.error('LOG.error', o.title, o.details), debug: () => {} },
    'N/runtime': {
      getCurrentScript: () => ({
        id: 'customscript_fs_wo_cost_trace',
        deploymentId: 'customdeploy_fs_wo_cost_trace'
      })
    }
  };
}

/** patch ที่ต้องเจอ anchor จริง — ไม่เจอ = โยนทิ้งพร้อมบอกว่า anchor ไหน */
function mustReplace(src, anchor, replacement, what) {
  if (src.indexOf(anchor) < 0) {
    throw new Error('harness: หา anchor สำหรับ ' + what + ' ไม่เจอ — โค้ดเปลี่ยนไปแล้ว'
      + '\n  anchor ที่หา: ' + anchor
      + '\n  แก้ที่ test/_harness.js (mustReplace) ให้ตรงกับโค้ดปัจจุบัน');
  }
  return src.replace(anchor, replacement);
}

/**
 * โหลด Suitelet (และ lib ของมันถ้ามี) ด้วย stub แล้วคืนฟังก์ชันภายในที่ขอไว้
 *
 * opts.exports  ชื่อฟังก์ชันภายในที่เทสจะเรียก (เติมเป็น `__t` ชั่วคราว)
 * opts.libs     ชื่อไฟล์ lib ที่ entry `define` ถึง เช่น ['WOCostTrace_Common.js']
 * opts.fixtures fixture ตั้งต้น
 * opts.dir      โฟลเดอร์ source (ใช้ override เฉพาะเทสที่พิสูจน์การโหลดหลายไฟล์)
 * opts.file     ชื่อไฟล์ entry
 * opts.quietLog เงียบ `N/log.error` (ready_master ใช้แบบเงียบ)
 */
function load(opts) {
  const o = opts || {};
  const dir = o.dir || SRC_DIR;
  const file = o.file || 'WOCostTrace.js';
  setFixtures(o.fixtures);

  const MOD = makeStubs(!!o.quietLog);
  let captured = null;
  global.define = (deps, factory) => { captured = factory.apply(null, deps.map(d => MOD[d])); };
  global.__setLabel = (l) => { currentLabel = l; };

  // lib ต้องโหลดก่อน entry เสมอ — ลำดับเดียวกับกฎ deploy ของจริง (dependency-first)
  (o.libs || []).forEach((libFile) => {
    const libSrc = fs.readFileSync(path.join(dir, libFile), 'utf8');
    captured = null;
    eval(libSrc);
    if (!captured) throw new Error('harness: lib ' + libFile + ' ไม่ได้ return อะไรจาก define');
    MOD['./' + libFile.replace(/\.js$/, '')] = captured;
  });

  let src = fs.readFileSync(path.join(dir, file), 'utf8');
  // transitional #1 — รู้ว่ากำลังยิง query ของ label ไหน
  src = mustReplace(src,
    'function runSQL(label, sql, params) {',
    'function runSQL(label, sql, params) { global.__setLabel(label);',
    'hook label ของ runSQL');
  // transitional #2 — เปิดฟังก์ชันภายในให้เทสเรียก
  if ((o.exports || []).length) {
    src = mustReplace(src,
      'return { onRequest: onRequest };',
      'return { onRequest: onRequest, __t: { ' + o.exports.join(', ') + ' } };',
      'เติม __t ให้เทสเรียกฟังก์ชันภายใน');
  }

  captured = null;
  eval(src);
  if (!captured) throw new Error('harness: entry ' + file + ' ไม่ได้เรียก define');
  return { module: captured, T: captured.__t, stubs: MOD };
}

/**
 * ตัวเทียบผล — คงรูปแบบ output เดิมไว้ทุกตัวอักษร (`  ok   ` / `  FAIL `)
 * json:true พิมพ์ค่าด้วย JSON.stringify (แบบที่ ready_master กับ export ใช้)
 */
function makeEq(opts) {
  const o = opts || {};
  const tol = o.tol == null ? 1e-8 : o.tol;
  const show = o.json ? (v) => JSON.stringify(v) : (v) => v;
  return function eq(label, got, want, tolOverride) {
    const t = tolOverride == null ? tol : tolOverride;
    const ok = want == null ? got == null
      : (typeof want === 'number' ? Math.abs(got - want) <= t : got === want);
    if (!ok) {
      failCount++;
      console.log('  FAIL ' + label + ': got ' + show(got) + ' want ' + show(want));
    } else {
      console.log('  ok   ' + label + ' = ' + show(got));
    }
    return ok;
  };
}

/**
 * ตรวจว่าแถวใน fixture มี alias ที่โค้ดอ่านครบ และช่องตัวเลขเป็นตัวเลขจริง
 *
 * ทำไมต้องมี: fixture ที่ขาด alias ไม่ระเบิด — `asNum(undefined)` เป็น 0 และ `asStr(undefined)`
 * เป็นสตริงว่าง เทสจึงผ่านโดยที่ยอดเป็นศูนย์แบบเงียบ ๆ · ตัวเลขที่มาเป็นสตริงมี comma
 * (`'347,651.01'`) ก็กลายเป็น NaN แล้วถูกกลบเป็น 0 เหมือนกัน
 *
 * registry รูป `{ label: { required: ['wo_id'], numeric: ['amount'] } }`
 * คืน list ข้อความปัญหา (ไม่บวกตัวนับเอง เพื่อให้เทสฝั่งลบเอาไปยืนยันได้ว่าจับได้จริง)
 */
function checkAliases(registry, fx) {
  const target = fx || currentFixtures();
  const problems = [];
  Object.keys(registry).forEach((label) => {
    if (!Object.prototype.hasOwnProperty.call(target, label)) return;
    const rows = target[label];
    if (rows === 'THROW') return;
    const spec = registry[label] || {};
    (rows || []).forEach((row, i) => {
      (spec.required || []).forEach((k) => {
        if (!Object.prototype.hasOwnProperty.call(row, k)) {
          problems.push(label + ' แถว ' + i + ': ขาด alias "' + k + '"');
        }
      });
      (spec.numeric || []).forEach((k) => {
        if (!Object.prototype.hasOwnProperty.call(row, k)) return; // ขาดไปแล้วรายงานข้างบน
        const v = row[k];
        if (v === null) return;                                    // null = ยังไม่มีค่า ยอมได้
        if (typeof v !== 'number' || !isFinite(v)) {
          problems.push(label + ' แถว ' + i + ': "' + k + '" ต้องเป็นตัวเลข แต่ได้ '
            + JSON.stringify(v));
        }
      });
    });
  });
  return problems;
}

// ── label ที่เทสตั้งใจให้ขาด (ใช้พิสูจน์ว่ากลไกจับได้ ไม่ให้ไปบวกตัวนับข้อไม่ผ่าน) ──
let expectedMissing = null;
let expectedMissingHit = false;
function expectMissingLabel(label) { expectedMissing = label; expectedMissingHit = false; }
function missingWasHit() { return expectedMissingHit; }

/** ให้เทสรายงานข้อไม่ผ่านของตัวเองเข้ามารวมกับของ harness ได้ */
function addFail(msg) {
  failCount++;
  if (msg) console.log('  FAIL ' + msg);
}

function fails() { return failCount; }

/** SQL ที่ยิงไปของ label นี้ (ล่าสุด) — ใช้ตรวจ clause ที่แบกน้ำหนัก */
function sqlOf(label) {
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i].label === label) return calls[i].sql;
  }
  return null;
}

module.exports = {
  SRC_DIR,
  load,
  setFixtures,
  makeEq,
  addFail,
  fails,
  calls,
  sqlOf,
  checkAliases,
  expectMissingLabel,
  missingWasHit,
  missingLabels
};
