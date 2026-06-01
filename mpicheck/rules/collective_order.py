"""Rule: collective MPI call not reachable by all ranks.

Detect collective calls inside an IF block whose condition references rank.
Per MPI standard, collectives must be matched across the communicator;
calling MPI_Bcast / MPI_Allreduce / etc. inside `if (rank == 0)` deadlocks.
"""
from __future__ import annotations
from ..mpi_db import is_collective

NAME = "collective-ordering"


def check(unit, diag) -> None:
    for c in unit.calls:
        if not is_collective(c.name):
            continue
        if c.in_rank_conditional:
            diag.error(c.line, NAME,
                f"{c.name} is a collective but is inside a rank-conditional block "
                f"({(c.conditional_text or '').splitlines()[0]!r}); collectives must "
                f"be reached by every process in the communicator or the program will "
                f"deadlock")
