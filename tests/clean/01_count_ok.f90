! EXPECT-NONE
program p
  implicit none
  real :: x(100)
  integer :: ierr
  call MPI_Send(x, 100, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
end program
