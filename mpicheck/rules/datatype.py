"""Rule: declared Fortran type vs MPI datatype constant disagreement.

If buffer is REAL(8) but call passes MPI_REAL (4 bytes), flag.
If buffer is INTEGER (default 4) but call passes MPI_INTEGER8, flag.
MPI_BYTE / MPI_PACKED are always permitted.
"""
from __future__ import annotations
from ..mpi_db import datatype_info

NAME = "datatype-mismatch"

_KIND_BYTES = {
    ("REAL", "4"): 4, ("REAL", "8"): 8, ("REAL", None): 4,
    ("INTEGER", "1"): 1, ("INTEGER", "2"): 2, ("INTEGER", "4"): 4,
    ("INTEGER", "8"): 8, ("INTEGER", None): 4,
    ("COMPLEX", "4"): 8, ("COMPLEX", "8"): 16, ("COMPLEX", None): 8,
    ("LOGICAL", None): 4, ("LOGICAL", "1"): 1, ("LOGICAL", "4"): 4,
    ("CHARACTER", None): 1,
}


def _buf_bytes(base, kind):
    return _KIND_BYTES.get((base, kind))


def check(unit, diag) -> None:
    for c in unit.calls:
        pairs = [("buf", "datatype"),
                 ("sendbuf", "sendtype"), ("recvbuf", "recvtype"),
                 ("sendbuf", "datatype"), ("recvbuf", "datatype")]
        for br, dr in pairs:
            buf = c.buffers.get(br)
            if buf is None:
                continue
            dt_raw = c.raw_values.get(dr)
            if not dt_raw:
                continue
            info = datatype_info(dt_raw)
            if info is None:
                continue
            d_base, d_kind, d_bytes = info
            if d_base == "ANY":
                continue
            if buf.base_type == "TYPE":
                if dt_raw.upper() not in ("MPI_BYTE", "MPI_PACKED"):
                    diag.error(c.line, NAME,
                        f"{c.name}: derived-type buffer '{buf.name}' (TYPE({buf.derived_type_name})) "
                        f"used with intrinsic datatype {dt_raw}; declare and commit a custom "
                        f"MPI datatype via MPI_Type_create_struct or pass MPI_BYTE")
                continue
            if buf.base_type == "UNKNOWN":
                continue
            if buf.base_type != d_base:
                diag.error(c.line, NAME,
                    f"{c.name}: buffer '{buf.name}' is {buf.base_type} but MPI datatype is "
                    f"{dt_raw} ({d_base})")
                continue
            b_bytes = _buf_bytes(buf.base_type, buf.kind)
            if b_bytes is not None and b_bytes != d_bytes:
                diag.error(c.line, NAME,
                    f"{c.name}: buffer '{buf.name}' is {buf.base_type}"
                    f"{'('+buf.kind+')' if buf.kind else ''} ({b_bytes} bytes) "
                    f"but datatype {dt_raw} is {d_bytes} bytes")
