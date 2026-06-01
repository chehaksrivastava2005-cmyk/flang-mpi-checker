! EXPECT: datatype-mismatch
program p
  implicit none
  integer(kind=8) :: ix(10)
  integer :: ierr
  call MPI_Send(ix, 10, MPI_INTEGER4, 1, 0, MPI_COMM_WORLD, ierr)
end program
