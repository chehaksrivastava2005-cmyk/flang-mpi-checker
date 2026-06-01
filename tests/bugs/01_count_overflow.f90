! EXPECT: buffer-size
program p
  implicit none
  real :: x(100)
  integer :: ierr
  call MPI_Send(x, 200, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
end program
