"""Rule: derived type layout issues.

Flag derived-type MPI buffers when:
  - the type is not BIND(C) (layout undefined across compilers)
  - components have mixed kinds without BIND(C) (interior padding likely)
  - call uses MPI_BYTE on a type with non-default alignment (note only)
"""
from __future__ import annotations

NAME = "derived-type-layout"


def check(unit, diag) -> None:
    for c in unit.calls:
        for role in ("buf", "sendbuf", "recvbuf"):
            buf = c.buffers.get(role)
            if buf is None or not buf.is_derived:
                continue
            dt_name = buf.derived_type_name
            if not dt_name:
                continue
            dt_def = unit.derived_types.get(dt_name)
            if dt_def is None:
                diag.warning(c.line, NAME,
                    f"{c.name}: buffer '{buf.name}' is TYPE({dt_name}); definition not "
                    f"visible in this translation unit, layout cannot be verified")
                continue
            if not dt_def.bind_c:
                diag.error(c.line, NAME,
                    f"{c.name}: derived-type buffer '{buf.name}' is TYPE({dt_name}) which "
                    f"is not BIND(C); Fortran does not guarantee a portable memory layout, "
                    f"MPI may pack incorrectly across compilers")
            if dt_def.has_mixed_kinds() and not dt_def.bind_c:
                diag.warning(c.line, NAME,
                    f"{c.name}: TYPE({dt_name}) has mixed-kind components "
                    f"({[(n,t,k) for n,t,k in dt_def.components]}); without BIND(C), "
                    f"interior padding may differ between processes")
