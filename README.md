# WO Status Tracking — Foodstar / TEIBTO NetSuite

---

## ภาพรวม (Overview)

- **ติดตามสถานะ Work Order ทีละขั้นตอน** (CP1–CP8) ตั้งแต่ Approval ไปจนถึง Completion โดยแสดงผลเป็นตาราง พร้อม status icon ✓ / ◷ / ✕
- **Drilldown ระดับ Batch และ Operation Task** — คลิกที่แถว WO เพื่อขยายดูรายละเอียด Batch, Labor, Machine, Material
- **ตรวจความสม่ำเสมอของข้อมูล (Consistency Check)** — เปรียบเทียบ header กับ child records (WOC machine time vs. detail, labor qty vs. header, feed material vs. BOM) แล้วแจ้งเตือนเฉพาะรายการที่ไม่ตรง

---

## โครงสร้างไฟล์ (File Structure)

```
WO_Status_tracking/
├── src/
│   ├── WOStatusTracking.js            # Main Suitelet (entry point, renders form + results)
│   ├── WOStatusTracking_Queries.js    # Query module — SuiteQL queries CP1–CP8
│   ├── WOStatusTracking_Labels.js     # i18n module — bilingual UI strings (th/en)
│   └── WOStatusTracking_Drilldown.js  # Drilldown module — batch/task HTML rows
├── deploy/
│   ├── manifest.xml                   # SDF project manifest
│   ├── Objects/
│   │   └── customscript_wo_status_tracking.xml  # SDF Script + Deployment object
│   └── FileCabinet/
│       └── SuiteScripts/Foodstar/WO_Status_tracking/
│           └── .attributes            # SDF File Cabinet folder registration
├── prototype/
│   ├── test_cp03_feedmat.sql          # SuiteQL performance test — CP3 feed material
│   └── test_cp07_woc_l3.sql           # SuiteQL performance test — CP7 WOC L3
└── README.md
```

---

## การติดตั้ง (Installation)

### Step 1 — อัปโหลดไฟล์ไปที่ File Cabinet

อัปโหลดไฟล์ทั้ง 4 ใน `src/` ไปที่ File Cabinet ตาม path นี้:

```
/SuiteScripts/Foodstar/WO_Status_tracking/WOStatusTracking.js
/SuiteScripts/Foodstar/WO_Status_tracking/WOStatusTracking_Queries.js
/SuiteScripts/Foodstar/WO_Status_tracking/WOStatusTracking_Labels.js
/SuiteScripts/Foodstar/WO_Status_tracking/WOStatusTracking_Drilldown.js
```

> วิธี: ไปที่ Documents > Files > File Cabinet > SuiteScripts > Foodstar > สร้างโฟลเดอร์ `WO_Status_tracking` แล้ว upload ทีละไฟล์

### Step 2 — สร้าง Script Record

**วิธีที่ 1 — ผ่าน UI (แนะนำสำหรับ initial deploy):**

1. ไปที่ Setup > Customization > Scripts > New
2. เลือกไฟล์ `WOStatusTracking.js` จาก File Cabinet
3. NetSuite จะตรวจ `@NScriptType Suitelet` และสร้าง Script record อัตโนมัติ
4. กรอก Name: `WO Status Tracking`, Script ID: `customscript_wo_status_tracking`
5. บันทึก

**วิธีที่ 2 — ผ่าน SDF (สำหรับ CI/CD หรือ migration):**

```
suitecloud project:deploy
```

ไฟล์ `deploy/Objects/customscript_wo_status_tracking.xml` และ `deploy/manifest.xml` จะถูก deploy พร้อมกัน

> หมายเหตุ: SDF deployment ยังต้องการ `deploy.xml` (project deploy file) ซึ่งไม่ได้รวมอยู่ใน repo นี้ สร้างได้ด้วย `suitecloud project:create` หรือสร้างด้วยมือตาม SuiteCloud documentation

### Step 3 — ตั้งค่า Script Deployment

หลังสร้าง Script record แล้ว:

1. คลิก Deployments tab > เลือก deployment `customdeploy_wo_status_tracking`
2. ตั้ง Status = **Released**, Log Level = **Debug** (ระหว่าง UAT)
3. เลือก **Subsidiaries** ที่ต้องการ (Foodstar subsidiaries ที่ใช้ Manufacturing)
4. เลือก **Roles** ที่ต้องการ — ปรึกษา admin ก่อน; อย่า set `allemployees = T` ใน production
5. บันทึก และ copy URL ของ Suitelet ไว้ใช้งาน

### Step 4 — ก่อน Go-Live: ทดสอบ Performance

รันไฟล์ใน `prototype/` ใน SuiteQL console (Setup > SuiteQL) เพื่อตรวจ elapsed time:

```sql
-- prototype/test_cp03_feedmat.sql
-- prototype/test_cp07_woc_l3.sql
```

เป้าหมาย: elapsed < 5 วินาที ต่อ query  
ถ้าเกิน: เพิ่ม index hint หรือ limit date range ใน filter ก่อน deploy

---

## GATE Checklist ก่อน Go-Live

ตรวจทุกข้อก่อน go-live ในทุก environment:

- [x] รัน `prototype/test_cp03_feedmat.sql` ใน SuiteQL console — ✅ passed 2026-06-14 (UAT data — volume ยังน้อยกว่า production จริง ต้อง re-test หลัง go-live)
- [x] รัน `prototype/test_cp07_woc_l3.sql` ใน SuiteQL console — ✅ passed 2026-06-14 (UAT data — volume ยังน้อยกว่า production จริง ต้อง re-test หลัง go-live)
- [x] ยืนยัน `custbody_mfg_rework_qty` (ใน WOC) ตรงกับชื่อ field จริงใน account — ✅ confirmed 2026-06-14
- [x] ยืนยัน parent ref field name บน `customrecord_mfg_com_labor_cost` — ✅ confirmed 2026-06-14: field คือ `custrecord_mfg_com_labor_cost` (code ถูกต้องแล้ว)
- [x] ตรวจ `FROM workordercompletion` — ✅ confirmed 2026-06-14: ใช้งานได้ใน SuiteQL ไม่ error
- [ ] Verify consistency formulas กับ WO ที่รู้ว่าถูกต้อง (เปรียบเทียบผลจาก Suitelet กับข้อมูลจริงใน account อย่างน้อย 3 WO)

---

## Known Limitations (Phase 1)

- **ไม่มี Export** — ไม่สามารถ download ผลลัพธ์เป็น CSV/Excel ได้ (planned Phase 2)
- **ไม่มี Idle-WO Detection** — WO ที่ค้างอยู่ระหว่าง step โดยไม่มี activity จะไม่ถูก flag โดยอัตโนมัติ
- **ไม่มี Error-only Filter** — ไม่สามารถ filter เฉพาะ WO ที่มีปัญหาได้จาก UI (ต้อง scroll หาเอง)
- **Drilldown เป็น Lazy-Load** — ต้องคลิก expand ทีละ WO; ไม่มี expand-all
- **Role filter ยังไม่ได้ตั้งค่า** — deployment object ยังไม่ได้ระบุ role internal IDs (ต้องตั้งหลัง consult admin)

---

## Field Names to Verify

ตาราง field ที่ marked TODO ใน source code — ต้องยืนยันกับ account จริงก่อน go-live:

| Field / Record | ไฟล์ | บรรทัด | หมายเหตุ |
|---|---|---|---|
| ~~`custbody_mfg_rework_qty` บน WOC~~ | `WOStatusTracking_Queries.js` | 640 | ✅ **ยืนยันแล้ว 2026-06-14** — field name ถูกต้อง (ไม่มี infix 'woc') |
| ~~`custbody_mfg_rework_qty` บน WOC~~ | `WOStatusTracking_Drilldown.js` | 156 | ✅ **ยืนยันแล้ว 2026-06-14** |
| ~~`custrecord_mfg_com_labor_cost_parent`~~ → `custrecord_mfg_com_labor_cost` | `WOStatusTracking_Queries.js` | 512, 515 | ✅ **ยืนยันแล้ว 2026-06-14** — field จริงคือ `custrecord_mfg_com_labor_cost`; code ถูกต้องอยู่แล้ว |
