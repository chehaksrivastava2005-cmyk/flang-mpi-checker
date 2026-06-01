! EXPECT: collective-ordering
program p
  implicit none
  real :: y(50)
  integer :: ierr, rank
  if (rank == 0) then
    call MPI_Bcast(y, 50, MPI_REAL, 0, MPI_COMM_WORLD, ierr)
  end if
end program
