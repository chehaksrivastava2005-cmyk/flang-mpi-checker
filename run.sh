#!/usr/bin/env bash
# ============================================================================
# run.sh — Run mpicheck test suite, demo, and evaluation
#
# Usage:
#   ./run.sh              # run everything (tests + demo + eval)
#   ./run.sh tests        # run only the test suite
#   ./run.sh demo         # show a working + failure demo
#   ./run.sh eval         # run NPB evaluation
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
RST='\033[0m'

banner() { echo -e "\n${CYAN}${BOLD}══════════════════════════════════════${RST}"; echo -e "${CYAN}${BOLD}  $1${RST}"; echo -e "${CYAN}${BOLD}══════════════════════════════════════${RST}\n"; }

PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done
[ -z "$PYTHON" ] && { echo -e "${RED}Python not found${RST}"; exit 1; }

MODE="${1:-all}"

# ────────────────────────────────────────────────────────────────
# 1. TEST SUITE
# ────────────────────────────────────────────────────────────────
run_tests() {
    banner "Test Suite (40 Fortran MPI programs)"
    $PYTHON tests/run_tests.py
    echo ""
}

# ────────────────────────────────────────────────────────────────
# 2. DEMO — show working + failure case
# ────────────────────────────────────────────────────────────────
run_demo() {
    banner "Demo: Failure Case"
    echo -e "${YELLOW}→ Running mpicheck on a file with seeded bugs:${RST}"
    echo -e "${YELLOW}  tests/bugs/20_combo.f90 (datatype mismatch + derived type + collective ordering)${RST}"
    echo ""
    $PYTHON -m mpicheck.cli tests/bugs/20_combo.f90 || true
    echo ""

    echo -e "${YELLOW}→ Running mpicheck on a file with Isend buffer aliasing:${RST}"
    echo -e "${YELLOW}  tests/bugs/21_isend_buffer_overwrite.f90${RST}"
    echo ""
    $PYTHON -m mpicheck.cli tests/bugs/21_isend_buffer_overwrite.f90 || true
    echo ""

    echo -e "${YELLOW}→ Running mpicheck on a file with handle leaks:${RST}"
    echo -e "${YELLOW}  tests/bugs/23_datatype_leak.f90${RST}"
    echo ""
    $PYTHON -m mpicheck.cli tests/bugs/23_datatype_leak.f90 || true
    echo ""

    banner "Demo: Clean Pass"
    echo -e "${GREEN}→ Running mpicheck on a clean file:${RST}"
    echo -e "${GREEN}  tests/clean/06_bindc_derived.f90 (correct BIND(C) derived type usage)${RST}"
    echo ""
    $PYTHON -m mpicheck.cli tests/clean/06_bindc_derived.f90
    echo ""

    echo -e "${GREEN}→ Running mpicheck on a correctly matched send/recv:${RST}"
    echo -e "${GREEN}  tests/clean/10_sendrecv_matched.f90${RST}"
    echo ""
    $PYTHON -m mpicheck.cli tests/clean/10_sendrecv_matched.f90
    echo ""

    banner "Demo: JSON Output"
    echo -e "${YELLOW}→ Running mpicheck with --json on a file with bugs:${RST}"
    echo ""
    $PYTHON -m mpicheck.cli --json tests/bugs/04_datatype_kind_mismatch.f90 || true
    echo ""
}

# ────────────────────────────────────────────────────────────────
# 3. EVALUATION — run against synthetic NPB corpus
# ────────────────────────────────────────────────────────────────
run_eval() {
    banner "Evaluation: Synthetic NPB Corpus"
    $PYTHON eval/npb_runner.py eval/synthetic_npb_corpus --out eval/npb_report.md
    echo ""
    echo -e "${GREEN}Report written to eval/npb_report.md${RST}"
    echo ""
    echo -e "${CYAN}--- Report Preview ---${RST}"
    head -40 eval/npb_report.md
    echo ""
}

# ────────────────────────────────────────────────────────────────
# Dispatch
# ────────────────────────────────────────────────────────────────
case "$MODE" in
    tests) run_tests ;;
    demo)  run_demo ;;
    eval)  run_eval ;;
    all)
        run_tests
        run_demo
        run_eval
        banner "All Done"
        echo -e "${GREEN}${BOLD}All checks passed. See docs/EVALUATION.md for full metrics.${RST}"
        ;;
    *)
        echo "Usage: ./run.sh [tests|demo|eval|all]"
        exit 1
        ;;
esac
