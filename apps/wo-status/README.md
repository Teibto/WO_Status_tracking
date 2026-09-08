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

⚠ **หมายเหตุ CP3 พิมพ์ชื่อวัตถุดิบให้ทุก role โดยตั้งใจ** — ที่อื่นในบัญชีถือว่า
`cseg_subitemtype = 6` เป็นสูตรลับ · รับไว้ตามคำตัดสินของ issue #29 (2026-09-08)
**ก่อนแตะ CP3 อ่าน [หัวข้อสูตรลับใน README ของราก](../../README.md#สูตรลับใน-bom--wo-status-แสดงชื่อวัตถุดิบให้ทุก-role-โดยตั้งใจ) ก่อน**
— มีลำดับที่ต้องทำถ้าวันหนึ่งต้องปิดชื่อจริง

⚠ **object ของแอปนี้ยังมีประเด็นสิทธิ์ที่ไม่ปิด (issue #24)** — `runasrole` / `audslctrole` /
`isonline` ในไฟล์ไม่ตรงกับทั้ง SB1 และ production · ระหว่างนี้ห้ามใช้ `project:deploy` กับ SB1
อัปเฉพาะไฟล์ด้วย `file:upload` และ **ยังไม่ reconcile 3 ไฟล์ lib กับ production**
