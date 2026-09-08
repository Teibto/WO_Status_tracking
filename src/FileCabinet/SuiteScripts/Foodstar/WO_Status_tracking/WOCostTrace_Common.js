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
define(['N/query', 'N/log'], (query, log) => {

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
    uniq: uniq
  };
});
