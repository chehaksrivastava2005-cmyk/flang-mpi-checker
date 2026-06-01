! EXPECT: datatype-mismatch
! EXPECT: derived-type-layout
! EXPECT: collective-ordering
program p
  implicit none
  type packet
    real(8) :: payload(4)
    integer :: tag
  end type
  type(packet) :: pkt(8)
  real(8) :: x(20)
  integer :: ierr, me
  call MPI_Send(x, 20, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
  call MPI_Send(pkt, 8, MPI_BYTE, 1, 0, MPI_COMM_WORLD, ierr)
  if (me == 0) then
    call MPI_Bcast(x, 20, MPI_DOUBLE_PRECISION, 0, MPI_COMM_WORLD, ierr)
  end if
end program
