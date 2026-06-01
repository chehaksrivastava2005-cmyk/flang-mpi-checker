# mpicheck — evaluation report

- **Target:** `eval/synthetic_npb_corpus`
- **Files scanned:** 6
- **Parse failures:** 0
- **Total diagnostics:** 17
- **Wall time:** 0.89s (148.9 ms/file)

## By rule

| Rule | Count |
|------|------|
| `contiguity` | 8 |
| `datatype-mismatch` | 4 |
| `derived-type-layout` | 2 |
| `collective-ordering` | 1 |
| `isend-aliasing` | 1 |
| `handle-leak` | 1 |

## By severity

| Severity | Count |
|----------|------|
| warning | 10 |
| error | 7 |

## Top 10 files

| File | Diagnostics |
|------|-------------|
| `bt_stub.f90` | 5 |
| `lu_exchange.f90` | 4 |
| `sp_sweep.f90` | 3 |
| `ft_nonblock.f90` | 2 |
| `mg_wrapper.f90` | 2 |
| `cg_kernel.f90` | 1 |

## Examples per rule

### `contiguity`

```
eval/synthetic_npb_corpus\bt_stub.f90:11: warning: [contiguity] MPI_Send: argument 'u' is assumed-shape (declared at line 7) without CONTIGUOUS attribute; caller-supplied non-contiguous data will be silently copied or corrupted depending on MPI/F08 binding
eval/synthetic_npb_corpus\bt_stub.f90:12: warning: [contiguity] MPI_Recv: argument 'u' is assumed-shape (declared at line 7) without CONTIGUOUS attribute; caller-supplied non-contiguous data will be silently copied or corrupted depending on MPI/F08 binding
eval/synthetic_npb_corpus\bt_stub.f90:21: warning: [contiguity] MPI_Bcast: argument 'g' is assumed-shape (declared at line 17) without CONTIGUOUS attribute; caller-supplied non-contiguous data will be silently copied or corrupted depending on MPI/F08 binding
```

### `datatype-mismatch`

```
eval/synthetic_npb_corpus\bt_stub.f90:29: error: [datatype-mismatch] MPI_Allreduce: buffer 'local' is REAL(8) (8 bytes) but datatype MPI_REAL is 4 bytes
eval/synthetic_npb_corpus\bt_stub.f90:29: error: [datatype-mismatch] MPI_Allreduce: buffer 'gsum' is REAL(8) (8 bytes) but datatype MPI_REAL is 4 bytes
eval/synthetic_npb_corpus\lu_exchange.f90:40: error: [datatype-mismatch] MPI_Allreduce: buffer 'local_w' is REAL(8) (8 bytes) but datatype MPI_REAL is 4 bytes
```

### `collective-ordering`

```
eval/synthetic_npb_corpus\cg_kernel.f90:19: error: [collective-ordering] MPI_Allreduce is a collective but is inside a rank-conditional block ('IF (rank == 0) THEN'); collectives must be reached by every process in the communicator or the program will deadlock
```

### `isend-aliasing`

```
eval/synthetic_npb_corpus\ft_nonblock.f90:11: error: [isend-aliasing] buffer 'u' is accessed at line None after non-blocking MPI_Isend at line 11 but before MPI_Wait(req_send); this races against in-flight MPI operation
```

### `handle-leak`

```
eval/synthetic_npb_corpus\ft_nonblock.f90:29: warning: [handle-leak] MPI datatype handle 'newtype' created here is never released with MPI_Type_free in this scope (handle leak)
```

### `derived-type-layout`

```
eval/synthetic_npb_corpus\lu_exchange.f90:24: error: [derived-type-layout] MPI_Send: derived-type buffer 'cells' is TYPE(cell_data) which is not BIND(C); Fortran does not guarantee a portable memory layout, MPI may pack incorrectly across compilers
eval/synthetic_npb_corpus\lu_exchange.f90:24: warning: [derived-type-layout] MPI_Send: TYPE(cell_data) has mixed-kind components ([('u', 'REAL', '8'), ('cell_id', 'INTEGER', None), ('weight', 'REAL', '4')]); without BIND(C), interior padding may differ between processes
```

