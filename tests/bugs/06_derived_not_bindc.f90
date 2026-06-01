! EXPECT: derived-type-layout
program p
  implicit none
  type particle
    real(8) :: x, y, z
    integer :: id
  end type
  type(particle) :: parts(10)
  integer :: ierr
  call MPI_Send(parts, 10, MPI_BYTE, 1, 0, MPI_COMM_WORLD, ierr)
end program
