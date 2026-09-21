/**
 * เทส — ตำแหน่ง combobox popup ของ WO Cost Trace ต้องคำนวณขอบขวาจาก
 * documentElement.clientWidth ไม่ใช่ window.innerWidth (issue #64 ขั้น 5 —
 * layout-and-controls.md "ความกว้างของ container ที่ JS คำนวณ")
 *
 * โค้ด client ของหน้านี้ (renderListFieldScript) เป็นสำเนาของ WOStatusTracking.js โดยตั้งใจ
 * (คนละ SDF project deploy อิสระกัน) — เทสนี้พิสูจน์กฎเดียวกับ
 * apps/wo-status/test/test_wostatus_widthcalc.js แยกอิสระ เพราะเป็นคนละสำเนาโค้ดจริง
 * ไม่มีปฏิทินในหน้านี้ (ช่องวันที่เป็นข้อความล้วน ไม่มี date picker ของแอป) จึงมีแค่ _position(w)
 * ของ combobox ให้ตรวจ
 *
 * ปัญหาที่กัน: `window.innerWidth` รวม scrollbar แนวตั้ง (~17px) เข้าไปด้วย ทำให้ popup
 * คำนวณขอบขวาผิดและลอยเลยขอบที่มองเห็นจริงไปสูงสุดเท่าความกว้าง scrollbar
 */
const H = require('../../../test/lib/_harness');
const FX = require('../../../test/lib/fixtures_parity');

const eq = H.makeEq();

const { T } = H.load({
  libs: ['WOReportTheme.js', 'WOCostTrace_Common.js', 'WOCostTrace_Ready.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['renderListFieldScript'],
});

const scriptTag = T.renderListFieldScript();
const engineJs = (scriptTag.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
eq('ดึงเนื้อ <script> ของ renderListFieldScript ออกมาได้', engineJs.length > 0, true);

const comboPosSrc = (engineJs.match(/function _position\(w\) \{[\s\S]*?\n  \}/) || [])[0];
eq('ดึง _position(w) ออกมาได้', !!comboPosSrc, true);
eq('ใช้ documentElement.clientWidth เป็นหลัก',
  /document\.documentElement\s*\n?\s*&&\s*document\.documentElement\.clientWidth/.test(comboPosSrc || ''), true);
eq('ยังมี window.innerWidth เป็น fallback (ไม่ใช่ทิ้งไปเฉย ๆ)', /window\.innerWidth/.test(comboPosSrc || ''), true);

if (comboPosSrc) {
  function makePosition(fakeDocument, fakeWindow) {
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

  // anchor (ช่องค้นหา) width:150 ชิดขวา left:300 → left+width = 450 — ตัวเลขเดียวกับ
  // apps/wo-status/test/test_wostatus_widthcalc.js เพื่อให้ผลลัพธ์เทียบกันได้ตรง ๆ
  //   ยึด clientWidth=400 (ถูก): left = 400 - 4 - 150 = 246
  //   ยึด innerWidth=417 (จำลองรวม scrollbar 17px — โค้ดเดิมก่อนขั้น 5): left = 417 - 4 - 150 = 263
  const anchorRect = { top: 50, bottom: 82, left: 300, right: 450, width: 150, height: 32 };

  const _position = makePosition(
    { documentElement: { clientWidth: 400 } },
    { innerWidth: 417, innerHeight: 768 }
  );
  const list = makeListEl();
  _position({ _list: list, _input: { getBoundingClientRect() { return anchorRect; } } });
  eq('left ยึดขอบของ documentElement.clientWidth (400) ไม่ใช่ window.innerWidth (417)',
    list.style.left, '246px');

  // documentElement ไม่มีจริง → fallback ไป window.innerWidth เหมือนพฤติกรรมเดิม
  const list2 = makeListEl();
  const _position2 = makePosition({}, { innerWidth: 417, innerHeight: 768 });
  _position2({ _list: list2, _input: { getBoundingClientRect() { return anchorRect; } } });
  eq('ไม่มี documentElement เลย → fallback ไป window.innerWidth (417) เหมือนโค้ดเดิม',
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
    makePosition({ documentElement: { clientWidth: 1200 } }, { innerWidth: 1200, innerHeight: vh })(
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
  const pos = makePosition({ documentElement: { clientWidth: 1200 } },
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
  makePosition({ documentElement: { clientWidth: 1200 } },
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
  makePosition({ documentElement: { clientWidth: 1200 } },
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
