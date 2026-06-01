! EXPECT-NONE
program p
  implicit none
  integer(1) :: raw(1024)
  integer :: ierr
  call MPI_Send(raw, 1024, MPI_BYTE, 1, 0, MPI_COMM_WORLD, ierr)
end program
