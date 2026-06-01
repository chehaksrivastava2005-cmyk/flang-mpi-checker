# IMPLEMENTATION — LLVM/Flang Integration Details

## Overview

This document details the C++ implementation of the Flang semantic extraction
layer and how it integrates with the LLVM/Flang compilation pipeline.

## Flang Pipeline — Where We Hook In

```
Source (.f90) → Lexer → Parser → Name Resolution → Expression Analysis
                                                          ↓
                                              ★ MPI Semantic Checking ← HERE
                                                          ↓
                                              Lowering to FIR/MLIR
                                              (metadata LOST past here)
```

We insert **after** name resolution and expression analysis (all Symbols resolved,
shapes folded) but **before** lowering to FIR (where Fortran metadata is erased).

## C++ Class Hierarchy

### `MpiCheckVisitor` — The Core Visitor

A `ParseTreeVisitor` with Pre/Post hooks on `CallStmt`, `SubroutineSubprogram`,
`FunctionSubprogram`, `MainProgram`, and `DerivedTypeDef`. For each MPI call it:

1. Resolves the callee name against MPI signature database
2. For buffer arguments: resolves Symbol → DynamicType → Shape
3. Checks contiguity via `IsSimplyContiguous()` approximation
4. Inspects `OPTIONAL/CONTIGUOUS/ALLOCATABLE/POINTER` attributes
5. For derived-type buffers: walks `DerivedTypeSpec` components
6. Records rank-conditional context from ancestor `IfConstruct` nodes

### `MpiSemanticChecker` — The Orchestrator

Wraps `MpiCheckVisitor`, runs `parser::Walk(program, visitor)`, and exposes
`EmitMetadata()` for JSON serialization via `llvm::json`.

## Flang API Usage

### 1. Symbol Resolution: `Symbol::GetUltimate()`

Follows USE/host association chains to the defining symbol. Critical for
resolving module-imported buffers to their original type/shape declaration.

### 2. Type Extraction: `evaluate::DynamicType`

```cpp
auto dynType = evaluate::DynamicType::From(*intrinsic);
// category() → Integer/Real/Complex/Logical/Character
// kind()     → 4, 8, etc.
```

Maps to `BufferInfo.base_type` and `BufferInfo.kind` in Python.

### 3. Shape Analysis: `evaluate::GetShape()`

Returns `std::optional<Shape>` where `Shape = vector<optional<ExtentExpr>>`.
Each extent may fold to `int64_t` (compile-time known) or remain dynamic.
**Unique to Fortran** — C arrays decay to pointers, losing size.

### 4. Contiguity: `Attr::CONTIGUOUS` + `IsSimplyContiguous()`

The `CONTIGUOUS` attribute guarantees contiguous memory for assumed-shape/pointer
arrays. Without it, MPI may receive non-contiguous data and silently corrupt it.

### 5. Attribute Inspection

```cpp
ultimate.attrs().test(Attr::ALLOCATABLE)  // → BufferInfo.is_allocatable
ultimate.attrs().test(Attr::POINTER)      // → BufferInfo.is_pointer
ultimate.attrs().test(Attr::OPTIONAL)     // → BufferInfo.is_optional
ultimate.attrs().test(Attr::TARGET)       // → BufferInfo.is_target
```

### 6. Derived Type Component Walking

`DerivedTypeSpec::GetScope()` iterates component Symbols for layout validation.
Checks `Attr::BIND_C` and `Attr::SEQUENCE` to determine if compiler may
reorder/pad components.

## JSON Metadata Schema

```json
{
  "file": "solver.f90",
  "calls": [{
    "name": "MPI_Send", "line": 42,
    "scope": "exchange_halo",
    "in_rank_conditional": false,
    "buffers": {
      "buf": {
        "name": "buf", "base_type": "REAL", "kind": "8",
        "shape": [":", ":", ":"],
        "is_assumed_shape": true, "is_contiguous_attr": false,
        "is_optional": false, "is_derived": false
      }
    },
    "raw_values": {"buf":"buf", "count":"100", "datatype":"MPI_REAL"}
  }],
  "derived_types": {}
}
```

The `BridgeUnit` class deserializes this JSON into the same `BufferInfo`/`MpiCall`
objects that the fparser2 backend produces, making all 10 rules backend-agnostic.

## CMake Integration

```cmake
# In flang/lib/Semantics/CMakeLists.txt:
add_flang_library(flangSemantics
  ...
  MpiChecker.cpp   # ← add this line
)
```

Links against: `flangCommon`, `flangEvaluate`, `flangParser`, `LLVMSupport`.

## Driver Integration Point

```cpp
// After standard semantic analysis:
mpi::MpiSemanticChecker mpiChecker{semanticsContext};
mpiChecker.Perform(parseTree);
if (emitMpiMetadata) {
  mpiChecker.EmitMetadata(llvm::outs());
}
```

## Comparison to Clang Static Analyzer

| Aspect | Clang MPI-Checker | mpicheck (Flang) |
|--------|-------------------|-------------------|
| Hook point | `ASTConsumer` | `ParseTreeVisitor::Pre(CallStmt)` |
| Type system | `clang::QualType` | `evaluate::DynamicType` |
| Shape analysis | N/A (C arrays decay) | `GetShape()` per-dim extents |
| Contiguity | N/A | `IsSimplyContiguous()` |
| OPTIONAL | N/A | `Attr::OPTIONAL` + AST guards |
| Dataflow | ExplodedGraph | AST walk heuristic |

## Limitations

1. **Inter-procedural:** Currently intra-TU only
2. **Dataflow rules:** Use AST heuristics; production version → FIR/MLIR SSA
3. **Plugin:** Flang adding plugin support; future: loadable `.so` plugin
