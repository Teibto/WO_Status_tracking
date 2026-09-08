-- =============================================================================
-- test_cp03_feedmat.sql
-- Prototype / performance probe for CP3 — Feed Materials
--
-- PURPOSE
--   Test execution time, row count, and governance usage for both sub-queries
--   that make up CP3 before the JS module is deployed.
--
-- HOW TO USE
--   1. Open NetSuite > Setup > SuiteQL Console (or Analytics Workbook SQL tab).
--   2. Paste ONE query block at a time (CP3a or CP3b).
--   3. Note the elapsed time shown by the console, the row count in the results,
--      and governance usage from the script status (if running inside a script).
--
-- WHAT TO MEASURE
--   - Elapsed time: target < 5 s for a 7-day window; > 10 s → add indexes or
--     narrow the window.
--   - Row count: CP3a can easily return 10 000+ rows for busy factories with
--     large BOMs. If it does, the JS module uses runSuiteQLPaged (pageSize 1000)
--     to avoid the 5 000-row silent truncation cap of asMappedResults().
--   - Governance: each runSuiteQL / runSuiteQLPaged page costs ~10 governance
--     units. At pageSize 1000 and 10 000 rows that is 10 pages = 100 units.
--     A MapReduce script allows 1 000 units per map/reduce invocation.
--
-- DATE RANGE (hardcoded 7-day window for testing)
--   Adjust the dates below to match a week with real production data in your
--   sandbox / production environment.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- CP3a — BOM Components per WO
-- Mirrors WOStatusTracking_Queries.js :: getCP3a_BomComponents()
--
-- Returns one row per component item per WO.
-- The JS merge step compares this set against the fed items (CP3b) to
-- determine whether all BOM lines have been issued.
--
-- Expected columns: woid, item_id
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  tl.transaction   AS woid,
  tl.item          AS item_id
FROM transactionline tl
JOIN transaction t ON t.id = tl.transaction
WHERE t.type         = 'WorkOrd'
  AND t.trandate    >= TO_DATE('2026-06-07', 'YYYY-MM-DD')
  AND t.trandate    <= TO_DATE('2026-06-13', 'YYYY-MM-DD')
  AND tl.mainline   = 'F'
  AND tl.item        IS NOT NULL
ORDER BY tl.transaction, tl.item


-- ─────────────────────────────────────────────────────────────────────────────
-- MEASUREMENT CHECKLIST for CP3a
--   [ ] Row count shown in results tab
--   [ ] Elapsed time shown in console header
--   [ ] If row count > 5 000 → confirm JS module uses runSuiteQLPaged
--   [ ] If elapsed > 10 s → consider adding a date filter on tl as well,
--       or pre-filtering WO ids from CP1 and using an IN list (production path)
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- CP3b — Fed Items per WO (Inventory Adjustment, MFG raw material type)
-- Mirrors WOStatusTracking_Queries.js :: getCP3b_FedItems()
--
-- Returns one row per (woid, item) pair actually issued via InvAdjst.
-- The JS merge step builds a Set of fed item ids per WO and checks that
-- every BOM item from CP3a is covered.
--
-- Expected columns: woid, item_id
--
-- NOTE: This query joins customrecord_thl_adjustmenttype — if the record
--       internal id name differs in your account (e.g. customrecord_mfg_adjustmenttype)
--       update both here and in the JS module.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  ial.custcol_mfg2_ref_workorder   AS woid,
  ial.item                         AS item_id
FROM transaction ia
JOIN transactionline ial
  ON ia.id = ial.transaction
JOIN customrecord_thl_adjustmenttype adjt
  ON ia.custbody_thl_adjustmenttype = adjt.id
WHERE ia.type = 'InvAdjst'
  AND adjt.custrecord_adjt_mfgrawmaterial = 'T'
  AND ia.trandate >= TO_DATE('2026-06-07', 'YYYY-MM-DD')
  AND ia.trandate <= TO_DATE('2026-06-13', 'YYYY-MM-DD')
ORDER BY ial.custcol_mfg2_ref_workorder, ial.item


-- ─────────────────────────────────────────────────────────────────────────────
-- MEASUREMENT CHECKLIST for CP3b
--   [ ] Row count shown in results tab
--   [ ] Elapsed time shown in console header
--   [ ] Confirm adjt.custrecord_adjt_mfgrawmaterial = 'T' is filtering correctly
--       (run without that filter, compare row counts; if same → all adjustments
--       are raw material type OR the field name needs checking)
--   [ ] Confirm custcol_mfg2_ref_workorder is populated on the lines
--       (null woid rows indicate adjustments not linked to a WO — expected or data issue)
-- ─────────────────────────────────────────────────────────────────────────────
