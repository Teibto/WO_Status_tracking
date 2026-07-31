/**
 * WOStatusTracking_Drilldown.js
 * SuiteScript 2.1 module — batch/task drilldown for one WO
 *
 * Called from the main Suitelet (not a Suitelet itself).
 * Entry point: getDrilldownHtml({ woid, lang })
 *
 * The main Suitelet injects the returned HTML rows directly after the
 * placeholder row for the WO. Each row carries class="drilldown-row"
 * and data-woid="${woid}" (added by the Suitelet's client JS, not here).
 *
 * Exports:
 *   getDrilldownHtml({ woid, lang })  → HTML string of <tr> elements
 *   getDrilldownData(woid)            → structured data (useful for testing)
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/query', 'N/log', './WOStatusTracking_Labels'], (query, log, Labels) => {

  // ─────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────

  /** Severity rank for rollup */
  const RANK = { na: 0, ok: 1, wait: 2, err: 3 };
  const RANK_INV = ['na', 'ok', 'wait', 'err'];

  /** Symbol map (matches mockup) */
  const SYM = { ok: '✓', wait: '◷', err: '✕', na: '–' };

  /**
   * Minimal HTML escape for DB-derived strings injected into HTML.
   * Prevents XSS from item/task names returned by SuiteQL.
   */
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * SuiteQL NULL comes back as a Java ScriptNullObjectAdapter, not JS null.
   * Always normalise before use.
   */
  function asStr(v) {
    if (v == null) return '';
    const s = String(v);
    return s.indexOf('ScriptNullObjectAdapter') !== -1 ? '' : s;
  }

  function asNum(v) {
    if (v == null) return 0;
    const s = String(v);
    if (s.indexOf('ScriptNullObjectAdapter') !== -1) return 0;
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }

  /** Run SuiteQL, return asMappedResults(). Logs on error, returns []. */
  function runSQL(sql, params) {
    try {
      const result = query.runSuiteQL({ query: sql, params: params || [] });
      return result.asMappedResults();
    } catch (e) {
      log.error({ title: 'WOStatusTracking_Drilldown runSQL error', details: `${e.message}\nSQL:${sql}` });
      return [];
    }
  }

  /** Worst-status rollup over an array of status strings. */
  function worstStatus(statuses) {
    const worst = statuses.reduce((max, st) => Math.max(max, RANK[st] || 0), 0);
    return RANK_INV[worst] || 'na';
  }

  /** Rollup 9-element status arrays across multiple rows. */
  function rollupCpArrays(arrays) {
    if (!arrays || arrays.length === 0) return Array(9).fill('na');
    return Array.from({ length: 9 }, (_, i) => {
      const worst = arrays.reduce((max, arr) => Math.max(max, RANK[arr[i]] || 0), 0);
      return RANK_INV[worst];
    });
  }

  // ─────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────

  /** Q0: WO context (approval status, back-order qty, unit) */
  function queryWOContext(woid) {
    const sql = `
      SELECT
        wo.custbody_apc_document_approval_status             AS approval_status,
        BUILTIN.DF(wo.custbody_apc_document_approval_status) AS approval_status_name,
        wo.custbody_mfg_qty_produce_back_order               AS backorder_qty,
        BUILTIN.DF(tl.units)                                 AS unit_name
      FROM transaction wo
      JOIN transactionline tl
        ON tl.transaction = wo.id
       AND tl.mainline    = 'T'
      WHERE wo.id = ?
        AND wo.type = 'WorkOrd'
    `;
    const rows = runSQL(sql, [woid]);
    if (!rows.length) return { approvalStatus: '', approvalStatusName: '', backorderQty: 0, unitName: '' };
    return {
      approvalStatus:     asStr(rows[0].approval_status),
      approvalStatusName: asStr(rows[0].approval_status_name),
      backorderQty:       asNum(rows[0].backorder_qty),
      unitName:           asStr(rows[0].unit_name)
    };
  }

  /** Q1: Batches for the WO */
  function queryBatches(woid) {
    const sql = `
      SELECT
        b.id                             AS batch_id,
        b.name                           AS batch_name,
        b.custrecord_mfg_released_status AS released_status,
        b.custrecord_mfg_released_qty    AS released_qty
      FROM customrecord_mfg_releasedwobatch b
      WHERE b.custrecord_mfg_released_refwo = ?
      ORDER BY b.id
    `;
    return runSQL(sql, [woid]);
  }

  /** Q2: All operation tasks for the WO (all batches) */
  function queryTasks(woid) {
    const sql = `
      SELECT
        tm.id                              AS task_id,
        tm.name                            AS task_name,
        tm.altname                         AS task_altname,
        tm.custrecord_mfg_tm_releasedbatch AS batch_id,
        tm.custrecord_mfg_tm_ot            AS op_task_id,
        tm.custrecord_mfg_tm_good_qty      AS tm_good_qty,
        tm.custrecord_mfg_tm_scrap_qty     AS tm_scrap_qty,
        tm.custrecord_mfg_tm_rework_qty    AS tm_rework_qty,
        tm.custrecord_mfg_tm_move_qty      AS tm_move_qty,
        tm.custrecord_mfg_tm_pro_qty       AS tm_pro_qty
      FROM customrecord_mfg_task_management tm
      WHERE tm.custrecord_mfg_tm_wo = ?
      ORDER BY tm.custrecord_mfg_tm_releasedbatch, tm.id
    `;
    return runSQL(sql, [woid]);
  }

  /** Q3: WOC records for a set of integer task ids (IN-list, no bind vars) */
  function queryWOC(taskIds) {
    if (!taskIds || !taskIds.length) return [];
    const safe = taskIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (!safe.length) return [];
    const sql = `
      SELECT
        woc.custbody_mfg_task_mgn_ref        AS task_id,
        woc.id                                AS woc_id,
        woc.custbody_mfg_woc_good_qty         AS woc_good_qty,
        woc.custbody_mfg_woc_scrap_qty        AS woc_scrap_qty,
        woc.custbody_mfg_rework_qty           AS woc_rework_qty,
        woc.custbody_mfg_woc_move_qty         AS woc_move_qty,
        woc.custbody_mfg_machinetime          AS machinetime,
        woc.custbody_mfg_labortime            AS labortime,
        woc.custbody_mfg_woc_totallbtimecal   AS totallbtimecal,
        woc.custbody_mfg_com_start_date_time  AS start_dt,
        woc.custbody_mfg_com_end_date_time    AS end_dt,
        woc.custbody_mfg_total_minute         AS total_minute
      FROM workordercompletion woc
      WHERE woc.custbody_mfg_task_mgn_ref IN (${safe.join(',')})
    `;
    return runSQL(sql, []);
  }

  /**
   * Q4: Machine detail totals per WOC
   * Returns sum of _mac_totaltime and a flag for incomplete downtime entries.
   */
  function queryMachineDetails(wocIds) {
    if (!wocIds || !wocIds.length) return [];
    const safe = wocIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (!safe.length) return [];
    const sql = `
      SELECT
        mdr.custrecord_mfg_parent_com_mac_down    AS woc_id,
        SUM(mdr.custrecord_mfg_com_mac_totaltime) AS mac_detail_total,
        SUM(
          CASE
            WHEN mdr.custrecord_mfg_com_mac_down_reason IS NOT NULL
              AND (  mdr.custrecord_mfg_mac_startdown IS NULL
                  OR mdr.custrecord_mfg_mac_enddown   IS NULL
                  OR mdr.custrecord_mfg_mac_down_min  IS NULL)
            THEN 1 ELSE 0
          END
        ) AS downtime_incomplete_count
      FROM customrecord_mfg_mac_down_reason_comp mdr
      WHERE mdr.custrecord_mfg_parent_com_mac_down IN (${safe.join(',')})
      GROUP BY mdr.custrecord_mfg_parent_com_mac_down
    `;
    return runSQL(sql, []);
  }

  /**
   * Q5: Labor detail totals per WOC
   * Returns sum of individual labor-cost-child records per WOC.
   */
  function queryLaborDetails(wocIds) {
    if (!wocIds || !wocIds.length) return [];
    const safe = wocIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (!safe.length) return [];
    const sql = `
      SELECT
        lc.custrecord_mfg_com_labor_cost       AS woc_id,
        SUM(lc.custrecord_mfg_com_laborquantity) AS labor_detail_total
      FROM customrecord_mfg_com_labor_cost lc
      WHERE lc.custrecord_mfg_com_labor_cost IN (${safe.join(',')})
      GROUP BY lc.custrecord_mfg_com_labor_cost
    `;
    return runSQL(sql, []);
  }

  /** Q6: Lot & Pallet total for the WO (CP7 L1) */
  function queryLotPalletTotal(woid) {
    const sql = `
      SELECT SUM(lpi.custrecord_mfg_lpi_qty) AS lp_total
      FROM customrecord_mfg_lot_pallet_info lpi
      WHERE lpi.custrecord_mfg_lpi_wo = ?
    `;
    const rows = runSQL(sql, [woid]);
    return rows.length ? asNum(rows[0].lp_total) : 0;
  }

  /**
   * Q7: Cost allocation existence per WOC (CP8)
   * Returns the set of woc_ids that have at least one cost allocation record.
   */
  function queryCostAllocation(wocIds) {
    if (!wocIds || !wocIds.length) return new Set();
    const safe = wocIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (!safe.length) return new Set();
    const sql = `
      SELECT DISTINCT tl.custcol_mfg2_ref_workordercompletion AS woc_id
      FROM transaction t
      JOIN transactionline tl ON tl.transaction = t.id
      WHERE t.recordtype = 'customtransaction_mfg2_woc_costallocatio'
        AND tl.custcol_mfg2_ref_workordercompletion IN (${safe.join(',')})
    `;
    const rows = runSQL(sql, []);
    return new Set(rows.map(r => String(asNum(r.woc_id))));
  }

  /**
   * Q8: BOM components for the WO (CP3 at task level)
   * Returns {taskId → Set<itemName>} for BOM items and fed items.
   * Used to compute which items are missing per task.
   */
  function queryBomComponents(woid) {
    // BOM components via transactionline (assemblycomponent not exposed in SuiteQL)
    const sql = `
      SELECT
        tl.custcol_mfg_line_tmref AS task_id,
        tl.item                    AS item_id,
        item.displayname           AS item_name
      FROM transactionline tl
      JOIN item ON item.id = tl.item
      WHERE tl.transaction = ?
        AND tl.mainline    = 'F'
        AND tl.item        IS NOT NULL
    `;
    const rows = runSQL(sql, [woid]);
    const byTask = {};
    rows.forEach(r => {
      const tid = String(asNum(r.task_id));
      if (!byTask[tid]) byTask[tid] = new Set();
      byTask[tid].add(asStr(r.item_name) || String(asNum(r.item_id)));
    });
    return byTask;
  }

  function queryFedItems(woid) {
    // Fed items via transactionline (inventoryadjustmentline not exposed in SuiteQL)
    const sql = `
      SELECT
        ial.custcol_mfg_line_tmref AS task_id,
        ial.item                    AS item_id,
        item.displayname            AS item_name
      FROM transactionline ial
      JOIN transaction ia ON ia.id = ial.transaction
      JOIN item ON item.id = ial.item
      JOIN customrecord_thl_adjustmenttype adjt
        ON adjt.id = ia.custbody_thl_adjustmenttype
      WHERE ia.type                       = 'InvAdjst'
        AND ial.custcol_mfg2_ref_workorder = ?
        AND adjt.custrecord_adjt_mfgrawmaterial = 'T'
        AND ial.item IS NOT NULL
    `;
    const rows = runSQL(sql, [woid]);
    const byTask = {};
    rows.forEach(r => {
      const tid = String(asNum(r.task_id));
      if (!byTask[tid]) byTask[tid] = new Set();
      byTask[tid].add(asStr(r.item_name) || String(asNum(r.item_id)));
    });
    return byTask;
  }

  // ─────────────────────────────────────────────────────────────
  // CHECKPOINT COMPUTATION (task level)
  // ─────────────────────────────────────────────────────────────

  /**
   * Compute all 8 checkpoint statuses and accompanying cpData for one task.
   *
   * cpData[i] matches the shape expected by Labels.getCheckpointNote(i, status, data, lang).
   *
   * @param {Object}  task        Row from queryTasks (normalised numbers/strings)
   * @param {Object}  woc         Matching WOC row or null
   * @param {Object}  macDetail   Matching machine-detail aggregated row or null
   * @param {Object}  labDetail   Matching labor-detail aggregated row or null
   * @param {boolean} hasCostAlloc Whether a cost allocation exists for this WOC
   * @param {Object}  ctx         {
   *   approvalStatus: string,   // '2' = approved
   *   batchStatus: string,      // '2' = Released to Production
   *   bomItems: Set<string>,    // BOM items for this task
   *   fedItems: Set<string>,    // fed items for this task
   *   lpTotal: number,          // WO-grain lot&pallet total
   *   backorderQty: number      // WO.custbody_mfg_qty_produce_back_order
   * }
   * @returns {{ cpStatuses: string[], cpData: Object[] }}
   */
  function computeTaskCheckpoints(task, woc, macDetail, labDetail, hasCostAlloc, ctx) {
    const cp = [];   // status string per checkpoint
    const cd = [];   // data object per checkpoint

    // ── CP0: Approve ─────────────────────────────────────────
    {
      const raw  = asStr(ctx.approvalStatus);
      const name = asStr(ctx.approvalStatusName).toLowerCase();
      const approved = raw === '2'
        || name.indexOf('approv') !== -1
        || name.indexOf('อนุมัติ') !== -1;
      cp.push(approved ? 'ok' : 'wait'); cd.push({});
    }

    // ── CP1: Release ─────────────────────────────────────────
    if (asStr(ctx.batchStatus) === '2') {
      cp.push('ok'); cd.push({});
    } else {
      cp.push('wait'); cd.push({});
    }

    // ── CP2: Gen Lot & Pallet (WO-grain, gate = released) ────
    {
      const released     = asStr(ctx.batchStatus) === '2';
      const lpTotal      = ctx.lpTotal      || 0;
      const backorderQty = ctx.backorderQty || 0;
      if (!released) {
        cp.push('na'); cd.push({});
      } else if (lpTotal > 0 && (!backorderQty || backorderQty <= 0 || lpTotal >= backorderQty - 0.001)) {
        cp.push('ok'); cd.push({});
      } else if (lpTotal > 0) {
        cp.push('wait'); cd.push({ errType: 'lotPalletShort', actual: lpTotal, target: backorderQty });
      } else {
        cp.push('wait'); cd.push({});
      }
    }

    // ── CP3: Feed Materials ───────────────────────────────────
    {
      const bom = ctx.bomItems || new Set();
      const fed = ctx.fedItems || new Set();
      if (bom.size === 0) {
        // No BOM items for this task — treat as ok (WO-level BOM may differ)
        cp.push('ok'); cd.push({});
      } else {
        const missing = [...bom].filter(item => !fed.has(item));
        if (missing.length === 0) {
          cp.push('ok'); cd.push({});
        } else {
          cp.push('wait');
          cd.push({ missingCount: missing.length, missingItems: missing });
        }
      }
    }

    // ── CP3: Machine ──────────────────────────────────────────
    if (!woc) {
      cp.push('na'); cd.push({});
    } else {
      const recorded = asNum(woc.machinetime);
      if (!recorded) {
        cp.push('err'); cd.push({ errType: 'noTime' });
      } else if (macDetail && asNum(macDetail.downtime_incomplete_count) > 0) {
        cp.push('err'); cd.push({ errType: 'downtimeMissing' });
      } else if (macDetail && asNum(macDetail.mac_detail_total) > 0) {
        const detail = asNum(macDetail.mac_detail_total);
        if (Math.abs(recorded - detail) > 0.001) {
          cp.push('err'); cd.push({ errType: 'timeMismatch', recorded, detail });
        } else {
          cp.push('ok'); cd.push({});
        }
      } else {
        // No child detail rows — machine time recorded, nothing to reconcile
        cp.push('ok'); cd.push({});
      }
    }

    // ── CP4: Labor ────────────────────────────────────────────
    if (!woc) {
      cp.push('na'); cd.push({});
    } else {
      const labortime   = asNum(woc.labortime);
      const totalCalc   = asNum(woc.totallbtimecal);
      const recorded    = totalCalc || labortime;
      if (!recorded) {
        cp.push('err'); cd.push({ errType: 'noTime' });
      } else if (labDetail) {
        const detail = asNum(labDetail.labor_detail_total);
        if (detail > 0 && Math.abs(recorded - detail) > 0.001) {
          cp.push('err'); cd.push({ errType: 'totalMismatch', recorded, detail });
        } else {
          cp.push('ok'); cd.push({});
        }
      } else {
        cp.push('ok'); cd.push({});
      }
    }

    // ── CP5: Time ─────────────────────────────────────────────
    if (!woc) {
      cp.push('na'); cd.push({});
    } else {
      const startMs  = woc.start_dt ? new Date(asStr(woc.start_dt)).getTime() : 0;
      const endMs    = woc.end_dt   ? new Date(asStr(woc.end_dt)).getTime()   : 0;
      const recorded = asNum(woc.total_minute);
      if (!startMs || !endMs) {
        cp.push('err'); cd.push({ errType: 'missing' });
      } else {
        const computed = Math.round((endMs - startMs) / 60000);
        if (Math.abs(recorded - computed) > 1) {
          cp.push('err'); cd.push({ errType: 'mismatch', recorded, computed });
        } else {
          cp.push('ok'); cd.push({});
        }
      }
    }

    // ── CP6: WO Completion ────────────────────────────────────
    if (!woc) {
      cp.push('na'); cd.push({});
    } else {
      const tmTotal = asNum(task.tm_good_qty)  + asNum(task.tm_scrap_qty)
                    + asNum(task.tm_rework_qty) + asNum(task.tm_move_qty);
      const proQty  = asNum(task.tm_pro_qty);
      const wocTotal = asNum(woc.woc_good_qty)  + asNum(woc.woc_scrap_qty)
                     + asNum(woc.woc_rework_qty) + asNum(woc.woc_move_qty);

      // L3: data integrity — WOC qty sum must equal task qty sum
      if (Math.abs(wocTotal - tmTotal) > 0.001) {
        cp.push('err');
        cd.push({ errType: 'wocMismatch', wocTotal, taskTotal: tmTotal });
      } else if (tmTotal < proQty - 0.001) {
        // L2: produced qty < target — still in progress
        cp.push('wait');
        cd.push({ errType: 'taskQtyShort', actual: tmTotal, target: proQty });
      } else {
        cp.push('ok'); cd.push({});
      }
    }

    // ── CP8: Cost Generation ──────────────────────────────────
    if (!woc) {
      cp.push('na'); cd.push({});
    } else if (!hasCostAlloc) {
      cp.push('err'); cd.push({});
    } else {
      cp.push('ok'); cd.push({});
    }

    return { cpStatuses: cp, cpData: cd };
  }

  // ─────────────────────────────────────────────────────────────
  // getDrilldownData
  // ─────────────────────────────────────────────────────────────

  /**
   * Fetches all drilldown data for one WO and returns a structured object.
   * Useful for testing and for callers that want structured data.
   *
   * @param {number|string} woid
   * @returns {{
   *   batches: Array<{
   *     batchId: string,
   *     batchName: string,
   *     releasedStatus: string,
   *     cpStatuses: string[],
   *     tasks: Array<{
   *       taskId: string,
   *       taskName: string,
   *       opTaskId: string,
   *       cpStatuses: string[],
   *       cpData: Object[]
   *     }>
   *   }>,
   *   woContext: Object
   * }}
   */
  function getDrilldownData(woid) {
    // ── Fetch all data in parallel-ish order ─────────────────
    const woCtx       = queryWOContext(woid);
    const batchRows   = queryBatches(woid);
    const taskRows    = queryTasks(woid);
    const lpTotal     = queryLotPalletTotal(woid);
    const bomByTask   = queryBomComponents(woid);
    const fedByTask   = queryFedItems(woid);

    // WO-level aggregates — fallback when task-level tmref is not set on lines
    const bomAll = new Set();
    Object.values(bomByTask).forEach(s => s.forEach(item => bomAll.add(item)));
    const fedAll = new Set();
    Object.values(fedByTask).forEach(s => s.forEach(item => fedAll.add(item)));

    const taskIds = taskRows.map(t => asNum(t.task_id));
    const wocRows = queryWOC(taskIds);
    const wocIds  = wocRows.map(w => asNum(w.woc_id));

    const macRows   = queryMachineDetails(wocIds);
    const labRows   = queryLaborDetails(wocIds);
    const caWocSet  = queryCostAllocation(wocIds);

    // ── Build lookup maps ─────────────────────────────────────
    // task_id (string) → WOC row
    const wocByTask = {};
    wocRows.forEach(w => { wocByTask[String(asNum(w.task_id))] = w; });

    // woc_id (string) → machine-detail aggregated row
    const macByWoc = {};
    macRows.forEach(m => { macByWoc[String(asNum(m.woc_id))] = m; });

    // woc_id (string) → labor-detail aggregated row
    const labByWoc = {};
    labRows.forEach(l => { labByWoc[String(asNum(l.woc_id))] = l; });

    // batch_id (string) → batch row
    const batchById = {};
    batchRows.forEach(b => {
      const bid = String(asNum(b.batch_id));
      batchById[bid] = {
        batchId:        bid,
        batchName:      asStr(b.batch_name),
        releasedStatus: asStr(b.released_status),
        releasedQty:    asNum(b.released_qty),
        tasks:          []
      };
    });

    // ── Process each task ─────────────────────────────────────
    taskRows.forEach(taskRow => {
      const tid       = String(asNum(taskRow.task_id));
      const bid       = String(asNum(taskRow.batch_id));
      const woc       = wocByTask[tid] || null;
      const wocId     = woc ? String(asNum(woc.woc_id)) : null;
      const macDetail = wocId ? (macByWoc[wocId] || null) : null;
      const labDetail = wocId ? (labByWoc[wocId] || null) : null;
      const hasCA     = wocId ? caWocSet.has(wocId) : false;

      const batchStatus = batchById[bid] ? batchById[bid].releasedStatus : '';

      const taskCtx = {
        approvalStatus:     woCtx.approvalStatus,
        approvalStatusName: woCtx.approvalStatusName,
        batchStatus,
        bomItems:    (bomByTask[tid] && bomByTask[tid].size > 0) ? bomByTask[tid] : bomAll,
        fedItems:    (fedByTask[tid] && fedByTask[tid].size > 0) ? fedByTask[tid] : fedAll,
        lpTotal,
        backorderQty: woCtx.backorderQty
      };

      const { cpStatuses, cpData } = computeTaskCheckpoints(
        taskRow, woc, macDetail, labDetail, hasCA, taskCtx
      );

      if (batchById[bid]) {
        batchById[bid].tasks.push({
          taskId:      tid,
          taskName:    asStr(taskRow.task_name),
          taskAltName: asStr(taskRow.task_altname),
          opTaskId:    asStr(taskRow.op_task_id),
          proQty:      asNum(taskRow.tm_pro_qty),
          cpStatuses,
          cpData
        });
      }
    });

    // ── Compute batch-level rollup ────────────────────────────
    const batches = batchRows.map(b => {
      const bid   = String(asNum(b.batch_id));
      const entry = batchById[bid];
      entry.cpStatuses = rollupCpArrays(entry.tasks.map(t => t.cpStatuses));
      return entry;
    });

    return { batches, woContext: woCtx, unitName: woCtx.unitName || '' };
  }

  // ─────────────────────────────────────────────────────────────
  // HTML RENDERING
  // ─────────────────────────────────────────────────────────────

  /** Render one CP cell (td.cp > span.pill) */
  function cpCell(status) {
    const sym = SYM[status] || '–';
    return `<td class="cp"><span class="pill ${esc(status)}">${sym}</span></td>`;
  }

  /**
   * Render the note cell for a row.
   * Joins non-empty notes with ' · ', applies worst-status CSS class.
   */
  function noteCell(notes, cpStatuses) {
    const text = (notes || []).filter(n => n && n.trim()).join(' · ');
    const worst = worstStatus(cpStatuses || []);
    const cls   = (worst === 'err' || worst === 'wait') ? worst : '';
    return `<td><span class="note ${cls}">${esc(text)}</span></td>`;
  }

  /**
   * Returns HTML rows for the drilldown of one WO.
   * Row classes: "batch" for batch rows, "task" for task rows.
   * NOTE: the calling Suitelet's client JS adds class="drilldown-row"
   * and data-woid="…" to every row after insertion — we don't add those here.
   * Rows are NOT pre-hidden; the client JS shows them immediately on expand.
   *
   * @param {string|number} woid
   * @param {Object}        data   Return value of getDrilldownData
   * @param {string}        lang   'th'|'en'
   * @returns {string} HTML
   */
  function renderHtmlFromData(woid, data, lang) {
    let html = '';
    const unitName = data.unitName || '';

    (data.batches || []).forEach(batch => {
      // Derive per-language batch notes from task notes
      const batchNotes = [];
      batch.tasks.forEach(task => {
        const taskNotes = task.cpStatuses
          .map((st, i) => Labels.getCheckpointNote(i, st, task.cpData[i], lang))
          .filter(n => n && n.trim());
        if (taskNotes.length) {
          batchNotes.push(`${esc(task.taskName)}: ${esc(taskNotes.join(' · '))}`);
        }
      });

      const batchCpStatuses = batch.cpStatuses || Array(8).fill('na');
      const batchNoteText   = batchNotes.join(' | ');
      const batchWorst      = worstStatus(batchCpStatuses);
      const batchNoteCls    = (batchWorst === 'err' || batchWorst === 'wait') ? batchWorst : '';

      // ── Batch row ──────────────────────────────────────────
      const batchQtyLabel = lang === 'en' ? 'Qty' : 'จำนวน';
      const batchQtyStr = `${batch.releasedQty}${unitName ? ' ' + esc(unitName) : ''}`;
      html += `<tr class="batch">`;
      html += `<td>${esc(batch.batchName)}<div style="font-size:11px;color:var(--muted);margin-top:2px">${batchQtyLabel}: ${batchQtyStr}</div></td><td></td><td></td>`;
      batchCpStatuses.forEach(st => { html += cpCell(st); });
      html += `<td><span class="note ${batchNoteCls}">${esc(batchNoteText)}</span></td>`;
      html += `</tr>\n`;

      // ── Task rows ──────────────────────────────────────────
      batch.tasks.forEach(task => {
        const localNotes = task.cpStatuses.map((st, i) =>
          Labels.getCheckpointNote(i, st, task.cpData[i], lang)
        );
        html += `<tr class="task">`;
        html += `<td>${esc(task.taskName)}${task.taskAltName ? `<div style="font-size:11px;color:var(--muted);margin-top:1px">${esc(task.taskAltName)}</div>` : ''}</td><td></td><td></td>`;
        task.cpStatuses.forEach(st => { html += cpCell(st); });
        html += noteCell(localNotes, task.cpStatuses);
        html += `</tr>\n`;
      });
    });

    return html;
  }

  // ─────────────────────────────────────────────────────────────
  // getDrilldownHtml — primary entry point called by main Suitelet
  // ─────────────────────────────────────────────────────────────

  /**
   * Fetch all drilldown data for a WO and return rendered HTML rows.
   * Called by the main Suitelet's renderDrilldown() handler.
   *
   * @param {Object} opts
   * @param {number|string} opts.woid   Internal id of the WO
   * @param {string}        opts.lang   'th' | 'en'  (default 'th')
   * @returns {string} HTML fragment: zero or more <tr> elements
   */
  function getDrilldownHtml(opts) {
    const woid = parseInt(opts.woid, 10);
    const lang = opts.lang || 'th';

    if (!woid || isNaN(woid)) {
      log.error({ title: 'getDrilldownHtml: invalid woid', details: String(opts.woid) });
      return '';
    }

    const data = getDrilldownData(woid);
    return renderHtmlFromData(woid, data, lang);
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────
  return { getDrilldownHtml, getDrilldownData };
});
