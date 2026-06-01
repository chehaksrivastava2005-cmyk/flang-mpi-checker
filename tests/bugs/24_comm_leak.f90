! EXPECT: handle-leak
module m
contains
  subroutine s
    integer :: newcomm, ierr, color, key
    color = 1
    key = 0
    call MPI_Comm_split(MPI_COMM_WORLD, color, key, newcomm, ierr)
  end subroutine
end module
