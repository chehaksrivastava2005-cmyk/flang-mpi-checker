"""Command-line entry point: `mpicheck <files...>`"""
from __future__ import annotations
import argparse
import json
import os
import sys
from typing import List

from .analyzer import FortranSourceUnit
from .diagnostics import DiagnosticCollector, _supports_color
from .flang_bridge import extract_with_fparser2, extract_with_flang
from .report import generate_summary, format_json_report, format_ascii_chart
from . import rules


def _gather_files(paths: List[str]) -> List[str]:
    out: List[str] = []
    for p in paths:
        if os.path.isdir(p):
            for root, _, files in os.walk(p):
                for f in files:
                    if f.lower().endswith((".f90", ".f95", ".f03", ".f08", ".for", ".f")):
                        out.append(os.path.join(root, f))
        else:
            out.append(p)
    return out


# ── Rule descriptions for --list-rules ──

_RULE_DESCS = {
    "buffer-size":         "count exceeds static buffer extent; send/recv count mismatch",
    "contiguity":          "non-unit-stride section; assumed-shape without CONTIGUOUS attr",
    "datatype-mismatch":   "declared Fortran type/kind disagrees with MPI datatype constant",
    "derived-type-layout": "non-BIND(C) derived type as MPI buffer; mixed-kind components",
    "optional-arg":        "OPTIONAL argument forwarded to MPI without PRESENT() guard",
    "collective-ordering": "collective inside IF (rank == ...) block -> deadlock risk",
    "isend-aliasing":      "buffer accessed between MPI_Isend/Irecv and MPI_Wait",
    "handle-leak":         "MPI handle (datatype, comm, group, window) never freed in scope",
    "datatype-state":      "custom datatype used without commit, or used after free",
    "deadlock-pattern":    "MPI_Ssend without prior Irecv; symmetric recv-then-send",
}


def run(paths: List[str], werror: bool = False, quiet: bool = False,
        backend: str = "fparser2", flang_bin: str = "flang-new",
        json_output: bool = False, use_color: bool = True) -> int:
    files = _gather_files(paths)
    total_errors = 0
    total_warnings = 0
    per_file: List[tuple] = []
    for path in files:
        diag = DiagnosticCollector(path)
        try:
            if backend == "flang":
                try:
                    unit = extract_with_flang(path, flang_bin)
                except Exception as e:
                    diag.warning(0, "backend", f"Flang extraction failed ({e}), falling back to fparser2")
                    unit = extract_with_fparser2(path)
            else:
                unit = extract_with_fparser2(path)
        except Exception as e:
            diag.error(0, "parse-error", f"failed to parse: {e}")
            per_file.append((path, diag))
            total_errors += 1
            continue
        rules.run_all(unit, diag)
        per_file.append((path, diag))
        for d in diag.items:
            if d.severity == "error":
                total_errors += 1
            elif d.severity == "warning":
                total_warnings += 1

    if json_output:
        all_diags = []
        for path, diag in per_file:
            all_diags.extend(diag.to_json())
        summary = {
            "files": len(files),
            "errors": total_errors,
            "warnings": total_warnings,
            "diagnostics": all_diags,
        }
        print(json.dumps(summary, indent=2))
    else:
        for path, diag in per_file:
            out = diag.format_all(color=use_color)
            if out:
                print(out)
        if not quiet:
            print(f"\nmpicheck: {total_errors} error(s), {total_warnings} warning(s) "
                  f"across {len(files)} file(s)")

    if total_errors > 0:
        return 1
    if werror and total_warnings > 0:
        return 1
    return 0


def main() -> int:
    from . import __version__

    ap = argparse.ArgumentParser(
        prog="mpicheck",
        description="Flang-based static MPI correctness checker for Fortran",
        epilog="Report bugs at: https://github.com/your-repo/mpicheck",
    )
    ap.add_argument("files", nargs="*", help="Fortran source files or directories")
    ap.add_argument("--version", action="version",
        version=f"%(prog)s {__version__}")
    ap.add_argument("--werror", action="store_true",
        help="treat warnings as errors (non-zero exit)")
    ap.add_argument("--quiet", action="store_true",
        help="suppress summary line")
    ap.add_argument("--json", action="store_true",
        help="emit diagnostics as JSON (for CI integration)")
    ap.add_argument("--color", action="store_true", default=None,
        help="force colorized output")
    ap.add_argument("--no-color", action="store_true",
        help="disable colorized output")
    ap.add_argument("--list-rules", action="store_true",
        help="list all available rules and exit")
    ap.add_argument("--backend", choices=["fparser2", "flang"], default="fparser2",
        help="backend to use for semantic extraction (default: fparser2)")
    ap.add_argument("--flang-bin", default="flang-new",
        help="path to flang-new binary when using --backend flang")
    args = ap.parse_args()

    if args.list_rules:
        print("Available rules:\n")
        max_name = max(len(r) for r in _RULE_DESCS)
        for rule, desc in _RULE_DESCS.items():
            print(f"  {rule:<{max_name}}  {desc}")
        print(f"\n{len(_RULE_DESCS)} rules total")
        return 0

    if not args.files:
        ap.error("the following arguments are required: files")

    use_color = _supports_color()
    if args.color:
        use_color = True
    if args.no_color:
        use_color = False
    if args.json:
        use_color = False

    return run(args.files, werror=args.werror, quiet=args.quiet,
               backend=args.backend, flang_bin=args.flang_bin,
               json_output=args.json, use_color=use_color)


if __name__ == "__main__":
    sys.exit(main())
