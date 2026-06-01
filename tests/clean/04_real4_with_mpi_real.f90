! EXPECT-NONE
program p
  implicit none
  real(4) :: x(20)
  integer :: ierr
  call MPI_Send(x, 20, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
end program
