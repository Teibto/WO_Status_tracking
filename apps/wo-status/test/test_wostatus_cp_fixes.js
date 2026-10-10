/**
 * เทส — ชุดแก้ bug ของเช็คพอยต์ชั้น grid (CP4/CP6/CP7/CP8) + lang XSS + .hidden
 *
 * ที่มา: audit เจอว่า CP8 ตายทั้งดุ้น (query กับ compute คนละสัญญา → na ตลอดกาล),
 * CP4/CP6 ขึ้นเขียวเมื่อข้อมูลขาด (ขัดสัญญาที่หัวไฟล์และ drilldown), CP7 รวมยอดข้าม task
 * แล้วเทียบกับเป้าของ task แรก, และ `lang` จาก URL หลุดลง HTML โดยไม่ผ่าน escape
 *
 * ล็อกด้วยตัวเลข KPI กับข้อความ note จริงที่ render ออกมา (ไม่ export ฟังก์ชัน compute
 * ออกมาให้เทส — ล็อกที่ observable ที่ผู้ใช้เห็นแทน)
 */
const H = require('../../../test/lib/_harness');

const eq = H.makeEq({ json: true });

const WO_ROW = {
  woid: '1001', wo_number: 'WOFSC00001001', item_id: '9', item_code: 'X',
  item_displayname: 'X', item_name: 'X', qty: 10, unit_name: 'KG',
  wo_date: '2026-09-02', location_id: '10', location_name: 'PD_B1',
  line_name: 'A', approval_status: '1', approval_status_name: 'Approved', back_order_qty: 10,
};

// แถว task ของ CP7 (ผลรวม WOC == ผลรวมงาน == เป้า) — ใช้เป็นฐานให้ CP7 ผ่านในเคสอื่น
const CP7_OK = [{
  woid: '1001', task_id: '1', batch_id: '1',
  tm_good: 10, tm_scrap: 0, tm_rework: 0, tm_move: 0, tm_pro_qty: 10,
  woc_good: 10, woc_scrap: 0, woc_rework: 0, woc_move: 0,
}];

// แถว task ของ CP6 ที่ถูกต้อง (start–end สอดคล้อง total_min)
const CP6_OK = [{ task_id: '1', woid: '1001', batch_id: '1', woc_id: '500',
  start_dt: '2026-09-02T08:00:00', end_dt: '2026-09-02T08:30:00', total_min: 30 }];

let MODE = {};

function sqlRows(sql) {
  if (/customrecord_cseg_subitemtype/.test(sql)) return [];
  if (/FROM subsidiary/i.test(sql)) return [{ id: '2', name: 'Foodstar Co., Ltd.' }];
  if (/FROM location WHERE custrecord_mfg_productionplant/.test(sql)) return [{ id: '10', name: 'PD_B1' }];
  if (/AS wo_number/.test(sql)) return [WO_ROW];
  if (/customrecord_mfg_releasedwobatch/.test(sql)) return MODE.cp2 || [];
  if (/AS machine_time/.test(sql)) return MODE.cp4 || [];
  if (/customrecord_mfg_mac_down_reason_comp/.test(sql)) return MODE.cp4child || [];
  if (/customrecord_mfg_prewoc_labor/.test(sql)) return [];
  // ── drilldown (WOStatusTracking_Drilldown.js) ─────────────────────────────
  // ต้องวางก่อน route ของ grid ที่ regex กว้างกว่า: /AS start_dt/ จะดัก queryWOC ของ
  // drilldown (ซึ่ง select start_dt ด้วย) และ /AS tm_good/ จะดัก queryTasks (tm_good_qty)
  // alias ที่ใช้จึงเลือกตัวที่ไม่ซ้ำกับ grid — ลำดับของ route เดิมคงไว้ทั้งหมด
  if (/AS task_altname/.test(sql)) return MODE.tasks || [];
  if (/AS woc_tranid/.test(sql)) return MODE.woc || [];
  if (/AS backorder_qty/.test(sql)) return MODE.woCtx || [];
  if (/custcol_mfg2_ref_workordercompletion/.test(sql)) return MODE.costAlloc || [];
  if (/AS start_dt/.test(sql)) return MODE.cp6 || [];
  if (/customrecord_mfg_lot_pallet_info/.test(sql)) return MODE.cp7l1 || [];
  if (/AS tm_good/.test(sql)) return MODE.cp7 || [];
  if (/AS cost_alloc_count/.test(sql)) return MODE.cp8 || [];
  if (/AS item_source/.test(sql)) return MODE.cp3a || [];
  if (/custrecord_adjt_mfgrawmaterial/.test(sql)) return MODE.cp3b || [];
  return [];
}

const { module: mod, libT } = H.load({
  file: 'WOStatusTracking.js',
  libs: [
    'WOReportTheme.js',
    'WOStatusTracking_Labels.js',
    'WOStatusTracking_Queries.js',
    'WOStatusTracking_Drilldown.js',
  ],
  requireRunSQL: false,
  sqlRows,
  quietLog: true,
  // เปิด helper ภายในของ Queries ออกมาให้เทสเรียกตรง ๆ (กลไก libExports ของ harness)
  libExports: { 'WOStatusTracking_Queries.js': ['isFeedableBomLine'] },
});

function run(params) {
  const chunks = [];
  mod.onRequest({
    request: { parameters: params },
    response: { write: (s) => chunks.push(String(s)), setHeader: () => {} },
  });
  return chunks.join('');
}

/** ตัวเลข KPI ช่อง err (และช่อง ok/wait) — observable ที่ผู้ใช้เห็นจริง */
function kpi(html, cls) {
  const m = html.match(new RegExp('<div class="kpi ' + cls + '">\\s*<div class="n">(\\d+)</div>'));
  return m ? +m[1] : -1;
}

const PARAMS = { action: 'search', dateFrom: '02/09/2026', dateTo: '08/09/2026' };

// ═══ lang จาก URL — whitelist ไม่ให้หลุดลง HTML (reflected XSS) ═══
console.log('\n── lang จาก URL ถูก whitelist ──');
{
  const evil = '"><script>alert(1)</script>';
  const html = run(Object.assign({}, PARAMS, { lang: evil }));
  eq('ไม่มี payload ดิบหลุดในหน้า', html.indexOf('<script>alert(1)') >= 0, false);
  eq('lang ใน <html> ถูกบังคับเป็น th', /<html lang="th">/.test(html), true);
  eq('hidden input lang = th (ไม่ใช่ค่าดิบ)', /id="hidLang" value="th"/.test(html), true);
  eq('ยังเลือก en ได้ตามปกติ', /<html lang="en">/.test(run(Object.assign({}, PARAMS, { lang: 'en' }))), true);
}

// ═══ CSS .hidden มีจริง (เดิมเรียก classList แต่ไม่เคยมีนิยาม) ═══
console.log('\n── CSS .hidden ──');
eq('REPORT_CSS มี .hidden{display:none}',
  /\.hidden\{display:none!important\}/.test(run(Object.assign({}, PARAMS, { lang: 'th' }))), true);

// ═══ CP8: WOC + ไม่มี cost allocation → err (เดิม na ตลอดกาล) ═══
console.log('\n── CP8 (Cost Generation) ──');
MODE = { cp7: CP7_OK, cp8: [] };
let html = run(PARAMS);
eq('มี WOC แต่ไม่มี cost allocation → ขึ้น err', kpi(html, 'err') >= 1, true);
eq('หมายเหตุบอกว่ายังไม่มีต้นทุนผูกกับงานผลิตนี้', html.indexOf('ยังไม่มีต้นทุนผูกกับงานผลิตนี้') >= 0, true);

MODE = { cp7: CP7_OK, cp8: [{ woid: '1001', cost_alloc_count: 1 }] };
html = run(PARAMS);
eq('มี cost allocation → ไม่ขึ้น err อีก (CP8 ไม่ตายเป็น na เหมือนเดิม)', kpi(html, 'err'), 0);
eq('ไม่มีหมายเหตุว่าต้นทุนขาด', html.indexOf('ยังไม่มีต้นทุนผูกกับงานผลิตนี้') >= 0, false);

// ═══ CP4: เวลาเครื่องจักรขาด/เหตุหยุดไม่กรอกนาที → err (เดิม ok) ═══
console.log('\n── CP4 (Machine) ──');
MODE = { cp7: CP7_OK, cp8: [{ woid: '1001', cost_alloc_count: 1 }],
  cp4: [{ task_id: '1', woid: '1001', batch_id: '1', woc_id: '500', machine_time: 0 }] };
html = run(PARAMS);
eq('machine time = 0 → err', kpi(html, 'err') >= 1, true);
eq('หมายเหตุบอกว่ายังไม่บันทึกเวลาเครื่องจักร', html.indexOf('ยังไม่บันทึกเวลาเครื่องจักร 1 งาน') >= 0, true);

MODE = { cp7: CP7_OK, cp8: [{ woid: '1001', cost_alloc_count: 1 }],
  cp4: [{ task_id: '1', woid: '1001', batch_id: '1', woc_id: '500', machine_time: 30 }],
  cp4child: [{ woc_id: '500', mac_total: 30, down_reason: '', down_min: 0 }] };
html = run(PARAMS);
eq('machine time ตรง detail → ไม่ err', kpi(html, 'err'), 0);

MODE = { cp7: CP7_OK, cp8: [{ woid: '1001', cost_alloc_count: 1 }],
  cp4: [{ task_id: '1', woid: '1001', batch_id: '1', woc_id: '500', machine_time: 30 }],
  cp4child: [{ woc_id: '500', mac_total: 30, down_reason: 'POWER', down_min: 0 }] };
html = run(PARAMS);
eq('มีเหตุหยุดเครื่องแต่ไม่กรอกนาที → err', html.indexOf('มีเหตุหยุดเครื่องแต่ไม่กรอกนาที') >= 0, true);

// ═══ CP6: time field ขาด → err (เดิมข้ามเงียบ ๆ = ok) ═══
console.log('\n── CP6 (Time) ──');
MODE = { cp7: CP7_OK, cp8: [{ woid: '1001', cost_alloc_count: 1 }],
  cp6: [{ task_id: '1', woid: '1001', batch_id: '1', woc_id: '500', start_dt: '', end_dt: '', total_min: 0 }] };
html = run(PARAMS);
eq('เวลาเริ่ม/จบขาด → err', kpi(html, 'err') >= 1, true);
eq('หมายเหตุบอกว่ากรอกเวลาไม่ครบ', html.indexOf('กรอกเวลาไม่ครบ/ไม่ถูกต้อง 1 งาน') >= 0, true);

MODE = { cp7: CP7_OK, cp8: [{ woid: '1001', cost_alloc_count: 1 }], cp6: CP6_OK };
html = run(PARAMS);
eq('เวลาเริ่ม/จบและนาทีรวมตรงกัน → ไม่ err', kpi(html, 'err'), 0);

// ═══ CP7: เทียบต่อ task + ไม่นับ Lot&Pallet ซ้ำตามจำนวน task ═══
console.log('\n── CP7 (WO Completion) ──');
const CP8_OK = [{ woid: '1001', cost_alloc_count: 1 }];
MODE = { cp7: CP7_OK.concat([{
    woid: '1001', task_id: '2', batch_id: '1',
    tm_good: 5, tm_scrap: 0, tm_rework: 0, tm_move: 0, tm_pro_qty: 5,
    woc_good: 5, woc_scrap: 0, woc_rework: 0, woc_move: 0,
  }]), cp8: CP8_OK };
html = run(PARAMS);
eq('สอง task ที่ตรงกันหมด → ไม่ err (ของเดิมเทียบยอดรวมกับเป้า task แรกแล้ว err ปลอม)',
  kpi(html, 'err'), 0);
eq('ไม่มีหมายเหตุว่า WOC ไม่ตรง', html.indexOf('ปริมาณ WOC ไม่ตรงกับงาน') >= 0, false);

MODE = { cp7: CP7_OK.concat([{
    woid: '1001', task_id: '2', batch_id: '1',
    tm_good: 8, tm_scrap: 0, tm_rework: 0, tm_move: 0, tm_pro_qty: 8,
    woc_good: 5, woc_scrap: 0, woc_rework: 0, woc_move: 0,
  }]), cp8: CP8_OK };
html = run(PARAMS);
eq('task ที่ 2 ปริมาณ WOC ไม่ตรงงาน → err', kpi(html, 'err') >= 1, true);
eq('หมายเหตุชี้ task ที่ไม่ตรง', html.indexOf('ปริมาณ WOC ไม่ตรงกับงาน 1 งาน') >= 0, true);

// เคส wait ต้องปิด CP2/CPLot ให้ ok ก่อน ไม่งั้น note ของ CP2 ("ยังไม่มี Batch") หรือ
// CPLot จะกลบ note ของ CP7 เพราะ rank เท่ากันและมาก่อน — pickWorstNote เลือกตัวแรกที่ rank สูงสุด
MODE = { cp2: [{ woid: '1001', batch_id: '1', batch_name: 'B1', released: 'T' }],
  cp7l1: [{ woid: '1001', total_lp_qty: 10 }],
  cp7: CP7_OK.concat([{
    woid: '1001', task_id: '2', batch_id: '1',
    tm_good: 5, tm_scrap: 0, tm_rework: 0, tm_move: 0, tm_pro_qty: 8,
    woc_good: 5, woc_scrap: 0, woc_rework: 0, woc_move: 0,
  }]), cp8: CP8_OK };
html = run(PARAMS);
eq('ผลิตไม่ครบเป้า → wait', kpi(html, 'err'), 0);
eq('หมายเหตุบอกว่าผลิตได้น้อยกว่าเป้า', html.indexOf('ผลิตได้น้อยกว่าเป้า 1 งาน') >= 0, true);

// ═══ CP3: เทียบ BOM กับวัตถุดิบที่ป้อนจริง — ต้องข้ามบรรทัดที่ไม่ใช่วัตถุดิบ ═══
console.log('\n── CP3 (Feed Materials) ──');

// แถว CP3a แบบเดียวกับ WO จริง: self line + OthCharge (item_source ว่าง), phantom, summary cost
// แล้วตามด้วยวัตถุดิบจริง 3 ตัว — mock SQL คืนมาครบทุกบรรทัดเพื่อพิสูจน์ว่ากติกาฝั่ง JS กรองเอง
const CP3A_MIXED = [
  { woid: '1001', item_id: '901', item_code: 'C901', item_name: 'ASSY-X',       item_source: null,      is_summary_cost: 'F' },
  { woid: '1001', item_id: '902', item_code: 'C902', item_name: 'CHARGE-1',     item_source: null,      is_summary_cost: 'F' },
  { woid: '1001', item_id: '903', item_code: 'C903', item_name: 'PHANTOM-ITEM', item_source: 'PHANTOM', is_summary_cost: 'F' },
  { woid: '1001', item_id: '904', item_code: 'C904', item_name: 'SUMCOST-ITEM', item_source: 'STOCK',   is_summary_cost: 'T' },
  { woid: '1001', item_id: '11',  item_code: 'C11',  item_name: 'RM-A',         item_source: 'STOCK',   is_summary_cost: 'F' },
  { woid: '1001', item_id: '12',  item_code: 'C12',  item_name: 'RM-B',         item_source: 'STOCK',   is_summary_cost: 'F' },
  { woid: '1001', item_id: '13',  item_code: 'C13',  item_name: 'RM-C',         item_source: 'STOCK',   is_summary_cost: 'F' },
];
const CP3B_FED = [
  { woid: '1001', item_id: '11', item_code: 'C11', item_name: 'RM-A' },
  { woid: '1001', item_id: '12', item_code: 'C12', item_name: 'RM-B' },
  { woid: '1001', item_id: '13', item_code: 'C13', item_name: 'RM-C' },
];
// ปิด CP2/CPLot ให้ ok ก่อน — CP3 เป็น wait ที่ index 3 ถ้าสองตัวก่อนหน้า wait ด้วย
// pickWorstNote จะเลือก note ของ CP2/CPLot (rank เท่ากันแต่มาก่อน) กลบ note ของ CP3
const CP3_BASE = {
  cp2: [{ woid: '1001', batch_id: '1', batch_name: 'B1', released: 'T' }],
  cp7l1: [{ woid: '1001', total_lp_qty: 10 }],
  cp7: CP7_OK,
  cp8: [{ woid: '1001', cost_alloc_count: 1 }],
};

MODE = Object.assign({ cp3a: CP3A_MIXED, cp3b: CP3B_FED }, CP3_BASE);
html = run(PARAMS);
eq('self/OthCharge/phantom/summary cost ถูกกรองออก แม้ mock คืนมาครบ → CP3 ok ไม่มี note',
  html.indexOf('ยังไม่ได้ป้อนวัตถุดิบ') >= 0, false);

MODE = Object.assign({
  cp3a: CP3A_MIXED.concat([
    { woid: '1001', item_id: '14', item_code: 'C14', item_name: 'RM-D', item_source: 'STOCK', is_summary_cost: 'F' },
  ]),
  cp3b: CP3B_FED,
}, CP3_BASE);
html = run(PARAMS);
eq('วัตถุดิบจริงที่ยังไม่ป้อน (RM-D) → ขึ้น note', html.indexOf('ยังไม่ได้ป้อนวัตถุดิบ: C14 RM-D') >= 0, true);
eq('note ไม่พูดถึง self line', html.indexOf('ASSY-X') >= 0, false);
eq('note ไม่พูดถึง OthCharge', html.indexOf('CHARGE-1') >= 0, false);
eq('note ไม่พูดถึง phantom', html.indexOf('PHANTOM-ITEM') >= 0, false);
eq('note ไม่พูดถึง summary cost', html.indexOf('SUMCOST-ITEM') >= 0, false);

// Case 3: เรียก helper ที่ export ตรง ๆ (harness เปิดให้ผ่าน libExports) — ล็อกกติกาที่ต้นทาง
const isFeedableBomLine = libT['WOStatusTracking_Queries.js'].isFeedableBomLine;
eq('self line (item_source ว่าง) ไม่ใช่วัตถุดิบ', isFeedableBomLine({ item_source: null, is_summary_cost: 'F' }), false);
eq('phantom ไม่ใช่วัตถุดิบ', isFeedableBomLine({ item_source: 'PHANTOM', is_summary_cost: 'F' }), false);
eq('summary cost ไม่ใช่วัตถุดิบ', isFeedableBomLine({ item_source: 'STOCK', is_summary_cost: 'T' }), false);
eq('STOCK ธรรมดาเป็นวัตถุดิบ', isFeedableBomLine({ item_source: 'STOCK', is_summary_cost: 'F' }), true);

// ═══════════════════════════════════════════════════════════════════════
// JOB A — drilldown: notes เป็นข้อความที่เห็นได้, batch dedupe, item codes, WOC link
// (WOStatusTracking_Drilldown.js)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── drilldown: notes มองเห็น / dedupe / item code / WOC link ──');

/** raw html ลบ data-tip/aria-label แล้วแทน tag ด้วยช่องว่าง — เอาเฉพาะข้อความที่ผู้ใช้เห็น */
function visible(html) {
  return String(html)
    .replace(/data-tip="[^"]*"/g, '')
    .replace(/aria-label="[^"]*"/g, '')
    .replace(/<[^>]*>/g, ' ');
}

const DD_MISSING = 'วัตถุดิบขาด 1 รายการ: C13 RM-B';

// BOM ของ WO: 11 C11 RM-A · 12 C12 RM-B · 13 C13 RM-B (12 กับ 13 ชื่อ displayname ซ้ำกัน)
const DD_BOM = [
  { item_id: '11', item_code: 'C11', item_name: 'RM-A', item_source: 'STOCK', is_summary_cost: 'F' },
  { item_id: '12', item_code: 'C12', item_name: 'RM-B', item_source: 'STOCK', is_summary_cost: 'F' },
  { item_id: '13', item_code: 'C13', item_name: 'RM-B', item_source: 'STOCK', is_summary_cost: 'F' },
];
// ป้อนจริงแค่ 11 กับ 12 → ขาด 13 เท่านั้น (ถ้าคีย์ด้วยชื่อจะมองว่า 13 ถูกป้อนไปด้วย)
const DD_FED = [
  { item_id: '11', item_code: 'C11', item_name: 'RM-A' },
  { item_id: '12', item_code: 'C12', item_name: 'RM-B' },
];

const DD_TASKS = [
  { task_id: '1', task_name: 'TM-1', task_altname: 'Mixing',  batch_id: '1', op_task_id: '901',
    tm_good_qty: 10, tm_scrap_qty: 0, tm_rework_qty: 0, tm_move_qty: 0, tm_pro_qty: 10 },
  { task_id: '2', task_name: 'TM-2', task_altname: 'Filling', batch_id: '1', op_task_id: '902',
    tm_good_qty: 10, tm_scrap_qty: 0, tm_rework_qty: 0, tm_move_qty: 0, tm_pro_qty: 10 },
  { task_id: '3', task_name: 'TM-3', task_altname: 'Packing', batch_id: '1', op_task_id: '903',
    tm_good_qty: 10, tm_scrap_qty: 0, tm_rework_qty: 0, tm_move_qty: 0, tm_pro_qty: 10 },
];

// WOC ของ TM-1 เท่านั้น — start 08:00 end 08:30 (30 นาที) แต่ total_minute 45 → CP6 (เวลา) err
const DD_WOC = [{
  task_id: '1', woc_id: '500', woc_tranid: 'WOC-TEST-1',
  woc_good_qty: 10, woc_scrap_qty: 0, woc_rework_qty: 0, woc_move_qty: 0,
  machinetime: 30, labortime: 0, totallbtimecal: 0,
  start_dt: '2026-09-02T08:00:00', end_dt: '2026-09-02T08:30:00', total_minute: 45,
}];

function ddMode(over) {
  return Object.assign({
    woCtx: [{ approval_status: '2', approval_status_name: 'Approved', backorder_qty: 10, unit_name: 'KG' }],
    cp2: [{ batch_id: '1', batch_name: 'B1', released_status: '2', released_qty: 10 }],
    tasks: DD_TASKS,
    woc: DD_WOC,
    cp4child: [],
    cp7l1: [{ woid: '1001', lp_total: 10 }],
    costAlloc: [{ woc_id: '500' }],
    cp3a: DD_BOM,
    cp3b: DD_FED,
  }, over);
}
const DRILL = { action: 'drilldown', woid: '1001', lang: 'th' };

MODE = ddMode({});
const ddHtml = run(DRILL);
const ddVisible = visible(ddHtml);

// (a) item code: missing list ต้องเป็น C13 เท่านั้น (12 กับ 13 ชื่อซ้ำกัน)
eq('a: note มีหัวข้อ ป้อนวัตถุดิบ:', ddVisible.indexOf('ป้อนวัตถุดิบ:') >= 0, true);
eq('a: missing list โชว์ C13 RM-B', ddVisible.indexOf('C13 RM-B') >= 0, true);
eq('a: missing list ไม่มี C12 RM-B (คีย์ด้วย item id ไม่ใช่ชื่อ)', ddVisible.indexOf('C12 RM-B') >= 0, false);

// (b) batch row dedupe: ข้อความเดียว รวมชื่อ task ทั้งสาม
const ddBatchRow = (ddHtml.match(/<tr class="batch">[\s\S]*?<\/tr>/) || [''])[0];
const ddBatchVisible = visible(ddBatchRow);
eq('b: batch row มีข้อความวัตถุดิบขาดครั้งเดียว', ddBatchVisible.split(DD_MISSING).length - 1, 1);
eq('b: batch row รวมชื่อ task ทั้งสาม', ddBatchVisible.indexOf(DD_MISSING + ' (TM-1, TM-2, TM-3)') >= 0, true);

// (c) note แรงงานต้องเห็นเป็นข้อความ ไม่ใช่แค่ tooltip
eq('c: note แรงงานมองเห็นได้', ddVisible.indexOf('ยังไม่บันทึกข้อมูลแรงงาน (Pre-WOC Labor)') >= 0, true);

// (d) err มาก่อน wait ใน note-cell เดียวกัน (TM-1 มีทั้ง CP6 err และ CP3/CP5 wait)
const ddTm1Row = (ddHtml.match(/<tr class="task">[\s\S]*?TM-1[\s\S]*?<\/tr>/) || [''])[0];
const dErrIdx = ddTm1Row.indexOf('note-line err');
const dWaitIdx = ddTm1Row.indexOf('note-line wait');
eq('d: TM-1 มีทั้ง note-line err และ wait', dErrIdx >= 0 && dWaitIdx >= 0, true);
eq('d: note-line err มาก่อน note-line wait', dErrIdx < dWaitIdx, true);

// (e) markup tooltip เดิมต้องไม่ถูกผลิตอีก
eq('e: ไม่มี <span class="note-icon ใน drilldown', ddHtml.indexOf('<span class="note-icon') >= 0, false);

// (g) WOC link บนแถว task
eq('g: มีลิงก์ transaction.nl?id=500', ddHtml.indexOf('transaction.nl?id=500') >= 0, true);
eq('g: ข้อความลิงก์เป็น ใบปิดงาน WOC-TEST-1', ddVisible.indexOf('ใบปิดงาน WOC-TEST-1') >= 0, true);

// (g2) woc id ที่ไม่ใช่ตัวเลข → ไม่มีลิงก์
MODE = ddMode({ woc: [{
  task_id: '1', woc_id: 'abc', woc_tranid: 'WOC-TEST-1',
  woc_good_qty: 10, woc_scrap_qty: 0, woc_rework_qty: 0, woc_move_qty: 0,
  machinetime: 30, labortime: 0, totallbtimecal: 0,
  start_dt: '2026-09-02T08:00:00', end_dt: '2026-09-02T08:30:00', total_minute: 30,
}] });
eq('g2: woc id ไม่ใช่ตัวเลข → ไม่มีลิงก์', run(DRILL).indexOf('transaction.nl?id=') >= 0, false);

// (f) XSS — ชื่อ task ต้องถูก escape
const XSS_NAME = '<img src=x onerror=alert(1)>';
MODE = ddMode({ tasks: [Object.assign({}, DD_TASKS[0], { task_name: XSS_NAME })] });
const ddXss = run(DRILL);
eq('f: ไม่มี <img src=x ดิบใน html', ddXss.indexOf('<img src=x') >= 0, false);
eq('f: ชื่อ task ถูก escape เป็น &lt;img', ddXss.indexOf('&lt;img src=x') >= 0, true);

// ═══════════════════════════════════════════════════════════════════════
// JOB B — grid: notes ครบทุกเรื่อง, CP3 keyed ด้วย item id, ลิงก์ WO, XSS
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── grid: notes มองเห็นทุกเรื่อง / CP3 ด้วย item id / ลิงก์ WO ──');

// (a) WO เดียวมีทั้ง time error (CP6) และวัตถุดิบขาด (CP3) — err ต้องมาก่อน wait
MODE = Object.assign({
  cp6: [{ task_id: '1', woid: '1001', batch_id: '1', woc_id: '500', start_dt: '', end_dt: '', total_min: 0 }],
  cp3a: [{ woid: '1001', item_id: '11', item_code: 'C11', item_name: 'RM-A', item_source: 'STOCK', is_summary_cost: 'F' }],
  cp3b: [],
}, CP3_BASE);
const gErrWait = visible(run(PARAMS));
eq('a: note มีหัวข้อ เวลา:', gErrWait.indexOf('เวลา:') >= 0, true);
eq('a: note มีหัวข้อ ป้อนวัตถุดิบ:', gErrWait.indexOf('ป้อนวัตถุดิบ:') >= 0, true);
eq('a: err (เวลา) มาก่อน wait (ป้อนวัตถุดิบ)',
  gErrWait.indexOf('เวลา:') < gErrWait.indexOf('ป้อนวัตถุดิบ:'), true);

// (b) displayname ซ้ำกันข้าม id — ต้องเทียบด้วย item id ไม่ใช่ชื่อ
const GRID_BOM_DUP = [
  { woid: '1001', item_id: '11', item_code: 'C11', item_name: 'RM-A', item_source: 'STOCK', is_summary_cost: 'F' },
  { woid: '1001', item_id: '12', item_code: 'C12', item_name: 'RM-B', item_source: 'STOCK', is_summary_cost: 'F' },
  { woid: '1001', item_id: '13', item_code: 'C13', item_name: 'RM-B', item_source: 'STOCK', is_summary_cost: 'F' },
];
MODE = Object.assign({
  cp3a: GRID_BOM_DUP,
  cp3b: [{ woid: '1001', item_id: '11', item_code: 'C11', item_name: 'RM-A' },
         { woid: '1001', item_id: '12', item_code: 'C12', item_name: 'RM-B' }],
}, CP3_BASE);
const gMissHtml = run(PARAMS);
const gMissVisible = visible(gMissHtml);
eq('b: missing list โชว์ C13 RM-B', gMissVisible.indexOf('ยังไม่ได้ป้อนวัตถุดิบ: C13 RM-B') >= 0, true);
eq('b: missing list ไม่มี C12 RM-B (คีย์ด้วย item id)', gMissVisible.indexOf('C12 RM-B') >= 0, false);

MODE = Object.assign({
  cp3a: GRID_BOM_DUP,
  cp3b: [{ woid: '1001', item_id: '11', item_code: 'C11', item_name: 'RM-A' },
         { woid: '1001', item_id: '12', item_code: 'C12', item_name: 'RM-B' },
         { woid: '1001', item_id: '13', item_code: 'C13', item_name: 'RM-B' }],
}, CP3_BASE);
eq('b: ป้อนครบทุก id → ไม่มี note วัตถุดิบขาด',
  visible(run(PARAMS)).indexOf('ยังไม่ได้ป้อนวัตถุดิบ') >= 0, false);

// (c) tooltip บน pill ต้องมีหัวข้อคอลัมน์นำหน้า note
eq('c: data-tip บน pill มีหัวข้อ + note',
  gMissHtml.indexOf('data-tip="ป้อนวัตถุดิบ: ยังไม่ได้ป้อนวัตถุดิบ:') >= 0, true);

// (d) ลิงก์ WO บนแถว grid
html = run(PARAMS);
eq('d: มีลิงก์ transaction.nl?id=1001', html.indexOf('transaction.nl?id=1001') >= 0, true);
eq('d: markup ลิงก์ใช้ class="wo-link"', html.indexOf('class="wo-link"') >= 0, true);
eq("d: คลิกใน note ไม่ตามลิงก์ (closest('a'))", html.indexOf("closest('a')") >= 0, true);

// (e) ไม่ผลิต markup note-icon แบบเดิมอีก
eq('e: ไม่มี <span class="note-icon', html.indexOf('<span class="note-icon') >= 0, false);

// (f) XSS — ชื่อวัตถุดิบต้องถูก escape
MODE = Object.assign({
  cp3a: [{ woid: '1001', item_id: '11', item_code: 'C11', item_name: '<img src=x onerror=alert(1)>', item_source: 'STOCK', is_summary_cost: 'F' }],
  cp3b: [],
}, CP3_BASE);
const gXss = run(PARAMS);
eq('f: ไม่มี <img src=x ดิบใน html', gXss.indexOf('<img src=x') >= 0, false);
eq('f: ชื่อวัตถุดิบถูก escape เป็น &lt;img', gXss.indexOf('&lt;img') >= 0, true);

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
