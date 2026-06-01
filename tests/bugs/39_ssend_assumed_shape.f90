! EXPECT: deadlock-pattern
! EXPECT: contiguity
! MPI_Ssend with assumed-shape buffer — deadlock + contiguity
module m
contains
  subroutine exchange(buf, n, peer)
    real(8), intent(inout) :: buf(:)
    integer, intent(in) :: n, peer
    integer :: ierr
    ! Bug: Ssend without prior Irecv + assumed-shape
    call MPI_Ssend(buf, n, MPI_DOUBLE_PRECISION, peer, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
