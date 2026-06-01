! EXPECT: deadlock-pattern
module m
contains
  subroutine s(buf, peer)
    real, intent(in) :: buf(100)
    integer, intent(in) :: peer
    integer :: ierr
    call MPI_Ssend(buf, 100, MPI_REAL, peer, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
