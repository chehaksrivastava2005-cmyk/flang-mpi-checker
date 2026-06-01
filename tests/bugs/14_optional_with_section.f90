! EXPECT: optional-arg
! EXPECT: contiguity
module m
contains
  subroutine wrap(buf)
    real, intent(in), optional :: buf(:)
    integer :: ierr
    call MPI_Send(buf, 5, MPI_REAL, 1, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
