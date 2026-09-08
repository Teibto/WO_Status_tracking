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

  function tranLink(recordtype, id, label) {
    const base = REC_URL[asStr(recordtype).toLowerCase()];
    if (!id || !base) return esc(label);
    return '<a target="_blank" href="' + base + encodeURIComponent(id) + '">' + esc(label) + '</a>';
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
    // ตารางภาพรวมกว้าง 15 คอลัมน์ และยาวได้ถึงหลักร้อยแถว — ให้เลื่อนในกรอบของตัวเองพร้อมหัวตารางติดบน
    + '.scroll{overflow:auto;max-height:76vh;border:1px solid var(--pj-border);'
    + 'border-radius:var(--radius-md);background:var(--pj-surface)}'
    + '.scroll table{margin:0;border:0}'
    + '.scroll thead th{position:sticky;top:0;z-index:2;box-shadow:inset 0 -1px 0 var(--pj-border)}'
    // เลข WO = ลิงก์หลักไปหน้าเจาะลึก · ลิงก์ไป record ของ NetSuite แยกบรรทัดและทำให้จางลง
    // กันไม่ให้กดผิดปลายทาง (ของเดิมเป็นไอคอน ตัวเดียวติดท้ายเลขที่ตัดบรรทัด)
    + 'a.drill{font-weight:600;white-space:nowrap}'
    + '.xbar{display:flex;align-items:center;gap:var(--sp-3);margin:0 0 7px}'
    + '.xnote{font-size:var(--fs-xs);color:var(--pj-text-muted)}'
    + '.nsrec{margin-top:2px}'
    + '.nsrec a{font-size:10px;color:var(--pj-text-muted);text-decoration:none}'
    + '.nsrec a:hover{color:var(--pj-primary);text-decoration:underline}';

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

  /** โครงหน้ามาตรฐาน — style + แถบหัวเรื่อง + เนื้อหาใน .content ของ template */
  function shell(title, body, extraCss) {
    return CSS + (extraCss || '') + pageTop(title) + '<div class="content">' + body + '</div>';
  }


  /** URL ของ Suitelet ตัวเอง — ใช้ทั้งลิงก์เจาะลึกและลิงก์กลับหน้าภาพรวม */
  function selfUrl(params) {
    const s = runtime.getCurrentScript();
    let q = '/app/site/hosting/scriptlet.nl?script=' + encodeURIComponent(s.id)
      + '&deploy=' + encodeURIComponent(s.deploymentId);
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
  function qWO(woKey) {
    const byId = /^\d+$/.test(String(woKey).trim());
    return runSQL('WO header', `
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
      WHERE WO.recordtype = 'workorder' AND ${byId ? 'WO.id = ?' : 'UPPER(WO.tranid) = UPPER(?)'}
    `, [String(woKey).trim()]);
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
    renderQLog: renderQLog,
    kpi: kpi,
    KPI_ACCENT: KPI_ACCENT,
    // ตัวช่วยคำนวณที่ใช้ร่วมกัน
    todayIso: todayIso,
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
