#!/usr/bin/env python3
"""Tiny ML-inspired heuristic scanner/sanitizer for source files."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

SUSPICIOUS_PATTERNS = {
    "eval_js": re.compile(r"\beval\s*\(", re.IGNORECASE),
    "js_uri": re.compile(r"javascript:", re.IGNORECASE),
    "inline_event": re.compile(r"on\w+\s*=", re.IGNORECASE),
    "obfuscated_charcode": re.compile(r"fromCharCode\s*\(", re.IGNORECASE),
    "base64_exec": re.compile(r"base64_decode\s*\(|atob\s*\(", re.IGNORECASE),
    "shell_exec": re.compile(r"\b(system|exec|popen|subprocess\.)", re.IGNORECASE),
}

ALLOWED_EXTENSIONS = {".html", ".js", ".css", ".py", ".yml", ".yaml", ".md"}
IGNORE_PATHS = {"tiny-ml-report.json", "tools/tiny_ml_guard.py"}


@dataclass
class Finding:
    path: str
    score: int
    reasons: list[str]
    sha256: str


def file_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8", errors="ignore")).hexdigest()


def sanitize_text(content: str) -> str:
    cleaned = re.sub(r"<script[^>]*>.*?</script>", "", content, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"javascript:\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned


def score_text(content: str) -> tuple[int, list[str]]:
    reasons: list[str] = []
    score = 0
    for name, pattern in SUSPICIOUS_PATTERNS.items():
      if pattern.search(content):
          reasons.append(name)
          score += 1
    return score, reasons


def iter_source_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        rel = str(path.relative_to(root)) if path.exists() else ""
        if rel in IGNORE_PATHS:
            continue
        if path.is_file() and path.suffix.lower() in ALLOWED_EXTENSIONS and ".git" not in path.parts:
            yield path


def main() -> int:
    parser = argparse.ArgumentParser(description="Tiny ML guard scanner")
    parser.add_argument("--root", default=".", help="Repository root")
    parser.add_argument("--report", default="tiny-ml-report.json", help="JSON report path")
    parser.add_argument("--sanitize", action="store_true", help="Write sanitized content in-place")
    parser.add_argument("--fail-threshold", type=int, default=3, help="Fail when score is >= threshold")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    findings: list[Finding] = []
    failed = False

    for file in iter_source_files(root):
        raw = file.read_text(encoding="utf-8", errors="ignore")
        score, reasons = score_text(raw)
        sanitized = sanitize_text(raw)

        if args.sanitize and sanitized != raw:
            file.write_text(sanitized, encoding="utf-8")

        rel = str(file.relative_to(root))
        findings.append(Finding(path=rel, score=score, reasons=reasons, sha256=file_hash(sanitized)))

        if score >= args.fail_threshold:
            failed = True

    report = {
        "root": str(root),
        "files_scanned": len(findings),
        "high_risk_files": [f.__dict__ for f in findings if f.score >= args.fail_threshold],
        "findings": [f.__dict__ for f in findings],
    }

    Path(args.report).write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Scanned {len(findings)} files. Report: {args.report}")
    if failed:
        print("Potential malicious patterns detected above threshold.")
        return 1
    print("No files exceeded malicious threshold.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
