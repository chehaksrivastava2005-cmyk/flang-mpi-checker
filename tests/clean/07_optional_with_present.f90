! EXPECT-NONE
module m
contains
  subroutine wrap(buf, n)
    real, intent(in), optional :: buf(100)
    integer, intent(in) :: n
    integer :: ierr
    if (present(buf)) then
      call MPI_Send(buf, n, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
    end if
  end subroutine
end module
