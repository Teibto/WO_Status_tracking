/**
 * สร้าง qa/theme-preview.html — หน้าภาพรวมต้นทุนที่ render จากข้อมูลทดสอบชุดเดียวกับ npm test
 *
 * มีไว้เพื่อ**ดูด้วยตา** ว่า style ตรงกับ template ของ teibto-report-builder หรือยัง
 * โดยไม่ต้อง deploy · เทสบอกได้แค่ว่าคลาสและ token มาครบ ไม่ได้บอกว่ามันสวยหรือพัง
 *
 * ข้อจำกัดที่ต้องรู้: หน้านี้ไม่ใช่หลักฐานว่าบน NetSuite จะได้แบบนี้
 * ที่ต่างจริงคือฟอนต์ที่บัญชีมีให้ (Sarabun มีหรือไม่มี) และ iframe ของ NetSuite
 *
 *   node qa/make_theme_preview.js
 */
const fs = require('fs');
const path = require('path');
const H = require('../test/_harness');
const FX = require('../test/fixtures_parity');

const { T } = H.load({
  libs: ['WOReportTheme.js'],
  fixtures: FX.summary(),
  quietLog: true,
  exports: ['buildSummary', 'readFilters', 'renderSummaryPage']
});

const sm = T.buildSummary(T.readFilters({ from: '2026-07-01', to: '2026-07-31' }));
const body = T.renderSummaryPage(sm);

const out = path.join(__dirname, 'theme-preview.html');
fs.writeFileSync(out,
  '<!DOCTYPE html>\n<html lang="th">\n<head><meta charset="UTF-8">\n'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  + '<title>WO Cost Trace — ตัวอย่าง style</title>\n'
  // Sarabun จาก Google Fonts เพื่อให้เห็นผลเหมือนบัญชีที่มีฟอนต์นี้
  + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
  + '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">\n'
  + '</head>\n<body>\n' + body + '\n</body>\n</html>\n', 'utf8');

console.log('เขียนแล้ว: ' + out);
console.log('แถว: ' + sm.rows.length + ' · เปิดไฟล์นี้ในเบราว์เซอร์เพื่อดูเทียบกับ report-builder');
