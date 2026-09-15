/**
 * เทส — ตำแหน่ง popup (ปฏิทิน + combobox) ต้องคำนวณขอบขวาจาก documentElement.clientWidth
 * ไม่ใช่ window.innerWidth (issue #64 ขั้น 5 — layout-and-controls.md
 * "ความกว้างของ container ที่ JS คำนวณ")
 *
 * ปัญหาที่กัน: `window.innerWidth` รวมความกว้างของ scrollbar แนวตั้ง (~17px บน Windows) เข้าไป
 * ด้วย ขณะที่ `document.documentElement.clientWidth` ตัด scrollbar ออกแล้ว — ถ้าใช้ innerWidth
 * เป็นขอบขวาที่ "มองเห็นจริง" ตอนคำนวณว่า popup จะล้นขวาหรือไม่ ผลคือ popup ขยับไปวางเลยขอบขวา
 * ที่ผู้ใช้เห็นจริงไปสูงสุด ~17px (ซ้อนแถบเลื่อนหรือโดนตัดบางส่วน) — เกิดกับทุก viewport ที่มี
 * scrollbar แนวตั้งจริง (คือเกือบทุกหน้าที่ยาวกว่าจอ) ไม่ใช่แค่จอแคบ
 *
 * เทสนี้ดึงฟังก์ชัน `_position` ทั้งสองตัว (ปฏิทิน — ไม่มี argument, ผูกกับ openCal ที่เป็น
 * module-scope var · combobox — รับ `w` ตรง ๆ) ออกจากหน้าที่ render จริง มารันเดี่ยว ๆ
 * บนสภาพแวดล้อมปลอมที่ตั้งใจให้ documentElement.clientWidth "แคบกว่า" window.innerWidth
 * (จำลอง scrollbar) แล้วยันว่าเลข `left` ที่คำนวณออกมายึดขอบของ clientWidth ไม่ใช่ innerWidth —
 * mutation กลับไปใช้ window.innerWidth ตัวเดียว (โค้ดเดิมก่อนขั้น 5) ต้องทำให้เทสนี้แดง
 * เพราะเลข left ที่ได้จะเป็นคนละค่ากัน (คำนวณไว้ในคอมเมนต์ของแต่ละเคสด้านล่าง)
 */
const H = require('../../../test/lib/_harness');

const eq = H.makeEq();

function sqlRows() { return []; }

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

const chunks = [];
mod.onRequest({
  request: { parameters: {} },
  response: { write: (s) => chunks.push(String(s)), setHeader: () => {} },
});
const form = chunks.join('');

// ── ดึงฟังก์ชันปฏิทิน _position() (no-arg — ผูกกับ openCal) ──────────────
console.log('\n── ปฏิทิน: _position() ──');
const calPosSrc = (form.match(/function _position\(\) \{[\s\S]*?\n  \}/) || [])[0];
eq('ดึง _position() ของปฏิทินออกมาได้', !!calPosSrc, true);
eq('ใช้ documentElement.clientWidth เป็นหลัก', /document\.documentElement\s*\n?\s*&&\s*document\.documentElement\.clientWidth/.test(calPosSrc || ''), true);
eq('ยังมี window.innerWidth เป็น fallback (ไม่ใช่ทิ้งไปเฉย ๆ)', /window\.innerWidth/.test(calPosSrc || ''), true);

function makeCalPosition(fakeDocument, fakeWindow, openCal) {
  const factory = new Function('document', 'window', 'openCal', calPosSrc + ';\nreturn _position;');
  return factory(fakeDocument, fakeWindow, openCal);
}

function makeBox(rect) {
  return {
    style: {},
    _attrs: {},
    _rect: rect,
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k]; },
    getBoundingClientRect() { return this._rect; },
  };
}
function makeAnchor(rect) {
  return { getBoundingClientRect() { return rect; } };
}

if (calPosSrc) {
  // anchor อยู่ชิดขวา (left:700) กว้างพอที่กล่องปฏิทิน (238px ค่า default) จะล้นทั้งสองกรณี
  // documentElement.clientWidth = 750 (ขอบที่มองเห็นจริง) window.innerWidth = 770 (รวม
  // scrollbar 20px) — pad = 4 ตามโค้ดจริง
  //   ยึด clientWidth (ถูก): left = 750 - 4 - 238 = 508
  //   ยึด innerWidth เฉย ๆ (โค้ดเดิมก่อนขั้น 5 — ต้องแดงถ้าย้อนกลับ): left = 770 - 4 - 238 = 528
  const anchorRect = { top: 100, bottom: 132, left: 700, right: 938, width: 238, height: 32 };
  const box = makeBox({ width: 238, height: 280 });
  const anchor = makeAnchor(anchorRect);
  const _position = makeCalPosition(
    { documentElement: { clientWidth: 750 } },
    { innerWidth: 770, innerHeight: 768 },
    { box, anchor }
  );
  _position();
  eq('ปฏิทิน: left ยึดขอบของ documentElement.clientWidth (750) ไม่ใช่ window.innerWidth (770)',
    box.style.left, '508px');

  // ── documentElement ไม่มีจริง (เผื่ออนาคต/สภาพแวดล้อมแปลก ๆ) → ต้อง fallback ไป
  // window.innerWidth เหมือนพฤติกรรมเดิม ไม่ใช่พังเงียบ ๆ กลายเป็น 0 ────────────
  const box2 = makeBox({ width: 238, height: 280 });
  const _position2 = makeCalPosition(
    {},
    { innerWidth: 770, innerHeight: 768 },
    { box: box2, anchor: makeAnchor(anchorRect) }
  );
  _position2();
  eq('ปฏิทิน: ไม่มี documentElement เลย → fallback ไป window.innerWidth (770) เหมือนโค้ดเดิม',
    box2.style.left, '528px');
}

// ── ดึงฟังก์ชัน combobox _position(w) ─────────────────────────────────────
console.log('\n── combobox: _position(w) ──');
const comboPosSrc = (form.match(/function _position\(w\) \{[\s\S]*?\n  \}/) || [])[0];
eq('ดึง _position(w) ของ combobox ออกมาได้', !!comboPosSrc, true);
eq('ใช้ documentElement.clientWidth เป็นหลัก', /document\.documentElement\s*\n?\s*&&\s*document\.documentElement\.clientWidth/.test(comboPosSrc || ''), true);
eq('ยังมี window.innerWidth เป็น fallback', /window\.innerWidth/.test(comboPosSrc || ''), true);

if (comboPosSrc) {
  function makeComboPosition(fakeDocument, fakeWindow) {
    const factory = new Function('document', 'window', comboPosSrc + ';\nreturn _position;');
    return factory(fakeDocument, fakeWindow);
  }
  function makeListEl() {
    return {
      style: {}, _attrs: {},
      setAttribute(k, v) { this._attrs[k] = String(v); },
      getAttribute(k) { return this._attrs[k]; },
      getBoundingClientRect() { return { height: 280 }; },
    };
  }

  // anchor (ช่องค้นหา) width:150 ชิดขวา left:300 → left+width = 450
  //   ยึด clientWidth=400: left = 400 - 4 - 150 = 246
  //   ยึด innerWidth=417 (จำลองรวม scrollbar 17px — ตัวเลขเดียวกับที่สเปกอ้างถึง): left = 417 - 4 - 150 = 263
  const anchorRect = { top: 50, bottom: 82, left: 300, right: 450, width: 150, height: 32 };
  const _position = makeComboPosition(
    { documentElement: { clientWidth: 400 } },
    { innerWidth: 417, innerHeight: 768 }
  );
  const list = makeListEl();
  const w = { _list: list, _input: { getBoundingClientRect() { return anchorRect; } } };
  _position(w);
  eq('combobox: left ยึดขอบของ documentElement.clientWidth (400) ไม่ใช่ window.innerWidth (417 — จำลอง scrollbar 17px)',
    list.style.left, '246px');

  const list2 = makeListEl();
  const _position2 = makeComboPosition({}, { innerWidth: 417, innerHeight: 768 });
  _position2({ _list: list2, _input: { getBoundingClientRect() { return anchorRect; } } });
  eq('combobox: ไม่มี documentElement เลย → fallback ไป window.innerWidth (417) เหมือนโค้ดเดิม',
    list2.style.left, '263px');
}

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
