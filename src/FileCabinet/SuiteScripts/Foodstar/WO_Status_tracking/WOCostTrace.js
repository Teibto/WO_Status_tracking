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
define(['N/query', 'N/log', 'N/runtime', './WOReportTheme',
        './WOCostTrace_Common', './WOCostTrace_Ready'],
  (query, log, runtime, theme, C, R) => {

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

  // ═══ ของที่ย้ายไป WOCostTrace_Common.js แล้ว (issue #13) ═════════════
  //
  // ผูกชื่อสั้นไว้ที่นี่เพื่อให้โค้ดที่เหลือเรียก `esc(...)` `runSQL(...)` ได้เหมือนเดิม
  // การแยกไฟล์รอบนี้จึงเห็น diff เฉพาะส่วนที่ย้าย ไม่ปนกับการเปลี่ยนชื่อเรียกอีก 500 จุด
  const asStr = C.asStr;
  const asNum = C.asNum;
  const esc = C.esc;
  const rawNum = C.rawNum;
  const fmt = C.fmt;
  const numCell = C.numCell;
  const REC_URL = C.REC_URL;
  const REC_LABEL = C.REC_LABEL;
  const docTypeLabel = C.docTypeLabel;
  const tranLink = C.tranLink;
  const itemLink = C.itemLink;
  const runSQL = C.runSQL;
  const inList = C.inList;
  const groupBy = C.groupBy;
  const groupByKeys = C.groupByKeys;
  const uniq = C.uniq;
  // array ตัวเดียวกันกับที่ runSQL เขียนลง — อ่านผ่าน reference เดิมต่อไป
  const QLOG = C.QLOG;
  // ย้ายไป Common ตอน #14 — ผูกชื่อกลับมาเพื่อให้โค้ดที่เหลือเรียกเหมือนเดิม
  const CSS = C.CSS;
  const REPORT_CSS = C.REPORT_CSS;
  const pageTop = C.pageTop;
  const shell = C.shell;
  const selfUrl = C.selfUrl;
  const filterParams = C.filterParams;
  const renderQLog = C.renderQLog;
  const kpi = C.kpi;
  const KPI_ACCENT = C.KPI_ACCENT;
  const todayIso = C.todayIso;
  const uomFactor = C.uomFactor;
  const qWO = C.qWO;
  const qWOLines = C.qWOLines;
  const qUOM = C.qUOM;
  const qCostRef = C.qCostRef;
  const costRefCost = C.costRefCost;
  const costRefInEffect = C.costRefInEffect;
  const COST_REF_LABEL = C.COST_REF_LABEL;
  const COST_REF_RECTYPE = C.COST_REF_RECTYPE;
  const COST_REF_COSTS = C.COST_REF_COSTS;
  const COST_REF_OPT_FROM_RECORD = C.COST_REF_OPT_FROM_RECORD;

  // ═══ queries ═══════════════════════════════════════════════════════════════

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

  /**
   * WOC ของ WO — ปริมาณที่ผลิตได้จริง (ตัวหารของต้นทุนต่อหน่วย)
   * WOC เกิดต่อ "ขั้นตอนงาน" ไม่ใช่ต่อ batch: ใบที่ไม่ใช่ขั้นสุดท้ายมีปริมาณ 0
   * `batch_id` + `sc_ia` ใช้ตรวจว่าแต่ละ batch ที่ปิดงานมีใบ summary cost ผูกครบไหม
   */
  function qCompletions(woIds) {
    return runSQL('ใบปิดงานผลิต (WOC)', `
      SELECT TLM.createdfrom                       AS wo_id,
             WOC.id                                 AS woc_id,
             WOC.tranid                             AS woc_no,
             WOC.trandate                           AS woc_date,
             WOC.custbody_mfg_woc_good_qty          AS good_qty,
             WOC.custbody_mfg_woc_scrap_qty         AS scrap_qty,
             WOC.custbody_mfg_adjsummarycost        AS sc_ia,
             TLM.quantity                           AS fg_qty,
             TASK.name                              AS task_no,
             TASK.altname                           AS task_name,
             TASK.custrecord_mfg_tm_releasedbatch   AS batch_id,
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
             -- subsidiary อ่านจากบรรทัด เพราะบนหัวเอกสารเป็น NOT_EXPOSED (ใช้จับคู่ Cost ref)
             TL.subsidiary                               AS sub_id,
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
             -- WOC เกิดต่อ "ขั้นตอนงาน" ไม่ใช่ต่อ batch — ใบที่ไม่ใช่ขั้นสุดท้ายมีปริมาณ 0
             -- ใบที่มีปริมาณจึงเท่ากับจำนวน batch ที่ปิดงานเสร็จ = ฐานของจำนวนใบ summary cost
             -- (WO-FSC-00000227: WOC 30 ใบ · มีปริมาณ 10 ใบ · batch 10 batch)
             COUNT(DISTINCT CASE WHEN NVL(TLM.quantity, 0) <> 0 THEN WOC.id END) AS woc_fg_count,
             -- ใบ summary cost ที่ใบปิดงานอ้างถึง — เงื่อนไขต้องตรงกับ summaryLink() ของชั้นเจาะลึกทุกข้อ
             -- นับเฉพาะใบปิดงานที่มีปริมาณ และ id ที่ปั๊มไว้ต้องเป็นใบ summary cost จริง
             -- (engine ใช้ field เดียวกันปั๊ม move adjustment ด้วย · เงื่อนไข "เป็นใบ summary cost"
             --  ต้องเป็นชุดเดียวกับ qSummarySummaryCost คือประเภทเอกสาร หรือ ตัวสินค้า)
             -- วัดบน SB1: เดือน 07/2026 236 ใบ ใช้ 831 ms — ราคาไม่แพงพอที่จะยอมให้สองชั้นต่างกัน
             COUNT(DISTINCT CASE WHEN NVL(TLM.quantity, 0) <> 0
                                  AND EXISTS (SELECT 1 FROM transaction SCT
                                              LEFT JOIN transactionline SCL ON SCL.transaction = SCT.id
                                              LEFT JOIN item SCI ON SCI.id = SCL.item
                                              LEFT JOIN customrecord_thl_adjustmenttype SCA
                                                ON SCA.id = SCT.custbody_thl_adjustmenttype
                                              WHERE SCT.id = WOC.custbody_mfg_adjsummarycost
                                                AND (NVL(SCA.custrecord_adjt_mfgsummarycost, 'F') = 'T'
                                                     OR NVL(SCI.custitem_mfg_summarycostitem, 'F') = 'T'))
                                 THEN WOC.custbody_mfg_adjsummarycost END) AS woc_sc_linked,
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
   * ใช้หาผลต่างที่ค้างใน WIP และตรวจว่ามีใบตีราคาซ้ำหรือไม่
   *
   * ⚠ ไม่ใช่กติกา "1 ใบสั่งผลิต = 1 ใบ" — engine สร้างใบ summary cost ใหม่ทุกครั้งที่ปิดงาน
   * WO ที่แตกหลาย batch จึงต้องมีได้ตามจำนวน batch ที่ปิดงานเสร็จ ตัวชี้ขาดคือ **การผูก**:
   * ใบที่มีมูลค่าแต่ไม่มีใบปิดงานใดอ้างถึง (`custbody_mfg_adjsummarycost`) = ใบตีราคาซ้ำ
   * รูป NOT EXISTS นี้คือรูปเดียวกับที่ engine ใช้ใน `findUnconsumedSummaryIA`
   */
  function qSummarySummaryCost(woIds) {
    if (!woIds.length) return [];
    return runChunked(woIds, part => runSQL('ภาพรวม — Summary Cost Item', `
      SELECT TL.custcol_mfg2_ref_workorder AS wo_id,
             SUM(ABS(NVL(TL.foreignamount, 0))) AS sc_value,
             COUNT(DISTINCT T.id)              AS sc_docs,
             -- แยกใบที่มีมูลค่าจริงออกจากใบเปล่า: SB1 มีใบ MFG Summary Cost มูลค่า 0 สร้างซ้ำอยู่จำนวนมาก
             -- (เจอจริง 25 จาก 197 ใบในเดือน 07/2026) ถ้านับรวมกันธงเตือนจะกลายเป็น noise
             COUNT(DISTINCT CASE WHEN NVL(TL.foreignamount, 0) <> 0 THEN T.id END) AS sc_docs_valued,
             -- ใบมีมูลค่าที่ไม่มีใบปิดงานอ้างถึงเลย = ตีราคาซ้ำจริง (ทดสอบรูปนี้บน SB1 แล้ว รองรับ)
             COUNT(DISTINCT CASE WHEN NVL(TL.foreignamount, 0) <> 0
                                  AND NOT EXISTS (SELECT 1 FROM transaction W
                                                  WHERE W.recordtype = 'workordercompletion'
                                                    AND W.custbody_mfg_adjsummarycost = T.id)
                                 THEN T.id END) AS sc_docs_orphan
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

  function classifyCostRef(all, subId, dateIso) {
    if (!all || all.failed) return { verdict: 'unknown', rows: [], cost: 0 };
    const rows = (all.rows || []).filter(r => costRefInEffect(r, subId, dateIso));
    if (!rows.length) return { verdict: 'nomatch', rows: [], cost: 0 };
    let cost = 0;
    rows.forEach(r => { cost += costRefCost(r); });
    if (cost > 0) return { verdict: 'has', rows: rows, cost: cost };
    if (rows.some(r => asStr(r.cr_option) !== COST_REF_OPT_FROM_RECORD)) {
      return { verdict: 'rate', rows: rows, cost: 0 };
    }
    return { verdict: 'zero', rows: rows, cost: 0 };
  }

  /** เลข Cost ref ที่จับคู่ได้ — ใส่ในหมายเหตุให้ตามไปเปิด record ตรวจเองได้ */
  function costRefIds(cr) {
    return uniq((cr.rows || []).map(r => r.cr_id)).join(', ');
  }

  /**
   * ข้อความบอกต้นทุนที่ตั้งไว้ — บอกเป็นตัวเลขได้เฉพาะตอนที่ตัวเลขนั้นมีความหมายเดียว
   *
   * ห้ามบอกผลรวมของหลายแถว: แต่ละแถวมีปริมาณอ้างอิง (`custrecord_qty`) ของตัวเอง
   * ผลรวมดิบจึงไม่ใช่ต้นทุนของอะไรทั้งนั้น (เจอจริงบน SB1: 6 แถวรวมได้ 56.04 ซึ่งอ่านผิดได้ทันที)
   * แถว option 1 ก็บอกยอดไม่ได้ เพราะ engine ไม่ได้ใช้ช่องต้นทุนบน record ใบนั้น
   * กรณีที่บอกไม่ได้ ให้บอก "มีต้นทุนตั้งไว้ n แถว" ซึ่งเป็นข้อเท็จจริงที่พอสำหรับการตัดสินใจ
   */
  function costRefAmountText(cr) {
    const withCost = (cr.rows || []).filter(r => costRefCost(r) > 0);
    if (withCost.length === 1 && asStr(withCost[0].cr_option) === COST_REF_OPT_FROM_RECORD) {
      return 'ตั้งต้นทุนไว้ ' + fmt(costRefCost(withCost[0]), 2)
        + ' ต่อปริมาณอ้างอิง ' + fmt(asNum(withCost[0].ref_qty), 4);
    }
    return 'มีต้นทุนตั้งไว้ ' + withCost.length + ' แถว';
  }

  /**
   * หมายเหตุเมื่อใบสั่งผลิตไม่มีต้นทุนแปรสภาพ — เลือกข้อความตามคำตัดสินของ Cost ref
   * ใช้ทั้งชั้นภาพรวมและชั้นเจาะลึก เพื่อให้สองชั้นตอบเรื่องเดียวกันเหมือนกัน
   */
  function costRefNote(cr) {
    if (cr.verdict === 'zero') {
      return { cls: 'info', text: 'ไม่มีต้นทุนแปรสภาพตามการตั้งค่า — Cost ref '
        + costRefIds(cr) + ' ตั้งต้นทุนไว้เป็น 0/ว่างทุกช่อง' };
    }
    if (cr.verdict === 'has') {
      return { cls: 'warn', text: 'ยังไม่ปันส่วนต้นทุนแปรสภาพ — Cost ref ' + costRefIds(cr)
        + ' ' + costRefAmountText(cr) };
    }
    if (cr.verdict === 'rate') {
      return { cls: 'warn', text: 'ยังไม่ปันส่วนต้นทุนแปรสภาพ — Cost ref ' + costRefIds(cr)
        + ' คิดจาก Set Up Rate จึงดูจากช่องต้นทุนบน record ไม่ได้' };
    }
    if (cr.verdict === 'nomatch') {
      return { cls: 'warn', text: 'ยังไม่ปันส่วนต้นทุนแปรสภาพ — จับคู่ Cost ref ไม่ได้เลย '
        + '(ไม่มีแถวที่ตรงทั้งสินค้า บริษัท และช่วงวันที่)' };
    }
    return { cls: 'warn', text: 'ยังไม่ปันส่วนต้นทุนแปรสภาพ (อ่าน Cost ref ไม่สำเร็จ — ดูท้ายหน้า)' };
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
   * จับคู่ใบ MFG Summary Cost กับใบปิดงานผลิต — ตัวตัดสินว่า "ซ้ำ" หรือ "ครบ"
   *
   * WO ที่แตกหลาย batch มีใบ summary cost ได้ใบต่อ batch ที่ปิดงานเสร็จ จำนวนใบจึงบอกอะไรไม่ได้
   * สิ่งที่บอกได้คือการผูกผ่าน `workordercompletion.custbody_mfg_adjsummarycost`
   *   · ใบมีมูลค่าที่ไม่มีใบปิดงานอ้างถึง = ตีราคาซ้ำ (`orphanDocs`)
   *   · ใบปิดงานที่มีปริมาณแต่ไม่มีใบ summary cost ผูก = ต้นทุน batch นั้นยังไม่ถูกสรุป (`unlinkedWocs`)
   *
   * ⚠ `custbody_mfg_adjsummarycost` ถูก engine ใช้ปั๊ม move adjustment ด้วย (`createWOMoveAdj`)
   * ค่าที่ไม่ว่างจึงไม่ได้แปลว่าเป็นใบ summary cost — ต้อง intersect กับชุด id ที่เป็น summary cost จริง
   */
  function summaryLink(summaryLines, wocs) {
    const valueByDoc = {};
    (summaryLines || []).forEach(r => {
      const k = asStr(r.tran_id);
      valueByDoc[k] = (valueByDoc[k] || 0) + Math.abs(asNum(r.amount));
    });
    const isSummaryDoc = {};
    Object.keys(valueByDoc).forEach(k => { isSummaryDoc[k] = true; });

    // ปิดงาน "หนึ่งรอบ" = ใบปิดงานที่มีปริมาณ (ใบขั้นตอนกลางมีปริมาณ 0 ไม่ได้ตีราคา)
    const fgWocs = (wocs || []).filter(w => asNum(w.fg_qty) !== 0);
    const linked = {};
    const unlinkedWocs = [];
    fgWocs.forEach(w => {
      const ia = asStr(w.sc_ia);
      if (ia && isSummaryDoc[ia]) linked[ia] = true;
      else unlinkedWocs.push(w);
    });

    const orphanDocs = Object.keys(valueByDoc)
      .filter(k => valueByDoc[k] > 0.005 && !linked[k]);

    return {
      docs: Object.keys(valueByDoc).length,
      valuedDocs: Object.keys(valueByDoc).filter(k => valueByDoc[k] > 0.005).length,
      fgWocs: fgWocs.length,
      linkedDocs: Object.keys(linked).length,
      orphanDocs: orphanDocs,
      unlinkedWocs: unlinkedWocs,
      valueByDoc: valueByDoc
    };
  }

  /**
   * แยกส่วนผลต่าง summary cost — ชี้ว่าผลต่างมาจากการนับยอดใบเบิกวัตถุดิบซ้ำหรือไม่
   *
   * เคสที่ผู้ใช้ชี้ (WO-FSC-00000227 บน SB1) ฝั่งสร้างใบ summary cost คิดยอดแต่ละใบเป็น
   *   `ยอดใบเบิกวัตถุดิบทั้งก้อน + ต้นทุนแปรสภาพของ batch นั้น`
   * ใบเบิกมีใบเดียวไม่ได้แยกตาม batch ยอดวัตถุดิบจึงถูกนับซ้ำเท่าจำนวน batch
   * ทั้งที่ควรนับครั้งเดียว → ส่วนเกิน `(จำนวนใบ − 1) × ยอดวัตถุดิบ` ค้างใน WIP
   *
   * ⚠ นี่คือบั๊กของ **ฝั่ง engine ที่สร้างใบ summary cost** (repo Pwoc_gen_completion) ซึ่งกำลังแก้อยู่
   * รายงานนี้มีหน้าที่ชี้จุดและแยกยอดให้เห็น ไม่ได้แก้ตัวเลข
   *
   * ตรวจสอบด้วยข้อมูลจริง WO-FSC-00000227: วัตถุดิบ 173,138.54 (ใบเบิกใบเดียว) ·
   * แปรสภาพ 60,710 · 10 batch · 10 ใบ summary cost รวม 1,789,106.60
   *   9 ใบแรก 179,396.34 = 173,138.54 + 6,257.80 (แปรสภาพของ batch นั้น) — ตรงทุกหลัก
   *   ใบสุดท้าย 174,539.54 = 173,138.54 + 1,401.00 ขณะที่แปรสภาพของ batch นั้น 4,389.80 (ขาด 2,988.80)
   *   ผลต่าง 1,555,258.06 = 9 × 173,138.54 − 2,988.80 — ปิดพอดี
   */
  function explainSummaryGap(s, ctx) {
    const lk = s.summaryLink;
    const gap = (function () {
      let v = 0;
      s.summaryLines.forEach(r => { v += Math.abs(asNum(r.amount)); });
      return v - (s.rmTotal + s.convStd);
    })();

    // ต้นทุนแปรสภาพต่อ batch — เอกสารปันส่วนอ้าง WOC ราย ขั้นตอน ซึ่งผูก batch อยู่แล้ว
    const batchByWoc = {}, wocsByBatch = {};
    (s.wocs || []).forEach(w => {
      const b = asStr(w.batch_id);
      batchByWoc[asStr(w.woc_id)] = b;
      if (!wocsByBatch[b]) wocsByBatch[b] = [];
      wocsByBatch[b].push(w);
    });
    const convByBatch = {};
    (s.ca || []).forEach(r => {
      if (asNum(r.cost_class) === CLASS_WIP) return;  // ยอดรวม ไม่ใช่องค์ประกอบ
      const b = batchByWoc[asStr(r.woc_id)];
      if (b == null) return;
      convByBatch[b] = (convByBatch[b] || 0) + asNum(r.std_cost);
    });

    // ใบไหนเป็นของ batch ไหน — ผ่านใบปิดงานที่อ้างใบนั้น
    const batchByDoc = {};
    (s.wocs || []).forEach(w => {
      const ia = asStr(w.sc_ia);
      if (ia && lk.valueByDoc[ia] != null) batchByDoc[ia] = asStr(w.batch_id);
    });

    const docMeta = {};
    s.summaryLines.forEach(r => { docMeta[asStr(r.tran_id)] = r; });
    const rows = Object.keys(lk.valueByDoc)
      .filter(k => lk.valueByDoc[k] > 0.005)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => {
        const amt = lk.valueByDoc[k];
        const batch = batchByDoc[k];
        // มีค่าแปรสภาพของ batch นี้จริงหรือไม่ — batch ที่หาไม่ได้ต้องไม่กลายเป็นศูนย์เงียบ ๆ
        const hasConv = batch != null && convByBatch[batch] != null;
        const conv = hasConv ? convByBatch[batch] : null;
        return {
          tran_id: k,
          doc_no: asStr((docMeta[k] || {}).doc_no),
          recordtype: asStr((docMeta[k] || {}).recordtype),
          batch_id: batch == null ? '' : batch,
          amount: amt,
          less_rm: amt - s.rmTotal,          // ส่วนที่เหลือหลังหักยอดวัตถุดิบทั้งก้อน
          conv_batch: conv,
          conv_diff: hasConv ? (amt - s.rmTotal) - conv : null
        };
      });

    // ลายเซ็นของอาการ: ทุกใบมีมูลค่ามากกว่าหรือเท่ากับยอดวัตถุดิบทั้งก้อน และมีมากกว่าหนึ่งใบ
    const n = rows.length;
    const rmCountedIn = rows.filter(r => r.less_rm > -0.005).length;
    const detected = n > 1 && s.rmTotal > 0.005 && rmCountedIn === n;
    const overCount = detected ? (n - 1) * s.rmTotal : 0;

    return {
      gap: gap,
      rows: rows,
      docs: n,
      rmTotal: s.rmTotal,
      rmDocs: (s.issueDocs || []).length,
      detected: detected,
      overCount: overCount,
      residual: gap - overCount,
      // ส่วนที่การนับซ้ำอธิบายได้ คิดเป็นสัดส่วนของผลต่าง — ห้ามหารด้วยศูนย์
      share: Math.abs(gap) > 0.005 ? overCount / gap : null
    };
  }

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
    // จำนวนใบ summary cost = จำนวน batch ที่ปิดงานเสร็จ ไม่ใช่ 1 ใบต่อ WO
    // (สรุปกติกาจริงไว้ที่ qSummarySummaryCost) การตรวจอยู่ที่ summaryLink() ด้านล่าง
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

    // Cost ref ของสินค้าที่ผลิต — ใช้อธิบายว่าที่ไม่มีต้นทุนแปรสภาพนั้นเป็นการตั้งค่าหรือเป็นงานค้าง
    // จับคู่ด้วยบริษัทจากบรรทัดสินค้า และวันที่ของใบสั่งผลิตใบนี้ (เงื่อนไขเดียวกับชั้นภาพรวม)
    const wo = ctx.woById[woId] || {};
    const costRef = classifyCostRef(
      { rows: (ctx.costRefByItem || {})[asStr(fg && fg.item_id)] || [],
        failed: !!(ctx.costRefAll && ctx.costRefAll.failed) },
      fg && fg.sub_id, asStr(wo.wo_date_iso));

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
      costRef: costRef,
      summaryLines: summaryLines,
      summaryDocs: summaryDocs,
      summaryLink: summaryLink(summaryLines, wocs),
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
               TO_CHAR(WO.trandate, 'YYYY-MM-DD') AS wo_date_iso,
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
    // ── Cost ref ของสินค้าที่ผลิต (ทั้ง WO แม่และ WO ต้นทางของกึ่งสำเร็จรูป) ──
    const fgItemIds = uniq(lines.filter(r => asStr(r.mainline) === 'T').map(r => r.item_id));
    ctx.costRefAll = qCostRef(fgItemIds);
    ctx.costRefByItem = groupBy(ctx.costRefAll.rows, 'item_id');

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
    // Cost ref ดึงตามสินค้า (ไม่ใช่ตามใบ) แล้วจับคู่บริษัท/วันที่ของแต่ละใบใน JS
    const crAll = qCostRef(uniq(use.map(r => r.item_id)));
    const crByItem = groupBy(crAll.rows, 'item_id');

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
      const scDocsOrphan = asNum((sc[id] || {}).sc_docs_orphan);

      const rmDocs = asNum((rm[id] || {}).doc_count);
      const wocCount = asNum((prod[id] || {}).woc_count);
      const wocFgCount = asNum((prod[id] || {}).woc_fg_count);
      const wocScLinked = asNum((prod[id] || {}).woc_sc_linked);
      const wocInRange = asNum((prod[id] || {}).woc_in_range);

      const notes = [];
      if (!wocQty) notes.push({ cls: 'warn', text: 'ยังไม่มีใบปิดงานผลิต' });
      // ยอดผลิตได้นับ WOC ทุกใบเพื่อให้ตรงกับชั้นเจาะลึก ถ้าปิดงานคร่อมช่วงต้องบอกให้รู้
      if (range && wocCount > wocInRange && wocInRange > 0) {
        notes.push({ cls: 'warn', text: 'ปิดงานคร่อมช่วง ' + (wocCount - wocInRange)
          + ' จาก ' + wocCount + ' ใบอยู่นอกช่วง (ยอดผลิตได้รวมทุกใบ)' });
      }
      if (!rmCost) notes.push({ cls: 'warn', text: 'ยังไม่มีใบเบิกวัตถุดิบ' });
      // ไม่มีต้นทุนแปรสภาพ ≠ ผิดเสมอ — ให้ Cost ref เป็นตัวตัดสินว่าเป็นการตั้งค่าหรือเป็นงานค้าง
      const cr = classifyCostRef(
        { rows: crByItem[asStr(h.item_id)] || [], failed: crAll.failed },
        h.sub_id, asStr(h.wo_date_iso));
      if (!dlOh) notes.push(costRefNote(cr));
      if (scDocs === 0) notes.push({ cls: 'warn', text: 'ยังไม่มีใบ MFG Summary Cost' });
      // จำนวนใบ summary cost ไม่ได้ผิดเพราะ "เกิน 1" — WO ที่แตกหลาย batch ต้องมีได้ใบต่อ batch
      // ตัวชี้ขาดคือการผูก: ใบมีมูลค่าที่ไม่มีใบปิดงานอ้างถึง = ตีราคาซ้ำ · ใบมูลค่า 0 = เอกสารเปล่าค้าง
      // ⚠ ทุกธงต้องมี wocCount > 0 คุมไว้ — query พังคืนแถวว่างอ่านเป็น 0 ไม่งั้นทุกใบขึ้นแดงพร้อมกัน
      if (scDocsOrphan > 0) {
        notes.push({ cls: 'bad', text: 'ใบ MFG Summary Cost ที่มีมูลค่าแต่ไม่มีใบปิดงานอ้างถึง '
          + scDocsOrphan + ' ใบ (มีมูลค่าทั้งหมด ' + scDocsValued + ' ใบ · ปิดงานผลิต '
          + wocFgCount + ' รอบ) — ตีราคาซ้ำ' });
      }
      // ปิดงานแล้วแต่ยังไม่มีใบ summary cost ผูก = ต้นทุนรอบนั้นยังไม่ถูกสรุป (คนละอาการกับซ้ำ)
      if (wocCount > 0 && wocFgCount > 0 && wocScLinked < wocFgCount) {
        notes.push({ cls: 'bad', text: 'ปิดงานผลิต ' + wocFgCount + ' รอบ แต่มีใบ MFG Summary Cost ผูกแค่ '
          + wocScLinked + ' ใบ — ต้นทุนอีก ' + (wocFgCount - wocScLinked) + ' รอบยังไม่ถูกสรุป' });
      }
      if (scDocs > scDocsValued) {
        notes.push({ cls: 'warn', text: 'ใบ MFG Summary Cost มูลค่า 0 ค้างอยู่ ' + (scDocs - scDocsValued)
          + ' ใบ (รวม ' + scDocs + ' ใบ) — ไม่กระทบยอด' });
      }
      // แยกส่วนผลต่าง: ฝั่งสร้างใบ summary cost ใส่ยอดวัตถุดิบทั้งก้อนลงทุกใบ ทั้งที่ควรนับครั้งเดียว
      // เป็นประเด็นของ engine ที่สร้างเอกสาร (repo Pwoc_gen_completion) รายงานนี้ทำหน้าที่ชี้จุด
      // ⚠ เงื่อนไขต้องมี scDocsValued > 1 และมียอดวัตถุดิบ ไม่งั้นสูตรนี้อธิบายอะไรไม่ได้
      const scGap = scValue - cost;
      if (scDocsValued > 1 && rmCost > 0.005 && Math.abs(scGap) > 0.01) {
        const over = (scDocsValued - 1) * rmCost;
        notes.push({ cls: 'warn', text: 'ผลต่าง ' + fmt(scGap, 2) + ' อธิบายได้ด้วยยอดใบเบิกวัตถุดิบ '
          + fmt(rmCost, 2) + ' (ใบเบิก ' + rmDocs + ' ใบ) ถูกนับซ้ำใน ' + scDocsValued
          + ' ใบ summary cost — นับเกิน ' + fmt(over, 2)
          + ' คิดเป็น ' + fmt(over / scGap * 100, 1) + '% ของผลต่าง · ประเด็นฝั่งสร้างเอกสาร' });
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
        woc_fg_count: wocFgCount,
        woc_sc_linked: wocScLinked,
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
        sc_docs_orphan: scDocsOrphan,
        rm_docs: rmDocs,
        // ยอดวัตถุดิบที่ถูกนับซ้ำในใบ summary cost — 0 = ไม่เข้าลายเซ็นอาการนี้
        sc_rm_overcount: (scDocsValued > 1 && rmCost > 0.005) ? (scDocsValued - 1) * rmCost : 0,
        sc_gap: scValue - cost,
        cost_ref: { verdict: cr.verdict, cost: cr.cost, ids: costRefIds(cr), rows: cr.rows.length },
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
      <button type="submit" class="btn primary">ตรวจที่มาของต้นทุน</button>
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
      &nbsp;<button type="submit" class="btn primary">ดูภาพรวม</button>
      <div class="sub" style="margin-top:6px">
        เลือกเดือนแล้วช่องวันที่จะถูกคิดจากเดือนนั้นทั้งเดือน · จะระบุช่วงเองให้เลือก "กำหนดวันที่เอง" ในช่องเดือน
        · ค่าเริ่มต้นจับจากวันที่ปิดงานผลิต เพราะต้นทุนเกิดตอนปิดงาน ไม่ใช่ตอนสั่งผลิต
      </div>
    </form>`;
  }

  function renderSummaryKpis(sm) {
    let rm = 0, dl = 0, cost = 0, gap = 0, gapAbs = 0, gapCount = 0;
    let noWoc = 0, noIssue = 0, flagged = 0, noConv = 0, convByDesign = 0;
    sm.rows.forEach(r => {
      // ใบที่ไม่มีต้นทุนแปรสภาพ แยกสองพวก: ตั้งค่าไว้ว่าไม่มี (ไม่ต้องทำอะไร) กับยังไม่ได้ปันส่วน (งานค้าง)
      if (!r.dl_oh_cost) {
        if (r.cost_ref && r.cost_ref.verdict === 'zero') convByDesign++;
        else noConv++;
      }
      rm += r.rm_cost; dl += r.dl_oh_cost; cost += r.cost;
      gap += r.sc_gap;
      // ผลต่างสุทธิกลบกันเองได้ (+600,000 กับ −600,000 = 0 ทั้งที่ผิดสองใบ)
      // จึงต้องบอกจำนวนใบที่ไม่ปิดและผลรวมค่าสัมบูรณ์ควบไปด้วย
      if (Math.abs(r.sc_gap) > 0.01) { gapCount++; gapAbs += Math.abs(r.sc_gap); }
      if (!r.woc_qty) noWoc++;
      if (!r.rm_cost) noIssue++;
      if (r.notes.some(n => n.cls === 'bad')) flagged++;
    });
    // ผลต่างสุทธิกับค่าสัมบูรณ์แยกเป็นค่าและคำขยาย ไม่ยัดสองเลขในช่องเดียวแล้วย่อฟอนต์เอง
    return '<div class="kpi-grid">'
      + kpi('ใบสั่งผลิต', esc(String(sm.shown)), null,
        sm.truncated ? 'จาก ' + esc(String(sm.total)) + ' ใบที่เข้าเงื่อนไข' : '')
      + kpi('รวมวัตถุดิบและบรรจุภัณฑ์', esc(fmt(rm, 2)))
      + kpi('รวมต้นทุนแปรสภาพ', esc(fmt(dl, 2)))
      + kpi('รวมต้นทุนการผลิต', esc(fmt(cost, 2)))
      + kpi('ใบที่ Summary Cost ไม่ปิด', esc(String(gapCount)), gapCount ? 'bad' : 'ok',
        'จาก ' + esc(String(sm.shown)) + ' ใบ')
      + kpi('ผลต่างสุทธิ', esc(fmt(gap, 0)), gapCount ? 'bad' : 'ok',
        'รวมค่าสัมบูรณ์ ' + esc(fmt(gapAbs, 0)))
      + kpi('ยังไม่เบิกวัตถุดิบ', esc(String(noIssue)), noIssue ? 'warn' : 'ok')
      + kpi('ยังไม่ปิดงานผลิต', esc(String(noWoc)), noWoc ? 'warn' : 'ok')
      + kpi('ยังไม่ปันส่วนแปรสภาพ', esc(String(noConv)), noConv ? 'warn' : 'ok',
        convByDesign ? 'ไม่มีตามการตั้งค่าอีก ' + esc(String(convByDesign)) + ' ใบ' : '')
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
        + `<div class="nsrec"><a href="${selfUrl(Object.assign(filterParams(sm.filters), { ready: r.wo_no }))}"
              title="ตรวจว่า master ของสายการผลิตใบนี้ตั้งครบหรือยัง">ตรวจความพร้อม master</a></div>`
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

  // ═══ export Excel — ชั้นภาพรวม ═════════════════════════════════════════════

  /**
   * คอลัมน์ของไฟล์ Excel — หัวและลำดับต้องตรงกับตารางในหน้าภาพรวม (renderSummaryGrid)
   * ทุกช่องที่เป็นตัวเลขต้องส่งค่าดิบ ไม่ใช่ข้อความที่จัดรูปแบบแล้ว ไม่งั้น Excel เอาไปบวกต่อไม่ได้
   * วันที่ส่งเป็นเลขวันที่ของ Excel (serial) ให้ sort และลบกันได้จริง ไม่ใช่ข้อความ d/m/yyyy
   * ไฟล์นี้ไม่มีแถวรวมกลุ่มและแถวรวมท้ายตารางโดยตั้งใจ — แถวรวมแทรกกลางทำให้ sort/filter ใน Excel พัง
   */
  const SUMMARY_EXPORT_COLS = [
    { head: 'ใบสั่งผลิต', w: 16, get: r => asStr(r.wo_no) },
    { head: 'วันที่ WO', w: 12, fmt: 'yyyy-mm-dd', get: r => excelDate(r.wo_date_iso) },
    { head: 'ปิดงานผลิต', w: 12, fmt: 'yyyy-mm-dd', get: r => excelDate(r.woc_last_iso) },
    { head: 'รหัสสินค้า', w: 15, get: r => asStr(r.item_code) },
    { head: 'ชื่อสินค้า', w: 34, get: r => asStr(r.item_name) },
    { head: 'สั่งผลิต', w: 13, fmt: '#,##0.0000', get: r => xlNum(r.wo_qty) },
    { head: 'ผลิตได้ (WOC)', w: 13, fmt: '#,##0.0000', get: r => xlNum(r.woc_qty) },
    { head: 'วัตถุดิบ', w: 14, fmt: '#,##0.00', get: r => xlNum(r.rm_cost) },
    { head: 'แปรสภาพ (DL+OH)', w: 16, fmt: '#,##0.00', get: r => xlNum(r.dl_oh_cost) },
    { head: 'รวมต้นทุน', w: 14, fmt: '#,##0.00', get: r => xlNum(r.cost) },
    { head: 'ต้นทุน/หน่วย', w: 14, fmt: '#,##0.00000000', get: r => xlNum(r.cost_per_unit) },
    { head: 'ต้นทุน/ลัง', w: 14, fmt: '#,##0.00000000', get: r => xlNum(r.cost_per_carton) },
    { head: 'Summary Cost Item', w: 16, fmt: '#,##0.00', get: r => xlNum(r.sc_value) },
    { head: 'ผลต่าง', w: 14, fmt: '#,##0.00', get: r => xlNum(r.sc_gap) },
    { head: 'หมายเหตุ', w: 60, get: r => (r.notes || []).map(n => asStr(n && n.text)).filter(Boolean).join(' · ') }
  ];

  /** วันที่ ISO → เลขวันที่ของ Excel (นับจาก 1899-12-30) · ไม่มีวันที่คืนช่องว่าง ไม่ใช่ศูนย์ */
  function excelDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(asStr(iso));
    if (!m) return '';
    return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  /**
   * ค่าที่จะเขียนลงช่องตัวเลข
   * null (ยังไม่ปิดงานผลิต) และ Infinity/NaN (ไม่ได้ตั้ง basepercarton → หารด้วยศูนย์)
   * ต้องกลายเป็นช่องว่าง — เขียนลงไปตรง ๆ จะได้ไฟล์ที่ Excel เปิดแล้วฟ้องว่าเสีย
   */
  function xlNum(v) {
    return (v == null || typeof v !== 'number' || !isFinite(v)) ? '' : v;
  }

  /**
   * ชื่อไฟล์ต้องบอกได้ว่ามาจากรายงานไหนและกรองช่วงไหน · เวลาที่ export ต่อท้ายฝั่งเบราว์เซอร์
   * ตั้งใจใช้ ASCII ล้วน — ไฟล์พวกนี้ถูกส่งอีเมลและอัปโหลดต่อ ชื่อไทยเพี้ยนได้ตามระบบปลายทาง
   */
  function summaryExportName(f) {
    const k = f || {};
    const scope = k.wono ? 'WO-' + asStr(k.wono).replace(/[^0-9A-Za-z_-]/g, '')
      : (k.month ? asStr(k.month) : asStr(k.from) + '_to_' + asStr(k.to));
    return 'WOCostTrace_Summary_' + scope;
  }

  /**
   * ข้อมูลสำหรับสร้างไฟล์ Excel — ฟังก์ชันบริสุทธิ์ ไม่แตะ DOM ไม่แตะ NetSuite
   * รับ model ตัวเดียวกับที่ตารางบนหน้าจอใช้ จึงได้ผลลัพธ์ตามตัวกรอง ณ ขณะที่หน้าถูกสร้างเสมอ
   */
  function summaryExportData(sm) {
    const rows = (sm.rows || []).map(r => SUMMARY_EXPORT_COLS.map(c => c.get(r)));
    return {
      filebase: summaryExportName(sm.filters),
      sheet: 'ภาพรวมต้นทุน',
      headers: SUMMARY_EXPORT_COLS.map(c => c.head),
      cols: SUMMARY_EXPORT_COLS.map(c => ({ w: c.w, fmt: c.fmt || '' })),
      rows: rows
    };
  }

  /** ตัวสร้าง xlsx ฝั่งเบราว์เซอร์ — ตัวเดียวกับที่รายงาน MFG WO GL ใช้อยู่บนบัญชีนี้ */
  const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';

  /**
   * ปุ่ม export + ข้อมูลของตารางฝังมากับหน้า
   * ฝังข้อมูลแทนการยิง mode=json ใหม่ตอนกด เพราะการยิงใหม่รันคำสั่งรวมยอดอีกรอบ
   * และอาจได้แถวไม่เท่ากับที่ผู้ใช้เห็นอยู่ตรงหน้า
   */
  function renderSummaryExport(sm) {
    if (!sm.rows.length) {
      return '<div class="xbar"><button type="button" class="btn" disabled>⬇ Export Excel</button>'
        + '<span class="xnote">ไม่มีรายการให้ export ตามเงื่อนไขนี้</span></div>';
    }
    const d = summaryExportData(sm);
    // ข้อมูลฝังเป็น object literal ในหน้า — ต้องกัน "<" ไม่ให้ปิดแท็ก script กลางคัน
    const json = JSON.stringify(d).replace(/</g, '\\u003c');
    const note = sm.truncated
      ? 'ได้ ' + sm.shown + ' แถวเท่าที่แสดง จากทั้งหมด ' + sm.total + ' ใบที่เข้าเงื่อนไข'
      : 'ได้ ' + sm.shown + ' แถวตามตารางด้านล่าง';
    return '<div class="xbar"><button type="button" class="btn" id="btnXlsx">⬇ Export Excel</button>'
      + '<span class="xnote">' + esc(note) + ' · หัวและลำดับคอลัมน์ตรงกับตาราง · '
      + 'ไม่มีแถวรวม เพื่อให้ sort และ pivot ต่อใน Excel ได้</span></div>'
      + '<script src="' + XLSX_CDN + '"><\/script>'
      + '<script>(function(){\n'
      + 'var D=' + json + ';\n'
      + 'var btn=document.getElementById("btnXlsx");\n'
      + 'function p2(n){return n<10?"0"+n:""+n;}\n'
      + 'function stamp(){var d=new Date();return d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())+"-"+p2(d.getHours())+p2(d.getMinutes());}\n'
      + 'btn.onclick=function(){\n'
      + '  if(!window.XLSX){alert("โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วรีเฟรชหน้านี้อีกครั้ง");return;}\n'
      + '  btn.disabled=true;\n'
      + '  try{\n'
      + '    var aoa=[D.headers].concat(D.rows);\n'
      + '    var ws=XLSX.utils.aoa_to_sheet(aoa);\n'
      + '    ws["!cols"]=D.cols.map(function(c){return {wch:c.w};});\n'
      + '    var last=XLSX.utils.encode_cell({r:aoa.length-1,c:D.headers.length-1});\n'
      + '    ws["!autofilter"]={ref:"A1:"+last};\n'
      + '    var head={font:{bold:true,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"1F2937"}},'
      + 'alignment:{horizontal:"center",wrapText:true}};\n'
      + '    for(var c=0;c<D.headers.length;c++){\n'
      + '      var ha=XLSX.utils.encode_cell({r:0,c:c});\n'
      + '      if(ws[ha])ws[ha].s=head;\n'
      + '    }\n'
      + '    for(var r=1;r<aoa.length;r++){\n'
      + '      for(var c2=0;c2<D.cols.length;c2++){\n'
      + '        var fmt=D.cols[c2].fmt;if(!fmt)continue;\n'
      + '        var ad=XLSX.utils.encode_cell({r:r,c:c2});\n'
      + '        var cell=ws[ad];if(!cell||cell.t!=="n")continue;\n'
      + '        cell.z=fmt;cell.s={numFmt:fmt};\n'
      + '      }\n'
      + '    }\n'
      + '    var wb=XLSX.utils.book_new();\n'
      + '    XLSX.utils.book_append_sheet(wb,ws,D.sheet);\n'
      + '    XLSX.writeFile(wb,D.filebase+"_"+stamp()+".xlsx");\n'
      + '  }catch(e){alert("สร้างไฟล์ Excel ไม่สำเร็จ: "+e.message);}\n'
      + '  btn.disabled=false;\n'
      + '};\n'
      + '})();<\/script>';
  }

  function renderSummaryPage(sm) {
    const f = sm.filters;
    let h = '<h1>ภาพรวมต้นทุนใบสั่งผลิต</h1>'
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
    h += renderSummaryExport(sm);
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
    return shell('ภาพรวมต้นทุนใบสั่งผลิต', h);
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
    // ใบปิดงานเกิดต่อขั้นตอน — คอลัมน์ batch กับใบ summary cost ทำให้เห็นว่าใบไหนคือรอบที่ตีราคา
    const scDoc = {};
    (s.summaryLines || []).forEach(r => { scDoc[asStr(r.tran_id)] = r; });
    let h = `<table><tr><th>ใบปิดงานผลิต</th><th>วันที่</th><th>batch</th><th>ขั้นตอน</th>
      <th class="n">แผน</th><th class="n">ดี</th><th class="n">เสีย</th><th class="n">รับเข้าคลัง</th>
      <th>ใบ MFG Summary Cost</th></tr>`;
    s.wocs.forEach(r => {
      const ia = asStr(r.sc_ia), d = scDoc[ia];
      // ค่าที่ไม่ว่างแต่ไม่ใช่ใบ summary cost = move adjustment (engine ใช้ field เดียวกัน)
      const scCell = !ia
        ? (asNum(r.fg_qty) !== 0 ? '<span class="bad">ยังไม่ผูก</span>' : '')
        : (d ? tranLink(d.recordtype, ia, asStr(d.doc_no))
             : '<span class="warn">ผูกเอกสาร id ' + esc(ia) + ' ที่ไม่ใช่ใบ summary cost</span>');
      h += `<tr><td>${tranLink('workordercompletion', r.woc_id, asStr(r.woc_no))}</td>
        <td>${esc(asStr(r.woc_date))}</td><td>${esc(asStr(r.batch_id))}</td>
        <td>${esc(asStr(r.task_name) || asStr(r.task_no))}</td>`
        + numCell(asNum(r.pro_qty), 4) + numCell(asNum(r.good_qty), 4)
        + numCell(asNum(r.scrap_qty), 4) + numCell(asNum(r.fg_qty), 4)
        + '<td>' + scCell + '</td></tr>';
    });
    h += `<tr class="tot"><td colspan="7">รวมรับเข้าคลัง (ตัวหารของต้นทุนต่อหน่วย)</td>`
      + numCell(s.produced, 4) + '<td></td></tr></table>';
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

  /**
   * บรรทัดสรุป Cost ref ของสินค้าที่ผลิต — บอกว่าที่ไม่มีต้นทุนแปรสภาพนั้นตั้งใจหรือค้าง
   * ลิงก์ไป record ที่จับคู่ได้ เพื่อให้คำเตือนที่ถูกกลบตรวจย้อนได้ว่ากลบเพราะอะไร
   */
  function renderCostRefLine(s) {
    const cr = s.costRef || { verdict: 'unknown', rows: [] };
    const link = r => '<a target="_blank" href="/app/common/custom/custrecordentry.nl?rectype='
      + COST_REF_RECTYPE + '&id=' + encodeURIComponent(asStr(r.cr_id)) + '">Cost ref '
      + esc(asStr(r.cr_id)) + '</a>';
    const links = (cr.rows || []).map(link).join(' · ');
    if (cr.verdict === 'unknown') {
      return '<p class="warn">อ่าน Cost ref ไม่สำเร็จ — ดูสาเหตุที่ท้ายหน้า</p>';
    }
    if (cr.verdict === 'nomatch') {
      return '<p class="warn">จับคู่ Cost ref ของสินค้านี้ไม่ได้เลย '
        + '(ไม่มีแถวที่ตรงทั้งสินค้า บริษัท และช่วงวันที่ของใบสั่งผลิต)</p>';
    }
    if (cr.verdict === 'zero') {
      return '<p class="info">' + links + ' ตั้งต้นทุนไว้เป็น 0/ว่างทุกช่อง — '
        + 'สินค้ากลุ่มนี้ไม่มีต้นทุนแปรสภาพโดยการตั้งค่า</p>';
    }
    if (cr.verdict === 'rate') {
      return '<p class="info">' + links + ' ตั้งเป็น Calculate Cost from Set Up Rate — '
        + 'ต้นทุนไม่ได้อยู่บนตัว record จึงสรุปจากช่องต้นทุนไม่ได้</p>';
    }
    return '<p class="info">' + links + ' ' + esc(costRefAmountText(cr)) + '</p>';
  }

  function renderCostAlloc(s) {
    const crLine = renderCostRefLine(s);
    if (!s.ca.length) {
      const cr = s.costRef || {};
      // ไม่มีเอกสารปันส่วน + Cost ref ตั้งไว้ 0 ทุกช่อง = ถูกต้องแล้ว ไม่ใช่งานค้าง
      const head = cr.verdict === 'zero'
        ? '<p class="info">ไม่มีเอกสารปันส่วนต้นทุน — ถูกต้องตามการตั้งค่า สินค้านี้ไม่มีต้นทุนแปรสภาพ</p>'
        : '<p class="warn">ยังไม่มีเอกสารปันส่วนต้นทุน — ต้นทุนแปรสภาพยังไม่ถูกสร้าง</p>';
      return head + crLine;
    }
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
    return h + '</table>' + crLine;
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
   * แยกส่วนผลต่าง summary cost ให้เห็นว่ายอดวัตถุดิบถูกนับซ้ำกี่ครั้ง
   * โชว์เฉพาะเมื่อสมการไม่ปิด — ปิดพอดีแล้วไม่มีอะไรต้องอธิบาย
   */
  function renderSummaryGapBreakdown(s, ctx) {
    const g = explainSummaryGap(s, ctx);
    if (Math.abs(g.gap) <= 0.01 || !g.docs) return '';

    let h = '<h3>ผลต่างมาจากไหน</h3>';
    if (!g.detected) {
      h += '<p class="sub">ใบ summary cost ใบเดียวหรือไม่มียอดวัตถุดิบให้เทียบ '
        + 'จึงแยกส่วนด้วยวิธีนี้ไม่ได้ — ดูตารางความเคลื่อนไหว WIP ด้านล่างแทน</p>';
      return h;
    }

    h += '<div class="sub">ฝั่งที่สร้างใบ summary cost คิดยอดแต่ละใบเป็น '
      + '<b>ยอดใบเบิกวัตถุดิบทั้งก้อน + ต้นทุนแปรสภาพของ batch นั้น</b> '
      + 'ใบเบิกไม่ได้แยกตาม batch ยอดวัตถุดิบจึงถูกนับซ้ำเท่าจำนวนใบ ทั้งที่ควรนับครั้งเดียว '
      + '· <b>เป็นประเด็นฝั่ง engine ที่สร้างเอกสาร ไม่ใช่การอ่านของรายงานนี้</b></div>';

    h += `<table><tr><th>ใบ MFG Summary Cost</th><th>batch</th><th class="n">มูลค่าบนใบ</th>
      <th class="n">หัก ยอดใบเบิกวัตถุดิบทั้งก้อน</th><th class="n">ต้นทุนแปรสภาพของ batch นี้</th>
      <th class="n">ผลต่าง</th></tr>`;
    g.rows.forEach(r => {
      const bad = r.conv_diff != null && Math.abs(r.conv_diff) > 0.01;
      h += `<tr><td>${tranLink(r.recordtype, r.tran_id, r.doc_no)}</td>
        <td>${esc(r.batch_id) || '<span class="warn">หา batch ไม่ได้</span>'}</td>`
        + numCell(r.amount, 2) + numCell(r.less_rm, 2)
        + (r.conv_batch == null
          ? '<td class="n warn">อ่านไม่ได้</td><td class="n"></td>'
          : numCell(r.conv_batch, 2) + numCell(r.conv_diff, 2, bad ? 'bad' : 'ok'))
        + '</tr>';
    });
    h += '</table>';

    h += `<table><tr><th>แยกส่วนผลต่าง</th><th class="n">จำนวน</th><th>ที่มา</th></tr>`;
    h += `<tr><td>ยอดใบเบิกวัตถุดิบ</td>` + numCell(g.rmTotal, 2)
      + '<td>ใบเบิก ' + g.rmDocs + ' ใบ — '
      + (g.rmDocs < g.docs
        ? 'น้อยกว่าจำนวนใบ summary cost (' + g.docs + ' ใบ) จึงไม่ได้แยกตาม batch'
        : 'เทียบกับใบ summary cost ' + g.docs + ' ใบ')
      + '</td></tr>';
    h += `<tr><td>ถูกนับใน ใบ summary cost</td>` + numCell(g.docs, 0)
      + '<td>ควรถูกนับครั้งเดียว</td></tr>';
    h += `<tr class="tot"><td>ยอดที่นับเกิน = (${g.docs} − 1) × ยอดใบเบิก</td>`
      + numCell(g.overCount, 2, 'bad') + '<td>ส่วนนี้ค้างอยู่ใน WIP</td></tr>';
    h += `<tr><td>ผลต่างทั้งหมดของใบสั่งผลิตนี้</td>` + numCell(g.gap, 2, 'bad')
      + '<td>Summary Cost Item − (วัตถุดิบ + แปรสภาพ)</td></tr>';
    const resBad = Math.abs(g.residual) > 0.01;
    h += `<tr class="${resBad ? 'tot' : 'grand'}"><td>เหลือที่การนับซ้ำอธิบายไม่ได้</td>`
      + numCell(g.residual, 2, resBad ? 'warn' : 'ok')
      + '<td>' + (resBad
        ? 'ดูคอลัมน์ "ผลต่าง" ในตารางบน — ต้นทุนแปรสภาพที่ใบคิดไว้ไม่ตรงกับที่ปันส่วน'
        : '<span class="ok">การนับวัตถุดิบซ้ำอธิบายผลต่างได้ทั้งก้อน</span>')
      + (g.share != null
        ? ' · การนับซ้ำคิดเป็น ' + fmt(g.share * 100, 1) + '% ของผลต่าง'
        : '')
      + '</td></tr>';
    h += '</table>';
    return h;
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
    // กติกา: 1 รอบปิดงานผลิต (1 batch ที่ complete) = 1 ใบ MFG Summary Cost
    // ตัดสินด้วยการผูก ไม่ใช่จำนวนใบ — WO ที่แตกหลาย batch มีได้หลายใบโดยไม่ผิดอะไร
    const nDoc = docKeys.length;
    const lk = s.summaryLink || summaryLink(s.summaryLines, s.wocs);
    h += `<tr><td>จำนวนเอกสาร MFG Summary Cost ของใบสั่งผลิตนี้</td>` + numCell(nDoc, 0)
      + '<td>' + (nDoc === 0
        ? '<span class="bad">ไม่พบเลย — ต้นทุนยังไม่ถูกสรุปเข้า summary cost</span>'
        : 'มีมูลค่า ' + lk.valuedDocs + ' ใบ'
          + (nDoc > lk.valuedDocs
            ? ' · <span class="warn">เอกสารเปล่ามูลค่า 0 อีก ' + (nDoc - lk.valuedDocs)
              + ' ใบ — ไม่กระทบยอด</span>'
            : ''))
      + '</td></tr>';
    h += `<tr><td>รอบปิดงานผลิต (ใบปิดงานที่มีปริมาณ = batch ที่ complete)</td>` + numCell(lk.fgWocs, 0)
      + '<td>ใบปิดงานทั้งหมด ' + (s.wocs || []).length + ' ใบ — ใบขั้นตอนกลางมีปริมาณ 0 จึงไม่ตีราคา</td></tr>';
    if (nDoc > 0 || lk.fgWocs > 0) {
      const nOrphan = lk.orphanDocs.length, nUnlinked = lk.unlinkedWocs.length;
      const linkBad = nOrphan > 0 || nUnlinked > 0;
      h += `<tr><td>ใบ summary cost ที่มีใบปิดงานอ้างถึง</td>`
        + numCell(lk.linkedDocs, 0, linkBad ? 'bad' : 'ok') + '<td>';
      if (!linkBad) {
        h += '<span class="ok">ผูกครบ — ปิดงาน ' + lk.fgWocs + ' รอบ มีใบ summary cost ผูก '
          + lk.linkedDocs + ' ใบ ตรงกัน</span>';
      } else {
        const parts = [];
        if (nOrphan) {
          parts.push('<span class="bad">ใบมีมูลค่าที่ไม่มีใบปิดงานอ้างถึง ' + nOrphan
            + ' ใบ — ตีราคาซ้ำ: '
            + lk.orphanDocs.map(k => tranLink(docs[k].recordtype, k, asStr(docs[k].doc_no))).join(' · ')
            + '</span>');
        }
        if (nUnlinked) {
          parts.push('<span class="bad">ปิดงานแล้วแต่ยังไม่มีใบ summary cost ผูก ' + nUnlinked
            + ' รอบ — ต้นทุน batch นั้นยังไม่ถูกสรุป: '
            + lk.unlinkedWocs.map(w => tranLink('workordercompletion', w.woc_id, asStr(w.woc_no))).join(' · ')
            + '</span>');
        }
        h += parts.join('<br>');
      }
      h += '</td></tr>';
    }
    h += '</table>';

    h += renderSummaryGapBreakdown(s, ctx);

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

  function renderErrors() {
    const bad = QLOG.filter(q => !!q.error);
    if (!bad.length) return '';
    return '<div class="err"><b>ดึงข้อมูลไม่สำเร็จ ' + bad.length + ' ชุด — ตัวเลขบางส่วนอาจไม่ครบ</b><br>'
      + bad.map(q => esc(q.label) + ': ' + esc(q.error)).join('<br>') + '</div>';
  }

  function renderPage(m) {
    let h = '<div class="crumb"><a href="' + selfUrl(filterParams(m.filters))
      + '">← ภาพรวมหลายใบสั่งผลิต</a>'
      + (m.woKey ? ' · <a href="' + selfUrl({ ready: m.woKey })
        + '">ตรวจความพร้อม master ของใบนี้</a>' : '')
      + '</div>'
      + '<h1>ที่มาของต้นทุนใบสั่งผลิต</h1>'
      + '<div class="sub">ไล่ที่มาของทุกตัวเลขจนถึงเอกสารต้นทาง — วัตถุดิบที่เบิก '
      + '→ ใบสั่งผลิตที่ทำกึ่งสำเร็จรูป → เอกสารรับเข้าที่ทำให้ average cost เป็นค่านั้น</div>'
      + renderForm(m.woKey, (m.ctx && m.ctx.asOf) || '', m.filters);

    const page = (body) => shell('ที่มาของต้นทุนใบสั่งผลิต', body);
    if (m.notFound) return page(h + '<div class="err">ไม่พบใบสั่งผลิต "' + esc(m.woKey) + '"</div>' + renderQLog());
    if (!m.ok) return page(h + '<p>กรอกเลขที่ใบสั่งผลิตเพื่อเริ่ม</p>');

    const s = m.root;
    h += renderErrors() + renderWOHeader(s);
    h += '<h2>สรุปต้นทุนของใบสั่งผลิตนี้</h2>' + renderTotals(s, m.ctx);
    h += '<h2>กระทบยอดงานระหว่างทำ — Summary Cost Item ต้องเท่ากับ วัตถุดิบ + ต้นทุนแปรสภาพ</h2>'
      + '<div class="sub">กลไกของระบบนี้ให้ WOC เดบิต WIP ด้วย summary cost item แล้วเครดิตออกไปเป็นสินค้าสำเร็จรูป '
      + 'และให้ใบปรับ summary cost เครดิต WIP ย้ายไปบัญชีพัก · WIP จะปิดเป็นศูนย์ได้เมื่อมูลค่า summary cost item '
      + 'เท่ากับต้นทุนที่เกิดจริงเท่านั้น ส่วนต่างเท่าไหร่จะค้างใน WIP เท่านั้น '
      + '· ใบสั่งผลิตที่แตกหลาย batch มีใบ summary cost ได้ใบต่อ batch ที่ปิดงานเสร็จ '
      + 'จำนวนใบจึงไม่ใช่ตัวชี้ผิดถูก ตัวชี้คือแต่ละใบมีใบปิดงานอ้างถึงหรือไม่</div>'
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
    return page(h);
  }

  // ═══ ชั้นความพร้อม master ย้ายไป WOCostTrace_Ready.js แล้ว (issue #14) ═════
  //
  // entry เรียกผ่าน interface 4 ตัวนี้เท่านั้น — ผูกชื่อไว้ให้ onRequest เรียกเหมือนเดิม
  const readReadyParams = R.readReadyParams;
  const buildReady = R.buildReady;
  const renderReadyPage = R.renderReadyPage;
  const READY_CSS = R.READY_CSS;

  // ═══ entry ═════════════════════════════════════════════════════════════════

  /**
   * สามชั้น หน้าเดียวกันคนละคำถาม
   *   ไม่ส่งพารามิเตอร์ → ชั้นภาพรวม หลายสินค้าหลายใบสั่งผลิต (4 คำสั่งรวมยอด)
   *   ส่ง wo มา         → ชั้นเจาะลึกใบเดียว ของเดิมทั้งหมดไม่เปลี่ยน (19 คำสั่ง ~15 วินาที)
   *   ส่ง ready มา      → ชั้นความพร้อม master ก่อน UAT (ไล่ BOM ทุกระดับ)
   * ลิงก์เดิมที่มี &wo= และ &mode=json ยังทำงานเหมือนเดิม
   */
  function onRequest(ctx) {
    const p = ctx.request.parameters || {};
    // module scope อยู่ข้ามคำขอได้ในบาง execution context — ล้างก่อนทุกครั้งไม่ให้ log สะสม
    C.beginRequest();
    C.setEmbed(asStr(p.embed) === '1');

    const woKey = asStr(p.wo).trim();
    const filters = readFilters(p);
    const wantJson = asStr(p.mode) === 'json';

    // ─── ชั้นความพร้อม master ────────────────────────────────────────────
    // มาก่อนสองชั้นเดิมเพราะเป็นคำถามคนละข้อ และไม่ต้องคิดต้นทุนเลย
    if (asStr(p.ready).trim()) {
      const rp = readReadyParams(p);
      let rd;
      try {
        rd = buildReady(rp);
        rd.woKey = rp.woKey;
        rd.params = rp;
        // ตัวกรองของหน้าภาพรวมติดมากับลิงก์ เพื่อให้กดกลับแล้วได้รายการเดิม (เหมือนชั้นเจาะลึก)
        rd.filters = filters;
      } catch (e) {
        log.error({ title: 'buildReady', details: e.message + '\n' + (e.stack || '') });
        ctx.response.write(shell('ความพร้อม master ก่อนเริ่มทดสอบ',
          '<h1>ความพร้อม master ก่อนเริ่มทดสอบ</h1>'
          + '<div class="err">' + esc(e.message) + '<pre>' + esc(asStr(e.stack)) + '</pre></div>'
          + renderQLog(), READY_CSS));
        return;
      }
      if (wantJson) {
        ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        ctx.response.write(JSON.stringify({ ready: rd, qlog: QLOG }));
        return;
      }
      ctx.response.write(renderReadyPage(rd));
      return;
    }

    // ─── ชั้นภาพรวม ───────────────────────────────────────────────────────
    if (!woKey) {
      let sm;
      try {
        sm = buildSummary(filters);
      } catch (e) {
        log.error({ title: 'buildSummary', details: e.message + '\n' + (e.stack || '') });
        ctx.response.write(shell('ภาพรวมต้นทุนใบสั่งผลิต',
          '<h1>ภาพรวมต้นทุนใบสั่งผลิต</h1>' + renderSummaryForm(filters)
          + '<div class="err">' + esc(e.message) + '<pre>' + esc(asStr(e.stack)) + '</pre></div>'
          + renderQLog()));
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
      ctx.response.write(shell('ที่มาของต้นทุนใบสั่งผลิต',
        renderForm(woKey, '', filters)
        + '<div class="err">' + esc(e.message) + '<pre>' + esc(asStr(e.stack)) + '</pre></div>'
        + renderQLog()));
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
