/**
 * sdf_payload.js — อ่านและตรวจโครง SDF project หนึ่งชุด (issue #10 · ใช้ต่อที่ #12)
 *
 * ใช้ได้กับทั้ง `src/` ของ repo และ payload ของ production ที่อยู่นอก repo
 * (`.deploy-staging/wo-trace-prod/src/`) เพราะสองที่นั้นมีโครงเดียวกัน
 * ตรรกะจึงอยู่ที่นี่ที่เดียว ไม่ก็อปไปเขียนซ้ำในสคริปต์ตรวจ staging
 *
 * ทุกฟังก์ชัน **อ่านอย่างเดียว** ไม่เขียนไฟล์ ไม่ต่อเน็ต ไม่แตะบัญชี NetSuite
 *
 * parser ที่นี่จงใจไม่ใช้ XML parser จริง — ต้องไม่มี dependency (repo นี้ไม่มี node_modules)
 * และสิ่งที่ต้องอ่านมีแค่ค่าใน tag ชั้นเดียว · แลกด้วยการที่มันไม่เข้าใจ XML ทุกทรง
 * จึงตัดคอมเมนต์ออกก่อนทุกครั้ง ไม่งั้น <path> ที่เขียนไว้ในคอมเมนต์จะถูกนับเป็นของจริง
 */
const fs = require('fs');
const path = require('path');

/** ตัดคอมเมนต์ XML ออก — `<path>` ตัวอย่างในคอมเมนต์ต้องไม่ถูกนับ */
function stripXmlComments(xml) {
  return String(xml).replace(/<!--[\s\S]*?-->/g, '');
}

/** เนื้อหาไฟล์แบบ normalize ปลายบรรทัด — staging เป็น CRLF แต่ blob ใน git เป็น LF */
function readNormalized(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * อ่าน deploy.xml → รายการ path ที่ระบุไว้ แยกฝั่งไฟล์กับฝั่ง object
 * @returns {{files: string[], objects: string[], wildcards: string[]}}
 *   path เก็บตามที่เขียนไว้จริง (ขึ้นต้น `~/`) · `wildcards` คือ path ที่มี `*`
 */
function readDeployPaths(projectDir) {
  const xml = stripXmlComments(fs.readFileSync(path.join(projectDir, 'deploy.xml'), 'utf8'));
  const section = (name) => {
    const m = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
    if (!m) return [];
    return (m[1].match(/<path>([\s\S]*?)<\/path>/g) || [])
      .map((p) => p.replace(/<\/?path>/g, '').trim())
      .filter(Boolean);
  };
  const files = section('files');
  const objects = section('objects');
  return {
    files: files,
    objects: objects,
    wildcards: files.concat(objects).filter((p) => p.indexOf('*') >= 0)
  };
}

/** แปลง path แบบ `~/FileCabinet/...` หรือ `~/Objects/...` เป็น path จริงบนดิสก์ */
function resolveSdfPath(projectDir, sdfPath) {
  return path.join(projectDir, String(sdfPath).replace(/^~\//, ''));
}

/** ไฟล์ .js ทุกไฟล์ที่มีอยู่จริงใต้ FileCabinet — คืนเป็น path แบบ `~/...` เรียงชื่อ */
function listFileCabinetJs(projectDir) {
  const root = path.join(projectDir, 'FileCabinet');
  const out = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const full = path.join(dir, e.name);
      // `.attributes` เป็น metadata ของ File Cabinet ไม่ใช่ source ที่ต้องอยู่ใน deploy.xml
      if (e.isDirectory()) { if (e.name !== '.attributes') walk(full); return; }
      if (e.name.endsWith('.js')) {
        out.push('~/' + path.relative(projectDir, full).split(path.sep).join('/'));
      }
    });
  })(root);
  return out.sort();
}

/** ไฟล์ object xml ทุกไฟล์ที่มีอยู่จริงใต้ Objects — คืนเป็น path แบบ `~/...` */
function listObjectXml(projectDir) {
  const dir = path.join(projectDir, 'Objects');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.xml'))
    .map((f) => '~/Objects/' + f)
    .sort();
}

/**
 * dependency แบบ relative ที่ไฟล์หนึ่งเรียกผ่าน define([...])
 * สนใจแค่ `./ชื่อ` — โมดูลของ NetSuite (`N/query`) ไม่ต้องอยู่ใน deploy.xml
 */
function amdRelativeDeps(src) {
  const m = String(src).match(/define\s*\(\s*\[([\s\S]*?)\]/);
  if (!m) return [];
  return (m[1].match(/['"]\.\/[^'"]+['"]/g) || [])
    .map((s) => s.replace(/['"]/g, ''))
    .map((s) => s.replace(/^\.\//, ''));
}

/**
 * ทุก dependency ของไฟล์ที่อยู่ใน deploy.xml ต้องอยู่ใน deploy.xml ด้วย
 *
 * กันเคส "อัป entry แต่ไม่อัป lib" ซึ่งทำให้ Suitelet ตายทั้งตัวด้วย MODULE_DOES_NOT_EXIST
 * (File Cabinet ไม่มีการอัปหลายไฟล์แบบ atomic — payload ที่ไม่ครบคือหน้าจอขาวของผู้ใช้)
 *
 * @returns {string[]} ข้อความปัญหา · ว่าง = ครบ
 */
function dependencyClosureProblems(projectDir, deployFiles) {
  const listed = {};
  deployFiles.forEach((p) => { listed[p] = true; });
  const problems = [];
  deployFiles.filter((p) => p.endsWith('.js')).forEach((p) => {
    const full = resolveSdfPath(projectDir, p);
    if (!fs.existsSync(full)) { problems.push(p + ' — อยู่ใน deploy.xml แต่ไม่มีไฟล์จริง'); return; }
    const dir = p.substring(0, p.lastIndexOf('/'));
    amdRelativeDeps(fs.readFileSync(full, 'utf8')).forEach((dep) => {
      const depPath = dir + '/' + dep + (dep.endsWith('.js') ? '' : '.js');
      if (!listed[depPath]) {
        problems.push(p + ' require ' + dep + ' แต่ ' + depPath + ' ไม่อยู่ใน deploy.xml');
      } else if (!fs.existsSync(resolveSdfPath(projectDir, depPath))) {
        problems.push(p + ' require ' + dep + ' แต่ไม่มีไฟล์จริงที่ ' + depPath);
      }
    });
  });
  return problems;
}

/** ค่าที่อ่านจาก object xml หนึ่งใบ — เฉพาะช่องที่ตัวตรวจต้องใช้ */
function readObjectXml(projectDir, sdfPath) {
  const xml = stripXmlComments(fs.readFileSync(resolveSdfPath(projectDir, sdfPath), 'utf8'));
  const one = (tag) => {
    const m = xml.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
    return m ? m[1].trim() : null;
  };
  const attr = (name) => {
    const m = xml.match(new RegExp(name + '="([^"]*)"'));
    return m ? m[1] : null;
  };
  return {
    path: sdfPath,
    scriptid: attr('scriptid'),
    scriptfile: one('scriptfile'),
    loglevel: one('loglevel'),
    status: one('status'),
    allroles: one('allroles'),
    audslctrole: one('audslctrole'),
    runasrole: one('runasrole'),
    isonline: one('isonline'),
    // deployid อยู่บน <scriptdeployment scriptid="...">  ซึ่งเป็น attr ตัวที่สองในไฟล์
    deployids: (xml.match(/<scriptdeployment[^>]*scriptid="([^"]*)"/g) || [])
      .map((s) => s.replace(/.*scriptid="/, '').replace(/"$/, ''))
  };
}

/**
 * `<scriptfile>` ของ object ต้องชี้ไฟล์ที่มีอยู่จริง **โดยสนตัวพิมพ์เล็กใหญ่**
 *
 * ที่ต้องเทียบตัวพิมพ์เอง: Windows กับ macOS มองชื่อไฟล์แบบไม่สนตัวพิมพ์
 * `fs.existsSync` จึงตอบว่ามีทั้งที่ File Cabinet ของ NetSuite สนตัวพิมพ์
 * → ผ่านบนเครื่อง แต่ตายบนบัญชี
 */
function scriptFileProblems(projectDir, objectPaths) {
  const problems = [];
  objectPaths.forEach((op) => {
    const obj = readObjectXml(projectDir, op);
    if (!obj.scriptfile) { problems.push(op + ' — ไม่มี <scriptfile>'); return; }
    const ref = obj.scriptfile.replace(/^\[|\]$/g, '');      // รูป `[/SuiteScripts/...]`
    const full = path.join(projectDir, 'FileCabinet', ref.replace(/^\//, ''));
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) { problems.push(op + ' — ไม่มีโฟลเดอร์ ' + ref); return; }
    if (fs.readdirSync(dir).indexOf(path.basename(full)) < 0) {
      problems.push(op + ' — <scriptfile> ชี้ ' + ref + ' ซึ่งไม่มีอยู่จริง (เทียบตัวพิมพ์แล้ว)');
    }
  });
  return problems;
}

module.exports = {
  stripXmlComments,
  readNormalized,
  readDeployPaths,
  resolveSdfPath,
  listFileCabinetJs,
  listObjectXml,
  amdRelativeDeps,
  dependencyClosureProblems,
  readObjectXml,
  scriptFileProblems
};
