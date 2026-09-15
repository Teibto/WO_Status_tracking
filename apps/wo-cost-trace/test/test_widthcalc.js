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
}

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
