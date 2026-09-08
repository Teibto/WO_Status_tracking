/**
 * WOStatusTracking_Labels.js
 * SuiteScript 2.1 module — bilingual UI strings + checkpoint note generator
 *
 * Exports:
 *   getLabels(lang)                                     → full UI string map
 *   getCheckpointNote(cpIndex, status, data, lang)      → business-language note string
 *
 * lang: 'th' | 'en'
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([], () => {

  // ─────────────────────────────────────────────────────────────
  // SECTION 1 — UI labels (bilingual)
  // ─────────────────────────────────────────────────────────────

  const LABELS = {
    th: {
      title:   'ติดตามสถานะใบสั่งผลิต',
      tag:     '— ระบบ NetSuite',
      sub:     'ติดตามสถานะการผลิตทีละขั้น และตรวจความถูกต้องเบื้องต้น · ดูได้ถึงระดับ Batch และ Operation',
      fSub:    'บริษัท',
      allSub:  '— ทุกบริษัท —',
      fLoc:    'สถานที่ผลิต',
      allLoc:  '— ทุกสถานที่ —',
      fFrom:   'วันที่ผลิต — ตั้งแต่',
      fTo:     'ถึง',
      go:      'ค้นหา',
      kTotal:  'ใบสั่งผลิต',
      kOk:     'ครบทุกขั้น',
      kWait:   'กำลังดำเนินการ',
      kErr:    'พบความผิดปกติ',
      cWO:     'ใบสั่งผลิต',
      cLoc:    'สถานที่ผลิต',
      cLine:   'ไลน์ผลิต',
      cNote:   'หมายเหตุ / ผิดปกติตรงไหน',
      cols: [
        { h: 'อนุมัติ',       tip: 'ใบสั่งผลิตได้รับการอนุมัติแล้วหรือยัง (ต้องอนุมัติก่อนจึงปล่อยผลิตได้)' },
        { h: 'ปล่อยผลิต',    tip: 'ปล่อย Batch เข้าสู่การผลิตแล้วหรือยัง' },
        { h: 'Gen L&P',      tip: 'สร้าง Lot & Pallet และพิมพ์ Pallet Tag ครบตามเป้าหมายหรือยัง (ทำหลัง release ก่อนเริ่มผลิต)' },
        { h: 'ป้อนวัตถุดิบ', tip: 'วัตถุดิบตามสูตร (BOM) ถูกป้อนครบทุกรายการหรือยัง (นับรายการ ไม่นับจำนวน)' },
        { h: 'เครื่องจักร',  tip: 'บันทึกเครื่องจักรครบ และเวลาเครื่องตรงกับรายละเอียดหรือยัง' },
        { h: 'แรงงาน',       tip: 'มีการบันทึกข้อมูลแรงงาน (Pre-WOC Labor) ครบทุก Operation แล้วหรือยัง' },
        { h: 'เวลา',          tip: 'เวลารวมที่บันทึกตรงกับช่วงเริ่ม–จบหรือยัง' },
        { h: 'WOC',           tip: 'มีการบันทึกปิดงานผลิต (Work Order Completion) ครบทุก Operation แล้วหรือยัง' },
        { h: 'ปิดงานผลิต',   tip: 'ปิดงานผลิตครบ และจำนวนที่ปิดตรงกับที่ผลิตจริงหรือยัง' },
        { h: 'สร้างต้นทุน',  tip: 'ระบบสร้างต้นทุนของงานผลิตแล้วหรือยัง' }
      ],
      legend: [
        'ครบ / ผ่าน',
        'รอ / ยังไม่ครบ (ปกติ — เฝ้าติดตาม)',
        'ผิดปกติ (ข้อมูลไม่ตรง — ต้องตรวจสอบ)',
        'ยังไม่ถึงขั้นนี้'
      ],
      rollup:       'สถานะ WO = สถานะแย่สุดของ Batch ข้างใน · ตัวเลขมุม = จำนวน Batch ที่มีปัญหา · คลิกแถวเพื่อขยาย',
      dateRangeErr: 'กรุณาเลือกช่วงวันที่ไม่เกิน 7 วัน',
      noResults:    'ไม่พบข้อมูลในช่วงเวลาที่เลือก',
      loading:      'กำลังโหลด...',
      expand:       'คลิกเพื่อดูรายละเอียด Batch'
    },

    en: {
      title:   'Work Order Status Tracking',
      tag:     '— NetSuite system',
      sub:     'Track production status step by step with basic data validation · drill down to Batch and Operation',
      fSub:    'Subsidiary',
      allSub:  '— All subsidiaries —',
      fLoc:    'Location',
      allLoc:  '— All locations —',
      fFrom:   'WO Date — From',
      fTo:     'To',
      go:      'Search',
      kTotal:  'Work Orders',
      kOk:     'All steps complete',
      kWait:   'In progress',
      kErr:    'Issues found',
      cWO:     'Work Order',
      cLoc:    'Location',
      cLine:   'Line',
      cNote:   'Note / what is wrong',
      cols: [
        { h: 'Approve',        tip: 'Has the work order been approved? (must approve before release)' },
        { h: 'Release',        tip: 'Has the batch been released to production?' },
        { h: 'Gen L&P',        tip: 'Has the Lot & Pallet been generated and pallet tag printed? (done after release, before production)' },
        { h: 'Feed Mat.',      tip: 'Are all BOM materials fed? (checks item list, not quantity)' },
        { h: 'Machine',        tip: 'Machine recorded and machine time matches the detail?' },
        { h: 'Labor',          tip: 'Has pre-WOC labor been recorded for every operation?' },
        { h: 'Time',           tip: 'Recorded total time matches the start–end span?' },
        { h: 'WOC',            tip: 'Has a Work Order Completion record been created for every operation?' },
        { h: 'WO Completion',  tip: 'Is the work order completed and the completed qty matching actual production?' },
        { h: 'Cost Gen.',      tip: 'Has the system generated the production cost?' }
      ],
      legend: [
        'Complete / passed',
        'Pending / incomplete (normal — monitor)',
        'Issue (data mismatch — investigate)',
        'Not reached yet'
      ],
      rollup:       'WO status = worst status among its batches · corner number = batches with an issue · click a row to expand',
      dateRangeErr: 'Please select a date range of 7 days or less',
      noResults:    'No data found for the selected period',
      loading:      'Loading...',
      expand:       'Click to view Batch details'
    }
  };

  /**
   * Returns the full UI label map for the given language.
   * @param {string} lang  'th' | 'en'  (defaults to 'th')
   * @returns {Object}
   */
  function getLabels(lang) {
    return LABELS[lang] || LABELS.th;
  }

  // ─────────────────────────────────────────────────────────────
  // SECTION 2 — Checkpoint note generator
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns a business-language explanation for why a checkpoint
   * has a given status. Never exposes raw field/record names.
   *
   * @param {number} cpIndex   0-based checkpoint index (0–7)
   * @param {string} status    'ok' | 'wait' | 'err' | 'na'
   * @param {Object} data      Context data object (shape varies per checkpoint — see below)
   * @param {string} lang      'th' | 'en'
   * @returns {string}
   *
   * ─── data shapes by cpIndex ─────────────────────────────────
   * CP0 (Approve)   — no extra data needed
   * CP1 (Release)   — no extra data needed
   * CP2 (Feed Mat)  — { missingItems: string[], missingCount: number }
   * CP3 (Machine)   — { errType: 'noTime'|'timeMismatch'|'downtimeMissing',
   *                     recorded?: number, detail?: number }
   * CP4 (Labor)     — { errType: 'noTime'|'totalMismatch',
   *                     recorded?: number, detail?: number }
   * CP5 (Time)      — { errType: 'missing'|'mismatch',
   *                     recorded?: number, computed?: number }
   * CP6 (WO Compl.) — { errType: 'lotPalletShort'|'taskQtyShort'|'wocMismatch'|null,
   *                     actual?: number, target?: number,
   *                     wocTotal?: number, taskTotal?: number }
   * CP7 (Cost Gen)  — no extra data needed
   * ────────────────────────────────────────────────────────────
   */
  function getCheckpointNote(cpIndex, status, data, lang) {
    const th = lang === 'th';
    if (status === 'ok' || status === 'na') return '';

    // safe fallback for data
    const d = data || {};

    switch (cpIndex) {

      // ── CP0: Approve ─────────────────────────────────────────
      case 0:
        if (status === 'wait') return th ? 'รอการอนุมัติ' : 'Pending approval';
        return '';

      // ── CP1: Release ─────────────────────────────────────────
      case 1:
        if (status === 'wait') return th
          ? 'ยังไม่ปล่อย Batch เข้าสู่การผลิต'
          : 'Batch not yet released to production';
        return '';

      // ── CP2: Gen Lot & Pallet ─────────────────────────────────
      case 2: {
        if (status === 'na') return th
          ? 'ยังไม่ปล่อยผลิต'
          : 'Batch not yet released';

        if (status === 'wait') {
          if (d.errType === 'lotPalletShort') return th
            ? `Gen Lot&Pallet ${d.actual} จาก ${d.target}`
            : `Lot & Pallet ${d.actual} of ${d.target} generated`;
          return th ? 'ยังไม่ Gen Lot & Pallet' : 'Lot & Pallet not yet generated';
        }
        return '';
      }

      // ── CP3: Feed Materials ───────────────────────────────────
      case 3: {
        if (status === 'wait') {
          const n     = d.missingCount || 0;
          const items = Array.isArray(d.missingItems) ? d.missingItems.join(', ') : '';
          return th
            ? `วัตถุดิบขาด ${n} รายการ: ${items}`
            : `Missing ${n} material(s): ${items}`;
        }
        return '';
      }

      // ── CP4: Machine ──────────────────────────────────────────
      case 4: {
        if (status === 'na') return th
          ? 'ยังไม่มีใบปิดงาน'
          : 'No WO completion record yet';

        if (status === 'err') {
          switch (d.errType) {
            case 'noTime':
              return th
                ? 'ไม่มีข้อมูลเวลาเครื่องจักร'
                : 'Machine time not recorded';

            case 'timeMismatch':
              return th
                ? `เวลาเครื่องจักร ${d.recorded} นาที ไม่ตรงกับรายละเอียด ${d.detail} นาที`
                : `Machine time ${d.recorded} min ≠ detail total ${d.detail} min`;

            case 'downtimeMissing':
              return th
                ? 'บันทึกสาเหตุเครื่องหยุดแต่ไม่ได้ลงเวลาเริ่ม–จบที่หยุด'
                : 'Downtime reason set but start–end of downtime not recorded';

            default:
              return th ? 'ข้อมูลเครื่องจักรผิดปกติ' : 'Machine data issue';
          }
        }
        return '';
      }

      // ── CP5: Labor (Pre-WOC Labor existence) ─────────────────
      case 5:
        if (status === 'wait') return th
          ? 'ยังไม่บันทึกข้อมูลแรงงาน (Pre-WOC Labor)'
          : 'Pre-WOC labor not yet recorded';
        return '';

      // ── CP6: Time ─────────────────────────────────────────────
      case 6: {
        if (status === 'na') return th
          ? 'ยังไม่มีใบปิดงาน'
          : 'No WO completion record yet';

        if (status === 'err') {
          switch (d.errType) {
            case 'missing':
              return th
                ? 'ไม่มีข้อมูลเวลาเริ่ม–จบ'
                : 'Start or end time not recorded';

            case 'mismatch':
              return th
                ? `เวลารวมที่บันทึก ${d.recorded} นาที ไม่ตรงกับช่วงเริ่ม–จบ ${d.computed} นาที`
                : `Recorded total time ${d.recorded} min ≠ start–end span ${d.computed} min`;

            default:
              return th ? 'ข้อมูลเวลาผิดปกติ' : 'Time data issue';
          }
        }
        return '';
      }

      // ── CP7: WOC Exists ──────────────────────────────────────
      case 7:
        if (status === 'wait') return th
          ? 'ยังไม่มีการบันทึกปิดงานผลิต (WOC)'
          : 'No WO completion record yet';
        return '';

      // ── CP8: WO Completion ────────────────────────────────────
      case 8: {
        if (status === 'na') return th
          ? 'ยังไม่มีใบปิดงาน'
          : 'No WO completion record yet';

        if (status === 'wait') {
          switch (d.errType) {
            case 'taskQtyShort':
              return th
                ? `จำนวนผลิตได้ ${d.actual} ยังไม่ถึงเป้าหมาย ${d.target}`
                : `Produced qty ${d.actual} below target ${d.target}`;

            default:
              return th ? 'ปิดงานยังไม่ครบ' : 'WO completion not yet reached';
          }
        }

        if (status === 'err') {
          return th
            ? `จำนวนที่ปิดงาน ${d.wocTotal} ไม่ตรงกับจำนวนที่ผลิตจริง ${d.taskTotal}`
            : `Completed qty ${d.wocTotal} does not match produced qty ${d.taskTotal}`;
        }
        return '';
      }

      // ── CP9: Cost Generation ──────────────────────────────────
      case 9: {
        if (status === 'na') return th
          ? 'ยังไม่มีใบปิดงาน'
          : 'No WO completion record yet';

        if (status === 'err') return th
          ? 'ปิดงานผลิตแล้ว แต่ระบบยังไม่สร้างต้นทุน'
          : 'WO completed but system has not generated production cost';

        return '';
      }

      // ── CP10: Standard Cost Setup ─────────────────────────────
      case 10: {
        if (status === 'err') return th
          ? 'ไม่พบการตั้งค่าต้นทุนมาตรฐาน — ยังไม่ได้ตั้ง Cost Ref หรือ OH Rate สำหรับงานนี้'
          : 'Standard cost setup not found — Cost Ref or OH Rate not configured for this operation';
        return '';
      }

      default:
        return '';
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────
  return { getLabels, getCheckpointNote };
});
