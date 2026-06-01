//===-- MpiChecker.cpp - MPI Semantic Correctness Checker ---------*- C++ -*-===//
//
// Part of the LLVM Project, under the Apache License v2.0 with LLVM Exceptions.
// See https://llvm.org/LICENSE.txt for license information.
// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
//
//===----------------------------------------------------------------------===//
//
// Implementation of the Flang semantic analysis integration layer.
// This is a realistic scaffold showing how Fortran semantic information
// is extracted from Flang's data structures and exported as JSON.
//
//===----------------------------------------------------------------------===//

#include "MpiChecker.h"
#include "flang/Parser/characters.h"
#include "flang/Parser/tools.h"
#include "flang/Semantics/expression.h"
#include "flang/Semantics/tools.h"
#include "llvm/Support/FormatVariadic.h"
#include <algorithm>
#include <unordered_map>

namespace Fortran::semantics::mpi {

//===----------------------------------------------------------------------===//
// JSON Serialization
//===----------------------------------------------------------------------===//

llvm::json::Object SourceLoc::toJSON() const {
  return llvm::json::Object{
      {"file", file},
      {"line", line},
      {"column", column},
  };
}

llvm::json::Object BufferMetadata::toJSON() const {
  llvm::json::Object obj{
      {"name", name},
      {"base_type", baseType},
      {"rank", rank},
      {"is_assumed_shape", isAssumedShape},
      {"is_assumed_size", isAssumedSize},
      {"is_allocatable", isAllocatable},
      {"is_pointer", isPointer},
      {"is_contiguous_attr", isContiguous},
      {"is_optional", isOptional},
      {"is_derived", isDerived},
      {"is_section", isSection},
      {"decl_loc", declLoc.toJSON()},
  };
  if (kind) {
    obj["kind"] = std::to_string(*kind);
  }
  if (isDerived) {
    obj["derived_type_name"] = derivedTypeName;
  }
  
  llvm::json::Array shapeArr;
  for (auto e : extents) {
    if (e) {
      shapeArr.push_back(std::to_string(*e));
    } else if (isAssumedSize) {
      shapeArr.push_back("*");
    } else {
      shapeArr.push_back(":");
    }
  }
  obj["shape"] = std::move(shapeArr);
  return obj;
}

std::optional<int64_t> BufferMetadata::staticElementCount() const {
  if (isSection) return std::nullopt;
  int64_t count = 1;
  for (auto e : extents) {
    if (!e) return std::nullopt;
    count *= *e;
  }
  return count;
}

bool BufferMetadata::isSimplyContiguous() const {
  if (isSection) return false;
  return isContiguous || isAllocatable;
}

llvm::json::Object ComponentInfo::toJSON() const {
  llvm::json::Object obj{
      {"name", name},
      {"base_type", baseType},
      {"offset_bytes", offsetBytes},
      {"size_bytes", sizeBytes},
  };
  if (kind) {
    obj["kind"] = std::to_string(*kind);
  }
  return obj;
}

bool DerivedTypeLayout::hasMixedKinds() const {
  if (components.empty()) return false;
  auto firstKind = components[0].kind;
  for (const auto &c : components) {
    if (c.kind != firstKind) return true;
  }
  return false;
}

llvm::json::Object DerivedTypeLayout::toJSON() const {
  llvm::json::Array compArr;
  for (const auto &c : components) {
    compArr.push_back(c.toJSON());
  }
  return llvm::json::Object{
      {"name", name},
      {"bind_c", isBindC},
      {"sequence", isSequence},
      {"components", std::move(compArr)},
      {"decl_loc", declLoc.toJSON()},
  };
}

llvm::json::Object MpiArgument::toJSON() const {
  // Simplified role encoding for JSON export
  std::string roleStr = "other";
  switch (role) {
    case ArgRole::Buffer:   roleStr = "buf"; break;
    case ArgRole::Count:    roleStr = "count"; break;
    case ArgRole::Datatype: roleStr = "datatype"; break;
    case ArgRole::Dest:     roleStr = "dest"; break;
    case ArgRole::Source:   roleStr = "source"; break;
    case ArgRole::Tag:      roleStr = "tag"; break;
    case ArgRole::Comm:     roleStr = "comm"; break;
    case ArgRole::Op:       roleStr = "op"; break;
    case ArgRole::Root:     roleStr = "root"; break;
    case ArgRole::Request:  roleStr = "request"; break;
    case ArgRole::Status:   roleStr = "status"; break;
    case ArgRole::Ierr:     roleStr = "ierr"; break;
    case ArgRole::Other:    break;
  }

  llvm::json::Object obj{
      {"role", roleStr},
      {"raw", rawText},
  };
  if (buffer) {
    obj["buffer"] = buffer->toJSON();
  }
  return obj;
}

const MpiArgument *MpiCallRecord::findArg(ArgRole role) const {
  for (const auto &arg : arguments) {
    if (arg.role == role) return &arg;
  }
  return nullptr;
}

llvm::json::Object MpiCallRecord::toJSON() const {
  llvm::json::Object buffersObj;
  llvm::json::Object rawValuesObj;

  for (const auto &arg : arguments) {
    auto argJson = arg.toJSON();
    std::string roleStr = argJson.getString("role")->str();
    rawValuesObj[roleStr] = argJson.getString("raw")->str();
    if (arg.buffer) {
      buffersObj[roleStr] = arg.buffer->toJSON();
    }
  }

  return llvm::json::Object{
      {"name", procedureName},
      {"line", loc.line},
      {"raw", rawText},
      {"scope", enclosingScope},
      {"in_rank_conditional", inRankConditional},
      {"conditional_text", conditionalText},
      {"buffers", std::move(buffersObj)},
      {"raw_values", std::move(rawValuesObj)},
  };
}

llvm::json::Object TranslationUnitMetadata::toJSON() const {
  llvm::json::Array callsArr;
  for (const auto &c : calls) {
    callsArr.push_back(c.toJSON());
  }
  llvm::json::Object derivedTypesObj;
  for (const auto &dt : derivedTypes) {
    derivedTypesObj[dt.name] = dt.toJSON();
  }
  return llvm::json::Object{
      {"file", filePath},
      {"calls", std::move(callsArr)},
      {"derived_types", std::move(derivedTypesObj)},
  };
}

void TranslationUnitMetadata::emitJSON(llvm::raw_ostream &os) const {
  os << llvm::formatv("{0:2}", llvm::json::Value(toJSON())) << "\n";
}

//===----------------------------------------------------------------------===//
// MpiCheckVisitor Implementation
//===----------------------------------------------------------------------===//

bool MpiCheckVisitor::isMpiProcedure(const std::string &name) {
  std::string lower = name;
  std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
  return lower.find("mpi_") == 0;
}

std::vector<ArgRole> MpiCheckVisitor::getSignature(const std::string &name) {
  // Maps MPI procedure names to positional argument roles.
  // Production version would use a generated table from the MPI standard.
  static const std::unordered_map<std::string,
      std::vector<ArgRole>> sigs = {
    {"mpi_send",  {ArgRole::Buffer, ArgRole::Count, ArgRole::Datatype,
                   ArgRole::Dest, ArgRole::Tag, ArgRole::Comm, ArgRole::Ierr}},
    {"mpi_ssend", {ArgRole::Buffer, ArgRole::Count, ArgRole::Datatype,
                   ArgRole::Dest, ArgRole::Tag, ArgRole::Comm, ArgRole::Ierr}},
    {"mpi_bsend", {ArgRole::Buffer, ArgRole::Count, ArgRole::Datatype,
                   ArgRole::Dest, ArgRole::Tag, ArgRole::Comm, ArgRole::Ierr}},
    {"mpi_rsend", {ArgRole::Buffer, ArgRole::Count, ArgRole::Datatype,
                   ArgRole::Dest, ArgRole::Tag, ArgRole::Comm, ArgRole::Ierr}},
    {"mpi_isend", {ArgRole::Buffer, ArgRole::Count, ArgRole::Datatype,
                   ArgRole::Dest, ArgRole::Tag, ArgRole::Comm,
                   ArgRole::Request, ArgRole::Ierr}},
    {"mpi_recv",  {ArgRole::Buffer, ArgRole::Count, ArgRole::Datatype,
                   ArgRole::Source, ArgRole::Tag, ArgRole::Comm,
                   ArgRole::Status, ArgRole::Ierr}},
    {"mpi_irecv", {ArgRole::Buffer, ArgRole::Count, ArgRole::Datatype,
                   ArgRole::Source, ArgRole::Tag, ArgRole::Comm,
                   ArgRole::Request, ArgRole::Ierr}},
    {"mpi_bcast", {ArgRole::Buffer, ArgRole::Count, ArgRole::Datatype,
                   ArgRole::Root, ArgRole::Comm, ArgRole::Ierr}},
    {"mpi_reduce",    {ArgRole::Buffer, ArgRole::Buffer, ArgRole::Count,
                       ArgRole::Datatype, ArgRole::Op, ArgRole::Root,
                       ArgRole::Comm, ArgRole::Ierr}},
    {"mpi_allreduce", {ArgRole::Buffer, ArgRole::Buffer, ArgRole::Count,
                       ArgRole::Datatype, ArgRole::Op,
                       ArgRole::Comm, ArgRole::Ierr}},
  };
  std::string lower = name;
  std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
  auto it = sigs.find(lower);
  if (it != sigs.end()) return it->second;
  // Unknown MPI call — treat first arg as buffer conservatively
  return {ArgRole::Buffer, ArgRole::Count, ArgRole::Datatype};
}

SourceLoc MpiCheckVisitor::getSourceLoc(const parser::CharBlock &cb) {
  SourceLoc loc;
  if (auto message = context_.messages().GetLocation(cb)) {
    // Scaffold: assume line 1 for this prototype mock if actual location unavailable
    loc.line = 1; 
  }
  return loc;
}

bool MpiCheckVisitor::Pre(const parser::CallStmt &callStmt) {
  // In Flang, CallStmt wraps a Call which contains the procedure designator
  // and actual argument list.  After name resolution, the procedure
  // designator's Name node carries a Symbol* that we could also use to
  // identify the callee.  Here we fall back to text matching on the
  // procedure name for simplicity.
  const auto &call = callStmt.call;
  const auto *proc = std::get_if<parser::Name>(
      &std::get<parser::ProcedureDesignator>(call.t).u);
  if (!proc) return true;  // indirect call — skip

  std::string procName{proc->source.ToString()};
  if (!isMpiProcedure(procName)) {
    return true;
  }

  MpiCallRecord record;
  record.procedureName = procName;
  record.rawText = callStmt.source.ToString();
  record.loc = getSourceLoc(callStmt.source);
  record.enclosingScope = currentScope_;
  record.inRankConditional =
      isInsideRankConditional(callStmt, record.conditionalText);

  auto signature = getSignature(procName);
  size_t argIdx = 0;

  const auto &actuals =
      std::get<std::list<parser::ActualArgSpec>>(call.t);
  for (const auto &actualArgSpec : actuals) {
    if (argIdx >= signature.size()) break;

    const auto &arg = std::get<parser::ActualArg>(actualArgSpec.t);
    MpiArgument mpiArg;
    mpiArg.role = signature[argIdx++];

    // ActualArg may hold an Expr (the common case) or %REF/%VAL wrapper.
    if (const auto *expr =
            std::get_if<common::Indirection<parser::Expr>>(&arg.u)) {
      mpiArg.rawText = expr->value().source.ToString();
      if (mpiArg.role == ArgRole::Buffer) {
        mpiArg.buffer = extractBufferMetadata(
            arg, context_.FindScope(callStmt.source));
      }
    }

    record.arguments.push_back(std::move(mpiArg));
  }

  result_.calls.push_back(std::move(record));
  return true;
}

bool MpiCheckVisitor::Pre(const parser::SubroutineSubprogram &subp) {
  const auto &stmt = std::get<parser::Statement<parser::SubroutineStmt>>(subp.t);
  currentScope_ = std::get<parser::Name>(stmt.statement.t).source.ToString();
  return true;
}
void MpiCheckVisitor::Post(const parser::SubroutineSubprogram &) {
  currentScope_ = "<global>";
}

bool MpiCheckVisitor::Pre(const parser::FunctionSubprogram &subp) {
  const auto &stmt = std::get<parser::Statement<parser::FunctionStmt>>(subp.t);
  currentScope_ = std::get<parser::Name>(stmt.statement.t).source.ToString();
  return true;
}
void MpiCheckVisitor::Post(const parser::FunctionSubprogram &) {
  currentScope_ = "<global>";
}

bool MpiCheckVisitor::Pre(const parser::MainProgram &) {
  currentScope_ = "<main>";
  return true;
}
void MpiCheckVisitor::Post(const parser::MainProgram &) {
  currentScope_ = "<global>";
}

bool MpiCheckVisitor::Pre(const parser::DerivedTypeDef &def) {
  // Skeleton: would extract DerivedTypeSpec info here.
  return true;
}

TranslationUnitMetadata MpiCheckVisitor::takeResult() {
  return std::move(result_);
}

BufferMetadata MpiCheckVisitor::extractBufferMetadata(const parser::ActualArg &arg,
                                                      const Scope &scope) {
  BufferMetadata meta;
  if (const auto *expr = std::get_if<parser::Expr>(&arg.u)) {
    meta.name = expr->source.ToString();
    if (const auto *typedExpr = GetTypedExpr(context_, *expr)) {
      if (const auto *symbol = GetFirstSymbol(*typedExpr)) {
        meta.name = symbol->name().ToString();
        meta.declLoc = getSourceLoc(symbol->name());
        
        auto [base, kind] = resolveType(*symbol);
        meta.baseType = base;
        meta.kind = kind;
        
        extractShape(*symbol, meta);
        extractAttributes(*symbol, meta);
        checkContiguity(*symbol, meta);
      } else {
        meta.baseType = "EXPR";
      }
    }
  }
  return meta;
}

std::pair<std::string, std::optional<int>>
MpiCheckVisitor::resolveType(const Symbol &symbol) {
  // Always resolve through host/use associations to the ultimate definition.
  const Symbol &ultimate = symbol.GetUltimate();
  if (const auto *type = ultimate.GetType()) {
    if (const auto *intrinsic = type->AsIntrinsic()) {
      // DeclTypeSpec::AsIntrinsic() returns IntrinsicTypeSpec which carries
      // the TypeCategory and kind value.
      auto dynType = evaluate::DynamicType::From(*intrinsic);
      if (dynType) {
        switch (dynType->category()) {
          case common::TypeCategory::Integer:
            return {"INTEGER", dynType->kind()};
          case common::TypeCategory::Real:
            return {"REAL", dynType->kind()};
          case common::TypeCategory::Complex:
            return {"COMPLEX", dynType->kind()};
          case common::TypeCategory::Logical:
            return {"LOGICAL", dynType->kind()};
          case common::TypeCategory::Character:
            return {"CHARACTER", dynType->kind()};
          default: return {"UNKNOWN", std::nullopt};
        }
      }
    } else if (const auto *derived = type->AsDerived()) {
      return {"TYPE", std::nullopt};
    }
  }
  return {"UNKNOWN", std::nullopt};
}

void MpiCheckVisitor::extractShape(const Symbol &symbol, BufferMetadata &meta) {
  const Symbol &ultimate = symbol.GetUltimate();
  if (const auto *details = ultimate.detailsIf<ObjectEntityDetails>()) {
    meta.isAssumedShape = details->IsAssumedShape();
    meta.isAssumedSize = details->IsAssumedSize();
    meta.isDeferredShape = details->IsDeferredShape();
    meta.rank = details->shape().Rank();

    // Attempt compile-time shape evaluation via the FoldingContext.
    // evaluate::GetShape returns std::optional<Shape> where
    // Shape = std::vector<std::optional<ExtentExpr>>.
    if (auto shape = evaluate::GetShape(foldingContext_, ultimate)) {
      for (auto &extent : *shape) {
        if (extent) {
          // Try to fold to a constant int64
          if (auto val = evaluate::ToInt64(*extent)) {
            meta.extents.push_back(*val);
          } else {
            meta.extents.push_back(std::nullopt);  // dynamic
          }
        } else {
          meta.extents.push_back(std::nullopt);
        }
      }
    } else {
      // Shape not available (scalar or error); fill with nullopt
      for (int i = 0; i < meta.rank; ++i) {
        meta.extents.push_back(std::nullopt);
      }
    }
  }
}

void MpiCheckVisitor::checkContiguity(const Symbol &symbol,
                                       BufferMetadata &meta) {
  const Symbol &ultimate = symbol.GetUltimate();
  meta.isContiguous = ultimate.attrs().test(Attr::CONTIGUOUS);

  // Flang provides IsSimplyContiguous() which checks beyond just the
  // attribute — it also considers if the base object is contiguous
  // (e.g., whole allocatable arrays, explicit-shape arrays).
  // For a full implementation we would call:
  //   semantics::IsSimplyContiguous(expr, foldingContext_)
  // on the actual argument expression.  Here we approximate.
  if (meta.isContiguous || meta.isAllocatable) {
    meta.contiguity = BufferMetadata::Contiguity::Known;
  } else if (meta.isSection) {
    meta.contiguity = BufferMetadata::Contiguity::NonContiguous;
  } else {
    meta.contiguity = BufferMetadata::Contiguity::Unknown;
  }
}

void MpiCheckVisitor::extractAttributes(const Symbol &symbol,
                                         BufferMetadata &meta) {
  const Symbol &ultimate = symbol.GetUltimate();
  meta.isAllocatable = ultimate.attrs().test(Attr::ALLOCATABLE);
  meta.isPointer = ultimate.attrs().test(Attr::POINTER);
  meta.isOptional = ultimate.attrs().test(Attr::OPTIONAL);
  meta.isTarget = ultimate.attrs().test(Attr::TARGET);
}

DerivedTypeLayout MpiCheckVisitor::extractDerivedTypeLayout(
    const DerivedTypeSpec &spec) {
  DerivedTypeLayout layout;
  layout.name = spec.name().ToString();
  layout.isBindC = spec.typeSymbol().attrs().test(Attr::BIND_C);
  layout.isSequence = spec.typeSymbol().attrs().test(Attr::SEQUENCE);

  // Walk the components scope of the derived type.
  if (const Scope *scope = spec.GetScope()) {
    for (const auto &pair : *scope) {
      const Symbol &comp = *pair.second;
      if (const auto *obj = comp.detailsIf<ObjectEntityDetails>()) {
        ComponentInfo ci;
        ci.name = comp.name().ToString();
        auto [base, kind] = resolveType(comp);
        ci.baseType = base;
        ci.kind = kind;
        // For BIND(C) types, offset/size could be computed from
        // evaluate::GetSizeAndAlignment in a full implementation.
        layout.components.push_back(std::move(ci));
      }
    }
  }
  return layout;
}

bool MpiCheckVisitor::isInsideRankConditional(
    const parser::CallStmt &call, std::string &condText) {
  // Walk up the parse-tree parent chain looking for an IfConstruct
  // whose condition references a variable matching common rank names.
  // This mirrors the Python _find_enclosing_rank_conditional() logic.
  //
  // In a full implementation we would check if the condition expression
  // involves a symbol that was the target of MPI_Comm_rank.  For this
  // prototype we use a textual heuristic matching "rank", "myid", etc.
  //
  // Parse-tree parent walking is not directly supported by the Flang
  // visitor pattern (visitors walk top-down, not bottom-up).  A full
  // implementation would record the enclosing IfConstruct condition
  // in Pre(IfConstruct) and clear it in Post(IfConstruct), then
  // check the current context here.
  return false;
}

//===----------------------------------------------------------------------===//
// MpiSemanticChecker Implementation
//===----------------------------------------------------------------------===//

void MpiSemanticChecker::Perform(const parser::Program &program) {
  MpiCheckVisitor visitor{context_};
  parser::Walk(program, visitor);
  metadata_ = visitor.takeResult();
}

void MpiSemanticChecker::EmitMetadata(llvm::raw_ostream &os) const {
  metadata_.emitJSON(os);
}

} // namespace Fortran::semantics::mpi
