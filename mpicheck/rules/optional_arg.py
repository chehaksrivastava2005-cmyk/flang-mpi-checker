"""Rule: OPTIONAL argument forwarded to MPI without PRESENT() guard.

If a procedure declares a dummy as OPTIONAL and forwards it to an MPI call
without checking PRESENT(name), the MPI call may receive an unallocated
descriptor / null pointer at runtime. Static check: look for OPTIONAL dummies
used as MPI buffer / count / datatype without a guarding IF (PRESENT(x)).
"""
from __future__ import annotations
import re
from fparser.two.utils import walk
from fparser.two import Fortran2003 as F

from ..analyzer import _scope_node_of, _line_of

NAME = "optional-arg"


def _guard_protects(call_node, name: str) -> bool:
    """Walk ancestors; if any enclosing IF condition contains PRESENT(name), True."""
    p = call_node.parent
    while p is not None:
        if isinstance(p, F.If_Construct):
            first = p.children[0]
            cond = str(first).lower()
            if re.search(rf"present\s*\(\s*{re.escape(name.lower())}\s*\)", cond):
                return True
        if isinstance(p, F.If_Stmt):
            cond = str(p).lower()
            if re.search(rf"present\s*\(\s*{re.escape(name.lower())}\s*\)", cond):
                return True
        p = getattr(p, "parent", None)
    return False


def check(unit, diag) -> None:
    for c in unit.calls:
        # find Call_Stmt node again by line to access parent chain; we have arg_nodes
        # but for guard check we need the call node. Re-walk:
        call_nodes = [n for n in walk(unit.tree, F.Call_Stmt) if _line_of(n) == c.line and
                      str(n.children[0]).strip().lower() == c.name.lower()]
        if not call_nodes:
            continue
        call_node = call_nodes[0]
        # any OPTIONAL buffer argument forwarded without guard?
        for role, buf in c.buffers.items():
            if not buf.is_optional:
                continue
            if not _guard_protects(call_node, buf.name):
                diag.error(c.line, NAME,
                    f"{c.name}: OPTIONAL argument '{buf.name}' (declared at line "
                    f"{buf.decl_line}) is passed as {role} without an enclosing "
                    f"IF (PRESENT({buf.name})) guard; if absent at call site, "
                    f"behavior is undefined")
        # also: non-buffer raw values may name an OPTIONAL scalar (count, datatype, comm)
        scope = _scope_node_of(call_node)
        if scope is None:
            continue
        st = unit.scope_symbols.get(id(scope))
        if st is None:
            continue
        for role, raw in c.raw_values.items():
            if role in ("buf", "sendbuf", "recvbuf"):
                continue
            sym = st.get(raw)
            if sym is not None and sym.is_optional:
                if not _guard_protects(call_node, sym.name):
                    diag.error(c.line, NAME,
                        f"{c.name}: OPTIONAL scalar '{sym.name}' used as {role} without "
                        f"IF (PRESENT({sym.name})) guard")
