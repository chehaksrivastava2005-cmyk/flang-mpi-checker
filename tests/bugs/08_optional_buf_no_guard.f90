! EXPECT: optional-arg
module m
contains
  subroutine wrap(buf, n)
    real, intent(in), optional :: buf(:)
    integer, intent(in) :: n
    integer :: ierr
    call MPI_Send(buf, n, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
