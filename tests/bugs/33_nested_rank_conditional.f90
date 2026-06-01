! EXPECT: collective-ordering
! Nested IF with complex rank predicate
program p
  implicit none
  real(8) :: val, result
  integer :: ierr, myrank
  call MPI_Comm_rank(MPI_COMM_WORLD, myrank, ierr)
  if (myrank .eq. 0) then
    if (.true.) then
      ! Collective inside rank-conditional (nested IF)
      call MPI_Allreduce(val, result, 1, MPI_DOUBLE_PRECISION, &
                         MPI_SUM, MPI_COMM_WORLD, ierr)
    end if
  end if
end program
