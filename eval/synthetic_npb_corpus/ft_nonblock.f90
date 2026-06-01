! Synthetic NPB FT-style FFT non-blocking exchange.
! Demonstrates isend-aliasing and handle-leak pitfalls.
module ft_nonblock
  implicit none
contains
  subroutine ft_exchange(u, v, n, partner)
    real(8), intent(inout) :: u(n), v(n)
    integer, intent(in) :: n, partner
    integer :: req_send, req_recv, ierr, status(10), i
    ! Non-blocking send
    call MPI_Isend(u, n, MPI_DOUBLE_PRECISION, partner, 1, MPI_COMM_WORLD, req_send, ierr)
    call MPI_Irecv(v, n, MPI_DOUBLE_PRECISION, partner, 1, MPI_COMM_WORLD, req_recv, ierr)
    ! Bug: modifying u before Wait on req_send → data race
    do i = 1, n
      u(i) = u(i) * 2.0d0
    end do
    call MPI_Wait(req_send, status, ierr)
    call MPI_Wait(req_recv, status, ierr)
  end subroutine

  subroutine ft_create_type(n)
    integer, intent(in) :: n
    integer :: newtype, ierr
    integer :: lengths(1), types(1)
    integer(8) :: displacements(1)
    lengths(1) = n
    types(1) = MPI_DOUBLE_PRECISION
    displacements(1) = 0
    call MPI_Type_create_struct(1, lengths, displacements, types, newtype, ierr)
    call MPI_Type_commit(newtype, ierr)
    ! Bug: handle never freed → handle-leak
  end subroutine
end module
