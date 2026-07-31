/**
 * WOStatusTracking_Queries.js
 * NetSuite SuiteScript 2.1 — Query module for WO Status Tracking
 *
 * Provides one function per checkpoint (CP1–CP8).
 * Architecture: one aggregate SuiteQL query per checkpoint, each
 * returning WO-grain (or task-grain for CP4–CP6) rows. The calling
 * module merges results by WO id in JS — no giant correlated query.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/query', 'N/log'], (query, log) => {

  // ─── NULL Normalizers ────────────────────────────────────────────────────────
  // SuiteQL returns SQL NULL as a Java ScriptNullObjectAdapter, not JS null.
  // Always pass raw column values through these helpers before use.

  function asStr(v) {
    if (v == null) return '';
    const s = String(v);
    if (s.indexOf('ScriptNullObjectAdapter') !== -1) return '';
    return s;
  }

  function asNum(v) {
    if (v == null) return 0;
    const s = String(v);
    if (s.indexOf('ScriptNullObjectAdapter') !== -1) return 0;
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }

  // ─── SuiteQL Runner ──────────────────────────────────────────────────────────

  /**
   * Thin wrapper around query.runSuiteQL with error logging.
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {Array} asMappedResults() — each element is a plain JS object
   */
  function runSQL(sql, params) {
    try {
      const result = query.runSuiteQL({ query: sql, params: params || [] });
      return result.asMappedResults();
    } catch (e) {
      log.error({ title: 'runSQL error', details: `${e.message}\nSQL: ${sql}` });
      return [];
    }
  }

  /**
   * Like runSQL but pages through all results using runSuiteQLPaged.
   * Use for queries that can return > 5000 rows (CP3a, CP7 L2+L3).
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {Array}
   */
  function runSQLPaged(sql, params) {
    try {
      const pagedResult = query.runSuiteQLPaged({ query: sql, params: params || [], pageSize: 1000 });
      const rows = [];
      pagedResult.iterator().each(page => {
        page.value.data.asMappedResults().forEach(r => rows.push(r));
        return true;
      });
      return rows;
    } catch (e) {
      log.error({ title: 'runSQLPaged error', details: `${e.message}\nSQL: ${sql}` });
      return [];
    }
  }

  // ─── IN-List Helper ───────────────────────────────────────────────────────────
  // SuiteQL does NOT support binding an array to a single ? placeholder.
  // Build the IN clause by inlining sanitized ids as string literals.
  //
  // Sanitize: allow only digits, letters, underscores, hyphens.
  // Internal ids from NetSuite are always numeric strings, so this is safe.

  function sanitizeId(id) {
    return String(id).replace(/[^a-zA-Z0-9_\-]/g, '');
  }

  /**
   * Build a SQL IN clause string from an array of ids.
   * Returns a string like "'10','20','30'" ready to embed in SQL.
   * @param {Array<string|number>} ids
   * @returns {string}
   */
  function buildInList(ids) {
    if (!ids || ids.length === 0) return "'__EMPTY__'"; // forces 0 rows
    return ids.map(id => `'${sanitizeId(id)}'`).join(',');
  }

  /**
   * Split an array into chunks of at most `size` elements.
   * Used to keep IN lists under 500 items (NetSuite parser limit).
   */
  function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Run a query that accepts a woids IN list, chunking into batches of 500
   * and concatenating results. sqlTemplate must contain the literal token
   * {{IN_LIST}} which will be replaced with the inline id list.
   * Uses runSQLPaged for potentially large result sets.
   * @param {string} sqlTemplate
   * @param {Array<string>} woids
   * @param {boolean} [paged=false]  use paged runner (for CP3a, CP7)
   * @returns {Array}
   */
  function runForWoids(sqlTemplate, woids, paged) {
    if (!woids || woids.length === 0) return [];
    const runner = paged ? runSQLPaged : runSQL;
    const chunks = chunkArray(woids, 500);
    const allRows = [];
    chunks.forEach(chunk => {
      const sql = sqlTemplate.replace('{{IN_LIST}}', buildInList(chunk));
      const rows = runner(sql);
      rows.forEach(r => allRows.push(r));
    });
    return allRows;
  }

  // ─── Base WO Filter Builder ──────────────────────────────────────────────────
  /**
   * Build the WHERE clause fragments and param array for CP1.
   * Note:
   *  - t.subsidiary is NOT_EXPOSED; filter is skipped here because the
   *    caller's date range + location filter is the practical scope control.
   *    If subsidiary filtering is required, add a tl.subsidiary predicate
   *    on the joined transactionline (see CP1 implementation).
   *  - t.location is NOT_EXPOSED; location is read from tl.location.
   *
   * @param {Object} params
   * @param {string} params.dateFrom     'YYYY-MM-DD'
   * @param {string} params.dateTo       'YYYY-MM-DD'
   * @param {string} [params.locationId]
   * @param {string} [params.subsidiaryId]
   * @returns {{ whereClauses: string[], queryParams: Array }}
   */
  function buildWoFilter(params) {
    const whereClauses = [`t.type = 'WorkOrd'`];
    const queryParams  = [];

    // ── Specific-entity filters (bypass date requirement) ─────────
    if (params.woNumber) {
      // Direct WO tranid match — e.g. WOFSC00000123
      whereClauses.push(`UPPER(t.tranid) = ?`);
      queryParams.push(params.woNumber.toUpperCase());
    } else if (params.batchNumber) {
      // Filter via released-batch name → task management → WO
      // customrecord_mfg_releasedwobatch.name = batch number string
      whereClauses.push(`EXISTS (
        SELECT 1 FROM customrecord_mfg_releasedwobatch rb
        JOIN customrecord_mfg_task_management tm
          ON tm.custrecord_mfg_tm_releasedbatch = rb.id
        WHERE tm.custrecord_mfg_tm_wo = t.id
          AND UPPER(rb.name) = ?
      )`);
      queryParams.push(params.batchNumber.toUpperCase());
    } else if (params.osNumber) {
      // Filter via order-sheet name → customrecord_mfg_os_tasks → WO
      whereClauses.push(`EXISTS (
        SELECT 1 FROM customrecord_mfg_os_tasks ost
        JOIN customrecord_mfg_os os ON os.id = ost.custrecord_mfg_os_tk_ref
        WHERE ost.custrecord_mfg_os_tk_wo = t.id
          AND UPPER(os.name) = ?
      )`);
      queryParams.push(params.osNumber.toUpperCase());
    } else {
      // Default: date range filter (required when no specific-entity filter given)
      whereClauses.push(`t.trandate >= TO_DATE(?, 'YYYY-MM-DD')`);
      whereClauses.push(`t.trandate <= TO_DATE(?, 'YYYY-MM-DD')`);
      queryParams.push(params.dateFrom, params.dateTo);
    }

    // Optional supplemental filters (always applied when present)
    // location is on transactionline (t.location is NOT_EXPOSED per SuiteQL rules)
    if (params.locationId) {
      whereClauses.push(`tl_main.location = ?`);
      queryParams.push(params.locationId);
    }
    // subsidiary is also NOT_EXPOSED on transaction header; use transactionline
    if (params.subsidiaryId) {
      whereClauses.push(`tl_main.subsidiary = ?`);
      queryParams.push(params.subsidiaryId);
    }

    return { whereClauses, queryParams };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CP1 — Approve
  // ═══════════════════════════════════════════════════════════════════════════════
  /**
   * CP1: Get WO list + approval status.
   * This is the PRIMARY query — returns the canonical WO list for the date range.
   * Rolls up to WO-grain; one row per WO.
   *
   * Complete (✓): custbody_apc_document_approval_status = 2
   * Monitor (◷): any other value
   *
   * Architecture notes:
   *  - t.location is NOT_EXPOSED → join transactionline (mainline='T') for location + subsidiary
   *  - Assembly item and planned qty live on the mainline transactionline (mainline='T')
   *  - BUILTIN.DF() used for location name and item name resolution
   *
   * @param {Object} params - {dateFrom, dateTo, subsidiaryId?, locationId?}
   * @returns {Array} [{woid, wonum, itemId, itemName, qty, trandate, locationId, locationName,
   *                    productionLine, approvalStatus, backOrderQty}]
   */
  function getCP1_Approve(params) {
    const { whereClauses, queryParams } = buildWoFilter(params);

    const sql = `
      SELECT
        t.id                                              AS woid,
        t.tranid                                          AS wo_number,
        tl_main.item                                      AS item_id,
        item.itemid                                       AS item_code,
        item.displayname                                  AS item_displayname,
        BUILTIN.DF(tl_main.item)                          AS item_name,
        tl_main.quantity                                  AS qty,
        BUILTIN.DF(tl_main.units)                         AS unit_name,
        TO_CHAR(t.trandate, 'YYYY-MM-DD')                 AS wo_date,
        tl_main.location                                  AS location_id,
        BUILTIN.DF(tl_main.location)                      AS location_name,
        BUILTIN.DF(t.custbody_mfg_production_line)        AS line_name,
        t.custbody_apc_document_approval_status           AS approval_status,
        BUILTIN.DF(t.custbody_apc_document_approval_status) AS approval_status_name,
        t.custbody_mfg_qty_produce_back_order             AS back_order_qty
      FROM transaction t
      JOIN transactionline tl_main
        ON tl_main.transaction = t.id
       AND tl_main.mainline    = 'T'
      JOIN item ON item.id = tl_main.item
      WHERE ${whereClauses.join('\n        AND ')}
      ORDER BY t.trandate DESC, t.tranid
    `;

    // CP1 is the canonical WO list; use paged runner to avoid the 5 000-row
    // silent truncation cap of asMappedResults(). Every downstream checkpoint
    // consumes the woids returned here, so losing rows here loses WOs everywhere.
    const rows = runSQLPaged(sql, queryParams);
    log.debug({ title: 'CP1 rows', details: rows.length });

    return rows.map(r => ({
      woid:               asStr(r.woid),
      woNumber:           asStr(r.wo_number),
      itemId:             asStr(r.item_id),
      itemCode:           asStr(r.item_code),
      itemDisplayName:    asStr(r.item_displayname),
      itemName:           asStr(r.item_name),
      qty:                asNum(r.qty),
      qtyUnit:            asStr(r.unit_name),
      woDate:             asStr(r.wo_date),
      locationId:         asStr(r.location_id),
      locationName:       asStr(r.location_name),
      lineName:           asStr(r.line_name),
      approvalStatus:     asStr(r.approval_status),
      approvalStatusName: asStr(r.approval_status_name),
      backOrderQty:       asNum(r.back_order_qty),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CP2 — Release Batch
  // ═══════════════════════════════════════════════════════════════════════════════
  /**
   * CP2: Batch release status — one row per batch (batch-grain).
   *
   * Complete (✓): all rows for a WO have released = 'T'
   * Monitor (◷): any row has released = 'F'
   *
   * @param {string[]} woids
   * @returns {Array} [{woid, batchId, batchName, released}]
   */
  function getCP2_Release(woids) {
    if (!woids || woids.length === 0) return [];

    const sqlTemplate = `
      SELECT
        b.custrecord_mfg_released_refwo                                        AS woid,
        b.id                                                                   AS batch_id,
        b.name                                                                 AS batch_name,
        CASE WHEN b.custrecord_mfg_released_status = '2' THEN 'T' ELSE 'F' END AS released
      FROM customrecord_mfg_releasedwobatch b
      WHERE b.custrecord_mfg_released_refwo IN ({{IN_LIST}})
      ORDER BY b.custrecord_mfg_released_refwo, b.id
    `;

    const rows = runForWoids(sqlTemplate, woids, false);
    log.debug({ title: 'CP2 rows', details: rows.length });

    return rows.map(r => ({
      woid:      asStr(r.woid),
      batchId:   asStr(r.batch_id),
      batchName: asStr(r.batch_name),
      released:  asStr(r.released),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CP3a — BOM Components
  // ═══════════════════════════════════════════════════════════════════════════════
  /**
   * CP3a: BOM component items per WO from WO transaction lines.
   * Returns one row per component item per WO (excludes the mainline assembly output).
   * Includes item display name for use in missing-material error notes.
   *
   * Use paged runner: large BOMs across many WOs can exceed 5000 rows.
   *
   * @param {string[]} woids
   * @returns {Array} [{woid, itemId, itemName}]
   */
  function getCP3a_BomComponents(woids) {
    if (!woids || woids.length === 0) return [];

    const sqlTemplate = `
      SELECT
        tl.transaction   AS woid,
        tl.item          AS item_id,
        item.displayname AS item_name
      FROM transactionline tl
      JOIN transaction t ON t.id  = tl.transaction
      JOIN item          ON item.id = tl.item
      WHERE t.type         = 'WorkOrd'
        AND tl.mainline    = 'F'
        AND tl.item        IS NOT NULL
        AND tl.transaction IN ({{IN_LIST}})
      ORDER BY tl.transaction, tl.item
    `;

    const rows = runForWoids(sqlTemplate, woids, true /* paged */);
    log.debug({ title: 'CP3a BOM rows', details: rows.length });

    return rows.map(r => ({
      woid:     asStr(r.woid),
      itemId:   asStr(r.item_id),
      itemName: asStr(r.item_name),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CP3b — Fed Items
  // ═══════════════════════════════════════════════════════════════════════════════
  /**
   * CP3b: Items actually fed (issued) per WO from inventory adjustment lines.
   * Only considers InvAdjst transactions where the adjustment type is
   * flagged as MFG raw material (custrecord_adjt_mfgrawmaterial = 'T').
   * Includes item display name to match against CP3a item names.
   *
   * @param {string[]} woids
   * @returns {Array} [{woid, itemId, itemName}]
   */
  function getCP3b_FedItems(woids) {
    if (!woids || woids.length === 0) return [];

    const sqlTemplate = `
      SELECT
        ial.custcol_mfg2_ref_workorder   AS woid,
        ial.item                         AS item_id,
        item.displayname                 AS item_name
      FROM transaction ia
      JOIN transactionline ial
        ON ia.id = ial.transaction
      JOIN item
        ON item.id = ial.item
      JOIN customrecord_thl_adjustmenttype adjt
        ON ia.custbody_thl_adjustmenttype = adjt.id
      WHERE ia.type = 'InvAdjst'
        AND adjt.custrecord_adjt_mfgrawmaterial = 'T'
        AND ial.custcol_mfg2_ref_workorder IN ({{IN_LIST}})
      ORDER BY ial.custcol_mfg2_ref_workorder, ial.item
    `;

    const rows = runForWoids(sqlTemplate, woids, false);
    log.debug({ title: 'CP3b fed-item rows', details: rows.length });

    return rows.map(r => ({
      woid:     asStr(r.woid),
      itemId:   asStr(r.item_id),
      itemName: asStr(r.item_name),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CP4 — Machine
  // ═══════════════════════════════════════════════════════════════════════════════
  /**
   * CP4: Machine time status from WOC header + downtime child records.
   * Header + child are merged internally; returns a flat array (one row per WOC).
   *
   * Complete (✓): machineTime > 0 AND equals detailTotalTime from child.
   *               If any child has a down_reason set, startDown/endDown/downMin
   *               must also be populated.
   * Error (✕):    WOC exists but machine_time missing or inconsistent.
   *
   * WOs with no WOC do not appear here — Suitelet handles the no-rows → na case.
   *
   * @param {string[]} woids
   * @returns {Array} [{woid, batchId, taskId, wocId, hasWOC, machineTime, detailTotalTime, mismatch, downtimeMissing}]
   */
  function getCP4_Machine(woids) {
    if (!woids || woids.length === 0) return [];

    // ── Header: include batchId via task_management JOIN ──
    const headerTemplate = `
      SELECT
        woc.custbody_mfg_task_mgn_ref          AS task_id,
        tm.custrecord_mfg_tm_wo                AS woid,
        tm.custrecord_mfg_tm_releasedbatch     AS batch_id,
        woc.id                                 AS woc_id,
        woc.custbody_mfg_machinetime           AS machine_time
      FROM workordercompletion woc
      JOIN customrecord_mfg_task_management tm
        ON woc.custbody_mfg_task_mgn_ref = tm.id
      WHERE tm.custrecord_mfg_tm_wo IN ({{IN_LIST}})
    `;

    const headerRaw = runForWoids(headerTemplate, woids, false);
    log.debug({ title: 'CP4 header rows', details: headerRaw.length });

    if (headerRaw.length === 0) return [];

    const header = headerRaw.map(r => ({
      taskId:      asStr(r.task_id),
      woid:        asStr(r.woid),
      batchId:     asStr(r.batch_id),
      wocId:       asStr(r.woc_id),
      machineTime: asNum(r.machine_time),
    }));

    // ── Child (downtime records) ── keyed by WOC id
    const wocIds = [...new Set(header.map(r => r.wocId).filter(Boolean))];
    const childTemplate = `
      SELECT
        md.custrecord_mfg_parent_com_mac_down  AS woc_id,
        md.custrecord_mfg_com_mac_totaltime    AS mac_total,
        md.custrecord_mfg_com_mac_down_reason  AS down_reason,
        md.custrecord_mfg_com_mac_down_min     AS down_min
      FROM customrecord_mfg_mac_down_reason_comp md
      WHERE md.custrecord_mfg_parent_com_mac_down IN ({{IN_LIST}})
    `;

    const childRaw = runForWoids(childTemplate, wocIds, false);
    log.debug({ title: 'CP4 child rows', details: childRaw.length });

    // Build wocId → child rows index
    const childByWoc = {};
    childRaw.forEach(r => {
      const wid = asStr(r.woc_id);
      if (!childByWoc[wid]) childByWoc[wid] = [];
      childByWoc[wid].push({
        macTotal:   asNum(r.mac_total),
        downReason: asStr(r.down_reason),
        downMin:    asNum(r.down_min),
      });
    });

    // Merge: one flat row per WOC
    return header.map(h => {
      const children = childByWoc[h.wocId] || [];
      const detailTotalTime = children.reduce((s, c) => s + c.macTotal, 0);
      const mismatch = h.machineTime > 0 && detailTotalTime > 0
        && Math.abs(h.machineTime - detailTotalTime) > 0.01 ? 'T' : 'F';
      // downtimeMissing: downtime reason recorded but minutes = 0 or missing
      const downtimeMissing = children.some(c =>
        c.downReason && c.downMin <= 0
      ) ? 'T' : 'F';
      return {
        woid:            h.woid,
        batchId:         h.batchId,
        taskId:          h.taskId,
        wocId:           h.wocId,
        hasWOC:          'T',
        machineTime:     h.machineTime,
        detailTotalTime: detailTotalTime,
        mismatch:        mismatch,
        downtimeMissing: downtimeMissing,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CP5 — Labor (Pre-WOC Labor existence check)
  // ═══════════════════════════════════════════════════════════════════════════════
  /**
   * CP5: Check whether pre-WOC labor has been recorded for each task.
   * Queries customrecord_mfg_prewoc_labor (parent = task_management id).
   *
   * Complete (✓): at least one prewoc_labor record exists for each task.
   * Monitor (◷): no prewoc_labor record for the task yet.
   *
   * All tasks appear in the result (LEFT JOIN) — Suitelet sees 'F' for unrecorded tasks.
   *
   * @param {string[]} woids
   * @returns {Array} [{woid, batchId, taskId, hasLabor}]
   */
  function getCP5_Labor(woids) {
    if (!woids || woids.length === 0) return [];

    const sqlTemplate = `
      SELECT
        tm.custrecord_mfg_tm_wo                                          AS woid,
        tm.custrecord_mfg_tm_releasedbatch                               AS batch_id,
        tm.id                                                            AS task_id,
        CASE WHEN COUNT(lb.id) > 0 THEN 'T' ELSE 'F' END                AS has_labor
      FROM customrecord_mfg_task_management tm
      LEFT JOIN customrecord_mfg_prewoc_labor lb
        ON lb.custrecord_mfg_prewoc_labor_task = tm.custrecord_mfg_tm_ot
      WHERE tm.custrecord_mfg_tm_wo IN ({{IN_LIST}})
      GROUP BY
        tm.custrecord_mfg_tm_wo,
        tm.custrecord_mfg_tm_releasedbatch,
        tm.id
    `;

    const rows = runForWoids(sqlTemplate, woids, false);
    log.debug({ title: 'CP5 labor rows', details: rows.length });

    return rows.map(r => ({
      woid:     asStr(r.woid),
      batchId:  asStr(r.batch_id),
      taskId:   asStr(r.task_id),
      hasLabor: asStr(r.has_labor),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CP6 — Time
  // ═══════════════════════════════════════════════════════════════════════════════
  /**
   * CP6: Time validation from WOC body fields only.
   * Complete (✓): custbody_mfg_total_minute = (end_dt - start_dt) in minutes.
   * Error (✕):    WOC exists but time fields missing or total_minute ≠ computed diff.
   *
   * computedMin is computed in the Suitelet:
   *   computedMin = (new Date(endDt) - new Date(startDt)) / 60000
   *
   * WOs with no WOC do not appear here — Suitelet handles the no-rows → na case.
   *
   * @param {string[]} woids
   * @returns {Array} [{woid, batchId, taskId, wocId, hasWOC, startDt, endDt, totalMin}]
   */
  function getCP6_Time(woids) {
    if (!woids || woids.length === 0) return [];

    const sqlTemplate = `
      SELECT
        woc.custbody_mfg_task_mgn_ref             AS task_id,
        tm.custrecord_mfg_tm_wo                   AS woid,
        tm.custrecord_mfg_tm_releasedbatch        AS batch_id,
        woc.id                                    AS woc_id,
        woc.custbody_mfg_com_start_date_time      AS start_dt,
        woc.custbody_mfg_com_end_date_time        AS end_dt,
        woc.custbody_mfg_total_minute             AS total_min
      FROM workordercompletion woc
      JOIN customrecord_mfg_task_management tm
        ON woc.custbody_mfg_task_mgn_ref = tm.id
      WHERE tm.custrecord_mfg_tm_wo IN ({{IN_LIST}})
    `;

    const rows = runForWoids(sqlTemplate, woids, false);
    log.debug({ title: 'CP6 rows', details: rows.length });

    return rows.map(r => ({
      taskId:   asStr(r.task_id),
      woid:     asStr(r.woid),
      batchId:  asStr(r.batch_id),
      wocId:    asStr(r.woc_id),
      hasWOC:   'T',
      startDt:  asStr(r.start_dt),
      endDt:    asStr(r.end_dt),
      totalMin: asNum(r.total_min),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CP7 — WOC (3 Layers)
  // ═══════════════════════════════════════════════════════════════════════════════
  /**
   * CP7: WOC completeness check across 3 layers.
   *
   * Layer 1 — Lot & Pallet qty per WO (compare vs WO backOrderQty from CP1).
   * Layer 2+3 — Per task: task planned qty fields vs SUM of WOC actual qty fields.
   *
   * Returns {l1, l2l3}. Caller:
   *  - L1: checks total_lp_qty vs cp1.backOrderQty
   *  - L2+L3: checks tm_good == woc_good, tm_scrap == woc_scrap, etc.
   *
   * custbody_mfg_rework_qty (no 'woc' infix) — confirmed correct field name.
   *
   * @param {string[]} woids
   * @returns {{ l1: Array, l2l3: Array }}
   */
  function getCP7_WOC(woids) {
    if (!woids || woids.length === 0) return { l1: [], l2l3: [] };

    // ── Layer 1: Lot & Pallet qty rollup per WO ──
    const l1Template = `
      SELECT
        lp.custrecord_mfg_lpi_wo       AS woid,
        SUM(lp.custrecord_mfg_lpi_qty) AS total_lp_qty
      FROM customrecord_mfg_lot_pallet_info lp
      WHERE lp.custrecord_mfg_lpi_wo IN ({{IN_LIST}})
      GROUP BY lp.custrecord_mfg_lpi_wo
    `;

    // ── Layer 2+3: Task planned qty vs WOC actual qty (task-grain, rollup to WO) ──
    // Uses paged runner: many tasks across many WOs can exceed 5000 rows.
    const l2l3Template = `
      SELECT
        tm.custrecord_mfg_tm_wo           AS woid,
        tm.id                             AS task_id,
        tm.custrecord_mfg_tm_good_qty     AS tm_good,
        tm.custrecord_mfg_tm_scrap_qty    AS tm_scrap,
        tm.custrecord_mfg_tm_rework_qty   AS tm_rework,
        tm.custrecord_mfg_tm_move_qty     AS tm_move,
        tm.custrecord_mfg_tm_pro_qty      AS tm_pro_qty,
        SUM(woc.custbody_mfg_woc_good_qty)   AS woc_good,
        SUM(woc.custbody_mfg_woc_scrap_qty)  AS woc_scrap,
        SUM(woc.custbody_mfg_rework_qty)     AS woc_rework,
        SUM(woc.custbody_mfg_woc_move_qty)   AS woc_move
      FROM customrecord_mfg_task_management tm
      LEFT JOIN workordercompletion woc
        ON woc.custbody_mfg_task_mgn_ref = tm.id
      WHERE tm.custrecord_mfg_tm_wo IN ({{IN_LIST}})
      GROUP BY
        tm.custrecord_mfg_tm_wo,
        tm.id,
        tm.custrecord_mfg_tm_good_qty,
        tm.custrecord_mfg_tm_scrap_qty,
        tm.custrecord_mfg_tm_rework_qty,
        tm.custrecord_mfg_tm_move_qty,
        tm.custrecord_mfg_tm_pro_qty
    `;

    const [l1Rows, l2l3Rows] = [
      runForWoids(l1Template, woids, false),
      runForWoids(l2l3Template, woids, true /* paged */),
    ];
    log.debug({ title: 'CP7 L1 rows', details: l1Rows.length });
    log.debug({ title: 'CP7 L2+L3 rows', details: l2l3Rows.length });

    return {
      l1: l1Rows.map(r => ({
        woid:       asStr(r.woid),
        totalLpQty: asNum(r.total_lp_qty),
      })),
      l2l3: l2l3Rows.map(r => ({
        woid:      asStr(r.woid),
        taskId:    asStr(r.task_id),
        tmGood:    asNum(r.tm_good),
        tmScrap:   asNum(r.tm_scrap),
        tmRework:  asNum(r.tm_rework),
        tmMove:    asNum(r.tm_move),
        tmProQty:  asNum(r.tm_pro_qty),
        wocGood:   asNum(r.woc_good),
        wocScrap:  asNum(r.woc_scrap),
        wocRework: asNum(r.woc_rework),
        wocMove:   asNum(r.woc_move),
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CP8 — Cost Generation
  // ═══════════════════════════════════════════════════════════════════════════════
  /**
   * CP8: Cost allocation existence check per WO.
   * Error (✕): WOC records exist for this WO but no cost allocation record found.
   *
   * @param {string[]} woids
   * @returns {Array} [{woid, costAllocCount}]
   */
  function getCP8_CostGen(woids) {
    if (!woids || woids.length === 0) return [];

    const sqlTemplate = `
      SELECT
        tl.custcol_mfg2_ref_workorder   AS woid,
        COUNT(t.id)                     AS cost_alloc_count
      FROM transaction t
      JOIN transactionline tl ON tl.transaction = t.id
      WHERE t.recordtype = 'customtransaction_mfg2_woc_costallocatio'
        AND tl.custcol_mfg2_ref_workorder IN ({{IN_LIST}})
      GROUP BY tl.custcol_mfg2_ref_workorder
    `;

    const rows = runForWoids(sqlTemplate, woids, false);
    log.debug({ title: 'CP8 rows', details: rows.length });

    return rows.map(r => ({
      woid:           asStr(r.woid),
      costAllocCount: asNum(r.cost_alloc_count),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CP9 — Standard Cost Setup
  // ═══════════════════════════════════════════════════════════════════════════════
  /**
   * CP9: Standard cost setup check per task (master data check).
   *
   * Priority 1 — cost ref by item + work center:
   *   customrecord_mfg_costref_setup (subsidiary + date range covering WO trandate)
   *   → customrecord_mfg_cost_ref (item = WO assemblyitem, work center = task custrecord_mfg_tm_wc)
   *   Found → ✓ (regardless of option in Phase 1)
   *
   * Fallback — OH dept rate by work center:
   *   customrecord_mfg_opr_std_cost_rate (subsidiary + date range)
   *   → customrecord_mfg_opr_std_cost_dept_rate (dept = task work center)
   *   Found → ✓
   *
   * Neither → ✕ error.
   *
   * Phase 1 scope: cost ref + OH rate check only.
   * MC rate (needs machine group from WOC) and Labor rate → Phase 2.
   *
   * @param {string[]} woids
   * @returns {Array} [{woid, taskId, batchId, hasCostRef, hasOhRate}]
   */
  function getCP9_StdCostSetup(woids) {
    if (!woids || woids.length === 0) return [];

    // ── Query 1: Cost ref by item + work center (field names verified) ──
    const costRefTemplate = `
      SELECT
        tm.custrecord_mfg_tm_wo             AS woid,
        tm.id                               AS task_id,
        tm.custrecord_mfg_tm_releasedbatch  AS batch_id,
        CASE WHEN MAX(CASE WHEN cr.id IS NOT NULL THEN 1 ELSE 0 END) = 1
             THEN 'T' ELSE 'F' END          AS has_cost_ref
      FROM customrecord_mfg_task_management tm
      JOIN transaction t
        ON t.id = tm.custrecord_mfg_tm_wo
      JOIN transactionline tl_main
        ON tl_main.transaction = tm.custrecord_mfg_tm_wo
       AND tl_main.mainline = 'T'
      LEFT JOIN customrecord_mfg_costref_setup cs
        ON cs.custrecord_mfg_costref_setup_subsidiary = tl_main.subsidiary
       AND t.trandate >= cs.custrecord_mfg_costref_setup_startdate
       AND t.trandate <= cs.custrecord_mfg_costref_setup_enddate
      LEFT JOIN customrecord_mfg_cost_ref cr
        ON cr.custrecord_mfg_cost_refparent = cs.id
       AND cr.custrecord_item_ref   = tl_main.item
       AND cr.custrecord_workcenter = tm.custrecord_mfg_tm_wc
      WHERE tm.custrecord_mfg_tm_wo IN ({{IN_LIST}})
      GROUP BY
        tm.custrecord_mfg_tm_wo,
        tm.id,
        tm.custrecord_mfg_tm_releasedbatch
    `;

    // ── Query 2: OH dept rate by subsidiary + date range + work center ──
    const ohRateTemplate = `
      SELECT
        tm.custrecord_mfg_tm_wo             AS woid,
        tm.id                               AS task_id,
        tm.custrecord_mfg_tm_releasedbatch  AS batch_id,
        CASE WHEN MAX(CASE WHEN dr.id IS NOT NULL THEN 1 ELSE 0 END) = 1
             THEN 'T' ELSE 'F' END          AS has_oh_rate
      FROM customrecord_mfg_task_management tm
      JOIN transaction t
        ON t.id = tm.custrecord_mfg_tm_wo
      JOIN transactionline tl_main
        ON tl_main.transaction = tm.custrecord_mfg_tm_wo
       AND tl_main.mainline = 'T'
      LEFT JOIN customrecord_mfg_opr_std_cost_rate osr
        ON osr.custrecord_mfg_opr_std_cost_sub = tl_main.subsidiary
       AND t.trandate >= osr.custrecord_mfg_opr_std_startdate
       AND t.trandate <= osr.custrecord_mfg_opr_std_enddate
      LEFT JOIN customrecord_mfg_opr_std_cost_dept_rate dr
        ON dr.custrecord_mfg_parent_mfg_opr_std_cost = osr.id
       AND dr.custrecord_mfg_opr_dept_list = tm.custrecord_mfg_tm_wc
      WHERE tm.custrecord_mfg_tm_wo IN ({{IN_LIST}})
      GROUP BY
        tm.custrecord_mfg_tm_wo,
        tm.id,
        tm.custrecord_mfg_tm_releasedbatch
    `;

    const costRefRows = runForWoids(costRefTemplate, woids, false);
    const ohRateRows  = runForWoids(ohRateTemplate,  woids, false);
    log.debug({ title: 'CP9 cost-ref rows', details: costRefRows.length });
    log.debug({ title: 'CP9 OH-rate rows',  details: ohRateRows.length });

    // Merge by taskId
    const ohByTask = {};
    ohRateRows.forEach(r => { ohByTask[asStr(r.task_id)] = asStr(r.has_oh_rate); });

    return costRefRows.map(r => ({
      woid:       asStr(r.woid),
      taskId:     asStr(r.task_id),
      batchId:    asStr(r.batch_id),
      hasCostRef: asStr(r.has_cost_ref),
      hasOhRate:  ohByTask[asStr(r.task_id)] || 'F',
    }));
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  return {
    getCP1_Approve,
    getCP2_Release,
    getCP3a_BomComponents,
    getCP3b_FedItems,
    getCP4_Machine,
    getCP5_Labor,
    getCP6_Time,
    getCP7_WOC,
    getCP8_CostGen,
    getCP9_StdCostSetup,
  };
});
