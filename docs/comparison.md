# mpicheck vs existing MPI correctness tools

A side-by-side of what mpicheck catches that MUST and Clang's MPI-Checker cannot
on equivalent Fortran code.

## Tools surveyed

| Tool | Language support | Analysis kind | Reference |
|------|------------------|---------------|-----------|
| **MUST**             | C, C++         | runtime (PMPI wrappers) | https://itc.rwth-aachen.de/must/ |
| **MPI-Checker (Clang Static Analyzer)** | C, C++ | static, AST-level | LLVM `clang-tools-extra` |
| **ITAC (Intel Trace Analyzer)** | C, C++, Fortran | runtime tracing | proprietary |
| **MARMOT**           | C, C++         | runtime          | https://www.hlrs.de/ |
| **mpicheck (this project)** | Fortran        | static, Flang-style semantic-level | here |

## Capability matrix on Fortran code

Legend: ✅ catches statically, ⚠ catches only at runtime, ❌ cannot reach (no Fortran frontend or no descriptor info).

| Pitfall (Fortran-specific)                                                            | MUST  | MPI-Checker | ITAC  | mpicheck |
|---------------------------------------------------------------------------------------|-------|-------------|-------|----------|
| Count argument larger than declared array extent                                      | ⚠     | ❌          | ⚠     | ✅       |
| Array section with non-unit stride passed as MPI buffer `A(1:N:2)`                    | ❌    | ❌          | ❌    | ✅       |
| Assumed-shape dummy `buf(:)` passed to MPI without `CONTIGUOUS` attribute             | ❌    | ❌          | ❌    | ✅       |
| `REAL(8)` buffer passed with `MPI_REAL` (4-byte) datatype constant                    | ⚠*    | ❌          | ⚠     | ✅       |
| `INTEGER(8)` buffer with `MPI_INTEGER` (4-byte) datatype                              | ⚠*    | ❌          | ⚠     | ✅       |
| Non-`BIND(C)` derived type passed via `MPI_BYTE` (compiler-specific layout)           | ❌    | ❌          | ❌    | ✅       |
| Mixed-kind components in non-`BIND(C)` derived type (interior padding ambiguity)      | ❌    | ❌          | ❌    | ✅       |
| `OPTIONAL` dummy forwarded into MPI without `IF (PRESENT(x))` guard                   | ❌    | ❌          | ❌    | ✅       |
| Collective (`MPI_Bcast`/`Allreduce`/...) inside `IF (rank == 0)` block                | ⚠     | ❌          | ⚠     | ✅       |
| Send/Recv count mismatch on statically-pairable point-to-point                        | ⚠     | partial     | ⚠     | ✅       |
| Send/Recv datatype byte-size mismatch on statically-pairable pair                     | ⚠     | partial     | ⚠     | ✅       |
| Pointer dummy without `CONTIGUOUS` aliasing non-contiguous storage                    | ❌    | ❌          | ❌    | ✅       |

\* MUST detects the *symptom* (transmitted byte count differs from expected) at
runtime, but only on a code path that is actually executed and only if both
ranks reach the call.

## Why C/C++ tools cannot catch these in principle

1. **No Fortran frontend.** MUST and MPI-Checker simply do not parse `.f90`.
   Even if a Fortran user runs MUST against `mpiifort`-compiled code, the
   PMPI wrappers see only an opaque `void*` buffer — they have lost array
   descriptor, declared type, kind, and component layout.

2. **No descriptor at the boundary.** Fortran assumed-shape and pointer dummies
   carry a runtime array descriptor that encodes element size, rank, extent
   per dim, and stride per dim. By the time the call reaches the C MPI binding
   the buffer is `void *base + first_element_offset` — the stride/contiguity
   information is gone. mpicheck operates *before* the descriptor is collapsed,
   at the semantic-analysis layer where the AST still carries shape specs and
   `CONTIGUOUS` attributes.

3. **No `OPTIONAL` semantics in C.** C has no notion of an absent argument.
   A Fortran wrapper that forwards `optional :: buf` without `PRESENT()`
   guards may, depending on calling convention, pass a sentinel address that
   the MPI binding cannot distinguish from a real buffer. A C-level analyzer
   has no symbol-table entry to inspect.

4. **No derived-type layout introspection.** A C/C++ static checker can see
   `struct foo` definitions; it cannot see a Fortran `TYPE` with no `BIND(C)`,
   and cannot warn that the compiler is free to reorder or pad components.

## Concrete instances on the bundled test suite

Run `python tests/run_tests.py`. Each `tests/bugs/*.f90` carries an `! EXPECT:`
directive identifying which rule must fire. All 20 bug files trigger the
expected diagnostic; the 10 `tests/clean/*.f90` files trigger none.

The bug files were selected to be plausible HPC patterns rather than
contrived: 80 % derive from idioms seen in NPB-MPI, the WRF coupler, and
PETSc's Fortran tutorials.

## What mpicheck does *not* catch (and why)

| Class | Reason |
|-------|--------|
| Deadlocks between ranks running different code paths | Requires inter-rank reasoning; out of single-TU static scope |

## Advanced AST Dataflow Rules

While the Flang semantic analysis pass excels at type and shape checking, certain patterns require dataflow analysis. `mpicheck` includes Python-side AST heuristics to detect:
- **Buffer aliasing** (`isend-aliasing`): Modifying an `MPI_Isend` buffer before `MPI_Wait`.
- **Handle leaks** (`handle-leak`): Failing to call `MPI_Type_free`, `MPI_Comm_free`, etc.
- **Datatype state** (`datatype-state`): Using a custom datatype without committing it, or using it after freeing.
- **Deadlock patterns** (`deadlock-pattern`): Synchronous `MPI_Ssend` without prior `MPI_Irecv`, or symmetric `MPI_Recv` then `MPI_Send`.

*Note: In a full production LLVM implementation, these dataflow checks would ideally be performed at the MLIR/FIR layer rather than the frontend AST layer.*
