# CMakeLists.txt (Addition for MpiChecker)
# This file serves as documentation for how MpiChecker integrates into the LLVM build system.

# To integrate, append `MpiChecker.cpp` to the `flangSemantics` library in:
# `flang/lib/Semantics/CMakeLists.txt`

add_flang_library(flangSemantics
  assignment.cpp
  attr.cpp
  canonicalize-do.cpp
  canonicalize-omp.cpp
  canonicalize-acc.cpp
  check-allocate.cpp
  ...
  MpiChecker.cpp # <--- ADD THIS
  ...
  unparse-with-symbols.cpp

  DEPENDS
  FIROptimizer
  HLFIR
  omp_gen
  acc_gen

  LINK_LIBS
  flangCommon
  flangEvaluate
  flangParser
  LLVMSupport
)
