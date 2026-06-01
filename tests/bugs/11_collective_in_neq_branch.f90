! EXPECT: collective-ordering
program p
  implicit none
  real :: s(10), r(10)
  integer :: ierr, myid
  if (myid /= 0) then
    call MPI_Allreduce(s, r, 10, MPI_REAL, MPI_SUM, MPI_COMM_WORLD, ierr)
  end if
end program
