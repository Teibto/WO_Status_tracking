#!/usr/bin/env python3
"""Generate and validate Teibto GitHub Issues with one deterministic schema.

@author Wichit Wongta @since 2026-08-18
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

TYPE_SPECS: dict[str, dict[str, Any]] = {
    "bug": {
        "prefix": "Bug",
        "label": "bug",
        "fields": [
            ("problem", "ปัญหา / อาการ"),
            ("actual", "ผลที่พบ"),
            ("expected", "ผลที่ควรเป็น"),
            ("reproduction", "ขั้นตอนทำซ้ำ"),
            ("environment", "สภาพแวดล้อม"),
            ("evidence", "หลักฐาน"),
            ("impact", "ผลกระทบ"),
            ("acceptance", "เกณฑ์ตรวจรับ"),
            ("unknowns", "สิ่งที่ยังไม่ยืนยัน"),
        ],
    },
    "enhancement": {
        "prefix": "Enhancement",
        "label": "enhancement",
        "fields": [
            ("problem", "ปัญหา / ความต้องการ"),
            ("outcome", "ผลลัพธ์ที่ต้องการ"),
            ("scope", "ขอบเขต"),
            ("out_of_scope", "นอกขอบเขต"),
            ("acceptance", "เกณฑ์ตรวจรับ"),
            ("dependencies", "Dependencies / Open questions"),
        ],
    },
    "chore": {
        "prefix": "Chore",
        "label": "chore",
        "fields": [
            ("work", "งาน"),
            ("reason", "เหตุผล"),
            ("scope", "ขอบเขต"),
            ("done", "เช็คว่าเสร็จ"),
        ],
    },
    "docs": {
        "prefix": "Docs",
        "label": "documentation",
        "fields": [
            ("work", "งาน"),
            ("reason", "เหตุผล"),
            ("scope", "ขอบเขต"),
            ("done", "เช็คว่าเสร็จ"),
        ],
    },
    "epic": {
        "prefix": "Epic",
        "label": "epic",
        "fields": [
            ("goal", "เป้าหมาย"),
            ("measurable_outcome", "ผลลัพธ์ที่วัดได้"),
            ("scope", "ขอบเขต"),
            ("children", "Child issues"),
            ("exit_criteria", "Exit criteria"),
        ],
    },
    "intake": {
        "prefix": "Intake",
        "label": "intake",
        "fields": [
            ("source", "ต้นทาง"),
            ("summary", "สรุปคำขอ"),
            ("context", "บริบท"),
            ("verification", "สถานะการยืนยัน"),
            ("triage", "เกณฑ์การคัดแยก"),
        ],
    },
}

PREFIX_TO_KIND = {spec["prefix"].lower(): kind for kind, spec in TYPE_SPECS.items()}
TYPE_LABELS = {spec["label"] for spec in TYPE_SPECS.values()}
# ค่าที่อนุญาตของ namespace label (ISSUE-STANDARD.md §2) — `source:` เปล่า ๆ ไม่นับว่ามีข้อมูล
SOURCE_VALUES = {"slack", "user", "monitor", "review"}
VERIFICATION_VALUES = {"confirmed", "suspected", "needs-info"}
PROFILES = {"generic", "delivery", "netsuite", "erp", "intake"}
ERP_HEADINGS = ["Module", "Change risk", "Primary executor", "Shared-resource claims"]
DELIVERY_HEADINGS = ["Module", "Change risk", "Priority", "Phase"]
ERP_FORM_INTRO = """  - type: markdown
    attributes:
      value: |
        Title: เติม `<MODULE>] สรุป outcome` ต่อจาก prefix ที่ form ใส่ให้
        และเพิ่ม label `area:<module>`
"""
ERP_FORM_METADATA = """
  - type: input
    id: module
    attributes:
      label: Module
      description: "Module code ที่เป็นเจ้าของงาน เช่น COR, MDM, SEC, TAX, SAL, RPT หรือ Cross-module"
    validations:
      required: true
  - type: dropdown
    id: change_risk
    attributes:
      label: Change risk
      description: "ความเสี่ยงจากการ merge/deploy ไม่ใช่ Severity หรือ Delivery Health"
      options:
        - Low
        - Medium
        - High
    validations:
      required: true
  - type: dropdown
    id: primary_executor
    attributes:
      label: Primary executor
      options:
        - Human
        - Claude Code
        - Codex
        - Grok
        - Mixed
    validations:
      required: true
  - type: textarea
    id: shared_resource_claims
    attributes:
      label: Shared-resource claims
      description: "Migration/error-code range, ADR/status/registry/workflow หรือ none"
      value: "none"
    validations:
      required: true
"""
NETSUITE_FORM_METADATA = """
  - type: input
    id: module
    attributes:
      label: Module
      description: "Area/module ที่เป็นเจ้าของงาน เช่น MRP, PWOC, MES, WMS หรือ Cross-module"
    validations:
      required: true
  - type: dropdown
    id: change_risk
    attributes:
      label: Change risk
      description: "ความเสี่ยงจากการ merge/deploy ไม่ใช่ Severity หรือ Delivery Health"
      options:
        - Low
        - Medium
        - High
    validations:
      required: true
  - type: dropdown
    id: primary_executor
    attributes:
      label: Primary executor
      options:
        - Human
        - Claude Code
        - Codex
        - Grok
        - Mixed
    validations:
      required: true
  - type: textarea
    id: shared_resource_claims
    attributes:
      label: Shared-resource claims
      description: >-
        Account/SB, subsidiary, location, setup record, deploy file,
        QA browser หรือ none
      value: "none"
    validations:
      required: true
"""
DELIVERY_FORM_METADATA = """
  - type: input
    id: module
    attributes:
      label: Module
      description: "Module/area หลักที่เป็นเจ้าของ outcome นี้"
    validations:
      required: true
  - type: dropdown
    id: change_risk
    attributes:
      label: Change risk
      description: "ความเสี่ยงจากการ merge/deploy ไม่ใช่ Severity หรือ Delivery Health"
      options:
        - Low
        - Medium
        - High
    validations:
      required: true
  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - P0 Critical
        - P1 High
        - P2 Normal
        - P3 Later
    validations:
      required: true
  - type: input
    id: phase
    attributes:
      label: Phase
      description: "Phase/milestone ของ delivery board"
    validations:
      required: true
  - type: dropdown
    id: primary_executor
    attributes:
      label: Primary executor
      description: "เลือกเมื่อมี branch/worktree จองแล้ว"
      options:
        - Human
        - Claude Code
        - Codex
        - Grok
        - Mixed
    validations:
      required: false
  - type: textarea
    id: shared_resource_claims
    attributes:
      label: Shared-resource claims
      description: "ไฟล์/ระบบ/บัญชี/สภาพแวดล้อมที่อาจชนกับงานอื่น หรือ none"
      value: "none"
    validations:
      required: true
"""
COLLOQUIAL = {
    "หยุดเลือด": "หยุดผลกระทบชั่วคราว",
    "ระเบิด": "เกิดข้อผิดพลาด/เกิดผลกระทบ",
    "เจ็บจริง": "มีผลกระทบที่ยืนยันแล้ว",
    "ของแปลกใหม่": "พฤติกรรมที่ไม่สอดคล้องกับรูปแบบเดิม",
}
PLACEHOLDER_RE = re.compile(r"^(?:\.{2,}|<[^>]+>|tbd|todo|n/?a)$", re.IGNORECASE)
TITLE_RE = re.compile(r"^\[([^\]]+)\](?:\[([^\]]+)\])?\s+(.+)$")
HEADING_RE = re.compile(r"^(#{2,3})\s+(.+?)\s*$", re.MULTILINE)
FENCE_RE = re.compile(r"^\s*(`{3,}|~{3,})")
LEADING_HASH_RE = re.compile(r"^(\s*)(#{1,6})")


def _mask_code_fences(body: str) -> str:
    """แทน `#` ต้นบรรทัดที่อยู่ใน code fence ด้วยช่องว่างจำนวนเท่ากัน

    ตัวอย่าง markdown ในเทมเพลตมี `## หัวข้อ` อยู่ใน fence — ถ้าไม่ปิดบัง issue ที่แปะ
    เทมเพลตไว้ใน code block จะถูกนับว่ามี section ครบทั้งที่ยังไม่ได้กรอกอะไรเลย
    (gate ที่ผ่านเพราะตรวจไม่เป็น) · แทนทีละตัวอักษรเพื่อให้ความยาว/offset เท่าเดิม
    เนื้อ section จึงยังถูกตัดออกมาได้เหมือนเดิม
    """
    lines = body.split("\n")
    fence = ""
    for index, line in enumerate(lines):
        hit = FENCE_RE.match(line)
        if hit:
            token = hit.group(1)[:3]
            if not fence:
                fence = token
            elif token == fence:
                fence = ""
            continue
        if fence:
            lines[index] = LEADING_HASH_RE.sub(
                lambda m: m.group(1) + " " * len(m.group(2)), line
            )
    return "\n".join(lines)


class InputError(ValueError):
    """Input is malformed or incomplete."""


def _stdout_utf8() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def _read_json(path: str) -> dict[str, Any]:
    try:
        raw = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
        value = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        raise InputError(f"อ่าน JSON ไม่ได้: {exc}") from exc
    if not isinstance(value, dict):
        raise InputError("JSON ระดับบนสุดต้องเป็น object")
    return value


def _label_names(raw: Any) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise InputError("labels ต้องเป็น array")
    labels: list[str] = []
    for item in raw:
        if isinstance(item, str):
            name = item
        elif isinstance(item, dict) and isinstance(item.get("name"), str):
            name = item["name"]
        else:
            raise InputError("label แต่ละตัวต้องเป็น string หรือ object ที่มี name")
        name = name.strip()
        if name and name not in labels:
            labels.append(name)
    return labels


def _slug(value: str) -> str:
    text = unicodedata.normalize("NFKC", value).strip().lower()
    text = re.sub(r"[^\wก-๙]+", "-", text, flags=re.UNICODE)
    return text.strip("-")


def _clean_text(value: Any, field: str) -> str:
    if isinstance(value, list):
        text = "\n".join(str(x) for x in value)
    elif value is None:
        text = ""
    else:
        text = str(value)
    text = text.strip()
    if not text:
        raise InputError(f"fields.{field} หายหรือว่าง")
    return text


def generate_issue(data: dict[str, Any]) -> dict[str, Any]:
    kind = str(data.get("kind") or "").strip().lower()
    if kind not in TYPE_SPECS:
        raise InputError(f"kind ต้องเป็นหนึ่งใน: {', '.join(TYPE_SPECS)}")
    summary = str(data.get("summary") or "").strip()
    if not summary:
        raise InputError("summary หายหรือว่าง")
    if "\n" in summary:
        raise InputError("summary ต้องอยู่บรรทัดเดียว")
    area = str(data.get("area") or "").strip()
    fields = data.get("fields")
    if not isinstance(fields, dict):
        raise InputError("fields ต้องเป็น object")

    spec = TYPE_SPECS[kind]
    title = f"[{spec['prefix']}]"
    if area:
        title += f"[{area}]"
    title += f" {summary}"

    body_parts: list[str] = []
    for key, heading in spec["fields"]:
        body_parts.extend([f"## {heading}", "", _clean_text(fields.get(key), key), ""])

    extras = data.get("extras") or {}
    if not isinstance(extras, dict):
        raise InputError("extras ต้องเป็น object")
    for heading, value in extras.items():
        heading_text = str(heading).strip()
        if not heading_text:
            raise InputError("ชื่อ heading ใน extras ห้ามว่าง")
        body_parts.extend([f"### {heading_text}", "", _clean_text(value, heading_text), ""])

    labels = [label for label in _label_names(data.get("labels")) if label not in TYPE_LABELS]
    labels.insert(0, spec["label"])
    if area:
        area_label = f"area:{_slug(area)}"
        labels = [label for label in labels if not label.startswith("area:")]
        labels.append(area_label)

    return {
        "kind": kind,
        "title": title,
        "body": "\n".join(body_parts).rstrip() + "\n",
        "labels": labels,
    }


def _sections(body: str) -> tuple[dict[str, str], list[str]]:
    body = _mask_code_fences(body)
    hits = list(HEADING_RE.finditer(body))
    sections: dict[str, str] = {}
    order: list[str] = []
    for index, hit in enumerate(hits):
        name = hit.group(2).strip()
        start = hit.end()
        end = hits[index + 1].start() if index + 1 < len(hits) else len(body)
        sections[name] = body[start:end].strip()
        order.append(name)
    return sections, order


def _finding(level: str, code: str, message: str, suggestion: str = "") -> dict[str, str]:
    value = {"level": level, "code": code, "message": message}
    if suggestion:
        value["suggestion"] = suggestion
    return value


def _strip_code(body: str) -> str:
    return re.sub(r"```.*?```", "", body, flags=re.DOTALL)


def validate_issue(issue: dict[str, Any], profile: str) -> dict[str, Any]:
    if profile not in PROFILES:
        raise InputError(f"profile ต้องเป็นหนึ่งใน: {', '.join(sorted(PROFILES))}")
    title = str(issue.get("title") or "").strip()
    body = str(issue.get("body") or "")
    labels = _label_names(issue.get("labels"))
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    match = TITLE_RE.match(title)
    kind: str | None = None
    area = ""
    summary = ""
    if not match:
        errors.append(_finding(
            "error", "title.format", "title ต้องเป็น [Type][Area] สรุป หรือ [Type] สรุป",
            "ใช้ Type จาก Bug/Enhancement/Chore/Docs/Epic/Intake",
        ))
    else:
        prefix, area, summary = match.groups()
        kind = PREFIX_TO_KIND.get(prefix.lower())
        if kind is None:
            errors.append(_finding(
                "error", "title.type", f"Type [{prefix}] ไม่อยู่ในมาตรฐาน",
                "ใช้ Bug, Enhancement, Chore, Docs, Epic หรือ Intake",
            ))
        if re.fullmatch(r"P[0-3]", prefix, flags=re.IGNORECASE):
            errors.append(_finding(
                "error", "title.priority", "ห้ามใช้ Priority เป็น Type ใน title",
                "ย้ายไป Project field หรือ label priority:P0–priority:P3",
            ))
        if not summary.strip():
            errors.append(_finding("error", "title.summary-empty", "title ไม่มีข้อความสรุป"))

    if len(title) > 120:
        errors.append(_finding(
            "error", "title.too-long", f"title ยาว {len(title)} ตัวอักษร (สูงสุด 120)",
            "ย้ายรายละเอียด ตัวเลขหลายชุด และข้อเสนอแก้ไปไว้ใน body",
        ))
    if re.search(r"\[(?:P[0-3]|BLOCKER|HIGH|MEDIUM|LOW|OPEN|CLOSED)\]", title, re.IGNORECASE):
        errors.append(_finding(
            "error", "title.metadata", "title มี priority/severity/status ซึ่งต้องอยู่นอก title",
            "ใช้ Project field หรือ label แบบ namespace",
        ))
    if " + " in title or title.count(" — ") > 1:
        warnings.append(_finding(
            "warning", "scope.multiple-outcomes", "title อาจรวมหลาย outcome ใน issue เดียว",
            "ถ้าแต่ละข้อปิดด้วย PR แยกได้ ให้แตก child issue และใช้ Epic เป็นทะเบียนแม่",
        ))

    present_types = [label for label in labels if label in TYPE_LABELS]
    type_aliases = [label for label in labels if label.startswith("type:")]
    if type_aliases:
        errors.append(_finding(
            "error", "labels.type-alias",
            f"ห้ามใช้ namespaced type label: {type_aliases}",
            "ใช้ bare type label หนึ่งตัว: bug/enhancement/chore/documentation/epic/intake",
        ))
    if len(present_types) != 1:
        errors.append(_finding(
            "error", "labels.type-count",
            f"ต้องมี type label เพียงหนึ่งตัว แต่พบ {len(present_types)}: {present_types}",
        ))
    elif kind and present_types[0] != TYPE_SPECS[kind]["label"]:
        errors.append(_finding(
            "error", "labels.type-mismatch",
            f"title [{TYPE_SPECS[kind]['prefix']}] ไม่ตรงกับ label {present_types[0]}",
            f"ใช้ label {TYPE_SPECS[kind]['label']}",
        ))

    if kind:
        sections, order = _sections(body)
        required = [heading for _, heading in TYPE_SPECS[kind]["fields"]]
        if profile == "erp":
            required += ERP_HEADINGS
        elif profile == "delivery":
            required += DELIVERY_HEADINGS
        for heading in required:
            if heading not in sections:
                errors.append(_finding(
                    "error", "body.section-missing", f"ขาด section: {heading}",
                    f"เพิ่มหัวข้อ ## {heading}",
                ))
            elif not sections[heading] or PLACEHOLDER_RE.fullmatch(sections[heading].strip()):
                errors.append(_finding(
                    "error", "body.section-empty", f"section '{heading}' ว่างหรือยังเป็น placeholder",
                    "ใส่ข้อเท็จจริง หรือเขียนตรง ๆ ว่ายังไม่ยืนยันและต้องเก็บอะไรเพิ่ม",
                ))
        expected_order = [heading for heading in required if heading in sections]
        actual_order = [heading for heading in order if heading in required]
        if actual_order != expected_order:
            warnings.append(_finding(
                "warning", "body.section-order", "ลำดับ section ไม่ตรง schema กลาง",
                "เรียงข้อเท็จจริง/ความต้องการก่อน proposal และ metadata",
            ))
    else:
        sections, _ = _sections(body)

    if profile == "erp" and not area:
        errors.append(_finding(
            "error",
            "profile.area-required",
            f"profile {profile} บังคับ [Area] ใน title",
        ))
    if area:
        expected_area_label = f"area:{_slug(area)}"
        if expected_area_label not in labels:
            errors.append(_finding(
                "error",
                "labels.area-missing",
                f"title มี Area [{area}] แต่ไม่มี label {expected_area_label}",
                f"เพิ่ม label {expected_area_label}",
            ))
    if kind == "intake" or profile == "intake":
        for prefix, allowed in (("source:", SOURCE_VALUES), ("verification:", VERIFICATION_VALUES)):
            slug = prefix.rstrip(":")
            values = [label[len(prefix):].strip() for label in labels if label.startswith(prefix)]
            if not values:
                errors.append(_finding(
                    "error", f"labels.{slug}-missing", f"Intake ต้องมี label {prefix}*",
                ))
                continue
            unknown = [value for value in values if value not in allowed]
            if unknown:
                errors.append(_finding(
                    "error", f"labels.{slug}-value",
                    f"label {prefix}{unknown[0]} ไม่อยู่ในค่าที่กำหนด",
                    "ใช้ " + prefix + "|".join(sorted(allowed)),
                ))
    if profile == "netsuite" and kind == "bug":
        environment = sections.get("สภาพแวดล้อม", "")
        has_account = re.search(
            r"\b(?:SB\d+|Production|\d{5,}(?:_SB\d+)?)\b",
            environment,
            re.IGNORECASE,
        )
        if environment and not has_account:
            warnings.append(_finding(
                "warning", "profile.netsuite-environment",
                "สภาพแวดล้อมยังไม่เห็น Account/SB/Production ที่ระบุชัด",
                "ระบุ Account ID หรือ SB1/SB2/Production และ Subsidiary/Location เมื่อเกี่ยวข้อง",
            ))

    root_cause = sections.get("สาเหตุหลัก", "")
    if root_cause and re.search(r"สงสัย|คาดว่า|อาจ|ยังไม่ได้|ยังไม่ยืนยัน", root_cause):
        warnings.append(_finding(
            "warning", "wording.root-cause-unverified",
            "section สาเหตุหลักมีถ้อยคำที่แปลว่ายังไม่ยืนยัน",
            "เปลี่ยนหัวข้อเป็น ข้อสันนิษฐาน หรือเพิ่มหลักฐานยืนยัน",
        ))

    prose = _strip_code(body)
    for current, replacement in COLLOQUIAL.items():
        if current in prose:
            warnings.append(_finding(
                "warning", "wording.colloquial", f"พบถ้อยคำไม่เป็นกลาง: {current}",
                f"พิจารณาใช้: {replacement}",
            ))
    if prose.count("[BLOCKER]") + prose.count("[HIGH]") > 2 and kind != "epic":
        warnings.append(_finding(
            "warning", "scope.risk-register", "body มีหลาย finding ระดับสูงและอาจเป็นทะเบียนรวม",
            "เปลี่ยนเป็น Epic แล้วแตก defect ที่ assign/ปิดแยกได้เป็น child issue",
        ))

    findings = errors + warnings
    return {
        "valid": not errors,
        "profile": profile,
        "kind": kind,
        "title": title,
        "errors": errors,
        "warnings": warnings,
        "summary": {"errors": len(errors), "warnings": len(warnings)},
        "findings": findings,
    }


def _issue_from_event(event: dict[str, Any]) -> dict[str, Any]:
    issue = event.get("issue")
    if not isinstance(issue, dict):
        raise InputError("GitHub event ไม่มี object issue")
    return {
        "title": issue.get("title", ""),
        "body": issue.get("body", ""),
        "labels": issue.get("labels", []),
    }


def _print_validation(result: dict[str, Any], output_format: str) -> None:
    if output_format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    verdict = "PASS" if result["valid"] else "FAIL"
    print(f"{verdict}: {result['title']}")
    print(f"profile={result['profile']} kind={result['kind']} errors={result['summary']['errors']} "
          f"warnings={result['summary']['warnings']}")
    for finding in result["findings"]:
        print(f"- {finding['level'].upper()} {finding['code']}: {finding['message']}")
        if finding.get("suggestion"):
            print(f"  แนะนำ: {finding['suggestion']}")


def _asset_root() -> Path:
    script = Path(__file__).resolve()
    candidates = [
        script.parent.parent / "templates" / "issue-standard",  # canonical root script
        script.parent.parent / "assets" / "issue-standard",     # installed skill mirror
    ]
    for candidate in candidates:
        if (candidate / "ISSUE_TEMPLATE").is_dir() and (candidate / "workflows").is_dir():
            return candidate
    raise InputError(
        "หา issue-standard assets ไม่พบ; "
        "ใช้ script จาก teibto-dev-standards หรือ skill ที่ sync แล้ว"
    )


def _profile_form(content: str, profile: str, filename: str) -> str:
    """Render profile-only fields without maintaining a second form schema."""
    if filename == "config.yml":
        return content
    if profile == "erp":
        content = re.sub(
            r'(?m)^title: "(\[[^\]]+\]) "$',
            r'title: "\1["',
            content,
            count=1,
        )
        content = content.replace("body:\n", "body:\n" + ERP_FORM_INTRO, 1)
        return content.rstrip() + "\n" + ERP_FORM_METADATA
    if profile == "delivery":
        return content.rstrip() + "\n" + DELIVERY_FORM_METADATA
    if profile == "netsuite":
        return content.rstrip() + "\n" + NETSUITE_FORM_METADATA
    return content


FORM_LABELS_RE = re.compile(r"(?m)^labels:\s*\[(.*)\]\s*$")


def _form_labels(destinations: list[tuple[Path, Path]]) -> set[str]:
    """label ทั้งหมดที่ Issue Form ติดให้เอง — อ่านจากฟอร์มจริง ไม่ใช่รายการที่พิมพ์ซ้ำไว้

    รวม metadata label เช่น `source:user` / `verification:needs-info` ที่ intake.yml ติดให้
    ถ้าไม่รายงาน repo ใหม่จะไม่มี label เหล่านี้ แล้ว validator ก็ฟ้อง intake ทุกใบ
    """
    names: set[str] = set(TYPE_LABELS)
    for source, _ in destinations:
        if source.parent.name != "ISSUE_TEMPLATE":
            continue
        hit = FORM_LABELS_RE.search(source.read_text(encoding="utf-8"))
        if hit:
            names.update(
                part.strip().strip('"').strip("'")
                for part in hit.group(1).split(",")
                if part.strip()
            )
    return names


def _merge_config(existing: str) -> str:
    """Disable blank issues while preserving repo-local contact links and comments."""
    normalized = existing.replace("\r\n", "\n")
    if re.search(r"(?m)^blank_issues_enabled:\s*(?:true|false)\s*$", normalized):
        return re.sub(
            r"(?m)^blank_issues_enabled:\s*(?:true|false)\s*$",
            "blank_issues_enabled: false",
            normalized,
            count=1,
        )
    return "blank_issues_enabled: false\n" + normalized


def install_assets(
    repo_root: str,
    profile: str,
    force: bool,
    dry_run: bool,
    migrate_legacy: bool = False,
) -> dict[str, Any]:
    if profile not in PROFILES:
        raise InputError(f"profile ต้องเป็นหนึ่งใน: {', '.join(sorted(PROFILES))}")
    root = Path(repo_root).resolve()
    if not root.is_dir():
        raise InputError(f"repo root ไม่มีอยู่: {root}")
    asset_root = _asset_root()
    destinations: list[tuple[Path, Path]] = []
    for source in sorted((asset_root / "ISSUE_TEMPLATE").glob("*.yml")):
        destinations.append((source, root / ".github" / "ISSUE_TEMPLATE" / source.name))
    destinations.append((
        asset_root / "workflows" / "issue-standard.yml",
        root / ".github" / "workflows" / "issue-standard.yml",
    ))
    destinations.append((
        Path(__file__).resolve(),
        root / ".github" / "scripts" / "issue-standard.py",
    ))

    conflicts: list[str] = []
    planned: list[str] = []
    written: list[str] = []
    archived: list[str] = []
    removed: list[str] = []

    def archive_form(path: Path) -> bool:
        archive = root / ".github" / "ISSUE_TEMPLATE_ARCHIVE" / path.name
        relative = archive.relative_to(root).as_posix()
        content = path.read_text(encoding="utf-8")
        existing_archive = archive.read_text(encoding="utf-8") if archive.exists() else None
        planned.append(relative)
        if existing_archive is not None and existing_archive != content:
            conflicts.append(relative)
            return False
        if not dry_run and existing_archive is None:
            archive.parent.mkdir(parents=True, exist_ok=True)
            archive.write_text(content, encoding="utf-8", newline="\n")
            written.append(relative)
        archived.append(relative)
        return True

    for source, destination in destinations:
        relative = destination.relative_to(root).as_posix()
        planned.append(relative)
        content = source.read_text(encoding="utf-8")
        if source.parent.name == "ISSUE_TEMPLATE":
            content = _profile_form(content, profile, source.name)
        if destination.name == "issue-standard.yml" and destination.parent.name == "workflows":
            content = re.sub(
                r"(?m)^  ISSUE_PROFILE: (?:generic|delivery|netsuite|erp|intake)$",
                f"  ISSUE_PROFILE: {profile}",
                content,
                count=1,
            )
        existing = destination.read_text(encoding="utf-8") if destination.exists() else None
        safe_config_merge = source.name == "config.yml" and existing is not None
        if safe_config_merge:
            content = _merge_config(existing)
        if existing is not None and existing != content and not safe_config_merge:
            if migrate_legacy and source.parent.name == "ISSUE_TEMPLATE":
                if not archive_form(destination):
                    continue
            elif not force:
                conflicts.append(relative)
                continue
        if not dry_run and existing != content:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(content, encoding="utf-8", newline="\n")
            written.append(relative)

    form_dir = root / ".github" / "ISSUE_TEMPLATE"
    canonical_names = {
        source.name
        for source, _ in destinations
        if source.parent.name == "ISSUE_TEMPLATE"
    }
    extra_paths: list[Path] = []
    if form_dir.is_dir():
        extra_paths = sorted(
            (path for path in form_dir.glob("*.yml") if path.name not in canonical_names),
            key=lambda path: path.name,
        )
    legacy_forms = [path.name for path in extra_paths]
    if migrate_legacy:
        for path in extra_paths:
            if archive_form(path):
                relative = path.relative_to(root).as_posix()
                if not dry_run:
                    path.unlink()
                removed.append(relative)
    extra_forms = legacy_forms if dry_run or not migrate_legacy else [
        path.name for path in extra_paths if path.exists()
    ]
    return {
        "ok": not conflicts,
        "profile": profile,
        "dry_run": dry_run,
        "planned": planned,
        "written": written,
        "conflicts": conflicts,
        "archived": archived,
        "removed": removed,
        "legacy_forms": legacy_forms,
        "extra_forms": extra_forms,
        "required_labels": sorted(_form_labels(destinations) | {"needs-normalization"}),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate/validate Teibto GitHub Issues")
    sub = parser.add_subparsers(dest="command", required=True)

    generate = sub.add_parser("generate", help="สร้าง title/body/labels จาก JSON input")
    generate.add_argument("--input", required=True, help="ไฟล์ JSON หรือ - สำหรับ stdin")

    validate = sub.add_parser("validate", help="ตรวจ issue JSON หรือ GitHub event")
    source = validate.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", help="ไฟล์ issue JSON หรือ - สำหรับ stdin")
    source.add_argument("--event", help="ไฟล์ GitHub event JSON")
    validate.add_argument("--profile", choices=sorted(PROFILES), default="generic")
    validate.add_argument("--format", choices=["human", "json"], default="human")

    install = sub.add_parser("install", help="ติดตั้ง Issue Forms/validator/workflow ลง repo")
    install.add_argument("--repo-root", required=True, help="root directory ของ repo ปลายทาง")
    install.add_argument("--profile", choices=sorted(PROFILES), default="generic")
    install.add_argument("--force", action="store_true", help="เขียนทับ canonical destination ที่ต่าง")
    install.add_argument(
        "--migrate-legacy",
        action="store_true",
        help="archive form เดิมก่อนแทนที่/นำออกจากตัวเลือก GitHub",
    )
    install.add_argument("--dry-run", action="store_true", help="รายงานโดยไม่เขียนไฟล์")
    return parser


def main(argv: list[str] | None = None) -> int:
    _stdout_utf8()
    args = build_parser().parse_args(argv)
    try:
        if args.command == "generate":
            print(json.dumps(generate_issue(_read_json(args.input)), ensure_ascii=False, indent=2))
            return 0
        if args.command == "install":
            result = install_assets(
                args.repo_root,
                args.profile,
                args.force,
                args.dry_run,
                args.migrate_legacy,
            )
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0 if result["ok"] else 1
        raw = _read_json(args.input or args.event)
        issue = _issue_from_event(raw) if args.event else raw
        result = validate_issue(issue, args.profile)
        _print_validation(result, args.format)
        return 0 if result["valid"] else 1
    except InputError as exc:
        print(f"INPUT ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
