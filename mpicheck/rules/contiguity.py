"""Rule: non-contiguous array section as MPI buffer.

Flag:
  - section with stride != 1, e.g. A(1:N:2)
  - assumed-shape dummy passed directly without CONTIGUOUS attribute (unknown at compile time)
  - allocatable / pointer without contiguity guarantee
"""
from __future__ import annotations

NAME = "contiguity"


def check(unit, diag) -> None:
    for c in unit.calls:
        for role in ("buf", "sendbuf", "recvbuf"):
            buf = c.buffers.get(role)
            if buf is None:
                continue
            # explicit non-unit stride
            if buf.is_section:
                non_unit = [s for s in buf.section_strides if s not in (None, "1")]
                if non_unit:
                    diag.error(c.line, NAME,
                        f"{c.name}: argument '{buf.name}' is an array section with non-unit "
                        f"stride {non_unit}; memory is non-contiguous, MPI requires a contiguous "
                        f"buffer or a vector datatype")
                    continue
            # assumed-shape without CONTIGUOUS: unknown at compile time → warn.
            # Skip:
            #  - unresolved symbols (internal marker, not real assumed-shape)
            #  - ALLOCATABLE arrays: deferred-shape, guaranteed contiguous (F2008)
            #  - sections taken from a contiguous source: handled below
            if (buf.is_assumed_shape and not buf.is_contiguous_attr
                    and not buf.is_allocatable
                    and buf.base_type != "UNKNOWN"):
                diag.warning(c.line, NAME,
                    f"{c.name}: argument '{buf.name}' is assumed-shape (declared at "
                    f"line {buf.decl_line}) without CONTIGUOUS attribute; "
                    f"caller-supplied non-contiguous data will be silently copied "
                    f"or corrupted depending on MPI/F08 binding")
            # pointer without target known contiguous
            if buf.is_pointer and not buf.is_contiguous_attr:
                diag.warning(c.line, NAME,
                    f"{c.name}: pointer argument '{buf.name}' without CONTIGUOUS "
                    f"attribute may alias non-contiguous storage")
