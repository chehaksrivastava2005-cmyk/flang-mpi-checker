! Synthetic NPB-style kernel stub for demo eval when real NPB tarball unavailable.
! Mimics common patterns in NPB BT/SP solver halo exchange.
module bt_solver
  implicit none
contains
  subroutine exchange_halo(u, n, dir, rank)
    real(8), intent(inout) :: u(:, :, :)
    integer, intent(in) :: n, dir, rank
    integer :: ierr, status(10)
    if (dir == 1) then
      call MPI_Send(u(2, :, :), n, MPI_DOUBLE_PRECISION, rank+1, 0, MPI_COMM_WORLD, ierr)
      call MPI_Recv(u(1, :, :), n, MPI_DOUBLE_PRECISION, rank-1, 0, MPI_COMM_WORLD, status, ierr)
    end if
  end subroutine

  subroutine init_grid(g, ng, master)
    real(8), intent(inout) :: g(:, :)
    integer, intent(in) :: ng, master
    integer :: ierr
    if (master == 0) then
      call MPI_Bcast(g, ng, MPI_DOUBLE_PRECISION, 0, MPI_COMM_WORLD, ierr)
    end if
  end subroutine

  subroutine global_reduce(local, gsum)
    real(8), intent(in)    :: local
    real(8), intent(out)   :: gsum
    integer :: ierr
    call MPI_Allreduce(local, gsum, 1, MPI_REAL, MPI_SUM, MPI_COMM_WORLD, ierr)
  end subroutine
end module
