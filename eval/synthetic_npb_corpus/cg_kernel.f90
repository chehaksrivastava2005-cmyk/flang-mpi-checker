! Synthetic NPB CG-style conjugate gradient collective misuse.
! Demonstrates collective-ordering and buffer-size pitfalls.
module cg_kernel
  implicit none
contains
  subroutine cg_iterate(p, q, r, z, n, rank, nprocs)
    real(8), intent(inout) :: p(n), q(n), r(n), z(n)
    integer, intent(in) :: n, rank, nprocs
    real(8) :: rho_local, rho_global, alpha, beta
    integer :: ierr, i

    rho_local = 0.0d0
    do i = 1, n
      rho_local = rho_local + r(i) * z(i)
    end do

    ! Bug: collective inside rank-conditional branch → deadlock
    if (rank == 0) then
      call MPI_Allreduce(rho_local, rho_global, 1, MPI_DOUBLE_PRECISION, &
                         MPI_SUM, MPI_COMM_WORLD, ierr)
    end if

    ! Bug: count 200 for array of size n (when n < 200, overflow)
    call MPI_Bcast(p, 200, MPI_DOUBLE_PRECISION, 0, MPI_COMM_WORLD, ierr)
  end subroutine
end module
