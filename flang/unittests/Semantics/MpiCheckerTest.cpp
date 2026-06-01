//===-- MpiCheckerTest.cpp ------------------------------------------------===//
//
// Part of the LLVM Project, under the Apache License v2.0 with LLVM Exceptions.
// See https://llvm.org/LICENSE.txt for license information.
// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
//
//===----------------------------------------------------------------------===//
//
// Unit tests for the MPI Semantic Correctness Checker.
//
//===----------------------------------------------------------------------===//

#include "MpiChecker.h"
#include "gtest/gtest.h"
#include "flang/Parser/parsing.h"
#include "flang/Semantics/semantics.h"
#include "flang/Testing/testing.h"

using namespace Fortran::semantics::mpi;

TEST(MpiCheckerTest, BasicExtraction) {
  // In a real LLVM test environment, we construct a semantics context,
  // parse a small Fortran snippet, and run MpiSemanticChecker.
  // This skeleton test demonstrates the intended API usage.

  /*
  std::string source = R"(
    subroutine test()
      include 'mpif.h'
      real, contiguous, pointer :: buf(:)
      integer :: ierr
      call MPI_Send(buf, 100, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
    end subroutine
  )";
  
  Fortran::parser::Parsing parsing{context};
  parsing.Consume(source);
  
  Fortran::semantics::Semantics semantics{context, parsing.parseTree()};
  semantics.Perform();
  
  MpiSemanticChecker checker{semantics.context()};
  checker.Perform(*parsing.parseTree());
  
  EXPECT_EQ(checker.callCount(), 1);
  
  const auto& call = checker.metadata().calls[0];
  EXPECT_EQ(call.procedureName, "MPI_Send");
  EXPECT_EQ(call.arguments.size(), 7);
  
  const auto* bufArg = call.findArg(ArgRole::Buffer);
  ASSERT_NE(bufArg, nullptr);
  EXPECT_TRUE(bufArg->buffer.has_value());
  EXPECT_TRUE(bufArg->buffer->isPointer);
  EXPECT_TRUE(bufArg->buffer->isContiguous);
  EXPECT_TRUE(bufArg->buffer->isAssumedShape);
  EXPECT_EQ(bufArg->buffer->baseType, "REAL");
  */
}
