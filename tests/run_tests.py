"""LIT-style test runner.

Each test file contains directive comments:
    ! EXPECT: <rule-name>     — that rule must fire at least once
    ! EXPECT-NONE             — no diagnostics expected
A file may contain multiple ! EXPECT lines.
"""
from __future__ import annotations
import os
import re
import sys
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from mpicheck.analyzer import FortranSourceUnit
from mpicheck.diagnostics import DiagnosticCollector
from mpicheck import rules

GREEN = "\033[32m"
RED = "\033[31m"
YEL = "\033[33m"
CYA = "\033[36m"
RST = "\033[0m"


def parse_directives(path: str):
    expects = []
    expect_none = False
    with open(path, "r", encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if not ln.startswith("!"):
                continue
            m = re.search(r"!\s*EXPECT-NONE\b", ln, re.IGNORECASE)
            if m:
                expect_none = True
                continue
            m = re.search(r"!\s*EXPECT:\s*([A-Za-z0-9_\-]+)", ln, re.IGNORECASE)
            if m:
                expects.append(m.group(1))
    return expects, expect_none


def run_one(path: str):
    expects, expect_none = parse_directives(path)
    diag = DiagnosticCollector(path)
    try:
        unit = FortranSourceUnit(path)
        rules.run_all(unit, diag)
    except Exception as e:
        return False, [f"PARSE FAIL: {e}"], []
    fired = {d.rule for d in diag.items if d.severity in ("error", "warning")}
    msgs = [d.format() for d in diag.items]
    if expect_none:
        if fired:
            return False, [f"expected NO diagnostics, got: {sorted(fired)}"] + msgs, msgs
        return True, [], msgs
    missing = [r for r in expects if r not in fired]
    if missing:
        return False, [f"missing expected rules: {missing}; fired: {sorted(fired)}"] + msgs, msgs
    return True, [], msgs


def main() -> int:
    suite_dirs = [os.path.join(HERE, "bugs"), os.path.join(HERE, "clean")]
    files = []
    for d in suite_dirs:
        files.extend(sorted(glob.glob(os.path.join(d, "*.f90"))))
    passed = 0
    failed_items = []
    for f in files:
        rel = os.path.relpath(f, ROOT)
        ok, errs, msgs = run_one(f)
        if ok:
            print(f"{GREEN}PASS{RST}  {rel}")
            passed += 1
        else:
            print(f"{RED}FAIL{RST}  {rel}")
            for e in errs:
                print(f"    {YEL}{e}{RST}")
            failed_items.append(rel)
    total = len(files)
    print()
    print(f"{CYA}== {passed}/{total} passed =={RST}")
    if failed_items:
        print(f"{RED}Failed:{RST}")
        for f in failed_items:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
