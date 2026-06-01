! EXPECT-NONE
program p
  implicit none
  real :: s(100), r(100)
  integer :: ierr, status(10)
  call MPI_Send(s, 10, MPI_REAL, 1, 7, MPI_COMM_WORLD, ierr)
  call MPI_Recv(r, 10, MPI_REAL, 0, 7, MPI_COMM_WORLD, status, ierr)
end program
