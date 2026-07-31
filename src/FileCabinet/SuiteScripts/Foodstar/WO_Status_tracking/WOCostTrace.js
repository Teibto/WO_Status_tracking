/**
 * WOCostTrace.js
 * Suitelet — พิสูจน์ที่มาของตัวเลขต้นทุน Work Order 1 ใบ (สำหรับ UAT)
 *
 * ตอบคำถามเดียว: "ต้นทุนของใบสั่งผลิตนี้มาจากไหน และแต่ละตัวเลขอ้างอิงเอกสารใบไหน"
 * แทนงานเจาะมือที่เดิมต้องไล่เปิดเอกสารทีละใบ
 *
 * โครงรายงาน 3 ชั้น
 *   ชั้น 1  วัตถุดิบที่เบิกเข้า WO   — BOM มาตรฐาน เทียบ เบิกจริง + ต้นทุน/หน่วย + มูลค่า
 *   ชั้น 2  กึ่งสำเร็จรูปมาจากไหน    — ไล่ตาม lot → WOC ที่ผลิต → WO ต้นทาง → ใบเบิกของ WO นั้น
 *                                     (คู่กับวิธี BOM มาตรฐาน × average cost เพื่อ cross-check)
 *   ชั้น 3  average cost มาจากไหน   — ledger เข้า-ออกของวัตถุดิบ + ค่าเฉลี่ยเคลื่อนที่
 *
 * ─── ข้อเท็จจริงที่ verify กับบัญชี 9751184_SB1 แล้ว (WOFSC00000470, 2026-07-30) ────────
 *
 * 1) Foodstar เบิกวัตถุดิบเข้า WO ด้วย Inventory Adjustment เท่านั้น ไม่ใช้ Work Order Issue
 *    ผูก WO ที่ระดับบรรทัด: transactionline.custcol_mfg2_ref_workorder
 *
 * 2) SuiteQL ไม่มี transaction.createdfrom — ต้องอ่านจาก transactionline.createdfrom
 *    (บรรทัด mainline='T' ของ WOC ชี้กลับไปที่ WO)
 *
 * 3) ห้ามใช้ BUILTIN.DF() ในคำสั่งที่มี GROUP BY — SuiteQL ตอบ "Invalid or unsupported search"
 *    ให้ join ตารางแม่แล้วเลือกคอลัมน์จริงแทน
 *
 * 4) ตารางเชื่อม item → BOM ชื่อ assemblyitembom (ไม่ใช่ itembillofmaterials)
 *    และมี currentrevision ให้ใช้ตรง ๆ ไม่ต้องเดา revision ล่าสุด
 *
 * 5) average cost ของ NetSuite = ค่าเฉลี่ยเคลื่อนที่จาก ledger ทั้งเข้าและออก
 *    ไม่ใช่ค่าเฉลี่ยของใบรับเข้าอย่างเดียว ตัวอย่าง CMC 1800:
 *      IA +100 @98 → avg 98 · IA −12 → คงเหลือ 88 · GR +10,000 @104
 *      (88×98 + 10,000×104) / 10,088 = 103.94766051 = item.averagecost เป๊ะ
 *    ถ้าเฉลี่ยแค่ใบรับจะได้ 103.94059 ซึ่งผิด
 *
 * 6) บรรทัดที่ต้องตัดออกจาก ledger เพราะ qty เป็นบวกแต่ไม่ใช่ของรับเข้าจริง:
 *    transferorder / purchaseorder / purchaserequisition (ใบสั่ง ไม่ใช่ของ · rate 0)
 *    itemfulfillment / inventorystatuschange (amount เป็น null — มูลค่าอยู่ที่ itemreceipt คู่ของมัน)
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @author Jurapa
 * @since 2026-07-30
 */
define(['N/query', 'N/log', 'N/runtime'], (query, log, runtime) => {

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
   * เกณฑ์ว่า "ตรง" — ต้องสัมพันธ์กับขนาดของตัวเลข
   * ค่าคงที่ 0.005 บนต้นทุน 282 คือแทบไม่ต่าง แต่บนต้นทุน 0.046 คือ 11%
   * เกณฑ์ค่าคงที่เคยบัง Sweetener (63.5873 vs 63.5887) กับ Flavor (282.2143 vs 282.2167)
   * ไว้ว่า "ตรง" ทั้งที่ตอนนั้นบั๊ก mainline ยังทำให้ผิดอยู่
   */
  function closeEnough(a, b) {
    const d = Math.abs(a - b);
    return d <= Math.max(0.0001, Math.abs(b) * 1e-6);
  }

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

  // ═══ queries ═══════════════════════════════════════════════════════════════

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
             BUILTIN.DF(TL.units)                      AS unit_name
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
  function qIssues(woIds) {
    return runSQL('ใบเบิกวัตถุดิบเข้า WO', `
      SELECT TL.custcol_mfg2_ref_workorder              AS wo_id,
             T.id                                       AS tran_id,
             T.recordtype                               AS recordtype,
             T.tranid                                   AS doc_no,
             T.trandate                                 AS trandate,
             TO_CHAR(T.trandate, 'YYYY-MM-DD')          AS trandate_iso,
             TL.id                                      AS line_id,
             ADJT.name                                  AS adj_type,
             NVL(ADJT.custrecord_adjt_mfgsummarycost, 'F')     AS adj_summarycost,
             NVL(ADJT.custrecord_adjt_mfgrawmaterial, 'F')     AS adj_rawmaterial,
             NVL(ADJT.custrecord_adjt_mfgissuedsupplymat, 'F') AS adj_issuedsupply,
             TL.item                                    AS item_id,
             I.itemid                                   AS item_code,
             I.displayname                              AS item_name,
             I.itemtype                                 AS item_type,
             NVL(I.custitem_mfg_summarycostitem, 'F')   AS is_summary,
             TL.quantity                                AS quantity,
             BUILTIN.DF(TL.units)                       AS unit_name,
             TL.rate                                    AS rate,
             TL.foreignamount                           AS amount,
             BUILTIN.DF(TL.location)                    AS location_name,
             TL.custcol_mfg2_task_management            AS task_id,
             TL.custcol_mfg2_ref_workordercompletion    AS woc_id
      FROM transaction T
      JOIN transactionline TL ON TL.transaction = T.id
      LEFT JOIN item I ON I.id = TL.item
      LEFT JOIN customrecord_thl_adjustmenttype ADJT ON ADJT.id = T.custbody_thl_adjustmenttype
      WHERE T.recordtype = 'inventoryadjustment'
        AND TL.mainline = 'F' AND TL.iscogs = 'F' AND TL.taxline = 'F'
        AND TL.custcol_mfg2_ref_workorder IN (${inList(woIds)})
      ORDER BY TL.custcol_mfg2_ref_workorder, T.trandate, T.id, TL.id
    `);
  }

  /** WOC ของ WO — ปริมาณที่ผลิตได้จริง (ตัวหารของต้นทุนต่อหน่วย) */
  function qCompletions(woIds) {
    return runSQL('ใบปิดงานผลิต (WOC)', `
      SELECT TLM.createdfrom                       AS wo_id,
             WOC.id                                 AS woc_id,
             WOC.tranid                             AS woc_no,
             WOC.trandate                           AS woc_date,
             WOC.custbody_mfg_woc_good_qty          AS good_qty,
             WOC.custbody_mfg_woc_scrap_qty         AS scrap_qty,
             TLM.quantity                           AS fg_qty,
             TASK.name                              AS task_no,
             TASK.altname                           AS task_name,
             TASK.custrecord_mfg_tm_pro_qty         AS pro_qty
      FROM transaction WOC
      JOIN transactionline TLM ON TLM.transaction = WOC.id AND TLM.mainline = 'T'
      LEFT JOIN customrecord_mfg_task_management TASK ON TASK.id = WOC.custbody_mfg_task_mgn_ref
      WHERE WOC.recordtype = 'workordercompletion'
        AND TLM.createdfrom IN (${inList(woIds)})
      ORDER BY TLM.createdfrom, WOC.trandate, WOC.id
    `);
  }

  /**
   * ต้นทุนแปรสภาพที่ระบบปันส่วน แยกประเภทด้วย account.custrecord_mfg_acc_dl_oh
   * classification เป็น internal id ของบัญชีนี้ — sandbox กับ production ไม่เท่ากัน
   */
  function qCostAllocation(woIds) {
    return runSQL('เอกสารปันส่วนต้นทุน', `
      SELECT TL.custcol_mfg2_ref_workorder             AS wo_id,
             CA.id                                     AS ca_id,
             CA.tranid                                 AS ca_no,
             CA.trandate                               AS ca_date,
             TL.custcol_mfg2_ref_workordercompletion   AS woc_id,
             ACC.custrecord_mfg_acc_dl_oh              AS cost_class,
             ACC.acctnumber                            AS acct_no,
             ACC.fullname                              AS acct_name,
             SUM(TL.custcol_mfg2_standardcost)         AS std_cost,
             SUM(TL.custcol_mfg2_actualcost)           AS act_cost
      FROM transaction CA
      JOIN transactionline TL ON TL.transaction = CA.id
      JOIN transactionaccountingline TAL
        ON TAL.transaction = TL.transaction AND TAL.transactionline = TL.id
      JOIN account ACC ON ACC.id = TAL.account
      WHERE CA.recordtype = 'customtransaction_mfg2_woc_costallocatio'
        AND TL.custcol_mfg2_ref_workorder IN (${inList(woIds)})
      GROUP BY TL.custcol_mfg2_ref_workorder, CA.id, CA.tranid, CA.trandate,
               TL.custcol_mfg2_ref_workordercompletion,
               ACC.custrecord_mfg_acc_dl_oh, ACC.acctnumber, ACC.fullname
      ORDER BY TL.custcol_mfg2_ref_workorder, CA.tranid, ACC.custrecord_mfg_acc_dl_oh
    `);
  }

  /** lot ที่ถูกใช้จริงในแต่ละบรรทัดใบเบิก — จุดเริ่มของการไล่ย้อนขึ้นไปหา WO ต้นทาง */
  function qLotsOnLines(tranIds) {
    if (!tranIds.length) return [];
    return runSQL('lot ที่เบิก', `
      SELECT IA.transaction        AS tran_id,
             IA.transactionline    AS line_id,
             IA.quantity           AS assigned_qty,
             INV.id                AS lot_id,
             INV.inventorynumber   AS lot_no,
             INV.item              AS item_id
      FROM inventoryassignment IA
      JOIN inventorynumber INV ON INV.id = IA.inventorynumber
      WHERE IA.transaction IN (${inList(tranIds)})
      ORDER BY IA.transaction, IA.transactionline
    `);
  }

  /** ใครผลิต lot เหล่านี้ — WOC ที่รับ lot เข้าคลัง แล้วชี้กลับไปที่ WO ต้นทาง */
  function qLotProducers(lotIds) {
    if (!lotIds.length) return [];
    return runSQL('WO ต้นทางของ lot', `
      SELECT IA.inventorynumber    AS lot_id,
             T.id                  AS tran_id,
             T.recordtype          AS recordtype,
             T.tranid              AS doc_no,
             T.trandate            AS trandate,
             TO_CHAR(T.trandate, 'YYYY-MM-DD') AS trandate_iso,
             IA.quantity           AS assigned_qty,
             TLM.createdfrom       AS wo_id,
             WO.tranid             AS wo_no
      FROM inventoryassignment IA
      JOIN transaction T ON T.id = IA.transaction
      JOIN transactionline TLM ON TLM.transaction = T.id AND TLM.mainline = 'T'
      LEFT JOIN transaction WO ON WO.id = TLM.createdfrom
      WHERE IA.inventorynumber IN (${inList(lotIds)})
        AND IA.quantity > 0
        AND T.recordtype IN ('workordercompletion', 'assemblybuild')
      ORDER BY IA.inventorynumber, T.trandate
    `);
  }

  /** BOM มาตรฐาน — ใช้ cross-check ผลจากการไล่ lot (ควรได้ตัวเลขใกล้กัน) */
  function qBOM(itemIds) {
    if (!itemIds.length) return [];
    return runSQL('BOM มาตรฐาน', `
      SELECT AB.assembly                     AS parent_item,
             BR.id                           AS rev_id,
             BR.name                         AS rev_name,
             BR.custrecord_mfg_item_batch_qty AS batch_qty,
             BRC.item                        AS comp_item,
             CI.itemid                       AS comp_code,
             CI.displayname                  AS comp_name,
             BRC.bomquantity                 AS bom_qty,
             BRC.componentyield              AS comp_yield,
             BRC.units                       AS comp_unit_id,
             BUILTIN.DF(BRC.units)           AS comp_unit_name,
             BRC.itemsource                  AS item_source,
             CI.averagecost                  AS comp_avg_cost,
             CI.stockunit                    AS comp_stock_unit_id,
             BUILTIN.DF(CI.stockunit)        AS comp_stock_unit
      FROM assemblyitembom AB
      JOIN bomrevision BR ON BR.id = AB.currentrevision
      JOIN bomrevisioncomponent BRC ON BRC.bomrevision = BR.id
      JOIN item CI ON CI.id = BRC.item
      WHERE AB.assembly IN (${inList(itemIds)})
      ORDER BY AB.assembly, CI.itemid
    `);
  }

  /**
   * อัตราแปลงหน่วย — conversionrate คือจำนวนหน่วยฐานต่อ 1 หน่วยนั้น
   * เช่นกลุ่มน้ำหนักที่ฐานเป็น G: G = 1, KG = 1000
   * ต้องใช้เพราะ BOM ระบุเป็น G แต่ต้นทุนเก็บเป็น KG (พบจริง 3 รายการใน WOFSC00000470)
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

  function qItems(itemIds) {
    if (!itemIds.length) return [];
    return runSQL('ข้อมูลสินค้า + average cost', `
      SELECT I.id                     AS item_id,
             I.itemid                 AS item_code,
             I.displayname            AS item_name,
             I.itemtype               AS item_type,
             I.averagecost            AS avg_cost,
             I.lastpurchaseprice      AS last_price,
             I.custitem_item_basepercarton AS base_per_carton,
             BUILTIN.DF(I.stockunit)  AS stock_unit_name
      FROM item I
      WHERE I.id IN (${inList(itemIds)})
    `);
  }

  /**
   * ledger เข้า-ออกของสินค้า — ใช้พิสูจน์ average cost
   * ค่าเฉลี่ยเคลื่อนที่ = ผลรวมมูลค่า / ผลรวมปริมาณ (คิดเครื่องหมาย)
   */
  function qLedger(itemIds) {
    if (!itemIds.length) return [];
    return runSQL('ledger เข้า-ออก (ที่มา average cost)', `
      SELECT TL.item                  AS item_id,
             T.id                     AS tran_id,
             T.recordtype             AS recordtype,
             T.tranid                 AS doc_no,
             T.trandate               AS trandate,
             TO_CHAR(T.trandate, 'YYYY-MM-DD') AS trandate_iso,
             TL.id                    AS line_id,
             TL.mainline              AS mainline,
             NVL(TL.quantity, 0)      AS quantity,
             TL.rate                  AS rate,
             TL.foreignamount         AS foreign_amount,
             BUILTIN.DF(T.currency)   AS currency,
             T.exchangerate           AS exchange_rate,
             TAL.amount               AS amount,
             ACC.acctnumber           AS asset_acct_no,
             ACC.fullname             AS asset_acct_name,
             ADJT.name                AS adj_type,
             BUILTIN.DF(TL.units)     AS unit_name,
             BUILTIN.DF(TL.location)  AS location_name
      FROM transaction T
      JOIN transactionline TL ON TL.transaction = T.id
      JOIN item I ON I.id = TL.item
      LEFT JOIN customrecord_thl_adjustmenttype ADJT ON ADJT.id = T.custbody_thl_adjustmenttype
      JOIN transactionaccountingline TAL
        ON TAL.transaction = TL.transaction AND TAL.transactionline = TL.id
       AND TAL.posting = 'T' AND TAL.accountingbook = 1
      JOIN account ACC ON ACC.id = TAL.account AND ACC.id = I.assetaccount
      WHERE TL.item IN (${inList(itemIds)})
        AND TL.taxline = 'F'
        AND (NVL(TL.quantity, 0) <> 0 OR NVL(TAL.amount, 0) <> 0)
      ORDER BY TL.item, T.trandate, T.id, TL.id
    `);
  }

  /**
   * ตรวจสุขภาพ ledger — สรุป "ทุกบรรทัด" ที่แตะสินค้านี้ แยกตาม recordtype × mainline
   * โดยไม่ใช้เงื่อนไขที่ qLedger ใช้ เพื่อให้เห็นว่ามีอะไรที่ ledger ยังไม่นับ
   *
   * จุดประสงค์: เมื่อค่าเฉลี่ยที่คำนวณไม่ตรงกับ item.averagecost รายงานต้องชี้ได้ว่า
   * ขาดกลุ่มไหน ไม่ใช่บอกแค่ว่าไม่ตรง
   */
  function qLedgerAudit(itemIds) {
    if (!itemIds.length) return [];
    return runSQL('ตรวจสุขภาพ ledger', `
      SELECT TL.item        AS item_id,
             T.recordtype   AS recordtype,
             TL.mainline    AS mainline,
             CASE WHEN TAL.account IS NULL THEN 'N' ELSE 'Y' END AS posts_asset,
             COUNT(*)                     AS cnt_all,
             COUNT(*)                     AS cnt_ok,
             SUM(NVL(TL.quantity, 0))     AS qty_ok,
             SUM(NVL(TAL.amount, 0))      AS amt_ok,
             SUM(CASE WHEN TL.quantity IS NULL THEN 1 ELSE 0 END) AS cnt_no_qty,
             SUM(NVL(TL.foreignamount, 0)) AS famt
      FROM transaction T
      JOIN transactionline TL ON TL.transaction = T.id
      JOIN item I ON I.id = TL.item
      LEFT JOIN transactionaccountingline TAL
        ON TAL.transaction = TL.transaction AND TAL.transactionline = TL.id
       AND TAL.posting = 'T' AND TAL.accountingbook = 1
       AND TAL.account = I.assetaccount
      WHERE TL.item IN (${inList(itemIds)})
        AND TL.taxline = 'F'
      GROUP BY TL.item, T.recordtype, TL.mainline,
               CASE WHEN TAL.account IS NULL THEN 'N' ELSE 'Y' END
      ORDER BY TL.item, T.recordtype, TL.mainline
    `);
  }

  /**
   * เส้นที่สอง — มูลค่าสินค้าคงคลังจาก accounting line แยกตามบัญชี
   *
   * สำหรับของที่ผลิตเอง มูลค่าไม่ได้อยู่บนบรรทัด WOC ใบเดียว แต่ประกอบจากหลายเอกสาร
   * (WOC + IA ปรับ summary cost + เอกสารปันส่วนต้นทุน) ยอดที่ลง "บัญชีสินค้าคงคลัง"
   * จึงเป็นตัวตั้งที่ถูกต้องกว่าการรวม foreignamount ของบรรทัด
   */
  function qAssetLedger(itemIds) {
    if (!itemIds.length) return [];
    // รวมเฉพาะ amount — ห้ามรวม TL.quantity ที่นี่ เพราะ transactionaccountingline
    // มีหลายแถวต่อ 1 transactionline (asset / COGS / variance) ปริมาณจะถูกนับซ้ำ
    return runSQL('มูลค่าจากบัญชี (accounting line)', `
      SELECT TL.item        AS item_id,
             ACC.accttype   AS acct_type,
             ACC.acctnumber AS acct_no,
             ACC.fullname   AS acct_name,
             COUNT(*)       AS cnt,
             SUM(TAL.amount) AS sum_amount
      FROM transactionaccountingline TAL
      JOIN transactionline TL
        ON TL.transaction = TAL.transaction AND TL.id = TAL.transactionline
      JOIN account ACC ON ACC.id = TAL.account
      WHERE TL.item IN (${inList(itemIds)})
        AND TAL.posting = 'T' AND TAL.accountingbook = 1
        AND TL.taxline = 'F'
      GROUP BY TL.item, ACC.accttype, ACC.acctnumber, ACC.fullname
      ORDER BY TL.item, ACC.accttype, ACC.acctnumber
    `);
  }

  /**
   * กระทบยอดบัญชีงานระหว่างทำ (WIP) — จุดที่สมการต้นทุนต้องปิด
   *
   * กลไก summary cost item ของระบบนี้เดินสามจังหวะ:
   *   1. ใบเบิกวัตถุดิบ debit WIP · เอกสารปันส่วนต้นทุน debit WIP
   *   2. WOC มีบรรทัด summary cost item ที่ debit WIP แล้วบรรทัดสินค้า credit WIP ออกไปเป็น FG
   *   3. ใบปรับ summary cost (`custbody_mfg_adjsummarycost`) credit WIP ย้ายไปบัญชีพัก
   *
   * WIP จะปิดเป็นศูนย์ได้ต่อเมื่อ **มูลค่า summary cost item = วัตถุดิบ + ต้นทุนแปรสภาพ**
   * ถ้าไม่เท่า ส่วนต่างจะค้างเป็นยอดคงเหลือใน WIP ของใบสั่งผลิตนั้น
   *
   * บัญชี WIP ระบุด้วย account.custrecord_mfg_acc_dl_oh = 1 ไม่ hardcode เลขบัญชี
   */
  function qWipRecon(tranIds) {
    if (!tranIds.length) return [];
    return runSQL('กระทบยอด WIP', `
      SELECT T.id           AS tran_id,
             T.recordtype   AS recordtype,
             T.tranid       AS doc_no,
             T.trandate     AS trandate,
             ADJT.name      AS adj_type,
             NVL(ADJT.custrecord_adjt_mfgsummarycost, 'F') AS adj_summarycost,
             ACC.acctnumber AS acct_no,
             ACC.fullname   AS acct_name,
             SUM(NVL(TAL.debit, 0))  AS wip_debit,
             SUM(NVL(TAL.credit, 0)) AS wip_credit
      FROM transaction T
      JOIN transactionline TL ON TL.transaction = T.id
      LEFT JOIN customrecord_thl_adjustmenttype ADJT ON ADJT.id = T.custbody_thl_adjustmenttype
      JOIN transactionaccountingline TAL
        ON TAL.transaction = TL.transaction AND TAL.transactionline = TL.id
       AND TAL.posting = 'T' AND TAL.accountingbook = 1
      JOIN account ACC ON ACC.id = TAL.account
      WHERE T.id IN (${inList(tranIds)})
        AND ACC.custrecord_mfg_acc_dl_oh = 1
      GROUP BY T.id, T.recordtype, T.tranid, T.trandate, ADJT.name,
               ADJT.custrecord_adjt_mfgsummarycost, ACC.acctnumber, ACC.fullname
      ORDER BY T.trandate, T.id
    `);
  }

  /** เอกสารหนึ่งใบอ้างถึงกี่ใบสั่งผลิต — ใช้เตือนว่ายอด WIP ของใบนั้นรวม WO อื่นด้วย */
  function qDocWoRefs(tranIds) {
    if (!tranIds.length) return [];
    return runSQL('เอกสารอ้างถึง WO ใดบ้าง', `
      SELECT DISTINCT TL.transaction               AS tran_id,
                      TL.custcol_mfg2_ref_workorder AS wo_ref
      FROM transactionline TL
      WHERE TL.transaction IN (${inList(tranIds)})
        AND TL.custcol_mfg2_ref_workorder IS NOT NULL
    `);
  }

  // ═══ queries — ชั้นภาพรวม (หลายใบสั่งผลิตพร้อมกัน) ═════════════════════════
  //
  // ชั้นนี้ต้องได้ตัวเลขเท่ากับชั้นเจาะลึกทุกหลัก จึงคัดลอกเงื่อนไขจาก query ของชั้นเจาะลึกมาตรง ๆ
  // แล้วเปลี่ยนเป็น GROUP BY ระดับใบสั่งผลิต ไม่ใช่วนเรียก buildModel ทีละใบ
  // (SUM ของ SUM ต่อกลุ่มย่อย = SUM ทั้งก้อน จึงเท่ากันแม้ชั้นเจาะลึกจะ GROUP BY ละเอียดกว่า)
  //   rm_cost      ← qIssues        (SUM(ABS(TL.foreignamount)) ตัดบรรทัด summary cost ออก)
  //   dl_oh_cost   ← qCostAllocation (SUM(std_cost) ตัด class 1 = WIP ที่เป็นยอดรวมออก)
  //   woc_qty      ← qCompletions   (SUM บรรทัด mainline='T' ของ WOC)
  //
  // ⚠ rm_cost ต้องใช้ TL.foreignamount เหมือน qIssues — ห้ามเปลี่ยนไปใช้ TAL.amount
  //   เพราะยอด 347,651.01 ที่ verify ไว้มาจาก foreignamount ถ้าเปลี่ยนสองชั้นจะไม่ตรงกัน
  //   (การเปลี่ยนไป TAL.amount ทำที่ qLedger ซึ่งเป็นเรื่อง average cost คนละเรื่องกัน)

  /** ตัด id เป็นก้อน — กัน SQL ยาวเกินตอนกรองด้วย IN ของหลายร้อยใบ */
  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  /** รวมผลของ query ที่ต้องยิงหลายก้อน */
  function runChunked(ids, fn) {
    let rows = [];
    chunk(ids, 150).forEach(part => { rows = rows.concat(fn(part)); });
    return rows;
  }

  /**
   * รายการใบสั่งผลิตตามเงื่อนไข — 1 แถวต่อ 1 ใบ (บรรทัด mainline='T' คือของที่จะผลิต)
   *
   * ช่วงวันที่จับจาก **วันที่ใบปิดงานผลิต (WOC)** เป็นค่าเริ่มต้น ไม่ใช่วันที่ใบสั่งผลิต
   * เพราะต้นทุนเกิดตอนปิดงานผลิต ใบที่สั่งเดือนก่อนแต่ปิดเดือนนี้ต้องอยู่ในเดือนนี้
   * (เลือกจับจากวันที่ใบสั่งผลิตได้ที่ช่อง "ช่วงวันที่จับจาก")
   *
   * ⚠ เงื่อนไขเป็นแบบ "มีใบปิดงานผลิตในช่วง" แต่ยอดผลิตได้ยังนับ WOC **ทุกใบ** ของใบสั่งผลิตนั้น
   *   เพื่อให้ต้นทุน/หน่วยเท่ากับชั้นเจาะลึกเสมอ · ใบที่มี WOC คร่อมเดือนจะขึ้นหมายเหตุไว้
   *
   * เลขที่ใบสั่งผลิตข้ามช่วงวันที่ให้ (ตามแบบเดียวกับหน้า WO Status Tracking)
   * เพื่อให้ค้นใบเดียวได้โดยไม่ต้องรู้ว่าอยู่เดือนไหน
   */
  function qSummaryWOs(f) {
    const w = [`WO.recordtype = 'workorder'`, `TL.mainline = 'T'`, `TL.taxline = 'F'`];
    const p = [];
    if (f.wono) {
      w.push(`UPPER(WO.tranid) LIKE ?`);
      p.push('%' + f.wono.toUpperCase() + '%');
    } else if (f.basis === 'woc') {
      w.push(`EXISTS (
        SELECT 1
        FROM transaction WOCX
        JOIN transactionline TLX ON TLX.transaction = WOCX.id AND TLX.mainline = 'T'
        WHERE WOCX.recordtype = 'workordercompletion'
          AND TLX.createdfrom = WO.id
          AND WOCX.trandate >= TO_DATE(?, 'YYYY-MM-DD')
          AND WOCX.trandate <= TO_DATE(?, 'YYYY-MM-DD')
      )`);
      p.push(f.from, f.to);
    } else {
      w.push(`WO.trandate >= TO_DATE(?, 'YYYY-MM-DD')`);
      w.push(`WO.trandate <= TO_DATE(?, 'YYYY-MM-DD')`);
      p.push(f.from, f.to);
    }
    if (f.item) { w.push(`UPPER(I.itemid) LIKE ?`); p.push('%' + f.item.toUpperCase() + '%'); }
    // subsidiary / location เป็น NOT_EXPOSED บนหัวเอกสาร ต้องกรองที่บรรทัด
    if (f.sub) { w.push(`TL.subsidiary = ?`); p.push(f.sub); }
    if (f.loc) { w.push(`TL.location = ?`); p.push(f.loc); }

    return runSQL('ภาพรวม — รายการใบสั่งผลิต', `
      SELECT WO.id                                       AS wo_id,
             WO.tranid                                   AS wo_no,
             WO.trandate                                 AS wo_date,
             TO_CHAR(WO.trandate, 'YYYY-MM-DD')          AS wo_date_iso,
             -- ไม่ดึง BUILTIN.DF(WO.entitystatus) — คืนค่าว่างบนบัญชีนี้ (ทดสอบแล้วบน SB1)
             -- ไม่แสดงฟิลด์ที่รู้ว่าว่าง ดีกว่าโชว์ช่องเปล่าให้คนเดาว่าข้อมูลหาย
             BUILTIN.DF(WO.custbody_mfg_production_line) AS production_line,
             TL.item                                     AS item_id,
             I.itemid                                    AS item_code,
             I.displayname                               AS item_name,
             TL.quantity                                 AS wo_qty,
             BUILTIN.DF(TL.units)                        AS unit_name,
             I.custitem_item_basepercarton               AS base_per_carton
      FROM transaction WO
      JOIN transactionline TL ON TL.transaction = WO.id
      LEFT JOIN item I ON I.id = TL.item
      WHERE ${w.join(' AND ')}
      ORDER BY I.itemid, WO.trandate, WO.tranid
    `, p);
  }

  /**
   * ผลิตได้จริงต่อใบสั่งผลิต — ตัวหารของต้นทุนต่อหน่วย (เท่ากับ produced ในชั้นเจาะลึก)
   * นับ WOC ทุกใบของใบสั่งผลิตนั้นเสมอ ไม่ตัดตามช่วงวันที่ ไม่งั้นต้นทุน/หน่วยจะไม่ตรงกับชั้นเจาะลึก
   * แต่แยกนับใบที่อยู่ในช่วงไว้ด้วย เพื่อบอกได้ว่าใบไหนมีการปิดงานคร่อมเดือน
   */
  function qSummaryProduced(woIds, range) {
    if (!woIds.length) return [];
    const hasRange = !!(range && range.from && range.to);
    const inRangeCol = hasRange
      ? `COUNT(DISTINCT CASE WHEN WOC.trandate >= TO_DATE(?, 'YYYY-MM-DD')
                              AND WOC.trandate <= TO_DATE(?, 'YYYY-MM-DD')
                             THEN WOC.id END)`
      : 'COUNT(DISTINCT WOC.id)';
    return runChunked(woIds, part => runSQL('ภาพรวม — ผลิตได้จริง', `
      SELECT TLM.createdfrom                        AS wo_id,
             SUM(TLM.quantity)                      AS woc_qty,
             COUNT(DISTINCT WOC.id)                 AS woc_count,
             ${inRangeCol}                          AS woc_in_range,
             TO_CHAR(MAX(WOC.trandate), 'DD/MM/YYYY') AS woc_last,
             TO_CHAR(MAX(WOC.trandate), 'YYYY-MM-DD') AS woc_last_iso
      FROM transaction WOC
      JOIN transactionline TLM ON TLM.transaction = WOC.id AND TLM.mainline = 'T'
      WHERE WOC.recordtype = 'workordercompletion'
        AND TLM.createdfrom IN (${inList(part)})
      GROUP BY TLM.createdfrom
    `, hasRange ? [range.from, range.to] : []));
  }

  /**
   * วัตถุดิบและบรรจุภัณฑ์ต่อใบสั่งผลิต — เงื่อนไขเดียวกับ qIssues
   * ตัดบรรทัด summary cost ออกทั้งสองทาง (ประเภทเอกสาร และตัวสินค้า) เหมือน summariseWO
   */
  function qSummaryRM(woIds) {
    if (!woIds.length) return [];
    return runChunked(woIds, part => runSQL('ภาพรวม — วัตถุดิบและบรรจุภัณฑ์', `
      SELECT TL.custcol_mfg2_ref_workorder AS wo_id,
             SUM(ABS(NVL(TL.foreignamount, 0))) AS rm_cost,
             COUNT(DISTINCT T.id)              AS doc_count,
             COUNT(DISTINCT TL.item)           AS item_count
      FROM transaction T
      JOIN transactionline TL ON TL.transaction = T.id
      LEFT JOIN item I ON I.id = TL.item
      LEFT JOIN customrecord_thl_adjustmenttype ADJT ON ADJT.id = T.custbody_thl_adjustmenttype
      WHERE T.recordtype = 'inventoryadjustment'
        AND TL.mainline = 'F' AND TL.iscogs = 'F' AND TL.taxline = 'F'
        AND TL.custcol_mfg2_ref_workorder IN (${inList(part)})
        AND NVL(ADJT.custrecord_adjt_mfgsummarycost, 'F') = 'F'
        AND NVL(I.custitem_mfg_summarycostitem, 'F') = 'F'
      GROUP BY TL.custcol_mfg2_ref_workorder
    `));
  }

  /**
   * ยอดที่ Summary Cost Item ถูกตั้งไว้ต่อใบสั่งผลิต — ด้านตรงข้ามของ qSummaryRM
   * ใช้ตรวจกติกา 1 ใบสั่งผลิต = 1 ใบ MFG Summary Cost และหาผลต่างที่ค้างใน WIP
   */
  function qSummarySummaryCost(woIds) {
    if (!woIds.length) return [];
    return runChunked(woIds, part => runSQL('ภาพรวม — Summary Cost Item', `
      SELECT TL.custcol_mfg2_ref_workorder AS wo_id,
             SUM(ABS(NVL(TL.foreignamount, 0))) AS sc_value,
             COUNT(DISTINCT T.id)              AS sc_docs,
             -- แยกใบที่มีมูลค่าจริงออกจากใบเปล่า: SB1 มีใบ MFG Summary Cost มูลค่า 0 สร้างซ้ำอยู่จำนวนมาก
             -- (เจอจริง 25 จาก 197 ใบในเดือน 07/2026) ถ้านับรวมกันธงเตือนจะกลายเป็น noise
             COUNT(DISTINCT CASE WHEN NVL(TL.foreignamount, 0) <> 0 THEN T.id END) AS sc_docs_valued
      FROM transaction T
      JOIN transactionline TL ON TL.transaction = T.id
      LEFT JOIN item I ON I.id = TL.item
      LEFT JOIN customrecord_thl_adjustmenttype ADJT ON ADJT.id = T.custbody_thl_adjustmenttype
      WHERE T.recordtype = 'inventoryadjustment'
        AND TL.mainline = 'F' AND TL.iscogs = 'F' AND TL.taxline = 'F'
        AND TL.custcol_mfg2_ref_workorder IN (${inList(part)})
        AND (NVL(ADJT.custrecord_adjt_mfgsummarycost, 'F') = 'T'
             OR NVL(I.custitem_mfg_summarycostitem, 'F') = 'T')
      GROUP BY TL.custcol_mfg2_ref_workorder
    `));
  }

  /**
   * ต้นทุนแปรสภาพ (ค่าแรงตรง + โอเวอร์เฮด) ต่อใบสั่งผลิต — เงื่อนไขเดียวกับ qCostAllocation
   * ⚠ ต้องตัด class 1 (WIP) ออก เพราะเป็นยอดรวมไม่ใช่องค์ประกอบ ไม่ตัดคือบวกซ้ำทั้งก้อน
   * ใช้ standardcost ให้ตรงกับ convStd ที่ชั้นเจาะลึกใช้ประกอบต้นทุนรวม
   */
  function qSummaryConv(woIds) {
    if (!woIds.length) return [];
    return runChunked(woIds, part => runSQL('ภาพรวม — ต้นทุนแปรสภาพ', `
      SELECT TL.custcol_mfg2_ref_workorder          AS wo_id,
             SUM(TL.custcol_mfg2_standardcost)      AS dl_oh_std,
             SUM(TL.custcol_mfg2_actualcost)        AS dl_oh_act,
             COUNT(DISTINCT CA.id)                  AS ca_docs
      FROM transaction CA
      JOIN transactionline TL ON TL.transaction = CA.id
      JOIN transactionaccountingline TAL
        ON TAL.transaction = TL.transaction AND TAL.transactionline = TL.id
      JOIN account ACC ON ACC.id = TAL.account
      WHERE CA.recordtype = 'customtransaction_mfg2_woc_costallocatio'
        AND TL.custcol_mfg2_ref_workorder IN (${inList(part)})
        AND NVL(ACC.custrecord_mfg_acc_dl_oh, 0) <> 1
      GROUP BY TL.custcol_mfg2_ref_workorder
    `));
  }

  // ═══ model ═════════════════════════════════════════════════════════════════

  /**
   * ประกอบผลตรวจสุขภาพ ledger ต่อสินค้าหนึ่งตัว
   * คำนวณ what-if ให้ทุกกลุ่มที่ยังไม่ถูกนับ ว่าถ้านับเพิ่มแล้วค่าเฉลี่ยจะเป็นเท่าไหร่
   * กลุ่มที่ผลลัพธ์ตรงกับ item.averagecost = จุดที่ต้องแก้
   */
  function buildAudit(rows, ctx) {
    const byItem = groupBy(rows, 'item_id');
    const out = {};
    Object.keys(byItem).forEach(itemId => {
      const groups = byItem[itemId].map(g => ({
        recordtype: asStr(g.recordtype),
        mainline: asStr(g.mainline),
        cnt_all: asNum(g.cnt_all),
        cnt_ok: asNum(g.cnt_ok),
        qty_ok: asNum(g.qty_ok),
        amt_ok: asNum(g.amt_ok),
        cnt_no_qty: asNum(g.cnt_no_qty),
        famt: asNum(g.famt),
        posts_asset: asStr(g.posts_asset),
        // ledger นับตามการลงบัญชี ไม่ได้ hardcode recordtype — บรรทัดที่ลงบัญชีสินทรัพย์
        // ของสินค้านี้คือบรรทัดที่เปลี่ยนมูลค่าคงคลังจริง
        counted: asStr(g.posts_asset) === 'Y'
      }));

      let baseQty = 0, baseVal = 0;
      groups.forEach(g => { if (g.counted) { baseQty += g.qty_ok; baseVal += g.amt_ok; } });
      const stored = asNum((ctx.itemById[itemId] || {}).avg_cost);
      const baseAvg = baseQty !== 0 ? baseVal / baseQty : 0;

      // what-if ต่อกลุ่ม และรวมทุกกลุ่มที่ยังไม่ถูกนับ
      let addQty = 0, addVal = 0;
      groups.forEach(g => {
        if (g.counted) { g.whatif = null; return; }
        addQty += g.qty_ok; addVal += g.amt_ok;
        const q = baseQty + g.qty_ok;
        g.whatif = q !== 0 ? (baseVal + g.amt_ok) / q : 0;
        g.hits = closeEnough(g.whatif, stored) && g.cnt_ok > 0;
      });
      const allQty = baseQty + addQty;
      const allAvg = allQty !== 0 ? (baseVal + addVal) / allQty : 0;

      out[itemId] = {
        groups: groups.sort((a, b) => (a.counted === b.counted)
          ? (a.recordtype < b.recordtype ? -1 : 1) : (a.counted ? 1 : -1)),
        baseQty: baseQty, baseVal: baseVal, baseAvg: baseAvg,
        allQty: allQty, allVal: baseVal + addVal, allAvg: allAvg,
        allHits: closeEnough(allAvg, stored),
        stored: stored,
        reconciles: closeEnough(baseAvg, stored)
      };
    });
    return out;
  }

  /** ค่าเฉลี่ยเคลื่อนที่ — วิธีเดียวกับที่ NetSuite คิด average cost */
  function withRunningAvg(rows) {
    let q = 0, v = 0;
    return (rows || []).map(r => {
      q += asNum(r.quantity);
      v += asNum(r.amount);
      const out = {};
      Object.keys(r).forEach(k => { out[k] = r[k]; });
      out.run_qty = q;
      out.run_val = v;
      out.run_avg = q !== 0 ? v / q : 0;
      return out;
    });
  }

  /**
   * average cost ณ วันที่ที่ระบุ — ตัด ledger ที่วันนั้นแล้วอ่านค่าเฉลี่ยสะสมแถวสุดท้าย
   * ใช้ได้เพราะ ledger reproduce item.averagecost ได้ตรง จึงตัดกลางทางได้ด้วย
   * คืน null ถ้าไม่มีความเคลื่อนไหวก่อนวันนั้น (ยังไม่มีของ ยังไม่มีต้นทุน)
   */
  function avgAsOf(rows, isoDate) {
    if (!rows || !rows.length || !isoDate) return null;
    let last = null;
    for (let i = 0; i < rows.length; i++) {
      const d = asStr(rows[i].trandate_iso);
      if (d && d <= isoDate) last = rows[i]; else if (d) break;
    }
    return last ? { avg: asNum(last.run_avg), qty: asNum(last.run_qty), val: asNum(last.run_val),
                    doc: asStr(last.doc_no), date: asStr(last.trandate_iso) } : null;
  }

  /** วันสุดท้ายของเดือนก่อนวันที่ที่ให้มา (รูปแบบ YYYY-MM-DD) */
  function endOfPrevMonth(iso) {
    const mm = /^(\d{4})-(\d{2})/.exec(asStr(iso));
    if (!mm) return '';
    let y = Number(mm[1]), m = Number(mm[2]) - 1;
    if (m < 1) { m = 12; y -= 1; }
    const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
                 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + dim;
  }

  const CLASS_WIP = 1;

  const COST_CLASS = {
    1: 'งานระหว่างทำ (WIP)',
    2: 'โอเวอร์เฮดแผนก — คงที่', 3: 'โอเวอร์เฮดแผนก — ผันแปร', 4: 'โอเวอร์เฮดสถานที่',
    5: 'โอเวอร์เฮดเครื่องจักร — คงที่', 6: 'โอเวอร์เฮดเครื่องจักร — ผันแปร',
    7: 'ค่าแรงตรง', 8: 'โอเวอร์เฮดทางอ้อม', 9: 'จ้างผลิตภายนอก', 10: 'ของเสีย'
  };

  /**
   * สรุปหนึ่ง WO ให้อยู่ในรูปเดียวกันทุกชั้น เพื่อใช้ซ้ำได้ทั้ง WO แม่และ WO ต้นทางของ semi
   * ปริมาณและมูลค่าที่เบิกเก็บเป็นค่าลบใน NetSuite — แปลงเป็นค่าบวกเพื่ออ่านง่าย
   */
  function summariseWO(woId, ctx) {
    // แยกเอกสารสองบทบาทออกจากกัน
    //   summary cost = ใบที่ประเภทเป็น MFG Summary Cost (custrecord_adjt_mfgsummarycost='T')
    //                  หรือบรรทัดที่เป็น summary cost item (custitem_mfg_summarycostitem='T')
    //   ที่เหลือ = การเบิกวัตถุดิบเข้าผลิตจริง
    const allIssues = ctx.issuesByWO[woId] || [];
    const isSummary = r => asStr(r.adj_summarycost) === 'T' || asStr(r.is_summary) === 'T';
    const issues = allIssues.filter(r => !isSummary(r));
    const summaryLines = allIssues.filter(isSummary);
    // กติกาของระบบ: 1 ใบสั่งผลิตต้องมีใบ MFG Summary Cost เพียงใบเดียว
    const summaryDocs = uniq(summaryLines.map(r => r.tran_id));
    const lines = ctx.woLinesByWO[woId] || [];
    const fg = lines.filter(r => asStr(r.mainline) === 'T')[0] || null;
    const bomStd = {};
    // summary cost item เป็นตัวเก็บยอดต้นทุน ไม่ใช่วัตถุดิบ — ตัดออกทั้งฝั่ง BOM และฝั่งใบเบิก
    lines.filter(r => asStr(r.mainline) === 'F' && asNum(r.quantity) !== 0
      && asStr(r.is_summary) !== 'T').forEach(r => {
      const k = asStr(r.item_id);
      if (!bomStd[k]) bomStd[k] = { qty: 0, unit: asStr(r.unit_name) };
      bomStd[k].qty += Math.abs(asNum(r.quantity));
    });

    const byItem = groupBy(issues, 'item_id');
    const keys = uniq(Object.keys(byItem).concat(Object.keys(bomStd)));

    const rows = keys.map(k => {
      const iss = byItem[k] || [];
      const std = bomStd[k] || { qty: 0, unit: '' };
      const ref = iss[0] || {};
      let q = 0, a = 0;
      iss.forEach(r => { q += Math.abs(asNum(r.quantity)); a += Math.abs(asNum(r.amount)); });
      const lots = [];
      let issueDate = '';
      iss.forEach(r => {
        (ctx.lotsByLine[asStr(r.tran_id) + ':' + asStr(r.line_id)] || []).forEach(l => lots.push(l));
        const d = asStr(r.trandate_iso);
        if (d && (!issueDate || d > issueDate)) issueDate = d; // ใบเบิกล่าสุด = เพดานของวันที่ที่เป็นต้นทางได้
      });
      return {
        item_id: k,
        issue_date: issueDate,
        item_code: asStr(ref.item_code) || asStr((ctx.itemById[k] || {}).item_code),
        item_name: asStr(ref.item_name) || asStr((ctx.itemById[k] || {}).item_name),
        unit: asStr(ref.unit_name) || std.unit,
        std_qty: std.qty,
        act_qty: q,
        act_amount: a,
        unit_cost: q !== 0 ? a / q : 0,
        qty_diff: q - std.qty,
        docs: iss,
        lots: lots
      };
    }).sort((x, y) => x.item_code < y.item_code ? -1 : 1);

    let rmTotal = 0;
    rows.forEach(r => { rmTotal += r.act_amount; });

    // ปริมาณที่ผลิตได้ = ผลรวมบรรทัดสินค้าของ WOC ทุกใบของ WO นี้
    const wocs = ctx.wocByWO[woId] || [];
    let produced = 0;
    wocs.forEach(w => { produced += asNum(w.fg_qty); });

    // ต้นทุนแปรสภาพ: WIP (class 1) คือยอดรวมที่ระบบโอนเข้างานระหว่างทำ
    const ca = ctx.caByWO[woId] || [];
    let convStd = 0, convAct = 0;
    ca.forEach(r => {
      if (asNum(r.cost_class) === CLASS_WIP) return; // เป็นยอดรวม ไม่ใช่องค์ประกอบ
      convStd += asNum(r.std_cost);
      convAct += asNum(r.act_cost);
    });

    return {
      wo_id: woId,
      wo: ctx.woById[woId] || {},
      fg: fg,
      rows: rows,
      rmTotal: rmTotal,
      produced: produced,
      wocs: wocs,
      ca: ca,
      convStd: convStd,
      convAct: convAct,
      summaryLines: summaryLines,
      summaryDocs: summaryDocs,
      issueDocs: uniq(issues.map(r => r.tran_id)),
      unitCostRM: produced !== 0 ? rmTotal / produced : 0,
      unitCostFull: produced !== 0 ? (rmTotal + convStd) / produced : 0
    };
  }

  function buildModel(woKey, asOfParam) {
    const m = { woKey: woKey, ok: false };

    const woRows = qWO(woKey);
    if (!woRows.length) { m.notFound = true; return m; }
    const rootId = asStr(woRows[0].wo_id);

    // ─── รอบที่ 1: WO แม่ ─────────────────────────────────────────────────
    const ctx = { woById: {}, woLinesByWO: {}, issuesByWO: {}, wocByWO: {}, caByWO: {}, lotsByLine: {}, itemById: {} };
    ctx.woById[rootId] = woRows[0];

    let woIds = [rootId];
    let issues = qIssues(woIds);
    let lines = qWOLines(woIds);
    let wocs = qCompletions(woIds);
    let cas = qCostAllocation(woIds);

    // lot บนบรรทัดใบเบิกของ WO แม่ — ใช้หา WO ต้นทางของกึ่งสำเร็จรูป
    let lots = qLotsOnLines(uniq(issues.map(r => r.tran_id)));
    const lotIds = uniq(issues.map(r => asStr(r.tran_id) + ':' + asStr(r.line_id)).length
      ? lots.filter(l => {
        // เก็บเฉพาะ lot ที่อยู่บนบรรทัดของ WO ที่กำลังดู
        return issues.some(r => asStr(r.tran_id) === asStr(l.tran_id) && asStr(r.line_id) === asStr(l.line_id));
      }).map(l => l.lot_id) : []);

    const producers = qLotProducers(lotIds);
    const producersByLot = groupBy(producers, 'lot_id');

    // ─── รอบที่ 2: WO ต้นทางของกึ่งสำเร็จรูป (loop ชั้นถัดไป) ─────────────
    const parentWOIds = uniq(producers.map(p => p.wo_id).filter(id => asStr(id) && asStr(id) !== rootId));
    if (parentWOIds.length) {
      const extraWO = runSQL('WO ต้นทาง (header)', `
        SELECT WO.id AS wo_id, WO.tranid AS wo_no, WO.trandate AS wo_date,
               BUILTIN.DF(WO.entitystatus) AS wo_status,
               BUILTIN.DF(WO.subsidiary) AS subsidiary,
               BUILTIN.DF(WO.custbody_mfg_work_order_type) AS wo_type,
               BUILTIN.DF(WO.custbody_mfg_production_line) AS production_line
        FROM transaction WO WHERE WO.id IN (${inList(parentWOIds)})
      `);
      extraWO.forEach(r => { ctx.woById[asStr(r.wo_id)] = r; });

      woIds = woIds.concat(parentWOIds);
      issues = issues.concat(qIssues(parentWOIds));
      lines = lines.concat(qWOLines(parentWOIds));
      wocs = wocs.concat(qCompletions(parentWOIds));
      cas = cas.concat(qCostAllocation(parentWOIds));
      lots = lots.concat(qLotsOnLines(uniq(qIssuesTranIds(issues, parentWOIds))));
    }

    ctx.issuesByWO = groupBy(issues, 'wo_id');
    ctx.woLinesByWO = groupBy(lines, 'wo_id');
    ctx.wocByWO = groupBy(wocs, 'wo_id');
    ctx.caByWO = groupBy(cas, 'wo_id');
    lots.forEach(l => {
      const k = asStr(l.tran_id) + ':' + asStr(l.line_id);
      if (!ctx.lotsByLine[k]) ctx.lotsByLine[k] = [];
      ctx.lotsByLine[k].push(l);
    });

    // ─── ข้อมูลสินค้า + BOM + ledger ─────────────────────────────────────
    const allItemIds = uniq(issues.map(r => r.item_id).concat(lines.map(r => r.item_id)));

    const bomRows = qBOM(allItemIds);
    ctx.bomByParent = groupBy(bomRows, 'parent_item');
    ctx.uomById = {};
    qUOM().forEach(u => { ctx.uomById[asStr(u.uom_id)] = u; });

    // ต้องรวม component ใน BOM ด้วย ไม่งั้น item ที่โผล่จาก BOM เท่านั้นจะไม่มี average cost
    // ให้เทียบ แล้วรายงานจะฟ้องว่า "ไม่ตรง" ทั้งที่จริงคือไม่มีข้อมูลมาเทียบ
    qItems(uniq(allItemIds.concat(bomRows.map(r => r.comp_item))))
      .forEach(r => { ctx.itemById[asStr(r.item_id)] = r; });

    // ledger ดึงให้ทั้งวัตถุดิบใน WO ต้นทาง และ component ใน BOM
    const ledgerIds = uniq(
      issues.filter(r => asStr(r.is_summary) !== 'T').map(r => r.item_id)
        .concat(bomRows.map(r => r.comp_item))
    );
    const ledger = qLedger(ledgerIds);
    const ledgerByItem = groupBy(ledger, 'item_id');
    ctx.ledgerByItem = {};
    Object.keys(ledgerByItem).forEach(k => { ctx.ledgerByItem[k] = withRunningAvg(ledgerByItem[k]); });

    ctx.auditByItem = buildAudit(qLedgerAudit(ledgerIds), ctx);
    ctx.assetByItem = groupBy(qAssetLedger(ledgerIds), 'item_id');
    // เติมผลของเส้นบัญชีเข้าไปในผลตรวจ เพื่อให้ตารางเดียวเทียบได้ทั้งสองเส้น
    Object.keys(ctx.auditByItem).forEach(id => {
      const a = ctx.auditByItem[id];
      // averagecost = มูลค่าคงคลัง ÷ ปริมาณคงเหลือ
      // เมื่อรู้มูลค่าจากบัญชีและรู้ averagecost ก็ย้อนหาปริมาณคงเหลือที่ระบบใช้เป็นตัวหารได้
      // เทียบกับปริมาณที่ ledger นับได้ → ได้ตัวเลขตรง ๆ ว่า "ขาดปริมาณอีกเท่าไหร่"
      a.asset = (ctx.assetByItem[id] || []).map(r => {
        const v = asNum(r.sum_amount);
        const implied = a.stored !== 0 ? v / a.stored : 0;
        return {
          acct_type: asStr(r.acct_type), acct_no: asStr(r.acct_no), acct_name: asStr(r.acct_name),
          cnt: asNum(r.cnt), val: v,
          implied_qty: implied,
          // ปริมาณคงเหลือต้องเป็นบวกและลงตัวพอสมควร จึงถือว่าเป็นบัญชีคงคลังที่ใช้เป็นตัวตั้งได้
          plausible: implied > 0 && Math.abs(implied - Math.round(implied * 1000) / 1000) < 1e-6
        };
      }).sort((x, y) => y.cnt - x.cnt);
      a.assetHit = a.asset.filter(x => x.plausible)[0] || null;
      a.qtyGap = a.assetHit ? a.assetHit.implied_qty - a.baseQty : null;

      // แยกให้ออกว่าเป็น "ไม่ได้นับ" หรือ "นับแล้วแต่เครื่องหมายกลับ"
      // ขาด = 1 เท่าของปริมาณกลุ่มนั้น → ไม่ได้นับ · ขาด = 2 เท่า → นับด้วยเครื่องหมายผิด
      a.diagnosis = null;
      if (a.qtyGap != null && Math.abs(a.qtyGap) > 1e-6) {
        a.groups.forEach(g => {
          if (!g.qty_ok) return;
          const r = a.qtyGap / g.qty_ok;
          if (Math.abs(r - 1) < 0.001) {
            a.diagnosis = a.diagnosis || { group: g, kind: 'missing', ratio: r };
          } else if (Math.abs(Math.abs(r) - 2) < 0.001) {
            a.diagnosis = { group: g, kind: 'sign', ratio: r };
          }
        });
      }
    });

    // ─── ประกอบผลลัพธ์ ───────────────────────────────────────────────────
    // avg cost ณ สิ้นเดือนก่อนวันที่ใบสั่งผลิต (แทนที่ได้ด้วย ?asof=YYYY-MM-DD)
    ctx.asOf = /^\d{4}-\d{2}-\d{2}$/.test(asStr(asOfParam))
      ? asStr(asOfParam)
      : endOfPrevMonth(asStr(woRows[0].wo_date_iso));

    // ── กระทบยอด WIP ────────────────────────────────────────────────────
    const woTranIds = uniq(
      wocs.filter(w => asStr(w.wo_id) === rootId).map(w => w.woc_id)
        .concat(cas.filter(r => asStr(r.wo_id) === rootId).map(r => r.ca_id))
        .concat(issues.filter(r => asStr(r.wo_id) === rootId).map(r => r.tran_id))
    );
    ctx.wipRows = qWipRecon(woTranIds);
    const refRows = qDocWoRefs(woTranIds);
    ctx.docWoCount = {};
    groupByKeys(refRows, 'tran_id').forEach(g => { ctx.docWoCount[g.key] = g.rows.length; });

    m.ctx = ctx;
    m.root = summariseWO(rootId, ctx);
    m.producersByLot = producersByLot;
    m.parentWO = {};
    parentWOIds.forEach(id => { m.parentWO[asStr(id)] = summariseWO(asStr(id), ctx); });
    m.ok = true;
    return m;
  }

  // ─── ชั้นภาพรวม ────────────────────────────────────────────────────────────

  function todayIso() {
    const d = new Date();
    const m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }

  const MAX_ROWS_DEFAULT = 200;
  const MAX_ROWS_HARD = 1000;

  /** วันสุดท้ายของเดือน YYYY-MM */
  function endOfMonth(ym) {
    const mm = /^(\d{4})-(\d{2})$/.exec(asStr(ym));
    if (!mm) return '';
    const y = Number(mm[1]), m = Number(mm[2]);
    if (m < 1 || m > 12) return '';
    const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
                 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    return ym + '-' + dim;
  }

  /**
   * อ่านและตั้งค่าเริ่มต้นของตัวกรองหน้าภาพรวม
   *   ค่าเริ่มต้น = เดือนปัจจุบันทั้งเดือน จับจากวันที่ใบปิดงานผลิต
   *   เลือกเดือนแล้ว from/to ถูกคิดจากเดือนนั้น · จะกำหนดวันเองก็เลือก "กำหนดเอง" ในช่องเดือน
   */
  function readFilters(p) {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const today = todayIso();
    const monthRaw = asStr(p.month).trim();
    const custom = monthRaw === 'custom';
    const month = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw
      : (custom || iso.test(asStr(p.from)) || iso.test(asStr(p.to)) ? '' : today.substring(0, 7));

    let from, to;
    if (month) { from = month + '-01'; to = endOfMonth(month); }
    else {
      from = iso.test(asStr(p.from)) ? asStr(p.from) : today.substring(0, 7) + '-01';
      to = iso.test(asStr(p.to)) ? asStr(p.to) : endOfMonth(today.substring(0, 7));
    }

    return {
      month: month,
      from: from,
      to: to,
      // จับช่วงวันที่จากใบปิดงานผลิตเป็นหลัก เพราะต้นทุนเกิดตอนปิดงาน ไม่ใช่ตอนสั่งผลิต
      basis: asStr(p.basis) === 'wo' ? 'wo' : 'woc',
      item: asStr(p.item).trim(),
      wono: asStr(p.wono).trim(),
      sub: asStr(p.sub).replace(/[^0-9]/g, ''),
      loc: asStr(p.loc).replace(/[^0-9]/g, ''),
      sort: ['item', 'date', 'gap', 'unit'].indexOf(asStr(p.sort)) >= 0 ? asStr(p.sort) : 'item',
      max: Math.min(MAX_ROWS_HARD, Math.max(1, asNum(p.max) || MAX_ROWS_DEFAULT))
    };
  }

  /** รายการเดือนให้เลือก — ย้อนหลัง 17 เดือนถึงเดือนหน้า */
  function monthChoices() {
    const t = todayIso();
    let y = Number(t.substring(0, 4)), m = Number(t.substring(5, 7)) + 1;
    const out = [];
    for (let i = 0; i < 18; i++) {
      if (m < 1) { m = 12; y -= 1; }
      out.push(y + '-' + (m < 10 ? '0' + m : String(m)));
      m -= 1;
    }
    return out;
  }

  /**
   * ภาพรวมหลายใบสั่งผลิต — 1 คำสั่งหารายการ + 4 ชุดรวมยอดต่อทุก 150 ใบ
   * (200 ใบ = 9 คำสั่ง · ชั้นเจาะลึกใช้ 19 คำสั่งต่อใบ ถ้าวนเรียกจะกลายเป็นพันคำสั่ง)
   *
   * ทุกยอดในชั้นนี้ต้องเท่ากับชั้นเจาะลึกของใบเดียวกันทุกหลัก — ถ้าไม่เท่าคือ aggregate เพี้ยน
   * ไม่ใช่เรื่องปัดเศษ
   */
  function buildSummary(f) {
    // 1 แถวต่อ 1 ใบสั่งผลิตเท่านั้น — query คืนแถวต่อบรรทัด mainline='T' ซึ่งอาจมีมากกว่าหนึ่ง
    // ถ้าไม่ตัดซ้ำ ยอดของใบนั้นจะถูกบวกสองครั้งในแถวรวมและ KPI (ชั้นเจาะลึกใช้บรรทัดแรกใบเดียว)
    const seenWO = {};
    const heads = qSummaryWOs(f).filter(r => {
      const id = asStr(r.wo_id);
      if (!id || seenWO[id]) return false;
      seenWO[id] = true;
      return true;
    });
    const total = heads.length;
    const use = heads.slice(0, f.max);
    const woIds = uniq(use.map(r => r.wo_id));

    const byWo = (rows, key) => {
      const m = {};
      (rows || []).forEach(r => { m[asStr(r[key])] = r; });
      return m;
    };
    const range = f.wono ? null : { from: f.from, to: f.to };
    const prod = byWo(qSummaryProduced(woIds, range), 'wo_id');
    const rm = byWo(qSummaryRM(woIds), 'wo_id');
    const conv = byWo(qSummaryConv(woIds), 'wo_id');
    const sc = byWo(qSummarySummaryCost(woIds), 'wo_id');

    const rows = use.map(h => {
      const id = asStr(h.wo_id);
      const wocQty = asNum((prod[id] || {}).woc_qty);
      const rmCost = asNum((rm[id] || {}).rm_cost);
      const dlOh = asNum((conv[id] || {}).dl_oh_std);
      const cost = rmCost + dlOh;
      const bpc = asNum(h.base_per_carton);
      const cartons = bpc ? wocQty / bpc : 0;
      const scValue = asNum((sc[id] || {}).sc_value);
      const scDocs = asNum((sc[id] || {}).sc_docs);
      const scDocsValued = asNum((sc[id] || {}).sc_docs_valued);

      const wocCount = asNum((prod[id] || {}).woc_count);
      const wocInRange = asNum((prod[id] || {}).woc_in_range);

      const notes = [];
      if (!wocQty) notes.push({ cls: 'warn', text: 'ยังไม่มีใบปิดงานผลิต' });
      // ยอดผลิตได้นับ WOC ทุกใบเพื่อให้ตรงกับชั้นเจาะลึก ถ้าปิดงานคร่อมช่วงต้องบอกให้รู้
      if (range && wocCount > wocInRange && wocInRange > 0) {
        notes.push({ cls: 'warn', text: 'ปิดงานคร่อมช่วง ' + (wocCount - wocInRange)
          + ' จาก ' + wocCount + ' ใบอยู่นอกช่วง (ยอดผลิตได้รวมทุกใบ)' });
      }
      if (!rmCost) notes.push({ cls: 'warn', text: 'ยังไม่มีใบเบิกวัตถุดิบ' });
      if (!dlOh) notes.push({ cls: 'warn', text: 'ยังไม่ปันส่วนต้นทุนแปรสภาพ' });
      if (scDocs === 0) notes.push({ cls: 'warn', text: 'ยังไม่มีใบ MFG Summary Cost' });
      // ใบซ้ำที่มีมูลค่า = ตีราคาซ้ำ ต้องแก้ · ใบซ้ำที่มูลค่า 0 = เอกสารเปล่าค้าง สะอาดขึ้นได้แต่ไม่กระทบยอด
      if (scDocsValued > 1) {
        notes.push({ cls: 'bad', text: 'MFG Summary Cost ที่มีมูลค่า ' + scDocsValued
          + ' ใบ (กติกาคือ 1 ใบ) — ตีราคาซ้ำ' });
      } else if (scDocs > 1) {
        notes.push({ cls: 'warn', text: 'ใบ MFG Summary Cost มูลค่า 0 ค้างอยู่ ' + (scDocs - scDocsValued)
          + ' ใบ (รวม ' + scDocs + ' ใบ) — ไม่กระทบยอด' });
      }
      if (!bpc) notes.push({ cls: 'warn', text: 'ไม่ได้ตั้ง custitem_item_basepercarton' });

      return {
        wo_id: id,
        wo_no: asStr(h.wo_no),
        wo_date: asStr(h.wo_date),
        wo_date_iso: asStr(h.wo_date_iso),
        woc_last: asStr((prod[id] || {}).woc_last),
        woc_last_iso: asStr((prod[id] || {}).woc_last_iso),
        woc_count: wocCount,
        woc_in_range: wocInRange,
        production_line: asStr(h.production_line),
        item_id: asStr(h.item_id),
        item_code: asStr(h.item_code),
        item_name: asStr(h.item_name),
        unit: asStr(h.unit_name),
        wo_qty: Math.abs(asNum(h.wo_qty)),
        woc_qty: wocQty,
        rm_cost: rmCost,
        dl_oh_cost: dlOh,
        cost: cost,
        base_per_carton: bpc,
        cartons: cartons,
        // ตัวหารเป็นศูนย์ = ยังไม่ปิดงานผลิต ต้องคืน null ให้หน้ารายงานขึ้นว่า "ยังไม่มี"
        // ไม่ใช่ 0 ซึ่งอ่านเป็น "ต้นทุนศูนย์"
        cost_per_unit: wocQty ? cost / wocQty : null,
        cost_per_carton: cartons ? cost / cartons : null,
        sc_value: scValue,
        sc_docs: scDocs,
        sc_docs_valued: scDocsValued,
        sc_gap: scValue - cost,
        notes: notes
      };
    });

    // เรียงตามวันที่ = วันที่ที่ใช้กรอง เพื่อให้ลำดับตรงกับสิ่งที่ผู้ใช้เลือกกรอง
    if (f.sort === 'date') {
      const key = r => (f.basis === 'woc' ? (r.woc_last_iso || r.wo_date_iso) : r.wo_date_iso);
      rows.sort((a, b) => key(a) < key(b) ? -1 : (key(a) > key(b) ? 1 : (a.wo_no < b.wo_no ? -1 : 1)));
    }
    else if (f.sort === 'gap') rows.sort((a, b) => Math.abs(b.sc_gap) - Math.abs(a.sc_gap));
    else if (f.sort === 'unit') rows.sort((a, b) => (b.cost_per_unit || 0) - (a.cost_per_unit || 0));

    return { filters: f, rows: rows, total: total, shown: rows.length, truncated: total > rows.length };
  }

  /** เลข transaction ของใบเบิกที่เป็นของ WO ชุดที่ระบุ */
  function qIssuesTranIds(issues, woIds) {
    const want = {};
    woIds.forEach(id => { want[asStr(id)] = true; });
    return issues.filter(r => want[asStr(r.wo_id)]).map(r => r.tran_id);
  }

  /**
   * ตัวคูณแปลงปริมาณจากหน่วยใน BOM ไปเป็นหน่วยที่เก็บต้นทุน
   * คืน null เมื่อหาอัตราไม่ได้ เพื่อให้หน้ารายงานเตือนแทนที่จะคิดผิดเงียบ ๆ
   */
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
  function bomRollup(ctx, itemId) {
    const comps = ctx.bomByParent[asStr(itemId)] || [];
    if (!comps.length) return null;
    let total = 0;
    let totalAsOf = 0;
    let unresolved = 0;
    let unresolvedAvg = 0;
    const detail = comps.map(c => {
      const bq = asNum(c.bom_qty);
      const av = asNum(c.comp_avg_cost);
      const conv = uomFactor(ctx, c.comp_unit_id, c.comp_stock_unit_id);
      const ok = conv.factor != null;
      if (!ok) unresolved++;
      const qtyCost = ok ? bq * conv.factor : bq;
      const amt = qtyCost * av;
      total += amt;
      // ถ้า average cost ของวัตถุดิบตัวนี้ยังตรวจไม่ผ่าน ผลรวมที่คิดจากมันก็เชื่อไม่ได้ตามไปด้วย
      // ต้องเตือนที่นี่ด้วย ไม่ใช่เตือนแค่ในหัวข้อตรวจสุขภาพ
      const aud = (ctx.auditByItem || {})[asStr(c.comp_item)];
      if (aud && !aud.reconciles) unresolvedAvg++;
      const ao = avgAsOf(ctx.ledgerByItem[asStr(c.comp_item)], ctx.asOf);
      const avgAo = ao ? ao.avg : null;
      if (avgAo != null) totalAsOf += qtyCost * avgAo;
      return {
        avg_asof: avgAo,
        avg_untrusted: !!(aud && !aud.reconciles),
        comp_item: asStr(c.comp_item),
        comp_code: asStr(c.comp_code),
        comp_name: asStr(c.comp_name),
        bom_qty: bq,
        bom_unit: asStr(c.comp_unit_name),
        stock_unit: asStr(c.comp_stock_unit),
        conv_factor: ok ? conv.factor : null,
        conv_note: conv.note,
        qty_cost_unit: qtyCost,
        avg_cost: av,
        amount: amt,
        item_source: asStr(c.item_source)
      };
    });
    return {
      rev_name: asStr(comps[0].rev_name),
      batch_qty: asNum(comps[0].batch_qty),
      detail: detail,
      unit_cost: total,
      unit_cost_asof: totalAsOf,
      unresolved: unresolved,
      unresolvedAvg: unresolvedAvg
    };
  }

  // ═══ render ════════════════════════════════════════════════════════════════

  const CSS = `<style>
  body{font:13px/1.5 Segoe UI,Tahoma,sans-serif;margin:0;padding:18px;background:#f5f6f8;color:#1b1f23}
  h1{font-size:20px;margin:0 0 4px}
  h2{font-size:15px;margin:24px 0 8px;padding-bottom:5px;border-bottom:2px solid #d0d7de}
  h3{font-size:13px;margin:14px 0 5px;color:#24292f}
  .sub{color:#57606a;font-size:12px;margin-bottom:14px}
  form{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:11px 13px;margin-bottom:14px}
  input[type=text]{font:13px Consolas,monospace;padding:6px 8px;border:1px solid #8c959f;border-radius:4px;width:230px}
  button{font:13px Segoe UI;padding:6px 15px;border:1px solid #1f6feb;background:#1f6feb;color:#fff;border-radius:4px;cursor:pointer}
  table{border-collapse:collapse;background:#fff;margin:5px 0 10px;font-size:12px;width:100%}
  th,td{border:1px solid #d8dee4;padding:4px 7px;text-align:left;vertical-align:top}
  th{background:#eaeef2;font-weight:600}
  td.n,th.n{text-align:right;font-family:Consolas,monospace;white-space:nowrap}
  td.z{color:#c9d1d9}
  tr.tot td{font-weight:700;background:#fff8e1}
  tr.grand td{font-weight:700;background:#e6f4ea}
  .card{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:11px 13px;margin-bottom:12px}
  .kv td:first-child{background:#f6f8fa;font-weight:600;width:150px}
  details{margin:7px 0}
  summary{cursor:pointer;padding:6px 9px;background:#eaeef2;border:1px solid #d0d7de;border-radius:4px}
  summary:hover{background:#dde3e9}
  .lvl2{margin-left:16px;border-left:3px solid #54aeff;padding-left:12px}
  .lvl3{margin-left:16px;border-left:3px solid #ffab70;padding-left:12px}
  .bad{color:#cf222e;font-weight:700}.warn{color:#9a6700}.ok{color:#1a7f37}
  .tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:9px;background:#ddf4ff;color:#0550ae;margin-left:5px}
  .err{background:#fff5f5;border:1px solid #cf222e;color:#cf222e;padding:7px 9px;border-radius:4px;margin:7px 0;font-size:12px}
  pre{margin:0;white-space:pre-wrap;font-size:11px;font-family:Consolas,monospace}
  a{color:#0550ae}
  select{font:13px Segoe UI;padding:5px 7px;border:1px solid #8c959f;border-radius:4px}
  label{font-size:12px;color:#57606a}
  .kpis{display:flex;flex-wrap:wrap;gap:9px;margin:12px 0}
  .kpi{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:8px 12px;min-width:132px}
  .kpi b{display:block;font-size:16px;font-family:Consolas,monospace;white-space:nowrap}
  .kpi span{font-size:11px;color:#57606a}
  tr.sub td{background:#f6f8fa;font-weight:600}
  .note{font-size:11px;line-height:1.35}
  .crumb{font-size:12px;margin-bottom:10px}
  .miss{color:#9a6700;font-family:Consolas,monospace}
  /* ตารางภาพรวมกว้าง 15 คอลัมน์ และยาวได้ถึงหลักร้อยแถว — ให้เลื่อนในกรอบของตัวเองพร้อมหัวตารางติดบน */
  .scroll{overflow:auto;max-height:76vh;border:1px solid #d0d7de;border-radius:6px;background:#fff}
  .scroll table{margin:0;border:0}
  .scroll thead th{position:sticky;top:0;z-index:2;box-shadow:inset 0 -1px 0 #d0d7de}
  /* เลข WO = ลิงก์หลักไปหน้าเจาะลึก · ลิงก์ไป record ของ NetSuite แยกบรรทัดและทำให้จางลง
     กันไม่ให้กดผิดปลายทาง (ของเดิมเป็นไอคอน ↗ ตัวเดียวติดท้ายเลขที่ตัดบรรทัด) */
  a.drill{font-weight:600;white-space:nowrap}
  .nsrec{margin-top:2px}
  .nsrec a{font-size:10px;color:#57606a;text-decoration:none}
  .nsrec a:hover{color:#0550ae;text-decoration:underline}
  </style>`;

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

  function renderForm(woKey, asOf, filters) {
    const s = runtime.getCurrentScript();
    const keep = filterParams(filters);
    const hidden = Object.keys(keep).map(k =>
      asStr(keep[k]) ? `<input type="hidden" name="${k}" value="${esc(keep[k])}">` : '').join('');
    return `<form method="get">
      <input type="hidden" name="script" value="${esc(s.id)}">
      <input type="hidden" name="deploy" value="${esc(s.deploymentId)}">
      ${hidden}
      เลขที่ใบสั่งผลิต <input type="text" name="wo" value="${esc(woKey)}" placeholder="WOFSC00000470">
      &nbsp; avg cost ณ วันที่ <input type="text" name="asof" value="${esc(asOf)}" placeholder="YYYY-MM-DD" style="width:120px">
      <button type="submit">ตรวจที่มาของต้นทุน</button>
    </form>`;
  }

  // ═══ render — ชั้นภาพรวม ═══════════════════════════════════════════════════

  const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  function monthLabel(ym) {
    const m = Number(asStr(ym).substring(5, 7));
    return (TH_MONTH[m - 1] || ym) + ' ' + asStr(ym).substring(0, 4);
  }

  function renderSummaryForm(f) {
    const s = runtime.getCurrentScript();
    const sortOpt = (v, label) => `<option value="${v}"${f.sort === v ? ' selected' : ''}>${label}</option>`;
    const monthOpts = monthChoices().map(ym =>
      `<option value="${ym}"${f.month === ym ? ' selected' : ''}>${esc(monthLabel(ym))}</option>`).join('');
    return `<form method="get">
      <input type="hidden" name="script" value="${esc(s.id)}">
      <input type="hidden" name="deploy" value="${esc(s.deploymentId)}">
      <label>เดือน</label>
      <select name="month">${monthOpts}<option value="custom"${f.month ? '' : ' selected'}>— กำหนดวันที่เอง —</option></select>
      &nbsp;<label>หรือระบุช่วง</label>
      <input type="text" name="from" value="${esc(f.from)}" placeholder="YYYY-MM-DD" style="width:110px">
      ถึง <input type="text" name="to" value="${esc(f.to)}" placeholder="YYYY-MM-DD" style="width:110px">
      &nbsp;<label>จับจาก</label>
      <select name="basis">
        <option value="woc"${f.basis === 'woc' ? ' selected' : ''}>วันที่ปิดงานผลิต (WOC)</option>
        <option value="wo"${f.basis === 'wo' ? ' selected' : ''}>วันที่ใบสั่งผลิต (WO)</option>
      </select>
      <br style="line-height:9px">
      <label>รหัสสินค้า</label> <input type="text" name="item" value="${esc(f.item)}" placeholder="บางส่วนก็ได้" style="width:130px">
      &nbsp;<label>เลขที่ใบสั่งผลิต</label> <input type="text" name="wono" value="${esc(f.wono)}" placeholder="ข้ามช่วงวันที่" style="width:140px">
      &nbsp;<label>บริษัท (id)</label> <input type="text" name="sub" value="${esc(f.sub)}" style="width:50px">
      &nbsp;<label>คลัง (id)</label> <input type="text" name="loc" value="${esc(f.loc)}" style="width:50px">
      &nbsp;<label>เรียงตาม</label>
      <select name="sort">${sortOpt('item', 'รหัสสินค้า')}${sortOpt('date', 'วันที่')}${sortOpt('gap', 'ผลต่าง summary cost มากสุด')}${sortOpt('unit', 'ต้นทุน/หน่วย สูงสุด')}</select>
      &nbsp;<label>ไม่เกิน</label> <input type="text" name="max" value="${esc(String(f.max))}" style="width:45px"> ใบ
      &nbsp;<button type="submit">ดูภาพรวม</button>
      <div style="font-size:11px;color:#57606a;margin-top:6px">
        เลือกเดือนแล้วช่องวันที่จะถูกคิดจากเดือนนั้นทั้งเดือน · จะระบุช่วงเองให้เลือก "กำหนดวันที่เอง" ในช่องเดือน
        · ค่าเริ่มต้นจับจากวันที่ปิดงานผลิต เพราะต้นทุนเกิดตอนปิดงาน ไม่ใช่ตอนสั่งผลิต
      </div>
    </form>`;
  }

  function renderSummaryKpis(sm) {
    let rm = 0, dl = 0, cost = 0, gap = 0, gapAbs = 0, gapCount = 0;
    let noWoc = 0, noIssue = 0, flagged = 0;
    sm.rows.forEach(r => {
      rm += r.rm_cost; dl += r.dl_oh_cost; cost += r.cost;
      gap += r.sc_gap;
      // ผลต่างสุทธิกลบกันเองได้ (+600,000 กับ −600,000 = 0 ทั้งที่ผิดสองใบ)
      // จึงต้องบอกจำนวนใบที่ไม่ปิดและผลรวมค่าสัมบูรณ์ควบไปด้วย
      if (Math.abs(r.sc_gap) > 0.01) { gapCount++; gapAbs += Math.abs(r.sc_gap); }
      if (!r.woc_qty) noWoc++;
      if (!r.rm_cost) noIssue++;
      if (r.notes.some(n => n.cls === 'bad')) flagged++;
    });
    const kpi = (label, val, cls) => `<div class="kpi"><b class="${cls || ''}">${val}</b><span>${label}</span></div>`;
    return '<div class="kpis">'
      + kpi('ใบสั่งผลิต', esc(String(sm.shown)) + (sm.truncated ? ' <span class="tag">จาก ' + esc(String(sm.total)) + '</span>' : ''))
      + kpi('รวมวัตถุดิบและบรรจุภัณฑ์', esc(fmt(rm, 2)))
      + kpi('รวมต้นทุนแปรสภาพ', esc(fmt(dl, 2)))
      + kpi('รวมต้นทุนการผลิต', esc(fmt(cost, 2)))
      + kpi('ใบที่ Summary Cost ไม่ปิด', esc(String(gapCount)) + ' / ' + esc(String(sm.shown)),
        gapCount ? 'bad' : 'ok')
      + kpi('ผลต่างสุทธิ · รวมค่าสัมบูรณ์',
        '<span style="font-size:13px">' + esc(fmt(gap, 0)) + ' · ' + esc(fmt(gapAbs, 0)) + '</span>',
        gapCount ? 'bad' : 'ok')
      + kpi('ยังไม่เบิกวัตถุดิบ', esc(String(noIssue)), noIssue ? 'warn' : 'ok')
      + kpi('ยังไม่ปิดงานผลิต', esc(String(noWoc)), noWoc ? 'warn' : 'ok')
      + kpi('ตีราคาซ้ำ (ต้องแก้)', esc(String(flagged)), flagged ? 'bad' : 'ok')
      + '</div>';
  }

  /**
   * ช่องต้นทุนต่อหน่วย
   *   ยังไม่ปิดงานผลิต → "ยังไม่มี" ไม่ใช่เลขศูนย์
   *   ยังไม่มีใบเบิกวัตถุดิบ → เลขที่ได้เป็นค่าแปรสภาพล้วน ต้องทำเครื่องหมายที่ตัวเลขเอง
   *     เพราะคอลัมน์หมายเหตุอยู่ขวาสุดและมักหลุดจอ (เดือน 07/2026 มีเคสนี้ 166 จาก 197 ใบ)
   */
  function unitCell(v, dp, partialNote) {
    if (v == null) return '<td class="n miss" title="ยังไม่มีปริมาณผลิตได้จริงมาเป็นตัวหาร">ยังไม่มี</td>';
    if (!partialNote) return numCell(v, dp);
    if (!isFinite(v)) return '<td class="n z"></td>';
    return '<td class="n warn" title="' + esc(partialNote + ' · ค่าดิบ ' + rawNum(v)) + '">'
      + esc(fmt(v, dp)) + ' ⚠</td>';
  }

  /** ต้นทุนที่ยังไม่รวมวัตถุดิบ = อ่านเป็นต้นทุนเต็มไม่ได้ */
  function partialCostNote(rm, cost) {
    return (rm === 0 && cost > 0) ? 'ยังไม่มีใบเบิกวัตถุดิบ — เลขนี้เป็นต้นทุนแปรสภาพล้วน ไม่ใช่ต้นทุนเต็ม' : '';
  }

  function renderSummaryGrid(sm) {
    if (!sm.rows.length) {
      return '<div class="card">ไม่พบใบสั่งผลิตตามเงื่อนไขนี้ — ลองขยายช่วงวันที่ หรือล้างช่องรหัสสินค้า</div>';
    }
    const groupByItem = sm.filters.sort === 'item';

    let h = `<div class="scroll"><table><thead><tr>
      <th>ใบสั่งผลิต</th><th>วันที่ WO</th><th>ปิดงานผลิต</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th>
      <th class="n">สั่งผลิต</th><th class="n">ผลิตได้ (WOC)</th>
      <th class="n">วัตถุดิบ</th><th class="n">แปรสภาพ (DL+OH)</th><th class="n">รวมต้นทุน</th>
      <th class="n">ต้นทุน/หน่วย</th><th class="n">ต้นทุน/ลัง</th>
      <th class="n">Summary Cost Item</th><th class="n">ผลต่าง</th><th>หมายเหตุ</th></tr></thead><tbody>`;

    let g = null;
    const flushGroup = () => {
      if (!g || g.n < 2) { g = null; return; }
      const cpu = g.woc ? g.cost / g.woc : null;
      const cpc = g.cartons ? g.cost / g.cartons : null;
      const gPartial = partialCostNote(g.rm, g.cost);
      h += `<tr class="sub"><td colspan="5">รวม ${esc(g.code)} · ${g.n} ใบ</td>`
        + numCell(g.wo_qty, 4) + numCell(g.woc, 4)
        + numCell(g.rm, 2) + numCell(g.dl, 2) + numCell(g.cost, 2)
        + unitCell(cpu, 8, gPartial) + unitCell(cpc, 8, gPartial)
        + numCell(g.sc, 2) + numCell(g.gap, 2, Math.abs(g.gap) > 0.01 ? 'bad' : '')
        + '<td></td></tr>';
      g = null;
    };

    let t = { wo_qty: 0, woc: 0, rm: 0, dl: 0, cost: 0, sc: 0, gap: 0 };

    sm.rows.forEach(r => {
      if (groupByItem) {
        if (g && g.code !== r.item_code) flushGroup();
        if (!g) g = { code: r.item_code, n: 0, wo_qty: 0, woc: 0, rm: 0, dl: 0, cost: 0, sc: 0, gap: 0, cartons: 0 };
        g.n++; g.wo_qty += r.wo_qty; g.woc += r.woc_qty; g.rm += r.rm_cost; g.dl += r.dl_oh_cost;
        g.cost += r.cost; g.sc += r.sc_value; g.gap += r.sc_gap; g.cartons += r.cartons;
      }
      t.wo_qty += r.wo_qty; t.woc += r.woc_qty; t.rm += r.rm_cost; t.dl += r.dl_oh_cost;
      t.cost += r.cost; t.sc += r.sc_value; t.gap += r.sc_gap;

      const gapBad = Math.abs(r.sc_gap) > 0.01;
      h += '<tr>'
        // สองลิงก์คนละปลายทางในเซลล์เดียว ต้องแยกให้ชัด — ของเดิมวางติดกันแล้วเลข WO ตัดบรรทัด
        // ทำให้ ↗ ไปอยู่ต่อท้ายเลขพอดี กดโดนลิงก์ record แทนรายงานเป็นประจำ
        + `<td><a class="drill" href="${selfUrl(Object.assign(filterParams(sm.filters), { wo: r.wo_no }))}"
              title="ดูที่มาของต้นทุนใบนี้ — เปิดหน้าเจาะลึกในรายงานนี้">${esc(r.wo_no)}</a>`
        + `<div class="nsrec">${tranLink('workorder', r.wo_id, 'เปิดใบสั่งผลิตใน NetSuite ↗')}</div></td>`
        + `<td>${esc(r.wo_date)}</td>`
        + `<td>${r.woc_last ? esc(r.woc_last) : '<span class="miss">ยังไม่ปิด</span>'}</td>`
        + `<td>${itemLink(r.item_id, r.item_code)}</td>`
        + `<td>${esc(r.item_name)}</td>`
        + numCell(r.wo_qty, 4) + numCell(r.woc_qty, 4)
        + numCell(r.rm_cost, 2) + numCell(r.dl_oh_cost, 2) + numCell(r.cost, 2)
        + unitCell(r.cost_per_unit, 8, partialCostNote(r.rm_cost, r.cost))
        + unitCell(r.cost_per_carton, 8, partialCostNote(r.rm_cost, r.cost))
        + numCell(r.sc_value, 2) + numCell(r.sc_gap, 2, gapBad ? 'bad' : '')
        + `<td class="note">${r.notes.map(n => '<span class="' + n.cls + '">' + esc(n.text) + '</span>').join('<br>')}</td>`
        + '</tr>';
    });
    if (groupByItem) flushGroup();

    // ต้นทุนต่อหน่วยของหลายสินค้ารวมกันไม่มีความหมาย — แถวรวมท้ายตารางจึงไม่แสดงช่องนั้น
    const items = uniq(sm.rows.map(r => r.item_code)).length;
    const tCpu = items === 1 && t.woc ? t.cost / t.woc : null;
    h += `<tr class="grand"><td colspan="5">รวมทั้งหมด ${sm.shown} ใบ · ${items} สินค้า</td>`
      + numCell(t.wo_qty, 4) + numCell(t.woc, 4)
      + numCell(t.rm, 2) + numCell(t.dl, 2) + numCell(t.cost, 2)
      + (items === 1 ? unitCell(tCpu, 8, partialCostNote(t.rm, t.cost)) : '<td class="n z">—</td>')
      + '<td class="n z">—</td>'
      + numCell(t.sc, 2) + numCell(t.gap, 2, Math.abs(t.gap) > 0.01 ? 'bad' : '')
      + '<td></td></tr>';

    return h + '</tbody></table></div>';
  }

  function renderSummaryPage(sm) {
    const f = sm.filters;
    let h = CSS + '<h1>ภาพรวมต้นทุนใบสั่งผลิต</h1>'
      + '<div class="sub">ดูหลายสินค้าหลายใบสั่งผลิตพร้อมกัน แล้วกดเลขที่ใบสั่งผลิตเพื่อเจาะที่มาของทุกตัวเลข '
      + 'จนถึงเอกสารต้นทาง · ยอดในหน้านี้ใช้แหล่งข้อมูลเดียวกับหน้าเจาะลึกทุกช่อง</div>'
      + renderSummaryForm(f);

    h += renderErrors();
    h += '<div class="sub">' + (f.wono
      ? 'กรองด้วยเลขที่ใบสั่งผลิต "' + esc(f.wono) + '" — ข้ามช่วงวันที่'
      : 'ช่วง <b>' + esc(f.month ? monthLabel(f.month) : f.from + ' ถึง ' + f.to) + '</b>'
        + ' จับจาก<b>' + (f.basis === 'woc' ? 'วันที่ปิดงานผลิต (WOC)' : 'วันที่ใบสั่งผลิต (WO)') + '</b>'
        + (f.basis === 'woc'
          ? ' — ได้ใบสั่งผลิตที่มีการปิดงานในช่วงนี้ แม้จะสั่งผลิตไว้ก่อนหน้า'
          : ' — ได้ใบที่ออกในช่วงนี้ ใบที่ยังไม่ปิดงานก็ติดมาด้วย'))
      + '</div>';
    h += renderSummaryKpis(sm);
    if (sm.truncated) {
      h += '<div class="err">เงื่อนไขนี้เข้าเกณฑ์ ' + sm.total + ' ใบ แต่แสดงเพียง ' + sm.shown
        + ' ใบแรก (เรียงตามรหัสสินค้าและวันที่) — ยอดรวมและ KPI ด้านบนนับแค่ที่แสดง '
        + 'ให้แคบช่วงวันที่ลง หรือเพิ่มค่าในช่อง "ไม่เกิน" (สูงสุด ' + MAX_ROWS_HARD + ')</div>';
    }
    h += renderSummaryGrid(sm);

    h += '<h2>อ่านตารางนี้อย่างไร</h2><div class="card"><table class="kv">'
      + '<tr><td>ช่วงวันที่</td><td>ค่าเริ่มต้นจับจาก<b>วันที่ใบปิดงานผลิต</b> เพราะต้นทุนเกิดตอนปิดงาน '
      + 'ใบที่สั่งผลิตเดือนก่อนแต่ปิดงานเดือนนี้จึงอยู่ในเดือนนี้ · เงื่อนไขคือ '
      + '"มีใบปิดงานผลิตอย่างน้อยหนึ่งใบในช่วง" แต่<b>ยอดผลิตได้และต้นทุนนับ WOC ทุกใบ</b>ของใบสั่งผลิตนั้น '
      + 'เพื่อให้ตัวเลขเท่ากับหน้าเจาะลึกเสมอ · ใบที่ปิดงานคร่อมช่วงจะขึ้นหมายเหตุไว้</td></tr>'
      + '<tr><td>วัตถุดิบ</td><td>ผลรวมมูลค่าบนบรรทัดใบเบิก (Inventory Adjustment ประเภทเบิกวัตถุดิบ/บรรจุ) '
      + 'ที่ผูกใบสั่งผลิตนี้ · ตัดบรรทัด summary cost item ออกแล้ว</td></tr>'
      + '<tr><td>แปรสภาพ (DL+OH)</td><td>ผลรวม <code>standardcost</code> จากเอกสารปันส่วนต้นทุน '
      + 'ตัด classification 1 (WIP) ออกเพราะเป็นยอดรวมไม่ใช่องค์ประกอบ</td></tr>'
      + '<tr><td>ต้นทุน/หน่วย</td><td>(วัตถุดิบ + แปรสภาพ) ÷ ปริมาณที่ผลิตได้จริงจาก WOC '
      + '<b>ไม่ใช่</b>จำนวนที่สั่งผลิต · ใบที่ยังไม่มี WOC จึงยังคิดไม่ได้</td></tr>'
      + '<tr><td>ต้นทุน/ลัง</td><td>(วัตถุดิบ + แปรสภาพ) ÷ (ผลิตได้จริง ÷ '
      + '<code>custitem_item_basepercarton</code> ของสินค้านั้น)</td></tr>'
      + '<tr><td>ผลต่าง</td><td>Summary Cost Item − (วัตถุดิบ + แปรสภาพ) · ต้องเป็นศูนย์ '
      + 'ส่วนต่างเท่าไหร่ค้างอยู่ในบัญชีงานระหว่างทำเท่านั้น กดเจาะลึกเพื่อดูว่าเกิดที่เอกสารใบไหน</td></tr>'
      + '</table></div>';

    h += '<h2>เอกสารอ้างอิงทางเทคนิค</h2>' + renderQLog();
    return h;
  }

  function renderWOHeader(s) {
    const w = s.wo, fg = s.fg || {};
    return `<div class="card"><table class="kv">
      <tr><td>ใบสั่งผลิต</td><td>${tranLink('workorder', s.wo_id, asStr(w.wo_no))}<span class="tag">id ${esc(s.wo_id)}</span></td>
          <td>วันที่</td><td>${esc(asStr(w.wo_date))}</td></tr>
      <tr><td>สินค้าที่ผลิต</td><td colspan="3">${itemLink(fg.item_id, asStr(fg.item_code) + ' — ' + asStr(fg.item_name))}</td></tr>
      <tr><td>สั่งผลิต</td><td>${esc(fmt(asNum(fg.quantity), 4))} ${esc(asStr(fg.unit_name))}</td>
          <td>ผลิตได้จริง (จาก WOC)</td><td><b>${esc(fmt(s.produced, 4))}</b> ${esc(asStr(fg.unit_name))}</td></tr>
      <tr><td>สถานะ</td><td>${esc(asStr(w.wo_status))}</td>
          <td>ประเภท / สายการผลิต</td><td>${esc(asStr(w.wo_type))} / ${esc(asStr(w.production_line))}</td></tr>
    </table></div>`;
  }

  function renderWOCs(s) {
    if (!s.wocs.length) return '<p class="warn">ยังไม่มีใบปิดงานผลิต</p>';
    let h = `<table><tr><th>ใบปิดงานผลิต</th><th>วันที่</th><th>ขั้นตอน</th>
      <th class="n">แผน</th><th class="n">ดี</th><th class="n">เสีย</th><th class="n">รับเข้าคลัง</th></tr>`;
    s.wocs.forEach(r => {
      h += `<tr><td>${tranLink('workordercompletion', r.woc_id, asStr(r.woc_no))}</td>
        <td>${esc(asStr(r.woc_date))}</td><td>${esc(asStr(r.task_name) || asStr(r.task_no))}</td>`
        + numCell(asNum(r.pro_qty), 4) + numCell(asNum(r.good_qty), 4)
        + numCell(asNum(r.scrap_qty), 4) + numCell(asNum(r.fg_qty), 4) + '</tr>';
    });
    h += `<tr class="tot"><td colspan="6">รวมรับเข้าคลัง (ตัวหารของต้นทุนต่อหน่วย)</td>`
      + numCell(s.produced, 4) + '</tr></table>';
    return h;
  }

  /** ตารางวัตถุดิบของ WO หนึ่งใบ — ใช้ทั้ง WO แม่และ WO ต้นทางของ semi */
  function renderMaterials(s, ctx, showLots) {
    let h = `<table><tr><th>รหัส</th><th>ชื่อ</th><th>หน่วย</th>
      <th class="n">ตาม BOM</th><th class="n">เบิกจริง</th><th class="n">ผลต่าง</th>
      <th class="n">ต้นทุน/หน่วย</th><th class="n">มูลค่า</th>
      ${showLots ? '<th>lot</th>' : ''}<th>ใบเบิก</th></tr>`;
    s.rows.forEach(r => {
      const diffBad = Math.abs(r.qty_diff) > 0.0001 && r.std_qty !== 0;
      const docs = {};
      r.docs.forEach(d => { docs[asStr(d.doc_no)] = d; });
      const docHtml = Object.keys(docs).map(k => tranLink(docs[k].recordtype, docs[k].tran_id, k)
        + (asStr(docs[k].adj_type) ? '<br><span class="tag">' + esc(asStr(docs[k].adj_type)) + '</span>' : ''))
        .join('<br>') || '<span class="bad">ไม่พบใบเบิก</span>';
      const lotHtml = uniq(r.lots.map(l => l.lot_no)).join('<br>');
      h += `<tr><td>${itemLink(r.item_id, r.item_code)}</td><td>${esc(r.item_name)}</td><td>${esc(r.unit)}</td>`
        + numCell(r.std_qty, 6)
        + numCell(r.act_qty, 6)
        + numCell(r.qty_diff, 6, diffBad ? 'bad' : '')
        + numCell(r.unit_cost, 10)
        + numCell(r.act_amount, 2)
        + (showLots ? '<td>' + lotHtml + '</td>' : '')
        + `<td>${docHtml}</td></tr>`;
    });
    const span = showLots ? 8 : 7;
    h += `<tr class="tot"><td colspan="${span - 1}">รวมมูลค่าวัตถุดิบที่เบิก</td>`
      + numCell(s.rmTotal, 2) + `<td colspan="${showLots ? 2 : 1}"></td></tr>`;
    if (s.produced) {
      h += `<tr class="tot"><td colspan="${span - 1}">÷ ผลิตได้ ${esc(fmt(s.produced, 4))} = ต้นทุนวัตถุดิบ/หน่วย</td>`
        + numCell(s.unitCostRM, 10) + `<td colspan="${showLots ? 2 : 1}"></td></tr>`;
    }
    return h + '</table>';
  }

  function renderCostAlloc(s) {
    if (!s.ca.length) return '<p class="warn">ยังไม่มีเอกสารปันส่วนต้นทุน — ต้นทุนแปรสภาพยังไม่ถูกสร้าง</p>';
    let h = `<table><tr><th>เอกสาร</th><th>ใบปิดงานผลิต</th><th>ประเภทต้นทุน</th><th>บัญชี</th>
      <th class="n">มาตรฐาน</th><th class="n">จริง</th></tr>`;
    let wipStd = 0, wipAct = 0;
    s.ca.forEach(r => {
      const cls = asNum(r.cost_class);
      const std = asNum(r.std_cost), act = asNum(r.act_cost);
      if (cls === CLASS_WIP) { wipStd += std; wipAct += act; }
      h += `<tr><td>${esc(asStr(r.ca_no))}</td><td>${esc(asStr(r.woc_id))}</td>
        <td>${esc(COST_CLASS[cls] || 'classification ' + asStr(r.cost_class))}</td>
        <td>${esc(asStr(r.acct_no))} ${esc(asStr(r.acct_name))}</td>`
        + numCell(std, 2) + numCell(act, 2) + '</tr>';
    });
    h += `<tr class="tot"><td colspan="4">รวมต้นทุนแปรสภาพ (ไม่รวมบรรทัด WIP ที่เป็นยอดรวม)</td>`
      + numCell(s.convStd, 2) + numCell(s.convAct, 2) + '</tr>';
    h += `<tr><td colspan="4">ยอดที่ระบบโอนเข้างานระหว่างทำ (WIP)</td>`
      + numCell(wipStd, 2) + numCell(wipAct, 2) + '</tr>';
    const gap = wipStd - s.convStd;
    if (Math.abs(gap) > 0.01) {
      h += `<tr><td colspan="4" class="bad">ผลต่าง WIP กับผลรวมองค์ประกอบ</td>` + numCell(gap, 2) + '<td class="n"></td></tr>';
    }
    return h + '</table>';
  }

  function renderTotals(s, ctx) {
    const rmU = s.unitCostRM, cvU = s.produced ? s.convStd / s.produced : 0;
    const total = s.rmTotal + s.convStd;
    const fg = s.fg || {};
    const fgItem = ctx.itemById[asStr(fg.item_id)] || {};
    const bpc = asNum(fgItem.base_per_carton);
    const cartons = bpc ? s.produced / bpc : 0;
    const unit = asStr(fg.unit_name);

    let h = `<table><tr><th>องค์ประกอบต้นทุน</th><th class="n">มูลค่ารวม</th>
      <th class="n">ต่อ ${esc(unit || 'หน่วย')}</th><th>ที่มา</th></tr>`;
    h += `<tr><td>วัตถุดิบและบรรจุภัณฑ์</td>` + numCell(s.rmTotal, 2) + numCell(rmU, 8)
      + '<td>ผลรวมบรรทัดใบเบิก (ชั้นที่ 1)</td></tr>';
    h += `<tr><td>ต้นทุนแปรสภาพ (ค่าแรง + โอเวอร์เฮด)</td>` + numCell(s.convStd, 2) + numCell(cvU, 8)
      + '<td>เอกสารปันส่วนต้นทุน</td></tr>';
    h += `<tr class="grand"><td>วัตถุดิบและบรรจุภัณฑ์ + ต้นทุนแปรสภาพ</td>` + numCell(total, 2)
      + numCell(rmU + cvU, 8) + `<td>÷ ผลิตได้จริง ${esc(fmt(s.produced, 4))} ${esc(unit)}</td></tr>`;

    // ต่อลัง — จำนวนลัง = ผลิตได้จริง ÷ จำนวนหน่วยต่อลังของสินค้า
    if (bpc) {
      h += `<tr><td>จำนวนลังที่ผลิตได้</td>` + numCell(cartons, 6) + '<td class="n z"></td>'
        + `<td>ผลิตได้จริง ${esc(fmt(s.produced, 4))} ÷ ${esc(fmt(bpc, 4))} (<code>custitem_item_basepercarton</code>)</td></tr>`;
      h += `<tr class="grand"><td>ต้นทุนต่อลัง</td>` + numCell(total, 2)
        + numCell(cartons ? total / cartons : 0, 8)
        + `<td>(วัตถุดิบ + แปรสภาพ) ÷ จำนวนลัง</td></tr>`;
    } else {
      h += '<tr><td colspan="4" class="warn">สินค้านี้ไม่ได้ตั้งค่า '
        + '<code>custitem_item_basepercarton</code> จึงคำนวณต้นทุนต่อลังไม่ได้</td></tr>';
    }
    return h + '</table>';
  }

  /**
   * กระทบยอด WIP — สมการที่ต้องปิด
   * Summary Cost Item ต้องเท่ากับ วัตถุดิบและบรรจุภัณฑ์ + ต้นทุนแปรสภาพ
   * ถ้าไม่เท่า ส่วนต่างจะค้างเป็นยอดใน WIP ของใบสั่งผลิตนี้
   */
  function renderWipRecon(s, ctx) {
    const rows = ctx.wipRows || [];
    const total = s.rmTotal + s.convStd;
    let sumVal = 0;
    s.summaryLines.forEach(r => { sumVal += Math.abs(asNum(r.amount)); });

    let h = `<table><tr><th>สมการที่ต้องปิด</th><th class="n">จำนวน</th><th>ที่มา</th></tr>`;
    h += `<tr><td>วัตถุดิบและบรรจุภัณฑ์</td>` + numCell(s.rmTotal, 2)
      + '<td>ผลรวมบรรทัดใบเบิก</td></tr>';
    h += `<tr><td>ต้นทุนแปรสภาพ (ค่าแรง + โอเวอร์เฮด)</td>` + numCell(s.convStd, 2)
      + '<td>เอกสารปันส่วนต้นทุน</td></tr>';
    h += `<tr class="tot"><td>รวม = มูลค่าที่ Summary Cost Item ควรเป็น</td>` + numCell(total, 2)
      + '<td></td></tr>';
    const docs = {};
    s.summaryLines.forEach(r => { docs[asStr(r.tran_id)] = r; });
    const docKeys = Object.keys(docs);
    h += `<tr><td>มูลค่าที่ Summary Cost Item เป็นจริง</td>` + numCell(sumVal, 2)
      + '<td>' + (docKeys.map(k => tranLink(docs[k].recordtype, docs[k].tran_id, asStr(docs[k].doc_no))
        + ' <span class="tag">' + esc(asStr(docs[k].adj_type) || 'ไม่ระบุประเภท') + '</span>').join(' · ')
        || '<span class="bad">ไม่พบเอกสาร MFG Summary Cost ของใบสั่งผลิตนี้</span>') + '</td></tr>';
    const gap = sumVal - total;
    const bad = Math.abs(gap) > 0.01;
    h += `<tr class="${bad ? 'tot' : 'grand'}"><td>ผลต่าง</td>` + numCell(gap, 2, bad ? 'bad' : 'ok')
      + '<td>' + (bad
        ? '<span class="bad">สมการไม่ปิด — ส่วนต่างนี้จะค้างอยู่ในบัญชีงานระหว่างทำ</span>'
        : '<span class="ok">ปิดพอดี</span>') + '</td></tr>';
    // กติกา: 1 ใบสั่งผลิต = 1 ใบ MFG Summary Cost
    const nDoc = docKeys.length;
    h += `<tr><td>จำนวนเอกสาร MFG Summary Cost ของใบสั่งผลิตนี้</td>` + numCell(nDoc, 0, nDoc === 1 ? 'ok' : 'bad')
      + '<td>' + (nDoc === 1
        ? '<span class="ok">ถูกต้องตามกติกา — 1 ใบสั่งผลิตต้องมีใบเดียว</span>'
        : (nDoc === 0
          ? '<span class="bad">ไม่พบเลย — ต้นทุนยังไม่ถูกสรุปเข้า summary cost</span>'
          : '<span class="bad">ผิดกติกา — ต้องมีใบเดียวต่อหนึ่งใบสั่งผลิต ตรวจว่ามีการสร้างซ้ำ</span>'))
      + '</td></tr>';
    h += '</table>';

    if (!rows.length) return h + '<p class="warn">ไม่พบความเคลื่อนไหวบัญชีงานระหว่างทำ</p>';

    // ledger ของบัญชี WIP ราย document — ให้เห็นว่าส่วนต่างเกิดที่ใบไหน
    h += '<h3>ความเคลื่อนไหวบัญชีงานระหว่างทำ ราย เอกสาร</h3>'
      + `<table><tr><th>เอกสาร</th><th>ประเภท</th><th>วันที่</th><th>บัญชี</th>
      <th class="n">เดบิต (เข้า WIP)</th><th class="n">เครดิต (ออกจาก WIP)</th><th class="n">คงเหลือสะสม</th><th>หมายเหตุ</th></tr>`;
    let run = 0;
    rows.forEach(r => {
      const d = asNum(r.wip_debit), c = asNum(r.wip_credit);
      run += d - c;
      const nWo = ctx.docWoCount[asStr(r.tran_id)] || 0;
      h += `<tr><td>${tranLink(r.recordtype, r.tran_id, asStr(r.doc_no))}</td>
        <td>${esc(docTypeLabel(r))}</td>
        <td>${esc(asStr(r.trandate))}</td>
        <td>${esc(asStr(r.acct_no))} ${esc(asStr(r.acct_name))}</td>`
        + numCell(d, 2) + numCell(c, 2) + numCell(run, 2)
        + '<td>' + (nWo > 1
          ? '<span class="warn">เอกสารนี้อ้างถึง ' + nWo + ' ใบสั่งผลิต ยอดที่แสดงรวมใบอื่นด้วย</span>'
          : '') + '</td></tr>';
    });
    h += `<tr class="${Math.abs(run) > 0.01 ? 'tot' : 'grand'}"><td colspan="6">ยอดคงเหลือในบัญชีงานระหว่างทำของใบสั่งผลิตนี้</td>`
      + numCell(run, 2, Math.abs(run) > 0.01 ? 'bad' : 'ok')
      + '<td>' + (Math.abs(run) > 0.01
        ? '<span class="bad">ควรเป็นศูนย์เมื่อปิดงานผลิตครบ</span>' : '') + '</td></tr></table>';
    return h;
  }

  /** ชั้นที่ 2 — ไล่ย้อนกึ่งสำเร็จรูปกลับไปหา WO ที่ผลิตมัน */
  function renderLevel2(m) {
    const ctx = m.ctx;
    let h = '';
    m.root.rows.forEach(r => {
      const lots = uniq(r.lots.map(l => l.lot_id));
      const allProducers = [];
      lots.forEach(lid => {
        (m.producersByLot[asStr(lid)] || []).forEach(p => allProducers.push(p));
      });
      // เลข lot ถูกใช้ซ้ำได้ในรอบผลิตถัดไป — รอบที่ผลิตหลังวันเบิกเป็นต้นทางของยอดนี้ไม่ได้
      allProducers.forEach(p => {
        p._late = !!(r.issue_date && asStr(p.trandate_iso) && asStr(p.trandate_iso) > r.issue_date);
      });
      const producers = allProducers.filter(p => !p._late);
      const lateProducers = allProducers.filter(p => p._late);
      const roll = bomRollup(ctx, r.item_id);
      const it = ctx.itemById[asStr(r.item_id)] || {};

      if (!producers.length && !roll) {
        h += `<details><summary>${esc(r.item_code)} — ${esc(r.item_name)}
          <span class="tag">ซื้อมาใช้ตรง</span> ต้นทุน/หน่วยที่คิดเข้า WO
          <b>${esc(fmt(r.unit_cost, 8))}</b></summary>
          <div class="lvl3">${renderLedger(ctx, r.item_id, r.item_code + ' — ' + r.item_name)}</div></details>`;
        return;
      }

      const rollTxt = roll ? ' · BOM มาตรฐาน × average cost ได้ <b>' + esc(fmt(roll.unit_cost, 8)) + '</b>' : '';
      h += `<details open><summary>${esc(r.item_code)} — ${esc(r.item_name)}
        · ต้นทุน/หน่วยที่คิดเข้า WO นี้ <b>${esc(fmt(r.unit_cost, 8))}</b>${rollTxt}</summary><div class="lvl2">`;

      // ต้นทุน/หน่วยที่คิดเข้า WO คือ average cost ของตัวกึ่งสำเร็จรูปเอง ณ เวลาเบิก
      // ต้องกาง ledger ของมันให้เห็น ไม่งั้นตัวเลขนี้ไม่มีหลักฐานรองรับ
      // (เป็นตัวเลขที่ต่างจากต้นทุนรอบผลิตมากที่สุด จึงเป็นจุดที่ผู้ตรวจจะถามก่อน)
      const semiStored = asNum((ctx.itemById[asStr(r.item_id)] || {}).avg_cost);
      const moved = !closeEnough(r.unit_cost, semiStored);
      h += '<h3>ก่อนอื่น — ต้นทุน/หน่วยที่คิดเข้า WO นี้มาจากไหน</h3>'
        + '<table><tr><th>ตัวเลข</th><th class="n">ค่า</th><th>ความหมาย</th></tr>'
        + '<tr><td>อัตราที่คิดเข้า WO นี้</td>' + numCell(r.unit_cost, 10)
        + `<td>average cost ของ ${esc(r.item_code)} ณ วันเบิก (${esc(r.issue_date)})</td></tr>`
        + '<tr><td>average cost ในระบบตอนนี้</td>' + numCell(semiStored, 10)
        + '<td>ค่าปัจจุบันบนบัตรสินค้า</td></tr>'
        + '<tr class="tot"><td>ผลต่าง</td>' + numCell(semiStored - r.unit_cost, 10, moved ? 'bad' : 'ok')
        + '<td>' + (moved
          ? 'ค่าเฉลี่ยขยับหลังวันเบิก เพราะมีรอบผลิตหรือรับเข้าใหม่ — ดู ledger ข้างล่างว่าขยับที่เอกสารใบไหน'
          : 'ไม่ขยับ — อัตราที่คิดเข้า WO คือค่าเฉลี่ยเดียวกับที่ระบบเก็บอยู่ ตรวจซ้ำได้บนบัตรสินค้า')
        + '</td></tr></table>'
        + '<div class="lvl3">' + renderLedger(ctx, r.item_id, r.item_code + ' — ledger ของกึ่งสำเร็จรูปเอง') + '</div>';

      // 2ก — ไล่ตาม lot
      if (producers.length) {
        h += '<h3>ก. ไล่ตาม lot ที่เบิกจริง</h3>';
        h += `<table><tr><th>lot</th><th>ผลิตโดย</th><th>วันที่</th><th class="n">ปริมาณผลิต</th><th>ใบสั่งผลิตต้นทาง</th></tr>`;
        producers.forEach(p => {
          const lot = (r.lots.filter(l => asStr(l.lot_id) === asStr(p.lot_id))[0] || {});
          h += `<tr><td>${esc(asStr(lot.lot_no))}</td>
            <td>${tranLink(p.recordtype, p.tran_id, asStr(p.doc_no))}</td>
            <td>${esc(asStr(p.trandate))}</td>` + numCell(asNum(p.assigned_qty), 4)
            + `<td>${tranLink('workorder', p.wo_id, asStr(p.wo_no))}</td></tr>`;
        });
        h += '</table>';
        if (lateProducers.length) {
          h += '<p class="sub">ตัดออกจากการไล่ย้อน ' + lateProducers.length + ' รอบ เพราะผลิตหลังวันเบิก ('
            + esc(r.issue_date) + ') จึงไม่ใช่ต้นทางของยอดนี้: '
            + esc(uniq(lateProducers.map(p => asStr(p.wo_no) + ' ' + asStr(p.trandate_iso))).join(' · ')) + '</p>';
        }

        uniq(producers.map(p => p.wo_id)).forEach(pid => {
          const ps = m.parentWO[asStr(pid)];
          if (!ps) return;
          h += `<h3>วัตถุดิบของ ${esc(asStr(ps.wo.wo_no))} (ผลิต ${esc(r.item_code)} ได้ ${esc(fmt(ps.produced, 4))})</h3>`;
          h += renderMaterials(ps, ctx, false);
          if (ps.ca.length) {
            h += '<p class="sub">ต้นทุนแปรสภาพของใบนี้ ' + esc(fmt(ps.convStd, 2))
              + ' → ต้นทุนรวม/หน่วย <b>' + esc(fmt(ps.unitCostFull, 8)) + '</b></p>';
          }
          const gap = ps.unitCostRM - r.unit_cost;
          h += '<p class="sub">เทียบกับต้นทุน/หน่วยที่คิดเข้า WO แม่ (' + esc(fmt(r.unit_cost, 8)) + ') '
            + '<span class="' + (Math.abs(gap) > 0.01 ? 'warn' : 'ok') + '">ผลต่าง ' + esc(fmt(gap, 8)) + '</span> '
            + '— ต่างกันได้เพราะ average cost เกลี่ยจากหลายรอบผลิต</p>';
        });
      }

      // 2ข — BOM มาตรฐาน (cross-check)
      if (roll) {
        h += '<h3>ข. เทียบกับ BOM มาตรฐาน × average cost ปัจจุบัน'
          + `<span class="tag">${esc(roll.rev_name)}</span></h3>`;
        if (roll.unresolved) {
          h += '<div class="err">หาอัตราแปลงหน่วยไม่ได้ ' + roll.unresolved
            + ' รายการ — มูลค่าของรายการนั้นคิดโดยไม่แปลงหน่วย ให้ตรวจก่อนใช้อ้างอิง</div>';
        }
        if (roll.unresolvedAvg) {
          h += '<div class="err">มีวัตถุดิบ ' + roll.unresolvedAvg
            + ' รายการที่ average cost ยังตรวจไม่ผ่าน (ดูหัวข้อตรวจสุขภาพชั้นที่ 3) '
            + 'ผลรวมของตารางนี้จึงยังเชื่อไม่ได้เต็มที่ — แถวที่มีปัญหาทำเครื่องหมายไว้แล้ว</div>';
        }
        h += `<table><tr><th>รหัส</th><th>ชื่อ</th><th class="n">BOM ต่อ 1 ${esc(r.unit)}</th>
          <th>หน่วย BOM</th><th class="n">แปลงหน่วย</th><th class="n">ปริมาณ (หน่วยต้นทุน)</th>
          <th>หน่วยต้นทุน</th><th class="n">average cost</th>
          <th class="n">avg ณ ${esc(ctx.asOf)}</th><th class="n">มูลค่า</th></tr>`;
        roll.detail.forEach(c => {
          const bad = c.conv_factor == null;
          h += `<tr><td>${itemLink(c.comp_item, c.comp_code)}</td><td>${esc(c.comp_name)}</td>`
            + numCell(c.bom_qty, 8) + `<td>${esc(c.bom_unit)}</td>`
            + `<td class="n${bad ? ' bad' : ''}" title="${esc(c.conv_note)}">`
            + (bad ? 'หาไม่ได้' : esc(fmt(c.conv_factor, 8))) + '</td>'
            + numCell(c.qty_cost_unit, 8)
            + `<td>${esc(c.stock_unit)}</td>`
            + numCell(c.avg_cost, 8, c.avg_untrusted ? 'bad' : '')
            + numCell(c.avg_asof, 8)
            + numCell(c.amount, 8, c.avg_untrusted ? 'bad' : '')
            + '</tr>';
        });
        h += `<tr class="tot"><td colspan="7">ต้นทุน/หน่วยจาก BOM มาตรฐาน</td>`
          + numCell(roll.unit_cost, 10) + numCell(roll.unit_cost_asof, 10) + '<td class="n z"></td></tr>';
        // ตัวเลขนี้ควรเท่ากับที่ได้จากการไล่ lot — ถ้าต่างมากคือสัญญาณว่ามีอะไรผิด
        // ถ่วงน้ำหนักตามปริมาณที่แต่ละรอบผลิตจ่ายเข้า lot — ห้ามหยิบรอบใดรอบหนึ่งมาเทียบลอย ๆ
        // เพราะ lot หนึ่งรับของจากหลายรอบที่ต้นทุนไม่เท่ากันได้
        let wq = 0, wv = 0;
        producers.forEach(p => {
          const u = (m.parentWO[asStr(p.wo_id)] || {}).unitCostRM || 0;
          if (!u) return;
          const q = Math.abs(asNum(p.assigned_qty)) || 0;
          wq += q; wv += q * u;
        });
        if (wq) {
          const traced = wv / wq;
          const d = roll.unit_cost - traced;
          h += `<tr><td colspan="9">เทียบกับที่ไล่จาก lot ได้ ${esc(fmt(traced, 10))}`
            + (producers.length > 1 ? ' (ถ่วงน้ำหนัก ' + producers.length + ' รอบผลิต)' : '')
            + ' — ผลต่าง</td>'
            + numCell(d, 10, Math.abs(d) > 0.01 ? 'bad' : 'ok') + '</tr>';
        }
        h += '</table>';

        h += '<h3>ค. average cost ของวัตถุดิบแต่ละตัวมาจากไหน</h3>';
        roll.detail.forEach(c => {
          h += '<div class="lvl3">' + renderLedger(ctx, c.comp_item, c.comp_code + ' — ' + c.comp_name) + '</div>';
        });
      }

      h += '</div></details>';
    });
    return h;
  }

  /** ชั้นที่ 3 — ledger + ค่าเฉลี่ยเคลื่อนที่ */
  function renderLedger(ctx, itemId, label) {
    const rows = ctx.ledgerByItem[asStr(itemId)] || [];
    const it = ctx.itemById[asStr(itemId)] || {};
    const stored = asNum(it.avg_cost);
    if (!rows.length) {
      return `<details><summary>${esc(label)} — <span class="warn">ไม่พบความเคลื่อนไหว</span>
        · average cost ในระบบ ${esc(fmt(stored, 8))}</summary></details>`;
    }
    const last = rows[rows.length - 1];
    const gap = stored - asNum(last.run_avg);
    const trusted = closeEnough(asNum(last.run_avg), stored);
    const cls = trusted ? 'ok' : 'bad';
    const asof = avgAsOf(rows, ctx.asOf);
    let h = `<details><summary>${esc(label)} — ${rows.length} รายการ ·
      ค่าเฉลี่ยที่คำนวณได้ <b>${esc(fmt(asNum(last.run_avg), 8))}</b> ·
      average cost ในระบบ <b>${esc(fmt(stored, 8))}</b>
      <span class="${cls}">ผลต่าง ${esc(fmt(gap, 8))}</span>
      ${asof ? ' · ณ ' + esc(ctx.asOf) + ' <b>' + esc(fmt(asof.avg, 8)) + '</b>'
             : ' · ณ ' + esc(ctx.asOf) + ' <span class="warn">ยังไม่มีความเคลื่อนไหว</span>'}
      ${trusted ? '' : ' <span class="bad">— ยังนับไม่ครบ ห้ามใช้อ้างอิง</span>'}</summary>`;
    if (asof) {
      h += '<p class="sub">average cost ณ ' + esc(ctx.asOf) + ' = <b>' + esc(fmt(asof.avg, 10)) + '</b>'
        + ' (คงเหลือ ' + esc(fmt(asof.qty, 6)) + ' มูลค่า ' + esc(fmt(asof.val, 2))
        + ' · เอกสารสุดท้ายก่อนวันนั้น ' + esc(asof.doc) + ' ' + esc(asof.date) + ')'
        + ' — เปลี่ยนวันที่ได้ด้วยพารามิเตอร์ <code>&amp;asof=YYYY-MM-DD</code></p>';
    }
    if (!trusted) {
      const a = (ctx.auditByItem || {})[asStr(itemId)];
      const hit = a ? a.groups.filter(g => g.hits)[0] : null;
      h += '<div class="err">ledger นี้ยังนับความเคลื่อนไหวไม่ครบ จึงได้ค่าเฉลี่ยไม่ตรงกับที่ระบบเก็บ'
        + (hit ? ' — กลุ่มที่ขาดคือ <code>' + esc(hit.recordtype) + ' · mainline=' + esc(hit.mainline)
          + '</code> (นับเพิ่มแล้วได้ ' + esc(fmt(hit.whatif, 8)) + ' ซึ่งตรงพอดี)' : '')
        + ' ดูรายละเอียดที่หัวข้อ "ตรวจสุขภาพชั้นที่ 3" ท้ายรายงาน</div>';
    }
    h += `<table><tr><th>วันที่</th><th>ประเภท</th><th>เลขที่เอกสาร</th><th>คลัง</th>
      <th class="n">ปริมาณ</th><th>สกุล</th><th class="n">ยอดสกุลเอกสาร</th><th class="n">อัตราแลกเปลี่ยน</th>
      <th class="n">มูลค่าเข้าคลัง (สกุลฐาน)</th>
      <th class="n">คงเหลือสะสม</th><th class="n">มูลค่าสะสม</th><th class="n">ค่าเฉลี่ยสะสม</th></tr>`;
    rows.forEach(r => {
      const cur = asStr(r.currency);
      const foreign = !!cur && cur !== 'THB';
      h += `<tr><td>${esc(asStr(r.trandate))}</td>
        <td>${esc(docTypeLabel(r))}</td>
        <td>${tranLink(r.recordtype, r.tran_id, asStr(r.doc_no))}</td>
        <td>${esc(asStr(r.location_name))}</td>`
        + numCell(asNum(r.quantity), 6)
        + `<td class="${foreign ? 'warn' : ''}">${esc(cur)}</td>`
        + numCell(asNum(r.foreign_amount), 2)
        + (foreign ? numCell(asNum(r.exchange_rate), 6) : '<td class="n z"></td>')
        + numCell(asNum(r.amount), 2)
        + numCell(asNum(r.run_qty), 6) + numCell(asNum(r.run_val), 2) + numCell(asNum(r.run_avg), 8) + '</tr>';
    });
    return h + '</table><p class="sub">ค่าเฉลี่ยสะสม = มูลค่าสะสม ÷ คงเหลือสะสม '
      + '— นับทั้งรับเข้าและเบิกออก ซึ่งเป็นวิธีที่ NetSuite ใช้คิด average cost<br>'
      + '"มูลค่าเข้าคลัง" อ่านจากยอดที่ลงบัญชีสินทรัพย์ของสินค้า ไม่ใช่ยอดบนบรรทัดเอกสาร '
      + 'จึงเป็นสกุลฐานเสมอ และรวม landed cost ให้แล้ว — แถวที่ปริมาณเป็น 0 แต่มีมูลค่า คือ landed cost</p></details>';
  }

  /**
   * ตรวจสุขภาพ ledger — ส่วนที่บอกว่า "ตัวเลขชั้นที่ 3 ของสินค้าตัวไหนเชื่อได้/ยังเชื่อไม่ได้"
   * และถ้าเชื่อไม่ได้ ต้องนับกลุ่มไหนเพิ่ม
   */
  function renderAudit(m) {
    const ctx = m.ctx;
    const ids = Object.keys(ctx.auditByItem || {});
    if (!ids.length) return '<p class="warn">ไม่มีข้อมูลตรวจสุขภาพ</p>';

    const bad = ids.filter(id => !ctx.auditByItem[id].reconciles);
    const good = ids.length - bad.length;

    let h = `<div class="card">ตรวจแล้ว ${ids.length} รายการ ·
      <span class="ok">ค่าเฉลี่ยตรงกับระบบ ${good} รายการ</span> ·
      <span class="${bad.length ? 'bad' : 'ok'}">ยังไม่ตรง ${bad.length} รายการ</span><br>
      <span class="sub">ตัวเลขชั้นที่ 3 ของรายการที่ "ตรง" ใช้อ้างอิงได้ · รายการที่ "ยังไม่ตรง"
      ให้ดูตารางข้างล่างว่าต้องนับความเคลื่อนไหวกลุ่มไหนเพิ่ม</span></div>`;

    if (!bad.length) return h;

    // สรุปข้ามรายการว่ากลุ่มไหนคือตัวการซ้ำ ๆ — นี่คือจุดที่ควรแก้ในโค้ด
    const culprit = {};
    bad.forEach(id => {
      ctx.auditByItem[id].groups.forEach(g => {
        if (g.counted || !g.cnt_ok) return;
        const k = g.recordtype + ' · mainline=' + g.mainline;
        if (!culprit[k]) culprit[k] = { n: 0, hits: 0 };
        culprit[k].n++;
        if (g.hits) culprit[k].hits++;
      });
    });
    const keys = Object.keys(culprit).sort((a, b) => culprit[b].hits - culprit[a].hits || culprit[b].n - culprit[a].n);
    if (keys.length) {
      h += '<h3>กลุ่มที่ยังไม่ถูกนับ เรียงตามความน่าจะเป็นตัวการ</h3>'
        + '<table><tr><th>ประเภทเอกสาร · บรรทัด</th><th class="n">พบในกี่รายการที่ไม่ตรง</th>'
        + '<th class="n">นับเพิ่มแล้วตรงพอดี</th><th>สรุป</th></tr>';
      keys.forEach(k => {
        const c = culprit[k];
        h += `<tr><td><code>${esc(k)}</code></td>` + numCell(c.n, 0) + numCell(c.hits, 0)
          + '<td>' + (c.hits
            ? '<span class="bad">นับกลุ่มนี้เพิ่มแล้วค่าเฉลี่ยตรงกับระบบ — แก้ที่นี่</span>'
            : 'นับเพิ่มแล้วยังไม่ตรง ไม่ใช่ตัวการเดียว')
          + '</td></tr>';
      });
      h += '</table><p class="sub">กลุ่มที่ไม่ถูกนับคือบรรทัดที่ไม่ได้ลงบัญชีสินทรัพย์ของสินค้านี้ '
        + 'ถ้าตัวการอยู่ในกลุ่มเหล่านี้ แปลว่ามูลค่าคงคลังบางส่วนลงบัญชีอื่น ให้ตรวจผังบัญชีของสินค้า '
        + '(<code>item.assetaccount</code>) ก่อนแก้ <code>qLedger()</code></p>';
    }

    // ถ้าเส้นบัญชีให้คำตอบตรงในหลายรายการ นั่นคือทางแก้ที่ควรใช้ ไม่ใช่ไปเติม recordtype
    const withGap = bad.filter(id => ctx.auditByItem[id].qtyGap != null);
    if (withGap.length) {
      h += '<div class="card"><b>ปริมาณที่ยังนับไม่ครบ — ตัวเลขที่ต้องไปหาให้เจอ</b>'
        + '<table><tr><th>สินค้า</th><th class="n">ปริมาณที่ระบบใช้เป็นตัวหาร</th>'
        + '<th class="n">ที่ ledger นับได้</th><th class="n">ขาด</th></tr>';
      withGap.forEach(id => {
        const a = ctx.auditByItem[id];
        const it = ctx.itemById[id] || {};
        h += `<tr><td>${esc(asStr(it.item_code))} ${esc(asStr(it.item_name))}</td>`
          + numCell(a.assetHit.implied_qty, 6) + numCell(a.baseQty, 6)
          + numCell(a.qtyGap, 6, 'bad') + '</tr>';
      });
      h += '</table><span class="sub">ปริมาณคงเหลือย้อนคำนวณจาก (มูลค่าที่ลงบัญชี ÷ average cost) '
        + 'เอาตัวเลข "ขาด" ไปเทียบกับคอลัมน์รวมปริมาณของกลุ่มที่ยังไม่ถูกนับ '
        + 'จะรู้ว่าต้องนับกลุ่มไหนเพิ่ม และเพียงพอหรือยัง</span>';

      // สรุปวินิจฉัยแบบชี้เป๊ะ — อัตราส่วนบอกได้ว่าเป็นการไม่นับ หรือนับผิดเครื่องหมาย
      const dg = withGap.map(id => ctx.auditByItem[id].diagnosis).filter(Boolean);
      if (dg.length) {
        const kinds = {};
        dg.forEach(d => {
          const k = d.kind + '|' + d.group.recordtype + '|mainline=' + d.group.mainline;
          kinds[k] = (kinds[k] || 0) + 1;
        });
        h += '<p><b>วินิจฉัย</b></p><table><tr><th>อาการ</th><th>กลุ่ม</th>'
          + '<th class="n">พบกี่รายการ</th><th>ต้องแก้อะไร</th></tr>';
        Object.keys(kinds).forEach(k => {
          const p = k.split('|');
          const sign = p[0] === 'sign';
          h += '<tr><td>' + (sign
            ? '<span class="bad">ปริมาณที่ขาด = 2 เท่าของกลุ่มนี้ → นับอยู่แล้วแต่เครื่องหมายกลับ</span>'
            : '<span class="warn">ปริมาณที่ขาด = 1 เท่าของกลุ่มนี้ → ยังไม่ได้นับเลย</span>')
            + `</td><td><code>${esc(p[1])} · ${esc(p[2])}</code></td>`
            + numCell(kinds[k], 0)
            + '<td>' + (sign
              ? 'ปริมาณของกลุ่มนี้ถูกนับด้วยเครื่องหมายตรงข้าม ให้ตรวจว่าบรรทัดที่หยิบมาเป็นขาเดียวกับที่ลงบัญชีสินทรัพย์'
              : 'กลุ่มนี้ไม่ได้ลงบัญชีสินทรัพย์ของสินค้า แต่ปริมาณตรงกับส่วนที่ขาด ให้ตรวจผังบัญชี')
            + '</td></tr>';
        });
        h += '</table>';
      }
      h += '</div>';
    }

    h += '<h3>รายละเอียดต่อรายการ</h3>';
    bad.forEach(id => {
      const a = ctx.auditByItem[id];
      const it = ctx.itemById[id] || {};
      h += `<details><summary><span class="bad">ยังไม่ตรง</span>
        ${esc(asStr(it.item_code))} — ${esc(asStr(it.item_name))} ·
        คำนวณได้ <b>${esc(fmt(a.baseAvg, 8))}</b> · ระบบเก็บ <b>${esc(fmt(a.stored, 8))}</b> ·
        ผลต่าง <b>${esc(fmt(a.stored - a.baseAvg, 8))}</b></summary>
        <table><tr><th>ประเภทเอกสาร</th><th>บรรทัด</th><th class="n">บรรทัด</th>
        <th>ลงบัญชีสินทรัพย์</th><th class="n">รวมปริมาณ</th><th class="n">รวมยอดบัญชี (สกุลฐาน)</th>
        <th class="n">ยอดสกุลเอกสาร</th><th>นับใน ledger?</th><th class="n">ถ้านับเพิ่ม avg จะเป็น</th></tr>`;
      a.groups.forEach(g => {
        h += `<tr><td><code>${esc(g.recordtype)}</code></td><td>${esc(g.mainline)}</td>`
          + numCell(g.cnt_all, 0)
          + `<td>${g.posts_asset === 'Y' ? 'ใช่' : 'ไม่'}</td>`
          + numCell(g.qty_ok, 4) + numCell(g.amt_ok, 2) + numCell(g.famt, 2)
          + '<td>' + (g.counted ? '<span class="ok">นับ</span>' : '<span class="bad">ไม่นับ</span>') + '</td>'
          + (g.counted ? '<td class="n z"></td>'
            : `<td class="n${g.hits ? ' bad' : ''}" title="${esc(rawNum(g.whatif))}">`
              + esc(fmt(g.whatif, 8)) + (g.hits ? ' ✓ ตรง' : '') + '</td>')
          + '</tr>';
      });
      h += `<tr class="tot"><td colspan="4">ที่ ledger นับอยู่ตอนนี้</td>`
        + numCell(a.baseQty, 4) + numCell(a.baseVal, 2)
        + '<td class="n"></td><td></td>' + numCell(a.baseAvg, 8) + '</tr>';
      h += `<tr class="tot"><td colspan="4">ถ้านับทุกกลุ่มที่เหลือเพิ่มทั้งหมด</td>`
        + numCell(a.allQty, 4) + numCell(a.allVal, 2)
        + '<td class="n"></td><td></td>'
        + numCell(a.allAvg, 8, a.allHits ? 'ok' : 'bad')
        + '</tr>';
      h += `<tr><td colspan="8">ค่าที่ระบบเก็บ (เป้าหมาย)</td>` + numCell(a.stored, 8) + '</tr>';
      h += '</table>';

      // เส้นที่สอง — คิดจากยอดที่ลงบัญชี แทนการรวม foreignamount ของบรรทัด
      if (a.asset && a.asset.length) {
        h += '<p class="sub">ย้อนหาตัวหารที่ระบบใช้ — <b>average cost = มูลค่าคงคลัง ÷ ปริมาณคงเหลือ</b> '
          + 'เมื่อรู้มูลค่าจากบัญชีและรู้ average cost ก็คำนวณปริมาณคงเหลือย้อนกลับได้ '
          + 'เทียบกับปริมาณที่ ledger นับได้ จะเห็นตรง ๆ ว่าขาดปริมาณอีกเท่าไหร่</p>'
          + '<table><tr><th>ประเภทบัญชี</th><th>บัญชี</th><th class="n">บรรทัด</th>'
          + '<th class="n">มูลค่าที่ลงบัญชี</th><th class="n">÷ average cost = ปริมาณคงเหลือ</th><th>ผล</th></tr>';
        a.asset.forEach(x => {
          h += `<tr><td><code>${esc(x.acct_type)}</code></td>
            <td>${esc(x.acct_no)} ${esc(x.acct_name)}</td>` + numCell(x.cnt, 0)
            + numCell(x.val, 2)
            + numCell(x.implied_qty, 6, x.plausible ? 'ok' : '')
            + '<td>' + (x === a.assetHit
              ? '<span class="ok">ลงตัวเป็นปริมาณคงเหลือได้ — ใช้บัญชีนี้เป็นตัวตั้งมูลค่า</span>' : '')
            + '</td></tr>';
        });
        if (a.assetHit) {
          h += `<tr class="tot"><td colspan="4">ปริมาณที่ ledger นับได้ตอนนี้</td>`
            + numCell(a.baseQty, 6) + '<td></td></tr>';
          h += `<tr class="tot"><td colspan="4">ปริมาณที่ยังนับไม่ครบ (ต้องหาให้เจอ)</td>`
            + numCell(a.qtyGap, 6, 'bad')
            + '<td>เทียบกับกลุ่มที่ยังไม่ถูกนับในตารางบน เพื่อดูว่าปริมาณนี้อยู่ที่กลุ่มไหน</td></tr>';
        }
        h += '</table>';
      }
      h += '</details>';
    });
    return h;
  }

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

  function renderErrors() {
    const bad = QLOG.filter(q => !!q.error);
    if (!bad.length) return '';
    return '<div class="err"><b>ดึงข้อมูลไม่สำเร็จ ' + bad.length + ' ชุด — ตัวเลขบางส่วนอาจไม่ครบ</b><br>'
      + bad.map(q => esc(q.label) + ': ' + esc(q.error)).join('<br>') + '</div>';
  }

  function renderPage(m) {
    let h = CSS
      + '<div class="crumb"><a href="' + selfUrl(filterParams(m.filters))
      + '">← ภาพรวมหลายใบสั่งผลิต</a></div>'
      + '<h1>ที่มาของต้นทุนใบสั่งผลิต</h1>'
      + '<div class="sub">ไล่ที่มาของทุกตัวเลขจนถึงเอกสารต้นทาง — วัตถุดิบที่เบิก '
      + '→ ใบสั่งผลิตที่ทำกึ่งสำเร็จรูป → เอกสารรับเข้าที่ทำให้ average cost เป็นค่านั้น</div>'
      + renderForm(m.woKey, (m.ctx && m.ctx.asOf) || '', m.filters);

    if (m.notFound) return h + '<div class="err">ไม่พบใบสั่งผลิต "' + esc(m.woKey) + '"</div>' + renderQLog();
    if (!m.ok) return h + '<p>กรอกเลขที่ใบสั่งผลิตเพื่อเริ่ม</p>';

    const s = m.root;
    h += renderErrors() + renderWOHeader(s);
    h += '<h2>สรุปต้นทุนของใบสั่งผลิตนี้</h2>' + renderTotals(s, m.ctx);
    h += '<h2>กระทบยอดงานระหว่างทำ — Summary Cost Item ต้องเท่ากับ วัตถุดิบ + ต้นทุนแปรสภาพ</h2>'
      + '<div class="sub">กลไกของระบบนี้ให้ WOC เดบิต WIP ด้วย summary cost item แล้วเครดิตออกไปเป็นสินค้าสำเร็จรูป '
      + 'และให้ใบปรับ summary cost เครดิต WIP ย้ายไปบัญชีพัก · WIP จะปิดเป็นศูนย์ได้เมื่อมูลค่า summary cost item '
      + 'เท่ากับต้นทุนที่เกิดจริงเท่านั้น ส่วนต่างเท่าไหร่จะค้างใน WIP เท่านั้น</div>'
      + renderWipRecon(s, m.ctx);
    h += '<h2>ใบปิดงานผลิต</h2>' + renderWOCs(s);
    h += '<h2>ชั้นที่ 1 — วัตถุดิบที่เบิกเข้าใบสั่งผลิตนี้</h2>'
      + '<div class="sub">"ตาม BOM" คือปริมาณมาตรฐานที่ติดมากับใบสั่งผลิต · "เบิกจริง" คือยอดบนใบเบิก '
      + '· ต้นทุน/หน่วย คือ average cost ณ เวลาที่เบิก</div>'
      + renderMaterials(s, m.ctx, true);
    h += '<h2>ต้นทุนแปรสภาพที่ระบบปันส่วน</h2>' + renderCostAlloc(s);
    h += '<h2>ชั้นที่ 2 และ 3 — เจาะที่มาของแต่ละรายการ</h2>'
      + '<div class="sub">กึ่งสำเร็จรูปเป็นแบบผลิตเก็บสต็อก จึงไล่ผ่าน lot ที่เบิกจริงกลับไปหาใบสั่งผลิตต้นทาง '
      + 'และเทียบกับ BOM มาตรฐานอีกทางหนึ่ง</div>'
      + renderLevel2(m);
    h += '<h2>ตรวจสุขภาพชั้นที่ 3 — ค่าเฉลี่ยที่คำนวณตรงกับระบบหรือยัง</h2>'
      + '<div class="sub">ชั้นที่ 3 คำนวณค่าเฉลี่ยจาก ledger เอง ถ้าผลไม่ตรงกับ average cost ที่ระบบเก็บ '
      + 'แปลว่ายังนับความเคลื่อนไหวไม่ครบ ส่วนนี้ชี้ว่าขาดกลุ่มไหนและถ้านับเพิ่มแล้วจะตรงหรือไม่ '
      + 'ตัวเลขชั้นที่ 3 ของรายการที่ยังไม่ตรง อย่าใช้อ้างอิงจนกว่าจะแก้</div>'
      + renderAudit(m);
    h += '<h2>เอกสารอ้างอิงทางเทคนิค</h2>' + renderQLog();
    return h;
  }

  // ═══ entry ═════════════════════════════════════════════════════════════════

  /**
   * สองชั้น ชั้นเดียวกันคนละมุม
   *   ไม่ส่ง wo มา  → ชั้นภาพรวม หลายสินค้าหลายใบสั่งผลิต (4 คำสั่งรวมยอด)
   *   ส่ง wo มา     → ชั้นเจาะลึกใบเดียว ของเดิมทั้งหมดไม่เปลี่ยน (19 คำสั่ง ~15 วินาที)
   * ลิงก์เดิมที่มี &wo= และ &mode=json ยังทำงานเหมือนเดิม
   */
  function onRequest(ctx) {
    const p = ctx.request.parameters || {};
    // module scope อยู่ข้ามคำขอได้ในบาง execution context — ล้างก่อนทุกครั้งไม่ให้ log สะสม
    QLOG.length = 0;

    const woKey = asStr(p.wo).trim();
    const filters = readFilters(p);
    const wantJson = asStr(p.mode) === 'json';

    // ─── ชั้นภาพรวม ───────────────────────────────────────────────────────
    if (!woKey) {
      let sm;
      try {
        sm = buildSummary(filters);
      } catch (e) {
        log.error({ title: 'buildSummary', details: e.message + '\n' + (e.stack || '') });
        ctx.response.write(CSS + '<h1>ภาพรวมต้นทุนใบสั่งผลิต</h1>' + renderSummaryForm(filters)
          + '<div class="err">' + esc(e.message) + '<pre>' + esc(asStr(e.stack)) + '</pre></div>'
          + renderQLog());
        return;
      }
      if (wantJson) {
        ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        ctx.response.write(JSON.stringify({ summary: sm, qlog: QLOG }));
        return;
      }
      ctx.response.write(renderSummaryPage(sm));
      return;
    }

    // ─── ชั้นเจาะลึก ──────────────────────────────────────────────────────
    let m = { woKey: woKey, ok: false };

    try {
      m = buildModel(woKey, asStr(p.asof));
      m.woKey = woKey;
    } catch (e) {
      log.error({ title: 'buildModel', details: e.message + '\n' + (e.stack || '') });
      ctx.response.write(CSS + renderForm(woKey, '', filters)
        + '<div class="err">' + esc(e.message) + '<pre>' + esc(asStr(e.stack)) + '</pre></div>'
        + renderQLog());
      return;
    }
    // ตัวกรองของหน้าภาพรวมติดมากับลิงก์ เพื่อให้กดกลับแล้วได้รายการเดิม
    m.filters = filters;

    if (wantJson) {
      ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
      ctx.response.write(JSON.stringify({ model: m, qlog: QLOG }));
      return;
    }

    ctx.response.write(renderPage(m));
  }

  return { onRequest: onRequest };
});
