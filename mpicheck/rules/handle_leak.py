"""Rule: MPI handle leaks (Request, Datatype, Communicator, Group, Window).

Detect:
  - MPI_Type_create_struct / _contiguous / _vector etc. without a matching
    MPI_Type_free on the same handle in the same procedure
  - MPI_Comm_split / _create / _dup without MPI_Comm_free
  - MPI_Group_incl / _excl / _union without MPI_Group_free
  - MPI_Win_create without MPI_Win_free
"""
from __future__ import annotations
from fparser.two.utils import walk
from fparser.two import Fortran2003 as F

NAME = "handle-leak"

CREATORS = {
    "MPI_Type_create_struct":  ("datatype", -2),   # ierr last, handle before
    "MPI_Type_contiguous":     ("datatype", -2),
    "MPI_Type_vector":         ("datatype", -2),
    "MPI_Type_create_hvector": ("datatype", -2),
    "MPI_Type_indexed":        ("datatype", -2),
    "MPI_Type_create_hindexed":("datatype", -2),
    "MPI_Type_create_subarray":("datatype", -2),
    "MPI_Type_dup":            ("datatype", -2),
    "MPI_Comm_split":          ("comm", -2),
    "MPI_Comm_create":         ("comm", -2),
    "MPI_Comm_dup":            ("comm", -2),
    "MPI_Comm_split_type":     ("comm", -2),
    "MPI_Group_incl":          ("group", -2),
    "MPI_Group_excl":          ("group", -2),
    "MPI_Group_union":         ("group", -2),
    "MPI_Group_intersection":  ("group", -2),
    "MPI_Group_difference":    ("group", -2),
    "MPI_Win_create":          ("win", -2),
    "MPI_Win_allocate":        ("win", -2),
}

FREERS = {
    "datatype": "MPI_Type_free",
    "comm":     "MPI_Comm_free",
    "group":    "MPI_Group_free",
    "win":      "MPI_Win_free",
}


def _arg_names(call_node):
    args = call_node.children[1]
    if args is None:
        return []
    return [str(a).strip() for a in args.children]


def check(unit, diag) -> None:
    # Group calls by enclosing scope
    scope_to_calls: dict = {}
    for n in walk(unit.tree, F.Call_Stmt):
        proc = str(n.children[0]).strip()
        scope = n.parent
        while scope is not None and not isinstance(
                scope, (F.Subroutine_Subprogram, F.Function_Subprogram, F.Main_Program)):
            scope = getattr(scope, "parent", None)
        scope_to_calls.setdefault(id(scope), []).append((proc, n))

    for sid, calls in scope_to_calls.items():
        # collect (handle_name, kind, line) for creators
        created = []  # list of (handle, kind, line, free_proc_name)
        freed = set()
        for proc, node in calls:
            if proc in CREATORS:
                kind, idx = CREATORS[proc]
                args = _arg_names(node)
                if abs(idx) <= len(args):
                    handle = args[idx]
                    line = getattr(node.item, "span", (None,))[0]
                    created.append((handle, kind, line))
            else:
                for kind, free_name in FREERS.items():
                    if proc.lower() == free_name.lower():
                        args = _arg_names(node)
                        if args:
                            freed.add((args[0].lower(), kind))
        for handle, kind, line in created:
            if (handle.lower(), kind) not in freed:
                diag.warning(line or 0, NAME,
                    f"MPI {kind} handle '{handle}' created here is never released "
                    f"with {FREERS[kind]} in this scope (handle leak)")
