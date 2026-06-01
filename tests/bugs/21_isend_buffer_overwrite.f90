! EXPECT: isend-aliasing
module m
contains
  subroutine s(buf, n, req)
    real, intent(inout) :: buf(100)
    integer, intent(in) :: n
    integer :: req, ierr, i, status(10)
    call MPI_Isend(buf, n, MPI_REAL, 1, 0, MPI_COMM_WORLD, req, ierr)
    do i = 1, n
      buf(i) = real(i)
    end do
    call MPI_Wait(req, status, ierr)
  end subroutine
end module
