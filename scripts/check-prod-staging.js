/**
 * check-prod-staging.js — ตรวจ payload production ก่อนยิงทุกครั้ง (issue #12)
 *
 *   node scripts/check-prod-staging.js [stagingDir] [--tag <tag>] [--account <authId>]
 *   npm run check:prod
 *
 * **อ่านอย่างเดียว** ไม่เขียนอะไรลง staging ไม่แตะบัญชี NetSuite ไม่ต่อเน็ต
 * ไม่ใช่ตัวสร้าง payload — ตัวสร้างจะต้องรู้ค่าของ production ซึ่งขัดคำตัดสิน D1
 * ที่ให้ค่าของ production อยู่นอก repo · ตัวนี้แค่อ่านค่าจาก staging แล้วเทียบกับ tag
 *
 * ตรวจ 8 ข้อ (ตาม issue #12) ทุกข้อพิมพ์เหตุผลเมื่อไม่ผ่าน และ exit 1 ถ้ามีข้อใดไม่ผ่าน
 *
 * ─── กับดักที่ตัวตรวจต้องกันเอง ─────────────────────────────────────────────
 * ไฟล์ใน staging เป็น CRLF แต่ blob ใน git เป็น LF → sha256 ดิบหรือ `diff -q` จะฟ้องว่าต่าง
 * ทั้งที่เนื้อหาเหมือนกันทุกบรรทัด (`WOCostTrace.js` ตัวเดียวกันได้ a7e5b302… ฝั่ง git
 * แต่ 1e7a2743… ฝั่ง staging) · ตัวตรวจที่ฟ้อง drift ตลอดกาลจะถูกเลิกเชื่อ ซึ่งแย่กว่าไม่มี
 * → เทียบเนื้อหาทุกครั้งด้วย `normalize()` เท่านั้น
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const P = require('./lib/sdf_payload');

const REPO = path.join(__dirname, '..');

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function opt(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
const positional = argv.filter((a, i) =>
  a.indexOf('--') !== 0 && (i === 0 || argv[i - 1].indexOf('--') !== 0));
const STAGING = path.resolve(positional[0] || path.join(REPO, '../.deploy-staging/wo-trace-prod'));
const PROJ = path.join(STAGING, 'src');
// บัญชี production ที่คาดไว้ · เปลี่ยนได้ด้วย --account เพื่อให้สคริปต์ใช้กับ payload อื่นได้
const PROD_ACCOUNT = opt('account', '9751184');
const REPO_ACCOUNT = '9751184_SB1';   // ต้องคงไว้แบบนี้ ตามคำตัดสินของ epic #7

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** tag ที่ใช้เทียบ — ระบุด้วย --tag หรือให้เลือก prod/* ตัวล่าสุดตามชื่อ (ชื่อลงท้ายด้วยวันที่) */
function pickTag() {
  const explicit = opt('tag', null);
  if (explicit) return explicit;
  const tags = git(['tag', '-l', 'prod/*']).split('\n').map((s) => s.trim()).filter(Boolean).sort();
  return tags[tags.length - 1] || null;
}

const normalize = (s) => String(s).replace(/\r\n/g, '\n');

// ── ตัวรายงานผล ─────────────────────────────────────────────────────────────
let failed = 0;
let checked = 0;
function check(n, title, fn) {
  checked++;
  let problems;
  try {
    problems = fn() || [];
  } catch (e) {
    problems = ['ตรวจไม่สำเร็จ: ' + e.message];
  }
  if (problems.length) {
    failed++;
    console.log('  ✕ ข้อ ' + n + ' — ' + title);
    problems.forEach((p) => console.log('        ' + p));
  } else {
    console.log('  ✓ ข้อ ' + n + ' — ' + title);
  }
}

console.log('\npayload : ' + STAGING);
const TAG = pickTag();
console.log('tag     : ' + (TAG || '(ไม่พบ tag prod/*)'));
console.log('repo    : ' + REPO + '\n');

if (!fs.existsSync(PROJ)) {
  console.log('ไม่พบ ' + PROJ + ' — ระบุ path ของ staging เป็น argument แรก');
  process.exit(1);
}

const d = P.readDeployPaths(PROJ);
const jsOnDisk = P.listFileCabinetJs(PROJ);
const objOnDisk = P.listObjectXml(PROJ);

// ── 1 ───────────────────────────────────────────────────────────────────────
check(1, 'deploy.xml ไม่มี wildcard และจำนวน <path> = จำนวนไฟล์ที่มีจริงใน payload', () => {
  const out = [];
  if (d.wildcards.length) out.push('มี wildcard: ' + d.wildcards.join(' '));
  const missing = jsOnDisk.filter((f) => d.files.indexOf(f) < 0);
  const ghost = d.files.filter((f) => jsOnDisk.indexOf(f) < 0);
  if (missing.length) out.push('มีไฟล์ใน payload แต่ไม่อยู่ใน deploy.xml: ' + missing.join(' '));
  if (ghost.length) out.push('อยู่ใน deploy.xml แต่ไม่มีไฟล์จริง: ' + ghost.join(' '));
  const objMissing = objOnDisk.filter((o) => d.objects.indexOf(o) < 0);
  if (objMissing.length) out.push('object ที่ไม่อยู่ใน deploy.xml: ' + objMissing.join(' '));
  return out;
});

// ── 2 ───────────────────────────────────────────────────────────────────────
// เคสที่ข้อนี้มีอยู่เพื่อมัน: main วันนี้มี WOCostTrace.js ที่ require './WOReportTheme'
// วันที่ใครรีเฟรช payload จาก main แล้วลืมเอา lib มาด้วย prod จะตายทั้งตัว
check(2, 'AMD dependency closure — ทุก define([...]) ที่อ้าง relative module อยู่ใน deploy.xml', () =>
  P.dependencyClosureProblems(PROJ, d.files));

// ── 3 ───────────────────────────────────────────────────────────────────────
check(3, '<scriptfile> ของทุก object ชี้ไฟล์ที่มีจริง โดยสนตัวพิมพ์เล็กใหญ่', () =>
  P.scriptFileProblems(PROJ, d.objects));

// ── 4 ───────────────────────────────────────────────────────────────────────
// ค่าที่ต่างได้มีตัวเดียวคือ loglevel (production เงียบกว่า sandbox โดยตั้งใจ)
// scriptid/deployid/scriptfile/status/audience ต่าง = payload ไม่ใช่ของที่ tag ไว้
const OBJ_FIELDS = ['scriptid', 'scriptfile', 'status', 'allroles', 'audslctrole', 'runasrole', 'isonline'];
check(4, 'object ของ staging เทียบ tag ต่างได้เฉพาะ loglevel', () => {
  if (!TAG) return ['ไม่มี tag ให้เทียบ'];
  const out = [];
  d.objects.forEach((op) => {
    const rel = 'src/' + op.replace(/^~\//, '');
    let tagXml;
    try {
      tagXml = git(['show', TAG + ':' + rel]);
    } catch (e) {
      out.push(op + ' — ไม่มีไฟล์นี้ที่ tag ' + TAG);
      return;
    }
    const tmpRead = (xml) => {
      const one = (tag) => {
        const m = P.stripXmlComments(xml).match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
        return m ? m[1].trim() : null;
      };
      const o = { loglevel: one('loglevel') };
      OBJ_FIELDS.forEach((f) => { o[f] = f === 'scriptid' ? null : one(f); });
      const m = P.stripXmlComments(xml).match(/scriptid="([^"]*)"/);
      o.scriptid = m ? m[1] : null;
      o.deployids = (xml.match(/<scriptdeployment[^>]*scriptid="([^"]*)"/g) || [])
        .map((s) => s.replace(/.*scriptid="/, '').replace(/"$/, '')).join(',');
      return o;
    };
    const mine = tmpRead(fs.readFileSync(P.resolveSdfPath(PROJ, op), 'utf8'));
    const theirs = tmpRead(tagXml);
    OBJ_FIELDS.concat(['deployids']).forEach((f) => {
      if (String(mine[f]) !== String(theirs[f])) {
        out.push(op + ' — ' + f + ' ต่าง: staging=' + mine[f] + ' tag=' + theirs[f]);
      }
    });
    // นอกเหนือจากช่องที่ระบุชื่อ ยังต้องไม่มีบรรทัดอื่นต่าง — เทียบทั้งไฟล์
    // โดยลบบรรทัด loglevel ออกจากทั้งสองฝั่ง (ช่องเดียวที่ยอมให้ต่าง)
    const strip = (s) => normalize(s).split('\n').filter((l) => l.indexOf('<loglevel>') < 0).join('\n');
    if (strip(fs.readFileSync(P.resolveSdfPath(PROJ, op), 'utf8')) !== strip(tagXml)) {
      out.push(op + ' — มีบรรทัดอื่นนอกจาก <loglevel> ที่ต่างจาก tag');
    }
  });
  return out;
});

// ── 5 ───────────────────────────────────────────────────────────────────────
check(5, 'loglevel ของ staging = ERROR', () => {
  const out = [];
  d.objects.forEach((op) => {
    const lv = P.readObjectXml(PROJ, op).loglevel;
    if (lv !== 'ERROR') out.push(op + ' — loglevel = ' + lv + ' (production ต้องเป็น ERROR)');
  });
  return out;
});

// ── 6 ───────────────────────────────────────────────────────────────────────
// ทุกไฟล์ ไม่ใช่แค่ entry · normalize ก่อนเทียบเสมอ (ดูหัวไฟล์)
check(6, 'ไฟล์ js ทุกไฟล์เท่ากับ git show <tag>:<path> (normalize ปลายบรรทัดแล้ว)', () => {
  if (!TAG) return ['ไม่มี tag ให้เทียบ'];
  const out = [];
  jsOnDisk.forEach((f) => {
    const rel = 'src/' + f.replace(/^~\//, '');
    let atTag;
    try {
      atTag = git(['show', TAG + ':' + rel]);
    } catch (e) {
      out.push(f + ' — ไม่มีไฟล์นี้ที่ tag ' + TAG + ' (payload มีไฟล์ที่ tag ไม่มี)');
      return;
    }
    const mine = fs.readFileSync(P.resolveSdfPath(PROJ, f), 'utf8');
    if (normalize(mine) !== normalize(atTag)) {
      const a = normalize(mine).split('\n');
      const b = normalize(atTag).split('\n');
      let at = -1;
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) { at = i + 1; break; }
      }
      out.push(f + ' — ต่างจาก tag (บรรทัดแรกที่ต่าง: ' + at
        + ' · staging ' + a.length + ' บรรทัด · tag ' + b.length + ' บรรทัด)');
    }
  });
  return out;
});

// ── 7 ───────────────────────────────────────────────────────────────────────
check(7, 'project.json — staging ชี้ production และ repo ยังชี้ ' + REPO_ACCOUNT, () => {
  const out = [];
  const read = (p) => {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')).defaultAuthId; }
    catch (e) { return '(อ่านไม่ได้: ' + e.message + ')'; }
  };
  const s = read(path.join(STAGING, 'project.json'));
  const r = read(path.join(REPO, 'project.json'));
  if (s !== PROD_ACCOUNT) out.push('staging defaultAuthId = ' + s + ' คาดว่า ' + PROD_ACCOUNT);
  if (/_SB\d*$/i.test(String(s))) out.push('staging ชี้บัญชี sandbox (' + s + ') — payload นี้ต้องชี้ production');
  if (r !== REPO_ACCOUNT) {
    out.push('repo defaultAuthId = ' + r + ' ต้องเป็น ' + REPO_ACCOUNT
      + ' — สลับ project.json ของ repo ไปบัญชีจริงคือทางที่ทำให้ทับ WOStatusTracking*.js');
  }
  return out;
});

// ── 8 ───────────────────────────────────────────────────────────────────────
check(8, 'tag ชี้ commit ที่มีอยู่จริงและ reachable จาก main', () => {
  if (!TAG) return ['ไม่พบ tag prod/* ใน repo'];
  const out = [];
  let sha;
  try {
    sha = git(['rev-list', '-1', TAG]).trim();
  } catch (e) {
    return ['tag ' + TAG + ' ไม่มีอยู่จริงใน repo นี้'];
  }
  if (!/^[0-9a-f]{40}$/.test(sha)) out.push('tag ' + TAG + ' ไม่ได้ชี้ commit: ' + sha);
  try {
    git(['merge-base', '--is-ancestor', sha, 'main']);
  } catch (e) {
    out.push('commit ' + sha.substring(0, 8) + ' ไม่ reachable จาก main'
      + ' — ของที่อยู่บน production ต้องตามกลับมาที่ main ได้');
  }
  return out;
});

// ── สรุป ────────────────────────────────────────────────────────────────────
console.log('');
if (failed) {
  console.log(failed + ' จาก ' + checked + ' ข้อไม่ผ่าน — อย่ายิงจนกว่าจะแก้ครบ');
  process.exit(1);
}
console.log('ผ่านทั้ง ' + checked + ' ข้อ — payload ตรงกับ tag ' + TAG + ' และยังมี policy ของ production ครบ');
console.log('(ตัวตรวจนี้ไม่ได้ตรวจว่าบัญชีปลายทางมีอะไรอยู่ — ต้องอ่าน dry-run ต่อเอง)');
process.exit(0);
