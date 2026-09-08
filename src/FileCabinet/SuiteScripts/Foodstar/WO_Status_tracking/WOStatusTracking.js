/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * WO Status Tracking — Main Suitelet
 * Foodstar / TEIBTO Manufacturing
 *
 * Action modes (context.request.parameters.action):
 *   (none)       → renderForm  — filter form, initial load (GET)
 *   'search'     → renderResults — run queries, build results grid (GET with params)
 *   'drilldown'  → renderDrilldown — lazy-load batch+task rows for one WO (returns HTML fragment)
 *
 * ─────────────────────────────────────────────────────────────────
 * QUERY CONTRACT — shapes expected from WOStatusTracking_Queries.js
 * ─────────────────────────────────────────────────────────────────
 *
 * getCP1_Approve(params) → [{
 *   woid: number,        // internalid of Work Order
 *   woNumber: string,    // WO document number, e.g. "WO-26-00148"
 *   itemName: string,    // manufactured item name
 *   qty: number,         // wo planned quantity
 *   qtyUnit: string,     // unit of measure display name
 *   woDate: string,      // WO date (YYYY-MM-DD)
 *   locationId: number,
 *   locationName: string,
 *   lineId: number|null, // custbody production line internal id
 *   lineName: string,    // custbody production line display name
 *   approvalStatus: number, // 1=pending, 2=approved
 * }]
 *
 * getCP2_Release(woids) → [{
 *   woid: string,
 *   batchId: string,    // internal id of batch record
 *   batchName: string,  // display name e.g. "Batch B01 (LOT2606-A)"
 *   released: 'T'|'F', // 'T' = custrecord_mfg_released_status = 2
 * }]
 *
 * getCP3a_BomComponents(woids) → [{
 *   woid: string,
 *   itemId: string,   // internal id of BOM component item
 *   itemName: string, // display name of the item (for error notes)
 * }]
 *
 * getCP3b_FedItems(woids) → [{
 *   woid: string,
 *   itemId: string,
 *   itemName: string,
 * }]
 *
 * getCP4_Machine(woids) → [{
 *   woid: string,
 *   batchId: string,         // from tm.custrecord_mfg_tm_releasedbatch
 *   taskId: string,
 *   wocId: string,
 *   hasWOC: 'T',             // always 'T' (row only exists if WOC exists)
 *   machineTime: number,     // custbody_mfg_machinetime
 *   detailTotalTime: number, // SUM of child custrecord_mfg_com_mac_totaltime
 *   mismatch: 'T'|'F',      // 'T' if machineTime ≠ detailTotalTime (both > 0)
 *   downtimeMissing: 'T'|'F', // 'T' if any child has down_reason but missing start/end/min
 * }]
 *
 * getCP5_Labor(woids) → [{
 *   woid: string,
 *   batchId: string,
 *   taskId: string,
 *   wocId: string,
 *   hasWOC: 'T',
 *   laborTime: number,      // custbody_mfg_labortime
 *   totalLbTimeCal: number, // custbody_mfg_woc_totallbtimecal
 *   childLaborSum: number,  // SUM of child custrecord_mfg_com_laborquantity
 *   mismatch: 'T'|'F',     // 'T' if totalLbTimeCal ≠ childLaborSum (both > 0)
 * }]
 *
 * getCP6_Time(woids) → [{
 *   woid: string,
 *   batchId: string,
 *   taskId: string,
 *   wocId: string,
 *   hasWOC: 'T',
 *   startDt: string,  // custbody_mfg_com_start_date_time (ISO string)
 *   endDt: string,    // custbody_mfg_com_end_date_time (ISO string)
 *   totalMin: number, // custbody_mfg_total_minute (recorded)
 *   // computedMin = (new Date(endDt) - new Date(startDt)) / 60000 — computed in Suitelet
 * }]
 *
 * getCP7_WOC(woids) → [{
 *   woid: number,
 *   batchId: number,
 *   taskId: number,
 *   taskNumber: string,
 *   hasWOC: 'T'|'F',
 *   l1QtyComplete: number,  // qty closed on this completion record
 *   l2ProQty: number,       // actual production qty for this task
 *   l3TargetQty: number,    // WO planned qty (for mismatch check)
 * }]
 *
 * getCP8_CostGen(woids) → [{
 *   woid: number,
 *   batchId: number,
 *   taskId: number,
 *   taskNumber: string,
 *   hasWOC: 'T'|'F',
 *   hasCostAlloc: 'T'|'F',  // 'T' = cost allocation record exists
 * }]
 *
 * ─────────────────────────────────────────────────────────────────
 * Rollup rule (used in both KPI counts and WO-row pill display):
 *   err  if any checkpoint is 'err'
 *   wait if no 'err' and any checkpoint is 'wait'
 *   ok   if all checkpoints are 'ok' or 'na'
 * ─────────────────────────────────────────────────────────────────
 */

define(
  ['N/ui/serverWidget', 'N/query', 'N/log',
   './WOStatusTracking_Queries', './WOStatusTracking_Labels',
   './WOStatusTracking_Drilldown', './WOReportTheme'],
  (serverWidget, query, log, Q, Labels, Drilldown, theme) => {

    // ─── Constants ────────────────────────────────────────────────
    const PAGE_SIZE = 100;

    /**
     * CSS เฉพาะรายงานนี้ - token กลางอยู่ที่ WOReportTheme.js
     *
     * บล็อก `:root` ที่นี่ไม่ประกาศค่าสีของตัวเองอีก เป็นแค่ **ชื่อเรียกสั้น**
     * ที่ชี้กลับไปที่ token ของ template ทำให้ markup และกฎ CSS เดิมทั้งไฟล์
     * ยังใช้ `var(--ok)` `var(--line)` ได้เหมือนเดิมโดยไม่ต้องแก้ทีละจุด
     * แต่สีที่ออกมาเป็นสีเดียวกับ report-builder แล้ว
     * (เดิม `--accent:#2563eb` ขณะที่ template ใช้ `#185FA5`)
     */
    const REPORT_CSS = ':root{'
      + '--bg:var(--pj-bg);--panel:var(--pj-surface);--panel2:var(--pj-surface-alt);'
      + '--line:var(--pj-border);--txt:var(--pj-text);--muted:var(--pj-text-muted);'
      + '--accent:var(--pj-primary);'
      + '--ok:var(--pj-success);--ok-bg:var(--pj-success-bg);'
      + '--wait:var(--pj-warning);--wait-bg:var(--pj-warning-bg);'
      + '--err:var(--pj-error);--err-bg:var(--pj-error-bg);'
      + '--na:var(--pj-muted);--na-bg:var(--pj-muted-bg)'
      + '}'
      // แถบหัวเรื่องใช้ .topbar ของ template ทั้งชุด เหลือเฉพาะปุ่มสลับภาษาที่เป็นของหน้านี้เอง
      + '.langtog{display:flex;border:1px solid var(--pj-border-strong);'
      + 'border-radius:var(--radius-md);overflow:hidden;flex-shrink:0}'
      + '.langtog button{background:var(--pj-surface);border:0;padding:6px var(--sp-4);'
      + 'cursor:pointer;font-family:inherit;font-size:var(--fs-sm);font-weight:600;'
      + 'color:var(--pj-text-muted)}'
      + '.langtog button.on{background:var(--pj-primary);color:#fff}'
      // แถบตัวกรอง = .toolbar ของ template (พื้นเทาอ่อน เส้นล่างเส้นเดียว)
      + '.filterbar{display:flex;gap:var(--sp-4);align-items:flex-end;flex-wrap:wrap;'
      + 'padding:var(--sp-3) var(--sp-5);background:var(--pj-surface-alt);'
      + 'border-bottom:1px solid var(--pj-border)}'
      + '.filterbar .fld{display:flex;flex-direction:column;gap:var(--sp-1)}'
      + '.filterbar select,.filterbar input{min-width:150px}'
      // ช่องวันที่เป็นช่องข้อความ (dd/mm/yyyy) — เลขความกว้างเท่ากันเหมือนตารางตัวเลข
      + '.dateinput{font-variant-numeric:tabular-nums}'
      + '.filterbar button{background:var(--pj-primary);color:#fff;'
      + 'border:1px solid var(--pj-primary);padding:7px var(--sp-4);'
      + 'border-radius:var(--radius-md);font-family:inherit;font-weight:600;'
      + 'cursor:pointer;font-size:var(--fs-sm)}'
      + '.filterbar button:hover{background:var(--pj-primary-dark)}'
      // KPI - คงคลาส .kpi เดิมไว้เพราะ markup มี data-i18n ผูกอยู่ แต่หน้าตาตาม .kpi-card
      // ต่างจาก template จุดเดียว: ค่าตัวใหญ่กว่า เพราะหน้านี้มี 4 การ์ด ไม่ใช่ 10
      + '.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));'
      + 'gap:var(--sp-2);padding:var(--sp-3) var(--sp-5)}'
      + '.kpi{background:var(--pj-surface);border:1px solid var(--pj-border);'
      + 'border-left:3px solid var(--pj-primary);border-radius:var(--radius-md);'
      + 'padding:var(--sp-2) var(--sp-3);min-width:0;transition:box-shadow .15s}'
      + '.kpi:hover{box-shadow:var(--shadow-md)}'
      + '.kpi .n{font-size:var(--fs-xxl);font-weight:700;letter-spacing:-.4px;line-height:1.2}'
      + '.kpi .l{font-size:10px;color:var(--pj-text-label);font-weight:600;'
      + 'text-transform:uppercase;letter-spacing:.4px;margin-top:2px}'
      + '.kpi.err{border-left-color:var(--pj-error)}.kpi.err .n{color:var(--pj-error)}'
      + '.kpi.wait{border-left-color:var(--pj-warning)}.kpi.wait .n{color:var(--pj-warning)}'
      + '.kpi.ok{border-left-color:var(--pj-success)}.kpi.ok .n{color:var(--pj-success)}'
      + '.wrap{padding:0 var(--sp-5) 40px}'
      + '.tscroll{overflow-x:auto}'
      // ตารางหลักไม่ใช้เส้นรอบทุกช่องแบบ template เพราะกว้างเกิน 1,240px
      // เส้นแนวตั้งทุกคอลัมน์จะกลายเป็นลายทาง - คงเส้นล่างเส้นเดียวเหมือนของเดิม
      + 'table{margin-top:6px;min-width:1240px}'
      + 'th,td{border:0;border-bottom:1px solid var(--pj-border);padding:9px 10px;'
      + 'white-space:nowrap;vertical-align:middle}'
      + 'th{position:sticky;top:0;z-index:2;background:var(--pj-surface-alt)}'
      + 'th.cp,td.cp{text-align:center;width:74px}'
      + 'tr.wo{cursor:pointer}'
      + 'tr.wo:hover{background:var(--pj-surface-alt)}'
      + 'tr.wo>td:first-child{font-weight:600}'
      + '.twist{display:inline-block;width:14px;color:var(--pj-text-muted);'
      + 'transition:transform .15s}'
      + 'tr.open .twist{transform:rotate(90deg)}'
      + 'tr.batch{background:var(--pj-surface)}'
      + 'tr.batch td:first-child{padding-left:34px;color:var(--pj-text)}'
      + 'tr.batch:hover{background:var(--pj-surface-alt)}'
      + 'tr.task{background:var(--pj-surface-alt)}'
      + 'tr.task td:first-child{padding-left:58px;color:var(--pj-text-muted)}'
      + '.pill{display:inline-flex;align-items:center;justify-content:center;'
      + 'width:30px;height:30px;border-radius:var(--radius-md);'
      + 'font-size:var(--fs-lg);line-height:1;position:relative}'
      + '.pill.ok{background:var(--pj-success-bg);color:var(--pj-success)}'
      + '.pill.wait{background:var(--pj-warning-bg);color:var(--pj-warning)}'
      + '.pill.err{background:var(--pj-error-bg);color:var(--pj-error)}'
      + '.pill.na{background:var(--pj-muted-bg);color:var(--pj-muted)}'
      + '.note-icon{display:inline-flex;align-items:center;justify-content:center;'
      + 'width:24px;height:24px;border-radius:var(--radius-sm);font-size:var(--fs-md);'
      + 'cursor:default;line-height:1}'
      + '.note-icon.err{background:var(--pj-error-bg);color:var(--pj-error)}'
      + '.note-icon.wait{background:var(--pj-warning-bg);color:var(--pj-warning)}'
      + '.legend{display:flex;gap:var(--sp-5);flex-wrap:wrap;'
      + 'padding:var(--sp-3) var(--sp-5);color:var(--pj-text-muted);font-size:var(--fs-sm);'
      + 'border-top:1px solid var(--pj-border);margin-top:var(--sp-2)}'
      + '.legend span{display:inline-flex;align-items:center;gap:6px}'
      + '.legend-icon{font-size:var(--fs-md);line-height:1}'
      + '.drilldown-loading td{padding:10px 34px;color:var(--pj-text-muted);font-style:italic}'
      + '.pagination{display:flex;gap:6px;align-items:center;'
      + 'padding:var(--sp-3) var(--sp-5);flex-wrap:wrap}'
      + '.pglink,.pgcur{padding:5px 10px;border-radius:var(--radius-sm);'
      + 'border:1px solid var(--pj-border-strong);text-decoration:none;'
      + 'font-size:var(--fs-sm);color:var(--pj-primary);background:var(--pj-surface)}'
      + '.pgcur{background:var(--pj-primary);color:#fff;'
      + 'border-color:var(--pj-primary);font-weight:700}'
      + '.pglink:hover{background:var(--pj-surface-alt)}'
      + '.pgellipsis{color:var(--pj-text-muted);padding:0 4px}'
      + '#tip{position:fixed;z-index:50;background:var(--pj-text);'
      + 'border:1px solid var(--pj-text);color:#fff;padding:8px 10px;'
      + 'border-radius:var(--radius-md);font-size:11.5px;max-width:320px;'
      + 'pointer-events:none;display:none;white-space:normal;line-height:1.45;'
      + 'box-shadow:var(--shadow-lg)}'
      + '.error-page{padding:40px var(--sp-5);color:var(--pj-error)}';
    const STATUS_RANK = { na: 0, ok: 1, wait: 2, err: 3 };
    const STATUS_INV  = ['na', 'ok', 'wait', 'err'];

    // ─── Entry point ──────────────────────────────────────────────
    function onRequest(context) {
      const action = context.request.parameters.action || '';
      try {
        if (action === 'search' && context.request.parameters.fragment === '1') {
          renderFragment(context);
        } else if (action === 'search') {
          renderResults(context);
        } else if (action === 'drilldown') {
          renderDrilldown(context);
        } else {
          renderForm(context);
        }
      } catch (e) {
        log.error({ title: 'WOStatusTracking onRequest error', details: JSON.stringify(e) });
        context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
        context.response.write(buildErrorPage(e.message || String(e)));
      }
    }

    // ══════════════════════════════════════════════════════════════
    // renderForm — initial filter page (no results)
    // ══════════════════════════════════════════════════════════════
    function renderForm(context) {
      const p        = context.request.parameters;
      const lang     = p.lang   || 'th';
      const scriptId = p.script || '';
      const deployId = p.deploy || '';
      const woNumber    = (p.woNumber    || '').trim().toUpperCase();
      const batchNumber = (p.batchNumber || '').trim().toUpperCase();
      const osNumber    = (p.osNumber    || '').trim().toUpperCase();
      const embed       = p.embed === '1';

      // Load subsidiaries
      let subRows = [];
      try {
        subRows = query.runSuiteQL({
          query: `SELECT id, name FROM subsidiary ORDER BY name`
        }).asMappedResults();
      } catch (e) {
        log.error({ title: 'Subsidiary query failed', details: JSON.stringify(e) });
      }

      // Load production plant locations
      let locRows = [];
      try {
        locRows = query.runSuiteQL({
          query: `SELECT id, name FROM location WHERE custrecord_mfg_productionplant = 'T' ORDER BY name`
        }).asMappedResults();
      } catch (e) {
        log.error({ title: 'Location query failed', details: JSON.stringify(e) });
      }

      // Default date range: today-6 → today (≤7 days)
      const today = new Date();
      const todayStr = formatDate(today);
      const fromDate = new Date(today);
      fromDate.setDate(fromDate.getDate() - 6);
      const fromStr = formatDate(fromDate);

      const html = buildPageShell({
        lang,
        subRows,
        locRows,
        selectedSub: '',
        selectedLoc: '',
        selectedFrom: fromStr,
        selectedTo: todayStr,
        kpiHtml: '',
        gridHtml: '',
        paginationHtml: '',
        page: 1,
        totalPages: 0,
        totalWO: 0,
        scriptId,
        deployId,
        embed,
        woNumber,
        batchNumber,
        osNumber,
      });

      context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
      context.response.write(html);
    }

    // ══════════════════════════════════════════════════════════════
    // renderResults — run queries, build results grid
    // ══════════════════════════════════════════════════════════════
    function renderResults(context) {
      const p = context.request.parameters;
      const lang         = p.lang || 'th';
      const subsidiaryId = p.subsidiaryId || '';
      const locationId   = p.locationId   || '';
      const dateFromRaw  = p.dateFrom     || '';
      const dateToRaw    = p.dateTo       || '';
      const dateFrom     = parseFilterDate(dateFromRaw);
      const dateTo       = parseFilterDate(dateToRaw);
      const page         = Math.max(1, parseInt(p.page, 10) || 1);
      const scriptId     = p.script || '';
      const deployId     = p.deploy || '';
      const woNumber     = (p.woNumber     || '').trim().toUpperCase();
      const batchNumber  = (p.batchNumber  || '').trim().toUpperCase();
      const osNumber     = (p.osNumber     || '').trim().toUpperCase();
      const embed        = p.embed === '1';
      const hasEntityFilter = !!(woNumber || batchNumber || osNumber);

      // ── Server-side date format guard ───────────────────────────
      // ช่องกรองเป็น text แล้ว (dd/mm/yyyy) ค่าที่ส่งมาจึงอาจอ่านไม่ออก
      // ต้องบอกตรง ๆ ไม่ปล่อยให้ TO_DATE พังแล้วผู้ใช้เห็นเป็น "ไม่พบข้อมูล"
      if (!hasEntityFilter && ((dateFromRaw && !dateFrom) || (dateToRaw && !dateTo))) {
        const fmtErr = lang === 'en'
          ? 'Invalid date format. Use dd/mm/yyyy — e.g. 08/09/2026.'
          : 'รูปแบบวันที่ไม่ถูกต้อง — ต้องเป็น dd/mm/yyyy เช่น 08/09/2026';
        context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
        context.response.write(buildErrorPage(fmtErr));
        return;
      }

      // Load filter dropdown data (need to repopulate on results page)
      let subRows = [];
      try {
        subRows = query.runSuiteQL({
          query: `SELECT id, name FROM subsidiary ORDER BY name`
        }).asMappedResults();
      } catch (e) {
        log.error({ title: 'Subsidiary query failed (results)', details: JSON.stringify(e) });
      }

      let locRows = [];
      try {
        locRows = query.runSuiteQL({
          query: `SELECT id, name FROM location WHERE custrecord_mfg_productionplant = 'T' ORDER BY name`
        }).asMappedResults();
      } catch (e) {
        log.error({ title: 'Location query failed (results)', details: JSON.stringify(e) });
      }

      // ── Server-side date range guard (≤7 days) ──────────────────
      // Skip when a specific-entity filter (WO/Batch/OS) is provided
      if (!hasEntityFilter && dateFrom && dateTo) {
        const d1 = new Date(dateFrom), d2 = new Date(dateTo);
        const diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);
        if (diffDays > 7 || diffDays < 0) {
          const errMsg = lang === 'en'
            ? 'Date range must be ≤ 7 days. Please go back and refine your filter.'
            : 'กรุณาเลือกช่วงวันที่ไม่เกิน 7 วัน — กรุณากลับไปแก้ไขตัวกรอง';
          context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
          context.response.write(buildErrorPage(errMsg));
          return;
        }
      }

      // ── Step 1: CP1 — get canonical WO list ──────────────────────
      const searchParams = { subsidiaryId, locationId, dateFrom, dateTo, woNumber, batchNumber, osNumber };
      let cp1Rows = [];
      try {
        cp1Rows = Q.getCP1_Approve(searchParams);
      } catch (e) {
        log.error({ title: 'CP1 query failed', details: JSON.stringify(e) });
      }

      const allWoids = cp1Rows.map(r => r.woid);

      // ── Step 2: CP2–CP9 — run all checkpoint queries ──────────────
      let cp2Data = [], cp3aData = [], cp3bData = [],
          cp4Data = [], cp5Data = [], cp6Data = [], cp7Data = [], cp8Data = [],
          cp9Data = [];

      if (allWoids.length > 0) {
        try { cp2Data  = Q.getCP2_Release(allWoids);          } catch (e) { log.error({ title: 'CP2 failed',  details: String(e) }); }
        try { cp3aData = Q.getCP3a_BomComponents(allWoids);   } catch (e) { log.error({ title: 'CP3a failed', details: String(e) }); }
        try { cp3bData = Q.getCP3b_FedItems(allWoids);        } catch (e) { log.error({ title: 'CP3b failed', details: String(e) }); }
        try { cp4Data  = Q.getCP4_Machine(allWoids);          } catch (e) { log.error({ title: 'CP4 failed',  details: String(e) }); }
        try { cp5Data  = Q.getCP5_Labor(allWoids);            } catch (e) { log.error({ title: 'CP5 failed',  details: String(e) }); }
        try { cp6Data  = Q.getCP6_Time(allWoids);             } catch (e) { log.error({ title: 'CP6 failed',  details: String(e) }); }
        try { cp7Data  = Q.getCP7_WOC(allWoids);              } catch (e) { log.error({ title: 'CP7 failed',  details: String(e) }); }
        try { cp8Data  = Q.getCP8_CostGen(allWoids);          } catch (e) { log.error({ title: 'CP8 failed',  details: String(e) }); }
        try { cp9Data  = Q.getCP9_StdCostSetup(allWoids);     } catch (e) { log.error({ title: 'CP9 failed',  details: String(e) }); }
      }

      // ── Step 3: Build status matrix ────────────────────────────
      const matrix = buildStatusMatrix(cp1Rows, cp2Data, cp3aData, cp3bData,
                                       cp4Data, cp5Data, cp6Data, cp7Data, cp8Data,
                                       cp9Data);

      // ── Step 4: Compute KPIs ────────────────────────────────────
      let kpiTotal = matrix.length, kpiOk = 0, kpiWait = 0, kpiErr = 0;
      matrix.forEach(wo => {
        const bucket = woKpiBucket(wo.cpStatus);
        if (bucket === 'ok')        kpiOk++;
        else if (bucket === 'err')  kpiErr++;
        else                        kpiWait++;
      });

      // ── Step 5: Paginate ────────────────────────────────────────
      const totalPages = Math.max(1, Math.ceil(kpiTotal / PAGE_SIZE));
      const pageStart  = (page - 1) * PAGE_SIZE;
      const pageEnd    = Math.min(pageStart + PAGE_SIZE, kpiTotal);
      const pageRows   = matrix.slice(pageStart, pageEnd);

      // ── Step 6: Build HTML sections ────────────────────────────
      const kpiHtml       = buildKpiHtml(kpiTotal, kpiOk, kpiWait, kpiErr, lang);
      const gridHtml      = buildGridHtml(pageRows, lang);
      const paginationHtml = buildPaginationHtml({
        page, totalPages, subsidiaryId, locationId, dateFrom, dateTo, lang,
        woNumber, batchNumber, osNumber, embed
      });

      const html = buildPageShell({
        lang,
        subRows,
        locRows,
        selectedSub: subsidiaryId,
        selectedLoc: locationId,
        selectedFrom: dateFrom,
        selectedTo: dateTo,
        kpiHtml,
        gridHtml,
        paginationHtml,
        page,
        totalPages,
        totalWO: kpiTotal,
        scriptId,
        deployId,
        embed,
        woNumber,
        batchNumber,
        osNumber,
      });

      context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
      context.response.write(html);
    }

    // ══════════════════════════════════════════════════════════════
    // renderFragment — returns results-zone HTML only (no full page)
    // Called via AJAX fetch() from validateForm / pagination clicks
    // ══════════════════════════════════════════════════════════════
    function renderFragment(context) {
      const p = context.request.parameters;
      const lang         = p.lang || 'th';
      const subsidiaryId = p.subsidiaryId || '';
      const locationId   = p.locationId   || '';
      const dateFromRaw  = p.dateFrom     || '';
      const dateToRaw    = p.dateTo       || '';
      const dateFrom     = parseFilterDate(dateFromRaw);
      const dateTo       = parseFilterDate(dateToRaw);
      const page         = Math.max(1, parseInt(p.page, 10) || 1);
      const woNumber     = (p.woNumber    || '').trim().toUpperCase();
      const batchNumber  = (p.batchNumber || '').trim().toUpperCase();
      const osNumber     = (p.osNumber    || '').trim().toUpperCase();
      const embed        = p.embed === '1';

      // ชั้น fragment ไม่มี shell ให้แสดงหน้า error จึงตอบเป็นแถบแจ้งใน results-zone
      if (!woNumber && !batchNumber && !osNumber
          && ((dateFromRaw && !dateFrom) || (dateToRaw && !dateTo))) {
        const fmtErr = lang === 'en'
          ? 'Invalid date format. Use dd/mm/yyyy — e.g. 08/09/2026.'
          : 'รูปแบบวันที่ไม่ถูกต้อง — ต้องเป็น dd/mm/yyyy เช่น 08/09/2026';
        context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
        context.response.write('<div class="schema-notice">' + escapeHtml(fmtErr) + '</div>');
        return;
      }

      const searchParams = { subsidiaryId, locationId, dateFrom, dateTo, woNumber, batchNumber, osNumber };
      let cp1Rows = [];
      try { cp1Rows = Q.getCP1_Approve(searchParams); } catch (e) { log.error({ title: 'Fragment CP1 failed', details: String(e) }); }

      const allWoids = cp1Rows.map(r => r.woid);
      let cp2Data = [], cp3aData = [], cp3bData = [],
          cp4Data = [], cp5Data = [], cp6Data = [], cp7Data = [], cp8Data = [],
          cp9Data = [];

      if (allWoids.length > 0) {
        try { cp2Data  = Q.getCP2_Release(allWoids);        } catch (e) { log.error({ title: 'Fragment CP2 failed',  details: String(e) }); }
        try { cp3aData = Q.getCP3a_BomComponents(allWoids); } catch (e) { log.error({ title: 'Fragment CP3a failed', details: String(e) }); }
        try { cp3bData = Q.getCP3b_FedItems(allWoids);      } catch (e) { log.error({ title: 'Fragment CP3b failed', details: String(e) }); }
        try { cp4Data  = Q.getCP4_Machine(allWoids);        } catch (e) { log.error({ title: 'Fragment CP4 failed',  details: String(e) }); }
        try { cp5Data  = Q.getCP5_Labor(allWoids);          } catch (e) { log.error({ title: 'Fragment CP5 failed',  details: String(e) }); }
        try { cp6Data  = Q.getCP6_Time(allWoids);           } catch (e) { log.error({ title: 'Fragment CP6 failed',  details: String(e) }); }
        try { cp7Data  = Q.getCP7_WOC(allWoids);            } catch (e) { log.error({ title: 'Fragment CP7 failed',  details: String(e) }); }
        try { cp8Data  = Q.getCP8_CostGen(allWoids);        } catch (e) { log.error({ title: 'Fragment CP8 failed',  details: String(e) }); }
        try { cp9Data  = Q.getCP9_StdCostSetup(allWoids);   } catch (e) { log.error({ title: 'Fragment CP9 failed',  details: String(e) }); }
      }

      const matrix   = buildStatusMatrix(cp1Rows, cp2Data, cp3aData, cp3bData,
                                         cp4Data, cp5Data, cp6Data, cp7Data, cp8Data,
                                         cp9Data);
      let kpiTotal = matrix.length, kpiOk = 0, kpiWait = 0, kpiErr = 0;
      matrix.forEach(wo => {
        const bucket = woKpiBucket(wo.cpStatus);
        if (bucket === 'ok')       kpiOk++;
        else if (bucket === 'err') kpiErr++;
        else                       kpiWait++;
      });

      const totalPages = Math.max(1, Math.ceil(kpiTotal / PAGE_SIZE));
      const pageStart  = (page - 1) * PAGE_SIZE;
      const pageEnd    = Math.min(pageStart + PAGE_SIZE, kpiTotal);
      const pageRows   = matrix.slice(pageStart, pageEnd);

      const kpiHtml        = buildKpiHtml(kpiTotal, kpiOk, kpiWait, kpiErr, lang);
      const gridHtml       = buildGridHtml(pageRows, lang);
      const paginationHtml = buildPaginationHtml({ page, totalPages, subsidiaryId, locationId, dateFrom, dateTo, lang, woNumber, batchNumber, osNumber, embed });
      const legendHtml     = buildLegendHtml(lang);

      context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
      context.response.write(kpiHtml + gridHtml + paginationHtml + (gridHtml ? legendHtml : ''));
    }

    // ══════════════════════════════════════════════════════════════
    // renderDrilldown — returns HTML fragment for batch+task rows
    // Called via fetch() from the client
    // ══════════════════════════════════════════════════════════════
    function renderDrilldown(context) {
      const woid = parseInt(context.request.parameters.woid, 10);
      const lang = context.request.parameters.lang || 'th';

      let html = '';
      try {
        // Delegate to drilldown module
        html = Drilldown.getDrilldownHtml({ woid, lang });
      } catch (e) {
        log.error({ title: 'Drilldown failed', details: JSON.stringify(e) });
        html = `<tr><td colspan="15" style="color:var(--pj-error);padding:12px 34px">
                  Error loading detail: ${escapeHtml(e.message || String(e))}
                </td></tr>`;
      }

      context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
      context.response.write(html);
    }

    // ══════════════════════════════════════════════════════════════
    // buildStatusMatrix
    // Merges all CP data into a per-WO status array
    // ══════════════════════════════════════════════════════════════
    /**
     * @param {Object[]} cp1Rows  - canonical WO list from CP1
     * @param {Object[]} cp2Data  - release status rows
     * @param {Object[]} cp3aData - BOM component rows
     * @param {Object[]} cp3bData - fed item rows
     * @param {Object[]} cp4Data  - machine rows
     * @param {Object[]} cp5Data  - labor rows
     * @param {Object[]} cp6Data  - time rows
     * @param {Object[]} cp7Data  - WOC rows
     * @param {Object[]} cp8Data  - cost gen rows
     * @returns {Object[]} matrix — one entry per WO with cpStatus[11] and batchSummary
     */
    function buildStatusMatrix(cp1Rows, cp2Data, cp3aData, cp3bData,
                               cp4Data, cp5Data, cp6Data, cp7Data, cp8Data,
                               cp9Data) {
      // ── Index all data by woid for fast lookup ─────────────────
      const idx2  = indexBy(cp2Data,  'woid', true);   // woid → [{batchId, released, ...}]
      // CP3: WO-grain item sets — {woid → Set<itemName>}
      const idx3a = indexByWoidItems(cp3aData);   // woid → Set<itemName> (BOM)
      const idx3b = indexByWoidItems(cp3bData);   // woid → Set<itemName> (fed)
      const idx4  = indexBy(cp4Data,  'woid', true);
      const idx5  = indexBy(cp5Data,  'woid', true);
      const idx6  = indexBy(cp6Data,  'woid', true);
      const idx9  = indexBy(cp9Data || [], 'woid', true);
      // CP7 comes as {l1:[{woid,totalLpQty}], l2l3:[{woid,taskId,...}]} — flatten before indexing
      const cp7l1Map = {};
      ((cp7Data && cp7Data.l1) || []).forEach(r => { cp7l1Map[String(r.woid)] = r.totalLpQty; });
      const cp7Flat = ((cp7Data && cp7Data.l2l3) || []).map(r => {
        const wocSum  = (r.wocGood  || 0) + (r.wocScrap  || 0) + (r.wocRework  || 0) + (r.wocMove  || 0);
        const taskSum = (r.tmGood   || 0) + (r.tmScrap   || 0) + (r.tmRework   || 0) + (r.tmMove   || 0);
        return {
          woid:          String(r.woid),
          hasWOC:        wocSum > 0 ? 'T' : 'F',
          l2ProQty:      wocSum,
          l3TargetQty:   taskSum,
          l1QtyComplete: cp7l1Map[String(r.woid)] || 0,
        };
      });
      const idx7  = indexBy(cp7Flat, 'woid', true);
      const idx8  = indexBy(cp8Data,  'woid', true);

      return cp1Rows.map(wo => {
        const woid = wo.woid;
        const batchRowsForWo = idx2[woid] || [];

        // ── CP1: Approval (WO-level) ──────────────────────────────
        const cp1 = computeCP1(wo);

        // ── CP2–CP9: WO-level ─────────────────────────────────────
        const cp2 = computeCP2(woid, batchRowsForWo);
        const cp3 = computeCP3(woid, idx3a[woid] || new Set(), idx3b[woid] || new Set());
        const cp4      = computeCP4(woid, idx4[woid] || []);
        const cp5      = computeCP5(woid, idx5[woid] || []);
        const cp6      = computeCP6(woid, idx6[woid] || []);
        const cpWOC    = computeCP_WOCExists(woid, idx7[woid] || []);
        const cp7      = computeCP7(woid, idx7[woid] || []);
        const cp8      = computeCP8(woid, idx8[woid] || []);
        const cp9      = computeCP9(woid, idx9[woid] || []);

        // ── CPLot: Gen Lot & Pallet (WO-grain, gate = released) ──
        const isReleased = batchRowsForWo.some(r => r.released === 'T');
        const cpLot = computeCP_LotPallet(
          cp7l1Map[String(woid)] || 0,
          parseFloat(wo.backOrderQty) || 0,
          isReleased
        );

        // ── Per-batch CP status (for WO-row rollup badge counts) ──
        // Deduplicate batches from CP2 data; CP1 and CP3 are WO-level (same for all batches)
        const batchIds = [...new Set(batchRowsForWo.map(r => r.batchId))];
        const batches = batchIds.map(batchId => {
          const batchNum = (batchRowsForWo.find(r => r.batchId === batchId) || {}).batchName || String(batchId);
          // Filter all CP data rows to this batch
          const b2   = batchRowsForWo.filter(r => r.batchId === batchId);
          const b4   = (idx4[woid] || []).filter(r => r.batchId === batchId);
          const b5   = (idx5[woid] || []).filter(r => r.batchId === batchId);
          const b6   = (idx6[woid] || []).filter(r => r.batchId === batchId);
          const b7   = (idx7[woid] || []).filter(r => r.batchId === batchId);
          const b8   = (idx8[woid] || []).filter(r => r.batchId === batchId);
          const b9   = (idx9[woid] || []).filter(r => r.batchId === batchId);

          const batchCpStatus = [
            cp1,          // CP1 is WO-level (same for all batches)
            computeCP2(woid, b2),
            cpLot,        // CPLot is WO-grain (same for all batches)
            cp3,          // CP3 is WO-level (item list is same for all batches)
            computeCP4(woid, b4),
            computeCP5(woid, b5),
            computeCP6(woid, b6),
            computeCP_WOCExists(woid, b7),
            computeCP7(woid, b7),
            computeCP8(woid, b8),
            computeCP9(woid, b9),
          ];
          return { batchId, batchNumber: batchNum, batchCpStatus };
        });

        return {
          woid,
          woNumber:        wo.woNumber,
          itemCode:        wo.itemCode        || '',
          itemDisplayName: wo.itemDisplayName || '',
          itemName:        wo.itemName,
          qty:             wo.qty,
          qtyUnit:         wo.qtyUnit,
          woDate:          wo.woDate,
          locationId:      wo.locationId,
          locationName:    wo.locationName,
          lineName:        wo.lineName        || '',
          cpStatus: [cp1, cp2, cpLot, cp3, cp4, cp5, cp6, cpWOC, cp7, cp8, cp9],
          batches, // [{batchId, batchNumber, batchCpStatus[9]}]
        };
      });
    }

    /**
     * Index CP3 item rows by woid → Set<itemName>.
     * Used for WO-grain CP3 computation: each WO maps to a flat set of item names.
     * @param {Array} arr — [{woid, itemId, itemName}]
     * @returns {Object} woid → Set<itemName>
     */
    function indexByWoidItems(arr) {
      const map = {};
      (arr || []).forEach(item => {
        const w = item.woid;
        if (!map[w]) map[w] = new Set();
        map[w].add(item.itemName);
      });
      return map;
    }

    /**
     * Index component items by woid → batchId → taskId → Set<itemName>
     * Kept for potential future use; not currently called by CP3.
     */
    function indexByWoidBatchTask(arr) {
      const map = {};
      (arr || []).forEach(item => {
        const w = item.woid, b = item.batchId, t = item.taskId;
        if (!map[w]) map[w] = {};
        if (!map[w][b]) map[w][b] = {};
        if (!map[w][b][t]) map[w][b][t] = new Set();
        map[w][b][t].add(item.itemName);
      });
      return map;
    }

    /**
     * Converts a taskId→Set map (from indexByWoidBatchTask[woid][batchId])
     * into the same shape as indexByWoidTask[woid] so computeCP3 can reuse it.
     */
    function filterByBatchTask(taskMap) {
      // taskMap is { taskId: Set<itemName> } — same shape as indexByWoidTask[woid]
      return taskMap || {};
    }

    // ── CP compute helpers ────────────────────────────────────────

    /** CP1: Approval — check display name (BUILTIN.DF) rather than raw list ID
     *  "approved" / "อนุมัติ" in name → ok, else → wait */
    function computeCP1(wo) {
      const name = String(wo.approvalStatusName || '').toLowerCase();
      const approved = name.indexOf('approv') !== -1
        || name.indexOf('อนุมัติ') !== -1;
      if (approved) {
        return { status: 'ok', note: { th: '', en: '' } };
      }
      return {
        status: 'wait',
        note: {
          th: 'รอการอนุมัติใบสั่งผลิต',
          en: 'Work order pending approval',
        },
      };
    }

    /** CP2: Release
     *  All batches released → ok; any unreleased → wait
     *  rows = [{woid, batchId, batchName, released}] (batch-grain rows from Queries.js) */
    function computeCP2(woid, rows) {
      if (!rows.length) {
        return { status: 'wait', note: { th: 'ยังไม่มี Batch', en: 'No batches found' } };
      }
      const unreleased = rows.filter(r => r.released !== 'T').length;
      if (unreleased <= 0) {
        return { status: 'ok', note: { th: '', en: '' } };
      }
      return {
        status: 'wait',
        note: {
          th: `ยังไม่ปล่อยผลิต ${unreleased} Batch`,
          en: `${unreleased} batch(es) not yet released`,
        },
      };
    }

    /** CP3: BOM feed
     *  All BOM items fed → ok; any missing → wait
     *  bomItems = Set<itemName>, fedItems = Set<itemName> (WO-grain, from indexByWoidItems) */
    function computeCP3(woid, bomItems, fedItems) {
      if (bomItems.size === 0) {
        return { status: 'ok', note: { th: '', en: '' } };
      }

      const missing = [...bomItems].filter(name => !fedItems.has(name));
      if (missing.length === 0) {
        return { status: 'ok', note: { th: '', en: '' } };
      }

      const itemList = missing.slice(0, 5).join(', ') + (missing.length > 5 ? ` (+${missing.length - 5})` : '');
      return {
        status: 'wait',
        note: {
          th: `ยังไม่ได้ป้อนวัตถุดิบ: ${itemList}`,
          en: `Missing materials: ${itemList}`,
        },
      };
    }

    /** CP4: Machine
     *  No WOC → na; WOC + no mismatch → ok; mismatch → err */
    function computeCP4(woid, rows) {
      if (!rows.length) return { status: 'na', note: { th: '', en: '' } };
      const hasAnyWOC = rows.some(r => r.hasWOC === 'T');
      if (!hasAnyWOC) return { status: 'na', note: { th: '', en: '' } };

      const mismatches = rows.filter(r => r.hasWOC === 'T' && r.mismatch === 'T');
      if (mismatches.length === 0) {
        return { status: 'ok', note: { th: '', en: '' } };
      }
      const first = mismatches[0];
      return {
        status: 'err',
        note: {
          // Labels.getCheckpointNote(3, 'err', first, lang) — injected via Labels module
          th: `เวลาเครื่องจักรไม่ตรงกัน (${first.taskNumber || ''})`,
          en: `Machine time mismatch (${first.taskNumber || ''})`,
        },
      };
    }

    /** CP5: Labor (Pre-WOC Labor existence)
     *  rows = [{woid, batchId, taskId, hasLabor}]
     *  ok = all tasks have prewoc_labor; wait = some tasks missing */
    function computeCP5(woid, rows) {
      if (!rows.length) return { status: 'na', note: { th: '', en: '' } };
      const missing = rows.filter(r => r.hasLabor !== 'T');
      if (missing.length === 0) return { status: 'ok', note: { th: '', en: '' } };
      return {
        status: 'wait',
        note: {
          th: `ยังไม่บันทึกแรงงาน ${missing.length} งาน`,
          en: `Labor not yet recorded for ${missing.length} task(s)`,
        },
      };
    }

    /** CP6: Time
     *  No WOC → na; totalMin == computedMin → ok; mismatch → err
     *  rows = [{woid, batchId, taskId, wocId, hasWOC, startDt, endDt, totalMin}]
     *  computedMin = (new Date(endDt) - new Date(startDt)) / 60000 — computed here. */
    function computeCP6(woid, rows) {
      if (!rows.length) return { status: 'na', note: { th: '', en: '' } };
      const hasAnyWOC = rows.some(r => r.hasWOC === 'T');
      if (!hasAnyWOC) return { status: 'na', note: { th: '', en: '' } };

      const mismatches = rows.filter(r => {
        if (r.hasWOC !== 'T') return false;
        if (!r.startDt || !r.endDt || r.totalMin <= 0) return false;
        const tStart = new Date(r.startDt).getTime();
        const tEnd   = new Date(r.endDt).getTime();
        if (isNaN(tStart) || isNaN(tEnd) || tEnd <= tStart) return false;
        const computedMin = (tEnd - tStart) / 60000;
        return Math.abs(r.totalMin - computedMin) > 0.5; // 30-second tolerance
      });

      if (mismatches.length === 0) {
        return { status: 'ok', note: { th: '', en: '' } };
      }
      const first = mismatches[0];
      const tStart = new Date(first.startDt).getTime();
      const tEnd   = new Date(first.endDt).getTime();
      const computedMin = Math.round((tEnd - tStart) / 60000);
      return {
        status: 'err',
        note: {
          th: `เวลารวมที่บันทึก ${first.totalMin} นาที ≠ ช่วงเริ่ม–จบ ${computedMin} นาที`,
          en: `Recorded ${first.totalMin} min ≠ start–end span ${computedMin} min`,
        },
      };
    }

    /** CP7: WOC (Work Order Completion)
     *  No WOC → na
     *  WOC + l1QtyComplete >= l2ProQty AND l2ProQty == l3TargetQty → ok
     *  l1 < l2 → wait
     *  l2 != l3 → err */
    function computeCP7(woid, rows) {
      if (!rows.length) return { status: 'na', note: { th: '', en: '' } };
      const hasAnyWOC = rows.some(r => r.hasWOC === 'T');
      if (!hasAnyWOC) return { status: 'na', note: { th: '', en: '' } };

      const wocRows = rows.filter(r => r.hasWOC === 'T');

      // L3 check: l2ProQty matches l3TargetQty (across all completions, sum)
      const totalL2 = wocRows.reduce((s, r) => s + (parseFloat(r.l2ProQty) || 0), 0);
      const targetQty = wocRows[0] ? (parseFloat(wocRows[0].l3TargetQty) || 0) : 0;
      if (totalL2 > 0 && targetQty > 0 && Math.abs(totalL2 - targetQty) > 0.001) {
        return {
          status: 'err',
          note: {
            th: `ปริมาณที่ผลิต ${totalL2} ≠ เป้าหมาย ${targetQty}`,
            en: `Produced qty ${totalL2} ≠ target ${targetQty}`,
          },
        };
      }

      // L1 check: totalComplete >= totalPro
      const totalL1 = wocRows.reduce((s, r) => s + (parseFloat(r.l1QtyComplete) || 0), 0);
      if (totalL1 < totalL2 - 0.001) {
        return {
          status: 'wait',
          note: {
            th: `จำนวนปิดงาน ${totalL1} น้อยกว่าที่ผลิต ${totalL2}`,
            en: `Completed qty ${totalL1} < produced qty ${totalL2}`,
          },
        };
      }

      return { status: 'ok', note: { th: '', en: '' } };
    }

    /** CPLot: Gen Lot & Pallet (WO-grain)
     *  Gate = released. Not released → na; lpTotal > 0 and meets target → ok; else → wait */
    function computeCP_LotPallet(lpTotal, backOrderQty, isReleased) {
      if (!isReleased) return { status: 'na', note: { th: '', en: '' } };
      if (lpTotal > 0) {
        if (!backOrderQty || backOrderQty <= 0 || lpTotal >= backOrderQty - 0.001) {
          return { status: 'ok', note: { th: '', en: '' } };
        }
        return {
          status: 'wait',
          note: {
            th: `Gen Lot&Pallet ${lpTotal} จาก ${backOrderQty}`,
            en: `Lot & Pallet ${lpTotal} of ${backOrderQty} generated`,
          },
        };
      }
      return { status: 'wait', note: { th: 'ยังไม่ Gen Lot & Pallet', en: 'Lot & Pallet not yet generated' } };
    }

    /** CPWOCExists: WOC existence check — has any WOC been recorded for this WO?
     *  No rows → na; any WOC exists → ok; no WOC → wait */
    function computeCP_WOCExists(woid, rows) {
      if (!rows.length) return { status: 'na', note: { th: '', en: '' } };
      const hasAnyWOC = rows.some(r => r.hasWOC === 'T');
      if (hasAnyWOC) return { status: 'ok', note: { th: '', en: '' } };
      return {
        status: 'wait',
        note: {
          th: 'ยังไม่มีการบันทึกปิดงานผลิต (WOC)',
          en: 'No WO completion record yet',
        },
      };
    }

    /** CP8: Cost generation
     *  No WOC → na; WOC + hasCostAlloc → ok; WOC but no cost → err */
    function computeCP8(woid, rows) {
      if (!rows.length) return { status: 'na', note: { th: '', en: '' } };
      const hasAnyWOC = rows.some(r => r.hasWOC === 'T');
      if (!hasAnyWOC) return { status: 'na', note: { th: '', en: '' } };

      const wocRows = rows.filter(r => r.hasWOC === 'T');
      const noCost  = wocRows.filter(r => r.hasCostAlloc !== 'T');
      if (noCost.length === 0) {
        return { status: 'ok', note: { th: '', en: '' } };
      }
      return {
        status: 'err',
        note: {
          th: 'ยังไม่มีต้นทุนผูกกับงานผลิตนี้',
          en: 'No cost record linked to this work order',
        },
      };
    }

    /** CP9: Standard Cost Setup (master data check)
     *  rows = [{woid, taskId, batchId, hasCostRef, hasOhRate}]
     *  ok   = all tasks have cost ref OR OH rate
     *  err  = any task has neither
     *  na   = no task rows (no tasks on this WO/batch) */
    function computeCP9(woid, rows) {
      if (!rows.length) return { status: 'na', note: { th: '', en: '' } };
      const missing = rows.filter(r => r.hasCostRef !== 'T' && r.hasOhRate !== 'T');
      if (missing.length === 0) {
        return { status: 'ok', note: { th: '', en: '' } };
      }
      return {
        status: 'err',
        note: {
          th: `ไม่พบ Cost Setup ${missing.length} งาน (ต้องตั้ง Cost Ref หรือ OH Rate)`,
          en: `Cost setup missing for ${missing.length} operation(s) — set up Cost Ref or OH Rate`,
        },
      };
    }

    // ── Helper: WO-level rollup (worst CP status for pills/note) ────
    /** Returns 'ok'|'wait'|'err'|'na' — worst status across CPs (for note/pill rollup).
     *  na stays rank 0 so it doesn't pollute the pill colour. */
    function woOverallStatus(cpStatusArr) {
      let worst = 0;
      cpStatusArr.forEach(cp => {
        worst = Math.max(worst, STATUS_RANK[cp.status] || 0);
      });
      return STATUS_INV[worst];
    }

    // ── Helper: WO KPI bucket ─────────────────────────────────────
    /**
     * KPI bucketing rule (separate from pill rollup):
     *   err  → if any cp is 'err'
     *   ok   → if ALL 8 checkpoints are 'ok' (no na, no wait, no err)
     *   wait → everything else (any 'wait' or any 'na' = in progress)
     *
     * This matches the mockup: a WO with trailing 'na' (not reached yet)
     * is in-progress, not complete.
     */
    function woKpiBucket(cpStatusArr) {
      if (cpStatusArr.some(cp => cp.status === 'err'))  return 'err';
      if (cpStatusArr.every(cp => cp.status === 'ok'))  return 'ok';
      return 'wait';
    }

    /** Per-checkpoint rollup across batches (for WO row rollup pill) */
    function cpRollupAcrossBatches(batches, cpIndex) {
      if (!batches || batches.length === 0) return { st: 'na', badge: null };
      let worst = 0;
      batches.forEach(b => {
        const s = (b.batchCpStatus && b.batchCpStatus[cpIndex]) ? b.batchCpStatus[cpIndex].status : 'na';
        worst = Math.max(worst, STATUS_RANK[s] || 0);
      });
      const st = STATUS_INV[worst];
      let badge = null;
      if (batches.length > 1 && (st === 'err' || st === 'wait')) {
        badge = batches.filter(b => {
          const s = (b.batchCpStatus && b.batchCpStatus[cpIndex]) ? b.batchCpStatus[cpIndex].status : 'na';
          return STATUS_RANK[s] === worst;
        }).length;
      }
      return { st, badge };
    }



    // ══════════════════════════════════════════════════════════════
    // HTML Builders
    // ══════════════════════════════════════════════════════════════

    function buildLegendHtml(lang) {
      const t = getI18nLabels(lang);
      return `
<div class="legend" id="legend">
  <span><span class="legend-icon" style="color:var(--ok)">✓</span> ${escapeHtml(t.legend[0])}</span>
  <span><span class="legend-icon" style="color:var(--wait)">◷</span> ${escapeHtml(t.legend[1])}</span>
  <span><span class="legend-icon" style="color:var(--err)">✕</span> ${escapeHtml(t.legend[2])}</span>
  <span><span class="legend-icon" style="color:var(--na)">–</span> ${escapeHtml(t.legend[3])}</span>
  <span style="margin-left:auto">${escapeHtml(t.rollup)}</span>
</div>`;
    }

    function buildKpiHtml(total, ok, wait, err, lang) {
      const t = getI18nLabels(lang);
      return `
<div class="kpis">
  <div class="kpi">
    <div class="n">${total}</div>
    <div class="l" data-i18n="kTotal">${t.kTotal}</div>
  </div>
  <div class="kpi ok">
    <div class="n">${ok}</div>
    <div class="l" data-i18n="kOk">${t.kOk}</div>
  </div>
  <div class="kpi wait">
    <div class="n">${wait}</div>
    <div class="l" data-i18n="kWait">${t.kWait}</div>
  </div>
  <div class="kpi err">
    <div class="n">${err}</div>
    <div class="l" data-i18n="kErr">${t.kErr}</div>
  </div>
</div>`;
    }

    function buildGridHtml(pageRows, lang) {
      const t = getI18nLabels(lang);
      const S = { ok: '✓', wait: '◷', err: '✕', na: '–' };

      // Table header
      const cpHeaders = t.cols.map((c, i) =>
        `<th class="cp" data-tip="${escapeAttr(c.tip)}">${escapeHtml(c.h)}</th>`
      ).join('');

      const thead = `<thead><tr>
  <th style="min-width:230px">${escapeHtml(t.cWO)}</th>
  <th style="min-width:150px">${escapeHtml(t.cLoc)}</th>
  <th>${escapeHtml(t.cLine)}</th>
  ${cpHeaders}
  <th style="width:50px;text-align:center" data-tip="${escapeAttr(t.cNote)}">${escapeHtml(lang === 'en' ? 'Note' : 'หมายเหตุ')}</th>
</tr></thead>`;

      // Table body — WO rows only (batches loaded lazily via drilldown)
      let tbodyHtml = '';
      if (pageRows.length === 0) {
        const noResultsMsg = lang === 'en'
          ? 'No work orders found for the selected filters.'
          : 'ไม่พบใบสั่งผลิตตามเงื่อนไขที่เลือก';
        tbodyHtml = `<tr><td colspan="15" style="text-align:center;padding:24px;color:var(--muted);font-style:italic">${escapeHtml(noResultsMsg)}</td></tr>`;
      }
      pageRows.forEach(wo => {
        // Build per-CP pill for WO row using batch rollup (shows badge counts)
        const pillCells = wo.cpStatus.map((cp, i) => {
          let st, badgeHtml;
          if (wo.batches && wo.batches.length > 1 && wo.batches[0].batchCpStatus) {
            // Multiple batches: rollup across them, show superscript count if problem
            const rollup = cpRollupAcrossBatches(wo.batches, i);
            st = rollup.st;
            badgeHtml = rollup.badge
              ? `<sup style="font-size:9px;font-weight:700;margin-left:1px">${rollup.badge}</sup>`
              : '';
          } else {
            st = cp.status;
            badgeHtml = '';
          }
          return `<td class="cp" data-tip="${escapeAttr(t.cols[i].tip)}">
  <span class="pill ${st}">${S[st]}${badgeHtml}</span>
</td>`;
        }).join('');

        // Note cell: worst-status note as tooltip icon
        const noteInfo = pickWorstNote(wo.cpStatus, lang);
        const noteHtml = noteInfo.note
          ? `<span class="note-icon ${noteInfo.status}" data-tip="${escapeAttr(noteInfo.note)}">${noteInfo.status === 'err' ? '⚠' : '◷'}</span>`
          : '';

        const qtyDisplay = `${formatNumber(wo.qty)} ${escapeHtml(wo.qtyUnit || '')}`.trim();

        tbodyHtml += `<tr class="wo" data-woid="${escapeAttr(String(wo.woid))}" data-lang="${lang}">
  <td>
    <span class="twist">▶</span>
    <strong>${escapeHtml(wo.woNumber || '')}</strong>
    <span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${escapeHtml(fmtDate(wo.woDate))}</span>
    <div style="padding-left:18px;margin-top:2px">
      <span style="font-weight:600">${escapeHtml(wo.itemCode || '')}</span>
      <span style="color:var(--muted);font-weight:400"> · ${escapeHtml(wo.itemDisplayName || wo.itemName || '')}</span>
    </div>
    <div style="color:var(--muted);font-weight:400;font-size:11px;padding-left:18px">
      ${escapeHtml(lang === 'en' ? 'Qty' : 'จำนวน')}: ${qtyDisplay}
    </div>
  </td>
  <td>${escapeHtml(wo.locationName || '')}</td>
  <td>${escapeHtml(wo.lineName || '')}</td>
  ${pillCells}
  <td style="text-align:center">${noteHtml}</td>
</tr>
<tr class="drilldown-placeholder hidden" data-woid="${escapeAttr(String(wo.woid))}"></tr>`;
      });

      return `<div class="wrap"><div class="tscroll">
<table>
${thead}
<tbody id="rows">${tbodyHtml}</tbody>
</table>
</div></div>`;
    }

    function buildPaginationHtml({ page, totalPages, subsidiaryId, locationId, dateFrom, dateTo, lang, woNumber, batchNumber, osNumber, embed }) {
      if (totalPages <= 1) return '';

      const makeLink = (p, label, active) => {
        const qs = buildQueryString({ action: 'search', subsidiaryId, locationId, dateFrom, dateTo, lang, page: p, woNumber, batchNumber, osNumber, embed: embed ? '1' : '' });
        return active
          ? `<span class="pgcur">${label}</span>`
          : `<a href="?${qs}" class="pglink">${label}</a>`;
      };

      let links = '';
      if (page > 1) links += makeLink(page - 1, '← ก่อน / Prev', false);

      // Show window of pages
      const winStart = Math.max(1, page - 3);
      const winEnd   = Math.min(totalPages, page + 3);
      if (winStart > 1) links += makeLink(1, '1', false) + '<span class="pgellipsis">…</span>';
      for (let p = winStart; p <= winEnd; p++) {
        links += makeLink(p, String(p), p === page);
      }
      if (winEnd < totalPages) links += '<span class="pgellipsis">…</span>' + makeLink(totalPages, String(totalPages), false);
      if (page < totalPages) links += makeLink(page + 1, 'ถัด / Next →', false);

      return `<div class="pagination">${links}</div>`;
    }

    // ══════════════════════════════════════════════════════════════
    // Full page shell — HTML, CSS, inline JS
    // ══════════════════════════════════════════════════════════════
    function buildPageShell({
      lang, subRows, locRows,
      selectedSub, selectedLoc, selectedFrom, selectedTo,
      kpiHtml, gridHtml, paginationHtml,
      page, totalPages, totalWO,
      scriptId, deployId,
      embed, woNumber, batchNumber, osNumber,
    }) {
      const t = getI18nLabels(lang);

      // Subsidiary options
      const subOptions = subRows.map(r =>
        `<option value="${escapeAttr(String(r.id))}" ${String(r.id) === String(selectedSub) ? 'selected' : ''}>
          ${escapeHtml(r.name)}
        </option>`
      ).join('');

      // Location options
      const locOptions = locRows.map(r =>
        `<option value="${escapeAttr(String(r.id))}" ${String(r.id) === String(selectedLoc) ? 'selected' : ''}>
          ${escapeHtml(r.name)}
        </option>`
      ).join('');

      const legendHtml = buildLegendHtml(lang);

      // Inline i18n for client-side lang toggle (chrome only; notes re-render server-side)
      const i18nJson = JSON.stringify(getI18nForClient());

      return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(t.title)}</title>
${theme.css(REPORT_CSS)}
</head>
<body>

${embed ? '' : theme.topbar({
  crumbs: ['Foodstar', 'รายงานการผลิต'],
  title: `<span data-i18n="title">${escapeHtml(t.title)}</span>`,
  badge: 'WO Status',
  right: `<div class="langtog">
    <button id="lang-th" class="${lang === 'th' ? 'on' : ''}" onclick="setLang('th')">ไทย</button>
    <button id="lang-en" class="${lang === 'en' ? 'on' : ''}" onclick="setLang('en')">ENG</button>
  </div>`
}) + `<div class="record-count">
  <b data-i18n="tag">${escapeHtml(t.tag)}</b> · <span data-i18n="sub">${escapeHtml(t.sub)}</span>
</div>`}

<form id="filterForm" method="GET" action="">
  <input type="hidden" name="script" value="${escapeHtml(scriptId || '')}" />
  <input type="hidden" name="deploy" value="${escapeHtml(deployId || '')}" />
  <input type="hidden" name="action" value="search" />
  <input type="hidden" name="lang" id="hidLang" value="${lang}" />
  ${embed ? `<input type="hidden" name="embed" value="1" />` : ''}
  <input type="hidden" id="hidWoNumber"    name="woNumber"    value="${escapeHtml(woNumber)}" />
  <input type="hidden" id="hidBatchNumber" name="batchNumber" value="${escapeHtml(batchNumber)}" />
  <input type="hidden" id="hidOsNumber"    name="osNumber"    value="${escapeHtml(osNumber)}" />
  <div class="filterbar">
    <div class="fld" style="flex:1 1 200px;min-width:180px;">
      <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;">WO / Batch / Order Sheet</label>
      <input type="text" id="entityFilter"
             value="${escapeAttr(woNumber || batchNumber || osNumber)}"
             placeholder="WOFSC... / WOFSC-B... / OS-..."
             style="background:var(--panel);border:1px solid var(--accent);color:var(--txt);padding:7px 9px;border-radius:6px;font-size:13px;width:100%;"
             autocomplete="off" spellcheck="false" />
    </div>
    <div class="fld">
      <label data-i18n="fSub">${escapeHtml(t.fSub)}</label>
      <select name="subsidiaryId">
        <option value="" data-i18n-placeholder="allSub">${escapeHtml(t.allSub)}</option>
        ${subOptions}
      </select>
    </div>
    <div class="fld">
      <label data-i18n="fLoc">${escapeHtml(t.fLoc)}</label>
      <select name="locationId">
        <option value="" data-i18n-placeholder="allLoc">${escapeHtml(t.allLoc)}</option>
        ${locOptions}
      </select>
    </div>
    <div class="fld" id="date-fld-from">
      <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;" data-i18n="fFrom">${escapeHtml(t.fFrom)} <span id="date-opt-hint" style="color:var(--pj-text-muted);font-weight:400;text-transform:none;font-size:10px;">(ถ้าไม่ระบุ WO/Batch)</span></label>
      <input type="text" name="dateFrom" id="dateFrom" class="dateinput"
             value="${escapeAttr(fmtDate(selectedFrom))}"
             placeholder="dd/mm/yyyy" inputmode="numeric" maxlength="10"
             autocomplete="off" spellcheck="false" />
    </div>
    <div class="fld" id="date-fld-to">
      <label data-i18n="fTo">${escapeHtml(t.fTo)}</label>
      <input type="text" name="dateTo" id="dateTo" class="dateinput"
             value="${escapeAttr(fmtDate(selectedTo))}"
             placeholder="dd/mm/yyyy" inputmode="numeric" maxlength="10"
             autocomplete="off" spellcheck="false" />
    </div>
    <button type="button" id="btnSearch" data-i18n="go">${escapeHtml(t.go)}</button>
  </div>
</form>

<div id="results-zone">
${kpiHtml}
${gridHtml}
${paginationHtml}
${gridHtml ? legendHtml : ''}
</div>

<div id="tip"></div>

<script>
// ── i18n data (both languages, chrome strings only) ──────────────
const I18N = ${i18nJson};
const STATUS_ICONS = {ok:'✓',wait:'◷',err:'✕',na:'–'};
let LANG = ${JSON.stringify(lang)};

// ── Language toggle ───────────────────────────────────────────────
// Toggling language does a full page reload (GET) so server re-renders
// notes, location names, etc. in the correct language.
// Chrome strings (labels, tooltips) are also swapped in JS for instant feel,
// but the form submits with the new lang param for a proper re-render.
function setLang(l) {
  if (l === LANG) return;
  LANG = l;
  document.getElementById('hidLang').value = l;

  // Update active button
  document.getElementById('lang-th').classList.toggle('on', l === 'th');
  document.getElementById('lang-en').classList.toggle('on', l === 'en');

  // If results are showing, reload with new lang preserving all params
  const form = document.getElementById('filterForm');
  if (document.getElementById('rows') && document.getElementById('rows').children.length > 0) {
    form.submit();
  } else {
    // Just reload for filter form — update URL
    const params = new URLSearchParams(window.location.search);
    params.set('lang', l);
    if (!params.get('action')) {
      // Plain filter page — navigate with updated lang
      window.location.search = params.toString();
    } else {
      form.submit();
    }
  }
}

// ── Entity filter: resolve type from visible text input ────────────
function _resolveEntityFilter() {
  var entityEl = document.getElementById('entityFilter');
  var raw = entityEl ? entityEl.value.trim().toUpperCase() : '';
  var woNum = '', batchNum = '', osNum = '';
  if (raw) {
    if (/-B\d+$/i.test(raw)) {
      batchNum = raw;           // e.g. WOFSC00000092-B0001
    } else if (/^O[^W]/i.test(raw)) {
      osNum = raw;              // e.g. OS-001
    } else {
      woNum = raw;              // e.g. WOFSC00000123
    }
  }
  // Sync back to hidden inputs so buildFragmentUrl picks them up
  var hidWo    = document.getElementById('hidWoNumber');
  var hidBatch = document.getElementById('hidBatchNumber');
  var hidOs    = document.getElementById('hidOsNumber');
  if (hidWo)    hidWo.value    = woNum;
  if (hidBatch) hidBatch.value = batchNum;
  if (hidOs)    hidOs.value    = osNum;
  return { woNumber: woNum, batchNumber: batchNum, osNumber: osNum };
}

// ── วันที่ในช่องกรองเป็น dd/mm/yyyy · URL กับ SQL เป็น ISO ────────────
// ตัวแปลงตัวเดียวที่ทุกทางต้องผ่าน (ปุ่มค้นหา · Enter · ตรวจช่วงวัน)
// ตรรกะเดียวกับ parseFilterDate ฝั่งเซิร์ฟเวอร์ — แก้ที่ไหนต้องแก้อีกที่ด้วย
function _isoFromDateInput(el) {
  var raw = (el && el.value ? el.value : '').trim();
  if (!raw) return '';
  var mt = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  var y, m, d;
  if (mt) {
    d = +mt[1]; m = +mt[2]; y = +mt[3];
  } else {
    mt = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!mt) return null;                      // null = อ่านไม่ออก (ต่างจาก '' = ว่าง)
    y = +mt[1]; m = +mt[2]; d = +mt[3];
  }
  var dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}

// ── Search button — validate then AJAX fetch (no form submit / no reload) ─
document.getElementById('btnSearch').addEventListener('click', function() {
  try {
    var entity = _resolveEntityFilter();
    var woNum = entity.woNumber, batchNum = entity.batchNumber, osNum = entity.osNumber;
    var from = _isoFromDateInput(document.getElementById('dateFrom'));
    var to   = _isoFromDateInput(document.getElementById('dateTo'));
    var t    = I18N[LANG] || {};
    var hasEntity = !!(woNum || batchNum || osNum);
    if (!hasEntity) {
      if (from === null || to === null) {
        alert(t.errDateFormat || 'รูปแบบวันที่ไม่ถูกต้อง — ต้องเป็น dd/mm/yyyy');
        return;
      }
      if (!from || !to) { alert(t.errDateRequired || 'กรุณาเลือกวันที่'); return; }
      var d1 = new Date(from), d2 = new Date(to);
      if (d2 < d1) { alert(t.errDateOrder || '"ถึง" ต้องมาหลัง "ตั้งแต่"'); return; }
      if ((d2 - d1) / 86400000 > 7) { alert(t.errDateRange || 'ช่วงไม่เกิน 7 วัน'); return; }
    }
    fetchResults({
      lang:         (document.getElementById('hidLang') || {}).value || 'th',
      subsidiaryId: (document.querySelector('[name=subsidiaryId]') || {}).value || '',
      locationId:   (document.querySelector('[name=locationId]')   || {}).value || '',
      dateFrom:     from,
      dateTo:       to,
      page:         1,
      woNumber:    woNum,
      batchNumber: batchNum,
      osNumber:    osNum,
    });
  } catch(e) { console.error('search error', e); }
});

// ── Entity filter: toggle date-field opacity + Enter key ─────────
(function() {
  var ef = document.getElementById('entityFilter');
  if (!ef) return;

  function _updateDateHint() {
    var hasEntity = ef.value.trim().length > 0;
    var fFrom = document.getElementById('date-fld-from');
    var fTo   = document.getElementById('date-fld-to');
    var hint  = document.getElementById('date-opt-hint');
    if (fFrom) fFrom.style.opacity = hasEntity ? '0.45' : '1';
    if (fTo)   fTo.style.opacity   = hasEntity ? '0.45' : '1';
    if (hint)  hint.style.display  = hasEntity ? 'none' : '';
  }

  ef.addEventListener('input',   _updateDateHint);
  ef.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('btnSearch').click();
  });

  // ช่องวันที่เป็น text แล้ว — Enter จะ submit ฟอร์มดิบ ๆ พา dd/mm/yyyy ไปทาง URL
  // ดักให้ไปทางเดียวกับปุ่มค้นหา (เซิร์ฟเวอร์ยังรับสองรูปแบบไว้เป็นตาข่ายอีกชั้น)
  ['dateFrom', 'dateTo'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnSearch').click();
      }
    });
  });

  // Run once on load to reflect pre-filled value
  _updateDateHint();
})();

function buildFragmentUrl(p) {
  const cur = new URLSearchParams(window.location.search);
  const params = new URLSearchParams();
  if (cur.get('script')) params.set('script', cur.get('script'));
  if (cur.get('deploy')) params.set('deploy', cur.get('deploy'));
  params.set('action',      'search');
  params.set('fragment',    '1');
  params.set('lang',        p.lang        || 'th');
  params.set('subsidiaryId', p.subsidiaryId || '');
  params.set('locationId',   p.locationId   || '');
  params.set('dateFrom',     p.dateFrom     || '');
  params.set('dateTo',       p.dateTo       || '');
  params.set('page',         String(p.page  || 1));
  if (p.woNumber)    params.set('woNumber',    p.woNumber);
  if (p.batchNumber) params.set('batchNumber', p.batchNumber);
  if (p.osNumber)    params.set('osNumber',    p.osNumber);
  // Also carry entity filter from hidden inputs if caller didn't pass them explicitly
  if (!p.woNumber && !p.batchNumber && !p.osNumber) {
    var _hWo    = document.getElementById('hidWoNumber');
    var _hBatch = document.getElementById('hidBatchNumber');
    var _hOs    = document.getElementById('hidOsNumber');
    if (_hWo    && _hWo.value)    params.set('woNumber',    _hWo.value);
    if (_hBatch && _hBatch.value) params.set('batchNumber', _hBatch.value);
    if (_hOs    && _hOs.value)    params.set('osNumber',    _hOs.value);
  }
  if (cur.get('embed')) params.set('embed', cur.get('embed'));
  return window.location.pathname + '?' + params.toString();
}

function fixStickyHeader() {
  const ts = document.querySelector('.tscroll');
  if (!ts) return;
  const top = ts.getBoundingClientRect().top + window.scrollY;
  ts.style.maxHeight = Math.max(200, window.innerHeight - top - 10) + 'px';
  ts.style.overflowY = 'auto';
}

function fetchResults(p) {
  const zone = document.getElementById('results-zone');
  zone.innerHTML = '<p style="padding:24px;color:var(--pj-text-muted)">กำลังค้นหา… / Searching…</p>';
  fetch(buildFragmentUrl(p))
    .then(r => r.text())
    .then(html => {
      zone.innerHTML = html;
      if (typeof bindTips     === 'function') bindTips();
      if (typeof bindWoRows   === 'function') bindWoRows();
      bindPagination(p);
      fixStickyHeader();
    })
    .catch(err => {
      zone.innerHTML = '<p style="color:red;padding:24px">Error: ' + err.message + '</p>';
    });
}

function bindPagination(lastParams) {
  document.querySelectorAll('#results-zone a.pglink').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const href = new URLSearchParams(new URL(a.href).search);
      fetchResults(Object.assign({}, lastParams, { page: parseInt(href.get('page'), 10) || 1 }));
    });
  });
}

// ── Tooltip ───────────────────────────────────────────────────────
const tip = document.getElementById('tip');
function bindTips() {
  document.querySelectorAll('[data-tip]').forEach(el => {
    if (!el.dataset.tip) return;
    el.onmousemove = e => {
      tip.textContent = el.dataset.tip;
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top  = (e.clientY + 14) + 'px';
    };
    el.onmouseleave = () => { tip.style.display = 'none'; };
  });
}

// ── WO row expand / collapse (lazy drilldown) ─────────────────────
function bindWoRows() {
  document.querySelectorAll('tr.wo').forEach(row => {
    row.addEventListener('click', () => {
      const woid = row.dataset.woid;
      const isOpen = row.classList.contains('open');

      // Find the drilldown placeholder row
      const placeholder = document.querySelector('tr.drilldown-placeholder[data-woid="' + woid + '"]');
      if (!placeholder) return;

      if (isOpen) {
        // Collapse — remove injected rows, hide placeholder
        row.classList.remove('open');
        // Remove all drilldown rows for this woid
        document.querySelectorAll('tr.drilldown-row[data-woid="' + woid + '"]').forEach(r => r.remove());
        placeholder.classList.add('hidden');
      } else {
        // Expand — check if already loaded
        row.classList.add('open');
        const existing = document.querySelectorAll('tr.drilldown-row[data-woid="' + woid + '"]');
        if (existing.length > 0) {
          existing.forEach(r => r.classList.remove('hidden'));
          placeholder.classList.add('hidden');
          return;
        }
        // Show loading indicator
        placeholder.innerHTML = '<td colspan="15" style="padding:10px 34px;color:var(--muted);font-style:italic">กำลังโหลด… / Loading…</td>';
        placeholder.classList.remove('hidden');

        // Build drilldown URL from current page URL
        const baseUrl = window.location.pathname + window.location.search;
        const params = new URLSearchParams(window.location.search);
        params.set('action', 'drilldown');
        params.set('woid', woid);
        params.set('lang', LANG);
        const drillUrl = window.location.pathname + '?' + params.toString();

        fetch(drillUrl)
          .then(r => r.text())
          .then(html => {
            // Hide placeholder
            placeholder.classList.add('hidden');
            placeholder.innerHTML = '';
            // Inject rows after the WO row
            const tempDiv = document.createElement('tbody');
            tempDiv.innerHTML = html;
            const newRows = Array.from(tempDiv.querySelectorAll('tr'));
            newRows.forEach(nr => {
              nr.classList.add('drilldown-row');
              nr.dataset.woid = woid;
            });
            // Insert after placeholder
            let ref = placeholder;
            newRows.forEach(nr => {
              placeholder.parentNode.insertBefore(nr, ref.nextSibling);
              ref = nr;
            });
            bindTips();
          })
          .catch(err => {
            placeholder.innerHTML = '<td colspan="15" style="color:var(--pj-error);padding:10px 34px">Error: ' + err.message + '</td>';
            placeholder.classList.remove('hidden');
          });
      }
    });
  });
}

// ── Init ─────────────────────────────────────────────────────────
bindTips();
bindWoRows();
fixStickyHeader();
window.addEventListener('resize', fixStickyHeader);
</script>
</body>
</html>`;
    }

    // ══════════════════════════════════════════════════════════════
    // i18n data (used server-side and sent to client for chrome toggle)
    // ══════════════════════════════════════════════════════════════
    function getI18nLabels(lang) {
      const labels = {
        th: {
          title: 'ติดตามสถานะใบสั่งผลิต',
          tag:   '— Foodstar / TEIBTO',
          sub:   'ติดตามสถานะการผลิตทีละขั้น และตรวจความถูกต้องเบื้องต้น · ดูได้ถึงระดับ Batch และ Operation',
          fSub:  'บริษัท',
          allSub:'— ทุกบริษัท —',
          fLoc:  'สถานที่ผลิต',
          allLoc:'— ทุกสถานที่ —',
          fFrom: 'วันที่ผลิต — ตั้งแต่',
          fTo:   'ถึง',
          go:    'ค้นหา',
          kTotal:'ใบสั่งผลิต',
          kOk:   'ครบทุกขั้น',
          kWait: 'กำลังดำเนินการ',
          kErr:  'พบความผิดปกติ',
          cWO:   'ใบสั่งผลิต',
          cLoc:  'สถานที่ผลิต',
          cLine: 'ไลน์ผลิต',
          cNote: 'หมายเหตุ / ผิดปกติตรงไหน',
          cols: [
            { h: 'อนุมัติ',       tip: 'ใบสั่งผลิตได้รับการอนุมัติแล้วหรือยัง (ต้องอนุมัติก่อนจึงปล่อยผลิตได้)' },
            { h: 'ปล่อยผลิต',    tip: 'ปล่อย Batch เข้าสู่การผลิตแล้วหรือยัง' },
            { h: 'Gen L&P',      tip: 'สร้าง Lot & Pallet และพิมพ์ Pallet Tag ครบตามเป้าหมายหรือยัง (ทำหลัง release ก่อนเริ่มผลิต)' },
            { h: 'ป้อนวัตถุดิบ', tip: 'วัตถุดิบตามสูตร (BOM) ถูกป้อนครบทุกรายการหรือยัง (นับรายการ ไม่นับจำนวน)' },
            { h: 'เครื่องจักร',  tip: 'บันทึกเครื่องจักรครบ และเวลาเครื่องตรงกับรายละเอียดหรือยัง' },
            { h: 'แรงงาน',       tip: 'มีการบันทึกข้อมูลแรงงาน (Pre-WOC Labor) ครบทุก Operation แล้วหรือยัง' },
            { h: 'เวลา',         tip: 'เวลารวมที่บันทึกตรงกับช่วงเริ่ม–จบหรือยัง' },
            { h: 'WOC',          tip: 'มีการบันทึกปิดงานผลิต (Work Order Completion) ครบทุก Operation แล้วหรือยัง' },
            { h: 'ปิดงานผลิต',          tip: 'ปิดงานผลิตครบ และจำนวนที่ปิดตรงกับที่ผลิตจริงหรือยัง' },
            { h: 'สร้างต้นทุน',         tip: 'ระบบสร้างต้นทุนของงานผลิตแล้วหรือยัง' },
            { h: 'ตั้งค่าต้นทุนมาตรฐาน', tip: 'มีการตั้งค่า Cost Ref หรือ OH Rate ครอบคลุม item + work center ของงานนี้หรือยัง (เช็ค master data)' },
          ],
          legend: [
            'ครบ / ผ่าน',
            'รอ / ยังไม่ครบ (ปกติ — เฝ้าติดตาม)',
            'ผิดปกติ (ข้อมูลไม่ตรง — ต้องตรวจสอบ)',
            'ยังไม่ถึงขั้นนี้',
          ],
          rollup: 'สถานะ WO = สถานะแย่สุดของ Batch ข้างใน · ตัวเลขมุม = จำนวน Batch ที่มีปัญหา · คลิกแถวเพื่อขยาย',
          errDateRequired: 'กรุณาเลือกวันที่ทั้งคู่ / Please select both dates',
          errDateOrder:    '"ถึง" ต้องมาหลัง "ตั้งแต่" / "To" must be after "From"',
          errDateRange:    'กรุณาเลือกช่วงไม่เกิน 7 วัน / Date range must be ≤ 7 days',
          errDateFormat:   'รูปแบบวันที่ไม่ถูกต้อง — ต้องเป็น dd/mm/yyyy เช่น 08/09/2026 / Invalid date format',
        },
        en: {
          title: 'Work Order Status Tracking',
          tag:   '— Foodstar / TEIBTO',
          sub:   'Track production status step by step with basic data validation · drill down to Batch and Operation',
          fSub:  'Subsidiary',
          allSub:'— All subsidiaries —',
          fLoc:  'Location',
          allLoc:'— All locations —',
          fFrom: 'WO Date — From',
          fTo:   'To',
          go:    'Search',
          kTotal:'Work Orders',
          kOk:   'All steps complete',
          kWait: 'In progress',
          kErr:  'Issues found',
          cWO:   'Work Order',
          cLoc:  'Location',
          cLine: 'Line',
          cNote: 'Note / what is wrong',
          cols: [
            { h: 'Approve',       tip: 'Has the work order been approved? (must approve before release)' },
            { h: 'Release',       tip: 'Has the batch been released to production?' },
            { h: 'Gen L&P',       tip: 'Has the Lot & Pallet been generated and pallet tag printed? (done after release, before production)' },
            { h: 'Feed Mat.',     tip: 'Are all BOM materials fed? (checks item list, not quantity)' },
            { h: 'Machine',       tip: 'Machine recorded and machine time matches the detail?' },
            { h: 'Labor',         tip: 'Has pre-WOC labor been recorded for every operation?' },
            { h: 'Time',          tip: 'Recorded total time matches the start–end span?' },
            { h: 'WOC',           tip: 'Has a Work Order Completion record been created for every operation?' },
            { h: 'WO Completion',    tip: 'Is the work order completed and the completed qty matching actual production?' },
            { h: 'Cost Gen.',        tip: 'Has the system generated the production cost?' },
            { h: 'Std Cost Setup',   tip: 'Is the standard cost configured for this item + work center? (Cost Ref or OH Rate master data check)' },
          ],
          legend: [
            'Complete / passed',
            'Pending / incomplete (normal — monitor)',
            'Issue (data mismatch — investigate)',
            'Not reached yet',
          ],
          rollup: 'WO status = worst status among its batches · corner number = batches with an issue · click a row to expand',
          errDateRequired: 'Please select both dates / กรุณาเลือกวันที่ทั้งคู่',
          errDateOrder:    '"To" must be after "From" / "ถึง" ต้องมาหลัง "ตั้งแต่"',
          errDateRange:    'Date range must be ≤ 7 days / กรุณาเลือกช่วงไม่เกิน 7 วัน',
          errDateFormat:   'Invalid date format. Use dd/mm/yyyy — e.g. 08/09/2026 / รูปแบบวันที่ไม่ถูกต้อง',
        },
      };
      return labels[lang] || labels.th;
    }

    /** Returns both languages for client-side chrome toggle */
    function getI18nForClient() {
      return {
        th: getI18nLabels('th'),
        en: getI18nLabels('en'),
      };
    }

    // ══════════════════════════════════════════════════════════════
    // Utility helpers
    // ══════════════════════════════════════════════════════════════

    /** Index array by a key, optionally into arrays (multi-value) */
    function indexBy(arr, key, multi) {
      const map = {};
      (arr || []).forEach(item => {
        const k = item[key];
        if (multi) {
          if (!map[k]) map[k] = [];
          map[k].push(item);
        } else {
          map[k] = item;
        }
      });
      return map;
    }

    /** Index component items by woid → taskId → Set<itemName>.
     *  Kept for potential future use; not currently called (CP3 uses indexByWoidItems). */
    function indexByWoidTask(arr) {
      const map = {};
      (arr || []).forEach(item => {
        const w = item.woid;
        const t = item.taskId;
        if (!map[w]) map[w] = {};
        if (!map[w][t]) map[w][t] = new Set();
        map[w][t].add(item.itemName);
      });
      return map;
    }

    /** Pick worst-status note for the note column on a WO row */
    function pickWorstNote(cpStatusArr, lang) {
      let worst = 0;
      let worstNote = '';
      let worstStatus = 'ok';
      cpStatusArr.forEach(cp => {
        const rank = STATUS_RANK[cp.status] || 0;
        if (rank > worst) {
          worst = rank;
          worstStatus = cp.status;
          worstNote = (cp.note && cp.note[lang]) ? cp.note[lang] : '';
        }
      });
      return { status: worstStatus, note: worstNote };
    }

    /** HTML-escape for content */
    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    /** HTML-escape for attribute values */
    function escapeAttr(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    /** Format date object → YYYY-MM-DD (for SQL / date inputs) */
    function formatDate(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    }

    /** Format YYYY-MM-DD string → DD/MM/YYYY for display */
    function fmtDate(s) {
      if (!s) return '';
      const parts = String(s).split('-');
      if (parts.length !== 3) return s;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    /** อ่านวันที่จากตัวกรอง → 'YYYY-MM-DD' · คืน '' ถ้าไม่ใช่วันที่จริง
     *
     * ช่องกรองแสดง dd/mm/yyyy แต่**สายที่วิ่งต่อยังเป็น ISO ทั้งเส้น** —
     * URL ของ pagination/fragment, bookmark เดิม และชั้น query ที่ผูกกับ
     * `TO_DATE(?, 'YYYY-MM-DD')` (`WOStatusTracking_Queries.js:179-181`)
     * ฟังก์ชันนี้จึงเป็นด่านเดียวที่แปลง ห้ามให้ dd/mm/yyyy หลุดเลยจุดนี้ไป
     *
     * รับ dd/mm/yyyy (รวม - และ . เป็นตัวคั่น) และ yyyy-mm-dd เพื่อให้ลิงก์เก่าใช้ได้
     * คืน '' เมื่อวันที่ไม่มีจริง เช่น 31/02/2026 — ผู้เรียกเป็นคนตัดสินว่าจะเตือนอย่างไร
     */
    function parseFilterDate(s) {
      const raw = String(s || '').trim();
      if (!raw) return '';
      let y, m, d;
      let mt = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (mt) {
        y = +mt[1]; m = +mt[2]; d = +mt[3];
      } else {
        mt = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
        if (!mt) return '';
        d = +mt[1]; m = +mt[2]; y = +mt[3];
      }
      // ต้องเป็นวันที่ที่มีอยู่จริง — `new Date(2026, 1, 31)` เลื่อนตัวเองไปเป็น 3 มี.ค.
      // ถ้าไม่เทียบกลับ 31/02/2026 จะกลายเป็น 2026-03-03 แบบเงียบ ๆ
      const dt = new Date(y, m - 1, d);
      if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    /** Format number with thousands separator */
    function formatNumber(n) {
      const num = parseFloat(n);
      if (isNaN(num)) return String(n || '');
      return num.toLocaleString('en-US');
    }

    /** Build a URL query string from an object */
    function buildQueryString(params) {
      return Object.entries(params)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    }

    /**
     * Simple error page — กิน theme ด้วย เพราะหน้านี้คู่สะสมอยู่นอก renderForm
     * หน้า error ที่หน้าตาหลุดออกจากตระกูลทำให้คนสงสัยว่าหลุดมาหน้าของระบบอื่น
     */
    function buildErrorPage(msg) {
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Error</title>
${theme.css(REPORT_CSS)}</head>
<body>
${theme.topbar({ crumbs: ['Foodstar', 'รายงานการผลิต'], title: 'WO Status Tracking', badge: 'WO Status' })}
<div class="content"><div class="error-page">
<h2>เกิดข้อผิดพลาด</h2><pre>${escapeHtml(msg)}</pre>
</div></div>
</body></html>`;
    }

    // ══════════════════════════════════════════════════════════════
    return { onRequest };
  }
);
