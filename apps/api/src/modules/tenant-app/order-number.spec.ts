import { createWithOrderNumber, isUniqueViolation } from './order-number';

const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

describe('isUniqueViolation', () => {
  it('reconhece o código P2002 do Prisma', () => {
    expect(isUniqueViolation(p2002())).toBe(true);
  });

  it('não confunde outros erros', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation({ code: 'P2003' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

describe('createWithOrderNumber', () => {
  it('começa em 101 quando não há pedidos anteriores', async () => {
    const create = jest.fn().mockResolvedValue('ok');

    await createWithOrderNumber(async () => null, create);

    expect(create).toHaveBeenCalledWith(101);
  });

  it('incrementa a partir do maior número existente', async () => {
    const create = jest.fn().mockResolvedValue('ok');

    await createWithOrderNumber(async () => 250, create);

    expect(create).toHaveBeenCalledWith(251);
  });

  it('regenera o número e tenta de novo quando há colisão (C3)', async () => {
    let attempt = 0;
    const create = jest.fn().mockImplementation(async (n: number) => {
      attempt += 1;
      if (attempt === 1) throw p2002();
      return n;
    });

    // A primeira leitura devolve 100; após a colisão, 101.
    let reads = 0;
    const readMax = async () => {
      reads += 1;
      return reads === 1 ? 100 : 101;
    };

    const result = await createWithOrderNumber(readMax, create, { context: 'teste' });

    expect(result).toBe(102);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, 101);
    expect(create).toHaveBeenNthCalledWith(2, 102);
  });

  it('propaga erros que não sejam colisão de unicidade', async () => {
    const create = jest.fn().mockRejectedValue(new Error('estoque insuficiente'));

    await expect(createWithOrderNumber(async () => 100, create)).rejects.toThrow(
      'estoque insuficiente',
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('desiste após o limite de tentativas', async () => {
    const create = jest.fn().mockRejectedValue(p2002());

    await expect(createWithOrderNumber(async () => 100, create)).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(create).toHaveBeenCalledTimes(5);
  });
});
