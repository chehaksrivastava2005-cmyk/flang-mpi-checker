! EXPECT: buffer-size
! Sendrecv with recv count exceeding recv buffer
program p
  implicit none
  real(8) :: sbuf(100), rbuf(50)
  integer :: ierr, status(10)
  ! Bug: recvcount=80 exceeds rbuf capacity=50
  call MPI_Sendrecv(sbuf, 50, MPI_DOUBLE_PRECISION, 1, 0, &
                    rbuf, 80, MPI_DOUBLE_PRECISION, 1, 0, &
                    MPI_COMM_WORLD, status, ierr)
end program
