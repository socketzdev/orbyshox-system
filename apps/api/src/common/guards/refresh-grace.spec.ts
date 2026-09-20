import { isBenignRotationReuse, REFRESH_REUSE_GRACE_MS } from './refresh-grace';

describe('refresh-grace', () => {
  it('aceita reuso com sucessor dentro da janela', () => {
    const now = Date.now();
    expect(isBenignRotationReuse(new Date(now - 5_000), 'next-id', now)).toBe(true);
    expect(isBenignRotationReuse(new Date(now).toISOString() as any, 'next-id', now)).toBe(true);
  });

  it('recusa fora da janela, sem sucessor ou sem revogação', () => {
    const now = Date.now();
    expect(isBenignRotationReuse(new Date(now - REFRESH_REUSE_GRACE_MS - 1000), 'next-id', now)).toBe(false);
    expect(isBenignRotationReuse(new Date(now - 1000), null, now)).toBe(false);
    expect(isBenignRotationReuse(null, 'next-id', now)).toBe(false);
    // Data futura (relógio estranho) não ganha tolerância.
    expect(isBenignRotationReuse(new Date(now + 60_000), 'next-id', now)).toBe(false);
  });
});
