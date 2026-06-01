# DESIGN — Flang-Based MPI Correctness Checker for Fortran

## Problem Statement

MPI bugs in Fortran HPC codebases are **silent, widespread, and invisible to
existing tools**. The three major MPI correctness frameworks — MUST (runtime,
RWTH Aachen), MPI-Checker (Clang static analyzer), and ITAC (Intel runtime
trace) — all operate exclusively on C/C++ code. They cannot parse Fortran
source, and even if they could, they would miss an entire class of pitfalls
specific to Fortran's type system and array semantics:

| Pitfall | Why C/C++ tools miss it |
|---------|------------------------|
| Assumed-shape arrays as MPI buffers (`buf(:)`) | C sees `void*`; the array descriptor (rank, extents, stride) is erased at the language boundary |
| Non-unit-stride array sections (`A(1:N:2)`) | The section syntax does not exist in C; MPI receives a pointer to a copy-in temporary or a non-contiguous base |
| `OPTIONAL` dummy arguments forwarded to MPI | C has no language-level concept of absent arguments; a null/sentinel pointer is indistinguishable from valid data |
| Non-`BIND(C)` derived types as MPI buffers | Fortran compilers may freely reorder or pad components; C struct layout rules do not apply |
| Kind-parameterized types (`REAL(8)` vs `MPI_REAL`) | The kind→bytes mapping is Fortran-specific; C analyzers see only a `void*` buffer |

**Root cause:** By the time a Fortran MPI call crosses into the C MPI binding
layer, all Fortran-specific semantic metadata has been erased. The array
descriptor is collapsed to `void *base`, the type/kind is lost, and the
`OPTIONAL`/`CONTIGUOUS` attributes are invisible.

**Our insight:** Flang's semantic analysis phase (`flang/lib/Semantics/`) is the
*last point* in the compilation pipeline where all this metadata is alive and
queryable. We intercept MPI calls here.

## Architecture

```
Fortran Source (.f90)
       │
       ▼
┌──────────────────────────────────────┐
│  Flang Semantic Analysis (C++)       │   Layer 1: Extraction
│  MpiCheckVisitor : ParseTreeVisitor  │
│  ┌────────────────────────────────┐  │
│  │ For each MPI CallStmt:        │  │
│  │  • Symbol → GetUltimate()     │  │
│  │  • evaluate::DynamicType      │  │
│  │  • evaluate::GetShape()       │  │
│  │  • IsSimplyContiguous()       │  │
│  │  • Attr::OPTIONAL/CONTIGUOUS  │  │
│  │  • DerivedTypeSpec walk       │  │
│  └────────────────────────────────┘  │
│  Output: BufferMetadata JSON         │
└──────────────┬───────────────────────┘
               │  (JSON over stdout or in-process)
               ▼
┌──────────────────────────────────────┐
│  Metadata Schema (Python)            │   Layer 2: Bridge
│  FlangTranslationUnit                │
│  FlangMpiCallRecord                  │
│  FlangBufferMetadata                 │
│  → Deserialize → BufferInfo          │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Python Rule Engine                  │   Layer 3: Analysis
│  10 correctness rules                │
│  ┌────────────────────────────────┐  │
│  │ Type-level:                   │  │
│  │  buffer-size, contiguity,     │  │
│  │  datatype-mismatch,           │  │
│  │  derived-type-layout,         │  │
│  │  optional-arg                 │  │
│  ├────────────────────────────────┤  │
│  │ Structural:                   │  │
│  │  collective-ordering          │  │
│  ├────────────────────────────────┤  │
│  │ Dataflow (AST heuristic):     │  │
│  │  isend-aliasing, handle-leak, │  │
│  │  datatype-state,              │  │
│  │  deadlock-pattern             │  │
│  └────────────────────────────────┘  │
│  Output: gcc-style diagnostics       │
└──────────────────────────────────────┘
```

### Data Flow for a Single MPI Call

```
call MPI_Send(buf, 100, MPI_REAL, 1, 0, comm, ierr)
      │
      ▼ Flang: CallStmt matched → resolve "buf"
      │
      ▼ Symbol: buf → REAL(8), DIMENSION(:,:), OPTIONAL
      │   evaluate::DynamicType → {category=Real, kind=8}
      │   evaluate::GetShape()  → [nullopt, nullopt]  (assumed-shape)
      │   attrs.test(OPTIONAL)  → true
      │   attrs.test(CONTIGUOUS)→ false
      │
      ▼ BufferMetadata JSON:
      │   {name:"buf", base_type:"REAL", kind:"8",
      │    is_assumed_shape:true, is_optional:true, ...}
      │
      ▼ Python rules evaluate:
        Rule datatype-mismatch: REAL(8) vs MPI_REAL(4 bytes) → ERROR
        Rule contiguity:        assumed-shape, no CONTIGUOUS  → WARNING
        Rule optional-arg:      OPTIONAL without PRESENT()    → ERROR
```

## Key Design Decisions

### Decision 1: Hybrid C++/Python Architecture

**Choice:** C++ extraction layer + Python rule engine, connected via JSON.

**Rationale:**
- The extraction layer *must* be C++ because it needs Flang's internal APIs
  (`semantics::Symbol`, `evaluate::DynamicType`, `evaluate::GetShape`), which
  are only available inside the LLVM/Flang compilation process.
- The rule engine benefits from Python's rapid iteration: adding a new rule is
  a 30-line Python module, not a recompile of LLVM.
- JSON as the integration boundary makes the tool testable without a full LLVM
  build — the fparser2 fallback generates identical JSON.

**Alternative considered: Monolithic C++ pass.** Would avoid the Python
dependency but make the rule logic harder to test, iterate, and extend. Real
compiler checkers (e.g., Clang-Tidy) follow this pattern, but they benefit from
a mature C++ testing infrastructure (LIT, FileCheck) that would need to be
replicated.

### Decision 2: fparser2 Rapid-Prototyping Fallback

**Choice:** Ship a Python-based frontend (`analyzer.py`) using fparser2 that
reconstructs the same `BufferInfo` metadata from the parse tree.

**Rationale:**
- Building LLVM/Flang from source takes 3-5 hours and requires 32GB+ RAM.
  This is impractical for development, CI, and user evaluation.
- fparser2 is a production-grade Fortran 2008 parser used by PSyclone (the
  STFC/Met Office DSL compiler) and NVIDIA's HPC toolkit.
- The Python analyzer's `BufferInfo` fields map 1:1 to Flang's semantic
  structures (documented in `FLANG_MAPPING.md`), so the rules are
  backend-agnostic.

**Alternative considered: Require LLVM build.** Would demonstrate deeper
integration but make the tool impossible to test without a multi-hour build
process.

### Decision 3: Rule Taxonomy (Frontend vs Dataflow)

**Choice:** Separate rules into *type-level* (frontend semantic phase) and
*dataflow* (AST-walk heuristic) categories.

**Rationale:**
- Rules 1-6 (buffer-size, contiguity, datatype-mismatch, derived-type-layout,
  optional-arg, collective-ordering) only need symbol-table queries — they
  operate correctly in a single-pass semantic visitor.
- Rules 7-10 (isend-aliasing, handle-leak, datatype-state, deadlock-pattern)
  require control-flow reasoning. In a production compiler, these would live at
  the MLIR/FIR level where SSA-based dataflow analysis is available. For this
  prototype, we implement conservative AST-walk heuristics that work for the
  common intra-procedural case.

### Decision 4: Diagnostic Format

**Choice:** gcc-style `file:line: severity: [rule] message`.

**Rationale:** Familiar to every HPC developer. Integrates directly with editor
error parsers, CI log scanners, and `--werror` workflows.

## Alternatives Considered

| Approach | Pros | Cons | Why not chosen |
|----------|------|------|----------------|
| **Pure LLVM/Flang pass** | Deepest integration; access to FIR | 5-hour build; hard to iterate; requires LLVM commit | Impractical for research prototype |
| **Pure Python (fparser2 only)** | Easy to build; fast iteration | No genuine Flang API usage; academically weaker | Cannot demonstrate real compiler integration |
| **Runtime instrumentation (PMPI)** | Catches actual runtime behavior | Only finds bugs on exercised code paths; high overhead | Misses statically-detectable bugs; no Fortran semantics |
| **Clang plugin port** | Reuses mature static analysis framework | Clang cannot parse Fortran; would need source-to-source translation | Fundamentally wrong tool for the language |
| **ROSE/Open64 Fortran frontend** | Mature Fortran frontend | Dead projects; no active development | Flang is the LLVM standard; better long-term bet |

## Security and Safety Considerations

- The tool performs **read-only static analysis** — it never modifies source
  files or executes MPI programs.
- JSON metadata is generated and consumed locally; no network communication.
- The fparser2 fallback parser runs in a sandboxed Python environment.
