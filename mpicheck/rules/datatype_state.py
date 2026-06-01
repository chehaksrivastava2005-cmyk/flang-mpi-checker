"""Rule: MPI datatype state machine.

Custom MPI datatypes must be committed via MPI_Type_commit before use in
communication, and freed via MPI_Type_free after their last use. Detect:
  - datatype created but used in a communication call without MPI_Type_commit
  - datatype committed but freed before its last MPI_Send/Recv/etc. use
"""
from __future__ import annotations
from typing import Dict, List
from fparser.two.utils import walk
from fparser.two import Fortran2003 as F

NAME = "datatype-state"

CREATORS = {
    "MPI_Type_create_struct", "MPI_Type_contiguous", "MPI_Type_vector",
    "MPI_Type_create_hvector", "MPI_Type_indexed",
    "MPI_Type_create_hindexed", "MPI_Type_create_subarray",
    "MPI_Type_dup",
}

USERS_WITH_DT_AT_INDEX = {
    "MPI_Send": 2, "MPI_Ssend": 2, "MPI_Bsend": 2, "MPI_Rsend": 2,
    "MPI_Isend": 2, "MPI_Recv": 2, "MPI_Irecv": 2,
    "MPI_Bcast": 2, "MPI_Reduce": 3, "MPI_Allreduce": 3,
    "MPI_Gather": 2, "MPI_Scatter": 2, "MPI_Allgather": 2,
    "MPI_Alltoall": 2, "MPI_Sendrecv": 2,
}


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
    scope_to_calls: Dict[int, List] = {}
    for n in walk(unit.tree, F.Call_Stmt):
        scope_to_calls.setdefault(id(_scope(n)), []).append(n)

    for sid, calls in scope_to_calls.items():
        # ordered list of (kind, handle_or_name, line, node)
        created: Dict[str, int] = {}      # handle -> creation line
        committed: Dict[str, int] = {}    # handle -> commit line
        freed: Dict[str, int] = {}        # handle -> free line
        events = []
        for n in calls:
            p = _proc(n)
            line = getattr(n.item, "span", (None,))[0]
            args = _args(n)
            if p in CREATORS and args:
                handle = args[-2]
                created[handle.lower()] = line
            elif p == "MPI_Type_commit" and args:
                committed[args[0].lower()] = line
            elif p == "MPI_Type_free" and args:
                freed[args[0].lower()] = line
            elif p in USERS_WITH_DT_AT_INDEX:
                idx = USERS_WITH_DT_AT_INDEX[p]
                if idx < len(args):
                    used = args[idx].lower()
                    if used in created and used not in committed:
                        diag.error(line, NAME,
                            f"datatype '{args[idx]}' used in {p} at line {line} "
                            f"was created at line {created[used]} but not committed "
                            f"via MPI_Type_commit before this use")
                    if used in freed and freed[used] < (line or 0):
                        diag.error(line, NAME,
                            f"datatype '{args[idx]}' was freed at line {freed[used]} "
                            f"before this {p} use at line {line}")
