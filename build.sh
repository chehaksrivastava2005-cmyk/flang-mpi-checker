#!/usr/bin/env bash
# ============================================================================
# build.sh — Build and install mpicheck
#
# Usage:
#   ./build.sh           # install into current Python environment
#   ./build.sh --venv    # create + activate a venv first
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RST='\033[0m'

banner() { echo -e "\n${CYAN}${BOLD}=== $1 ===${RST}\n"; }
ok()     { echo -e "${GREEN}✓ $1${RST}"; }
fail()   { echo -e "${RED}✗ $1${RST}"; exit 1; }

# ---------- check Python ----------
banner "Checking Python"
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done
[ -z "$PYTHON" ] && fail "Python not found. Install Python 3.10+."

PY_VER=$($PYTHON -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PY_MAJ=$($PYTHON -c 'import sys; print(sys.version_info.major)')
PY_MIN=$($PYTHON -c 'import sys; print(sys.version_info.minor)')

if [ "$PY_MAJ" -lt 3 ] || { [ "$PY_MAJ" -eq 3 ] && [ "$PY_MIN" -lt 10 ]; }; then
    fail "Python $PY_VER found, but 3.10+ required."
fi
ok "Python $PY_VER ($PYTHON)"

# ---------- optional venv ----------
if [[ "${1:-}" == "--venv" ]]; then
    banner "Creating virtual environment"
    $PYTHON -m venv .venv
    # shellcheck disable=SC1091
    source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate 2>/dev/null
    ok "Activated .venv"
fi

# ---------- install ----------
banner "Installing mpicheck"
$PYTHON -m pip install -e . --quiet 2>&1 | tail -3
ok "pip install -e . completed"

# ---------- verify ----------
banner "Verifying installation"

$PYTHON -c "import mpicheck; print(f'  mpicheck version {mpicheck.__version__}')" \
    || fail "mpicheck import failed"
ok "mpicheck importable"

$PYTHON -c "import fparser; print(f'  fparser available')" \
    || fail "fparser not installed"
ok "fparser importable"

# ---------- done ----------
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════╗${RST}"
echo -e "${GREEN}${BOLD}║   mpicheck installed successfully!   ║${RST}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════╝${RST}"
echo ""
echo "Next steps:"
echo "  ./run.sh                             # run tests + eval"
echo "  mpicheck path/to/file.f90            # check a Fortran file"
echo "  mpicheck --help                      # see all options"
echo ""
