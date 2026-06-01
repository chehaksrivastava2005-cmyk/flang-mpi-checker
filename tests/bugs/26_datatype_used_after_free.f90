! EXPECT: datatype-state
module m
contains
  subroutine s(buf)
    real, intent(inout) :: buf(100)
    integer :: newtype, ierr
    call MPI_Type_contiguous(100, MPI_REAL, newtype, ierr)
    call MPI_Type_commit(newtype, ierr)
    call MPI_Type_free(newtype, ierr)
    call MPI_Send(buf, 1, newtype, 1, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
