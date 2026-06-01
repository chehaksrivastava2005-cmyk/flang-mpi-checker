! EXPECT: isend-aliasing
module m
contains
  subroutine s(buf, sum, req)
    real, intent(inout) :: buf(100)
    real, intent(out) :: sum
    integer :: req, ierr, i, status(10)
    call MPI_Irecv(buf, 100, MPI_REAL, 0, 0, MPI_COMM_WORLD, req, ierr)
    sum = 0.0
    do i = 1, 100
      sum = sum + buf(i)
    end do
    call MPI_Wait(req, status, ierr)
  end subroutine
end module
