! EXPECT: datatype-mismatch
! COMPLEX type: COMPLEX(8) is 16 bytes, MPI_COMPLEX is 8 bytes
program p
  implicit none
  complex(8) :: z(50)
  integer :: ierr
  call MPI_Send(z, 50, MPI_COMPLEX, 1, 0, MPI_COMM_WORLD, ierr)
end program
