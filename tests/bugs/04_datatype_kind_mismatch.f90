! EXPECT: datatype-mismatch
program p
  implicit none
  real(8) :: x(20)
  integer :: ierr
  call MPI_Send(x, 20, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
end program
