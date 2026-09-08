# WO Cost Trace

SDF project ของ Suitelet `customscript_fs_wo_cost_trace` — พิสูจน์ที่มาของต้นทุนใบสั่งผลิต
สำหรับงาน Costing/UAT

| หัวข้อ | อยู่ที่ |
|---|---|
| ที่มาของทุกตัวเลข · สามชั้นของรายงาน · ตัวเลขที่ verify แล้ว | [`WO_COST_TRACE.md`](./WO_COST_TRACE.md) |
| โครง repo · กฎ deploy · ข้อห้าม | [README ของราก](../../README.md) |
| style และ design token | [`shared/REPORT_STYLE.md`](../../shared/REPORT_STYLE.md) |

```bash
npm run test:trace                        # เทสของแอปนี้ (รันจากรากของ repo)
cd apps/wo-cost-trace
suitecloud project:deploy --dryrun        # อ่านชุดที่จะขึ้น — ต้องเห็นแต่ไฟล์ของแอปนี้
```

theme (`WOReportTheme.js`) ในโฟลเดอร์ source เป็นก๊อปของ `shared/WOReportTheme.js`
แก้ที่ต้นฉบับแล้วรัน `npm run sync:theme` — ห้ามแก้ก๊อป

**ห้าม deploy production จากที่นี่** · production ใช้ payload แยกที่
`Foodstar/.deploy-staging/wo-trace-prod/` ตรวจก่อนยิงด้วย `npm run check:prod`
