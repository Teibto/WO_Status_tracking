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
    + '--radius-sm:4px;--radius-md:6px;--radius-lg:10px;'
    + '--shadow-sm:0 1px 2px rgba(0,0,0,0.04);'
    + '--shadow-md:0 2px 8px rgba(0,0,0,0.08);'
    + '--shadow-lg:0 4px 16px rgba(0,0,0,0.12);'
    + '--fs-xs:11px;--fs-sm:12px;--fs-md:13px;'
    + '--fs-lg:15px;--fs-xl:18px;--fs-xxl:24px;'
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
    + 'input[type=text],input[type=date],select,textarea{'
    + "font-family:inherit;font-size:var(--fs-md);padding:7px var(--sp-3);"
    + 'border:1px solid var(--pj-border-strong);border-radius:var(--radius-md);'
    + 'background:var(--pj-surface);color:var(--pj-text)}'
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
    + 'color:var(--pj-text-muted);font-size:var(--fs-sm)}';

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
    css: css,
    topbar: topbar,
    kpiCard: kpiCard,
    kpiGrid: kpiGrid
  };
});
