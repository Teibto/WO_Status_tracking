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
  //
  // ─── style เดียวกับ Costing Custom Report Center (CCRC) — issue #96 ───────────────────
  // CCRC ฝังรายงานนี้ด้วย `&embed=1` (ns-foodstar-9751184 ui-src/modules/50-appframes.js)
  // ต้นแบบคือ token/เมตริกของ ns-foodstar-9751184 `ui-src/styles/` (Teibto Redwood):
  //   00-tokens.css (token) · 90-forms.css (.btn/.field 32px) · 80-tables.css (.rw-table)
  //   60-view.css (.kpi/.sec) · 10-shell.css (.viewtitle/.iconbtn) · 40-app.css (:focus-visible)
  // สีทุกตัว (`--c-*`) มีอยู่ใน theme กลางแล้วค่าเดียวกับ 00-tokens.css — ที่นี่ประกาศเพิ่มเฉพาะ
  // token ที่ไม่ใช่สีซึ่ง theme กลางยังไม่มี และ**ไม่มีค่าสี literal เลย** (--focus-ring ต้นทาง
  // เขียน #161513 = ค่าของ --c-text จึงอ้าง var(--c-text) แทน)
  // อยู่ที่ REPORT_CSS ของแอปนี้ ไม่ใช่ shared/WOReportTheme.js โดยตั้งใจ — WO Status ใช้ theme
  // ไฟล์เดียวกันบน File Cabinet และต้องหน้าตาเหมือนเดิม (ผู้ใช้สั่งเฉพาะ WO Cost Trace)
  // `--sp-N` ของ theme กลางมีค่าเท่า `--s-N` ของ CCRC ทุกตัวที่ใช้ (4/8/12/16/20/24/32) จึงใช้ต่อ
  const CCRC_CSS = ':root{'
    // [src: ns-foodstar-9751184/ui-src/styles/00-tokens.css:79-80]
    + '--f-sans:"Oracle Sans","Helvetica Neue","IBM Plex Sans Thai","Noto Sans Thai",Sarabun,'
    + '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
    + '--f-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'
    // [src: 00-tokens.css:90-96] · [src: 00-tokens.css:53] · [src: 00-tokens.css:119-126]
    + '--w-regular:400;--w-semibold:600;--w-bold:700;--lh-tight:1.25;--lh-normal:1.5;'
    + '--bw-control:0.8px;--btn-h:32px;--btn-px:14px;--tap-min:40px;'
    + '--focus-ring:0 0 0 2px var(--c-text);'
    // [src: 00-tokens.css:136] · [src: 00-tokens.css:140-141] ขนาดไอคอนของ CCRC (ผู้ใช้ตัดสิน 2026-10-11)
    + '--layout-topbar:56px;--icon:18px;--icon-lg:20px}'
    // ── หน้า (10-shell.css body · 40-app.css .viewbody) ──
    + 'body{font-family:var(--f-sans);background:var(--c-bg);color:var(--c-text);'
    + 'font-size:var(--t-base);line-height:var(--lh-normal)}'
    + 'a{color:var(--c-link)}'
    // h1 = .viewtitle · h2 = .sec (เส้นใต้ + ตัวหนา t-md) · h3 รองลงมา
    + 'h1{font-size:var(--t-xl);font-weight:var(--w-bold);line-height:var(--lh-tight);letter-spacing:normal}'
    + 'h2{font-size:var(--t-md);font-weight:var(--w-bold);margin:var(--sp-6) 0 var(--sp-3);'
    + 'padding-bottom:var(--sp-2);border-bottom:1px solid var(--c-border)}'
    + 'h3{font-size:var(--t-base);font-weight:var(--w-semibold);color:var(--c-text-subtle);'
    + 'margin:var(--sp-4) 0 var(--sp-2)}'
    // ── แถบหัวเรื่องแบบ CCRC (10-shell.css .topbar/.viewtitle) — ชื่อหน้าเป็น h1.viewtitle ในแถบเอง
    // ไม่ใช่ breadcrumb ตัวเล็ก + h1 อีกตัวใต้แถบ (QA #96 ข้อ 14) · `flex-wrap:nowrap` ทับของ theme กลาง
    + '.topbar{min-height:var(--layout-topbar);display:flex;align-items:center;gap:var(--sp-3);'
    + 'padding:0 var(--sp-6);background:var(--c-surface);border-bottom:1px solid var(--c-border);flex-wrap:nowrap}'
    + '.topbar .right{display:flex;align-items:center;gap:var(--sp-2);margin-left:auto}'
    + '.viewtitle{margin:0;display:flex;align-items:baseline;gap:var(--sp-2);font-size:var(--t-xl);'
    + 'font-weight:var(--w-bold);line-height:var(--lh-tight);letter-spacing:normal;min-width:0}'
    // ป้าย "WO Cost Trace" = .badge--brand ของ CCRC (42-controls.css:45-54) · theme กลางวาด .engine-badge
    // เป็นแถบแบรนด์ทึบตัวขาว (WOReportTheme.js ห้ามแก้ — WO Status ใช้ไฟล์เดียวกัน) จึงทับทุก property ที่นี่
    + '.engine-badge{display:inline-flex;align-items:center;justify-content:center;gap:0;'
    + 'min-width:20px;height:20px;padding:0 6px;margin-left:0;border-radius:var(--r-pill);'
    + 'background:var(--c-brand-soft);color:var(--c-brand);font-size:var(--t-xs);'
    + 'font-weight:var(--w-semibold);letter-spacing:normal;white-space:nowrap;flex:none}'
    // ── ตัวควบคุม (90-forms.css .field / .btn) ──
    + 'label{font-size:var(--t-sm);font-weight:var(--w-regular);color:var(--c-text-muted);letter-spacing:normal}'
    + 'input[type=text],input[type=date],select,textarea{height:var(--btn-h);padding:0 var(--sp-2);'
    + 'border:var(--bw-control) solid var(--c-border-control);border-radius:var(--r-md);'
    + 'font-size:var(--t-base);background-color:var(--c-surface);color:var(--c-text)}'
    + 'textarea{height:auto}'
    // <select multiple> (ช่องเลือกหลายคลังของชั้นความพร้อม `rlocsel` size=6) ต้องสูงตามจำนวนแถว —
    // height:32px ข้างบนชนะ attribute size แล้วกล่องจะเหลือแถวเดียวจนเลือกคลังไม่ได้
    + 'select[multiple]{height:auto;padding:var(--sp-1)}'
    // ตัวเลือกที่เลือกแล้วของ <select multiple> = โทนเดียวกับแถวที่เลือกของ combobox CCRC
    // (47-combobox.css:170-173) · Chrome วาดพื้น option:checked ด้วยสีระบบทับ background-color
    // จึงต้องมี inset box-shadow ด้วยถึงจะเห็นสี token จริง
    + 'select[multiple] option:checked{background-color:var(--c-brand-soft);color:var(--c-brand);'
    + 'box-shadow:inset 0 0 0 100px var(--c-brand-soft)}'
    + 'input[type=text]:focus,input[type=date]:focus,select:focus{outline:none;'
    + 'border-color:var(--c-border-control);box-shadow:var(--focus-ring)}'
    // padding ตาม 47-combobox.css:107 — ข้อความเริ่มที่ 8px ตรงกับ text/date input · ขวา 32px เว้นที่ลูกศร
    + '.rw-select,.rw-combobox .rw-combobox-input{height:var(--btn-h);min-height:var(--btn-h);'
    + 'padding:0 var(--sp-8) 0 var(--sp-2);'
    + 'border-width:var(--bw-control);border-color:var(--c-border-control);font-size:var(--t-base)}'
    // รายการของ combobox (47-combobox.css:153-173) — เส้นขอบอ่อน · แถวสูง --btn-h · hover surface-3
    + '.rw-combobox-list{border-color:var(--c-border);padding:var(--sp-1) 0}'
    + '.rw-combobox-option{min-height:var(--btn-h);padding:0 var(--sp-2);font-size:var(--t-base)}'
    + '.rw-combobox-option:hover{background-color:var(--c-surface-3)}'
    + '.rw-combobox-option.is-active,.rw-combobox-option[aria-selected="true"]{'
    + 'background-color:var(--c-brand-soft);color:var(--c-brand)}'
    + '.btn{height:var(--btn-h);padding:0 var(--btn-px);gap:var(--sp-2);justify-content:center;'
    + 'border:var(--bw-control) solid var(--c-border-control);border-radius:var(--r-md);'
    + 'background-color:var(--c-surface);color:var(--c-text);'
    + 'font-size:var(--t-base);font-weight:var(--w-semibold)}'
    + '.btn:hover:enabled{background-color:var(--c-surface-3);border-color:var(--c-border-control);color:var(--c-text)}'
    + '.btn.primary{background-color:var(--c-brand);border-color:var(--c-brand);color:var(--c-brand-on)}'
    + '.btn.primary:hover:enabled{background-color:var(--c-brand-strong);border-color:var(--c-brand-strong);'
    + 'color:var(--c-brand-on)}'
    // ปุ่มที่กดไม่ได้ = ปุ่มเดิมจางลง (42-controls.css:40) ไม่ใช่พื้นเทาเปลี่ยนสีแบบ theme กลาง
    + '.btn:disabled{background-color:var(--c-surface);border-color:var(--c-border-control);'
    + 'color:var(--c-text);opacity:.45;cursor:not-allowed}'
    // ── ตาราง (80-tables.css .rw-table) — หัวโทนกลาง ไม่ใช่แถบแบรนด์ · เส้นแนวนอนอย่างเดียว ──
    // กรอบนอก + การเลื่อนเป็นของ wrapper (.rw-tablewrap / .scroll) ไม่ใช่ของ <table> — แบบ 80-tables.css:45-50
    // `shell()` ห่อทุก <table> ที่ยังไม่อยู่ใน .scroll ให้เอง (QA #96 ข้อ 2 — หน้าเจาะลึกล้นแนวนอน)
    + 'table{border:0;font-size:var(--t-base);color:var(--c-text)}'
    + 'th,td{padding:var(--sp-2) var(--sp-3);border:0;border-bottom:1px solid var(--c-border);'
    + 'vertical-align:middle}'
    // nowrap ตาม 80-tables.css:24 · ใช้กับ th ทุกตัว ไม่ใช่แค่ thead th เพราะตารางหน้าเจาะลึก/ความพร้อม
    // ไม่มี <thead> (แถวหัวเป็น <tr><th> ตรง ๆ) — ทุกตารางอยู่ใน wrapper ที่เลื่อนได้แล้วจึงไม่ดันหน้าให้ล้น
    + 'th{font-size:var(--t-sm);font-weight:600;color:var(--c-text-muted);white-space:nowrap;'
    + 'background-color:var(--c-surface-3);letter-spacing:normal;text-transform:none}'
    + '.rw-tablewrap{overflow:auto;max-width:100%;border:1px solid var(--c-border);border-radius:var(--r-lg);'
    + 'background:var(--c-surface);margin:0 0 var(--sp-3)}'
    + '.rw-tablewrap>table{margin:0}'
    + '.rw-tablewrap tr:last-child>td,.scroll tbody tr:last-child>td{border-bottom:0}'
    // ตาราง kv ในการ์ด — การ์ดมีกรอบอยู่แล้ว wrapper ไม่วาดกรอบซ้ำ (QA #96 ข้อ 11 กรอบซ้อน)
    + '.card>.rw-tablewrap{border:0;border-radius:0;margin:0;background:none}'
    // ยกเว้นแถวรวม (.tot/.grand/.sub) — (0,1,3) ของ hover ชนะ (0,1,2) ของ tr.tot td แล้วสีแถวรวมจะหายตอนชี้
    + 'tbody tr:not(.tot):not(.grand):not(.sub):hover td{background-color:var(--c-surface-2)}'
    // ── การ์ดตัวเลข (60-view.css .kpi) — ความหมายอยู่ที่สีของค่า ไม่ใช่แถบซ้าย ──
    + '.kpi-grid{gap:var(--sp-3);grid-template-columns:repeat(auto-fit,minmax(190px,1fr));'
    + 'margin-bottom:var(--sp-6)}'
    // การ์ดตัวเลขหน้าภาพรวม 10 ใบ = สองแถว แถวละ 5 (#98) — บน: จำนวนใบ + ยอดเงิน · ล่าง: ใบที่มีปัญหา
    // auto-fit เหลือใบกำพร้า (9+1 ที่กรอบ 1810 · 4+4+2 ที่ 904) · เลือกด้วย ~ หลังฟอร์มภาพรวม เพราะ markup
    // `<div class="kpi-grid">` ถูกเทสอื่นอ้างตรงตัว · ≤640 สองคอลัมน์
    + '#wct-summary-form~.kpi-grid{grid-template-columns:repeat(5,minmax(0,1fr))}'
    + '.kpi-card{border:1px solid var(--c-border);border-radius:var(--r-lg);'
    + 'padding:var(--sp-3) var(--sp-4);gap:var(--sp-1)}'
    + '.kpi-card:hover{box-shadow:none}'
    // ถอดแถบสีซ้ายของ theme กลาง (.kpi-card.accent-* เป็น 2 คลาส ชนะ shorthand ข้างบน) — CCRC ไม่มีแถบนี้
    + '.kpi-card.accent-primary,.kpi-card.accent-success,.kpi-card.accent-info,'
    + '.kpi-card.accent-warning,.kpi-card.accent-error{border-left-color:var(--c-border)}'
    + '.kpi-label{font-size:var(--t-sm);font-weight:var(--w-regular);letter-spacing:normal;'
    + 'color:var(--c-text-muted);line-height:var(--lh-tight)}'
    // ป้าย/บรรทัดขยายตัดบรรทัดได้แบบ .kpi .k/.hint ของ CCRC — theme กลางตั้ง nowrap+ellipsis ไว้
    // (WOReportTheme.js ห้ามแก้) ข้อความยาวอย่าง "ผลต่าง summary cost" จึงถูกตัดเป็น … (QA #96 ข้อ 20)
    + '.kpi-label,.kpi-meta{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}'
    + '.kpi-value{font-family:var(--f-mono);font-size:var(--t-xl);font-weight:var(--w-bold);'
    + 'letter-spacing:normal;line-height:var(--lh-tight);font-variant-numeric:tabular-nums}'
    + '.kpi-card.accent-success .kpi-value{color:var(--c-success)}'
    + '.kpi-card.accent-warning .kpi-value{color:var(--c-warning)}'
    + '.kpi-card.accent-error .kpi-value{color:var(--c-danger)}'
    + '.kpi-card.accent-info .kpi-value{color:var(--c-info)}'
    // ── ปุ่มไอคอน i (10-shell.css:134-140 .iconbtn — 40×40 = --tap-min · สีหมึกเต็ม) ──
    + '.iconbtn{width:var(--tap-min);height:var(--tap-min);flex:none;'
    + 'display:inline-flex;align-items:center;justify-content:center;'
    + 'border:0;background:none;border-radius:var(--r-md);color:var(--c-text);text-decoration:none;cursor:pointer}'
    + '.iconbtn:hover{background-color:var(--c-surface-3);color:var(--c-text)}'
    + '.iconbtn svg{display:block}'
    // ── หัวหน้าในโหมด embed (ไม่มี topbar) — h1 + ปุ่ม i ชิดขวา ──
    + '.pagehead{display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-3)}'
    + '.pagehead h1{margin:0}'
    + '.pagehead .iconbtn{margin-left:auto}'
    // ชั้นภาพรวมใน embed ไม่มี h1 — ปุ่ม i ลอยมุมขวาบน "ในแถวเดียวกับ" กล่องตัวกรอง ไม่กินแถวเปล่าของตัวเอง
    // (QA #96 ข้อ 6) · กล่องตัวกรองเป็น BFC (overflow:hidden ที่ .filterbox) จึงหดหลบ float ไม่ลอดใต้ปุ่ม
    // QA รอบสอง: เปลี่ยนจาก float เป็น absolute มุมขวาบนของ .content — float ทำให้ฟอร์ม (flex = BFC)
    // หดหลบทั้งก้อน กล่องตัวกรองจึงไม่ชิดขอบขวาของกรอบ · แถวปุ่ม .act ที่อยู่แถวเดียวกันเว้นที่ให้แทน
    + '.pagehead.is-float{position:absolute;top:var(--sp-2);right:0;margin:0}';

  const REPORT_CSS = CCRC_CSS
    + 'body{padding:0}'
    + '.content{padding:var(--sp-6)}'
    // ── โหมด embed (CCRC ฝังใน .appframe — 72-appframe.css) ─────────────────────────────
    // กรอบของ CCRC เป็นพื้น --c-surface · เนื้อหาไม่เยื้องเข้าจากขอบซ้าย/ขวา ให้แนวตรงกับหัว .sec ของ
    // CCRC ที่อยู่เหนือกรอบ (QA #96 ข้อ 6 — เดิมเยื้อง 25px) · h1 ของหน้าย่อยเท่าหัว .sec (--t-md · ข้อ 7)
    + 'body.is-embed{background:var(--c-surface)}'
    // ระยะบนเหลือ --sp-2 (QA รอบสอง ข้อ A · ผู้ใช้ตัดสิน 2026-10-11) — CCRC เว้นจากหัว .sec ถึงกรอบ
    // .appframe ไว้แล้ว 36px (นอก iframe แก้จากที่นี่ไม่ได้) · เดิม 16px รวมเป็น 53px · 0 ไม่ได้เพราะ
    // ปุ่ม/ข้อความแถวแรกจะชนเส้นบนของกรอบเป็นเส้นคู่ · position:relative = ที่ยึดของปุ่ม i (.pagehead.is-float)
    + 'body.is-embed .content{padding:var(--sp-2) 0 var(--sp-6);position:relative}'
    + 'body.is-embed h1{font-size:var(--t-md)}'
    + '.sub{color:var(--c-text-muted);font-size:var(--t-sm);margin-bottom:var(--sp-3)}'
    + '.crumb{font-size:var(--t-sm);margin-bottom:var(--sp-3)}'
    + '.crumb a{display:inline-flex;align-items:center;gap:var(--sp-1);vertical-align:middle}'
    // ฟอร์มไม่มีการ์ด — วางบนพื้นหน้าแบบ .filterbar ของ CCRC (45-redwood.css:81 · ผู้ใช้ตัดสิน QA #96 ข้อ 18)
    + 'form{margin:0 0 var(--sp-3);padding:0}'
    // ── ระยะแนวตั้งเป็นระบบเดียวกับ CCRC (#98) — ภายในส่วน --sp-3 (12px) · ระหว่างส่วน --sp-6 (24px)
    // แบบ .sec→เนื้อหา 12 และ .kpis/.tieband 24 ของ 60-view.css · ฟอร์มภาพรวม (ส่วนตัวกรอง) ห่างส่วนผลลัพธ์ 24
    // เดิม ฟอร์ม→บรรทัดช่วงเวลา 16 · บรรทัด→การ์ด 12 · การ์ด→ตาราง 24 (วัดบน SB1 2026-10-11)
    // (กฎ margin ของฟอร์มภาพรวมอยู่ถัดจาก #wct-summary-form{display:flex} ด้านล่าง)
    // ── แถบตัวกรอง ────────────────────────────────────────────────────────────
    // ใช้คำศัพท์ .filterbar/.fld ชุดเดียวกับ wo-status (WOStatusTracking.js) โดยตั้งใจ —
    // ป้ายอยู่ "เหนือ" ตัวควบคุมเสมอ ไม่ใช่ข้อความไหลต่อกันคั่นด้วย &nbsp; แบบเดิม ซึ่งทำให้
    // อ่านไม่ออกว่าป้ายไหนเป็นของช่องไหนเมื่อบรรทัดตัดคำ
    // ต่างจากของ wo-status สองข้อ — ห้ามยกกฎของที่นั่นมาทับทั้งก้อน:
    //   1. ไม่มี padding/พื้น/เส้นขอบที่ .filterbar — ฟอร์มวางบนพื้นหน้าตรง ๆ แบบ CCRC
    //      (ชั้นภาพรวมห่อด้วยกล่องพับ .filterbox ซึ่งเป็นหน้าตา accordion อยู่แล้ว)
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
    // แถวปุ่มมีสองที่อยู่ ไม่ใช่ที่เดียว — ห้ามยุบสองกฎนี้เป็นกฎเดียว
    //   หน้าเจาะลึก/หน้าความพร้อม  .act เป็นลูกของ .filterbar → เรียงชิดขอบล่างไปกับช่องอื่น
    //   หน้าภาพรวม (#86)          .act เป็นลูกตรงของ form อยู่ **นอก** details.filterbox
    //                             เพื่อให้หุบกล่องตัวกรองแล้วปุ่มยังกดได้ · ระยะห่างจึงไม่ได้
    //                             มาจาก gap ของ .filterbar อีก ต้องมี margin-top ของตัวเอง
    + '.filterbar .act{display:flex;align-items:center;gap:var(--sp-2)}'
    // หน้าภาพรวม: แถวปุ่ม**ขึ้นไปอยู่เหนือ**กล่องตัวกรอง ชิดขวา (QA รอบสอง ข้อ B · ตำแหน่งเดียวกับปุ่ม
    // Apply ของ CCRC ที่อยู่ขวาสุดของแถวตัวกรอง) — ใน DOM ยังอยู่หลัง </details> เหมือนเดิม (หุบกล่อง
    // แล้วปุ่มยังกดได้ · ปุ่ม submit มาก่อน #btnXlsx) ย้ายด้วย `order:-1` ของฟอร์มที่เป็น flex คอลัมน์
    // เหตุผล: เอนจินคอมโบบ็อกซ์ (ล็อกกับ wo-status ห้ามแก้) และปฏิทินพลิกขึ้น/ย่อเมื่อปุ่มอยู่ "ใต้" ช่อง
    // (`avoid.top >= rect.bottom`) — แถวปุ่มเดิมอยู่ใต้ช่องแค่ 122px บน SB1 ทุก popup จึงพลิกขึ้นไปทับ
    // topbar หรือถูกบีบ · ปุ่มอยู่เหนือทุกช่องแล้ว popup ทุกตัวเปิดลงล่างเต็มความสูงแบบ CCRC และไม่ทับปุ่ม
    + '#wct-summary-form{display:flex;flex-direction:column}'
    // ส่วนตัวกรอง → ส่วนผลลัพธ์ = ระหว่างส่วน 24px (#98) · form#… ชนะ form{} ของทุกหน้า
    + 'form#wct-summary-form{margin-bottom:var(--sp-6)}'
    + 'form>.act{order:-1;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;'
    + 'gap:var(--sp-3);min-height:var(--tap-min);margin:0 0 var(--sp-3)}'
    // ข้อความจำนวนแถวอยู่ซ้ายของปุ่ม ปุ่มชิดขวาสุดแบบ Apply ของ CCRC
    + 'form>.act>.xnote{order:-1}'
    // embed: ปุ่ม i (.pagehead.is-float) อยู่มุมขวาบนแถวเดียวกัน — เว้นที่ให้ปุ่ม i ไม่ทับปุ่มของแถวนี้
    + 'body.is-embed form>.act{padding-right:calc(var(--tap-min) + var(--sp-2))}'
    // combobox ที่ client สร้างครอบ <select name=sub/loc> ตอน enhance ต้องกว้างเท่า .fld แม่
    // (ค่าตั้งต้นของมันคือ inline-block + min-width:170px จาก theme กลาง) — .fld สองช่องนั้น
    // จึงตั้ง flex:0 0 200px ไม่ให้หด ถ้าหดต่ำกว่า 170px ตัว input จะล้นกรอบของ .fld ออกมา
    + '.filterbar .rw-combobox{display:block;width:100%}'
    + '.filterbar .rw-combobox .rw-combobox-input{width:100%}'
    // ── ที่พับ "ตัวกรองเพิ่มเติม" ของชั้นภาพรวม (issue #86) ───────────
    // ตัวกรองรอง 5 ช่องเคยอยู่แถวเดียวกันกับแถวหลัก คั่นด้วย .brk — กินแนวตั้งไป 231px
    // ทั้งที่ส่วนใหญ่ไม่ได้ถูกตั้ง · สถานะกาง/พับมาจาก attribute `open` ที่เซิร์ฟเวอร์ใส่มา ไม่ใช่ JS
    // หน้าตาเป็น accordion ของ CCRC เหมือนหัวข้อพับทุกอันในรายงาน (กฎ details{}/summary{} รวมด้านล่าง ·
    // QA #96 ข้อ 8) · marker ของเบราว์เซอร์ถูกซ่อน ตัวบอกว่า "กดแล้วกาง" คือไอคอน svg ที่หมุน 90°
    // ซึ่ง markup ใส่ผ่าน `accSummary()` ทุกจุด — ห้ามเขียน <summary> เปล่าโดยไม่มีไอคอน
    + '.morefld{margin:var(--sp-3) var(--sp-4) 0}'
    + '.morefld>.filterbar{margin-top:var(--sp-3)}'
    // ── ทั้งกล่องตัวกรองของชั้นภาพรวมหุบได้ (issue #86) ───────────────────────
    // ห่อ **เฉพาะช่องกรอก** — `.act` อยู่นอกกล่อง หุบแล้วปุ่มต้องยังกดได้
    // overflow:hidden ทำให้กล่องเป็น BFC → หดหลบปุ่ม i ที่ลอยขวา (.pagehead.is-float) ในโหมด embed
    // (รายการ combobox และปฏิทินเป็น position:fixed จึงไม่ถูกตัด)
    + '.filterbox{margin:0;overflow:hidden}'
    + '.filterbox>summary{font-weight:var(--w-semibold)}'
    + '.filterbox>.filterbar{margin-top:var(--sp-3)}'
    // ── ช่องวันที่ (references/date-field.md) ─────────────────────────────────
    // กรอบทั้งก้อนอยู่ที่ .datewrap ใบเดียว (border + focus-ring) · input กับปุ่มข้างในไม่มี
    // กรอบของตัวเอง ปุ่มมีแค่เส้นคั่น border-left · ค่าที่มองเห็น = DATEFORMAT ของบัญชี
    // ค่าที่ส่ง/เก็บจริงยังเป็น ISO ใน URL และ SuiteQL
    + '.filterbar .datewrap{width:100%}'
    + '.datewrap{position:relative;display:flex;align-items:stretch;min-width:0;height:var(--btn-h);'
    + 'border:var(--bw-control) solid var(--c-border-control);border-radius:var(--r-md);'
    + 'background:var(--pj-surface);overflow:hidden;transition:box-shadow .1s ease}'
    + '.datewrap:focus-within{box-shadow:var(--focus-ring)}'
    + '.datewrap input[type=text]{flex:1 1 auto;min-width:0;height:auto;border:0;border-radius:0;'
    + 'background:transparent;box-shadow:none}'
    + '.datewrap input[type=text]:focus{outline:none;border-color:transparent;box-shadow:none}'
    + '.datebtn{position:relative;flex:0 0 28px;width:28px;padding:0;'
    + 'display:flex;align-items:center;justify-content:center;'
    + 'background:none;border:0;border-left:1px solid var(--pj-border-strong);border-radius:0;'
    + 'cursor:pointer;color:var(--pj-text-muted);transition:background-color .1s ease,color .1s ease}'
    // hover ของปุ่มไอคอนทั้งหมด = พื้น surface-3 หมึกเต็ม แบบ .iconbtn/.btn ของ CCRC (10-shell.css:140 · 90-forms.css:32)
    + '.datebtn:hover{background:var(--c-surface-3);color:var(--c-text)}'
    + '.datebtn:focus-visible{outline:2px solid var(--pj-primary) !important;outline-offset:-2px}'
    // overscroll-behavior:contain — ปฏิทินที่ถูกย่อมีแถบเลื่อนของตัวเอง ถ้าเลื่อนจนสุดขอบแล้ว
    // scroll chain ต่อไปที่หน้าเว็บ event จะมี target เป็น document ซึ่งตัวกันใน `_reposition`
    // มองไม่เห็น → `_position()` ล้าง max-height แล้ว scrollTop กลับเป็น 0 (รีวิว #86)
    + '.cal{position:fixed;z-index:40;width:238px;background:var(--pj-surface);'
    + 'overscroll-behavior:contain;'
    // กรอบแผงลอยแบบรายการ combobox / .popbody ของ CCRC (47-combobox.css:157 · 45-redwood.css:153) — เส้นอ่อน
    + 'border:1px solid var(--c-border);border-radius:var(--r-md);'
    + 'box-shadow:var(--sh-md);padding:var(--sp-2);font-size:var(--fs-sm)}'
    + '.cal[hidden]{display:none}'
    + '.cal-head{display:flex;align-items:center;gap:var(--sp-1);margin-bottom:var(--sp-1)}'
    + '.cal-nav{background:none;border:1px solid var(--pj-border);color:var(--pj-text-dim);'
    + 'width:24px;height:24px;flex:0 0 24px;padding:0;display:inline-flex;'
    + 'align-items:center;justify-content:center;border-radius:var(--radius-sm);cursor:pointer;'
    + 'transition:background-color .1s ease,color .1s ease}'
    + '.cal-nav:hover{background:var(--c-surface-3);color:var(--c-text)}'
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
    + '.cal-day:hover{background:var(--c-surface-3)}'
    + '.cal-day.muted{color:var(--pj-text-muted)}'
    + '.cal-day.today{box-shadow:inset 0 0 0 1px var(--pj-primary);font-weight:700}'
    + '.cal-day.sel{background:var(--pj-primary);color:var(--c-brand-on);font-weight:700}'
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
    // แถวย่อยราย batch ใต้แถว WO ของชั้นภาพรวม — ตัวเล็กลงและเยื้องให้เห็นว่าเป็นลูกของแถวบน
    + 'tr.brow td{font-size:var(--fs-sm)}'
    + 'tr.brow td.bk{padding-left:var(--sp-5)}'
    + '.card{background:var(--pj-surface);border:1px solid var(--pj-border);'
    + 'border-radius:var(--r-lg);padding:var(--sp-3);margin-bottom:var(--sp-3)}'
    + '.kv td:first-child{background:var(--pj-surface-alt);font-weight:600;width:150px}'
    // ── หัวข้อพับทุกอัน = accordion ของ CCRC (45-redwood.css:118-140 · QA #96 ข้อ 8) ──────────
    // กรอบ 6px อยู่ที่ตัว <details> · หัว (summary) ไม่มีพื้น/ขอบของตัวเอง สูงอย่างน้อย --tap-min ·
    // marker ของเบราว์เซอร์ซ่อน ใช้ไอคอน svg (.accico) ที่หมุน 90° ตอนกาง · ข้อความอยู่ใน .acclbl
    // (summary เป็น flex — ข้อความเปล่าที่ไม่ห่อจะแตกเป็น flex item ทีละท่อนแล้วช่องว่างหาย)
    + 'details{margin:0 0 var(--sp-3);border:1px solid var(--c-border);border-radius:var(--r-lg);'
    + 'background:var(--c-surface)}'
    + 'details[open]{padding-bottom:var(--sp-3)}'
    + 'details>summary{display:flex;align-items:center;gap:var(--sp-2);min-height:var(--tap-min);'
    + 'padding:0 var(--sp-4);cursor:pointer;list-style:none;font-size:var(--t-base);color:var(--c-text);'
    + 'background:none;border:0;border-radius:var(--r-lg)}'
    + 'details>summary::-webkit-details-marker{display:none}'
    + 'details>summary::marker{content:""}'
    + 'details>summary:hover{background-color:var(--c-surface-2)}'
    + 'details[open]>summary{border-bottom:1px solid var(--c-border);border-radius:var(--r-lg) var(--r-lg) 0 0}'
    + '.accico{display:inline-flex;flex:none;color:var(--c-text-muted);transition:transform .15s ease}'
    + 'details[open]>summary>.accico{transform:rotate(90deg)}'
    + '.acclbl{flex:1 1 auto;min-width:0;padding:var(--sp-2) 0}'
    + '.acclbl b{font-weight:var(--w-semibold)}'
    // เนื้อในของหัวข้อพับเว้นขอบเท่า padding ของหัว (.accbody ของ CCRC: 12px บน · 16px ข้าง)
    + 'details>summary+*{margin-top:var(--sp-3)}'
    + 'details>:not(summary){margin-left:var(--sp-4);margin-right:var(--sp-4)}'
    + 'details>.rw-tablewrap,details>.scroll{margin-left:var(--sp-4);margin-right:var(--sp-4)}'
    + '@media (prefers-reduced-motion: reduce){.accico{transition:none}}'
    // NetSuite ship CSS reset `:focus{outline:0}` มาด้วย (ท่าเดียวกับ .cal-nav/.cal-day ของ
    // wo-status ที่ #64 ขั้น 4 ปิดช่องว่างนี้ไว้แล้ว) — <summary> คือ element โฟกัสได้จริงของ
    // <details> ที่ไม่เคยมีการปิด outline มาก่อนเลยตกหล่นในสองขั้นก่อนหน้า
    + 'summary:focus-visible{outline:2px solid var(--pj-primary) !important;outline-offset:2px}'
    // .lvl2/.lvl3 (หน้าเจาะลึก) ไม่มีกฎหน้าตาแล้ว — แบนแบบ CCRC (QA รอบสอง ข้อ D) · เดิมเป็นแถบสีซ้าย 3px
    // + เยื้องซ้อน · ชั้นของข้อมูล BOM อ่านจากป้าย .tag "ชั้นที่ 2/3" ในหัว accordion แทน และเนื้อใน
    // <details> ยังเยื้อง --sp-4 ตามกฎ accordion ข้างบน · คงคลาสไว้เป็นตัวบอกโครงใน markup
    + '.bad{color:var(--pj-error);font-weight:700}'
    + '.warn{color:var(--pj-warning)}'
    + '.ok{color:var(--pj-success)}'
    // info = ข้อเท็จจริงที่ต้องรู้แต่ไม่ใช่ปัญหา เช่น สินค้าที่ตั้งค่าไว้ว่าไม่มีต้นทุนแปรสภาพ
    + '.info{color:var(--pj-text-muted)}'
    // .tag คือ .badge.info ของ template — คงชื่อคลาสเดิมไว้เพราะ markup ใช้อยู่ 19 จุด
    // หน้าตา = .badge.badge--info ของ CCRC (42-controls.css:15-28) — สูง 20px · padding 0 6px · inline-flex
    // (QA รอบสอง ข้อ C) · vertical-align:middle เพราะ inline-flex อยู่กลางบรรทัดข้อความ
    + '.tag{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;'
    + 'padding:0 6px;border-radius:var(--r-pill);background:var(--c-info-soft);color:var(--c-info);'
    + 'font-size:var(--t-xs);font-weight:var(--w-semibold);font-variant-numeric:tabular-nums;'
    + 'line-height:1;white-space:nowrap;vertical-align:middle;margin-left:var(--sp-1)}'
    // ป้ายชั้นข้อมูล BOM หน้าหัวพับของหน้าเจาะลึก (`lvlTag` · ข้อ D) — อยู่หน้าสุดของหัว ไม่ต้องเว้นซ้าย
    + '.lvltag{margin:0 var(--sp-2) 0 0}'
    // กล่องผิดพลาด = .alert.alert--danger ของ CCRC (44-feedback.css:192-212) — เส้นซ้ายหนา 3px สีอันตราย
    // พื้นอ่อน ข้อความสีหมึก (ไม่ใช่ตัวแดงทั้งก้อนในกรอบแดงรอบด้านแบบเดิม)
    + '.err{display:block;background:var(--c-danger-soft);border:1px solid var(--c-border);'
    + 'border-left:3px solid var(--c-danger);color:var(--c-text);padding:var(--sp-3) var(--sp-4);'
    + 'border-radius:var(--r-md);margin:0 0 var(--sp-3);font-size:var(--t-base)}'
    + '.err>b:first-child{color:var(--c-danger);font-weight:var(--w-semibold)}'
    + '.err pre{margin-top:var(--sp-2);color:var(--c-text-muted)}'
    + '.miss{color:var(--pj-warning)}'
    + '.note{font-size:var(--fs-xs);line-height:1.35}'
    // คอลัมน์หมายเหตุของตารางภาพรวมถูก table-layout:auto บีบเหลือ ~67px ที่จอ 1376 แถวจึงสูง 300px+ (QA รอบสาม)
    // · ตารางอยู่ใน .scroll ที่เลื่อนแนวนอนได้ ความกว้างขั้นต่ำจึงไม่ทำให้หน้าล้น
    + 'td.note{min-width:240px}'
    // ตัวชี้สถานะของแถวที่คอลัมน์แรก (#77 ข้อ 2.2) — คอลัมน์ "หมายเหตุ" อยู่ขวาสุดของตาราง
    // 16 คอลัมน์ ต้องเลื่อนจอไปสุดถึงจะรู้ว่าแถวไหนมีปัญหา · ตัวชี้นี้ย่อสถานะมาไว้ต้นแถว
    // ไม่ได้แทนคอลัมน์หมายเหตุ (ข้อความเต็มยังอยู่ที่เดิม และ export Excel ยังอ่านจากที่เดิม)
    + '.rowstat{display:flex;align-items:center;gap:3px;font-size:var(--fs-xs);'
    + 'line-height:1.35;margin-bottom:2px}'
    // ไอคอน 18px เท่าทุกไอคอนของหน้า (--icon · ผู้ใช้ตัดสิน 2026-10-11) — เดิมย่อเหลือ 12px
    // สารบัญของหน้าเจาะลึก (#77 ข้อ 2.4) — หน้ายาว 8 หัวข้อ ข้ามหัวข้อโดยไม่ต้องเลื่อนทั้งหน้า
    // ระยะบน scale (#98) — เดิม margin/padding 7px นอก scale · มุม --r-md แบบแผงอื่นของ CCRC
    + '.toc{display:flex;flex-wrap:wrap;gap:var(--sp-1) var(--sp-3);margin:0 0 var(--sp-3);'
    + 'padding:var(--sp-2) var(--sp-3);border:1px solid var(--pj-border);border-radius:var(--r-md);'
    + 'background:var(--pj-surface-alt);font-size:var(--fs-sm)}'
    + '.toc a{color:var(--pj-primary);text-decoration:none}'
    + '.toc a:hover{text-decoration:underline}'
    // ตารางภาพรวมกว้าง 15 คอลัมน์ และยาวได้ถึงหลักร้อยแถว — ให้เลื่อนในกรอบของตัวเองพร้อมหัวตารางติดบน
    // (layout-and-controls.md "ตารางกว้าง" ข้อ 2 — thead sticky ในกล่องที่ overflow:auto)
    + '.scroll{overflow:auto;max-height:76vh;border:1px solid var(--pj-border);'
    + 'border-radius:var(--r-lg);background:var(--pj-surface)}'
    + '.scroll table{margin:0;border:0}'
    // ตารางภาพรวม 15 คอลัมน์ใช้เมตริกของ .rw-table--compact (80-tables.css) — คลาสเดียวกับที่
    // CCRC มีไว้สำหรับตารางแน่น ไม่ใช่เมตริกที่ตั้งเอง
    + '.scroll th,.scroll td{padding:var(--sp-1) var(--sp-2);font-size:var(--t-sm)}'
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
    // embed (#98): CCRC ปรับกรอบสูงตามเนื้อหา แล้วบอกความสูงของพื้นที่บนจอผ่าน --host-h — 76vh ของ iframe ที่สูง
    // ตามเนื้อหาจะโตตามกรอบไม่รู้จบ · ไม่มีค่า (CCRC รุ่นก่อน กรอบสูงคงที่) = 100vh ของ iframe = 76vh เท่าเดิม
    + 'body.is-embed .scroll{max-height:calc(var(--host-h,100vh) * .76)}'
    // เลข WO = ลิงก์หลักไปหน้าเจาะลึก · ลิงก์ไป record ของ NetSuite แยกบรรทัดและทำให้จางลง
    // กันไม่ให้กดผิดปลายทาง (ของเดิมเป็นไอคอน ตัวเดียวติดท้ายเลขที่ตัดบรรทัด)
    + 'a.drill{font-weight:600;white-space:nowrap}'
    // .xbar ถูกถอดออกที่ #86 — ปุ่ม export ย้ายเข้าแถว .act ของฟอร์มแล้ว ไม่มีแถบลอยกลางหน้าอีก
    + '.xnote{font-size:var(--fs-xs);color:var(--pj-text-muted)}'
    + '.nsrec{margin-top:2px}'
    + '.nsrec a{font-size:10px;color:var(--pj-text-muted);text-decoration:none}'
    + '.nsrec a:hover{color:var(--pj-primary);text-decoration:underline}'
    // ไอคอนลิงก์นอก (#64 ขั้น 2) — 18px เท่าทุกไอคอน (เดิมย่อเหลือ 11px ตามตัวอักษร 10px ข้างเคียง)
    + '.nsrec a{display:inline-flex;align-items:center;gap:2px}'
    // ── ขนาดไอคอน: 18px ทุกตัว (--icon ของ CCRC 00-tokens.css:140 · 40-app.css:13) ─────────────
    // svg ใน theme กลาง/LOCAL_ICONS เขียน width/height เป็น attribute — CSS ชนะ attribute เสมอ
    // ยกเว้นลูกศรของ combobox ซึ่ง CCRC เองบีบไว้ 16px ในช่องของมัน (47-combobox.css:145-151)
    + '.topbar svg,.content svg,.cal svg{width:var(--icon);height:var(--icon);flex:none}'
    + '.content svg{vertical-align:-3px}'
    + '.rw-combobox .rw-combobox-chevron svg{width:16px;height:16px}'
    // ── focus ring แบบ CCRC (40-app.css:8) — วงหมึกเข้ม 2px + มุม --r-md แทน outline สีแบรนด์ ──
    // ต้องวางท้ายสุดและใช้ selector เดียวกับกฎเดิม (theme กลาง + ข้างบน) เพราะทุกกฎเป็น !important
    // (NetSuite ship `:focus{outline:0}` มา) — !important ที่ specificity เท่ากัน ตัวหลังชนะ
    + ':focus-visible,.btn:focus-visible,summary:focus-visible,.datebtn:focus-visible,'
    + '.cal-nav:focus-visible,.cal-day:focus-visible,.cal-today:focus-visible,.iconbtn:focus-visible{'
    + 'outline:none !important;box-shadow:var(--focus-ring) !important;border-radius:var(--r-md)}'
    // ช่องพิมพ์วันที่อยู่ใน .datewrap ที่วาดวง focus ให้ทั้งกรอบแล้ว (:focus-within) — วงของ input เอง
    // จะซ้อนและถูก overflow:hidden ตัดเหลือเส้นเข้มข้างปุ่มปฏิทิน
    + '.datewrap input[type=text]:focus-visible{box-shadow:none !important}'
    + '.rw-select:focus,.rw-select:focus-visible,'
    + '.rw-combobox .rw-combobox-input:focus,.rw-combobox .rw-combobox-input:focus-visible{'
    + 'box-shadow:var(--focus-ring) !important}'
    // ── embed: กล่องชั้นบนสุดไม่มีเส้นซ้าย/ขวาและมุมโค้ง (QA รอบสอง ข้อ A · ผู้ใช้ตัดสิน 2026-10-11) ──
    // เนื้อหาใน embed ชิดขอบ iframe ซ้ายขวาเพื่อให้แนวตรงกับหัว .sec ของ CCRC — กล่องที่กว้างเต็มแถวจึงวาด
    // เส้นข้างซ้อนกับเส้นของ .appframe เป็นเส้นคู่ · ตัดเฉพาะเส้นข้าง+มุม เส้นบน/ล่างยังแบ่งกล่องตามเดิม
    // ครอบทุกชนิดที่วางชั้นบนสุดได้ในสี่หน้า (ภาพรวม · เจาะลึก · ความพร้อม · คู่มือ) · กล่องที่ซ้อนอยู่ใน
    // กล่องอื่นไม่โดน (ไม่ได้ชิดกรอบ) · .err คงแถบสีซ้าย 3px ของ .alert ไว้ (ความหมาย ไม่ใช่เส้นกรอบ)
    + 'body.is-embed .content>details,body.is-embed .content>form>details,body.is-embed .content>.card,'
    + 'body.is-embed .content>.toc,body.is-embed .content>.rw-tablewrap,body.is-embed .content>.scroll{'
    + 'border-left-width:0;border-right-width:0;border-radius:0}'
    + 'body.is-embed .content>.err{border-right-width:0;border-radius:0}'
    + 'body.is-embed .content>details>summary,body.is-embed .content>form>details>summary{border-radius:0}'
    // ฟอร์มชั้นบนสุดของหน้าเจาะลึก/ความพร้อม (QA รอบสาม) — ช่องกรอกมีเส้นของตัวเองที่ตัดไม่ได้ ช่องแรกจึง
    // วาดเส้นซ้ายทับเส้น .appframe เป็นเส้นคู่ · เว้นใน --sp-2 เฉพาะฟอร์มเหล่านี้ (ฟอร์มภาพรวมอยู่ในกล่องพับแล้ว)
    + 'body.is-embed .content>form:not(#wct-summary-form){padding:0 var(--sp-2)}'
    // การ์ดตัวเลข (.kpi-grid auto-fit) — ใบไหนชิดขอบรู้ได้ตอน runtime เท่านั้น สคริปต์ embed ติดคลาส
    // is-edge-l/is-edge-r ให้ใบที่แตะขอบ iframe (`renderEmbedEdgeScript`) · ไม่มี JS = เส้นคงอยู่ ไม่พัง
    + 'body.is-embed .kpi-card.is-edge-l{border-left-width:0;border-top-left-radius:0;border-bottom-left-radius:0}'
    + 'body.is-embed .kpi-card.is-edge-r{border-right-width:0;border-top-right-radius:0;border-bottom-right-radius:0}'
    // ── วง focus ของหัวพับ = มุม --r-md เสมอ (QA รอบสอง ข้อ F) — `details[open]>summary` (0,1,2) และกฎ embed
    // ข้างบนชนะ `summary:focus-visible` (0,1,1) แล้ววงกลายเป็นมุม 6px/0 · !important แบบเดียวกับกฎ focus อื่น
    + 'details>summary:focus-visible,details[open]>summary:focus-visible{border-radius:var(--r-md) !important}'
    // ── จอแคบ ≤1023px (QA #96 ข้อ 3-4) — ต้องอยู่ท้ายสุดของ CSS เพื่อชนะกฎความสูง 32px ข้างบน ──
    // ใน CCRC ค่านี้วัดกับความกว้างของ iframe ไม่ใช่ของจอ — กรอบที่ฝังเรากว้าง ~847px ก็เข้าเงื่อนไขนี้
    //   ตัวควบคุมสูง --tap-min (90-forms.css:42-43 · 47-combobox.css:177-180)
    //   topbar 0 16px (10-shell.css:201) · เนื้อหา 16px (40-app.css:27-28) — embed ยังไม่เยื้องซ้ายขวา
    // `select:not([multiple])` — ช่องเลือกหลายคลังของชั้นความพร้อมต้องสูงตามจำนวนแถว ไม่ใช่ 40px
    + '@media (max-width:1023px){'
    // การ์ดตัวเลขขั้นต่ำ 150px ที่จอแคบ = .kpis ของ CCRC (60-view.css @media 1023)
    // (กริดภาพรวม 5 คอลัมน์ไม่ถูกกฎนี้ทับ — #wct-summary-form~.kpi-grid specificity สูงกว่า .kpi-grid)
    + '.kpi-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}'
    + '.topbar{padding:0 var(--sp-4)}'
    + '.content{padding:var(--sp-4)}'
    + 'body.is-embed .content{padding:var(--sp-2) 0 var(--sp-4)}'
    + '.btn,input[type=text],input[type=date],select:not([multiple]),.rw-select,'
    + '.rw-combobox .rw-combobox-input,.datewrap{height:var(--tap-min);min-height:var(--tap-min)}'
    + '.rw-combobox-option{min-height:var(--tap-min)}'
    // ช่องพิมพ์ใน .datewrap ยืดตามกรอบ (height:auto ข้างบน) — min-height 40px จะดันให้ล้นกรอบที่สูง 40px รวมเส้นขอบ
    + '.datewrap input[type=text]{min-height:0}'
    + '}'
    + '@media (max-width:640px){#wct-summary-form~.kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';

  const CSS = theme.css(REPORT_CSS);

  /**
   * แถบหัวเรื่องแบบ CCRC (10-shell.css .topbar) — `h1.viewtitle` ชื่อหน้า · ป้าย WO Cost Trace ·
   * ปุ่ม i ชิดขวา · โหมด embed ไม่ใส่ เพราะหน้าที่ฝังเราไว้มีหัวเรื่องของตัวเองแล้ว
   * ไม่ใช้ `theme.topbar()` เพราะมันวาด breadcrumb 12px แล้วหน้ายังต้องมี h1 อีกตัวใต้แถบ (QA #96 ข้อ 14)
   * @param {string} title
   * @param {Object} [helpParams] พารามิเตอร์ของหน้าสำหรับปุ่ม i — ไม่ส่ง = ไม่มีปุ่ม (หน้าคู่มือเอง)
   */
  function pageTop(title, helpParams) {
    if (EMBED) return '';
    return '<header class="topbar"><h1 class="viewtitle">' + esc(title) + '</h1>'
      + '<span class="engine-badge">WO Cost Trace</span>'
      + (helpParams ? '<div class="right">' + helpButton(helpParams) + '</div>' : '')
      + '</header>';
  }

  /**
   * ห่อทุก `<table>` ที่ยังไม่อยู่ใน `.scroll` ด้วย `.rw-tablewrap` (80-tables.css:45-50) — wrapper เป็น
   * เจ้าของกรอบและการเลื่อนแนวนอน ตารางกว้างจึงเลื่อนในกรอบของตัวเอง ไม่ดันทั้งหน้าให้ล้น
   * (QA #96 ข้อ 2: หน้าเจาะลึก scrollWidth 1067 > 847) · ทำที่ shell จุดเดียวเพราะตารางเปล่ามี ~20 จุด
   * ในสามไฟล์ ห่อทีละจุดแล้วจุดที่เพิ่มใหม่จะหลุด · ตารางในรายงานนี้ไม่มีตารางซ้อนตาราง
   */
  function wrapTables(html) {
    return String(html).replace(/(<div class="scroll">)?(<table\b[\s\S]*?<\/table>)/g,
      (all, scroll, tbl) => (scroll ? all : '<div class="rw-tablewrap">' + tbl + '</div>'));
  }

  /**
   * โครงหน้ามาตรฐาน — เอกสาร HTML เต็ม (doctype = standards mode · QA #96 ข้อ 0 เดิมไม่มีจึงเป็น
   * quirks mode) + style + แถบหัวเรื่อง + เนื้อหาใน .content · ต่อท้ายด้วยสคริปต์ปฏิทินของ date field
   * เสมอ (ทุกชั้นมีช่องวันที่) · โหมด embed ติดคลาส `is-embed` ที่ body
   * @param {string} title       ชื่อหน้า — ใช้ทั้ง <title> และ h1.viewtitle ของ topbar
   * @param {string} body
   * @param {string} [extraCss]  `<style>` เพิ่มของชั้นนั้น
   * @param {Object} [helpParams] พารามิเตอร์ของปุ่ม i ใน topbar (เปิดเดี่ยว) — ชุดเดียวกับที่ส่งให้ pageHead
   */
  function shell(title, body, extraCss, helpParams) {
    return '<!doctype html><html lang="th"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      // embed: บอก CCRC ว่าหน้านี้ให้กรอบสูงตามเนื้อหาได้ (ns-foodstar-9751184 50-appframes.js · #98)
      // — CCRC ตั้ง --host-h ให้ และซ่อน scrollbar ของ iframe เอง · หน้าที่ไม่มี meta นี้ CCRC คงกรอบสูงคงที่
      + (EMBED ? '<meta name="teibto-frame" content="autoheight">' : '')
      + '<title>' + esc(title) + '</title>'
      + CSS + (extraCss || '') + '</head>'
      + '<body' + (EMBED ? ' class="is-embed"' : '') + '>'
      + pageTop(title, helpParams) + '<div class="content">' + wrapTables(body) + '</div>'
      + renderDateFieldScript() + renderEmbedEdgeScript() + '</body></html>';
  }

  /**
   * โหมด embed: ติดคลาส `is-edge-l` / `is-edge-r` ให้การ์ดตัวเลข (.kpi-card) ที่แตะขอบซ้าย/ขวาของ iframe
   * (QA รอบสอง ข้อ A) — `.kpi-grid` เป็น auto-fit จำนวนคอลัมน์เปลี่ยนตามความกว้าง CSS ล้วนบอกไม่ได้ว่า
   * ใบไหนอยู่ริม · วัดเทียบ documentElement.clientWidth (ไม่ใช่ innerWidth ที่รวม scrollbar) ·
   * เปิดเดี่ยวคืนค่าว่าง (มี padding ข้าง การ์ดไม่ชิดขอบ)
   */
  function renderEmbedEdgeScript() {
    if (!EMBED) return '';
    return '<script>(function(){'
      + 'function mark(){var cw=document.documentElement.clientWidth;'
      + 'var cs=document.querySelectorAll(".kpi-card");'
      + 'for(var i=0;i<cs.length;i++){var r=cs[i].getBoundingClientRect();'
      + 'cs[i].classList.toggle("is-edge-l",r.width>0&&r.left<=1);'
      + 'cs[i].classList.toggle("is-edge-r",r.width>0&&r.right>=cw-1);}}'
      + 'mark();window.addEventListener("resize",mark);'
      + '})();</script>';
  }


  /** URL ของ Suitelet ตัวเอง — ใช้ทั้งลิงก์เจาะลึกและลิงก์กลับหน้าภาพรวม */
  function selfUrl(params) {
    const s = runtime.getCurrentScript();
    let q = '/app/site/hosting/scriptlet.nl?script=' + encodeURIComponent(s.id)
      + '&deploy=' + encodeURIComponent(s.deploymentId);
    // โหมด embed ต้องติดไปกับทุกลิงก์ภายใน (เจาะลึก · ความพร้อม · กลับภาพรวม) ไม่งั้นกดแล้ว
    // หลุดโหมด หน้าที่ฝังเราไว้จะได้หัวเรื่องซ้อนสองชั้น · วางที่จุดเดียวแทนการเติม embed
    // ใน filterParams เพราะ embed ไม่ใช่ตัวกรอง (ลิงก์ที่ไม่มีตัวกรองให้พา เช่นหน้าคู่มือจากหน้าที่เปิดตรง
    // ก็ยังต้องได้ embed) · ลิงก์ข้ามหน้าทุกตัว — รวมเจาะลึก↔ความพร้อม (QA รอบสอง ข้อ E) — พาตัวกรอง
    // ผ่าน filterParams ด้วย กด "กลับภาพรวม" จากหน้าไหนก็ได้รายการเดิม
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
      // issue #94 — RM Location / Production Line ต้องติดไปกับลิงก์เจาะลึก · ความพร้อม · กลับภาพรวม
      rmloc: k.rmloc, line: k.line,
      sort: k.sort, max: k.max ? String(k.max) : ''
    };
  }

  // ── หน้าคู่มือ (`&view=help`) — issue #96 ────────────────────────────────────────
  // "อ่านตารางนี้อย่างไร" และ "เอกสารอ้างอิงทางเทคนิค" (query log) ย้ายออกจากหน้ารายงาน
  // ไปหน้าแยกของ Suitelet เดิม · หน้ารายงานเหลือปุ่มไอคอน i ปุ่มเดียว
  // `view` เป็นชื่อพารามิเตอร์ใหม่ (ไม่ใช้ `mode` เพราะ `mode=json` มีความหมายอยู่แล้ว)
  const HELP_VIEW = 'help';

  // ไอคอนที่ WO Cost Trace ใช้คนเดียว (ปุ่ม i · ปุ่ม Export · ลิงก์ย้อนกลับ) อยู่ที่นี่ ไม่ใส่ใน
  // WOReportTheme.js เพราะไฟล์ theme บน File Cabinet ใช้ path เดียวกับ WO Status Tracking — งานของ
  // cost trace ต้องไม่แตะรายงานนั้น (คำสั่งผู้ใช้ 2026-10-10) · svg currentColor viewBox 16 วาดที่
  // 18px (--icon ของ CCRC · ผู้ใช้ตัดสิน 2026-10-11) — ไอคอนจาก theme.ICONS ที่ attribute ยังเป็น 16
  // ถูกขยายเป็น 18px ด้วย CSS (`.content svg` ใน REPORT_CSS)
  const LOCAL_ICONS = {
    info: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.4"/>'
      + '<path d="M8 7.2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
      + '<path d="M8 4.8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    download: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M8 2.5v7.6M4.8 7l3.2 3.2L11.2 7M3 13h10" stroke="currentColor" '
      + 'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // ลิงก์ "กลับ" — แทนตัวอักษร ← ที่เคยใช้เป็นไอคอน (QA #96 ข้อ 13)
    arrowLeft: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M13 8H3.5M7.5 4L3.5 8l4 4" stroke="currentColor" '
      + 'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // ตัวบอกกาง/พับของหัวข้อพับ (.accico หมุน 90° ตอน [open]) — ทรงเดียวกับ chevronRight ของ theme
    chevronRight: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M6 3.2L10.4 8 6 12.8" stroke="currentColor" stroke-width="1.5" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  const HELP_LABEL = 'คู่มือและเอกสารอ้างอิงทางเทคนิคของรายงานนี้';

  /**
   * ปุ่ม i ไปหน้าคู่มือ — พาพารามิเตอร์ของหน้าปัจจุบันไปครบ (ตัวกรอง/wo/ready) เพราะหน้าคู่มือ
   * ต้องรันชุดเดียวกันซ้ำถึงจะได้ query log ของจริง · embed=1 ติดไปเองผ่าน selfUrl
   * @param {Object} params พารามิเตอร์ของหน้าที่เปิดอยู่ (ไม่รวม script/deploy/embed)
   */
  function helpButton(params) {
    const href = selfUrl(Object.assign({}, params || {}, { view: HELP_VIEW }));
    return '<a class="iconbtn" href="' + esc(href) + '" title="' + esc(HELP_LABEL) + '"'
      + ' aria-label="' + esc(HELP_LABEL) + '">' + LOCAL_ICONS.info + '</a>';
  }

  /**
   * แถวหัวหน้าในโหมด embed — ชื่อชั้น (h1 ขนาด --t-md) + ปุ่ม i ชิดขวา
   * เปิดเดี่ยวคืนค่าว่าง: ชื่อหน้าและปุ่ม i อยู่ใน topbar ที่ `shell(title, body, css, helpParams)` วาด
   * (QA #96 ข้อ 14 — ไม่มี h1 ซ้ำใต้แถบ) · ผู้เรียกต้องส่ง helpParams ชุดเดียวกันให้ shell ด้วย
   * โหมด embed + `hideTitleInEmbed` (ชั้นภาพรวม: CCRC แสดงชื่อรายงานที่ viewbody เอง) ไม่มี h1 —
   * ปุ่ม i ลอยมุมขวาบนในแถวเดียวกับเนื้อหาแรก ไม่กินแถวเปล่าของตัวเอง (QA #96 ข้อ 6)
   */
  function pageHead(title, helpParams, hideTitleInEmbed) {
    if (!EMBED) return '';
    if (hideTitleInEmbed) return '<div class="pagehead is-float">' + helpButton(helpParams) + '</div>';
    return '<div class="pagehead"><h1>' + esc(title) + '</h1>' + helpButton(helpParams) + '</div>';
  }

  /**
   * หัวของหัวข้อพับ (`<summary>`) แบบ accordion ของ CCRC — ไอคอน svg ที่หมุนตอนกาง + ข้อความใน .acclbl
   * marker ของเบราว์เซอร์ถูกซ่อนด้วย CSS ทุก <summary> ในรายงานจึงต้องสร้างผ่านฟังก์ชันนี้
   * (test_help_page ข้อ 9 ตรวจว่าทุก summary ที่ render ออกมามีไอคอน)
   * @param {string} innerHtml ข้อความหัว — HTML ที่ escape แล้ว
   */
  function accSummary(innerHtml) {
    return '<summary><span class="accico">' + LOCAL_ICONS.chevronRight + '</span>'
      + '<span class="acclbl">' + innerHtml + '</span></summary>';
  }

  /** สรุป query ที่พัง — ขึ้นบนหน้ารายงานทันที ไม่ต้องเปิดหน้าคู่มือก่อน (ย้ายจาก entry ที่ #96) */
  function renderErrors() {
    const bad = QLOG.filter(q => !!q.error);
    if (!bad.length) return '';
    return '<div class="err"><b>ดึงข้อมูลไม่สำเร็จ ' + bad.length + ' ชุด — ตัวเลขบางส่วนอาจไม่ครบ</b><br>'
      + bad.map(q => esc(q.label) + ': ' + esc(q.error)).join('<br>') + '</div>';
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
  // ── ตำแหน่งของปฏิทิน — ต้องไม่บังปุ่มหลักของฟอร์ม (issue #86 · กฎเดียวกับ #77) ──────
  //
  // วัดจริงบน SB1 (script 1098 · viewport 1350x900 · &month=custom):
  //   .cal  t341 b597 l33 r271  ·  ปุ่ม "ดูภาพรวม" t379 b411 l33 r104
  //   elementsFromPoint() กึ่งกลางปุ่ม = DIV.cal-dow / DIV.cal-grid → กดปุ่มแล้วโดนช่องวัน
  // โผล่ขึ้นมาเมื่อ #86 ย้ายแถว ".act" ลงมาอยู่ใต้ที่พับ "ตัวกรองเพิ่มเติม" (เดิม ".act" อยู่
  // แถวบนสุด ปฏิทินที่กางลงจึงไม่เคยเจอปุ่ม)
  //
  // **นี่คือสำเนาที่สองของตรรกะเดียวกับคอมโบบ็อกซ์ ("_position(w)" ที่ WOCostTrace.js)**
  // ยกออกมาเป็นตัวช่วยตัวเดียวไม่ได้ เพราะเอนจินคอมโบบ็อกซ์ถูก byte-lock กับ wo-status ที่
  // test/test_listfield_sync.js (เทียบช่วง "function _sig(select) {" … "})();" ทีละตัวอักษร)
  // แก้ฝั่งนี้ = ต้องแก้ apps/wo-status/ ตามซึ่งเป็นงานของ session อื่น ·
  // ตัวกันดริฟต์จึงเป็นเทสต์: test_widthcalc.js รันทั้งสองสำเนาผ่านฉากเดียวกันแล้วยืนยัน
  // ว่าได้ "สัญญา" ข้อเดียวกัน (ไม่บังปุ่มเมื่อยังมีทางเลี่ยง · ไม่เหลือความสูง 0/ติดลบ ·
  // เรียกซ้ำไม่ย่อสะสม)
  //
  // ต่างจากคอมโบบ็อกซ์อยู่ข้อเดียวโดยตั้งใจ — **ปฏิทินเลือก "พลิกขึ้น" ก่อน "ย่อ"**
  // ตารางวันเป็นกริด 6 แถวตายตัว ย่อแล้วต้องเลื่อนในกรอบถึงจะกดวันท้ายเดือนได้ ซึ่งแย่กว่า
  // การพลิกขึ้นที่ยังเห็นทั้งเดือนในครั้งเดียว · คอมโบบ็อกซ์เป็นรายการแนวตั้งที่เลื่อนอยู่แล้ว
  // โดยธรรมชาติ การย่อจึงไม่เสียอะไร · ย่อยังทำอยู่ แต่เป็นทางเลือกรองไม่ใช่ทางแรก
  function _position() {
    if (!openCal) return;
    var box = openCal.box, anchor = openCal.anchor;
    if (!box || !anchor) return;
    var pad = 4;
    var vw = (document.documentElement && document.documentElement.clientWidth) || window.innerWidth || 0;
    var vh = window.innerHeight || 0;
    var rect = (anchor.getBoundingClientRect && anchor.getBoundingClientRect()) || { top: 0, bottom: 0, left: 0, right: 0 };
    // ล้างค่าที่รอบก่อนย่อไว้ **ก่อนวัด** — ไม่งั้นรอบนี้วัดความสูงที่ย่อแล้วย่อซ้ำลงไปเรื่อย ๆ
    if (box.style) { box.style.maxHeight = ''; box.style.overflowY = ''; }
    var br = (box.getBoundingClientRect && box.getBoundingClientRect()) || {};
    var width = br.width || 238, height = br.height || 280;
    var full = height;
    var left = rect.left;
    if (vw && left + width > vw - pad) left = vw - pad - width;
    if (left < pad) left = pad;

    // ปุ่มหลักของฟอร์มเดียวกัน · เอา ".act" ทั้งแถวก่อนตัวปุ่มเดี่ยว เพราะแถวนี้มีสองปุ่ม
    // (ดูภาพรวม + Export Excel) การหลบเฉพาะปุ่มแรกยังทิ้งปุ่มที่สองให้ถูกทับได้
    var avoid = openCal.avoid && openCal.avoid.getBoundingClientRect
      ? openCal.avoid.getBoundingClientRect() : null;
    // หลบ "ตัวปุ่มจริง" ในแถว ไม่ใช่กรอบของทั้งแถว (QA รอบสอง ข้อ B) — .act เป็น flex ระดับ block กว้าง
    // เต็มฟอร์ม กรอบแถวจึงคร่อมทุกช่องในแนวนอนเสมอแม้ปุ่มจะชิดขวา · ใช้กรอบรวมของปุ่มทุกตัว (export ด้วย)
    // แถวที่ไม่มีปุ่มให้วัด / ตัวจำลองในเทสที่มีแค่ getBoundingClientRect → ใช้กรอบของ element ตามเดิม
    var abtn = openCal.avoid && openCal.avoid.querySelectorAll
      ? openCal.avoid.querySelectorAll('button,.btn') : [];
    for (var ai = 0, au = null; ai < abtn.length; ai++) {
      var ar = abtn[ai].getBoundingClientRect();
      if (!ar || !(ar.width || ar.height)) continue;
      au = au ? { top: Math.min(au.top, ar.top), bottom: Math.max(au.bottom, ar.bottom),
        left: Math.min(au.left, ar.left), right: Math.max(au.right, ar.right) }
        : { top: ar.top, bottom: ar.bottom, left: ar.left, right: ar.right };
      avoid = au;
    }
    var hitsBtn = !!(avoid && avoid.top >= rect.bottom
      && !(avoid.right < left || avoid.left > left + width));

    var MIN_CAL = 180;   // ขั้นที่อยากได้ — เห็นหัวเดือน + แถววันโดยไม่ต้องเลื่อนมาก
    var MIN_TIGHT = 140; // ขั้นที่ยอมรับก่อนจะทับปุ่ม — ต้องเลื่อนแต่ยังกดปุ่มได้
    var roomDown = vh ? Math.max(0, vh - pad - (rect.bottom + pad)) : height;
    var roomUp = vh ? Math.max(0, rect.top - pad * 2) : height;
    var roomBtn = hitsBtn ? Math.max(0, avoid.top - pad - (rect.bottom + pad)) : roomDown;
    var downRoom = Math.min(roomDown, roomBtn);
    var need = Math.min(height, MIN_CAL);

    var flip, avail;
    if (downRoom >= height) { flip = false; avail = downRoom; }        // ลงได้ทั้งเดือน
    else if (roomUp >= height) { flip = true; avail = roomUp; }        // ขึ้นได้ทั้งเดือน (มาก่อนย่อ)
    else if (downRoom >= need) { flip = false; avail = downRoom; }     // ลงได้ถ้ายอมย่อ
    else if (roomUp >= need) { flip = true; avail = roomUp; }          // ขึ้นได้ถ้ายอมย่อ
    // ก่อนจะยอมทับปุ่ม ลองเพดานที่เตี้ยกว่าก่อน — หน้าความพร้อมวัดจริงได้ roomUp = 176px
    // ซึ่งขาด MIN_CAL ไป 4px แล้วตกมาทับปุ่ม submit ทั้งที่เป็นปุ่มเดียวของหน้า (วัดบน SB1)
    // ปฏิทินเตี้ยที่เลื่อนได้ ดีกว่าปุ่มที่กดไม่ได้ — overscroll-behavior:contain ทำให้เลื่อนในกรอบได้จริง
    else if (roomUp >= MIN_TIGHT) { flip = true; avail = roomUp; }     // เตี้ยแต่ไม่ทับปุ่ม
    else if (roomBtn >= MIN_TIGHT) { flip = false; avail = roomBtn; }  // ลงแบบเตี้ย แต่จบก่อนปุ่ม
    else if (roomDown >= need) { flip = false; avail = roomDown; }     // หมดทาง — ยอมทับปุ่ม ดีกว่ากดไม่ได้
    else if (roomUp >= roomDown) { flip = true; avail = roomUp; }      // แคบทั้งคู่ — เอาที่กว้างกว่า
    else { flip = false; avail = roomDown; }
    if (height > avail) height = avail;
    // ดันกลับขึ้นไป MIN_CAL ได้เฉพาะเท่าที่ avail ยอม — ไม่งั้นขั้น MIN_TIGHT
    // ที่เพิ่งเลือกมาจะถูกดันกลับไปทับปุ่มอีก (หน้าความพร้อม: avail 176 → จะกลายเป็น 180 แล้วทับ 4px)
    if (height < MIN_CAL) {
      var ceiling = avail > 0 ? avail : (vh ? Math.max(0, vh - pad * 2) : MIN_CAL);
      height = Math.min(MIN_CAL, ceiling);
    }
    if (!(height > 0)) height = MIN_CAL;   // กันค่า 0/ติดลบ/NaN ทุกทาง

    var top = flip ? (rect.top - pad - height) : (rect.bottom + pad);
    if (top < pad) top = pad;
    if (vh && top + height > vh - pad) {
      // จอเตี้ยกว่าปฏิทิน — ย่อให้อยู่ในจอ · ที่นี่ยอมต่ำกว่า MIN_CAL ได้ เพราะเป็นข้อจำกัด
      // ของ viewport เองไม่ใช่การยุบหลบปุ่ม
      var fit = vh - pad - top;
      if (fit > 0) height = fit;
    }

    box.style.position = 'fixed';
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    // ย่อเมื่อไหร่ต้อง **เลื่อนในกรอบได้** ไม่ใช่ตัดวันท้ายเดือนทิ้งเงียบ ๆ
    // ไม่ได้ย่อ = ไม่ตั้ง max-height เลย ปฏิทินสูงตามเนื้อหาเหมือนเดิม
    if (height < full) {
      box.style.maxHeight = height + 'px';
      box.style.overflowY = 'auto';
    }
    box.setAttribute('data-flip', flip ? 'up' : 'down');
  }
  // สคริปต์ผูก scroll แบบ capture (useCapture=true) โดยตั้งใจ — scroll ของ element ไม่ bubble
  // จึงต้องดักขาลงถึงจะรู้ว่ากรอบแม่ที่เลื่อนได้ถูกเลื่อน แล้วย้ายปฏิทินตาม
  //
  // กับดัก: ตั้งแต่ #86 ปฏิทินที่ถูกย่อมี overflow-y:auto ของตัวเอง — การเลื่อน "ในกรอบปฏิทิน"
  // ก็ยิง scroll ขาลงมาถึงที่นี่ด้วย และ _position() ล้าง maxHeight/overflowY ก่อนวัดทุกครั้ง
  // ซึ่งทำลายกล่องที่เลื่อนได้ → scrollTop กลับเป็น 0 ทุกครั้งที่หมุนล้อ = เลือกวันท้ายเดือน
  // ไม่ได้เลย ซึ่งเป็นสิ่งเดียวที่การย่อพยายามรักษาไว้ · กันเฉพาะ "scroll ที่เกิดในกล่องเราเอง"
  // ไม่ใช่ปิด capture ทิ้ง (ปิดแล้วกรอบแม่เลื่อนก็จะไม่ย้ายปฏิทินตาม ซึ่งแย่กว่า)
  function _reposition(e) {
    if (e && e.target && openCal && openCal.box && openCal.box.contains
      && openCal.box.contains(e.target)) return;
    _position();
  }
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
    // ปุ่มหลักของฟอร์มที่ปฏิทินต้องไม่บัง (#86) — selector เดียวกับที่คอมโบบ็อกซ์ใช้
    // ("_avoid" ใน WOCostTrace.js) แต่เอา ".act" ทั้งแถวก่อน เพราะแถวนี้มีสองปุ่ม
    var ownerForm = input.form || (input.closest ? input.closest('form') : null);
    var avoid = ownerForm && ownerForm.querySelector
      ? (ownerForm.querySelector('.act')
        || ownerForm.querySelector('button[type="submit"],.act button,#btnSearch'))
      : null;
    openCal = { input: input, btn: btn, box: box, anchor: anchor, avoid: avoid, y: view.y, m: view.m, focus: view };
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
    let h = '<details>' + accSummary('รายละเอียดทางเทคนิค — คำสั่งดึงข้อมูล ' + QLOG.length + ' ชุด');
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

  /** อยู่ในโหมดฝังหรือไม่ — ฟอร์มที่ submit แบบ GET ต้องพา embed=1 ไปเอง (selfUrl ครอบแค่ลิงก์) */
  function isEmbed() {
    return EMBED;
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
    ICONS: Object.assign({}, theme.ICONS, LOCAL_ICONS),
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
    isEmbed: isEmbed,
    selfUrl: selfUrl,
    filterParams: filterParams,
    // หน้าคู่มือ (#96)
    HELP_VIEW: HELP_VIEW,
    helpButton: helpButton,
    pageHead: pageHead,
    accSummary: accSummary,
    wrapTables: wrapTables,
    renderErrors: renderErrors,
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
