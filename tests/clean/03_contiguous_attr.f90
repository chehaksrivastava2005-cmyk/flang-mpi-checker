! EXPECT-NONE
module m
contains
  subroutine s(buf, n)
    real, contiguous, intent(in) :: buf(:)
    integer, intent(in) :: n
    integer :: ierr
    call MPI_Send(buf, n, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
