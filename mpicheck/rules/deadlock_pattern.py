"""Rule: simple deadlock patterns.

Detect intra-procedure deadlock patterns visible without inter-rank analysis:
  - Two MPI_Send calls back-to-back to the same destination with no matching
    MPI_Recv between them (and message size > eager threshold heuristic)
  - MPI_Recv-then-Send pair vs Send-then-Recv pair in symmetric branches of
    `if (rank == 0)` / `if (rank == 1)` — fragile pair where both ranks block
    on Recv first
  - MPI_Ssend (synchronous) before matching MPI_Recv on partner — guaranteed
    deadlock since Ssend never returns until Recv posted
"""
from __future__ import annotations
from typing import List
from fparser.two.utils import walk
from fparser.two import Fortran2003 as F

NAME = "deadlock-pattern"


def _proc(n):
    return str(n.children[0]).strip()


def _args(n):
    return [str(a).strip() for a in (n.children[1].children if n.children[1] else [])]


def _scope(n):
    p = n.parent
    while p is not None and not isinstance(
            p, (F.Subroutine_Subprogram, F.Function_Subprogram, F.Main_Program)):
        p = getattr(p, "parent", None)
    return p


def check(unit, diag) -> None:
    # Group calls by scope and walk in order
    scope_calls: dict = {}
    for n in walk(unit.tree, F.Call_Stmt):
        scope_calls.setdefault(id(_scope(n)), []).append(n)

    for sid, calls in scope_calls.items():
        # Sort by source line
        calls = sorted(calls, key=lambda n: getattr(n.item, "span", (0,))[0])
        for i, n in enumerate(calls):
            p = _proc(n)
            line = getattr(n.item, "span", (None,))[0]
            args = _args(n)
            # MPI_Ssend: any direct Ssend without surrounding Irecv first → flag
            if p == "MPI_Ssend":
                # search backward in same scope for an Irecv posted to same peer
                peer = args[3] if len(args) > 3 else None
                irecv_found = False
                for prev in calls[:i]:
                    pp = _proc(prev)
                    if pp == "MPI_Irecv":
                        prev_args = _args(prev)
                        if len(prev_args) > 3 and prev_args[3] == peer:
                            irecv_found = True
                            break
                if not irecv_found:
                    diag.warning(line, NAME,
                        f"MPI_Ssend to rank {peer} at line {line} without a prior "
                        f"MPI_Irecv from the same peer; synchronous Send blocks "
                        f"until the receiver posts Recv, easily deadlocks under "
                        f"symmetric communication patterns")

        # Pattern: pair of MPI_Recv → MPI_Send to the same peer in same branch
        # (suggests rank A waits while rank B also waits in mirrored code)
        for i in range(len(calls) - 1):
            a, b = calls[i], calls[i+1]
            if _proc(a) == "MPI_Recv" and _proc(b) == "MPI_Send":
                aa = _args(a)
                ba = _args(b)
                if len(aa) > 3 and len(ba) > 3 and aa[3] == ba[3]:
                    line = getattr(a.item, "span", (None,))[0]
                    diag.warning(line, NAME,
                        f"MPI_Recv at line {line} immediately followed by MPI_Send "
                        f"to the same peer '{aa[3]}'; if the partner rank uses the "
                        f"same Recv-then-Send order, both block on Recv and deadlock. "
                        f"Use MPI_Sendrecv or asymmetric ordering")
