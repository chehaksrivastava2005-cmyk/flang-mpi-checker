"""Rule: MPI_Isend / MPI_Irecv buffer written or read before MPI_Wait.

Static check: within a subroutine, locate `call MPI_Isend(buf,...,req,...)`
or `call MPI_Irecv(buf,...,req,...)`. Walk subsequent executable statements
of the same scope until we hit a `MPI_Wait(req,...)`, `MPI_Waitall`,
`MPI_Test*`. If between the non-blocking call and the wait, a statement
modifies or reads `buf` (assignment, intent(out)/intent(inout) actual arg,
read into buf), flag.

Limitations: intra-procedure only, no def/use chain through called
procedures. Pointer aliasing not tracked.
"""
from __future__ import annotations
from fparser.two.utils import walk
from fparser.two import Fortran2003 as F

from ..mpi_db import normalize

NAME = "isend-aliasing"

NONBLOCKING = {"MPI_Isend", "MPI_Irecv", "MPI_Ibcast", "MPI_Iallreduce"}
WAIT_FNS = {"MPI_Wait", "MPI_Waitall", "MPI_Waitany", "MPI_Waitsome",
            "MPI_Test", "MPI_Testall", "MPI_Testany", "MPI_Testsome"}


def _scope_of(node):
    p = node.parent
    while p is not None:
        if isinstance(p, (F.Subroutine_Subprogram, F.Function_Subprogram,
                          F.Main_Program)):
            return p
        p = getattr(p, "parent", None)
    return None


def _executable_stmts(scope):
    if scope is None:
        return []
    for ch in scope.children:
        if isinstance(ch, F.Execution_Part):
            return [n for n in ch.children]
    return []


def _stmt_writes_to(stmt, buf_name: str) -> bool:
    """Heuristic: does `stmt` (or any nested statement) access `buf_name`?
    Any access (read or write) before MPI_Wait is a data race.
    """
    bn = buf_name.lower()
    for node in walk(stmt, F.Name):
        if node.string.lower() == bn:
            # check if it's inside a WAIT call
            p = node.parent
            in_wait = False
            while p is not None:
                if isinstance(p, F.Call_Stmt):
                    callee = str(p.children[0]).strip().upper()
                    if callee in {w.upper() for w in WAIT_FNS}:
                        in_wait = True
                        break
                p = getattr(p, "parent", None)
            if not in_wait:
                return True
    return False


def _stmt_calls_wait_for(stmt, request_name: str) -> bool:
    for node in walk(stmt, F.Call_Stmt):
        name = normalize(str(node.children[0]).strip())
        if name not in WAIT_FNS:
            continue
        rn = request_name.lower()
        for nm in walk(node, F.Name):
            if nm.string.lower() == rn:
                return True
    return False


def check(unit, diag) -> None:
    for c in unit.calls:
        if c.name not in NONBLOCKING:
            continue
        buf = c.buffers.get("buf") or c.buffers.get("sendbuf") or c.buffers.get("recvbuf")
        if buf is None:
            continue
        request = c.raw_values.get("request")
        if not request:
            continue
        # find the actual Call_Stmt node for this call
        call_nodes = [n for n in walk(unit.tree, F.Call_Stmt)
                      if str(n.children[0]).strip().lower() == c.name.lower()]
        target = None
        for n in call_nodes:
            it = getattr(n, "item", None)
            if it is not None and it.span and it.span[0] == c.line:
                target = n
                break
        if target is None:
            continue
        scope = _scope_of(target)
        stmts = _executable_stmts(scope)
        # find target position
        try:
            idx = stmts.index(target)
        except ValueError:
            # try locating by line in nested constructs
            idx = None
            for i, s in enumerate(stmts):
                it = getattr(s, "item", None)
                if it is not None and it.span and it.span[0] == c.line:
                    idx = i
                    break
            if idx is None:
                continue
        for j in range(idx + 1, len(stmts)):
            stmt = stmts[j]
            if _stmt_calls_wait_for(stmt, request):
                break
            if _stmt_writes_to(stmt, buf.name):
                stmt_line = getattr(getattr(stmt, "item", None), "span", (None,))[0]
                diag.error(stmt_line or c.line, NAME,
                    f"buffer '{buf.name}' is accessed at line {stmt_line} after "
                    f"non-blocking {c.name} at line {c.line} but before "
                    f"MPI_Wait({request}); this races against in-flight MPI operation")
                break
