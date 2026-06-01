! EXPECT-NONE
program p
  implicit none
  type, bind(c) :: vec3
    real(8) :: x, y, z
  end type
  type(vec3) :: v(10)
  integer :: ierr
  call MPI_Send(v, 10, MPI_BYTE, 1, 0, MPI_COMM_WORLD, ierr)
end program
