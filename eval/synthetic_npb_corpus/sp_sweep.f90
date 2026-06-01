! Synthetic NPB SP-style sweep communication.
! Demonstrates assumed-shape + OPTIONAL wrapper pitfalls.
module sp_sweep
  implicit none
contains
  subroutine sweep_send(u, npts, dir, partner, comm)
    real(8), intent(in) :: u(:,:)
    integer, intent(in) :: npts, dir, partner, comm
    integer :: ierr
    ! Bug: assumed-shape without CONTIGUOUS → contiguity warning
    call MPI_Send(u, npts, MPI_DOUBLE_PRECISION, partner, dir, comm, ierr)
  end subroutine

  subroutine sweep_recv(v, npts, dir, partner, comm)
    real(8), intent(out) :: v(:,:)
    integer, intent(in) :: npts, dir, partner, comm
    integer :: ierr, status(10)
    call MPI_Recv(v, npts, MPI_DOUBLE_PRECISION, partner, dir, comm, status, ierr)
  end subroutine

  subroutine sweep_wrapper(u, v, n, dir, peer, comm, scale)
    real(8), intent(in) :: u(:,:)
    real(8), intent(out) :: v(:,:)
    integer, intent(in) :: n, dir, peer, comm
    real(8), optional, intent(in) :: scale
    integer :: ierr
    ! Bug: OPTIONAL 'scale' used as count without PRESENT guard
    call MPI_Send(u, n, MPI_DOUBLE_PRECISION, peer, dir, comm, ierr)
  end subroutine
end module
