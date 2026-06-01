! EXPECT-NONE
program p
  implicit none
  real :: y(50)
  integer :: ierr
  call MPI_Bcast(y, 50, MPI_REAL, 0, MPI_COMM_WORLD, ierr)
end program
