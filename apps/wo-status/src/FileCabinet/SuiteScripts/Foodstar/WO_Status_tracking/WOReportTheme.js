/**
 * WOReportTheme.js
 * design token + คลาสคอมโพเนนต์กลางของรายงานตระกูล WO — ยึด style จาก teibto-report-builder
 *
 * ต้นทางค่าทุกตัว: `Foodstar/Reports/General_report/teibto-report-builder/ui-src/styles/builder.css`
 * (UI brand ที่นั่นคือ *Teibto · Universal Report Engine*) · ยกค่ามาตรง ๆ ไม่ปรับสี
 * ห้ามแก้ค่า token ที่นี่ให้ต่างจากต้นทาง — รายงานที่สีเพี้ยนไปทีละนิดคือเหตุผลที่ไฟล์นี้มีอยู่
 *
 * ยึด Teibto Redwood แล้ว (ขั้น 1 · #64/#56 — เฉพาะสี): `--c-*` ฝังมาจาก `00-teibto-tokens.css`
 * ทั้ง 33 ตัว · `--pj-*` เป็น alias ชี้ `var(--c-*)` ตาม builder.css ตรง ๆ (คงชื่อ --pj-* ไว้ทั้งหมด)
 * สเกลระยะ/รัศมี/ตัวอักษรยังเป็นค่าเดิม (ขั้นถัดไป) — ดู test/test_theme.js ข้อ 4a/4b
 *
 * ใครใช้: `WOCostTrace.js` และ `WOStatusTracking.js` · เพิ่มรายงานใหม่ในตระกูลนี้ให้ require ไฟล์นี้
 * ทำไมต้องเป็นไฟล์กลาง: token block ที่ก็อปไว้สองที่จะ drift และไม่มีใครรู้ตัว
 *
 * ─── ต้นฉบับอยู่ที่ shared/WOReportTheme.js เท่านั้น (epic #37 · issue #39) ───
 * ไฟล์ชื่อเดียวกันใน `apps/<app>/src/FileCabinet/…/WOReportTheme.js` เป็น **ก๊อปที่เครื่องมือสร้าง**
 * เพื่อให้ deploy ของสองแอปเป็นอิสระ (แต่ละแอปถือไฟล์ของตัวเอง)
 * แก้ที่ต้นฉบับแล้วรัน `npm run sync:theme` — ห้ามแก้ก๊อปด้วยมือ
 * `npm test` (test_theme_sync.js) ล้มทันทีถ้าก๊อปไม่ตรงต้นฉบับทุก byte
 *
 * ─── สัญญาของฟังก์ชัน HTML ในไฟล์นี้ ───────────────────────────────────────────
 * ทุกฟังก์ชันรับ **สตริงที่ escape มาแล้ว** และต่อลง markup ตรง ๆ ไม่ escape ซ้ำให้
 * (ฝั่งเรียกมี `esc` ของตัวเองอยู่แล้ว และค่าบางตัวเป็น HTML จริง เช่น `<span class="badge">`)
 *
 * ─── ลำดับ deploy ───────────────────────────────────────────────────────────
 * ไฟล์นี้เป็น dependency ของ entry Suitelet ทั้งสองใบ · ถ้าอัปทีละไฟล์ด้วย `file:upload`
 * **ต้องอัปไฟล์นี้ก่อน entry** ไม่งั้น entry จะพัง `MODULE_DOES_NOT_EXIST`
 * (`project:deploy` ยิงทั้งชุดในรอบเดียว ไม่มีปัญหานี้)
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([], function () {
  'use strict';

  /**
   * design token — ยกมาจาก builder.css บล็อก DESIGN TOKENS ทั้งบล็อก
   * ชื่อ `--pj-*` มาจากโปรเจกต์ Porjai ที่เป็นต้นทางของ palette นี้เดิม · คงชื่อไว้ให้ตรงกัน
   * (ค่าที่ `--pj-*` ชี้ไปตอนนี้เป็น Teibto Redwood — ดูหัวไฟล์)
   */
  var TOKENS = ':root{'
    + '--sp-1:4px;--sp-2:8px;--sp-3:12px;--sp-4:16px;'
    + '--sp-5:20px;--sp-6:24px;--sp-7:28px;--sp-8:32px;'
    // สเกล radius / เงา / ตัวอักษร — ยึด Redwood เช่นเดียวกับสี (#64) · ชี้ผ่านตระกูล
    // --r-* / --sh-* / --t-* ตามที่ builder.css ของต้นทาง map ไว้ ไม่ได้เลือกค่าเอง
    // ⚠ --shadow-lg ต้นทางยุบให้เท่า --sh-md แล้ว = เหลือเงาระดับเดียว ไม่ใช่แค่ตัวเลขต่าง
    + '--radius-sm:var(--r-sm);--radius-md:var(--r-md);--radius-lg:var(--r-lg);'
    + '--shadow-sm:var(--sh-sm);'
    + '--shadow-md:var(--sh-md);'
    + '--shadow-lg:var(--sh-md);'
    + '--fs-xs:var(--t-xs);--fs-sm:var(--t-sm);--fs-md:var(--t-base);'
    + '--fs-lg:var(--t-md);--fs-xl:var(--t-lg);--fs-xxl:var(--t-2xl);'
    // ── Redwood สเกล --r-* / --sh-* / --t-* — ยกมาจาก 00-teibto-tokens.css ตัวเดียวกัน ──
    + '--t-xs:11px;--t-sm:12px;--t-base:14px;'
    + '--t-md:16px;--t-lg:18px;--t-xl:20px;'
    + '--t-2xl:24px;--r-sm:2px;--r-md:4px;'
    + '--r-lg:6px;--r-pill:999px;--sh-sm:0 1px 4px 0 rgba(0,0,0,.12);'
    + '--sh-md:0 4px 8px 0 rgba(0,0,0,.16);'
    // ── Teibto Redwood --c-* — ยกมาทั้งบล็อกจาก 00-teibto-tokens.css (33 ตัว) ──────────
    // แหล่งความจริง: `Foodstar/Reports/General_report/teibto-report-builder/ui-src/styles/
    // 00-teibto-tokens.css` ซึ่งยืนยันแล้วว่าชื่อ token ตรงกับ `00-tokens.css` ของ
    // teibto-ui-workspace ทุกตัว · ห้ามแก้ค่าที่นี่ให้ต่างจากต้นทาง
    + '--c-brand:#36677d;--c-brand-strong:#325c72;--c-brand-on:#ffffff;--c-brand-soft:#e7f2f5;'
    + '--c-sidebar:#325c72;--c-sidebar-text:#ffffff;'
    + '--c-sidebar-hover:rgba(255,255,255,.08);--c-sidebar-active:rgba(255,255,255,.16);'
    + '--c-sidebar-border:rgba(255,255,255,.12);'
    + '--c-bg:#f5f4f2;--c-surface:#ffffff;--c-surface-2:#fbf9f8;--c-surface-3:#f1efed;'
    + '--c-text:#161513;--c-text-subtle:rgba(22,21,19,.7);--c-text-muted:rgba(22,21,19,.7);'
    + '--c-border:rgba(22,21,19,.12);--c-border-control:rgba(22,21,19,.5);'
    + '--c-success:#436b1d;--c-success-soft:#f4fceb;'
    + '--c-warning:#8f520a;--c-warning-soft:#fef9f2;'
    + '--c-danger:#b3311f;--c-danger-soft:#fff8f7;'
    + '--c-info:#00688c;--c-info-soft:#f6fafc;--c-link:#00688c;'
    + '--c-console:#201e1c;--c-console-text:#f1efed;'
    + '--c-console-ok:#6ea73a;--c-console-warn:#eca452;--c-console-err:#ee7362;'
    + '--c-scrim:rgba(22,21,19,.5);'
    // ── --pj-* alias layer — ชี้ไป var(--c-*) ตามที่ builder.css นิยามไว้ตรง ๆ (ห้าม map เอง) ──
    // คงชื่อ --pj-* ไว้ทั้งหมด เพื่อไม่ต้องแก้ call site ในไฟล์นี้ทีเดียวหมด
    + '--pj-primary:var(--c-brand);--pj-primary-light:var(--c-brand);--pj-primary-dark:var(--c-brand-strong);'
    + '--pj-success:var(--c-success);--pj-success-bg:var(--c-success-soft);'
    + '--pj-info:var(--c-info);--pj-info-bg:var(--c-info-soft);'
    + '--pj-warning:var(--c-warning);--pj-warning-bg:var(--c-warning-soft);'
    + '--pj-error:var(--c-danger);--pj-error-bg:var(--c-danger-soft);'
    + '--pj-muted:var(--c-text-muted);--pj-muted-bg:var(--c-surface-3);'
    + '--pj-bg:var(--c-bg);--pj-surface:var(--c-surface);--pj-surface-alt:var(--c-surface-2);'
    + '--pj-border:var(--c-border);--pj-border-strong:var(--c-border-control);'
    + '--pj-text:var(--c-text);--pj-text-dim:var(--c-text-subtle);'
    + '--pj-text-muted:var(--c-text-muted);--pj-text-label:var(--c-text-muted);'
    // เพิ่มจากต้นทาง: ตัวเลขในรายงานตระกูลนี้ต้องเทียบหลักกันได้ทั้งคอลัมน์
    // builder.css ใช้ font-variant-numeric:tabular-nums แทนฟอนต์ mono ทั้งตาราง
    // ที่นี่ต้องมีชื่อฟอนต์จริงด้วย เพราะบางช่องเป็นรหัสเอกสาร ไม่ใช่ตัวเลข
    // (--pj-mono ไม่มีนิยามใน builder.css เลย — เป็นของที่เราเพิ่มเองมาแต่ต้น จึงไม่มี --c-* ให้ map)
    + "--pj-mono:'SF Mono',Monaco,Consolas,'Courier New',monospace"
    + '}';

  /**
   * พื้นฐานของหน้า — reset + body + ตาราง + ตัวควบคุมฟอร์ม
   * font stack มี **Sarabun** ตามต้นทาง · ป้ายในรายงานเป็นภาษาไทยทั้งหมด
   * ฟอนต์ที่มีแต่ Latin ทำให้ไทยตกไปใช้ฟอนต์สำรองของเครื่อง ซึ่งต่างกันทุกเครื่อง
   */
  var BASE = '*{box-sizing:border-box;margin:0;padding:0}'
    + '[hidden]{display:none!important}'
    // ซ่อนแบบที่ยังโฟกัสได้ (ไม่ใช่ display:none) — ใช้กับ <select> ที่ถูกครอบเป็น searchable
    // combobox (#64 ขั้น 3) ต้องเหลืออยู่ใน DOM เป็นตัวเก็บค่าและยังรับโฟกัสส่งต่อจาก
    // `label for=` ได้ (บั๊กจริงที่ MRP เจอ: display:none ตัดช่องทาง label for= ทิ้งไปเลย)
    + '.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;'
    + 'clip:rect(0,0,0,0);white-space:nowrap;border:0}'
    + "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Sarabun',sans-serif;"
    + 'background:var(--pj-bg);color:var(--pj-text);font-size:var(--fs-md);line-height:1.5}'
    + 'a{color:var(--pj-primary)}'
    + 'h1{font-size:var(--fs-xl);font-weight:600;letter-spacing:-.2px}'
    + 'h2{font-size:var(--fs-lg);font-weight:600;margin:var(--sp-6) 0 var(--sp-2);'
    + 'padding-bottom:var(--sp-1);border-bottom:1px solid var(--pj-border)}'
    + 'h3{font-size:var(--fs-md);font-weight:600;margin:var(--sp-4) 0 var(--sp-1);color:var(--pj-text-dim)}'
    + 'pre{margin:0;white-space:pre-wrap;font-size:var(--fs-xs);font-family:var(--pj-mono)}'
    // ตาราง — ค่าเดียวกับ .pivot-table ของ builder.css
    // Teibto Redwood: หัวตาราง muted semibold พื้น --c-surface-3 · ไม่ uppercase (ห้ามแถบแบรนด์เข้ม)
    // tabular-nums คือวิธีที่ต้นทางใช้ให้ตัวเลขเทียบหลักกันได้ โดยไม่ต้องสลับไปฟอนต์ mono
    + 'table{border-collapse:collapse;width:100%;background:var(--pj-surface);'
    + 'font-size:var(--fs-sm);font-variant-numeric:tabular-nums;margin:var(--sp-1) 0 var(--sp-3)}'
    + 'th,td{padding:6px var(--sp-3);border:1px solid var(--pj-border);text-align:left;vertical-align:top}'
    + 'th{background:var(--pj-muted-bg);font-weight:600;color:var(--pj-text-label);'
    + 'font-size:var(--fs-xs);letter-spacing:.3px}'
    // ตัวควบคุมฟอร์ม — หน้าตาเดียวกับ .search / .inline-field input ของต้นทาง
    // background-color: (ไม่ใช่ background: shorthand) เพราะ selector นี้แตะ tag `select` ตรง ๆ
    // (#64 ขั้น 3 — list field): shorthand จะรีเซ็ต background-image ของทุก .rw-select ที่ผสาน
    // สปีซิฟิซิตี้แพ้กัน (0,1,1 ของกฎนี้ vs 0,1,0 ของ .rw-select) — chevron จะหายไปเงียบ ๆ
    // โดยไม่มี error ใด ๆ (กับดักเดียวกับที่ MRP #489 เจอจริง — ดู list-field.md "cascade gotchas")
    // test/test_theme.js ข้อ 2b เป็นด่านกันไม่ให้ background: shorthand โผล่กลับมาแตะ select อีก
    + 'input[type=text],input[type=date],select,textarea{'
    + "font-family:inherit;font-size:var(--fs-md);padding:7px var(--sp-3);"
    + 'border:1px solid var(--pj-border-strong);border-radius:var(--radius-md);'
    + 'background-color:var(--pj-surface);color:var(--pj-text)}'
    + 'input[type=text]:focus,input[type=date]:focus,select:focus{outline:none;'
    + 'border-color:var(--pj-primary);box-shadow:0 0 0 2px rgba(24,95,165,.15)}'
    + 'label{font-size:var(--fs-xs);font-weight:600;color:var(--pj-text-label);'
    + 'letter-spacing:.5px}';

  /**
   * คลาสคอมโพเนนต์ — ชื่อคลาสตรงกับ builder.css ทุกตัว
   * ตั้งใจให้ชื่อตรง เพื่อวันที่ย้ายเข้าไปอยู่ในหน้าของ report-builder จริง
   * markup ของเราไปรับ CSS ของที่นั่นได้เลย ไม่ต้องแก้ทีละคลาส
   */
  var COMPONENTS =
    // ── แถบหัวเรื่อง ──
      '.topbar{display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-3) var(--sp-5);'
    + 'background:var(--pj-surface);border-bottom:1px solid var(--pj-border);flex-wrap:wrap}'
    + '.breadcrumbs{display:flex;align-items:center;gap:var(--sp-2);'
    + 'font-size:var(--fs-sm);color:var(--pj-text-muted);flex-wrap:wrap}'
    + '.breadcrumbs .sep{opacity:.4}'
    + '.breadcrumbs .current{color:var(--pj-text);font-weight:600}'
    + '.breadcrumbs a{color:var(--pj-text-muted);text-decoration:none}'
    + '.breadcrumbs a:hover{color:var(--pj-primary);text-decoration:underline}'
    + '.engine-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;'
    + 'background:var(--pj-primary);color:#fff;border-radius:12px;font-size:10px;'
    + 'font-weight:600;letter-spacing:.3px;margin-left:var(--sp-3)}'
    + '.topbar-right{margin-left:auto;display:flex;align-items:center;gap:var(--sp-2)}'
    // ── ตัวหน้า ──
    + '.content{padding:var(--sp-3) var(--sp-4)}'
    + '.report-section{background:var(--pj-surface);border:1px solid var(--pj-border);'
    + 'border-radius:var(--radius-lg);overflow:hidden;margin-bottom:var(--sp-3)}'
    + '.section-header{display:flex;align-items:center;justify-content:space-between;'
    + 'padding:var(--sp-2) var(--sp-4);border-bottom:1px solid var(--pj-border)}'
    + '.section-title{font-size:var(--fs-lg);font-weight:600;color:var(--pj-text)}'
    + '.section-subtitle{font-size:var(--fs-sm);color:var(--pj-text-muted);'
    + 'margin-left:var(--sp-2);font-weight:400}'
    // คำเตือนระดับรายงาน — โทน warning ไม่ใช่ error เพราะเลขไม่ผิด แต่ขอบเขตไม่ครบ
    + '.schema-notice{background:var(--pj-warning-bg);color:var(--pj-text);'
    + 'border-bottom:1px solid var(--pj-warning);border-left:3px solid var(--pj-warning);'
    + 'padding:var(--sp-2) var(--sp-4);font-size:var(--fs-sm);line-height:1.5}'
    + '.record-count{padding:var(--sp-1) var(--sp-4);font-size:var(--fs-xs);'
    + 'color:var(--pj-text-muted);background:var(--pj-surface);'
    + 'border-bottom:1px solid var(--pj-border)}'
    + '.record-count b{color:var(--pj-text);font-weight:600}'
    // ── แถบเครื่องมือ + ปุ่ม ──
    + '.toolbar{display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-2) var(--sp-4);'
    + 'background:var(--pj-surface-alt);border-bottom:1px solid var(--pj-border);flex-wrap:wrap}'
    + '.inline-field{display:flex;align-items:center;gap:6px}'
    + '.stack-field{display:flex;flex-direction:column;gap:var(--sp-1)}'
    + '.btn{padding:7px 11px;border-radius:var(--radius-md);'
    + 'border:1px solid var(--pj-border-strong);background:var(--pj-surface);'
    + 'font-family:inherit;font-size:var(--fs-sm);font-weight:500;color:var(--pj-text-dim);'
    + 'cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;'
    + 'transition:background-color .1s,border-color .1s,color .1s,box-shadow .1s}'
    + '.btn:hover:enabled{border-color:var(--pj-primary);color:var(--pj-primary)}'
    + '.btn.primary{background:var(--pj-primary);color:#fff;border-color:var(--pj-primary)}'
    + '.btn.primary:hover:enabled{background:var(--pj-primary-dark);color:#fff}'
    + '.btn.danger{background:var(--pj-error-bg);color:var(--pj-error);border-color:var(--pj-error)}'
    + '.btn.active{background:var(--pj-primary);color:#fff;border-color:var(--pj-primary)}'
    + '.btn:disabled{background:var(--pj-muted-bg);color:var(--pj-text-muted);'
    + 'border-color:var(--pj-border);cursor:default}'
    // NetSuite ship CSS reset `:focus{outline:0}` มาด้วย — ต้อง !important เหมือนปุ่มปฏิทิน/
    // combobox ของขั้น 3/4 ก่อนหน้า (#64) ไม่งั้นปุ่มนี้กดคีย์บอร์ดแล้วไม่เห็นโฟกัสอยู่ตรงไหน
    // (#64 ขั้น 5 — .btn ใช้จริงเฉพาะ wo-cost-trace ตอนนี้ แต่ประกาศไว้ที่ shared เพราะคลาสนี้
    // อยู่ใน COMPONENTS ก้อนเดียวกับที่สองแอปใช้ร่วม — ดูกติกาไฟล์นี้)
    + '.btn:focus-visible{outline:2px solid var(--pj-primary) !important;outline-offset:2px}'
    // ── การ์ด KPI ──
    // ต้นทางย่อการ์ดให้เตี้ย (~60px) โดยตั้งใจ: แถบสรุปต้องไม่เบียดตารางที่มันสรุป
    + '.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));'
    + 'gap:var(--sp-2);margin-bottom:var(--sp-2)}'
    + '.kpi-card{background:var(--pj-surface);border:1px solid var(--pj-border);'
    + 'border-left:3px solid var(--pj-primary);border-radius:var(--radius-md);'
    + 'padding:6px var(--sp-3);display:flex;flex-direction:column;gap:1px;min-width:0;'
    + 'transition:box-shadow .15s}'
    + '.kpi-card:hover{box-shadow:var(--shadow-md)}'
    + '.kpi-card.accent-success{border-left-color:var(--pj-success)}'
    + '.kpi-card.accent-info{border-left-color:var(--pj-info)}'
    + '.kpi-card.accent-warning{border-left-color:var(--pj-warning)}'
    + '.kpi-card.accent-error{border-left-color:var(--pj-error)}'
    + '.kpi-card.accent-primary{border-left-color:var(--pj-primary)}'
    // Teibto Redwood: label เป็น muted semibold ไม่ uppercase
    + '.kpi-label{font-size:10px;letter-spacing:.4px;'
    + 'color:var(--pj-text-label);font-weight:600;'
    + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.kpi-value{font-size:var(--fs-lg);font-weight:700;color:var(--pj-text);'
    + 'letter-spacing:-.4px;line-height:1.2}'
    + '.kpi-meta{font-size:var(--fs-xs);color:var(--pj-text-muted);'
    + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.kpi-meta .good{color:var(--pj-success);font-weight:600}'
    + '.kpi-meta .bad{color:var(--pj-error);font-weight:600}'
    // ── ป้ายสถานะ ──
    + '.badge{display:inline-block;padding:2px 10px;border-radius:12px;'
    + 'font-size:var(--fs-xs);font-weight:600;letter-spacing:.2px}'
    + '.badge.info{background:var(--pj-info-bg);color:var(--pj-info)}'
    + '.badge.success{background:var(--pj-success-bg);color:var(--pj-success)}'
    + '.badge.warning{background:var(--pj-warning-bg);color:var(--pj-warning)}'
    + '.badge.error{background:var(--pj-error-bg);color:var(--pj-error)}'
    + '.badge.muted{background:var(--pj-muted-bg);color:var(--pj-muted)}'
    + '.loading{padding:var(--sp-8);text-align:center;'
    + 'color:var(--pj-text-muted);font-size:var(--fs-sm)}'
    // ── Redwood list field — select-single native + searchable combobox (#64 ขั้น 3) ──────
    // ที่มา: list-field.md (สเปกกลางของทีม, MRP #489/#500) — ก๊อปเมตริก/พฤติกรรมมาตาม
    // ต้นฉบับ แต่แทนชื่อ token ที่ต้นฉบับอ้างและเรายังไม่มี (--btn-h · --s-* · --bw-control ·
    // --focus-ring · --tap-min — สเกลปุ่ม/ระยะ/focus-ring ของ Redwood ที่ยังไม่ได้ทำในขั้นนี้
    // ดู test_theme.js หัวไฟล์เรื่อง 4a/4b) ด้วยของจริงที่มีอยู่แล้ว (--pj-*/--r-*/--sh-*/--fs-*)
    // ท่าเดียวกับที่ .datewrap/.datebtn ของ date field (#64 ขั้น 4) ทำมาก่อน — คงเมตริกที่ตั้งใจ
    // ไม่ใช่คงชื่อ token ที่ไม่มีอยู่จริง
    //
    // ใช้ร่วมกันทั้งสองแอป (wo-status: subsidiaryId/locationId/subItemTypeId · wo-cost-trace:
    // sub/loc) จึงอยู่ที่นี่ตามกติกา "CSS ที่ใช้ร่วม → shared/WOReportTheme.js" ไม่ใช่ REPORT_CSS
    // ของแอปใดแอปหนึ่ง (ต่างจาก .datewrap/.cal ซึ่งตอนนี้มีแค่ wo-status ใช้จึงยังอยู่ที่นั่น)
    //
    // frame ใช้กรอบ/สี/radius เดียวกับ input[type=text] ของ BASE ข้างบน (ไม่ตั้ง height คงที่
    // เพราะ BASE เองก็ไม่ได้ตั้ง — ยังไม่มี --btn-h ให้ยึด) เว้น padding ขวา 28px ให้ chevron 16px
    + '.rw-select,.rw-combobox .rw-combobox-input{box-sizing:border-box;'
    + 'padding:7px 28px 7px var(--sp-3);border:1px solid var(--pj-border-strong);'
    + 'border-radius:var(--radius-md);background-color:var(--pj-surface);color:var(--pj-text);'
    + 'font-family:inherit;font-size:var(--fs-md);line-height:normal}'
    // chevron ของ native <select> — data: URI วาด currentColor ไม่ได้ จึงฝัง hex ตรง ๆ
    // (ข้อยกเว้นเดียวที่ยอมให้มี hex นอกไฟล์นี้ตาม feedback ของทีม) เลข %23161513 = URL-encode
    // ของ #161513 ซึ่งคือค่า --c-text ตัวเดียวกับที่ token ประกาศไว้ข้างบนเป๊ะ (ไม่ใช่เลขลอย)
    // — เป็น %23 (encoded) ไม่ใช่ตัวอักษร # ตรง ๆ จึง regex เช็ค hex ของ test_theme.js ข้อ 2
    // (`/#[0-9a-fA-F]{3,6}\b/`) ไม่ตรวจจับบรรทัดนี้อยู่แล้ว
    + '.rw-select{appearance:none;-webkit-appearance:none;-moz-appearance:none;'
    // svg นี้อยู่ใน background-image ของ CSS ไม่ใช่ DOM จริง — เบราว์เซอร์ไม่ส่งเข้า a11y tree
    // อยู่แล้วไม่ว่าจะมี aria-hidden หรือไม่ (ต่างจาก svg ทุกตัวของ ICONS ข้างบนซึ่งถูกต่อเข้า
    // markup จริง) test/test_icons.js สแกนทั้งหน้าเรนเดอร์เพื่อจับ svg ที่ต่อ DOM จริงแล้วลืม
    // aria-hidden — ตัด <style> block ออกก่อนสแกนที่นั่นแล้ว (ดูคอมเมนต์ในไฟล์เทส) ไม่ต้องเติม
    // attribute ที่ไม่มีความหมายจริงลงในนี้เพื่อหลอกด่าน
    + "background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' "
    + "width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%23161513' stroke-opacity='.7' "
    + "stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M4 6l4 4 4-4'/>"
    + "</svg>\");background-repeat:no-repeat;background-position:right var(--sp-2) center;"
    + 'background-size:16px 16px}'
    + '.rw-select:focus,.rw-select:focus-visible,'
    + '.rw-combobox .rw-combobox-input:focus,.rw-combobox .rw-combobox-input:focus-visible{'
    + 'outline:none !important;box-shadow:0 0 0 2px var(--pj-primary) !important}'
    + '.rw-select:disabled,.rw-combobox .rw-combobox-input:disabled{'
    + 'background-color:var(--pj-muted-bg);color:var(--pj-text-muted);cursor:not-allowed}'
    + '.rw-combobox{position:relative;display:inline-block;vertical-align:top}'
    // ช่อง chevron ของ combobox เป็น <span> ห่อ svg จริง (ไม่ใช่ background-image) — ใช้
    // currentColor ได้ตามปกติ ไม่ต้องฝัง hex ซ้ำแบบของ .rw-select ด้านบน
    + '.rw-combobox .rw-combobox-chevron{position:absolute;right:var(--sp-2);top:50%;'
    + 'transform:translateY(-50%);width:16px;height:16px;color:var(--pj-text-muted);'
    + 'pointer-events:none;display:flex}'
    + '.rw-combobox .rw-combobox-chevron svg{display:block}'
    // ไม่มีปุ่ม ✕ ในฟิลด์ list (ผู้ใช้ปฏิเสธแล้ว 2026-09-12 — รกและซ้อนกับ chevron) — กฎนี้
    // เป็นเกราะกันเผื่ออนาคตมีใครก็อปโครง MRP ที่มีปุ่มนี้มาทั้งชุดโดยไม่ได้อ่าน adoption rule
    // (ปุ่ม clear ถ้ามีจะยังเป็นลูกของ .rw-combobox จริง ต่างจากสามกลุ่มด้านล่าง — ดูเหตุผลถัดไป)
    + '.rw-combobox .rw-combobox-clear{display:none !important}'
    // ⚠ .rw-combobox-list / .rw-combobox-option / .rw-combobox-empty ใช้ selector "คลาสเดียว"
    // โดยตั้งใจ — ห้ามใส่ ".rw-combobox " นำหน้าอีก (บั๊กจริงที่พบตอน deploy ขึ้น SB1: panel
    // (list/option/empty) ถูก `document.body.appendChild(list)` ย้ายไปอยู่ใต้ <body> ตรง ๆ
    // (portal ตามสัญญาของ dropdown ที่อยู่ในกล่อง overflow — ดู enhance() ฝั่ง client) จึง**ไม่ใช่
    // ลูกของ .rw-combobox อีกต่อไป** — descendant selector `.rw-combobox .rw-combobox-list` ไม่
    // เคย match เลย พื้น/ขอบ/เงา/max-height/z-index จึงหายหมดเงียบ ๆ (getComputedStyle ตรวจแล้ว
    // ว่าเป็น initial value ทุกตัว ทั้งที่ inline style ของ JS ยังตั้ง position:fixed ให้ปกติ) —
    // บั๊กชนิดเดียวกับ `.filterbar button` ของ #45 (selector ไม่ตรงกับ DOM จริงหลัง portal)
    // test/test_listfield_portal_css.js เป็นด่านกันไม่ให้ย้อนกลับไปเป็น descendant selector
    + '.rw-combobox-list{position:fixed;z-index:60;max-height:280px;overflow-y:auto;'
    + 'background-color:var(--pj-surface);border:1px solid var(--pj-border-strong);'
    + 'border-radius:var(--radius-md);box-shadow:var(--shadow-md);padding:4px 0;margin:0;'
    + 'list-style:none}'
    + '.rw-combobox-option{min-height:30px;padding:0 var(--sp-3);'
    + 'display:flex;align-items:center;font-size:var(--fs-md);color:var(--pj-text);cursor:pointer}'
    + '.rw-combobox-option:hover{background-color:var(--pj-surface-alt)}'
    + '.rw-combobox-option.is-active,'
    + '.rw-combobox-option[aria-selected="true"]{'
    + 'background-color:var(--c-brand-soft);color:var(--pj-primary)}'
    + '.rw-combobox-empty{padding:var(--sp-2);font-size:var(--fs-sm);'
    + 'color:var(--pj-text-muted);font-style:italic;text-align:center}'
    // ตั้งใจใช้ selector คลาสเดียว (.rw-combobox-input) ไม่ผูก .rw-combobox แม่ — สปีซิฟิซิตี้
    // (0,1,0) แพ้ .filterbar input ของ wo-status (0,1,1 — มี type selector `input` เพิ่ม) โดย
    // ไม่ต้องพึ่งลำดับ cascade เลย (ผูกสองคลาสจะกลายเป็น (0,2,0) ซึ่ง**ชนะ**ทุกกรณีไม่ว่าจะมาก่อน
    // หรือหลัง .filterbar input ก็ตาม — เคยเขียนคอมเมนต์ผิดไว้ตรงนี้ว่า "cascade order" เป็นตัวตัดสิน
    // ซึ่งไม่จริง สปีซิฟิซิตี้ต่างหาก) ผลคือ wo-status ยังได้ 150px ตามแถวตัวกรองเดิม ส่วน
    // wo-cost-trace ที่ไม่มี container คุมความกว้างแบบนั้นได้ 170px ของที่นี่แทน กันช่องเล็ก
    // จนพิมพ์ค้นไม่ถนัด
    + '.rw-combobox-input{min-width:170px}';

  /**
   * ไอคอนสถานะ — inline SVG 16px ตามมาตรฐาน Teibto Redwood (#64 ขั้น 2)
   * ก่อนหน้านี้ WOStatusTracking.js / _Drilldown.js / WOCostTrace.js / _Ready.js ต่างคนต่างเขียน
   * ตัวอักษร ✓ ◷ ✕ ⚠ ↗ เป็นไอคอนเอง (คนละที่ ~6 จุด) — ย้ายมารวมที่นี่แหล่งเดียวเพราะทั้งสองแอป
   * require ไฟล์นี้อยู่แล้ว (ตรวจโดย test/test_theme.js) ไม่ต้องเพิ่ม dependency ใหม่ที่ entry
   *
   * กติกา: `stroke="currentColor"` เสมอ (ห้าม hardcode สี — ให้ span/td ที่ครอบกำหนดสีผ่าน CSS)
   * ทุกตัวมี `aria-hidden="true"` ติดตัว — ไม่ใช่เพราะไอคอนทั้งหมด "แค่ตกแต่ง" แต่เพราะ svg ที่ถูก
   * ห่อด้วย `iconImg()` (ข้างล่าง) ให้ `role="img"` + `aria-label` ที่ span ห่อแทน — svg ข้างในต้อง
   * `aria-hidden` เสมอกัน screen reader ไม่อ่านซ้ำสองรอบ (ตัวห่อประกาศชื่อ / svg ข้างในเงียบ)
   * ที่ใดไอคอนเป็นของตกแต่งจริง (มีข้อความเคียงข้างบอกความหมายอยู่แล้ว) ให้ใช้ ICONS.xxx ตรง ๆ
   * ไม่ต้องห่อ — ที่ใดไอคอนเป็นตัว**สื่อความหมาย**เดียวที่บอกสถานะ (ไม่มีข้อความอื่นบอกซ้ำ) ต้อง
   * ห่อด้วย `iconImg(name, escapedLabel)` เสมอ (#64 ขั้น 2b — ดูจุดเรียกใช้จริงในแต่ละไฟล์)
   * ชื่อคีย์ตั้งตามรูปทรง ไม่ใช่ตามความหมายสถานะ (ok/err ฯลฯ) เพราะสองแอปผูกความหมายไม่เหมือนกัน
   * (wo-status: ok/wait/err/na · wo-cost-trace: ok/bad/warn/unk/info) แต่ต้องได้ path เดียวกัน
   */
  var ICONS = {
    check: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M3.5 8.4l3 3 6.2-7.2" stroke="currentColor" stroke-width="1.6" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" '
      + 'stroke-linecap="round"/></svg>',
    clock: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.4"/>'
      + '<path d="M8 4.6V8.3l2.6 1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" '
      + 'stroke-linejoin="round"/></svg>',
    warn: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M8 2.3l6.4 11a.9.9 0 01-.78 1.35H2.34a.9.9 0 01-.78-1.35l6.4-11a.9.9 '
      + '0 011.56 0z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
      + '<path d="M8 6.4v3.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'
      + '<path d="M8 11.6h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    help: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.4"/>'
      + '<path d="M6.1 6.1c.15-1.1 1-1.85 2.1-1.85 1.15 0 2.05.78 2.05 1.85 0 .95-.55 1.35-1.25 '
      + '1.85-.6.42-.9.8-.9 1.55" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" '
      + 'stroke-linejoin="round"/><path d="M8 11.5h.01" stroke="currentColor" stroke-width="1.6" '
      + 'stroke-linecap="round"/></svg>',
    extLink: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M6.2 9.8L13 3M8 3h5v5M12.2 8.6V12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 '
      + '1 0 011-1h3.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" '
      + 'stroke-linejoin="round"/></svg>',
    // เพิ่มพร้อม date field (#64 ขั้น 4 — เดิมปุ่มเดือนก่อน/ถัดไปของปฏิทิน WO Status
    // เป็นตัวอักษร ‹ › ไม่ใช่ SVG จึงไม่ถูกนับใน #64 ขั้น 2 ตอนย้ายไอคอนสถานะ)
    chevronLeft: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M10 3.2L5.6 8l4.4 4.8" stroke="currentColor" stroke-width="1.5" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronRight: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M6 3.2L10.4 8 6 12.8" stroke="currentColor" stroke-width="1.5" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // เพิ่มพร้อม list field (#64 ขั้น 3) — ลูกศรของ native <select> (.rw-select ใน COMPONENTS
    // ด้านล่าง วาดเป็น background-image เพราะ currentColor ใช้กับ data: URI ไม่ได้) และของ
    // ช่อง combobox (.rw-combobox-chevron ที่นี่เป็น svg จริงจึงใช้ currentColor ได้ตามปกติ)
    // เป็น path เดียวกัน (M4 6l4 4 4-4) — คงรูปทรงเดียวกันทั้งสองที่ทาง
    chevronDown: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /**
   * ห่อไอคอนที่**สื่อความหมาย**ด้วย `role="img"` + `aria-label` ให้ screen reader ประกาศชื่อได้
   * (issue: ขั้น 2 เปลี่ยน ✓ ◷ ✕ ⚠ เป็น svg `aria-hidden` ล้วน ทำให้ช่องสถานะที่ไม่มีข้อความ
   * อื่นบอกความหมายกลายเป็น "เงียบ" ทั้งที่ตัวอักษรเดิมยังอ่านออกเสียง — #64 ขั้น 2b แก้ตรงนี้)
   *
   * ทำไมเลือกวิธีนี้ (ไม่ใช้ `<title>` ในตัว svg เอง): svg เดียวกัน (markup เดียวกันทุกตัวใน
   * ICONS) render ซ้ำหลายสิบครั้งต่อหน้า — `<title>` ต้องมี `id` ไม่ซ้ำกันต่ออินสแตนซ์เพื่อผูก
   * `aria-labelledby` ทำให้ทุกจุดที่เรียกต้องคิดเลข id เอง เสี่ยงชนกัน ส่วน `role="img"
   * aria-label="…"` ที่ span ห่อไม่ต้องมี id เลย ป้ายแต่ละอันเป็นอิสระจากกัน และ browser/AT
   * รองรับกว้างกว่า (svg `<title>` มีปัญหาเข้ากันไม่ได้กับ Safari/VoiceOver บางรุ่น)
   *
   * @param {string} name         คีย์ใน ICONS (เช่น 'check')
   * @param {string} escapedLabel ชื่อไอคอน **escape มาแล้ว** (สัญญาเดียวกับฟังก์ชันอื่นในไฟล์นี้ —
   *                              ผู้เรียกต้อง escape เอง ไม่มีการ escape ซ้ำในนี้)
   */
  function iconImg(name, escapedLabel) {
    return '<span role="img" aria-label="' + escapedLabel + '">' + (ICONS[name] || '') + '</span>';
  }

  /**
   * บล็อก `<style>` ของหน้า — token + พื้นฐาน + คอมโพเนนต์ แล้วต่อ CSS เฉพาะรายงาน
   * @param {string} [reportCss] CSS ของรายงานนั้นเอง (เขียนด้วย token ข้างบน ไม่ใส่ hex ตรง ๆ)
   */
  function css(reportCss) {
    return '<style>' + TOKENS + BASE + COMPONENTS + (reportCss || '') + '</style>';
  }

  /**
   * แถบหัวเรื่องมาตรฐาน — breadcrumb แบบเดียวกับ report-builder
   * เรียกเมื่อรายงานเปิดเดี่ยว · โหมด `embed=1` ให้ข้ามการเรียกนี้ไปเลย
   * เพราะหน้าที่ฝังเราไว้มีหัวเรื่องของตัวเองอยู่แล้ว
   *
   * @param {Object} o
   * @param {string[]} [o.crumbs] ชั้นก่อนหน้าชื่อรายงาน (HTML ได้ เช่นลิงก์กลับ)
   * @param {string} o.title ชื่อรายงาน — ชั้นสุดท้าย ตัวเข้ม
   * @param {string} [o.badge] ข้อความในป้ายท้าย breadcrumb
   * @param {string} [o.right] HTML มุมขวา เช่นปุ่มสลับภาษา
   */
  function topbar(o) {
    var c = o || {};
    var parts = (c.crumbs || []).map(function (x) {
      return '<span>' + x + '</span><span class="sep">/</span>';
    }).join('');
    return '<div class="topbar"><div class="breadcrumbs">'
      + parts
      + '<span class="current">' + (c.title || '') + '</span>'
      + (c.badge ? '<span class="engine-badge">' + c.badge + '</span>' : '')
      + '</div>'
      + (c.right ? '<div class="topbar-right">' + c.right + '</div>' : '')
      + '</div>';
  }

  /**
   * การ์ด KPI ใบเดียว
   * @param {Object} o
   * @param {string} o.label ป้ายบน (ตัวเล็ก uppercase)
   * @param {string} o.value ตัวเลข/ค่า
   * @param {string} [o.meta] บรรทัดขยายใต้ค่า
   * @param {string} [o.accent] primary | success | info | warning | error
   * @param {string} [o.labelAttrs] attribute เพิ่มบนป้าย เช่น `data-i18n="kOk"`
   */
  function kpiCard(o) {
    var c = o || {};
    return '<div class="kpi-card accent-' + (c.accent || 'primary') + '">'
      + '<div class="kpi-label"' + (c.labelAttrs ? ' ' + c.labelAttrs : '') + '>'
      + (c.label || '') + '</div>'
      + '<div class="kpi-value">' + (c.value == null ? '' : c.value) + '</div>'
      + (c.meta ? '<div class="kpi-meta">' + c.meta + '</div>' : '')
      + '</div>';
  }

  /** แถว KPI — รับ array ของ argument แบบเดียวกับ kpiCard */
  function kpiGrid(items) {
    return '<div class="kpi-grid">' + (items || []).map(kpiCard).join('') + '</div>';
  }

  return {
    TOKENS: TOKENS,
    BASE: BASE,
    COMPONENTS: COMPONENTS,
    ICONS: ICONS,
    iconImg: iconImg,
    css: css,
    topbar: topbar,
    kpiCard: kpiCard,
    kpiGrid: kpiGrid
  };
});
