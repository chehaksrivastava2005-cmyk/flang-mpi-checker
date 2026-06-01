//===-- MpiChecker.h - MPI Semantic Correctness Checker ---------*- C++ -*-===//
//
// Part of the LLVM Project, under the Apache License v2.0 with LLVM Exceptions.
// See https://llvm.org/LICENSE.txt for license information.
// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
//
//===----------------------------------------------------------------------===//
//
// Research prototype: Flang semantic pass that intercepts MPI procedure calls
// and extracts Fortran type metadata for static correctness analysis.
//
// This file defines:
//   - BufferMetadata:    per-argument semantic info (type, kind, shape, attrs)
//   - MpiCallRecord:     per-call extracted metadata
//   - DerivedTypeLayout: component layout for BIND(C) validation
//   - MpiCheckVisitor:   ParseTreeVisitor that walks CallStmt nodes
//   - MpiSemanticChecker: orchestrator that runs the visitor and emits JSON
//
// NOTE: This is a research scaffold demonstrating real Flang API usage.
// It is structured to integrate into flang/lib/Semantics/ but has not been
// submitted upstream. Building requires an LLVM/Flang development environment.
//
// Maps to Python prototype:
//   BufferMetadata   ↔  mpicheck.types.BufferInfo
//   MpiCallRecord    ↔  mpicheck.types.MpiCall
//   DerivedTypeLayout ↔ mpicheck.types.DerivedTypeDef
//   MpiCheckVisitor   ↔ mpicheck.analyzer.FortranSourceUnit._extract_mpi_calls
//
//===----------------------------------------------------------------------===//

#ifndef FORTRAN_SEMANTICS_MPI_CHECKER_H
#define FORTRAN_SEMANTICS_MPI_CHECKER_H

#include "flang/Evaluate/shape.h"
#include "flang/Evaluate/type.h"
#include "flang/Parser/parse-tree.h"
#include "flang/Semantics/semantics.h"
#include "flang/Semantics/symbol.h"
#include "flang/Semantics/scope.h"
#include "flang/Semantics/type.h"
#include "flang/Semantics/tools.h"
#include "llvm/Support/JSON.h"
#include "llvm/Support/raw_ostream.h"

#include <optional>
#include <string>
#include <vector>

namespace Fortran::semantics::mpi {

//===----------------------------------------------------------------------===//
// Source Location
//===----------------------------------------------------------------------===//

/// Compact source location for metadata serialization.
struct SourceLoc {
  std::string file;
  int line{0};
  int column{0};

  llvm::json::Object toJSON() const;
};

//===----------------------------------------------------------------------===//
// Buffer Metadata — mirrors mpicheck.types.BufferInfo
//===----------------------------------------------------------------------===//

/// Semantic metadata extracted from an MPI buffer argument.
/// Populated by resolving the actual argument's Symbol through
/// Flang's semantics::Symbol, evaluate::DynamicType, and evaluate::GetShape.
struct BufferMetadata {
  std::string name;                               // source-level name

  // --- Type info (from evaluate::DynamicType) ---
  std::string baseType;                           // "REAL", "INTEGER", etc.
  std::optional<int> kind;                        // e.g. 8 for REAL(8)
  int elementBytes{0};                            // sizeof one element

  // --- Shape info (from evaluate::GetShape) ---
  int rank{0};
  std::vector<std::optional<int64_t>> extents;    // per-dim; nullopt = unknown
  bool isAssumedShape{false};                     // dummy(:)
  bool isAssumedSize{false};                      // dummy(*)
  bool isDeferredShape{false};                    // allocatable(:) or pointer(:)

  // --- Attributes (from semantics::Attrs) ---
  bool isAllocatable{false};
  bool isPointer{false};
  bool isContiguous{false};                       // CONTIGUOUS attribute
  bool isOptional{false};                         // OPTIONAL dummy
  bool isTarget{false};

  // --- Derived type (from semantics::DerivedTypeSpec) ---
  bool isDerived{false};
  std::string derivedTypeName;

  // --- Array section analysis ---
  bool isSection{false};                          // passed as A(lo:hi:stride)
  std::vector<std::optional<int64_t>> strides;    // per-dim stride; 1=unit

  // --- Contiguity verdict ---
  enum class Contiguity { Known, Unknown, NonContiguous };
  Contiguity contiguity{Contiguity::Unknown};

  // --- Source location of declaration ---
  SourceLoc declLoc;

  /// Compute static element count; nullopt if any extent is dynamic.
  std::optional<int64_t> staticElementCount() const;

  /// Is this buffer known to be simply contiguous at compile time?
  bool isSimplyContiguous() const;

  llvm::json::Object toJSON() const;
};

//===----------------------------------------------------------------------===//
// Derived Type Layout — mirrors mpicheck.types.DerivedTypeDef
//===----------------------------------------------------------------------===//

struct ComponentInfo {
  std::string name;
  std::string baseType;
  std::optional<int> kind;
  int offsetBytes{0};          // only meaningful for BIND(C) types
  int sizeBytes{0};

  llvm::json::Object toJSON() const;
};

/// Layout metadata for a derived type used as an MPI buffer.
struct DerivedTypeLayout {
  std::string name;
  bool isBindC{false};
  bool isSequence{false};
  std::vector<ComponentInfo> components;
  SourceLoc declLoc;

  bool hasMixedKinds() const;
  llvm::json::Object toJSON() const;
};

//===----------------------------------------------------------------------===//
// MPI Call Record — mirrors mpicheck.types.MpiCall
//===----------------------------------------------------------------------===//

/// Argument role classification following MPI standard signatures.
enum class ArgRole {
  Buffer,         // buf, sendbuf, recvbuf
  Count,          // count, sendcount, recvcount
  Datatype,       // datatype, sendtype, recvtype
  Dest,           // dest
  Source,         // source
  Tag,            // tag
  Comm,           // comm
  Op,             // op (for collectives)
  Root,           // root (for rooted collectives)
  Request,        // request (for non-blocking)
  Status,         // status
  Ierr,           // ierr
  Other
};

/// One resolved argument in an MPI call.
struct MpiArgument {
  ArgRole role{ArgRole::Other};
  std::string rawText;                           // source text of argument
  std::optional<BufferMetadata> buffer;          // populated for buffer roles

  llvm::json::Object toJSON() const;
};

/// Complete metadata for one MPI call site.
struct MpiCallRecord {
  std::string procedureName;                     // canonical: "MPI_Send"
  std::string rawText;                           // full call source text
  SourceLoc loc;
  std::string enclosingScope;                    // subroutine/function name

  std::vector<MpiArgument> arguments;

  // Rank-conditional context (for collective-ordering checks)
  bool inRankConditional{false};
  std::string conditionalText;

  /// Convenience: find first argument with given role.
  const MpiArgument *findArg(ArgRole role) const;

  llvm::json::Object toJSON() const;
};

//===----------------------------------------------------------------------===//
// Translation Unit Metadata — top-level extraction result
//===----------------------------------------------------------------------===//

struct TranslationUnitMetadata {
  std::string filePath;
  std::vector<MpiCallRecord> calls;
  std::vector<DerivedTypeLayout> derivedTypes;

  /// Serialize entire TU metadata to JSON.
  llvm::json::Object toJSON() const;

  /// Write JSON to output stream.
  void emitJSON(llvm::raw_ostream &os) const;
};

//===----------------------------------------------------------------------===//
// MpiCheckVisitor — ParseTreeVisitor that intercepts MPI calls
//===----------------------------------------------------------------------===//

/// Flang ParseTreeVisitor that walks the parse tree, identifies MPI procedure
/// calls, resolves argument symbols, and extracts semantic metadata.
///
/// Usage within a Flang semantic analysis pipeline:
///
///   SemanticsContext context{...};
///   // ... parsing and standard semantic analysis ...
///   mpi::MpiCheckVisitor visitor{context};
///   Fortran::parser::Walk(parseTree, visitor);
///   auto metadata = visitor.takeResult();
///
/// The visitor uses Pre()/Post() hooks on parser::CallStmt to intercept
/// MPI calls. For each MPI call, it:
///   1. Resolves the callee name and matches against MPI signature database
///   2. For buffer arguments: resolves Symbol → DynamicType → Shape
///   3. Checks contiguity via semantics::IsSimplyContiguous()
///   4. Inspects OPTIONAL/CONTIGUOUS/ALLOCATABLE/POINTER attributes
///   5. For derived-type buffers: walks DerivedTypeSpec components
///   6. Records rank-conditional context by walking ancestor If constructs
///
class MpiCheckVisitor {
public:
  explicit MpiCheckVisitor(SemanticsContext &context)
      : context_{context}, foldingContext_{context.foldingContext()} {}

  // --- ParseTreeVisitor Pre/Post hooks ---

  /// Intercept subroutine calls; check if callee is an MPI procedure.
  bool Pre(const parser::CallStmt &callStmt);
  void Post(const parser::CallStmt &) {}

  // Walk into program units to track scope context.
  bool Pre(const parser::SubroutineSubprogram &);
  void Post(const parser::SubroutineSubprogram &);
  bool Pre(const parser::FunctionSubprogram &);
  void Post(const parser::FunctionSubprogram &);
  bool Pre(const parser::MainProgram &);
  void Post(const parser::MainProgram &);

  // Collect derived type definitions for layout validation.
  bool Pre(const parser::DerivedTypeDef &);

  /// Default: visit all other nodes.
  template <typename T> bool Pre(const T &) { return true; }
  template <typename T> void Post(const T &) {}

  // --- Result extraction ---

  /// Move collected metadata out after tree walk completes.
  TranslationUnitMetadata takeResult();

  /// Number of MPI calls found.
  size_t callCount() const { return result_.calls.size(); }

private:
  SemanticsContext &context_;
  evaluate::FoldingContext &foldingContext_;
  TranslationUnitMetadata result_;
  std::string currentScope_{"<global>"};

  // --- Internal helpers ---

  /// Check if a procedure name is an MPI call (case-insensitive MPI_ prefix).
  static bool isMpiProcedure(const std::string &name);

  /// Resolve actual argument expression to BufferMetadata.
  /// Walks through Symbol → DynamicType → GetShape → attribute checks.
  BufferMetadata extractBufferMetadata(const parser::ActualArg &arg,
                                        const Scope &scope);

  /// Extract type and kind from a Symbol's declared type.
  /// Uses evaluate::DynamicType for intrinsic types and
  /// semantics::DerivedTypeSpec for derived types.
  std::pair<std::string, std::optional<int>>
  resolveType(const Symbol &symbol);

  /// Extract array shape from a Symbol.
  /// Uses evaluate::GetShape() with the current FoldingContext to attempt
  /// compile-time extent evaluation.
  void extractShape(const Symbol &symbol, BufferMetadata &meta);

  /// Check array contiguity for a buffer argument.
  /// Uses semantics::IsSimplyContiguous() for the definitive check,
  /// falls back to attribute inspection for dummies.
  void checkContiguity(const Symbol &symbol, BufferMetadata &meta);

  /// Inspect OPTIONAL, CONTIGUOUS, ALLOCATABLE, POINTER attributes.
  void extractAttributes(const Symbol &symbol, BufferMetadata &meta);

  /// Walk DerivedTypeSpec components for layout validation.
  DerivedTypeLayout extractDerivedTypeLayout(const DerivedTypeSpec &spec);

  /// Detect if the call is inside an IF block conditioned on rank.
  bool isInsideRankConditional(const parser::CallStmt &call,
                               std::string &condText);

  /// Map MPI procedure name to argument role vector.
  static std::vector<ArgRole> getSignature(const std::string &name);

  /// Get source location from a parser node's CharBlock.
  SourceLoc getSourceLoc(const parser::CharBlock &cb);
};

//===----------------------------------------------------------------------===//
// MpiSemanticChecker — high-level orchestrator
//===----------------------------------------------------------------------===//

/// Top-level entry point for MPI semantic checking within a Flang compilation.
///
/// Intended integration point in the Flang driver:
///
///   // After standard semantic analysis completes:
///   mpi::MpiSemanticChecker mpiChecker{context};
///   mpiChecker.Perform(parseTree);
///   if (emitJson) {
///     mpiChecker.EmitMetadata(jsonStream);
///   }
///
class MpiSemanticChecker {
public:
  explicit MpiSemanticChecker(SemanticsContext &context)
      : context_{context} {}

  /// Run the MPI check visitor over the parse tree.
  void Perform(const parser::Program &program);

  /// Emit extracted metadata as JSON (for the Python rule engine pipeline).
  void EmitMetadata(llvm::raw_ostream &os) const;

  /// Return number of MPI calls found.
  size_t callCount() const { return metadata_.calls.size(); }

  /// Access extracted metadata directly.
  const TranslationUnitMetadata &metadata() const { return metadata_; }

private:
  SemanticsContext &context_;
  TranslationUnitMetadata metadata_;
};

} // namespace Fortran::semantics::mpi

#endif // FORTRAN_SEMANTICS_MPI_CHECKER_H
