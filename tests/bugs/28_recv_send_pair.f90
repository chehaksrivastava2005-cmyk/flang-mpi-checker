! EXPECT: deadlock-pattern
module m
contains
  subroutine s(sbuf, rbuf, peer)
    real, intent(in)  :: sbuf(100)
    real, intent(out) :: rbuf(100)
    integer, intent(in) :: peer
    integer :: ierr, status(10)
    call MPI_Recv(rbuf, 100, MPI_REAL, peer, 0, MPI_COMM_WORLD, status, ierr)
    call MPI_Send(sbuf, 100, MPI_REAL, peer, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
