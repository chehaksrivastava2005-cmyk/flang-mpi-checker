! EXPECT: datatype-state
! EXPECT: handle-leak
! Create, use without commit, then leak
program p
  implicit none
  integer :: newtype, ierr
  real(8) :: buf(100)
  call MPI_Type_contiguous(10, MPI_DOUBLE_PRECISION, newtype, ierr)
  ! Bug: use without commit
  call MPI_Send(buf, 10, newtype, 1, 0, MPI_COMM_WORLD, ierr)
  ! Bug: handle never freed
end program
