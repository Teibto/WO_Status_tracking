# WO Status Tracking — Foodstar / TEIBTO NetSuite

เอกสารนี้สำหรับคนที่จะแก้โค้ดหรือ deploy รายงานสองใบใน repo นี้
อ่านแล้วตอบได้ว่า แก้ไฟล์ไหน · ขึ้น sandbox ยังไง · ขึ้น production ยังไง · อะไรห้ามทำ

---

## รายงานสองใบในนี้

| รายงาน | scriptid | ผู้ใช้หลัก | ตอบคำถามอะไร |
|---|---|---|---|
| WO Status Tracking | `customscript_wo_status_tracking` | Operation | ใบสั่งผลิตเดินไปถึงขั้นไหน · ขั้นไหนข้อมูลไม่ตรงกัน |
| WO Cost Trace | `customscript_fs_wo_cost_trace` | Costing | ต้นทุนใบสั่งผลิตมาจากไหน · อ้างเอกสารใบไหน |

**WO Status Tracking** ติดตาม CP1–CP8 เป็นตารางพร้อม status icon ✓ / ◷ / ✕ ·
กดขยายดูราย batch และ operation task · เทียบ header กับ child record
(เวลาเครื่องจักรบน WOC เทียบรายละเอียด · ปริมาณแรงงานเทียบ header · วัตถุดิบที่ป้อนเทียบ BOM)
แล้วเตือนเฉพาะรายการที่ไม่ตรง

กรองได้ด้วย WO/Batch/Order Sheet · บริษัท · สถานที่ผลิต · **ประเภทย่อยสินค้า**
(`cseg_subitemtype` เป็น custom segment บน item) · ช่วงวันที่ผลิต ซึ่งกรอกเป็น `dd/mm/yyyy`

**WO Cost Trace** มี **3 ชั้น อยู่ใน URL เดียวกัน คนละพารามิเตอร์**

| ชั้น | พารามิเตอร์ | ใช้เมื่อ |
|---|---|---|
| ภาพรวม | ไม่ต้องส่งอะไร | ดูหลายสินค้าหลายใบสั่งผลิตพร้อมกัน · export Excel เอาไป pivot ต่อได้ |
| เจาะลึก | `&wo=WOFSC00000470` | ไล่ที่มาของทุกตัวเลขจนถึงเอกสารต้นทาง (19 query) |
| ความพร้อม master | `&ready=<เลขที่ WO หรือรหัสสินค้า>` | ก่อนเริ่มทดสอบ — master ที่ต้องใช้ตั้งครบหรือยัง |

ทั้งสองใบรับ `&embed=1` = ไม่วาดแถบหัวเรื่องของตัวเอง สำหรับฝังในหน้าอื่น ·
ที่มาของตัวเลขทุกช่องอยู่ใน [`apps/wo-cost-trace/WO_COST_TRACE.md`](./apps/wo-cost-trace/WO_COST_TRACE.md) ·
กติกาเรื่องหน้าตาและ style อยู่ใน [`shared/REPORT_STYLE.md`](./shared/REPORT_STYLE.md)

## โครงสร้างไฟล์

**สองรายงาน = สอง SDF project แยกกัน · deploy คนละชุด** (epic #37) ·
ของที่ใช้ร่วมกันมีอย่างเดียวคือ CSS/theme ซึ่งมีต้นฉบับที่ `shared/`

```
WO_Status_tracking/
├── package.json                    ไม่มี dependency — มีแค่ scripts
├── apps/
│   ├── wo-cost-trace/                          ← SDF project ของ WO Cost Trace
│   │   ├── project.json                        ชี้บัญชี 9751184_SB1 (sandbox) และให้คงไว้แบบนั้น
│   │   ├── suitecloud.config.js
│   │   ├── src/deploy.xml                      ชุดที่ deploy — ระบุตรงตัว ไม่ใช้ wildcard
│   │   ├── src/manifest.xml
│   │   ├── src/Objects/customscript_fs_wo_cost_trace.xml
│   │   ├── src/FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking/
│   │   │   ├── WOReportTheme.js                ก๊อปจาก shared/ — ห้ามแก้ที่นี่
│   │   │   ├── WOCostTrace_Common.js           lib · helper · SQL runner · query log · โครงหน้า
│   │   │   ├── WOCostTrace_Ready.js            lib · ชั้นความพร้อม master
│   │   │   └── WOCostTrace.js                  entry · ภาพรวม + เจาะลึก + ความพร้อม
│   │   ├── test/                               6 ไฟล์ — `npm run test:trace`
│   │   ├── scripts/check-prod-staging.js       ตรวจ payload production 8 ข้อ
│   │   ├── WO_COST_TRACE.md                    ที่มาของทุกตัวเลขที่ verify กับบัญชีแล้ว
│   │   └── prototype/                          ไฟล์เจาะมือของผู้ใช้ (ต้นเรื่องของรายงานนี้)
│   └── wo-status/                              ← SDF project ของ WO Status Tracking
│       ├── project.json · suitecloud.config.js · src/{deploy,manifest}.xml
│       ├── src/Objects/customscript_wo_status_tracking.xml
│       ├── src/FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking/
│       │   ├── WOReportTheme.js                ก๊อปจาก shared/ — ห้ามแก้ที่นี่
│       │   ├── WOStatusTracking.js             entry
│       │   ├── WOStatusTracking_Queries.js     lib · SuiteQL ของ CP1–CP9
│       │   ├── WOStatusTracking_Labels.js      lib · ข้อความและ i18n
│       │   └── WOStatusTracking_Drilldown.js   lib · แถว batch และ task
│       ├── test/                               2 ไฟล์ — `npm run test:status`
│       ├── IMPLEMENTATION_PLAN.md              แผนที่ส่งมอบให้ dev รอบแรก (ประวัติ)
│       ├── wo-status-tracking-mockup.html      mockup ที่ผู้ใช้อนุมัติ (reference หน้าตา)
│       └── prototype/                          SuiteQL ที่ใช้พิสูจน์ CP3 · CP7
├── shared/
│   ├── WOReportTheme.js            **ต้นฉบับ** design token + คลาสของ report-builder
│   ├── sync-theme.js               ก๊อปต้นฉบับลงทั้งสองแอป (`npm run sync:theme`)
│   ├── REPORT_STYLE.md             style ยึดจากไหน + แผนฝังเข้าเมนู report-builder
│   ├── lib/sdf_payload.js          ตัวอ่านโครง SDF ที่เทสและตัวตรวจใช้ร่วมกัน
│   └── qa/make_theme_preview.js    หน้าตัวอย่าง style ดูเทียบสายตาโดยไม่ต้อง deploy (พัง — #43)
└── test/                           ชุดข้ามแอป — `npm run test:shared`
    ├── lib/                        harness + fixture ที่ทั้งสองแอปใช้
    ├── test_repo_guard.js · test_deploy_manifest.js
    └── test_theme.js · test_theme_sync.js
```

**ที่อยู่บน File Cabinet ยังเป็นโฟลเดอร์เดียวกันทั้งสองแอป**
(`/SuiteScripts/Foodstar/WO_Status_tracking/`) โดยตั้งใจ — แยกแค่ในฝั่ง repo ทำให้ไม่ต้องย้าย
ไฟล์บนบัญชี ไม่ต้องแก้ `<scriptfile>` และไม่กระทบ production ที่ใช้งานอยู่ตั้งแต่ 2026-09-03 ·
โฟลเดอร์ร่วมกันได้เพราะ `deploy.xml` ของแต่ละแอประบุไฟล์ตรงตัว และ `npm test` มีด่านห้ามระบุข้ามแอป

**CSS/theme แก้ที่ `shared/WOReportTheme.js` ที่เดียว** แล้วรัน `npm run sync:theme` ·
ไฟล์ชื่อเดียวกันในสองแอปเป็นก๊อปที่เครื่องมือสร้าง เพื่อให้ deploy ของสองแอปไม่ผูกกัน ·
แก้ก๊อปด้วยมือแล้ว `npm test` แดงทันที (`test_theme_sync.js`)

## แก้โค้ดแล้วขึ้น SB1

> **source ที่ deploy จริงอยู่ใน `apps/<แอป>/src/FileCabinet/SuiteScripts/Foodstar/WO_Status_tracking/`**
> อย่าอัปโหลดไฟล์ผ่านหน้า UI ของ NetSuite และอย่าคัดลอกไฟล์ไปไว้ที่อื่นใน repo ·
> สำเนาที่ราก `src/` เคยมีอยู่และทำให้คนอัปโหลดชุดเก่าทับของที่รันอยู่ (ลบแล้วที่ issue #9) ·
> `npm test` มีด่านกันสำเนากลับเข้ามาและกันไฟล์หลงข้ามแอป

**คำสั่ง `suitecloud` ต้องรันจากไดเรกทอรีของแอป** — รากไม่มี `project.json` แล้วโดยตั้งใจ
เพื่อบังคับให้เลือกก่อนว่ากำลังทำงานกับแอปไหน

```bash
npm test                                   # ทุกด่าน ต้องผ่านก่อนทุกครั้ง
cd apps/wo-cost-trace                      # หรือ apps/wo-status
suitecloud project:validate                # local validation — warning เดิม 2 ข้อต่อ object
suitecloud project:deploy --dryrun         # อ่านรายชื่อที่จะขึ้น ต้องตรงกับที่ตั้งใจ
```

### ⚠ อย่าใช้ `project:deploy` กับ SB1 ตอนนี้

`project:deploy` แตะ **object** ด้วย และ object `customscript_wo_status_tracking` ของ repo
**ไม่มี `runasrole`** ขณะที่บน SB1 ตั้งเป็น `ADMINISTRATOR` ไว้ · deploy จาก repo
จะถอดค่านั้นทิ้ง = Suitelet เลิกรันเป็น administrator (ยังไม่ตัดสินว่าจะยึดค่าไหน — issue #24)

ระหว่างนี้อัปเฉพาะไฟล์

```bash
suitecloud file:upload --paths "/SuiteScripts/Foodstar/WO_Status_tracking/WOCostTrace_Common.js"
```

### กฎ dependency-first / entry-last

File Cabinet **ไม่มีการอัปหลายไฟล์แบบ atomic** · อัป entry ที่ `define` ชื่อ lib ไว้
โดยที่ lib ยังไม่ขึ้น = Suitelet **ตายทุก request** ด้วย `MODULE_DOES_NOT_EXIST` จนกว่าจะอัปครบ
(repo พี่น้อง `Pre-Work_Order_Completion` เจอมาแล้วจนต้องตั้งกฎห้าม single-file upload)

แก้ entry ด้วย ต้องอัป lib ให้ครบก่อน

```bash
# 1. lib ก่อน — ใส่ได้หลาย path ในคำสั่งเดียว
suitecloud file:upload \
  --paths "/SuiteScripts/Foodstar/WO_Status_tracking/WOReportTheme.js" \
          "/SuiteScripts/Foodstar/WO_Status_tracking/WOCostTrace_Common.js" \
          "/SuiteScripts/Foodstar/WO_Status_tracking/WOCostTrace_Ready.js"

# 2. entry ทีหลัง
suitecloud file:upload --paths "/SuiteScripts/Foodstar/WO_Status_tracking/WOCostTrace.js"
```

`apps/<แอป>/src/deploy.xml` เรียง `<files>` ตามลำดับนี้ไว้แล้ว · `npm test` มีด่านตรวจ
**dependency closure** — ไฟล์ที่ entry เรียกแต่ไม่อยู่ใน `deploy.xml` ทำให้เทสตกทันที

### วิธีอ่านผล dry-run ให้ถูก

```
Upload file -- ~/FileCabinet/.../WOCostTrace.js      ← ฝั่งไฟล์
Update object -- customscript_fs_wo_cost_trace       ← ฝั่ง object
```

| ฝั่ง | อ่านว่าอะไร |
|---|---|
| ไฟล์ | **ทุก path ที่โผล่ = ไฟล์ที่เนื้อหาต่างจากบนบัญชีและกำลังจะถูกทับ** · ไม่โผล่เลย = ตรงกันแล้ว ไม่ใช่ผิดพลาด |
| object | `Create` เมื่อยังไม่มีบนบัญชี · `Update` เมื่อมีแล้ว · 1 object xml ให้ 2 บรรทัด (suitelet + scriptdeployment) |

**บรรทัดไฟล์ไม่ใช่รายการทั้ง payload** เป็นเฉพาะไฟล์ที่ต่าง · path ที่ไม่ได้ตั้งใจโผล่ =
payload กว้างเกิน หรือของบนบัญชีถูกแก้มาโดยไม่ผ่าน repo

## ขึ้น production

> **ห้าม deploy production จาก repo นี้โดยตรง** แม้ `deploy.xml` จะระบุ path ตรงตัวแล้ว ·
> list กันได้แค่ "ยิงกว้างเกิน" ไม่ได้กัน "ยิงผิดบัญชี" — คนที่สลับ `project.json`
> ไปบัญชีจริงยังทับ `WOStatusTracking*.js` ที่ยังไม่เคยเทียบเนื้อหาได้อยู่

production ใช้ payload แยกที่ `Foodstar/.deploy-staging/wo-trace-prod/` ซึ่งมี `project.json`
ของตัวเองชี้บัญชี `9751184` และผูกกับ git tag · ขั้นตอนเต็มอยู่ใน README ของโฟลเดอร์นั้น

```bash
npm run check:prod        # ตรวจ payload 8 ข้อก่อนยิงทุกครั้ง
```

ตัวตรวจอ่านอย่างเดียว ไม่เขียนอะไรลง staging ไม่แตะบัญชี · 8 ข้อคือ ไม่มี wildcard และ list
ตรงกับไฟล์จริง · **AMD dependency closure** · `<scriptfile>` resolve โดยสนตัวพิมพ์ ·
object เทียบ tag ต่างได้เฉพาะ `loglevel` · `loglevel` = `ERROR` · ไฟล์ทุกไฟล์เท่ากับที่ tag ·
`project.json` สองฝั่งชี้บัญชีถูกตัว · tag reachable จาก `main`

**payload วันนี้มีไฟล์เดียว แต่ `main` ไม่ใช่แล้ว** — `WOCostTrace.js` พึ่ง lib 3 ไฟล์
วันรีเฟรช payload ต้องเอาไปครบและเติม `<path>` ให้ครบ · ข้อ 2 ของตัวตรวจจับเคสนี้ได้ก่อนยิง

## ค่าที่ต่างรายบัญชี — ห้าม deploy ทับโดยไม่รู้ตัว

ตรวจ 2026-09-08 ด้วย `suitecloud object:import` ลง scratch project (อ่านอย่างเดียว ไม่แตะ `src/`)

`customscript_wo_status_tracking` — **สองบัญชีไม่ตรงกันเอง และ repo ไม่ตรงกับทั้งคู่**

| ช่อง | repo (`apps/wo-status/src/Objects`) | SB1 | production |
|---|---|---|---|
| `runasrole` | ไม่มีในไฟล์ | `ADMINISTRATOR` | ว่าง |
| `audslctrole` | ไม่มีในไฟล์ | `ONLINE_FORM_USER` | ว่าง |
| `isonline` | ไม่มีในไฟล์ | `T` | `F` |
| `loglevel` | `DEBUG` | `DEBUG` | `DEBUG` |

`customscript_fs_wo_cost_trace` — `loglevel` เป็น `DEBUG` ใน repo และ SB1 แต่ **`ERROR` บน
production** โดยตั้งใจ เพราะรายงานยิง 19 query ต่อการเปิดหนึ่งครั้ง · ค่าของ production
อยู่ใน staging payload เท่านั้น

**ยังไม่ตัดสินว่าจะยึดค่าไหน (issue #24)** — `runasrole=ADMINISTRATOR` คู่กับ `allroles=T`
หมายความว่าพนักงานคนไหนก็เปิดรายงานแล้วให้มันอ่านข้อมูลระดับ administrator ได้
เป็นเรื่องสิทธิ์ที่ต้องให้ admin ตัดสิน ไม่ใช่เรื่องที่แก้ไฟล์ให้ตรงกันแล้วจบ

## Cost ref มี 3 กฎจับคู่โดยตั้งใจ

ทั้งสามอ่าน record cost ref ตัวเดียวกัน แต่ตอบคำถามคนละข้อ · **ไม่ใช่ drift ห้ามรวมเป็นตัวเดียว**

| กฎ | อยู่ที่ | จับคู่ด้วย |
|---|---|---|
| `classifyCostRef` | `WOCostTrace.js` | ระดับสินค้า — สินค้าที่ผลิต + บริษัท + วันที่ |
| `costRefByWorkCenter` | `WOCostTrace_Ready.js` | สินค้า + **work center** ของขั้นตอนใน routing |
| `getCP9_StdCostSetup` | `WOStatusTracking_Queries.js` | สินค้า + WC ของ task + **fallback OH dept rate** ที่ WO Cost Trace ไม่มี |

**วันอ้างอิงมี 2 พฤติกรรม ไม่ใช่ 3**

- ชั้นภาพรวม · ชั้นเจาะลึก · CP9 ของ WO Status → ใช้**วันที่ของใบสั่งผลิต**
- มีแต่ชั้นความพร้อม (`&ready=`) ที่รับ `&rdate=` และตกเป็นวันนี้ถ้าไม่ส่ง
  เพราะมันถามว่า "**วันนี้**เดินงานได้หรือยัง" ไม่ใช่ "ตอนนั้นคิดต้นทุนด้วยอะไร"

## runbook — WO ใบแรกบน production

**production ยังไม่มี WO หรือ WOC เลยแม้แต่ใบเดียว** (MFG ยังไม่ go-live) ·
ทุกตัวเลขที่ verify แล้วมาจาก SB1 ทั้งหมด · วันมี WO ใบแรกคือ**การทดสอบ business path
ครั้งแรกของรายงานนี้** จึงต้องมีขั้นตอนเขียนไว้ก่อน ไม่ใช่ค่อยคิดตอนนั้น

ทำตามลำดับ อย่าข้าม

1. **ก่อนเปิดรายงาน** รัน `&ready=<เลขที่ WO>` ก่อน · ถ้า master ไม่ครบ ตัวเลขต้นทุนจะยัง
   ไม่มีความหมาย และจะเสียเวลาไล่หาสาเหตุผิดจุด
2. **เปิดชั้นเจาะลึก** `&wo=<เลขที่>` แล้วอ่าน 3 อย่างนี้**ก่อน**อ่านตัวเลข
   · ท้ายหน้า "เอกสารอ้างอิงทางเทคนิค" — `error:` ต้องเป็น 0 ทุกคำสั่ง
   · ตาราง "กระทบยอดงานระหว่างทำ" — ผลต่างต้องเป็นศูนย์
   · หัวข้อ "ตรวจสุขภาพชั้นที่ 3" — รายการที่ยัง "ไม่ตรง" ห้ามเอาตัวเลขไปใช้อ้างอิง
3. **เทียบกับการเจาะมือ 1 ใบ** ยอดวัตถุดิบ · ต้นทุนแปรสภาพ · ปริมาณผลิตได้ · ต้นทุน/หน่วย ·
   ถ้าไม่ตรง ให้เชื่อเอกสารต้นทางก่อน แล้วเปิด issue พร้อมเลขที่ใบและช่องที่ต่าง
4. **เทียบชั้นภาพรวมกับชั้นเจาะลึก** ใบเดียวกันต้องได้ยอดเท่ากันทุกหลัก · โค้ดล็อกกฎนี้ไว้
   และ `test/test_trace_parity.js` คุมอยู่ ถ้าของจริงไม่เท่ากันคือเจอเคสที่ fixture ยังไม่มี
5. **ดู log** `loglevel` บน production เป็น `ERROR` จึงเห็นเฉพาะของที่พังจริง ·
   ถ้าต้องดูละเอียดชั่วคราว แก้ที่ staging payload แล้ว deploy อย่าแก้บนหน้าจอบัญชี
   ไม่งั้นค่าจะหายรอบ deploy ถัดไป
6. **เจอปัญหาแล้ว rollback** git tag ของรอบ deploy ชี้ commit ที่ payload มาจาก ·
   ตารางหลักฐาน sha256 อยู่ใน README ของ staging · ต้อง normalize ปลายบรรทัดก่อนเทียบทุกครั้ง

ปิด runbook รอบนั้นด้วยการจดผลลงตารางประวัติ deploy ใน README ของ staging และปิด issue
ที่เปิดจากขั้นที่ 3 ให้ครบ

## เทสและด่านที่มีอยู่

```bash
npm test              # ทุกด่าน — ต้อง exit 0
npm run test:shared   # ชุดข้ามแอป (โครง · deploy.xml · theme)
npm run test:trace    # เฉพาะ WO Cost Trace
npm run test:status   # เฉพาะ WO Status Tracking
npm run check:prod    # ตรวจ payload production (อ่านอย่างเดียว)
```

`npm test` ไม่ใช่ framework · node ล้วน และตั้งใจให้เป็นด่านเดียวที่ทุกคนวิ่งผ่าน
เพราะ repo นี้ยังไม่มี CI

| ไฟล์ | กันอะไร |
|---|---|
| `test_repo_guard.js` | สำเนากลับเข้ามาที่ราก `src/` ของแอป · โครงเก่ากลับมา · ไฟล์หลงข้ามแอป |
| `test_deploy_manifest.js` | `deploy.xml` ตกไฟล์ · wildcard · dependency closure · `<scriptfile>` · **ระบุไฟล์ข้ามแอป** |
| `test_theme.js` | token เพี้ยนจาก `builder.css` ต้นทาง · hex หลุดเข้าโค้ด (ตรวจทั้งสองแอป) |
| `test_theme_sync.js` | ก๊อป theme ในแอปไม่ตรง `shared/WOReportTheme.js` |
| `test_wostatus_datefilter.js` | ช่องกรองวันที่ — dd/mm/yyyy หลุดลงไปถึง SQL · JS ฝั่งเบราว์เซอร์ parse ไม่ผ่าน · ตัวแปลงสองฝั่งเพี้ยนกัน · **escape ที่หลุด backslash ใน template literal** |
| `test_wostatus_subitemtype.js` | ตัวกรองประเภทย่อย — เงื่อนไขไม่ถึง SQL · ค่าหลุดตอนเปลี่ยนหน้า · ทางถอยของรายการค่า |
| `test_qlog_scope.js` | query log สะสมข้าม request |
| `test_query_contract.js` | clause ที่แบกน้ำหนักหลุดจาก SQL · alias ของ fixture ไม่ครบ |
| `test_trace_parity.js` | ชั้นภาพรวมกับชั้นเจาะลึกได้ยอดไม่เท่ากัน |
| `test_summary_math.js` · `test_summary_export.js` · `test_ready_master.js` | สูตรและข้อความของแต่ละชั้น |

fixture ที่ไม่ได้ประกาศ label = **เทสตก** ไม่ใช่คืนแถวว่างเงียบ ๆ · กับดักเดียวกับ `error:`
ใน query log ที่ทำให้อ่านเลขศูนย์เป็นคำตอบจริง

## ของที่ยังไม่ปิด

| เรื่อง | สภาพ |
|---|---|
| `WOStatusTracking*.js` 4 ไฟล์บน production | **ยังไม่ reconcile** · `WOStatusTracking.js` ตรงกับ repo ทุกไบต์ (ตรวจ 2026-09-08) เหลืออีก 3 ไฟล์ที่ยังไม่เทียบ |
| `runasrole` / `audslctrole` / `isonline` | สองบัญชีไม่ตรงกันเอง ยังไม่ตัดสินว่ายึดค่าไหน — issue #24 |
| ฟอนต์ Sarabun | ไม่ได้ฝังมากับหน้า · ได้จริงเฉพาะเครื่องที่มีฟอนต์ ดู `shared/REPORT_STYLE.md` |
| แยก Summary/Trace ออกจาก entry | **ไม่ทำ** โดยตั้งใจ · โค้ดล็อก parity ไว้ แยกแล้วต้องดูแลสำเนา SQL สองชุดที่ต้องเท่ากันตลอด |
| re-test SuiteQL ด้วย volume จริง | `apps/wo-status/prototype/test_cp03_feedmat.sql` และ `test_cp07_woc_l3.sql` ผ่านบน UAT (2026-06-14) ซึ่ง volume น้อยกว่า production |
| `shared/qa/make_theme_preview.js` | พังตั้งแต่ #13 ย้าย `runSQL` — โหลด lib ไม่ครบ ดู issue #43 |

ข้อจำกัดของตัวรายงานที่ยังจริง: WO Status ไม่มี expand-all (drilldown เป็น lazy-load
ทีละใบ) · ไม่มีการ flag WO ที่ค้างโดยไม่มี activity · ไม่มี filter "เฉพาะที่มีปัญหา"

---

เอกสารขัดกับความจริงเมื่อไหร่ แก้ที่นี่ในรอบนั้นเลย และอ้าง issue ที่ทำให้ต้องแก้ ·
งานที่ต้องแตะโค้ดต้องมี issue ก่อนตามกติกาทีม · runbook ของ payload production
อยู่ที่ `Foodstar/.deploy-staging/wo-trace-prod/README.md`
