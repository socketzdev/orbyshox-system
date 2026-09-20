import { GymService } from './gym.service';

/**
 * Avaliação física: IMC/RCQ automáticos e %G por protocolo validado
 * (Pollock 3/7, Petroski PM7) com conversão de Siri.
 */
describe('GymService — avaliação física', () => {
  let service: GymService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      gymStudent: {
        findFirst: jest.fn(async () => ({ id: 'al1', tenantId: 't1', name: 'Aluno' })),
      },
      gymAssessment: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async (args: any) => ({ id: 'av1', ...args.data })),
        update: jest.fn(async (args: any) => ({ id: 'av1', ...args.data })),
        delete: jest.fn(async () => ({})),
      },
    };
    service = new GymService(prisma);
  });

  const base = {
    studentId: 'al1',
    anamnesis: { age: 30, sex: 'M' },
    heightCm: 180,
    weightKg: 80,
    perimetry: { waist: 85, hip: 100 },
  };

  it('calcula IMC 24.7 e RCQ 0.85 automaticamente', async () => {
    const res: any = await service.createAssessment(undefined, 't1', base);
    expect(res.bmi).toBeCloseTo(24.7, 1);
    expect(res.waistHipRatio).toBeCloseTo(0.85, 2);
  });

  it('Pollock 3 dobras ♂ gera %G plausível (~11%)', async () => {
    const res: any = await service.createAssessment(undefined, 't1', {
      ...base,
      protocol: 'POLLOCK_3',
      skinfolds: { chest: 10, abdomen: 15, thigh: 12 },
    });
    expect(res.bodyDensity).toBeGreaterThan(1.05);
    expect(res.bodyDensity).toBeLessThan(1.1);
    expect(res.bodyFatPct).toBeGreaterThan(5);
    expect(res.bodyFatPct).toBeLessThan(20);
  });

  it('Pollock 3 dobras ♀ usa tríceps+suprailíaca+coxa', async () => {
    const res: any = await service.createAssessment(undefined, 't1', {
      ...base,
      anamnesis: { age: 28, sex: 'F' },
      protocol: 'POLLOCK_3',
      skinfolds: { triceps: 18, suprailiac: 20, thigh: 25 },
    });
    expect(res.bodyFatPct).toBeGreaterThan(15);
    expect(res.bodyFatPct).toBeLessThan(35);
  });

  it('Petroski recusa sexo feminino', async () => {
    await expect(
      service.createAssessment(undefined, 't1', {
        ...base,
        anamnesis: { age: 30, sex: 'F' },
        protocol: 'PETROSKI_4',
        skinfolds: { subscapular: 12, triceps: 10, suprailiac: 14, calf: 8 },
      }),
    ).rejects.toThrow('Petroski');
  });

  it('recusa dobra ausente no protocolo e foto inválida', async () => {
    await expect(
      service.createAssessment(undefined, 't1', { ...base, protocol: 'POLLOCK_3', skinfolds: { chest: 10 } }),
    ).rejects.toThrow('Dobra');
    await expect(
      service.createAssessment(undefined, 't1', { ...base, photos: { front: 'http://x/foto.jpg' } }),
    ).rejects.toThrow('Foto');
  });

  it('recusa medidas absurdas', async () => {
    await expect(service.createAssessment(undefined, 't1', { ...base, heightCm: 320 })).rejects.toThrow('Estatura');
    await expect(service.createAssessment(undefined, 't1', { ...base, weightKg: 5 })).rejects.toThrow('Peso');
  });
});
