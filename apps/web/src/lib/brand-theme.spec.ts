import { describe, it, expect } from 'vitest';
import { contrastForeground, hexToCssHsl, hexToHsl } from './brand-theme';

describe('hexToHsl', () => {
  it('converte preto e branco', () => {
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 });
    expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('converte o vinho do Bali Jack', () => {
    const hsl = hexToHsl('#9b111e');
    expect(hsl).not.toBeNull();
    expect(hsl!.h).toBeGreaterThan(350);
    expect(hsl!.l).toBeLessThan(40);
  });

  it('converte verde esmeralda', () => {
    const hsl = hexToHsl('#059669');
    expect(hsl).not.toBeNull();
    // Verde fica na faixa de 140–170 graus.
    expect(hsl!.h).toBeGreaterThan(130);
    expect(hsl!.h).toBeLessThan(180);
  });

  it('expande hex de 3 dígitos', () => {
    expect(hexToHsl('#fff')).toEqual({ h: 0, s: 0, l: 100 });
    expect(hexToHsl('#000')).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('aceita sem o "#"', () => {
    expect(hexToHsl('059669')).not.toBeNull();
  });

  it('devolve null para entrada inválida', () => {
    expect(hexToHsl('')).toBeNull();
    expect(hexToHsl('#12')).toBeNull();
    expect(hexToHsl('azul')).toBeNull();
    expect(hexToHsl('#gggggg')).toBeNull();
  });
});

describe('hexToCssHsl', () => {
  it('formata no padrão das variáveis CSS do projeto', () => {
    // Formato esperado: "H S% L%" — sem o wrapper hsl().
    expect(hexToCssHsl('#000000')).toBe('0 0% 0%');
    expect(hexToCssHsl('#ffffff')).toBe('0 0% 100%');
  });

  it('devolve null quando o hex é inválido', () => {
    expect(hexToCssHsl('não é cor')).toBeNull();
  });
});

describe('contrastForeground', () => {
  it('usa texto claro sobre cor escura', () => {
    expect(contrastForeground('#9b111e')).toBe('0 0% 100%');
    expect(contrastForeground('#0f52ba')).toBe('0 0% 100%');
  });

  it('usa texto escuro sobre cor clara', () => {
    expect(contrastForeground('#ffffff')).toBe('240 5.9% 10%');
    expect(contrastForeground('#fde047')).toBe('240 5.9% 10%');
  });
});
