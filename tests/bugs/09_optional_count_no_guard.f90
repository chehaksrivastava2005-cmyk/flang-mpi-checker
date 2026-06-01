! EXPECT: optional-arg
module m
contains
  subroutine wrap(buf, maybe_n)
    real, intent(in) :: buf(100)
    integer, intent(in), optional :: maybe_n
    integer :: ierr
    call MPI_Send(buf, maybe_n, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
