import { normalizeEmployeeTags, normalizeRole } from './roles';

describe('roles — cargos e acúmulos', () => {
  it('reconhece os cargos operacionais como papéis válidos', () => {
    expect(normalizeRole('WAITER')).toBe('WAITER');
    expect(normalizeRole('KITCHEN')).toBe('KITCHEN');
    expect(normalizeRole('CLEANING')).toBe('CLEANING');
    expect(normalizeRole('CHAPISTA')).toBeNull();
  });

  it('normaliza tags de acúmulo descartando lixo', () => {
    expect(normalizeEmployeeTags(['CLEANING'])).toEqual(['CLEANING']);
    expect(normalizeEmployeeTags(['cleaning', 'CLEANING', 'ROOT'])).toEqual(['CLEANING']);
    expect(normalizeEmployeeTags([])).toEqual([]);
    expect(normalizeEmployeeTags(null)).toEqual([]);
    expect(normalizeEmployeeTags('CLEANING')).toEqual([]);
  });
});
