/**
 * WOCostTrace_Common.js
 * helper · SQL runner · query log — ส่วนที่ทุกชั้นของ WO Cost Trace ใช้ร่วมกัน (issue #13)
 *
 * แยกออกมาเพราะก้อน E2 (#14) จะแยกชั้นความพร้อมออกเป็นไฟล์ของตัวเอง
 * ถ้าไม่มีที่นี่ ชั้นนั้นต้องก็อป helper ชุดนี้ไปไว้เอง แล้วสองชุดจะ drift ทันที
 *
 * เนื้อในทุกฟังก์ชันตรงกับของเดิมทุกตัวอักษร — ก้อนนี้เป็นการย้ายที่อยู่ ไม่ใช่การเขียนใหม่
 *
 * ─── อายุของ query log ───────────────────────────────────
 * NetSuite reuse module instance ข้าม request ได้ ถ้าไม่ล้าง log จะสะสมข้าม request
 * แบบเงียบ — หน้ารายงานจะบอกว่ายิง query ไป 38 คำสั่งทั้งที่รอบนี้ยิงไป 19
 * คนอ่านจะสรุปว่ารายงานช้าเพราะ query ซ้ำ ซี่งไม่จริง
 *
 * จึงต้องเรียก `beginRequest()` เป็นสิ่งแรกของทุก request
 * `test/test_qlog_scope.js` ยิง onRequest สองรอบติดกันเพื่อกันการลืมข้อนี้
 *
 * ─── ลำดับ deploy ──────────────────────────────────────────
 * ไฟล์นี้เป็น dependency ของ `WOCostTrace.js` · อัปทีละไฟล์ต้องอัปไฟล์นี้ก่อน
 * ไม่งั้น entry จะตายทุก request ด้วย `MODULE_DOES_NOT_EXIST`
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/query', 'N/log', 'N/runtime', './WOReportTheme'], (query, log, runtime, theme) => {

  // ═══ helpers ═══════════════════════════════════════════════════════════════

  function asStr(v) {
    if (v == null) return '';
    const s = String(v);
    return s.indexOf('ScriptNullObjectAdapter') !== -1 ? '' : s;
  }

  function asNum(v) {
    const s = asStr(v);
    if (s === '') return 0;
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }

  function esc(s) {
    return asStr(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** เลขดิบเต็มความละเอียด — เก็บไว้ใน title ให้ตรวจได้ว่าไม่มีการปัด */
  function rawNum(n) {
    if (n == null || !isFinite(n)) return '';
    return String(n);
  }

  function fmt(n, dp) {
    if (n == null || !isFinite(n)) return '';
    return Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 0, maximumFractionDigits: dp == null ? 6 : dp
    });
  }

  function numCell(n, dp, extraCls) {
    const cls = 'n' + (extraCls ? ' ' + extraCls : '');
    if (n == null || !isFinite(n)) return '<td class="' + cls + ' z"></td>';
    if (n === 0) return '<td class="' + cls + ' z">0</td>';
    return '<td class="' + cls + '" title="' + esc(rawNum(n)) + '">' + esc(fmt(n, dp)) + '</td>';
  }

  const REC_URL = {
    inventoryadjustment: '/app/accounting/transactions/invadjst.nl?id=',
    itemreceipt: '/app/accounting/transactions/itemrcpt.nl?id=',
    workordercompletion: '/app/accounting/transactions/wocompl.nl?id=',
    workorderissue: '/app/accounting/transactions/woissue.nl?id=',
    workorder: '/app/accounting/transactions/workord.nl?id=',
    assemblybuild: '/app/accounting/transactions/assemblybuild.nl?id=',
    itemfulfillment: '/app/accounting/transactions/itemship.nl?id=',
    transferorder: '/app/accounting/transactions/trnfrord.nl?id=',
    purchaseorder: '/app/accounting/transactions/purchord.nl?id='
  };

  const REC_LABEL = {
    itemreceipt: 'รับสินค้า',
    inventoryadjustment: 'ปรับปรุงสินค้า',
    workordercompletion: 'ปิดงานผลิต',
    workorderissue: 'เบิกเข้าผลิต',
    assemblybuild: 'ประกอบสินค้า',
    customtransaction_mfg2_woc_costallocatio: 'ปันส่วนต้นทุน'
  };

  /**
   * ชื่อประเภทเอกสารที่ผู้ใช้เข้าใจ
   * ใบปรับปรุงสินค้าที่ประเภทเป็น MFG Summary Cost ไม่ใช่การปรับปรุงสินค้า
   * ต้องเรียกตามชื่อประเภทจริง ไม่งั้นผู้ตรวจอ่านผิดความหมาย
   */
  function docTypeLabel(row) {
    const rt = asStr(row.recordtype);
    const adj = asStr(row.adj_type);
    if (rt === 'inventoryadjustment' && adj) return adj;
    return REC_LABEL[rt] || rt;
  }

  /**
   * @param {string} recordtype
   * @param {string|number} id
   * @param {string} label      ข้อความลิงก์ — escape ให้ในนี้
   * @param {string} [iconHtml] ไอคอน (เช่น theme.ICONS.extLink) ต่อท้าย label แบบไม่ escape ซ้ำ —
   *                            เดิมผู้เรียกพิมพ์ "↗" ต่อท้าย label เองแล้วปล่อยให้ esc() กลืนเป็นตัวอักษร
   *                            ธรรมดา (#64 ขั้น 2 เปลี่ยนเป็น inline SVG จึงต้องแยกช่องไม่ให้ถูก escape)
   */
  function tranLink(recordtype, id, label, iconHtml) {
    const base = REC_URL[asStr(recordtype).toLowerCase()];
    if (!id || !base) return esc(label) + (iconHtml || '');
    return '<a target="_blank" href="' + base + encodeURIComponent(id) + '">' + esc(label)
      + (iconHtml || '') + '</a>';
  }

  function itemLink(id, label) {
    if (!id) return esc(label);
    return '<a target="_blank" href="/app/common/item/item.nl?id=' + encodeURIComponent(id) + '">' + esc(label) + '</a>';
  }

  // ═══ SQL runner ════════════════════════════════════════════════════════════
  // ทุก query ถูกบันทึกไว้ใน QLOG เพื่อให้หน้ารายงานบอกได้เองว่าส่วนไหนว่าง
  // เพราะไม่มีข้อมูล กับ ว่างเพราะ query ทำงานไม่สำเร็จ

  const QLOG = [];

  function runSQL(label, sql, params) {
    const t0 = Date.now();
    try {
      const res = query.runSuiteQLPaged({ query: sql, params: params || [], pageSize: 1000 });
      let rows = [];
      res.pageRanges.forEach((rng, i) => {
        rows = rows.concat(res.fetch({ index: i }).data.asMappedResults());
      });
      QLOG.push({ label: label, ms: Date.now() - t0, rows: rows.length, sql: sql, params: params || [], error: '' });
      return rows;
    } catch (e) {
      log.error({ title: 'runSQL ' + label, details: e.message + '\n' + sql });
      QLOG.push({ label: label, ms: Date.now() - t0, rows: 0, sql: sql, params: params || [], error: e.message });
      return [];
    }
  }

  /** SuiteQL ผูก array กับ ? ไม่ได้ — ต้องต่อ id เป็น literal (กรองให้เหลือแต่ตัวเลขก่อน) */
  function inList(ids) {
    const clean = [];
    const seen = {};
    (ids || []).forEach(x => {
      const s = String(x).replace(/[^0-9]/g, '');
      if (s && !seen[s]) { seen[s] = true; clean.push(s); }
    });
    return clean.length ? clean.join(',') : '-1';
  }

  function groupBy(rows, key) {
    const m = {};
    (rows || []).forEach(r => {
      const k = asStr(r[key]);
      if (!m[k]) m[k] = [];
      m[k].push(r);
    });
    return m;
  }

  /** groupBy แต่คืนเป็น array ของ {key, rows} เพื่อวนง่าย */
  function groupByKeys(rows, key) {
    const m = groupBy(rows, key);
    return Object.keys(m).map(k => ({ key: k, rows: m[k] }));
  }

  function uniq(arr) {
    const seen = {}, out = [];
    (arr || []).forEach(v => {
      const k = asStr(v);
      if (k && !seen[k]) { seen[k] = true; out.push(k); }
    });
    return out;
  }

  /**
   * เริ่ม request ใหม่ — ล้าง query log ของรอบก่อน
   *
   * ล้างด้วย `length = 0` ไม่ใช่สร้าง array ใหม่ เพราะฝั่งเรียกถือ reference
   * เดียวกันนี้ไว้ (`QLOG.length` ของชั้นความพร้อมอ่านตรง ๆ) — สร้างใหม่แล้วจะคนละตัว
   */
  function beginRequest() {
    QLOG.length = 0;
  }


  // ═══ ของที่ย้ายมาจาก entry ตอนก้อน E2 (#14) ════════════════════
  //
  // ทั้งชั้นเจาะลึกและชั้นความพร้อมใช้ของพวกนี้ร่วมกัน · ตอนที่ยังอยู่ไฟล์เดียว
  // มันเป็น scope เดียวกันจึงไม่เห็นว่าใครใช้ของใคร · แยกไฟล์แล้วต้องมีเจ้าของชัด
  // เนื้อในทุกฟังก์ชันตรงกับของเดิมทุกตัวอักษร

  /**
   * โหมดฝังในหน้าอื่น (`&embed=1`) — ไม่วาดแถบหัวเรื่องของตัวเอง
   * มีไว้เพื่อให้รายงานนี้ไปนั่งในหน้าอื่นได้โดยไม่มีหัวเรื่องซ้อนกันสองชั้น
   * `WOStatusTracking.js` รับพารามิเตอร์ชื่อเดียวกันด้วยความหมายเดียวกัน
   * ตั้งค่าใหม่ทุกคำขอใน onRequest เพราะ module scope อยู่ข้ามคำขอได้ในบาง execution context
   */
  let EMBED = false;

  // recordtype ที่นับเป็นความเคลื่อนไหวมูลค่าสินค้าคงคลังจริง (ดูเหตุผลข้อ 6 ด้านบน)
  // ledger ตัดสินจาก "การลงบัญชี" ไม่ใช่ hardcode รายชื่อ recordtype
  //
  // บรรทัดที่เปลี่ยนมูลค่าสินค้าคงคลังจริง = บรรทัดที่ลงบัญชีสินทรัพย์ของสินค้านั้น
  // (item.assetaccount) ผลพลอยได้คือกรณีพวกนี้ถูกจัดการเองทั้งหมด:
  //   · ใบสั่งซื้อ / ใบขอซื้อ / transfer order ไม่ลงบัญชี → หลุดออกเอง
  //   · WOC บรรทัด mainline='F' ลงบัญชี WIP ไม่ใช่บัญชีสินทรัพย์ของสินค้า → หลุดออกเอง
  //     ส่วน mainline='T' ลงบัญชีสินทรัพย์ → ถูกนับ (ไม่ต้องเขียนกฎ mainline แยก)
  //   · landed cost ลงบัญชีสินทรัพย์เดียวกัน (qty เป็น null) → ถูกนับเป็นมูลค่าโดยไม่เพิ่มปริมาณ
  //   · เอกสารสกุลต่างประเทศ ได้ยอดสกุลฐานถูกต้อง เพราะ transactionaccountingline.amount
  //     เป็นสกุลฐานอยู่แล้ว ต่างจาก transactionline.foreignamount ที่เป็นสกุลของเอกสาร
  //
  // ⚠ ต้องกรอง TAL.posting = 'T' และ TAL.accountingbook = 1 ทุกครั้ง
  //   ใบสั่งซื้อ/transfer order มี accounting line แบบ posting='F' ไว้ผูกพันงบ ถ้าไม่กรอง
  //   บรรทัดพวกนี้จะหลุดเข้า ledger พร้อมปริมาณมหาศาล (เจอจริง ปริมาณเพี้ยนเป็นระดับพันล้าน)

  /**
   * CSS เฉพาะรายงานนี้ — token และคลาสคอมโพเนนต์กลางอยู่ที่ WOReportTheme.js
   * กฎที่นี่ต้องอ้าง token เท่านั้น ห้ามใส่ค่าสีตรง ๆ อีก (เดิมเป็นโทน GitHub คนละชุดกับ template)
   */
  const REPORT_CSS = 'body{padding:0}'
    + '.content{padding:var(--sp-4) var(--sp-5) var(--sp-8)}'
    + '.sub{color:var(--pj-text-muted);font-size:var(--fs-sm);margin-bottom:var(--sp-3)}'
    + '.crumb{font-size:var(--fs-sm);margin-bottom:var(--sp-3)}'
    + 'form{background:var(--pj-surface);border:1px solid var(--pj-border);'
    + 'border-radius:var(--radius-md);padding:var(--sp-3);margin-bottom:var(--sp-4)}'
    // ── แถบตัวกรอง ────────────────────────────────────────────────────────────
    // ใช้คำศัพท์ .filterbar/.fld ชุดเดียวกับ wo-status (WOStatusTracking.js) โดยตั้งใจ —
    // ป้ายอยู่ "เหนือ" ตัวควบคุมเสมอ ไม่ใช่ข้อความไหลต่อกันคั่นด้วย &nbsp; แบบเดิม ซึ่งทำให้
    // อ่านไม่ออกว่าป้ายไหนเป็นของช่องไหนเมื่อบรรทัดตัดคำ
    // ต่างจากของ wo-status สองข้อ — ห้ามยกกฎของที่นั่นมาทับทั้งก้อน:
    //   1. ไม่มี padding/พื้น/เส้นขอบที่ .filterbar เพราะที่นี่ `form` เป็นการ์ดอยู่แล้ว
    //      (กฎ form{} ด้านบน) ใส่ซ้ำจะได้กล่องพื้นเทาซ้อนอยู่ในกล่องขาวอีกชั้น
    //   2. ความกว้างคุมเป็นราย .fld (ไม่ใช่ min-width:150px เท่ากันหมดแบบที่นั่น) เพราะฟอร์ม
    //      ภาพรวมมี 9 ช่องที่ความยาวเนื้อหาต่างกันมาก — "ไม่เกิน" รับเลขไม่กี่หลัก ส่วน
    //      "เรียงตาม" มีตัวเลือกยาวกว่า 20 ตัวอักษร · ตัวเลขความกว้างอยู่ที่ .fld จุดเดียว
    //      ตัวควบคุมข้างในกิน 100% ตามแม่เสมอ (ห้ามกลับไปใส่ style="width:" ที่ตัว input/select
    //      — inline style ชนะ CSS นี้ทุกกรณี แล้วความกว้างจะเพี้ยนกลับแบบไม่มีสัญญาณเตือน)
    + '.filterbar{display:flex;flex-wrap:wrap;align-items:flex-end;gap:var(--sp-4)}'
    // min-width:0 ไม่ใช่ของประดับ — flex item มี min-width:auto มาแต่เกิด ซึ่งดัน .fld ให้
    // กว้างเท่า min-content ของลูก ชนะ flex-basis ที่ตั้งไว้เงียบ ๆ · ช่องที่มีลูกเป็น .range
    // (ช่วงวันที่ · ไม่เกิน) โดนเต็ม ๆ เพราะ Chrome คิด min-content ของ flex container จาก
    // max-content ของลูกที่ grow ได้ — วัดจริงแล้วช่องช่วงวันที่บานจาก 270px เป็น 399px
    + '.filterbar .fld{display:flex;flex-direction:column;gap:var(--sp-1);'
    + 'min-width:0;max-width:100%}'
    + '.filterbar .fld>label{white-space:nowrap}'
    + '.filterbar .fld>input,.filterbar .fld>select{width:100%}'
    // ตัวคั่นแถว — บังคับขึ้นบรรทัดใหม่ตามกลุ่มความหมาย (ช่วงเวลา / ขอบเขต / การแสดงผล)
    // ไม่ปล่อยให้ flex-wrap ตัดกลางกลุ่มตามความกว้างจอที่บังเอิญเป็น
    + '.filterbar .brk{flex:1 0 100%;height:0;margin:0}'
    // ช่องคู่ในป้ายเดียว (from–to · จำนวน+หน่วย) · คำคั่นต้องเป็น <span> จริง ไม่ใช่ text node
    // ลอย ๆ — ลูกของ flex ที่เป็น text node กำหนดระยะ/สีไม่ได้ และเป็นที่มาของความเบียดเดิม
    + '.filterbar .range{display:flex;align-items:center;gap:var(--sp-2)}'
    + '.filterbar .range input{flex:1 1 0;min-width:0}'
    // ช่วงวันที่สองช่องใช้ .datewrap เป็นลูกของ .range จึงต้องให้กรอบแบ่งความกว้างกันเอง
    + '.filterbar .range .datewrap{flex:1 1 0;min-width:0}'
    + '.filterbar .range .sep{font-size:var(--fs-sm);color:var(--pj-text-muted);white-space:nowrap}'
    + '.filterbar .act{display:flex;align-items:center;gap:var(--sp-2)}'
    // combobox ที่ client สร้างครอบ <select name=sub/loc> ตอน enhance ต้องกว้างเท่า .fld แม่
    // (ค่าตั้งต้นของมันคือ inline-block + min-width:170px จาก theme กลาง) — .fld สองช่องนั้น
    // จึงตั้ง flex:0 0 200px ไม่ให้หด ถ้าหดต่ำกว่า 170px ตัว input จะล้นกรอบของ .fld ออกมา
    + '.filterbar .rw-combobox{display:block;width:100%}'
    + '.filterbar .rw-combobox .rw-combobox-input{width:100%}'
    // ── ที่พับ "ตัวกรองเพิ่มเติม" ของชั้นภาพรวม (issue #86) ───────────
    // ตัวกรองรอง 5 ช่องเคยอยู่แถวเดียวกันกับแถวหลัก คั่นด้วย .brk — กินแนวตั้งไป 231px
    // ทั้งที่ส่วนใหญ่ไม่ได้ถูกตั้ง · สถานะกาง/พับมาจาก attribute `open` ที่เซิร์ฟเวอร์ใส่มา ไม่ใช่ JS
    // † ขอบเขตด้วย .morefld เท่านั้น — กฎ details{}/summary{} รวมด้านล่างเป็นของ
    // หัวข้อพับในหน้าเจาะลึก แก้กฎรวมเมื่อไหร่หน้านั้นเปลี่ยนหน้าตาตามไปด้วย
    + '.morefld{margin:var(--sp-3) 0 0}'
    // width:fit-content ไม่ใช่ display:inline-block — <summary> มีสามเหลี่ยมเปิด/ปิด
    // ได้เพราะ display เป็น list-item เปลี่ยน display เมื่อไหร่ marker หายทันที
    // แล้วผู้ใช้จะไม่รู้ว่ากดตรงนี้แล้วมีช่องกรองเพิ่มมา
    + '.morefld>summary{width:fit-content;padding:3px var(--sp-2);'
    + 'font-size:var(--fs-sm);color:var(--pj-text-muted)}'
    + '.morefld>.filterbar{margin-top:var(--sp-3)}'
    // ── ช่องวันที่ (references/date-field.md) ─────────────────────────────────
    // กรอบทั้งก้อนอยู่ที่ .datewrap ใบเดียว (border + focus-ring) · input กับปุ่มข้างในไม่มี
    // กรอบของตัวเอง ปุ่มมีแค่เส้นคั่น border-left · ค่าที่มองเห็น = DATEFORMAT ของบัญชี
    // ค่าที่ส่ง/เก็บจริงยังเป็น ISO ใน URL และ SuiteQL
    + '.filterbar .datewrap{width:100%}'
    + '.datewrap{position:relative;display:flex;align-items:stretch;min-width:0;'
    + 'border:1px solid var(--pj-border-strong);border-radius:var(--radius-md);'
    + 'background:var(--pj-surface);overflow:hidden;transition:box-shadow .1s ease}'
    + '.datewrap:focus-within{box-shadow:0 0 0 2px var(--pj-primary)}'
    + '.datewrap input[type=text]{flex:1 1 auto;min-width:0;border:0;border-radius:0;'
    + 'background:transparent;box-shadow:none}'
    + '.datewrap input[type=text]:focus{outline:none;border-color:transparent;box-shadow:none}'
    + '.datebtn{position:relative;flex:0 0 28px;width:28px;padding:0;'
    + 'display:flex;align-items:center;justify-content:center;'
    + 'background:none;border:0;border-left:1px solid var(--pj-border-strong);border-radius:0;'
    + 'cursor:pointer;color:var(--pj-text-muted);transition:background-color .1s ease,color .1s ease}'
    + '.datebtn:hover{background:var(--pj-surface-alt);color:var(--pj-primary)}'
    + '.datebtn:focus-visible{outline:2px solid var(--pj-primary) !important;outline-offset:-2px}'
    + '.cal{position:fixed;z-index:40;width:238px;background:var(--pj-surface);'
    + 'border:1px solid var(--pj-border-strong);border-radius:var(--radius-md);'
    + 'box-shadow:var(--shadow-lg);padding:var(--sp-2);font-size:var(--fs-sm)}'
    + '.cal[hidden]{display:none}'
    + '.cal-head{display:flex;align-items:center;gap:var(--sp-1);margin-bottom:var(--sp-1)}'
    + '.cal-nav{background:none;border:1px solid var(--pj-border);color:var(--pj-text-dim);'
    + 'width:24px;height:24px;flex:0 0 24px;padding:0;display:inline-flex;'
    + 'align-items:center;justify-content:center;border-radius:var(--radius-sm);cursor:pointer;'
    + 'transition:background-color .1s ease,color .1s ease}'
    + '.cal-nav:hover{background:var(--pj-surface-alt);color:var(--pj-primary)}'
    + '.cal-nav:focus-visible{outline:2px solid var(--pj-primary) !important;outline-offset:1px}'
    + '.cal-month,.cal-year{font-family:inherit;font-size:var(--fs-sm);font-weight:700;'
    + 'color:var(--pj-text);background:var(--pj-surface);border:1px solid var(--pj-border);'
    + 'border-radius:var(--radius-sm);padding:2px;cursor:pointer;min-width:0}'
    + '.cal-month{flex:1 1 auto}'
    + '.cal-year{flex:0 0 60px;width:60px}'
    + '.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px}'
    + '.cal-dow{text-align:center;font-size:10px;font-weight:700;padding:2px 0;'
    + 'color:var(--pj-text-label)}'
    + '.cal-day{border:0;background:none;font-family:inherit;font-size:var(--fs-sm);'
    + 'color:var(--pj-text);padding:5px 0;border-radius:var(--radius-sm);cursor:pointer;'
    + 'font-variant-numeric:tabular-nums;transition:background-color .1s ease}'
    + '.cal-day:hover{background:var(--pj-surface-alt)}'
    + '.cal-day.muted{color:var(--pj-text-muted)}'
    + '.cal-day.today{box-shadow:inset 0 0 0 1px var(--pj-primary);font-weight:700}'
    + '.cal-day.sel{background:var(--pj-primary);color:#fff;font-weight:700}'
    + '.cal-day:focus-visible{outline:2px solid var(--pj-primary) !important;outline-offset:-2px}'
    + '.cal-foot{display:flex;justify-content:flex-end;margin-top:var(--sp-1);'
    + 'border-top:1px solid var(--pj-border);padding-top:var(--sp-1)}'
    + '.cal-today{background:none;border:0;color:var(--pj-primary);cursor:pointer;'
    + 'font-family:inherit;font-size:var(--fs-sm);font-weight:600;padding:2px var(--sp-2)}'
    + '.cal-today:hover{text-decoration:underline}'
    + '.cal-today:focus-visible{outline:2px solid var(--pj-primary) !important;outline-offset:1px}'
    + '@media (prefers-reduced-motion: reduce){'
    + '.datewrap,.datebtn,.cal-nav,.cal-day,.cal-today{transition:none}}'
    // ตัวเลขชิดขวาและไม่ตัดบรรทัด · การเทียบหลักมาจาก font-variant-numeric ของ template
    // (เดิมสลับไปฟอนต์ Consolas ทั้งคอลัมน์ ซึ่ง template เลิกทำแล้ว)
    + 'td.n,th.n{text-align:right;white-space:nowrap}'
    + 'td.z{color:var(--pj-border-strong)}'
    + 'tr.tot td{font-weight:700;background:var(--pj-warning-bg)}'
    + 'tr.grand td{font-weight:700;background:var(--pj-success-bg)}'
    + 'tr.sub td{background:var(--pj-surface-alt);font-weight:600}'
    + '.card{background:var(--pj-surface);border:1px solid var(--pj-border);'
    + 'border-radius:var(--radius-md);padding:var(--sp-3);margin-bottom:var(--sp-3)}'
    + '.kv td:first-child{background:var(--pj-surface-alt);font-weight:600;width:150px}'
    + 'details{margin:var(--sp-2) 0}'
    + 'summary{cursor:pointer;padding:6px var(--sp-2);background:var(--pj-surface-alt);'
    + 'border:1px solid var(--pj-border);border-radius:var(--radius-sm)}'
    + 'summary:hover{background:var(--pj-muted-bg)}'
    // NetSuite ship CSS reset `:focus{outline:0}` มาด้วย (ท่าเดียวกับ .cal-nav/.cal-day ของ
    // wo-status ที่ #64 ขั้น 4 ปิดช่องว่างนี้ไว้แล้ว) — <summary> คือ element โฟกัสได้จริงของ
    // <details> ที่ไม่เคยมีการปิด outline มาก่อนเลยตกหล่นในสองขั้นก่อนหน้า
    + 'summary:focus-visible{outline:2px solid var(--pj-primary) !important;outline-offset:2px}'
    + '.lvl2{margin-left:var(--sp-4);border-left:3px solid var(--pj-info);padding-left:var(--sp-3)}'
    + '.lvl3{margin-left:var(--sp-4);border-left:3px solid var(--pj-warning);padding-left:var(--sp-3)}'
    + '.bad{color:var(--pj-error);font-weight:700}'
    + '.warn{color:var(--pj-warning)}'
    + '.ok{color:var(--pj-success)}'
    // info = ข้อเท็จจริงที่ต้องรู้แต่ไม่ใช่ปัญหา เช่น สินค้าที่ตั้งค่าไว้ว่าไม่มีต้นทุนแปรสภาพ
    + '.info{color:var(--pj-text-muted)}'
    // .tag คือ .badge.info ของ template — คงชื่อคลาสเดิมไว้เพราะ markup ใช้อยู่ 19 จุด
    + '.tag{display:inline-block;padding:1px 8px;border-radius:12px;font-size:10px;'
    + 'font-weight:600;background:var(--pj-info-bg);color:var(--pj-info);margin-left:var(--sp-1)}'
    + '.err{background:var(--pj-error-bg);border:1px solid var(--pj-error);color:var(--pj-error);'
    + 'padding:7px var(--sp-2);border-radius:var(--radius-sm);margin:7px 0;font-size:var(--fs-sm)}'
    + '.miss{color:var(--pj-warning)}'
    + '.note{font-size:var(--fs-xs);line-height:1.35}'
    // ตัวชี้สถานะของแถวที่คอลัมน์แรก (#77 ข้อ 2.2) — คอลัมน์ "หมายเหตุ" อยู่ขวาสุดของตาราง
    // 16 คอลัมน์ ต้องเลื่อนจอไปสุดถึงจะรู้ว่าแถวไหนมีปัญหา · ตัวชี้นี้ย่อสถานะมาไว้ต้นแถว
    // ไม่ได้แทนคอลัมน์หมายเหตุ (ข้อความเต็มยังอยู่ที่เดิม และ export Excel ยังอ่านจากที่เดิม)
    + '.rowstat{display:flex;align-items:center;gap:3px;font-size:var(--fs-xs);'
    + 'line-height:1.35;margin-bottom:2px}'
    + '.rowstat svg{width:12px;height:12px;flex:0 0 auto}'
    // สารบัญของหน้าเจาะลึก (#77 ข้อ 2.4) — หน้ายาว 8 หัวข้อ ข้ามหัวข้อโดยไม่ต้องเลื่อนทั้งหน้า
    + '.toc{display:flex;flex-wrap:wrap;gap:var(--sp-1) var(--sp-3);margin:7px 0;'
    + 'padding:7px var(--sp-2);border:1px solid var(--pj-border);border-radius:var(--radius-sm);'
    + 'background:var(--pj-surface-alt);font-size:var(--fs-sm)}'
    + '.toc a{color:var(--pj-primary);text-decoration:none}'
    + '.toc a:hover{text-decoration:underline}'
    // ตารางภาพรวมกว้าง 15 คอลัมน์ และยาวได้ถึงหลักร้อยแถว — ให้เลื่อนในกรอบของตัวเองพร้อมหัวตารางติดบน
    // (layout-and-controls.md "ตารางกว้าง" ข้อ 2 — thead sticky ในกล่องที่ overflow:auto)
    + '.scroll{overflow:auto;max-height:76vh;border:1px solid var(--pj-border);'
    + 'border-radius:var(--radius-md);background:var(--pj-surface)}'
    + '.scroll table{margin:0;border:0}'
    // ไม่ประกาศ background ซ้ำที่นี่โดยตั้งใจ — กฎ th{background:var(--pj-muted-bg)} ของ BASE
    // (WOReportTheme.js) สปีซิฟิซิตี้ต่ำกว่าแต่ยัง "ชนะ" เพราะ .scroll thead th ไม่ได้แตะ
    // property นี้เลย (cascade ทำงานเป็นรายพร็อพเพอร์ตี้ ไม่ใช่รายบล็อก) หัวตารางที่ลอย
    // ระหว่างเลื่อนจึงทึบแสง (--pj-muted-bg = --c-surface-3) ไม่ใช่โปร่งใสทับเนื้อหาด้านล่าง —
    // test/test_table_layout.js ตรวจสองชั้น: (1) รวม body ของทุกกฎที่ selector ลงท้ายด้วย
    // "th" มาเทียบว่ามี background โทนกลางอยู่จริงสักกฎ (ไม่ได้ resolve cascade เป็นค่าเดียวจริง
    // ๆ — regex บนกฎที่รวมกันเท่านั้น) (2) ปักหมุดกฎนี้ (.scroll thead th) เองว่ายังไม่มี
    // background ประกาศอยู่ในตัวมันเอง — ถ้าใครมาเติม background ที่นี่ภายหลัง (เช่น
    // background:transparent) เทสข้อ (2) จะแดงทันทีให้มารีวิวว่าตั้งใจหรือเผลอ
    + '.scroll thead th{position:sticky;top:0;z-index:2;box-shadow:inset 0 -1px 0 var(--pj-border)}'
    // เลข WO = ลิงก์หลักไปหน้าเจาะลึก · ลิงก์ไป record ของ NetSuite แยกบรรทัดและทำให้จางลง
    // กันไม่ให้กดผิดปลายทาง (ของเดิมเป็นไอคอน ตัวเดียวติดท้ายเลขที่ตัดบรรทัด)
    + 'a.drill{font-weight:600;white-space:nowrap}'
    + '.xbar{display:flex;align-items:center;gap:var(--sp-3);margin:0 0 7px}'
    + '.xnote{font-size:var(--fs-xs);color:var(--pj-text-muted)}'
    + '.nsrec{margin-top:2px}'
    + '.nsrec a{font-size:10px;color:var(--pj-text-muted);text-decoration:none}'
    + '.nsrec a:hover{color:var(--pj-primary);text-decoration:underline}'
    // ไอคอนลิงก์นอก (#64 ขั้น 2) — markup ยังเป็น svg 16px ตามมาตรฐาน แต่ตัวอักษรข้างเคียงแค่
    // 10px จึงย่อการ์แสดงผลด้วย CSS ให้สัดส่วนเข้ากัน (ไม่ใช่แก้ viewBox/attribute ของไอคอน)
    + '.nsrec svg{width:11px;height:11px;vertical-align:-1px;margin-left:2px}';

  const CSS = theme.css(REPORT_CSS);

  /** แถบหัวเรื่อง — โหมด embed ไม่ใส่ เพราะหน้าที่ฝังเราไว้มีหัวเรื่องของตัวเองแล้ว */
  function pageTop(title, badge) {
    if (EMBED) return '';
    return theme.topbar({
      crumbs: ['Foodstar', 'รายงานต้นทุนการผลิต'],
      title: title,
      badge: badge || 'WO Cost Trace'
    });
  }

  /** โครงหน้ามาตรฐาน — style + แถบหัวเรื่อง + เนื้อหาใน .content ของ template
   *  ต่อท้ายด้วยสคริปต์ปฏิทินของ date field เสมอ (ทุกชั้นมีช่องวันที่) */
  function shell(title, body, extraCss) {
    return CSS + (extraCss || '') + pageTop(title) + '<div class="content">' + body + '</div>'
      + renderDateFieldScript();
  }


  /** URL ของ Suitelet ตัวเอง — ใช้ทั้งลิงก์เจาะลึกและลิงก์กลับหน้าภาพรวม */
  function selfUrl(params) {
    const s = runtime.getCurrentScript();
    let q = '/app/site/hosting/scriptlet.nl?script=' + encodeURIComponent(s.id)
      + '&deploy=' + encodeURIComponent(s.deploymentId);
    // โหมด embed ต้องติดไปกับทุกลิงก์ภายใน (เจาะลึก · ความพร้อม · กลับภาพรวม) ไม่งั้นกดแล้ว
    // หลุดโหมด หน้าที่ฝังเราไว้จะได้หัวเรื่องซ้อนสองชั้น · วางที่จุดเดียวแทนการเติม embed
    // ใน filterParams เพราะมีลิงก์ที่ไม่ผ่าน filterParams (เช่นลิงก์ความพร้อมจากชั้นเจาะลึก)
    if (EMBED) q += '&embed=1';
    Object.keys(params || {}).forEach(k => {
      const v = asStr(params[k]);
      if (v) q += '&' + k + '=' + encodeURIComponent(v);
    });
    return q;
  }

  /** ตัวกรองของหน้าภาพรวมในรูป query param — พาไปกับลิงก์เจาะลึกเพื่อให้กดกลับได้รายการเดิม */
  function filterParams(f) {
    const k = f || {};
    return {
      month: k.month, from: k.from, to: k.to, basis: k.basis,
      item: k.item, wono: k.wono, sub: k.sub, loc: k.loc,
      sort: k.sort, max: k.max ? String(k.max) : ''
    };
  }

  // ── date field (references/date-field.md) ─────────────────────────────────
  const CAL_ICON = theme.ICONS.calendar;

  /** placeholder ของช่องวันที่ตามรูปแบบบัญชี (เช่น dd/mm/yyyy) */
  function dateFormatHint() {
    return dateFormat().toLowerCase();
  }

  /**
   * ช่องวันที่มาตรฐาน — กรอบเดียว + ปุ่มเปิดปฏิทินของแอป
   * ค่าที่มองเห็น = DATEFORMAT ของบัญชี · ค่าที่ส่ง/ใช้จริงยังเป็น ISO
   * (ผู้เรียกอ่านกลับด้วย parseDateInput ก่อนใช้ — ดู readFilters/readReadyParams)
   * @param {{id:string,name:string,label:string,value?:string,px?:number}} opts
   */
  /** กรอบวันที่เดี่ยว (ไม่รวม .fld) — ใช้ใน .range ที่มีสองช่องในป้ายเดียว */
  function dateInput(opts) {
    const id = asStr(opts.id);
    const val = opts.value ? fmtDateDisp(opts.value) : '';
    return '<div class="datewrap">'
      + '<input type="text" name="' + esc(opts.name) + '" id="' + esc(id) + '" class="dateinput"'
      + ' value="' + esc(val) + '" placeholder="' + esc(dateFormatHint()) + '"'
      + ' inputmode="numeric" maxlength="10" autocomplete="off" spellcheck="false">'
      + '<button type="button" class="datebtn" data-for="' + esc(id) + '"'
      + ' title="เปิดปฏิทิน" aria-label="เปิดปฏิทิน" aria-haspopup="dialog" aria-expanded="false">'
      + CAL_ICON + '</button></div>';
  }

  /** ช่องวันที่เต็ม (ป้าย + กรอบ) */
  function dateField(opts) {
    return '<div class="fld" style="flex:0 0 ' + (opts.px || 170) + 'px">'
      + '<label>' + esc(opts.label) + '</label>' + dateInput(opts) + '</div>';
  }

  /**
   * สคริปต์ปฏิทินของแอป — ผูกกับทุก `.datebtn` บนหน้า (ไม่ใช่ showPicker ของเบราว์เซอร์)
   * ตรรกะเดียวกับ WOStatusTracking.js แต่ตัด i18n ออก (แอปนี้ไม่มีปุ่มสลับภาษา)
   * วันที่คำนวณด้วย `new Date(y, m, d)` ท้องถิ่นเสมอ ไม่ parse ผ่าน UTC
   */
  function renderDateFieldScript() {
    const fmt = JSON.stringify(dateFormat());
    const prev = JSON.stringify(theme.ICONS.chevronLeft);
    const next = JSON.stringify(theme.ICONS.chevronRight);
    return `<script>
(function() {
  var FMT = ${fmt};
  var CAL_PREV = ${prev}, CAL_NEXT = ${next};
  var MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var DOWS = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  var SEP = (FMT.match(/[^A-Za-z0-9]+/) || ['/'])[0] || '/';
  function p2(n) { return ('0' + n).slice(-2); }
  function valid(y, m, d) { var dt = new Date(y, m - 1, d); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d; }
  function isoOf(s) {
    s = (s || '').trim();
    if (!s) return '';
    var m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(s);
    if (m) return valid(+m[1], +m[2], +m[3]) ? s : '';
    var nums = s.split(/[^0-9]+/).map(Number);
    var toks = FMT.toUpperCase().match(/YYYY|YY|MM|M|DD|D/g) || [];
    if (nums.length !== toks.length) return '';
    var g = { Y: 0, M: 0, D: 0 };
    toks.forEach(function(t, i) {
      if (t === 'YYYY') g.Y = nums[i];
      else if (t === 'YY') g.Y = 2000 + nums[i];
      else if (t === 'MM' || t === 'M') g.M = nums[i];
      else if (t === 'DD' || t === 'D') g.D = nums[i];
    });
    return valid(g.Y, g.M, g.D) ? g.Y + '-' + p2(g.M) + '-' + p2(g.D) : '';
  }
  function disp(iso) {
    var m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(iso || '');
    if (!m) return iso || '';
    var toks = FMT.toUpperCase().match(/YYYY|YY|MM|M|DD|D/g) || ['D', 'M', 'YYYY'];
    var y = +m[1], mo = +m[2], d = +m[3];
    return toks.map(function(t) {
      return t === 'YYYY' ? String(y) : t === 'YY' ? String(y).slice(-2) : t === 'MM' ? p2(mo)
        : t === 'M' ? String(mo) : t === 'DD' ? p2(d) : String(d);
    }).join(SEP);
  }
  function isoFromYmd(y, m, d) { return y + '-' + p2(m + 1) + '-' + p2(d); }

  var openCal = null;
  function _position() {
    if (!openCal) return;
    var box = openCal.box, anchor = openCal.anchor;
    if (!box || !anchor) return;
    var pad = 4;
    var vw = (document.documentElement && document.documentElement.clientWidth) || window.innerWidth || 0;
    var vh = window.innerHeight || 0;
    var rect = (anchor.getBoundingClientRect && anchor.getBoundingClientRect()) || { top: 0, bottom: 0, left: 0, right: 0 };
    var br = (box.getBoundingClientRect && box.getBoundingClientRect()) || {};
    var width = br.width || 238, height = br.height || 280;
    var left = rect.left;
    if (vw && left + width > vw - pad) left = vw - pad - width;
    if (left < pad) left = pad;
    var below = vh ? (vh - rect.bottom) : (height + pad);
    var flip = !!(vh && below < (height + pad) && rect.top > (height + pad));
    box.style.position = 'fixed';
    box.style.left = left + 'px';
    box.style.top = (flip ? rect.top - pad - height : rect.bottom + pad) + 'px';
  }
  function _reposition() { _position(); }
  function _close(refocus) {
    if (!openCal) return;
    var cur = openCal;
    openCal = null;
    window.removeEventListener('scroll', _reposition, true);
    window.removeEventListener('resize', _reposition);
    if (cur.box && cur.box.parentNode) cur.box.parentNode.removeChild(cur.box);
    if (cur.btn) cur.btn.setAttribute('aria-expanded', 'false');
    if (refocus && cur.input) cur.input.focus();
  }
  function _pick(y, m, d) {
    var input = openCal && openCal.input;
    if (!input) return;
    input.value = disp(isoFromYmd(y, m, d));
    _close(true);
    try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
  }
  function _shift(days) {
    if (!openCal) return;
    var f = openCal.focus, dt = new Date(f.y, f.m, f.d + days);
    openCal.y = dt.getFullYear(); openCal.m = dt.getMonth();
    openCal.focus = { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
    _draw(true);
  }
  function _shiftMonth(delta) {
    if (!openCal) return;
    var dt = new Date(openCal.y, openCal.m + delta, 1);
    openCal.y = dt.getFullYear(); openCal.m = dt.getMonth();
    var last = new Date(openCal.y, openCal.m + 1, 0).getDate();
    openCal.focus = { y: openCal.y, m: openCal.m, d: Math.min(openCal.focus.d, last) };
    _draw(true);
  }
  function _shiftYear(delta) {
    if (!openCal) return;
    openCal.y = openCal.y + delta;
    var last = new Date(openCal.y, openCal.m + 1, 0).getDate();
    openCal.focus = { y: openCal.y, m: openCal.m, d: Math.min(openCal.focus.d, last) };
    _draw(true);
  }
  function _shiftToWeekEdge(target) {
    if (!openCal) return;
    var f = openCal.focus, dow = new Date(f.y, f.m, f.d).getDay();
    _shift(target - dow);
  }
  function _btn(cls, text, title, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = text;
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', onClick);
    return b;
  }
  function _iconBtn(cls, svg, title, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.innerHTML = svg;
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', onClick);
    return b;
  }
  function _select(cls, label) {
    var s = document.createElement('select');
    s.className = cls; s.setAttribute('aria-label', label);
    return s;
  }
  function _draw(moveFocus) {
    if (!openCal) return;
    var box = openCal.box;
    var iso = isoOf(openCal.input ? openCal.input.value : '');
    var sel = iso ? { y: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1, d: +iso.slice(8, 10) } : null;
    var now = new Date();
    var today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
    while (box.firstChild) box.removeChild(box.firstChild);

    var head = document.createElement('div');
    head.className = 'cal-head';
    head.appendChild(_iconBtn('cal-nav', CAL_PREV, 'เดือนก่อนหน้า', function() { _shiftMonth(-1); }));
    var monthSel = _select('cal-month', 'เดือน');
    for (var mi = 0; mi < 12; mi++) {
      var mo = document.createElement('option');
      mo.value = String(mi); mo.textContent = MONTHS[mi];
      if (mi === openCal.m) mo.selected = true;
      monthSel.appendChild(mo);
    }
    monthSel.addEventListener('change', function() {
      openCal.m = +monthSel.value;
      var last = new Date(openCal.y, openCal.m + 1, 0).getDate();
      openCal.focus = { y: openCal.y, m: openCal.m, d: Math.min(openCal.focus.d, last) };
      _draw(true);
    });
    head.appendChild(monthSel);
    var yearSel = _select('cal-year', 'ปี');
    var ys = Math.min(today.y - 10, openCal.y - 1), ye = Math.max(today.y + 10, openCal.y + 1);
    for (var yy = ys; yy <= ye; yy++) {
      var yo = document.createElement('option');
      yo.value = String(yy); yo.textContent = String(yy);
      if (yy === openCal.y) yo.selected = true;
      yearSel.appendChild(yo);
    }
    yearSel.addEventListener('change', function() {
      openCal.y = +yearSel.value;
      var last = new Date(openCal.y, openCal.m + 1, 0).getDate();
      openCal.focus = { y: openCal.y, m: openCal.m, d: Math.min(openCal.focus.d, last) };
      _draw(true);
    });
    head.appendChild(yearSel);
    head.appendChild(_iconBtn('cal-nav', CAL_NEXT, 'เดือนถัดไป', function() { _shiftMonth(1); }));
    box.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'cal-grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', MONTHS[openCal.m] + ' ' + openCal.y);
    for (var i = 0; i < 7; i++) {
      var dw = document.createElement('div');
      dw.className = 'cal-dow'; dw.setAttribute('role', 'columnheader'); dw.textContent = DOWS[i];
      grid.appendChild(dw);
    }
    var first = new Date(openCal.y, openCal.m, 1);
    var start = new Date(openCal.y, openCal.m, 1 - first.getDay());
    var focusBtn = null;
    for (var c = 0; c < 42; c++) {
      var dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + c);
      var y = dt.getFullYear(), m = dt.getMonth(), d = dt.getDate();
      var cls = 'cal-day';
      var isToday = (y === today.y && m === today.m && d === today.d);
      if (m !== openCal.m) cls += ' muted';
      if (isToday) cls += ' today';
      var isSel = !!(sel && sel.y === y && sel.m === m && sel.d === d);
      if (isSel) cls += ' sel';
      var b = _btn(cls, String(d), '', (function(yy2, mm2, dd2) {
        return function() { _pick(yy2, mm2, dd2); };
      })(y, m, d));
      b.setAttribute('role', 'gridcell');
      b.setAttribute('aria-label', disp(isoFromYmd(y, m, d)));
      if (isToday) b.setAttribute('aria-current', 'date');
      b.setAttribute('aria-selected', isSel ? 'true' : 'false');
      var isFocus = (y === openCal.focus.y && m === openCal.focus.m && d === openCal.focus.d);
      b.tabIndex = isFocus ? 0 : -1;
      if (isFocus) focusBtn = b;
      grid.appendChild(b);
    }
    box.appendChild(grid);

    var foot = document.createElement('div');
    foot.className = 'cal-foot';
    foot.appendChild(_btn('cal-today', 'วันนี้', '', function() { _pick(today.y, today.m, today.d); }));
    box.appendChild(foot);
    if (moveFocus !== false && focusBtn) focusBtn.focus();
  }
  function _onKey(e) {
    if (!openCal) return;
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); _close(true); }
    else if (k === 'ArrowLeft') { e.preventDefault(); _shift(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); _shift(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); _shift(-7); }
    else if (k === 'ArrowDown') { e.preventDefault(); _shift(7); }
    else if (k === 'Home') { e.preventDefault(); _shiftToWeekEdge(0); }
    else if (k === 'End') { e.preventDefault(); _shiftToWeekEdge(6); }
    else if (k === 'PageUp') { e.preventDefault(); if (e.shiftKey) _shiftYear(-1); else _shiftMonth(-1); }
    else if (k === 'PageDown') { e.preventDefault(); if (e.shiftKey) _shiftYear(1); else _shiftMonth(1); }
  }
  function _open(input, btn) {
    if (openCal && openCal.input === input) { _close(true); return; }
    _close(false);
    var box = document.createElement('div');
    box.className = 'cal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'เลือกวันที่');
    box.addEventListener('keydown', _onKey);
    (document.body || document).appendChild(box);
    var anchor = input.parentNode || input;
    var iso = isoOf(input.value);
    var now = new Date();
    var view = iso ? { y: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1, d: +iso.slice(8, 10) }
      : { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
    openCal = { input: input, btn: btn, box: box, anchor: anchor, y: view.y, m: view.m, focus: view };
    btn.setAttribute('aria-expanded', 'true');
    _position(); _draw(true); _position();
    window.addEventListener('scroll', _reposition, true);
    window.addEventListener('resize', _reposition);
  }

  document.addEventListener('mousedown', function(e) {
    if (!openCal) return;
    if (openCal.box.contains(e.target) || (openCal.btn && openCal.btn.contains(e.target))) return;
    _close(false);
  });
  var btns = document.querySelectorAll('.datebtn');
  for (var bi = 0; bi < btns.length; bi++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var input = document.getElementById(btn.getAttribute('data-for'));
        if (input) _open(input, btn);
      });
    })(btns[bi]);
  }
  // พิมพ์เอง: อ่านไม่ออก = คืนค่าเดิม (ไม่ล้าง ไม่เดา) · ว่าง = ล้าง
  var inputs = document.querySelectorAll('.dateinput');
  for (var ii = 0; ii < inputs.length; ii++) {
    (function(input) {
      input.addEventListener('focus', function() { input._prev = input.value; });
      input.addEventListener('blur', function() {
        var v = input.value.trim();
        if (v && !isoOf(v)) input.value = input._prev || '';
      });
    })(inputs[ii]);
  }
  window.__closeDateCal = function() { _close(false); };
})();
<\/script>`;
  }


  /**
   * คลาสสถานะของรายงาน → accent ของ template
   * รายงานนี้ใช้คำว่า bad/warn/ok/info มาตลอด ส่วน template ใช้ error/warning/success/info
   * แปลที่จุดเดียวแทนการเปลี่ยนคำทั่วไฟล์ (คลาสเดิมยังใช้ระบายสีข้อความในตารางอยู่)
   */
  const KPI_ACCENT = { bad: 'error', warn: 'warning', ok: 'success', info: 'info' };

  /** การ์ด KPI ใบเดียวตาม template — ป้ายอยู่บน ค่าอยู่กลาง คำขยายอยู่ล่าง */
  function kpi(label, value, cls, meta) {
    return theme.kpiCard({
      label: label, value: value, meta: meta, accent: KPI_ACCENT[cls] || 'primary'
    });
  }

  function todayIso() {
    const d = new Date();
    const m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }

  // ── วันที่: รูปแบบของบัญชี ↔ ISO ───────────────────────────────────────────
  // แหล่งความจริงภายในคือ ISO (SuiteQL · URL · ลิงก์) · สิ่งที่ผู้ใช้เห็นคือ DATEFORMAT ของบัญชี
  // ตาม references/date-field.md ของ teibto-ui-redwood · ห้ามเดารูปแบบ: อ่านไม่ออก = '' แล้วให้
  // ผู้เรียกคืนค่าเดิม ไม่ใช่ตีความเป็นวันอื่นเงียบ ๆ

  /** DATEFORMAT ของบัญชี (เช่น DD/MM/YYYY) · อ่านไม่ได้/รูปแบบไม่รองรับ → ถอยเป็น DD/MM/YYYY
   *  รองรับเฉพาะรูปแบบตัวเลข (Y/M/D + ตัวคั่น) — รูปแบบที่ใช้ชื่อเดือน (DD-Mon-YYYY) ยังไม่รองรับ
   *  จึงถอยเป็นค่ามาตรฐานแทนการเดา (Foodstar ใช้ DD/MM/YYYY — ยืนยันจาก #28) */
  function dateFormat() {
    try {
      const p = String(runtime.getCurrentUser().getPreference({ name: 'DATEFORMAT' }) || '').toUpperCase();
      if (/^[YMD\/.\- ]+$/.test(p) && /Y/.test(p) && /M/.test(p) && /D/.test(p)) return p;
    } catch (e) { /* อ่าน preference ไม่ได้ = ใช้ค่าถอย ไม่ throw กลางหน้า */ }
    return 'DD/MM/YYYY';
  }

  /** ตรวจว่าเป็นวันจริง แล้วคืน ISO 'YYYY-MM-DD' (ไม่จริง = '') */
  function validIso(y, m, d) {
    if (!(y > 0 && m > 0 && d > 0)) return '';
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
    const p2 = (n) => (n < 10 ? '0' : '') + n;
    return y + '-' + p2(m) + '-' + p2(d);
  }

  /**
   * อ่านข้อความวันที่ที่ผู้ใช้พิมพ์ → ISO · รับ ISO เสมอ + รูปแบบบัญชี (DATEFORMAT)
   * อ่านไม้ออกหรือวันไม่มีจริง → '' (ผู้เรียกต้องคืนค่าเดิม ไม่เดา)
   */
  function parseDateInput(text, fmt) {
    const s = asStr(text).trim();
    if (!s) return '';
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (iso) return validIso(+iso[1], +iso[2], +iso[3]);

    const order = [];
    const src = asStr(fmt || dateFormat()).trim();
    const rx = src.replace(/YYYY|YY|MM|M|DD|D|[^A-Za-z]+|[A-Za-z]/g, (tok) => {
      const t = tok.toUpperCase();
      if (t === 'YYYY') { order.push('Y');  return '(\\d{4})'; }
      if (t === 'YY')   { order.push('Y2'); return '(\\d{2})'; }
      if (t === 'MM' || t === 'M') { order.push('M'); return '(\\d{1,2})'; }
      if (t === 'DD' || t === 'D') { order.push('D'); return '(\\d{1,2})'; }
      return tok.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&').replace(/\s+/g, '\\s+');
    });
    const m = new RegExp('^' + rx + '$').exec(s);
    if (!m) return '';
    const g = { Y: 0, Y2: 0, M: 0, D: 0 };
    let i = 1;
    order.forEach((k) => { g[k] = +m[i++]; });
    return validIso(g.Y2 ? 2000 + g.Y2 : g.Y, g.M, g.D);
  }

  /** ISO → ข้อความตามรูปแบบบัญชีสำหรับแสดงผล (ค่าที่ไม่ใช่ ISO คืนเดิม) */
  function fmtDateDisp(iso, fmt) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asStr(iso));
    if (!m) return asStr(iso);
    const y = +m[1], mo = +m[2], d = +m[3];
    const p = asStr(fmt || dateFormat()).toUpperCase();
    const sep = (p.match(/[^A-Z0-9]+/) || ['/'])[0] || '/';
    const p2 = (n) => (n < 10 ? '0' : '') + n;
    const toks = p.match(/YYYY|YY|MM|M|DD|D/g) || ['D', 'M', 'YYYY'];
    return toks.map((t) => (
      t === 'YYYY' ? String(y)
        : t === 'YY' ? String(y).slice(-2)
          : t === 'MM' ? p2(mo)
            : t === 'M' ? String(mo)
              : t === 'DD' ? p2(d) : String(d)
    )).join(sep);
  }

  function uomFactor(ctx, fromId, toId) {
    const f = asStr(fromId), t = asStr(toId);
    if (!f || !t || f === t) return { factor: 1, note: 'หน่วยเดียวกัน' };
    const fu = ctx.uomById[f], tu = ctx.uomById[t];
    if (!fu || !tu) return { factor: null, note: 'ไม่พบหน่วยในตารางแปลง' };
    if (asStr(fu.units_type) !== asStr(tu.units_type)) return { factor: null, note: 'อยู่ต่างกลุ่มหน่วย' };
    const fr = asNum(fu.conv_rate), tr = asNum(tu.conv_rate);
    if (!fr || !tr) return { factor: null, note: 'อัตราแปลงเป็นศูนย์' };
    return {
      factor: fr / tr,
      note: '1 ' + asStr(fu.unit_name) + ' = ' + rawNum(fr / tr) + ' ' + asStr(tu.unit_name)
    };
  }

  /** ต้นทุน/หน่วยจาก BOM มาตรฐาน × average cost — วิธีที่สองสำหรับ cross-check */
  function renderQLog() {
    let h = '<details><summary>รายละเอียดทางเทคนิค — คำสั่งดึงข้อมูล ' + QLOG.length + ' ชุด</summary>';
    QLOG.forEach(q => {
      h += `<div class="card"><b>${esc(q.label)}</b> — ${q.rows} แถว · ${q.ms} ms`
        + (q.error ? `<div class="err">ERROR: ${esc(q.error)}</div>` : '')
        + `<pre>${esc(q.sql.trim())}</pre>`
        + (q.params.length ? `<pre>params: ${esc(JSON.stringify(q.params))}</pre>` : '') + '</div>';
    });
    return h + '</details>';
  }

  // ═══ Cost ref — ใช้แยก "ไม่มีต้นทุนแปรสภาพ" ออกจาก "ยังไม่ปันส่วน" ═══════════
  //
  // สินค้าบางกลุ่มไม่มีต้นทุนแปรสภาพโดยการตั้งค่า — Cost ref ของสินค้านั้นตั้งทุกช่องต้นทุนไว้
  // เป็น 0 หรือปล่อยว่าง (ตัวอย่างที่ผู้ใช้ชี้: customrecord_mfg_cost_ref id 17 บน SB1)
  // ใบพวกนี้ไม่ควรขึ้นคำเตือน "ยังไม่ปันส่วนต้นทุนแปรสภาพ" เพราะไม่มีอะไรให้ปันส่วน
  // คำเตือนต้องขึ้นเฉพาะเมื่อ **มีต้นทุนใน Cost ref** หรือ **จับคู่ Cost ref ไม่ได้เลย**
  //
  // ⚠ จับคู่ที่ระดับ **สินค้า** เท่านั้น ไม่ join work center ของ task
  //   ใบที่ยังไม่ปล่อยงานจะไม่มี work center → กลายเป็น "จับคู่ไม่ได้" ทั้งที่สินค้านั้นมี Cost ref
  //   คือย้ายที่เกิด false positive ไม่ใช่กำจัด · จะเพิ่ม work center ก็ต่อเมื่อพบว่าคำตัดสินต่างกันจริง
  //
  // ดึงทีเดียวตามรายการสินค้า (สินค้าน้อยกว่าใบสั่งผลิตมาก) แล้วจับคู่บริษัท/ช่วงวันที่ใน JS

  const COST_REF_LABEL = 'Cost ref ของสินค้าที่ผลิต';

  // rectype ของ customrecord_mfg_cost_ref บน SB1 — ใช้ประกอบลิงก์เปิด record เท่านั้น
  // ⚠ เลข rectype เป็นของแต่ละบัญชี ถ้าเอาขึ้น production ต้องตรวจก่อนว่าเป็นเลขเดียวกัน
  const COST_REF_RECTYPE = 595;

  /** ช่องต้นทุนบน Cost ref — ครบทุกช่องที่ engine ปันส่วนต้นทุนอ่านไปใช้ */
  const COST_REF_COSTS = [
    { col: 'c_dept_fixed', field: 'custrecord_dept_fixed_cost',   label: 'OH แผนก คงที่' },
    { col: 'c_dept_var',   field: 'custrecord_dept_var_cost',     label: 'OH แผนก ผันแปร' },
    { col: 'c_dept_fac',   field: 'custrecord_dept_fac_cost',     label: 'OH แผนก facility' },
    { col: 'c_mac_fixed',  field: 'custrecord_mac_fixed_cost',    label: 'OH เครื่องจักร คงที่' },
    { col: 'c_mac_var',    field: 'custrecord_mfg_mac_var_cost',  label: 'OH เครื่องจักร ผันแปร' },
    { col: 'c_labor',      field: 'custrecord_labor_normal_cost', label: 'ค่าแรงปกติ' },
    { col: 'c_indirect',   field: 'custrecord_indirect_cost',     label: 'ต้นทุนทางอ้อม' }
  ];

  // custrecord_mfg_cost_ref_option: 1 = Calculate Cost from Set Up Rate · 2 = Using Cost from Record
  const COST_REF_OPT_FROM_RECORD = '2';

  /**
   * Cost ref ทุกแถวของสินค้าที่ระบุ พร้อมช่วงผลบังคับจาก header
   * คืน failed=true เมื่อคำสั่งพัง เพื่อไม่ให้ "อ่านไม่ได้" ถูกอ่านเป็น "ไม่มี Cost ref"
   * (query พังคืนแถวว่าง ซึ่งถ้าไม่แยกไว้จะกลายเป็นคำเตือนผิดทุกใบพร้อมกัน)
   */
  function qCostRef(itemIds) {
    if (!itemIds || !itemIds.length) return { rows: [], failed: false };
    const at = QLOG.length;
    const costCols = COST_REF_COSTS.map(c => `             CR.${c.field} AS ${c.col},`).join('\n');
    const rows = runSQL(COST_REF_LABEL, `
      SELECT CR.id                                            AS cr_id,
             CR.custrecord_item_ref                           AS item_id,
             CR.custrecord_workcenter                         AS wc_id,
             CR.custrecord_mfg_cost_ref_option                AS cr_option,
             CR.custrecord_qty                                AS ref_qty,
${costCols}
             CS.id                                            AS setup_id,
             CS.name                                          AS setup_name,
             CS.custrecord_mfg_costref_setup_subsidiary       AS sub_id,
             TO_CHAR(CS.custrecord_mfg_costref_setup_startdate, 'YYYY-MM-DD') AS start_iso,
             TO_CHAR(CS.custrecord_mfg_costref_setup_enddate,   'YYYY-MM-DD') AS end_iso
      FROM customrecord_mfg_cost_ref CR
      LEFT JOIN customrecord_mfg_costref_setup CS ON CS.id = CR.custrecord_mfg_cost_refparent
      WHERE CR.custrecord_item_ref IN (${inList(itemIds)})
        AND NVL(CR.isinactive, 'F') = 'F'
    `);
    let failed = false;
    for (let i = at; i < QLOG.length; i++) { if (QLOG[i].error) failed = true; }
    return { rows: rows, failed: failed };
  }

  /** ผลรวมทุกช่องต้นทุนบน Cost ref 1 แถว — ว่างกับ 0 นับเหมือนกัน */
  function costRefCost(r) {
    let sum = 0;
    COST_REF_COSTS.forEach(c => { sum += Math.abs(asNum(r[c.col])); });
    return sum;
  }

  /** แถว Cost ref นี้มีผลกับใบสั่งผลิตของบริษัทและวันที่นี้หรือไม่ (ช่องว่าง = ไม่จำกัด) */
  function costRefInEffect(r, subId, dateIso) {
    const rs = asStr(r.sub_id), sub = asStr(subId);
    if (rs && sub && rs !== sub) return false;
    const s = asStr(r.start_iso), e = asStr(r.end_iso), d = asStr(dateIso);
    if (d) {
      if (s && d < s) return false;
      if (e && d > e) return false;
    }
    return true;
  }

  /**
   * คำตัดสินของ Cost ref ต่อใบสั่งผลิตหนึ่งใบ
   *   has     มีต้นทุนตั้งไว้     → ยังไม่ปันส่วน = เตือน
   *   nomatch จับคู่ไม่ได้เลย     → ยังไม่ปันส่วน = เตือน (คนละสาเหตุกับ has จึงแยกข้อความ)
   *   zero    ตั้งไว้ 0/ว่างหมด   → ไม่มีอะไรให้ปันส่วน = ไม่เตือน
   *   rate    คิดจาก Set Up Rate → ช่องต้นทุนบน record ไม่ใช่คำตอบ สรุปว่า "ไม่มี" ไม่ได้
   *   unknown อ่าน Cost ref ไม่สำเร็จ → กลับไปใช้คำเตือนเดิม ไม่สรุปอะไรเพิ่ม
   */
  /**
   * หาใบสั่งผลิตจากสิ่งที่ผู้ใช้พิมพ์ — ตัวเลขล้วน = internal id · ที่เหลือ = เลขที่เอกสาร
   *
   * เลขที่เอกสารเทียบแบบ **ตัดขีดออกทั้งสองฝั่ง** (issue #77 ข้อ B5) · บนบัญชีนี้ `tranid`
   * มีขีด (`WO-FSC-00001293`) แต่เอกสารและบันทึกเก่าของทีมเขียนแบบไม่มีขีด (`WOFSC00000470`)
   * ของเดิมเทียบตรงตัวจึงตอบ "ไม่พบใบสั่งผลิต" ทั้งที่ใบมีอยู่ เพียงเพราะพิมพ์คนละรูปแบบ
   *
   * ตัดเฉพาะขีด ไม่ตัดช่องว่าง/อักขระอื่น — กว้างกว่านี้แล้วจะเริ่มจับคู่ใบที่ไม่ได้ตั้งใจ ·
   * กิ่ง `byId` คงพฤติกรรมเดิมทุกอย่าง (ตัวเลขล้วนยังเป็น internal id ไม่ใช่เลขที่เอกสาร)
   *
   * ⚠ ชั้นความพร้อม (`&ready=`) ใช้ฟังก์ชันนี้ด้วย แล้วถอยไปหา "รหัสสินค้า" เมื่อไม่พบใบสั่งผลิต ·
   * การจับคู่ที่กว้างขึ้นมีผลได้ทางเดียวคือ "เคยหาไม่เจอ แล้วตอนนี้เจอ" ทางถอยจึงยังทำงานเหมือนเดิม
   *
   * ⚠ การตัดขีดทำให้เลขที่คนละใบชนกันได้ (`WO-FSC-001` กับ `WOF-SC001` ตัดขีดแล้วเท่ากัน)
   * ผู้เรียกหยิบแถวแรกไปแสดง จึงต้อง **เรียงให้แถวที่ตรงตัวมาก่อนเสมอ** (ทำใน JS ด้านล่าง)
   * และผู้เรียกต้องเตือนเมื่อได้มากกว่าหนึ่งแถว (`buildModel` → `m.ambiguous` ·
   * `buildReady` → `ambiguous`) ห้ามเลือกใบให้เงียบ ๆ
   */
  function qWO(woKey) {
    const key = String(woKey).trim();
    const byId = /^\d+$/.test(key);
    const rows = runSQL('WO header', `
      SELECT WO.id                                       AS wo_id,
             WO.tranid                                   AS wo_no,
             WO.trandate                                 AS wo_date,
             TO_CHAR(WO.trandate, 'YYYY-MM-DD')          AS wo_date_iso,
             BUILTIN.DF(WO.entitystatus)                 AS wo_status,
             BUILTIN.DF(WO.subsidiary)                   AS subsidiary,
             BUILTIN.DF(WO.custbody_mfg_work_order_type) AS wo_type,
             BUILTIN.DF(WO.custbody_mfg_production_line) AS production_line,
             WO.custbody_mfg_qty_produce_back_order      AS backorder_qty
      FROM transaction WO
      WHERE WO.recordtype = 'workorder' AND ${byId ? 'WO.id = ?'
        : "REPLACE(UPPER(WO.tranid), '-', '') = REPLACE(UPPER(?), '-', '')"}
    `, [key]);
    if (byId || rows.length < 2) return rows;
    // เรียงใน JS ไม่ใช่ใน SQL โดยตั้งใจ — ORDER BY ที่มี bind อยู่ในนิพจน์เป็นของที่ต้องไปพิสูจน์
    // กับบัญชีจริงก่อนถึงจะรู้ว่า parse ผ่าน และ query นี้เป็นคำสั่งแรกของทุก request
    // (ทั้งชั้นเจาะลึกและชั้นความพร้อม) พังเมื่อไหร่คือหน้าตายทั้งหน้า · เรียงใน JS ได้ผลเท่ากัน
    // ไม่ต้องเดา และเทสต์ยันลำดับจริงได้ ไม่ใช่ยันแค่ข้อความ SQL
    const up = key.toUpperCase();
    const exact = rows.filter(r => asStr(r.wo_no).toUpperCase() === up);
    const rest = rows.filter(r => asStr(r.wo_no).toUpperCase() !== up);
    const byWoId = (a, b) => asNum(a.wo_id) - asNum(b.wo_id);
    return exact.sort(byWoId).concat(rest.sort(byWoId));
  }

  /** บรรทัดบน WO เอง: mainline='T' = ของที่จะผลิต · mainline='F' = component ตาม BOM */
  function qWOLines(woIds) {
    return runSQL('WO lines (BOM standard)', `
      SELECT TL.transaction                            AS wo_id,
             TL.mainline                               AS mainline,
             TL.item                                   AS item_id,
             I.itemid                                  AS item_code,
             I.displayname                             AS item_name,
             NVL(I.isphantom, 'F')                     AS is_phantom,
             NVL(I.custitem_mfg_summarycostitem, 'F')  AS is_summary,
             TL.quantity                               AS quantity,
             BUILTIN.DF(TL.units)                      AS unit_name,
             TL.subsidiary                             AS sub_id
      FROM transactionline TL
      LEFT JOIN item I ON I.id = TL.item
      WHERE TL.transaction IN (${inList(woIds)}) AND TL.taxline = 'F'
      ORDER BY TL.transaction, TL.mainline DESC, TL.linesequencenumber
    `);
  }

  /**
   * ใบเบิกวัตถุดิบเข้า WO — Inventory Adjustment ที่ประเภทถูกตั้งเป็นเบิกวัตถุดิบ/บรรจุ
   * (ผูก WO ที่ระดับบรรทัด ไม่ใช่หัวเอกสาร เพราะ 1 ใบเบิกใช้กับหลาย WO ได้)
   */
  function qUOM() {
    return runSQL('อัตราแปลงหน่วย', `
      SELECT U.internalid     AS uom_id,
             U.unitstype      AS units_type,
             U.unitname       AS unit_name,
             U.conversionrate AS conv_rate,
             U.baseunit       AS is_base
      FROM unitstypeuom U
    `);
  }

  /** ตั้งโหมดฝัง — entry เรียกทุก request เพราะ module scope อยู่ข้ามคำขอได้ */
  function setEmbed(v) {
    EMBED = !!v;
  }

  return {
    // helper
    asStr: asStr,
    asNum: asNum,
    esc: esc,
    rawNum: rawNum,
    fmt: fmt,
    numCell: numCell,
    REC_URL: REC_URL,
    REC_LABEL: REC_LABEL,
    docTypeLabel: docTypeLabel,
    tranLink: tranLink,
    itemLink: itemLink,
    // ไอคอนสถานะ (#64 ขั้น 2) — ให้ lib ที่ไม่ได้ require WOReportTheme เอง (เช่น _Ready.js
    // ที่ require ไฟล์นี้อยู่แล้ว) เข้าถึง path เดียวกับที่ entry ใช้ ไม่ต้องเพิ่ม dependency ใหม่
    ICONS: theme.ICONS,
    iconImg: theme.iconImg,
    // SQL runner + query log
    runSQL: runSQL,
    QLOG: QLOG,
    beginRequest: beginRequest,
    // ตัวช่วยจัดกลุ่มแถว
    inList: inList,
    groupBy: groupBy,
    groupByKeys: groupByKeys,
    uniq: uniq,
    // โครงหน้า (ย้ายมาที่ #14)
    REPORT_CSS: REPORT_CSS,
    CSS: CSS,
    pageTop: pageTop,
    shell: shell,
    setEmbed: setEmbed,
    selfUrl: selfUrl,
    filterParams: filterParams,
    // date field (date-field.md)
    dateField: dateField,
    dateInput: dateInput,
    renderDateFieldScript: renderDateFieldScript,
    dateFormatHint: dateFormatHint,
    renderQLog: renderQLog,
    kpi: kpi,
    KPI_ACCENT: KPI_ACCENT,
    // ตัวช่วยคำนวณที่ใช้ร่วมกัน
    todayIso: todayIso,
    // วันที่: รูปแบบบัญชี ↔ ISO (date-field.md)
    dateFormat: dateFormat,
    validIso: validIso,
    parseDateInput: parseDateInput,
    fmtDateDisp: fmtDateDisp,
    uomFactor: uomFactor,
    // query + Cost ref ที่ใช้ร่วมกันสองชั้น
    qWO: qWO,
    qWOLines: qWOLines,
    qUOM: qUOM,
    qCostRef: qCostRef,
    costRefCost: costRefCost,
    costRefInEffect: costRefInEffect,
    COST_REF_LABEL: COST_REF_LABEL,
    COST_REF_RECTYPE: COST_REF_RECTYPE,
    COST_REF_COSTS: COST_REF_COSTS,
    COST_REF_OPT_FROM_RECORD: COST_REF_OPT_FROM_RECORD
  };
});
