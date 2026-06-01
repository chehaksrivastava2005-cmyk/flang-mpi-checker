! EXPECT: handle-leak
! Multiple handle types leaked in same scope
program p
  implicit none
  integer :: newtype, newcomm, newgroup, ierr
  integer :: lengths(1), types(1)
  integer(8) :: displacements(1)
  lengths(1) = 10
  types(1) = MPI_REAL
  displacements(1) = 0
  call MPI_Type_create_struct(1, lengths, displacements, types, newtype, ierr)
  call MPI_Type_commit(newtype, ierr)
  call MPI_Comm_dup(MPI_COMM_WORLD, newcomm, ierr)
  ! Bug: newtype, newcomm never freed
end program
