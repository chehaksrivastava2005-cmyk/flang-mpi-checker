! EXPECT: optional-arg
! EXPECT: contiguity
! Wrapper with both OPTIONAL buffer and assumed-shape
module m
contains
  subroutine mpi_wrapper(buf, n, dest, dt)
    real(8), optional, intent(in) :: buf(:)
    integer, intent(in) :: n, dest
    integer, optional, intent(in) :: dt
    integer :: ierr
    ! Bug: OPTIONAL buf + assumed-shape, no PRESENT or CONTIGUOUS
    call MPI_Send(buf, n, MPI_DOUBLE_PRECISION, dest, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
