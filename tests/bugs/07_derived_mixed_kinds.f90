! EXPECT: derived-type-layout
program p
  implicit none
  type rec
    real(8) :: a
    integer(1) :: b
    integer(8) :: c
  end type
  type(rec) :: r(5)
  integer :: ierr
  call MPI_Send(r, 5, MPI_BYTE, 1, 0, MPI_COMM_WORLD, ierr)
end program
