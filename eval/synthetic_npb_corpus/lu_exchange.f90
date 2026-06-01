! Synthetic NPB LU-style factorization data exchange.
! Demonstrates derived-type layout issues.
module lu_exchange
  implicit none

  ! Bug: not BIND(C) — compiler may reorder/pad components
  type cell_data
    real(8) :: u(5)
    integer :: cell_id
    real(4) :: weight
  end type

  type, bind(c) :: cell_data_safe
    real(8) :: u(5)
    integer :: cell_id
  end type

contains
  subroutine exchange_cells(cells, ncells, dest, comm)
    type(cell_data), intent(inout) :: cells(ncells)
    integer, intent(in) :: ncells, dest, comm
    integer :: ierr
    ! Bug: non-BIND(C) type with mixed kinds used as MPI buffer
    call MPI_Send(cells, ncells, MPI_BYTE, dest, 100, comm, ierr)
  end subroutine

  subroutine exchange_safe(cells, ncells, dest, comm)
    type(cell_data_safe), intent(inout) :: cells(ncells)
    integer, intent(in) :: ncells, dest, comm
    integer :: ierr
    ! Correct: BIND(C) type
    call MPI_Send(cells, ncells, MPI_BYTE, dest, 100, comm, ierr)
  end subroutine

  subroutine reduce_weights(local_w, global_w)
    real(8), intent(in) :: local_w
    real(8), intent(out) :: global_w
    integer :: ierr
    ! Bug: REAL(8) with MPI_REAL (4-byte mismatch)
    call MPI_Allreduce(local_w, global_w, 1, MPI_REAL, MPI_SUM, MPI_COMM_WORLD, ierr)
  end subroutine
end module
