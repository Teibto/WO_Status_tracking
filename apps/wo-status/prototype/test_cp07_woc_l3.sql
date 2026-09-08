-- =============================================================================
-- test_cp07_woc_l3.sql
-- Prototype / performance probe for CP7 Layer 3 — WOC GROUP BY task
--
-- PURPOSE
--   Test execution time, row count, and governance usage for the CP7 L2+L3
--   query (task-management planned qty vs WOC actual qty aggregation) before
--   the JS module is deployed.
--
-- HOW TO USE
--   1. Open NetSuite > Setup > SuiteQL Console (or Analytics Workbook SQL tab).
--   2. Paste ONE query block at a time (L1 or L2+L3).
--   3. Note the elapsed time, row count, and governance usage.
--
-- WHAT TO MEASURE
--   - Elapsed time: the L2+L3 query does a LEFT JOIN workordercompletion and
--     a GROUP BY across all tasks for the WO set. Target < 8 s.
--     If slower, reduce the date window or pre-filter WO ids.
--   - Row count: one row per task per WO. With 10 operations per WO and
--     200 WOs = 2 000 rows — within one page. At 500 WOs = 5 000 rows,
--     which hits the asMappedResults() cap. The JS module uses
--     runSuiteQLPaged to handle this safely.
--   - LEFT JOIN WOC: rows where woc_good / woc_scrap / etc. are NULL mean
--     no WOC has been created for that task yet. The JS module treats these
--     as Error (✕) state.
--
-- ⚠️  FIELD NAME TO VERIFY BEFORE PRODUCTION DEPLOY
--   custbody_mfg_rework_qty on workordercompletion has no 'woc' infix.
--   Confirm in your account that this is the correct field id for WOC rework qty.
--   It may be custbody_mfg_woc_rework_qty. If the query below throws, swap the name.
--
-- DATE RANGE (hardcoded 7-day window for testing)
--   Adjust to match a week with real production data.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- CP7 Layer 1 — Lot & Pallet qty rollup per WO
-- Mirrors WOStatusTracking_Queries.js :: getCP7_WOC() → l1
--
-- Compare total_lp_qty vs WO custbody_mfg_qty_produce_back_order (from CP1).
-- If total_lp_qty < back_order_qty → L1 incomplete.
--
-- Expected columns: woid, total_lp_qty
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  lp.custrecord_mfg_lpi_wo       AS woid,
  SUM(lp.custrecord_mfg_lpi_qty) AS total_lp_qty
FROM customrecord_mfg_lot_pallet_info lp
-- Scope to WOs in the test date window by joining transaction
JOIN transaction t
  ON t.id   = lp.custrecord_mfg_lpi_wo
 AND t.type = 'WorkOrd'
 AND t.trandate >= TO_DATE('2026-06-07', 'YYYY-MM-DD')
 AND t.trandate <= TO_DATE('2026-06-13', 'YYYY-MM-DD')
GROUP BY lp.custrecord_mfg_lpi_wo
ORDER BY lp.custrecord_mfg_lpi_wo


-- ─────────────────────────────────────────────────────────────────────────────
-- MEASUREMENT CHECKLIST for CP7 L1
--   [ ] Row count (= number of distinct WOs with at least one lot/pallet record)
--   [ ] Elapsed time
--   [ ] Compare total_lp_qty to known back_order_qty to verify SUM is correct
--   [ ] Check that WOs with no L&P records are absent (as expected — they will
--       show as Monitor/Incomplete when the JS merge step runs CP1 vs CP7 L1)
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- CP7 Layer 2+3 — Task planned qty vs WOC actual qty (task-grain GROUP BY)
-- Mirrors WOStatusTracking_Queries.js :: getCP7_WOC() → l2l3
--
-- One row per (woid, task_id).
-- Columns ending _tm_ are from customrecord_mfg_task_management (the plan).
-- Columns ending _woc_ are SUM'd from workordercompletion (the actuals).
-- NULL woc_* values indicate no WOC exists for that task yet.
--
-- ⚠️  custbody_mfg_rework_qty — see field name warning at top of file.
--
-- Expected columns: woid, task_id, tm_good, tm_scrap, tm_rework, tm_move,
--                   tm_pro_qty, woc_good, woc_scrap, woc_rework, woc_move
-- ─────────────────────────────────────────────────────────────────────────────
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
  SUM(woc.custbody_mfg_rework_qty)     AS woc_rework,  -- TODO: verify field name
  SUM(woc.custbody_mfg_woc_move_qty)   AS woc_move
FROM customrecord_mfg_task_management tm
-- Scope to WOs in the test date window
JOIN transaction t
  ON t.id   = tm.custrecord_mfg_tm_wo
 AND t.type = 'WorkOrd'
 AND t.trandate >= TO_DATE('2026-06-07', 'YYYY-MM-DD')
 AND t.trandate <= TO_DATE('2026-06-13', 'YYYY-MM-DD')
LEFT JOIN workordercompletion woc
  ON woc.custbody_mfg_task_mgn_ref = tm.id
GROUP BY
  tm.custrecord_mfg_tm_wo,
  tm.id,
  tm.custrecord_mfg_tm_good_qty,
  tm.custrecord_mfg_tm_scrap_qty,
  tm.custrecord_mfg_tm_rework_qty,
  tm.custrecord_mfg_tm_move_qty,
  tm.custrecord_mfg_tm_pro_qty
ORDER BY tm.custrecord_mfg_tm_wo, tm.id


-- ─────────────────────────────────────────────────────────────────────────────
-- MEASUREMENT CHECKLIST for CP7 L2+L3
--   [ ] Row count (= total tasks across all WOs in the window)
--   [ ] Elapsed time — target < 8 s; if slower, reduce window or pre-filter WOs
--   [ ] If row count > 5 000 → confirm JS module uses runSuiteQLPaged
--   [ ] Spot-check: pick one WO, verify tm_good + woc_good match expectation
--   [ ] Check rows where woc_good IS NULL — these are tasks with no WOC (Error)
--   [ ] If custbody_mfg_rework_qty throws "Invalid column" → swap to
--       custbody_mfg_woc_rework_qty and update JS module accordingly
-- ─────────────────────────────────────────────────────────────────────────────
