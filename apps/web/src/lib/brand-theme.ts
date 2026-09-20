/**
 * Tema de marca aplicado em tempo real.
 *
 * O Copiloto de IA pode trocar a cor primária do painel por comando de voz ou
 * texto. Para isso funcionar sem recarregar a página, a cor precisa virar
 * variável CSS no `document.documentElement` — que sobrepõe tanto o bloco
 * `:root` quanto o `.dark` do `index.css`.
 *
 * Formato das variáveis (shadcn/ui): componentes HSL separados por espaço,
 * **sem** o wrapper `hsl()`. Ex.: `--primary: 240 5.9% 10%`.
 */

export const BRAND_STORAGE_KEY = 'orbyshox-brand-theme';

/** Evento disparado quando o tema de marca muda, para a UI reagir na hora. */
export const BRAND_THEME_EVENT = 'orbyshox:brand-theme-changed';

export interface BrandTheme {
  primaryColor: string;
  colorLabel?: string;
  darkMode?: boolean;
}

/** Converte `#rgb` ou `#rrggbb` em `[h, s, l]` (h 0–360, s/l 0–100). */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const clean = String(hex || '').trim().replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(clean)) return null;

  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = 60 * (((g - b) / delta) % 6);
        break;
      case g:
        h = 60 * ((b - r) / delta + 2);
        break;
      default:
        h = 60 * ((r - g) / delta + 4);
    }
  }

  if (h < 0) h += 360;

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/** Formata no padrão esperado pelas variáveis CSS do projeto. */
export function hexToCssHsl(hex: string): string | null {
  const hsl = hexToHsl(hex);
  return hsl ? `${hsl.h} ${hsl.s}% ${hsl.l}%` : null;
}

/**
 * Cor de texto legível sobre a cor primária.
 * Usa luminância relativa para decidir entre branco e quase-preto.
 */
export function contrastForeground(hex: string): string {
  const hsl = hexToHsl(hex);
  // A partir de ~62% de luminosidade o fundo é claro demais para texto branco.
  return hsl && hsl.l > 62 ? '240 5.9% 10%' : '0 0% 100%';
}

/**
 * Aplica a cor primária (e o ring de foco) no documento.
 *
 * Definir inline em `documentElement` garante que a escolha da marca vença
 * tanto o tema claro quanto o escuro, sem precisar editar o CSS.
 */
export function applyBrandTheme(theme: BrandTheme | null | undefined): boolean {
  if (typeof document === 'undefined') return false;

  const root = document.documentElement;

  if (!theme?.primaryColor) {
    // Sem cor de marca: remove o override e volta ao padrão do CSS.
    root.style.removeProperty('--primary');
    root.style.removeProperty('--primary-foreground');
    root.style.removeProperty('--ring');
    return false;
  }

  const cssHsl = hexToCssHsl(theme.primaryColor);
  if (!cssHsl) return false;

  root.style.setProperty('--primary', cssHsl);
  root.style.setProperty('--ring', cssHsl);
  root.style.setProperty('--primary-foreground', contrastForeground(theme.primaryColor));

  return true;
}

/** Lê o tema salvo localmente, tolerando JSON corrompido. */
export function readStoredBrandTheme(): BrandTheme | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BRAND_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as BrandTheme) : null;
  } catch {
    return null;
  }
}

/** Persiste o tema e notifica a aplicação. */
export function storeBrandTheme(theme: BrandTheme): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // Modo privado / cota cheia: seguir sem persistir é melhor que quebrar a UI.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BRAND_THEME_EVENT, { detail: theme }));
  }
}

/**
 * Aplica um tema vindo do backend (ex.: `clientAction` do Copiloto):
 * grava no documento, persiste e notifica.
 */
export function applyAndStoreBrandTheme(theme: BrandTheme): boolean {
  const applied = applyBrandTheme(theme);
  if (applied) storeBrandTheme(theme);
  return applied;
}

/** Reaplica o tema salvo. Chamado no boot da aplicação. */
export function initBrandTheme(): void {
  applyBrandTheme(readStoredBrandTheme());
}
