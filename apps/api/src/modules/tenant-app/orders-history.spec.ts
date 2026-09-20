import { TenantAppService } from './tenant-app.service';

/**
 * Histórico de Vendas & Comandas: o comprovante aberto pelo clique precisa do
 * mesmo detalhe do fechamento (modificadores, mesa, comanda). Este teste trava
 * os `include` do getOrders — se alguém remover, o recibo volta a sair capado.
 */
describe('TenantAppService — getOrders (histórico)', () => {
  it('inclui modificadores, mesa e sessão da comanda', async () => {
    const prisma: any = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TenantAppService(prisma, {} as any, {} as any, {} as any);

    await service.getOrders('loja');

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Salão (companyId) + PDV (tenantId) na mesma lista.
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ tenantId: 't1' }, { companyId: 't1' }]),
        }),
        include: expect.objectContaining({
          items: expect.objectContaining({
            include: expect.objectContaining({ product: true, modifiers: true }),
          }),
          table: expect.anything(),
          tableSession: expect.anything(),
        }),
      }),
    );
  });
});
