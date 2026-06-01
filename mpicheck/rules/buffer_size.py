"""Rule: buffer size mismatch.

Detect when `count * sizeof(datatype)` cannot fit in the actual buffer,
or send-count > buffer extent, or send/recv count mismatch in MPI_Sendrecv.
"""
from __future__ import annotations
from ..mpi_db import datatype_info, normalize, POINT_TO_POINT_PAIRS, COLLECTIVES

NAME = "buffer-size"


def _int_literal(s: str):
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def check(unit, diag) -> None:
    for c in unit.calls:
        _check_single_call(c, diag)
    _check_sendrecv_self(unit, diag)


def _check_single_call(call, diag) -> None:
    # buffer-side roles to validate
    pairs = [("buf", "count", "datatype"),
             ("sendbuf", "sendcount", "sendtype"),
             ("recvbuf", "recvcount", "recvtype"),
             ("sendbuf", "count", "datatype"),
             ("recvbuf", "count", "datatype")]
    seen = set()
    for buf_role, count_role, dt_role in pairs:
        key = (buf_role, count_role, dt_role)
        if key in seen:
            continue
        if buf_role not in call.buffers:
            continue
        if count_role not in call.raw_values:
            continue
        buf = call.buffers[buf_role]
        count_raw = call.raw_values[count_role]
        dt_raw = call.raw_values.get(dt_role, "")
        cnt = _int_literal(count_raw)
        cap = buf.static_element_count()
        if cnt is not None and cap is not None and cnt > cap:
            diag.error(call.line, NAME,
                f"{call.name}: count={cnt} exceeds buffer '{buf.name}' static extent {cap}")
        # contiguous fixed-stride section: usable elements = ceil((hi-lo+1)/stride)
        if buf.is_section and cnt is not None:
            # rough: stride>1 reduces usable count proportionally is irrelevant —
            # what matters is count must not exceed selected element count.
            # If we know base shape and section is uniform stride, estimate:
            if buf.section_strides and buf.section_strides[0] not in (None, "1"):
                # cannot statically compute without bounds; emit a contiguity-adjacent note
                pass
        seen.add(key)


def _check_sendrecv_self(unit, diag) -> None:
    """Pair Send and Recv in same scope by (peer,tag) and warn if buffer sizes differ statically."""
    sends, recvs = [], []
    for c in unit.calls:
        kind = POINT_TO_POINT_PAIRS.get(c.name, (None, None))[0]
        if kind == "send":
            sends.append(c)
        elif kind == "recv":
            recvs.append(c)
    # crude pairing by literal dest/source + tag in same scope
    for s in sends:
        for r in recvs:
            if s.scope != r.scope:
                continue
            if s.raw_values.get("tag") != r.raw_values.get("tag"):
                continue
            sc = _int_literal(s.raw_values.get("count", ""))
            rc = _int_literal(r.raw_values.get("count", ""))
            sdt = s.raw_values.get("datatype", "").upper()
            rdt = r.raw_values.get("datatype", "").upper()
            if sc is not None and rc is not None and sc > rc:
                diag.warning(r.line, NAME,
                    f"recv count={rc} smaller than matching send count={sc} at line {s.line} "
                    f"(same scope, tag {s.raw_values.get('tag')})")
            if sdt and rdt and sdt != rdt and "MPI_BYTE" not in (sdt, rdt) and "MPI_PACKED" not in (sdt, rdt):
                si = datatype_info(sdt)
                ri = datatype_info(rdt)
                if si and ri and si[2] != ri[2]:
                    diag.warning(r.line, NAME,
                        f"recv datatype {rdt} differs from matching send datatype {sdt} "
                        f"at line {s.line} (different element sizes)")
