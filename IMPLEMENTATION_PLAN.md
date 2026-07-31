# WO Status Tracking — Implementation Plan (Phase 1)

> Foodstar / TEIBTO — NetSuite custom MFG. ติดตาม lifecycle ของ Work Order ทีละ checkpoint + reconcile เบื้องต้นว่าข้อมูลถูกต้อง/ผิดปกติตรงไหน.
> เอกสารนี้สำหรับ developer/model ที่จะ implement — ใส่ field/record จริงครบ.
> Mockup UI ที่ผู้ใช้อนุมัติแล้ว: `wo-status-tracking-mockup.html` (ใช้เป็น reference หน้าตา/พฤติกรรม).

---

## 1. เป้าหมาย & ขอบเขตเฟส 1
- แสดงสถานะใบสั่งผลิต (WO) ทีละขั้น (9 checkpoints) ในมุมมอง **high-level** + ตรวจความผิดปกติเบื้องต้น.
- **ไม่อยู่ในเฟส 1:** export, quick-filter "เฉพาะ error", การจับ WO ค้างนาน (idle/stalled), report เจาะลึกช่วยtrace (→ เฟสถัดไป).

## 2. Grain & Hierarchy
```
WO ──< batch (customrecord_mfg_releasedwobatch ; ref WO = custrecord_mfg_released_refwo)
WO + batch ──< operation task (customrecord_mfg_task_management)
        custrecord_mfg_tm_wo → WO ; custrecord_mfg_tm_releasedbatch → batch ; custrecord_mfg_tm_ot → operation task
operation task ──< WOC (workordercompletion ; ref task = custbody_mfg_task_mgn_ref)
Lot&Pallet (customrecord_mfg_lot_pallet_info ; custrecord_mfg_lpi_wo → WO) = WO-grain
```
- ประมวลผลที่ระดับ **operation task** แล้ว rollup → batch → WO.
- 1 WO มีหลาย batch ; 1 (WO,batch) มีหลาย operation task.
- **โปรเจกต์นี้ control 1 operation task = 1 WOC** (module กลางรองรับหลายใบ/partial แต่โปรเจกต์นี้ไม่ใช้) → ใช้ในการตั้ง severity gate ได้.

## 3. Checkpoints (เกณฑ์ + record/field จริง)

| # | Checkpoint (TH / EN) | Source record/field | เกณฑ์ "ครบ" (✓) | เงื่อนไข error (✕) | เงื่อนไข รอ (◷) |
|---|---|---|---|---|---|
| 1 | อนุมัติ / Approve | WO body `custbody_apc_document_approval_status` | = `2` (approved) | — | ≠ 2 = ◷ |
| 2 | ปล่อยผลิต / Release | `customrecord_mfg_releasedwobatch.custrecord_mfg_released_status` (ref WO `custrecord_mfg_released_refwo`) | = `2` (Released to Production) | — | ยังไม่ release = ◷ (ต้องอนุมัติก่อนถึง release) |
| 3 | ป้อนวัตถุดิบ / Feed Mat | `inventoryadjustment`; header `custbody_thl_adjustmenttype` → `customrecord_thl_adjustmenttype.custrecord_adjt_mfgrawmaterial='T'`; line `custcol_mfg2_ref_workorder`(WO), `custcol_mfg_line_tmref`(task) | **item ทุกตัวใน BOM ของ WO ถูก feed** (match by item id, **ไม่สนจำนวน**) | — | BOM item ขาดบางตัว = ◷ |
| 4 | เครื่องจักร / Machine | WOC `custbody_mfg_machine`, `custbody_mfg_machinetime`; child `customrecord_mfg_mac_down_reason_comp` (ref WOC `custrecord_mfg_parent_com_mac_down`): `custrecord_mfg_com_mac_start/_end/_totaltime`; ถ้ามี `custrecord_mfg_com_mac_down_reason` → ต้องมี `_mac_startdown`,`_mac_enddown`,`_mac_down_min` | มีค่าครบ + `machinetime = _mac_totaltime` + (down → down times ครบ) | gate ผ่าน (มี WOC) แต่ขาด/ไม่ตรง = ✕ | ยังไม่มี WOC = ◷/– |
| 5 | แรงงาน / Labor | WOC `custbody_mfg_labor_group`*, `custbody_mfg_labortime`, `custbody_mfg_woc_totallbtimecal`; child `customrecord_mfg_com_labor_cost`: `custrecord_mfg_com_laborquantity/_labor_starttime/_labor_endtime` | มีค่าครบ + `woc_totallbtimecal = Σ(labor child)` | gate ผ่านแต่ขาด/ไม่ตรง = ✕ | ยังไม่มี WOC = ◷/– |
| 6 | เวลา / Time | WOC `custbody_mfg_com_start_date_time`, `custbody_mfg_com_end_date_time`, `custbody_mfg_total_minute` | `total_minute = end − start` | gate ผ่านแต่ไม่ตรง = ✕ | ยังไม่มี WOC = ◷/– |
| 7 | ปิดงานผลิต / WOC | (3 layers ด้านล่าง) | ทั้ง 3 layer ผ่าน | **L3 ไม่ตรง = ✕** | L2 ยังไม่ถึง pro_qty = ◷ |
| 8 | สร้างต้นทุน / Cost Gen | `customtransaction_mfg2_woc_costallocatio`; line `custcol_mfg2_ref_workorder`(WO), `custcol_mfg2_ref_workordercompletion`(WOC) | มี cost allocation ผูก WOC (**existence-only** เฟส 1) | gate ผ่านแต่ไม่มี = ✕ | ยังไม่มี WOC = ◷/– |
| 9 | ตั้งค่าต้นทุนมาตรฐาน / Std Cost Setup | ดูรายละเอียด §3a ด้านล่าง | cost ref พบ+ใช้ค่าตรง **หรือ** fallback OH+MC+Labor ครบ | ไม่มี setup เลย = ✕ | – |

\* `custbody_mfg_labor_group` / `custbody_mfg_machine` (กลุ่ม) ถูกกำหนดตั้งแต่ release (เป็น plan) — **ไม่ reconcile group match** (false positive). ตัวชี้ "input แล้ว" = actual time/qty + child records.

### WOC 3 layers (checkpoint 7)
1. **Lot&Pallet (WO-grain):** `SUM(customrecord_mfg_lot_pallet_info.custrecord_mfg_lpi_qty)` ≥ `WO.custbody_mfg_qty_produce_back_order`
2. **Task complete:** `custrecord_mfg_tm_good_qty + _scrap_qty + _rework_qty + _move_qty` ≥ `custrecord_mfg_tm_pro_qty` (น้อยกว่า = ◷ monitor)
3. **WOC = task (data integrity):** `SUM`(over **all WOC of the task**, `GROUP BY task`) ของ `custbody_mfg_woc_good_qty + custbody_mfg_woc_scrap_qty + custbody_mfg_rework_qty + custbody_mfg_woc_move_qty` **= ** ผลรวมใน `customrecord_mfg_task_management`. ไม่ตรง = ✕.

> ⚠️ field naming ไม่สม่ำเสมอ: layer-3 ใช้ `custbody_mfg_rework_qty` (ไม่มี `woc`) ขณะที่ตัวอื่นมี `woc`. ยืนยันชื่อจริงใน account ก่อนเขียน query.

### §3a — Checkpoint 9: Standard Cost Setup (ตั้งค่าต้นทุนมาตรฐาน)

**Grain:** operation task (rollup → batch → WO เหมือน checkpoint อื่น)  
**Key fields จาก task:** work center = `customrecord_mfg_task_management.custrecord_mfg_tm_wc`  
**Key field จาก WO:** FG item = `workorder.assemblyitem`

#### Logic (priority 1 → fallback)

```
Step 1: หา customrecord_mfg_costref_setup ที่ตรง:
    custrecord_mfg_costref_setup_subsidiary = WO subsidiary
    WO trandate BETWEEN custrecord_mfg_costref_setup_startdate AND custrecord_mfg_costref_setup_enddate

Step 2: หา customrecord_mfg_cost_ref row ที่ตรง:
    custrecord_mfg_cost_refparent → header จาก Step 1
    custrecord_item_ref = workorder.assemblyitem
    custrecord_workcenter = custrecord_mfg_tm_wc (work center ของ task)

ถ้าพบ cost ref row + custrecord_mfg_cost_ref_option = "Using Cost from Record"
    → ✓  (cost อยู่ในตัว record)

ถ้าพบ cost ref row + custrecord_mfg_cost_ref_option = "Calculate Cost from Set Up Rate"
    → ไป Fallback check

ถ้าไม่พบ cost ref row เลย
    → ไป Fallback check
```

#### Fallback check — ต้องผ่านครบ 3 รายการ:

| รายการ | Header record | เงื่อนไข header | Detail record | Key เช็ค |
|---|---|---|---|---|
| **OH (Dept Cost)** | `customrecord_mfg_opr_std_cost_rate` | subsidiary + WO type + date range คลุม WO trandate | `customrecord_mfg_opr_std_cost_dept_rate` | `custrecord_mfg_opr_dept_list` = `custrecord_mfg_tm_wc` |
| **MC (Machine Cost)** | `customrecord_mfg_opr_std_cost_rate` (header เดียวกับ OH) | เดียวกัน | `customrecord_mfg_opr_std_cost_mach_rate` | `custrecord__mfg_opr_mac_list` → machine → `custrecord_mfg_mac_mac_group` ตรงกับ machine group ของ task (จาก `customrecord_mfg_mac_down_reason_comp.custrecord_mfg_com_mac_machine.custrecord_mfg_mac_mac_group`) |
| **Labor** | `customrecord_mfg_employee_labor_cost` | subsidiary + date range คลุม WO trandate | `customrecord_mfg_emplabor_cost_rate` | `custrecord_mfg_emplaborgroup` + `custrecord_mfg_employee_list` ตรงกับ labor ของ task (จาก `customrecord_mfg_com_labor_cost`: `custrecord_mfg_com_lb_laborgroup`, `custrecord_mfg_com_labor_name`) |

ครบ 3 → ✓ / ขาดอันใดอันหนึ่ง → ✕

#### Master data records (doc reference เท่านั้น — ไม่ query โดยตรงใน checkpoint นี้)

```
customrecord_mfg_opr_std_cost_rate  (header: subsidiary, date from-to, WO type)
  ├─ customrecord_mfg_opr_std_cost_formula    (OH category + allocation method)
  ├─ customrecord_mfg_opr_std_cost_dept_rate  (dept → custrecord_mfg_dept_fixed/variable/facility_cost)
  │      parent link: custrecord_mfg_parent_mfg_opr_std_cost
  └─ customrecord_mfg_opr_std_cost_mach_rate  (machine → custrecord_mfg_mac_fixed/variable_cost)
         parent link: custrecord_mfg_parent_mfg_opr_std_cost_m

customrecord_mfg_employee_labor_cost  (header: subsidiary = custrecord_mfg_employeesetupratesub, date range)
  └─ customrecord_mfg_emplabor_cost_rate  (employee, labor group, hiring type, run rate, normal rate)
         parent link: custrecord_mfg_employee_labor_cost_par

customrecord_mfg_costref_setup  (header: subsidiary = custrecord_mfg_costref_setup_subsidiary, date range)
  └─ customrecord_mfg_cost_ref  (item, work center, OH/MC/labor cost, std time, indirect cost)
         parent link: custrecord_mfg_cost_refparent
         key fields: custrecord_item_ref, custrecord_workcenter
         option: custrecord_mfg_cost_ref_option ("Using Cost from Record" | "Calculate Cost from Set Up Rate")

customrecord_mfg_indirectcostsetup  (subsidiary, date range, cost calc method, allocation method, % markup)
    custrecord_mfg_indirectsubsidiary
    custrecord_mfg_indirectstartdate / custrecord_mfg_indirectenddate
    custrecord_mfg_indirectactualcosttype  (Cost Calculation Method)
    custrecord_mfg_indirectweightedby     (Cost Allocation Method)
    custrecord_mfg_indirectpercent        (% Markup from All Other Cost)
    → ใช้ใน cost calculation module ถัดไป (ไม่ได้เช็คใน WO Status checkpoint นี้)
```

#### Severity
- ✓ = cost setup พร้อม (via cost ref หรือ OH+MC+Labor rates ครบ)
- ✕ = ไม่มี setup / setup ไม่ครบ → ต้นทุนจะไม่ถูกต้อง
- – = (ไม่มีสถานะ "รอ" — เป็น master data เช็คได้ตลอด)

> ⚠️ Checkpoint 9 เป็น master data check — ไม่ขึ้นกับ WOC gate. เช็คได้ตั้งแต่ WO ถูกสร้าง. ตำแหน่งคอลัมน์ใน UI = **หลัง checkpoint 8 (สร้างต้นทุน)** เป็นคอลัมน์สุดท้าย.

## 4. Severity model (รวมศูนย์)
1 task = 1 WOC → **error gate = "มี WOC แล้ว"**:
- ยังไม่มี WOC → checkpoint 4–8 = ◷ / – (ยังไม่ถึง)
- มี WOC + task qty ครบ (L2) + M/L/T ครบ&ตรง + มี cost allocation → ✓
- มี WOC แต่ task qty < pro_qty → ◷ (ผลิตไม่ครบ — ปกติ)
- มี WOC แต่ M/L/T ขาด/ไม่ตรง หรือ ไม่มี cost allocation → ✕
- WOC L3 sum ≠ task → ✕ (data mismatch — เด้งทันที ไม่รอครบ)

**2 ประเภท flag:** `incomplete (◷)` = lifecycle ปกติ ต้อง monitor · `mismatch/error (✕)` = ข้อมูลผิดปกติ ต้องสอบ.

WO/batch rollup = **worst-status** ของลูก + ตัวเลขมุม cell = จำนวน batch ที่มีปัญหา (โชว์เมื่อ WO มี >1 batch).

## 5. Output spec (Suitelet UI)
ดู `wo-status-tracking-mockup.html` เป็น reference ที่อนุมัติแล้ว.
- **Filters:** subsidiary · location (dropdown โชว์เฉพาะ location record ที่ `custrecord_mfg_productionplant='T'`) · WO date from–to (`transaction.trandate`, **บังคับช่วง ≤ 1 สัปดาห์**).
- **Grid:** WO-grain. คอลัมน์: WO · Location (`transaction.location`) · ไลน์ผลิต (`custbody_mfg_production_line`, WO-level) · 9 checkpoint · หมายเหตุ.
- แต่ละ cell: ✓ / ◷ / ✕ / – (4 สถานะ). Note column = **ภาษาธุรกิจ** อธิบาย "ผิดปกติตรงไหน" (ห้ามโชว์ field/record name ในหน้า user).
- **Drill-down** WO → batch → operation task (lazy-load ต่อ WO ตอนกดขยาย).
- **2 ภาษา ไทย/ENG** toggle.
- Light theme.

## 6. สถาปัตยกรรม
- **Live SuiteQL** (`N/query.runSuiteQL`) ทุกครั้งที่ค้นหา.
- **1 aggregate query ต่อ 1 checkpoint** — แต่ละตัว `GROUP BY` work order คืน ≤ ~7k WO-grain rows — แล้ว **merge ใน Suitelet ด้วย WO id**. **ห้าม** เขียน query ยักษ์ correlated ตัวเดียว.
- Aggregate ทั้งหมดใน SQL (ไม่ดึง raw line มานับใน script).
- Grid **pagination** สำหรับ ~7k rows.
- Drill-down = query แยกต่อ WO ตอน expand.
- Volume อ้างอิง: ~1,000 WO/วัน รวมทุกไลน์ (~7,000/สัปดาห์).

## 7. ลำดับงาน implement
1. **[GATE] Prototype query หนักสุดก่อน** — เขียน SuiteQL ของ checkpoint 3 (Feed Mat set-membership) และ checkpoint 7 L3 (Σ WOC group by task) รันบนข้อมูลจริงช่วง 1 สัปดาห์ใน SuiteQL console → วัด elapsed time, row-cap, governance. ถ้าไม่ไหว → ทบทวนไป snapshot (plan B) ก่อนสร้าง UI.
2. ยืนยันชื่อ field จริงใน account (โดยเฉพาะ `custbody_mfg_rework_qty` ใน WOC, และ field ทั้งหมดในตาราง §3).
3. เขียน 9 aggregate SuiteQL (1 ต่อ checkpoint) คืน WO-grain status + รายละเอียดเหตุผล.
4. Suitelet หลัก: filter form → รัน 9 query → merge by WO id → render grid + rollup + pagination.
5. Drill-down endpoint (Suitelet/RESTlet): รับ WO id → คืน batch/task detail.
6. Bilingual + business-language note mapping.
7. **Verify สูตร consistency** (เครื่อง/แรงงาน/เวลา, WOC L3) กับเคสจริงทั้ง ✓/◷/✕.

## 8. ต้องยืนยันเพิ่มก่อน/ระหว่าง build
- ชื่อ field ที่ไม่สม่ำเสมอใน WOC layer-3.
- สูตร consistency ของ M/L/T ตรงกับวิธีคำนวณจริงในระบบ.
- เกณฑ์ pagination / default page size.
- Role/permission & ตำแหน่งติดตั้ง Suitelet (center tab/menu).

---
*Decisions & data model ฉบับเต็มอยู่ใน Claude memory: `wo-status-tracking-data-model.md`.*
