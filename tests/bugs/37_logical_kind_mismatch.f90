! EXPECT: datatype-mismatch
! LOGICAL(1) with MPI_LOGICAL (4 bytes)
program p
  implicit none
  logical(1) :: flags(64)
  integer :: ierr
  call MPI_Bcast(flags, 64, MPI_LOGICAL, 0, MPI_COMM_WORLD, ierr)
end program
