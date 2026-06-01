! EXPECT: contiguity
! Multi-procedure: ALLOCATABLE passed to wrapper with assumed-shape
module m
contains
  subroutine wrapper(buf, n)
    real(8), intent(inout) :: buf(:)
    integer, intent(in) :: n
    integer :: ierr
    ! assumed-shape without CONTIGUOUS: contiguity warning
    call MPI_Send(buf, n, MPI_DOUBLE_PRECISION, 1, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
