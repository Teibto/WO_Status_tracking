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

  // ── popup ต้องไม่บังปุ่มหลักของฟอร์ม (#77) ────────────────────────────────
  // QA บน SB1 วัดด้วย document.elementFromPoint() ที่กึ่งกลางปุ่มขณะรายการเปิดอยู่ แล้วได้
  // div.rw-combobox-option ไม่ใช่ปุ่ม → ผู้ใช้เลือกตัวกรองโดยไม่ตั้งใจแล้วได้ตารางว่าง
  // ช่องอยู่ที่ y 50-82 · รายการสูง 280 · ปุ่มอยู่ใต้ช่อง ทับกันแน่ถ้าไม่ทำอะไร
  const avoidBtn = (top) => ({ getBoundingClientRect() {
    return { top: top, bottom: top + 32, left: 300, right: 420 };
  } });
  const openAt = (avoidEl, vh, rect) => {
    const el = makeListEl();
    makeComboPosition({ documentElement: { clientWidth: 1200 } }, { innerWidth: 1200, innerHeight: vh })(
      { _list: el, _avoid: avoidEl,
        _input: { getBoundingClientRect() { return rect || anchorRect; } } });
    return el;
  };

  // ด้านบนไม่พอ (ช่องอยู่สูง y=50) แต่ช่องว่างถึงปุ่มยังพอให้ย่อ → ย่อรายการ ไม่ทับปุ่ม
  const shrunk = openAt(avoidBtn(260), 900);
  eq('ย่อรายการให้จบก่อนถึงปุ่ม', shrunk.style.maxHeight, '170px');
  eq('ยังกางลงเหมือนเดิม', shrunk.getAttribute('data-flip'), 'down');
  eq('ขอบล่างของรายการไม่เลยขอบบนของปุ่ม',
    parseInt(shrunk.style.top, 10) + parseInt(shrunk.style.maxHeight, 10) <= 260, true);

  // ปุ่มชิดช่องมาก และด้านบนมีที่พอ → พลิกขึ้นแทนการย่อจนอ่านไม่ได้
  const flipped = openAt(avoidBtn(480), 900,
    { top: 400, bottom: 432, left: 300, right: 450, width: 150, height: 32 });
  eq('ปุ่มชิดเกินไป → พลิกขึ้น', flipped.getAttribute('data-flip'), 'up');
  eq('พลิกขึ้นแล้วไม่ทับปุ่ม', parseInt(flipped.style.top, 10) < 400, true);

  // ไม่มีปุ่มให้หลบ → พฤติกรรมเดิมทุกอย่าง (ไม่ย่อ ไม่พลิก)
  const plain = openAt(null, 900);
  eq('ไม่มีปุ่มให้หลบ → ไม่ย่อ', plain.style.maxHeight, '280px');
  eq('ไม่มีปุ่มให้หลบ → ยังกางลง', plain.getAttribute('data-flip'), 'down');

  // ปุ่มอยู่คนละคอลัมน์ (ไม่ทับกันในแนวนอน) → ไม่ต้องหลบ
  const sideBtn = { getBoundingClientRect() {
    return { top: 120, bottom: 152, left: 900, right: 1000 };
  } };
  eq('ปุ่มอยู่คนละคอลัมน์ → ไม่ย่อ', openAt(sideBtn, 900).style.maxHeight, '280px');


  // ── กันเคสที่รีวิวรอบสองจับได้ (#77) ──────────────────────────────────────
  // element ปลอมที่ "สูงเท่าที่ max-height อนุญาต" เหมือน DOM จริง — ใช้พิสูจน์ว่าโค้ด
  // ล้าง max-height ก่อนวัดทุกครั้ง ไม่ใช่วัดจากของที่ย่อไปแล้วแล้วย่อซ้ำลงเรื่อย ๆ
  const makeElasticEl = () => {
    const el = makeListEl();
    el.getBoundingClientRect = function () {
      const cap = parseInt(this.style.maxHeight, 10);
      return { height: isNaN(cap) ? 280 : Math.min(280, cap) };
    };
    return el;
  };

  // ปุ่มชิดใต้ช่องมาก (room ติดลบ) → ห้ามยุบเหลือ 0 · ยอมทับปุ่มดีกว่ารายการที่กดไม่ได้
  const tight = openAt(avoidBtn(86), 900);
  eq('ปุ่มชิดจนย่อไม่ได้ → ไม่ยุบเป็น 0', tight.style.maxHeight, '280px');
  eq('ปุ่มชิดจนย่อไม่ได้ → ความสูงเป็นบวกเสมอ',
    parseInt(tight.style.maxHeight, 10) > 0, true);

  // เรียกซ้ำบน element เดิมที่ย่อไปแล้ว → ต้องได้ผลเท่าเดิม ไม่ย่อสะสม
  const el = makeElasticEl();
  const pos = makeComboPosition({ documentElement: { clientWidth: 1200 } },
    { innerWidth: 1200, innerHeight: 900 });
  const shrinkArg = { _list: el, _avoid: avoidBtn(260),
    _input: { getBoundingClientRect() { return anchorRect; } } };
  pos(shrinkArg);
  const firstPass = el.style.maxHeight;
  pos(shrinkArg);
  pos(shrinkArg);
  eq('เรียกซ้ำไม่ย่อสะสม (ล้าง max-height ก่อนวัด)', el.style.maxHeight, firstPass);
  eq('ค่าที่ได้ยังเป็นค่าที่หลบปุ่มถูกต้อง', firstPass, '170px');

  // ไม่มีปุ่มให้หลบ แต่ viewport เตี้ย → ต้องไม่ล้นจอ
  const shortVp = makeListEl();
  makeComboPosition({ documentElement: { clientWidth: 1200 } },
    { innerWidth: 1200, innerHeight: 100 })(
    { _list: shortVp, _avoid: null,
      _input: { getBoundingClientRect() {
        return { top: 10, bottom: 42, left: 300, right: 450, width: 150, height: 32 };
      } } });
  eq('viewport เตี้ย → ขอบล่างของรายการไม่ล้นจอ',
    parseInt(shortVp.style.top, 10) + parseInt(shortVp.style.maxHeight, 10) <= 100, true);
  eq('viewport เตี้ย → ยังมีความสูงเป็นบวก',
    parseInt(shortVp.style.maxHeight, 10) > 0, true);

  // anchor เลื่อนพ้นจอด้านบน (เปิดรายการค้างไว้แล้วสกรอลล์) → ซ่อน ไม่ใช่ลอยทับหัวหน้า
  const gone = makeListEl();
  makeComboPosition({ documentElement: { clientWidth: 1200 } },
    { innerWidth: 1200, innerHeight: 900 })(
    { _list: gone, _avoid: null,
      _input: { getBoundingClientRect() {
        return { top: -400, bottom: -368, left: 300, right: 450, width: 150, height: 32 };
      } } });
  eq('anchor พ้นจอ → ทำเครื่องหมายว่าอยู่นอกจอ (แล้วปิดรายการ ไม่ใช่ซ่อนด้วย style.display)',
    gone.getAttribute('data-offscreen'), '1');
  eq('anchor พ้นจอ → ไม่ตั้งความสูงติดลบ',
    gone.style.maxHeight === '' || parseInt(gone.style.maxHeight, 10) > 0, true);
  eq('anchor พ้นจอ → ไม่แตะ style.display (list-field.md ห้าม)',
    gone.style.display === undefined || gone.style.display === '', true);

}

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
