! EXPECT: handle-leak
module m
contains
  subroutine s(orig)
    integer :: orig, newgrp, ierr
    integer :: ranks(2)
    ranks(1) = 0
    ranks(2) = 1
    call MPI_Group_incl(orig, 2, ranks, newgrp, ierr)
  end subroutine
end module
