/**
 * เทส — ตำแหน่ง combobox popup ของ WO Cost Trace ต้องคำนวณขอบขวาจาก
 * documentElement.clientWidth ไม่ใช่ window.innerWidth (issue #64 ขั้น 5 —
 * layout-and-controls.md "ความกว้างของ container ที่ JS คำนวณ")
 *
 * โค้ด client ของหน้านี้ (renderListFieldScript) เป็นสำเนาของ WOStatusTracking.js โดยตั้งใจ
 * (คนละ SDF project deploy อิสระกัน) — เทสนี้พิสูจน์กฎเดียวกับ
 * apps/wo-status/test/test_wostatus_widthcalc.js แยกอิสระ เพราะเป็นคนละสำเนาโค้ดจริง
 * เทสนี้ตรวจ `_position(w)` ของ **combobox** เท่านั้น — ปฏิทินของช่องวันที่ (`.datebtn` → `.cal`)
 * มี `_position()` ของตัวเองอยู่ที่ WOCostTrace_Common.js และ **ไม่มี `_avoid`** จึงไม่มีอะไรให้
 * ตรวจแบบเดียวกันที่นี่ · เคยเขียนไว้ผิดว่า "ไม่มีปฏิทินในหน้านี้" — หน้าภาพรวมมีปฏิทินของแอป
 * อยู่ในที่พับ "ตัวกรองเพิ่มเติม" มาตั้งแต่ #86 แล้ว
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

// ปฏิทินของช่องวันที่อยู่ใน lib ไม่ใช่ entry — โหลดแยกเพื่อดึง renderDateFieldScript() (#86)
const { module: libC } = H.load({
  file: 'WOCostTrace_Common.js',
  libs: ['WOReportTheme.js'],
  fixtures: FX.summary(),
  quietLog: true,
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

  // ── ปุ่มอยู่คนละแถวกับช่อง (#86) ─────────────────────────────────────────
  // `.act` ย้ายออกจาก .filterbar มาเป็นแถวเต็มความกว้างใต้ details.filterbox แล้ว —
  // เรขาคณิตเปลี่ยนสองทาง: (ก) กรอบปุ่มกว้างเท่าฟอร์ม จึงคร่อมช่องในแนวนอนเสมอ
  // หลบด้วยการ "ขยับไปคนละคอลัมน์" ไม่ได้อีก (ข) กล่องกางอยู่ = ปุ่มอยู่ไกลลงไปข้างล่าง
  // ต้องไม่ย่อรายการโดยไม่จำเป็น · กล่องถูกหุบ = ปุ่มเลื่อนขึ้นมาชิด ต้องย่อเหมือนเดิม
  const rowBtn = (top) => ({ getBoundingClientRect() {
    return { top: top, bottom: top + 34, left: 8, right: 1180 };   // แถวเต็มความกว้างของฟอร์ม
  } });

  const farRow = openAt(rowBtn(600), 900);
  eq('กล่องตัวกรองกางอยู่ (ปุ่มอยู่คนละแถว ไกลลงไป) → ไม่ย่อรายการ',
    farRow.style.maxHeight, '280px');
  eq('กล่องตัวกรองกางอยู่ → ยังกางลงตามปกติ', farRow.getAttribute('data-flip'), 'down');
  eq('กล่องตัวกรองกางอยู่ → ขอบล่างของรายการยังไม่ถึงปุ่ม',
    parseInt(farRow.style.top, 10) + parseInt(farRow.style.maxHeight, 10) <= 600, true);

  // แถวปุ่มกว้างเต็มฟอร์ม → คร่อมช่องในแนวนอนแน่นอน แม้ช่องจะอยู่ริมซ้ายหรือริมขวา
  const nearRow = openAt(rowBtn(260), 900);
  eq('ปุ่มแถวถัดไปที่อยู่ใกล้ → ย่อรายการให้จบก่อนถึงปุ่ม', nearRow.style.maxHeight, '170px');
  eq('ปุ่มแถวถัดไปที่อยู่ใกล้ → ขอบล่างไม่เลยขอบบนของปุ่ม',
    parseInt(nearRow.style.top, 10) + parseInt(nearRow.style.maxHeight, 10) <= 260, true);

  // ช่องริมซ้ายสุดของแถบ (เดือน) กับแถวปุ่มเต็มความกว้าง — ต้องยังหลบ ไม่ใช่หลุดเพราะ
  // คิดว่า "ไม่ทับกันในแนวนอน" (เงื่อนไข avoid.right < left || avoid.left > left+width)
  const leftFld = openAt(rowBtn(260), 900,
    { top: 50, bottom: 82, left: 8, right: 198, width: 190, height: 32 });
  eq('ช่องริมซ้ายกับแถวปุ่มเต็มความกว้าง → ยังนับว่าทับกัน จึงย่อ',
    leftFld.style.maxHeight, '170px');


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

  // ══ ปฏิทินของช่องวันที่ต้องไม่บังปุ่มหลักของฟอร์มเช่นกัน (issue #86) ══════════
  /**
   * regression ที่วัดได้จริงบน SB1 (script 1098 · viewport 1350x900 · &month=custom)
   *   .cal            t341 b597 l33 r271
   *   ปุ่ม ดูภาพรวม    t379 b411 l33 r104   → ถูกทับเต็ม ๆ
   *   elementsFromPoint() กึ่งกลางปุ่ม = DIV.cal-dow / DIV.cal-grid
   * เกิดเพราะ #86 ย้ายแถว `.act` ลงมาอยู่ใต้ที่พับ — ก่อนหน้านี้ `.act` อยู่แถวบนสุด
   * ปฏิทินที่กางลงจึงไม่เคยเจอปุ่ม · อาการเดียวกับที่ #77 แก้ให้คอมโบบ็อกซ์ คนละ popup
   *
   * ⚠ ตรรกะนี้เป็น **สำเนาที่สอง** ของ `_position(w)` ฝั่งคอมโบบ็อกซ์ · ยกออกมาเป็นตัวช่วย
   * ตัวเดียวไม่ได้ เพราะเอนจินคอมโบบ็อกซ์ถูก byte-lock กับ wo-status ที่
   * test/test_listfield_sync.js — แก้ฝั่งนี้ต้องแก้ apps/wo-status/ ตาม ซึ่งอยู่นอกขอบเขต
   * ส่วน "สัญญาร่วม" ของสองสำเนาถูกล็อกไว้ในหัวข้อถัดไปของไฟล์นี้แทน
   */
  console.log('\n── ปฏิทินต้องไม่บังปุ่มหลักของฟอร์ม (#86) ──');

  const calScript = libC.renderDateFieldScript();
  const calPosSrc = (calScript.match(/function _position\(\) \{[\s\S]*?\n  \}/) || [])[0];
  eq('ดึง _position() ของปฏิทินออกมาได้', !!calPosSrc, true);
  eq('ปฏิทินยังยึด documentElement.clientWidth เป็นหลัก',
    /document\.documentElement && document\.documentElement\.clientWidth/.test(calPosSrc || ''), true);
  eq('ปฏิทินรู้จักปุ่มที่ต้องหลบแล้ว', /openCal\.avoid/.test(calPosSrc || ''), true);
  eq('ตอนเปิดปฏิทินผูกปุ่มของฟอร์มเดียวกันมาให้', /avoid: avoid/.test(calScript), true);
  // แถว .act มีสองปุ่ม — หลบเฉพาะปุ่มแรกยังทิ้งปุ่ม Export ให้ถูกทับ จึงต้องเล็งทั้งแถว
  eq('เล็งทั้งแถว .act ไม่ใช่เฉพาะปุ่มแรก', /querySelector\('\.act'\)/.test(calScript), true);

  /** ปฏิทินปลอม — สูงตามที่ max-height อนุญาต เหมือน DOM จริง (ใช้พิสูจน์ว่าไม่ย่อสะสม) */
  function makeCalEl(fullH) {
    const H0 = fullH || 256;
    return {
      style: {}, _attrs: {},
      setAttribute(k, v) { this._attrs[k] = String(v); },
      getAttribute(k) { return this._attrs[k]; },
      getBoundingClientRect() {
        const cap = parseInt(this.style.maxHeight, 10);
        return { width: 238, height: isNaN(cap) ? H0 : Math.min(H0, cap) };
      },
    };
  }
  function calPlace(o) {
    const box = o.box || makeCalEl(o.fullH);
    const openCal = {
      box: box,
      anchor: { getBoundingClientRect() { return o.rect; } },
      avoid: o.avoid || null,
    };
    const fn = new Function('document', 'window', 'openCal',
      calPosSrc + ';\nreturn _position;')(
      { documentElement: { clientWidth: o.vw || 1350 } },
      { innerWidth: o.vw || 1350, innerHeight: o.vh || 900 },
      openCal);
    fn();
    const capped = parseInt(box.style.maxHeight, 10);
    return {
      box: box,
      top: parseInt(box.style.top, 10),
      height: isNaN(capped) ? (o.fullH || 256) : capped,
      shrunk: !isNaN(capped),
      flip: box.getAttribute('data-flip'),
    };
  }

  // ── ฉากที่วัดมาจาก SB1 เป๊ะ ๆ ────────────────────────────────────────────
  // .datewrap ของช่อง "ช่วงวันที่เอง" อยู่ที่ t303 b337 (ปฏิทินเดิมจึงเริ่มที่ 341)
  const SB1_RECT = { top: 303, bottom: 337, left: 33, right: 188, width: 155, height: 34 };
  const SB1_ACT = { getBoundingClientRect() {
    return { top: 379, bottom: 411, left: 33, right: 1317 };   // แถว .act เต็มความกว้างฟอร์ม
  } };
  const sb1 = calPlace({ rect: SB1_RECT, avoid: SB1_ACT, vh: 900, fullH: 256 });
  eq('ฉากจริงจาก SB1 → พลิกขึ้น ไม่กางลงไปทับปุ่ม', sb1.flip, 'up');
  eq('ฉากจริงจาก SB1 → ไม่ต้องย่อ ยังเห็นทั้งเดือน', sb1.shrunk, false);
  eq('ฉากจริงจาก SB1 → ขอบล่างของปฏิทินไม่ถึงขอบบนของปุ่ม (379)',
    sb1.top + sb1.height <= 379, true);
  eq('ฉากจริงจาก SB1 → ปฏิทินอยู่เหนือช่อง ไม่ล้นขอบบนจอ',
    sb1.top >= 4 && sb1.top + sb1.height <= SB1_RECT.top, true);

  // ── ไม่มีปุ่มในฟอร์ม → พฤติกรรมเดิมทุกอย่าง ─────────────────────────────
  const calPlain = calPlace({ rect: SB1_RECT, avoid: null, vh: 900, fullH: 256 });
  eq('ไม่มีปุ่มให้หลบ → ยังกางลงเหมือนเดิม', calPlain.flip, 'down');
  eq('ไม่มีปุ่มให้หลบ → ไม่ย่อ', calPlain.shrunk, false);
  eq('ไม่มีปุ่มให้หลบ → เริ่มใต้ช่องพอดี (bottom + pad)', calPlain.top, SB1_RECT.bottom + 4);

  // ปุ่มอยู่คนละคอลัมน์จริง ๆ (ฟอร์มอื่นที่ .act ยังอยู่ใน .filterbar) → ไม่ต้องหลบ
  const sideAct = { getBoundingClientRect() {
    return { top: 379, bottom: 411, left: 900, right: 1000 };
  } };
  eq('ปุ่มอยู่คนละคอลัมน์ → ไม่พลิก ไม่ย่อ',
    calPlace({ rect: SB1_RECT, avoid: sideAct, vh: 900, fullH: 256 }).flip, 'down');

  // ── ลงไม่พอ + ขึ้นก็ไม่พอเต็มความสูง → ย่อ แต่ต้องยังเลื่อนเลือกวันได้ ──────
  // ช่องอยู่สูง (top 120) จึงมีที่เหนือช่องแค่ 112 (< 256) · ปุ่มอยู่ที่ 380 เหลือที่ลง 218
  const midRect = { top: 120, bottom: 154, left: 33, right: 188, width: 155, height: 34 };
  const tightUp = calPlace({ rect: midRect, avoid: { getBoundingClientRect() {
    return { top: 380, bottom: 412, left: 33, right: 1317 };
  } }, vh: 900, fullH: 256 });
  eq('บนไม่พอ ลงชนปุ่ม → ย่อแล้วกางลง', tightUp.flip, 'down');
  eq('ย่อแล้วย่อจริง (ไม่ใช่สูงเท่าเดิม)', tightUp.shrunk && tightUp.height < 256, true);
  eq('ย่อแล้วขอบล่างไม่เลยขอบบนของปุ่ม (380)', tightUp.top + tightUp.height <= 380, true);
  eq('ย่อแล้วยังสูงเป็นบวก', tightUp.height > 0, true);
  eq('ย่อแล้วต้องเลื่อนในกรอบได้ (overflow-y:auto) ไม่ใช่ตัดวันท้ายเดือนทิ้ง',
    tightUp.box.style.overflowY, 'auto');
  eq('ไม่ได้ย่อ → ไม่ตั้ง overflow เลย', calPlain.box.style.overflowY, '');

  // ── แคบทั้งสองทาง → ห้ามเหลือ 0/ติดลบ ───────────────────────────────────
  const squeezed = calPlace({
    rect: { top: 40, bottom: 74, left: 33, right: 188, width: 155, height: 34 },
    avoid: { getBoundingClientRect() { return { top: 80, bottom: 112, left: 33, right: 1317 }; } },
    vh: 900, fullH: 256 });
  eq('ปุ่มชิดจนย่อไม่ได้ → ยังสูงเป็นบวก (ยอมทับปุ่มดีกว่ากดไม่ได้)', squeezed.height > 0, true);
  const shortVh = calPlace({
    rect: { top: 10, bottom: 44, left: 33, right: 188, width: 155, height: 34 },
    avoid: null, vh: 120, fullH: 256 });
  eq('viewport เตี้ย → ไม่ล้นจอ', shortVh.top + shortVh.height <= 120, true);
  eq('viewport เตี้ย → ยังสูงเป็นบวก', shortVh.height > 0, true);
  // anchor คร่อมทั้ง viewport — ทั้งบนทั้งล่างเหลือ 0 ทั้งคู่
  // รีวิว #86 ทำ mutation test แล้วหลุดตรงนี้: ทำให้ปฏิทินย่อเหลือ 0 ได้ เทสต์ยังเขียว
  // (ต้นฉบับได้ max-height 92px · ตัวกลายได้ 0px — ปฏิทินหายเงียบ ๆ)
  const spanning = calPlace({
    rect: { top: 0, bottom: 100, left: 33, right: 271 },
    avoid: null, vh: 100, fullH: 256 });
  eq('anchor คร่อมทั้งจอ → ปฏิทินต้องไม่เหลือ 0', spanning.height > 0, true);
  eq('anchor คร่อมทั้งจอ → ไม่ล้นขอบจอ', spanning.top + spanning.height <= 100, true);

  // ฉากจริงจากหน้าความพร้อม master บน SB1 (&ready=) — ช่องวันที่อยู่สูง ปุ่มอยู่แถวล่าง
  // roomUp = 176px ขาด MIN_CAL ไป 4px · ก่อนมี MIN_TIGHT มันตกมาทับปุ่ม submit ทั้งที่เป็นปุ่มเดียวของหน้า
  const ready = calPlace({
    rect: { top: 184, bottom: 217, left: 300, right: 440 },
    avoid: { getBoundingClientRect: function () { return { top: 368, bottom: 400, left: 369, right: 472 }; } },
    vh: 900, fullH: 256 });
  eq('หน้าความพร้อม: ปฏิทินพลิกขึ้น ไม่ตกมาทับปุ่ม', ready.flip, 'up');
  eq('หน้าความพร้อม: ขอบล่างจบก่อนปุ่ม', ready.top + ready.height <= 368, true);
  eq('หน้าความพร้อม: ยังสูงพอใช้งาน (>= 140)', ready.height >= 140, true);

  // ── เรียกซ้ำบนกล่องเดิมต้องไม่ย่อสะสม (ล้าง max-height ก่อนวัด) ──────────
  const sticky = makeCalEl(256);
  const arg = { box: sticky, rect: midRect, avoid: { getBoundingClientRect() {
    return { top: 380, bottom: 412, left: 33, right: 1317 };
  } }, vh: 900, fullH: 256 };
  const first = calPlace(arg).height;
  calPlace(arg); const third = calPlace(arg).height;
  eq('รอบแรกย่อจริง (ฉากนี้ต้องย่อ ไม่งั้นเทสข้อถัดไปไม่ได้พิสูจน์อะไร)', first < 256, true);
  eq('เรียกซ้ำไม่ย่อสะสม', third, first);

  // ── เลื่อนในกรอบปฏิทินที่ย่อแล้ว ต้องไม่ถูกรีเซ็ตกลับไปบนสุด ──────────────
  /**
   * `_open()` ผูก scroll แบบ capture (`useCapture=true`) เพราะ scroll ของ element ไม่ bubble —
   * ต้องดักขาลงถึงจะรู้ว่ากรอบแม่ถูกเลื่อนแล้วย้ายปฏิทินตาม · แต่ปฏิทินที่ถูกย่อมี
   * `overflow-y:auto` ของตัวเองตั้งแต่ #86 การหมุนล้อ "ในกรอบปฏิทิน" จึงยิง scroll มาถึง
   * `_reposition` ด้วย แล้ว `_position()` ล้าง `maxHeight`/`overflowY` ก่อนวัด = กล่องที่เลื่อนได้
   * ถูกสร้างใหม่ scrollTop กลับเป็น 0 ทุกครั้ง → กดวันท้ายเดือนไม่ได้เลย ซึ่งเป็นสิ่งเดียวที่
   * การย่อพยายามรักษาไว้ · ที่นี่ล็อกว่า scroll จากในกล่องเราเองต้องไม่ทำอะไร
   * ส่วน scroll จากที่อื่น (กรอบแม่/หน้าเว็บ) ต้องยังคำนวณตำแหน่งใหม่เหมือนเดิม
   */
  console.log('\n── เลื่อนในกรอบปฏิทินที่ย่อแล้ว ต้องไม่ถูกรีเซ็ต ──');

  const calRepoSrc = (calScript.match(/function _reposition\(e\) \{[\s\S]*?\n  \}/) || [])[0];
  eq('ดึง _reposition(e) ของปฏิทินออกมาได้', !!calRepoSrc, true);
  eq('ยังผูก scroll แบบ capture (กรอบแม่เลื่อนแล้วปฏิทินต้องตาม)',
    /addEventListener\('scroll', _reposition, true\)/.test(calScript), true);

  function calRepoRun(targetInBox) {
    const box = makeCalEl(256);
    let positioned = 0;
    const openCal = { box: box };
    box.contains = function (t) { return t === 'INSIDE'; };
    const fn = new Function('openCal', '_position',
      calRepoSrc + ';\nreturn _reposition;')(openCal, function () { positioned += 1; });
    fn({ target: targetInBox ? 'INSIDE' : 'OUTSIDE' });
    return positioned;
  }
  eq('scroll ที่เกิดในกรอบปฏิทินเอง → ไม่คำนวณตำแหน่งใหม่ (ไม่รีเซ็ต scrollTop)',
    calRepoRun(true), 0);
  eq('scroll จากที่อื่น (กรอบแม่/หน้าเว็บ) → ยังคำนวณตำแหน่งใหม่เหมือนเดิม',
    calRepoRun(false), 1);
  // เรียกโดยไม่มี event (เช่น resize ที่ส่ง event คนละชนิด หรือเรียกตรง ๆ) ต้องไม่เงียบ
  (function () {
    let n = 0;
    const box = makeCalEl(256);
    box.contains = function () { return true; };
    const fn = new Function('openCal', '_position', calRepoSrc + ';\nreturn _reposition;')(
      { box: box }, function () { n += 1; });
    fn();
    eq('เรียกโดยไม่มี event → ยังคำนวณตำแหน่งใหม่ (resize/เรียกตรง)', n, 1);
  })();

  // ══ สัญญาร่วมของ popup สองตัว (คอมโบบ็อกซ์ + ปฏิทิน) ════════════════════
  /**
   * ยกตรรกะออกมาเป็นตัวช่วยตัวเดียวไม่ได้ (เอนจินคอมโบบ็อกซ์ถูก byte-lock กับ wo-status ที่
   * test/test_listfield_sync.js · แก้แล้วต้องแก้ apps/wo-status/ ตาม) — ตัวกันดริฟต์จึงเป็น
   * เทสต์นี้: รันทั้งสองสำเนาผ่านฉากเดียวกัน แล้วบังคับ "สัญญา" ข้อเดียวกันทั้งคู่
   *   1. มีทางเลี่ยง (บนพอ หรือ ช่องว่างถึงปุ่มพอ) → ต้องไม่ทับปุ่ม
   *   2. ความสูงเป็นบวกเสมอ ไม่ว่าฉากจะแคบแค่ไหน
   *   3. ไม่ล้นขอบล่างของ viewport
   * (ตัวเลขที่ได้ไม่จำเป็นต้องเท่ากัน — ปฏิทินเลือกพลิกขึ้นก่อนย่อ คอมโบบ็อกซ์ย่อก่อน
   *  ดูเหตุผลในคอมเมนต์ของ _position() ที่ WOCostTrace_Common.js)
   */
  console.log('\n── สัญญาร่วมของ popup สองตัว (คอมโบบ็อกซ์ · ปฏิทิน) ──');

  const SCENES = [
    { n: 'ปุ่มอยู่แถวถัดไป ใกล้ช่อง',
      rect: { top: 303, bottom: 337, left: 33, right: 188, width: 155, height: 34 },
      act: { top: 379, bottom: 411, left: 33, right: 1317 }, vh: 900, avoidable: true },
    { n: 'ปุ่มอยู่ไกลลงไป',
      rect: { top: 100, bottom: 134, left: 33, right: 188, width: 155, height: 34 },
      act: { top: 700, bottom: 732, left: 33, right: 1317 }, vh: 900, avoidable: true },
    { n: 'ช่องอยู่กลางจอ ปุ่มชิดใต้',
      rect: { top: 400, bottom: 434, left: 33, right: 188, width: 155, height: 34 },
      act: { top: 470, bottom: 502, left: 33, right: 1317 }, vh: 900, avoidable: true },
    { n: 'ช่องอยู่สูงมาก ปุ่มชิดใต้ จอเตี้ย (ไม่มีทางเลี่ยง)',
      rect: { top: 30, bottom: 64, left: 33, right: 188, width: 155, height: 34 },
      act: { top: 70, bottom: 102, left: 33, right: 1317 }, vh: 300, avoidable: false },
  ];

  SCENES.forEach((sc) => {
    const avoidEl = { getBoundingClientRect() { return sc.act; } };

    const cal = calPlace({ rect: sc.rect, avoid: avoidEl, vh: sc.vh, fullH: 256 });
    const cbEl = makeElasticEl();
    makePosition({ documentElement: { clientWidth: 1350 } },
      { innerWidth: 1350, innerHeight: sc.vh })(
      { _list: cbEl, _avoid: avoidEl,
        _input: { getBoundingClientRect() { return sc.rect; } } });
    const cb = {
      top: parseInt(cbEl.style.top, 10),
      height: parseInt(cbEl.style.maxHeight, 10),
    };

    [['ปฏิทิน', cal], ['คอมโบบ็อกซ์', cb]].forEach((pair) => {
      const who = pair[0], r = pair[1];
      eq(sc.n + ' · ' + who + ' → ความสูงเป็นบวก', r.height > 0, true);
      eq(sc.n + ' · ' + who + ' → ไม่ล้นขอบล่างจอ', r.top + r.height <= sc.vh, true);
      if (sc.avoidable) {
        // ทับกันในแนวตั้ง = (top < act.bottom) และ (top + height > act.top)
        const covers = r.top < sc.act.bottom && (r.top + r.height) > sc.act.top;
        eq(sc.n + ' · ' + who + ' → ไม่ทับแถวปุ่ม', covers, false);
      }
    });
  });

}

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
