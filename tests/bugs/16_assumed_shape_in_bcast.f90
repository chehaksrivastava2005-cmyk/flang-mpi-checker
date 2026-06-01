! EXPECT: contiguity
! EXPECT: collective-ordering
module m
contains
  subroutine bcaster(buf, n, rank)
    real, intent(inout) :: buf(:)
    integer, intent(in) :: n, rank
    integer :: ierr
    if (rank .eq. 0) then
      call MPI_Bcast(buf, n, MPI_REAL, 0, MPI_COMM_WORLD, ierr)
    end if
  end subroutine
end module
