"""Evaluation harness — runs mpicheck against a real Fortran MPI codebase.

Default target: NAS Parallel Benchmarks (NPB) MPI Fortran sources.
Download from https://www.nas.nasa.gov/software/npb.html , unpack, then:

    python eval/npb_runner.py /path/to/NPB3.4-MPI

Or any directory containing .f / .f90 sources. The runner walks the tree,
runs mpicheck on each file, classifies diagnostics by rule, and writes a
markdown report `eval/npb_report.md`.
"""
from __future__ import annotations
import argparse
import os
import sys
import time
from collections import Counter, defaultdict
from typing import Dict, List

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from mpicheck.analyzer import FortranSourceUnit
from mpicheck.project import Project, ProjectAwareUnit
from mpicheck.diagnostics import DiagnosticCollector
from mpicheck import rules


def walk_sources(root: str) -> List[str]:
    out = []
    for r, _, files in os.walk(root):
        for f in files:
            if f.lower().endswith((".f", ".f90", ".f95", ".f03", ".f08", ".for")):
                out.append(os.path.join(r, f))
    return sorted(out)


def run(root: str, out_md: str) -> int:
    sources = walk_sources(root)
    if not sources:
        print(f"No Fortran sources found under {root}")
        return 1

    rule_counts: Counter = Counter()
    severity_counts: Counter = Counter()
    per_file: Dict[str, int] = {}
    parse_errors: List[str] = []
    by_rule_examples: Dict[str, List[str]] = defaultdict(list)
    t0 = time.time()

    print(f"Pre-scanning {len(sources)} files for module/USE resolution...")
    project = Project([root])
    for p, err in project.parse_errors:
        parse_errors.append(f"{p}: {err}")
    t_prescan = time.time() - t0
    print(f"Pre-scan complete in {t_prescan:.2f}s ({len(project.module_symbols)} modules)")

    for src in sources:
        diag = DiagnosticCollector(src)
        try:
            unit = ProjectAwareUnit(src, project)
            rules.run_all(unit, diag)
        except Exception as e:
            parse_errors.append(f"{src}: {e}")
            continue
        per_file[src] = len(diag.items)
        for d in diag.items:
            rule_counts[d.rule] += 1
            severity_counts[d.severity] += 1
            if len(by_rule_examples[d.rule]) < 3:
                by_rule_examples[d.rule].append(d.format())

    elapsed = time.time() - t0
    total_diag = sum(rule_counts.values())
    top_files = sorted(per_file.items(), key=lambda kv: -kv[1])[:10]

    with open(out_md, "w", encoding="utf-8") as f:
        f.write(f"# mpicheck — evaluation report\n\n")
        f.write(f"- **Target:** `{root}`\n")
        f.write(f"- **Files scanned:** {len(sources)}\n")
        f.write(f"- **Parse failures:** {len(parse_errors)}\n")
        f.write(f"- **Total diagnostics:** {total_diag}\n")
        f.write(f"- **Wall time:** {elapsed:.2f}s ({elapsed/max(len(sources),1)*1000:.1f} ms/file)\n\n")
        f.write("## By rule\n\n| Rule | Count |\n|------|------|\n")
        for rule, n in rule_counts.most_common():
            f.write(f"| `{rule}` | {n} |\n")
        f.write("\n## By severity\n\n| Severity | Count |\n|----------|------|\n")
        for sev, n in severity_counts.most_common():
            f.write(f"| {sev} | {n} |\n")
        f.write("\n## Top 10 files\n\n| File | Diagnostics |\n|------|-------------|\n")
        for path, n in top_files:
            f.write(f"| `{os.path.relpath(path, root)}` | {n} |\n")
        f.write("\n## Examples per rule\n\n")
        for rule, exs in by_rule_examples.items():
            f.write(f"### `{rule}`\n\n```\n")
            for line in exs:
                f.write(line + "\n")
            f.write("```\n\n")
        if parse_errors:
            f.write("## Parse failures\n\n")
            for e in parse_errors[:50]:
                f.write(f"- `{e}`\n")

    print(f"Wrote {out_md}")
    print(f"Scanned {len(sources)} files in {elapsed:.2f}s — {total_diag} diagnostics")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", help="root of Fortran MPI codebase (e.g. NPB3.4-MPI)")
    ap.add_argument("--out", default=os.path.join(HERE, "npb_report.md"))
    args = ap.parse_args()
    return run(args.root, args.out)


if __name__ == "__main__":
    sys.exit(main())
