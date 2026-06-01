! EXPECT: contiguity
program p
  implicit none
  real :: a(100)
  integer :: ierr
  call MPI_Send(a(1:99:2), 50, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
end program
