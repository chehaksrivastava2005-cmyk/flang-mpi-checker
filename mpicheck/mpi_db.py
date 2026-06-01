"""MPI procedure signature database.

Argument roles by position for common MPI Fortran bindings.
Roles used by rules: buf, count, datatype, dest, source, tag, comm, op, root,
sendbuf, sendcount, sendtype, recvbuf, recvcount, recvtype, ierr.
"""
from __future__ import annotations
from typing import Dict, List, Optional, Tuple

# Map MPI datatype constant -> (Fortran base type, kind or None, bytes)
MPI_DATATYPE_MAP: Dict[str, Tuple[str, Optional[str], int]] = {
    "MPI_INTEGER":            ("INTEGER", None, 4),
    "MPI_INTEGER1":           ("INTEGER", "1", 1),
    "MPI_INTEGER2":           ("INTEGER", "2", 2),
    "MPI_INTEGER4":           ("INTEGER", "4", 4),
    "MPI_INTEGER8":           ("INTEGER", "8", 8),
    "MPI_REAL":               ("REAL",    None, 4),
    "MPI_REAL4":              ("REAL",    "4",  4),
    "MPI_REAL8":              ("REAL",    "8",  8),
    "MPI_DOUBLE_PRECISION":   ("REAL",    "8",  8),
    "MPI_COMPLEX":            ("COMPLEX", None, 8),
    "MPI_DOUBLE_COMPLEX":     ("COMPLEX", "8",  16),
    "MPI_LOGICAL":            ("LOGICAL", None, 4),
    "MPI_CHARACTER":          ("CHARACTER", None, 1),
    "MPI_BYTE":               ("ANY", None, 1),
    "MPI_PACKED":             ("ANY", None, 1),
}

COLLECTIVES = {
    "MPI_Bcast", "MPI_Reduce", "MPI_Allreduce", "MPI_Gather", "MPI_Allgather",
    "MPI_Scatter", "MPI_Alltoall", "MPI_Barrier", "MPI_Scan", "MPI_Exscan",
    "MPI_Gatherv", "MPI_Scatterv", "MPI_Allgatherv", "MPI_Alltoallv",
    "MPI_Reduce_scatter",
}

POINT_TO_POINT_PAIRS = {
    "MPI_Send":  ("send", ["buf", "count", "datatype", "dest", "tag", "comm", "ierr"]),
    "MPI_Ssend": ("send", ["buf", "count", "datatype", "dest", "tag", "comm", "ierr"]),
    "MPI_Bsend": ("send", ["buf", "count", "datatype", "dest", "tag", "comm", "ierr"]),
    "MPI_Rsend": ("send", ["buf", "count", "datatype", "dest", "tag", "comm", "ierr"]),
    "MPI_Isend": ("send", ["buf", "count", "datatype", "dest", "tag", "comm", "request", "ierr"]),
    "MPI_Recv":  ("recv", ["buf", "count", "datatype", "source", "tag", "comm", "status", "ierr"]),
    "MPI_Irecv": ("recv", ["buf", "count", "datatype", "source", "tag", "comm", "request", "ierr"]),
}

SIGNATURES: Dict[str, List[str]] = {
    "MPI_Send":     ["buf", "count", "datatype", "dest", "tag", "comm", "ierr"],
    "MPI_Ssend":    ["buf", "count", "datatype", "dest", "tag", "comm", "ierr"],
    "MPI_Bsend":    ["buf", "count", "datatype", "dest", "tag", "comm", "ierr"],
    "MPI_Rsend":    ["buf", "count", "datatype", "dest", "tag", "comm", "ierr"],
    "MPI_Isend":    ["buf", "count", "datatype", "dest", "tag", "comm", "request", "ierr"],
    "MPI_Recv":     ["buf", "count", "datatype", "source", "tag", "comm", "status", "ierr"],
    "MPI_Irecv":    ["buf", "count", "datatype", "source", "tag", "comm", "request", "ierr"],
    "MPI_Bcast":    ["buf", "count", "datatype", "root", "comm", "ierr"],
    "MPI_Reduce":   ["sendbuf", "recvbuf", "count", "datatype", "op", "root", "comm", "ierr"],
    "MPI_Allreduce":["sendbuf", "recvbuf", "count", "datatype", "op", "comm", "ierr"],
    "MPI_Gather":   ["sendbuf", "sendcount", "sendtype", "recvbuf", "recvcount", "recvtype", "root", "comm", "ierr"],
    "MPI_Allgather":["sendbuf", "sendcount", "sendtype", "recvbuf", "recvcount", "recvtype", "comm", "ierr"],
    "MPI_Scatter":  ["sendbuf", "sendcount", "sendtype", "recvbuf", "recvcount", "recvtype", "root", "comm", "ierr"],
    "MPI_Alltoall": ["sendbuf", "sendcount", "sendtype", "recvbuf", "recvcount", "recvtype", "comm", "ierr"],
    "MPI_Sendrecv": ["sendbuf", "sendcount", "sendtype", "dest", "sendtag",
                      "recvbuf", "recvcount", "recvtype", "source", "recvtag",
                      "comm", "status", "ierr"],
    "MPI_Barrier":  ["comm", "ierr"],
    "MPI_Scan":     ["sendbuf", "recvbuf", "count", "datatype", "op", "comm", "ierr"],
    "MPI_Exscan":   ["sendbuf", "recvbuf", "count", "datatype", "op", "comm", "ierr"],
}


def is_mpi_call(name: str) -> bool:
    return name.upper().startswith("MPI_")


def normalize(name: str) -> str:
    """Match against signature keys case-insensitively, return canonical key."""
    up = name.upper()
    for k in SIGNATURES:
        if k.upper() == up:
            return k
    return name


def get_signature(name: str) -> Optional[List[str]]:
    return SIGNATURES.get(normalize(name))


def is_collective(name: str) -> bool:
    return normalize(name) in COLLECTIVES


def datatype_info(const: str) -> Optional[Tuple[str, Optional[str], int]]:
    return MPI_DATATYPE_MAP.get(const.upper())
