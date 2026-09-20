/**
 * Validação da logo do estabelecimento.
 *
 * A logo é guardada como **data URL** em `Company.branding.logoUrl`. O projeto
 * não tem infraestrutura de upload (as imagens de produto são apenas uma URL
 * digitada), então gravar em disco exigiria introduzir multer + servir estático
 * — mais superfície de risco do que o ganho justifica para um arquivo pequeno.
 *
 * O que este módulo garante:
 *  - só entram formatos de imagem reconhecidos (PNG, JPG, SVG);
 *  - existe teto de tamanho, porque o conteúdo vai para o banco e viaja em
 *    toda leitura de settings;
 *  - SVG com `<script>` é recusado. Renderizado em `<img>` o script não
 *    executa, mas bloquear na entrada evita que o arquivo se torne uma bomba
 *    se algum dia for embutido inline no HTML.
 */

/** Formatos aceitos e o respectivo MIME. */
export const ALLOWED_LOGO_MIME = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;
export type LogoMime = (typeof ALLOWED_LOGO_MIME)[number];

/** Teto do arquivo bruto (antes do base64). 512 KB cobre uma logo com folga. */
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** Rótulo amigável por formato, usado nas mensagens de erro. */
const MIME_LABEL: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/svg+xml': 'SVG',
};

export interface LogoValidationOk {
  ok: true;
  mime: LogoMime;
  bytes: number;
  dataUrl: string;
}

export interface LogoValidationError {
  ok: false;
  message: string;
}

export type LogoValidation = LogoValidationOk | LogoValidationError;

/**
 * Extrai e valida um data URL de imagem.
 *
 * @param input Data URL completo (`data:image/png;base64,...`).
 */
export function validateLogoDataUrl(input: unknown): LogoValidation {
  const dataUrl = typeof input === 'string' ? input.trim() : '';

  if (!dataUrl) {
    return { ok: false, message: 'Nenhuma imagem foi enviada.' };
  }

  const match = dataUrl.match(/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return {
      ok: false,
      message: 'Formato inválido. Envie a imagem como PNG, JPG ou SVG.',
    };
  }

  const mime = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, '');

  if (!ALLOWED_LOGO_MIME.includes(mime as LogoMime)) {
    const aceitos = ALLOWED_LOGO_MIME.map((m) => MIME_LABEL[m]).join(', ');
    return {
      ok: false,
      message: `Formato não aceito${MIME_LABEL[mime] ? ` (${MIME_LABEL[mime]})` : ''}. Use ${aceitos}.`,
    };
  }

  // 4/3 é a razão entre base64 e bytes originais.
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes <= 0) {
    return { ok: false, message: 'O arquivo está vazio.' };
  }
  if (bytes > MAX_LOGO_BYTES) {
    return {
      ok: false,
      message: `A imagem tem ${formatBytes(bytes)} e o limite é ${formatBytes(MAX_LOGO_BYTES)}. Reduza o arquivo e tente de novo.`,
    };
  }

  if (mime === 'image/svg+xml') {
    let svg = '';
    try {
      svg = Buffer.from(base64, 'base64').toString('utf8');
    } catch {
      return { ok: false, message: 'Não foi possível ler o arquivo SVG.' };
    }

    if (/<\s*script/i.test(svg) || /\son\w+\s*=/i.test(svg) || /javascript:/i.test(svg)) {
      return {
        ok: false,
        message: 'Este SVG contém script e não pode ser usado como logo por segurança.',
      };
    }
  }

  return { ok: true, mime: mime as LogoMime, bytes, dataUrl };
}

/** Formata bytes para a mensagem de erro. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Lê a logo atual do branding.
 * Devolve `null` quando não há logo — é o que a UI usa para exibir a padrão.
 */
export function readLogoFromBranding(branding: Record<string, any> | null | undefined): string | null {
  const logo = branding?.logoUrl;
  return typeof logo === 'string' && logo.trim() ? logo.trim() : null;
}
