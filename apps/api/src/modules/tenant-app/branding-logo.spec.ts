import {
  ALLOWED_LOGO_MIME,
  MAX_LOGO_BYTES,
  formatBytes,
  readLogoFromBranding,
  validateLogoDataUrl,
} from './branding-logo';

/** PNG 1x1 válido, em base64. */
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const pngDataUrl = `data:image/png;base64,${PNG_1PX}`;
const jpgDataUrl = `data:image/jpeg;base64,${PNG_1PX}`;

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const svgComScript = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
const svgComScriptDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgComScript).toString('base64')}`;

const svgComOnload = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>';
const svgComOnloadDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgComOnload).toString('base64')}`;

describe('validateLogoDataUrl — formatos aceitos', () => {
  it('aceita PNG', () => {
    const r = validateLogoDataUrl(pngDataUrl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('image/png');
  });

  it('aceita JPG', () => {
    const r = validateLogoDataUrl(jpgDataUrl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('image/jpeg');
  });

  it('aceita SVG', () => {
    const r = validateLogoDataUrl(svgDataUrl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('image/svg+xml');
  });

  it('reporta o tamanho em bytes', () => {
    const r = validateLogoDataUrl(pngDataUrl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bytes).toBeGreaterThan(0);
  });
});

describe('validateLogoDataUrl — recusas', () => {
  it('recusa entrada vazia ou não-string', () => {
    expect(validateLogoDataUrl('').ok).toBe(false);
    expect(validateLogoDataUrl(null).ok).toBe(false);
    expect(validateLogoDataUrl(undefined).ok).toBe(false);
    expect(validateLogoDataUrl(123).ok).toBe(false);
  });

  it('recusa texto que não é data URL', () => {
    expect(validateLogoDataUrl('apenas um texto').ok).toBe(false);
    expect(validateLogoDataUrl('https://exemplo.com/logo.png').ok).toBe(false);
  });

  it('recusa formato fora da lista (GIF, WEBP, PDF)', () => {
    expect(validateLogoDataUrl('data:image/gif;base64,R0lGODlh').ok).toBe(false);
    expect(validateLogoDataUrl('data:image/webp;base64,UklGRg==').ok).toBe(false);
    expect(validateLogoDataUrl('data:application/pdf;base64,JVBERi0=').ok).toBe(false);
  });

  it('a mensagem de formato lista os aceitos', () => {
    const r = validateLogoDataUrl('data:image/gif;base64,R0lGODlh');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('PNG');
      expect(r.message).toContain('JPG');
      expect(r.message).toContain('SVG');
    }
  });

  it('recusa arquivo acima do limite', () => {
    // 6 MB de base64 -> acima do teto de 5 MB
    const grande = 'A'.repeat(Math.ceil((6 * 1024 * 1024 * 4) / 3));
    const r = validateLogoDataUrl(`data:image/png;base64,${grande}`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('limite');
  });

  it('aceita arquivo logo abaixo do limite', () => {
    const quase = 'A'.repeat(Math.floor(((5 * 1024 * 1024 - 1024) * 4) / 3));
    expect(validateLogoDataUrl(`data:image/png;base64,${quase}`).ok).toBe(true);
  });
});

describe('validateLogoDataUrl — segurança do SVG', () => {
  it('recusa SVG com <script>', () => {
    const r = validateLogoDataUrl(svgComScriptDataUrl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('script');
  });

  it('recusa SVG com handler on*', () => {
    expect(validateLogoDataUrl(svgComOnloadDataUrl).ok).toBe(false);
  });

  it('recusa SVG com javascript:', () => {
    const svgJs = '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a></svg>';
    const url = `data:image/svg+xml;base64,${Buffer.from(svgJs).toString('base64')}`;
    expect(validateLogoDataUrl(url).ok).toBe(false);
  });

  it('aceita SVG legítimo', () => {
    expect(validateLogoDataUrl(svgDataUrl).ok).toBe(true);
  });
});

describe('readLogoFromBranding', () => {
  it('lê a logo quando existe', () => {
    expect(readLogoFromBranding({ logoUrl: pngDataUrl })).toBe(pngDataUrl);
  });

  it('devolve null quando não há logo', () => {
    expect(readLogoFromBranding({})).toBeNull();
    expect(readLogoFromBranding(null)).toBeNull();
    expect(readLogoFromBranding(undefined)).toBeNull();
  });

  it('trata string vazia como ausência', () => {
    expect(readLogoFromBranding({ logoUrl: '   ' })).toBeNull();
  });

  it('ignora valor que não é string', () => {
    expect(readLogoFromBranding({ logoUrl: 123 })).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formata B, KB e MB', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('constantes', () => {
  it('aceita exatamente os três formatos pedidos', () => {
    expect([...ALLOWED_LOGO_MIME].sort()).toEqual(['image/jpeg', 'image/png', 'image/svg+xml']);
  });

  it('o teto é 5 MB', () => {
    expect(MAX_LOGO_BYTES).toBe(5 * 1024 * 1024);
  });
});
