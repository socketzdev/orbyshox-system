import { GymService } from './gym.service';

/**
 * Fichas de treino: itens vinculados à biblioteca, com repetições
 * validadas estritamente entre 0 e 40 (diretriz do sistema).
 */
describe('GymService — biblioteca e fichas', () => {
  let service: GymService;
  let prisma: any;

  const EX1 = { id: 'ex1', tenantId: 't1', name: 'Agachamento Livre', isActive: true };

  beforeEach(() => {
    prisma = {
      gymStudent: {
        findFirst: jest.fn(async () => ({ id: 'al1', tenantId: 't1', name: 'Aluno' })),
      },
      gymExercise: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async (args: any) => {
          const ids: string[] = args?.where?.id?.in || [];
          return ids.map((id) => ({ id }));
        }),
        create: jest.fn(async (args: any) => ({ id: 'ex9', ...args.data })),
        count: jest.fn(async () => 0),
        createMany: jest.fn(async () => ({ count: 30 })),
      },
      gymWorkout: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async (args: any) => ({ id: 'w1', ...args.data })),
        update: jest.fn(async (args: any) => ({ id: 'w1', ...args.data })),
        delete: jest.fn(async () => ({})),
      },
      gymWorkoutItem: {
        deleteMany: jest.fn(async () => ({})),
        createMany: jest.fn(async () => ({})),
        count: jest.fn(async () => 0),
      },
    };
    service = new GymService(prisma);
  });

  const baseDto = (reps: number) => ({
    studentId: 'al1',
    title: 'Treino A — Pernas',
    dayOfWeek: 'SEG',
    items: [{ exerciseId: 'ex1', sets: 4, reps, load: '20kg' }],
  });

  it('aceita repetições nos limites 0 e 40', async () => {
    await expect(service.createWorkout(undefined, 't1', baseDto(0))).resolves.toMatchObject({ id: 'w1' });
    await expect(service.createWorkout(undefined, 't1', baseDto(40))).resolves.toMatchObject({ id: 'w1' });
  });

  it('recusa repetições fora de 0–40', async () => {
    await expect(service.createWorkout(undefined, 't1', baseDto(41))).rejects.toThrow('entre 0 e 40');
    await expect(service.createWorkout(undefined, 't1', baseDto(-1))).rejects.toThrow('entre 0 e 40');
  });

  it('recusa ficha sem itens e sem aluno', async () => {
    await expect(service.createWorkout(undefined, 't1', { studentId: 'al1', title: 'X', items: [] })).rejects.toThrow(
      'ao menos 1 exercício',
    );
    await expect(service.createWorkout(undefined, 't1', { title: 'X', items: [] })).rejects.toThrow('Aluno');
  });

  it('recusa exercício fora da biblioteca', async () => {
    (prisma.gymExercise.findMany as jest.Mock).mockResolvedValueOnce([]);
    await expect(service.createWorkout(undefined, 't1', baseDto(12))).rejects.toThrow('biblioteca');
  });

  it('recusa grupo muscular inválido no cadastro', async () => {
    await expect(service.createExercise(undefined, 't1', { name: 'X', muscleGroup: 'DEDO' })).rejects.toThrow(
      'Grupo muscular',
    );
  });

  it('recusa URL de vídeo inválida', async () => {
    await expect(
      service.createExercise(undefined, 't1', { name: 'Agachamento', mediaUrl: 'nao-e-url' }),
    ).rejects.toThrow('Mídia inválida');
  });

  it('preenche GIFs dos 30 movimentos da base', async () => {
    (prisma.gymExercise.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'a', name: 'Agachamento Livre' },
      { id: 'b', name: 'Exercício Inventado' },
    ]);
    (prisma.gymExercise as any).update = jest.fn(async (args: any) => args);
    const res: any = await service.fillMissingExerciseMedia(undefined, 't1');
    expect(res).toEqual({ filled: 1, total: 2 });
    expect((prisma.gymExercise as any).update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { mediaUrl: '/exercise-gifs/agachamento-livre.gif', mediaType: 'GIF' },
    });
  });

  it('duplica ficha em outro dia copiando os itens', async () => {
    (prisma.gymWorkout.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'w1', tenantId: 't1', studentId: 'al1', title: 'Treino A', dayOfWeek: 'SEG',
      coach: 'Prof', validUntil: null, notes: null,
      items: [
        { exerciseId: 'ex1', position: 0, sets: 4, reps: 12, load: '20kg', restSeconds: 60, notes: null },
      ],
    });
    const res: any = await service.duplicateWorkout(undefined, 't1', 'w1', { dayOfWeek: 'QUI' });
    expect(prisma.gymWorkout.create).toHaveBeenCalled();
    const payload = (prisma.gymWorkout.create as jest.Mock).mock.calls[0][0];
    expect(payload.data.dayOfWeek).toBe('QUI');
    expect(payload.data.studentId).toBe('al1');
    expect(payload.data.items.create).toHaveLength(1);
    expect(payload.data.items.create[0].exerciseId).toBe('ex1');
    expect(res.id).toBe('w1');
  });

  it('duplicar recusa dia inválido e ficha inexistente', async () => {
    (prisma.gymWorkout.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(service.duplicateWorkout(undefined, 't1', 'ghost', {})).rejects.toThrow('não encontrado');
    (prisma.gymWorkout.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'w1', tenantId: 't1', items: [] });
    await expect(service.duplicateWorkout(undefined, 't1', 'w1', { dayOfWeek: 'FREI' })).rejects.toThrow('Dia da semana');
  });

  it('importa o dataset pulando os já existentes', async () => {
    const { EXERCISE_DATASET_SEED } = require('./exercise-dataset.seed');
    expect(EXERCISE_DATASET_SEED.length).toBeGreaterThan(1000);
    (prisma.gymExercise.findMany as jest.Mock).mockResolvedValueOnce([
      { name: EXERCISE_DATASET_SEED[0].name },
    ]);
    (prisma.gymExercise as any).createMany = jest.fn(async (args: any) => ({ count: args.data.length }));
    const res: any = await service.importDataset(undefined, 't1');
    expect(res.total).toBe(EXERCISE_DATASET_SEED.length);
    expect(res.skipped).toBe(1);
    expect(res.imported).toBe(EXERCISE_DATASET_SEED.length - 1);
    const firstBatch = (prisma.gymExercise as any).createMany.mock.calls[0][0];
    expect(firstBatch.data[0].mediaUrl).toMatch(/^\/exercise-gifs\/ds\/.+\.gif$/);
    expect(firstBatch.data[0].mediaType).toBe('GIF');
  });
});
