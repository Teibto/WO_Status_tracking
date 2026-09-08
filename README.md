# WO Status Tracking — Foodstar / TEIBTO NetSuite

---

## ภาพรวม (Overview)

- **ติดตามสถานะ Work Order ทีละขั้นตอน** (CP1–CP8) ตั้งแต่ Approval ไปจนถึง Completion โดยแสดงผลเป็นตาราง พร้อม status icon ✓ / ◷ / ✕
- **Drilldown ระดับ Batch และ Operation Task** — คลิกที่แถว WO เพื่อขยายดูรายละเอียด Batch, Labor, Machine, Material
- **ตรวจความสม่ำเสมอของข้อมูล (Consistency Check)** — เปรียบเทียบ header กับ child records (WOC machine time vs. detail, labor qty vs. header, feed material vs. BOM) แล้วแจ้งเตือนเฉพาะรายการที่ไม่ตรง

---

## โครงสร้างไฟล์

```
WO_Status_tracking/
├── project.json                    SDF — ชี้บัญชี 9751184_SB1 (sandbox) และให้คงไว้แบบนั้น
├── suitecloud.config.js
├── package.json                    มีแค่ scripts.test ไม่มี dependency
├── src/
│   ├── deploy.xml                  รายการที่ deploy
│   ├── manifest.xml
│   ├── Objects/
│   │   ├── customscript_fs_wo_cost_trace.xml
│   │   └── customscript_wo_status_tracking.xml
│   └── FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking/     ← source ที่ deploy จริง
│       ├── WOReportTheme.js                lib — design token + คลาสของ template (#18)
│       ├── WOCostTrace_Common.js           lib — helper · SQL runner · query log (#13)
│       ├── WOCostTrace_Ready.js            lib — ชั้นความพร้อม master (#14)
│       ├── WOCostTrace.js                  entry — WO Cost Trace (ภาพรวม + เจาะลึก)
│       ├── WOStatusTracking.js             entry — WO Status Tracking
│       ├── WOStatusTracking_Queries.js
│       ├── WOStatusTracking_Labels.js
│       ├── WOStatusTracking_Drilldown.js
│       └── .attributes/
├── scripts/
│   ├── check-prod-staging.js       ตรวจ payload production 8 ข้อ — `npm run check:prod` (#12)
│   └── lib/sdf_payload.js          ตัวอ่าน SDF project ใช้ร่วมกับเทส
├── qa/make_theme_preview.js        สร้างหน้าตัวอย่าง style ดูเทียบสายตา (#18)
├── test/                           node ล้วน ไม่มี framework — `npm test`
├── prototype/                      ไฟล์ทดสอบ SuiteQL + ไฟล์เจาะมือของผู้ใช้
├── WO_COST_TRACE.md                เอกสารของ WO Cost Trace (ที่มาของทุกตัวเลขที่ verify แล้ว)
├── REPORT_STYLE.md                 style ยึดจากไหน + แผนฝังเข้าเมนู report-builder (#18)
└── IMPLEMENTATION_PLAN.md
```

repo นี้มี **2 Suitelet**

| Suitelet | scriptid | ผู้ใช้หลัก |
|---|---|---|
| WO Status Tracking | `customscript_wo_status_tracking` | Operation — ติดตามว่าใบสั่งผลิตไปถึงขั้นไหน |
| WO Cost Trace | `customscript_fs_wo_cost_trace` | Costing — พิสูจน์ที่มาของต้นทุน · ดู `WO_COST_TRACE.md` |

## การแก้โค้ดและ deploy

> **source ที่ deploy จริงมีที่เดียว: `src/FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking/`**
> อย่าอัปโหลดไฟล์ผ่านหน้า UI ของ NetSuite และอย่าคัดลอกไฟล์ไปไว้ที่อื่นใน repo —
> สำเนาที่ราก `src/` เคยมีอยู่และทำให้คนอัปโหลดชุดเก่าทับของที่รันอยู่ (issue #9 ลบออกแล้ว)
> · `npm test` มีด่านกันไฟล์สำเนากลับเข้ามา

```bash
npm test                                  # ต้องผ่านก่อนทุกครั้ง
suitecloud project:validate               # ทุกหมวดต้อง Success
suitecloud project:deploy --dryrun        # อ่านรายชื่อ path ที่จะอัป ต้องตรงกับที่ตั้งใจ
suitecloud project:deploy                 # ลง SB1 ตาม project.json
```

### ⚠ กฎอัปทีละไฟล์ — dependency ก่อน entry เสมอ

File Cabinet **ไม่มีการอัปหลายไฟล์แบบ atomic** · อัป entry ที่ `define` ชื่อ lib ไว้
โดยที่ lib ยังไม่ขึ้น = Suitelet **ตายทุก request** ด้วย `MODULE_DOES_NOT_EXIST`
จนกว่าจะอัปครบ (repo พี่น้อง `Pre-Work_Order_Completion` เจอมาแล้ว)

ลำดับที่ปลอดภัยของ WO Cost Trace

```bash
# 1. lib ก่อน — ยิงพร้อมกันในคำสั่งเดียวได้
suitecloud file:upload   --paths "/SuiteScripts/Foodstar/WO_Status_tracking/WOReportTheme.js"           "/SuiteScripts/Foodstar/WO_Status_tracking/WOCostTrace_Common.js"           "/SuiteScripts/Foodstar/WO_Status_tracking/WOCostTrace_Ready.js"

# 2. entry ทีหลัง
suitecloud file:upload --paths "/SuiteScripts/Foodstar/WO_Status_tracking/WOCostTrace.js"
```

แก้เฉพาะไฟล์ lib ตัวเดียวอัปตัวเดียวได้ · แก้ entry ด้วยต้องอัป lib ก่อนทุกครั้ง
· `project:deploy` ยิงทั้งชุดในรอบเดียวจึงไม่มีปัญหานี้ แต่มันแตะ object ด้วย (ดูข้อถัดไป)

`src/deploy.xml` เรียง `<files>` ตามลำดับนี้ไว้แล้วเพื่อให้อ่านแล้วเห็นลำดับ
· `npm test` มีด่านตรวจ **dependency closure** — ไฟล์ที่ entry เรียกแต่ไม่อยู่ใน `deploy.xml`
ทำให้เทสตกทันที

### ขึ้น production

> **ห้าม deploy production จาก repo นี้โดยตรง** แม้จะระบุ path ใน `deploy.xml` ตรงตัวแล้ว —
> การสลับ `project.json` ไปบัญชีจริงยังทำให้ทับไฟล์ของ WO Status Tracking ที่ยังไม่ได้เทียบเนื้อหาได้

production ใช้ payload แยกที่ `Foodstar/.deploy-staging/wo-trace-prod/` ซึ่งมี `project.json`
ของตัวเองชี้บัญชี `9751184` · ขั้นตอนและวิธีอ่านผล dry-run อยู่ใน README ของโฟลเดอร์นั้น

### ค่าที่ต่างกันรายบัญชี — ห้าม deploy ทับโดยไม่รู้ตัว

ตรวจ 2026-09-08 ด้วย `suitecloud object:import` ลง scratch project (อ่านอย่างเดียว ไม่แตะ `src/`)

`customscript_wo_status_tracking` — deployment ค่าไม่ตรงกันสามช่อง **และสองบัญชีก็ไม่ตรงกันเอง**

| ช่อง | repo (`src/Objects`) | SB1 | production |
|---|---|---|---|
| `runasrole` | ไม่มีในไฟล์ | `ADMINISTRATOR` | ว่าง |
| `audslctrole` | ไม่มีในไฟล์ | `ONLINE_FORM_USER` | ว่าง |
| `isonline` | ไม่มีในไฟล์ | `T` | `F` |
| `loglevel` | `DEBUG` | `DEBUG` | `DEBUG` |

→ deploy object นี้จาก repo ลง SB1 จะ**ถอด `runasrole` ทิ้ง** ทำให้ Suitelet เลิกรันเป็น administrator
· ก่อนจะแตะ object นี้ต้องตัดสินก่อนว่าจะยึดค่าของบัญชีไหน (ยังไม่ตัดสิน — issue #15)

`customscript_fs_wo_cost_trace` — `loglevel` เป็น `DEBUG` ใน repo/SB1 แต่ `ERROR` บน production
ค่าของ production อยู่ใน staging payload เท่านั้น

⚠ `WOStatusTracking*.js` บน **production ยังไม่ได้ reconcile ครบ** — `WOStatusTracking.js`
ตรงกับ repo ทุกไบต์ทั้ง SB1 และ production (ตรวจ 2026-09-08) เหลืออีก 3 ไฟล์ที่ยังไม่ได้เทียบ

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
