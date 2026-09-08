/**
 * WOCostTrace_Ready.js
 * ชั้นความพร้อม master ก่อน UAT — คำถาม "ใบสั่งผลิตใบนี้เดินงานได้หรือยัง" (issue #14)
 *
 * สองชั้นแรกของรายงาน (ภาพรวม · เจาะลึก) มองย้อนหลังว่าต้นทุนที่เกิดแล้วมาจากเอกสารใบไหน
 * ชั้นนี้มองไปข้างหน้า จึงอ่าน master ไม่ใช่เอกสาร — เป็นคำถามคนละข้อกับอีกสองชั้น
 * และไม่มีชั้นอื่นพึ่งกลับ จึงเป็นรอยตัดที่สะอาดที่สุดในไฟล์ 4,242 บรรทัดเดิม
 *
 * entry เรียกผ่าน interface แค่ 4 ตัวที่ return ไว้ท้ายไฟล์
 * เนื้อในทุกฟังก์ชันตรงกับของเดิมทุกตัวอักษร — ก้อนนี้ย้ายที่อยู่ ไม่ได้เขียนใหม่
 *
 * ─── ลำดับ deploy ──────────────────────────────────────────────────────────
 * ไฟล์นี้ต้องขึ้นบัญชี **ก่อน** `WOCostTrace.js` และหลัง `WOCostTrace_Common.js`
 * File Cabinet ไม่มีการอัปหลายไฟล์แบบ atomic — อัป entry ที่ `define` ชื่อไฟล์นี้
 * โดยที่ไฟล์นี้ยังไม่ขึ้น = Suitelet ตายทุก request ด้วย `MODULE_DOES_NOT_EXIST`
 * (repo พี่น้อง `Pre-Work_Order_Completion` เจอมาแล้วจนต้องตั้งกฎห้าม single-file upload)
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/runtime', './WOCostTrace_Common'], (runtime, C) => {

  // ผูกชื่อสั้นจาก Common — ให้โค้ดที่ย้ายมาเรียกเหมือนตอนอยู่ไฟล์เดียวกัน
  // เขียนเรียงชื่อไว้เพื่อให้เห็นว่าไฟล์นี้พึ่งอะไรจากข้างนอกทั้งหมด 25 ตัว
  const asStr = C.asStr;
  const asNum = C.asNum;
  const esc = C.esc;
  const rawNum = C.rawNum;
  const fmt = C.fmt;
  const numCell = C.numCell;
  const itemLink = C.itemLink;
  const tranLink = C.tranLink;
  const runSQL = C.runSQL;
  const QLOG = C.QLOG;
  const inList = C.inList;
  const uniq = C.uniq;
  const CSS = C.CSS;
  const shell = C.shell;
  const selfUrl = C.selfUrl;
  const filterParams = C.filterParams;
  const renderQLog = C.renderQLog;
  const kpi = C.kpi;
  const todayIso = C.todayIso;
  const uomFactor = C.uomFactor;
  const qWO = C.qWO;
  const qWOLines = C.qWOLines;
  const qUOM = C.qUOM;
  const qCostRef = C.qCostRef;
  const costRefInEffect = C.costRefInEffect;

  // ═══ ชั้นความพร้อม master ก่อน UAT ═════════════════════════════════════════
  //
  // สองชั้นแรกมองย้อนหลัง — "ต้นทุนที่เกิดแล้วมาจากเอกสารใบไหน"
  // ชั้นนี้มองไปข้างหน้า — "ใบสั่งผลิตใบนี้เดินงานได้หรือยัง" จึงอ่าน master ไม่ใช่เอกสาร
  // ไล่ BOM ลงทุกระดับจากสินค้าที่ผลิต แล้วตรวจตาม UAT check point M-02…M-06 และ M-09
  //
  // ─── ข้อเท็จจริงที่ verify กับ 9751184_SB1 แล้ว (2026-08-10) ───────────────────
  //
  // 1) manufacturingrouting **ไม่มีคอลัมน์ item** — routing ผูกกับ BOM (billofmaterials)
  //    ไม่ใช่ผูกกับสินค้าโดยตรง การหา routing ของสินค้าจึงต้องผ่าน BOM ที่เลือกไว้ก่อน
  //
  // 2) ขั้นตอนของ routing อยู่ในตาราง manufacturingroutingroutingstep
  //    (manufacturingroutingstep **ไม่มีจริง** — INVALID_SEARCH_TYPE) และไม่มีคอลัมน์ id
  //
  // 3) work center **ไม่ใช่ตารางของตัวเอง** — manufacturingworkcenter ไม่มีจริง
  //    ตัว record คือ entitygroup ที่ ismanufacturingworkcenter = 'T'
  //
  // 4) assemblyitembom มีคอลัมน์ **defaultforlocation** ให้ตรงตาม M-02 พอดี
  //    ⚠ ธง inactive ของตารางนี้คืนค่าเป็น 'No'/'Yes' ขณะ bomrevision.isinactive คืน 'F'/'T'
  //
  // 5) **bomrevisioncomponent.bomquantity เป็นปริมาณต่อ batch ไม่ใช่ต่อ 1 หน่วยพ่อ**
  //    (BOM ของ 10010900101: 33 KG ต่อ batch 3,300 ขวด) ปริมาณที่ต้องใช้จริงคือ
  //      bomquantity ÷ bomrevision.custrecord_mfg_item_batch_qty × จำนวนที่จะผลิต
  //    ยืนยันกับบรรทัด component บน WO-FSC-00000392 (สั่งผลิต 10,000 ขวด) ตรงทุกรายการ:
  //      21030200001 → 100 KG · 22050900036 → 209.09091 Pcs · 22080900001 → 4.24242 Kg
  //    ถ้าอ่าน bomquantity เป็นต่อหน่วยจะได้ยอดเกินไป 3,300 เท่า
  //
  // 6) transaction.subsidiary เป็น NOT_EXPOSED — บริษัทต้องอ่านจาก transactionline.subsidiary
  //
  // 7) inventoryitemlocations ให้ยอดคงเหลือรายคลัง (quantityonhand / quantityavailable /
  //    quantitycommitted) หน่วยเป็นหน่วยสต๊อกของสินค้า · available หักที่ถูกจองไว้แล้ว

  /** ความลึกสูงสุดที่ไล่ BOM — กันหน้าค้างเมื่อ master ตั้งวนกันเอง */
  const READY_MAX_DEPTH = 6;

  /** ชนิดสินค้าที่ประกอบเองได้ — ตัวอื่นถือเป็นปลายทาง ไม่ต้องมี BOM */
  const READY_MADE_TYPES = { Assembly: 1, assembly: 1 };

  /**
   * ธง Yes/No ของ SuiteQL ไม่คงรูปเดียวกันทุกตาราง
   * assemblyitembom.inactive คืน 'No' · bomrevision.isinactive คืน 'F' · item.isinactive คืน 'F'
   * เขียนกฎรวมไว้ที่เดียว ไม่งั้นเทียบ === 'T' แล้วรายการที่ปิดใช้งานจะหลุดเข้ามาเงียบ ๆ
   */
  function isYes(v) {
    const s = asStr(v).trim().toLowerCase();
    return s === 't' || s === 'true' || s === 'yes' || s === 'y' || s === '1';
  }

  /**
   * ห่อ query แล้วบอกด้วยว่า "คำสั่งพัง" หรือ "ไม่มีข้อมูล"
   * ทั้งสองกรณีคืนแถวว่างเหมือนกัน แต่ความหมายต่างกันคนละขั้ว —
   * query พังแล้วสรุปว่า "ยังไม่ตั้งค่า" คือรายงานผิดทุกแถวพร้อมกัน (กติกาเดียวกับ Cost ref)
   */
  function tracked(fn) {
    const at = QLOG.length;
    const rows = fn() || [];
    let failed = false;
    for (let i = at; i < QLOG.length; i++) { if (QLOG[i].error) failed = true; }
    return { rows: rows, failed: failed };
  }

  // ─── queries ของชั้นความพร้อม ───────────────────────────────────────────────

  /** BOM ที่ผูกกับสินค้า + ธงว่าเป็น default ของ location ไหน (M-02) */
  function qReadyBoms(itemIds) {
    if (!itemIds.length) return { rows: [], failed: false };
    return tracked(() => runSQL('BOM ที่ผูกกับสินค้า', `
      SELECT AB.assembly                                  AS item_id,
             AB.billofmaterials                           AS bom_id,
             B.name                                       AS bom_name,
             AB.currentrevision                           AS cur_rev,
             AB.masterdefault                             AS master_default,
             AB.defaultforlocation                        AS def_loc,
             BUILTIN.DF(AB.defaultforlocation)            AS def_loc_name,
             TO_CHAR(AB.effectivestartdate, 'YYYY-MM-DD') AS eff_start,
             TO_CHAR(AB.effectiveenddate,   'YYYY-MM-DD') AS eff_end,
             AB.inactive                                  AS ab_inactive,
             B.isinactive                                 AS bom_inactive
      FROM assemblyitembom AB
      LEFT JOIN bom B ON B.id = AB.billofmaterials
      WHERE AB.assembly IN (${inList(itemIds)})
    `));
  }

  /** revision ทุกใบของ BOM พร้อมช่วงผลบังคับและขนาด batch (M-03) */
  function qReadyRevs(bomIds) {
    if (!bomIds.length) return { rows: [], failed: false };
    return tracked(() => runSQL('BOM revision + ช่วงผลบังคับ', `
      SELECT BR.id                                        AS rev_id,
             BR.billofmaterials                           AS bom_id,
             BR.name                                      AS rev_name,
             TO_CHAR(BR.effectivestartdate, 'YYYY-MM-DD') AS eff_start,
             TO_CHAR(BR.effectiveenddate,   'YYYY-MM-DD') AS eff_end,
             BR.isinactive                                AS rev_inactive,
             BR.custrecord_mfg_item_batch_qty             AS batch_qty
      FROM bomrevision BR
      WHERE BR.billofmaterials IN (${inList(bomIds)})
    `));
  }

  /** component ของ revision (M-04) — ชนิดสินค้าติดมาด้วยเพื่อรู้ว่าต้องไล่ลงชั้นถัดไปไหม */
  function qReadyComps(revIds) {
    if (!revIds.length) return { rows: [], failed: false };
    return tracked(() => runSQL('component ใน revision', `
      SELECT BRC.bomrevision                            AS rev_id,
             BRC.lineid                                 AS line_id,
             BRC.item                                   AS comp_item,
             I.itemid                                   AS comp_code,
             I.displayname                              AS comp_name,
             I.itemtype                                 AS comp_type,
             NVL(I.isinactive, 'F')                     AS comp_inactive,
             NVL(I.custitem_mfg_summarycostitem, 'F')   AS is_summary,
             BRC.bomquantity                            AS bom_qty,
             BRC.componentyield                         AS comp_yield,
             BRC.itemsource                             AS item_source,
             BRC.units                                  AS comp_unit_id,
             BUILTIN.DF(BRC.units)                      AS comp_unit_name,
             I.stockunit                                AS stock_unit_id,
             BUILTIN.DF(I.stockunit)                    AS stock_unit_name
      FROM bomrevisioncomponent BRC
      JOIN item I ON I.id = BRC.item
      WHERE BRC.bomrevision IN (${inList(revIds)})
      ORDER BY BRC.bomrevision, BRC.lineid
    `));
  }

  /** routing ของ BOM (M-05) — ผูกที่ BOM ไม่ใช่ที่สินค้า ดูข้อ 1 ด้านบน */
  function qReadyRouting(bomIds) {
    if (!bomIds.length) return { rows: [], failed: false };
    return tracked(() => runSQL('Manufacturing routing', `
      SELECT MR.id                       AS routing_id,
             MR.name                     AS routing_name,
             MR.billofmaterials          AS bom_id,
             MR.isdefault                AS is_default,
             MR.location                 AS loc_id,
             BUILTIN.DF(MR.location)     AS loc_name,
             MR.subsidiary               AS sub_id,
             MR.isinactive               AS r_inactive
      FROM manufacturingrouting MR
      WHERE MR.billofmaterials IN (${inList(bomIds)})
    `));
  }

  /** ขั้นตอนของ routing + work center ที่แต่ละขั้นตอนใช้ (M-05) */
  function qReadySteps(routingIds) {
    if (!routingIds.length) return { rows: [], failed: false };
    return tracked(() => runSQL('ขั้นตอนของ routing', `
      SELECT S.manufacturingrouting      AS routing_id,
             S.operationsequence         AS seq,
             S.operationname             AS op_name,
             S.manufacturingworkcenter   AS wc_id,
             S.runrate                   AS run_rate,
             S.setuptime                 AS setup_time,
             S.manufacturingcosttemplate AS cost_template
      FROM manufacturingroutingroutingstep S
      WHERE S.manufacturingrouting IN (${inList(routingIds)})
      ORDER BY S.manufacturingrouting, S.operationsequence
    `));
  }

  /** work center (M-06) — record จริงคือ entitygroup ดูข้อ 3 ด้านบน */
  function qReadyWorkCenters(wcIds) {
    if (!wcIds.length) return { rows: [], failed: false };
    return tracked(() => runSQL('Work center', `
      SELECT EG.id                                            AS wc_id,
             EG.groupname                                     AS wc_name,
             NVL(EG.ismanufacturingworkcenter, 'F')           AS is_wc,
             NVL(EG.isinactive, 'F')                          AS wc_inactive,
             EG.subsidiary                                    AS sub_id,
             EG.custentity_mfg_group_location                 AS wc_loc,
             BUILTIN.DF(EG.custentity_mfg_group_location)     AS wc_loc_name
      FROM entitygroup EG
      WHERE EG.id IN (${inList(wcIds)})
    `));
  }

  /** ยอดคงเหลือรายคลัง — หน่วยเป็นหน่วยสต๊อกของสินค้า */
  function qReadyStock(itemIds, locIds) {
    if (!itemIds.length) return { rows: [], failed: false };
    const locFilter = (locIds && locIds.length) ? `AND IL.location IN (${inList(locIds)})` : '';
    return tracked(() => runSQL('ยอดคงเหลือรายคลัง', `
      SELECT IL.item                        AS item_id,
             IL.location                    AS loc_id,
             BUILTIN.DF(IL.location)        AS loc_name,
             NVL(IL.quantityonhand, 0)      AS on_hand,
             NVL(IL.quantityavailable, 0)   AS avail,
             NVL(IL.quantitycommitted, 0)   AS committed
      FROM inventoryitemlocations IL
      WHERE IL.item IN (${inList(itemIds)}) ${locFilter}
        AND (NVL(IL.quantityonhand, 0) <> 0 OR NVL(IL.quantitycommitted, 0) <> 0)
    `));
  }

  /** คลังทั้งหมดที่ใช้งานอยู่ — ใส่ในช่องเลือกคลัง พร้อมธงว่าเป็นคลังผลิตไหม */
  function qReadyLocations() {
    return tracked(() => runSQL('รายการคลัง', `
      SELECT L.id                                          AS loc_id,
             L.name                                        AS loc_name,
             NVL(L.custrecord_mfg_productionplant, 'F')     AS is_plant
      FROM location L
      WHERE NVL(L.isinactive, 'F') = 'F'
      ORDER BY L.name
    `));
  }

  // ─── การเลือก BOM / revision / routing ─────────────────────────────────────

  /** ช่วงวันที่ครอบวันที่นี้ไหม (ช่องว่าง = ไม่จำกัดด้านนั้น) */
  function inDateWindow(startIso, endIso, dateIso) {
    const d = asStr(dateIso);
    if (!d) return true;
    const s = asStr(startIso), e = asStr(endIso);
    if (s && d < s) return false;
    if (e && d > e) return false;
    return true;
  }

  /**
   * เลือก BOM ที่จะใช้ (M-02)
   * ลำดับ: default ของคลังที่ผลิต → master default → เหลือใบเดียว → เลือกไม่ได้
   * เลือกไม่ได้ต้องบอกว่าเลือกไม่ได้ ห้ามหยิบใบแรกมาแล้วรายงานเหมือนถูกต้อง
   *
   * ⚠ locId ใส่ได้เฉพาะสินค้าที่ใบสั่งผลิตใบนี้ผลิตเอง (ชั้น 0)
   *   ของกึ่งสำเร็จรูปชั้นลึกกว่านั้นจะถูกผลิตด้วยใบสั่งผลิตของตัวมันเองที่คลังของมันเอง
   *   เอาคลังของ FG ไปตัดสิน BOM ของ semi = สร้าง false positive (ข้อมูลจริงบน SB1:
   *   semi 7 ตัวของ 10010900101 ผลิตที่ RMRD ขณะ FG ผลิตที่ PD_B1 ซึ่งถูกต้องตามการตั้งค่า)
   */
  function pickBom(all, locId, dateIso) {
    const strict = !!asStr(locId);
    if (all.failed) return { verdict: 'unknown', bom: null, others: [], strict: strict };
    const rows = all.rows || [];
    if (!rows.length) return { verdict: 'none', bom: null, others: [], strict: strict };
    const active = rows.filter(r => !isYes(r.ab_inactive) && !isYes(r.bom_inactive));
    if (!active.length) return { verdict: 'inactive', bom: null, others: rows, strict: strict };
    const live = active.filter(r => inDateWindow(r.eff_start, r.eff_end, dateIso));
    if (!live.length) return { verdict: 'expired', bom: null, others: active, strict: strict };
    const out = (verdict, bom) => ({ verdict: verdict, bom: bom, others: live, strict: strict });
    if (strict) {
      const byLoc = live.filter(r => asStr(r.def_loc) && asStr(r.def_loc) === asStr(locId));
      if (byLoc.length === 1) return out('loc', byLoc[0]);
      if (byLoc.length > 1) return out('duploc', byLoc[0]);
    }
    if (live.length === 1) return out('single', live[0]);
    const master = live.filter(r => isYes(r.master_default));
    if (master.length === 1) return out('master', master[0]);
    return out('ambiguous', null);
  }

  /**
   * เลือก revision ที่มีผลบังคับ ณ วันที่เอกสาร (M-03)
   * currentrevision บอกได้แค่ว่าใบไหน "ปัจจุบัน" ซึ่งเป็นคำถามคนละข้อกับ
   * "ใบไหนมีผลบังคับวันที่ WO" — ถ้าสองอย่างไม่ตรงกันต้องรายงานให้เห็น
   */
  function pickRev(all, bomId, curRevId, dateIso) {
    if (all.failed) return { verdict: 'unknown', rev: null, others: [] };
    const rows = (all.rows || []).filter(r => asStr(r.bom_id) === asStr(bomId));
    if (!rows.length) return { verdict: 'none', rev: null, others: [] };
    const active = rows.filter(r => !isYes(r.rev_inactive));
    if (!active.length) return { verdict: 'inactive', rev: null, others: rows };
    const live = active.filter(r => inDateWindow(r.eff_start, r.eff_end, dateIso));
    const cur = active.filter(r => asStr(r.rev_id) === asStr(curRevId))[0] || null;
    if (!live.length) return { verdict: 'expired', rev: null, others: active, cur: cur };
    const curLive = live.filter(r => asStr(r.rev_id) === asStr(curRevId))[0] || null;
    if (curLive) return { verdict: 'ok', rev: curLive, others: live };
    // ใบที่ระบบตั้งเป็น current ใช้วันนั้นไม่ได้ แต่มีใบอื่นที่ใช้ได้ — เดินต่อด้วยใบที่ใช้ได้ พร้อมคำเตือน
    return { verdict: 'notcurrent', rev: live[0], others: live, cur: cur };
  }

  /**
   * เลือก routing ของ BOM (M-05) — คลังที่ผลิตมาก่อน default
   * routing ที่ไม่ตรงคลังใช้ไม่ได้กับ WO ใบนี้ จึงนับเป็น "ไม่มี routing ของคลังนี้"
   * ไม่ใช่ "มี routing" เฉย ๆ
   */
  function pickRouting(all, bomId, locId, subId) {
    const strict = !!asStr(locId);
    if (all.failed) return { verdict: 'unknown', routing: null, others: [], strict: strict };
    const rows = (all.rows || []).filter(r => asStr(r.bom_id) === asStr(bomId));
    if (!rows.length) return { verdict: 'none', routing: null, others: [], strict: strict };
    const active = rows.filter(r => !isYes(r.r_inactive));
    if (!active.length) return { verdict: 'inactive', routing: null, others: rows, strict: strict };
    const bySub = active.filter(r => !asStr(r.sub_id) || !asStr(subId) || asStr(r.sub_id) === asStr(subId));
    const pool = bySub.length ? bySub : active;
    const out = (verdict, routing) => ({ verdict: verdict, routing: routing, others: pool, strict: strict });
    if (strict) {
      const byLoc = pool.filter(r => asStr(r.loc_id) === asStr(locId));
      if (byLoc.length === 1) return out('loc', byLoc[0]);
      if (byLoc.length > 1) return out('duploc', byLoc[0]);
      // ชั้น 0 ผลิตที่คลังนี้จริง routing ของคลังอื่นจึงใช้กับใบนี้ไม่ได้
      return out('otherloc', null);
    }
    if (pool.length === 1) return out('single', pool[0]);
    const def = pool.filter(r => isYes(r.is_default));
    if (def.length === 1) return out('default', def[0]);
    return out('ambiguous', null);
  }

  /**
   * Cost ref ต่อ work center (M-09) — เกณฑ์เข้มกว่าที่ classifyCostRef ใช้
   *
   * classifyCostRef จับคู่ที่ระดับสินค้าเท่านั้นเพราะใบที่ยังไม่ปล่อยงานไม่มี work center
   * แต่ชั้นนี้อ่าน work center จาก routing ซึ่งเป็น master มีอยู่ก่อน WO
   * จึงตรวจได้ตรงตามข้อกำหนดจริงคือ "ตั้ง cost ref ตามแต่ละ work center"
   */
  function costRefByWorkCenter(all, itemId, wcIds, subId, dateIso) {
    if (!all || all.failed) return { verdict: 'unknown', covered: [], missing: [], rows: [] };
    if (!wcIds.length) return { verdict: 'nowc', covered: [], missing: [], rows: [] };
    const mine = (all.rows || []).filter(r => asStr(r.item_id) === asStr(itemId)
      && costRefInEffect(r, subId, dateIso));
    const covered = [], missing = [], used = [];
    wcIds.forEach(wc => {
      const hit = mine.filter(r => asStr(r.wc_id) === asStr(wc));
      if (hit.length) { covered.push(wc); hit.forEach(h => used.push(h)); }
      else missing.push(wc);
    });
    let verdict = 'ok';
    if (!covered.length) verdict = 'none';
    else if (missing.length) verdict = 'partial';
    return { verdict: verdict, covered: covered, missing: missing, rows: used, itemRows: mine };
  }

  // ─── ระเบิด BOM ────────────────────────────────────────────────────────────

  /**
   * โหลดโครง BOM ทุกระดับจากสินค้าตั้งต้น — 3 คำสั่งต่อระดับ ไม่ใช่ 3 คำสั่งต่อสินค้า
   * (ระดับ 4 ชั้นของ FG จริงมี component รวมหลายสิบตัว ถ้ายิงต่อตัวจะเป็นร้อยคำสั่งต่อการเปิดหน้าเดียว)
   */
  function loadReadyStructure(rootItemIds, locId, dateIso) {
    const st = {
      byItem: {},        // itemId → { bomPick, revPick, comps, batchQty }
      allBomIds: [],
      itemIds: [],
      depthReached: 0,
      failed: false
    };
    let frontier = uniq(rootItemIds);
    const seen = {};
    frontier.forEach(id => { seen[id] = true; st.itemIds.push(asStr(id)); });

    for (let depth = 0; depth <= READY_MAX_DEPTH && frontier.length; depth++) {
      st.depthReached = depth;
      const boms = qReadyBoms(frontier);
      const bomIds = uniq((boms.rows || []).map(r => r.bom_id));
      const revs = qReadyRevs(bomIds);
      const revIds = uniq((revs.rows || []).map(r => r.rev_id));
      const comps = qReadyComps(revIds);
      if (boms.failed || revs.failed || comps.failed) st.failed = true;
      bomIds.forEach(b => { if (st.allBomIds.indexOf(b) === -1) st.allBomIds.push(b); });

      const next = [];
      frontier.forEach(itemId => {
        const mine = {
          rows: (boms.rows || []).filter(r => asStr(r.item_id) === asStr(itemId)),
          failed: boms.failed
        };
        // คลังใช้ตัดสินได้เฉพาะสินค้าที่ใบสั่งผลิตใบนี้ผลิตเอง (ชั้น 0) — ดูคำอธิบายที่ pickBom
        const bomPick = pickBom(mine, depth === 0 ? locId : '', dateIso);
        const entry = { bomPick: bomPick, revPick: null, comps: [], batchQty: 0 };
        st.byItem[asStr(itemId)] = entry;
        if (!bomPick.bom) return;
        const revPick = pickRev(revs, bomPick.bom.bom_id, bomPick.bom.cur_rev, dateIso);
        entry.revPick = revPick;
        if (!revPick.rev) return;
        entry.batchQty = asNum(revPick.rev.batch_qty);
        // บรรทัดตัวเก็บยอดต้นทุน (summary cost item) ไม่ใช่วัตถุดิบ ต้องตัดออกเหมือนฝั่งใบเบิก
        entry.comps = (comps.rows || []).filter(r => asStr(r.rev_id) === asStr(revPick.rev.rev_id)
          && !isYes(r.is_summary));
        entry.comps.forEach(c => {
          const id = asStr(c.comp_item);
          if (!seen[id]) { seen[id] = true; st.itemIds.push(id); }
          if (READY_MADE_TYPES[asStr(c.comp_type)] && next.indexOf(id) === -1
            && !st.byItem[id]) next.push(id);
        });
      });
      frontier = next;
    }
    return st;
  }

  /**
   * เดินโครง BOM แล้วคิดปริมาณที่ต้องใช้ต่อ node
   *
   * ปริมาณต่อ 1 หน่วยพ่อ = bomquantity ÷ batch qty ของ revision (ดูข้อ 5 ด้านบน)
   * batch qty เป็น 0 หรือว่าง = อ่านเป็นต่อหน่วยไปก่อนแล้วติดธงไว้ ไม่ใช่หารด้วยศูนย์เงียบ ๆ
   */
  function walkReady(ctx, st, rootItemId, rootQty, rootUnitName) {
    const nodes = [];
    const leafNeed = {};

    function visit(itemId, code, name, type, need, unitName, unitId, depth, path, src) {
      const key = asStr(itemId);
      const entry = st.byItem[key] || null;
      const isMadeType = !!READY_MADE_TYPES[asStr(type)];
      // "ต้องมี BOM" = ชนิดสินค้าประกอบเองได้ หรือหา BOM ของมันเจอจริง
      // ไม่งั้นวัตถุดิบที่ถูกใส่เป็นสินค้าตั้งต้นจะขึ้นว่า "ยังไม่ผูก BOM" ทั้งที่ไม่ต้องมี
      const needsBom = isMadeType || !!(entry && entry.bomPick && entry.bomPick.bom);
      const node = {
        depth: depth,
        item_id: key,
        code: asStr(code),
        name: asStr(name),
        type: asStr(type),
        need: need,
        unit_name: asStr(unitName),
        unit_id: asStr(unitId),
        item_source: asStr(src),
        made: needsBom && !!(entry && entry.bomPick),
        bom: needsBom && entry ? entry.bomPick : null,
        rev: entry ? entry.revPick : null,
        batch_qty: entry ? entry.batchQty : 0,
        cycle: false,
        notes: []
      };
      nodes.push(node);

      if (path[key]) {
        node.cycle = true;
        node.notes.push({ cls: 'bad', text: 'BOM วนกลับมาที่สินค้าตัวเดิม — หยุดไล่ที่ชั้นนี้' });
        return node;
      }
      const comps = entry && entry.comps ? entry.comps : [];
      if (!comps.length) {
        // ปลายทาง — ต้องมีของในคลังจริง จึงรวมยอดที่ต้องใช้ไว้เทียบสต๊อก
        const cur = leafNeed[key] || { item_id: key, code: asStr(code), name: asStr(name),
          type: asStr(type), unit_name: asStr(unitName), qty: 0, from: [] };
        cur.qty += need;
        if (cur.from.indexOf(depth) === -1) cur.from.push(depth);
        leafNeed[key] = cur;
        node.leaf = true;
        if (isMadeType && entry && entry.bomPick && entry.bomPick.verdict !== 'unknown') {
          node.notes.push({ cls: 'warn',
            text: 'สินค้าประกอบแต่ไล่ BOM ต่อไม่ได้ — ถือเป็นของที่ต้องมีในคลัง' });
        }
        if (depth >= READY_MAX_DEPTH && isMadeType) {
          node.notes.push({ cls: 'warn', text: 'ถึงความลึกสูงสุดที่รายงานไล่ให้ — ชั้นถัดไปยังไม่ได้ตรวจ' });
        }
        return node;
      }

      const batch = asNum(node.batch_qty);
      if (!batch) {
        node.notes.push({ cls: 'warn',
          text: 'revision ไม่ได้ตั้งขนาด batch — อ่าน BOM quantity เป็นต่อ 1 หน่วย ตัวเลขอาจไม่ตรงของจริง' });
      }
      const nextPath = Object.assign({}, path);
      nextPath[key] = true;
      node.children = [];
      comps.forEach(c => {
        const perParent = batch ? asNum(c.bom_qty) / batch : asNum(c.bom_qty);
        // ปริมาณที่ได้อยู่ในหน่วยที่ BOM ระบุ ต้องแปลงเป็นหน่วยสต๊อกก่อนใช้ต่อ
        // (BOM ระบุ G ขณะสต๊อกเป็น KG พบจริงแล้วในบัญชีนี้ ไม่แปลงคือผิดเงียบ ๆ)
        const conv = uomFactor(ctx, c.comp_unit_id, c.stock_unit_id);
        const needBom = perParent * need;
        const needStock = conv.factor != null ? needBom * conv.factor : needBom;
        const child = visit(c.comp_item, c.comp_code, c.comp_name, c.comp_type,
          needStock, c.stock_unit_name, c.stock_unit_id, depth + 1, nextPath, c.item_source);
        child.bom_qty = asNum(c.bom_qty);
        child.bom_unit = asStr(c.comp_unit_name);
        child.per_parent = perParent;
        child.need_bom_unit = needBom;
        child.conv_note = conv.note;
        if (conv.factor == null) {
          child.notes.push({ cls: 'warn',
            text: 'แปลงหน่วย ' + asStr(c.comp_unit_name) + ' → ' + asStr(c.stock_unit_name)
              + ' ไม่ได้ (' + conv.note + ') — ยอดที่ต้องใช้ยังเป็นหน่วยของ BOM' });
        }
        const y = asNum(c.comp_yield);
        if (y && y !== 1 && y !== 100) {
          child.notes.push({ cls: 'warn',
            text: 'component yield = ' + rawNum(y) + ' ยังไม่ถูกคิดรวมในยอดที่ต้องใช้' });
        }
        if (isYes(c.comp_inactive)) {
          child.notes.push({ cls: 'bad', text: 'สินค้าถูกปิดใช้งาน (inactive)' });
        }
        node.children.push(child);
      });
      return node;
    }

    const root = ctx.readyRoot;
    visit(rootItemId, root.code, root.name, root.type, rootQty, rootUnitName, root.unit_id, 0, {}, '');
    return { nodes: nodes, leafNeed: leafNeed };
  }

  // ─── model ของชั้นความพร้อม ────────────────────────────────────────────────

  /** อ่านตัวกรองของชั้นความพร้อมจาก query param */
  function readReadyParams(p) {
    const parts = asStr(p.rloc).split(',').map(s => s.trim()).filter(s => s);
    const locAll = parts.some(s => s.toLowerCase() === 'all');
    return {
      woKey: asStr(p.ready).trim(),
      qtyOverride: asStr(p.rqty).trim(),
      locAll: locAll,
      locIds: locAll ? [] : uniq(parts.filter(s => /^\d+$/.test(s))),
      asOf: asStr(p.rdate).trim()
    };
  }

  /**
   * ประกอบผลตรวจความพร้อมของสินค้าที่จะผลิต
   *
   * สองทางเข้า ผลตรวจ master เหมือนกันทั้งคู่
   *   เลขที่ใบสั่งผลิต → เอาสินค้า จำนวน คลัง และวันที่จากใบนั้น (ทางหลัก)
   *   รหัสสินค้า      → ใช้ตอนยังไม่มีใบสั่งผลิต เช่นวันตั้ง master ก่อนเริ่มทดสอบ
   *                     จำนวนใช้ขนาด batch ของ revision · คลังและวันที่มาจากช่องกรอก
   */
  function buildReady(rp) {
    // ช่องเลือกคลังต้องมีตัวเลือกให้เห็นแม้ตอนหาไม่เจอ ไม่งั้นแก้เลขแล้วเลือกคลังใหม่ไม่ได้
    const blank = { ok: false, woKey: rp.woKey, params: rp, locations: [], stock_locs: [],
      qty_from_wo: 0, date_iso: '' };
    const woRows = qWO(rp.woKey);
    let wo = null, woId = '', lines = [], fg = null, basis = 'wo';

    if (woRows.length) {
      wo = woRows[0];
      woId = asStr(wo.wo_id);
      lines = qWOLines([woId]);
      fg = lines.filter(r => asStr(r.mainline) === 'T')[0] || null;
      if (!fg) {
        blank.locations = (qReadyLocations().rows || []);
        blank.wo = wo;
        blank.error = 'ใบสั่งผลิตนี้ไม่มีบรรทัดสินค้าที่ผลิต';
        return blank;
      }
    } else {
      const itemRows = qReadyItem(rp.woKey);
      if (!itemRows.length) {
        blank.locations = (qReadyLocations().rows || []);
        blank.error = 'ไม่พบทั้งใบสั่งผลิตและรหัสสินค้าที่ตรงกับ "' + rp.woKey + '"';
        return blank;
      }
      basis = 'item';
      const it = itemRows[0];
      wo = { wo_no: '', wo_date: '', wo_date_iso: '' };
      fg = {
        item_id: it.item_id, item_code: it.item_code, item_name: it.item_name,
        quantity: 0, unit_name: it.stock_unit_name, sub_id: '',
        item_type: it.item_type, item_inactive: it.item_inactive
      };
    }

    // บริษัทและคลังอ่านจากบรรทัดเอกสาร — transaction.subsidiary เป็น NOT_EXPOSED (ข้อ 6)
    // ทางเข้าด้วยรหัสสินค้าไม่มีเอกสารให้อ่าน จึงไม่จำกัดบริษัท และใช้คลังที่ผู้ใช้เลือกเป็นคลังผลิต
    const subId = asStr(fg.sub_id);
    const woLoc = basis === 'wo'
      ? qReadyWOLocation(woId)
      : { loc_id: rp.locIds.length ? rp.locIds[0] : '', loc_name: '' };
    const locId = asStr(woLoc.loc_id);
    const dateIso = rp.asOf || (basis === 'wo' ? asStr(wo.wo_date_iso) : todayIso());

    const locList = qReadyLocations();
    // คลังที่ใช้เทียบสต๊อก: ผู้ใช้เลือกได้หลายคลัง (คลังป้อน + คลังผลิต) ค่าเริ่มต้น = คลังของ WO
    // ดูแค่คลังผลิตจะขึ้นว่าของขาดทั้งที่ของอยู่คลังป้อนรอย้ายด้วย TO
    const stockLocs = rp.locAll ? [] : (rp.locIds.length ? rp.locIds : (locId ? [locId] : []));

    const st = loadReadyStructure([asStr(fg.item_id)], locId, dateIso);

    // จำนวนตั้งต้น: ใบสั่งผลิตมีจำนวนอยู่แล้ว · ทางเข้าด้วยรหัสสินค้าใช้ขนาด batch ของ revision
    // ต้องบอกบนหน้าว่าใช้ฐานไหน ไม่งั้นอ่านตัวเลขผิดฐานแล้วไม่รู้ตัว
    const rootEntry = st.byItem[asStr(fg.item_id)] || null;
    const batchQty = rootEntry ? asNum(rootEntry.batchQty) : 0;
    let qtyBasis = 'manual';
    let rootQty = Number(rp.qtyOverride);
    if (!rp.qtyOverride || !isFinite(rootQty) || rootQty <= 0) {
      if (basis === 'wo') { rootQty = Math.abs(asNum(fg.quantity)); qtyBasis = 'wo'; }
      else if (batchQty) { rootQty = batchQty; qtyBasis = 'batch'; }
      else { rootQty = 1; qtyBasis = 'one'; }
    }
    const defaultQty = basis === 'wo' ? Math.abs(asNum(fg.quantity)) : batchQty;

    const ctx = {
      uomById: groupOne(qUOM(), 'uom_id'),
      readyRoot: {
        code: asStr(fg.item_code), name: asStr(fg.item_name),
        // ใบสั่งผลิตผลิตของที่ประกอบเองอยู่แล้ว · ทางรหัสสินค้าอ่านชนิดจริงจาก item
        // เพราะผู้ใช้อาจใส่รหัสวัตถุดิบมา ซึ่งไม่ควรขึ้นว่า "ยังไม่ผูก BOM"
        type: asStr(fg.item_type) || 'Assembly', unit_id: ''
      }
    };
    const walk = walkReady(ctx, st, asStr(fg.item_id), rootQty, asStr(fg.unit_name));

    // routing + work center + cost ref ของทุกสินค้าที่ผลิตเอง — ยิงรวมทีเดียวทุกระดับ
    const routings = qReadyRouting(st.allBomIds);
    const routingIds = uniq((routings.rows || []).map(r => r.routing_id));
    const steps = qReadySteps(routingIds);
    const wcIds = uniq((steps.rows || []).map(r => r.wc_id));
    const wcs = qReadyWorkCenters(wcIds);
    const wcById = groupOne(wcs.rows, 'wc_id');
    const madeItemIds = Object.keys(st.byItem).filter(k => st.byItem[k].bomPick
      && st.byItem[k].bomPick.bom);
    const costRefs = qCostRef(madeItemIds);

    const nodeByItem = {};
    walk.nodes.forEach(n => {
      if (!n.made || !n.bom || !n.bom.bom) return;
      const rt = pickRouting(routings, n.bom.bom.bom_id, n.depth === 0 ? locId : '', subId);
      n.routing = rt;
      n.steps = rt.routing
        ? (steps.rows || []).filter(r => asStr(r.routing_id) === asStr(rt.routing.routing_id))
        : [];
      n.steps_failed = steps.failed;
      n.wcs = n.steps.map(s => {
        const wc = wcById[asStr(s.wc_id)] || null;
        return { step: s, wc: wc };
      });
      const stepWcIds = uniq(n.steps.map(s => s.wc_id));
      n.cost_ref = costRefByWorkCenter(costRefs, n.item_id, stepWcIds, subId, dateIso);
      nodeByItem[n.item_id] = n;
    });

    // สต๊อก: ดึงให้ทุกสินค้าที่เจอ ไม่ใช่แค่ปลายทาง — ของกึ่งสำเร็จรูปที่มีอยู่แล้วก็เป็นข้อมูลที่ต้องเห็น
    const stock = qReadyStock(st.itemIds, stockLocs);
    const stockByItem = {};
    (stock.rows || []).forEach(r => {
      const k = asStr(r.item_id);
      if (!stockByItem[k]) stockByItem[k] = { on_hand: 0, avail: 0, committed: 0, rows: [] };
      stockByItem[k].on_hand += asNum(r.on_hand);
      stockByItem[k].avail += asNum(r.avail);
      stockByItem[k].committed += asNum(r.committed);
      stockByItem[k].rows.push(r);
    });

    // ยอดที่ต้องใช้ของสินค้าเดียวกันอาจมาจากหลายกิ่ง — ต้องรวมก่อนเทียบสต๊อก
    const needRows = Object.keys(walk.leafNeed).map(k => {
      const n = walk.leafNeed[k];
      const s = stockByItem[k] || { on_hand: 0, avail: 0, committed: 0, rows: [] };
      const shortOnHand = n.qty - s.on_hand;
      const shortAvail = n.qty - s.avail;
      return {
        item_id: k, code: n.code, name: n.name, type: n.type, unit_name: n.unit_name,
        need: n.qty, on_hand: s.on_hand, avail: s.avail, committed: s.committed,
        short: shortOnHand > 0 ? shortOnHand : 0,
        short_avail: shortAvail > 0 ? shortAvail : 0,
        locs: s.rows.slice().sort((a, b) => asNum(b.on_hand) - asNum(a.on_hand))
      };
    }).sort((a, b) => (b.short - a.short) || asStr(a.code).localeCompare(asStr(b.code)));

    // ตรวจยันกับบรรทัด component บนใบสั่งผลิตเอง — ยอดชั้นที่ 1 ต้องตรงกัน
    // ไม่ตรง = BOM ถูกแก้หลังเปิด WO (หรือสูตรระเบิดของรายงานผิด) ทั้งสองอย่างต้องรู้
    const woComp = {};
    lines.filter(r => asStr(r.mainline) === 'F' && !isYes(r.is_summary)
      && asNum(r.quantity) !== 0).forEach(r => {
        const k = asStr(r.item_id);
        woComp[k] = (woComp[k] || 0) + Math.abs(asNum(r.quantity));
      });
    const lvl1 = basis === 'wo' ? walk.nodes.filter(n => n.depth === 1) : [];
    const woCheck = lvl1.map(n => {
      const onWo = woComp[n.item_id];
      const has = onWo != null;
      const tol = Math.max(0.001, Math.abs(n.need) * 1e-4);
      return {
        code: n.code, item_id: n.item_id, need: n.need, on_wo: has ? onWo : null,
        unit_name: n.unit_name,
        match: has ? Math.abs(onWo - n.need) <= tol : false, missing: !has
      };
    });
    const woExtra = Object.keys(woComp).filter(k => !lvl1.some(n => n.item_id === k))
      .map(k => {
        const ln = lines.filter(r => asStr(r.item_id) === k)[0] || {};
        return { item_id: k, code: asStr(ln.item_code), qty: woComp[k], unit_name: asStr(ln.unit_name) };
      });

    const locRow = (locList.rows || []).filter(l => asStr(l.loc_id) === locId)[0] || null;

    return {
      ok: true,
      woKey: rp.woKey,
      params: rp,
      basis: basis,
      wo: wo,
      wo_id: woId,
      fg: fg,
      sub_id: subId,
      loc_id: locId,
      loc_name: asStr(woLoc.loc_name) || (locRow ? asStr(locRow.loc_name) : ''),
      date_iso: dateIso,
      root_qty: rootQty,
      qty_basis: qtyBasis,
      batch_qty: batchQty,
      qty_from_wo: defaultQty,
      locations: locList.rows || [],
      stock_locs: stockLocs,
      // ระดับที่รายงานไล่ได้จริง = ชั้นที่ลึกสุดในต้นไม้ ไม่ใช่รอบที่ loop โหลดโครง
      // (โครงชั้นสุดท้ายถูกโหลดพร้อมกับชั้นก่อนหน้า จึงนับจาก node ตรง ๆ ไม่ให้ต่างกัน 1)
      depth_reached: walk.nodes.reduce((m, n) => (n.depth > m ? n.depth : m), 0),
      struct_failed: st.failed,
      stock_failed: stock.failed,
      nodes: walk.nodes,
      tree: walk.nodes[0] || null,
      need_rows: needRows,
      stock_by_item: stockByItem,
      wo_check: woCheck,
      wo_extra: woExtra,
      routing_failed: routings.failed,
      cost_ref_failed: costRefs.failed
    };
  }

  /**
   * หาสินค้าจากรหัส — ใช้ตอนยังไม่มีใบสั่งผลิต
   * วันตั้ง master (D1 ของ UAT) ยังไม่มีใบสั่งผลิตให้อ้าง แต่ต้องตรวจ master ให้ได้แล้ว
   * รับได้ทั้งรหัสสินค้าและ internal id
   */
  function qReadyItem(key) {
    const k = asStr(key).trim();
    if (!k) return [];
    const byId = /^\d+$/.test(k);
    return runSQL('สินค้าจากรหัส', `
      SELECT I.id                    AS item_id,
             I.itemid                AS item_code,
             I.displayname           AS item_name,
             I.itemtype              AS item_type,
             NVL(I.isinactive, 'F')  AS item_inactive,
             I.stockunit             AS stock_unit_id,
             BUILTIN.DF(I.stockunit) AS stock_unit_name
      FROM item I
      WHERE (UPPER(I.itemid) = UPPER(?) ${byId ? 'OR I.id = ' + k : ''})
      ORDER BY CASE WHEN UPPER(I.itemid) = UPPER(?) THEN 0 ELSE 1 END
    `, [k, k]);
    // วงเล็บรอบ OR และการเรียงให้รหัสสินค้ามาก่อน internal id — กันกรณีรหัสของสินค้าตัวหนึ่ง
    // ไปตรงกับ internal id ของอีกตัว แล้วหยิบผิดตัวเงียบ ๆ
  }

  /** คลังของใบสั่งผลิต — อ่านจากบรรทัดหลัก */
  function qReadyWOLocation(woId) {
    const rows = runSQL('คลังของใบสั่งผลิต', `
      SELECT TL.location             AS loc_id,
             BUILTIN.DF(TL.location) AS loc_name
      FROM transactionline TL
      WHERE TL.transaction = ? AND TL.mainline = 'T'
    `, [woId]);
    return rows[0] || { loc_id: '', loc_name: '' };
  }

  /** map จาก id → แถวเดียว (ตารางอ้างอิงที่ id ไม่ซ้ำ) */
  function groupOne(rows, key) {
    const out = {};
    (rows || []).forEach(r => { out[asStr(r[key])] = r; });
    return out;
  }

  // ─── คำตัดสินและข้อความ ────────────────────────────────────────────────────

  /** ผลตรวจ 1 ช่อง — cls ใช้ระบายสี, text คือคำอธิบายภาษาคน */
  function readyVerdict(cls, text) { return { cls: cls, text: text }; }

  function bomVerdictText(n) {
    const b = n.bom;
    if (!b) return readyVerdict('info', 'ไม่ต้องมี BOM (ไม่ใช่สินค้าที่ผลิตเอง)');
    if (b.verdict === 'unknown') return readyVerdict('unk', 'อ่านไม่สำเร็จ — ดูท้ายหน้า');
    if (b.verdict === 'none') return readyVerdict('bad', 'ยังไม่ผูก BOM กับสินค้านี้');
    if (b.verdict === 'inactive') return readyVerdict('bad', 'มี BOM แต่ถูกปิดใช้งานทั้งหมด');
    if (b.verdict === 'expired') {
      return readyVerdict('bad', 'มี BOM แต่ช่วงผลบังคับไม่ครอบวันที่เอกสาร');
    }
    if (b.verdict === 'ambiguous') {
      return readyVerdict('bad', 'มี BOM ' + (b.others || []).length
        + ' ใบ แต่ไม่มีใบไหนตั้งเป็น master default' + (b.strict ? ' หรือ default ของคลังนี้' : '')
        + ' — ระบบเลือกไม่ได้');
    }
    const name = asStr(b.bom.bom_name);
    if (b.verdict === 'loc') {
      return readyVerdict('ok', 'default ของคลัง ' + asStr(b.bom.def_loc_name) + ' · ' + name);
    }
    if (b.verdict === 'duploc') {
      return readyVerdict('warn', 'มีมากกว่า 1 ใบตั้งเป็น default ของคลังนี้ — ใช้ ' + name);
    }
    // มี BOM ใบเดียว = ไม่มีอะไรให้เลือกผิด ไม่ใช่ข้อสังเกต
    if (b.verdict === 'single') return readyVerdict('ok', name);
    // master default ขณะมีหลายใบ = จุดที่คนตั้งค่าควรยืนยัน เพราะใบอื่นอาจเป็นใบที่ต้องการ
    return readyVerdict('warn', 'มี BOM ' + (b.others || []).length
      + ' ใบ ใช้ใบที่เป็น master default · ' + name);
  }

  function revVerdictText(n) {
    if (!n.bom || !n.bom.bom) return readyVerdict('info', '—');
    const r = n.rev;
    if (!r) return readyVerdict('unk', 'ยังไม่ได้ตรวจ');
    if (r.verdict === 'unknown') return readyVerdict('unk', 'อ่านไม่สำเร็จ — ดูท้ายหน้า');
    if (r.verdict === 'none') return readyVerdict('bad', 'BOM นี้ยังไม่มี revision');
    if (r.verdict === 'inactive') return readyVerdict('bad', 'มี revision แต่ถูกปิดใช้งานทั้งหมด');
    if (r.verdict === 'expired') {
      return readyVerdict('bad', 'ไม่มี revision ที่มีผลบังคับ ณ วันที่เอกสาร');
    }
    const nm = asStr(r.rev.rev_name) + ' (' + asStr(r.rev.eff_start) + ' → '
      + (asStr(r.rev.eff_end) || 'ไม่กำหนด') + ')';
    if (r.verdict === 'notcurrent') {
      return readyVerdict('warn', 'ใบที่ระบบตั้งเป็น current ใช้วันนี้ไม่ได้ — ใช้ ' + nm);
    }
    return readyVerdict('ok', nm);
  }

  function compVerdictText(n) {
    if (!n.bom || !n.bom.bom || !n.rev || !n.rev.rev) return readyVerdict('info', '—');
    const c = (n.children || []).length;
    if (!c) return readyVerdict('bad', 'revision ไม่มี component เลย');
    const bad = (n.children || []).filter(x => x.notes.some(t => t.cls === 'bad')).length;
    if (bad) return readyVerdict('warn', c + ' รายการ · มีปัญหา ' + bad + ' รายการ');
    return readyVerdict('ok', c + ' รายการ');
  }

  function routingVerdictText(n) {
    if (!n.made || !n.bom || !n.bom.bom) return readyVerdict('info', '—');
    const rt = n.routing;
    if (!rt) return readyVerdict('unk', 'ยังไม่ได้ตรวจ');
    if (rt.verdict === 'unknown') return readyVerdict('unk', 'อ่านไม่สำเร็จ — ดูท้ายหน้า');
    if (rt.verdict === 'none') return readyVerdict('bad', 'ยังไม่ตั้ง routing ให้ BOM นี้');
    if (rt.verdict === 'inactive') return readyVerdict('bad', 'มี routing แต่ถูกปิดใช้งาน');
    if (rt.verdict === 'otherloc') {
      return readyVerdict('bad', 'มี routing ' + (rt.others || []).length
        + ' ใบ แต่ไม่มีใบไหนของคลังที่ใบสั่งผลิตนี้ผลิต ('
        + uniq((rt.others || []).map(r => asStr(r.loc_name) || 'ไม่ระบุคลัง')).join(' · ') + ')');
    }
    if (rt.verdict === 'ambiguous') {
      return readyVerdict('warn', 'มี routing ' + (rt.others || []).length
        + ' ใบ ไม่มีใบไหนเป็น default — ต้องดูเองว่าใบไหนใช้กับสินค้านี้');
    }
    if (!n.steps.length) {
      return readyVerdict('bad', asStr(rt.routing.routing_name) + ' — ไม่มีขั้นตอน (operation) เลย');
    }
    const noWc = n.wcs.filter(w => !asStr(w.step.wc_id)).length;
    const badWc = n.wcs.filter(w => asStr(w.step.wc_id)
      && (!w.wc || isYes(w.wc.wc_inactive) || !isYes(w.wc.is_wc))).length;
    const ops = n.steps.map(s => asStr(s.op_name)).join(' → ');
    if (noWc) return readyVerdict('bad', ops + ' — ' + noWc + ' ขั้นตอนไม่ได้ระบุ work center');
    if (badWc) return readyVerdict('bad', ops + ' — work center ' + badWc + ' ตัวใช้งานไม่ได้');
    // work center ที่ผูกคลังไว้คนละคลังกับ routing = การตั้งค่าที่ขัดกันเอง (M-06)
    // เทียบกับคลังของ routing ไม่ใช่คลังของ FG จึงใช้ได้ทุกชั้น
    const wrongLocWc = n.wcs.filter(w => w.wc && asStr(w.wc.wc_loc)
      && asStr(rt.routing.loc_id) && asStr(w.wc.wc_loc) !== asStr(rt.routing.loc_id));
    if (wrongLocWc.length) {
      return readyVerdict('warn', ops + ' — work center '
        + wrongLocWc.map(w => asStr(w.wc.wc_name) + ' (' + (asStr(w.wc.wc_loc_name) || 'ไม่ระบุ') + ')').join(' · ')
        + ' ผูกคลังไว้คนละคลังกับ routing (' + asStr(rt.routing.loc_name) + ')');
    }
    // คลังของ routing บอกไว้เป็นข้อเท็จจริง — ของกึ่งสำเร็จรูปถูกผลิตที่คลังของตัวเอง
    // ไม่ใช่คลังของ FG จึงไม่ใช่ความผิดพลาด (ข้อมูลจริงบน SB1: semi ผลิตที่ RMRD)
    const at = asStr(rt.routing.loc_name) ? ' @' + asStr(rt.routing.loc_name) : ' (ไม่ระบุคลัง)';
    if (rt.verdict === 'duploc') {
      return readyVerdict('warn', ops + at + ' — มี routing มากกว่า 1 ใบของคลังนี้');
    }
    if (rt.verdict === 'default' && (rt.others || []).length > 1) {
      return readyVerdict('warn', ops + at + ' — มี routing ' + rt.others.length
        + ' ใบ ใช้ใบที่เป็น default');
    }
    return readyVerdict('ok', ops + at);
  }

  function costRefVerdictText(n) {
    if (!n.made || !n.bom || !n.bom.bom) return readyVerdict('info', '—');
    const cr = n.cost_ref;
    if (!cr) return readyVerdict('unk', 'ยังไม่ได้ตรวจ');
    if (cr.verdict === 'unknown') return readyVerdict('unk', 'อ่านไม่สำเร็จ — ดูท้ายหน้า');
    if (cr.verdict === 'nowc') {
      return readyVerdict('unk', 'ตรวจไม่ได้ — ยังไม่รู้ work center (ต้องมี routing ก่อน)');
    }
    if (cr.verdict === 'none') {
      const any = (cr.itemRows || []).length;
      return readyVerdict('bad', any
        ? 'มี Cost ref ' + any + ' แถว แต่ไม่ตรง work center ที่ routing ใช้เลย'
        : 'ยังไม่ตั้ง Cost ref ให้สินค้านี้');
    }
    if (cr.verdict === 'partial') {
      return readyVerdict('bad', 'ขาด Cost ref ' + cr.missing.length + ' จาก '
        + (cr.covered.length + cr.missing.length) + ' work center');
    }
    return readyVerdict('ok', 'ครบทั้ง ' + cr.covered.length + ' work center · Cost ref '
      + uniq((cr.rows || []).map(r => r.cr_id)).join(', '));
  }

  function stockVerdictText(n, rd) {
    if (!n.leaf) return readyVerdict('info', '—');
    const row = rd.need_rows.filter(r => r.item_id === n.item_id)[0];
    if (!row) return readyVerdict('unk', '—');
    if (rd.stock_failed) return readyVerdict('unk', 'อ่านยอดคงเหลือไม่สำเร็จ — ดูท้ายหน้า');
    if (row.short > 0) {
      return readyVerdict('bad', 'ขาด ' + fmt(row.short, 4) + ' ' + asStr(row.unit_name)
        + ' (มี ' + fmt(row.on_hand, 4) + ' ต้องใช้ ' + fmt(row.need, 4) + ')');
    }
    if (row.short_avail > 0) {
      return readyVerdict('warn', 'ของพอแต่ถูกจองไว้ ' + fmt(row.committed, 4)
        + ' — พร้อมใช้ ' + fmt(row.avail, 4) + ' ต้องใช้ ' + fmt(row.need, 4));
    }
    return readyVerdict('ok', 'มี ' + fmt(row.on_hand, 4) + ' ' + asStr(row.unit_name));
  }

  /** ลำดับความรุนแรงของทั้งหน้า — bad สำคัญกว่า unk สำคัญกว่า warn */
  function readyRowVerdicts(n, rd) {
    return [bomVerdictText(n), revVerdictText(n), compVerdictText(n),
      routingVerdictText(n), costRefVerdictText(n), stockVerdictText(n, rd)];
  }

  // ─── render ชั้นความพร้อม ──────────────────────────────────────────────────

  const READY_ICON = { ok: '✓', bad: '✕', warn: '!', unk: '?', info: '–' };

  function readyCell(v) {
    return '<td class="rv ' + v.cls + '"><b>' + READY_ICON[v.cls] + '</b> '
      + esc(v.text) + '</td>';
  }

  function renderReadyForm(rd) {
    const s = runtime.getCurrentScript();
    const p = rd.params || {};
    const chosen = {};
    (rd.stock_locs || []).forEach(id => { chosen[asStr(id)] = true; });
    const opts = (rd.locations || []).map(l =>
      `<option value="${esc(l.loc_id)}"${chosen[asStr(l.loc_id)] ? ' selected' : ''}>`
      + esc(asStr(l.loc_name)) + (isYes(l.is_plant) ? ' · คลังผลิต' : '') + '</option>').join('');
    // ช่องเลือกหลายคลังส่งค่าซ้ำชื่อเดียวกัน ซึ่ง request.parameters อ่านได้ไม่แน่นอน
    // จึงรวมเป็นสตริงเดียวใส่ช่องซ่อนตอน submit แล้วฝั่งเซิร์ฟเวอร์อ่านค่าเดียวพอ
    return `<form method="get" onsubmit="var s=document.getElementById('rlocsel');
      document.getElementById('rlocval').value=(s.selectedOptions.length?
      Array.prototype.map.call(s.selectedOptions,function(o){return o.value}).join(','):'');">
      <input type="hidden" name="script" value="${esc(s.id)}">
      <input type="hidden" name="deploy" value="${esc(s.deploymentId)}">
      <input type="hidden" name="rloc" id="rlocval" value="${esc(p.locAll ? 'all' : (rd.stock_locs || []).join(','))}">
      <label>เลขที่ใบสั่งผลิต หรือรหัสสินค้า</label>
      <input type="text" name="ready" value="${esc(rd.woKey)}"
        placeholder="WO-FSC-00000392 หรือ 10010900101" style="width:210px">
      &nbsp;<label>วันที่ที่ใช้ตรวจ master</label>
      <input type="text" name="rdate" value="${esc(p.asOf || '')}" placeholder="${esc(asStr(rd.date_iso))}" style="width:110px">
      &nbsp;<label>จำนวนที่จะผลิต</label>
      <input type="text" name="rqty" value="${esc(p.qtyOverride || '')}" placeholder="${esc(fmt(rd.qty_from_wo, 4))}" style="width:100px">
      <br style="line-height:9px">
      <label>คลังที่ใช้เทียบสต๊อก (กด Ctrl เลือกได้หลายคลัง)</label>
      <select id="rlocsel" multiple size="6" style="min-width:260px;vertical-align:top">
        <option value="all"${p.locAll ? ' selected' : ''}>— ทุกคลัง —</option>${opts}</select>
      &nbsp;<button type="submit" class="btn primary">ตรวจความพร้อม</button>
      <div class="sub" style="margin-top:6px">
        ใส่เลขที่ใบสั่งผลิต: จำนวน วันที่ และคลัง มาจากใบนั้น · ใส่รหัสสินค้า (ยังไม่มีใบสั่งผลิต):
        จำนวนใช้ขนาด batch ของ revision · วันที่ = วันนี้ · คลังแรกที่เลือกถูกใช้เป็นคลังผลิต
        <br>เลือกคลังป้อน (เช่น RMRD · WRM-NP) เพิ่มด้วย ถ้าของยังรออยู่ที่คลังป้อนแล้วย้ายเข้าด้วย TO
        · ตรวจ master สำหรับ UAT ให้ใส่วันที่ที่เอกสารจะลง เช่น 2026-08-13
      </div>
    </form>`;
  }

  /** สรุปหัวเรื่อง — ตอบคำถามเดียวว่าใบนี้เดินงานได้หรือยัง */
  function renderReadyKpis(rd) {
    let bad = 0, warn = 0, unk = 0;
    rd.nodes.forEach(n => {
      readyRowVerdicts(n, rd).forEach(v => {
        if (v.cls === 'bad') bad++; else if (v.cls === 'warn') warn++; else if (v.cls === 'unk') unk++;
      });
      n.notes.forEach(t => { if (t.cls === 'bad') bad++; else if (t.cls === 'warn') warn++; });
    });
    const shortItems = rd.need_rows.filter(r => r.short > 0).length;
    const madeCount = rd.nodes.filter(n => n.made && n.bom && n.bom.bom).length;
    const woBad = rd.wo_check.filter(c => !c.match).length;

    // ทางเข้าด้วยรหัสสินค้าที่ไม่เลือกคลัง = ข้าม M-02/M-05 ส่วนที่ตัดสินตามคลังไปทั้งดุ้น
    // ต้องไม่สรุปว่า "พร้อม" เพราะคนทดสอบที่ลืมเลือกคลังจะได้หน้าที่เขียวเกินความจริง
    const skipLoc = rd.basis === 'item' && !rd.loc_id;
    const verdict = bad ? 'ยังไม่พร้อม'
      : ((unk || skipLoc) ? 'ตรวจไม่ครบ' : (warn ? 'พร้อมแบบมีข้อสังเกต' : 'พร้อม'));
    return '<div class="kpi-grid">'
      + kpi('คำตัดสินรวม', esc(verdict),
        bad ? 'bad' : ((unk || skipLoc) ? 'warn' : (warn ? 'warn' : 'ok')),
        skipLoc ? 'ยังไม่เลือกคลัง — ข้ามการตรวจที่ตัดสินตามคลัง' : '')
      + kpi('รายการที่ต้องแก้', esc(String(bad)), bad ? 'bad' : 'ok')
      + kpi('ข้อสังเกต', esc(String(warn)), warn ? 'warn' : 'ok')
      + kpi('ตรวจไม่ได้ (query พัง)', esc(String(unk)), unk ? 'warn' : 'ok')
      + kpi('สินค้าในสายการผลิต · ผลิตเอง', esc(String(rd.nodes.length)) + ' · ' + esc(String(madeCount)))
      + kpi('ระดับ BOM ที่ไล่ได้', esc(String(rd.depth_reached)))
      + kpi('วัตถุดิบที่ของไม่พอ', esc(String(shortItems)), shortItems ? 'bad' : 'ok')
      + (rd.basis === 'wo'
        ? kpi('ยอดชั้นที่ 1 ไม่ตรงบรรทัดบน WO', esc(String(woBad)), woBad ? 'warn' : 'ok')
        : kpi('ยันยอดกับใบสั่งผลิต', 'ยังไม่มีใบ', 'info'))
      + '</div>';
  }

  /** งานที่ต้องทำก่อน UAT — รวมทุกปัญหาไว้ที่เดียวเรียงตามความรุนแรง */
  function renderReadyTodo(rd) {
    const items = [];
    rd.nodes.forEach(n => {
      const label = asStr(n.code) + (n.depth ? ' (ชั้น ' + n.depth + ')' : ' (สินค้าที่ผลิต)');
      const vs = readyRowVerdicts(n, rd);
      const names = ['BOM', 'Revision', 'Component', 'Routing', 'Cost ref', 'สต๊อก'];
      vs.forEach((v, i) => {
        if (v.cls === 'bad' || v.cls === 'unk') {
          items.push({ cls: v.cls, text: label + ' · ' + names[i] + ' — ' + v.text });
        }
      });
      n.notes.forEach(t => {
        if (t.cls === 'bad') items.push({ cls: 'bad', text: label + ' — ' + t.text });
      });
    });
    if (!items.length) {
      return '<div class="card ok">ไม่พบงานค้างที่ต้องแก้ก่อนเริ่มทดสอบ '
        + '(ข้อสังเกตสีเหลืองในตารางยังควรอ่านก่อน)</div>';
    }
    const order = { bad: 0, unk: 1 };
    items.sort((a, b) => order[a.cls] - order[b.cls]);
    return '<div class="card"><b>ต้องเคลียร์ก่อนเริ่มทดสอบ ' + items.length + ' เรื่อง</b><ol class="todo">'
      + items.map(i => '<li class="' + i.cls + '">' + esc(i.text) + '</li>').join('')
      + '</ol></div>';
  }

  function renderReadyTree(rd) {
    let h = '<div class="scroll"><table><thead><tr>'
      + '<th>สินค้า (ตามชั้น BOM)</th><th class="n">ต้องใช้</th><th>หน่วย</th>'
      + '<th>BOM · M-02</th><th>Revision · M-03</th><th>Component · M-04</th>'
      + '<th>Routing + Work center · M-05/06</th><th>Cost ref ตาม WC · M-09</th>'
      + '<th>ยอดคงเหลือ</th></tr></thead><tbody>';
    rd.nodes.forEach(n => {
      const pad = 'padding-left:' + (4 + n.depth * 18) + 'px';
      const kind = n.made && n.bom && n.bom.bom ? 'ผลิตเอง' : (n.leaf ? 'ปลายทาง' : '');
      const vs = readyRowVerdicts(n, rd);
      h += '<tr>'
        + '<td style="' + pad + '">' + itemLink(n.item_id, n.code)
        + ' <span class="dim">' + esc(n.name) + '</span>'
        + (kind ? ' <span class="tag">' + esc(kind) + '</span>' : '')
        + (n.item_source ? ' <span class="tag">' + esc(n.item_source) + '</span>' : '')
        + (n.notes.length ? '<div class="note">' + n.notes.map(t =>
          '<span class="' + t.cls + '">' + esc(t.text) + '</span>').join('<br>') + '</div>' : '')
        + '</td>'
        + numCell(n.need, 5)
        + '<td>' + esc(n.unit_name) + '</td>'
        + vs.map(readyCell).join('')
        + '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  /** ตารางวัตถุดิบที่ต้องมีของจริง — รวมยอดข้ามกิ่งแล้ว พร้อมแยกรายคลัง */
  function renderReadyStock(rd) {
    if (!rd.need_rows.length) return '';
    const locLabel = rd.stock_locs.length
      ? rd.stock_locs.map(id => {
        const l = (rd.locations || []).filter(x => asStr(x.loc_id) === asStr(id))[0];
        return l ? asStr(l.loc_name) : id;
      }).join(' · ')
      : 'ทุกคลัง';
    let h = '<p class="sub">คลังที่นับ: <b>' + esc(locLabel) + '</b>'
      + ' · ยอดที่ต้องใช้รวมทุกกิ่งของ BOM แล้ว (สินค้าตัวเดียวกันที่ถูกใช้หลายที่นับครั้งเดียว)</p>';
    h += '<table><tr><th>รหัส</th><th>ชื่อ</th><th>หน่วย</th><th class="n">ต้องใช้</th>'
      + '<th class="n">คงเหลือ</th><th class="n">ถูกจองไว้</th><th class="n">พร้อมใช้</th>'
      + '<th class="n">ขาด</th><th>อยู่คลังไหน</th></tr>';
    rd.need_rows.forEach(r => {
      const locs = r.locs.map(l => esc(asStr(l.loc_name)) + ' ' + esc(fmt(asNum(l.on_hand), 2)))
        .join(' · ');
      h += '<tr>'
        + '<td>' + itemLink(r.item_id, r.code) + '</td>'
        + '<td>' + esc(r.name) + '</td>'
        + '<td>' + esc(r.unit_name) + '</td>'
        + numCell(r.need, 5) + numCell(r.on_hand, 4) + numCell(r.committed, 4)
        + numCell(r.avail, 4)
        + numCell(r.short, 4, r.short > 0 ? 'bad' : '')
        + '<td class="note">' + (locs || '<span class="miss">ไม่มีของในคลังที่เลือก</span>') + '</td>'
        + '</tr>';
    });
    h += '</table>';
    return h;
  }

  /** ยันยอดชั้นที่ 1 กับบรรทัด component บนใบสั่งผลิตเอง */
  function renderReadyWoCheck(rd) {
    let h = '<p class="sub">ยอดที่รายงานระเบิดจาก BOM ต้องเท่ากับบรรทัด component '
      + 'ที่อยู่บนใบสั่งผลิตใบนี้ ไม่เท่ากันแปลว่า BOM ถูกแก้หลังเปิดใบสั่งผลิต '
      + '(หรือสูตรระเบิดของรายงานผิด) ทั้งสองกรณีต้องรู้ก่อนทดสอบ</p>';
    h += '<table><tr><th>รหัส</th><th class="n">ระเบิดจาก BOM</th>'
      + '<th class="n">บนใบสั่งผลิต</th><th class="n">ผลต่าง</th><th>ผล</th></tr>';
    rd.wo_check.forEach(c => {
      const diff = c.on_wo == null ? null : c.on_wo - c.need;
      h += '<tr><td>' + itemLink(c.item_id, c.code) + '</td>'
        + numCell(c.need, 5)
        + (c.on_wo == null ? '<td class="n miss">ไม่มีบรรทัด</td>' : numCell(c.on_wo, 5))
        + (diff == null ? '<td class="n z">—</td>' : numCell(diff, 5, c.match ? '' : 'bad'))
        + '<td class="' + (c.match ? 'ok' : 'bad') + '">' + (c.match ? 'ตรง' : 'ไม่ตรง') + '</td></tr>';
    });
    rd.wo_extra.forEach(e => {
      h += '<tr><td>' + itemLink(e.item_id, e.code) + '</td>'
        + '<td class="n z">—</td>' + numCell(e.qty, 5)
        + '<td class="n z">—</td>'
        + '<td class="warn">มีบนใบสั่งผลิตแต่ไม่อยู่ใน BOM ที่รายงานเลือก</td></tr>';
    });
    h += '</table>';
    return h;
  }

  /** ฐานของจำนวนที่ใช้คิด — ต้องบอกทุกครั้ง ไม่งั้นอ่านตัวเลขผิดฐานแล้วไม่รู้ตัว */
  const QTY_BASIS_LABEL = {
    wo: 'จำนวนบนใบสั่งผลิต',
    batch: 'ขนาด batch ของ revision',
    one: 'ไม่ได้ตั้งขนาด batch — ใช้ 1 หน่วยเป็นฐาน',
    manual: 'กรอกเอง'
  };

  function renderReadyHeader(rd) {
    const w = rd.wo;
    const byItem = rd.basis === 'item';
    const qtyNote = ' <span class="tag">' + esc(QTY_BASIS_LABEL[rd.qty_basis] || '') + '</span>'
      + (rd.qty_basis === 'manual' && rd.qty_from_wo
        ? ' <span class="tag">ค่าตั้งต้น ' + esc(fmt(rd.qty_from_wo, 4)) + '</span>' : '');
    const dateNote = rd.params.asOf ? ' <span class="tag">ระบุเอง</span>'
      : (byItem ? ' <span class="tag">วันนี้</span>' : ' <span class="tag">วันที่ใบสั่งผลิต</span>');
    const first = byItem
      ? `<tr><td>ทางเข้า</td><td>รหัสสินค้า <span class="tag">ยังไม่มีใบสั่งผลิต</span></td>
          <td>คลังที่ใช้เป็นคลังผลิต</td><td>${rd.loc_id
            ? esc(rd.loc_name) + ' <span class="tag">id ' + esc(rd.loc_id) + '</span>'
            : '<span class="miss">ไม่ได้เลือก — ข้ามการตรวจ BOM/routing ตามคลัง</span>'}</td></tr>`
      : `<tr><td>ใบสั่งผลิต</td><td>${tranLink('workorder', rd.wo_id, asStr(w.wo_no))}
          <span class="tag">id ${esc(rd.wo_id)}</span></td>
          <td>คลังที่ผลิต</td><td>${esc(rd.loc_name)} <span class="tag">id ${esc(rd.loc_id)}</span></td></tr>`;
    return `<div class="card"><table class="kv">
      ${first}
      <tr><td>สินค้าที่ผลิต</td><td>${itemLink(rd.fg.item_id, asStr(rd.fg.item_code) + ' — ' + asStr(rd.fg.item_name))}</td>
          <td>จำนวนที่ใช้คิด</td><td><b>${esc(fmt(rd.root_qty, 4))}</b> ${esc(asStr(rd.fg.unit_name))}${qtyNote}</td></tr>
      <tr><td>วันที่ตรวจ master</td><td>${esc(rd.date_iso)}${dateNote}</td>
          <td>บริษัท (id)</td><td>${rd.sub_id ? esc(rd.sub_id)
            : '<span class="info">ไม่จำกัด (ไม่มีเอกสารให้อ่าน)</span>'}</td></tr>
    </table></div>`;
  }

  function renderReadyPage(rd) {
    let h = '<h1>ความพร้อม master ก่อนเริ่มทดสอบ</h1>'
      + '<p class="sub">ไล่ BOM ทุกระดับจากสินค้าที่ผลิต แล้วตรวจว่า master ที่ต้องใช้ตั้งครบหรือยัง '
      + '— ตรงตาม check point M-02 ถึง M-06 และ M-09 ของ UAT</p>';
    h += '<div class="crumb"><a href="' + selfUrl(filterParams(rd.filters))
      + '">← กลับภาพรวมต้นทุน</a>'
      + (rd.ok && rd.basis === 'wo'
        ? ' · <a href="' + selfUrl({ wo: rd.woKey }) + '">ดูที่มาของต้นทุนใบนี้</a>' : '')
      + '</div>';
    h += renderReadyForm(rd);
    const page = (body) => shell('ความพร้อม master ก่อนเริ่มทดสอบ', body, READY_CSS);
    if (!rd.ok) {
      return page(h + '<div class="err">' + esc(asStr(rd.error) || 'ตรวจไม่สำเร็จ') + '</div>' + renderQLog());
    }
    h += renderReadyHeader(rd) + renderReadyKpis(rd) + renderReadyTodo(rd);
    if (rd.struct_failed) {
      h += '<div class="err">คำสั่งอ่านโครง BOM พังบางส่วน — ช่องที่ขึ้น "?" คืออ่านไม่สำเร็จ '
        + 'ไม่ได้แปลว่ายังไม่ตั้งค่า ดูรายละเอียดท้ายหน้า</div>';
    }
    h += '<h2>สายการผลิตตามชั้น BOM</h2>' + renderReadyTree(rd);
    h += '<h2>ของที่ต้องมีในคลัง</h2>' + renderReadyStock(rd);
    if (rd.basis === 'wo') {
      h += '<h2>ยันยอดกับใบสั่งผลิต</h2>' + renderReadyWoCheck(rd);
    } else {
      // ทางเข้าด้วยรหัสสินค้าไม่มีบรรทัดเอกสารให้ยันยอด จึงต้องบอกตรง ๆ ว่าตัวเลขยังไม่ถูกยัน
      h += '<h2>ยันยอดกับใบสั่งผลิต</h2><p class="sub">ยังไม่มีใบสั่งผลิตให้เทียบ '
        + 'ปริมาณที่แสดงคิดจาก BOM โดยตรงบนฐาน <b>' + esc(fmt(rd.root_qty, 4)) + ' '
        + esc(asStr(rd.fg.unit_name)) + '</b> (' + esc(QTY_BASIS_LABEL[rd.qty_basis] || '') + ') '
        + 'เปิดรายงานนี้ซ้ำด้วยเลขที่ใบสั่งผลิตหลังเปิดใบแล้ว จะได้ตารางยันยอดรายบรรทัด</p>';
    }
    h += '<h2>เอกสารอ้างอิงทางเทคนิค</h2>' + renderQLog();
    return page(h);
  }

  /** CSS เฉพาะชั้นความพร้อม — ต่อท้ายบล็อกกลาง เขียนด้วย token เหมือนกัน */
  const READY_CSS = '<style>'
    + 'td.rv{font-size:var(--fs-xs);line-height:1.35;max-width:230px}'
    + 'td.rv b{font-family:var(--pj-mono);font-size:var(--fs-sm)}'
    + 'td.rv.ok{background:var(--pj-success-bg)}td.rv.ok b{color:var(--pj-success)}'
    + 'td.rv.bad{background:var(--pj-error-bg)}td.rv.bad b{color:var(--pj-error)}'
    + 'td.rv.warn{background:var(--pj-warning-bg)}td.rv.warn b{color:var(--pj-warning)}'
    + 'td.rv.unk{background:var(--pj-muted-bg)}td.rv.unk b{color:var(--pj-text-muted)}'
    + 'td.rv.info{color:var(--pj-text-muted)}td.rv.info b{color:var(--pj-border-strong)}'
    + '.dim{color:var(--pj-text-muted)}'
    + 'ol.todo{margin:7px 0 0 18px;padding:0;font-size:var(--fs-sm);line-height:1.6}'
    + 'ol.todo li.bad{color:var(--pj-error)}'
    + 'ol.todo li.unk{color:var(--pj-text-muted)}'
    + '.card.ok{border-color:var(--pj-success);color:var(--pj-success)}'
    + '</style>';

  // entry เรียกแค่ 4 ตัวนี้ · เพิ่ม export ใหม่เมื่อ entry ต้องใช้จริงเท่านั้น
  return {
    readReadyParams: readReadyParams,
    buildReady: buildReady,
    renderReadyPage: renderReadyPage,
    READY_CSS: READY_CSS
  };
});
