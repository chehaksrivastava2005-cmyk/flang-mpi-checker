"""Correctness rules.

Each rule exposes:
    NAME  : short identifier used in diagnostics
    check(unit, diag) : runs on FortranSourceUnit, emits via DiagnosticCollector
"""
from . import (buffer_size, contiguity, datatype, derived_type, optional_arg,
               collective_order, isend_aliasing, handle_leak, datatype_state,
               deadlock_pattern)

ALL_RULES = [buffer_size, contiguity, datatype, derived_type, optional_arg,
             collective_order, isend_aliasing, handle_leak, datatype_state,
             deadlock_pattern]


def run_all(unit, diag) -> None:
    for r in ALL_RULES:
        # Some rules depend on fparser2 AST traversal (unit.tree).
        # When using the native Flang backend, the AST is not exported,
        # so we skip rules that require manual AST dataflow heuristics.
        # In a full LLVM implementation, these would be FIR-level passes.
        if getattr(unit, "tree", None) is None:
            if r.__name__.split('.')[-1] in ('optional_arg', 'isend_aliasing', 'handle_leak', 'datatype_state', 'deadlock_pattern'):
                continue
        r.check(unit, diag)
