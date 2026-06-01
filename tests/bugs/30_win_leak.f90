! EXPECT: handle-leak
module m
contains
  subroutine s(base, size, disp)
    integer :: base, size, disp, win, ierr
    call MPI_Win_create(base, size, disp, MPI_INFO_NULL, MPI_COMM_WORLD, win, ierr)
  end subroutine
end module
