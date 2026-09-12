# WO Status Tracking

SDF project ของ Suitelet `customscript_wo_status_tracking` — ติดตาม CP1–CP8 ของใบสั่งผลิต
และชี้จุดที่ข้อมูลระหว่างเอกสารไม่ตรงกัน สำหรับฝ่าย Operation

| หัวข้อ | อยู่ที่ |
|---|---|
| โครง repo · กฎ deploy · ข้อห้าม · ค่าที่ต่างรายบัญชี | [README ของราก](../../README.md) |
| แผนที่ส่งมอบให้ dev รอบแรก (ประวัติ) | [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) |
| mockup ที่ผู้ใช้อนุมัติ | [`wo-status-tracking-mockup.html`](./wo-status-tracking-mockup.html) |
| style และ design token | [`shared/REPORT_STYLE.md`](../../shared/REPORT_STYLE.md) |

```bash
npm run test:status                       # เทสของแอปนี้ (รันจากรากของ repo)
cd apps/wo-status
suitecloud project:deploy --dryrun        # อ่านชุดที่จะขึ้น — ต้องเห็นแต่ไฟล์ของแอปนี้
```

theme (`WOReportTheme.js`) ในโฟลเดอร์ source เป็นก๊อปของ `shared/WOReportTheme.js`
แก้ที่ต้นฉบับแล้วรัน `npm run sync:theme` — ห้ามแก้ก๊อป

object ของแอปนี้ปิดประเด็นสิทธิ์แล้ว (issue #24 · 2026-09-12) — `runasrole` และ `audslctrole`
เป็นค่าว่าง `isonline=F` ตรงกันทั้งไฟล์ SB1 และ production · `project:deploy` กับ SB1 ใช้ได้แล้ว
(ไฟล์ทั้ง 5 ของแอปนี้บน SB1 ตรงกับ repo ทุกไบต์ ตรวจ 2026-09-12) · **ยังไม่ reconcile 3 ไฟล์ lib
กับ production**

⚠ `<runasrole></runasrole>` ต้องเป็น element ว่าง ห้ามลบทิ้ง — SDF ไม่ล้างค่าให้ถ้าไม่มีช่องนี้ในไฟล์
