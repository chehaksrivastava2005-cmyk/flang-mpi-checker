! EXPECT: contiguity
module m
contains
  subroutine s(buf, n)
    real, pointer, intent(inout) :: buf(:)
    integer, intent(in) :: n
    integer :: ierr
    call MPI_Send(buf, n, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
