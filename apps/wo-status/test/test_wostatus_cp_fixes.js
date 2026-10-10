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
  if (/AS start_dt/.test(sql)) return MODE.cp6 || [];
  if (/customrecord_mfg_lot_pallet_info/.test(sql)) return MODE.cp7l1 || [];
  if (/AS tm_good/.test(sql)) return MODE.cp7 || [];
  if (/AS cost_alloc_count/.test(sql)) return MODE.cp8 || [];
  return [];
}

const { module: mod } = H.load({
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

console.log('\n' + (H.fails() ? H.fails() + ' รายการไม่ผ่าน' : 'ผ่านทั้งหมด'));
process.exit(H.fails() ? 1 : 0);
