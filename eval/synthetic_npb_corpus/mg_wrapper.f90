! Synthetic NPB MG-style multigrid OPTIONAL wrapper patterns.
! Demonstrates OPTIONAL argument misuse in MPI wrappers.
module mg_wrapper
  implicit none
contains
  subroutine mg_send(buf, n, dest, tag, comm, scale_factor)
    real(8), intent(in) :: buf(:)
    integer, intent(in) :: n, dest, tag, comm
    real(8), optional, intent(in) :: scale_factor
    integer :: ierr
    ! Bug: OPTIONAL buf forwarded without PRESENT guard
    ! Bug: assumed-shape without CONTIGUOUS
    call MPI_Send(buf, n, MPI_DOUBLE_PRECISION, dest, tag, comm, ierr)
  end subroutine

  subroutine mg_bcast(data, ndata, root, comm, mask)
    real(8), intent(inout) :: data(:)
    integer, intent(in) :: ndata, root, comm
    logical, optional, intent(in) :: mask
    integer :: ierr
    ! Bug: assumed-shape in Bcast without CONTIGUOUS
    call MPI_Bcast(data, ndata, MPI_DOUBLE_PRECISION, root, comm, ierr)
  end subroutine

  subroutine mg_reduce(local_val, global_val, rank)
    real(8), intent(in) :: local_val
    real(8), intent(out) :: global_val
    integer, intent(in) :: rank
    integer :: ierr
    ! Correct: unconditional collective
    call MPI_Allreduce(local_val, global_val, 1, MPI_DOUBLE_PRECISION, &
                       MPI_SUM, MPI_COMM_WORLD, ierr)
  end subroutine
end module
