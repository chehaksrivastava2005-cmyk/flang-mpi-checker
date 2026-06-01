! EXPECT: derived-type-layout
! EXPECT: datatype-mismatch
! Derived type with OPTIONAL and wrong MPI datatype
module m
contains
  subroutine send_particle(p, n)
    type particle
      real(8) :: x, y, z
      integer :: id
    end type
    type(particle), intent(in) :: p(n)
    integer, intent(in) :: n
    integer :: ierr
    ! Bug: non-BIND(C) type + using MPI_INTEGER (wrong datatype)
    call MPI_Send(p, n, MPI_INTEGER, 1, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
